import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { MessageDraftVersionItem } from '@bellum/contracts'
import { messageDraftChannelSchema } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { ContactEntity } from '../../database/entities/contact.entity'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CreateMessageDraftVersionDto } from './dto/message-draft-version.dto'
import { MessageDraftVersionService } from './message-draft-version.service'

/**
 * #3695.4/.6, #3696 — la trace du brouillon, en base. JWT-guardé ;
 * l'appartenance du contact au workspace actif de l'appelant est vérifiée
 * AVANT toute écriture/lecture (404 sinon — jamais le contact d'une autre
 * équipe). `recordedBy` et `workspaceId` viennent TOUJOURS du token, jamais
 * du body.
 */
@Controller('contacts')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class MessageDraftVersionController {
  constructor(
    private readonly versions: MessageDraftVersionService,
    private readonly workspaceContext: WorkspaceContextService,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
  ) {}

  @Post(':id/message-draft-versions')
  @RequirePermission('records:write')
  async create(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateMessageDraftVersionDto,
  ): Promise<{ item: MessageDraftVersionItem }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertContactInWorkspace(id, workspaceId)
    const item = await this.versions.record({ ...dto, workspaceId, contactId: id, recordedBy: user.userId })
    return { item }
  }

  @Get(':id/message-draft-versions')
  @RequirePermission('records:write')
  async list(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('channel') channel: string,
  ): Promise<{ items: MessageDraftVersionItem[] }> {
    const parsedChannel = messageDraftChannelSchema.safeParse(channel)
    if (!parsedChannel.success) throw new BadRequestException('channel invalide')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertContactInWorkspace(id, workspaceId)
    const items = await this.versions.listFor(id, workspaceId, parsedChannel.data)
    return { items }
  }

  private async assertContactInWorkspace(contactId: string, workspaceId: string): Promise<void> {
    const contact = await this.contacts.findOne({ where: { id: contactId, workspace_id: workspaceId } })
    if (!contact) {
      throw new NotFoundException('Contact introuvable dans ce workspace')
    }
  }
}
