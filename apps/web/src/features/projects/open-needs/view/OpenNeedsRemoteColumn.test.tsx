import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { OpenNeedRow } from '@bellum/contracts'

/**
 * #2173.29 — Colonne « Télétravail ».
 *
 * Le registre du 16/09 constatait qu'aucun champ `remote`/`teletravail`
 * n'existait ni dans le contrat ni dans le module `projects` — reconfirmé le
 * 18/09 (lot G3) : `match.ts` porte bien un `remote`, mais c'est le moteur de
 * MATCHING consultant, jamais alimenté depuis une colonne du besoin.
 *
 * `remote` réutilise `REMOTE_PREFERENCES` (GA-26, `talent-preferences.ts`),
 * la même énumération que `consultants.remote_preference`.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({ data: [], isLoading: false }),
}))

const { OpenNeedsTable } = await import('./OpenNeedsTable')

function need(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return {
    id: 'n-1',
    title: 'Architecte plateforme',
    urgency: null,
    skills: [{ term: 'Kubernetes', required: true }],
    seniority: null,
    headcount: 1,
    target_tjm_cents: null,
    start_on: null,
    duration_months: null,
    location: null,
    contract_kind: 'regie',
    deadline_at: null,
    status: 'to_qualify',
    status_reason: null,
    status_changed_at: null,
    source: null,
    provenance: null,
    owner_id: null,
    shortlist_count: 0,
    staffable: 'unknown',
    staffable_reason: null,
    project_id: 'p-1',
    project_label: 'Plateforme',
    project_stage: 'qualified',
    account_id: null,
    account_name: 'ACME',
    entity_id: null,
    entity_name: null,
    ...over,
  } as unknown as OpenNeedRow
}

function draw(rows: OpenNeedRow[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OpenNeedsTable
        rows={rows}
        poolIsEmpty={false}
        onOpenNeed={() => {}}
        onAddConsultant={() => {}}
        onMatch={() => {}}
        selectedIds={[]}
        onToggle={() => {}}
        onToggleAll={() => {}}
      />
    </QueryClientProvider>,
  )
}

describe('besoins ouverts — colonne Télétravail', () => {
  it('porte la colonne', () => {
    draw([need()])
    // Théo C projects-besoins.R2 — « lieu · présence » sous les compétences.
    expect(screen.getByTestId('need-place')).toBeInTheDocument()
  })

  it('affiche la valeur choisie, traduite', () => {
    draw([need({ remote: 'hybride' })])
    expect(screen.getByTestId('need-place')).toHaveTextContent('Hybride')
  })

  it('affiche un tiret — jamais « Sur site » par défaut — quand rien n’a été dit', () => {
    draw([need({ remote: null })])
    expect(screen.queryByText('Sur site')).not.toBeInTheDocument()
    expect(screen.getAllByText('–').length).toBeGreaterThan(0)
  })
})
