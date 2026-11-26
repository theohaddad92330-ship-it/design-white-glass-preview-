import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { LibraryItemKind } from '@bellum/contracts'

/**
 * A reusable knowledge-library item: a sales **template** (email/call/pitch copy)
 * or a **playbook** (strategy). Workspace-scoped, team-shared — the same model as
 * `rag_documents`: `workspace_id` is the read scope, `user_id` the created-by
 * attribution. New workspaces are lazily seeded with a starter set on first read
 * (`LibraryService.listForWorkspace`). See `agent_docs/multi-user-workspaces.md`.
 */
@Entity({ name: 'library_items' })
@Index(['workspace_id', 'kind'])
export class LibraryItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  user_id: string

  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('text')
  kind: LibraryItemKind

  @Column('text', { default: '' })
  title: string

  @Column('text', { nullable: true })
  description: string | null

  @Column('text', { nullable: true })
  category: string | null

  @Column('text', { default: '' })
  body: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
