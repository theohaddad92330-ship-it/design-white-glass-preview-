import * as Sentry from '@sentry/react'
import { scrubSentryBreadcrumb, scrubSentryEvent } from '@bellum/contracts'
import type { router } from '@/router'

type Router = typeof router

export function initSentry(routerInstance: Router): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    // #4618 — sans VITE_ENV, le MODE de Vite ('production' en build) : jamais « dev » pour un bundle servi.
    environment: import.meta.env.VITE_ENV || import.meta.env.MODE,
    // Même valeur que la release des source maps uploadées (absente sans clé au build).
    ...(typeof __SENTRY_RELEASE__ === 'string' && __SENTRY_RELEASE__ ? { release: __SENTRY_RELEASE__ } : {}),
    integrations: [
      // Replaces reactRouterV6BrowserTracingIntegration — feeds the router instance
      // so Sentry transactions name routes as "/dashboard" instead of "/<unknown>".
      Sentry.tanstackRouterBrowserTracingIntegration(routerInstance),
      // BellumAI renders real B2B contact PII (names, emails, phones, org charts,
      // CRM data). Session Replay must mask all text + block media so that PII is
      // never shipped to Sentry (GDPR). Do NOT set these to false.
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    // #4113 — ce qui part vers Sentry est masqué (e-mails, téléphones, jetons) ;
    // l'écran, lui, reste en clair : ce masque ne touche QUE la trace.
    beforeSend: event => scrubSentryEvent(event),
    beforeBreadcrumb: breadcrumb => scrubSentryBreadcrumb(breadcrumb),
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,
  })
}
