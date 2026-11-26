import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Submission } from '@bellum/contracts'

const useSubmission = vi.fn()
vi.mock('../api', () => ({
  useSubmission: () => useSubmission(),
  useSubmissionTimeline: () => ({ data: [], isLoading: false, isError: false }),
}))
vi.mock('@/features/projects/open-needs/hooks/useOpenNeeds', () => ({
  useOpenNeeds: () => ({ data: { data: [{ id: 'need-1', target_tjm_cents: 70000 }] } }),
}))
vi.mock('@/features/proposals/view/ProposalPlanBlock', () => ({
  ProposalPlanBlock: ({ projectId }: { projectId: string }) => <div>plan:{projectId}</div>,
}))
vi.mock('./PresentationUpdateDialog', () => ({ PresentationUpdateDialog: () => null }))
vi.mock('./ConsignInterviewDialog', () => ({ ConsignInterviewDialog: () => null }))
vi.mock('./SubmissionDetailsDialog', () => ({ SubmissionDetailsDialog: () => null }))
vi.mock('./InterviewBriefDialog', () => ({ InterviewBriefDialog: () => null }))
vi.mock('./NextActionDialog', () => ({ NextActionDialog: () => null }))
vi.mock('./SubmissionTimelineDialog', () => ({ SubmissionTimelineDialog: () => null }))
vi.mock('./SubmissionFeedbackDialog', () => ({ SubmissionFeedbackDialog: () => null }))
vi.mock('./SubmissionConsultantFeedbackDialog', () => ({ SubmissionConsultantFeedbackDialog: () => null }))

// La coque rend le titre, la phrase et les actions d'en-tête (COQUE.md §2) : le faux
// les rend aussi, dans un en-tête distinct du corps, pour qu'on puisse dire OÙ ils vivent.
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({
    children,
    pageTitle,
    pageSubtitle,
    headerActions,
  }: {
    children: React.ReactNode
    pageTitle?: string
    pageSubtitle?: string
    headerActions?: React.ReactNode
  }) => (
    <div>
      <div data-testid="page-header">
        <h1>{pageTitle}</h1>
        {pageSubtitle ? <p>{pageSubtitle}</p> : null}
        {headerActions}
      </div>
      <div data-testid="page-body">{children}</div>
    </div>
  ),
}))

// Même faux que `MissionDossierPage.test.tsx` : il REND ce que le vrai
// rendrait (l'adresse, les attributs), un faux qui les jette teste le mock.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => {
    const href = Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  },
}))

const { SubmissionDossierPage } = await import('./SubmissionDossierPage')

function submission(over: Partial<Submission> = {}): Submission {
  return {
    id: 'sub-1',
    projectId: 'op-1',
    projectLabel: 'Refonte du SI paiement',
    accountId: 'acc-1',
    accountName: 'ACME',
    needId: null,
    needRole: 'Lead dev',
    consultantId: 'c-1',
    consultantName: 'Awa Diop',
    stage: 'submitted',
    substatus: null,
    stageEnteredAt: '2026-09-01T00:00:00.000Z',
    submittedAt: '2026-09-02T00:00:00.000Z',
    firstFeedbackAt: null,
    closedAt: null,
    outcomeReason: null,
    outcomeDetail: null,
    proposedRateCents: null,
    cvSnapshot: null,
    plannedDays: null,
    dailyCostCents: null,
    plannedMarginCents: null,
    ownerId: null,
    ownerName: null,
    recipientContactId: null,
    recipientContactName: null,
    channel: null,
    message: null,
    availability: null,
    conditions: null,
    consultantAgreement: null,
    consultantAgreementDate: null,
    nextActionLabel: null,
    nextActionDueAt: null,
    nextActionOwnerId: null,
    nextActionOwnerName: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  }
}

beforeEach(() => {
  useSubmission.mockReset()
})

afterEach(() => {
  cleanup()
})

/**
 * #2953 (#2193.48) — LE DOSSIER D'UN POSITIONNEMENT. Route de destination qui
 * manquait à tout lien vers un `submission_id` (mission, pré-analyse #2973).
 */
describe('SubmissionDossierPage', () => {
  it('affiche le consultant, le besoin et l’étape — jamais un UUID nu', () => {
    useSubmission.mockReturnValue({ data: submission(), isPending: false, isError: false, refetch: vi.fn() })
    render(<SubmissionDossierPage submissionId="sub-1" />)

    expect(screen.getByRole('heading', { name: 'Awa Diop' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Refonte du SI paiement' })).toHaveAttribute('href', '/projects/op-1')
    expect(screen.getAllByText(/Lead dev/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Présenté').length).toBeGreaterThan(0)
    expect(screen.queryByText('sub-1')).not.toBeInTheDocument()
  })

  it('grammaire Théo : titre et « Mettre à jour » dans l’en-tête de la coque, puis faits, gestes, affaire, historique', () => {
    useSubmission.mockReturnValue({ data: submission(), isPending: false, isError: false, refetch: vi.fn() })
    render(<SubmissionDossierPage submissionId="sub-1" />)
    const header = screen.getByTestId('page-header')
    const body = screen.getByTestId('page-body')
    expect(within(header).getByRole('heading', { level: 1, name: 'Awa Diop' })).toBeInTheDocument()
    expect(within(header).getByRole('button')).toBeInTheDocument()
    expect(body.querySelector('h1')).toBeNull()
    const order = ['presentation-where', 'presentation-actions', 'presentation-deal'].map(id => screen.getByTestId(id))
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    // L'étape se dit UNE fois (GA-26), en pastille teintée dans les faits.
    expect(within(body).getAllByText('Étape')).toHaveLength(1)
    expect(within(screen.getByTestId('presentation-where')).getByText('Présenté').className).toMatch(/soft/)
  })

  it('dit qu’il charge, jamais une fiche vide', () => {
    useSubmission.mockReturnValue({ data: undefined, isPending: true, isError: false, refetch: vi.fn() })
    render(<SubmissionDossierPage submissionId="sub-1" />)

    expect(screen.getByText('Chargement du positionnement…')).toBeInTheDocument()
    expect(within(screen.getByTestId('page-body')).getByRole('status')).toBeInTheDocument()
  })

  it('propose de réessayer — la lecture a échoué, le positionnement est toujours là', () => {
    useSubmission.mockReturnValue({ data: undefined, isPending: false, isError: true, refetch: vi.fn() })
    render(<SubmissionDossierPage submissionId="sub-1" />)

    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
  })

  it('Théo C — porte la proposition commerciale de l’affaire sous la présentation (Studio fondu)', () => {
    useSubmission.mockReturnValue({ data: submission(), isPending: false, isError: false, refetch: vi.fn() })
    render(<SubmissionDossierPage submissionId="sub-1" />)

    expect(screen.getByText('plan:op-1')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Toutes les présentations/ })).toHaveAttribute(
      'href',
      '/projects/presentations',
    )
  })

  it('« Où en est cette présentation ? » — trace déclarative, accord, version et écart de tarif', () => {
    useSubmission.mockReturnValue({
      data: submission({
        needId: 'need-1',
        ownerName: 'Théo',
        channel: 'email',
        proposedRateCents: 72000,
        consultantAgreement: true,
        consultantAgreementDate: '2026-10-15',
      }),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<SubmissionDossierPage submissionId="sub-1" />)

    expect(screen.getByText('Où en est cette présentation ?')).toBeInTheDocument()
    // D-4 : un geste déclaratif, jamais présenté comme une preuve d'envoi.
    expect(screen.getByText(/Geste déclaratif, pas une preuve d’envoi/)).toBeInTheDocument()
    expect(screen.getByText(/Vérifié le/)).toBeInTheDocument()
    expect(screen.getByText('À préparer')).toBeInTheDocument()
    expect(screen.getByText(/Cible client 700 €/)).toBeInTheDocument()
    expect(screen.getByText(/écart \+20 €/)).toBeInTheDocument()
  })

  it('une absence reste une absence : accord « À obtenir », tarif non chiffré, jamais 0', () => {
    useSubmission.mockReturnValue({ data: submission(), isPending: false, isError: false, refetch: vi.fn() })
    render(<SubmissionDossierPage submissionId="sub-1" />)

    expect(screen.getByText('À obtenir')).toBeInTheDocument()
    expect(screen.getByText('TJM non chiffré')).toBeInTheDocument()
  })

  it('retenue : le bandeau mène à la même création de mission que la fiche affaire', () => {
    useSubmission.mockReturnValue({
      data: submission({ stage: 'accepted', substatus: 'selected' }),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<SubmissionDossierPage submissionId="sub-1" />)

    expect(screen.getByRole('link', { name: 'Préparer la mission' })).toHaveAttribute('href', '/missions/nouvelle')
  })

  it('« Préparer l’entretien » n’apparaît qu’à l’étape Entretien client', () => {
    useSubmission.mockReturnValue({ data: submission(), isPending: false, isError: false, refetch: vi.fn() })
    const { unmount } = render(<SubmissionDossierPage submissionId="sub-1" />)
    expect(screen.queryByRole('button', { name: 'Préparer l’entretien' })).toBeNull()
    unmount()

    useSubmission.mockReturnValue({
      data: submission({ stage: 'interview', substatus: 'interview_scheduled' }),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<SubmissionDossierPage submissionId="sub-1" />)
    expect(screen.getByRole('button', { name: 'Préparer l’entretien' })).toBeInTheDocument()
  })
})
