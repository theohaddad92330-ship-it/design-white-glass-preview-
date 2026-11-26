import { useQuery } from '@tanstack/react-query'
import type { OutreachEligibilityResponse, OutreachSequence } from '@bellum/contracts'
import { outreachApi, outreachKeys } from '@/features/outreach/api'
import { useSession } from '@/lib/hooks/use-session'

/** Les séquences d'outreach d'un contact (fiche contact) — ou toutes celles du
 *  workspace quand `contactId` est omis. */
export function useOutreachSequences(contactId?: string) {
  const { user } = useSession()
  return useQuery<OutreachSequence[]>({
    queryKey: outreachKeys.list(contactId),
    queryFn: () => outreachApi.list(contactId),
    enabled: !!user,
  })
}

/**
 * Lot L-B (#4165) — les exclusions à l'inscription, contact par contact, lues
 * côté serveur AVANT de créer (déjà dans une séquence active, contacté il y a
 * moins de 30 jours, opposition RGPD, compte déjà client). Tant que la réponse
 * n'est pas là, rien n'est signalé (GA-18/19) : une absence de réponse n'est
 * pas une absence d'exclusion, mais le serveur re-vérifie de toute façon à la
 * création.
 */
export function useEnrollmentEligibility(contactIds: readonly string[]) {
  const { user } = useSession()
  return useQuery<OutreachEligibilityResponse>({
    queryKey: outreachKeys.eligibility(contactIds),
    queryFn: () => outreachApi.eligibility([...contactIds]),
    enabled: !!user && contactIds.length > 0,
  })
}
