import { z } from 'zod'
import { dataforgeAccountAccessSchema } from './dataforge-account-access.js'
import type { ConflictedField } from './field-conflict.js'
import type { MarketMemoryRead } from './market-memory.js'

/**
 * #1618 — LA FAÇADE `AccountIntelligenceContext`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CE FICHIER FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * `OrionAccountsService` (DataForge) et `MarketMemoryService` sont deux
 * services matures, testés, appelés séparément — et jamais co-injectés nulle
 * part. Chaque écran qui voudrait les croiser devait donc INVENTER sa propre
 * règle d'arbitrage le jour où les deux se contredisent (le secteur DataForge
 * dit « Banque », le secteur saisi à la main dit « Assurance » — lequel
 * affiche-t-on ?). Ce fichier tranche une fois, ici, pour tout le monde.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA HIÉRARCHIE — CODÉE, PAS COMMENTÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * Décision de Louis du 10/09/2026 :
 *
 *   correction humaine de l'espace > donnée courante > DataForge > mémoire marché > inférence
 *
 * Ce n'est pas un commentaire au-dessus d'un `if` : c'est le tableau
 * {@link ACCOUNT_INTELLIGENCE_SOURCE_RANK} et la fonction pure
 * {@link resolveAccountIntelligenceField} qui le LIT. Un test peut donc
 * prouver la hiérarchie échelon par échelon sans jamais lire un commentaire —
 * voir `account-intelligence-context.test.ts`.
 *
 * ⚠️ Ce n'est PAS la même hiérarchie que celle de `provenance.ts`
 * (`human > connector > pipeline > model`, type `FieldSource`).
 * Celle-là arbitre une ÉCRITURE de champ CRM (qui a le droit d'écraser quoi
 * sur une fiche éditable) ; celle-ci arbitre une LECTURE de contexte
 * commercial (qui croire quand deux référentiels externes se contredisent).
 * Les confondre ferait entrer un `connector` (CRM du client, jamais vu ici) ou
 * sortir DataForge/mémoire marché (jamais vus là-bas) — deux dérivations
 * différentes, deux fichiers différents, par construction.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « CORRECTION HUMAINE » ET « DONNÉE COURANTE » NE SONT PAS DEUX VALEURS
 * ─────────────────────────────────────────────────────────────────────────────
 * Un compte ne porte qu'UNE valeur par champ en base (`accounts.sector`, …) —
 * l'arbitre de `provenance.ts` (`arbitrate()` dans `accounts.service.ts`)
 * protège déjà cette valeur contre une réécriture du pipeline dès qu'un humain
 * l'a corrigée. La façade ne CHOISIT donc pas entre deux valeurs stockées :
 * elle LABELLISE la même valeur — `human_correction` si `field_provenance`
 * porte `source = 'human'` pour ce champ, `current_data` sinon. C'est ce
 * label, pas la valeur, qui change selon l'échelon.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST PAS ENCORE BRANCHÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `market_memory` et `inference` existent dans la hiérarchie et dans
 * {@link resolveAccountIntelligenceField} — un futur appelant peut leur
 * fournir un candidat sans toucher ce fichier. Mais pour les trois champs que
 * la façade résout aujourd'hui (`companyName`, `sector`, `headquarters`), le
 * corpus ne leur donne rien : la mémoire marché est PAR CONSTRUCTION sans nom
 * d'entreprise structuré (elle est keyed par référence d'appelant, jamais par
 * nom — voir `market-memory.ts`), et aucune source d'inférence (modèle) n'est
 * branchée dans ce lot. Ce n'est pas un oubli : c'est ce que le lot #1618
 * livre, noté pour ne pas se relire comme un défaut plus tard.
 */

/**
 * #2116.1-8 — LES HUIT PROVENANCES, et pourquoi elles sont FERMÉES.
 *
 * Le retour demandait que « chaque fait affiché nomme d'où il vient ». Huit
 * libellés écrits à la main dans huit écrans auraient produit huit
 * vocabulaires : c'est l'enum qui les tient, et le rendu les traduit (clé i18n
 * `common:provenance.<source>`, une seule table, GA-26).
 *
 * ⚠️ AJOUT SEULEMENT (GA-08) : les cinq premières valeurs sont celles de #1618,
 * dans leur ordre de DÉCLARATION d'origine — on n'en retire aucune et on
 * n'insère rien au milieu. Les trois dernières sont l'extension de #2116. La
 * conséquence assumée : l'ordre de déclaration n'est PLUS l'ordre d'autorité
 * (il l'était à cinq valeurs), et c'est {@link ACCOUNT_INTELLIGENCE_SOURCE_ORDER}
 * qui porte la hiérarchie — le test la lit là, plus dans l'ordre du tableau.
 *
 * ⚠️ `dataforge` est une valeur STOCKÉE : elle ne se renomme pas. Mais elle ne
 * s'AFFICHE jamais telle quelle — « mémoire marché (faits) » est son libellé
 * (décision D11 de Louis, 14/09/2026 : nos propres briques ne se nomment nulle
 * part côté produit). Le nom d'un outil BRANCHÉ par l'espace, lui, arrive par
 * injection (`tool-naming.ts`), jamais d'ici.
 */
export const ACCOUNT_INTELLIGENCE_SOURCES = [
  'human_correction',
  'current_data',
  'dataforge',
  'market_memory',
  'inference',
  /** #2116.1 — une identité publiée par un registre officiel. */
  'registry_identity',
  /** #2116.4 — un outil que l'ESPACE a branché (CRM, messagerie, agenda). */
  'connected_tools',
  /** #2116.5 — une source publique lue maintenant (site, appel d'offres, offre d'emploi). */
  'public_sources',
] as const
export const accountIntelligenceSourceSchema = z.enum(ACCOUNT_INTELLIGENCE_SOURCES)
export type AccountIntelligenceSource = z.infer<typeof accountIntelligenceSourceSchema>

/**
 * LA HIÉRARCHIE, du plus fort au plus faible — la seule liste qui la porte.
 *
 * Les cinq échelons de Louis (10/09/2026) sont INTACTS et dans le même ordre
 * relatif : `human_correction > current_data > dataforge > market_memory >
 * inference`. #2116 en intercale trois, et la raison de chaque place est
 * écrite ici plutôt que devinée d'un nombre :
 *
 *  - `registry_identity` sous `current_data` : un registre officiel dit le
 *    DROIT (raison sociale, siège), ce qui bat toute collecte — mais pas ce que
 *    l'espace tient pour vrai chez lui, et encore moins une correction humaine.
 *  - `connected_tools` sous `registry_identity` : l'outil branché relaie ce
 *    qu'un TIERS détient, souvent une copie plus ancienne que le registre.
 *  - `public_sources` sous `dataforge` : la collecte publique est plus FRAÎCHE,
 *    pas plus sûre ; « le plus récent » est exactement l'arbitrage que le
 *    docblock de tête refuse.
 */
export const ACCOUNT_INTELLIGENCE_SOURCE_ORDER = [
  'human_correction',
  'current_data',
  'registry_identity',
  'connected_tools',
  'dataforge',
  'public_sources',
  'market_memory',
  'inference',
] as const satisfies readonly AccountIntelligenceSource[]

/** Rang d'autorité — plus grand = plus fort. Jamais recalculé ailleurs :
 *  il se DÉRIVE de {@link ACCOUNT_INTELLIGENCE_SOURCE_ORDER}, pour qu'ajouter
 *  un échelon ne demande jamais de retoucher huit nombres à la main. */
const ACCOUNT_INTELLIGENCE_SOURCE_RANK: Readonly<Record<AccountIntelligenceSource, number>> = Object.fromEntries(
  ACCOUNT_INTELLIGENCE_SOURCE_ORDER.map((source, index) => [source, ACCOUNT_INTELLIGENCE_SOURCE_ORDER.length - index]),
) as Record<AccountIntelligenceSource, number>

/** L'autorité d'une source, pour comparer deux candidats concurrents. */
export function accountIntelligenceSourceRank(source: AccountIntelligenceSource): number {
  return ACCOUNT_INTELLIGENCE_SOURCE_RANK[source]
}

/**
 * La provenance d'UNE valeur rendue par la façade — la source ET la date,
 * jamais l'une sans l'autre (même primitive que `Provenance` ailleurs dans le
 * dépôt : `laura-account-context.ts` §`source`/`observedOn`).
 *
 * `observedAt` est `null` quand la source ne porte pas de date fiable pour
 * cette valeur — la mémoire marché, PAR CONSTRUCTION (`marketObservedZoneSchema`
 * la `.strip()` explicitement : un `observedAt` glissé par un appelant ne doit
 * jamais laisser croire qu'une observation agrégée est datée comme un fait
 * unique). Une date devinée serait pire qu'une date absente : elle se cite.
 */
export const accountIntelligenceProvenanceSchema = z.object({
  source: accountIntelligenceSourceSchema,
  observedAt: z.string().nullable(),
})
export type AccountIntelligenceProvenance = z.infer<typeof accountIntelligenceProvenanceSchema>

/**
 * Un candidat pour UN champ — ce qu'UNE source dit, ou son aveu qu'elle ne dit
 * rien (`value: null`). `resolveAccountIntelligenceField` ignore les candidats
 * sans valeur : leur présence dans la liste documente l'échelon, elle ne pèse
 * pas dans l'arbitrage.
 */
export interface AccountIntelligenceCandidate<T> {
  readonly source: AccountIntelligenceSource
  readonly observedAt: string | null
  readonly value: T | null
}

/**
 * Une valeur rendue par la façade — jamais nue. `unknown` quand AUCUNE source
 * ne dit rien : ce n'est pas une valeur par défaut inventée (« non mesuré
 * n'est jamais 0 »), c'est un état nommé qu'un écran doit traiter à part.
 *
 * #4149 — `reason` est un CODE (jamais une phrase déjà composée) : l'écran le
 * traduit via `t()`, sinon la façade porterait du texte FR en dur dans une
 * réponse API. Optionnel : la plupart des champs de cette façade n'ont qu'une
 * seule façon d'être inconnus et n'ont rien à ajouter à « non mesuré ».
 */
export type AccountIntelligenceField<T> =
  | { readonly state: 'known'; readonly value: T; readonly provenance: AccountIntelligenceProvenance }
  | { readonly state: 'unknown'; readonly reason?: string }

/**
 * #4149 — pourquoi « ESN déjà en place » (`incumbentEsn`) est `unknown` :
 * `AnalysisSectionCard`/`IncumbentEsnCard` rendaient jusqu'ici « non mesuré »
 * SANS raison (`<UnknownValue />` bare), alors que la primitive accepte un
 * `reason` depuis des mois — la seule carte à ne jamais le passer. Deux cas
 * bien distincts, jamais confondus :
 *  - `never_analyzed` : ce compte n'a jamais traversé la recherche (aucune
 *    date de rafraîchissement d'entités) — personne n'a encore cherché ;
 *  - `no_esn_named` : la recherche a tourné, et les sources consultées ne
 *    nomment aucune ESN — on a cherché, rien trouvé. Ni l'un ni l'autre ne
 *    devient un « 0 ESN » : l'absence reste nommée, jamais comptée.
 */
export type IncumbentEsnUnknownReason = 'never_analyzed' | 'no_esn_named'

/** Vrai pour `null`, `undefined`, et une chaîne vide ou faite d'espaces —
 *  même définition que `isBlank` dans `provenance.ts`, redite ici parce que
 *  les deux fichiers arbitrent des choses différentes (voir le docblock de
 *  tête) et ne doivent donc pas partager d'implémentation qui les coup lerait. */
function isBlankCandidateValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  return false
}

/**
 * L'ARBITRE — #1618. Rend le candidat de plus haut RANG parmi ceux qui portent
 * une valeur, quel que soit l'ORDRE dans lequel les candidats sont donnés.
 *
 * C'est cette indépendance à l'ordre qui prouve que la hiérarchie est un
 * arbitrage d'AUTORITÉ et non « le premier qui répond » ou « le plus récent »
 * — le piège exact que `provenance.ts` refuse déjà pour l'écriture de champ,
 * et qui serait tout aussi faux ici : le pipeline DataForge tourne en lot,
 * l'humain corrige une fois ; « le plus récent » désignerait presque toujours
 * la machine.
 */
export function resolveAccountIntelligenceField<T>(
  candidates: readonly AccountIntelligenceCandidate<T>[],
): AccountIntelligenceField<T> {
  let best: AccountIntelligenceCandidate<T> | null = null
  for (const candidate of candidates) {
    if (isBlankCandidateValue(candidate.value)) continue
    if (!best || accountIntelligenceSourceRank(candidate.source) > accountIntelligenceSourceRank(best.source)) {
      best = candidate
    }
  }
  if (!best) return { state: 'unknown' }
  return {
    state: 'known',
    value: best.value as T,
    provenance: { source: best.source, observedAt: best.observedAt },
  }
}

/**
 * Le statut DataForge (ORION V12) tel que la façade le relaie — un MIROIR
 * volontairement étroit de `OrionAccountStatusView`
 * (`apps/api/src/modules/dataforge/orion-accounts.service.ts`), pas un import :
 * la façade est un module NestJS séparé du module `dataforge`, et GA-07 (les
 * frontières de modules, cliquet AU PLAFOND le 10/09/2026) interdit qu'un
 * SERVICE d'un module importe le service d'un autre — voir
 * `apps/api/src/modules/account-intelligence/module-tokens.ts`, qui compose
 * la lecture réelle derrière un jeton plutôt qu'un import direct.
 *
 * `penetrabilite` reste groupée avec sa couverture et sa mise en garde —
 * même règle que la vue d'origine (`orion-penetrabilite-jamais-nue.spec.ts`) :
 * un score de pénétrabilité ne se lit JAMAIS seul.
 */
export const accountIntelligenceDataforgeStatusSchema = z.object({
  companyName: z.string().nullable(),
  sector: z.string().nullable(),
  headquarters: z.string().nullable(),
  penetrabilite: z
    .object({
      score: z.number(),
      couvertureTotale: z.number().nullable(),
      caveat: z.string(),
    })
    .nullable(),
  priorityLevel: z.string().nullable(),
  accountPotentialScore: z.number().nullable(),
  dataConfidenceScore: z.number().nullable(),
  recommendedEntryPoint: z.string().nullable(),
  recommendedPersona: z.string().nullable(),
  recommendedStrategy: z.string().nullable(),
  nextAction: z.string().nullable(),
  mainRisk: z.string().nullable(),
  /** Dernière mise à jour de la ligne DataForge (`updated_at`) — la DATE de
   *  provenance de ce bloc entier. */
  observedAt: z.string(),
  /** Lot 776 — le fait typé NON identifiant `dataforge.status.access` : utilisé par Laura, jamais un code brut. */
  access: dataforgeAccountAccessSchema.nullable().optional(),
  /** #3235 — `data_version` de la ligne DataForge : l'identifiant du jeu de
   *  données qui décrit ce compte. `dataforge_version` du versioning d'une
   *  analyse est lu d'ici (façade), jamais d'un second chemin. */
  dataVersion: z.string().nullable().optional(),
})
export type AccountIntelligenceDataforgeStatus = z.infer<typeof accountIntelligenceDataforgeStatusSchema>

/* ─────────────────────────────────────────────────────────────────────────────
 * #2116.10-12 — LES TROIS FAITS QUI NE SE RECALCULENT PLUS
 * ───────────────────────────────────────────────────────────────────────────*/

/**
 * Une technologie en place, telle que la façade la rend — le NOM et l'USAGE.
 *
 * L'usage est la moitié utile (« React — pour le portail client ») : une liste
 * de noms nus se lit comme un inventaire, pas comme une prise. `null` quand
 * l'analyse ne l'a pas écrit : l'écran le NOMME, il ne le remplit pas.
 */
export const accountIntelligenceTechnologySchema = z.object({
  name: z.string(),
  usage: z.string().nullable(),
})
export type AccountIntelligenceTechnology = z.infer<typeof accountIntelligenceTechnologySchema>

/**
 * #2116.10 — une ESN en place, telle que la façade la rend : le NOM et ce qui
 * dit par où elle se déloge.
 *
 * `strengths` / `weaknesses` étaient produits par l'analyse, lus par l'export
 * PDF, et affichés sur AUCUN écran avant `IncumbentEsnCard` — la faiblesse
 * d'un concurrent en place est la porte d'entrée la plus concrète qu'un
 * dossier puisse contenir. `contractType` accepte la même liberté que
 * `raw_analysis.competitors[].contract_type` (un enum OU une chaîne libre) :
 * la façade ne DEVINE rien, elle relaie ce que l'analyse a écrit.
 */
export const accountIntelligenceIncumbentSchema = z.object({
  name: z.string(),
  contractType: z.string().nullable(),
  strengths: z.string().nullable(),
  weaknesses: z.string().nullable(),
})
export type AccountIntelligenceIncumbent = z.infer<typeof accountIntelligenceIncumbentSchema>

/**
 * Un chemin d'accès — la porte, à qui elle s'ouvre, et pourquoi.
 *
 * ⚠️ C'est ICI que le chemin d'accès se dérive, et nulle part ailleurs
 * (GA-26). Deux calculs distincts vivaient côté écran — un dans
 * `useAccountOverviewData`, un dans `evaluationViewData` — et rien ne garantit
 * que deux onglets montrent la même porte le même jour.
 */
export const accountIntelligenceEntryPathSchema = z.object({
  label: z.string(),
  targetProfile: z.string().nullable(),
  justification: z.string().nullable(),
})
export type AccountIntelligenceEntryPath = z.infer<typeof accountIntelligenceEntryPathSchema>

/* ─────────────────────────────────────────────────────────────────────────────
 * #2116.17-24 — LES HUIT MÉTADONNÉES D'UNE RECOMMANDATION
 * ───────────────────────────────────────────────────────────────────────────*/

/** #2116.17 — ce que la recommandation EST. Une inférence lue comme un fait
 *  est la façon la plus rapide de perdre un rendez-vous. */
export const ACCOUNT_RECOMMENDATION_NATURES = ['fact', 'observation', 'inference', 'correction'] as const
export const accountRecommendationNatureSchema = z.enum(ACCOUNT_RECOMMENDATION_NATURES)
export type AccountRecommendationNature = z.infer<typeof accountRecommendationNatureSchema>

/**
 * #2116.21 — LA CONFIANCE, ET POURQUOI ELLE N'EST PAS UN NOMBRE.
 *
 * « 78 % de confiance » est une PROBABILITÉ déguisée — refusée six fois
 * (`c26_probabilite` au registre de doctrine). Trois niveaux nommés, chacun
 * justifié par un COMPTE de sources concordantes que l'écran peut citer
 * (« 3 sources concordantes »), jamais par un score nu.
 */
export const ACCOUNT_RECOMMENDATION_CONFIDENCES = ['corroborated', 'single_source', 'deduced'] as const
export const accountRecommendationConfidenceSchema = z.enum(ACCOUNT_RECOMMENDATION_CONFIDENCES)
export type AccountRecommendationConfidence = z.infer<typeof accountRecommendationConfidenceSchema>

/**
 * #2116.20 — LA FRAÎCHEUR, quatre états dont un qui n'est PAS une durée.
 *
 * `undated` n'est pas « très vieux » : c'est « on ne sait pas de quand ».
 * Le confondre avec `stale` inventerait une date, et une date se cite en
 * rendez-vous. Un fait périmé redevient inconnu AVEC sa date, il ne disparaît
 * pas (« information de mars 2026, à revérifier »).
 */
export const ACCOUNT_RECOMMENDATION_FRESHNESS = ['fresh', 'ageing', 'stale', 'undated'] as const
export const accountRecommendationFreshnessSchema = z.enum(ACCOUNT_RECOMMENDATION_FRESHNESS)
export type AccountRecommendationFreshness = z.infer<typeof accountRecommendationFreshnessSchema>

/** Les deux seuils de fraîcheur, à UN seul endroit (GA-26). Un mois : le
 *  rythme d'une analyse ; six mois : au-delà, un organigramme d'ESN a bougé. */
const ACCOUNT_RECOMMENDATION_FRESH_DAYS = 30
const ACCOUNT_RECOMMENDATION_STALE_DAYS = 180
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * La fraîcheur d'une observation — LA dérivation, jamais refaite à l'écran.
 *
 * Une date illisible rend `undated`, pas `stale` : `Date.parse('bientôt')`
 * rend `NaN`, et traiter `NaN` comme « très ancien » écrirait « information de
 * plus de six mois » là où il n'y a aucune information de date.
 */
export function accountRecommendationFreshness(
  observedAt: string | null,
  nowMs: number = Date.now(),
): AccountRecommendationFreshness {
  if (!observedAt) return 'undated'
  const observedMs = Date.parse(observedAt)
  if (Number.isNaN(observedMs)) return 'undated'
  const ageDays = Math.max(0, Math.floor((nowMs - observedMs) / DAY_MS))
  if (ageDays < ACCOUNT_RECOMMENDATION_FRESH_DAYS) return 'fresh'
  if (ageDays < ACCOUNT_RECOMMENDATION_STALE_DAYS) return 'ageing'
  return 'stale'
}

/**
 * #2116.22 — CE QUE LA RECOMMANDATION NE COUVRE PAS. Une clé fermée, pas une
 * phrase : un littéral français écrit dans un contrat est français pour
 * toujours, et ce produit se lit en deux langues.
 */
export const ACCOUNT_RECOMMENDATION_LIMITS = [
  'not_a_commitment',
  'single_account_only',
  'contact_unverified',
  'dated_information',
  'coverage_is_not_a_market_fact',
] as const
export const accountRecommendationLimitSchema = z.enum(ACCOUNT_RECOMMENDATION_LIMITS)
export type AccountRecommendationLimit = z.infer<typeof accountRecommendationLimitSchema>

/** #2116.23 — LA VÉRIFICATION UTILE : le geste le moins cher qui tranche. */
export const ACCOUNT_RECOMMENDATION_CHECKS = [
  'confirm_with_contact',
  'check_public_registry',
  'reread_the_source',
  'check_account_history',
] as const
export const accountRecommendationCheckSchema = z.enum(ACCOUNT_RECOMMENDATION_CHECKS)
export type AccountRecommendationCheck = z.infer<typeof accountRecommendationCheckSchema>

/**
 * #2116.24 — L'ACTION POSSIBLE, et pourquoi aucune n'ENVOIE.
 *
 * Les quatre valeurs OUVRENT un écran ou PRÉPARENT un brouillon. « Le copilote
 * n'envoie jamais d'e-mail : il prépare, le commercial envoie » — ce n'est pas
 * une convention d'écran, c'est l'absence de chemin d'écriture, et cette liste
 * fermée est l'endroit où cette absence se vérifie d'un coup d'œil.
 */
export const ACCOUNT_RECOMMENDATION_ACTIONS = ['open_contacts', 'open_plan', 'prepare_message', 'open_sources'] as const
export const accountRecommendationActionSchema = z.enum(ACCOUNT_RECOMMENDATION_ACTIONS)
export type AccountRecommendationAction = z.infer<typeof accountRecommendationActionSchema>

/**
 * UNE recommandation, avec ses HUIT métadonnées — #2116.17 à #2116.24.
 *
 * Aucune n'est optionnelle. C'est le point du retour : une recommandation qui
 * n'en porte que six se lit exactement comme une qui les porte toutes, et
 * c'est celle dont on ne sait pas si c'est un fait qui coûte un rendez-vous.
 * Ce qui manque est donc NOMMÉ (`provenance.observedAt: null` → « date
 * inconnue », `freshness: 'undated'`), jamais absent.
 */
export const accountIntelligenceRecommendationSchema = z.object({
  /** Clé stable de rendu (React key + recette). */
  id: z.string(),
  label: z.string(),
  detail: z.string().nullable(),
  /** #2116.17 */
  nature: accountRecommendationNatureSchema,
  /** #2116.18 (la source) ET #2116.19 (la date, `null` = date inconnue). */
  provenance: accountIntelligenceProvenanceSchema,
  /** #2116.20 */
  freshness: accountRecommendationFreshnessSchema,
  /** #2116.21 — `corroborationCount` est un COMPTE de sources, jamais un score. */
  confidence: z.object({
    level: accountRecommendationConfidenceSchema,
    corroborationCount: z.number().int().nonnegative().nullable(),
  }),
  /** #2116.22 */
  limit: accountRecommendationLimitSchema,
  /** #2116.23 */
  check: accountRecommendationCheckSchema,
  /** #2116.24 */
  action: accountRecommendationActionSchema,
})
export type AccountIntelligenceRecommendation = z.infer<typeof accountIntelligenceRecommendationSchema>

/**
 * CE QUE L'ÉCRAN LIT de `GET /accounts/:id/intelligence-context`.
 *
 * Un MIROIR étroit de la réponse, pas sa totalité : le dossier ne rend ni la
 * lecture brute de la mémoire marché ni le bloc de statut, qui ont leurs
 * propres cartes. Le déclarer ici — plutôt que de laisser l'écran typer sa
 * réponse à la main — est ce qui fait que la façade est LA source : un champ
 * ajouté au serveur et oublié à l'écran se voit en un `tsc`.
 */
export interface AccountIntelligenceContextView {
  readonly accountId: string
  /**
   * #2116.3 / .6 / .7 — L'IDENTITÉ DU COMPTE, AVEC L'ÉCHELON QUI L'A DITE.
   *
   * Ces trois champs étaient résolus, datés et sourcés par le service depuis
   * #1618, renvoyés par la route… et absents de cette vue, donc invisibles de
   * l'écran : le défaut n°1 du dépôt dans sa forme symétrique — l'API calcule,
   * persiste et RENVOIE un champ que personne ne lit.
   *
   * ⚠️ #2116.7 est le plus grave des trois : « une correction humaine gagne
   * toujours » est tenu côté écriture (`arbitrate()`), mais un commercial qui
   * voit « Assurance » sans savoir qu'un collègue l'a corrigé sur le terrain
   * n'a aucune raison de le croire plutôt que la collecte. C'est le LABEL,
   * pas la valeur, qui change selon l'échelon (voir le docblock de tête).
   */
  readonly companyName: AccountIntelligenceField<string>
  /** #2116.6 */
  readonly sector: AccountIntelligenceField<string>
  /** #2116.3 */
  readonly headquarters: AccountIntelligenceField<string>
  /**
   * #2116.6 — LA MÉMOIRE MARCHÉ, NOMMÉE COMME SOURCE.
   *
   * La façade la lit à chaque contexte et la renvoyait déjà — aucun écran ne
   * la lisait. Elle voyage TELLE QUELLE (`MarketMemoryRead`, une union) et
   * jamais aplatie en couverture : « je n'ai rien observé » et « je n'ai pas
   * pu lire » ne se rendent pas pareil, et c'est l'appelant qui doit choisir,
   * à l'endroit où le choix se prend.
   *
   * `provenance.observedAt` est `null` par construction (GA-259) : un corpus
   * agrégé ne date pas ses observations comme un fait unique.
   */
  readonly marketMemory: {
    readonly provenance: AccountIntelligenceProvenance
    readonly read: MarketMemoryRead
  }
  /** #2116.10 — rendue par `IncumbentEsnCard`, seul propriétaire de l'ESN en
   *  place dans l'onglet (GA-26) : la carte le porte avec ses forces et ses
   *  faiblesses, `AccountCanonicalContextCard` ne le recalcule ni ne le
   *  re-rend. */
  readonly incumbentEsn: AccountIntelligenceField<readonly AccountIntelligenceIncumbent[]>
  /** #2116.11 */
  readonly technologies: AccountIntelligenceField<readonly AccountIntelligenceTechnology[]>
  /** #2116.12 */
  readonly entryPaths: AccountIntelligenceField<readonly AccountIntelligenceEntryPath[]>
  /** #2116.17-24 */
  readonly recommendations: readonly AccountIntelligenceRecommendation[]
  /**
   * #190.1/#190.8 (épopée #3219) — LES CONTRADICTIONS DE CHAMP OUVERTES.
   *
   * `detectFieldConflict`/`FieldConflictService.openConflicts` existaient déjà
   * (PDF 6 §5.3) mais n'étaient branchés que sur `GET /accounts/:id/conflicts`
   * — jamais sur cette façade, donc jamais sur une réponse `/chat`. Une
   * contradiction `unresolved` disparaissait donc à la fin du tour où Laura
   * l'aurait éventuellement vue.
   *
   * Rejouée depuis `record_field_audit` (append-only) à CHAQUE lecture de la
   * façade — jamais une table neuve à côté du journal (voir le docblock de
   * `field-conflict.service.ts`) — c'est ce qui fait qu'une contradiction
   * ouverte reste visible d'une conversation à l'autre : #190.8 est une
   * conséquence directe du branchement, pas un second mécanisme.
   *
   * Toujours un tableau, jamais absent : `[]` EST un fait (« aucune
   * contradiction ouverte »), pas une inconnue (GA-18/GA-19).
   */
  readonly conflicts: readonly ConflictedField[]
}

/**
 * La réponse de la route quand le module de la façade n'est pas monté.
 *
 * Elle est rendue telle quelle par le contrôleur (`@Optional()`), et l'écran
 * doit la distinguer d'un contexte VIDE : « on ne sait rien de ce compte » est
 * faux et rassurant à la fois.
 */
export function isAccountIntelligenceUnavailable(
  value: AccountIntelligenceContextView | { status: 'unavailable' } | null | undefined,
): value is { status: 'unavailable' } {
  return Boolean(value && 'status' in value && value.status === 'unavailable')
}
