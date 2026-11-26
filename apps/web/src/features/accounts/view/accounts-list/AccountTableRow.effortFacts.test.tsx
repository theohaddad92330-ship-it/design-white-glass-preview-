import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountsTable } from './AccountsTable'
import { useAccessSummary } from './useAccessSummary'
import type { AccountRow } from './types'

/**
 * #3407.1 / #3407.4 (beta 30/09/2026, #3407) — LE NIVEAU D'EFFORT ET LES TROIS
 * FAITS D'ACTION, SUR LA LIGNE, SANS ÉCRASER LE SECTEUR.
 *
 * Recette du 30/09 (VISUEL KO) : le badge d'effort était un second enfant
 * `shrink-0` de la ligne 2 ; sur un compte étroit le libellé du secteur tombait
 * à 0 px (SNCF, BlaBlaCar, Société Générale) ou 19 px (Decathlon). L'écran
 * voisin pour les faits secondaires existe déjà — `AccountRowFacts`, le repli
 * « Détail du compte » : le niveau d'effort s'y lit en PRÉFIXE du secteur (un
 * seul texte qui se tronque) et ses précisions (raison, revue, dernière et
 * prochaine action) dans le repli. Ce fichier prouve :
 *  1. un compte SANS niveau ne montre rien (jamais un niveau deviné) ;
 *  2. un compte AVEC niveau montre le MÊME libellé que le board
 *     (`sprints.json#levels`, GA-26) ;
 *  3. il n'y a PLUS de badge concurrent du secteur sur la ligne 2 ;
 *  4. raison, revue, dernière et prochaine action se lisent dans le repli.
 */

vi.mock('@/features/propagation/hooks', () => ({
  useAccountRevenueColumn: () => ({ visible: false, failed: false, canReadFinance: false, byAccount: new Map() }),
}))
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
    employees: null,
    commercial_status: 'opportunity',
    primary_signal: null,
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

describe('#3407 — le niveau d’effort et les faits d’action, dans le texte de la ligne 2 et son repli', () => {
  it('n’affiche rien d’effort quand le compte n’a aucun niveau posé', async () => {
    renderTable([makeRow({ sprint: null })])
    const trigger = await screen.findByTestId('account-facts-trigger')
    expect(trigger.textContent).toContain('Énergie')
    expect(trigger.textContent).not.toContain('Priorité')
  })

  it('préfixe le secteur du MÊME libellé que le board d’effort — un seul texte, donc jamais 0 px', async () => {
    renderTable([makeRow({ sprint: 'focus' })])
    const trigger = await screen.findByTestId('account-facts-trigger')
    expect(trigger.textContent).toContain('Priorité forte')
    expect(trigger.textContent).toContain('Énergie')
    // Le badge concurrent du secteur n'existe plus (VISUEL KO du 30/09).
    expect(screen.queryByTestId('account-sprint-badge')).not.toBeInTheDocument()
  })

  it('le repli porte la raison, la prochaine revue et la dernière action ; la prochaine se lit SUR la ligne', async () => {
    renderTable([
      makeRow({
        sprint: 'watch',
        sprint_reason: 'Aucun budget avant le prochain exercice.',
        sprint_review_at: '2026-12-01',
        last_action_at: '2026-09-20',
        next_action_label: 'Relancer le sponsor',
        next_action_horizon: 'cette semaine',
      }),
    ])
    fireEvent.click(await screen.findByTestId('account-facts-trigger'))
    expect(await screen.findByText('Aucun budget avant le prochain exercice.')).toBeInTheDocument()
    expect(screen.getByText('01/12/2026')).toBeInTheDocument()
    expect(screen.getByText('20/09/2026')).toBeInTheDocument()
    // Refonte Théo — « Sujet & prochaine action » : l'action est écrite dans sa colonne, une seule fois.
    expect(
      screen.getByText('cette semaine · Relancer le sponsor').closest('[data-testid="account-next-action-line"]'),
    ).not.toBeNull()
    expect(screen.getAllByText('cette semaine · Relancer le sponsor')).toHaveLength(1)
  })

  it('une absence ne fait AUCUNE ligne — ni « raison non renseignée », ni date, ni action devinée', async () => {
    renderTable([makeRow({ sprint: 'volume', sprint_reason: null, sprint_review_at: null })])
    fireEvent.click(await screen.findByTestId('account-facts-trigger'))
    // Borné au repli : l'entête du tableau porte déjà une colonne « Prochaine action ».
    const repli = within(await screen.findByRole('dialog'))
    expect(repli.queryByText('Raison du niveau')).not.toBeInTheDocument()
    expect(repli.queryByText('Prochaine revue')).not.toBeInTheDocument()
    expect(repli.queryByText('Dernière action')).not.toBeInTheDocument()
    expect(repli.queryByText('Prochaine action')).not.toBeInTheDocument()
    // Le niveau, lui, est posé : il se nomme.
    expect(repli.getByText('Niveau d’effort')).toBeInTheDocument()
  })
})
