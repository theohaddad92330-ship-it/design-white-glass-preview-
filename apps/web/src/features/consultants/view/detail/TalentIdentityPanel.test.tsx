import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TalentDuplicatePreview, TalentDuplicatesReport } from '@bellum/contracts'
import { TalentIdentityPanel } from './TalentIdentityPanel'
import {
  useDecideTalentIdentity,
  useTalentIdentity,
  useTalentIdentityPreview,
  useUndoTalentIdentity,
} from '../../talent-api'

vi.mock('../../talent-api', () => ({
  useTalentIdentity: vi.fn(),
  useTalentIdentityPreview: vi.fn(),
  useDecideTalentIdentity: vi.fn(),
  useUndoTalentIdentity: vi.fn(),
}))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({
    data: [{ userId: 'u2', email: 'camille@example.fr', fullName: 'Camille Martin', role: 'member', isSelf: false }],
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const TALENT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

const MATCH = {
  talentId: OTHER,
  fullName: 'Yanis Berthier',
  reason: 'same_email' as const,
  confidence: 0.95,
  signals: ['email' as const, 'experiences' as const],
  sharedExperiences: 3,
  conflicts: [],
}

function mockReport(report: TalentDuplicatesReport | undefined, extra: { isError?: boolean } = {}) {
  vi.mocked(useTalentIdentity).mockReturnValue({
    data: report,
    isLoading: false,
    isError: extra.isError ?? false,
  } as unknown as ReturnType<typeof useTalentIdentity>)
}

function mockPreview(preview: TalentDuplicatePreview | undefined) {
  vi.mocked(useTalentIdentityPreview).mockReturnValue({
    data: preview,
    isLoading: false,
  } as unknown as ReturnType<typeof useTalentIdentityPreview>)
}

function mockMutations() {
  const decide = vi.fn()
  const undo = vi.fn()
  vi.mocked(useDecideTalentIdentity).mockReturnValue({ mutate: decide, isPending: false } as unknown as ReturnType<
    typeof useDecideTalentIdentity
  >)
  vi.mocked(useUndoTalentIdentity).mockReturnValue({ mutate: undo, isPending: false } as unknown as ReturnType<
    typeof useUndoTalentIdentity
  >)
  return { decide, undo }
}

const PREVIEW: TalentDuplicatePreview = {
  a: {
    id: TALENT,
    fullName: 'Yanis Berthier',
    email: 'yanis@example.fr',
    phone: null,
    publicProfileUrl: null,
    title: 'Architecte',
    location: 'Lyon',
    reviewStatus: 'qualified',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  b: {
    id: OTHER,
    fullName: 'Yanis Berthier',
    email: 'yanis@example.fr',
    phone: '0600000001',
    publicProfileUrl: null,
    title: 'Développeur',
    location: null,
    reviewStatus: 'needs_review',
    createdAt: '2026-09-10T00:00:00.000Z',
  },
  match: MATCH,
  fields: { identical: ['fullName', 'email'], different: ['title'], oneSided: ['phone', 'location'] },
  documents: {
    a: [],
    b: [
      {
        id: 'd1',
        kind: 'cv',
        filename: 'cv-yanis-2026.pdf',
        mimeType: null,
        sizeBytes: 10,
        extractedChars: 1200,
        uploadedAt: '2026-09-10T00:00:00.000Z',
        uploadedByName: 'Louis',
        hasOriginal: false,
      },
    ],
  },
  history: {
    a: [
      {
        field: 'title',
        oldValue: 'Dev',
        newValue: 'Architecte',
        source: 'human',
        actorName: 'Louis',
        at: '2026-09-05T10:00:00.000Z',
        rule: 'talent_form',
      },
    ],
    b: [],
  },
  consequences: { documentsCopiedOnUpdate: 1, fieldsOverwritten: 0, mergeAvailable: false },
  decisions: [],
}

/**
 * #2327 — l'onglet Identité d'une fiche talent.
 *
 * Ce que ces tests protègent : l'écran PROPOSE et explique, un humain décide,
 * et le mot « fusionner » n'y apparaît jamais comme un geste
 * (`c37_fusion_doublons`).
 */
describe('TalentIdentityPanel', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    mockPreview(undefined)
  })

  it('dit qu’aucune fiche ne ressemble — un vide qui se lit', () => {
    mockMutations()
    mockReport({ state: 'new', items: [] })
    render(<TalentIdentityPanel talentId={TALENT} />)
    expect(screen.getByText('Aucune autre fiche du vivier ne ressemble à celle-ci.')).toBeInTheDocument()
  })

  it('nomme l’erreur plutôt que de montrer un vide', () => {
    mockMutations()
    mockReport(undefined, { isError: true })
    render(<TalentIdentityPanel talentId={TALENT} />)
    expect(screen.getByText(/Impossible de comparer cette fiche/)).toBeInTheDocument()
  })

  it('#2327.26 — explique le rapprochement avec la phrase du chapitre, sans probabilité', () => {
    mockMutations()
    mockReport({ state: 'resolved', items: [{ ...MATCH, decision: null }] })
    render(<TalentIdentityPanel talentId={TALENT} />)
    expect(screen.getByText('Yanis Berthier')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Ces deux fiches semblent appartenir à la même personne parce qu’elles partagent le même e-mail et trois expériences identiques.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/même personne identifiée/)).toBeInTheDocument()
    // Aucun pourcentage : la confiance n'est jamais affichée comme une chance.
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
    expect(screen.queryByText(/0[.,]95/)).not.toBeInTheDocument()
  })

  it('#2327.19 — compare les deux fiches : champs, documents, historique avec sa règle, conséquences', () => {
    mockMutations()
    mockReport({ state: 'resolved', items: [{ ...MATCH, decision: null }] })
    mockPreview(PREVIEW)
    render(<TalentIdentityPanel talentId={TALENT} />)
    fireEvent.click(screen.getByRole('button', { name: 'Comparer les deux fiches' }))

    expect(vi.mocked(useTalentIdentityPreview)).toHaveBeenLastCalledWith(TALENT, OTHER)
    expect(screen.getAllByText('identique')).toHaveLength(2)
    expect(screen.getByText('différent')).toBeInTheDocument()
    expect(screen.getByText('cv-yanis-2026.pdf')).toBeInTheDocument()
    expect(screen.getByText(/règle : talent_form/)).toBeInTheDocument()
    expect(screen.getByText(/1 document\(s\) de l’autre fiche sont copiés ici/)).toBeInTheDocument()
    // NO-GO : la fusion n'est jamais un bouton, elle est dite indisponible.
    expect(screen.getByText(/on ne fusionne jamais/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /fusion/i })).not.toBeInTheDocument()
  })

  it('#2327.20 — « pas la même personne » est un clic, jamais un défaut', () => {
    const { decide } = mockMutations()
    mockReport({ state: 'resolved', items: [{ ...MATCH, decision: null }] })
    mockPreview(PREVIEW)
    render(<TalentIdentityPanel talentId={TALENT} />)
    expect(decide).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Comparer les deux fiches' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ce n’est pas la même personne' }))
    expect(decide).toHaveBeenCalledWith({ otherTalentId: OTHER, action: 'keep_separate', assigneeId: null })

    fireEvent.click(screen.getByRole('button', { name: 'Copier ses documents ici' }))
    expect(decide).toHaveBeenLastCalledWith({ otherTalentId: OTHER, action: 'update_existing', assigneeId: null })
  })

  it('« confier » demande d’abord à qui', () => {
    mockMutations()
    mockReport({ state: 'resolved', items: [{ ...MATCH, decision: null }] })
    mockPreview(PREVIEW)
    render(<TalentIdentityPanel talentId={TALENT} />)
    fireEvent.click(screen.getByRole('button', { name: 'Comparer les deux fiches' }))
    expect(screen.getByRole('button', { name: 'Confier la vérification' })).toBeDisabled()
  })

  it('#2327.25 — une décision en cours se montre et s’annule', () => {
    const { undo } = mockMutations()
    mockReport({
      state: 'resolved',
      items: [
        {
          ...MATCH,
          decision: {
            id: 'dec-1',
            talentId: TALENT,
            otherTalentId: OTHER,
            action: 'assign_to_recruiter',
            state: 'resolved',
            reason: 'same_email',
            assigneeId: 'u2',
            assigneeName: 'Camille Martin',
            decidedByName: 'Louis',
            decidedAt: '2026-09-15T10:00:00.000Z',
            undoneAt: null,
          },
        },
      ],
    })
    render(<TalentIdentityPanel talentId={TALENT} />)
    expect(screen.getByText('Confiée à Camille Martin')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler cette décision' }))
    expect(undo).toHaveBeenCalledWith('dec-1')
  })
})
