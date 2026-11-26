import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const navigate = vi.fn()
const contacts = vi.fn()

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/features/contacts/hooks/useContacts', () => ({
  useContacts: (filters: { q?: string }) => contacts(filters),
}))
// Le délai de frappe n'est pas le sujet : la valeur passe telle quelle.
vi.mock('@/hooks/useDebounce', () => ({ useDebounce: (value: string) => [value, vi.fn()] }))

const { NewMessageDialog } = await import('./NewMessageDialog')

const page = (data: unknown[]) => ({ data: { pages: [{ data }] }, isLoading: false, isError: false })

beforeEach(() => {
  navigate.mockReset()
  contacts.mockReset()
  contacts.mockReturnValue(
    page([
      {
        id: 'c3',
        full_name: 'Claire Vasseur',
        entity: 'Groupe Hélios',
        title: 'Directrice Data',
        email: 'claire.vasseur@groupe-helios.fr',
      },
    ]),
  )
})

describe('NewMessageDialog — « À qui veux-tu écrire ? » (Théo B m1.R9)', () => {
  it('liste les contacts avec compte, fonction et adresse en clair (c87)', () => {
    render(<NewMessageDialog open onOpenChange={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'À qui veux-tu écrire ?' })).toBeInTheDocument()
    expect(screen.getByText('Claire Vasseur')).toBeInTheDocument()
    expect(screen.getByText('Groupe Hélios · Directrice Data · claire.vasseur@groupe-helios.fr')).toBeInTheDocument()
  })

  it('la recherche interroge le répertoire', () => {
    render(<NewMessageDialog open onOpenChange={() => {}} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher un destinataire' }), {
      target: { value: 'Hélios' },
    })
    expect(contacts).toHaveBeenLastCalledWith({ q: 'Hélios' })
  })

  it('« Choisir » ouvre la préparation d’e-mail du contact (déjà rédigée par Laura) — rien ne part', () => {
    const onOpenChange = vi.fn()
    render(<NewMessageDialog open onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Choisir' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(navigate).toHaveBeenCalledWith({
      to: '/contacts/$id/approach/$channel',
      params: { id: 'c3', channel: 'email' },
    })
  })

  it('aucun contact : le dit, sans ligne vide', () => {
    contacts.mockReturnValue(page([]))
    render(<NewMessageDialog open onOpenChange={() => {}} />)
    expect(screen.getByText('Aucun contact ne correspond.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Choisir' })).toBeNull()
  })
})
