import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountsTable } from './AccountsTable'
import { ACCOUNT_ROW_ACTION_KEYS } from './accountRowActions'
import type { AccountRow } from './types'

/**
 * SEPT ACTIONS LIVRÉES, ET AUCUNE PORTE VISIBLE.
 *
 * Sur `/accounts` en production, un clic droit sur une ligne ouvrait sept
 * actions — Partager, Relancer, Demander à Laura, Déplacer vers, Rattacher,
 * Archiver, Supprimer — et RIEN sur la ligne n'y menait. Le dépôt le savait
 * déjà pour une seule d'entre elles, et le commentaire disait pourquoi : « un
 * commercial ne fait pas de clic droit, la fonction était donc livrée et
 * introuvable ». Au doigt, le geste n'existe même pas.
 *
 * Ce fichier tient les trois propriétés qui font qu'une porte est une porte :
 *  - elle se VOIT (un bouton sur la ligne, sans clic droit) ;
 *  - elle se TABULE et porte un nom (GA-32 / GA-35) ;
 *  - elle n'a rien FERMÉ — le clic droit continue de rendre les mêmes gestes.
 */

const { navigateMock, revenueColumn, setStatusMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  revenueColumn: vi.fn(),
  setStatusMock: vi.fn(),
}))

vi.mock('@/features/accounts/hooks/useSetCommercialStatus', () => ({
  useSetCommercialStatus: () => ({ mutate: setStatusMock, isPending: false }),
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

function renderTable(rows: AccountRow[] = [makeRow()]) {
  const handlers = { onDelete: vi.fn(), onArchive: vi.fn() }
  renderWithRouter(
    <AccountsTable
      rows={rows}
      onDelete={handlers.onDelete}
      onArchive={handlers.onArchive}
      sortKey="date_desc"
      onSortKeyChange={vi.fn()}
      selectedIds={new Set<string>()}
      onSelectionChange={vi.fn()}
      onToggleAll={vi.fn()}
    />,
  )
  return handlers
}

beforeEach(() => {
  navigateMock.mockReset()
  setStatusMock.mockReset()
  revenueColumn.mockReset().mockReturnValue({
    visible: true,
    failed: false,
    canReadFinance: true,
    byAccount: new Map(),
  })
})

describe('AccountTableRow — les sept actions sortent du clic droit', () => {
  it('chaque ligne porte un bouton « … » NOMMÉ (GA-32) — la porte se voit', async () => {
    renderTable()
    await screen.findByText('Edf')

    const trigger = screen.getByRole('button', { name: 'Actions sur ce compte' })
    expect(trigger).toBeInTheDocument()
    // Un vrai `<button>`, donc tabulable et actionnable à l'Entrée (GA-35) —
    // pas un `<div onClick>` qui n'a ni tabulation, ni touche, ni annonce.
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger).toHaveAttribute('type', 'button')
  })

  it('SANS clic droit, les sept gestes sont atteignables', async () => {
    const user = userEvent.setup()
    renderTable()
    await screen.findByText('Edf')

    await user.click(screen.getByRole('button', { name: 'Actions sur ce compte' }))
    const menu = await screen.findByRole('menu')

    // Les libellés que la source nomme, dans le menu ouvert au CLIC GAUCHE.
    for (const label of [
      'Voir le compte',
      'Partager',
      'Relancer',
      'Demander à Laura',
      'Définir la prochaine action',
      'Attribuer',
      'Déplacer vers',
      'Mettre en veille',
      'Rattacher à un autre dossier…',
      'Archiver le compte',
      'Supprimer le compte',
    ]) {
      expect(within(menu).getByText(label)).toBeInTheDocument()
    }
    // Le corpus n'est pas vide, et il fait bien ONZE : sans ce compte, la garde
    // resterait verte si dix des onze entrées disparaissaient du rendu.
    expect(ACCOUNT_ROW_ACTION_KEYS).toHaveLength(11)
  })

  it('#2150.21 — « Voir le compte » (#4198.2) depuis le « … » ouvre le dossier du BON compte', async () => {
    const user = userEvent.setup()
    renderTable([makeRow({ id: 'acc-7' })])
    await screen.findByText('Edf')

    await user.click(screen.getByRole('button', { name: 'Actions sur ce compte' }))
    // Dans le MENU : la ligne porte déjà un lien nommé « Voir le compte ».
    const menu = await screen.findByRole('menu')
    await user.click(within(menu).getByText('Voir le compte'))

    expect(navigateMock).toHaveBeenCalledWith(expect.objectContaining({ to: '/accounts/$id', params: { id: 'acc-7' } }))
  })

  it('#2150.26 — « Mettre en veille » range le compte `watching`, sans rien supprimer', async () => {
    const user = userEvent.setup()
    const handlers = renderTable([makeRow({ id: 'acc-9', commercial_status: 'inbox' })])
    await screen.findByText('Edf')

    await user.click(screen.getByRole('button', { name: 'Actions sur ce compte' }))
    await user.click(await screen.findByText('Mettre en veille'))

    expect(setStatusMock).toHaveBeenCalledWith({ id: 'acc-9', status: 'watching' })
    expect(handlers.onDelete).not.toHaveBeenCalled()
    expect(handlers.onArchive).not.toHaveBeenCalled()
  })

  it('#2150.22 — « Définir la prochaine action » ouvre la saisie d’une tâche', async () => {
    const user = userEvent.setup()
    renderTable()
    await screen.findByText('Edf')

    await user.click(screen.getByRole('button', { name: 'Actions sur ce compte' }))
    await user.click(await screen.findByText('Définir la prochaine action'))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('« Supprimer » depuis le « … » appelle bien la suppression du BON compte', async () => {
    const user = userEvent.setup()
    const handlers = renderTable([makeRow({ id: 'acc-42' })])
    await screen.findByText('Edf')

    await user.click(screen.getByRole('button', { name: 'Actions sur ce compte' }))
    await user.click(await screen.findByText('Supprimer le compte'))

    expect(handlers.onDelete).toHaveBeenCalledWith('acc-42')
  })

  // #3166 (retour bêta, 28/09/2026) — Louis : « la petite icône pour
  // supprimer le compte des prospects est en dehors du carré de proposition
  // d'actions ». Mesuré : `DropdownMenuItem` (le « … » de fin de ligne) ne
  // porte pas le `gap-2` que porte son jumeau exact `ContextMenuItem` (le
  // clic droit, `ContextRowAction`) — l'icône colle donc au libellé, sans la
  // respiration que la même entrée a partout ailleurs.
  it('chaque icône du menu « … » respire — le même espacement que son jumeau du clic droit', async () => {
    const user = userEvent.setup()
    renderTable([makeRow({ id: 'acc-42' })])
    await screen.findByText('Edf')

    await user.click(screen.getByRole('button', { name: 'Actions sur ce compte' }))
    const menu = await screen.findByRole('menu')
    const deleteItem = within(menu).getByRole('menuitem', { name: /Supprimer le compte/ })

    expect(deleteItem.className).toMatch(/\bgap-2\b/)
  })

  it('ouvrir le menu n’ouvre PAS le dossier — la ligne entière est cliquable', async () => {
    const user = userEvent.setup()
    renderTable()
    await screen.findByText('Edf')

    await user.click(screen.getByRole('button', { name: 'Actions sur ce compte' }))

    // Sans `stopPropagation`, le clic remonterait à la `<tr>` et l'écran
    // partirait sur le dossier au moment même où l'on ouvre le menu.
    expect(navigateMock).not.toHaveBeenCalled()
  })

  /**
   * ⚠️ « Le clic droit rend toujours les mêmes gestes » n'est PAS testé ici, et
   * ce n'est pas un oubli : `AccountsTable.test.tsx` le prouve déjà de bout en
   * bout (clic droit → « Demander à Laura » → navigation vers `/chat`), et le
   * refaire dans ce fichier n'ajoutait aucune couverture.
   *
   * Ce qui garantit que les DEUX portes offrent les mêmes gestes n'est de toute
   * façon pas un test d'écran mais la structure : les deux menus rendent la
   * liste de `buildAccountRowActions`, couverte par `accountRowActions.test.ts`.
   * Un test d'écran ne pourrait qu'échantillonner ; la liste unique, elle, ne
   * peut pas diverger.
   */
})

/**
 * #1417.1 / #1417.7 — LA DONNÉE EXISTAIT DÉJÀ, ELLE EXISTE TOUJOURS, ELLE A
 * CHANGÉ DE PORTE.
 *
 * La colonne « Effectif » est partie le 06/09 sous le nom du compte ; le
 * 11/09, l'effectif ET l'étape du pipe se replient derrière le secteur
 * (`AccountRowFacts`) — « les informations secondaires passent en
 * tooltip/drawer », et la 2ᵉ ligne était mesurée à 159 px pour 561 de besoin.
 *
 * Ce que ces tests gardent est INCHANGÉ : la tranche se lit telle que le
 * registre la publie, l'étape du pipe rabat son défaut historique sur « À
 * trier », et une valeur absente n'écrit JAMAIS « 0 ». Seul le GESTE change —
 * et il est meilleur : un clic tabulable au lieu d'un texte écrasé à 29 px.
 */
describe('AccountTableRow — la donnée qui a changé de porte', () => {
  /** Ouvre le repli de la première ligne. */
  async function ouvrirLeRepli() {
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('account-facts-trigger'))
  }

  it('la TRANCHE d’effectif se lit telle que le registre la publie, dans le repli', async () => {
    renderTable([makeRow({ employees: '200 à 249' })])
    await ouvrirLeRepli()
    expect(await screen.findByText('200 à 249')).toBeInTheDocument()
    // Nommée : « 200 à 249 » seul ne dit pas de quoi il s'agit.
    expect(screen.getByText('Effectif')).toBeInTheDocument()
  })

  it('un effectif inconnu n’écrit JAMAIS « 0 » — ni dans le flux, ni dans le repli', async () => {
    // La question à se poser : si la valeur est absente, « 0 » est-il VRAI ?
    // Non — une entreprise dont on ignore la taille n'a pas zéro salarié.
    // Elle n'écrit donc RIEN : ni « 0 », ni un tiret, ni « non renseigné ».
    renderTable([makeRow({ employees: null })])
    await ouvrirLeRepli()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.queryByText(/salarié/)).not.toBeInTheDocument()
    expect(screen.queryByText('Effectif')).not.toBeInTheDocument()
    // Contrôle positif : le repli EST ouvert — sans lui, les trois refus
    // passeraient sur un panneau qui ne s'est jamais affiché.
    expect(screen.getByText('Détail du compte')).toBeInTheDocument()
  })

  it('l’étape du pipe est là, et rabat le défaut historique sur « À trier »', async () => {
    renderTable([makeRow({ commercial_status: 'opportunity' })])
    await ouvrirLeRepli()
    expect(await screen.findByText('À potentiel')).toBeInTheDocument()

    cleanup()
    renderTable([makeRow({ id: 'acc-2', commercial_status: undefined })])
    await ouvrirLeRepli()
    expect(await screen.findByText('À trier')).toBeInTheDocument()
  })
})

/**
 * #2719.2 — même défaut mesuré que `ContactTableRow` (#2719, retour SKAIZen
 * 22/09/2026) : la ligne du tableau des comptes n'ouvrait le dossier que par
 * un `onClick` + `navigate()` sur le `<tr>` — ni clic droit, ni ctrl/cmd-clic,
 * ni clic molette n'ouvraient un nouvel onglet, et le nom n'était pas
 * tabulable POUR LUI-MÊME (seule la ligne entière l'était, via son `onClick`
 * de souris). La garde `next-action-is-a-link.test.ts` (§5, `ROW_NAVIGATES_TO_A_PAGE`)
 * tient déjà la présence du `<Link>` par lecture de source ; ce test-ci
 * prouve le geste à l'ÉCRAN — un vrai `<a href>`.
 */
describe('AccountTableRow — le nom du compte est un vrai lien (#2719.2)', () => {
  it('le nom rend un `<a href="/accounts/$id">`, pas seulement un `onClick` de ligne', async () => {
    renderTable([makeRow({ id: 'acc-7' })])
    const link = await screen.findByRole('link', { name: 'Edf' })
    expect(link).toHaveAttribute('href', '/accounts/acc-7')
  })

  it('cliquer le nom ne déclenche pas EN PLUS le `onClick` de la ligne (pas de double navigation)', async () => {
    const user = userEvent.setup()
    renderTable([makeRow({ id: 'acc-7' })])
    const link = await screen.findByRole('link', { name: 'Edf' })

    await user.click(link)

    // Le `<Link>` a navigué par lui-même (comportement natif du routeur) ;
    // le `onClick` du `<tr>` — qui appelle `navigate()` — ne doit pas AUSSI
    // s'être déclenché, sous peine d'une navigation en double.
    expect(navigateMock).not.toHaveBeenCalled()
  })
})
