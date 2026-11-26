import { Controller, Delete, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { PersonalScope } from '../../common/decorator/personal-scope.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { TalentService } from './talent.service'

/**
 * Théo C talents-vivier.A12 — MES favoris du vivier.
 *
 * Un contrôleur À PART, comme `AccountFavoritesController` : un favori est la donnée de CELUI QUI APPELLE
 * (`user_favorites`, `entity_type = 'talent'`) — aucun autre membre de l'espace n'en voit rien. Il déclare donc
 * `@PersonalScope()` (GA-05), là où `TalentController` sert de la donnée d'ESPACE sous permission. Un lecteur
 * (`viewer`) peut mettre une fiche en favori : exiger `records:write` pour une préférence personnelle serait
 * une faute produit. La fiche doit en revanche être de SON espace — `setFavorite` le vérifie.
 */
@Controller('talents')
@PersonalScope()
@UseGuards(JwtGuard)
export class TalentFavoritesController {
  constructor(
    private readonly talents: TalentService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Post(':id/favorite')
  async add(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ id: string; is_favorite: boolean }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { id, is_favorite: await this.talents.setFavorite(workspaceId, user.userId, id, true) }
  }

  @Delete(':id/favorite')
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ id: string; is_favorite: boolean }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { id, is_favorite: await this.talents.setFavorite(workspaceId, user.userId, id, false) }
  }
}
