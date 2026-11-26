import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import type { AtsConnectResult, AtsSnapshot, AtsStatus, AtsTestResult } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { frontendOrigin } from '../crm/crm-config'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { AtsWriteService } from './ats-write.service'
import { AtsService } from './ats.service'
import {
  AtsAssignWriteRequestDto,
  AtsConnectDto,
  AtsSnapshotQueryDto,
  AtsSnoozeWriteRequestDto,
  AtsWriteDecisionDto,
  AtsWriteRequestDto,
} from './dto/ats.dto'

/**
 * « Ton ATS » — les consultants, les besoins et les missions de l'ESN.
 *
 * Aucune route ne relit un jeton : `status` ne rend que le mode d'authentification,
 * l'état (branché / à reconnecter), la date du dernier échange et l'origine de la
 * connexion (espace ou serveur).
 */
@Controller('ats')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class AtsController {
  constructor(
    private readonly ats: AtsService,
    private readonly writes: AtsWriteService,
  ) {}

  @Get('status')
  status(@CurrentUser() user: CurrentUserPayload): Promise<AtsStatus> {
    return this.ats.status(user.userId)
  }

  /** Trouvé en passant, chantier du tome 1 : ces trois routes n'exigeaient
   *  AUCUN droit. N'importe quel membre authentifié — un `viewer` compris —
   *  pouvait connecter, tester ou **déconnecter l'ERP de toute l'entreprise**.
   *  L'ATS est l'outil de l'ENTREPRISE, pas de celui qui appelle : c'est
   *  exactement ce que `integrations:manage` décrit.
   *
   *  #4688 — `connect` n'accepte PLUS de secret collé : il rend l'URL d'autorisation
   *  OAuth2 de l'éditeur, le retour passe par `GET /ats/oauth/callback`. */
  @Post('connect')
  @RequirePermission('integrations:manage')
  @HttpCode(200)
  connect(@CurrentUser() user: CurrentUserPayload, @Body() _dto: AtsConnectDto): Promise<AtsConnectResult> {
    return this.ats.startOAuth(user.userId)
  }

  /** Vérifie que les identifiants répondent avant d'annoncer « connecté ». */
  @Post('test')
  @RequirePermission('integrations:manage')
  @HttpCode(200)
  test(@CurrentUser() user: CurrentUserPayload): Promise<AtsTestResult> {
    return this.ats.test(user.userId)
  }

  @Get('snapshot')
  snapshot(@CurrentUser() user: CurrentUserPayload, @Query() query: AtsSnapshotQueryDto): Promise<AtsSnapshot> {
    return this.ats.snapshot(user.userId, query)
  }

  /** Révoque chez l'éditeur, puis purge. */
  @Delete()
  @RequirePermission('integrations:manage')
  @HttpCode(204)
  disconnect(@CurrentUser() user: CurrentUserPayload): Promise<void> {
    return this.ats.disconnect(user.userId)
  }
  // ---- Écriture gouvernée (décision Louis du 03/08) -------------------------

  /**
   * Demande une écriture dans l'ERP. N'écrit RIEN : elle crée une demande à
   * valider par un responsable, avec la prévisualisation figée de ce qui partira.
   */
  @Post('write-requests')
  @HttpCode(200)
  requestWrite(@CurrentUser() user: CurrentUserPayload, @Body() dto: AtsWriteRequestDto) {
    // Un `switch` plutôt qu'un cast : c'est lui qui fait le lien entre le `kind`
    // et la forme de sa charge utile. Un cast le romprait exactement là où il
    // compte — un TJM envoyé dans le corps d'une création de mission partirait
    // sans que rien ne l'arrête.
    const write = dto.write
    switch (write.kind) {
      case 'create_mission': {
        const { kind: _kind, ...payload } = write
        return this.writes.request(user.userId, 'create_mission', payload)
      }
      case 'update_tjm': {
        const { kind: _kind, ...payload } = write
        return this.writes.request(user.userId, 'update_tjm', payload)
      }
      case 'log_call': {
        const { kind: _kind, ...payload } = write
        return this.writes.request(user.userId, 'log_call', payload)
      }
      default: {
        const { kind: _kind, ...payload } = write
        return this.writes.request(user.userId, 'update_need_status', payload)
      }
    }
  }

  /**
   * Les demandes en attente de l'espace, décorées de ce que CET utilisateur peut
   * en faire — pour que l'écran n'affiche pas un bouton dont il sait déjà qu'il
   * sera refusé.
   */
  @Get('write-requests')
  listWriteRequests(@CurrentUser() user: CurrentUserPayload) {
    return this.writes.listPendingView(user.userId)
  }

  /**
   * Tranche une demande. Toujours une validation de responsable — un TJM est un
   * TJM, quel que soit le volume — et jamais par son propre demandeur.
   */
  @Post('write-requests/:id/decision')
  @HttpCode(200)
  decideWrite(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: AtsWriteDecisionDto) {
    return this.writes.decide(user.userId, id, dto.decision)
  }

  /**
   * #2864 — CONFIER une demande d'écriture ERP à un collègue du MÊME espace
   * (`null` = retirer). Même posture que `decideWrite` juste au-dessus :
   * aucune permission déclarée sur la route, la capacité réelle se vérifie
   * dans le moteur (`AtsWriteService.assign`).
   *
   * Rend la MÊME vue qu'en lecture (`assignView`), pas l'entité brute —
   * même correctif que `CrmController.assignWrite` (#2864 / #2856, reste du
   * lot précédent : la route rendait l'entité).
   */
  @Post('write-requests/:id/assign')
  @HttpCode(200)
  assignWrite(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: AtsAssignWriteRequestDto) {
    return this.writes.assignView({ userId: user.userId, requestId: id, assigneeId: dto.assigneeId })
  }

  /**
   * #2856 — REPORTER une demande d'écriture ERP (`null` la réveille). Rien
   * n'est décidé : la demande reste `pending`. Même vue qu'en lecture
   * (`snoozeView`) — voir le commentaire d'`assignWrite` ci-dessus.
   */
  @Post('write-requests/:id/snooze')
  @HttpCode(200)
  snoozeWrite(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: AtsSnoozeWriteRequestDto) {
    return this.writes.snoozeView({
      userId: user.userId,
      requestId: id,
      until: dto.until === null ? null : new Date(dto.until),
    })
  }
}

/**
 * Le retour d'autorisation de BoondManager (#4688).
 *
 * Sans garde de session, comme le callback HubSpot : c'est le NAVIGATEUR qui revient d'un site tiers, la preuve est le
 * `state` signé + son empreinte serveur, pas un jeton Bearer. Ne lève jamais : toute issue est une redirection.
 */
@Controller('ats/oauth')
export class AtsOAuthController {
  constructor(private readonly ats: AtsService) {}

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') providerError: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const back = (params: string) => res.redirect(`${frontendOrigin()}/integrations?${params}`)
    // L'utilisateur a refusé le consentement chez l'éditeur : rien à échanger, rien à écrire.
    if (providerError) return back('ats=error&reason=access_denied')
    if (!code || !state) return back('ats=error&reason=missing_code')
    const result = await this.ats.completeOAuth(code, state)
    return result.ok ? back('ats=connected') : back(`ats=error&reason=${result.reason}`)
  }
}
