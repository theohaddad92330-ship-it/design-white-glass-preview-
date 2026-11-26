import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import type { TFunction } from 'i18next'
import { signupSchema } from '@bellum/contracts'
import { useAuth } from '@/hooks/useAuth'

// We extend the contract schema with two browser-only fields (password
// confirmation + terms acceptance) that the API doesn't care about. The schema
// is built with `t` so validation messages honor the active language.
function buildSignupFormSchema(t: TFunction<'auth'>) {
  return signupSchema
    .extend({
      confirm_password: z.string().min(1, t('signup.confirmPasswordRequired')),
      accept_terms: z.literal(true, {
        error: t('signup.acceptTermsRequired'),
      }),
    })
    .refine(data => data.password === data.confirm_password, {
      path: ['confirm_password'],
      message: t('signup.passwordsMismatch'),
    })
}

type SignupFormValues = z.infer<ReturnType<typeof buildSignupFormSchema>>

type SignupForm = ReturnType<typeof useForm<SignupFormValues>>

type UseSignupFormResult = {
  form: SignupForm
  onSubmit: () => Promise<void>
  isSubmitting: boolean
  rootError: string | null
}

const EMAIL_TAKEN_REGEX = /already registered|email.*taken|user.*exists/i

function toErrorMessage(err: unknown, emailTakenMessage: string): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (EMAIL_TAKEN_REGEX.test(raw)) {
    return emailTakenMessage
  }
  return raw
}

type SignupPayload = {
  email: string
  password: string
  firstName: string
  lastName?: string
}

export function useSignupForm(): UseSignupFormResult {
  const { t } = useTranslation('auth')
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const signupFormSchema = useMemo(() => buildSignupFormSchema(t), [t])

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupFormSchema),
    // 'onChange' so `formState.isValid` flips reactively as the user fills
    // the form — consumed by SignupForm to gate the submit button.
    mode: 'onChange',
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      password: '',
      confirm_password: '',
      accept_terms: undefined,
    },
  })

  // Wrap the call in a mutation so the rest of the auth feature stays
  // consistent and we get a single source of truth for the pending state.
  const signupMutation = useMutation({
    mutationKey: ['auth', 'signup'],
    mutationFn: ({ email, password, firstName, lastName }: SignupPayload) =>
      signUp(email, password, firstName, lastName),
    onSuccess: outcome => {
      // 200 in both branches — we dispatch on the discriminator returned by
      // the API rather than introspecting an error message.
      if (outcome.status === 'authenticated') {
        toast.success(t('signup.created'))
        navigate({ to: '/onboarding', replace: true })
      } else if (outcome.status === 'pending_email_verification') {
        toast.success(t('signup.createdVerify'))
        navigate({
          to: '/verify-email',
          search: { id: outcome.user_id, email: outcome.email },
          replace: true,
        })
      }
      // `mfa_required` is a login-only branch — signup never returns it.
    },
    onError: err => {
      const message = toErrorMessage(err, t('signup.emailTaken'))
      form.setError('root', { message })
      toast.error(message)
    },
  })

  const onSubmit = form.handleSubmit(async values => {
    await signupMutation
      .mutateAsync({
        email: values.email,
        password: values.password,
        firstName: values.first_name,
        lastName: values.last_name,
      })
      .catch(() => {
        // onError already surfaces the toast + setError. We swallow here so
        // react-hook-form's `handleSubmit` doesn't propagate the rejection
        // as an unhandled promise.
      })
  })

  return {
    form,
    onSubmit,
    isSubmitting: signupMutation.isPending,
    rootError: form.formState.errors.root?.message ?? null,
  }
}
