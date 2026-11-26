import { accessLevelToRequest, OAUTH_ACCESS_LEVELS, type OAuthAccessLevel } from '@bellum/contracts'
import { Box, Button, Text, cn } from '@bellum/ui'
import {
  Calendar,
  CalendarClock,
  Check,
  FileEdit,
  FileText,
  MailOpen,
  Minus,
  Send,
  Table2,
  type LucideIcon,
} from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { googleApi, type GoogleCapabilities } from '@/features/google/api'
import { GOOGLE_STATUS_KEY, useGoogleStatus } from '@/features/google/hooks/useGoogleStatus'
import type { ConnectorCardProps } from './connector-card-map'
import { ConnectorDiagnostics } from './ConnectorDiagnostics'
import { GoogleMailboxes } from './GoogleMailboxes'
import { CONNECTOR_ICONS } from './connector-icons'
import { OAuthProviderCard } from './OAuthProviderCard'
import { ConnectorSyncStatus } from '../ConnectorSyncStatus'

/**
 * Chaque capacité dit le NIVEAU qui l'ouvre — #2078.22. Une capacité d'écriture
 * éteinte sur une connexion en lecture seule l'est À DESSEIN : elle ne déclenche
 * pas l'invite « de nouvelles capacités sont disponibles ».
 */
const GOOGLE_CAP_ROWS: {
  key: keyof GoogleCapabilities
  icon: LucideIcon
  labelKey: string
  level: OAuthAccessLevel
}[] = [
  { key: 'calendar', icon: Calendar, labelKey: 'googleCap.calendar', level: 'read_write' },
  { key: 'calendarRead', icon: CalendarClock, labelKey: 'googleCap.calendarRead', level: 'read' },
  { key: 'gmail', icon: Send, labelKey: 'googleCap.gmail', level: 'read_write' },
  { key: 'gmailRead', icon: MailOpen, labelKey: 'googleCap.gmailRead', level: 'read' },
  { key: 'gmailDraft', icon: FileEdit, labelKey: 'googleCap.gmailDraft', level: 'read_write' },
  { key: 'drive', icon: FileText, labelKey: 'googleCap.drive', level: 'read' },
  { key: 'sheets', icon: Table2, labelKey: 'googleCap.sheets', level: 'read_write' },
]

/**
 * #2078.22 — le choix du niveau, AVANT la redirection vers le consentement.
 * Des boutons radio natifs dans des `<label>` de 44 px (GA-30) : ils se
 * tabulent et s'annoncent sans rien réinventer (GA-35).
 */
function AccessLevelChoice({
  value,
  onChange,
}: {
  value: OAuthAccessLevel
  onChange: (level: OAuthAccessLevel) => void
}) {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations' })
  const name = useId()
  return (
    <fieldset className="min-w-0 space-y-1.5">
      <legend className="mb-1 text-xs font-medium text-[var(--bellum-text-secondary)]">
        {t('googleAccess.legend')}
      </legend>
      <Box display="grid" className="grid-cols-1 gap-2 sm:grid-cols-2">
        {OAUTH_ACCESS_LEVELS.map(level => {
          const checked = value === level
          return (
            <label
              key={level}
              className={cn(
                'flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border p-3 text-xs transition-colors',
                'focus-within:ring-2 focus-within:ring-[var(--bellum-primary-500)]',
                checked
                  ? 'border-[var(--bellum-primary-500)] bg-[var(--bellum-surface-2)] text-[var(--bellum-text-primary)]'
                  : 'border-[var(--bellum-border)] text-[var(--bellum-text-secondary)]',
              )}
            >
              <input
                type="radio"
                name={name}
                value={level}
                checked={checked}
                onChange={() => onChange(level)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--bellum-primary-500)]"
              />
              <span className="min-w-0">
                <span className="block font-medium">{t(`googleAccess.option.${level}.title`)}</span>
                <span className="block text-[var(--bellum-text-muted)]">{t(`googleAccess.option.${level}.hint`)}</span>
              </span>
            </label>
          )
        })}
      </Box>
    </fieldset>
  )
}

export function GoogleWorkspaceCard({ state, tools }: ConnectorCardProps) {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations' })
  const { data, isLoading } = useGoogleStatus()
  const [reconnecting, setReconnecting] = useState<OAuthAccessLevel | null>(null)
  // #2078.22 — lecture seule cochée par défaut : le moindre privilège, et
  // l'écriture se demande au moment où un geste en a besoin (#2078.23).
  const [chosenLevel, setChosenLevel] = useState<OAuthAccessLevel>('read')
  const caps = data?.capabilities
  const connected = data?.connected ?? false
  const grantedLevel = connected ? (data?.accessLevel ?? null) : null

  const redirect = async (level: OAuthAccessLevel) => {
    setReconnecting(level)
    try {
      const { url } = await googleApi.connectUrl(level)
      window.location.href = url
    } catch {
      toast.error(t('providerConnectError', { name: 'Google Workspace' }))
      setReconnecting(null)
    }
  }

  // Une reconnexion GARDE le niveau accordé : elle ne rétrograde pas une
  // connexion en écriture, et n'élève pas une connexion en lecture.
  // #2078.22 — un niveau INCONNU (portée vide ou non reconnue par le
  // serveur) n'est PAS traité comme « lecture » : on ignore ce qui a été
  // réellement accordé, donc la reconnexion redemande le niveau le plus
  // large plutôt que de risquer une rétrogradation silencieuse.
  const keepLevel = connected && grantedLevel === null ? 'read_write' : accessLevelToRequest(grantedLevel, 'read')
  const expected = GOOGLE_CAP_ROWS.filter(row => grantedLevel === 'read_write' || row.level === 'read')
  // Un compte connecté avant un élargissement de portées n'a pas les nouvelles
  // capacités : on propose alors une reconnexion plutôt que de mentir.
  const anyMissing = connected && caps ? expected.some(row => !caps[row.key]) : false

  return (
    <OAuthProviderCard
      state={state}
      tools={tools}
      icon={CONNECTOR_ICONS.google}
      connector="google"
      name="Google Workspace"
      description={t('googleDescription')}
      api={{
        // Première connexion ET reconnexion d'un jeton expiré : le niveau choisi
        // avant de connecter, ou celui déjà accordé.
        connectUrl: () => googleApi.connectUrl(connected ? keepLevel : chosenLevel),
        disconnect: () => googleApi.disconnect(),
      }}
      statusKey={GOOGLE_STATUS_KEY}
      status={data}
      isLoading={isLoading}
      accountFallback={t('googleAccountFallback')}
      connectOptions={<AccessLevelChoice value={chosenLevel} onChange={setChosenLevel} />}
    >
      <Box className="space-y-3">
        {/*
         * #2078.22 — le niveau peut être INCONNU (`null`) sur une connexion
         * EXISTANTE : portée vide ou non reconnue par le serveur. On le montre
         * quand même (garde sur `connected`, pas sur `grantedLevel`) et on
         * propose « Autoriser l'écriture » comme pour une connexion en
         * lecture seule — sinon un refus « autorise l'écriture depuis
         * Intégrations » mène à une impasse : rien à cliquer.
         */}
        {connected ? (
          <Box display="flex" className="flex-wrap items-center justify-between gap-2">
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {t('googleAccess.current', { level: t(`googleAccess.levelName.${grantedLevel ?? 'unknown'}`) })}
            </Text>
            {grantedLevel !== 'read_write' ? (
              <Button
                variant="outline"
                size="sm"
                isLoading={reconnecting === 'read_write'}
                onClick={() => void redirect('read_write')}
              >
                {t('googleAccess.elevate')}
              </Button>
            ) : null}
          </Box>
        ) : null}
        {connected && grantedLevel !== 'read_write' ? (
          <Text size="xs" color="text-[var(--text-ghost)]">
            {t('googleAccess.elevateHint')}
          </Text>
        ) : null}
        {/* #4546.4 — les boîtes branchées, « en ajouter une » (le consentement garde le niveau déjà accordé) et le
            débranchement d'UNE boîte. */}
        {connected ? (
          <GoogleMailboxes onAdd={() => void redirect(keepLevel)} adding={reconnecting === keepLevel} />
        ) : null}

        <Box display="grid" className="grid-cols-1 gap-1.5 sm:grid-cols-2">
          {GOOGLE_CAP_ROWS.map(row => {
            const on = caps?.[row.key] ?? false
            const Icon = row.icon
            return (
              <Box key={row.key} display="flex" className="items-center gap-1.5">
                {on ? (
                  <Check className="size-3.5 shrink-0 text-[var(--success-soft-text)]" aria-hidden />
                ) : (
                  <Minus className="size-3.5 shrink-0 text-[var(--text-ghost)]" aria-hidden />
                )}
                <Icon className="size-3.5 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden />
                <Text size="xs" color={on ? 'text-[var(--bellum-text-primary)]' : 'text-[var(--text-ghost)]'}>
                  {t(row.labelKey)}
                </Text>
              </Box>
            )
          })}
        </Box>

        {anyMissing && (
          <Box display="flex" className="items-center justify-between gap-2">
            <Text size="xs" color="text-[var(--text-ghost)]">
              {t('googleReconnectHint')}
            </Text>
            <Button
              variant="outline"
              size="sm"
              isLoading={reconnecting === keepLevel}
              onClick={() => void redirect(keepLevel)}
            >
              {t('googleReconnect')}
            </Button>
          </Box>
        )}
      </Box>
      {tools?.map(tool => (
        <ConnectorDiagnostics key={tool.provider} tool={tool} />
      ))}
      <ConnectorSyncStatus provider="google" name="Google Workspace" tools={tools} />
    </OAuthProviderCard>
  )
}
