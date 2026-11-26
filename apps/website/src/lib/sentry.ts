import * as Sentry from '@sentry/nextjs'
import { scrubSentryBreadcrumb, scrubSentryEvent } from '@bellum/contracts'

/**
 * Même contrat que `apps/web/src/lib/sentry.ts` : pas de DSN ⇒ pas d'init, le
 * développement et la CI ne remontent rien. Ce qui part est masqué (e-mails,
 * téléphones, jetons) ; pas de Session Replay (doctrine GA-240).
 */
export function initSentry(): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
  if (!dsn) return

  // #4618.4 — `release` = le SHA du commit servi et `environment` = VERCEL_ENV : sans eux le tri dans Sentry était
  // inexploitable (`environment` retombait sur 'dev' côté navigateur, où VERCEL_ENV n'existe pas). `next.config.mjs`
  // expose leurs copies publiques. Chaîne vide = absente : pas de clé `release`, jamais une valeur inventée.
  const release = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || undefined
  const environment =
    process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_ENV || 'dev'

  Sentry.init({
    dsn,
    environment,
    ...(release ? { release } : {}),
    sendDefaultPii: false,
    beforeSend: event => scrubSentryEvent(event),
    beforeBreadcrumb: breadcrumb => scrubSentryBreadcrumb(breadcrumb),
    tracesSampleRate: 0.1,
  })
}
