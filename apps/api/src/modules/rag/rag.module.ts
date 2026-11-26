import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'
import { AuthModule } from '../auth/auth.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { IaModule } from '../ia/ia.module'
import { ImportModule } from '../import/import.module'
import { StorageModule } from '../storage/storage.module'
import { RagController } from './rag.controller'
import { RagPurgeScheduler } from './rag-purge.scheduler'
import { RagChunkBackfillScheduler } from './rag-chunk-backfill.scheduler'
import { RagThreadOrphanPurgeScheduler } from './rag-thread-orphan-purge.scheduler'
import { RagService } from './rag.service'
import { RagZipIngestService } from './rag-zip-ingest.service'
import { RagZipIngestJobService } from './rag-zip-ingest-job.service'
import { RagZipIngestWorker } from './rag-zip-ingest.worker'
import { RAG_ZIP_INGEST_JOB_OPTIONS, RAG_ZIP_INGEST_QUEUE } from './rag-zip-ingest.queue'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'

@Module({
  imports: [
    // Gating par offre : la base de connaissance demande la feature `knowledge_base`.
    PlanFeaturesModule,
    AuthModule,
    WorkspaceModule,
    // #2779 — AccountEntity : vérifier qu'un compte visé appartient à l'espace.
    TypeOrmModule.forFeature([RagDocumentEntity, AccountEntity]),
    // La purge mensuelle appelle le service IA, qui possède la table.
    IaModule,
    // #2850 (#2431.11, 28/09) — la porte d'approbation existante de l'assistant
    // d'import, pour la proposition depuis le dépôt `/chat` (jamais une écriture
    // directe, jamais une seconde porte).
    ImportModule,
    // #2876 (#2433.4) — l'image d'une pièce ÉPHÉMÈRE de conversation, rangée
    // sous son propre domaine (`chat_image_attachment`). Dépendance à sens
    // unique, même schéma que `StorageModule` dans `IaProxyModule` (voix).
    StorageModule,
    // #3623.11 — l'archive .zip part en file : le dépaquetage tourne dans le worker.
    BullModule.registerQueue({ name: RAG_ZIP_INGEST_QUEUE, defaultJobOptions: RAG_ZIP_INGEST_JOB_OPTIONS }),
  ],
  controllers: [RagController],
  // #1954 — la purge nocturne des pièces jointes dont le fil n'a aucun message.
  // #3750.4 — le rattrapage nocturne des morceaux des documents déjà en base.
  providers: [
    RagService,
    RagPurgeScheduler,
    RagThreadOrphanPurgeScheduler,
    RagChunkBackfillScheduler,
    RagZipIngestService,
    RagZipIngestJobService,
    RagZipIngestWorker,
  ],
  exports: [RagService],
})
export class RagModule {}
