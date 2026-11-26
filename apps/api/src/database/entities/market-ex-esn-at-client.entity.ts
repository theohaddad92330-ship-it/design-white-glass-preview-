import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Les anciens d'une société de services aujourd'hui chez un client — PARTAGÉ (GA-16).
 *
 * Ces personnes connaissent le client de l'intérieur ET le fonctionnement d'une
 * société de services. C'est la matière d'un rôle de champion.
 *
 * ⚠️ La table ne porte que des COMPTAGES par couple d'organisations. Aucun nom,
 * aucune coordonnée, aucun profil : « 9 anciens d'une même société de services
 * sont ici » se dit sans désigner personne, et c'est ce qui rend l'agrégat
 * partageable entre des espaces qui sont concurrents.
 *
 * ⚠️ Et un compte de champions ne se rend jamais comme une liste de personnes à
 * contacter : le produit ne propose personne, il dit qu'une porte existe.
 */
@Entity({ name: 'market_ex_esn_at_client' })
@Index(['esnOriginKey', 'clientKey'], { unique: true })
export class MarketExEsnAtClientEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Index()
  @Column({ name: 'esn_origin_key', type: 'text' })
  esnOriginKey!: string

  @Column({ name: 'esn_origin_name', type: 'text' })
  esnOriginName!: string

  @Index()
  @Column({ name: 'client_key', type: 'text' })
  clientKey!: string

  @Column({ name: 'client_name', type: 'text' })
  clientName!: string

  /** Comptage seul — jamais une identité. */
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

  /** Sha256 hex de `11_anciens_esn_chez_clients.csv`. */
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
