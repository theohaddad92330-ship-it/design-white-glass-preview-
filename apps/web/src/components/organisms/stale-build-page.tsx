import { useEffect } from 'react'
import { GenericProblemMessage } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { ProblemIconCycle } from '@/components/feedback/AnimatedProblemIcons'
import { ProblemIllustration } from '@/components/feedback/ProblemIllustration'
import { recoverFromStaleBuild } from '@/lib/stale-build'

/**
 * Écran d'un onglet resté ouvert pendant un déploiement : le code demandé
 * n'existe plus sur le serveur, donc rien n'est cassé — la page est périmée.
 *
 * Le rechargement part TOUT SEUL au montage (l'utilisateur n'a rien à faire) ;
 * l'écran n'est visible qu'un instant, ou durablement si le rechargement vient
 * d'avoir lieu — auquel cas le bouton laisse la main plutôt que de boucler.
 */
export function StaleBuildPage() {
  const { t } = useTranslation('common')

  useEffect(() => {
    recoverFromStaleBuild()
  }, [])

  return (
    <GenericProblemMessage
      title={t('errorScreens.staleBuild.title')}
      principalMessage={t('errorScreens.staleBuild.message')}
      firstSubText={t('errorScreens.staleBuild.sub1')}
      secondSubText={t('errorScreens.staleBuild.sub2')}
      icon={<ProblemIconCycle className="text-[var(--bellum-text-accent)]" />}
      illustration={<ProblemIllustration />}
      buttonText={t('errorScreens.staleBuild.cta')}
      onButtonClick={() => window.location.reload()}
    />
  )
}
