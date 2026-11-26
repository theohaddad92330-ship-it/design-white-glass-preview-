/**
 * #3423.7 — le rôle d'une personne du graphe (`decisionRoles`, plusieurs
 * possibles) traduit dans le vocabulaire de la colonne `contacts.decision_role`
 * (UN seul rôle, contrainte `contacts_decision_role_check`).
 *
 * Le PREMIER rôle posé est le rôle principal (l'ordre est celui de la
 * correction humaine). `unknown`, ou aucun rôle → `null` : « non établi », jamais
 * un rôle inventé pour remplir la colonne.
 */
const CONTACT_ROLE_BY_ORG_ROLE: Readonly<Record<string, string>> = {
  economic_buyer: 'economic',
  technical_buyer: 'technical',
  user_buyer: 'user',
  champion: 'champion',
  procurement: 'procurement',
  blocker: 'blocker',
  influencer: 'influencer',
}

export function contactRoleFromOrgRoles(roles: readonly unknown[]): string | null {
  for (const role of roles) {
    if (typeof role !== 'string' || role === 'unknown') continue
    const mapped = CONTACT_ROLE_BY_ORG_ROLE[role]
    if (mapped) return mapped
  }
  return null
}
