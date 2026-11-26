import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Une exécution d'import — y compris quand elle n'a RIEN écrit (`dry_run`).
 *
 * Garder les simulations est délibéré : c'est la trace qu'on a regardé avant
 * d'écrire, et c'est ce qu'on relit quand le résultat surprend.
 */
@Entity({ name: 'sync_runs' })
@Index(['workspace_id', 'started_at'])
export class SyncRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  provider: string

  @Column('text')
  entity_type: string

  @Column('boolean', { default: true })
  dry_run: boolean

  @Column('integer', { default: 0 })
  created: number

  @Column('integer', { default: 0 })
  updated: number

  @Column('integer', { default: 0 })
  skipped_count: number

  @Column('boolean', { default: false })
  truncated: boolean

  /** #4189 — fiches modifiées des deux côtés : la correction humaine est gardée, l'écart est COMPTÉ. */
  @Column('integer', { default: 0 })
  conflict_count: number

  @Column('uuid', { nullable: true })
  started_by: string | null

  @Column('timestamptz', { default: () => 'now()' })
  started_at: Date

  @Column('timestamptz', { nullable: true })
  finished_at: Date | null

  /** L'erreur du fournisseur, TELLE QUELLE. « L'import a échoué » n'aide
   *  personne ; « 401 invalid_grant » se répare. */
  @Column('text', { nullable: true })
  error: string | null
}
