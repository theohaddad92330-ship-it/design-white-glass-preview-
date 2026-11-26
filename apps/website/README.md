# @bellum/website

Landing + pages marketing publiques de BellumAI. Déployées sur https://bellum-ai.com (Vercel).

L'app produit (`@bellum/web`) est sur https://app.bellum-ai.com. Tous les CTAs marketing pointent vers ce sous-domaine via `NEXT_PUBLIC_APP_URL`.

## Stack

- Next.js 14 (App Router) + React 18 + TypeScript
- Tailwind 3 (preset partagé avec `@bellum/ui`)
- framer-motion sur le Hero uniquement (le reste est animé en CSS pur)

## Dev local

```bash
pnpm install
pnpm --filter @bellum/website dev   # http://localhost:3004
```

Pour faire pointer les CTA vers l'app web locale, créer un `.env.local` :

```
NEXT_PUBLIC_APP_URL=http://localhost:5173
```

## Déploiement Vercel

Projet **Bellum Website** distinct de l'app web :

- Root directory : `apps/website`
- Framework : Next.js
- Build command : `pnpm turbo build --filter=@bellum/website`
- Install command : `pnpm install --frozen-lockfile`
- Domain : `bellum-ai.com` (+ `www.bellum-ai.com`)
- Variables :
  - `NEXT_PUBLIC_APP_URL=https://app.bellum-ai.com`
  - `NEXT_PUBLIC_SITE_URL=https://bellum-ai.com` (base des canonicals / OG / sitemap)
  - `RESEND_API_KEY` (server-only — alimente les formulaires `/demo` et `/beta` via Resend ; sans clé, les routes `/api/demo` et `/api/beta` renvoient une erreur et le formulaire affiche un message clair. Ne JAMAIS préfixer `NEXT_PUBLIC_`.)
  - (optionnel) `DEMO_FROM_EMAIL`, `BETA_FROM_EMAIL` (expéditeur vérifié Resend ; `BETA_FROM_EMAIL` retombe sur `DEMO_FROM_EMAIL` puis `onboarding@resend.dev`)
  - (optionnel) `NEXT_PUBLIC_SENTRY_DSN`

### Formulaires (`/demo`, `/beta`)

Les deux formulaires postent en JSON vers une route App Router (`src/app/api/demo/route.ts`, `src/app/api/beta/route.ts`) qui envoie un email à l'équipe via l'API Resend (clé lue **côté serveur uniquement**). `/beta` (candidature au programme beta 5 ESN) valide les champs, embarque un honeypot anti-spam et renvoie `503` avec un message clair si `RESEND_API_KEY` est absente. Succès affiché en inline.

## Structure

```
src/
├── app/                  # routes App Router
│   ├── page.tsx          # /
│   ├── beta/             # /beta (landing programme beta 5 ESN)
│   ├── api/beta/         # POST /api/beta (candidature → email Resend)
│   ├── demo/             # /demo (client)
│   ├── cgu|legal|privacy|mentions-legales/
│   ├── sitemap.ts
│   └── robots.ts
├── components/marketing/ # sections Landing
└── lib/app-url.ts        # URLs absolues vers app.bellum-ai.com
```
