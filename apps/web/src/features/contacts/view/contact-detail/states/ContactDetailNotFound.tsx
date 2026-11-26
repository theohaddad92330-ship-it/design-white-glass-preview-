import { GenericProblemMessage } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { ProblemIconCycle } from '@/components/feedback/AnimatedProblemIcons'
import { ProblemIllustration } from '@/components/feedback/ProblemIllustration'

export function ContactDetailNotFound() {
  const { t } = useTranslation('contacts')
  return (
    <GenericProblemMessage
      className="!bg-transparent"
      title={t('notFound.title')}
      principalMessage={t('notFound.principal')}
      firstSubText={t('notFound.sub1')}
      secondSubText={t('notFound.sub2')}
      icon={<ProblemIconCycle className="text-[var(--bellum-text-accent)]" />}
      illustration={<ProblemIllustration />}
      onButtonClick={() => window.history.go(-1)}
      buttonText={t('notFound.button')}
    />
  )
}
