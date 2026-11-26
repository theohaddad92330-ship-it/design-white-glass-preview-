import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { OpenNeedRow } from '@bellum/contracts'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
// #2173.31 — voir OpenNeedsSheetReachable.test.tsx pour la raison de ce mock.
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))

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

function draw(rows: OpenNeedRow[], onOpenNeed: (id: string) => void = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OpenNeedsTable
        rows={rows}
        poolIsEmpty={false}
        onOpenNeed={onOpenNeed}
        onAddConsultant={() => {}}
        onMatch={() => {}}
        selectedIds={[]}
        onToggle={() => {}}
        onToggleAll={() => {}}
      />
    </QueryClientProvider>,
  )
}

// Théo C projects-besoins — « sources cliquables, visibles directement » (Louis 22/10) :
// le lien vers la page d'origine de l'offre est SUR la ligne, sans ouvrir de détail.
describe('besoins — la source cliquable, visible sur la ligne', () => {
  it('affiche le site d’origine avec un lien externe sûr, nommé pour les lecteurs d’écran', () => {
    draw([need({ source_url: 'https://careers.airbus.com/offre/sap-s4' })])
    const link = screen.getByRole('link', { name: 'Ouvrir la source : careers.airbus.com' })
    expect(link).toHaveAttribute('href', 'https://careers.airbus.com/offre/sap-s4')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link.className).toContain('min-h-11')
  })

  it('le clic sur la source n’ouvre PAS la fiche du besoin', async () => {
    const onOpenNeed = vi.fn()
    const user = userEvent.setup()
    draw([need({ source_url: 'https://careers.airbus.com/offre/sap-s4' })], onOpenNeed)
    const link = screen.getByRole('link', { name: /Ouvrir la source/ })
    link.addEventListener('click', event => event.preventDefault())
    await user.click(link)
    expect(onOpenNeed).not.toHaveBeenCalled()
  })

  it('SAIT DIRE NON : sans URL, ou avec une URL qui n’est pas une page web, aucun lien', () => {
    draw([need({ source_url: null }), need({ id: 'n-2', source_url: 'javascript:alert(1)' })])
    expect(screen.queryByRole('link', { name: /Ouvrir la source/ })).not.toBeInTheDocument()
  })
})
