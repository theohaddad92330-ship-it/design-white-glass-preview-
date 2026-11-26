import {
  Body,
  Controller,
  Delete,
  Get,
  Optional,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import {
  createLostDealRexSchema,
  createLostDealRuleProposalSchema,
  createProofSchema,
  createRexSchema,
  can,
  createTestimonialSchema,
  validateProofFieldsSchema,
  type LostDealRex,
  type LostDealRuleProposal,
  type Proof,
  type RexEntry,
  type Testimonial,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { MarketMemoryService } from '../market-memory/market-memory.service'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import {
  CapitalisationService,
  type AccountCapitalisation,
  type MissionProofProposal,
  type WorkspaceRex,
} from './capitalisation.service'

class CreateProofDto extends createZodDto(createProofSchema) {}
class CreateRexDto extends createZodDto(createRexSchema) {}
class CreateTestimonialDto extends createZodDto(createTestimonialSchema) {}
class ValidateProofFieldsDto extends createZodDto(validateProofFieldsSchema) {}
class CreateLostDealRexDto extends createZodDto(createLostDealRexSchema) {}
class CreateLostDealRuleProposalDto extends createZodDto(createLostDealRuleProposalSchema) {}

/**
 * La capitalisation (PDF 2 §12) : ce qu'on a livré, ce qu'on peut montrer.
 *
 * Lecture ouverte à l'espace — savoir ce que l'équipe a déjà livré est
 * exactement ce qui évite de le redécouvrir en réunion. Écriture gardée par
 * `records:write`.
 */
@Controller('capitalisation')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class CapitalisationController {
  constructor(
    private readonly capitalisation: CapitalisationService,
    private readonly workspaceContext: WorkspaceContextService,
    /**
     * #1638.2 — la mémoire marché, `@Optional()` et en DERNIÈRE position.
     *
     * DERNIÈRE, parce qu'un optionnel inséré au MILIEU d'un constructeur
     * décale silencieusement les specs qui le construisent positionnellement :
     * rien ne jette, et l'écran affiche simplement moins.
     *
     * `@Optional()`, parce que ce module reste AUTONOME (règle #7) : sans
     * mémoire marché montée, l'onglet Preuves rend exactement ce qu'il rendait
     * avant ce lot. Une capacité absente n'est pas une panne.
     */
    @Optional() private readonly marketMemory?: MarketMemoryService,
  ) {}

  /** #4158.49 — vrai pour owner/admin/sales_ops ou une permission nominative `team:manage`. */
  private async canManageTeam(userId: string): Promise<boolean> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return can(role, await this.workspaceContext.extraPermissionsOf(workspaceId, userId), 'team:manage')
  }

  private async workspaceOf(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  /**
   * #2045.8 (épopée #2859) — combien de missions cet espace a DÉJÀ tracées,
   * tous comptes confondus. Lecture agrégée, pour l'onboarding
   * (`reseau-comptage.ts`) — jamais une bande auto-déclarée là où le produit
   * compte exactement (voir `CapitalisationService.workspaceMissionCount`).
   */
  @Get('workspace-summary')
  async workspaceSummary(@CurrentUser() user: CurrentUserPayload): Promise<{ missionCount: number }> {
    const missionCount = await this.capitalisation.workspaceMissionCount(await this.workspaceOf(user.userId))
    return { missionCount }
  }

  @Get('accounts/:id')
  async forAccount(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) accountId: string,
  ): Promise<AccountCapitalisation> {
    const capitalisation = await this.capitalisation.forAccount(await this.workspaceOf(user.userId), accountId)
    return { ...capitalisation, ...(await this.technoPrevalenceOf(capitalisation.proofs)) }
  }

  /**
   * #1638.2 — le palier de prévalence des technologies des preuves, ou RIEN.
   *
   * Trois silences, et aucun n'est une panne pour l'appelant : pas de mémoire
   * marché montée, aucune technologie déclarée, lecture indisponible. Dans les
   * trois cas le champ est ABSENT — jamais un tableau vide, qui se lirait
   * « on a regardé et aucune technologie n'a de palier ».
   *
   * Un seul aller-retour pour tout l'onglet : les libellés sont dédoublonnés
   * ici, et la façade rend un palier par libellé DEMANDÉ.
   */
  private async technoPrevalenceOf(
    proofs: readonly Proof[],
  ): Promise<Pick<AccountCapitalisation, 'techno_prevalence'>> {
    if (!this.marketMemory) return {}
    const technos = [...new Set(proofs.flatMap(proof => proof.technologies ?? []))]
    if (technos.length === 0) return {}

    const read = await this.marketMemory.technoPrevalenceFor(technos)
    if (read.status !== 'ok') return {}

    // Une technologie sans palier ne descend PAS jusqu'à l'écran : `tiers` ne
    // porte que ce qui a pu être mesuré.
    const measured = technos
      .map(techno => ({ techno, tier: read.tiers.get(techno) }))
      .filter((entry): entry is { techno: string; tier: NonNullable<typeof entry.tier> } => entry.tier !== undefined)
    return measured.length > 0 ? { techno_prevalence: measured } : {}
  }

  /** Les preuves MOBILISABLES pour un contenu client. Le filtre vit côté
   *  serveur : c'est le seul endroit où « une preuve interne n'apparaît jamais
   *  dans un contenu destiné au client » peut être tenu.
   *
   *  #2424.12 — `sector`, `expertise`, `technologies` affinent la bibliothèque
   *  par facette, en listes séparées par des virgules. Absentes, rien n'est
   *  filtré : le comportement d'avant #2424.12 est inchangé. */
  @Get('proofs/usable')
  async usableProofs(
    @CurrentUser() user: CurrentUserPayload,
    @Query('target_account_id') targetAccountId?: string,
    @Query('sector') sector?: string,
    @Query('expertise') expertise?: string,
    @Query('technologies') technologies?: string,
  ): Promise<{ items: Proof[] }> {
    const items = await this.capitalisation.usableProofs(
      await this.workspaceOf(user.userId),
      targetAccountId?.trim() || null,
      {
        sector: sector?.trim() || undefined,
        expertise: splitFacetList(expertise),
        technologies: splitFacetList(technologies),
      },
    )
    return { items }
  }

  /**
   * #2124.49 à .55 — ce que Laura PROPOSE pour la preuve d'une mission.
   *
   * ⚠️ Une LECTURE, et rien d'autre. `GET` n'est pas un détail de style ici :
   * c'est la forme que prend « le copilote propose, il n'écrit pas ». Tant que
   * personne n'a cliqué « Valider », rien n'existe — pas même un brouillon.
   */
  @Get('missions/:id/proof-proposal')
  @WorkspaceRead()
  async proofProposal(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) missionId: string,
  ): Promise<MissionProofProposal> {
    return this.capitalisation.proofProposalForMission(await this.workspaceOf(user.userId), missionId)
  }

  /**
   * #2124.49 à .55 — la VALIDATION humaine. Le seul chemin d'écriture.
   *
   * Le clic EST la décision (geste d'utilisateur = auto-approuvé), donc pas de
   * demande différée ni d'expiration : celles-ci ne valent que pour un geste de
   * SYSTÈME. Gardé par `records:write`, comme toute écriture de ce contrôleur.
   */
  @Patch('proofs/:id')
  @RequirePermission('records:write')
  async validateProofFields(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ValidateProofFieldsDto,
  ): Promise<Proof> {
    const workspaceId = await this.workspaceOf(user.userId)
    // #4158.49 — auteur ou `team:manage` : lecture d'équipe, écriture d'auteur.
    await this.capitalisation.assertCanModifyProof(workspaceId, user.userId, id, await this.canManageTeam(user.userId))
    return this.capitalisation.validateProofFields(workspaceId, user.userId, id, dto)
  }

  @Post('proofs')
  @RequirePermission('records:write')
  async createProof(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateProofDto): Promise<Proof> {
    return this.capitalisation.createProof(await this.workspaceOf(user.userId), user.userId, dto)
  }

  @Delete('proofs/:id')
  @RequirePermission('records:write')
  async removeProof(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ deleted: true }> {
    const workspaceId = await this.workspaceOf(user.userId)
    // #4158.49 — même règle que la modification.
    await this.capitalisation.assertCanModifyProof(workspaceId, user.userId, id, await this.canManageTeam(user.userId))
    return this.capitalisation.removeProof(workspaceId, user.userId, id)
  }

  @Post('rex')
  @RequirePermission('records:write')
  async createRex(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateRexDto): Promise<RexEntry> {
    return this.capitalisation.createRex(await this.workspaceOf(user.userId), user.userId, dto)
  }

  /**
   * Les retours d'expérience de l'espace — l'écran `/pilotage/rex`.
   *
   * ⚠️ Remplace `GET rex/pending`, qui servait la MÊME file sans le nom des
   * comptes et sans les retours déjà recueillis, et que personne n'appelait :
   * deux lectures de la même question auraient donné deux vérités le jour où
   * l'une des deux aurait appris quelque chose.
   *
   * Lecture ouverte à l'espace, comme le reste de ce contrôleur : celui qui
   * revient de mission écrit son retour, et ce n'est pas un geste de
   * responsable. L'ÉCRITURE, elle, reste gardée par `records:write`.
   */
  @Get('rex')
  async workspaceRex(@CurrentUser() user: CurrentUserPayload): Promise<WorkspaceRex> {
    return this.capitalisation.rexForWorkspace(await this.workspaceOf(user.userId))
  }

  /**
   * BEL-SC-243 — REX PERTE (#3272.1). Écriture gardée, comme le reste de ce
   * contrôleur : un retour de perte se remplit par un humain qui revient d'un
   * dossier fermé, jamais par un système.
   */
  @Post('lost-deal-rex')
  @RequirePermission('records:write')
  async createLostDealRex(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateLostDealRexDto,
  ): Promise<LostDealRex> {
    return this.capitalisation.createLostDealRex(await this.workspaceOf(user.userId), user.userId, dto)
  }

  /** Lecture ouverte à l'espace, comme `GET rex` : savoir pourquoi on a perdu
   *  n'est pas un geste de responsable. */
  @Get('projects/:id/lost-deal-rex')
  @WorkspaceRead()
  async lostDealRexForProject(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) projectId: string,
  ): Promise<{ items: LostDealRex[] }> {
    const items = await this.capitalisation.lostDealRexForProject(await this.workspaceOf(user.userId), projectId)
    return { items }
  }

  /**
   * BEL-SC-243 — apprentissage contrôlé (#3272.5). Créer une proposition ne
   * fait RIEN d'autre que naître `pending` : la seule sortie possible est
   * `WorkspaceMethodRulesController.decide` (revue de biais + promotion).
   */
  @Post('lost-deal-rule-proposals')
  @RequirePermission('records:write')
  async createLostDealRuleProposal(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateLostDealRuleProposalDto,
  ): Promise<LostDealRuleProposal> {
    return this.capitalisation.createLostDealRuleProposal(await this.workspaceOf(user.userId), user.userId, dto)
  }

  @Post('testimonials')
  @RequirePermission('records:write')
  async createTestimonial(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateTestimonialDto,
  ): Promise<Testimonial> {
    return this.capitalisation.createTestimonial(await this.workspaceOf(user.userId), dto)
  }
}

/** #2424.12 — une liste de facette en query param (« cloud, data ») devient
 *  un tableau nettoyé ; absente ou vide, `undefined` — jamais un tableau
 *  vide qui se lirait « aucune valeur ne correspond ». */
function splitFacetList(value: string | undefined): string[] | undefined {
  const items = (value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  return items.length > 0 ? items : undefined
}
