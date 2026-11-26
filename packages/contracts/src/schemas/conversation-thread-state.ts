import { z } from 'zod'

/**
 * #1927 — L'ÉTAT STRUCTURÉ D'UN FIL DE LAURA.
 *
 * Ce que Laura a RÉELLEMENT vu, préparé et demandé dans une conversation,
 * dérivé de façon déterministe des appels d'outils par le service IA
 * (`apps/ia/app/services/chat_thread_state.py`), renvoyé à l'API à la fin d'un
 * tour, stocké avec le résumé de la conversation
 * (`conversation_summaries.thread_state`) et renvoyé au service IA au tour
 * suivant — c'est ce qui permet de résoudre « lui », « ce compte », « le
 * deuxième », et d'affiner une recherche au lieu de la refaire.
 *
 * ⚠️ La forme est celle du FIL (snake_case, comme tout le corps de
 * `/chat/message`) et elle est stockée TELLE QUELLE : aucune conversion, donc
 * aucune seconde dérivation qui pourrait diverger. La fixture partagée
 * `apps/ia/tests/fixtures/thread_state_wire.json` est émise par le service IA
 * ET relue par ce schéma (`conversation-thread-state-wire.spec.ts`).
 *
 * ⚠️ LISTE BLANCHE, et c'est une protection : zod RETIRE toute clé inconnue.
 * Une proposition qui porterait demain un objet, une adresse ou un CORPS de
 * message n'entre pas dans l'état stocké (D65 : le corps d'un message ne
 * repart jamais vers le modèle) — le service IA ne les y met déjà pas, ce
 * schéma empêche qu'une évolution d'un seul côté les y fasse entrer.
 *
 * Les bornes sont le MIROIR EXACT de celles du service IA ; une garde pytest
 * relit ce fichier pour le vérifier. Un état REMPLI à chaque plafond reste sous
 * 17 Ko sérialisé (16 970 octets mesurés à l'intégration Z du 29/09, quand
 * facettes, correction, précautions, entités traitées et périmètre persistant
 * se sont cumulés — chacun tenait seul sous 16 Ko) ; la contrainte SQL de la
 * colonne en admet 32.
 */
const LIMITS = {
  objects: 12,
  focus: 5,
  lastList: 10,
  proposals: 5,
  questions: 3,
  // #2269.13 — trois choix simples PLUS un « autre » catch-all : 4, pas 3.
  options: 4,
  ruledOut: 3,
  assumptions: 3,
  searches: 4,
  id: 64,
  label: 80,
  action: 40,
  tool: 40,
  question: 200,
  option: 60,
  criterionText: 120,
  criterionList: 10,
  criterionItem: 40,
  ruledOutOption: 60,
  ruledOutReason: 120,
  assumption: 120,
  // #2268.1 / #2268.5 / #2268.10 — l'objectif actif, les critères exclus du
  // périmètre, les décisions prises. Miroir exact des constantes du service
  // IA (`GOAL_MAX`, `EXCLUDED_MAX`, `EXCLUDED_CRITERION_MAX`,
  // `EXCLUDED_REASON_MAX`, `DECISIONS_MAX`, `DECISION_MAX`).
  goal: 160,
  excluded: 3,
  excludedCriterion: 60,
  excludedReason: 120,
  decisions: 3,
  decision: 120,
  // #2268.12 / #2268.13 / #2268.15 — le job en cours, son étape actuelle, le
  // prochain geste prévu. Miroir exact de `CURRENT_JOB_MAX`/`CURRENT_STEP_MAX`/
  // `NEXT_STEP_MAX` côté service IA.
  currentJob: 160,
  currentStep: 160,
  nextStep: 160,
  // #2268.7 — les résultats ACCEPTÉS, distincts de `last_list` (la dernière
  // liste RENDUE). Miroir exact de `ACCEPTED_MAX`/`ACCEPTED_MAX_LEN` côté
  // service IA.
  accepted: 3,
  acceptedItem: 120,
  // #3178.1 / #3178.2 — le PÉRIMÈTRE persistant (groupe/filiales), distinct de
  // `focus` (l'objet dont on parle CE tour). Miroir exact de
  // `SCOPE_ENTITIES_MAX` côté service IA.
  scopeEntities: 6,
  // #3187.4 (LAU-FINAL-193) — les entités déjà TRAITÉES dans ce fil. Miroir
  // exact de `TREATED_ENTITIES_MAX`/`TREATED_ENTITY_MAX`/`TREATED_ENTITY_REASON_MAX`
  // côté service IA.
  treatedEntities: 3,
  treatedEntity: 80,
  treatedEntityReason: 120,
  // #3191.3.12 (LAU-FINAL-197, épopée #3220) — les précautions déjà énoncées
  // dans ce fil. Miroir exact de `PRECAUTIONS_MAX`/`PRECAUTION_MAX` côté
  // service IA.
  precautions: 3,
  precaution: 160,
  // #193.1 (LAU-FINAL-193, épopée #3230) — les facettes du périmètre demandé,
  // au-delà de `treated_entities`. Miroir exact de `FACET_VALUE_MAX` côté
  // service IA ; le NOMBRE de facettes n'a pas de plafond dédié, il est borné
  // par le nombre de types dans `FACET_TYPES` (un seul par type, remplacé s'il
  // change).
  facetValue: 40,
  // #194.1 (LAU-FINAL-194, épopée #3233) — l'écart reconnu d'une correction
  // utilisateur, en une phrase. Miroir exact de `CORRECTION_SUMMARY_MAX` côté
  // service IA.
  correctionSummary: 80,
  // #194.2 (reste) — au plus un outil affinable par entrée du catalogue,
  // miroir exact de `CORRECTION_INVALIDATES_MAX` côté service IA (4 depuis
  // que `run_account_search`, #3201.1, est affinable).
  correctionInvalidates: 4,
  // #3201.1 (épopée #3224) — le graphe de contraintes : une par type, donc
  // borné par le vocabulaire de 17. Miroir de `CONSTRAINT_VALUE_MAX` côté IA.
  constraintValue: 60,
} as const

/**
 * #3201.2 — le vocabulaire fermé des 17 types de contrainte, miroir exact de
 * `CONSTRAINT_TYPES` côté service IA (`constraint_graph.py`).
 */
const CONSTRAINT_TYPES = [
  'geography',
  'size',
  'sector',
  'company_type',
  'purchase_model',
  'referencing',
  'technology',
  'role',
  'seniority',
  'budget',
  'deadline',
  'remote',
  'service_type',
  'expected_volume',
  'proof_level',
  'channel',
  'allowed_source',
] as const

/**
 * #3223 (lot R17, épopée #3223) — les six verdicts canoniques de
 * `get_account_suitability_verdict`, miroir exact de `VERDICTS` côté service
 * IA (`account_suitability.py`) — jamais un septième deviné ici.
 */
const ACCOUNT_VERDICTS = ['GO_NOW', 'GO_VIA_PARTNER', 'GO_AFTER_PROOF', 'WATCH', 'NO_GO_NOW', 'NOT_EVALUABLE'] as const

/**
 * #194.1 — le catalogue NOMMÉ des 10 types de correction utilisateur, miroir
 * exact de `CORRECTION_TYPES` côté service IA.
 */
const CORRECTION_TYPES = [
  'wrong_source',
  'wrong_entity',
  'wrong_scope',
  'wrong_role',
  'wrong_sector',
  'contact_left',
  'too_generic',
  'wrong_assumption',
  'style_preference',
  'unwanted_action',
] as const

/**
 * #194.2 (LAU-FINAL-194, épopée #3233, reste) — les outils de recherche
 * AFFINABLES (mêmes 3 clés que `threadSearchSchema` ci-dessous), les seuls
 * qu'une correction peut nommer dans `invalidates` : un plan de recherche
 * n'existe que pour eux, rien d'autre n'a de plan à invalider.
 */
const CORRECTION_INVALIDATES_TOOLS = [
  'find_accounts',
  'search_market_memory',
  'search_talents',
  'run_account_search',
] as const

/**
 * #193.1 — les TYPES de facette fermés, miroir exact de `FACET_TYPES` côté
 * service IA. Un type hors de cette liste n'entre pas dans l'état : le modèle
 * NOMME toujours l'un de ceux-ci, jamais un type inventé.
 */
const FACET_TYPES = [
  'group',
  'projects',
  'programs',
  'internal_clients',
  'sectors',
  'professions',
  'technologies',
  'geographies',
  'sizes',
  'roles',
  'channels',
  'periods',
  'requested_counts',
  'requested_sources',
  'refused_sources',
] as const

const threadObjectKindSchema = z.enum(['account', 'contact', 'consultant', 'need', 'mission'])

const threadObjectSchema = z.object({
  kind: threadObjectKindSchema,
  id: z.string().min(1).max(LIMITS.id),
  label: z.string().min(1).max(LIMITS.label),
})

/** Un critère de recherche : un texte, un entier, ou une liste de textes. */
const criterionValueSchema = z.union([
  z.string().min(1).max(LIMITS.criterionText),
  z.number().int(),
  z.array(z.string().min(1).max(LIMITS.criterionItem)).min(1).max(LIMITS.criterionList),
])

/**
 * Les outils de recherche qui savent AFFINER (#1927.7), et leurs critères —
 * miroir de `REFINABLE_SEARCH_CRITERIA` côté service IA. Un critère hors de ces
 * listes n'est pas un critère : il est retiré.
 */
const threadSearchSchema = z.discriminatedUnion('tool', [
  z.object({
    tool: z.literal('find_accounts'),
    criteria: z
      .object({
        sectors: criterionValueSchema,
        department: criterionValueSchema,
        // #3704 (lot RAT) — `city`/`region` (#3762, #3706) n'étaient jamais entrés dans ce miroir :
        // l'API les RETIRAIT en écrivant l'état, le tour suivant perdait la zone. Parité gardée par
        // `conversation-thread-state-wire.spec.ts`, lue sur la source Python.
        city: criterionValueSchema,
        region: criterionValueSchema,
        headcount: criterionValueSchema,
        signals: criterionValueSchema,
        keywords: criterionValueSchema,
        // #3941.1 — le préréglage « startup » délimite QUI est cherché, comme `sectors`.
        company_profile: criterionValueSchema,
      })
      .partial(),
  }),
  z.object({
    tool: z.literal('search_market_memory'),
    criteria: z
      .object({
        technology: criterionValueSchema,
        location: criterionValueSchema,
        esn: criterionValueSchema,
        role_family: criterionValueSchema,
        employee_min: criterionValueSchema,
        employee_max: criterionValueSchema,
        // #3704 (RAT) — #2991 côté IA, jamais reporté ici.
        size: criterionValueSchema,
        external_recourse_observed: criterionValueSchema,
      })
      .partial(),
  }),
  z.object({
    tool: z.literal('search_talents'),
    // #3704 (RAT) — `zone`/`radius_km` (#3222) côté IA, jamais reportés ici.
    criteria: z
      .object({
        query: criterionValueSchema,
        available_within_days: criterionValueSchema,
        zone: criterionValueSchema,
        radius_km: criterionValueSchema,
      })
      .partial(),
  }),
  // #3201.1 (épopée #3224) — miroir de `REFINABLE_SEARCH_CRITERIA["run_account_search"]`
  // côté service IA : `signals` en est exclu, non appliqué par ce tour d'horizon.
  z.object({
    tool: z.literal('run_account_search'),
    criteria: z
      .object({
        sectors: criterionValueSchema,
        // #3704 (lot RAT, recette NF 10/10) — « Région : Île-de-France » perdue au tour 2 : la région
        // (#3706), la ville (#3762) et les secteurs exclus n'étaient pas dans ce miroir, l'API les retirait.
        exclude_sectors: criterionValueSchema,
        city: criterionValueSchema,
        // #4429.3 — le rayon demandé (« autour de Toulouse, 25 km ») se garde d'un tour à l'autre (sans lui, l'API le retirait).
        radius_km: criterionValueSchema,
        region: criterionValueSchema,
        department: criterionValueSchema,
        headcount: criterionValueSchema,
        keywords: criterionValueSchema,
        // #3983 — la base de la zone (siège sur demande ; implantation par défaut), affinable.
        site_basis: criterionValueSchema,
        // #3866 — le domaine de l'offre se garde d'un tour à l'autre (sans lui, l'API le retirait).
        offer: criterionValueSchema,
        // #3941.1 — le préréglage « startup » délimite QUI est cherché, comme `sectors`.
        company_profile: criterionValueSchema,
        // #4408 — « pas de gros process achat » se garde d'un tour à l'autre (sans lui, l'API le retirait).
        purchasing_process: criterionValueSchema,
      })
      .partial(),
  }),
])

/** Une action PRÉPARÉE : son type et sa cible, jamais son contenu. */
const threadProposalSchema = z.object({
  action: z.string().min(1).max(LIMITS.action),
  target_kind: threadObjectKindSchema.nullable(),
  target_id: z.string().min(1).max(LIMITS.id).nullable(),
  target_label: z.string().min(1).max(LIMITS.label).nullable(),
  /** #194.2 (résidu) — l'outil d'origine, posé seulement pour un outil qu'une correction peut invalider. */
  tool: z.string().min(1).max(LIMITS.action).optional(),
})

const threadQuestionSchema = z.object({
  question: z.string().min(1).max(LIMITS.question),
  options: z.array(z.string().min(1).max(LIMITS.option)).max(LIMITS.options),
  /** #3854 (BEL-LAU-1008-003, lot X01) — le tour qui l'a posée, estampillé par
   * le collecteur IA (jamais par le modèle) ; même convention que
   * `threadConstraintSchema.source_turn` (#3224, lot X36). Absent = fil
   * d'avant l'estampille. C'est ce qui borne le retrait de l'outil
   * `ask_clarification` au tour qui suit, au lieu de la vie entière du fil. */
  source_turn: z.number().int().min(1).optional(),
})

/**
 * #1927.3 — une piste ÉCARTÉE, nommée par le modèle dans la sortie typée de
 * `ask_clarification`. La raison est optionnelle : « j'ai écarté Lyon » est déjà
 * une information, « j'ai écarté » n'en est pas une — et une raison DEVINÉE
 * vaudrait moins que pas de raison du tout.
 *
 * ⚠️ Rien ici n'est extrait d'une phrase : le refus écrit de
 * `apps/ia/app/services/chat_thread_state.py` (« un détecteur par mots-clés rate
 * en silence ») n'est pas levé, il est CONTOURNÉ par le haut.
 */
const threadRuledOutSchema = z.object({
  option: z.string().min(1).max(LIMITS.ruledOutOption),
  reason: z.string().min(1).max(LIMITS.ruledOutReason).nullable(),
})

/**
 * #2268.5 — un CRITÈRE explicitement exclu du PÉRIMÈTRE par l'utilisateur
 * (« sans les grands groupes », « hors Île-de-France »), distinct d'une piste
 * ÉCARTÉE (`threadRuledOutSchema` porte une entreprise, une ville, une
 * personne — ceci porte un critère de recherche).
 */
const threadExcludedSchema = z.object({
  criterion: z.string().min(1).max(LIMITS.excludedCriterion),
  reason: z.string().min(1).max(LIMITS.excludedReason).nullable(),
})

/**
 * #3178.1 / #3178.2 — LE PÉRIMÈTRE PERSISTANT d'un fil (le « Facet Ledger »
 * de LAU-FINAL-184) : le groupe ou la maison mère que Laura garde comme
 * périmètre de recherche, distinct de `focus` (l'objet « dont on parle » CE
 * tour, qui bascule à chaque compte cité — voir son docblock ci-dessus).
 *
 * ⚠️ `root_entity` REMPLACE l'ancien, comme `goal` : un fil n'a qu'un
 * périmètre actif à la fois. `included_entities`/`excluded_entities`
 * s'ACCUMULENT, bornés, comme `ruled_out` — c'est ce qui permet à Laura de
 * répondre « je garde le groupe entier, BoursoBank est seulement l'une des
 * entités citées » plutôt que de réduire silencieusement le périmètre à la
 * dernière filiale mentionnée (le NO-GO de LAU-FINAL-184).
 */
const threadPersistentScopeSchema = z.object({
  root_entity: threadObjectSchema,
  included_entities: z.array(threadObjectSchema).max(LIMITS.scopeEntities),
  excluded_entities: z.array(threadObjectSchema).max(LIMITS.scopeEntities),
  /**
   * #3178.2b (épopée #3227) — les entités CITÉES dans ce périmètre sans
   * compte résolu, nommées par le modèle via
   * `note_thread_context.group_scope_unresolved`. Des LIBELLÉS, pas des
   * `threadObjectSchema` : c'est l'absence d'id qui les range ici plutôt
   * que dans `included_entities`. `.default([])` pour la même raison de
   * bascule à deux services que `ruled_out`/`assumptions` (voir plus bas) :
   * un état émis par l'IA d'AVANT ce champ ne doit pas être refusé pendant
   * la fenêtre de déploiement.
   */
  unresolved_entities: z.array(z.string().min(1).max(LIMITS.label)).max(LIMITS.scopeEntities).default([]),
  /**
   * #3706 — le POINT D'ENTRÉE que la personne a CHOISI dans ce périmètre et sa relation à la
   * maison mère ; les contacts et actions suivants suivent cette entité. Une recommandation de
   * Laura n'y entre jamais. `null` par défaut : un état émis avant ce champ reste lisible.
   */
  entry_entity: threadObjectSchema.nullable().default(null),
  entry_relation: z.enum(['groupe', 'maison', 'filiale', 'direction']).nullable().default(null),
})

/**
 * #3187.4 (LAU-FINAL-193) — une ENTITÉ (filiale, société, périmètre) déjà
 * TRAITÉE dans ce fil, nommée par le modèle via `note_thread_context`, pour
 * qu'une demande ELLIPTIQUE ultérieure (« et les autres ? ») l'exclue sans la
 * redemander. Distincte de `threadExcludedSchema` (un CRITÈRE de périmètre,
 * jamais une entreprise) et de `threadRuledOutSchema` (une piste écartée
 * AVANT d'être traitée, dans le tour d'une clarification).
 */
const threadTreatedEntitySchema = z.object({
  entity: z.string().min(1).max(LIMITS.treatedEntity),
  reason: z.string().min(1).max(LIMITS.treatedEntityReason).nullable(),
})

/**
 * #193.1 (LAU-FINAL-193, épopée #3230) — les FACETTES du périmètre demandé
 * (groupe, projets, programmes, clients internes, secteurs, métiers,
 * technologies, géographies, tailles, rôles, canaux, périodes, nombres
 * demandés, sources demandées, sources refusées), nommées par le modèle via
 * `note_thread_context` — jamais un détecteur qui relit une phrase (même
 * refus que `threadRuledOutSchema` ci-dessus). #193.2 (cycle de vie complet à
 * 8 sous-champs par facette) reste écarté : un type REMPLACE sa valeur
 * précédente, comme `goal`, pas de schéma riche par facette.
 *
 * Une clé PAR TYPE, jamais un tableau — plus compact sur le fil, et miroir
 * direct de `ThreadState.facets` (un `dict[str, str]`) côté service IA. Comme
 * le reste de ce fichier (voir la note « LISTE BLANCHE » en tête), zod RETIRE
 * silencieusement une clé hors de `FACET_TYPES` plutôt que de refuser l'état
 * entier : un type inventé demain par une évolution d'un seul côté n'entre
 * pas, il ne fait pas tomber le tour.
 */
const threadFacetsSchema = z
  .object(
    Object.fromEntries(FACET_TYPES.map(facetType => [facetType, z.string().min(1).max(LIMITS.facetValue)])) as Record<
      (typeof FACET_TYPES)[number],
      z.ZodString
    >,
  )
  .partial()

/**
 * #194.1 / #194.2 (LAU-FINAL-194, épopée #3233) — la CORRECTION utilisateur
 * reconnue dans ce fil : son TYPE (catalogue fermé, `CORRECTION_TYPES`) et
 * l'écart reconnu en une phrase, nommés par le modèle via
 * `note_thread_context` — jamais devinés. Remplace la précédente, comme
 * `goal`.
 *
 * #194.2 (reste) — `invalidates` porte les outils affinables
 * (`CORRECTION_INVALIDATES_TOOLS`) dont le plan de recherche retenu est
 * désormais invalide : l'invalidation FORMELLE et la reconstruction du plan
 * demandées par la spec (#3188), au format déjà tranché pour #193.2 — un
 * champ nommé, pas un objet séparé. `.default([])` : un état émis par une IA
 * d'AVANT ce champ (fenêtre de bascule à deux services) ne doit pas être
 * refusé.
 */
const threadCorrectionSchema = z.object({
  correction_type: z.enum(CORRECTION_TYPES),
  summary: z.string().min(1).max(LIMITS.correctionSummary),
  invalidates: z.array(z.enum(CORRECTION_INVALIDATES_TOOLS)).max(LIMITS.correctionInvalidates).default([]),
})

/** #3201.1 — une contrainte NOMMÉE par le modèle, dure ou souple, explicite ou inférée. */
const threadConstraintSchema = z.object({
  constraint_type: z.enum(CONSTRAINT_TYPES),
  value: z.string().min(1).max(LIMITS.constraintValue),
  hardness: z.enum(['hard', 'soft']),
  origin: z.enum(['explicit', 'inferred']),
  /** #3201.1 (reste) — nommés par le modèle, absents tant que personne ne les a dits. */
  priority: z.enum(['primary', 'secondary']).optional(),
  relaxation_cost: z.enum(['low', 'medium', 'high']).optional(),
  business_impact: z.string().min(1).max(LIMITS.constraintValue).optional(),
  /** #3224 (lot X36) — le tour qui l'a posée, estampillé par le collecteur IA (jamais par le modèle). */
  source_turn: z.number().int().min(1).optional(),
})

export const conversationThreadStateSchema = z.object({
  version: z.literal(1),
  /** Objets cités par les outils, du plus récent au plus ancien (#1927.1). */
  objects: z.array(threadObjectSchema).max(LIMITS.objects),
  /** Par nature, l'objet « dont on parle » — au plus un par nature. */
  focus: z.array(threadObjectSchema).max(LIMITS.focus),
  /** La dernière liste rendue, dans son ordre d'affichage (« le deuxième »). */
  last_list: z
    .object({
      tool: z.string().min(1).max(LIMITS.tool),
      items: z.array(threadObjectSchema).min(1).max(LIMITS.lastList),
    })
    .nullable(),
  /** La dernière recherche préparée par outil, critères RETENUS (#1927.2). */
  searches: z.array(threadSearchSchema).max(LIMITS.searches),
  /** Les actions préparées dans le fil (#1927.5). */
  proposals: z.array(threadProposalSchema).max(LIMITS.proposals),
  /** Les questions de précision déjà posées (#1927.6). */
  questions: z.array(threadQuestionSchema).max(LIMITS.questions),
  /**
   * Les pistes que Laura a ÉCARTÉES, avec leur raison (#1927.3).
   *
   * ⚠️ `.default([])`, et ce n'est pas du confort : l'API et le service IA ne
   * déploient PAS ensemble (deux services Railway, deux `watchPatterns`). Sans
   * défaut, un état émis par l'IA d'AVANT ce champ échouerait au `safeParse`,
   * et `parseThreadState` rendrait `null` — c'est-à-dire la mémoire du fil
   * PERDUE pendant toute la fenêtre de bascule, pour tout le monde. Un champ
   * absent vaut « rien d'écarté », ce qui est vrai.
   */
  ruled_out: z.array(threadRuledOutSchema).max(LIMITS.ruledOut).default([]),
  /** Les hypothèses sur lesquelles elle avance, corrigeables (#1927.4). Même
   *  défaut, et pour la même raison que `ruled_out`. */
  assumptions: z.array(z.string().min(1).max(LIMITS.assumption)).max(LIMITS.assumptions).default([]),
  /**
   * #2268.1 — l'objectif ACTIF de ce fil, en une phrase, tel que Laura l'a
   * nommé via `note_thread_context`. `.nullable().default(null)` pour la même
   * raison que `ruled_out`/`assumptions` : un état émis avant ce champ ne
   * doit pas être refusé pendant la fenêtre de bascule des deux services.
   */
  goal: z.string().min(1).max(LIMITS.goal).nullable().default(null),
  /** Les critères explicitement EXCLUS du périmètre dans ce fil (#2268.5). */
  excluded: z.array(threadExcludedSchema).max(LIMITS.excluded).default([]),
  /** Les décisions prises dans ce fil (#2268.10). */
  decisions: z.array(z.string().min(1).max(LIMITS.decision)).max(LIMITS.decisions).default([]),
  /**
   * #2268.12 — le travail en cours dans ce fil, tel que Laura l'a nommé via
   * `note_thread_context`. Même défaut que `goal`, pour la même raison de
   * bascule à deux services.
   */
  current_job: z.string().min(1).max(LIMITS.currentJob).nullable().default(null),
  /** #2268.13 — l'étape actuelle de ce travail. */
  current_step: z.string().min(1).max(LIMITS.currentStep).nullable().default(null),
  /** #2268.15 — le prochain geste prévu pour ce travail. */
  next_step: z.string().min(1).max(LIMITS.nextStep).nullable().default(null),
  /**
   * #2268.7 — les résultats explicitement RETENUS dans ce fil, distincts de
   * `last_list` (la dernière liste RENDUE, pas ce qui a été CHOISI dedans).
   * Même défaut que `decisions`, pour la même raison de bascule à deux
   * services.
   */
  accepted: z.array(z.string().min(1).max(LIMITS.acceptedItem)).max(LIMITS.accepted).default([]),
  /**
   * #3178.1 / #3178.2 — le périmètre persistant (groupe/filiales) de ce fil,
   * tel que Laura l'a nommé via `note_thread_context`. `.nullable().default(null)`
   * pour la même raison que `goal`/`ruled_out` : un état émis avant ce champ ne
   * doit pas être refusé pendant la fenêtre de bascule des deux services.
   */
  persistent_scope: threadPersistentScopeSchema.nullable().default(null),
  /**
   * #3187.4 — les entités déjà traitées dans ce fil. Même défaut que
   * `excluded`/`decisions`, pour la même raison de bascule à deux services.
   */
  treated_entities: z.array(threadTreatedEntitySchema).max(LIMITS.treatedEntities).default([]),
  /**
   * #3191.3.12 — les précautions déjà énoncées dans ce fil, nommées par
   * Laura via `note_thread_context`. Même défaut que `decisions`, pour la
   * même raison de bascule à deux services.
   */
  precautions: z.array(z.string().min(1).max(LIMITS.precaution)).max(LIMITS.precautions).default([]),
  /**
   * #193.1 — les facettes du périmètre déjà fixées dans ce fil, une clé par
   * type. Même défaut que `excluded`/`decisions`, pour la même raison de
   * bascule à deux services.
   */
  facets: threadFacetsSchema.default({}),
  /**
   * #194.1 / #194.2 — la correction utilisateur active dans ce fil. Même
   * défaut nullable que `goal`, pour la même raison de bascule à deux
   * services.
   */
  correction: threadCorrectionSchema.nullable().default(null),
  /**
   * #3201.1 — le graphe de contraintes posées dans ce fil. Même défaut que
   * `facets`, pour la même raison de bascule à deux services.
   */
  constraints: z.array(threadConstraintSchema).max(CONSTRAINT_TYPES.length).default([]),
  /** #3224 (lot X36) — numéro du dernier tour joué dans ce fil ; 0 = fil d'avant le compteur. */
  turns: z.number().int().min(0).default(0),
  /**
   * #3223 (lot R17, épopée #3223) — le DERNIER verdict de compte connu dans
   * ce fil (`get_account_suitability_verdict`), pour que le tour suivant
   * puisse dire si une correction a changé le résultat, sans deviner. Même
   * défaut nullable que `goal`/`correction`, pour la même raison de bascule
   * à deux services.
   */
  last_account_verdict: z.enum(ACCOUNT_VERDICTS).nullable().default(null),
})
export type ConversationThreadState = z.infer<typeof conversationThreadStateSchema>
