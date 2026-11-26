import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import {
  type MarketVerificationPlan,
  type MarketVerificationStateRow,
  marketVerificationPlanRequestSchema,
  marketVerificationRecordRequestSchema,
  marketVerificationStatesQuerySchema,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../../auth/jwt.guard'
import { PlanFeatureGuard } from '../../plan-features/plan-feature.guard'
import { RequireFeature } from '../../plan-features/require-feature.decorator'
import { RequirePermission } from '../../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../../workspace/workspace-permission.guard'
import { MarketVerificationService } from './market-verification.service'

export class MarketVerificationPlanDto extends createZodDto(marketVerificationPlanRequestSchema) {}
export class MarketVerificationRecordDto extends createZodDto(marketVerificationRecordRequestSchema) {}
export class MarketVerificationStatesQueryDto extends createZodDto(marketVerificationStatesQuerySchema) {}

/**
 * #2288.2 / #2288.4 — LA VÉRIFICATION À LA DEMANDE, DEPUIS UN CONSULTANT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES ROUTES GARDENT, ET POURQUOI (GA-05)
 * ─────────────────────────────────────────────────────────────────────────────
 * La lecture des ÉTATS (`GET …/states`) est une lecture d'espace : sans montant,
 * elle est ouverte à tout membre (décision Louis, 18/09/2026) — le `viewer` voit
 * la colonne. Le devis et le reçu portent `@RequirePermission('analysis:run')`. Ce n'est pas un `@Get`
 * anodin qu'on marquerait du simple marqueur de lecture d'espace : la première
 * annonce le prix d'un geste payant, la seconde inscrit qu'il a été fait. La
 * permission est celle
 * du geste annoncé — lancer une analyse — plutôt qu'une permission neuve :
 * quiconque ne peut pas lancer d'analyse n'a rien à faire devant son devis.
 *
 * ⚠️ Ce n'est PAS une lecture financière : rien ici ne parle d'euros, de marge
 * ni de facture. Ce sont des crédits, la monnaie du produit — `finance:read`
 * garde les chiffres d'argent, et le cliquet du gel ne bouge pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AUCUN DÉBIT ICI, ET C'EST LE POINT
 * ─────────────────────────────────────────────────────────────────────────────
 * Vérifier aujourd'hui, c'est relancer une analyse — un geste qui EXISTE, avec
 * son écran de confirmation, son débit et son remboursement en cas d'échec.
 * Ajouter un second débit ferait payer deux fois, et ferait vivre le prix à
 * deux endroits (GA-26). Ces routes tiennent ce qui manquait autour : le plan
 * annoncé AVANT, le reçu gardé APRÈS.
 */
@Controller()
@RequireFeature('talent_pool')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class MarketVerificationController {
  constructor(
    private readonly verification: MarketVerificationService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /**
   * #2288.2 (décision Louis, 18/09/2026) — LES ÉTATS DE VÉRIFICATION, LUS PAR
   * TOUT MEMBRE DE L'ESPACE.
   *
   * Lecture d'espace pure : aucun crédit, aucun appel sortant, aucune écriture,
   * et AUCUN montant dans la réponse (`MarketVerificationStateRow` n'en porte
   * pas) — ce n'est donc pas une lecture financière, et `finance:*` n'a rien à
   * y faire. Le `viewer` voit la colonne « Vérification » ; le devis et le reçu
   * restent derrière `analysis:run`.
   */
  @Get('consultants/:id/market-verification/states')
  @WorkspaceRead()
  async states(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MarketVerificationStatesQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ states: MarketVerificationStateRow[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { states: await this.verification.states({ workspaceId, companies: query.companies }) }
  }

  /**
   * #2288.4 — LE COÛT ANNONCÉ AVANT : candidats, sources, coût, durée, apport.
   *
   * `@Post` bien qu'elle n'écrive rien — même forme que le plan
   * d'enrichissement d'organigramme, parce que le périmètre est une LISTE de
   * libellés qui ne tient pas dans une URL. Zéro crédit, zéro appel réseau.
   */
  @Post('consultants/:id/market-verification/plan')
  @RequirePermission('analysis:run')
  async plan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarketVerificationPlanDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<MarketVerificationPlan> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.verification.plan({ workspaceId, companies: dto.companies })
  }

  /**
   * #2288.2 — LA CONSERVATION : garder ce qui a été vérifié pour ne pas le
   * repayer. Le coût inscrit vient de la grille, jamais du corps de la requête.
   */
  @Post('consultants/:id/market-verification/receipts')
  @RequirePermission('analysis:run')
  async record(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarketVerificationRecordDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ keptHumanCorrection: boolean }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.verification.record({
      workspaceId,
      userId: user.userId,
      consultantId: id,
      companyName: dto.companyName,
      outcome: dto.outcome,
    })
  }
}
