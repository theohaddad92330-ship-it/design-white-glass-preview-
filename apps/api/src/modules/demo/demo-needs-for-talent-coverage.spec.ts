import { DEMO_NEEDS_FOR_TALENT_COVERAGE } from './demo-coverage'
import { DEMO_CONSULTANTS, DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * LOT X05 (08/10) — « quels besoins compatibles avec ce consultant ? » est REMPLIE en
 * démonstration (craft rule n°9).
 *
 * N'ajoute ni table ni clé de `raw_analysis` : le même besoin phare et le même consultant que
 * `run_matching` (PDF 4) suffisent, direction inverse — profil → besoins plutôt que besoin → profils.
 * Cette garde relit le JEU avec une vérification simple (le recoupement RÉEL des compétences
 * obligatoires), et tombe le jour où le semis cesse de couvrir cette capacité.
 */
describe('#3865.2 — « besoins compatibles avec ce consultant » en démonstration', () => {
  const camille = DEMO_CONSULTANTS.find(consultant => consultant.full_name === 'Camille Roussel')
  const flagship = DEMO_DELIVERY_CLIENT.openNeeds.find(
    need => need.title === 'Ingénieur infrastructure — socle conteneurisé du portail',
  )

  it('le besoin phare est encore OUVERT, sinon le matching inverse ne le verrait jamais', () => {
    expect(flagship).toBeDefined()
    expect(flagship!.status).not.toBe('won')
    expect(flagship!.status).not.toBe('lost')
    expect(flagship!.status).not.toBe('abandoned')
  })

  it('la fiche de Camille Roussel porte RÉELLEMENT les deux compétences OBLIGATOIRES du besoin phare', () => {
    expect(camille).toBeDefined()
    expect(flagship).toBeDefined()
    const requiredTerms = flagship!.skills.filter(skill => skill.required).map(skill => skill.term)
    expect(requiredTerms.length).toBeGreaterThan(0)
    // Même discipline que `demandFromSnapshot` (`reverse-market.ts`) : un terme normalisé, jamais
    // un simple `includes` qui attraperait un préfixe partiel.
    const stackFold = camille!.stack.map(term => term.toLowerCase())
    for (const term of requiredTerms) {
      expect(stackFold).toContain(term.toLowerCase())
    }
  })

  it('la capacité est classée « seedée », avec sa raison', () => {
    expect(DEMO_NEEDS_FOR_TALENT_COVERAGE.state).toBe('seede')
    expect(DEMO_NEEDS_FOR_TALENT_COVERAGE.reason).toContain('Camille Roussel')
    expect(DEMO_NEEDS_FOR_TALENT_COVERAGE.reason).toContain('Kubernetes')
  })
})
