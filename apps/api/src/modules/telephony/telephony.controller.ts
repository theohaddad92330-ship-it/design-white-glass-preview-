import { connectorSearchResult, type ConnectorSearchResult } from '@bellum/contracts'
import type { CallAnalysis, CallLogOutcome, CallRecord, TelephonyStatus } from '@bellum/contracts'
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { TelephonyCallsQueryDto, TelephonyConnectDto, TelephonyLogDto } from './dto/telephony.dto'
import { TelephonyService } from './telephony.service'

/**
 * L'outil d'appel de l'ESN.
 *
 * `status` est ouvert à tout membre — un écran doit pouvoir dire « rien n'est
 * branché » sans permission particulière. Connecter et déconnecter demandent la
 * gestion des intégrations : les identifiants d'un standard téléphonique
 * engagent toute l'entreprise.
 */
@Controller('telephony')
@UseGuards(JwtGuard)
export class TelephonyController {
  constructor(
    private readonly telephony: TelephonyService,
    private readonly configService: ConfigService,
  ) {}

  @Get('status')
  status(@CurrentUser() user: CurrentUserPayload): Promise<TelephonyStatus> {
    return this.telephony.status(user.userId)
  }

  @Post('connect')
  @HttpCode(200)
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('integrations:manage')
  connect(@CurrentUser() user: CurrentUserPayload, @Body() dto: TelephonyConnectDto): Promise<TelephonyStatus> {
    return this.telephony.connect(user.userId, dto)
  }

  @Post('test')
  @HttpCode(200)
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('integrations:manage')
  test(@CurrentUser() user: CurrentUserPayload): Promise<{ reachable: boolean }> {
    return this.telephony.test(user.userId)
  }

  @Delete()
  @HttpCode(204)
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('integrations:manage')
  async disconnect(@CurrentUser() user: CurrentUserPayload): Promise<void> {
    await this.telephony.disconnect(user.userId)
  }

  /** Les appels récents — l'historique qui prépare le prochain rendez-vous. */
  @Get('calls')
  async calls(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: TelephonyCallsQueryDto,
  ): Promise<ConnectorSearchResult<CallRecord>> {
    // Qualifiée : un standard sans appel sur la fenêtre et un standard qu'on
    // n'a pas pu interroger rendaient tous deux `[]`.
    return connectorSearchResult(
      await this.telephony.listRecentCalls(user.userId, { days: query.days, limit: query.limit }),
    )
  }

  /**
   * #4016 L12 — l'analyse d'UN appel (résumé, décisions, suites, objections).
   * Refusée tant que l'espace n'a pas déclaré que l'enregistrement est annoncé
   * (403) ; calculée à la demande, jamais stockée. Même permission que lire les
   * appels vers le CRM : on y expose le contenu d'une conversation.
   */
  @Post('calls/:callId/analysis')
  @HttpCode(200)
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('data:export')
  analyzeCall(@CurrentUser() user: CurrentUserPayload, @Param('callId') callId: string): Promise<CallAnalysis> {
    return this.telephony.analyzeCall(user.userId, callId)
  }

  /** Verse les appels de la fenêtre en notes sur les fiches du CRM. */
  @Post('log-to-crm')
  @HttpCode(200)
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('data:export')
  logToCrm(@CurrentUser() user: CurrentUserPayload, @Body() dto: TelephonyLogDto): Promise<CallLogOutcome> {
    return this.telephony.logCallsToCrm(user.userId, { days: dto.days })
  }

  /**
   * #2403.12 — (RE)GÉNÈRE le secret du webhook « appel en cours ».
   *
   * Rendu UNE SEULE FOIS dans la réponse : l'ESN le colle dans son
   * automatisation (PBX, Zapier/Make…) qui appelle
   * `POST /webhooks/telephony/:workspaceId`. Même permission que connecter
   * l'outil lui-même : ce secret engage tout l'espace.
   */
  @Post('webhook-secret/rotate')
  @HttpCode(200)
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('integrations:manage')
  rotateWebhookSecret(@CurrentUser() user: CurrentUserPayload): Promise<{ webhookUrl: string; secret: string }> {
    return this.telephony.rotateWebhookSecret(user.userId, this.configService.get<string>('apiPublicUrl'))
  }
}
