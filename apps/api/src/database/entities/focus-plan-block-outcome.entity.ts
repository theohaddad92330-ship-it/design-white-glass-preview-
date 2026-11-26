import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { FocusPlanBlockOutcome } from '@bellum/contracts'

/**
 * La mesure post-bloc d'un plan de journée (#2770.63/.64/.65, #2391.51/.52/.53)
 * — voir la migration `1796412731846-FocusPlanBlockOutcomes` pour le contexte
 * complet. UPSERTABLE sur `(user_id, external_event_id)` : contrairement à
 * `agenda_bellum_created_event`, une correction humaine gagne toujours.
 */
@Entity({ name: 'focus_plan_block_outcomes' })
@Index(['user_id'])
export class FocusPlanBlockOutcomeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  user_id: string

  @Column('text')
  external_event_id: string

  @Column('text')
  outcome: FocusPlanBlockOutcome

  /** #2770.66 — le résultat, en texte libre écrit par la personne (NULL = non renseigné). */
  @Column({ type: 'text', nullable: true })
  result_note: string | null

  /** #2770.67 — la durée réelle DÉCLARÉE, en minutes (jamais mesurée ; NULL = non renseignée). */
  @Column({ type: 'integer', nullable: true })
  actual_minutes: number | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
