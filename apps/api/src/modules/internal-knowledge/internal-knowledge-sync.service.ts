import { Inject, Injectable, Logger } from '@nestjs/common'
import { chunkText } from './text-chunker'
import { ignoredReason, isSupportedFormat } from './document-text'
import { maskPersonalData } from './personal-data-mask'
import { readInternalKnowledgeConfig, type InternalKnowledgeConfig } from './internal-knowledge.config'
import type { DriveFileMeta, DriveSource, KnowledgeStore, SyncReport } from './internal-knowledge.types'

export const INTERNAL_KNOWLEDGE_STORE = Symbol('INTERNAL_KNOWLEDGE_STORE')
export const INTERNAL_KNOWLEDGE_DRIVE_FACTORY = Symbol('INTERNAL_KNOWLEDGE_DRIVE_FACTORY')
export const INTERNAL_KNOWLEDGE_EMBEDDINGS = Symbol('INTERNAL_KNOWLEDGE_EMBEDDINGS')

export interface DriveSourceFactory {
  create(config: InternalKnowledgeConfig): DriveSource
}

/** Demande au service IA de calculer les embeddings des chunks neufs (no-op sans EMBEDDING_API_KEY côté IA). */
export interface EmbeddingsKick {
  /** `maxSeconds` : durée maximale d'un passage côté IA. Rend l'avancement quand le service IA le dit. */
  kick(opts?: { maxSeconds?: number }): Promise<EmbeddingProgress | void>
}

/** #3586 — ce que le rattrapage d'embeddings rapporte : `done` = plus rien d'éligible, `remaining` = restant (null si inconnu). */
export interface EmbeddingProgress {
  embedded: number
  failed: number
  done: boolean
  remaining: number | null
}

/** Rattrapage des embeddings en fin de passage : borné en temps, sous le verrou de 10 min. */
const EMBEDDING_CATCHUP_BUDGET_MS = 7 * 60 * 1000
const EMBEDDING_CALL_MAX_SECONDS = 60

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const GOOGLE_NATIVE_MIME = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
])
/** Un fichier en erreur n'est retenté (hors changement Drive) qu'après ce délai — pas à chaque synchro. */
const ERROR_RETRY_AFTER_MS = 6 * 60 * 60 * 1000
const MAX_ANCESTOR_DEPTH = 20

type Totals = { indexed: number; ignored: number; errors: number; archived: number; chunksInserted: number }

/**
 * #3586 — la synchro du Drive interne vers `dataforge_rag_chunks`.
 *
 * Portée (#3586.3) : un fichier n'est lu QUE s'il descend (récursivement) d'un dossier de
 * `INTERNAL_KNOWLEDGE_DRIVE_FOLDER_IDS`. En incrémental, on remonte les `parents` ; les métadonnées
 * d'un ancêtre hors portée sont lues (jamais son contenu, jamais ses frères).
 * Archivage (#3586.3, doctrine « on archive ») : un fichier supprimé, en corbeille ou sorti du
 * dossier voit ses chunks archivés, jamais supprimés.
 * Sortie de portée (#3586, limites de la PR #3587) : un dossier déplacé hors de la portée n'émet aucun
 * changement pour ses descendants — on les archive à ce moment (métadonnées seules) ; et une
 * RÉCONCILIATION complète chaque nuit (`reconcile`) rattrape tout le reste : fichier indexé non vu ⇒
 * archivé, fichier vu mais absent/modifié/revenu ⇒ réindexé. Elle ne touche jamais au jeton de page.
 * Sans clé : `{status:'disabled'}`, aucun appel réseau (#3586.1).
 */
@Injectable()
export class InternalKnowledgeSyncService {
  private readonly logger = new Logger(InternalKnowledgeSyncService.name)
  /** Public pour les tests : budget total du rattrapage d'embeddings (7 min, sous le verrou de 10 min). */
  embeddingBudgetMs = EMBEDDING_CATCHUP_BUDGET_MS

  constructor(
    @Inject(INTERNAL_KNOWLEDGE_STORE) private readonly store: KnowledgeStore,
    @Inject(INTERNAL_KNOWLEDGE_DRIVE_FACTORY) private readonly driveFactory: DriveSourceFactory,
    @Inject(INTERNAL_KNOWLEDGE_EMBEDDINGS) private readonly embeddings: EmbeddingsKick,
  ) {}

  async sync(env: Record<string, string | undefined> = process.env): Promise<SyncReport> {
    const config = readInternalKnowledgeConfig(env)
    if (!config) return { status: 'disabled' }

    const drive = this.driveFactory.create(config)
    const totals: Totals = { indexed: 0, ignored: 0, errors: 0, archived: 0, chunksInserted: 0 }
    try {
      const state = await this.store.getState()
      const run = new SyncRun(this.store, drive, config, totals)
      let mode: 'full' | 'incremental'
      let nextToken: string
      if (!state.pageToken) {
        mode = 'full'
        // Le jeton est pris AVANT le parcours : ce qui change pendant le parcours revient au passage suivant.
        nextToken = await drive.startPageToken()
        await run.fullCrawl()
      } else {
        mode = 'incremental'
        // Les fichiers ignorés/en erreur ne changent pas côté Drive : la synchro incrémentale ne les verrait jamais.
        await run.retryPending()
        nextToken = await run.applyChanges(state.pageToken)
      }
      await this.store.saveState({ pageToken: nextToken, lastRunAt: new Date(), lastStatus: 'ok', lastError: null })
      await this.kickEmbeddings()
      return { status: 'ok', mode, ...totals }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erreur inconnue'
      this.logger.warn(`internal-knowledge: synchro en échec (${message})`)
      await this.store.saveState({ lastRunAt: new Date(), lastStatus: 'error', lastError: message })
      return { status: 'error', message }
    }
  }

  /** #3586 — parcours récursif COMPLET de la portée ; archive ce qui n'y est plus, réindexe ce qui y revient. */
  async reconcile(env: Record<string, string | undefined> = process.env): Promise<SyncReport> {
    const config = readInternalKnowledgeConfig(env)
    if (!config) return { status: 'disabled' }

    const drive = this.driveFactory.create(config)
    const totals: Totals = { indexed: 0, ignored: 0, errors: 0, archived: 0, chunksInserted: 0 }
    try {
      const state = await this.store.getState()
      // Le jeton (s'il existe) reste celui de la synchro incrémentale : la réconciliation ne le déplace pas.
      const pageToken = state.pageToken ?? (await drive.startPageToken())
      await new SyncRun(this.store, drive, config, totals).fullCrawl()
      const now = new Date()
      await this.store.saveState({
        pageToken,
        lastRunAt: now,
        lastReconciledAt: now,
        lastStatus: 'ok',
        lastError: null,
      })
      await this.kickEmbeddings()
      return { status: 'ok', mode: 'reconciliation', ...totals }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erreur inconnue'
      this.logger.warn(`internal-knowledge: réconciliation en échec (${message})`)
      await this.store.saveState({ lastRunAt: new Date(), lastStatus: 'error', lastError: message })
      return { status: 'error', message }
    }
  }

  /**
   * #3586 — rattrape les embeddings en fin de passage, À CHAQUE passage (pas seulement quand des chunks
   * viennent d'être insérés : le retard d'un passage précédent se rattrape aussi). Boucle tant qu'il reste
   * des chunks sans embedding, dans le budget de temps ; s'arrête sans progrès (pas de boucle sur une panne).
   */
  private async kickEmbeddings(): Promise<void> {
    const deadline = Date.now() + this.embeddingBudgetMs
    try {
      for (;;) {
        const left = deadline - Date.now()
        if (left <= 0) break
        const progress = await this.embeddings.kick({
          maxSeconds: Math.max(1, Math.min(EMBEDDING_CALL_MAX_SECONDS, Math.floor(left / 1000))),
        })
        if (!progress) break
        this.logger.log(
          `internal-knowledge: embeddings : ${progress.remaining ?? 'nombre inconnu de'} restants (${progress.embedded} calculés, ${progress.failed} en échec)`,
        )
        if (progress.done || progress.embedded === 0) break
      }
    } catch (error) {
      // Les embeddings se rattrapent au prochain passage ; une panne IA ne fait pas échouer la synchro.
      this.logger.warn(
        `internal-knowledge: embeddings non lancés (${error instanceof Error ? error.message : 'inconnu'})`,
      )
    }
  }
}

class SyncRun {
  private readonly parentCache = new Map<string, DriveFileMeta | null>()

  constructor(
    private readonly store: KnowledgeStore,
    private readonly drive: DriveSource,
    private readonly config: InternalKnowledgeConfig,
    private readonly totals: Totals,
  ) {}

  async fullCrawl(): Promise<void> {
    const seen = new Set<string>()
    for (const rootId of this.config.folderIds) {
      const root = await this.meta(rootId)
      await this.crawlFolder(rootId, root?.name ?? rootId, seen)
    }
    // Un fichier connu mais absent du parcours est sorti de portée depuis le dernier passage.
    for (const known of await this.store.listFiles()) {
      if (known.status !== 'archived' && !seen.has(known.fileId)) await this.archive(known.fileId)
    }
  }

  async applyChanges(startToken: string): Promise<string> {
    let token = startToken
    for (;;) {
      const page = await this.drive.listChanges(token)
      for (const change of page.changes) {
        const file = change.file
        if (change.removed || !file || file.trashed) {
          await this.archive(change.fileId)
          if (file?.mimeType === FOLDER_MIME) await this.archiveDescendants(file.id)
          continue
        }
        const path = await this.pathInScope(file)
        if (path === null) {
          await this.archive(file.id)
          // Un dossier sorti de la portée n'émet aucun changement pour ses enfants : on recalcule leur appartenance.
          if (file.mimeType === FOLDER_MIME) await this.archiveDescendants(file.id)
        } else if (file.mimeType === FOLDER_MIME) {
          // Un dossier déplacé dans la portée n'émet pas de changement pour ses enfants : on le reparcourt.
          await this.crawlFolder(file.id, path, new Set())
        } else {
          await this.processFile(file, path)
        }
      }
      if (page.nextPageToken) {
        token = page.nextPageToken
        continue
      }
      return page.newStartPageToken ?? token
    }
  }

  /**
   * Archive les fichiers CONNUS sous un dossier sorti de la portée (métadonnées seules, jamais de contenu).
   * Au mieux : si Drive refuse la lecture du dossier, la réconciliation nocturne rattrape.
   */
  private async archiveDescendants(folderId: string, depth = 0): Promise<void> {
    if (depth >= MAX_ANCESTOR_DEPTH) return
    let children: DriveFileMeta[]
    try {
      children = await this.drive.listChildren(folderId)
    } catch {
      return
    }
    for (const child of children) {
      if (child.mimeType === FOLDER_MIME) await this.archiveDescendants(child.id, depth + 1)
      else await this.archive(child.id)
    }
  }

  private async meta(id: string): Promise<DriveFileMeta | null> {
    if (!this.parentCache.has(id)) this.parentCache.set(id, await this.drive.getFile(id))
    return this.parentCache.get(id) ?? null
  }

  /** Chemin lisible du fichier si l'un de ses ancêtres est un dossier listé, sinon `null`. */
  private async pathInScope(file: DriveFileMeta): Promise<string | null> {
    if (this.config.folderIds.includes(file.id)) return file.name
    const names = [file.name]
    let current: DriveFileMeta = file
    for (let depth = 0; depth < MAX_ANCESTOR_DEPTH; depth++) {
      const rootParent = current.parents.find(id => this.config.folderIds.includes(id))
      if (rootParent) {
        names.push((await this.meta(rootParent))?.name ?? rootParent)
        return names.reverse().join(' / ')
      }
      let next: DriveFileMeta | null = null
      for (const parentId of current.parents) {
        next = await this.meta(parentId)
        if (next) break
      }
      if (!next) return null
      names.push(next.name)
      current = next
    }
    return null
  }

  private async crawlFolder(folderId: string, here: string, seen: Set<string>): Promise<void> {
    for (const child of await this.drive.listChildren(folderId)) {
      if (child.trashed) continue
      if (child.mimeType === FOLDER_MIME) {
        await this.crawlFolder(child.id, `${here} / ${child.name}`, seen)
      } else {
        seen.add(child.id)
        await this.processFile(child, `${here} / ${child.name}`)
      }
    }
  }

  private async archive(fileId: string): Promise<void> {
    const known = await this.store.getFile(fileId)
    if (!known || known.status === 'archived') return
    await this.store.archiveChunks(fileId)
    await this.store.upsertFile({
      ...known,
      status: 'archived',
      chunkCount: 0,
      errorMessage: null,
      syncedAt: new Date(),
    })
    this.totals.archived += 1
  }

  private isSupported(name: string, mimeType: string): boolean {
    return GOOGLE_NATIVE_MIME.has(mimeType) || isSupportedFormat(name, mimeType)
  }

  /**
   * #3586 — reprise CIBLÉE : ignorés dont le format est désormais pris en charge, et erreurs anciennes.
   * Jamais tout le parc : les fichiers indexés, archivés et les formats toujours ignorés ne sont pas relus.
   */
  async retryPending(): Promise<void> {
    const staleBefore = Date.now() - ERROR_RETRY_AFTER_MS
    for (const known of await this.store.listFiles()) {
      const retry =
        (known.status === 'ignored' && this.isSupported(known.name, known.mimeType)) ||
        (known.status === 'error' && known.syncedAt.getTime() < staleBefore)
      if (!retry) continue
      try {
        const meta = await this.drive.getFile(known.fileId)
        if (!meta || meta.trashed) continue // la corbeille et la suppression remontent par les changements
        const path = await this.pathInScope(meta)
        if (path === null) await this.archive(meta.id)
        else await this.processFile(meta, path)
      } catch {
        // Au mieux : la réconciliation nocturne rattrape.
      }
    }
  }

  private async processFile(file: DriveFileMeta, path: string): Promise<void> {
    const known = await this.store.getFile(file.id)
    const base = { fileId: file.id, name: file.name, mimeType: file.mimeType, path, modifiedTime: file.modifiedTime }

    if (
      known &&
      known.modifiedTime === file.modifiedTime &&
      (known.status === 'indexed' || (known.status === 'ignored' && !this.isSupported(file.name, file.mimeType)))
    ) {
      return
    }

    if (!this.isSupported(file.name, file.mimeType)) {
      if (known?.status === 'indexed') await this.store.archiveChunks(file.id)
      await this.store.upsertFile({
        ...base,
        status: 'ignored',
        errorMessage: ignoredReason(file.name, file.mimeType),
        chunkCount: 0,
        syncedAt: new Date(),
      })
      this.totals.ignored += 1
      return
    }

    try {
      const text = await this.drive.fetchText(file)
      const chunks = chunkText(maskPersonalData(text, { keepContacts: this.config.keepContacts }))
      if (chunks.length === 0) throw new Error('document vide — rien à indexer')
      const inserted = await this.store.replaceChunks(base, chunks)
      this.totals.chunksInserted += inserted
      await this.store.upsertFile({
        ...base,
        status: 'indexed',
        errorMessage: null,
        chunkCount: inserted,
        syncedAt: new Date(),
      })
      this.totals.indexed += 1
    } catch (error) {
      // Les anciens chunks restent servis : un échec d'export ne vide pas la connaissance déjà indexée.
      await this.store.upsertFile({
        ...base,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'erreur inconnue',
        chunkCount: known?.chunkCount ?? 0,
        syncedAt: new Date(),
      })
      this.totals.errors += 1
    }
  }
}
