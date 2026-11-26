import type { EntityResolutionCorrection } from '@bellum/contracts'
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2284.67-.69 — une VERSION de la correction d'identité d'un compte, par
 * l'espace. Une ligne par geste, jamais mise à jour ni supprimée : la plus haute
 * version gagne, les autres restent (on archive, on ne supprime pas).
 * Migration `1796001468388-EntityResolutionCorrections`.
 */
@Entity({ name: 'entity_resolution_corrections' })
export class EntityResolutionCorrectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  /** L'espace qui a tranché. Jamais nul : c'est ce qui empêche la décision de fuiter. */
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string

  @Column({ name: 'version', type: 'integer' })
  version!: number

  @Column({ name: 'decision', type: 'text' })
  decision!: EntityResolutionCorrection['decision']

  @Column({ name: 'target_name', type: 'text' })
  targetName!: string

  @Column({ name: 'target_siren', type: 'text', nullable: true })
  targetSiren!: string | null

  @Column({ name: 'note', type: 'text', nullable: true })
  note!: string | null

  /** Qui a tranché. Une décision sans auteur ne peut pas se discuter. */
  @Column({ name: 'decided_by', type: 'uuid' })
  decidedBy!: string

  @Column({ name: 'decided_at', type: 'timestamptz' })
  decidedAt!: Date
}
