import type { CrmDealAccountLinkBasis } from '@bellum/contracts'
import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm'

/**
 * Un deal du CRM, mis en cache pour être calculable.
 *
 * Le cache n'est pas une optimisation de confort : sans lui, produire un taux de
 * conversion trimestriel demanderait de relire des milliers de deals à chaque
 * ouverture d'écran, sur le quota d'API de l'utilisateur.
 *
 * `is_won` est nullable à dessein — voir la migration. Ouvert ⇒ inconnu, jamais
 * « perdu ».
 */
@Entity({ name: 'crm_deal_facts' })
@Unique('crm_deal_facts_unique', ['workspace_id', 'provider', 'deal_id'])
export class CrmDealFactEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('text')
  provider: string

  /** L'identifiant chez le fournisseur — texte, parce qu'aucun CRM ne promet un uuid. */
  @Column('text')
  deal_id: string

  @Column('text', { nullable: true })
  name: string | null

  @Column('text', { nullable: true })
  stage: string | null

  @Column('text', { nullable: true })
  stage_label: string | null

  @Column('text', { nullable: true })
  pipeline: string | null

  /** `numeric` côté base : un montant en flottant finit par afficher 1 999,99 €
   *  là où le CRM dit 2 000 €. TypeORM le rend en chaîne, le service reconvertit. */
  @Column('numeric', { nullable: true })
  amount: string | null

  @Column('text', { nullable: true })
  owner_id: string | null

  @Column('text', { nullable: true })
  owner_name: string | null

  @Column('timestamptz', { nullable: true })
  deal_created_at: Date | null

  @Column('timestamptz', { nullable: true })
  closed_at: Date | null

  /** #3918 — la dernière activité connue chez le fournisseur
   *  (`hs_lastmodifieddate`). `null` quand le fournisseur ne l'expose pas ou
   *  que le deal n'a jamais été modifié depuis sa création : le signal
   *  « affaire dormante » retombe alors sur `deal_created_at`, nommé comme
   *  tel par l'appelant plutôt que deviné. */
  @Column('timestamptz', { nullable: true })
  last_activity_at: Date | null

  @Column('boolean', { default: false })
  is_closed: boolean

  @Column('boolean', { nullable: true })
  is_won: boolean | null

  /** #3918.a — la société associée au deal CHEZ LE FOURNISSEUR : son id,
   *  son SIREN, son domaine. Les seules clés de la jointure deal → compte. */
  @Column('text', { nullable: true })
  company_external_id: string | null

  @Column('text', { nullable: true })
  company_siren: string | null

  @Column('text', { nullable: true })
  company_domain: string | null

  /** Lot 762 P5 — la raison sociale de la société associée CHEZ LE FOURNISSEUR, quand il la rend : clé de dernier
   *  recours du rattachement (nom normalisé, univoque dans l'espace seulement). */
  @Column('text', { nullable: true })
  company_name: string | null

  /** #3918.a — le compte rattaché par `resolveDealAccount`
   *  (crm-deal-account-link.ts), et la clé qui l'a rattaché. `null` = aucune
   *  clé ne joint, ou plusieurs comptes candidats : jamais deviné par le nom. */
  @Column('uuid', { nullable: true })
  account_id: string | null

  @Column('text', { nullable: true })
  account_link_basis: CrmDealAccountLinkBasis | null

  @Column('timestamptz', { default: () => 'now()' })
  synced_at: Date
}
