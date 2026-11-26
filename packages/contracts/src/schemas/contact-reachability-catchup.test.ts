import { describe, expect, it } from 'vitest'
import {
  CONTACT_REACHABILITY_CATCHUP_CAPABILITY_AT,
  contactReachabilityCatchupOnly,
  isContactReachabilityCatchupConcerned,
} from './contact-reachability-catchup.js'

const BEFORE = '2026-09-01T10:00:00.000Z'
const AFTER = '2026-10-03T10:00:00.000Z'

describe('isContactReachabilityCatchupConcerned — #3549 rattrape l’existant, ciblé', () => {
  it('concerne un contact enrichi AVANT la capacité à qui il manque le téléphone', () => {
    expect(isContactReachabilityCatchupConcerned({ email: 'a@x.fr', phone: null, last_enrichment_at: BEFORE })).toBe(
      true,
    )
  })

  it('ne concerne pas un contact complet : rien à rattraper', () => {
    expect(
      isContactReachabilityCatchupConcerned({ email: 'a@x.fr', phone: '+33600000000', last_enrichment_at: BEFORE }),
    ).toBe(false)
  })

  it('ne concerne pas un contact déjà collecté APRÈS la capacité : le rejeu a eu lieu', () => {
    expect(
      isContactReachabilityCatchupConcerned({
        email: null,
        phone: null,
        last_enrichment_at: AFTER,
        created_at: BEFORE,
      }),
    ).toBe(false)
  })

  it('date un contact jamais enrichi par sa création', () => {
    expect(isContactReachabilityCatchupConcerned({ email: null, phone: null, created_at: BEFORE })).toBe(true)
    expect(isContactReachabilityCatchupConcerned({ email: null, phone: null, created_at: AFTER })).toBe(false)
  })

  it('une chaîne blanche vaut absence', () => {
    expect(isContactReachabilityCatchupConcerned({ email: ' ', phone: '', created_at: BEFORE })).toBe(true)
  })

  it('une date illisible ne concerne personne : jamais de rejeu sur une date qu’on ne lit pas', () => {
    expect(isContactReachabilityCatchupConcerned({ email: null, phone: null, last_enrichment_at: 'nope' })).toBe(false)
    expect(isContactReachabilityCatchupConcerned({ email: null, phone: null })).toBe(false)
  })

  it('la date de capacité est paramétrable (test) et par défaut celle du correctif', () => {
    expect(CONTACT_REACHABILITY_CATCHUP_CAPABILITY_AT).toBe('2026-10-02T12:00:00.000Z')
    expect(
      isContactReachabilityCatchupConcerned(
        { email: null, phone: null, created_at: BEFORE },
        '2026-08-01T00:00:00.000Z',
      ),
    ).toBe(false)
  })
})

describe('contactReachabilityCatchupOnly', () => {
  it('ne demande que la coordonnée qui manque seule', () => {
    expect(contactReachabilityCatchupOnly({ email: 'a@x.fr', phone: null })).toBe('phone')
    expect(contactReachabilityCatchupOnly({ email: null, phone: '+33600000000' })).toBe('email')
  })
  it('demande les deux quand les deux manquent', () => {
    expect(contactReachabilityCatchupOnly({ email: null, phone: null })).toBeNull()
  })
})
