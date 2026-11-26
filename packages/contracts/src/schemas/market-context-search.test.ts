import { describe, expect, it } from 'vitest'
import { marketContextMatchSchema, marketContextSearchQuerySchema, marketContextSearchReadSchema } from './companies.js'
import { EMPTY_MARKET_MEMORY_COVERAGE } from './market-memory.js'

/**
 * #1626 — LE CONTRAT DE LA RECHERCHE PAR CONTEXTE MARCHÉ OBSERVÉ.
 *
 * Ces tests gardent deux choses : le refus « au moins un discriminant », qui
 * doit dire EXACTEMENT ce que `MarketMemoryService.searchByFilters` applique
 * déjà côté service (GA-258, un seul point de vérité) ; et la forme de sortie,
 * qui doit rester le MÊME `MarketMemoryCoverage` que la preview et le dossier
 * de compte, jamais une seconde forme qui diverge d'elle.
 */
describe('marketContextSearchQuerySchema', () => {
  it('refuse une requête sans AUCUN discriminant', () => {
    expect(marketContextSearchQuerySchema.safeParse({}).success).toBe(false)
    expect(marketContextSearchQuerySchema.safeParse({ limit: 10 }).success).toBe(false)
  })

  it('accepte chacun des six discriminants seul', () => {
    for (const filters of [
      { technology: 'Java' },
      { location: 'Lyon' },
      { esn: 'Capgemini' },
      { roleFamily: 'Data' },
      { employeeMin: 250 },
      { employeeMax: 1000 },
    ]) {
      expect(marketContextSearchQuerySchema.safeParse(filters).success).toBe(true)
    }
  })

  it('coerce les nombres transmis en chaîne — une query HTTP ne porte que des chaînes', () => {
    const parsed = marketContextSearchQuerySchema.parse({ employeeMin: '250', employeeMax: '1000', limit: '10' })
    expect(parsed).toEqual({ employeeMin: 250, employeeMax: 1000, limit: 10 })
  })

  it('rejette un champ hors contrat — `.strict()`, comme le pont copilote', () => {
    expect(marketContextSearchQuerySchema.safeParse({ technology: 'Java', userId: 'x' }).success).toBe(false)
  })

  it('borne `limit` à 50, comme `MarketMemoryService.searchByFilters`', () => {
    expect(marketContextSearchQuerySchema.safeParse({ technology: 'Java', limit: 51 }).success).toBe(false)
  })
})

describe('marketContextMatchSchema / marketContextSearchReadSchema', () => {
  it('accepte une couverture COUVERTE, avec le nom de l’entreprise', () => {
    const match = {
      companyName: 'DECATHLON',
      coverage: { ...EMPTY_MARKET_MEMORY_COVERAGE, covered: true, marketPaths: 41 },
    }
    expect(marketContextMatchSchema.safeParse(match).success).toBe(true)
  })

  it('rend `ok` avec une liste de correspondances, ou `unavailable` avec sa raison', () => {
    expect(
      marketContextSearchReadSchema.safeParse({
        status: 'ok',
        matches: [{ companyName: 'X', coverage: { ...EMPTY_MARKET_MEMORY_COVERAGE, covered: true, marketPaths: 5 } }],
      }).success,
    ).toBe(true)
    expect(marketContextSearchReadSchema.safeParse({ status: 'unavailable', reason: 'read_failed' }).success).toBe(true)
  })

  /**
   * #2288.2 — la date TRAVERSE jusqu'à l'écran, avec sa nature. Ce schéma est
   * plus étroit que celui du service : sans ce champ, la date était SILENCIEUSEMENT
   * retirée au bord de la route, et l'écran restait à « aucun signal actuel ».
   */
  it('laisse passer la date du signal, avec sa NATURE', () => {
    const covered = { ...EMPTY_MARKET_MEMORY_COVERAGE, covered: true, marketPaths: 41 }
    const own = marketContextMatchSchema.safeParse({
      companyName: 'DECATHLON',
      coverage: covered,
      currentSignal: { nature: 'own', observedOn: '2026-03-04T09:12:00.000Z' },
    })
    expect(own.success && own.data.currentSignal).toEqual({ nature: 'own', observedOn: '2026-03-04T09:12:00.000Z' })

    const shared = marketContextMatchSchema.safeParse({
      companyName: 'DECATHLON',
      coverage: covered,
      currentSignal: { nature: 'shared', observedMonth: '2026-08' },
    })
    expect(shared.success && shared.data.currentSignal).toEqual({ nature: 'shared', observedMonth: '2026-08' })
  })

  it('REFUSE une date exacte venue d’un AUTRE espace', () => {
    expect(
      marketContextMatchSchema.safeParse({
        companyName: 'DECATHLON',
        coverage: { ...EMPTY_MARKET_MEMORY_COVERAGE, covered: true, marketPaths: 41 },
        currentSignal: { nature: 'shared', observedOn: '2026-08-12T00:00:00.000Z' },
      }).success,
    ).toBe(false)
  })
})
