import { z } from 'zod'
import { SITE_TYPES, type SiteType } from './analysis/primitives.js'
import { APPLICATION_SECTOR_BY_CODE } from './application-sectors.js'
import { dominantOfferDomain } from './consulting-domains.js'
import { type OfferDomain, offerDomainSchema } from './onboarding.js'
import { EMPTY_STRUCTURED_LEXICON, structuredLexiconSchema, type StructuredLexicon } from './workspace-lexicon.js'

/**
 * OFFER PORTFOLIO — ce que le vendeur vend, et à qui, sous forme exploitable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL PORTE, ET SURTOUT CE QU'IL NE PORTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le portefeuille de DOMAINES vit dans `esn_profiles.offer_domains` et nulle
 * part ailleurs. Ce contrat-ci ne le recopie pas : un `capability_codes` ici
 * serait une seconde vérité du même réglage, et deux vérités du même réglage
 * divergent au premier écran qui n'écrit que l'une des deux (loi 1 du tome 7,
 * garde GA-26).
 *
 * Il ne porte pas non plus de `primary_domain_code` vendeur. Un portefeuille
 * est un ENSEMBLE : désigner un domaine principal parmi douze serait un choix
 * arbitraire de plus à maintenir, alors que la question réellement posée par le
 * produit — « dans quel prisme raisonner ? » — a déjà une réponse DÉTERMINISTE,
 * `dominantOfferDomain`. (`primary_domain_code` existe bien, mais sur un
 * PROJET : là il désigne une prestation achetée, ce qui est une autre question.)
 *
 * Ce qu'il porte, c'est ce qui n'existait nulle part : le type de société, les
 * secteurs d'application NORMALISÉS, la politique de site, la géographie, les
 * familles d'interlocuteurs préférées, le lexique et la portée de réutilisation
 * des retours.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'INTERRUPTEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * Le portefeuille ABSENT (`null` en base) est l'état de tous les espaces
 * existants : le produit lit alors exactement le chemin historique
 * (`offer_domain` puis `offer_domains`), prompts byte-identiques. Sa PRÉSENCE
 * est l'interrupteur — comme « sélectionner un domaine non-défaut EST
 * l'interrupteur » des packs. Pas de drapeau à poser, donc pas de drapeau à
 * oublier d'enlever.
 */
export const OFFER_PORTFOLIO_VERSION = 1 as const

/**
 * Jusqu'où un retour détaillé d'un client peut servir au produit.
 *
 * Le défaut est le plus fermé, et c'est la seule valeur par défaut acceptable :
 * un bêta-testeur qui décrit sa stratégie, ses seuils et ses cibles décrit ce
 * qui le distingue de ses concurrents. `generalized_only` n'autorise QUE le
 * motif anonymisé (« le secteur appartient à la mission »), jamais la valeur.
 *
 * ⚠️ ADDITIF UNIQUEMENT (GA-08).
 */
export const FEEDBACK_REUSE_SCOPES = ['tenant_private', 'generalized_only'] as const
export const feedbackReuseScopeSchema = z.enum(FEEDBACK_REUSE_SCOPES)
export type FeedbackReuseScope = (typeof FEEDBACK_REUSE_SCOPES)[number]

/** Garde un tableau de chaînes, élément par élément, sur un référentiel donné.
 *  Tolérance par ÉLÉMENT : un code qu'un build plus ancien ne connaît pas est
 *  écarté SEUL — un `.catch([])` global jetterait onze secteurs pour un
 *  douzième inconnu (même règle que `offer_domains`). */
function knownCodes(known: ReadonlyMap<string, unknown>) {
  return z
    .array(z.string())
    .catch([])
    .transform(codes => codes.filter(code => known.has(code)))
}

/** La politique de site du vendeur. Entièrement facultative : un vendeur qui
 *  n'a pas de préférence de site n'en a pas, et lui en inventer une filtrerait
 *  des comptes qu'il voulait voir. */
export const targetSitePolicySchema = z.object({
  types: z
    .array(z.string())
    .catch([])
    .transform(codes => codes.filter((code): code is SiteType => (SITE_TYPES as readonly string[]).includes(code))),
  /**
   * Effectif minimum SUR SITE. `null` = aucun seuil, et jamais `0` : « je ne
   * filtre pas sur la taille » et « je vise les sites de zéro personne » ne
   * sont pas la même phrase.
   *
   * C'est une PRÉFÉRENCE d'espace, jamais une règle produit : le seuil de 100
   * d'un client est le sien, un autre choisira 250 ou aucun.
   */
  min_headcount: z.number().int().positive().nullable().catch(null).default(null),
})
export type TargetSitePolicy = z.infer<typeof targetSitePolicySchema>

/** #3238.8 — les niveaux de séniorité qu'une société VEND (placement), même
 *  vocabulaire fermé que la séniorité CHERCHÉE par une offre d'emploi
 *  (`derive_seniority`, côté IA). */
export const SOLD_SENIORITY_LEVELS = ['junior', 'confirme', 'senior'] as const
export type SoldSeniorityLevel = (typeof SOLD_SENIORITY_LEVELS)[number]

/**
 * Le niveau cherché par une offre face aux niveaux que la société vend.
 *
 * `unknown` quand l'un des deux manque : aucun niveau vendu déclaré (un
 * portefeuille vide ne dit pas « on vend tout ») ou offre muette sur le niveau.
 * Jamais `not_sold` deviné d'un silence.
 */
export type SeniorityFit = 'sold' | 'not_sold' | 'unknown'
export function seniorityFit(sought: string | null | undefined, sold: readonly string[]): SeniorityFit {
  if (!sought || sold.length === 0) return 'unknown'
  return sold.includes(sought) ? 'sold' : 'not_sold'
}

export const offerPortfolioSchema = z.object({
  version: z.literal(OFFER_PORTFOLIO_VERSION).catch(OFFER_PORTFOLIO_VERSION).default(OFFER_PORTFOLIO_VERSION),

  /**
   * Le type de société du vendeur — DÉRIVÉ du pack dominant de son
   * portefeuille, et stocké ici UNIQUEMENT quand un humain l'a corrigé.
   *
   * `null` ne veut donc pas dire « inconnu » mais « laisse dériver » : c'est ce
   * qui permet à la dérivation de s'améliorer (un domaine ajouté, un pack
   * nouveau) sans écraser une correction, et à une correction de tenir sans
   * geler le reste. Une question d'onboarding de plus aurait demandé au vendeur
   * ce que ses domaines viennent de dire.
   */
  company_type: offerDomainSchema.nullable().catch(null).default(null),

  /** Les secteurs d'application visés, en CODES (cf. `application-sectors.ts`).
   *  Vide = pas de ciblage sectoriel déclaré — surtout pas « tous ». */
  target_application_sectors: knownCodes(APPLICATION_SECTOR_BY_CODE).default([]),

  /** #3238.8 — les niveaux vendus. Vide = non déclaré (jamais « tous »). */
  sold_seniority_levels: z
    .array(z.string())
    .catch([])
    .transform(levels => SOLD_SENIORITY_LEVELS.filter(level => levels.includes(level)))
    .default([]),

  target_site: targetSitePolicySchema.catch({ types: [], min_headcount: null }).default({
    types: [],
    min_headcount: null,
  }),

  /** Zones de chasse en codes libres (les régions du questionnaire). Vide =
   *  aucune préférence, jamais « France entière » deviné. */
  target_geographies: z.array(z.string()).catch([]).default([]),

  /**
   * Les familles d'interlocuteurs par lesquelles ce vendeur entre, et celles
   * qui ne sont que des passages obligés. Vides = l'ordre du pack s'applique.
   * Le référentiel de familles arrive avec le lot rôles ; les codes sont donc
   * libres ici et validés par leur consommateur.
   */
  preferred_buyer_role_families: z.array(z.string()).catch([]).default([]),
  secondary_gatekeeper_role_families: z.array(z.string()).catch([]).default([]),

  /**
   * Le lexique de l'espace, moitié « textes GÉNÉRÉS » — deux listes de mots qui
   * descendent jusqu'au prompt de tous les modèles (Laura comprise) par
   * `portfolio_context_block`.
   *
   * ⚠️ Elles ne peuvent PAS renommer un libellé, et ce n'est pas un oubli :
   * « Affaire » ne dit pas ce qu'il remplace. C'est {@link lexicon} qui porte la
   * moitié « interface », par CONCEPT — voir `workspace-lexicon.ts`.
   */
  preferred_terms: z.array(z.string().max(60)).max(40).catch([]).default([]),
  forbidden_terms: z.array(z.string().max(60)).max(40).catch([]).default([]),

  /**
   * Le lexique STRUCTURÉ (D17, 28/08/2026) — la moitié « interface ».
   *
   * Il vit ICI, dans le portefeuille, et pas dans une table à lui : les mots
   * interdits sont déjà dans `forbidden_terms`, et donner deux domiciles au même
   * réglage est exactement ce que GA-26 refuse. Absent ⇒ `{ overrides: [] }` ⇒
   * les libellés du produit, à l'octet près.
   */
  lexicon: structuredLexiconSchema.catch(EMPTY_STRUCTURED_LEXICON).default(EMPTY_STRUCTURED_LEXICON),

  privacy: z
    .object({ feedback_reuse: feedbackReuseScopeSchema.catch('tenant_private').default('tenant_private') })
    .catch({ feedback_reuse: 'tenant_private' as const })
    .default({ feedback_reuse: 'tenant_private' }),
})
export type OfferPortfolio = z.infer<typeof offerPortfolioSchema>

/**
 * Un PATCH de portefeuille (écran → API) — #2862 (#2437.8).
 *
 * `Partial<OfferPortfolio>` obligerait l'appelant à fournir `version`/
 * `updatedAt` du lexique pour poser une simple liste de surcharges : ces deux
 * champs sont calculés SERVEUR (`OfferPortfolioService.nextLexiconVersion`),
 * jamais fournis par un client — un patch n'en porte donc que ce qu'il PEUT
 * légitimement écrire.
 */
export type OfferPortfolioPatch = Partial<Omit<OfferPortfolio, 'lexicon'>> & {
  lexicon?: Pick<StructuredLexicon, 'overrides'>
}

/**
 * Un portefeuille lu depuis une colonne `jsonb` — `null` quand il n'y en a pas
 * ou que la forme est illisible.
 *
 * Une forme abîmée (build plus récent, colonne corrompue) ne lève JAMAIS : ce
 * réglage est lu sur le chemin d'une analyse, et un profil illisible ferait
 * tomber toutes les analyses de l'espace. Fonction unique pour que le service
 * d'écriture et le lecteur d'analyse n'aient pas chacun leur tolérance.
 */
export function parseStoredPortfolio(stored: unknown): OfferPortfolio | null {
  if (!stored || typeof stored !== 'object') return null
  const parsed = offerPortfolioSchema.safeParse(stored)
  return parsed.success ? parsed.data : null
}

/**
 * Le type de société à retenir : la correction humaine d'abord, la dérivation
 * ensuite, et RIEN quand le portefeuille ne dit rien.
 *
 * Le `null` final est délibéré : c'est ce qui empêche le produit de conclure
 * « ESN IT » d'un silence, exactement le défaut que le retour bêta a nommé.
 */
export function companyTypeFromPortfolio(
  domainCodes: readonly string[],
  correction: OfferDomain | null,
): OfferDomain | null {
  return correction ?? dominantOfferDomain(domainCodes)
}

/** Un profil d'AVANT ce contrat, rendu sous la forme du portefeuille — en
 *  LECTURE seulement. Aucun backfill : rien ne réécrit un profil existant, et
 *  une valeur dérivée ne doit jamais devenir une valeur stockée (elle cesserait
 *  de suivre le portefeuille et deviendrait fausse en silence). */
export function portfolioFromLegacy(legacy: {
  offer_domain: OfferDomain | null
  offer_domains: readonly string[]
}): OfferPortfolio {
  return offerPortfolioSchema.parse({
    company_type: companyTypeFromPortfolio(legacy.offer_domains, legacy.offer_domain),
  })
}

export interface ResolvedPortfolio extends OfferPortfolio {
  /** D'où vient ce qu'on vient de lire — `legacy` quand aucun portefeuille n'a
   *  jamais été enregistré. Exposé pour que les écrans puissent le DIRE plutôt
   *  que d'afficher une configuration que personne n'a saisie. */
  source: 'portfolio' | 'legacy'
}

/**
 * Ce que le reste du produit lit. Un seul point d'entrée, pour que la règle de
 * priorité (portefeuille → legacy) ne soit pas recopiée dans chaque appelant —
 * c'est ainsi que deux endroits finissent par répondre différemment.
 */
export function resolvedPortfolio(input: {
  portfolio: OfferPortfolio | null
  offer_domain: OfferDomain | null
  offer_domains: readonly string[]
}): ResolvedPortfolio {
  if (!input.portfolio) return { ...portfolioFromLegacy(input), source: 'legacy' }
  return {
    ...input.portfolio,
    company_type: companyTypeFromPortfolio(input.offer_domains, input.portfolio.company_type),
    source: 'portfolio',
  }
}
