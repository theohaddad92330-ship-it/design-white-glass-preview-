import type { WorkspaceMethodRule } from '@bellum/contracts'

/**
 * #3295 — LAURA APPREND : les règles promues d'une proposition d'apprentissage
 * ADOPTÉE puis ACTIVÉE, condensées en quelques lignes pour le prompt système.
 *
 * Deux garde-fous ici même, au cas où un appelant se tromperait de lecture :
 * une règle non activée n'est JAMAIS injectée (l'adoption ne change pas ce que
 * Laura dit, l'activation si), et le bloc est borné (énoncé tronqué, total
 * plafonné) — des règles apprises, pas un manuel. Dérivation pure, aucun appel
 * au modèle (même discipline que `lostDealRexContextFor`).
 */

const STATEMENT_MAX_CHARS = 200
const TOTAL_CONTEXT_MAX_CHARS = 1200

export function learnedRulesContextFor(rules: readonly WorkspaceMethodRule[]): string | null {
  const active = rules.filter(rule => rule.enabled)
  if (active.length === 0) return null
  const lines = active.map(rule => {
    const statement = rule.statement.trim()
    const short = statement.length > STATEMENT_MAX_CHARS ? `${statement.slice(0, STATEMENT_MAX_CHARS)}…` : statement
    return `- [${rule.domain}] ${short}`
  })
  const text = lines.join('\n')
  return text.length > TOTAL_CONTEXT_MAX_CHARS ? `${text.slice(0, TOTAL_CONTEXT_MAX_CHARS)}…` : text
}
