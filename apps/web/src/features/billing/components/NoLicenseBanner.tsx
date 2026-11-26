import { Button } from '@bellum/ui'
import { Lock } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { Banner } from '@/components/layout/Banner'
import { isWindowedPlan } from '../lib/windowedPlan'

/**
 * Ce que voit, sur l'écran de facturation, un compte SANS licence.
 *
 * Il n'y a plus d'essai gratuit (Louis, 02/09/2026). Les deux paliers qui en
 * tenaient lieu — `trial` et `decouverte` — sont à zéro crédit : ce sont
 * désormais des états verrouillés, pas des fenêtres d'évaluation. Le produit se
 * voit dans la salle de DÉMONSTRATION, sans compte ; on le travaille avec une
 * licence.
 *
 * Ce composant remplace `TrialBanner`, qui comptait des jours restants et
 * proposait « Activer l'essai 7 jours ». Le décompte annonçait un accès que le
 * quota refusait déjà — un bandeau ne doit pas promettre ce que le serveur ne
 * donne pas.
 *
 * Un seul état, donc, et un seul message : ni « il te reste N jours » (il ne
 * reste rien), ni « essai terminé » (rien n'a commencé pour un compte neuf).
 */
export const NoLicenseBanner = memo(function NoLicenseBanner({ onChoosePlan }: { onChoosePlan: () => void }) {
  const { t } = useTranslation('billing')
  const { data: credits } = useCredits()
  // Rien pour un abonnement vivant, rien non plus pour une salle de démo : elle
  // ne facture pas, lui annoncer un mur vendrait une limite qui n'existe pas.
  if (!credits || credits.is_demo === true || !isWindowedPlan(credits.plan)) return null

  return (
    <Banner
      layout="card"
      tone="danger"
      icon={Lock}
      title={t('noLicense.title')}
      actions={
        <Button size="sm" onClick={onChoosePlan}>
          {t('noLicense.cta')}
        </Button>
      }
    >
      {t('noLicense.body')}
    </Banner>
  )
})
