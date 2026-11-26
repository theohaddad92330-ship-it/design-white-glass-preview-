import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Théo D settings-outils.N1 — l'intention d'un membre de brancher un assistant (« Cadre d'un nouvel accès »).
 * Aucun jeton, aucun droit d'écriture : voir la migration `McpAccessIntents`. Valeurs : `mcp-access-intent.ts`
 * (`@bellum/contracts`), contraintes SQL posées avant ce code.
 */
@Entity({ name: 'mcp_access_intents' })
@Index(['workspace_id', 'status', 'created_at'])
export class McpAccessIntentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  requested_by: string

  @Column('text')
  name: string

  @Column('text')
  perimeter: string

  @Column('text', { default: 'pending' })
  status: string

  @Column('uuid', { nullable: true })
  decided_by: string | null

  @Column({ type: 'timestamptz', nullable: true })
  decided_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
