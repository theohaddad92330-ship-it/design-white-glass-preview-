import {
  CRM_DEAL_SIGNAL_PROVIDERS,
  CRM_INCREMENTAL_SYNC,
  CRM_TOOL_NAMES,
  CRM_WEBHOOK_PROVIDERS,
  clientToolName,
  CRM_PROVIDER_READ_SCOPE,
  CRM_READ_OBJECTS,
  type CrmFirstImportState,
  type CrmProvider,
  type CrmReadConflict,
  type CrmReadObject,
  type CrmReadStatus,
} from '@bellum/contracts'
import { CrmLastSync } from './CrmLastSync'
import { syncAgo, syncIn } from './crm-sync-when'
import { Box, Button, Text } from '@bellum/ui'
import { useState } from 'react'
import { FirstImportProgress } from '@/features/crm-import/view/FirstImportProgress'
import { useTranslation } from 'react-i18next'

/** Les champs dont l'écart a un libellé ; tout autre se dit « un champ », jamais une clé brute. */
const CONFLICT_FIELDS: Readonly<Record<string, true>> = { email: true, full_name: true, company_name: true }

/**
 * Ce que BellumAI LIT réellement de l'outil — la liste vient du CONTRAT
 * (`CRM_PROVIDER_READ_SCOPE`, mesuré sur les adaptateurs par une garde de l'API) et de rien d'autre :
 * un objet que le CRM n'expose pas n'est jamais affiché comme lu. Les lignes de synchro (date de
 * dernière synchro, erreur, fiches modifiées des deux côtés) viennent du serveur quand il les rend ;
 * sans elles, on n'invente rien.
 *
 * #3918.3 — la mention « Hors périmètre » demeure pour les fournisseurs hors `CRM_DEAL_SIGNAL_PROVIDERS` : aucune affaire lue ici ne devient un signal de
 * veille (affaire perdue, dormante, à renouveler — `crm-deal-signal-rules.ts`), parce que seule une
 * lecture profonde VÉRIFIÉE sur une instance réelle alimente le cache des affaires, et ces lectures
 * ne le sont pas encore.
 *
 * Rien tant que l'outil n'est pas branché.
 */
export function CrmReadScopeNote({
  connector,
  connected,
  status,
  firstImport,
  onKeepCrm,
  authExpired = false,
}: {
  connector: CrmProvider
  connected: boolean
  status?: CrmReadStatus | undefined
  /** CRM-SYNC-D.2 — la première reprise de CE CRM (`GET /crm/import/first-import`) ; absente = pas de ligne. */
  firstImport?: CrmFirstImportState | undefined
  /** #4189.9 — le geste « Garder la valeur du CRM » ; absent = pas de geste (note présentationnelle). */
  onKeepCrm?: ((item: CrmReadConflict) => void) | undefined
  /** #recette-21-10-K2 — l'autorisation a expiré (`action_required`) : la ligne de synchro le dit au lieu d'une date. */
  authExpired?: boolean
}) {
  const { t, i18n } = useTranslation('settings', { keyPrefix: 'integrations.crmReadScope' })
  const { t: tImport } = useTranslation('crmImport', { keyPrefix: 'firstImport.objects' })
  const [demoShown, setDemoShown] = useState(false)
  const [importShown, setImportShown] = useState(false)
  // #4290.17 — avant le branchement, un CRM sans webhook le dit déjà : la synchro est périodique (rien d'inventé : la liste vient du contrat).
  if (!connected)
    return (CRM_WEBHOOK_PROVIDERS as readonly string[]).includes(connector) ? null : (
      <Text data-testid="crm-read-scope-refresh-static" size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('refreshPollStatic')}
      </Text>
    )

  // J.2 — quand le serveur rend les objets lus (dérivés des portées ACCORDÉES), c'est lui qui fait foi ; sinon le contrat.
  const reads = status?.objects ?? CRM_PROVIDER_READ_SCOPE[connector]
  const notRead = CRM_READ_OBJECTS.filter(object => !reads.includes(object) && object !== 'owners')
  const names = (objects: readonly CrmReadObject[]) => objects.map(object => t(`objects.${object}`)).join(', ')
  const incremental = CRM_INCREMENTAL_SYNC[connector]
  const tool = CRM_TOOL_NAMES[connector]
  // SYNC-C.6 — UNE date de synchro, en relatif tant qu'elle est récente ; la prochaine, seulement si le serveur la prévoit.
  const now = new Date()
  const attempt = status?.lastAttemptAt ? syncAgo(status.lastAttemptAt, now, i18n.language) : null
  const lastAttempt = attempt === null ? null : { text: attempt.kind === 'now' ? t('attemptNow') : attempt.text }
  const nextSync = !authExpired && status?.nextSyncAt ? syncIn(status.nextSyncAt, now, i18n.language) : null
  const lastOkAt =
    status?.lastSyncAt && !Number.isNaN(Date.parse(status.lastSyncAt)) ? new Date(status.lastSyncAt) : null

  // CRM-SYNC-D.2 — « 1 240 contacts · 312 affaires » : seuls les objets MESURÉS ; un objet non mesuré n'est jamais « 0 ».
  // #4691.3 — un objet déclaré « Non lu » ne se compte JAMAIS dans la reprise : l'écran ne se contredit pas, et une
  // absence ne fait aucune ligne (GA-18/19). Le résumé et le détail dépliable lisent la même liste filtrée.
  const readImport = firstImport
    ? {
        ...firstImport,
        objects: firstImport.objects.filter(entry => !(notRead as readonly string[]).includes(entry.object)),
      }
    : undefined
  const summary = (readImport?.objects ?? [])
    .flatMap(entry => (entry.count === null ? [] : [tImport(entry.object, { count: entry.count })]))
    .join(' · ')
  const crmName = clientToolName(connector) ?? connector

  return (
    <Box data-testid="crm-read-scope" className="space-y-0.5">
      <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
        {t('title')}
      </Text>
      {reads.length > 0 ? (
        <Text data-testid="crm-read-scope-read" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('read', { objects: names(reads) })}
        </Text>
      ) : null}
      {notRead.length > 0 ? (
        <Text data-testid="crm-read-scope-not-read" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('notRead', { objects: names(notRead) })}
        </Text>
      ) : null}
      {incremental ? (
        <Text data-testid="crm-read-scope-incremental" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t(incremental.cursor === 'created_at' ? 'incrementalCreated' : 'incrementalModified')}
        </Text>
      ) : null}
      {firstImport && readImport ? (
        <Box className="space-y-1">
          <Text data-testid="crm-read-scope-first-import" size="xs" className="text-[var(--bellum-text-secondary)]">
            {firstImport.state === 'queued'
              ? t('firstImportQueued')
              : firstImport.state === 'running'
                ? summary
                  ? t('firstImportRunning', { summary })
                  : t('firstImportRunningEmpty')
                : firstImport.state === 'done'
                  ? summary
                    ? t('firstImportDone', { summary })
                    : t('firstImportDoneEmpty')
                  : firstImport.message
                    ? t('firstImportFailed', { error: firstImport.message })
                    : t('firstImportFailedEmpty')}
          </Text>
          {/* CRM-SYNC-D.3 — la reprise de CE CRM (jamais l'import de fichiers) : le détail par objet se déplie ici. */}
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            aria-expanded={importShown}
            onClick={() => setImportShown(shown => !shown)}
          >
            {t(importShown ? 'hideFirstImport' : 'viewFirstImport', { crm: crmName })}
          </Button>
          {importShown ? <FirstImportProgress state={readImport} crm={crmName} /> : null}
        </Box>
      ) : null}
      {status && authExpired ? (
        <Box className="space-y-0.5">
          <Text data-testid="crm-read-scope-last-sync" size="xs" className="text-[var(--bellum-warning-text)]">
            {t('authExpired', { crm: crmName })}
          </Text>
          {status.lastSyncAt && lastOkAt ? (
            <CrmLastSync iso={status.lastSyncAt} testId="crm-read-scope-last-ok" now={now} />
          ) : null}
        </Box>
      ) : status ? (
        status.lastSyncAt && !Number.isNaN(Date.parse(status.lastSyncAt)) ? (
          <CrmLastSync iso={status.lastSyncAt} testId="crm-read-scope-last-sync" now={now} />
        ) : (
          <Text data-testid="crm-read-scope-last-sync" size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('neverSynced')}
          </Text>
        )
      ) : null}
      {nextSync ? (
        <Text data-testid="crm-read-scope-next-sync" size="xs" className="text-[var(--bellum-text-secondary)]">
          {nextSync.kind === 'soon' ? t('nextSyncSoon') : t('nextSync', { when: nextSync.text })}
        </Text>
      ) : null}
      {status?.refresh ? (
        <Text data-testid="crm-read-scope-refresh" size="xs" className="text-[var(--bellum-text-secondary)]">
          {status.refresh.mode === 'webhook'
            ? t('refreshWebhook')
            : t('refreshPoll', { count: status.refresh.everyMinutes })}
        </Text>
      ) : null}
      {status?.lastError ? (
        <Text data-testid="crm-read-scope-error" size="xs" className="text-[var(--bellum-text-secondary)]">
          {/* #4290.16 — l'essai plus récent qui a échoué se dit avec son heure et sa raison ; la date de réussite reste l'unique « synchronisé ». */}
          {/* #4467 — la raison NOMMÉE (nom de l'outil du client) quand le serveur la connaît, sinon l'erreur brute. */}
          {(() => {
            const error = status.lastErrorHint
              ? t(`errorHints.${status.lastErrorHint}`, { crm: crmName })
              : status.lastError
            return lastAttempt ? t('lastAttemptFailed', { when: lastAttempt.text, error }) : t('lastError', { error })
          })()}
        </Text>
      ) : null}
      {status && status.conflicts > 0 ? (
        <Text data-testid="crm-read-scope-conflicts" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('conflicts', { count: status.conflicts })}
        </Text>
      ) : null}
      {status?.conflictItems?.map(item => {
        const label = t(`conflictFields.${item.field in CONFLICT_FIELDS ? item.field : 'other'}`)
        const absent = t('conflictAbsent')
        return (
          <Box key={`${item.entityType}-${item.field}-${item.at}-${item.bellumValue}-${item.crmValue}`}>
            <Text data-testid="crm-read-scope-conflict-item" size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('conflictItem', {
                field: label,
                bellum: item.bellumValue ?? absent,
                crm: item.crmValue ?? absent,
                date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(item.at)),
              })}
            </Text>
            {/* #4189.9 — un CRM qui n'annonce aucune valeur n'offre pas le geste : rien ne remplacerait la nôtre. */}
            {onKeepCrm && item.crmValue ? (
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={() => (status?.demo ? setDemoShown(true) : onKeepCrm(item))}
              >
                {t('keepCrm')}
              </Button>
            ) : null}
          </Box>
        )
      })}
      {demoShown ? (
        <Text data-testid="crm-read-scope-conflict-demo" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('keepCrmDemo')}
        </Text>
      ) : null}
      {/* #3918.7 (18/10) — la note suit le code : ces fournisseurs versent leurs affaires au cache des signaux. */}
      {(CRM_DEAL_SIGNAL_PROVIDERS as readonly CrmProvider[]).includes(connector) ? (
        <Text data-testid="crm-read-scope-deal-signals" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('dealSignals', { tool })}
        </Text>
      ) : (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('outOfScope', { tool })}
        </Text>
      )}
    </Box>
  )
}
