import type { CommercialAuditConfidence, CommercialAuditContext, CommercialTensionRuleId } from '@bellum/contracts'

/**
 * #2090.12 / #2090.13 — UN VERDICT PRINCIPAL, DEUX LIGNES MAXIMUM.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI DEUX SOURCES, DANS CET ORDRE, ET JAMAIS UNE TROISIÈME INVENTÉE
 * ─────────────────────────────────────────────────────────────────────────
 * Le retour demande une phrase qui TRANCHE (« ton problème n'est pas le
 * manque de comptes… »), pas un résumé. La seule matière du produit qui
 * TRANCHE déjà, aujourd'hui, est une RUPTURE détectée par
 * `tension-detectors.ts` — `contradiction.tension` est écrite exactement
 * dans ce registre (« Plus de 3 secteurs visés à la fois… »). À défaut de
 * rupture, le seul autre fait assez spécifique pour ne pas être un résumé
 * générique est le GOULOT mesuré par le profileur (`breakpoints[0]`, déjà
 * calculé par `build-audit.ts` depuis `coachingInsights.mainWeakness`).
 *
 * Sans l'un ni l'autre, il n'y a PAS de verdict — l'écran le NOMME (« non
 * mesuré »), il n'écrit jamais une phrase de remplissage : c'est la même
 * question que tout ce contrat pose déjà, appliquée ici : *si cette valeur
 * est absente, une phrase est-elle VRAIE ?*
 */
export type AuditVerdict = {
  /** La ligne qui tranche — jamais plus d'une phrase. */
  primary: string
  /** La conséquence si rien ne change, quand elle est connue. `null` sinon. */
  secondary: string | null
  source: 'contradiction' | 'breakpoint'
  ruleId: CommercialTensionRuleId | null
  confidence: CommercialAuditConfidence | null
}

/**
 * #2457 — élargi de `CommercialAuditContext` à ce `Pick`, pour que
 * `build-audit.ts` puisse l'appeler AVANT que le contrat complet existe (il
 * a déjà `contradictions` et `breakpoints`, calculés une fois, jamais une
 * deuxième dérivation — GA-26). Un `CommercialAuditContext` complet reste un
 * argument valide : c'est ce que `CommercialAuditScreen.tsx` lui passe
 * toujours.
 */
export function buildAuditVerdict(
  auditContext: Pick<CommercialAuditContext, 'contradictions' | 'breakpoints'>,
): AuditVerdict | null {
  const [firstContradiction] = auditContext.contradictions ?? []
  if (firstContradiction) {
    return {
      primary: firstContradiction.tension,
      secondary: firstContradiction.consequenceIfUnaddressed,
      source: 'contradiction',
      ruleId: firstContradiction.ruleId,
      confidence: firstContradiction.confidence,
    }
  }

  const [firstBreakpoint] = auditContext.breakpoints ?? []
  if (firstBreakpoint) {
    return {
      primary: firstBreakpoint.detail ?? firstBreakpoint.label,
      secondary: null,
      source: 'breakpoint',
      ruleId: null,
      confidence: firstBreakpoint.confidence,
    }
  }

  return null
}
