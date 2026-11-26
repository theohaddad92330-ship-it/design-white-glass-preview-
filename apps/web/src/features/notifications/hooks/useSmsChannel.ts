import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  smsChannelSettingsSchema,
  smsChannelWithoutNumber,
  type SmsChannelSettings,
  type UpdateSmsTypeOptIns,
} from '@bellum/contracts'
import { useSession } from '@/lib/hooks/use-session'
import { notificationsApi } from '@/features/notifications/api'

const SMS_CHANNEL_KEY = ['notification-sms-channel'] as const

/**
 * Le canal SMS des alertes urgentes — #1938.4, décision Louis 13/09 batch 13.
 *
 * Une requête À PART de `useNotificationPreferences`, et c'est voulu : celle-là
 * est montée sur chaque écran par la barre latérale ; un numéro de téléphone
 * n'a rien à faire sur ce chemin. Celle-ci ne vit que dans Réglages ›
 * Notifications.
 *
 * La réponse est relue par le contrat : un corps illisible devient une ERREUR
 * affichée, jamais un canal « vide » déduit d'un objet qui n'en est pas un.
 */
export function useSmsChannel() {
  const { user } = useSession()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: SMS_CHANNEL_KEY,
    queryFn: async () => smsChannelSettingsSchema.parse(await notificationsApi.getSmsChannel()),
    enabled: !!user,
    staleTime: 60_000,
    retry: false,
  })

  const store = (data: SmsChannelSettings) => queryClient.setQueryData(SMS_CHANNEL_KEY, data)

  const startVerification = useMutation({
    mutationFn: (phone: string) => notificationsApi.startSmsVerification(phone),
    onSuccess: store,
  })
  const confirmVerification = useMutation({
    mutationFn: (code: string) => notificationsApi.confirmSmsVerification(code),
    onSuccess: store,
  })
  const updateTypes = useMutation({
    mutationFn: (patch: UpdateSmsTypeOptIns) => notificationsApi.updateSmsTypes(patch),
    onSuccess: store,
  })
  const withdraw = useMutation({
    mutationFn: () => notificationsApi.withdrawSms(),
    onSuccess: () => {
      // Le retrait ne change pas ce que le canal PEUT faire, seulement ce qu'il
      // sait de la personne : on garde l'état, on efface le reste.
      const previous = queryClient.getQueryData<SmsChannelSettings>(SMS_CHANNEL_KEY)
      if (previous) store(smsChannelWithoutNumber(previous.status))
    },
  })

  return {
    settings: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    startVerification,
    confirmVerification,
    updateTypes,
    withdraw,
  }
}
