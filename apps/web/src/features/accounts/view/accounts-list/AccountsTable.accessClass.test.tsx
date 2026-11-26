import { screen } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountsTable } from './AccountsTable'
import { useAccessSummary } from './useAccessSummary'
import type { AccountRow } from './types'

/**
 * LA COLONNE D'ACCESSIBILITÉ — manque B du 30/08, puis N21 du 30/08.
 *
 * `raw_analysis.access_barrier` existe déjà par compte et atteint déjà
 * l'onglet Accès (`TabAccess.tsx`, depuis le 29/08) — mais zéro occurrence de
 * `access_barrier` / `accessBarrier` dans `accounts-list/`, et aucun moyen de
 * voir d'un coup d'œil quels comptes du portefeuille sont ouverts.
 *
 * `row.accessClass` arrive FUSIONNÉ par `AccountContent.tsx` (voir
 * `useAccessSummary.ts`) — cette table se contente de le LIRE, jamais de
 * l'estimer.
 *
 * ⚠️ N21 : `GET /accounts/access-summary` peut ÉCHOUER (500 vu en prod). Sur
 * cet écran, l'échec rendait alors EXACTEMENT le même tiret que « aucune
 * barrière lisible » — impossible de distinguer une panne d'un vide. La
 * cellule lit maintenant `useAccessSummary().isError` en PLUS de
 * `row.accessClass`, exactement comme `AccountTableRow` lit déjà `useAccountRevenueColumn()`
 * pour la colonne du montant facturé (`revenue.failed`, motif copié, pas
 * réinventé).
 */
vi.mock('@/features/propagation/hooks', () => ({
  useAccountRevenueColumn: () => ({ visible: false, failed: false, canReadFinance: false, byAccount: new Map() }),
}))

// Avant N21, `AccountTableRow` ne lisait pas du tout ce hook (`row.accessClass`
// suffisait) : ce mock n'existait pas. Il l'appelle maintenant pour savoir si
// la lecture a échoué — exactement comme il lit déjà `useAccountRevenueColumn()`
// pour `revenue.failed`. Par défaut : une lecture réussie, sans rien de
// particulier — ce que les quatre tests déjà écrits attendent.
vi.mock('./useAccessSummary', () => ({ useAccessSummary: vi.fn() }))
const useAccessSummaryMock = vi.mocked(useAccessSummary)

beforeEach(() => {
  useAccessSummaryMock.mockReturnValue({ isError: false } as ReturnType<typeof useAccessSummary>)
})

function makeRow(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'acc-1',
    company_name: 'edf',
    sector: 'Énergie',
    priority_score: 8,
    status: 'completed',
    created_at: '2026-07-01T10:00:00.000Z',
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

describe('AccountsTable — colonne accessibilité', () => {
  it.each([
    ['A', 'Ouvert'],
    ['B', 'Par une entité'],
    ['C', 'Semi-ouvert'],
    ['D', 'Verrouillé'],
  ] as const)('affiche la classe %s comme « %s »', async (accessClass, label) => {
    renderTable([makeRow({ accessClass })])

    expect(await screen.findByText(label)).toBeInTheDocument()
  })

  // Recette démo 05/10/2026 : le bandeau dit « 2 de classe d'accès A ou B » et la colonne écrit
  // « Par une entité » sans lettre — le lecteur ne pouvait pas rapprocher les deux. La lettre se lit.
  it.each(['A', 'B', 'C', 'D'] as const)('écrit la LETTRE de la classe %s à côté de son libellé', async accessClass => {
    renderTable([makeRow({ accessClass })])

    await screen.findByText('Edf')
    expect(screen.getByTestId('access-class-letter')).toHaveTextContent(accessClass)
  })

  // #4659 (recette prod 27/10) — la pastille écrivait « AOuvert » : le Badge est `inline-flex`, l'espace JSX entre
  // la lettre et le libellé n'est qu'un nœud texte, que flex supprime. Deux éléments, un vrai écart entre eux.
  it('#4659 — la lettre et le libellé sont deux éléments séparés par un écart, jamais collés', async () => {
    renderTable([makeRow({ accessClass: 'A' })])

    await screen.findByText('Edf')
    const letter = screen.getByTestId('access-class-letter')
    const label = screen.getByText('Ouvert')
    expect(label).not.toBe(letter)
    expect(label.contains(letter)).toBe(false)
    expect(letter.parentElement).toBe(label.parentElement)
    expect(letter.parentElement?.className).toMatch(/\bgap-1\b/)
  })

  it('écrit « — », jamais une classe devinée, quand aucune barrière n’est lisible pour ce compte', async () => {
    renderTable([makeRow({ accessClass: null })])

    await screen.findByText('Edf')
    // Le tiret porte le même nom accessible qu'ailleurs dans ce tableau (score,
    // effectif) : un lecteur d'écran doit dire POURQUOI la cellule est vide.
    expect(screen.getByTitle('Accessibilité non estimée')).toBeInTheDocument()
  })

  it('écrit aussi « — » tant que le résumé n’a pas encore été fusionné (champ absent)', async () => {
    renderTable([makeRow()])

    await screen.findByText('Edf')
    expect(screen.getByTitle('Accessibilité non estimée')).toBeInTheDocument()
  })

  describe('N21 — une PANNE de lecture, jamais un « — » muet', () => {
    it('dit que la LECTURE a échoué — jamais « — », jamais une classe devinée', async () => {
      useAccessSummaryMock.mockReturnValue({ isError: true } as ReturnType<typeof useAccessSummary>)
      // Le champ n'a pas pu être fusionné (`AccountContent.tsx` renvoie les
      // comptes tels quels sur un échec) : `accessClass` reste absent, comme
      // pendant le chargement. Seul `useAccessSummary().isError` distingue les
      // deux cas.
      renderTable([makeRow({ accessClass: undefined })])

      await screen.findByText('Edf')
      // Ni le tiret « non estimé »…
      expect(screen.queryByTitle('Accessibilité non estimée')).not.toBeInTheDocument()
      // … ni une classe : la cellule ACCUSE la lecture, jamais la donnée.
      expect(screen.queryByText('Ouvert')).not.toBeInTheDocument()
      expect(screen.getByText('Non lue')).toBeInTheDocument()
      expect(screen.getByTitle('L’accessibilité n’a pas pu être lue.')).toBeInTheDocument()
    })

    it('une classe déjà fusionnée avant la panne ne se lit pas comme la valeur COURANTE', async () => {
      // Cas limite : la ligne porte encore une classe d'un rendu précédent
      // (React Query garde `data` pendant un refetch qui échoue) — mais
      // `isError` dit que CETTE lecture a raté. La cellule doit suivre
      // l'échec, pas la donnée périmée, sinon une panne se lirait comme un
      // succès silencieux.
      useAccessSummaryMock.mockReturnValue({ isError: true } as ReturnType<typeof useAccessSummary>)
      renderTable([makeRow({ accessClass: 'A' })])

      await screen.findByText('Edf')
      expect(screen.queryByText('Ouvert')).not.toBeInTheDocument()
      expect(screen.getByText('Non lue')).toBeInTheDocument()
    })
  })
})
