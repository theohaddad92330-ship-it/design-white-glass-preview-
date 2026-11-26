import { useNavigate } from '@tanstack/react-router'
import { GenericProblemMessage } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { ProblemIconCycle } from '@/components/feedback/AnimatedProblemIcons'
import { ProblemIllustration } from '@/components/feedback/ProblemIllustration'
import { SupportReferenceNote } from '@/components/feedback/SupportReferenceNote'

export function Unauthorized({ message }: { message?: string }) {
  const { t } = useTranslation('common')
  const navigate = useNavigate()

  return (
    <GenericProblemMessage
      title={t('errorScreens.unauthorized.title')}
      principalMessage={message ?? t('errorScreens.unauthorized.message')}
      firstSubText={t('errorScreens.unauthorized.sub1')}
      icon={<ProblemIconCycle className="text-[var(--bellum-text-accent)]" />}
      illustration={<ProblemIllustration />}
      footer={<SupportReferenceNote />}
      buttonText={t('errorScreens.unauthorized.cta')}
      onButtonClick={() => navigate({ to: '/login' })}
    />
  )
}
