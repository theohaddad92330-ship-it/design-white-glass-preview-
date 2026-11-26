import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  canonicalCommercialStage,
  type CommercialCanonicalStage,
  type CommercialTransitionSource,
  type CommercialTransitionSubjectType,
} from '@bellum/contracts'
import { CommercialTransitionEntity } from '../../database/entities/commercial-transition.entity'

interface CommercialTransitionRecordInput {
  workspaceId: string | null
  subjectType: CommercialTransitionSubjectType
  subjectId: string
  fromState: string | null
  toState: string
  /** Qui a agi. `null` = pas un utilisateur identifié — rare, jamais deviné. */
  actorId: string | null
  /** La preuve qui justifie ce passage. `null` = pas de preuve déclarée. */
  proof: string | null
  nextAction?: string | null
  /** #2967 — `human` par défaut : un appelant qui ne dit rien est un geste. */
  source?: CommercialTransitionSource
}

/** #2320.24 (épopée #2967) — exporté : premier appelant de lecture hors de ce
 *  fichier (`ProjectPipelineService.needTransitionHistory`). */
export interface CommercialTransitionEntry {
  id: string
  subjectType: CommercialTransitionSubjectType
  subjectId: string
  fromState: string | null
  toState: string
  actorId: string | null
  proof: string | null
  nextAction: string | null
  /** #2967 — qui a produit la transition (geste, Laura validée, correction). */
  source: CommercialTransitionSource
  /** #2967 / #2320.30 — le stade CANONIQUE de `toState`, lu dans la machine
   *  unique (`@bellum/contracts`) : deux pages qui lisent ce journal affichent
   *  le même stade pour le même dossier. `null` = statut non rattaché. */
  toStage: CommercialCanonicalStage | null
  occurredAt: string
}

function toWire(row: CommercialTransitionEntity): CommercialTransitionEntry {
  return {
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    fromState: row.from_state,
    toState: row.to_state,
    actorId: row.actor_id,
    proof: row.proof,
    nextAction: row.next_action,
    source: row.source ?? 'human',
    toStage: canonicalCommercialStage(row.subject_type, row.to_state),
    occurredAt: row.occurred_at.toISOString(),
  }
}

/**
 * #2320.23 (épopée #2967) — le journal APPEND-ONLY de la chaîne commerciale :
 * besoin → shortlist → positionnement → mission. Une porte UNIQUE d'écriture
 * pour les quatre sujets, plutôt qu'un historique par module — même motif que
 * `ContactLifecycleTransitionEntity`, qui gardait déjà ce principe pour un
 * seul objet.
 *
 * Ce service n'ENFORCE rien : il ENREGISTRE ce que l'appelant a déjà décidé
 * et déjà écrit ailleurs (`changeNeedStatus`, `ShortlistService.create`…).
 * Aucune ligne ici n'est jamais modifiée ni supprimée.
 */
@Injectable()
export class CommercialTransitionsService {
  constructor(
    @InjectRepository(CommercialTransitionEntity)
    private readonly transitions: Repository<CommercialTransitionEntity>,
  ) {}

  async record(input: CommercialTransitionRecordInput): Promise<void> {
    await this.transitions.save(
      this.transitions.create({
        workspace_id: input.workspaceId,
        subject_type: input.subjectType,
        subject_id: input.subjectId,
        from_state: input.fromState,
        to_state: input.toState,
        actor_id: input.actorId,
        proof: input.proof,
        next_action: input.nextAction ?? null,
        source: input.source ?? 'human',
      }),
    )
  }

  async history(
    subjectType: CommercialTransitionSubjectType,
    subjectId: string,
    workspaceId: string | null,
  ): Promise<CommercialTransitionEntry[]> {
    const rows = await this.transitions
      .createQueryBuilder('t')
      .where('t.subject_type = :subjectType', { subjectType })
      .andWhere('t.subject_id = :subjectId', { subjectId })
      .andWhere(workspaceId ? 't.workspace_id = :workspaceId' : 't.workspace_id IS NULL', { workspaceId })
      .orderBy('t.occurred_at', 'ASC')
      .getMany()
    return rows.map(toWire)
  }
}
