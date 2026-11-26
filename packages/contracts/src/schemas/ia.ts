import { z } from 'zod'

import { ACCOUNT_FACT_KINDS } from './account-facts.js'
import { analysisContextSchema } from './analysis-context.js'
import { apolloSourceStatusSchema } from './contacts-data.js'
import { channelPerformanceListSchema } from './channel-performance.js'
import { coverageLevelSchema } from './coverage.js'
import { MESSAGE_MATRIX } from './message-matrix.js'
import { orgHierarchyLevelSchema, orgHierarchyRelationSchema } from './org-graph.js'

/**
 * #4070 — le wire d'un fait du compte tel qu'il voyage vers le pipeline d'analyse
 * (research, plan, graphe complet) : AUCUN champ de provenance ni de poids, voir
 * `account-facts.ts`. Un seul contrat pour les trois chemins — jamais un second.
 */
const analysisAccountFactWireSchema = z.object({
  kind: z.enum(ACCOUNT_FACT_KINDS),
  label: z.string(),
  date: z.string(),
  ageDays: z.number().int().min(0),
})

/**
 * Contracts for calls from the API to the FastAPI IA service.
 *
 * One input/response pair per IA endpoint. Inputs are camelCase (TS convention); `IaClient`
 * snake_cases them when serialising to the wire. Schemas are Zod so consumers can validate
 * inputs at the boundary when needed — types are inferred from the schemas.
 */

/**
 * Optional descriptor passed to every analysis-phase IA call. The IA service
 * `POST`s back to `url` with `X-Analysis-Secret: secret` between substeps so
 * the API worker can forward sub-phase progress over Socket.IO.
 */
export const analysisProgressCallbackSchema = z.object({
  url: z.string().url(),
  accountId: z.string().guid(),
  jobId: z.string().min(1),
})
export type AnalysisProgressCallback = z.infer<typeof analysisProgressCallbackSchema>

/* ─── Phase 1 — research ────────────────────────────────────────────────────── */

export const researchInputSchema = z.object({
  companyName: z.string().min(1),
  // Scope lock (Théo p.10) : SIREN de l'entité choisie par le commercial. Ancre
  // la recherche Pappers dessus au lieu de re-résoudre le nom (ambigu : SG → SCI).
  siren: z.string().optional(),
  // Périmètre d'analyse (Théo p.10/21) : biaise la recherche (géo/familles/focus).
  scopeMode: z.string().optional(),
  profileData: z.record(z.string(), z.unknown()),
  userContext: z.union([analysisContextSchema, z.string()]).optional(),
  accountId: z.string().guid(),
  userId: z.string().guid(),
  /**
   * Portée équipe du grounding RAG. La base de connaissance (références, cas
   * clients, offres) appartient à l'ESN, pas au commercial qui lance le run :
   * l'analyse doit s'ancrer sur ce que TOUTE l'équipe a chargé. Absent = portée
   * per-user historique — jamais un élargissement.
   */
  workspaceId: z.string().guid().optional(),
  /**
   * Couche zéro de la méthodologie de vente (annexe p8 : « chercher ce qui
   * existe avant de proposer du froid ») — le relevé RÉEL de ce compte dans le
   * CRM connecté de l'ESN, rendu côté API. Renseigné UNIQUEMENT sur un match
   * (contact ou deal ouvert), si bien que sa présence vaut « ce compte est déjà
   * connu » : le SalesContext sort alors la relation du « froid ». Absent (aucun
   * CRM connecté = cas par défaut) ⇒ salesContext et prompts inchangés.
   */
  crmPresence: z.string().optional(),
  /**
   * Couche zéro, HORS CRM (annexe p8 : « ATS, BondManager, Drive, e-mails,
   * notes, CV envoyés »). Le relevé RÉEL de ce compte dans les autres outils
   * internes de l'ESN, rendu côté API. Même contrat que {@link crmPresence} :
   * renseigné uniquement sur une trouvaille, donc sa présence vaut « quelqu'un
   * ici a déjà touché ce compte ». Absent (aucune intégration connectée = cas
   * par défaut) ⇒ prompts inchangés.
   */
  internalHistory: z.string().optional(),
  /**
   * #3753.3 — le ciblage que l'ESN a fait de CE compte (tier, raison,
   * problématiques, projets IT). Hypothèses du VENDEUR : fournies, NON vérifiées ;
   * la phase 1 les injecte sous cette étiquette, jamais comme des faits collectés.
   * Absent (compte hors liste) ⇒ prompts inchangés.
   */
  sellerHypotheses: z
    .object({
      tier_label: z.string().nullable(),
      selection_reason: z.string().nullable(),
      addressable_issues: z.string().nullable(),
      upcoming_it_projects: z.string().nullable(),
      /** #3819 (lot RBB) — la raison calculée par Découvrir, quand le compte en vient. */
      discover_origin_reason: z.string().nullable().optional(),
      /** #3819 (lot RBB) — les critères Découvrir posés, une ligne FR par axe. */
      discover_origin_criteria: z.array(z.string()).optional(),
    })
    .optional(),
  /**
   * Boucle d'apprentissage (restitution V2 §6 — « chaque analyse améliore la
   * base globale »). Ce que l'ÉQUIPE a fait des besoins passés (convertis,
   * transformés en action, déclarés obsolètes, par secteur et par offre),
   * agrégé et rendu côté API depuis l'Opportunity Graph. C'est un PRIOR sur
   * l'ESN — jamais un fait sur l'entreprise analysée. Absent (aucun besoin
   * jamais déplacé = cas par défaut) ⇒ prompts byte-identiques.
   */
  workspaceLearning: z.string().optional(),
  /** #3278.3 — canaux MESURÉS de l'espace (réponse sous 14 j) ; absent sans mesure ⇒ byte-identique. */
  channelPerformance: channelPerformanceListSchema.optional(),
  /**
   * Colonne du kanban commercial du compte (annexe méthodo p6) : `watching`,
   * `opportunity`, `customer`, `archived`. C'est ce que le commercial a fait du
   * compte, et donc l'entrée la plus fiable de l'état de relation après une
   * déclaration explicite (qui, elle, reste prioritaire côté IA). Absent — un
   * compte jamais trié, colonne `inbox` — ⇒ relation « froide » par défaut,
   * salesContext et prompts inchangés.
   */
  commercialStatus: z.string().optional(),
  // LOT (15/10) DATA-A point 2 — vrai UNIQUEMENT pour le rafraîchissement quotidien de la veille : la phase 1
  // reste servie par le cache 30 j, l'IA y ajoute les nouveautés du jour (Brave News `freshness=pd`, 1 appel).
  watchRefresh: z.boolean().optional(),
  /**
   * Le site du compte, quand on le connaît DÉJÀ (analyse précédente, saisie,
   * registre). Il ne sert qu'à une chose : dériver le slug d'un board d'offres
   * d'emploi (Greenhouse, Lever) sans le deviner depuis le nom — attribuer à un
   * compte les offres du board d'un homonyme écrirait un signal de recrutement
   * faux. Absent — premier passage sur un compte neuf — ⇒ seul Greenhouse est
   * interrogé, et uniquement s'il NOMME l'entreprise dans sa réponse.
   */
  website: z.string().optional(),
  /**
   * #1631.3/.4, #1606.2 (lot 14) — l'axe CHEMIN de l'adressabilité (lot 13,
   * `_path_axis` côté IA) : le compte de parcours AGRÉGÉ que la mémoire marché
   * a observés vers ce compte, résolu côté API par `MarketMemoryService`
   * (la SEULE porte vers ses tables partagées, GA-258). Absent (défaut, tant
   * qu'aucune couverture n'existe ou qu'elle passe sous le seuil transverse
   * `MARKET_MEMORY_MIN_PATHS`) ⇒ l'axe reste NON MESURÉ côté IA, exactement
   * comme avant ce lot — jamais un `0`.
   */
  marketPathsObserved: z.number().int().optional(),
  /**
   * La société de services la PLUS observée sur ce compte, pour que l'axe
   * CHEMIN nomme sa preuve (« … relient ALTEN … ») plutôt que de rester
   * anonyme. Optionnel même quand {@link marketPathsObserved} est présent :
   * sans nom, l'axe reste vrai en désignant « des sociétés de services
   * partenaires ».
   */
  marketTopEsn: z.string().optional(),
  /**
   * #4070.1/.4 — les faits du compte (socle #4069, datés, sans provenance) et
   * l'analyse précédente en trace datée (corrections humaines nommées). Portaient
   * déjà le graphe complet (lancement + reprise) ; absents du chemin « Actualiser »
   * (on-demand), qui repartait donc sans l'historique. Absents/vides ⇒ prompt
   * byte-identique.
   */
  accountFacts: z.array(analysisAccountFactWireSchema).optional(),
  previousAnalysis: z.string().optional(),
  /**
   * #2298.4 (décision Louis 19/09/2026) — les QUATRE sources ajoutées à
   * l'axe RELATION en plus du CRM ({@link crmPresence}) : missions signées
   * (en cours/passées), dernier rendez-vous (agenda), derniers échanges
   * e-mail (MÉTADONNÉES seulement — une date, jamais le corps) et une
   * correction humaine posée sur la relation. Chacune, résolue côté API,
   * n'ajoute rien tant que la donnée RÉELLE n'existe pas en base. Absents
   * (défaut) ⇒ l'axe reste NON MESURÉ côté IA, exactement comme avant ce lot
   * — jamais un `0`.
   */
  relationMissionsCount: z.number().int().optional(),
  relationLastMeetingAt: z.string().optional(),
  relationLastEmailAt: z.string().optional(),
  relationHumanCorrection: z.string().optional(),
  /** #2273.9-.21 — partenaires déclarés en place sur le compte (route « partenaire »). */
  declaredPartners: z.array(z.string()).optional(),
  /** #3278.1 — missions du compte : en cours (`present`) ou seulement terminées (`former`). */
  consultantHistory: z.enum(['present', 'former']).optional(),
  /** #3278.1 — un signal d'achat DÉCLARÉ (saisie ou import, #2634.1) existe sur ce compte. */
  declaredSignalPresent: z.boolean().optional(),
  /** #2371.4 — placements EN COURS sur la relation partenaire de même SIREN (10e stade « partenaire actif »). */
  partnerPlacementsActive: z.number().int().positive().optional(),
  /** #3278.1 — signaux de route lus côté API (veille seule, depuis un talent, événement, inbound) : le plan asynchrone nomme les mêmes routes que `/chat`. */
  routeSignals: z
    .object({
      watch_only: z.literal(true).optional(),
      talent_from_account: z.literal(true).optional(),
      event_community: z.literal(true).optional(),
      inbound_content: z.literal(true).optional(),
    })
    .optional(),
  progressCallback: analysisProgressCallbackSchema.optional(),
})
export type ResearchInput = z.infer<typeof researchInputSchema>

export const researchResponseSchema = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
})
export type ResearchResponse = z.infer<typeof researchResponseSchema>

/* ─── Phase 2 — contacts ────────────────────────────────────────────────────── */

export const seedContactSchema = z.object({
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  source: z.string().default('pappers'),
  isCLevel: z.boolean().default(false),
})
export type SeedContact = z.infer<typeof seedContactSchema>

/**
 * Optional re-run scope (S6) — narrow the contact search to ONE segment
 * (a persona/role, a BU/filiale, a geography, a seniority band, a decision
 * family, an org level) without redoing the whole analysis. Mirrors the IA
 * `ContactScope`. Empty scope == wide search.
 */
export const contactScopeSchema = z
  .object({
    titles: z.array(z.string()), // override personas (re-run a persona/role: cyber, marketing…)
    geographies: z.array(z.string()), // Apollo person_locations (["France"] → écarte l'offshore)
    seniorities: z.array(z.string()), // Apollo person_seniorities (director, vp, c_suite…)
    entity: z.string(), // override company_name (re-run on a BU/filiale : Boursorama, ITIM…)
    theme: z.string(), // thème de relance (cyber, achats, MLOps, DSI France…) → expansé côté IA
    /**
     * Famille de décision visée — MÊME vocabulaire que la matrice de couverture
     * (`CoverageGap.family` : it, cyber, data, ia, infra, dev, finance, achat,
     * pmo, clevel, rh). C'est ce qui permet à une zone blanche affichée au
     * commercial de déclencher la recherche de CETTE case, sans rejouer le
     * dossier. Texte libre comme `theme` : l'IA reconnaît les familles + leurs
     * alias et retombe sinon sur le mot-clé brut — jamais un échec.
     */
    family: z.string().max(60),
    /**
     * Niveau hiérarchique visé, dans les DEUX échelles déjà employées par le
     * produit : L0-L5 (contrat `OrgGraph`, structure) et c_level/n1/n2 (matrice
     * de couverture, relatif). Fermé en enum : une valeur inconnue élargirait
     * silencieusement la recherche au lieu de la cibler.
     */
    level: z.union([orgHierarchyLevelSchema, coverageLevelSchema]),
  })
  .partial()
export type ContactScope = z.infer<typeof contactScopeSchema>

/**
 * #2934 (#2309.24/.26/.28) — les TROIS leviers d'élargissement ciblé que
 * l'épopée nomme mais qu'AUCUN axe dédié de `ContactScope` ne porte
 * aujourd'hui :
 *  - `adjacent_role_family` — une famille de rôles VOISINE de celle déjà
 *    couverte. `family`/`theme` existent (texte libre, presets IA), mais
 *    aucun des deux n'exprime « la famille D'À CÔTÉ » : un signal PARTIEL,
 *    pas absent — le repli par thème libre reste utilisable en attendant ;
 *  - `site` — DISTINCT de `entity` (une filiale/BU juridique) : aucun axe ne
 *    porte un site géographique d'implantation à ce niveau de granularité ;
 *  - `operational_staff` — les séniorités connues (`seniorities`) ne
 *    modélisent que manager/director/c_suite : aucune ne nomme un
 *    collaborateur individuel/« opérationnel ».
 *
 * Constante STATIQUE (comme `CONTACT_UNMEASURED_REJECTION_REASONS`,
 * `contact.ts`) : ce que le produit ne sait pas encore cibler ne varie pas
 * d'un compte à l'autre. Se NOMME toujours dans l'écran d'élargissement,
 * jamais un silence qui laisserait croire à un levier qui n'existe pas.
 */
export const CONTACT_EXPANSION_UNAVAILABLE_LEVERS = ['adjacent_role_family', 'site', 'operational_staff'] as const
export const contactExpansionUnavailableLeverSchema = z.enum(CONTACT_EXPANSION_UNAVAILABLE_LEVERS)
export type ContactExpansionUnavailableLever = z.infer<typeof contactExpansionUnavailableLeverSchema>

export const contactsInputSchema = z.object({
  companyName: z.string().min(1),
  profileData: z.record(z.string(), z.unknown()),
  accountId: z.string().guid(),
  userId: z.string().guid(),
  /** Contacts already known at Phase 2 entry (today: Pappers
   *  ``representants_legaux``). The agent must keep them and classify
   *  them into entities/roles rather than dropping them. */
  seedContacts: z.array(seedContactSchema).optional(),
  scope: contactScopeSchema.optional(),
  /** C.2 (Cédric 20/10) — ancres d'organisation Apollo lues dans
   *  `raw_analysis.apolloEnrichment`. Absentes = champs omis, jamais inventés. */
  organizationIds: z.array(z.string()).optional(),
  organizationDomains: z.array(z.string()).optional(),
  progressCallback: analysisProgressCallbackSchema.optional(),
})
export type ContactsInput = z.infer<typeof contactsInputSchema>

/** Corps de « vérifier une relation » (POST /analysis/:id/verify-relation, annexe
 *  organigramme p22) : LE lien à prouver, désigné par ses deux extrémités et son
 *  type. Rien d'autre — les noms sont relus du graphe stocké côté serveur, pour
 *  qu'un appelant ne puisse pas faire vérifier une relation qu'il a inventée. */
export const verifyRelationSchema = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  type: orgHierarchyRelationSchema,
})

/** Request body of the on-demand scoped contact re-run (POST /analysis/:id/enrich-contacts). */
export const enrichContactsSchema = z.object({
  scope: contactScopeSchema.optional(),
})

export const contactsResponseSchema = z.object({
  data: z
    .object({
      contacts: z.array(z.unknown()).optional(),
    })
    .catchall(z.unknown())
    .optional(),
})
export type ContactsResponse = z.infer<typeof contactsResponseSchema>

/* ─── Phase 3 — classify (batch) ────────────────────────────────────────────── */

export const classifyBatchInputSchema = z.object({
  accountId: z.string().guid(),
  contacts: z.array(z.unknown()),
  profileData: z.record(z.string(), z.unknown()),
  // Profil de l'ESN QUI VEND (annexe méthodo p3-4). `profileData` décrit le compte
  // CIBLE — le chemin on-demand y passe son `raw_analysis` entier. Sans ce champ,
  // le bloc « PROFIL ESN » des prompts système décrivait la cible et le boost
  // vendeur du /100 notait contre un profil sans expertise déclarée.
  // Absent/vide = repli IA sur `profileData`, prompt byte-identique.
  esnProfile: z.record(z.string(), z.unknown()).optional(),
  // Mémoire de corrections du compte (feedback loop A2) : directives factuelles
  // condensées côté API depuis les retours utilisateur (« contact X signalé
  // parti »…). Absent/vide = prompt IA byte-identique (bloc non injecté).
  accountFeedback: z.string().optional(),
  // Mémoire du graphe d'organigramme (Annexe Organigramme §5). La phase 3 à la
  // demande RECONSTRUIT le graphe : sans la version et l'ardoise des rejets, la
  // reconstruction ferait revenir un contact signalé parti et ferait reculer la
  // version. Absents = assemblage comme un premier run (wire byte-identique).
  orgGraphVersion: z.number().int().positive().optional(),
  orgRejectedItems: z.array(z.object({ sourceId: z.string(), reason: z.string() })).optional(),
  progressCallback: analysisProgressCallbackSchema.optional(),
})
export type ClassifyBatchInput = z.infer<typeof classifyBatchInputSchema>

export const classifyBatchResponseSchema = z.object({
  data: z
    .object({
      contacts: z.array(z.unknown()).optional(),
      // Le graphe reconstruit (organigramme hérité + comité + `orgGraph` typé),
      // persisté tel quel dans `raw_analysis.org` — c'est ce qui fait qu'un
      // enrichissement à la demande met à jour la carte d'influence au lieu de
      // la laisser sur le graphe du run initial. Absent = rien à persister.
      org_graph: z.record(z.string(), z.unknown()).optional(),
    })
    .catchall(z.unknown())
    .optional(),
})
export type ClassifyBatchResponse = z.infer<typeof classifyBatchResponseSchema>

/* ─── Phase 4 — plan ────────────────────────────────────────────────────────── */

/**
 * "Changer de stratégie" (Théo Palier-2 §3) — re-plan around a chosen angle /
 * entry mode / entity, reusing the existing research + contacts (no full
 * re-analysis). Mirrors the IA ``StrategyScope``. Empty scope == default
 * (LLM-recommended) strategy.
 */
export const strategyScopeSchema = z
  .object({
    // Bounded: these strings are interpolated into the Claude plan prompt, so a
    // cap blocks prompt-injection / megabyte-payload abuse of the LLM call.
    angle: z.string().max(300), // build the plan around this angle (matched on its title)
    entryMode: z.enum(['top_down', 'bottom_up', 'middle_out']), // force the entry vector
    focusEntity: z.string().max(120), // anchor the plan on one perimeter / BU
    // #2947 (#2204.15) — form constraints the user types in the same dialog
    // (length, words to avoid). Cadres the batch M1-M2-M3 messages; it never
    // writes a body itself — sending still stays with the commercial.
    constraints: z.string().max(300),
    // #2947 (#2204.11) — the message OBJECTIVE chosen in the same dialog: the
    // batch M1-M2-M3 is replayed around it (same codes as the composer, the IA
    // `MESSAGE_OBJECTIVES` table; an unknown code is a 422 there too).
    objective: z.enum(MESSAGE_MATRIX.objectives),
  })
  .partial()
export type StrategyScope = z.infer<typeof strategyScopeSchema>

export const planInputSchema = z.object({
  accountId: z.string().guid(),
  userId: z.string().guid(),
  /** Portée équipe du grounding RAG — voir researchInputSchema.workspaceId. */
  workspaceId: z.string().guid().optional(),
  accountData: z.record(z.string(), z.unknown()),
  contacts: z.array(z.unknown()),
  profileData: z.record(z.string(), z.unknown()),
  // Mémoire de corrections du compte (feedback loop A2) — voir classifyBatchInputSchema.
  accountFeedback: z.string().optional(),
  /** Couche zéro (annexe p8) — voir researchInputSchema.crmPresence. Le plan doit
   *  savoir que le compte est DÉJÀ connu avant de proposer une approche froide. */
  crmPresence: z.string().optional(),
  /** Couche zéro hors CRM (annexe p8) — voir researchInputSchema.internalHistory. */
  internalHistory: z.string().optional(),
  /**
   * Boucle d'apprentissage (restitution V2 §6 — « chaque analyse améliore la
   * base globale »). Ce que l'ÉQUIPE a fait des besoins passés (convertis,
   * transformés en action, déclarés obsolètes, par secteur et par offre),
   * agrégé et rendu côté API depuis l'Opportunity Graph. C'est un PRIOR sur
   * l'ESN — jamais un fait sur l'entreprise analysée. Absent (aucun besoin
   * jamais déplacé = cas par défaut) ⇒ prompts byte-identiques.
   */
  workspaceLearning: z.string().optional(),
  /** #3278.3 — canaux MESURÉS de l'espace (réponse sous 14 j) ; absent sans mesure ⇒ byte-identique. */
  channelPerformance: channelPerformanceListSchema.optional(),
  /**
   * Prospection inversée (annexe p7 canal 3 / p9) : les ex-collaborateurs de la
   * cible détectés en phase 2 (passage passé chez le compte, employeur actuel
   * ailleurs) = relais chauds. Absent/vide ⇒ prompt inchangé.
   */
  reverseProspects: z.array(z.record(z.string(), z.unknown())).optional(),
  strategyScope: strategyScopeSchema.optional(),
  progressCallback: analysisProgressCallbackSchema.optional(),
  /**
   * #4070.2/.4 — les faits du compte (affaires gagnées/perdues/sommeil, missions,
   * besoins, tous datés), les motifs de perte déclarés et l'analyse précédente.
   * Portaient déjà le graphe complet ; absents du re-plan à la demande (« changer
   * de stratégie »), qui ramenait donc le compte à une approche froide. Absents/vides
   * ⇒ prompt byte-identique.
   */
  accountFacts: z.array(analysisAccountFactWireSchema).optional(),
  lostDealRex: z.string().optional(),
  previousAnalysis: z.string().optional(),
})
export type PlanInput = z.infer<typeof planInputSchema>

/** Request body of the on-demand "change strategy" re-plan (POST /analysis/:id/replan). */
export const replanSchema = z.object({
  strategy: strategyScopeSchema.optional(),
})

export const planResponseSchema = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
})
export type PlanResponse = z.infer<typeof planResponseSchema>

/* ─── Single-contact enrichment (on-demand from the contacts UI) ────────────── */

/**
 * Match keys, in order of reliability: the Apollo person `apolloId` (unlocks a
 * search-tier hit whose last name was obfuscated — the ONLY reliable key then),
 * `linkedinUrl`, a full `firstName+lastName+organizationName`, or
 * `organizationName+title` (the People-Search fallback that resolves an incomplete
 * « identité incomplète » role-persona). `lastName` is optional (mononym /
 * unsplittable full names still enrich). `title` carries the contact's
 * role/persona so the IA can search the org for the real person. refine() rejects
 * inputs that carry none of these keys.
 */
export const enrichContactInputSchema = z
  .object({
    // Apollo person id — persisted on Apollo-sourced contacts (raw_data.apolloId).
    // The strongest key: a direct People-Match by id, no fresh search needed.
    apolloId: z.string().min(1).optional(),
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    organizationName: z.string().min(1).optional(),
    // Clean org anchors from the ACCOUNT (never the messy contact entity label):
    // Apollo org id (strongest — `organization_ids`), then registrable domain
    // (`q_organization_domains_list`). Both let People-Search scope precisely so
    // a role search actually returns the real person (retour Théo P0). Present-only.
    organizationId: z.string().min(1).optional(),
    organizationDomain: z.string().min(1).optional(),
    linkedinUrl: z.string().url().optional(),
    // Role/persona — the fallback People-Search key (org + title → real person).
    title: z.string().min(1).optional(),
  })
  .refine(
    v =>
      Boolean(v.apolloId) ||
      Boolean(v.linkedinUrl) ||
      (Boolean(v.organizationName || v.organizationId || v.organizationDomain) && Boolean(v.firstName || v.title)),
    {
      message: 'apolloId OR linkedinUrl OR (organization anchor + firstName/title) is required',
    },
  )
export type EnrichContactInput = z.infer<typeof enrichContactInputSchema>

export const apolloEmailStatusSchema = z.enum(['verified', 'unverified', 'guessed', 'unknown'])
export type ApolloEmailStatus = z.infer<typeof apolloEmailStatusSchema>

/* ── Rich Apollo People-Match profile ─────────────────────────────────────────
 * Apollo's People-Match returns far more than the email/phone the enrichment
 * used to keep — a full FACTUAL profile (headline, career path, education,
 * social links, seniority, functions…). It is the SAME payload already paid for
 * on the match; we simply stop discarding it. Everything is present-only: Apollo
 * omits keys it has no value for, and we NEVER invent one.
 */

/** One role in Apollo's `employment_history[]`. Factual, present-only. */
const apolloEmploymentEntrySchema = z.object({
  organization_name: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  current: z.boolean().optional(),
})
export type ApolloEmploymentEntry = z.infer<typeof apolloEmploymentEntrySchema>

/** One entry in Apollo's `education[]` — school + diploma, when present. */
const apolloEducationEntrySchema = z.object({
  school: z.string().nullable().optional(),
  degree: z.string().nullable().optional(),
  field_of_study: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
})
export type ApolloEducationEntry = z.infer<typeof apolloEducationEntrySchema>

/** One number in Apollo's `phone_numbers[]` — the sanitized number plus its
 *  type (direct / mobile / work…) and reachability status. */
const apolloPhoneNumberSchema = z.object({
  number: z.string(),
  type: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
})
export type ApolloPhoneNumber = z.infer<typeof apolloPhoneNumberSchema>

/**
 * The rich, factual profile fields Apollo returns on a People-Match — everything
 * beyond the email/phone the enrichment already persists. Persisted verbatim on
 * `contacts.apollo_enrichment` (JSONB) and rendered on the contact detail. All
 * optional / present-only: a missing field is simply absent, never a noisy null.
 */
export const apolloContactProfileSchema = z.object({
  headline: z.string().nullable().optional(),
  seniority: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  twitter_url: z.string().nullable().optional(),
  github_url: z.string().nullable().optional(),
  facebook_url: z.string().nullable().optional(),
  departments: z.array(z.string()).optional(),
  subdepartments: z.array(z.string()).optional(),
  functions: z.array(z.string()).optional(),
  employment_history: z.array(apolloEmploymentEntrySchema).optional(),
  education: z.array(apolloEducationEntrySchema).optional(),
  personal_emails: z.array(z.string()).optional(),
  phone_numbers: z.array(apolloPhoneNumberSchema).optional(),
})
export type ApolloContactProfile = z.infer<typeof apolloContactProfileSchema>

/**
 * Shape returned by the IA `/enrich` endpoint. Snake_case keeps the wire format
 * stable with the existing column names on the contacts table. The base fields
 * (email/phone/identity) drive the persistence + credit charge; the merged
 * {@link apolloContactProfileSchema} carries the rich profile (present-only) so
 * the API can store it in `contacts.apollo_enrichment`. `phone` stays the single
 * best number for backward-compat; `phone_numbers[]` surfaces the full list.
 */
export const apolloEnrichmentDataSchema = apolloContactProfileSchema.extend({
  matched: z.boolean(),
  // Resolved identity — populated when a People-Search fallback completes the
  // real name (role-persona / first-name-only contact). Optional/nullable so a
  // plain People-Match response (no name fields) still validates.
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  email: z.string().email().nullable(),
  email_status: apolloEmailStatusSchema.nullable(),
  phone: z.string().nullable(),
  // Override the lenient profile `linkedin_url` with the strict URL-validated,
  // required-nullable wire field the enrichment contract has always guaranteed.
  linkedin_url: z.string().url().nullable(),
  title: z.string().nullable(),
  organization_name: z.string().nullable(),
  // Real profile photo — free field of the same paid People-Match call.
  // Optional for backward compat with older IA deployments.
  photo_url: z.string().url().nullable().optional(),
  /**
   * La cascade s'est arrêtée sur son budget de temps AVANT d'avoir épuisé ses
   * sources (`ENRICH_CASCADE_BUDGET_S`, défaut 25 s côté IA). Le résultat est
   * donc PARTIEL, et surtout : `matched: false` + `truncated: true` ne veut pas
   * dire « ce contact est introuvable », seulement « on n'a pas fini de
   * chercher ». Sans cette distinction, l'API armait sur une recherche
   * interrompue le cooldown de {@link ENRICHMENT_RETRY_COOLDOWN_DAYS} jours.
   * Optionnel : un déploiement IA antérieur ne l'envoie pas (⇒ non tronqué).
   */
  truncated: z.boolean().optional(),
})
export type ApolloEnrichmentData = z.infer<typeof apolloEnrichmentDataSchema>

export const enrichContactResponseSchema = z.object({
  data: apolloEnrichmentDataSchema,
})
export type EnrichContactResponse = z.infer<typeof enrichContactResponseSchema>

/**
 * #2727 — « je tape un nom, je vois les homonymes, je choisis ». Entrée de
 * `IaClient.searchPeopleByName` (`POST /phase/2/people/search-by-name`, IA
 * — voir `search_people_by_name`, `apps/ia/app/services/apollo.py`).
 *
 * Recherche GRATUITE (tier People-Search) : `organizationName` reste
 * facultatif — Découvrir peut chercher un nom seul, ou resserré par « le
 * plus de trucs que tu connais sur elle » (compte supposé).
 */
export const searchPeopleByNameInputSchema = z.object({
  fullName: z.string().min(1),
  organizationName: z.string().min(1).optional(),
})
export type SearchPeopleByNameInput = z.infer<typeof searchPeopleByNameInputSchema>

/**
 * #4386 — les familles de sources de la recherche par nom, nommées à l'écran
 * EN MOTS (« base de contacts », « registre des dirigeants », « recherche web »).
 * Doctrine : nos fournisseurs ne se nomment jamais (`supplierNamesIn`).
 */
export const personNameSourceFamilySchema = z.enum(['contact_base', 'legal_registry', 'web'])
export type PersonNameSourceFamily = z.infer<typeof personNameSourceFamilySchema>

/** #4386 — « nom et entreprise correspondent » … « nom en partie masqué ». Rang dans cet ordre. */
export const personNameMatchSchema = z.enum([
  'name_and_company',
  'partial_name_and_company',
  'name_only',
  'partial_name',
])

/**
 * Un HOMONYME rendu par la recherche libre — de quoi le DISTINGUER (poste,
 * entreprise, ville) sans révéler d'e-mail ni de téléphone : `hasEmail` /
 * `hasPhone` ne sont que des DISPONIBILITÉS de canal, jamais des valeurs
 * (même discipline que `DiscoverContactRow.channels`, ContactResultRow.tsx).
 *
 * `lastNameObfuscated` porte le nom de famille tel que le tier gratuit le
 * publie (« Sa***d ») — jamais désobfusqué ici : le vrai nom de famille est
 * le résultat du reveal PAYANT et séparé (`enrichContactInputSchema` /
 * `apolloId`, une fois l'homonyme choisi).
 */
export const personNameSearchHitSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastNameObfuscated: z.string(),
  title: z.string(),
  organizationName: z.string(),
  city: z.string(),
  country: z.string(),
  hasEmail: z.boolean(),
  hasPhone: z.boolean(),
  // #4386 — champs de la CASCADE (base de contacts → registre des dirigeants →
  // recherche web). Facultatifs : le chemin historique (fiche talent, relecture
  // d'employeur) ne les porte pas.
  /** Nom de famille PUBLIÉ (registre, profil public) — jamais désobfusqué d'un masque. */
  lastName: z.string().optional(),
  /** Coordonnée pro publique, en clair (c87). */
  linkedinUrl: z.string().optional(),
  /** Les FAMILLES qui ont rendu cette personne — jamais un nom de fournisseur. */
  sources: z.array(personNameSourceFamilySchema).optional(),
  /** L'indice de correspondance EN MOTS — jamais un pourcentage ni une probabilité. */
  match: personNameMatchSchema.optional(),
})
export type PersonNameSearchHit = z.infer<typeof personNameSearchHitSchema>

/**
 * #4386 — une famille INTERROGÉE et ce qu'elle a dit : `down` se dit (« la
 * recherche web n'a pas répondu »), jamais maquillé en « 0 ». Une famille sans
 * clé n'est pas interrogée, donc absente de la liste.
 */
export const personNameSourceQueriedSchema = z.object({
  family: personNameSourceFamilySchema,
  outcome: z.enum(['found', 'empty', 'down']),
  count: z.number().int().nonnegative(),
})
export type PersonNameSourceQueried = z.infer<typeof personNameSourceQueriedSchema>

/**
 * `status` porte le statut TYPÉ de la recherche (`apolloSourceStatusSchema`,
 * mirror de `ApolloSearchStatus`) : l'écran dit POURQUOI personne n'apparaît
 * — source non branchée, en panne, limitée — au lieu de confondre « aucun
 * homonyme » avec « la source ne répond pas » (GA-18/19).
 */
export const searchPeopleByNameResultSchema = z.object({
  hits: z.array(personNameSearchHitSchema),
  status: apolloSourceStatusSchema,
  /** #4386 — absent sur le chemin historique ; présent (même vide) sur la cascade. */
  sourcesQueried: z.array(personNameSourceQueriedSchema).optional(),
})
export type SearchPeopleByNameResult = z.infer<typeof searchPeopleByNameResultSchema>

/**
 * #2809 (#2293.11, #2294.*) — entrée de `IaClient.discoverContacts`
 * (`POST /phase/2/contacts/discover`, IA — voir `search_people_with_status`,
 * `apps/ia/app/services/apollo.py`). UN compte à la fois : l'appelant NestJS
 * boucle sur la sélection de `/accounts`, jamais un lot envoyé à l'IA.
 *
 * Découverte FRAÎCHE : des personnes jamais collectées, cherchées par
 * critère (rôles) — pas un rejeu des personas déjà collectées sur un compte
 * (`targetedRefreshInputSchema`/`POST /analysis/:id/refresh`, un moteur
 * différent, sur des comptes déjà analysés).
 */
export const discoverContactsInputSchema = z.object({
  companyName: z.string().min(1),
  organizationDomain: z.string().min(1).optional(),
  organizationId: z.string().min(1).optional(),
  titles: z.array(z.string()).optional(),
})
export type DiscoverContactsInput = z.infer<typeof discoverContactsInputSchema>

/**
 * `seeds` porte la forme `AnalysisContactSeed` (voir `analysis-payloads.ts`) —
 * la MÊME que la collecte Phase 2 normale, pour que l'API les persiste par le
 * même chemin (`ContactsService.bulkInsert`), dédup incluse. Laissé
 * `z.unknown()` ici comme `contactsResponseSchema` juste au-dessus : le
 * contrat de champ vit dans `AnalysisContactSeed`, ce schéma ne fait que
 * transporter le tableau sans le revalider champ par champ une seconde fois.
 */
export const discoverContactsResultSchema = z.object({
  seeds: z.array(z.unknown()),
  status: apolloSourceStatusSchema,
})
export type DiscoverContactsResult = z.infer<typeof discoverContactsResultSchema>
