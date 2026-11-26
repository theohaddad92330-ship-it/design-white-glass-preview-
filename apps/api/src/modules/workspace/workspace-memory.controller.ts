import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import type { MemoryBridgeAccountList, MemoryBridgeView } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RecordBridgeContactDto } from './dto/workspace-memory.dto'
import { RequirePermission } from './require-permission.decorator'
import { WorkspaceMemoryCrossingsService } from './workspace-memory-crossings.service'
import { WorkspacePermissionGuard } from './workspace-permission.guard'

/**
 * LA MÉMOIRE COLLECTIVE — « le pont, pas le dossier ».
 *
 * Un contrôleur À PART plutôt que trois routes de plus sur
 * `WorkspaceController` : le retirer retire la mémoire collective et rien
 * d'autre (règle #7 du dépôt). Il vit dans le module `workspace` parce que le
 * croisement est un objet d'ESPACE, et que `resolveActiveWorkspace` est ce qui
 * le borne.
 *
 * ⚠️ `workspaceId` n'est **jamais** un paramètre. Ni dans l'URL, ni dans le
 * corps, ni dans un en-tête : il est résolu côté serveur depuis le JWT. Le
 * premier invariant de la spec sécurité — « workspace isolation is
 * non-negotiable » — ne peut pas être tenu par une route qui accepterait qu'on
 * lui dise quel espace lire.
 */
@Controller('workspaces/memory')
@UseGuards(JwtGuard)
export class WorkspaceMemoryController {
  constructor(private readonly crossings: WorkspaceMemoryCrossingsService) {}

  /**
   * Les comptes sur lesquels l'espace a de la matière — l'écran d'arrivée.
   *
   * `@WorkspaceRead()` et non une permission : c'est une LECTURE, et le marqueur
   * dit qu'on y a pensé (GA-05). Ce qui la protège réellement est le `JwtGuard`,
   * la résolution serveur de l'espace actif et le `workspace_id = $1` de chaque
   * requête — un marqueur n'ouvre aucune porte.
   */
  @Get('accounts')
  @WorkspaceRead()
  listAccounts(@CurrentUser() user: CurrentUserPayload): Promise<MemoryBridgeAccountList> {
    return this.crossings.listAccounts(user.userId)
  }

  /** Ce que l'espace sait déjà de ce compte : les croisements, la politique, la mesure. */
  @Get('accounts/:accountId')
  @WorkspaceRead()
  view(
    @CurrentUser() user: CurrentUserPayload,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
  ): Promise<MemoryBridgeView> {
    return this.crossings.view(user.userId, accountId)
  }

  /**
   * « J'ai contacté ce collègue » — la seule écriture de la mémoire collective.
   *
   * ⚠️ Gardée par `records:write`, et le choix mérite sa phrase : c'est la
   * permission qui signifie « ce siège ÉCRIT dans les fiches partagées de
   * l'espace ». Un `viewer`, qui ne porte aucune permission, est refusé — et
   * c'est juste : il regarde, il ne laisse pas de trace au nom de l'espace. Un
   * `tech_admin` (sièges d'intégrations) et un `finance` ne portent pas non plus
   * ce geste, qui est commercial.
   *
   * ⚠️ Elle n'écrit qu'une trace. Elle ne réattribue rien, ne fusionne rien,
   * n'envoie rien : « aucune réattribution automatique » n'est pas un réglage
   * laissé sur OFF, c'est l'absence du code qui la ferait.
   */
  @Post('bridges/contact')
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('records:write')
  recordContact(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RecordBridgeContactDto,
  ): Promise<{ recorded: boolean }> {
    return this.crossings.recordContact(user.userId, dto)
  }
}
