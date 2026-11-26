import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CvVersion } from '@bellum/contracts'
import { chooseOption, getSelect } from '@/test/select'

/**
 * Statut, validation et diff du dossier de compétences (#2333.2/.5/.8/.9).
 *
 * « Laura indique ce qui attend encore une validation » (#2333.9) : une
 * version `pending_validation` doit se VOIR à l'écran, jamais se déduire.
 * Et le diff (#2333.5) doit nommer avant/après/raison pour chaque
 * changement — pas seulement les compétences barrées.
 */
const TALENT_ID = 'c0000000-0000-4000-8000-000000000001'

const BASE_VERSION: CvVersion = {
  id: 'v0000000-0000-4000-8000-000000000001',
  consultantId: TALENT_ID,
  needId: null,
  opportunityId: null,
  rfpId: null,
  comparableMissionId: null,
  generatedBy: null,
  versionKind: 'client',
  templateKey: 'default',
  language: 'fr',
  anonymisationRule: 'nom_complet',
  sections: [{ title: 'Profil', body: 'Ingénieur plateforme' }],
  excludedSkills: [{ term: 'Kafka', reason: 'déclarée — absente du CV source' }],
  changes: [
    {
      before: 'compétence déclarée : Kubernetes',
      after: 'retenue dans le dossier',
      reason: 'présente dans le CV source',
      sourceProof: 'Kubernetes, Prometheus',
    },
    {
      before: 'compétence déclarée : Kafka',
      after: 'retirée du dossier',
      reason: 'déclarée — absente du CV source',
      sourceProof: null,
    },
  ],
  highlightedSkills: [],
  generatedAt: '2026-09-22T09:00:00.000Z',
  sentToContactId: null,
  status: 'pending_validation',
  validatedBy: null,
  validatedAt: null,
}

const {
  versionsQuery,
  generateMutation,
  validateMutation,
  compareMutation,
  updateSectionsMutation,
  talentMissionsQuery,
  workspaceMembersQuery,
  opportunitiesForMatchQuery,
} = vi.hoisted(() => ({
  versionsQuery: vi.fn(),
  generateMutation: vi.fn(),
  validateMutation: vi.fn(),
  compareMutation: vi.fn(),
  updateSectionsMutation: vi.fn(),
  talentMissionsQuery: vi.fn(),
  workspaceMembersQuery: vi.fn(),
  opportunitiesForMatchQuery: vi.fn(),
}))
vi.mock('../../hooks', () => ({
  useCvVersions: () => versionsQuery(),
  useGenerateCvVersion: () => generateMutation(),
  useValidateCvVersion: () => validateMutation(),
  useCompareCvVersions: () => compareMutation(),
  useUpdateCvVersionSections: () => updateSectionsMutation(),
  useTalentMissions: () => talentMissionsQuery(),
  useOpportunitiesForMatch: () => opportunitiesForMatchQuery(),
}))
vi.mock('@/features/rfp/api', () => ({
  rfpApi: { list: vi.fn().mockResolvedValue({ rfps: [] }) },
  rfpKeys: { list: ['rfp', 'list'] },
}))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => workspaceMembersQuery(),
}))

const { CvStudioPanel } = await import('./CvStudioPanel')

function renderPanel() {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <CvStudioPanel talentId={TALENT_ID} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  compareMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false, data: undefined })
  updateSectionsMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
  talentMissionsQuery.mockReturnValue({ data: [] })
  workspaceMembersQuery.mockReturnValue({ data: [] })
  opportunitiesForMatchQuery.mockReturnValue({ data: [] })
})

describe('CvStudioPanel — une version EN ATTENTE se voit, et se valide', () => {
  it('affiche le statut « en attente de validation » et le bouton Valider', () => {
    versionsQuery.mockReturnValue({ data: [BASE_VERSION] })
    generateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    const mutateAsync = vi.fn().mockResolvedValue({ ...BASE_VERSION, status: 'validated' })
    validateMutation.mockReturnValue({ mutateAsync, isPending: false })

    renderPanel()

    expect(screen.getByText('En attente de validation')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: /Valider/ })
    fireEvent.click(button)
    expect(mutateAsync).toHaveBeenCalledWith(BASE_VERSION.id)
  })

  it('sait dire NON : une version déjà VALIDÉE n’affiche aucun bouton Valider', () => {
    versionsQuery.mockReturnValue({ data: [{ ...BASE_VERSION, status: 'validated' }] })
    generateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    validateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })

    renderPanel()

    expect(screen.getByText('Validée')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Valider/ })).not.toBeInTheDocument()
  })

  it('le diff NOMME avant/après/raison pour CHAQUE changement, retenu et barré', () => {
    versionsQuery.mockReturnValue({ data: [BASE_VERSION] })
    generateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    validateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })

    renderPanel()

    expect(screen.getByText(/compétence déclarée : Kubernetes/)).toBeInTheDocument()
    expect(screen.getByText(/retenue dans le dossier/)).toBeInTheDocument()
    expect(screen.getByText(/Kubernetes, Prometheus/)).toBeInTheDocument()
    expect(screen.getByText(/compétence déclarée : Kafka/)).toBeInTheDocument()
    expect(screen.getByText(/retirée du dossier/)).toBeInTheDocument()
  })

  // #2187.36/.37/.40 — le studio ne réécrit jamais, ne réordonne jamais les
  // sections et n'ajoute jamais d'expérience : ces trois garanties se VOIENT
  // sur chaque version, elles ne se déduisent pas.
  it('nomme les trois garanties du dossier — aucune reformulation, ordre fixe, aucune expérience ajoutée', () => {
    versionsQuery.mockReturnValue({ data: [BASE_VERSION] })
    generateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    validateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })

    renderPanel()

    expect(
      screen.getByText('Aucune reformulation — les sections reprennent le texte du CV source tel quel.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Sections dans l’ordre fixe du CV source, jamais réordonnées.')).toBeInTheDocument()
    expect(screen.getByText('Aucune expérience ajoutée — composé uniquement depuis le CV source.')).toBeInTheDocument()
  })

  // #2187.38 — une compétence retenue qui recoupe le besoin ciblé se voit,
  // distinctement des autres compétences retenues.
  it('met en avant les compétences retenues qui recoupent le besoin ciblé', () => {
    versionsQuery.mockReturnValue({ data: [{ ...BASE_VERSION, highlightedSkills: ['Kubernetes'] }] })
    generateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    validateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })

    renderPanel()

    expect(screen.getByText('Compétences mises en avant')).toBeInTheDocument()
    expect(screen.getByText('Kubernetes')).toBeInTheDocument()
  })

  it('sait dire NON : aucune section « mises en avant » sans compétence à mettre en avant', () => {
    versionsQuery.mockReturnValue({ data: [{ ...BASE_VERSION, highlightedSkills: [] }] })
    generateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    validateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })

    renderPanel()

    expect(screen.queryByText('Compétences mises en avant')).not.toBeInTheDocument()
  })
})

/**
 * #2187.42 (épopée #2943) — les actions « Comparer » et « Modifier ».
 */
describe('CvStudioPanel — Comparer et Modifier', () => {
  const OTHER_VERSION: CvVersion = {
    ...BASE_VERSION,
    id: 'v0000000-0000-4000-8000-000000000002',
    status: 'validated',
  }

  it('compare DEUX versions sélectionnées et affiche le diff des sections', () => {
    versionsQuery.mockReturnValue({ data: [BASE_VERSION, OTHER_VERSION] })
    generateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    validateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    const mutateAsync = vi.fn().mockResolvedValue(undefined)
    compareMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      data: {
        sections: [{ title: 'Profil', before: 'Ingénieur plateforme', after: 'Ingénieur plateforme senior' }],
        excludedSkillsAdded: [],
        excludedSkillsRemoved: [],
        highlightedSkillsAdded: [],
        highlightedSkillsRemoved: [],
      },
    })

    renderPanel()

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0]!)
    fireEvent.click(checkboxes[1]!)
    fireEvent.click(screen.getByRole('button', { name: /Comparer/ }))

    expect(mutateAsync).toHaveBeenCalledWith({ a: BASE_VERSION.id, b: OTHER_VERSION.id })
    expect(screen.getByText('Ingénieur plateforme senior')).toBeInTheDocument()
  })

  it('permet de MODIFIER une version pas encore validée, jamais une version validée', () => {
    versionsQuery.mockReturnValue({ data: [BASE_VERSION, OTHER_VERSION] })
    generateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    validateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    const mutateAsync = vi.fn().mockResolvedValue({ ...BASE_VERSION })
    updateSectionsMutation.mockReturnValue({ mutateAsync, isPending: false })

    renderPanel()

    const editButtons = screen.getAllByRole('button', { name: /Modifier/ })
    // BASE_VERSION est en attente → modifiable ; OTHER_VERSION est validée → pas de bouton.
    expect(editButtons).toHaveLength(1)

    fireEvent.click(editButtons[0]!)
    const textarea = screen.getByDisplayValue('Ingénieur plateforme')
    fireEvent.change(textarea, { target: { value: 'Ingénieur plateforme senior' } })
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }))

    expect(mutateAsync).toHaveBeenCalledWith({
      versionId: BASE_VERSION.id,
      sections: [{ title: 'Profil', body: 'Ingénieur plateforme senior' }],
    })
  })
})

/**
 * #2187.25-27 (épopée #2943) — trois sources de génération. Le studio ne
 * propose que ce qui se vérifie : une mission DÉJÀ FAITE par CE consultant
 * (déjà lue par la fiche), un appel d'offres de l'espace.
 */
describe('CvStudioPanel — sources de génération', () => {
  it('compose depuis une OPPORTUNITÉ choisie dans le même picker que « Ajouter à un besoin »', async () => {
    opportunitiesForMatchQuery.mockReturnValue({
      data: [{ id: 'o0000000-0000-4000-8000-000000000001', label: 'Refonte SI paiement — Orange' }],
    })
    versionsQuery.mockReturnValue({ data: [] })
    const mutateAsync = vi.fn().mockResolvedValue(BASE_VERSION)
    generateMutation.mockReturnValue({ mutateAsync, isPending: false })
    validateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })

    renderPanel()

    await chooseOption(getSelect('Source'), /Refonte SI paiement — Orange/)
    fireEvent.click(screen.getByRole('button', { name: 'Composer' }))

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ opportunityId: 'o0000000-0000-4000-8000-000000000001' }),
    )
  })

  it('compose depuis une MISSION COMPARABLE choisie dans les missions du consultant', async () => {
    talentMissionsQuery.mockReturnValue({
      data: [
        {
          missionId: 'm0000000-0000-4000-8000-000000000001',
          label: 'Refonte SI paiement',
          accountName: 'Orange',
          status: 'completed',
          startsOn: '2024-01-01',
          endsOn: '2024-06-01',
          loadPercent: 100,
        },
      ],
    })
    versionsQuery.mockReturnValue({ data: [] })
    const mutateAsync = vi.fn().mockResolvedValue(BASE_VERSION)
    generateMutation.mockReturnValue({ mutateAsync, isPending: false })
    validateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })

    renderPanel()

    await chooseOption(getSelect('Source'), /Refonte SI paiement/)
    fireEvent.click(screen.getByRole('button', { name: 'Composer' }))

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ comparableMissionId: 'm0000000-0000-4000-8000-000000000001' }),
    )
  })

  it('nomme la source d’une version — opportunité, appel d’offres, mission comparable, ou besoin', () => {
    versionsQuery.mockReturnValue({
      data: [
        { ...BASE_VERSION, id: 'v1', rfpId: 'r0000000-0000-4000-8000-000000000001' },
        { ...BASE_VERSION, id: 'v2', comparableMissionId: 'm0000000-0000-4000-8000-000000000001' },
        { ...BASE_VERSION, id: 'v3', needId: 'n0000000-0000-4000-8000-000000000001' },
        { ...BASE_VERSION, id: 'v4', opportunityId: 'o0000000-0000-4000-8000-000000000001' },
      ],
    })
    generateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    validateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })

    renderPanel()

    expect(screen.getByText('Appel d’offres')).toBeInTheDocument()
    expect(screen.getByText('Mission comparable')).toBeInTheDocument()
    expect(screen.getByText('Besoin')).toBeInTheDocument()
    expect(screen.getByText('Opportunité')).toBeInTheDocument()
  })
})

describe('CvStudioPanel — auteur nominatif (#2939, #2187.31)', () => {
  it('affiche le nom du membre qui a composé la version, résolu depuis les membres de l’espace', () => {
    versionsQuery.mockReturnValue({
      data: [{ ...BASE_VERSION, generatedBy: 'u0000000-0000-4000-8000-000000000001' }],
    })
    generateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    validateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    workspaceMembersQuery.mockReturnValue({
      data: [
        {
          userId: 'u0000000-0000-4000-8000-000000000001',
          email: 'jane@bellum.ai',
          fullName: 'Jane Dupont',
          role: 'member',
          isSelf: false,
        },
      ],
    })

    renderPanel()

    expect(screen.getByText('par Jane Dupont')).toBeInTheDocument()
  })

  it('n’affiche rien quand l’auteur est inconnu — on n’affiche pas ce qu’on n’a pas', () => {
    versionsQuery.mockReturnValue({ data: [{ ...BASE_VERSION, generatedBy: null }] })
    generateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    validateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    workspaceMembersQuery.mockReturnValue({ data: [] })

    renderPanel()

    expect(screen.queryByText(/^par /)).not.toBeInTheDocument()
  })
})
