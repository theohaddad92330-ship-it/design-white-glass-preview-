import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CallListResults } from './CallListResults'

// #3819 — la confirmation (`EnrichConfirmDialog`) lit le mode démo via la session.
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
import { emptyCallListFilters, type DiscoverCallListRow } from '@/features/discover/lib/discover-call-list'

function renderWithClient(node: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

function row(overrides: Partial<DiscoverCallListRow> = {}): DiscoverCallListRow {
  return {
    key: '552120222:c1',
    siren: '552120222',
    accountId: null,
    portfolioState: 'new',
    company: 'Société Générale',
    website: 'https://www.societegenerale.com',
    reason: 'Modernisation du SI',
    signal: { type: 'hiring', label: 'Recrute un DSI', date: '2026-09-01' },
    city: 'Paris',
    department: '75',
    contactLocation: null,
    confidence: 72,
    contactId: 'c1',
    fullName: 'Jeanne Dupont',
    title: 'Directrice des Systèmes d’Information',
    level: null,
    expertise: null,
    email: 'jeanne.dupont@example.com',
    phone: '+33612345678',
    unknown: [],
    ...overrides,
  }
}

const funnel = { detected: 30, verified: 25, relevant: 2, enriched: 1 }

function noop() {}

// SIMON-FIX S.10 — recette Simon 20/10 : la colonne E-mail mesurait 47 px (« E-/mail » coupé)
// pour 458 px à Entreprise. Une colonne qui accepte de se replier sur n'importe quel caractère
// (`overflow-wrap:anywhere`) n'a plus de largeur minimale : chaque colonne en porte une, dès
// 768 px ; dessous, chaque ligne est une carte (la borne unique du produit).
describe('CallListResults — largeurs minimales des colonnes (SIMON-FIX S.10)', () => {
  it('chaque en-tête de colonne de texte porte une largeur minimale, E-mail la plus large', () => {
    renderWithClient(
      <CallListResults
        rows={[row()]}
        filters={emptyCallListFilters()}
        funnel={funnel}
        truncatedCompanies={0}
        excludedCompanies={0}
        isFetching={false}
        isError={false}
        onRetry={noop}
        followed={new Set()}
        onToggleFollow={noop}
        onDismiss={noop}
        onExport={noop}
        onExportSelection={noop}
      />,
    )
    const minRem = (name: string): number => {
      const header = screen.getByRole('columnheader', { name })
      const match = /md:min-w-\[(\d+(?:\.\d+)?)rem\]/.exec(header.className)
      return match ? Number(match[1]) : 0
    }
    expect(minRem('E-mail')).toBeGreaterThanOrEqual(12)
    expect(minRem('Téléphone')).toBeGreaterThanOrEqual(8)
    expect(minRem('Nom')).toBeGreaterThanOrEqual(8)
    expect(minRem('Entreprise')).toBeGreaterThanOrEqual(10)
  })
})

// LUDOVIC-F F.2 (LC.4, Ludovic 20/10 17 h 45) — à 1 512 px de fenêtre, la table faisait 1 120 px dans un conteneur de
// 926 px : les boutons de la colonne Action étaient rognés à droite. Cause : le plancher posé sur la CELLULE
// Entreprise (`min-w-56`) s'ajoutait à ceux des en-têtes. La somme des planchers déclarés (en-tête ET cellule,
// dès 768 px) doit tenir dans le conteneur, et l'Action garde de quoi afficher « Suivre ce compte » en entier.
const CONTAINER_REM = 926 / 16

function declaredFloorRem(className: string): number {
  let floor = 0
  for (const token of className.split(/\s+/)) {
    if (token.startsWith('max-md:')) continue
    const bare = token.replace(/^md:/, '')
    const arbitrary = /^min-w-\[(\d+(?:\.\d+)?)rem\]$/.exec(bare)
    const scale = /^min-w-(\d+)$/.exec(bare)
    if (arbitrary) floor = Math.max(floor, Number(arbitrary[1]))
    else if (scale) floor = Math.max(floor, Number(scale[1]) / 4)
  }
  return floor
}

describe('CallListResults — la somme des largeurs tient dans le conteneur (LUDOVIC-F F.2)', () => {
  function renderList() {
    renderWithClient(
      <CallListResults
        rows={[row()]}
        filters={emptyCallListFilters()}
        funnel={funnel}
        truncatedCompanies={0}
        excludedCompanies={0}
        isFetching={false}
        isError={false}
        onRetry={noop}
        followed={new Set()}
        onToggleFollow={noop}
        onDismiss={noop}
        onExport={noop}
        onExportSelection={noop}
      />,
    )
  }

  it('SAIT DIRE NON : somme des planchers (en-tête ou cellule, le plus large) ≤ 926 px, case à cocher comprise', () => {
    renderList()
    const headers = screen.getAllByRole('columnheader')
    const cells = within(screen.getAllByRole('row')[1]).getAllByRole('cell')
    expect(cells).toHaveLength(headers.length)
    const floors = headers.map((header, index) =>
      Math.max(declaredFloorRem(header.className), declaredFloorRem(cells[index].className)),
    )
    // La colonne de la case à cocher (aucun plancher déclaré) tient sur 2,5 rem au plus.
    const checkboxColumnRem = 2.5
    const total = floors.reduce((sum, floor) => sum + floor, 0) + checkboxColumnRem - floors[0]
    expect(total).toBeLessThanOrEqual(CONTAINER_REM)
  })

  it('l’Action garde la place de ses libellés en entier (≥ 7,5 rem) et ses boutons restent des cibles de 44 px', () => {
    renderList()
    const action = screen.getByRole('columnheader', { name: 'Action' })
    expect(declaredFloorRem(action.className)).toBeGreaterThanOrEqual(7.5)
    for (const name of ['Suivre ce compte', 'Écarter']) {
      expect(screen.getByRole('button', { name }).className).toMatch(/min-h-11/)
    }
  })
})
