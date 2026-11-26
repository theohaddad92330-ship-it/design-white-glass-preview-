import { describe, expect, it } from 'vitest'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'
import { contactRowAction } from './contactRowAction'

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

describe('contactRowAction (Théo P0 identity gate)', () => {
  it('a prénom-seul contact WITH an email is blocked as "identity", not messaged', () => {
    expect(contactRowAction(contact({ full_name: 'Jean', title: null, entity: null, linkedin_url: null }))).toBe(
      'identity',
    )
  })

  it('no email → enrich first, even if the identity is incomplete', () => {
    expect(contactRowAction(contact({ full_name: 'Jean', email: null }))).toBe('enrich')
  })

  it('a fully-identified freshly-detected contact → generate', () => {
    expect(contactRowAction(contact({ user_status: 'new' }))).toBe('generate')
  })

  it('a fully-identified already-engaged contact → contact', () => {
    expect(contactRowAction(contact({ user_status: 'contacted' }))).toBe('contact')
  })
})
