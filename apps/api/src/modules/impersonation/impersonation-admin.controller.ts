import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { Request } from 'express'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { correlationStorage } from '../../correlation-id/correlation-id.store'
import { clientIp } from '../auth/device-cookie'
import { StartImpersonationDto, TerminateImpersonationDto } from './dto/start-impersonation.dto'
import { ImpersonationAuditService } from './impersonation-audit.service'
import type { ImpersonationSession } from './impersonation-sessions'
import { ImpersonationService, type StartImpersonationResult } from './impersonation.service'

/**
 * Admin-only entry point to START an impersonation session. Consumed SERVER-SIDE
 * by the standalone super-admin console (dashboard-manager) exactly like the rest
 * of `internal/admin/*`, behind {@link InternalSecretGuard} — the shared internal
 * secret is the platform-admin credential (the product has no per-admin user
 * accounts). A client `impersonation: true` flag is never trusted: the guard is
 * the only thing that authorises minting a token here, and an impersonation token
 * (aud `bellum:impersonation`) can NEVER satisfy this guard, so re-impersonation
 * is impossible.
 *
 * Returns a web URL (token in the FRAGMENT) the operator opens to enter the
 * read-only impersonation session.
 */
@Controller('internal/admin')
@UseGuards(InternalSecretGuard)
export class ImpersonationAdminController {
  constructor(
    private readonly impersonation: ImpersonationService,
    private readonly audit: ImpersonationAuditService,
  ) {}

  @Post('users/:userId/impersonate')
  @HttpCode(201)
  async start(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: StartImpersonationDto,
    @Req() req: Request,
  ): Promise<StartImpersonationResult> {
    return this.impersonation.start({
      targetUserId: userId,
      reasonCode: dto.reason_code,
      reasonDetail: dto.reason_detail ?? null,
      impersonatorActor: dto.admin_actor,
      ip: clientIp(req),
      correlationId: correlationStorage.getStore()?.correlationId ?? null,
    })
  }

  /**
   * #1665.2 — « aucun GET n'expose les sessions d'impersonation ». Joint
   * `start`/`stop` PAR `jti` (délégué à `ImpersonationAuditService#
   * listSessions`, lui-même appuyé sur `joinImpersonationSessions`, pure et
   * testée sans base) pour dériver Qui · Espace · Début · Durée · Motif.
   */
  @Get('impersonations')
  async listSessions(@Query('limit') limit?: string): Promise<{ sessions: ImpersonationSession[] }> {
    const sessions = await this.audit.listSessions(limit ? Number(limit) : undefined)
    return { sessions }
  }

  /**
   * LUDOVIC-D LC.10 — « Terminer » une session EN COURS depuis la console : une ligne `stop` est
   * AJOUTÉE au journal (date de fin + l'admin qui a terminé) et le jeton est refusé dès la requête
   * suivante. 404 inconnue, 409 déjà terminée ou expirée — rien n'est écrit.
   */
  @Post('impersonations/:jti/terminate')
  @HttpCode(200)
  async terminate(
    @Param('jti', new ParseUUIDPipe()) jti: string,
    @Body() dto: TerminateImpersonationDto,
    @Req() req: Request,
  ): Promise<{ terminated: true }> {
    const result = await this.impersonation.terminate({
      jti,
      adminActor: dto.admin_actor,
      ip: clientIp(req),
      correlationId: correlationStorage.getStore()?.correlationId ?? null,
    })
    if (result === 'not_found') throw new NotFoundException('Session d’incarnation introuvable.')
    if (result === 'not_ongoing') throw new ConflictException('Cette session n’est plus en cours.')
    return { terminated: true }
  }
}
