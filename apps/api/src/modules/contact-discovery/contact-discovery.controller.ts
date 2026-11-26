import { Body, Controller, NotFoundException, Param, Post, UseGuards } from '@nestjs/common'
import { discoveryTitlesFor } from '@bellum/contracts'
import { isFailure } from '@bellum/utils'
import { AccountEntity } from '../../database/entities/account.entity'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { AccountsService } from '../accounts/accounts.service'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'
import { CreditsService } from '../credits/credits.service'
import { ContactDiscoveryQuoteDto, ContactDiscoveryRunDto } from './dto/contact-discovery.dto'
import { ContactDiscoveryService } from './contact-discovery.service'

/**
 * #2809 (#2293.11, #2294.*) — découverte FRAÎCHE de contacts sur la
 * sélection de comptes de `/accounts` : le devis (lecture, rien débité) puis
 * l'exécution compte par compte (l'écran boucle, comme
 * `RefreshContactsDialog`/`AnalyzeBatchDialog`).
 *
 * `records:write` sur les deux routes : le devis lit la même chose qu'une
 * exécution regarderait, et n'a de sens que pour qui peut lancer — même
 * raison que `AnalysisBatchesController.preview` (`analysis:run`).
 */
@Controller('contacts/discover')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class ContactDiscoveryController {
  constructor(
    private readonly discovery: ContactDiscoveryService,
    private readonly accountsService: AccountsService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly businessUnits: BusinessUnitService,
    private readonly credits: CreditsService,
  ) {}

  private async scope(userId: string) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return { workspaceId, businessUnitScope: await resolveBusinessUnitScope(this.businessUnits, workspaceId, userId) }
  }

  /**
   * Résout la sélection dans le périmètre de l'appelant — un identifiant hors
   * de son workspace/BU est SILENCIEUSEMENT écarté ici (même discipline que
   * `deepenQuote`), jamais résolu par une lecture non scopée : une ligne
   * absente du devis vaut mieux qu'un compte d'un autre espace atteint.
   */
  private async resolveAccounts(accountIds: string[], userId: string) {
    const { workspaceId, businessUnitScope } = await this.scope(userId)
    const accounts: AccountEntity[] = []
    for (const accountId of new Set(accountIds)) {
      const scoped = await this.accountsService.findOneForWorkspace(accountId, workspaceId, businessUnitScope)
      if (!isFailure(scoped)) accounts.push(scoped.output)
    }
    return accounts
  }

  @Post('quote')
  @RequirePermission('records:write')
  async quote(@Body() dto: ContactDiscoveryQuoteDto, @CurrentUser() user: CurrentUserPayload) {
    const accounts = await this.resolveAccounts(dto.accountIds, user.userId)
    const { credits_remaining } = await this.credits.getCredits(user.userId)
    return this.discovery.quote(accounts, credits_remaining)
  }

  @Post(':accountId')
  @RequirePermission('records:write')
  async run(
    @Param('accountId') accountId: string,
    @Body() dto: ContactDiscoveryRunDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId, businessUnitScope } = await this.scope(user.userId)
    const scoped = await this.accountsService.findOneForWorkspace(accountId, workspaceId, businessUnitScope)
    if (isFailure(scoped)) throw new NotFoundException('Compte introuvable.')
    // Résolu ICI, avant tout appel au service — « aucun appel réseau en
    // démo » (même garantie que `ContactsService.enrichContact`).
    const isDemo = await this.workspaceContext.isDemoWorkspace(user.userId)
    // #4058 — expertise et intitulés nommés ; le secteur et le périmètre ne filtrent pas.
    return this.discovery.run(scoped.output, user.userId, discoveryTitlesFor(dto), isDemo)
  }
}
