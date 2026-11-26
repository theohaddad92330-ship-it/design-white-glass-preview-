import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Qui est sur quelle mission, à quelle charge, et jusqu'à quand.
 *
 * La table existait depuis le Delivery OS sans être câblée : c'est ce qui
 * laissait la disponibilité d'un consultant à un champ saisi à la main, donc
 * périmé dès la première mission. Elle est désormais la SOURCE de la
 * disponibilité dérivée.
 *
 * `ends_on` nullable veut dire « sans fin connue » — occupé, sans date. Y mettre
 * une date par défaut ferait apparaître une disponibilité jamais promise.
 */
@Entity({ name: 'mission_assignments' })
@Index(['consultant_id', 'starts_on'])
export class MissionAssignmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  mission_id: string

  /** Dénormalisé : « qui est libre en septembre ? » balaye tout le vivier, et
   *  une jointure sur `missions` à chaque ligne rendrait la question chère. */
  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('uuid')
  consultant_id: string

  /** 1 à 100. Zéro n'est pas une affectation, c'est son absence. */
  @Column('integer')
  load_percent: number

  @Column('date')
  starts_on: string

  @Column('date', { nullable: true })
  ends_on: string | null

  /** #2407.4 — le taux de CETTE affectation (centimes/jour). Financier. */
  @Column('integer', { nullable: true })
  daily_rate_cents: number | null

  /** #2407.4 — le lieu d'exécution. */
  @Column('text', { nullable: true })
  work_location: string | null

  /** #2407.4 — `onsite` | `hybrid` | `remote` (contrainte SQL). */
  @Column('text', { nullable: true })
  remote_mode: string | null

  /** #2407.6 — le statut PROPRE de l'affectation (`ASSIGNMENT_STATUSES`,
   *  contrainte SQL), indépendant de celui de la mission (decisions §9). */
  @Column('text', { default: 'confirmed' })
  status: string

  /** #2407.4 (suite) — le consentement DÉCLARÉ : oui/non, jamais deviné. */
  @Column('boolean', { nullable: true })
  consent_given: boolean | null

  /** #2407.4 (suite) — n'a de sens que si `consent_given` est renseigné
   *  (contrainte SQL `assignment_consent_date_check`). */
  @Column('date', { nullable: true })
  consent_date: string | null

  /** #2407.4 (suite) — DÉCLARATIF, texte libre : jamais un sous-système de
   *  suivi documentaire (decisions §1, version minimale). */
  @Column('text', { nullable: true })
  documents_expected: string | null

  /** #2407.4 (suite) — DÉCLARATIF, texte libre. */
  @Column('text', { nullable: true })
  documents_received: string | null

  /** #2407.4 (suite) — DÉCLARATIF, texte libre. Aucun score, aucune
   *  probabilité (doctrine). */
  @Column('text', { nullable: true })
  declared_risks: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
