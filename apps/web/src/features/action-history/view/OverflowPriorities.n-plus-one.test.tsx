import type { BriefingAction } from '@bellum/contracts'
import { BRIEFING_ACTIONS_SHOWN } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OverflowPriorities } from './OverflowPriorities'

const list = vi.fn()
const lastOutcomes = vi.fn()

vi.mock('@/features/actions/planItems.api', () => ({
  planItemsApi: {
    list: (...args: unknown[]) => list(...args),
    lastOutcomes: (...args: unknown[]) => lastOutcomes(...args),
  },
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/agenda/api', () => ({
  useAgendaStatus: () => ({ data: undefined }),
  useRescheduleEvent: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

function accountAction(id: string, accountId: string): BriefingAction {
  return {
    labelKey: 'briefing.actions.followUp',
    labelVars: { counterpart: 'jean@acme.com', days: 9, subject: 'Proposition' },
    href: null,
    kind: 'follow_up',
    priority: 4,
    fact: null,
    context: null,
    preparedArtifacts: [],
    expiresAt: null,
    businessObject: { kind: 'account', id: accountId, label: accountId },
    verdict: null,
    consequence: null,
    confidence: null,
    estimatedMinutes: null,
    rankingAxes: [],
    processingState: 'suggested',
    owner: null,
    permission: null,
    id,
  } as unknown as BriefingAction
}

/**
 * Sentry BELLUM-WEB-3 — `/actions/` appelait `GET /plan-items?account_id=` une fois par carte de priorité.
 * Les cartes passent maintenant par le regroupeur du briefing : N comptes, UN `last-outcomes`, zéro liste par compte.
 */
describe('OverflowPriorities — pas de N+1 sur /plan-items (BELLUM-WEB-3)', () => {
  beforeEach(() => {
    list.mockReset()
    lastOutcomes.mockReset().mockResolvedValue([])
  })

  it('N cartes de comptes distincts → un seul appel groupé, aucun GET /plan-items?account_id', async () => {
    const actions = Array.from({ length: BRIEFING_ACTIONS_SHOWN + 5 }, (_, i) => accountAction(`a${i}`, `acc-${i}`))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <OverflowPriorities actions={actions} />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(lastOutcomes).toHaveBeenCalled())
    expect(lastOutcomes).toHaveBeenCalledTimes(1)
    expect(lastOutcomes.mock.calls[0]?.[0]).toHaveLength(5)
    expect(list).not.toHaveBeenCalled()
  })
})
