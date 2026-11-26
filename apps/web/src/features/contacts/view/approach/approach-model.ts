import { INTERACTION_ACTIVITY_KINDS, type Activity } from '@bellum/contracts'
import type { MessageInsight } from '@/lib/message-insight'
import type { MESSAGE_OBJECTIVE_CODES } from '@/features/accounts/view/account-detail/components/contact-engagement/message-parameters'

type MessageObjectiveCode = (typeof MESSAGE_OBJECTIVE_CODES)[number]

/**
 * Théo C6 — le modèle PUR de la page « Préparer ton e-mail / ton message LinkedIn ».
 * Aucune lecture réseau ici : tout ce qui se décide sans écran se teste sans écran.
 */

/** Les trois objectifs de la page de Théo, chacun branché sur un code que le MOTEUR revalide (C6.R2). Les quatorze autres
 *  restent dans « Précisions facultatives » (C6.A2) : aucun ne disparaît. */
export const APPROACH_OBJECTIVES: readonly {
  id: 'orientation' | 'resume' | 'expertise'
  code: MessageObjectiveCode
}[] = [
  { id: 'orientation', code: 'recommandation' },
  { id: 'resume', code: 'reprise_relation' },
  { id: 'expertise', code: 'positionnement_expertise' },
]

export type ApproachChannel = 'email' | 'linkedin' | 'call'

/** `.page-head p` de Théo — « Paul Ferrer · Responsable programme SAP ». */
export function approachSubtitle(contact: { full_name: string; title: string | null }): string {
  return [contact.full_name, contact.title].filter(Boolean).join(' · ')
}

/** Théo C6 — le menu « … » (« Autres canaux ») : chaque entrée est un objectif que le moteur rédige, sur son canal.
 *  Sur le canal courant, elle change l'objectif (le brouillon se réécrit) ; sinon, elle ouvre la page du canal. */
export const APPROACH_MORE_CHANNELS: readonly {
  id: 'followUp' | 'profile' | 'introduction' | 'partner' | 'connectionNote'
  channel: ApproachChannel
  code: MessageObjectiveCode
}[] = [
  { id: 'followUp', channel: 'email', code: 'relance' },
  { id: 'profile', channel: 'email', code: 'proposer_profil' },
  { id: 'introduction', channel: 'email', code: 'introduction' },
  { id: 'partner', channel: 'email', code: 'partenariat' },
  { id: 'connectionNote', channel: 'linkedin', code: 'ouverture_compte' },
]

/** Le canal porté par l'URL `/contacts/<id>/approach/<canal>` ; SMS, WhatsApp et vocal sont retirés (B1). */
export function approachChannelFromParam(param: string): ApproachChannel | null {
  return param === 'email' || param === 'linkedin' || param === 'call' ? param : null
}

/**
 * Théo C7.N1 — « Trois questions pour qualifier » : les questions que le script d'appel rédigé par {copilote} POSE
 * déjà (la première, celle de l'ouverture, reste dans l'ouverture). La question du rôle de décision
 * (suggestion MEDDIC), quand le rôle est établi, passe en tête ; sans script ni rôle, rien : on n'invente aucune question.
 */
export function callQualificationQuestions(script: string, roleQuestion: string | null): string[] {
  const sentences = script.match(/[^.!?\n]+[.!?]+/g) ?? []
  const questions = sentences
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.endsWith('?'))
    .slice(1, 4)
  // #4525.5 — la question du RÔLE de décision (suggestion MEDDIC) ouvre la liste, comme sur la page dédiée retirée.
  return [...(roleQuestion ? [roleQuestion] : []), ...questions].slice(0, 3)
}

const quoted = (value: string) =>
  value
    .trim()
    .replace(/^[«"“]\s*/, '')
    .replace(/\s*[»"”]$/, '')
    .trim()

/**
 * #4975.1 — l'ouverture d'appel ne contient AUCUNE objection : les lignes « Objection — … Réponse — … » (ou « : »,
 * réponse sur la ligne suivante) quittent l'ouverture et vont dans le bloc « Si l'on te répond… ». Rien n'est inventé :
 * on ne fait que ranger ce que le script porte déjà.
 */
export function splitCallScript(script: string): {
  opening: string
  objections: { objection: string; response: string }[]
} {
  const kept: string[] = []
  const objections: { objection: string; response: string }[] = []
  let pending: { objection: string; response: string } | null = null
  for (const line of script.split('\n')) {
    const objection = /^\s*Objection\s*[—:–-]\s*(.*)$/i.exec(line)
    const response = /^\s*R[ée]ponse\s*[—:–-]\s*(.*)$/i.exec(line)
    if (objection) {
      const inline = /^(.*?)\s+R[ée]ponse\s*[—:–-]\s*(.*)$/i.exec(objection[1] ?? '')
      pending = { objection: quoted(inline ? inline[1]! : objection[1]!), response: quoted(inline?.[2] ?? '') }
      objections.push(pending)
    } else if (response && pending && !pending.response) {
      pending.response = quoted(response[1]!)
    } else {
      pending = null
      kept.push(line)
    }
  }
  return { opening: kept.join('\n'), objections }
}

export type DraftContent = { subject: string; body: string }

const normalize = (value: string) => value.trim().replace(/\r\n/g, '\n')

export function sameDraftContent(a: DraftContent, b: DraftContent): boolean {
  return normalize(a.subject) === normalize(b.subject) && normalize(a.body) === normalize(b.body)
}

type ApproachDraftStatus = 'writing' | 'draft' | 'validated'

/** « Non envoyé » (brouillon) ou « Validé » : la validation est liée à CETTE version — modifier le texte la fait tomber. */
export function approachDraftStatus({
  current,
  validated,
  generating,
}: {
  current: DraftContent
  validated: DraftContent | null
  generating: boolean
}): ApproachDraftStatus {
  if (generating) return 'writing'
  return validated && sameDraftContent(current, validated) ? 'validated' : 'draft'
}

type EvidenceItem = { kind: string; value: string }

const OBSERVED_KINDS = new Set([
  'dated_signal',
  'precise_entity',
  'precise_contact',
  'access_path',
  'known_constraint',
  'territory',
  'user_objective',
])
const HISTORY_KINDS = new Set(['client_reference'])
const ESN_KINDS = new Set(['esn_expertise', 'capacity', 'available_consultant'])

/** Théo C6.N3 — « Voir la preuve » : ce que Laura a RÉELLEMENT cité, séparé en observé / historique / ESN / interprétation. */
export function groupEvidence(insight: MessageInsight): {
  observed: EvidenceItem[]
  history: EvidenceItem[]
  esn: EvidenceItem[]
  interpretation: string | null
} {
  const elements = insight.specificity?.elements ?? []
  return {
    observed: elements.filter(item => OBSERVED_KINDS.has(item.kind)),
    history: elements.filter(item => HISTORY_KINDS.has(item.kind)),
    esn: elements.filter(item => ESN_KINDS.has(item.kind)),
    interpretation: insight.rationale?.trim() || null,
  }
}

type CallBriefFact = {
  kind: 'why' | 'last_exchange' | 'last_sent' | 'signal' | 'key_point'
  text: string
  date: string | null
}

/**
 * Théo C7 — « Ce qu'il faut savoir avant d'appeler » : uniquement ce que la fiche SAIT déjà — le dernier message
 * parti, les signaux datés de la personne, ses points clés. Quatre lignes au plus (le pourquoi du contact, s'il est connu, en premier) ; rien de connu, aucune ligne
 * (l'écran retire alors la carte entière, il n'écrit jamais « 0 » ni un fait deviné).
 */
export function callBriefFacts(contact: {
  why_contact?: string | null
  email_sent_at?: string | null
  /** #4525.5 — le dernier échange consigné dans la timeline (appel, rendez-vous, message) ; `null` = aucun. */
  last_exchange?: { at: string; subject: string | null } | null
  signals?: { label: string; date?: string | null }[] | null
  key_points?: string[] | null
}): CallBriefFact[] {
  const facts: CallBriefFact[] = []
  // #4525.2 — « pourquoi ce contact » : ce que la page d'appel dédiée (retirée) disait en premier.
  const why = contact.why_contact?.trim()
  if (why) facts.push({ kind: 'why', text: why, date: null })
  const exchange = contact.last_exchange
  if (exchange && !Number.isNaN(Date.parse(exchange.at))) {
    // Le dernier échange englobe le dernier envoi : une seule ligne « dernier contact », jamais deux.
    facts.push({ kind: 'last_exchange', text: exchange.subject?.trim() ?? '', date: exchange.at })
  } else if (contact.email_sent_at && !Number.isNaN(Date.parse(contact.email_sent_at))) {
    facts.push({ kind: 'last_sent', text: '', date: contact.email_sent_at })
  }
  for (const signal of contact.signals ?? []) {
    const label = signal.label?.trim()
    if (label) facts.push({ kind: 'signal', text: label, date: signal.date ?? null })
  }
  for (const point of contact.key_points ?? []) {
    const text = point?.trim()
    if (text) facts.push({ kind: 'key_point', text, date: null })
  }
  return facts.slice(0, 4)
}

/** #4525.5 — le plus récent des échanges consignés avec la personne (appel, rendez-vous, message) : jamais une note pour soi. */
export function latestExchange(
  activities: readonly Pick<Activity, 'kind' | 'occurredAt' | 'subject'>[] | undefined,
): { at: string; subject: string | null } | null {
  const exchanges = (activities ?? []).filter(
    activity =>
      (INTERACTION_ACTIVITY_KINDS as readonly string[]).includes(activity.kind) &&
      !Number.isNaN(Date.parse(activity.occurredAt)),
  )
  const latest = [...exchanges].sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))[0]
  return latest ? { at: latest.occurredAt, subject: latest.subject?.trim() || null } : null
}
