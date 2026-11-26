import { Box, Text } from '@bellum/ui'
import type { ConnectedTool } from '@bellum/contracts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCrmReadStatus } from '@/features/crm-import/api'
import { formatDateTime } from '@/lib/locale'
import { useLatestSyncRun } from '../api'
import { findToolForProvider } from '../lib/sync-tool-lookup'
import { FirstSyncCta } from './FirstSyncCta'
import { SyncLaunchFlow } from './SyncLaunchFlow'
import { SyncSummary } from './SyncSummary'

/**
 * #3014 — recette du 25/09/2026 : un connecteur connecté n'affichait jamais le
 * geste « Synchroniser et comprendre mes données » ni son résumé, alors que les
 * deux existaient déjà, testés — `useLatestSyncRun` (`../api.ts`) et
 * `<SyncSummary>` n'avaient simplement AUCUN appelant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI `IntegrationCenterPage` NE PORTE PLUS CE GESTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `readyToSyncProvider` n'y vivait QUE dans l'effet qui lit le callback OAuth —
 * donc jamais pour un connecteur déjà connecté avant cette page (rechargement,
 * session suivante), et jamais pour Odoo, qui n'a pas de callback OAuth du tout
 * (formulaire, #1446). Ce panneau lit l'état RÉEL du connecteur — `last_sync`
 * du registre, et le dernier run connu — au lieu d'un événement de navigation
 * qui ne se reproduit qu'une fois.
 *
 * Il vit à l'ENDROIT de la carte, jamais aussi en bandeau de tête : loi 4 du
 * tome 7, « un connecteur ne se montre pas deux fois sur le même écran ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RECETTE DU 26/09/2026 (#3014, second passage) — le geste restait absent
 * ─────────────────────────────────────────────────────────────────────────────
 * Le premier correctif ne montrait le geste QUE si `neverSynced` (aucun
 * `last_sync` connu) : un compte réel, synchronisé par le passé par un chemin
 * antérieur à cette capacité (`last_sync` connu, aucun run `completed` connu
 * ICI), tombait dans la branche texte-seul — sur un compte aux 8 connecteurs
 * déjà branchés, ÇA FAIT ZÉRO GESTE SUR TOUTE LA PAGE. Tranché sans Louis :
 * le geste est TOUJOURS visible sur une carte connectée, quel que soit ce que
 * `useLatestSyncRun` sait — seul son libellé change (`FirstSyncCta`
 * `resync={!neverSynced}`), avec la même prévisualisation avant lancement.
 */
/** La synchro la plus récente que le registre connaisse (toutes les lignes de la carte) ; `null` ⇒ aucune date. */
function latestRegistrySync(tools: readonly ConnectedTool[] | undefined): Date | null {
  return (tools ?? []).reduce<Date | null>((latestSeen, tool) => {
    if (!tool.last_sync) return latestSeen
    const at = new Date(tool.last_sync)
    if (Number.isNaN(at.getTime())) return latestSeen
    return latestSeen === null || at > latestSeen ? at : latestSeen
  }, null)
}

export function ConnectorSyncStatus({
  provider,
  name,
  tools,
}: {
  /** L'identifiant de synchro (`POST /tools/:provider/sync-runs`) — celui du
   *  CONNECTEUR (ex. `google`), pas nécessairement celui d'une ligne de
   *  registre précise (`gmail`). */
  provider: string
  name: string
  tools?: readonly ConnectedTool[]
}) {
  const { t } = useTranslation('integrationCenter')
  const [flowOpen, setFlowOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const connected = (tools ?? []).some(tool => tool.status === 'connected')
  // #recette-21-10-K2 — une autorisation expirée n'est plus « branché » (pas de geste de synchro), mais sa
  // dernière synchro RÉUSSIE reste lisible, datée.
  const expired = !connected && (tools ?? []).some(tool => tool.status === 'action_required')
  const latest = useLatestSyncRun(provider, connected)
  // K.5 — un CRM dont la première reprise n'a jamais eu lieu n'a PAS de « dernière synchronisation » :
  // un run clos sans reprise ne se lit pas « Rien de nouveau », la carte aurait deux vérités.
  const crmRead = useCrmReadStatus(connected)
  const crmStatus = crmRead.data?.find(status => status.provider === provider)
  const neverRead = crmStatus?.lastSyncAt === null

  if (!connected && expired) {
    const lastOk = latestRegistrySync(tools)
    if (!lastOk) return null
    return (
      <Box className="space-y-1">
        <Text size="xs" weight="semibold">
          {t('syncSummary.lastSyncTitle')}
        </Text>
        <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="connector-last-sync-at">
          {formatDateTime(lastOk)}
        </Text>
      </Box>
    )
  }
  if (!connected) return null

  if (flowOpen) {
    return (
      <SyncLaunchFlow
        provider={provider}
        name={name}
        tool={findToolForProvider(tools ?? [], provider)}
        onClose={() => setFlowOpen(false)}
      />
    )
  }

  // Le premier chargement du run le plus récent : on ne devine rien avant de
  // savoir s'il y en a un — ni le résumé, ni le CTA, qui se contrediraient.
  if (latest.isLoading) return null

  // Deux cas très différents pour ce qui précède le geste, jamais sur son
  // affichage : un run `completed` connu → le résumé réel (jamais un chiffre
  // inventé) ; sinon, déjà synchronisé par un chemin ANTÉRIEUR à cette
  // capacité (`last_sync` connu, aucun run `completed` connu ICI) → on le
  // DIT, on n'invente jamais un résumé.
  const neverSynced = (tools ?? []).every(tool => tool.last_sync === null)
  const completedSummary =
    !neverRead && latest.data && latest.data.status === 'completed' && latest.data.summary ? latest.data.summary : null

  // La synchro la plus récente que le registre connaisse (toutes les lignes de la carte) ; `null` ⇒ aucune date.
  const lastSyncAt = latestRegistrySync(tools)

  if (neverSynced && dismissed) return null

  return (
    <Box className="space-y-2">
      {/* V4-CORRECTIFS 4290.2 (#4189/#4184.4) — UN SEUL bloc « Dernière synchronisation », pour tout CRM branché, avec
          la date ABSOLUE (`last_sync` du registre, la plus récente). Avant : seul un run clos avec résumé le portait,
          Salesforce n'avait ni titre ni date. Aucune synchro connue ⇒ rien : jamais un « Jamais vérifié » inventé. */}
      {completedSummary || (!neverSynced && !neverRead) ? (
        <Box className="space-y-1">
          <Text size="xs" weight="semibold">
            {t('syncSummary.lastSyncTitle')}
          </Text>
          {/* #4290.16 — le serveur rend le statut de CE CRM : sa date (la dernière synchro RÉUSSIE) est dite par la note
              de périmètre, une fois ; le registre ne la redit pas (c'était la seconde date, contradictoire). */}
          {lastSyncAt && !crmStatus ? (
            <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="connector-last-sync-at">
              {formatDateTime(lastSyncAt)}
            </Text>
          ) : null}
          {completedSummary ? (
            <SyncSummary lines={completedSummary} />
          ) : (
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {t('syncSummary.predatesCapacity')}
            </Text>
          )}
        </Box>
      ) : null}
      <FirstSyncCta
        name={name}
        resync={!neverSynced}
        onLaunch={() => setFlowOpen(true)}
        onDismiss={neverSynced ? () => setDismissed(true) : undefined}
      />
    </Box>
  )
}
