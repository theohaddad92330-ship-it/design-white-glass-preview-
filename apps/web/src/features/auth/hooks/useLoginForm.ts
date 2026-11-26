import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { loginSchema, type Login } from '@bellum/contracts'
import { useAuth } from '@/hooks/useAuth'

const INVALID_CREDENTIALS_REGEX = /invalid login|invalid credentials|identifiants/i

function toErrorMessage(err: unknown, invalidMessage: string): string {
  const raw = err instanceof Error ? err.message : String(err)
  return INVALID_CREDENTIALS_REGEX.test(raw) ? invalidMessage : raw
}

type UseLoginFormOptions = {
  /** Called when the password is correct but the account has 2FA enabled — the
   *  caller swaps in the code-entry step with the returned short-lived token. */
  onMfaRequired?: (mfaToken: string) => void
}

export function useLoginForm({ onMfaRequired }: UseLoginFormOptions = {}) {
  const { t } = useTranslation('auth')
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const form = useForm<Login>({
    resolver: zodResolver(loginSchema),
    // 'onChange' so `formState.isValid` flips reactively as the user fills
    // the form — consumed by LoginForm to gate the submit button.
    mode: 'onChange',
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = form.handleSubmit(async ({ email, password }) => {
    try {
      const outcome = await signIn(email, password)
      if (outcome.status === 'pending_email_verification') {
        // Email was created but never verified. The API has already
        // re-issued a fresh OTP; we just route to /verify-email so the user
        // can complete the activation step.
        toast.info(t('login.pendingVerification'))
        navigate({
          to: '/verify-email',
          search: { id: outcome.user_id, email: outcome.email },
          replace: true,
        })
        return
      }
      if (outcome.status === 'mfa_required') {
        // Password OK, but 2FA is on: no session yet. Hand the pending token
        // up so the card can show the 6-digit code step.
        onMfaRequired?.(outcome.mfaToken)
      }
      // 'authenticated' → session applied in the manager; useRedirectAfterAuth
      // handles navigation. Nothing to do here.
    } catch (err) {
      const message = toErrorMessage(err, t('login.invalidCredentials'))
      form.setError('root', { message })
      toast.error(message)
    }
  })

  return {
    form,
    onSubmit,
    isSubmitting: form.formState.isSubmitting,
    rootError: form.formState.errors.root?.message ?? null,
  }
}
