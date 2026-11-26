// #4113 — le Sentry de l'API masque e-mails, téléphones et jetons AVANT envoi.
// Ce masque ne vaut que pour la trace : une réponse d'API n'y passe jamais.
const init = jest.fn()
jest.mock('@sentry/nestjs', () => ({ init: (options: unknown) => init(options) }))

type Options = {
  beforeSend: (event: Record<string, unknown>) => Record<string, unknown>
  beforeBreadcrumb: (crumb: Record<string, unknown>) => Record<string, unknown>
}

describe('sentry/instrument — masquage des traces (#4113)', () => {
  beforeEach(() => {
    jest.resetModules()
    init.mockClear()
    process.env['SENTRY_DSN'] = 'https://k@example.ingest.sentry.io/1'
  })
  afterEach(() => {
    delete process.env['SENTRY_DSN']
  })

  it('beforeSend masque e-mail, téléphone et Bearer (message, extra, request, exception)', async () => {
    await import('./instrument')
    const options = init.mock.calls[0]?.[0] as Options
    const out = JSON.stringify(
      options.beforeSend({
        message: 'échec pour jean@acme.fr',
        exception: { values: [{ value: 'tel 06 12 34 56 78 injoignable' }] },
        extra: { auth: 'Bearer abcdefghij123456' },
        request: { data: { note: 'écrire à a.b@c.io' }, headers: { accept: 'json' } },
      }),
    )
    expect(out).not.toMatch(/jean@acme\.fr|06 12 34 56 78|abcdefghij123456|a\.b@c\.io/)
    expect(out).toContain('json')
  })

  it('beforeBreadcrumb masque le message', async () => {
    await import('./instrument')
    const options = init.mock.calls[0]?.[0] as Options
    expect(JSON.stringify(options.beforeBreadcrumb({ message: 'a@b.fr' }))).not.toContain('a@b.fr')
  })

  it('sans DSN, Sentry n’est pas initialisé', async () => {
    delete process.env['SENTRY_DSN']
    await import('./instrument')
    expect(init).not.toHaveBeenCalled()
  })

  // #4618 (jumeau du correctif IA) — Railway n'injecte ni SENTRY_RELEASE ni SENTRY_ENVIRONMENT : sans repli, une
  // erreur de production sortait sans `release` et en `environment` de build. Absent partout : jamais inventé.
  describe('#4618 — release et environnement réels', () => {
    const VARS = [
      'SENTRY_RELEASE',
      'RAILWAY_GIT_COMMIT_SHA',
      'GIT_COMMIT',
      'SENTRY_ENVIRONMENT',
      'RAILWAY_ENVIRONMENT_NAME',
      'NODE_ENV',
    ]
    let saved: Record<string, string | undefined>
    beforeEach(() => {
      saved = Object.fromEntries(VARS.map(v => [v, process.env[v]]))
      for (const v of VARS) delete process.env[v]
    })
    afterEach(() => {
      for (const v of VARS) {
        if (saved[v] === undefined) delete process.env[v]
        else process.env[v] = saved[v]
      }
    })
    const initOptions = async () => {
      await import('./instrument')
      return init.mock.calls[0]?.[0] as { release?: string; environment?: string }
    }

    it('release = le SHA du commit servi par Railway', async () => {
      process.env['RAILWAY_GIT_COMMIT_SHA'] = '38e9fc6e8a'
      expect((await initOptions()).release).toBe('38e9fc6e8a')
    })
    it('SENTRY_RELEASE explicite gagne sur le SHA de la plateforme', async () => {
      process.env['SENTRY_RELEASE'] = 'explicite'
      process.env['RAILWAY_GIT_COMMIT_SHA'] = '38e9fc6e8a'
      expect((await initOptions()).release).toBe('explicite')
    })
    it('aucune release connue : absente, jamais inventée', async () => {
      expect((await initOptions()).release).toBeUndefined()
    })
    it('environment = le nom Railway, avant NODE_ENV', async () => {
      process.env['RAILWAY_ENVIRONMENT_NAME'] = 'production'
      process.env['NODE_ENV'] = 'development'
      expect((await initOptions()).environment).toBe('production')
    })
    it('SENTRY_ENVIRONMENT explicite gagne sur le nom Railway', async () => {
      process.env['SENTRY_ENVIRONMENT'] = 'staging'
      process.env['RAILWAY_ENVIRONMENT_NAME'] = 'production'
      expect((await initOptions()).environment).toBe('staging')
    })
  })
})
