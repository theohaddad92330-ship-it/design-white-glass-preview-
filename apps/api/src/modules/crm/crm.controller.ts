import {
  adoptCrmValueSchema,
  connectorSearchResult,
  type AccountCrmExportsResponse,
  type AccountCrmProvenance,
  type ConnectorSearchResult,
  type CrmPushPreview,
  type CrmPushResult,
  type CrmPushTargets,
  type CrmList,
  type CrmSequence,
  type CrmWriteRequests,
  type CrmWriteRequestView,
  type PipelineReport,
  type RecentSignal,
  type ScoredLead,
} from '@bellum/contracts'
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
  HttpException,
  HttpStatus,
  ParseUUIDPipe,
  PreconditionFailedException,
} from '@nestjs/common'
import type { Response } from 'express'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { personDisplayName } from '../action-os/run-trace'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { frontendOrigin, readHubspotConfig } from './crm-config'
import { toCrmWriteRequestView } from './crm-write-request-view'
import { CrmAdapterRegistry } from './adapter/crm-adapter.registry'
import { CrmWriteService, type CrmWriteOutcome } from './crm-write.service'
import { CrmPushService } from './crm-push.service'
import { OutboundWriteService } from './outbound-write.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CrmDepthService, type EnrollmentOutcome } from './crm-depth.service'
import { CrmReadService } from './crm-read.service'
import { CrmAccountSignalsService } from './crm-account-signals.service'
import type { CrmPresence } from './crm-presence'
import type { CrmVocabulary } from './crm-vocabulary'
import type { CrmNetworkSize } from './crm-network-size'
import { CrmService, type CrmStatus, type DealPipelinesRead } from './crm.service'
import type { BatchUpsertOutcome } from './hubspot-depth.client'
import type { CrmContactPage, UpsertResult } from './hubspot.client'
import {
  AssignCrmWriteRequestDto,
  CrmCreateCompanyDto,
  CrmCreateListDto,
  CrmCreateTaskDto,
  CrmEnrollDto,
  CrmImportContactsDto,
  CrmLeadScoreQueryDto,
  CrmLogMeetingDto,
  CrmPushDto,
  CrmPipelineQueryDto,
  CrmStaleContactsQueryDto,
  ExportContactDto,
  ListContactsQueryDto,
  LogActivityDto,
  PresenceQueryDto,
  PushContactDto,
  SnoozeCrmWriteRequestDto,
} from './dto/crm.dto'
import { DataExit } from '../workspace/data-exit.decorator'

/**
 * CRM integration (HubSpot for the beta). Most routes are JWT-guarded and
 * derive the user from the token. The OAuth `callback` is the exception: it is
 * a top-level browser redirect coming from HubSpot, so it can't carry our JWT —
 * the caller is authenticated instead by a signed, short-lived `state` param
 * (see CrmService.verifyState), and the handler bounces the browser back to the
 * SPA rather than returning JSON.
 */
@Controller('crm')
export class CrmController {
  constructor(
    private readonly crm: CrmService,
    private readonly crmRead: CrmReadService,
    private readonly depth: CrmDepthService,
    private readonly outbound: OutboundWriteService,
    private readonly workspace: WorkspaceContextService,
    // #2200/#2201 ACT2 — le PROPRIÉTAIRE d'une demande d'écriture, pour
    // l'objet visé (`target.ownerName`). Injecté ici : le mapper pur
    // (`toCrmWriteRequestView`) ne doit lire aucun dépôt.
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    // #3918.b — les signaux CRM (affaire perdue / dormante / à renouveler) d'un compte.
    private readonly crmAccountSignals: CrmAccountSignalsService,
    // #4186 — la porte pour TOUS les fournisseurs, et le registre qui dit lesquels sont branchés.
    private readonly crmWrites: CrmWriteService,
    private readonly adapters: CrmAdapterRegistry,
    // #4188 — envoyer un compte et ses contacts vers le CRM branché, unitaire et en lot.
    private readonly push: CrmPushService,
  ) {}

  /** Résout un ou plusieurs propriétaires en un aller — jamais un N+1 par ligne. */
  private async resolveOwners(userIds: readonly string[]): Promise<Map<string, { id: string; name: string | null }>> {
    const ids = [...new Set(userIds)]
    if (ids.length === 0) return new Map()
    const rows = await this.profiles.find({ where: { user_id: In(ids) } })
    return new Map(rows.map(profile => [profile.user_id, { id: profile.user_id, name: personDisplayName(profile) }]))
  }

  @Get('status')
  @UseGuards(JwtGuard)
  status(@CurrentUser() user: CurrentUserPayload): Promise<CrmStatus> {
    return this.crm.getStatus(user.userId)
  }

  /**
   * Presence read-back (roadmap §8/§9) : « as-tu déjà un contact chez ce
   * groupe ? ». Provider-agnostic — asks whichever CRM the workspace connected
   * (HubSpot or Salesforce). Workspace-scoped via the JWT; no CRM connected →
   * `provider: null, matched: false` (a strict no-op, zero network).
   */
  @Get('presence')
  @UseGuards(JwtGuard)
  presence(@CurrentUser() user: CurrentUserPayload, @Query() query: PresenceQueryDto): Promise<CrmPresence> {
    return this.crmRead.findAccountPresence(user.userId, {
      account: query.account,
      domain: query.domain,
      siren: query.siren,
    })
  }

  /**
   * #2031.5 / #2045.5 — décision Louis 18/09/2026 : « PROPOSER sans remplir ».
   * Le vocabulaire BRUT (secteurs/pays) du CRM branché de CET espace, dans ses
   * propres mots — jamais mappé vers le catalogue fermé du questionnaire.
   * Provider-agnostic côté écran comme `presence` : aucun CRM connecté →
   * `provider: null`, listes vides (no-op strict).
   */
  @Get('vocabulary')
  @UseGuards(JwtGuard)
  // Lecture pure de la donnée de L'ESPACE : `resolveActiveWorkspace(userId)` déduit
  // l'espace de l'appartenance de l'appelant — jamais de l'URL — et la requête
  // filtre dessus. Aucune écriture, aucun crédit débité, rien ne sort de l'espace.
  // `integrations:manage` fermerait cette lecture à `viewer` et `tech_admin`, la
  // faute exacte que ce marqueur existe pour éviter (GA-05).
  @WorkspaceRead()
  vocabulary(@CurrentUser() user: CurrentUserPayload): Promise<CrmVocabulary> {
    return this.crm.vocabulary(user.userId)
  }

  /**
   * #2045.5 (épopée #2859) — combien de contacts le CRM branché connaît, tous
   * comptes confondus. Même honnêteté que `vocabulary` : `provider: null`
   * sans lecture, `total: null` (jamais un zéro déguisé) tant que rien n'a
   * été mesuré.
   */
  @Get('network-size')
  @UseGuards(JwtGuard)
  @WorkspaceRead()
  networkSize(@CurrentUser() user: CurrentUserPayload): Promise<CrmNetworkSize> {
    return this.crm.networkSize(user.userId)
  }

  /**
   * #3918.b (lot M01) — les signaux CRM rattachés à CE compte (jointure
   * #3918.a, jamais par nom), dans la forme que la veille lit déjà
   * (`RecentSignal`). Lecture de la donnée de l'espace, comme `vocabulary` :
   * le compte d'un autre espace ne rend rien (filtre SQL sur l'espace actif).
   */
  @Get('accounts/:accountId/signals')
  @UseGuards(JwtGuard)
  @WorkspaceRead()
  async accountSignals(
    @CurrentUser() user: CurrentUserPayload,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
  ): Promise<{ items: RecentSignal[]; crm_connected: boolean; linked_deals: number }> {
    const { workspaceId } = await this.workspace.resolveActiveWorkspace(user.userId)
    // GA-10 — an empty list must say whether a CRM was there to read: « aucune
    // affaire » and « aucun CRM branché » are two different answers.
    const [items, crmConnected, linkedDeals] = await Promise.all([
      this.crmAccountSignals.forAccount(workspaceId, accountId),
      this.crm.isConnected(user.userId),
      // #3918.2 (r40) — « aucune affaire rattachée » se distingue de « des affaires, aucun signal ».
      this.crmAccountSignals.linkedDealCount(workspaceId, accountId),
    ])
    return { items, crm_connected: crmConnected, linked_deals: linkedDeals }
  }

  @Get('hubspot/connect')
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('integrations:manage')
  connect(@CurrentUser() user: CurrentUserPayload): { url: string } {
    return { url: this.crm.buildAuthorizeUrl(user.userId) }
  }

  @Get('hubspot/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl = readHubspotConfig()?.frontendUrl ?? frontendOrigin()
    const back = (params: string) => res.redirect(`${frontendUrl}/knowledge?${params}`)

    if (!code || !state) return back('crm=error&reason=missing_code')
    const result = await this.crm.handleCallback(code, state)
    return result.ok ? back('crm=connected') : back(`crm=error&reason=${result.reason ?? 'unknown'}`)
  }

  @RequireFeature('crm_sync')
  @Post('hubspot/export')
  // #2081.14 — une SORTIE de données : la règle d'espace « qui peut exporter » la tient.
  @DataExit()
  @UseGuards(JwtGuard, WorkspacePermissionGuard, PlanFeatureGuard)
  @RequirePermission('data:export')
  async export(@CurrentUser() user: CurrentUserPayload, @Body() dto: ExportContactDto): Promise<UpsertResult> {
    // Un geste d'utilisateur est auto-approuvé par la porte : le clic EST la
    // décision. Le `null` ne survient donc que si une autre instance a déjà pris
    // la demande (même clé d'idempotence) — et le dire vaut mieux qu'un 200 muet.
    //
    // #1959.4 / #1959.6 — la clé existait déjà côté porte (`gate.idempotencyKey`,
    // `OutboundWriteService.request`) mais rien ne la lui transmettait depuis cet
    // endpoint : le chat appelle `crmApi.exportContact` EN DIRECT, sans routeur
    // d'actions, et un double clic créait deux fiches. `dto.idempotencyKey`
    // absent ⇒ chemin byte-identique à avant (aucune clé transmise à la porte).
    const result = await this.crm.exportContact(user.userId, dto, {
      origin: 'user',
      idempotencyKey: dto.idempotencyKey,
    })
    if (!result) throw new ConflictException('Cet export a déjà été demandé.')
    return result
  }

  /**
   * #4188 — CE QUI PARTIRAIT vers le CRM branché : créés / mis à jour / déjà
   * présents / refusés, élément par élément. N'écrit RIEN.
   */
  @RequireFeature('crm_sync')
  @Post('push/preview')
  @HttpCode(200)
  @UseGuards(JwtGuard, WorkspacePermissionGuard, PlanFeatureGuard)
  @RequirePermission('data:export')
  previewPush(@CurrentUser() user: CurrentUserPayload, @Body() dto: CrmPushDto): Promise<CrmPushPreview> {
    return this.push.preview(user.userId, dto)
  }

  /**
   * #4188 — l'envoi VALIDÉ d'un compte (avec ou sans ses contacts), ou d'un
   * lot : chaque élément par la porte commune, chacun son résultat.
   */
  @RequireFeature('crm_sync')
  @Post('push')
  @HttpCode(200)
  @DataExit()
  @UseGuards(JwtGuard, WorkspacePermissionGuard, PlanFeatureGuard)
  @RequirePermission('data:export')
  pushToCrm(@CurrentUser() user: CurrentUserPayload, @Body() dto: CrmPushDto): Promise<CrmPushResult> {
    return this.push.push(user.userId, dto)
  }

  /** 16/10 — les CRM branchés vers lesquels la fenêtre d'envoi propose d'écrire (le principal, les autres, les lectures seules). */
  @RequireFeature('crm_sync')
  @Get('push/targets')
  @UseGuards(JwtGuard, WorkspacePermissionGuard, PlanFeatureGuard)
  @RequirePermission('data:export')
  pushTargets(@CurrentUser() user: CurrentUserPayload): Promise<CrmPushTargets> {
    return this.push.targets(user.userId)
  }

  /** #4188 — « dans <CRM> » : où ce compte a été envoyé, avec le lien vers sa fiche. */
  @RequireFeature('crm_sync')
  @Get('push/accounts/:accountId')
  @UseGuards(JwtGuard)
  @WorkspaceRead()
  async accountPushes(
    @CurrentUser() user: CurrentUserPayload,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
  ): Promise<AccountCrmExportsResponse> {
    return { items: await this.push.accountExports(user.userId, accountId) }
  }

  /**
   * #4459.2 — « Déjà dans ton CRM » / « Apporté par Bellum » pour chaque contact du compte. Une LECTURE de ce
   * que les imports ont déjà écrit : sans `RequireFeature('crm_sync')`, car un compte versé par un FICHIER
   * venu du CRM porte sa provenance même quand aucun CRM n'est branché. 404 hors de l'espace.
   */
  @Get('push/accounts/:accountId/provenance')
  @UseGuards(JwtGuard)
  @WorkspaceRead()
  async accountProvenance(
    @CurrentUser() user: CurrentUserPayload,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
  ): Promise<AccountCrmProvenance> {
    return this.push.accountProvenance(user.userId, accountId)
  }

  /**
   * #4186.1 — exporter un contact vers un CRM branché, PAR LA PORTE, quel que
   * soit le fournisseur. Remplace `POST /salesforce|pipedrive|attio|odoo/export`,
   * qui écrivaient en direct sans laisser de trace. Le clic EST la décision
   * (`origin: 'user'`) : la demande est auto-approuvée, écrite, et son résultat
   * consigné — `unknown` si la requête est partie sans réponse.
   */
  @RequireFeature('crm_sync')
  @Post('push/contact')
  @HttpCode(200)
  @DataExit()
  @UseGuards(JwtGuard, WorkspacePermissionGuard, PlanFeatureGuard)
  @RequirePermission('data:export')
  async pushContact(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: PushContactDto,
  ): Promise<{ id: string; created: boolean }> {
    const { provider, idempotencyKey, ...contact } = dto
    return writtenOrThrow(
      await this.crmWrites.write({
        userId: user.userId,
        provider,
        kind: 'export_contact',
        payload: contact,
        origin: 'user',
        idempotencyKey: idempotencyKey ?? null,
      }),
    )
  }

  /**
   * Les écritures CRM en attente (BEL-INT-603).
   *
   * Elles viennent des gestes de SYSTÈME — un versement de téléphonie, un reflet
   * d'interaction réseau, une routine. Personne ne les a relues, donc rien n'est
   * parti. Cet écran est ce qui empêche « en attente » de vouloir dire « perdu ».
   *
   * ⚠️ Un ÉTAT, jamais un tableau nu. La route rendait l'entité brute dans un
   * tableau : « aucune demande en attente » et « aucun CRM branché, donc rien
   * ne peut partir » se lisaient identiquement — et une liste vide se croit là
   * où une erreur se remarque. Elle rendait aussi le NOM du fournisseur, la
   * charge utile et la clé d'idempotence ; la vue les retire
   * (`crm-write-request-view.ts`).
   */
  /**
   * #1934.18 — les pipelines d'affaires et leurs stades RÉELS.
   *
   * Lecture seule. C'est d'ici, et d'ici seulement, que l'écran tire l'identifiant
   * de stade qu'il propose : `dealstage` n'accepte pas un libellé, et un stade
   * deviné à partir du texte du modèle serait refusé par la plupart des portails.
   */
  @Get('deal-pipelines')
  // La même permission que la seule route qui s'en sert
  // (`POST /meeting-notes/cascade/approve`) : lire les stades ne sert qu'à qui
  // peut en proposer un. GA-05 compte les routes sans permission.
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('records:write')
  dealPipelines(@CurrentUser() user: CurrentUserPayload): Promise<DealPipelinesRead> {
    return this.crm.dealPipelines(user.userId)
  }

  @Get('write-requests')
  @UseGuards(JwtGuard)
  async writeRequests(@CurrentUser() user: CurrentUserPayload): Promise<CrmWriteRequests> {
    // #4163 LF — la salle de démonstration montre un CRM branché (registre d'outils) : elle lit ses écritures EN
    // ATTENTE semées, au lieu de « Écriture CRM indisponible ». Elle ne les exécute jamais (voir `decideWrite`).
    // #4186.2 — la file sert TOUS les CRM branchés, plus seulement HubSpot :
    // une demande Pipedrive en attente se voyait masquée par « non connecté ».
    const demo = await this.workspace.isDemoWorkspace(user.userId)
    const destinations = new Map<string, string | null>()
    if (!demo) {
      const connected = await this.adapters.connected(user.userId)
      if (connected.length === 0) {
        const hubspot = await this.crm.getStatus(user.userId)
        return { status: hubspot.configured ? 'not_connected' : 'not_configured', requests: [] }
      }
      for (const row of connected) destinations.set(row.adapter.provider as string, row.accountLabel)
    }

    const { workspaceId } = await this.workspace.resolveActiveWorkspace(user.userId)
    const rows = await this.outbound.pending(workspaceId)
    const owners = await this.resolveOwners(rows.map(row => row.requested_by))
    return {
      status: 'ready',
      requests: rows.map(row =>
        toCrmWriteRequestView(
          row,
          user.userId,
          owners.get(row.requested_by) ?? null,
          destinations.get(row.provider) ?? null,
        ),
      ),
    }
  }

  /** Trancher une demande. Une demande EXPIRÉE est refusée : elle écrirait un
   *  état que plus personne n'a en tête. */
  @Post('write-requests/:id/decide')
  @HttpCode(200)
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('data:export')
  async decideWrite(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: { approve: boolean },
  ): Promise<CrmWriteRequestView> {
    const { workspaceId } = await this.workspace.resolveActiveWorkspace(user.userId)
    const decided = await this.outbound.decide({
      workspaceId,
      userId: user.userId,
      requestId: id,
      approve: dto.approve === true,
    })
    // #1943.8 — une demande de SYSTÈME validée PART maintenant, une fois, telle
    // qu'elle a été montrée. `requireApproved` n'avait aucun appelant : la
    // validation passait la demande `approved` et rien n'était jamais écrit.
    // #4163 LF — JAMAIS d'écriture réelle depuis la salle de démonstration : la demande se tranche, le CRM n'est pas
    // touché (et il n'y a de toute façon ni connexion ni jeton). Elle reste « approved », jamais « written ».
    // #4186 — par la porte commune : HubSpot garde son chemin, les autres CRM
    // partent par leur adaptateur (avant, « ne peut pas partir d'ici »).
    const demo = await this.workspace.isDemoWorkspace(user.userId)
    const settled =
      decided.state === 'approved' && decided.origin === 'system' && !demo
        ? await this.crmWrites.writeApproved(workspaceId, user.userId, decided.id)
        : decided
    // La MÊME vue qu'en lecture : rendre l'entité ici et la vue là-bas ferait
    // deux formes pour un même objet, et l'écran finirait par en lire une des
    // deux au hasard selon le chemin emprunté.
    const owners = await this.resolveOwners([settled.requested_by])
    return toCrmWriteRequestView(settled, user.userId, owners.get(settled.requested_by) ?? null)
  }

  /**
   * #2854 (#2201.32) — « Annuler le lot » : refuse chaque demande de la
   * sélection, LA MÊME porte que `decide` ci-dessus (`data:export`, GA-26).
   * Chaque issue est rendue séparément — jamais un succès global qui
   * couvrirait un échec partiel.
   */
  @Post('write-requests/bulk-reject')
  @HttpCode(200)
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('data:export')
  async bulkRejectWrites(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: { ids: string[] },
  ): Promise<{ succeeded: string[]; failed: Array<{ id: string; reason: string }> }> {
    const { workspaceId } = await this.workspace.resolveActiveWorkspace(user.userId)
    return this.outbound.bulkReject({ workspaceId, userId: user.userId, requestIds: dto.ids ?? [] })
  }

  /**
   * #2854 (#2201.9) — « Fusion file unique : actions en masse ». Dépose
   * PLUSIEURS propositions CRM en une seule requête, groupées sous un
   * `batchId` partagé (`CrmService.proposeBatch`). Chaque item reste TYPÉ —
   * jamais un `kind`/`payload` libre — et passe par SA validation complète
   * (`proposeDealStage`/`proposeCreateDeal`), inchangée.
   */
  @Post('deals/propose-batch')
  @HttpCode(200)
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('data:export')
  async proposeDealsBatch(
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    dto: {
      items: ReadonlyArray<
        | { kind: 'deal_stage'; dealId: string; stageId: string; rationale?: string; idempotencyKey?: string | null }
        | { kind: 'create_deal'; title: string; accountName?: string; idempotencyKey?: string | null }
      >
    },
  ): Promise<{
    batchId: string | null
    results: Array<
      | { kind: 'deal_stage' | 'create_deal'; ok: true; requestId: string; pending: boolean }
      | { kind: 'deal_stage' | 'create_deal'; ok: false; reason: string }
    >
  }> {
    return this.crm.proposeBatch(user.userId, dto.items ?? [])
  }

  /**
   * MODIFIER UNE DEMANDE — c'est-à-dire en créer une NOUVELLE, figée (#1498).
   *
   * Le retour demandait un bouton « Modifier » à côté de « Valider » et
   * « Refuser ». La règle qui rend cette file sûre l'interdisait tel quel : la
   * prévisualisation est FIGÉE, on approuve exactement ce qu'on a lu.
   *
   * Louis a tranché le 05/09 : la révision crée une demande neuve, gelée à son
   * tour, et l'ancienne passe en « remplacée ». Le geste existe, la garantie
   * reste.
   *
   * ⚠️ `changes` porte des CLÉS de charge utile, pas des libellés. C'est
   * pourquoi la prévisualisation les expose désormais : sans elles, une ligne
   * modifiée à l'écran n'avait aucun moyen de retrouver le champ qu'elle écrit.
   */
  @Post('write-requests/:id/revise')
  @HttpCode(200)
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('data:export')
  async reviseWrite(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: { changes?: Record<string, unknown> },
  ): Promise<CrmWriteRequestView> {
    const { workspaceId } = await this.workspace.resolveActiveWorkspace(user.userId)
    const revised = await this.outbound.revise({
      workspaceId,
      userId: user.userId,
      requestId: id,
      changes: dto.changes ?? {},
    })
    const owners = await this.resolveOwners([revised.requested_by])
    return toCrmWriteRequestView(revised, user.userId, owners.get(revised.requested_by) ?? null)
  }

  /**
   * #2864 — CONFIER une écriture CRM en attente à un collègue du MÊME espace
   * (`null` = retirer). L'appartenance et la capacité réelle à trancher
   * (`data:export`) se vérifient dans le moteur (`OutboundWriteService.assign`) ;
   * cette route ne transmet que l'identifiant validé et le rôle déjà résolu du
   * destinataire.
   *
   * Rend la MÊME vue qu'en lecture (`toCrmWriteRequestView`), comme `decide` et
   * `revise` juste au-dessus — rendre l'entité brute ici ferait fuiter
   * `provider`/`payload`/`idempotency_key` que la vue existe justement pour
   * cacher (#2864, reste du lot précédent : la route rendait l'entité).
   */
  @Post('write-requests/:id/assign')
  @HttpCode(200)
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('data:export')
  async assignWrite(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: AssignCrmWriteRequestDto,
  ): Promise<CrmWriteRequestView> {
    const { workspaceId, role } = await this.workspace.resolveActiveWorkspace(user.userId)
    const assigneeRole = dto.assigneeId
      ? ((await this.workspace.getMembership(dto.assigneeId, workspaceId))?.role ?? null)
      : null
    const request = await this.outbound.assign({
      workspaceId,
      requestId: id,
      assignerId: user.userId,
      assignerRole: role,
      assigneeId: dto.assigneeId,
      assigneeRole,
    })
    const owners = await this.resolveOwners([request.requested_by])
    return toCrmWriteRequestView(request, user.userId, owners.get(request.requested_by) ?? null)
  }

  /**
   * #2856 — REPORTER une écriture CRM en attente (`null` la réveille). Rien
   * n'est décidé : la demande reste `pending` et passe toujours par la porte à
   * son réveil.
   *
   * Même vue qu'en lecture (#2856, reste du lot précédent : la route rendait
   * l'entité) — voir le commentaire d'`assignWrite` ci-dessus.
   */
  @Post('write-requests/:id/snooze')
  @HttpCode(200)
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('data:export')
  async snoozeWrite(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: SnoozeCrmWriteRequestDto,
  ): Promise<CrmWriteRequestView> {
    const { workspaceId, role } = await this.workspace.resolveActiveWorkspace(user.userId)
    const request = await this.outbound.snooze({
      workspaceId,
      requestId: id,
      actorId: user.userId,
      actorRole: role,
      until: dto.until === null ? null : new Date(dto.until),
    })
    const owners = await this.resolveOwners([request.requested_by])
    return toCrmWriteRequestView(request, user.userId, owners.get(request.requested_by) ?? null)
  }

  /** Import a page of the rep's existing CRM contacts. */
  /**
   * Adopter la valeur du CRM sur un champ d'un contact (arbitrage Louis, 03/08).
   *
   * Par défaut, la valeur Bellum fait foi ; ce geste est la sortie explicite.
   * `POST` et non `PATCH` sur le contact : ce n'est pas une modification
   * arbitraire de fiche, c'est une décision nommée — « sur ce champ, le CRM a
   * raison » — et l'API la journalise comme telle.
   */
  @Post('contacts/:contactId/adopt/:field')
  @HttpCode(200)
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('data:export')
  async adoptCrmValue(
    @Param('contactId') contactId: string,
    @Param('field') field: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const parsed = adoptCrmValueSchema.safeParse({ field })
    if (!parsed.success) {
      throw new HttpException('Champ non adoptable.', HttpStatus.UNPROCESSABLE_ENTITY)
    }
    return this.crm.adoptCrmValue(user.userId, contactId, parsed.data.field)
  }

  @Get('contacts')
  @UseGuards(JwtGuard)
  contacts(@CurrentUser() user: CurrentUserPayload, @Query() query: ListContactsQueryDto): Promise<CrmContactPage> {
    return this.crm.listContacts(user.userId, { limit: query.limit, after: query.after })
  }

  /** Log an activity ("email envoyé depuis Bellum") onto a CRM contact's timeline. */
  @Post('contacts/:crmId/activity')
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('data:export')
  logActivity(
    @CurrentUser() user: CurrentUserPayload,
    @Param('crmId') crmId: string,
    @Body() dto: LogActivityDto,
  ): Promise<{ id: string }> {
    return this.crm.logActivity(user.userId, crmId, dto.note).then(result => {
      if (!result) throw new ConflictException('Cette note a déjà été demandée.')
      return result
    })
  }

  /**
   * Crée une tâche de relance dans le CRM (§5.3 n°1). Le contact est optionnel ;
   * l'échéance ne l'est pas — une tâche sans date ne remonte dans aucune vue.
   */
  @Post('tasks')
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('data:export')
  async createTask(@CurrentUser() user: CurrentUserPayload, @Body() dto: CrmCreateTaskDto): Promise<{ id: string }> {
    const result = await this.crm.createTask(user.userId, dto)
    // `null` = une autre instance a déjà pris la demande. Ne pas réécrire est le
    // résultat voulu : en déposer deux dans un CRM ne se répare pas.
    if (!result) throw new ConflictException('Cette tâche a déjà été demandée.')
    return result
  }

  /** Journalise une réunion tenue (§5.3 n°2). */
  @Post('meetings')
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('data:export')
  async logMeeting(@CurrentUser() user: CurrentUserPayload, @Body() dto: CrmLogMeetingDto): Promise<{ id: string }> {
    const result = await this.crm.logMeeting(user.userId, dto)
    if (!result) throw new ConflictException('Cette réunion a déjà été journalisée.')
    return result
  }

  /** Les contacts sans activité depuis N jours — « à relancer » / « dormants ». */
  @Get('stale-contacts')
  @UseGuards(JwtGuard)
  async staleContacts(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: CrmStaleContactsQueryDto,
  ): Promise<
    ConnectorSearchResult<{ id: string; name: string | null; email: string | null; lastActivityAt: string | null }>
  > {
    // « Personne à relancer » est une bonne nouvelle, « je n'ai pas pu lire tes
    // contacts » n'en est pas une. C'est la route qui répondait 500 le 16/08.
    return connectorSearchResult(await this.crm.listStaleContacts(user.userId, query.days, query.limit))
  }

  // ---- Profondeur CRM (arbitrages Louis du 03/08) ---------------------------

  /**
   * Le rapport de pipeline : ouverts par étape, gagnés/perdus de la fenêtre,
   * taux de conversion, cycle moyen, répartition par propriétaire.
   *
   * `GET` alors qu'il peut déclencher une lecture profonde : la synchronisation
   * est un effet de bord de CACHE, pas une écriture métier — rejouer l'appel
   * rend le même rapport. La relecture forcée, elle, reste explicite (`refresh`).
   */
  @Get('pipeline/report')
  @UseGuards(JwtGuard)
  pipelineReport(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: CrmPipelineQueryDto,
  ): Promise<PipelineReport> {
    return this.depth.getPipelineReport(user.userId, { period: query.period, refresh: query.refresh })
  }

  /** Force la relecture de l'historique des deals. */
  @Post('pipeline/sync')
  @HttpCode(200)
  @UseGuards(JwtGuard)
  syncPipeline(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ dealsRead: number; truncated: boolean; syncedAt: string }> {
    return this.depth.syncPipeline(user.userId)
  }

  /** Les listes du portail. */
  @Get('lists')
  @UseGuards(JwtGuard)
  async lists(@CurrentUser() user: CurrentUserPayload): Promise<ConnectorSearchResult<CrmList>> {
    return connectorSearchResult(await this.depth.listLists(user.userId))
  }

  /** Crée une liste statique, avec ses membres quand on les connaît déjà. */
  @Post('lists')
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('data:export')
  createList(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CrmCreateListDto,
  ): Promise<CrmList & { added: number }> {
    return this.depth.createList(user.userId, dto)
  }

  /** Les séquences existantes du portail. Bellum n'en crée pas — il rejoint
   *  celles que l'ESN a construites. */
  @Get('sequences')
  @UseGuards(JwtGuard)
  async sequences(@CurrentUser() user: CurrentUserPayload): Promise<ConnectorSearchResult<CrmSequence>> {
    // Une liste de séquences vide fait conclure « l'ESN n'en a construit
    // aucune » — alors qu'il peut simplement manquer la portée de lecture.
    return connectorSearchResult(await this.depth.listSequences(user.userId))
  }

  /**
   * Inscrit des contacts dans une séquence du CRM.
   *
   * Le geste le plus risqué du lot — il programme des envois dans un moteur qui
   * n'est pas le nôtre — donc la permission d'export ET le double contrôle de
   * désabonnement, contact par contact, côté service.
   */
  @Post('sequences/enroll')
  @HttpCode(200)
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('data:export')
  enroll(@CurrentUser() user: CurrentUserPayload, @Body() dto: CrmEnrollDto): Promise<EnrollmentOutcome> {
    return this.depth.enrollInSequence(user.userId, dto)
  }

  /** Les leads classés par engagement, du plus chaud au plus froid. */
  @Get('lead-scores')
  @UseGuards(JwtGuard)
  async leadScores(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: CrmLeadScoreQueryDto,
  ): Promise<ConnectorSearchResult<ScoredLead>> {
    return connectorSearchResult(await this.depth.scoreLeads(user.userId, query.limit))
  }

  /** Import en masse d'un fichier de prospection déjà relu par l'utilisateur. */
  @Post('contacts/import')
  @HttpCode(200)
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('data:export')
  importContacts(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CrmImportContactsDto,
  ): Promise<BatchUpsertOutcome> {
    return this.depth.importContacts(user.userId, dto.contacts)
  }

  /** Crée une société — ou rend celle qui existe déjà, sans la dupliquer. */
  @Post('companies')
  @HttpCode(200)
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('data:export')
  async createCompany(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CrmCreateCompanyDto,
  ): Promise<{ id: string; created: boolean }> {
    // #4186.1 — par la porte : la création de société HubSpot écrivait en direct.
    return writtenOrThrow(
      await this.crmWrites.write({
        userId: user.userId,
        provider: 'hubspot',
        kind: 'create_company',
        payload: { ...dto },
        origin: 'user',
      }),
    )
  }

  @Delete('hubspot')
  @HttpCode(204)
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('integrations:manage')
  async disconnect(@CurrentUser() user: CurrentUserPayload): Promise<void> {
    await this.crm.disconnect(user.userId)
  }
}

/**
 * #4186 — la réponse HTTP d'une écriture d'UTILISATEUR passée par la porte. Un
 * clic est auto-approuvé : `pending` ne survient pas ; `already_done` dit que
 * le même geste est déjà passé ; `refused` nomme ce qui manque (CRM non
 * branché, fiche non portée) — jamais un 200 muet.
 */
function writtenOrThrow(outcome: CrmWriteOutcome): { id: string; created: boolean } {
  switch (outcome.status) {
    case 'written':
      return { id: outcome.externalId, created: outcome.created }
    case 'already_done':
      if (outcome.externalId) return { id: outcome.externalId, created: false }
      throw new ConflictException('Cet export a déjà été demandé.')
    case 'pending':
      throw new ConflictException('Cette écriture attend une validation dans la file des écritures CRM.')
    case 'refused':
      throw new PreconditionFailedException(outcome.reason)
  }
}
