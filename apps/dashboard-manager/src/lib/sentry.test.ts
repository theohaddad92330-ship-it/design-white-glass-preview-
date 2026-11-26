import { beforeEach, describe, expect, it, vi } from 'vitest'

const init = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  init: (options: unknown) => init(options),
  captureRequestError: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
}))

import { initSentry } from './sentry'

type Options = {
  sendDefaultPii: boolean
  tracesSampleRate: number
  environment: string
  release?: string
  beforeSend: (event: Record<string, unknown>) => Record<string, unknown>
  beforeBreadcrumb: (crumb: Record<string, unknown>) => Record<string, unknown>
}

describe('initSentry — masquage des traces', () => {
  beforeEach(() => {
    init.mockClear()
    vi.unstubAllEnvs()
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://k@example.ingest.sentry.io/1')
  })

  it('avec DSN : init, sans PII par défaut, et beforeSend / beforeBreadcrumb masquent', () => {
    initSentry()
    const options = init.mock.calls[0]?.[0] as Options
    expect(options.sendDefaultPii).toBe(false)
    expect(options.tracesSampleRate).toBe(0.1)
    const event = options.beforeSend({
      message: 'échec pour jean@acme.fr',
      extra: { tel: '06 12 34 56 78', auth: 'Bearer abcdefghij123456' },
    })
    expect(JSON.stringify(event)).not.toMatch(/jean@acme\.fr|06 12 34 56 78|abcdefghij123456/)
    expect(JSON.stringify(options.beforeBreadcrumb({ message: 'a@b.fr' }))).not.toContain('a@b.fr')
  })

  // #4618.4 — l'environnement est celui de VERCEL_ENV (côté navigateur : sa copie publique), jamais « dev » sur un
  // déploiement ; `NEXT_PUBLIC_ENV` n'est qu'un repli. Seuls les NOMS de variables figurent ici, jamais une valeur réelle.
  it('environment : VERCEL_ENV (copie publique d’abord), puis NEXT_PUBLIC_ENV, puis dev', () => {
    vi.stubEnv('NEXT_PUBLIC_ENV', 'staging')
    vi.stubEnv('VERCEL_ENV', 'preview')
    initSentry()
    expect((init.mock.calls[0]?.[0] as Options).environment).toBe('preview')
    init.mockClear()
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
    initSentry()
    expect((init.mock.calls[0]?.[0] as Options).environment).toBe('production')
    init.mockClear()
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '')
    vi.stubEnv('VERCEL_ENV', '')
    initSentry()
    expect((init.mock.calls[0]?.[0] as Options).environment).toBe('staging')
    init.mockClear()
    vi.stubEnv('NEXT_PUBLIC_ENV', '')
    initSentry()
    expect((init.mock.calls[0]?.[0] as Options).environment).toBe('dev')
  })

  // #4618.4 — la release est le SHA servi : sans elle le tri dans Sentry est inexploitable. Absente → pas de clé
  // `release` du tout (jamais une chaîne vide ni « undefined »).
  it('release : le SHA du commit servi, et aucune clé sans lui', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA', 'abc1234def')
    initSentry()
    expect((init.mock.calls[0]?.[0] as Options).release).toBe('abc1234def')
    init.mockClear()
    vi.stubEnv('NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA', '')
    initSentry()
    expect('release' in (init.mock.calls[0]?.[0] as Options)).toBe(false)
  })

  it('sans DSN, Sentry n’est pas initialisé (no-op)', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
    initSentry()
    expect(init).not.toHaveBeenCalled()
  })
})
