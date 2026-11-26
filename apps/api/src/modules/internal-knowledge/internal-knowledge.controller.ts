import { Controller, Get, Inject, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { ignoredReason } from './document-text'
import { readInternalKnowledgeConfig } from './internal-knowledge.config'
import { INTERNAL_KNOWLEDGE_STORE } from './internal-knowledge-sync.service'
import { INTERNAL_KNOWLEDGE_DIGEST_STORE } from './internal-knowledge-digest.service'
import type { DigestStore, KnowledgeFileStatus, KnowledgeStore } from './internal-knowledge.types'

export const INTERNAL_KNOWLEDGE_IS_CONFIGURED = Symbol('INTERNAL_KNOWLEDGE_IS_CONFIGURED')

/** Fournisseur par défaut : lit l'environnement à chaque appel (jamais une valeur, seulement « posé ou non »). */
export const isInternalKnowledgeConfigured = (): boolean => readInternalKnowledgeConfig() !== null

type InternalKnowledgeOverview = {
  configured: boolean
  lastRunAt: Date | null
  lastStatus: 'ok' | 'error' | null
  lastError: string | null
  lastReconciledAt: Date | null
  counts: Record<KnowledgeFileStatus, number>
  /** Taille en jetons ESTIMÉE (≈ 4 caractères par jeton) : c'est le surcoût d'entrée par appel commercial. */
  digest: { generatedAt: Date; sizeChars: number; approxTokens: number } | null
  files: Array<{
    name: string
    path: string
    status: KnowledgeFileStatus
    modifiedTime: string
    syncedAt: Date
    chunkCount: number
    errorMessage: string | null
  }>
}

/**
 * #3586.8 — le panneau « Drive interne » du dashboard-manager (déplacé du web le 05/10) : dernière synchro, fichiers indexés / ignorés /
 * en erreur / archivés, liste datée. INTERNE : gardé au niveau de la classe par `InternalSecretGuard`
 * (secret interne, appelé côté serveur par le DM ; aucun porteur de rôle d'espace n'y accède) ; jamais user-facing, donc « vide à dessein » en démo
 * (`DEMO_INTERNAL_KNOWLEDGE_COVERAGE`). Le jeton de page `changes.list` ne sort JAMAIS d'ici.
 */
@Controller('internal/internal-knowledge')
@UseGuards(InternalSecretGuard)
export class InternalKnowledgeController {
  constructor(
    @Inject(INTERNAL_KNOWLEDGE_STORE) private readonly store: KnowledgeStore,
    @Inject(INTERNAL_KNOWLEDGE_IS_CONFIGURED) private readonly isConfigured: () => boolean,
    @Inject(INTERNAL_KNOWLEDGE_DIGEST_STORE) private readonly digests: DigestStore,
  ) {}

  @Get()
  async overview(): Promise<InternalKnowledgeOverview> {
    const [state, files, digest] = await Promise.all([
      this.store.getState(),
      this.store.listFiles(),
      this.digests.getCurrentDigest(),
    ])
    const counts: Record<KnowledgeFileStatus, number> = { indexed: 0, ignored: 0, error: 0, archived: 0 }
    for (const f of files) counts[f.status] += 1
    return {
      configured: this.isConfigured(),
      lastRunAt: state.lastRunAt,
      lastStatus: state.lastStatus,
      lastError: state.lastError,
      lastReconciledAt: state.lastReconciledAt,
      counts,
      // #3586 (W2) — date et taille du digest courant ; `null` = jamais généré (jamais un « 0 »).
      digest: digest
        ? { generatedAt: digest.createdAt, sizeChars: digest.sizeChars, approxTokens: Math.ceil(digest.sizeChars / 4) }
        : null,
      files: files.map(f => ({
        name: f.name,
        path: f.path,
        status: f.status,
        modifiedTime: f.modifiedTime,
        syncedAt: f.syncedAt,
        chunkCount: f.chunkCount,
        // #3586 — fichiers ignorés avant que la raison soit stockée : même fonction que la synchro.
        errorMessage: f.errorMessage || (f.status === 'ignored' ? ignoredReason(f.name, f.mimeType) : null),
      })),
    }
  }
}
