import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { AccountRow } from './types'

/**
 * #4497 (PR 12C, maquette V22 `.a4-account-card`) — « REPRENDRE LE FIL », une carte dans l'ordre de la
 * maquette : logo · secteur · épingler ; le NOM ; le SUJET en titre gras ; deux lignes de contexte (des faits
 * du compte, jamais une phrase inventée) ; visages + « N contacts » ; la relation ; en pied la prochaine
 * action datée. Une absence ne fait aucune ligne : ni « - », ni « 0 contact ».
 */

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string }) => (
    <a href={to} {...(rest as object)}>
      {children}
    </a>
  ),
}))
vi.mock('@/components/primitives/AskLaura', () => ({ AskLaura: () => <span data-testid="ask-laura" /> }))
vi.mock('@/features/accounts/hooks/useSetAccountFavorite', () => ({
  useSetAccountFavorite: () => ({ mutate: vi.fn(), isPending: false }),
}))

const { AccountsResumeShelf } = await import('./AccountsResumeShelf')

const FULL: AccountRow = {
  id: 'sg',
  company_name: 'Société Générale',
  sector: 'Banque',
  priority_score: 9,
  status: 'completed',
  created_at: '2026-10-01',
  commercial_status: 'customer',
  is_favorite: true,
  signal_preview: { label: 'Renfort plateforme cloud', source: 'Les Échos', date: '2026-10-12' },
  primary_signal: 'Renfort plateforme cloud',
  last_action_at: '2026-10-18',
  next_action_label: 'Relancer Maxime Delaunay',
  to_resume: true,
  next_action_horizon: '7j',
  people: {
    count: 8,
    has_decider: true,
    top: [
      { name: 'Maxime Delaunay', is_decider: true },
      { name: 'Camille Roussel', is_decider: false },
    ],
  },
}

function before(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
}

describe('Reprendre le fil — la carte V22 (#4497)', () => {
  it('secteur · épingle → nom → sujet en titre → contexte → personnes → relation → prochaine action', () => {
    render(<AccountsResumeShelf rows={[FULL]} />)
    const card = screen.getByTestId('account-portfolio-card')
    const sector = within(card).getByText('Banque')
    const pin = within(card).getByRole('button', { name: /favori/i })
    const name = within(card).getByRole('link', { name: /Société Générale/ })
    const subject = within(card).getByRole('heading', { level: 3, name: 'Renfort plateforme cloud' })
    const context = within(card).getByTestId('account-card-context')
    const people = within(card).getByText('8 contacts')
    const relation = within(card).getByTestId('account-card-relation')
    const next = within(card).getByTestId('account-card-next')
    const order = [sector, pin, name, subject, context, people, relation, next]
    for (let i = 0; i < order.length - 1; i += 1) expect(before(order[i]!, order[i + 1]!)).toBe(true)
    expect(relation).toHaveTextContent('Client')
    expect(subject.className).toContain('font-semibold')
  })

  it('deux lignes de contexte, faites des faits du compte (source et date du signal, dernière action)', () => {
    render(<AccountsResumeShelf rows={[FULL]} />)
    const lines = within(screen.getByTestId('account-card-context')).getAllByRole('listitem')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toHaveTextContent('Les Échos · 12 oct. 2026')
    expect(lines[1]).toHaveTextContent('Dernière action le 18 oct. 2026')
  })

  it('en pied, la prochaine action DATÉE : son horizon d’abord, puis son libellé', () => {
    render(<AccountsResumeShelf rows={[FULL]} />)
    expect(screen.getByTestId('account-card-next')).toHaveTextContent('7j · Relancer Maxime Delaunay')
  })

  it('les visages et « N contacts » : deux initiales, le nombre en mots', () => {
    render(<AccountsResumeShelf rows={[FULL]} />)
    const people = screen.getByTestId('account-people')
    expect(people).toHaveTextContent('MD')
    expect(people).toHaveTextContent('CR')
    expect(people).toHaveTextContent('8 contacts')
  })

  it('SAIT DIRE NON : sans personne, sans contexte, sans horizon — aucune ligne, ni « - » ni « 0 »', () => {
    render(
      <AccountsResumeShelf
        rows={[
          {
            ...FULL,
            people: undefined,
            signal_preview: { label: 'Renfort plateforme cloud' },
            last_action_at: null,
            next_action_horizon: null,
          },
        ]}
      />,
    )
    const card = screen.getByTestId('account-portfolio-card')
    expect(within(card).queryByTestId('account-people')).not.toBeInTheDocument()
    expect(within(card).queryByTestId('account-card-context')).not.toBeInTheDocument()
    expect(within(card).queryByText('-')).not.toBeInTheDocument()
    expect(within(card).queryByLabelText('Aucune personne identifiée')).not.toBeInTheDocument()
    expect(card.textContent).not.toMatch(/0 contact/)
    expect(within(card).getByTestId('account-card-next')).toHaveTextContent(/^Relancer Maxime Delaunay$/)
  })
})

describe('#4497.a — la ville sur la carte, à côté du secteur (`.a4-place`)', () => {
  it('affiche la ville tirée du siège, après le secteur', () => {
    render(<AccountsResumeShelf rows={[{ ...FULL, headquarters: '1 cours Valmy, 92800 Puteaux' }]} />)
    const card = screen.getByTestId('account-portfolio-card')
    const sector = within(card).getByText('Banque')
    const place = within(card).getByTestId('account-card-place')
    expect(place).toHaveTextContent('Puteaux')
    expect(before(sector, place)).toBe(true)
  })

  it('siège absent : aucune ville, aucun texte de remplacement', () => {
    render(<AccountsResumeShelf rows={[{ ...FULL, headquarters: null }]} />)
    expect(screen.queryByTestId('account-card-place')).not.toBeInTheDocument()
  })
})
