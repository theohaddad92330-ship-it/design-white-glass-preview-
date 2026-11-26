import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { MessageStyleTab } from './MessageStyleTab'

/**
 * #2369.14 (épopée #2768) — le NO-GO exige un écran qui MONTRE les règles
 * apprises et PERMETTE de les corriger. Ces tests défendent : la lecture
 * (chargement, erreur, vide pour chaque section, séparément) des templates
 * ET des propositions de règle, et la correction (adopter / refuser une
 * proposition `pending`).
 */
const { useTemplatesMock, useProposalsMock, decideMutateAsync, useDecideMock, useUsageMock, transitionMutateAsync } =
  vi.hoisted(() => ({
    transitionMutateAsync: vi.fn(),
    useTemplatesMock: vi.fn(),
    useProposalsMock: vi.fn(),
    decideMutateAsync: vi.fn(),
    useDecideMock: vi.fn(),
    useUsageMock: vi.fn(),
  }))
vi.mock('@/features/message-style/hooks/useMessageStyle', () => ({
  useMessageStyleTemplates: useTemplatesMock,
  useMessageStyleRuleProposals: useProposalsMock,
  useDecideMessageStyleRuleProposal: useDecideMock,
  useMessageStyleUsage: useUsageMock,
  useMessageLearningSummary: () => ({
    data: { express: null, behavioral: null, quality: null, proposedRule: null, globalRule: null, history: [] },
    isLoading: false,
    isError: false,
  }),
  useTransitionMessageStyleTemplate: () => ({ mutateAsync: transitionMutateAsync, isPending: false }),
  useCreateMessageStyleTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMessageStylePreviewCompare: () => ({ mutate: vi.fn(), isPending: false, isError: false, data: undefined }),
}))
vi.mock('@/features/global-search/useContactSearchResults', () => ({
  useContactSearchResults: () => ({ data: undefined }),
}))

// #2204.65 — le formulaire propose les portées (équipe, fil) via ce hook, qui lit la session : la même
// doublure que les tests du composer (`Chat.stop.test.tsx`), sans périmètre porté.
vi.mock('@/features/memory/hooks/useMemoryScopeOptions', async () => {
  const { offerableMemoryScopes } = await import('@bellum/contracts')
  return {
    useMemoryScopeOptions: (conversationId?: string | null) =>
      offerableMemoryScopes({ conversationId, businessUnits: [] }),
  }
})

let mockRole: string | null = 'owner'
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: mockRole ? { workspace: { role: mockRole } } : undefined }),
}))

const TEMPLATES = [
  {
    id: 't1',
    workspaceId: 'w1',
    ownerId: 'u1',
    objective: 'Relancer un décideur silencieux depuis 15 jours',
    channel: 'email' as const,
    persona: 'Décideur IT, grand compte',
    status: 'active' as const,
    forbidden: ['jamais de superlatif'],
    version: 2,
    scope: 'workspace' as const,
    businessUnitId: null,
    conversationId: null,
    pitch: 'Socle data livré chez un assureur',
    tone: null,
    signature: null,
    createdAt: '',
    updatedAt: '',
  },
]

const PROPOSALS = [
  {
    id: 'p1',
    workspaceId: 'w1',
    templateId: null,
    proposedBy: 'u1',
    signal: 'wording_preference' as const,
    observation: 'Retire les points d’exclamation',
    status: 'pending' as const,
    decidedBy: null,
    decidedAt: null,
    createdAt: '',
  },
  {
    id: 'p2',
    workspaceId: 'w1',
    templateId: null,
    proposedBy: 'u1',
    signal: 'tone_preference' as const,
    observation: 'Ton plus direct en ouverture',
    status: 'adopted' as const,
    decidedBy: 'u1',
    decidedAt: '2026-09-26T10:00:00.000Z',
    createdAt: '',
  },
]

beforeEach(() => {
  mockRole = 'owner'
  transitionMutateAsync.mockReset().mockResolvedValue(undefined)
  decideMutateAsync.mockReset().mockResolvedValue(undefined)
  useDecideMock.mockReturnValue({ mutateAsync: decideMutateAsync, isPending: false })
  useUsageMock.mockReturnValue({ data: [] })
})

describe('MessageStyleTab', () => {
  it('affiche le chargement des deux sections', () => {
    useTemplatesMock.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    useProposalsMock.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    render(<MessageStyleTab />)
    expect(document.querySelectorAll('.animate-spin').length).toBe(2)
  })

  it('dit l’échec plutôt qu’une liste vide, pour chaque section', () => {
    useTemplatesMock.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    useProposalsMock.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<MessageStyleTab />)
    expect(screen.getByText(/Les styles n[’']ont pas pu être lus/)).toBeInTheDocument()
    expect(screen.getByText(/Les règles proposées n[’']ont pas pu être lues/)).toBeInTheDocument()
  })

  it('dit le vide, jamais une liste sans rien dedans, pour chaque section', () => {
    useTemplatesMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    useProposalsMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<MessageStyleTab />)
    expect(screen.getByText(/Aucun style appris/)).toBeInTheDocument()
    expect(screen.getByText(/Aucune règle proposée/)).toBeInTheDocument()
  })

  it('rend chaque template avec son statut, sa persona, ses interdits et sa version', () => {
    useTemplatesMock.mockReturnValue({ data: TEMPLATES, isLoading: false, isError: false })
    useProposalsMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<MessageStyleTab />)
    expect(screen.getByText('Relancer un décideur silencieux depuis 15 jours')).toBeInTheDocument()
    expect(screen.getByText('Actif')).toBeInTheDocument()
    expect(screen.getByText(/Décideur IT, grand compte/)).toBeInTheDocument()
    expect(screen.getByText(/jamais de superlatif/)).toBeInTheDocument()
    expect(screen.getByText(/Version 2/)).toBeInTheDocument()
  })

  it('#2204.60/.61/.63 — nomme le pitch déclaré, aucune ligne pour un ton ou une signature non déclarés', () => {
    useTemplatesMock.mockReturnValue({ data: TEMPLATES, isLoading: false, isError: false })
    useProposalsMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<MessageStyleTab />)
    expect(screen.getByText('Pitch : Socle data livré chez un assureur')).toBeInTheDocument()
    expect(screen.queryByText(/^Ton :/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Signature :/)).not.toBeInTheDocument()
  })

  it('rend une proposition `pending` avec ses deux boutons de décision', () => {
    useTemplatesMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    useProposalsMock.mockReturnValue({ data: [PROPOSALS[0]], isLoading: false, isError: false })
    render(<MessageStyleTab />)
    expect(screen.getByText('Retire les points d’exclamation')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Adopter/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Refuser/i })).toBeInTheDocument()
  })

  it('ne montre AUCUN bouton de décision sur une proposition déjà décidée', () => {
    useTemplatesMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    useProposalsMock.mockReturnValue({ data: [PROPOSALS[1]], isLoading: false, isError: false })
    render(<MessageStyleTab />)
    expect(screen.getByText('Ton plus direct en ouverture')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Adopter/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Refuser/i })).not.toBeInTheDocument()
  })

  it('adopte une proposition au clic', async () => {
    useTemplatesMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    useProposalsMock.mockReturnValue({ data: [PROPOSALS[0]], isLoading: false, isError: false })
    render(<MessageStyleTab />)
    await userEvent.click(screen.getByRole('button', { name: /Adopter/i }))
    expect(decideMutateAsync).toHaveBeenCalledWith({ id: 'p1', decision: 'adopted' })
  })

  it('refuse une proposition au clic', async () => {
    useTemplatesMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    useProposalsMock.mockReturnValue({ data: [PROPOSALS[0]], isLoading: false, isError: false })
    render(<MessageStyleTab />)
    await userEvent.click(screen.getByRole('button', { name: /Refuser/i }))
    expect(decideMutateAsync).toHaveBeenCalledWith({ id: 'p1', decision: 'rejected' })
  })

  it('cache Adopter/Refuser sans `team:manage` — un geste d’ÉQUIPE, jamais le seul auteur de l’import', () => {
    mockRole = 'sales'
    useTemplatesMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    useProposalsMock.mockReturnValue({ data: [PROPOSALS[0]], isLoading: false, isError: false })
    render(<MessageStyleTab />)
    expect(screen.queryByRole('button', { name: /Adopter/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Refuser/i })).not.toBeInTheDocument()
  })

  // #2369.12 (reste, épopée #2768) — aucun message relié à ce style → « non mesuré », jamais 0.
  it('dit « non mesuré » quand aucun taux d’usage n’est relié à ce style', () => {
    useTemplatesMock.mockReturnValue({ data: TEMPLATES, isLoading: false, isError: false })
    useProposalsMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    useUsageMock.mockReturnValue({ data: [] })
    render(<MessageStyleTab />)
    expect(screen.getByText(/Usage : non mesuré/)).toBeInTheDocument()
  })

  it('affiche les quatre taux d’usage une fois reliés à ce style (id + version)', () => {
    useTemplatesMock.mockReturnValue({ data: TEMPLATES, isLoading: false, isError: false })
    useProposalsMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    useUsageMock.mockReturnValue({
      data: [
        {
          templateId: 't1',
          templateVersion: 2,
          sampleSize: 4,
          modificationRate: 0.25,
          validationRate: 0.5,
          responseRate: 0,
          unsubscribeRate: null,
        },
      ],
    })
    render(<MessageStyleTab />)
    expect(screen.getByText(/Modifié 25 %/)).toBeInTheDocument()
    expect(screen.getByText(/Validé 50 %/)).toBeInTheDocument()
    expect(screen.getByText(/Répondu 0 %/)).toBeInTheDocument()
    expect(screen.getByText(/Désinscrit —/)).toBeInTheDocument()
  })

  // #2369.11 (reste, épopée #2768) — le bouton « Comparer » n'apparaît QUE sur un canal générable.
  it('propose « Comparer » sur un canal générable (email), le masque sur un canal sans générateur', () => {
    useProposalsMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    useTemplatesMock.mockReturnValue({ data: TEMPLATES, isLoading: false, isError: false })
    const { rerender } = render(<MessageStyleTab />)
    expect(screen.getByRole('button', { name: /Comparer/i })).toBeInTheDocument()

    useTemplatesMock.mockReturnValue({
      data: [{ ...TEMPLATES[0], channel: 'manual' }],
      isLoading: false,
      isError: false,
    })
    rerender(<MessageStyleTab />)
    expect(screen.queryByRole('button', { name: /Comparer/i })).not.toBeInTheDocument()
  })

  // #2204.77 — le geste qui manquait : sans lui aucun style n'atteignait `active`, donc aucun n'était appliqué.
  it('propose les transitions permises depuis le statut et appelle la route de transition', async () => {
    useTemplatesMock.mockReturnValue({
      data: [{ ...TEMPLATES[0], status: 'validated' as const }],
      isLoading: false,
      isError: false,
    })
    useProposalsMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<MessageStyleTab />)
    expect(screen.queryByRole('button', { name: /Repasser en brouillon/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Activer/i }))
    expect(transitionMutateAsync).toHaveBeenCalledWith({ id: 't1', to: 'active' })
  })

  it('ne propose aucune transition à qui n’a pas le droit d’équipe, ni depuis `archived`', () => {
    useTemplatesMock.mockReturnValue({
      data: [TEMPLATES[0], { ...TEMPLATES[0], id: 't2', status: 'archived' as const }],
      isLoading: false,
      isError: false,
    })
    useProposalsMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    mockRole = 'viewer'
    render(<MessageStyleTab />)
    expect(screen.queryByRole('button', { name: /Archiver|Activer|Déprécier/i })).not.toBeInTheDocument()
  })

  it('offre « Créer un style » avec le droit d’écriture, jamais à un simple lecteur (#2204.59-.65)', () => {
    useTemplatesMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    useProposalsMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<MessageStyleTab />)
    expect(screen.getByRole('button', { name: 'Créer un style' })).toBeInTheDocument()
    cleanup()
    mockRole = 'viewer'
    render(<MessageStyleTab />)
    expect(screen.queryByRole('button', { name: 'Créer un style' })).not.toBeInTheDocument()
  })
})
