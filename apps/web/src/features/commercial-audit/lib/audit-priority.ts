import type { CommercialAuditConfidence, CommercialAuditContext, CommercialTensionRuleId } from '@bellum/contracts'

/**
 * #2090.31 — LA CARTE « PRIORISER LA SEMAINE ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS SOURCES, DANS CET ORDRE — JAMAIS UNE QUATRIÈME INVENTÉE
 * ─────────────────────────────────────────────────────────────────────────
 * 1. La QUESTION À VALIDER de la première rupture (`questionToValidate`) :
 *    c'est déjà une action de la semaine, écrite par le détecteur — « Combien
 *    de secteurs comptes-tu vraiment travailler ce trimestre ? ».
 * 2. À défaut de question, sa CONSÉQUENCE si rien ne change
 *    (`consequenceIfUnaddressed`) : moins actionnable, mais encore une
 *    phrase MESURÉE, jamais un résumé.
 * 3. Sans aucune rupture, le dernier élément de la colonne « Renforcer »
 *    (`stopKeepReinforce.reinforce`) — c'est `coaching.keyAdvice` côté
 *    `build-audit.ts` (le conseil qui suit toujours le goulot dans ce
 *    tableau), repris ici sans le redériver une deuxième fois (GA-26).
 *
 * Sans aucune des trois, il n'y a rien à prioriser : `null`, jamais une
 * priorité inventée pour occuper la carte.
 */
export type AuditWeeklyPriority = {
  action: string
  ruleId: CommercialTensionRuleId | null
  confidence: CommercialAuditConfidence | null
}

/**
 * #2457 — élargi de `CommercialAuditContext` à ce `Pick`, pour que
 * `build-audit.ts` puisse l'appeler AVANT que le contrat complet existe
 * (mêmes raisons que `buildAuditVerdict`, `audit-verdict.ts`).
 */
export function buildWeeklyPriority(
  auditContext: Pick<CommercialAuditContext, 'contradictions' | 'stopKeepReinforce'>,
): AuditWeeklyPriority | null {
  const [firstContradiction] = auditContext.contradictions ?? []
  if (firstContradiction) {
    const action = firstContradiction.questionToValidate ?? firstContradiction.consequenceIfUnaddressed
    if (action) {
      return { action, ruleId: firstContradiction.ruleId, confidence: firstContradiction.confidence }
    }
  }

  const reinforce = auditContext.stopKeepReinforce?.reinforce
  const lastAdvice = reinforce && reinforce.length > 0 ? reinforce[reinforce.length - 1] : undefined
  if (lastAdvice) return { action: lastAdvice, ruleId: null, confidence: null }

  return null
}
