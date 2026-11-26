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
  Put,
  UseGuards,
} from '@nestjs/common'
import type { SignalStatesResponse, WatchesResponse } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { PersonalScope } from '../../common/decorator/personal-scope.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { SignalStateDto, WatchDto, WatchStateDto } from './signal-library.dto'
import { SignalLibraryService } from './signal-library.service'

/**
 * Théo A signaux — la bibliothèque d'informations par compte (`/signals`) et ses veilles (`/signals/watches`).
 *
 * `@PersonalScope`, comme `AccountFollowsController` : chaque route porte le `userId` du jeton et le service ne lit ni
 * n'écrit jamais l'état d'un autre. Enregistrer un signal ou régler sa veille ne modifie aucune donnée d'espace.
 */
@Controller()
@PersonalScope()
@UseGuards(JwtGuard)
export class SignalLibraryController {
  constructor(
    private readonly library: SignalLibraryService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Get('signal-states')
  async states(@CurrentUser() user: CurrentUserPayload): Promise<SignalStatesResponse> {
    return this.library.listStates(user.userId)
  }

  @Put('signal-states')
  async setStates(@Body() body: SignalStateDto, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.library.setStates(user.userId, workspaceId, body)
  }

  @Get('signal-watches')
  async watches(@CurrentUser() user: CurrentUserPayload): Promise<WatchesResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.library.listWatches(user.userId, workspaceId, new Date().toISOString().slice(0, 10))
  }

  @Post('signal-watches')
  async createWatch(@Body() body: WatchDto, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.library.createWatch(user.userId, workspaceId, body)
  }

  @Patch('signal-watches/:id')
  @HttpCode(204)
  async updateWatch(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: WatchDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.library.updateWatch(user.userId, workspaceId, id, body)
  }

  @Patch('signal-watches/:id/state')
  @HttpCode(204)
  async setWatchState(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: WatchStateDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    await this.library.setWatchState(user.userId, id, body.state)
  }

  /** « Supprimer une veille conserve les informations déjà collectées » : la veille est archivée, les signaux ne bougent pas. */
  @Delete('signal-watches/:id')
  @HttpCode(204)
  async archiveWatch(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    await this.library.archiveWatch(user.userId, id)
  }
}
