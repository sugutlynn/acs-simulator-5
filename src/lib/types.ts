// ─── ACS Core Types ────────────────────────────────────────────────────────────

/** Raw feature vector for one interface element (all values 0–1) */
export interface Element {
  id: number;
  name: string;
  /** Visual prominence */
  v: number;
  /** Spatial position weight (1 = top/centre, 0 = peripheral) */
  p: number;
  /** Dynamic behaviour (0 = static, 1 = highly animated) */
  d: number;
  /** Notification / alert presence */
  n: number;
  /** Task relevance */
  r: number;
}

/** Element after Stage 2 + 3 computation */
export interface ScoredElement extends Element {
  /** Raw salience S(e) = 0.25v + 0.40d + 0.35n */
  S: number;
  /** Effective salience S′(e) = S(e) × (1 − α × r) */
  Sp: number;
}

export type DemandTier = 'Low' | 'Moderate' | 'High' | 'Critical';

/** Full ACS result from a single evaluation run */
export interface ACSResult {
  scored: ScoredElement[];
  /** Mean of all S′(e) values */
  acsScore: number;
  /** Proportion of high-competition elements weighted by spatial dispersion */
  fi: number;
  tier: DemandTier;
  alpha: number;
  /** Additive baseline B1 (α = 0) */
  b1: number;
  /** Visual complexity baseline B2 */
  b2: number;
}

/** Extracted feature vector from AI pipeline */
export interface ExtractedElement {
  name: string;
  v: number;
  p: number;
  d: number;
  n: number;
  r: number;
}

export type InputMode = 'manual' | 'url' | 'description';

export interface Recommendation {
  type: 'warning' | 'info' | 'ok';
  text: string;
}

// ─── API Route Types ───────────────────────────────────────────────────────────

export interface AnalyzeRequest {
  prompt: string;
  /** Optional client-side API key (used if server env var not set) */
  apiKey?: string;
}

export interface AnalyzeResponse {
  elements: ExtractedElement[];
  error?: string;
}
