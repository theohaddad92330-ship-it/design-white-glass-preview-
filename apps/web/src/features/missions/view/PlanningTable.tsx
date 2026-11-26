import { Badge, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { formatDate } from '@/lib/locale'
import { assigneesOf, type MissionView } from '../api'
import type { MissionSituation } from '../planning-views'
import { MissionRenewalStatus } from './MissionRenewalStatus'
import { RowMissionMenu } from './PlanningRowMenu'

type PlanningTableRow = {
  mission: MissionView
  label: string
  situation: MissionSituation
}

const SITUATION_VARIANT = {
  running: 'success',
  renewal: 'warning',
  starting: 'primary',
  ending: 'warning',
} as const satisfies Record<MissionSituation, 'success' | 'warning' | 'primary'>

/**
 * Théo missions-planning.R5 — LE TABLEAU : six colonnes, le même composant que
 * toutes les listes (`ResponsiveTable`).
 *
 * Mission / consultant · Compte · Dates prévues · Situation · Renouvellement (#4197.4) · Responsable. Les
 * soixante-huit colonnes de la liste complète vivent toujours dans « Liste des
 * missions » : rien n'est retiré, le tableau du planning répond seulement à
 * « qui, où, jusqu'à quand ». Une date absente s'écrit « — », jamais une date
 * supposée.
 */
export function PlanningTable({
  rows,
  onOpen,
}: {
  rows: readonly PlanningTableRow[]
  onOpen: (mission: MissionView) => void
}) {
  const { t } = useTranslation('missions')
  const short = (iso: string | null | undefined) =>
    iso ? (formatDate(iso, { day: 'numeric', month: 'short', timeZone: 'UTC' }) ?? iso) : null

  return (
    <ResponsiveTable
      rows={rows}
      rowKey={row => row.mission.id}
      onRowClick={row => onOpen(row.mission)}
      scrollLabel={t('planning.screen.table.label')}
      columns={[
        {
          key: 'mission',
          header: t('planning.screen.table.mission'),
          mobile: 'title',
          render: row => {
            const people = assigneesOf(row.mission)
            return (
              <span className="flex min-w-0 items-center gap-3">
                <ContactAvatar name={people[0]?.fullName} photoUrl={people[0]?.photoUrl} size="sm" />
                <span className="min-w-0">
                  <Link
                    to="/missions/$id"
                    params={{ id: row.mission.id }}
                    className="block font-medium hover:underline"
                  >
                    {row.label}
                  </Link>
                  <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
                    {people.length > 0
                      ? people.map(person => person.fullName).join(' · ')
                      : t('planning.screen.table.unstaffed')}
                  </Text>
                </span>
              </span>
            )
          },
        },
        {
          key: 'account',
          header: t('planning.screen.table.account'),
          mobile: 'meta',
          render: row =>
            row.mission.accountName ? (
              <Link to="/accounts/$id" params={{ id: row.mission.account_id }} className="hover:underline">
                {row.mission.accountName}
              </Link>
            ) : (
              t('unknownAccount')
            ),
        },
        {
          key: 'dates',
          header: t('planning.screen.table.dates'),
          render: row => {
            const start = short(row.mission.started_on)
            const end = short(row.mission.ends_on)
            return (
              <span className="whitespace-nowrap">
                {start ?? <UnknownValue reason={t('planning.availability.unknown')} />}
                <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
                  {` → ${end ?? t('planning.availability.unknown')}`}
                </Text>
              </span>
            )
          },
        },
        {
          key: 'situation',
          header: t('planning.screen.table.situation'),
          render: row => (
            <Badge variant={SITUATION_VARIANT[row.situation]}>{t(`planning.screen.situation.${row.situation}`)}</Badge>
          ),
        },
        {
          // #4197.4 — l'état du renouvellement de la mission (même rendu que la liste : `MissionRenewalStatus`).
          // Inconnu (absent ou jamais ouvert) → « — » avec sa raison, jamais « 0 ».
          key: 'renewal',
          header: t('planning.screen.table.renewal'),
          render: row =>
            row.mission.renewal_status ? (
              <MissionRenewalStatus status={row.mission.renewal_status} />
            ) : (
              <UnknownValue discreet reason={t('planning.screen.table.renewalUnknown')} />
            ),
        },
        {
          key: 'owner',
          header: t('planning.screen.table.owner'),
          render: row => row.mission.ownerName ?? <UnknownValue reason={t('planning.screen.table.unknownOwner')} />,
        },
        {
          key: 'actions',
          header: '',
          className: 'w-12',
          render: row => <RowMissionMenu mission={row.mission} />,
        },
      ]}
    />
  )
}
