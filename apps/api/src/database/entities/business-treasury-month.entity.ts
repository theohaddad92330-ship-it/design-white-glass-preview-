import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

/**
 * Un mois de trésorerie SAISI à la main (#1649).
 *
 * Aucune connexion bancaire n'existe, et en inventer une serait un chantier à
 * part. Deux minutes de saisie mensuelle débloquent le burn et le runway, les
 * deux chiffres qui décident si l'entreprise vit.
 *
 * ⚠️ LES QUATRE MONTANTS SONT NULLABLES ET LE RESTENT. Un mois non saisi produit
 * « non mesuré » partout, jamais une estimation, et aucun mois n'est pré-rempli
 * avec le précédent. Un `DEFAULT 0` ferait dire à un mois oublié qu'il n'a rien
 * dépensé — le mensonge le plus cher de toute cette table.
 *
 * ⚠️ `collected_cents` n'est pas dans le littéral de #1649, qui n'énumère que
 * trois champs. Sa formule, elle, en exige quatre : « burn = fixes + variables
 * − encaissements ». La raison de l'ajout, et pourquoi les encaissements ne se
 * DÉRIVENT pas du MRR, sont écrites en tête de
 * `modules/business-metrics/treasury.ts`.
 */
@Entity({ name: 'business_treasury_months' })
export class BusinessTreasuryMonthEntity {
  /** `YYYY-MM`. La contrainte SQL refuse tout autre format. */
  @PrimaryColumn('text')
  month: string

  /** Solde bancaire au 1er du mois. */
  @Column('integer', { nullable: true })
  bank_balance_cents: number | null

  /** Salaires, outils, hébergement. */
  @Column('integer', { nullable: true })
  fixed_expenses_cents: number | null

  /** Fournisseurs IA, ponctuel. */
  @Column('integer', { nullable: true })
  variable_expenses_cents: number | null

  /** Ce qui est RÉELLEMENT entré en caisse ce mois-là. */
  @Column('integer', { nullable: true })
  collected_cents: number | null

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  /** L'opérateur qui a saisi. `null` quand la porte n'a pas d'identité posée
   *  (`DM_ALLOWED_EMAILS` absente : la couche d'identité est inerte). */
  @Column('text', { nullable: true })
  updated_by: string | null
}
