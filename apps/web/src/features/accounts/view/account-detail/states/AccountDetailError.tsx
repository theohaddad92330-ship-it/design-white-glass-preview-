import { GenericProblemMessage } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { ProblemIconCycle } from '@/components/feedback/AnimatedProblemIcons'
import { ProblemIllustration } from '@/components/feedback/ProblemIllustration'

type AccountDetailErrorProps = {
  message?: string
}

export function AccountDetailError(_props: AccountDetailErrorProps) {
  const { t } = useTranslation('accounts')
  return (
    <GenericProblemMessage
      className="!max-h-[10dvh] h-48 !overflow-hidden !bg-transparent"
      title={t('notFound.title')}
      principalMessage={t('notFound.message')}
      firstSubText={t('notFound.hint1')}
      secondSubText={t('notFound.hint2')}
      icon={<ProblemIconCycle className="text-[var(--bellum-text-accent)]" />}
      illustration={<ProblemIllustration />}
      onButtonClick={() => {
        window.history.go(-1)
      }}
      buttonText={t('notFound.back')}
    />
  )
}
