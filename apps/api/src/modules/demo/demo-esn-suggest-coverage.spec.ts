import { ESN_DIRECTORY_SEED } from '../esn-directory/esn-seed-names'
import { esnSuggestNeedle, rankEsnSuggestions } from '../esn-directory/esn-name-suggest'
import { normalizeEsnName } from '../esn-directory/esn-normalize'
import { DEMO_ESN_SUGGEST_COVERAGE } from './demo-coverage'

/**
 * #1887 — LA PARITÉ DÉMO DE LA SUGGESTION D'ESN (craft rule n°9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE RECOMPTE, ET POURQUOI ELLE NE CROIT PAS LA PROSE
 * ─────────────────────────────────────────────────────────────────────────────
 * `demo-coverage.spec.ts` garde les tables SCOPÉES. `esn_directory` n'en est
 * pas une : aucun `workspace_id`, jamais purgée, partagée entre tous les
 * espaces — la garde de parité est AVEUGLE à ce qui s'y trouve, et ne peut
 * produire aucun rouge. C'est le point où une capacité arrive vide en réunion
 * sans que rien ne l'annonce.
 *
 * Cette garde rejoue donc le geste sur la GRAINE réelle (`ESN_DIRECTORY_SEED`,
 * la source du semis de `ensureSeeded`) et sur la VRAIE fonction de classement
 * — pas sur une liste fabriquée pour le test. Si la graine se vidait, ou si le
 * classement cessait de faire remonter « Capgemini » sur « cap », elle rougit.
 */
const seedRows = ESN_DIRECTORY_SEED.map(entry => ({
  inputName: entry.name,
  normalizedName: normalizeEsnName(entry.name),
  siren: null,
  headquartersCity: null,
  headcountRange: null,
  parentName: null,
}))

describe('parité démo — la suggestion d’ESN (onglet Partenaires)', () => {
  it('LIT une graine réelle — sinon tout ce qui suit serait vrai par vacuité', () => {
    expect(seedRows.length).toBeGreaterThanOrEqual(400)
    expect(seedRows.every(row => row.normalizedName.length > 0)).toBe(true)
  })

  it('« cap » propose Capgemini EN PREMIER, sur la graine que la salle voit', () => {
    const suggestions = rankEsnSuggestions(seedRows, esnSuggestNeedle('cap'), 6)

    expect(suggestions[0]?.name).toBe('Capgemini')
    expect(suggestions.length).toBeGreaterThan(1)
  })

  it('la suggestion marche sur une saisie ACCENTUÉE — la démonstration se tape vite', () => {
    expect(rankEsnSuggestions(seedRows, esnSuggestNeedle('Capgémini'), 6)[0]?.name).toBe('Capgemini')
  })

  it('ne propose RIEN sur une frappe qui ne correspond à aucune ESN de la graine', () => {
    // L'état vide de la salle est le même que celui d'un client : honnête.
    expect(rankEsnSuggestions(seedRows, esnSuggestNeedle('zzzzqx'), 6)).toEqual([])
  })

  it('reste classée SEEDÉE, avec sa raison écrite', () => {
    expect(DEMO_ESN_SUGGEST_COVERAGE.state).toBe('seede')
    expect(DEMO_ESN_SUGGEST_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
