import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { CreateIntroductionAuthorization, IntroductionAuthorizationItem } from '@bellum/contracts'
import { contactKeys, contactsApi } from '@/features/contacts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #2373.9 — les preuves d'autorisation d'introduction déjà obtenues pour ce
 * contact, les plus récentes d'abord (même ordre que côté serveur).
 */
export function useIntroductionAuthorizations(contactId: string) {
  const { user } = useSession()
  return useQuery<IntroductionAuthorizationItem[]>({
    queryKey: contactKeys.introductionAuthorizations(contactId),
    queryFn: () => contactsApi.getIntroductionAuthorizations(contactId),
    enabled: !!user && contactId.length > 0,
    staleTime: 30_000,
  })
}

/**
 * Consigner une autorisation (ou un refus) — jamais une correction : chaque
 * geste ajoute une ligne d'audit, aucune méthode ne les retire (même
 * doctrine que `useRecordContactStop`).
 */
export function useRecordIntroductionAuthorization(contactId: string) {
  const { t } = useTranslation('contacts')
  const queryClient = useQueryClient()

  return useMutation<IntroductionAuthorizationItem, Error, CreateIntroductionAuthorization>({
    mutationFn: body => contactsApi.recordIntroductionAuthorization(contactId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contactKeys.introductionAuthorizations(contactId) })
      toast.success(t('warmIntro.recorded'))
    },
    onError: () => toast.error(t('warmIntro.recordFailed')),
  })
}
