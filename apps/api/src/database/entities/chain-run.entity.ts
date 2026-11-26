import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Où en est UN dossier dans UNE chaîne (PDF 6 §6).
 *
 * Le catalogue des chaînes vit dans le code ; cette table ne porte que ce qui
 * varie d'un dossier à l'autre — la position, l'état, les réponses aux portes.
 */
@Entity({ name: 'chain_runs' })
@Index(['workspace_id', 'chain_key', 'subject_id'], { unique: true })
export class ChainRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  chain_key: string

  @Column('text')
  subject_type: string

  @Column('uuid')
  subject_id: string

  @Column('int', { default: 1 })
  current_position: number

  /** `running` | `blocked` | `done` | `abandoned`. */
  @Column('text', { default: 'running' })
  state: string

  /** Les réponses aux portes déjà tranchées, indexées par position. */
  @Column('jsonb', { default: () => "'{}'::jsonb" })
  gate_answers: Record<string, boolean>

  @CreateDateColumn({ type: 'timestamptz' })
  started_at: Date

  @Column('timestamptz', { nullable: true })
  ended_at: Date | null

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  /**
   * POURQUOI la ligne a été abandonnée (#1503).
   *
   * ⚠️ **Cette table n'est plus ÉCRITE par personne depuis le 05/09/2026.** Les
   * parcours se dérivent des objets métier, et les lignes existantes ont été
   * archivées en bloc par la migration `ChainsDerived`. Sans ce motif, une table
   * entière d'`abandoned` sans raison se lirait, dans six mois, comme un abandon
   * massif d'utilisateurs — alors que c'est un changement de moteur.
   *
   * Elle reste déclarée parce que la table reste LUE (audit, purge de la salle
   * de démonstration) : une colonne ajoutée par migration et absente de son
   * entité est ce que GA-36 refuse.
   */
  @Column('text', { nullable: true })
  abandon_reason: string | null
}
