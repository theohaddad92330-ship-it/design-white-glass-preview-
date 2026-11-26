import type { CommercialObjective, CommercialObjectiveAxis } from '@bellum/contracts'
import { Text, TYPE_SCALE, cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { FigureScope } from '@/components/primitives/FigureScope'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { useCommercialObjectives } from '../../hooks/useCommercialObjectives'

/**
 * « Mes objectifs commerciaux » — les SEPT objectifs nommés du lot FA
 * (#2114.16 à .27, décision de Louis du 18/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA RECETTE DU 18/09 A MESURÉ, ET QUE CE BLOC RÉPARE
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun objectif n'existait nulle part — ni ici, ni `/pilotage`, ni les
 * réglages. `TrajectoryCard`, juste au-dessus, montre déjà Pipe / Missions /
 * Facturé BRUTS, sans aucune cible en regard. Ce bloc ajoute la cible : sept
 * lignes, toujours les sept, cible + réalisé + période + couverture — jamais
 * d'écart ni de pourcentage d'atteinte (#2114.28/.29 sont HORS scope de ce
 * lot, aucune probabilité, refusée six fois).
 *
 * ⚠️ LA DÉFINITION DE CHAQUE OBJECTIF (libellé, unité) VIT DANS
 * `packages/contracts` (`COMMERCIAL_OBJECTIVE_AXES`), PAS ICI (GA-26) : cet
 * écran ne fait que lire `axis` et traduire.
 *
 * ⚠️ MASQUÉ tant que la requête n'a pas abouti — même patron que
 * `ObjectivesPanel` (cockpit manager) : `/objectives/*` demande la feature de
 * plan `manager_cockpit`, et un espace qui ne la porte pas ne doit voir ni
 * zéro ni erreur, juste l'absence du bloc.
 */
export function CommercialObjectivesCard() {
  const { t, i18n } = useTranslation('dashboard')
  const { data, isSuccess } = useCommercialObjectives()

  if (!isSuccess || !data) return null

  return (
    <section
      aria-label={t('perspective.objectives.title')}
      className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text element="h2" className={cn(TYPE_SCALE.sectionTitle, 'text-[var(--bellum-text-primary)]')}>
          {t('perspective.objectives.title')}
        </Text>
        {/* #4298.2 — la période ET la source, par le composant unique : le
            réalisé se lit sur les affaires et les actions du mois. */}
        <FigureScope
          scope={{
            period: { kind: 'month', month: formatMonth(data.period_month, i18n.language) },
            sources: ['deals', 'bellum'],
          }}
        />
      </div>

      <ul className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.objectives.map(objective => (
          <ObjectiveRow key={objective.axis} objective={objective} language={i18n.language} />
        ))}
      </ul>
    </section>
  )
}

function ObjectiveRow({ objective, language }: { objective: CommercialObjective; language: string }) {
  const { t } = useTranslation('dashboard')
  const { axis, target, achieved, coverage } = objective

  return (
    <li className="min-w-0">
      <Text size="xs" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
        {t(`perspective.objectives.axis.${axis}`)}
      </Text>

      <div className="mt-1 flex items-baseline gap-1.5">
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('perspective.objectives.target')}
        </Text>
        {target === null ? (
          <UnknownValue reason={t('perspective.objectives.targetNotSet')} />
        ) : (
          <Text size="sm" weight="medium" className="tabular-nums text-[var(--bellum-text-primary)]">
            {formatAxisValue(axis, target, language, t)}
          </Text>
        )}
      </div>

      <div className="mt-0.5 flex items-baseline gap-1.5">
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('perspective.objectives.achieved')}
        </Text>
        {achieved === null ? (
          <UnknownValue reason={t('perspective.objectives.achievedUnknownMargin')} />
        ) : (
          <Text className={cn(TYPE_SCALE.keyFigure, 'text-[var(--bellum-text-primary)]')}>
            {formatAxisValue(axis, achieved, language, t)}
          </Text>
        )}
      </div>

      {/* La couverture des données — #2114.27 : ce qu'on ne sait pas se NOMME,
          jamais laissé invisible dans un réalisé agrégé. */}
      <Text size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
        {coverage.measured === coverage.total
          ? t('perspective.objectives.coverageFull')
          : t('perspective.objectives.coveragePartial', { measured: coverage.measured, total: coverage.total })}
      </Text>
    </li>
  )
}

function formatAxisValue(
  axis: CommercialObjectiveAxis,
  value: number,
  language: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (axis === 'revenue') {
    const amount = new Intl.NumberFormat(language, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(value)
    return t('perspective.objectives.unit.revenue', { amount })
  }
  if (axis === 'margin') {
    return t('perspective.objectives.unit.margin', { percent: Math.round(value * 10) / 10 })
  }
  return t(`perspective.objectives.unit.${axis}`, { count: Math.round(value) })
}

function formatMonth(periodMonth: string, language: string): string {
  const date = new Date(`${periodMonth}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return periodMonth
  return new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
}
