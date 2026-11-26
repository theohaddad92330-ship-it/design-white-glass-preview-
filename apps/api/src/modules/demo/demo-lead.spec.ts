import { DEMO_LEAD_JOB_TITLES, isProfessionalEmail, normalizeEmail } from './demo-lead'

// #2705.3 — la validation de l'adresse professionnelle, PURE : réutilise la
// liste FERMÉE de domaines personnels qui existe déjà (`activity-linking.ts`,
// GA-26 — un réglage vit à un seul endroit). Ce test sait dire NON : casser
// `isProfessionalEmail` pour qu'elle accepte tout ferait passer ces mêmes cas
// au vert, donc il prouve qu'elle refuse vraiment.
describe('isProfessionalEmail', () => {
  it('refuse une adresse personnelle connue (gmail.com)', () => {
    expect(isProfessionalEmail('prospect@gmail.com')).toBe(false)
  })

  it('refuse une adresse personnelle connue (hotmail.fr)', () => {
    expect(isProfessionalEmail('prospect@hotmail.fr')).toBe(false)
  })

  it('accepte une adresse professionnelle', () => {
    expect(isProfessionalEmail('marie.dupont@acme.fr')).toBe(true)
  })

  it('refuse une adresse illisible', () => {
    expect(isProfessionalEmail('pas-une-adresse')).toBe(false)
  })

  it('est insensible à la casse du domaine', () => {
    expect(isProfessionalEmail('prospect@GMAIL.COM')).toBe(false)
  })
})

// #2705.4 — « Aucun doublon : une ligne par e-mail normalisé (trim + minuscules) ».
describe('normalizeEmail', () => {
  it('met en minuscules et retire les espaces', () => {
    expect(normalizeEmail('  Marie.DUPONT@Acme.fr  ')).toBe('marie.dupont@acme.fr')
  })
})

describe('DEMO_LEAD_JOB_TITLES', () => {
  it('porte les sept valeurs fermées de la liste « Fonction »', () => {
    expect(DEMO_LEAD_JOB_TITLES).toHaveLength(7)
  })
})
