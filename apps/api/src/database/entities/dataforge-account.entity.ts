import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Un compte du référentiel DATAFORGE V10 — PARTAGÉ entre tous les espaces.
 *
 * ⚠️ Pas de `workspace_id`, et ce n'est pas un oubli (GA-16) : le pack DATAFORGE
 * décrit le MARCHÉ (1 195 grands comptes français et leurs 66 domaines de
 * conseil), pas le portefeuille d'un client. Le stocker par espace multiplierait
 * la donnée par le nombre de clients pour un contenu identique — même décision
 * que `esn_directory` et `territory_snapshots`.
 *
 * La table est du STAGING : elle reçoit le CSV canonique tel quel (normalisé —
 * les colonnes `account__*` que le fichier répète 66 fois vivent ici UNE fois),
 * et rien d'utilisateur ne la lit directement. Ce qui en sort passe par
 * `DataforgeService`, qui applique les policies tier par tier.
 *
 * `resolution_status` : 4 comptes sur 1 195 arrivent avec un vrai SIREN (30
 * autres portent un marque-place « à compléter lot N », que le parseur refuse).
 * Le mapping DATAFORGE ↔ comptes Bellum se fait par SIREN résolu par NOUS
 * (doctrine tome 2 : jamais par nom), en tâche de fond par lots — la mécanique
 * exacte de `esn_directory`.
 */
@Entity('dataforge_accounts')
export class DataforgeAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  /** Version du pack (ex. `V10`) — deux versions coexistent pendant une reprise. */
  @Column({ name: 'data_version', type: 'text' })
  dataVersion!: string

  /** `bellum_account_source_id` du CSV — la clé DATAFORGE, jamais réécrite. */
  @Index({ unique: true })
  @Column({ name: 'source_id', type: 'text' })
  sourceId!: string

  @Column({ type: 'text' })
  name!: string

  @Column({ name: 'normalized_name', type: 'text' })
  normalizedName!: string

  @Column({ name: 'group_name', type: 'text', nullable: true })
  groupName!: string | null

  @Column({ type: 'text', nullable: true })
  sector!: string | null

  @Column({ name: 'cluster_id', type: 'text', nullable: true })
  clusterId!: string | null

  @Column({ name: 'cluster_primary_id', type: 'text', nullable: true })
  clusterPrimaryId!: string | null

  @Column({ name: 'is_cluster_primary', type: 'boolean', default: false })
  isClusterPrimary!: boolean

  @Column({ name: 'is_duplicate_variant', type: 'boolean', default: false })
  isDuplicateVariant!: boolean

  /** SIREN à 9 chiffres — dérivé du CSV quand il en porte un, sinon résolu par lots. */
  @Index()
  @Column({ type: 'text', nullable: true })
  siren!: string | null

  /** La valeur BRUTE `account__siren_siret` du fichier, conservée telle quelle. */
  @Column({ name: 'siren_siret_raw', type: 'text', nullable: true })
  sirenSiretRaw!: string | null

  @Column({ type: 'text', nullable: true })
  website!: string | null

  /**
   * La route achats recommandée vit au niveau COMPTE, pas domaine : mesuré sur
   * le CSV, elle est identique sur les 66 domaines de chacun des 1 195 comptes.
   * C'est le P0 du pack — un seed de recherche, jamais une preuve qu'un domaine
   * précis passe par cette route (`procurement_policy` le dit en toutes lettres).
   */
  @Column({ name: 'procurement_route', type: 'text', nullable: true })
  procurementRoute!: string | null

  @Column({ name: 'procurement_policy', type: 'text', nullable: true })
  procurementPolicy!: string | null

  @Column({ name: 'procurement_inheritance_warning', type: 'text', nullable: true })
  procurementInheritanceWarning!: string | null

  @Column({ name: 'market_role', type: 'text', nullable: true })
  marketRole!: string | null

  @Column({ name: 'research_tier', type: 'text', nullable: true })
  researchTier!: string | null

  @Column({ name: 'tier_a_domain_count', type: 'int', nullable: true })
  tierADomainCount!: number | null

  @Column({ name: 'tier_b_domain_count', type: 'int', nullable: true })
  tierBDomainCount!: number | null

  /** Tout le reste des colonnes `account__*` du CSV, brut et immuable. */
  @Column({ name: 'account_payload', type: 'jsonb', default: () => "'{}'::jsonb" })
  accountPayload!: Record<string, string>

  @Column({ name: 'resolution_status', type: 'text', default: 'pending' })
  resolutionStatus!: string

  @Column({ name: 'resolution_reason', type: 'text', nullable: true })
  resolutionReason!: string | null

  @Column({ name: 'legal_name', type: 'text', nullable: true })
  legalName!: string | null

  @Column({ name: 'naf_code', type: 'text', nullable: true })
  nafCode!: string | null

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
