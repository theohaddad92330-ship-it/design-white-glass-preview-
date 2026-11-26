import { describe, expect, it } from 'vitest'
import type { AwardedContract, RegistryAnnouncement } from '@bellum/contracts'
import { mergeAwardedContracts } from './awardedContracts'

// #3915.decp — la carte des marchés montre AUSSI ceux que la veille relit en continu, datés.
const frozen: AwardedContract = {
  title: 'TMA du SI achats',
  buyer: 'Mairie X',
  winner: 'Acme SA',
  amount: 120000,
  location: null,
  department: null,
  notified_date: '2026-03-02',
  cpv: null,
  url: 'https://x.example/m1',
}

function award(over: Partial<RegistryAnnouncement> = {}): RegistryAnnouncement {
  return {
    source: 'decp',
    kind: 'award_won',
    type: 'Expertise DATA-IA',
    date: '2026-09-01',
    url: null,
    tribunal: null,
    counterpart: 'Ministère',
    ...over,
  }
}

describe('mergeAwardedContracts', () => {
  it('fusionne l’analyse et la veille continue, le plus récent d’abord, chacun daté', () => {
    expect(mergeAwardedContracts([frozen], [award()])).toEqual([
      {
        title: 'Expertise DATA-IA',
        date: '2026-09-01',
        winner: null,
        buyer: 'Ministère',
        won: true,
        amount: null,
        url: null,
      },
      {
        title: 'TMA du SI achats',
        date: '2026-03-02',
        winner: 'Acme SA',
        buyer: 'Mairie X',
        won: false,
        amount: 120000,
        url: 'https://x.example/m1',
      },
    ])
  })

  it('le même marché lu des deux côtés n’est qu’une ligne', () => {
    const same = award({ kind: 'award', type: 'TMA du SI achats', date: '2026-03-02', counterpart: 'Acme SA' })
    expect(mergeAwardedContracts([frozen], [same])).toHaveLength(1)
  })

  it('sait dire NON : une annonce BODACC, un marché sans objet ne font aucune ligne', () => {
    const bodacc: RegistryAnnouncement = { ...award(), source: 'bodacc', kind: 'sale' }
    expect(mergeAwardedContracts(undefined, [bodacc, award({ type: null })])).toEqual([])
  })
})
