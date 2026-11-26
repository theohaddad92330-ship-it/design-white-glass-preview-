import { Injectable, Logger, NotFoundException, Optional, UnauthorizedException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { CrmReadSyncService } from '../crm/crm-read-sync.service'
import { CrmFrequentSyncService } from '../crm-sync/crm-frequent-sync.service'
import { CrmSyncService } from '../crm-sync/crm-sync.service'
import { CRM_WEBHOOK_PROVIDERS, CRM_WEBHOOK_SECRET_ENV, type CrmWebhookProvider } from '../crm-sync/crm-sync-schedule'
import { verifyHubspotSignatureV3, verifySharedSecretSignature } from './crm-webhook-signature'

export { CRM_WEBHOOK_PROVIDERS, type CrmWebhookProvider }

/** Les variables (`agent_docs/env-reference.md`). Sans elles : no-op STRICT, la route répond 404. */

type IncomingWebhook = {
  rawBody: Buffer
  headers: Record<string, string | undefined>
  /** L'URI COMPLÈTE appelée (HubSpot la signe). */
  uri: string
  method: string
}

type WebhookOutcome = { accepted: number; duplicates: number; unknownAccounts: number }

/** Un événement lu : son identifiant (idempotence) et le compte CRM qui l'émet (→ l'espace). */
type ParsedEvent = { eventId: string; externalAccountId: string }

function parseEvents(provider: CrmWebhookProvider, rawBody: Buffer): ParsedEvent[] {
  let body: unknown
  try {
    body = JSON.parse(rawBody.toString('utf8'))
  } catch {
    return []
  }
  // HubSpot envoie un TABLEAU d'événements (`eventId`, `portalId`) ; Salesforce, le corps documenté
  // dans `env-reference.md` : `{ "eventId": "…", "organizationId": "…" }` (un seul, ou `events: [...]`).
  const list: unknown[] = Array.isArray(body)
    ? body
    : Array.isArray((body as { events?: unknown[] })?.events)
      ? ((body as { events: unknown[] }).events ?? [])
      : [body]
  return list.flatMap(item => {
    const row = (item ?? {}) as Record<string, unknown>
    const eventId = String(row['eventId'] ?? '').trim()
    const account = String((provider === 'hubspot' ? row['portalId'] : row['organizationId']) ?? '').trim()
    return eventId && account && eventId.length <= 200 ? [{ eventId, externalAccountId: account }] : []
  })
}

/**
 * La porte du webhook : le secret du fournisseur, puis la signature sur le corps brut. Lue par
 * `CrmWebhookSignatureGuard` AVANT la route (GA-05), et rejouée par `receive` (défense en profondeur).
 */
export function assertCrmWebhookSignature(provider: CrmWebhookProvider, incoming: IncomingWebhook): void {
  const secret = (process.env[CRM_WEBHOOK_SECRET_ENV[provider]] ?? '').trim()
  // Sans secret : la route n'existe pas (no-op strict, aucun appel, aucune écriture).
  if (!secret) throw new NotFoundException()
  const valid =
    provider === 'hubspot'
      ? verifyHubspotSignatureV3({
          secret,
          method: incoming.method,
          uri: incoming.uri,
          rawBody: incoming.rawBody,
          timestamp: incoming.headers['x-hubspot-request-timestamp'],
          signature: incoming.headers['x-hubspot-signature-v3'],
        })
      : verifySharedSecretSignature({
          secret,
          rawBody: incoming.rawBody,
          timestamp: incoming.headers['x-bellum-timestamp'],
          signature: incoming.headers['x-bellum-signature'],
        })
  if (!valid) throw new UnauthorizedException('Signature invalide.')
}

/**
 * #4189.7 — Décision Louis 15/10/2026 : un webhook entrant HubSpot ou Salesforce déclenche une
 * synchro CIBLÉE (l'espace qui a branché ce CRM, jamais tout le parc) ; la synchro quotidienne
 * reste le filet. Signature vérifiée sur le corps brut, rejet si invalide, idempotence par
 * identifiant d'événement (`crm_webhook_events`), débit limité au contrôleur.
 */
@Injectable()
export class CrmWebhooksService {
  private readonly logger = new Logger(CrmWebhooksService.name)

  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly readSync?: CrmReadSyncService,
    @Optional() private readonly hubspotSync?: CrmSyncService,
    // SYNC-C.5 — la synchro ciblée passe par la file (verrou, budget, recul) ; absente, l'ancien chemin direct.
    @Optional() private readonly frequent?: CrmFrequentSyncService,
  ) {}

  async receive(provider: CrmWebhookProvider, incoming: IncomingWebhook): Promise<WebhookOutcome> {
    assertCrmWebhookSignature(provider, incoming)

    const outcome: WebhookOutcome = { accepted: 0, duplicates: 0, unknownAccounts: 0 }
    const toSync = new Map<string, { workspaceId: string; userId: string }>()
    for (const event of parseEvents(provider, incoming.rawBody)) {
      const [connection] = await this.dataSource.query<Array<{ workspace_id: string | null; user_id: string }>>(
        `SELECT workspace_id, user_id FROM crm_connections WHERE provider = $1 AND external_account_id = $2 LIMIT 1`,
        [provider, event.externalAccountId],
      )
      if (!connection?.workspace_id) {
        outcome.unknownAccounts += 1
        continue
      }
      const inserted = await this.dataSource.query<Array<{ id: string }>>(
        `INSERT INTO crm_webhook_events (workspace_id, provider, event_id) VALUES ($1, $2, $3)
         ON CONFLICT (provider, event_id) DO NOTHING RETURNING id`,
        [connection.workspace_id, provider, event.eventId],
      )
      if (inserted.length === 0) {
        outcome.duplicates += 1
        continue
      }
      outcome.accepted += 1
      toSync.set(connection.workspace_id, { workspaceId: connection.workspace_id, userId: connection.user_id })
    }
    // La synchro part EN TÂCHE DE FOND : le CRM attend une réponse rapide (HubSpot : < 5 s).
    for (const target of toSync.values()) void this.syncTarget(provider, target)
    return outcome
  }

  private async syncTarget(provider: CrmWebhookProvider, target: { workspaceId: string; userId: string }) {
    try {
      if (this.frequent) {
        // Dédoublonné par (espace, fournisseur) sur 30 s : une rafale d'événements = un seul passage.
        await this.frequent.enqueueTargeted({ workspaceId: target.workspaceId, userId: target.userId, provider })
        return
      }
      if (provider === 'hubspot') await this.hubspotSync?.syncWorkspace(target.workspaceId)
      else await this.readSync?.syncProvider(target.userId, provider)
    } catch (error) {
      // La synchro quotidienne reste le filet : un échec ici ne perd rien.
      this.logger.warn(`Synchro ciblée après webhook non aboutie (${provider})`, { error })
    }
  }
}
