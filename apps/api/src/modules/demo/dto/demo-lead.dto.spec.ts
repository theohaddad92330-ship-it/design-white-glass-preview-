import { demoLeadSchema } from './demo-lead.dto'

// #2705.3/#2705.4 — la porte du formulaire de démo. Ce test sait dire NON :
// une porte qui accepterait `data: req.body` tel quel laisserait passer une
// adresse personnelle ou un champ manquant, exactement ce qu'il vérifie ici.
const VALID = {
  firstName: 'Marie',
  lastName: 'Dupont',
  email: 'marie.dupont@acme.fr',
  jobTitle: 'sales_director',
  company: 'Acme',
}

describe('demoLeadSchema', () => {
  it('accepte un envoi complet et valide', () => {
    expect(demoLeadSchema.safeParse(VALID).success).toBe(true)
  })

  it('accepte le téléphone absent — il reste facultatif', () => {
    expect(demoLeadSchema.safeParse(VALID).success).toBe(true)
    expect(demoLeadSchema.safeParse({ ...VALID, phone: '+33612345678' }).success).toBe(true)
  })

  it('refuse une adresse personnelle, message exact', () => {
    const result = demoLeadSchema.safeParse({ ...VALID, email: 'marie@gmail.com' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'Merci d’utiliser votre adresse e-mail professionnelle, par exemple prenom@entreprise.com.',
      )
    }
  })

  it('refuse une fonction hors liste fermée', () => {
    expect(demoLeadSchema.safeParse({ ...VALID, jobTitle: 'astronaute' }).success).toBe(false)
  })

  for (const field of ['firstName', 'lastName', 'email', 'jobTitle', 'company'] as const) {
    it(`refuse un envoi sans ${field}`, () => {
      const { [field]: _omitted, ...rest } = VALID
      expect(demoLeadSchema.safeParse(rest).success).toBe(false)
    })
  }

  it('accepte les UTM absents (undefined), jamais devinés', () => {
    const result = demoLeadSchema.safeParse(VALID)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.utmSource).toBeUndefined()
    }
  })
})
