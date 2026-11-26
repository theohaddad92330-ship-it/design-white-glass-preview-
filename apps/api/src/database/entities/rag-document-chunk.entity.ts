import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #3750 — un MORCEAU citable d'un document de connaissance (`rag_documents`) :
 * un onglet de classeur, une diapositive, une section titrée. Écrit par le
 * service IA à l'ingestion (`rag_service.ingest`) et par le rattrapage
 * nocturne (`RagChunkBackfillScheduler`) ; l'API ne l'écrit que pour la
 * démonstration (`DemoSeedService`). Migration 1796434817523.
 */
@Entity({ name: 'rag_document_chunks' })
export class RagDocumentChunkEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** Le document parent — ON DELETE CASCADE : effacer le parent emporte ses morceaux. */
  @Index()
  @Column('uuid')
  document_id: string

  @Column('uuid')
  user_id: string

  /** Même portée que le parent (`rag_documents.workspace_id`), recopiée pour la RLS. */
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('integer')
  chunk_index: number

  /** « 07 · Objections », « Slide 13 », titre de section — `''` sans unité. */
  @Column('text', { default: '' })
  unit_label: string

  @Column('text')
  content: string

  // pgvector — écrit par le service IA, jamais lu par l'API (même choix que `rag_documents`).
  @Column({ type: 'text', nullable: true, select: false })
  embedding: string | null

  // Colonne GÉNÉRÉE par la base (tsvector) : jamais écrite, jamais lue par l'API.
  @Column({ type: 'tsvector', select: false, insert: false, update: false, nullable: true })
  search: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
