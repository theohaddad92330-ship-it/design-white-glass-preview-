import type { CallRecord } from '@bellum/contracts'

/**
 * La normalisation des appels — pure, testée, hors du client réseau.
 *
 * Deux fournisseurs nomment les mêmes faits différemment : Aircall dit
 * `raw_digits` et `duration`, Ringover dit `from_number` et `total_duration`.
 * Le reste du produit ne doit connaître ni l'un ni l'autre (règle « aucun nom de
 * fournisseur côté app »), donc la traduction se fait ici, une fois.
 *
 * Règle unique et sans exception : **un champ illisible vaut `null`**. Un appel
 * sans durée n'a pas duré zéro seconde ; un appel dont l'état ne se lit pas
 * n'est pas « manqué ». Une valeur de remplissage se retrouverait telle quelle
 * dans une note de CRM, où plus personne ne saurait qu'elle a été inventée.
 */

const str = (value: unknown): string | null => {
  if (value == null) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

const num = (value: unknown): number | null => {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** Une date en ISO, qu'elle arrive en secondes Unix, en millisecondes ou en
 *  texte. `null` sur tout ce qui ne se lit pas. */
function isoOf(value: unknown): string | null {
  const raw = str(value)
  if (!raw) return null
  const asNumber = Number(raw)
  if (Number.isFinite(asNumber)) {
    // Aircall date en SECONDES Unix, d'autres en millisecondes. Le seuil de
    // 10^11 sépare les deux sans ambiguïté jusqu'en l'an 5138.
    const ms = asNumber < 1e11 ? asNumber * 1000 : asNumber
    return new Date(ms).toISOString()
  }
  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
}

function joinName(first: unknown, last: unknown): string | null {
  const parts = [str(first), str(last)].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : null
}

type RawRecord = Record<string, unknown>

const asRecord = (value: unknown): RawRecord => (value && typeof value === 'object' ? (value as RawRecord) : {})

/** Un appel Aircall. `null` quand la ligne n'a même pas d'identifiant — sans
 *  lui, l'idempotence du journal CRM n'existe plus. */
export function parseAircallCall(raw: unknown): CallRecord | null {
  const row = asRecord(raw)
  const id = str(row['id'])
  if (!id) return null

  const contact = asRecord(row['contact'])
  const user = asRecord(row['user'])
  const emails = Array.isArray(contact['emails']) ? (contact['emails'] as unknown[]) : []
  const firstEmail = emails.length > 0 ? str(asRecord(emails[0])['value']) : null
  const direction = str(row['direction'])
  const status = str(row['status'])

  return {
    id,
    provider: 'aircall',
    direction: direction === 'inbound' ? 'inbound' : direction === 'outbound' ? 'outbound' : 'unknown',
    counterpartNumber: str(row['raw_digits']),
    counterpartName: joinName(contact['first_name'], contact['last_name']),
    counterpartEmail: firstEmail,
    agentName: str(user['name']),
    startedAt: isoOf(row['started_at']),
    durationSeconds: num(row['duration']),
    // `answered_at` renseigné ⇒ décroché. Un appel « done » sans heure de
    // décroché reste inconnu plutôt que supposé répondu.
    answered: row['answered_at'] != null ? true : status === 'done' ? null : status ? false : null,
    transcript: null,
  }
}

/** Un appel Ringover. */
export function parseRingoverCall(raw: unknown): CallRecord | null {
  const row = asRecord(raw)
  const id = str(row['call_id']) ?? str(row['cdr_id'])
  if (!id) return null

  const contact = asRecord(row['contact'])
  const user = asRecord(row['user'])
  const type = str(row['type'])
  const isInbound = type === 'in' || type === 'inbound'
  const isOutbound = type === 'out' || type === 'outbound'
  const answeredAt = row['answered_time'] ?? row['start_time_answered']

  return {
    id,
    provider: 'ringover',
    direction: isInbound ? 'inbound' : isOutbound ? 'outbound' : 'unknown',
    // Le numéro de l'INTERLOCUTEUR dépend du sens : sur un appel entrant c'est
    // l'appelant, sur un sortant c'est l'appelé. Prendre toujours le même
    // champ afficherait le numéro de l'ESN dans la moitié des notes.
    counterpartNumber: isInbound ? str(row['from_number']) : isOutbound ? str(row['to_number']) : null,
    counterpartName: joinName(contact['firstname'], contact['lastname']) ?? str(contact['company']),
    counterpartEmail: str(contact['email']),
    agentName: joinName(user['firstname'], user['lastname']),
    startedAt: isoOf(row['start_time']),
    durationSeconds: num(row['total_duration']),
    answered: answeredAt != null ? true : row['last_state'] != null ? false : null,
    transcript: null,
  }
}

/**
 * Un appel Allo. Champs vérifiés sur la spécification OpenAPI publique
 * (`help.withallo.com`, 28/09/2026) : `id`, `from_number`, `to_number`,
 * `type` (`INBOUND`/`OUTBOUND`), `length_in_minutes`, `start_date`,
 * `summary`. `result` (`ANSWERED`/`VOICEMAIL`/…) n'est documenté que sur le
 * webhook, PAS sur `GET /calls` — on ne le lit donc que s'il est là, jamais
 * supposé absent d'un statut.
 */
export function parseAlloCall(raw: unknown): CallRecord | null {
  const row = asRecord(raw)
  const id = str(row['id'])
  if (!id) return null

  const type = str(row['type'])
  const minutes = num(row['length_in_minutes'])
  const result = str(row['result'])

  return {
    id,
    provider: 'allo',
    direction: type === 'INBOUND' ? 'inbound' : type === 'OUTBOUND' ? 'outbound' : 'unknown',
    // Allo ne rend qu'UN numéro par appel côté `GET /calls` (`from_number` ET
    // `to_number` sont documentés, mais l'un des deux est toujours celui du
    // numéro Allo interrogé) — le sens de l'appel dit lequel est l'interlocuteur.
    counterpartNumber:
      type === 'INBOUND' ? str(row['from_number']) : type === 'OUTBOUND' ? str(row['to_number']) : null,
    counterpartName: null,
    counterpartEmail: null,
    agentName: null,
    startedAt: isoOf(row['start_date']),
    durationSeconds: minutes != null ? Math.round(minutes * 60) : null,
    answered: result ? result === 'ANSWERED' : null,
    transcript: null,
  }
}

/**
 * Le texte d'une transcription Allo, assemblée depuis ses tours de parole.
 * Champ `transcript` : tableau d'objets `{source, text, time}` (vérifié sur
 * l'OpenAPI publique). `source` est le rôle du tour (agent/contact) tel que
 * rendu par Allo — recopié, jamais traduit.
 */
export function parseAlloTranscript(raw: unknown): string | null {
  const row = asRecord(raw)
  const turns = Array.isArray(row['transcript']) ? (row['transcript'] as unknown[]) : []
  const lines = turns
    .map(turn => {
      const t = asRecord(turn)
      const source = str(t['source'])
      const text = str(t['text'])
      if (!text) return null
      return source ? `${source} : ${text}` : text
    })
    .filter((line): line is string => line !== null)
  return lines.length > 0 ? lines.join('\n') : null
}

/**
 * Le texte d'une transcription Aircall, assemblé depuis ses tours de parole.
 *
 * Rendu vide ⇒ `null` : une chaîne vide déposée en note de CRM se lit
 * « l'appel n'a rien donné », alors qu'elle veut dire « rien n'a été transcrit ».
 */
export function parseAircallTranscript(raw: unknown): string | null {
  const content = asRecord(asRecord(asRecord(raw)['transcription'])['content'])
  const utterances = Array.isArray(content['utterances']) ? (content['utterances'] as unknown[]) : []
  const lines = utterances
    .map(utterance => {
      const row = asRecord(utterance)
      const who = str(row['participant_type'])
      const text = str(row['text'])
      if (!text) return null
      return who ? `${who} : ${text}` : text
    })
    .filter((line): line is string => line !== null)
  return lines.length > 0 ? lines.join('\n') : null
}

/**
 * La note déposée sur la fiche CRM.
 *
 * Factuelle et bornée : ce que l'outil a dit, rien d'interprété. La
 * transcription, quand elle existe, est CITÉE en dessous et tronquée — une note
 * de CRM de trente mille caractères rend la fiche illisible et n'est jamais relue.
 */
export function composeCallNote(call: CallRecord, options: { locale?: 'fr' | 'en' } = {}): string {
  const fr = (options.locale ?? 'fr') === 'fr'
  const parts: string[] = []

  const direction =
    call.direction === 'inbound'
      ? fr
        ? 'Appel entrant'
        : 'Inbound call'
      : call.direction === 'outbound'
        ? fr
          ? 'Appel sortant'
          : 'Outbound call'
        : fr
          ? 'Appel'
          : 'Call'
  parts.push(direction)

  if (call.counterpartName) parts.push(call.counterpartName)
  else if (call.counterpartNumber) parts.push(call.counterpartNumber)

  const head = parts.join(' — ')
  const details: string[] = []
  if (call.startedAt) details.push(call.startedAt)
  if (call.durationSeconds != null) {
    const minutes = Math.floor(call.durationSeconds / 60)
    const seconds = call.durationSeconds % 60
    details.push(fr ? `durée ${minutes} min ${seconds} s` : `duration ${minutes}m ${seconds}s`)
  }
  if (call.answered === false) details.push(fr ? 'non décroché' : 'not answered')
  if (call.agentName) details.push(call.agentName)

  let note = details.length > 0 ? `${head}\n${details.join(' · ')}` : head
  if (call.transcript) {
    const excerpt = call.transcript.length > 4000 ? `${call.transcript.slice(0, 4000)}…` : call.transcript
    note += `\n\n${fr ? 'Transcription (fournie par l’outil d’appel) :' : 'Transcript (provided by the calling tool):'}\n${excerpt}`
  }
  return note
}
