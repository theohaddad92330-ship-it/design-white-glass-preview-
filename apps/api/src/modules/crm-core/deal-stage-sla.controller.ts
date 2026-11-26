import { Body, Controller, ForbiddenException, Get, Param, Put, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { DEAL_STAGE_SLA_BOUNDS, hasPermission, type WorkspaceRole } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { DealStageSlaService, type StageSlaRow } from './deal-stage-sla.service'

/**
 * Qui règle les durées cibles : tout porteur de `team:manage` — propriétaire,
 * administrateur et `sales_ops` (arbitrage Louis 01/11/2026). Même règle que la
 * route et que l'écran `/settings/pipeline` de l'action-router (GA-26).
 */
function canEditStageSla(role: WorkspaceRole): boolean {
  return hasPermission(role, 'team:manage')
}

/**
 * `null` REMET le défaut du produit. C'est le même geste qu'un libellé d'étape
 * vidé : revenir en arrière ne doit pas demander d'ouvrir la base.
 */
const setStageSlaSchema = z
  .object({
    slaDays: z.number().int().min(DEAL_STAGE_SLA_BOUNDS.min).max(DEAL_STAGE_SLA_BOUNDS.max).nullable(),
  })
  .strict()
class SetStageSlaDto extends createZodDto(setStageSlaSchema) {}

/**
 * LE SLA D'ÉTAPE DU PIPE — PDF 3 §3.5, ticket `BEL-CRM-203` PR5.
 *
 * Deux routes, et c'est tout ce que « réglable par espace » demande : lire les
 * durées cibles en vigueur, en régler une.
 *
 * ⚠️ Un contrôleur À PART plutôt qu'une paire de routes dans
 * `GovernanceController` : celui-ci construit son service positionnellement
 * dans plusieurs specs, et le dépôt a déjà payé deux fois l'insertion d'un
 * paramètre au milieu d'un constructeur. Le module reste autonome (règle #7) —
 * retirer ce fichier retire le réglage, et rien d'autre : les défauts du
 * produit continuent de s'appliquer.
 */
@Controller('pipeline/stage-sla')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class DealStageSlaController {
  constructor(
    private readonly slas: DealStageSlaService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /**
   * Les cinq étapes et leur durée cible en vigueur.
   *
   * `@WorkspaceRead()` : c'est une lecture d'un réglage d'ESPACE, que tout
   * membre a besoin de connaître pour lire le board — la matrice n'a aucune
   * permission de lecture à lui donner, et en inventer une l'accorderait à
   * tous les rôles, `viewer` compris.
   */
  @Get()
  @WorkspaceRead()
  async list(@CurrentUser() user: CurrentUserPayload): Promise<{ items: StageSlaRow[]; canEdit: boolean }> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #2170.43 — l'écran désactive la saisie sur CETTE réponse, il ne recalcule rien (GA-26).
    return { items: await this.slas.effectiveFor(workspaceId), canEdit: canEditStageSla(role) }
  }

  /**
   * Régler la durée cible d'une étape.
   *
   * `team:manage` : changer un seuil change ce que TOUT LE MONDE voit dans la
   * file d'interventions — même nature de réglage qu'un champ personnalisé ou
   * qu'un motif de perte.
   *
   * #2170.43 — ces durées sont AUSSI les seuils de stagnation de la carte du
   * pipe. Arbitrage Louis 01/11/2026 : `sales_ops` GARDE ce réglage (il l'avait
   * par `team:manage`). `team:manage` au guard, PUIS le rôle ici : propriétaire,
   * administrateur et `sales_ops` règlent ; `member`, `sales`, `viewer` non.
   */
  @Put(':stage')
  @RequirePermission('team:manage')
  async set(
    @CurrentUser() user: CurrentUserPayload,
    @Param('stage') stage: string,
    @Body() body: SetStageSlaDto,
  ): Promise<{ items: StageSlaRow[] }> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    if (!canEditStageSla(role)) {
      throw new ForbiddenException(
        'Les seuils d’étape se règlent par le propriétaire, un administrateur ou le responsable d’agence (droit team:manage).',
      )
    }
    return { items: await this.slas.setStageSla(workspaceId, stage, body.slaDays) }
  }
}
