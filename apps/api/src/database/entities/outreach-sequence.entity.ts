import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { OutreachDelayUnit, OutreachSequenceStatus } from '@bellum/contracts'

/**
 * Une séquence d'outreach multi-touch sur un contact (roadmap §8) : une cadence
 * de relances DATÉES (steps dans `outreach_sequence_steps`). `user_id` = le
 * commercial propriétaire (mutations strictes), `workspace_id` = le scope de
 * lecture (comme `user_actions`).
 */
@Entity({ name: 'outreach_sequences' })
export class OutreachSequenceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Index()
  @Column('uuid')
  user_id: string

  @Index()
  @Column('uuid')
  contact_id: string

  @Column('text')
  name: string

  /**
   * #2203.32 → .38 — L'ÉTIQUETTE de campagne (arbitrage de Louis, 16/09/2026).
   *
   * Les séquences lancées ENSEMBLE la partagent, et le tableau d'audience
   * filtre dessus. Ce n'est pas un objet : il n'y a pas de table « campagne »,
   * pas de cadence commune, pas d'ajout de contact « à la campagne ». Une
   * séquence reste mono-contact, et c'est ce qui lui permet de s'arrêter quand
   * CETTE personne répond.
   *
   * `null` = lancée seule. Ce n'est pas « une campagne sans nom » : la
   * différence se lit, et l'index partiel de la migration ne porte que les
   * lignes étiquetées.
   */
  @Index()
  @Column('text', { nullable: true })
  campaign_label: string | null

  /** #2378.6 — le gabarit d'origine, gardé même après personnalisation. */
  @Column('text', { nullable: true })
  template_key: string | null

  /**
   * #5029.1 — le consultant en intercontrat que cette séquence PROPOSE (Reverse
   * Market). `null` = séquence ordinaire. Non nul ⇒ TOUJOURS manuelle (#5029.2).
   * Migration `1796610000300-OutreachSequenceConsultant` (index partiel `workspace_id, consultant_id`).
   */
  @Column('uuid', { nullable: true })
  consultant_id: string | null

  /** #2378.7 — la séquence dont celle-ci est une copie. */
  @Column('uuid', { nullable: true })
  duplicated_from: string | null

  /**
   * #2380.67 — le FORÇAGE d'une collision (#1935.17) : la séquence ACTIVE que
   * celle-ci a mise en pause pour se créer. `null` = créée sans collision.
   * Migration `1796321990500-OutreachSequenceForce`.
   */
  @Column('uuid', { nullable: true })
  forced_over_sequence_id: string | null

  /** Le motif ÉCRIT qui a levé le refus de collision. `null` ensemble avec
   *  `forced_over_sequence_id` ci-dessus — jamais l'un sans l'autre. */
  @Column('text', { nullable: true })
  force_justification: string | null

  @Column('text', { default: 'active' })
  status: OutreachSequenceStatus

  /**
   * Lot L-B (#4165) — l'unité des délais. Le défaut SQL est `calendar_days`
   * (l'existant ne change pas en silence) ; c'est `OutreachService.create` qui
   * écrit `business_days` pour une séquence NEUVE. Migration `1796489437261`.
   */
  @Column('text', { default: 'calendar_days' })
  delay_unit: OutreachDelayUnit

  /** Lot L-B — quand la PAUSE VACANCES a commencé ; sert à décaler les échéances à la reprise. */
  @Column('timestamptz', { nullable: true })
  vacation_paused_at: Date | null

  /** Lot L-B — la reprise prévue de la pause vacances. `null` = pas en pause vacances. */
  @Column('timestamptz', { nullable: true })
  vacation_until: Date | null

  /**
   * Épopée #2873 (#2367.14) — QUAND la séquence est passée `completed`
   * (`OutreachService.stepDone`). `null` = jamais complétée, ou complétée
   * avant cette colonne (migration `1796321999879`) : jamais une date
   * devinée.
   */
  @Column('timestamptz', { nullable: true })
  completed_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
