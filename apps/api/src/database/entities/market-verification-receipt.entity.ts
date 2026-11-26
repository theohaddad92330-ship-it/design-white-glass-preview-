import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2288.2 — le reçu d'une vérification à la demande : ce que CET espace a fait
 * vérifier, et quand. Voir la migration `MarketVerificationReceipts` pour la
 * raison de chaque colonne et des contraintes.
 *
 * ⚠️ Une ligne ne dit RIEN sur l'entreprise : elle dit ce que nous avons
 * demandé. Aucune colonne ne porte de score, de jugement ni de probabilité, et
 * aucune ne joint un compte — la mémoire marché et `accounts` n'ont aucun
 * identifiant commun, les rapprocher par le nom seul serait deviné.
 */
@Entity({ name: 'market_verification_receipts' })
@Index(['workspace_id', 'company_key'])
export class MarketVerificationReceiptEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  user_id: string

  /** Le consultant d'où la présélection est partie. Nullable : la fiche peut disparaître (RGPD). */
  @Column('uuid', { nullable: true })
  consultant_id: string | null

  /** Le libellé TEL QUE la mémoire marché l'a rendu, et tel que l'écran l'a envoyé. */
  @Column('text')
  company_name: string

  /** Le même libellé rapproché (`marketVerificationKey`) — casse et espaces de bord ignorés. */
  @Column('text')
  company_key: string

  @Column('timestamptz')
  verified_at: Date

  /** `verified` | `unknown` — contrainte `market_verification_receipts_outcome_check`. */
  @Column('text')
  outcome: string

  /** Le coût ANNONCÉ avant le geste. `null` = non mesuré, jamais 0 (GA-66). */
  @Column('int', { nullable: true })
  credits_announced: number | null

  /** Une correction humaine. Posée, elle gagne toujours — aucune vérification automatique ne la reprend. */
  @Column('uuid', { nullable: true })
  corrected_by_user_id: string | null

  @Column('timestamptz', { nullable: true })
  corrected_at: Date | null

  /** On archive, on ne supprime pas : une vérification remplacée garde sa ligne, datée. */
  @Column('timestamptz', { nullable: true })
  archived_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
