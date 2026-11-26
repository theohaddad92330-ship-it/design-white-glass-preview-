import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * #3298 (suite #3271.8) — LA MARQUE LÉGÈRE DE DERNIÈRE TENUE D'UN RITUEL.
 *
 * Une ligne PAR (espace, rituel), upsertée à chaque marquage — jamais une
 * séance : ni note, ni ordre du jour tenu, ni participants réels. « Date
 * suivante » (`nextRitualDate`, `ritual.ts`) se DÉRIVE de `held_at` et de la
 * cadence du catalogue, jamais saisie séparément.
 *
 * Voir la migration `1796378870001-WorkspaceRitualLastHeld` pour le
 * raisonnement complet et la contrainte `CHECK` sur `ritual_key`.
 */
@Entity({ name: 'workspace_ritual_last_held' })
@Index('workspace_ritual_last_held_workspace_ritual_idx', ['workspace_id', 'ritual_key'], { unique: true })
export class WorkspaceRitualLastHeldEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  /** Une des cinq clés RÉELLES du catalogue (`RITUAL_KEYS`). */
  @Column('text')
  ritual_key: string

  @Column('timestamptz')
  held_at: Date

  /** Qui l'a marqué. `uuid` nu : un membre parti ne bloque pas le ménage. */
  @Column('uuid', { nullable: true })
  held_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
