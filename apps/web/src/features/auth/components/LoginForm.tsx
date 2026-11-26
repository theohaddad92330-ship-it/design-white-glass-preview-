import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, FormField, PasswordField, Text } from '@bellum/ui'
import { useLoginForm } from '@/features/auth/hooks/useLoginForm'

type LoginFormProps = {
  /** Bubble up the pending 2FA token so the card can show the code step. */
  onMfaRequired?: (mfaToken: string) => void
}

// #3563.4bis (recette prod 09/10, G02.1) — 80 ms fixes suffisaient à l'autoremplissage
// NATIF de Chrome (mesuré à 20 ms) mais pas à un GESTIONNAIRE DE MOTS DE PASSE
// (extension), qui peut écrire le mot de passe plusieurs centaines de ms après le
// clic — le clic soumettait alors un mot de passe encore vide, et il fallait
// cliquer une SECONDE fois une fois le champ rempli. On attend désormais par
// PETITS PAS, jusqu'à ce que les deux champs soient remplis ou que le plafond
// soit atteint — un seul clic couvre le cas rapide (20 ms) ET le cas lent
// (jusqu'à `AUTOFILL_MAX_WAIT_MS`).
const AUTOFILL_POLL_MS = 80
const AUTOFILL_MAX_WAIT_MS = 560

export function LoginForm({ onMfaRequired }: LoginFormProps) {
  const { t } = useTranslation('auth')
  const { form, onSubmit, isSubmitting, rootError } = useLoginForm({ onMfaRequired })
  const { register, formState } = form
  const { errors } = formState

  // #3563.4 — l'autoremplissage du navigateur pose les valeurs dans le DOM SANS
  // évènement `input` tant que la personne n'a pas fait de geste : react-hook-form
  // ne les connaît pas. On relit les champs au moment de soumettre, puis on valide.
  const syncFromDom = (formEl: HTMLFormElement): boolean => {
    const data = new FormData(formEl)
    let allFilled = true
    for (const name of ['email', 'password'] as const) {
      const value = data.get(name)
      if (typeof value !== 'string') continue
      if (value === '') allFilled = false
      if (value !== form.getValues(name)) form.setValue(name, value)
    }
    return allFilled
  }
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.persist?.()
    const formEl = event.currentTarget
    let waited = 0
    while (!syncFromDom(formEl) && waited < AUTOFILL_MAX_WAIT_MS) {
      event.preventDefault()
      await new Promise(resolve => setTimeout(resolve, AUTOFILL_POLL_MS))
      waited += AUTOFILL_POLL_MS
    }
    return onSubmit(event)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <FormField
        label={t('emailLabel')}
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
        label={t('login.passwordLabel')}
        error={errors.password?.message}
        inputProps={{
          ...register('password'),
          placeholder: '••••••••',
          autoComplete: 'current-password',
          disabled: isSubmitting,
        }}
      />

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

      <div className="flex items-center justify-between">
        <Link
          to="/forgot-password"
          className="text-xs font-medium text-[var(--bellum-text-secondary)] transition-colors hover:text-[var(--bellum-text-primary)]"
        >
          {t('login.forgotPassword')}
        </Link>
      </div>

      <Button
        type="submit"
        variant="violet"
        size="default"
        fullWidth
        icon={ArrowRight}
        iconPosition="right"
        isLoading={isSubmitting}
        loadingText={t('login.submitLoading')}
        disabled={isSubmitting}
      >
        {t('login.submit')}
      </Button>
    </form>
  )
}
