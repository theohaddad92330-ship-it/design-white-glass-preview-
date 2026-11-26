import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * LE CONTRAT FACTOR — le tiers qui rachète la créance (31/08/2026).
 *
 * ⚠️ **Aucune coordonnée bancaire, et ce n'est pas un oubli.** Le dépôt porte,
 * écrite trois fois, la décision « Bellum ne signe rien, ne paie rien et ne
 * stocke aucun IBAN ». Le revirement du 31/08 lève le refus de PILOTER
 * l'affacturage ; il ne lève pas celui-là. Ce qu'il faut savoir pour piloter
 * tient en quatre champs : qui rachète, sous quelle référence, à quel taux,
 * jusqu'à quel plafond.
 *
 * ⚠️ `factor_name` est SAISI par l'utilisateur. Aucune liste de sociétés
 * d'affacturage n'est écrite dans le code : nommer un éditeur côté application
 * est refusé, et une liste déroulante de factors en serait une.
 */
@Entity({ name: 'factoring_contracts' })
export class FactoringContractEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  /** Le nom du factor, tel que l'ESN l'écrit. */
  @Column('text')
  factor_name: string

  /** La référence du contrat chez le factor. `null` = non saisie — et sans
   *  elle, un avis de règlement ne se rattache à rien. */
  @Column('text', { nullable: true })
  contract_reference: string | null

  /**
   * Le taux de commission en POINTS DE BASE (250 = 2,50 %).
   *
   * ⚠️ Un entier et non un flottant : `0.025` recopié d'un écran à une base
   * finit en `0.024999999999999998`, et une commission arrondie deux fois ne
   * tombe plus juste.
   *
   * `null` = personne ne l'a saisi, JAMAIS 0 — « 0 % de commission »
   * annoncerait un affacturage gratuit. `0` reste une valeur saisie légitime.
   */
  @Column('integer', { nullable: true })
  commission_rate_bps: number | null

  /** Le plafond d'encours accordé, en centimes. `null` = non saisi : un
   *  plafond inconnu n'est pas un plafond nul, et l'afficher à 0 ferait lire
   *  tout encours comme un dépassement. */
  @Column('bigint', { nullable: true })
  outstanding_limit_cents: string | number | null

  /** `active` | `suspended` | `ended` — le vocabulaire de
   *  `FACTORING_CONTRACT_STATES` (@bellum/contracts), tenu par la contrainte
   *  SQL `factoring_contracts_status_check`. */
  @Column('text', { default: 'active' })
  status: string

  @Column('date', { nullable: true })
  started_on: string | null

  /** Quand le contrat a pris fin. On ARCHIVE : les cessions transmises
   *  dessous gardent leur ligne et continuent de se réconcilier. */
  @Column('date', { nullable: true })
  ended_on: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
