/**
 * #3970 (lot P07, 09/10/2026) — « qui a rejoint l'entreprise récemment, à quel
 * rôle, depuis quand — et est-ce que ça colle à mon contexte ? »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENT LE FAIT
 * ─────────────────────────────────────────────────────────────────────────
 * Aucune collecte neuve : le parcours professionnel que l'enrichissement de
 * personnes a DÉJÀ rapporté et persisté sur chaque contact du compte
 * (`contacts.apollo_enrichment.employment_history[]`, avec `start_date` et
 * `current`). Jusqu'ici, seuls `detectedNewEmployer` et `knownRelationshipFacts`
 * le lisaient — jamais comme un recrutement du compte.
 *
 * Un recrutement récent = un poste COURANT, chez CE compte (même clé de nom
 * d'entreprise que Découvrir, `normalizeCompanyNameKey`), commencé il y a au
 * plus {@link RECENT_HIRE_WINDOW_DAYS} jours. Une date absente ou illisible ne
 * fait AUCUNE ligne : « récent » sans date serait un fait inventé, et dans une
 * liste une absence ne s'affiche pas (doctrine du 20/09).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA PERTINENCE, EN RAISONS NOMMÉES
 * ─────────────────────────────────────────────────────────────────────────
 * Le rôle recruté est rapproché du contexte DÉCLARÉ de l'espace : ses personas
 * décideurs (`decision_maker_personas`) puis ses métiers placés
 * (`placed_roles`). Mêmes trois verdicts que `signalRelevance` (#3923) — jamais
 * une probabilité, jamais un score : une raison qui dit ce qui a été comparé.
 * Sans rien de déclaré, `non_evaluable` : l'absence de contexte n'est jamais
 * une pénalité. Aucun critère protégé n'entre ici — seul l'intitulé du poste
 * est comparé.
 */

import { normalizeCompanyNameKey } from './discover-call-list.js'
import type { SignalRelevanceVerdict } from './signal-relevance.js'

/** ≤ 6 mois, au jour près (la demande de Louis du 09/10). */
export const RECENT_HIRE_WINDOW_DAYS = 183

const DAY_MS = 24 * 60 * 60 * 1000
const START_DATE_RE = /^(\d{4})-(\d{2})(?:-(\d{2}))?/

type EmploymentEntry = {
  organization_name?: string | null
  title?: string | null
  start_date?: string | null
  current?: boolean
}

export type RecentHireContact = {
  id: string
  full_name: string | null
  title: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  apollo_enrichment?: { employment_history?: readonly EmploymentEntry[] | null } | null
}

export type RecentHireProfile = {
  /** `esn_profiles.decision_maker_personas` — les décideurs que l'espace vise. */
  personas: readonly string[]
  /** `esn_profiles.placed_roles` — les métiers que l'espace place réellement. */
  placedRoles: readonly string[]
}

export type RecentHire = {
  contactId: string
  name: string
  role: string
  /** La date telle que la source l'a donnée (`AAAA-MM-JJ` ou `AAAA-MM`). */
  startedOn: string
  /** La CAPACITÉ qui a rapporté le fait — jamais le nom d'un fournisseur (GA-44). */
  source: 'people_enrichment'
  /** Coordonnées professionnelles en clair (c87). */
  email: string | null
  phone: string | null
  linkedinUrl: string | null
  relevance: SignalRelevanceVerdict
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

/** Début de mois (ou jour exact) en UTC, ou `null` — jamais une date devinée. */
function startMs(startDate: string): number | null {
  const match = START_DATE_RE.exec(startDate)
  if (!match) return null
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, match[3] ? Number(match[3]) : 1)
  return Number.isNaN(ms) ? null : ms
}

function sameCompany(organization: string, companyKey: string): boolean {
  const key = normalizeCompanyNameKey(organization)
  if (!key || !companyKey) return false
  return key === companyKey || key.startsWith(`${companyKey} `) || companyKey.startsWith(`${key} `)
}

/** Accents ET apostrophes typographiques : « d’information » et « d'Information » sont le même mot. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`´]/g, "'")
    .toLowerCase()
}

/** « DSI / Directeur des Systèmes d'Information » → ses deux appellations. */
function aliases(label: string): string[] {
  return label
    .split(/\s*\/\s*|[()]/)
    .map(part => part.trim())
    .filter(part => part.length >= 2)
}

function matchesWord(role: string, alias: string): boolean {
  const escaped = fold(alias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(fold(role))
}

function hireRelevance(role: string, profile: RecentHireProfile): SignalRelevanceVerdict {
  const personas = profile.personas.filter(persona => persona.trim().length > 0)
  const placedRoles = profile.placedRoles.filter(placed => placed.trim().length > 0)
  const persona = personas.find(label => aliases(label).some(alias => matchesWord(role, alias)))
  if (persona) {
    return {
      status: 'pertinent',
      reasonFr: `Nouveau décideur de ta persona « ${persona} » — il revoit souvent ses prestataires à son arrivée.`,
      reasonEn: `New decision-maker from your persona "${persona}" — newcomers often review their suppliers.`,
    }
  }
  const placed = placedRoles.find(label => matchesWord(role, label))
  if (placed) {
    return {
      status: 'pertinent',
      reasonFr: `Recrute dans ta famille métier « ${placed} ».`,
      reasonEn: `Hiring in your trade family "${placed}".`,
    }
  }
  if (personas.length === 0 && placedRoles.length === 0) {
    return {
      status: 'non_evaluable',
      reasonFr: 'Pertinence non évaluable — ton profil ne déclare ni persona décideur ni métier placé.',
      reasonEn: 'Relevance not evaluable — your profile declares no decision-maker persona nor placed role.',
    }
  }
  const compared = [...personas, ...placedRoles].join(', ')
  return {
    status: 'hors_metier',
    reasonFr: `Hors contexte — ne recoupe ni tes personas ni tes métiers placés (${compared}).`,
    reasonEn: `Out of context — matches neither your personas nor your placed roles (${compared}).`,
  }
}

/**
 * Les recrutements récents d'un compte, lus sur ses contacts, les plus récents
 * d'abord. Un contact ne fait qu'une ligne (son poste courant le plus récent).
 */
export function recentHires(
  contacts: readonly RecentHireContact[],
  options: { companyName: string; profile: RecentHireProfile; nowMs?: number },
): RecentHire[] {
  const nowMs = options.nowMs ?? Date.now()
  const companyKey = normalizeCompanyNameKey(options.companyName)
  const hires: { hire: RecentHire; at: number }[] = []
  for (const contact of contacts) {
    const name = text(contact.full_name)
    if (!name) continue
    let best: { entry: EmploymentEntry; at: number; startedOn: string } | null = null
    for (const entry of contact.apollo_enrichment?.employment_history ?? []) {
      if (!entry?.current) continue
      const organization = text(entry.organization_name)
      const startedOn = text(entry.start_date)
      if (!organization || !startedOn || !sameCompany(organization, companyKey)) continue
      const at = startMs(startedOn)
      if (at === null || at > nowMs || nowMs - at > RECENT_HIRE_WINDOW_DAYS * DAY_MS) continue
      if (!best || at > best.at) best = { entry, at, startedOn }
    }
    if (!best) continue
    const role = text(best.entry.title) ?? text(contact.title)
    if (!role) continue
    hires.push({
      at: best.at,
      hire: {
        contactId: contact.id,
        name,
        role,
        startedOn: best.startedOn,
        source: 'people_enrichment',
        email: text(contact.email),
        phone: text(contact.phone),
        linkedinUrl: text(contact.linkedin_url),
        relevance: hireRelevance(role, options.profile),
      },
    })
  }
  return hires.sort((a, b) => b.at - a.at).map(({ hire }) => hire)
}

/**
 * La réponse de `GET /accounts/:id/recent-hires`. `examinedContacts` compte les
 * contacts dont le parcours est CONNU : à 0, l'écran dit « non mesuré », jamais
 * « aucun recrutement » — ne pas avoir regardé n'est pas avoir regardé et rien vu.
 */
export type AccountRecentHires = {
  windowDays: number
  examinedContacts: number
  hires: RecentHire[]
}

/** Combien de contacts portent un parcours professionnel lisible. */
export function countExaminedContacts(contacts: readonly RecentHireContact[]): number {
  return contacts.filter(contact => (contact.apollo_enrichment?.employment_history ?? []).length > 0).length
}
