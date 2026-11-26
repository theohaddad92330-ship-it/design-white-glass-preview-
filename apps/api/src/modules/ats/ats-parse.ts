import type { AtsCandidate, AtsConsultant, AtsMission, AtsNeed } from '@bellum/contracts'

/**
 * Lecture des enregistrements de l'ATS.
 *
 * Pourquoi c'est un fichier à part, et pur : la forme des réponses de
 * BoondManager n'est pas entièrement documentée publiquement. Le client officiel
 * et les intégrations tierces montrent un JSON:API où les champs vivent tantôt
 * à la racine, tantôt sous `attributes`, avec des noms qui varient selon la
 * ressource. Deviner dans un service, au milieu d'appels réseau, produirait des
 * champs vides sans qu'on sache jamais si c'est l'ERP ou nous.
 *
 * Règle de fond : **un champ illisible vaut `null`, jamais une valeur de
 * remplissage.** Un TJM à 0 ou une disponibilité « aujourd'hui » inventée
 * feraient prendre de mauvaises décisions commerciales — l'inverse exact de ce
 * qu'on vend.
 */

type Json = Record<string, unknown>

const isJson = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Les champs peuvent vivre à la racine ou sous `attributes` (JSON:API). */
function flatten(node: Json): Json {
  const attributes = node['attributes']
  return isJson(attributes) ? { ...attributes, ...node } : node
}

function pickString(node: Json, keys: string[]): string | null {
  for (const key of keys) {
    const value = node[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return null
}

function pickNumber(node: Json, keys: string[]): number | null {
  for (const key of keys) {
    const value = node[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return null
}

/** Une date ISO exploitable, ou `null`. Jamais « aujourd'hui » par défaut. */
function pickDate(node: Json, keys: string[]): string | null {
  const raw = pickString(node, keys)
  if (!raw) return null
  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
}

/** Un nom de personne, reconstitué depuis les formes usuelles. */
function pickPersonName(node: Json): string | null {
  const direct = pickString(node, ['fullName', 'name', 'label', 'title'])
  if (direct) return direct
  const first = pickString(node, ['firstName', 'firstname'])
  const last = pickString(node, ['lastName', 'lastname'])
  const joined = [first, last].filter(Boolean).join(' ').trim()
  return joined || null
}

/** Le nom d'une société, qu'elle soit imbriquée ou aplatie. */
function pickCompanyName(node: Json): string | null {
  const nested = node['company']
  if (isJson(nested)) {
    const name = pickString(flatten(nested), ['name', 'corporateName', 'label'])
    if (name) return name
  }
  return pickString(node, ['companyName', 'customer', 'clientName'])
}

/** Jours pleins entre maintenant et une date ISO. Négatif = déjà passé. */
export function daysUntil(iso: string | null, now: Date): number | null {
  if (!iso) return null
  const target = Date.parse(iso)
  if (Number.isNaN(target)) return null
  return Math.round((target - now.getTime()) / 86_400_000)
}

export function parseConsultant(raw: Json, now: Date): AtsConsultant | null {
  const node = flatten(raw)
  const id = pickString(node, ['id', 'reference'])
  const fullName = pickPersonName(node)
  if (!id || !fullName) return null

  const availableAt = pickDate(node, ['availabilityDate', 'availability', 'dateAvailability'])
  const lastMissionEnd = pickDate(node, ['lastMissionEndDate', 'endDate', 'dateEnd'])
  const sinceEnd = lastMissionEnd ? daysUntil(lastMissionEnd, now) : null

  const skillsRaw = node['skills'] ?? node['expertise'] ?? node['technologies']
  const skills = Array.isArray(skillsRaw)
    ? skillsRaw
        .map(value => (typeof value === 'string' ? value : isJson(value) ? pickString(value, ['name', 'label']) : null))
        .filter((value): value is string => Boolean(value))
    : []

  return {
    id,
    fullName,
    title: pickString(node, ['title', 'jobTitle', 'function']),
    availableAt,
    // `daysWithoutMission` = ancienneté de la FIN de mission, donc l'opposé du
    // « jours restants ». Négatif signifie déjà terminé, donc sur le banc.
    daysWithoutMission: sinceEnd !== null && sinceEnd < 0 ? Math.abs(sinceEnd) : null,
    dailyRate: pickNumber(node, ['averageDailyPriceExcludingTax', 'dailyRate', 'tjm', 'price']),
    skills,
  }
}

export function parseNeed(raw: Json): AtsNeed | null {
  const node = flatten(raw)
  const id = pickString(node, ['id', 'reference'])
  const title = pickString(node, ['title', 'name', 'label'])
  if (!id || !title) return null
  return {
    id,
    title,
    companyName: pickCompanyName(node),
    createdAt: pickDate(node, ['creationDate', 'createdAt', 'startDate']),
    state: pickString(node, ['state', 'status']),
  }
}

export function parseMission(raw: Json, now: Date): AtsMission | null {
  const node = flatten(raw)
  const id = pickString(node, ['id', 'reference'])
  const title = pickString(node, ['title', 'name', 'label']) ?? 'Mission'
  if (!id) return null

  const endsAt = pickDate(node, ['endDate', 'dateEnd', 'expectedEndDate'])
  const consultant = node['resource'] ?? node['consultant'] ?? node['dependsOn']

  return {
    id,
    title,
    companyName: pickCompanyName(node),
    consultantName: isJson(consultant) ? pickPersonName(flatten(consultant)) : pickString(node, ['resourceName']),
    startsAt: pickDate(node, ['startDate', 'dateStart']),
    endsAt,
    daysRemaining: daysUntil(endsAt, now),
  }
}

/**
 * Les missions qui se terminent dans `withinDays`, les plus urgentes d'abord.
 *
 * Une mission SANS date de fin n'est pas retenue : on ne peut pas alerter sur
 * une échéance qu'on ne connaît pas, et l'inventer ferait relancer un client au
 * hasard. Les missions déjà terminées non plus — elles n'appellent plus une
 * anticipation mais un constat.
 */
export function selectEndingMissions(missions: AtsMission[], withinDays: number): AtsMission[] {
  return missions
    .filter(
      mission => mission.daysRemaining !== null && mission.daysRemaining >= 0 && mission.daysRemaining <= withinDays,
    )
    .sort((a, b) => (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0))
}

/** Les consultants sans mission depuis plus de `minDays` jours. */
export function selectBenched(consultants: AtsConsultant[], minDays: number): AtsConsultant[] {
  return consultants
    .filter(consultant => consultant.daysWithoutMission !== null && consultant.daysWithoutMission >= minDays)
    .sort((a, b) => (b.daysWithoutMission ?? 0) - (a.daysWithoutMission ?? 0))
}

/**
 * #4065.9 — les missions TERMINÉES depuis `sinceDays` jours (fin passée), la plus récente d'abord.
 * Sans date de fin, ou pas encore finie : jamais « terminée ».
 */
export function selectEndedMissions(missions: AtsMission[], sinceDays: number): AtsMission[] {
  return missions
    .filter(
      mission => mission.daysRemaining !== null && mission.daysRemaining < 0 && mission.daysRemaining >= -sinceDays,
    )
    .sort((a, b) => (b.daysRemaining ?? 0) - (a.daysRemaining ?? 0))
}

/** #4065.9 — un candidat. La date d'entretien n'est lue que si l'ERP la rend : sinon `null`, jamais devinée. */
export function parseCandidate(raw: Json): AtsCandidate | null {
  const node = flatten(raw)
  const id = pickString(node, ['id', 'reference'])
  const fullName = pickPersonName(node)
  if (!id || !fullName) return null
  return {
    id,
    fullName,
    title: pickString(node, ['title', 'jobTitle', 'function']),
    interviewedAt: pickDate(node, ['interviewDate', 'dateInterview', 'lastInterviewDate']),
  }
}

/** #4065.9 — les candidats dont l'entretien est DATÉ et tombe dans les `sinceDays` derniers jours. */
export function selectInterviewedCandidates(candidates: AtsCandidate[], sinceDays: number, now: Date): AtsCandidate[] {
  return candidates
    .filter(candidate => {
      const days = daysUntil(candidate.interviewedAt, now)
      return days !== null && days <= 0 && days >= -sinceDays
    })
    .sort((a, b) => (b.interviewedAt ?? '').localeCompare(a.interviewedAt ?? ''))
}
