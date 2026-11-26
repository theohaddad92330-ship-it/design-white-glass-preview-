import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DataforgeRagChunkEntity } from '../../database/entities/dataforge-rag-chunk.entity'
import { ORION_QUALITY_GUARD_CHUNK_TYPE } from './orion-v12-headers.fixture'

/**
 * Couverture des chunks RAG ORION V12 — pour le back-office UNIQUEMENT (même
 * politique que `DataforgeService.coverage`, GA-37). La RECHERCHE elle-même
 * (vectorielle ou plein texte) est côté IA (`apps/ia/app/services/rag_service.py`),
 * qui parle `EMBEDDING_API_KEY` — ce service NestJS ne fait qu'ingérer et
 * compter.
 */
@Injectable()
export class OrionRagChunksService {
  constructor(
    @InjectRepository(DataforgeRagChunkEntity)
    private readonly chunks: Repository<DataforgeRagChunkEntity>,
  ) {}

  async coverage(): Promise<{
    chunks: number
    withEmbedding: number
    guardFouChunks: number
    byPrioriteIndexation: Record<string, number>
  }> {
    const chunks = await this.chunks.count()
    const withEmbeddingRows = await this.chunks.query(
      `SELECT count(*)::int AS n FROM dataforge_rag_chunks WHERE embedding IS NOT NULL`,
    )
    const guardFouRows = await this.chunks.query(
      `SELECT count(*)::int AS n FROM dataforge_rag_chunks WHERE type_chunk = $1`,
      [ORION_QUALITY_GUARD_CHUNK_TYPE],
    )
    const byPriorite = await this.chunks.query(
      `SELECT priorite_indexation AS priorite, count(*)::int AS n FROM dataforge_rag_chunks GROUP BY 1`,
    )
    return {
      chunks,
      withEmbedding: (withEmbeddingRows as { n: number }[])[0]?.n ?? 0,
      guardFouChunks: (guardFouRows as { n: number }[])[0]?.n ?? 0,
      byPrioriteIndexation: Object.fromEntries(
        (byPriorite as { priorite: number; n: number }[]).map(row => [String(row.priorite), row.n]),
      ),
    }
  }
}
