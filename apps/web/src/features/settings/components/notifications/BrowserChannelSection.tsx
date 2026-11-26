import { useState } from 'react'
import { Badge, SettingsRow, Switch, Text } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { useTranslation } from 'react-i18next'
import { useBrowserNotificationChannel } from '@/features/notifications/hooks/useBrowserNotificationChannel'

/**
 * LE CANAL NOTIFICATION NAVIGATEUR — #1938.3.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUATRE ÉTATS, ET AUCUN NE S'AFFICHE COMME UNE ABSENCE
 * ─────────────────────────────────────────────────────────────────────────────
 * `unsupported` (le navigateur ne porte pas l'API) et `denied` (l'utilisateur
 * a déjà refusé) remplacent l'interrupteur par une phrase — jamais un
 * interrupteur désactivé qui RESSEMBLERAIT à « éteint », ce qui serait « 0 »
 * pour un état qui n'en est pas un. `default` et `granted` montrent
 * l'interrupteur normalement : cocher, dans les deux cas, passe par
 * `setChannelEnabled(true)`, qui demande la permission — la SEULE porte
 * (voir `browser-notification-channel.ts`), et ELLE n'est appelée que depuis
 * ce geste, jamais au montage.
 *
 * Ne propose AUCUN choix de type : le canal relaie le flux in-app existant
 * tel qu'il est déjà réglé plus haut sur cet écran — un interrupteur de plus
 * dupliquerait un choix qui vit déjà à un seul endroit (GA-26).
 */
export function BrowserChannelSection({ bare = false }: { bare?: boolean } = {}) {
  const { t } = useTranslation('settings', { keyPrefix: 'notifications.browser' })
  const { permission, enabled, setChannelEnabled } = useBrowserNotificationChannel()
  const [pending, setPending] = useState(false)

  function onToggle(next: boolean) {
    setPending(true)
    void setChannelEnabled(next).finally(() => setPending(false))
  }

  const blocked = permission === 'unsupported' || permission === 'denied'

  return (
    <SettingsBlock label={t('groupLabel')} bare={bare}>
      <SettingsRow
        title={t('title')}
        description={t('description')}
        badge={
          blocked ? (
            <Badge variant="outline" className="text-xs">
              {t(`statusBadge.${permission}`)}
            </Badge>
          ) : undefined
        }
        trailing={
          blocked ? undefined : (
            <Switch aria-label={t('title')} checked={enabled} disabled={pending} onCheckedChange={onToggle} />
          )
        }
      />
      {blocked && (
        <div className="border-b border-[var(--bellum-border)] px-4 py-3 last:border-b-0">
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t(`statusDetail.${permission}`)}
          </Text>
        </div>
      )}
    </SettingsBlock>
  )
}
