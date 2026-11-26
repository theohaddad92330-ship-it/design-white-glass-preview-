import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
} from '@bellum/ui'
import { useConfirmEmailChange, useRequestEmailChange } from '@/features/profiles/hooks/useChangeEmail'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentEmail: string
  /** Server-side pending change. When set, the dialog opens straight at the
   *  verify step so a page reload can't bypass OTP confirmation. */
  pendingNewEmail?: string | null
}

type Step = { kind: 'request' } | { kind: 'verify'; newEmail: string }

export function ChangeEmailDialog({ open, onOpenChange, currentEmail, pendingNewEmail }: Props) {
  const { t } = useTranslation('profile')
  const [step, setStep] = useState<Step>(() =>
    pendingNewEmail ? { kind: 'verify', newEmail: pendingNewEmail } : { kind: 'request' },
  )

  const handleOpenChange = (next: boolean): void => {
    if (!next && !pendingNewEmail) setStep({ kind: 'request' }) // reset on close, unless pending forces verify
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('email.changeEmail')}</DialogTitle>
          <DialogDescription>{t('email.dialogDescription')}</DialogDescription>
        </DialogHeader>

        {step.kind === 'request' ? (
          <RequestForm
            currentEmail={currentEmail}
            onSent={newEmail => setStep({ kind: 'verify', newEmail })}
            onCancel={() => handleOpenChange(false)}
          />
        ) : (
          <VerifyForm
            newEmail={step.newEmail}
            onConfirmed={() => handleOpenChange(false)}
            onBack={() => setStep({ kind: 'request' })}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function RequestForm({
  currentEmail,
  onSent,
  onCancel,
}: {
  currentEmail: string
  onSent: (newEmail: string) => void
  onCancel: () => void
}) {
  const { t } = useTranslation('profile')
  const [newEmail, setNewEmail] = useState('')
  const request = useRequestEmailChange()
  const trimmed = newEmail.trim().toLowerCase()
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed !== currentEmail.toLowerCase()

  const onSubmit = async (): Promise<void> => {
    try {
      await request.mutateAsync({ new_email: trimmed })
      toast.success(t('email.toast.codeSent', { email: trimmed }))
      onSent(trimmed)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('email.errors.sendFailed'))
    }
  }

  return (
    <>
      <div className="space-y-2">
        <Text element="p" size="sm" weight="medium" className="text-[color:var(--text-primary)]">
          {t('email.newEmailLabel')}
        </Text>
        <Input
          type="email"
          autoFocus
          value={newEmail}
          onChange={e => setNewEmail(e.target.value)}
          placeholder={t('email.emailPlaceholder')}
          maxLength={120}
        />
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('email.currentEmail', { email: currentEmail })}
        </Text>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={request.isPending}>
          {t('common:actions.cancel')}
        </Button>
        <Button
          type="button"
          variant="violet"
          isLoading={request.isPending}
          loadingText={t('email.sending')}
          disabled={!valid || request.isPending}
          onClick={onSubmit}
        >
          {t('email.sendCode')}
        </Button>
      </DialogFooter>
    </>
  )
}

function VerifyForm({
  newEmail,
  onConfirmed,
  onBack,
}: {
  newEmail: string
  onConfirmed: () => void
  onBack: () => void
}) {
  const { t } = useTranslation('profile')
  const [otp, setOtp] = useState('')
  const confirm = useConfirmEmailChange()
  const trimmed = otp.trim()
  const valid = trimmed.length >= 4

  const onSubmit = async (): Promise<void> => {
    try {
      await confirm.mutateAsync({ new_email: newEmail, otp: trimmed })
      toast.success(t('email.toast.updated'))
      onConfirmed()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('email.errors.invalidCode'))
    }
  }

  return (
    <>
      <div className="space-y-2">
        <Text element="p" size="sm" weight="medium" className="text-[color:var(--text-primary)]">
          {t('email.otpLabel')}
        </Text>
        <Input autoFocus value={otp} onChange={e => setOtp(e.target.value)} placeholder="ABC123" maxLength={12} />
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('email.codeSentHint', { email: newEmail })}
        </Text>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onBack} disabled={confirm.isPending}>
          {t('email.changeAddress')}
        </Button>
        <Button
          type="button"
          variant="violet"
          isLoading={confirm.isPending}
          loadingText={t('email.verifying')}
          disabled={!valid || confirm.isPending}
          onClick={onSubmit}
        >
          {t('common:actions.confirm')}
        </Button>
      </DialogFooter>
    </>
  )
}
