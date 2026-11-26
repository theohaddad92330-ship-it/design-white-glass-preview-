import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { OpenNeedRow } from '@bellum/contracts'

/**
 * #2173.31 — Colonne « Owner ».
 *
 * `owner_id` voyage depuis longtemps dans `OpenNeedRow` (il est déjà LU par
 * l'action de lot « Attribuer », `need-actions.ts`) et n'était affiché nulle
 * part dans le tableau — zéro occurrence de « owner » dans `OpenNeedsTable.tsx`.
 * Le nom vient de `useWorkspaceMembers`, la MÊME source que le panneau
 * « Attribuer » (`NeedActionsMenu.tsx`, `OwnerChoices`) : un second annuaire
 * divergerait du premier au premier membre ajouté.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({
    data: [{ userId: 'u-1', fullName: 'Maëlle Dubois', email: 'maelle@example.com', role: 'member', isSelf: false }],
    isLoading: false,
  }),
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

describe('besoins ouverts — colonne Owner', () => {
  it('porte la colonne', () => {
    draw([need()])
    // Théo C projects-besoins.R2 — le porteur vit sous le TJM, plus dans une colonne à part.
    expect(screen.getByRole('columnheader', { name: 'TJM vente cible' })).toBeInTheDocument()
    expect(screen.getByTestId('need-owner')).toBeInTheDocument()
  })

  it('affiche le nom du membre propriétaire', () => {
    draw([need({ owner_id: 'u-1' })])
    expect(screen.getByTestId('need-owner')).toHaveTextContent('Porteur : Maëlle Dubois')
  })

  it('affiche un tiret — jamais un nom inventé — quand personne n’est propriétaire', () => {
    draw([need({ owner_id: null })])
    expect(screen.getByTestId('need-owner')).toHaveTextContent('–')
  })
})
