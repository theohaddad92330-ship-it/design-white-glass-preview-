import { Controller, Delete, NotFoundException, Optional, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { unwrap } from '@bellum/utils'
import type { AccountFavoriteState } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { PersonalScope } from '../../common/decorator/personal-scope.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { AccountsService } from './accounts.service'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'

/**
 * #2150.14/.18 — LE FAVORI DE COMPTE, RÉTABLI (revirement assumé de #1800,
 * 09/09/2026 → retour bêta #2150, Louis 15/09/2026).
 *
 * `@PersonalScope`, pas `@RequirePermission` : la question que le décorateur
 * pose — *un autre membre de l'espace pourrait-il voir quelque chose grâce à
 * cette route ?* — a ici une réponse nette. NON : chaque route porte le
 * `userId` du jeton, et le service ne lit ni n'écrit jamais la ligne d'un
 * autre (`UserFavoriteEntity`, clé primaire `user_id, entity_type,
 * entity_id`). Imposer `records:write` interdirait le geste à un `viewer`
 * pour une écriture qui ne modifie AUCUNE donnée d'espace — même raisonnement
 * que l'ancien `FavoritesController` avant #1800.
 *
 * Contrôleur SÉPARÉ de `AccountsController` (même préfixe `accounts`, routes
 * disjointes) : `accounts.controller.ts` mélange lectures d'espace et
 * écritures `records:write`, et son cliquet GA-05 compte les routes NUES une
 * par une (`endpoint-guards.spec.ts`) — y ajouter `@PersonalScope` aurait
 * exempté le fichier ENTIER, effaçant les onze routes déjà comptées comme
 * dette. Un fichier neuf, lui, se déclare proprement dès sa création.
 */
@Controller('accounts')
@PersonalScope()
@UseGuards(JwtGuard)
export class AccountFavoritesController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly workspaceContext: WorkspaceContextService,
    /**
     * LE CLOISONNEMENT DE PÉRIMÈTRE (BU / agence) — revue sécurité 15/09/2026.
     *
     * `@Optional()` et en DERNIÈRE position : des specs construisent ce
     * contrôleur POSITIONNELLEMENT, et un paramètre requis ajouté au milieu les
     * casserait toutes. ⚠️ Optionnel pour le CONSTRUCTEUR, jamais pour la
     * RÈGLE : absent, `resolveBusinessUnitScope` LÈVE au lieu de servir tout
     * l'espace.
     */
    @Optional() private readonly businessUnits?: BusinessUnitService,
  ) {}

  /**
   * `findOneForWorkspace` garde le workspace AVANT toute écriture : un compte
   * hors de l'espace actif de l'appelant répond 404, jamais un favori posé
   * sur un objet qu'il ne peut même pas lire.
   */
  private async assertVisible(id: string, workspaceId: string, userId: string): Promise<void> {
    // ⚠️ Et le PÉRIMÈTRE, pas seulement l'espace (revue sécurité 15/09/2026) :
    // sans lui, un membre cloisonné posait un favori sur un compte d'une autre
    // agence — c'est-à-dire écrivait sur un objet que sa liste lui cache.
    unwrap(
      await this.accountsService.findOneForWorkspace(
        id,
        workspaceId,
        await resolveBusinessUnitScope(this.businessUnits, workspaceId, userId),
      ),
      failure => {
        throw new NotFoundException(failure.message)
      },
    )
  }

  @Post(':id/favorite')
  async add(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AccountFavoriteState> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertVisible(id, workspaceId, user.userId)
    const is_favorite = await this.accountsService.setAccountFavorite(user.userId, id, true)
    return { id, is_favorite }
  }

  @Delete(':id/favorite')
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AccountFavoriteState> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertVisible(id, workspaceId, user.userId)
    const is_favorite = await this.accountsService.setAccountFavorite(user.userId, id, false)
    return { id, is_favorite }
  }
}
