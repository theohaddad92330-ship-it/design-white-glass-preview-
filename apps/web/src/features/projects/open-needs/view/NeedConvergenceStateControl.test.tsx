import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { OpenNeedRow } from '@bellum/contracts'

/**
 * #3409.2 — la NATURE d'un besoin (exprimé / détecté / simple signal /
 * confirmé), même patron que `NeedProfileTypeAgreementControl.test.tsx` :
 * un contrôle qui clique réellement contre la porte
 * `PATCH /projects/needs/:id/convergence-state` — la porte existait, testée,
 * sans AUCUN appelant côté produit (`assertConvergenceCitesFoundingSignals`,
 * `analysis/convergence.ts`).
 */
type ApiCall = { path: string; method?: string; body?: unknown }
const apiFetch = vi.fn(async (_args: ApiCall): Promise<unknown> => ({ convergence_state: 'besoin_detecte' }))
vi.mock('@/lib/api', () => ({ apiFetch: (args: ApiCall) => apiFetch(args) }))

const { NeedConvergenceStateControl } = await import('./NeedConvergenceStateControl')

function need(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return {
    id: 'n-1',
    title: 'Architecte',
    urgency: null,
    skills: [],
    seniority: null,
    headcount: 1,
    target_tjm_cents: null,
    start_on: null,
    duration_months: null,
    location: null,
    contract_kind: 'inconnu',
    deadline_at: null,
    status: 'qualified',
    status_reason: null,
    status_changed_at: null,
    source: null,
    provenance: null,
    owner_id: null,
    shortlist_count: 0,
    staffable: 'unknown',
    staffable_reason: null,
    project_id: null,
    project_label: null,
    project_stage: null,
    profile_type_agreement: 'unknown',
    convergence_state: null,
    ...over,
  } as OpenNeedRow
}

function draw(row: OpenNeedRow) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NeedConvergenceStateControl need={row} />
    </QueryClientProvider>,
  )
}

describe('NeedConvergenceStateControl', () => {
  it('affiche « non évaluée » quand rien n’a encore été posé, jamais un niveau deviné', () => {
    draw(need({ convergence_state: null }))
    expect(screen.getByText('Non évaluée')).toBeInTheDocument()
  })

  it('envoie directement « détecté » — aucun signal fondateur n’est exigé à ce niveau', async () => {
    const user = userEvent.setup()
    draw(need({ convergence_state: null }))

    await user.click(screen.getByRole('button', { name: /Marquer.*Détecté/ }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/projects/needs/n-1/convergence-state',
        method: 'PATCH',
        body: { to: 'besoin_detecte' },
      }),
    )
  })

  it('affiche la nature déjà posée en badge, et propose de la changer', () => {
    draw(need({ convergence_state: 'besoin_exprime' }))
    expect(screen.getByText('Exprimé')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Marquer.*Exprimé/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Marquer.*Détecté/ })).toBeInTheDocument()
  })

  it('« simple signal » ouvre un formulaire qui exige un signal fondateur avant d’enregistrer (#2305.35)', async () => {
    const user = userEvent.setup()
    draw(need({ convergence_state: null }))

    await user.click(screen.getByRole('button', { name: /Marquer.*Simple signal/ }))
    const confirm = await screen.findByRole('button', { name: 'Enregistrer' })
    expect(confirm).toBeDisabled()

    await user.type(screen.getByLabelText('Signaux qui fondent ce signal'), 'sig-1')
    expect(confirm).toBeEnabled()

    await user.click(confirm)
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/projects/needs/n-1/convergence-state',
        method: 'PATCH',
        body: { to: 'projet_plausible', foundingSignalIds: ['sig-1'] },
      }),
    )
  })
})
