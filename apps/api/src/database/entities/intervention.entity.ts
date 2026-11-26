import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Ce qui remonte à un responsable.
 *
 * L'index unique `(espace, nature, sujet)` empêche qu'un même problème
 * réapparaisse à chaque balayage : une file qui se remplit toute seule devient
 * une seconde boîte de réception, et une seconde boîte de réception ne se lit
 * pas.
 */
@Entity({ name: 'interventions' })
@Index(['workspace_id', 'kind', 'subject_id'], { unique: true })
export class InterventionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  kind: string

  @Column('text')
  subject_type: string

  @Column('uuid')
  subject_id: string

  /** `null` = personne — et c'est déjà une information : un compte sans
   *  propriétaire n'est suivi par personne. */
  @Column('uuid', { nullable: true })
  owner_id: string | null

  /** Ce qui est arrivé, en une phrase, avec ses chiffres. */
  @Column('text')
  detail: string

  @Column('text', { default: 'open' })
  state: string

  @Column('timestamptz', { default: () => 'now()' })
  opened_at: Date

  @Column('timestamptz', { nullable: true })
  resolved_at: Date | null

  @Column('uuid', { nullable: true })
  resolved_by: string | null

  /** Motif de clôture (PDF 8 — clore exige un motif, accuser réception non).
   *  NULL = intervention simplement acquittée. */
  @Column('text', { nullable: true })
  decision_reason: string | null
}
