import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2412 — une entrée du double pouls de satisfaction d'une mission active.
 *
 * Table à part, comme `MissionExpenseEntity` : pas de `updated_at`, une
 * entrée n'est jamais corrigée ni fusionnée — on en ajoute une nouvelle
 * (doctrine « on archive, on ne supprime pas »).
 */
@Entity({ name: 'mission_feedback' })
@Index(['mission_id', 'rail', 'created_at'])
export class MissionFeedbackEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  mission_id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  /** `client` | `consultant` — les deux rails, jamais fusionnés. */
  @Column('text')
  rail: string

  @Column('text')
  note: string

  /** `true` ⇒ visible du seul auteur (`recorded_by`), jamais de l'équipe. */
  @Column('boolean', { default: false })
  private: boolean

  /** `human` | `connector` | `pipeline` | `model` — vocabulaire de
   *  `FIELD_SOURCES` (@bellum/contracts). Toujours `human` sur cette route. */
  @Column('text', { default: 'human' })
  source: string

  /** #2408.16 — `low` | `medium` | `high`, ou `null` (non déclaré, jamais un
   *  niveau par défaut). Migration `1796610003098`. */
  @Column('text', { nullable: true })
  level: string | null

  @Column('uuid')
  recorded_by: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
