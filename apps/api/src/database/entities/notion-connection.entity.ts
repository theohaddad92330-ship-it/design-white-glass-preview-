import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * A team's OAuth link to a Notion workspace. The access token is stored
 * AES-256-GCM encrypted (reuses the CRM token crypto), never in clear.
 *
 * Dedicated table (not the shared `crm_connections`) so the Notion module stays
 * fully autonomous — removing it drops nothing else (CLAUDE.md rule #7). Reads /
 * writes are scoped by `workspace_id` (the link is shared across the team);
 * `user_id` is kept as created-by attribution. One connection per workspace,
 * enforced by a unique index. RLS is the backstop.
 */
@Entity({ name: 'notion_connections' })
@Index('notion_connections_workspace_uidx', ['workspace_id'], { unique: true })
export class NotionConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  user_id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  /** Notion workspace id the token is bound to. */
  @Column('text', { nullable: true })
  notion_workspace_id: string | null

  /** Human label shown in the UI (the Notion workspace name). */
  @Column('text', { nullable: true })
  workspace_name: string | null

  /** Notion bot id issued at OAuth time (identifies the integration install). */
  @Column('text', { nullable: true })
  bot_id: string | null

  /** AES-256-GCM encrypted access token. */
  @Column('text')
  access_token_enc: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
