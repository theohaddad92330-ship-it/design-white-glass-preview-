import { Controller, Get, Logger, Optional, Query, UseGuards } from '@nestjs/common'
import type {
  CompanySearchResponse,
  CompanySuggestion,
  MarketContextSearchRead,
  MarketPathsBatchRead,
  MarketPreview,
  MarketPreviewRead,
  WorkspaceMarket,
} from '@bellum/contracts'
import {
  MARKET_MEMORY_MIN_PATHS,
  MARKET_PREVIEW_MAX_ITEMS,
  isResidualRoleFamily,
  portfolioScopeFor,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { AccountsService } from '../accounts/accounts.service'
import { JwtGuard } from '../auth/jwt.guard'
import type { MarketResolution } from '../market-memory/market-company-resolution'
import { MarketMemoryService } from '../market-memory/market-memory.service'
import { marketPortfolioLookups } from '../market-memory/portfolio-lookups'
import type { MarketCompanyLookup } from '../market-memory/market-memory.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CompaniesService } from './companies.service'
import { MarketContextSearchDto } from './dto/market-context-search.dto'
import { MarketPathsDto } from './dto/market-paths.dto'
import { MarketPreviewDto } from './dto/market-preview.dto'
import { SearchCompaniesDto } from './dto/search-companies.dto'

/**
 * Autocomplete proxy: web → here → IA → Pappers.
 *
 * The web app never sees the Pappers API key (was a `VITE_*` leak in the
 * previous client-side fetch). Quota / rate-limiting happens on the IA side
 * via the shared `pappers` throttle bucket; the global Nest throttler caps
 * abusive callers at 60 req/min.
 */
@Controller('companies')
@UseGuards(JwtGuard)
export class CompaniesController {
  private readonly logger = new Logger(CompaniesController.name)

  constructor(
    private readonly companies: CompaniesService,
    private readonly marketMemory: MarketMemoryService,
    /**
     * #2288.2 — DEUX DÉPENDANCES `@Optional()`, ET C'EST VOULU.
     *
     * Elles ne servent qu'à une chose : savoir QUELS comptes de l'appelant sont
     * les entreprises trouvées, seule façon de dater un signal par ENTREPRISE.
     * Absentes (specs unitaires, module retiré), la recherche rend exactement
     * ce qu'elle rendait avant ce lot — des entreprises SANS date, donc
     * « aucun signal actuel », ce qui est vrai. Une absence d'outillage ne doit
     * pas se rendre comme une absence de fait.
     *
     * L'orchestration est dans le CONTRÔLEUR, jamais dans `CompaniesService` :
     * GA-07 l'a déjà refusée une fois dans ce fichier même (voir `withMarketPaths`),
     * et `copilot-bridge.controller.ts` prend les deux mêmes au même endroit.
     */
    @Optional() private readonly accountsService?: AccountsService,
    @Optional() private readonly workspaceContext?: WorkspaceContextService,
  ) {}

  @Get('search')
  async search(@Query() query: SearchCompaniesDto): Promise<CompanySearchResponse> {
    const res = await this.companies.search(query.q, query.limit, query.country, query.lens)
    return { ...res, suggestions: await this.withMarketPaths(res.suggestions, query.country) }
  }

  /**
   * #1589.2 — CE QUE BELLUM SAIT DÉJÀ, **AVANT** DE DÉPENSER UN CRÉDIT.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * POURQUOI UNE ROUTE DE PLUS, ALORS QUE `GET /accounts/:id/market-context` EXISTE
   * ───────────────────────────────────────────────────────────────────────────
   * Celle-là exige un compte CRM **déjà créé** : elle ouvre par une porte
   * d'appartenance, lit `accounts`, et ne répond donc jamais sur une entreprise
   * qu'on est en train de regarder dans l'autocomplétion. C'est précisément le
   * moment où la question se pose — « est-ce que ça vaut le crédit ? ».
   *
   * Le service, lui, ne bouge pas : `coverageFor` rend depuis #1579 exactement
   * les quatre observations que l'écran de lancement demande. Ce qui manquait
   * n'était pas le calcul, c'était son APPELANT (le défaut n°1 du dépôt).
   *
   * ───────────────────────────────────────────────────────────────────────────
   * ZÉRO CRÉDIT, ET C'EST STRUCTUREL
   * ───────────────────────────────────────────────────────────────────────────
   * Aucun débit, aucune écriture, aucun appel de modèle : une lecture de deux
   * requêtes sur un corpus déjà ingéré. #1589.2 l'exige, et rien ici ne peut le
   * défaire par accident — il n'y a pas de chemin d'écriture à retirer.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * CE QUI NE TRAVERSE PAS, ET QUI LE TIENT
   * ───────────────────────────────────────────────────────────────────────────
   * Noms d'ESN, comptages par technologie, empreinte de zone, dates du corpus :
   * `MarketPreview` ne les porte pas. La réduction vit dans le TYPE
   * (`marketPreviewSchema`, `.strip()`), pas dans le composant — une réduction
   * faite à l'écran s'oublie au premier appelant suivant.
   *
   * ⚠️ « Recours à des externes : Observé » n'est PAS un champ : c'est
   * l'existence de la preview qui le dit, comme `AccountMarketMemoryCard` le
   * dérive côté dossier. Deux dérivations du même fait divergent.
   *
   * ⚠️ Composé DANS LE CONTRÔLEUR, comme `withMarketPaths` ci-dessous et pour
   * la même raison : GA-07 est au plafond et nomme cet endroit.
   */
  @Get('market-preview')
  async marketPreview(@Query() query: MarketPreviewDto): Promise<MarketPreviewRead> {
    let read
    try {
      read = await this.marketMemory.coverageFor({
        // La référence n'est qu'une corrélation d'appelant : ici, un seul
        // rapprochement à la fois, donc le nom suffit à la nommer.
        ref: query.name,
        name: query.name,
        // ⚠️ Pas de site : `CompanySuggestion` n'en porte pas. Écrire une
        // chaîne devinée ici rapprocherait sur un domaine inventé — pire que
        // pas de rapprochement du tout.
        website: null,
        country: query.country ?? null,
      })
    } catch (error) {
      // `coverageFor` promet de ne jamais jeter ; cette ceinture existe parce
      // qu'un écran de lancement qui tombe empêche de lancer quoi que ce soit.
      this.logger.warn('lecture de la preview mémoire marché impossible', { error })
      return { status: 'unavailable', reason: 'read_failed' }
    }

    // « Je n'ai pas pu lire » ne devient jamais « le marché ne connaît pas ce
    // compte » : l'écran doit pouvoir dire l'un ou l'autre.
    if (read.status !== 'ok') return { status: 'unavailable', reason: read.reason }
    // `covered: false` ⇒ `marketPaths` est `null` (le contrat le REFUSE
    // autrement) ; le second test donne son type au champ obligatoire.
    if (!read.coverage.covered || read.coverage.marketPaths === null) return { status: 'ok', preview: null }

    const preview: MarketPreview = {
      paths_observed: read.coverage.marketPaths,
      // COMBIEN, jamais LESQUELLES. `0` sur un compte couvert est une vraie
      // mesure : la mémoire a été lue et n'a vu aucune société de services.
      esn_observed: read.coverage.esnObserved.length,
      // ⚠️ Une TRONCATURE exige un ORDRE, sinon elle choisit au hasard.
      // `observedStack` arrive déjà trié par le service (`order: { persons:
      // 'DESC' }`) ; `roleFamilies` est une colonne `jsonb` qui garde l'ordre
      // du CORPUS — `parseRoleFamilies` ne trie pas. On les remet donc dans le
      // même ordre ici, avec le nom en départage pour que deux lectures
      // successives rendent la même liste (le patron de la file de revue).
      observed_stack: topObserved(
        read.coverage.observedStack.map(row => ({ label: row.techno, persons: row.persons })),
      ),
      // ⚠️ « Autre » est le seau de résidu du corpus, donc mécaniquement le PLUS
      // GROS : mesuré en production le 08/09, il sortait PREMIER sur les cinq
      // premières entreprises couvertes. Sur trois libellés, un tiers de la
      // ligne n'apprenait rien — sur tous les comptes à la fois. On filtre AVANT
      // de tronquer, pour que la troisième place revienne à une famille nommée.
      role_families: topObserved(
        read.coverage.roleFamilies
          .filter(row => !isResidualRoleFamily(row.family))
          .map(row => ({ label: row.family, persons: row.persons })),
      ),
    }
    return { status: 'ok', preview }
  }

  /**
   * #1593.2 — LE DÉPARTAGE DES PREMIERS COMPTES SUGGÉRÉS.
   *
   * Les chips de l'écran de lancement viennent du Profil ESN (mécanisme
   * inchangé) ; ce que cette route ajoute, c'est de quoi les ORDONNER : une
   * entreprise que le corpus couvre remonte, et sa raison le dit.
   *
   * ⚠️ Une lecture par chip serait un N+1 sur l'écran d'accueil. `pathsFor` est
   * la lecture GROUPÉE du service, celle qu'utilise déjà la liste de comptes.
   *
   * ⚠️ `null` sous le seuil, jamais `0` : l'exception « 0 s'affiche » de la
   * désambiguïsation (#1586, `withMarketPaths` ci-dessous) est nommée et vaut
   * pour ELLE SEULE — là-bas l'asymétrie départage deux homonymes du registre,
   * ici elle se lirait comme un fait sur l'entreprise.
   *
   * ⚠️ Une panne ne se replie pas en `null` partout : l'écran doit pouvoir
   * distinguer « le corpus ne connaît pas ces entreprises » de « je n'ai pas
   * pu lire », et ne classe rien dans le second cas.
   */
  @Get('market-paths')
  async marketPaths(@Query() query: MarketPathsDto): Promise<MarketPathsBatchRead> {
    let read
    try {
      read = await this.marketMemory.pathsFor(
        query.name.map(name => ({ ref: name, name, website: null, country: query.country ?? null })),
      )
    } catch (error) {
      this.logger.warn('départage des suggestions par la mémoire marché impossible', { error })
      return { status: 'unavailable', reason: 'read_failed' }
    }
    if (read.status !== 'ok') return { status: 'unavailable', reason: read.reason }
    return { status: 'ok', paths: Object.fromEntries(read.paths) }
  }

  /**
   * #1626 — LE CONTEXTE MARCHÉ OBSERVÉ, DEPUIS DÉCOUVRIR. ZÉRO CRÉDIT.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * POURQUOI UNE ROUTE DE PLUS, ALORS QUE `POST internal/copilot-bridge/market/search` EXISTE
   * ───────────────────────────────────────────────────────────────────────────
   * Cette route-là est le pont RÉSERVÉ au service IA (`INTERNAL_API_SECRET`,
   * `userId` en paramètre) : un écran authentifié par JWT ne peut pas l'appeler.
   * Le moteur, lui, ne bouge pas — c'est le MÊME `MarketMemoryService
   * .searchByFilters`, relayé TEL QUEL (GA-258 : un seul point d'entrée, cette
   * méthode n'en recompose aucune part). Ce qui manquait n'était pas le calcul,
   * c'était son second APPELANT, côté utilisateur.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * ZÉRO CRÉDIT, ET C'EST STRUCTUREL
   * ───────────────────────────────────────────────────────────────────────────
   * Aucun débit, aucune écriture, aucun appel de modèle : une lecture sur un
   * corpus déjà ingéré, exactement comme `market-preview` ci-dessus.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * CE QUE CETTE MÉTHODE NE FAIT PAS
   * ───────────────────────────────────────────────────────────────────────────
   * Aucun vocabulaire n'est composé ici : `searchByFilters` rend des FAITS
   * comptés (parcours, personnes), et c'est l'écran qui phrase « Recours
   * externe : Observé » / « Fit marché : … » — la doctrine du service
   * (voir sa JSDoc) veut que le comptage traverse tel quel et que la phrase
   * naisse à l'endroit qui la lit, jamais recomposée une seconde fois ici.
   */
  @Get('market-context-search')
  async marketContextSearch(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: MarketContextSearchDto,
  ): Promise<MarketContextSearchRead> {
    // #2288.2 — le portefeuille de l'appelant, pour DATER ce qui peut l'être.
    const { portfolio, workspaceId } = await this.marketSearchPortfolio(user.userId)
    const read = await this.marketMemory.searchByFilters(
      {
        technology: query.technology,
        location: query.location,
        esn: query.esn,
        roleFamily: query.roleFamily,
        employeeMin: query.employeeMin,
        employeeMax: query.employeeMax,
        limit: query.limit,
      },
      { portfolio, workspaceId },
    )
    // Copie SUPERFICIELLE du seul tableau, pour la variance `readonly` du
    // service vers le contrat mutable — les VALEURS ne sont pas recomposées.
    return read.status === 'ok' ? { status: 'ok', matches: [...read.matches] } : read
  }

  /**
   * #2288.2 — QUELS COMPTES DE L'APPELANT SONT LES ENTREPRISES TROUVÉES.
   *
   * Le MÊME geste que `copilot-bridge.controller.ts` (`marketSearchPortfolio`),
   * à la même maille et avec la même mise en forme partagée
   * (`marketPortfolioLookups`, #1581.1) : ce qui se recopie le plus facilement
   * est le PAYS, seul départage entre deux homonymes du corpus, et deux
   * appelants qui l'oublient chacun de leur côté rendent deux résultats.
   *
   * Ne jette JAMAIS : sans portefeuille lisible, la recherche rend les mêmes
   * entreprises sans date — « aucun signal actuel », ce qui reste vrai.
   */
  private async marketSearchPortfolio(
    userId: string,
  ): Promise<{ portfolio: MarketCompanyLookup[]; workspaceId: string | null }> {
    if (!this.accountsService || !this.workspaceContext) return { portfolio: [], workspaceId: null }
    try {
      const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const visibility = await this.workspaceContext.portfolioVisibilityOf(workspaceId)
      const rows = await this.accountsService.listPortfolioLookups(
        workspaceId,
        portfolioScopeFor(role, visibility, userId),
      )
      return { portfolio: marketPortfolioLookups(rows), workspaceId }
    } catch (error) {
      this.logger.warn('portefeuille illisible pour la recherche de contexte marché', { error })
      return { portfolio: [], workspaceId: null }
    }
  }

  /**
   * #1586 — le nombre de parcours observés par la mémoire marché, calculé pour
   * CHAQUE suggestion du lot afin de départager deux homonymes du registre
   * (« ROCHE » le laboratoire contre « ROCHE BOBOIS »).
   *
   * ⚠️ **Pourquoi ici et pas dans `CompaniesService`.** La première écriture de
   * ce lot injectait `MarketMemoryService` dans le service, et GA-07 l'a
   * refusée : le cliquet des frontières de modules est AU PLAFOND, et la garde
   * dit elle-même où cette dépendance doit vivre — « fais l'orchestration dans
   * le contrôleur ». `oauth`, `projects` et `consultants` prennent la leur au
   * même endroit, et c'est nommé dans la garde comme le bon précédent.
   *
   * ⚠️ **EXCEPTION NOMMÉE** (`disambiguationMarketPathsSchema`) : partout
   * ailleurs dans le produit, sous `MARKET_MEMORY_MIN_PATHS` (3) observations,
   * la mémoire marché ne dit RIEN. ICI, et SEULEMENT ici, « 0 parcours
   * observé » s'affiche — « ROCHE, 41 parcours observés » contre « ROCHE
   * BOBOIS, aucun parcours observé ». **L'asymétrie EST l'information qui
   * départage** ; la cacher redonnerait l'ambiguïté que cet écran existe pour
   * lever. Ne pas « corriger » cette exception en croyant appliquer la règle
   * générale : elle est délibérée, et l'issue #1586 la demande explicitement.
   *
   * Résolu via `resolveDetailed`, jamais `pathsFor` — ce dernier CLAMPE à
   * `null` tout ce qui est sous le seuil, perdant justement la distinction
   * entre « zéro parcours » et « aucun rapprochement fiable » dont cette
   * exception a besoin :
   *  - `resolved` → le total brut si ≥ seuil, sinon `0` (un ou deux parcours ne
   *    distinguent rien, mais ce n'est PAS une absence de mémoire) ;
   *  - `ambiguous` / `unresolved` / `unavailable` → `null`, réservé à « pas de
   *    rapprochement fiable ».
   *
   * ⚠️ Le champ est posé sur TOUTES les lignes du lot, jamais sur une seule :
   * une ligne isolée se lirait comme un branchement à moitié fait. Best-effort
   * strict — une panne de la mémoire marché ne fait jamais échouer
   * l'autocomplétion, elle rend `null` partout, comme un lot sans couverture.
   */
  private async withMarketPaths(
    suggestions: readonly CompanySuggestion[],
    country: WorkspaceMarket | undefined,
  ): Promise<CompanySuggestion[]> {
    if (suggestions.length === 0) return []
    try {
      const resolutions = await Promise.all(
        suggestions.map(suggestion =>
          this.marketMemory.resolveDetailed({
            ref: suggestionIdentity(suggestion),
            name: suggestion.name,
            country: suggestion.country ?? country ?? null,
          }),
        ),
      )
      // #1756.3 (lot 14) — DEUX IDENTITÉS DISTINCTES NE PARTAGENT JAMAIS UN COMPTE.
      //
      // Mesuré en production le 10/09/2026 : trois « THALES » de SIREN distincts
      // (le groupe aérospatial, une SAS conseil, une société de fret fluvial à
      // 1-2 salariés) rendaient tous les trois `marketPaths: 272` — le compte du
      // groupe recopié sur deux homonymes sans aucun rapport. `resolveDetailed`
      // répond à CHAQUE suggestion séparément et ne peut pas savoir que le LOT
      // pose la même question plusieurs fois pour des identités différentes ;
      // cette méthode est la SEULE surface qui voit le lot entier.
      //
      // La doctrine interdit une jointure automatique sur nom seul et dit qu'un
      // rapprochement `inferred` ne fusionne jamais. Deux identités (SIREN /
      // registryId) DIFFÉRENTES qui rapprochent sur le MÊME `companyKey` via un
      // nom seul ne peuvent pas être toutes les deux ce compte — impossible de
      // savoir laquelle (si une seule) est la bonne, donc AUCUNE ne le garde
      // comme un fait établi. Un `strength: 'domain'` (vérifié par site web,
      // structurellement impossible ici — `CompanySuggestion` ne porte pas de
      // site) ne serait PAS concerné : seul `inferred` est une simple
      // coïncidence de nom.
      const identitiesByInferredKey = new Map<string, Set<string>>()
      resolutions.forEach((resolution, index) => {
        if (resolution.status !== 'resolved' || resolution.strength !== 'inferred') return
        const identities = identitiesByInferredKey.get(resolution.companyKey) ?? new Set<string>()
        identities.add(suggestionIdentity(suggestions[index]!))
        identitiesByInferredKey.set(resolution.companyKey, identities)
      })

      return suggestions.map((suggestion, index) => {
        const resolution = resolutions[index]!
        const collidesWithADifferentIdentity =
          resolution.status === 'resolved' &&
          resolution.strength === 'inferred' &&
          (identitiesByInferredKey.get(resolution.companyKey)?.size ?? 0) > 1
        return {
          ...suggestion,
          marketPaths: collidesWithADifferentIdentity ? null : toDisambiguationMarketPaths(resolution),
        }
      })
    } catch (error) {
      this.logger.warn('lecture de la mémoire marché impossible pour la désambiguïsation', { error })
      return suggestions.map(suggestion => ({ ...suggestion, marketPaths: null }))
    }
  }
}

/**
 * Les `MARKET_PREVIEW_MAX_ITEMS` observations les plus fréquentes, par leur
 * libellé seul — le comptage ne traverse pas (#1589.2 : pas de recensement).
 *
 * Le tri est DÉTERMINISTE : à égalité de personnes, le libellé départage. Sans
 * lui, deux lectures du même compte pourraient rendre deux listes de trois, et
 * un aperçu qui change tout seul se lit comme une donnée qui bouge.
 */
function topObserved(rows: readonly { label: string; persons: number }[]): string[] {
  return [...rows]
    .sort((a, b) => b.persons - a.persons || a.label.localeCompare(b.label))
    .slice(0, MARKET_PREVIEW_MAX_ITEMS)
    .map(row => row.label)
}

/** `MarketResolution` → la valeur EXCEPTÉE de `disambiguationMarketPathsSchema`. */
function toDisambiguationMarketPaths(resolution: MarketResolution): number | null {
  if (resolution.status !== 'resolved') return null
  return resolution.pathsTotal >= MARKET_MEMORY_MIN_PATHS ? resolution.pathsTotal : 0
}

/**
 * L'identité d'une suggestion — le SIREN (FR) ou l'identifiant de registre
 * étranger (`registryId`), et le NOM en dernier recours seulement. Utilisée à
 * la fois comme `ref` de `resolveDetailed` et comme clé de collision
 * (#1756.3, lot 14) : deux suggestions dont cette valeur DIFFÈRE sont deux
 * entreprises réellement distinctes, même si leur raison sociale coïncide.
 */
function suggestionIdentity(suggestion: CompanySuggestion): string {
  return suggestion.siren || suggestion.registryId || suggestion.name
}
