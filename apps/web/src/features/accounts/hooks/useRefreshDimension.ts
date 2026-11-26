import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { softBrakeToast } from '@/features/credits/lib/soft-brake'
import type { RefreshDimension } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { contactKeys } from '@/features/contacts/api'
import { trackActionCompleted, trackActionStarted } from '@/lib/product-tracker'

/** #2130.63 / #2130.64 — même convention que `TabPartners.tsx` : le motif de
 *  route littéral, jamais dérivé d'un `accountId` (GA-276). */
const ACCOUNT_DETAIL_SCREEN = '/accounts/$id'
const REFRESH_ACTION = 'refresh'

/** HTTP status behind an ``apiFetch`` error. The real client stashes it on
 *  ``Error.cause`` (numeric); we fall back to a status embedded in the message
 *  so the 402 upsell still fires regardless of the exact error shape. */
function statusOf(err: unknown): number | null {
  if (!(err instanceof Error)) return null
  if (typeof err.cause === 'number') return err.cause
  const match = err.message.match(/\b(4\d\d|5\d\d)\b/)
  return match ? Number(match[1]) : null
}

/**
 * "Rerun partiel par dimension" (Théo P1) — mutation for
 * ``POST /analysis/:id/refresh { dimension }``. Refreshes ONE axis of a
 * completed dossier (signaux / contacts / entités / stratégie) by re-running
 * only the matching analysis phase, reusing the stored outputs of the others.
 *
 * Debits one enrichment credit on the server, so on success we invalidate the
 * account detail + its contacts (fresh data lands) and ``['credits']`` (the
 * navbar / billing balance moves). A 402 (out of enrichment credits) shows the
 * same upsell toast as single-contact enrichment instead of a generic error.
 */
export function useRefreshDimension(accountId: string) {
  const qc = useQueryClient()

  return useMutation<{ dimension: RefreshDimension; remaining: number }, Error, RefreshDimension>({
    mutationKey: ['accounts', accountId, 'refreshDimension'],
    mutationFn: dimension => {
      // #2130.63 — anonyme, par écran : jamais l'accountId ni la dimension
      // choisie (une stratégie commerciale, comme un filtre).
      trackActionStarted(REFRESH_ACTION, ACCOUNT_DETAIL_SCREEN)
      return accountsApi.refreshDimension(accountId, dimension)
    },
    onSuccess: ({ dimension }) => {
      // #2130.64 — seul un rafraîchissement RÉUSSI complète (voir `onError`
      // ci-dessous : rien n'y émet, `trackActionCompleted` resterait sans
      // début connu de toute façon si on ré-essayait plus tard).
      trackActionCompleted(REFRESH_ACTION, ACCOUNT_DETAIL_SCREEN)
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
      qc.invalidateQueries({ queryKey: contactKeys.byAccount(accountId) })
      // Prefix match (userId is the 3rd segment) — a `strategy` rerun rewrites
      // the pains/angles the « Besoins » page reads.
      qc.invalidateQueries({ queryKey: ['accounts', 'needs'] })
      qc.invalidateQueries({ queryKey: ['credits'] })
      // i18n keys: refreshDimension.signals | refreshDimension.contacts | refreshDimension.entities | refreshDimension.strategy
      toast.success(
        i18n.t('accounts:toast.dimensionRefreshed', {
          dimension: i18n.t(`accounts:refreshDimension.${dimension}`),
        }),
      )
    },
    onError: err => {
      if (statusOf(err) === 402) {
        // #4464 — frein doux : aucun chiffre, un contact, jamais « recharger ».
        softBrakeToast()
        return
      }
      // 409 : cet axe est DÉJÀ à jour. Ce n'est pas une erreur, c'est un état —
      // le rendre en rouge ferait chercher une panne là où il n'y a rien à
      // réparer, et le message du serveur dit déjà quand réessayer.
      if (statusOf(err) === 409) {
        toast.info(i18n.t('accounts:toast.alreadyFresh'), { description: err.message })
        return
      }
      toast.error(err.message || i18n.t('accounts:toast.refreshError'))
    },
  })
}
