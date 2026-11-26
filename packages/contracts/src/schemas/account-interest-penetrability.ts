import { z } from 'zod'
import type { AccountAnalysis } from './analysis/account-analysis.js'
import {
  accountStrategy5PElementStatusSchema,
  isElementKnown,
  type AccountStrategy5PElement,
  type AccountStrategy5PElementStatus,
} from './account-strategy-5p-elements.js'
import type { AccountStrategy5P } from './account-strategy-5p.js'

/**
 * BEL-SC-229 (#3258, P0) — LA MATRICE INTÉRÊT × PÉNÉTRABILITÉ DU COMPTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE PROJECTION DE PLUS, JAMAIS UN DEUXIÈME SCORE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'instruction commune (#3249, règle 4) l'interdit et le ticket le répète
 * lui-même (« ne pas fusionner les deux axes dans un score unique ») :
 * `account_score.py` (5 axes /25 — Fit/Timing/Accessibilité/Concurrence/
 * Capacité) reste LE verdict GO/PRUDENT/STOP/EXPLORER canonique du compte —
 * ce fichier ne le remplace pas, ne le recalcule pas, et ne lui ajoute aucune
 * colonne. Il PROJETTE deux groupes de facteurs NOMMÉS, disjoints, sur ce qui
 * existe déjà :
 *
 * - `AccountStrategy5P` (BEL-SC-225, #3254) — `perimeter` (filiale/BU
 *   identifiée), `people` (sponsors/procurement/blockers par `Contact`),
 *   `passage` (voie d'accès) et `proof` (preuve mobilisable). La plupart de
 *   `passage`/`proof` restent `missing` AUJOURD'HUI (aucune source canonique
 *   câblée — épopée #3260) ; ce fichier les LIT tels quels plutôt que de les
 *   redériver en parallèle, pour qu'un futur branchement de #3260 nourrisse
 *   cette matrice SANS toucher ce fichier (GA-26 : un seul endroit).
 * - `AccountAnalysis` directement, pour les facteurs d'intérêt qu'aucune des
 *   cinq dimensions 5P ne porte (adéquation offre, potentiel de besoin,
 *   mouvement actuel) — terrain neuf, pas de doublon.
 * - `account_partners` (table réelle PAR COMPTE, `AccountPartnerEntity`) pour
 *   « partenaire en place » — la seule preuve qu'une relation partenaire
 *   existe VRAIMENT sur CE compte (à ne pas confondre avec `partner-pipeline`,
 *   qui note la relation avec l'ESN partenaire elle-même, une lecture
 *   PORTEFEUILLE — voir le docblock de tête de `partner-pipeline.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SIGNAL PAR FACTEUR, BANDE QUALITATIVE PAR AXE — JAMAIS UN NOMBRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque facteur porte un `status` (vocabulaire 5P, `AccountStrategy5PElement`)
 * et un `signal` : `'favorable' | 'unfavorable' | null`. `null` quand le
 * statut n'est pas connu (`missing`/`inferred`) OU périmé (`stale` — une
 * relation ancienne ne prouve pas un accès actif, règle du ticket). La bande
 * par axe (`'high' | 'medium' | 'low' | 'insufficient_data'`) se calcule sur
 * le RATIO de facteurs favorables parmi les seuls facteurs CONNUS — jamais un
 * pourcentage affiché (doctrine c26), et `insufficient_data` sous
 * {@link MIN_KNOWN_FACTORS_FOR_BAND} facteurs connus : une inconnue ne vaut
 * pas zéro.
 *
 * Le quadrant (`priority_now` / `strategic_long_road` / `short_measured_test`
 * / `no_go_watch`) est une LECTURE croisée des deux bandes — jamais une
 * moyenne, jamais une somme. Indisponible (`null` + raison nommée) tant que
 * l'un des deux axes est `insufficient_data`.
 */

/* ───────────────────────── Facteurs — clés canoniques ───────────────────────── */

export const ACCOUNT_INTEREST_FACTOR_KEYS = [
  'offer_fit',
  'need_potential',
  'economic_value',
  'recurrence_potential',
  'extension_potential',
  'delivery_fit',
  'consultant_fit',
  'current_momentum',
] as const
export type AccountInterestFactorKey = (typeof ACCOUNT_INTEREST_FACTOR_KEYS)[number]

export const ACCOUNT_PENETRABILITY_FACTOR_KEYS = [
  'existing_relationship',
  'partner_in_place',
  'former_consultant',
  'sponsor_identified',
  'purchasing_barriers',
  'referencing_status',
  'sales_cycle',
  'subsidiary_autonomy',
  'relative_size',
  'people_accessibility',
  'available_proof',
] as const
export type AccountPenetrabilityFactorKey = (typeof ACCOUNT_PENETRABILITY_FACTOR_KEYS)[number]

export const ACCOUNT_INTEREST_PENETRABILITY_SIGNALS = ['favorable', 'unfavorable'] as const
export type AccountInterestPenetrabilitySignal = (typeof ACCOUNT_INTEREST_PENETRABILITY_SIGNALS)[number]

export const ACCOUNT_INTEREST_PENETRABILITY_BANDS = ['high', 'medium', 'low', 'insufficient_data'] as const
export type AccountInterestPenetrabilityBand = (typeof ACCOUNT_INTEREST_PENETRABILITY_BANDS)[number]

export const ACCOUNT_INTEREST_PENETRABILITY_QUADRANTS = [
  'priority_now',
  'strategic_long_road',
  'short_measured_test',
  'no_go_watch',
] as const
export type AccountInterestPenetrabilityQuadrant = (typeof ACCOUNT_INTEREST_PENETRABILITY_QUADRANTS)[number]

export type AccountInterestPenetrabilityFactor<K extends string> = {
  key: K
  status: AccountStrategy5PElementStatus
  /** `null` quand `status` n'est pas connu, ou périmé (`stale`). */
  signal: AccountInterestPenetrabilitySignal | null
  /** Le fait qui justifie `signal` — jamais une phrase inventée. */
  evidence: string | null
}

export const accountInterestPenetrabilityFactorSchema = z.object({
  key: z.string(),
  status: accountStrategy5PElementStatusSchema,
  signal: z.enum(ACCOUNT_INTEREST_PENETRABILITY_SIGNALS).nullable(),
  evidence: z.string().nullable(),
})

export type AccountInterestPenetrabilityAxis<K extends string> = {
  factors: AccountInterestPenetrabilityFactor<K>[]
  band: AccountInterestPenetrabilityBand
  /** Facteurs CONNUS (statut dans le calcul) sur le total — jamais un %. */
  known: number
  total: number
}

export type AccountInterestPenetrability = {
  accountId: string
  interest: AccountInterestPenetrabilityAxis<AccountInterestFactorKey>
  penetrability: AccountInterestPenetrabilityAxis<AccountPenetrabilityFactorKey>
  quadrant: AccountInterestPenetrabilityQuadrant | null
  quadrantUnavailableReason: string | null
}

/* ───────────────────────── Presets (seuils) ───────────────────────── */

/** Sous ce nombre de facteurs connus, pas de bande déterminée (« une
 *  inconnue ne vaut pas zéro ») — même discipline que
 *  `MIN_DORMANT_REACTIVATION_AXES_FOR_SCORE`. Preset réglable, pas une loi. */
export const MIN_KNOWN_FACTORS_FOR_BAND = 3

/** Ratio de facteurs favorables (parmi les connus) à partir duquel l'axe
 *  passe « élevé » / « moyen ». Presets locaux, documentés — même discipline
 *  que `account_score.py` (`_GO_MIN`, `_PRUDENT_MIN`). */
const HIGH_RATIO = 0.6
const MEDIUM_RATIO = 0.35

function bandFromRatio(known: number, favorable: number): AccountInterestPenetrabilityBand {
  if (known < MIN_KNOWN_FACTORS_FOR_BAND) return 'insufficient_data'
  const ratio = favorable / known
  if (ratio >= HIGH_RATIO) return 'high'
  if (ratio >= MEDIUM_RATIO) return 'medium'
  return 'low'
}

function axisFrom<K extends string>(
  factors: AccountInterestPenetrabilityFactor<K>[],
): AccountInterestPenetrabilityAxis<K> {
  const known = factors.filter(f => isElementKnown(f.status)).length
  const favorable = factors.filter(f => f.signal === 'favorable').length
  return { factors, band: bandFromRatio(known, favorable), known, total: factors.length }
}

/* ───────────────────────── Lecture d'un élément 5P ───────────────────────── */

/** Lit un `AccountStrategy5PElement<string>` sans jamais lire un `stale`
 *  comme un accès actif (règle du ticket) ni deviner un signal négatif sur
 *  du `missing`/`inferred` — ce que la source ne sait pas encore chercher
 *  (`passage`/`proof`, épopée #3260) n'est pas « aucune voie ». */
function fromKnownStringElement<K extends string>(
  key: K,
  element: AccountStrategy5PElement<unknown>,
): AccountInterestPenetrabilityFactor<K> {
  if (!isElementKnown(element.status)) {
    return { key, status: element.status, signal: null, evidence: null }
  }
  return {
    key,
    status: element.status,
    signal: 'favorable',
    evidence: typeof element.value === 'string' ? element.value : String(element.value),
  }
}

/**
 * #3277 — « Compatibilité consultant » ne REDIT pas les noms : ils vivent déjà sous « Voie d'accès » de
 * la carte 5P (un nom ne s'affiche qu'une fois). Le facteur garde son statut et donne le NOMBRE de
 * consultants placés, lu de `relevant_consultant` (« Nom, Nom, … » — `uniqueNames(...).join(', ')`).
 */
function consultantFitFactor(
  element: AccountStrategy5PElement<unknown>,
): AccountInterestPenetrabilityFactor<'consultant_fit'> {
  const factor = fromKnownStringElement('consultant_fit', element)
  if (factor.evidence === null || typeof element.value !== 'string') return factor
  const count = element.value.split(', ').filter(name => name.trim() !== '').length
  if (count === 0) return factor
  return {
    ...factor,
    evidence:
      count === 1 ? '1 consultant déjà placé chez ce compte' : `${count} consultants déjà placés chez ce compte`,
  }
}

function firstKnown<K extends string>(
  key: K,
  elements: readonly AccountStrategy5PElement<unknown>[],
): AccountInterestPenetrabilityFactor<K> {
  const known = elements.find(el => isElementKnown(el.status))
  if (known) return fromKnownStringElement(key, known)
  const stale = elements.find(el => el.status === 'stale')
  if (stale) return { key, status: 'stale', signal: null, evidence: null }
  return { key, status: 'missing', signal: null, evidence: null }
}

function arrayFactor<K extends string, T>(
  key: K,
  element: AccountStrategy5PElement<T[]>,
  favorableWhen: (value: T[]) => boolean,
  evidence: (value: T[]) => string,
): AccountInterestPenetrabilityFactor<K> {
  if (!isElementKnown(element.status) || element.value === null) {
    return { key, status: element.status, signal: null, evidence: null }
  }
  return {
    key,
    status: element.status,
    signal: favorableWhen(element.value) ? 'favorable' : 'unfavorable',
    evidence: evidence(element.value),
  }
}

/** Un tableau NON PROJETÉ (raw_analysis) : `undefined` = jamais calculé
 *  (`missing`), `[]` = calculé, aucun résultat (`observed`, défavorable). */
function rawArrayFactor<K extends string, T>(
  key: K,
  value: T[] | undefined,
  evidence: (value: T[]) => string,
): AccountInterestPenetrabilityFactor<K> {
  if (value === undefined) return { key, status: 'missing', signal: null, evidence: null }
  return { key, status: 'observed', signal: value.length > 0 ? 'favorable' : 'unfavorable', evidence: evidence(value) }
}

function missingFactor<K extends string>(key: K): AccountInterestPenetrabilityFactor<K> {
  return { key, status: 'missing', signal: null, evidence: null }
}

/* ───────────────────────── Dérivation — INTEREST ───────────────────────── */

function deriveInterestFactors(analysis: AccountAnalysis, strategy5P: Strategy5PSlice) {
  return [
    rawArrayFactor(
      'offer_fit',
      analysis.qualified_hypotheses,
      v => `${v.length} hypothèse(s) qualifiée(s) reliant un signal à un angle ESN`,
    ),
    rawArrayFactor('need_potential', analysis.it_challenges, v => `${v.length} enjeu(x) IT identifié(s)`),
    // Aucune source canonique aujourd'hui : ni le montant d'une mission cible
    // ni un CA estimé ne sont posés sur le compte. Rester `missing` plutôt
    // que de le déduire de la taille de l'entreprise (règle du ticket : le
    // prestige du logo n'augmente pas automatiquement l'intérêt).
    missingFactor('economic_value'),
    missingFactor('recurrence_potential'),
    missingFactor('extension_potential'),
    // P4 (Proof) — `comparable_reference` / `relevant_consultant` restent
    // `missing` tant que #3260 ne les câble pas ; lus ici tels quels.
    fromKnownStringElement('delivery_fit', strategy5P.proof.comparable_reference),
    consultantFitFactor(strategy5P.proof.relevant_consultant),
    rawArrayFactor('current_momentum', analysis.recent_signals, v => `${v.length} signal(aux) récent(s)`),
  ]
}

/* ───────────────────────── Dérivation — PENETRABILITY ───────────────────────── */

export type AccountInterestPenetrabilityPartnerInput = {
  relationship: string
  placements: number
  dismissed_at: string | null
}

export type AccountInterestPenetrabilityContactInput = {
  id: string
  email_verified: boolean
}

type Strategy5PSlice = Pick<AccountStrategy5P, 'perimeter' | 'people' | 'passage' | 'proof'>

function derivePartnerInPlace(
  partners: readonly AccountInterestPenetrabilityPartnerInput[],
): AccountInterestPenetrabilityFactor<'partner_in_place'> {
  const active = partners.filter(p => p.relationship === 'partner' && p.dismissed_at === null)
  if (partners.length === 0) return missingFactor('partner_in_place')
  if (active.length === 0) {
    return {
      key: 'partner_in_place',
      status: 'observed',
      signal: 'unfavorable',
      evidence: 'Aucun partenaire actif en place sur ce compte',
    }
  }
  const withPlacements = active.filter(p => p.placements > 0)
  return {
    key: 'partner_in_place',
    status: 'observed',
    signal: 'favorable',
    evidence:
      withPlacements.length > 0
        ? `Partenaire en place, ${withPlacements.reduce((s, p) => s + p.placements, 0)} placement(s)`
        : 'Partenaire déclaré en place sur ce compte',
  }
}

/** Filiale/BU précisément identifiée = voie d'accès plus étroite (favorable) ;
 *  seul le groupe/la maison mère connue, sans entité précise = voie d'accès
 *  la plus large et la plus difficile (défavorable) — jamais l'inverse : la
 *  taille du groupe ne prouve rien par elle-même (règle du ticket). */
function deriveSubsidiaryAutonomy(
  perimeter: Strategy5PSlice['perimeter'],
): AccountInterestPenetrabilityFactor<'subsidiary_autonomy'> {
  const precise = [perimeter.subsidiary, perimeter.business_unit].find(el => isElementKnown(el.status))
  if (precise) {
    return { key: 'subsidiary_autonomy', status: precise.status, signal: 'favorable', evidence: String(precise.value) }
  }
  const onlyGroup = [perimeter.group, perimeter.parent_company].find(el => isElementKnown(el.status))
  if (onlyGroup) {
    return {
      key: 'subsidiary_autonomy',
      status: onlyGroup.status,
      signal: 'unfavorable',
      evidence: `Seul le groupe est identifié : ${String(onlyGroup.value)}`,
    }
  }
  return missingFactor('subsidiary_autonomy')
}

/** Barrière achats : un `blocker` connu est un signal négatif direct ; un
 *  `procurement` connu SANS `blocker` connu est un signal positif (porte
 *  achats identifiée, aucun frein connu) ; sinon `missing`. */
function derivePurchasingBarriers(
  people: Strategy5PSlice['people'],
): AccountInterestPenetrabilityFactor<'purchasing_barriers'> {
  if (isElementKnown(people.blockers.status) && (people.blockers.value?.length ?? 0) > 0) {
    return {
      key: 'purchasing_barriers',
      status: people.blockers.status,
      signal: 'unfavorable',
      evidence: 'Un bloqueur achats est identifié sur ce compte',
    }
  }
  if (isElementKnown(people.procurement.status) && (people.procurement.value?.length ?? 0) > 0) {
    return {
      key: 'purchasing_barriers',
      status: people.procurement.status,
      signal: 'favorable',
      evidence: 'Un contact achats est identifié, aucun bloqueur connu',
    }
  }
  return missingFactor('purchasing_barriers')
}

/** Accessibilité des personnes = la QUALITÉ de l'accès, jamais le NOMBRE de
 *  contacts (règle du ticket) : au moins une personne à rôle décisionnaire
 *  connu (5P `people`) ET à coordonnée VÉRIFIÉE (`Contact.email_verified`). */
function derivePeopleAccessibility(
  people: Strategy5PSlice['people'],
  contacts: readonly AccountInterestPenetrabilityContactInput[],
): AccountInterestPenetrabilityFactor<'people_accessibility'> {
  const verifiedIds = new Set(contacts.filter(c => c.email_verified).map(c => c.id))
  const decisionRefs = [
    people.champions,
    people.economic_deciders,
    people.technical_references,
    people.users,
    people.sponsors,
  ]
  const known = decisionRefs.filter(el => isElementKnown(el.status))
  if (known.length === 0) return missingFactor('people_accessibility')
  const hasVerifiedDecisionMaker = known.some(el => (el.value ?? []).some(ref => verifiedIds.has(ref.contactId)))
  return {
    key: 'people_accessibility',
    status: 'observed',
    signal: hasVerifiedDecisionMaker ? 'favorable' : 'unfavorable',
    evidence: hasVerifiedDecisionMaker
      ? 'Au moins un décideur identifié a une coordonnée vérifiée'
      : 'Des décideurs sont identifiés, aucune coordonnée vérifiée',
  }
}

/**
 * #3277 (X64, recette 02/10) — « Ancien consultant » ne REDIT pas les noms : ils vivent déjà sous
 * « Voie d'accès » de la carte 5P (NOVA LOGISTIQUE montrait « Léa Fontaine, Camille Roussel » deux fois).
 * Le facteur garde son statut et donne le NOMBRE, lu de la même liste « Nom, Nom, … » — l'ancien
 * consultant d'abord, sinon celui en poste (même ordre que `firstKnown` avant ce lot).
 */
function formerConsultantFactor(
  former: AccountStrategy5PElement<unknown>,
  current: AccountStrategy5PElement<unknown>,
): AccountInterestPenetrabilityFactor<'former_consultant'> {
  const source = isElementKnown(former.status) ? 'former' : 'current'
  const factor = firstKnown('former_consultant', [former, current])
  const element = source === 'former' ? former : current
  if (factor.evidence === null || typeof element.value !== 'string') return factor
  const count = element.value.split(', ').filter(name => name.trim() !== '').length
  if (count === 0) return factor
  const plural = count > 1
  return {
    ...factor,
    evidence:
      source === 'former'
        ? `${count} ${plural ? 'anciens consultants passés' : 'ancien consultant passé'} chez ce compte`
        : `${count} ${plural ? 'consultants en poste' : 'consultant en poste'} chez ce compte`,
  }
}

function derivePenetrabilityFactors(
  strategy5P: Strategy5PSlice,
  contacts: readonly AccountInterestPenetrabilityContactInput[],
  partners: readonly AccountInterestPenetrabilityPartnerInput[],
) {
  const { people, passage, proof, perimeter } = strategy5P
  return [
    firstKnown('existing_relationship', [passage.common_relationship, passage.former_colleague, passage.alumni]),
    derivePartnerInPlace(partners),
    formerConsultantFactor(passage.former_consultant, passage.current_consultant),
    // La taxonomie MEDDIC actuelle n'a pas de rôle distinct « sponsor »
    // (`sponsor` dans `decisionRoleSchema` est une valeur LEGACY, plus
    // émise — voir `contact.ts`) ; `people.sponsors` reste donc `missing`
    // par construction, honnêtement, comme dans `AccountStrategy5P`.
    fromKnownStringElement('sponsor_identified', people.sponsors as unknown as AccountStrategy5PElement<unknown>),
    derivePurchasingBarriers(people),
    firstKnown('referencing_status', [passage.referenced_esn, passage.rank_2]),
    // Aucune source canonique aujourd'hui pour la durée/l'étape d'un cycle
    // d'achat par compte.
    missingFactor('sales_cycle'),
    deriveSubsidiaryAutonomy(perimeter),
    // Aucune source canonique aujourd'hui : la taille de l'ESN elle-même
    // n'est lue nulle part à cet endroit — inventer la comparaison
    // confondrait « taille relative » avec le prestige du logo, exactement
    // ce que le NO-GO du ticket interdit.
    missingFactor('relative_size'),
    derivePeopleAccessibility(people, contacts),
    firstKnown('available_proof', [proof.client_case, proof.relationship_proof]),
  ]
}

/* ───────────────────────── API publique ───────────────────────── */

export type AccountInterestPenetrabilityInput = {
  accountId: string
  analysis: AccountAnalysis
  strategy5P: Strategy5PSlice
  contacts: readonly AccountInterestPenetrabilityContactInput[]
  partners: readonly AccountInterestPenetrabilityPartnerInput[]
}

const QUADRANT_BY_HIGHNESS: Record<
  'high-high' | 'high-low' | 'low-high' | 'low-low',
  AccountInterestPenetrabilityQuadrant
> = {
  'high-high': 'priority_now',
  'high-low': 'strategic_long_road',
  'low-high': 'short_measured_test',
  'low-low': 'no_go_watch',
}

function computeQuadrant(
  interest: AccountInterestPenetrabilityAxis<AccountInterestFactorKey>,
  penetrability: AccountInterestPenetrabilityAxis<AccountPenetrabilityFactorKey>,
): { quadrant: AccountInterestPenetrabilityQuadrant | null; reason: string | null } {
  if (interest.band === 'insufficient_data' || penetrability.band === 'insufficient_data') {
    return {
      quadrant: null,
      reason:
        interest.band === 'insufficient_data' && penetrability.band === 'insufficient_data'
          ? "Ni l'intérêt ni la pénétrabilité n'ont assez de facteurs connus"
          : interest.band === 'insufficient_data'
            ? "L'axe intérêt n'a pas assez de facteurs connus"
            : "L'axe pénétrabilité n'a pas assez de facteurs connus",
    }
  }
  const key = `${interest.band === 'high' ? 'high' : 'low'}-${penetrability.band === 'high' ? 'high' : 'low'}` as const
  return { quadrant: QUADRANT_BY_HIGHNESS[key], reason: null }
}

export function deriveAccountInterestPenetrability(
  input: AccountInterestPenetrabilityInput,
): AccountInterestPenetrability {
  const interest = axisFrom(deriveInterestFactors(input.analysis, input.strategy5P))
  const penetrability = axisFrom(derivePenetrabilityFactors(input.strategy5P, input.contacts, input.partners))
  const { quadrant, reason } = computeQuadrant(interest, penetrability)
  return { accountId: input.accountId, interest, penetrability, quadrant, quadrantUnavailableReason: reason }
}

/* ───────────────────────── Simulation ───────────────────────── */

export type AccountInterestPenetrabilitySimulationOverride = Partial<
  Record<AccountInterestFactorKey | AccountPenetrabilityFactorKey, AccountInterestPenetrabilitySignal>
>

export type SimulatedAccountInterestPenetrability = AccountInterestPenetrability & { isSimulation: true }

/**
 * UX du ticket : « permettre de simuler avec/sans partenaire, avec une
 * nouvelle référence, sur une filiale plutôt que le groupe ». Un simulateur
 * PUR : il ne touche à AUCUNE donnée persistée, il rejoue le même calcul de
 * bande/quadrant avec un ou plusieurs facteurs forcés — jamais un second
 * moteur concurrent (`axisFrom`/`computeQuadrant` restent les seules
 * fonctions qui savent lire une bande ou un quadrant).
 */
export function simulateAccountInterestPenetrability(
  base: AccountInterestPenetrability,
  overrides: AccountInterestPenetrabilitySimulationOverride,
): SimulatedAccountInterestPenetrability {
  const applyOverrides = <K extends string>(factors: AccountInterestPenetrabilityFactor<K>[]) =>
    factors.map(f => {
      const forced = overrides[f.key as AccountInterestFactorKey | AccountPenetrabilityFactorKey]
      if (!forced) return f
      return { ...f, status: 'user_supplied' as const, signal: forced, evidence: 'Simulation' }
    })

  const interest = axisFrom(applyOverrides(base.interest.factors))
  const penetrability = axisFrom(applyOverrides(base.penetrability.factors))
  const { quadrant, reason } = computeQuadrant(interest, penetrability)
  return {
    accountId: base.accountId,
    interest,
    penetrability,
    quadrant,
    quadrantUnavailableReason: reason,
    isSimulation: true,
  }
}

/** Même discipline que `isAccountStrategy5PUnavailable` : une façade
 *  `@Optional()` non montée rend `{ status: 'unavailable' }`, jamais une
 *  matrice vide qui se lirait à tort comme « on ne sait rien de ce compte ». */
export function isAccountInterestPenetrabilityUnavailable(
  value: AccountInterestPenetrability | { status: 'unavailable' } | null | undefined,
): value is { status: 'unavailable' } {
  return Boolean(value && 'status' in value && value.status === 'unavailable')
}

/* ───────────────────────── Portefeuille — #3258.13 (épopée #3362, lot P01) ───────────────────────── */

/**
 * BEL-SC-229 (#3258.13, épopée #3362) — LA LECTURE PORTEFEUILLE.
 *
 * Le bilan du 29/09 sur #3362 l'écarte du lot précédent en le nommant « un
 * système à part » : `AccountInterestPenetrabilityService.matrixFor` (et le
 * hook `useAccountInterestPenetrability`) ne lisaient qu'UN compte à la
 * fois — le même contrat qu'`AccountStrategy5P` (#3254). Ce qui suit ne
 * redérive AUCUN facteur : `deriveAccountInterestPenetrability` reste la
 * SEULE fonction qui sait lire un axe ou un quadrant (GA-26) ; une
 * `AccountInterestPenetrabilityPortfolioEntry` ne porte QUE le résultat déjà
 * posé par compte — jamais les facteurs eux-mêmes, qui restent sur la fiche
 * compte (un survol de portefeuille n'en a pas besoin).
 */
export type AccountInterestPenetrabilityPortfolioEntry = {
  accountId: string
  companyName: string
  quadrant: AccountInterestPenetrabilityQuadrant | null
  /** Nommé quand `quadrant` est `null` — même discipline que sur un seul compte. */
  quadrantUnavailableReason: string | null
}

/** Au-delà, la lecture s'arrête et le dit (`truncated`) plutôt que de faire
 *  grossir silencieusement le temps de réponse d'un écran de synthèse — même
 *  discipline que le plafond des outils Laura (`_capped`, apps/ia). */
export const MAX_INTEREST_PENETRABILITY_PORTFOLIO_ACCOUNTS = 300

export type AccountInterestPenetrabilityPortfolio = {
  entries: AccountInterestPenetrabilityPortfolioEntry[]
  /** Le nombre RÉEL de comptes du périmètre lu, jamais celui des `entries`
   *  retenues — les deux ne divergent que si `truncated` est vrai. */
  totalAccounts: number
  truncated: boolean
}

export type AccountInterestPenetrabilityQuadrantCount = {
  quadrant: AccountInterestPenetrabilityQuadrant
  count: number
}

export type AccountInterestPenetrabilityPortfolioSummary = {
  /** Les quatre quadrants, TOUJOURS les quatre et dans l'ordre canonique —
   *  un quadrant à zéro est une mesure réelle (« zéro compte y est
   *  aujourd'hui »), pas une absence : il garde sa ligne. */
  byQuadrant: AccountInterestPenetrabilityQuadrantCount[]
  /** Comptes dont le quadrant est `null` (l'un des deux axes en
   *  `insufficient_data`) — NOMMÉS à part, jamais fondus dans un quadrant ni
   *  comptés comme `no_go_watch`. */
  unavailable: number
  countedAccounts: number
}

/**
 * Compte, ne dérive pas : chaque `quadrant` arrive déjà tranché par
 * `deriveAccountInterestPenetrability`. Un total qui recalculerait la bande
 * ou le quadrant serait un second moteur — exactement ce que le docblock de
 * tête de ce fichier interdit.
 */
export function summarizeAccountInterestPenetrabilityPortfolio(
  portfolio: AccountInterestPenetrabilityPortfolio,
): AccountInterestPenetrabilityPortfolioSummary {
  const byQuadrant = ACCOUNT_INTEREST_PENETRABILITY_QUADRANTS.map(quadrant => ({
    quadrant,
    count: portfolio.entries.filter(entry => entry.quadrant === quadrant).length,
  }))
  const unavailable = portfolio.entries.filter(entry => entry.quadrant === null).length
  return { byQuadrant, unavailable, countedAccounts: portfolio.entries.length }
}

/** Même discipline que `isAccountInterestPenetrabilityUnavailable` juste plus
 *  haut, pour la façade portefeuille. */
export function isAccountInterestPenetrabilityPortfolioUnavailable(
  value: AccountInterestPenetrabilityPortfolio | { status: 'unavailable' } | null | undefined,
): value is { status: 'unavailable' } {
  return Boolean(value && 'status' in value && value.status === 'unavailable')
}
