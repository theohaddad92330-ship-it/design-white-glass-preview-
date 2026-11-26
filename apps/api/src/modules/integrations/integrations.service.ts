import { InjectQueue } from '@nestjs/bullmq'
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Queue } from 'bullmq'
import { In, Repository } from 'typeorm'
import {
  IntegrationDeliveryEntity,
  type IntegrationDeliveryStatus,
} from '../../database/entities/integration-delivery.entity'
import { IntegrationEntity, type IntegrationProvider } from '../../database/entities/integration.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { ProductAnalyticsService } from '../analytics/product-analytics.service'
// Reuse the CRM module's AES-256-GCM helper (CRM_TOKEN_ENC_KEY ↔ INTERNAL_API_SECRET
// derivation) — the same "encrypt third-party secrets at rest" need applies here.
import { decryptToken, encryptToken } from '../crm/crm-token.crypto'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import {
  integrationWantsEvent,
  PROVIDER_RULES,
  PROVIDERS,
  validateProviderUrl,
  type IntegrationEventType,
} from './integration-providers'
import { postWebhookEvent, sendChatMessage, type WebhookEvent } from './integrations.outbound'
import { DELIVERY_JOB_OPTIONS, INTEGRATION_DELIVERY_QUEUE, type DeliveryJobData } from './integrations.queue'
import { WorkspaceBrandService } from '../workspace/workspace-brand.service'

export type IntegrationStatus = {
  provider: IntegrationProvider
  connected: boolean
  /** Non-sensitive display hint (URL host), never the secret URL itself. */
  label: string | null
  connectedAt: string | null
  /** Event allow-list; null = every event (default/compat). */
  events: string[] | null
}

/**
 * Une ligne de livraison, telle que la lit l'OPÉRATEUR — le seul à la lire.
 *
 * Il existait deux journaux : celui-ci et une version « traduite » pour l'écran
 * utilisateur (« Refusé par le canal », « Injoignable »). Elle est supprimée
 * avec l'écran qui l'affichait : un commercial ne tirait aucun geste d'un refus
 * de livraison, et qui doit réparer a besoin du 403, pas de sa paraphrase.
 *
 * Toujours sans secret : l'URL du webhook porte un jeton et ne sort jamais ;
 * `error` a été nettoyé (URL retirées, message tronqué) à l'écriture.
 */
export type AdminDeliveryRow = {
  id: string
  provider: string
  userId: string
  event: string
  status: IntegrationDeliveryStatus
  httpStatus: number | null
  attempt: number
  error: string | null
  createdAt: string
}

/** Ce que le back-office affiche par défaut, et la borne dure au-delà de
 *  laquelle on lit une base plutôt qu'un incident. */
const DEFAULT_DELIVERY_PAGE = 50
const ADMIN_DELIVERY_LIMIT = 200

/** A domain event other modules can push to the user's connected channels.
 *  Not exported: callers pass a plain object literal (structural typing). */
type IntegrationEvent = {
  /** Machine-readable name for webhooks, e.g. `analysis.completed`. */
  type: string
  /** Human-readable line for chat channels (Slack/Discord/Teams/Google Chat). */
  text: string
  /** Optional structured payload for generic webhooks. */
  data?: Record<string, unknown>
}

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name)

  constructor(
    @InjectRepository(IntegrationEntity)
    private readonly integrations: Repository<IntegrationEntity>,
    @InjectRepository(IntegrationDeliveryEntity)
    private readonly deliveries: Repository<IntegrationDeliveryEntity>,
    @InjectQueue(INTEGRATION_DELIVERY_QUEUE)
    private readonly deliveryQueue: Queue<DeliveryJobData>,
    private readonly brands: WorkspaceBrandService,
    // Journal d'activité (audit) — both `@Optional()` so the direct-`new` specs
    // need no change; without them the connect/disconnect events are skipped.
    @Optional() private readonly workspaceContext?: WorkspaceContextService,
    @Optional() private readonly analytics?: ProductAnalyticsService,
    // Back-office : traduire un espace de travail en membres. `@Optional()` pour
    // la même raison que les deux au-dessus — les specs instancient à la main.
    @Optional()
    @InjectRepository(WorkspaceMemberEntity)
    private readonly workspaceMembers?: Repository<WorkspaceMemberEntity>,
  ) {}

  /**
   * Le journal de livraison — le seul qui reste, et il est pour le back-office.
   *
   * La trace technique est rendue TELLE QUELLE (code HTTP, tentative, erreur
   * nettoyée) parce que c'est ce qui sert à diagnostiquer, et la lecture est
   * transverse aux utilisateurs : la question posée ici n'est pas « qu'est-ce
   * qui est parti ? » mais « chez qui ça casse ? ».
   *
   * `truncated` dit qu'on a coupé — sans lui, une page pleine se lirait « c'est
   * tout ce qui s'est passé ». Un espace demandé mais sans membre lisible rend
   * une liste VIDE plutôt que la plateforme entière : filtrer large sur un
   * filtre qu'on n'a pas su appliquer montrerait les incidents d'un autre client.
   */
  async listAdminDeliveries(options: {
    workspaceId?: string | null
    limit?: number
  }): Promise<{ rows: AdminDeliveryRow[]; truncated: boolean }> {
    const capped = Math.max(1, Math.min(options.limit ?? DEFAULT_DELIVERY_PAGE, ADMIN_DELIVERY_LIMIT))
    const workspaceId = options.workspaceId?.trim()

    let userFilter: string[] | null = null
    if (workspaceId) {
      const members =
        (await this.workspaceMembers?.find({
          where: { workspace_id: workspaceId },
          select: { user_id: true },
        })) ?? []
      userFilter = members.map(m => m.user_id)
      if (userFilter.length === 0) return { rows: [], truncated: false }
    }

    const integrationRows = await this.integrations.find({
      ...(userFilter ? { where: { user_id: In(userFilter) } } : {}),
      select: ['id', 'provider', 'user_id'],
    })
    if (integrationRows.length === 0) return { rows: [], truncated: false }
    const byId = new Map(integrationRows.map(row => [row.id, row]))

    // Une ligne de plus que demandé : c'est elle, et elle seule, qui prouve
    // qu'il y avait une suite.
    const items = await this.deliveries.find({
      where: { integration_id: In([...byId.keys()]) },
      order: { created_at: 'DESC' },
      take: capped + 1,
    })

    const rows = items.slice(0, capped).map(item => {
      const parent = byId.get(item.integration_id)
      return {
        id: item.id,
        provider: parent?.provider ?? 'webhook',
        userId: parent?.user_id ?? item.user_id,
        event: item.event,
        status: item.status,
        httpStatus: item.http_status ?? null,
        attempt: item.attempt,
        error: item.error ?? null,
        createdAt: item.created_at?.toISOString() ?? new Date(0).toISOString(),
      }
    })
    return { rows, truncated: items.length > capped }
  }

  /** Status of every provider this module owns, for the integrations screen. */
  async list(userId: string): Promise<IntegrationStatus[]> {
    const rows = await this.integrations.find({ where: { user_id: userId } })
    return PROVIDERS.map(provider => {
      const row = rows.find(r => r.provider === provider)
      return {
        provider,
        connected: Boolean(row),
        label: row?.label ?? null,
        connectedAt: row?.created_at?.toISOString() ?? null,
        events: row?.events ?? null,
      }
    })
  }

  /**
   * Persist (encrypted) a provider's webhook URL after validating it against the
   * provider's host rule (anti-SSRF). Throws `BadRequestException` on a URL that
   * doesn't match — the generic path for every chat/webhook integration.
   */
  async set(userId: string, provider: IntegrationProvider, url: string): Promise<IntegrationStatus> {
    const error = validateProviderUrl(provider, url)
    if (error) throw new BadRequestException(error)
    const status = await this.upsert(userId, provider, { url })
    // Journal d'activité — integration connected (provider name only, never the URL).
    void this.emitAuditEvent('integration_connected', userId, provider)
    return status
  }

  /** Persist (encrypted) the user's Slack Incoming Webhook. */
  async setSlack(userId: string, webhookUrl: string): Promise<IntegrationStatus> {
    return this.set(userId, 'slack', webhookUrl)
  }

  /** Persist (encrypted) the user's generic outgoing webhook URL. */
  async setWebhook(userId: string, url: string): Promise<IntegrationStatus> {
    return this.set(userId, 'webhook', url)
  }

  /**
   * Update the event allow-list of a connected integration (`null` = every
   * event — the default). Values are pre-validated by the DTO against
   * `INTEGRATION_EVENTS`; deduplicated here so the stored JSONB stays canonical.
   */
  async setEvents(
    userId: string,
    provider: IntegrationProvider,
    events: IntegrationEventType[] | null,
  ): Promise<IntegrationStatus> {
    const existing = await this.integrations.findOne({ where: { user_id: userId, provider } })
    if (!existing) throw new NotFoundException(`No ${provider} integration configured`)
    const normalized = events == null ? null : [...new Set(events)]
    await this.integrations.update({ id: existing.id }, { events: normalized })
    return {
      provider,
      connected: true,
      label: existing.label,
      connectedAt: existing.created_at?.toISOString() ?? null,
      events: normalized,
    }
  }

  async disconnect(userId: string, provider: IntegrationProvider): Promise<void> {
    const res = await this.integrations.delete({ user_id: userId, provider })
    // Journal d'activité — only when a connection actually existed. `affected`
    // is NULL on drivers that don't report it: treat that as "deleted" so the
    // audit errs on recording rather than silently missing a disconnect.
    if ((res?.affected ?? 1) > 0) void this.emitAuditEvent('integration_disconnected', userId, provider)
  }

  /**
   * Send a real test message to a configured provider. Gated on config; shapes
   * the payload from the provider rule (chat message vs structured event).
   * Deliberately DIRECT (no queue/journal): the user is watching the screen and
   * wants an immediate verdict, not a retry ladder.
   */
  async test(userId: string, provider: IntegrationProvider): Promise<void> {
    const url = await this.requireUrl(userId, provider)
    const rule = PROVIDER_RULES[provider]
    try {
      if (rule.delivery.kind === 'chat') {
        // ⚠️ Ce message est POSTÉ dans le canal du client : il est lu par son
        // équipe, dans son outil, pas dans le nôtre.
        const brandName = (await this.brands.getForUser(userId)).name
        await sendChatMessage(url, `${brandName} est bien connecté à ${rule.label}. 🎯`, rule.delivery.bodyKey)
      } else {
        await postWebhookEvent(url, this.buildEvent({ type: 'bellum.webhook.test', text: 'test' }))
      }
      await this.touchLastUsed(userId, provider)
    } catch (error) {
      this.logger.error(`${rule.label} test delivery failed`, { error, user: { id: userId } })
      throw new BadGatewayException(`${rule.label} n'a pas accepté le message de test. Vérifiez l'URL.`)
    }
  }

  /** Send a real test message to the user's Slack webhook. Gated on config. */
  async testSlack(userId: string): Promise<void> {
    return this.test(userId, 'slack')
  }

  /** Send a real test event to the user's generic webhook. Gated on config. */
  async testWebhook(userId: string): Promise<void> {
    return this.test(userId, 'webhook')
  }

  /**
   * Fan an application event out to every channel the user has connected AND
   * subscribed to this event (`events` JSONB allow-list; null = everything).
   * Deliveries go through the BullMQ queue (webhooks v2): each one gets a
   * journal row (`integration_deliveries`, created `pending`) and up to 3
   * retries on transient failures — see `integrations.worker.ts`. Best-effort:
   * a failing enqueue is logged, never thrown, so one broken channel or a Redis
   * hiccup can't break the caller's flow.
   */
  async notifyUser(userId: string, event: IntegrationEvent): Promise<void> {
    const rows = await this.integrations.find({ where: { user_id: userId } })
    const targeted = rows.filter(row => integrationWantsEvent(row.events, event.type))
    await Promise.all(
      targeted.map(async row => {
        try {
          const delivery = await this.deliveries.save(
            this.deliveries.create({
              integration_id: row.id,
              user_id: userId,
              event: event.type,
              status: 'pending',
              attempt: 0,
            }),
          )
          await this.deliveryQueue.add(
            'deliver',
            {
              deliveryId: delivery.id,
              integrationId: row.id,
              userId,
              event: { type: event.type, text: event.text, data: event.data },
            },
            DELIVERY_JOB_OPTIONS,
          )
        } catch (error) {
          this.logger.warn(`Integration delivery enqueue failed (${row.provider})`, { error, user: { id: userId } })
        }
      }),
    )
  }

  /** Stamp the connection's last REAL use (Tool Registry v2 `last_sync`) after a
   *  direct test send. The async fan-out stamps it from the worker once a queued
   *  delivery actually succeeds. Best-effort: a bookkeeping blip must never fail
   *  a successful send. */
  private async touchLastUsed(userId: string, provider: IntegrationProvider): Promise<void> {
    try {
      await this.integrations.update({ user_id: userId, provider }, { last_used_at: new Date() })
    } catch (error) {
      this.logger.warn(`Failed to stamp last_used_at (${provider})`, { error, user: { id: userId } })
    }
  }

  private buildEvent(event: IntegrationEvent): WebhookEvent {
    return { type: event.type, sentAt: new Date().toISOString(), data: event.data }
  }

  /** Fire-and-forget journal line for the workspace activity audit. Resolves
   *  the active workspace best-effort; a failure is logged, never thrown. */
  private async emitAuditEvent(
    eventName: 'integration_connected' | 'integration_disconnected',
    userId: string,
    provider: IntegrationProvider,
  ): Promise<void> {
    if (!this.analytics) return
    try {
      const resolved = await this.workspaceContext?.resolveActiveWorkspace(userId)
      await this.analytics.track(eventName, {
        userId,
        workspaceId: resolved?.workspaceId ?? null,
        properties: { provider },
      })
    } catch (error) {
      this.logger.warn(`${eventName} journal write skipped (${(error as Error).message})`)
    }
  }

  private async requireUrl(userId: string, provider: IntegrationProvider): Promise<string> {
    const row = await this.integrations.findOne({ where: { user_id: userId, provider } })
    if (!row) throw new NotFoundException(`No ${provider} integration configured`)
    return this.readConfig(row).url
  }

  private readConfig(row: IntegrationEntity): { url: string } {
    const parsed = JSON.parse(decryptToken(row.config_enc)) as { url?: string }
    if (!parsed?.url) throw new NotFoundException('Integration config is empty')
    return { url: parsed.url }
  }

  private async upsert(
    userId: string,
    provider: IntegrationProvider,
    config: { url: string },
  ): Promise<IntegrationStatus> {
    const label = safeHost(config.url)
    // `events` is intentionally NOT in the patch: reconnecting (new URL) keeps
    // the user's event choices; a fresh row starts at null (= every event).
    const patch = {
      user_id: userId,
      provider,
      config_enc: encryptToken(JSON.stringify(config)),
      label,
    }
    const existing = await this.integrations.findOne({ where: { user_id: userId, provider } })
    if (existing) {
      await this.integrations.update({ id: existing.id }, patch)
      return {
        provider,
        connected: true,
        label,
        connectedAt: existing.created_at?.toISOString() ?? null,
        events: existing.events ?? null,
      }
    }
    await this.integrations.insert(patch)
    return { provider, connected: true, label, connectedAt: new Date().toISOString(), events: null }
  }
}

/** Extract the URL host for a display label; never throws (input is pre-validated). */
function safeHost(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}
