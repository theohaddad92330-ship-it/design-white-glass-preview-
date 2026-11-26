import { createZodDto } from 'nestjs-zod'
import {
  handOverPortfolioSchema,
  handoverPlanSchema,
  createWorkspaceInvitationSchema,
  setMemberPermissionsSchema,
  setCrossTeamSupportSchema,
  setPortfolioVisibilitySchema,
  switchWorkspaceSchema,
  updateWorkspaceDefaultContextModeSchema,
  updateWorkspaceHiddenSectionsSchema,
  updateWorkspaceMarketSchema,
  updateWorkspaceMemberRoleSchema,
  updateWorkspaceTimezoneSchema,
  setCommunitySharingSchema,
  workspaceActivityQuerySchema,
} from '@bellum/contracts'

/** Body of `POST /workspaces/invitations` — email + role (owner excluded, defaults member). */
export class CreateWorkspaceInvitationDto extends createZodDto(createWorkspaceInvitationSchema) {}

/** Body of `PATCH /workspaces/members/:userId/role` — new role (owner excluded). */
export class UpdateWorkspaceMemberRoleDto extends createZodDto(updateWorkspaceMemberRoleSchema) {}

/** Corps de `PATCH /workspaces/members/:userId/cross-team-support` (#3387.10). */
export class SetCrossTeamSupportDto extends createZodDto(setCrossTeamSupportSchema) {}

/** Corps de `PUT /workspaces/members/:userId/permissions` — la liste COMPLÈTE
 *  des permissions accordées en propre. Un tableau vide les retire toutes. */
export class SetMemberPermissionsDto extends createZodDto(setMemberPermissionsSchema) {}

/**
 * Corps de `POST /workspaces/members/:userId/handover` — le successeur.
 *
 * Le sortant est dans l'URL, le repreneur dans le corps : c'est le sens de la
 * phrase (« le portefeuille de X passe à Y »), et ça rend l'appel illisible à
 * l'envers plutôt que silencieusement inversé.
 */
export class HandOverPortfolioDto extends createZodDto(handOverPortfolioSchema) {}

/** #4158.29 — corps de `POST /workspaces/members/:userId/handover-plan` : la répartition par lots. */
export class HandoverPlanDto extends createZodDto(handoverPlanSchema) {}

/** Corps de `PATCH /workspaces/portfolio-visibility` — qui voit quels comptes. */
export class SetPortfolioVisibilityDto extends createZodDto(setPortfolioVisibilitySchema) {}
/** L'opt-in de la donnée communautaire (tome 2 §5.3, décision D51). */
export class SetCommunitySharingDto extends createZodDto(setCommunitySharingSchema) {}

/** Body of `PATCH /workspaces/market` — the workspace's new target market. */
export class UpdateWorkspaceMarketDto extends createZodDto(updateWorkspaceMarketSchema) {}

/** #1958.2 — Body of `PATCH /workspaces/timezone` — the workspace's timezone. */
export class UpdateWorkspaceTimezoneDto extends createZodDto(updateWorkspaceTimezoneSchema) {}

/** #2957 (#2179.2/.35) — Body of `PATCH /workspaces/hidden-sections`. */
export class UpdateWorkspaceHiddenSectionsDto extends createZodDto(updateWorkspaceHiddenSectionsSchema) {}

/** #2451.9 — Body of `PATCH /workspaces/laura-mode` — le mode de contexte par défaut. */
export class UpdateWorkspaceDefaultContextModeDto extends createZodDto(updateWorkspaceDefaultContextModeSchema) {}

/** Query of `GET /workspaces/activity` — journal filters + offset pagination. */
export class WorkspaceActivityQueryDto extends createZodDto(workspaceActivityQuerySchema) {}

/** Body of `POST /workspaces/active` — the workspace to switch into. Membership
 *  is proven server-side; a well-formed uuid grants nothing on its own. */
export class SwitchWorkspaceDto extends createZodDto(switchWorkspaceSchema) {}
