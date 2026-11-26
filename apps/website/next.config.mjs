import { withSentryConfig } from '@sentry/nextjs'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // #4618.4 — le SHA et l'environnement de déploiement, lisibles par le navigateur (Sentry : release + environment).
  // Seuls des NOMS ici ; Vercel pose les valeurs au build, jamais écrites dans le dépôt. Absentes en local : omises.
  env: {
    ...(process.env.VERCEL_GIT_COMMIT_SHA
      ? { NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA }
      : {}),
    ...(process.env.VERCEL_ENV ? { NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV } : {}),
  },
  // CI_TYPES_VERIFIES (22/10/2026) : posée par le pas Build de ci.yml, dont le pas
  // « Check types » vérifie déjà les types et `pnpm lint` (job quick) le lint. Audit CI
  // du 15 au 22/10 : `next build` les refaisait, ~2 min par Build (~250 Build/sem).
  // Absente en local et en prod : `next build` garde ses vérifications.
  typescript: { ignoreBuildErrors: Boolean(process.env.CI_TYPES_VERIFIES) },
  eslint: { ignoreDuringBuilds: Boolean(process.env.CI_TYPES_VERIFIES) },
  transpilePackages: ['@bellum/ui', '@bellum/consent'],
  experimental: {
    optimizePackageImports: ['lucide-react', '@bellum/ui'],
    // Même cause que `apps/dashboard-manager` : la génération des 69 pages
    // forke un worker par CPU perçu, et dans un conteneur Node voit les CPU de
    // l'HÔTE, pas la part allouée. La mémoire de pointe dépasse le conteneur,
    // qui tue le worker — `Next.js build worker exited with code: null and
    // signal: SIGABRT`, à « Generating static pages (34/69) ».
    //
    // C'est ce qui faisait échouer le job E2E : il n'avait aucun problème
    // d'E2E, il mourait sur le build du site avant d'ouvrir un navigateur.
    cpus: 1,
    workerThreads: false,
  },
  // Security headers on the public marketing site. A full CSP is intentionally
  // omitted (Next's inline runtime + Tailwind would need a nonce pipeline);
  // these cover clickjacking, MIME sniffing, referrer leakage and force HTTPS.
  //
  // `frame-ancestors 'none'` IS added below (pentest 2026-09-12): unlike a full
  // CSP, it governs only framing — never script/style execution — so it needs
  // no nonce and can't break the inline runtime. X-Frame-Options: DENY already
  // covers this; frame-ancestors is belt-and-suspenders for browsers that
  // honor CSP but not the legacy header.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        ],
      },
    ]
  },
}

// Le build ne dépend jamais de Sentry : sans SENTRY_AUTH_TOKEN, aucun envoi de
// source maps (silencieux, pas d'échec). Pas de tunnel route.
const sentryBuildOptions = {
  org: 'bellumai',
  project: 'bellum-website',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  telemetry: false,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
}

export default withSentryConfig(withNextIntl(nextConfig), sentryBuildOptions)
