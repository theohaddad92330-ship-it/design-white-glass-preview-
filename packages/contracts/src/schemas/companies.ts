import { z } from 'zod'
import { MARKET_PATHS_BATCH_MAX, disambiguationMarketPathsSchema, marketMemoryCoverageSchema } from './market-memory.js'
import { marketSignalDateSchema } from './market-signal-date.js'
import { workspaceMarketSchema } from './workspace.js'

/**
 * Company-search contract — used by the autocomplete on the search page.
 *
 * Flow: web → API (NestJS) → IA (FastAPI). For the FR default the IA hits the
 * recherche-entreprises registry (Pappers); a non-FR `country` delegates to the
 * matching country pack (SEC EDGAR US, CBR/MRAS CA, Zefix CH, KBO BE…), whose
 * public-registry lookup resolves the entity by name. The frontend never sees a
 * provider key, and every provider's raw shape is normalized server-side into
 * `CompanySuggestion` so the UI stays provider-agnostic.
 */

export const companySuggestionSchema = z.object({
  name: z.string(),
  // French registry pivot (SIREN). Kept for the FR path; **empty for a foreign
  // suggestion**, which carries its national identifier under `registryId`
  // instead (no SIREN exists abroad — never fabricated).
  siren: z.string(),
  city: z.string(),
  sector: z.string(),
  // Registry provenance for the hybrid "comptes similaires" scoring (addendum
  // Théo) : dept/région derive from the HQ postal code, size from the registry
  // headcount range. Optional/nullable — absent when the provider doesn't expose
  // them (a missing criterion simply scores 0, no data is ever invented).
  postal_code: z.string().nullable().optional(),
  employees_min: z.number().nullable().optional(),
  employees_max: z.number().nullable().optional(),
  // #3092 — date de création registre (ISO), déjà collectée côté Pappers
  // (`CompanySearchHit.creation_date`) mais jusqu'ici jamais projetée sur ce
  // chemin : sans elle, le scoring « comptes similaires » ne pouvait pas
  // distinguer une jeune structure d'une TPE ancienne dans la même tranche
  // d'effectifs — les deux recoupaient « Startups & Scale-ups » (1-250
  // salariés). `null`/absent quand le registre ne la publie pas (aucune date
  // inventée).
  creation_date: z.string().nullable().optional(),
  // Cross-border identity (international dedup #494) — set ONLY for a non-FR
  // suggestion resolved by a country pack. `country` is the 2-letter market,
  // `registryId` the national pivot (CIK US / numéro BCE BE / Juri_ID CA / UID
  // CH — the twin of the SIREN persisted on `accounts.registry_id`), and
  // `registryIdLabel` its human label ("CIK", "numéro BCE"…) for the UI.
  //
  // `.nullable()` like `postal_code` above, and for the same reason: the IA
  // emits these keys as explicit `null` on the FR path (Pydantic serialises
  // optional fields rather than omitting them), so a plain `.optional()` — which
  // accepts `undefined` but REJECTS `null` — did not describe the real wire.
  // The suggestion object is forwarded verbatim by the NestJS proxy, so this
  // schema is the only place the browser's view of it is specified.
  country: workspaceMarketSchema.nullable().optional(),
  registryId: z.string().nullable().optional(),
  registryIdLabel: z.string().nullable().optional(),
  /**
   * Whether the registry NAF is coherent with an IT services company. Set ONLY
   * under `lens: 'esn'` (the onboarding "what's your company?" autocomplete);
   * `null`/absent everywhere else — a prospect account is not an ESN, so
   * judging it on that axis would be meaningless.
   *
   * Tri-state as everywhere: `false` = the registry contradicts it (the row is
   * marked), `null` = unknown (silent).
   */
  is_esn_naf: z.boolean().nullable().optional(),
  /**
   * #2265.14 — même jugement que le badge « intermédiaire, pas client final »
   * de Découvrir (`isIntermediary`, `discover.ts`), sur le nom + NAF déjà
   * résolus par cette suggestion. Contrairement à `is_esn_naf`, jamais gated
   * sur `lens: 'esn'` : le service IA le rend toujours (`classify_actor_type`
   * répond systématiquement, y compris « non classé »). Optionnel côté
   * contrat pour ne pas casser un appelant qui construit une suggestion à la
   * main (tests, données démo) sans le champ — absent ⇒ traité comme `false`.
   */
  is_intermediary: z.boolean().optional(),
  /**
   * Les DEUX faits publiés qui permettent de distinguer deux homonymes.
   *
   * Mesuré en production le 30/08/2026 : sous « ROCHE », les cinq lignes de la
   * liste portaient toutes la MÊME phrase — « 5 des résultats portent le nom
   * "ROCHE". » — qui n'aide à choisir entre aucune d'elles (loi 4 du tome 7 :
   * rien n'apparaît deux fois sous la même forme avec le même contenu). Ce qui
   * aide : l'effectif publié, la catégorie d'entreprise, le SIREN.
   *
   * `headcount_label` est le LIBELLÉ de la tranche INSEE telle que le registre
   * la publie (« 500 à 999 salariés »), décodé d'une nomenclature publique —
   * jamais estimé. `size_class` est la catégorie d'entreprise (TPE / PME / ETI
   * / GE), recopiée telle quelle.
   *
   * `null`/absent quand le registre écrit `NN` ou ne dit rien. **Une absence ne
   * s'affiche jamais « 0 salarié »** : « non mesuré » et « aucun salarié » sont
   * deux faits opposés, et un champ vide se lit là où un zéro se croit. Absents
   * aussi sur le chemin Pappers et sur un marché étranger — leurs sources ne les
   * publient pas sous cette forme.
   */
  headcount_label: z.string().nullable().optional(),
  size_class: z.string().nullable().optional(),
  /**
   * #2162.9 — la raison sociale PUBLIÉE, quand le registre la distingue du nom
   * affiché (`name`, souvent le nom commercial). `null`/absent quand le
   * registre n'en publie qu'un seul, ou pour une suggestion étrangère (aucun
   * équivalent Pappers `denomination` côté country packs). L'écran ne
   * l'affiche que si elle DIFFÈRE de `name` — deux lignes pour un seul fait
   * serait le bruit que `SearchSuggestionItem.tsx` refuse déjà ailleurs.
   */
  legal_name: z.string().nullable().optional(),
  /**
   * #2162.14 — le statut administratif PUBLIÉ : `false` quand le registre
   * marque l'entité comme cessée (`entreprise_cessee`), `true` quand elle est
   * active. `null`/absent quand la source ne publie pas ce fait de façon
   * fiable pour CE chemin — le pack pays étranger (`_registry_to_response`)
   * ne l'expose pas, et l'écran ne devine jamais un statut absent.
   *
   * Le chemin registre gratuit (`_registry_candidates_to_response`) filtre
   * déjà les entités cessées en amont (une coquille radiée n'est pas "votre
   * entreprise") : `is_active` y est donc toujours `true`, jamais `false`.
   */
  is_active: z.boolean().nullable().optional(),
  /**
   * #1586 — le nombre de parcours observés par la mémoire marché pour CETTE
   * suggestion, calculé côté API (`CompaniesService`) et jamais lu par ce
   * contrat jusqu'à ce lot.
   *
   * ⚠️ EXCEPTION NOMMÉE — la SEULE réutilisation de `disambiguationMarketPathsSchema`
   * en dehors de son propre test. Partout ailleurs dans le produit, sous
   * `MARKET_MEMORY_MIN_PATHS` (3) observations la mémoire marché ne dit RIEN
   * (`marketPathsSchema`, `null`). ICI, et seulement ici, « 0 parcours
   * observé » est affiché : cet écran ne juge pas une entreprise, il DISTINGUE
   * deux lignes de registre — « ROCHE, 41 parcours observés » contre « ROCHE
   * BOBOIS, aucun parcours observé ». L'asymétrie EST l'information qui
   * départage deux homonymes, et la cacher redonnerait l'ambiguïté que cet
   * écran existe pour lever. Voir `disambiguationMarketPathsSchema` pour le
   * détail de l'échelle (0, ou ≥3, jamais 1 ni 2).
   *
   * `.optional()` en plus de `.nullable()` — contrairement au schéma marché
   * d'origine — parce que la suggestion BRUTE rendue par le service IA
   * (Pappers / country packs) n'a jamais connu ce champ : c'est
   * `CompaniesService`, côté API, qui l'ajoute après coup via la mémoire
   * marché NestJS. `undefined` = pas encore enrichi ; `null` = enrichi, mais
   * la mémoire marché n'a rapproché aucune entreprise avec certitude.
   */
  marketPaths: disambiguationMarketPathsSchema.optional(),
})

export const companySearchQuerySchema = z.object({
  q: z.string().min(2),
  limit: z.coerce.number().int().min(1).max(20).default(5),
  // Target market of the suggestion source. Absent / `FR` → recherche-entreprises
  // (the strictly-unchanged French default). A non-FR market delegates to the
  // matching country pack; a market with no suggestion source degrades to an
  // empty list (never a fabricated suggestion).
  country: workspaceMarketSchema.optional(),
  /**
   * Which ranking lens to apply to the suggestions.
   *
   * Absent / `generic` — registry order, byte-identical to the historical
   * behaviour. This is what the PROSPECT account autocomplete uses, and it must
   * stay that way: penalising a non-IT NAF when hunting a target account would
   * be exactly backwards.
   *
   * `esn` — rank by "how plausibly is this an IT services company", for the
   * onboarding screen that asks the user for their OWN company. It only
   * REORDERS and annotates; it never removes a suggestion.
   */
  lens: z.enum(['generic', 'esn']).optional(),
})

/**
 * #1589.2 — la requête de la preview mémoire marché **pré-compte**.
 *
 * Deux champs, et c'est tout ce que la jointure permet à cet instant du
 * parcours. L'issue demande « SIREN / registry ID / mapping robuste » ;
 * `market_company_signal` ne porte **pas de SIREN**, et `CompanySuggestion` ne
 * porte pas de site web — les deux identités fortes n'existent d'aucun des deux
 * côtés ici. Le rapprochement fort du corpus est le domaine racine, et on ne
 * l'obtient qu'une fois le compte créé.
 *
 * Un `siren` accepté puis ignoré serait un paramètre déclaré que personne ne
 * lit : le contrat annoncerait une précision qu'il n'a pas. Ce qui tient
 * l'intention de l'issue à la place, c'est l'ARBITRAGE — deux entreprises du
 * corpus qui se disputent le nom rendent `ambiguous`, et la preview se tait
 * plutôt que de choisir. Le jour où une identité plus forte traverse
 * l'autocomplétion, elle entre ici.
 */
export const marketPreviewQuerySchema = z.object({
  /** La raison sociale choisie dans le registre. Un nom vide rapprocherait tout de tout. */
  name: z.string().trim().min(1),
  /** Le marché de la suggestion — le seul départage d'homonymes dont ce chemin dispose. */
  country: workspaceMarketSchema.optional(),
})
export type MarketPreviewQuery = z.infer<typeof marketPreviewQuerySchema>

/**
 * #1593.2 — la requête du départage des premiers comptes suggérés.
 *
 * `name` se répète (`?name=A&name=B`) plutôt que de se séparer par une virgule :
 * une raison sociale en contient (« ROCHE BOBOIS, SA »), et un séparateur qui
 * coupe au milieu d'un nom rapproche une entreprise qui n'existe pas.
 */
export const marketPathsQuerySchema = z.object({
  name: z
    .union([z.string(), z.array(z.string())])
    .transform(value => (Array.isArray(value) ? value : [value]).map(entry => entry.trim()).filter(Boolean))
    .pipe(z.array(z.string().min(1)).min(1).max(MARKET_PATHS_BATCH_MAX)),
  country: workspaceMarketSchema.optional(),
})
export type MarketPathsQuery = z.infer<typeof marketPathsQuerySchema>

export const companySearchResponseSchema = z.object({
  suggestions: z.array(companySuggestionSchema),
  /**
   * La requête RÉELLEMENT servie, quand elle n'est pas celle qui a été tapée.
   *
   * #1099 — le registre cherche sur la raison sociale : « Bedrock Streaming »
   * (la marque) n'y figure pas, la société y est inscrite « BEDROCK (M6 DIGITAL
   * DISTRIBUTION) », et la liste vide se lisait « cette entreprise n'existe
   * pas ». Quand la recherche exacte ne rend rien, une requête plus courte est
   * tentée — et l'écran doit le DIRE, sinon il fait passer une autre recherche
   * pour celle qui a été demandée.
   *
   * Absent sur le chemin nominal : la réponse est alors inchangée.
   */
  broadenedFrom: z.string().optional(),
  /**
   * La source n'a PAS répondu — ce n'est pas « aucune entreprise trouvée ».
   *
   * #1107/#1109 — « Bizarre, il ne trouve pas la mutuelle prévoir », puis
   * « Tjs réseau et/ou lien KO. S'il y a effectivement un pb, faudrait une
   * notification en ce sens ». Il avait raison : le registre soft-failait à
   * `[]`, l'API repliait son `catch` sur `[]`, et l'écran écrivait « Aucune
   * entreprise trouvée » — c'est-à-dire la phrase qui affirme le contraire de
   * ce qui s'est passé. Une erreur se remarque, une liste vide se croit.
   *
   * Absent sur le chemin nominal : la réponse est alors inchangée.
   */
  sourceUnavailable: z.literal(true).optional(),
})

/**
 * #1626 — LA RECHERCHE PAR CONTEXTE MARCHÉ OBSERVÉ, DEPUIS DÉCOUVRIR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE CONTRAT N'INVENTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Même forme que `CopilotMarketMemorySearchDto` (`copilot-bridge`), qui pose
 * déjà EXACTEMENT ces six filtres devant `MarketMemoryService.searchByFilters`
 * — le moteur existe depuis #1596.6-10, ce lot lui ouvre juste une seconde
 * porte, JWT plutôt qu'interne, pour qu'un écran authentifié puisse l'appeler
 * sans passer par le pont réservé au service IA. `userId`/`workspaceId`
 * n'apparaissent pas : les cinq tables de la mémoire marché sont PARTAGÉES
 * entre tous les espaces (GA-16), la lecture ne connaît donc aucun espace.
 *
 * Le `.refine()` est la MÊME règle que `MarketMemoryService.searchByFilters`
 * applique elle-même (au moins un filtre discriminant) : la dupliquer ici
 * transforme un refus profond en 400 immédiat, à la porte — c'est le service
 * qui reste la source de vérité (GA-258).
 */
export const marketContextSearchQuerySchema = z
  .object({
    /** Une technologie citée par les parcours observés (ex. « Java »). */
    technology: z.string().trim().min(1).max(120).optional(),
    /** Ville, région ou pays de la zone OBSERVÉE (#1608 / #1630.10). */
    location: z.string().trim().min(1).max(120).optional(),
    /** Une société de services observée autour des entreprises cherchées —
     *  « Écosystèmes liés à X », jamais « ESN présente » ni « Clients de X ». */
    esn: z.string().trim().min(1).max(120).optional(),
    /** Une famille de rôles observée (ex. « Data »). */
    roleFamily: z.string().trim().min(1).max(120).optional(),
    employeeMin: z.coerce.number().int().min(0).max(5_000_000).optional(),
    employeeMax: z.coerce.number().int().min(0).max(5_000_000).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict()
  .refine(
    value =>
      Boolean(
        value.technology ||
        value.location ||
        value.esn ||
        value.roleFamily ||
        value.employeeMin !== undefined ||
        value.employeeMax !== undefined,
      ),
    {
      message:
        'La recherche dans la mémoire marché exige au moins un filtre discriminant : technologie, ' +
        'localisation, société de services observée, famille de rôle, ou effectif.',
    },
  )
export type MarketContextSearchQuery = z.infer<typeof marketContextSearchQuerySchema>

/**
 * Une entreprise trouvée par la recherche de contexte marché — le MÊME
 * `MarketMemoryCoverage` que la preview et le dossier de compte, avec le nom
 * qui dit LAQUELLE. `coverage.covered` est toujours `true` ici : sous
 * `MARKET_MEMORY_MIN_PATHS`, une entreprise ne sort jamais de cette liste.
 */
export const marketContextMatchSchema = z.object({
  companyName: z.string(),
  coverage: marketMemoryCoverageSchema,
  /**
   * #2288.2 — la date du dernier signal connu, avec sa NATURE, telle que le
   * serveur l'a tranchée (`decideMarketSignalDate`).
   *
   * ⚠️ Ce schéma est plus ÉTROIT que celui du service : un `z.object` retire en
   * silence ce qu'il ne déclare pas. Sans ce champ, la date calculée côté
   * serveur disparaissait au bord de la route, et l'écran restait à « aucun
   * signal actuel » sans que rien n'échoue — le défaut n°1 du dépôt, du code
   * juste que personne ne reçoit.
   *
   * **ABSENT**, jamais `null`, quand aucune date n'est lisible.
   */
  currentSignal: marketSignalDateSchema.optional(),
})
export type MarketContextMatch = z.infer<typeof marketContextMatchSchema>

/**
 * Le résultat de `GET /companies/market-context-search`. Même union `ok` /
 * `unavailable` que partout ailleurs dans la mémoire marché : un corpus sans
 * résultat et un corpus qu'on n'a pas pu lire ne se rendent jamais pareil.
 */
export const marketContextSearchReadSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), matches: z.array(marketContextMatchSchema) }),
  z.object({ status: z.literal('unavailable'), reason: z.string().min(1) }),
])
export type MarketContextSearchRead = z.infer<typeof marketContextSearchReadSchema>

export type CompanySuggestion = z.infer<typeof companySuggestionSchema>
export type CompanySearchQuery = z.infer<typeof companySearchQuerySchema>
/** Ranking lens of `GET /companies/search` — see `companySearchQuerySchema.lens`. */
export type CompanySearchLens = NonNullable<CompanySearchQuery['lens']>
export type CompanySearchResponse = z.infer<typeof companySearchResponseSchema>
