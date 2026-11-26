# @bellum/dashboard-manager

Operator monitoring dashboard (Next.js, App Router) for the BellumAI IA pipeline.
Reads the API's telemetry endpoint and shows, per analysis, the LLM **cost**,
**duration** and **status**, plus a count / total / average summary.

This is internal tooling — it is **not** the product UI (`apps/web`). It talks to
the API through the operator endpoint `GET /internal/telemetry`, which is guarded
by `InternalSecretGuard` (a shared `x-internal-secret` header, no end-user JWT).

## Run

```bash
cp .env.example .env.local
# set INTERNAL_API_SECRET to the same value as the API's INTERNAL_API_SECRET
pnpm install
pnpm --filter @bellum/dashboard-manager dev   # http://localhost:3005
```

## Demo (no infra)

One command shows a fully-populated dashboard with **zero infra** — no DB, no
NestJS, no Claude spend. A tiny seed server (`scripts/demo-server.mjs`) mirrors
`GET /internal/telemetry` (+ `/:id`) and serves the frozen B2 fixtures
(Société Générale, Doctolib) as `rawAnalysis`; the launcher wires `next dev` to
it via env and tears both down on Ctrl-C.

```bash
pnpm --filter @bellum/dashboard-manager demo   # dashboard :3005 + seed :4999
```

Smoke-tested with `pnpm --filter @bellum/dashboard-manager test` (Node's
built-in runner, no deps).

## Data source

`GET {API_BASE_URL}/internal/telemetry?limit=50` →

```jsonc
{
  "analyses": [
    {
      "accountId": "…",
      "companyName": "Société Générale",
      "status": "completed",
      "costUsd": 0.71,
      "createdAt": "…",
      "updatedAt": "…",
      "durationMs": 219000,
    },
  ],
  "summary": { "count": 12, "totalCostUsd": 8.4, "avgCostUsd": 0.7 },
}
```

Cost is the USD figure the worker accumulates from each phase's
`meta.token_usage.cost_usd` (persisted on the legacy-named `api_cost_euros`
column via `AccountsService.setApiCost`).

## Env

| Var                   | Purpose                                        |
| --------------------- | ---------------------------------------------- |
| `API_BASE_URL`        | API base URL (default `http://localhost:3012`) |
| `INTERNAL_API_SECRET` | Must equal the API's `INTERNAL_API_SECRET`     |
