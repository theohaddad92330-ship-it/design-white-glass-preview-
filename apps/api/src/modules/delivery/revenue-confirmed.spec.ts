import { RevenueService } from './revenue.service'

/**
 * #2900 (#2415.10) — LE CA CONFIRMÉ : l'encaissé, moins ce qui est contesté.
 *
 * La notion n'existait nulle part dans le dépôt avant cette épopée : le
 * produit distingue déjà signé/produit/facturé/encaissé, mais aucun des
 * quatre ne permet à Laura d'expliquer qu'une facture contestée est EXCLUE
 * d'un chiffre « confirmé ». `confirmedRevenue` est une dérivation séparée
 * des quatre lignes (elle ne les rejoint pas — la doctrine « LES QUATRE
 * chiffres » ne bouge pas), qui répond à cette seule question.
 */
function serviceReturning(rows: unknown[]): RevenueService {
  const manager = { query: async () => rows }
  return new RevenueService({ manager } as never)
}

function serviceThrowing(): RevenueService {
  const manager = {
    query: async () => {
      throw new Error('boom')
    },
  }
  return new RevenueService({ manager } as never)
}

describe('RevenueService.confirmedRevenue — encaissé moins contesté, jamais 0 pour une absence', () => {
  it('un montant réel exclut les lignes contestées du total ET les nomme', async () => {
    const service = serviceReturning([
      { cents: '80000', without_amount: '0', source_rows: '2', excluded_disputed: '1' },
    ])
    const result = await service.confirmedRevenue({ kind: 'workspace', workspaceId: 'w1' }, '2026-09')
    expect(result.amountCents).toBe(80_000)
    expect(result.excludedDisputed).toBe(1)
    expect(result.unavailableReason).toBeNull()
  })

  it('aucune ligne encaissée non contestée : `null`, jamais 0, raison `no_source`', async () => {
    const service = serviceReturning([{ cents: null, without_amount: '0', source_rows: '0', excluded_disputed: '3' }])
    const result = await service.confirmedRevenue({ kind: 'workspace', workspaceId: 'w1' }, '2026-09')
    expect(result.amountCents).toBeNull()
    expect(result.unavailableReason).toBe('no_source')
    // Tout est contesté : c'est justement le cas où le compte compte le plus.
    expect(result.excludedDisputed).toBe(3)
  })

  it('un vrai zéro (mission encaissée à 0€) reste 0, distinct de l’absence', async () => {
    const service = serviceReturning([{ cents: '0', without_amount: '0', source_rows: '1', excluded_disputed: '0' }])
    const result = await service.confirmedRevenue({ kind: 'workspace', workspaceId: 'w1' }, '2026-09')
    expect(result.amountCents).toBe(0)
    expect(result.unavailableReason).toBeNull()
  })

  it('une lecture en échec rend `null` partout, y compris `excludedDisputed` — jamais 0', async () => {
    const service = serviceThrowing()
    const result = await service.confirmedRevenue({ kind: 'workspace', workspaceId: 'w1' }, '2026-09')
    expect(result.amountCents).toBeNull()
    expect(result.unavailableReason).toBe('unavailable')
    expect(result.excludedDisputed).toBeNull()
  })

  it('la requête filtre les contestées HORS du total ET du dénominateur, jamais fondues avec les autres', async () => {
    const queries: string[] = []
    const manager = {
      query: async (sql: string) => {
        queries.push(sql)
        return [{ cents: null, without_amount: '0', source_rows: '0', excluded_disputed: '0' }]
      },
    }
    const service = new RevenueService({ manager } as never)
    await service.confirmedRevenue({ kind: 'workspace', workspaceId: 'w1' }, '2026-09')
    const sql = queries[0]
    expect(sql).toContain('FILTER (WHERE r.disputed_at IS NULL)')
    expect(sql).toContain('r.paid_at IS NOT NULL')
    expect(sql).not.toContain('COALESCE(SUM(')
  })
})
