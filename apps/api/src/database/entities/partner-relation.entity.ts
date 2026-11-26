import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * MA relation avec une ESN — privée à l'espace (tome 4, D61).
 *
 * Le `siren` est un LIEN vers `esn_directory`, pas une clé étrangère : une ESN
 * rencontrée en rendez-vous entre dans le pipeline avant d'être résolue au
 * registre, et exiger le SIREN d'abord interdirait le geste le plus naturel.
 */
@Entity('partner_relations')
@Index(['workspaceId', 'stage'])
export class PartnerRelationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string

  @Column({ type: 'text', nullable: true })
  siren!: string | null

  @Column({ type: 'text' })
  name!: string

  @Column({ type: 'text', default: 'identifie' })
  stage!: string

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  roles!: string[]

  @Column({ name: 'contact_name', type: 'text', nullable: true })
  contactName!: string | null

  @Column({ name: 'contact_email', type: 'text', nullable: true })
  contactEmail!: string | null

  @Column({ type: 'text', nullable: true })
  notes!: string | null

  @Column({ name: 'needs_received_90d', type: 'int', default: 0 })
  needsReceived90d!: number

  @Column({ name: 'needs_given_90d', type: 'int', default: 0 })
  needsGiven90d!: number

  @Column({ name: 'placements_active', type: 'int', default: 0 })
  placementsActive!: number

  @Column({ name: 'placements_total', type: 'int', default: 0 })
  placementsTotal!: number

  @Column({ name: 'last_activity_at', type: 'timestamptz', nullable: true })
  lastActivityAt!: Date | null

  /**
   * Le cadre signé avec ce partenaire porte-t-il une clause de non-sollicitation
   * de ses clients finaux ?
   *
   * `null` = personne ne l'a déclarée, JAMAIS « il n'y en a pas ». Les deux ne
   * mènent pas à la même décision : l'un dit « va vérifier avant de contourner »,
   * l'autre dit « tu peux ». C'est cette colonne qui arme la première des deux
   * gardes dures de `partnerRelationScore` — la seconde se lit dans `roles`.
   */
  @Column({ name: 'non_solicitation', type: 'boolean', nullable: true })
  nonSolicitation!: boolean | null

  /**
   * #3270 (BEL-SC-241) — LE CADRE DE GOUVERNANCE RANG 2.
   *
   * Dix-sept colonnes additives (migration `PartnerRank2Governance1796373928559`),
   * lues par `partnerGovernanceReadiness` (`@bellum/contracts`). `null` = non
   * cadré, jamais une valeur devinée — voir le docblock de la migration.
   */
  @Column({ name: 'entry_door_scope', type: 'text', nullable: true })
  entryDoorScope!: string | null

  @Column({ name: 'accounts_accessible', type: 'text', array: true, nullable: true })
  accountsAccessible!: string[] | null

  @Column({ name: 'accounts_forbidden', type: 'text', array: true, nullable: true })
  accountsForbidden!: string[] | null

  @Column({ name: 'profiles_sought', type: 'text', array: true, nullable: true })
  profilesSought!: string[] | null

  @Column({ name: 'domains_covered', type: 'text', array: true, nullable: true })
  domainsCovered!: string[] | null

  @Column({
    name: 'margin_floor_percent',
    type: 'numeric',
    nullable: true,
    transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : Number(v)) },
  })
  marginFloorPercent!: number | null

  @Column({
    name: 'margin_share_percent',
    type: 'numeric',
    nullable: true,
    transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : Number(v)) },
  })
  marginSharePercent!: number | null

  @Column({ name: 'account_ownership', type: 'text', nullable: true })
  accountOwnership!: string | null

  @Column({ name: 'action_ownership', type: 'text', nullable: true })
  actionOwnership!: string | null

  @Column({ name: 'presentation_terms', type: 'text', nullable: true })
  presentationTerms!: string | null

  @Column({ name: 'payment_terms', type: 'text', nullable: true })
  paymentTerms!: string | null

  @Column({ name: 'delay_terms', type: 'text', nullable: true })
  delayTerms!: string | null

  @Column({ name: 'our_contact_name', type: 'text', nullable: true })
  ourContactName!: string | null

  @Column({ name: 'our_contact_email', type: 'text', nullable: true })
  ourContactEmail!: string | null

  @Column({ name: 'duration_terms', type: 'text', nullable: true })
  durationTerms!: string | null

  @Column({ name: 'exit_conditions', type: 'text', nullable: true })
  exitConditions!: string | null

  @Column({ name: 'referencing_proof', type: 'text', nullable: true })
  referencingProof!: string | null

  @Column({ name: 'confidentiality_level', type: 'text', nullable: true })
  confidentialityLevel!: string | null

  /** Un geste humain daté, jamais déduit (voir `deriveGovernanceStatus`). */
  @Column({ name: 'paused_at', type: 'timestamptz', nullable: true })
  pausedAt!: Date | null

  @Column({ name: 'paused_reason', type: 'text', nullable: true })
  pausedReason!: string | null

  @Column({ name: 'blocked_at', type: 'timestamptz', nullable: true })
  blockedAt!: Date | null

  @Column({ name: 'blocked_reason', type: 'text', nullable: true })
  blockedReason!: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
