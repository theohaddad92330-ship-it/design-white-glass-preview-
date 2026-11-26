import { deriveReplyBadges, type ReplyBadgeLabels } from '@bellum/contracts'
import type { ChatResponseContext } from './ContextDisclosure'
import { replyProvenance } from './reply-provenance'

/**
 * #3764 — ce que le contexte d'une réponse SAIT, traduit en situation de
 * badges. Chaque champ absent du contexte reste absent : « non mesuré » ne
 * devient ni un badge ni un zéro. `now` est injecté pour que le rendu soit
 * déterministe (et testable).
 */
export function replyBadgesFor(context: ChatResponseContext | undefined, now: Date): ReplyBadgeLabels {
  if (!context) return { badges: [], freshness: null }
  // R10C-FIX — un tour interrompu (délai ou panne, `context.partial`) n'a pas livré sa preuve : aucun badge,
  // surtout pas « Signal actuel vérifié ». L'en-tête de la réponse porte déjà « Réponse partielle ».
  if (context.partial) return { badges: [], freshness: null }
  const { asOf, sourceCount } = replyProvenance(context)
  const toolsCalled = context.reasoning_trace?.tools_called
  const coverage = context.coverage_report
  // #4071.3 (recette R6 14/10) — ces deux blocs sont injectés server-side, jamais
  // par un appel d'outil : leur présence est une preuve actuelle à part entière.
  const contextFactsRead = Boolean(
    (context.active?.account_facts?.count ?? 0) > 0 || (context.active?.workspace_recall?.count ?? 0) > 0,
  )
  return deriveReplyBadges({
    oldestAsOf: asOf,
    sourceCount,
    toolsRead: toolsCalled ? toolsCalled.length > 0 : null,
    contextFactsRead,
    // #4150 — jamais `missingCount` (la longueur brute de `not_consulted`,
    // qui inclut des absences structurelles toujours présentes et un CRM
    // connecté simplement non croisé) : seul `qualification_needed`, posé par
    // `context_transparency.py` sur une action réelle ou une panne, allume ce
    // badge. Absent ⇒ 0, jamais deviné.
    notConsultedCount: context.qualification_needed ? 1 : 0,
    pendingAction: (context.pending_actions?.length ?? 0) > 0,
    scopeUnconfirmed: (context.thread_scope?.unresolved.length ?? 0) > 0,
    mappingPartial: coverage ? coverage.unresolved > 0 || coverage.sources_unavailable.length > 0 : false,
    now,
  })
}
