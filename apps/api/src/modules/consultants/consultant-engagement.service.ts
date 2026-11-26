import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import {
  addDays,
  applyFieldUpdates,
  availabilityAfterEnd,
  consultantAvailabilitySchema,
  type ConsultantEngagementConflict,
  type ConsultantEngagementResult,
  type FieldSource,
} from '@bellum/contracts'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { findActiveEngagements } from './consultant-engagement'
import {
  CONSULTANT_ENGAGEMENT_PROVENANCE_PORT,
  type ConsultantEngagementProvenancePort,
} from './consultant-engagement-provenance.port'

type EngagementFields = Pick<ConsultantEntity, 'availability' | 'available_from'>

const today = (): string => new Date().toISOString().slice(0, 10)

/**
 * #4196 (épopée #4191, lot L5) — LE CONSULTANT SUIT SA MISSION.
 *
 * Le SEUL endroit qui écrit la disponibilité d'un consultant à cause d'une
 * mission : « en mission » au démarrage, disponible à la fin, repoussée à la
 * prolongation. Chaque écriture passe par `applyFieldUpdates` avec la source
 * `pipeline` — une disponibilité saisie à la main (`human`) n'est JAMAIS
 * écrasée (« une correction humaine gagne toujours ») : l'écart est rendu à
 * l'appelant, nommé par {@link conflict}, et c'est un geste humain
 * ({@link align}) qui l'aligne.
 *
 * Un consultant en mission n'est jamais archivé : au démarrage, une fiche
 * archivée est désarchivée, et la raison de l'archivage s'efface — tracé.
 *
 * ⚠️ Ce service n'est appelé que par des CONTRÔLEURS (GA-07) : la mission vit
 * dans `delivery`, la fiche ici.
 */
@Injectable()
export class ConsultantEngagementService {
  constructor(
    @InjectRepository(ConsultantEntity) private readonly repo: Repository<ConsultantEntity>,
    @Inject(CONSULTANT_ENGAGEMENT_PROVENANCE_PORT) private readonly provenance: ConsultantEngagementProvenancePort,
  ) {}

  /** Démarrage (ou prolongation) : « en mission », disponible le lendemain de `endsOn`. */
  async startEngagement(
    workspaceId: string,
    userId: string,
    consultantIds: readonly string[],
    endsOn: string | null,
  ): Promise<ConsultantEngagementResult[]> {
    const incoming: Partial<EngagementFields> = { availability: 'en_mission' }
    if (endsOn) incoming.available_from = addDays(endsOn, 1)
    const results: ConsultantEngagementResult[] = []
    for (const id of [...new Set(consultantIds)]) {
      results.push(await this.write(workspaceId, userId, id, incoming, 'pipeline', 'mission_start', true))
    }
    return results
  }

  /**
   * Fin de mission : disponible (immédiatement, sous un mois, sous trois mois
   * selon `endedOn`), au lendemain de la fin. Un consultant encore affecté à
   * une AUTRE mission en cours n'est pas libéré.
   */
  async release(
    workspaceId: string,
    userId: string,
    missionId: string,
    consultantIds: readonly string[],
    endedOn: string,
    now: string = today(),
  ): Promise<ConsultantEngagementResult[]> {
    const ids = [...new Set(consultantIds)]
    const stillBusy = new Set(
      (await findActiveEngagements(this.repo.manager, ids, now))
        .filter(engagement => engagement.missionId !== missionId)
        .map(engagement => engagement.consultantId),
    )
    const after = availabilityAfterEnd(endedOn, now)
    const results: ConsultantEngagementResult[] = []
    for (const id of ids) {
      if (stillBusy.has(id)) {
        results.push({
          consultantId: id,
          outcome: 'other_mission',
          unarchived: false,
          availability: null,
          availableFrom: null,
        })
        continue
      }
      results.push(
        await this.write(
          workspaceId,
          userId,
          id,
          { availability: after.availability, available_from: after.availableFrom },
          'pipeline',
          'mission_end',
          false,
        ),
      )
    }
    return results
  }

  /**
   * L'écart entre la fiche (saisie à la main) et la mission en cours. `null`
   * quand il n'y en a pas : pas d'affectation en cours, la fiche dit déjà « en
   * mission », ou sa valeur n'est pas une saisie humaine (la mission la
   * remplace, ce n'est pas un conflit).
   */
  async conflict(
    workspaceId: string,
    consultantId: string,
    now: string = today(),
  ): Promise<ConsultantEngagementConflict | null> {
    const consultant = await this.load(workspaceId, consultantId)
    if (!consultant || consultant.availability === 'en_mission') return null
    const [engagement] = await findActiveEngagements(this.repo.manager, [consultantId], now)
    if (!engagement) return null
    const detail = (await this.provenance.currentSourcesDetailed('consultant', consultantId)).availability
    if (detail?.source !== 'human') return null
    const availability = consultantAvailabilitySchema.safeParse(consultant.availability)
    if (!availability.success) return null
    return {
      consultantId,
      missionId: engagement.missionId,
      missionLabel: engagement.missionLabel,
      endsOn: engagement.endsOn,
      ficheAvailability: availability.data,
      ficheEnteredAt: detail.observedAt,
    }
  }

  /** « Aligner » : un geste HUMAIN qui pose « en mission » là où la saisie manuelle bloquait. */
  async align(
    workspaceId: string,
    userId: string,
    consultantId: string,
    now: string = today(),
  ): Promise<ConsultantEngagementResult | null> {
    const consultant = await this.load(workspaceId, consultantId)
    if (!consultant) return null
    const [engagement] = await findActiveEngagements(this.repo.manager, [consultantId], now)
    if (!engagement) return null
    const incoming: Partial<EngagementFields> = { availability: 'en_mission' }
    if (engagement.endsOn) incoming.available_from = addDays(engagement.endsOn, 1)
    return this.write(workspaceId, userId, consultantId, incoming, 'human', 'mission_align', false)
  }

  private load(workspaceId: string, id: string): Promise<ConsultantEntity | null> {
    return this.repo.findOne({ where: { id, workspace_id: workspaceId } })
  }

  private async write(
    workspaceId: string,
    userId: string,
    id: string,
    incoming: Partial<EngagementFields>,
    source: FieldSource,
    rule: string,
    unarchive: boolean,
  ): Promise<ConsultantEngagementResult> {
    const consultant = await this.load(workspaceId, id)
    if (!consultant) {
      return { consultantId: id, outcome: 'not_found', unarchived: false, availability: null, availableFrom: null }
    }
    const currentSources = await this.provenance.currentSources('consultant', id)
    const { accepted, rejected } = applyFieldUpdates<EngagementFields>({
      incoming,
      incomingSource: source,
      current: consultant,
      currentSources,
    })

    const changes: { field: string; oldValue: unknown; newValue: unknown }[] = []
    const wasArchived = unarchive && consultant.archived_at !== null
    for (const [field, value] of Object.entries(accepted)) {
      changes.push({ field, oldValue: consultant[field as keyof EngagementFields], newValue: value })
    }
    if (wasArchived) {
      changes.push({ field: 'archived_at', oldValue: consultant.archived_at, newValue: null })
      changes.push({ field: 'archived_reason', oldValue: consultant.archived_reason, newValue: null })
    }

    if (changes.length > 0) {
      Object.assign(consultant, accepted)
      if (wasArchived) {
        consultant.archived_at = null
        consultant.archived_reason = null
      }
      await this.repo.save(consultant)
      await this.provenance.commit({
        workspaceId,
        entityType: 'consultant',
        entityId: id,
        source,
        actorId: userId,
        rule,
        changes,
      })
    }

    const availability = consultantAvailabilitySchema.safeParse(consultant.availability)
    return {
      consultantId: id,
      outcome: rejected.length > 0 ? 'kept_human' : changes.length > 0 ? 'written' : 'unchanged',
      unarchived: wasArchived,
      availability: availability.success ? availability.data : null,
      availableFrom: consultant.available_from ?? null,
    }
  }
}
