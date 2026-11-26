import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { PARTNER_ROLES, PARTNER_STAGES, updatePartnerGovernanceSchema } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { PartnerPipelineService, type PartnerRelationView, type ProfileMatchResult } from './partner-pipeline.service'
import type { EsnOnAccountsRow } from './esn-on-accounts-merge'

const createSchema = z.object({
  name: z.string().min(1),
  siren: z.string().nullable().optional(),
  stage: z.enum(PARTNER_STAGES).optional(),
  roles: z.array(z.enum(PARTNER_ROLES)).optional(),
  contactName: z.string().nullable().optional(),
})
const stageSchema = z.object({ stage: z.enum(PARTNER_STAGES) })
/** Trois états, et le troisième est le plus important : `null` = « personne ne
 *  l'a déclarée ». `nullable()` et non `optional()`, pour qu'effacer une
 *  déclaration soit un geste possible et non un champ omis. */
const nonSolicitationSchema = z.object({ nonSolicitation: z.boolean().nullable() })

class CreatePartnerRelationDto extends createZodDto(createSchema) {}
class SetPartnerStageDto extends createZodDto(stageSchema) {}
class SetNonSolicitationDto extends createZodDto(nonSolicitationSchema) {}
class UpdatePartnerGovernanceDto extends createZodDto(updatePartnerGovernanceSchema) {}

/**
 * Le pipeline PARTENAIRE (tome 4, D61) — mes relations avec des ESN.
 *
 * Distinct de `/accounts/:id/partners`, qui répond à « qui est en place chez ce
 * client ». Ici, la question est « avec qui je travaille, ou pourrais
 * travailler ». Un même SIREN peut apparaître des deux côtés — c'est le cas
 * normal, pas une anomalie.
 */
@Controller('partners')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class PartnerPipelineController {
  constructor(
    private readonly pipeline: PartnerPipelineService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  private async workspaceOf(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  @Get()
  async list(@CurrentUser() user: CurrentUserPayload): Promise<PartnerRelationView[]> {
    return this.pipeline.list(await this.workspaceOf(user.userId))
  }

  @Get('on-my-accounts')
  // #2298.8 — le type annonçait `{ name, accounts, rank1 }` alors que le
  // service rend `EsnOnAccountsRow` en entier (rank2, observedAtAccounts,
  // rank2Observations…) : la déclaration mentait sur ce que l'endpoint sert
  // vraiment.
  async onMyAccounts(@CurrentUser() user: CurrentUserPayload): Promise<EsnOnAccountsRow[]> {
    return this.pipeline.onMyAccounts(await this.workspaceOf(user.userId))
  }

  /**
   * #1798 — les ESN qui collent au profil, sans passer par l'écran Territoire.
   *
   * Le profil se résout ICI, côté serveur (`userId`, pas `workspaceId` : c'est
   * la même clé que `EsnProfileReader` utilise partout ailleurs — Analyse,
   * Chat, Score) — jamais envoyé par le client, comme le reste du profil
   * vendeur (voir le docblock d'`EsnProfileReader`).
   */
  @Get('profile-matches')
  async profileMatches(@CurrentUser() user: CurrentUserPayload): Promise<ProfileMatchResult> {
    return this.pipeline.profileMatches(user.userId)
  }

  @RequirePermission('records:write')
  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreatePartnerRelationDto,
  ): Promise<PartnerRelationView> {
    return this.pipeline.create(await this.workspaceOf(user.userId), dto)
  }

  @RequirePermission('records:write')
  @Patch(':id/stage')
  async setStage(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPartnerStageDto,
  ): Promise<PartnerRelationView> {
    const updated = await this.pipeline.setStage(await this.workspaceOf(user.userId), id, dto.stage)
    if (!updated) throw new NotFoundException('Ce partenaire n’existe pas dans cet espace.')
    return updated
  }

  /**
   * Déclarer la clause de non-sollicitation du cadre signé avec ce partenaire.
   *
   * C'est le seul chemin d'écriture de la colonne, et c'est délibéré : la
   * clause ne se déduit d'aucune source publique ni d'aucun calcul. Sans ce
   * geste, la garde dure qu'elle arme resterait ce qu'elle était depuis le
   * premier jour — un refus écrit que rien ne déclenche.
   */
  @RequirePermission('records:write')
  @Patch(':id/non-solicitation')
  async setNonSolicitation(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetNonSolicitationDto,
  ): Promise<PartnerRelationView> {
    const updated = await this.pipeline.setNonSolicitation(await this.workspaceOf(user.userId), id, dto.nonSolicitation)
    if (!updated) throw new NotFoundException('Ce partenaire n’existe pas dans cet espace.')
    return updated
  }

  /**
   * #3270 (BEL-SC-241) — LE CADRE DE GOUVERNANCE RANG 2, UN FORMULAIRE
   * GÉNÉRIQUE (doctrine c75). Poser n'importe lequel des dix-sept champs, ou
   * poser/lever une pause/un blocage — jamais dix-sept routes dédiées.
   */
  @RequirePermission('records:write')
  @Patch(':id/governance')
  async updateGovernance(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePartnerGovernanceDto,
  ): Promise<PartnerRelationView> {
    const updated = await this.pipeline.updateGovernance(await this.workspaceOf(user.userId), id, dto)
    if (!updated) throw new NotFoundException('Ce partenaire n’existe pas dans cet espace.')
    return updated
  }
}
