import { GenericProblemMessage } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { ProblemIconCycle } from '@/components/feedback/AnimatedProblemIcons'
import { ProblemIllustration } from '@/components/feedback/ProblemIllustration'
import { SupportReferenceNote } from '@/components/feedback/SupportReferenceNote'

export function TemporaryFailureScreen() {
  const { t } = useTranslation('common')
  return (
    <GenericProblemMessage
      title={t('errorScreens.temporaryFailure.title')}
      principalMessage={t('errorScreens.temporaryFailure.message')}
      firstSubText={t('errorScreens.temporaryFailure.sub1')}
      secondSubText={t('errorScreens.temporaryFailure.sub2')}
      icon={<ProblemIconCycle className="text-[var(--bellum-text-accent)]" />}
      illustration={<ProblemIllustration />}
      footer={<SupportReferenceNote />}
      buttonText={t('actions.retry')}
      onButtonClick={() => window.location.reload()}
    />
  )
}
