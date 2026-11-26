import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/** Une demande d'écriture dans l'ERP, en attente d'un responsable. */
@Entity({ name: 'ats_write_requests' })
@Index(['workspace_id', 'state'])
export class AtsWriteRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  requested_by: string

  @Column('text')
  kind: 'create_mission' | 'update_tjm' | 'update_need_status' | 'log_call'

  @Column('jsonb', { default: () => "'{}'::jsonb" })
  payload: Record<string, unknown>

  /** Ce qui a été MONTRÉ au demandeur. Figé — jamais recalculé à l'affichage. */
  @Column('text')
  preview: string

  @Column('text', { default: 'pending' })
  state: 'pending' | 'approved' | 'rejected' | 'expired' | 'failed'

  @Column('uuid', { nullable: true })
  decided_by: string | null

  @Column('timestamptz', { nullable: true })
  decided_at: Date | null

  @Column('timestamptz')
  expires_at: Date

  /** La réponse de l'ERP, telle quelle. Un échec reste visible comme échec. */
  @Column('text', { nullable: true })
  result: string | null

  /**
   * #2864 — reste du lot précédent : le collègue du MÊME espace à qui la
   * demande a été confiée (`AtsWriteService.assign`, même règle que
   * `approval_requests.assigned_to`). `null` = circuit d'origine.
   */
  @Column('uuid', { nullable: true })
  assigned_to: string | null

  /**
   * #2856 — reste du lot précédent : reportée jusqu'à cette date
   * (`AtsWriteService.snooze`, même règle que
   * `approval_requests.snoozed_until`). Ne peut pas dormir au-delà de
   * `expires_at` (CHECK SQL `ats_write_requests_snooze_before_expiry`).
   */
  @Column('timestamptz', { nullable: true })
  snoozed_until: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
