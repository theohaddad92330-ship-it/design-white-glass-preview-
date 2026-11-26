import { Text, TYPE_SCALE, cn } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { FigureScope } from '@/components/primitives/FigureScope'
import { useCommercialObjectives } from '../../hooks/useCommercialObjectives'

/**
 * « Le verdict » — la phrase en tête du cockpit qui répond « je travaille
 * bien mon portefeuille » (#1404, rôle posé par `PersonalCockpit.tsx:24-38`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE BLOC NE FAIT JAMAIS (#2114.13/.28/.29)
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun écart, aucun pourcentage d'atteinte, aucune probabilité — ce terrain
 * est déjà tranché HORS scope par le lot FA (`CommercialObjectivesCard.tsx`,
 * `member-objective.ts:151-152`) : « aucune probabilité, le lecteur fait la
 * soustraction ». Le verdict CITE sa mesure (cible + réalisé de l'axe CA, la
 * trajectoire financière la plus lue) plutôt que de la juger — même principe
 * que #2114.15 (garde `c26_probabilite`), étendu ici comme prévu par sa ligne
 * de registre.
 *
 * #2114.14 — si l'axe CA n'a pas de cible fixée, le funnel est incomplet : le
 * verdict dit qu'il ne peut pas encore mesurer, jamais un chiffre à moitié.
 *
 * #2114.66 — posé en tête du cockpit (`PersonalCockpit.tsx`, avant
 * `PersonalKpiRow`) pour porter le rôle de recul avant les compteurs.
 *
 * #2114.70 — le jeton `--bellum-text-accent` (D79/GA-33 : le seul violet
 * texte du dépôt, un pas par thème), jamais une nuance fixe.
 *
 * Même masquage que `CommercialObjectivesCard` (`isError` → rien, la feature
 * `manager_cockpit` n'est simplement pas portée par cet espace).
 */
export function TrajectoryVerdict() {
  const { t, i18n } = useTranslation('dashboard')
  const { data, isSuccess, isError } = useCommercialObjectives()

  if (isError || !isSuccess || !data) return null

  const revenue = data.objectives.find(objective => objective.axis === 'revenue')
  if (!revenue) return null

  const month = formatMonth(data.period_month, i18n.language)

  if (revenue.target === null) {
    return (
      <div role="status" className="flex flex-wrap items-center justify-between gap-2">
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('perspective.verdict.notMeasurable', { month })}
        </Text>
        <Link
          to="/pilotage"
          className="text-xs font-medium text-[var(--bellum-text-accent)] hover:underline pointer-coarse:min-h-11 pointer-coarse:inline-flex pointer-coarse:items-center"
        >
          {t('perspective.verdict.notMeasurableCta')}
        </Link>
      </div>
    )
  }

  const target = euros(revenue.target, i18n.language)

  // #3777 — un réalisé NON mesuré (`null`) n'est pas « 0 € facturés » : la
  // phrase cite la cible et nomme l'absence. Un vrai zéro (0) reste « 0 € ».
  if (revenue.achieved === null) {
    return (
      <Text element="p" className={cn(TYPE_SCALE.sectionTitle, 'text-[var(--bellum-text-secondary)]')}>
        {t('perspective.verdict.achievedNotMeasured', { target, month })}
      </Text>
    )
  }

  const achieved = euros(revenue.achieved, i18n.language)

  return (
    <div>
      <Text element="p" className={cn(TYPE_SCALE.sectionTitle, 'text-[var(--bellum-text-accent)]')}>
        {t('perspective.verdict.measured', { achieved, target, month })}
      </Text>
      {/* #4298.2 — le réalisé est lu sur les affaires signées du mois. */}
      <FigureScope scope={{ period: { kind: 'month', month }, sources: ['deals'] }} />
    </div>
  )
}

function euros(value: number, language: string): string {
  return new Intl.NumberFormat(language, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)
}

function formatMonth(periodMonth: string, language: string): string {
  const date = new Date(`${periodMonth}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return periodMonth
  return new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
}
