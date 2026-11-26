import { Badge, Box, Button, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { atsConnectionState, atsConnectionStatus, connectionStatusLabel } from '@/lib/connection-status'
import { useAtsStatus, useConnectAts, useDisconnectAts, useTestAts } from '../api'
import { availableAtsWrites } from '../model/ats-write-capabilities'

/** Le retour de l'éditeur (`/integrations?ats=connected|error&reason=…`), lu une fois. */
function readReturn(): { ats: 'connected' | 'error'; reason: string | null } | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const ats = params.get('ats')
  if (ats !== 'connected' && ats !== 'error') return null
  return { ats, reason: params.get('reason') }
}

/**
 * La carte « ATS / ERP » de Réglages › Intégrations.
 *
 * C'est le SEUL écran du produit qui a le droit de nommer l'éditeur (doctrine du
 * 02/08) : un bouton « Connecter » doit dire ce qu'il connecte. Partout ailleurs
 * on parle de « ton ATS ».
 *
 * #4688 — plus aucun champ de secret : la Marketplace BoondManager impose OAuth2.
 * Un seul geste, « Connecter mon BoondManager », envoie chez l'éditeur et ramène ici.
 * Ce que la carte dit et qu'un formulaire ordinaire tairait :
 *
 * - **l'état exact** : non branché, branché (avec la date du dernier échange réussi,
 *   absente quand on ne la sait pas), ou à reconnecter ;
 * - **d'où vient la connexion** : configuration serveur, ou mode jeton hérité à migrer ;
 * - **ce que Bellum peut ÉCRIRE** dans l'ERP, et sous quelle porte.
 */
export function AtsCard() {
  const { t, i18n } = useTranslation('integrations')
  const { t: tCenter } = useTranslation('integrationCenter')
  const { data: status } = useAtsStatus()
  const connect = useConnectAts()
  const disconnect = useDisconnectAts()
  const check = useTestAts()

  const state = atsConnectionState(status)
  // #4691.3 — une écriture dont le scope n'est pas accordé n'est pas proposée (au lieu de l'être puis d'échouer).
  const writes = availableAtsWrites(status)
  // Les trois états viennent de la définition de la carte (#4689) ; l'héritage et le serveur gardent leur précision.
  const sharedStatus = atsConnectionStatus(state)
  const stateLabel = sharedStatus ? connectionStatusLabel(tCenter, sharedStatus) : t(`ats.state.${state}`)
  const returned = readReturn()
  const oauthAvailable = Boolean(status?.oauthAvailable)
  const lastExchange = status?.lastExchangeAt
    ? new Date(status.lastExchangeAt).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })
    : null
  const canDisconnect = state === 'connected' || state === 'needs_reconnect' || state === 'legacy'
  const connectLabel = state === 'needs_reconnect' ? t('ats.reconnect') : t('ats.connect')

  return (
    <Box className="space-y-3 rounded-xl border border-[var(--bellum-border)] p-4">
      <Box className="flex flex-wrap items-start justify-between gap-3">
        <Box className="space-y-1">
          <Box className="flex flex-wrap items-center gap-2">
            <Text weight="medium">{t('ats.title')}</Text>
            <Badge variant="outline" className="text-xs">
              {stateLabel}
            </Badge>
          </Box>
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('ats.description')}
          </Text>
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('ats.writeNotice')}
          </Text>
          {writes.length > 0 ? (
            <ul className="list-disc pl-5 text-xs text-[var(--bellum-text-secondary)]">
              {writes.map(key => (
                <li key={key}>{t(`ats.writes.${key}`)}</li>
              ))}
            </ul>
          ) : (
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {t('ats.writeNone')}
            </Text>
          )}
        </Box>
        {canDisconnect ? (
          <Button
            size="sm"
            variant="outline"
            className="min-h-11"
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
          >
            {t('ats.disconnect')}
          </Button>
        ) : null}
      </Box>

      {state === 'connected' ? (
        <Text size="sm" color="text-[var(--bellum-text-secondary)]">
          {lastExchange ? t('ats.lastExchange', { date: lastExchange }) : t('ats.connectedNoDate')}
          {status?.instanceLabel ? ` · ${status.instanceLabel}` : ''}
        </Text>
      ) : null}
      {state === 'connected' && status?.scopes ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('ats.scopes', { scopes: status.scopes })}
        </Text>
      ) : null}
      {state === 'connected' ? (
        <Box className="space-y-1">
          <Button
            size="sm"
            variant="outline"
            className="min-h-11"
            onClick={() => check.mutate()}
            disabled={check.isPending}
          >
            {check.isPending ? t('ats.checking') : t('ats.check')}
          </Button>
          {check.data && !check.data.reachable ? (
            <Text size="xs" className="text-[var(--danger-soft-text)]">
              {t('ats.unreachable')}
            </Text>
          ) : null}
          {/* #4688.11 — les avertissements rendus par l'éditeur, nommés ; une liste vide ne fait aucune ligne. */}
          {check.data?.warnings.length ? (
            <ul className="list-disc pl-5 text-xs text-[var(--bellum-text-secondary)]">
              {check.data.warnings.map(code => (
                <li key={code}>
                  {t(`ats.warnings.${code}`, { defaultValue: t('ats.warnings.other', { code }), code })}
                </li>
              ))}
            </ul>
          ) : null}
        </Box>
      ) : null}
      {state === 'needs_reconnect' ? (
        <Text size="sm" className="text-[var(--danger-soft-text)]">
          {t('ats.needsReconnectHelp')}
        </Text>
      ) : null}
      {state === 'legacy' ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('ats.legacyNotice')}
        </Text>
      ) : null}
      {state === 'environment' ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('ats.environmentNotice')}
        </Text>
      ) : null}

      {returned?.ats === 'error' ? (
        <Text size="sm" className="text-[var(--danger-soft-text)]">
          {t(`ats.returnError.${returned.reason === 'access_denied' ? 'access_denied' : 'generic'}`)}
        </Text>
      ) : null}

      {state !== 'connected' ? (
        oauthAvailable ? (
          <Box className="flex flex-wrap items-center gap-2">
            <Button className="min-h-11" onClick={() => connect.mutate()} disabled={connect.isPending}>
              {connect.isPending ? t('ats.connecting') : connectLabel}
            </Button>
            {connect.isError ? (
              <Text size="xs" className="text-[var(--danger-soft-text)]">
                {(connect.error as Error).message}
              </Text>
            ) : null}
          </Box>
        ) : (
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('ats.notAvailable')}
          </Text>
        )
      ) : null}
    </Box>
  )
}
