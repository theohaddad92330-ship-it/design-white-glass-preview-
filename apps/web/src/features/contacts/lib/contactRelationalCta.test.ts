import { describe, expect, it } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { contactRelationalCta } from './contactRelationalCta'

function contact(overrides: Partial<Contact>): Contact {
  return {
    id: 'c-1',
    account_id: 'a-1',
    full_name: 'Jean Dupont',
    title: 'DSI',
    entity: 'SG',
    decision_role: 'technical',
    priority: 1,
    email: 'jean@sg.com',
    email_verified: false,
    phone: null,
    linkedin_url: null,
    profile_summary: null,
    why_contact: null,
    email_message: null,
    linkedin_message: null,
    phone_script: null,
    followup_message: null,
    user_status: 'new',
    source: null,
    lifecycle_state: null,
    ...overrides,
  } as Contact
}

// #2160.15/.16/.17/.19 — un CTA contextuel selon l'état relationnel déjà
// calculé (`user_status`, `lifecycle_state`), jamais un état recalculé ici.
describe('contactRelationalCta', () => {
  it('#2160.15 — jamais travaillé, identité complète → « Préparer la première approche »', () => {
    expect(contactRelationalCta(contact({ user_status: 'new' }))).toEqual({
      key: 'first_approach',
      scrollTargetId: null,
    })
  })

  it('#2160.15 — jamais travaillé mais identité INCOMPLÈTE → aucun CTA (la génération est déjà bloquée ailleurs)', () => {
    expect(contactRelationalCta(contact({ user_status: 'new', full_name: 'Jean', title: null, entity: null }))).toBe(
      null,
    )
  })

  it('#2160.16 — relation dormante (`silence`) → « Préparer une reprise »', () => {
    expect(contactRelationalCta(contact({ user_status: 'silence' }))).toEqual({
      key: 'reactivation',
      scrollTargetId: null,
    })
  })

  it('#2160.17 — réponse reçue (`replied`) → « Traiter la réponse »', () => {
    expect(contactRelationalCta(contact({ user_status: 'replied' }))).toEqual({
      key: 'handle_reply',
      scrollTargetId: 'contact-timeline',
    })
  })

  it('#2160.19 — emploi à vérifier (`lifecycle_state: historique`) → « Vérifier la situation »', () => {
    expect(contactRelationalCta(contact({ user_status: 'contacted', lifecycle_state: 'historique' }))).toEqual({
      key: 'verify_job_change',
      scrollTargetId: 'contact-apollo-profile',
    })
  })

  it('une réponse reçue prime sur un changement de poste suspecté (répondre ne peut pas attendre)', () => {
    expect(contactRelationalCta(contact({ user_status: 'replied', lifecycle_state: 'historique' }))).toEqual({
      key: 'handle_reply',
      scrollTargetId: 'contact-timeline',
    })
  })

  it('un contact déjà engagé, sans signal particulier (`contacted`/`meeting`) → aucun CTA', () => {
    expect(contactRelationalCta(contact({ user_status: 'contacted' }))).toBe(null)
    expect(contactRelationalCta(contact({ user_status: 'meeting' }))).toBe(null)
  })

  it('un contact refusé (`refused`) → aucun CTA — la doctrine ne relance jamais un refus', () => {
    expect(contactRelationalCta(contact({ user_status: 'refused' }))).toBe(null)
  })
})
