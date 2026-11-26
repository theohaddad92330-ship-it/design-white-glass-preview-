import { useTranslation } from 'react-i18next'
import { Button } from '@bellum/ui'
import { GoogleIcon } from './GoogleIcon'

type Props = {
  onClick: () => void
  disabled?: boolean
  isLoading?: boolean
}

export function GoogleSignInButton({ onClick, disabled, isLoading = false }: Props) {
  const { t } = useTranslation('auth')
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      isLoading={isLoading}
      variant="outline"
      size="default"
      fullWidth
      iconPosition="left"
      className="border-[var(--bellum-border)] bg-[var(--bellum-bg)] text-[var(--bellum-text-primary)] hover:bg-[var(--bellum-surface-2)]"
    >
      <GoogleIcon className="h-4 w-4 mr-2" />
      {t('google.continue')}
    </Button>
  )
}
