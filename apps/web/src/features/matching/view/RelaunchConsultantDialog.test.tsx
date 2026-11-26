import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Consultant } from '@bellum/contracts'

const consultantData: { current: Partial<Consultant> | undefined; loading: boolean } = {
  current: undefined,
  loading: false,
}
vi.mock('@/features/consultants/hooks', () => ({
  useConsultant: () => ({ data: consultantData.current, isLoading: consultantData.loading }),
}))

const { RelaunchConsultantDialog } = await import('./RelaunchConsultantDialog')

describe('RelaunchConsultantDialog — relancer le consultant (#2936, #2176.49)', () => {
  it('ouvre un brouillon `mailto:` quand une adresse visible existe', () => {
    consultantData.current = { full_name: 'Alice Martin', email: 'alice@bellum.fr', contact_visible: true }
    consultantData.loading = false
    render(<RelaunchConsultantDialog consultantId="c-1" name="Alice Martin" onClose={() => {}} />)

    const link = screen.getByRole('link', { name: 'Ouvrir dans ma messagerie' })
    expect(link).toHaveAttribute('href', expect.stringContaining('mailto:alice%40bellum.fr?'))
    expect(link).toHaveAttribute('href', expect.stringContaining('Alice%20Martin'))
  })

  it('nomme l’absence d’adresse plutôt que d’inventer un contact', () => {
    consultantData.current = { full_name: 'Bob Petit', email: null, contact_visible: false }
    consultantData.loading = false
    render(<RelaunchConsultantDialog consultantId="c-2" name="Bob Petit" onClose={() => {}} />)

    expect(screen.getByText('Aucune adresse visible pour ce profil.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ouvrir dans ma messagerie' })).not.toBeInTheDocument()
  })

  it('affiche le nom déjà connu tout de suite, avant le chargement de la fiche', () => {
    consultantData.current = undefined
    consultantData.loading = true
    render(<RelaunchConsultantDialog consultantId="c-3" name="Chloé Dupont" onClose={() => {}} />)

    expect(screen.getByText('Relancer Chloé Dupont')).toBeInTheDocument()
  })

  it('sans consultant sélectionné, ne rend rien', () => {
    const { container } = render(<RelaunchConsultantDialog consultantId={null} name="" onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
