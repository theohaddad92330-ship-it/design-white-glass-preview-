import { discoverResponseSchema } from '@bellum/contracts'
import { DEMO_DISCOVER_OVERVIEW_COVERAGE } from './demo-coverage'
import { DEMO_DELIVERY_CLIENT, DEMO_ESN_PROFILE } from './demo-dataset'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #4493 / #4495 — « et en démonstration, la page Découvrir V22 montre quoi ? »
 *
 * Craft rule n°9 : les pistes lisent le profil d'ESN semé ; les compteurs, la répartition et les cartes lisent
 * la VRAIE réponse scriptée de `/discover/registry` — la vue PAR DÉFAUT de la salle, celle qu'un prospect voit.
 */
const defaultView = () => discoverResponseSchema.parse(demoDiscoverResponse({}))

describe('#4493 / #4495 — la page Découvrir V22, en démonstration', () => {
  it('les trois pistes ont leur source semée : zone, expertise, meilleure référence', () => {
    expect(DEMO_ESN_PROFILE.geo_zones.join(' ')).toMatch(/Île-de-France/)
    const v23 = DEMO_ESN_PROFILE as unknown as { priority_expertise?: string[]; expertise_areas: string[] }
    expect([...(v23.priority_expertise ?? []), ...v23.expertise_areas].length).toBeGreaterThan(0)
    expect(DEMO_DELIVERY_CLIENT.account.is_best_reference).toBe(true)
  })

  it('la répartition a plusieurs secteurs et des tranches d’effectif (jamais une barre d’un seul segment)', () => {
    const parsed = defaultView()
    const sectors = new Set(parsed.candidates.map(c => c.sector).filter(Boolean))
    expect(sectors.size).toBeGreaterThan(2)
    expect(parsed.candidates.filter(c => c.headcountRange).length).toBeGreaterThan(2)
  })

  it('les besoins historiques se comptent dans la vue par défaut (axe référentiel, besoins passés)', () => {
    const parsed = defaultView()
    const historical = parsed.candidates
      .flatMap(c => c.sourceAxes?.axes ?? [])
      .filter(a => a.key === 'dataforge' && a.label_key.startsWith('reference_needs'))
    expect(historical.length).toBeGreaterThan(0)
  })

  it('les cartes ont un sujet daté et des étiquettes d’expertise', () => {
    // `technologies` voyage BRUT (lu par la normalisation du web, `discover-normalize.ts`) : la réponse non parsée.
    const raw = demoDiscoverResponse({}) as unknown as {
      candidates: { signals: { label: string; date: string; technologies?: string[] }[] }[]
    }
    const signals = raw.candidates.flatMap(c => c.signals)
    expect(signals.filter(signal => signal.label && signal.date).length).toBeGreaterThan(0)
    expect(signals.some(signal => (signal.technologies ?? []).length > 0)).toBe(true)
  })

  it('classe la capacité « seedée », avec le numéro du chantier et son appelant', () => {
    expect(DEMO_DISCOVER_OVERVIEW_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_OVERVIEW_COVERAGE.reason).toContain('#4493')
    expect(DEMO_DISCOVER_OVERVIEW_COVERAGE.reason).toContain('demo-discover-overview-coverage.spec.ts')
  })
})
