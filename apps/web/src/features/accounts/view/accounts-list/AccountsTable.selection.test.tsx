import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountsTable } from './AccountsTable'
import type { AccountRow } from './types'

/**
 * LA SÉLECTION AVAIT UN CONSOMMATEUR, PAS DE PRODUCTEUR.
 *
 * `SelectionBar`, `CompareDialog`, `CompareDialogTable`, `CompareAiSection` et
 * `CompareBestBanner` sont écrits, testés… et injoignables : `AccountsPage`
 * tenait bien un `Set<string>`, mais RIEN sur l'écran ne pouvait y ajouter un
 * identifiant — `onSelectedIdsChange` n'était appelé que pour RETIRER (après
 * une suppression) ou pour VIDER. `AccountsTable` n'avait aucune prop de
 * sélection, et `AccountTableRow` aucune case à cocher.
 *
 * C'est le défaut n°1 du dépôt : du code juste, calculé, testé, que personne
 * n'appelle. Ce fichier tient l'autre moitié — que la ligne PRODUISE la
 * sélection, et que le geste ne parte pas ouvrir le dossier au passage.
 */

const { navigateMock, revenueColumn } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  revenueColumn: vi.fn(),
}))

vi.mock('@/features/propagation/hooks', () => ({ useAccountRevenueColumn: () => revenueColumn() }))

vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigateMock,
}))

function makeRow(over: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'acc-1',
    company_name: 'edf',
    sector: 'Énergie',
    priority_score: 8,
    status: 'completed',
    created_at: '2026-07-01T10:00:00.000Z',
    ...over,
  }
}

type Handlers = {
  onSelectionChange: ReturnType<typeof vi.fn>
  onToggleAll: ReturnType<typeof vi.fn>
}

function renderTable(rows: AccountRow[], selectedIds: ReadonlySet<string> = new Set<string>()): Handlers {
  const handlers: Handlers = { onSelectionChange: vi.fn(), onToggleAll: vi.fn() }
  renderWithRouter(
    <AccountsTable
      rows={rows}
      onDelete={vi.fn()}
      onArchive={vi.fn()}
      sortKey="date_desc"
      onSortKeyChange={vi.fn()}
      selectedIds={selectedIds}
      onSelectionChange={handlers.onSelectionChange}
      onToggleAll={handlers.onToggleAll}
    />,
  )
  return handlers
}

beforeEach(() => {
  navigateMock.mockReset()
  revenueColumn.mockReset().mockReturnValue({
    visible: true,
    failed: false,
    canReadFinance: true,
    byAccount: new Map(),
  })
})

describe('AccountsTable — le rail de sélection', () => {
  it('donne à chaque ligne une case NOMMÉE (GA-32 : une commande sans texte porte son nom)', async () => {
    renderTable([makeRow({ id: 'a', company_name: 'edf' }), makeRow({ id: 'b', company_name: 'lcl' })])

    expect(await screen.findByRole('checkbox', { name: 'Sélectionner Edf' })).toBeInTheDocument()
    expect(await screen.findByRole('checkbox', { name: 'Sélectionner Lcl' })).toBeInTheDocument()
  })

  it('remonte l’identifiant de la ligne cochée', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const handlers = renderTable([makeRow({ id: 'acc-42', company_name: 'edf' })])

    await user.click(await screen.findByRole('checkbox', { name: 'Sélectionner Edf' }))

    expect(handlers.onSelectionChange).toHaveBeenCalledWith('acc-42', true)
  })

  it('DÉcoche une ligne déjà sélectionnée', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const handlers = renderTable([makeRow({ id: 'acc-42', company_name: 'edf' })], new Set(['acc-42']))

    const box = await screen.findByRole('checkbox', { name: 'Sélectionner Edf' })
    expect(box).toBeChecked()

    await user.click(box)

    expect(handlers.onSelectionChange).toHaveBeenCalledWith('acc-42', false)
  })

  /**
   * La ligne entière ouvre le dossier. Sans `stopPropagation`, cocher une case
   * cocherait ET quitterait l'écran — la sélection serait perdue à l'instant
   * même où elle est faite, ce qui la rendrait aussi inutile que son absence.
   */
  it('ne navigue PAS vers le dossier quand on coche', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderTable([makeRow({ id: 'acc-42', company_name: 'edf' })])

    await user.click(await screen.findByRole('checkbox', { name: 'Sélectionner Edf' }))

    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('se pilote au CLAVIER — la case se tabule et l’espace la coche (GA-35)', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const handlers = renderTable([makeRow({ id: 'acc-42', company_name: 'edf' })])

    const box = await screen.findByRole('checkbox', { name: 'Sélectionner Edf' })
    box.focus()
    expect(box).toHaveFocus()
    await user.keyboard(' ')

    expect(handlers.onSelectionChange).toHaveBeenCalledWith('acc-42', true)
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('porte une cible de 44 px au doigt (GA-30)', async () => {
    renderTable([makeRow({ id: 'acc-42', company_name: 'edf' })])

    const box = await screen.findByRole('checkbox', { name: 'Sélectionner Edf' })
    const target = box.closest('[data-slot="account-select"]')
    expect(target).not.toBeNull()
    expect(target!.className).toContain('pointer-coarse:min-h-11')
    expect(target!.className).toContain('pointer-coarse:min-w-11')
  })
})

describe('AccountsTable — la case « tout sélectionner »', () => {
  it('coche les lignes CHARGÉES d’un coup', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const handlers = renderTable([makeRow({ id: 'a' }), makeRow({ id: 'b', company_name: 'lcl' })])

    await user.click(await screen.findByRole('checkbox', { name: 'Tout sélectionner' }))

    expect(handlers.onToggleAll).toHaveBeenCalledWith(true)
  })

  it('relâche tout quand tout est déjà coché', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const handlers = renderTable([makeRow({ id: 'a' }), makeRow({ id: 'b', company_name: 'lcl' })], new Set(['a', 'b']))

    const all = await screen.findByRole('checkbox', { name: 'Tout sélectionner' })
    expect(all).toBeChecked()

    await user.click(all)

    expect(handlers.onToggleAll).toHaveBeenCalledWith(false)
  })

  /** Ni cochée ni vide : « mixed » est le seul état qui dit la vérité quand une
   *  partie seulement des lignes est retenue. */
  it('s’annonce « mixed » quand une partie seulement des lignes est cochée', async () => {
    renderTable([makeRow({ id: 'a' }), makeRow({ id: 'b', company_name: 'lcl' })], new Set(['a']))

    const all = await screen.findByRole('checkbox', { name: 'Tout sélectionner' })
    expect(all).toHaveAttribute('aria-checked', 'mixed')
  })

  it('reste vide quand aucune ligne n’est cochée', async () => {
    renderTable([makeRow({ id: 'a' }), makeRow({ id: 'b', company_name: 'lcl' })])

    const all = await screen.findByRole('checkbox', { name: 'Tout sélectionner' })
    expect(all).toHaveAttribute('aria-checked', 'false')
  })

  it('ne déclenche pas le tri de la colonne « Compte » (la case et le tri partagent l’entête)', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onSortKeyChange = vi.fn()
    renderWithRouter(
      <AccountsTable
        rows={[makeRow({ id: 'a' })]}
        onDelete={vi.fn()}
        onArchive={vi.fn()}
        sortKey="date_desc"
        onSortKeyChange={onSortKeyChange}
        selectedIds={new Set<string>()}
        onSelectionChange={vi.fn()}
        onToggleAll={vi.fn()}
      />,
    )

    await user.click(await screen.findByRole('checkbox', { name: 'Tout sélectionner' }))

    expect(onSortKeyChange).not.toHaveBeenCalled()
  })
})
