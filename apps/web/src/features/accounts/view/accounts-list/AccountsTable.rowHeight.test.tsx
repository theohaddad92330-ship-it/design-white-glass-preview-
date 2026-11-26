import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountsTable } from './AccountsTable'
import { useAccessSummary } from './useAccessSummary'
import type { AccountRow } from './types'

/**
 * #1412 / #1413.1 — LA LIGNE DU TABLEAU COMPTES N'A PAS DE HAUTEUR.
 * #1416 — LE CLIC SUR LE SIGNAL DOMINANT EST AVALÉ.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CE QUI SE VOYAIT
 * ───────────────────────────────────────────────────────────────────────────
 * Une cellule « Effectif » large de 96 px rendait `row.employees` brut —
 * « 10 000 salariés et plus (tranche INSEE 2023) ». Rien ne la tronquait, et
 * un `<td>` ne pose aucune hauteur : la ligne prenait celle de sa cellule la
 * plus haute, soit quatre lignes de texte pour une seule. Le même défaut vivait
 * sur « Statut commercial » et « Dernière analyse ». La colonne « Signal », elle,
 * était DÉJÀ bornée (`max-w-48 overflow-hidden` + `truncate`) — c'est la preuve
 * que le correctif était connu et n'avait pas été appliqué aux voisines : on
 * corrige la FAMILLE, pas la ligne signalée.
 *
 * ⚠️ #1412.2 (« chevauchement de colonnes ») décrit le symptôme, pas la cause.
 * La table est `table-fixed md:min-w-[1476px]` dans un `overflow-x-auto` : les
 * COLONNES ont une largeur fixe et ne peuvent ni se pousser ni se chevaucher.
 * Ce qui se voyait est le retour à la ligne ci-dessus — et, accessoirement, un
 * `<td>` ne clippe RIEN par défaut, donc une pilule `whitespace-nowrap` plus
 * large que sa cellule se peignait par-dessus la voisine. Les deux se ferment
 * par la même borne ; aucune ligne de code n'a été écrite pour « décaler des
 * colonnes », il n'y avait rien à décaler.
 *
 * Sur le signal, le clic appelait `event.stopPropagation()` et rien d'autre :
 * il coupait la navigation de la ligne SANS ouvrir l'aperçu, que seul un survol
 * de 500 ms déclenchait. Le geste le plus naturel ne faisait rien du tout.
 *
 * ⚠️ jsdom ne met rien en page : ces tests vérifient la BORNE (les classes qui
 * la posent, et le titre qui rend la valeur complète accessible), pas des
 * pixels. La hauteur réelle se mesure en recette.
 */

vi.mock('@/features/propagation/hooks', () => ({
  useAccountRevenueColumn: () => ({ visible: false, failed: false, canReadFinance: false, byAccount: new Map() }),
}))
vi.mock('./useAccessSummary', () => ({ useAccessSummary: vi.fn() }))
const useAccessSummaryMock = vi.mocked(useAccessSummary)

beforeEach(() => {
  useAccessSummaryMock.mockReturnValue({ isError: false } as ReturnType<typeof useAccessSummary>)
})

/** L'effectif tel que l'INSEE le sert : une tranche, pas un nombre. */
const LONG_EMPLOYEES = '10 000 salariés et plus (tranche INSEE 2023)'
/** Le libellé rendu pour `commercial_status: 'opportunity'`. */
const COMMERCIAL_STATUS = 'À potentiel'
/** La date rendue par la colonne « Dernière analyse » pour `created_at` ci-dessous. */
const ANALYSED_ON = '01/07/2026'

function makeRow(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'acc-1',
    company_name: 'edf',
    sector: 'Énergie',
    priority_score: 8,
    status: 'completed',
    created_at: '2026-07-01T10:00:00.000Z',
    employees: LONG_EMPLOYEES,
    commercial_status: 'opportunity',
    primary_signal: 'Recrute 40 ingénieurs data sur trois sites, dont Lyon et Nantes',
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

/** La cellule `<td>` qui porte ce texte. */
function cellOf(text: string): HTMLElement {
  const node = screen.getByText(text)
  const cell = node.closest('td')
  expect(cell, `aucun <td> autour de « ${text} »`).not.toBeNull()
  return cell!
}

describe('#1412 / #1413.1 — chaque cellule du tableau Comptes tient sur UNE ligne', () => {
  it('la ligne est bien rendue avec ses valeurs longues — sans elles, tout ce qui suit passerait sur du vide', async () => {
    renderTable([makeRow()])
    await screen.findByText('Edf')
    // Le secteur est l'UNIQUE texte de la 2ᵉ ligne depuis #1417.1, et il porte
    // le repli qui contient tout le reste.
    expect(screen.getByTestId('account-facts-trigger')).toBeInTheDocument()
    expect(screen.getByText(ANALYSED_ON)).toBeInTheDocument()
  })

  /* #1417 — « Effectif » puis « Statut commercial » ne sont plus des cellules :
     le premier est descendu sous le nom du compte le 06/09, les DEUX se sont
     repliés derrière le secteur le 11/09 (`AccountRowFacts`). Ce qui reste ici
     est la borne des cellules qui EXISTENT encore. */
  it.each([['Dernière analyse', ANALYSED_ON]])(
    '%s : la cellule borne son contenu et le texte est tronqué',
    async (column, text) => {
      renderTable([makeRow()])
      await screen.findByText('Edf')

      const cell = cellOf(text)
      // La borne du conteneur — sans elle, `truncate` n'a rien à mesurer.
      expect(cell.className, `${column} : la cellule doit borner son contenu`).toMatch(/overflow-hidden/)
      // La troncature du texte lui-même.
      expect(screen.getByText(text).className, `${column} : le texte doit être tronqué`).toMatch(/truncate/)
    },
  )

  /**
   * #1417.7 — LA VALEUR COMPLÈTE NE SE LIT PLUS « AU SURVOL », ET C'EST MIEUX.
   *
   * Elle vivait dans un `title=`, qui n'existe ni au clavier ni au doigt : le
   * dépôt a déjà payé « la donnée rangée dans un attribut title ». Elle vit
   * maintenant derrière un `<button type="button">` — ce qui se clique se
   * tabule (GA-35) — et elle y est NOMMÉE, ce qu'une infobulle ne fait pas.
   */
  it('la valeur complète reste atteignable — au clavier, et nommée', async () => {
    const user = userEvent.setup()
    renderTable([makeRow()])
    await screen.findByText('Edf')

    const trigger = screen.getByTestId('account-facts-trigger')
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger).not.toHaveAttribute('title')

    await user.click(trigger)
    expect(await screen.findByText(LONG_EMPLOYEES)).toBeInTheDocument()
    expect(screen.getByText('Effectif')).toBeInTheDocument()
    expect(screen.getByText(COMMERCIAL_STATUS)).toBeInTheDocument()
  })

  it('#3508 — le secteur se replie SOUS le nom au lieu d’être tronqué', async () => {
    // Une valeur longue rendue sans borne ferait grandir la ligne entière : la
    // règle survit au déménagement, c'est le déclencheur du repli qui la porte.
    renderTable([makeRow()])
    await screen.findByText('Edf')
    expect(screen.getByTestId('account-facts-trigger').className).not.toMatch(/truncate/)
  })
})

describe('#1416 — le signal dominant s’ouvre au CLIC, pas seulement au survol', () => {
  it('le déclencheur est un bouton, tabulable, avec un nom qui dit ce qu’il fait', async () => {
    renderTable([makeRow()])
    await screen.findByText('Edf')

    const trigger = screen.getByRole('button', { name: /signal dominant/i })
    // GA-35 : ce qui se clique se tabule. Un `<div onClick>` n'a ni tabulation
    // ni Entrée ni annonce.
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger.getAttribute('type')).toBe('button')
  })

  it('OUVRE l’aperçu au clic, au lieu d’avaler le geste', async () => {
    const user = userEvent.setup()
    renderTable([makeRow()])
    await screen.findByText('Edf')

    const trigger = screen.getByRole('button', { name: /signal dominant/i })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    await user.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })
})
