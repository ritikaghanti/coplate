# Coplate 🍽️

**Snap a photo of your plate. Get your macros. No typing.**

Coplate is a fitness co-pilot. The Phase-0 slice is one feature built to real
depth: **Snap-and-Log**  point your phone at a meal and a vision pipeline
identifies the food, estimates portions, and logs calories, protein, carbs or fat.

The interesting part isn't "call a vision model." It's making it *reliable*:
forced structured output with schema validation + retry, grounding estimates
against a nutrition reference, and a reproducible eval suite that actually
measures accuracy.

## Architecture

```
coplate/
├── packages/shared    # Zod schemas = single source of truth (API + app + LLM contract)
├── apps/api           # Fastify + Drizzle/Postgres + the vision pipeline
│   └── src/lib/vision.ts   # ← the core AI-engineering artifact
├── apps/mobile        # Expo (React Native) — camera → review → log
└── evals              # labeled-dataset accuracy harness (the differentiator)
```


## Prerequisites

- Node 20+, `pnpm` (`npm i -g pnpm`)
- Postgres (local, Docker, or a free Neon/Supabase instance)
- An Anthropic API key
- Expo Go on your iPhone (App Store) — phone and laptop on the same Wi-Fi

## Setup

```bash
pnpm install

# API
cd apps/api
cp .env.example .env          # add ANTHROPIC_API_KEY and DATABASE_URL
pnpm db:push                  # create tables
cd ../..

pnpm dev:api                  # API on http://0.0.0.0:3000
```

In `apps/mobile/lib/api.ts`, set `API_BASE` to your laptop's LAN IP
(`ipconfig getifaddr en0` on macOS), e.g. `http://192.168.1.42:3000`.
`localhost` won't work from the phone.

```bash
pnpm dev:mobile               # scan the QR code with your iPhone camera
```

Snap a plate → review the macros → log it → see your daily total update.

## Roadmap

- **Phase 1:** manual editing of detected items; 'Make Room' (deterministic
  budget soft-locking)
