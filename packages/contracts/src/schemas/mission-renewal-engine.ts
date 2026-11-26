import { daysUntilEnd, type RenewalStatus } from './mission.js'
import type { RenewalClientRail, RenewalConsultantRail } from './mission-renewal-rail.js'

/**
 * LE MOTEUR DE CADENCE — T-60 / T-30 / T-15 / T-0 (#2413.1 à .48, épopée
 * #2965 — LAU-FINAL-127, suite du dual track livré le 25/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER N'EST PAS UNE DEUXIÈME ÉCHELLE DE FENÊTRES (GA-26)
 * ─────────────────────────────────────────────────────────────────────────────
 * `mission.ts` porte déjà une échelle de fenêtres réglable par espace
 * (`RENEWAL_WINDOWS`, `renewalWindow()`, #2195.8) — quatre paliers `j15` à
 * `j60`, plus `imminent`/`overdue`/`unknown`/`far`. L'épopée #2413 en demande
 * une SECONDE, nommée différemment (`T-60`…`T-0`) mais avec les MÊMES bornes
 * par défaut. Construire une deuxième colonne réglable par espace aurait été
 * exactement la faute que GA-26 punit : un réglage qui vit à deux endroits
 * finit par diverger.
 *
 * Ce que #2413 apporte de RÉELLEMENT neuf n'est pas l'échelle elle-même, mais
 * deux ajustements qu'aucun des deux systèmes ne fait aujourd'hui :
 * le PRÉAVIS (#2413.2, .25) qui avance l'horloge, et la DURÉE de la mission
 * (#2413.26) qui la resserre. `renewalEngineTier` les applique sur les MÊMES
 * bornes par défaut (60/30/15 jours) que `RENEWAL_WINDOW_SLOTS` — elle n'est
 * PAS réglable par espace, parce que rien dans #2413 ne le demande, et lui
 * ajouter un réglage sans qu'on le demande serait une divergence de plus.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES 12 ÉTATS NOMMÉS SONT DÉRIVÉS, JAMAIS PERSISTÉS (décision du lot,
 * cf. `LOTS-JOUR-26-09.md` : « nouvelle énumération dérivée plutôt que
 * renommer l'existant »)
 * ─────────────────────────────────────────────────────────────────────────────
 * `RENEWAL_STATUSES` (`mission.ts`) est GELÉ par GA-08 : huit valeurs FR,
 * saisies par un humain, dont la contrainte SQL (`missions_renewal_status_check`,
 * migration `1795100000001`) ne bouge plus sans qu'une valeur soit ajoutée EN
 * FIN. Les renommer en anglais, ou en ajouter quatre pour porter la
 * granularité que #2413 demande, romprait ce gel pour un gain cosmétique.
 *
 * `deriveRenewalEngineState` ne touche donc RIEN en base : elle CALCULE, à la
 * lecture, un état plus fin à partir de ce qui existe déjà — `renewal_status`,
 * les deux rails du dual track (#2413.49 à .57) et le palier de cadence. Le
 * même principe que `renewalWindow()` (calculée depuis `ends_on`, jamais
 * stockée) et `activeMissionNextAction` (dérivée de `renewal`, jamais une
 * deuxième colonne).
 */

// ── Cadence T-60 / T-30 / T-15 / T-0 (#2413.1, .2, .6, .25, .26) ────────────

export const RENEWAL_ENGINE_TIERS = ['t60', 't30', 't15', 't0'] as const
export type RenewalEngineTier = (typeof RENEWAL_ENGINE_TIERS)[number]

/** Les trois bornes hautes (`t0` est toujours 0, le seuil n'a pas à se dire). */
type RenewalEngineTierThresholds = readonly [t60: number, t30: number, t15: number]
const DEFAULT_RENEWAL_ENGINE_THRESHOLDS: RenewalEngineTierThresholds = [60, 30, 15]

function missionDurationDays(startedOn: string | null | undefined, endsOn: string | null | undefined): number | null {
  if (!startedOn || !endsOn) return null
  const start = new Date(startedOn)
  const end = new Date(endsOn)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000)
  return days > 0 ? days : null
}

/**
 * #2413.26 — une mission de vingt jours ne peut pas porter un préavis de
 * soixante : l'échelle se resserre PROPORTIONNELLEMENT à sa durée, jamais en
 * dessous de la durée elle-même n'a de sens à comparer. Une mission de
 * soixante jours ou plus, ou de durée inconnue, garde l'échelle par défaut —
 * on ne resserre que ce qu'on sait être court.
 */
function renewalEngineTierThresholds(durationDays: number | null): RenewalEngineTierThresholds {
  if (durationDays === null || durationDays >= DEFAULT_RENEWAL_ENGINE_THRESHOLDS[0]) {
    return DEFAULT_RENEWAL_ENGINE_THRESHOLDS
  }
  const scale = durationDays / DEFAULT_RENEWAL_ENGINE_THRESHOLDS[0]
  const t15 = Math.max(1, Math.round(DEFAULT_RENEWAL_ENGINE_THRESHOLDS[2] * scale))
  const t30 = Math.max(t15 + 1, Math.round(DEFAULT_RENEWAL_ENGINE_THRESHOLDS[1] * scale))
  const t60 = Math.max(t30 + 1, Math.round(DEFAULT_RENEWAL_ENGINE_THRESHOLDS[0] * scale))
  return [t60, t30, t15]
}

/**
 * Le palier de cadence d'une mission — `unknown` sans date de fin, `not_due`
 * loin de l'échéance, sinon `t60`/`t30`/`t15`/`t0`.
 *
 * `noticePeriodDays` (#2413.2, .25) AVANCE l'horloge : un préavis de trois
 * mois sur une fin dans cent jours ne laisse que dix jours utiles, et la
 * mission entre dans le cycle bien avant qu'une lecture brute de `endsOn` ne
 * le dirait.
 */
export function renewalEngineTier(
  input: { endsOn: string | null | undefined; startedOn?: string | null; noticePeriodDays?: number | null },
  today: Date = new Date(),
): RenewalEngineTier | 'not_due' | 'unknown' {
  const rawDays = daysUntilEnd(input.endsOn, today)
  if (rawDays === null) return 'unknown'
  const days = rawDays - (input.noticePeriodDays ?? 0)
  const [t60, t30, t15] = renewalEngineTierThresholds(missionDurationDays(input.startedOn, input.endsOn))
  if (days <= 0) return 't0'
  if (days <= t15) return 't15'
  if (days <= t30) return 't30'
  if (days <= t60) return 't60'
  return 'not_due'
}

// ── 8 facteurs moteur (#2413.28 à .35) ──────────────────────────────────────

/**
 * L'ORDRE est celui de l'issue #2413 (§ « 8 facteurs moteur »). Il n'a pas
 * besoin du gel GA-08 — rien de ceci ne s'écrit en base, une réorganisation ne
 * casserait aucune ligne existante — mais on le garde stable par discipline
 * (GA-26) : un affichage qui trie ces huit clés ne doit pas diverger d'un
 * appel à l'autre.
 */
export const RENEWAL_ENGINE_FACTOR_KEYS = [
  'preavis',
  'historique_client',
  'cycle_achats',
  'bon_de_commande',
  'satisfaction',
  'consultant',
  'marge',
  'besoins_adjacents',
] as const
export type RenewalEngineFactorKey = (typeof RENEWAL_ENGINE_FACTOR_KEYS)[number]

/**
 * Un facteur ne porte JAMAIS de valeur inventée : `status: 'absent'` nomme,
 * avec sa raison, ce que le produit ne mesure pas — jamais un `null` nu qui
 * se lirait comme un zéro (doctrine « non mesuré ≠ 0 »).
 */
export type RenewalEngineFactor = {
  key: RenewalEngineFactorKey
  status: 'mesure' | 'absent'
  value: number | boolean | null
  raisonAbsence: string | null
}

function mesure(key: RenewalEngineFactorKey, value: number | boolean): RenewalEngineFactor {
  return { key, status: 'mesure', value, raisonAbsence: null }
}

function absent(key: RenewalEngineFactorKey, raisonAbsence: string): RenewalEngineFactor {
  return { key, status: 'absent', value: null, raisonAbsence }
}

function adjacentNeedsFactor(openNeeds: 'present' | 'absent' | 'non_mesure' | undefined): RenewalEngineFactor {
  if (openNeeds === 'present') return mesure('besoins_adjacents', true)
  if (openNeeds === 'absent') return mesure('besoins_adjacents', false)
  if (openNeeds === 'non_mesure') {
    return absent('besoins_adjacents', 'aucune compétence typée sur le consultant affecté : besoins non croisés')
  }
  return absent('besoins_adjacents', 'aucune collecte de besoins adjacents à ce jour')
}

/**
 * Les huit facteurs, dans l'ordre de l'issue. Quatre sont RELIÉS à une donnée
 * qui existe déjà ailleurs dans le produit (préavis une fois saisi, bon de
 * commande, consultant affecté, marge) ; quatre restent `absent` parce que le
 * produit ne les collecte pas — `satisfaction` par la même absence assumée que
 * `mission-drift.service.ts` (« aucune donnée de satisfaction, ni table »),
 * les trois autres faute de toute source trouvée au tri du 17/09/2026
 * (registre `.claude/notes/registre-2026-09-17-lau-127-2413.md`).
 *
 * Jamais de donnée fictive : un appelant qui n'a pas encore la donnée passe
 * `null` (préavis, marge) plutôt que d'en deviner une.
 */
export function renewalEngineFactors(input: {
  noticePeriodDays: number | null
  /** `null` = la présence d'un bon de commande n'a pas été lue par l'appelant
   *  (décoration légère d'une mission qu'on vient d'écrire) — distinct de
   *  `false`, qui affirme qu'aucun PO n'est renseigné. */
  hasPurchaseOrder: boolean | null
  /** `null` = les affectations n'ont pas été lues par l'appelant — distinct
   *  de `false`, qui affirme qu'aucun consultant n'est affecté. */
  hasActiveConsultant: boolean | null
  /** `null` couvre les deux cas déjà distingués par `marginPercent` ailleurs
   *  (D45) : coût non renseigné, ou lecteur sans `finance:read`. */
  marginPercent: number | null
  /** #2414.41/.42 — le croisement par lot besoins ouverts × compétences
   *  (`DeliveryService.openNeedsByConsultant`). Omis : le facteur reste absent
   *  comme avant. `non_mesure` : aucune compétence typée, jamais « non ». */
  openNeeds?: 'present' | 'absent' | 'non_mesure'
}): readonly RenewalEngineFactor[] {
  return [
    input.noticePeriodDays !== null
      ? mesure('preavis', input.noticePeriodDays)
      : absent('preavis', 'préavis non renseigné sur la mission'),
    absent('historique_client', 'aucune collecte d’historique client à ce jour'),
    absent('cycle_achats', 'aucune collecte du cycle d’achats à ce jour'),
    input.hasPurchaseOrder !== null
      ? mesure('bon_de_commande', input.hasPurchaseOrder)
      : absent('bon_de_commande', 'bon de commande non chargé pour cette lecture'),
    absent('satisfaction', 'le produit n’a aucune donnée de satisfaction, ni table (absence assumée)'),
    input.hasActiveConsultant !== null
      ? mesure('consultant', input.hasActiveConsultant)
      : absent('consultant', 'affectations non chargées pour cette lecture'),
    input.marginPercent !== null
      ? mesure('marge', input.marginPercent)
      : absent('marge', 'marge non mesurée, ou hors du périmètre de qui lit'),
    adjacentNeedsFactor(input.openNeeds),
  ]
}

// ── 12 états nommés, dérivés (#2413.36 à .48) ───────────────────────────────

/**
 * Les treize valeurs : les douze que l'issue nomme, plus `unknown` — la même
 * distinction que `renewalWindow()` fait déjà pour les fenêtres (une mission
 * sans date de fin n'est pas « loin », elle est « inconnue »).
 *
 * `unknown` est ajouté EN DERNIER dans cette liste bien qu'elle ne soit pas
 * gelée par GA-08 (rien ici ne s'écrit en base) : la discipline de ne jamais
 * réordonner reste la même que pour toute énumération nommée du produit.
 */
export const RENEWAL_ENGINE_STATES = [
  'not_due',
  'to_prepare',
  'client_feedback_needed',
  'consultant_feedback_needed',
  'commercial_discussion',
  'awaiting_client_decision',
  'awaiting_consultant_decision',
  'awaiting_contract',
  'confirmed',
  'partially_extended',
  'declined',
  'expired',
  'unknown',
] as const
export type RenewalEngineState = (typeof RENEWAL_ENGINE_STATES)[number]

const OPEN_DISCUSSION_STATUSES: readonly RenewalStatus[] = ['discussion_en_cours', 'reconduction_annoncee', 'bloque']

/**
 * Dérive l'état nommé depuis ce qui existe déjà : `renewal_status`, les deux
 * rails du dual track, et le palier de cadence. Ne stocke rien, ne devine
 * rien — chaque branche s'appuie sur un fait déjà écrit par un humain.
 *
 * L'ordre des vérifications compte : les faits les plus définitifs
 * (confirmé, refusé) sont regardés avant les états d'attente, eux-mêmes avant
 * le simple palier de cadence.
 */
export function deriveRenewalEngineState(input: {
  renewalStatus: RenewalStatus | null | undefined
  clientRail: RenewalClientRail | null | undefined
  consultantRail: RenewalConsultantRail | null | undefined
  tier: RenewalEngineTier | 'not_due' | 'unknown'
}): RenewalEngineState {
  const { renewalStatus, tier } = input
  if (tier === 'unknown') return 'unknown'

  const clientIntent = input.clientRail?.intent ?? 'non_demande'
  const consultantIntent = input.consultantRail?.intent ?? 'non_demande'

  // Les faits les plus définitifs d'abord — aucun palier ne les recouvre.
  if (renewalStatus === 'renouvele') return 'confirmed'
  if (renewalStatus === 'fin_confirmee' || renewalStatus === 'repositionnement_lance') return 'declined'
  if (clientIntent === 'non' || consultantIntent === 'non') return 'declined'
  if (clientIntent === 'oui' && consultantIntent === 'oui') return 'awaiting_contract'

  // #2413.22/.23/.24 — les trois issues nommées à T-0.
  if (tier === 't0') {
    if (clientIntent === 'oui' || consultantIntent === 'oui') return 'partially_extended'
    if (!OPEN_DISCUSSION_STATUSES.includes(renewalStatus as RenewalStatus) && renewalStatus !== 'feedback_demande') {
      return 'expired'
    }
  }

  if (renewalStatus === 'feedback_demande') {
    if (clientIntent === 'non_demande') return 'client_feedback_needed'
    if (consultantIntent === 'non_demande') return 'consultant_feedback_needed'
    return 'commercial_discussion'
  }

  if (renewalStatus && OPEN_DISCUSSION_STATUSES.includes(renewalStatus)) {
    if (clientIntent === 'non_demande' && consultantIntent !== 'non_demande') return 'awaiting_client_decision'
    if (consultantIntent === 'non_demande' && clientIntent !== 'non_demande') return 'awaiting_consultant_decision'
    return 'commercial_discussion'
  }

  if (tier === 't60' || tier === 't30' || tier === 't15') return 'to_prepare'
  return 'not_due'
}
