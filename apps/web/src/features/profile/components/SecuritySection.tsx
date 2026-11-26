import { Button, SettingsRow } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { Loader2 } from 'lucide-react'
import { memo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useResetPassword } from '@/features/auth/hooks/useResetPassword'

type SecuritySectionProps = {
  email: string
}

export const SecuritySection = memo<SecuritySectionProps>(function SecuritySection({ email }) {
  const { t } = useTranslation('profile')
  const resetPassword = useResetPassword()

  const handleResetPassword = useCallback(async () => {
    if (!email) return
    try {
      await resetPassword.mutateAsync(email)
      toast.success(t('security.toast.resetSent'))
    } catch {
      toast.error(t('security.errors.sendFailed'))
    }
  }, [email, resetPassword, t])

  return (
    <SettingsBlock label={t('security.title')} description={t('security.description')}>
      <SettingsRow
        title={t('security.passwordTitle')}
        description={t('security.passwordDescription')}
        trailing={
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetPassword}
            disabled={resetPassword.isPending || !email}
          >
            {resetPassword.isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
                {t('security.sending')}
              </>
            ) : (
              t('security.changePassword')
            )}
          </Button>
        }
      />
    </SettingsBlock>
  )
})
