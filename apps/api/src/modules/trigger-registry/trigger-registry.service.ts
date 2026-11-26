import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  isCanonicalTriggerKind,
  isTriggerEventActive,
  type CanonicalTriggerKind,
  type TriggerEvent,
} from '@bellum/contracts'
import { CanonicalTriggerEventEntity } from '../../database/entities/canonical-trigger-event.entity'

/**
 * #2875 (#2402.1, #2402.9, dédoublonnage 27/09) — LE REGISTRE UNIQUE des
 * déclencheurs commerciaux, PAS un second point de construction.
 *
 * `record` ne construit RIEN : il persiste le `TriggerEvent` que l'appelant a
 * déjà construit via `buildTriggerEvent` (`trigger-event.ts`), seul point de
 * construction attendu (#2402.2). Avant ce lot, ce service acceptait sa
 * propre forme ad hoc (`{ workspaceId, kind, sourceModule, payload }`) —
 * un second schéma concurrent de {@link TriggerEvent}. Il délègue désormais
 * entièrement : le `type` d'un événement hors du CHECK SQL de cette table
 * (`isCanonicalTriggerKind`) n'est pas persisté ici, best-effort, sans faire
 * échouer l'émetteur — c'est un émetteur pas encore migré à CETTE table,
 * jamais une erreur.
 *
 * Le registre source note lui-même que la table ne doit « pas être ajoutée
 * seule (code que personne n'appelle), à livrer avec au moins un premier
 * émetteur migré ». Ce service EST ce premier appelant : il ne remplace
 * AUCUN des cinq points d'émission dispersés cités par #2402.1
 * (`intervention-rules.ts`, `discover_signals.py`, `credits.service.ts`,
 * la gouvernance des doublons, `DeliveryRoutinesService`) — chacun continue
 * d'écrire exactement comme avant. `record` s'AJOUTE, en plus.
 *
 * #2875 (#2402.1, vague F/G 27/09) — les cinq sont désormais migrés :
 * `GovernanceService.proposeDuplicates` (lot précédent),
 * `InterventionsSweeper.sweep` (les treize natures — la construction existait
 * déjà pour la corrélation #2402.14, seul l'appel à `record` manquait),
 * `CreditsService.maybeNotifyCreditLow`, `DeliveryRoutinesService` (trois
 * routines) et `IaProxyController.discoverSignals` (`ao_publie`, l'appelant
 * réel du signal BOAMP de `discover_signals.py`).
 *
 * Best-effort et hors du chemin critique, sur le même principe que
 * `WorkflowRunnerService.announceLongJobDone` : un registre qui échoue ne
 * doit jamais faire échouer le geste métier qu'il observe.
 */
/** #3915.1 — ce que le registre garde du TriggerEvent au-delà de son sujet. */
function persistedFields(
  event: TriggerEvent,
): Pick<CanonicalTriggerEventEntity, 'severity' | 'dedupe_key' | 'expires_at' | 'status'> {
  return {
    severity: event.severity,
    dedupe_key: event.dedupeKey,
    expires_at: event.expiresAt ? new Date(event.expiresAt) : null,
    status: event.status,
  }
}

@Injectable()
export class TriggerRegistryService {
  private readonly logger = new Logger(TriggerRegistryService.name)

  constructor(
    @InjectRepository(CanonicalTriggerEventEntity)
    private readonly events: Repository<CanonicalTriggerEventEntity>,
  ) {}

  /**
   * #2875 — écrit le fait, SAUF s'il est résolu ou échu : un tel événement ne
   * déclenche plus d'alerte (lecteur : `isTriggerEventActive`). Il n'est pas
   * archivé non plus ici — la table ne consigne que ce qui a déclenché.
   */
  async record(event: TriggerEvent, sourceModule: string, now: Date = new Date()): Promise<void> {
    if (!isCanonicalTriggerKind(event.type)) return
    // #2875 — status / expiresAt LUS : résolu ou échu = plus de déclenchement.
    if (!isTriggerEventActive(event, now)) return
    try {
      await this.events.save(this.toRow(event, sourceModule))
    } catch (error) {
      this.warn(event, sourceModule, error)
    }
  }

  /**
   * #3918.a (lot M01, 09/10/2026) — consigne un sujet UNE fois par
   * `(espace, type, sujet)` : un balayage quotidien (`CrmDealSignalsSweeper`)
   * ne réécrit pas chaque matin la même affaire perdue. Rend `true` seulement
   * quand la ligne est NEUVE — c'est ce qui autorise l'appelant à alerter.
   *
   * `context` porte ce que le `TriggerEvent` canonique (strict, 17 champs) ne
   * porte pas : le compte rattaché (`accountId`, lu par la veille du compte)
   * et la date du FAIT (`factOccurredAt` → `occurred_at`), jamais l'instant
   * de détection. Une ligne déjà consignée SANS compte reçoit le compte
   * rattaché depuis : le rattachement rattrape l'existant, ciblé sur ce sujet.
   */
  async recordOnce(
    event: TriggerEvent,
    sourceModule: string,
    context: { accountId?: string | null; factOccurredAt?: string | null } = {},
  ): Promise<boolean> {
    if (!isCanonicalTriggerKind(event.type)) return false
    try {
      const existing = await this.events.manager.query<Array<{ id: string }>>(
        `SELECT id FROM canonical_trigger_events
          WHERE workspace_id = $1 AND kind = $2 AND payload->>'subjectId' = $3
          LIMIT 1`,
        [event.scope.workspaceId, event.type, event.object.subjectId],
      )
      if (existing.length > 0) {
        if (context.accountId) {
          // Idempotent : le compte rattaché le plus récent gagne (un deal
          // relié à un autre compte après correction du SIREN suit la correction).
          await this.events.manager.query(
            `UPDATE canonical_trigger_events SET payload = payload || $2::jsonb WHERE id = $1`,
            [existing[0].id, JSON.stringify({ accountId: context.accountId })],
          )
        }
        return false
      }
      await this.events.save(
        this.events.create({
          workspace_id: event.scope.workspaceId,
          kind: event.type,
          source_module: sourceModule,
          payload: {
            subjectType: event.object.subjectType,
            subjectId: event.object.subjectId,
            evidence: event.evidence,
            ...(context.accountId ? { accountId: context.accountId } : {}),
          },
          occurred_at: new Date(context.factOccurredAt ?? event.timestamp),
          ...persistedFields(event),
        }),
      )
      return true
    } catch (error) {
      this.warn(event, sourceModule, error)
      return false
    }
  }

  /**
   * #2875 (lot E2) — comme {@link record}, mais UNE ligne par `dedupeKey` (par
   * espace et par genre), sur la colonne réelle `dedupe_key` (#3915.1). Deux
   * événements sur le même sujet dont les clés diffèrent restent deux lignes :
   * c'est la clé qui décide, jamais le sujet.
   *
   * ⚠️ La lecture préalable n'est pas une garantie d'unicité sous concurrence
   * (aucun index unique sur cette table) : elle évite le doublon des passages
   * successifs, qui est le cas réel d'un balayage.
   */
  async recordOnceByDedupeKey(
    event: TriggerEvent,
    sourceModule: string,
    now: Date = new Date(),
  ): Promise<'recorded' | 'duplicate' | 'inactive' | 'skipped'> {
    if (!isCanonicalTriggerKind(event.type)) return 'skipped'
    if (!isTriggerEventActive(event, now)) return 'inactive'
    try {
      const known = await this.events.manager.query<unknown[]>(
        `SELECT 1 FROM canonical_trigger_events
          WHERE workspace_id = $1 AND kind = $2 AND dedupe_key = $3 LIMIT 1`,
        [event.scope.workspaceId, event.type, event.dedupeKey],
      )
      if (known.length > 0) return 'duplicate'
      await this.events.save(this.toRow(event, sourceModule))
      return 'recorded'
    } catch (error) {
      this.warn(event, sourceModule, error)
      return 'skipped'
    }
  }

  private toRow(event: TriggerEvent, sourceModule: string): CanonicalTriggerEventEntity {
    return this.events.create({
      workspace_id: event.scope.workspaceId,
      kind: event.type as CanonicalTriggerKind,
      source_module: sourceModule,
      payload: {
        subjectType: event.object.subjectType,
        subjectId: event.object.subjectId,
        evidence: event.evidence,
      },
      occurred_at: new Date(event.timestamp),
      ...persistedFields(event),
    })
  }

  private warn(event: TriggerEvent, sourceModule: string, error: unknown): void {
    this.logger.warn('Événement canonique non enregistré — le geste d’origine continue', {
      tags: { 'trigger_registry.kind': event.type, 'trigger_registry.source': sourceModule },
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
