import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Une version de dossier de compétences (PDF 3 §9.2).
 *
 * Chaque génération AJOUTE une ligne. Aucune n'écrase la précédente : quand un
 * client répond trois semaines plus tard, il faut savoir ce qu'il a reçu.
 */
@Entity('cv_versions')
@Index(['consultant_id', 'generated_at'])
export class CvVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('uuid')
  consultant_id: string

  @Column('uuid', { nullable: true })
  need_id: string | null

  /** L'opportunité visée (#2187.25) — un besoin commercial pas encore
   *  matérialisé en rôle staffé. */
  @Column('uuid', { nullable: true })
  opportunity_id: string | null

  /** L'appel d'offres visé (#2187.26), quand la version part de là. */
  @Column('uuid', { nullable: true })
  rfp_id: string | null

  /** La mission comparable prise pour référence (#2187.27). */
  @Column('uuid', { nullable: true })
  comparable_mission_id: string | null

  @Column('text')
  version_kind: string

  @Column('text', { default: 'default' })
  template_key: string

  @Column('text', { default: 'fr' })
  language: string

  @Column('text', { default: 'nom_complet' })
  anonymisation_rule: string

  @Column('jsonb', { default: () => "'[]'" })
  sections: { title: string; body: string }[]

  /** Les compétences barrées, avec leur raison. */
  @Column('jsonb', { default: () => "'[]'" })
  excluded_skills: { term: string; reason: string }[]

  /** Le diff complet, retenu ET barré — avant/après/raison/preuve (#2333.5). */
  @Column('jsonb', { default: () => "'[]'" })
  changes: { before: string; after: string; reason: string; sourceProof: string | null }[]

  /** Les compétences retenues qui recoupent le besoin ciblé (#2187.38). */
  @Column('jsonb', { default: () => "'[]'" })
  highlighted_skills: string[]

  @Column('uuid', { nullable: true })
  generated_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  generated_at: Date

  /** À qui il a été envoyé. `null` = généré, jamais envoyé. */
  @Column('uuid', { nullable: true })
  sent_to_contact_id: string | null

  /** `pending_validation` ou `validated` selon la policy d'espace (#2333.8). */
  @Column('text', { default: 'validated' })
  status: string

  @Column('uuid', { nullable: true })
  validated_by: string | null

  @Column('timestamptz', { nullable: true })
  validated_at: Date | null
}
