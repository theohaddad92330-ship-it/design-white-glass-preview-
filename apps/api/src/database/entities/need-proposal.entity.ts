import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Un besoin PROPOSÉ par l'analyse, en attente d'un geste humain.
 *
 * Le pipeline écrit ici et jamais dans `project_needs` : un module n'écrit pas
 * dans le domaine d'un autre, et surtout le pipe ne se remplit pas tout seul de
 * besoins que personne n'a validés.
 */
@Entity({ name: 'need_proposals' })
@Index(['workspace_id', 'status'])
export class NeedProposalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  account_id: string

  @Column('text')
  title: string

  @Column('text', { array: true, default: () => "'{}'" })
  skills: string[]

  @Column('text', { nullable: true })
  location: string | null

  @Column('text', { default: 'job_ad' })
  source: string

  /** Clé d'idempotence : une même offre relue ne crée pas une seconde ligne. */
  @Column('text', { nullable: true })
  source_url: string | null

  @Column('timestamptz', { nullable: true })
  detected_at: Date | null

  @Column('jsonb', { default: () => "'{}'::jsonb" })
  raw: Record<string, unknown>

  @Column('text', { default: 'pending' })
  status: 'pending' | 'accepted' | 'dismissed'

  @Column('timestamptz', { nullable: true })
  decided_at: Date | null

  @Column('uuid', { nullable: true })
  decided_by: string | null

  /** Obligatoire à l'écart : c'est le seul apprentissage que produit un « non ». */
  @Column('text', { nullable: true })
  dismissed_reason: string | null

  @Column('uuid', { nullable: true })
  created_need_id: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
