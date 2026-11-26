import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Une société de l'ESN — celle qui porte une mission et facturera le mois.
 *
 * Une ESN installée n'est presque jamais une seule société : une SAS de
 * conseil, une SARL de régie, parfois une filiale par pays. Les commerciaux, le
 * vivier et le pipe sont communs ; la facturation ne l'est pas.
 *
 * L'abonnement Bellum, lui, reste porté par l'ESPACE : un contrat, un pool de
 * crédits, un décompte de sièges. C'est délibérément hors de portée ici.
 */
@Entity({ name: 'legal_entities' })
@Index('legal_entities_workspace_idx', ['workspace_id', 'archived'])
export class LegalEntityEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  /** La raison sociale, telle qu'elle apparaîtra sur une facture. */
  @Column('text')
  name: string

  /** SIREN, numéro d'entreprise, EIN… Libre : toutes les juridictions n'ont pas
   *  le même, et exiger un format français refuserait une ESN belge. */
  @Column('text', { nullable: true })
  registration_number: string | null

  @Column('text', { nullable: true })
  country: string | null

  /** Numéro de TVA intracommunautaire. #2422.3. */
  @Column('text', { nullable: true })
  vat_number: string | null

  /** Adresse de facturation, en texte libre. #2422.3. */
  @Column('text', { nullable: true })
  address: string | null

  /** Devise de facturation, ISO-4217. #2422.3. */
  @Column('text', { nullable: true })
  currency: string | null

  /** Archivée plutôt que supprimée : elle a porté des missions réelles, et
   *  l'effacer rendrait illisible l'historique qui la nomme. */
  @Column('boolean', { default: false })
  archived: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
