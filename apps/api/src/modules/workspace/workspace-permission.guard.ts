import { InsufficientRoleException } from '../../common/insufficient-role.exception'
import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { type WorkspacePermission, can } from '@bellum/contracts'
import { DATA_EXIT_KEY } from './data-exit.decorator'
import { REQUIRE_PERMISSION_KEY } from './require-permission.decorator'
import { WorkspaceContextService, workspaceRuleRefusal } from './workspace-context.service'

/**
 * Enforces the RBAC permission matrix for a route annotated with
 * {@link RequirePermission}. Resolves the caller's *active workspace* + role
 * (via {@link WorkspaceContextService}) and refuses (403) when that role lacks
 * the declared permission — the server-side backstop that makes `viewer`
 * strictly read-only and keeps `sales`/`sales_ops`/`tech_admin` inside their seat.
 *
 * Must run **after** the auth guard (`req.user` is set by `JwtGuard`), so wire it
 * as `@UseGuards(JwtGuard, WorkspacePermissionGuard)` — guards in one array run
 * left-to-right. A route without `@RequirePermission` metadata passes untouched,
 * so attaching this guard never gates an un-annotated handler.
 */
@Injectable()
export class WorkspacePermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const declared = this.reflector.getAllAndOverride<WorkspacePermission | WorkspacePermission[] | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    )
    // Une seule permission reste acceptée telle quelle : les 50+ routes déjà
    // annotées ne changent pas de forme.
    const permissions = declared === undefined ? [] : Array.isArray(declared) ? declared : [declared]
    // #2081.14 — une route de SORTIE de données (`@DataExit()`) est tenue par la
    // règle d'espace « qui peut exporter », permission déclarée ou non.
    const dataExit =
      this.reflector.getAllAndOverride<boolean | undefined>(DATA_EXIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    // Ni permission ni sortie déclarée → this guard is a no-op (identity guard did its job).
    if (permissions.length === 0 && !dataExit) return true

    const request = context.switchToHttp().getRequest<{ user?: { userId?: string }; route?: { path?: unknown } }>()
    const userId = request.user?.userId
    if (!userId) {
      // Should never happen behind JwtGuard, but fail closed rather than leak.
      throw new ForbiddenException('Authentification requise')
    }

    // The role comes from the authoritative active-workspace resolution (an owner
    // resolves as `owner` from the `workspaces` table, needing no member row), so
    // the check never depends on a backfill gap. Same matrix as `assertPermission`.
    const { role, workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    // Perf P2 (29/09/2026) — les accords en propre et la règle d'espace ne
    // dépendent que de l'espace résolu : lus EN PARALLÈLE, pas en série. La
    // règle n'est lue que pour une sortie de données, comme avant.
    const [extra, rule] = await Promise.all([
      permissions.length > 0 ? this.workspaceContext.extraPermissionsOf(workspaceId, userId) : Promise.resolve([]),
      dataExit ? this.workspaceContext.workspaceRuleRefusing(workspaceId, role, 'data_exit') : Promise.resolve(null),
    ])
    if (permissions.length > 0) {
      // `can()` : le rôle, PUIS les permissions accordées en propre. Les deux
      // chemins de vérification du dépôt (ce guard et `assertPermission`) passent
      // par la même fonction — deux façons de répondre à « a-t-il le droit »
      // finiraient par diverger, et c'est l'une des deux qui garderait mal.
      // Plusieurs permissions déclarées = l'UNE d'entre elles suffit. C'est ce
      // qui permet d'ajouter un droit plus fin sans le retirer à ceux qui
      // faisaient déjà le geste avec l'ancien.
      if (!permissions.some(permission => can(role, extra, permission))) {
        throw new InsufficientRoleException()
      }
    }
    // #2081.14 — LA RÈGLE D'ESPACE PRIME, sur la SORTIE de données seulement
    // (décision Louis 19/09/2026). Un droit que le rôle ou un accord en propre
    // donne peut être RETIRÉ par une règle posée par l'administrateur ; le
    // refus la NOMME — la personne doit savoir que c'est l'espace, pas son
    // rôle. Une route qui n'est pas une sortie ne lit pas les règles : l'import,
    // le partage, la signature (tous `data:export`) ne paient aucune requête.
    if (rule) throw workspaceRuleRefusal(rule)
    // #2879 (#2442.14) — la sortie est AUTORISÉE : elle laisse sa ligne de compteur
    // (alerte « export massif », lue par espace). Après le refus, jamais avant.
    if (dataExit) {
      const routePath = request.route?.path
      this.workspaceContext.recordDataExit(workspaceId, typeof routePath === 'string' ? routePath : '')
    }
    return true
  }
}
