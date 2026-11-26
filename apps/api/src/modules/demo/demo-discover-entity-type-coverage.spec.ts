import { DEMO_DISCOVER_ENTITY_TYPE_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #4746.7 — « et en démonstration, le filtre « Clients finaux » dit-il ce qu'il retire ? »
 *
 * La salle rejoue la FORME du vrai chemin (`discover_signals.py`, `coverage.filteredByEntityType`) : avec
 * `entityType=client`, les ESN / intermédiaires / partenaires déclarés SORTENT de la liste (le filtre applique ce
 * qu'il affirme) et le compteur dit combien. Sans le filtre, rien ne sort et il n'y a AUCUN compteur (jamais « 0 »).
 */
type RawCandidate = { name: string; isEsnPeer?: true; isIntermediary?: true; isDeclaredPartner?: true }
type RawResponse = { candidates: RawCandidate[]; coverage?: { filteredByEntityType?: number } }

const run = (filters: Record<string, unknown>) => demoDiscoverResponse(filters) as unknown as RawResponse
const notEndClient = (row: RawCandidate) =>
  row.isEsnPeer === true || row.isIntermediary === true || row.isDeclaredPartner === true

describe('#4746.7 — « Clients finaux » en démonstration', () => {
  it('sans le filtre : les ESN restent et aucun compteur', () => {
    const response = run({ includeOutOfTarget: true })
    expect(response.candidates.some(notEndClient)).toBe(true)
    expect(response.coverage?.filteredByEntityType).toBeUndefined()
  })

  it('avec le filtre : aucune ESN, aucun intermédiaire, aucun partenaire déclaré ne reste', () => {
    const response = run({ includeOutOfTarget: true, entityType: 'client' })
    expect(response.candidates.filter(notEndClient)).toEqual([])
    expect(response.candidates.length).toBeGreaterThan(0)
  })

  it('le compteur dit exactement combien le filtre a retiré', () => {
    const all = run({ includeOutOfTarget: true })
    const removed = all.candidates.filter(notEndClient).length
    const response = run({ includeOutOfTarget: true, entityType: 'client' })
    expect(response.coverage?.filteredByEntityType).toBe(removed)
    expect(response.candidates.length).toBe(all.candidates.length - removed)
  })

  it('les lectures « ESN » et « tous » ne retirent rien (route de rang 2 voulue)', () => {
    const all = run({ includeOutOfTarget: true }).candidates.length
    expect(run({ includeOutOfTarget: true, entityType: 'esn' }).candidates.length).toBe(all)
    expect(run({ includeOutOfTarget: true, entityType: 'all' }).coverage?.filteredByEntityType).toBeUndefined()
  })

  it('classe la capacité « seedée », avec le numéro du chantier', () => {
    expect(DEMO_DISCOVER_ENTITY_TYPE_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_ENTITY_TYPE_COVERAGE.reason).toContain('#4746.7')
    expect(DEMO_DISCOVER_ENTITY_TYPE_COVERAGE.reason).toContain('demo-discover-entity-type-coverage.spec.ts')
  })
})
