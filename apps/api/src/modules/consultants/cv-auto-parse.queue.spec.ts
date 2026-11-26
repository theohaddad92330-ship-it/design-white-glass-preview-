import {
  CV_AUTO_PARSE_DEFAULT_CONCURRENCY,
  CV_AUTO_PARSE_DEFAULT_RATE_PER_MINUTE,
  CV_AUTO_PARSE_IA_DEFAULT_BACKOFF_MS,
  CV_AUTO_PARSE_IA_MAX_BACKOFF_MS,
  iaBackoffDelayMs,
  resolveCvAutoParseConcurrency,
  resolveCvAutoParseRatePerMinute,
} from './cv-auto-parse.queue'

// #3935 (lot BATCH-CV, 12/10/2026) — 400 à 2000 CV d'un coup : la concurrence se règle par l'env.
describe('resolveCvAutoParseConcurrency — #3935 BATCH-CV', () => {
  it('rend le défaut (8) quand la variable est absente', () => {
    expect(CV_AUTO_PARSE_DEFAULT_CONCURRENCY).toBe(8)
    expect(resolveCvAutoParseConcurrency(undefined)).toBe(8)
    expect(resolveCvAutoParseConcurrency('')).toBe(8)
  })

  it('lit une valeur entière valide', () => {
    expect(resolveCvAutoParseConcurrency('4')).toBe(4)
    expect(resolveCvAutoParseConcurrency(' 12 ')).toBe(12)
  })

  it('borne à [1, 24] — dit NON à 0 et à 100', () => {
    expect(resolveCvAutoParseConcurrency('0')).toBe(1)
    expect(resolveCvAutoParseConcurrency('-3')).toBe(1)
    expect(resolveCvAutoParseConcurrency('100')).toBe(24)
  })

  it('une valeur invalide retombe sur le défaut, jamais sur NaN', () => {
    expect(resolveCvAutoParseConcurrency('beaucoup')).toBe(8)
    expect(resolveCvAutoParseConcurrency('2.5')).toBe(8)
    expect(resolveCvAutoParseConcurrency('8x')).toBe(8)
  })
})

describe('resolveCvAutoParseRatePerMinute — limiteur BullMQ #3935', () => {
  it('défaut, lecture, bornes, invalide', () => {
    expect(resolveCvAutoParseRatePerMinute(undefined)).toBe(CV_AUTO_PARSE_DEFAULT_RATE_PER_MINUTE)
    expect(resolveCvAutoParseRatePerMinute('30')).toBe(30)
    expect(resolveCvAutoParseRatePerMinute('0')).toBe(1)
    expect(resolveCvAutoParseRatePerMinute('100000')).toBe(600)
    expect(resolveCvAutoParseRatePerMinute('vite')).toBe(CV_AUTO_PARSE_DEFAULT_RATE_PER_MINUTE)
  })
})

describe('iaBackoffDelayMs — 429/503 du service IA, `retry-after` respecté #3935', () => {
  it('rend null pour une erreur qui n’est PAS une saturation (la file la traite comme un échec normal)', () => {
    expect(iaBackoffDelayMs(new Error('Consultant introuvable'))).toBeNull()
    expect(iaBackoffDelayMs({ status: 422 })).toBeNull()
    expect(iaBackoffDelayMs(null)).toBeNull()
  })

  it('une ServiceUnavailable (503) sans indication rend le délai par défaut', () => {
    expect(iaBackoffDelayMs({ status: 503 })).toBe(CV_AUTO_PARSE_IA_DEFAULT_BACKOFF_MS)
    expect(iaBackoffDelayMs({ getStatus: () => 503 })).toBe(CV_AUTO_PARSE_IA_DEFAULT_BACKOFF_MS)
  })

  it('un 429 avec `retry-after` en secondes est respecté', () => {
    expect(iaBackoffDelayMs({ status: 429, headers: { 'retry-after': '12' } })).toBe(12_000)
  })

  it('le `retry-after` est cherché dans la CAUSE (erreur enveloppée par le service)', () => {
    const wrapped = { getStatus: () => 503, cause: { status: 429, response: { headers: { 'Retry-After': '7' } } } }
    expect(iaBackoffDelayMs(wrapped)).toBe(7_000)
  })

  it('un `retry-after` en date HTTP est converti en délai', () => {
    const now = Date.parse('2026-10-12T10:00:00Z')
    const header = new Date(now + 30_000).toUTCString()
    expect(iaBackoffDelayMs({ status: 503, headers: { 'retry-after': header } }, now)).toBe(30_000)
  })

  it('un `retry-after` absurde est plafonné, un illisible retombe sur le défaut', () => {
    expect(iaBackoffDelayMs({ status: 429, headers: { 'retry-after': '86400' } })).toBe(CV_AUTO_PARSE_IA_MAX_BACKOFF_MS)
    expect(iaBackoffDelayMs({ status: 429, headers: { 'retry-after': 'bientôt' } })).toBe(
      CV_AUTO_PARSE_IA_DEFAULT_BACKOFF_MS,
    )
  })
})
