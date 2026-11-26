import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { WorkspaceJoinRequestStatus } from '@bellum/contracts'

/**
 * #2016 — la demande d'accès d'un NON-membre à un espace existant
 * (migration `1795560000000-WorkspaceJoinRequests`).
 *
 * Aucune coordonnée n'est copiée ici : l'adresse du demandeur se relit sur son
 * profil au moment où un administrateur la regarde.
 */
@Entity({ name: 'workspace_join_requests' })
@Index('workspace_join_requests_workspace_idx', ['workspace_id', 'status'])
export class WorkspaceJoinRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  /** Le DEMANDEUR — jamais membre de `workspace_id` au moment de la demande. */
  @Column('uuid')
  user_id: string

  @Column('text', { default: 'pending' })
  status: WorkspaceJoinRequestStatus

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @Column('timestamptz', { nullable: true })
  decided_at: Date | null

  /** L'administrateur qui a tranché ; `null` pour « ce n'est pas mon entreprise ». */
  @Column('uuid', { nullable: true })
  decided_by: string | null
}
