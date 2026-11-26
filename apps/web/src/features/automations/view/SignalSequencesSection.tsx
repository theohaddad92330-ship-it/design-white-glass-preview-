import {
  AUTOMATION_SIGNAL_SOURCES,
  type AutomationRuleView,
  type AutomationSignal,
  type RoutineView,
  type WorkflowDefinition,
} from '@bellum/contracts'
import { Box, EmptyState, FilterChips, Spinner, Switch, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  ChevronRight,
  Clock,
  FileText,
  History,
  Target,
  UserPlus,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { RoutineStatusControl } from '@/features/routines/view/RoutineControls'
import { formatDateTime } from '@/lib/locale'
import { useUpdateAutomationRule } from '../api'
import {
  THEO_BTN_PLAIN_SM,
  THEO_BTN_SOFT_SM,
  THEO_CARD,
  THEO_PILL,
  THEO_PILL_ACCENT,
  THEO_SYMBOL,
} from './theo-classes'
import { countLabel, filterRows, type AutomationOrigin, type AutomationRow } from '../automationRows'
import { useAutomationRows } from '../useAutomationRows'

type Translate = TFunction<'actions'>

const ORIGIN_FILTERS: AutomationOrigin[] = ['rule', 'routine', 'mission', 'workflow']

const SIGNAL_ICON: Record<AutomationSignal, LucideIcon> = {
  mission_end: Briefcase,
  hiring: Users,
  new_decision_maker: UserPlus,
  tender: FileText,
  target_change: Target,
  inactive_account: Clock,
}

/** « Quand … » : le signal d'une règle, avec son délai quand la source en porte un. */
function ruleSignalText(t: Translate, rule: AutomationRuleView): string {
  return t(`automations.signal.${rule.signal}`, { days: rule.inactive_days ?? '' })
}

function capitalize(text: string): string {
  return text === '' ? text : text.charAt(0).toUpperCase() + text.slice(1)
}

/** Le nombre de déclenchements, avec les écartés ; `null` = non mesuré, jamais « 0 » (GA-18 / GA-19). */
function firingsText(t: Translate, count: number | null, skipped: number | null): string {
  const label = countLabel(count)
  const base =
    label.kind === 'unmeasured'
      ? t('automations.firings.unmeasured')
      : t('automations.firings.count', { count: label.value })
  return skipped !== null && skipped > 0 ? `${base} · ${t('automations.firings.skipped', { count: skipped })}` : base
}

function ruleMeasures(t: Translate, rule: AutomationRuleView): string {
  const lastRun = formatDateTime(rule.last_run_at)
  if (rule.firings_30d === null) {
    return !rule.enabled && lastRun === null ? t('automations.measures.never') : t('automations.measures.unmeasured')
  }
  const firings = firingsText(t, rule.firings_30d, rule.skipped_30d)
  return lastRun ? t('automations.measures.full', { firings, date: lastRun }) : firings
}

/**
 * Théo C automations-liste — UNE carte, trois maisons : symbole + pastilles (origine, état), titre, phrase, chaîne
 * Déclencheur → Préparation → Ta décision, Mesures et Coût, périmètre et cadence, interrupteur et « Ouvrir ».
 * Pastilles teintées : l'état Active est l'accent, le reste est neutre — la couleur dit un état.
 */
function AutomationCard({
  t,
  icon: Icon,
  origin,
  state,
  active,
  title,
  description,
  measures,
  cost,
  schedule,
  control,
  open,
}: {
  t: Translate
  icon: LucideIcon
  origin: string
  state: string
  active: boolean
  title: ReactNode
  description: string
  measures: string
  cost: string
  schedule: string | null
  control: ReactNode
  open: ReactNode
}) {
  return (
    <article data-automation-card className={`${THEO_CARD} flex flex-col`}>
      <Box className="flex items-start justify-between gap-3">
        <span aria-hidden="true" className={THEO_SYMBOL}>
          <Icon className="size-5" />
        </span>
        <Box className="flex flex-wrap items-center justify-end gap-1.5">
          <span className={THEO_PILL}>{origin}</span>
          <span className={active ? THEO_PILL_ACCENT : THEO_PILL}>{state}</span>
        </Box>
      </Box>
      <Text element="h3" className="mb-2 mt-4 text-lg font-semibold leading-snug tracking-tight">
        {title}
      </Text>
      <Text size="sm" className="leading-relaxed text-[var(--bellum-text-secondary)]">
        {description}
      </Text>
      <ol
        aria-label={`${t('automations.card.trigger')} → ${t('automations.card.prepare')} → ${t('automations.card.decision')}`}
        className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--bellum-text-secondary)]"
      >
        {(['trigger', 'prepare', 'decision'] as const).map((step, index) => (
          <li key={step} className="inline-flex items-center gap-2">
            {index > 0 ? (
              <ArrowRight className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
            ) : null}
            <span className="rounded-md bg-[var(--bellum-surface-2)] px-2 py-1.5">{t(`automations.card.${step}`)}</span>
          </li>
        ))}
      </ol>
      <dl className="mb-5 mt-3.5 grid grid-cols-[4.5rem_1fr] gap-x-3.5 gap-y-1.5 text-xs">
        <dt className="text-[var(--bellum-text-muted)]">{t('automations.card.measures')}</dt>
        <dd className="text-[var(--bellum-text-secondary)]">{measures}</dd>
        <dt className="text-[var(--bellum-text-muted)]">{t('automations.card.cost')}</dt>
        <dd className="text-[var(--bellum-text-secondary)]">{cost}</dd>
      </dl>
      <Box className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[var(--bellum-border)] pt-3.5">
        <Box className="flex min-w-0 flex-col text-xs text-[var(--bellum-text-muted)]">
          <span>{t('automations.card.scope')}</span>
          {schedule ? <span>{schedule}</span> : null}
        </Box>
        <Box className="flex flex-wrap items-center gap-2">
          {control}
          {open}
        </Box>
      </Box>
    </article>
  )
}

const OPEN_CLASS = THEO_BTN_SOFT_SM

function RuleCard({ t, rule }: { t: Translate; rule: AutomationRuleView }) {
  const update = useUpdateAutomationRule()
  const sentence = ruleSignalText(t, rule)
  const title = rule.name ? rule.name : capitalize(sentence)
  const action =
    rule.action_kind === 'enroll_sequence' && rule.playbook_key
      ? t('automations.action.enroll', { sequence: t(`outreach:playbooks.trigger.${rule.playbook_key}.name`) })
      : t(`automations.prepared.${rule.prepared_action ?? 'email_to_review'}`)
  const everRan = rule.last_run_at !== null
  const stateLabel = rule.enabled
    ? t('automations.card.stateOn')
    : everRan
      ? t('automations.card.stateRoutineOff')
      : t('automations.card.stateOff')
  return (
    <AutomationCard
      t={t}
      icon={SIGNAL_ICON[rule.signal]}
      origin={t('automations.origin.rule')}
      state={stateLabel}
      active={rule.enabled}
      title={
        <Link
          to="/actions/automatisations/$id"
          params={{ id: rule.id }}
          className="hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
        >
          {title}
        </Link>
      }
      description={t('automations.card.describe', { signal: sentence, action })}
      measures={ruleMeasures(t, rule)}
      cost={t(rule.credit_cost === 0 ? 'automations.card.costIncluded' : 'automations.card.costUses')}
      schedule={t(
        AUTOMATION_SIGNAL_SOURCES[rule.signal].type === 'reader'
          ? 'automations.card.scheduleReader'
          : 'automations.card.scheduleEvent',
      )}
      control={
        <label className="inline-flex min-h-11 items-center gap-2.5 text-sm font-semibold">
          <Switch
            aria-label={t('automations.card.switchState', { name: title })}
            checked={rule.enabled}
            disabled={update.isPending}
            onCheckedChange={enabled =>
              update.mutate({ id: rule.id, patch: { enabled } }, { onError: error => toast.error(error.message) })
            }
          />
          <span aria-hidden="true">{stateLabel}</span>
        </label>
      }
      open={
        <Link to="/actions/automatisations/$id" params={{ id: rule.id }} className={OPEN_CLASS}>
          <ChevronRight className="size-3.5" aria-hidden="true" />
          {t('automations.card.open')}
          <span className="sr-only"> : {title}</span>
        </Link>
      }
    />
  )
}

function RoutineCard({
  t,
  routine,
  locale,
  mission,
}: {
  t: Translate
  routine: RoutineView
  locale: 'fr' | 'en'
  mission: boolean
}) {
  const { definition } = routine
  const on = routine.subscription.status === 'active'
  const next = formatDateTime(routine.nextTriggerAt ?? null)
  return (
    <AutomationCard
      t={t}
      icon={mission ? Briefcase : CalendarClock}
      origin={t(mission ? 'automations.origin.mission' : 'automations.origin.routine')}
      state={t(on ? 'automations.card.stateRoutineOn' : 'automations.card.stateRoutineOff')}
      active={on}
      title={
        <Link
          to="/settings/routines/$key"
          params={{ key: definition.key }}
          className="hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
        >
          {definition.name[locale]}
        </Link>
      }
      description={`${definition.condition[locale]} ${definition.outcome[locale]}`}
      measures={t('automations.measures.unmeasured')}
      cost={t('automations.card.costUses')}
      schedule={next ? t('automations.card.scheduleRoutine', { date: next }) : null}
      control={<RoutineStatusControl view={routine} />}
      open={
        <Link to="/settings/routines/$key" params={{ key: definition.key }} className={OPEN_CLASS}>
          <ChevronRight className="size-3.5" aria-hidden="true" />
          {t('automations.card.open')}
          <span className="sr-only"> : {definition.name[locale]}</span>
        </Link>
      }
    />
  )
}

function WorkflowCard({ t, workflow, locale }: { t: Translate; workflow: WorkflowDefinition; locale: 'fr' | 'en' }) {
  return (
    <AutomationCard
      t={t}
      icon={Workflow}
      origin={t('automations.origin.workflow')}
      state={t(workflow.enabled ? 'automations.card.stateOn' : 'automations.card.stateOff')}
      active={workflow.enabled}
      title={workflow.name[locale]}
      description={`${capitalize(t(`center.trace.trigger.${workflow.trigger}`))}. ${t('automations.decision.workflow')}`}
      measures={t('automations.measures.unmeasured')}
      cost={t('automations.card.costUses')}
      schedule={null}
      control={null}
      open={
        <Link to="/actions" search={{ tab: 'workflows' }} className={OPEN_CLASS}>
          <ChevronRight className="size-3.5" aria-hidden="true" />
          {t('automations.card.open')}
          <span className="sr-only"> : {workflow.name[locale]}</span>
        </Link>
      }
    />
  )
}

function renderRow(t: Translate, row: AutomationRow, locale: 'fr' | 'en') {
  if (row.origin === 'rule') return <RuleCard key={row.id} t={t} rule={row.rule} />
  if (row.origin === 'routine' || row.origin === 'mission')
    return <RoutineCard key={row.id} t={t} routine={row.routine} locale={locale} mission={row.origin === 'mission'} />
  return <WorkflowCard key={row.id} t={t} workflow={row.workflow} locale={locale} />
}

/**
 * Théo C automations-liste — LES CARTES de « Tes automatisations » : règles sur signal, routines planifiées, missions et
 * workflows, UNE grammaire. Filtre d'origine à choix multiple (aucune cochée = toutes), et « Ce qu'elles ont préparé »
 * qui ouvre l'historique des actions. Les modèles de règle ne sont plus ici : ils vivent dans la bibliothèque (A6).
 *
 * Une règle prépare, elle n'envoie jamais : tout arrive dans « À traiter ». Aucun crédit, aucun plafond chiffré : le
 * coût se dit « Compte dans ton usage » ou « Incluse dans ton offre ».
 */
export function SignalSequencesSection() {
  const { t, i18n } = useTranslation('actions')
  const locale: 'fr' | 'en' = i18n.language.startsWith('en') ? 'en' : 'fr'
  const { rows, rules, loading } = useAutomationRows()
  const [origins, setOrigins] = useState<AutomationOrigin[]>([])

  const shown = filterRows(rows, origins)
  const toggle = (origin: AutomationOrigin | 'all') =>
    setOrigins(current =>
      origin === 'all' ? [] : current.includes(origin) ? current.filter(o => o !== origin) : [...current, origin],
    )

  return (
    <Box id="sur-signal" className="flex w-full flex-col gap-4">
      {rules.isError ? (
        <Text size="sm" role="alert">
          {t('automations.loadError')}
        </Text>
      ) : null}

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState
          size="md"
          align="center"
          icon={<Workflow className="h-10 w-10" />}
          title={t('automations.empty.title')}
          description={t('automations.empty.description')}
        />
      ) : (
        <>
          <Box data-section="filters" className="flex flex-wrap items-center gap-2.5">
            <FilterChips
              multiple
              legend={t('automations.filter.label')}
              ariaLabel={t('automations.filter.label')}
              options={[
                { value: 'all', label: t('automations.filter.all'), count: rows.length },
                ...ORIGIN_FILTERS.map(origin => ({
                  value: origin,
                  label: t(`automations.origin.${origin}`),
                  count: rows.filter(row => row.origin === origin).length,
                })).filter(option => option.count > 0),
              ]}
              values={origins.length === 0 ? ['all'] : origins}
              onToggle={value => toggle(value as AutomationOrigin | 'all')}
              size="sm"
            />
            <Link to="/actions" search={{ tab: 'workflows' }} className={`${THEO_BTN_PLAIN_SM} ml-auto`}>
              <History className="size-4" aria-hidden="true" />
              {t('automations.page.prepared')}
            </Link>
          </Box>
          <Box data-section="cards" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,23.75rem),1fr))] gap-4">
            {shown.map(row => renderRow(t, row, locale))}
          </Box>
        </>
      )}
    </Box>
  )
}
