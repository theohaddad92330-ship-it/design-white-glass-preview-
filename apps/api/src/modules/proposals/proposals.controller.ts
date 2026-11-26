import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { type ProposalCandidate, ProposalsService, type ProposalStudioView } from './proposals.service'

/**
 * Le studio de proposition (addendum final p69).
 *
 * DEUX routes, toutes deux en LECTURE. Ce n'est pas un oubli : le studio
 * prépare, le commercial envoie. Il n'a aucun chemin d'écriture — ni e-mail, ni
 * écriture CRM, ni enregistrement d'une copie du plan — et cette absence est le
 * mécanisme, pas la convention. Corriger un manque se fait sur l'objet qui porte
 * le champ (le besoin, sa qualification BTMMP, le vivier, les preuves), là où la
 * correction est déjà tracée et gardée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI GARDE CES DEUX ROUTES — ET CE QUI LES GARDAIT MAL (D39 · 28/08/2026)
 * ─────────────────────────────────────────────────────────────────────────
 * Elles portaient `@RequirePermission('data:export')`. Ce n'était pas un choix :
 * la matrice ne porte AUCUNE permission de lecture — « une entrée par famille
 * d'actions MUTANTES », `viewer` n'en détient aucune et lit tout
 * (`packages/contracts/src/schemas/workspace.ts`) — et GA-05 exige pourtant
 * qu'une route neuve déclare ce qu'elle garde. `data:export` était la moins
 * fausse des dix valeurs disponibles.
 *
 * Son effet réel, lui, était bien décidé par quelqu'un — sauf que personne ne
 * l'avait décidé : elle FERMAIT le studio à `viewer` (aucune permission) et à
 * `tech_admin` (`integrations:manage` seule), sur deux routes qui ne font que
 * lire. Louis a tranché le 28/08 : un troisième marqueur, `@WorkspaceRead`, dit
 * « lecture d'espace, rien à autoriser de plus ».
 *
 * ⚠️ Le marqueur n'OUVRE rien : aucun guard ne lit sa métadonnée. Ce qui garde
 * ces deux routes est ce qui les gardait déjà — `JwtGuard` pour l'identité, et
 * `resolveActiveWorkspace(user.userId)` qui déduit le `workspaceId` de
 * l'appartenance de l'appelant. Aucune des deux routes ne prend d'espace en
 * paramètre : un membre d'un autre espace interroge le sien et reçoit 404 ; un
 * utilisateur sans espace reçoit 403 de la résolution elle-même.
 */
@Controller('proposals')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
@WorkspaceRead()
export class ProposalsController {
  constructor(
    private readonly proposals: ProposalsService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** Les besoins de l'espace, pour choisir celui qu'on prépare. */
  @Get()
  async list(@CurrentUser() user: CurrentUserPayload): Promise<{ projects: ProposalCandidate[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { projects: await this.proposals.listCandidates(workspaceId) }
  }

  /** Le plan des neuf sections, recalculé à chaque lecture. */
  @Get(':projectId')
  async get(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ProposalStudioView> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const view = await this.proposals.buildForProject(projectId, workspaceId)
    // Hors espace = introuvable, la même sémantique que le reste de l'API : un
    // 403 confirmerait au passage que le besoin existe.
    if (!view) throw new NotFoundException(`Project ${projectId} not found`)
    return view
  }
}
