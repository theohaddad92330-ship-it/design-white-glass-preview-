import { Injectable, Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { IaClient } from '../ia/ia.client'
import { IaModule } from '../ia/ia.module'
import { LocksModule } from '../locks/locks.module'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { SINGLETON_LOCK, type UnderSingletonLock } from './module-tokens'
import { GoogleDriveSource } from './google-drive-source'
import {
  INTERNAL_KNOWLEDGE_IS_CONFIGURED,
  InternalKnowledgeController,
  isInternalKnowledgeConfigured,
} from './internal-knowledge.controller'
import type { InternalKnowledgeConfig } from './internal-knowledge.config'
import {
  INTERNAL_KNOWLEDGE_DIGEST_GENERATOR,
  INTERNAL_KNOWLEDGE_DIGEST_STORE,
  InternalKnowledgeDigestService,
  type DigestGenerator,
} from './internal-knowledge-digest.service'
import { InternalKnowledgeScheduler } from './internal-knowledge.scheduler'
import { InternalKnowledgeStore } from './internal-knowledge.store'
import {
  INTERNAL_KNOWLEDGE_DRIVE_FACTORY,
  INTERNAL_KNOWLEDGE_EMBEDDINGS,
  INTERNAL_KNOWLEDGE_STORE,
  InternalKnowledgeSyncService,
  type DriveSourceFactory,
  type EmbeddingProgress,
  type EmbeddingsKick,
} from './internal-knowledge-sync.service'

@Injectable()
class GoogleDriveSourceFactory implements DriveSourceFactory {
  constructor(private readonly ia: IaClient) {}
  create(config: InternalKnowledgeConfig): GoogleDriveSource {
    return new GoogleDriveSource(config, this.ia)
  }
}

/** #3586 (W2) — le service IA produit le digest (un appel Claude) ; l'API le stocke. */
@Injectable()
class IaDigestGenerator implements DigestGenerator {
  constructor(private readonly ia: IaClient) {}
  async generate(): Promise<string | null> {
    const res = await this.ia.internalKnowledgeDigest()
    if (!res.success) throw new Error('génération du digest refusée par le service IA')
    const digest = res.data?.digest
    return typeof digest === 'string' ? digest : null
  }
}

@Injectable()
class IaEmbeddingsKick implements EmbeddingsKick {
  constructor(private readonly ia: IaClient) {}
  async kick(opts?: { maxSeconds?: number }): Promise<EmbeddingProgress | void> {
    const maxSeconds = opts?.maxSeconds
    const res = await this.ia.dataforgeBackfillEmbeddings({ maxSeconds })
    const d = res.data as Record<string, unknown> | undefined
    if (!d || typeof d.embedded !== 'number') return undefined
    return {
      embedded: d.embedded,
      failed: typeof d.failed === 'number' ? d.failed : 0,
      done: d.done === true,
      remaining: typeof d.remaining === 'number' ? d.remaining : null,
    }
  }
}

/**
 * #3586 — le Drive interne Bellum → corpus RAG partagé `dataforge_rag_chunks`.
 *
 * Module AUTONOME (règle #7) : le retirer d'`AppModule` ne casse rien — aucun autre module ne
 * l'importe, ses deux tables (`internal_knowledge_files`, `internal_knowledge_sync_state`) et ses
 * colonnes additives sur `dataforge_rag_chunks` restent inertes. Sans les deux variables d'environnement,
 * rien ne s'exécute (zéro appel réseau).
 */
@Module({
  imports: [AuthModule, IaModule, LocksModule],
  controllers: [InternalKnowledgeController],
  providers: [
    InternalKnowledgeStore,
    { provide: INTERNAL_KNOWLEDGE_STORE, useExisting: InternalKnowledgeStore },
    GoogleDriveSourceFactory,
    { provide: INTERNAL_KNOWLEDGE_DRIVE_FACTORY, useExisting: GoogleDriveSourceFactory },
    IaEmbeddingsKick,
    { provide: INTERNAL_KNOWLEDGE_EMBEDDINGS, useExisting: IaEmbeddingsKick },
    { provide: INTERNAL_KNOWLEDGE_IS_CONFIGURED, useValue: isInternalKnowledgeConfigured },
    InternalKnowledgeSyncService,
    { provide: INTERNAL_KNOWLEDGE_DIGEST_STORE, useExisting: InternalKnowledgeStore },
    IaDigestGenerator,
    { provide: INTERNAL_KNOWLEDGE_DIGEST_GENERATOR, useExisting: IaDigestGenerator },
    InternalKnowledgeDigestService,
    InternalKnowledgeScheduler,
    {
      provide: SINGLETON_LOCK,
      inject: [{ token: SingletonLockService, optional: true }],
      useFactory:
        (locks?: SingletonLockService): UnderSingletonLock =>
        (name, run) =>
          withSingletonLock(locks, name, run),
    },
  ],
})
export class InternalKnowledgeModule {}
