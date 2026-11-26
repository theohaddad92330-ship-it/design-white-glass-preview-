import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * L'audit serveur de chaque outil de chat (#2438.3) — écrite par l'IA
 * (`apps/ia/app/services/tool_call_audit.py`), le schéma vit ici (GA-11/GA-12),
 * même geste que `rag_documents`.
 *
 * `workspace_id` est TOUJOURS la résolution serveur (`resolve_workspace_id`,
 * qui re-prouve l'appartenance) — jamais un identifiant pris tel quel côté
 * modèle. `null` = irrésolvable, jamais deviné.
 */
@Entity({ name: 'ai_tool_call_audit_log' })
@Index(['workspace_id', 'created_at'])
@Index(['tool_name', 'created_at'])
export class AiToolCallAuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  user_id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('text')
  tool_name: string

  /** `done` | `error` — contrainte SQL, migration `1795999346689`. */
  @Column('text')
  status: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
