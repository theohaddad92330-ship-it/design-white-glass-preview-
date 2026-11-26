import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import type { Contact } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ContactsDuplicateNotice } from './ContactsDuplicateNotice'
import type * as ContactsApiModule from '@/features/contacts/api'

// LOIC-FIX2 O.5 — « Cottet Alain » / « Alain COTTET » : la fiche PROPOSE (rien n'est fusionné), les deux fiches s'ouvrent.
const api = vi.hoisted(() => ({ duplicateProposals: vi.fn(), decideDuplicate: vi.fn() }))
vi.mock('@/features/contacts/api', async importOriginal => {
  const actual = await importOriginal<typeof ContactsApiModule>()
  return {
    ...actual,
    contactsApi: {
      ...actual.contactsApi,
      duplicateProposals: api.duplicateProposals,
      decideDuplicate: api.decideDuplicate,
    },
  }
})

const left = { id: 'c1', fullName: 'Cottet Alain', email: null, phone: null, title: 'DSI' }
const right = { id: 'c2', fullName: 'Alain COTTET', email: null, phone: null, title: 'DSI' }
const contacts = [
  { id: 'c1', full_name: 'Cottet Alain' },
  { id: 'c2', full_name: 'Alain COTTET' },
] as Contact[]

describe('ContactsDuplicateNotice (LOIC-FIX2 O.5)', () => {
  it('PROPOSE la fusion avec sa raison, sans la faire, et ouvre chaque fiche', async () => {
    api.duplicateProposals.mockResolvedValue({ pairs: [{ left, right, score: 6, reasons: ['même nom'] }] })
    const onContactClick = vi.fn()
    renderWithRouter(<ContactsDuplicateNotice accountId="a" contacts={contacts} onContactClick={onContactClick} />)
    expect(await screen.findByText(/1 doublon possible/)).toBeInTheDocument()
    expect(screen.getByText(/Cottet Alain et Alain COTTET semblent/)).toBeInTheDocument()
    expect(screen.getByText(/même nom/)).toBeInTheDocument()
    expect(screen.getByText(/Rien n’est fusionné/)).toBeInTheDocument()
    const open = screen.getByRole('button', { name: 'Ouvrir la fiche de Alain COTTET' })
    expect(open.className).toMatch(/min-h-11/)
    fireEvent.click(open)
    expect(onContactClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'c2' }))
    expect(screen.queryByRole('button', { name: /^Fusionner/ })).not.toBeInTheDocument()
  })

  it('dit NON : aucune paire, aucune ligne', async () => {
    api.duplicateProposals.mockResolvedValue({ pairs: [] })
    const { container } = renderWithRouter(<ContactsDuplicateNotice accountId="a" contacts={contacts} />)
    await vi.waitFor(() => expect(api.duplicateProposals).toHaveBeenCalled())
    expect(container.textContent).not.toMatch(/doublon/)
  })

  // #4600 — huit fiches, une adresse : UNE cause, UN bloc, jamais 28 propositions de fusion.
  it('une adresse partagée non vérifiée : UN bloc avec sa raison, aucune proposition de fusion', async () => {
    const three = ['c1', 'c2', 'c3'].map((id, i) => ({
      id,
      fullName: ['Cottet Alain', 'Alain COTTET', 'Zoé Petit'][i] ?? null,
      email: 'partage.interne@exemple-societe.test',
      phone: null,
      title: null,
    }))
    api.duplicateProposals.mockResolvedValue({
      pairs: [],
      shared_email_groups: [{ email: 'partage.interne@exemple-societe.test', reason: 'unverified', contacts: three }],
    })
    renderWithRouter(<ContactsDuplicateNotice accountId="a" contacts={contacts} />)
    expect(
      await screen.findByText(/3 fiches partagent l’adresse partage\.interne@exemple-societe\.test/),
    ).toBeInTheDocument()
    expect(screen.getByText(/pas vérifiée/)).toBeInTheDocument()
    expect(screen.getByText(/Rien n’est fusionné/)).toBeInTheDocument()
    expect(screen.queryByText(/semblent être la même personne/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Fusionner|Proposer la fusion/ })).not.toBeInTheDocument()
  })

  // #4114.4 — deux gestes sur une paire PROPOSÉE : on enregistre la décision, on ne fusionne jamais.
  it('« Ce sont les mêmes » et « Pas les mêmes » enregistrent la décision de la paire', async () => {
    api.duplicateProposals.mockResolvedValue({ pairs: [{ left, right, score: 6, reasons: ['même nom'] }] })
    api.decideDuplicate.mockResolvedValue({ decision: 'same' })
    renderWithRouter(<ContactsDuplicateNotice accountId="a" contacts={contacts} />)
    const same = await screen.findByRole('button', { name: /Ce sont les mêmes/ })
    expect(same.className).toMatch(/min-h-11/)
    fireEvent.click(same)
    await vi.waitFor(() =>
      expect(api.decideDuplicate).toHaveBeenCalledWith('a', { leftId: 'c1', rightId: 'c2', decision: 'same' }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Pas les mêmes/ }))
    await vi.waitFor(() =>
      expect(api.decideDuplicate).toHaveBeenCalledWith('a', { leftId: 'c1', rightId: 'c2', decision: 'not_same' }),
    )
    expect(screen.queryByRole('button', { name: /^Fusionner/ })).not.toBeInTheDocument()
  })

  it('une paire déjà confirmée le DIT, sans re-proposer « Ce sont les mêmes »', async () => {
    api.duplicateProposals.mockResolvedValue({
      pairs: [{ left, right, score: 6, reasons: ['même nom'], decision: 'same' }],
    })
    renderWithRouter(<ContactsDuplicateNotice accountId="a" contacts={contacts} />)
    expect(await screen.findByText(/Confirmé : c’est la même personne/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ce sont les mêmes/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pas les mêmes/ })).toBeInTheDocument()
  })
})
