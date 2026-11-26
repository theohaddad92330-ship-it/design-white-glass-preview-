import { devFormat, expandNestedErrors, redactLogInfo } from './logger.service'

const SPLAT = Symbol.for('splat')

function info(extra: Record<string, unknown> = {}): Parameters<typeof devFormat>[0] {
  return {
    level: 'info',
    message: 'hello world',
    timestamp: '12:00:00',
    ...extra,
  } as Parameters<typeof devFormat>[0]
}

describe('devFormat', () => {
  it('renders a string context as bracket prefix', () => {
    expect(devFormat(info({ context: 'Bootstrap' }))).toBe('12:00:00 info [Bootstrap] hello world')
  })

  it('serialises object context as JSON appended after the message', () => {
    const out = devFormat(info({ context: { accountId: 'acc-1', userId: 'u-1' } }))
    expect(out).toBe('12:00:00 info hello world {"accountId":"acc-1","userId":"u-1"}')
    expect(out).not.toMatch(/\[object Object\]/)
  })

  it('renders the message bare when context is missing', () => {
    expect(devFormat(info())).toBe('12:00:00 info hello world')
  })

  it('appends splat args after the message', () => {
    const out = devFormat(info({ [SPLAT]: [{ jobId: 'j-1' }, 'extra'] }))
    expect(out).toBe('12:00:00 info hello world {"jobId":"j-1"} extra')
  })

  it('handles Error objects in splat by including the stack', () => {
    const err = new Error('boom')
    const out = devFormat(info({ [SPLAT]: [err] }))
    expect(out).toContain('Error: boom')
  })
})

// #2528 — production's JSON pipeline (`winston.format.json()`) dropped the
// `message` of any Error nested in a meta object: `JSON.stringify(new
// Error('boom'))` is `'{}'` because `message`/`stack` are non-enumerable own
// properties, and only survives as `{"name":"..."}` for a subclass (like
// BullMQ's `UnrecoverableError`) that sets `this.name` as an explicit own
// property in its constructor. `devFormat`'s `serializeArg` already had this
// covered for the dev console; the prod JSON path did not, so `Analysis
// terminal failure` logged `error:{"name":"UnrecoverableError"}` with the real
// cause (the message built by `describeGraphFailure`) silently gone.
describe('expandNestedErrors', () => {
  it('expands an Error nested under a meta key into name+message+stack', () => {
    const err = new Error('Analysis failed in phase plan: InstructorRetryException: boom')
    const out = expandNestedErrors(info({ error: err })) as unknown as Record<string, unknown>
    expect(out['error']).toMatchObject({
      name: 'Error',
      message: 'Analysis failed in phase plan: InstructorRetryException: boom',
    })
    expect((out['error'] as { stack?: string }).stack).toContain('Error: Analysis failed')
  })

  it('preserves a custom .name (e.g. UnrecoverableError) alongside the message', () => {
    class UnrecoverableError extends Error {
      constructor(message: string) {
        super(message)
        this.name = 'UnrecoverableError'
      }
    }
    const err = new UnrecoverableError('Analysis failed in phase plan: boom')
    const out = expandNestedErrors(info({ error: err })) as unknown as Record<string, unknown>
    expect(out['error']).toMatchObject({ name: 'UnrecoverableError', message: 'Analysis failed in phase plan: boom' })
  })

  it('expands an Error nested two levels deep (e.g. contexts.job.cause)', () => {
    const err = new Error('nested boom')
    const out = expandNestedErrors(info({ contexts: { job: { cause: err } } })) as unknown as {
      contexts: { job: { cause: unknown } }
    }
    expect(out.contexts.job.cause).toMatchObject({ name: 'Error', message: 'nested boom' })
  })

  it('leaves non-Error meta untouched', () => {
    const out = expandNestedErrors(info({ tags: { queue: 'analysis', unrecoverable: 'true' } })) as unknown as Record<
      string,
      unknown
    >
    expect(out['tags']).toEqual({ queue: 'analysis', unrecoverable: 'true' })
  })

  it('never touches level/message — a plain-string log entry passes through', () => {
    const out = expandNestedErrors(info()) as unknown as Record<string, unknown>
    expect(out['message']).toBe('hello world')
    expect(out['level']).toBe('info')
  })
})

/**
 * #2442.7 / #2442.8 / #2442.9 — LE PUITS.
 *
 * `apps/api/src/modules` compte plus de mille appels à `logger.*`. La règle
 * « le contenu brut d'une donnée privée n'entre pas dans un journal » se tient
 * ICI, une fois, et pas à mille endroits — voir le docbloc de
 * `observability-privacy.ts`.
 */
describe('#2442.7 — redactLogInfo : le contenu privé ne traverse pas le format winston', () => {
  it('remplace le contenu privé d’un méta par sa description, et garde les métadonnées', () => {
    const out = redactLogInfo(
      info({ draft: { subject: 'Suite à notre échange', body: 'Bonjour Jean, …' }, status: 502 }),
    )
    const serialized = JSON.stringify(out)
    expect(serialized).not.toContain('Bonjour Jean')
    expect(serialized).not.toContain('Suite à notre échange')
    expect((out as unknown as Record<string, unknown>)['status']).toBe(502)
  })

  it('traverse aussi le SPLAT — `logger.error("échec", { draft })` arrive par là, pas par une clé nommée', () => {
    const out = redactLogInfo(info({ [SPLAT]: [{ draft: { body: 'Bonjour Jean, …' } }] }))
    expect(JSON.stringify((out as unknown as Record<symbol, unknown>)[SPLAT])).not.toContain('Bonjour Jean')
  })

  it('caviarde un secret porté par la LIGNE elle-même', () => {
    const out = redactLogInfo(info({ message: 'appel refusé (Bearer eyJhbGciOi.abc.def)' }))
    expect(String(out.message)).not.toContain('eyJhbGciOi.abc.def')
  })

  it('N’ATTRAPE PAS le contexte du logger — `context` contient « text », et il est sur chaque ligne', () => {
    const out = redactLogInfo(info({ context: 'AnalysisService' }))
    expect(out.context).toBe('AnalysisService')
  })

  it('SAIT DIRE NON — sans ce format, le corps du brouillon atteindrait le transport', () => {
    // Le témoin : la MÊME entrée, non caviardée, porte bien le contenu. Si
    // `redactLogInfo` devenait l'identité, ce test-ci resterait vert et le
    // premier deviendrait rouge — c'est le COUPLE qui prouve quelque chose.
    const untouched = info({ draft: { body: 'Bonjour Jean, …' } })
    expect(JSON.stringify(untouched)).toContain('Bonjour Jean')
  })

  it('#2442.9 — porte fermée par défaut : aucune fenêtre de capture brute n’est ouverte', () => {
    delete process.env['SUPPORT_RAW_CAPTURE_WINDOWS']
    const out = redactLogInfo(info({ context: 'ChatService', draft: { body: 'Bonjour Jean, …' } }))
    expect(JSON.stringify(out)).not.toContain('Bonjour Jean')
    expect((out as unknown as Record<string, unknown>)['raw_capture_audit']).toBeUndefined()
  })

  it('#2442.9 / #2442.19 — fenêtre ouverte : le brut passe, et CHAQUE ligne porte sa référence d’audit', () => {
    const expires = new Date(Date.now() + 60_000).toISOString()
    process.env['SUPPORT_RAW_CAPTURE_WINDOWS'] = `ChatService|${expires}|SUP-1234`
    try {
      const out = redactLogInfo(info({ context: 'ChatService', draft: { body: 'Bonjour Jean, …' } }))
      expect(JSON.stringify(out)).toContain('Bonjour Jean')
      expect((out as unknown as Record<string, unknown>)['raw_capture_audit']).toBe('SUP-1234')

      // La fenêtre ne déborde pas sur un autre contexte.
      const other = redactLogInfo(info({ context: 'AnalysisService', draft: { body: 'Bonjour Jean, …' } }))
      expect(JSON.stringify(other)).not.toContain('Bonjour Jean')
    } finally {
      delete process.env['SUPPORT_RAW_CAPTURE_WINDOWS']
    }
  })

  it('#2442.9 — même fenêtre ouverte, un SECRET ne se capture jamais', () => {
    const expires = new Date(Date.now() + 60_000).toISOString()
    process.env['SUPPORT_RAW_CAPTURE_WINDOWS'] = `ChatService|${expires}|SUP-1234`
    try {
      const out = redactLogInfo(info({ context: 'ChatService', authorization: 'Bearer abcdef.ghijkl.mnopqr' }))
      expect(JSON.stringify(out)).not.toContain('abcdef.ghijkl.mnopqr')
    } finally {
      delete process.env['SUPPORT_RAW_CAPTURE_WINDOWS']
    }
  })
})
