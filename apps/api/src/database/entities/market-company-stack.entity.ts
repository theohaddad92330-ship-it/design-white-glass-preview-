import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Une technologie OBSERVÉE chez une entreprise — PARTAGÉ (GA-16).
 *
 * Ce que les parcours passés par là ont cité. Le seuil du corpus est de DEUX
 * personnes : une citation unique n'est pas un environnement technique, c'est
 * une ligne de CV.
 *
 * ⚠️ Ne se présente JAMAIS comme la stack officielle de l'entreprise. La
 * formulation qui la rend est « cité par N parcours passés ici » — indirecte
 * par construction, parce que la mesure l'est.
 */
@Entity({ name: 'market_company_stack' })
@Index(['companyKey', 'techno'], { unique: true })
export class MarketCompanyStackEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Index()
  @Column({ name: 'company_key', type: 'text' })
  companyKey!: string

  /** Le libellé normalisé de la technologie. */
  @Column({ type: 'text' })
  techno!: string

  /** Parcours ayant cité cette technologie. Seuil de 2 à l'import. */
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

  /** Sha256 hex de `09_technos_par_entreprise.csv`. */
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
