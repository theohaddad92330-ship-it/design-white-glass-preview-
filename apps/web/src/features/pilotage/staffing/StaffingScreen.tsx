import type {
  BenchConsultant,
  EndingMission,
  StaffingBench,
  StaffingCapacity,
  StaffingEndings,
  StaffingTace,
  TacePeriod,
  TaceValue,
} from '@bellum/contracts'
import { Box, Button, Card, Input, Text, Tooltip, TooltipContent, TooltipTrigger } from '@bellum/ui'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { MissingExpertisePanel } from '@/features/consultants/view/MissingExpertisePanel'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import { ScreenState } from '@/components/primitives/ScreenState'
import { formatDate, formatMonth } from '@/lib/locale'
import { formatCents } from '@/lib/money'
import { useSetTaceThreshold, useStaffingCapacity, useStaffingOverview } from './api'
import { StaffingFacts } from './StaffingFacts'
import { staffingLauraContext } from './staffing-laura-context'
import { barShare, isBelowTaceThreshold, parseThresholdDraft } from './staffing-view'

/**
 * ÉCRAN STAFFING — `/pilotage/staffing` (L3, 14/10/2026).
 *
 * Le serveur calcule, cet écran affiche. Quatre blocs, de haut en bas : capacité
 * contre demande, intercontrat, fins de mission, TACE. Aucune probabilité ; une
 * valeur non mesurée est NOMMÉE (« non mesuré »), jamais 0 ; chaque chiffre dit
 * sa période et son dénominateur ; une absence ne fait aucune ligne.
 */
export function StaffingScreen() {
  const { t } = useTranslation('pilotage')
  const capacity = useStaffingCapacity()
  const overview = useStaffingOverview()

  // Ce que l'écran dit à Laura : ce qui est lu, et ce qui manque (seuil non saisi, TACE réel non mesuré).
  const current = overview.data?.tace.periods[0]
  useLauraContext(
    staffingLauraContext(t, {
      isLoading: overview.isLoading,
      benchCount: overview.data ? overview.data.bench.consultants.length : null,
      endingsWithin30: overview.data ? overview.data.endings.within30.length : null,
      thresholdPercent: overview.data?.tace.thresholdPercent ?? null,
      actualMeasured: current ? current.global.actual.percent !== null : null,
    }),
  )

  return (
    <>
      <Box className="flex flex-col gap-6 py-4">
        <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('staffing.subtitle')}
        </Text>
        {/* Théo D pilotage › Staffing : la bande de chiffres, puis la capacité face aux fins de
            mission côte à côte (`d-grid2`), puis le banc et le TACE en pleine largeur. */}
        {overview.data ? <StaffingFacts overview={overview.data} /> : null}
        <div data-testid="staffing-grid" className="grid items-start gap-6 lg:grid-cols-2">
          <Section title={t('staffing.capacity.title')} intro={t('staffing.capacity.intro')}>
            {capacity.isLoading ? (
              <ScreenState state="loading" message={t('staffing.loading')} />
            ) : capacity.isError || !capacity.data ? (
              <ScreenState state="error" message={t('staffing.error')} />
            ) : (
              <CapacityBlock capacity={capacity.data} />
            )}
          </Section>
          <div className="flex flex-col gap-6">
            {overview.data ? (
              <Section title={t('staffing.endings.title')} intro={t('staffing.endings.intro')}>
                <EndingsBlock endings={overview.data.endings} />
              </Section>
            ) : null}
            {/* #4349 V.2 (décision Louis 19/10) — sorti du Vivier : les compétences sans profil, avec le CA non adressé. */}
            <MissingExpertisePanel />
          </div>
        </div>
        {overview.isLoading ? (
          <ScreenState state="loading" message={t('staffing.loading')} />
        ) : overview.isError || !overview.data ? (
          <ScreenState state="error" message={t('staffing.error')} />
        ) : (
          <>
            <Section title={t('staffing.bench.title')} intro={benchIntro(overview.data.bench, t)}>
              <BenchBlock bench={overview.data.bench} />
            </Section>
            <Section title={t('staffing.tace.title')} intro={t('staffing.tace.intro')} formula>
              <TaceBlock tace={overview.data.tace} />
            </Section>
          </>
        )}
      </Box>
    </>
  )
}

function benchIntro(bench: StaffingBench, t: (key: string, options?: Record<string, unknown>) => string): string {
  return t('staffing.bench.intro', {
    date: formatDate(bench.countedUntil, { dateStyle: 'long', timeZone: 'UTC' }) ?? '',
  })
}

function Section({
  title,
  intro,
  formula = false,
  children,
}: {
  title: string
  intro: string
  formula?: boolean
  children: React.ReactNode
}) {
  const { t } = useTranslation('pilotage')
  return (
    <Card className="p-4">
      <Box className="mb-3 flex items-start justify-between gap-2">
        <Box className="min-w-0">
          <Text element="h2" size="lg" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {title}
          </Text>
          <Text element="p" size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
            {intro}
          </Text>
        </Box>
        {formula ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t('staffing.tace.formulaLabel')}
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-[var(--bellum-text-muted)]"
              >
                <Text size="sm" weight="semibold">
                  ?
                </Text>
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{t('staffing.tace.formula')}</TooltipContent>
          </Tooltip>
        ) : null}
      </Box>
      {children}
    </Card>
  )
}

function CapacityBlock({ capacity }: { capacity: StaffingCapacity }) {
  const { t } = useTranslation('pilotage')
  const max = Math.max(0, ...capacity.weeks.flatMap(w => [w.capacityDays, w.signedMissionDays, w.openNeedDays]))
  const empty = max === 0
  return (
    <Box className="flex flex-col gap-3">
      {empty ? (
        <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
          {t('staffing.capacity.empty')}
        </Text>
      ) : (
        <ul className="flex flex-col gap-3">
          {capacity.weeks.map(week => (
            <li key={week.weekStart} className="flex flex-col gap-1">
              <Box className="flex flex-wrap items-baseline justify-between gap-x-3">
                <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                  {t('staffing.capacity.week', {
                    date: formatDate(week.weekStart, { day: 'numeric', month: 'short', timeZone: 'UTC' }) ?? '',
                  })}
                </Text>
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('staffing.capacity.workingDays', { count: week.workingDays, consultants: week.consultants })}
                </Text>
              </Box>
              <BarRow
                label={t('staffing.capacity.legendCapacity')}
                value={week.capacityDays}
                max={max}
                tone="capacity"
              />
              <BarRow
                label={t('staffing.capacity.legendSigned')}
                value={week.signedMissionDays}
                max={max}
                tone="signed"
              />
              <BarRow label={t('staffing.capacity.legendNeeds')} value={week.openNeedDays} max={max} tone="needs" />
            </li>
          ))}
        </ul>
      )}
      {capacity.undatedOpenNeeds > 0 ? (
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('staffing.capacity.undated', { count: capacity.undatedOpenNeeds })}
        </Text>
      ) : null}
    </Box>
  )
}

const BAR_TONE = {
  capacity: 'bg-[var(--bellum-text-muted)]',
  signed: 'bg-[var(--bellum-text-accent)]',
  needs: 'bg-[var(--warning-soft-text)]',
} as const

function BarRow({
  label,
  value,
  max,
  tone,
}: {
  label: string
  value: number
  max: number
  tone: keyof typeof BAR_TONE
}) {
  const { t } = useTranslation('pilotage')
  const share = barShare(value, max)
  return (
    <Box className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3.5rem] items-center gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_4rem]">
      <Text size="xs" className="truncate text-[var(--bellum-text-secondary)]">
        {label}
      </Text>
      <Box aria-hidden="true" className="h-2 w-full overflow-hidden rounded-full bg-[var(--bellum-border)]">
        <Box className={`h-2 rounded-full ${BAR_TONE[tone]}`} style={{ width: `${share}%` }} />
      </Box>
      <Text size="xs" weight="medium" className="text-right text-[var(--bellum-text-primary)]">
        {t('staffing.capacity.days', { value })}
      </Text>
    </Box>
  )
}

function BenchBlock({ bench }: { bench: StaffingBench }) {
  const { t } = useTranslation('pilotage')
  if (bench.consultants.length === 0) {
    return (
      <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
        {t('staffing.bench.empty')}
      </Text>
    )
  }
  return (
    <Box className="flex flex-col gap-3">
      <Text element="p" size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
        {bench.knownCostCents === null
          ? t('staffing.bench.costNone')
          : t('staffing.bench.costKnown', { amount: formatCents(bench.knownCostCents) })}
      </Text>
      {bench.withoutCost > 0 && bench.knownCostCents !== null ? (
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('staffing.bench.withoutCost', { count: bench.withoutCost })}
        </Text>
      ) : null}
      <ul className="flex flex-col divide-y divide-[var(--bellum-border)]">
        {bench.consultants.map(consultant => (
          <BenchRow key={consultant.consultantId} consultant={consultant} />
        ))}
      </ul>
    </Box>
  )
}

function BenchRow({ consultant }: { consultant: BenchConsultant }) {
  const { t } = useTranslation('pilotage')
  const since = formatDate(consultant.freeSince, { dateStyle: 'medium', timeZone: 'UTC' })
  return (
    <li className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
      <Box className="min-w-0">
        <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {consultant.fullName}
        </Text>
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {since ? `${t('staffing.bench.columns.since')} ${since}` : t('staffing.bench.sinceUnknown')} ·{' '}
          {t('staffing.bench.columns.days')} : {consultant.benchDaysThisMonth}
        </Text>
        {consultant.mainSkills.length > 0 ? (
          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
            {consultant.mainSkills.join(' · ')}
          </Text>
        ) : null}
      </Box>
      <Box className="shrink-0 sm:text-right">
        {consultant.cost.state === 'known' ? (
          <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
            {formatCents(consultant.cost.monthCostCents)}
          </Text>
        ) : (
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {consultant.cost.state === 'restricted'
              ? t('staffing.bench.costRestricted')
              : t('staffing.bench.costUnknown')}
          </Text>
        )}
      </Box>
    </li>
  )
}

function EndingsBlock({ endings }: { endings: StaffingEndings }) {
  const { t } = useTranslation('pilotage')
  const columns = [
    { key: 'within30', rows: endings.within30 },
    { key: 'within60', rows: endings.within60 },
    { key: 'within90', rows: endings.within90 },
  ] as const
  return (
    <Box className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-4">
      {columns.map(column => (
        <Box key={column.key} className="min-w-0">
          <Text element="h3" size="sm" weight="semibold" className="mb-2 text-[var(--bellum-text-primary)]">
            {t(`staffing.endings.${column.key}`)} · {column.rows.length}
          </Text>
          {column.rows.length === 0 ? (
            <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
              {t('staffing.endings.empty')}
            </Text>
          ) : (
            <ul className="flex flex-col gap-2">
              {column.rows.map(row => (
                <EndingCard key={row.missionId} row={row} />
              ))}
            </ul>
          )}
        </Box>
      ))}
    </Box>
  )
}

function EndingCard({ row }: { row: EndingMission }) {
  const { t } = useTranslation('pilotage')
  return (
    <li className="rounded-md border border-[var(--bellum-border)] p-3">
      <Text element="p" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {row.consultantName ?? t('staffing.endings.noConsultant')}
      </Text>
      <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
        {row.accountName ?? t('staffing.endings.noAccount')}
      </Text>
      <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('staffing.endings.endsOn', {
          date: formatDate(row.endsOn, { dateStyle: 'medium', timeZone: 'UTC' }) ?? '',
          count: row.daysLeft,
        })}
      </Text>
      <Text element="p" size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
        {t(`staffing.endings.renewal.${row.renewal}`)}
      </Text>
    </li>
  )
}

function TaceBlock({ tace }: { tace: StaffingTace }) {
  const { t } = useTranslation('pilotage')
  return (
    <Box className="flex flex-col gap-4">
      <ThresholdForm threshold={tace.thresholdPercent} />
      {tace.periods.map(period => (
        <TacePeriodBlock key={period.month} period={period} threshold={tace.thresholdPercent} />
      ))}
      {tace.thresholdPercent === null ? (
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('staffing.tace.noThreshold')}
        </Text>
      ) : null}
    </Box>
  )
}

function TacePeriodBlock({ period, threshold }: { period: TacePeriod; threshold: number | null }) {
  const { t } = useTranslation('pilotage')
  return (
    <Box>
      <Text element="h3" size="sm" weight="semibold" className="mb-2 text-[var(--bellum-text-primary)]">
        {t('staffing.tace.period', {
          month: formatMonth(period.month) ?? period.month,
          from: formatDate(period.from, { day: 'numeric', month: 'short', timeZone: 'UTC' }) ?? period.from,
          to: formatDate(period.to, { day: 'numeric', month: 'short', timeZone: 'UTC' }) ?? period.to,
        })}
      </Text>
      <ul className="flex flex-col divide-y divide-[var(--bellum-border)]">
        <TaceRow
          label={t('staffing.tace.global')}
          planned={period.global.planned}
          actual={period.global.actual}
          threshold={threshold}
          strong
        />
        {period.consultants.length === 0 ? (
          <li>
            <Text size="xs" className="block py-2 text-[var(--bellum-text-muted)]">
              {t('staffing.tace.empty')}
            </Text>
          </li>
        ) : (
          period.consultants.map(row => (
            <TaceRow
              key={row.consultantId}
              label={row.fullName}
              planned={row.planned}
              actual={row.actual}
              threshold={threshold}
            />
          ))
        )}
      </ul>
    </Box>
  )
}

function TaceRow({
  label,
  planned,
  actual,
  threshold,
  strong = false,
}: {
  label: string
  planned: TaceValue
  actual: TaceValue
  threshold: number | null
  strong?: boolean
}) {
  const { t } = useTranslation('pilotage')
  return (
    <li className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
      <Text size="sm" weight={strong ? 'semibold' : 'medium'} className="text-[var(--bellum-text-primary)]">
        {label}
      </Text>
      <TaceCell title={t('staffing.tace.planned')} value={planned} threshold={threshold} />
      <TaceCell title={t('staffing.tace.actual')} value={actual} threshold={threshold} />
    </li>
  )
}

function TaceCell({ title, value, threshold }: { title: string; value: TaceValue; threshold: number | null }) {
  const { t } = useTranslation('pilotage')
  const below = isBelowTaceThreshold(value, threshold)
  return (
    <Box>
      <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
        {title}
      </Text>
      {value.percent === null ? (
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {t('staffing.tace.notMeasured')}
        </Text>
      ) : (
        <>
          <Text
            element="p"
            size="sm"
            weight="semibold"
            className={below ? 'text-[var(--danger-soft-text)]' : 'text-[var(--bellum-text-primary)]'}
          >
            {t('staffing.tace.value', { percent: value.percent })}
          </Text>
          {value.days !== null ? (
            <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('staffing.tace.base', { days: value.days, available: value.availableDays })}
            </Text>
          ) : null}
          {below && threshold !== null ? (
            <Text element="p" size="xs" weight="medium" className="text-[var(--danger-soft-text)]">
              {t('staffing.tace.belowThreshold', { threshold })}
            </Text>
          ) : null}
        </>
      )}
    </Box>
  )
}

function ThresholdForm({ threshold }: { threshold: number | null }) {
  const { t } = useTranslation('pilotage')
  const inputId = useId()
  const save = useSetTaceThreshold()
  const [draft, setDraft] = useState<string | null>(null)

  useEffect(() => {
    setDraft(null)
  }, [threshold])

  const current = draft ?? (threshold === null ? '' : String(threshold))
  const { value, invalid } = parseThresholdDraft(current)

  const submit = (next: number | null) =>
    save.mutate(next, {
      onSuccess: () => toast.success(t('staffing.tace.threshold.saved')),
      onError: () => toast.error(t('staffing.tace.threshold.failed')),
    })

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={event => {
        event.preventDefault()
        if (!invalid) submit(value)
      }}
    >
      <Box className="flex flex-col gap-1">
        <label htmlFor={inputId}>
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
            {t('staffing.tace.threshold.label')}
          </Text>
        </label>
        <Input
          id={inputId}
          type="number"
          inputMode="decimal"
          min={1}
          max={100}
          step="0.1"
          value={current}
          aria-invalid={invalid}
          onChange={event => setDraft(event.target.value)}
          className="w-28 min-h-11"
        />
        <Text size="xs" className={invalid ? 'text-[var(--danger-soft-text)]' : 'text-[var(--bellum-text-muted)]'}>
          {invalid ? t('staffing.tace.threshold.invalid') : t('staffing.tace.threshold.hint')}
        </Text>
      </Box>
      <Button type="submit" size="sm" disabled={invalid || save.isPending} className="min-h-11">
        {t('staffing.tace.threshold.save')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={threshold === null || save.isPending}
        className="min-h-11"
        onClick={() => submit(null)}
      >
        {t('staffing.tace.threshold.reset')}
      </Button>
    </form>
  )
}
