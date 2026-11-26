import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Une tâche : quelque chose à faire, une date, un propriétaire.
 *
 * `due_on` est une DATE (pas un horodatage) et n'est jamais nulle — une tâche
 * sans échéance ne remonte dans aucune vue, donc n'est jamais faite.
 */
@Entity({ name: 'tasks' })
@Index(['workspace_id', 'owner_id', 'due_on'])
export class TaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  /** À qui elle est. `null` = à personne, et l'écran le dit plutôt que de
   *  l'attribuer d'office à quelqu'un qui l'ignorerait. */
  @Column('uuid', { nullable: true })
  owner_id: string | null

  @Column('uuid', { nullable: true })
  created_by: string | null

  @Column('text')
  title: string

  @Column('text', { nullable: true })
  details: string | null

  @Column('text', { default: 'todo' })
  status: string

  @Column('text', { default: 'normal' })
  priority: string

  /** `YYYY-MM-DD`. TypeORM rend une colonne `date` comme une chaîne. */
  @Column('date')
  due_on: string

  /** #2105.7 — jamais deviné : posé par le service selon l'appelant. */
  @Column('text', { default: 'manual' })
  source: string

  /**
   * #2105.9 — le run Action OS d'où cette tâche vient, quand elle en vient
   * un. `null` pour toute tâche manuelle ou de conversion de lead — les seuls
   * appelants à ce jour n'en posent pas. Pas de FK déclarée ici, même
   * convention que `account_id`/`contact_id`/`project_id` : la cohérence se
   * vérifie côté application, pas en base, sur cette table.
   */
  @Column('uuid', { nullable: true })
  related_action_run_id: string | null

  /**
   * #2105.53 (correctif) — l'identité de la carte du brief dont cette tâche
   * vient (`briefingActionSourceKey`, `@bellum/contracts`), quand elle vient
   * du CTA « Transformer ce sujet en prochaine action ». `null` pour toute
   * autre création (composeur manuel, conversion de lead). Jamais affichée :
   * sert uniquement à ce que `BriefingService.allActions` ne reproprose pas
   * une carte déjà transformée.
   */
  @Column('text', { nullable: true })
  source_label_key: string | null

  /** #2105.2 — « à quoi ressemble fait », distinct de `details`. */
  @Column('text', { nullable: true })
  expected_result: string | null

  @Index()
  @Column('uuid', { nullable: true })
  account_id: string | null

  @Column('uuid', { nullable: true })
  contact_id: string | null

  @Column('uuid', { nullable: true })
  project_id: string | null

  @Column('timestamptz', { nullable: true })
  completed_at: Date | null

  @Column('uuid', { nullable: true })
  completed_by: string | null

  /** #2105.54 — « quel résultat » : l'équivalent, pour une tâche, du
   *  `outcome` d'une carte Action OS. `null` = pas encore noté. */
  @Column('text', { nullable: true })
  result_note: string | null

  /** #2395.4/#2395.9 (épopée #2901) — le canal choisi à la création, jamais
   *  deviné : source de `canonicalActionFromTask` pour poser `type`/
   *  `expected_outcome` (`action.ts`). Contrainte SQL dans la migration. */
  @Column('text', { nullable: true })
  channel: string | null

  /** #2395.8 (épopée #2871) — POURQUOI cette tâche, distinct de `details`
   *  (« de quoi s'agit-il ? ») et `expected_result` (« à quoi ressemble
   *  fait ? »). Requis à l'écriture par `createTaskSchema` ; `null` pour
   *  toute ligne créée avant cette colonne. */
  @Column('text', { nullable: true })
  objective: string | null

  /** #3271.8 reste (épopée #3298) — le rituel d'où cette action vient
   *  (`RITUAL_KEYS`), posé UNIQUEMENT par « Créer une action » de l'écran des
   *  rituels. `null` pour toute autre tâche : jamais deviné après coup. */
  @Column('text', { nullable: true })
  ritual_key: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
