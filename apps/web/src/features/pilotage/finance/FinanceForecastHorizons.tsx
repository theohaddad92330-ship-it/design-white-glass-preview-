import {
  FORECAST_HORIZONS,
  managerView,
  type ForecastDecision,
  type ForecastHorizon,
  type HorizonForecast,
  type Money,
} from '@bellum/contracts'
import { Card, FilterChips, SelectField, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { formatCents } from '@/lib/money'
import { useForecastHorizons } from '../api'

/**
 * #2425 — LE PRÉVISIONNEL PAR HORIZON, sur `/pilotage/finance`.
 *
 * Il ne remplace pas les trois lignes « acquis / probable / espéré » du panneau
 * Finance : il les ÉTEND à quatre horizons et les déplie du carnet au cash.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AUCUNE PROBABILITÉ (`c26_probabilite`, refusé six fois)
 * ─────────────────────────────────────────────────────────────────────────
 * Un scénario est une SOMME de composantes classées par statut déclaré, et il
 * écrit ses hypothèses sous son montant. La confiance d'une composante nomme sa
 * BASE et ses trois axes (contrat, source, historique) — jamais un pourcentage.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA VUE MANAGER : cinq lignes, choisies — jamais imposées par le rôle
 * ─────────────────────────────────────────────────────────────────────────
 * c76 — le rôle change l'ORDRE, jamais le CONTENU. La vue manager est donc un
 * CHOIX de lecture offert à tous : les cinq décisions qui pèsent le plus, et le
 * compte de celles qui attendent dans la vue complète. Rien n'est retiré.
 */

const DECISION_ROUTES: Record<ForecastDecision, string> = {
  secureRenewal: '/missions',
  unblockMission: '/missions',
  accelerateInvoicing: '/missions/facturation',
  chaseOverdue: '/missions/encaissements',
  resolveDispute: '/missions/encaissements',
  completePipeline: '/pilotage/pipe',
  staffBench: '/projects/needs',
}

type View = 'full' | 'manager'

export function FinanceForecastHorizons() {
  const { t } = useTranslation('pilotage')
  const [horizon, setHorizon] = useState<ForecastHorizon>('month')
  const [view, setView] = useState<View>('full')
  const forecast = useForecastHorizons(horizon)

  return (
    <Card className="mt-6 p-4">
      <Text size="sm" weight="semibold">
        {t('finance.forecastHorizons.title')}
      </Text>
      <Text size="xs" className="mt-0.5 block text-[var(--bellum-text-muted)]">
        {t('finance.forecastHorizons.hint')}
      </Text>

      <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="flex items-center gap-2">
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('finance.forecastHorizons.horizonLabel')}
          </Text>
          <SelectField
            value={horizon}
            onChange={next => setHorizon(next as ForecastHorizon)}
            options={FORECAST_HORIZONS.map(value => ({
              value,
              label: t(`finance.forecastHorizons.horizons.${value}`),
            }))}
            size="sm"
          />
        </label>
        {/* GA-249 — une rangée de CHOIX passe par le composant partagé. */}
        <FilterChips
          size="sm"
          ariaLabel={t('finance.forecastHorizons.viewLabel')}
          options={(['full', 'manager'] as const).map(option => ({
            value: option,
            label: t(`finance.forecastHorizons.view.${option}`),
          }))}
          value={view}
          onChange={next => {
            if (next === 'full' || next === 'manager') setView(next)
          }}
        />
      </div>

      <div className="mt-4">
        <ForecastHorizonsBody
          forecast={forecast.data ?? null}
          loading={forecast.isLoading}
          failed={forecast.isError}
          view={view}
        />
      </div>
    </Card>
  )
}

/**
 * ⚠️ EXPORTÉE — `MissionCockpitKpiTiles.tsx` (#2408.64/.65) la réutilise TELLE
 * QUELLE pour rendre les mêmes montants sur le cockpit missions : un second
 * formateur ferait diverger le jour où la convention « `null` = non mesuré »
 * change (GA-26).
 */
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export function Amounts({ amounts, quiet = false }: { amounts: Money[] | null; quiet?: boolean }) {
  // #3483 — `quiet` : le bloc dit l'absence UNE fois (légende), la cellule n'écrit qu'un tiret.
  if (amounts === null) return <UnknownValue bare={quiet} />
  return <>{amounts.map(entry => formatCents(entry.amountCents, entry.currency)).join(' · ')}</>
}

export function ForecastHorizonsBody({
  forecast,
  loading,
  failed,
  view,
}: {
  forecast: HorizonForecast | null
  loading: boolean
  failed: boolean
  view: View
}) {
  const { t } = useTranslation('pilotage')
  const muted = 'text-[var(--bellum-text-muted)]'

  if (loading) {
    return (
      <Text size="xs" className={muted}>
        {t('loading')}
      </Text>
    )
  }
  if (failed || !forecast) {
    return (
      <Text size="xs" className={muted}>
        {t('finance.unavailable')}
      </Text>
    )
  }

  const decisions =
    view === 'manager' ? managerView(forecast.decisions) : { shown: forecast.decisions, hidden: [], folded: 0 }

  const decisionList = (
    <section aria-labelledby="forecast-decisions">
      <Text id="forecast-decisions" size="xs" weight="semibold" className="block uppercase tracking-wide">
        {t('finance.forecastHorizons.decisions.title')}
      </Text>
      {decisions.shown.length === 0 ? (
        <Text size="xs" className={`mt-1 block ${muted}`}>
          {t('finance.forecastHorizons.decisions.empty')}
        </Text>
      ) : (
        <ul className="mt-2 flex flex-col gap-2" data-testid="forecast-decisions">
          {decisions.shown.map(line => {
            const title = t(`finance.forecastHorizons.decisions.${line.decision}`)
            return (
              <li
                key={line.decision}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-2 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0">
                  <Text size="sm" weight="medium">
                    {title}
                  </Text>
                  <Text size="xs" className={`block ${muted}`}>
                    {t('finance.forecastHorizons.decisions.count', { count: line.count })}
                    {line.amounts ? (
                      <>
                        {' · '}
                        <Amounts amounts={line.amounts} quiet />
                      </>
                    ) : null}
                  </Text>
                </div>
                <Link
                  to={DECISION_ROUTES[line.decision]}
                  aria-label={t('finance.forecastHorizons.decisions.seeAria', { title })}
                  className="text-sm text-[var(--bellum-text-accent)] underline"
                >
                  {t('finance.forecastHorizons.decisions.see')}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {decisions.folded > 0 ? (
        <Text size="xs" className={`mt-2 block ${muted}`}>
          {t('finance.forecastHorizons.decisions.folded', { count: decisions.folded })}
        </Text>
      ) : null}
    </section>
  )

  if (view === 'manager') return decisionList

  // #3483 / #3550.3 — « une absence ne fait AUCUNE ligne » : une valeur absente n'écrit ni tiret ni
  // libellé seul ; elle est NOMMÉE une seule fois, dans la légende du bloc.
  const moneyKinds = (['revenue', 'invoicing', 'cash'] as const).filter(kind => forecast.money[kind].amounts !== null)
  const capacityCells = (
    [
      ['available', forecast.capacity?.availableDays ?? null, 'days'],
      ['reserved', forecast.capacity?.reservedDays ?? null, 'days'],
      ['bench', forecast.capacity?.bench ?? null, 'people'],
      ['uncoveredNeeds', forecast.capacity?.uncoveredNeeds ?? null, 'people'],
    ] as const
  ).filter(([, value]) => value !== null)
  const gapCauses = forecast.gap.causes.filter(cause => cause.amounts !== null)
  const absentNames = [
    ...(['revenue', 'invoicing', 'cash'] as const)
      .filter(kind => forecast.money[kind].amounts === null)
      .map(kind => t(`finance.forecastHorizons.money.${kind}`)),
    ...forecast.components
      .filter(entry => entry.amounts === null)
      .map(entry => t(`finance.forecastHorizons.components.${entry.component}`)),
    ...forecast.scenarios
      .filter(entry => entry.amounts === null)
      .map(entry => t(`finance.forecastHorizons.scenarios.${entry.scenario}`)),
    ...forecast.gap.causes
      .filter(cause => cause.amounts === null)
      .map(cause => t(`finance.forecastHorizons.gap.${cause.cause}`)),
    ...(
      [
        ['available', forecast.capacity?.availableDays],
        ['reserved', forecast.capacity?.reservedDays],
        ['bench', forecast.capacity?.bench],
        ['uncoveredNeeds', forecast.capacity?.uncoveredNeeds],
      ] as const
    )
      .filter(([, value]) => value === undefined || value === null)
      .map(([key]) => t(`finance.forecastHorizons.capacity.${key}`)),
  ]

  return (
    <div className="flex flex-col gap-5">
      <Text size="xs" className={`block ${muted}`}>
        {t('finance.forecastHorizons.window', { from: forecast.window.from, until: forecast.window.until })}
      </Text>
      {absentNames.length > 0 ? (
        <Text size="xs" className={`block ${muted}`} data-testid="forecast-absent-legend">
          {capitalize(t('common:unknownValue'))} : {absentNames.join(', ')} —{' '}
          {t('finance.forecastHorizons.absentLegend')}
        </Text>
      ) : null}

      {/* #2425.6 — trois montants, jamais confondus. */}
      {moneyKinds.length > 0 ? (
        <dl className="grid gap-3 sm:grid-cols-3" data-testid="forecast-money">
          {moneyKinds.map(kind => (
            <div key={kind}>
              <dt>
                <Text size="xs" className={muted}>
                  {t(`finance.forecastHorizons.money.${kind}`)}
                </Text>
              </dt>
              <dd>
                <Text size="sm" weight="semibold">
                  <Amounts amounts={forecast.money[kind].amounts} quiet />
                </Text>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {/* #2425.1 / .3 / .5 — les sept composantes, chacune avec sa confiance nommée. */}
      <section aria-labelledby="forecast-components">
        <Text id="forecast-components" size="xs" weight="semibold" className="block uppercase tracking-wide">
          {t('finance.forecastHorizons.components.title')}
        </Text>
        <ul className="mt-2 flex flex-col gap-2" data-testid="forecast-components">
          {forecast.components.map(entry => (
            <li key={entry.component} className="border-b border-border pb-2 last:border-b-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <Text size="sm">{t(`finance.forecastHorizons.components.${entry.component}`)}</Text>
                {entry.amounts ? (
                  <Text size="sm" weight="medium">
                    <Amounts amounts={entry.amounts} />
                  </Text>
                ) : null}
              </div>
              <Text size="xs" className={`block ${muted}`}>
                {t(`finance.forecastHorizons.confidence.basis.${entry.confidence.basis}`)}
                {' — '}
                {entry.confidence.axes
                  .map(
                    axis =>
                      `${t(`finance.forecastHorizons.confidence.axis.${axis.axis}`)} : ${t(
                        `finance.forecastHorizons.confidence.state.${axis.state}`,
                      )}`,
                  )
                  .join(' · ')}
                {entry.withoutAmount > 0
                  ? ` · ${t('finance.forecastHorizons.withoutAmount', { count: entry.withoutAmount })}`
                  : ''}
                {entry.assumedCurrency > 0
                  ? ` · ${t('finance.forecastHorizons.assumedCurrency', { count: entry.assumedCurrency })}`
                  : ''}
              </Text>
            </li>
          ))}
        </ul>
      </section>

      {/* #2425.4 — quatre scénarios, chacun avec ses hypothèses. */}
      <section aria-labelledby="forecast-scenarios">
        <Text id="forecast-scenarios" size="xs" weight="semibold" className="block uppercase tracking-wide">
          {t('finance.forecastHorizons.scenarios.title')}
        </Text>
        <ul className="mt-2 grid gap-3 md:grid-cols-2" data-testid="forecast-scenarios">
          {forecast.scenarios.map(entry => (
            <li key={entry.scenario} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <Text size="sm" weight="semibold">
                  {t(`finance.forecastHorizons.scenarios.${entry.scenario}`)}
                </Text>
                {entry.amounts ? (
                  <Text size="sm" weight="medium">
                    <Amounts amounts={entry.amounts} />
                  </Text>
                ) : null}
              </div>
              <ul className={`mt-1 list-disc pl-4 text-xs ${muted}`}>
                {entry.hypotheses.map(hypothesis => (
                  <li key={hypothesis}>{t(`finance.forecastHorizons.hypotheses.${hypothesis}`)}</li>
                ))}
              </ul>
              {entry.deduplicated > 0 || entry.excluded > 0 ? (
                <Text size="xs" className={`mt-1 block ${muted}`}>
                  {[
                    entry.deduplicated > 0
                      ? t('finance.forecastHorizons.scenarios.deduplicated', { count: entry.deduplicated })
                      : null,
                    entry.excluded > 0
                      ? t('finance.forecastHorizons.scenarios.excluded', { count: entry.excluded })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {/* #2425.8 — l'écart CA / cash, cause par cause, chiffrée. */}
      <section aria-labelledby="forecast-gap">
        <Text id="forecast-gap" size="xs" weight="semibold" className="block uppercase tracking-wide">
          {t('finance.forecastHorizons.gap.title')}
        </Text>
        {gapCauses.length === 0 ? (
          <Text size="xs" className={`mt-1 block ${muted}`}>
            {t('finance.forecastHorizons.gap.empty')}
          </Text>
        ) : (
          <ul className="mt-2 flex flex-col gap-1" data-testid="forecast-gap">
            {gapCauses.map(cause => (
              <li key={cause.cause} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <Text size="xs">{t(`finance.forecastHorizons.gap.${cause.cause}`)}</Text>
                <Text size="xs" weight="medium">
                  <Amounts amounts={cause.amounts} />
                </Text>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* #2425.7 — la capacité : disponible, réservée, trous, besoins non couverts. */}
      <section aria-labelledby="forecast-capacity">
        <Text id="forecast-capacity" size="xs" weight="semibold" className="block uppercase tracking-wide">
          {t('finance.forecastHorizons.capacity.title')}
        </Text>
        {capacityCells.length > 0 ? (
          <dl className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="forecast-capacity">
            {capacityCells.map(([key, value, unit]) => (
              <div key={key}>
                <dt>
                  <Text size="xs" className={muted}>
                    {t(`finance.forecastHorizons.capacity.${key}`)}
                  </Text>
                </dt>
                <dd>
                  <Text size="sm" weight="semibold">
                    {unit === 'days' ? t('finance.forecastHorizons.capacity.days', { value }) : String(value)}
                  </Text>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>

      {/* #2783 — DONT AVENANTS, à l'échelle de l'espace : comptés, jamais
          chiffrés (`new_term` est un JSON libre, sans contrat de clé
          vérifiable). Un avenant encore `proposed` est NOMMÉ « simulé »,
          jamais fondu avec un avenant décidé (`accepted`/`active`) —
          aucune probabilité, aucune pondération. */}
      <section aria-labelledby="forecast-amendments">
        <Text id="forecast-amendments" size="xs" weight="semibold" className="block uppercase tracking-wide">
          {t('finance.forecastHorizons.amendments.title')}
        </Text>
        {forecast.amendments.total === 0 ? (
          <Text size="xs" className={`mt-1 block ${muted}`}>
            {t('finance.forecastHorizons.amendments.empty')}
          </Text>
        ) : (
          <Text size="sm" className="mt-1 block" data-testid="forecast-amendments">
            {t('finance.forecastHorizons.amendments.accepted', { count: forecast.amendments.accepted })}
            {' · '}
            {t('finance.forecastHorizons.amendments.simulated', { count: forecast.amendments.simulated })}
          </Text>
        )}
        <Text size="xs" className={`mt-1 block ${muted}`}>
          {t('finance.forecastHorizons.amendments.hint')}
        </Text>
      </section>

      {decisionList}
    </div>
  )
}
