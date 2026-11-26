import { z } from 'zod'
import { entityResolutionSchema } from '../entity-resolution.js'
import { accountQualificationSnapshotSchema } from '../qualification-grid.js'
import { branchOfficeSchema, executiveSchema, subsidiarySchema } from './pappers.js'
import { accessBarrierSchema, addressabilitySchema } from '../discover.js'
import {
  awardedContractSchema,
  beneficialOwnerSchema,
  contractModelSchema,
  financialYearSchema,
  githubSignalsSchema,
  jobSignalSchema,
  legalSignalSchema,
  siteLegalNoticeFieldSchema,
  publicTenderSchema,
  usSecFinancialsSchema,
} from './public-data.js'
import {
  actionPlanBodySchema,
  evaluationSchema,
  offerProposalSchema,
  planOutputSchema,
  planRiskSchema,
  quickWinSchema,
  scoreFactorSchema,
  userAttackAngleSchema,
  userPlanActionSchema,
} from './plan.js'
import { goNoGoSchema } from './primitives.js'
import {
  competitorSchema,
  entityNodeSchema,
  itChallengeSchema,
  keyNoteSchema,
  painPointSchema,
  programNameSchema,
  qualifiedHypothesisSchema,
  recentSignalSchema,
  siteFranceSchema,
  technologyEntrySchema,
} from './research.js'
import { attackAngleSchema, commentOuvrirCompteSchema, discardedAxisSchema, messageSchema } from './strategy.js'

/**
 * Full strictly-typed shape of ``Account.raw_analysis`` (Postgres JSONB).
 *
 * Source: FastAPI IA service (apps/ia) writes phase 1 research; downstream
 * phases (plan) merge more keys into the same row. Read across apps/web
 * (TabFiche, TabPlan, TabEvaluation, …) and the API worker.
 *
 * Design notes:
 * - All fields optional — an in-progress run only has a subset.
 * - ``passthrough`` keeps unknown keys so legacy rows survive contract bumps.
 * - **Canonical wire format = snake_case.** Pappers dumps with French snake
 *   aliases (``by_alias=True``); Claude prompts are instructed to emit
 *   snake_case JSON keys; the whole blob is snake end-to-end so it matches
 *   the rest of the Postgres schema.
 */
/**
 * Contacts phase 2 REMOVED because their employer is an entity the rep put out of
 * perimeter (a foreign subsidiary, a namesake BU…).
 *
 * Until now the filter only wrote a log line: the rep watched the stock shrink
 * with no explanation, which reads as a broken search rather than as the
 * perimeter doing its job. The count and the entities behind it are per-ANALYSIS
 * (not per-workspace), so they live on ``raw_analysis`` and are rendered on the
 * account, beside its contacts.
 *
 * Absent on every dossier produced before this shipped — and absent on a run that
 * dropped nothing, so the screen shows nothing rather than a misleading "0".
 */
export const contactsOutOfScopeSchema = z.object({
  /** How many contacts were removed. Always ≥ 1 when the block exists. */
  dropped: z.number(),
  /** Which employers they came from, biggest first. May be shorter than
   *  ``dropped`` — a hit whose employer had no name is counted, never invented. */
  entities: z.array(z.object({ name: z.string(), count: z.number() })).optional(),
})
export type ContactsOutOfScope = z.infer<typeof contactsOutOfScopeSchema>

/**
 * #2265.13 — désambiguïsation d'homonymes (Théo p.10 / `homonym_disambiguation.py`).
 *
 * Écrit par `apps/ia/app/routers/phase1_research.py`
 * (`result["homonyms"] = homonyms.model_dump(by_alias=True)`) — CAMELCASE, seule
 * exception au blob snake_case : la même classe Pydantic (`HomonymResolution`)
 * alimente aussi l'API publique `EsnResolved`, dont les alias sont déjà posés.
 *
 * Cinq statuts possibles (`locked`/`unique`/`selected`/`ambiguous`/`none`) — un
 * SEUL est une HYPOTHÈSE au sens de ce point : ``selected`` (un candidat DOMINE
 * parmi plusieurs plausibles, choisi sans confirmation humaine). ``unique``/
 * ``locked`` ne devinent rien (un seul candidat, ou le SIREN fourni par
 * l'utilisateur) ; ``ambiguous``/``none`` n'ont rien sélectionné. ``message``
 * porte déjà la phrase complète (SIREN retenu, confiance, raison, écart avec le
 * 2ᵉ) — rien à recalculer côté écran.
 */
export const homonymResolutionSchema = z
  .object({
    status: z.string(),
    selectedSiren: z.string().nullable().optional(),
    confidence: z.number().optional(),
    message: z.string().optional(),
  })
  .passthrough()
export type HomonymResolution = z.infer<typeof homonymResolutionSchema>

const accountAnalysisShape = {
  /* ---- Pappers structural (organigramme + sites) ---- */
  executives: z.array(executiveSchema).optional(),
  c_level: z.array(executiveSchema).optional(),
  subsidiaries: z.array(subsidiarySchema).optional(),
  branches: z.array(branchOfficeSchema).optional(),

  /* ---- Pappers legal identity + financials (collected, now surfaced) ---- */
  /** Raison sociale du REGISTRE (Pappers `nom_entreprise`) — l'entité dont `financials_history`
   *  porte les comptes sociaux (peut être une holding, pas le groupe). */
  legal_name: z.string().optional().nullable(),
  legal_form: z.string().optional().nullable(),
  capital: z.number().optional().nullable(),
  creation_date: z.string().optional().nullable(),
  activity_label: z.string().optional().nullable(),
  corporate_purpose: z.string().optional().nullable(),
  pappers_url: z.string().optional().nullable(),
  financials_history: z.array(financialYearSchema).optional(),
  beneficial_owners: z.array(beneficialOwnerSchema).optional(),
  /**
   * FINIR-V2-27-09 — bloc `16_INDICATEURS` (dossier SG complet, CSV) : des
   * indicateurs financiers PAR PÉRIMÈTRE (frais de gestion, PNB, résultat net
   * par business unit, économies visées…), distincts de `financials_history`
   * qui est un CHIFFRE GROUPE — les y verser leur ferait dire un total qu'ils
   * ne sont pas. `amount`/`currency`/`period` de `keyNoteSchema` portent le
   * chiffre daté ; `reliability` porte la mention « non additionnable » quand
   * la source le dit.
   */
  financial_indicators: z.array(keyNoteSchema).optional(),

  /* ---- Public data sources (collected, now surfaced) ---- */
  detected_tech_stack: z.array(z.string()).optional(),
  github_signals: githubSignalsSchema.optional().nullable(),
  public_tenders: z.array(publicTenderSchema).optional(),
  awarded_contracts: z.array(awardedContractSchema).optional(),
  it_job_signals: z.array(jobSignalSchema).optional(),
  // #3916 — annonces légales BODACC (rattachées au SIREN), jusque-là sans consommateur.
  legal_signals: z.array(legalSignalSchema).optional(),
  // #4743.2 — les champs publiés sur la page de mentions légales du site (absents ⇒ pas de clé).
  legal_notice: z.array(siteLegalNoticeFieldSchema).optional(),
  // SEC/EDGAR (US) financial snapshot — only present for a resolved SEC
  // registrant (listed US company); absent on FR / private-company runs.
  us_sec_financials: usSecFinancialsSchema.optional().nullable(),
  // #2291.2 — le modèle de contrat OBSERVÉ (voir le docblock de
  // `contractModelSchema`, public-data.ts). Absent = dossier antérieur à
  // cette capacité ; `null` = calculé, rien d'attribuable ("non observé").
  contract_model: contractModelSchema.optional().nullable(),

  /* ---- Claude business overview ---- */
  business_description: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  /**
   * FINIR-V2-27-09 — bloc `01_LECTURE_STRUCTURELLE` (dossier SG complet,
   * CSV) : les axes de lecture généraux d'un compte (comment son organisation,
   * ses cycles d'achat et ses programmes se lisent) — aucun schéma existant ne
   * les portait avant ce lot ; générique, réutilisable par toute analyse.
   */
  structural_reading_axes: z.array(keyNoteSchema).optional(),
  entities_exhaustive: z.array(entityNodeSchema).optional(),
  sites_france: z.array(siteFranceSchema).optional(),
  /**
   * La barrière d'ACHAT estimée (tome 3) — six proxies publics, quatre classes,
   * et `measurable: false` sous trois proxies mesurables.
   *
   * Elle ne remplace PAS l'accessibilité (D71) : elle répond à l'autre question,
   * « cette organisation sait-elle acheter à une ESN comme celle-ci ? ». Un
   * compte peut être parfaitement joignable et totalement verrouillé, et c'est
   * ce cas-là qui coûte huit mois.
   */
  access_barrier: accessBarrierSchema.optional().nullable(),
  /**
   * Le SECOND nombre (tome 1 §6) — « peux-tu ENTRER » face à « pourquoi c'est
   * intéressant » — persisté sur le compte depuis #1579/#1580 (PR #1689,
   * 06/09/2026) : `phase1_research.py:1535` pose `raw_analysis.addressability
   * = addressability_for_company(...)` à CHAQUE analyse, exactement comme il
   * pose `access_barrier` juste au-dessus. Voir `addressabilitySchema`
   * (`../discover.js`) pour la forme — une SEULE définition (GA-26), importée
   * ici, jamais réécrite.
   *
   * ⚠️ Additif seulement : `.optional().nullable()`, jamais requis — des
   * milliers d'analyses écrites avant cette PR n'ont pas la clé, et un compte
   * analysé avant elle doit continuer à se lire sans erreur jusqu'à sa
   * prochaine analyse.
   */
  addressability: addressabilitySchema.optional().nullable(),
  /**
   * #3677 (réfuté en prod le 07/10 : carte « Projets et transformations » absente) — l'IA écrit
   * `programNames` comme une liste de CHAÎNES (`apps/ia/app/models/outputs/research.py`,
   * `list[str]`), pas d'objets : un tableau de chaînes ne passait pas ce schéma, donc
   * `parseAccountAnalysis` jetait TOUT le champ et aucun programme n'atteignait l'écran. Une chaîne
   * devient `{ name }` — jamais d'objectif, de périmètre ni d'horizon deviné.
   */
  program_names: z
    .array(z.preprocess(value => (typeof value === 'string' ? { name: value } : value), programNameSchema))
    .optional(),
  technology_stack: z.array(technologyEntrySchema).optional(),
  competitors: z.array(competitorSchema).optional(),
  /**
   * FINIR-V2-27-09 — bloc `14_ECOSYSTEME` (dossier SG complet, CSV) : les
   * acteurs TIERS observés dans l'environnement du compte (acquéreurs,
   * partenaires, organismes de place…) — ni une entité du compte
   * (`entities_exhaustive`), ni un concurrent ESN (`competitors`). Une
   * citation ne vaut ni accès à un panel ni preuve de sous-traitance, et
   * chaque note le rappelle dans son `implication`.
   */
  ecosystem_third_parties: z.array(keyNoteSchema).optional(),
  pains: z.array(painPointSchema).optional(),

  /* ---- Signals & IT challenges ---- */
  it_challenges: z.array(itChallengeSchema).optional(),
  recent_signals: z.array(recentSignalSchema).optional(),
  /**
   * #3668.8 — ce que la recherche de signaux a RÉELLEMENT consulté. « Aucun
   * signal dans les sources consultées » n'est vrai que si les sources ont
   * répondu ; une source injoignable rend l'état `incomplete`, jamais « aucun ».
   * `unreachable[].source` est une clé technique : l'écran la traduit en famille
   * de source (presse, emploi, annonces légales, marchés publics), jamais en nom
   * de fournisseur.
   */
  signal_coverage: z
    .object({
      status: z.enum(['found', 'none_found', 'incomplete']),
      consulted: z.array(z.string()).optional(),
      unreachable: z.array(z.object({ source: z.string(), reason: z.string().optional().nullable() })).optional(),
    })
    .optional(),
  /** #3668.7 — le bilan de la sélection (total, contexte, autre entité, doublons fusionnés). */
  signal_selection: z
    .object({
      total: z.number(),
      context: z.number(),
      other_entity: z.number().optional(),
      duplicates_merged: z.number().optional(),
    })
    .optional(),
  /**
   * #2687 — les hypothèses qualifiées, enfin DÉCLARÉES.
   *
   * L'IA les écrit depuis #275 (`qualifiedHypotheses`), et elles portent le seul
   * angle ESN et la seule première action rattachables à un signal. Elles
   * n'étaient pas dans cette forme, donc `parseAccountAnalysis` — qui ne garde
   * que les clés déclarées — les jetait. Le web ne pouvait pas les voir, et
   * l'onglet Opportunités affichait « Aucune correspondance » sur un compte dont
   * l'analyse portait l'angle.
   */
  qualified_hypotheses: z.array(qualifiedHypothesisSchema).optional(),
  it_implications_for_esn: z.string().optional().nullable(),

  /* ---- Strategy (Claude) ---- */
  /**
   * FINIR-V2-27-09 — bloc `15_DOMAINES_OPPORTUNITE` (dossier SG complet,
   * CSV) : un domaine d'opportunité observé (« Cybersécurité, IAM, GRC »,
   * « Data, IA & analytics »…) avec son constat et son implication
   * commerciale. Ni `qualifiedHypothesisSchema` ni `attackAngleSchema` ne
   * portent cette forme sans leur faire dire autre chose — le score/persona/
   * canal d'achat du CSV source ne sont PAS repris ici (ce ne sont pas des
   * probabilités : la doctrine `c26_probabilite` reste hors de propos, mais
   * rien ne les rend génériques non plus), seul le constat déclaré l'est.
   */
  opportunity_domains: z.array(keyNoteSchema).optional(),
  angles: z.array(attackAngleSchema).optional(),
  /** Les angles écartés et pourquoi — la logique de sélection, montrée quand
   *  `angles` est vide plutôt qu'un panneau blanc. */
  axes_ecartes: z.array(discardedAxisSchema).optional(),
  comment_ouvrir_compte: commentOuvrirCompteSchema.optional().nullable(),
  messages: z.array(messageSchema).optional(),

  /* ---- Priority / evaluation ---- */
  evaluation: evaluationSchema.optional(),
  // Two explicit score axes (Théo P1) — normally carried under ``plan`` (the IA
  // writes them on the phase-4 payload), also accepted top-level so the analysis
  // schema owns them. Both 0-100; optional / backward-compatible.
  commercial_score: z.number().optional().nullable(),
  data_confidence: z.number().optional().nullable(),
  score_factors: z.array(scoreFactorSchema).optional(),
  go_no_go: z.union([goNoGoSchema, z.string()]).optional().nullable(),
  quick_wins: z.array(z.union([z.string(), quickWinSchema])).optional(),
  risks: z.array(planRiskSchema).optional(),
  immediate_action: z.string().optional().nullable(),
  plan: planOutputSchema.optional(),
  user_plan_actions: z.array(userPlanActionSchema).optional(),
  user_attack_angles: z.array(userAttackAngleSchema).optional(),

  /* ---- Plan ---- */
  action_plan: actionPlanBodySchema.optional(),
  offers_to_propose: z.array(offerProposalSchema).optional(),

  /* ---- Contacts written off as out of perimeter ---- */
  contacts_out_of_scope: contactsOutOfScopeSchema.optional(),

  /**
   * FINIR-V2-27-09 — bloc `17_GARDE_FOUS` (dossier SG complet, CSV) : les
   * mises en garde sur la FIABILITÉ DES DONNÉES du dossier (ce qui n'est pas
   * établi, ce qu'il ne faut pas affirmer avant vérification terrain) —
   * distinctes d'un risque COMMERCIAL, que `risks` porte déjà. Confondre les
   * deux ferait lire une limite de collecte comme une menace sur l'affaire.
   */
  data_reliability_notes: z.array(keyNoteSchema).optional(),

  /* ---- Homonym disambiguation verdict (#2265.13) ---- */
  homonyms: homonymResolutionSchema.optional(),

  /* ---- #2284 — Entity Resolver P0 : le verdict d'entité unifié ---- */
  entity_resolution: entityResolutionSchema.optional(),

  /* ---- #4760 — les besoins HISTORIQUES nommés ----
   * Écrit par l'API (`AnalysisWorker.recordHistoricalNeeds`) depuis `signal_layers` : libellé, date RÉELLE
   * (`null` = non datée, jamais devinée) et source de chaque besoin passé, plus le total. Aucune probabilité.
   * Absent quand l'analyse n'a rien d'historique à nommer — une absence ne fait aucune ligne. */
  historical_needs: z
    .object({
      total: z.number().int(),
      items: z.array(
        z.object({
          label: z.string(),
          date: z.string().nullable(),
          source: z.enum(['signal', 'job_offer', 'market_path']),
          /* Lot 771 — lien, compétences et TJM de l'offre quand la collecte les a lus. */
          url: z.string().optional(),
          technologies: z.array(z.string()).optional(),
          tjm_eur: z.number().positive().optional(),
          /* Lot 775 — le lieu d'une mission observée sur le marché. */
          location: z.string().optional(),
        }),
      ),
    })
    .optional(),

  /* ---- #3755 — le verdict de la grille de qualification de l'espace ----
   * Écrit par l'API (`QualificationGridService`), jamais par l'IA : l'instantané
   * du verdict avec la version de grille qui l'a produit (#3235). Absent sans
   * grille active — le verdict affiché reste alors celui d'avant. */
  qualification: accountQualificationSnapshotSchema.optional(),
} satisfies Record<string, z.ZodTypeAny>

export const accountAnalysisSchema = z.object(accountAnalysisShape).partial().passthrough()

export type AccountAnalysis = z.infer<typeof accountAnalysisSchema>

/**
 * Safe-parse helper — tolerant by design. Returns whatever fields pass
 * validation; one malformed sub-array does not wipe the rest.
 *
 * Two passes:
 *  1. Recursively rename every key to snake_case so legacy rows written by
 *     the IA service in camelCase (``immediateAction``, ``quickWins``,
 *     ``commentOuvrirCompte``…) round-trip into the strictly typed
 *     snake_case shape. The same normalization runs at the API persistence
 *     boundary (``accounts.applyResearch``) for new analyses; this is the
 *     safety net for rows produced before that pass existed.
 *  2. ``safeParse`` each declared field independently. Old rows often carry
 *     one or two sub-arrays whose item shape predates the contract (e.g.
 *     plain strings where the schema now expects objects). With a single
 *     top-level ``safeParse`` that would discard the entire blob; per-field
 *     parsing keeps the good fields and silently drops only the bad ones.
 */
export function parseAccountAnalysis(value: unknown): AccountAnalysis {
  if (value == null) return {}
  const normalized = toSnakeCaseKeys(value)
  if (!isPlainObject(normalized)) return {}

  const out: Record<string, unknown> = {}
  for (const [key, fieldSchema] of Object.entries(accountAnalysisShape)) {
    if (!(key in normalized)) continue
    const res = fieldSchema.safeParse(normalized[key])
    if (res.success && res.data !== undefined) out[key] = res.data
  }
  return out as AccountAnalysis
}

function toSnakeCaseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toSnakeCaseKeys)
  if (!isPlainObject(value)) return value
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    out[camelToSnake(key)] = toSnakeCaseKeys(v)
  }
  return out
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function camelToSnake(key: string): string {
  if (!/[A-Z]/.test(key)) return key
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
}
