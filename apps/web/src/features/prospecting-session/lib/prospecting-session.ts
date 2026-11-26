import type { ContactSolicitation } from '@bellum/contracts'
import { toCsv } from '@/lib/csv'
import type { DiscoverCallListRow } from '../../discover/lib/discover-call-list'

/* ------------------------------------------------------------------ */
/*  #2375 — LA SESSION DE PROSPECTION.                                   */
/*                                                                     */
/*  « Prépare-moi une heure de prospection » doit rendre une SESSION      */
/*  exécutable — ordre, objectif, pitch, borne de temps — pas juste la   */
/*  liste d'appels que `discover-call-list.ts` sait déjà construire.     */
/*  Cette brique REPREND cette liste comme fondation de données (mêmes  */
/*  lignes, même détection d'incomplétude `unknown[]`) et la transforme   */
/*  en session, sans nouvel appel réseau : tout ce qu'elle utilise est   */
/*  déjà chargé à l'écran Découvrir.                                     */
/* ------------------------------------------------------------------ */

/** #2375.3 — les sept modes du corps de l'issue, dans l'ordre où il les liste. */
export const PROSPECTING_SESSION_MODES = [
  'appels',
  'linkedin',
  'email',
  'mixte',
  'reactivation',
  'compte',
  'talent',
] as const
export type ProspectingSessionMode = (typeof PROSPECTING_SESSION_MODES)[number]

// Types ci-dessous non exportés (`pnpm lint:exports:types`, knip) : consommés
// uniquement dans ce fichier — aucun appelant externe ne les importe.
type ProspectingSessionChannel = 'call' | 'linkedin' | 'email'

interface ProspectingSessionParams {
  mode: ProspectingSessionMode
  /** Minutes. Non bornée ici — le formulaire (#2375.2) impose ses propres limites d'écran. */
  durationMinutes: number
  objective: string
}

interface ProspectingSessionContact {
  key: string
  /** `null` = aucune personne connue de l'espace pour cette ligne (repris de
   *  `DiscoverCallListRow.contactId`, jamais recalculé) — la clé qui permet
   *  d'attacher la collision (#2386.6, `mergeSessionCollisions`). */
  contactId: string | null
  company: string
  fullName: string
  title: string | null
  channel: ProspectingSessionChannel
  /** #2375.4 — dérivé de données RÉELLES (`reason`/`signal`), jamais inventé. */
  pitch: string
  firstQuestion: string
  /** Le canal choisi dispose-t-il de la coordonnée qu'il lui faut ? */
  ready: boolean
  /**
   * #2386.6 — un collègue a-t-il déjà sollicité CE contact récemment ?
   * `undefined` = pas encore vérifié (`mergeSessionCollisions` n'a pas encore
   * tourné, ou ce contact n'a pas d'id à vérifier) ; `null` = vérifié, aucune
   * collision ; l'objet = le collègue et la date. Jamais un `null` deviné
   * pour un contact qu'on n'a pas interrogé (GA-18/19).
   */
  collision?: ContactSolicitation
}

/**
 * #2375.7 — « 17 numéros disponibles. 8 e-mails uniquement. 5 identités à
 * vérifier. » Trois COMPTES, jamais devinés : `phonesAvailable` est positif
 * (ce qu'on A), les deux autres nomment le manque.
 */
interface ProspectingSessionMissing {
  phonesAvailable: number
  emailsOnly: number
  toVerify: number
}

export interface ProspectingSession {
  mode: ProspectingSessionMode
  objective: string
  durationMinutes: number
  minutesPerContact: number
  /** Prêts en premier, dans l'ordre du mode ; les non-prêts suivent (visibles,
   *  jamais masqués — #2375.7 laisse CHOISIR la suite, pas disparaître). */
  contacts: ProspectingSessionContact[]
  /** #2375.6 — contacts PRÊTS laissés hors session, uniquement par manque de
   *  temps. Compté, jamais silencieusement coupé. */
  boundedOut: number
  missing: ProspectingSessionMissing
}

/** #2375.6 — minutes estimées par contact selon le canal : préparation +
 *  échange + prise de note. Un appel prend plus de temps qu'un message
 *  LinkedIn à envoyer ; une heure ne doit donc jamais proposer le même
 *  nombre de contacts sur les deux canaux. */
const MINUTES_PER_CONTACT: Record<ProspectingSessionMode, number> = {
  appels: 4,
  linkedin: 2,
  email: 1.5,
  mixte: 3,
  reactivation: 4,
  compte: 4,
  talent: 3,
}

function channelForMode(mode: ProspectingSessionMode, row: DiscoverCallListRow): ProspectingSessionChannel {
  switch (mode) {
    case 'appels':
    case 'reactivation':
    case 'compte':
      return 'call'
    case 'linkedin':
    case 'talent':
      return 'linkedin'
    case 'email':
      return 'email'
    case 'mixte':
      if (row.phone) return 'call'
      if (row.email) return 'email'
      return 'linkedin'
  }
}

function isReady(channel: ProspectingSessionChannel, row: DiscoverCallListRow): boolean {
  if (channel === 'call') return row.phone !== null
  if (channel === 'email') return row.email !== null
  // LinkedIn ne demande pas de coordonnée stockée : un nom suffit à chercher le profil.
  return true
}

/** #2375.4 — l'angle est REPRIS (raison suggérée, puis signal daté), jamais
 *  composé à partir de rien : un pitch sans matière réelle reste générique et
 *  le dit, plutôt que d'inventer un fait sur l'entreprise. */
function pitchFor(row: DiscoverCallListRow): string {
  if (row.reason) return row.reason
  if (row.signal) return `Signal récent : ${row.signal.label}`
  return `Prise de contact — ${row.company}`
}

function firstQuestionFor(row: DiscoverCallListRow): string {
  if (row.title) return `Est-ce vous qui portez le sujet côté « ${row.title} » chez ${row.company} ?`
  return `Es-tu la bonne personne pour ce sujet chez ${row.company} ?`
}

/** #2375.3 — Compte : les personnes d'une même entreprise restent adjacentes,
 *  le reste garde l'ordre déjà classé en amont (Découvrir). */
function sortForMode<T extends { company: string }>(rows: readonly T[], mode: ProspectingSessionMode): T[] {
  if (mode !== 'compte') return [...rows]
  return [...rows].sort((a, b) => a.company.localeCompare(b.company))
}

export function buildProspectingSession(
  rows: readonly DiscoverCallListRow[],
  params: ProspectingSessionParams,
): ProspectingSession {
  // #2375.1 — une ligne « entreprise seule » (aucune personne identifiée)
  // n'a rien à offrir à une session : on ne peut ni l'appeler, ni lui écrire.
  const withPerson = sortForMode(
    rows.filter((row): row is DiscoverCallListRow & { fullName: string } => row.fullName !== null),
    params.mode,
  )

  const contacts: ProspectingSessionContact[] = withPerson.map(row => {
    const channel = channelForMode(params.mode, row)
    return {
      key: row.key,
      contactId: row.contactId,
      company: row.company,
      fullName: row.fullName,
      title: row.title,
      channel,
      pitch: pitchFor(row),
      firstQuestion: firstQuestionFor(row),
      ready: isReady(channel, row),
    }
  })

  // #2375.7 — ce qui manque, compté sur TOUTE l'audience de la session (pas
  // seulement les prêts) : c'est justement ce qui permet de choisir la suite.
  const missing: ProspectingSessionMissing = {
    phonesAvailable: withPerson.filter(row => row.phone !== null).length,
    emailsOnly: withPerson.filter(row => row.phone === null && row.email !== null).length,
    toVerify: withPerson.filter(row => row.unknown.includes('person')).length,
  }

  // #2375.6 — le temps disponible borne le nombre de contacts PRÊTS, jamais
  // les non-prêts (qui ne consomment aucun créneau d'appel/message tant
  // qu'ils restent incomplets) : les prêts passent en premier.
  const minutesPerContact = MINUTES_PER_CONTACT[params.mode]
  const maxReady = minutesPerContact > 0 ? Math.floor(params.durationMinutes / minutesPerContact) : 0
  const ready = contacts.filter(contact => contact.ready)
  const notReady = contacts.filter(contact => !contact.ready)
  const keptReady = ready.slice(0, Math.max(0, maxReady))
  const boundedOut = Math.max(0, ready.length - keptReady.length)

  return {
    mode: params.mode,
    objective: params.objective,
    durationMinutes: params.durationMinutes,
    minutesPerContact,
    contacts: [...keptReady, ...notReady],
    boundedOut,
    missing,
  }
}

/**
 * #2386.6 — attache la collision entre commerciaux (#2128.17) à CHAQUE
 * contact de la session, depuis la réponse groupée de
 * `contactsApi.solicitations` (`ProspectingSessionDialog`, un seul appel
 * pour toute la session — jamais un par contact). PURE : ne fait aucun appel
 * réseau elle-même, ne fait que reporter ce que le serveur a rendu.
 */
export function mergeSessionCollisions(
  session: ProspectingSession,
  collisions: Readonly<Record<string, ContactSolicitation>>,
): ProspectingSession {
  return {
    ...session,
    contacts: session.contacts.map(contact =>
      contact.contactId && contact.contactId in collisions
        ? { ...contact, collision: collisions[contact.contactId] }
        : contact,
    ),
  }
}

/* ------------------------------------------------------------------ */
/*  #2375.8 — export checklist : pitch et première question inclus,      */
/*  même patron que `discoverCallListCsv` (colonnes = celles affichées). */
/* ------------------------------------------------------------------ */

interface ProspectingSessionLabels {
  company: string
  fullName: string
  title: string
  channel: string
  pitch: string
  firstQuestion: string
  ready: string
}

export function prospectingSessionCsv(session: ProspectingSession, labels: ProspectingSessionLabels): string {
  const headers = [
    labels.company,
    labels.fullName,
    labels.title,
    labels.channel,
    labels.pitch,
    labels.firstQuestion,
    labels.ready,
  ]
  const rows = session.contacts.map(contact => [
    contact.company,
    contact.fullName,
    contact.title ?? '',
    contact.channel,
    contact.pitch,
    contact.firstQuestion,
    contact.ready ? '1' : '',
  ])
  return toCsv([headers, ...rows])
}
