import { crmImportUnread, type CrmFirstImportObjectState, type CrmFirstImportState } from '@bellum/contracts'
import { Badge, Box, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const INTEGRATIONS_ROUTE = '/integrations'

/**
 * SYNC-B — la reprise AUTOMATIQUE d'un CRM, telle qu'elle avance : une ligne PAR OBJET (« 1 240 contacts »),
 * un résumé chiffré à la fin, les erreurs NOMMÉES par objet. Jamais de spinner éternel : le serveur borne la
 * reprise dans le temps et passe à `failed` avec son message. Un chiffre non mesuré s'écrit « non mesuré »,
 * jamais « 0 ».
 */
export function FirstImportProgress({ state, crm }: { state: CrmFirstImportState; crm: string }) {
  const { t } = useTranslation('crmImport', { keyPrefix: 'firstImport' })
  const conflicts = state.objects.reduce((sum, entry) => sum + (entry.conflicts ?? 0), 0)
  // #4290.18 — jamais « tout importé » (#4051) : ce que la reprise de CE CRM ne reprend pas est nommé, avec sa raison.
  const unread = crmImportUnread(state.provider)
    .map(entry => t(`unreadReasons.${entry.reason}`, { family: t(`objectNames.${entry.family}`), crm }))
    .join(', ')

  return (
    <Box className="space-y-2 rounded-md border border-border bg-[var(--bellum-surface-2)] p-3" aria-live="polite">
      <Box display="flex" className="flex-wrap items-center gap-2">
        <Text element="p" size="sm" weight="medium">
          {t('title')}
        </Text>
        <Badge variant={state.state === 'done' ? 'success' : state.state === 'failed' ? 'warning' : 'secondary'}>
          {t(state.state, { crm })}
        </Badge>
      </Box>

      {state.objects.length > 0 ? (
        <ul className="space-y-0.5">
          {state.objects.map(entry => (
            <li key={entry.object}>
              <ObjectLine entry={entry} />
            </li>
          ))}
        </ul>
      ) : null}

      {state.state !== 'queued' && unread ? (
        <Text data-testid="first-import-unread" element="p" size="xs" color="text-muted-foreground">
          {t('unread', { families: unread })}
        </Text>
      ) : null}

      {conflicts > 0 ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {t('conflicts', { count: conflicts })}
        </Text>
      ) : null}

      {state.reconnectNeeded ? (
        <Box display="flex" className="flex-col items-start gap-1">
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('reconnect', { crm })}
          </Text>
          <Link
            to={INTEGRATIONS_ROUTE}
            className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
          >
            {t('openIntegrations')}
            <ArrowRight className="size-3.5 shrink-0" aria-hidden />
          </Link>
        </Box>
      ) : null}
    </Box>
  )
}

function ObjectLine({ entry }: { entry: CrmFirstImportObjectState }) {
  const { t } = useTranslation('crmImport', { keyPrefix: 'firstImport' })
  if (entry.status === 'failed') {
    return (
      <Text element="span" size="xs" color="text-muted-foreground">
        {t('objectError', { object: t(`objectNames.${entry.object}`), error: entry.error ?? t('notMeasured') })}
      </Text>
    )
  }
  if (entry.count === null) {
    return (
      <Text element="span" size="xs" color="text-muted-foreground">
        {t(`objectNames.${entry.object}`)} · {entry.status === 'running' ? t('inProgress') : t('pending')}
      </Text>
    )
  }
  return (
    <Text element="span" size="xs" color="text-muted-foreground">
      {entry.truncated ? `${t('atLeast')} ` : ''}
      {/* #4290.19 — rejouée sur une base déjà écrite, la reprise dit la part RECONNUE (rien n'est recréé). */}
      {entry.recognized
        ? t('recognized', { count: entry.recognized, total: t(`objects.${entry.object}`, { count: entry.count }) })
        : t(`objects.${entry.object}`, { count: entry.count })}
      {entry.status === 'running' ? ` · ${t('inProgress')}` : ''}
    </Text>
  )
}
