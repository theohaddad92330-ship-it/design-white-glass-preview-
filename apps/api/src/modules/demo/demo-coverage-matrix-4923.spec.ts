import { BUYER_ROLE_FAMILIES } from '@bellum/contracts'
import { resolveFamily, resolveLevel } from '../coverage-gaps/coverage.service'
import { DEMO_COVERAGE_MATRIX_ROLE_SEARCH_COVERAGE, DEMO_WEB_ROLE_SEARCH_PROVENANCE_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #4923.16 (craft rule n°9) — ce que la salle MONTRE de la matrice famille × niveau et de la
 * provenance `web_role_search`, exécuté sur le jeu réel (jamais une relecture du commentaire).
 */
describe('démo — matrice famille × niveau et gestes « Chercher ce rôle » (#4923.12/.16)', () => {
  const targets = BUYER_ROLE_FAMILIES.filter(f => f.isTarget).map(f => f.key)

  function cellsOf(company: string): Set<string> {
    const dossier = DEMO_DOSSIERS.find(d => d.account.company_name === company)
    if (!dossier) throw new Error(`dossier ${company} absent du jeu de démo`)
    const cells = new Set<string>()
    for (const c of dossier.contacts ?? []) {
      const family = resolveFamily({ family: c.family ?? null, title: c.title ?? null })
      const level = resolveLevel({
        seniority: c.seniority ?? null,
        title: c.title ?? null,
        // Le jeu de démo ne porte pas de périmètre par contact : absent, jamais inventé.
        scope: null,
        family: c.family ?? null,
        decision_role: c.decision_role ?? null,
      })
      if (family && level) cells.add(`${family}:${level}`)
    }
    return cells
  }

  it('la matrice est classée SEMÉE : elle se lit sur des colonnes de contacts déjà semées', () => {
    expect(DEMO_COVERAGE_MATRIX_ROLE_SEARCH_COVERAGE.state).toBe('seede')
  })

  it('la salle montre au moins une case couverte ET au moins une case vide d’une famille cible', () => {
    const cells = cellsOf('Société Générale')
    expect(cells.size).toBeGreaterThan(0)
    const targetCells = [...cells].filter(cell => (targets as readonly string[]).includes(cell.split(':')[0]))
    expect(targetCells.length).toBeGreaterThan(0)
    // Une case vide = une famille cible × un niveau sans contact : c'est là que « Chercher ce rôle » apparaît.
    expect(targetCells.length).toBeLessThan(targets.length * 3)
  })

  it('la provenance `web_role_search` est VIDE À DESSEIN, avec sa raison', () => {
    expect(DEMO_WEB_ROLE_SEARCH_PROVENANCE_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_WEB_ROLE_SEARCH_PROVENANCE_COVERAGE.reason).toContain('web_role_search')
    expect(DEMO_WEB_ROLE_SEARCH_PROVENANCE_COVERAGE.reason).toMatch(/jamais nomm/i)
  })
})
