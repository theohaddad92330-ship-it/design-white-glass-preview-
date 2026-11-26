import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Une ligne compte × domaine du pack DATAFORGE V10 — PARTAGÉE (GA-16, même
 * raison que `dataforge_accounts` : un prior de marché est le même pour tous).
 *
 * 78 870 lignes = 1 195 comptes × 66 domaines. **97,5 % sont en Tier D** — des
 * priors sectoriels, jamais des faits. La règle qui gouverne toute lecture est
 * portée LIGNE PAR LIGNE par `user_claim_policy` et `scoring_policy`, écrites
 * par le pack lui-même :
 *
 *  · Tier A — exploitable avec source, périmètre et fraîcheur ;
 *  · Tier B — signal historique / externalisation, à rafraîchir avant usage ;
 *  · Tier C — activité ou relation, PAS une preuve d'achat ;
 *  · Tier D — hypothèse sectorielle : prior de scoring interne UNIQUEMENT,
 *    ne s'affiche jamais comme un fait (règle n°1 du dépôt : jamais de donnée
 *    inventée).
 *
 * Une valeur numérique illisible dans le CSV vaut `null`, jamais 0 — un score
 * absent n'est pas un score nul (leçon `ats-parse`).
 */
@Entity('dataforge_account_domains')
@Index('dataforge_account_domains_unique', ['sourceId', 'domainCode', 'dataVersion'], { unique: true })
export class DataforgeAccountDomainEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'data_version', type: 'text' })
  dataVersion!: string

  /** `bellum_account_source_id` — rejoint `dataforge_accounts.source_id`. */
  @Index()
  @Column({ name: 'source_id', type: 'text' })
  sourceId!: string

  @Column({ name: 'domain_code', type: 'text' })
  domainCode!: string

  /** A | B | C | D — liste FERMÉE, tenue par le parseur (une valeur inconnue écarte la ligne avec sa raison). */
  @Column({ name: 'evidence_tier', type: 'text' })
  evidenceTier!: string

  @Column({ name: 'evidence_status', type: 'text', nullable: true })
  evidenceStatus!: string | null

  @Column({ name: 'user_claim_policy', type: 'text', nullable: true })
  userClaimPolicy!: string | null

  @Column({ name: 'scoring_policy', type: 'text', nullable: true })
  scoringPolicy!: string | null

  @Column({ name: 'sector_prior_demand_score', type: 'real', nullable: true })
  sectorPriorDemandScore!: number | null

  @Column({ name: 'sector_prior_externalization_score', type: 'real', nullable: true })
  sectorPriorExternalizationScore!: number | null

  @Column({ name: 'public_activity_signal_score', type: 'real', nullable: true })
  publicActivitySignalScore!: number | null

  @Column({ name: 'demand_intensity_score', type: 'real', nullable: true })
  demandIntensityScore!: number | null

  @Column({ name: 'externalizable_demand_score', type: 'real', nullable: true })
  externalizableDemandScore!: number | null

  @Column({ name: 'internal_competition_score', type: 'real', nullable: true })
  internalCompetitionScore!: number | null

  @Column({ name: 'direct_access_score', type: 'real', nullable: true })
  directAccessScore!: number | null

  @Column({ name: 'mediated_access_score', type: 'real', nullable: true })
  mediatedAccessScore!: number | null

  @Column({ name: 'commercial_opportunity_score', type: 'real', nullable: true })
  commercialOpportunityScore!: number | null

  @Column({ name: 'data_confidence_score', type: 'real', nullable: true })
  dataConfidenceScore!: number | null

  @Column({ name: 'evidence_item_count', type: 'int', nullable: true })
  evidenceItemCount!: number | null

  @Column({ name: 'strongest_evidence_strength', type: 'text', nullable: true })
  strongestEvidenceStrength!: string | null

  /** TJM médian OBSERVÉ par le pack — jamais un TJM estimé (`null` sinon). */
  @Column({ name: 'median_observed_tjm', type: 'real', nullable: true })
  medianObservedTjm!: number | null

  @Column({ name: 'buyer_personas', type: 'text', nullable: true })
  buyerPersonas!: string | null

  @Column({ name: 'likely_contract_models', type: 'text', nullable: true })
  likelyContractModels!: string | null

  @Column({ name: 'qualification_or_barriers', type: 'text', nullable: true })
  qualificationOrBarriers!: string | null

  @Column({ name: 'evidence_summary', type: 'text', nullable: true })
  evidenceSummary!: string | null

  @Column({ name: 'evidence_sources', type: 'text', nullable: true })
  evidenceSources!: string | null

  @Column({ name: 'manual_verification_task', type: 'text', nullable: true })
  manualVerificationTask!: string | null

  /** Le reste des colonnes `domain__*` et `bellum_*` du CSV, brut et immuable. */
  @Column({ name: 'domain_payload', type: 'jsonb', default: () => "'{}'::jsonb" })
  domainPayload!: Record<string, string>

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
