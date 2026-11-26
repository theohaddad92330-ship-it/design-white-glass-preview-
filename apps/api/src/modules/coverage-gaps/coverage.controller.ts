import { Controller, Get, NotFoundException, Optional, Param, UseGuards } from '@nestjs/common'
import type { CoverageGapsResponse, MarketRoleFamily } from '@bellum/contracts'
import { isFailure } from '@bellum/utils'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { AccountsService } from '../accounts/accounts.service'
import { JwtGuard } from '../auth/jwt.guard'
import { MarketMemoryService } from '../market-memory/market-memory.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CoverageService } from './coverage.service'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'

/**
 * Zones blanches / coverage gaps (Drive backlog #5). Registered under the
 * `accounts` prefix but in its own module (craft rule 7: independent, removable
 * without touching AccountsModule). The single route is scoped exactly like the
 * other account reads: JWT-guarded, workspace-resolved, and the account's
 * membership in the caller's workspace is verified BEFORE any coverage is
 * computed — an account outside the workspace yields 404, never another team's
 * contacts.
 */
@Controller('accounts')
@UseGuards(JwtGuard)
export class CoverageController {
  constructor(
    private readonly coverage: CoverageService,
    private readonly accounts: AccountsService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly marketMemory: MarketMemoryService,
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

  @Get(':id/coverage-gaps')
  async getCoverageGaps(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<CoverageGapsResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // Ownership gate — same not_found semantics as the rest of the accounts API.
    const account = await this.accounts.findOneForWorkspace(
      id,
      workspaceId,
      await resolveBusinessUnitScope(this.businessUnits, workspaceId, user.userId),
    )
    if (isFailure(account)) {
      throw new NotFoundException(`Account ${id} not found`)
    }
    // PERF (P5, 29/09 — `coverage-gaps` mesuré à 4,4 s) : la couverture (contacts
    // du compte) et la mémoire marché (`observedRoleFamilies`) ne se lisent pas
    // l'une l'autre — elles s'enchaînaient. Et le compte vient déjà d'être lu
    // pour la garde ci-dessus : on lui prête son `raw_analysis` au lieu de le
    // relire (le SQL de la garde n'en retire que `branches`, que la couverture
    // ne lit jamais).
    const [coverage, observed] = await Promise.all([
      this.coverage.computeForAccount(id, workspaceId, { rawAnalysis: account.output.raw_analysis }),
      this.observedRoleFamilies(id, account.output),
    ])
    return { ...coverage, market_role_families_observed: observed }
  }

  /**
   * Les familles de rôles OBSERVÉES autour de ce compte par la mémoire marché
   * (#1610) — `MarketMemoryService.coverageFor` les calcule depuis #1579, et
   * personne ne les lisait jusqu'à ce lot.
   *
   * ⚠️ **Pourquoi ici et pas dans `CoverageService`.** La première écriture de
   * ce lot injectait `MarketMemoryService` dans le service, et GA-07 l'a
   * refusée : le cliquet des frontières de modules est AU PLAFOND (254), et
   * cette garde dit elle-même où la dépendance doit vivre — « fais
   * l'orchestration dans le contrôleur, c'est là que vit un geste
   * utilisateur ». Le précédent est écrit dans la garde : `oauth`, `projects`
   * et `consultants` prennent la leur au même endroit.
   *
   * Ce n'est pas qu'une question de compte : `computeForAccount` a un SECOND
   * appelant, `OrgEnrichmentPlannerService`, qui n'a que faire de la mémoire
   * marché. La composer ici la garde sur le seul chemin qui l'affiche.
   *
   * Best-effort STRICT, comme `PartnersService.observedEsn` (#1579) : toute
   * impasse — entreprise non résolue, couverture sous le seuil, mémoire en
   * erreur — rend `[]`, et l'onglet Couverture fonctionne exactement comme
   * avant.
   *
   * ⚠️ Ne participe JAMAIS au calcul de la couverture : elle est composée
   * APRÈS, sur un résultat déjà figé, jamais passée en entrée. Le `score` de
   * ce compte reste OCTET IDENTIQUE avec ou sans mémoire marché — c'est la
   * contrainte non négociable de #1610.
   */
  private async observedRoleFamilies(
    accountId: string,
    account: { company_name?: string | null; website?: string | null; registry_country?: string | null },
  ): Promise<MarketRoleFamily[]> {
    if (!account.company_name) return []
    const read = await this.marketMemory.coverageFor({
      ref: accountId,
      name: account.company_name,
      website: account.website ?? null,
      country: account.registry_country ?? null,
    })
    if (read.status !== 'ok' || !read.coverage.covered) return []
    return read.coverage.roleFamilies
  }
}
