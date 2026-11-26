import { Text, Tooltip, TooltipContent, TooltipTrigger, cn, SPACE_SCALE, TYPE_SCALE } from '@bellum/ui'
import { WEEK_DELTA_MISSION_HORIZON_DAYS, type WeekDelta, type WeekDeltaOpportunityBucket } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FigureScope } from '@/components/primitives/FigureScope'
import { QueryLoadError } from '@/components/feedback/QueryLoadError'
import { useSession } from '@/lib/hooks/use-session'
import { pilotageApi } from '../api'
import { CockpitFold } from './cockpit/cockpit-ui'

type CounterKey = 'created' | 'advanced' | 'regressed' | 'lost' | 'won' | 'missionsEnding' | 'cashIn'

interface Counter {
  key: CounterKey
  count: number
  /** Euros (opportunités) ; `null` = aucun montant saisi sur ces lignes. */
  amount?: number | null
  amountCents?: number
  period: 'week' | 'ahead'
  lines: Line[]
}

interface Line {
  id: string
  /** #3295.r42 — l'affaire de la ligne (compteurs d'opportunités) : la ligne ouvre sa fiche. */
  projectId?: string
  primary: string
  secondary: string | null
  aside: string | null
}

const DAY_MS = 86_400_000

function periodDays(period: WeekDelta['period']): number {
  return Math.max(1, Math.round((new Date(period.to).getTime() - new Date(period.from).getTime()) / DAY_MS))
}

/**
 * Cockpit › « ce qui a bougé » : une rangée compacte de compteurs, chacun
 * déplie sa liste.
 *
 * Les règles de Louis (14/10/2026), tenues ici :
 *  - une catégorie `null` (source illisible) n'est PAS affichée ; une catégorie
 *    mesurée à zéro affiche « 0 » — ce sont deux choses différentes ;
 *  - un compteur à zéro n'a pas de liste à déplier (une absence ne fait aucune
 *    ligne) ;
 *  - les sommes sont NON pondérées, la période est dite dans l'en-tête, et la
 *    formule de chaque compteur vit dans son infobulle.
 */
function useWeekDeltaCounters() {
  const { t, i18n } = useTranslation('pilotage')
  const { user } = useSession()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['pilotage', 'week-delta', user?.id],
    queryFn: pilotageApi.weekDelta,
    enabled: !!user,
    staleTime: 30_000,
  })

  const money = (euros: number) =>
    new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(euros)
  const day = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(new Date(iso))
  const stage = (value: string | null) => (value ? t(`stages.${value}`, { defaultValue: value }) : null)

  const counters = data ? countersOf(data, { t, money, day, stage }) : []
  const days = data ? periodDays(data.period) : 7
  return { data, isLoading, isError, counters, days, money }
}

/**
 * Théo A5 — « Ce qui a bougé · 7 derniers jours » : un PLI dont le résumé tient sur une
 * ligne (« 3 créées · 3 avancées · 1 reculée … ») et dont le corps est la bande de
 * compteurs, chacun déplie sa liste. Le résumé relit les mêmes compteurs que le corps :
 * une catégorie illisible n'y figure pas, une catégorie mesurée à zéro dit « 0 ».
 */
export function WeekDeltaFold() {
  const { t } = useTranslation('pilotage')
  const { data, counters, days, money } = useWeekDeltaCounters()
  const summary = counters
    .map(counter =>
      counter.key === 'cashIn'
        ? t('weekDelta.summaryCash', {
            amount: counter.amountCents === undefined ? '—' : money(counter.amountCents / 100),
          })
        : `${counter.count} ${t(`weekDelta.counters.${counter.key}`).toLocaleLowerCase()}`,
    )
    .join(' · ')
  return (
    <CockpitFold
      testId="cockpit-week-delta-fold"
      title={t('weekDelta.title')}
      meta={
        <>
          <span className="sr-only">{t('weekDelta.period', { count: days })}</span>
          <span className="hidden max-w-[48ch] truncate md:inline">{data ? summary : null}</span>
        </>
      }
    >
      <WeekDeltaStrip bare />
    </CockpitFold>
  )
}

export function WeekDeltaStrip({ bare = false }: { bare?: boolean }) {
  const { t } = useTranslation('pilotage')
  const [open, setOpen] = useState<CounterKey | null>(null)
  const { data, isLoading, isError, counters, days, money } = useWeekDeltaCounters()

  return (
    <section
      aria-labelledby={bare ? undefined : 'cockpit-week-delta'}
      aria-label={bare ? t('weekDelta.title') : undefined}
      className={bare ? undefined : 'mt-4'}
    >
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {bare ? null : (
          <>
            <h2 id="cockpit-week-delta" className={cn(TYPE_SCALE.sectionTitle, 'text-[var(--bellum-text-primary)]')}>
              {t('weekDelta.title')}
            </h2>
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('weekDelta.period', { count: days })}
            </Text>
          </>
        )}
        {/* #4298.2 — la SOURCE des compteurs : les affaires, missions et
            encaissements de l'espace (la période est dite juste avant). */}
        <FigureScope scope={{ period: { kind: 'lastDays', days }, sources: ['workspace'] }} />
      </div>

      {isLoading ? (
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {t('weekDelta.loading')}
        </Text>
      ) : isError || !data || counters.length === 0 ? (
        <QueryLoadError />
      ) : (
        <>
          <ul className={cn('flex flex-wrap', SPACE_SCALE.group)}>
            {counters.map(counter => (
              <li key={counter.key}>
                <CounterChip
                  counter={counter}
                  days={days}
                  expanded={open === counter.key}
                  onToggle={() => setOpen(current => (current === counter.key ? null : counter.key))}
                  amountText={amountText(counter, t, money)}
                />
              </li>
            ))}
          </ul>
          {counters.map(counter =>
            open === counter.key && counter.lines.length > 0 ? (
              <div
                key={counter.key}
                id={`week-delta-${counter.key}`}
                role="region"
                aria-label={t('weekDelta.listLabel', { label: t(`weekDelta.counters.${counter.key}`) })}
                className="mt-2 rounded-md border border-[var(--bellum-border)] p-3"
              >
                <ul className="flex flex-col gap-1">
                  {counter.lines.map(line => (
                    <li key={line.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <Text size="sm" className="min-w-0 text-[var(--bellum-text-primary)]">
                        {line.projectId ? (
                          <Link to="/projects/$id" params={{ id: line.projectId }} className="underline">
                            {line.primary}
                          </Link>
                        ) : (
                          line.primary
                        )}
                        {line.secondary ? (
                          <span className="text-[var(--bellum-text-secondary)]"> — {line.secondary}</span>
                        ) : null}
                      </Text>
                      {line.aside ? (
                        <Text size="xs" className="text-[var(--bellum-text-muted)]">
                          {line.aside}
                        </Text>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
          {/* #3295.r42 — « 1 perdue » se LIT : la liste des affaires perdues et la porte vers leur REX. */}
          {counters.some(counter => counter.key === 'lost' && counter.count > 0) ? (
            <Text size="sm" className="mt-2 block">
              <Link to="/projects" search={{ view: 'lost' }} className="underline" data-testid="week-delta-lost-link">
                {t('weekDelta.lostList')}
              </Link>
              {' · '}
              <Link to="/pilotage/rex" className="underline">
                {t('weekDelta.lostRex')}
              </Link>
            </Text>
          ) : null}
          <Text size="xs" className="mt-2 block text-[var(--bellum-text-muted)]">
            {t('weekDelta.unweighted')}
          </Text>
        </>
      )}
    </section>
  )
}

function CounterChip({
  counter,
  days,
  expanded,
  onToggle,
  amountText: amount,
}: {
  counter: Counter
  days: number
  expanded: boolean
  onToggle: () => void
  amountText: string | null
}) {
  const { t } = useTranslation('pilotage')
  const label = t(`weekDelta.counters.${counter.key}`)
  const formula = t(`weekDelta.formulas.${counter.key}`, { days: WEEK_DELTA_MISSION_HORIZON_DAYS })
  const hasList = counter.lines.length > 0
  const body = (
    <>
      <span className={cn(TYPE_SCALE.keyFigure, 'text-[var(--bellum-text-primary)]')}>
        {counter.key === 'cashIn' ? (amount ?? t('weekDelta.amountUnknown')) : counter.count}
      </span>
      <span className="text-xs text-[var(--bellum-text-secondary)]">{label}</span>
      {counter.key !== 'cashIn' && amount ? (
        <span className="text-xs text-[var(--bellum-text-muted)]">{amount}</span>
      ) : null}
      {counter.period === 'ahead' ? (
        <span className="text-xs text-[var(--bellum-text-muted)]">
          {t('weekDelta.periodMissions', { count: WEEK_DELTA_MISSION_HORIZON_DAYS })}
        </span>
      ) : (
        <span className="sr-only">{t('weekDelta.period', { count: days })}</span>
      )}
    </>
  )
  const className = cn(
    'flex min-h-11 min-w-11 flex-col items-start justify-center gap-0.5 rounded-md border border-[var(--bellum-border)] px-3 py-2 text-left',
    hasList && 'cursor-pointer hover:bg-[var(--bellum-bg-lighter)] focus-visible:outline focus-visible:outline-2',
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {hasList ? (
          <button
            type="button"
            className={className}
            aria-expanded={expanded}
            aria-controls={`week-delta-${counter.key}`}
            onClick={onToggle}
            data-testid={`week-delta-${counter.key}`}
          >
            {body}
          </button>
        ) : (
          // Tabulable quand même : l'infobulle (la formule) doit être lisible au clavier.
          <div className={className} tabIndex={0} data-testid={`week-delta-${counter.key}`}>
            {body}
          </div>
        )}
      </TooltipTrigger>
      <TooltipContent>{formula}</TooltipContent>
    </Tooltip>
  )
}

type Tr = (key: string, options?: Record<string, unknown>) => string

function amountText(counter: Counter, t: Tr, money: (euros: number) => string): string | null {
  if (counter.key === 'cashIn') {
    return counter.amountCents === undefined ? null : money(counter.amountCents / 100)
  }
  if (counter.amount === undefined) return null
  if (counter.amount === null) return counter.count > 0 ? t('weekDelta.amountUnknown') : null
  return counter.count > 0 ? t('weekDelta.amount', { amount: money(counter.amount) }) : null
}

function opportunityCounter(
  key: Exclude<CounterKey, 'missionsEnding' | 'cashIn'>,
  bucket: WeekDeltaOpportunityBucket,
  t: Tr,
  money: (euros: number) => string,
  stage: (value: string | null) => string | null,
): Counter {
  return {
    key,
    count: bucket.count,
    amount: bucket.amount,
    period: 'week',
    lines: bucket.lines.map(line => ({
      id: `${line.id}-${line.from ?? 'x'}-${line.to}`,
      projectId: line.id,
      primary: line.accountName ?? t('weekDelta.noAccount'),
      secondary: line.label,
      aside:
        [
          line.amount === null ? null : money(line.amount),
          line.from ? `${stage(line.from)} → ${stage(line.to)}` : stage(line.to),
        ]
          .filter(Boolean)
          .join(' · ') || null,
    })),
  }
}

function countersOf(
  data: WeekDelta,
  {
    t,
    money,
    day,
    stage,
  }: {
    t: Tr
    money: (euros: number) => string
    day: (iso: string) => string
    stage: (v: string | null) => string | null
  },
): Counter[] {
  const out: Counter[] = []
  for (const key of ['created', 'advanced', 'regressed', 'lost', 'won'] as const) {
    const bucket = data[key]
    // `null` = source illisible : aucune pastille, jamais un « 0 » inventé.
    if (bucket) out.push(opportunityCounter(key, bucket, t, money, stage))
  }
  if (data.missionsEnding) {
    out.push({
      key: 'missionsEnding',
      count: data.missionsEnding.count,
      period: 'ahead',
      lines: data.missionsEnding.lines.map(line => ({
        id: line.id,
        primary: line.consultantName ?? t('weekDelta.noConsultant'),
        secondary: line.accountName ?? t('weekDelta.noAccount'),
        aside: day(line.endsOn),
      })),
    })
  }
  if (data.cashIn) {
    out.push({
      key: 'cashIn',
      count: data.cashIn.count,
      amountCents: data.cashIn.amountCents,
      period: 'week',
      lines: data.cashIn.lines.map(line => ({
        id: line.accountId,
        primary: line.accountName ?? t('weekDelta.noAccount'),
        secondary: t('weekDelta.cashLine', { count: line.count }),
        aside: money(line.amountCents / 100),
      })),
    })
  }
  return out
}
