import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Une entité du référentiel ESN — PARTAGÉE entre tous les espaces (tome 4, D62).
 *
 * ⚠️ Pas de `workspace_id`, et ce n'est pas un oubli : le registre public est le
 * même pour tout le monde. Ce qui appartient à un espace — la relation, son
 * étape, les besoins reçus, les marges — vit dans `partner_relations`.
 */
@Entity('esn_directory')
export class EsnDirectoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  /** Le nom BRUT du fichier d'origine, conservé même après résolution. */
  @Column({ name: 'input_name', type: 'text' })
  inputName!: string

  @Index({ unique: true })
  @Column({ name: 'normalized_name', type: 'text' })
  normalizedName!: string

  @Column({ name: 'seed_source', type: 'text', nullable: true })
  seedSource!: string | null

  @Column({ type: 'text', nullable: true })
  siren!: string | null

  @Column({ name: 'resolution_status', type: 'text', default: 'pending' })
  resolutionStatus!: string

  @Column({ name: 'resolution_reason', type: 'text', nullable: true })
  resolutionReason!: string | null

  @Column({ name: 'legal_name', type: 'text', nullable: true })
  legalName!: string | null

  @Column({ name: 'naf_code', type: 'text', nullable: true })
  nafCode!: string | null

  @Column({ name: 'created_on', type: 'date', nullable: true })
  createdOn!: string | null

  @Column({ name: 'size_class', type: 'text', nullable: true })
  sizeClass!: string | null

  @Column({ name: 'headcount_range', type: 'text', nullable: true })
  headcountRange!: string | null

  @Column({ name: 'headcount_tranche', type: 'text', nullable: true })
  headcountTranche!: string | null

  @Column({ name: 'headquarters_city', type: 'text', nullable: true })
  headquartersCity!: string | null

  @Column({ name: 'headquarters_department', type: 'text', nullable: true })
  headquartersDepartment!: string | null

  @Column({ name: 'establishment_count', type: 'int', nullable: true })
  establishmentCount!: number | null

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  establishments!: unknown[]

  @Column({ name: 'parent_siren', type: 'text', nullable: true })
  parentSiren!: string | null

  @Column({ name: 'parent_name', type: 'text', nullable: true })
  parentName!: string | null

  @Column({ name: 'relation_to_parent', type: 'text', nullable: true })
  relationToParent!: string | null

  @Column({ name: 'hierarchy_confidence', type: 'text', nullable: true })
  hierarchyConfidence!: string | null

  @Column({ name: 'hierarchy_evidence', type: 'text', nullable: true })
  hierarchyEvidence!: string | null

  @Column({ type: 'text', nullable: true })
  domain!: string | null

  @Column({ name: 'domain_status', type: 'text', nullable: true })
  domainStatus!: string | null

  @Column({ name: 'risk_flag', type: 'text', default: 'aucun' })
  riskFlag!: string

  @Column({ name: 'risk_evidence', type: 'text', nullable: true })
  riskEvidence!: string | null

  /** NULL tant que personne n'a regardé. « Aucun risque connu » et « on n'a pas
   *  vérifié » ne se lisent pas pareil, et seule cette date les distingue. */
  @Column({ name: 'risk_checked_at', type: 'timestamptz', nullable: true })
  riskCheckedAt!: Date | null

  @Column({ name: 'open_to_subcontracting', type: 'text', default: 'inconnu' })
  openToSubcontracting!: string

  @Column({ name: 'subcontracting_confidence', type: 'text', nullable: true })
  subcontractingConfidence!: string | null

  @Column({ name: 'subcontracting_evidence', type: 'text', nullable: true })
  subcontractingEvidence!: string | null

  @Column({ name: 'subcontracting_declared_at', type: 'date', nullable: true })
  subcontractingDeclaredAt!: string | null

  @Column({ name: 'subcontracting_sources_count', type: 'int', default: 0 })
  subcontractingSourcesCount!: number

  @Column({ name: 'hiring_90d', type: 'jsonb', nullable: true })
  hiring90d!: Record<string, unknown> | null

  @Column({ name: 'hiring_baseline', type: 'jsonb', nullable: true })
  hiringBaseline!: Record<string, unknown> | null

  @Column({ name: 'hiring_refreshed_at', type: 'timestamptz', nullable: true })
  hiringRefreshedAt!: Date | null

  @Column({ name: 'public_awards', type: 'jsonb', default: () => "'[]'::jsonb" })
  publicAwards!: unknown[]

  @Column({ name: 'public_exposure', type: 'text', nullable: true })
  publicExposure!: string | null

  @Column({ name: 'awards_refreshed_at', type: 'timestamptz', nullable: true })
  awardsRefreshedAt!: Date | null

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
