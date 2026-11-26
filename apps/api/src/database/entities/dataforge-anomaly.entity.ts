import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Une anomalie du registre qualité ORION V12
 * (`6_QUALITE/60_ANOMALIES_ET_CORRECTIONS.csv`, 20 lignes dont 6 critiques —
 * mesuré le 31/08/2026 ; le pack et la demande initiale annonçaient 7, voir
 * `ORION_KNOWN_ANOMALY_CODES`).
 *
 * PARTAGÉE (GA-16) — c'est un défaut du RÉFÉRENTIEL, pas d'un client.
 *
 * ⚠️ Ce n'est pas de la documentation : chacune de ces 20 lignes a un miroir
 * `type_chunk = 'GARDE_FOU_QUALITE'` dans `dataforge_rag_chunks` (même `code`,
 * vérifié 1:1 par `orion-anomalies-rag-parity.spec.ts`) — c'est PAR LÀ qu'une
 * anomalie devient lisible depuis le produit (recherche RAG), pas seulement
 * depuis ce registre back-office.
 */
@Entity('dataforge_data_anomalies')
export class DataforgeAnomalyEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'data_version', type: 'text' })
  dataVersion!: string

  /** `anomalie_id` du CSV (`AN-XXX`) — stable, jamais réécrit. */
  @Index({ unique: true })
  @Column({ name: 'anomalie_id', type: 'text' })
  anomalieId!: string

  /** Code court, FERMÉ à la mesure — voir `ORION_KNOWN_ANOMALY_CODES`. C'est la
   *  clé de correspondance avec `dataforge_rag_chunks.titre`. */
  @Index({ unique: true })
  @Column({ type: 'text' })
  code!: string

  @Column({ type: 'text', nullable: true })
  portee!: string | null

  @Column({ type: 'text', nullable: true })
  objet!: string | null

  @Column({ type: 'text', nullable: true })
  constat!: string | null

  @Column({ name: 'impact_commercial', type: 'text', nullable: true })
  impactCommercial!: string | null

  @Column({ name: 'action_recommandee', type: 'text', nullable: true })
  actionRecommandee!: string | null

  /** CRITIQUE | MAJEUR | MINEUR — liste FERMÉE, contrainte CHECK côté migration. */
  @Index()
  @Column({ type: 'text' })
  severite!: string

  @Column({ type: 'text', nullable: true })
  source!: string | null

  @Column({ name: 'detecte_le', type: 'text', nullable: true })
  detecteLe!: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
