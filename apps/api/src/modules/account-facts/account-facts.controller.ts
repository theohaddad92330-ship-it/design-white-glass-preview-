import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common'
import {
  buildAccountFactsBrief,
  type AccountFactsBrief,
  type KnownPeople,
  type SignalRecurrence,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { AccountFactsService } from './account-facts.service'

/**
 * #4072.3 — la fiche de préparation de RDV : affaires passées, missions, besoins
 * récurrents, derniers échanges (métadonnées). UNE lecture, par le lecteur
 * unique des faits du compte — jamais un second. Donnée d'espace en lecture
 * seule (`@WorkspaceRead`, même raisonnement que `crm/accounts/:id/signals`) ;
 * les documents personnels d'un membre ne servent qu'à lui, et la fiche n'en
 * porte aucun.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Une Watchlist porte quelques centaines de cibles ; au-delà, la lecture se tait plutôt que de gonfler. */
const RECURRENCE_MAX_ACCOUNTS = 300

@Controller('account-facts')
@UseGuards(JwtGuard)
export class AccountFactsController {
  constructor(
    private readonly facts: AccountFactsService,
    private readonly workspace: WorkspaceContextService,
  ) {}

  /**
   * #4072.4 — la récurrence d'un signal pour TOUTES les cibles de la Watchlist, en UNE requête HTTP et
   * deux requêtes SQL (lecteur par lot). `ids` : identifiants séparés par des virgules, dédoublonnés,
   * non-UUID écartés, bornés. Un compte sans récurrence n'a pas de clé.
   */
  @Get('recurrence')
  @WorkspaceRead()
  async recurrence(
    @CurrentUser() user: CurrentUserPayload,
    @Query('ids') ids?: string,
  ): Promise<{ recurrences: Record<string, SignalRecurrence> }> {
    const { workspaceId } = await this.workspace.resolveActiveWorkspace(user.userId)
    const accountIds = [...new Set((ids ?? '').split(',').map(id => id.trim()))]
      .filter(id => UUID.test(id))
      .slice(0, RECURRENCE_MAX_ACCOUNTS)
    return { recurrences: await this.facts.recurrenceForAccounts({ workspaceId, accountIds }) }
  }

  @Get(':accountId/brief')
  @WorkspaceRead()
  async brief(
    @CurrentUser() user: CurrentUserPayload,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
  ): Promise<AccountFactsBrief> {
    const { workspaceId } = await this.workspace.resolveActiveWorkspace(user.userId)
    const read = await this.facts.forAccount({ workspaceId, userId: user.userId, accountId })
    if (!read) throw new NotFoundException()
    return buildAccountFactsBrief(read.asOf, read.facts)
  }

  /**
   * #4072.1 — les personnes que l'espace connaît déjà chez ce compte (contacts du
   * CRM, interlocuteurs de missions passées) : l'organigramme les marque et les
   * passe devant. Même lecteur, même cloisonnement.
   */
  @Get(':accountId/known-people')
  @WorkspaceRead()
  async knownPeople(
    @CurrentUser() user: CurrentUserPayload,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
  ): Promise<KnownPeople> {
    const { workspaceId } = await this.workspace.resolveActiveWorkspace(user.userId)
    const known = await this.facts.knownPeople({ workspaceId, accountId })
    if (!known) throw new NotFoundException()
    return known
  }
}
