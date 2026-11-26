import { z } from 'zod'
import type { ConversationThreadState } from './conversation-thread-state.js'

/**
 * #1955.30 / #1955.31 — LE RÉSUMÉ ROULANT D'UN FIL, LISIBLE (ET CORRIGEABLE)
 * DANS `/chat`.
 *
 * Le résumé existait déjà (`conversation_summaries`, tome 6 §12.1) et était
 * déjà LISIBLE — mais seulement dans Réglages › Mémoire de Laura (le registre,
 * `GET /memory/ledger`), jamais à l'endroit où la personne travaille. Ce
 * contrat porte les DEUX gestes qui manquaient sur ce fil précis, pendant
 * qu'on y est :
 *
 *  - LIRE le résumé du fil OUVERT, avec sa date (`conversationSummaryQuerySchema`).
 *  - LE CORRIGER (« une correction humaine gagne toujours », CLAUDE.md) —
 *    `correctConversationSummarySchema`. Il n'y a pas de création : corriger
 *    un résumé qui n'existe pas inventerait une mémoire, refusé côté service
 *    par un 404.
 *
 * `conversationId` et `accountId` suivent exactement la clé du service
 * (`conversationKey`, `apps/api/.../memory.service.ts`) : les deux sont
 * optionnels, un fil par défaut ("general") n'envoie ni l'un ni l'autre.
 */
export const conversationSummaryQuerySchema = z.object({
  conversationId: z.string().trim().min(1).max(200).nullable().optional(),
  accountId: z.string().guid().nullable().optional(),
})

/** Même plafond que le résumé généré (`SUMMARY_MAX_CHARS`) : une correction ne
 *  promet pas plus que ce que le prompt accepterait. */
export const CONVERSATION_SUMMARY_MAX_CHARS = 2000

export const correctConversationSummarySchema = z.object({
  conversationId: z.string().trim().min(1).max(200).nullable().optional(),
  accountId: z.string().guid().nullable().optional(),
  summary: z.string().trim().min(1).max(CONVERSATION_SUMMARY_MAX_CHARS),
})

/**
 * #1955.24-.28 — le résumé PAR CATÉGORIE, tiré de l'état structuré que Laura
 * écrit à chaque tour (`conversation_summaries.thread_state`, #1927.10/#2268).
 * Chaque ligne vient d'un champ réel ; une catégorie sans donnée est une liste
 * VIDE, que l'écran n'affiche pas (« on n'affiche pas ce qu'on n'a pas »).
 * #1955.29 (sources principales) se calcule à l'écran depuis les sources des
 * réponses du fil, déjà chargées — pas ici.
 */
type ConversationSummarySections = {
  /** #1955.24 — `decisions` (#2268.10). */
  decisions: string[]
  /** #1955.25 — `objects` (#1927.1). */
  objects: { kind: string; label: string }[]
  /** #1955.26 — `proposals` : les actions PRÉPARÉES dans le fil (#1927.5). */
  pendingActions: { action: string; target: string | null }[]
  /** #1955.27 — les critères EXCLUS par l'utilisateur (#2268.5) et les pistes ÉCARTÉES (#1927.3). */
  corrections: { kind: 'excluded' | 'ruled_out'; text: string; reason: string | null }[]
  /** #1955.28 — les questions de précision posées par Laura (#1927.6). */
  questions: string[]
}

export function conversationSummarySections(state: ConversationThreadState | null): ConversationSummarySections {
  if (!state) return { decisions: [], objects: [], pendingActions: [], corrections: [], questions: [] }
  return {
    decisions: [...state.decisions],
    objects: state.objects.map(object => ({ kind: object.kind, label: object.label })),
    pendingActions: state.proposals.map(proposal => ({ action: proposal.action, target: proposal.target_label })),
    corrections: [
      ...state.excluded.map(entry => ({ kind: 'excluded' as const, text: entry.criterion, reason: entry.reason })),
      ...state.ruled_out.map(entry => ({ kind: 'ruled_out' as const, text: entry.option, reason: entry.reason })),
    ],
    questions: state.questions.map(entry => entry.question),
  }
}

/** `null` : aucune ligne vivante pour ce fil — jamais une chaîne vide qui se
 *  lirait comme un résumé « vide » plutôt qu'absent. */
export type ConversationSummaryView = {
  summary: string
  updatedAt: string
  /** #1955.24-.28 — le même fil, par catégorie. */
  sections: ConversationSummarySections
} | null
