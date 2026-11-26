import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

/**
 * #4197 (L6) — LA RANGÉE « ADMINISTRATION » DE FACTURATION.
 *
 * Huit écrans de gestion (relevés, ADV, notes de frais, encaissements, cessions,
 * paiements, suivi, débrief) ont quitté la barre de Missions ; cette rangée est
 * leur porte. Chaque lien pointe la route RÉELLE, et le libellé est celui que
 * l'onglet portait (`nav:tabs.*`) — un réglage, un endroit (GA-26).
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('./InvoiceReadinessPanel', () => ({ InvoiceReadinessPanel: () => <div data-testid="readiness" /> }))
vi.mock('./OverdueThirtyDaysCard', () => ({ OverdueThirtyDaysCard: () => null }))

import { InvoicingPage } from './InvoicingPage'

afterEach(cleanup)

const EXPECTED: ReadonlyArray<readonly [string, string]> = [
  ['/missions/cra', 'Relevés d’activité'],
  ['/missions/adv', 'ADV'],
  ['/missions/factures', 'Factures'],
  ['/missions/encaissements', 'Encaissements'],
  ['/missions/finance', 'Vue financière'],
  ['/missions/suivi', 'Suivi'],
  ['/pilotage/rex', 'Débriefer une mission'],
]

describe('InvoicingPage — rangée « Administration »', () => {
  it('nomme la rangée et joint les sept écrans sortis de la barre', async () => {
    await i18n.changeLanguage('fr')
    render(<InvoicingPage />)
    const row = screen.getByRole('navigation', { name: 'Administration' })
    for (const [route, label] of EXPECTED) {
      const link = within(row).getByRole('link', { name: label })
      expect(link).toHaveAttribute('href', route)
    }
    expect(within(row).getAllByRole('link')).toHaveLength(EXPECTED.length)
  })

  it('garde la préparation de facture en dessous de la rangée', async () => {
    await i18n.changeLanguage('fr')
    render(<InvoicingPage />)
    expect(screen.getByTestId('readiness')).toBeInTheDocument()
  })
})

/** Théo C missions-preparation — l'en-tête de la page appliquée : titre, chaîne, contrôle ADV. */
describe('InvoicingPage — la page appliquée « Prêt à facturer »', () => {
  it('R-titre — la phrase de Théo ouvre la page', async () => {
    await i18n.changeLanguage('fr')
    render(<InvoicingPage />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Transformer l’activité validée en factures fiables' }),
    ).toBeInTheDocument()
  })

  it('N1 — la chaîne en quatre étapes est en tête, « Contrôles » est l’étape courante', async () => {
    await i18n.changeLanguage('fr')
    render(<InvoicingPage />)
    const strip = screen.getByRole('navigation', { name: /activité au règlement/i })
    expect(within(strip).getAllByRole('listitem')).toHaveLength(4)
    expect(within(strip).getAllByRole('listitem')[1]).toHaveAttribute('aria-current', 'step')
  })

  it('R6 — le bloc « Contrôle ADV » mène aux contrôles du mois', async () => {
    await i18n.changeLanguage('fr')
    render(<InvoicingPage />)
    expect(screen.getByText('Une facture remonte à sa preuve de prestation.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ouvrir les contrôles ADV du mois' })).toHaveAttribute(
      'href',
      '/missions/adv',
    )
  })

  it('garde la phrase de doctrine : Bellum n’émet aucune facture', async () => {
    await i18n.changeLanguage('fr')
    render(<InvoicingPage />)
    expect(screen.getByText(/n’émet aucune facture/)).toBeInTheDocument()
  })
})

// Contrôle de fidélité Théo (23/10) — l'ORDRE de la page : titre, chaîne, panneau, puis la carte ADV en pied.
describe('InvoicingPage — structure de la maquette Théo', () => {
  it('pose le titre, la chaîne, le panneau puis la carte « Contrôle ADV » à filet d’accent', async () => {
    await i18n.changeLanguage('fr')
    const { container } = render(<InvoicingPage />)
    const order = [...container.querySelectorAll('[data-slot],[data-testid="readiness"]')]
      .map(node => node.getAttribute('data-slot') ?? node.getAttribute('data-testid'))
      .filter(slot => ['invoicing-head', 'finance-chain', 'readiness', 'invoicing-adv'].includes(slot ?? ''))
    expect(order).toEqual(['invoicing-head', 'finance-chain', 'readiness', 'invoicing-adv'])
    const adv = container.querySelector('[data-slot="invoicing-adv"]') as HTMLElement
    expect(within(adv).getByRole('heading', { level: 2 })).toBeInTheDocument()
    expect(within(adv).getByRole('link')).toHaveAttribute('href', '/missions/adv')
  })
})
