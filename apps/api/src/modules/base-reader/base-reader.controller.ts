import { Body, Controller, Optional, Post, UseGuards } from '@nestjs/common'
import type { BaseReaderResult } from '@bellum/contracts'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { BaseReaderIdentityDto } from './dto/base-reader-identity.dto'
import { BaseReaderSearchDto } from './dto/base-reader-search.dto'
import { baseReaderCriteriaOf } from './base-reader.criteria'
import { BaseReaderService, type BaseReaderIdentity } from './base-reader.service'

/**
 * #4792 (épopée #4791) — LA PORTE INTERNE DU LECTEUR COMMUN.
 *
 * Le service IA l'emprunte comme il emprunte les vingt-cinq autres `internal/copilot/*`
 * (`apps/ia/app/services/bellum_api.py`) ; l'API, elle, appelle `BaseReaderService` directement en
 * TypeScript (chemin Découvrir, `DiscoverSourcesService`). Une seule lecture, deux chemins d'accès.
 *
 * ⚠️ CONTRÔLEUR À PART, et pour la même raison que `CopilotAccountsSearchController` : le PÉRIMÈTRE.
 * L'espace actif et la Business Unit de l'appelant se résolvent ICI, au bord, et descendent ENTIERS
 * jusqu'à la requête. `resolveBusinessUnitScope` est fail-closed : sans le service de périmètre, on
 * LÈVE (503) — le repli « pas de service, donc pas de filtre » ouvrirait l'espace entier sans qu'aucun
 * écran ne change d'apparence.
 *
 * ⚠️ Lecture seule, et ZÉRO CRÉDIT : relire ce qui est déjà stocké ne débite rien (doctrine
 * `c145_historique_stocke_se_lit_sans_credit`). Aucune route d'écriture n'existe ici, et aucun appel
 * à une source externe n'est fait — c'est ce qui rend ce lecteur utilisable sans compter.
 */
@Controller('internal/copilot')
@UseGuards(InternalSecretGuard)
export class BaseReaderController {
  constructor(
    private readonly reader: BaseReaderService,
    private readonly workspaceContext: WorkspaceContextService,
    /** Optionnel pour le CONSTRUCTEUR, jamais pour la RÈGLE : absent, on LÈVE. */
    @Optional() private readonly businessUnits?: BusinessUnitService,
  ) {}

  @Post('base/search')
  async search(@Body() dto: BaseReaderSearchDto): Promise<BaseReaderResult> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const businessUnitScope = await resolveBusinessUnitScope(this.businessUnits, workspaceId, dto.userId)
    return this.reader.read({ workspaceId, businessUnitScope }, baseReaderCriteriaOf(dto))
  }

  /**
   * #4419.7 — l'identité (SIREN) d'un employeur nommé par une offre, lue dans NOTRE base : les comptes de l'espace
   * de l'appelant (même périmètre que `base/search`), puis la base commune. ``identity: null`` = inconnu OU ambigu.
   */
  @Post('base/identity')
  async identity(@Body() dto: BaseReaderIdentityDto): Promise<{ identity: BaseReaderIdentity | null }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const businessUnitScope = await resolveBusinessUnitScope(this.businessUnits, workspaceId, dto.userId)
    return { identity: await this.reader.identityByName({ workspaceId, businessUnitScope }, dto.name) }
  }
}
