import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

/**
 * Which workspace a user is currently working in — one row per user, written
 * only when they explicitly switch (or when they accept an invitation, which
 * switches them to the team they just joined).
 *
 * Why a row and not a column on `profiles`: the workspace module owns its own
 * table (repo rule #7 — removing the module must not leave a dangling column on
 * a hot, shared table), and the FK to `workspaces` with `ON DELETE CASCADE`
 * makes a deleted workspace clean up its own selections instead of leaving
 * dangling pointers behind.
 *
 * **This row is a preference, never an authorisation.** It records a choice; it
 * grants nothing. `WorkspaceContextService.resolveActiveWorkspace` re-proves
 * membership on every single resolution and discards a selection that no longer
 * matches a `workspace_members` row — so revoking a seat takes effect on the
 * member's very next request, with no cleanup step to forget.
 *
 * Absent row = the historical default (the workspace the user owns, else their
 * oldest membership), so every user who never switches behaves exactly as before.
 */
@Entity({ name: 'workspace_active_selections' })
export class WorkspaceActiveSelectionEntity {
  /** One selection per user — the natural key (FK to `auth.users`). */
  @PrimaryColumn('uuid')
  user_id: string

  @Column('uuid')
  workspace_id: string

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
