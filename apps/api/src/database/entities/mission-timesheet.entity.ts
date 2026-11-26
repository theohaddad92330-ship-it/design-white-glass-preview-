import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { TimesheetStatus } from '@bellum/contracts'

/**
 * Un relevé d'activité mensuel (CRA), addendum final p71.
 *
 * `days` est un nombre décimal, pas un entier : les demi-journées existent, et
 * les arrondir fausserait la facturation que l'outil comptable produira ensuite.
 *
 * `anomalies` est un tableau, vide par défaut. Vide veut dire « rien détecté »,
 * pas « rien à signaler » — la nuance compte, parce que le détecteur peut ne pas
 * avoir tourné.
 */
@Entity({ name: 'mission_timesheets' })
// L'unicité porte sur le CONSULTANT en plus du mois : deux personnes sur une
// même mission déposent deux relevés, et l'ancien index les faisait s'écraser.
// L'index réel est créé par la migration (il porte un COALESCE sur l'uuid nul,
// que TypeORM ne sait pas décrire).
@Index(['mission_id', 'period_month'])
export class MissionTimesheetEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  mission_id: string

  /** Mois couvert, au premier du mois. */
  @Column('date')
  period_month: string

  @Column('numeric', { transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
  days: number

  @Column('text')
  status: TimesheetStatus

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  anomalies: string[]

  /** QUI a déposé. Deux consultants sur une mission = deux relevés. */
  @Column('uuid', { nullable: true })
  consultant_id: string | null

  /** La charge attendue au moment du dépôt. Figée, pas recalculée : un écart
   *  doit rester celui qu'on a constaté. */
  @Column('numeric', {
    nullable: true,
    transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : Number(v)) },
  })
  expected_days: number | null

  /** Pourquoi l'écart est normal. Vide = personne n'a regardé, et ça bloque. */
  @Column('text', { nullable: true })
  gap_explanation: string | null

  /** La validation qui autorise à facturer — celle du CLIENT. */
  @Column('timestamptz', { nullable: true })
  validated_by_client_at: Date | null

  @Column('uuid', { nullable: true })
  validated_by: string | null

  /**
   * #2415.6 — la revue INTERNE, geste séparé de la validation CLIENT
   * ci-dessus (`TimesheetsService.reviewInternally`) : elle ne touche ni
   * `status` ni `validated_by_client_at`. Ajoutées par la migration
   * `1796001454072-TimesheetInternalReview`, additives et nullables — les
   * relevés déjà en base n'ont pas cette trace et ne l'inventent pas.
   */
  @Column('timestamptz', { nullable: true })
  internal_reviewed_at: Date | null

  @Column('uuid', { nullable: true })
  internal_reviewed_by: string | null

  /**
   * Le rejet, et son MOTIF — jamais l'un sans l'autre.
   *
   * `mission_timesheets_rejection_reason_check` tient le couple en base : dès
   * qu'une date de rejet existe, le motif est non vide. La garantie ne peut pas
   * vivre seulement dans l'écran — un appel direct à l'API la contournerait.
   *
   * On ARCHIVE, on ne supprime pas : redéposer repasse le relevé en `submitted`
   * sans effacer ces trois colonnes. La trace du rejet précédent reste lisible,
   * ce qui est précisément ce qu'on voudra relire dans six mois.
   */
  @Column('timestamptz', { nullable: true })
  rejected_at: Date | null

  @Column('text', { nullable: true })
  rejection_reason: string | null

  @Column('uuid', { nullable: true })
  rejected_by: string | null

  /**
   * #2415.7 — COMBIEN de jours posent problème, et PAR QUAND corriger — le
   * motif dit POURQUOI, ces deux colonnes disent QUOI et QUAND. Le même
   * couple que `rejection_reason` : `mission_timesheets_contested_days_check`
   * tient en base que les DEUX arrivent ensemble avec `rejected_at`.
   *
   * On ARCHIVE, on ne supprime pas : redéposer ne les efface pas, même régime
   * que `rejection_reason`.
   */
  @Column('numeric', {
    nullable: true,
    transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : Number(v)) },
  })
  contested_days: number | null

  @Column('date', { nullable: true })
  correction_deadline: string | null

  /**
   * #2415.5 — QUI a déclaré ces jours, distinct de `consultant_id` (DE QUI ils
   * sont). Aujourd'hui un seul canal existe (`POST .../timesheets`, l'espace
   * lui-même) : ce n'est PAS toujours le consultant — `submitTimesheet` accepte
   * un `consultantId` distinct de l'appelant, donc un ops peut déclarer POUR un
   * consultant. Sans cette colonne, cette distinction n'était tracée nulle part.
   *
   * ⚠️ Ce n'est PAS un document — Bellum ne stocke aucun fichier de preuve sur
   * un relevé d'activité (décision documentée, `TimesheetReviewDrawer.tsx`) :
   * la source, ici, est QUI a cliqué, jamais une pièce jointe.
   */
  @Column('uuid', { nullable: true })
  submitted_by: string | null

  @Column('int', { default: 0 })
  reminders_sent: number

  @Column('timestamptz', { nullable: true })
  last_reminder_at: Date | null

  /**
   * #2416.39 — l'instantané du contact CRA (`missions.cra_contact_id`) au
   * moment de la PREMIÈRE relance de la période. `dueReminders` compare ce
   * gel à la valeur ACTUELLE : un écart arrête la séquence — le contact de la
   * séquence a changé. `NULL` tant qu'aucune relance n'a encore été
   * enregistrée, jamais deviné. Migration `MissionTimesheetReminderContactSnapshot`.
   */
  @Column('uuid', { nullable: true })
  reminder_contact_id: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  /** Ajoutée par la migration `1789691847302` et déclarée par aucune entité :
   *  GA-36 ne lisait que la première colonne d'un `ALTER TABLE` multi-colonnes. */
  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
