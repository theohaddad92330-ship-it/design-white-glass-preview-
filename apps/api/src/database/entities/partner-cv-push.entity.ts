import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2887 (#2371.8) — la revue d'un CV poussé à un partenaire. Voir la
 * migration `PartnerCvPushes1796350118061` pour la raison de chaque colonne.
 */
@Entity({ name: 'partner_cv_pushes' })
@Index(['workspace_id', 'partner_relation_id', 'created_at'])
export class PartnerCvPushEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  partner_relation_id: string

  @Column('uuid')
  consultant_id: string

  /** Le partage négocié avec CE partenaire — `null` tant que personne ne l'a déclaré. */
  @Column('numeric', { nullable: true })
  margin_share_pct: number | null

  @Column('text', { default: 'preparee' })
  status: string

  @Column('text', { default: 'en_attente' })
  outcome: string

  @Column('uuid', { nullable: true })
  prepared_by: string | null

  @Column('timestamptz', { nullable: true })
  sent_declared_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
