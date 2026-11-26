import type { AutomationRuleView } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Théo C automations-liste.A6 — les modèles de règle vivent dans la bibliothèque, pas sur la liste. */
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
const rules = vi.fn()
const activateMutate = vi.fn()
vi.mock('../api', () => ({
  useAutomationRules: () => rules(),
  useActivateAutomationTemplate: () => ({ mutate: activateMutate, isPending: false }),
}))

const { AutomationTemplatesBlock } = await import('./AutomationTemplatesBlock')

const installed = {
  id: 'r1',
  signal: 'tender',
  action_kind: 'enroll_sequence',
  playbook_key: 'tender',
} as unknown as AutomationRuleView

function renderBlock() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AutomationTemplatesBlock />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  activateMutate.mockClear()
  rules.mockReturnValue({ data: [installed] })
})

describe('AutomationTemplatesBlock', () => {
  it('propose les modèles pas encore installés, un par déclencheur ; « Activer » installe le modèle relié à sa séquence', async () => {
    renderBlock()
    const block = screen.getByText('Modèles prêts à activer').closest('div')?.parentElement as HTMLElement
    // L'appel d'offres est déjà installé : cinq modèles restent.
    expect(within(block).getAllByRole('button', { name: 'Activer' })).toHaveLength(5)
    await userEvent.click(within(block).getAllByRole('button', { name: 'Activer' })[0] as HTMLElement)
    expect(activateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ signal: 'hiring', action_kind: 'enroll_sequence', playbook_key: 'hiring_signal' }),
      expect.anything(),
    )
  })

  it('tous les modèles installés : rien à proposer, aucun bloc vide', () => {
    rules.mockReturnValue({ data: [] })
    const { container } = renderBlock()
    expect(container.textContent).toContain('Modèles prêts à activer')
  })
})
