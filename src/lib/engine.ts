import type {
  Element,
  ScoredElement,
  ACSResult,
  DemandTier,
  Recommendation,
} from './types';

// ─── Salience Weight Constants ─────────────────────────────────────────────────
/** Visual prominence weight */
export const W1 = 0.25;
/** Dynamic behaviour weight */
export const W2 = 0.40;
/** Notification presence weight */
export const W3 = 0.35;
/** High-competition threshold for Fragmentation Index */
export const COMP_THRESHOLD = 0.60;

// ─── Core Formulas ─────────────────────────────────────────────────────────────

/**
 * Stage 2: Salience scoring
 * S(e) = w₁v + w₂d + w₃n
 * Broadbent [1958], Kahneman [1973]
 */
export function salience(el: Element): number {
  return W1 * el.v + W2 * el.d + W3 * el.n;
}

/**
 * Stage 3: Competition calculation
 * S′(e) = S(e) × (1 − α × r)
 * Desimone & Duncan [1995] — Biased Competition Model
 */
export function effectiveSalience(el: Element, alpha: number): number {
  return salience(el) * (1 - alpha * el.r);
}

/**
 * Spatial dispersion of a set of elements (std dev of p values)
 * Used in Fragmentation Index computation
 */
function spatialDispersion(els: Element[]): number {
  if (els.length < 2) return 0;
  const positions = els.map((e) => e.p);
  const mean = positions.reduce((a, b) => a + b, 0) / positions.length;
  const variance =
    positions.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / positions.length;
  return Math.sqrt(variance);
}

// ─── Baselines ─────────────────────────────────────────────────────────────────

/**
 * B1: Additive baseline (α = 0)
 * Raw sum of salience scores — no goal-bias modulation
 */
export function computeB1(els: Element[]): number {
  if (!els.length) return 0;
  return els.reduce((s, e) => s + salience(e), 0) / els.length;
}

/**
 * B2: Visual Complexity heuristic
 * element count × mean visual prominence, normalised to 0–1
 */
export function computeB2(els: Element[]): number {
  if (!els.length) return 0;
  const meanV = els.reduce((s, e) => s + e.v, 0) / els.length;
  return Math.min((els.length * meanV) / 5, 1);
}

// ─── Demand Tier ───────────────────────────────────────────────────────────────
export function scoreToDemandTier(score: number): DemandTier {
  if (score < 0.35) return 'Low';
  if (score < 0.55) return 'Moderate';
  if (score < 0.72) return 'High';
  return 'Critical';
}

export const TIER_COLORS: Record<DemandTier, string> = {
  Low:      '#00e5a0',
  Moderate: '#ffb340',
  High:     '#ff8c42',
  Critical: '#ff4d6d',
};

export const TIER_CSS: Record<DemandTier, string> = {
  Low:      'tier-low',
  Moderate: 'tier-mod',
  High:     'tier-high',
  Critical: 'tier-crit',
};

// ─── Main ACS Computation ──────────────────────────────────────────────────────

/**
 * Run the full 4-stage ACS pipeline
 * Returns null if element list is empty
 */
export function computeACS(els: Element[], alpha: number): ACSResult | null {
  if (!els.length) return null;

  // Stage 2 + 3: score all elements
  const scored: ScoredElement[] = els.map((el) => ({
    ...el,
    S:  salience(el),
    Sp: effectiveSalience(el, alpha),
  }));

  // Stage 3 continued: ACS score = mean effective salience
  const acsScore = scored.reduce((s, e) => s + e.Sp, 0) / scored.length;

  // Stage 4a: Fragmentation Index
  const highComp = scored.filter((e) => e.Sp > COMP_THRESHOLD);
  const fi =
    highComp.length === 0
      ? 0
      : Math.min(
          (highComp.length / scored.length) * (1 + spatialDispersion(highComp)),
          1
        );

  return {
    scored,
    acsScore,
    fi,
    tier: scoreToDemandTier(acsScore),
    alpha,
    b1: computeB1(els),
    b2: computeB2(els),
  };
}

// ─── Recommendations ───────────────────────────────────────────────────────────

/**
 * Stage 4b: Rule-based design recommendations
 * Grounded in Kahneman [1973], Desimone & Duncan [1995], Baddeley [1992]
 */
export function generateRecommendations(
  result: ACSResult
): Recommendation[] {
  const recs: Recommendation[] = [];

  // Tier-level recommendation
  switch (result.tier) {
    case 'Critical':
      recs.push({
        type: 'warning',
        text: 'Critical attentional load detected. The interface is likely to cause severe task disruption. Immediate redesign is recommended: remove or relocate animated and notification elements not central to the primary task.',
      });
      break;
    case 'High':
      recs.push({
        type: 'warning',
        text: 'High attentional competition detected. Consolidate notification signals and reduce animation in non-task areas to bring the ACS score below the Moderate threshold (0.55).',
      });
      break;
    case 'Moderate':
      recs.push({
        type: 'info',
        text: 'Moderate attentional demand. The interface is manageable but would benefit from reducing dynamic elements in peripheral regions.',
      });
      break;
    case 'Low':
      recs.push({
        type: 'ok',
        text: 'Low attentional competition. The interface supports focused task completion. Goal-relevant elements are well-aligned with the salience distribution.',
      });
      break;
  }

  // High-competition, low-relevance elements (prime distractor candidates)
  const distractors = result.scored.filter((e) => e.Sp > 0.60 && e.r < 0.4);
  if (distractors.length > 0) {
    recs.push({
      type: 'warning',
      text: `High-competition, low-relevance elements: ${distractors
        .map((e) => e.name)
        .join(', ')}. These are prime candidates for removal or salience reduction (lower visual prominence or disable animations).`,
    });
  }

  // Fragmentation Index
  if (result.fi > 0.5) {
    recs.push({
      type: 'warning',
      text: `Fragmentation Index (${result.fi.toFixed(2)}) is elevated. High-competition elements are spatially dispersed, predicting increased working memory load and greater task-resumption latency [Baddeley, 1992]. Clustering task-critical elements in a consistent spatial zone would reduce FI.`,
    });
  }

  // Weak executive control
  if (result.alpha < 0.4) {
    recs.push({
      type: 'info',
      text: `Current α = ${result.alpha.toFixed(2)} models weak executive control. Increase α to simulate a more focused user state and observe how the Fragmentation Index changes.`,
    });
  }

  // Animated off-task elements
  if (result.scored.some((e) => e.d > 0.5 && e.r < 0.4)) {
    recs.push({
      type: 'warning',
      text: 'Animated elements with low task relevance detected. Dynamic stimuli disproportionately capture attention regardless of task goals [Kahneman, 1973]. Consider static alternatives or restrict animation to task-relevant state changes only.',
    });
  }

  // Notification elements with low relevance
  if (result.scored.some((e) => e.n > 0.7 && e.r < 0.5)) {
    recs.push({
      type: 'warning',
      text: 'Notification-style elements with low task relevance detected. Notification signals drive disproportionate attentional capture [Kahneman, 1973]. Batch or mute non-critical alerts.',
    });
  }

  return recs;
}

// ─── Competition bar colour ────────────────────────────────────────────────────
export function competitionColor(sp: number): string {
  if (sp > 0.72) return '#ff4d6d';
  if (sp > 0.55) return '#ff8c42';
  if (sp > 0.35) return '#ffb340';
  return '#00e5a0';
}

// ─── Presets ───────────────────────────────────────────────────────────────────
export const PRESETS: Record<string, Omit<Element, 'id'>[]> = {
  'Email Client (High off-task)': [
    { name: 'Task inbox list',     v: 0.7, p: 0.5, d: 0.0, n: 0.0, r: 0.9 },
    { name: 'Notification badge',  v: 0.9, p: 0.9, d: 0.1, n: 1.0, r: 0.1 },
    { name: 'Promotional banner',  v: 0.8, p: 0.8, d: 0.3, n: 0.0, r: 0.0 },
    { name: 'Compose button',      v: 0.5, p: 0.7, d: 0.0, n: 0.0, r: 0.8 },
    { name: 'Animated ad sidebar', v: 0.7, p: 0.3, d: 0.8, n: 0.0, r: 0.0 },
  ],
  'Task Manager (Low off-task)': [
    { name: 'Task list',    v: 0.8, p: 0.5, d: 0.0, n: 0.0, r: 1.0 },
    { name: 'Progress bar', v: 0.5, p: 0.6, d: 0.2, n: 0.0, r: 0.9 },
    { name: 'Due date alert', v: 0.6, p: 0.8, d: 0.1, n: 0.8, r: 0.9 },
    { name: 'Search bar',   v: 0.4, p: 0.9, d: 0.0, n: 0.0, r: 0.7 },
  ],
  'News Feed (Extreme off-task)': [
    { name: 'Breaking news ticker', v: 0.9, p: 0.9, d: 1.0, n: 0.8, r: 0.0 },
    { name: 'Auto-play video ad',   v: 0.8, p: 0.5, d: 1.0, n: 0.0, r: 0.0 },
    { name: 'Trending sidebar',     v: 0.7, p: 0.3, d: 0.3, n: 0.0, r: 0.0 },
    { name: 'Article content',      v: 0.6, p: 0.5, d: 0.0, n: 0.0, r: 1.0 },
    { name: 'Push notification',    v: 1.0, p: 0.9, d: 0.5, n: 1.0, r: 0.0 },
    { name: 'Related posts feed',   v: 0.5, p: 0.2, d: 0.4, n: 0.0, r: 0.1 },
  ],
  'Professional Dashboard': [
    { name: 'KPI charts',    v: 0.7, p: 0.5, d: 0.1, n: 0.0, r: 0.9 },
    { name: 'Alert panel',   v: 0.6, p: 0.8, d: 0.0, n: 0.7, r: 0.7 },
    { name: 'Activity feed', v: 0.5, p: 0.3, d: 0.3, n: 0.0, r: 0.5 },
    { name: 'Navigation bar',v: 0.4, p: 0.9, d: 0.0, n: 0.0, r: 0.6 },
    { name: 'Chat widget',   v: 0.5, p: 0.1, d: 0.2, n: 0.6, r: 0.3 },
  ],
};
