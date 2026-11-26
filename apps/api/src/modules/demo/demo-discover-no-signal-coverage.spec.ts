import { demoDiscoverResponse } from './demo-scripts'

/**
 * #3819.4 — recette prod 09/10 : « sélectionné sur le profil, aucun signal
 * mesuré » restait absent du tirage démo. Deux causes combinées, prouvées
 * par `git grep` du tirage scripté :
 *  - aucun candidat NON EXCLU ne portait `signals: []` (le seul autre,
 *    Roggeman, est écarté par le conseil de qualification avant l'écran) ;
 *  - `signalsSearched` était DÉRIVÉ de `signals.length > 0` (`demo-scripts.ts`),
 *    donc retombait sur `false` dès qu'une recherche simulée ne trouvait
 *    rien — la même confusion que la doctrine « non mesuré ≠ 0 » interdit.
 *
 * Lit la VRAIE réponse scriptée (sans `.parse` — `signalsSearched` voyage
 * hors contrat, comme les autres champs d'extraction).
 */
type RawCandidate = { name: string; signals: unknown[]; signalsSearched?: boolean; qualification?: { verdict: string } }

const defaultView = () => (demoDiscoverResponse({}) as { candidates: RawCandidate[] }).candidates

describe('#3819.4 — « aucun signal mesuré » reproductible dans la salle démo', () => {
  it('la VUE PAR DÉFAUT porte un candidat NON EXCLU, cherché, sans aucun signal', () => {
    const candidate = defaultView().find(c => c.signals.length === 0 && c.qualification?.verdict !== 'excluded')
    expect(candidate).toBeDefined()
    expect(candidate?.signalsSearched).toBe(true)
  })

  it('une recherche qui ne trouve rien reste DISTINCTE d’un candidat jamais interrogé', () => {
    // Roggeman : `signals: []` mais ÉCARTÉ avant toute recherche simulée.
    const excluded = defaultView().find(c => c.qualification?.verdict === 'excluded')
    expect(excluded?.signals).toEqual([])
    expect(excluded?.signalsSearched).toBe(false)
  })
})
