import { z } from 'zod'
import { decisionRoleSchema, type Contact } from './contact.js'
import { deaccentLower } from './buyer-role-families.js'
import type { AccountAnalysis } from './analysis/account-analysis.js'
import { planRiskSchema } from './analysis/plan.js'
import { RUNNING_MISSION_STATUSES } from './account-missions.js'
import {
  ACCOUNT_STRATEGY_5P_ELEMENT_STATUSES,
  accountStrategy5PElementStatusSchema,
  elementSchema,
  isElementGap,
  isElementKnown,
  knownElement,
  missingElement,
  type AccountStrategy5PElement,
  type AccountStrategy5PElementStatus,
} from './account-strategy-5p-elements.js'
import {
  PERSONAL_ACCESS_CERTAINTIES,
  partnerRegistrySourceKind,
  personalAccessCertainty,
  personalAccessFreshness,
  type PersonalAccessCertainty,
  type PersonalAccessFreshness,
} from './personal-access-path.js'

/** Réexporté pour BEL-SC-229 (#3258) et tout consommateur déjà branché sur
 *  `@bellum/contracts` — la définition vit maintenant dans
 *  `account-strategy-5p-elements.ts` (GA-26), rien ne change ici. */
export {
  ACCOUNT_STRATEGY_5P_ELEMENT_STATUSES,
  accountStrategy5PElementStatusSchema,
  // #3675 — l'écran lit « connu » avec la MÊME règle que le résumé (GA-26), jamais la sienne.
  isElementKnown,
  type AccountStrategy5PElement,
  type AccountStrategy5PElementStatus,
}

/**
 * BEL-SC-225 (#3254, P0) — L'OBJET CANONIQUE « STRATÉGIE DE COMPTE 5P ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE PROJECTION, PAS UN DEUXIÈME OBJET COMPTE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'instruction commune (#3249, règle 4) l'interdit explicitement : jamais un
 * deuxième score, une deuxième mémoire, un deuxième objet métier concurrent. Ce
 * fichier n'écrit RIEN et n'ajoute AUCUNE colonne, AUCUNE clé `raw_analysis` :
 * `deriveAccountStrategy5P` lit la maison canonique Compte qui existe déjà
 * (`AccountAnalysis` — `analysis/account-analysis.ts` — et les `Contact` du
 * compte, maison Contact) et PROJETTE cinq dimensions (Périmètre, Problème,
 * Personnes, Preuve, Passage) au-dessus. Un champ qui n'a aucune source
 * canonique aujourd'hui reste `missing` — jamais deviné (doctrine « jamais de
 * donnée fictive »).
 *
 * Maison canonique : le domaine Compte (`apps/api/src/modules/accounts`,
 * `AccountStrategy5PService`). Laura, Analyser, Contacts, Plans d'action et
 * Pilotage LISENT via ce même service — aucune copie locale.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE STATUT PAR ÉLÉMENT, PAS UN BOOLÉEN « CONNU / INCONNU »
 * ─────────────────────────────────────────────────────────────────────────────
 * Les sept statuts du ticket distinguent des absences de nature différente :
 * `verified` (confirmé par une source vérifiable — SIREN, registre) et
 * `observed` (vu dans la collecte, jamais confirmé par un tiers) ne se lisent
 * pas comme `inferred` (déduit) ni `user_supplied` (saisi par le commercial) ;
 * `stale` est un fait qui a existé mais dont la fraîcheur n'est plus garantie ;
 * `missing` est une case vide, honnêtement ; `not_applicable` sort l'axe du
 * dénominateur (GA-18/19 : « non mesuré » n'est jamais un zéro).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST DÉRIVÉ DANS CE LOT, ET CE QUI RESTE `missing`
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce lot dérive P1 (organigramme — `entities_exhaustive`, `entity_resolution`),
 * P2 (`pains`, `qualified_hypotheses`, `recent_signals`), P3 (les `Contact`
 * du compte, classés par `decision_role` — MEDDIC — jamais dupliqués : la
 * personne INSCRITE sont `contactId` + `name`, tout le reste se lit sur la
 * fiche Contact), et une partie de P4 (`risks`, LEVÉ de `AccountAnalysis`,
 * jamais recalculé — même discipline que `missing_po` dans
 * `account-billing-readiness.ts`). P5 (voie d'accès — réseau, partenaires,
 * anciens clients) et le reste de P4 (référence missionnaire, étude de cas,
 * benchmark…) n'ont AUJOURD'HUI aucune source canonique câblée sur le compte —
 * `partner-pipeline.ts` / `dormant-reactivation-score.ts` existent mais portent
 * une lecture PORTEFEUILLE, pas encore un verdict PAR COMPTE. Les champs
 * restent `missing`, honnêtement ; le branchement est l'épopée #3260 (BEL-SC-225,
 * suite).
 */

/* ───────────────────────── Confiance qualitative ───────────────────────── */

/**
 * Une confiance QUALITATIVE, jamais un pourcentage (doctrine c26 : aucune
 * probabilité affichée). Calculée depuis la PROPORTION d'éléments connus de
 * la dimension — jamais saisie, jamais renvoyée par un modèle.
 */
export const ACCOUNT_STRATEGY_5P_CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const
export const accountStrategy5PConfidenceSchema = z.enum(ACCOUNT_STRATEGY_5P_CONFIDENCE_LEVELS)
export type AccountStrategy5PConfidence = (typeof ACCOUNT_STRATEGY_5P_CONFIDENCE_LEVELS)[number]

function confidenceFromKnownRatio(knownCount: number, totalCount: number): AccountStrategy5PConfidence {
  if (totalCount === 0) return 'low'
  const ratio = knownCount / totalCount
  if (ratio >= 0.66) return 'high'
  if (ratio >= 0.33) return 'medium'
  return 'low'
}

/* ───────────────────────────── P1 — PERIMETER ───────────────────────────── */

export const accountStrategyPerimeterSchema = z.object({
  group: elementSchema(z.string()),
  parent_company: elementSchema(z.string()),
  subsidiary: elementSchema(z.string()),
  business_unit: elementSchema(z.string()),
  direction: elementSchema(z.string()),
  site: elementSchema(z.string()),
  team: elementSchema(z.string()),
  program: elementSchema(z.string()),
  project: elementSchema(z.string()),
  selected_scope: elementSchema(z.array(z.string())),
  excluded_scopes: elementSchema(z.array(z.string())),
  budget_scope: elementSchema(z.string()),
  confidence: accountStrategy5PConfidenceSchema,
})
export type AccountStrategyPerimeter = z.infer<typeof accountStrategyPerimeterSchema>

/* ────────────────────────────── P2 — PROBLEM ─────────────────────────────── */

export const accountStrategyProblemSchema = z.object({
  trigger: elementSchema(z.string()),
  operational_problem: elementSchema(z.string()),
  business_impact: elementSchema(z.string()),
  urgency: elementSchema(z.string()),
  current_status: elementSchema(z.string()),
  evidence: elementSchema(z.string()),
  hypothesis: elementSchema(z.string()),
  expiry: elementSchema(z.string()),
  confidence: accountStrategy5PConfidenceSchema,
})
export type AccountStrategyProblem = z.infer<typeof accountStrategyProblemSchema>

/* ─────────────────────────────── P3 — PEOPLE ─────────────────────────────── */

/** Une personne CITÉE, jamais dupliquée — la fiche vit sur `Contact`, ici on
 *  ne porte que la référence et le nom déjà résolu (même discipline que
 *  `owner` sur `contactSchema`). */
export const accountStrategyPersonRefSchema = z.object({
  contactId: z.string().guid(),
  name: z.string(),
})
export type AccountStrategyPersonRef = z.infer<typeof accountStrategyPersonRefSchema>

export const accountStrategyPeopleSchema = z.object({
  users: elementSchema(z.array(accountStrategyPersonRefSchema)),
  operational_relays: elementSchema(z.array(accountStrategyPersonRefSchema)),
  champions: elementSchema(z.array(accountStrategyPersonRefSchema)),
  technical_references: elementSchema(z.array(accountStrategyPersonRefSchema)),
  sponsors: elementSchema(z.array(accountStrategyPersonRefSchema)),
  economic_deciders: elementSchema(z.array(accountStrategyPersonRefSchema)),
  procurement: elementSchema(z.array(accountStrategyPersonRefSchema)),
  blockers: elementSchema(z.array(accountStrategyPersonRefSchema)),
  /**
   * #3261.15 (épopée #3293) — RH, une SOURCE DISTINCTE du titre (`Contact.title`),
   * jamais un huitième `decision_role` MEDDIC : la taxonomie `decisionRoleSchema`
   * alimente `missing_roles` ci-dessous ET le plan de relance
   * (`missing-roles-catchup.service.ts`, `org-enrichment-planner.ts`) — lui ajouter
   * une valeur aurait déclenché une recherche RH payante sur chaque compte qui n'en
   * a pas, une décision produit à part qu'aucune épopée n'a tranchée. Un contact
   * dont le TITRE porte un intitulé RH reconnu (`isHrTitle`) entre ici, quel que
   * soit son `decision_role` par ailleurs — les deux ne se recouvrent pas forcément
   * (un DRH membre du comex peut aussi être `champion`).
   */
  hr: elementSchema(z.array(accountStrategyPersonRefSchema)),
  known_relationships: elementSchema(z.array(accountStrategyPersonRefSchema)),
  /** Les rôles MEDDIC (`decisionRoleSchema`) qu'AUCUN contact du compte ne
   *  porte — un fait CALCULÉ (compter n'est pas deviner), jamais un texte
   *  généré. Vide = tous les rôles connus sont représentés. */
  missing_roles: elementSchema(z.array(decisionRoleSchema)),
  /** #4324.1 — quand le siège technique (DSI / RSSI) est vide, POURQUOI : rien d'IT collecté, ou de l'IT sans niveau direction. Absent = un titulaire est reconnu. */
  technical_gap: z
    .object({ reason: z.enum(['no_it_contact', 'it_below_director']), itContacts: z.number().int().nonnegative() })
    .optional(),
})
export type AccountStrategyPeople = z.infer<typeof accountStrategyPeopleSchema>

/* ──────────────────────────────── P4 — PROOF ─────────────────────────────── */

export const accountStrategyProofSchema = z.object({
  relevant_consultant: elementSchema(z.string()),
  comparable_reference: elementSchema(z.string()),
  mission_rex: elementSchema(z.string()),
  client_case: elementSchema(z.string()),
  artifact: elementSchema(z.string()),
  benchmark: elementSchema(z.string()),
  sector_knowledge: elementSchema(z.string()),
  relationship_proof: elementSchema(z.string()),
  /** LEVÉ de `AccountAnalysis.risks` (phase plan), jamais recalculé ici —
   *  même discipline que `missionsMissingPo` dans
   *  `account-billing-readiness.ts` : une deuxième lecture des mêmes risques
   *  divergerait le jour où l'une des deux apprend une exception. */
  risks: elementSchema(z.array(planRiskSchema)),
  missing_proof: elementSchema(z.boolean()),
  confidence: accountStrategy5PConfidenceSchema,
})
export type AccountStrategyProof = z.infer<typeof accountStrategyProofSchema>

/* ─────────────────────────────── P5 — PASSAGE ────────────────────────────── */

/**
 * #3667.R1 (reste de l'épopée #3777, #3667) — LE MÊME VOCABULAIRE QUE L'ONGLET
 * ACCÈS. Une ESN citée par la stratégie 5P portait sa propre échelle maison
 * (`declared`/`documented`/`observed_only`) pendant qu'Écosystème et Accès
 * portent déjà `personalAccessCertainty` (`personal-access-path.ts`, #3473) —
 * deux mots différents pour le MÊME fait, exactement ce que #3667 demande de
 * ne plus laisser arriver. Remplacée, pas doublée à côté (GA-26).
 */
export const accountStrategyCitedEsnCertaintySchema = z.enum(PERSONAL_ACCESS_CERTAINTIES)
export const accountStrategyCitedEsnFreshnessSchema = z.enum(['fresh', 'stale', 'undated'])

export const accountStrategyCitedEsnSchema = z.object({
  name: z.string(),
  /** La ligne Partenaires (`account_partners.id`) vers laquelle la stratégie renvoie. */
  partner_id: z.string().nullable(),
  /** La certitude la plus forte réunie sur la ligne — calculée par
   *  `personalAccessCertainty`, la MÊME fonction que `account-access.service.ts`. */
  certainty: accountStrategyCitedEsnCertaintySchema,
  /** La fraîcheur (`account_partners.detected_at`) qui a produit cette certitude ;
   *  `undated` si aucune ligne fondatrice ne porte de date. */
  freshness: accountStrategyCitedEsnFreshnessSchema,
  /** Faux = observation seule : une hypothèse, qui ne porte ni « partenaire » ni « rang 2 ».
   *  Inchangé par #3667.R1 — lié à `isFoundedPartner` (promesse P5), pas à la certitude affichée. */
  founded: z.boolean(),
  scope: z.string().nullable(),
  next_check: z.enum(['confirm_relation', 'confirm_scope']).nullable(),
})
export type AccountStrategyCitedEsn = z.infer<typeof accountStrategyCitedEsnSchema>

export const accountStrategyPassageSchema = z.object({
  current_consultant: elementSchema(z.string()),
  former_consultant: elementSchema(z.string()),
  former_colleague: elementSchema(z.string()),
  common_relationship: elementSchema(z.string()),
  existing_client: elementSchema(z.string()),
  partner: elementSchema(z.string()),
  rank_2: elementSchema(z.string()),
  referenced_esn: elementSchema(z.string()),
  former_manager: elementSchema(z.string()),
  alumni: elementSchema(z.string()),
  event: elementSchema(z.string()),
  direct_recommendation: elementSchema(z.string()),
  /** Vrai quand aucune des onze voies ci-dessus n'est connue — un CONSTAT
   *  calculé, jamais une treizième voie saisissable. */
  no_path: elementSchema(z.boolean()),
  confidence: accountStrategy5PConfidenceSchema,
  /** #3684.2 — les ESN citées, UNE ligne par société, avec ce qui les fonde. Optionnel :
   *  un ancien fixture sans cette clé reste valide ; `deriveAccountStrategy5P` la pose toujours. */
  cited_esns: z.array(accountStrategyCitedEsnSchema).optional(),
  /** #3684.5 — faux = « relation non documentée » (jamais « aucune ESN n'intervient »). */
  relation_documented: z.boolean().optional(),
})
export type AccountStrategyPassage = z.infer<typeof accountStrategyPassageSchema>

/* ─────────────────────────────── READINESS ───────────────────────────────── */

/**
 * Jamais un pourcentage de chance de signature (doctrine c26, et le ticket le
 * redit lui-même : « Ne pas créer un pourcentage de chance de signature »).
 * Cinq verdicts qualitatifs, du plus prêt au moins prêt.
 */
export const ACCOUNT_STRATEGY_5P_READINESS_STATES = [
  'READY_TO_ACT',
  'READY_TO_VERIFY',
  'INCOMPLETE',
  'BLOCKED',
  'NO_GO',
] as const
export const accountStrategy5PReadinessSchema = z.enum(ACCOUNT_STRATEGY_5P_READINESS_STATES)
export type AccountStrategy5PReadiness = (typeof ACCOUNT_STRATEGY_5P_READINESS_STATES)[number]

export const ACCOUNT_STRATEGY_5P_DIMENSIONS = ['perimeter', 'problem', 'people', 'proof', 'passage'] as const
export type AccountStrategy5PDimension = (typeof ACCOUNT_STRATEGY_5P_DIMENSIONS)[number]

export const accountStrategy5PSchema = z.object({
  account_id: z.string().guid(),
  perimeter: accountStrategyPerimeterSchema,
  problem: accountStrategyProblemSchema,
  people: accountStrategyPeopleSchema,
  proof: accountStrategyProofSchema,
  passage: accountStrategyPassageSchema,
  readiness: accountStrategy5PReadinessSchema,
  /** La dimension qui MÉRITE la prochaine action (UX du ticket : « la
   *  dimension qui mérite la prochaine action »). `null` seulement quand les
   *  cinq P sont solides (`READY_TO_ACT`) — il n'y a alors rien à désigner. */
  next_action_dimension: z.enum(ACCOUNT_STRATEGY_5P_DIMENSIONS).nullable(),
})
export type AccountStrategy5P = z.infer<typeof accountStrategy5PSchema>

/** Combien d'éléments d'une dimension sont CONNUS (verified/observed/user_supplied)
 *  sur le total — l'unité que la confiance ET la readiness partagent, jamais
 *  deux comptages qui divergent. */
function knownRatio(elements: readonly AccountStrategy5PElement<unknown>[]): { known: number; total: number } {
  return { known: elements.filter(el => isElementKnown(el.status)).length, total: elements.length }
}

/**
 * Une dimension est-elle un TROU pour la readiness — vide, ou construite sur
 * la seule inférence ? `stale`/`not_applicable` ne comptent NI comme connus
 * NI comme trous : un fait périmé n'est plus affirmable (doctrine « archive,
 * ne supprime pas », un fait périmé redevient inconnu) sans pour autant être
 * un manque qu'on demande de combler à nouveau depuis zéro, et un axe
 * `not_applicable` sort du dénominateur (GA-18/19) — ni l'un ni l'autre ne
 * doit faire basculer un compte en `BLOCKED`/`NO_GO` à sa place.
 */
function isDimensionGap(elements: readonly AccountStrategy5PElement<unknown>[]): boolean {
  const measurable = elements.filter(el => el.status !== 'not_applicable')
  if (measurable.length === 0) return false
  return measurable.every(el => isElementGap(el.status))
}

/**
 * LE NO-GO DU TICKET : une analyse ne se déclare jamais « prête » quand
 * plusieurs P restent vides ou reposent uniquement sur l'inférence.
 *
 * L'échelle est délibérément conservatrice : `READY_TO_ACT` exige que les
 * CINQ dimensions portent au moins un fait connu ; un seul trou abaisse déjà
 * le verdict à `READY_TO_VERIFY` (prêt, mais une dimension reste à confirmer
 * avant d'agir) ; deux à trois trous → `INCOMPLETE` ; quatre → `BLOCKED` ;
 * les cinq → `NO_GO`, le cas que le ticket cite en exemple (« le compte n'est
 * pas prêt pour une séquence »).
 */
export function accountStrategy5PReadinessFor(dimensions: {
  perimeter: readonly AccountStrategy5PElement<unknown>[]
  problem: readonly AccountStrategy5PElement<unknown>[]
  people: readonly AccountStrategy5PElement<unknown>[]
  proof: readonly AccountStrategy5PElement<unknown>[]
  passage: readonly AccountStrategy5PElement<unknown>[]
}): { readiness: AccountStrategy5PReadiness; nextActionDimension: AccountStrategy5PDimension | null } {
  const gaps: Record<AccountStrategy5PDimension, boolean> = {
    perimeter: isDimensionGap(dimensions.perimeter),
    problem: isDimensionGap(dimensions.problem),
    people: isDimensionGap(dimensions.people),
    proof: isDimensionGap(dimensions.proof),
    passage: isDimensionGap(dimensions.passage),
  }
  const gapCount = ACCOUNT_STRATEGY_5P_DIMENSIONS.filter(dimension => gaps[dimension]).length

  const readiness: AccountStrategy5PReadiness =
    gapCount === 0
      ? 'READY_TO_ACT'
      : gapCount === 1
        ? 'READY_TO_VERIFY'
        : gapCount <= 3
          ? 'INCOMPLETE'
          : gapCount === 4
            ? 'BLOCKED'
            : 'NO_GO'

  if (gapCount === 0) return { readiness, nextActionDimension: null }

  // La dimension à traiter en PREMIER — l'ordre canonique P1→P5 tranche entre
  // deux trous à égalité, jamais l'ordre de détection.
  const nextActionDimension = ACCOUNT_STRATEGY_5P_DIMENSIONS.find(dimension => gaps[dimension]) ?? null

  return { readiness, nextActionDimension }
}

/* ───────────────────────────── Dérivation ───────────────────────────────── */

/** Ce que la dérivation lit d'un `Contact` — jamais la fiche entière (elle
 *  vit sur sa propre maison, on ne la duplique pas). */
export type AccountStrategy5PContactInput = Pick<Contact, 'id' | 'full_name' | 'decision_role' | 'title'>

/**
 * #3277.6/.7 — ce que la dérivation lit d'une MISSION déjà menée chez le compte
 * (la source réelle de P4 REX/consultant et de P5 client existant/consultant).
 * `status` est le statut de mission brut ; `consultants` les noms affectés.
 */
export type AccountStrategy5PMissionInput = {
  label: string
  status: string
  consultants: readonly string[]
}

/** #3277.7 — une ESN détectée SUR ce compte (`account_partners`, non écartée). */
export type AccountStrategy5PPartnerInput = {
  name: string
  rank: string
  relationship: string
  /** #3684 — `declared` | `analysis` ; absent = ligne saisie (compat. anciens appelants). */
  source?: string
  /** #3684 — consultants déjà placés via cette ESN : la seule preuve d'une relation. */
  placements?: number
  /** #3684.2 — la ligne Partenaires et son périmètre, pour y renvoyer la stratégie. */
  id?: string
  scope?: string | null
  /** #3667.R1 — `account_partners.detected_at` : la même colonne de fraîcheur
   *  que l'onglet Accès lit déjà (`account-access.service.ts`) pour calculer
   *  `personalAccessFreshness`. Absent = ligne sans date connue (`undated`,
   *  jamais `fresh` — même règle qu'Accès). */
  detectedAt?: string | null
}

/**
 * #3684.3 — une ESN FONDE une voie d'accès seulement si l'équipe l'a déclarée
 * ou si un placement la prouve. Une observation d'analyse seule est une piste à
 * vérifier : elle ne porte jamais « partenaire » ni « rang 2 » (jamais un
 * statut de référencement confirmé sur une simple observation).
 */
function isFoundedPartner(partner: AccountStrategy5PPartnerInput): boolean {
  return partner.source !== 'analysis' || (partner.placements ?? 0) > 0
}

/** #3667.R1 — la certitude canonique d'une ligne `account_partners`, calculée
 *  comme `account-access.service.ts` calcule celle d'un chemin d'accès : le
 *  même sourceKind (`partnerRegistrySourceKind`, à un seul endroit), la même
 *  fonction `personalAccessCertainty`. */
function esnCertaintyOf(
  partner: AccountStrategy5PPartnerInput,
  now: Date,
): { certainty: PersonalAccessCertainty; freshness: PersonalAccessFreshness } {
  const freshness = personalAccessFreshness(partner.detectedAt ?? null, now)
  const certainty = personalAccessCertainty({
    sourceKind: partnerRegistrySourceKind({
      placements: partner.placements ?? 0,
      // #3684 — absent = ligne saisie (compat. anciens appelants), jamais une
      // observation de pipeline par défaut : même lecture que `isFoundedPartner`.
      source: partner.source ?? 'declared',
    }),
    verified: false,
    freshness,
  })
  return { certainty, freshness }
}

/** Rang de force d'une certitude — le plus petit indice gagne (même ordre que
 *  `PERSONAL_ACCESS_CERTAINTIES`, déjà écrit du plus fort au plus faible). */
function certaintyRank(certainty: PersonalAccessCertainty): number {
  return PERSONAL_ACCESS_CERTAINTIES.indexOf(certainty)
}

/**
 * #3684.2/#3667.R1 — UNE ligne par ESN citée (clé : nom insensible à la casse), la certitude la plus
 * forte réunie sur toutes les lignes, jamais une moyenne ni un écrasement silencieux. Une observation
 * seule reste listée, qualifiée « à vérifier » : la citation est ramenée à une hypothèse, elle n'est
 * ni cachée ni promue — exactement ce que `historic_observation` nomme déjà ailleurs dans l'app.
 */
function citedEsnsOf(partners: readonly AccountStrategy5PPartnerInput[], now: Date): AccountStrategyCitedEsn[] {
  const byName = new Map<
    string,
    {
      name: string
      partnerId: string | null
      scope: string | null
      certainty: PersonalAccessCertainty
      freshness: PersonalAccessFreshness
      founded: boolean
    }
  >()
  for (const partner of partners) {
    const name = partner.name.trim()
    if (name === '') continue
    const key = name.toLowerCase()
    const { certainty, freshness } = esnCertaintyOf(partner, now)
    const existing = byName.get(key)
    const founded = (existing?.founded ?? false) || isFoundedPartner(partner)
    if (!existing || certaintyRank(certainty) < certaintyRank(existing.certainty)) {
      byName.set(key, {
        name: existing?.name ?? name,
        partnerId: existing?.partnerId ?? partner.id ?? null,
        scope: existing?.scope ?? (partner.scope?.trim() ? partner.scope.trim() : null),
        certainty,
        freshness,
        founded,
      })
    } else {
      byName.set(key, {
        ...existing,
        partnerId: existing.partnerId ?? partner.id ?? null,
        scope: existing.scope ?? (partner.scope?.trim() ? partner.scope.trim() : null),
        founded,
      })
    }
  }
  return [...byName.values()].map(entry => ({
    name: entry.name,
    partner_id: entry.partnerId,
    certainty: entry.certainty,
    freshness: entry.freshness,
    founded: entry.founded,
    scope: entry.scope,
    next_check: !entry.founded ? 'confirm_relation' : entry.scope === null ? 'confirm_scope' : null,
  }))
}

const RUNNING_STATUSES: readonly string[] = RUNNING_MISSION_STATUSES
// Terminée AVEC livraison : `cancelled`/`archived` ne prouvent rien.
const PROVEN_FINISHED_STATUSES: readonly string[] = ['ended', 'terminated', 'completed', 'renewed']

function plural(count: number, one: string, many: string): string {
  return `${count} ${count > 1 ? many : one}`
}

function namesOf(partners: readonly AccountStrategy5PPartnerInput[]): string | null {
  const names = [...new Set(partners.map(p => p.name).filter(name => name.trim() !== ''))]
  return names.length > 0 ? names.join(', ') : null
}

function uniqueNames(missions: readonly AccountStrategy5PMissionInput[]): string[] {
  return [...new Set(missions.flatMap(m => m.consultants).filter(name => name.trim() !== ''))]
}

function toPersonRef(contact: AccountStrategy5PContactInput): AccountStrategyPersonRef {
  return { contactId: contact.id, name: contact.full_name }
}

/**
 * #3261.15 — un intitulé RH reconnu, FR et EN. Ancré sur la FONCTION (comme
 * `_IT_DECIDER_RE`, `apps/ia/app/services/decision_role.py`), jamais sur le mot
 * « ressources » seul : un « Directeur des Ressources Naturelles » ne doit pas
 * tomber ici.
 *
 * Les SIGLES (`RH`, `DRH`, `RRH`) restent en CASSE STRICTE (regex sans `/i`) :
 * `\bRH\b` insensible à la casse matcherait « Rhône » — en JS, `\b` traite un
 * accent comme un non-mot, donc la frontière tombe entre le « h » et le « ô ».
 * Les intitulés en toutes lettres, eux, sont insensibles à la casse.
 */
const HR_ACRONYM_RE = /\bDRH\b|\bRRH\b|\bCHRO\b|\bHRBP\b|\bHR\b|\bRH\b/
const HR_PHRASE_RE =
  /chief\s+human\s+resources?\s+officer|human\s+resources?\s+business\s+partner|ressources\s+humaines|human\s+resources|responsable[\w\sà-ÿ'’.&-]*\btalent|talent\s+acquisition|head\s+of\s+(hr|people|talent)|director\s+of\s+(hr|people)/i

export function isHrTitle(title: string | null | undefined): boolean {
  if (typeof title !== 'string' || !title.trim()) return false
  return HR_ACRONYM_RE.test(title) || HR_PHRASE_RE.test(title)
}

/**
 * K.4 / #4324 (Louis 19/10/2026, cas Arkéa) — le décideur TECHNIQUE se rapproche par INTITULÉ.
 *
 * « Aucun DSI / RSSI responsable » s'écrivait sur un compte qui portait un CISO : le rôle n'était lu que
 * sur `decision_role`, et « chaque boîte donne des noms différents aux gens » (DSI = Directeur des
 * systèmes d'information = CIO = Head of IT ; RSSI = CISO = Responsable sécurité SI…). Un rôle ne se
 * déclare absent qu'APRÈS avoir rapproché ces intitulés équivalents — même motif que `isHrTitle`, le
 * TITRE comme seconde lecture, jamais un texte deviné.
 *
 * Ancré sur la FONCTION (IT, SI, sécurité du SI, numérique) : « Directeur technique » seul, « Responsable
 * Achats IT » ou « Responsable sécurité incendie » ne sont PAS un décideur technique. Un stagiaire non plus.
 */
const NOT_TECHNICAL_DECIDER_RE =
  /stagiaire|alternan|apprenti|\bintern(ship)?\b|achat|financ|\bdaf\b|commercial|incendie|chef de projet|charge de mission|assistan|gestionnaire|technicien|analyste|developp|ingenieur|\bengineer\b/
const TECHNICAL_DECIDER_RES: readonly RegExp[] = [
  /\b(dsin?t?|dosi|rssi|ciso|cio|cto|ssi)\b/,
  /chief (information|technology|digital|information security) officer/,
  /\bdirect(?:eur|rice)s?\b[\w\s'-]*\b(systemes? d.informations?|si|informatique|services? informatiques?|services? numeriques?|systemes? numeriques?|numeriques?|digital|it|is|securite (?:des |du |de la )?(?:si|systemes?|informatique))\b/,
  /\bresponsables?\b[\w\s'-]*\b(systemes? d.information|si|ssi|informatique|it|securite (?:des |du |de la )?(?:si|systemes?|informatique)|securite de l.information)\b/,
  /\b(?:head|director|vp|vice president) of (?:it|information technology|information security|security|technology|cyber\w*)\b/,
  /\bit (?:director|head)\b/,
  // #4324.1 — intitulés de terrain : « Directeur IT », « Director, IT », « VP IT », « Information Systems Director »,
  // « Head of Information Systems », « Direction des Systèmes d'Information », « Chief Digital & Information Officer ».
  /\b(?:director|directeur|directrice|direction|vp|vice president|head|chief)\b[\w\s,'&/-]*\b(?:it|is|information systems?|information technology|information security|systemes? d.informations?|cyber\w*)\b/,
  /\binformation (?:systems?|technology|security) (?:director|officer|head)\b/,
  /\bchief\b[\w\s,&-]*\b(?:information|technology|digital)\b[\w\s,&-]*\bofficer\b/,
  /\bresponsables?\b[\w\s'-]*\bcyber\w*\b/,
]

/** #4324 — « D.S.I. » → « dsi », « Dir. SI » → « directeur SI » : un sigle pointé ou une abréviation ne rend pas un titulaire absent. */
function expandTitleAbbreviations(text: string): string {
  return text
    .replace(/\b(?:[a-z]\.){2,}[a-z]?\b\.?/g, match => match.replace(/\./g, ''))
    .replace(/\bdir\.\s*/g, 'directeur ')
}

export function isTechnicalDeciderTitle(title: string | null | undefined): boolean {
  if (typeof title !== 'string' || !title.trim()) return false
  const text = expandTitleAbbreviations(deaccentLower(title).replace(/[’`]/g, "'"))
  if (NOT_TECHNICAL_DECIDER_RE.test(text)) return false
  return TECHNICAL_DECIDER_RES.some(re => re.test(text))
}

/**
 * #4324.1 — l'intitulé relève de la FONCTION informatique / sécurité du SI, quel que soit le niveau (chef de projet
 * DSI, IT Manager, développeur, RSSI adjoint…). Sert à dire POURQUOI le siège technique est vide : aucun contact IT
 * collecté, ou des contacts IT mais aucun au niveau direction.
 */
const IT_FUNCTION_RE =
  /\b(dsin?|rssi|ssi|ciso|cio|cto|devops|sirh)\b|\b(?:it|is)\b|\bsi\b|informatique|information (?:systems?|technology|security)|systemes? d.informations?|cyber\w*|infrastructure|reseaux?\b|network|developp|software|data center/

/** « À qualifier » (`unknown`), absent ou vide : le rôle n'est PAS posé, l'intitulé peut parler (#4324.1). */
export function isDecisionRoleUnposed(role: string | null | undefined): boolean {
  const value = (role ?? '').trim().toLowerCase()
  return value === '' || value === 'unknown'
}

export function isItFunctionTitle(title: string | null | undefined): boolean {
  if (typeof title !== 'string' || !title.trim()) return false
  const text = deaccentLower(title).replace(/[’`]/g, "'")
  return !/\bachat|incendie|\bfinanc|commercial/.test(text) && IT_FUNCTION_RE.test(text)
}

/**
 * #4324.1 — un titulaire d'INTITULÉ VOISIN du décideur technique : un manager / responsable / référent de la
 * fonction IT (« IT Infrastructure and Security Manager », « Responsable de Domaine IT »). Il ne dirige pas
 * forcément la DSI, mais il TIENT le siège technique tant qu'on n'a pas trouvé mieux : « à qualifier » veut
 * dire qu'on n'a pas fini de le vérifier, pas qu'il n'existe pas. Les exclusions du décideur (stagiaire, chef de
 * projet, développeur, achats…) valent aussi ici.
 */
export function isTechnicalNeighbourTitle(title: string | null | undefined): boolean {
  if (typeof title !== 'string' || !title.trim()) return false
  const text = expandTitleAbbreviations(deaccentLower(title).replace(/[’`]/g, "'"))
  if (NOT_TECHNICAL_DECIDER_RE.test(text)) return false
  return (
    isItFunctionTitle(title) &&
    /\b(manager|responsables?|lead|head|referent|chef de (?:service|pole|domaine))\b/.test(text)
  )
}

export type TechnicalSeatGap = {
  /** `no_it_contact` : rien d'IT n'a été collecté ; `it_below_director` : de l'IT, mais aucun au niveau direction. */
  reason: 'no_it_contact' | 'it_below_director'
  itContacts: number
}

/**
 * #4324.1 — « aucun DSI connu » dit POURQUOI. `null` = un titulaire est reconnu (rôle posé, ou intitulé équivalent) :
 * rien à dire. Un rôle posé à la main n'est jamais écrasé par le titre.
 */
export function technicalSeatGap(
  contacts: ReadonlyArray<{ title?: string | null; decision_role?: string | null }>,
): TechnicalSeatGap | null {
  // #4324.1 — « À qualifier » (`unknown`) n'est pas un rôle posé ; un intitulé voisin tient le siège, lui aussi.
  if (
    contacts.some(
      c =>
        c.decision_role === 'technical' ||
        (isDecisionRoleUnposed(c.decision_role) &&
          (isTechnicalDeciderTitle(c.title) || isTechnicalNeighbourTitle(c.title))),
    )
  )
    return null
  const itContacts = contacts.filter(c => isItFunctionTitle(c.title)).length
  return { reason: itContacts === 0 ? 'no_it_contact' : 'it_below_director', itContacts }
}

function peopleElement(
  contacts: readonly AccountStrategy5PContactInput[],
): AccountStrategy5PElement<AccountStrategyPersonRef[]> {
  if (contacts.length === 0) return missingElement()
  return knownElement(contacts.map(toPersonRef), 'observed')
}

const ACTIVE_DECISION_ROLES = decisionRoleSchema.options.filter(
  role => !['sponsor', 'operational', 'purchasing', 'unknown'].includes(role),
)

/**
 * P3 — PEOPLE, dérivé des `Contact` du compte, classés par `decision_role`
 * (taxonomie MEDDIC unique du produit, `decisionRoleSchema`).
 *
 * `sponsors` et `operational_relays` restent `missing` : la taxonomie
 * MEDDIC actuelle n'a pas de rôle distinct pour eux (`champion` porte le
 * relais interne le plus proche, mais lui donner aussi `operational_relays`
 * ferait compter deux fois la même personne sous deux dimensions —
 * exactement le double comptage que `known_relationships` interdirait plus
 * bas). `known_relationships` reste `missing` pour la même raison : le
 * produit n'a aujourd'hui aucun graphe de relation ANTÉRIEURE (ex-collègue,
 * alumni) posé sur `Contact` — c'est une source P5, pas P3, et P5 est hors
 * de ce lot (voir le docblock de tête).
 *
 * `hr` (#3261.15) est calculé à PART, sur le TITRE (`isHrTitle`), jamais sur
 * `decision_role` — un contact peut donc apparaître ici ET sous son rôle
 * MEDDIC habituel (un DRH `champion` reste `champion` aussi) : deux facettes
 * distinctes du même contact, jamais deux vérités concurrentes sur LE MÊME
 * fait.
 */
function derivePeople(contacts: readonly AccountStrategy5PContactInput[]): AccountStrategyPeople {
  const byRole = new Map<string, AccountStrategy5PContactInput[]>()
  for (const contact of contacts) {
    // K.4 / #4324 — sans rôle posé, un intitulé équivalent (CISO, CIO, Head of IT…) tient le siège technique.
    // Un rôle déjà posé (humain ou modèle) n'est JAMAIS écrasé par le titre.
    // #4324.1 — un intitulé VOISIN (IT Manager, Responsable informatique) tient le siège lui aussi, comme dans la
    // fiche Couverture : sinon « technical » restait manquant ici alors que `technicalSeatGap` le disait tenu.
    if (!contact.decision_role && !isTechnicalDeciderTitle(contact.title) && !isTechnicalNeighbourTitle(contact.title))
      continue
    // `purchasing` est l'ancien nom de `procurement` (même libellé « Achats » à l'écran) : un contact
    // badgé Achats tient le rôle, quelle que soit la génération de sa ligne.
    const role =
      !contact.decision_role ||
      (isDecisionRoleUnposed(contact.decision_role) &&
        (isTechnicalDeciderTitle(contact.title) || isTechnicalNeighbourTitle(contact.title)))
        ? 'technical'
        : contact.decision_role === 'purchasing'
          ? 'procurement'
          : contact.decision_role
    const bucket = byRole.get(role) ?? []
    bucket.push(contact)
    byRole.set(role, bucket)
  }

  // #3277 — seuls les rôles ACTIFS peuvent manquer : `sponsor`, `operational`, `purchasing`, `unknown`
  // ne sont plus émis (voir `decisionRoleSchema`), donc ils seraient « manquants » pour toujours.
  const knownRoles = new Set(byRole.keys())
  const missingRoles = ACTIVE_DECISION_ROLES.filter(role => !knownRoles.has(role))
  const hrContacts = contacts.filter(contact => isHrTitle(contact.title))
  // #4324.1 — le siège technique vide dit POURQUOI (même fonction que la fiche Couverture, GA-26).
  const technicalGap = byRole.has('technical') ? null : technicalSeatGap(contacts)

  return {
    users: peopleElement(byRole.get('user') ?? []),
    operational_relays: missingElement(),
    champions: peopleElement(byRole.get('champion') ?? []),
    technical_references: peopleElement(byRole.get('technical') ?? []),
    sponsors: missingElement(),
    economic_deciders: peopleElement(byRole.get('economic') ?? []),
    procurement: peopleElement(byRole.get('procurement') ?? []),
    blockers: peopleElement(byRole.get('blocker') ?? []),
    hr: peopleElement(hrContacts),
    known_relationships: missingElement(),
    missing_roles:
      missingRoles.length === 0 ? { value: [], status: 'not_applicable' } : knownElement(missingRoles, 'observed'),
    ...(technicalGap ? { technical_gap: technicalGap } : {}),
  }
}

function usefulText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * P1 — PERIMETER, dérivé de `entities_exhaustive` (l'organigramme — chaque
 * nœud porte `type`, projeté sur la taxonomie `EntityKind` par
 * `ORG_ENTITY_TYPE_TO_ENTITY_KIND` — voir `entity-resolution.ts`). Le premier
 * nœud NOMMÉ de chaque type devient l'élément ; `team`/`project`/
 * `selected_scope`/`excluded_scopes`/`budget_scope` restent `missing` : la
 * taxonomie d'entité (#2284.2-.17) ne porte aucun de ces cinq types, et le
 * périmètre SÉLECTIONNÉ (ce que le commercial vise vs exclut) est un geste
 * utilisateur qu'aucun écran n'écrit encore — hors de ce lot.
 */
function derivePerimeter(analysis: AccountAnalysis): AccountStrategyPerimeter {
  const entities = analysis.entities_exhaustive ?? []
  const firstNamedOfType = (types: readonly string[]): string | null => {
    for (const entity of entities) {
      if (!entity?.type || !types.includes(entity.type)) continue
      const name = usefulText(entity.name)
      if (name) return name
    }
    return null
  }

  const group = firstNamedOfType(['groupe'])
  const parentCompany = firstNamedOfType(['filiale']) // aucune source ne distingue encore groupe/maison mère
  const subsidiary = (analysis.subsidiaries ?? []).map(s => usefulText(s?.name)).find((n): n is string => !!n) ?? null
  const businessUnit = firstNamedOfType(['bu', 'factory', 'lab', 'equipe'])
  const direction = firstNamedOfType(['departement', 'data_office'])
  const site =
    (analysis.sites_france ?? []).map(s => usefulText(s?.city)).find((n): n is string => !!n) ??
    firstNamedOfType(['site'])
  const program =
    (analysis.program_names ?? []).map(p => usefulText(p?.name)).find((n): n is string => !!n) ??
    firstNamedOfType(['programme'])
  const budgetScope = (analysis.program_names ?? []).map(p => usefulText(p?.budget)).find((n): n is string => !!n)

  const elements: Record<string, AccountStrategy5PElement<unknown>> = {
    group: group ? knownElement(group, 'observed') : missingElement(),
    parent_company: parentCompany ? knownElement(parentCompany, 'observed') : missingElement(),
    subsidiary: subsidiary ? knownElement(subsidiary, 'observed') : missingElement(),
    business_unit: businessUnit ? knownElement(businessUnit, 'observed') : missingElement(),
    direction: direction ? knownElement(direction, 'observed') : missingElement(),
    site: site ? knownElement(site, 'observed') : missingElement(),
    team: missingElement(),
    program: program ? knownElement(program, 'observed') : missingElement(),
    project: missingElement(),
    selected_scope: missingElement(),
    excluded_scopes: missingElement(),
    budget_scope: budgetScope ? knownElement(budgetScope, 'observed') : missingElement(),
  }

  const { known, total } = knownRatio(Object.values(elements) as AccountStrategy5PElement<unknown>[])

  return {
    group: elements.group as AccountStrategy5PElement<string>,
    parent_company: elements.parent_company as AccountStrategy5PElement<string>,
    subsidiary: elements.subsidiary as AccountStrategy5PElement<string>,
    business_unit: elements.business_unit as AccountStrategy5PElement<string>,
    direction: elements.direction as AccountStrategy5PElement<string>,
    site: elements.site as AccountStrategy5PElement<string>,
    team: elements.team as AccountStrategy5PElement<string>,
    program: elements.program as AccountStrategy5PElement<string>,
    project: elements.project as AccountStrategy5PElement<string>,
    selected_scope: elements.selected_scope as AccountStrategy5PElement<string[]>,
    excluded_scopes: elements.excluded_scopes as AccountStrategy5PElement<string[]>,
    budget_scope: elements.budget_scope as AccountStrategy5PElement<string>,
    confidence: confidenceFromKnownRatio(known, total),
  }
}

/**
 * P2 — PROBLEM, dérivé de `pains` (le problème opérationnel déclaré),
 * `qualified_hypotheses` (#2687 — l'hypothèse ET sa confiance, DÉJÀ
 * qualitative côté source) et `recent_signals` (le fait qui sert de preuve
 * en attendant P4). `trigger`/`current_status`/`expiry` restent `missing` :
 * aucun des trois n'a de source canonique aujourd'hui — un déclencheur daté,
 * un statut d'avancement et une péremption sont des faits qu'aucune phase
 * n'écrit encore sur le compte.
 */
function deriveProblem(analysis: AccountAnalysis): AccountStrategyProblem {
  const pains = analysis.pains ?? []
  const topPain = pains[0]
  const hypotheses = analysis.qualified_hypotheses ?? []
  const topHypothesis = hypotheses[0]
  const signals = analysis.recent_signals ?? []
  const evidenceSignal = signals.find(s => usefulText((s as { label?: string | null })?.label))

  const operationalProblem = usefulText(topPain?.pain)
  const businessImpact = usefulText(topPain?.business_impact)
  const urgency = usefulText(topPain?.urgency as string | null | undefined)
  const hypothesis = usefulText(topHypothesis?.hypothesis)
  const hypothesisConfidence = usefulText(topHypothesis?.confidence)
  const evidence = usefulText((evidenceSignal as { label?: string | null } | undefined)?.label)

  // `hypothesis` est une DÉDUCTION du modèle par construction (#2687) — jamais
  // `observed`/`verified`, qui affirmeraient un fait constaté.
  const elements = {
    trigger: missingElement<string>(),
    operational_problem: operationalProblem ? knownElement(operationalProblem, 'observed') : missingElement<string>(),
    business_impact: businessImpact ? knownElement(businessImpact, 'observed') : missingElement<string>(),
    urgency: urgency ? knownElement(urgency, 'observed') : missingElement<string>(),
    current_status: missingElement<string>(),
    evidence: evidence ? knownElement(evidence, 'observed') : missingElement<string>(),
    hypothesis: hypothesis
      ? ({ value: hypothesis, status: 'inferred' } satisfies AccountStrategy5PElement<string>)
      : missingElement<string>(),
    expiry: missingElement<string>(),
  }
  void hypothesisConfidence // portée par l'élément lui-même (statut `inferred`), pas dupliquée en confiance de section

  const { known, total } = knownRatio(Object.values(elements))

  return { ...elements, confidence: confidenceFromKnownRatio(known, total) }
}

/**
 * P4 — PROOF, PARTIEL dans ce lot : seul `risks` est levé (`AccountAnalysis.risks`,
 * jamais recalculé) et `missing_proof` calculé (aucun angle `mobilisable` sur
 * le compte). Les huit autres champs (consultant pertinent, référence
 * comparable, REX mission, étude de cas client, artefact, benchmark,
 * connaissance sectorielle, preuve relationnelle) n'ont aucune source
 * canonique câblée sur UN compte aujourd'hui — voir le docblock de tête.
 */
function deriveProof(
  analysis: AccountAnalysis,
  missions: readonly AccountStrategy5PMissionInput[],
): AccountStrategyProof {
  const risks = analysis.risks ?? []
  const angles = analysis.angles ?? []
  const hasMobilisableProof = angles.some(a => a?.proof_status === 'mobilisable')

  const running = missions.filter(m => RUNNING_STATUSES.includes(m.status))
  const finished = missions.filter(m => PROVEN_FINISHED_STATUSES.includes(m.status))
  const placed = uniqueNames([...running, ...finished])

  const elements = {
    // #3277.6 — un consultant DÉJÀ placé chez ce compte, lu sur ses missions.
    relevant_consultant: placed.length > 0 ? knownElement(placed.join(', '), 'observed') : missingElement<string>(),
    comparable_reference: missingElement<string>(),
    // Une mission réellement menée ici, jamais un texte généré.
    mission_rex: finished[0] ? knownElement(finished[0].label, 'observed') : missingElement<string>(),
    client_case: missingElement<string>(),
    artifact: missingElement<string>(),
    benchmark: missingElement<string>(),
    sector_knowledge: missingElement<string>(),
    relationship_proof:
      running.length + finished.length > 0
        ? knownElement(
            plural(running.length + finished.length, 'mission menée chez ce compte', 'missions menées chez ce compte'),
            'observed',
          )
        : missingElement<string>(),
    risks: risks.length > 0 ? knownElement(risks, 'observed') : missingElement<typeof risks>(),
    // #3277 — une mission menée (en cours ou terminée) chez ce compte EST une preuve lue : sans cela la
    // carte écrivait « Aucune preuve mobilisable » à côté de « 3 éléments connus » tirés de ces missions.
    missing_proof: knownElement(!hasMobilisableProof && running.length + finished.length === 0, 'observed'),
  }

  const { known, total } = knownRatio(Object.values(elements))
  return { ...elements, confidence: confidenceFromKnownRatio(known, total) }
}

/**
 * P5 — PASSAGE, VIDE dans ce lot par construction : aucune des onze voies
 * n'a de source canonique posée sur UN compte aujourd'hui (`partner.ts` /
 * `dormant-reactivation-score.ts` restent une lecture PORTEFEUILLE — voir le
 * docblock de tête). `no_path` est donc `true` chaque fois, HONNÊTEMENT : ce
 * n'est pas « il n'existe aucune voie », c'est « ce lot ne sait pas encore en
 * chercher une ». La distinction vit dans le `status` (`observed`, un constat
 * de ce lot, jamais `verified`) et dans le commentaire final de l'issue.
 */
function derivePassage(
  missions: readonly AccountStrategy5PMissionInput[],
  allPartners: readonly AccountStrategy5PPartnerInput[],
  now: Date,
): AccountStrategyPassage {
  const running = missions.filter(m => RUNNING_STATUSES.includes(m.status))
  const finished = missions.filter(m => PROVEN_FINISHED_STATUSES.includes(m.status))
  const current = uniqueNames(running)
  // Un consultant encore en place chez le compte n'est pas un « ancien ».
  const former = uniqueNames(finished).filter(name => !current.includes(name))
  const text = (value: string | null): AccountStrategy5PElement<string> =>
    value ? knownElement(value, 'observed') : missingElement<string>()
  const founded = allPartners.filter(isFoundedPartner)

  const elements = {
    current_consultant: text(current.length > 0 ? current.join(', ') : null),
    former_consultant: text(former.length > 0 ? former.join(', ') : null),
    former_colleague: missingElement<string>(),
    common_relationship: missingElement<string>(),
    // Une mission en cours ou menée = l'ESN travaille (ou a travaillé) ici.
    existing_client: text(
      running.length > 0
        ? plural(running.length, 'mission en cours', 'missions en cours')
        : finished.length > 0
          ? plural(finished.length, 'mission menée', 'missions menées')
          : null,
    ),
    // Une ESN avec qui on travaille déjà sur ce compte ouvre la porte ; un
    // concurrent, jamais. Le rang inconnu ne prouve rien.
    partner: text(namesOf(founded.filter(p => p.relationship === 'partner'))),
    rank_2: text(namesOf(founded.filter(p => p.rank === 'rank2' && p.relationship !== 'competitor'))),
    referenced_esn: missingElement<string>(),
    former_manager: missingElement<string>(),
    alumni: missingElement<string>(),
    event: missingElement<string>(),
    direct_recommendation: missingElement<string>(),
  }
  const voies = Object.values(elements)
  const noPath = voies.every(element => element.status === 'missing')
  const { known, total } = knownRatio(voies)
  return {
    ...elements,
    no_path: knownElement(noPath, 'observed'),
    cited_esns: citedEsnsOf(allPartners, now),
    relation_documented: allPartners.some(p => p.name.trim() !== ''),
    // Une seule voie connue sur douze ne fait pas une confiance « haute ».
    confidence: noPath ? 'low' : confidenceFromKnownRatio(known, total),
  }
}

/**
 * L'ENTRÉE UNIQUE — appelée par le service Compte, et par lui seul (aucune
 * copie locale dans Laura ou Découvrir, doctrine du ticket).
 */
export function deriveAccountStrategy5P(input: {
  accountId: string
  analysis: AccountAnalysis
  contacts: readonly AccountStrategy5PContactInput[]
  /** #3277.6/.7 — les missions DÉJÀ menées chez ce compte ; absent = aucune source. */
  missions?: readonly AccountStrategy5PMissionInput[]
  /** #3277.7 — les ESN détectées sur ce compte ; absent = aucune source. */
  partners?: readonly AccountStrategy5PPartnerInput[]
  /** #3667.R1 — l'horloge qui juge la fraîcheur des ESN citées ; défaut
   *  `new Date()` pour les appelants existants qui n'en passent pas. */
  now?: Date
}): AccountStrategy5P {
  const perimeter = derivePerimeter(input.analysis)
  const problem = deriveProblem(input.analysis)
  const people = derivePeople(input.contacts)
  const missions = input.missions ?? []
  const proof = deriveProof(input.analysis, missions)
  const passage = derivePassage(missions, input.partners ?? [], input.now ?? new Date())

  // `missing_proof`, `no_path` et `missing_roles` sont des RÉSUMÉS calculés de
  // leur propre dimension (« aucune des N voies/preuves/rôles connus »),
  // jamais une preuve indépendante — les compter comme un élément « connu »
  // rendrait une dimension entièrement vide faussement solide, exactement
  // l'inverse du NO-GO que le ticket demande de garder honnête. Ils restent
  // dans l'objet rendu (l'écran les affiche), mais sortent du calcul de
  // readiness.
  const { readiness, nextActionDimension } = accountStrategy5PReadinessFor({
    perimeter: elementsOf(perimeter),
    problem: elementsOf(problem),
    people: elementsOf(people, ['missing_roles']),
    proof: elementsOf(proof, ['missing_proof']),
    passage: elementsOf(passage, ['no_path']),
  })

  return {
    account_id: input.accountId,
    perimeter,
    problem,
    people,
    proof,
    passage,
    readiness,
    next_action_dimension: nextActionDimension,
  }
}

function isElementLike(value: unknown): value is AccountStrategy5PElement<unknown> {
  return !!value && typeof value === 'object' && 'status' in value && 'value' in value
}

/** Les éléments (jamais la `confidence`, ni les clés RÉSUMÉ listées dans
 *  `exclude`) d'une dimension — l'unité que `accountStrategy5PReadinessFor`
 *  consomme. Une fonction plutôt qu'un `Object.values(...).filter(...)` :
 *  le type de retour d'un objet à formes hétérogènes (P4/P5) rend
 *  l'overload de narrowing de `Array.filter` inutilisable in-place. */
function elementsOf(
  dimension: Record<string, unknown>,
  exclude: readonly string[] = [],
): AccountStrategy5PElement<unknown>[] {
  const out: AccountStrategy5PElement<unknown>[] = []
  for (const [key, value] of Object.entries(dimension)) {
    if (exclude.includes(key)) continue
    if (isElementLike(value)) out.push(value)
  }
  return out
}

/**
 * La réponse de la route quand le module de la façade n'est pas monté —
 * même discipline que `isAccountIntelligenceUnavailable`
 * (`account-intelligence-context.ts`) : l'écran doit la distinguer d'une
 * projection VIDE, qui affirmerait à tort « on ne sait rien de ce compte ».
 */
export function isAccountStrategy5PUnavailable(
  value: AccountStrategy5P | { status: 'unavailable' } | null | undefined,
): value is { status: 'unavailable' } {
  return Boolean(value && 'status' in value && value.status === 'unavailable')
}

/** Ce que l'écran a besoin de compter par dimension, jamais un pourcentage :
 *  combien d'éléments sont CONNUS sur le total mesurable. */
export type AccountStrategy5PDimensionSummary = {
  known: number
  total: number
  confidence: AccountStrategy5PConfidence
  /** Vrai quand cette dimension est le trou identifié par la readiness. */
  isNextAction: boolean
}

/** Les clés RÉSUMÉ à exclure du comptage, une PAR dimension — le même
 *  ensemble que `deriveAccountStrategy5P` utilise pour la readiness (GA-26 :
 *  un réglage vit à un seul endroit, l'écran ne le redéfinit pas). */
const SUMMARY_EXCLUDED_KEYS: Record<AccountStrategy5PDimension, readonly string[]> = {
  perimeter: [],
  problem: [],
  people: ['missing_roles'],
  proof: ['missing_proof'],
  passage: ['no_path'],
}

/**
 * LE RÉSUMÉ PAR DIMENSION que l'écran rend — un décompte, jamais un
 * pourcentage de chance de signature. Dérivé de l'objet DÉJÀ produit par
 * `deriveAccountStrategy5P`, jamais un second calcul : `next_action_dimension`
 * et les statuts par élément viennent de la même lecture.
 */
export function summarizeAccountStrategy5P(
  strategy: AccountStrategy5P,
): Record<AccountStrategy5PDimension, AccountStrategy5PDimensionSummary> {
  const dimensionOf: Record<AccountStrategy5PDimension, Record<string, unknown>> = {
    perimeter: strategy.perimeter,
    problem: strategy.problem,
    people: strategy.people,
    proof: strategy.proof,
    passage: strategy.passage,
  }
  const confidenceOf: Record<AccountStrategy5PDimension, AccountStrategy5PConfidence> = {
    perimeter: strategy.perimeter.confidence,
    problem: strategy.problem.confidence,
    people: derivePeopleConfidence(strategy.people),
    proof: strategy.proof.confidence,
    passage: strategy.passage.confidence,
  }

  const summaries = {} as Record<AccountStrategy5PDimension, AccountStrategy5PDimensionSummary>
  for (const dimension of ACCOUNT_STRATEGY_5P_DIMENSIONS) {
    const elements = elementsOf(dimensionOf[dimension], SUMMARY_EXCLUDED_KEYS[dimension])
    const { known, total } = knownRatio(elements)
    summaries[dimension] = {
      known,
      total,
      confidence: confidenceOf[dimension],
      isNextAction: strategy.next_action_dimension === dimension,
    }
  }
  return summaries
}

/** P3 n'a pas de champ `confidence` propre (la taxonomie du ticket n'en
 *  prévoit pas pour PEOPLE) — dérivée ici de son propre ratio connu/total,
 *  pour que l'écran affiche un badge cohérent sur les cinq dimensions. */
function derivePeopleConfidence(people: AccountStrategyPeople): AccountStrategy5PConfidence {
  const { known, total } = knownRatio(elementsOf(people, SUMMARY_EXCLUDED_KEYS.people))
  return confidenceFromKnownRatio(known, total)
}
