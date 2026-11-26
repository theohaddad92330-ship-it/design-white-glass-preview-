import { z } from 'zod'

/**
 * #4067 (décision Louis 12/10) — Découvrir classe AUSSI avec ce que l'espace
 * SAIT déjà, pas seulement avec les signaux récents et le profil ESN.
 *
 * Six sources, chacune un AXE NOMMÉ, dans l'ordre de valeur décidé par Louis :
 *
 * 1. `signal_history` — les signaux au-delà de la fenêtre récente (90 j,
 *    `discover_signals.py`), DÉCOTÉS par l'âge (jamais supprimés) ; la
 *    récurrence d'un même besoin est un signal fort ;
 * 2. `crm` — affaires gagnées / ouvertes / en sommeil / perdues, contacts connus ;
 * 3. `market_memory` et `dataforge` — de l'étiquette / du filtre au FACTEUR ;
 * 4. `drive` (documents de l'espace, jamais le corpus partagé) et `missions`
 *    (missions passées sur le compte, consultants du vivier passés chez lui).
 *
 * Doctrine tenue ici, et nulle part ailleurs (GA-26) :
 * - aucune PROBABILITÉ : des points, sur un plafond nommé ;
 * - une source NON MESURÉE (`null`) sort du dénominateur — jamais un 0
 *   (GA-18/GA-19) ; une source mesurée et vide vaut 0 sur SON plafond ;
 * - le score n'est jamais nu : chaque axe porte sa preuve et sa date.
 *
 * Pur et déterministe : l'API le calcule (`DiscoverSourcesService`), l'écran
 * le relit pour classer (`discoverRankRatio`) et pour la ligne « Pourquoi »
 * (`decisiveSourceAxes`). Aucun fournisseur n'est nommé dans un libellé.
 */

export const DISCOVER_SOURCE_AXES = [
  { key: 'signal_history', max: 20 },
  { key: 'crm', max: 20 },
  { key: 'market_memory', max: 10 },
  { key: 'dataforge', max: 10 },
  { key: 'drive', max: 10 },
  { key: 'missions', max: 10 },
] as const
export type DiscoverSourceAxisKey = (typeof DISCOVER_SOURCE_AXES)[number]['key']
export const discoverSourceAxisKeySchema = z.enum(
  DISCOVER_SOURCE_AXES.map(axis => axis.key) as unknown as [DiscoverSourceAxisKey, ...DiscoverSourceAxisKey[]],
)

/** #4067.1 — la fenêtre que la recherche par signaux lit déjà (`sinceDays`,
 *  défaut 90, `discover_signals.py`) : un signal plus jeune y est COMPTÉ, il
 *  ne recompte pas ici. */
export const DISCOVER_HISTORY_WINDOW_DAYS = 90
/** Demi-vie de la décote : un signal de 90 + 180 jours pèse la moitié d'un
 *  signal tout juste sorti de la fenêtre. */
const HISTORY_HALF_LIFE_DAYS = 180
const HISTORY_POINTS_PER_SIGNAL = 8
const HISTORY_RECURRENCE_BONUS = 4

export const discoverSourceAxisSchema = z.object({
  key: discoverSourceAxisKeySchema,
  /** Points ENTIERS, 0 ≤ points ≤ max. 0 quand l'axe n'est pas mesuré —
   *  `measured` dit alors qu'il ne compte pas, pas qu'il vaut 0. */
  points: z.number().int().min(0),
  max: z.number().int().positive(),
  measured: z.boolean(),
  /** La preuve, en FRANÇAIS (journaux, export) — l'écran préfère `label_key`. */
  evidence: z.string(),
  /** Clé i18n `discover:sourceAxes.evidence.<label_key>` — même patron que
   *  `discoverScoreFactorSchema.label_key`. */
  label_key: z.string(),
  label_params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  /** ISO — le fait le plus récent de cette source. Un signal ANCIEN se lit
   *  daté (« il y a 8 mois »), jamais comme récent. `null` = non daté. */
  latestAt: z.string().nullable(),
})
export type DiscoverSourceAxis = z.infer<typeof discoverSourceAxisSchema>

export const discoverSourceAxesSchema = z.object({
  /** Somme des points des seuls axes MESURÉS ; `null` si aucun ne l'est. */
  score: z.number().int().min(0).nullable(),
  /** Dénominateur RÉEL : la somme des plafonds des seuls axes mesurés. */
  max: z.number().int().min(0),
  axes: z.array(discoverSourceAxisSchema),
  /** Les axes qu'on n'a pas pu regarder, NOMMÉS. */
  unmeasured: z.array(discoverSourceAxisKeySchema),
})
export type DiscoverSourceAxes = z.infer<typeof discoverSourceAxesSchema>

/** Les FAITS lus par l'API, par candidat. `null` = source non lue / non
 *  applicable (candidat neuf sans compte, lecture en échec, rien de branché). */
export interface DiscoverSourceFacts {
  /** Signaux historisés du compte de l'espace (`signal_history`). */
  signalHistory: { signals: Array<{ type: string | null; date: string; changeCount: number }> } | null
  /** Affaires du CRM de l'espace et contacts connus du compte. */
  crm: {
    won: number
    lost: number
    /** Ouvertes ET actives. */
    open: number
    /** Ouvertes, sans activité depuis longtemps — « à réveiller ». */
    dormant: number
    contacts: number
    lastActivityAt: string | null
  } | null
  /** Mémoire marché : `externalRecourse` `null` = non observé (jamais « n'externalise pas »),
   *  `stackOverlap` `null` = pile non couverte, `[]` = couverte sans techno commune. */
  marketMemory: {
    externalRecourse: boolean | null
    stackOverlap: string[] | null
    /** #4067.11 — personnes NOMMÉES, en poste et revues, que la base commune connaît chez cette société
     *  (`shared_company_people`, c94 / #4286.15.b). Un compte, jamais un nom ; absent = non lu. */
    sharedPeople?: number
  } | null
  /** Le statut du compte dans le référentiel de comptes cibles (`null` = aucun statut connu) et, #4294.9,
   *  ses besoins PASSÉS observés dans la base commune (absent = non lus — l'axe garde son seul statut). */
  dataforge: {
    status: string | null
    needs?: { total: number; won: number; latestAt: string | null }
  } | null
  /** Documents de l'espace (Drive synchronisé, dépôts) qui nomment ce compte. */
  drive: { documents: number; latestAt: string | null } | null
  /** Missions de l'espace sur ce compte, consultants du vivier passés chez lui. */
  missions: { missions: number; consultants: number; latestAt: string | null } | null
}

const DAY_MS = 86_400_000

/** Âge en jours d'une date ISO, `null` si illisible. */
function ageInDays(iso: string, now: Date): number | null {
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return null
  return Math.max(0, (now.getTime() - parsed) / DAY_MS)
}

/**
 * #4067.1 — le poids d'un signal historique : 0 dans la fenêtre récente (déjà
 * compté par la recherche), puis décote exponentielle — jamais nul, jamais
 * supprimé. Un signal non daté ne pèse rien (il ne justifie aucun « pourquoi »).
 */
export function historySignalWeight(date: string, now: Date): number {
  const age = ageInDays(date, now)
  if (age === null || age < DISCOVER_HISTORY_WINDOW_DAYS) return 0
  return Math.pow(0.5, (age - DISCOVER_HISTORY_WINDOW_DAYS) / HISTORY_HALF_LIFE_DAYS)
}

const DATAFORGE_STATUS_POINTS: Readonly<Record<string, number>> = {
  CIBLE_PRIORITAIRE: 10,
  CIBLE_SECONDAIRE: 6,
  A_QUALIFIER: 2,
}

type AxisResult = Omit<DiscoverSourceAxis, 'key' | 'max' | 'measured'>

function capped(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value)))
}

function historyAxis(facts: NonNullable<DiscoverSourceFacts['signalHistory']>, now: Date, max: number): AxisResult {
  const old = facts.signals.filter(signal => historySignalWeight(signal.date, now) > 0)
  const byType = new Map<string, number>()
  for (const signal of old) {
    const type = signal.type ?? 'other'
    byType.set(type, (byType.get(type) ?? 0) + 1 + (signal.changeCount > 0 ? 1 : 0))
  }
  const recurring = [...byType.values()].filter(count => count >= 2).length
  const weighted = old.reduce((total, signal) => total + historySignalWeight(signal.date, now), 0)
  const points = capped(weighted * HISTORY_POINTS_PER_SIGNAL + recurring * HISTORY_RECURRENCE_BONUS, max)
  const latestAt = old.reduce<string | null>(
    (latest, signal) => (latest === null || Date.parse(signal.date) > Date.parse(latest) ? signal.date : latest),
    null,
  )
  return {
    points,
    evidence:
      old.length === 0
        ? 'Aucun signal ancien historisé'
        : `${old.length} signal(aux) ancien(s), décotés par l’âge${recurring > 0 ? ' — besoin récurrent' : ''}`,
    label_key: old.length === 0 ? 'history_none' : recurring > 0 ? 'history_recurring' : 'history',
    label_params: { n: old.length, recurring },
    latestAt,
  }
}

function crmAxis(facts: NonNullable<DiscoverSourceFacts['crm']>, max: number): AxisResult {
  const points = capped(
    (facts.won > 0 ? 10 : 0) +
      (facts.open > 0 ? 6 : 0) +
      (facts.dormant > 0 ? 5 : 0) +
      (facts.lost > 0 ? 3 : 0) +
      Math.min(facts.contacts, 5),
    max,
  )
  // La preuve nomme le fait le plus fort — gagné, ouvert, en sommeil, perdu, contacts.
  const label_key =
    facts.won > 0
      ? 'crm_won'
      : facts.open > 0
        ? 'crm_open'
        : facts.dormant > 0
          ? 'crm_dormant'
          : facts.lost > 0
            ? 'crm_lost'
            : facts.contacts > 0
              ? 'crm_contacts'
              : 'crm_none'
  return {
    points,
    evidence: `CRM : ${facts.won} gagnée(s), ${facts.open} ouverte(s), ${facts.dormant} en sommeil, ${facts.lost} perdue(s), ${facts.contacts} contact(s) connu(s)`,
    label_key,
    label_params: {
      won: facts.won,
      open: facts.open,
      dormant: facts.dormant,
      lost: facts.lost,
      contacts: facts.contacts,
    },
    latestAt: facts.lastActivityAt,
  }
}

/** #4067.11 — Bellum connaît déjà des personnes en poste chez elle : une porte d'entrée, pas une preuve d'achat. */
const SHARED_PEOPLE_POINTS = 2

function marketMemoryAxis(facts: NonNullable<DiscoverSourceFacts['marketMemory']>, max: number): AxisResult {
  const overlap = facts.stackOverlap ?? []
  const sharedPeople = facts.sharedPeople && facts.sharedPeople > 0 ? facts.sharedPeople : 0
  const points = capped(
    (facts.externalRecourse === true ? 6 : 0) +
      Math.min(4, overlap.length * 2) +
      (sharedPeople > 0 ? SHARED_PEOPLE_POINTS : 0),
    max,
  )
  const observed =
    facts.externalRecourse === true
      ? `Recours externe observé${overlap.length > 0 ? ` — pile commune : ${overlap.join(', ')}` : ''}`
      : overlap.length > 0
        ? `Pile commune observée : ${overlap.join(', ')}`
        : null
  // #4067.11 — dans une liste, une absence ne fait aucune ligne : zéro personne connue ne dit rien.
  const shared = sharedPeople > 0 ? `${sharedPeople} personne(s) en poste connue(s) de la base commune` : null
  return {
    points,
    evidence:
      [observed, shared].filter((part): part is string => part !== null).join(' — ') ||
      'Ni recours externe ni pile commune observés',
    label_key:
      facts.externalRecourse === true
        ? 'market_recourse'
        : overlap.length > 0
          ? 'market_stack'
          : sharedPeople > 0
            ? 'market_shared_people'
            : 'market_none',
    label_params: { stack: overlap.slice(0, 3).join(', '), ...(sharedPeople > 0 ? { n: sharedPeople } : {}) },
    latestAt: null,
  }
}

/** #4294.9 — un besoin passé GAGNÉ prouve un achat ; un besoin seulement observé, une compétence achetée. */
const DATAFORGE_NEED_WON_POINTS = 6
const DATAFORGE_NEED_SEEN_POINTS = 3

function dataforgeAxis(facts: NonNullable<DiscoverSourceFacts['dataforge']>, max: number): AxisResult {
  const statusPoints = facts.status ? (DATAFORGE_STATUS_POINTS[facts.status] ?? 0) : 0
  const statusEvidence = facts.status ? `Référentiel de comptes cibles : ${facts.status}` : null
  const statusKey =
    facts.status === 'CIBLE_PRIORITAIRE'
      ? 'reference_priority'
      : facts.status === 'CIBLE_SECONDAIRE'
        ? 'reference_secondary'
        : facts.status === 'A_QUALIFIER'
          ? 'reference_to_qualify'
          : 'reference_other'
  const needs = facts.needs
  // Dans une liste, une absence ne fait aucune ligne : zéro besoin observé laisse l'axe à son seul statut.
  if (!needs || needs.total <= 0) {
    return {
      points: capped(statusPoints, max),
      evidence: statusEvidence ?? 'Référentiel de comptes cibles',
      label_key: statusKey,
      latestAt: null,
    }
  }
  const needPoints = needs.won > 0 ? DATAFORGE_NEED_WON_POINTS : DATAFORGE_NEED_SEEN_POINTS
  const needsEvidence = `${needs.total} besoin(s) passé(s) observé(s) sur ce compte${needs.won > 0 ? `, dont ${needs.won} gagné(s)` : ''}`
  return {
    points: capped(statusPoints + needPoints, max),
    evidence: statusEvidence ? `${needsEvidence} — ${statusEvidence}` : needsEvidence,
    label_key: needs.won > 0 ? 'reference_needs_won' : 'reference_needs',
    label_params: { n: needs.total, won: needs.won },
    latestAt: needs.latestAt,
  }
}

function driveAxis(facts: NonNullable<DiscoverSourceFacts['drive']>, max: number): AxisResult {
  return {
    points: capped(facts.documents * 4, max),
    evidence: `${facts.documents} document(s) de l’espace nomment ce compte`,
    label_key: facts.documents > 0 ? 'drive' : 'drive_none',
    label_params: { n: facts.documents },
    latestAt: facts.latestAt,
  }
}

function missionsAxis(facts: NonNullable<DiscoverSourceFacts['missions']>, max: number): AxisResult {
  return {
    points: capped((facts.missions > 0 ? 6 : 0) + Math.min(4, facts.consultants * 2), max),
    evidence: `${facts.missions} mission(s) sur ce compte, ${facts.consultants} consultant(s) du vivier y sont passés`,
    label_key: facts.missions > 0 ? 'missions' : facts.consultants > 0 ? 'missions_bench' : 'missions_none',
    label_params: { n: facts.missions, consultants: facts.consultants },
    latestAt: facts.latestAt,
  }
}

function isMarketMemoryMeasured(facts: DiscoverSourceFacts['marketMemory']): boolean {
  // #4067.11 — une personne connue de la base commune suffit à mesurer l'axe (un zéro lu ne mesure rien
  // de plus que l'observation d'avant : non observé reste non mesuré).
  return (
    facts !== null && (facts.externalRecourse !== null || facts.stackOverlap !== null || (facts.sharedPeople ?? 0) > 0)
  )
}

/** #4067 — les six axes d'un candidat, depuis les faits lus par l'API. */
export function computeDiscoverSourceAxes(facts: DiscoverSourceFacts, now: Date): DiscoverSourceAxes {
  const results: Record<DiscoverSourceAxisKey, (max: number) => AxisResult | null> = {
    signal_history: max => (facts.signalHistory ? historyAxis(facts.signalHistory, now, max) : null),
    crm: max => (facts.crm ? crmAxis(facts.crm, max) : null),
    market_memory: max =>
      facts.marketMemory && isMarketMemoryMeasured(facts.marketMemory)
        ? marketMemoryAxis(facts.marketMemory, max)
        : null,
    dataforge: max => (facts.dataforge ? dataforgeAxis(facts.dataforge, max) : null),
    drive: max => (facts.drive ? driveAxis(facts.drive, max) : null),
    missions: max => (facts.missions ? missionsAxis(facts.missions, max) : null),
  }
  const axes: DiscoverSourceAxis[] = DISCOVER_SOURCE_AXES.map(({ key, max }) => {
    const result = results[key](max)
    if (result === null) {
      return { key, max, measured: false, points: 0, evidence: 'Non mesuré', label_key: 'unmeasured', latestAt: null }
    }
    return { key, max, measured: true, ...result }
  })
  const measured = axes.filter(axis => axis.measured)
  return {
    score: measured.length > 0 ? measured.reduce((total, axis) => total + axis.points, 0) : null,
    max: measured.reduce((total, axis) => total + axis.max, 0),
    axes,
    unmeasured: axes.filter(axis => !axis.measured).map(axis => axis.key),
  }
}

/**
 * #4067 — la ligne « Pourquoi » de la carte : 1 à 3 sources DÉCISIVES (mesurées,
 * points > 0), les plus fortes d'abord ; à égalité, l'ordre de valeur de Louis.
 */
export function decisiveSourceAxes(sourceAxes: DiscoverSourceAxes | undefined, limit = 3): DiscoverSourceAxis[] {
  if (!sourceAxes) return []
  const order = DISCOVER_SOURCE_AXES.map(axis => axis.key)
  return sourceAxes.axes
    .filter(axis => axis.measured && axis.points > 0)
    .sort((a, b) => b.points - a.points || order.indexOf(a.key) - order.indexOf(b.key))
    .slice(0, limit)
}

/**
 * #4067 — le RANG d'un candidat : ses points (registre + sources mesurées) sur
 * son dénominateur RÉEL (plafonds des seuls blocs et axes mesurés). Sans aucune
 * source mesurée, c'est exactement le ratio d'avant ce lot. `null` = rien de
 * mesuré — classé en dernier, jamais ramené à 0.
 */
export function discoverRankRatio(candidate: {
  score: number | null
  scoreMax?: number | null
  sourceAxes?: DiscoverSourceAxes
}): number | null {
  const sources = candidate.sourceAxes
  const hasSources = sources !== undefined && sources.score !== null && sources.max > 0
  const hasScore = candidate.score !== null && (candidate.scoreMax ?? 100) > 0
  if (!hasScore && !hasSources) return null
  const points = (hasScore ? (candidate.score as number) : 0) + (hasSources ? (sources.score as number) : 0)
  const max = (hasScore ? (candidate.scoreMax ?? 100) : 0) + (hasSources ? sources.max : 0)
  return points / max
}
