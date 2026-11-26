import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import {
  ESN_SUGGEST_DEFAULT_LIMIT,
  declareEsnSubcontractingSchema,
  territoryCommuneSchema,
  territoryCompanyLookupSchema,
  territoryRequestSchema,
  type EsnDirectorySuggestResponse,
  type EsnSubcontractingDeclarationResult,
  type TerritoryCommune,
  type TerritoryCompanyRecord,
  type TerritoryOverview,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { MarketData } from '../../common/decorator/market-data.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { IaClient } from '../ia/ia.client'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { EsnDirectoryService } from './esn-directory.service'
import { withOverflowScores } from './territory-overflow'

class TerritoryRequestDto extends createZodDto(territoryRequestSchema) {}
class DeclareSubcontractingDto extends createZodDto(declareEsnSubcontractingSchema) {}

/**
 * L'écran Territoire (tome 4, `BEL-DATA-004`).
 *
 * L'orchestration vit dans un CONTRÔLEUR et non dans un service : elle croise
 * le référentiel ESN (notre table) et quatre sources publiques (le service IA),
 * et c'est exactement la couche où un geste utilisateur traverse plusieurs
 * domaines — la règle §3.2 vise le service, pas le contrôleur.
 *
 * `@MarketData` plutôt qu'une permission : rien de ce que rendent LES DEUX
 * LECTURES ci-dessous n'appartient à un espace — registre public, offres
 * publiées, marchés publics, référentiel ESN mutualisé. La permission qu'il
 * faudrait inventer serait accordée à tous les rôles, `viewer` compris, et ne
 * garderait donc rien. C'est pourquoi le marqueur est posé par ROUTE et non
 * plus par CLASSE depuis le 30/08/2026 (N16) : la déclaration de sous-
 * traitance ci-dessous ÉCRIT une ligne attribuée à l'espace appelant — elle
 * n'est plus « la donnée de personne », et `@MarketData` au niveau classe
 * aurait menti sur elle exactement comme le docblock du décorateur le prévient.
 */
@Controller('territory')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class TerritoryController {
  constructor(
    private readonly directory: EsnDirectoryService,
    private readonly ia: IaClient,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /**
   * Ce que le référentiel couvre AUJOURD'HUI — le chiffre que l'écran affiche
   * à côté de sa liste. « 312 ESN résolues sur 477 » vaut mieux qu'une liste
   * courte qu'on lirait comme un territoire vide.
   */
  @MarketData()
  @Get('coverage')
  async coverage(): Promise<{ total: number; resolved: number; byStatus: Record<string, number> }> {
    await this.directory.ensureSeeded()
    return this.directory.coverage()
  }

  @MarketData()
  @Post('overview')
  async overview(@Body() dto: TerritoryRequestDto): Promise<TerritoryOverview> {
    await this.directory.ensureSeeded()
    // Les noms d'ESN CONNUS voyagent normalisés : c'est ce qui permet au
    // service IA de reconnaître une ESN dans une offre d'emploi sans résoudre
    // chaque employeur au registre — un appel par entreprise et par
    // consultation d'écran serait intenable, et coûterait à tout le monde.
    const known = await this.directory.knownNames()
    // La MAILLE traverse telle quelle : ville (code INSEE) ou cercle (point +
    // rayon). Aucune valeur par défaut n'est posée ici — un rayon deviné
    // rendrait un cercle que personne n'a demandé, et le service IA est seul
    // juge de ce qu'il sait faire à chaque maille.
    const overview = await this.ia.territoryOverview({
      department: dto.department,
      sinceDays: dto.sinceDays ?? 90,
      knownEsnNames: known,
      ...(dto.communeCode ? { communeCode: dto.communeCode } : {}),
      ...(dto.communeName ? { communeName: dto.communeName } : {}),
      ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
      ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
      ...(dto.radiusKm !== undefined ? { radiusKm: dto.radiusKm } : {}),
    })
    return withOverflowScores(overview, this.directory)
  }

  /**
   * Les communes proposées par le champ « ville ».
   *
   * `@MarketData` comme ses voisines : le découpage administratif n'appartient
   * à personne. Ce n'est pas une donnée d'espace, c'est le COG de l'INSEE.
   *
   * La réponse est VALIDÉE avant de partir : une commune sans coordonnées ne
   * peut pas ancrer un rayon, et la proposer produirait un choix qui échoue au
   * clic suivant. Ce qui ne se valide pas est écarté, jamais complété.
   */
  @MarketData()
  @Get('communes')
  async communes(@Query('q') q?: string, @Query('limit') limit?: string): Promise<{ communes: TerritoryCommune[] }> {
    const query = (q ?? '').trim()
    // Sous deux caractères, la recherche rendrait un échantillon arbitraire de
    // plusieurs milliers de communes. Aucun appel ne part.
    if (query.length < 2) return { communes: [] }
    const parsed = Number.parseInt(limit ?? '', 10)
    const bounded = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 10) : 8
    const response = await this.ia.territoryCommunes({ q: query, limit: bounded })
    const communes: TerritoryCommune[] = []
    for (const raw of response.communes ?? []) {
      const result = territoryCommuneSchema.safeParse(raw)
      if (result.success) communes.push(result.data)
    }
    return { communes }
  }

  /**
   * #1887 — CE QUE NOTRE PROPRE RÉFÉRENTIEL PROPOSE POUR UNE SAISIE PARTIELLE.
   *
   * « je mets cap… ça nous met Capgemini et tout, où ça nous en suggère, que ce
   * soit plus organique ». La liste des 477 ESN était déjà là ; il fallait en
   * connaître l'orthographe exacte pour déclarer une ESN en place sur un compte.
   *
   * `@MarketData` pour la même raison que les deux lectures voisines :
   * `esn_directory` ne porte aucun `workspace_id`, il est PARTAGÉ entre tous les
   * espaces (D62), et rien ici ne lit l'espace appelant. La permission qu'il
   * faudrait inventer serait accordée à tous les rôles, `viewer` compris.
   *
   * La même forme que `GET territory/communes` juste au-dessus — deux
   * suggestions du même contrôleur ne se répondent pas de deux façons : sous
   * deux caractères aucune requête ne part, et la borne est ramenée dans
   * [1, 10].
   */
  @MarketData()
  @Get('esn/suggest')
  async suggestEsn(@Query('q') q?: string, @Query('limit') limit?: string): Promise<EsnDirectorySuggestResponse> {
    const parsed = Number.parseInt(limit ?? '', 10)
    const bounded = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 10) : ESN_SUGGEST_DEFAULT_LIMIT
    // ⚠️ Le service décide seul si la frappe est assez longue — le minimum vit
    // dans le contrat (`ESN_SUGGEST_MIN_QUERY_LENGTH`), pas recopié ici : un
    // réglage vit à un seul endroit, et un second seuil en dur divergerait du
    // web au premier changement.
    return { suggestions: await this.directory.suggest(q ?? '', bounded) }
  }

  /**
   * La fiche de REGISTRE d'une entreprise du territoire — gratuite, sans crédit.
   *
   * `@MarketData` : le registre des entreprises n'appartient à personne, et rien
   * ici ne lit l'espace appelant. C'est la même nature que les blocs voisins.
   *
   * ⚠️ La réponse est VALIDÉE avant de partir, et un échec de validation rend
   * `company: null` avec sa raison — jamais une fiche à moitié remplie dont
   * l'écran ne saurait pas quels champs croire.
   */
  @MarketData()
  @Get('company')
  async company(
    @Query('name') name?: string,
  ): Promise<{ company: TerritoryCompanyRecord | null; reason: string | null }> {
    const cleaned = (name ?? '').trim()
    if (cleaned.length < 2) return { company: null, reason: 'empty_query' }
    const response = await this.ia.companyRegistryRecord(cleaned)
    const parsed = territoryCompanyLookupSchema.safeParse(response)
    if (!parsed.success) return { company: null, reason: 'unreadable' }
    return { company: parsed.data.company, reason: parsed.data.reason ?? null }
  }

  /**
   * Un espace déclare qu'une ESN du référentiel accepte le rang 2 (N16,
   * §16.8). Geste d'utilisateur = auto-approuvé, comme « suivre un
   * département » sur `MarketWatchController` — le clic EST la décision, et
   * `records:write` est le même plancher que ce contrôleur voisin pose déjà
   * pour un écrit qui engage l'espace sans lire ses comptes ni ses marges.
   *
   * ⚠️ Pas de fiche partenaire pour porter ce geste à l'écran aujourd'hui —
   * dette assumée (chantier N16) : la route et son test existent, l'écran non.
   */
  @RequirePermission('records:write')
  @Post('esn/subcontracting')
  async declareSubcontracting(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: DeclareSubcontractingDto,
  ): Promise<EsnSubcontractingDeclarationResult> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.directory.declareSubcontracting(workspaceId, dto.esnName, {
      value: dto.value,
      confidence: dto.confidence,
      evidence: dto.evidence ?? null,
    })
  }
}
