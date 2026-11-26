import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Un chunk indexable du pack ORION_DATAPACK_V12 (`5_RAG/50_CHUNKS_INDEXABLES.csv`)
 * — PARTAGÉ entre tous les espaces, même raison que `dataforge_accounts` (GA-16) :
 * c'est un référentiel de MARCHÉ, pas le contenu d'un client.
 *
 * ⚠️ `account_id` est NULL pour les 20 chunks `type_chunk = 'GARDE_FOU_QUALITE'`
 * (mesuré : 20/20) — et pour 87 autres chunks de référentiel/gatekeeper. Ce
 * n'est PAS un oubli d'ingestion : l'alerte porte sur le PACK, pas sur un
 * compte précis. `match_dataforge_rag_chunks` (migration
 * `1791510100000-OrionRagChunksVectorSearch`) les inclut TOUJOURS, quel que
 * soit le compte demandé — un filtre `account_id = $1` strict les ferait
 * disparaître de toute recherche scopée à un compte, exactement ce que
 * l'avertissement 1 interdit.
 *
 * `embedding` reste `NULL` tant qu'aucune clé `EMBEDDING_API_KEY` n'a permis de
 * le calculer (no-op strict, voir `apps/ia/app/services/rag_service.py`) — la
 * recherche plein texte reste alors la seule voie, jamais un échec silencieux.
 */
@Entity('dataforge_rag_chunks')
export class DataforgeRagChunkEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'data_version', type: 'text' })
  dataVersion!: string

  /** `chunk_id` du CSV — stable, jamais réécrit. */
  @Index({ unique: true })
  @Column({ name: 'chunk_id', type: 'text' })
  chunkId!: string

  /** `bellum_account_source_id` du pack DATAFORGE — NULL pour une alerte globale. */
  @Index()
  @Column({ name: 'account_id', type: 'text', nullable: true })
  accountId!: string | null

  @Column({ type: 'text', nullable: true })
  entreprise!: string | null

  @Index()
  @Column({ name: 'type_chunk', type: 'text' })
  typeChunk!: string

  @Column({ type: 'text', nullable: true })
  titre!: string | null

  @Column({ type: 'text' })
  texte!: string

  @Column({ type: 'text', nullable: true })
  source!: string | null

  /** `[confirmé]` / `[probable]` / `[issu fichier]` / `[garde-fou interne]`… — texte
   *  libre du pack, jamais réinterprété : un tier D'EVIDENCE ne s'y substitue pas. */
  @Column({ name: 'niveau_confiance', type: 'text', nullable: true })
  niveauConfiance!: string | null

  @Column({ name: 'date_verification', type: 'text', nullable: true })
  dateVerification!: string | null

  /** 0 | 1 | 2 — 0 = preuve/garde-fou (reranking prioritaire), 2 = hérité non re-sourcé. */
  @Index()
  @Column({ name: 'priorite_indexation', type: 'smallint' })
  prioriteIndexation!: number

  @Column({ type: 'integer', nullable: true })
  longueur!: number | null

  /** `vector(1536)` — colonne créée par la migration pgvector, TypeORM ne
   *  connaît pas ce type nativement : lu/écrit en `text` côté ORM, en SQL brut
   *  pour la recherche (voir `OrionRagChunksService`). */
  @Column({ type: 'text', nullable: true, select: false })
  embedding!: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  /** #3586 — chunk archivé (fichier Drive modifié, supprimé ou sorti du dossier) : jamais supprimé,
   *  plus servi par `match_dataforge_rag_chunks`. NULL pour tous les chunks ORION. */
  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null

  /** #3586 — source Drive du chunk (NULL pour un chunk ORION). */
  @Column({ name: 'drive_file_id', type: 'text', nullable: true })
  driveFileId!: string | null

  @Column({ name: 'drive_modified_time', type: 'text', nullable: true })
  driveModifiedTime!: string | null

  @Column({ name: 'drive_path', type: 'text', nullable: true })
  drivePath!: string | null
}
