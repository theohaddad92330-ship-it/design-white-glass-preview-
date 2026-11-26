import type { RagDocumentScope } from '@bellum/contracts'

/**
 * #2779 — la portée d'un document et SA cible, telles que le serveur les
 * attend : `conversation` porte le fil, `account` porte le compte, les autres
 * rien. Une seule règle pour le dépôt unitaire et l'archive — jamais une
 * cible envoyée « au cas où » (le serveur vérifie le compte contre l'espace).
 */
export function ragScopePlacement(
  scope: RagDocumentScope,
  targets: { conversationId: string | null; accountId: string | null },
): { scope: RagDocumentScope; conversationId?: string; accountId?: string } {
  if (scope === 'conversation') return { scope, conversationId: targets.conversationId ?? undefined }
  if (scope === 'account') return { scope, accountId: targets.accountId ?? undefined }
  return { scope }
}

/**
 * #2779 — les portées proposées à l'ajout d'un fichier, dans l'ordre de #1954
 * (« Cette conversation uniquement / Mon espace personnel / Toute mon ESN /
 * Un compte précis / Base de connaissance durable »). « Un compte précis » ne
 * se propose que dans un fil qui PORTE un compte : c'est ce compte-là.
 */
export function attachScopesFor(accountId: string | null): RagDocumentScope[] {
  const scopes: RagDocumentScope[] = ['conversation', 'personal', 'workspace']
  if (accountId) scopes.push('account')
  scopes.push('knowledge_base')
  return scopes
}
