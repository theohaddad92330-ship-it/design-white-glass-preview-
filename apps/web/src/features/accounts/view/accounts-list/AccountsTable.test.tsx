import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountsTable } from './AccountsTable'
import type { AccountRow } from './types'

const { navigateMock, revenueColumn } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  revenueColumn: vi.fn(),
}))

/**
 * La colonne « Facturé » (§4.2) est CONDITIONNELLE : elle disparaît pour qui
 * n'a aucun droit financier. Entête, cellule, largeur minimale et squelette
 * lisent le MÊME hook — c'est ce que ce mock exerce, et c'est la seule chose
 * qui empêche un décalage de colonne dans ce dossier (GA-29 ne compare que ce
 * qui tient dans un seul fichier, or l'entête et la cellule sont dans deux).
 */
// F1-FIX #4345 — sur bureau « Demander à Laura » ouvre la bulle SUR PLACE ; ce test garde l'AUTRE chemin
// (mobile, surcouche, /chat : le hook rend `null` et le lien vers /chat reste le seul accès).
vi.mock('@/features/laura/bubble/use-open-laura-in-place', () => ({ useOpenLauraInPlace: () => null }))
vi.mock('@/features/propagation/hooks', () => ({ useAccountRevenueColumn: () => revenueColumn() }))

// Radix context menus need these pointer APIs, which jsdom doesn't implement.
// It also positions via floating-ui, which reads `DOMRect.fromRect` — absent in
// jsdom, so opening the menu otherwise throws an async "reading 'fromRect'".
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  const g = globalThis as unknown as { DOMRect?: unknown }
  if (typeof g.DOMRect === 'undefined') {
    class DOMRectPolyfill {
      x: number
      y: number
      width: number
      height: number
      constructor(x = 0, y = 0, width = 0, height = 0) {
        this.x = x
        this.y = y
        this.width = width
        this.height = height
      }
      get top() {
        return this.y
      }
      get left() {
        return this.x
      }
      get right() {
        return this.x + this.width
      }
      get bottom() {
        return this.y + this.height
      }
      toJSON() {
        return { ...this }
      }
      static fromRect(r?: { x?: number; y?: number; width?: number; height?: number }) {
        return new DOMRectPolyfill(r?.x, r?.y, r?.width, r?.height)
      }
    }
    g.DOMRect = DOMRectPolyfill
  }
})

vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigateMock,
}))

/** A real-world NAF label — the kind that used to wrap to three lines and blow
 *  the row height out of rhythm. */
const LONG_SECTOR = "Production, transport et distribution d'électricité et de gaz"

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

beforeEach(() => {
  // Le cas NORMAL : la colonne est là. Chaque test qui veut l'autre état le dit.
  revenueColumn.mockReset().mockReturnValue({
    visible: true,
    failed: false,
    canReadFinance: true,
    byAccount: new Map(),
  })
})

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

/** Reads the horizontal alignment a cell resolves to, the same way the browser
 *  does: the explicit `text-*` utility if present, otherwise the default. */
function alignmentOf(cell: HTMLElement): 'left' | 'center' | 'right' {
  const classes = cell.className
  if (classes.includes('text-right')) return 'right'
  if (classes.includes('text-center')) return 'center'
  return 'left'
}

describe('AccountsTable', () => {
  beforeEach(() => {
    navigateMock.mockReset()
  })

  describe('status badge (PR #622 — a failed analysis must not read as a finished one)', () => {
    it('stays visible for an account whose analysis failed', async () => {
      renderTable([makeRow({ status: 'error' })])

      expect(await screen.findByText('Erreur')).toBeInTheDocument()
    })

    it('stays visible for an account still being analysed', async () => {
      renderTable([makeRow({ status: 'analyzing' })])

      expect(await screen.findByText('En cours')).toBeInTheDocument()
    })

    it('is absent for a completed account — no badge noise on the happy path', async () => {
      renderTable([makeRow({ status: 'completed' })])

      await screen.findByText('Edf')
      expect(screen.queryByText('Terminé')).not.toBeInTheDocument()
    })

    it('keeps the verdict visible, in words, on a failed account (deliberate: real data from an earlier run)', async () => {
      renderTable([makeRow({ status: 'error', priority_score: 8 })])

      expect(await screen.findByText('AGIR MAINTENANT')).toBeInTheDocument()
      expect(screen.queryByText('8')).not.toBeInTheDocument()
    })

    // #3666 — un ancien chiffre ne se présente jamais comme actuel pendant une analyse.
    it('#3666 — an account being analysed shows no score, no verdict, no gauge: "Analyse en cours"', async () => {
      renderTable([makeRow({ status: 'analyzing', priority_score: 5, score_unarbitrated: true })])

      expect(await screen.findByTestId('score-analyzing')).toHaveTextContent('Analyse en cours')
      expect(screen.queryByText('5')).not.toBeInTheDocument()
      expect(screen.queryByTestId('score-unarbitrated')).not.toBeInTheDocument()
    })

    // NOTE: jsdom does no layout, so "renders on a single line" cannot be
    // asserted from geometry (offsetHeight is always 0). The assertion below is
    // therefore on the class string that *causes* the single line —
    // `whitespace-nowrap`. It is a weaker, implementation-coupled test than a
    // real layout assertion would be; it is here because the two-line badge was
    // the user-visible bug and a regression must not pass silently.
    it('never wraps: "En cours" must not break into "En" / "cours"', async () => {
      renderTable([makeRow({ status: 'analyzing' })])

      const badge = (await screen.findByText('En cours')).closest('[data-testid="account-status-badge"]')
      expect(badge).not.toBeNull()
      expect(badge!.className).toContain('whitespace-nowrap')
      // It must also refuse to be squeezed by a long company name next to it.
      expect(badge!.className).toContain('shrink-0')
    })
  })

  describe('badge « intermédiaire » (#2265.14, épopée #2851)', () => {
    it('marque un compte classé cabinet de recrutement / plateforme', async () => {
      renderTable([makeRow({ is_intermediary: true })])

      expect(await screen.findByTestId('account-intermediary-badge')).toBeInTheDocument()
    })

    it('reste silencieux pour un client final', async () => {
      renderTable([makeRow({ is_intermediary: false })])

      await screen.findByText('Edf')
      expect(screen.queryByTestId('account-intermediary-badge')).not.toBeInTheDocument()
    })

    it('reste silencieux tant que le compte n’a jamais été rejoué depuis ce lot (jamais un badge deviné)', async () => {
      renderTable([makeRow({ is_intermediary: null })])

      await screen.findByText('Edf')
      expect(screen.queryByTestId('account-intermediary-badge')).not.toBeInTheDocument()
    })
  })

  describe('row rhythm', () => {
    /**
     * #1417.1 — le secteur se tronque toujours à une ligne, mais ce qui dépasse
     * n'est plus rangé dans un `title=` : il vit derrière un bouton, donc au
     * clavier et au doigt aussi (`AccountRowFacts`). Le dépôt a déjà payé « la
     * donnée rangée dans un attribut title ».
     */
    it('wraps a long sector (#3508, no truncation) and keeps the full text reachable by keyboard', async () => {
      renderTable([makeRow({ sector: LONG_SECTOR })])

      const trigger = await screen.findByTestId('account-facts-trigger')
      expect(trigger.textContent).toContain(LONG_SECTOR)
      expect(trigger.className).not.toContain('truncate')
      expect(trigger.className).toContain('whitespace-normal')
      expect(trigger.tagName).toBe('BUTTON')
      expect(trigger).not.toHaveAttribute('title')
    })

    // NOTE: also a class-string assertion — jsdom reports every offsetHeight as
    // 0, so "the rows are the same height" is not observable. Pinning an
    // explicit height on the row is what actually makes it true in a browser.
    it('pins an explicit row height so a long sector cannot stretch the row', async () => {
      renderTable([
        makeRow({ id: 'a', company_name: 'edf', sector: LONG_SECTOR }),
        makeRow({ id: 'b', company_name: 'lcl', sector: 'Banque' }),
      ])

      await screen.findByText('Edf')
      const rows = screen.getAllByRole('row').slice(1) // drop the header row
      expect(rows).toHaveLength(2)
      rows.forEach(row => expect(row.className).toMatch(/\bh-\d+\b/))
      expect(rows[0]!.className).toBe(rows[1]!.className)
    })
  })

  describe('« Données à rafraîchir » (report V2 §4 — a stale analysis invites a refresh)', () => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

    it('flags an account whose last analysis is older than 90 days', async () => {
      renderTable([makeRow({ last_analyzed_at: daysAgo(120) })])

      expect(await screen.findByText('À rafraîchir')).toBeInTheDocument()
    })

    it('stays silent when the last analysis is recent — no false alarm', async () => {
      renderTable([makeRow({ last_analyzed_at: daysAgo(5) })])

      await screen.findByText('Edf')
      expect(screen.queryByText('À rafraîchir')).not.toBeInTheDocument()
    })

    it('stays silent when there is no completed analysis to date', async () => {
      renderTable([makeRow({ status: 'inbox', last_analyzed_at: null, created_at: daysAgo(400) })])

      await screen.findByText('Edf')
      expect(screen.queryByText('À rafraîchir')).not.toBeInTheDocument()
    })
  })

  describe('« Demander à Laura » (report V2 §4 — one click from an account to the copilot)', () => {
    it('deep-links to the copilot pre-scoped to the account', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      renderTable([makeRow({ id: 'acc-42' })])

      const row = (await screen.findByText('Edf')).closest('tr')!
      await user.pointer({ keys: '[MouseRight]', target: row })

      await user.click(await screen.findByText('Demander à Laura'))

      expect(navigateMock).toHaveBeenCalledWith({ to: '/chat', search: { accountId: 'acc-42' } })
    })
  })

  describe('column alignment', () => {
    // The header and its cell must resolve to the SAME rule — a header aligned
    // one way over a cell aligned another is what made the table read as
    // "brouillon". Text reads left; the score pastille is centred; the trailing
    // action is right.
    /* Refonte Théo (contrôle du 23/10/2026) — `.a4-table` : SEPT colonnes, toutes alignées à gauche comme
       chez Théo, sauf le « … » collé au bord. Accessibilité, grille de qualification et dernière analyse ne
       sont plus des colonnes : elles se lisent sous la Relation et sous la Décision qu'elles qualifient.
       Avant : neuf colonnes (#1417, #3749, refonte Théo du lot Sonnet). */
    const EXPECTED_ALIGNMENT: ReadonlyArray<'left' | 'center' | 'right'> = [
      'left', // Compte
      'left', // Sujet & prochaine action (ex-« Signal dominant » + « Prochaine action »)
      'left', // Relation (+ classe d'accessibilité dessous)
      'left', // Personnes — visages, nombre, badge Décideur
      'left', // Responsable
      'left', // Décision d'équipe + verdict, en mots (+ grille et date d'analyse dessous)
      'right', // Le « … » — collé au bord
    ]
    /* #1413.2 — « Prêt à facturer » et « Facturé » ont QUITTÉ cette liste.
       Ce tableau ne rend que l'angle COMMERCIAL (l'angle facturation rend des
       cartes depuis le 31/08) : les deux colonnes d'argent ne s'affichaient
       donc que sous l'angle qui ne les demande pas. Elles vivent maintenant
       sur `AccountBillingCard`. */

    it('applies the same alignment rule to every header and its cell', async () => {
      renderTable([makeRow()])

      await screen.findByText('Edf')
      const headerRow = screen.getAllByRole('row')[0]!
      const bodyRow = screen.getAllByRole('row')[1]!
      const headers = within(headerRow).getAllByRole('columnheader')
      const cells = within(bodyRow).getAllByRole('cell')

      expect(headers).toHaveLength(EXPECTED_ALIGNMENT.length)
      expect(cells).toHaveLength(EXPECTED_ALIGNMENT.length)
      EXPECTED_ALIGNMENT.forEach((expected, i) => {
        expect(`header${i}:${alignmentOf(headers[i]!)}`).toBe(`header${i}:${expected}`)
        expect(`cell${i}:${alignmentOf(cells[i]!)}`).toBe(`cell${i}:${expected}`)
      })
    })

    /**
     * #1413.2 — « ne pas afficher par défaut des colonnes comme "Prêt à
     * facturer" sous l'angle commercial ».
     *
     * ⚠️ Ce test remplace celui qui vérifiait que « Facturé » disparaissait des
     * DEUX côtés sans droit financier. Cette conditionnelle n'a pas disparu :
     * elle a DÉMÉNAGÉ sur la carte de l'angle facturation, où elle est vérifiée
     * (`AccountBillingCard.test.tsx`). Ici, la règle est plus simple et plus
     * dure — ce tableau ne porte AUCUNE colonne d'argent, quel que soit le
     * droit. La garde compte les colonnes des deux côtés, donc un retour en
     * arrière sur l'entête seule la ferait rougir aussi.
     */
    // #4497 (PR 12C, maquette V22 `.a4-table`) — les colonnes, dans l'ordre : Compte · Sujet & prochaine action ·
    // Relation · Personnes · Responsable · Intérêt · « … ». Plus de colonne « Décision » : elle se lit sous l'Intérêt.
    it('#4497 — les colonnes de la maquette V22, dans son ordre', async () => {
      renderTable([makeRow()])
      await screen.findByText('Edf')
      const headers = within(screen.getAllByRole('row')[0]!).getAllByRole('columnheader')
      expect(headers.map(h => h.textContent?.trim())).toEqual([
        'Compte',
        'Sujet & prochaine action',
        'Relation',
        'Personnes',
        'Responsable',
        'Intérêt',
        'Actions du compte',
      ])
    })

    it('ne porte plus AUCUNE colonne de facturation, quel que soit le droit financier', async () => {
      revenueColumn.mockReturnValue({ visible: true, failed: false, canReadFinance: true, byAccount: new Map() })
      renderTable([makeRow()])

      await screen.findByText('Edf')
      const headers = within(screen.getAllByRole('row')[0]!).getAllByRole('columnheader')
      const cells = within(screen.getAllByRole('row')[1]!).getAllByRole('cell')

      expect(headers).toHaveLength(EXPECTED_ALIGNMENT.length)
      expect(cells).toHaveLength(EXPECTED_ALIGNMENT.length)
      expect(headers.map(h => h.textContent)).not.toContain('Prêt à facturer')
      expect(headers.map(h => h.textContent)).not.toContain('Facturé')
    })
  })

  /**
   * #2627.1 — « trier et filtrer le portefeuille par VERDICT, pas score ». La
   * pastille ne portait que le nombre : rien ne disait GO/PRUDENT/NO-GO sans
   * connaître les coupures par cœur. Le libellé rejoint la pastille dans la
   * MÊME cellule — `getRecommendation`, déjà la source du dialogue de
   * comparaison, pas un second calcul (GA-26).
   *
   * #2932 (constat recette 27/09/2026, salle démo) — la fiche compte
   * (`AccountVerdictSummary.tsx`) affiche déjà le NOM MÉTIER (AGIR MAINTENANT
   * / RÉSERVE / METTRE EN VEILLE / ÉCARTER POUR CET OBJECTIF), mais cette
   * liste était restée sur l'ancien libellé legacy GO/PRUDENT/NO-GO — le
   * MÊME compte se lisait différemment selon l'écran. `getRecommendation`
   * (`types.ts`) réutilise désormais `namedAccountVerdict` (GA-26) : la
   * FAMILLE continue de piloter la couleur de la pastille, seul le TEXTE
   * change.
   */
  describe('#2627.1 / #2932 — le verdict est écrit à côté du score, avec le nom métier de la fiche compte', () => {
    it('un compte à 8/10 affiche AGIR MAINTENANT, jamais l’ancien libellé GO', async () => {
      renderTable([makeRow({ priority_score: 8 })])

      await screen.findByText('Edf')
      expect(screen.getByText('AGIR MAINTENANT')).toBeInTheDocument()
      expect(screen.queryByText('GO')).not.toBeInTheDocument()
    })

    it('un compte à 6/10 affiche RÉSERVE, jamais l’ancien libellé PRUDENT', async () => {
      renderTable([makeRow({ priority_score: 6 })])

      await screen.findByText('Edf')
      expect(screen.getByText('RÉSERVE')).toBeInTheDocument()
      expect(screen.queryByText('PRUDENT')).not.toBeInTheDocument()
    })

    it('un compte à 3/10 affiche ÉCARTER POUR CET OBJECTIF, jamais l’ancien libellé NO-GO', async () => {
      renderTable([makeRow({ priority_score: 3 })])

      await screen.findByText('Edf')
      expect(screen.getByText('ÉCARTER POUR CET OBJECTIF')).toBeInTheDocument()
      expect(screen.queryByText('NO-GO')).not.toBeInTheDocument()
      expect(screen.queryByText('GO')).not.toBeInTheDocument()
    })

    it('un compte jamais noté ne porte aucun mot de verdict inventé', async () => {
      renderTable([makeRow({ priority_score: null })])

      await screen.findByText('Edf')
      expect(screen.queryByText('AGIR MAINTENANT')).not.toBeInTheDocument()
      expect(screen.queryByText('RÉSERVE')).not.toBeInTheDocument()
      expect(screen.queryByText('ÉCARTER POUR CET OBJECTIF')).not.toBeInTheDocument()
      expect(screen.queryByText('GO')).not.toBeInTheDocument()
      expect(screen.queryByText('PRUDENT')).not.toBeInTheDocument()
      expect(screen.queryByText('NO-GO')).not.toBeInTheDocument()
    })
  })
})
