import type { ReplyFeedbackReason, ReplyFeedbackVerdict } from '@bellum/contracts'

/**
 * #1919.15 / #1919.16 — CE QUE LAURA RETIENT DES RETOURS D'UNE PERSONNE.
 *
 * Les retours donnés sous les réponses de Laura (`chat_reply_feedback`) sont
 * condensés ici en lignes de prompt DÉTERMINISTES — aucun modèle, aucun appel
 * réseau. Le service IA les encadre (`app/prompts/reply_feedback.py`) et les
 * place dans le segment VOLATIL du prompt de CETTE personne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE : UN REFUS PORTE SUR L'OBJET REFUSÉ, PAS SUR SA CATÉGORIE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Ne jamais utiliser un seul refus pour conclure globalement qu'une
 * technologie, une personne ou une entreprise n'est jamais pertinente. »
 *
 * D'où deux sortes de lignes, et jamais une troisième :
 *  · la ligne d'OBJET — une par réponse notée : elle nomme ce qui a été refusé
 *    (la recommandation, le compte) et dit qu'elle ne vaut que pour lui ;
 *  · la ligne RÉPÉTÉ — une généralisation, qui n'existe qu'à partir de
 *    {@link REPLY_FEEDBACK_REPEAT_THRESHOLD} réponses DISTINCTES refusées pour
 *    le même motif, et qui demande à Laura de DIRE qu'elle s'en sert.
 *
 * Trois clics sur la même réponse restent un avis : seul le DERNIER retour
 * d'une réponse compte (on change d'avis, on ne vote pas). Le motif « Autre »
 * ne se généralise jamais — son texte libre n'est pas une catégorie.
 */
export const REPLY_FEEDBACK_REPEAT_THRESHOLD = 3

const MEMORY_MAX_LINES = 15
const MEMORY_MAX_CHARS = 2400
const SNIPPET_MAX = 200
// #1919.5 — « pas maintenant » est un report, pas un refus : il s'éteint.
const NOT_NOW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

export type ReplyMemoryRow = {
  reply_digest: string
  verdict: ReplyFeedbackVerdict
  reason: ReplyFeedbackReason | null
  note: string | null
  correction_field: string | null
  correction_value: string | null
  correction_scope: string | null
  /** Le nom du compte, relu dans l'espace — `null` quand la réponse n'en portait pas. */
  account_name: string | null
  created_at: Date
}

const REASON_LABELS: Record<ReplyFeedbackReason, string> = {
  mauvais_compte: 'mauvais compte',
  mauvais_contact: 'mauvais contact',
  mauvais_timing: 'mauvais timing',
  hors_positionnement: 'hors positionnement',
  deja_traite: 'déjà traité',
  autre: 'autre',
  trop_long: 'trop long',
  // #2444.1 (suite) — les cinq motifs élargis du 23/09.
  doublon: 'doublon',
  source_douteuse: 'source douteuse',
  contact_parti: 'contact parti',
  concurrent_en_place: 'concurrent déjà en place',
  budget_insuffisant: 'budget insuffisant',
}

function snippet(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, SNIPPET_MAX)
}

/** Le dernier retour de chaque réponse, du plus récent au plus ancien. */
function latestPerReply(rows: readonly ReplyMemoryRow[]): ReplyMemoryRow[] {
  const seen = new Set<string>()
  const out: ReplyMemoryRow[] = []
  for (const row of [...rows].sort((a, b) => b.created_at.getTime() - a.created_at.getTime())) {
    if (seen.has(row.reply_digest)) continue
    seen.add(row.reply_digest)
    out.push(row)
  }
  return out
}

/**
 * #1928.7 — sur combien de réponses DISTINCTES le dernier retour porte ce motif.
 * La même dérivation que la ligne RÉPÉTÉ : l'accusé qui propose une préférence
 * et le prompt qui l'applique ne peuvent pas compter différemment.
 */
export function countRepliesWithReason(rows: readonly ReplyMemoryRow[], reason: ReplyFeedbackReason): number {
  return latestPerReply(rows).filter(row => row.reason === reason).length
}

// #1919.16 — les SEULES familles qui peuvent se généraliser. Un « déjà fait »,
// un « pas maintenant » ou une donnée fausse portent sur un objet, jamais sur
// une catégorie ; « Autre » n'est pas une catégorie.
function repeatKey(row: ReplyMemoryRow): string | null {
  if (row.verdict === 'pas_pertinent' && row.reason && row.reason !== 'autre') return `pas_pertinent:${row.reason}`
  if (row.verdict === 'mauvaise_priorite') return 'mauvaise_priorite'
  return null
}

function repeatedLine(key: string, count: number): string {
  const head = `- RÉPÉTÉ ${count} fois, sur des réponses différentes :`
  if (key === 'mauvaise_priorite') {
    return `${head} priorités contestées. Justifie chaque ordre de priorité que tu proposes, et tu le dis quand tu t'en sers.`
  }
  const reason = key.slice('pas_pertinent:'.length) as ReplyFeedbackReason
  if (reason === 'trop_long') {
    return `${head} réponses jugées trop longues. Fais plus court par défaut, et tu le dis si la personne te demande pourquoi.`
  }
  return `${head} jugées pas pertinentes — motif « ${REASON_LABELS[reason] ?? reason} ». Tu peux en tenir compte au-delà des objets cités, et tu le dis quand tu t'en sers.`
}

function objectLine(row: ReplyMemoryRow): string {
  const date = row.created_at.toISOString().slice(0, 10)
  const object = row.account_name
    ? `Ta réponse à propos de « ${snippet(row.account_name)} »`
    : 'Une de tes réponses (sans compte précis)'
  const head = `- (${date}) ${object} :`
  switch (row.verdict) {
    case 'utile':
      return `${head} jugée UTILE.`
    case 'pas_pertinent': {
      const reason = row.reason ? ` — motif : ${REASON_LABELS[row.reason] ?? row.reason}` : ''
      const note = row.note?.trim() ? ` (« ${snippet(row.note)} »)` : ''
      return `${head} jugée PAS PERTINENTE${reason}${note}. Ne re-propose pas cette recommandation telle quelle ; ce refus porte sur elle seule.`
    }
    case 'donnee_fausse': {
      // #1919.7 — la correction de la personne est citée, et elle prime.
      const field = row.correction_field?.trim() ? ` — « ${snippet(row.correction_field)} »` : ''
      const value = row.correction_value?.trim() ? `, la personne corrige : « ${snippet(row.correction_value)} »` : ''
      const dossier = row.correction_scope === 'account' ? ' (correction portée aussi au dossier du compte)' : ''
      return `${head} donnée signalée FAUSSE${field}${value}${dossier}. Ne répète pas cette information sans nouvelle source : la correction de la personne prime.`
    }
    case 'deja_fait':
      return `${head} l'action recommandée est DÉJÀ FAITE. Ne la présente plus comme à faire.`
    case 'pas_maintenant':
      return `${head} reportée (« pas maintenant »). Ne la présente pas comme urgente pour l'instant.`
    case 'mauvaise_priorite':
      return `${head} priorité contestée. Ne présente pas cet ordre comme acquis sans le justifier.`
    default:
      return `${head} retour « ${String(row.verdict)} ».`
  }
}

/**
 * Les lignes du bloc « retours de la personne », ou `''` sans retour — le
 * prompt reste alors byte-identique (le service IA n'ajoute aucun bloc).
 */
export function assembleReplyFeedbackMemory(rows: readonly ReplyMemoryRow[], now: Date = new Date()): string {
  const kept = latestPerReply(rows).filter(
    row => row.verdict !== 'pas_maintenant' || now.getTime() - row.created_at.getTime() <= NOT_NOW_WINDOW_MS,
  )
  if (kept.length === 0) return ''

  // #1919.16 — une généralisation se COMPTE sur des réponses distinctes.
  const counts = new Map<string, number>()
  for (const row of kept) {
    const key = repeatKey(row)
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const repeated = [...counts.entries()]
    .filter(([, count]) => count >= REPLY_FEEDBACK_REPEAT_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => repeatedLine(key, count))

  const lines: string[] = []
  let budget = 0
  for (const line of [...repeated, ...kept.map(objectLine)]) {
    if (lines.length >= MEMORY_MAX_LINES) break
    if (budget + line.length + 1 > MEMORY_MAX_CHARS) break
    lines.push(line)
    budget += line.length + 1
  }
  return lines.join('\n')
}
