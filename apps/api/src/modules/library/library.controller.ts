import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { unwrap } from '@bellum/utils'
import type { LibraryItem } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CreateLibraryItemDto, ListLibraryItemsQueryDto, UpdateLibraryItemDto } from './dto/library.dto'
import { LibraryService, type LibraryFailure } from './library.service'

function throwLibraryFailure(failure: LibraryFailure): never {
  const { code, message, cause } = failure
  switch (code) {
    case 'not_found':
      throw new NotFoundException(message, { cause })
    case 'create_failed':
    case 'update_failed':
    case 'delete_failed':
      throw new BadRequestException(message, { cause })
    default: {
      const _exhaustive: never = code
      throw new BadRequestException(`Unknown library failure code: ${String(_exhaustive)}`)
    }
  }
}

/**
 * Browser-facing CRUD for the workspace knowledge library (templates &
 * playbooks). A team-shared resource: reads are scoped to the caller's active
 * workspace; writes stamp `user_id` from the JWT (never the body). See
 * `agent_docs/multi-user-workspaces.md`.
 */
@Controller('library-items')
@UseGuards(JwtGuard)
export class LibraryController {
  constructor(
    private readonly library: LibraryService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListLibraryItemsQueryDto,
  ): Promise<LibraryItem[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.library.listForWorkspace(workspaceId, user.userId, query.kind)
  }

  @Post()
  async create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateLibraryItemDto): Promise<LibraryItem> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return unwrap(await this.library.create(workspaceId, user.userId, dto), throwLibraryFailure)
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateLibraryItemDto,
  ): Promise<LibraryItem> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return unwrap(await this.library.update(id, workspaceId, dto), throwLibraryFailure)
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    unwrap(await this.library.delete(id, workspaceId), throwLibraryFailure)
  }
}
