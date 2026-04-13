# ACS — Attention Competition Simulator

A proof-of-concept computational tool that operationalizes cognitive theories of selective attention to estimate attentional fragmentation in digital interfaces.

**Course:** CS 6795 Cognitive Science, Georgia Institute of Technology, Spring 2026  
**Author:** Lynn Sugut · lsugut3@gatech.edu

---

## Theoretical Foundation

The ACS implements a 4-stage pipeline grounded in:

| Stage | Operation | Theory |
|---|---|---|
| 1 | Interface Encoding | CRUM [Thagard, 2022] |
| 2 | Salience Scoring: `S(e) = 0.25v + 0.40d + 0.35n` | Broadbent [1958], Kahneman [1973] |
| 3 | Competition: `S′(e) = S(e) × (1 − α × r)` | Biased Competition [Desimone & Duncan, 1995] |
| 4 | Output: ACS Score · Fragmentation Index · Tier · Recommendations | Working Memory [Baddeley, 1992] |

---

## Quick Start — Run Locally

### Prerequisites
- Node.js 18+
- npm 9+

### Steps

```bash
# 1. Clone the repository
git clone https://github.gatech.edu/lsugut3/cs6795-acs.git
cd cs6795-acs

# 2. Install dependencies
npm install

# 3. Configure environment (optional — for AI features)
cp .env.local.example .env.local
# Edit .env.local and add your Anthropic API key

# 4. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> **Without an API key:** The Manual input mode works fully without any API key. The AI URL and AI Text modes require a key.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Optional | Server-side key for AI feature extraction. If set, users don't need to enter a key in the UI. If not set, users can enter their own key in the interface. |

---

## Deploy to Vercel

### One-click deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.gatech.edu/lsugut3/cs6795-acs)

### Manual deploy via Vercel CLI

```bash
# Install Vercel CLI (once)
npm install -g vercel

# Deploy (follow prompts)
vercel

# Set your API key as a Vercel environment variable
vercel env add ANTHROPIC_API_KEY

# Deploy to production
vercel --prod
```

### Manual deploy via Vercel Dashboard

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import this repository
3. In **Environment Variables**, add `ANTHROPIC_API_KEY` with your key
4. Click **Deploy**

Vercel will automatically detect Next.js and configure the build.

---

## Project Structure

```
acs-simulator/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout (fonts, metadata)
│   │   ├── page.tsx            # Home page (detects server API key)
│   │   ├── globals.css         # All styles (CSS variables, dark lab theme)
│   │   └── api/
│   │       └── analyze/
│   │           └── route.ts    # Anthropic API proxy (server-side)
│   ├── components/
│   │   └── Simulator.tsx       # Main client component (all UI + state)
│   └── lib/
│       ├── engine.ts           # ACS computation engine (pure functions)
│       └── types.ts            # TypeScript type definitions
├── .env.local.example          # Environment variable template
├── next.config.mjs
├── tsconfig.json
└── package.json
```

---

## Input Modes

| Mode | Description | Requires API Key |
|---|---|---|
| **Manual Vectors** | Enter feature vectors directly for each element | No |
| **AI URL Analysis** | Enter a URL; Claude extracts feature vectors | Yes |
| **AI Text Description** | Describe the interface; Claude extracts feature vectors | Yes |

### Feature Vector Dimensions

Each interface element is encoded as `e = [v, p, d, n, r]` (all values 0–1):

| Dimension | Name | Description |
|---|---|---|
| `v` | Visual prominence | How visually dominant is this element |
| `p` | Spatial position | 1 = top/centre, 0 = peripheral/bottom |
| `d` | Dynamic behaviour | 0 = static, 1 = highly animated |
| `n` | Notification presence | Does it carry alert-type signals |
| `r` | Task relevance | How central to the user's primary task |

---

## Baselines

- **B1 (Additive, α=0):** Raw mean salience — no goal-bias modulation. Isolates the contribution of executive control.
- **B2 (Visual Complexity):** Element count × mean visual prominence — standard HCI heuristic.
- **B3 (Expert Ratings):** Manual scoring using Nielsen's usability heuristics (reported in paper; not computed in-app).

---

## References

1. D. A. Norman, *The Design of Everyday Things*. Basic Books, 2013.
2. D. E. Broadbent, *Perception and Communication*. Pergamon Press, 1958.
3. D. Kahneman, *Attention and Effort*. Prentice-Hall, 1973.
4. R. Desimone and J. Duncan, "Neural mechanisms of selective visual attention," *Annu. Rev. Neurosci.*, vol. 18, pp. 193–222, 1995.
5. P. Thagard, *Mind: Introduction to Cognitive Science*, 3rd ed. MIT Press, 2022.
6. A. Baddeley, "Working memory," *Science*, vol. 255, no. 5044, pp. 556–559, 1992.
7. J. Nielsen, *Usability Engineering*. Morgan Kaufmann, 1994.
