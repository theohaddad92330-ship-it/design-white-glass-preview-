import type { Account } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { buildOverviewStatsCounts } from './TabOverview'
import type { useAccountOverviewData } from './useAccountOverviewData'

/**
 * #2091 — mesuré en PRODUCTION (SHA 06e0a6a49, fiche PAYFIT) : un compte SANS
 * plan généré affichait « 0 offre détectée ». `offers_to_propose ?? []` faisait
 * d'un plan jamais lancé un décompte MESURÉ à zéro — « on a cherché, il n'y a
 * rien » alors que la vérité est « on n'a pas encore cherché ». Même motif
 * pour les entités (`account.subsidiaries`) et les signaux
 * (`overview.recent_signals`) : FAMILLE de trois compteurs, un seul correctif.
 */
function account(overrides: Partial<Account> = {}): Account {
  return { id: 'a-1', status: 'completed', subsidiaries: undefined, ...overrides } as unknown as Account
}

function overview(
  overrides: Partial<ReturnType<typeof useAccountOverviewData>> = {},
): ReturnType<typeof useAccountOverviewData> {
  return { plan: undefined, offers_to_propose: undefined, recent_signals: undefined, ...overrides } as ReturnType<
    typeof useAccountOverviewData
  >
}

describe('buildOverviewStatsCounts — un décompte non calculé n’est jamais 0 (#2091)', () => {
  it('aucun plan généré : offersCount est NON MESURÉ, pas 0', () => {
    const counts = buildOverviewStatsCounts(account(), overview())
    expect(counts.offersCount).toBeUndefined()
  })

  it('un plan a tourné et n’a proposé aucune offre : 0 est un VRAI compte', () => {
    const counts = buildOverviewStatsCounts(account(), overview({ plan: { offers_to_propose: [] } } as never))
    expect(counts.offersCount).toBe(0)
  })

  it('un plan a proposé des offres : le compte réel', () => {
    const counts = buildOverviewStatsCounts(
      account(),
      overview({ plan: { offers_to_propose: [{ id: '1' }, { id: '2' }] } } as never),
    )
    expect(counts.offersCount).toBe(2)
  })

  it('cartographie des filiales jamais faite : subsidiariesCount est NON MESURÉ, pas 0', () => {
    const counts = buildOverviewStatsCounts(account({ subsidiaries: undefined }), overview())
    expect(counts.subsidiariesCount).toBeUndefined()
  })

  it('cartographie faite, aucune filiale trouvée : 0 est un VRAI compte', () => {
    const counts = buildOverviewStatsCounts(account({ subsidiaries: [] }), overview())
    expect(counts.subsidiariesCount).toBe(0)
  })

  it('analyse jamais lancée : signalsCount est NON MESURÉ, pas 0', () => {
    const counts = buildOverviewStatsCounts(account(), overview({ recent_signals: undefined }))
    expect(counts.signalsCount).toBeUndefined()
  })

  it('analyse lancée sans signal récent : 0 est un VRAI compte', () => {
    const counts = buildOverviewStatsCounts(account(), overview({ recent_signals: [] }))
    expect(counts.signalsCount).toBe(0)
  })
})

// #4142 — la pastille « signaux » compte ce que la liste rend : un fait servi deux fois n'y compte qu'une fois.
describe('buildOverviewStatsCounts — signaux repliés (#4142)', () => {
  const dup = [
    { signal: 'Veolia lance un appel d’offres cloud pour sa DSI', url: 'https://x.fr/veolia', date: '2026-09-10' },
    { signal: 'Appel d’offres cloud lancé par Veolia pour sa DSI', url: 'https://x.fr/veolia', date: '2026-09-11' },
  ]

  it('deux formulations du même fait : un seul signal compté', () => {
    expect(buildOverviewStatsCounts(account(), overview({ recent_signals: dup } as never)).signalsCount).toBe(1)
  })

  it('⚠️ SAIT DIRE NON — deux faits distincts le même jour : deux signaux comptés', () => {
    const distinct = [
      { signal: 'Veolia lance un appel d’offres cloud pour sa DSI', date: '2026-09-10' },
      { signal: 'Veolia nomme un nouveau directeur des achats IT', date: '2026-09-10' },
    ]
    expect(buildOverviewStatsCounts(account(), overview({ recent_signals: distinct } as never)).signalsCount).toBe(2)
  })
})
