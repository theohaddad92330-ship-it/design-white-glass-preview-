import { describe, expect, it } from 'vitest'
import { removeNewlySharedLabels } from './scope-exclusivity'

// #4142 (retour bêta Louis 13/10) — « est-ce que y a des choses qui sont en
// doublon, qui manquent ? ». Audit : `ScopeChipsField` dédoublonne déjà DANS
// un champ (une casse près) ; rien n'empêchait d'écrire le MÊME libellé dans
// deux champs opposés — « TF1 » à la fois prioritaire ET écarté, un cadrage
// contradictoire envoyé tel quel au serveur. Tranché sans Louis : le dernier
// champ coché gagne, l'autre perd le libellé qu'il partage désormais — jamais
// les deux à la fois.
describe('removeNewlySharedLabels (#4142)', () => {
  it('retire du champ opposé un libellé qui vient juste d’être ajouté', () => {
    expect(removeNewlySharedLabels(['TF1', 'Bouygues'], [], ['TF1'])).toEqual(['Bouygues'])
  })

  it('ignore la casse — "tf1" ajouté retire "TF1" du champ opposé', () => {
    expect(removeNewlySharedLabels(['TF1', 'Bouygues'], [], ['tf1'])).toEqual(['Bouygues'])
  })

  it('ne touche pas un libellé déjà présent AVANT ce changement — seul un AJOUT déclenche le retrait', () => {
    // "TF1" était déjà dans la liste opposée avant ce changement : ce n'est
    // pas CE geste qui crée le doublon, on ne le corrige pas sous le pied de
    // l'utilisateur.
    expect(removeNewlySharedLabels(['TF1'], ['TF1'], ['TF1', 'Bouygues'])).toEqual(['TF1'])
  })

  it('retourne la même référence (pas de nouveau tableau) quand rien n’est partagé', () => {
    const other = ['Bouygues']
    expect(removeNewlySharedLabels(other, [], ['TF1'])).toBe(other)
  })

  it('liste opposée vide → reste vide', () => {
    expect(removeNewlySharedLabels([], [], ['TF1'])).toEqual([])
  })
})
