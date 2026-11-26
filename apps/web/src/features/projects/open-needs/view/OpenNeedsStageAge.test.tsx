import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { OpenNeedRow } from '@bellum/contracts'

/**
 * L'ÂGE DANS L'ÉTAPE — colonne n°12 de la source (PDF-03 §1.4).
 *
 * `project_needs.status_changed_at` existait en base et était écrite à chaque
 * transition ; aucune requête ne la sélectionnait et aucun écran ne la lisait.
 * C'est la famille « colonne écrite, jamais lue », et son symptôme est qu'un
 * écran juste ressemble trait pour trait à une base vide.
 *
 * Ce qui se teste ici est la moitié qui fait la différence à l'œil : un besoin
 * immobile depuis douze jours affiche « 12 j », et un besoin qui n'a JAMAIS
 * changé d'état affiche « non mesuré » — jamais « 0 j », qui se lirait « ça
 * vient de bouger » et enterrerait exactement les besoins qu'on cherche.
 */
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

describe('besoins ouverts — l’âge dans l’étape', () => {
  it('porte la colonne', () => {
    draw([need()])
    // Théo C projects-besoins.R2 — l'âge vit sous le statut, plus dans une colonne à part.
    expect(screen.getByTestId('need-stage-age')).toBeInTheDocument()
  })

  it('affiche l’âge en jours quand la date est là', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-27T10:00:00.000Z'))
    try {
      draw([need({ status_changed_at: '2026-08-15T10:00:00.000Z' })])
      expect(screen.getByText('12 j')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('dit « non mesuré » quand le besoin n’a jamais changé d’état — jamais « 0 j »', () => {
    draw([need({ status_changed_at: null })])
    expect(screen.getByText(/non mesuré/i)).toBeInTheDocument()
    expect(screen.queryByText('0 j')).not.toBeInTheDocument()
  })

  it('affiche « 0 j » le jour même — ce zéro-là est VRAI', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-27T10:00:00.000Z'))
    try {
      draw([need({ status_changed_at: '2026-08-27T08:00:00.000Z' })])
      expect(screen.getByText('0 j')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ne peint AUCUNE alerte : la « durée type » de la source n’existe nulle part', () => {
    // La source demande « rouge au-delà de la durée type » et ne chiffre jamais
    // cette durée type. Un seuil inventé produirait une alerte rouge que
    // personne n'a décidée — l'âge nu est vrai, la couleur ne le serait pas.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-27T10:00:00.000Z'))
    try {
      const { container } = draw([need({ status_changed_at: '2025-01-01T10:00:00.000Z' })])
      const cell = container.querySelector('[data-testid="need-stage-age"]')
      // La cellule doit EXISTER : sans cette ligne, un jour où la colonne
      // disparaît, `cell` vaudrait `null` et l'assertion suivante passerait sur
      // du vide — une garde borgne, exactement ce que le dépôt a payé six fois.
      expect(cell).not.toBeNull()
      expect(cell?.innerHTML).toContain('603 j')
      expect(cell?.innerHTML ?? '').not.toMatch(/danger|warning|--destructive|text-red/)
    } finally {
      vi.useRealTimers()
    }
  })
})
