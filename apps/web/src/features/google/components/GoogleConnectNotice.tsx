import { accessLevelToRequest, type OAuthAccessLevel } from '@bellum/contracts'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CapabilityBanner } from '@/components/access/CapabilityBanner'
import { googleApi } from '@/features/google/api'
import { useGoogleStatus } from '@/features/google/hooks/useGoogleStatus'

type GoogleConnectNoticeProps = {
  /** Pourquoi la capacité manque, dit avec les mots de CET écran. */
  message: string
  /** Libellé du geste — par défaut « Connecter ta messagerie ». */
  ctaLabel?: string
  /** #2078.23 — le niveau dont l'écran a besoin : `read` pour lire, `read_write` pour écrire. */
  level: OAuthAccessLevel
}

/**
 * L'invite « connecte / reconnecte », dans un dialogue qui a besoin d'un outil.
 *
 * Elle demande l'URL de consentement et fait une redirection pleine page (le
 * même geste que les cartes de Réglages › Intégrations). Affichée quand l'espace
 * n'a aucun lien, ou en a un dont les portées accordées ne couvrent pas la
 * fonction — se reconnecter élargit l'accord.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A CHANGÉ — elle ne dessine plus son propre encadré
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce composant et son jumeau côté Microsoft étaient deux encadrés identiques au
 * pixel, écrits deux fois, et le produit en comptait onze de la même famille. Le
 * bandeau de capacité (`components/access/CapabilityBanner`) dit exactement cela
 * et il était monté deux fois dans tout le produit. La forme vient donc de lui ;
 * ce qui reste ici est ce qu'il ne peut pas savoir : QUEL fournisseur relancer.
 *
 * Trois choses gagnées au passage, qu'aucune des deux copies n'avait : un titre,
 * une icône d'état, et un bouton qui garde son nom pendant l'attente — sans quoi
 * un lecteur d'écran annonce un bouton désactivé sans jamais dire lequel.
 */
export function GoogleConnectNotice({ message, ctaLabel, level }: GoogleConnectNoticeProps) {
  const { t } = useTranslation('google')
  const { data: status } = useGoogleStatus()
  // #2078.23 — le niveau dont CET écran a besoin, sans rétrograder une connexion
  // en écriture ni élever une connexion en lecture sans geste d'écriture.
  const granted = status?.connected ? (status.accessLevel ?? null) : null
  const connect = useMutation({
    mutationFn: () => googleApi.connectUrl(accessLevelToRequest(granted, level)),
    onSuccess: ({ url }) => {
      window.location.href = url
    },
    onError: () => toast.error(t('connect.error')),
  })

  return (
    <CapabilityBanner
      // `missing` reste vide : la capacité est déjà nommée par `message`, et la
      // répéter en dessous serait la même phrase deux fois.
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
