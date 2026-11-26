import type { AccountVerdict } from '@bellum/contracts'
import { namedAccountVerdict, PLAN_STALE_DAYS } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { useHasOfferObjective } from '@/features/profile/hooks/useEsnProfile'
import type { ConfidenceTier } from '../evaluation/evaluationViewData'
import type { DossierAxisView } from '../evaluation/dossierReadViewData'
import { BADGE_COLORS } from './BadgeColorScore'

/**
 * BEL-SC-232 (#3261, P0) — L'EN-TÊTE DE DÉCISION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE TICKET DEMANDE, ET CE QU'IL REÇOIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le ticket liste HUIT champs (« verdict / catégorie Focus-Sprint-Watch-No-Go /
 * intérêt / pénétrabilité / confiance / meilleure route / prochaine action /
 * date de revue »). Sept sont servis ; six le sont par des lectures qui
 * existent déjà ailleurs sur ce même dossier — cette carte les RASSEMBLE en
 * tête de page, elle ne recalcule rien (GA-26 : un réglage/une dérivation vit
 * à un seul endroit) :
 *
 *  · verdict + catégorie → LE MÊME champ (règle #3249.4 : jamais une deuxième
 *    qualification concurrente). Le ticket nomme quatre catégories
 *    (Focus/Sprint/Watch/No-Go) qui recouvriraient exactement ce que
 *    `namedAccountVerdict` porte déjà en cinq (AGIR MAINTENANT / QUALIFIER /
 *    RÉSERVE / METTRE EN VEILLE / ÉCARTER POUR CET OBJECTIF), affiché sur ce
 *    même dossier par `BellumReadCard`. Tranché sans Louis (règle de méthode
 *    de l'écrivain d'épopées) : reformulé vers le badge existant plutôt
 *    qu'une seconde taxonomie qui divergerait de la première le jour où l'une
 *    des deux apprend une exception.
 *  · intérêt → l'axe `potentiel_commercial` du score en sept axes (#2118),
 *    déjà calculé, déjà traduit (`dossierRead.axis.potentiel_commercial`).
 *  · pénétrabilité → l'axe `accessibilite` du même score (« peut-on atteindre
 *    un décideur » — la définition du ticket, mot pour mot).
 *  · confiance → `dossierReliability`/`confidenceTier`, déjà affichés par
 *    `BellumReadCard` sous le score.
 *  · meilleure route → `bestEntryPoint.label`, à défaut `accessPath`
 *    (`dossier_read`, déjà rendus par `DossierEntryPointCard`/
 *    `DossierAccessPathCard`, repliés plus bas dans la page).
 *  · prochaine action → `nextAction.label`, à défaut `immediateActionLabel`
 *    (`overview`), déjà rendus par `NextActionCard` (carte d'action supprimée, #3720).
 *
 * Le huitième champ, LA DATE DE REVUE (#3261.9, reste de #3293) : aucune
 * cadence de revue n'existe dans le corpus méthode. `PLAN_STALE_DAYS` (90 j,
 * `packages/contracts/src/schemas/first-move.ts`) EST déjà la cadence
 * canonique du dépôt pour « ce dossier a besoin d'être revu » — c'est le seuil
 * qui déclenche le sixième déclencheur de rafraîchissement, `dossier_stale`
 * (`account-refresh-triggers.ts`). La réutiliser ici (GA-26 : un réglage vit à
 * un seul endroit) plutôt qu'inventer une seconde cadence. Suggérée =
 * dernière analyse + 90 j ; absente tant qu'aucune analyse n'a jamais
 * complété (jamais une date devinée sur un dossier jamais analysé).
 *
 * Chaque valeur est `null`/`undefined`-tolérante : un dossier ancien qui n'a
 * pas encore la lecture en sept axes affiche « Non mesuré » sur chaque champ
 * concerné plutôt qu'un zéro qui mentirait (GA-18/19).
 */
type AccountDecisionHeaderProps = {
  verdictFamily: AccountVerdict | null
  hasNoGoTrigger: boolean
  interestAxis: DossierAxisView | null
  penetrabilityAxis: DossierAxisView | null
  dossierReliability: number | null
  confidenceTier: ConfidenceTier | null
  bestRouteLabel: string | null
  nextActionLabel: string | null
  /** ISO, la date de la dernière analyse COMPLÉTÉE — `null` sur un dossier
   *  jamais analysé (`lastAnalyzedDate(account)`, déjà la lecture canonique). */
  lastAnalyzedAt: string | null
}

function suggestedReviewDate(lastAnalyzedAt: string | null): Date | null {
  if (!lastAnalyzedAt) return null
  const analyzed = new Date(lastAnalyzedAt)
  if (Number.isNaN(analyzed.getTime())) return null
  return new Date(analyzed.getTime() + PLAN_STALE_DAYS * 24 * 60 * 60 * 1000)
}

function AxisValue({ axis, unknownLabel }: { axis: DossierAxisView | null; unknownLabel: string }) {
  if (!axis || axis.state === 'unknown' || axis.value == null) {
    return (
      <Text size="sm" className="text-[var(--bellum-text-muted)]">
        {unknownLabel}
      </Text>
    )
  }
  return (
    <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
      {axis.value}/5
    </Text>
  )
}

export function AccountDecisionHeader({
  verdictFamily,
  hasNoGoTrigger,
  interestAxis,
  penetrabilityAxis,
  dossierReliability,
  confidenceTier,
  bestRouteLabel,
  nextActionLabel,
  lastAnalyzedAt,
}: AccountDecisionHeaderProps) {
  const { t } = useTranslation('accountDetail')
  // #3818 — un STOP sans déclencheur ne dit « ÉCARTER POUR CET OBJECTIF » que
  // si l'espace a réellement renseigné un domaine d'offre à juger. Appelé
  // avant tout retour anticipé (règle des hooks).
  const hasObjective = useHasOfferObjective()

  // Rien à décider encore : un dossier jamais analysé n'a ni verdict, ni axe,
  // ni route — l'en-tête se tait plutôt que d'afficher sept champs vides.
  if (verdictFamily === null && interestAxis === null && penetrabilityAxis === null && bestRouteLabel === null) {
    return null
  }

  const badge = verdictFamily ? namedAccountVerdict(verdictFamily, hasNoGoTrigger, { hasObjective }) : null
  const badgeClassName = verdictFamily ? BADGE_COLORS[verdictFamily].badge : null
  const confidenceNonEvaluable = confidenceTier === 'non_evaluable'

  const fields: { label: string; content: ReactNode }[] = [
    {
      label: t('decisionHeader.interest'),
      content: <AxisValue axis={interestAxis} unknownLabel={t('dossierRead.axisState.unknown')} />,
    },
    {
      label: t('decisionHeader.penetrability'),
      content: <AxisValue axis={penetrabilityAxis} unknownLabel={t('dossierRead.axisState.unknown')} />,
    },
    {
      label: t('decisionHeader.confidence'),
      content:
        dossierReliability != null && !confidenceNonEvaluable ? (
          <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {dossierReliability}/100
          </Text>
        ) : (
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('score.dossierReliabilityNonEvaluable')}
          </Text>
        ),
    },
    {
      label: t('decisionHeader.bestRoute'),
      content: (
        <Text
          size="sm"
          weight="semibold"
          className={bestRouteLabel ? 'text-[var(--bellum-text-primary)]' : 'text-[var(--bellum-text-muted)]'}
        >
          {bestRouteLabel ?? t('decisionHeader.bestRouteUnknown')}
        </Text>
      ),
    },
    {
      label: t('decisionHeader.nextAction'),
      content: (
        <Text
          size="sm"
          weight="semibold"
          className={nextActionLabel ? 'text-[var(--bellum-text-primary)]' : 'text-[var(--bellum-text-muted)]'}
        >
          {nextActionLabel ?? t('decisionHeader.nextActionUnknown')}
        </Text>
      ),
    },
  ]

  const reviewDate = suggestedReviewDate(lastAnalyzedAt)
  if (reviewDate) {
    fields.push({
      label: t('decisionHeader.reviewDate'),
      content: (
        <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {formatDate(reviewDate.toISOString())}
        </Text>
      ),
    })
  }

  return (
    <div
      data-testid="account-decision-header"
      className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Text element="h2" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('decisionHeader.title')}
        </Text>
        {badge && badgeClassName ? (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeClassName}`}>{badge}</span>
        ) : (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('decisionHeader.noVerdict')}
          </Text>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        {fields.map(field => (
          <div key={field.label} className="min-w-0">
            <Text size="xs" className="block text-[var(--bellum-text-muted)]">
              {field.label}
            </Text>
            {field.content}
          </div>
        ))}
      </div>
    </div>
  )
}
