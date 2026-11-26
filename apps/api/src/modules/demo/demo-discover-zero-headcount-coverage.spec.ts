import { demoDiscoverResponse } from './demo-scripts'

/**
 * #3814.3 — recette prod 09/10 : le cas « 0 salarié classé en fin de liste,
 * jamais devant un compte à effectif réellement mesuré » (ARCHEOS, en prod)
 * restait « non démontrable » dans la salle démo — aucun candidat scripté
 * ne portait cette tranche exacte. Lit la VRAIE réponse scriptée (sans
 * `.parse` — `headcountRange` voyage tel quel jusqu'à l'écran).
 */
type RawCandidate = { name: string; headcountRange: string | null }

const defaultView = () => (demoDiscoverResponse({}) as { candidates: RawCandidate[] }).candidates

// R24-FIX-B (15/10) — SUPPLANTE #3814.3 : la salle démo ne montre plus de holding factice à « 0 salarié » (décision
// Louis 04/10 : de vraies entreprises ; GA-18 / GA-19 : une absence n'est jamais « 0 »). Le contraste « mesuré /
// non publié » reste observable : une tranche réelle d'un côté, `null` (aucune ligne) de l'autre.
describe('R24-FIX-B — la vue par défaut de la salle démo ne dit jamais « 0 salarié »', () => {
  it('aucune carte ne porte « 0 salarié » : effectif réel ou absent', () => {
    for (const candidate of defaultView()) {
      expect(candidate.headcountRange ?? '').not.toMatch(/^0 /)
    }
  })

  it('porte un compte à effectif mesuré ET un compte à effectif non publié, pour que le contraste soit observable', () => {
    const headcounts = defaultView().map(c => c.headcountRange)
    expect(headcounts.some(label => /\d/.test(label ?? ''))).toBe(true)
    expect(headcounts.some(label => label === null)).toBe(true)
  })
})
