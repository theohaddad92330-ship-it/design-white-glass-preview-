import {
  accountIdsInReply,
  replyActionsFor,
  splitReplyBlocks,
  type ReplyActionInput,
  type ReplyActionKind,
  type ReplyActionPlan,
} from '@bellum/contracts'

/**
 * #3766 (BEL-LAU-1011) — DE LA RÉPONSE AUX ACTIONS, ET DES ACTIONS AUX VUES.
 *
 * Deux fonctions pures, appelées par `ReplyActions.tsx` :
 *  - `replyActionPlan` lit ce que la réponse PORTE (comptes cités, critères
 *    Découvrir, cartes, données manquantes) et demande le plan au contrat
 *    (`replyActionsFor`, `packages/contracts`) ;
 *  - `replyActionTarget` traduit un geste en destination RÉELLE, avec le
 *    contexte de la réponse (le compte, les critères, le fil d'origine).
 *
 * Aucun geste ne devine un objet : sans compte cité, `replyActionTarget` rend
 * `null` pour les gestes de compte — l'écran n'affiche alors pas le bouton.
 */

const MISSING_DATA_BLOCK = 'missing_data'

export function replyActionInput(
  content: string,
  discoverCriteria: Readonly<Record<string, string>> | null,
  notConsulted: readonly string[] | undefined,
): ReplyActionInput {
  const blockTypes = splitReplyBlocks(content).flatMap(segment =>
    segment.kind === 'block' ? [segment.block.type] : [],
  )
  return {
    accountIds: accountIdsInReply(content),
    blockTypes,
    hasDiscoverCriteria: Boolean(discoverCriteria && Object.keys(discoverCriteria).length > 0),
    hasMissingData: blockTypes.includes(MISSING_DATA_BLOCK) || (notConsulted?.length ?? 0) > 0,
  }
}

export function replyActionPlan(
  content: string,
  discoverCriteria: Readonly<Record<string, string>> | null,
  notConsulted: readonly string[] | undefined,
): { plan: ReplyActionPlan; input: ReplyActionInput } | null {
  const input = replyActionInput(content, discoverCriteria, notConsulted)
  const plan = replyActionsFor(input)
  return plan ? { plan, input } : null
}

export type ReplyActionTarget =
  | { kind: 'navigate-account'; accountId: string; tab?: 'contacts' | 'plan' }
  | { kind: 'create-worklist'; accountIds: string[] }
  | { kind: 'prefill'; criteria: Record<string, string> }
  | { kind: 'qualify' }
  | { kind: 'dismiss' }

/** Les clés de critères qui se lisent à voix haute (le reste — `laura`, `context` — est technique). */
export const REFINABLE_CRITERIA = ['sectors', 'signals', 'department', 'region', 'headcount', 'keywords'] as const

export function replyActionTarget(
  kind: ReplyActionKind,
  input: ReplyActionInput,
  discoverCriteria: Readonly<Record<string, string>> | null,
): ReplyActionTarget | null {
  const first = input.accountIds[0]
  switch (kind) {
    case 'refine_search':
      return discoverCriteria ? { kind: 'prefill', criteria: { ...discoverCriteria } } : null
    case 'view_account':
      return first ? { kind: 'navigate-account', accountId: first } : null
    case 'find_contacts':
      return first ? { kind: 'navigate-account', accountId: first, tab: 'contacts' } : null
    case 'prepare_approach':
      return first ? { kind: 'navigate-account', accountId: first, tab: 'plan' } : null
    case 'create_worklist':
      return input.accountIds.length >= 2 ? { kind: 'create-worklist', accountIds: [...input.accountIds] } : null
    case 'qualify_further':
      return first ? { kind: 'qualify' } : null
    case 'dismiss':
      return { kind: 'dismiss' }
  }
}
