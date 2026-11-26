import { useState } from 'react'
import { Activity, Download, ListChecks, MessageSquare, Search, type LucideIcon } from 'lucide-react'
import {
  MANAGER_PERIOD_DAYS,
  actionTypeSchema,
  parseManagerPeriodDays,
  type ManagerMemberStats,
  type ManagerPeriodActivity,
  type ManagerPeriodDays,
} from '@bellum/contracts'
import { Button, FilterChips, SelectField, Text } from '@bellum/ui'
import { toCsv } from '@/lib/csv'
import { useDataExit } from '@/lib/data-exit'
import { downloadCSV } from '@/lib/export-csv'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

/**
 * « Activité de l'équipe » — #4158.43 (lot L7, Louis 14/10/2026), héritier du
 * fil « Activité récente » (maquette p.11, bloc 6).
 *
 * Le fil de la PÉRIODE choisie (ce que l'équipe a fait), filtrable par membre.
 * Sa source est `user_actions` — les gestes COMMERCIAUX. Le journal de
 * `/settings/activity` (`useWorkspaceActivity`) est un AUTRE flux : invitations,
 * rôles, intégrations, reprises de portefeuille. Les fondre dupliquerait l'un
 * dans l'autre ; ce bloc renvoie donc vers lui au lieu de le recopier.
 *
 * Sans aucun geste sur la période : le bloc ne fait aucune ligne (doctrine).
 *
 * Un type d'événement inconnu du dictionnaire garde sa ligne avec un libellé
 * générique : jamais une clé technique à l'écran (R21-FIX, 15/10). La garde
 * `activity-event-labels.test.ts` échoue si un type émis n'a pas son libellé.
 */
// i18n keys: activity.events.<action_type> — un libellé par type de `actionTypeSchema` (garde activity-event-labels.test.ts)
const KNOWN_EVENTS: readonly string[] = actionTypeSchema.options

/**
 * Les quatre lectures du journal (Théo D team-activite) : tous les faits, les recherches et analyses,
 * les actions et délégations, le suivi commercial. UNE seule table de rangement, ici : un type émis qui
 * n'est dans aucune des trois dernières reste dans « Tous les faits », jamais perdu.
 */
const FACT_KINDS = ['research', 'delegations', 'followup'] as const
type FactKind = (typeof FACT_KINDS)[number]

const PANEL = 'rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4 md:p-6'

function kindOf(actionType: string): FactKind | null {
  if (actionType.startsWith('analysis_') || actionType === 'need_play_generated') return 'research'
  if (actionType.startsWith('plan_action_') || actionType === 'crm_task_created') return 'delegations'
  if (
    actionType.startsWith('message_') ||
    ['response_received', 'rdv_obtained', 'deal_signed', 'commercial_status_changed'].includes(actionType)
  )
    return 'followup'
  return null
}

const KIND_ICONS: Record<FactKind | 'other', LucideIcon> = {
  research: Search,
  delegations: ListChecks,
  followup: MessageSquare,
  other: Activity,
}

export function RecentActivityFeed({
  activity,
  members,
  days,
  onPeriod,
}: {
  activity: ManagerPeriodActivity | undefined
  members: ManagerMemberStats[]
  days: number
  /** Théo : la période du journal vit dans SA barre d'outils (`e8-days`), pas dans les filtres de page. */
  onPeriod?: (next: ManagerPeriodDays) => void
}) {
  const { t, i18n } = useTranslation('manager')
  const [kinds, setKinds] = useState<FactKind[]>([])
  const dataExit = useDataExit()

  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  const nameOf = (id: string | null) =>
    (id ? members.find(m => m.user_id === id)?.name : null) ?? t('activity.unknownMember')
  const items = activity?.items ?? []
  const events =
    kinds.length === 0
      ? items
      : items.filter(event => {
          const kind = kindOf(event.action_type)
          return kind !== null && kinds.includes(kind)
        })
  const labelOf = (actionType: string) =>
    KNOWN_EVENTS.includes(actionType) ? t(`activity.events.${actionType}`) : t('activity.events.unknown')
  const when = (iso: string) =>
    new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  const onExport = () => {
    if (!dataExit.grant) return
    const rows: string[][] = [
      [
        t('board.activity.export.columns.when'),
        t('board.activity.export.columns.who'),
        t('board.activity.export.columns.what'),
        t('board.activity.export.columns.account'),
      ],
      ...events.map(event => [
        event.created_at,
        nameOf(event.user_id),
        labelOf(event.action_type),
        event.company_name ?? '',
      ]),
    ]
    downloadCSV(toCsv(rows), `${t('board.activity.export.file')}-${days}j.csv`, dataExit.grant)
  }

  return (
    <section aria-label={t('board.activity.eyebrow')} data-board-block="activity" className={`${PANEL} space-y-4`}>
      <div data-testid="activity-toolbar" className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <FilterChips
          multiple
          size="sm"
          ariaLabel={t('board.activity.kindLabel')}
          options={FACT_KINDS.map(value => ({ value, label: t(`board.activity.kinds.${value}`) }))}
          values={kinds}
          onToggle={value =>
            setKinds(prev => (prev.includes(value) ? prev.filter(kind => kind !== value) : [...prev, value]))
          }
        />
        {onPeriod ? (
          <SelectField
            size="sm"
            value={String(days)}
            ariaLabel={t('board.activity.periodLabel')}
            options={MANAGER_PERIOD_DAYS.map(value => ({
              value: String(value),
              label: t(`board.period.days_${value}`),
            }))}
            onChange={next => onPeriod(parseManagerPeriodDays(next))}
          />
        ) : null}
        {activity && activity.total > 0 ? (
          <Text element="h2" size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('board.activity.title', { count: activity.total, days })}
          </Text>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 md:ml-auto">
          {dataExit.allowed && dataExit.grant && events.length > 0 ? (
            <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={onExport}>
              <Download aria-hidden className="size-4" />
              {t('board.activity.export.label')}
            </Button>
          ) : null}
          <Link
            to="/settings/activity"
            className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
          >
            {t('board.activity.adminJournal')}
          </Link>
        </div>
      </div>

      {!activity || activity.total === 0 ? (
        <Text size="sm" data-testid="activity-empty" className="text-[var(--bellum-text-secondary)]">
          {t('board.activity.empty', { days })}
        </Text>
      ) : events.length === 0 ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('board.activity.emptyMember')}
        </Text>
      ) : (
        <ul className="divide-y divide-[var(--bellum-border)]">
          {events.map(event => {
            const kind = kindOf(event.action_type)
            const Icon = KIND_ICONS[kind ?? 'other']
            return (
              <li key={event.id}>
                <article data-event-kind={kind ?? 'other'} className="flex gap-3 py-4">
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-[var(--bellum-text-secondary)]"
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-[var(--bellum-text-muted)]">{when(event.created_at)}</div>
                    {/* Les libellés du dictionnaire sont des verbes (« a envoyé un message ») : le
                        titre du fait porte donc la personne, la méta de Théo garde la date. */}
                    <h3 className="mt-0.5 text-sm font-semibold text-[var(--bellum-text-primary)]">
                      {`${nameOf(event.user_id)} ${labelOf(event.action_type)}`}
                    </h3>
                    {event.account_id && event.company_name ? (
                      <Link
                        to="/accounts/$id"
                        params={{ id: event.account_id }}
                        className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
                      >
                        {event.company_name}
                      </Link>
                    ) : event.company_name ? (
                      <p className="text-sm text-[var(--bellum-text-secondary)]">{event.company_name}</p>
                    ) : null}
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      )}

      {activity && activity.items.length < activity.total ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('board.activity.truncated', { count: activity.items.length, total: activity.total })}
        </Text>
      ) : null}
    </section>
  )
}
