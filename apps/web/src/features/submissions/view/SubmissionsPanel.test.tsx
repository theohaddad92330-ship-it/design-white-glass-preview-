import type { Submission, SubmissionFunnel } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SubmissionsPanel } from './SubmissionsPanel'

const submissions = vi.fn()
const advance = vi.fn()
const advanceSubstatus = vi.fn()

const recordFeedback = vi.fn()
const recordConsultantFeedback = vi.fn()

vi.mock('../api', () => ({
  useSubmissions: () => submissions(),
  useAdvanceSubmission: () => ({ mutate: advance, isPending: false }),
  // #2177.11 / .12 / .13 / .15 / .21 — avancer le sous-statut, sans étape.
  useAdvanceSubstatus: () => ({ mutate: advanceSubstatus, isPending: false }),
  useSubmissionFeedback: () => ({ data: [] }),
  useRecordFeedback: () => ({ mutate: recordFeedback, isPending: false }),
  // #2335.5 — le retour consultant a ses propres hooks, mockés séparément.
  useSubmissionConsultantFeedback: () => ({ data: [] }),
  useRecordConsultantFeedback: () => ({ mutate: recordConsultantFeedback, isPending: false }),
  useScheduleInterview: () => ({ mutate: vi.fn(), isPending: false }),
  // #2335.3 — le dialogue Historique est toujours monté (juste fermé) ;
  // son hook doit répondre même quand aucun test ne l'ouvre.
  useSubmissionTimeline: () => ({ data: undefined, isLoading: false }),
  // #2177.6 / .8 / .24 / .25 / .28 / .30 — le dialogue Détails est lui aussi
  // toujours monté (juste fermé) ; mêmes gardes que ci-dessus.
  useRecordSubmissionDetails: () => ({ mutate: vi.fn(), isPending: false }),
  useSubmissionRecipientContacts: () => ({ data: [], isLoading: false }),
  // #2189.10-.16 (épopée #2940) — l'aperçu, toujours monté dans le dialogue Détails.
  useSubmissionPreview: () => ({ data: undefined }),
  // #2189.23-.30 — le brief d'entretien lit l'entretien planifié, toujours monté.
  useSubmissionInterviews: () => ({ data: [] }),
  // #2875/#3398 — la trace de première consultation du brief, toujours montée.
  useMarkInterviewBriefViewed: () => ({ mutate: vi.fn(), isPending: false }),
  // #2189.39 — la prochaine action, toujours monté (juste fermé).
  useRecordSubmissionNextAction: () => ({ mutate: vi.fn(), isPending: false }),
}))

function submission(over: Partial<Submission> = {}): Submission {
  return {
    id: 'sub-1',
    projectId: 'proj-1',
    projectLabel: 'Renfort plateforme',
    accountId: 'acc-1',
    accountName: 'ACME',
    needId: null,
    needRole: null,
    consultantId: 'c-1',
    consultantName: 'Marie Dupont',
    stage: 'submitted',
    // #2335.1 — champ requis par le contrat depuis l'ajout du sous-statut.
    substatus: null,
    stageEnteredAt: '2026-08-01T09:00:00.000Z',
    submittedAt: '2026-08-01T09:00:00.000Z',
    firstFeedbackAt: null,
    closedAt: null,
    outcomeReason: null,
    outcomeDetail: null,
    proposedRateCents: 65000,
    cvSnapshot: null,
    plannedDays: null,
    dailyCostCents: null,
    plannedMarginCents: null,
    ownerId: null,
    ownerName: null,
    // #2177.6 / .8 / .24 / .25 / .28 / .30 — champs requis depuis l'ajout du détail.
    recipientContactId: null,
    recipientContactName: null,
    channel: null,
    message: null,
    availability: null,
    conditions: null,
    consultantAgreement: null,
    consultantAgreementDate: null,
    // #2189.39 (épopée #2940) — champs requis depuis l'ajout de la prochaine action.
    nextActionLabel: null,
    nextActionDueAt: null,
    nextActionOwnerId: null,
    nextActionOwnerName: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
    ...over,
  }
}

function funnel(over: Partial<SubmissionFunnel> = {}): SubmissionFunnel {
  return {
    byStage: {} as SubmissionFunnel['byStage'],
    submitted: 1,
    accepted: 0,
    rejected: 0,
    noFeedback: 0,
    acceptanceRate: null,
    medianDaysToFeedback: null,
    ...over,
  }
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SubmissionsPanel projectId="proj-1" />
    </QueryClientProvider>,
  )
}

describe('SubmissionsPanel', () => {
  beforeEach(() => {
    submissions.mockReset()
    advance.mockReset()
    advanceSubstatus.mockReset()
  })

  it('affiche le profil et son étape', () => {
    submissions.mockReturnValue({ data: { items: [submission()], funnel: funnel() }, isLoading: false, isError: false })
    renderPanel()
    expect(screen.getByText('Marie Dupont')).toBeInTheDocument()
    expect(screen.getByText('CV envoyé')).toBeInTheDocument()
  })

  it('dit « pas encore mesurable » plutôt que « 0 % »', () => {
    // Trois profils envoyés ce mois-ci ne doivent pas se lire « 0 % de succès ».
    submissions.mockReturnValue({
      data: { items: [submission()], funnel: funnel({ acceptanceRate: null }) },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText('Taux pas encore mesurable')).toBeInTheDocument()
    expect(screen.queryByText(/0 %/)).not.toBeInTheDocument()
  })

  it('ne montre AUCUN délai médian tant que le plancher n’est pas atteint', () => {
    // Le contrat rend `null` sous cinq retours. L'écran ne doit pas inventer un
    // « 0 jour » ni un « — » qui se lirait « réponse immédiate ».
    submissions.mockReturnValue({
      data: { items: [submission()], funnel: funnel({ medianDaysToFeedback: null }) },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText('Délai de retour pas encore mesurable')).toBeInTheDocument()
    expect(screen.queryByText(/jours? de délai/)).not.toBeInTheDocument()
  })

  it('affiche le délai médian quand il est mesurable', () => {
    // Le chiffre EXISTE dans la réponse depuis toujours et n'atteignait aucun
    // écran : la borne posée le 26/08 ne protégeait donc rien.
    submissions.mockReturnValue({
      data: { items: [submission()], funnel: funnel({ medianDaysToFeedback: 12 }) },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText('12 jours de délai de retour, en médiane')).toBeInTheDocument()
  })

  it('compte les « sans retour » à part', () => {
    submissions.mockReturnValue({
      data: { items: [submission()], funnel: funnel({ noFeedback: 3 }) },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText('3 restés sans retour')).toBeInTheDocument()
  })

  it('n’affiche QUE les transitions autorisées depuis l’étape courante', () => {
    // Proposer les autres ferait cliquer sur un refus.
    submissions.mockReturnValue({
      data: { items: [submission({ stage: 'rejected', outcomeReason: 'price' })], funnel: funnel() },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.queryByText('Envoyer le CV')).not.toBeInTheDocument()
    expect(screen.getByText('Prix')).toBeInTheDocument()
  })

  it('n’affiche PAS « 0 € » sur un profil non chiffré', () => {
    submissions.mockReturnValue({
      data: { items: [submission({ proposedRateCents: null })], funnel: funnel() },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText('TJM non chiffré')).toBeInTheDocument()
  })

  it('ne rend PAS un échec de lecture comme une liste vide', () => {
    submissions.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderPanel()
    expect(screen.getByText(/la lecture qui a échoué/)).toBeInTheDocument()
    expect(screen.queryByText('Aucun profil positionné sur ce projet.')).not.toBeInTheDocument()
  })

  // #2335.1 — la fiche affiche son sous-statut courant, en plus de l'étape.
  // `selected` (« Retenu ») ne collisionne avec AUCUN libellé d'action visible
  // sur un profil à l'étape « CV envoyé » (Entretien programmé/Accepté/Refusé/Retirer).
  it('affiche le sous-statut courant quand il est déclaré', () => {
    submissions.mockReturnValue({
      data: { items: [submission({ substatus: 'selected' })], funnel: funnel() },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText('Retenu')).toBeInTheDocument()
  })

  it('n’affiche AUCUN sous-statut tant qu’il n’a jamais été déclaré', () => {
    submissions.mockReturnValue({
      data: { items: [submission({ substatus: null })], funnel: funnel() },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    // Seule l'étape reste visible — rien n'est deviné à la place du sous-statut.
    expect(screen.getByText('CV envoyé')).toBeInTheDocument()
    expect(screen.queryByText('Retenu')).not.toBeInTheDocument()
  })

  // #2335.3 — la timeline est accessible depuis chaque fiche, quelle que soit l'étape.
  it('propose l’historique de chaque étape depuis la fiche', () => {
    submissions.mockReturnValue({
      data: { items: [submission({ stage: 'shortlisted' })], funnel: funnel() },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByRole('button', { name: /historique/i })).toBeInTheDocument()
  })

  it('dit « aucun profil » quand il n’y en a vraiment aucun', () => {
    submissions.mockReturnValue({
      data: { items: [], funnel: funnel({ submitted: 0 }) },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText('Aucun profil positionné sur ce projet.')).toBeInTheDocument()
  })
})

// #2177.11 / .12 / .13 / .15 / .21 — les seize sous-statuts existaient déjà
// (#2335.1), affichés en badge, mais rien ne les faisait avancer manuellement.
describe('#2177.11 / .12 / .13 / .15 / .21 — avancer le sous-statut', () => {
  it('propose la cible atteignable depuis « à qualifier »', () => {
    submissions.mockReturnValue({
      data: { items: [submission({ stage: 'shortlisted', substatus: 'to_qualify' })], funnel: funnel() },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    fireEvent.click(screen.getByText('Accord consultant en attente'))
    expect(advanceSubstatus).toHaveBeenCalledWith({ id: 'sub-1', substatus: 'consultant_agreement_pending' })
  })

  it('propose la cible atteignable depuis « présenté »', () => {
    submissions.mockReturnValue({
      data: { items: [submission({ stage: 'submitted', substatus: 'presented' })], funnel: funnel() },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByText('Accusé réception')).toBeInTheDocument()
  })

  it('ne propose AUCUNE cible qui retomberait sur une autre étape', () => {
    // `to_validate` (shortlisted) → `presented` (submitted) est un ordre valide
    // dans la machine des sous-statuts, mais ferait mentir le badge d'étape.
    submissions.mockReturnValue({
      data: { items: [submission({ stage: 'shortlisted', substatus: 'to_validate' })], funnel: funnel() },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.queryByText('Présenté')).not.toBeInTheDocument()
  })

  it('ne propose AUCUNE cible tant qu’aucun sous-statut n’a été déclaré', () => {
    submissions.mockReturnValue({
      data: { items: [submission({ stage: 'submitted', substatus: null })], funnel: funnel() },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.queryByText('Accusé réception')).not.toBeInTheDocument()
  })
})

describe('retour du client — les hooks qui n’avaient aucun appelant', () => {
  it('propose de noter le retour dès que le profil a été présenté', () => {
    submissions.mockReturnValue({
      data: { items: [submission({ stage: 'submitted' })] },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByRole('button', { name: /retour client/i })).toBeInTheDocument()
  })

  it('ne le propose PAS tant que le profil est seulement en shortlist', () => {
    // Noter un retour avant la présentation ferait consigner un échange qui n'a
    // pas eu lieu.
    submissions.mockReturnValue({
      data: { items: [submission({ stage: 'shortlisted' })] },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.queryByRole('button', { name: /retour client/i })).not.toBeInTheDocument()
  })
})

describe('#2173.41 — planifier un entretien, depuis la ligne', () => {
  it('propose de planifier un entretien dès que le profil a été présenté', () => {
    submissions.mockReturnValue({
      data: { items: [submission({ stage: 'submitted' })] },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.getByRole('button', { name: /planifier un entretien/i })).toBeInTheDocument()
  })

  it('ne le propose PAS tant que le profil est seulement en shortlist', () => {
    submissions.mockReturnValue({
      data: { items: [submission({ stage: 'shortlisted' })] },
      isLoading: false,
      isError: false,
    })
    renderPanel()
    expect(screen.queryByRole('button', { name: /planifier un entretien/i })).not.toBeInTheDocument()
  })
})
