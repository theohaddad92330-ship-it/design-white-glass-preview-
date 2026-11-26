import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity({ name: 'rag_documents' })
export class RagDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  user_id: string

  // Team scope (multi-user Phase 2). Nullable while the user_id → workspace_id
  // roll-out is mid-flight (see agent_docs/multi-user-workspaces.md): the Phase-1
  // migration backfilled it 1:1 from each row's owner workspace, and it flips to
  // NOT NULL only once every write path stamps it. `user_id` stays as the
  // created-by attribution; `workspace_id` becomes the read scope.
  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('text', { nullable: true })
  title: string | null

  @Column('text', { nullable: true })
  content: string | null

  @Column('text', { nullable: true })
  category: string | null

  // pgvector column — we don't read/write it from the API (IA service handles embeddings).
  // Column is declared so TypeORM's metadata matches the DB; `select: false` keeps SELECT * light.
  @Column({ type: 'text', nullable: true, select: false })
  embedding: string | null

  // Pas de colonne `metadata` ici : la table n'en a jamais eu. Elle a été
  // déclarée sans migration correspondante, et personne ne l'écrivait — jusqu'au
  // seed de la démonstration, qui a fait tomber toute redemption du lien public
  // en 500 (`column "metadata" of relation "rag_documents" does not exist`).
  // Une colonne déclarée mais absente est un piège silencieux : la lecture
  // passe tant qu'elle liste ses champs, l'écriture tombe. Ne rien déclarer
  // qu'une migration n'ait créé.

  // Compteurs d'usage et origine (tome 7 M2/M6) — écrits par le service IA via
  // une fonction SQL ; déclarés pour que l'entité reflète la table (GA-36).
  @Column('integer', { default: 0 })
  used_count: number

  @Column('timestamptz', { nullable: true })
  last_used_at: Date | null

  @Column('text', { array: true, default: () => "'{}'" })
  used_in: string[]

  /** `distilled` (régénérable) ou `uploaded` (déposé par un humain — la purge
   *  ne le touche jamais). */
  @Column('text', { default: 'distilled' })
  origin: string

  // #1954.7 — la PORTÉE : qui peut lire ce document (Louis, 12/09/2026).
  // `workspace` (défaut, comportement d'avant) ancre l'analyse de toute
  // l'équipe ; `conversation` ne sert QU'AU FIL qui l'a déposé — jamais listé
  // dans `/knowledge` (`RagService.listForWorkspace`), jamais dans le RAG
  // d'une analyse de compte, jamais dans un autre fil. Contrainte SQL :
  // `rag_documents_scope_check` (migration 1792800004817). Énumération
  // miroir : `RAG_DOCUMENT_SCOPES` (`@bellum/contracts`).
  @Column('text', { default: 'workspace' })
  scope: string

  // Le fil visé quand `scope = 'conversation'`, sinon NULL. Texte libre — même
  // espace de noms que `chat_messages.conversation_id` (id synthétique du
  // web, jamais un UUID). La base rejette un document `conversation` sans
  // cette colonne (`rag_documents_conversation_scope_requires_id_check`).
  @Column('text', { nullable: true })
  conversation_id: string | null

  // #2779 — le compte visé quand `scope = 'account'`, sinon NULL. La base
  // rejette un document `account` sans compte
  // (`rag_documents_account_scope_requires_id_check`, migration 1796001543888).
  @Column('uuid', { nullable: true })
  account_id: string | null

  // #2431.7 (reste) — l'empreinte du CONTENU, calculée par le service IA à
  // l'écriture (`rag_service.ingest`, sha256 hex), pour dédoublonner CONTRE
  // la base existante — système différent du dédoublonnage INTRA-archive déjà
  // livré (sha256 côté client, `rag-zip-ingest.service.ts:93`). `null` pour
  // les lignes écrites avant cette colonne : jamais rétro-calculée en silence.
  @Index()
  @Column('text', { nullable: true })
  content_hash: string | null

  // #2431.5 (reste, épopée #2886) — le LIEN DE VERSION. `archived_at` date le
  // remplacement (jamais une suppression, doctrine « on archive, on ne
  // supprime pas ») ; `replaced_by_id` pointe vers le NOUVEAU document.
  // `null`/`null` pour tout document jamais remplacé — la quasi-totalité des
  // lignes existantes et nouvelles. Migration 1796321507100.
  @Column('timestamptz', { nullable: true })
  archived_at: Date | null

  @Index()
  @Column('uuid', { nullable: true })
  replaced_by_id: string | null

  // #2861 (#2437.2, niveau SOURCE) — la langue ORIGINALE du document,
  // DÉCLARÉE au dépôt (`RagController.ingest`), jamais détectée. `null` =
  // non renseigné. Même catalogue que `contacts.locale`/`workspace.defaultLocale`
  // (GA-26). Contrainte SQL : `rag_documents_language_check` (migration
  // 1796322770000). Écrite par le service IA, qui persiste la ligne.
  @Column('text', { nullable: true })
  language: string | null

  // #3669.2 — ce que Bellum a RÉELLEMENT fait du document : `received` /
  // `processing` / `usable` / `partial` / `to_fix` (`RAG_PROCESSING_STATUSES`).
  // `NULL` = non évalué (lignes d'avant, jamais rétro-calculées). Contrainte
  // SQL : `rag_documents_processing_status_check` (migration 1796433906070).
  // Écrite par le service IA à l'ingestion.
  @Column('text', { nullable: true })
  processing_status: string | null

  // #3803 (3803.1) — l'ORIGINAL conservé (`storage_objects`, domaine
  // `rag_document_source`). `NULL` = non conservé : document déposé avant
  // #3803, ou rangement best-effort qui a échoué — l'aperçu le DIT.
  // FK `ON DELETE SET NULL` (migration 1796437500002) : un objet effacé ne
  // casse jamais la ligne, il la ramène à « original non conservé ».
  @Column('uuid', { nullable: true })
  source_object_id: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
