import { useTranslation } from 'react-i18next'
import { Text, cn } from '@bellum/ui'

type Props = {
  label?: string
  /** Background color used to "punch" the label out of the divider line. */
  background?: string
}

export function AuthDivider({ label, background }: Props) {
  const { t } = useTranslation('auth')
  const text = label ?? t('divider')
  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center">
        <div className="h-px w-full bg-[var(--bellum-border)]" />
      </div>
      <div className="relative flex justify-center">
        <Text
          element="span"
          size="xs"
          className={cn('px-3 text-[var(--bellum-text-muted)]', background ? background : 'bg-[var(--bellum-bg)]')}
        >
          {text}
        </Text>
      </div>
    </div>
  )
}
