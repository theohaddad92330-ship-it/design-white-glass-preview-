import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountsTable } from './AccountsTable'
import type { AccountRow } from './types'

/**
 * #2097.62 — RECETTE IPHONE DU 25/09 : `/accounts` SOUS 768PX ÉTAIT LA MÊME
 * TABLE QU'AU BUREAU, EN PLUS ÉTROIT.
 *
 * Mesuré : noms tronqués sur une ligne (« SOPRA STE… »), défilement
 * horizontal pour lire une seule ligne, colonnes illisibles. Sous 768px
 * (`useIsMobile`), le tableau cède la place à des CARTES compactes — même
 * patron que `VivierCardList.tsx` (logo, nom complet replié sur deux lignes
 * au plus, score + statut) — desktop garde la table, inchangée.
 *
 * Même faux `matchMedia` que `SidebarCollapse.test.tsx` — jsdom ne
 * l'implémente pas.
 */
function stubMatchMedia(narrow: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: narrow && query.includes('max-width'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
}

function makeRow(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'acc-1',
    company_name: 'edf',
    sector: 'Énergie',
    priority_score: 8,
    status: 'completed',
    created_at: '2026-07-01T10:00:00.000Z',
    primary_signal: 'Recrute 12 ingénieurs cloud',
    ...overrides,
  }
}

function renderTable(rows: AccountRow[]) {
  return renderWithRouter(
    <AccountsTable
      rows={rows}
      onDelete={vi.fn()}
      onArchive={vi.fn()}
      sortKey="date_desc"
      onSortKeyChange={vi.fn()}
      selectedIds={new Set<string>()}
      onSelectionChange={vi.fn()}
      onToggleAll={vi.fn()}
    />,
  )
}

describe('#2097.62 — sous 768px, /accounts rend des cartes, jamais la table étroite', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rend des cartes plutôt qu’un tableau sous 768px', async () => {
    stubMatchMedia(true)
    renderTable([makeRow()])

    await screen.findByText('Edf')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('le nom complet se replie sur deux lignes au plus, jamais tronqué à une ligne', async () => {
    stubMatchMedia(true)
    renderTable([makeRow({ company_name: 'sopra steria group' })])

    const name = await screen.findByText('Sopra steria group')
    expect(name.className).toContain('line-clamp-2')
    expect(name.className).not.toContain('truncate')
  })

  // #2932 (constat recette 27/09/2026) — même nom métier que la fiche compte
  // (`AccountVerdictSummary.tsx`) sur la carte mobile aussi : `getRecommendation`
  // est la même dérivation que la table de bureau (GA-26).
  it('porte le logo et le verdict en mots, sans aucun nombre — le nom métier de la fiche compte, pas l’ancien libellé', async () => {
    stubMatchMedia(true)
    renderTable([makeRow({ priority_score: 8 })])

    await screen.findByText('Edf')
    expect(screen.queryByText('8')).not.toBeInTheDocument()
    expect(screen.getByText('AGIR MAINTENANT')).toBeInTheDocument()
    expect(screen.queryByText('GO')).not.toBeInTheDocument()
  })

  it('nomme le statut d’une analyse incomplète, comme la table', async () => {
    stubMatchMedia(true)
    renderTable([makeRow({ status: 'analyzing' })])

    expect(await screen.findByText('En cours')).toBeInTheDocument()
  })

  it('chaque carte ouvre le dossier du compte', async () => {
    stubMatchMedia(true)
    renderTable([makeRow({ id: 'acc-42' })])

    const link = (await screen.findByText('Edf')).closest('a')
    expect(link).toHaveAttribute('href', '/accounts/acc-42')
  })

  it('le bureau garde la table — non-régression', async () => {
    stubMatchMedia(false)
    renderTable([makeRow()])

    expect(await screen.findByRole('table')).toBeInTheDocument()
  })
})
