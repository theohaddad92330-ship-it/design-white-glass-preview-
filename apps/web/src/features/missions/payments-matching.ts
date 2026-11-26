import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'

/**
 * LES RÈGLEMENTS À RAPPROCHER — la lecture riche et les deux gestes d'Encaissements (Théo V22, 23/10).
 *
 * ⚠️ Même route que `useInvoicePayments` (`GET /delivery/payments`, qui n'en lit que le montant pour
 * la tuile « à rapprocher ») : ici on lit AUSSI le payeur, la date, la référence et les factures
 * candidates. Les routes existaient côté serveur (`finance:read` / `finance:write`) sans appelant web.
 *
 * Tout est DÉCLARATIF (D33) : un règlement est consigné par quelqu'un, un rapprochement est un
 * geste humain — jamais proposé ET validé d'un même mouvement. Les candidates sont les seules
 * factures dont le reste dû égale le règlement : sans candidate, on le dit, on n'en invente pas.
 */
type PaymentCandidate = {
  invoiceReadinessId: string
  missionId: string
  missionLabel: string | null
  accountName: string | null
  periodMonth: string
  dueCents: number
}

export type UnmatchedPaymentDetail = {
  id: string
  amountCents: number
  receivedOn: string
  payer: string | null
  reference: string | null
  accountName: string | null
  candidates: PaymentCandidate[]
  ambiguous: boolean
}

type PaymentsDetailView = { unmatched: UnmatchedPaymentDetail[] }

const paymentsDetailKey = ['missions', 'payments', 'detail'] as const

export function useUnmatchedPayments() {
  return useQuery({
    queryKey: paymentsDetailKey,
    queryFn: () => apiFetch<PaymentsDetailView>({ path: '/delivery/payments' }),
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

type NewPayment = { amountCents: number; receivedOn: string; payer?: string; reference?: string }

export function useRecordUnmatchedPayment() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, NewPayment>({
    mutationFn: input => apiFetch<unknown, NewPayment>({ path: '/delivery/payments', method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      toast.success(i18n.t('missions:collections.toast.paymentRecorded'))
    },
    onError: () => toast.error(i18n.t('missions:collections.toast.paymentRecordError')),
  })
}

export function useMatchPayment() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { paymentId: string; invoiceReadinessId: string }>({
    mutationFn: ({ paymentId, invoiceReadinessId }) =>
      apiFetch<unknown, { invoiceReadinessId: string }>({
        path: `/delivery/payments/${paymentId}/match`,
        method: 'POST',
        body: { invoiceReadinessId },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      toast.success(i18n.t('missions:collections.toast.matched'))
    },
    onError: () => toast.error(i18n.t('missions:collections.toast.matchError')),
  })
}

/**
 * #2419.11 — un paiement EN TROP (ou sans facture à couvrir) se note comme CRÉDIT DÛ au client :
 * une note interne, jamais un avoir émis (Bellum ne comptabilise pas, #2564).
 */
export function useNoteCustomerCredit() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { paymentId: string; note: string }>({
    mutationFn: ({ paymentId, note }) =>
      apiFetch<unknown, { note: string }>({
        path: `/delivery/payments/${paymentId}/customer-credit`,
        method: 'POST',
        body: { note },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      toast.success(i18n.t('missions:collections.toast.creditNoted'))
    },
    onError: () => toast.error(i18n.t('missions:collections.toast.creditError')),
  })
}
