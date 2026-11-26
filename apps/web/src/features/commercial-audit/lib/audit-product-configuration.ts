/**
 * #2068.24 / #2068.26 / #2068.27 — LA LIAISON I18N DE LA CONFIGURATION PRODUIT.
 *
 * La RÈGLE (quelle aire, quel réglage, ce qui la rend non évaluable) vit dans
 * `packages/contracts/src/schemas/commercial-audit-product-configuration.ts` —
 * une fonction PURE de `ProfileContext`, sans React ni i18n, que la garde de
 * couverture de démonstration EXÉCUTE sur `DEMO_PROFILE_CONTEXT` au lieu d'en
 * recopier une deuxième (GA-26). Ce fichier ne porte que ce qui appartient à
 * l'ÉCRAN : comment un jeton de valeur se NOMME dans les deux langues.
 */

/**
 * Les paramètres dont la VALEUR est un jeton d'énumération, et le préfixe i18n
 * qui le nomme. Tout le reste est du texte de l'utilisateur, rendu VERBATIM :
 * cette table est la SEULE exception, déclarée à un seul endroit (GA-26). Un
 * paramètre absent d'ici s'affiche tel quel — jamais un libellé inventé pour
 * une valeur qu'on ne sait pas nommer.
 *
 * Appelant : `components/AuditPlanAndMilestones.tsx`.
 */
export const AUDIT_PARAMETER_VALUE_NAMESPACE: Readonly<Record<string, string>> = {
  targetDecisionLevel: 'discover:sidebar.level',
}
