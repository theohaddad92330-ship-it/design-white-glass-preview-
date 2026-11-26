import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * UN RÈGLEMENT REÇU DU FACTOR (31/08/2026) — la matière de la réconciliation.
 *
 * Bellum ne rapproche AUCUN compte bancaire : il consigne ce que quelqu'un
 * CONSTATE sur un avis de règlement. C'est la même honnêteté que « marquer
 * comme facturé ailleurs » et qu'« enregistrer le paiement » : le produit
 * enregistre un fait observé, il ne lit pas une banque.
 *
 * ⚠️ Une table à PART, et non une colonne sur la cession, pour deux raisons
 * mesurées : un avis de règlement couvre souvent PLUSIEURS cessions, et un
 * règlement arrive parfois avant qu'on sache à quoi le rattacher.
 */
@Entity({ name: 'factoring_settlements' })
export class FactoringSettlementEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  contract_id: string

  /**
   * La cession que ce règlement solde.
   *
   * ⚠️ `null` n'est PAS un défaut de saisie : c'est « reçu, pas encore
   * rapproché », et c'est l'objet même de la réconciliation. Le forcer à la
   * création obligerait à deviner un rattachement, ou à ne pas saisir le
   * règlement du tout — et l'argent reçu disparaîtrait de l'écran.
   */
  @Index()
  @Column('uuid', { nullable: true })
  assignment_id: string | null

  @Column('date')
  received_on: string

  /**
   * Ce qui est arrivé, en centimes.
   *
   * ⚠️ AUCUNE contrainte de signe, et c'est délibéré : une créance REPRISE par
   * le factor produit une ligne NÉGATIVE — de l'argent qui repart. La refuser
   * obligerait à effacer le règlement d'origine, c'est-à-dire à faire
   * disparaître le fait qu'il a eu lieu.
   */
  @Column('bigint')
  amount_cents: string | number

  /** La référence de l'avis de règlement du factor. C'est elle qui permet de
   *  retrouver la ligne dans le relevé du factor six mois plus tard. */
  @Column('text', { nullable: true })
  reference: string | null

  /** Qui l'a CONSTATÉ — immuable, posé à la création. */
  @Column('uuid')
  recorded_by: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
