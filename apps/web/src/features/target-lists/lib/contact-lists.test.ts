import type { TargetList } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { listAudience, splitContactLists } from './contact-lists'

const list = (over: Partial<TargetList>): TargetList =>
  ({ id: 'l', status: 'in_progress', type: null, ...over }) as TargetList

describe('Théo B c2-mes-listes.A1 — le sélecteur Contacts / Comptes', () => {
  it('une liste de contacts, ou sans élément, va sous « Contacts »', () => {
    expect(listAudience(list({ type: 'contacts' }))).toBe('contacts')
    expect(listAudience(list({ type: null }))).toBe('contacts')
  })

  it('une liste de comptes, ou mixte, va sous « Comptes » (le compte porte le contact)', () => {
    expect(listAudience(list({ type: 'accounts' }))).toBe('accounts')
    expect(listAudience(list({ type: 'mixed' }))).toBe('accounts')
  })

  it('range les listes par audience, les archivées à part, sans en perdre', () => {
    const lists = [
      list({ id: 'a', type: 'contacts' }),
      list({ id: 'b', type: 'accounts' }),
      list({ id: 'c', type: 'contacts', status: 'archived' }),
      list({ id: 'd', type: 'mixed', status: 'done' }),
    ]
    const split = splitContactLists(lists)
    expect(split.contacts.active.map(l => l.id)).toEqual(['a'])
    expect(split.contacts.archived.map(l => l.id)).toEqual(['c'])
    expect(split.accounts.active.map(l => l.id)).toEqual(['b', 'd'])
    expect(split.accounts.archived).toEqual([])
  })
})
