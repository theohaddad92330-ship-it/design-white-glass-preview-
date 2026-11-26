// Ring buffer of runtime errors and failed network calls. The console buffer
// only sees what code logs on purpose; this catches what actually broke —
// uncaught exceptions, rejected promises, and non-2xx API responses — so a bug
// report carries the failure even when nothing was logged.

import { installNetworkProbe } from './networkBuffer'

type Entry = { time: string; kind: 'error' | 'rejection' | 'network'; text: string }

const MAX_ENTRIES = 50
const MAX_CHARS = 10000
const buffer: Entry[] = []
let installed = false

function push(kind: Entry['kind'], text: string): void {
  try {
    buffer.push({ time: new Date().toISOString(), kind, text })
    if (buffer.length > MAX_ENTRIES) buffer.shift()
  } catch {
    // Reporting must never break the app.
  }
}

export function installErrorBuffer(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', event => {
    const where = event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : ''
    push('error', `${event.message}${where}${stackOf(event.error)}`)
  })

  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason as unknown
    const head = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason)
    push('rejection', `${head}${stackOf(reason)}`)
  })

  // Un SEUL patch de `fetch` dans l'app, tenu par networkBuffer : il en garde la
  // version structurée (statut, durée, identifiant de corrélation) et nous rend
  // ici la ligne de texte historique. Deux enveloppes autour de `fetch`
  // fausseraient les durées et pourraient diverger sur ce qu'elles voient.
  installNetworkProbe(text => push('network', text))
}

function stackOf(value: unknown): string {
  if (!(value instanceof Error) || !value.stack) return ''
  return `\n${value.stack.split('\n').slice(0, 8).join('\n')}`
}

/** The buffered failures as a single string, most recent last, char-capped. */
export function getRecentErrors(): string {
  const text = buffer.map(e => `[${e.time}] ${e.kind.toUpperCase()}: ${e.text}`).join('\n')
  return text.length > MAX_CHARS ? text.slice(text.length - MAX_CHARS) : text
}
