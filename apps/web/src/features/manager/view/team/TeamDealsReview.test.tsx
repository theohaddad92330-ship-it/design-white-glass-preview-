import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagerMemberStats, ManagerPipelineReview } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/** Théo D team-business › Revue des affaires : la table, son filtre, « Comprendre les montants », « Revoir ». */

const inspection = vi.fn()
vi.mock('@/features/pilotage/pipe/api', () => ({ usePipeInspection: () => inspection() }))
const closeDate = vi.fn()
const owner = vi.fn()
vi.mock('@/features/projects/hooks/useUpdateProjectForecast', () => ({
  useUpdateCloseDate: () => ({ mutateAsync: closeDate, isPending: false, isError: false }),
}))
vi.mock('@/features/projects/hooks/useUpdateProjectOwner', () => ({
  useUpdateProjectOwner: () => ({ mutateAsync: owner, isPending: false, isError: false }),
}))

const { TeamDealsReview } = await import('./TeamDealsReview')

const row = (id: string, stage: string, amountCents: number | null, extra: Record<string, unknown> = {}) => ({
  id,
  accountId: `a-${id}`,
  accountName: `Compte ${id}`,
  label: `Affaire ${id}`,
  amountCents,
  stage,
  forecastCategory: null,
  expectedCloseOn: null,
  ownerId: 'u1',
  ownerName: 'Maëlle Lorquin',
  daysInStage: 3,
  signals: [],
  ...extra,
})
const REVIEW: ManagerPipelineReview = {
  inactivity_days: 14,
  stuck_days: 9,
  total: 1,
  counts: { no_next_step: 1, no_activity: 0, stuck: 0 },
  items: [
    {
      opportunity_id: 'd2',
      label: 'Affaire d2',
      account_id: 'a-d2',
      company_name: 'Compte d2',
      stage: 'negotiation',
      owner_user_id: 'u1',
      reasons: ['no_next_step'],
      stage_entered_at: '2026-10-01T00:00:00.000Z',
      last_activity_at: null,
    },
  ],
} as ManagerPipelineReview
const MEMBERS = [
  { user_id: 'u1', name: 'Maëlle Lorquin' },
  { user_id: 'u2', name: 'Léa Marchand' },
] as ManagerMemberStats[]

beforeEach(() => {
  vi.clearAllMocks()
  inspection.mockReturnValue({
    isLoading: false,
    isError: false,
    data: {
      rows: [
        row('d1', 'qualified', 7_800_000, { expectedCloseOn: '2026-10-28' }),
        row('d2', 'negotiation', 9_600_000),
        row('d3', 'qualified', null, { ownerId: null, ownerName: null }),
      ],
      totals: [],
      generatedAt: '2026-10-23T00:00:00Z',
    },
  })
})

describe('Revue des affaires', () => {
  it('le panneau de Théo : titre, phrase, « Pipe complet », et les six colonnes dans l’ordre', async () => {
    renderWithRouter(<TeamDealsReview review={REVIEW} members={MEMBERS} />)
    expect(
      await screen.findByRole('heading', { name: 'Faire avancer les affaires, une décision à la fois.' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pipe complet' })).toHaveAttribute('href', '/pilotage/pipe')
    const headers = screen.getAllByRole('columnheader').map(cell => cell.textContent || cell.getAttribute('aria-label'))
    expect(headers).toEqual([
      'Affaire & compte',
      'Responsable',
      'Étape',
      'Montant estimé',
      'Prochaine décision',
      'Actions',
    ])
    expect(screen.getAllByRole('row')).toHaveLength(4)
  })

  it('la raison du serveur et la décision visée ; une affaire sans montant reste, « Non chiffrée », hors de la somme', async () => {
    renderWithRouter(<TeamDealsReview review={REVIEW} members={MEMBERS} />)
    const d2 = (await screen.findByText('Affaire d2')).closest('tr') as HTMLElement
    expect(within(d2).getByText('Sans prochaine étape')).toBeInTheDocument()
    const d1 = screen.getByText('Affaire d1').closest('tr') as HTMLElement
    expect(within(d1).getByText(/Décision visée : 28 oct/)).toBeInTheDocument()
    const d3 = screen.getByText('Affaire d3').closest('tr') as HTMLElement
    expect(within(d3).getByText('Non chiffrée')).toBeInTheDocument()
    expect(within(d3).getByText('Aucun responsable')).toBeInTheDocument()
    expect(screen.getByText(/3 affaires · 174/)).toBeInTheDocument()
    // Aucun pourcentage de signature : la seule mention est la phrase qui dit qu'il n'y en a pas.
    expect(screen.queryByText(/\d+\s*%/)).not.toBeInTheDocument()
  })

  it('le filtre d’étape est multi-sélection et ne garde que les étapes choisies', async () => {
    renderWithRouter(<TeamDealsReview review={REVIEW} members={MEMBERS} />)
    const group = await screen.findByRole('group', { name: 'Étape des affaires' })
    fireEvent.click(within(group).getByRole('button', { name: /Proposition/ }))
    expect(screen.getAllByRole('row')).toHaveLength(2)
    expect(screen.getByText(/1 affaire · 96/)).toBeInTheDocument()
  })

  it('« Comprendre les montants » ouvre sa fenêtre', async () => {
    renderWithRouter(<TeamDealsReview review={REVIEW} members={MEMBERS} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Comprendre les montants' }))
    expect(await screen.findByRole('dialog', { name: 'Le pipe ouvert' })).toBeInTheDocument()
  })

  it('« Revoir » ouvre la suite de l’affaire et n’écrit que ce qui a changé', async () => {
    owner.mockResolvedValue({})
    renderWithRouter(<TeamDealsReview review={REVIEW} members={MEMBERS} />)
    const d2 = (await screen.findByText('Affaire d2')).closest('tr') as HTMLElement
    fireEvent.click(within(d2).getByRole('button', { name: 'Revoir' }))
    const dialog = await screen.findByRole('dialog', { name: 'Revoir la suite de l’affaire' })
    expect(within(dialog).getByRole('link', { name: 'Voir le plan de Compte d2' })).toHaveAttribute(
      'href',
      '/accounts/a-d2',
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer la suite' }))
    expect(closeDate).not.toHaveBeenCalled()
    expect(owner).not.toHaveBeenCalled()
  })

  it('aucune affaire ouverte : une phrase, jamais « 0 affaire · 0 € »', async () => {
    inspection.mockReturnValue({ isLoading: false, isError: false, data: { rows: [], totals: [], generatedAt: 'x' } })
    renderWithRouter(<TeamDealsReview review={REVIEW} members={MEMBERS} />)
    expect(await screen.findByTestId('team-deals-empty')).toHaveTextContent('Aucune affaire ouverte')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
