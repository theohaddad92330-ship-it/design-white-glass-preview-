import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { WorkspaceRole } from './workspace-member.entity'

/**
 * Invitation of an email address to a workspace. The invitee accepts via the
 * opaque `token` (emailed link), which creates a `workspace_members` row. A
 * partial unique index (workspace_id, lower(email)) WHERE status='pending'
 * guarantees at most one live invite per address per workspace.
 */
type WorkspaceInvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

@Entity({ name: 'workspace_invitations' })
export class WorkspaceInvitationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Index()
  @Column('text')
  email: string

  @Column('text', { default: 'member' })
  role: WorkspaceRole

  @Index({ unique: true })
  @Column('text')
  token: string

  @Column('uuid')
  invited_by: string

  @Column('text', { default: 'pending' })
  status: WorkspaceInvitationStatus

  @Column('timestamptz')
  expires_at: Date

  @Column('timestamptz', { nullable: true })
  accepted_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
