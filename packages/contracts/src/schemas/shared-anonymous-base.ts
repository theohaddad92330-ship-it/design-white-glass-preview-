import { COMMUNITY_THRESHOLD } from './community-facts.js'

/**
 * P05 (#3246, lot du 09/10/2026) — LA BASE ANONYME COMMUNE ENTRE ESPACES.
 *
 * ⚠️ RENVERSEMENT DE DOCTRINE ASSUMÉ ET DATÉ — Louis, 09/10/2026, verbatim :
 * « je veux une base de donnée qui naît de toutes les infos en anonyme de tous
 * nos users pour avoir plus de signaux de datas et tout, tout doit s'aider ».
 * Il REMPLACE « le coût d'accès ne s'agrège JAMAIS entre espaces » (GA-43) et
 * « rien n'est agrégé entre espaces » (cas similaires, lot M11) — voir
 * `c92_base_anonyme_commune` au registre de doctrine, qui cite l'ancien texte.
 *
 * Ce module porte les GARDE-FOUS décidés le même jour, et rien d'autre :
 *
 * - **le seuil** — un chiffre commun ne s'affiche qu'à partir de
 *   {@link SHARED_BASE_MIN_WORKSPACES} espaces contributeurs DISTINCTS ; en
 *   dessous, « pas assez de données communes », jamais 0 ;
 * - **jamais un nom ni un texte libre** — une cellule n'est faite que de
 *   JETONS fermés ({@link isSharedToken}) : un nom d'espace, de client, de
 *   personne, une phrase saisie ne passent pas ;
 * - **des comptes, jamais une probabilité** — « 9 sur 12 », jamais un taux de
 *   chance (doctrine inchangée, refusée six fois).
 *
 * Inchangé : le CORPS des messages ne sort jamais ; les données NOMINATIVES
 * d'un espace restent cloisonnées (RLS, GA-46, test #3671) — seul un AGRÉGAT
 * anonyme sort d'un espace. Pas d'opt-out (décision Louis 09/10).
 *
 * Pur et testé à part, pour la même raison que `community-facts.ts` : c'est la
 * règle qui décide ce qu'un client voit des autres clients.
 */

/** k ≥ 3 espaces — le MÊME nombre que la donnée communautaire (GA-26 : un réglage, un endroit). */
export const SHARED_BASE_MIN_WORKSPACES = COMMUNITY_THRESHOLD

/** La cellule « tous secteurs » / « toutes tailles » — un jeton, pas une absence. */
export const SHARED_ALL = 'all'

/** Catégories d'entreprise de l'INSEE (décret 2008-1354) — un vocabulaire public et fermé. */
export const SHARED_SIZE_BANDS = ['tpe', 'pme', 'eti', 'ge'] as const
export type SharedSizeBand = (typeof SHARED_SIZE_BANDS)[number]

/** P05.c — la fenêtre « un signal précède une affaire ouverte » : 90 jours. */
export const SHARED_SIGNAL_DEAL_WINDOW_DAYS = 90

/** P05.b — les trois dimensions d'un cas gagné/perdu qui sortent d'un espace. */
export const SHARED_CASE_DIMENSIONS = ['sector', 'size', 'group_role'] as const
export type SharedCaseDimension = (typeof SHARED_CASE_DIMENSIONS)[number]

/** Le périmètre d'un agrégat : la salle de démonstration ne se mélange jamais au réel. */
export const SHARED_SCOPES = ['live', 'demo'] as const
export type SharedScope = (typeof SHARED_SCOPES)[number]

/**
 * Les tables de la base commune. GA-43 (`community-aggregation-kinds.spec.ts`)
 * lit cette liste : chacune doit porter le CHECK du seuil et aucune colonne de
 * {@link SHARED_FORBIDDEN_COLUMNS}.
 */
export const SHARED_AGGREGATE_TABLES = [
  'shared_action_outcome_aggregates',
  'shared_case_outcome_aggregates',
  'shared_signal_deal_aggregates',
  // #2877 (#2385.5 GLOBAL, Louis 11/10/2026) — les signaux d'apprentissage des
  // messages, mutualisés : des COMPTES par signal, jamais un corps de message.
  'shared_message_learning_aggregates',
  // #4286.15.c (Louis 22/10/2026) — les tendances de marché entre espaces (`market-pattern.ts`).
  'shared_market_pattern_aggregates',
] as const

/**
 * #2877 (#2385.5, niveau GLOBAL — Louis 11/10/2026 : « sers-toi d'un max de data
 * possible et juste anonymise au besoin ») — les signaux d'apprentissage des
 * messages qui sortent d'un espace, en jetons fermés. Chacun est un COMPTE déjà
 * mesuré par l'espace (`message-learning-signals.ts`) : une transition, une
 * version `user_edit`, une déclaration de relecteur. Aucun ne lit le CORPS d'un
 * message (doctrine intacte).
 */
export const SHARED_MESSAGE_LEARNING_SIGNALS = [
  'approved_without_edit',
  'approved_after_edit',
  'rejected',
  'sent',
  'replied',
  'bounced',
  'wrong_fact',
  'wrong_cta',
  'wrong_persona',
] as const
export type SharedMessageLearningSignal = (typeof SHARED_MESSAGE_LEARNING_SIGNALS)[number]

/**
 * Ce qu'une table commune ne porte JAMAIS : une portée (elle désignerait
 * l'espace), un identifiant d'objet (il désignerait le client ou la personne),
 * un nom ou un texte libre.
 */
export const SHARED_FORBIDDEN_COLUMNS = [
  'workspace_id',
  'user_id',
  'account_id',
  'contact_id',
  'project_id',
  'mission_id',
  'company_name',
  'name',
  'full_name',
  'email',
  'phone',
  'label',
  'body',
  'subject',
  'notes',
  'reason',
  'loss_reason',
] as const

const TOKEN = /^[a-z][a-z0-9_]{0,47}$/

/**
 * Un JETON fermé : minuscules, chiffres, soulignés, sans espace. Une raison
 * sociale, un nom de personne, une phrase saisie n'en sont pas — et c'est la
 * forme, pas une liste noire, qui les refuse.
 */
export function isSharedToken(value: string | null | undefined): value is string {
  return typeof value === 'string' && TOKEN.test(value)
}

/** La division NAF (deux premiers chiffres du code APE) — `64.19Z` → `naf_64`. */
export function sectorKeyOfNaf(naf: string | null | undefined): string | null {
  const match = /^\s*(\d{2})/.exec(naf ?? '')
  return match ? `naf_${match[1]}` : null
}

/** Le premier nombre de la tranche déclarée (« 5 000 à 9 999 » → 5000), ou `null`. */
function leadingHeadcount(employees: string): number | null {
  const match = /\d[\d\s.\u202f\u00a0]*/.exec(employees)
  if (!match) return null
  const value = Number(match[0].replace(/[\s.\u202f\u00a0]/g, ''))
  return Number.isFinite(value) ? value : null
}

/** La catégorie INSEE d'une tranche d'effectif. Illisible = `null`, jamais devinée. */
export function sizeBandOfEmployees(employees: string | null | undefined): SharedSizeBand | null {
  const headcount = employees ? leadingHeadcount(employees) : null
  if (headcount === null) return null
  if (headcount < 10) return 'tpe'
  if (headcount < 250) return 'pme'
  if (headcount < 5000) return 'eti'
  return 'ge'
}

type PoolRow<C extends Record<string, string>, N extends Record<string, number>> = {
  /** L'espace qui contribue. Il ne ressort JAMAIS — il ne sert qu'à compter. */
  workspaceId: string
  cell: C
  counts: N
}

type PooledCell<C, N> = { cell: C; counts: N; contributingWorkspaces: number }

/**
 * Mutualise des comptages DÉJÀ groupés par espace. On compte des ESPACES, pas
 * des lignes : un espace qui se répète reste une voix, et un espace dont tous
 * les comptes valent zéro n'en est pas une. Une cellule qui porte un texte
 * libre, ou que moins de {@link SHARED_BASE_MIN_WORKSPACES} espaces portent,
 * ne sort pas. La sortie ne porte aucun identifiant d'espace.
 */
export function poolSharedCells<C extends Record<string, string>, N extends Record<string, number>>(
  rows: ReadonlyArray<PoolRow<C, N>>,
): Array<PooledCell<C, N>> {
  const byCell = new Map<string, { cell: C; counts: Record<string, number>; workspaces: Set<string> }>()
  for (const row of rows) {
    const workspaceId = row.workspaceId?.trim()
    if (!workspaceId) continue
    const values = Object.values(row.cell)
    if (values.length === 0 || !values.every(value => isSharedToken(value))) continue
    if (!Object.values(row.counts).some(count => count > 0)) continue
    const key = JSON.stringify(Object.entries(row.cell).sort(([a], [b]) => a.localeCompare(b)))
    const entry = byCell.get(key) ?? { cell: row.cell, counts: {}, workspaces: new Set<string>() }
    for (const [name, count] of Object.entries(row.counts)) {
      entry.counts[name] = (entry.counts[name] ?? 0) + Math.max(0, count)
    }
    entry.workspaces.add(workspaceId)
    byCell.set(key, entry)
  }
  return [...byCell.values()]
    .filter(entry => entry.workspaces.size >= SHARED_BASE_MIN_WORKSPACES)
    .map(entry => ({ cell: entry.cell, counts: entry.counts as N, contributingWorkspaces: entry.workspaces.size }))
}

export type SharedReading<R> =
  | { status: 'shared'; contributingWorkspaces: number; rows: R[] }
  | { status: 'not_enough_shared_data' }

/**
 * La LECTURE redit le seuil, même si la base le tient déjà par un CHECK : une
 * ligne stockée sous le seuil (migration future, écriture à la main) ne sort
 * pas. Aucune ligne = « pas assez de données communes », jamais un zéro.
 */
export function readSharedCells<R extends { contributingWorkspaces: number }>(rows: readonly R[]): SharedReading<R> {
  const kept = rows.filter(row => row.contributingWorkspaces >= SHARED_BASE_MIN_WORKSPACES)
  if (kept.length === 0) return { status: 'not_enough_shared_data' }
  return {
    status: 'shared',
    contributingWorkspaces: Math.min(...kept.map(row => row.contributingWorkspaces)),
    rows: kept,
  }
}
