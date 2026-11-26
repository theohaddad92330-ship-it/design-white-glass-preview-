import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { OpenNeedRow } from '@bellum/contracts'

/**
 * #2323.18 — la porte PRÉSENTER, accord sur le type de profil, PAR
 * L'INTERACTION — même leçon que `NeedActionsMenu.test.tsx` (#2692) : un
 * contrôle qui clique réellement, pas seulement un test de source.
 */
type ApiCall = { path: string; method?: string; body?: unknown }
const apiFetch = vi.fn(async (_args: ApiCall): Promise<unknown> => ({ profile_type_agreement: 'agreed' }))
vi.mock('@/lib/api', () => ({ apiFetch: (args: ApiCall) => apiFetch(args) }))

const { NeedProfileTypeAgreementControl } = await import('./NeedProfileTypeAgreementControl')

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
    ...over,
  } as OpenNeedRow
}

function draw(row: OpenNeedRow) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NeedProfileTypeAgreementControl need={row} />
    </QueryClientProvider>,
  )
}

describe('NeedProfileTypeAgreementControl', () => {
  it('propose les deux issues quand rien n’a encore été demandé — aucun badge, « unknown » n’est pas un verdict', () => {
    draw(need({ profile_type_agreement: 'unknown' }))
    expect(screen.queryByText('Type de profil validé par le client')).not.toBeInTheDocument()
    expect(screen.queryByText('Le client n’a pas validé ce type de profil')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Marquer.*validé par le client/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Marquer.*n’a pas validé/ })).toBeInTheDocument()
  })

  it('envoie le verdict choisi à la porte dédiée, et rien d’autre', async () => {
    const user = userEvent.setup()
    draw(need({ profile_type_agreement: 'unknown' }))

    await user.click(screen.getByRole('button', { name: /Marquer.*validé par le client/ }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/projects/needs/n-1/profile-type-agreement',
        method: 'PATCH',
        body: { agreement: 'agreed' },
      }),
    )
  })

  it('affiche le verdict déjà posé en badge, et offre de le changer — jamais un contrôle muet une fois répondu', () => {
    draw(need({ profile_type_agreement: 'agreed' }))
    expect(screen.getByText('Type de profil validé par le client')).toBeInTheDocument()
    // Le seul bouton restant est celui qui bascule vers l’AUTRE issue.
    expect(screen.getByRole('button', { name: /Marquer.*n’a pas validé/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Marquer.*validé par le client/ })).not.toBeInTheDocument()
  })
})
