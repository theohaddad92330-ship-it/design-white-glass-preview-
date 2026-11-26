import { describe, expect, it } from 'vitest'
import {
  INTERVENTION_STALE_DAYS,
  INTERVENTION_VISIBLE_COUNT,
  decideInterventionSchema,
  interventionWeight,
  isInterventionStale,
  rankInterventions,
  type Intervention,
} from './playbook.js'

const NOW = new Date('2026-08-22T09:00:00.000Z')

function item(over: Partial<Intervention> & { id: string }): Intervention {
  return {
    kind: 'account_untouched',
    subjectType: 'account',
    subjectId: '00000000-0000-4000-8000-000000000000',
    subjectLabel: null,
    ownerId: null,
    ownerName: null,
    detail: '',
    state: 'open',
    openedAt: NOW.toISOString(),
    resolvedAt: null,
    ...over,
  } as Intervention
}

describe('rankInterventions', () => {
  it('met l’urgent devant l’ancien', () => {
    // La file était servie « la plus ancienne d'abord ». C'est le pire ordre :
    // une alerte ancienne est souvent celle que tout le monde a déjà choisi de
    // ne pas traiter, et une facture bloquée ce matin passait derrière.
    const old = item({ id: 'a', kind: 'account_untouched', openedAt: '2026-05-01T09:00:00.000Z' })
    const fresh = item({ id: 'b', kind: 'invoicing_blocked', openedAt: NOW.toISOString() })
    expect(rankInterventions([old, fresh], NOW).map(entry => entry.id)).toEqual(['b', 'a'])
  })

  it('l’âge pèse, mais il PLAFONNE', () => {
    // Sans plafond, une alerte oubliée depuis six mois finirait par dominer la
    // file pour toujours — exactement ce qu'on veut éviter.
    const threeWeeks = item({ id: 'a', openedAt: '2026-08-01T09:00:00.000Z' })
    const sixMonths = item({ id: 'b', openedAt: '2026-02-22T09:00:00.000Z' })
    expect(interventionWeight(threeWeeks, NOW)).toBe(interventionWeight(sixMonths, NOW))
  })

  it('une intervention déjà vue RECULE', () => {
    const seen = item({ id: 'a', kind: 'invoicing_blocked', state: 'acknowledged' })
    const untouched = item({ id: 'b', kind: 'renewal_at_risk', state: 'open' })
    expect(rankInterventions([seen, untouched], NOW).map(entry => entry.id)).toEqual(['b', 'a'])
  })

  it('est stable : deux poids égaux gardent le même ordre d’un appel à l’autre', () => {
    // Une file qui bouge toute seule d'un rafraîchissement à l'autre n'est plus
    // une file : on perd la ligne qu'on s'apprêtait à cliquer.
    const items = [item({ id: 'c' }), item({ id: 'a' }), item({ id: 'b' })]
    expect(rankInterventions(items, NOW).map(entry => entry.id)).toEqual(['a', 'b', 'c'])
    expect(rankInterventions([...items].reverse(), NOW).map(entry => entry.id)).toEqual(['a', 'b', 'c'])
  })

  it('une date illisible n’est ni « maintenant » ni « très vieux »', () => {
    const broken = item({ id: 'a', openedAt: 'pas une date' })
    expect(Number.isFinite(interventionWeight(broken, NOW))).toBe(true)
  })

  it('ne filtre RIEN — c’est l’écran qui décide combien il montre', () => {
    const items = Array.from({ length: 12 }, (_, index) => item({ id: `id-${index}` }))
    expect(rankInterventions(items, NOW)).toHaveLength(12)
    expect(INTERVENTION_VISIBLE_COUNT).toBe(5)
  })
})

describe('decideInterventionSchema', () => {
  it('refuse de clore sans motif', () => {
    // Une file qu'on vide sans dire ce qui a été fait ne s'explique plus trois
    // semaines après. Même règle que le journal des portes de décision.
    expect(decideInterventionSchema.safeParse({ state: 'resolved' }).success).toBe(false)
  })

  it('accepte de clore AVEC un motif', () => {
    expect(decideInterventionSchema.safeParse({ state: 'resolved', reason: 'Facturé le 20/08' }).success).toBe(true)
  })

  it('n’exige rien pour « je l’ai vue »', () => {
    // Les deux gestes ne disent pas la même chose : accuser réception n'a rien
    // à justifier.
    expect(decideInterventionSchema.safeParse({ state: 'acknowledged' }).success).toBe(true)
  })

  it('refuse un motif vide, qui ne vaut pas mieux que pas de motif', () => {
    expect(decideInterventionSchema.safeParse({ state: 'resolved', reason: '   ' }).success).toBe(false)
  })
})

describe('isInterventionStale (#2402.13)', () => {
  it('n’est pas périmée avant le seuil', () => {
    const fresh = item({
      id: 'a',
      openedAt: new Date(NOW.getTime() - (INTERVENTION_STALE_DAYS - 1) * 86_400_000).toISOString(),
    })
    expect(isInterventionStale(fresh, NOW)).toBe(false)
  })

  it('devient périmée une fois le seuil dépassé', () => {
    const old = item({
      id: 'a',
      openedAt: new Date(NOW.getTime() - (INTERVENTION_STALE_DAYS + 1) * 86_400_000).toISOString(),
    })
    expect(isInterventionStale(old, NOW)).toBe(true)
  })

  it('une intervention déjà ACKNOWLEDGED n’est jamais « périmée » — quelqu’un la porte déjà', () => {
    const acked = item({
      id: 'a',
      state: 'acknowledged',
      openedAt: new Date(NOW.getTime() - (INTERVENTION_STALE_DAYS + 200) * 86_400_000).toISOString(),
    })
    expect(isInterventionStale(acked, NOW)).toBe(false)
  })

  it('une intervention RESOLVED n’est jamais « périmée » — la file ne la montre plus', () => {
    const resolved = item({
      id: 'a',
      state: 'resolved',
      openedAt: new Date(NOW.getTime() - (INTERVENTION_STALE_DAYS + 200) * 86_400_000).toISOString(),
    })
    expect(isInterventionStale(resolved, NOW)).toBe(false)
  })

  it('une date illisible n’est jamais périmée — cohérent avec interventionWeight', () => {
    const bad = item({ id: 'a', openedAt: 'not-a-date' })
    expect(isInterventionStale(bad, NOW)).toBe(false)
  })
})
