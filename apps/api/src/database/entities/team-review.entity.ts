import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Le compte rendu d'un « point d'équipe » (Théo D team-review.N1) : qui l'a tenu,
 * quand, la note libre, et ce que chaque décision est devenue dans le plan
 * (créée / mise à jour). Voir la migration `TeamReviews`.
 *
 * Il ne porte AUCUN corps de message et ne déclenche aucun envoi : c'est la
 * trace d'une décision, pas un canal.
 */
@Entity({ name: 'team_reviews' })
@Index('team_reviews_workspace_created_idx', ['workspace_id', 'created_at'])
export class TeamReviewEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  held_by: string

  /** « Un autre point à partager » — `null` quand rien n'a été écrit. */
  @Column('text', { nullable: true })
  note: string | null

  /** « Point sans nouvelle action » : le point est tenu, aucune ligne de plan n'est écrite. */
  @Column('boolean', { default: false })
  no_new_action: boolean

  /** `[{ topic_id, item_id, outcome }]` — jamais NULL : un tableau vide dit « aucune décision ». */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  decisions: { topic_id: string; item_id: string; outcome: string }[]

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
