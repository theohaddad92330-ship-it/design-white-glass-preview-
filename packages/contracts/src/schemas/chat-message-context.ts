import { z } from 'zod'
import { replyFamilyContextSchema } from './reply-family.js'

/**
 * #1914.14 — LES COMPOSANTS D'UNE RÉPONSE SURVIVENT AU RECHARGEMENT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * `Chat.tsx` le disait en toutes lettres, à deux endroits : « le `context`
 * (panneau de transparence) n'est PAS persisté : seul le texte l'est. Un fil
 * relu s'affiche donc sans son disclosure. » On rouvrait un fil et tout ce qui
 * n'était pas du texte avait disparu — les sources citées, ce que Laura n'avait
 * PAS consulté, la question de précision et ses options cliquables.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES QUATRE QUESTIONS, ET LEURS RÉPONSES
 * ─────────────────────────────────────────────────────────────────────────────
 * **La forme.** Une colonne `jsonb` sur `chat_messages`, pas une table : ce
 * qu'on garde pend du message, n'a pas d'identité propre, n'est jamais requêté
 * autrement que par son message, et ne survit pas à sa suppression. Migration
 * `ChatMessageContext`, ADDITIVE et NULLABLE — élargie AVANT le code qui écrit
 * (GA-11/GA-12). Aucun enum n'est touché (GA-08 sans objet ici).
 *
 * **La taille.** {@link PERSISTED_CHAT_CONTEXT_MAX_BYTES}. Au-delà on ne garde
 * RIEN plutôt qu'une moitié : un panneau tronqué ferait lire « deux sources » là
 * où il y en avait trente, ce qui est pire que pas de panneau du tout.
 *
 * **La purge.** Aucune de plus. Le contexte vit DANS la ligne du message : il
 * part exactement quand elle part — suppression d'un fil (`deleteThread`),
 * effacement de compte (RGPD art. 17), remise à zéro d'une salle de
 * démonstration. Un balayage séparé ne pourrait que diverger de celui-là.
 *
 * **Les tours d'AVANT.** La colonne vaut `NULL` pour tout l'existant, et
 * {@link persistedChatContext} rend `null` sur un contexte absent ou illisible :
 * dans les deux cas l'écran fait EXACTEMENT ce qu'il fait aujourd'hui — aucun
 * panneau, jamais un rendu cassé. C'est le témoin que tiennent les tests.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CE QU'ON NE GARDE PAS, ET POURQUOI — LA PARTIE QUI COMPTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le `context` servi à l'écran porte trois champs de plus que cette liste
 * blanche. Aucun n'entre dans la colonne :
 *
 *  - **`pending_actions`** — la proposition BRUTE du modèle. C'est du texte
 *    libre qu'il a rédigé à partir de ce qu'il a lu, corps de courriel compris,
 *    et **le corps d'un message ne sort jamais vers un humain ni vers le
 *    modèle** (D65). Le garder des mois dans une colonne relue à chaque
 *    ouverture de fil est exactement ce que cette règle refuse. Par ailleurs la
 *    forme GOUVERNÉE du même geste — la CARTE (#1998) — est DÉJÀ persistée côté
 *    serveur et relue par `turn_id` : une seconde copie ferait deux sources d'un
 *    même geste, qui divergeraient (GA-26).
 *  - **`permissions`** — les droits EFFECTIFS du LECTEUR, résolus à chaque tour
 *    (`withReaderPermissions`). Les figer afficherait, six mois plus tard, un
 *    droit qui a pu être retiré depuis. Un droit se lit, il ne s'archive pas.
 *  - **`cards`** — voir `pending_actions` : déjà persistées, par leur tour.
 *
 * La liste blanche n'est pas une politesse demandée à l'appelant : c'est un
 * `z.object` non strict, donc **zod RETIRE** ces clés, et la seule porte
 * d'écriture (`ChatMessagesService.create`) passe par ici.
 */

/**
 * Le budget d'un contexte conservé, en octets d'UTF-8.
 *
 * Ancré sur un fait du dépôt : le contexte le plus lourd que le serveur
 * compose porte `active.portfolio.names` (le portefeuille servi au modèle) et
 * une vingtaine de sources datées — quelques kilo-octets. 16 000 laisse le
 * double de marge à un gros portefeuille sans jamais laisser une colonne
 * grossir sans borne. Il vit ICI et nulle part ailleurs (GA-26).
 */
export const PERSISTED_CHAT_CONTEXT_MAX_BYTES = 16_000

/** Une source citée : sa nature, son libellé, sa fraîcheur quand on la connaît. */
const persistedSourceSchema = z.object({
  kind: z.string(),
  label: z.string(),
  as_of: z.string().nullish(),
  /**
   * #3775.2b — cette source vient d'une connexion PERSONNELLE (`owner: 'user'`,
   * `tool-registry.ts`), pas d'une connexion de l'espace : un extrait déjà
   * écrit à partir d'elle reste lisible même si la connexion se ferme ensuite
   * (« Partager un lien ne partage pas les identifiants d'un connecteur ; un
   * extrait sensible déjà écrit n'est pas protégé par la fermeture de sa
   * source »). Posé par `ia-proxy.controller.ts` (`createChatMessage`), qui
   * seul connaît le registre de l'appelant à l'écriture — jamais recalculé
   * ici. Absent = source d'espace, ou nature sans propriétaire connu
   * (`knowledge_doc`, `method_rule`…) : le cas normal, jamais `false`.
   */
  restricted: z.boolean().optional(),
})

/**
 * Une option de clarification : un texte plat (l'historique) ou l'objet de
 * désambiguïsation (#1951.10). Miroir de `ClarificationOption` côté web.
 *
 * #2679 — la MÊME forme sert les deux champs (`clarification.options` et
 * `reply_options[].options`) : l'écran rend les deux avec le même composant, et
 * un clic y envoie toujours `label` comme message.
 */
const persistedClarificationOptionSchema = z.union([
  z.string(),
  z.object({
    label: z.string(),
    company: z.string().optional(),
    role: z.string().optional(),
    location: z.string().optional(),
    status: z.string().optional(),
    avatar_url: z.string().optional(),
  }),
])

/** #1950.4 / .7 / .12 / .13 — le résumé d'un plan de Laura. */
export const planBriefSchema = z.object({
  objective: z.string().min(1),
  expected_results: z.array(z.string()).optional(),
  missing_data: z.array(z.string()).optional(),
  impossible: z.array(z.string()).optional(),
})
export type PlanBrief = z.infer<typeof planBriefSchema>

/**
 * #3193.2/.3 (épopée #3217) — LE REÇU DE CONNAISSANCE STRUCTURÉ.
 *
 * Les onze couches de l'issue #3193 comme UN OBJET UNIQUE, chacune nommée
 * même quand elle n'a rien à dire — plutôt que réparties, partiellement,
 * entre `active`/`sources`/`not_consulted` ci-dessous. `dataforge` reste un
 * nom INTERNE : jamais rendu tel quel à l'écran (l'i18n web le traduit en
 * « référentiel sectoriel Bellum »), même règle que le CRM générique.
 *
 * Chaque couche porte un état parmi quatre, et des champs optionnels posés
 * SEULEMENT quand la couche les porte réellement (jamais une valeur devinée
 * pour compléter le tableau — « on n'affiche pas ce qu'on n'a pas ») :
 * `result_count` (combien de résultats réels), `coverage` (une mesure de ce
 * qu'on SAIT, jamais de ce que le marché FAIT — GA-259), `freshness` (la date
 * ISO du dernier appel réel) et `caveat` (une réserve nommée). Construit par
 * `apps/ia/app/prompts/context_transparency.py` (`build_knowledge_receipt`),
 * purement à partir de l'état déjà réel de `active`/`sources`/`mail_threads`
 * — jamais un second appel.
 */
export const KNOWLEDGE_RECEIPT_LAYERS = [
  'workspace',
  'crm',
  'messaging',
  'agenda',
  'documents',
  'account_dossier',
  'dataforge',
  'market_memory',
  'current_public_sources',
  'bellum_method',
  'inference',
] as const

export type KnowledgeReceiptLayer = (typeof KNOWLEDGE_RECEIPT_LAYERS)[number]

const knowledgeReceiptLayerSchema = z.object({
  // 'excluded' — #3708 (recette prod 09/10) : une source DÉCOCHÉE pour ce fil
  // ('Outils et sources'), jamais confondue avec 'not_requested' (qui dirait
  // deux fois la même chose que la liste « NON CONSULTÉ » sous une forme
  // contradictoire).
  status: z.enum(['consulted', 'unavailable', 'not_requested', 'forbidden_by_mode', 'excluded']),
  result_count: z.number().nullish(),
  coverage: z.string().nullish(),
  freshness: z.string().nullish(),
  caveat: z.string().nullish(),
})
export type KnowledgeReceiptLayerState = z.infer<typeof knowledgeReceiptLayerSchema>

export const knowledgeReceiptSchema = z.object({
  workspace: knowledgeReceiptLayerSchema,
  crm: knowledgeReceiptLayerSchema,
  messaging: knowledgeReceiptLayerSchema,
  agenda: knowledgeReceiptLayerSchema,
  documents: knowledgeReceiptLayerSchema,
  account_dossier: knowledgeReceiptLayerSchema,
  dataforge: knowledgeReceiptLayerSchema,
  market_memory: knowledgeReceiptLayerSchema,
  current_public_sources: knowledgeReceiptLayerSchema,
  bellum_method: knowledgeReceiptLayerSchema,
  inference: knowledgeReceiptLayerSchema,
})
export type KnowledgeReceipt = z.infer<typeof knowledgeReceiptSchema>

/**
 * #3176.10 (épopée #3216) — LA TRACE D'OBSERVABILITÉ DU SOURCEPLAN.
 *
 * Miroir de `SourcePlanTrace.to_wire()` (`apps/ia/app/services/source_plan.py`).
 * `undefined` = aucun mode de recherche détecté pour ce tour (le cas normal :
 * la plupart des tours n'ont pas de marqueur) — l'écran ne rend alors aucune
 * section, exactement comme `knowledge_receipt` absent. Recette prod 29/09
 * (#3216) : le plan existait déjà côté IA (`data["context"]["source_plan"]`)
 * mais n'était lu par AUCUN appelant côté web — « du code juste que personne
 * n'appelle ».
 */
export const sourcePlanTraceSchema = z.object({
  source_plan_requested: z.string().nullable(),
  source_plan_effective: z.string().nullable(),
  matched_marker: z.string().nullable(),
  layers_called: z.array(z.string()),
  layers_unavailable: z.array(z.string()),
  internal_memory_used: z.boolean(),
  public_search_avoided: z.boolean(),
  source_plan_override_reason: z.string().nullable(),
})
export type SourcePlanTrace = z.infer<typeof sourcePlanTraceSchema>

/**
 * #3183.11 (recette prod 29-30/09/2026, LAU-FINAL-189) — LA PREUVE DE
 * L'APPROFONDISSEMENT PROGRESSIF.
 *
 * Miroir de `turn_observability_as_dict` (`apps/ia/app/services/chat_turn_plan.py`,
 * #3196.6) : les huit champs que l'orchestrateur calcule déjà pour CHAQUE
 * tour (combien de passages d'outils étaient prévus, combien ont réellement
 * eu lieu, si le budget a manqué, si la réponse est dégradée) — posés dans
 * `context["turn_observability"]` (`apps/ia/app/routers/chat.py`) mais lus
 * par AUCUN appelant côté web : le NO-GO exact de l'issue (« le bouton ou la
 * demande "approfondis" produit exactement la même réponse avec davantage de
 * texte ») ne pouvait jamais être réfuté, faute d'un écran qui montre qu'un
 * second passage a RÉELLEMENT eu lieu plutôt que de le dire en prose.
 */
export const turnObservabilitySchema = z.object({
  execution_plan: z.string(),
  planned_steps: z.number(),
  completed_steps: z.number(),
  skipped_steps: z.number(),
  parallel_calls: z.number(),
  budget_exhausted: z.boolean(),
  degraded_answer: z.boolean(),
  job_created: z.boolean(),
  /**
   * #3218 — la trace durable du moteur d'approfondissement : passes annoncées
   * (PASS 0→3) et critère d'arrêt. Absente ⇒ aucun moteur n'a décidé ce tour.
   */
  deepening: z
    .array(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('pass'), pass: z.number() }),
        z.object({ kind: z.literal('stop'), reason: z.string() }),
      ]),
    )
    .optional(),
  /**
   * #3861.5 (BEL-LAU-1008-010) — un repli vers un modèle économique (#2276.43)
   * sur une demande COMPLEXE n'est pas masqué comme une exécution équivalente.
   * `.optional()` comme `deepening` : absent sur un tour d'avant ce champ,
   * jamais déduit. Jamais un nom de fournisseur ni de modèle (doctrine).
   */
  capability_fallback: z.boolean().optional(),
})
export type TurnObservability = z.infer<typeof turnObservabilitySchema>

/**
 * #3223.1 (#3198) — LA TRACE DE RAISONNEMENT D'UN TOUR, diagnostic seulement.
 *
 * Miroir de `context["reasoning_trace"]` (`apps/ia/app/routers/chat.py`) : de
 * quoi mesurer sur le TRAFIC RÉEL (tableau de pilotage du raisonnement,
 * `reasoning-quality.ts`) si Laura a ignoré les outils que sa route prévoyait
 * et si son verdict a été vérifié — sans échantillonner un corps de message ni
 * une chaîne de pensée (le vocabulaire `ReasoningTrace` les interdit côté IA).
 */
const reasoningTraceSchema = z.object({
  detected_intent: z.string(),
  tools_planned: z.array(z.string()),
  tools_called: z.array(z.string()),
  // #3391 — la RAISON de chaque outil : mode, CLÉS d'entrée (jamais une valeur,
  // #2442.3), silence. Absent = message d'avant ce champ (jamais « aucun
  // outil ») ; un détail illisible ne fait pas perdre le reste de la trace.
  tools_detail: z
    .array(
      z.object({
        tool: z.string(),
        mode: z.enum(['read', 'write']),
        input_keys: z.array(z.string()),
        silent: z.boolean(),
      }),
    )
    .optional()
    .catch(undefined),
  verifier_status: z.string(),
  // #3223.7 — le statut rendu par l'outil de verdict CE tour ; absent sans lui.
  account_verdict: z.string().optional(),
  // #3223 (lot X17) — une correction utilisateur a été reconnue CE tour ; absent
  // sur les tours d'avant ce champ (hors dénominateur, jamais « false »).
  correction_recognized: z.boolean().optional(),
  // Seulement quand la correction nomme les outils qu'elle invalide : au moins un
  // a-t-il été rappelé ? Absent sinon (non décidable, jamais deviné).
  correction_rerun: z.boolean().optional(),
  // #2879 (X17, #2442.15) — les codes de motif du vérificateur de CE tour
  // (`action_declaree_sans_preuve`, `inconnue_convertie_en_zero`…) : `[]` = vérifié
  // sans motif, absent = non vérifié ce tour ou tour d'avant le champ.
  verifier_reasons: z.array(z.string()).optional(),
  // #3223 (lot R17, épopée #3223) — une correction a été SUIVIE d'un rerun
  // (`correction_rerun: true`) ET le verdict de compte rendu ce tour est le
  // MÊME que le dernier connu dans le fil : absent si l'un des deux verdicts
  // (avant/après) n'est pas connu, jamais deviné.
  correction_without_result_change: z.boolean().optional(),
  // #3223 (lot R17, épopée #3223) — `GO_AFTER_PROOF` rendu pour un grand
  // compte (5000 salariés et plus) : absent sauf ce cas précis, jamais `false`.
  large_account_without_access: z.boolean().optional(),
})

/**
 * #214.1 (réel, épopée #3229) — LE SEARCH UNIVERSE D'UNE DEMANDE LARGE.
 *
 * Miroir de `SearchUniverse.to_wire()` (`apps/ia/app/services/search_universe.py`).
 * `undefined` = aucun marqueur de population large détecté pour ce tour (le
 * cas normal) — l'écran ne rend alors aucune section, même contrat additif
 * que `source_plan` ci-dessus. Le champ existait déjà côté IA
 * (`data["context"]["search_universe"]`, `apps/ia/app/routers/chat.py`) mais
 * n'était lu par AUCUN appelant côté web — « du code juste que personne
 * n'appelle ».
 */
export const searchUniverseTraceSchema = z.object({
  population: z.string(),
  entities_covered: z.array(z.string()),
  geographies: z.array(z.string()),
  roles: z.array(z.string()),
  periods: z.array(z.string()),
  sources: z.array(z.string()),
  exclusions: z.array(z.string()),
  limits: z.array(z.string()),
  pagination: z.string().nullable(),
  relevance_criteria: z.array(z.string()),
})
export type SearchUniverseTrace = z.infer<typeof searchUniverseTraceSchema>

/**
 * #3229 (reste) — LE RAPPORT DE COUVERTURE D'UNE LISTE RÉELLE.
 *
 * Miroir de `CoverageReport.to_wire()` (`apps/ia/app/services/search_universe.py`),
 * construit par l'outil sur ses RÉSULTATS (`coverage_report_from_contact_list`).
 * `null` sur un palier = NON MESURÉ (la sortie ne permet pas de le calculer) :
 * l'écran l'omet, il ne l'écrit jamais « 0 » (GA-18/19). `estimated_coverage`
 * reste `null` pour une lecture de l'espace : un taux mesure ce qu'on SAIT,
 * jamais ce que le marché FAIT (GA-259).
 */
export const coverageReportTraceSchema = z.object({
  detected: z.number(),
  resolved: z.number().nullable(),
  verified: z.number().nullable(),
  relevant: z.number().nullable(),
  enriched: z.number().nullable(),
  excluded: z.number(),
  unresolved: z.number(),
  sources_unavailable: z.array(z.string()),
  estimated_coverage: z.number().nullable(),
  coverage_basis: z.string(),
})
export type CoverageReportTrace = z.infer<typeof coverageReportTraceSchema>

/**
 * #3227 (recette prod 01/10) — LE PÉRIMÈTRE DE GROUPE que Laura garde pour le fil
 * (`note_thread_context`), rendu lisible sous la réponse. Des LIBELLÉS seulement :
 * les identifiants restent dans l'état du fil, jamais relayé au navigateur.
 */
export const threadScopeTraceSchema = z.object({
  root: z.string().min(1),
  included: z.array(z.string()),
  excluded: z.array(z.string()),
  unresolved: z.array(z.string()),
})
export type ThreadScopeTrace = z.infer<typeof threadScopeTraceSchema>

/**
 * La liste blanche. Miroir EXACT de `ChatResponseContext`
 * (`apps/web/src/features/chat/view/ContextDisclosure.tsx`) **moins** les trois
 * champs nommés dans l'en-tête de ce fichier — pour que le résultat se rende
 * sans conversion par le composant qui l'affichait déjà.
 */
export const persistedChatContextSchema = z.object({
  active: z.object({
    profile: z.object({ present: z.boolean(), name: z.string().nullable() }),
    account: z.object({ present: z.boolean(), name: z.string().nullable(), as_of: z.string().nullish() }),
    contacts_count: z.number(),
    signals_count: z.number().optional(),
    plan: z.object({ present: z.boolean() }),
    portfolio: z.object({
      present: z.boolean(),
      count: z.number(),
      names: z.array(z.string()).optional(),
      total: z.number().optional(),
    }),
    memory: z.object({ pinned_facts: z.number(), has_summary: z.boolean() }),
    // W-G (13/10) — le bloc « faits du compte » réellement envoyé au modèle. Absent = aucun fait.
    account_facts: z.object({ present: z.boolean(), count: z.number() }).optional(),
  }),
  sources: z.array(persistedSourceSchema),
  not_consulted: z.array(z.string()),
  not_consulted_actions: z.array(z.object({ label: z.string(), action: z.string() })).optional(),
  // #5086 — « Précision : … » et « Contrainte retenue : … », sorties du corps : lues dans le panneau Sources.
  // Absent = aucune note (réponse d'avant ce champ, ou tour sans limite à dire).
  reply_notes: z.array(z.string()).optional(),
  // #4150 — posé par `context_transparency.py` : seul ce champ pilote le badge
  // « Qualification complémentaire nécessaire », jamais la longueur de
  // `not_consulted`. Absent = réponse d'avant ce champ : aucun badge, jamais deviné.
  qualification_needed: z.boolean().optional(),
  // #3193.2/.3 (épopée #3217) — absent = réponse d'avant ce champ : l'écran
  // ne rend alors pas la section, comme avant.
  knowledge_receipt: knowledgeReceiptSchema.optional().catch(undefined),
  // #3176.10 (épopée #3216) — absent = aucun mode de recherche détecté pour
  // ce tour : l'écran ne rend alors pas la section, comme `knowledge_receipt`.
  source_plan: sourcePlanTraceSchema.optional().catch(undefined),
  // #3183.11 (recette prod 29-30/09) — absent = tour d'avant ce champ : l'écran
  // ne rend alors pas la section, comme `source_plan` ci-dessus.
  turn_observability: turnObservabilitySchema.optional().catch(undefined),
  // #3223.1 — absent = tour d'avant ce champ : « non mesuré », jamais « aucun
  // outil appelé ».
  reasoning_trace: reasoningTraceSchema.optional().catch(undefined),
  // #214.1 (réel, épopée #3229) — absent = aucun marqueur de population large
  // détecté pour ce tour : l'écran ne rend alors pas la section, comme
  // `source_plan` ci-dessus.
  search_universe: searchUniverseTraceSchema.optional().catch(undefined),
  // #3229 (reste) — absent = aucun outil n'a construit de rapport ce tour.
  coverage_report: coverageReportTraceSchema.optional().catch(undefined),
  // #3227 — absent = aucun périmètre de groupe posé dans ce fil.
  thread_scope: threadScopeTraceSchema.optional().catch(undefined),
  clarification: z
    .object({
      question: z.string().optional(),
      options: z.array(persistedClarificationOptionSchema).optional(),
    })
    .optional(),
  // #2679 — une précision posée en texte se clique aussi.
  //
  // Un champ FRÈRE de `clarification`, et non son extension : trois lecteurs
  // indépendants déduisent un ÉTAT de la seule PRÉSENCE de `clarification` — la
  // borne « une clarification par fil » (`Chat.tsx`, `clarificationAsked`),
  // l'exonération du plafond du copilote (`chat-quota.ts`, gardée par GA-90) et
  // l'estampille `quota_exempt_at`. Ranger ici la question posée DANS le texte
  // les aurait tous les trois déclenchés par effet de bord, alors qu'elle ne
  // coûte ni un tour de modèle ni la carte du fil — et
  // `doctrine-registry.ts` refuse nommément d'élargir cette exonération
  // « en passant ».
  //
  // Une précision par entrée (au plus trois, comme le prompt l'autorise), ses
  // réponses possibles dans `options`. Champ absent = aucune option : l'écran
  // ne rend alors AUCUN bouton.
  reply_options: z
    .array(
      z.object({
        question: z.string().optional(),
        options: z.array(persistedClarificationOptionSchema).optional(),
      }),
    )
    .optional(),
  // #1950.4 / .7 / .12 / .13 — le résumé du plan NOMMÉ par Laura (outil
  // silencieux `describe_plan`) : objectif, résultats attendus, données
  // manquantes, ce qui ne sera pas fait. Une liste absente = rien à dire ;
  // sans objectif, le résumé n'est pas gardé. Jamais de durée (#1950.10).
  plan_brief: planBriefSchema.optional().catch(undefined),
  // #3758 (BEL-LAU-1001) — la famille de réponse du tour et ce qu'il a réellement
  // rendu (`structured` | `text_fallback`), posés par `routers/chat.py`. Absent =
  // demande sans famille connue : texte libre, rien ne s'affiche.
  reply_family: replyFamilyContextSchema.optional().catch(undefined),
  // #2840 (#2441.13) — LE REPÈRE MACHINE D'UN TOUR QUI S'EST ARRÊTÉ AVANT LA
  // FIN, posé par `apps/ia/app/routers/chat.py` (`_partial_response`) sur
  // `context.partial`. `reason` vaut `turn_timeout` (délai dépassé) ou
  // `turn_error` (panne) — un rendu structuré le lit, il n'a rien à reparser
  // du texte de la réponse (qui porte déjà la phrase, en clair, dans les deux
  // langues d'interface). Absent = tour terminé normalement.
  partial: z.object({ reason: z.string(), as_of: z.string().nullish() }).optional(),
  // #2955 (#2394.57, décision Louis 28/09) — LES PARTICIPANTS D'UN FIL, vus par
  // `search_mailbox` pendant CE tour : l'ÉTAT DE CONVERSATION que
  // `ActionRouterService`/`MailboxService` relit avant de créer un brouillon
  // « en réponse » — jamais une nouvelle méthode de lecture de la messagerie,
  // jamais le CORPS d'un message (D65). `participants` reprend exactement
  // `counterpart` + `otherParticipants` de `MailThread` (déjà publics à
  // l'écran de messagerie) — jamais une donnée neuve. Absent = ce fil n'a été
  // vu par AUCUN message de cette conversation : « non mesuré », jamais confondu
  // avec « aucun destinataire connu ».
  mail_threads: z
    .array(z.object({ thread_id: z.string().min(1), participants: z.array(z.string()).min(1) }))
    .optional()
    .catch(undefined),
})

export type PersistedChatContext = z.infer<typeof persistedChatContextSchema>

/**
 * La SEULE porte : ce qui entre ressort réduit à la liste blanche, ou `null`.
 *
 * `null` couvre trois cas qui se rendent tous de la même façon à l'écran —
 * aucun panneau, c'est-à-dire le comportement d'avant ce lot : aucun contexte
 * (un tour tapé, une réponse scriptée de démonstration), un contexte illisible
 * (une forme que ce produit ne sait pas lire), un contexte trop lourd. Jamais
 * une erreur : un message ne se perd pas parce que son panneau n'a pas pu être
 * gardé.
 */
export function persistedChatContext(value: unknown): PersistedChatContext | null {
  const parsed = persistedChatContextSchema.safeParse(value)
  if (!parsed.success) return null
  const kept = parsed.data
  if (new TextEncoder().encode(JSON.stringify(kept)).length > PERSISTED_CHAT_CONTEXT_MAX_BYTES) return null
  return kept
}
