import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FactoringView } from '@bellum/contracts'
import { formatCents } from '@/lib/money'

/**
 * L'écran des CESSIONS — ce qu'il refuse d'écrire.
 *
 * Chaque test vise une façon connue de mentir à l'écran : un « 0 € » posé sur
 * une absence, un écart annoncé sur une cession qui vient de partir, des
 * compteurs à zéro pendant le chargement, et des compteurs à zéro affichés à
 * quelqu'un qui n'a simplement pas le droit de les lire.
 */

const view = vi.fn()

vi.mock('../api', () => ({
  useFactoringView: () => view(),
  useCreateFactoringContract: () => ({ mutate: vi.fn(), isPending: false }),
  usePrepareAssignment: () => ({ mutate: vi.fn(), isPending: false }),
  useMarkAssigned: () => ({ mutate: vi.fn(), isPending: false }),
  useMarkSettled: () => ({ mutate: vi.fn(), isPending: false }),
  useCloseAssignment: () => ({ mutate: vi.fn(), isPending: false }),
  useReconcileSettlement: () => ({ mutate: vi.fn(), isPending: false }),
}))

// La coque de page a ses propres garanties ; ici on vérifie le CONTENU.
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

// ⚠️ Le faux `Link` DIFFUSE ses props. Un faux qui les jetterait testerait le
// mock et non le composant — défaut déjà commis dans ce dépôt.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children, ...rest }: Record<string, unknown> & { children?: ReactNode }) => (
    <a
      href={Object.entries((params ?? {}) as Record<string, string>).reduce(
        (path, [key, value]) => path.replace(`$${key}`, value),
        String(to),
      )}
      {...rest}
    >
      {children}
    </a>
  ),
}))

const { CessionsSection } = await import('./CessionsSection')

const CONTRACT_ID = 'c0000000-0000-4000-8000-000000000001'

function emptySummary(): FactoringView['summary'] {
  return {
    outstanding: { count: 0, amountCents: 0, withoutAmount: 0 },
    awaiting: { count: 0, amountCents: 0, withoutAmount: 0 },
    missing: { count: 0, amountCents: 0, withoutAmount: 0 },
    varianceCents: null,
    unmeasurable: 0,
    unreconciled: { count: 0, amountCents: 0, withoutAmount: 0 },
  }
}

function assignment(patch: Partial<FactoringView['assignments'][number]> = {}): FactoringView['assignments'][number] {
  return {
    id: 'a0000000-0000-4000-8000-000000000001',
    contractId: CONTRACT_ID,
    factorName: 'Le factor de l’ESN',
    missionId: 'm0000000-0000-4000-8000-000000000001',
    missionLabel: 'TMA plateforme',
    accountName: 'Cliente historique',
    periodMonth: '2026-06-01',
    status: 'assigned',
    assignedAmountCents: 1_000_000,
    commissionRateBps: 250,
    commissionAmountCents: 25_000,
    assignedOn: '2026-07-02',
    settledOn: null,
    decisionReason: null,
    reconciliation: { state: 'awaiting', settledCents: 0, expectedNetCents: 975_000, varianceCents: null },
    ...patch,
  }
}

function loaded(patch: Partial<FactoringView> = {}) {
  const data: FactoringView = {
    contracts: [
      {
        id: CONTRACT_ID,
        factorName: 'Le factor de l’ESN',
        contractReference: 'AFF-2026-014',
        commissionRateBps: 250,
        outstandingLimitCents: 50_000_000,
        status: 'active',
        startedOn: '2026-01-01',
        endedOn: null,
      },
    ],
    assignments: [],
    unreconciledSettlements: [],
    missing: [],
    summary: emptySummary(),
    canReadFinance: true,
    ...patch,
  }
  return { data, isLoading: false, isError: false }
}

beforeEach(() => {
  view.mockReset()
})

describe('CessionsPage — pendant le chargement et en panne', () => {
  it('n’affiche AUCUN chiffre pendant le chargement', () => {
    view.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    render(<CessionsSection />)
    // Quatre compteurs à zéro le temps d'une requête font refermer l'onglet
    // avant que la vérité n'arrive.
    expect(screen.queryByText(/Encours cédé/)).not.toBeInTheDocument()
  })

  it('NOMME une panne de lecture plutôt que d’afficher des compteurs vides', () => {
    // ⚠️ `GET /factoring` ne rend plus 403 sans `finance:read` (31/08/2026) :
    // une panne ici est une vraie panne, jamais un refus de droit.
    view.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<CessionsSection />)
    expect(screen.getByText(/n'ont pas pu être lues/i)).toBeInTheDocument()
    expect(screen.queryByText(/Encours cédé/)).not.toBeInTheDocument()
  })
})

describe('CessionsPage — la vue « nombres seulement » sans `finance:read`', () => {
  it('montre les compteurs et les totaux d’entête, et TAIT les montants par cession', () => {
    view.mockReturnValue(
      loaded({
        canReadFinance: false,
        // ⚠️ `assignedAmountCents`/`commissionAmountCents` à `null` : c'est ce
        // que le SERVEUR envoie réellement sans `finance:read`
        // (`redactFinance`, voir `factoring.service.spec.ts`). Le taux, lui,
        // n'est PAS un des quatre champs rédigés — il reste chiffré.
        assignments: [assignment({ assignedAmountCents: null, commissionAmountCents: null })],
        summary: {
          ...emptySummary(),
          outstanding: { count: 3, amountCents: 1_000_000, withoutAmount: 0 },
        },
      }),
    )
    const { container } = render(<CessionsSection />)
    // Le NOMBRE et le TOTAL agrégé restent lisibles ; le montant PAR cession,
    // lui, ne s'affiche NULLE PART — ni chiffré, ni « non renseigné » : la
    // phrase d'entête suffit, une par ligne serait du bruit.
    // ⚠️ `container.textContent`, jamais `getByText` : `Intl.NumberFormat`
    // insère des espaces INSÉCABLES que `getByText` normalise côté DOM mais
    // pas côté chaîne cherchée, et les deux cessent de se correspondre.
    expect(screen.getByText(/données financières détaillées/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Encours cédé/).length).toBeGreaterThan(0)
    expect(container.textContent).toContain(formatCents(1_000_000))
    expect(screen.queryByText(/Montant cédé non renseigné/i)).not.toBeInTheDocument()
    // Le TAUX (2,5 %), lui, reste visible : ce n'est pas un des champs
    // rédigés. Deux occurrences attendues : la carte du contrat ET la ligne
    // de la cession.
    expect(screen.getAllByText(/2,5 ?%/).length).toBeGreaterThan(0)
  })

  it('ne montre PAS la phrase quand le droit est là', () => {
    view.mockReturnValue(loaded({ canReadFinance: true }))
    render(<CessionsSection />)
    expect(screen.queryByText(/données financières détaillées/i)).not.toBeInTheDocument()
  })
})

describe('CessionsPage — l’alerte de dépassement du plafond d’encours', () => {
  it('déclenche l’alerte quand l’encours dépasse le plafond SAISI', () => {
    view.mockReturnValue(
      loaded({
        contracts: [
          {
            id: CONTRACT_ID,
            factorName: 'Le factor de l’ESN',
            contractReference: 'AFF-2026-014',
            commissionRateBps: 250,
            outstandingLimitCents: 800_000,
            status: 'active',
            startedOn: '2026-01-01',
            endedOn: null,
          },
        ],
        summary: {
          ...emptySummary(),
          outstanding: { count: 2, amountCents: 1_000_000, withoutAmount: 0 },
        },
      }),
    )
    const { container } = render(<CessionsSection />)
    expect(container.textContent).toContain(`Dépassement de ${formatCents(200_000)}`)
  })

  it('ne déclenche AUCUNE alerte sans plafond SAISI — pas de seuil deviné', () => {
    view.mockReturnValue(
      loaded({
        summary: {
          ...emptySummary(),
          outstanding: { count: 2, amountCents: 5_000_000, withoutAmount: 0 },
        },
      }),
    )
    render(<CessionsSection />)
    expect(screen.queryByText(/Dépassement de/i)).not.toBeInTheDocument()
  })

  it('ne déclenche AUCUNE alerte quand l’encours reste SOUS le plafond', () => {
    view.mockReturnValue(
      loaded({
        contracts: [
          {
            id: CONTRACT_ID,
            factorName: 'Le factor de l’ESN',
            contractReference: 'AFF-2026-014',
            commissionRateBps: 250,
            outstandingLimitCents: 50_000_000,
            status: 'active',
            startedOn: '2026-01-01',
            endedOn: null,
          },
        ],
        summary: {
          ...emptySummary(),
          outstanding: { count: 2, amountCents: 1_000_000, withoutAmount: 0 },
        },
      }),
    )
    render(<CessionsSection />)
    expect(screen.queryByText(/Dépassement de/i)).not.toBeInTheDocument()
  })
})

describe('CessionsPage — ce qui n’est pas mesuré ne s’affiche pas « 0 »', () => {
  it('dit « non mesuré » sur un encours dont aucune ligne n’est chiffrée', () => {
    // ⚠️ Les trois autres seaux sont CHIFFRÉS exprès : sur un seau VIDE, « 0 € »
    // est VRAI (« rien n'est cédé » est une information), et l'y interdire
    // ferait un test qui ment dans l'autre sens. Ce qui est refusé ici est le
    // « 0 € » posé sur une ABSENCE — deux lignes cédées dont on ignore le
    // montant, ce qui n'est pas la même chose que zéro euro cédé.
    view.mockReturnValue(
      loaded({
        summary: {
          outstanding: { count: 2, amountCents: null, withoutAmount: 2 },
          awaiting: { count: 1, amountCents: 975_000, withoutAmount: 0 },
          missing: { count: 1, amountCents: 460_000, withoutAmount: 0 },
          varianceCents: -15_000,
          unmeasurable: 0,
          unreconciled: { count: 0, amountCents: 0, withoutAmount: 0 },
        },
      }),
    )
    render(<CessionsSection />)
    expect(screen.queryByText('0 €')).not.toBeInTheDocument()
    expect(screen.getAllByText(/non mesuré/i).length).toBeGreaterThan(0)
  })

  it('dit « aucun écart mesurable » plutôt qu’un écart de zéro', () => {
    // « Écart : 0 € » se lirait « tout est juste », c'est-à-dire l'inverse de
    // « on n'a rien pu vérifier ».
    view.mockReturnValue(loaded({ summary: { ...emptySummary(), varianceCents: null } }))
    render(<CessionsSection />)
    expect(screen.getByText(/aucun écart mesurable/i)).toBeInTheDocument()
  })

  it('n’affiche AUCUN écart sur une cession en attente', () => {
    view.mockReturnValue(loaded({ assignments: [assignment()] }))
    render(<CessionsSection />)
    // Le net attendu se dit ; l'écart, non — « −9 750 € » se lirait comme un
    // impayé sur une cession qui vient de partir.
    expect(screen.getByText(/Net attendu/)).toBeInTheDocument()
  })

  it('dit « taux inconnu » plutôt que 0 % quand ni la cession ni le contrat n’en portent', () => {
    view.mockReturnValue(
      loaded({ assignments: [assignment({ commissionRateBps: null, commissionAmountCents: null })] }),
    )
    render(<CessionsSection />)
    expect(screen.queryByText('0 %')).not.toBeInTheDocument()
  })
})

describe('CessionsPage — le geste de la maquette', () => {
  it('propose « Préparer la cession » sur une créance facturée sans cession', () => {
    view.mockReturnValue(
      loaded({
        missing: [
          {
            missionId: 'm0000000-0000-4000-8000-000000000002',
            missionLabel: 'Reprise de l’ordonnancement',
            accountName: 'Cliente historique',
            periodMonth: '2026-05-01',
            invoicedAmountCents: 460_000,
            dueOn: '2026-06-30',
          },
        ],
        summary: { ...emptySummary(), missing: { count: 1, amountCents: 460_000, withoutAmount: 0 } },
      }),
    )
    render(<CessionsSection />)
    expect(screen.getByRole('button', { name: /Préparer la cession/i })).toBeInTheDocument()
  })

  it('ne propose PAS de préparer une cession sans contrat en cours', () => {
    // Le serveur refuserait le geste ; un bouton qui échoue au clic est pire
    // qu'un bouton absent.
    view.mockReturnValue(
      loaded({
        contracts: [],
        missing: [
          {
            missionId: 'm0000000-0000-4000-8000-000000000002',
            missionLabel: 'Reprise de l’ordonnancement',
            accountName: 'Cliente historique',
            periodMonth: '2026-05-01',
            invoicedAmountCents: 460_000,
            dueOn: '2026-06-30',
          },
        ],
      }),
    )
    render(<CessionsSection />)
    expect(screen.queryByRole('button', { name: /Préparer la cession/i })).not.toBeInTheDocument()
  })

  it('annonce qu’AUCUNE coordonnée bancaire n’est demandée', () => {
    // La phrase est à l'écran exprès : quelqu'un qui cherche où saisir son IBAN
    // doit apprendre qu'il ne le trouvera pas, plutôt que de l'écrire dans la
    // référence du contrat.
    view.mockReturnValue(loaded({ contracts: [] }))
    render(<CessionsSection />)
    expect(screen.getByRole('button', { name: /Ajouter un contrat/i })).toBeInTheDocument()
  })

  it('ne propose plus aucun geste sur une cession refusée par le factor', () => {
    view.mockReturnValue(
      loaded({
        assignments: [
          assignment({
            status: 'rejected',
            decisionReason: 'Encours client saturé',
            reconciliation: { state: 'not_due', settledCents: 0, expectedNetCents: null, varianceCents: null },
          }),
        ],
      }),
    )
    render(<CessionsSection />)
    expect(screen.queryByRole('button', { name: /Actions sur cette cession/i })).not.toBeInTheDocument()
  })
})
