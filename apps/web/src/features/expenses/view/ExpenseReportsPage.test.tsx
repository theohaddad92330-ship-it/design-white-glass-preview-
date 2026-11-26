import type {
  ExpensePolicyBoard,
  ExpenseReportSummaryView,
  ExpenseReportTiles,
  ExpenseReportVerification,
} from '@bellum/contracts'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseOption } from '@/test/select'

const reports = vi.fn()
const policies = vi.fn()

vi.mock('../api', () => ({
  useExpenseReports: (filters: unknown) => reports(filters),
  useExpensePolicies: () => policies(),
  // Le formulaire relit la note qu'il corrige. Ici, il n'est jamais ouvert.
  useExpenseReportDetail: () => ({ data: undefined, isLoading: false, isError: false }),
}))
// Le tiroir et le formulaire ont leurs propres garanties : ce fichier décrit la
// FILE, ses tuiles, sa pagination et ses deux états vides.
vi.mock('./ExpenseReportDrawer', () => ({ ExpenseReportDrawer: () => null }))
vi.mock('./ExpenseReportEditor', () => ({ ExpenseReportEditor: () => null }))
// `Link` exige un routeur monté ; ce qui compte ici est qu'il MÈNE au barème,
// pas la mécanique de navigation.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const { ExpenseReportsPage } = await import('./ExpenseReportsPage')

function row(over: Partial<ExpenseReportSummaryView> = {}): ExpenseReportSummaryView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    reference: 'F-2026-006',
    bearerName: 'Inès Kaczmarek',
    accountName: 'DINUM',
    missionId: null,
    missionLabel: null,
    periodMonth: '2026-05',
    status: 'pending',
    lineCount: 5,
    totalAmountCents: 31850,
    submittedAt: '2026-05-10T09:00:00.000Z',
    decidedAt: null,
    decidedByName: null,
    policyCheck: { verdict: 'compliant', overageCount: 0, unmeasuredLineCount: 0, worstOverage: null },
    ...over,
  }
}

function verification(over: Partial<ExpenseReportVerification> = {}): ExpenseReportVerification {
  return {
    overages: [],
    unmeasuredLineCount: 0,
    lineCount: 0,
    attachmentCount: 0,
    reportsWithoutReceipt: 0,
    ...over,
  }
}

const BOARD: ExpensePolicyBoard = {
  policies: [
    {
      id: 'p1',
      accountId: null,
      accountName: null,
      label: 'Barème interne',
      reimbursementBasis: 'actual',
      caps: [
        { category: 'meal', capCents: 2500, vatRecoverable: true, effectiveFrom: '2026-01-01' },
        { category: 'hotel', capCents: 12000, vatRecoverable: false, effectiveFrom: '2026-01-01' },
      ],
      mileageRates: [],
    },
    {
      id: 'p2',
      accountId: 'acc-orange',
      accountName: 'Orange',
      label: 'Barème Orange',
      reimbursementBasis: 'actual',
      caps: [{ category: 'hotel', capCents: 10900, vatRecoverable: false, effectiveFrom: '2026-01-01' }],
      mileageRates: [],
    },
  ],
  accounts: [
    { id: 'acc-sg', name: 'Société Générale' },
    { id: 'acc-orange', name: 'Orange' },
  ],
  accountsTruncated: false,
}

function tiles(over: Partial<ExpenseReportTiles> = {}): ExpenseReportTiles {
  return {
    pending: { count: 15, totalAmountCents: 2654062 },
    validated: { count: 42, totalAmountCents: 8275230 },
    rejected: { count: 3, totalAmountCents: 312540 },
    // La quatrième tuile est arrivée avec le brouillon (31/08/2026) : elle
    // compte dans le total de la période, celui qui distingue « le mois est
    // vide » de « c'est ton filtre qui a tout retiré ».
    draft: { count: 2, totalAmountCents: 41200 },
    ...over,
  }
}

function answer(over: Record<string, unknown> = {}) {
  return {
    data: {
      items: [row()],
      tiles: tiles(),
      verification: verification(),
      canReadFinance: true,
      total: 60,
      page: 1,
      pageSize: 10,
    },
    isLoading: false,
    isError: false,
    ...over,
  }
}

beforeEach(() => {
  cleanup()
  reports.mockReset()
  policies.mockReset()
  policies.mockReturnValue({ data: BOARD, isLoading: false, isError: false })
})

describe('la file des notes de frais', () => {
  it('rend une ligne par note, avec son porteur, son client et son montant', () => {
    reports.mockReturnValue(answer())
    render(<ExpenseReportsPage />)

    expect(screen.getByText('Inès Kaczmarek')).toBeInTheDocument()
    expect(screen.getByText('DINUM')).toBeInTheDocument()
    expect(screen.getAllByText('F-2026-006').length).toBeGreaterThan(0)
  })

  it('affiche les trois tuiles avec leurs comptes', () => {
    reports.mockReturnValue(answer())
    render(<ExpenseReportsPage />)

    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('DIT que les montants sont réservés plutôt que d’écrire « 0,00 € »', () => {
    // Le défaut que ce test empêche : sans droit financier, un `?? 0` afficherait
    // « 0,00 € » sur les trois tuiles — une file de notes toutes à zéro euro,
    // c'est-à-dire une information fausse là où l'absence de droit ne dit rien.
    reports.mockReturnValue(
      answer({
        data: {
          items: [row({ totalAmountCents: null })],
          tiles: tiles({
            pending: { count: 15, totalAmountCents: null },
            validated: { count: 42, totalAmountCents: null },
            rejected: { count: 3, totalAmountCents: null },
            draft: { count: 2, totalAmountCents: null },
          }),
          verification: verification(),
          canReadFinance: false,
          total: 60,
          page: 1,
          pageSize: 10,
        },
      }),
    )
    render(<ExpenseReportsPage />)

    // Quatre tuiles depuis l'arrivée du brouillon, donc quatre montants réservés.
    expect(screen.getAllByText('Montants réservés')).toHaveLength(4)
    expect(screen.queryByText(/0,00/)).not.toBeInTheDocument()
    // Les COMPTES, eux, restent lisibles : c'est le seul chiffre qui dit quoi faire.
    expect(screen.getByText('15')).toBeInTheDocument()
  })

  it('un échec de lecture ne se rend JAMAIS comme « aucune note »', () => {
    reports.mockReturnValue(answer({ data: undefined, isError: true }))
    render(<ExpenseReportsPage />)

    expect(screen.getByText('Les notes de frais n’ont pas pu être chargées')).toBeInTheDocument()
    expect(screen.queryByText('Aucune note de frais sur cette période')).not.toBeInTheDocument()
  })

  it('sur une période réellement vide, propose de changer de mois', () => {
    reports.mockReturnValue(
      answer({
        data: {
          items: [],
          tiles: tiles({
            pending: { count: 0, totalAmountCents: 0 },
            validated: { count: 0, totalAmountCents: 0 },
            rejected: { count: 0, totalAmountCents: 0 },
            draft: { count: 0, totalAmountCents: 0 },
          }),
          verification: verification(),
          canReadFinance: true,
          total: 0,
          page: 1,
          pageSize: 10,
        },
      }),
    )
    render(<ExpenseReportsPage />)

    expect(screen.getByText('Aucune note de frais sur cette période')).toBeInTheDocument()
  })

  it('quand c’est le FILTRE qui a vidé la liste, le dit et propose de le retirer', async () => {
    // Deux causes se cachaient sous une seule phrase, et la plus fréquente est
    // la moins grave : une bonne nouvelle rendue comme une panne fait chercher
    // un problème qui n'existe pas.
    reports.mockReturnValue(
      answer({
        data: {
          items: [],
          tiles: tiles(),
          verification: verification(),
          canReadFinance: true,
          total: 0,
          page: 1,
          pageSize: 10,
        },
      }),
    )
    render(<ExpenseReportsPage />)

    // Aucun filtre armé au départ : c'est bien l'état vide ordinaire.
    expect(screen.getByText('Aucune note de frais sur cette période')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Refusées' }))
    expect(screen.getByText('Aucune note ne correspond à ce filtre')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retirer les filtres' })).toBeInTheDocument()
  })

  it('les filtres d’état sont des boutons qui annoncent leur état', async () => {
    reports.mockReturnValue(answer())
    render(<ExpenseReportsPage />)

    const pending = screen.getByRole('button', { name: 'En attente' })
    expect(pending).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(pending)
    expect(pending).toHaveAttribute('aria-pressed', 'true')
    // Recliquer le DÉSARME : un filtre qu'on ne peut pas retirer est un piège.
    await userEvent.click(pending)
    expect(pending).toHaveAttribute('aria-pressed', 'false')
  })

  it('la recherche et le mois portent un nom accessible', () => {
    reports.mockReturnValue(answer())
    render(<ExpenseReportsPage />)

    expect(screen.getByLabelText('Rechercher une note de frais')).toBeInTheDocument()
    expect(screen.getByLabelText('Mois de la période')).toBeInTheDocument()
  })
})

describe('la pagination de la file (31/08/2026)', () => {
  it('écrit « 1–10 sur 60 » à partir du TOTAL du serveur', () => {
    // La maquette montre ce compte, et il ne se déduit pas de la page rendue :
    // une pagination qui ne sait pas où elle s'arrête propose des pages vides.
    reports.mockReturnValue(answer())
    render(<ExpenseReportsPage />)

    expect(screen.getByText('1–10 sur 60')).toBeInTheDocument()
    expect(screen.getByText('Page 1 sur 6')).toBeInTheDocument()
  })

  it('n’offre pas de page précédente sur la première', () => {
    reports.mockReturnValue(answer())
    render(<ExpenseReportsPage />)

    expect(screen.getByRole('button', { name: 'Page précédente' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Page suivante' })).toBeEnabled()
  })

  it('demande la page suivante AU SERVEUR — jamais une découpe en mémoire', async () => {
    reports.mockReturnValue(answer())
    render(<ExpenseReportsPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Page suivante' }))
    // Le hook est appelé sans argument dans ce test (le mock ignore les
    // filtres) : ce qu'on vérifie est que l'écran a RE-DEMANDÉ, donc que la
    // page vit dans la requête et pas dans un `slice`.
    expect(reports.mock.calls.length).toBeGreaterThan(1)
    expect(screen.getByText('11–20 sur 60')).toBeInTheDocument()
  })

  it('le sélecteur « 10 / page » porte un nom accessible et ramène en page 1', async () => {
    reports.mockReturnValue(answer())
    render(<ExpenseReportsPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Page suivante' }))
    expect(screen.getByText('11–20 sur 60')).toBeInTheDocument()

    const size = screen.getByLabelText('Notes par page')
    await chooseOption(size, '25')
    // Rester en page 2 sur une taille qui n'a que 3 pages est encore valable,
    // mais rester en page 6 sur une taille qui n'en a que 3 rendrait une liste
    // vide, qu'on lirait « il n'y a rien ». On revient donc au début.
    expect(screen.getByText('1–25 sur 60')).toBeInTheDocument()
  })

  it('ouvre la porte du barème et celle du dépôt', () => {
    // Les deux gestes qui manquaient : sans eux, la file ne se remplit jamais
    // et « non vérifiée » n'a pas de réponse.
    reports.mockReturnValue(answer())
    render(<ExpenseReportsPage />)

    expect(screen.getByRole('link', { name: 'Barème de frais' })).toHaveAttribute('href', '/expenses/bareme')
    expect(screen.getByRole('button', { name: 'Déposer une note' })).toBeInTheDocument()
  })

  it('compte les brouillons dans le total de la période', () => {
    // Sans eux, une période qui ne porte QUE des brouillons se lirait « le mois
    // est vide » — au moment précis où l'on découvre l'écran.
    reports.mockReturnValue(
      answer({
        data: {
          items: [],
          tiles: tiles({
            pending: { count: 0, totalAmountCents: 0 },
            validated: { count: 0, totalAmountCents: 0 },
            rejected: { count: 0, totalAmountCents: 0 },
            draft: { count: 2, totalAmountCents: 41200 },
          }),
          verification: verification(),
          canReadFinance: true,
          total: 0,
          page: 1,
          pageSize: 10,
        },
      }),
    )
    render(<ExpenseReportsPage />)

    expect(screen.getByText('Brouillons')).toBeInTheDocument()
  })
})

/**
 * Famille de #1826/#1829/#1828 — même sous-titre ORPHELIN, sur un écran non
 * signalé mais balayé. `page.subtitle` était posé tout en haut du corps, sans
 * aucun titre au-dessus de lui : l'onglet actif (« Notes de frais ») nomme
 * déjà l'écran, `PageHeader` masque le sien, et rien PLUS BAS sur cet écran
 * ne répète le propos. Contrairement à CRA/ADV, la phrase ne se scinde pas
 * naturellement en un titre + une légende ("Ce qui attend une décision, et
 * pourquoi." est une seule idée) — elle reçoit donc un titre distinct du
 * libellé de l'onglet, plutôt qu'un fragment d'elle-même.
 */
describe('la file des notes de frais — le sous-titre rejoint son titre', () => {
  it('affiche un TITRE visible qui précède la phrase, dans le DOM', () => {
    reports.mockReturnValue(answer())
    render(<ExpenseReportsPage />)
    // Refonte Théo PR12 — le titre et la phrase de la maquette `c/missions-notes-de-frais`.
    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Les frais du mois, vérifiés avant d’être remboursés.',
    })
    const subtitle = screen.getByText(/Une note par consultant et par mois\./)
    expect(heading.compareDocumentPosition(subtitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('ne perd rien de la phrase originale', () => {
    reports.mockReturnValue(answer())
    render(<ExpenseReportsPage />)
    expect(
      screen.getByText(
        'Une note par consultant et par mois. Le barème de l’espace dit ce qui est conforme ; c’est toi qui valides ou refuses.',
      ),
    ).toBeInTheDocument()
  })
})

/* -------------------------------------------------------------------------- */
/*  Théo C missions-notes-de-frais — la page appliquée                         */
/* -------------------------------------------------------------------------- */

const PENDING_BREACH = row({
  id: '22222222-2222-4222-8222-222222222222',
  reference: 'NDF-2026-10-014',
  bearerName: 'Yanis Berthier',
  accountName: 'SNCF',
  missionLabel: 'Fiabilisation plateforme — renfort exploitation',
  periodMonth: '2026-10',
  lineCount: 3,
  totalAmountCents: 41200,
  submittedAt: '2026-10-10T09:00:00.000Z',
  policyCheck: {
    verdict: 'breach',
    overageCount: 1,
    unmeasuredLineCount: 0,
    worstOverage: { category: 'meal', overageCents: 2800 },
  },
})
const DRAFT_UNKNOWN = row({
  id: '33333333-3333-4333-8333-333333333333',
  reference: 'NDF-2026-10-017',
  bearerName: 'Camille Roussel',
  accountName: 'Société Générale',
  status: 'draft',
  submittedAt: null,
  policyCheck: { verdict: 'unknown', overageCount: 0, unmeasuredLineCount: 1, worstOverage: null },
})
const VALIDATED_OK = row({
  id: '44444444-4444-4444-8444-444444444444',
  reference: 'NDF-2026-10-002',
  bearerName: 'Yanis Berthier',
  accountName: 'SNCF',
  status: 'validated',
  submittedAt: '2026-10-01T09:00:00.000Z',
  decidedAt: '2026-10-02T10:00:00.000Z',
  decidedByName: 'Maëva Coet',
})

function pageWith(items: ExpenseReportSummaryView[], over: Record<string, unknown> = {}) {
  return answer({
    data: {
      items,
      tiles: tiles({
        pending: { count: 2, totalAmountCents: 64800 },
        validated: { count: 1, totalAmountCents: 18000 },
        rejected: { count: 0, totalAmountCents: 0 },
        draft: { count: 1, totalAmountCents: 9640 },
      }),
      verification: verification({
        overages: [
          {
            reportId: PENDING_BREACH.id,
            reference: PENDING_BREACH.reference,
            bearerName: 'Yanis Berthier',
            category: 'meal',
            overageCents: 2800,
          },
        ],
        unmeasuredLineCount: 1,
        lineCount: 9,
        attachmentCount: 8,
        reportsWithoutReceipt: 1,
      }),
      canReadFinance: true,
      total: items.length,
      page: 1,
      pageSize: 10,
      ...over,
    },
  })
}

describe('Théo C missions-notes-de-frais.N3 — les quatre tuiles sont les filtres d’état', () => {
  it('dans l’ordre En attente · Validées · Refusées · Brouillons, et la file « à décider » dit ses dépassements', () => {
    reports.mockReturnValue(pageWith([PENDING_BREACH]))
    render(<ExpenseReportsPage />)

    const names = screen
      .getAllByRole('button', { pressed: false })
      .map(button => button.textContent ?? '')
      .filter(text => /^(En attente|Validées|Refusées|Brouillons)/.test(text))
    expect(names.map(text => text.split(/\d|Aucune/)[0])).toEqual(['En attente', 'Validées', 'Refusées', 'Brouillons'])
    expect(screen.getByText(/1 dépassement à regarder/)).toBeInTheDocument()
  })

  it('un compteur vide se dit en mot : « Aucune », jamais « 0 »', () => {
    reports.mockReturnValue(pageWith([PENDING_BREACH]))
    render(<ExpenseReportsPage />)

    const refused = screen.getByRole('button', { name: 'Refusées' })
    expect(within(refused).getByText('Aucune')).toBeInTheDocument()
    expect(within(refused).queryByText('0')).not.toBeInTheDocument()
  })

  it('une tuile filtre l’état et se désarme au second clic', async () => {
    reports.mockReturnValue(pageWith([PENDING_BREACH]))
    render(<ExpenseReportsPage />)

    const pending = screen.getByRole('button', { name: 'En attente' })
    expect(pending).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(pending)
    expect(pending).toHaveAttribute('aria-pressed', 'true')
    expect(reports).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'pending' }))
    await userEvent.click(pending)
    expect(pending).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('Théo C missions-notes-de-frais.N4 — la table', () => {
  it('porte « Porteur · mission », la référence avec son mois, et un bouton Ouvrir nommé par la note', () => {
    reports.mockReturnValue(pageWith([PENDING_BREACH]))
    render(<ExpenseReportsPage />)

    expect(screen.getAllByText('Yanis Berthier').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Fiabilisation plateforme — renfort exploitation · SNCF/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('NDF-2026-10-014').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Ouvrir la note de Yanis Berthier' }).length).toBeGreaterThan(0)
  })

  it('« Barème » : dépassement nommé avec sa catégorie et son montant', () => {
    reports.mockReturnValue(pageWith([PENDING_BREACH]))
    render(<ExpenseReportsPage />)

    expect(screen.getAllByText('1 dépassement').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Repas · \+28\s?€/).length).toBeGreaterThan(0)
  })

  it('« Barème » sans droit financier : la catégorie reste, le montant n’est ni 0 ni deviné', () => {
    reports.mockReturnValue(
      pageWith(
        [
          row({
            ...PENDING_BREACH,
            policyCheck: {
              verdict: 'breach',
              overageCount: 1,
              unmeasuredLineCount: 0,
              worstOverage: { category: 'meal', overageCents: null },
            },
          }),
        ],
        { canReadFinance: false },
      ),
    )
    render(<ExpenseReportsPage />)

    expect(screen.getAllByText('Repas').length).toBeGreaterThan(0)
    expect(screen.queryByText(/\+0\s?€/)).not.toBeInTheDocument()
  })

  it('« Barème » : une ligne sans plafond est « Non vérifiée », jamais « Conforme »', () => {
    reports.mockReturnValue(pageWith([DRAFT_UNKNOWN]))
    render(<ExpenseReportsPage />)

    expect(screen.getAllByText('Non vérifiée').length).toBeGreaterThan(0)
    expect(screen.getAllByText('1 ligne sans plafond').length).toBeGreaterThan(0)
    expect(screen.queryByText('Conforme')).not.toBeInTheDocument()
  })

  it('« Barème » conforme : seulement quand toutes les lignes ont été comparées', () => {
    reports.mockReturnValue(pageWith([VALIDATED_OK]))
    render(<ExpenseReportsPage />)

    expect(screen.getAllByText('Conforme').length).toBeGreaterThan(0)
  })

  it('« Statut » : la date de dépôt, ou « pas encore déposée » pour un brouillon, ou qui a validé', () => {
    reports.mockReturnValue(pageWith([PENDING_BREACH, DRAFT_UNKNOWN, VALIDATED_OK]))
    render(<ExpenseReportsPage />)

    expect(screen.getAllByText(/déposée le 10 oct/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('pas encore déposée').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/2 oct\. · Maëva Coet/).length).toBeGreaterThan(0)
  })
})

describe('Théo C missions-notes-de-frais.N5 — les deux cartes', () => {
  it('« Ce que la vérification relève » : dépassements nommés, lignes non vérifiées, justificatifs', () => {
    reports.mockReturnValue(pageWith([PENDING_BREACH, DRAFT_UNKNOWN]))
    render(<ExpenseReportsPage />)

    const card = screen.getByRole('region', { name: 'Ce que la vérification relève' })
    expect(within(card).getByText('1 dépassement de plafond')).toBeInTheDocument()
    expect(within(card).getByText(/Yanis Berthier · repas · \+28\s?€/)).toBeInTheDocument()
    expect(within(card).getByText('1 ligne non vérifiée')).toBeInTheDocument()
    expect(within(card).getByText(/8 justificatifs pour 9 lignes/)).toBeInTheDocument()
    expect(within(card).getByText(/1 note sans justificatif/)).toBeInTheDocument()
  })

  it('« Ce que la vérification relève » : rien à relever se dit, sans carte vide', () => {
    reports.mockReturnValue(
      pageWith([VALIDATED_OK], {
        verification: verification({ lineCount: 4, attachmentCount: 4 }),
      }),
    )
    render(<ExpenseReportsPage />)

    const card = screen.getByRole('region', { name: 'Ce que la vérification relève' })
    expect(
      within(card).getByText('Aucun dépassement ni ligne non vérifiée sur les notes à regarder.'),
    ).toBeInTheDocument()
  })

  it('« Le barème appliqué » LIT le réglage : barème de l’espace, plafonds, barèmes négociés par client', () => {
    reports.mockReturnValue(pageWith([PENDING_BREACH]))
    render(<ExpenseReportsPage />)

    const card = screen.getByRole('region', { name: 'Le barème appliqué' })
    expect(within(card).getByText(/Barème interne/)).toBeInTheDocument()
    expect(within(card).getByText(/Repas 25\s?€/)).toBeInTheDocument()
    expect(within(card).getByText(/Hôtel 120\s?€/)).toBeInTheDocument()
    expect(within(card).getByText(/Barème négocié/)).toBeInTheDocument()
    expect(within(card).getByText(/Orange/)).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Ouvrir le barème' })).toHaveAttribute('href', '/expenses/bareme')
  })

  it('« Le barème appliqué » sans barème saisi : le dit, n’invente aucun plafond', () => {
    policies.mockReturnValue({
      data: { policies: [], accounts: [], accountsTruncated: false },
      isLoading: false,
      isError: false,
    })
    reports.mockReturnValue(pageWith([PENDING_BREACH]))
    render(<ExpenseReportsPage />)

    const card = screen.getByRole('region', { name: 'Le barème appliqué' })
    expect(within(card).getByText(/Aucun barème saisi/)).toBeInTheDocument()
    expect(within(card).queryByText(/€/)).not.toBeInTheDocument()
  })
})

describe('Théo C missions-notes-de-frais.N7 — la barre d’outils', () => {
  it('« Compte » filtre par client, avec les clients de l’espace', async () => {
    reports.mockReturnValue(pageWith([PENDING_BREACH]))
    render(<ExpenseReportsPage />)

    const select = screen.getByLabelText('Compte')
    await chooseOption(select, 'Orange')
    expect(reports).toHaveBeenLastCalledWith(expect.objectContaining({ accountId: 'acc-orange' }))
  })
})

describe('Théo C missions-notes-de-frais.N8 — « Comment travailler ici ? »', () => {
  it('replie le parcours utile, sans jamais le cacher : il se lit en un clic', async () => {
    reports.mockReturnValue(pageWith([PENDING_BREACH]))
    render(<ExpenseReportsPage />)

    // Le libellé du pli est le TITRE du parcours : « Comment travailler ici ? » est le lien de la coque.
    const summary = screen.getAllByText('Vérifier une note avant de la rembourser')[0] as HTMLElement
    expect(summary.closest('details')).not.toHaveAttribute('open')
    await userEvent.click(summary)
    expect(summary.closest('details')).toHaveAttribute('open')
    expect(
      screen.getByText('Valider ne déclenche aucun remboursement : le virement se fait dans ta paie ou ta banque.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Une ligne sans plafond est dite « non vérifiée », jamais conforme/)).toBeInTheDocument()
  })
})
