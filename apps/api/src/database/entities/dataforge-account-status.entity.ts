import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Le statut de sales-readiness ORION V12 d'un compte (`1_COMPTES/10_COMPTES_MASTER.csv`)
 * — PARTAGÉ (GA-16, même raison que `dataforge_accounts`) : c'est le marché,
 * pas le portefeuille d'un client.
 *
 * `source_id` rejoint `dataforge_accounts.source_id` (même espace `DF-XXXX`,
 * vérifié le 31/08/2026 sur `Société Générale` = `DF-0001` des deux côtés) —
 * mais SANS contrainte FK : le pack ORION peut être ingéré seul, avant ou sans
 * jamais lancer `ingest:dataforge` sur le CSV V10 brut à 158 colonnes.
 *
 * ⚠️ `penetrabiliteScore` est un ORDRE DE PASSAGE, jamais un verdict
 * (avertissement 7 — Jules et Pimkie sortaient à 84 et 76 avec une IT
 * externalisée à CGI par contrat de dix ans : le score était haut PARCE QUE la
 * donnée manquait). Toute lecture DOIT accompagner ce champ de
 * `coverageOutOfTwentyFour` — gardé par `orion-penetrabilite-jamais-nue.spec.ts`.
 */
@Entity('dataforge_account_statuses')
export class DataforgeAccountStatusEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'data_version', type: 'text' })
  dataVersion!: string

  /** `account_id` du CSV (`DF-XXXX`) — même espace que `dataforge_accounts.source_id`. */
  @Index({ unique: true })
  @Column({ name: 'source_id', type: 'text' })
  sourceId!: string

  @Column({ type: 'text', nullable: true })
  snapshot!: string | null

  @Column({ type: 'text', nullable: true })
  entreprise!: string | null

  @Column({ name: 'company_normalized_name', type: 'text', nullable: true })
  companyNormalizedName!: string | null

  @Column({ name: 'legal_name', type: 'text', nullable: true })
  legalName!: string | null

  @Column({ name: 'siren_siret', type: 'text', nullable: true })
  sirenSiret!: string | null

  @Column({ name: 'group_name', type: 'text', nullable: true })
  groupName!: string | null

  @Column({ type: 'text', nullable: true })
  sector!: string | null

  /** Ville — exception NOMMÉE de la doctrine « aucun critère protégé » (plus
   *  grossier que le code postal, jamais un critère de classement de personne :
   *  ceci décrit un COMPTE, pas une personne). */
  @Column({ type: 'text', nullable: true })
  city!: string | null

  @Column({ type: 'text', nullable: true })
  headquarters!: string | null

  @Column({ name: 'size_category', type: 'text', nullable: true })
  sizeCategory!: string | null

  @Column({ type: 'text', nullable: true })
  website!: string | null

  @Column({ name: 'account_market_role', type: 'text', nullable: true })
  accountMarketRole!: string | null

  /** Liste FERMÉE à 9 valeurs — voir `ORION_ACCOUNT_STATUT_CODES` et la
   *  contrainte CHECK `dataforge_account_statuses_statut_code_check`. */
  @Index()
  @Column({ name: 'statut_code', type: 'text' })
  statutCode!: string

  @Column({ name: 'statut_cible', type: 'text', nullable: true })
  statutCible!: string | null

  /** 0-100 — voir l'avertissement de classe ci-dessus. NE JAMAIS exposer seul. */
  @Column({ name: 'penetrabilite_score', type: 'real', nullable: true })
  penetrabiliteScore!: number | null

  @Column({ name: 'platform_consolidated', type: 'text', nullable: true })
  platformConsolidated!: string | null

  @Column({ name: 'platform_source', type: 'text', nullable: true })
  platformSource!: string | null

  @Column({ name: 'barriere_plateforme', type: 'boolean', default: false })
  barrierePlateforme!: boolean

  @Column({ name: 'barriere_publique', type: 'boolean', default: false })
  barrierePublique!: boolean

  @Column({ name: 'procurement_page', type: 'text', nullable: true })
  procurementPage!: string | null

  @Column({ name: 'supplier_portal', type: 'text', nullable: true })
  supplierPortal!: string | null

  @Column({ name: 'referencing_name', type: 'text', nullable: true })
  referencingName!: string | null

  @Column({ name: 'referencing_process_found', type: 'text', nullable: true })
  referencingProcessFound!: string | null

  @Column({ name: 'sales_accessibility_level', type: 'text', nullable: true })
  salesAccessibilityLevel!: string | null

  @Column({ name: 'sales_accessibility_score', type: 'real', nullable: true })
  salesAccessibilityScore!: number | null

  @Column({ name: 'account_potential_score', type: 'real', nullable: true })
  accountPotentialScore!: number | null

  @Column({ name: 'it_signal_score', type: 'real', nullable: true })
  itSignalScore!: number | null

  @Column({ name: 'procurement_visibility_score', type: 'real', nullable: true })
  procurementVisibilityScore!: number | null

  @Column({ name: 'data_confidence_score', type: 'real', nullable: true })
  dataConfidenceScore!: number | null

  @Column({ name: 'priority_level', type: 'text', nullable: true })
  priorityLevel!: string | null

  @Column({ name: 'recommended_entry_point', type: 'text', nullable: true })
  recommendedEntryPoint!: string | null

  @Column({ name: 'recommended_persona', type: 'text', nullable: true })
  recommendedPersona!: string | null

  @Column({ name: 'recommended_strategy', type: 'text', nullable: true })
  recommendedStrategy!: string | null

  @Column({ name: 'next_action', type: 'text', nullable: true })
  nextAction!: string | null

  @Column({ name: 'main_risk', type: 'text', nullable: true })
  mainRisk!: string | null

  /** ⚠️ NE JAMAIS sommer sur plusieurs comptes (avertissement 4 : héritage
   *  groupe → entité, facteur ~6,4 mesuré — la somme donne 67 455 pour 10 614
   *  contacts réels). */
  @Column({ name: 'internal_contacts_count', type: 'integer', nullable: true })
  internalContactsCount!: number | null

  @Column({ name: 'internal_missions_count', type: 'integer', nullable: true })
  internalMissionsCount!: number | null

  @Column({ name: 'internal_decideurs_count', type: 'integer', nullable: true })
  internalDecideursCount!: number | null

  @Column({ name: 'chaleur_interne', type: 'integer', nullable: true })
  chaleurInterne!: number | null

  @Column({ name: 'couverture_v9', type: 'integer', nullable: true })
  couvertureV9!: number | null

  @Column({ name: 'couverture_orion', type: 'integer', nullable: true })
  couvertureOrion!: number | null

  /** Champs renseignés sur 24 — accompagne TOUJOURS `penetrabiliteScore`. */
  @Column({ name: 'couverture_totale', type: 'integer', nullable: true })
  couvertureTotale!: number | null

  @Column({ name: 'jamais_enrichi', type: 'boolean', default: false })
  jamaisEnrichi!: boolean

  @Column({ name: 'est_doublon', type: 'boolean', default: false })
  estDoublon!: boolean

  @Column({ name: 'doublon_de', type: 'text', nullable: true })
  doublonDe!: string | null

  @Column({ name: 'v10_cluster_id', type: 'text', nullable: true })
  v10ClusterId!: string | null

  @Column({ name: 'v10_cluster_primary_id', type: 'text', nullable: true })
  v10ClusterPrimaryId!: string | null

  @Column({ name: 'v10_cluster_size', type: 'integer', nullable: true })
  v10ClusterSize!: number | null

  @Column({ name: 'enrichment_status', type: 'text', nullable: true })
  enrichmentStatus!: string | null

  @Column({ name: 'enrichment_batch', type: 'text', nullable: true })
  enrichmentBatch!: string | null

  @Column({ name: 'last_checked', type: 'text', nullable: true })
  lastChecked!: string | null

  @Column({ name: 'source_quality', type: 'text', nullable: true })
  sourceQuality!: string | null

  /** Le reste des 80 colonnes du CSV, brut — jamais dupliqué en champ typé. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload!: Record<string, string>

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
