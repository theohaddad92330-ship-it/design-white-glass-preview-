import { advAgeDays, type AdvDossier } from '@bellum/contracts'
import { Badge, Box, Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAdvDossiers } from '@/features/adv/api'

/**
 * Théo C missions-planning.HT1 — LE FILTRE « BLOQUÉES » (ADV fondue dans le planning, Louis 22/10).
 *
 * L'écran « Administration des ventes » n'existe plus comme page : ses dossiers
 * incomplets se lisent ici, à la place de la frise, et chaque ligne ouvre le
 * dossier de la mission, là où le motif se règle. Les compteurs par motif sont
 * ceux du SERVEUR (population entière) — jamais recalculés sur les lignes.
 *
 * ⚠️ « Non mesuré » n'est jamais 0 : le motif réservé (`count: null`) le dit,
 * et un motif à zéro reste neutre, jamais peint en vert.
 */
export function PlanningBlockedPanel({ now, onClear }: { now: Date; onClear: () => void }) {
  const { t } = useTranslation(['missions', 'adv'])
  const { data, isLoading, isError } = useAdvDossiers()

  if (isLoading) {
    return (
      <Text size="sm" color="text-[var(--bellum-text-muted)]">
        {t('common:states.loading')}
      </Text>
    )
  }
  if (isError || !data) {
    // Une panne de lecture se REMARQUE : « aucune mission bloquée » serait un faux vert.
    return (
      <Box className="rounded-md border border-[var(--danger-soft-border)] bg-[var(--danger-soft)] p-3">
        <Text size="sm" color="text-[var(--danger-soft-text)]">
          {t('missions:planning.blocked.loadFailed')}
        </Text>
      </Box>
    )
  }

  const rows = data.items.filter(item => item.state === 'incomplete')

  return (
    <Box className="space-y-3" data-slot="planning-blocked">
      <Box display="flex" className="flex-wrap items-start justify-between gap-2">
        <Box className="min-w-0">
          <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
            {t('missions:planning.blocked.kicker')}
          </Text>
          {rows.length > 0 ? (
            <Text element="h2" size="lg" weight="semibold">
              {t('missions:planning.blocked.title', { count: rows.length })}
            </Text>
          ) : (
            <Text element="h2" size="lg" weight="semibold">
              {t('missions:planning.blocked.none')}
            </Text>
          )}
          <Text size="sm" color="text-[var(--bellum-text-muted)]">
            {t('missions:planning.blocked.description')}
          </Text>
        </Box>
        <Button type="button" size="sm" variant="outline" className="pointer-coarse:min-h-11" onClick={onClear}>
          {t('missions:planning.blocked.clear')}
        </Button>
      </Box>

      {rows.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {rows.map(row => (
            <BlockedRow key={`${row.missionId}-${row.kind}`} row={row} now={now} />
          ))}
        </ul>
      ) : null}

      <ul aria-label={t('missions:planning.blocked.countersLabel')} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {data.summary.byBlocker.map(entry => (
          <li key={entry.blocker} className="rounded-md border border-border bg-card p-3">
            <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
              {t(`adv:blockers.${entry.blocker}`)}
            </Text>
            {entry.count === null ? (
              <>
                <Text element="p" size="sm" weight="medium">
                  {t('missions:planning.blocked.notMeasured')}
                </Text>
                <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
                  {t('missions:planning.blocked.notMeasuredHint')}
                </Text>
              </>
            ) : (
              <Text element="p" size="sm" weight="medium">
                {t('missions:planning.blocked.dossiers', { count: entry.count })}
              </Text>
            )}
          </li>
        ))}
      </ul>

      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('missions:planning.blocked.footnote')}
      </Text>
    </Box>
  )
}

function BlockedRow({ row, now }: { row: AdvDossier; now: Date }) {
  const { t } = useTranslation(['missions', 'adv'])
  const age = advAgeDays(row.openedOn, now)
  return (
    <li data-row className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
      <Box className="min-w-0">
        <Text size="sm" weight="medium">
          {row.missionLabel ?? t('missions:planning.unnamedMission')}
        </Text>
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {[row.accountName, t(`adv:kinds.${row.kind}`)].filter(Boolean).join(' · ')}
        </Text>
      </Box>
      <Box display="flex" className="flex-wrap items-center gap-1">
        {row.blockers.map(blocker => (
          <Badge key={blocker} variant="secondary">
            {t(`adv:blockers.${blocker}`)}
          </Badge>
        ))}
      </Box>
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {age === null ? t('missions:planning.blocked.ageUnknown') : t('missions:planning.blocked.age', { count: age })}
      </Text>
      <Button asChild size="sm" variant="outline" className="pointer-coarse:min-h-11">
        <Link to="/missions/$id" params={{ id: row.missionId }}>
          {t('missions:planning.blocked.open')}
        </Link>
      </Button>
    </li>
  )
}
