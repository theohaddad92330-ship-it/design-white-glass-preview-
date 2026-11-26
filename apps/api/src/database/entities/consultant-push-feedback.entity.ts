import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Feedback d'un push de profil (annexe méthodo p22 « Feedback : retenu / refusé,
 * raison, apprentissage, réutilisation »).
 *
 * Sans boucle de feedback, un push est un coup dans le vide. Ce record capitalise
 * l'issue — la raison et l'apprentissage nourrissent le prochain push (le « REX »
 * de la page). Append-only : chaque push a son verdict daté.
 */
@Entity({ name: 'consultant_push_feedback' })
export class ConsultantPushFeedbackEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Index()
  @Column('uuid')
  user_id: string

  @Index()
  @Column('uuid')
  consultant_id: string

  /** Le besoin poussé (`opportunities.id`), NULL si push hors besoin matérialisé. */
  @Column('uuid', { nullable: true })
  opportunity_id: string | null

  /** retenu | refuse | en_attente */
  @Column('text', { default: 'en_attente' })
  outcome: string

  @Column('text', { nullable: true })
  reason: string | null

  /** L'apprentissage réutilisable — jamais deviné, saisi par le commercial. */
  @Column('text', { nullable: true })
  learning: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
