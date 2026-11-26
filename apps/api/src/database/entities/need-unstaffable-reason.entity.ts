import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Le catalogue de motifs de non-staffabilité (PDF 2 §7.6).
 *
 * Ce qu'il produit est le vrai sujet : le taux de besoins refusés PAR CAUSE,
 * qui dit à l'ESN ce qu'elle ne sait pas faire. Un catalogue par ESPACE, parce
 * que « habilitation non détenue » ne veut rien dire chez une ESN data et tout
 * chez une ESN défense.
 */
@Entity('need_unstaffable_reasons')
@Index(['workspace_id'])
export class NeedUnstaffableReasonEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  label: string

  @Column('boolean', { default: false })
  archived: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
