import type {
  BeeperChatMessagesResponse,
  BeeperConversationsResponse,
  BeeperSendResult,
  BeeperStatus,
} from '@bellum/contracts'
import { Body, Controller, Delete, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { PersonalScope } from '../../common/decorator/personal-scope.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { readBeeperConfig } from './beeper-config'
import { BeeperRegisterDto, BeeperSendDto } from './beeper.dto'
import { BeeperService, type BeeperDisconnectResult } from './beeper.service'

/**
 * #4406 — Beeper Desktop de l'utilisateur. Toutes les routes sont gardées par JWT, sauf `callback`
 * (redirection navigateur depuis Beeper : authentifiée par l'état signé, comme Salesforce).
 *
 * Le branchement est PERSONNEL (Beeper tourne sur le poste de l'utilisateur) : aucune permission
 * d'espace, chacun ne lit et n'écrit que SA connexion (`@PersonalScope`, GA-05). Aucune réponse ne
 * porte un jeton.
 */
@PersonalScope()
@Controller('beeper')
export class BeeperController {
  constructor(private readonly beeper: BeeperService) {}

  @Get('status')
  @UseGuards(JwtGuard)
  status(@CurrentUser() user: CurrentUserPayload): Promise<BeeperStatus> {
    return this.beeper.getStatus(user.userId)
  }

  @Post('connect')
  @UseGuards(JwtGuard)
  connect(@CurrentUser() user: CurrentUserPayload, @Body() dto: BeeperRegisterDto): Promise<{ url: string }> {
    return this.beeper.register(user.userId, dto)
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl = readBeeperConfig()?.frontendUrl ?? process.env['FRONTEND_URL'] ?? 'http://localhost:3000'
    const back = (params: string) => res.redirect(`${frontendUrl}/integrations?${params}`)
    if (!code || !state) return back('beeper=error&reason=missing_code')
    const result = await this.beeper.handleCallback(code, state)
    return result.ok ? back('beeper=connected') : back(`beeper=error&reason=${result.reason ?? 'unknown'}`)
  }

  @Delete()
  @UseGuards(JwtGuard)
  disconnect(@CurrentUser() user: CurrentUserPayload): Promise<BeeperDisconnectResult> {
    return this.beeper.disconnect(user.userId)
  }

  /** Lecture EN DIRECT, à l'ouverture de Messagerie — rien n'est conservé (c96). */
  @Get('conversations')
  @UseGuards(JwtGuard)
  conversations(@CurrentUser() user: CurrentUserPayload): Promise<BeeperConversationsResponse> {
    return this.beeper.listConversations(user.userId)
  }

  @Get('chats/:chatId/messages')
  @UseGuards(JwtGuard)
  messages(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chatId') chatId: string,
  ): Promise<BeeperChatMessagesResponse> {
    return this.beeper.readOwnChat(user.userId, chatId)
  }

  /** #4406.3 — L'ENVOI : un clic de l'utilisateur sur un texte relu, par la porte d'écriture. */
  @Post('chats/:chatId/send')
  @UseGuards(JwtGuard)
  send(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chatId') chatId: string,
    @Body() dto: BeeperSendDto,
  ): Promise<BeeperSendResult> {
    return this.beeper.sendReply(user.userId, chatId, dto)
  }
}
