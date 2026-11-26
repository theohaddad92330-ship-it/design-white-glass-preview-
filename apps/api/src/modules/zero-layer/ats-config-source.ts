import type { BoondManagerConfig } from './boondmanager-config'

/**
 * Le port par lequel la couche zéro obtient les identifiants ATS d'un ESPACE (#4687).
 *
 * La couche zéro ne connaît pas le nom du service du module ATS (GA-07) : elle possède cette interface, et
 * `zero-layer.module.ts` branche l'implémentation — `AtsCredentialsService`, la SEULE résolution d'identifiants ATS
 * du dépôt (GA-26). Le port est aussi étroit que son seul appelant.
 */
export const ATS_CONFIG_SOURCE = Symbol('ATS_CONFIG_SOURCE')

export interface AtsConfigSource {
  /** La connexion de l'espace, sinon l'environnement à défaut de ligne ; `null` = aucune (ou à reconnecter). */
  resolveForWorkspace(workspaceId: string | null): Promise<BoondManagerConfig | null>
}
