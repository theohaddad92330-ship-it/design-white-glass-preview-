import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { BulkVerifyOutcome } from '@bellum/contracts'
import { contactKeys, contactsApi, pollEnrichment } from '@/features/contacts/api'
import {
  settledEnrichmentToOutcome,
  summarizeBulkEnrichmentOutcomes,
} from '@/features/contacts/lib/bulkEnrichmentSummary'

/**
 * #2964 (#2296.38-.41) — vérification FORCÉE d'une sélection.
 *
 * Un seul appel, un statut PAR CONTACT en retour : le toast compte les mises
 * en file réussies et les refus, jamais un total qui masquerait lequel des
 * cinquante a échoué (#2296.39/.40, même discipline que l'enrichissement de
 * masse silencieux — une seule notification agrégée, pas cinquante).
 *
 * ⚠️ Une mise en file réussie n'est pas un résultat : le crédit ne se débite
 * que si le fournisseur trouve quelque chose (`ContactEnrichmentService`,
 * même règle que l'enrichissement simple), et ce résultat arrive plus tard,
 * par le worker. Ce premier toast ne promet donc que ce qu'il sait déjà :
 * combien de vérifications sont parties.
 *
 * #2297 (LAU-FINAL-038, section LOT) — le lot AUSSI restitue son résultat, en
 * comptes nommés (« 38 emails trouvés / 17 mobiles trouvés / 9 identités à
 * confirmer / 6 sans résultat / 0 envoyé »), jamais seulement « lancé ».
 * `pollEnrichment` (déjà le mécanisme de l'enrichissement simple) est réutilisé
 * par contact mis en file, en parallèle ; un second toast porte l'agrégat une
 * fois le lot réglé. Une invalidation react-query supplémentaire n'est pas
 * nécessaire ici : chaque `pollEnrichment` résout après que le worker a déjà
 * écrit le contact, et la première invalidation (ci-dessous) couvre déjà le
 * rafraîchissement des fiches.
 */
export function useBulkVerifyContacts() {
  const { t } = useTranslation('contacts')
  const queryClient = useQueryClient()

  return useMutation<{ outcomes: BulkVerifyOutcome[] }, Error, string[]>({
    mutationFn: contactIds => contactsApi.bulkVerify(contactIds),
    onSuccess: ({ outcomes }) => {
      void queryClient.invalidateQueries({ queryKey: contactKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['credits'] })

      const queuedOutcomes = outcomes.filter(outcome => outcome.ok)
      const failed = outcomes.length - queuedOutcomes.length

      if (queuedOutcomes.length === 0) {
        toast.error(t('bulkVerify.nothingQueued'), failed > 0 ? { description: t('bulkVerify.allFailed') } : undefined)
        return
      }

      toast.success(
        t('bulkVerify.queued', { count: queuedOutcomes.length }),
        failed > 0 ? { description: t('bulkVerify.someFailed', { count: failed }) } : undefined,
      )

      void Promise.allSettled(queuedOutcomes.map(outcome => pollEnrichment(outcome.contact_id))).then(settled => {
        const summary = summarizeBulkEnrichmentOutcomes(settled.map(settledEnrichmentToOutcome))
        void queryClient.invalidateQueries({ queryKey: contactKeys.all })
        void queryClient.invalidateQueries({ queryKey: ['credits'] })
        toast.success(t('bulkVerify.summary.title'), {
          description: [
            t('bulkVerify.summary.emails', { count: summary.emailsFound }),
            t('bulkVerify.summary.mobiles', { count: summary.mobilesFound }),
            t('bulkVerify.summary.toConfirm', { count: summary.toConfirm }),
            t('bulkVerify.summary.noResult', { count: summary.noResult }),
            t('bulkVerify.summary.sent', { count: summary.sent }),
          ].join('\n'),
        })
      })
    },
    onError: (error: Error) => {
      toast.error(t('bulkVerify.failed'), error.message ? { description: error.message } : undefined)
    },
  })
}
