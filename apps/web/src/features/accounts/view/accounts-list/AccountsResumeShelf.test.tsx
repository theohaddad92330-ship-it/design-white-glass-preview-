import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { AccountRow } from './types'

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

const { AccountsResumeShelf, accountsToResume } = await import('./AccountsResumeShelf')

const row = (over: Partial<AccountRow>): AccountRow =>
  ({
    id: 'a',
    company_name: 'Acme',
    sector: 'Banque',
    priority_score: 8,
    status: 'completed',
    created_at: '2026-10-01',
    ...over,
  }) as AccountRow

describe('Reprendre le fil', () => {
  it('ne retient que les comptes À REPRENDRE (le prédicat serveur de la bande), favoris d’abord, trois au plus', () => {
    const rows = [
      row({ id: '1', to_resume: true, next_action_label: 'Appeler' }),
      row({ id: '2' }),
      row({ id: '3', to_resume: true, next_action_label: 'Relancer', is_favorite: true }),
      row({ id: '4', to_resume: false, next_action_label: 'Écrit au plan, mais non suivi' }),
      row({ id: '5', to_resume: true, next_action_label: 'Envoyer' }),
      row({ id: '6', to_resume: true, next_action_label: 'Qualifier' }),
    ]
    expect(accountsToResume(rows).map(r => r.id)).toEqual(['3', '1', '5'])
  })

  it('montre le signal réel comme sujet et l’action du plan ; la décision s’écrit en mots', () => {
    render(
      <AccountsResumeShelf
        rows={[
          row({
            id: '1',
            to_resume: true,
            company_name: 'Orange',
            next_action_label: 'Préparer le cadrage',
            primary_signal: 'Six offres data publiées',
            priority_gate: 'prioritised',
          }),
        ]}
      />,
    )
    expect(screen.getByText('Reprendre le fil')).toBeVisible()
    expect(screen.getByText('Six offres data publiées')).toBeVisible()
    expect(screen.getByText('Préparer le cadrage')).toBeVisible()
    expect(screen.getByText('Priorisé')).toBeVisible()
    // Théo `.a4-card-bottom` : la RELATION à côté des visages, la prochaine action sous un filet.
    expect(screen.getByTestId('account-card-relation')).toHaveTextContent('À ouvrir')
    expect(screen.getByTestId('account-card-next')).toHaveTextContent('Préparer le cadrage')
  })

  // #4584 — la bande « À reprendre » et l'étagère disaient « 0 » et « 3 » : deux définitions. Une action écrite
  // au plan ne fait pas un compte à reprendre ; seul le prédicat que le serveur compte pour la bande le fait.
  it('#4584 SAIT DIRE NON : une prochaine action écrite au plan, sans `to_resume`, ne fait AUCUNE carte', () => {
    const { container } = render(
      <AccountsResumeShelf
        rows={[row({ id: '1', next_action_label: 'Appeler' }), row({ id: '2', next_action_label: 'Relancer' })]}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('SAIT DIRE NON : aucun compte à reprendre → l’étagère entière se tait', () => {
    const { container } = render(<AccountsResumeShelf rows={[row({ id: '1' })]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
