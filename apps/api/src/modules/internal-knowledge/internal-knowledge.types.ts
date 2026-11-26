export type DriveFileMeta = {
  id: string
  name: string
  mimeType: string
  /** RFC 3339 tel que rendu par Drive — jamais reformaté (clé d'idempotence avec `id`). */
  modifiedTime: string
  parents: string[]
  trashed: boolean
}

type DriveChange = { fileId: string; removed: boolean; file?: DriveFileMeta }

export type DriveChangesPage = {
  changes: DriveChange[]
  nextPageToken?: string
  newStartPageToken?: string
}

/** La frontière réseau : tout ce que la synchro demande à Drive passe ici (et seulement ici). */
export interface DriveSource {
  startPageToken(): Promise<string>
  listChildren(folderId: string): Promise<DriveFileMeta[]>
  getFile(fileId: string): Promise<DriveFileMeta | null>
  listChanges(pageToken: string): Promise<DriveChangesPage>
  /** Texte brut d'un fichier SUPPORTÉ (Docs/Sheets/Slides exportés, PDF/docx extraits, md/txt lus). */
  fetchText(file: DriveFileMeta): Promise<string>
}

/** #3586.8 — « ignorées » (images, vidéos, formats non lus) ne sont jamais des erreurs. */
export type KnowledgeFileStatus = 'indexed' | 'ignored' | 'error' | 'archived'

export type KnowledgeFileRow = {
  fileId: string
  name: string
  mimeType: string
  path: string
  modifiedTime: string
  status: KnowledgeFileStatus
  errorMessage: string | null
  chunkCount: number
  syncedAt: Date
}

export type KnowledgeSyncState = {
  pageToken: string | null
  lastRunAt: Date | null
  lastStatus: 'ok' | 'error' | null
  lastError: string | null
  /** Dernière réconciliation nocturne complète réussie (#3586) — jamais posée par une synchro incrémentale. */
  lastReconciledAt: Date | null
}

export interface KnowledgeStore {
  getState(): Promise<KnowledgeSyncState>
  saveState(patch: Partial<KnowledgeSyncState>): Promise<void>
  getFile(fileId: string): Promise<KnowledgeFileRow | null>
  upsertFile(row: KnowledgeFileRow): Promise<void>
  listFiles(): Promise<KnowledgeFileRow[]>
  /** Archive les chunks vivants du fichier puis insère les neufs — atomique, idempotent. */
  replaceChunks(
    file: { fileId: string; name: string; path: string; modifiedTime: string },
    chunks: string[],
  ): Promise<number>
  /** Archive (jamais supprime) les chunks du fichier. */
  archiveChunks(fileId: string): Promise<void>
}

/** #3586 (W2) — le digest courant du Drive interne (table `internal_knowledge_digests`, ligne non archivée). */
export type KnowledgeDigest = {
  content: string
  /** Empreinte des fichiers indexés au moment de la génération : inchangée ⇒ aucun appel modèle. */
  fingerprint: string
  createdAt: Date
  sizeChars: number
}

export interface DigestStore {
  getCurrentDigest(): Promise<KnowledgeDigest | null>
  /** Archive (jamais supprime) le digest courant puis insère le neuf — atomique. */
  saveDigest(digest: { content: string; fingerprint: string }): Promise<void>
}

export type SyncReport =
  | { status: 'disabled' }
  | {
      status: 'ok'
      mode: 'full' | 'incremental' | 'reconciliation'
      indexed: number
      ignored: number
      errors: number
      archived: number
      chunksInserted: number
    }
  | { status: 'error'; message: string }
