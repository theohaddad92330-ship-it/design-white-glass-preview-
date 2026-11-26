import { SetMetadata } from '@nestjs/common'
import type { WorkspacePermission } from '@bellum/contracts'

/** Reflector metadata key carrying the {@link WorkspacePermission} a route needs. */
export const REQUIRE_PERMISSION_KEY = 'workspace:required-permission'

/**
 * Declare the RBAC permission a route requires. Pair with
 * {@link WorkspacePermissionGuard} (after `JwtGuard`, so `req.user` is set):
 *
 * ```ts
 * @Post('start')
 * @UseGuards(JwtGuard, WorkspacePermissionGuard)
 * @RequirePermission('analysis:run')
 * start() { … }
 * ```
 *
 * A route with no `@RequirePermission` is not gated by the permission guard —
 * the guard no-ops — so adding the guard never restricts an un-annotated route.
 */
/**
 * Plusieurs permissions signifient « l'UNE d'entre elles suffit », jamais
 * « toutes ».
 *
 * C'est ce qui permet d'introduire un droit plus fin sans retirer l'accès aux
 * sièges historiques : `@RequirePermission('records:write', 'finance:write')`
 * ouvre la route au nouveau rôle Finance sans fermer la porte aux membres qui
 * l'utilisaient déjà. Le dépôt a explicitement refusé, sur le socle, un
 * backfill qui aurait révoqué des droits acquis — même règle ici.
 */
export const RequirePermission = (...permissions: [WorkspacePermission, ...WorkspacePermission[]]) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permissions)
