import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { CommercialTransitionSource, CommercialTransitionSubjectType } from '@bellum/contracts'

/**
 * #2320.23 (épopée #2967) — le journal APPEND-ONLY de la chaîne commerciale :
 * besoin → shortlist → positionnement → mission. Une ligne par transition,
 * jamais réécrite ni supprimée (doctrine « on archive, on ne supprime pas »).
 *
 * Même motif que `ContactLifecycleTransitionEntity` (P0), étendu à quatre
 * types de sujet au lieu d'un : `from_state` est `null` pour la toute
 * première ligne d'un sujet, `actor_id` est `null` pour une transition dont
 * l'auteur n'est pas un utilisateur (rare, jamais deviné). La liste fermée
 * des sujets vit dans `@bellum/contracts` (`COMMERCIAL_TRANSITION_SUBJECT_TYPES`),
 * pas ici — c'est elle que lit la garde GA-12.
 */
@Entity({ name: 'commercial_transitions' })
@Index(['subject_type', 'subject_id', 'occurred_at'])
export class CommercialTransitionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('text')
  subject_type: CommercialTransitionSubjectType

  @Column('uuid')
  subject_id: string

  @Column('text', { nullable: true })
  from_state: string | null

  @Column('text')
  to_state: string

  /** Qui a agi. `null` = pas un utilisateur identifié — rare, jamais deviné. */
  @Column('uuid', { nullable: true })
  actor_id: string | null

  /** La PREUVE qui justifie ce passage — un motif, une source. `null` = pas
   *  de preuve déclarée, jamais une phrase inventée. */
  @Column('text', { nullable: true })
  proof: string | null

  /** La prochaine action, quand elle est connue au moment de la transition. */
  @Column('text', { nullable: true })
  next_action: string | null

  /** #2967 (lot V39) — qui a produit la transition : `human`, `laura` (une
   *  proposition de Laura validée par `actor_id`) ou `human_correction` (qui
   *  gagne toujours). Liste fermée `COMMERCIAL_TRANSITION_SOURCES`. */
  @Column('text', { default: 'human' })
  source: CommercialTransitionSource

  @Column({ type: 'timestamptz', default: () => 'now()' })
  occurred_at: Date
}
