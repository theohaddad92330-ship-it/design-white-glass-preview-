import {
  MISSION_MARGIN_SCENARIO_KINDS,
  poConsumptionAfterExtension,
  type MissionMarginAlert,
  type MissionMarginComputation,
  type MissionMarginConfidence,
  type MissionMarginScenarioKind,
} from '@bellum/contracts'
import { Badge, Box, Button, FilterChips, Input, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { appLocale, formatMonth } from '@/lib/locale'
import { useMissionMarginScenario } from '../api'

/**
 * #2420 — LA MARGE D'UNE MISSION, TELLE QUE LE MOTEUR LA CALCULE.
 *
 * Le NO-GO du chapitre : « le produit présente une marge comme certaine sans
 * exposer les sources, la période et les éléments exclus ». Ce bloc ne montre
 * donc jamais un chiffre seul — il montre son ÉTAT (mesurée / partielle / non
 * mesurée), ce sur quoi il est mesuré, ce qu'il n'inclut pas, et la formule
 * qui l'a produit. Un niveau absent s'écrit « non mesurée », jamais « 0 % »
 * (#2420.13).
 */

const CONFIDENCE_VARIANT: Record<MissionMarginConfidence, 'success' | 'warning' | 'secondary'> = {
  measured: 'success',
  partial: 'warning',
  not_measured: 'secondary',
}

/** Les scénarios qui portent un montant, et le libellé de ce montant. */
const SCENARIO_AMOUNT: Partial<Record<MissionMarginScenarioKind, 'rate' | 'cost'>> = {
  renewed_rate: 'rate',
  future_cost: 'cost',
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat(appLocale(), { style: 'currency', currency, maximumFractionDigits: 0 }).format(
    cents / 100,
  )
}

function percent(value: number): string {
  return `${new Intl.NumberFormat(appLocale(), { maximumFractionDigits: 1 }).format(value)} %`
}

/** Une saisie en euros → des centimes ; vide ou illisible → `null`, jamais 0. */
function eurosToCents(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  const value = Number(trimmed.replace(',', '.'))
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null
}

export function MissionMarginEngine({ missionId, engine }: { missionId: string; engine: MissionMarginComputation }) {
  const { t } = useTranslation('missions')
  const currency = engine.currency
  const isTotal = engine.basis === 'mission_total'
  const unit = (cents: number) =>
    isTotal
      ? t('finance.engine.amountTotal', { value: money(cents, currency) })
      : t('finance.engine.amountPerDay', { value: money(cents, currency) })

  const levels = [
    { key: 'commercial', figure: engine.commercial, show: true },
    { key: 'gross', figure: engine.gross, show: true },
    // #2420.4 — la contribution n'existe que si l'espace a configuré des allocations.
    { key: 'contribution', figure: engine.contribution, show: engine.contribution !== null },
    { key: 'atCompletion', figure: engine.atCompletion, show: isTotal },
  ] as const

  const basisParts = [
    ...engine.revenuesUsed.map(
      entry => `${t(`finance.engine.revenues.${entry.key}`)} ${money(entry.amountCents, currency)}`,
    ),
    ...engine.costsUsed
      .filter(entry => entry.level === 'commercial')
      .map(entry => `${t(`finance.engine.costs.${entry.key}`)} ${money(entry.amountCents, currency)}`),
    ...(engine.period?.validatedDays !== null && engine.period?.validatedDays !== undefined && !isTotal
      ? [t('finance.engine.validatedDays', { count: engine.period.validatedDays })]
      : []),
  ]
  const deductions = engine.costsUsed.filter(entry => entry.level !== 'commercial')
  const list = (keys: readonly string[], family: string) =>
    keys.map(key => t(`finance.engine.${family}.${key}`)).join(', ')
  const month = engine.period ? (formatMonth(engine.period.month) ?? engine.period.month) : null

  return (
    <Box className="space-y-2 border-t border-border pt-3">
      <Box display="flex" className="flex-wrap items-center gap-2">
        <Text element="span" size="sm" className="font-medium">
          {t('finance.engine.title')}
        </Text>
        <Badge variant={CONFIDENCE_VARIANT[engine.confidence]}>
          {t(`finance.engine.confidence.${engine.confidence}`)}
        </Badge>
      </Box>

      <Box className="space-y-1">
        {levels
          .filter(level => level.show)
          .map(level => (
            <Box
              key={level.key}
              data-testid={`margin-level-${level.key}`}
              display="flex"
              className="flex-wrap items-baseline gap-2"
            >
              <Text element="span" size="xs" color="text-muted-foreground">
                {t(`finance.engine.levels.${level.key}`)}
              </Text>
              {level.figure ? (
                <>
                  <Text element="span" size="sm" className="font-medium">
                    {percent(level.figure.percent)}
                  </Text>
                  <Text element="span" size="xs" color="text-muted-foreground">
                    {unit(level.figure.amountCents)}
                  </Text>
                </>
              ) : (
                <Text element="span" size="xs" color="text-muted-foreground">
                  {t('finance.engine.confidence.not_measured')}
                </Text>
              )}
            </Box>
          ))}
      </Box>

      {basisParts.length > 0 ? (
        <Box data-testid="margin-basis">
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('finance.engine.basis', { list: basisParts.join(' · ') })}
          </Text>
        </Box>
      ) : null}
      {deductions.length > 0 ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {t('finance.engine.deductions', {
            list: deductions
              .map(entry => `${t(`finance.engine.costs.${entry.key}`)} ${money(entry.amountCents, currency)}`)
              .join(' · '),
          })}
        </Text>
      ) : null}
      {engine.period && month && !isTotal ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {engine.period.commercialAmountCents !== null && engine.period.validatedDays !== null
            ? t('finance.engine.period', {
                month,
                value: money(engine.period.commercialAmountCents, currency),
                count: engine.period.validatedDays,
              })
            : t('finance.engine.periodNotMeasured', { month })}
        </Text>
      ) : null}

      <Box data-testid="margin-exclusions">
        <Text element="p" size="xs" color="text-muted-foreground">
          {t('finance.engine.excludes', { list: list(engine.exclusions, 'exclusions') })}
        </Text>
      </Box>
      {engine.assumptions.length > 0 ? (
        <Box data-testid="margin-assumptions">
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('finance.engine.assumes', { list: list(engine.assumptions, 'assumptions') })}
          </Text>
        </Box>
      ) : null}
      {engine.missing.length > 0 ? (
        <Box data-testid="margin-missing">
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('finance.engine.lacks', { list: list(engine.missing, 'missing') })}
          </Text>
        </Box>
      ) : null}
      <Box data-testid="margin-formula">
        <Text element="p" size="xs" color="text-muted-foreground">
          {t('finance.engine.formula', {
            version: engine.formulaVersion,
            source: t(`finance.engine.sources.${engine.source.costSource}`),
            currency,
          })}
        </Text>
      </Box>

      {engine.alerts.length > 0 ? (
        <Box data-testid="margin-alerts" className="space-y-1">
          {engine.alerts.map(alert => (
            <Text key={alert.kind} element="p" size="xs">
              {alertText(alert, currency, t)}
            </Text>
          ))}
        </Box>
      ) : null}

      {engine.diagnostic ? (
        <Box data-testid="margin-diagnostic" className="space-y-1 rounded-md border border-border p-2">
          <Text element="p" size="xs" className="font-medium">
            {t('finance.engine.diagnostic.title')}
          </Text>
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('finance.engine.diagnostic.costShare', { value: percent(engine.diagnostic.directCostSharePercent) })}
          </Text>
          {engine.diagnostic.deductions.length > 0 ? (
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('finance.engine.diagnostic.deductions', {
                list: engine.diagnostic.deductions
                  .map(entry => `${t(`finance.engine.costs.${entry.key}`)} ${percent(entry.sharePercent)}`)
                  .join(' · '),
              })}
            </Text>
          ) : null}
          <Text element="p" size="xs" color="text-muted-foreground">
            {engine.diagnostic.rateForThresholdCents !== null
              ? t('finance.engine.diagnostic.levers', {
                  threshold: percent(engine.diagnostic.thresholdPercent),
                  rate: money(engine.diagnostic.rateForThresholdCents, currency),
                  cost: money(engine.diagnostic.costCeilingForThresholdCents, currency),
                })
              : t('finance.engine.diagnostic.costLever', {
                  threshold: percent(engine.diagnostic.thresholdPercent),
                  cost: money(engine.diagnostic.costCeilingForThresholdCents, currency),
                })}
          </Text>
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('finance.engine.diagnostic.noAction')}
          </Text>
        </Box>
      ) : null}

      {isTotal ? null : <MarginScenarioSimulator missionId={missionId} currency={currency} />}
    </Box>
  )
}

function alertText(alert: MissionMarginAlert, currency: string, t: ReturnType<typeof useTranslation>['t']): string {
  const values = alert.values
  const num = (key: string) => Number(values[key] ?? 0)
  switch (alert.kind) {
    case 'below_threshold':
      return t('finance.engine.alerts.below_threshold', {
        percent: percent(num('percent')),
        threshold: percent(num('threshold')),
      })
    case 'rate_changed':
      return t('finance.engine.alerts.rate_changed', {
        previous: money(num('previousRateCents'), currency),
        current: money(num('rateCents'), currency),
      })
    case 'unvalidated_days':
      return t('finance.engine.alerts.unvalidated_days', { count: num('days') })
    case 'unrebilled_expenses':
      return t('finance.engine.alerts.unrebilled_expenses', { value: money(num('amountCents'), currency) })
    case 'currency_mismatch':
      return t('finance.engine.alerts.currency_mismatch', {
        currency: String(values['currency'] ?? ''),
        costCurrency: String(values['costCurrency'] ?? ''),
      })
    default:
      return t(`finance.engine.alerts.${alert.kind}`)
  }
}

/**
 * #2420.14 — le simulateur. Six scénarios ; une SIMULATION calculée par le
 * serveur à partir de la même entrée que la fiche, et qui n'enregistre rien.
 *
 * #2783 — EXPORTÉ et `defaultKind` ajouté : l'écran d'avenant (la carte que
 * Laura propose dans le chat, `PendingActions.tsx`) monte CE MÊME composant
 * pour chiffrer l'impact d'un TJM ou d'une date avant que la proposition ne
 * soit enregistrée, plutôt que d'en reconstruire un second qui finirait par
 * ne plus dire le même chiffre (GA-26). `defaultKind` ne fait QUE présélectionner
 * un scénario cohérent avec le type de changement (TJM → tarif renouvelé,
 * date → prolongation) — l'utilisateur reste libre d'en choisir un autre.
 *
 * `poTerms` (optionnel) — même #2783 : sur le scénario « prolongation », si la
 * mission porte un bon de commande, la projection de sa consommation
 * (`poConsumptionAfterExtension`, composition pure des calculs déjà testés de
 * `mission-po-alert.ts`) s'affiche à côté de la marge — le TJM seul ne change
 * rien à un volume compté en jours, donc rien ne s'affiche sur les autres
 * scénarios. Sans bon de commande connu, ce bloc ne rend rien (« on n'affiche
 * pas ce qu'on n'a pas »).
 */
export function MarginScenarioSimulator({
  missionId,
  currency,
  defaultKind = 'current_rate',
  poTerms = null,
}: {
  missionId: string
  currency: string
  defaultKind?: MissionMarginScenarioKind
  poTerms?: { poVolumeDays: number | null | undefined; poConsumedDays: number | null | undefined } | null
}) {
  const { t } = useTranslation('missions')
  const simulate = useMissionMarginScenario(missionId)
  const [kind, setKind] = useState<MissionMarginScenarioKind>(defaultKind)
  const [amount, setAmount] = useState('')
  const [days, setDays] = useState('')
  const amountKind = SCENARIO_AMOUNT[kind]
  const result = simulate.data
  const poImpact =
    kind === 'extension' && result?.days !== null && result?.days !== undefined && poTerms
      ? poConsumptionAfterExtension({
          volumeDays: poTerms.poVolumeDays,
          consumedDays: poTerms.poConsumedDays,
          extraDays: result.days,
        })
      : null

  const submit = () => {
    const cents = amountKind ? eurosToCents(amount) : null
    const parsedDays = days.trim().length === 0 ? null : Number(days.replace(',', '.'))
    simulate.mutate({
      kind,
      rateCents: amountKind === 'rate' ? cents : null,
      costCents: amountKind === 'cost' ? cents : null,
      days: parsedDays !== null && Number.isFinite(parsedDays) && parsedDays >= 0 ? parsedDays : null,
    })
  }

  return (
    <Box className="space-y-2 rounded-md border border-border p-2">
      <Text element="p" size="xs" className="font-medium">
        {t('finance.engine.scenario.title')}
      </Text>
      <FilterChips
        ariaLabel={t('finance.engine.scenario.kindLabel')}
        options={MISSION_MARGIN_SCENARIO_KINDS.map(option => ({
          value: option,
          label: t(`finance.engine.scenario.kinds.${option}`),
        }))}
        value={kind}
        onChange={next => {
          if (next === null) return
          setKind(next)
          simulate.reset()
        }}
      />
      <Box display="flex" className="flex-wrap items-center gap-2">
        {amountKind ? (
          <Input
            type="number"
            min={0}
            value={amount}
            onChange={event => setAmount(event.target.value)}
            aria-label={t(`finance.engine.scenario.${amountKind}Label`)}
            placeholder={t(`finance.engine.scenario.${amountKind}Label`)}
            className="max-w-[200px]"
          />
        ) : null}
        <Input
          type="number"
          min={0}
          value={days}
          onChange={event => setDays(event.target.value)}
          aria-label={t('finance.engine.scenario.daysLabel')}
          placeholder={t('finance.engine.scenario.daysLabel')}
          className="max-w-[120px]"
        />
        <Button type="button" variant="outline" size="sm" isLoading={simulate.isPending} onClick={submit}>
          {t('finance.engine.scenario.run')}
        </Button>
      </Box>
      {result ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {result.computation.commercial
            ? result.commercialTotalCents !== null && result.days !== null
              ? t('finance.engine.scenario.resultWithTotal', {
                  percent: percent(result.computation.commercial.percent),
                  value: money(result.commercialTotalCents, currency),
                  count: result.days,
                })
              : t('finance.engine.scenario.result', { percent: percent(result.computation.commercial.percent) })
            : t('finance.engine.scenario.notMeasured')}{' '}
          {t('finance.engine.scenario.disclaimer')}
        </Text>
      ) : null}
      {result && result.revenueTotalCents !== null && result.days !== null ? (
        <Text element="p" size="xs" color="text-muted-foreground" data-testid="margin-scenario-revenue">
          {t('finance.engine.scenario.revenueTotal', {
            value: money(result.revenueTotalCents, currency),
            count: result.days,
          })}
        </Text>
      ) : null}
      {poImpact ? (
        <Text
          element="p"
          size="xs"
          data-testid="margin-scenario-po-impact"
          color={
            poImpact.alertAfter === 'overrun'
              ? 'text-[var(--danger-soft-text)]'
              : poImpact.alertAfter === 'approaching'
                ? 'text-[var(--warning-soft-text)]'
                : 'text-muted-foreground'
          }
        >
          {poImpact.after
            ? poImpact.alertAfter === 'overrun'
              ? t('finance.engine.scenario.poImpact.overrun', { count: Math.abs(poImpact.after.remainingDays) })
              : t('finance.engine.scenario.poImpact.after', {
                  percent: percent(poImpact.after.percent),
                  count: poImpact.after.remainingDays,
                })
            : t('finance.engine.scenario.poImpact.unmeasured')}
        </Text>
      ) : null}
    </Box>
  )
}
