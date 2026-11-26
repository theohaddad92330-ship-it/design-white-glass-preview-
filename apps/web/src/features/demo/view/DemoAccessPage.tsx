import { motion } from 'framer-motion'
import { Controller } from 'react-hook-form'
import { Trans, useTranslation } from 'react-i18next'
import { Badge, Button, FormField, SelectField, Text, type SelectFieldOption } from '@bellum/ui'
import { AccessShell } from '@/features/auth/components/AccessShell'
import { AuthBrandingPanel } from '@/features/auth/components/AuthBrandingPanel'
import { DEMO_LEAD_JOB_TITLES, useDemoAccessForm } from '@/features/demo/hooks/useDemoAccessForm'

const WEBSITE_URL: string = import.meta.env.VITE_MARKETING_URL || 'https://bellum-ai.com'

/**
 * #2705 — le formulaire obligatoire entre « Lancer la démo » et la démo.
 *
 * Contenu et disposition inchangés par rapport à `/demo` (même coque, même
 * en-tête de page hors carte, même panneau de marque) : c'est une étape de plus dans le MÊME
 * parcours, pas un nouvel écran à réapprendre.
 *
 * `reason` — constat production du 27/09/2026 : `RedirectTo` renvoie ici,
 * plutôt que vers `/login`, un visiteur dont la session de démonstration est
 * tombée (401, appareil révoqué, jeton expiré). `reason="expired"` (posé par
 * `/demo_/acces.tsx` depuis `?reason=expired`) le DIT au lieu de laisser un
 * formulaire muet réapparaître sans explication.
 */
export function DemoAccessPage({ token, reason }: { token: string | undefined; reason?: 'expired' }) {
  const { t } = useTranslation('common')
  const { form, onSubmit, isSubmitting, rootError, successFirstName, preparing, slowWait, waitedSeconds } =
    useDemoAccessForm(token)
  const { register, control, formState } = form
  const { errors, isValid } = formState

  const jobTitleOptions: SelectFieldOption[] = DEMO_LEAD_JOB_TITLES.map(value => ({
    value,
    label: t(`demo.entry.form.jobTitleOptions.${value}`),
  }))

  // Inscription démo : la page défile (retour prospect 29/09)
  return (
    <AccessShell
      kicker={t('demo.entry.kicker')}
      status={successFirstName ? undefined : <Badge variant="warning">{t('demo.entry.badge.demo')}</Badge>}
      title={
        successFirstName
          ? t('demo.entry.form.successTitle', { firstName: successFirstName })
          : t('demo.entry.form.title')
      }
      lead={successFirstName ? undefined : t('demo.entry.form.subtitle')}
      // Maquette `demo.html` #demo-formulaire : « session expirée » dit au-dessus de la carte, dans le bandeau `.ob23-info`.
      notice={
        reason === 'expired' && !successFirstName ? (
          <Text element="p" size="sm" role="status" className="text-[var(--warning-soft-text)]">
            {t('demo.entry.form.sessionExpiredNotice')}
          </Text>
        ) : undefined
      }
      aside={<AuthBrandingPanel />}
    >
      <div className="w-full max-w-xl">
        {!successFirstName && (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label={t('demo.entry.form.firstNameLabel')}
                required
                error={errors.firstName?.message}
                inputProps={{
                  ...register('firstName'),
                  type: 'text',
                  placeholder: t('demo.entry.form.firstNamePlaceholder'),
                  autoComplete: 'given-name',
                  maxLength: 120,
                  disabled: isSubmitting,
                }}
              />
              <FormField
                label={t('demo.entry.form.lastNameLabel')}
                required
                error={errors.lastName?.message}
                inputProps={{
                  ...register('lastName'),
                  type: 'text',
                  placeholder: t('demo.entry.form.lastNamePlaceholder'),
                  autoComplete: 'family-name',
                  maxLength: 120,
                  disabled: isSubmitting,
                }}
              />
            </div>
            <FormField
              label={t('demo.entry.form.emailLabel')}
              required
              error={errors.email?.message}
              inputProps={{
                ...register('email'),
                type: 'email',
                placeholder: t('demo.entry.form.emailPlaceholder'),
                autoComplete: 'email',
                disabled: isSubmitting,
              }}
            />

            <div className="flex flex-col gap-2">
              <Text element="label" size="sm" weight="medium" htmlFor="demo-access-job-title">
                {t('demo.entry.form.jobTitleLabel')}
                <Text element="span" className="text-[var(--danger-soft-text)]">
                  {' '}
                  *
                </Text>
              </Text>
              <Controller
                control={control}
                name="jobTitle"
                render={({ field }) => (
                  <SelectField
                    id="demo-access-job-title"
                    value={field.value}
                    onChange={field.onChange}
                    options={jobTitleOptions}
                    ariaLabel={t('demo.entry.form.jobTitleLabel')}
                    placeholder={t('demo.entry.form.jobTitlePlaceholder')}
                    disabled={isSubmitting}
                  />
                )}
              />
              {errors.jobTitle?.message && (
                <Text size="sm" role="alert" className="text-[var(--danger-soft-text)]">
                  {errors.jobTitle.message}
                </Text>
              )}
            </div>

            <FormField
              label={t('demo.entry.form.companyLabel')}
              required
              error={errors.company?.message}
              inputProps={{
                ...register('company'),
                type: 'text',
                placeholder: t('demo.entry.form.companyPlaceholder'),
                autoComplete: 'organization',
                maxLength: 200,
                disabled: isSubmitting,
              }}
            />

            <FormField
              label={t('demo.entry.form.phoneLabel')}
              helperText={t('demo.entry.form.phoneOptionalHint')}
              error={errors.phone?.message}
              inputProps={{
                ...register('phone'),
                type: 'tel',
                autoComplete: 'tel',
                maxLength: 40,
                disabled: isSubmitting,
              }}
            />

            <Text
              element="p"
              size="xs"
              className="border-t border-[var(--bellum-border)] pt-4 text-[var(--bellum-text-secondary)]"
            >
              {t('demo.entry.form.footnote')}
            </Text>

            <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
              <Trans
                t={t}
                i18nKey="demo.entry.form.consent"
                components={{
                  privacy: (
                    <a
                      href={`${WEBSITE_URL}/privacy`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-medium text-[var(--bellum-text-accent)] underline underline-offset-4"
                    />
                  ),
                }}
              />
            </Text>

            {rootError && (
              <Text
                element="p"
                size="sm"
                role="alert"
                className="rounded-control bg-[var(--danger-soft-bg)] px-3 py-2 text-[var(--danger-soft-text)]"
              >
                {rootError}
              </Text>
            )}

            <Button
              type="submit"
              variant="default"
              size="default"
              fullWidth
              isLoading={isSubmitting}
              disabled={!isValid || isSubmitting}
            >
              {t('demo.entry.form.submit')}
            </Button>
            {isSubmitting && (
              <div role="status" className="flex flex-col gap-2 text-center">
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t(preparing || slowWait ? 'demo.entry.form.preparing' : 'demo.entry.form.preparingRoom')}
                </Text>
                {/* #3578.3 — dès que l'attente dépasse ~3 s : une progression, jamais un bouton figé. */}
                {(preparing || slowWait) && (
                  <>
                    {/* #3666 (Louis 13/10, « étapes, pas de % ») — une seule requête sans
                            étapes : barre INDÉTERMINÉE, aucune valeur. Le temps attendu, lui, est mesuré. */}
                    <div
                      role="progressbar"
                      aria-busy="true"
                      aria-label={t('demo.entry.form.progressLabel')}
                      className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bellum-border)]"
                    >
                      <motion.div
                        className="h-full w-1/3 rounded-full bg-primary"
                        animate={{ x: ['-100%', '300%'] }}
                        transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
                      />
                    </div>
                    <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                      {t('demo.entry.form.waited', { count: waitedSeconds })}
                    </Text>
                  </>
                )}
              </div>
            )}
          </form>
        )}

        <a
          href="/login"
          className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]"
        >
          {t('demo.entry.backToLogin')}
        </a>
      </div>
    </AccessShell>
  )
}
