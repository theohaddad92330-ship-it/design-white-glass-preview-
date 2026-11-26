import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Un alias de compétence PROPOSÉ, jamais appliqué seul (PDF 3 §5.3).
 *
 * Une correction de recruteur crée une proposition ; un administrateur tranche.
 * Appliquer seul rapprocherait deux compétences que personne n'a validées, et
 * le matching remonterait des profils sur un mot qu'ils n'ont jamais écrit.
 */
@Entity({ name: 'skill_alias_proposals' })
@Index(['workspace_id', 'status'])
export class SkillAliasProposalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  /** Le terme tel qu'il a été écrit, en minuscules. */
  @Column('text')
  raw_term: string

  /** Le terme canonique visé. `null` = inconnu du référentiel, à trancher. */
  @Column('text', { nullable: true })
  canonical_term: string | null

  @Column('text', { default: 'pending' })
  status: string

  /** Un mot vu quinze fois mérite d'être tranché avant un mot vu une fois. */
  @Column('integer', { default: 1 })
  occurrences: number

  @Column('uuid', { nullable: true })
  proposed_by: string | null

  @Column('uuid', { nullable: true })
  decided_by: string | null

  @Column('timestamptz', { nullable: true })
  decided_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
