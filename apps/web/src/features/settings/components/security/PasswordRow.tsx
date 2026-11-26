import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SettingsRow,
} from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useResetPassword } from '@/features/auth/hooks/useResetPassword'
import { useSession } from '@/lib/hooks/use-session'

/**
 * « Mot de passe · Changer » (maquette `settings-compte`, bloc « Ta session »). Le geste est celui qui existait sur le
 * profil : un lien de réinitialisation part vers l'adresse de connexion — la fenêtre le DIT avant d'envoyer, au lieu
 * de demander deux mots de passe qu'aucune route ne sait appliquer.
 */
export function PasswordRow() {
  const { t } = useTranslation('settings', { keyPrefix: 'security' })
  const { t: tCommon } = useTranslation('common')
  const { user } = useSession()
  const resetPassword = useResetPassword()
  const [open, setOpen] = useState(false)
  const email = user?.email ?? ''

  const send = async (): Promise<void> => {
    if (!email) return
    try {
      await resetPassword.mutateAsync(email)
      toast.success(t('passwordSent'))
      setOpen(false)
    } catch {
      toast.error(t('passwordSendFailed'))
    }
  }

  return (
    <>
      <SettingsRow
        title={t('passwordTitle')}
        description={t('passwordDescription')}
        trailing={
          <Button variant="outline" size="sm" className="pointer-coarse:min-h-11" onClick={() => setOpen(true)}>
            {t('passwordChange')}
          </Button>
        }
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={tCommon('actions.close')} className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('passwordDialogTitle')}</DialogTitle>
            <DialogDescription>{t('passwordDialogDescription', { email })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={() => setOpen(false)}>
              {tCommon('actions.cancel')}
            </Button>
            <Button
              variant="violet"
              className="min-h-11"
              isLoading={resetPassword.isPending}
              disabled={!email || resetPassword.isPending}
              onClick={() => void send()}
            >
              {t('passwordSend')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
