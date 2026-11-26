import {
  INTERACTION_ACTIVITY_KINDS,
  type Activity,
  type ActivityKind,
  type ActivitySyncResult,
} from '@bellum/contracts'

/**
 * Ce que l'écran fait des activités avant de les afficher.
 *
 * Pur et testé, parce que deux règles s'y jouent et qu'aucune ne se voit à
 * l'œil nu dans un composant :
 *
 *  - **le groupement par jour** doit se faire dans le fuseau du LECTEUR. Grouper
 *    sur la chaîne ISO (donc en UTC) ferait basculer au jour suivant tous les
 *    échanges de fin de soirée, et un mail de 23 h 40 s'afficherait « demain » ;
 *  - **un fil qui attend** se distingue d'un fil oublié. Les deux se ressemblent
 *    à l'écran et n'appellent pas la même action.
 */

type TimelineDay = {
  /** `YYYY-MM-DD` dans le fuseau du lecteur — la clé de groupe et de tri. */
  day: string
  activities: Activity[]
}

/** La clé de jour LOCALE d'un instant. */
export function localDayKey(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return localDayKey(now.toISOString(), now)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Groupe les activités par jour, du plus récent au plus ancien, et garde
 * l'ordre antéchronologique À L'INTÉRIEUR de chaque jour.
 *
 * Le tri n'est pas supposé acquis en entrée : une saisie manuelle rétroactive
 * arrive après coup, et un fil qui saute d'un jour à l'autre est illisible.
 */
export function groupByDay(activities: readonly Activity[]): TimelineDay[] {
  const sorted = [...activities].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
  const days: TimelineDay[] = []
  for (const activity of sorted) {
    const key = localDayKey(activity.occurredAt)
    const last = days.at(-1)
    if (last?.day === key) last.activities.push(activity)
    else days.push({ day: key, activities: [activity] })
  }
  return days
}

/** Une ligne du fil : l'activité la plus récente d'un groupe, et combien de fois elle s'est répétée. */
interface TimelineEntry {
  activity: Activity
  count: number
}

/** Les gestes de LECTURE qui se répètent à l'identique : une ligne et un compte, pas douze lignes (#3505). */
const REPEATABLE_READ_KINDS: readonly ActivityKind[] = ['crm_lookup']

/**
 * #3505 — « Laura a consulté ton CRM » ×12 dans la chronologie d'un compte :
 * une consultation est journalisée à CHAQUE lecture, et douze lignes
 * identiques noyaient le reste du fil.
 *
 * Seuls les gestes de lecture (`REPEATABLE_READ_KINDS`) se regroupent, et
 * seulement s'ils sont IDENTIQUES (même nature, même objet, même compte, même
 * contact, même auteur) dans la même journée. Un e-mail, un appel, une
 * décision restent une ligne chacun : ce sont des événements, pas des relectures.
 * Rien n'est supprimé — le journal garde chaque lecture ; seul l'affichage
 * porte l'heure de la plus récente et le nombre. `activities` arrive trié du
 * plus récent au plus ancien (`groupByDay`).
 */
export function collapseRepeatedReads(activities: readonly Activity[]): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  const seen = new Map<string, TimelineEntry>()
  for (const activity of activities) {
    if (!REPEATABLE_READ_KINDS.includes(activity.kind)) {
      entries.push({ activity, count: 1 })
      continue
    }
    const key = [activity.kind, activity.subject, activity.accountId, activity.contactId, activity.userId].join('|')
    const existing = seen.get(key)
    if (existing) {
      existing.count += 1
      continue
    }
    const entry: TimelineEntry = { activity, count: 1 }
    seen.set(key, entry)
    entries.push(entry)
  }
  return entries
}

/**
 * L'état d'un fil, en un mot — ce que l'écran met en tête de la timeline.
 *
 *  - `awaiting` : on a écrit, personne n'a répondu. Il y a une balle dans leur
 *    camp, et c'est le seul cas où « relancer » est le bon geste.
 *  - `answered` : ils ont répondu en dernier. À nous de jouer.
 *  - `silent` : plus rien depuis longtemps, dans aucun sens.
 *  - `empty` : rien du tout — pas la même chose que « silencieux depuis
 *    longtemps », qui suppose qu'il s'est passé quelque chose un jour.
 */
type RelationState = 'awaiting' | 'answered' | 'silent' | 'empty'

/** Au-delà, un compte n'est plus « suivi », il est dormant. */
export const SILENT_AFTER_DAYS = 30

export function relationState(engagement: {
  total: number
  awaitingReply: boolean
  daysSinceLastActivity: number | null
}): RelationState {
  if (engagement.total === 0) return 'empty'
  if (engagement.awaitingReply) return 'awaiting'
  if (engagement.daysSinceLastActivity !== null && engagement.daysSinceLastActivity > SILENT_AFTER_DAYS) {
    return 'silent'
  }
  return 'answered'
}

/**
 * La durée d'un appel ou d'une réunion, en abrégé.
 *
 * `null` reste `null` : « 0 min » se lirait comme un appel qui n'a pas duré,
 * alors que le fournisseur n'a simplement rien dit.
 */
export function formatDuration(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`
}

/**
 * Le premier extrait lisible d'un corps.
 *
 * Coupe sur un MOT et non au caractère près : « Bonjour, je reviens vers vo »
 * a l'air d'un bug d'affichage. Un corps absent rend `null`, jamais `''`.
 */
export function excerpt(body: string | null, max = 220): string | null {
  if (!body) return null
  const flat = body.replace(/\s+/g, ' ').trim()
  if (!flat) return null
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`
}

/**
 * #2124.59 — LES CATÉGORIES DE LA TIMELINE.
 *
 * Le filtre à quatre valeurs (`all` / `email` / `call` / `meeting`) découpait
 * par NATURE technique, et laissait hors d'atteinte tout le reste du modèle —
 * `task`, `workflow`, `stage_change`, `analysis`, `gate_decision` étaient
 * stockés, rendus dans le fil, et introuvables au filtre. Le retour ne demande
 * pas d'autres natures : il demande des CATÉGORIES, c'est-à-dire la question
 * qu'on se pose en ouvrant le dossier (« qu'est-ce qui s'est échangé ? »,
 * « qu'est-ce qu'on a fait ? »).
 *
 * ⚠️ « Interactions » ne redéclare RIEN : elle réutilise
 * `INTERACTION_ACTIVITY_KINDS`, la liste qui répond déjà à « ce compte est-il
 * silencieux ? ». Deux écritures de la même règle divergent — le dépôt a payé
 * cette leçon sur `noUpcomingTask`.
 *
 * ⚠️ Deux catégories du retour N'EXISTENT PAS ICI, et c'est délibéré :
 *  - **Corrections** — une correction humaine n'est pas une activité : elle vit
 *    dans le journal de champ (`record_field_audit`), une autre table, une
 *    autre lecture. Elle est rendue dans la même section, sous « Actions et
 *    décisions » (#2124.39). Un filtre de timeline « Corrections » ne pourrait
 *    jamais rien trouver, et un filtre qui ne trouve jamais rien annonce une
 *    donnée qui n'existe pas.
 *  - **Missions** — aucune activité ne porte de lien vers une mission :
 *    `activitySchema` a `accountId`, `contactId`, `projectId`, et rien d'autre.
 *    Même raison, même refus.
 *
 * `note` n'entre dans aucune catégorie : une note prise pour soi n'est ni un
 * échange ni une action. Elle reste visible sous « Tout », qui est le défaut —
 * aucune ligne n'est donc masquée sans qu'on l'ait demandé.
 */
export const TIMELINE_CATEGORIES = [
  'all',
  'interactions',
  'actions',
  'projects',
  'analyses',
  'client',
  'internal',
] as const
export type TimelineCategory = (typeof TIMELINE_CATEGORIES)[number]

/** Ce qu'on a FAIT, par opposition à ce qui s'est échangé. Les décisions
 *  tranchées (`gate_decision`) et les changements d'étape en font partie : la
 *  sous-section s'appelle « Actions et décisions », et elle porte les deux. */
const ACTION_KINDS: readonly ActivityKind[] = [
  'task',
  'workflow',
  'crm_export',
  'crm_lookup',
  'stage_change',
  'gate_decision',
]

/**
 * #3688.7 — les registres du fil d'UNE PERSONNE, qu'on ne mélange pas :
 *
 *  - **client** (« Relation client », défaut de la fiche contact) : ce qui s'est
 *    dit ou noté avec elle — e-mails, appels, rendez-vous, réseau, notes —,
 *    jamais l'interne ni les opérations de Bellum (consultation du CRM,
 *    enrichissement, analyse, décision, tâche cochée) : ce ne sont pas des
 *    interactions commerciales, ils restent lisibles sous « Tout » et « Actions » ;
 *  - **internal** : la préparation entre collègues. Elle a eu lieu, mais ne
 *    prouve rien sur la relation (voir `direction.internal`).
 */
export const CONTACT_TIMELINE_CATEGORIES = ['client', 'internal', 'actions', 'all'] as const

const isInteractionKind = (kind: ActivityKind): boolean =>
  (INTERACTION_ACTIVITY_KINDS as readonly ActivityKind[]).includes(kind)

export function matchesCategory(
  activity: Pick<Activity, 'kind' | 'projectId' | 'direction'>,
  category: TimelineCategory,
): boolean {
  switch (category) {
    case 'all':
      return true
    // Une réunion INTERNE n'est pas un échange client (#3688.7) : « Interactions »
    // la refuse, comme l'engagement du serveur ne la compte pas comme touche.
    case 'interactions':
      return isInteractionKind(activity.kind) && activity.direction !== 'internal'
    case 'client':
      return (isInteractionKind(activity.kind) || activity.kind === 'note') && activity.direction !== 'internal'
    case 'internal':
      return activity.direction === 'internal' && (isInteractionKind(activity.kind) || activity.kind === 'note')
    case 'actions':
      return ACTION_KINDS.includes(activity.kind)
    // Un projet ne se lit pas dans la NATURE de la ligne mais dans son
    // rattachement : c'est le seul lien qu'une activité porte vers un projet.
    case 'projects':
      return activity.projectId !== null
    case 'analyses':
      return activity.kind === 'analysis'
  }
}

/**
 * #2126.6 — un historique vide parce qu'AUCUN outil n'est branché n'est pas la
 * même chose qu'un historique vide parce que rien ne s'est passé, ni qu'un
 * historique qu'on n'a pas pu lire.
 *
 * `true` seulement quand TOUTES les sources répondent « pas branché » —
 * une seule source connectée (même silencieuse) suffit à retomber dans le vide
 * ordinaire, et une seule source en PANNE (`reason: 'error'`) fait retomber
 * dans l'erreur plutôt que de laisser croire qu'il suffit de se connecter.
 */
export function connectorAbsent(result: Pick<ActivitySyncResult, 'sources'>): boolean {
  return result.sources.length > 0 && result.sources.every(source => source.reason === 'not_connected')
}

const foldText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/**
 * #3688.10 — la recherche du fil : objet, contenu, auteur. Sans accents ni
 * casse. Un contenu RÉSERVÉ à son auteur (D65) n'est jamais cherché : la
 * recherche ne doit pas révéler ce que l'affichage cache. Vide = ne masque rien.
 */
export function matchesSearch(
  activity: Pick<Activity, 'subject' | 'body' | 'bodyRedacted' | 'authorName'>,
  query: string,
): boolean {
  const needle = foldText(query.trim())
  if (!needle) return true
  const haystack = [activity.subject, activity.bodyRedacted ? null : activity.body, activity.authorName]
  return haystack.some(part => part != null && foldText(part).includes(needle))
}

/**
 * #3688.6/.7 — « planifié » n'est pas « tenu » : une activité datée dans le
 * FUTUR (rendez-vous d'agenda) sort du fil passé et se lit sous « À venir »,
 * du plus proche au plus lointain. Une date illisible reste dans le passé :
 * on ne la promet pas « à venir ».
 */
export function splitUpcoming(
  activities: readonly Activity[],
  now: Date = new Date(),
): { upcoming: Activity[]; past: Activity[] } {
  const upcoming: Activity[] = []
  const past: Activity[] = []
  for (const activity of activities) {
    const at = Date.parse(activity.occurredAt)
    if (!Number.isNaN(at) && at > now.getTime()) upcoming.push(activity)
    else past.push(activity)
  }
  upcoming.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
  return { upcoming, past }
}

/**
 * #3688 — chargement progressif : les `limit` premières lignes du fil (jours
 * entiers puis jour coupé), et ce qui reste. Une page qui a la place ne met
 * pas le fil dans un petit défilement intérieur : elle en montre moins, puis
 * en montre plus à la demande.
 */
export function visibleSlice(days: readonly TimelineDay[], limit: number): { days: TimelineDay[]; hidden: number } {
  let left = limit
  const shown: TimelineDay[] = []
  let hidden = 0
  for (const day of days) {
    if (left <= 0) {
      hidden += day.activities.length
      continue
    }
    const taken = day.activities.slice(0, left)
    left -= taken.length
    hidden += day.activities.length - taken.length
    shown.push({ day: day.day, activities: taken })
  }
  return { days: shown, hidden }
}
