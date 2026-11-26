import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm'
import type { BusinessUnitAccess, WorkspaceRole } from '@bellum/contracts'

/**
 * Membership of a user in a workspace, with a role. The role set is the RBAC
 * matrix defined in `@bellum/contracts` (`owner`, `admin`, `sales_ops`, `sales`,
 * `tech_admin`, the legacy `member`, and read-only `viewer`) — re-exported here
 * as the single TS source of truth so the entity type never drifts from the
 * contract. A user may belong to several workspaces (unique per workspace/user
 * pair). The DB CHECK constraint that mirrors this set is widened by migration
 * `1785760000000-RbacRoles`.
 */
export type { WorkspaceRole }

@Entity({ name: 'workspace_members' })
@Unique(['workspace_id', 'user_id'])
export class WorkspaceMemberEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Index()
  @Column('uuid')
  user_id: string

  @Column('text', { default: 'member' })
  role: WorkspaceRole

  /**
   * LE NIVEAU D'ACCÈS — sur QUOI ce membre travaille (#2005.7, #2081.17).
   *
   * ⚠️ Ce n'est pas un rôle. `role` dit ce qu'on a le droit de FAIRE ; ceci dit
   * sur quoi. `'workspace'` est le défaut et le comportement HISTORIQUE : tout
   * l'espace. Toute ligne existante le porte après la migration
   * `1793710000000-BusinessUnits`, donc personne ne perd un accès le jour du
   * déploiement.
   */
  @Column('text', { default: 'workspace' })
  business_unit_access: BusinessUnitAccess

  /**
   * « Renfort transversal » (#3387.10) : épaule les autres sans porter de
   * compte. Un drapeau d'orientation, jamais un droit — voir
   * `workspaceTeamMemberSchema.crossTeamSupport`. Faux par défaut : personne
   * n'est désigné tant que le propriétaire ne l'a pas dit.
   */
  @Column('boolean', { default: false })
  cross_team_support: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
