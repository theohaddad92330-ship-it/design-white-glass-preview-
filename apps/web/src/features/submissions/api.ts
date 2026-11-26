import type {
  AdvanceSubmissionInput,
  AdvanceSubstatusInput,
  CreateSubmissionInput,
  Interview,
  RecordConsultantFeedbackInput,
  RecordFeedbackInput,
  RecordSubmissionDetailsInput,
  RecordSubmissionNextActionInput,
  ScheduleInterviewInput,
  Submission,
  SubmissionConsultantFeedback,
  SubmissionFeedback,
  SubmissionFunnel,
  SubmissionPreview,
  SubmissionTimelineEvent,
} from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
// #2177.6 — même clé, même appel que `useAccountContacts` (mission-panel) :
// jamais recopiés, un second endroit qui construirait la même clé diverge le
// jour où l'un des deux change de forme.
import { contactKeys, contactsApi } from '@/features/contacts/api'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'

type SubmissionList = { items: Submission[]; funnel: SubmissionFunnel }

export const submissionKeys = {
  list: (projectId?: string, consultantId?: string) =>
    ['submissions', projectId ?? 'all', consultantId ?? 'all'] as const,
  interviews: (id: string) => ['submissions', id, 'interviews'] as const,
  feedback: (id: string) => ['submissions', id, 'feedback'] as const,
  // #2335.5 — clé SÉPARÉE de `feedback` ci-dessus : le retour consultant ne
  // partage aucun cache avec le retour client.
  consultantFeedback: (id: string) => ['submissions', id, 'consultant-feedback'] as const,
  // #2335.3 — chaque étape avec sa date, pour UN positionnement.
  timeline: (id: string) => ['submissions', id, 'timeline'] as const,
  // #2953 (#2193.48) — LE dossier d'un positionnement, la page qui manquait.
  detail: (id: string) => ['submissions', id, 'detail'] as const,
}

export const submissionsApi = {
  list(filters: { projectId?: string; consultantId?: string } = {}): Promise<SubmissionList> {
    const params = new URLSearchParams()
    if (filters.projectId) params.set('projectId', filters.projectId)
    if (filters.consultantId) params.set('consultantId', filters.consultantId)
    const query = params.toString()
    return apiFetch<SubmissionList>({ path: query ? `/submissions?${query}` : '/submissions' })
  },
  get(id: string): Promise<Submission> {
    return apiFetch<Submission>({ path: `/submissions/${id}` })
  },
  create(input: CreateSubmissionInput): Promise<Submission> {
    return apiFetch<Submission, CreateSubmissionInput>({ path: '/submissions', method: 'POST', body: input })
  },
  advance(id: string, input: AdvanceSubmissionInput): Promise<Submission> {
    return apiFetch<Submission, AdvanceSubmissionInput>({ path: `/submissions/${id}`, method: 'PATCH', body: input })
  },
  // #4195 — « retenu » passe par la route d'orchestration du contrôleur projets : elle avance le
  // positionnement ET, l'effectif atteint, passe le besoin à « pourvu ».
  async retain(needId: string, id: string, input: AdvanceSubmissionInput): Promise<Submission> {
    const { proposedRateCents, plannedDays, dailyCostCents, outcomeReason, outcomeDetail } = input
    const conditions = {
      ...(outcomeReason !== undefined ? { outcomeReason } : {}),
      ...(outcomeDetail !== undefined ? { outcomeDetail } : {}),
      ...(proposedRateCents !== undefined ? { proposedRateCents } : {}),
      ...(plannedDays !== undefined ? { plannedDays } : {}),
      ...(dailyCostCents !== undefined ? { dailyCostCents } : {}),
    }
    const result = await apiFetch<{ submission: Submission }, typeof conditions>({
      path: `/projects/needs/${needId}/submissions/${id}/retain`,
      method: 'POST',
      body: conditions,
    })
    return result.submission
  },
  // #2177.11 / .12 / .13 / .15 / .21 — le sous-statut, sans jamais toucher `stage`.
  advanceSubstatus(id: string, input: AdvanceSubstatusInput): Promise<Submission> {
    return apiFetch<Submission, AdvanceSubstatusInput>({
      path: `/submissions/${id}/substatus`,
      method: 'PATCH',
      body: input,
    })
  },
  // #2177.6 / .8 / .24 / .25 / .28 / .30 — le détail : destinataire, canal,
  // message préparé, disponibilité, conditions.
  recordDetails(id: string, input: RecordSubmissionDetailsInput): Promise<Submission> {
    return apiFetch<Submission, RecordSubmissionDetailsInput>({
      path: `/submissions/${id}/details`,
      method: 'PATCH',
      body: input,
    })
  },
  interviews(id: string): Promise<{ items: Interview[] }> {
    return apiFetch<{ items: Interview[] }>({ path: `/submissions/${id}/interviews` })
  },
  scheduleInterview(id: string, input: ScheduleInterviewInput): Promise<Interview> {
    return apiFetch<Interview, ScheduleInterviewInput>({
      path: `/submissions/${id}/interviews`,
      method: 'POST',
      body: input,
    })
  },
  // #2875/#3398 (BM) — trace de consultation du brief, posée une seule fois.
  markInterviewBriefViewed(id: string, interviewId: string): Promise<Interview> {
    return apiFetch<Interview>({ path: `/submissions/${id}/interviews/${interviewId}/brief-viewed`, method: 'POST' })
  },
  feedback(id: string): Promise<{ items: SubmissionFeedback[] }> {
    return apiFetch<{ items: SubmissionFeedback[] }>({ path: `/submissions/${id}/feedback` })
  },
  recordFeedback(id: string, input: RecordFeedbackInput): Promise<SubmissionFeedback> {
    return apiFetch<SubmissionFeedback, RecordFeedbackInput>({
      path: `/submissions/${id}/feedback`,
      method: 'POST',
      body: input,
    })
  },
  consultantFeedback(id: string): Promise<{ items: SubmissionConsultantFeedback[] }> {
    return apiFetch<{ items: SubmissionConsultantFeedback[] }>({ path: `/submissions/${id}/consultant-feedback` })
  },
  recordConsultantFeedback(id: string, input: RecordConsultantFeedbackInput): Promise<SubmissionConsultantFeedback> {
    return apiFetch<SubmissionConsultantFeedback, RecordConsultantFeedbackInput>({
      path: `/submissions/${id}/consultant-feedback`,
      method: 'POST',
      body: input,
    })
  },
  // #2335.3 — chaque étape avec sa date, la fiche d'UN positionnement.
  timeline(id: string): Promise<{ items: SubmissionTimelineEvent[] }> {
    return apiFetch<{ items: SubmissionTimelineEvent[] }>({ path: `/submissions/${id}/timeline` })
  },
  // #2189.10-.16 (épopée #2940) — l'aperçu, lecture seule.
  preview(id: string): Promise<SubmissionPreview> {
    return apiFetch<SubmissionPreview>({ path: `/submissions/${id}/preview` })
  },
  // #2189.39 — la prochaine action, toujours datée et attribuée.
  recordNextAction(id: string, input: RecordSubmissionNextActionInput): Promise<Submission> {
    return apiFetch<Submission, RecordSubmissionNextActionInput>({
      path: `/submissions/${id}/next-action`,
      method: 'PATCH',
      body: input,
    })
  },
}

/**
 * `staleTime: 0` — même raison que la timeline et les tâches : un
 * positionnement avancé par un collègue resterait cinq minutes à l'ancienne
 * étape, et deux personnes enverraient le même CV.
 */
export function useSubmissions(filters: { projectId?: string; consultantId?: string } = {}) {
  return useQuery({
    queryKey: submissionKeys.list(filters.projectId, filters.consultantId),
    queryFn: () => submissionsApi.list(filters),
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['submissions'] })
  // Un positionnement laisse une trace dans l'historique du compte.
  qc.invalidateQueries({ queryKey: ['activities'] })
}

export function useCreateSubmission() {
  const qc = useQueryClient()
  return useMutation<Submission, Error, CreateSubmissionInput>({
    mutationFn: input => submissionsApi.create(input),
    onSuccess: () => {
      invalidate(qc)
      toast.success(i18n.t('submissions:toast.created'))
    },
    onError: error => toast.error(error.message || i18n.t('submissions:toast.createError')),
  })
}

export function useAdvanceSubmission() {
  const qc = useQueryClient()
  return useMutation<Submission, Error, { id: string; needId?: string | null } & AdvanceSubmissionInput>({
    mutationFn: ({ id, needId, ...input }) =>
      input.stage === 'accepted' && needId
        ? submissionsApi.retain(needId, id, input)
        : submissionsApi.advance(id, input),
    onSuccess: () => {
      invalidate(qc)
      // #4195 — « retenu » peut passer le besoin à « pourvu » : ses vues se rafraîchissent aussi.
      qc.invalidateQueries({ queryKey: ['projects'] })
      toast.success(i18n.t('submissions:toast.advanced'))
    },
    // Le message du serveur NOMME l'étape d'origine (« impossible depuis
    // “refusé” ») : le remplacer par un libellé générique perdrait la seule
    // information utile.
    onError: error => toast.error(error.message || i18n.t('submissions:toast.advanceError')),
  })
}

// #2177.11 / .12 / .13 / .15 / .21 — même garde que `useAdvanceSubmission` :
// le message du serveur nomme le sous-statut d'origine, jamais un « 400 » nu.
export function useAdvanceSubstatus() {
  const qc = useQueryClient()
  return useMutation<Submission, Error, { id: string } & AdvanceSubstatusInput>({
    mutationFn: ({ id, ...input }) => submissionsApi.advanceSubstatus(id, input),
    onSuccess: () => {
      invalidate(qc)
      toast.success(i18n.t('submissions:toast.advanced'))
    },
    onError: error => toast.error(error.message || i18n.t('submissions:toast.advanceError')),
  })
}

// #2177.6 / .8 / .24 / .25 / .28 / .30 — le détail d'un positionnement.
export function useRecordSubmissionDetails() {
  const qc = useQueryClient()
  return useMutation<Submission, Error, { id: string } & RecordSubmissionDetailsInput>({
    mutationFn: ({ id, ...input }) => submissionsApi.recordDetails(id, input),
    onSuccess: () => {
      invalidate(qc)
      toast.success(i18n.t('submissions:toast.detailsRecorded'))
    },
    onError: error => toast.error(error.message || i18n.t('submissions:toast.detailsError')),
  })
}

// #2177.6 — les contacts du COMPTE du positionnement, pour choisir le
// destinataire. Même clé, même appel que `useAccountContacts` (mission-panel).
export function useSubmissionRecipientContacts(accountId: string | null | undefined) {
  return useQuery({
    queryKey: contactKeys.byAccount(accountId ?? 'none'),
    queryFn: () => contactsApi.listByAccount(accountId as string),
    enabled: Boolean(accountId),
  })
}

// #2953 (#2193.48) — LE dossier d'un positionnement, par son id : la page de
// destination qui manquait à tout lien vers un `submission_id`.
export function useSubmission(id: string | undefined) {
  return useQuery({
    queryKey: submissionKeys.detail(id ?? 'none'),
    queryFn: () => submissionsApi.get(id as string),
    enabled: Boolean(id),
  })
}

// #2189.10-.16 (épopée #2940) — l'aperçu, lu à l'ouverture, jamais mis en cache
// au-delà : ce que le client va recevoir dépend des champs édités juste avant.
export function useSubmissionPreview(id: string | undefined) {
  return useQuery({
    queryKey: ['submissions', id ?? 'none', 'preview'],
    queryFn: () => submissionsApi.preview(id as string),
    enabled: Boolean(id),
    staleTime: 0,
  })
}

// #2189.39 — la prochaine action de CE positionnement.
export function useRecordSubmissionNextAction() {
  const qc = useQueryClient()
  return useMutation<Submission, Error, { id: string } & RecordSubmissionNextActionInput>({
    mutationFn: ({ id, ...input }) => submissionsApi.recordNextAction(id, input),
    onSuccess: () => {
      invalidate(qc)
      toast.success(i18n.t('submissions:toast.detailsRecorded'))
    },
    onError: error => toast.error(error.message || i18n.t('submissions:toast.detailsError')),
  })
}

export function useSubmissionInterviews(id: string | undefined) {
  return useQuery({
    queryKey: submissionKeys.interviews(id ?? 'none'),
    queryFn: () => submissionsApi.interviews(id as string),
    enabled: Boolean(id),
    select: response => response.items,
    staleTime: 0,
  })
}

export function useScheduleInterview(id: string) {
  const qc = useQueryClient()
  return useMutation<Interview, Error, ScheduleInterviewInput>({
    mutationFn: input => submissionsApi.scheduleInterview(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: submissionKeys.interviews(id) })
      invalidate(qc)
      toast.success(i18n.t('submissions:toast.interviewScheduled'))
    },
    onError: () => toast.error(i18n.t('submissions:toast.interviewError')),
  })
}

// #2875/#3398 (BM) — silencieuse : une trace de consultation, pas une action
// que la personne vient de valider. Aucun toast, échec non bloquant (le
// brief reste lisible même si la trace ne part pas).
export function useMarkInterviewBriefViewed(id: string) {
  const qc = useQueryClient()
  return useMutation<Interview, Error, { interviewId: string }>({
    mutationFn: ({ interviewId }) => submissionsApi.markInterviewBriefViewed(id, interviewId),
    onSuccess: () => qc.invalidateQueries({ queryKey: submissionKeys.interviews(id) }),
  })
}

export function useSubmissionFeedback(id: string | undefined) {
  return useQuery({
    queryKey: submissionKeys.feedback(id ?? 'none'),
    queryFn: () => submissionsApi.feedback(id as string),
    enabled: Boolean(id),
    select: response => response.items,
    staleTime: 0,
  })
}

export function useRecordFeedback(id: string) {
  const qc = useQueryClient()
  return useMutation<SubmissionFeedback, Error, RecordFeedbackInput>({
    mutationFn: input => submissionsApi.recordFeedback(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: submissionKeys.feedback(id) })
      invalidate(qc)
      toast.success(i18n.t('submissions:toast.feedbackRecorded'))
    },
    onError: () => toast.error(i18n.t('submissions:toast.feedbackError')),
  })
}

// #2335.5 — le retour CONSULTANT : cache, mutation et toasts séparés de ceux
// du retour client ci-dessus.
export function useSubmissionConsultantFeedback(id: string | undefined) {
  return useQuery({
    queryKey: submissionKeys.consultantFeedback(id ?? 'none'),
    queryFn: () => submissionsApi.consultantFeedback(id as string),
    enabled: Boolean(id),
    select: response => response.items,
    staleTime: 0,
  })
}

export function useRecordConsultantFeedback(id: string) {
  const qc = useQueryClient()
  return useMutation<SubmissionConsultantFeedback, Error, RecordConsultantFeedbackInput>({
    mutationFn: input => submissionsApi.recordConsultantFeedback(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: submissionKeys.consultantFeedback(id) })
      toast.success(i18n.t('submissions:toast.consultantFeedbackRecorded'))
    },
    onError: () => toast.error(i18n.t('submissions:toast.consultantFeedbackError')),
  })
}

// #2335.3 — chaque étape avec sa date. `staleTime: 0` : une étape franchie par
// un collègue doit apparaître, pas rester sur une timeline périmée.
export function useSubmissionTimeline(id: string | undefined) {
  return useQuery({
    queryKey: submissionKeys.timeline(id ?? 'none'),
    queryFn: () => submissionsApi.timeline(id as string),
    enabled: Boolean(id),
    select: response => response.items,
    staleTime: 0,
  })
}
