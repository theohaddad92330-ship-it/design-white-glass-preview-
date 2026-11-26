import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ContactsListBanner } from './ContactsListBanner'

// Théo B c1-repertoire / C2.R3 — « Liste : X · N contacts enregistrés · Quitter cette liste ».
describe('ContactsListBanner — une liste ouverte se dit', () => {
  it('nomme la liste, compte ses fiches et se quitte', () => {
    const onQuit = vi.fn()
    render(<ContactsListBanner name="Interlocuteurs Data & BI" total={4} onQuit={onQuit} />)
    expect(screen.getByText('Liste : Interlocuteurs Data & BI')).toBeInTheDocument()
    expect(screen.getByText('4 contacts enregistrés.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quitter cette liste' }))
    expect(onQuit).toHaveBeenCalled()
  })

  it('total inconnu : la phrase se tait, jamais « 0 contact »', () => {
    render(<ContactsListBanner name="Relance SAP T4" total={undefined} onQuit={vi.fn()} />)
    expect(screen.queryByText(/contacts? enregistrés?/)).not.toBeInTheDocument()
  })

  it('nom inconnu (liste supprimée ou en chargement) : aucun bandeau', () => {
    const { container } = render(<ContactsListBanner name={undefined} total={3} onQuit={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
