import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { ContactsPerimeterBar } from './ContactsPerimeterBar'

beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

describe('#4996 L6 — ContactsPerimeterBar : le segment « Mon périmètre » de l’onglet Contacts', () => {
  it('est MASQUÉ sans zone d’entité (compteur null) : une absence ne fait aucune ligne', () => {
    const { container } = render(<ContactsPerimeterBar mode="mine" outsideCount={null} onModeChange={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('affiche le segment et la ligne « N hors de ton périmètre — Tout voir » en « Mon périmètre »', async () => {
    const onModeChange = vi.fn()
    render(<ContactsPerimeterBar mode="mine" outsideCount={14} onModeChange={onModeChange} />)
    expect(screen.getByRole('button', { name: 'Mon périmètre' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/14 contacts hors de ton périmètre/)).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tout voir' }))
    expect(onModeChange).toHaveBeenCalledWith('all')
  })

  it('en « Tout le compte », le compteur reste dit mais il n’y a plus rien à « voir »', () => {
    render(<ContactsPerimeterBar mode="all" outsideCount={14} onModeChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Tout le compte' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Tout voir' })).toBeNull()
  })

  it('zéro contact hors périmètre : pas de ligne « 0 » (valeur absente jamais 0)', () => {
    render(<ContactsPerimeterBar mode="mine" outsideCount={0} onModeChange={vi.fn()} />)
    expect(screen.queryByText(/hors de ton périmètre/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Mon périmètre' })).toBeInTheDocument()
  })
})
