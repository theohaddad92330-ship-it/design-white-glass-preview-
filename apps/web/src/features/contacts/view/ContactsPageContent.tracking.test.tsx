import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #1688.2 — LA LISTE DE CONTACTS ÉMET une recherche RÉSOLUE, avec le compte
 * TOTAL du serveur — jamais le texte tapé, jamais `contacts.length` (une
 * PAGE, pas le total).
 */

const h = vi.hoisted(() => ({
  query: '',
  isLoading: false,
  totalContacts: 0 as number | undefined,
}))

vi.mock('@/features/contacts/hooks/useContactsSearchState', () => ({
  useContactsSearchState: () => ({
    query: h.query,
    roleFilter: 'all',
    companyFilter: undefined,
    channelFilter: undefined,
    unassignedFilter: undefined,
    stateFilter: undefined,
    dormantFilter: undefined,
  }),
}))
vi.mock('@/features/contacts/hooks/useContactsFilters', () => ({
  useContactsFilters: () => ({}),
}))
vi.mock('@/features/contacts/hooks/useContactsListData', () => ({
  useContactsListData: () => ({
    contacts: [],
    totalContacts: h.totalContacts,
    lifecycleTally: null,
    lifecycleWeeklyNet: null,
    isLoading: h.isLoading,
    isError: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
  }),
}))
vi.mock('@/features/contacts/hooks/useActiveContactFilters', () => ({
  useActiveContactFilters: () => [],
}))
vi.mock('@/features/contacts/hooks/useContactsNavigation', () => ({
  useContactsNavigation: () => ({
    onQueryChange: vi.fn(),
    onFiltersChange: vi.fn(),
    onAddFilter: vi.fn(),
    onScopeChange: vi.fn(),
    onLifecycleFilterChange: vi.fn(),
    onClearFilters: vi.fn(),
  }),
}))
vi.mock('@/features/contacts/hooks/useContactsLoadMoreRef', () => ({
  useContactsLoadMoreRef: () => ({ current: null }),
}))
vi.mock('./ContactContent', () => ({ ContactContent: () => null }))

const trackSearchPerformed = vi.fn()
vi.mock('@/lib/product-tracker', () => ({
  trackSearchPerformed: (...args: unknown[]) => trackSearchPerformed(...args),
}))

import { ContactsPageContent } from './ContactsPageContent'

describe('#1688.2 — trackSearchPerformed sur /contacts', () => {
  beforeEach(() => {
    h.query = ''
    h.isLoading = false
    h.totalContacts = 0
    trackSearchPerformed.mockClear()
  })

  it('une recherche résolue émet {screen: "/contacts", resultCount: totalContacts SERVEUR}', () => {
    h.query = 'dupont'
    h.totalContacts = 7
    render(<ContactsPageContent />)
    expect(trackSearchPerformed).toHaveBeenCalledTimes(1)
    expect(trackSearchPerformed).toHaveBeenCalledWith('/contacts', 7)
    expect(trackSearchPerformed.mock.calls[0]).not.toContain('dupont')
  })

  it('#1688.2 — LA DEMANDE : zéro résultat émet quand même, resultCount=0', () => {
    h.query = 'zzzintrouvable'
    h.totalContacts = 0
    render(<ContactsPageContent />)
    expect(trackSearchPerformed).toHaveBeenCalledWith('/contacts', 0)
  })

  it('sans texte tapé (liste parcourue, pas cherchée) : aucune émission', () => {
    h.query = ''
    h.totalContacts = 42
    render(<ContactsPageContent />)
    expect(trackSearchPerformed).not.toHaveBeenCalled()
  })

  it('pendant le chargement : aucune émission encore', () => {
    h.query = 'dupont'
    h.isLoading = true
    render(<ContactsPageContent />)
    expect(trackSearchPerformed).not.toHaveBeenCalled()
  })

  // #2091 — `totalContacts` vaut `undefined` sur un échec réseau (isError).
  // Émettre `resultCount: 0` mentirait : on n'a pas mesuré zéro résultat, on
  // n'a pas pu mesurer du tout.
  it('#2091 — total non mesuré (échec réseau) : aucune émission', () => {
    h.query = 'dupont'
    h.totalContacts = undefined
    render(<ContactsPageContent />)
    expect(trackSearchPerformed).not.toHaveBeenCalled()
  })
})
