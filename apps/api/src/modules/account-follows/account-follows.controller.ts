import {
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { unwrap } from '@bellum/utils'
import type { AccountFollowsResponse } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { PersonalScope } from '../../common/decorator/personal-scope.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { AccountsService } from '../accounts/accounts.service'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { AccountFollowsService } from './account-follows.service'

/**
 * #4267 — « Suivre » / « Ne plus suivre » un compte, et ce que /mes-cibles en montre.
 *
 * `@PersonalScope`, même raisonnement que `AccountFavoritesController` : chaque route porte le `userId`
 * du jeton, le service ne lit ni n'écrit jamais la ligne d'un autre. Suivre un compte ne modifie AUCUNE
 * donnée d'espace (le statut commercial reste intact), donc un `viewer` peut suivre.
 */
@Controller()
@PersonalScope()
@UseGuards(JwtGuard)
export class AccountFollowsController {
  constructor(
    private readonly follows: AccountFollowsService,
    private readonly accountsService: AccountsService,
    private readonly workspaceContext: WorkspaceContextService,
    // Optionnel pour le CONSTRUCTEUR, jamais pour la RÈGLE : absent, `resolveBusinessUnitScope` LÈVE.
    @Optional() private readonly businessUnits?: BusinessUnitService,
  ) {}

  @Get('account-follows')
  async list(@CurrentUser() user: CurrentUserPayload): Promise<AccountFollowsResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.follows.list(user.userId, workspaceId)
  }

  /** 4267.4 — la notice de reprise est lue : elle ne revient plus. */
  @Post('account-follows/migration-notice/seen')
  @HttpCode(204)
  async migrationNoticeSeen(@CurrentUser() user: CurrentUserPayload): Promise<void> {
    await this.follows.acknowledgeMigrationNotice(user.userId)
  }

  /** Un compte hors de l'espace actif (ou du périmètre BU) de l'appelant répond 404 : on ne suit pas ce qu'on ne peut lire. */
  @Post('accounts/:id/follow')
  async follow(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    unwrap(
      await this.accountsService.findOneForWorkspace(
        id,
        workspaceId,
        await resolveBusinessUnitScope(this.businessUnits, workspaceId, user.userId),
      ),
      failure => {
        throw new NotFoundException(failure.message)
      },
    )
    return this.follows.follow(user.userId, workspaceId, id)
  }

  /** Ne plus suivre sa PROPRE ligne n'exige pas de relire le compte : on peut toujours arrêter de payer sa veille. */
  @Delete('accounts/:id/follow')
  async unfollow(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.follows.unfollow(user.userId, id)
  }
}
