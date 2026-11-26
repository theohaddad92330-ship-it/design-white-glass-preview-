import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Théo C talents-recrutement — une ligne par changement d'étape de recrutement d'une PERSONNE. Append-only : un
 * journal qu'on réécrit ne prouve rien. L'étape courante est la ligne la plus récente ; sans ligne, « À qualifier ».
 *
 * Étapes : `RECRUITMENT_STAGES` (contrainte `talent_recruitment_events_stage_check`, posée avant ce code). Cette table
 * ne référence ni présentation ni affectation : l'étape de recrutement ne les altère pas.
 */
@Entity({ name: 'talent_recruitment_events' })
@Index(['workspace_id', 'talent_id', 'created_at'])
export class TalentRecruitmentEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  talent_id: string

  @Column('text')
  stage: string

  /** Retour ou motif consigné — jamais lu pour classer la personne. */
  @Column('text', { nullable: true })
  reason: string | null

  /** Le rendez-vous annoncé (à « Échange prévu » seulement). */
  @Column({ type: 'timestamptz', nullable: true })
  planned_at: Date | null

  @Column('uuid')
  changed_by: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
