import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2445.6 (#2442.16, #2766) — le snapshot masqué de chaque appel d'outil d'un
 * tour, écrit par l'IA (`apps/ia/app/services/chat_tool_call_recording.py`),
 * le schéma vit ici (GA-11/GA-12), même geste que `ai_tool_call_audit_log`.
 *
 * `workspace_id` est TOUJOURS la résolution serveur (`resolve_workspace_id`,
 * qui re-prouve l'appartenance) — jamais un identifiant pris tel quel côté
 * modèle. `null` = irrésolvable, jamais deviné.
 *
 * `masked_result` a déjà traversé `mask_tool_result` (secrets MACHINE
 * seulement) avant d'atteindre cette table — jamais le résultat brut d'un
 * outil.
 */
@Entity({ name: 'chat_tool_call_recordings' })
@Index(['turn_id', 'created_at'])
export class ChatToolCallRecordingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  turn_id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('text')
  tool_name: string

  @Column('jsonb', { nullable: true })
  masked_result: unknown

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
