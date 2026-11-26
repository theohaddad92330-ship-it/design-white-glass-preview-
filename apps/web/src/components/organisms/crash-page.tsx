import { GenericProblemMessage } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { ProblemIconCycle } from '@/components/feedback/AnimatedProblemIcons'
import { ProblemIllustration } from '@/components/feedback/ProblemIllustration'
import { SupportReferenceNote } from '@/components/feedback/SupportReferenceNote'

export function CrashPage() {
  const { t } = useTranslation('common')
  return (
    <GenericProblemMessage
      title={t('errorScreens.crash.title')}
      principalMessage={t('errorScreens.crash.message')}
      firstSubText={t('errorScreens.crash.sub1')}
      secondSubText={t('errorScreens.crash.sub2')}
      icon={<ProblemIconCycle className="text-[var(--bellum-text-accent)]" />}
      illustration={<ProblemIllustration />}
      footer={<SupportReferenceNote />}
      buttonText={t('errorScreens.crash.cta')}
      onButtonClick={() => window.location.reload()}
    />
  )
}
