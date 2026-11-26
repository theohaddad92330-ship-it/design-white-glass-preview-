import { missionAvailabilityCertainty, type RenewalStatus } from './mission.js'
import type { RenewalEngineTier } from './mission-renewal-engine.js'

/**
 * LE DÉCLENCHEUR DE REPOSITIONNEMENT — #2414.34 à .48 (épopée #2986), première
 * tranche.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE #2414 DEMANDE, ET CE QUE CETTE TRANCHE EN LIVRE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Le moteur doit commencer suffisamment tôt selon : demande marché, rareté
 * du profil, durée de préavis, contraintes, niveau de confiance sur le
 * renouvellement. » Croiser les cinq (+ opportunités/comptes/signaux/Market
 * Memory/partenaires/relations/historique de présentation) est le chantier
 * pluri-jours déjà signalé (issue #2986, commentaire du 25/09). Trois des cinq
 * facteurs sont déjà des DONNÉES DU PRODUIT, jamais encore CROISÉES pour
 * décider du moment : le préavis (`renewalEngineTier`, #2413.2/.25, qui avance
 * déjà l'horloge du préavis), la confiance sur le renouvellement
 * (`missionAvailabilityCertainty`, #2410.60) et — depuis le 28/09 (#2414.35) —
 * la rareté du profil (`consultant_skills`, le seuil déjà servi au segment
 * « profils rares » du vivier). Cette tranche les croise — aucune collecte
 * neuve, aucun recalcul de ce que ces fonctions font déjà.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ÉTATS NOMMÉS, JAMAIS UN BOOLÉEN NU
 * ─────────────────────────────────────────────────────────────────────────────
 * `a_commencer` / `pas_encore` / `non_mesure` — la même discipline que
 * `renewalWindow()` : une fin inconnue n'est pas « pas encore », elle est
 * « non mesuré », avec sa raison.
 *
 * ⚠️ Ceci ne dit JAMAIS qu'un consultant est disponible, et ne lance AUCUNE
 * recherche : c'est un signal de MOMENT, lu par un écran, jamais un geste
 * automatique (NO-GO de #2414 : jamais disponible avant confirmation).
 */

export const REPOSITION_TRIGGER_STATES = ['a_commencer', 'pas_encore', 'non_mesure'] as const
export type RepositionTriggerState = (typeof REPOSITION_TRIGGER_STATES)[number]

export const REPOSITION_TRIGGER_REASONS = [
  'no_end_date',
  'renewed',
  'ending_confirmed',
  'tier_close',
  'tier_far',
  'market_demand',
  // #2414.35 (reste, épopée #2986) — la rareté du profil, ajoutée en fin de
  // liste (même discipline que CHAT_TOOLS, GA-26 : un réglage existant ne
  // bouge jamais de position).
  'profile_scarcity',
  // #2414.41/.42 — un besoin ouvert compatible, en fin de liste (même règle).
  'open_needs',
  // #2414.44/.45 — un partenaire connu sur le compte, une relation connue avec
  // lui : en fin de liste (même règle d'ordre).
  'partners',
  'relations',
  // #2414.37/.43 — une contrainte déclarée chez un affecté, la mémoire marché du
  // client : en fin de liste (même règle d'ordre).
  'constraints',
  'market_memory',
  // #2414.48 (épopée #2986, lot E09 08/10) — l'historique de présentation,
  // en fin de liste (même règle d'ordre).
  'presentation_history',
] as const
export type RepositionTriggerReason = (typeof REPOSITION_TRIGGER_REASONS)[number]

export type RepositionTrigger = {
  state: RepositionTriggerState
  reasonKey: RepositionTriggerReason
}

/**
 * #2414.34/.40 — la demande marché, croisée par lot (instantanés de
 * territoire des départements des consultants affectés, `territory_snapshots`,
 * ZÉRO collecte nouvelle — même source que `ReverseMarketService`).
 *
 * Trois états nommés, jamais un booléen nu (même discipline que
 * {@link RepositionTriggerState}) : un consultant dont aucune zone ne résout à
 * un département suivi n'est pas « sans demande », il est NON MESURÉ.
 */
export const MARKET_DEMAND_SIGNALS = ['present', 'absent', 'non_mesure'] as const
export type MarketDemandSignal = (typeof MARKET_DEMAND_SIGNALS)[number]

/**
 * #2414.35 (reste, épopée #2986) — la rareté du profil, croisée par lot
 * (compétences des consultants affectés, `consultant_skills`, ZÉRO collecte
 * nouvelle — même seuil que le segment « profils rares » du vivier,
 * `POOL_THRESHOLDS.rareSkillHolders`, `talent-pool.service.ts`).
 *
 * Trois états nommés, jamais un booléen nu (même discipline que
 * {@link MarketDemandSignal}) : un consultant sans compétence typée connue
 * n'est pas « profil courant », il est NON MESURÉ.
 */
export const PROFILE_SCARCITY_SIGNALS = ['present', 'absent', 'non_mesure'] as const
export type ProfileScarcitySignal = (typeof PROFILE_SCARCITY_SIGNALS)[number]

/**
 * #2414.41/.42 (épopée #2986) — les besoins OUVERTS compatibles, croisés par
 * lot : au moins un besoin encore ouvert du workspace (`needStillOpenSql`)
 * exige une compétence que porte un consultant affecté. ZÉRO collecte neuve.
 * Trois états nommés : sans compétence typée connue, NON MESURÉ — jamais
 * « aucun besoin ».
 */
const OPEN_NEEDS_SIGNALS = ['present', 'absent', 'non_mesure'] as const
export type OpenNeedsSignal = (typeof OPEN_NEEDS_SIGNALS)[number]

/**
 * #2414.44/.45 (épopée #2986) — deux signaux du COMPTE client de la mission,
 * lus par lot, ZÉRO collecte neuve :
 *  - partenaires (.44) : un partenaire non concurrent est déjà connu sur le compte
 *    (`account_partners`) — une porte pour replacer le consultant ;
 *  - relations (.45) : un contact de relation déclarée (CRM, saisie, import) existe
 *    sur le compte — on n'y arrive pas à froid.
 * Trois états nommés comme les autres : un compte dont le panel (ou les contacts)
 * n'a jamais été regardé est NON MESURÉ, jamais « aucun partenaire ».
 */
export const ACCOUNT_REPOSITION_SIGNALS = ['present', 'absent', 'non_mesure'] as const
export type AccountRepositionSignal = (typeof ACCOUNT_REPOSITION_SIGNALS)[number]

/**
 * #2414.37/.43 (épopée #2986) — deux signaux de plus, lus par lot, ZÉRO collecte neuve :
 *  - contraintes (.37) : un affecté a DÉCLARÉ une contrainte sur sa fiche
 *    (restriction de mobilité, conditions non négociables) — il se replace plus
 *    difficilement. Jamais « absent » : une fiche sans contrainte saisie ne dit pas
 *    qu'il n'y en a pas, c'est NON MESURÉ ;
 *  - mémoire marché (.43) : la mémoire marché observe chez le compte client une
 *    techno que porte un affecté — une porte pour replacer la compétence chez ce
 *    client ou ses pairs. Compte non couvert par la mémoire marché : NON MESURÉ.
 */
const CONSULTANT_REPOSITION_SIGNALS = ['present', 'absent', 'non_mesure'] as const
export type ConsultantRepositionSignal = (typeof CONSULTANT_REPOSITION_SIGNALS)[number]

/**
 * Les paliers `t60`/`t30`/`t15`/`t0` portent DÉJÀ le préavis (le palier avance
 * quand le préavis est long) — les compter tous comme « à commencer » évite
 * de redécouper une seconde échelle en jours ici (GA-26).
 */
const CLOSE_TIERS: readonly RenewalEngineTier[] = ['t60', 't30', 't15', 't0']

export function repositionTrigger(input: {
  renewalStatus: RenewalStatus | null | undefined
  tier: RenewalEngineTier | 'not_due' | 'unknown'
  /** #2414.34/.40 — facultatif : les appelants qui n'ont pas encore chargé le
   *  lot de départements (ou qui décorent une mission seule, hors liste)
   *  rendent la même sortie qu'avant cette tranche. */
  marketDemand?: MarketDemandSignal
  /** #2414.35 — facultatif, même garde que `marketDemand` : omis, la sortie
   *  ne change pas. */
  profileScarcity?: ProfileScarcitySignal
  /** #2414.41/.42 — facultatif, même garde : omis, la sortie ne change pas. */
  openNeeds?: OpenNeedsSignal
  /** #2414.44 — facultatif, même garde : omis, la sortie ne change pas. */
  partners?: AccountRepositionSignal
  /** #2414.45 — facultatif, même garde. */
  relations?: AccountRepositionSignal
  /** #2414.37 — facultatif, même garde. */
  constraints?: ConsultantRepositionSignal
  /** #2414.43 — facultatif, même garde. */
  marketMemory?: ConsultantRepositionSignal
  /** #2414.48 — facultatif, même garde : omis, la sortie ne change pas. */
  presentationHistory?: ConsultantRepositionSignal
}): RepositionTrigger {
  if (input.tier === 'unknown') return { state: 'non_mesure', reasonKey: 'no_end_date' }

  const certainty = missionAvailabilityCertainty(input.renewalStatus)
  if (certainty === 'renouvelee') return { state: 'pas_encore', reasonKey: 'renewed' }
  // `certaine` couvre `fin_confirmee` ET `repositionnement_lance` : dans les
  // deux cas la mission ICI ne se prolonge pas, quel que soit le palier —
  // c'est justement le cas que le palier seul (fondé sur `ends_on`) ne voit
  // pas venir assez tôt.
  if (certainty === 'certaine') return { state: 'a_commencer', reasonKey: 'ending_confirmed' }

  if (CLOSE_TIERS.includes(input.tier as RenewalEngineTier)) return { state: 'a_commencer', reasonKey: 'tier_close' }

  // #2414.34/.40 — le palier est loin ET le renouvellement n'est pas déjà
  // tranché : une demande marché MESURÉE ET PRÉSENTE sur les départements des
  // consultants affectés démarre le moteur plus tôt que le seul préavis. Une
  // demande absente (mesurée à zéro) ou non mesurée ne change rien — GA-18/19.
  if (input.marketDemand === 'present') return { state: 'a_commencer', reasonKey: 'market_demand' }

  // #2414.35 — même palier loin, vérifié APRÈS la demande marché (pas de
  // double raison, même discipline que l'ordre ci-dessus) : un profil rare se
  // replace plus difficilement, donc commencer tôt même sans demande marché
  // mesurée sur son département.
  if (input.profileScarcity === 'present') return { state: 'a_commencer', reasonKey: 'profile_scarcity' }

  // #2414.41/.42 — vérifié APRÈS la rareté (une seule raison retenue) : un
  // besoin ouvert compatible existe déjà, autant commencer par lui.
  if (input.openNeeds === 'present') return { state: 'a_commencer', reasonKey: 'open_needs' }

  // #2414.44/.45 — APRÈS les besoins ouverts : un partenaire connu sur le compte,
  // puis une relation connue, ouvrent une porte avant que le préavis ne presse.
  if (input.partners === 'present') return { state: 'a_commencer', reasonKey: 'partners' }
  if (input.relations === 'present') return { state: 'a_commencer', reasonKey: 'relations' }

  // #2414.37/.43 — en dernier : une contrainte déclarée, puis la mémoire marché.
  if (input.constraints === 'present') return { state: 'a_commencer', reasonKey: 'constraints' }
  if (input.marketMemory === 'present') return { state: 'a_commencer', reasonKey: 'market_memory' }

  // #2414.48 — tout en dernier : une présentation récente, tous besoins
  // confondus, prouve que le profil circule déjà sur le marché.
  if (input.presentationHistory === 'present') return { state: 'a_commencer', reasonKey: 'presentation_history' }

  return { state: 'pas_encore', reasonKey: 'tier_far' }
}

/**
 * Toutes les raisons qui TIENNENT, dans l'ordre du déclencheur. `repositionTrigger`
 * n'en retient qu'UNE (la première) ; un besoin ouvert compatible derrière un
 * palier proche restait donc invisible à l'écran alors qu'il tenait (recette
 * prod 01/10 : « palier de cadence » seul). Aucun état nouveau, aucune
 * probabilité : la même décision, vue en entier.
 *
 * Une reconduction signée, une fin non datée ne portent QUE leur raison (NO-GO
 * #2414 : aucun signal ne s'y ajoute). Une fin confirmée ne cumule rien non plus.
 */
export function repositionReasons(input: Parameters<typeof repositionTrigger>[0]): RepositionTriggerReason[] {
  const main = repositionTrigger(input)
  if (main.reasonKey === 'no_end_date' || main.reasonKey === 'renewed' || main.reasonKey === 'ending_confirmed') {
    return [main.reasonKey]
  }
  const reasons: RepositionTriggerReason[] = []
  if (CLOSE_TIERS.includes(input.tier as RenewalEngineTier)) reasons.push('tier_close')
  if (input.marketDemand === 'present') reasons.push('market_demand')
  if (input.profileScarcity === 'present') reasons.push('profile_scarcity')
  if (input.openNeeds === 'present') reasons.push('open_needs')
  if (input.partners === 'present') reasons.push('partners')
  if (input.relations === 'present') reasons.push('relations')
  if (input.constraints === 'present') reasons.push('constraints')
  if (input.marketMemory === 'present') reasons.push('market_memory')
  if (input.presentationHistory === 'present') reasons.push('presentation_history')
  return reasons.length > 0 ? reasons : [main.reasonKey]
}
