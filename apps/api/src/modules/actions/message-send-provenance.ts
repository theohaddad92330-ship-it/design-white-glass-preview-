/**
 * Provenance d'un « message envoyé » — source de vérité PARTAGÉE par tous les
 * compteurs (cockpit perso, KPIs manager, briefing hebdo).
 *
 * Bellum trace deux natures d'envoi que rien ne doit confondre :
 *
 * - **vérifié** : Bellum a réellement expédié le message (Resend). Écrit par
 *   `ContactsService.recordEmailSent` → `message_sent` + `metadata.via='bellum'`.
 *   C'est le SEUL cas où on détient une preuve de livraison.
 * - **déclaré** : le commercial affirme avoir envoyé lui-même (LinkedIn — aucune
 *   API de messagerie n'existe, Bellum n'envoie rien). Écrit par le panneau
 *   d'engagement → `plan_action_message_sent` + `metadata.via='declaration'`.
 *   C'est du travail réel, qui doit rester visible — mais pas se faire passer
 *   pour une livraison prouvée.
 * - **non attribué** : les lignes d'historique antérieures au marquage `via`
 *   (et tout `POST /actions/track` d'un client qui ne le pose pas). On ne peut
 *   PAS prouver leur nature.
 *
 * Règle directrice : dans le doute, on NE compte PAS comme vérifié. Un total
 * présenté à un manager ne doit jamais fondre du déclaratif dans du prouvé sans
 * que la décomposition soit visible — sinon le chiffre devient auto-gonflable
 * (il suffit de cliquer « j'ai envoyé » sans rien envoyer).
 */

import type { MessageSendBreakdown } from '@bellum/contracts'

/** Les deux `action_type` qui matérialisent un envoi de message. */
const MESSAGE_SEND_ACTION_TYPES = ['message_sent', 'plan_action_message_sent'] as const

type MessageSendProvenance = 'verified' | 'declared' | 'unattributed'

export const EMPTY_MESSAGE_SEND_BREAKDOWN: MessageSendBreakdown = {
  verified: 0,
  declared: 0,
  unattributed: 0,
  total: 0,
}

type ClassifiableRow = {
  action_type: string
  metadata?: Record<string, unknown> | null
}

/**
 * Classe une ligne `user_actions`. Renvoie `null` si ce n'est pas un envoi.
 *
 * L'ordre des tests compte : une déclaration explicite l'emporte toujours, même
 * portée par un `action_type` générique — on ne veut jamais promouvoir en
 * « vérifié » une ligne qui se déclare elle-même déclarative.
 *
 * #2715.1 — EXPORTÉE pour être réutilisée par `ActionPlanItemsService`
 * (`send_status` du plan) : la même règle sert au cockpit, au dashboard
 * manager ET au plan — jamais réinventée une troisième fois.
 */
export function classifyMessageSend(row: ClassifiableRow): MessageSendProvenance | null {
  if (!isMessageSendActionType(row.action_type)) return null

  const metadata = row.metadata ?? {}
  const via = typeof metadata.via === 'string' ? metadata.via : null

  if (via === 'declaration' || metadata.declared === true) return 'declared'
  // Seul `message_sent` estampillé `via: 'bellum'` est prouvé. Un
  // `plan_action_message_sent` n'est JAMAIS vérifié : aucun chemin d'écriture
  // ne l'utilise pour un envoi réellement expédié par Bellum.
  if (row.action_type === 'message_sent' && via === 'bellum') return 'verified'
  return 'unattributed'
}

function isMessageSendActionType(actionType: string): boolean {
  return (MESSAGE_SEND_ACTION_TYPES as readonly string[]).includes(actionType)
}

/** Agrège des lignes `user_actions` en décomposition d'envois. */
export function breakdownMessageSends(rows: readonly ClassifiableRow[]): MessageSendBreakdown {
  const breakdown = { ...EMPTY_MESSAGE_SEND_BREAKDOWN }
  for (const row of rows) {
    const provenance = classifyMessageSend(row)
    if (!provenance) continue
    breakdown[provenance] += 1
    breakdown.total += 1
  }
  return breakdown
}

/**
 * Fragments SQL miroirs de {@link classifyMessageSend}, pour les agrégations en
 * base (KPIs manager). Toute évolution de la règle doit toucher les DEUX — les
 * tests `message-send-provenance.spec.ts` verrouillent leur équivalence.
 *
 * `metadata` est une colonne `jsonb` non nulle (défaut `'{}'::jsonb`), mais on
 * garde `COALESCE` pour les lignes historiques éventuellement nulles.
 */
const META = `COALESCE(metadata, '{}'::jsonb)`

const IS_MESSAGE_SEND = `action_type IN ('message_sent', 'plan_action_message_sent')`

const IS_DECLARED = `(${META}->>'via' = 'declaration' OR ${META}->>'declared' = 'true')`

const IS_VERIFIED = `action_type = 'message_sent' AND ${META}->>'via' = 'bellum' AND NOT ${IS_DECLARED}`

/** Prédicats `FILTER (WHERE …)` prêts à l'emploi, alignés sur le classifieur TS. */
export const MESSAGE_SEND_SQL = {
  /** Tout envoi, quelle que soit sa provenance. */
  total: IS_MESSAGE_SEND,
  /** Envoi prouvé (expédié par Bellum). */
  verified: `${IS_MESSAGE_SEND} AND ${IS_VERIFIED}`,
  /** Envoi auto-déclaré. */
  declared: `${IS_MESSAGE_SEND} AND ${IS_DECLARED}`,
  /** Historique non prouvable. */
  unattributed: `${IS_MESSAGE_SEND} AND NOT ${IS_DECLARED} AND NOT (${IS_VERIFIED})`,
} as const
