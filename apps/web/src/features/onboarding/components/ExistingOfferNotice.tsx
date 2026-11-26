import { Text } from '@bellum/ui'
import { BadgeCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { usePlans } from '@/features/credits/hooks/usePlans'
import { describeExistingOffer } from '@/features/onboarding/lib/existing-offer'

/**
 * « Vous êtes déjà sur <palier> » — la reconnaissance de l'offre déjà servie,
 * affichée à l'ARRIVÉE de la redirection posée par `/onboarding/plan`.
 *
 * Le garde de `/onboarding/plan` saute l'écran de choix pour un compte déjà
 * servi (essai en cours, plan payant, siège d'un espace payant, compte bêta) :
 * sans ce message le commercial traverse un écran qui disparaît sans raison.
 * On choisit de le dire ICI plutôt que de rendre l'écran de choix en lecture :
 * c'est le chemin le moins bavard — zéro écran de plus, zéro clic de plus, la
 * phrase arrive là où l'utilisateur se trouve vraiment.
 *
 * Rien n'est recopié en dur : le NOM vient du catalogue opérateur live
 * (`GET /credits/plans`, pour qu'un renommage en backoffice atteigne l'écran) et
 * les QUOTAS du serveur (le plafond réellement appliqué, recharge comprise).
 * Crédits inconnus (lecture en échec) ⇒ rien du tout, jamais un palier supposé.
 */
export function ExistingOfferNotice() {
  const { t } = useTranslation('onboarding')
  const { data: credits } = useCredits()
  const { data: catalog } = usePlans()

  const offer = describeExistingOffer(credits, catalog)
  if (!offer) return null

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3"
    >
      <BadgeCheck className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-accent)]" />
      <div className="min-w-0">
        <Text element="p" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('existingOffer.title', { plan: offer.planLabel })}
        </Text>
        <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
          {t('existingOffer.carryOn')}
        </Text>
        {offer.isSeat && (
          <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
            {t('existingOffer.seat')}
          </Text>
        )}
      </div>
    </div>
  )
}
