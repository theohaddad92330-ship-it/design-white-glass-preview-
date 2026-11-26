import type { InvoiceReadiness } from '@bellum/contracts'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const collectionsWindow = vi.fn()
const factoringView = vi.fn()

const mutation = () => ({ mutate: vi.fn(), isPending: false })
vi.mock('../api', () => ({
  useCollectionsWindow: () => collectionsWindow(),
  useRecordPayment: mutation,
  useOpenDispute: mutation,
  useResolveDispute: mutation,
  useRecordReminder: mutation,
  useMarkInvoiced: () => markInvoiced,
}))
const markInvoiced = { mutate: vi.fn(), isPending: false }
const toolRegistry = vi.fn()
vi.mock('@/features/integration-center/api', () => ({ useToolRegistry: () => toolRegistry() }))
vi.mock('@/lib/data-exit', () => ({ useDataExit: () => ({ grant: null }) }))
vi.mock('../../factoring/api', () => ({ useFactoringView: () => factoringView() }))
vi.mock('./InvoiceAttachments', () => ({ InvoiceAttachments: () => <div>pièces</div> }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
const teamState = vi.fn()
vi.mock('@/features/team/hooks/useTeam', () => ({ useTeam: () => teamState() }))
// La coque rendue à plat : titre, phrase, gestes de tête, guide, puis le corps — dans l'ordre de la page.
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({
    children,
    pageTitle,
    pageSubtitle,
    headerActions,
    screenGuide,
  }: {
    children: React.ReactNode
    pageTitle?: string
    pageSubtitle?: string
    headerActions?: React.ReactNode
    screenGuide?: React.ReactNode
  }) => (
    <div>
      <h1>{pageTitle}</h1>
      <p>{pageSubtitle}</p>
      <div data-testid="head-actions">{headerActions}</div>
      <div data-testid="guide">{screenGuide}</div>
      {children}
    </div>
  ),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    search: _search,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    search?: Record<string, string>
    children: React.ReactNode
  }) => (
    <a href={Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)} {...rest}>
      {children}
    </a>
  ),
}))

const { InvoicesPage } = await import('./InvoicesPage')

const NOW = new Date('2026-10-19T12:00:00.000Z')
const M1 = '11111111-1111-4111-8111-111111111111'
const M2 = '22222222-2222-4222-8222-222222222222'
const M3 = '33333333-3333-4333-8333-333333333333'

function line(over: Partial<InvoiceReadiness> = {}): InvoiceReadiness {
  return {
    missionId: M1,
    missionLabel: 'Renfort plateforme',
    accountId: null,
    accountName: 'ACME',
    periodMonth: '2026-08-01',
    state: 'invoiced',
    blockers: [],
    days: 20,
    preparedAmountCents: 10_000_00,
    invoicedAt: '2026-09-05T12:00:00.000Z',
    invoiceReference: 'F-118',
    invoicedAmountCents: 10_000_00,
    dueOn: '2026-10-04',
    remindersSent: 1,
    lastReminderAt: null,
    paidAt: null,
    paidAmountCents: null,
    disputedAt: null,
    disputeReason: null,
    disputeResolvedAt: null,
    ...over,
  }
}

function show(items: InvoiceReadiness[], over: Record<string, unknown> = {}) {
  collectionsWindow.mockReturnValue({ items, canReadFinance: true, isLoading: false, failedMonths: 0, ...over })
  render(<InvoicesPage now={NOW} />)
}

beforeEach(() => {
  cleanup()
  collectionsWindow.mockReset()
  factoringView.mockReset()
  teamState.mockReset()
  teamState.mockReturnValue({ team: null })
  toolRegistry.mockReturnValue({ data: [] })
  markInvoiced.mutate.mockReset()
  factoringView.mockReturnValue({ data: { assignments: [] } })
})

describe('l’écran Factures', () => {
  // Théo C missions-factures.N7 — le libellé de Théo, tel quel.
  it('écrit « Partielle · en retard » et NOMME le reste dû', () => {
    show([line({ paidAt: '2026-10-10T12:00:00.000Z', paidAmountCents: 4_000_00 })])
    expect(screen.getAllByText('Partielle · en retard').length).toBeGreaterThan(0)
    expect(screen.getByText(/Réglé 4\s?000\s?€ · reste dû 6\s?000\s?€/)).toBeTruthy()
  })

  // #2564 — préparée, jamais émise : pas de numéro avant création.
  it('une préparation dit « Préparée », sans numéro, et aucune créance', () => {
    show([line({ state: 'ready', invoiceReference: null, invoicedAmountCents: null, invoicedAt: null })])
    const row = screen.getByRole('row', { name: /ACME/ })
    expect(within(row).getAllByText('Préparée').length).toBeGreaterThan(0)
    expect(within(row).getByText('Préparée · pas encore créée')).toBeTruthy()
    expect(within(row).getByText('Aucune créance')).toBeTruthy()
    expect(within(row).getByText('À la création')).toBeTruthy()
  })

  // Théo C missions-factures.N4 — les quatre tuiles.
  it('rend les quatre tuiles : préparées, facturé HT, reste à recevoir, litiges', () => {
    show([line(), line({ missionId: M2, state: 'ready', invoicedAmountCents: null })])
    for (const label of ['Préparées', 'Facturé HT', 'Reste à recevoir', 'Factures en litige']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
  })

  // c80 — la tuile « facturé » nomme la part déclarée sans preuve, elle ne la cache pas.
  it('la tuile « Facturé HT » nomme la part déclarée sans preuve', () => {
    show([line(), line({ missionId: M2, state: 'invoiced_declared', invoicedAmountCents: 8_700_00 })])
    expect(screen.getByText(/dont 8\s?700\s?€ déclarés sans preuve/)).toBeTruthy()
  })

  it('badge « cédée » quand la créance est cédée à l’affactureur', () => {
    factoringView.mockReturnValue({
      data: {
        assignments: [
          { missionId: M1, periodMonth: '2026-08-01', status: 'assigned', assignedOn: '2026-09-20', settledOn: null },
        ],
      },
    })
    show([line(), line({ missionId: M2 })])
    expect(screen.getAllByText('Cédée')).toHaveLength(1)
  })

  it('filtre « En litige » : resserre la liste et le dit', async () => {
    show([
      line(),
      line({ missionId: M2, accountName: 'ZED', disputedAt: '2026-10-06T12:00:00.000Z', disputeReason: 'x' }),
    ])
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'État : Toutes les factures' }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'En litige' }))
    expect(screen.queryByRole('row', { name: /ACME/ })).toBeNull()
    expect(screen.getByRole('row', { name: /ZED/ })).toBeTruthy()
    expect(screen.getByText('1 document dans cette sélection')).toBeTruthy()
  })

  // Louis 23/10 — multi-sélection partout : deux états s'additionnent.
  it('deux états cochés s’additionnent (multi-sélection)', async () => {
    show([
      line({ accountName: 'ACME' }),
      line({ missionId: M2, accountName: 'BETA', state: 'ready', invoicedAmountCents: null }),
      line({ missionId: M3, accountName: 'GAMMA', paidAt: '2026-10-01T12:00:00.000Z', paidAmountCents: 10_000_00 }),
    ])
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'État : Toutes les factures' }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Préparées' }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Avec un solde' }))
    expect(screen.getByRole('row', { name: /BETA/ })).toBeTruthy()
    expect(screen.getByRole('row', { name: /ACME/ })).toBeTruthy()
    expect(screen.queryByRole('row', { name: /GAMMA/ })).toBeNull()
  })

  // Louis 23/10 — le compte est un filtre à choix multiple, présent dès qu'il y a un choix.
  it('filtre par compte, en multi-sélection', async () => {
    show([line({ accountName: 'ACME' }), line({ missionId: M2, accountName: 'BETA' })])
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Compte : Tous les comptes' }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'BETA' }))
    expect(screen.queryByRole('row', { name: /ACME/ })).toBeNull()
    expect(screen.getByRole('row', { name: /BETA/ })).toBeTruthy()
  })

  it('un montant inconnu n’est jamais « 0 € »', () => {
    show([line({ invoicedAmountCents: null })])
    expect(screen.queryByText(/^0\s?€$/)).toBeNull()
  })

  it('nomme la source d’un « facturé » : lue dans l’outil, ou déclarée non confirmée (c80)', () => {
    show([
      line(),
      line({ missionId: M2, accountName: 'BETA', state: 'invoiced_declared', invoicedByName: 'Léa Martin' }),
    ])
    expect(within(screen.getByRole('row', { name: /ACME/ })).getByText('Lue dans l’outil de facturation')).toBeTruthy()
    expect(within(screen.getByRole('row', { name: /BETA/ })).getByText('Déclarée · non confirmée')).toBeTruthy()
  })

  it('« Saisir l’échéance » ouvre sa fenêtre ; une facture déclarée y reçoit son échéance, rien d’autre ne bouge', async () => {
    show([line({ dueOn: null, state: 'invoiced_declared' })])
    expect(screen.getByText('Sans échéance')).toBeTruthy()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Saisir l’échéance' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Échéance'), '2026-11-15')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(markInvoiced.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: M1,
        month: '2026-08',
        dueOn: '2026-11-15',
        reference: 'F-118',
        amountCents: 10_000_00,
        invoicedAt: '2026-09-05T12:00:00.000Z',
      }),
      expect.anything(),
    )
  })

  // c80 — une facture LUE dans l'outil ne voit pas son échéance réécrite ici (elle passerait pour déclarée).
  it('sur une facture lue dans l’outil, la fenêtre d’échéance renvoie à la facturation sans rien écrire', async () => {
    show([line({ dueOn: null })])
    await userEvent.setup().click(screen.getByRole('button', { name: 'Saisir l’échéance' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: 'Enregistrer' })).toBeNull()
    expect(within(dialog).getByRole('link', { name: 'Ouvrir la facturation du mois' }).getAttribute('href')).toBe(
      '/missions/facturation',
    )
  })

  // Refonte Théo — la STRUCTURE de la maquette `c/missions-factures.html`, dans son ordre.
  it('suit la maquette : en-tête, guide, quatre tuiles, deux barres de filtres, le tableau, deux cartes', () => {
    toolRegistry.mockReturnValue({
      data: [
        {
          provider: 'qonto',
          family: 'admin_docs',
          status: 'connected',
          data_types: { reads: ['invoices'], writes: [] },
          last_sync: '2026-10-19T06:12:00.000Z',
        },
      ],
    })
    show([
      line(),
      line({ missionId: M2, accountName: 'BETA', ownerName: 'Maëva Coet', periodMonth: '2026-09-01' }),
      line({ missionId: M3, ownerName: 'Théo Haddad' }),
    ])
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Les factures, de la préparation au solde.')
    const head = screen.getByTestId('head-actions')
    expect(within(head).getByRole('link', { name: 'Préparer depuis l’activité' }).getAttribute('href')).toBe(
      '/missions/facturation',
    )
    expect(within(screen.getByTestId('guide')).getByText('Distinguer préparée, créée et envoyée')).toBeTruthy()
    const tiles = screen.getByRole('group', { name: 'Les chiffres des factures' })
    expect(
      within(tiles)
        .getAllByRole('button')
        .map(tile => tile.querySelector('span')?.textContent),
    ).toEqual(['Préparées', 'Facturé HT', 'Reste à recevoir', 'Factures en litige'])
    const toolbar = screen.getByRole('group', { name: 'Filtrer les factures' })
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map(button => button.getAttribute('aria-label')),
    ).toEqual([
      'Période facturée : Toutes les périodes',
      'Compte : Tous les comptes',
      'Responsable : Tous les responsables',
    ])
    expect(within(toolbar).getByRole('searchbox', { name: 'Recherche' })).toBeTruthy()
    expect(screen.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual([
      'Document / client',
      'Période',
      'HT',
      'Échéance',
      'État / solde',
      'Actions',
    ])
    const cards = screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)
    expect(cards).toEqual(['Pièce figée une fois créée', 'Outil de facturation branché'])
    // On nomme l'outil que l'espace a branché, jamais un fournisseur de Bellum.
    expect(screen.getByText('Qonto')).toBeTruthy()
    // L'ordre de la page : tuiles avant la barre, barre avant le tableau, tableau avant les cartes.
    const order = [
      tiles,
      toolbar,
      screen.getByRole('table'),
      screen.getByRole('heading', { name: 'Pièce figée une fois créée' }),
    ]
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index - 1]!.compareDocumentPosition(order[index]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('une tuile filtre la liste, un second clic la relâche', async () => {
    show([
      line(),
      line({ missionId: M2, accountName: 'BETA', disputedAt: '2026-10-06T12:00:00.000Z', disputeReason: 'x' }),
    ])
    const user = userEvent.setup()
    const tile = within(screen.getByRole('group', { name: 'Les chiffres des factures' })).getByRole('button', {
      name: /Factures en litige/,
    })
    await user.click(tile)
    expect(screen.queryByRole('row', { name: /ACME/ })).toBeNull()
    expect(tile.getAttribute('aria-pressed')).toBe('true')
    await user.click(tile)
    expect(screen.getByRole('row', { name: /ACME/ })).toBeTruthy()
  })

  it('sans outil de facturation branché, la carte le dit au lieu d’inventer une source', () => {
    show([line()])
    expect(screen.getByText(/Aucun outil de facturation n’est branché/)).toBeTruthy()
  })

  // « Ouvrir » ouvre la fenêtre de la facture : état, source, totaux, gestes.
  it('« Ouvrir » ouvre la fenêtre d’une facture lue, avec sa source et son reste dû', async () => {
    teamState.mockReturnValue({ team: { workspace: { role: 'owner' } } })
    show([line({ paidAt: '2026-10-10T12:00:00.000Z', paidAmountCents: 4_000_00 })])
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ouvrir' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Facturé · source : ton outil de facturation/)).toBeTruthy()
    expect(within(dialog).getByText('Règlements affectés')).toBeTruthy()
    // Chaque geste ouvre son invite : le règlement, puis le litige.
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Consigner un règlement' }))
    expect(within(dialog).getByText('Enregistrer un règlement')).toBeTruthy()
  })

  it('sans le droit Finance, la fenêtre se lit mais ne propose aucun geste d’écriture', async () => {
    show([line()])
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ouvrir' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: 'Consigner un règlement' })).toBeNull()
    expect(within(dialog).getByRole('link', { name: 'Préparer un suivi' })).toBeTruthy()
  })

  it('la fenêtre d’une préparation montre les trois étapes et renvoie vers Facturation', async () => {
    show([line({ state: 'ready', invoiceReference: null, invoicedAmountCents: null, invoicedAt: null })])
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ouvrir' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/1\. Préparée/)).toBeTruthy()
    expect(within(dialog).getByText(/2\. Créée/)).toBeTruthy()
    expect(within(dialog).getByText(/3\. Envoyée/)).toBeTruthy()
    expect(within(dialog).getByRole('link', { name: 'Ouvrir la préparation' }).getAttribute('href')).toBe(
      '/missions/facturation',
    )
  })

  it('la fenêtre d’une facture déclarée nomme qui l’a déclarée', async () => {
    show([line({ state: 'invoiced_declared', invoicedByName: 'Léa Martin' })])
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ouvrir' }))
    expect(within(screen.getByRole('dialog')).getByText(/Déclaré facturé par Léa Martin/)).toBeTruthy()
  })

  it('aucun chiffre pendant le chargement', () => {
    show([], { isLoading: true })
    expect(screen.queryByText('Préparées')).toBeNull()
  })
})
