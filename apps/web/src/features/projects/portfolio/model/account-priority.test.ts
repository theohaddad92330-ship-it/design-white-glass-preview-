import { describe, expect, it } from 'vitest'
import { accountPriority } from './account-priority'
import type { AccountNeeds, NeedItem } from './needs'

/**
 * UNE ACTION PRIORITAIRE PAR CARTE — #1331 (6/7).
 *
 * « On voit des informations, mais on ne sait pas quoi faire. » Le geste se
 * déduit de la matière la plus ENGAGEANTE que porte le compte, pas de la plus
 * NOMBREUSE : sept déductions ne passent pas avant une demande que quelqu'un a
 * formulée. C'est ce que ce fichier tient — un classement par volume ferait
 * tomber le deuxième test.
 */
const need = (over: Partial<NeedItem>): NeedItem => ({
  id: 'n-1',
  kind: 'pain',
  label: 'Un besoin',
  detail: null,
  offer: null,
  timeframe: null,
  urgency: 'unknown',
  ...over,
})

const entry = (needs: NeedItem[], offers: string[] = ['Infogérance']): Pick<AccountNeeds, 'needs' | 'offers'> => ({
  needs,
  offers,
})

describe('accountPriority', () => {
  it('nomme les besoins CONFIRMÉS quand il y en a', () => {
    const priority = accountPriority(entry([need({ id: 'a', kind: 'pain' }), need({ id: 'b', kind: 'pain' })]))
    expect(priority).toEqual({ kind: 'confirmed', count: 2, unmatched: false })
  })

  it('ne se laisse PAS emporter par le volume — une demande passe avant sept déductions', () => {
    const priority = accountPriority(
      entry([
        need({ id: 'a', kind: 'pain' }),
        ...Array.from({ length: 7 }, (_, i) => need({ id: `i-${i}`, kind: 'implication' })),
      ]),
    )
    // Un classement par nombre rendrait « 7 opportunités à qualifier » et
    // enterrerait la seule entrée sur laquelle quelqu'un s'est exprimé.
    expect(priority).toEqual({ kind: 'confirmed', count: 1, unmatched: false })
  })

  it('retombe sur « à qualifier » puis sur « signal », dans cet ordre', () => {
    expect(accountPriority(entry([need({ kind: 'implication' }), need({ id: 'p', kind: 'program' })]))).toEqual({
      kind: 'toQualify',
      count: 2,
      unmatched: false,
    })
    expect(accountPriority(entry([need({ kind: 'signal' })]))).toEqual({
      kind: 'signal',
      count: 1,
      unmatched: false,
    })
  })

  it('signale l’offre manquante SANS en faire un cinquième geste', () => {
    const priority = accountPriority(entry([need({ kind: 'pain' })], []))
    // Le geste reste celui du client ; l'offre manquante est l'autre axe, portée
    // par le même verdict pour que la carte n'ait qu'une ligne.
    expect(priority).toEqual({ kind: 'confirmed', count: 1, unmatched: true })
  })

  it('ne fabrique aucun geste quand il n’y a rien à dire', () => {
    expect(accountPriority(entry([]))).toBeNull()
  })
})
