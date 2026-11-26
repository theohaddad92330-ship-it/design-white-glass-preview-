import type {
  ExpensePolicyBoard,
  ExpenseReportAttachmentView,
  ExpenseReportDetailView,
  ExpenseReportListQuery,
  ExpenseReportListResult,
  ExpenseReportSummaryView,
  ExpenseReportTiles,
  SaveExpensePolicyInput,
  SaveExpenseReportInput,
  SignedDownload,
  StorageUploadInput,
} from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { uploadWithProgress, type UploadProgress } from '@/lib/upload-with-progress'

/**
 * L'accès aux notes de frais.
 *
 * ⚠️ `canReadFinance` voyage avec la réponse, et l'écran le LIT. Sans lui,
 * « pas le droit de voir ce montant » et « ce montant n'a pas été mesuré »
 * arrivent tous les deux comme `null`, et l'écran ne peut plus les dire
 * différemment — c'est le corollaire écrit dans `redactFinance`.
 *
 * ⚠️ Le barème passe par CE module, et par lui seul (loi 1 du tome 7, GA-26) :
 * un réglage vit à un seul endroit, et deux portes d'écriture donneraient deux
 * vérités sur ce que l'ESN rembourse.
 */
export const expenseKeys = {
  list: (filters: ExpenseReportListQuery) =>
    [
      'expenses',
      'reports',
      filters.month ?? 'all',
      filters.status ?? 'all',
      filters.search ?? '',
      // ⚠️ La page fait PARTIE de la clé : sans elle, passer à la page 2 rendrait
      // le cache de la page 1 et la liste ne bougerait pas — un défaut qu'on
      // attribue au bouton, jamais au cache.
      filters.page ?? 1,
      filters.pageSize ?? 'default',
    ] as const,
  detail: (id: string) => ['expenses', 'reports', id] as const,
  policies: () => ['expenses', 'policies'] as const,
}

function toSearchParams(filters: ExpenseReportListQuery): string {
  const params = new URLSearchParams()
  if (filters.month) params.set('month', filters.month)
  if (filters.status) params.set('status', filters.status)
  if (filters.search) params.set('search', filters.search)
  if (filters.accountId) params.set('accountId', filters.accountId)
  if (filters.page) params.set('page', String(filters.page))
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize))
  const query = params.toString()
  return query ? `?${query}` : ''
}

export const expensesApi = {
  list(filters: ExpenseReportListQuery): Promise<ExpenseReportListResult> {
    return apiFetch<ExpenseReportListResult>({ path: `/expenses/reports${toSearchParams(filters)}` })
  },
  create(body: SaveExpenseReportInput): Promise<{ id: string }> {
    return apiFetch<{ id: string }, SaveExpenseReportInput>({ path: '/expenses/reports', method: 'POST', body })
  },
  update(id: string, body: SaveExpenseReportInput): Promise<{ id: string }> {
    return apiFetch<{ id: string }, SaveExpenseReportInput>({ path: `/expenses/reports/${id}`, method: 'PUT', body })
  },
  submit(id: string): Promise<{ id: string }> {
    return apiFetch<{ id: string }>({ path: `/expenses/reports/${id}/submit`, method: 'POST' })
  },
  withdraw(id: string): Promise<{ id: string }> {
    return apiFetch<{ id: string }>({ path: `/expenses/reports/${id}/withdraw`, method: 'POST' })
  },
  policies(): Promise<ExpensePolicyBoard> {
    return apiFetch<ExpensePolicyBoard>({ path: '/expenses/policies' })
  },
  savePolicy(body: SaveExpensePolicyInput): Promise<{ id: string }> {
    return apiFetch<{ id: string }, SaveExpensePolicyInput>({ path: '/expenses/policies', method: 'PUT', body })
  },
  detail(id: string): Promise<ExpenseReportDetailView> {
    return apiFetch<ExpenseReportDetailView>({ path: `/expenses/reports/${id}` })
  },
  validate(id: string): Promise<{ id: string }> {
    return apiFetch<{ id: string }>({ path: `/expenses/reports/${id}/validate`, method: 'POST' })
  },
  reject(id: string, reason: string): Promise<{ id: string }> {
    return apiFetch<{ id: string }, { reason: string }>({
      path: `/expenses/reports/${id}/reject`,
      method: 'POST',
      body: { reason },
    })
  },
  /**
   * Dépose un justificatif, en rendant compte de l'avancement.
   *
   * ⚠️ `uploadWithProgress` et non `apiFetch` : `fetch` n'expose aucun
   * avancement d'ENVOI, et un fichier de dix mégaoctets derrière une connexion
   * de gare laisse regarder un bouton grisé pendant une minute — puis
   * redéposer. La barre affichée compte de vrais octets partis.
   */
  upload(
    id: string,
    input: StorageUploadInput,
    onProgress: (progress: UploadProgress) => void,
  ): Promise<ExpenseReportAttachmentView> {
    return uploadWithProgress<ExpenseReportAttachmentView, StorageUploadInput>(
      `/expenses/reports/${id}/attachments`,
      input,
      onProgress,
    )
  },
  /**
   * Demande l'URL de lecture d'un justificatif.
   *
   * `downloadUrl` vient de la RÉPONSE (`ExpenseReportAttachmentView`), il n'est
   * jamais reconstruit ici : deux chemins qui fabriquent la même porte
   * divergent, et l'écran finirait par appeler une route qui n'existe plus.
   */
  signedDownload(downloadUrl: string): Promise<SignedDownload> {
    return apiFetch<SignedDownload>({ path: downloadUrl })
  },
}

export function useExpenseReports(filters: ExpenseReportListQuery) {
  return useQuery({
    queryKey: expenseKeys.list(filters),
    queryFn: () => expensesApi.list(filters),
    // Une décision prise dans le tiroir doit se voir dans la file en revenant :
    // un cache tiède ferait réapparaître une note qu'on vient de valider.
    staleTime: 0,
  })
}

export function useExpenseReportDetail(id: string | null) {
  return useQuery({
    queryKey: expenseKeys.detail(id ?? 'none'),
    queryFn: () => expensesApi.detail(id as string),
    enabled: Boolean(id),
    staleTime: 0,
  })
}

/**
 * Les deux décisions invalident la LISTE autant que le dossier.
 *
 * Le dossier seul ne suffirait pas : les trois tuiles et la file vivent dans la
 * requête de liste, et une note validée qui reste « en attente » dans la tuile
 * fait recliquer — puis douter que le clic ait servi à quelque chose.
 */
function useDecision(mutationFn: (id: string) => Promise<{ id: string }>, successKey: string, errorKey: string) {
  const queryClient = useQueryClient()
  return useMutation<{ id: string }, Error, string>({
    mutationFn,
    onSuccess: (_result, id) => {
      void queryClient.invalidateQueries({ queryKey: ['expenses', 'reports'] })
      void queryClient.invalidateQueries({ queryKey: expenseKeys.detail(id) })
      toast.success(i18n.t(successKey))
    },
    // Le message dit ce qui NE s'est pas passé : « rien n'a été décidé ». Un
    // « une erreur est survenue » laisse croire que la note est peut-être
    // passée quand même, et on reclique.
    onError: () => toast.error(i18n.t(errorKey)),
  })
}

export function useValidateExpenseReport() {
  return useDecision(id => expensesApi.validate(id), 'expenses:toast.validated', 'expenses:toast.validateError')
}

/**
 * OUVRE un justificatif : demande l'URL signée, puis la suit.
 *
 * ⚠️ L'URL n'est jamais MISE EN CACHE ni gardée dans un état : elle vit cinq
 * minutes, et une URL périmée rangée dans un composant produirait un lien qui
 * marche la première fois et plus jamais. On la demande au clic, on l'utilise,
 * on l'oublie.
 *
 * `noopener,noreferrer` : la page ouverte ne doit pas pouvoir reprendre la
 * main sur l'onglet qui l'a ouverte.
 */
export function useOpenAttachment() {
  return useMutation<SignedDownload, Error, string>({
    mutationFn: downloadUrl => expensesApi.signedDownload(downloadUrl),
    onSuccess: signed => {
      window.open(signed.url, '_blank', 'noopener,noreferrer')
    },
    // Le message du serveur porte la raison (« référencé, non stocké ici »,
    // « demande le droit de voir les montants ») ; le remplacer ferait
    // recliquer.
    onError: error => toast.error(error.message || i18n.t('expenses:toast.downloadError')),
  })
}

/**
 * DÉPOSE un justificatif, et invalide le dossier ET la liste.
 *
 * La liste aussi : la vérification automatique compte les pièces jointes
 * (« aucun justificatif »), et une anomalie qui reste affichée après le dépôt
 * ferait redéposer.
 */
export function useUploadAttachment(reportId: string) {
  const queryClient = useQueryClient()
  return useMutation<
    ExpenseReportAttachmentView,
    Error,
    { input: StorageUploadInput; onProgress: (progress: UploadProgress) => void }
  >({
    mutationFn: ({ input, onProgress }) => expensesApi.upload(reportId, input, onProgress),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['expenses', 'reports'] })
      void queryClient.invalidateQueries({ queryKey: expenseKeys.detail(reportId) })
      toast.success(i18n.t('expenses:toast.uploaded'))
    },
  })
}

export function useRejectExpenseReport() {
  const queryClient = useQueryClient()
  return useMutation<{ id: string }, Error, { id: string; reason: string }>({
    mutationFn: ({ id, reason }) => expensesApi.reject(id, reason),
    onSuccess: (_result, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['expenses', 'reports'] })
      void queryClient.invalidateQueries({ queryKey: expenseKeys.detail(id) })
      toast.success(i18n.t('expenses:toast.rejected'))
    },
    onError: () => toast.error(i18n.t('expenses:toast.rejectError')),
  })
}

/**
 * ENREGISTRE une note — création ou correction, une seule porte.
 *
 * `id === null` crée, sinon corrige : le formulaire est le MÊME dans les deux
 * cas, et deux hooks feraient diverger deux écrans qui doivent se ressembler.
 *
 * ⚠️ Le message d'erreur du serveur est RELAYÉ tel quel quand il y en a un :
 * « la référence F-2026-006 est déjà prise » est corrigible, « une erreur est
 * survenue » ne l'est pas — et fait recliquer sur le même bouton.
 */
export function useSaveExpenseReport() {
  const queryClient = useQueryClient()
  return useMutation<{ id: string }, Error, { id: string | null; input: SaveExpenseReportInput }>({
    mutationFn: ({ id, input }) => (id === null ? expensesApi.create(input) : expensesApi.update(id, input)),
    onSuccess: result => {
      void queryClient.invalidateQueries({ queryKey: ['expenses', 'reports'] })
      void queryClient.invalidateQueries({ queryKey: expenseKeys.detail(result.id) })
      toast.success(i18n.t('expenses:toast.saved'))
    },
    onError: error => toast.error(error.message || i18n.t('expenses:toast.saveError')),
  })
}

/** SOUMET un brouillon — il entre dans la file, daté. */
export function useSubmitExpenseReport() {
  return useDecision(id => expensesApi.submit(id), 'expenses:toast.submitted', 'expenses:toast.submitError')
}

/** RETIRE une note soumise par erreur — elle redevient un brouillon. */
export function useWithdrawExpenseReport() {
  return useDecision(id => expensesApi.withdraw(id), 'expenses:toast.withdrawn', 'expenses:toast.withdrawError')
}

/** Le barème et les clients à qui en poser un. */
export function useExpensePolicies() {
  return useQuery({ queryKey: expenseKeys.policies(), queryFn: () => expensesApi.policies(), staleTime: 0 })
}

/**
 * ÉCRIT une révision du barème.
 *
 * Elle invalide AUSSI les notes : un plafond qui change modifie le verdict de
 * conformité de toutes les notes de la période, et laisser la file afficher
 * l'ancien verdict ferait douter que le réglage ait servi à quelque chose.
 */
export function useSaveExpensePolicy() {
  const queryClient = useQueryClient()
  return useMutation<{ id: string }, Error, SaveExpensePolicyInput>({
    mutationFn: input => expensesApi.savePolicy(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: expenseKeys.policies() })
      void queryClient.invalidateQueries({ queryKey: ['expenses', 'reports'] })
      toast.success(i18n.t('expenses:toast.policySaved'))
    },
    onError: error => toast.error(error.message || i18n.t('expenses:toast.policySaveError')),
  })
}
