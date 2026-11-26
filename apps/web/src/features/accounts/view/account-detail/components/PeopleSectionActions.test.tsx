import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { PeopleSectionActions } from './PeopleSectionActions'

/**
 * #2120.48 — « Confronter avec mon CRM » DOIT être visible en haut de l'onglet
 * Contacts. Mesuré ABSENT le 14/09 : 0 occurrence de « Confronter » hors
 * `laura.json`. Ce test sait dire NON : sans le bouton dans `PeopleSectionActions`
 * (l'en-tête de la section Personnes, où vivent déjà #2120.46/.47), il échoue.
 */
vi.mock('@/features/contacts/hooks/useCrmConfrontation', () => ({
  useCrmConfrontation: () => ({ data: undefined, isLoading: true, isError: false }),
}))
vi.mock('@/features/contacts/hooks/useHideContact', () => ({ useHideContact: () => ({ mutate: vi.fn() }) }))

describe('#2120.48 — PeopleSectionActions', () => {
  it('affiche le bouton « Confronter avec mon CRM », au même rang que les deux autres', async () => {
    renderWithRouter(<PeopleSectionActions accountId="acc-1" onCreateContact={vi.fn()} onImportCsv={vi.fn()} />)
    expect(await screen.findByRole('button', { name: /confronter avec mon crm/i })).toBeInTheDocument()
  })

  it('le clic ouvre le dialogue de confrontation', async () => {
    renderWithRouter(<PeopleSectionActions accountId="acc-1" onCreateContact={vi.fn()} onImportCsv={vi.fn()} />)
    await userEvent.setup().click(await screen.findByRole('button', { name: /confronter avec mon crm/i }))
    expect(await screen.findByRole('heading', { name: /confronter avec le crm/i })).toBeInTheDocument()
  })
})
