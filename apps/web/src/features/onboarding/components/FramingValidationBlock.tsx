import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button, Checkbox, Text } from '@bellum/ui'
import { useCompleteOnboarding, useOnboardingState } from '@/features/onboarding/hooks/useOnboarding'
import { useFraming, useValidateFraming } from '@/features/onboarding/hooks/useFraming'
import { framingDigest } from '@/features/onboarding/lib/framing-readout'
import { missingEssentials } from '@/features/onboarding/lib/missing-essentials'
import type { ReviewEditTarget } from '@/features/onboarding/lib/onboarding-review-blocks'
import { missingAnswerLinks, missingKeysOf } from '@/features/onboarding/lib/required-answers'
import { formatDate } from '@/lib/locale'
import { useOnboardingStore } from '@/stores/onboardingStore'

/**
 * Théo O onboarding-relecture.N2/N3/R5 — la case de validation explicite et la
 * sortie vers le lancement. Valider n'autorise NI accès à de nouvelles données, NI dépenses,
 * NI envois — et l'écran le dit. Une réponse modifiée après la validation
 * change l'empreinte : la case se redemande.
 *
 * Le brouillon pour Laura et la première sélection de comptes n'apparaissent
 * qu'APRÈS la validation (`FramingLaunch`, onboarding-lancement) : voir du concret
 * est la suite de la relecture, pas un préalable à la case. Le lancement est
 * l'écran SUIVANT, sur la même adresse (`onLaunch`) ; un cadrage déjà validé
 * le rouvre d'un clic.
 *
 * `onCorrect` (« Corriger une réponse ») mène à la première question modifiable.
 *
 * #4817 — CE QUI BLOQUE SE NOMME. Avant ce lot, une complétion refusée affichait
 * « il manque encore des réponses essentielles » sans en nommer UNE et sans y
 * renvoyer : le cadrage de VERHELIA était validé, l'espace restait fermé, et
 * l'utilisateur bouclait entre la relecture et le cadrage (le `catch` jetait le
 * corps de la 400, où l'API les nommait déjà). Désormais la liste est DÉRIVÉE du
 * même contrat que la porte serveur (`missingEssentials`), affichée AVANT tout
 * clic, et chaque réponse manquante ouvre d'un clic la sous-étape qui la pose
 * (`onGoToQuestion`). Rien ne manque ⇒ aucune ligne, aucun blocage.
 */
export function FramingValidationBlock({
  onLaunch,
  onCorrect,
  onGoToQuestion,
}: {
  onLaunch: () => void
  onCorrect: (() => void) | null
  onGoToQuestion: (target: ReviewEditTarget) => void
}) {
  const { t } = useTranslation('onboarding')
  const answers = useOnboardingStore(s => s.answers)
  const statuses = useOnboardingStore(s => s.statuses)
  const { data: state } = useOnboardingState()
  const { data: framing } = useFraming()
  const validate = useValidateFraming()
  const complete = useCompleteOnboarding()
  const [digest, setDigest] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState<{ kind: 'validate' } | { kind: 'complete'; missing: string[] | null } | null>(null)

  useEffect(() => {
    let active = true
    void framingDigest(answers).then(next => {
      if (active) setDigest(next)
    })
    return () => {
      active = false
    }
  }, [answers])

  const validatedForThis = framing?.validated_digest !== null && framing?.validated_digest === digest
  const validatedBefore = framing?.validated_at != null && !validatedForThis
  const busy = validate.isPending || complete.isPending
  // #4817 — la MÊME porte que le serveur (`TEMPS1_REQUIRED_KEYS`), et la garde
  // #4158.12 : à un membre qui attend son administrateur, on ne nomme que ses
  // clés PERSONNELLES — l'API ignorerait les autres.
  const missing = missingEssentials(answers, { awaitingCompanyAdmin: state?.awaiting_company_admin != null, statuses })
  // #4817 — après un refus, le serveur NOMME ses clés manquantes. Celles que la liste
  // ci-dessus nomme déjà n'apparaissent pas deux fois ; seules celles qu'elle ignorait
  // (écart client/serveur, #4875) se relient dans l'alerte.
  const serverMissing = error?.kind === 'complete' ? (error.missing ?? []) : []
  const links = missingAnswerLinks(serverMissing.filter(key => !missing.some(item => item.key === key)))

  const submit = async (): Promise<void> => {
    if (!digest) return
    setError(null)
    try {
      await validate.mutateAsync(digest)
    } catch {
      setError({ kind: 'validate' })
      return
    }
    try {
      if (state?.status !== 'completed') await complete.mutateAsync()
    } catch (cause) {
      // #4817 — le serveur NOMME les réponses manquantes ; tout autre échec ne prétend pas qu'il en manque.
      setError({ kind: 'complete', missing: missingKeysOf(cause) })
      return
    }
    // Le lancement s'ouvre : le brouillon pour Laura, jamais envoyé.
    onLaunch()
  }

  return (
    <section
      aria-labelledby="first-exchange-title"
      data-testid="review-validation"
      className="space-y-5 rounded-card border border-[var(--bellum-accent-line)] bg-[var(--bellum-surface-1)] p-6"
    >
      <div className="space-y-1">
        <Text element="h2" size="xl" weight="semibold" id="first-exchange-title">
          {t('framingReview.validateHeading')}
        </Text>
      </div>

      {validatedForThis && framing?.validated_at && (
        <Text element="p" size="sm" className="text-[var(--success-soft-text)]">
          {t('framingReview.validatedAt', { date: formatDate(framing.validated_at) ?? '' })}
        </Text>
      )}
      {validatedBefore && (
        <Text element="p" size="sm" className="text-[var(--warning-soft-text)]">
          {t('framingReview.validatedStale')}
        </Text>
      )}

      <label className="flex items-start gap-3">
        <Checkbox checked={checked} onCheckedChange={value => setChecked(value === true)} className="mt-1" />
        <span className="space-y-1">
          <Text element="span" size="sm" weight="medium" className="block">
            {t('framingReview.validateLabel')}
          </Text>
          <Text element="span" size="xs" className="block text-[var(--bellum-text-muted)]">
            {t('framingReview.validateNotice')}
          </Text>
        </span>
      </label>

      {/* #4817 — ce qui bloque l'ouverture de l'espace, NOMMÉ et relié. Une liste
          vide ne rend AUCUNE ligne (GA-18/GA-19) : rien ne manque, rien ne bloque. */}
      {missing.length > 0 && (
        <div data-testid="framing-missing-essentials" className="space-y-2">
          <Text element="p" size="sm" className="text-[var(--warning-soft-text)]">
            {t('framingReview.missingHeading')}
          </Text>
          <ul className="space-y-1">
            {missing.map(({ key, labelKey, target, declared }) => {
              const label = labelKey ? t(labelKey) : key
              // #4875.1 — l'état assumé se NOMME à côté de la question ; il n'invente aucune valeur.
              const name = declared
                ? t('framingReview.missingDeclared', {
                    question: label,
                    status: t(`framingReview.declared.${declared}`),
                  })
                : label
              return (
                <li key={key}>
                  {target ? (
                    <Button
                      type="button"
                      variant="plain"
                      size="sm"
                      className="h-auto justify-start whitespace-normal text-left pointer-coarse:min-h-11"
                      onClick={() => onGoToQuestion(target)}
                    >
                      {name}
                    </Button>
                  ) : (
                    // Le catalogue ne porte pas cette question : on la NOMME quand même
                    // plutôt que de la taire, sans promettre un renvoi qu'on n'a pas.
                    <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
                      {name}
                    </Text>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {error?.kind === 'validate' && (
        <Text element="p" role="alert" size="sm" className="text-[var(--danger-soft-text)]">
          {t('framingReview.validateError')}
        </Text>
      )}
      {error?.kind === 'complete' && (links.length > 0 || serverMissing.length === 0) && (
        <div role="alert" className="space-y-2">
          <Text element="p" size="sm" className="text-[var(--danger-soft-text)]">
            {links.length > 0 ? t('framingReview.completeMissing') : t('framingReview.completeError')}
          </Text>
          {links.length > 0 && state?.id ? (
            <ul className="space-y-1 text-sm">
              {links.map(link => (
                <li key={link.key}>
                  <Link
                    to="/onboarding/$id/$stage/$slug"
                    params={{ id: state.id, stage: link.stageCode, slug: link.slug }}
                    className="text-[var(--bellum-text-accent)] underline underline-offset-2"
                  >
                    {t(link.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          // #4875.3 — une relecture qui NOMME un manque interdit de déclarer le cadrage complet.
          disabled={!checked || !digest || busy || missing.length > 0}
          isLoading={busy}
          loadingText={t('framingReview.validating')}
          onClick={() => void submit()}
        >
          <ArrowRight aria-hidden="true" className="mr-2 h-4 w-4" />
          {t('framingReview.validateCta')}
        </Button>
        {validatedForThis && (
          <Button type="button" variant="soft" onClick={onLaunch}>
            {t('framingReview.openLaunch')}
          </Button>
        )}
        {onCorrect && (
          <Button type="button" variant="plain" onClick={onCorrect}>
            {t('framingReview.correct')}
          </Button>
        )}
      </div>
    </section>
  )
}
