import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #3671.2bis — un retour serveur sur un candidat DÉCOUVERT (identifié par son
 * SIREN, il n'a pas encore de ligne `accounts`). Append-only : la même carte
 * ne peut porter deux fois le même verdict (`discover_candidate_feedback_unique`
 * en base) — un second clic est sans effet, jamais un doublon.
 *
 * `verdict: 'wrong_company'` dit que le signal affiché sur la carte n'appartient
 * pas à ce SIREN : le candidat ne doit plus être proposé par les recherches
 * suivantes de CET espace (`DiscoverCandidateFeedbackService.excludedSirens`).
 */
@Entity({ name: 'discover_candidate_feedback' })
@Index('idx_discover_candidate_feedback_workspace_siren', ['workspace_id', 'siren'])
export class DiscoverCandidateFeedbackEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  user_id: string

  @Column('text')
  siren: string

  /** `wrong_company` seule valeur aujourd'hui (CHECK en base). */
  @Column('text')
  verdict: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
