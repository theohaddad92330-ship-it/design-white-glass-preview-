import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import type { FirstAnalysisSuggestion } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { AskLaura } from '@/components/primitives/AskLaura'
import { useFirstName } from '@/hooks/useFirstName'
import { useValidateProfileContext } from '@/features/profile-context/hooks/useValidateProfileContext'
import { firstAnalysisSuggestionId } from '@/features/profile-context/lib/firstAnalysisSuggestion'

type ValidateContextStatusProps = {
  /** `null` = jamais validé, ou une réédition des réponses a retiré la
   *  validation (`profile-context.service.ts`, `triggerGeneration`). */
  validatedAt: string | null
  /** #2010.1/.17 — tranché par Louis 22/09 soir (decisions-louis-22-09-soir.md
   *  §1) : `true` quand ce résultat IA remplace une version antérieure et
   *  n'a pas encore été validé (voir `lib/revision-review-state.ts`) — la
   *  première génération d'un compte ne porte jamais ce signal. */
  isPendingReview?: boolean
  /** #2075.27/.28 — LA MÊME donnée que `FirstAnalysisSuggestionsGrid`
   *  (`welcomeSummary.firstAnalysisSuggestions`, GA-26 : une dérivation vit à
   *  un seul endroit). Vide = aucun compte à proposer, jamais une fiche
   *  inventée pour occuper la carte. */
  firstAnalysisSuggestions?: readonly FirstAnalysisSuggestion[]
  /** #2075.27/.28 — l'action de la semaine déjà calculée par
   *  `buildWeeklyPriority` (`lib/audit-priority.ts`), un TEXTE, jamais une
   *  probabilité. `null` = rien à prioriser encore. */
  weeklyPriorityAction?: string | null
}

/**
 * #2075.B / D9 — décision Louis 14/09/2026 : valider le contexte commercial.
 *
 * Le clic EST la décision (geste utilisateur = auto-approuvé) : PAS de
 * confirmation modale, à la différence de « Régénérer » à côté. La réponse
 * du serveur (`useValidateProfileContext().data`) prime sur la prop dès
 * qu'elle existe — l'écran passe à « Validé le … » au clic, sans attendre un
 * second aller-retour de `GET /profile-context/me`.
 */
export function ValidateContextStatus({
  validatedAt,
  isPendingReview = false,
  firstAnalysisSuggestions = [],
  weeklyPriorityAction = null,
}: ValidateContextStatusProps) {
  const { t, i18n } = useTranslation('commercialAudit')
  const firstName = useFirstName()
  const validate = useValidateProfileContext()

  const effectiveValidatedAt = validate.data?.validatedAt ?? validatedAt
  // #2075.25 — le message de remerciement de Laura n'est vrai qu'à
  // l'INSTANT de la validation (la réponse de LA mutation, dans cette
  // session) : un contexte déjà validé avant ce montage (rechargement,
  // revisite) ne le réaffiche jamais, ce n'est plus « maintenant ».
  const justValidated = validate.data != null

  if (effectiveValidatedAt) {
    const parsed = new Date(effectiveValidatedAt)
    const date = Number.isNaN(parsed.getTime())
      ? effectiveValidatedAt
      : parsed.toLocaleDateString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' })
    const [firstSuggestion] = firstAnalysisSuggestions
    return (
      <div className="space-y-1">
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {firstName ? t('validate.statusWithName', { date, name: firstName }) : t('validate.status', { date })}
        </Text>
        {justValidated && (
          <Text element="p" size="sm" weight="medium">
            {firstName ? t('validate.thankYouWithName', { name: firstName }) : t('validate.thankYou')}
          </Text>
        )}
        {/* #2075.24/.27/.28 — ONBOARDING : LAURA PREND LE RELAIS APRÈS
            VALIDATION. Rebranchement sur des mécanismes déjà là (épopée
            #2774 les exclut explicitement) : `AskLaura` reste la SEULE porte
            vers une conversation (D44), et chaque choix ouvre un parcours
            RÉEL — jamais un lien mort ni une donnée inventée. */}
        {justValidated && (
          <div className="space-y-1.5 pt-2" data-testid="validate-handoff">
            <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('validate.handoff.intro')}
            </Text>
            <AskLaura
              label={t('validate.handoff.lauraLabel')}
              question={
                weeklyPriorityAction
                  ? t('validate.handoff.lauraQuestion', { action: weeklyPriorityAction })
                  : t('validate.handoff.lauraQuestionGeneric')
              }
              variant="inline"
            />
            {firstSuggestion && (
              <Link
                to="/search"
                search={{
                  company: firstSuggestion.companyName,
                  suggestionId: firstAnalysisSuggestionId(firstSuggestion),
                  suggestionReason: firstSuggestion.reason,
                }}
                data-testid="validate-handoff-account"
                className="inline-flex items-center text-sm text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11"
              >
                {t('validate.handoff.account', { company: firstSuggestion.companyName })}
              </Link>
            )}
            <Link
              to="/consultants"
              search={{ availability: 'immediate' }}
              data-testid="validate-handoff-consultant"
              className="inline-flex items-center text-sm text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11"
            >
              {t('validate.handoff.consultant')}
            </Link>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {/* #2010.1/.17 — un résultat IA qui remplace une version antérieure
          n'est pas encore la vérité : la revue se dit AVANT le bouton,
          jamais un silence qui laisserait croire que rien n'a changé. */}
      {isPendingReview && (
        <Text
          element="p"
          size="xs"
          data-testid="validate-pending-review"
          className="text-[var(--bellum-text-secondary)]"
        >
          {t('validate.pendingReview')}
        </Text>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="pointer-coarse:min-h-11"
        isLoading={validate.isPending}
        onClick={() => validate.mutate()}
      >
        {t('validate.cta')}
      </Button>
      {validate.isError && (
        <Text element="p" size="xs" role="alert" className="text-[var(--danger-soft-text)]">
          {validate.error.message}
        </Text>
      )}
    </div>
  )
}
