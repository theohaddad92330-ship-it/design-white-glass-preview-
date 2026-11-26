import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Un talent positionné sur un projet — ce qui part réellement chez le client.
 *
 * `cv_snapshot` fige la version envoyée : le CV du vivier continue d'évoluer, et
 * sans copie on ne saurait plus ce que le client a lu au moment de préparer la
 * soutenance.
 */
@Entity({ name: 'submissions' })
@Index(['workspace_id', 'stage'])
export class SubmissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  project_id: string

  /** Le rôle précis visé, quand le projet en porte plusieurs. */
  @Column('uuid', { nullable: true })
  need_id: string | null

  @Index()
  @Column('uuid')
  consultant_id: string

  @Column('text', { default: 'shortlisted' })
  stage: string

  /** #2335.1 — le niveau de détail EN PLUS de `stage` (seize valeurs
   *  possibles, `packages/contracts`). `null` = jamais déclaré. */
  @Column('text', { nullable: true })
  substatus: string | null

  @Column('timestamptz', { default: () => 'now()' })
  stage_entered_at: Date

  /** Quand le CV est PARTI. Point de départ de toute mesure de latence — le
   *  déduire de `created_at` compterait la sélection interne comme du temps client. */
  @Column('timestamptz', { nullable: true })
  submitted_at: Date | null

  /** Le score poussable au moment du positionnement. `null` quand le
   *  positionnement n'est pas né d'un matching — jamais 0, qui se lirait
   *  « le moteur l'a jugé mauvais et on l'a poussé quand même ». */
  @Column('integer', { nullable: true })
  pushable_score: number | null

  /** Premier retour, quel qu'il soit. `null` = toujours rien, et c'est une
   *  information, pas un trou. */
  @Column('timestamptz', { nullable: true })
  first_feedback_at: Date | null

  @Column('timestamptz', { nullable: true })
  closed_at: Date | null

  @Column('text', { nullable: true })
  outcome_reason: string | null

  @Column('text', { nullable: true })
  outcome_detail: string | null

  /** Centimes. `null` = non chiffré, jamais 0. */
  @Column('bigint', { nullable: true })
  proposed_rate_cents: string | number | null

  /** #4192 — jours prévus. `null` = non chiffré, jamais 0. */
  @Column('integer', { nullable: true })
  planned_days: number | null

  /** #4192 — coût journalier, centimes. `null` = non chiffré, jamais 0. */
  @Column('bigint', { nullable: true })
  daily_cost_cents: string | number | null

  @Column('text', { nullable: true })
  cv_snapshot: string | null

  @Column('uuid', { nullable: true })
  owner_id: string | null

  /** #2177.6 / .25 — le contact destinataire chez le client. `null` = jamais
   *  déclaré. */
  @Column('uuid', { nullable: true })
  recipient_contact_id: string | null

  /** #2177.24 — le canal, contraint aux quatre valeurs déjà canoniques. */
  @Column('text', { nullable: true })
  channel: string | null

  /** #2177.8 — le message PRÉPARÉ pour accompagner l'envoi. Jamais expédié
   *  par le copilote. */
  @Column('text', { nullable: true })
  message: string | null

  /** #2177.28 — la disponibilité annoncée au moment du positionnement, figée. */
  @Column('text', { nullable: true })
  availability: string | null

  /** #2177.30 — les conditions particulières de ce positionnement. */
  @Column('text', { nullable: true })
  conditions: string | null

  /** #2320.18 — l'accord DÉCLARÉ du consultant à être proposé sur ce
   *  positionnement. `null` = jamais déclaré, jamais deviné. Contrainte SQL
   *  `submission_consultant_agreement_date_check` (migration `1796321344689`). */
  @Column('boolean', { nullable: true })
  consultant_agreement: boolean | null

  /** N'a de sens QUE si `consultant_agreement` est renseigné. */
  @Column('date', { nullable: true })
  consultant_agreement_date: string | null

  /** #2189.39 — la prochaine action sur CE positionnement. Les trois colonnes
   *  voyagent ENSEMBLE : contrainte `submissions_next_action_check` (migration
   *  `1796321396120`), posée AVANT ce code (GA-11/GA-12). */
  @Column('text', { nullable: true })
  next_action_label: string | null

  @Column('date', { nullable: true })
  next_action_due_at: string | null

  @Column('uuid', { nullable: true })
  next_action_owner_id: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
