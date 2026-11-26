import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * Ce qu'UN abonné payait le mois où la photo a été prise (#1645).
 *
 * POURQUOI CETTE TABLE EXISTE, ALORS QUE LE TOTAL EST DÉJÀ FIGÉ À CÔTÉ
 * Un total ne suffit pas à décomposer le mois SUIVANT. « Nouveau » et
 * « expansion » ne se distinguent qu'en sachant QUI payait QUOI : sans ces
 * lignes, un départ suivi d'une arrivée au même montant se lirait comme un mois
 * sans mouvement, et l'écran raconterait exactement l'inverse de ce qui s'est
 * passé.
 *
 * ⚠️ Aucune ligne à zéro : quelqu'un qui ne paie plus n'est pas un client dont
 * le montant a chuté, c'est un départ. La contrainte SQL le tient.
 */
@Entity({ name: 'business_metric_snapshot_lines' })
export class BusinessMetricSnapshotLineEntity {
  /** `YYYY-MM` — le mois de l'instantané dont cette ligne fait partie. */
  @PrimaryColumn('text')
  month: string

  /** L'`user_id` de la ligne d'abonnement. Le sujet FACTURÉ, pas l'espace. */
  @PrimaryColumn('uuid')
  subject_id: string

  @Column('integer')
  mrr_cents: number
}
