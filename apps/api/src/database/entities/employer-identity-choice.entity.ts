import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * #4419.8 — l'entreprise qu'un commercial a CHOISIE parmi des homonymes, PAR ESPACE. Elle gagne toujours sur le
 * calcul. `name_key` = nom d'employeur sans casse, accents ni ponctuation. Voir la migration 1796610000417.
 */
@Entity({ name: 'employer_identity_choices' })
export class EmployerIdentityChoiceEntity {
  @PrimaryColumn('uuid')
  workspace_id: string

  @PrimaryColumn('text')
  name_key: string

  @Column('text')
  siren: string

  @Column({ type: 'text', nullable: true })
  legal_name: string | null

  @Column('uuid')
  chosen_by: string

  @Column({ type: 'timestamptz', default: () => 'now()' })
  chosen_at: Date
}
