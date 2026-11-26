import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { NeedSource, OpenNeedRow } from '@bellum/contracts'
import { NEED_SOURCES } from '@bellum/contracts'

/**
 * D'OÙ VIENT CE BESOIN (§7.2, `NEED_SOURCES`).
 *
 * Le défaut : les douze valeurs vivaient dans le contrat, la colonne était
 * écrite en base, la requête la SÉLECTIONNAIT (`need.source AS source`) et le
 * serveur la posait sur chaque ligne — puis le navigateur la jetait. Aucun
 * écran, aucun service ne lisait la constante. C'est la famille « donnée servie
 * que personne ne peut lire », et son symptôme est qu'un pipeline juste
 * ressemble trait pour trait à une base qui n'a rien collecté.
 *
 * Ce qui se teste ici est la moitié qui fait la différence à l'œil : un besoin
 * arrivé par e-mail client le DIT, et un besoin dont personne n'a noté le
 * chemin dit « origine inconnue » — jamais « saisi à la main », qui serait une
 * provenance INVENTÉE, et qui se relirait six mois plus tard comme un fait.
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

describe('besoins ouverts — l’origine du besoin', () => {
  it('porte la colonne', () => {
    draw([need()])
    // Théo C projects-besoins.R2 — l'origine vit sous le besoin, plus dans une colonne à part.
    expect(screen.getByTestId('need-source')).toBeInTheDocument()
  })

  it('dit d’où vient le besoin, en toutes lettres', () => {
    draw([need({ source: 'client_email' })])
    expect(screen.getByText('E-mail d’un client')).toBeInTheDocument()
  })

  it('dit « origine inconnue » quand personne ne l’a notée — jamais « saisi à la main »', () => {
    // Le repli honnête. Ranger d'office un besoin sans origine dans `manual`
    // inventerait une provenance, et une provenance inventée se relit comme un
    // fait — c'est la doctrine « jamais de donnée fictive » appliquée à l'œil.
    draw([need({ source: null })])
    const cell = screen.getByTestId('need-source')
    expect(cell.textContent).toContain('Origine inconnue')
    expect(cell.textContent).not.toContain('Saisi à la main')
  })

  it('n’affiche JAMAIS une clé brute, quelle que soit la valeur', () => {
    // La garde qui LIT : les douze valeurs passent par la cellule, et aucune ne
    // doit ressortir sous forme de clé i18n. Sans elle, une treizième source
    // ajoutée au contrat sans libellé s'afficherait `openNeeds.source.xxx` —
    // exactement ce qui est arrivé à `status.undefined` sur l'écran Missions.
    expect(NEED_SOURCES.length).toBe(12)
    for (const source of NEED_SOURCES) {
      const view = draw([need({ id: `n-${source}`, source: source as NeedSource })])
      const cell = view.getByTestId('need-source')
      expect(cell.textContent ?? '').not.toContain('openNeeds.source')
      expect((cell.textContent ?? '').trim().length).toBeGreaterThan(0)
      view.unmount()
    }
  })
})
