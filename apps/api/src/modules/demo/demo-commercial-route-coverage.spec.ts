import { DEMO_COMMERCIAL_ROUTE_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS, DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER } from './demo-dataset'

/**
 * #2959 (recette prod 02/10) — « badge Partenaire déclaré présent, aucune Route
 * visible » : la salle sème une route calculée, sur un compte qui porte
 * réellement un partenaire déclaré. Sait dire NON : retirer la route, ou la
 * poser sur un compte sans partenaire, fait rougir la garde.
 */
describe('#2959 — la route commerciale calculée se voit en démo', () => {
  const route = (name: string) =>
    DEMO_DOSSIERS.find(dossier => dossier.account.company_name === name)?.account.raw_analysis['recommendedRoute'] as
      Record<string, string> | undefined

  it('est classée seedée', () => {
    expect(DEMO_COMMERCIAL_ROUTE_COVERAGE.state).toBe('seede')
  })

  it('le compte au partenaire déclaré porte la route « partenaire » complète', () => {
    const seeded = route(DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER.accountName)
    expect(seeded?.['route']).toBe('partenaire')
    for (const key of [
      'label',
      'rationale',
      'first_door',
      'info_to_obtain',
      'proof',
      'next_contact',
      'passage_condition',
      'fallback_plan',
      'discouraged_route',
    ]) {
      expect(seeded?.[key]).toBeTruthy()
    }
  })

  it('aucune route « partenaire » sur un compte sans partenaire déclaré (jamais inventée)', () => {
    const withRoute = DEMO_DOSSIERS.filter(
      dossier => (dossier.account.raw_analysis['recommendedRoute'] as { route?: string } | undefined)?.route,
    ).map(dossier => dossier.account.company_name)
    expect(withRoute).toEqual([DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER.accountName])
  })
})
