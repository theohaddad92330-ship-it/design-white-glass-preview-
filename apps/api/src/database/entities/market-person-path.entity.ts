import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Un PARCOURS individuel observé sur le marché — PARTAGÉ (GA-16), PSEUDONYMISÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Décision Louis 02/11/2026 (lot 775) : « tout mettre comme donnée sauf le nom et prénom et genre, num et adresse
 * mail ; pour le reste tu peux te servir de toutes les données ». Renversement PARTIEL et daté de GA-352 : la
 * table porte le poste, les dates, le statut, les compétences et le TJM d'une personne observée — jamais son
 * IDENTITÉ. Exclus (liste fermée, `market-memory-identifiers.ts`) : nom, prénom, nom complet, genre/civilité,
 * téléphone, e-mail, URL de profil, photo, adresse postale, date de naissance/âge. Retirés À LA LECTURE du CSV.
 *
 * `person_key` est un HMAC-SHA256 salé (clé `MARKET_MEMORY_PERSON_HASH_KEY`) : il relie les lignes d'une même
 * personne entre elles, sans permettre de remonter à elle. Il ne sort JAMAIS vers un écran.
 *
 * ⚠️ `city`/`region` sont le lieu de la MISSION, jamais l'adresse de la personne.
 */
@Entity({ name: 'market_person_paths' })
@Index(['rowKey'], { unique: true })
export class MarketPersonPathEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  /** Empreinte de la ligne (personne × entreprise × poste × début × fin) — rend l'import idempotent. */
  @Column({ name: 'row_key', type: 'text' })
  rowKey!: string

  @Index()
  @Column({ name: 'person_key', type: 'text' })
  personKey!: string

  /** Clé d'entreprise du corpus (`market_company_signal.company_key`), après résolution. */
  @Index()
  @Column({ name: 'company_key', type: 'text' })
  companyKey!: string

  @Column({ name: 'company_name', type: 'text', nullable: true })
  companyName!: string | null

  @Column({ name: 'match_key', type: 'text', nullable: true })
  matchKey!: string | null

  @Column({ type: 'text', nullable: true })
  siren!: string | null

  @Column({ name: 'job_title', type: 'text', nullable: true })
  jobTitle!: string | null

  @Column({ name: 'role_family', type: 'text', nullable: true })
  roleFamily!: string | null

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  skills!: string[]

  /** `YYYY-MM-DD` en TEXTE (même raison que `period_start` ailleurs) ; `start_precision` dit ce qu'elle vaut. */
  @Column({ name: 'start_date', type: 'text', nullable: true })
  startDate!: string | null

  @Column({ name: 'ended_on', type: 'text', nullable: true })
  endDate!: string | null

  @Column({ name: 'date_precision', type: 'text', nullable: true })
  datePrecision!: 'day' | 'month' | 'year' | null

  /** Poste tenu aujourd'hui ? (`positions.is_current_2024` du pack v2.1). `null` = la source ne le dit pas. */
  @Column({ name: 'is_current', type: 'boolean', nullable: true })
  isCurrent!: boolean | null

  /** freelance / esn / salarie / inconnu. */
  @Column({ name: 'work_status', type: 'text' })
  workStatus!: 'freelance' | 'esn' | 'salarie' | 'inconnu'

  /** ESN employeuse quand la mission passe par une ESN. */
  @Column({ name: 'esn_name', type: 'text', nullable: true })
  esnName!: string | null

  @Column({ name: 'esn_key', type: 'text', nullable: true })
  esnKey!: string | null

  /** TJM en euros par jour ; `null` = inconnu, jamais 0. */
  @Column({ name: 'daily_rate_eur', type: 'int', nullable: true })
  dailyRateEur!: number | null

  @Column({ name: 'mission_city', type: 'text', nullable: true })
  missionCity!: string | null

  @Column({ name: 'mission_region', type: 'text', nullable: true })
  missionRegion!: string | null

  @Column({ name: 'corpus_label', type: 'text' })
  corpusLabel!: string

  @Column({ name: 'dataset_version', type: 'text', nullable: true })
  datasetVersion!: string | null

  @Column({ name: 'source_checksum', type: 'text', nullable: true })
  sourceChecksum!: string | null

  @Column({ name: 'methodology_version', type: 'text', nullable: true })
  methodologyVersion!: string | null

  @Column({ name: 'source_family', type: 'text', nullable: true })
  sourceFamily!: string | null

  @Column({ name: 'source_artifact_uri', type: 'text', nullable: true })
  sourceArtifactUri!: string | null

  @Column({ name: 'period_start', type: 'text', nullable: true })
  periodStart!: string | null

  @Column({ name: 'period_end', type: 'text', nullable: true })
  periodEnd!: string | null

  @Column({ name: 'imported_at', type: 'timestamptz', nullable: true })
  importedAt!: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
