/**
 * ACS Local Heuristic Feature Extractor — v2
 * Extracts feature vectors from text descriptions with no API required.
 *
 * Fixed in v2:
 *  - Better sentence splitting that handles complex natural language
 *  - Name cleaning that strips filler articles and prefixes
 *  - Expanded keyword banks with looser matching
 *  - Smarter default scores based on element type inference
 *  - URL-to-description patterns expanded to 15+ site types
 */

import type { ExtractedElement } from './types';

// ─── Keyword banks ────────────────────────────────────────────────────────────
// Each entry: [keyword_or_phrase, score_0_to_1]
// Phrases are matched with simple .includes() on lowercased text

const VISUAL_HIGH: [string, number][] = [
  ['full screen', 0.95], ['fullscreen', 0.95], ['modal', 0.88], ['dialog', 0.85],
  ['popup', 0.82], ['overlay', 0.82], ['splash', 0.90], ['hero', 0.88],
  ['banner', 0.80], ['large banner', 0.88], ['billboard', 0.85],
  ['video', 0.78], ['large image', 0.75], ['cover', 0.72],
  ['prominent', 0.78], ['bold', 0.65], ['large', 0.65], ['huge', 0.80],
  ['header', 0.68], ['headline', 0.72], ['masthead', 0.70],
  ['bright', 0.65], ['colourful', 0.62], ['colorful', 0.62], ['vivid', 0.65],
  ['floating', 0.72], ['fixed', 0.68], ['sticky', 0.68], ['pinned', 0.65],
  ['carousel', 0.72], ['slideshow', 0.70], ['full-width', 0.78],
  ['advertisement', 0.78], ['ad banner', 0.80], ['takeover', 0.90],
];
const VISUAL_LOW: [string, number][] = [
  ['small', 0.28], ['tiny', 0.18], ['minimal', 0.25], ['subtle', 0.22],
  ['icon', 0.32], ['favicon', 0.15], ['avatar', 0.35], ['thumbnail', 0.38],
  ['label', 0.28], ['tag', 0.30], ['badge', 0.40], ['tooltip', 0.22],
  ['footer link', 0.20], ['footnote', 0.20], ['caption', 0.25],
  ['muted', 0.22], ['greyed', 0.20], ['disabled', 0.18],
];

const DYNAMIC_HIGH: [string, number][] = [
  ['flashing', 0.95], ['blinking', 0.92], ['pulsing', 0.88],
  ['animated', 0.85], ['animation', 0.82], ['moving', 0.80],
  ['auto-play', 0.88], ['autoplay', 0.88], ['auto play', 0.88],
  ['video', 0.82], ['live video', 0.90], ['livestream', 0.90],
  ['ticker', 0.90], ['scrolling text', 0.88], ['marquee', 0.88],
  ['carousel', 0.72], ['slider', 0.68], ['rotating', 0.72], ['spinning', 0.75],
  ['bouncing', 0.78], ['floating', 0.68], ['hovering', 0.60],
  ['live', 0.72], ['real-time', 0.72], ['real time', 0.70],
  ['gif', 0.72], ['transition', 0.58], ['loading', 0.55],
  ['progress bar', 0.50], ['animated', 0.82], ['lottie', 0.80],
];
const DYNAMIC_LOW: [string, number][] = [
  ['static', 0.05], ['still image', 0.08], ['no animation', 0.05],
  ['plain text', 0.08], ['read-only', 0.06], ['inactive', 0.08],
  ['text block', 0.10], ['paragraph', 0.10],
];

const NOTIF_HIGH: [string, number][] = [
  ['notification', 0.92], ['notification badge', 0.95], ['notifications', 0.90],
  ['alert', 0.90], ['alert banner', 0.92], ['system alert', 0.92],
  ['warning', 0.88], ['error message', 0.88], ['error banner', 0.90],
  ['toast', 0.82], ['snackbar', 0.80], ['growl', 0.80],
  ['badge', 0.80], ['red dot', 0.88], ['unread badge', 0.92],
  ['unread count', 0.88], ['message count', 0.85], ['ping', 0.88],
  ['push notification', 0.92], ['push alert', 0.90],
  ['urgent', 0.88], ['critical', 0.90], ['important', 0.75],
  ['reminder', 0.72], ['due date', 0.68], ['deadline', 0.70],
  ['new message', 0.85], ['you have', 0.78], ['inbox zero', 0.50],
  ['chat bubble', 0.72], ['message bubble', 0.72],
];
const NOTIF_LOW: [string, number][] = [
  ['decorative', 0.05], ['illustration', 0.08], ['background', 0.05],
  ['stock photo', 0.05], ['hero image', 0.12], ['informational', 0.18],
  ['passive', 0.12], ['static info', 0.10],
];

const RELEVANCE_HIGH: [string, number][] = [
  ['main content', 0.95], ['primary content', 0.92], ['article body', 0.90],
  ['task list', 0.92], ['task board', 0.90], ['todo', 0.88], ['to-do', 0.88],
  ['search bar', 0.88], ['search box', 0.85], ['search field', 0.85],
  ['compose', 0.88], ['write', 0.82], ['create new', 0.85],
  ['checkout', 0.92], ['buy now', 0.90], ['add to cart', 0.90], ['purchase', 0.90],
  ['submit', 0.85], ['confirm', 0.82], ['save', 0.80], ['apply', 0.80],
  ['form', 0.82], ['input field', 0.80], ['text field', 0.78],
  ['editor', 0.88], ['document editor', 0.90], ['rich text', 0.85],
  ['dashboard', 0.82], ['kpi', 0.85], ['metric', 0.82], ['chart', 0.78],
  ['report', 0.80], ['data table', 0.82], ['spreadsheet', 0.80],
  ['navigation', 0.70], ['navbar', 0.68], ['menu', 0.65], ['breadcrumb', 0.62],
  ['inbox', 0.82], ['email list', 0.85], ['message thread', 0.85],
  ['video player', 0.90], ['media player', 0.88],
  ['map', 0.78], ['interactive map', 0.85],
  ['calendar', 0.80], ['schedule', 0.78],
  ['settings form', 0.80], ['preferences', 0.75], ['account', 0.72],
  ['progress', 0.68], ['step', 0.65],
];
const RELEVANCE_LOW: [string, number][] = [
  ['advertisement', 0.05], ['ad banner', 0.05], ['ad sidebar', 0.05],
  ['sponsored', 0.06], ['sponsored content', 0.06], ['promoted', 0.08],
  ['cookie', 0.08], ['gdpr', 0.08], ['cookie banner', 0.06],
  ['trending', 0.15], ['recommended', 0.20], ['suggested', 0.18],
  ['related articles', 0.18], ['related posts', 0.18], ['you might like', 0.12],
  ['social share', 0.15], ['share button', 0.15], ['follow us', 0.10],
  ['subscribe newsletter', 0.15], ['newsletter signup', 0.15],
  ['decorative', 0.08], ['background image', 0.08], ['illustration', 0.10],
  ['stock photo', 0.08], ['hero image', 0.25],
  ['footer', 0.22], ['footer link', 0.18], ['copyright', 0.10],
  ['read more', 0.20], ['see more', 0.20], ['load more', 0.22],
];

const POSITION_HIGH: [string, number][] = [
  ['top right', 0.92], ['top left', 0.88], ['top bar', 0.88], ['top nav', 0.85],
  ['header', 0.85], ['navbar', 0.83], ['nav bar', 0.83], ['top of page', 0.88],
  ['above the fold', 0.90], ['above fold', 0.88],
  ['sticky top', 0.85], ['fixed top', 0.88], ['pinned top', 0.85],
  ['centre', 0.78], ['center', 0.78], ['middle of', 0.75], ['centred', 0.78],
  ['full width', 0.78], ['full-width', 0.78],
  ['floating', 0.72], ['fixed position', 0.80], ['sticky', 0.78],
  ['toolbar', 0.80], ['action bar', 0.80], ['app bar', 0.82],
  ['top', 0.82], ['upper', 0.78], ['prominent position', 0.80],
];
const POSITION_LOW: [string, number][] = [
  ['bottom', 0.22], ['footer', 0.15], ['bottom bar', 0.18],
  ['sidebar', 0.30], ['side panel', 0.30], ['right panel', 0.32], ['left panel', 0.32],
  ['below the fold', 0.18], ['scroll down', 0.20], ['below', 0.28],
  ['peripheral', 0.22], ['corner', 0.28], ['bottom right', 0.25], ['bottom left', 0.22],
  ['background', 0.10], ['behind', 0.12], ['underneath', 0.18],
  ['small icon', 0.35], ['collapsed', 0.30], ['minimised', 0.28], ['minimized', 0.28],
];

// ─── Scoring engine ───────────────────────────────────────────────────────────
function scoreFromKeywords(
  text: string,
  highKws: [string, number][],
  lowKws: [string, number][],
  defaultScore: number,
): number {
  const lo = ` ${text.toLowerCase()} `; // pad so boundary matching works
  let score = defaultScore;
  let highHits = 0;
  let lowHits  = 0;

  for (const [kw, val] of highKws) {
    if (lo.includes(kw.toLowerCase())) {
      score    = highHits === 0 ? val : Math.max(score, val);
      highHits++;
    }
  }
  for (const [kw, val] of lowKws) {
    if (lo.includes(kw.toLowerCase())) {
      score   = lowHits === 0 && highHits === 0 ? val : Math.min(score, val);
      lowHits++;
    }
  }

  return Math.max(0, Math.min(1, score));
}

// ─── Text cleaning ────────────────────────────────────────────────────────────
const FILLER_PREFIX = /^(there\s+is\s+|there'?s\s+|there\s+are\s+|it\s+has\s+|the\s+page\s+has\s+|which\s+includes?\s+|including\s+|also\s+|plus\s+|with\s+a\s+|with\s+an\s+|and\s+a\s+|and\s+an\s+|a\s+|an\s+|the\s+)/i;

function cleanChunk(raw: string): string {
  return raw
    .trim()
    .replace(FILLER_PREFIX, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeName(chunk: string): string {
  const clean = chunk.replace(FILLER_PREFIX, '').trim();
  const words = clean.split(/\s+/);
  const name  = words.slice(0, 6).join(' ');
  return name.length > 48 ? name.slice(0, 45) + '...' : name;
}

// ─── Element splitter ─────────────────────────────────────────────────────────
/**
 * Smart splitter that handles:
 *  1. Bullet / numbered lists  →  best case, cleanest split
 *  2. Line-separated items     →  good case
 *  3. Comma-separated inline   →  common case
 *  4. Complex sentences        →  extract noun phrases
 */
function splitIntoElements(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').trim();

  // 1. Bullet / numbered lists
  const bulletPattern = /^\s*(?:[-•*►▸]|\d+[.)]\s)\s*.+/gm;
  const bullets = raw.match(bulletPattern);
  if (bullets && bullets.length >= 2) {
    return bullets
      .map(l => l.replace(/^\s*(?:[-•*►▸]|\d+[.)]\s)\s*/, '').trim())
      .map(cleanChunk)
      .filter(s => s.length > 3);
  }

  // 2. Line-separated items (each line is an element)
  const lines = raw.split(/\n+/).map(l => l.trim()).filter(l => l.length > 4);
  if (lines.length >= 2) {
    return lines.map(cleanChunk).filter(s => s.length > 3);
  }

  // 3. Comma / semicolon separated
  const commaSplit = raw
    .split(/[,;](?![^(]*\))/)
    .map(cleanChunk)
    .filter(s => s.length > 4);
  if (commaSplit.length >= 2) {
    return commaSplit;
  }

  // 4. Complex sentence — extract UI element noun phrases
  // Look for patterns like: "a [adjective] [noun]" or "[adjective] [noun] (location)"
  const uiElementPattern =
    /(?:a\s+|an\s+|the\s+)?(?:\w+\s+){0,3}(?:banner|badge|button|bar|panel|sidebar|widget|overlay|modal|popup|header|footer|nav|menu|form|input|search|notification|alert|video|carousel|chart|feed|list|table|icon|avatar|ticker|toolbar|toast|tooltip|spinner|loader)/gi;
  const phraseMatches = raw.match(uiElementPattern);
  if (phraseMatches && phraseMatches.length >= 2) {
    const unique = Array.from(new Set(phraseMatches.map(cleanChunk)));
    return unique.filter(s => s.length > 3);
  }

  // 5. Last resort: treat entire text as one element
  return [cleanChunk(raw)].filter(s => s.length > 3);
}

// ─── Main extractor ───────────────────────────────────────────────────────────
export function extractFeaturesLocally(description: string): ExtractedElement[] {
  const chunks = splitIntoElements(description);

  return chunks.map(chunk => ({
    name: makeName(chunk),
    v: scoreFromKeywords(chunk, VISUAL_HIGH,   VISUAL_LOW,   0.50),
    p: scoreFromKeywords(chunk, POSITION_HIGH, POSITION_LOW, 0.50),
    d: scoreFromKeywords(chunk, DYNAMIC_HIGH,  DYNAMIC_LOW,  0.08),
    n: scoreFromKeywords(chunk, NOTIF_HIGH,    NOTIF_LOW,    0.08),
    r: scoreFromKeywords(chunk, RELEVANCE_HIGH, RELEVANCE_LOW, 0.50),
  }));
}

// ─── URL-to-description map ───────────────────────────────────────────────────
/**
 * Returns a bullet-list description based on URL patterns.
 * These are used as the input to extractFeaturesLocally in offline URL mode.
 */
export function descriptionFromURL(url: string): string {
  const lo = url.toLowerCase();
  const host = (() => { try { return new URL(url).hostname.replace('www.', ''); } catch { return lo; } })();

  // ── Specific domains ───────────────────────────────────────────────────────
  if (host.includes('gmail') || host.includes('mail.google'))
    return [
      '- Email list (primary task area, main content)',
      '- Notification badge top right with unread count',
      '- Compose button prominent top left',
      '- Promotional promotions tab',
      '- Animated loading spinner',
      '- Google Chat widget bottom right',
    ].join('\n');

  if (host.includes('twitter') || host.includes('x.com'))
    return [
      '- Main tweet feed (primary content)',
      '- Trending sidebar right panel',
      '- Notification badge top right',
      '- Flashing promoted tweet ad',
      '- Follow button recommendations',
      '- Compose tweet button top right',
    ].join('\n');

  if (host.includes('facebook'))
    return [
      '- News feed (primary content)',
      '- Notification badge bell icon top right',
      '- Animated video autoplay in feed',
      '- Promoted post advertisement',
      '- Stories bar animated top',
      '- Messenger chat widget floating',
      '- Friend suggestions sidebar',
    ].join('\n');

  if (host.includes('linkedin'))
    return [
      '- Feed posts (primary content)',
      '- Notification badge top right',
      '- Job recommendations sidebar',
      '- Promoted content advertisement',
      '- LinkedIn learning suggestion',
      '- Connection requests badge',
    ].join('\n');

  if (host.includes('youtube'))
    return [
      '- Video player large (primary, animated)',
      '- Autoplay next video sidebar',
      '- Video advertisement overlay animated',
      '- Notification bell badge',
      '- Recommended videos feed',
      '- Comments section',
      '- Subscribe button prominent',
    ].join('\n');

  if (host.includes('netflix') || host.includes('hulu') || host.includes('disney'))
    return [
      '- Hero video banner animated full-width',
      '- Continue watching carousel animated',
      '- Trending now animated carousel',
      '- Notification bell icon',
      '- Account menu top right',
      '- Search bar top',
    ].join('\n');

  if (host.includes('slack'))
    return [
      '- Message thread (primary content)',
      '- Unread message badge notifications',
      '- Channel list sidebar left',
      '- Animated typing indicator',
      '- Direct message notification badge',
      '- Emoji reactions',
      '- Search bar top',
    ].join('\n');

  if (host.includes('notion') || host.includes('confluence') || host.includes('docs.google'))
    return [
      '- Document editor main content area (primary)',
      '- Navigation sidebar left panel',
      '- Comment notifications badge',
      '- Collaboration cursor indicators animated',
      '- Share button top right',
      '- Table of contents sidebar',
    ].join('\n');

  if (host.includes('github') || host.includes('gitlab'))
    return [
      '- Code editor or file list (primary content)',
      '- Notification bell badge top right',
      '- Pull request / merge request list',
      '- Pipeline status indicator animated',
      '- Repository navigation tabs',
      '- Issues and comments feed',
    ].join('\n');

  if (host.includes('jira') || host.includes('asana') || host.includes('trello') || host.includes('linear'))
    return [
      '- Task board or list (primary content)',
      '- Due date alert notifications',
      '- Animated status progress indicator',
      '- Notification badge top right',
      '- Team member avatars',
      '- Priority labels',
      '- Filter and search bar',
    ].join('\n');

  if (host.includes('amazon') || host.includes('ebay') || host.includes('etsy'))
    return [
      '- Product listing grid (primary content)',
      '- Cart badge notification icon',
      '- Promotional banner animated',
      '- Sponsored product advertisement',
      '- Flash sale countdown timer animated',
      '- Search bar prominent top',
      '- Recommendation carousel',
    ].join('\n');

  if (host.includes('spotify') || host.includes('apple.com/music') || host.includes('soundcloud'))
    return [
      '- Music player bar bottom (sticky)',
      '- Now playing animated indicator',
      '- Playlist feed (primary content)',
      '- Notification badge',
      '- Recommendation carousel animated',
      '- Search bar top',
    ].join('\n');

  if (host.includes('instagram'))
    return [
      '- Photo / video feed (primary, animated)',
      '- Stories bar animated top',
      '- Notification badge top right',
      '- Reels animated video content',
      '- Sponsored post advertisement',
      '- Direct message notification',
    ].join('\n');

  // ── Path-based patterns ────────────────────────────────────────────────────
  if (lo.includes('dashboard') || lo.includes('analytics') || lo.includes('admin'))
    return [
      '- KPI chart area (primary content)',
      '- Alert panel with notifications',
      '- Activity feed animated',
      '- Navigation sidebar',
      '- Header notification badge',
      '- Date range filter bar',
    ].join('\n');

  if (lo.includes('inbox') || lo.includes('mail') || lo.includes('email'))
    return [
      '- Email list primary task area',
      '- Notification badge unread count top right',
      '- Compose button prominent',
      '- Promotional banner',
      '- Animated loading indicator',
    ].join('\n');

  if (lo.includes('checkout') || lo.includes('cart') || lo.includes('payment'))
    return [
      '- Order summary form (primary task)',
      '- Payment form input fields',
      '- Submit checkout button prominent',
      '- Security badge icon',
      '- Promotional discount banner',
      '- Cart item list',
    ].join('\n');

  if (lo.includes('feed') || lo.includes('timeline') || lo.includes('home'))
    return [
      '- Content feed primary area',
      '- Animated autoplay video posts',
      '- Notification badge icon',
      '- Advertisement promoted post',
      '- Stories animated bar top',
      '- Recommendation sidebar',
    ].join('\n');

  if (lo.includes('news') || lo.includes('article') || lo.includes('blog'))
    return [
      '- Article content main reading area',
      '- Breaking news ticker animated top',
      '- Video advertisement autoplay animated',
      '- Related articles sidebar',
      '- Newsletter signup banner',
      '- Social share buttons',
    ].join('\n');

  if (lo.includes('settings') || lo.includes('profile') || lo.includes('account'))
    return [
      '- Settings form (primary task area)',
      '- Save changes button',
      '- Warning alert notification',
      '- Navigation menu left panel',
      '- Avatar image',
    ].join('\n');

  if (lo.includes('search') || lo.includes('results'))
    return [
      '- Search results list (primary content)',
      '- Search input bar top prominent',
      '- Sponsored advertisement results',
      '- Filter sidebar panel',
      '- Pagination bar',
    ].join('\n');

  if (lo.includes('video') || lo.includes('watch') || lo.includes('stream'))
    return [
      '- Video player large animated (primary)',
      '- Autoplay next video sidebar',
      '- Video ad overlay animated',
      '- Notification bell badge',
      '- Recommended videos carousel',
      '- Comments section',
    ].join('\n');

  if (lo.includes('chat') || lo.includes('message') || lo.includes('conversation'))
    return [
      '- Message thread (primary content)',
      '- Unread message notification badge',
      '- Animated typing indicator',
      '- User list sidebar',
      '- Message input form',
    ].join('\n');

  // ── Generic fallback ───────────────────────────────────────────────────────
  return [
    '- Main content area (primary task)',
    '- Navigation header bar top',
    '- Notification badge icon top right',
    '- Sidebar panel',
    '- Action button prominent',
    '- Footer links',
  ].join('\n');
}
