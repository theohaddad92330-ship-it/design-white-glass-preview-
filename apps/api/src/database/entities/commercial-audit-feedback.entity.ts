import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { CommercialAuditFeedbackKind } from '@bellum/contracts'

/**
 * #2075.12 / #2075.13 — une note personnelle sur une cible de l'audit
 * commercial (une conclusion commentée, une recommandation refusée).
 *
 * APPEND-ONLY (migration `1796322160100`) : on archive, on ne supprime pas.
 * `target_key` est TEXT libre, pas un enum — les clés de l'audit vivent dans
 * `build-audit.ts` (web), jamais en base.
 */
@Entity({ name: 'commercial_audit_feedback' })
export class CommercialAuditFeedbackEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Index()
  @Column('uuid')
  user_id: string

  @Index()
  @Column('text')
  target_key: string

  @Column('text')
  kind: CommercialAuditFeedbackKind

  @Column('text', { nullable: true })
  comment_text: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
