import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { CONTACTS_FILTERS_PANEL_ID } from '../contacts-filters-panel-id'
import { countActiveContactFilters } from '@/features/contacts/hooks/useContactsActiveFilterCount'
import { ContactsFiltersTrigger } from './ContactsFiltersTrigger'

function renderTrigger(open = false, count = 0) {
  const onOpenChange = vi.fn()
  renderWithRouter(<ContactsFiltersTrigger open={open} onOpenChange={onOpenChange} count={count} />, '/contacts')
  return onOpenChange
}

describe('ContactsFiltersTrigger — #3527 : le bouton « Filtres » à côté de la recherche', () => {
  it('pointe la section par son id et reflète son état', async () => {
    renderTrigger(true)
    const toggle = await screen.findByRole('button', { name: /^filtres$/i })
    expect(toggle).toHaveAttribute('aria-controls', CONTACTS_FILTERS_PANEL_ID)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('le clic notifie le parent avec le PROCHAIN état', async () => {
    const onOpenChange = renderTrigger(false)
    fireEvent.click(await screen.findByRole('button', { name: /^filtres$/i }))
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('⚠️ SAIT DIRE NON — à zéro filtre actif, aucun « 0 » ne s’affiche', async () => {
    renderTrigger(false, 0)
    expect((await screen.findByRole('button', { name: /^filtres$/i })).textContent).not.toMatch(/\b0\b/)
  })

  it('un filtre actif reste COMPTÉ, section repliée', async () => {
    renderTrigger(false, 2)
    expect(await screen.findByRole('button', { name: /^filtres$/i })).toHaveTextContent('2')
  })
})

describe('countActiveContactFilters — #3527 : une seule formule', () => {
  it('compte puces, maturité, portée et vue ≠ « Toutes » ; « Toutes » ne compte pas', () => {
    expect(
      countActiveContactFilters({ chips: 1, stateFilter: 'actionnable', unassigned: true, view: 'to_contact' }),
    ).toBe(4)
    expect(countActiveContactFilters({ chips: 0, stateFilter: undefined, unassigned: undefined, view: 'all' })).toBe(0)
    expect(
      countActiveContactFilters({ chips: 0, stateFilter: undefined, unassigned: undefined, view: undefined }),
    ).toBe(0)
  })
})
