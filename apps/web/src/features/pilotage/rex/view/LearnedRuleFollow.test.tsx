import userEvent from '@testing-library/user-event'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

/**
 * #3295 — l'ATTRIBUTION d'une action à une règle apprise (le « suivre la règle X »
 * de la recette A/B) et sa MESURE : des comptes, jamais un taux.
 */
const create = vi.fn()
vi.mock('@/features/actions/planItems.api', () => ({ planItemsApi: { create: (...a: unknown[]) => create(...a) } }))
vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({
    data: { pages: [{ data: [{ id: 'acc-1', company_name: 'Acme' }] }] },
  }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { LearnedRuleFollow } from './LearnedRuleFollow'

const RULE_ID = '44444444-4444-4444-8444-444444444444'
const TALLY = { rule_id: RULE_ID, followed: 6, positive: 0, negative: 5, inconclusive: 0, open: 1, contradicted: true }

function renderIt(tally: typeof TALLY | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LearnedRuleFollow ruleId={RULE_ID} tally={tally} />
    </QueryClientProvider>,
  )
}

describe('LearnedRuleFollow — #3295', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    create.mockReset()
  })

  it('une règle jamais suivie : aucune ligne de mesure, le geste reste offert', () => {
    renderIt(undefined)
    expect(screen.queryByText(/actions suivies/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Suivre sur une action' })).toBeInTheDocument()
  })

  it('la mesure dit des COMPTES et nomme ce qui n’est pas encore mesuré, sans pourcentage', () => {
    renderIt(TALLY)
    const line = screen.getByText(/6 actions suivies/)
    expect(line.textContent).toMatch(/0 positive/)
    expect(line.textContent).toMatch(/5 négative/)
    expect(line.textContent).toMatch(/1 sans issue/)
    expect(line.textContent).not.toMatch(/%/)
  })

  it('contredite : le signal est dit, sans désactiver la règle à la place du responsable', () => {
    renderIt(TALLY)
    expect(screen.getByText(/Tes résultats la contredisent/)).toBeInTheDocument()
  })

  it('le geste écrit UNE action portant la référence learned:<id>', async () => {
    create.mockResolvedValue({ added: true })
    const u = userEvent.setup()
    renderIt(undefined)
    await u.click(screen.getByRole('button', { name: 'Suivre sur une action' }))
    await u.click(screen.getByRole('combobox', { name: 'Compte' }))
    await u.click(screen.getByRole('option', { name: 'Acme' }))
    fireEvent.change(screen.getByLabelText('Action à mener'), { target: { value: 'Appeler le sponsor' } })
    await u.click(screen.getByRole('button', { name: 'Ajouter au plan' }))

    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create.mock.calls[0]![0]).toMatchObject({
      account_id: 'acc-1',
      label: 'Appeler le sponsor',
      target: null,
      method_rule: `learned:${RULE_ID}`,
    })
  })

  it('sans compte ni libellé, le bouton reste inerte', () => {
    renderIt(undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Suivre sur une action' }))
    expect(screen.getByRole('button', { name: 'Ajouter au plan' })).toBeDisabled()
  })
})
