import type { StorageDomain } from '@bellum/contracts'

/**
 * #3699.6 — le stockage de fichiers, vu par le catalogue d'assets et par les
 * pièces jointes d'un envoi. Un jeton plutôt que `StorageService` importé
 * (GA-07, `module-boundaries.spec.ts`) : fourni par les `.module.ts` de ce
 * dossier depuis `StorageModule`. Seules les portes que ces deux services
 * appellent y figurent.
 */
export const OUTREACH_ASSET_STORAGE = 'OUTREACH_ASSET_STORAGE'

type StoredRecord = {
  id: string
  fileName: string
  contentType: string
  byteSize: number
  contentSha256?: string | null
}

export type OutreachAssetStorage = {
  put(input: {
    workspaceId: string
    domain: StorageDomain
    fileName: string
    contentType: string
    fileB64: string
    uploadedBy: string | null
    today: string
  }): Promise<StoredRecord>
  remove(workspaceId: string, objectId: string): Promise<void>
  byIds(workspaceId: string, objectIds: readonly string[]): Promise<Map<string, StoredRecord>>
  readOutreachAssetFile(
    workspaceId: string,
    objectId: string,
  ): Promise<{ bytes: Buffer; fileName: string; contentType: string; byteSize: number; sha256: string | null }>
}
