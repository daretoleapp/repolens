# RepoLens

> Stop reviewing PRs blind. See risk, hotspots, and reviewer fit before you click open.

A codebase intelligence dashboard powered by **Xiaomi MiMo**. Connect any public GitHub repo and get six surfaces of insight — risk-scored PRs, churn-driven hotspots, architecture critique on uploaded diagrams, contributor expertise mapping, and a real-time activity feed.

[![Built with MiMo](https://img.shields.io/badge/Reasoning-Xiaomi%20MiMo%20Pro-5eead4)](https://openrouter.ai/xiaomi)
[![Multimodal MiMo VL](https://img.shields.io/badge/Vision-MiMo%20VL-818cf8)](https://openrouter.ai/xiaomi)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)

## What it does

RepoLens reads your GitHub repository and uses MiMo to answer the questions every reviewer asks but rarely has time to investigate:

- **Which open PRs are risky?** — MiMo Pro scores each PR 0-100 with reasoning, suggests a reviewer, and writes a 2-line summary
- **Where do bugs hide?** — File-level churn × frequency × criticality, surfaced as a treemap, with MiMo's specific refactor recommendations
- **Is this architecture sound?** — Upload a diagram, MiMo VL critiques components, coupling, single points of failure, and decoupling moves
- **Who knows what?** — Contributor expertise clustering, burnout signals, and pairing affinity from PR co-authorship patterns
- **What changed today?** — Real-time activity feed, repo health gauge, and the top 5 PRs you should look at first

## MiMo integration

Every model call has graceful fallback to a deterministic corpus-mode heuristic. The `x-repolens-source` response header (`mimo` or `corpus`) makes the active model visible at every layer.

| Surface | Model | Use |
|---|---|---|
| PR Intelligence | `xiaomi/mimo-v2.5-pro` | Risk score + factors + summary + reviewer suggestion (JSON) |
| Hotspots | `xiaomi/mimo-v2.5-pro` | Per-file refactor recommendations + thematic patterns (JSON) |
| Contributors | `xiaomi/mimo-v2.5-pro` | Expertise clustering + burnout signal (JSON) |
| Architecture | `xiaomi/mimo-v2.5` (VL) | Multimodal diagram analysis — components, coupling, SPOFs |
| Overview | `xiaomi/mimo-v2.5-flash` | Cheap activity summarization |

## Pages

| Route | Purpose |
|---|---|
| `/` | Overview — KPIs, health gauge, top risky PRs, activity feed |
| `/prs` | PR Intelligence — filterable table + MiMo risk drawer |
| `/hotspots` | File heatmap, top 20 risky files, MiMo recommendations |
| `/architecture` | Drag-drop diagram, MiMo VL critique side-by-side |
| `/contributors` | Expertise map, burnout signals, pairing affinity matrix |
| `/settings` | API keys, demo repo presets, about |

## Quick start

```bash
git clone https://github.com/daretoleapp/repolens
cd repolens
npm install
cp .env.example .env.local   # fill in OPENROUTER_API_KEY
npm run dev
```

Open `http://localhost:3000`. The default demo repo is `vercel/next.js`. Switch via the selector in the header or open Settings.

## Configuration

| Env var | Purpose | Required |
|---|---|---|
| `OPENROUTER_API_KEY` | MiMo via OpenRouter | Recommended (without it, runs in corpus mode) |
| `GITHUB_TOKEN` | Boosts rate limit | Optional (60 req/h public, 5000 with token) |
| `MIMO_MAX_TOKENS_PRO` | Cap for MiMo Pro reasoning | Default 400 (free-tier friendly) |
| `MIMO_MAX_TOKENS_VL` | Cap for MiMo VL multimodal | Default 400 |
| `MIMO_MAX_TOKENS_FLASH` | Cap for MiMo Flash summaries | Default 150 |

## Tech stack

- **Next.js 15** (App Router, Turbopack, React 19)
- **TypeScript** strict
- **Tailwind v4** + custom dark theme
- **Recharts** — Treemap, RadialBar, Bar, Line
- **Lucide** — icons
- **Sonner** — toasts
- **OpenRouter** — MiMo Pro / Flash / VL routing
- **Octokit** — GitHub REST client with in-memory cache
- **Vercel** — deploy target

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── repo/         GET  → repo metadata
│   │   ├── prs/          GET  → PR list
│   │   ├── pr-risk/      GET  → MiMo Pro risk + reviewer + summary
│   │   ├── hotspots/     GET  → churn + MiMo Pro recommendations
│   │   ├── contributors/ GET  → activity + MiMo Pro expertise
│   │   └── arch-critique/ POST → MiMo VL diagram analysis
│   └── (pages)
├── components/
│   ├── sidebar.tsx       Navigation shell
│   ├── repo-selector.tsx Header repo picker
│   ├── repo-context.tsx  Shared state (localStorage-backed)
│   └── ui.tsx            Card, Badge, Button, Skeleton primitives
└── lib/
    ├── mimo.ts           OpenRouter client + JSON extractor + error classes
    ├── github.ts         Octokit wrapper + 10min in-memory cache
    ├── scoring.ts        Heuristics (risk, hotspot, health) — also corpus fallback
    ├── demos.ts          Curated demo repo presets
    └── utils.ts          cn(), formatNumber(), riskBand()
```

### Graceful degradation

Every MiMo call is wrapped:

```ts
try {
  const r = await callMimo({ tier: "pro", messages, responseFormat: "json_object" });
  // use MiMo response, set source="mimo"
} catch (e) {
  if (!isMimoFallback(e)) console.error(e);
  // fall through to corpus-mode heuristic
}
```

If `OPENROUTER_API_KEY` is missing or upstream returns 402/429/5xx, RepoLens computes a deterministic score from churn metrics, file paths, and PR signals — the dashboard stays useful while the user fixes credit/rate issues.

## Why MiMo

MiMo's reasoning quality on code review tasks (PR risk, file recommendations, expertise clustering) outperforms generic chat models at the price point — and `mimo-v2.5` (VL) is one of the few open multimodal models that can analyze architecture diagrams without hallucinating component names.

The free OpenRouter tier (~535 token cap per request) is enough to power every surface here because RepoLens prompts are tight, structured, and JSON-only. No reasoning-heavy free-form generation; just precise structured outputs.

## License

MIT — see [LICENSE](LICENSE)
