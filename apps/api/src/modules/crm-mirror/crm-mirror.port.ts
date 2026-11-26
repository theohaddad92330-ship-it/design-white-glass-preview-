import type { CrmProvider } from '@bellum/contracts'

/** Jeton d'injection du miroir CRM (SYNC-A) : la reprise (SYNC-B) et la synchro fréquente (SYNC-C) l'appellent s'il est fourni. */
export const CRM_MIRROR_SYNC = Symbol('CRM_MIRROR_SYNC')

/**
 * Jeton de la CIBLE réelle du miroir, résolue par le relais de `CrmModule` (qui fournit lui-même `CRM_MIRROR_SYNC` :
 * résoudre ce dernier en `strict: false` pourrait rendre le relais à lui-même).
 */
export const CRM_MIRROR_SYNC_TARGET = Symbol('CRM_MIRROR_SYNC_TARGET')

export type CrmMirrorEntity = 'deals' | 'activities' | 'owners' | 'pipelines'

export interface CrmMirrorSyncResult {
  readonly counts: Partial<Record<CrmMirrorEntity, number>>
  readonly archived: number
  readonly errors: readonly { readonly entity: CrmMirrorEntity; readonly message: string }[]
}

export interface CrmMirrorSync {
  syncProvider(input: {
    readonly workspaceId: string
    readonly provider: CrmProvider
    readonly mode: 'full' | 'incremental'
    readonly since?: Date
  }): Promise<CrmMirrorSyncResult>
}
