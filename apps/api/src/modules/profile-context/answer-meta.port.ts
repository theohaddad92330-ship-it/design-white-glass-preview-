import type { AnswerMetaMap } from '@bellum/contracts'

/**
 * #2007.6 / #2007.7 / #2007.10 / #2007.12 — la SEULE forme sous laquelle la
 * construction du contexte de profil apprend la provenance ET le statut de
 * chaque réponse déjà connue (`esn_profiles.answer_meta`, #2006.22), pour les
 * transmettre au Profileur (`ProfileContextService.triggerGeneration` →
 * `IaClient.generateProfile`).
 *
 * Même raisonnement que `connected-tools.port.ts` (#2007.8) et
 * `workspace-id.port.ts` (#2009.7) : GA-07 refuse qu'un service aille chercher
 * celui d'un autre module (`EsnProfileWorkspaceResolver` vit dans le module
 * `esn-profile`) — le câblage vit dans `profile-context.module.ts`, via
 * `EsnProfileReaderModule` (module dépendance-libre, déjà importé pour le
 * workspace).
 */
export const ANSWER_META_READER = Symbol('ANSWER_META_READER')

export type AnswerMetaReader = {
  /**
   * La carte de provenance/statut, fusionnée entreprise + personnel comme les
   * réponses elles-mêmes. Une lecture ratée dégrade en `{}` — jamais
   * bloquante pour la génération elle-même (même doctrine que
   * {@link ConnectedToolsReader}) : aucune ligne de provenance transmise
   * plutôt qu'une génération cassée.
   */
  resolveAnswerMeta(userId: string): Promise<AnswerMetaMap>
}
