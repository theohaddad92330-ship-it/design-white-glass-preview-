import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Le dossier d'administration des ventes d'une mission — et RIEN d'autre.
 *
 * Table à part, comme `mission_commercial_terms` juste à côté : ces faits ne se
 * lisent ni ne s'écrivent au même moment que la fiche de mission, et une donnée
 * dont l'accès diffère du reste de la ligne se protège mal quand elle y vit.
 *
 * ⚠️ **Aucune colonne ne porte de moyen de paiement, et il n'y en aura pas.**
 * Bellum ne stocke aucun IBAN (`packages/contracts/src/schemas/admin-docs.ts`,
 * migration `1788900000005`, `tool-catalog.ts`). Le motif « RIB manquant » de la
 * maquette devient ici {@link payment_details_transmitted_at} : un ÉTAT et sa
 * date, qui suffit à relancer et n'exige de conserver aucun numéro.
 *
 * Chaque colonne déclarée ici existe dans la migration `1790979000001`, et
 * réciproquement — GA-36 : une colonne créée est une colonne déclarée.
 */
@Entity({ name: 'mission_adv_records' })
@Index(['mission_id'], { unique: true })
export class AdvRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  mission_id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  /**
   * La référence que le client exige de voir portée sur la facture — son numéro
   * fournisseur, sa référence de commande. `null` = personne ne l'a saisie ;
   * jamais une chaîne vide (la contrainte SQL le tient aussi).
   */
  @Column('text', { nullable: true })
  client_billing_reference: string | null

  /**
   * Les conditions de règlement, en JOURS. `null` = non renseignées.
   *
   * `0` est refusé en base : « comptant » ne se saisit pas ainsi, et confondre
   * les deux ferait passer une absence de saisie pour une condition négociée.
   */
  @Column('integer', { nullable: true })
  payment_terms_days: number | null

  /**
   * QUAND les coordonnées de règlement ont été transmises au client.
   *
   * `null` = jamais transmises — un motif de blocage, pas un silence. On ne
   * stocke ni le numéro, ni le document : seulement le fait et sa date.
   */
  @Column('timestamptz', { nullable: true })
  payment_details_transmitted_at: Date | null

  /**
   * L'entité de facturation CLIENTE (`account_entities`) à qui la facture
   * s'adresse. `uuid` nu, sans clé étrangère — comme `missions.legal_entity_id`
   * et `missions.site_id` : un identifiant qui ne résout plus se traite comme
   * une entité absente, c'est-à-dire un motif à réparer, pas une erreur.
   */
  @Column('uuid', { nullable: true })
  client_entity_id: string | null

  /** Qui a corrigé le dossier en dernier. `null` sur une ligne créée par le
   *  semis de démonstration, qui n'a pas d'auteur humain. */
  @Column('uuid', { nullable: true })
  updated_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
