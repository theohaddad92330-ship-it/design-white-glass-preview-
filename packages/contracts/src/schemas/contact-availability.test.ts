import { describe, expect, it } from 'vitest'
import {
  CONTACT_AVAILABILITIES,
  availabilityFromSourceFlag,
  availabilityAfterSearch,
  coordinateDisplay,
  contactEnrichActionIsPrimary,
} from './contact-availability.js'

const AT = '2026-10-07T10:00:00.000Z'

describe('R22 a4 — disponibilité annoncée par la source', () => {
  it('trois valeurs et pas une de plus', () => {
    expect([...CONTACT_AVAILABILITIES]).toEqual(['available', 'unknown', 'not_found'])
  })

  it('un drapeau « existe » vrai donne available ; faux ou absent donne unknown (jamais not_found)', () => {
    expect(availabilityFromSourceFlag(true)).toBe('available')
    expect(availabilityFromSourceFlag(false)).toBe('unknown')
    expect(availabilityFromSourceFlag(undefined)).toBe('unknown')
  })

  it('après une recherche : introuvable seulement si une source a répondu « rien »', () => {
    expect(availabilityAfterSearch('available', 'not_found')).toBe('not_found')
    expect(availabilityAfterSearch('available', 'unknown')).toBe('available')
    expect(availabilityAfterSearch('unknown', 'pending')).toBe('unknown')
    expect(availabilityAfterSearch(null, 'found')).toBe('available')
  })
})

describe('R22 a4 — ce que la cellule Coordonnées affiche, par champ', () => {
  const base = {
    email: null,
    phone: null,
    email_availability: null,
    phone_availability: null,
    enrichment_coordinates: null,
  }

  it('connu → en clair, inchangé', () => {
    expect(coordinateDisplay({ ...base, email: 'a@b.fr' }, 'email')).toEqual({ kind: 'known', value: 'a@b.fr' })
  })

  it('une chaîne blanche est une absence', () => {
    expect(coordinateDisplay({ ...base, email: '  ' }, 'email').kind).toBe('never_searched')
  })

  it('absent mais annoncé → available', () => {
    expect(coordinateDisplay({ ...base, phone_availability: 'available' }, 'phone')).toEqual({ kind: 'available' })
  })

  it('absent, jamais cherché → never_searched', () => {
    expect(coordinateDisplay(base, 'email')).toEqual({ kind: 'never_searched' })
  })

  it('cherché sans résultat → not_found avec la date', () => {
    expect(
      coordinateDisplay(
        { ...base, enrichment_coordinates: { email: { state: 'not_found', sources_queried: 2, at: AT } } },
        'email',
      ),
    ).toEqual({ kind: 'not_found', at: AT })
  })

  it('introuvable gagne sur annoncé quand la recherche est postérieure', () => {
    expect(
      coordinateDisplay(
        {
          ...base,
          email_availability: 'not_found',
          enrichment_coordinates: { email: { state: 'not_found', sources_queried: 1, at: AT } },
        },
        'email',
      ).kind,
    ).toBe('not_found')
  })

  it('en attente et panne restent distincts de « introuvable »', () => {
    expect(
      coordinateDisplay(
        { ...base, enrichment_coordinates: { phone: { state: 'pending', sources_queried: 0, at: AT } } },
        'phone',
      ).kind,
    ).toBe('pending')
    expect(
      coordinateDisplay(
        { ...base, enrichment_coordinates: { phone: { state: 'unknown', sources_queried: 0, at: AT } } },
        'phone',
      ).kind,
    ).toBe('error')
  })

  it('un not_found seul sans date de tentative reste dit sans date inventée', () => {
    expect(coordinateDisplay({ ...base, email_availability: 'not_found' }, 'email')).toEqual({
      kind: 'not_found',
      at: null,
    })
  })
})

describe('R22 a4 — « Contacter » devient « Enrichir »', () => {
  it('ni e-mail ni téléphone → Enrichir', () => {
    expect(contactEnrichActionIsPrimary({ email: null, phone: '' })).toBe(true)
  })
  it('au moins une coordonnée → Contacter', () => {
    expect(contactEnrichActionIsPrimary({ email: 'a@b.fr', phone: null })).toBe(false)
    expect(contactEnrichActionIsPrimary({ email: null, phone: '+33 1' })).toBe(false)
  })
})
