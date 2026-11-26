import { beforeEach, describe, expect, it, vi } from 'vitest'

// #4113 — le Sentry web masque e-mails / téléphones / jetons AVANT envoi.
// Ce masque ne vaut que pour la trace : l'écran n'importe jamais ce module.
const init = vi.fn()
vi.mock('@sentry/react', () => ({
  init: (options: unknown) => init(options),
  tanstackRouterBrowserTracingIntegration: () => ({}),
  replayIntegration: () => ({}),
}))

import { initSentry } from './sentry'

type Options = {
  beforeSend: (event: Record<string, unknown>) => Record<string, unknown>
  beforeBreadcrumb: (crumb: Record<string, unknown>) => Record<string, unknown>
}

describe('initSentry — masquage des traces (#4113)', () => {
  beforeEach(() => {
    init.mockClear()
    vi.stubEnv('VITE_SENTRY_DSN', 'https://k@example.ingest.sentry.io/1')
  })

  it('pose beforeSend et beforeBreadcrumb qui masquent e-mail, téléphone et Bearer', () => {
    initSentry({} as never)
    const options = init.mock.calls[0]?.[0] as Options
    const event = options.beforeSend({
      message: 'échec pour jean@acme.fr',
      extra: { tel: '06 12 34 56 78', auth: 'Bearer abcdefghij123456' },
    })
    expect(JSON.stringify(event)).not.toMatch(/jean@acme\.fr|06 12 34 56 78|abcdefghij123456/)
    const crumb = options.beforeBreadcrumb({ message: 'a@b.fr' })
    expect(JSON.stringify(crumb)).not.toContain('a@b.fr')
  })

  it('sans DSN, Sentry n’est pas initialisé (no-op)', () => {
    vi.stubEnv('VITE_SENTRY_DSN', '')
    initSentry({} as never)
    expect(init).not.toHaveBeenCalled()
  })
})
