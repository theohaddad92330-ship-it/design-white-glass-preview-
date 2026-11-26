import { ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import {
  can,
  resolveWorkspaceRuleValues,
  workspaceRuleForbids,
  workspaceRuleRefusalMessage,
  type ActiveWorkspace,
  type PortfolioVisibility,
  type WorkspacePermission,
  type WorkspaceRuleGesture,
  type WorkspaceRuleKey,
  type WorkspaceRuleValues,
  type WorkspaceSummary,
} from '@bellum/contracts'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity, type WorkspaceRole } from '../../database/entities/workspace-member.entity'
import { WorkspaceActiveSelectionEntity } from '../../database/entities/workspace-active-selection.entity'
import { WorkspaceMemberPermissionEntity } from '../../database/entities/workspace-member-permission.entity'
import { WorkspaceRulesEntity } from '../../database/entities/workspace-rules.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { forgetForRequest, memoizeForRequest } from '../../common/request-memo'

/** Perf P2 — la clé du mémo de l'espace actif : l'utilisateur, jamais un jeton. */
function activeKey(userId: string): string {
  return `ws-ctx:active:${userId}`
}

/**
 * #2081.14 — LE refus d'une règle d'espace, écrit une fois pour chaque
 * chemin qui la lit (le guard d'une route `@DataExit()`). La phrase NOMME
 * la règle (« Réservé par la règle d'espace : … ») ; le `code` et la `rule`
 * laissent l'écran la traduire sans relire la phrase.
 */
export function workspaceRuleRefusal(rule: WorkspaceRuleKey): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    error: 'Forbidden',
    code: 'workspace_rule_refused',
    rule,
    message: workspaceRuleRefusalMessage(rule),
  })
}

/**
 * A workspace member as shown in the copilot's "Membres" panel: identity joined
 * from the user's profile, their role, and whether it is the requesting user.
 * `email`/`fullName` are nullable because a profile row may not be backfilled.
 */
export interface WorkspaceMemberView {
  userId: string
  email: string | null
  fullName: string | null
  role: WorkspaceRole
  isSelf: boolean
  /** « Renfort transversal » (#3387.10) — oriente le choix d'un coéquipier, ne donne aucun droit. */
  crossTeamSupport?: boolean
}

/** `first last`, trimmed, or `null` when neither part is set. Reused by the
 *  workspace-rules trace (#2081.14) rather than copied a fifth time. */
export function buildFullName(first: string | null | undefined, last: string | null | undefined): string | null {
  const full = [first, last]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ')
    .trim()
  return full.length > 0 ? full : null
}

/**
 * Resolves the *active workspace* for an authenticated user and answers
 * membership/role questions. This is the backbone of multi-user Phase 2: every
 * team-scoped read switches from `where user_id = :uid` to
 * `where workspace_id = :wsId`, and this service is where `:wsId` comes from.
 * See `agent_docs/multi-user-workspaces.md`.
 *
 * **A user may belong to several workspaces.** `workspace_members` has always
 * been many-to-many (`UNIQUE(workspace_id, user_id)`), so accepting an ESN's
 * invitation with an existing account wrote a perfectly correct membership row —
 * but this resolver returned the OWNED workspace unconditionally, and signup
 * provisions one for everybody (`handle_new_user_workspace`). The joiner
 * therefore accepted successfully and kept landing in their own empty space,
 * with no way to reach the team. What was missing was never the membership: it
 * was the persisted *choice* of which membership is active
 * ({@link WorkspaceActiveSelectionEntity}) and the endpoints to change it.
 */
@Injectable()
export class WorkspaceContextService {
  private readonly logger = new Logger(WorkspaceContextService.name)

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly members: Repository<WorkspaceMemberEntity>,
    @InjectRepository(WorkspaceActiveSelectionEntity)
    private readonly selections: Repository<WorkspaceActiveSelectionEntity>,
    // Permissions accordées EN PROPRE. `@Optional()` : sans le dépôt, la
    // vérification retombe exactement sur le rôle — le comportement d'avant.
    @Optional()
    @InjectRepository(WorkspaceMemberPermissionEntity)
    private readonly memberPermissions?: Repository<WorkspaceMemberPermissionEntity>,
    // #2081.14 — les règles d'espace. `@Optional()` pour les specs qui
    // construisent ce service positionnellement ; en production le dépôt est
    // déclaré par `WorkspaceModule` (`workspace.module.spec.ts` le vérifie).
    // Sans lui, les règles valent leurs défauts — le comportement d'avant.
    @Optional()
    @InjectRepository(WorkspaceRulesEntity)
    private readonly workspaceRules?: Repository<WorkspaceRulesEntity>,
  ) {}

  /**
   * #2081.14 — LES RÈGLES D'ESPACE en vigueur, lues à chaque décision.
   *
   * Aucune ligne = les défauts. ⚠️ AUCUN repli sur erreur, à la différence de
   * `portfolioVisibilityOf` : une règle qui RETIRE un droit et qu'on
   * remplacerait par son défaut sur une panne de base ROUVRIRAIT ce que
   * l'administrateur a fermé. L'erreur remonte ; la requête échoue fermée.
   */
  async workspaceRulesOf(workspaceId: string): Promise<WorkspaceRuleValues> {
    const workspaceRules = this.workspaceRules
    if (!workspaceRules) return resolveWorkspaceRuleValues(null)
    // Perf P2 — une lecture par requête GET ; une erreur n'est PAS mémorisée et
    // remonte toujours (échec fermé inchangé).
    const row = await memoizeForRequest(`ws-ctx:rules:${workspaceId}`, () =>
      workspaceRules.findOne({ where: { workspace_id: workspaceId } }),
    )
    return resolveWorkspaceRuleValues(row)
  }

  /**
   * #2879 (#2442.14, lot X17) — le COMPTEUR d'export massif : une ligne
   * `security_events.kind = 'data_export'` par sortie de données AUTORISÉE.
   * L'espace et la ROUTE seule (le motif, jamais l'URL ni un paramètre), aucune
   * personne. Écrit par {@link WorkspacePermissionGuard} — le chokepoint de TOUTE
   * route `@DataExit()` (garde `data-exit-routes.spec.ts`), y compris les routes
   * `@Res()` sans `passthrough` qu'un intercepteur manquerait en silence : le
   * guard tourne AVANT le handler, il n'a pas besoin de lire la réponse.
   * Fire-and-forget : un compteur qui ne s'écrit pas ne bloque jamais un export.
   */
  recordDataExit(workspaceId: string, routePath: string): void {
    Promise.resolve(
      this.workspaces.query(
        `INSERT INTO security_events (kind, status_code, workspace_id, path) VALUES ($1, $2, $3, $4)`,
        ['data_export', 200, workspaceId, routePath.slice(0, 200)],
      ),
    ).catch((error: unknown) => {
      this.logger.warn('Compteur de sécurité : sortie de données non enregistrée (l’export part quand même)', {
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }

  /**
   * #2081.14 — la règle d'espace qui RETIRE ce geste à ce rôle, ou `null`.
   *
   * Un GESTE, pas une permission (décision Louis 19/09/2026) : la règle « qui
   * peut exporter » ne vise que la SORTIE de données, que chaque chemin
   * déclare (`@DataExit()` au guard, le routeur d'actions pour une carte de
   * Laura, `dataExitAllowed` pour un CSV construit dans le navigateur). Une
   * seule dérivation, `workspaceRuleForbids` — lue ici, pour tous (GA-26).
   */
  async workspaceRuleRefusing(
    workspaceId: string,
    role: WorkspaceRole | null,
    gesture: WorkspaceRuleGesture,
  ): Promise<WorkspaceRuleKey | null> {
    return workspaceRuleForbids(await this.workspaceRulesOf(workspaceId), role, gesture)
  }

  /**
   * Le réglage de cloisonnement de l'espace (décision D5).
   *
   * Repli sur `open` — le comportement historique — quand l'espace est
   * introuvable ou la lecture en échec. Le repli inverse (cloisonner) ferait
   * disparaître le portefeuille d'une équipe entière sur une panne de base :
   * un écran vide se lit comme « on a tout perdu », pas comme « réessayez ».
   */
  async portfolioVisibilityOf(workspaceId: string): Promise<PortfolioVisibility> {
    // Perf P2 — une lecture par requête GET (lue par chaque liste cloisonnée).
    return memoizeForRequest(`ws-ctx:visibility:${workspaceId}`, async (): Promise<PortfolioVisibility> => {
      try {
        const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
        return workspace?.portfolio_visibility === 'restricted' ? 'restricted' : 'open'
      } catch {
        return 'open'
      }
    })
  }

  /**
   * Les permissions accordées à cette personne en plus de son rôle.
   *
   * Rendues en cas d'échec de lecture : `[]`. C'est le repli fermé — une base
   * indisponible ne doit pas ACCORDER un droit. L'inverse (accorder par
   * défaut) transformerait une panne en élévation de privilège.
   */
  async extraPermissionsOf(workspaceId: string, userId: string): Promise<WorkspacePermission[]> {
    const memberPermissions = this.memberPermissions
    if (!memberPermissions) return []
    // Perf P2 — une lecture par requête GET (le guard ET `assertPermission`).
    const granted = await memoizeForRequest(`ws-ctx:perm:${workspaceId}:${userId}`, async () => {
      try {
        const rows = await memberPermissions.find({ where: { workspace_id: workspaceId, user_id: userId } })
        return rows.map(row => row.permission as WorkspacePermission)
      } catch {
        return []
      }
    })
    return [...granted]
  }

  /**
   * The workspace whose data the user should see right now, plus their role in
   * it. This is THE chokepoint: every team-scoped read and the billing resolver
   * (`CreditsService.resolveBillingWorkspace`) both come through here, so the
   * active workspace decides what you see *and* whose quota you spend — they can
   * never disagree.
   *
   * Order:
   *  1. an explicit selection the user made — **only if a `workspace_members`
   *     row still backs it**. Membership is re-proven on every resolution, so a
   *     revoked seat takes effect on the member's next request and a stale
   *     preference row is inert. The selection records a choice; it authorises
   *     nothing.
   *  2. otherwise the historical default: the workspace they own, else their
   *     oldest membership. Unchanged, so every user who never switches behaves
   *     exactly as before.
   *
   * @throws ForbiddenException when the user belongs to no workspace at all
   *   (should not happen post-backfill, but fail closed rather than leak).
   */
  async resolveActiveWorkspace(userId: string): Promise<{ workspaceId: string; role: WorkspaceRole }> {
    // Perf P2 (29/09/2026) — UNE résolution par requête HTTP GET, quel que soit
    // le nombre d'appelants (guard + service + helpers). Le mémo meurt avec la
    // requête : une révocation reste effective dès la suivante. Voir
    // `common/request-memo.ts`. Copie rendue : aucun appelant ne mute celle d'un autre.
    const resolved = await memoizeForRequest(activeKey(userId), () => this.loadActiveWorkspace(userId))
    return { ...resolved }
  }

  /**
   * La résolution elle-même, séquentielle À DESSEIN : la sélection d'abord, sa
   * ligne de membre ensuite (dépendante), l'espace possédé seulement sans
   * sélection adossée. Lancer « possédé » en parallèle ajouterait une requête
   * sur le chemin le plus courant des équipes (commercial invité = sélection),
   * or c'est le POOL qui sature, pas la latence d'un aller-retour.
   */
  private async loadActiveWorkspace(userId: string): Promise<{ workspaceId: string; role: WorkspaceRole }> {
    const selection = await this.selections.findOne({ where: { user_id: userId } })
    if (selection) {
      const chosen = await this.members.findOne({
        where: { user_id: userId, workspace_id: selection.workspace_id },
      })
      if (chosen) return { workspaceId: chosen.workspace_id, role: chosen.role }
      // The membership went away (seat revoked, workspace deleted). Drop the
      // dangling preference and fall back — best-effort: failing to clean up a
      // preference must never fail the user's request.
      try {
        await this.selections.delete({ user_id: userId })
      } catch (error) {
        this.logger.warn(`Stale workspace selection for ${userId} not cleared (${(error as Error).message})`)
      }
    }

    const owned = await this.workspaces.findOne({
      where: { owner_user_id: userId },
      order: { created_at: 'ASC' },
    })
    if (owned) return { workspaceId: owned.id, role: 'owner' }

    const membership = await this.members.findOne({
      where: { user_id: userId },
      order: { created_at: 'ASC' },
    })
    if (membership) return { workspaceId: membership.workspace_id, role: membership.role }

    throw new ForbiddenException('Aucun espace de travail associé à cet utilisateur')
  }

  /**
   * Make `workspaceId` the caller's active workspace.
   *
   * The privacy gate of the whole feature: membership is proven via
   * {@link assertMember} **before** anything is written, so a forged id is a 403
   * that leaves no trace. A switcher must never become a way to read a team you
   * were not invited to.
   *
   * Nothing is moved, merged or deleted — switching only changes which of the
   * user's existing memberships is in effect. Their other workspaces, and every
   * dossier in them, stay exactly where they are.
   */
  async switchWorkspace(userId: string, workspaceId: string): Promise<ActiveWorkspace> {
    const membership = await this.assertMember(userId, workspaceId)
    const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
    if (!workspace) throw new NotFoundException('Espace de travail introuvable')

    await this.selections.upsert({ user_id: userId, workspace_id: workspaceId }, ['user_id'])
    // Perf P2 — l'espace actif vient de changer : la requête courante ne doit
    // plus servir l'ancien (défense : un changement passe d'ordinaire par un POST,
    // qui n'ouvre aucun mémo).
    forgetForRequest(activeKey(userId))
    forgetForRequest(`ws-ctx:demo:${userId}`)

    return { workspaceId, workspaceName: workspace.name, role: membership.role }
  }

  /**
   * Every workspace the caller belongs to — what the switcher renders. Ordered
   * oldest membership first, so a user's own space (seeded at signup) leads and
   * the teams they joined follow in the order they joined them.
   *
   * Owned workspaces are unioned in even if their `workspace_members` row is
   * somehow missing, so the list can never omit the workspace
   * {@link resolveActiveWorkspace} would hand back. Returns `[]` rather than
   * throwing for a user with no workspace at all: an empty switcher is a
   * survivable UI state, a 403 on a list is not.
   */
  async listWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
    const memberships = await this.members.find({ where: { user_id: userId }, order: { created_at: 'ASC' } })
    const owned = await this.workspaces.find({ where: { owner_user_id: userId } })

    const roleByWorkspace = new Map<string, WorkspaceRole>(memberships.map(m => [m.workspace_id, m.role]))
    for (const workspace of owned) {
      if (!roleByWorkspace.has(workspace.id)) roleByWorkspace.set(workspace.id, 'owner')
    }
    const ids = [...roleByWorkspace.keys()]
    if (ids.length === 0) return []

    const [rows, counts, active] = await Promise.all([
      this.workspaces.find({ where: { id: In(ids) } }),
      this.countMembers(ids),
      this.resolveActiveWorkspace(userId),
    ])
    const byId = new Map(rows.map(row => [row.id, row]))

    return ids.flatMap(id => {
      const workspace = byId.get(id)
      if (!workspace) return [] // deleted between the two reads — skip, never render a ghost
      return [
        {
          id,
          name: workspace.name,
          role: roleByWorkspace.get(id)!,
          isActive: id === active.workspaceId,
          isPersonal: workspace.owner_user_id === userId,
          memberCount: counts.get(id) ?? 0,
        },
      ]
    })
  }

  /** Member headcount per workspace, in one grouped read. */
  private async countMembers(workspaceIds: string[]): Promise<Map<string, number>> {
    const rows = await this.members
      .createQueryBuilder('m')
      .select('m.workspace_id', 'workspaceId')
      .addSelect('COUNT(*)', 'count')
      .where('m.workspace_id IN (:...workspaceIds)', { workspaceIds })
      .groupBy('m.workspace_id')
      .getRawMany<{ workspaceId: string; count: string }>()
    return new Map(rows.map(row => [row.workspaceId, Number(row.count) || 0]))
  }

  /** The user's membership row in a specific workspace, or null if none. */
  async getMembership(userId: string, workspaceId: string): Promise<WorkspaceMemberEntity | null> {
    return this.members.findOne({ where: { user_id: userId, workspace_id: workspaceId } })
  }

  /**
   * True when the user's ACTIVE workspace is a demo space (`is_demo` — demo mode
   * C1). Drives the "no real analysis" guards: a demo workspace's analysis
   * button replays the seeded golden dossiers instead of launching the paid
   * pipeline. Fails CLOSED to `false` (= real-billing path) on any resolution
   * error so a hiccup can never accidentally free-ride a real workspace.
   */
  async isDemoWorkspace(userId: string): Promise<boolean> {
    // #4450 (BELLUM-API-14/-B/-11) — une lecture par requête GET : /crm/write-requests l'appelait depuis le
    // contrôleur ET depuis le statut HubSpot (`workspaces WHERE id` rejoué = « N+1 Query » de Sentry). Un échec
    // reste fermé sur `false` et n'est pas mémorisé (`memoizeForRequest`).
    try {
      return await memoizeForRequest(`ws-ctx:demo:${userId}`, async () => {
        const { workspaceId } = await this.resolveActiveWorkspace(userId)
        const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
        return workspace?.is_demo === true
      })
    } catch {
      return false
    }
  }

  /**
   * Everyone in the caller's active workspace, ordered owner → admin → member
   * then by join date, with identity joined from `profiles`. Powers the copilot
   * "Membres" panel. `isSelf` flags the requesting user's own row.
   */
  async listMembers(userId: string): Promise<WorkspaceMemberView[]> {
    const { workspaceId } = await this.resolveActiveWorkspace(userId)
    const rows = await this.members
      .createQueryBuilder('m')
      .leftJoin(ProfileEntity, 'p', 'p.user_id = m.user_id')
      .select('m.user_id', 'userId')
      .addSelect('m.role', 'role')
      .addSelect('m.cross_team_support', 'crossTeamSupport')
      .addSelect('p.email', 'email')
      .addSelect('p.first_name', 'firstName')
      .addSelect('p.last_name', 'lastName')
      .where('m.workspace_id = :workspaceId', { workspaceId })
      .orderBy(`CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`, 'ASC')
      .addOrderBy('m.created_at', 'ASC')
      .getRawMany<{
        userId: string
        role: WorkspaceRole
        crossTeamSupport: boolean | null
        email: string | null
        firstName: string | null
        lastName: string | null
      }>()

    return rows.map(row => ({
      userId: row.userId,
      email: row.email ?? null,
      fullName: buildFullName(row.firstName, row.lastName),
      role: row.role,
      isSelf: row.userId === userId,
      crossTeamSupport: row.crossTeamSupport === true,
    }))
  }

  /**
   * Assert the user belongs to the workspace, returning the membership.
   * Building block for the resource guards that arrive with invitations.
   * @throws ForbiddenException when the user is not a member.
   */
  async assertMember(userId: string, workspaceId: string): Promise<WorkspaceMemberEntity> {
    const membership = await this.getMembership(userId, workspaceId)
    if (!membership) {
      throw new ForbiddenException("Vous n'êtes pas membre de cet espace de travail")
    }
    return membership
  }

  /**
   * Assert the user belongs to the workspace *and* holds one of `allowed`
   * roles, returning the membership. Feeds the owner/admin guards for billing
   * and member management in Phase 4.
   * @throws ForbiddenException when the user is not a member or lacks the role.
   */
  async assertRole(
    userId: string,
    workspaceId: string,
    allowed: readonly WorkspaceRole[],
  ): Promise<WorkspaceMemberEntity> {
    const membership = await this.assertMember(userId, workspaceId)
    if (!allowed.includes(membership.role)) {
      throw new ForbiddenException('Rôle insuffisant pour cette action')
    }
    return membership
  }

  /**
   * Assert the user belongs to the workspace *and* their role grants
   * `permission` per the RBAC matrix ({@link can} in `@bellum/contracts`) —
   * son rôle, plus ce qui lui a été accordé en propre.
   * The permission-based sibling of {@link assertRole}: instead of an ad-hoc role
   * list at each call site, every mutation names the capability it needs and the
   * matrix decides. `viewer` holds no permission, so it is refused on every
   * mutation; the legacy roles keep their pre-RBAC reach.
   *
   * @throws ForbiddenException when the user is not a member or lacks the permission.
   */
  async assertPermission(
    userId: string,
    workspaceId: string,
    permission: WorkspacePermission,
  ): Promise<WorkspaceMemberEntity> {
    const membership = await this.assertMember(userId, workspaceId)
    // `can()` et non `hasPermission()` : le rôle d'abord, puis les accords
    // nominatifs. Additif — une exception ne retire jamais un droit du rôle.
    const extra = await this.extraPermissionsOf(workspaceId, userId)
    if (!can(membership.role, extra, permission)) {
      throw new ForbiddenException('Rôle insuffisant pour cette action')
    }
    // #2081.14 — la règle d'espace ne se lit PAS ici : elle vise la SORTIE de
    // données, pas la permission (décision Louis 19/09/2026). `data:export`
    // garde aussi l'import et le partage, qui restent ouverts aux membres.
    return membership
  }
}
