/**
 * ACS Image Analyzer — Offline canvas-based screenshot analysis
 * Runs entirely in the browser with no API required.
 *
 * Algorithm:
 *  1. Draw screenshot onto a canvas
 *  2. Divide canvas into a grid of regions
 *  3. Per region: compute brightness, saturation, edge density
 *  4. Identify regions with high visual weight → candidate elements
 *  5. Score each candidate on all 5 dimensions using pixel data + position
 *
 * Limitations vs AI:
 *  - Cannot read text labels or understand semantic meaning
 *  - Cannot detect animated elements from a static screenshot
 *  - Position and visual scores are accurate; d, n, r are estimated
 */

import type { ExtractedElement } from './types';

interface Region {
  row: number;
  col: number;
  x: number;
  y: number;
  w: number;
  h: number;
  brightness: number;   // 0–1 mean luminance
  saturation: number;   // 0–1 mean saturation
  contrast: number;     // 0–1 local contrast (std dev of luminance)
  redness: number;      // 0–1 — red channel dominance (alert heuristic)
  hasEdges: boolean;    // true if high edge density (UI element boundary)
}

// ── Image loading ─────────────────────────────────────────────────────────────
export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

export function loadImageFromBase64(b64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image from base64'));
    img.src = b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
  });
}

// ── Canvas helpers ────────────────────────────────────────────────────────────
function drawToCanvas(img: HTMLImageElement, maxSize = 400): CanvasRenderingContext2D {
  const scale  = Math.min(1, maxSize / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width  = Math.round(img.width  * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return ctx;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

// ── Region analysis ───────────────────────────────────────────────────────────
function analyzeRegion(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  row: number, col: number,
): Region {
  const data = ctx.getImageData(x, y, w, h).data;
  const n    = w * h;

  let sumL = 0, sumS = 0, sumR = 0;
  const lums: number[] = [];

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const [, s, l] = rgbToHsl(r, g, b);
    sumL += l;
    sumS += s;
    sumR += r / 255;
    lums.push(l);
  }

  const meanL = sumL / n;
  const meanS = sumS / n;
  const meanR = sumR / n;

  // Contrast = std dev of luminance
  const variance = lums.reduce((a, l) => a + (l - meanL) ** 2, 0) / n;
  const contrast = Math.sqrt(variance);

  // Edge detection heuristic: high contrast = likely element boundary
  const hasEdges = contrast > 0.08;

  return {
    row, col, x, y, w, h,
    brightness: meanL,
    saturation: meanS,
    contrast,
    redness: meanR,
    hasEdges,
  };
}

// ── Element candidate extraction ──────────────────────────────────────────────
function gridToElements(regions: Region[], gridCols: number, gridRows: number): ExtractedElement[] {
  const totalRows = gridRows;

  // Score each region for visual prominence
  const visualScores = regions.map(r => {
    let v = 0;
    if (r.saturation > 0.3)  v += 0.3;
    if (r.contrast > 0.12)   v += 0.25;
    if (r.saturation > 0.5)  v += 0.2;
    if (r.brightness < 0.15 || r.brightness > 0.90) v += 0.15; // very dark or very light = UI element
    if (r.hasEdges)           v += 0.1;
    return Math.min(1, v);
  });

  // Pick the top regions as "elements" — deduplicate adjacent ones
  const threshold = 0.35;
  const candidates: Region[] = [];
  const used = new Set<number>();

  // Sort by visual score descending
  const sorted = [...regions]
    .map((r, i) => ({ r, score: visualScores[i], i }))
    .sort((a, b) => b.score - a.score);

  for (const { r, score, i } of sorted) {
    if (score < threshold) break;
    // Skip if adjacent region already taken
    const neighbours = [
      i - 1, i + 1, i - gridCols, i + gridCols,
    ];
    if (neighbours.some(n => used.has(n))) continue;
    candidates.push(r);
    used.add(i);
    if (candidates.length >= 10) break;
  }

  // Always include some top-row regions (nav/header) + some bottom-row (footer)
  const topRow    = regions.filter(r => r.row === 0 && !candidates.includes(r));
  const bottomRow = regions.filter(r => r.row === totalRows - 1 && !candidates.includes(r));
  if (topRow.length > 0 && candidates.length < 10) candidates.push(topRow[0]);
  if (bottomRow.length > 0 && candidates.length < 10) candidates.push(bottomRow[0]);

  if (candidates.length === 0) {
    // No prominent regions — return a generic fallback
    return [
      { name: 'Page content', v: 0.6, p: 0.5, d: 0.1, n: 0.1, r: 0.7 },
      { name: 'Header area',  v: 0.7, p: 0.9, d: 0.1, n: 0.2, r: 0.6 },
      { name: 'Sidebar',      v: 0.4, p: 0.3, d: 0.1, n: 0.1, r: 0.4 },
    ];
  }

  return candidates.map((r, idx) => {
    // Visual prominence from saturation + contrast
    const v = Math.min(1, r.saturation * 1.4 + r.contrast * 0.8);

    // Spatial position: top regions = 1, bottom = 0, left/right = less
    const yPos  = 1 - r.row  / (totalRows - 1 || 1);
    const xPos  = 1 - Math.abs(r.col / (gridCols - 1 || 1) - 0.5) * 2;
    const p     = Math.min(1, yPos * 0.65 + xPos * 0.35);

    // Redness + high contrast in top-right → notification heuristic
    const isTopRight = r.row < 2 && r.col >= gridCols * 0.6;
    const n = isTopRight && r.redness > 0.55
      ? 0.80
      : isTopRight && r.saturation > 0.4
      ? 0.55
      : r.redness > 0.6 && r.saturation > 0.5
      ? 0.72
      : 0.08;

    // Dynamic: can't detect from static image — mark bright/saturated top elements as potentially dynamic
    const d = r.saturation > 0.5 && r.row < 2 ? 0.35 : 0.08;

    // Task relevance: centre + high contrast = more likely task-critical
    const isCentre = r.col >= Math.floor(gridCols * 0.25) && r.col <= Math.ceil(gridCols * 0.75);
    const isTop    = r.row <= 1;
    const isBottom = r.row >= totalRows - 2;
    const r_score  = isBottom ? 0.20 : isCentre ? 0.72 : isTop ? 0.65 : 0.45;

    const regionNames = [
      'High-salience region', 'Prominent UI area', 'Visual hotspot',
      'Interface element', 'Active region', 'Interactive zone',
      'Content area', 'Navigation zone', 'Alert region', 'Header region',
    ];
    const posLabel = isTop ? 'top' : isBottom ? 'bottom' : isCentre ? 'centre' : 'side';
    const name = `${regionNames[idx % regionNames.length]} (${posLabel})`;

    return {
      name,
      v: Math.round(v * 100) / 100,
      p: Math.round(p * 100) / 100,
      d: Math.round(d * 100) / 100,
      n: Math.round(n * 100) / 100,
      r: Math.round(r_score * 100) / 100,
    };
  });
}

// ── Main analysis function ────────────────────────────────────────────────────
export async function analyzeImageOffline(img: HTMLImageElement): Promise<ExtractedElement[]> {
  const ctx     = drawToCanvas(img, 320);
  const W       = ctx.canvas.width;
  const H       = ctx.canvas.height;
  const COLS    = 6;
  const ROWS    = Math.round(COLS * (H / W));
  const cellW   = Math.floor(W / COLS);
  const cellH   = Math.floor(H / ROWS);

  const regions: Region[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = col * cellW;
      const y = row * cellH;
      const w = col < COLS - 1 ? cellW : W - x;
      const h = row < ROWS - 1 ? cellH : H - y;
      regions.push(analyzeRegion(ctx, x, y, w, h, row, col));
    }
  }

  return gridToElements(regions, COLS, ROWS);
}

// ── Thumbnail generator ───────────────────────────────────────────────────────
export function generateThumbnail(img: HTMLImageElement, maxW = 240, maxH = 160): string {
  const scale  = Math.min(maxW / img.width, maxH / img.height, 1);
  const canvas = document.createElement('canvas');
  canvas.width  = Math.round(img.width  * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.75);
}
