import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { IntroductionAuthorizationItem } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { ContactEntity } from '../../database/entities/contact.entity'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CreateIntroductionAuthorizationDto } from './dto/introduction-authorization.dto'
import { IntroductionAuthorizationService } from './introduction-authorization.service'

/**
 * #2373.9 — la preuve d'autorisation d'une introduction, dans le temps.
 *
 * JWT-guardé ; l'appartenance du contact CIBLE au workspace actif de
 * l'appelant est vérifiée AVANT toute écriture/lecture (404 sinon — jamais le
 * contact d'une autre équipe). `recordedBy` et `workspaceId` viennent
 * TOUJOURS du token, jamais du body.
 */
@Controller('contacts')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class IntroductionAuthorizationController {
  constructor(
    private readonly authorizations: IntroductionAuthorizationService,
    private readonly workspaceContext: WorkspaceContextService,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
  ) {}

  @Post(':id/introduction-authorizations')
  @RequirePermission('records:write')
  async create(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateIntroductionAuthorizationDto,
  ): Promise<{ item: IntroductionAuthorizationItem }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertContactInWorkspace(id, workspaceId)
    const item = await this.authorizations.record({
      workspaceId,
      targetContactId: id,
      referrerContactId: dto.referrerContactId,
      referrerLabel: dto.referrerLabel,
      granted: dto.granted,
      channel: dto.channel,
      text: dto.text,
      scope: dto.scope,
      restrictions: dto.restrictions,
      authorizedAt: dto.authorizedAt,
      recordedBy: user.userId,
      linkKind: dto.linkKind,
      verified: dto.verified,
      warmth: dto.warmth,
    })
    return { item }
  }

  // #3690 RÉFUTÉ (recette prod 07/10 soir : 0 « Relais d'introduction »,
  // même sur un contact qui PORTE une autorisation enregistrée) —
  // `records:write` est une permission d'ÉCRITURE ; posée sur cette LECTURE,
  // elle fermait la route à `viewer` et `tech_admin` (403 silencieux, l'écran
  // ne pouvait pas distinguer « rien enregistré » de « lecture refusée »).
  // Même anti-patron que D39 (`workspace-read.decorator.ts`) : une lecture
  // d'espace n'a rien à déclarer dans la matrice RBAC.
  @Get(':id/introduction-authorizations')
  @WorkspaceRead()
  async list(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ items: IntroductionAuthorizationItem[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertContactInWorkspace(id, workspaceId)
    const items = await this.authorizations.listFor(id, workspaceId)
    return { items }
  }

  private async assertContactInWorkspace(contactId: string, workspaceId: string): Promise<void> {
    const contact = await this.contacts.findOne({ where: { id: contactId, workspace_id: workspaceId } })
    if (!contact) {
      throw new NotFoundException('Contact introuvable dans ce workspace')
    }
  }
}
