import { z } from 'zod'

/**
 * Typed payload of the Classifier agent (Phase 3) — TypeScript mirror of
 * `apps/ia/app/models/classified_data.py`.
 *
 * Convention: every key is camelCase and English. Permissive sub-objects
 * (`.passthrough()`) so the Pydantic models can add typed fields without
 * breaking the TS consumers; tightening the inner shapes is a separate
 * ticket once consumers stabilise their needs.
 *
 * ⚠️ Wire-format drift: the Python prompt + Pydantic still emit two legacy
 * keys: `approach_order` (snake_case, alias for `approachOrder`) and
 * `organigramme` (French, alias for `orgChart`). The `.passthrough()` lets
 * the payload parse but TS consumers must read those via the legacy keys
 * until the prompt + aliases are renamed in a follow-up ticket.
 */

const _passThroughObject = z.object({}).passthrough()
const _passThroughArrayOfObjects = z.array(_passThroughObject).optional()

/**
 * Les paliers d'organisation. `achats` et `unknown` sont en FIN de liste (GA-08) ;
 * l'ORDRE d'évaluation vit dans `HIERARCHY_PATTERNS`, pas ici.
 *
 * ⚠️ Les deux valeurs ont été ajoutées le 25/08 parce que ce « miroir » de
 * `hierarchy_level.py` avait cessé d'en être un : côté IA « Directeur des Achats »
 * vaut `achats` (8 points de séniorité), ici il valait `direction` (12). Le même
 * contact portait donc deux séniorités selon l'endroit qui le regardait — et le
 * commentaire de la fonction affirmait le contraire, ce qui est la pire des deux
 * situations. `unknown` est l'autre moitié : un titre sans une seule lettre n'est
 * pas « opérationnel », il est illisible.
 */
export const HIERARCHY_LEVELS = [
  'governance',
  'c_level',
  'direction',
  'management',
  'expert',
  'operationnel',
  'achats',
  'unknown',
] as const
export type HierarchyLevel = (typeof HIERARCHY_LEVELS)[number]

export const enrichedContactSchema = z
  .object({
    fullName: z.string().optional(),
    title: z.string().optional(),
    entity: z.string().optional(),
    role: z.string().optional(),
    priority: z.number().int().min(0).max(5).optional(),
    summary: z.string().optional(),
    whyContact: z.string().optional(),
    linkedinUrl: z.string().optional(),
    reportingTo: z.string().optional(),
    influenceLevel: z.string().optional(),
    bestApproach: z.string().optional(),
    personalizedHook: z.string().optional(),
    // Decider psychology (deck / ORION): career levers (orient the pitch to
    // their interest) + implicit organisational fears (to defuse, not exploit).
    careerLevers: z.array(z.string()).optional(),
    implicitFears: z.array(z.string()).optional(),
    connectionPath: z.string().optional(),
    source: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    emailVerified: z.boolean().optional(),
    // Deterministic triage bucket computed by the IA (always present on fresh
    // analyses): decideur | sponsor | operationnel | influenceur | a_verifier | bruit.
    bucket: z.enum(['decideur', 'sponsor', 'operationnel', 'influenceur', 'a_verifier', 'bruit']).optional(),
    // Palier org, dérivé du titre (axe distinct de role/influenceLevel).
    // ⚠️ Référence `HIERARCHY_LEVELS` et ne recopie PAS ses valeurs : c'était la
    // TROISIÈME liste des mêmes paliers (la constante, cette ligne, le JSON
    // Schema publié). Les trois s'accordaient entre elles et divergeaient toutes
    // de `hierarchy_level.py`, qui en a sept — le test de parité comparait deux
    // copies du même oubli.
    hierarchyLevel: z.enum(HIERARCHY_LEVELS).optional(),
    // S5 qualification status — a triage axis distinct from `bucket` (role) and
    // the CRM `userStatus`. Computed deterministically (see computeContactQualifStatus).
    // Keep in sync with CONTACT_QUALIF_STATUSES below (8 client statuses + 2 internal).
    qualifStatus: z
      .enum([
        'priorite_immediate',
        'a_enrichir',
        'a_verifier',
        'autre_angle',
        'achats',
        'sponsor',
        'bruit',
        'entite_inconnue',
        'hors_scope',
        'faux_positif',
      ])
      .optional(),
  })
  .passthrough()
export type EnrichedContact = z.infer<typeof enrichedContactSchema>

export const CONTACT_BUCKETS = ['decideur', 'sponsor', 'operationnel', 'influenceur', 'a_verifier', 'bruit'] as const
export type ContactBucketValue = (typeof CONTACT_BUCKETS)[number]

/**
 * Deterministic triage bucket for a contact — the single source of truth,
 * mirrored by the IA (`app/models/outputs/contacts.py::compute_contact_bucket`).
 * The IA emits `bucket` on fresh analyses; the front can also derive it from any
 * contact (title + role + influenceLevel) so it is never missing. Keeps Apollo's
 * wide net triageable: real deciders float up, thin rows → "à vérifier",
 * irrelevant rows → "bruit".
 */
export function computeContactBucket(c: {
  title?: string | null
  role?: string | null
  influenceLevel?: string | null
}): ContactBucketValue {
  // `role` uses the classifier's MEDDIC-ish vocabulary: economic | technical |
  // sponsor | champion | operational | user | purchasing | influencer | blocker.
  const t = (c.title ?? '').trim()
  const r = (c.role ?? '').trim().toLowerCase()
  const inf = (c.influenceLevel ?? '').trim().toLowerCase()
  if (!t) return 'bruit'
  // Exclusion ruleset (ACCOUNT MAPPING) — interns / apprentices are never a
  // buying-committee contact for an ESN.
  if (/\b(stagiaire|alternant|alternance|apprenti\w*|intern|internship|trainee|apprentice)\b/i.test(t)) return 'bruit'
  if (inf === 'decision-maker' || r === 'sponsor' || r === 'economic' || r === 'technical') return 'decideur'
  if (r === 'champion') return 'sponsor'
  if (r === 'influencer' || inf === 'influencer') return 'influenceur'
  if (r === 'operational' || r === 'user' || r === 'purchasing' || r === 'procurement' || inf === 'executor')
    return 'operationnel'
  return 'a_verifier'
}

// Les motifs, dans leur ORDRE d'évaluation — qui n'est PAS l'ordre de
// `HIERARCHY_LEVELS` (celui-là est figé par GA-08, les ajouts vont en fin).
// Miroir de `app/services/hierarchy_level.py`. First match wins (a "Senior Manager" reads
// as management, not expert; a "Président du conseil" reads as governance, not c_level).
const HIERARCHY_PATTERNS: Array<[HierarchyLevel, RegExp]> = [
  [
    // L0 governance — board / administrateur / conseil (narrow: exec president / PDG /
    // member of the *executive* board stays c_level; IT "Administrateur systèmes" stays ops).
    'governance',
    /conseil d['’]?\s*administration|conseil de surveillance|président(e)? du conseil|\bboard member\b|member of the board\b|\bboard of directors\b|non[- ]?exécutif|non[- ]?executive director|\bchair(man|woman)\b|\bcenseur\b|\badministrat(eur|rice)\b(?!\s*(syst|réseau|reseau|infra|sécur|secur|base|données|donnees|bdd|cloud|windows|linux|unix|office|salesforce|sap|azure|m365|\bad\b|\bit\b))/i,
  ],
  [
    'c_level',
    /\b(c[eftiomd]o|ciso|chief|p-?dg|dga?|directeur général|directrice générale|président|présidente|managing director|vp|vice[- ]?président|vice[- ]?president|comex|comité (exécutif|de direction)|directeur associé|directrice associée)\b/i,
  ],
  [
    // L5 achats — l'axe PARALLÈLE achats/contrôle. Évalué APRÈS c_level (un CISO
    // reste exécutif) et AVANT direction, sinon « Directeur des Achats » se lirait
    // « direction ». Même position et mêmes motifs que `_ACHATS_RE` côté IA.
    'achats',
    /\bachats?\b|\bprocurement\b|\bpurchasing\b|vendor\s+manage|\bsourcing\b|contr[ôo]le\s+de\s+gestion/i,
  ],
  ['direction', /\b(directeur|directrice|director|head of|dsi|rssi|daf|drh)\b/i],
  ['management', /\b(manager|responsable|chef de|team lead|lead|principal|superviseur)\b/i],
  ['expert', /\b(senior|expert|architecte|architect|staff|référent|sr\.?)\b/i],
]

/** Deterministic title → deck org tier. Unknown / junior titles → operationnel.
 *  Mirrors the IA `classify_hierarchy_level`. */
export function computeHierarchyLevel(title?: string | null): HierarchyLevel {
  const t = (title ?? '').trim()
  // Aucune lettre ⇒ aucun palier lisible. « — », « ? », « n/a » ne se classent
  // pas : les ranger « opérationnel » affirmait un rang que rien n'établit. Un
  // titre PRÉSENT qu'aucun motif ne reconnaît reste opérationnel — c'est son rang,
  // pas un trou de donnée.
  if (!t || !/[^\W\d_]/u.test(t)) return 'unknown'
  for (const [level, re] of HIERARCHY_PATTERNS) if (re.test(t)) return level
  return 'operationnel'
}

// ── Contact Priority Score /100 — the canonical 6-criteria grid from Théo's
// 03_BUSINESS_RULES §3 : rôle décisionnel /30 · proximité périmètre /20 ·
// hiérarchie /15 · accès/source /15 · fit angle /10 · fraîcheur /10. Deterministic
// (the LLM `priority` 1-5 stays as the contextual pick).
//
// COUVERTURE — proximité + fit-angle are the two criteria that need ACCOUNT context
// (the contact's perimeter tier / whether the title matches a priority angle). When
// that context is absent the criterion is `evaluated: false` and is excluded from
// BOTH the numerator AND the denominator: the score is then read over the criteria
// we could actually evaluate. Before, an absent context scored a "neutral middle"
// (10/20 + 5/10) — which both INVENTED a value ("half a perimeter fit") and cost a
// contact up to 15 points for information that is MISSING, dragging it below peers
// whose entity happened to resolve. A missing input must never read as a bad input.
// Absence that is a FACT about the row (no reachable channel, undetermined role)
// still scores 0 and stays evaluated — that is a real, collected negative.
//
// The score is DERIVED from an explainable breakdown (one entry per criterion,
// each carrying its points, its cap AND a proof tying the points to real data) —
// Théo P1 : « un score qui explique pourquoi ». `computeContactScore` = Σ(breakdown),
// so the number and its justification can never drift apart. Mirror of the IA
// canonical reference `apps/ia/app/services/contact_priority_score.py`.
const _ROLE_POWER: Record<string, number> = {
  economic: 30,
  sponsor: 30,
  technical: 28,
  champion: 24,
  user: 16,
  influencer: 14,
  procurement: 12,
  purchasing: 12,
  blocker: 8,
}
const _TIER_SENIORITY: Record<HierarchyLevel, number> = {
  // governance (L0 board) is top-tier like c_level — the seniority axis stays honest;
  // a board member is de-prioritised through its ROLE, never a faked-low rank.
  governance: 15,
  c_level: 15,
  direction: 12,
  management: 8,
  expert: 5,
  operationnel: 2,
  achats: 8, // fonction achats (L5) — séniorité comparable au management
  // Jamais lu : `_seniorityCriterion` déclare l'axe NON ÉVALUÉ avant d'y arriver.
  unknown: 0,
}
const _HIER_LABEL_FR: Record<HierarchyLevel, string> = {
  governance: 'Gouvernance / Board',
  c_level: 'C-level / COMEX',
  direction: 'Direction',
  management: 'Management',
  expert: 'Expert / Senior',
  operationnel: 'Opérationnel',
  achats: 'Achats / contrôle',
  unknown: 'Séniorité inconnue',
}
const _SOURCE_FRESHNESS: Record<string, number> = {
  apollo: 10,
  manual: 8,
  pappers: 7,
  brave_search: 5,
  ia_reconstruction: 3,
}
/**
 * Ce que la source APPORTE, jamais qui la vend.
 *
 * ⚠️ Ces libellés atteignent l'écran client BRUTS : `_freshnessCriterion` les
 * met dans `proof`, `ContactsService.scoreContacts` recalcule le breakdown à
 * chaque lecture de `GET /contacts`, et `ContactScoreBreakdown` rend
 * `{crit.proof}` tel quel sous le critère « Fraîcheur / activité ».
 *
 * Ils disaient « Apollo (annuaire vérifié) » et « registre public Pappers » —
 * deux noms d'éditeur sur la fiche contact, hors de Réglages › Intégrations qui
 * est la SEULE exception (l'utilisateur y autorise lui-même l'accès). La
 * doctrine du 02/08/2026 nomme la CAPACITÉ : le commercial a besoin de savoir
 * que la donnée vient d'un annuaire vérifié plutôt que d'une recherche web —
 * c'est ça qui justifie les 10 points —, pas de savoir lequel on paie.
 *
 * Aucune information n'est perdue : « annuaire professionnel vérifié » porte
 * exactement le signal de fraîcheur que « Apollo » portait.
 */
const _SOURCE_LABEL_FR: Record<string, string> = {
  apollo: 'annuaire professionnel vérifié',
  manual: 'saisie manuelle',
  pappers: 'registre public des entreprises',
  brave_search: 'recherche web',
  ia_reconstruction: 'reconstruction IA',
}
const _ROLE_LABEL_FR: Record<string, string> = {
  economic: 'décideur économique',
  sponsor: 'sponsor',
  technical: 'décideur technique',
  champion: 'champion probable',
  user: 'utilisateur',
  influencer: 'prescripteur',
  procurement: 'achats / procurement',
  purchasing: 'achats / procurement',
  blocker: 'gatekeeper',
}

// A seller-profile match lifts the contact's role toward the /30 cap (Drive §9 :
// « le rôle valorisé dépend du profil vendeur » — ESN cyber → RSSI mieux scoré).
const _ROLE_PRIORITY_BOOST = 6

/**
 * Seller-profile context (Drive §9) — the scoring is profile-aware: an ESN whose
 * expertise is cyber values a RSSI (technical) more than a generic ESN. Empty /
 * omitted → the score is neutral (identical to the profile-agnostic grid), so no
 * live score shifts unless a profile is actually supplied.
 */
export type SellerScoringContext = {
  /** Decision roles the seller's profile prioritises (e.g. cyber ESN → ['technical']). */
  priorityRoles?: readonly string[]
  /** Distinctive expertise/theme tokens (e.g. ['cyber', 'securite', 'rssi']). */
  focusThemes?: readonly string[]
}

/**
 * Lot 758 (CONTACTS 4/6) — arbitrage Louis 31/10/2026 : le score affiché est un score de
 * PERTINENCE — le rôle face à l'offre de l'ESN, le poids dans la décision, la fraîcheur du
 * poste — et ses axes sont NOMMÉS dessous. La CONTACTABILITÉ (e-mail, téléphone, profil) en
 * SORT : elle devient une pastille ({@link computeContactReachability}).
 *
 * Mesuré avant de trancher (appels Simon, Maeva, Janvier) : avec « Accessibilité / source »
 * /15 et une fraîcheur de provenance /10 dans le total, tout contact d'annuaire vérifié
 * démarrait à 25/25 sur ces deux axes ; les scores s'entassaient entre 80 et 85 et
 * mesuraient la joignabilité, pas la pertinence. Le poids libéré (15 points) va à l'offre
 * (10 → 25) : c'est l'axe qui distingue un Head of Data d'un chef de l'architecture pour
 * une ESN data (Julien).
 *
 * GA-08 (`enum-baseline.ts`) interdit de retirer ou de réordonner une clé : `accessibility`
 * reste donc NOMMÉE dans la taxonomie, déclarée hors score par
 * {@link CONTACT_SCORE_PASTILLE_CRITERIA} — le précédent est celui du classement
 * (`CONTACT_RANKING_TIE_BREAKER_AXES`, #2297.57). La clé `angleFit` est gardée ; son SENS
 * est désormais « rôle face à votre offre ». Σ(max des critères NOTÉS) = 100.
 */
export const CONTACT_SCORE_CRITERIA = [
  { key: 'role', max: 30 },
  { key: 'proximity', max: 20 },
  { key: 'seniority', max: 15 },
  { key: 'accessibility', max: 15 },
  { key: 'angleFit', max: 25 },
  { key: 'freshness', max: 10 },
] as const
export type ContactScoreCriterionKey = (typeof CONTACT_SCORE_CRITERIA)[number]['key']
/** Lot 758 — les critères qui se lisent en PASTILLE, jamais en points du score. */
export const CONTACT_SCORE_PASTILLE_CRITERIA = ['accessibility'] as const
const _PASTILLE_KEYS: ReadonlySet<string> = new Set(CONTACT_SCORE_PASTILLE_CRITERIA)
/** Les critères qui NOTENT, dans l'ordre de la taxonomie. */
type ScoredCriterionKey = Exclude<ContactScoreCriterionKey, (typeof CONTACT_SCORE_PASTILLE_CRITERIA)[number]>
const _SCORED_CRITERIA = CONTACT_SCORE_CRITERIA.filter(
  (c): c is Extract<(typeof CONTACT_SCORE_CRITERIA)[number], { key: ScoredCriterionKey }> => !_PASTILLE_KEYS.has(c.key),
)
export const CONTACT_SCORE_MAX = _SCORED_CRITERIA.reduce((s, c) => s + c.max, 0) // 100

/** One line of the explainable breakdown: points obtained, the cap, and a proof
 *  (FR) tying the points to a real signal — never an invented bonus. */
export type ContactScoreCriterion = {
  key: ContactScoreCriterionKey
  points: number
  max: number
  proof: string
  /** `false` when the criterion could NOT be evaluated (the account context it
   *  needs is absent). Such a criterion is excluded from the numerator AND the
   *  denominator — it must neither invent points nor cost any. `true` covers a
   *  real evaluated negative (0 pts because the signal is genuinely bad/absent). */
  evaluated: boolean
}

/** How much of the /100 grid could actually be evaluated for this contact:
 *  `evaluatedMax` = Σ caps of the evaluated criteria (the score's real denominator),
 *  `unevaluated` = the criteria we had no context for. A score read over 70 of the
 *  100 available points is a different claim from one read over 100 — the UI says so. */
export type ContactScoreCoverage = {
  evaluatedMax: number
  points: number
  unevaluated: ContactScoreCriterionKey[]
}

/** Coverage of a breakdown — the denominator the /100 is actually read over. */
export function contactScoreCoverage(breakdown: readonly ContactScoreCriterion[]): ContactScoreCoverage {
  const evaluated = breakdown.filter(x => x.evaluated)
  return {
    evaluatedMax: evaluated.reduce((s, x) => s + x.max, 0),
    points: evaluated.reduce((s, x) => s + x.points, 0),
    unevaluated: breakdown.filter(x => !x.evaluated).map(x => x.key),
  }
}

/** Criterion labels — FR + EN parity (the web renders FR; EN is ready for i18n). */
export const CONTACT_SCORE_CRITERION_LABELS_FR: Record<ContactScoreCriterionKey, string> = {
  role: 'Poids dans la décision',
  proximity: 'Proximité du périmètre',
  seniority: 'Niveau hiérarchique',
  accessibility: 'Joignable',
  angleFit: 'Rôle face à ton offre',
  freshness: 'Fraîcheur du poste',
}
export const CONTACT_SCORE_CRITERION_LABELS_EN: Record<ContactScoreCriterionKey, string> = {
  role: 'Weight in the decision',
  proximity: 'Perimeter proximity',
  seniority: 'Seniority level',
  accessibility: 'Reachable',
  angleFit: 'Role against your offer',
  freshness: 'Freshness of the position',
}

/** FR (default) / EN label for a score criterion. */
export function contactScoreCriterionLabel(key: ContactScoreCriterionKey, lang: 'fr' | 'en' = 'fr'): string {
  return (lang === 'en' ? CONTACT_SCORE_CRITERION_LABELS_EN : CONTACT_SCORE_CRITERION_LABELS_FR)[key]
}

type ContactScoreInput = {
  title?: string | null
  role?: string | null
  email?: string | null
  emailVerified?: boolean | null
  /** Lot 758 — lu par la seule pastille de joignabilité, jamais par le score. */
  phone?: string | null
  linkedinUrl?: string | null
  source?: string | null
  // Optional context (feeds proximité périmètre + fit angle):
  entityRelevance?: string | null // S2 gate: operating | noise | out_of_sector
  perimeterTier?: string | null // B.1: P1 | P2 | secondaire — the contact's entity zone
  angleMatch?: boolean | null // does the contact fit a priority angle?
  /** Apollo current-employer ≠ target (deck RISQUE): the person LEFT the company,
   *  so the row is STALE provenance — collapses fraîcheur (#20), not just qualif. */
  employerMismatch?: boolean | null
}

type ScoredCriterion = { points: number; proof: string; evaluated?: boolean }

/** Rôle décisionnel /30 — the buying power the role carries. A role the seller's
 *  profile prioritises is lifted toward the cap (Drive §9). Non-weighted / unknown
 *  role → 0 (documented absence, never an invented bonus). */
function _roleCriterion(c: ContactScoreInput, seller?: SellerScoringContext): ScoredCriterion {
  const role = (c.role ?? '').trim().toLowerCase()
  const base = _ROLE_POWER[role] ?? 0
  const prioritised = base > 0 && (seller?.priorityRoles ?? []).some(r => r.trim().toLowerCase() === role)
  const points = prioritised ? Math.min(30, base + _ROLE_PRIORITY_BOOST) : base
  const label = _ROLE_LABEL_FR[role]
  if (!label) return { points, proof: role ? `rôle « ${role} » non pondéré` : 'rôle non déterminé' }
  return { points, proof: points > base ? `${label} · priorisé par votre profil` : label }
}

/** Proximité périmètre /20 — how close the contact sits to an actionable zone. */
function _proximityCriterion(c: ContactScoreInput): ScoredCriterion {
  const tier = (c.perimeterTier ?? '').toString().toUpperCase()
  if (tier === 'P1') return { points: 20, proof: 'périmètre prioritaire (P1)' }
  if (tier === 'P2') return { points: 14, proof: 'périmètre P2' }
  if (tier === 'SECONDAIRE') return { points: 8, proof: 'périmètre secondaire' }
  const rel = (c.entityRelevance ?? '').toString().toLowerCase()
  if (rel === 'out_of_sector' || rel === 'noise') return { points: 0, proof: 'entité hors périmètre' }
  if (rel === 'operating') return { points: 10, proof: 'entité opérante' }
  // No cartography for this contact's entity → we know NOTHING about its perimeter.
  // Not evaluated: it neither earns the old invented 10/20 "neutral middle" nor
  // costs the contact 10 points for an account-level information gap.
  return { points: 0, proof: 'périmètre non rattaché', evaluated: false }
}

/** Niveau hiérarchique /15 — the org tier, from the title. */
function _seniorityCriterion(c: ContactScoreInput): ScoredCriterion {
  const tier = computeHierarchyLevel(c.title)
  // ⚠️ Sans titre exploitable, l'axe reste ÉVALUÉ à 0 — il ne sort PAS du
  // dénominateur. C'est la distinction que la grille tient partout ailleurs :
  // une absence qui est un FAIT SUR LA LIGNE est un zéro collecté, une absence
  // qui est un trou de connaissance sur le COMPTE sort du calcul.
  //
  // Mesuré avant de trancher : en le sortant du dénominateur, un contact SANS
  // titre marquait 45 quand le même contact intitulé « Analyste » marquait 39.
  // Ne pas connaître le métier de quelqu'un le faisait remonter — le
  // dénominateur rétrécit plus vite que le numérateur.
  //
  // Ce qui change : la PREUVE cesse d'afficher « Opérationnel » au-dessus de
  // quelqu'un dont personne n'a jamais vu le poste.
  if (tier === 'unknown') {
    return { points: 0, proof: 'titre inconnu — séniorité non établie' }
  }
  return { points: _TIER_SENIORITY[tier], proof: _HIER_LABEL_FR[tier] }
}

/**
 * Lot 758 — la JOIGNABILITÉ, sortie du score : une PASTILLE, jamais des points.
 * Le canal le plus sûr dont on dispose ; `null` quand aucun canal n'est connu (on
 * n'affiche pas ce qu'on n'a pas — aucune pastille « injoignable »).
 */
export const CONTACT_REACHABILITY_KINDS = ['verified_email', 'email', 'phone', 'professional_profile'] as const
export type ContactReachability = (typeof CONTACT_REACHABILITY_KINDS)[number]

export function computeContactReachability(
  c: Pick<ContactScoreInput, 'email' | 'emailVerified' | 'phone' | 'linkedinUrl'>,
): ContactReachability | null {
  const has = (v: string | null | undefined): boolean => typeof v === 'string' && v.trim().length > 0
  if (has(c.email) && c.emailVerified) return 'verified_email'
  if (has(c.email)) return 'email'
  if (has(c.phone)) return 'phone'
  if (has(c.linkedinUrl)) return 'professional_profile'
  return null
}

/** Points de joignabilité — NE servent qu'à {@link computeContactAccessibilityScore}
 *  (télémétrie opérateur), jamais au score affiché. */
const _REACH_POINTS: Record<ContactReachability, number> = {
  verified_email: 15,
  email: 10,
  phone: 10,
  professional_profile: 6,
}

/**
 * Lot 758 — familles de métier ÉQUIVALENTES pour l'axe « rôle face à votre offre » : un RSSI
 * ne partage aucun mot avec « cybersécurité », un Head of AI aucun avec « Data & IA ». Sans
 * elles, l'axe désormais évalué dans les deux sens aurait écrit « hors de ton offre » sous
 * un RSSI pour une ESN cyber. Bornées et nommées : aucun rapprochement deviné au-delà.
 * Jumeau : ``_OFFER_TOKEN_FAMILIES`` (`contact_priority_score.py`).
 */
const _OFFER_TOKEN_FAMILIES: readonly (readonly string[])[] = [
  ['cyber', 'cybersecurite', 'securite', 'rssi', 'ciso', 'soc'],
  ['data', 'donnees', 'cdo', 'bi'],
  ['ia', 'ai', 'ml', 'mlops'],
]

function _expandOfferTokens(tokens: Iterable<string>): Set<string> {
  const out = new Set(tokens)
  for (const family of _OFFER_TOKEN_FAMILIES) {
    if (family.some(t => out.has(t))) for (const t of family) out.add(t)
  }
  return out
}

/** Rôle face à ton offre /25 — le titre colle-t-il à l'angle recommandé, ou (Drive §9)
 *  à l'offre que l'ESN a déclarée ?
 *
 *  Lot 758 — quand l'offre de l'ESN est CONNUE, l'axe est ÉVALUÉ dans les deux sens : un
 *  titre qui ne la touche pas vaut 0, nommé « hors de ton offre ». Avant, il sortait du
 *  dénominateur comme s'il était inconnu : un chef de l'architecture lu sur trois axes
 *  pleins passait DEVANT un Head of Data lu sur quatre pour une ESN data (Julien). Une
 *  offre connue et un titre connu, c'est un fait mesuré, pas un trou. */
function _angleFitCriterion(c: ContactScoreInput, seller?: SellerScoringContext): ScoredCriterion {
  if (c.angleMatch === true) return { points: 25, proof: "colle à l'angle recommandé" }
  if (c.angleMatch !== false && seller?.focusThemes?.length) {
    const themeTokens = new Set<string>()
    for (const theme of seller.focusThemes) for (const t of _angleTokens(theme)) themeTokens.add(t)
    if (themeTokens.size > 0) {
      const offerTokens = _expandOfferTokens(themeTokens)
      const titleTokens = _expandOfferTokens(_angleTokens(c.title ?? ''))
      if ([...titleTokens].some(t => offerTokens.has(t))) {
        return { points: 25, proof: 'aligné à ton offre' }
      }
      if (!(c.title ?? '').trim()) return { points: 0, proof: 'titre inconnu — rôle face à l’offre non établi' }
      return { points: 0, proof: 'hors de ton offre' }
    }
  }
  if (c.angleMatch === false) return { points: 0, proof: 'hors des angles recommandés' }
  // No recommended angle to match against → nothing to evaluate. Excluded from the
  // denominator rather than scored an invented 5/10.
  return { points: 0, proof: 'angle non évalué', evaluated: false }
}

/** Fraîcheur/activité /10 — provenance freshness of the row. An Apollo row whose
 *  current employer ≠ the target (the person LEFT the company) is STALE, not
 *  fresh: it collapses to 1 whatever the source (#20). Otherwise fraîcheur was
 *  provenance-only and a périmé Apollo still scored a flat 10, propping up its
 *  /100 + accessibilité. */
function _freshnessCriterion(c: ContactScoreInput): ScoredCriterion {
  if (c.employerMismatch) return { points: 1, proof: 'employeur obsolète (a quitté la cible)' }
  const src = (c.source ?? '').trim().toLowerCase()
  const points = _SOURCE_FRESHNESS[src] ?? 5
  return { points, proof: _SOURCE_LABEL_FR[src] ?? 'source non précisée' }
}

// Generic angle words that don't discriminate a persona/theme — dropped so only
// distinctive terms (devops, data, cyber, cloud, sécurité…) drive the match.
const _ANGLE_STOPWORDS = new Set([
  'plateforme',
  'strategie',
  'compte',
  'groupe',
  'projet',
  'offre',
  'solution',
  'gestion',
  'systeme',
  'transformation',
  'digital',
  'digitale',
  'numerique',
  'metiers',
  'metier',
  'usine',
  'cross',
])

function _angleTokens(text: string): Set<string> {
  const out = new Set<string>()
  // Strip accents on the WHOLE string first (case preserved) so "Sécurité" stays
  // one token — splitting on [^a-zA-Z0-9] first would break it at the accent.
  const deaccented = (text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  for (const raw of deaccented.split(/[^a-zA-Z0-9]+/)) {
    if (!raw) continue
    const norm = raw.toLowerCase()
    // Keep distinctive words (>=4, non-stopword) OR short all-caps acronyms
    // (SAP, SOC, ERP, IAM, M365) — themes the strategy prompt emits, which the
    // old >=4 filter silently dropped so fit-angle never fired for them.
    if ((norm.length >= 4 && !_ANGLE_STOPWORDS.has(norm)) || /^[A-Z0-9]{2,5}$/.test(raw)) out.add(norm)
  }
  return out
}

/**
 * Fit angle — does the contact's title match a theme of the RECOMMENDED angles?
 * The signal Théo asks for ("ce contact colle à l'angle qu'on te conseille").
 * Boost-only: returns `true` when a distinctive angle-title token appears in the
 * contact's title, else `null` (neutral) — never `false`, so a strong decider
 * with a generic title is never penalised. `null` when there are no angles.
 * Uses the angle TITLE (stable); the persona field is dropped upstream (aliasing
 * bug across web/api — tracked separately), so it is intentionally not read here.
 */
/** Prebuilt union of distinctive tokens across the recommended angle titles —
 *  build ONCE per report, then match each contact with {@link computeAngleMatchFromTokens}
 *  (avoids re-tokenizing every angle for each of ~N contacts on the hot path). */
export function angleThemeTokens(angles: ReadonlyArray<{ title?: string | null }> | null | undefined): Set<string> {
  const set = new Set<string>()
  for (const a of angles ?? []) for (const t of _angleTokens(a?.title ?? '')) set.add(t)
  return set
}

/** Fit angle from a prebuilt theme-token set. `true` when the contact's title
 *  shares a theme token, else `null` (neutral — boost-only, never penalises). */
export function computeAngleMatchFromTokens(
  contact: { title?: string | null },
  themeTokens: Set<string>,
): boolean | null {
  if (themeTokens.size === 0) return null
  for (const t of _angleTokens(contact.title ?? '')) if (themeTokens.has(t)) return true
  return null
}

export function computeAngleMatch(
  contact: { title?: string | null },
  angles: ReadonlyArray<{ title?: string | null }> | null | undefined,
): boolean | null {
  if (!angles || angles.length === 0) return null
  return computeAngleMatchFromTokens(contact, angleThemeTokens(angles))
}

/**
 * The explainable /100 breakdown — one entry per criterion (03_BUSINESS_RULES §3),
 * each carrying its `points`, its `max` cap AND a `proof` tying the points to a real
 * signal (role / perimeter / title / source / angle). `seller` (Drive §9) makes the
 * grid profile-aware; omitted → the profile-agnostic grid (no live score shifts).
 * The order matches {@link CONTACT_SCORE_CRITERIA}.
 */
export function computeContactScoreBreakdown(
  c: ContactScoreInput,
  seller?: SellerScoringContext,
): ContactScoreCriterion[] {
  const scored: Record<ScoredCriterionKey, ScoredCriterion> = {
    role: _roleCriterion(c, seller),
    proximity: _proximityCriterion(c),
    seniority: _seniorityCriterion(c),
    angleFit: _angleFitCriterion(c, seller),
    freshness: _freshnessCriterion(c),
  }
  return _SCORED_CRITERIA.map(({ key, max }) => ({
    key,
    points: Math.max(0, Math.min(max, scored[key].points)),
    max,
    proof: scored[key].proof,
    evaluated: scored[key].evaluated !== false,
  }))
}

/** Project a breakdown onto /100 over the EVALUATED criteria only. With full
 *  coverage the denominator is 100, so the score is literally Σ(points) — the
 *  number and its justification still can't drift. With partial coverage the
 *  score answers "of what we could measure, how good is this contact", instead
 *  of docking points for an account-level information gap. */
function _normalizeCriteria(breakdown: ContactScoreCriterion[], keys: readonly ContactScoreCriterionKey[]): number {
  const inScope = breakdown.filter(x => keys.includes(x.key) && x.evaluated)
  const denominator = inScope.reduce((sum, x) => sum + x.max, 0)
  if (denominator === 0) return 0
  const points = inScope.reduce((sum, x) => sum + x.points, 0)
  return Math.max(0, Math.min(100, Math.round((points * 100) / denominator)))
}

const _ALL_SCORE_KEYS = _SCORED_CRITERIA.map(c => c.key)

/** Deterministic contact priority score /100 (03_BUSINESS_RULES §3) — Σ(points of
 *  the evaluated criteria) read over Σ(their caps). Fully-covered contact → exactly
 *  Σ(breakdown). Partially-covered → the same grid over its real denominator, which
 *  {@link contactScoreCoverage} exposes so the UI can state what the /100 covers. */
export function computeContactScore(c: ContactScoreInput, seller?: SellerScoringContext): number {
  return _normalizeCriteria(computeContactScoreBreakdown(c, seller), _ALL_SCORE_KEYS)
}

// ── S3b : split into two NAMED scores (Matteo: "séparer pertinence et accessibilité"):
//   - pertinence  = rôle (30) + offre (25) + proximité (20) + hiérarchie (15) → /90
//   - accessibilité = joignabilité (15) + fraîcheur (10) → /25 (télémétrie opérateur)
// Lot 758 — le score AFFICHÉ (`computeContactScore`) est désormais la pertinence plus la
// fraîcheur du poste ; la joignabilité n'y entre plus, elle reste lisible ici et en pastille.
const _RELEVANCE_KEYS: ContactScoreCriterionKey[] = ['role', 'proximity', 'seniority', 'angleFit']

/** Pertinence /100 — rôle + proximité + hiérarchie + fit angle. "Le bon profil pour ce sujet ?" */
export function computeContactRelevanceScore(c: ContactScoreInput, seller?: SellerScoringContext): number {
  return _normalizeCriteria(computeContactScoreBreakdown(c, seller), _RELEVANCE_KEYS)
}

/** Accessibilité /100 — reachability + source freshness. "Je peux l'atteindre ?"
 *  Both its criteria are always evaluable (a missing channel is a fact we
 *  collected, not a gap), so its denominator is always 25. */
export function computeContactAccessibilityScore(c: ContactScoreInput, seller?: SellerScoringContext): number {
  const reach = computeContactReachability(c)
  const freshness = computeContactScoreBreakdown(c, seller).find(x => x.key === 'freshness')?.points ?? 0
  return Math.round((((reach ? _REACH_POINTS[reach] : 0) + freshness) * 100) / 25)
}

// ── S5 : contact qualification status — a DIFFERENT axis from the role `bucket`
// and the CRM `userStatus`. Deterministic. The 8 statuses Théo asked for (retour
// Thales) : à contacter maintenant · à enrichir · à vérifier · autre angle ·
// achats · sponsor · bruit · entité inconnue. Plus 2 finer internal outcomes kept
// from S2 (hors_scope out-of-sector, faux_positif current-employer mismatch).
export const CONTACT_QUALIF_STATUSES = [
  'priorite_immediate', // à contacter maintenant
  'a_enrichir',
  'a_verifier',
  'autre_angle',
  'achats', // NEW — la porte achats (procurement)
  'sponsor', // NEW — relais interne / champion
  'bruit',
  'entite_inconnue', // NEW — contact réel mais BU/entité non résolue (base à re-cibler)
  'hors_scope',
  'faux_positif',
] as const
export type ContactQualifStatus = (typeof CONTACT_QUALIF_STATUSES)[number]

/** French labels for the front (retour Thales : un statut lisible par contact). */
export const CONTACT_QUALIF_LABELS: Record<ContactQualifStatus, string> = {
  priorite_immediate: 'À contacter maintenant',
  a_enrichir: 'À enrichir',
  a_verifier: 'À vérifier',
  autre_angle: 'Autre angle',
  achats: 'Achats',
  sponsor: 'Sponsor',
  bruit: 'Bruit',
  entite_inconnue: 'Entité inconnue',
  hors_scope: 'Hors périmètre',
  faux_positif: 'Faux positif',
}

export function contactQualifLabel(status: ContactQualifStatus): string {
  return CONTACT_QUALIF_LABELS[status] ?? status
}

type ContactQualifInput = ContactScoreInput & {
  influenceLevel?: string | null
  phone?: string | null
  entity?: string | null // BU / filiale — blank = "entité non précisée" (Thales)
  // entityRelevance + employerMismatch are inherited from ContactScoreInput
  // (employerMismatch now also collapses fraîcheur, so it lives on the base).
}

// Below this pertinence /100 a real-target contact is only "à vérifier" (provisoire).
const _RELEVANCE_TARGET_MIN = 45

// Entity values that mean "we don't know which BU this contact sits in".
const _UNKNOWN_ENTITY = new Set(['', 'non precise', 'non precisee', 'inconnu', 'inconnue', 'n/a', '-', '—'])

function _entityUnknown(entity?: string | null): boolean {
  const norm = (entity ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
  return _UNKNOWN_ENTITY.has(norm)
}

/** Deterministic qualification status for a contact (S5, 8 statuses + 2 internal). */
export function computeContactQualifStatus(c: ContactQualifInput): ContactQualifStatus {
  if (c.employerMismatch) return 'faux_positif'
  if (c.entityRelevance === 'out_of_sector' || c.entityRelevance === 'noise') return 'hors_scope'
  const role = (c.role ?? '').trim().toLowerCase()
  // Achats gate — a procurement contact is handled as a process role, not a
  // decision-maker (deck : la porte achats).
  if (role === 'procurement' || role === 'purchasing') return 'achats'
  const bucket = computeContactBucket(c)
  if (bucket === 'bruit') return 'bruit'
  // Internal supporter / champion — a sponsor to cultivate, distinct from a decider.
  if (bucket === 'sponsor') return 'sponsor'
  if (bucket === 'a_verifier') return 'a_verifier'
  if (bucket === 'influenceur') return 'autre_angle'
  // Real target, but we can't place them in the org yet — surface as a base to
  // re-target with a scoped search (Thales : 53 contacts « entité non précisée »).
  // Only when `entity` is explicitly supplied-and-blank (telemetry always sets the
  // key from the DB column); an omitted key means the caller doesn't track entity.
  if (c.entity !== undefined && _entityUnknown(c.entity)) return 'entite_inconnue'
  // decideur / operationnel = real targets.
  if (computeContactRelevanceScore(c) < _RELEVANCE_TARGET_MIN) return 'a_verifier'
  const accessible = Boolean(c.email || c.phone)
  return accessible ? 'priorite_immediate' : 'a_enrichir'
}

// ── Contact lifecycle state machine (Théo restitution p.11/p.15/p.16) ─────────
// détecté → identité vérifiée → qualifié → enrichi → actionnable. A first-name-only
// row is NOT actionnable ("si tu n'as qu'un prénom, affiche identité incomplète et
// bloque la génération d'action"). Pure + deterministic, like computeContactQualifStatus.
// This is the SINGLE canonical source the contacts KPIs + filters derive from — so
// "à enrichir" / "enrichis" are never ambiguous (Théo p.16).

// The détecté→actionnable LADDER (first 5), then the two TERMINAL / orthogonal states
// the annexe organigramme's contact state machine adds (p15): `historique` = ex-employé /
// capteur — vue réseau, PAS l'org actuel (dérivé du signal `employerMismatch`) ; `rejete`
// = écarté et JAMAIS réinjecté (dérivé d'un `rejected` explicite). They come LAST in the
// order (they are not ladder rungs), so existing indices stay stable. A state whose driving
// signal is absent simply never occurs — no fabricated value.
/** The 7 lifecycle states: the 5 ladder rungs (least → most advanced) then the 2 terminal
 *  states (historique / rejete). Drives KPI + filter order. */
export const CONTACT_LIFECYCLE_STATES = [
  'detecte',
  'identite_verifiee',
  'qualifie',
  'enrichi',
  'actionnable',
  'historique',
  'rejete',
] as const
export type ContactLifecycleState = (typeof CONTACT_LIFECYCLE_STATES)[number]

/** Zod enum over the 7 canonical states — the wire/validation face of
 *  {@link CONTACT_LIFECYCLE_STATES}, reused by the persisted-transition schemas
 *  (see `contactLifecycleTransitionSchema` in `contact.ts`). */
export const contactLifecycleStateSchema = z.enum(CONTACT_LIFECYCLE_STATES)

type ContactStateInput = ContactScoreInput & {
  fullName?: string | null
  phone?: string | null
  entity?: string | null
  /** Explicitly discarded contact — terminal, never re-injected (annexe p15 `rejete`). */
  rejected?: boolean | null
}

/** FR labels for the contact lifecycle state (customer-facing badge copy). */
export const CONTACT_LIFECYCLE_LABELS: Record<ContactLifecycleState, string> = {
  detecte: 'Détecté',
  identite_verifiee: 'Identité vérifiée',
  qualifie: 'Qualifié',
  enrichi: 'Enrichi',
  actionnable: 'Actionnable',
  historique: 'Historique',
  rejete: 'Rejeté',
}

/** FR label for a lifecycle state (mirror of {@link contactQualifLabel}). */
export function contactLifecycleLabel(state: ContactLifecycleState): string {
  return CONTACT_LIFECYCLE_LABELS[state] ?? state
}

// #2160.2 / #2160.37-40 / #2160.42-43 — l'ARTICULATION entre les mécanismes qui
// se ressemblent, écrite pour être lue (DÉCISION Louis 17/09/2026, QCM #2160.2 :
// « documenter la relation sans fusionner » — option B, moindre risque). Ce
// lifecycle-ci répond à UNE seule question : « à quel point cette fiche
// est-elle IDENTIFIÉE ? » (détecté → actionnable, + historique/rejete comme
// états terminaux). Trois autres mécanismes répondent chacun à une question
// différente — GA-26 (« un réglage vit à un seul endroit ») leur interdit
// d'être redupliqués ici sous un autre nom :
//   - « Engagé » / « Répondu » — questionnent la RELATION D'ÉCHANGE (a-t-on
//     contacté, a-t-on eu une réponse), pas l'identité : `contactStatusSchema`
//     (`contact.ts`) porte déjà `'contacted'` / `'replied'` / `'meeting'`.
//   - « Relation active » / « Dormant » (au niveau contact) — même axe,
//     `contactStatusSchema` porte déjà `'meeting'` (relation en cours) et
//     `'silence'` (dormant) ; `'dormant'` existe SÉPARÉMENT au niveau COMPTE
//     (`commercial_status`), un axe encore différent (portefeuille, pas fiche).
//   - « Coordonnée invalide » / « Opt-out » — questionnent la JOIGNABILITÉ, pas
//     l'identité : `ContactStopCard.tsx` porte déjà les raisons déclarables
//     `bounced` (coordonnée invalide) et `unsubscribed` (opt-out).
//   - Le changement de poste (ARCH-V1-036, #2160.2) — questionne un ÉVÉNEMENT
//     détecté en LOT, pas une position calculée à la lecture : la routine
//     `contactJobChange` (`routine-executors.ts:1111`, cas `'contact_job_change'`)
//     scanne le workspace périodiquement et notifie, elle ne dérive rien de
//     `computeContactLifecycleState`. Les deux restent DISJOINTS : le badge
//     RISQUE posé sur le compte d'origine par la routine et l'état `historique`
//     calculé ici décrivent le même fait (l'ex-employeur) depuis deux mécanismes
//     différents, jamais fusionnés — fusionner exigerait de faire dériver une
//     notification par lot d'un calcul à la lecture (ou l'inverse), un
//     changement d'architecture, pas une correction de lecture.
// Ajouter une septième valeur ici pour un concept déjà porté ailleurs
// dupliquerait un fait sous une autre forme (GA-26) — la correction, c'est ce
// commentaire, pas un huitième état.

const _STATE_KNOWN_ROLES = new Set([
  'economic',
  'technical',
  'user',
  'champion',
  'procurement',
  'purchasing',
  'influencer',
  'blocker',
  'sponsor',
])

function _nameTokenCount(name?: string | null): number {
  return (name ?? '').trim().split(/\s+/).filter(Boolean).length
}

/** Identity is complete when the person is truly identifiable: a full name (≥ 2
 *  tokens — not just a first name) AND at least one anchor (title, entity or
 *  LinkedIn). Théo: a prénom-seul contact is "identité incomplète" and must not
 *  produce a ready-to-send message. */
export function isContactIdentityComplete(c: ContactStateInput): boolean {
  const hasFullName = _nameTokenCount(c.fullName) >= 2
  const hasAnchor = Boolean((c.title ?? '').trim() || (c.entity ?? '').trim() || c.linkedinUrl)
  return hasFullName && hasAnchor
}

/** The contact's position in the détecté → actionnable ladder — the SINGLE
 *  canonical lifecycle computation the KPIs + filters derive from. */
export function computeContactLifecycleState(c: ContactStateInput): ContactLifecycleState {
  // Terminal states first — they override the ladder (annexe p15). A rejected contact
  // is out for good; an ex-employee (employerMismatch) is a network capteur, not the
  // current org, so it is NEVER shown as an actionable current-org contact — however
  // enriched its data. Both are dormant until their driving signal is supplied (the
  // ladder inputs alone never set them, so today's behaviour is unchanged).
  if (c.rejected) return 'rejete'
  if (c.employerMismatch) return 'historique'
  const identity = isContactIdentityComplete(c)
  const roleKnown = _STATE_KNOWN_ROLES.has((c.role ?? '').trim().toLowerCase())
  const reachable = Boolean(c.email || c.phone || c.linkedinUrl)
  const enriched = Boolean(c.email || c.phone)
  if (identity && roleKnown && reachable) return 'actionnable'
  if (identity && roleKnown) return 'qualifie'
  if (enriched) return 'enrichi'
  if (identity) return 'identite_verifiee'
  return 'detecte'
}

/** @deprecated Prefer {@link computeContactLifecycleState} — kept as an alias. */
export const computeContactState = computeContactLifecycleState

/** Can a message / action be generated for this contact? Requires a complete
 *  identity + a reachable channel — else the UI blocks generation (Théo P0). */
export function isContactActionnable(c: ContactStateInput): boolean {
  return computeContactLifecycleState(c) === 'actionnable'
}

/**
 * One-line "why this contact ranks here" — role · tier · contactability · source.
 *
 * ⚠️ EXCEPTION NOMMÉE ET BORNÉE — le seul endroit du dépôt où un nom de
 * fournisseur reste écrit dans un libellé, et c'est délibéré : cette ligne n'a
 * qu'un rendu, le back-office OPÉRATEUR (`apps/dashboard-manager`), où l'équipe
 * Bellum lit le rendement fournisseur par fournisseur pour décider quelle clé
 * paie. La doctrine dit « jamais de nom d'éditeur côté APP » ; ce n'est pas une
 * app cliente, et le commercial ne voit jamais cette chaîne.
 *
 * Ce que la fiche contact affiche, elle, passe par `_SOURCE_LABEL_FR` ci-dessus,
 * qui nomme la capacité. GA-44 (`no-vendor-names-in-app.test.ts`) tient la
 * borne : elle vérifie qu'aucun fichier d'`apps/web` n'importe cette fonction.
 * Le jour où un écran client l'appelle, la garde passe au rouge.
 */
export function computeContactPriorityReason(c: ContactScoreInput): string {
  const r = (c.role ?? '').trim().toLowerCase()
  const parts: string[] = []
  if (_ROLE_LABEL_FR[r]) parts.push(_ROLE_LABEL_FR[r])
  const tier = computeHierarchyLevel(c.title)
  if (tier !== 'operationnel') parts.push(tier.replace('_', '-'))
  if (c.email && c.emailVerified) parts.push('email vérifié')
  else if (c.email) parts.push('email dispo')
  else if (c.linkedinUrl) parts.push('LinkedIn')
  const src = (c.source ?? '').trim().toLowerCase()
  if (src === 'apollo') parts.push('Apollo')
  else if (src === 'pappers') parts.push('registre public')
  return parts.join(' · ')
}

export const classifiedDataSchema = z
  .object({
    contacts: z.array(enrichedContactSchema).optional(),
    orgChart: _passThroughArrayOfObjects,
    decisionChain: _passThroughObject.optional(),
    uncoveredZones: _passThroughArrayOfObjects,
    stakeholderMap: _passThroughArrayOfObjects,
    approachOrder: _passThroughArrayOfObjects,
  })
  .passthrough()
export type ClassifiedData = z.infer<typeof classifiedDataSchema>
