import type { AccountMarketContext } from '@bellum/contracts'
import { observedOnMarket } from './market-observed'

const context = (over: Partial<AccountMarketContext> = {}): AccountMarketContext => ({
  paths_observed: 198,
  esn_observed: 0,
  ...over,
})

describe('observedOnMarket — ce que la mémoire marché sait déjà, agrégats seulement', () => {
  it('technos, familles de rôles, ESN avec leurs parcours, ex-ESN : triés, seuil de 3 parcours respecté', () => {
    const result = observedOnMarket(
      context({
        observed_stack_detail: [
          { techno: 'SAP', persons: 12 },
          { techno: 'Azure', persons: 5 },
          { techno: 'COBOL', persons: 2 },
        ],
        role_families: [
          { family: 'Data / IA', persons: 7 },
          { family: 'Autre', persons: 40 },
          { family: 'Réseau', persons: 1 },
        ],
        esn_observed_detail: [
          { esnName: 'Alpha', persons: 9, certainty: 'forte' },
          { esnName: 'Beta', persons: 2, certainty: 'faible' },
        ],
        ex_esn_present: 4,
      }),
    )
    expect(result).toEqual({
      stack: [
        { techno: 'SAP', persons: 12 },
        { techno: 'Azure', persons: 5 },
      ],
      families: ['Data / IA'],
      esn: [{ name: 'Alpha', persons: 9 }],
      exEsn: 4,
    })
  })

  it('sous le seuil ⇒ rien : ni liste vide ni « 0 » ; tout vide ⇒ null', () => {
    expect(
      observedOnMarket(
        context({
          observed_stack_detail: [{ techno: 'COBOL', persons: 2 }],
          esn_observed_detail: [{ esnName: 'Beta', persons: 1, certainty: 'faible' }],
          ex_esn_present: 2,
        }),
      ),
    ).toBeNull()
    expect(observedOnMarket(context())).toBeNull()
    expect(observedOnMarket(null)).toBeNull()
  })

  it('aucune personne, aucune date : seulement des libellés et des comptages', () => {
    const result = observedOnMarket(
      context({ esn_observed_detail: [{ esnName: 'Alpha', persons: 9, certainty: 'forte' }] }),
    )
    expect(Object.keys(result!).sort()).toEqual(['esn', 'exEsn', 'families', 'stack'])
  })
})
