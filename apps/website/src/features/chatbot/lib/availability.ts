/**
 * La disponibilité humaine derrière Laura — « Handoff live vers humain selon
 * disponibilité » (§11, P2 du rapport du 17/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PROBLÈME QU'IL RÈGLE
 * ─────────────────────────────────────────────────────────────────────────────
 * La transmission à l'équipe part par e-mail, à toute heure, avec le même
 * silence à l'arrivée. Un visiteur qui écrit à 23 h un samedi reçoit
 * exactement le même « c'est transmis » qu'un visiteur du mardi 10 h — et
 * attend. Ce n'est pas une fonctionnalité manquante, c'est une promesse
 * implicite que personne ne tient.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS RÉPONSES, ET AUCUNE N'EST UNE ESTIMATION
 * ─────────────────────────────────────────────────────────────────────────────
 *   · `within_hour`   — on est DANS une plage déclarée, et il reste au moins
 *                       l'horizon promis avant qu'elle ferme.
 *   · `at_next_window`— on donne l'ouverture SUIVANTE, telle qu'elle est
 *                       déclarée. Jamais « bientôt ».
 *   · `unknown`       — aucune plage n'est déclarée : Laura ne promet AUCUN
 *                       délai. Une disponibilité absente n'est pas « ouvert
 *                       24 h/24 », c'est « on ne sait pas ».
 *
 * La subtilité qui fait tout le fichier : **être dans la plage ne suffit pas.**
 * À 17 h 40 pour une plage qui ferme à 18 h, « quelqu'un te répond dans
 * l'heure » est faux dans quarante minutes sur soixante. On renvoie donc à
 * l'ouverture du lendemain — c'est moins flatteur et c'est vrai.
 */

type ChatbotAvailabilityWindow = {
  /** 0 = dimanche … 6 = samedi, comme `Date#getDay`. */
  day: number
  /** Minutes depuis minuit, dans le fuseau déclaré. */
  startMinute: number
  endMinute: number
}

export type ChatbotAvailability = {
  /** Le fuseau de l'équipe, DÉCLARÉ. Jamais celui du serveur : un conteneur en
   *  UTC ferait promettre 9 h à un visiteur pour qui il est 11 h. */
  timeZone: string
  windows: readonly ChatbotAvailabilityWindow[]
}

/**
 * L'horizon qu'on ose promettre quand quelqu'un est là.
 *
 * Une heure, et pas « tout de suite » : un commercial en rendez-vous ne lit pas
 * sa boîte dans la minute, et le premier message du produit ne doit pas être
 * une promesse qu'il faudra excuser.
 */
export const HUMAN_REPLY_HORIZON_MINUTES = 60

type HumanReplyPromise =
  | { kind: 'within_hour' }
  | {
      kind: 'at_next_window'
      /** Le jour de l'ouverture suivante (0 = dimanche). */
      weekday: number
      startMinute: number
      /**
       * De quel jour on parle, du point de vue du visiteur.
       *
       * Dérivé ici, une seule fois : deux écrans qui recalculeraient « demain »
       * à partir du jour de la semaine divergeraient le vendredi soir, où le
       * jour suivant N'EST PAS demain.
       */
      when: 'today' | 'tomorrow' | 'later'
    }
  | { kind: 'unknown' }

const DAY_RANGE = /^([0-6])(?:-([0-6]))?$/
const TIME_RANGE = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/

/**
 * Lit une déclaration compacte : `1-5 09:00-18:00 ; 6 10:00-12:30`.
 *
 * **Tout ou rien.** Une seule plage illisible fait rendre `null` pour la
 * déclaration entière — garder les autres produirait une disponibilité à moitié
 * vraie, c'est-à-dire une promesse fausse un jour sur deux, et personne ne
 * saurait laquelle. Le no-op est explicite : sans déclaration, Laura ne promet
 * pas d'heure.
 */
export function parseChatbotAvailability(raw: string | undefined | null): ChatbotAvailabilityWindow[] | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null

  const windows: ChatbotAvailabilityWindow[] = []
  for (const chunk of trimmed.split(';')) {
    const parts = chunk.trim().split(/\s+/)
    if (parts.length !== 2) return null

    const days = DAY_RANGE.exec(parts[0]!)
    const time = TIME_RANGE.exec(parts[1]!)
    if (!days || !time) return null

    const from = Number(days[1])
    const to = days[2] === undefined ? from : Number(days[2])
    if (to < from) return null

    const startMinute = Number(time[1]) * 60 + Number(time[2])
    const endMinute = Number(time[3]) * 60 + Number(time[4])
    if (endMinute <= startMinute) return null

    for (let day = from; day <= to; day += 1) windows.push({ day, startMinute, endMinute })
  }

  return windows.length ? windows : null
}

const WEEKDAY_INDEX: Readonly<Record<string, number>> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/** L'instant, vu du fuseau déclaré. */
function zonedNow(now: Date, timeZone: string): { weekday: number; minuteOfDay: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now)

    const weekdayName = parts.find(part => part.type === 'weekday')?.value ?? ''
    const hour = Number(parts.find(part => part.type === 'hour')?.value)
    const minute = Number(parts.find(part => part.type === 'minute')?.value)
    const weekday = WEEKDAY_INDEX[weekdayName]

    if (weekday === undefined || !Number.isFinite(hour) || !Number.isFinite(minute)) return null
    return { weekday, minuteOfDay: hour * 60 + minute }
  } catch {
    // Un fuseau inconnu ne fait pas tomber une conversation : il fait taire la
    // promesse. Voir `unknown`, plus bas.
    return null
  }
}

export function humanReplyPromise(now: Date, availability: ChatbotAvailability | null): HumanReplyPromise {
  if (!availability?.windows.length) return { kind: 'unknown' }

  const current = zonedNow(now, availability.timeZone)
  if (!current) return { kind: 'unknown' }

  // 1. Sommes-nous dedans, avec assez de marge pour tenir la promesse ?
  const openNow = availability.windows.some(
    window =>
      window.day === current.weekday &&
      current.minuteOfDay >= window.startMinute &&
      window.endMinute - current.minuteOfDay >= HUMAN_REPLY_HORIZON_MINUTES,
  )
  if (openNow) return { kind: 'within_hour' }

  // 2. Sinon, la prochaine ouverture — en balayant les sept jours à venir, le
  //    jour même compris (une plage de l'après-midi quand on est le matin).
  for (let offset = 0; offset < 7; offset += 1) {
    const day = (current.weekday + offset) % 7
    const candidates = availability.windows
      .filter(window => window.day === day && (offset > 0 || window.startMinute > current.minuteOfDay))
      .sort((a, b) => a.startMinute - b.startMinute)

    const next = candidates[0]
    if (!next) continue
    return {
      kind: 'at_next_window',
      weekday: day,
      startMinute: next.startMinute,
      when: offset === 0 ? 'today' : offset === 1 ? 'tomorrow' : 'later',
    }
  }

  return { kind: 'unknown' }
}

/**
 * La disponibilité déclarée par l'exploitation, ou `null`.
 *
 * `CHATBOT_AVAILABILITY_WINDOWS` au format `1-5 09:00-18:00 ; 6 10:00-12:30`,
 * `CHATBOT_AVAILABILITY_TZ` par défaut `Europe/Paris` — le fuseau de l'équipe,
 * pas celui du conteneur : un serveur en UTC ferait promettre une ouverture à
 * 9 h à un visiteur pour qui il est déjà 11 h.
 *
 * **Sans variable, no-op STRICT** : `null`, et Laura ne promet AUCUN délai. Une
 * disponibilité absente n'est pas « ouvert 24 h/24 » — c'est « on ne sait pas »,
 * et une promesse devinée est exactement ce que ce module vient corriger.
 */
export function declaredAvailability(): ChatbotAvailability | null {
  const windows = parseChatbotAvailability(process.env.CHATBOT_AVAILABILITY_WINDOWS)
  if (!windows) return null
  return { timeZone: process.env.CHATBOT_AVAILABILITY_TZ?.trim() || 'Europe/Paris', windows }
}

/**
 * Ce que le résultat d'outil dit au modèle après une transmission réussie.
 *
 * Une CONSIGNE, pas une phrase à recopier : le modèle écrit dans la langue et le
 * ton de la conversation, et une phrase figée en français atterrirait telle
 * quelle dans un échange en anglais. Ce qui est figé, c'est ce qu'il a le droit
 * de promettre — et rien d'autre. Sans disponibilité déclarée, la consigne
 * INTERDIT explicitement d'annoncer un délai : c'est la seule formulation qui
 * empêche « on te répond très vite » de réapparaître de lui-même.
 */
export function handoffPromiseInstruction(promise: HumanReplyPromise): string {
  if (promise.kind === 'within_hour') {
    return "transmis à l'équipe — tu peux dire que quelqu'un répond dans l'heure"
  }

  if (promise.kind === 'at_next_window') {
    const hour = `${String(Math.floor(promise.startMinute / 60)).padStart(2, '0')}:${String(
      promise.startMinute % 60,
    ).padStart(2, '0')}`
    const when =
      promise.when === 'today'
        ? `aujourd'hui à partir de ${hour}`
        : promise.when === 'tomorrow'
          ? `demain à partir de ${hour}`
          : `à la prochaine ouverture de l'équipe, à partir de ${hour}`
    return `transmis à l'équipe — personne n'est disponible à cette heure ; dis que la réponse arrivera ${when}, et n'annonce aucun autre délai`
  }

  return "transmis à l'équipe — n'annonce AUCUN délai de réponse, on n'en connaît pas"
}
