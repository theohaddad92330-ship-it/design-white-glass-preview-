import type { RoutineAutonomy, RoutineKey } from '@bellum/contracts'
import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

/**
 * #2843.13 — l'autonomie et l'owner réglés sur UNE routine par UN utilisateur
 * (migration `RoutinePreferences1796900100000`). Ligne absente = défaut du catalogue.
 */
@Entity({ name: 'routine_preferences' })
export class RoutinePreferenceEntity {
  @PrimaryColumn('uuid')
  user_id: string

  @PrimaryColumn('text')
  routine_key: RoutineKey

  @Column('text', { nullable: true })
  autonomy: RoutineAutonomy | null

  @Column('uuid', { nullable: true })
  owner_user_id: string | null

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
