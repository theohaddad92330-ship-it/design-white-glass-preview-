import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #4996 — la zone d'un membre sur un compte (responsable OU co-équipier actif) : une entité du CLIENT
 * (`entity_id`), une BU de NOTRE espace (`business_unit_id`, #4996.4) ou un texte libre (les deux null). Jamais
 * entité ET BU sur la même ligne (CHECK `account_team_scopes_entity_or_bu_check`). FILTRE et pré-assigne, ne bloque aucun geste.
 * AJOUT SEUL : retirer pose `removed_at`. `label` garde le nom quand l'entité est retirée.
 */
@Entity({ name: 'account_team_scopes' })
export class AccountTeamScopeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Index()
  @Column('uuid')
  account_id: string

  @Column('uuid')
  user_id: string

  @Column('uuid', { nullable: true })
  entity_id: string | null

  /** #4996.4 — la BU de l'espace (`business_units`). Migration `1796650000000-AccountTeamScopesBusinessUnit`. */
  @Column('uuid', { nullable: true })
  business_unit_id: string | null

  @Column('text')
  label: string

  @Column('uuid')
  added_by: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @Column('timestamptz', { nullable: true })
  removed_at: Date | null

  @Column('uuid', { nullable: true })
  removed_by: string | null
}
