import type { SimilarityReason } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { Text } from '@bellum/ui'
import { describeSimilarAxes } from '@/features/accounts/model/similarProximity'

/**
 * #2040.18 — LA LIGNE DES AXES D'UNE SUGGESTION DE COMPTE.
 *
 * « Même secteur que tes cibles · non évalué : ta zone, la taille visée — tu ne
 * l'as pas encore renseigné ». Une seule ligne, lue par la carte de compte ET
 * par le panneau « Similaires » de Découvrir : les deux écrans montraient le
 * même objet, et seul l'un des deux nommait ses axes. La dérivation vit dans
 * `describeSimilarAxes`, le libellé ici (GA-26) — un second écran qui la
 * réécrirait divergerait au premier axe ajouté.
 *
 * Muette quand il n'y a RIEN à nommer (réponse d'API antérieure aux champs) :
 * une ligne vide ne dit rien de plus qu'une ligne absente.
 */
export function SimilarAxesText({
  reasons,
  unevaluated,
  className,
}: {
  reasons?: readonly SimilarityReason[]
  unevaluated?: readonly SimilarityReason[]
  className?: string
}) {
  const { t } = useTranslation('accounts')
  const axes = describeSimilarAxes(reasons, unevaluated)
  if (axes.matched.length === 0 && axes.unevaluated.length === 0) return null

  const parts = [
    // i18n keys: sidebar.similarReason.sector | .geo | .size
    ...axes.matched.map(reason => t(`sidebar.similarReason.${reason}`)),
    ...(axes.unevaluated.length > 0
      ? [
          t('sidebar.similarUnevaluated', {
            // i18n keys: sidebar.similarAxis.sector | .geo | .size
            axes: axes.unevaluated.map(reason => t(`sidebar.similarAxis.${reason}`)).join(', '),
          }),
        ]
      : []),
  ]

  return (
    <Text size="xs" data-testid="similar-axes" className={className ?? 'text-[var(--bellum-text-muted)]'}>
      {parts.join(' · ')}
    </Text>
  )
}
