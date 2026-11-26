import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Le catalogue des motifs de perte d'un espace.
 *
 * Un motif en texte libre par commercial ne s'agrège jamais : « trop cher »,
 * « prix », « budget » et « pas le bon tarif » finissent en quatre lignes d'un
 * rapport qui ne dit rien. C'est pourtant la seule donnée qui explique pourquoi
 * on perd, et la seule que personne ne remplit si elle coûte un effort.
 *
 * Le catalogue appartient à l'ESPACE, pas au produit : les raisons de perdre
 * d'une ESN cyber ne sont pas celles d'une ESN data.
 */
@Entity({ name: 'loss_reasons' })
export class LossReasonEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('text')
  label: string

  @Column('integer', { default: 0 })
  sort_order: number

  /** Archivé plutôt que supprimé : les projets déjà perdus pour ce motif
   *  garderaient sinon une raison introuvable. */
  @Column('boolean', { default: false })
  archived: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
