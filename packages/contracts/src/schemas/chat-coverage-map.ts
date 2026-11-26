import { z } from 'zod'

/* ------------------------------------------------------------------------ */
/*  #2308 (LAU-FINAL-049) — la carte de couverture du CHAT et ses TROUS.     */
/*                                                                          */
/*  Prior art réutilisé, jamais réinventé (GA-26) : `coverage.ts` porte     */
/*  déjà une matrice famille (domaine métier) × niveau (hiérarchie) pour    */
/*  l'écran Compte. CE fichier porte TROIS axes DIFFÉRENTS, demandés par    */
/*  #2308 pour le chat : le PÉRIMÈTRE (groupe/filiale/BU/direction/         */
/*  programme/site), la FAMILLE DE RÔLE D'ACHAT (buying-committee étendu)   */
/*  et l'ÉTAPE COMMERCIALE. Les deux jeux d'axes coexistent, ne se          */
/*  fusionnent jamais, et ce fichier ne touche pas `coverage.ts`.           */
/*                                                                          */
/*  Doctrine qui commande tout le fichier — GA-259 : « un taux de          */
/*  couverture mesure ce qu'on SAIT, jamais ce que le marché FAIT ». Trois  */
/*  corollaires câblés ci-dessous, pas seulement écrits en commentaire :    */
/*   · GA-18/GA-19 : « non mesuré » n'est JAMAIS un zéro — un axe non       */
/*     évaluable (`unknown`) sort du DÉNOMINATEUR (`coverageRatio`).        */
/*   · #2308.32 : un signal purement Market Memory ne fait JAMAIS passer un */
/*     axe à un état COUVERT (`capStateForSources`).                       */
/*   · #2308.43 : un gap qui n'est pas prioritaire ne produit JAMAIS        */
/*     d'action suggérée qui coûte un geste commercial (`suggestGapAction`) */
/*     — SAUF `enrichissement` (#2308.39, corrigé 23/09/2026) : une         */
/*     recherche automatisée, jamais une sollicitation, donc jamais gatée.  */
/* ------------------------------------------------------------------------ */

/** #2308.1-6 — le périmètre visé par une cellule de la carte. `groupe` et
 *  `filiale` sont déjà couverts ailleurs (compte = groupe, `contact.entity` =
 *  filiale) ; `bu`/`direction`/`programme`/`site` sont les quatre types
 *  absents mesurés le 18/09/2026. */
export const chatCoveragePerimeterTypeSchema = z.enum(['groupe', 'filiale', 'bu', 'direction', 'programme', 'site'])
export type ChatCoveragePerimeterType = z.infer<typeof chatCoveragePerimeterTypeSchema>

export const ALL_CHAT_COVERAGE_PERIMETER_TYPES: readonly ChatCoveragePerimeterType[] =
  chatCoveragePerimeterTypeSchema.options

export const CHAT_COVERAGE_PERIMETER_LABELS: Record<ChatCoveragePerimeterType, string> = {
  groupe: 'Groupe',
  filiale: 'Filiale',
  bu: 'Business Unit',
  direction: 'Direction',
  programme: 'Programme',
  site: 'Site',
}

/** #2308.7-16 — la famille de rôle D'ACHAT, distincte de la famille de
 *  DOMAINE (`BuyerRoleFamilyKey`, coverage.ts) et du rôle canonique à 8
 *  valeurs de `buying_committee.py` (« sourced, not invented » — le pack ne
 *  nomme QUE ces 8 rôles). Les six premières valeurs reprennent ce que
 *  `contacts.decision_role` sait déjà classer (sponsor/champion → `sponsor`,
 *  economic → `decideur_economique`, technical → `referent_technique`,
 *  user → `utilisateur`, procurement → `achats`, influencer → `relais`).
 *  Les quatre dernières sont NOUVELLES (mesurées absentes le 18/09/2026) et
 *  se dérivent de signaux RÉELS déjà stockés, jamais d'un rôle inventé :
 *   · `operationnel`/`manager` : niveau N-2 (relais opérationnel du pack) +
 *     un mot-clé de management dans le titre — jamais deviné sans titre.
 *   · `securite_conformite` : famille de DOMAINE `cyber` déjà classée
 *     (`resolveFamily`), réutilisée comme rôle plutôt que redupliquée.
 *   · `partenaire` : AUCUN signal contact aujourd'hui — les partenaires sont
 *     un module externe (`apps/api/src/modules/partners`), jamais un rôle
 *     interne de comité d'achat. Reste `unknown` par construction : c'est un
 *     TROU nommé, pas une case cochée par ressemblance. */
export const chatCoverageRoleFamilySchema = z.enum([
  'sponsor',
  'decideur_economique',
  'referent_technique',
  'utilisateur',
  'achats',
  'relais',
  'operationnel',
  'manager',
  'securite_conformite',
  'partenaire',
])
export type ChatCoverageRoleFamily = z.infer<typeof chatCoverageRoleFamilySchema>

export const ALL_CHAT_COVERAGE_ROLE_FAMILIES: readonly ChatCoverageRoleFamily[] = chatCoverageRoleFamilySchema.options

export const CHAT_COVERAGE_ROLE_FAMILY_LABELS: Record<ChatCoverageRoleFamily, string> = {
  sponsor: 'Sponsor',
  decideur_economique: 'Décideur économique',
  referent_technique: 'Référent technique',
  utilisateur: 'Utilisateur',
  achats: 'Achats',
  relais: 'Relais',
  operationnel: 'Opérationnel',
  manager: 'Manager',
  securite_conformite: 'Sécurité / conformité',
  partenaire: 'Partenaire',
}

/** #2308.17-24 — l'étape commerciale. Axe absent de `coverage.ts` (qui ne
 *  porte que famille × niveau) : mesuré absent le 18/09/2026. Chaque valeur
 *  n'est déclarée COUVERTE que sur un signal réel (`relation` ←
 *  `accounts.commercial_status`, `sponsor_identifie` ← couverture du rôle
 *  `sponsor` ci-dessus) ; les autres restent `unknown` tant qu'aucun signal
 *  n'est câblé — un TROU nommé, jamais une case inventée. */
export const chatCoverageSalesStageSchema = z.enum([
  'terrain_compris',
  'probleme_qualifie',
  'sponsor_identifie',
  'budget_confirme',
  'decision',
  'achat',
  'relation',
  'prochaine_action',
])
export type ChatCoverageSalesStage = z.infer<typeof chatCoverageSalesStageSchema>

export const ALL_CHAT_COVERAGE_SALES_STAGES: readonly ChatCoverageSalesStage[] = chatCoverageSalesStageSchema.options

export const CHAT_COVERAGE_SALES_STAGE_LABELS: Record<ChatCoverageSalesStage, string> = {
  terrain_compris: 'Terrain compris',
  probleme_qualifie: 'Problème qualifié',
  sponsor_identifie: 'Sponsor identifié',
  budget_confirme: 'Budget confirmé',
  decision: 'Décision',
  achat: 'Achat',
  relation: 'Relation',
  prochaine_action: 'Prochaine action',
}

/** #2308.25-31 — l'état d'une cellule. `missing` (2308.29) et `not_relevant`
 *  (2308.30) existaient déjà comme `covered: false` / `is_target: false` sur
 *  `coverage.ts` ; les cinq autres sont NOUVEAUX : `covered_verified` /
 *  `covered_stale` distinguent la fraîcheur (18 mois, même horizon que
 *  `coverage.service.ts::FRESHNESS_HORIZON_MS`, GA-26) ; `partial` porte une
 *  couverture incomplète ; `to_verify` et `unknown` distinguent « on a un
 *  signal faible » de « on n'a RIEN observé » — jamais confondus avec
 *  `missing`, qui affirme à tort qu'on SAIT que c'est vide. */
export const chatCoverageStateSchema = z.enum([
  'covered_verified',
  'covered_stale',
  'partial',
  'to_verify',
  'missing',
  'not_relevant',
  'unknown',
])
export type ChatCoverageState = z.infer<typeof chatCoverageStateSchema>

export const CHAT_COVERAGE_STATE_LABELS: Record<ChatCoverageState, string> = {
  covered_verified: 'Couvert et vérifié',
  covered_stale: 'Couvert mais ancien',
  partial: 'Partiellement couvert',
  to_verify: 'À vérifier',
  missing: 'Manquant',
  not_relevant: 'Non pertinent',
  unknown: 'Inconnu',
}

/** Les états qui comptent comme « on a quelque chose ». N'inclut jamais
 *  `unknown` : un axe non observé n'est pas une demi-couverture. */
const COVERED_STATES: readonly ChatCoverageState[] = ['covered_verified', 'covered_stale', 'partial']

/** #2308.33-36 — la catégorie de priorité d'un gap, nommée (au lieu du seul
 *  `priority: number` de `coverageGapSchema`). */
export const chatCoverageGapPriorityCategorySchema = z.enum([
  'bloque_action',
  'bloque_etape_suivante',
  'ameliore_confiance',
  'information_secondaire',
])
export type ChatCoverageGapPriorityCategory = z.infer<typeof chatCoverageGapPriorityCategorySchema>

export const CHAT_COVERAGE_GAP_PRIORITY_LABELS: Record<ChatCoverageGapPriorityCategory, string> = {
  bloque_action: "Bloque l'action",
  bloque_etape_suivante: "Bloque l'étape suivante",
  ameliore_confiance: 'Améliore la confiance',
  information_secondaire: 'Information secondaire',
}

/** #2308.43 — SEULES ces deux catégories sont « prioritaires ». Une catégorie
 *  hors de cette liste ne produit JAMAIS d'action suggérée qui coûte un geste
 *  commercial (`suggestGapAction`) — sauf `enrichissement` (#2308.39), qui
 *  n'en coûte aucun. */
export const PRIORITY_GAP_CATEGORIES: readonly ChatCoverageGapPriorityCategory[] = [
  'bloque_action',
  'bloque_etape_suivante',
]

/** #2308.37-42 — le type d'action produite pour un gap prioritaire.
 *  `recherche_ciblee` existait déjà (`coverageGapSchema.suggested_titles`) ;
 *  les cinq autres sont NOUVELLES. */
export const chatCoverageGapActionKindSchema = z.enum([
  'recherche_ciblee',
  'question_contact',
  'enrichissement',
  'import_crm',
  'verification',
  'demande_equipe',
])
export type ChatCoverageGapActionKind = z.infer<typeof chatCoverageGapActionKindSchema>

export const CHAT_COVERAGE_GAP_ACTION_LABELS: Record<ChatCoverageGapActionKind, string> = {
  recherche_ciblee: 'Recherche ciblée',
  question_contact: 'Question à un contact',
  enrichissement: 'Enrichissement',
  import_crm: 'Import CRM',
  verification: 'Vérification',
  demande_equipe: "Demande à l'équipe",
}

/** #2308.32 — d'où vient le signal qui a produit un état. `market_memory`
 *  seul ne peut jamais couvrir un axe (`capStateForSources`) ; il ne fait que
 *  motiver un `to_verify` (« on a un indice tiers, pas une preuve interne »). */
export const chatCoverageSignalSourceSchema = z.enum(['account_contact', 'market_memory'])
export type ChatCoverageSignalSource = z.infer<typeof chatCoverageSignalSourceSchema>

/**
 * #2308.32 (règle Market Memory) — plafonne un état candidat selon SES
 * sources : sans preuve directe (`account_contact`), un état « couvert »
 * (`covered_verified`/`covered_stale`/`partial`) ne se maintient jamais.
 *
 * Doctrine GA-259 : un signal de mémoire marché est une OBSERVATION tierce,
 * jamais une preuve sur CE compte. Le traduire en « couvert » ferait
 * exactement la faute que GA-259 nomme — un fait de marché pris pour un fait
 * de compte. Avec un indice Market Memory seul, le mieux qu'on affirme est
 * « à vérifier » ; sans AUCUNE source, l'état retombe à `unknown` — un état
 * « couvert » ne peut jamais flotter sans preuve qui le porte.
 */
export function capStateForSources(
  state: ChatCoverageState,
  sources: readonly ChatCoverageSignalSource[],
): ChatCoverageState {
  if (!COVERED_STATES.includes(state)) return state
  if (sources.includes('account_contact')) return state
  if (sources.includes('market_memory')) return 'to_verify'
  return 'unknown'
}

/** Horizon de fraîcheur — même valeur que `coverage.service.ts::FRESHNESS_HORIZON_MS`
 *  (GA-26 : un réglage vit à un seul endroit ; recopié en constante partagée
 *  plutôt qu'importé parce que les deux modules vivent dans des packages
 *  distincts sans dépendance directe l'un vers l'autre). */
export const DEFAULT_CHAT_COVERAGE_FRESHNESS_HORIZON_MS = 18 * 30 * 24 * 60 * 60 * 1000

/**
 * #2308.25-28/31 — dérive l'état d'une cellule à partir de preuves CONTACT
 * réelles (jamais une supposition) : combien de contacts y tombent, et la
 * date de mise à jour la plus récente parmi eux.
 *
 * `contactCount <= 0` ⇒ `unknown`, jamais `missing` : l'absence de contact ne
 * prouve pas l'absence de la case (GA-259 — ne pas confondre absence de
 * DONNÉE et absence de FAIT). `missing` reste réservé aux cas où une
 * cartographie EXTERNE affirme que la case existe (ex. une entité connue sans
 * aucun contact) — hors du périmètre de cette fonction.
 */
export function deriveContactState(input: {
  contactCount: number
  freshestUpdatedAtMs: number | null
  nowMs?: number
  freshnessHorizonMs?: number
}): ChatCoverageState {
  if (input.contactCount <= 0) return 'unknown'
  if (input.freshestUpdatedAtMs == null) return 'to_verify'
  const now = input.nowMs ?? Date.now()
  const horizon = input.freshnessHorizonMs ?? DEFAULT_CHAT_COVERAGE_FRESHNESS_HORIZON_MS
  return now - input.freshestUpdatedAtMs <= horizon ? 'covered_verified' : 'covered_stale'
}

/**
 * #2308.43 — ne produit une action que si la catégorie est PRIORITAIRE
 * (`PRIORITY_GAP_CATEGORIES`). `ameliore_confiance` et `information_secondaire`
 * rendent `null` pour les CINQ actions qui dépensent un geste commercial
 * (`recherche_ciblee`, `question_contact`, `import_crm`, `verification`,
 * `demande_equipe`) : suggérer l'une d'elles sur un gap non prioritaire
 * ferait dépenser ce geste sur ce qui compte le moins.
 *
 * #2308.39 (corrigé 23/09/2026, réfuté sur la prod 7e7105fb7) — `enrichissement`
 * seule sort du gate : c'est une recherche AUTOMATISÉE (aucune sollicitation
 * d'un contact, aucun geste commercial dépensé), jamais bloquée par la
 * priorité du gap qui la porte. Avant ce correctif elle était la SEULE
 * action attachée à `ameliore_confiance` (`GapRule` groupe/filiale/relation,
 * apps/api/src/modules/coverage-gaps/chat-coverage-map.ts) : le gate la
 * rendait donc INATTEIGNABLE — du code juste, jamais atteint. Le tri des
 * gaps (`GAP_CATEGORY_RANK`) n'en est pas changé : `ameliore_confiance` reste
 * après les deux catégories bloquantes.
 */
export function suggestGapAction(
  category: ChatCoverageGapPriorityCategory,
  preferredAction: ChatCoverageGapActionKind,
): ChatCoverageGapActionKind | null {
  if (PRIORITY_GAP_CATEGORIES.includes(category)) return preferredAction
  return preferredAction === 'enrichissement' ? preferredAction : null
}

/**
 * GA-18/GA-19 — le ratio couvert/mesurable d'un jeu d'états, EXCLUANT
 * `unknown` du dénominateur. `null` quand rien n'est mesurable : jamais un
 * `0/0` ou un faux `0 %`, qui se lirait « rien n'est couvert » alors que la
 * vérité est « on n'a rien observé ».
 */
export function coverageRatio(states: readonly ChatCoverageState[]): { covered: number; measurable: number } | null {
  const measurable = states.filter(state => state !== 'unknown')
  if (measurable.length === 0) return null
  const covered = measurable.filter(state => COVERED_STATES.includes(state)).length
  return { covered, measurable: measurable.length }
}

/* ------------------------------------------------------------------------ */
/*  La réponse assemblée — un score n'est jamais nu (doctrine) : les trois   */
/*  axes sont TOUJOURS présents en entier (10 familles, 6 périmètres, 8      */
/*  étapes), même quand leur état est `unknown`. Les GAPS, eux, forment une  */
/*  LISTE : une absence n'y fait aucune ligne (doctrine « on n'affiche pas   */
/*  ce qu'on n'a pas »).                                                    */
/* ------------------------------------------------------------------------ */

export const chatCoverageRoleFamilyStatusSchema = z.object({
  role_family: chatCoverageRoleFamilySchema,
  label: z.string(),
  state: chatCoverageStateSchema,
  contact_count: z.number().int(),
})
export type ChatCoverageRoleFamilyStatus = z.infer<typeof chatCoverageRoleFamilyStatusSchema>

export const chatCoveragePerimeterStatusSchema = z.object({
  perimeter_type: chatCoveragePerimeterTypeSchema,
  label: z.string(),
  state: chatCoverageStateSchema,
  contact_count: z.number().int(),
  /** Libellés d'entité tels que portés par les contacts (jamais réécrits),
   *  classés à ce type de périmètre. Vide si aucun contact n'y est classé. */
  entity_names: z.array(z.string()),
})
export type ChatCoveragePerimeterStatus = z.infer<typeof chatCoveragePerimeterStatusSchema>

export const chatCoverageSalesStageStatusSchema = z.object({
  sales_stage: chatCoverageSalesStageSchema,
  label: z.string(),
  state: chatCoverageStateSchema,
  /** Pourquoi cet état — `null` seulement pour `unknown` (rien à motiver). */
  reason: z.string().nullable(),
})
export type ChatCoverageSalesStageStatus = z.infer<typeof chatCoverageSalesStageStatusSchema>

export const chatCoverageGapSchema = z.object({
  id: z.string(),
  axis: z.enum(['role_family', 'perimeter', 'sales_stage']),
  /** La valeur de l'axe (ex. `'partenaire'`, `'bu'`, `'budget_confirme'`). */
  key: z.string(),
  label: z.string(),
  reason: z.string(),
  state: chatCoverageStateSchema,
  priority_category: chatCoverageGapPriorityCategorySchema,
  /** `null` quand la catégorie n'est pas prioritaire ET que l'action en
   *  coûterait un (#2308.43) — sauf `enrichissement`, jamais gatée (#2308.39). */
  suggested_action: chatCoverageGapActionKindSchema.nullable(),
})
export type ChatCoverageGap = z.infer<typeof chatCoverageGapSchema>

export const chatCoverageMapResponseSchema = z.object({
  account_id: z.string().guid(),
  generated_at: z.string(),
  /** Phrase POSITIVE (GA-259) : ce que la carte affirme savoir, jamais un
   *  fait de marché ni une négation qui deviendrait une affirmation au
   *  remaniement suivant. */
  meaning: z.string(),
  role_families: z.array(chatCoverageRoleFamilyStatusSchema),
  perimeters: z.array(chatCoveragePerimeterStatusSchema),
  sales_stages: z.array(chatCoverageSalesStageStatusSchema),
  gaps: z.array(chatCoverageGapSchema),
})
export type ChatCoverageMapResponse = z.infer<typeof chatCoverageMapResponseSchema>
