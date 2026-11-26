import { Badge, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import type { ActiveSession } from '@bellum/contracts'
import { Monitor } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useLogout } from '@/features/auth/hooks/useLogout'
import { useActiveSessions, useRevokeSession } from '@/features/settings/hooks/useActiveSessions'

/**
 * "Sessions actives" — the real device list backing the concurrent-session cap
 * (anti password-sharing, max `MAX_ACTIVE_DEVICES` devices — `@bellum/contracts`). Each row shows the browser/OS, IP and
 * last-seen; the current device signs out via logout, others are revoked in place.
 */
export function ActiveSessionsRow() {
  const { t } = useTranslation('settings', { keyPrefix: 'security' })
  const { t: tCommon } = useTranslation('common')
  const logout = useLogout()
  const { data: sessions, isLoading, isError } = useActiveSessions()
  const revoke = useRevokeSession()

  // #2091 — l'écran anti-partage de mot de passe : un échec de lecture n'est
  // PAS « aucune session active ». `count` ne sert qu'une fois la liste
  // effectivement mesurée (ni en chargement, ni en échec).
  const list = sessions ?? []
  const count = list.length
  const others = list.filter(session => !session.current)

  return (
    <SettingsBlock
      label={t('sessionsTitle')}
      description={isError ? t('sessionsError') : isLoading ? tCommon('states.loading') : t('sessionsDescription')}
      actions={
        others.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={revoke.isPending}
            onClick={() => others.forEach(session => revoke.mutate(session.id))}
          >
            {t('sessionsSignOutOthers')}
          </Button>
        ) : undefined
      }
    >
      {count > 0 && (
        <Table>
          <TableHeader>
            <TableRow className="border-[var(--border-subtle)]">
              <TableHead className="text-[var(--bellum-text-muted)]">{t('sessionsColumnDevice')}</TableHead>
              <TableHead className="text-[var(--bellum-text-muted)]">{t('sessionsColumnWhere')}</TableHead>
              <TableHead className="text-[var(--bellum-text-muted)]">{t('sessionsColumnLastSeen')}</TableHead>
              <TableHead className="text-right text-[var(--bellum-text-muted)]">{t('sessionsColumnAction')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map(session => (
              <SessionRow
                key={session.id}
                session={session}
                t={t}
                busy={session.current ? logout.isPending : revoke.isPending && revoke.variables === session.id}
                onSignOut={() => {
                  if (session.current) {
                    void logout.mutateAsync()
                  } else {
                    revoke.mutate(session.id)
                  }
                }}
              />
            ))}
          </TableBody>
        </Table>
      )}
      {!isLoading && !isError && count === 0 && (
        <Text size="sm" className="px-5 py-4 text-[var(--bellum-text-secondary)] sm:px-6">
          {t('sessionsEmpty')}
        </Text>
      )}
    </SettingsBlock>
  )
}

function SessionRow({
  session,
  onSignOut,
  busy,
  t,
}: {
  session: ActiveSession
  onSignOut: () => void
  busy: boolean
  t: TFunction
}) {
  return (
    <TableRow className="border-[var(--border-subtle)]">
      <TableCell>
        <span className="flex items-center gap-2">
          <Monitor size={14} className="shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden />
          <span className="text-sm font-medium">{describeDevice(t, session.user_agent)}</span>
          {session.current ? (
            <Badge variant="success" className="text-xs">
              {t('sessionsCurrent')}
            </Badge>
          ) : null}
        </span>
      </TableCell>
      <TableCell className="text-sm text-[var(--bellum-text-secondary)]">{session.ip ?? '—'}</TableCell>
      <TableCell className="text-sm text-[var(--bellum-text-secondary)]">
        {session.current ? t('sessionsNow') : relativeTime(t, session.last_seen_at)}
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={onSignOut}
          disabled={busy}
          className="min-h-11 text-[var(--danger-soft-text)] hover:bg-[var(--danger-soft-bg)] hover:text-[var(--danger-soft-text)]"
        >
          {t('sessionsSignOut')}
        </Button>
      </TableCell>
    </TableRow>
  )
}

/** Coarse browser/OS label from a user-agent string — display only. */
function describeDevice(t: TFunction, ua: string | null): string {
  if (!ua) return t('sessionsBrowserFallback')
  const browser = /Edg/.test(ua)
    ? 'Edge'
    : /OPR|Opera/.test(ua)
      ? 'Opera'
      : /Chrome/.test(ua)
        ? 'Chrome'
        : /Firefox/.test(ua)
          ? 'Firefox'
          : /Safari/.test(ua)
            ? 'Safari'
            : t('sessionsBrowserGeneric')
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad|iOS/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : ''
  return os ? `${browser} · ${os}` : browser
}

/** Short relative time ("il y a 5 min") from an ISO timestamp. */
function relativeTime(t: TFunction, iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return t('sessionsJustNow')
  if (min < 60) return t('sessionsMinutesAgo', { count: min })
  const hours = Math.floor(min / 60)
  if (hours < 24) return t('sessionsHoursAgo', { count: hours })
  const days = Math.floor(hours / 24)
  return t('sessionsDaysAgo', { count: days })
}
