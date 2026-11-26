import { describe, expect, it } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { filterContacts } from '@/features/accounts/view/account-detail/tabs/contacts/contactGrouping'
import { type AccountNeeds, filterAccountNeeds } from './needs'

// #4400.1 — la recherche texte locale lit le même normaliseur que Découvrir (packages/contracts).
const entry = (label: string, companyName = 'Acme'): AccountNeeds => ({
  accountId: 'a1',
  companyName,
  sector: null,
  score: null,
  updatedAt: null,
  topUrgency: 'medium',
  offers: [],
  needs: [{ id: 'n1', kind: 'pain', label, detail: null, offer: null, timeframe: null, urgency: 'medium' }],
})

describe('filterAccountNeeds — #4400.1 recherche souple', () => {
  it('« archi cyber » trouve « Architecte Cybersécurité »', () => {
    expect(filterAccountNeeds([entry('Architecte Cybersécurité')], 'all', 'archi cyber')).toHaveLength(1)
  })
  it('« archi cyber » ne trouve pas « Chargé d’archives » (ET)', () => {
    expect(filterAccountNeeds([entry('Chargé d’archives')], 'all', 'archi cyber')).toHaveLength(0)
  })
})

describe('filterContacts — #4400.1 recherche souple', () => {
  const contact = (full_name: string, title: string) => ({ full_name, title }) as unknown as Contact
  const noFilters = { role: 'all', entity: 'all', level: 'all' } as Parameters<typeof filterContacts>[2]
  const run = (c: Contact, q: string) => filterContacts([c], q, noFilters, () => null)
  it('« dev java » trouve « Développeur Java »', () => {
    expect(run(contact('Alice Martin', 'Développeur Java'), 'dev java')).toHaveLength(1)
  })
  it('« dev java » ne trouve pas « Développeur Python »', () => {
    expect(run(contact('Alice Martin', 'Développeur Python'), 'dev java')).toHaveLength(0)
  })
  it('un nom partiel reste trouvable', () => {
    expect(run(contact('Alice Martin', 'DSI'), 'alic mart')).toHaveLength(1)
  })
})
