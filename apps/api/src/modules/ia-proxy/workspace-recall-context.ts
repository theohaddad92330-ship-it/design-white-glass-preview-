import { accountFactAgePhrase } from '@bellum/contracts'

/**
 * #4071.3 — CE QUE L'ESPACE A GARDÉ DANS LE CONTEXTE DE LAURA : les recherches enregistrées, les listes de
 * cibles et les résumés des conversations passées. Niveau ESPACE (présent même sans dossier ouvert).
 *
 * Même discipline que `account-facts-context.ts` (décisions Louis 12/10, #4068) :
 *  - BORNÉ par famille : les plus récents d'abord, le reste se DIT, jamais se tait ;
 *  - DATÉ : chaque ligne porte son âge en mots, calculé ici (le modèle ne refait pas l'arithmétique) ;
 *  - SANS PROVENANCE : la ligne dit la nature (« Recherche enregistrée »), jamais l'écran ou la table ;
 *  - jamais le CORPS d'un message (doctrine) : seulement le résumé roulant d'un fil, coupé court.
 */
const MAX_PER_FAMILY = 8
const MAX_CONVERSATIONS = 5
const MAX_SUMMARY_CHARS = 240
const MAX_NAME_CHARS = 120

type RecallItem = { name: string; objective: string | null; at: Date }

export type WorkspaceRecallInput = {
  searches: readonly RecallItem[]
  targetLists: readonly RecallItem[]
  conversations: readonly { summary: string; at: Date }[]
  now: Date
}

function ageDays(at: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - at.getTime()) / 86_400_000))
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`
}

function line(label: string, text: string, at: Date, now: Date): string {
  return `- [${at.toISOString().slice(0, 10)} · ${accountFactAgePhrase(ageDays(at, now))}] ${label} : ${text}`
}

function family(items: readonly RecallItem[], label: string, noun: { one: string; many: string }, now: Date): string[] {
  const sorted = [...items].filter(item => item.name.trim()).sort((a, b) => b.at.getTime() - a.at.getTime())
  const shown = sorted.slice(0, MAX_PER_FAMILY)
  const lines = shown.map(item => {
    const goal = item.objective?.trim() ? ` (objectif : ${clip(item.objective, MAX_NAME_CHARS)})` : ''
    return line(label, `${clip(item.name, MAX_NAME_CHARS)}${goal}`, item.at, now)
  })
  const rest = sorted.length - shown.length
  if (rest > 0) {
    lines.push(
      `(${rest} ${rest > 1 ? noun.many : noun.one} plus ${rest > 1 ? 'anciennes' : 'ancienne'} non ${rest > 1 ? 'listées' : 'listée'}.)`,
    )
  }
  return lines
}

/** `null` = rien à dire : aucun bloc, le prompt reste identique au byte près. */
export function workspaceRecallContextFor(input: WorkspaceRecallInput): string | null {
  const { now } = input
  const conversations = [...input.conversations]
    .filter(c => c.summary.trim())
    .sort((a, b) => b.at.getTime() - a.at.getTime())
  const shownConversations = conversations.slice(0, MAX_CONVERSATIONS)
  const lines = [
    ...family(
      input.searches,
      'Recherche enregistrée',
      { one: 'recherche enregistrée', many: 'recherches enregistrées' },
      now,
    ),
    ...family(input.targetLists, 'Liste de cibles', { one: 'liste de cibles', many: 'listes de cibles' }, now),
    ...shownConversations.map(c => line('Conversation passée', clip(c.summary, MAX_SUMMARY_CHARS), c.at, now)),
  ]
  const rest = conversations.length - shownConversations.length
  if (rest > 0)
    lines.push(
      `(${rest} conversation${rest > 1 ? 's' : ''} plus ancienne${rest > 1 ? 's' : ''} non listée${rest > 1 ? 's' : ''}.)`,
    )
  return lines.length > 0 ? lines.join('\n') : null
}
