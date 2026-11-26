import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import {
  buildCohortPeerScores,
  classifyCohortIndex,
  COMMUNITY_AGGREGABLE_KINDS,
  type MarketSignalDate,
  toAccountCohortIndex,
  type CohortIndexSignal,
  type CohortPeerScores,
  type MarketCohortIndexRead,
  EMPTY_MARKET_MEMORY_COVERAGE,
  MARKET_ESN_VIEW_MAX_ITEMS,
  MARKET_MEMORY_GROUP_MAX_ENTITIES,
  MARKET_ESN_OBSERVED_MIN_PATHS,
  MARKET_MEMORY_MIN_PATHS,
  MARKET_REVIEW_QUEUE_MAX,
  type MarketEsnObserved,
  type MarketEsnViewRead,
  type MarketMemoryCoverage,
  type MarketMemoryRead,
  type MarketMemorySearchMatch,
  type MarketMemorySearchRead,
  type MarketObservedZone,
  type MarketPortfolioBucket,
  type MarketPortfolioRead,
  type MarketResolutionDecisionRecord,
  type MarketResolutionDecisionRequest,
  type MarketReviewCandidate,
  type MarketReviewItem,
  type MarketStructuralFit,
  MARKET_OBSERVATION_MIN_PERSONS,
  isResidualRoleFamily,
  type TechnoPrevalenceTier,
  observedCertainty,
  stackMatchesExpertises,
  technoPrevalenceOf,
  technoPrevalenceScale,
} from '@bellum/contracts'
import { MarketCompanyAliasEntity } from '../../database/entities/market-company-alias.entity'
import { MarketCompanyResolutionOverrideEntity } from '../../database/entities/market-company-resolution-override.entity'
import { applyResolutionOverride, type MarketResolutionOverride } from './market-resolution-override'
import { marketSignalDatesByKey } from './market-signal-dates'
import { MarketCompanySignalEntity } from '../../database/entities/market-company-signal.entity'
import { MarketCompanyStackEntity } from '../../database/entities/market-company-stack.entity'
import { MarketEsnClientEntity } from '../../database/entities/market-esn-client.entity'
import { MarketExEsnAtClientEntity } from '../../database/entities/market-ex-esn-at-client.entity'
import { MarketPersonPathEntity } from '../../database/entities/market-person-path.entity'
import type { MarketPersonPathsRead, MarketPersonPathView } from './market-person-path-view'
import { aliasTargetKeys, marketAliasKey } from './market-company-alias'
import { type MarketCompanyMatch, marketMatchKey, marketRootDomain } from './market-company-key'
import { type MarketResolution, resolveMarketCompany } from './market-company-resolution'

/**
 * LE PLANCHER D'UNE LIGNE DU CORPUS — trois observations, écrit UNE fois.
 *
 * Distinct du seuil de l'ENTREPRISE (`signal.paths_total`), qu'il n'a jamais
 * remplacé : celui-ci porte sur chaque COUPLE d'organisations. Un couple relié
 * par deux parcours n'est pas une observation, c'est une ligne de CV.
 *
 * ⚠️ Extrait le 11/09/2026 (#1636), et pas par élégance : GA-285
 * (`market-memory-esn-observation-threshold.spec.ts`) compte les `row.persons
 * >= …` de ce fichier et EXIGE qu'il n'y en ait qu'un. Elle a dit NON à la
 * troisième lecture qui refiltrait de son côté — ce qui est exactement le
 * défaut qu'elle existe pour empêcher, et exactement ce que ce lot allait
 * réintroduire. Le filtre vit donc ici, et les trois lectures l'appellent.
 */
function meetsObservationFloor(row: { readonly persons: number }): boolean {
  return row.persons >= MARKET_MEMORY_MIN_PATHS
}

/**
 * #4016 L10 — LE PLANCHER D'UNE LIGNE ESN OBSERVÉE : UN parcours.
 *
 * ⚠️ RENVERSEMENT DATÉ du 11/10/2026 (Louis). Seules les lignes ESN d'un
 * compte déjà couvert descendent à 1 ; les destinations d'une société de
 * services gardent {@link meetsObservationFloor} (3). Le compte exact ne sort
 * pas sous 3 — le contrat dit la fourchette (`esnObservedPathsRange`).
 */
function meetsEsnObservedFloor(row: { readonly persons: number }): boolean {
  return row.persons >= MARKET_ESN_OBSERVED_MIN_PATHS
}

/**
 * #1636 — L'ORDRE DES DEUX LISTES DU BLOC « TON ENTREPRISE », écrit une fois.
 *
 * Le plus observé d'abord, puis l'ordre alphabétique. Le second critère n'est
 * pas de la coquetterie : à comptage ÉGAL, sans lui, ce sont l'ordre d'insertion
 * en base et l'ordre des clés d'un `jsonb` qui décident quelles trois lignes
 * survivent à la troncature — deux lectures du même corpus rendraient alors deux
 * listes, et aucune ne serait fausse.
 */
function byPersonsThenName<T extends { persons: number }>(label: (row: T) => string): (left: T, right: T) => number {
  return (left, right) => right.persons - left.persons || label(left).localeCompare(label(right))
}

/** Ce qu'un appelant sait d'une entreprise avant d'interroger la mémoire. */
export interface MarketCompanyLookup {
  /** L'identifiant de l'appelant — il ressort tel quel pour qu'il s'y retrouve. */
  readonly ref: string
  readonly name: string
  readonly website?: string | null
  /**
   * Le pays du compte, s'il est connu (#1617).
   *
   * Le SEUL départage supplémentaire que le corpus permet entre deux homonymes :
   * il ne porte ni SIREN, ni identifiant de registre, ni identifiant LinkedIn.
   * Absent ⇒ on ne devine pas, et deux homonymes restent ambigus — ce qui est la
   * bonne réponse : « une mauvaise jointure est pire qu'une absence de donnée ».
   */
  readonly country?: string | null
  /**
   * Lot 793 — les identifiants COMMUNS déjà résolus pour ce compte par le référentiel pivot
   * (`resolveCommonAccounts`, `common_account_links` : BM-A du pack v2.1). Lus TELS QUELS comme `company_key` par
   * `personPathsFor`, en plus de la clé du corpus que le nom ou le domaine rencontre : un parcours rangé sous un BM-A
   * (lot 791) n'a pas d'autre chemin vers le compte. Absent = le comportement d'avant ce lot.
   */
  readonly commonKeys?: readonly string[]
}

/**
 * Le compte de parcours par référence d'appelant, ou l'aveu que la lecture n'a
 * pas eu lieu. La distinction est la raison d'être de ce type — voir
 * `MarketMemoryRead` dans les contrats.
 */
export type MarketPathsRead =
  | { readonly status: 'ok'; readonly paths: ReadonlyMap<string, number | null> }
  | { readonly status: 'unavailable'; readonly reason: string }

/**
 * #1596.6-10 / #1628.1 — LA RECHERCHE PAR FILTRE, l'inverse de tout ce qui
 * précède.
 *
 * Chaque méthode au-dessus part d'une IDENTITÉ (« que sait-on de l'entreprise
 * X ? ») et rend sa mémoire. `searchByFilters` part de CRITÈRES (« quelles
 * entreprises ont observé du Java, en Île-de-France, à plus de 500 personnes
 * ? ») et rend les entreprises qui y répondent — la question qu'aucune méthode
 * de ce service ne pouvait poser avant ce lot.
 *
 * Au moins un champ DISCRIMINANT doit être renseigné (`technology`, `location`,
 * `esn`, `roleFamily`, `employeeMin` ou `employeeMax`) : `limit` seul ne compte
 * pas. Une recherche sans filtre balaierait tout le corpus partagé — c'est
 * l'ISSUE elle-même qui l'interdit, et `searchByFilters` le REFUSE avant
 * d'exécuter la moindre requête, pas seulement dans sa description.
 */
interface MarketMemorySearchFilters {
  readonly technology?: string
  readonly location?: string
  /**
   * #1961.5 — la VILLE seule, distincte de `location` (qui reste le repli
   * large ville/région/pays). Filtre UNIQUEMENT `signal.city` — un « Bretagne »
   * passé ici ne rencontre jamais une ligne dont seule la région correspond.
   */
  readonly city?: string
  /** #1961.5 — la RÉGION seule, même logique que {@link city} sur `signal.region`. */
  readonly region?: string
  readonly esn?: string
  readonly roleFamily?: string
  readonly employeeMin?: number
  readonly employeeMax?: number
  /**
   * #2991 (#2287.15) — LA TAILLE, une valeur FERMÉE du corpus
   * (`headcount_bracket`, ex. « 51-200 »), distincte de {@link employeeMin} /
   * {@link employeeMax} qui restent des BORNES chiffrées. Donnée réelle,
   * ingérée depuis `tranche_effectif` (voir `market-memory-import.ts`) —
   * jamais dérivée des bornes, qui répondent à une question différente
   * (« au moins/au plus N personnes », pas « quelle tranche »).
   */
  readonly size?: string
  /**
   * #2991 (#2287.17) — LE RECOURS EXTERNE OBSERVÉ, GÉNÉRIQUE : distinct
   * d'{@link esn} (une société de services NOMMÉE). Même nom que le filtre
   * jumeau du registre Découvrir (`DiscoverMarketMemoryService`,
   * #2165.28/.30) : un seul mot pour le même concept.
   *
   * ⚠️ Doctrine c65/GA-259 — ne filtre QUE sur `true`. `false` n'est PAS un
   * discriminant : un booléen absent ou à `false` n'affirme jamais qu'une
   * entreprise « n'externalise pas », ce que le corpus ne peut pas garantir
   * (absence d'observation ≠ absence du fait).
   */
  readonly externalRecourseObserved?: boolean
  /**
   * #2991 (#2287.14) — LE TYPE D'ENTREPRISE, au sens de la SEULE classification
   * que porte le corpus : `is_service_company` (`est_esn` à l'ingestion), une
   * colonne RÉELLE jamais lue nulle part avant ce lot. Filtrée sous son propre
   * nom, jamais sous « type d'entreprise » qui promettrait une taxonomie plus
   * large que ce qui est réellement mesuré.
   *
   * ⚠️ Doctrine c65/GA-259 — ne filtre QUE sur `true`, même raison
   * qu'{@link externalRecourseObserved} : la colonne défaut à `false` à
   * l'ingestion quand la cellule est vide, donc `false` mélangerait « mesuré
   * non-ESN » et « non mesuré ».
   */
  readonly isServiceCompany?: boolean
  /** Défaut {@link MARKET_SEARCH_DEFAULT_LIMIT}, borné à {@link MARKET_SEARCH_MAX_LIMIT}. */
  readonly limit?: number
}

/**
 * #1961 — la FORME rendue par `searchByFilters` (`MarketMemorySearchMatch` /
 * `MarketMemorySearchRead`) vit désormais dans le contrat zod
 * (`packages/contracts/src/schemas/market-memory.ts`) et se PARSE au bord du pont
 * copilote. Elle vivait ici en interfaces locales, sans aucun `.parse()` sur la
 * route qui la sert.
 *
 * ⚠️ `coverage.covered` est toujours `true` dans une entreprise trouvée : sous
 * {@link MARKET_MEMORY_MIN_PATHS}, une entreprise ne sort JAMAIS de la liste —
 * c'est `searchByFilters` qui l'exclut, jamais la description de l'outil.
 * `truncated` (LOT 18, GA-326) dit si le corpus réel dépasse la limite affichée.
 */

/**
 * #1961.21 — ce que l'appelant AJOUTE pour qu'une entreprise trouvée puisse
 * porter la route de la fiche d'un de SES comptes.
 *
 * Même contrat que `portfolioFor` : le service ne connaît pas l'espace, il reçoit
 * un portefeuille DÉJÀ scopé par son appelant (cloisonnement D5 compris). Les
 * tables du corpus restent lues SANS espace — `workspaceId` ne sert qu'à lire les
 * décisions humaines de CET espace sur ses propres rapprochements.
 *
 * Absent ⇒ aucune lecture de plus, et la forme rendue est celle d'avant #1961.21.
 */
interface MarketMemorySearchOptions {
  readonly portfolio?: readonly MarketCompanyLookup[]
  readonly workspaceId?: string | null
}

/**
 * #1632.5 — les piles observées de PLUSIEURS entreprises, plus de quoi juger si
 * une technologie partagée veut dire quelque chose.
 *
 * `stacks` porte `null` — et non `[]` — pour une entreprise que le corpus ne
 * couvre pas : « on ne sait pas » et « on sait qu'elle n'a rien » ne se rendent
 * pas pareil, et seule la seconde autoriserait à conclure.
 *
 * `technoFrequency` et `corpusCompanies` sont la MESURE de l'ubiquité : sur
 * combien d'entreprises du corpus chaque techno est observée, et sur combien
 * d'entreprises au total. Sans ce dénominateur, `discriminantCommonTechnos` ne
 * conclut rien.
 */
type MarketStacksRead =
  | {
      readonly status: 'ok'
      readonly stacks: ReadonlyMap<string, readonly string[] | null>
      readonly technoFrequency: ReadonlyMap<string, number>
      readonly corpusCompanies: number
    }
  | { readonly status: 'unavailable'; readonly reason: string }

/**
 * #1756 — ce qu'il faut savoir d'un rapprochement pour pouvoir le RACONTER.
 *
 * La résolution seule ne suffit pas : un `unresolved` ne dit ni quelle clé de
 * nom n'a rien trouvé, ni s'il y avait un domaine à essayer, ni si un alias
 * existait mais visait plusieurs entreprises. Ces trois renseignements sont
 * précisément ce qu'un opérateur doit lire pour savoir QUOI corriger — et ils
 * n'existent qu'au moment de la lecture, pas dans le résultat.
 */
interface MarketResolutionReport {
  readonly lookup: MarketCompanyLookup
  readonly resolution: MarketResolution
  readonly probe: {
    readonly matchKey: string
    readonly domain: string | null
    readonly aliasCandidates: number
  }
}

/**
 * Combien de temps la table des fréquences par techno reste valable.
 *
 * Le corpus ne bouge qu'à l'ingestion — un import versionné, quelques fois par
 * mois. Une heure est donc très prudent, et c'est le point : la requête est un
 * `GROUP BY` sur toute la table des piles, qu'on ne veut pas payer à chaque
 * ouverture de l'écran des comptes.
 *
 * ⚠️ Le cache vit dans le PROCESSUS, pas dans Redis : c'est une valeur dérivée,
 * reconstructible, et identique pour tous les espaces (les tables `market_*`
 * sont partagées). Un redémarrage la reconstruit, et c'est tout ce qu'il se
 * passe.
 */
const TECHNO_FREQUENCY_TTL_MS = 60 * 60 * 1000

/**
 * #1640.2 — Combien de temps la cohorte d'une tranche d'effectif reste valable.
 *
 * MÊME durée que {@link TECHNO_FREQUENCY_TTL_MS} et pour la même raison : le
 * corpus ne bouge qu'à l'ingestion, quelques fois par mois. Une tranche peut
 * compter plusieurs milliers de lignes ; les relire à chaque ouverture d'un
 * dossier de compte paierait, par visiteur, une lecture identique pour tout le
 * monde (les tables `market_*` sont PARTAGÉES, aucun `workspace_id`).
 *
 * ⚠️ Deux constantes plutôt qu'une, à dessein : ce sont deux réglages, pas un
 * réglage lu deux fois. Ils tombent aujourd'hui sur la même valeur parce qu'ils
 * décrivent le même corpus, et rien n'oblige la cohorte à suivre la table des
 * fréquences le jour où l'une des deux lectures devient plus chère.
 */
const COHORT_PEERS_TTL_MS = 60 * 60 * 1000

/** `searchByFilters` sans `limit` — même défaut que `search_talents` (#1596.6-10). */
const MARKET_SEARCH_DEFAULT_LIMIT = 20
/** Le plafond, quel que soit ce qu'un appelant demande. */
const MARKET_SEARCH_MAX_LIMIT = 50

/**
 * LA LECTURE de la mémoire marché — le SEUL point d'entrée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS PROPRIÉTÉS QUE CE SERVICE GARANTIT À SES APPELANTS
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Il ne jette jamais.** Une panne de lecture rend `unavailable`, avec sa
 *    raison. C'est ce qui permet au prompt d'analyse d'être « best-effort
 *    strict » : une mémoire en erreur produit un bloc absent, jamais une analyse
 *    échouée. ⚠️ Mais `unavailable` n'est PAS `covered: false` — l'appelant doit
 *    choisir quoi en faire, et les deux ne se rendent pas pareil à l'écran.
 *
 * 2. **Il applique le seuil, et personne d'autre.** Sous `MARKET_MEMORY_MIN_PATHS`
 *    observations, la couverture est VIDE — pas partielle, pas « 2 parcours ».
 *    Le seuil n'est pas un paramètre : ni un appelant, ni un prompt, ni le
 *    copilote ne peuvent le baisser, parce qu'aucune signature ne le prend.
 *    ⚠️ CORRIGÉ le 10/09/2026 (#1624, lot 14) : cette phrase décrivait le
 *    TOTAL de l'entreprise (`marketPaths`, toujours vrai), mais se lisait comme
 *    une garantie sur CHAQUE nombre que ce service expose — garantie que
 *    `esnObserved` ne tenait PAS : mesuré en production, BNP Paribas rendait
 *    Keyrus à 2 parcours (`MARKET_OBSERVATION_MIN_PERSONS`, un plancher pensé
 *    pour la pile technique, filtrait les lignes ESN à la place du seuil
 *    transverse). Voir `esnObservedFrom` : la phrase est vraie maintenant,
 *    au sens le plus strict, pour tout nombre que ce service rend.
 *
 * 3. **Il ne rend aucune date et aucune identité.** Les colonnes d'audit
 *    (`corpus_label`) ne traversent aucune de ces méthodes, et les tables ne
 *    portent que des comptages. Ce qui n'est pas lu ici ne peut pas fuiter plus
 *    loin.
 *
 * ⚠️ Service en LECTURE SEULE. Aucune méthode n'écrit — c'est l'absence de code
 * qui le garantit, pas une convention. Une correction faite par un espace vit
 * dans ses propres tables et prime à la lecture ; elle ne réécrit jamais la
 * mémoire partagée, qui est commune à des espaces concurrents.
 */
@Injectable()
export class MarketMemoryService {
  private readonly logger = new Logger(MarketMemoryService.name)

  /** Voir {@link TECHNO_FREQUENCY_TTL_MS}. Dérivé, reconstructible, partagé. */
  private technoFrequencyCache: {
    value: { technoFrequency: ReadonlyMap<string, number>; corpusCompanies: number }
    expiresAt: number
  } | null = null

  /**
   * #1640.2 — Les cohortes déjà lues, PAR TRANCHE. Voir {@link COHORT_PEERS_TTL_MS}.
   *
   * Une entrée par tranche rencontrée, pas une par compte : deux comptes de la
   * même taille partagent la même cohorte, qui est un fait de marché commun à
   * tous les espaces. Comme la table des fréquences, elle vit dans le PROCESSUS
   * — dérivée, reconstructible, et un redémarrage la refait.
   */
  private readonly cohortPeersCache = new Map<string, { value: CohortPeerScores; expiresAt: number }>()

  constructor(
    @InjectRepository(MarketCompanySignalEntity)
    private readonly signals: Repository<MarketCompanySignalEntity>,
    @InjectRepository(MarketEsnClientEntity)
    private readonly esnClients: Repository<MarketEsnClientEntity>,
    @InjectRepository(MarketCompanyStackEntity)
    private readonly stacks: Repository<MarketCompanyStackEntity>,
    @InjectRepository(MarketExEsnAtClientEntity)
    private readonly exEsn: Repository<MarketExEsnAtClientEntity>,
    /**
     * #1756 — la table d'alias, en LECTURE seule comme les quatre autres.
     *
     * ⚠️ Elle peut être VIDE, et c'est l'état nominal aujourd'hui : QUI la
     * remplit est une décision produit en attente. Vide, elle ne change rien —
     * `aliasCandidates` rend une table vide, et le rapprochement retombe
     * exactement sur ce qu'il rendait avant ce lot.
     */
    @InjectRepository(MarketCompanyAliasEntity)
    private readonly aliases: Repository<MarketCompanyAliasEntity>,
    /**
     * #1617.4 — les décisions humaines de l'espace, en lecture ici.
     *
     * ⚠️ AJOUTÉ EN FIN DE CONSTRUCTEUR, jamais au milieu : ce dépôt a déjà payé
     * un paramètre inséré entre deux autres, qui décale silencieusement toutes
     * les specs qui construisent le service positionnellement — rien ne jette,
     * les cartes affichent juste une raison plus faible.
     *
     * ⚠️ Elle est VIDE tant que personne n'a corrigé un rapprochement, et c'est
     * l'état nominal : vide, elle ne change rien, et le chemin redevient
     * byte-identique à celui d'avant ce lot.
     */
    @InjectRepository(MarketCompanyResolutionOverrideEntity)
    private readonly resolutionOverrides: Repository<MarketCompanyResolutionOverrideEntity>,
    /**
     * Lot 775 — les parcours individuels, SANS identité (décision Louis 02/11/2026). AJOUTÉ EN FIN DE CONSTRUCTEUR
     * et optionnel : les specs qui construisent le service sans cette table restent valides.
     */
    @Optional()
    @InjectRepository(MarketPersonPathEntity)
    private readonly personPaths?: Repository<MarketPersonPathEntity>,
  ) {}

  /**
   * Lot 775 — LES PARCOURS OBSERVÉS chez des entreprises, sans identité.
   *
   * Le MÊME arbitre de rapprochement que {@link observedStacksFor} (alias et corrections comprises) ; mais PAS le
   * seuil de {@link MARKET_MEMORY_MIN_PATHS} : ce seuil protège les AGRÉGATS (« 1 parcours » désignerait quelqu'un par
   * exclusion) ; une ligne individuelle ne porte aucune identité et s'affiche même seule (décision Louis).
   *
   * ⚠️ Le pseudonyme (`person_key`) ne sort JAMAIS d'ici. Une entreprise non reconnue ne fait aucune entrée.
   */
  async personPathsFor(
    lookups: readonly MarketCompanyLookup[],
    options?: { readonly workspaceId?: string | null },
  ): Promise<MarketPersonPathsRead> {
    if (lookups.length === 0 || !this.personPaths) return { status: 'ok', paths: new Map() }
    try {
      const candidates = await this.candidatesByRef(lookups)
      const overrides = await this.overridesByAccount(options?.workspaceId ?? null)
      const keysByRef = new Map<string, string[]>()
      const reports: MarketResolutionReport[] = []
      for (const lookup of lookups) {
        const computed = resolveMarketCompany(
          candidates.byDomain.get(lookup.ref) ?? [],
          candidates.byName.get(lookup.ref) ?? [],
          { country: lookup.country },
          candidates.byAlias.get(lookup.ref) ?? [],
        )
        reports.push(reportOf(lookup, computed, candidates))
        const reviewed = applyResolutionOverride(computed, overrides.get(lookup.ref) ?? null)
        // Lot 793 — les clés communes (BM-A) résolues par le référentiel pivot s'ajoutent à la clé du corpus.
        const keys = [...(reviewed.status === 'resolved' ? [reviewed.companyKey] : []), ...(lookup.commonKeys ?? [])]
        if (keys.length > 0) keysByRef.set(lookup.ref, [...new Set(keys)])
      }
      this.reportResolutions(reports)

      const out = new Map<string, MarketPersonPathView[]>()
      const keys = [...new Set([...keysByRef.values()].flat())]
      if (keys.length > 0) {
        const rows = await this.personPaths.find({ where: { companyKey: In(keys) }, order: { startDate: 'DESC' } })
        const byKey = new Map<string, MarketPersonPathView[]>()
        for (const row of rows) {
          const view: MarketPersonPathView = {
            id: row.rowKey,
            jobTitle: row.jobTitle ?? null,
            roleFamily: row.roleFamily ?? null,
            skills: row.skills ?? [],
            startDate: row.startDate ?? null,
            endDate: row.endDate ?? null,
            datePrecision: row.datePrecision ?? null,
            isCurrent: row.isCurrent ?? null,
            workStatus: row.workStatus,
            esnName: row.esnName ?? null,
            dailyRateEur: row.dailyRateEur ?? null,
            missionCity: row.missionCity ?? null,
            missionRegion: row.missionRegion ?? null,
          }
          byKey.set(row.companyKey, [...(byKey.get(row.companyKey) ?? []), view])
        }
        for (const [ref, refKeys] of keysByRef) {
          const seen = new Set<string>()
          out.set(
            ref,
            refKeys.flatMap(key => byKey.get(key) ?? []).filter(view => !seen.has(view.id) && !!seen.add(view.id)),
          )
        }
      }
      return { status: 'ok', paths: out }
    } catch (error) {
      this.logger.error('lecture des parcours observés impossible', { error })
      return { status: 'unavailable', reason: 'read_failed' }
    }
  }

  /**
   * #1617.4 — les décisions humaines d'UN espace, par référence de compte.
   *
   * Une seule lecture par rendu, jamais une par compte : un portefeuille de
   * trente comptes ferait trente allers-retours pour une table qui tient dans
   * une requête. C'est le même patron que les autres lectures groupées du
   * service.
   *
   * Rend une `Map` vide quand la lecture échoue — une panne de la table des
   * corrections ne doit pas emporter la lecture du corpus : on retombe alors
   * sur le calcul seul, qui est exactement le comportement d'avant ce lot.
   */
  private async overridesByAccount(workspaceId: string | null): Promise<Map<string, MarketResolutionOverride>> {
    const out = new Map<string, MarketResolutionOverride>()
    if (!workspaceId) return out

    let rows: MarketCompanyResolutionOverrideEntity[]
    try {
      rows = await this.resolutionOverrides.find({ where: { workspaceId } })
    } catch (error) {
      this.logger.warn('lecture des corrections de rapprochement impossible', { error })
      return out
    }

    for (const row of rows) {
      if (row.decision === 'confirmed') {
        // La contrainte SQL l'interdit, mais une ligne écrite avant elle (ou par
        // une reprise) ne doit pas produire un rattachement vers rien.
        if (!row.marketCompanyKey) continue
        out.set(row.accountId, {
          kind: 'confirmed',
          marketCompanyKey: row.marketCompanyKey,
          reviewedAt: row.reviewedAt,
          reviewedBy: row.reviewedBy,
        })
      } else {
        out.set(row.accountId, { kind: 'dismissed', reviewedAt: row.reviewedAt, reviewedBy: row.reviewedBy })
      }
    }
    return out
  }

  /**
   * #1617.4 — ENREGISTRE LA DÉCISION D'UN HUMAIN sur le rapprochement d'un compte.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CE GESTE VIT DANS CE SERVICE ET PAS DANS LE CONTRÔLEUR
   * ─────────────────────────────────────────────────────────────────────────
   * GA-258 tient une porte unique vers les tables de la mémoire marché : une
   * surface qui importerait l'entité pour écrire serait une SECONDE porte, et
   * la lecture (`overridesByAccount`) est déjà ici. Les deux moitiés du même
   * aller-retour se relisent alors côte à côte — c'est ce qui a manqué à
   * `market_company_signal`, dont l'écriture vit dans un script d'ingestion
   * que personne ne relit en même temps que la lecture.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * L'IDEMPOTENCE EST LE POINT, PAS UN CONFORT
   * ─────────────────────────────────────────────────────────────────────────
   * `upsert` sur `(workspace_id, account_id)` — la dernière décision REMPLACE
   * la précédente. « Une correction humaine gagne toujours, quelle que soit sa
   * date » : deux clics sur la même ligne ne laissent qu'une vérité, et
   * `overridesByAccount` n'a jamais à choisir entre deux lignes concurrentes
   * (c'est exactement le défaut `findOne` sur index non unique que #1617 a
   * payé une couche plus bas).
   *
   * ⚠️ `marketCompanyKey` est écrit à `null` — jamais omis — sur un rejet.
   * Omis, l'ancienne clé d'un accord précédent SURVIVRAIT à la nouvelle
   * décision, et le CHECK croisé de la table rejetterait la ligne : un 500
   * opaque sur un geste parfaitement légitime.
   *
   * ⚠️ N'écrit RIEN dans les tables `market_*` partagées. Les espaces sont des
   * ESN, donc des concurrents : la correction de l'un ne devient jamais la
   * vérité de l'autre, et le corpus reste en lecture seule pour tout le
   * produit. C'est aussi pourquoi ce geste ne « fusionne » rien — il enregistre
   * une décision d'espace, on PROPOSE, on ne fusionne jamais.
   *
   * ⚠️ Ne rend AUCUN état de rapprochement recalculé. Il vit dans la lecture,
   * qui applique la correction à chaud ; le rendre ici en ferait une seconde
   * vérité, qui divergerait au premier import du corpus.
   */
  async recordResolutionDecision(input: {
    readonly workspaceId: string
    readonly accountId: string
    readonly reviewedBy: string
    readonly decision: MarketResolutionDecisionRequest
  }): Promise<MarketResolutionDecisionRecord> {
    const { decision } = input
    // Une chaîne blanche n'est pas une raison. Le contrat la refuse déjà côté
    // requête ; ici on refuse aussi celle qui arriverait par un autre appelant
    // — la colonne dit « la raison, quand la personne a pris la peine de
    // l'écrire », et une suite d'espaces ne l'a pas prise.
    const note = decision.note?.trim() ? decision.note.trim() : null
    const marketCompanyKey = decision.decision === 'confirmed' ? decision.marketCompanyKey : null

    await this.resolutionOverrides.upsert(
      {
        workspaceId: input.workspaceId,
        accountId: input.accountId,
        decision: decision.decision,
        marketCompanyKey,
        note,
        reviewedAt: new Date(),
        reviewedBy: input.reviewedBy,
      },
      ['workspaceId', 'accountId'],
    )

    return { accountId: input.accountId, decision: decision.decision, marketCompanyKey, note }
  }

  /**
   * Rapproche une entreprise du corpus, en disant par quelle FORCE — ou pourquoi
   * il n'a pas rapproché.
   *
   * ⚠️ #1617 — `findAll`, et non plus `findOne`. `match_key` et `website_domain`
   * portent des index NON UNIQUES : `findOne` rendait la PREMIÈRE ligne que la
   * base voulait bien donner, sans `ORDER BY`, donc au hasard. Deux entreprises
   * homonymes — « Orange » l'opérateur et « Orange » la banque — se rapprochaient
   * ainsi indifféremment, et rien ne le disait.
   *
   * L'arbitrage vit dans `resolveMarketCompany`, appliqué à l'identique par
   * `pathsFor`. Un `unresolved` est une bonne réponse ; un `ambiguous` en est une
   * autre, et une meilleure que le silence — c'est elle qui appelle une revue.
   */
  async resolveDetailed(lookup: MarketCompanyLookup): Promise<MarketResolution> {
    const domain = marketRootDomain(lookup.website ?? null)
    const key = marketMatchKey(lookup.name)

    try {
      const [byDomain, byName] = await Promise.all([
        domain ? this.signals.find({ where: { websiteDomain: domain } }) : Promise.resolve([]),
        // Une clé vide rapprocherait tout de tout : elle ne cherche rien.
        key.length > 0 ? this.signals.find({ where: { matchKey: key } }) : Promise.resolve([]),
      ])

      // #1756 — l'alias ne se cherche QUE sur le silence total, ce qui est aussi
      // la seule situation où il sert (voir `resolveMarketCompany`). Une lecture
      // qui rapproche déjà ne paie donc pas cette requête.
      const byAlias =
        byDomain.length === 0 && byName.length === 0
          ? ((await this.aliasCandidates([lookup])).get(lookup.ref) ?? [])
          : []

      const resolution = resolveMarketCompany(byDomain, byName, { country: lookup.country }, byAlias)
      this.reportResolutions([
        { lookup, resolution, probe: { matchKey: key, domain, aliasCandidates: byAlias.length } },
      ])
      return resolution
    } catch (error) {
      // ⚠️ `unavailable`, jamais `unresolved` : « le marché ne connaît pas ce
      // compte » est une affirmation, et on n'a rien lu. Cette méthode est
      // PUBLIQUE — la garantie « ce service ne jette jamais » passe par elle.
      this.logger.error('rapprochement de la mémoire marché impossible', { error })
      return { status: 'unavailable', reason: 'read_failed' }
    }
  }

  /**
   * Le rapprochement de PLUSIEURS entreprises, aligné sur `lookups` : mêmes
   * arbitrages que {@link resolveDetailed} (`resolveMarketCompany`), mais les
   * candidats se lisent en UN `IN` par côté (domaine, nom) au lieu de deux
   * lectures par entreprise — le N+1 mesuré sur GET /target-lists. L'alias ne
   * se cherche toujours que sur le silence total, en une lecture pour tous.
   */
  private async resolveDetailedMany(lookups: readonly MarketCompanyLookup[]): Promise<MarketResolution[]> {
    const probes = lookups.map(lookup => ({
      lookup,
      domain: marketRootDomain(lookup.website ?? null),
      key: marketMatchKey(lookup.name),
    }))
    try {
      const domains = [...new Set(probes.flatMap(p => (p.domain ? [p.domain] : [])))]
      // Une clé vide rapprocherait tout de tout : elle ne cherche rien.
      const keys = [...new Set(probes.filter(p => p.key.length > 0).map(p => p.key))]
      const [byDomainRows, byNameRows] = await Promise.all([
        domains.length > 0 ? this.signals.find({ where: { websiteDomain: In(domains) } }) : Promise.resolve([]),
        keys.length > 0 ? this.signals.find({ where: { matchKey: In(keys) } }) : Promise.resolve([]),
      ])
      const candidates = probes.map(({ domain, key }) => ({
        byDomain: domain ? byDomainRows.filter(row => row.websiteDomain === domain) : [],
        byName: key.length > 0 ? byNameRows.filter(row => row.matchKey === key) : [],
      }))
      const silent = probes.filter((_, i) => candidates[i].byDomain.length === 0 && candidates[i].byName.length === 0)
      const aliasByRef = silent.length > 0 ? await this.aliasCandidates(silent.map(p => p.lookup)) : new Map()
      const resolutions = probes.map(({ lookup }, i) => {
        const { byDomain, byName } = candidates[i]
        const byAlias = byDomain.length === 0 && byName.length === 0 ? (aliasByRef.get(lookup.ref) ?? []) : []
        return {
          byAlias,
          resolution: resolveMarketCompany(byDomain, byName, { country: lookup.country }, byAlias),
        }
      })
      this.reportResolutions(
        probes.map(({ lookup, domain, key }, i) => ({
          lookup,
          resolution: resolutions[i].resolution,
          probe: { matchKey: key, domain, aliasCandidates: resolutions[i].byAlias.length },
        })),
      )
      return resolutions.map(r => r.resolution)
    } catch (error) {
      // ⚠️ `unavailable`, jamais `unresolved` : on n'a rien lu.
      this.logger.error('rapprochement groupé de la mémoire marché impossible', { error })
      return probes.map((): MarketResolution => ({ status: 'unavailable', reason: 'read_failed' }))
    }
  }

  /**
   * LES TROIS ISSUES DU RAPPROCHEMENT ONT UN LECTEUR — le journal d'exploitation.
   *
   * ⚠️ Sans ce lecteur, `ambiguity` et `ambiguityDropped` seraient des champs
   * calculés que personne ne consulte : le défaut n°1 de ce dépôt, réintroduit
   * dans le lot qui le corrige. #1617 demandait un écran « Résolutions Market
   * Memory à revoir » — LIVRÉ le 08/09/2026 sous #1633/#1635/#1634 : les quatre
   * seaux (`covered`/`insufficientObservations`/`ambiguous`/`unresolved`) que
   * `classifyPortfolio` calcule juste au-dessous sont exposés par
   * `portfolioFor` → `GET /accounts/market-memory-portfolio` →
   * `useMarketMemoryPortfolio` → `MarketMemoryCoverageCard` / `MarketReviewQueue`
   * → `/pilotage/qualite` (et `/pilotage/marche`). ⚠️ #1633.3 a néanmoins REFUSÉ,
   * à dessein, de transformer `unresolved` en LISTE de noms (voir le docblock
   * de `MarketReviewQueue.tsx`) : « il n'y a rien à arbitrer… une liste de
   * gestes proposerait un travail qui n'existe pas ». Cette décision tient
   * toujours — la lecture NOMMÉE d'un compte non résolu reste donc dans les
   * journaux ci-dessous, pas à l'écran, et ce n'est pas un oubli.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * #1756 — LE TROU QUE CE LOT COMBLE : `unresolved` NE DISAIT RIEN
   * ───────────────────────────────────────────────────────────────────────────
   * Des trois issues, une seule ne laissait AUCUNE trace : zéro candidat des
   * deux côtés. C'est-à-dire le cas le plus fréquent, et le plus dangereux —
   * plus silencieux encore que l'ambiguïté que #1617 avait corrigée. À l'écran,
   * « je n'ai pas résolu cette entité » et « ce compte n'a pas de parcours » se
   * rendent pareil ; ce sont deux phrases très différentes, et personne ne
   * pouvait dire laquelle était vraie. « Combien de comptes ne se résolvent pas,
   * et lesquels ? » n'avait pas de réponse — c'est la règle « non mesuré n'est
   * jamais 0 » appliquée à une jointure.
   *
   * ⚠️ **Niveau `log` (info), pas `warn`.** Un compte non résolu n'est pas une
   * alerte : le corpus a parfaitement le droit de ne pas connaître une
   * entreprise. Mais il doit être COMPTABLE, donc il ne peut pas être en
   * `debug` — winston filtre à `info`, et `debug` ne sortirait jamais en
   * production. Le transport Sentry, lui, ne prend que `error` : ces lignes
   * restent dans les journaux et ne créent aucun événement.
   *
   * ⚠️ **UNE ligne par appel, pas une par compte.** Un tableau de bord lit un
   * portefeuille entier ; une ligne par compte non résolu rendrait le journal
   * illisible, et « un journal qui parle toujours ne se lit plus ». Le compte
   * est donc exact et la liste complète, sur une seule ligne — sans troncature,
   * parce qu'une liste coupée fait lire le sous-total comme un total.
   *
   * Aucune donnée personnelle : des noms d'entreprises, des clés normalisées et
   * des comptages. Les `ref` sont les identifiants d'appelant — ce sont eux qui
   * répondent à « LESQUELS ».
   */
  private reportResolutions(entries: readonly MarketResolutionReport[]): void {
    for (const { lookup, resolution } of entries) {
      const ambiguity = resolution.status === 'ambiguous' ? resolution.ambiguity : null
      const dropped = resolution.status === 'resolved' ? resolution.ambiguityDropped : null
      if (!ambiguity && !dropped) continue

      this.logger.warn('résolution de mémoire marché à revoir', {
        company: lookup.name,
        country: lookup.country ?? null,
        // `ambiguous` : aucun rapprochement. `dropped` : on a tranché par l'autre
        // côté, mais celui-ci reste douteux et mérite le même œil.
        outcome: resolution.status,
        on: (ambiguity ?? dropped)?.on,
        candidates: (ambiguity ?? dropped)?.candidates,
      })
    }

    const unresolved = entries.filter(entry => entry.resolution.status === 'unresolved')
    if (unresolved.length > 0) {
      this.logger.log('mémoire marché : entités NON RÉSOLUES', {
        // Une clé machine STABLE : c'est elle qu'on compte, pas la phrase
        // française, qui se reformule sans prévenir.
        event: 'market_memory_unresolved',
        looked_up: entries.length,
        unresolved: unresolved.length,
        companies: unresolved.map(entry => ({
          ref: entry.lookup.ref,
          name: entry.lookup.name,
          // La clé de nom qui n'a rien trouvé EST le renseignement actionnable :
          // c'est très exactement ce qu'une ligne de `market_company_alias`
          // aurait à rapprocher.
          match_key: entry.probe.matchKey,
          // `null` dit « aucun domaine à essayer », ce qui n'est pas « le
          // domaine n'a rien donné ». Les deux mènent à zéro candidat pour des
          // raisons opposées, et seule la première est réparable par un alias.
          domain: entry.probe.domain,
          // > 1 ⇒ l'alias existe mais vise plusieurs entreprises : la table
          // d'alias est à corriger, pas à compléter.
          alias_candidates: entry.probe.aliasCandidates,
        })),
      })
    }

    // #1756 — une résolution PAR ALIAS est une APPROXIMATION, et elle se compte
    // à part : sans ce compteur, on ne saurait jamais si la table d'alias
    // rattrape des comptes ou en attrape de travers.
    const byAlias = entries.filter(
      entry => entry.resolution.status === 'resolved' && entry.resolution.matchedOn === 'alias',
    )
    if (byAlias.length > 0) {
      this.logger.log('mémoire marché : entités résolues par ALIAS', {
        event: 'market_memory_resolved_by_alias',
        resolved_by_alias: byAlias.length,
        companies: byAlias.map(entry => ({
          ref: entry.lookup.ref,
          name: entry.lookup.name,
          match_key: entry.probe.matchKey,
          company_key: entry.resolution.status === 'resolved' ? entry.resolution.companyKey : null,
        })),
      })
    }
  }

  /**
   * #1756 — LES CANDIDATS PAR ALIAS, par référence d'appelant.
   *
   * Deux requêtes au plus, quel que soit le nombre de comptes : les lignes
   * d'alias en un `IN`, puis les entreprises qu'elles visent. Zéro requête quand
   * aucune clé n'est cherchable, et une seule quand la table est vide.
   *
   * ⚠️ Un alias qui vise une entreprise ABSENTE du corpus ne désigne rien, et
   * disparaît ici sans bruit : c'est le cas normal après un réimport qui a fait
   * bouger une clé, et surtout pas une panne. Deux lignes qui visent la MÊME
   * entreprise ne font qu'un candidat — l'ambiguïté doit venir de la donnée, pas
   * du stockage.
   */
  private async aliasCandidates(
    lookups: readonly MarketCompanyLookup[],
  ): Promise<ReadonlyMap<string, MarketCompanySignalEntity[]>> {
    const refsByAliasKey = new Map<string, string[]>()
    for (const lookup of lookups) {
      const aliasKey = marketAliasKey(lookup.name)
      // Une clé vide rapprocherait tout de tout : elle ne cherche rien.
      if (aliasKey.length === 0) continue
      refsByAliasKey.set(aliasKey, [...(refsByAliasKey.get(aliasKey) ?? []), lookup.ref])
    }
    if (refsByAliasKey.size === 0) return new Map()

    const aliasRows = await this.aliases.find({ where: { aliasKey: In([...refsByAliasKey.keys()]) } })
    // Table vide ⇒ on s'arrête ici, et le chemin est celui d'avant ce lot.
    if (aliasRows.length === 0) return new Map()

    const signals = await this.signals.find({ where: { companyKey: In(aliasTargetKeys(aliasRows)) } })
    const signalByKey = new Map(signals.map(row => [row.companyKey, row]))

    const byRef = new Map<string, MarketCompanySignalEntity[]>()
    for (const alias of aliasRows) {
      const signal = signalByKey.get(alias.companyKey)
      if (!signal) continue
      for (const ref of refsByAliasKey.get(alias.aliasKey) ?? []) {
        const current = byRef.get(ref) ?? []
        if (current.some(row => row.companyKey === signal.companyKey)) continue
        byRef.set(ref, [...current, signal])
      }
    }
    return byRef
  }

  /**
   * Le rapprochement, réduit à ce que les appelants d'aujourd'hui consomment.
   *
   * `null` couvre à la fois « personne ne répond » et « plusieurs répondent » :
   * pour un écran, les deux se rendent pareil — pas de mémoire. La distinction
   * vit dans `resolveDetailed`, et c'est elle que le rapport de qualité lira.
   */
  async resolve(lookup: MarketCompanyLookup): Promise<MarketCompanyMatch | null> {
    const resolution = await this.resolveDetailed(lookup)
    return resolution.status === 'resolved'
      ? { companyKey: resolution.companyKey, strength: resolution.strength }
      : null
  }

  /**
   * #1624 / #1631.4 / #1606.2 (lot 14) — LA dérivation d'une ligne ESN observée,
   * pour `coverageFor` ET `searchByFilters` : deux filtres qui la refont
   * divergent, et c'est précisément ce qui s'est produit.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE DÉFAUT MESURÉ EN PRODUCTION LE 10/09/2026, ET LA CORRECTION
   * ─────────────────────────────────────────────────────────────────────────
   * `GET /api/accounts/.../partners` (BNP Paribas) rendait Keyrus à
   * **2 parcours**, certitude « faible » — et l'écran affichait littéralement
   * « 2 parcours observés relient Keyrus à cet environnement. » Les DEUX sites
   * qui construisaient cette liste filtraient par `MARKET_OBSERVATION_MIN_PERSONS`
   * (2 — pensé pour la pile technique, une notion DIFFÉRENTE : une techno citée
   * une fois n'est pas un environnement). Le seuil qui compte ICI est celui de
   * TOUTE la mémoire marché, `MARKET_MEMORY_MIN_PATHS` (3) : sous 3 parcours,
   * la doctrine dit qu'une entité n'apparaît pas — et jusqu'à ce correctif,
   * elle apparaissait quand même dès que l'ENTREPRISE, elle, passait le seuil
   * global. Un plancher juste à un endroit (le total de l'entreprise, ligne
   * ~455) et faux un cran plus bas (chaque ESN qui la compose).
   *
   * ⚠️ Ce même défaut rendait FAUSSE l'affirmation du docblock de tête de ce
   * service (« sous MARKET_MEMORY_MIN_PATHS, la couverture est VIDE — pas
   * partielle, pas « 2 parcours » ») : elle décrivait le total, jamais démenti,
   * mais se lisait comme une garantie sur CHAQUE nombre exposé par ce service —
   * garantie que ce filtre-ci ne tenait pas. Vraie depuis ce correctif.
   */
  private static esnObservedFrom(rows: readonly { esnName: string; persons: number }[]): MarketEsnObserved[] {
    return rows.filter(meetsEsnObservedFloor).map(row => ({
      esnName: row.esnName,
      persons: row.persons,
      certainty: observedCertainty(row.persons),
    }))
  }

  /**
   * #3225 (recette prod 01/10) — la pile observée, au plancher que son CONTRAT
   * exige (`observedStackSchema` : deux personnes au moins — une techno citée
   * une fois n'est pas un environnement). Rendre une ligne à 1 ne la « montrait »
   * pas : elle faisait échouer le `safeParse` du pont, donc la lecture ENTIÈRE du
   * groupe (`contract_mismatch`) — « la lecture de la mémoire marché pour LA
   * POSTE a échoué ». Le plancher ESN (`meetsEsnObservedFloor`, 1 — #4016 L10) est une autre
   * règle : ne pas les confondre.
   */
  private static observedStackFrom(
    rows: readonly { readonly techno: string; readonly persons: number }[],
  ): { techno: string; persons: number }[] {
    return rows
      .filter(stackRow => stackRow.persons >= MARKET_OBSERVATION_MIN_PERSONS)
      .map(stackRow => ({ techno: stackRow.techno, persons: stackRow.persons }))
  }

  /** La couverture d'une entreprise résolue, à partir des lignes DÉJÀ lues — partagée par la lecture unitaire et la lecture groupée. */
  private static coverageFrom(
    signal: MarketCompanySignalEntity,
    esnRows: readonly MarketEsnClientEntity[],
    stackRows: readonly MarketCompanyStackEntity[],
    exEsnRows: readonly MarketExEsnAtClientEntity[],
  ): MarketMemoryCoverage {
    const esnObserved = MarketMemoryService.esnObservedFrom(esnRows)

    const exEsnTotal = exEsnRows.reduce((sum, row) => sum + row.persons, 0)

    const coverage: MarketMemoryCoverage = {
      covered: true,
      marketPaths: signal.pathsTotal,
      esnObserved,
      observedStack: MarketMemoryService.observedStackFrom(stackRows),
      roleFamilies: [...signal.roleFamilies],
      // `0` deviendrait « on a mesuré, il n'y en a aucun » — faux. Non mesuré.
      exEsnPresent: exEsnTotal > 0 ? exEsnTotal : null,
      // #1608 / #1630.10 — ingérées depuis le 06/09, jamais recopiées avant.
      observedZone: buildObservedZone(signal),
      // #3212.3 (reste, épopée #3235) — la révision du corpus qui a produit
      // ce comptage (`market_company_signal.dataset_version`), relue TELLE
      // QUELLE, jamais recalculée (GA-258). Câble `market_memory_version`
      // (#2318.5) jusqu'à CETTE lecture ; le relais jusqu'à `analysis_runs`
      // (graphe IA → événement `run_completed`, même plomberie que
      // `prompt_versions`) reste un chantier séparé — voir le commentaire
      // de clôture de #3235.
      datasetVersion: signal.datasetVersion,
      // #3672 — la période couverte, relue telle quelle (jamais une date
      // d'observation) : c'est ce qui date « Historique observé ».
      periodEnd: signal.periodEnd,
    }

    return coverage
  }

  /**
   * #4072.5 — la couverture de PLUSIEURS entreprises d'un coup (liste de cibles) : une
   * requête `IN (...)` par table (signaux, ESN, piles, ex-ESN) répartie en mémoire, au
   * lieu de quatre lectures par compte. Même résultat que {@link coverageFor}, clé `ref`.
   * Le rapprochement reste unitaire (il décide de l'identité) ; seules les lectures de
   * couverture sont groupées.
   */
  async coverageForMany(lookups: readonly MarketCompanyLookup[]): Promise<Map<string, MarketMemoryRead>> {
    const out = new Map<string, MarketMemoryRead>()
    if (lookups.length === 0) return out
    try {
      const resolved = await this.resolveDetailedMany(lookups)
      const resolutions = lookups.map((lookup, i) => ({ lookup, resolution: resolved[i] }))
      const keys = new Set<string>()
      for (const { lookup, resolution } of resolutions) {
        if (resolution.status === 'unavailable')
          out.set(lookup.ref, { status: 'unavailable', reason: resolution.reason })
        else if (resolution.status !== 'resolved')
          out.set(lookup.ref, { status: 'ok', coverage: EMPTY_MARKET_MEMORY_COVERAGE })
        else keys.add(resolution.companyKey)
      }
      if (keys.size === 0) return out
      const list = [...keys]
      const [signals, esnRows, stackRows, exEsnRows] = await Promise.all([
        this.signals.find({ where: { companyKey: In(list) } }),
        this.esnClients.find({ where: { clientKey: In(list) }, order: { persons: 'DESC' } }),
        this.stacks.find({ where: { companyKey: In(list) }, order: { persons: 'DESC' } }),
        this.exEsn.find({ where: { clientKey: In(list) } }),
      ])
      const signalByKey = new Map(signals.map(row => [row.companyKey, row]))
      for (const { lookup, resolution } of resolutions) {
        if (resolution.status !== 'resolved') continue
        const key = resolution.companyKey
        const signal = signalByKey.get(key)
        if (!signal || signal.pathsTotal < MARKET_MEMORY_MIN_PATHS) {
          out.set(lookup.ref, { status: 'ok', coverage: EMPTY_MARKET_MEMORY_COVERAGE })
          continue
        }
        out.set(lookup.ref, {
          status: 'ok',
          coverage: MarketMemoryService.coverageFrom(
            signal,
            esnRows.filter(row => row.clientKey === key),
            stackRows.filter(row => row.companyKey === key),
            exEsnRows.filter(row => row.clientKey === key),
          ),
        })
      }
      return out
    } catch (error) {
      this.logger.error('lecture groupée de la mémoire marché impossible', { error })
      for (const lookup of lookups)
        if (!out.has(lookup.ref)) out.set(lookup.ref, { status: 'unavailable', reason: 'read_failed' })
      return out
    }
  }

  /** Ce que la mémoire sait d'UNE entreprise, pour l'écran, le prompt et le copilote. */
  async coverageFor(lookup: MarketCompanyLookup): Promise<MarketMemoryRead> {
    try {
      const resolution = await this.resolveDetailed(lookup)
      // ⚠️ `resolveDetailed` avale sa propre panne pour ne jamais jeter : c'est
      // ICI qu'on la relaie. Sans cette ligne, une lecture en erreur ressortirait
      // en couverture VIDE — « le marché ne connaît pas ce compte » — et l'écran
      // ne pourrait plus distinguer une absence d'une panne.
      if (resolution.status === 'unavailable') return { status: 'unavailable', reason: resolution.reason }
      // `ambiguous` et `unresolved` se rendent pareil à l'écran, à dessein : dans
      // les deux cas il n'y a pas de mémoire à montrer. C'est le rapport de
      // qualité qui les sépare, pas le dossier de compte.
      if (resolution.status !== 'resolved') return { status: 'ok', coverage: EMPTY_MARKET_MEMORY_COVERAGE }

      const signal = await this.signals.findOne({ where: { companyKey: resolution.companyKey } })
      if (!signal || signal.pathsTotal < MARKET_MEMORY_MIN_PATHS) {
        return { status: 'ok', coverage: EMPTY_MARKET_MEMORY_COVERAGE }
      }

      const [esnRows, stackRows, exEsnRows] = await Promise.all([
        this.esnClients.find({ where: { clientKey: resolution.companyKey }, order: { persons: 'DESC' } }),
        this.stacks.find({ where: { companyKey: resolution.companyKey }, order: { persons: 'DESC' } }),
        this.exEsn.find({ where: { clientKey: resolution.companyKey } }),
      ])

      return { status: 'ok', coverage: MarketMemoryService.coverageFrom(signal, esnRows, stackRows, exEsnRows) }
    } catch (error) {
      this.logger.error('lecture de la mémoire marché impossible', { error })
      return { status: 'unavailable', reason: 'read_failed' }
    }
  }

  /**
   * #2284.26 (#2978, lot SRC2 28/09/2026) — le DOMAINE que la mémoire marché
   * peut PROUVER pour ce compte, via son côté le plus FAIBLE : l'alias
   * (`resolveMarketCompany`, `matchedOn: 'alias'` — #1756, une équivalence
   * déclarée, jamais un domaine racine partagé, ne tranche QUE le silence
   * total des deux autres côtés). Un rapprochement par domaine ou par nom
   * n'apporte ici RIEN de nouveau (l'entity resolver a déjà sa propre source
   * `official_domain`) : cette méthode ne répond donc que sur `alias`.
   *
   * `null` sur tout le reste — pas de résolution, résolution par
   * domaine/nom (déjà couvert ailleurs), alias trouvé mais SANS domaine connu
   * côté corpus, ou lecture en panne. Jamais deviné.
   */
  async aliasProvenDomain(lookup: MarketCompanyLookup): Promise<string | null> {
    try {
      const resolution = await this.resolveDetailed(lookup)
      if (resolution.status !== 'resolved' || resolution.matchedOn !== 'alias') return null
      const signal = await this.signals.findOne({ where: { companyKey: resolution.companyKey } })
      return signal?.websiteDomain ?? null
    } catch (error) {
      this.logger.error('lecture du domaine prouvé par alias impossible', { error })
      return null
    }
  }

  /**
   * #3177.2 / épopée #3225 — LA MÉMOIRE MARCHÉ D'UN GROUPE : une entité RACINE
   * (`company_id` résolu par l'appelant) et jusqu'à `MARKET_MEMORY_GROUP_MAX_ENTITIES`
   * filiales, une lecture PAR IDENTITÉ (`coverageFor`) pour chacune — jamais une
   * seconde requête SQL : GA-258 tient la porte, cette méthode ne fait
   * qu'ORCHESTRER des appels à la méthode ci-dessus.
   *
   * Rendue dans la MÊME forme que `searchByFilters` (`MarketMemorySearchRead`,
   * une entrée par entité) plutôt qu'un troisième contrat de sortie : la carte
   * `search_market_memory` existante sait déjà lire une liste d'entreprises
   * avec leur couverture (GA-26 — un réglage, une forme, vivent à un seul
   * endroit).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QUE CETTE MÉTHODE NE FAIT PAS
   * ─────────────────────────────────────────────────────────────────────────
   * Elle ne SOMME rien entre les entités : chaque filiale reste une personne
   * morale distincte, nommée sur sa propre ligne — additionner leurs parcours
   * en un seul chiffre de « groupe » inventerait une mesure qu'aucune des cinq
   * tables ne porte. Doctrine : « on n'affiche pas ce qu'on n'a pas » — une
   * entité SANS couverture ne fait donc AUCUNE ligne dans `matches`, exactement
   * comme `searchByFilters` le fait déjà pour un `signal` sous le seuil.
   *
   * Si la RACINE (premier élément) ne peut pas être lue (`unavailable`), le
   * groupe entier est `unavailable` — la question posée porte sur CE groupe,
   * une panne sur son identité n'a pas de sens à moitié répondue. Une filiale
   * qui échoue seule, elle, est ignorée en best-effort (même décision que
   * `portfolioAccountsByKey` : une panne de rapprochement ne perd jamais toute
   * la recherche).
   */
  async coverageForGroup(
    lookups: readonly MarketCompanyLookup[],
    options: { readonly rootAccountRoute?: string } = {},
  ): Promise<MarketMemorySearchRead> {
    if (lookups.length === 0) {
      throw new BadRequestException('Un scope de groupe demande au moins une entité résolue.')
    }
    const bounded = lookups.slice(0, MARKET_MEMORY_GROUP_MAX_ENTITIES)
    const reads = await Promise.all(bounded.map(lookup => this.coverageFor(lookup)))

    const rootRead = reads[0]
    if (rootRead.status === 'unavailable') return rootRead

    const matches: MarketMemorySearchMatch[] = []
    bounded.forEach((lookup, index) => {
      const read = reads[index]
      if (read.status !== 'ok' || !read.coverage.covered) return
      matches.push({
        companyName: lookup.name,
        coverage: read.coverage,
        ...(index === 0 && options.rootAccountRoute ? { accountRoute: options.rootAccountRoute } : {}),
      })
    })

    return { status: 'ok', matches, truncated: lookups.length > bounded.length }
  }

  /**
   * #1640.2 — L'INDEX PAR COHORTE D'UNE SEULE ENTREPRISE, et l'appelant qui manquait.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QUI EXISTAIT, ET CE QUI MANQUAIT
   * ─────────────────────────────────────────────────────────────────────────
   * `buildCohortIndexReport` (`@bellum/contracts`) calcule l'index sur un
   * CORPUS entier — trois axes, seuil de trois axes, cinq raisons d'exclusion
   * nommées. Il était juste, testé, mesurable par script… et appelé par
   * personne sur le chemin produit : aucune méthode ne répondait à « quel est
   * l'index de CETTE entreprise ? », la seule question qu'un dossier de compte
   * pose. C'est le défaut n°1 de ce dépôt, et c'est cette méthode qui le ferme.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI ELLE VIT ICI, ET NULLE PART AILLEURS
   * ─────────────────────────────────────────────────────────────────────────
   * GA-258 tient la porte d'entrée : `market_company_signal` ne se lit que
   * depuis ce service. La cohorte d'une entreprise, c'est sa tranche
   * d'effectif — donc une seconde lecture de la MÊME table, qui n'avait aucune
   * raison d'ouvrir une seconde porte.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LA RÈGLE D'ÉLIGIBILITÉ N'EST PAS RECOPIÉE EN SQL
   * ─────────────────────────────────────────────────────────────────────────
   * La requête ci-dessous ne filtre que sur la TRANCHE — une clé de
   * groupement, pas une règle. « Qui peut être un pair » (`isCohortPeer` :
   * seuil produit franchi, score brut lu) reste dans le calcul, appliqué par
   * `buildCohortPeerScores`. Une clause `WHERE paths_total >= 3 AND
   * externalization_score IS NOT NULL` aurait été une SECONDE écriture de la
   * même règle, dans un autre langage, qui diverge le jour où l'échelle bouge
   * d'un cran — et personne ne le verrait, parce que les deux resteraient
   * plausibles.
   *
   * ⚠️ La cohorte est mise en cache PAR TRANCHE ({@link COHORT_PEERS_TTL_MS}),
   * comme la table des fréquences par techno et pour la même raison : le
   * corpus ne bouge qu'à l'ingestion, et une tranche peut compter plusieurs
   * milliers de lignes qu'on ne veut pas relire à chaque ouverture d'un
   * dossier.
   *
   * ⚠️ **Cette méthode n'affiche rien.** `MARKET_MEMORY_SCORING_ENABLED` reste
   * `false`, et c'est le CONTRÔLEUR qui lit ce drapeau — à un seul endroit
   * (GA-26). Calculer l'index et l'ALLUMER sont deux décisions ; la seconde
   * attend la calibration sur données réelles.
   */
  async cohortIndexFor(lookup: MarketCompanyLookup): Promise<MarketCohortIndexRead> {
    try {
      const resolution = await this.resolveDetailed(lookup)
      // Une panne se relaie — voir `coverageFor`. Sans cette ligne, une lecture
      // en erreur ressortirait en « pas d'index », c'est-à-dire une affirmation
      // sur le corpus alors qu'on n'a rien lu.
      if (resolution.status === 'unavailable') return { status: 'unavailable', reason: resolution.reason }
      // `unresolved` et `ambiguous` se rendent pareil, comme partout sur le
      // dossier : dans les deux cas il n'y a pas d'entreprise à comparer.
      // Ce n'est PAS une des cinq raisons d'exclusion, qui décrivent une ligne
      // DU corpus — ajouter une sixième raison mentirait sur ce qu'elles
      // énumèrent.
      if (resolution.status !== 'resolved') return { status: 'ok', index: null }

      const signal = await this.signals.findOne({ where: { companyKey: resolution.companyKey } })
      if (!signal) return { status: 'ok', index: null }

      const row = MarketMemoryService.toCohortIndexSignal(signal)
      // Sans tranche, il n'y a pas de cohorte à lire : `classifyCohortIndex`
      // rend `noBracket` sans jamais regarder les pairs, donc la coquille vide
      // n'est pas lue. C'est la requête inutile qu'on évite ici, pas un test
      // de plus — la raison, elle, reste celle du calcul.
      const bracket = row.headcountBracket
      const peers = bracket === null ? { bracket: '', sortedScores: [] } : await this.cohortPeersFor(bracket)

      return { status: 'ok', index: toAccountCohortIndex(classifyCohortIndex(row, peers)) }
    } catch (error) {
      this.logger.error('lecture de l’index de cohorte impossible', { error })
      return { status: 'unavailable', reason: 'read_failed' }
    }
  }

  /**
   * #1640.2 — La conversion base → domaine, écrite une fois.
   *
   * `numeric` Postgres revient en `string` : un score illisible devient `null`,
   * jamais un `0` inventé — « on n'a pas su lire » et « le corpus dit zéro » ne
   * sont pas la même affirmation. Même règle que `toCohortIndexSignal` du
   * script de mesure, qui lit la même colonne en bloc.
   */
  private static toCohortIndexSignal(signal: MarketCompanySignalEntity): CohortIndexSignal {
    const parsed = signal.externalizationScore === null ? null : Number(signal.externalizationScore)
    return {
      companyKey: signal.companyKey,
      headcountBracket: signal.headcountBracket,
      pathsTotal: signal.pathsTotal,
      externalizationScore: parsed === null || Number.isNaN(parsed) ? null : parsed,
    }
  }

  /** Les scores triés des pairs d'une tranche — lus une fois par heure, pas par dossier. */
  private async cohortPeersFor(bracket: string): Promise<CohortPeerScores> {
    const now = Date.now()
    const cached = this.cohortPeersCache.get(bracket)
    if (cached && cached.expiresAt > now) return cached.value

    const rows = await this.signals.find({
      where: { headcountBracket: bracket },
      select: { companyKey: true, headcountBracket: true, pathsTotal: true, externalizationScore: true },
    })
    const value = buildCohortPeerScores(bracket, rows.map(MarketMemoryService.toCohortIndexSignal))
    this.cohortPeersCache.set(bracket, { value, expiresAt: now + COHORT_PEERS_TTL_MS })
    return value
  }

  /**
   * #1636 — CE QUE LA MÉMOIRE OBSERVE D'UNE ENTREPRISE **EN TANT QUE SOCIÉTÉ DE
   * SERVICES**, pour que l'utilisateur puisse juger la matière sur la seule
   * entreprise qu'il connaît par cœur : la sienne.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * UNE DIRECTION DE LECTURE QUE PERSONNE N'OUVRAIT
   * ───────────────────────────────────────────────────────────────────────────
   * `coverageFor` regarde une entreprise comme un CLIENT : il interroge
   * `market_esn_client` et `market_ex_esn_at_client` par `client_key`. Les deux
   * tables portent pourtant l'AUTRE colonne depuis l'ingestion — `esn_key` et
   * `esn_origin_key` — et aucune lecture du dépôt n'y entrait (vérifié le
   * 11/09/2026 : `esnKey` et `esnOriginKey` n'apparaissaient que dans l'entité
   * et l'import). C'est elle qui répond à « où sont les anciens de cette
   * société de services aujourd'hui », c'est-à-dire aux « écosystèmes de
   * destination » que #1636 demande — sans rien inventer.
   *
   * ⚠️ Ce que le corpus ne permet PAS de garantir : que `esn_origin_key` vive
   * dans le même espace de clés que `company_key`. Les deux viennent des
   * colonnes du corpus (`esn_origine`, `cle`) et `searchByFilters` joint déjà
   * `esn.client_key = signal.company_key`, donc c'est très probable — mais ce
   * n'est pas prouvé. Le risque est BORNÉ par construction : si les clés ne se
   * rencontrent pas, la liste est vide et le bloc dit « pas assez
   * d'observations ». Une jointure qui échoue rend ici un SILENCE, jamais une
   * entreprise fausse.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * LE RAPPROCHEMENT EST FAIBLE, ET IL LE DIT
   * ───────────────────────────────────────────────────────────────────────────
   * Le profil ESN d'un espace ne porte NI site NI numéro d'identification
   * (`esn_profiles` : `esn_name` et rien d'autre qui identifie) — le
   * rapprochement se fait donc par le NOM seul, que `market-company-key.ts`
   * marque `inferred` et que l'appelant « a le droit de refuser ». On ne le
   * refuse pas ici, on le REND VÉRIFIABLE : `matchedCompanyName` voyage avec le
   * résultat pour que l'écran nomme l'entreprise rapprochée. L'utilisateur est
   * la seule personne au monde capable de démentir d'un coup d'œil.
   *
   * L'ambiguïté, elle, reste refusée : `resolveMarketCompany` ne départage pas
   * deux homonymes, et « pas assez d'observations » est alors la bonne réponse.
   */
  async esnViewFor(lookup: MarketCompanyLookup): Promise<MarketEsnViewRead> {
    try {
      const resolution = await this.resolveDetailed(lookup)
      // Une panne se relaie — voir `coverageFor` : sans cette ligne, une lecture
      // en erreur ressortirait en « pas assez d'observations », c'est-à-dire une
      // affirmation sur le corpus alors qu'on n'a rien lu.
      if (resolution.status === 'unavailable') return { status: 'unavailable', reason: resolution.reason }
      // `ambiguous` et `unresolved` se rendent pareil ici, comme dans le dossier
      // de compte : dans les deux cas il n'y a rien à montrer.
      if (resolution.status !== 'resolved') return { status: 'insufficient' }

      const signal = await this.signals.findOne({ where: { companyKey: resolution.companyKey } })
      // #1636 — sous le plancher : « pas suffisamment couverte », jamais un zéro.
      if (!signal || signal.pathsTotal < MARKET_MEMORY_MIN_PATHS) return { status: 'insufficient' }

      const destinationRows = await this.exEsn.find({
        where: { esnOriginKey: resolution.companyKey },
        order: { persons: 'DESC' },
      })

      return {
        status: 'ok',
        view: {
          matchedCompanyName: signal.companyName,
          matchedOn: resolution.matchedOn,
          pathsObserved: signal.pathsTotal,
          // Le seau de résidu sort AVANT la troncature : mesuré en production,
          // « Autre » est premier sur cinq entreprises sur cinq, et une liste de
          // trois qui commence par le fourre-tout perd un tiers de sa ligne.
          // Même filtre que l'aperçu de `/search`, jamais une seconde dérivation.
          roleFamilies: [...signal.roleFamilies]
            .filter(entry => !isResidualRoleFamily(entry.family))
            .sort(byPersonsThenName(entry => entry.family))
            .slice(0, MARKET_ESN_VIEW_MAX_ITEMS)
            .map(entry => entry.family),
          // Le MÊME plancher par ligne qu'`esnObservedFrom` : un couple
          // d'organisations relié par deux parcours n'est pas une observation.
          // Et AUCUN comptage ne sort — voir `marketEsnViewSchema` : ici le
          // lecteur est l'employeur des personnes comptées.
          //
          // ⚠️ Le tri est REFAIT ici alors que la requête porte déjà son
          // `ORDER BY` : une troncature qui fait confiance à l'ordre de son
          // lecteur garde les trois PREMIÈRES lignes, pas les trois plus
          // observées, et rien ne le montre — le corpus rend « GROS, MOYEN,
          // PETIT » aujourd'hui et « PETIT, … » le jour où quelqu'un touche à
          // la requête. Le coût est nul sur trois lignes.
          destinations: destinationRows
            .filter(meetsObservationFloor)
            .sort(byPersonsThenName(row => row.clientName))
            .slice(0, MARKET_ESN_VIEW_MAX_ITEMS)
            .map(row => row.clientName),
        },
      }
    } catch (error) {
      this.logger.error('lecture de la mémoire marché (vue société de services) impossible', { error })
      return { status: 'unavailable', reason: 'read_failed' }
    }
  }

  /**
   * #1631.3/.4, #1606.2 (lot 14) — L'AXE CHEMIN de l'adressabilité, dans la
   * forme exacte qu'attend `addressability_for_company` côté IA (`_path_axis`,
   * lot 13 : `apps/ia/app/services/discover_scoring.py`).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE DÉFAUT QUE CETTE MÉTHODE REFERME
   * ─────────────────────────────────────────────────────────────────────────
   * Le lot 13 avait livré le CALCUL (`_path_axis`) mais aucun appelant ne lui
   * transmettait `market_paths_observed` : l'axe restait NON MESURÉ en
   * production et le CTA « Explorer les partenaires » posé dessous restait
   * invisible — le défaut n°1 du dépôt, du code juste que personne n'appelle.
   * `MarketMemoryService` est la SEULE porte vers les tables partagées (GA-258) ;
   * cette méthode est la SEULE dérivation de « combien de parcours, et quelle
   * ESN nommer » — les deux appelants (`AnalysisService`, `AnalysisOnDemandService`)
   * la consomment telle quelle plutôt que de refaire chacun leur lecture de
   * `coverageFor`, ce qui les ferait diverger au premier tri changé.
   *
   * `paths` est le TOTAL agrégé (`coverage.marketPaths`), jamais le compte
   * d'une seule ESN : c'est ce total, toutes ESN confondues, que `_path_axis`
   * documente attendre. `topEsn` ne sert qu'à NOMMER la preuve (« … relient
   * ALTEN … » plutôt qu'anonyme) — `esnObserved` est déjà trié par `persons`
   * DESC, donc son premier élément est la plus observée.
   *
   * `null` couvre trois cas indiscernables pour cet appelant, et c'est voulu :
   * aucune couverture, couverture sous le seuil transverse, lecture en panne.
   * Dans les trois cas l'axe `path` doit rester NON MESURÉ côté IA — jamais un
   * `0` — donc la clé `marketPathsObserved` ne doit alors pas être envoyée.
   */
  async pathAxisFor(
    lookup: MarketCompanyLookup,
  ): Promise<{ readonly paths: number; readonly topEsn: string | null } | null> {
    const read = await this.coverageFor(lookup)
    if (read.status !== 'ok' || !read.coverage.covered || read.coverage.marketPaths === null) return null
    return {
      paths: read.coverage.marketPaths, // #4016 L10 — « dominante » : le plancher à 1 des lignes ne vaut pas
      // pour NOMMER la preuve d'un axe IA, qui garde le seuil transverse.
      topEsn: read.coverage.esnObserved.find(esn => esn.persons >= MARKET_MEMORY_MIN_PATHS)?.esnName ?? null,
    }
  }

  /**
   * Le compte de parcours pour PLUSIEURS entreprises d'un coup.
   *
   * C'est la lecture des listes et des compteurs : une ligne par compte, sans
   * une requête par ligne. Chaque référence d'appelant ressort, avec `null`
   * quand l'entreprise n'est pas couverte ou passe sous le seuil.
   *
   * ⚠️ En cas de panne, `unavailable` — et l'appelant ne rend alors PAS son
   * compteur. Un « 0 » sur une panne serait un mensonge présenté comme une mesure.
   */
  async pathsFor(
    lookups: readonly MarketCompanyLookup[],
    /**
     * #1617.4 — l'espace dont on lit les corrections.
     *
     * ⚠️ À ne passer QUE lorsque `lookup.ref` est un identifiant de COMPTE :
     * les corrections sont indexées par compte. L'écran de lancement
     * (`/companies/market-preview`) passe un NOM en `ref`, avant qu'aucun
     * compte n'existe — lui passer un espace chercherait des corrections sur
     * une clé qui n'en aura jamais, silencieusement.
     */
    options?: { readonly workspaceId?: string | null },
  ): Promise<MarketPathsRead> {
    if (lookups.length === 0) return { status: 'ok', paths: new Map() }

    try {
      const candidates = await this.candidatesByRef(lookups)
      const overrides = await this.overridesByAccount(options?.workspaceId ?? null)
      const paths = new Map<string, number | null>(lookups.map(lookup => [lookup.ref, null]))
      const reports: MarketResolutionReport[] = []

      // ⚠️ Le MÊME arbitre que `resolveDetailed`, et c'est tout l'objet du
      // correctif : deux chemins qui refont la même dérivation divergent.
      for (const lookup of lookups) {
        const computed = resolveMarketCompany(
          candidates.byDomain.get(lookup.ref) ?? [],
          candidates.byName.get(lookup.ref) ?? [],
          { country: lookup.country },
          candidates.byAlias.get(lookup.ref) ?? [],
        )
        // ⚠️ #1617.4 — la télémétrie reçoit le calcul BRUT : elle mesure NOTRE
        // rapprochement, pas l'état après réparation humaine.
        reports.push(reportOf(lookup, computed, candidates))

        // Le MÊME arbitrage humain que `classifyPortfolio`. Sans lui, le
        // tableau de bord dirait « ambigu » pendant que le portefeuille dirait
        // « couvert » — « deux lectures du même objet qui divergent », le
        // défaut que ce module a déjà payé deux fois.
        const reviewed = applyResolutionOverride(computed, overrides.get(lookup.ref) ?? null)
        const resolution =
          reviewed.status === 'resolved' && reviewed.pathsTotal === null
            ? { ...reviewed, pathsTotal: pathsOfKey(lookup.ref, reviewed.companyKey, candidates) }
            : reviewed

        // Sous le seuil, la couverture est VIDE — pas partielle. `null` et non
        // `0` : « non mesuré » n'est pas « mesuré à zéro ». Un comptage resté
        // inconnu après correction s'y range aussi : inconnu n'est pas zéro.
        const covered =
          resolution.status === 'resolved' &&
          resolution.pathsTotal !== null &&
          resolution.pathsTotal >= MARKET_MEMORY_MIN_PATHS
        paths.set(lookup.ref, covered ? resolution.pathsTotal : null)
      }

      // Le MÊME lecteur que `resolveDetailed` : une ambiguïté vue par la lecture
      // groupée est la même qu'une ambiguïté vue une par une, et un compte non
      // résolu par la lecture groupée se dit comme un compte non résolu tout court.
      this.reportResolutions(reports)

      return { status: 'ok', paths }
    } catch (error) {
      this.logger.error('lecture groupée de la mémoire marché impossible', { error })
      return { status: 'unavailable', reason: 'read_failed' }
    }
  }

  /**
   * #1633 / #1635 — CE QUE LA MÉMOIRE SAIT D'UN PORTEFEUILLE ENTIER.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * POURQUOI ICI, ET PAS DANS L'ÉCRAN QUI L'AFFICHE
   * ───────────────────────────────────────────────────────────────────────────
   * Trois écrans posent la même question — `/pilotage/qualite`, `/pilotage/marche`
   * et le territoire. Trois surfaces qui compteraient chacune de leur côté
   * donneraient trois nombres : c'est très exactement ce que #1621 décrit
   * (« 41 dans Account, 38 dans Partners, 44 dans Laura ») et ce que GA-258
   * empêche. L'agrégat se calcule UNE fois, ici, avec le MÊME arbitre que
   * `resolveDetailed` et `pathsFor`.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * CE QU'ELLE NE SAIT PAS, ET C'EST VOULU
   * ───────────────────────────────────────────────────────────────────────────
   * Elle ne connaît ni espace, ni compte, ni utilisateur : elle reçoit une liste
   * d'entreprises et une liste d'expertises, toutes deux déjà scopées par son
   * appelant. Les quatre tables de la mémoire sont PARTAGÉES entre des espaces
   * concurrents (GA-16) ; y faire entrer un `workspaceId` serait le premier pas
   * vers une lecture qui croise deux clients.
   *
   * Deux requêtes au total, quel que soit le nombre de comptes : les signaux en
   * un `IN`, puis les piles des seules entreprises COUVERTES.
   */
  async portfolioFor(
    lookups: readonly MarketCompanyLookup[],
    options: {
      readonly expertises: readonly string[]
      /**
       * #1617.4 — l'espace dont on lit les corrections.
       *
       * Ajouté DANS l'objet d'options, jamais en paramètre positionnel : un
       * paramètre glissé dans une signature décale silencieusement les specs
       * qui construisent l'appel, et rien ne jette.
       *
       * Absent ⇒ aucune correction n'est lue, et le classement est exactement
       * celui d'avant ce lot.
       */
      readonly workspaceId?: string | null
    },
  ): Promise<MarketPortfolioRead> {
    const computedAt = new Date().toISOString()
    const expertises = options.expertises.map(value => value.trim()).filter(value => value.length > 0)

    if (lookups.length === 0) {
      return {
        status: 'ok',
        coverage: { accounts: 0, covered: 0, insufficientObservations: 0, ambiguous: 0, unresolved: 0, homonyms: 0 },
        review: [],
        structuralFit: expertises.length > 0 ? { matching: 0, covered: 0, expertises } : null,
        computedAt,
      }
    }

    try {
      const overrides = await this.overridesByAccount(options.workspaceId ?? null)
      const { counts, homonyms, review, coveredKeys } = await this.classifyPortfolio(lookups, overrides)

      return {
        status: 'ok',
        coverage: { accounts: lookups.length, ...counts, homonyms },
        // Les plus gros arbitrages d'abord — onze candidats se règlent avant
        // deux. Le nom départage à égalité, pour que deux lectures successives
        // rendent la même file.
        review: [...review]
          .sort((a, b) => b.candidates - a.candidates || a.accountName.localeCompare(b.accountName))
          .slice(0, MARKET_REVIEW_QUEUE_MAX),
        structuralFit: await this.structuralFit(coveredKeys, expertises),
        computedAt,
      }
    } catch (error) {
      this.logger.error('lecture du portefeuille de la mémoire marché impossible', { error })
      return { status: 'unavailable', reason: 'read_failed' }
    }
  }

  /**
   * QUELS comptes du portefeuille la mémoire couvre — pas COMBIEN (#1575.1).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CETTE MÉTHODE EXISTE, ALORS QUE `portfolioFor` COMPTE DÉJÀ
   * ─────────────────────────────────────────────────────────────────────────
   * Le cinquième compteur de `/accounts` se CLIQUE, et son clic doit filtrer la
   * population SERVEUR complète — un `accounts.filter()` côté navigateur
   * mentirait dès la 2ᵉ page (le défaut que `AccountsCountersBand` documente en
   * tête de fichier). Or la couverture n'est pas une expression SQL : c'est
   * `resolveMarketCompany`, en TypeScript, sur les tables d'un AUTRE module.
   * Le contrôleur de comptes compose donc les deux, et il a besoin des
   * IDENTIFIANTS, pas du total.
   *
   * ⚠️ `null` ≠ `[]`. `null` dit « je n'ai pas pu lire » ; `[]` dit « j'ai lu, et
   * aucun compte n'est couvert ». Les confondre ferait passer une panne de
   * lecture pour un portefeuille vide — le défaut n°1 du dépôt, appliqué cette
   * fois à un filtre. L'appelant DOIT séparer les deux.
   *
   * ⚠️ Le classement n'est pas refait ici : c'est `classifyPortfolio`, la MÊME
   * boucle que `portfolioFor`. Deux boucles divergeraient au premier changement
   * d'arbitre, et une seule des deux serait testée — c'est très exactement le
   * défaut que #1617 a corrigé sur ce module, une couche plus bas.
   */
  async coveredRefsFor(
    lookups: readonly MarketCompanyLookup[],
    // #1617.4 — mêmes corrections que `portfolioFor`, sinon le compte affiché
    // et la liste que le clic rend se contrediraient : c'est précisément ce
    // que la boucle unique existe pour empêcher.
    options?: { readonly workspaceId?: string | null },
  ): Promise<readonly string[] | null> {
    if (lookups.length === 0) return []

    try {
      const overrides = await this.overridesByAccount(options?.workspaceId ?? null)
      const { coveredRefs } = await this.classifyPortfolio(lookups, overrides)
      return coveredRefs
    } catch (error) {
      this.logger.error('lecture des comptes couverts par la mémoire marché impossible', { error })
      return null
    }
  }

  /**
   * #1632.5 / #1576 — LES PILES OBSERVÉES DE PLUSIEURS ENTREPRISES, EN TROIS
   * REQUÊTES QUEL QUE SOIT LEUR NOMBRE.
   *
   * Sert la raison « environnement technologique proche de {compte} » : elle a
   * besoin de la pile des DEUX côtés — le compte du portefeuille ET l'entreprise
   * suggérée — plus de la fréquence de chaque techno dans le corpus, sans quoi
   * `sql` compterait autant que `cobol`.
   *
   * Le MÊME arbitre que partout ailleurs (`resolveMarketCompany` via
   * {@link candidatesByRef}) et le MÊME seuil (`MARKET_MEMORY_MIN_PATHS`) : une
   * troisième lecture qui rapprocherait autrement ferait diverger cette raison
   * du compteur « avec des parcours observés » affiché deux écrans plus haut.
   *
   * ⚠️ Aucun plancher par LIGNE ici, à dessein : `coverageFor` n'en applique pas
   * non plus sur les piles (il n'en applique que sur les ESN observées). Deux
   * lectures du même objet qui divergent est une cause racine déjà payée dans ce
   * dépôt — la discriminance, elle, se juge sur le corpus entier, ce qui est une
   * bien meilleure garde qu'un plancher local.
   */
  async observedStacksFor(lookups: readonly MarketCompanyLookup[]): Promise<
    | {
        readonly status: 'ok'
        readonly stacks: ReadonlyMap<string, readonly string[] | null>
        readonly technoFrequency: ReadonlyMap<string, number>
        readonly corpusCompanies: number
      }
    | { readonly status: 'unavailable'; readonly reason: string }
  > {
    if (lookups.length === 0) {
      return { status: 'ok', stacks: new Map(), technoFrequency: new Map(), corpusCompanies: 0 }
    }

    try {
      const candidates = await this.candidatesByRef(lookups)

      const keyByRef = new Map<string, string>()
      const reports: MarketResolutionReport[] = []
      for (const lookup of lookups) {
        const resolution = resolveMarketCompany(
          candidates.byDomain.get(lookup.ref) ?? [],
          candidates.byName.get(lookup.ref) ?? [],
          { country: lookup.country },
          candidates.byAlias.get(lookup.ref) ?? [],
        )
        reports.push(reportOf(lookup, resolution, candidates))
        // #1617.4 — un comptage inconnu ne franchit pas le seuil : il ne se
        // lit pas comme zéro, il ne se lit pas non plus comme couvert.
        if (
          resolution.status === 'resolved' &&
          resolution.pathsTotal !== null &&
          resolution.pathsTotal >= MARKET_MEMORY_MIN_PATHS
        ) {
          keyByRef.set(lookup.ref, resolution.companyKey)
        }
      }
      this.reportResolutions(reports)

      // `null` par défaut sur CHAQUE référence demandée : une entreprise non
      // couverte ressort explicitement « non su », jamais absente de la table —
      // un appelant qui lit `map.get(ref)` ne doit pas confondre « pas couverte »
      // et « pas demandée ».
      const stacks = new Map<string, readonly string[] | null>(lookups.map(lookup => [lookup.ref, null]))
      const keys = [...new Set(keyByRef.values())]
      if (keys.length > 0) {
        const rows = await this.stacks.find({ where: { companyKey: In(keys) }, order: { persons: 'DESC' } })
        const byKey = new Map<string, string[]>()
        for (const row of rows) byKey.set(row.companyKey, [...(byKey.get(row.companyKey) ?? []), row.techno])
        for (const [ref, key] of keyByRef) stacks.set(ref, byKey.get(key) ?? [])
      }

      const { technoFrequency, corpusCompanies } = await this.technoFrequency()
      return { status: 'ok', stacks, technoFrequency, corpusCompanies }
    } catch (error) {
      this.logger.error('lecture groupée des piles observées impossible', { error })
      return { status: 'unavailable', reason: 'read_failed' }
    }
  }

  /**
   * #2127.30 — LES FAMILLES DE RÔLES RECRUTÉES, DE PLUSIEURS ENTREPRISES À LA FOIS.
   *
   * Sert la raison « métiers recrutés en commun » de la carte « comptes
   * similaires » du dossier — elle a besoin des familles des DEUX côtés, le
   * compte du portefeuille ET l'entreprise suggérée, en une lecture groupée.
   *
   * Même patron que {@link observedStacksFor} : le MÊME arbitre
   * (`resolveMarketCompany` via {@link candidatesByRef}), le MÊME seuil
   * (`MARKET_MEMORY_MIN_PATHS`) — deux lectures du même objet qui divergeraient
   * reproduiraient la cause racine déjà payée sur ce module.
   *
   * Le seau résiduel (`isResidualRoleFamily`, « Autre ») est retiré ICI, à la
   * source : il ne nomme rien, et un appelant qui l'oublierait ferait dire
   * « métiers recrutés en commun » à deux entreprises qui n'ont RIEN de nommé
   * en commun — seulement le seau où le corpus range ce qu'il n'a pas su
   * classer.
   *
   * ⚠️ Aucune identité de personne ne traverse cette lecture : `role_families`
   * ne porte que des comptages `{ family, persons }` (voir le docblock de
   * `MarketCompanySignalEntity`).
   */
  async roleFamiliesManyFor(
    lookups: readonly MarketCompanyLookup[],
  ): Promise<
    | { readonly status: 'ok'; readonly families: ReadonlyMap<string, readonly string[] | null> }
    | { readonly status: 'unavailable'; readonly reason: string }
  > {
    if (lookups.length === 0) {
      return { status: 'ok', families: new Map() }
    }

    try {
      const candidates = await this.candidatesByRef(lookups)

      const keyByRef = new Map<string, string>()
      const reports: MarketResolutionReport[] = []
      for (const lookup of lookups) {
        const resolution = resolveMarketCompany(
          candidates.byDomain.get(lookup.ref) ?? [],
          candidates.byName.get(lookup.ref) ?? [],
          { country: lookup.country },
          candidates.byAlias.get(lookup.ref) ?? [],
        )
        reports.push(reportOf(lookup, resolution, candidates))
        if (
          resolution.status === 'resolved' &&
          resolution.pathsTotal !== null &&
          resolution.pathsTotal >= MARKET_MEMORY_MIN_PATHS
        ) {
          keyByRef.set(lookup.ref, resolution.companyKey)
        }
      }
      this.reportResolutions(reports)

      // `null` par défaut sur CHAQUE référence demandée, même patron que
      // `observedStacksFor` : « pas couverte » ne se confond jamais avec
      // « couverte, sans famille nommée » (`[]`).
      const families = new Map<string, readonly string[] | null>(lookups.map(lookup => [lookup.ref, null]))
      const keys = [...new Set(keyByRef.values())]
      if (keys.length > 0) {
        const rows = await this.signals.find({ where: { companyKey: In(keys) } })
        const byKey = new Map(
          rows.map(row => [
            row.companyKey,
            row.roleFamilies.map(entry => entry.family).filter(family => !isResidualRoleFamily(family)),
          ]),
        )
        for (const [ref, key] of keyByRef) families.set(ref, byKey.get(key) ?? [])
      }

      return { status: 'ok', families }
    } catch (error) {
      this.logger.error('lecture groupée des familles de rôles impossible', { error })
      return { status: 'unavailable', reason: 'read_failed' }
    }
  }

  /**
   * #2165.30 — LE RECOURS EXTERNE OBSERVÉ DE PLUSIEURS ENTREPRISES, EN MASSE.
   *
   * Sert le filtre serveur « Recours externe observé » de Découvrir : sans
   * cette méthode, `coverageFor`/`esnViewFor` ne savent lire qu'UN compte à la
   * fois (`clientKey` unique), ce qui ferait un aller-retour PAR LIGNE de
   * résultat — exactement ce que ce dépôt refuse pour un filtre de liste.
   *
   * Même patron que {@link observedStacksFor} : le MÊME arbitre
   * (`resolveMarketCompany` via {@link candidatesByRef}), le MÊME seuil
   * (`MARKET_MEMORY_MIN_PATHS`), et le MÊME plancher par ESN
   * ({@link esnObservedFrom}, le correctif du 10/09) — deux lectures du même
   * objet qui divergeraient reproduiraient le défaut déjà payé sur ce module.
   *
   * ⚠️ `null` ≠ `false`. Un compte non résolu ou sous le plancher de parcours
   * est `null` — « on ne sait pas ». Un compte COUVERT dont aucune ESN ne
   * franchit son propre plancher est `false` — « on a regardé, aucune ». Le
   * premier ne doit JAMAIS se lire comme le second : c'est très exactement la
   * doctrine c65 (« non observé » n'est jamais « n'externalise pas »,
   * GA-259), et c'est pourquoi l'appelant (`DiscoverMarketMemoryService`) ne
   * peut filtrer que sur `true` — jamais sur `false` ou `null`.
   */
  async esnObservedManyFor(
    lookups: readonly MarketCompanyLookup[],
  ): Promise<
    | { readonly status: 'ok'; readonly observed: ReadonlyMap<string, boolean | null> }
    | { readonly status: 'unavailable'; readonly reason: string }
  > {
    if (lookups.length === 0) {
      return { status: 'ok', observed: new Map() }
    }

    try {
      const candidates = await this.candidatesByRef(lookups)

      const keyByRef = new Map<string, string>()
      const reports: MarketResolutionReport[] = []
      for (const lookup of lookups) {
        const resolution = resolveMarketCompany(
          candidates.byDomain.get(lookup.ref) ?? [],
          candidates.byName.get(lookup.ref) ?? [],
          { country: lookup.country },
          candidates.byAlias.get(lookup.ref) ?? [],
        )
        reports.push(reportOf(lookup, resolution, candidates))
        if (
          resolution.status === 'resolved' &&
          resolution.pathsTotal !== null &&
          resolution.pathsTotal >= MARKET_MEMORY_MIN_PATHS
        ) {
          keyByRef.set(lookup.ref, resolution.companyKey)
        }
      }
      this.reportResolutions(reports)

      // `null` par défaut sur CHAQUE référence demandée — voir le docblock.
      const observed = new Map<string, boolean | null>(lookups.map(lookup => [lookup.ref, null]))
      const keys = [...new Set(keyByRef.values())]
      if (keys.length > 0) {
        const rows = await this.esnClients.find({ where: { clientKey: In(keys) } })
        const byKey = new Map<string, MarketEsnClientEntity[]>()
        for (const row of rows) byKey.set(row.clientKey, [...(byKey.get(row.clientKey) ?? []), row])
        for (const [ref, key] of keyByRef) {
          observed.set(ref, MarketMemoryService.esnObservedFrom(byKey.get(key) ?? []).length > 0)
        }
      }

      return { status: 'ok', observed }
    } catch (error) {
      this.logger.error('lecture groupée du recours externe observé impossible', { error })
      return { status: 'unavailable', reason: 'read_failed' }
    }
  }

  /**
   * #1638.2 — LE PALIER DE PRÉVALENCE de technologies SAISIES, dans notre référentiel.
   *
   * « Cette expertise est-elle courante, spécialisée ou rare parmi les
   * technologies que NOTRE corpus observe ? » — jamais « sur le marché »
   * (doctrine `c65_couverture_nest_pas_un_fait_de_marche`).
   *
   * ⚠️ Cette méthode ne rend AUCUNE fréquence brute, et c'est le point : un
   * nombre d'entreprises se trierait, et le retour qui commande ce bloc refuse
   * nommément qu'un volume serve à dire qu'une preuve est meilleure. Ce qui
   * sort est un palier NOMMÉ, ou rien. La table des fréquences ne quitte donc
   * jamais cette façade — au même titre que les cinq tables (GA-258).
   *
   * Les deux bornes sont les quantiles 1/3 et 2/3 de la distribution du jour
   * ({@link technoPrevalenceScale}), pas un seuil écrit à la main : elles se
   * recalculent à chaque lecture et ne peuvent donc pas vieillir. Quand le
   * corpus ne permet pas de les séparer honnêtement, l'échelle est `null` et la
   * table rendue est VIDE — une mesure impossible ne dit jamais « tout va bien ».
   *
   * Les clés de la table rendue sont les chaînes DEMANDÉES, telles quelles :
   * la normalisation reste ici, un appelant qui la referait divergerait le jour
   * où elle bouge.
   */
  async technoPrevalenceFor(
    technos: readonly string[],
  ): Promise<
    | { readonly status: 'ok'; readonly tiers: ReadonlyMap<string, TechnoPrevalenceTier> }
    | { readonly status: 'unavailable'; readonly reason: string }
  > {
    // Une demande vide ne part pas en base : le `GROUP BY` de la table des
    // piles n'a rien à répondre sur zéro technologie.
    if (technos.length === 0) return { status: 'ok', tiers: new Map() }

    try {
      const { technoFrequency } = await this.technoFrequency()
      const scale = technoPrevalenceScale(technoFrequency)
      const tiers = new Map<string, TechnoPrevalenceTier>()
      for (const techno of technos) {
        const tier = technoPrevalenceOf(techno, technoFrequency, scale)
        // Une technologie sans palier n'entre PAS dans la table : `get` rend
        // `undefined`, qui se lit « on ne sait pas » et jamais « courante ».
        if (tier !== null) tiers.set(techno, tier)
      }
      return { status: 'ok', tiers }
    } catch (error) {
      this.logger.error('lecture de la prévalence des technologies impossible', { error })
      return { status: 'unavailable', reason: 'read_failed' }
    }
  }

  /**
   * #1596.6-10 / #1628.1 — LA RECHERCHE PAR FILTRE : l'inverse de toutes les
   * méthodes au-dessus.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI ELLE REFUSE AVANT D'EXÉCUTER QUOI QUE CE SOIT
   * ─────────────────────────────────────────────────────────────────────────
   * Les cinq tables de ce module sont PARTAGÉES entre tous les espaces
   * (GA-16) : une recherche sans filtre balaierait tout le corpus commun. Le
   * refus n'est donc pas une préférence de description d'outil — c'est CETTE
   * méthode qui le fait, avant la moindre requête, pour qu'aucun appelant
   * (route interne, test, futur appelant) ne puisse la contourner.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE SEUIL, ENCORE UNE FOIS ICI ET NULLE PART AILLEURS
   * ─────────────────────────────────────────────────────────────────────────
   * `MARKET_MEMORY_MIN_PATHS` est appliqué DEUX fois, à dessein : une fois
   * dans le SQL (`paths_total >= :minPaths`), pour ne pas ramener des lignes
   * qu'on rejetterait ensuite ; une seconde fois en mémoire juste après, parce
   * qu'une méthode dont la seule garantie testée serait « le SQL filtre bien »
   * romprait au premier refactor de la requête sans qu'aucun test ne le voie.
   * Le filtre JS est la garantie qui ne peut pas se tromper de colonne.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QU'ELLE NE FAIT JAMAIS
   * ─────────────────────────────────────────────────────────────────────────
   * Aucune écriture (pas de code qui écrit — l'absence, pas une convention).
   * Aucune identité de personne : chaque entreprise rend le MÊME
   * `MarketMemoryCoverage` que `coverageFor`, qui ne porte que des comptages.
   * Aucune probabilité. Le vocabulaire de doctrine (« observé », jamais « en
   * place ») est de la responsabilité de l'APPELANT — c'est lui qui phrase une
   * réponse, cette méthode ne rend que des faits comptés.
   *
   * ⚠️ #2288.2 — UNE date traverse désormais, et une seule : `currentSignal`,
   * la date du dernier fait d'ACCÈS humain connu sur l'entreprise, avec sa
   * NATURE. Elle ne vient PAS du corpus, qui reste strictement sans date : elle
   * vient d'`access_facts`, et c'est `decideMarketSignalDate` — la seule
   * fonction qui tranche — qui décide si elle sort exacte, grossie au mois, ou
   * pas du tout. Voir {@link currentSignalDatesByKey}.
   */
  async searchByFilters(
    filters: MarketMemorySearchFilters,
    // #1961.21 — en OBJET et en FIN de signature : les deux autres appelants
    // (`companies.controller.ts`, les cartes web) ne changent pas d'un octet.
    options: MarketMemorySearchOptions = {},
  ): Promise<MarketMemorySearchRead> {
    const technology = normalizedSearchTerm(filters.technology)
    const location = normalizedSearchTerm(filters.location)
    const city = normalizedSearchTerm(filters.city)
    const region = normalizedSearchTerm(filters.region)
    const esn = normalizedSearchTerm(filters.esn)
    const roleFamily = normalizedSearchTerm(filters.roleFamily)
    const employeeMin = filters.employeeMin
    const employeeMax = filters.employeeMax
    const size = normalizedSearchTerm(filters.size)
    // #2991 (#2287.17) — voir le docblock de {@link MarketMemorySearchFilters.externalRecourseObserved} : `false` n'est pas un discriminant.
    const externalRecourseObserved = filters.externalRecourseObserved === true
    // #2991 (#2287.14) — même raison : voir {@link MarketMemorySearchFilters.isServiceCompany}.
    const isServiceCompany = filters.isServiceCompany === true

    const hasDiscriminant =
      technology !== null ||
      location !== null ||
      city !== null ||
      region !== null ||
      esn !== null ||
      roleFamily !== null ||
      employeeMin !== undefined ||
      employeeMax !== undefined ||
      size !== null ||
      externalRecourseObserved ||
      isServiceCompany

    if (!hasDiscriminant) {
      throw new BadRequestException(
        'La recherche dans les observations du marché exige au moins un filtre discriminant : technologie, ' +
          'localisation, société de services observée, famille de rôle, ou effectif. `limit` seul ne ' +
          'suffit pas — une recherche sans filtre balaierait tout le corpus partagé.',
      )
    }

    const limit = Math.min(
      Math.max(Math.trunc(filters.limit ?? MARKET_SEARCH_DEFAULT_LIMIT), 1),
      MARKET_SEARCH_MAX_LIMIT,
    )
    // LOT 18 (GA-326) — sur-lit d'UN par rapport à la limite AFFICHÉE, pour
    // savoir si le corpus réel la dépasse : même motif que `list_agenda`/
    // `find_free_slots` (GA-317, côté IA) et `capWithTruncationFlag` côté
    // copilot-bridge.controller.ts.
    const overfetchLimit = limit + 1

    try {
      const qb = this.signals
        .createQueryBuilder('signal')
        .where('signal.paths_total >= :minPaths', { minPaths: MARKET_MEMORY_MIN_PATHS })

      // Technologie et société de services : une EXISTS sur les deux tables
      // filles, jamais un JOIN — une entreprise ne doit apparaître qu'UNE fois
      // même si plusieurs lignes de pile ou de client ESN la concernent.
      if (technology !== null) {
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM market_company_stack stack
            WHERE stack.company_key = signal.company_key AND stack.techno ILIKE :technology
          )`,
          { technology: `%${technology}%` },
        )
      }
      if (esn !== null) {
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM market_esn_client esn
            WHERE esn.client_key = signal.company_key
              AND esn.persons >= :minEsnPersons
              AND esn.esn_name ILIKE :esn
          )`,
          // #1624 (lot 14) — MÊME seuil que `esnObservedFrom` : une entreprise ne
          // doit matcher ce filtre QUE si la ligne survivra ensuite dans son
          // propre `esnObserved` — sinon une recherche « Keyrus » ramènerait une
          // entreprise dont la fiche ne montre Keyrus nulle part.
          { esn: `%${esn}%`, minEsnPersons: MARKET_ESN_OBSERVED_MIN_PATHS },
        )
      }
      // La localisation OBSERVÉE (#1608 / #1630.10) : ville, région ou pays,
      // n'importe laquelle des trois — le corpus ne remplit pas les trois à
      // chaque ligne, et exiger les trois exclurait des entreprises connues
      // sur un seul axe.
      if (location !== null) {
        // Les deux côtés pliés (minuscules + sans accents) : voir `foldedColumn`.
        // Sans ça, « Île-de-France » ne rencontre jamais « Ile-de-France ».
        qb.andWhere(
          `(${foldedColumn('signal.city')} LIKE :location` +
            ` OR ${foldedColumn('signal.region')} LIKE :location` +
            ` OR ${foldedColumn('signal.country')} LIKE :location)`,
          { location: `%${foldedTerm(location)}%` },
        )
      }
      // #1961.5 — la VILLE et la RÉGION, chacune SA colonne, distinctes de
      // `location` ci-dessus : département reste absent, faute de donnée
      // (`MarketCompanySignalEntity` ne porte que city/region/country).
      if (city !== null) {
        qb.andWhere(`${foldedColumn('signal.city')} LIKE :city`, { city: `%${foldedTerm(city)}%` })
      }
      if (region !== null) {
        qb.andWhere(`${foldedColumn('signal.region')} LIKE :region`, { region: `%${foldedTerm(region)}%` })
      }
      // `role_families` est un jsonb `[{ family, persons }]` — voir l'entité.
      if (roleFamily !== null) {
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM jsonb_array_elements(signal.role_families) elem
            WHERE elem->>'family' ILIKE :roleFamily
          )`,
          { roleFamily: `%${roleFamily}%` },
        )
      }
      // Effectif : `null` sur `headcount_min`/`headcount_max` exclut la ligne
      // NATURELLEMENT (comparer NULL à un nombre ne rend jamais vrai en SQL) —
      // exactement le comportement voulu, « non mesuré » ne devine pas.
      if (employeeMin !== undefined) {
        qb.andWhere('signal.headcount_max >= :employeeMin', { employeeMin })
      }
      if (employeeMax !== undefined) {
        qb.andWhere('signal.headcount_min <= :employeeMax', { employeeMax })
      }
      // #2991 (#2287.15) — ÉGALITÉ pliée, pas une sous-chaîne : une tranche
      // est une valeur FERMÉE du corpus (« 51-200 »), jamais un fragment à
      // chercher dedans comme `city`/`region`/`location` ci-dessus.
      if (size !== null) {
        qb.andWhere(`${foldedColumn('signal.headcount_bracket')} = :size`, { size: foldedTerm(size) })
      }
      // #2991 (#2287.17) — LE MÊME plancher qu'`esnObservedFrom` (une entreprise
      // ne doit matcher ce filtre QUE si au moins une ligne survivra ensuite
      // dans son propre `esnObserved`), SANS restriction de nom : c'est très
      // exactement ce qui distingue ce filtre du filtre `esn` nommé ci-dessus.
      if (externalRecourseObserved) {
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM market_esn_client esn
            WHERE esn.client_key = signal.company_key AND esn.persons >= :minEsnPersons
          )`,
          { minEsnPersons: MARKET_ESN_OBSERVED_MIN_PATHS },
        )
      }
      // #2991 (#2287.14) — colonne directe, jamais une jointure : c'est un
      // FAIT de la ligne elle-même, pas une observation sur une table fille.
      if (isServiceCompany) {
        qb.andWhere('signal.is_service_company = true')
      }

      const overfetched = await qb.orderBy('signal.paths_total', 'DESC').limit(overfetchLimit).getMany()
      const truncated = overfetched.length > limit
      const rows = truncated ? overfetched.slice(0, limit) : overfetched

      // Le filtre JS du seuil — voir le commentaire de tête de méthode.
      const covered = rows.filter(row => row.pathsTotal >= MARKET_MEMORY_MIN_PATHS)
      if (covered.length === 0) return { status: 'ok', matches: [], truncated }

      const keys = covered.map(row => row.companyKey)
      const [esnRows, stackRows, exEsnRows, accountByKey] = await Promise.all([
        this.esnClients.find({ where: { clientKey: In(keys) }, order: { persons: 'DESC' } }),
        this.stacks.find({ where: { companyKey: In(keys) }, order: { persons: 'DESC' } }),
        this.exEsn.find({ where: { clientKey: In(keys) } }),
        // #1961.21 — ne jette jamais : une panne du rapprochement rend une table
        // vide, jamais une recherche perdue.
        this.portfolioAccountsByKey(covered, options.portfolio ?? [], options.workspaceId ?? null),
      ])

      const esnByKey = new Map<string, MarketEsnClientEntity[]>()
      for (const row of esnRows) esnByKey.set(row.clientKey, [...(esnByKey.get(row.clientKey) ?? []), row])
      const stackByKey = new Map<string, MarketCompanyStackEntity[]>()
      for (const row of stackRows) stackByKey.set(row.companyKey, [...(stackByKey.get(row.companyKey) ?? []), row])
      const exEsnByKey = new Map<string, number>()
      for (const row of exEsnRows) exEsnByKey.set(row.clientKey, (exEsnByKey.get(row.clientKey) ?? 0) + row.persons)

      // #2288.2 — APRÈS le rapprochement, parce qu'il en dépend : une date ne
      // se lit que sur une entreprise qui EST un compte de l'appelant.
      const currentSignals = await this.currentSignalDatesByKey(accountByKey, options.workspaceId ?? null)

      const matches: MarketMemorySearchMatch[] = covered.map(signal => {
        // MÊME dérivation que `coverageFor` — voir `esnObservedFrom`.
        const esnObserved = MarketMemoryService.esnObservedFrom(esnByKey.get(signal.companyKey) ?? [])

        const exEsnTotal = exEsnByKey.get(signal.companyKey) ?? 0

        const coverage: MarketMemoryCoverage = {
          covered: true,
          marketPaths: signal.pathsTotal,
          esnObserved,
          observedStack: MarketMemoryService.observedStackFrom(stackByKey.get(signal.companyKey) ?? []),
          roleFamilies: [...signal.roleFamilies],
          exEsnPresent: exEsnTotal > 0 ? exEsnTotal : null,
          observedZone: buildObservedZone(signal),
          // #3212.3 (reste, épopée #3235) — même relecture directe que `coverageFor`.
          datasetVersion: signal.datasetVersion,
        }

        // #1961.21 — la route de la fiche, SEULEMENT quand un compte de
        // l'appelant EST cette entreprise. Absente sinon, jamais `null`.
        const accountId = accountByKey.get(signal.companyKey)
        // #2288.2 — la date du dernier signal connu, avec sa NATURE. ABSENTE
        // quand rien n'est lisible : « aucun signal actuel » est vrai, un
        // `null` se lirait « date manquante », ce qui affirme qu'on a regardé.
        const currentSignal = currentSignals.get(signal.companyKey)
        return {
          companyName: signal.companyName,
          coverage,
          ...(accountId === undefined ? {} : { accountRoute: `/accounts/${accountId}` }),
          ...(currentSignal === undefined ? {} : { currentSignal }),
        }
      })

      return { status: 'ok', matches, truncated }
    } catch (error) {
      this.logger.error('recherche par filtres de la mémoire marché impossible', { error })
      return { status: 'unavailable', reason: 'read_failed' }
    }
  }

  /**
   * #1961.21 — QUELLES entreprises trouvées SONT un compte du portefeuille de l'appelant.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * PAR DOMAINE OU PAR DÉCISION HUMAINE — JAMAIS PAR NOM SEUL
   * ─────────────────────────────────────────────────────────────────────────
   * Le MÊME arbitre que partout ailleurs (`resolveMarketCompany` sur
   * `candidatesByRef`, puis `applyResolutionOverride`) : une troisième façon de
   * rapprocher un compte du corpus ferait qu'un écran dise « couvert » pendant
   * que Laura lie une autre entreprise. Seul change ce qu'on GARDE : un
   * rapprochement retenu par le domaine (`matchedOn: 'domain'`) ou tranché par
   * un humain de l'espace (`'manual'`). Par nom ou par alias : AUCUN lien — deux
   * référentiels ne se joignent pas par le nom (« SG SOCIETE GENERALE » ne
   * rencontre pas « SOCIETE GENERALE »), et un lien faux envoie le commercial sur
   * la fiche d'une autre entreprise, ce qui est pire que pas de lien.
   *
   * Deux comptes qui désignent la même entreprise : aucun lien. Une ambiguïté ne
   * se tranche pas au hasard (#1617).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * NE RELIT QUE CE QUI PEUT PORTER UN LIEN
   * ─────────────────────────────────────────────────────────────────────────
   * Seuls passent par l'arbitre les comptes dont le domaine racine est celui
   * d'une entreprise trouvée, ou qu'un humain a rattachés à l'une d'elles. Ce tri
   * ne change AUCUN lien : un compte qui n'a ni l'un ni l'autre ne pourrait être
   * rapproché de ces entreprises-là que par son nom, ce que ce lien refuse. Le
   * portefeuille entier (des milliers de comptes) ne part donc pas en `IN` à
   * chaque question posée à Laura.
   *
   * Ne jette jamais : le lien est un AJOUT à la recherche.
   */
  private async portfolioAccountsByKey(
    found: readonly MarketCompanySignalEntity[],
    portfolio: readonly MarketCompanyLookup[],
    workspaceId: string | null,
  ): Promise<ReadonlyMap<string, string>> {
    const accountByKey = new Map<string, string>()
    if (portfolio.length === 0 || found.length === 0) return accountByKey

    try {
      const overrides = await this.overridesByAccount(workspaceId)
      const foundKeys = new Set(found.map(row => row.companyKey))
      const foundDomains = new Set(found.flatMap(row => (row.websiteDomain ? [row.websiteDomain] : [])))
      const linkable = portfolio.filter(lookup => {
        const domain = marketRootDomain(lookup.website ?? null)
        if (domain && foundDomains.has(domain)) return true
        const override = overrides.get(lookup.ref)
        return override?.kind === 'confirmed' && foundKeys.has(override.marketCompanyKey)
      })
      if (linkable.length === 0) return accountByKey

      const candidates = await this.candidatesByRef(linkable)
      const claimants = new Map<string, string[]>()
      for (const lookup of linkable) {
        const reviewed = applyResolutionOverride(
          resolveMarketCompany(
            candidates.byDomain.get(lookup.ref) ?? [],
            candidates.byName.get(lookup.ref) ?? [],
            { country: lookup.country },
            candidates.byAlias.get(lookup.ref) ?? [],
          ),
          overrides.get(lookup.ref) ?? null,
        )
        if (reviewed.status !== 'resolved') continue
        // #1961.21 — le point exact de la règle : ni `name`, ni `alias`.
        if (reviewed.matchedOn !== 'domain' && reviewed.matchedOn !== 'manual') continue
        if (!foundKeys.has(reviewed.companyKey)) continue
        claimants.set(reviewed.companyKey, [...(claimants.get(reviewed.companyKey) ?? []), lookup.ref])
      }
      for (const [companyKey, refs] of claimants) {
        if (refs.length === 1 && refs[0] !== undefined) accountByKey.set(companyKey, refs[0])
      }
    } catch (error) {
      this.logger.warn('rapprochement du portefeuille pour la recherche marché impossible', { error })
    }
    return accountByKey
  }

  /**
   * #2288.2 — LES DATES REVIENNENT, SANS TRAHIR QUI A VU.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * D'OÙ VIENT LA DATE, ET D'OÙ ELLE NE VIENT PAS
   * ─────────────────────────────────────────────────────────────────────────
   * PAS du corpus : `market_company_signal` n'expose aucune date, et ce lot ne
   * l'ouvre pas. La date vient des faits d'ACCÈS humains — la seule source
   * datée PAR ENTREPRISE du produit — rapprochés par le **SIREN**, jamais par
   * le nom : deux espaces qui écrivent « SNCF » et « SNCF Réseau » ne parlent
   * pas du même compte, et un rapprochement approximatif ferait circuler
   * l'information d'un client vers le mauvais dossier d'un autre. C'est
   * exactement le rapprochement de `communityLock` (`account-access.service`).
   *
   * Conséquence assumée : une entreprise du corpus qui n'est PAS un compte de
   * l'appelant n'a aucune date. Elle se rend « aucun signal actuel », ce qui
   * est vrai — plutôt qu'un rapprochement par le nom, qui serait une donnée qui
   * RESSEMBLE à une information juste.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QUI BORNE CETTE LECTURE INTER-ESPACES
   * ─────────────────────────────────────────────────────────────────────────
   * · `COMMUNITY_AGGREGABLE_KINDS` et rien d'autre — le COÛT ne franchit jamais
   *   la frontière d'un espace (GA-43), et la liste vient du contrat, elle
   *   n'est pas retapée ici ;
   * · `provenance = 'human'` — une déduction du pipeline n'est pas un
   *   témoignage, et trois pipelines qui déduisent la même chose de la même
   *   source publique ne font pas trois espaces d'accord ;
   * · `community_data_sharing` — seuls les espaces qui PARTAGENT alimentent le
   *   pool, et mon propre espace s'y lit toujours lui-même ;
   * · `mine.workspace_id = $2` — le côté APPELANT reste borné à son espace.
   *
   * La décision, elle, n'est pas ici : elle est dans `decideMarketSignalDate`
   * (`@bellum/contracts`), atteinte par `marketSignalDatesByKey`. Une panne rend
   * une table VIDE — donc « aucun signal actuel » — jamais une recherche perdue
   * ni une date devinée.
   */
  private async currentSignalDatesByKey(
    accountByKey: ReadonlyMap<string, string>,
    workspaceId: string | null,
  ): Promise<ReadonlyMap<string, MarketSignalDate>> {
    if (!workspaceId || accountByKey.size === 0) return new Map()
    try {
      const accountIds = [...new Set(accountByKey.values())]
      const rows = (await this.signals.query(
        `SELECT mine.id AS account_id, other.workspace_id AS workspace_id, f.observed_at AS observed_at
           FROM accounts mine
           JOIN accounts other ON other.siren = mine.siren
           JOIN workspaces w ON w.id = other.workspace_id
           JOIN access_facts f ON f.account_id = other.id
          WHERE mine.id = ANY($1::uuid[])
            AND mine.workspace_id = $2
            AND mine.siren IS NOT NULL
            AND f.provenance = 'human'
            AND f.kind = ANY($3::text[])
            AND f.observed_at IS NOT NULL
            AND (w.community_data_sharing = true OR other.workspace_id = $2)`,
        [accountIds, workspaceId, [...COMMUNITY_AGGREGABLE_KINDS]],
      )) as Array<{ account_id: string; workspace_id: string; observed_at: Date | string | null }>

      const sharesRows = (await this.signals.query(
        `SELECT community_data_sharing FROM workspaces WHERE id = $1 LIMIT 1`,
        [workspaceId],
      )) as Array<{ community_data_sharing: boolean | null }>

      return marketSignalDatesByKey({
        accountByKey,
        rows: rows.map(row => ({
          accountId: row.account_id,
          workspaceId: row.workspace_id,
          observedAt: row.observed_at ? new Date(row.observed_at).toISOString() : null,
        })),
        askingWorkspaceId: workspaceId,
        contributes: sharesRows[0]?.community_data_sharing === true,
      })
    } catch (error) {
      this.logger.warn('lecture des signaux datés par entreprise impossible', { error })
      return new Map()
    }
  }

  /**
   * Sur combien d'entreprises du corpus chaque technologie est observée.
   *
   * Un `GROUP BY` sur toute la table des piles, mis en cache dans le processus
   * ({@link TECHNO_FREQUENCY_TTL_MS}) : c'est une propriété du CORPUS, identique
   * pour tous les espaces, qui ne change qu'à l'ingestion.
   *
   * Jette en cas de panne — l'appelant unique ({@link observedStacksFor}) a son
   * `catch`, et une table de fréquences vide rendue en silence ferait passer
   * toutes les technos pour rares.
   */
  private async technoFrequency(): Promise<{
    technoFrequency: ReadonlyMap<string, number>
    corpusCompanies: number
  }> {
    const now = Date.now()
    if (this.technoFrequencyCache && this.technoFrequencyCache.expiresAt > now) {
      return this.technoFrequencyCache.value
    }

    const rows = await this.stacks
      .createQueryBuilder('stack')
      .select('stack.techno', 'techno')
      .addSelect('COUNT(DISTINCT stack.company_key)', 'companies')
      .groupBy('stack.techno')
      .getRawMany<{ techno: string; companies: string }>()

    const technoFrequency = new Map<string, number>()
    for (const row of rows) {
      const companies = Number(row.companies)
      if (!Number.isFinite(companies)) continue
      technoFrequency.set(row.techno.trim().toLowerCase(), companies)
    }

    // Le dénominateur est le nombre d'entreprises qui portent une pile — jamais
    // le nombre de lignes, ni le nombre d'entreprises du corpus entier : une
    // entreprise sans pile observée ne participe pas à la question « cette
    // techno distingue-t-elle ? ».
    const distinct = await this.stacks
      .createQueryBuilder('stack')
      .select('COUNT(DISTINCT stack.company_key)', 'companies')
      .getRawOne<{ companies: string }>()
    const corpusCompanies = Number(distinct?.companies ?? 0)

    const value = {
      technoFrequency,
      corpusCompanies: Number.isFinite(corpusCompanies) ? corpusCompanies : 0,
    }
    this.technoFrequencyCache = { value, expiresAt: now + TECHNO_FREQUENCY_TTL_MS }
    return value
  }

  /**
   * LA boucle de classement du portefeuille — une seule, deux lectrices.
   *
   * `portfolioFor` en tire ses quatre seaux et sa file de revue ;
   * `coveredRefsFor` en tire les références couvertes. Elles ne peuvent donc pas
   * se contredire : « 3 avec des parcours observés » et la liste que le clic
   * rend sont le MÊME parcours de code.
   *
   * Jette si la lecture échoue — les deux appelantes ont leur propre `catch`,
   * et chacune traduit la panne dans SON vocabulaire (`unavailable` d'un côté,
   * `null` de l'autre).
   */
  private async classifyPortfolio(
    lookups: readonly MarketCompanyLookup[],
    /**
     * #1617.4 — les décisions humaines, par référence de compte.
     *
     * Passées en PARAMÈTRE plutôt que relues ici : cette boucle a deux
     * lectrices, et une lecture faite à l'intérieur serait faite deux fois
     * pour un même rendu.
     */
    overrides: ReadonlyMap<string, MarketResolutionOverride>,
  ): Promise<{
    counts: Record<MarketPortfolioBucket, number>
    homonyms: number
    review: MarketReviewItem[]
    coveredKeys: string[]
    coveredRefs: string[]
  }> {
    const candidates = await this.candidatesByRef(lookups)

    const counts: Record<MarketPortfolioBucket, number> = {
      covered: 0,
      insufficientObservations: 0,
      ambiguous: 0,
      unresolved: 0,
    }
    let homonyms = 0
    const review: MarketReviewItem[] = []
    const coveredKeys: string[] = []
    const coveredRefs: string[] = []
    const reports: MarketResolutionReport[] = []

    for (const lookup of lookups) {
      const computed = resolveMarketCompany(
        candidates.byDomain.get(lookup.ref) ?? [],
        candidates.byName.get(lookup.ref) ?? [],
        { country: lookup.country },
        candidates.byAlias.get(lookup.ref) ?? [],
      )
      // Le MÊME lecteur que `resolveDetailed` et `pathsFor` : une ambiguïté
      // vue en agrégat est la même qu'une ambiguïté vue une par une.
      //
      // ⚠️ #1617.4 — la télémétrie reçoit le calcul BRUT, jamais la résolution
      // corrigée. Elle mesure la qualité de NOTRE rapprochement : si les
      // corrections humaines la faisaient baisser, on croirait l'automatique
      // meilleur chaque fois qu'un humain répare à la main.
      reports.push(reportOf(lookup, computed, candidates))

      // Le CLASSEMENT, lui, obéit à l'humain : un compte tranché sort de la
      // file de revue, et « une correction humaine gagne toujours ».
      const reviewed = applyResolutionOverride(computed, overrides.get(lookup.ref) ?? null)

      // ⚠️ #1617.4 — LE COMPTAGE SE RETROUVE, il ne se devine pas.
      //
      // `applyResolutionOverride` est pure : elle rend `pathsTotal: null` dès
      // que l'humain désigne une entreprise que le calcul n'avait pas retenue.
      // Laissé tel quel, un compte qu'on vient de départager tomberait en
      // « observations insuffisantes » — la correction n'aurait servi à rien,
      // et l'écran resterait muet sur le compte qu'on voulait justement faire
      // parler.
      //
      // Les candidats sont DÉJÀ en mémoire (une seule requête, plus haut) :
      // retrouver la ligne désignée n'en coûte aucune. Si la clé ne figure pas
      // parmi eux, le comptage reste inconnu — et « inconnu » n'est pas zéro.
      const resolution =
        reviewed.status === 'resolved' && reviewed.pathsTotal === null
          ? { ...reviewed, pathsTotal: pathsOfKey(lookup.ref, reviewed.companyKey, candidates) }
          : reviewed

      if (resolution.status === 'resolved') {
        // #1617.4 — `null` (comptage inconnu après un rattachement humain) ne
        // compte ni dans « couvert » ni comme un zéro. Il tombe dans le seau
        // « observations insuffisantes », qui est exactement ce qu'il est.
        if (resolution.pathsTotal !== null && resolution.pathsTotal >= MARKET_MEMORY_MIN_PATHS) {
          counts.covered += 1
          coveredKeys.push(resolution.companyKey)
          // #1575.1 — la référence D'APPELANT (l'identifiant du compte), pas la
          // clé du corpus : c'est elle que le filtre de la liste sait joindre.
          coveredRefs.push(lookup.ref)
        } else {
          // Résolu, mais sous le seuil. Distinct de « non résolu » : ici le
          // corpus CONNAÎT l'entreprise, il n'en sait simplement pas assez.
          counts.insufficientObservations += 1
        }
        continue
      }

      if (resolution.status === 'ambiguous') {
        counts.ambiguous += 1
        if (resolution.ambiguity.on === 'name') homonyms += 1
        review.push({
          accountId: lookup.ref,
          accountName: lookup.name,
          reason: resolution.ambiguity.on === 'name' ? 'ambiguous_name' : 'ambiguous_domain',
          candidates: resolution.ambiguity.candidates,
          // #1617.4 — LES CANDIDATES NOMMÉES, sans quoi la file annonce un
          // arbitrage qu'aucun clic ne peut rendre : « c'est bien cette
          // entreprise » demande une CLÉ, et personne côté navigateur ne
          // l'avait. Les lignes sont DÉJÀ en mémoire — les nommer ne coûte
          // aucune requête.
          //
          // Du côté qui a ÉCHOUÉ, jamais de l'autre : c'est là que l'humain
          // doit trancher, et l'autre côté a déjà donné sa réponse.
          companies: reviewCandidates(
            (resolution.ambiguity.on === 'name' ? candidates.byName : candidates.byDomain).get(lookup.ref) ?? [],
          ),
        })
        continue
      }

      // `unavailable` ne peut pas sortir d'ici : `resolveMarketCompany` est une
      // fonction pure, et la panne de lecture est attrapée par les appelantes.
      // Ne reste que `unresolved`.
      counts.unresolved += 1
    }

    this.reportResolutions(reports)

    return { counts, homonyms, review, coveredKeys, coveredRefs }
  }

  /**
   * Les candidats du corpus, rassemblés PAR RÉFÉRENCE D'APPELANT.
   *
   * ⚠️ #1617 — on RASSEMBLE avant d'arbitrer, au lieu d'écraser au fil des
   * lignes. L'ancienne boucle faisait `best.set(ref, …)` à chaque ligne qui
   * répondait : sur deux entreprises homonymes, la DERNIÈRE ligne lue gagnait —
   * et `resolve()`, qui faisait un `findOne`, retenait la PREMIÈRE. Les deux
   * lectures du même compte pouvaient donc désigner deux entreprises
   * différentes, sans que ni l'une ni l'autre ait été choisie.
   *
   * Extrait de `pathsFor` sans changer une ligne de sa logique quand
   * `portfolioFor` en a eu besoin : deux lectures groupées qui refont ce
   * rassemblement chacune de leur côté sont deux endroits où la correction de
   * #1617 peut se défaire — et une seule des deux serait testée.
   */
  private async candidatesByRef(lookups: readonly MarketCompanyLookup[]): Promise<{
    byDomain: ReadonlyMap<string, MarketCompanySignalEntity[]>
    byName: ReadonlyMap<string, MarketCompanySignalEntity[]>
    byAlias: ReadonlyMap<string, MarketCompanySignalEntity[]>
    /** Ce qui a été ESSAYÉ pour chaque référence — la matière du journal (#1756). */
    probes: ReadonlyMap<string, { matchKey: string; domain: string | null }>
  }> {
    const domains = new Map<string, string[]>()
    const keys = new Map<string, string[]>()
    const probes = new Map<string, { matchKey: string; domain: string | null }>()

    for (const lookup of lookups) {
      const domain = marketRootDomain(lookup.website ?? null)
      if (domain) domains.set(domain, [...(domains.get(domain) ?? []), lookup.ref])
      const key = marketMatchKey(lookup.name)
      if (key.length > 0) keys.set(key, [...(keys.get(key) ?? []), lookup.ref])
      probes.set(lookup.ref, { matchKey: key, domain })
    }

    const rows = await this.signals.find({
      where: [
        ...(domains.size > 0 ? [{ websiteDomain: In([...domains.keys()]) }] : []),
        ...(keys.size > 0 ? [{ matchKey: In([...keys.keys()]) }] : []),
      ],
    })

    const byDomain = new Map<string, MarketCompanySignalEntity[]>()
    const byName = new Map<string, MarketCompanySignalEntity[]>()
    const push = (bucket: Map<string, MarketCompanySignalEntity[]>, ref: string, row: MarketCompanySignalEntity) => {
      bucket.set(ref, [...(bucket.get(ref) ?? []), row])
    }
    for (const row of rows) {
      for (const ref of row.websiteDomain ? (domains.get(row.websiteDomain) ?? []) : []) push(byDomain, ref, row)
      for (const ref of keys.get(row.matchKey) ?? []) push(byName, ref, row)
    }

    // #1756 — L'ALIAS EST CHERCHÉ ICI AUSSI, ET C'EST LE POINT.
    //
    // `resolveDetailed` et les trois lectures groupées doivent rapprocher à
    // l'identique : une lecture qui connaîtrait les alias et une autre non
    // afficherait « 267 parcours » sur un écran et « aucune observation » sur le
    // suivant — le défaut « deux lectures du même objet qui divergent », déjà
    // payé deux fois sur ce module. Seules les références SANS aucun candidat
    // sont concernées, ce qui est aussi la seule situation où l'alias sert.
    const silent = lookups.filter(
      lookup => (byDomain.get(lookup.ref)?.length ?? 0) === 0 && (byName.get(lookup.ref)?.length ?? 0) === 0,
    )
    const byAlias: ReadonlyMap<string, MarketCompanySignalEntity[]> =
      silent.length > 0 ? await this.aliasCandidates(silent) : new Map()

    return { byDomain, byName, byAlias, probes }
  }

  /**
   * #1635.4 — combien de comptes COUVERTS recoupent une expertise déclarée.
   *
   * `null` sans expertise déclarée : la question ne se pose pas. Un « 0 sur 38 »
   * se lirait « ton portefeuille ne te correspond pas » alors qu'il veut dire
   * « tu n'as rien déclaré » — la même faute que « non mesuré » rendu « 0 »,
   * appliquée à une phrase entière.
   *
   * ⚠️ Le dénominateur est les comptes COUVERTS, jamais le portefeuille : sur un
   * compte non couvert, on n'a pas de pile observée, donc on ne sait pas — et un
   * « non su » compté comme « ne recoupe pas » ferait baisser le nombre à mesure
   * que la couverture baisse, ce qui mesurerait notre corpus, pas le portefeuille.
   */
  private async structuralFit(
    coveredKeys: readonly string[],
    expertises: readonly string[],
  ): Promise<MarketStructuralFit | null> {
    if (expertises.length === 0) return null
    if (coveredKeys.length === 0) return { matching: 0, covered: 0, expertises: [...expertises] }

    const rows = await this.stacks.find({ where: { companyKey: In([...new Set(coveredKeys)]) } })

    const stackByKey = new Map<string, string[]>()
    for (const row of rows) {
      stackByKey.set(row.companyKey, [...(stackByKey.get(row.companyKey) ?? []), row.techno])
    }

    // Sur la LISTE et non sur les clés uniques : deux comptes rapprochés de la
    // même entreprise sont deux comptes du portefeuille, et le dénominateur
    // ci-dessus les compte deux fois lui aussi.
    const matching = coveredKeys.filter(key => stackMatchesExpertises(stackByKey.get(key) ?? [], expertises)).length

    return { matching, covered: coveredKeys.length, expertises: [...expertises] }
  }
}

/**
 * #1608 / #1630.10 — l'empreinte de zone observée, telle que `market_company_signal`
 * la porte depuis le 06/09 (`market-memory-import.ts:254-256`) et telle qu'AUCUNE
 * méthode de ce service ne la recopiait avant ce lot.
 *
 * `null` quand les TROIS colonnes sont vides — pas un objet à trois `null` : un
 * appelant qui teste juste `if (observedZone)` doit pouvoir le faire sans
 * connaître la forme interne. Le remplissage réel en production n'est PAS
 * mesuré ici : le corpus peut très bien laisser `city` à `null` sur la majorité
 * des lignes, et c'est exactement pour ça que chaque champ reste
 * INDÉPENDAMMENT nullable plutôt que de fabriquer une valeur.
 */
/**
 * #1756 — ce qu'une lecture GROUPÉE sait dire de chaque rapprochement.
 *
 * Les trois lectures groupées rassemblent leurs candidats par la même méthode ;
 * elles composent donc leur ligne de journal de la même façon, ici et nulle part
 * ailleurs. Trois recompositions à la main divergeraient, et une seule des trois
 * serait testée — c'est le défaut que ce module a déjà payé deux fois.
 */
/**
 * #1617.4 — le comptage de parcours d'une clé DÉJÀ chargée, ou `null`.
 *
 * Sert après une correction humaine : l'humain désigne une entreprise, on
 * cherche son comptage parmi les candidats déjà lus. `null` quand la clé n'est
 * pas parmi eux — on ne sait alors pas combien, et on ne l'invente pas.
 */
/**
 * #1617.4 — les lignes du corpus entre lesquelles un humain doit choisir.
 *
 * ⚠️ JAMAIS TRONQUÉE. Une liste coupée ferait disparaître la bonne réponse
 * sans le dire, et l'humain choisirait parmi ce qui reste — le défaut
 * « N sources concaténées puis tronquées », appliqué cette fois à une décision
 * irréversible du point de vue de celui qui la prend.
 *
 * ⚠️ AUCUN comptage de parcours ne sort d'ici. Un candidat peut être sous
 * `MARKET_MEMORY_MIN_PATHS` : afficher son nombre le ferait lire comme une
 * mesure alors que c'est du bruit. On choisit une entreprise sur son IDENTITÉ.
 *
 * `?? null` sur les deux colonnes nullables : `undefined` traverserait la
 * sérialisation JSON en faisant DISPARAÎTRE la clé, et l'écran ne saurait pas
 * distinguer « le corpus n'a pas de domaine » de « l'API est plus ancienne ».
 */
function reviewCandidates(rows: readonly MarketCompanySignalEntity[]): MarketReviewCandidate[] {
  return rows.map(row => ({
    companyKey: row.companyKey,
    companyName: row.companyName,
    websiteDomain: row.websiteDomain ?? null,
    country: row.country ?? null,
  }))
}

function pathsOfKey(
  ref: string,
  companyKey: string,
  candidates: {
    byDomain: ReadonlyMap<string, MarketCompanySignalEntity[]>
    byName: ReadonlyMap<string, MarketCompanySignalEntity[]>
    byAlias: ReadonlyMap<string, MarketCompanySignalEntity[]>
  },
): number | null {
  for (const bucket of [candidates.byDomain, candidates.byName, candidates.byAlias]) {
    const hit = bucket.get(ref)?.find(row => row.companyKey === companyKey)
    if (hit) return hit.pathsTotal
  }
  return null
}

function reportOf(
  lookup: MarketCompanyLookup,
  resolution: MarketResolution,
  candidates: {
    byAlias: ReadonlyMap<string, MarketCompanySignalEntity[]>
    probes: ReadonlyMap<string, { matchKey: string; domain: string | null }>
  },
): MarketResolutionReport {
  const probe = candidates.probes.get(lookup.ref)
  return {
    lookup,
    resolution,
    probe: {
      matchKey: probe?.matchKey ?? '',
      domain: probe?.domain ?? null,
      aliasCandidates: candidates.byAlias.get(lookup.ref)?.length ?? 0,
    },
  }
}

function buildObservedZone(signal: MarketCompanySignalEntity): MarketObservedZone | null {
  // #3225 — une chaîne vide n'est pas une valeur : le contrat de sortie exige `min(1)`
  // ou `null`, et un `''` en base faisait échouer toute la lecture du groupe.
  const nonBlank = (value: string | null): string | null => (value && value.trim() ? value : null)
  const city = nonBlank(signal.city)
  const region = nonBlank(signal.region)
  const country = nonBlank(signal.country)
  if (city === null && region === null && country === null) return null
  return { city, region, country }
}

/**
 * Un filtre texte de `searchByFilters`, réduit à `null` quand il ne dit rien.
 *
 * `undefined`, `''` et `'   '` sont la MÊME absence : aucun des trois ne doit
 * compter comme un filtre discriminant, et aucun des trois ne doit produire un
 * `ILIKE '%%'` qui matcherait toutes les lignes en silence.
 */
function normalizedSearchTerm(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Les caractères accentués et leur équivalent nu, pour `translate()` en SQL.
 *
 * ⚠️ Les deux chaînes se lisent CARACTÈRE PAR CARACTÈRE et doivent avoir la
 * MÊME longueur : `translate('Île', 'Î', 'I')` rend « Ile ». Un décalage d'un
 * seul caractère traduirait silencieusement vers le mauvais.
 */
const ACCENTED = 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ'
const UNACCENTED = 'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY'

/**
 * Le fragment SQL qui plie une colonne texte : minuscules ET sans accents.
 *
 * ⚠️⚠️ **`ILIKE` est insensible à la CASSE, pas aux ACCENTS.** Mesuré en
 * production le 11/09/2026 : `location=Île-de-France` rendait **0** résultat
 * quand `location=Ile-de-France` en rendait trois — le corpus stocke la forme
 * nue, et les fiches (comme les gens qui tapent) portent la forme accentuée.
 * Toute une capacité livrée s'affichait vide à cause de ce seul accent.
 *
 * `translate()` plutôt que l'extension `unaccent` : aucune extension à
 * installer, le même comportement sur n'importe quelle instance, et la
 * correspondance est ÉCRITE ici plutôt que dépendante d'une configuration de
 * serveur qu'on ne relit jamais.
 */
function foldedColumn(column: string): string {
  return `translate(lower(${column}), '${ACCENTED}', '${UNACCENTED}')`
}

/** Le pendant TypeScript de `foldedColumn` — les DEUX côtés se plient, sinon rien ne se rencontre. */
function foldedTerm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}
