import type { MemoryItemEvent } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #1916.23 — un GESTE sur un élément de mémoire épinglé : texte réécrit, portée
 * changée, échéance posée ou retirée. Append-only — rien ne le modifie, et il
 * part avec l'élément qu'il raconte (`ON DELETE CASCADE`, migration
 * `1792800150613`).
 *
 * La création n'y figure pas : elle se lit sur `memory_pinned_facts` elle-même
 * (`created_at`, `user_id`). `actor_user_id` est `null` quand le compte de
 * l'auteur a été effacé — le geste reste, son auteur non.
 *
 * ⚠️ Écrit et lu par `MemoryService` SEUL, toujours borné par `workspace_id`.
 */
@Entity({ name: 'memory_fact_events' })
@Index('memory_fact_events_fact_idx', ['fact_id', 'created_at'])
export class MemoryFactEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  fact_id: string

  @Column('uuid', { nullable: true })
  actor_user_id: string | null

  /** text_changed | scope_changed | expiry_changed — `memory_fact_events_event_check`. */
  @Column('text')
  event: MemoryItemEvent

  /** L'état d'avant : un texte, une portée, ou une échéance ISO 8601 (`null` = aucune). */
  @Column('text', { nullable: true })
  previous_value: string | null

  /** L'état d'après, même forme. */
  @Column('text', { nullable: true })
  new_value: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
