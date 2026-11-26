import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type {
  NotificationItem,
  NotificationPreferences,
  PaginatedResult,
  SmsChannelSettings,
  UnreadCount,
} from '@bellum/contracts'
import { type WorkspaceRole } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { PersonalScope } from '../../common/decorator/personal-scope.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import {
  ConfirmSmsVerificationDto,
  ListNotificationsQueryDto,
  StartSmsVerificationDto,
  UpdateNotificationPreferencesDto,
  UpdateSmsTypeOptInsDto,
} from './dto/notifications.dto'
import { NotificationsService } from './notifications.service'
import { TeamInboxDerivedService } from './team/team-inbox-derived.service'
import { SmsChannelService } from './sms/sms-channel.service'

/**
 * Notification preferences + the in-app notification centre. All routes are
 * JWT-guarded and derive the user from the token; RLS is the second line of
 * defence on every table touched here.
 *
 * #1938.4 — décision Louis 13/09 batch 13 : les routes `sms` servent le canal
 * SMS des alertes urgentes, et chacune pose d'abord la question « est-ce une
 * salle de démonstration ? ». Une salle est prêtée à un visiteur différent
 * toutes les trente minutes : un numéro saisi là serait lu par le prospect
 * suivant. Gardé par `demo-sms-channel-coverage.spec.ts`.
 */
@Controller('notifications')
@UseGuards(JwtGuard)
// ⚠️ `@PersonalScope` sur la CLASSE (posé le 13/09/2026 avec les routes SMS,
// #1938.4) : les onze routes de ce contrôleur servent, sans exception, la donnée
// de CELUI QUI APPELLE — ses réglages (`user_id`), son centre de notifications
// (`user_id`, jusqu'au marquage « lu »), son canal SMS (`user_id`). Aucun autre
// membre de l'espace ne voit quoi que ce soit grâce à elles. C'est le cas que
// le marqueur cite lui-même en exemple (« les réglages de notification d'une
// personne ») : GA-05 comptait ces routes comme nues, elles étaient
// DÉCLARABLES, pas oubliées — et un `viewer` doit pouvoir retirer son numéro.
@PersonalScope()
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly sms: SmsChannelService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly teamInbox: TeamInboxDerivedService,
  ) {}

  /**
   * #4158.14 — l'espace ACTIF de l'appelant, ou `null` s'il n'en a aucun : la
   * cloche ne doit jamais casser pour une personne sans espace, elle ne montre
   * alors que ses notifications personnelles.
   */
  private async activeWorkspaceOf(userId: string): Promise<{ workspaceId: string; role: WorkspaceRole } | null> {
    try {
      return await this.workspaceContext.resolveActiveWorkspace(userId)
    } catch {
      return null
    }
  }

  @Get('preferences')
  getPreferences(@CurrentUser() user: CurrentUserPayload): Promise<NotificationPreferences> {
    return this.notifications.getPreferences(user.userId)
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferences> {
    return this.notifications.updatePreferences(user.userId, dto)
  }

  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<PaginatedResult<NotificationItem>> {
    const active = await this.activeWorkspaceOf(user.userId)
    const result = await this.notifications.list(user.userId, query.page, query.size, {
      workspaceId: active?.workspaceId ?? null,
      scope: query.scope,
      personalSpace: active?.role === 'owner',
    })
    // #4158.18 — l'entrée CALCULÉE « des collègues attendent » ouvre la première page.
    if (!active || query.page !== 1) return result
    const derived = await this.teamInbox.entriesFor(user.userId, active.workspaceId, active.role)
    return derived.length === 0 ? result : { ...result, data: [...derived, ...result.data] }
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: CurrentUserPayload): Promise<UnreadCount> {
    const active = await this.activeWorkspaceOf(user.userId)
    const stored = await this.notifications.unreadCount(user.userId, {
      workspaceId: active?.workspaceId ?? null,
      personalSpace: active?.role === 'owner',
    })
    // Une entrée dérivée attend une action de la personne : elle compte tant qu'elle est vraie.
    const derived = active ? await this.teamInbox.entriesFor(user.userId, active.workspaceId, active.role) : []
    return { count: stored + derived.length }
  }

  @Get('sms')
  async getSms(@CurrentUser() user: CurrentUserPayload): Promise<SmsChannelSettings> {
    const isDemo = await this.workspaceContext.isDemoWorkspace(user.userId)
    return this.sms.getSettings(user.userId, isDemo)
  }

  /** La demande de code. Trois par minute au plus : chaque envoi coûte, et le
   *  service impose en plus une minute entre deux codes. */
  @Post('sms/verification')
  @HttpCode(200)
  @Throttle({ 'default-1m': { limit: 3, ttl: 60_000 } })
  async startSmsVerification(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: StartSmsVerificationDto,
  ): Promise<SmsChannelSettings> {
    const isDemo = await this.workspaceContext.isDemoWorkspace(user.userId)
    return this.sms.startVerification(user.userId, dto.phone, isDemo)
  }

  @Post('sms/verification/confirm')
  @HttpCode(200)
  @Throttle({ 'default-1m': { limit: 10, ttl: 60_000 } })
  async confirmSmsVerification(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ConfirmSmsVerificationDto,
  ): Promise<SmsChannelSettings> {
    const isDemo = await this.workspaceContext.isDemoWorkspace(user.userId)
    return this.sms.confirmVerification(user.userId, dto.code, isDemo)
  }

  @Patch('sms')
  async updateSmsTypes(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateSmsTypeOptInsDto,
  ): Promise<SmsChannelSettings> {
    const isDemo = await this.workspaceContext.isDemoWorkspace(user.userId)
    return this.sms.updateTypes(user.userId, dto, isDemo)
  }

  /** « Ne plus recevoir de SMS » — numéro, vérification et choix, en un clic.
   *  Une salle de démonstration n'a jamais de numéro : rien à retirer. */
  @Delete('sms')
  @HttpCode(204)
  async withdrawSms(@CurrentUser() user: CurrentUserPayload): Promise<void> {
    if (await this.workspaceContext.isDemoWorkspace(user.userId)) return
    await this.sms.withdraw(user.userId)
  }

  @Post(':id/read')
  @HttpCode(204)
  async markRead(@CurrentUser() user: CurrentUserPayload, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.notifications.markRead(user.userId, id)
  }

  @Post('read-all')
  @HttpCode(204)
  async markAllRead(@CurrentUser() user: CurrentUserPayload): Promise<void> {
    const active = await this.activeWorkspaceOf(user.userId)
    await this.notifications.markAllRead(user.userId, {
      workspaceId: active?.workspaceId ?? null,
      personalSpace: active?.role === 'owner',
    })
  }

  /** #4648 — « Vider » : supprime pour de bon la boîte que la personne VOIT (même périmètre que « Tout marquer lu »),
   *  jamais celle d'un autre utilisateur ni d'un autre de ses espaces. Même code que la purge hebdomadaire. */
  @Delete()
  @HttpCode(204)
  async clear(@CurrentUser() user: CurrentUserPayload): Promise<void> {
    const active = await this.activeWorkspaceOf(user.userId)
    await this.notifications.clearInbox(user.userId, {
      workspaceId: active?.workspaceId ?? null,
      personalSpace: active?.role === 'owner',
    })
  }
}
