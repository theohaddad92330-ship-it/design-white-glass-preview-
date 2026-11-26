import { ConflictException, Injectable, Logger } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { dispatchFailureOutcome, type WriteSource } from '@bellum/contracts'
import type { OutboundWriteRequestEntity } from '../../database/entities/outbound-write-request.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { CrmAdapter, CrmCompanyInput, CrmContactInput } from './adapter/crm-adapter'
import { CrmAdapterRegistry } from './adapter/crm-adapter.registry'
import type { CrmObjectKind, CrmTaskInput } from './crm-task'
import { CrmService } from './crm.service'
import { OutboundWriteService } from './outbound-write.service'

/**
 * #4186 — TOUTE écriture CRM, tous fournisseurs, passe par la porte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT FERMÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * La doctrine dit « une écriture CRM/ERP passe par une porte (auto-approuvée
 * sur geste utilisateur, sinon prévisualisation figée) ». Seul HubSpot y
 * passait : `POST /salesforce|pipedrive|attio|odoo/export` écrivaient en
 * direct, la création de société HubSpot aussi, et l'export d'un besoin
 * déposait une affaire sans trace. Et quand le routeur d'actions passait la
 * porte pour un autre fournisseur, le résultat n'était jamais consigné : la
 * demande restait « approuvée » pour toujours.
 *
 * Ce service est le SEUL appelant des écritures de l'adaptateur commun (garde
 * `crm-ecritures-passent-par-la-porte.spec.ts`). Il :
 *  1. demande à la porte (`OutboundWriteService.request`) — `user` part tout
 *     de suite, `system` attend une décision humaine (prévisualisation figée) ;
 *  2. écrit par l'adaptateur du fournisseur visé, et seulement lui ;
 *  3. CONSIGNE le résultat : `written`, `failed`, ou `unknown` quand la
 *     requête est partie sans réponse — un timeout n'est pas un échec, et
 *     `unknown` arrête la reprise (une fiche créée deux fois ne se répare pas).
 */

/** Les écritures que l'adaptateur commun porte, et la méthode qui les exécute. */
type CrmWrite =
  | { kind: 'export_contact'; payload: CrmContactInput }
  | { kind: 'create_company'; payload: CrmCompanyInput }
  | { kind: 'export_need'; payload: CrmTaskInput }

export type CrmWriteOutcome =
  /** Écrit chez le fournisseur. `requestId` `null` = salle de démonstration (aucune écriture externe). */
  | { status: 'written'; requestId: string | null; externalId: string; created: boolean; object?: CrmObjectKind }
  /** Retenu : une écriture de système attend une décision humaine. */
  | { status: 'pending'; requestId: string }
  /** Une demande identique est déjà passée : on ne réécrit pas. */
  | { status: 'already_done'; requestId: string; externalId: string | null }
  /** Rien n'est parti, et la raison est nommée (CRM non branché, opération non portée). */
  | { status: 'refused'; reason: string }

const NOT_SUPPORTED = 'Ton CRM ne reçoit pas encore ce type de fiche depuis Bellum : rien n’a été envoyé.'
const NOT_CONNECTED = 'Ce CRM n’est pas branché sur ton espace : rien n’a été envoyé.'

type Executor = (userId: string) => Promise<{ id: string; created: boolean; object?: CrmObjectKind }>

/** L'opération de l'adaptateur pour une écriture ; `null` = non portée. */
function executorFor(adapter: CrmAdapter, write: CrmWrite): Executor | null {
  switch (write.kind) {
    case 'export_contact': {
      const op = adapter.upsertContact
      return op ? userId => op(userId, write.payload) : null
    }
    case 'create_company': {
      const op = adapter.upsertCompany
      return op ? userId => op(userId, write.payload) : null
    }
    case 'export_need': {
      const op = adapter.taskNote
      return op
        ? async userId => {
            const result = await op(userId, write.payload)
            return { id: result.id, created: true, object: result.object }
          }
        : null
    }
  }
}

/** La charge utile FIGÉE d'une demande, relue telle quelle — jamais complétée. */
function frozenWrite(request: OutboundWriteRequestEntity): CrmWrite | null {
  const payload = request.payload ?? {}
  switch (request.kind) {
    case 'export_contact':
      return { kind: 'export_contact', payload: payload as CrmContactInput }
    case 'create_company':
      return typeof payload['name'] === 'string' && payload['name'].trim()
        ? { kind: 'create_company', payload: payload as CrmCompanyInput }
        : null
    case 'export_need':
      return typeof payload['subject'] === 'string' && payload['subject'].trim()
        ? { kind: 'export_need', payload: payload as CrmTaskInput }
        : null
    default:
      return null
  }
}

/** Un défaut de notre code, pas la réponse d'un fournisseur (`fetch failed` est un TypeError AVEC `cause`). */
function isProgrammingError(error: unknown): boolean {
  if (error instanceof ReferenceError || error instanceof RangeError || error instanceof SyntaxError) return true
  return error instanceof TypeError && (error as { cause?: unknown }).cause === undefined
}

@Injectable()
export class CrmWriteService {
  private readonly logger = new Logger(CrmWriteService.name)

  constructor(
    private readonly adapters: CrmAdapterRegistry,
    private readonly outbound: OutboundWriteService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly hubspot: CrmService,
  ) {}

  /** Une écriture vers le CRM `provider`, par la porte. */
  async write(
    input: CrmWrite & {
      userId: string
      provider: string
      origin: 'user' | 'system'
      source?: WriteSource
      idempotencyKey?: string | null
      batchId?: string | null
    },
  ): Promise<CrmWriteOutcome> {
    const adapter = this.adapters.get(input.provider)
    const execute = adapter ? executorFor(adapter, input) : null
    if (!adapter || !execute) return { status: 'refused', reason: NOT_SUPPORTED }

    // Salle de démonstration (craft rule n°9) : le geste se joue de bout en bout
    // SANS écriture externe — ni porte, ni jeton, ni réseau. L'identifiant est
    // dérivé de la charge : rejouer le geste retrouve la même fiche.
    if (await this.workspaceContext.isDemoWorkspace(input.userId)) {
      const digest = createHash('sha256')
        .update(`${input.provider}:${input.kind}:${JSON.stringify(input.payload)}`)
        .digest('hex')
        .slice(0, 12)
      return { status: 'written', requestId: null, externalId: `demo-${digest}`, created: true }
    }

    if (!(await adapter.status(input.userId)).connected) return { status: 'refused', reason: NOT_CONNECTED }

    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(input.userId)
    const verdict = await this.outbound.request({
      workspaceId,
      userId: input.userId,
      provider: input.provider,
      kind: input.kind,
      payload: { ...input.payload },
      origin: input.origin,
      idempotencyKey: input.idempotencyKey ?? null,
      source: input.source,
      batchId: input.batchId ?? null,
    })
    if (verdict.decision === 'pending') return { status: 'pending', requestId: verdict.request.id }
    if (verdict.decision === 'already_done') {
      const done = verdict.request.state === 'written' ? verdict.request.provider_response : null
      return { status: 'already_done', requestId: verdict.request.id, externalId: done ?? null }
    }

    const written = await this.perform(verdict.request.id, () => execute(input.userId), input.kind)
    return {
      status: 'written',
      requestId: verdict.request.id,
      externalId: written.id,
      created: written.created,
      ...(written.object ? { object: written.object } : {}),
    }
  }

  /**
   * #4188 — l'espace actif de l'appelant, LE MÊME que celui où la porte dépose
   * ses demandes. Exposé pour que l'envoi de comptes (`CrmPushService`, même
   * module) borne ses lectures sans importer un service d'un autre module (GA-07).
   */
  async workspaceOf(userId: string): Promise<string> {
    return (await this.workspaceContext.resolveActiveWorkspace(userId)).workspaceId
  }

  /**
   * Faire partir une demande de SYSTÈME validée par un humain — une fois,
   * telle qu'elle a été montrée. HubSpot garde son chemin (`CrmService`, qui
   * porte aussi notes, tâches, stades) pour les natures qu'il connaît ; tout
   * le reste passe par l'adaptateur du fournisseur visé.
   */
  async writeApproved(workspaceId: string, userId: string, requestId: string): Promise<OutboundWriteRequestEntity> {
    const request = await this.outbound.requireApproved(workspaceId, requestId)
    const write = frozenWrite(request)
    if (request.provider === 'hubspot' && request.kind !== 'create_company' && request.kind !== 'export_need') {
      return this.hubspot.writeApproved(workspaceId, requestId)
    }
    const adapter = this.adapters.get(request.provider)
    const execute = adapter && write ? executorFor(adapter, write) : null
    if (!execute || !write) {
      throw new ConflictException("Validée, mais cette écriture ne peut pas partir d'ici : rien n'a été écrit.")
    }
    const claimed = await this.outbound.claimApprovedWrite(workspaceId, requestId)
    try {
      const written = await this.perform(claimed.id, () => execute(userId), write.kind)
      return { ...claimed, state: 'written', provider_response: written.id }
    } catch (error) {
      const response = error instanceof Error ? error.message : String(error)
      return { ...claimed, state: dispatchFailureOutcome(error), provider_response: response }
    }
  }

  /**
   * L'appel au fournisseur, et le résultat CONSIGNÉ quoi qu'il arrive. Une
   * erreur est rendue à l'appelant après avoir été consignée : `unknown`
   * (partie sans réponse) ne se retente pas, `failed` (jamais établie) si.
   */
  private async perform(
    requestId: string,
    call: () => ReturnType<Executor>,
    kind: CrmWrite['kind'],
  ): ReturnType<Executor> {
    try {
      const written = await call()
      await this.outbound.recordOutcome(requestId, { ok: true, response: written.id })
      return written
    } catch (error) {
      const outcome = dispatchFailureOutcome(error)
      const response = error instanceof Error ? error.message : String(error)
      if (outcome === 'unknown') await this.outbound.recordUnknown(requestId, response)
      else await this.outbound.recordOutcome(requestId, { ok: false, response })
      // Le refus d'un CRM tiers est consigné sur la demande et rendu à l'écran :
      // une dégradation attendue (warn). Un bug de NOTRE code (erreur de
      // programmation) reste une panne (error).
      const level = isProgrammingError(error) ? 'error' : 'warn'
      this.logger[level]('Écriture CRM non aboutie', {
        error,
        tags: { 'crm.write_outcome': outcome, 'crm.write_kind': kind },
      })
      throw error
    }
  }
}
