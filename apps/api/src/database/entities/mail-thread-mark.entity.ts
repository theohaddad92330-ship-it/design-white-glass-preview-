import type { MailThreadMark } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm'

/**
 * LA DÉCISION MANUELLE posée sur un fil de messagerie (#2104.6 / #2104.7 /
 * #2104.8) : marqué traité, signalé non pertinent, ou rattaché à la main à un
 * compte quand l'auto-détection (`thread-account-link.ts`) n'a rien trouvé.
 *
 * Scopée par `user_id`, PAS `workspace_id` — même choix que `mail_send_batches`
 * (`mail-batch.entity.ts`) : la messagerie connectée est PERSONNELLE (un jeton
 * OAuth par utilisateur), jamais partagée par l'espace. Une ligne ici n'entre
 * donc pas dans le périmètre du garde-fou `workspace_id` de la démo
 * (`demo-reset.service.spec.ts`) — elle vit dans la liste sœur,
 * `DEMO_PURGE_USER_TABLES` (`demo-reset.service.ts`), au même titre que
 * `mail_send_batches` en aurait besoin si la démo pouvait réellement envoyer.
 *
 * Une ligne par (utilisateur, fil) : `state` ET `account_id` peuvent coexister
 * (un fil rattaché à la main peut aussi être marqué traité), donc une seule
 * table plutôt que deux qui diraient chacune la moitié de la décision.
 */
@Entity({ name: 'mail_thread_marks' })
@Unique('mail_thread_marks_user_thread', ['user_id', 'thread_id'])
export class MailThreadMarkEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  user_id: string

  @Column('text')
  thread_id: string

  /** `null` = aucune décision — ni traité, ni signalé non pertinent. */
  @Column('text', { nullable: true })
  state: MailThreadMark | null

  /** Rattachement MANUEL (#2104.6). `null` = pas de rattachement manuel. */
  @Column('uuid', { nullable: true })
  account_id: string | null

  /** Théo B M1.N2 — reporté jusqu'à cette date (aucun rappel externe). `null` = pas reporté. */
  @Column('timestamptz', { nullable: true })
  snooze_until: Date | null

  /** Théo B M1.N3 — priorité posée à la main ; la priorité CALCULÉE reste ailleurs (`mail-priority.ts`). */
  @Column('boolean', { default: false })
  priority_manual: boolean

  /** Théo B M1.N6 — contact rattaché à la main, en plus du compte. `null` = aucun. */
  @Column('uuid', { nullable: true })
  contact_id: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
