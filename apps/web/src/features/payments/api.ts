import type {
  GenerateOutgoingPaymentInput,
  OutgoingPayment,
  OutgoingPaymentsPage,
  OutgoingPaymentsQuery,
  RemindOutgoingPaymentsResult,
} from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'

/**
 * L'accès aux PAIEMENTS SORTANTS — son propre `api.ts`, pas celui des missions.
 *
 * ⚠️ Il n'est PAS mutualisé avec `features/missions/api.ts`, et c'est une
 * décision : les deux écrans ne montrent pas la même population — celui-là suit
 * l'argent qui RENTRE du client, celui-ci l'argent qui SORT vers le consultant.
 * Partager un fichier ferait partager une racine de cache, et invalider l'un
 * rechargerait douze requêtes de l'autre.
 */

/**
 * Les clés du cache — DÉFINIES ici, IMPORTÉES partout ailleurs.
 *
 * ⚠️ Une clé recopiée à la main dans un écran ou dans un test est une clé qui
 * diverge à la première évolution : le composant écrirait dans une case que
 * l'invalidation ne connaît plus, et l'écran resterait figé sans qu'aucun test
 * ne tombe.
 *
 * ⚠️ Les filtres entrent dans la clé. Sans eux, le mois de juillet et celui
 * d'août partagent la même case : changer de mois rendrait la réponse du
 * précédent — un écran filtré qui montre les paiements d'ailleurs.
 */
export const paymentKeys = {
  /** La racine du domaine — ce que les gestes invalident. */
  all: () => ['payments'] as const,
  list: (filters?: OutgoingPaymentsQuery) =>
    [
      'payments',
      'outgoing',
      filters?.month ?? 'default',
      filters?.status ?? 'all',
      filters?.accountId ?? 'all',
      filters?.search ?? 'none',
    ] as const,
}

/** Les filtres, en paramètres d'URL. Un filtre absent ne se sérialise PAS —
 *  le corps et la requête sont `.strict()` côté serveur, et une clé vide serait
 *  rejetée. */
function toQueryString(filters: OutgoingPaymentsQuery): string {
  const params = new URLSearchParams()
  if (filters.month) params.set('month', filters.month)
  if (filters.status) params.set('status', filters.status)
  if (filters.accountId) params.set('accountId', filters.accountId)
  if (filters.search) params.set('search', filters.search)
  return params.toString()
}

export const outgoingPaymentsApi = {
  list(filters: OutgoingPaymentsQuery = {}): Promise<OutgoingPaymentsPage> {
    const query = toQueryString(filters)
    return apiFetch<OutgoingPaymentsPage>({
      path: query ? `/payments/outgoing?${query}` : '/payments/outgoing',
    })
  },
  generate(input: GenerateOutgoingPaymentInput): Promise<OutgoingPayment> {
    return apiFetch<OutgoingPayment, GenerateOutgoingPaymentInput>({
      path: '/payments/outgoing/generate',
      method: 'POST',
      body: input,
    })
  },
  validate(paymentId: string, input: { scheduledOn?: string } = {}): Promise<OutgoingPayment> {
    return apiFetch<OutgoingPayment, typeof input>({
      path: `/payments/outgoing/${paymentId}/validate`,
      method: 'POST',
      body: input,
    })
  },
  settle(paymentId: string, input: { paidOn?: string; settledAmountCents?: number } = {}): Promise<OutgoingPayment> {
    return apiFetch<OutgoingPayment, typeof input>({
      path: `/payments/outgoing/${paymentId}/settle`,
      method: 'POST',
      body: input,
    })
  },
  reject(paymentId: string, reason: string): Promise<OutgoingPayment> {
    return apiFetch<OutgoingPayment, { reason: string }>({
      path: `/payments/outgoing/${paymentId}/reject`,
      method: 'POST',
      body: { reason },
    })
  },
  /** ⚠️ CONSIGNE des relances, n'en envoie AUCUNE. Le mécanisme d'envoi
   *  gouverné du dépôt est ailleurs, et ce lot ne l'appelle pas. */
  remind(paymentIds: readonly string[]): Promise<RemindOutgoingPaymentsResult> {
    return apiFetch<RemindOutgoingPaymentsResult, { paymentIds: string[] }>({
      path: '/payments/outgoing/remind',
      method: 'POST',
      body: { paymentIds: [...paymentIds] },
    })
  },
  exportCsv(filters: OutgoingPaymentsQuery = {}): Promise<string> {
    const query = toQueryString(filters)
    return apiFetch<string>({
      path: query ? `/payments/outgoing/export.csv?${query}` : '/payments/outgoing/export.csv',
      responseType: 'text',
    })
  },
}

/**
 * Le mois affiché.
 *
 * ⚠️ `canReadFinance` est en défaut FERMÉ : une réponse d'API plus ancienne que
 * ce code ne porte pas le champ, et un défaut ouvert afficherait les montants à
 * tout le monde pendant la fenêtre de déploiement.
 *
 * ⚠️ Et il ne se confond PAS avec l'absence de donnée : sans lui, un montant à
 * `null` se lirait « personne n'a saisi le dû » aussi bien que « tu n'as pas le
 * droit de le voir » — deux pannes qui ne se réparent pas de la même façon.
 */
export function useOutgoingPayments(filters: OutgoingPaymentsQuery): {
  page: OutgoingPaymentsPage | null
  canReadFinance: boolean
  isLoading: boolean
  isError: boolean
} {
  const result = useQuery({
    queryKey: paymentKeys.list(filters),
    queryFn: () => outgoingPaymentsApi.list(filters),
  })
  return {
    page: result.data ?? null,
    canReadFinance: result.data?.canReadFinance ?? false,
    isLoading: result.isPending,
    isError: result.isError,
  }
}

/** Un geste réussi invalide la racine du domaine : une ligne validée doit
 *  changer de seau dans la seconde, sinon l'utilisateur le refait. */
function useGesture<TVariables>(
  mutationFn: (variables: TVariables) => Promise<unknown>,
  successKey: string,
  failureKey: string,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: paymentKeys.all() })
      toast.success(i18n.t(successKey))
    },
    onError: (error: Error) => toast.error(error.message || i18n.t(failureKey)),
  })
}

export function useGeneratePayment() {
  return useGesture<GenerateOutgoingPaymentInput>(
    input => outgoingPaymentsApi.generate(input),
    'payments:toasts.generated',
    'payments:toasts.generateFailed',
  )
}

export function useValidatePayment() {
  return useGesture<{ paymentId: string; scheduledOn?: string }>(
    ({ paymentId, scheduledOn }) => outgoingPaymentsApi.validate(paymentId, scheduledOn ? { scheduledOn } : {}),
    'payments:toasts.validated',
    'payments:toasts.validateFailed',
  )
}

export function useSettlePayment() {
  return useGesture<{ paymentId: string; paidOn?: string; settledAmountCents?: number }>(
    ({ paymentId, ...input }) => outgoingPaymentsApi.settle(paymentId, input),
    'payments:toasts.settled',
    'payments:toasts.settleFailed',
  )
}

export function useRejectPayment() {
  return useGesture<{ paymentId: string; reason: string }>(
    ({ paymentId, reason }) => outgoingPaymentsApi.reject(paymentId, reason),
    'payments:toasts.rejected',
    'payments:toasts.rejectFailed',
  )
}

/**
 * La relance EN MASSE.
 *
 * ⚠️ Son toast DIT ce qui a été écarté. « 12 relances consignées » quand trois
 * lignes ont été laissées de côté ferait croire à un geste qui n'a pas eu
 * lieu ; le serveur rend `skipped` précisément pour ça, et le taire ici
 * annulerait tout le travail — « une erreur se remarque, une liste vide se
 * croit ».
 */
export function useRemindPayments() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (paymentIds: readonly string[]) => outgoingPaymentsApi.remind(paymentIds),
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: paymentKeys.all() })
      toast.success(
        result.skipped > 0
          ? i18n.t('payments:toasts.remindedPartial', { count: result.reminded, skipped: result.skipped })
          : i18n.t('payments:toasts.reminded', { count: result.reminded }),
      )
    },
    onError: (error: Error) => toast.error(error.message || i18n.t('payments:toasts.remindFailed')),
  })
}
