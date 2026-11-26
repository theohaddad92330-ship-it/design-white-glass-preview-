import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Un lien OBSERVÉ entre une société de services et un client — PARTAGÉ (GA-16).
 *
 * C'est la table qui change la nature du produit : jusqu'ici, « quelles sociétés
 * de services sont sur ce compte » était une INFÉRENCE tirée de la presse et du
 * web. Ici, c'est une OBSERVATION — des parcours relient les deux organisations.
 *
 * ⚠️ Observer n'est pas constater une présence actuelle. Une ligne de cette
 * table ouvre un CHEMIN POTENTIEL à qualifier ; elle ne crée jamais un « accès
 * rang 2 connu », et le vocabulaire qui la rend est « observé », jamais
 * « en place », « travaille chez » ou « intervient chez ».
 *
 * Elle ENRICHIT `esnPresence`, elle ne le remplace pas : quand l'inférence
 * existante et l'observation concordent, la certitude monte ; quand elles
 * divergent, LES DEUX sont conservées et rendues, aucune ne l'emporte.
 *
 * `persons` est un COMPTAGE. Aucune identité ne traverse cette table.
 */
@Entity({ name: 'market_esn_client' })
@Index(['esnKey', 'clientKey'], { unique: true })
export class MarketEsnClientEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Index()
  @Column({ name: 'esn_key', type: 'text' })
  esnKey!: string

  @Column({ name: 'esn_name', type: 'text' })
  esnName!: string

  @Index()
  @Column({ name: 'client_key', type: 'text' })
  clientKey!: string

  @Column({ name: 'client_name', type: 'text' })
  clientName!: string

  /** Personnes dont le parcours relie les deux organisations. Jamais leurs noms. */
  @Column({ type: 'int' })
  persons!: number

  /** Pour l'audit seulement — aucune lecture produit ne rend cette étiquette. */
  @Column({ name: 'corpus_label', type: 'text' })
  corpusLabel!: string

  /**
   * #1615/#1616 — PROVENANCE DU PACK, ajoutée par
   * `1791940000000-MarketMemoryVersioning`. NULLABLE, même raison que sur
   * `market_company_signal` : les lignes déjà en base n'en portent aucune.
   */
  @Column({ name: 'dataset_version', type: 'text', nullable: true })
  datasetVersion!: string | null

  /** Sha256 hex de `08_esn_observees_chez_clients.csv`. */
  @Column({ name: 'source_checksum', type: 'text', nullable: true })
  sourceChecksum!: string | null

  /** Période COUVERTE par le corpus (`YYYY-MM-DD`), en TEXTE — voir
   *  `market-company-signal.entity.ts` pour la raison complète. */
  @Column({ name: 'period_start', type: 'text', nullable: true })
  periodStart!: string | null

  @Column({ name: 'period_end', type: 'text', nullable: true })
  periodEnd!: string | null

  /** Dernière ÉCRITURE par un run d'ingestion — ne bouge pas pour une ligne
   *  inchangée par un réimport. */
  @Column({ name: 'imported_at', type: 'timestamptz', nullable: true })
  importedAt!: Date | null

  /**
   * #1615.4/#1616.3 — TROIS COLONNES DE PLUS, ajoutées par
   * `1791941000000-MarketMemoryProvenance`. NULLABLE pour la même raison que
   * les cinq colonnes ci-dessus. `evidence_count` n'a PAS de colonne dédiée —
   * `persons` la porte déjà sur cette table ; `coverage` non plus — un taux
   * se calcule à la LECTURE (doctrine c65), il ne se fige pas à l'import.
   * Voir le commentaire de la migration.
   */
  @Column({ name: 'methodology_version', type: 'text', nullable: true })
  methodologyVersion!: string | null

  /** Constante `MARKET_MEMORY_SOURCE_FAMILY` — une seule famille de source
   *  existe aujourd'hui ; `null` pour les lignes écrites avant #1616.3. */
  @Column({ name: 'source_family', type: 'text', nullable: true })
  sourceFamily!: string | null

  /** L'URI de l'artefact source déclarée par `manifest.json` (ex. un lien
   *  Drive) — distincte de `source_checksum`, qui est l'empreinte du fichier. */
  @Column({ name: 'source_artifact_uri', type: 'text', nullable: true })
  sourceArtifactUri!: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
