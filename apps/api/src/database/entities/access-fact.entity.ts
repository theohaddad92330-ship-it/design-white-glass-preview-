import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Un fait sur la façon d'entrer chez un compte (tome 1 §7 et §10.3).
 *
 * Chaque ligne porte sa SOURCE, sa DATE d'observation et sa PROVENANCE — les
 * trois choses sans lesquelles une information d'accès ne peut pas être
 * affichée honnêtement.
 */
@Entity('access_facts')
@Index(['account_id', 'kind'])
export class AccessFactEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  account_id: string

  @Column('uuid', { nullable: true })
  entity_id: string | null

  /** `lock` | `mode` | `cost` | `path`. */
  @Column('text')
  kind: string

  @Column('text')
  value: string

  @Column('text', { nullable: true })
  detail: string | null

  @Column('text')
  source: string

  /** `human` | `connector` | `pipeline` | `model`. Une correction humaine gagne
   *  sur une déduction, quelle que soit sa date. */
  @Column('text', { default: 'pipeline' })
  provenance: string

  /** La date à laquelle le fait était VRAI — pas celle de l'écriture. */
  @Column('timestamptz', { nullable: true })
  observed_at: Date | null

  /**
   * Le jour où la consultation de renouvellement se prépare (tome 1, F08).
   *
   * `null` = échéance inconnue, ce qui n'est PAS « imminent » : un marché sans
   * durée publiée n'alerte jamais, exactement comme une mission sans date de
   * fin ne prévient d'aucune libération.
   */
  @Column('date', { nullable: true })
  reopens_on: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
