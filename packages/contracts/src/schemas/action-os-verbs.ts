import { z } from 'zod'

/**
 * #2317.10 (#2923) — LAURA RECOMMANDE, L'ACTION OS EXÉCUTE : SIX VERBES DISTINCTS.
 *
 * L'épopée #2317 nomme deux vocabulaires, jamais confondus :
 *  - Laura : expliquer / préparer / préremplir / lancer une guided action —
 *    elle ne fait jamais le geste final elle-même (`c73_fait_ne_porte_pas_preuve_denvoi`,
 *    « le copilote n'envoie jamais d'e-mail : il prépare, le commercial envoie ») ;
 *  - l'Action OS : crée / assigne / planifie / écrit / envoie après validation /
 *    conserve la preuve — les six gestes qui MODIFIENT réellement une ligne
 *    `action_plan_items` ou envoient un message vérifié.
 *
 * Vérification du 25-26/09/2026 (commentaires d'écrivain sur #2923) : les six
 * gestes existaient déjà, chacun dans son service, sans qu'aucun endroit ne
 * les nomme COMME les six verbes de l'épopée — le risque nommé par la
 * doctrine (« du code juste, calculé, testé, que personne n'appelle ») version
 * documentation : six mécanismes réels, zéro lecteur qui les rassemble.
 *
 * Ce fichier ne réimplémente RIEN : il NOMME, verbe par verbe, le service et
 * la ligne qui l'exécute déjà — un audit, comme `page-contract.ts` (#2931).
 * Une preuve `fichier:ligne` DOIT exister dans ce dépôt (gardé par
 * `GA-395-laura-recommande-action-os-execute.test.ts`).
 */
export const ACTION_OS_VERBS = ['create', 'assign', 'schedule', 'write', 'send_after_validation', 'keep_proof'] as const
export const actionOsVerbSchema = z.enum(ACTION_OS_VERBS)
export type ActionOsVerb = z.infer<typeof actionOsVerbSchema>

export type ActionOsVerbEvidence = {
  /** Le verbe FRANÇAIS de l'épopée — celui que #2317 nomme mot pour mot. */
  label: string
  /** `fichier:ligne` du geste réel qui exécute ce verbe. */
  evidence: string
}

export const ACTION_OS_VERB_AUDIT: Readonly<Record<ActionOsVerb, ActionOsVerbEvidence>> = {
  create: {
    label: 'crée',
    evidence: 'apps/api/src/modules/actions/action-plan-items.service.ts:141',
  },
  assign: {
    label: 'assigne',
    evidence: 'apps/api/src/modules/actions/action-plan-items.service.ts:418',
  },
  schedule: {
    label: 'planifie',
    evidence: 'apps/api/src/modules/actions/action-plan-items.service.ts:408',
  },
  write: {
    label: 'écrit',
    evidence: 'apps/api/src/modules/actions/action-plan-items.service.ts:423',
  },
  send_after_validation: {
    label: 'envoie après validation',
    evidence: 'apps/api/src/modules/contacts/contacts.service.ts:3612',
  },
  keep_proof: {
    label: 'conserve la preuve',
    evidence: 'apps/api/src/modules/contacts/contacts.service.ts:4014',
  },
}
