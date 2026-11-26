import { describe, expect, it } from 'vitest'
import { prefillCompanySchema } from './onboarding.js'

/**
 * #2015.3, #2015.5, #2015.8 — la carte de confirmation d'entreprise ne portait
 * qu'un seul nom mélangé (raison sociale OU nom commercial selon ce qui était
 * disponible), aucun pays, aucun statut d'activité. Les trois rejoignent le
 * contrat en ADDITIF, `nullable().default(null)` (même patron que `naf_code`,
 * `as_of`) : un producteur IA antérieur à ce contrat continue de parser, et
 * l'absence reste `null` — jamais une valeur devinée.
 */
describe('prefillCompanySchema — #2015.3 raison sociale et nom commercial distincts', () => {
  it('accepte une réponse SANS `legal_name`/`commercial_name` (producteur IA actuel) et les rend `null`', () => {
    const parsed = prefillCompanySchema.parse({
      name: 'Acme',
      siren: '123456789',
      city: 'Paris',
      naf_label: null,
      is_esn_naf: null,
      website: null,
      headcount_label: null,
    })
    expect(parsed.legal_name).toBeNull()
    expect(parsed.commercial_name).toBeNull()
  })

  it('porte les deux noms quand ils diffèrent', () => {
    const parsed = prefillCompanySchema.parse({
      name: 'Acme',
      legal_name: 'ACME FRANCE SAS',
      commercial_name: 'Acme',
      siren: '123456789',
      city: 'Paris',
      naf_label: null,
      is_esn_naf: null,
      website: null,
      headcount_label: null,
    })
    expect(parsed.legal_name).toBe('ACME FRANCE SAS')
    expect(parsed.commercial_name).toBe('Acme')
  })
})

describe('prefillCompanySchema — #2015.5 le pays du siège', () => {
  it('sans `country` (producteur IA actuel), reste `null` — jamais "France" deviné', () => {
    const parsed = prefillCompanySchema.parse({
      name: 'Acme',
      siren: '123456789',
      city: 'Paris',
      naf_label: null,
      is_esn_naf: null,
      website: null,
      headcount_label: null,
    })
    expect(parsed.country).toBeNull()
  })

  it('porte le pays quand la source le fournit', () => {
    const parsed = prefillCompanySchema.parse({
      name: 'Acme',
      siren: '123456789',
      city: 'Paris',
      country: 'France',
      naf_label: null,
      is_esn_naf: null,
      website: null,
      headcount_label: null,
    })
    expect(parsed.country).toBe('France')
  })
})

describe("prefillCompanySchema — #2015.8 le statut d'activité, tri-état", () => {
  it('sans `is_active` (aucune donnée Pappers), reste `null` — jamais "active" deviné', () => {
    const parsed = prefillCompanySchema.parse({
      name: 'Acme',
      siren: '123456789',
      city: 'Paris',
      naf_label: null,
      is_esn_naf: null,
      website: null,
      headcount_label: null,
    })
    expect(parsed.is_active).toBeNull()
  })

  it("porte `false` quand le registre dit l'entreprise cessée — un booléen explicite, pas un silence", () => {
    const parsed = prefillCompanySchema.parse({
      name: 'Acme',
      siren: '123456789',
      city: 'Paris',
      is_active: false,
      naf_label: null,
      is_esn_naf: null,
      website: null,
      headcount_label: null,
    })
    expect(parsed.is_active).toBe(false)
  })
})

/**
 * #2086.25 — DÉCISION Louis 17/09 : groupe/filiale + pays s'affichent APRÈS
 * confirmation de l'entreprise (`MatchConfirmation`, jamais sur la liste
 * d'homonymes — `prefillCandidateSchema` n'a pas ce champ). `null` = aucun
 * lien capitalistique trouvé (ou aucun Pappers) — jamais un groupe inventé
 * sur un silence, même patron que `country`/`is_active` ci-dessus.
 */
describe('prefillCompanySchema — #2086.25 groupe ou filiale', () => {
  it('sans `group` (producteur IA antérieur à ce contrat), reste `null`', () => {
    const parsed = prefillCompanySchema.parse({
      name: 'Acme',
      siren: '123456789',
      city: 'Paris',
      naf_label: null,
      is_esn_naf: null,
      website: null,
      headcount_label: null,
    })
    expect(parsed.group).toBeNull()
  })

  it('porte les sociétés mères ET le nombre de filiales quand la cartographie les fournit', () => {
    const parsed = prefillCompanySchema.parse({
      name: 'Kicklox',
      siren: '810669754',
      city: 'Paris',
      naf_label: null,
      is_esn_naf: null,
      website: null,
      headcount_label: null,
      group: { parentCompanies: ['ALPHABET HOLDINGS'], subsidiaryCount: 2 },
    })
    expect(parsed.group).toEqual({ parentCompanies: ['ALPHABET HOLDINGS'], subsidiaryCount: 2 })
  })
})
