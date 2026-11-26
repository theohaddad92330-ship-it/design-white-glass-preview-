import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm'

/**
 * #4189 — le CURSEUR de la synchro incrémentale d'un CRM : la date de
 * modification la plus récente déjà vue, par (espace, fournisseur, objet).
 *
 * Il n'avance que sur un passage qui a abouti ; `last_error` garde le dernier
 * échec TEL QUEL (« 401 invalid_grant » se répare). `last_run_at` est la date du
 * dernier ESSAI ; `last_success_at` (#4290.16) celle de la dernière synchro RÉUSSIE — la seule que l'écran affiche
 * comme « synchronisé ».
 */
@Entity({ name: 'crm_sync_cursors' })
@Unique('crm_sync_cursors_unique', ['workspace_id', 'provider', 'entity_type'])
export class CrmSyncCursorEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  provider: string

  @Column('text')
  entity_type: string

  @Column('timestamptz', { nullable: true })
  cursor_at: Date | null

  @Column('timestamptz', { nullable: true })
  last_run_at: Date | null

  @Column('timestamptz', { nullable: true })
  last_success_at: Date | null

  // #4467 — l'instant du dernier ESSAI, réussi ou non (`last_run_at` garde la dernière réussite quand une passe échoue).
  @Column('timestamptz', { nullable: true })
  last_attempt_at: Date | null

  @Column('uuid', { nullable: true })
  last_run_id: string | null

  @Column('text', { nullable: true })
  last_error: string | null
}
