import { useNavigate } from '@tanstack/react-router'
import { GenericProblemMessage } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { ProblemIconCycle } from '@/components/feedback/AnimatedProblemIcons'
import { ProblemIllustration } from '@/components/feedback/ProblemIllustration'
import { SupportReferenceNote } from '@/components/feedback/SupportReferenceNote'

export function NotFound({ message }: { message?: string }) {
  const { t } = useTranslation('common')
  const navigate = useNavigate()

  return (
    <GenericProblemMessage
      title={t('errorScreens.notFound.title')}
      principalMessage={message ?? t('errorScreens.notFound.message')}
      firstSubText={t('errorScreens.notFound.sub1')}
      icon={<ProblemIconCycle className="text-[var(--bellum-text-accent)]" />}
      illustration={<ProblemIllustration />}
      footer={<SupportReferenceNote />}
      buttonText={t('errorScreens.notFound.cta')}
      onButtonClick={() => navigate({ to: '/' })}
    />
  )
}
