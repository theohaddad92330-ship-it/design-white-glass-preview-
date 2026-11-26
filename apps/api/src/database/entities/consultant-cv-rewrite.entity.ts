import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { ConsultantCvRewrite } from '@bellum/contracts'

/**
 * Un CV réécrit pour un besoin (annexe méthodo p22 « Réécriture du CV selon la
 * mission »).
 *
 * Persisté par (consultant, besoin) parce que le commercial doit pouvoir relire
 * EXACTEMENT le document qu'il a envoyé au client. Régénérer remplace la ligne :
 * il n'y a qu'un CV courant par couple, jamais un historique de variantes entre
 * lesquelles l'écran devrait deviner.
 */
@Entity({ name: 'consultant_cv_rewrites' })
@Index(['consultant_id', 'opportunity_id'], { unique: true })
export class ConsultantCvRewriteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('uuid')
  user_id: string

  @Column('uuid')
  consultant_id: string

  @Column('uuid')
  opportunity_id: string

  /** Le livrable déjà passé au garde-fou — jamais la sortie brute du modèle. */
  @Column('jsonb')
  content: ConsultantCvRewrite

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
