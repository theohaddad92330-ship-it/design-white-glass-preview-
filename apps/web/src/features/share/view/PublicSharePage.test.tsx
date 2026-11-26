import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { resolveBrand, type AccountSharePayload } from '@bellum/contracts'
import { PublicShareNotFound, PublicSharePage } from './PublicSharePage'

vi.mock('@/features/theme/theme-provider', () => ({
  useTheme: () => ({ resolvedTheme: 'dark', toggleTheme: vi.fn() }),
}))

const payload: AccountSharePayload = {
  account: {
    company_name: 'Société Générale',
    sector: 'Banque',
    employees: '117 000',
    revenue: null,
    headquarters: 'Paris',
    website: 'societegenerale.com',
    priority_score: 7,
    priority_justification: 'Trois recrutements cloud publiés ce mois-ci.',
  },
  contacts: [
    {
      id: 'c1',
      full_name: 'Maëlle Lorquin',
      title: 'DSI adjointe',
      email: 'maelle@sg.example',
      phone: '+33 1 00 00 00 00',
      linkedin_url: 'https://www.linkedin.com/in/maelle',
    },
  ],
  expiresAt: '2026-12-01T00:00:00.000Z',
  brand: resolveBrand(null),
  redactedFields: ['revenue'],
} as AccountSharePayload

/**
 * Grammaire `onboarding-accueil` : l'en-tête de page (surtitre, compte en h1,
 * échéance) précède le bandeau, les faits, la raison de la priorité et les
 * contacts au tableau commun. Aucun score en points.
 */
describe('PublicSharePage — le dossier partagé dans la grammaire Théo', () => {
  it('ordonne en-tête, bandeau, raison, contacts ; les contacts en tableau, coordonnées en clair', () => {
    render(<PublicSharePage payload={payload} />)
    const heading = screen.getByTestId('share-heading')
    expect(within(heading).getByRole('heading', { level: 1 }).textContent).toBe('Société Générale')
    const order = [
      heading,
      screen.getByRole('note'),
      screen.getByRole('heading', { name: /Pourquoi ce compte|Why this account/ }),
      screen.getByRole('table'),
    ]
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(screen.getAllByRole('columnheader').map(th => th.textContent)).toEqual([
      'Nom',
      'Fonction',
      'E-mail',
      'Téléphone',
      'Réseau professionnel',
    ])
    expect(screen.getByText('maelle@sg.example')).toBeTruthy()
  })

  it('sait dire NON au score en points : ni « 7/10 » ni « /10 »', () => {
    const { container } = render(<PublicSharePage payload={payload} />)
    expect(container.textContent).not.toMatch(/\/\s?10\b/)
    expect(screen.getByText('Trois recrutements cloud publiés ce mois-ci.')).toBeTruthy()
  })

  it('introuvable : un h1 nommé et un lien vers le site, sans filigrane « 404 »', () => {
    const { container } = render(<PublicShareNotFound />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/introuvable|not found/i)
    expect(container.textContent).not.toMatch(/404/)
    expect(screen.getByRole('link', { name: /Découvrir|Discover/ })).toBeTruthy()
  })
})
