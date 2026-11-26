import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * L'instantané mensuel des chiffres de BELLUM (#1645) — figé, jamais recalculé.
 *
 * ⚠️ LES MOUVEMENTS SONT NULLABLES ET LE RESTENT. Le premier mois de la série
 * n'a pas de mois précédent : `mrr_start_cents` vaut alors NULL, et « nous
 * n'avions rien mesuré avant » n'est pas « nous avions zéro euro ». Mettre un
 * `0` ici transformerait une absence en fait, pour toujours — c'est la doctrine
 * « non mesuré n'est pas mesuré à zéro » appliquée à la comptabilité de
 * l'entreprise.
 *
 * ⚠️ LE MRR N'INCLUT QUE LE RÉCURRENT. Les clients sur facture ont leur propre
 * ligne, {@link contracted_revenue_cents}, affichée À CÔTÉ et jamais additionnée
 * sans le dire — un engagement annuel facturé en une fois n'est pas du MRR.
 */
@Entity({ name: 'business_metric_snapshots' })
export class BusinessMetricSnapshotEntity {
  /** `YYYY-MM`. La contrainte SQL refuse tout autre format. */
  @PrimaryColumn('text')
  month: string

  @Column('integer', { nullable: true })
  mrr_start_cents: number | null

  @Column('integer', { nullable: true })
  mrr_new_cents: number | null

  @Column('integer', { nullable: true })
  mrr_expansion_cents: number | null

  @Column('integer', { nullable: true })
  mrr_contraction_cents: number | null

  @Column('integer', { nullable: true })
  mrr_churned_cents: number | null

  /** Le seul chiffre toujours mesuré : ce qui était vrai à la prise de la photo. */
  @Column('integer')
  mrr_end_cents: number

  @Column('integer', { nullable: true })
  customers_start: number | null

  @Column('integer', { nullable: true })
  customers_new: number | null

  @Column('integer', { nullable: true })
  customers_churned: number | null

  @Column('integer')
  customers_end: number

  /** Les contrats sur facture RÉCURRENTS, ramenés au mois. Voir l'avertissement. */
  @Column('integer', { default: 0 })
  contracted_revenue_cents: number

  @Column('integer', { default: 0 })
  contracted_customers: number

  /** ⚠️ Jamais divisé par douze : un montant facturé une fois n'a pas
   *  d'équivalent mensuel, et lui en fabriquer un inventerait du récurrent. */
  @Column('integer', { default: 0 })
  one_off_cents: number

  @Column('integer', { default: 0 })
  one_off_customers: number

  @Column('timestamptz', { default: () => 'now()' })
  computed_at: Date
}
