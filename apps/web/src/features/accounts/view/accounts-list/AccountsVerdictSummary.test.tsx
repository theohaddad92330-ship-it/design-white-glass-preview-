import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useHasOfferObjective } from '@/features/profile/hooks/useEsnProfile'
import { AccountsVerdictSummary, summarizeVerdicts } from './AccountsVerdictSummary'

vi.mock('@/features/profile/hooks/useEsnProfile', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/profile/hooks/useEsnProfile')>()
  return { ...actual, useHasOfferObjective: vi.fn(() => true) }
})

const rows = (scores: Array<number | null>) => scores.map(priority_score => ({ priority_score }))

// #4990.2 — quand aucun compte n'est « AGIR MAINTENANT », la liste le DIT, avec le nombre en réserve et la raison.
describe('summarizeVerdicts — #4990.2', () => {
  it('compte les comptes par verdict nommé, un score absent ne compte pour rien', () => {
    const s = summarizeVerdicts(rows([5.5, 6, 2, null]), true)
    expect(s.evaluated).toBe(3)
    expect(s.actNow).toBe(0)
    expect(s.reserve).toBe(2)
    expect(s.setAside).toBe(1)
  })
  it('un compte GO existe : aucun résumé « aucun à attaquer »', () => {
    expect(summarizeVerdicts(rows([8, 5.5]), true).actNow).toBe(1)
  })
})

describe('AccountsVerdictSummary — #4990', () => {
  it('portefeuille sans compte à attaquer : « aucun compte à attaquer : N en réserve » + raison', () => {
    render(<AccountsVerdictSummary rows={rows([5.5, 6, 6.5, 5, 5.2, 5.9, 6.1, 5.3, 5.1, 6.4])} />)
    const el = screen.getByTestId('accounts-no-act-now')
    expect(el).toHaveTextContent(/aucun compte à attaquer/i)
    expect(el).toHaveTextContent('10 en réserve')
    expect(el).toHaveTextContent(/raison principale/i)
  })
  it('au moins un compte à attaquer : pas de message, la légende reste', () => {
    render(<AccountsVerdictSummary rows={rows([8, 5.5])} />)
    expect(screen.queryByTestId('accounts-no-act-now')).not.toBeInTheDocument()
    expect(screen.getByTestId('accounts-verdict-legend')).toBeInTheDocument()
  })
  it('aucune ligne évaluée : rien du tout (jamais « 0 en réserve »)', () => {
    const { container } = render(<AccountsVerdictSummary rows={rows([null])} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('la légende nomme les cinq verdicts', () => {
    render(<AccountsVerdictSummary rows={rows([8])} />)
    const legend = screen.getByTestId('accounts-verdict-legend')
    for (const name of ['AGIR MAINTENANT', 'RÉSERVE', 'METTRE EN VEILLE', 'ÉCARTER POUR CET OBJECTIF', 'QUALIFIER'])
      expect(legend).toHaveTextContent(name)
  })
})
