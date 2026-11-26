import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CapabilityBanner } from '@/components/access/CapabilityBanner'
import { microsoftApi } from '@/features/microsoft/api'

type MicrosoftConnectNoticeProps = {
  /** Pourquoi la capacité manque, dit avec les mots de CET écran. */
  message: string
  /** Libellé du geste — par défaut « Connecter ta messagerie ». */
  ctaLabel?: string
}

/**
 * L'invite « connecte », côté bureautique Microsoft — le miroir de
 * {@link GoogleConnectNotice}.
 *
 * Elle demande l'URL de consentement Azure AD et fait une redirection pleine
 * page, exactement comme les cartes de Réglages › Intégrations. Affichée dans
 * les dialogues Outlook quand l'espace n'a aucun lien.
 *
 * Comme son jumeau, elle ne dessine plus son propre encadré : la forme vient du
 * bandeau de capacité partagé. Les deux copies étaient identiques au pixel, et
 * c'est précisément ce que le tome 7 interdit — « un seul bandeau de capacité »,
 * pas un par fournisseur.
 */
export function MicrosoftConnectNotice({ message, ctaLabel }: MicrosoftConnectNoticeProps) {
  const { t } = useTranslation('microsoft')
  const connect = useMutation({
    mutationFn: () => microsoftApi.connectUrl(),
    onSuccess: ({ url }) => {
      window.location.href = url
    },
    onError: () => toast.error(t('connect.error')),
  })

  return (
    <CapabilityBanner
      access={{ state: 'no_integration', missing: [] }}
      description={message}
      action={{
        label: ctaLabel ?? t('connect.cta'),
        onClick: () => connect.mutate(),
        pending: connect.isPending,
      }}
    />
  )
}
