import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Une compétence d'un talent, TYPÉE.
 *
 * `consultants.stack` (un tableau de texte) reste en place et continue de
 * servir ; il ne peut simplement porter ni niveau, ni ancienneté, ni source. Or
 * « Kubernetes, expert, 6 ans, confirmé en entretien » et « Kubernetes » écrit
 * sur un coin de CV n'ont pas la même valeur devant un client — c'est cette
 * différence-là qu'un vivier doit savoir dire.
 */
@Entity({ name: 'consultant_skills' })
@Index(['consultant_id', 'skill'], { unique: true })
export class ConsultantSkillEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  consultant_id: string

  /** Dénormalisé comme sur `project_needs` : la purge d'un espace efface par
   *  `workspace_id`, sans dépendre d'un ordre de suppression. */
  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  /** Libellé CANONIQUE, résolu par le référentiel d'alias (`k8s` → `kubernetes`). */
  @Index()
  @Column('text')
  skill: string

  /** Ce que la personne a écrit, quand ce n'est pas le libellé canonique. */
  @Column('text', { nullable: true })
  raw_label: string | null

  @Column('text', { default: 'autonome' })
  level: string

  /** `null` = inconnu, jamais 0 : « zéro année » se lirait « n'a jamais
   *  pratiqué », l'inverse d'une compétence listée. */
  @Column('integer', { nullable: true })
  years: number | null

  @Column('integer', { nullable: true })
  last_used_year: number | null

  @Column('text', { default: 'declared' })
  source: string

  /** La famille de la compétence (« langage », « cloud »…). `null` = jamais
   *  saisie — aucune famille inventée par regroupement automatique (#2328.4). */
  @Column('text', { nullable: true })
  family: string | null

  /** Le niveau VALIDÉ par un humain, distinct du niveau DÉCLARÉ (`level`).
   *  `null` = jamais validé (#2328.6). Même domaine que `level` — voir la
   *  contrainte `consultant_skills_validated_level_check`. */
  @Column('text', { nullable: true })
  validated_level: string | null

  /** Une certification NOMMÉE comme preuve de cette compétence (#2328.11). */
  @Column('boolean', { default: false })
  certification: boolean

  /** Un retour client NOMMÉ, texte libre. `null` = aucun (#2328.14). */
  @Column('text', { nullable: true })
  client_feedback: string | null

  /**
   * Compétence PLAUSIBLE lue seule dans un mot-clé, jamais dans une expérience
   * détaillée (#2328.24) — « à vérifier », jamais un must-have. Posée par
   * l'extraction automatique (`addExtractedSkills`), jamais par une saisie
   * humaine (`upsertSkill`).
   */
  @Column('boolean', { default: false })
  inferred: boolean

  @Column('timestamptz', { nullable: true })
  validated_by_consultant_at: Date | null

  @Column('timestamptz', { nullable: true })
  validated_by_recruiter_at: Date | null

  /** L'expérience qui PROUVE cette compétence (#2328.9). `null` = aucune
   *  citée. */
  @Column('uuid', { nullable: true })
  source_experience_id: string | null

  /** Le projet NOMMÉ, dans cette expérience, qui porte la preuve (#2328.10).
   *  Ne peut exister sans `source_experience_id` — contrainte SQL
   *  `consultant_skills_source_project_needs_experience_check`. */
  @Column('text', { nullable: true })
  source_project: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
