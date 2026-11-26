import { describe, expect, it } from 'vitest'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'
import { contactLifecycleState } from './contactLifecycle'

function contact(overrides: Partial<GlobalContact>): GlobalContact {
  return {
    id: 'c-1',
    account_id: 'a-1',
    full_name: 'Jean Dupont',
    title: 'DSI',
    entity: 'SG',
    decision_role: 'technical',
    email: 'jean@sg.com',
    phone: null,
    linkedin_url: null,
    company_name: 'Société Générale',
    user_status: 'contacted',
    ...overrides,
  } as GlobalContact
}

describe('contactLifecycleState (listing row → canonical state)', () => {
  it('maps a fully-identified, reachable, roled contact to actionnable', () => {
    expect(contactLifecycleState(contact({}))).toBe('actionnable')
  })

  it('a prénom-seul WITH an email is enrichi, never actionnable (Théo P0)', () => {
    expect(contactLifecycleState(contact({ full_name: 'Jean', title: null, entity: null, linkedin_url: null }))).toBe(
      'enrichi',
    )
  })

  it('a full name + anchor but no role/coordinates is identité vérifiée', () => {
    expect(contactLifecycleState(contact({ decision_role: null, email: null, phone: null, linkedin_url: null }))).toBe(
      'identite_verifiee',
    )
  })

  it('a bare first name with no channel is détecté', () => {
    expect(
      contactLifecycleState(
        contact({ full_name: 'Jean', title: null, entity: null, decision_role: null, email: null }),
      ),
    ).toBe('detecte')
  })
})
