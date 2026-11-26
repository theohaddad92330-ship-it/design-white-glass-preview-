import { FirstEuroService } from './first-euro.service'

/**
 * LA DISTANCE AU PREMIER EURO, côté lecture — PDF 2 §7.4, `BEL-ACC-107` PR4.
 *
 * Le CALCUL est tenu par `first-euro.test.ts` (contrats, pur). Ce qui se joue
 * ici, c'est ce que le service LIT :
 *  - il borne tout à l'espace de l'appelant ;
 *  - il ne déduit AUCUNE étape d'une autre ;
 *  - une lecture ratée penche du côté PRUDENT (distance maximale, aucune
 *    estimation), jamais du côté rassurant ;
 *  - une médiane se prend sur des deltas RÉELS, et un ordre inversé est écarté
 *    plutôt que ramené à zéro.
 */
describe('FirstEuroService', () => {
  function build(handlers: {
    reached?: Record<string, boolean>
    milestones?: Array<Record<string, string | null>>
    closed?: number
    throwOn?: 'reached' | 'medians' | 'count'
  }) {
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('FROM accounts a')) {
        if (handlers.throwOn === 'reached') throw new Error('boom')
        return [handlers.reached ?? {}]
      }
      if (sql.includes('COUNT(*)')) {
        if (handlers.throwOn === 'count') throw new Error('boom')
        return [{ total: handlers.closed ?? 0 }]
      }
      if (handlers.throwOn === 'medians') throw new Error('boom')
      return handlers.milestones ?? []
    })
    const repo = { manager: { query } }
    return { service: new FirstEuroService(repo as never), query }
  }

  /** Une mission close dont les huit jalons sont espacés de `gap` jours. */
  function evenlySpaced(gap: number, from = '2026-01-01T00:00:00.000Z') {
    const steps = [
      'contact_identified',
      'reply_obtained',
      'need_expressed',
      'profile_sent',
      'interview',
      'agreement',
      'mission_started',
      'first_invoice',
    ]
    const start = new Date(from).getTime()
    return Object.fromEntries(
      steps.map((step, index) => [step, new Date(start + index * gap * 86_400_000).toISOString()]),
    )
  }

  it('borne les trois lectures à l’espace de l’appelant', async () => {
    const { service, query } = build({ closed: 12 })
    await service.forAccount('acc-1', 'w-1')

    expect(query).toHaveBeenCalledTimes(3)
    for (const call of query.mock.calls) {
      expect(JSON.stringify(call[1])).toContain('w-1')
    }
  })

  it('ne compte QUE les étapes que la base confirme — aucune n’est déduite', async () => {
    const { service } = build({
      // Une mission a démarré, mais aucun contact n'est en base (compte repris
      // d'un import). L'étape « contact identifié » RESTE à franchir.
      reached: { mission_started: true, contact_identified: false },
      closed: 12,
    })
    const result = await service.forAccount('acc-1', 'w-1')

    expect(result.steps).toBe(7)
    expect(result.nextStep).toBe('contact_identified')
  })

  it('sous dix missions closes, aucune estimation — et le manque est CHIFFRÉ', async () => {
    const { service } = build({ reached: {}, milestones: [evenlySpaced(4)], closed: 3 })
    const result = await service.forAccount('acc-1', 'w-1')

    expect(result.estimatedDays).toBeNull()
    expect(result.measurability).toEqual({ measurable: false, observed: 3, required: 10, missing: 7 })
  })

  it('au-delà du seuil, la somme des médianes observées — un fait, pas un pari', async () => {
    const missions = Array.from({ length: 12 }, (_, index) =>
      evenlySpaced(4, `2026-0${(index % 9) + 1}-01T00:00:00.000Z`),
    )
    const { service } = build({ reached: {}, milestones: missions, closed: 12 })
    const result = await service.forAccount('acc-1', 'w-1')

    // La PREMIÈRE étape n'a pas de jalon précédent : elle reste non mesurée, et
    // c'est ce qui refuse l'estimation quand elle est encore à franchir.
    expect(result.unmeasuredSteps).toEqual(['contact_identified'])
    expect(result.estimatedDays).toBeNull()
  })

  it('un compte qui a déjà un contact voit les sept étapes suivantes estimées', async () => {
    const missions = Array.from({ length: 12 }, () => evenlySpaced(4))
    const { service } = build({ reached: { contact_identified: true }, milestones: missions, closed: 12 })
    const result = await service.forAccount('acc-1', 'w-1')

    expect(result.steps).toBe(7)
    expect(result.unmeasuredSteps).toEqual([])
    expect(result.estimatedDays).toBe(7 * 4)
  })

  it('un ordre inversé est ÉCARTÉ, jamais compté « zéro jour »', async () => {
    // Un besoin arrivé par un partenaire AVANT le premier contact : le delta
    // serait négatif. Le compter à zéro raccourcirait la médiane des autres.
    const inverted = { ...evenlySpaced(4), need_expressed: '2025-01-01T00:00:00.000Z' }
    const missions = [...Array.from({ length: 11 }, () => evenlySpaced(4)), inverted]
    const { service } = build({ reached: { contact_identified: true }, milestones: missions, closed: 12 })
    const result = await service.forAccount('acc-1', 'w-1')

    expect(result.estimatedDays).toBe(7 * 4)
  })

  it('une lecture d’étapes ratée penche du côté PRUDENT — distance maximale', async () => {
    const { service } = build({ throwOn: 'reached', closed: 12 })
    const result = await service.forAccount('acc-1', 'w-1')

    expect(result.steps).toBe(8)
    expect(result.nextStep).toBe('contact_identified')
  })

  it('un compte d’historique raté REFUSE d’estimer plutôt que d’inventer', async () => {
    const { service } = build({ reached: { contact_identified: true }, throwOn: 'count' })
    const result = await service.forAccount('acc-1', 'w-1')

    expect(result.estimatedDays).toBeNull()
    expect(result.measurability.measurable).toBe(false)
  })

  it('classe un portefeuille en ne lisant l’historique QU’UNE fois', async () => {
    const { service, query } = build({ reached: {}, closed: 12 })
    await service.forAccounts(['a-1', 'a-2', 'a-3'], 'w-1')

    // 2 lectures d'historique + 1 par compte — jamais 2 par compte.
    expect(query).toHaveBeenCalledTimes(5)
  })

  it('un portefeuille vide ne lit rien du tout', async () => {
    const { service, query } = build({ closed: 12 })
    expect(await service.forAccounts([], 'w-1')).toEqual({})
    expect(query).not.toHaveBeenCalled()
  })
})
