import type { AnalysisBusinessUnit } from '@bellum/contracts'

/**
 * #2007.3 / #2009.8 — la SEULE forme sous laquelle la construction du contexte
 * de profil apprend le PÉRIMÈTRE que le membre porte (BU / agence, `business_units`
 * + `business_unit_members`), pour le transmettre au Profileur et l'inclure dans
 * la clé d'idempotence de `triggerGeneration`.
 *
 * Même montage que `workspace-id.port.ts` (GA-07) : le câblage vit dans
 * `profile-context.module.ts`, branché sur `EsnProfileWorkspaceResolver`, qui
 * lit DÉJÀ ces BU pour les prompts d'analyse (#2118.9) — une seule requête,
 * une seule borne.
 *
 * ⚠️ REVUE SÉCURITÉ (la raison pour laquelle cette couche était restée « hors
 * périmètre » jusqu'ici) : la lecture est bornée par l'espace ACTIF **et** par
 * l'utilisateur (`m.workspace_id = $1 AND m.user_id = $2`, jointure sur le
 * même `workspace_id`), aux seules BU actives. `user_id` seul ferait entrer
 * les BU d'un autre espace ; `workspace_id` seul, celles des collègues. Rien
 * d'autre que nom, échelle, territoire et spécialités ne sort — ni membres, ni
 * comptes rattachés, ni responsable.
 */
export const BUSINESS_UNITS_READER = Symbol('BUSINESS_UNITS_READER')

export type BusinessUnitsReader = {
  /**
   * Les BU actives que CET utilisateur porte dans SON espace actif, triées par
   * nom ; `[]` sans espace ou sans périmètre. Une lecture ratée dégrade en `[]`
   * côté appelant, jamais bloquante pour la génération.
   */
  resolveCarriedBusinessUnits(userId: string): Promise<AnalysisBusinessUnit[]>
}
