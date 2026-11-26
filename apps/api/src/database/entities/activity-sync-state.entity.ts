import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Jusqu'où la capture est allée, par source et par utilisateur.
 *
 * Sans cette ligne, chaque synchronisation relirait l'historique complet du
 * fournisseur : lent, cher en quota, et pour rien puisque l'idempotence
 * écarterait tout. Une seule ligne par couple, écrasée à chaque passage.
 */
@Entity({ name: 'activity_sync_state' })
@Index(['workspace_id', 'user_id', 'source'], { unique: true })
export class ActivitySyncStateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  user_id: string

  @Column('text')
  source: string

  @Column('timestamptz', { nullable: true })
  last_synced_at: Date | null

  /** En clair : « 12 activités », « Graph 503 ». Un silence normal ne doit pas
   *  ressembler à une panne. */
  @Column('text', { nullable: true })
  last_outcome: string | null

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
