import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemberPortfolio, WorkspaceTeamMember } from '@bellum/contracts'

/**
 * LE DÉPART D'UN MEMBRE, À L'ÉCRAN.
 *
 * Ce que ce fichier garde, et rien d'autre :
 *
 *  1. **La prévisualisation existe** — le geste irréversible n'est plus un clic
 *     nu sur une corbeille (tome 8 §33, angle mort n°2).
 *  2. **Un comptage impossible ne s'écrit pas « 0 »** — c'est la règle du dépôt
 *     appliquée là où elle est le plus dangereuse : « il ne porte rien, on peut
 *     le retirer » lu sur une lecture ratée.
 *  3. **Ce qui reste personnel est NOMMÉ** — la messagerie en tête (D58, D65).
 *  4. **Le successeur vient du SERVEUR** — la liste des membres éligibles n'est
 *     pas refaite ici : deux chemins qui refont la même dérivation divergent.
 */

const useMemberPortfolioMock = vi.fn()
vi.mock('@/features/team/hooks/useMemberPortfolio', () => ({
  MEMBER_PORTFOLIO_KEY: (userId: string) => ['member-portfolio', userId],
  useMemberPortfolio: (...args: unknown[]) => useMemberPortfolioMock(...args),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { MemberOffboardingDialog } = await import('./MemberOffboardingDialog')

const MEMBER: WorkspaceTeamMember = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'partant@esn.fr',
  fullName: 'Camille Partant',
  role: 'sales',
  joinedAt: '2026-03-02T09:00:00.000Z',
}

function portfolio(over: Partial<MemberPortfolio> = {}): MemberPortfolio {
  return {
    userId: MEMBER.userId,
    email: MEMBER.email,
    fullName: MEMBER.fullName,
    holdings: [
      { kind: 'accounts', count: 12 },
      { kind: 'contacts', count: 31 },
      { kind: 'tasks', count: 0 },
      { kind: 'opportunities', count: 2 },
      { kind: 'needs', count: 1 },
      { kind: 'missions', count: 0 },
    ],
    personal: ['mailbox', 'calendar', 'copilotConversations', 'personalSettings'],
    eligibleSuccessors: [
      {
        userId: '22222222-2222-4222-8222-222222222222',
        email: 'reprend@esn.fr',
        fullName: 'Alix Reprend',
        role: 'sales',
        joinedAt: '2026-01-05T09:00:00.000Z',
      },
    ],
    ...over,
  }
}

const handOver = { mutate: vi.fn(), isPending: false }

beforeEach(() => {
  useMemberPortfolioMock.mockReset()
  handOver.mutate.mockReset()
})

function renderDialog(state: { data?: MemberPortfolio; isLoading?: boolean; isError?: boolean }) {
  useMemberPortfolioMock.mockReturnValue({
    portfolio: { data: state.data, isLoading: state.isLoading ?? false, isError: state.isError ?? false },
    handOver,
  })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemberOffboardingDialog member={MEMBER} open onOpenChange={vi.fn()} onRemove={vi.fn()} removing={false} />
    </QueryClientProvider>,
  )
}

describe('la boîte de départ d’un membre', () => {
  it('montre ce que la personne porte AVANT de proposer le moindre geste', () => {
    renderDialog({ data: portfolio() })

    expect(screen.getByText(/Ce qui change de main/)).toBeInTheDocument()
    expect(screen.getByText('Comptes portés')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('31')).toBeInTheDocument()
  })

  it('écrit « non mesuré » quand le comptage n’a pas abouti — jamais « 0 »', () => {
    renderDialog({
      data: portfolio({
        holdings: [
          { kind: 'accounts', count: null },
          { kind: 'contacts', count: 0 },
          { kind: 'tasks', count: 0 },
          { kind: 'opportunities', count: 0 },
          { kind: 'needs', count: 0 },
          { kind: 'missions', count: 0 },
        ],
      }),
    })

    // La ligne « Comptes portés » ne porte AUCUN chiffre : elle porte la raison.
    expect(screen.getByText(/le comptage n'a pas abouti/)).toBeInTheDocument()
    // …et un vrai zéro reste écrit « 0 » : c'est une mesure, pas une absence.
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
  })

  it('NOMME ce qui ne se transmet pas — la messagerie en tête (D58, D65)', () => {
    renderDialog({ data: portfolio() })

    expect(screen.getByText(/Ce qui ne se transmet pas/)).toBeInTheDocument()
    expect(screen.getByText(/sa messagerie connectée/)).toBeInTheDocument()
    expect(screen.getByText(/ses conversations avec Laura/)).toBeInTheDocument()
  })

  it('dit que ce qui a été appris reste à l’espace', () => {
    renderDialog({ data: portfolio() })

    expect(screen.getByText(/appartient à l'espace/)).toBeInTheDocument()
  })

  it('propose les successeurs RENVOYÉS PAR LE SERVEUR, et pas une liste refaite ici', () => {
    renderDialog({ data: portfolio() })

    expect(screen.getByRole('combobox', { name: /Choisir la personne qui reprend/ })).toBeInTheDocument()
  })

  it('dit quoi faire quand personne ne peut reprendre, plutôt que d’offrir un menu vide', () => {
    renderDialog({ data: portfolio({ eligibleSuccessors: [] }) })

    expect(screen.getByText(/Aucun autre membre ne peut porter un portefeuille/)).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /Choisir la personne qui reprend/ })).not.toBeInTheDocument()
  })

  it('n’autorise pas le transfert tant qu’aucun successeur n’est choisi', () => {
    renderDialog({ data: portfolio() })

    expect(screen.getByRole('button', { name: 'Transférer le portefeuille' })).toBeDisabled()
  })

  it('laisse retirer sans transférer — le portefeuille retourne alors aux non attribués', () => {
    renderDialog({ data: portfolio() })

    expect(screen.getByRole('button', { name: 'Retirer sans transférer' })).toBeEnabled()
  })

  it('dit qu’il lit, plutôt que d’afficher un portefeuille vide pendant le chargement', () => {
    renderDialog({ isLoading: true })

    expect(screen.getByText(/Lecture de son portefeuille/)).toBeInTheDocument()
    expect(screen.queryByText('Comptes portés')).not.toBeInTheDocument()
  })

  it('dit qu’il a échoué, plutôt que de montrer un portefeuille à zéro', () => {
    renderDialog({ isError: true })

    expect(screen.getByText(/Impossible de lire son portefeuille/)).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})
