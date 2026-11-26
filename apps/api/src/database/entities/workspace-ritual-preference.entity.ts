import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * BEL-SC-242 (#3271.10, .12) — un espace qui a choisi de MASQUER un rituel.
 *
 * Une ligne PAR (espace, rituel), créée seulement au premier changement :
 * aucune ligne = le rituel est affiché, comportement inchangé pour tout
 * espace qui n'a jamais rien réglé. `disabled`, jamais une suppression — « on
 * archive, on ne supprime pas » : le rituel reste dans `RITUAL_CATALOG`
 * (`ritual.ts`), nommé, réactivable.
 *
 * Voir la migration `1796374065850-WorkspaceRitualPreferences` pour le
 * raisonnement complet et la contrainte `CHECK` sur `ritual_key`.
 */
@Entity({ name: 'workspace_ritual_preferences' })
@Index('workspace_ritual_preferences_workspace_ritual_idx', ['workspace_id', 'ritual_key'], { unique: true })
export class WorkspaceRitualPreferenceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  /** Une des cinq clés RÉELLES du catalogue (`RITUAL_KEYS`). */
  @Column('text')
  ritual_key: string

  @Column('boolean', { default: false })
  disabled: boolean

  /** Qui l'a réglé. `uuid` nu : un membre parti ne bloque pas le ménage. */
  @Column('uuid', { nullable: true })
  updated_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
