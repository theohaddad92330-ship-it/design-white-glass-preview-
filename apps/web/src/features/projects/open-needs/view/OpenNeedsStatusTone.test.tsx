import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { OpenNeedRow, ProjectNeedStatus } from '@bellum/contracts'
import { PROJECT_NEED_STATUSES } from '@bellum/contracts'

/**
 * LA TEINTE DE LA COLONNE « PHASE » — un badge `outline` UNIQUE, quel que soit
 * l'état.
 *
 * Le défaut : quatorze états — gagné, perdu, bloqué en qualification, en
 * validation client — rendaient EXACTEMENT le même badge gris. La couleur est
 * précisément ce qui permet de repérer d'un coup d'œil ce qui avance de ce qui
 * attend ; un badge unique demande de LIRE le libellé sur chaque ligne pour le
 * savoir.
 *
 * Ce qui se teste : au moins trois teintes distinctes apparaissent selon
 * l'état (la garde qui LIT), et trois états REPRÉSENTATIFS portent la bonne
 * teinte (la garde qui sait dire NON — revenir à `outline` partout la ferait
 * échouer). Les tons passent par les variantes SÉMANTIQUES du composant
 * `Badge` (`success`/`warning`/`primary`/`default`), jamais par une classe de
 * palette Tailwind ni une couleur hexadécimale.
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

/** Le badge de la colonne « Phase », par ses classes plutôt que par son texte —
 *  le libellé change de langue, la classe non. */
function phaseBadgeClassName(status: ProjectNeedStatus): string {
  const view = draw([need({ status })])
  const cell = view.getByTestId('need-status')
  const badges = [...cell.querySelectorAll('div')]
  expect(badges.length).toBeGreaterThan(0)
  // Théo C projects-besoins.R3 — pastille du statut affiché + étiquette de l'état précis.
  const className = badges.map(badge => badge.className).join(' ')
  view.unmount()
  return className
}

describe('besoins ouverts — la teinte de la colonne Phase', () => {
  it('porte la colonne', () => {
    draw([need()])
    expect(screen.getByRole('columnheader', { name: 'Phase' })).toBeInTheDocument()
  })

  it('« gagné » est en succès (vert), pas en gris neutre', () => {
    expect(phaseBadgeClassName('won')).toContain('success-soft')
  })

  it('« en veille » appelle un geste : orange, comme `STAGE_VARIANT.dormant` sur les projets', () => {
    expect(phaseBadgeClassName('on_hold')).toContain('warning-soft')
  })

  it('« perdu » reste NEUTRE — une perte assumée n’a pas à crier sur l’écran (comme `STAGE_VARIANT.lost`)', () => {
    const className = phaseBadgeClassName('lost')
    expect(className).not.toContain('danger-soft')
    expect(className).not.toContain('success-soft')
    expect(className).not.toContain('warning-soft')
  })

  it('n’est plus le MÊME badge « outline » sur tous les états — la garde qui sait dire NON', () => {
    // Si quelqu'un revient à `variant="outline"` pour les quatorze états, les
    // trois classes ci-dessous redeviennent identiques et cette assertion
    // échoue : c'est la preuve que le test peut casser le code qu'il protège.
    const classNames = new Set(PROJECT_NEED_STATUSES.map(phaseBadgeClassName))
    expect(classNames.size).toBeGreaterThanOrEqual(3)
    for (const className of classNames) {
      expect(className).not.toContain('bellum-border')
    }
  })

  it('couvre les quatorze états — aucun ne tombe sur une classe vide', () => {
    // La garde qui LIT : le corpus n'est pas vide, et chaque état produit
    // réellement une classe (le `Record` exhaustif ne laisse `undefined` passer
    // pour aucune valeur de `PROJECT_NEED_STATUSES`).
    expect(PROJECT_NEED_STATUSES.length).toBeGreaterThan(0)
    for (const status of PROJECT_NEED_STATUSES) {
      expect(phaseBadgeClassName(status).trim().length).toBeGreaterThan(0)
    }
  })
})
