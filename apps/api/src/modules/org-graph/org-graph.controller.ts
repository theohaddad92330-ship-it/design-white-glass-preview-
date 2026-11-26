import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import type { OrgCorrectionResponse, OrgGraphCorrection } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { parseOrgCorrectionRequest, parseOrgCorrectionRevertRequest } from './dto/org-correction.dto'
import { OrgGraphCorrectionService } from './org-graph-correction.service'

/**
 * Le tiroir de correction de l'organigramme (OrgGraph FINAL §7 ; v3 §8.3).
 *
 * ⚠️ PAS de drag & drop, et ce n'est pas un manque : c'est la décision 7 du
 * paquet. « Le drag & drop est séduisant visuellement mais trop destructeur
 * pour une donnée sourcée. » Un déplacement à la souris ne porte NI raison NI
 * preuve, et il n'existe donc aucune route ici qui accepte un changement de N+1
 * sans les deux. Ce n'est pas une convention d'écran : c'est l'absence de
 * chemin d'écriture.
 *
 * Trois routes, une par geste réel :
 *  · PATCH  — corriger un objet du graphe (personne, entité, lien) ;
 *  · POST … /revert — annuler une correction ;
 *  · GET    — l'historique, annulations comprises.
 *
 * L'AJOUT et le RETRAIT d'un lien passent par le même PATCH, champ `presence` :
 * ce sont deux corrections symétriques du même champ, ce qui les rend
 * annulables par le même chemin plutôt que par un troisième cas particulier.
 *
 * ⚠️ Le décorateur de permission est posé APRÈS le verbe HTTP, jamais avant :
 * la garde GA-05 segmente les routes À PARTIR du verbe, et un décorateur écrit
 * au-dessus tomberait dans le segment de la route précédente — la route
 * passerait pour NUE alors qu'elle est gardée.
 */
@Controller('accounts/:accountId/org-graph')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class OrgGraphController {
  constructor(
    private readonly corrections: OrgGraphCorrectionService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /**
   * Corriger un objet de l'organigramme.
   *
   * Le corps porte `expectedGraphVersion` : sans lui, le contrat refuse la
   * requête. Deux personnes qui corrigent la même personne sur la même version
   * ne s'écrasent pas — la seconde reçoit un 409 avec le diff.
   */
  @Patch('corrections')
  @RequirePermission('records:write')
  async correct(
    @Param('accountId') accountId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ): Promise<OrgCorrectionResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.corrections.applyCorrection({
      workspaceId,
      accountId,
      userId: user.userId,
      request: parseOrgCorrectionRequest(body),
    })
  }

  /** Annuler une correction — sous le même verrou : annuler est une écriture. */
  @Post('corrections/:correctionId/revert')
  @RequirePermission('records:write')
  async revert(
    @Param('accountId') accountId: string,
    @Param('correctionId') correctionId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ): Promise<OrgCorrectionResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const { expectedGraphVersion } = parseOrgCorrectionRevertRequest(body)
    return this.corrections.revertCorrection({
      workspaceId,
      accountId,
      userId: user.userId,
      correctionId,
      expectedGraphVersion,
    })
  }

  /**
   * L'historique des corrections du dossier, les annulées comprises.
   *
   * AUCUNE permission déclarée, et c'est délibéré : lire ce que l'équipe a
   * corrigé n'est pas corriger, et un `viewer` doit pouvoir comprendre pourquoi
   * l'organigramme dit ce qu'il dit. Il n'existe pas de permission de LECTURE
   * dans la matrice (elle n'en porte que des gestes mutants) ; la protection est
   * donc celle de tous les autres écrans : `JwtGuard` pour l'identité, et le
   * `workspace_id` de l'espace ACTIF de l'appelant dans la requête — jamais un
   * identifiant venu du corps. Même forme que `GET /accounts/:id/feedback`.
   */
  @Get('corrections')
  async history(
    @Param('accountId') accountId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ items: OrgGraphCorrection[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { items: await this.corrections.listCorrections({ workspaceId, accountId, userId: user.userId }) }
  }
}
