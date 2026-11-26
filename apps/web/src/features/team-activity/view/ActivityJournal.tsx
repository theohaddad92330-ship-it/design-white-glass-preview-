import { Badge, Box, Button, Card, SelectField, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MANAGER_PERIOD_DAYS, type ManagerPeriodDays } from '@bellum/contracts'
import { ScreenState } from '@/components/primitives/ScreenState'
import { useTeamActivityJournal } from '@/features/manager/hooks/useTeamActivityJournal'
import { journalCsv, type JournalExportRow } from '@/features/team-activity/lib/journal-export'
import { JOURNAL_FAMILY_KEYS, journalFamilyOf, type JournalFamily } from '@/features/team-activity/lib/journal-facts'
import { useDataExit } from '@/lib/data-exit'
import { downloadCSV } from '@/lib/export-csv'

const SELECT_CLASS =
  'min-h-11 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] px-3 text-sm text-[var(--bellum-text-primary)]'

function initialsOf(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('')
}

/**
 * Théo D team-activite.R1 — « Journal d'activité » : les FAITS enregistrés, 30 jours par défaut.
 * Source : les gestes commerciaux de l'équipe (`user_actions`, via les stats de période). Une
 * consultation n'y entre jamais (`journal-facts.ts`).
 */
export function ActivityJournal() {
  const { t, i18n } = useTranslation(['teamActivity', 'manager'])
  const [days, setDays] = useState<ManagerPeriodDays>(30)
  const [family, setFamily] = useState<JournalFamily | 'all'>('all')
  const [memberId, setMemberId] = useState('')
  const { loaded, members, activity, isLoading, isError, refetch } = useTeamActivityJournal(days)
  const dataExit = useDataExit()

  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  const nameOf = (id: string | null) =>
    members.find(member => member.user_id === id)?.name ?? t('teamActivity:unknownMember')
  const factLabel = (type: string) =>
    // i18n keys: manager:activity.events.<action_type> — un libellé par type d'action (garde activity-event-labels)
    t(`manager:activity.events.${type}`, { defaultValue: t('manager:activity.events.unknown') })

  const rows = useMemo(() => {
    const items = activity?.items ?? []
    return items.filter(item => {
      const itemFamily = journalFamilyOf(item.action_type)
      if (!itemFamily) return false
      if (family !== 'all' && itemFamily !== family) return false
      return !memberId || item.user_id === memberId
    })
  }, [activity, family, memberId])

  const exportView = () => {
    if (!dataExit.grant) return
    const exportRows: JournalExportRow[] = rows.map(item => ({
      at: new Date(item.created_at).toISOString(),
      member: nameOf(item.user_id),
      fact: factLabel(item.action_type),
      account: item.company_name ?? '',
    }))
    downloadCSV(
      journalCsv(exportRows, {
        headers: {
          date: t('teamActivity:export.date'),
          member: t('teamActivity:export.member'),
          fact: t('teamActivity:export.fact'),
          account: t('teamActivity:export.account'),
        },
      }),
      t('teamActivity:export.filename'),
      dataExit.grant,
    )
  }

  const total = activity?.total
  const shownCount = activity?.items.length
  const never = total === 0 && family === 'all' && !memberId
  const truncated = total !== undefined && shownCount !== undefined && shownCount < total

  return (
    <section className="space-y-4" aria-label={t('teamActivity:journal.title')}>
      <Box display="flex" className="flex-wrap items-end gap-3">
        <SelectField
          size="sm"
          value={family === 'all' ? '' : family}
          ariaLabel={t('teamActivity:filters.family')}
          emptyOption={{ label: t('teamActivity:filters.allFacts') }}
          options={JOURNAL_FAMILY_KEYS.map(key => ({ value: key, label: t(`teamActivity:filters.${key}`) }))}
          onChange={value => setFamily(value === '' ? 'all' : (value as JournalFamily))}
        />
        <SelectField
          size="sm"
          value={String(days)}
          ariaLabel={t('teamActivity:filters.period')}
          options={MANAGER_PERIOD_DAYS.map(value => ({
            value: String(value),
            label: t('teamActivity:filters.lastDays', { count: value }),
          }))}
          onChange={value => setDays(Number(value) as ManagerPeriodDays)}
        />
        <SelectField
          size="sm"
          value={memberId}
          ariaLabel={t('teamActivity:filters.member')}
          emptyOption={{ label: t('teamActivity:filters.allMembers') }}
          options={members.map(member => ({ value: member.user_id, label: member.name }))}
          onChange={setMemberId}
        />
        <Text size="sm" color="text-[var(--bellum-text-secondary)]" className="pb-3">
          {t('teamActivity:journal.window', { count: days })} ·{' '}
          {t('teamActivity:journal.count', { count: rows.length })}
        </Text>
        <Box display="flex" className="ml-auto flex-wrap gap-2">
          <Button
            variant="secondary"
            className="min-h-11"
            onClick={exportView}
            disabled={!dataExit.grant || rows.length === 0}
          >
            {t('teamActivity:journal.export')}
          </Button>
          <Button asChild variant="secondary" className="min-h-11">
            <Link to="/settings/activity">{t('teamActivity:journal.adminJournal')}</Link>
          </Button>
        </Box>
      </Box>

      {isError && (
        <ScreenState
          state="error"
          message={t('teamActivity:errors.load')}
          action={{ label: t('teamActivity:errors.retry'), onClick: () => void refetch() }}
        />
      )}
      {isLoading && !loaded && <ScreenState state="loading" message={t('teamActivity:states.loading')} />}
      {loaded && rows.length === 0 && (
        <ScreenState
          state={never ? 'empty_never' : 'empty_true'}
          title={never ? t('teamActivity:journal.emptyTitle') : undefined}
          message={never ? t('teamActivity:journal.empty') : t('teamActivity:journal.emptyFiltered')}
          action={
            never
              ? { label: t('teamActivity:journal.emptyAction'), to: '/discover' }
              : {
                  label: t('teamActivity:journal.resetFilters'),
                  onClick: () => {
                    setFamily('all')
                    setMemberId('')
                  },
                }
          }
        />
      )}
      {rows.length > 0 && (
        <Card className="p-0">
          <ul>
            {rows.map(item => {
              const author = nameOf(item.user_id)
              const itemFamily = journalFamilyOf(item.action_type)
              return (
                <li
                  key={item.id}
                  data-testid="journal-row"
                  className="flex flex-wrap items-center gap-3 border-b border-[var(--bellum-border)] px-4 py-3 last:border-b-0"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--bellum-surface-2)] text-xs"
                  >
                    {initialsOf(author)}
                  </span>
                  <Box className="min-w-0 flex-1">
                    <Box display="flex" className="flex-wrap items-center gap-2">
                      <Text size="sm" weight="medium">
                        {author}
                      </Text>
                      {itemFamily && (
                        <Badge variant="secondary" className="text-xs">
                          {t(`teamActivity:filters.${itemFamily}`)}
                        </Badge>
                      )}
                    </Box>
                    <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                      {factLabel(item.action_type)}
                      {item.account_id && item.company_name ? (
                        <>
                          {' · '}
                          <Link to="/accounts/$id" params={{ id: item.account_id }} className="underline">
                            {item.company_name}
                          </Link>
                        </>
                      ) : null}
                    </Text>
                  </Box>
                  {itemFamily === 'research' && (
                    <Link to="/team/recherches" className="inline-flex min-h-11 items-center text-sm underline">
                      {t('teamActivity:journal.seeResearch')}
                    </Link>
                  )}
                  <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                    {new Date(item.created_at).toLocaleString(locale, {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
      {truncated && (
        <Text size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('teamActivity:journal.truncated', { shown: shownCount, total })}
        </Text>
      )}
    </section>
  )
}
