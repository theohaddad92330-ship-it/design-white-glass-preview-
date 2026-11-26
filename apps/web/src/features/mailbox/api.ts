import type {
  MailBatchRequest,
  MailBatchResult,
  MailDraftRequest,
  MailDraftResult,
  MailReplyDraftRequest,
  MailReplyDraftResult,
  MailSearchIntent,
  MailSearchResponse,
  MailThreadMark,
  MessageDraftValidation,
  MessageDraftVersionItem,
  MessageDraftChannel,
  MailboxSender,
  MailboxStatus,
  MyMessageDraftItem,
  OutOfOfficeRequest,
  RescheduleMessageSendRequest,
  ScheduleMessageSendRequest,
  ScheduledMessageSendItem,
} from '@bellum/contracts'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

type MailSearchParams = {
  intent: MailSearchIntent
  query?: string
  counterpart?: string
  windowDays?: number
  silenceDays?: number
  limit?: number
}

/** « Ta messagerie » — capacité, pas éditeur : aucune route ne nomme le fournisseur. */
export const mailboxApi = {
  status(): Promise<MailboxStatus> {
    return apiFetch<MailboxStatus>({ path: '/mailbox/status' })
  },
  /** #4546.5 — SES boîtes (jamais celles d'un collègue), parmi lesquelles l'expéditeur se choisit. */
  senders(): Promise<MailboxSender[]> {
    return apiFetch<MailboxSender[]>({ path: '/mailbox/senders' })
  },
  search(params: MailSearchParams): Promise<MailSearchResponse> {
    const query = new URLSearchParams({ intent: params.intent })
    if (params.query) query.set('query', params.query)
    if (params.counterpart) query.set('counterpart', params.counterpart)
    if (params.windowDays) query.set('windowDays', String(params.windowDays))
    if (params.silenceDays) query.set('silenceDays', String(params.silenceDays))
    if (params.limit) query.set('limit', String(params.limit))
    return apiFetch<MailSearchResponse>({ path: `/mailbox/search?${query.toString()}` })
  },
  /** #4405.1 — la réponse à un fil, déjà rédigée par Laura. Ne dépose et n'envoie rien. */
  draftReply(body: MailReplyDraftRequest): Promise<MailReplyDraftResult> {
    return apiFetch<MailReplyDraftResult>({ path: '/mailbox/reply-draft', method: 'POST', body })
  },
  createDraft(body: MailDraftRequest): Promise<MailDraftResult> {
    return apiFetch<MailDraftResult>({ path: '/mailbox/drafts', method: 'POST', body })
  },
  /**
   * L'ENVOI passe par le lot, même pour un seul destinataire.
   *
   * Ce n'est pas un détour : c'est le seul chemin d'envoi du produit, et il
   * porte les garde-fous qui rendent un envoi tenable — opt-out vérifié,
   * idempotence par `batchId` (un double-clic ne part pas deux fois), brouillon
   * déposé AVANT l'envoi pour qu'un échec laisse un message récupérable. Un
   * second chemin « envoi simple » sans ces vérifications finirait par écrire à
   * quelqu'un qui s'est désabonné.
   */
  sendBatch(body: MailBatchRequest): Promise<MailBatchResult> {
    return apiFetch<MailBatchResult>({ path: '/mailbox/batch', method: 'POST', body })
  },
  outOfOffice(): Promise<OutOfOfficeRequest | null> {
    return apiFetch<OutOfOfficeRequest | null>({ path: '/mailbox/out-of-office' })
  },
  setOutOfOffice(body: OutOfOfficeRequest): Promise<OutOfOfficeRequest> {
    return apiFetch<OutOfOfficeRequest>({ path: '/mailbox/out-of-office', method: 'PUT', body })
  },
  /**
   * La signature RÉELLE qui sera apposée — celle saisie ici, sinon celle de la
   * messagerie connectée, sinon `null`.
   *
   * C'est le serveur qui tranche l'ordre : le recopier dans le client
   * produirait deux résolutions, et l'écran finirait par annoncer une signature
   * que l'envoi n'apposerait pas.
   */
  signature(): Promise<{ signature: string | null }> {
    return apiFetch<{ signature: string | null }>({ path: '/mailbox/signature' })
  },
  setSignature(signature: string): Promise<{ signature: string | null }> {
    return apiFetch<{ signature: string | null }, { signature: string }>({
      path: '/mailbox/signature',
      method: 'PUT',
      body: { signature },
    })
  },
  /** #2104.7 / #2104.8 — marquer un fil traité, ou le signaler non pertinent.
   *  `mark: null` efface la décision. */
  setThreadMark(threadId: string, mark: MailThreadMark | null): Promise<{ mark: MailThreadMark | null }> {
    return apiFetch<{ mark: MailThreadMark | null }, { mark: MailThreadMark | null }>({
      path: `/mailbox/threads/${encodeURIComponent(threadId)}/mark`,
      method: 'PUT',
      body: { mark },
    })
  },
  /** Théo B m2-brouillons.N3 — reporter un fil jusqu'à une date (`until: null` le remet à traiter). Aucun rappel externe. */
  snoozeThread(threadId: string, until: string | null): Promise<{ snoozeUntil: string | null }> {
    return apiFetch<{ snoozeUntil: string | null }, { until: string | null }>({
      path: `/mailbox/threads/${encodeURIComponent(threadId)}/snooze`,
      method: 'PUT',
      body: { until },
    })
  },
  /** #2104.6 — rattacher un fil à un compte à la main. */
  linkThreadAccount(threadId: string, accountId: string): Promise<{ accountId: string }> {
    return apiFetch<{ accountId: string }, { accountId: string }>({
      path: `/mailbox/threads/${encodeURIComponent(threadId)}/account`,
      method: 'PUT',
      body: { accountId },
    })
  },
}

/** Clés stables — une seule, pour que l'écriture invalide exactement la lecture. */
export const mailboxKeys = { signature: ['mailbox', 'signature'] as const }

/**
 * La signature résolue, telle que l'envoi l'apposera.
 *
 * `MailboxPage` passait `signature={null}` EN DUR : l'écran annonçait « aucune
 * signature » à tout le monde, y compris à ceux qui en avaient une chez leur
 * fournisseur. La route existait depuis le début et n'avait aucun appelant.
 */
export function useMailboxSignature(enabled = true) {
  return useQuery({
    queryKey: mailboxKeys.signature,
    queryFn: mailboxApi.signature,
    enabled,
    staleTime: 60_000,
  })
}

/** Saisir sa signature DANS Bellum. Une chaîne vide l'efface et fait retomber
 *  la résolution sur celle de la messagerie — « je n'en veux pas ici » n'est
 *  pas « je n'ai rien saisi », et le serveur tient déjà cette distinction. */
export function useSaveMailboxSignature() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (signature: string) => mailboxApi.setSignature(signature),
    onSuccess: result => {
      // La réponse porte la signature RÉSOLUE : on la pose plutôt que de
      // deviner, sinon effacer la sienne afficherait « aucune signature » alors
      // que celle du fournisseur vient de reprendre la main.
      queryClient.setQueryData(mailboxKeys.signature, result)
      void queryClient.invalidateQueries({ queryKey: mailboxKeys.signature })
    },
  })
}

/** #4546.5 — les boîtes d'où un message peut partir. Un échec rend `undefined` : l'écran retombe sur le comportement d'avant. */
export function useMailboxSenders(enabled = true) {
  return useQuery({
    queryKey: ['mailbox', 'senders'],
    queryFn: mailboxApi.senders,
    enabled,
    staleTime: 60_000,
  })
}

export function useMailboxStatus() {
  return useQuery({ queryKey: ['mailbox', 'status'], queryFn: mailboxApi.status, staleTime: 60_000 })
}

/** Théo D settings-integrations.DÉC.absence — la réponse d'absence posée chez le fournisseur (Outlook ou Gmail). */
const outOfOfficeKey = ['mailbox', 'out-of-office'] as const

export function useOutOfOffice(enabled = true) {
  return useQuery({ queryKey: outOfOfficeKey, queryFn: mailboxApi.outOfOffice, enabled, staleTime: 60_000 })
}

export function useSaveOutOfOffice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: OutOfOfficeRequest) => mailboxApi.setOutOfOffice(body),
    onSuccess: saved => {
      queryClient.setQueryData(outOfOfficeKey, saved)
    },
  })
}

/**
 * La recherche n'est lancée que si la messagerie est lisible.
 *
 * `enabled` évite l'aller-retour qui reviendrait fatalement en 400 « aucune
 * messagerie connectée » — et surtout évite d'afficher une erreur là où l'écran
 * doit afficher une invitation à connecter.
 */
export function useMailSearch(params: MailSearchParams, enabled: boolean) {
  return useQuery({
    queryKey: ['mailbox', 'search', params],
    queryFn: () => mailboxApi.search(params),
    enabled,
    staleTime: 60_000,
  })
}

/**
 * Théo B m1 — plusieurs intentions à la fois (multi-sélection) : une question par intention, sous la MÊME clé que
 * `useMailSearch` (le cache est partagé). L'union se fait dans `lib/inbox-workspace.ts`.
 */
export function useMailSearches(paramsList: MailSearchParams[], enabled: boolean) {
  return useQueries({
    queries: paramsList.map(params => ({
      queryKey: ['mailbox', 'search', params],
      queryFn: () => mailboxApi.search(params),
      enabled,
      staleTime: 60_000,
    })),
  })
}

/** #4405.1 — « Préparer la réponse » pré-génère le mail ; l'échec laisse un champ vide à rédiger. */
export function useDraftReply() {
  return useMutation({ mutationFn: mailboxApi.draftReply })
}

export function useCreateDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: mailboxApi.createDraft,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['briefing'] })
    },
  })
}

/** Envoi à UN destinataire — un lot d'un seul élément, garde-fous compris. */
export function useSendMail() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: mailboxApi.sendBatch,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['briefing'] })
    },
  })
}

/** #2104.7 / #2104.8 — marquer un fil traité, ou le signaler non pertinent.
 *  Invalide la recherche : le fil doit retomber au niveau 6 dès la réponse. */
export function useSetThreadMark() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ threadId, mark }: { threadId: string; mark: MailThreadMark | null }) =>
      mailboxApi.setThreadMark(threadId, mark),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mailbox', 'search'] })
    },
  })
}

/** #2104.6 — rattacher un fil à un compte à la main. */
export function useLinkThreadAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ threadId, accountId }: { threadId: string; accountId: string }) =>
      mailboxApi.linkThreadAccount(threadId, accountId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mailbox', 'search'] })
    },
  })
}

/** Théo M2 — envoi programmé — « À venir » côté envois, et les brouillons du commercial (validés ou à relire). */
const scheduledSendApi = {
  list(): Promise<{ items: ScheduledMessageSendItem[] }> {
    return apiFetch({ path: '/message-drafts/scheduled-sends' })
  },
  schedule(body: ScheduleMessageSendRequest): Promise<{ scheduledSend: ScheduledMessageSendItem }> {
    return apiFetch({ path: '/message-drafts/scheduled-sends', method: 'POST', body })
  },
  reschedule(id: string, body: RescheduleMessageSendRequest): Promise<{ scheduledSend: ScheduledMessageSendItem }> {
    return apiFetch({ path: `/message-drafts/scheduled-sends/${encodeURIComponent(id)}`, method: 'PATCH', body })
  },
  cancel(id: string): Promise<{ scheduledSend: ScheduledMessageSendItem }> {
    return apiFetch({ path: `/message-drafts/scheduled-sends/${encodeURIComponent(id)}/cancel`, method: 'POST' })
  },
  myDrafts(): Promise<{ items: MyMessageDraftItem[]; total: number }> {
    return apiFetch({ path: '/message-drafts/mine?limit=100' })
  },
}

const scheduledSendKeys = {
  list: ['message-drafts', 'scheduled-sends'] as const,
  mine: ['message-drafts', 'mine'] as const,
}

export function useScheduledSends() {
  return useQuery({ queryKey: scheduledSendKeys.list, queryFn: scheduledSendApi.list, staleTime: 30_000 })
}

export function useMyMessageDrafts() {
  return useQuery({ queryKey: scheduledSendKeys.mine, queryFn: scheduledSendApi.myDrafts, staleTime: 30_000 })
}

/** Programmer, déplacer l'heure ou déprogrammer : chaque geste relit « À venir » depuis le serveur, qui fait foi. */
export function useScheduleSendActions() {
  const queryClient = useQueryClient()
  const refresh = () => void queryClient.invalidateQueries({ queryKey: scheduledSendKeys.list })
  return {
    schedule: useMutation({ mutationFn: scheduledSendApi.schedule, onSuccess: refresh }),
    reschedule: useMutation({
      mutationFn: ({ id, body }: { id: string; body: RescheduleMessageSendRequest }) =>
        scheduledSendApi.reschedule(id, body),
      onSuccess: refresh,
    }),
    cancel: useMutation({ mutationFn: scheduledSendApi.cancel, onSuccess: refresh }),
  }
}

/**
 * Théo B m2-brouillons.N3 / N4 — les fils que le commercial a reportés ou traités. Une seule lecture large (un an,
 * 100 fils) alimente « À venir » et « Historique » ; le corps d'un fil n'est jamais lu ici (voir `view/m1/ThreadReader`).
 */
export function useTrackedThreads(enabled: boolean) {
  return useMailSearch({ intent: 'free', windowDays: 365, limit: 100 }, enabled)
}

/** Reporter un fil, ou le remettre à traiter (`until: null`). Relit les fils : le serveur fait foi. */
export function useSnoozeThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ threadId, until }: { threadId: string; until: string | null }) =>
      mailboxApi.snoozeThread(threadId, until),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mailbox', 'search'] })
    },
  })
}

/** Théo B m2-brouillons.R3 / R6 / N2 — relire & valider, archiver, et l'historique des versions d'un fil. Rien ne part. */
const draftReviewApi = {
  validate(versionId: string): Promise<{ validation: MessageDraftValidation }> {
    return apiFetch({ path: `/message-drafts/${encodeURIComponent(versionId)}/validate`, method: 'POST' })
  },
  archive(versionId: string): Promise<{ archival: { versionId: string; archivedAt: string } }> {
    return apiFetch({ path: `/message-drafts/${encodeURIComponent(versionId)}/archive`, method: 'POST' })
  },
  versions(contactId: string, channel: MessageDraftChannel): Promise<{ items: MessageDraftVersionItem[] }> {
    return apiFetch({
      path: `/contacts/${encodeURIComponent(contactId)}/message-draft-versions?channel=${encodeURIComponent(channel)}`,
    })
  },
}

export function useDraftReviewActions() {
  const queryClient = useQueryClient()
  const refresh = () => void queryClient.invalidateQueries({ queryKey: scheduledSendKeys.mine })
  return {
    validate: useMutation({ mutationFn: draftReviewApi.validate, onSuccess: refresh }),
    archive: useMutation({ mutationFn: draftReviewApi.archive, onSuccess: refresh }),
  }
}

/** Les versions d'un fil (contact × canal), de la plus récente à la plus ancienne — lues à l'ouverture de « Expéditeur, version & historique ». */
export function useDraftVersions(contactId: string, channel: MessageDraftChannel, enabled: boolean) {
  return useQuery({
    queryKey: ['message-drafts', 'versions', contactId, channel],
    queryFn: () => draftReviewApi.versions(contactId, channel),
    enabled,
    staleTime: 30_000,
  })
}

/** Théo B m2-brouillons.A2 — refuser l'envoi d'un message de séquence à la relecture : il est annulé (on archive, on ne supprime pas). */
export function useRejectSequenceMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<unknown, { to: string; cause: string; proof: null }>({
        path: `/outreach/messages/${encodeURIComponent(id)}/transition`,
        method: 'POST',
        body: { to: 'cancelled', cause: 'Envoi refusé à la relecture, dans la messagerie', proof: null },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['outreach'] })
    },
  })
}
