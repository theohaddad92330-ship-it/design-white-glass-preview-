import * as Sentry from '@sentry/nextjs'
import { initSentry } from './lib/sentry'

// Serveur Node et runtime edge partagent la même init (silencieuse sans DSN).
export function register(): void {
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') initSentry()
}

export const onRequestError = Sentry.captureRequestError
