import { describe, expect, it } from 'vitest'
import {
  ENRICHMENT_FORBIDDEN_FIELDS,
  isEnrichmentForbiddenField,
  PHONE_NATURES,
  phoneNatureFromProviderType,
  resolvePhoneNature,
  withoutForbiddenEnrichmentFields,
} from './enrichment-compliance.js'

/**
 * #2297.54 — le catalogue NOMMÉ des champs que l'enrichissement n'écrit jamais.
 * Chaque cas doit savoir dire NON : il rougit si une clé du catalogue survit,
 * et il rougit aussi si le filtre emporte une clé qui n'est pas au catalogue.
 */
describe('ENRICHMENT_FORBIDDEN_FIELDS — #2297.54', () => {
  it('nomme chaque critère protégé de la doctrine (c58), une seule fois', () => {
    const criteria = ENRICHMENT_FORBIDDEN_FIELDS.map(f => f.criterion)
    expect(new Set(criteria).size).toBe(criteria.length)
    expect(criteria).toEqual(
      expect.arrayContaining([
        'age',
        'gender',
        'origin',
        'marital_status',
        'religion',
        'personal_address',
        'personal_phone',
      ]),
    )
    for (const field of ENRICHMENT_FORBIDDEN_FIELDS) {
      expect(field.keys.length).toBeGreaterThan(0)
      expect(field.reason.length).toBeGreaterThan(20)
    }
  })

  it('reconnaît une clé dans les graphies qui traversent le dépôt (snake, camel, casse)', () => {
    for (const key of [
      'birth_date',
      'birthDate',
      'DateOfBirth',
      'gender',
      'Nationality',
      'marital_status',
      'address',
    ]) {
      expect(isEnrichmentForbiddenField(key)).toBe(true)
    }
  })

  // #2297.55 — Laura ne cherche ni ne promet un numéro personnel non autorisé :
  // seul le mobile PROFESSIONNEL (contractuellement disponible) est permis.
  it('#2297.55 — interdit le numéro personnel, jamais le mobile professionnel', () => {
    for (const key of ['personal_phone', 'personalPhone', 'mobile_personnel', 'home_phone', 'personal_mobile']) {
      expect(isEnrichmentForbiddenField(key)).toBe(true)
    }
    // Le mobile PROFESSIONNEL reste permis — c'est #2297.8, pas #2297.55.
    for (const key of ['mobile', 'professional_mobile', 'phone']) {
      expect(isEnrichmentForbiddenField(key)).toBe(false)
    }
    // Ce qui n'est PAS au catalogue passe : un site de travail, un intitulé, une adresse e-mail.
    for (const key of ['city', 'country', 'title', 'email', 'email_address', 'organization_name', 'linkedin_url']) {
      expect(isEnrichmentForbiddenField(key)).toBe(false)
    }
  })
})

describe('withoutForbiddenEnrichmentFields — #2297.54', () => {
  it('retire toute clé du catalogue, à toute profondeur, et garde le reste', () => {
    const payload = {
      email: 'jean@acme.fr',
      gender: 'male',
      birth_date: '1980-01-01',
      city: 'Lyon',
      employment_history: [{ title: 'CTO', organization_name: 'Acme', nationality: 'FR' }],
      nested: { profile: { maritalStatus: 'married', religion: 'x', home_address: '1 rue X' } },
    }
    expect(withoutForbiddenEnrichmentFields(payload)).toEqual({
      email: 'jean@acme.fr',
      city: 'Lyon',
      employment_history: [{ title: 'CTO', organization_name: 'Acme' }],
      nested: { profile: {} },
    })
  })

  it('ne mute jamais l’entrée : c’est une copie', () => {
    const payload = { gender: 'female', email: 'a@b.fr' }
    withoutForbiddenEnrichmentFields(payload)
    expect(payload).toEqual({ gender: 'female', email: 'a@b.fr' })
  })

  it('laisse passer les valeurs non objets telles quelles', () => {
    expect(withoutForbiddenEnrichmentFields(null)).toBeNull()
    expect(withoutForbiddenEnrichmentFields('x')).toBe('x')
    expect(withoutForbiddenEnrichmentFields([1, 2])).toEqual([1, 2])
  })
})

/**
 * #4178.1 — la NATURE d'un numéro : jamais « pro » par déduction.
 */
describe('nature du téléphone — #4178.1', () => {
  it('nomme quatre natures, et « pro vérifié » n’est jamais produit sans preuve fournisseur', () => {
    expect(PHONE_NATURES).toEqual(['professional_verified', 'professional_declared', 'personal', 'unknown'])
    for (const type of ['mobile', 'work_direct', 'work_hq', 'home', 'other', null, undefined, '']) {
      expect(phoneNatureFromProviderType(type)).not.toBe('professional_verified')
    }
  })

  it('un mobile n’est JAMAIS déclaré pro à partir de son type de ligne', () => {
    expect(phoneNatureFromProviderType('mobile')).toBe('unknown')
    expect(phoneNatureFromProviderType('MOBILE')).toBe('unknown')
    expect(phoneNatureFromProviderType('other')).toBe('unknown')
  })

  it('un type de ligne que le fournisseur dit professionnel est « déclaré », un domicile est « personnel »', () => {
    expect(phoneNatureFromProviderType('work_direct')).toBe('professional_declared')
    expect(phoneNatureFromProviderType('work_hq')).toBe('professional_declared')
    expect(phoneNatureFromProviderType('home')).toBe('personal')
  })

  it('sans métadonnée : inconnue (« nature non vérifiée »), jamais pro', () => {
    expect(phoneNatureFromProviderType(null)).toBe('unknown')
    expect(resolvePhoneNature([])).toEqual({ nature: 'unknown', conflicting: [] })
  })

  it('deux sources qui se contredisent ne sont pas masquées : inconnue + les deux natures nommées', () => {
    expect(resolvePhoneNature(['professional_declared', 'personal'])).toEqual({
      nature: 'unknown',
      conflicting: ['professional_declared', 'personal'],
    })
  })

  it('une correction humaine gagne toujours', () => {
    expect(resolvePhoneNature(['personal'], 'professional_declared')).toEqual({
      nature: 'professional_declared',
      conflicting: [],
    })
  })

  it('« inconnue » d’une source ne contredit pas une autre', () => {
    expect(resolvePhoneNature(['unknown', 'professional_declared'])).toEqual({
      nature: 'professional_declared',
      conflicting: [],
    })
  })
})
