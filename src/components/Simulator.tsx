'use client';

import { useState, useCallback, useRef, useEffect, useId } from 'react';
import type { Element, ACSResult, InputMode } from '@/lib/types';
import {
  computeACS, generateRecommendations, PRESETS,
  TIER_COLORS, TIER_CSS, competitionColor, W1, W2, W3,
} from '@/lib/engine';
import { extractFeaturesLocally, descriptionFromURL } from '@/lib/localExtractor';
import { loadImageFromFile, analyzeImageOffline, generateThumbnail } from '@/lib/imageAnalyzer';

// ── Types ─────────────────────────────────────────────────────────────────────
type Theme = 'light' | 'dark';
type ExtMode = InputMode | 'screenshot';
interface A11yPrefs { highContrast: boolean; reducedMotion: boolean; largeText: boolean; }

// ── Theme hook ────────────────────────────────────────────────────────────────
function useTheme() {
  const [theme, setThemeState] = useState<Theme>('light');
  const [prefs, setPrefsState] = useState<A11yPrefs>({ highContrast: false, reducedMotion: false, largeText: false });

  useEffect(() => {
    try {
      setThemeState((localStorage.getItem('acs-theme') || 'light') as Theme);
      setPrefsState({
        highContrast: localStorage.getItem('acs-hc') === 'true',
        reducedMotion: localStorage.getItem('acs-rm') === 'true',
        largeText:     localStorage.getItem('acs-lg') === 'true',
      });
    } catch { /* SSR */ }
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem('acs-theme', t); document.documentElement.setAttribute('data-theme', t); } catch { /* */ }
  };

  const togglePref = (key: keyof A11yPrefs) => {
    setPrefsState(prev => {
      const next = { ...prev, [key]: !prev[key] };
      const attrs: Record<keyof A11yPrefs, string> = { highContrast: 'data-high-contrast', reducedMotion: 'data-reduced-motion', largeText: 'data-large-text' };
      const store: Record<keyof A11yPrefs, string> = { highContrast: 'acs-hc', reducedMotion: 'acs-rm', largeText: 'acs-lg' };
      try {
        if (next[key]) document.documentElement.setAttribute(attrs[key], 'true');
        else document.documentElement.removeAttribute(attrs[key]);
        localStorage.setItem(store[key], String(next[key]));
      } catch { /* */ }
      return next;
    });
  };

  return { theme, setTheme, prefs, togglePref };
}

// ── Element Card ──────────────────────────────────────────────────────────────
function ElementCard({ el, onRemove, onChange }: {
  el: Element;
  onRemove: (id: number) => void;
  onChange: (id: number, field: keyof Element, value: number | string) => void;
}) {
  const uid = useId();
  const dims: { key: 'v' | 'd' | 'n' | 'r' | 'p'; label: string; title: string }[] = [
    { key: 'v', label: 'Visual (v)',    title: 'Visual prominence 0-1' },
    { key: 'd', label: 'Dynamic (d)',   title: 'Dynamic behaviour 0=static 1=animated' },
    { key: 'n', label: 'Notif (n)',     title: 'Notification presence 0-1' },
    { key: 'r', label: 'Relevance (r)', title: 'Task relevance 0-1' },
    { key: 'p', label: 'Position (p)',  title: 'Spatial position 1=centre 0=peripheral' },
  ];
  return (
    <div className="el-card" role="group" aria-label={`Interface element: ${el.name}`}>
      <div className="el-card-hdr">
        <label htmlFor={`${uid}-name`} className="sr-only">Element name</label>
        <input id={`${uid}-name`} className="el-name-input" value={el.name}
          placeholder="Element name" onChange={e => onChange(el.id, 'name', e.target.value)} />
        <button className="el-remove" onClick={() => onRemove(el.id)} aria-label={`Remove ${el.name}`}>x</button>
      </div>
      <div className="vec-grid" role="group" aria-label="Feature vector dimensions">
        {dims.map(({ key, label, title }) => (
          <div className="vec-cell" key={key}>
            <label htmlFor={`${uid}-${key}`} title={title}>{label}</label>
            <input id={`${uid}-${key}`} type="number" min={0} max={1} step={0.05}
              value={(el[key] as number).toFixed(2)} aria-label={`${label} for ${el.name}`}
              onChange={e => onChange(el.id, key, Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Pipeline ──────────────────────────────────────────────────────────────────
function Pipeline() {
  const stages = [
    { num: 'STAGE 1', name: 'Encode',   theory: 'CRUM [Thagard]',     formula: `e=[v,p,d,n,r]` },
    { num: 'STAGE 2', name: 'Salience', theory: 'Filter [Broadbent]',  formula: `S(e)=${W1}v+${W2}d+${W3}n` },
    { num: 'STAGE 3', name: 'Compete',  theory: 'Biased Comp [D&D]',   formula: "S'(e)=S(e)x(1-axr)" },
    { num: 'STAGE 4', name: 'Output',   theory: 'Work Mem [Baddeley]', formula: 'ACS x FI x Tier' },
  ];
  return (
    <figure aria-label="ACS four-stage processing pipeline" style={{ width: '100%', maxWidth: 640 }}>
      <div className="pipeline">
        {stages.map(s => (
          <div className="pipe-stage" key={s.num}>
            <div className="pipe-num">{s.num}</div>
            <div className="pipe-name">{s.name}</div>
            <div className="pipe-theory">{s.theory}</div>
            <div className="pipe-theory" style={{ marginTop: 5, color: 'var(--cyan)', fontSize: 9 }}>{s.formula}</div>
          </div>
        ))}
      </div>
    </figure>
  );
}

// ── Score Cards ───────────────────────────────────────────────────────────────
function ScoreCards({ result }: { result: ACSResult }) {
  const col     = TIER_COLORS[result.tier];
  const tierCls = TIER_CSS[result.tier];
  return (
    <section aria-label="ACS evaluation scores">
      <div className="score-grid">
        <div className="score-card" style={{ '--card-accent': col } as React.CSSProperties}>
          <div className="score-label">Attention Competition Score</div>
          <div className="score-value" style={{ color: col }} role="status">{result.acsScore.toFixed(3)}</div>
          <div className="score-sub">Mean effective salience across interface</div>
        </div>
        <div className="score-card" style={{ '--card-accent': 'var(--amber)' } as React.CSSProperties}>
          <div className="score-label">Fragmentation Index</div>
          <div className="score-value" style={{ color: 'var(--amber)' }} role="status">{result.fi.toFixed(3)}</div>
          <div className="score-sub">Spatial dispersion of high-competition elements</div>
        </div>
        <div className="score-card" style={{ '--card-accent': col } as React.CSSProperties}>
          <div className="score-label">Demand Tier</div>
          <div style={{ paddingTop: 8 }}>
            <span className={`tier-badge ${tierCls}`} role="status">{result.tier}</span>
          </div>
          <div className="score-sub" style={{ marginTop: 8 }}>alpha = {result.alpha.toFixed(2)}</div>
        </div>
        <div className="score-card" style={{ '--card-accent': 'var(--text-dim)' } as React.CSSProperties}>
          <div className="score-label">Elements Analyzed</div>
          <div className="score-value" style={{ color: 'var(--text)' }}>{result.scored.length}</div>
          <div className="score-sub">{result.scored.filter(e => e.Sp > 0.6).length} above competition threshold</div>
        </div>
      </div>
    </section>
  );
}

// ── Element Table ─────────────────────────────────────────────────────────────
function ElementTable({ result }: { result: ACSResult }) {
  const sorted = [...result.scored].sort((a, b) => b.Sp - a.Sp);
  return (
    <div className="table-wrap" role="region" aria-label="Element competition breakdown" tabIndex={0}>
      <table className="el-table">
        <caption className="sr-only">Interface elements sorted by effective salience, highest first.</caption>
        <thead>
          <tr>
            <th scope="col">Element</th>
            <th scope="col" title="Visual prominence">v</th>
            <th scope="col" title="Dynamic">d</th>
            <th scope="col" title="Notification">n</th>
            <th scope="col" title="Task relevance">r</th>
            <th scope="col">S(e)</th>
            <th scope="col">S(e) eff</th>
            <th scope="col">Competition</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(el => {
            const pct = Math.round(el.Sp * 100);
            const barColor = competitionColor(el.Sp);
            const suppressed = el.r > 0.6 && el.Sp < 0.5;
            return (
              <tr key={el.id}>
                <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{el.name}</td>
                <td>{el.v.toFixed(2)}</td>
                <td>{el.d.toFixed(2)}</td>
                <td>{el.n.toFixed(2)}</td>
                <td>{el.r.toFixed(2)}</td>
                <td>{el.S.toFixed(3)}</td>
                <td style={{ fontWeight: 700 }}>{el.Sp.toFixed(3)}</td>
                <td>
                  <div className="comp-bar-wrap">
                    <div className="comp-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Competition: ${pct}%`}>
                      <div className="comp-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                    <span className="comp-val" style={{ color: barColor }} aria-hidden="true">{pct}%</span>
                  </div>
                </td>
                <td>
                  {suppressed ? <span style={{ color: 'var(--green)', fontWeight: 700 }}>Suppressed</span>
                    : el.Sp > 0.6 ? <span style={{ color: 'var(--red)', fontWeight: 700 }}>High load</span>
                    : <span style={{ color: 'var(--text-dim)' }}>Normal</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Baselines ─────────────────────────────────────────────────────────────────
function Baselines({ result, showB1, showB2 }: { result: ACSResult; showB1: boolean; showB2: boolean }) {
  if (!showB1 && !showB2) return null;
  const fd = (a: number, b: number) => {
    const d = b === 0 ? 0 : ((a - b) / b) * 100;
    return { s: d > 0 ? `+${d.toFixed(1)}%` : `${d.toFixed(1)}%`, col: Math.abs(d) > 10 ? 'var(--amber)' : 'var(--text-dim)' };
  };
  return (
    <section aria-label="Baseline comparison">
      <div className="section-hdr">Baseline Comparison</div>
      <div className="score-grid">
        {showB1 && (() => { const { s, col } = fd(result.acsScore, result.b1); return (
          <div className="score-card" style={{ '--card-accent': 'var(--text-dim)' } as React.CSSProperties}>
            <div className="score-label">B1 Additive (alpha=0)</div>
            <div className="score-value" style={{ color: 'var(--text-dim)' }}>{result.b1.toFixed(3)}</div>
            <div className="score-sub">ACS vs B1: <span style={{ color: col, fontWeight: 700 }}>{s}</span></div>
          </div>); })()}
        {showB2 && (() => { const { s, col } = fd(result.acsScore, result.b2); return (
          <div className="score-card" style={{ '--card-accent': 'var(--text-dim)' } as React.CSSProperties}>
            <div className="score-label">B2 Visual Complexity</div>
            <div className="score-value" style={{ color: 'var(--text-dim)' }}>{result.b2.toFixed(3)}</div>
            <div className="score-sub">ACS vs B2: <span style={{ color: col, fontWeight: 700 }}>{s}</span></div>
          </div>); })()}
      </div>
    </section>
  );
}

// ── Recommendations ───────────────────────────────────────────────────────────
function Recommendations({ result }: { result: ACSResult }) {
  const recs  = generateRecommendations(result);
  const icons = { warning: 'Warning', info: 'Tip', ok: 'Good' };
  return (
    <div className="rec-list">
      {recs.map((rec, i) => (
        <div key={i} className={`rec-item rec-${rec.type}`} role="note">
          <strong>{icons[rec.type]}</strong>
          {rec.text}
        </div>
      ))}
    </div>
  );
}

// ── A11y Toolbar ──────────────────────────────────────────────────────────────
function A11yToolbar({ theme, setTheme, prefs, togglePref }: {
  theme: Theme; setTheme: (t: Theme) => void;
  prefs: A11yPrefs; togglePref: (k: keyof A11yPrefs) => void;
}) {
  return (
    <div className="a11y-bar" role="toolbar" aria-label="Accessibility options">
      <button
        className="btn-icon"
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        aria-pressed={theme === 'dark'}
        title={theme === 'light' ? 'Dark mode' : 'Light mode'}
        suppressHydrationWarning
      >
        {theme === 'light' ? '🌙' : '☀️'}
      </button>
      <button className={`btn-icon${prefs.highContrast ? ' active' : ''}`}
        onClick={() => togglePref('highContrast')} aria-pressed={prefs.highContrast}
        aria-label="High contrast" title="High contrast">◑</button>
      <button className={`btn-icon${prefs.reducedMotion ? ' active' : ''}`}
        onClick={() => togglePref('reducedMotion')} aria-pressed={prefs.reducedMotion}
        aria-label="Reduce motion" title="Reduce motion">⏸</button>
      <button className={`btn-icon${prefs.largeText ? ' active' : ''}`}
        onClick={() => togglePref('largeText')} aria-pressed={prefs.largeText}
        aria-label="Large text" title="Large text">A+</button>
    </div>
  );
}

// ── Extraction source badge ───────────────────────────────────────────────────
function ExtractionBadge({ source }: { source: 'local' | 'ai' | 'image-ai' | 'image-offline' | null }) {
  if (!source) return null;
  const map = {
    'ai':           { label: 'AI Enhanced',       color: 'var(--cyan)',  bg: 'var(--cyan-glow)',  border: 'var(--cyan-dim)' },
    'local':        { label: 'Offline Heuristic',  color: 'var(--green)', bg: 'var(--green-bg)',  border: 'var(--green)' },
    'image-ai':     { label: 'Screenshot + AI',    color: 'var(--cyan)',  bg: 'var(--cyan-glow)', border: 'var(--cyan-dim)' },
    'image-offline':{ label: 'Screenshot Offline', color: 'var(--green)', bg: 'var(--green-bg)', border: 'var(--green)' },
  };
  const { label, color, bg, border } = map[source];
  return (
    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, padding: '2px 8px',
      borderRadius: 3, letterSpacing: '.06em', background: bg, border: `1px solid ${border}`, color }}>
      {label}
    </span>
  );
}

// ── Screenshot drop zone ──────────────────────────────────────────────────────
function ScreenshotDropzone({ onFile, thumbnail }: {
  onFile: (f: File) => void;
  thumbnail: string | null;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) onFile(file);
  };

  return (
    <div
      className={`drop-zone${dragging ? ' dragging' : ''}${thumbnail ? ' has-image' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      aria-label="Upload screenshot. Click or drag and drop an image file."
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' || e.key === ' ' ? inputRef.current?.click() : null}
    >
      <input ref={inputRef} type="file" accept="image/*" className="sr-only"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      {thumbnail ? (
        <div className="drop-zone-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbnail} alt="Uploaded screenshot preview" className="screenshot-thumb" />
          <span className="drop-zone-hint">Click to change image</span>
        </div>
      ) : (
        <div className="drop-zone-empty">
          <div className="drop-zone-icon" aria-hidden="true">&#9635;</div>
          <div className="drop-zone-text">Drop screenshot here or click to upload</div>
          <div className="drop-zone-sub">PNG, JPG, WebP supported</div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SIMULATOR
// ═══════════════════════════════════════════════════════════════════════════════

let idCounter = 0;
const nextId = () => ++idCounter;

export default function Simulator({ hasServerKey }: { hasServerKey: boolean }) {
  const { theme, setTheme, prefs, togglePref } = useTheme();

  const [elements, setElements] = useState<Element[]>([
    { id: nextId(), name: 'Element 1', v: 0.7, p: 0.5, d: 0.3, n: 0.5, r: 0.5 },
  ]);
  const [alpha, setAlpha]       = useState(0.65);
  const [result, setResult]     = useState<ACSResult | null>(null);
  const [mode, setMode]         = useState<ExtMode>('manual');
  const [showB1, setShowB1]     = useState(true);
  const [showB2, setShowB2]     = useState(true);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [info, setInfo]         = useState('');
  const [apiKey, setApiKey]     = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [descInput, setDescInput] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [thumbnail, setThumbnail]   = useState<string | null>(null);
  const [extractionSource, setExtractionSource] = useState<'local' | 'ai' | 'image-ai' | 'image-offline' | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const infoTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const mainId     = useId();
  const alphaId    = useId();

  const showInfo = (msg: string) => {
    setInfo(msg);
    if (infoTimer.current) clearTimeout(infoTimer.current);
    infoTimer.current = setTimeout(() => setInfo(''), 3500);
  };

  const addElement = useCallback((data?: Partial<Omit<Element, 'id'>>) => {
    setElements(prev => [...prev, {
      id: nextId(), name: data?.name ?? `Element ${prev.length + 1}`,
      v: data?.v ?? 0.5, p: data?.p ?? 0.5, d: data?.d ?? 0.0, n: data?.n ?? 0.0, r: data?.r ?? 0.5,
    }]);
  }, []);

  const removeElement = (id: number) => setElements(prev => prev.filter(e => e.id !== id));
  const changeElement = (id: number, field: keyof Element, value: number | string) =>
    setElements(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));

  const loadPreset = () => {
    const keys = Object.keys(PRESETS);
    const key  = keys[Math.floor(Math.random() * keys.length)];
    setElements(PRESETS[key].map(d => ({ id: nextId(), ...d })));
    setResult(null); setExtractionSource(null);
    showInfo(`Preset loaded: "${key}"`);
    setAnnouncement(`Preset loaded: ${key}. ${PRESETS[key].length} elements added.`);
  };

  // Handle screenshot file selection
  const handleScreenshotFile = async (file: File) => {
    setScreenshot(file);
    try {
      const img = await loadImageFromFile(file);
      setThumbnail(generateThumbnail(img));
    } catch { setThumbnail(null); }
  };

  // Call server API (text or image)
  const callServerAPI = async (payload: { prompt?: string; imageBase64?: string; mediaType?: string }): Promise<Element[]> => {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, apiKey: hasServerKey ? undefined : apiKey }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (!data.elements?.length) throw new Error('No elements extracted.');
    return (data.elements as Omit<Element, 'id'>[]).map(el => ({ id: nextId(), ...el }));
  };

  // Read file as base64
  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

  // ── Main run ──────────────────────────────────────────────────────────────
  const runACS = async () => {
    setError(''); setResult(null); setExtractionSource(null);

    // ── MANUAL ───────────────────────────────────────────────────────────────
    if (mode === 'manual') {
      if (!elements.length) { setError('Add at least one interface element.'); return; }
      const r = computeACS(elements, alpha);
      setResult(r);
      if (r) { setAnnouncement(`Analysis complete. Score: ${r.acsScore.toFixed(3)}. Tier: ${r.tier}.`); setTimeout(() => resultsRef.current?.focus(), 100); }
      return;
    }

    // ── SCREENSHOT ───────────────────────────────────────────────────────────
    if (mode === 'screenshot') {
      if (!screenshot) { setError('Please upload a screenshot first.'); return; }
      setLoading(true);
      const canUseAI = hasServerKey || apiKey.trim().length > 0;

      if (canUseAI) {
        try {
          const b64 = await readFileAsBase64(screenshot);
          const els = await callServerAPI({ imageBase64: b64, mediaType: screenshot.type });
          setElements(els);
          const r = computeACS(els, alpha);
          setResult(r); setExtractionSource('image-ai');
          if (r) { setAnnouncement(`AI screenshot analysis complete. Score: ${r.acsScore.toFixed(3)}. Tier: ${r.tier}.`); setTimeout(() => resultsRef.current?.focus(), 100); }
          setLoading(false); return;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          showInfo(`AI image analysis failed - using offline canvas analysis. (${msg.slice(0, 80)})`);
        }
      }

      // Offline canvas analysis
      try {
        const img = await loadImageFromFile(screenshot);
        const raw = await analyzeImageOffline(img);
        const els = raw.map(el => ({ id: nextId(), ...el }));
        setElements(els);
        const r = computeACS(els, alpha);
        setResult(r); setExtractionSource('image-offline');
        if (!canUseAI) showInfo('Offline canvas analysis complete. Add an API key for AI-powered image analysis.');
        if (r) { setAnnouncement(`Offline image analysis complete. Score: ${r.acsScore.toFixed(3)}. Tier: ${r.tier}.`); setTimeout(() => resultsRef.current?.focus(), 100); }
      } catch (e: unknown) {
        setError('Image analysis failed: ' + (e instanceof Error ? e.message : String(e)));
      } finally { setLoading(false); }
      return;
    }

    // ── AI / URL or AI / TEXT ─────────────────────────────────────────────────
    let prompt = '';
    if (mode === 'url') {
      if (!urlInput.trim()) { setError('Please enter a URL.'); return; }
      prompt = `Analyze the interface at this URL. Identify all significant UI elements and extract feature vectors.\nURL: ${urlInput}\nReason from the URL structure, domain patterns, and typical page layouts for this type of site.`;
    } else {
      if (!descInput.trim()) { setError('Please describe the interface.'); return; }
      prompt = descInput;
    }

    const canUseAI = hasServerKey || apiKey.trim().length > 0;
    setLoading(true);

    // Try AI
    if (canUseAI) {
      try {
        const els = await callServerAPI({ prompt });
        setElements(els);
        const r = computeACS(els, alpha);
        setResult(r); setExtractionSource('ai');
        if (r) { setAnnouncement(`AI analysis complete. Score: ${r.acsScore.toFixed(3)}. Tier: ${r.tier}.`); setTimeout(() => resultsRef.current?.focus(), 100); }
        setLoading(false); return;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        showInfo(`AI unavailable - switching to offline extractor. (${msg.slice(0, 90)})`);
      }
    }

    // Offline fallback
    try {
      const text = mode === 'url' ? descriptionFromURL(urlInput) : prompt;
      const raw  = extractFeaturesLocally(text);
      if (!raw.length) { setError('Could not extract elements. Try adding more detail to your description.'); setLoading(false); return; }
      const els = raw.map(el => ({ id: nextId(), ...el }));
      setElements(els);
      const r = computeACS(els, alpha);
      setResult(r); setExtractionSource('local');
      if (!canUseAI) showInfo('Running in offline mode. No API key needed.');
      if (r) { setAnnouncement(`Offline analysis complete. Score: ${r.acsScore.toFixed(3)}. Tier: ${r.tier}.`); setTimeout(() => resultsRef.current?.focus(), 100); }
    } catch (e: unknown) {
      setError('Extraction failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally { setLoading(false); }
  };

  const canRun = !loading && (
    mode === 'manual'     ? elements.length > 0 :
    mode === 'url'        ? urlInput.trim().length > 0 :
    mode === 'screenshot' ? screenshot !== null :
    descInput.trim().length > 0
  );

  const tabs: { key: ExtMode; label: string }[] = [
    { key: 'manual',      label: 'Manual' },
    { key: 'url',         label: 'URL' },
    { key: 'description', label: 'Text' },
    { key: 'screenshot',  label: 'Screenshot' },
  ];

  return (
    <>
      <a href={`#${mainId}`} className="skip-link">Skip to main content</a>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>

      {/* Header */}
      <header className="header" role="banner">
        <div className="logo">
          <span className="logo-tag" aria-hidden="true">CS 6795</span>
          <span className="logo-title">ACS</span>
          <span className="logo-sub">Attention Competition Simulator</span>
        </div>
        <div className="header-right">
          <span className="header-meta" aria-hidden="true">Cognitive Science </span>
          <A11yToolbar theme={theme} setTheme={setTheme} prefs={prefs} togglePref={togglePref} />
        </div>
      </header>

      <div className="shell">

        {/* ══════════════════════════════ SIDEBAR ══════════════════════════════ */}
        <aside className="sidebar" role="complementary" aria-label="Simulation controls">

          {/* Alpha */}
          <div className="panel">
            <div className="panel-title">Executive Control (alpha)</div>
            <div className="field">
              <label htmlFor={alphaId}>
                Goal suppression strength: <strong style={{ color: 'var(--cyan)' }}>{alpha.toFixed(2)}</strong>
              </label>
              <div className="slider-wrap">
                <div className="slider-row">
                  <input id={alphaId} type="range" min={0} max={1} step={0.05} value={alpha}
                    onChange={e => setAlpha(parseFloat(e.target.value))}
                    aria-valuetext={`${alpha.toFixed(2)} - ${alpha < 0.35 ? 'weak' : alpha < 0.65 ? 'moderate' : 'strong'} executive control`} />
                  <span className="slider-val" aria-hidden="true">{alpha.toFixed(2)}</span>
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6, marginTop: 4 }}>
                At alpha=0 the model equals the additive baseline (B1). Higher = stronger goal suppression.
              </p>
            </div>
          </div>

          {/* Input tabs */}
          <div className="panel">
            <div className="panel-title">Input Mode</div>
            <div className="tabs" role="tablist" aria-label="Input mode selection">
              {tabs.map(t => (
                <button key={t.key} role="tab"
                  className={`tab${mode === t.key ? ' active' : ''}`}
                  onClick={() => { setMode(t.key); setError(''); }}
                  aria-selected={mode === t.key}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── MANUAL ────────────────────────────────────────────── */}
            {mode === 'manual' && (
              <div role="tabpanel" aria-label="Manual element entry">
                <div className="el-list" role="list" aria-live="polite">
                  {elements.map(el => (
                    <div role="listitem" key={el.id}>
                      <ElementCard el={el} onRemove={removeElement} onChange={changeElement} />
                    </div>
                  ))}
                </div>
                <div className="btn-row" style={{ marginTop: 12 }}>
                  <button className="btn btn-ghost" onClick={() => addElement()}>+ Add Element</button>
                  <button className="btn btn-ghost" onClick={loadPreset}>Load Preset</button>
                </div>
              </div>
            )}

            {/* ── URL ───────────────────────────────────────────────── */}
            {mode === 'url' && (
              <div role="tabpanel" aria-label="URL analysis">
                <div className="mode-notice info-box">
                  <strong>Works offline by default.</strong> Patterns are inferred from the URL path.
                  Add an API key below to enable Claude AI analysis.
                </div>
                {!hasServerKey && (
                  <div className="field">
                    <label htmlFor="api-key-url">
                      Anthropic API Key <span style={{ color: 'var(--text-lo)' }}>(optional)</span>
                    </label>
                    <input id="api-key-url" type="password" placeholder="sk-ant-... (blank = offline mode)"
                      value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" />
                  </div>
                )}
                {hasServerKey && <p className="server-notice">Server API key configured - AI analysis ready.</p>}
                <div className="field">
                  <label htmlFor="url-input">Interface URL</label>
                  <input id="url-input" type="url" placeholder="https://example.com/dashboard"
                    value={urlInput} onChange={e => setUrlInput(e.target.value)} />
                  <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                    Works offline for 15+ site types (Gmail, Slack, GitHub, Jira, YouTube, etc.)
                  </p>
                </div>
                {loading && <div className="progress-bar-wrap" role="status"><div className="progress-label">Extracting features...</div><div className="progress-bar"><div className="progress-fill" /></div></div>}
              </div>
            )}

            {/* ── TEXT ──────────────────────────────────────────────── */}
            {mode === 'description' && (
              <div role="tabpanel" aria-label="Text description analysis">
                <div className="mode-notice info-box">
                  <strong>Works offline by default.</strong> List elements with dashes or commas
                  for best results. Add an API key for Claude AI extraction.
                </div>
                {!hasServerKey && (
                  <div className="field">
                    <label htmlFor="api-key-desc">
                      Anthropic API Key <span style={{ color: 'var(--text-lo)' }}>(optional)</span>
                    </label>
                    <input id="api-key-desc" type="password" placeholder="sk-ant-... (blank = offline)"
                      value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" />
                  </div>
                )}
                {hasServerKey && <p className="server-notice">Server API key configured - AI analysis ready.</p>}
                <div className="field">
                  <label htmlFor="desc-input">Interface Description</label>
                  <textarea id="desc-input"
                    placeholder="Describe elements, e.g.:&#10;- Flashing notification badge (top right)&#10;- Animated ad banner&#10;- Main task list&#10;- Chat widget&#10;- Search bar"
                    value={descInput} onChange={e => setDescInput(e.target.value)} />
                  <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                    Tip: one element per line with a dash works best for the offline extractor.
                  </p>
                </div>
                {loading && <div className="progress-bar-wrap" role="status"><div className="progress-label">Extracting features...</div><div className="progress-bar"><div className="progress-fill" /></div></div>}
              </div>
            )}

            {/* ── SCREENSHOT ────────────────────────────────────────── */}
            {mode === 'screenshot' && (
              <div role="tabpanel" aria-label="Screenshot analysis">
                <div className="mode-notice info-box">
                  <strong>Upload any webpage screenshot.</strong> Offline mode uses canvas pixel
                  analysis. Add an API key for Claude AI vision analysis (much more accurate).
                </div>
                {!hasServerKey && (
                  <div className="field">
                    <label htmlFor="api-key-img">
                      Anthropic API Key <span style={{ color: 'var(--text-lo)' }}>(optional — enables AI vision)</span>
                    </label>
                    <input id="api-key-img" type="password" placeholder="sk-ant-... (blank = canvas analysis)"
                      value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" />
                  </div>
                )}
                {hasServerKey && <p className="server-notice">Server API key configured - AI vision analysis ready.</p>}
                <ScreenshotDropzone onFile={handleScreenshotFile} thumbnail={thumbnail} />
                <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8, lineHeight: 1.6 }}>
                  <strong>Without API key:</strong> Canvas pixel analysis detects visual weight, position, and color.
                  Dynamic (d), notification (n), and relevance (r) scores are estimated from visual cues only.
                  <strong> With API key:</strong> Claude analyses the full screenshot semantically.
                </p>
                {loading && <div className="progress-bar-wrap" role="status"><div className="progress-label">Analyzing screenshot...</div><div className="progress-bar"><div className="progress-fill" /></div></div>}
              </div>
            )}
          </div>

          {/* Run button */}
          <div className="panel">
            <div className="btn-row">
              <button className="btn btn-primary" onClick={runACS}
                disabled={!canRun} aria-disabled={!canRun} style={{ flex: 1 }}
                aria-label={loading ? 'Analysis in progress' : 'Run ACS analysis'}>
                {loading ? <><span className="spinner" aria-hidden="true" /> Analyzing...</> : 'Run ACS Analysis'}
              </button>
            </div>
            {error && <div className="run-error" role="alert">{error}</div>}
            {info  && <div className="run-info"  role="status">{info}</div>}
          </div>

          {/* Baselines */}
          <div className="panel">
            <div className="panel-title">Baselines</div>
            <fieldset style={{ border: 'none', padding: 0 }}>
              <legend className="sr-only">Select baselines to display</legend>
              <label className="check-label">
                <input type="checkbox" checked={showB1} onChange={e => setShowB1(e.target.checked)} />
                B1 - Additive (alpha=0)
              </label>
              <label className="check-label">
                <input type="checkbox" checked={showB2} onChange={e => setShowB2(e.target.checked)} />
                B2 - Visual Complexity
              </label>
            </fieldset>
          </div>

        </aside>

        {/* ══════════════════════════════ MAIN ════════════════════════════════ */}
        <main id={mainId} className="main" role="main" aria-label="ACS results"
          tabIndex={-1} ref={resultsRef}>

          {!result ? (
            <div className="empty">
              <div className="empty-icon" aria-hidden="true">O</div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                Attention Competition Simulator
              </h1>
              <p>
                Enter elements manually, paste a URL, describe an interface, or upload a
                screenshot. All modes work offline - API key optional for enhanced AI analysis.
              </p>
              <Pipeline />
              <div className="formula-display" aria-label="Core ACS formulas">
                S(e) = 0.25v + 0.40d + 0.35n &nbsp;&middot;&nbsp; S eff = S(e) x (1 - alpha x r)
              </div>
            </div>
          ) : (
            <>
              {extractionSource && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -8 }}>
                  <ExtractionBadge source={extractionSource} />
                </div>
              )}
              <ScoreCards result={result} />
              <section>
                <div className="section-hdr">Element Competition Breakdown</div>
                <ElementTable result={result} />
              </section>
              <Baselines result={result} showB1={showB1} showB2={showB2} />
              <section>
                <div className="section-hdr">Design Recommendations</div>
                <Recommendations result={result} />
              </section>
              <footer className="app-footer" role="contentinfo">
                ACS v1.0 &middot; Biased Competition Model [Desimone &amp; Duncan, 1995]
                &middot; CRUM [Thagard, 2022] &middot; CS 6795 Georgia Tech &middot; WCAG 2.1 AA
              </footer>
            </>
          )}
        </main>
      </div>
    </>
  );
}
