import type { ScopeGapProvider } from './connector-scope-registry'

/**
 * Le contrat par lequel un connecteur OAuth signale « voilà les portées que le fournisseur vient
 * d'accorder ». Les connecteurs dépendent de CE contrat, jamais du service qui le remplit (GA-07) :
 * retirer le module de surveillance ne casse aucune connexion — le jeton `@Optional()` reste vide.
 */
export const SCOPE_GAP_RECORDER = Symbol('SCOPE_GAP_RECORDER')

export interface ScopeGapRecorder {
  recordGrant(
    provider: ScopeGapProvider,
    userId: string,
    workspaceId: string | null,
    granted: string | null | undefined,
  ): Promise<string[] | null>
}
