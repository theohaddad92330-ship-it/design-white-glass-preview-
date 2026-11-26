import { ArrowRight } from 'lucide-react'
import { Controller } from 'react-hook-form'
import { Trans, useTranslation } from 'react-i18next'
import { Button, Checkbox, FormField, PasswordField, Text } from '@bellum/ui'
import { useSignupForm } from '@/features/auth/hooks/useSignupForm'

const WEBSITE_URL: string = import.meta.env.VITE_MARKETING_URL || 'https://bellum-ai.com'

export function SignupForm() {
  const { t } = useTranslation('auth')
  const { form, onSubmit, isSubmitting, rootError } = useSignupForm()
  const { register, control, formState } = form
  const { errors, isValid } = formState

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormField
        label={t('signup.firstNameLabel')}
        required
        error={errors.first_name?.message}
        inputProps={{
          ...register('first_name'),
          type: 'text',
          placeholder: t('signup.firstNamePlaceholder'),
          autoComplete: 'given-name',
          maxLength: 60,
          disabled: isSubmitting,
        }}
      />
      <FormField
        label={t('signup.lastNameLabel')}
        required
        error={errors.last_name?.message}
        inputProps={{
          ...register('last_name'),
          type: 'text',
          placeholder: t('signup.lastNamePlaceholder'),
          autoComplete: 'family-name',
          maxLength: 60,
          disabled: isSubmitting,
        }}
      />

      <FormField
        label={t('emailLabel')}
        required
        error={errors.email?.message}
        inputProps={{
          ...register('email'),
          type: 'email',
          placeholder: t('emailPlaceholder'),
          autoComplete: 'email',
          disabled: isSubmitting,
        }}
      />

      <PasswordField
        label={t('signup.passwordLabel')}
        required
        error={errors.password?.message}
        inputProps={{
          ...register('password'),
          placeholder: '••••••••',
          autoComplete: 'new-password',
          disabled: isSubmitting,
        }}
      />

      <PasswordField
        label={t('signup.confirmPasswordLabel')}
        required
        error={errors.confirm_password?.message}
        inputProps={{
          ...register('confirm_password'),
          placeholder: '••••••••',
          autoComplete: 'new-password',
          disabled: isSubmitting,
        }}
      />

      <div className="flex items-start gap-3 pt-1">
        <Controller
          control={control}
          name="accept_terms"
          render={({ field }) => (
            <Checkbox
              id="signup-accept-terms"
              checked={field.value === true}
              onCheckedChange={value => field.onChange(value === true)}
              onBlur={field.onBlur}
              disabled={isSubmitting}
              aria-invalid={!!errors.accept_terms}
              className="mt-0.5"
            />
          )}
        />
        <Text
          element="label"
          size="xs"
          className="text-[var(--bellum-text-secondary)] leading-relaxed"
          htmlFor="signup-accept-terms"
        >
          <Trans
            t={t}
            i18nKey="signup.terms"
            components={{
              terms: (
                <a
                  href={`${WEBSITE_URL}/cgu`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-medium text-[var(--bellum-text-accent)] transition-colors hover:text-[var(--bellum-text-accent)] dark:text-[var(--bellum-text-accent)] dark:hover:text-[var(--bellum-text-accent)]"
                />
              ),
              privacy: (
                <a
                  href={`${WEBSITE_URL}/privacy`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-medium text-[var(--bellum-text-accent)] transition-colors hover:text-[var(--bellum-text-accent)] dark:text-[var(--bellum-text-accent)] dark:hover:text-[var(--bellum-text-accent)]"
                />
              ),
            }}
          />
        </Text>
      </div>
      {errors.accept_terms?.message && (
        <Text size="sm" className="text-[var(--danger-soft-text)]">
          {errors.accept_terms.message}
        </Text>
      )}

      {rootError && (
        <Text
          element="p"
          size="sm"
          role="alert"
          className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-[var(--danger-soft-text)]"
        >
          {rootError}
        </Text>
      )}

      <Button
        type="submit"
        variant="default"
        size="default"
        fullWidth
        icon={ArrowRight}
        iconPosition="right"
        isLoading={isSubmitting}
        loadingText={t('signup.submitLoading')}
        disabled={!isValid || isSubmitting}
      >
        {t('signup.submit')}
      </Button>
    </form>
  )
}
