import { buildSkillProof, type SkillProofInput } from './skill-proof'

const BASE: SkillProofInput = {
  experienceLinked: false,
  sourceProject: null,
  experienceEntreprise: null,
  experienceRole: null,
  experienceClientMasked: false,
  certification: false,
  validatedLevel: null,
  clientFeedback: null,
}

describe('buildSkillProof (#2328.25)', () => {
  it('rend `null` sans aucune preuve — jamais une preuve inventée', () => {
    expect(buildSkillProof(BASE)).toBeNull()
  })

  it('cite le projet ET l’entreprise — la preuve la plus forte', () => {
    expect(
      buildSkillProof({
        ...BASE,
        experienceLinked: true,
        sourceProject: 'Migration cloud',
        experienceEntreprise: 'Acme SSII',
      }),
    ).toBe('projet « Migration cloud » chez Acme SSII')
  })

  it('cite le projet et le rôle quand le client n’est pas nommé', () => {
    expect(
      buildSkillProof({
        ...BASE,
        experienceLinked: true,
        sourceProject: 'Migration cloud',
        experienceRole: 'Tech Lead',
      }),
    ).toBe('projet « Migration cloud » — Tech Lead')
  })

  it('cite l’entreprise sans projet nommé', () => {
    expect(buildSkillProof({ ...BASE, experienceLinked: true, experienceEntreprise: 'Acme SSII' })).toBe(
      'mission chez Acme SSII',
    )
  })

  it('dit « client masqué », jamais un nom inventé (#2328.23)', () => {
    expect(
      buildSkillProof({
        ...BASE,
        experienceLinked: true,
        sourceProject: 'Migration cloud',
        experienceClientMasked: true,
        experienceEntreprise: null,
      }),
    ).toBe('projet « Migration cloud » chez client masqué')
  })

  it('lié mais sans rien de nommable — le lien se dit, sans preuve plus faible', () => {
    expect(buildSkillProof({ ...BASE, experienceLinked: true })).toBe('expérience source citée')
  })

  it('retombe sur la certification sans expérience source', () => {
    expect(buildSkillProof({ ...BASE, certification: true })).toBe('certification')
  })

  it('retombe sur le niveau validé sans certification ni expérience', () => {
    expect(buildSkillProof({ ...BASE, validatedLevel: 'expert' })).toBe('niveau validé')
  })

  it('retombe sur le retour client, en dernier recours', () => {
    expect(buildSkillProof({ ...BASE, clientFeedback: 'Autonome, a tenu le planning.' })).toBe(
      'retour client : « Autonome, a tenu le planning. »',
    )
  })

  it('tronque un retour client trop long — une preuve courte, pas un extrait', () => {
    const long = 'x'.repeat(120)
    const proof = buildSkillProof({ ...BASE, clientFeedback: long })
    expect(proof).toBe(`retour client : « ${'x'.repeat(80)}… »`)
  })

  it('l’expérience source l’emporte sur la certification', () => {
    expect(
      buildSkillProof({ ...BASE, experienceLinked: true, experienceEntreprise: 'Acme SSII', certification: true }),
    ).toBe('mission chez Acme SSII')
  })
})
