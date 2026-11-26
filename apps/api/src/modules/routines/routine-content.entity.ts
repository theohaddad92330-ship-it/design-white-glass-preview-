import type { RoutineKey } from '@bellum/contracts'
import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

/**
 * #2843.30 — le gabarit du contenu d'une routine, PAR ESPACE (migration
 * `RoutineContents1796900102000`). Ligne absente = le texte par défaut.
 */
@Entity({ name: 'routine_contents' })
export class RoutineContentEntity {
  @PrimaryColumn('uuid')
  workspace_id: string

  @PrimaryColumn('text')
  routine_key: RoutineKey

  @Column('text')
  template: string

  @Column('uuid', { nullable: true })
  updated_by: string | null

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
