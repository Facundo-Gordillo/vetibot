# VetiBot – Veterinary Triage Assistant

**English** | [Español](README.es.md)

VetiBot is a full-stack veterinary triage assistant built around a **traffic-light model**: 🟢 green (mild), 🟡 yellow (moderate) and 🔴 red (emergency). It listens to what is happening with your pet, classifies the urgency and guides you to the next step — from at-home advice to the nearest veterinary clinic that is open right now.

## Features

- **AI triage chat** that collects symptoms, assesses severity and detects red flags. Works with any OpenAI-compatible API (OpenRouter by default), with automatic fallback across free models, per-attempt timeouts and a deterministic local fallback when no API key is configured.
- **Voice messages**: record audio in the chat and transcribe it with Whisper (via Groq by default). The microphone button is hidden when no transcription key is set.
- **Real veterinary clinics** from OpenStreetMap (Overpass API) with live opening status, phone, website and community ratings.
- **Automatic follow-up**: the bot checks back later to ask how the pet is doing.
- **B2B partner program**: clinics can subscribe (Tier 1–3) to be highlighted and prioritized in their area. Payments via Stripe (simulated sandbox mode when no key is set); Mercado Pago configuration is being prepared.
- **PWA**: installable, basic offline support and Web Push notifications (VAPID).
- **Security-minded backend**: JWT auth with bcrypt-hashed passwords, Helmet, rate limiting, Zod validation, configurable CORS, and a production start-up check that refuses to boot with an insecure `JWT_SECRET` or open CORS.
- Light/dark themes and accessibility options.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite, TypeScript, React Router, React Markdown |
| Backend | Node.js (≥ 22.5), Express, TypeScript |
| Data | SQLite (`node:sqlite`, WAL mode) |
| AI | OpenAI SDK (OpenRouter-compatible), Whisper via Groq for voice |
| Clinics | Overpass API (OpenStreetMap) |
| B2B payments | Stripe |
| Push | Web Push / VAPID |
| Deployment | Single process (API + static frontend), Docker, Render/Railway/Fly |

## Project Structure

```
vetibot/
├── client/              # React frontend (Vite)
│   ├── src/
│   │   ├── pages/       # Home, Chat, Partner (B2B)
│   │   ├── components/  # Message, VetCard, TriageIndicator, Auth, Settings...
│   │   ├── hooks/       # useChatAlerts (notifications, unread count)
│   │   ├── api.ts       # typed HTTP client
│   │   ├── auth.tsx     # auth context
│   │   ├── location.ts  # geolocation with caching
│   │   ├── push.ts      # push-notification subscription
│   │   ├── themes.ts    # light/dark themes, accessibility
│   │   └── styles.css   # design system (CSS variables)
│   └── public/          # PWA (manifest, icons, sw.js)
├── server/              # Backend (Express + SQLite)
│   ├── src/
│   │   ├── routes/      # auth, chat, vets, user, partner, stripe, notifications
│   │   ├── services/    # ai, places, followup, notifications, transcribe...
│   │   ├── db/          # schema + lightweight migrations
│   │   ├── middlewares/ # JWT auth
│   │   ├── config.ts    # everything configured via environment variables
│   │   ├── index.ts     # bootstrap + graceful shutdown
│   │   └── types.ts
│   ├── data/            # sponsors.json (B2B) and vetibot.db (both git-ignored)
│   └── .env.example
├── docker/Dockerfile
├── docs/DEPLOY.md       # deployment guide
└── package.json         # npm workspaces (client + server)
```

The SQLite database (`server/data/vetibot.db`) is created automatically on start-up and is never committed.

## Getting Started

### Requirements

- Node.js ≥ 22.5 (for `node:sqlite`)
- npm ≥ 10

### Installation

```bash
# 1) Install dependencies (npm workspaces)
npm install

# 2) Configure the backend
cp server/.env.example server/.env
#    edit server/.env (JWT_SECRET, OPENAI_API_KEY, ...) – the AI key is optional

# 3) Run client (Vite :5173) + server (Express :4000)
npm run dev
```

Open <http://localhost:5173>. The client proxies `/api` to port 4000.

### Production build

```bash
npm run build   # compiles server + client -> client/dist
npm run start   # serves the compiled frontend and the API from :4000
```

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Runs server (tsx watch) and client (Vite) concurrently |
| `npm run build` | Builds server (tsc) and client (tsc + Vite) |
| `npm run start` | Starts the compiled server (API + frontend) |
| `npm run db:init` | Initializes the SQLite database |

## Environment Variables

All configuration lives in `server/.env` (see [`server/.env.example`](server/.env.example)). Main variables:

| Variable | Description |
| --- | --- |
| `PORT`, `NODE_ENV` | Server port and environment |
| `JWT_SECRET` | Session secret (≥ 32 chars, required in production) |
| `CORS_ORIGIN` | Allowed origins, comma-separated (empty = all, dev only) |
| `TRUST_PROXY` | `true` behind Nginx/Render/Railway |
| `APP_URL` | Public URL used in notification links |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` | AI provider (OpenRouter-compatible). Without a key, a deterministic fallback is used |
| `OPENROUTER_AUTO_FREE`, `OPENROUTER_FREE_MODELS`, `OPENROUTER_MAX_FREE` | Automatic fallback to free OpenRouter models |
| `OPENAI_CHAIN_TIMEOUT_MS`, `OPENAI_ATTEMPT_TIMEOUT_MS`, `OPENAI_PRIMARY_GRACE_MS` | Timeouts for the model chain |
| `TRANSCRIBE_API_KEY`, `TRANSCRIBE_BASE_URL`, `TRANSCRIBE_MODEL` | Voice-message transcription (Whisper via Groq) |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CURRENCY` | Stripe (empty = simulated payments) |
| `TIER_PRICE_1..3` | B2B plan prices (in cents) |
| `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET` | Mercado Pago (prepared) |
| `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web Push (`npx web-push generate-vapid-keys`) |
| `DB_PATH`, `SPONSORS_FILE`, `OVERPASS_URL`, `CLIENT_DIST` | Optional path/endpoint overrides |

> Never commit real values: `.env` files and SQLite databases are git-ignored.

## Deployment

VetiBot runs as a single process that serves both the API and the compiled frontend:

- **Render / Railway / Fly**: build `npm run build`, start `npm run start`, set `NODE_ENV=production`, `TRUST_PROXY=true`, `JWT_SECRET` and `CORS_ORIGIN`.
- **Docker**: multi-stage `docker/Dockerfile` (non-root user, health check on `/api/health`).
- SQLite lives in `server/data` — mount a persistent disk. For multiple instances, switch to a remote database.

See [`docs/DEPLOY.md`](docs/DEPLOY.md) for the full guide.

## B2B (Partner Clinics)

The `/partner` page lets a clinic:

1. Create its profile (name, address, coverage radius in km).
2. Choose a plan (Tier 1–3) and pay a subscription via Stripe.
3. Appear highlighted and prioritized in recommendations within its area.

In development (no `STRIPE_SECRET_KEY`) payment is simulated and activated instantly.

## Author

**Facundo Gordillo** – [GitHub](https://github.com/Facundo-Gordillo)

## License

Personal project. All rights reserved.
