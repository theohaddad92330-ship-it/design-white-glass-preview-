import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { EsnProfileCorrectionRequestStatus } from '@bellum/contracts'

/**
 * #2018.7 — SIGNALER une information d'entreprise fausse SANS l'écraser
 * (migration `1789689873049-EsnProfileCorrectionRequests`).
 *
 * Jamais une valeur proposée : `field_key` + `reason` seulement. La
 * correction elle-même reste le geste de qui a `team:manage`, écrit sur
 * `PUT /esn-profile` — cette table ne touche jamais `esn_profiles`.
 */
@Entity({ name: 'esn_profile_correction_requests' })
@Index('esn_profile_correction_requests_workspace_idx', ['workspace_id', 'status'])
export class EsnProfileCorrectionRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  /** L'auteur du signalement — jamais celui qui corrige. */
  @Column('uuid')
  reporter_user_id: string

  /** La clé de `EsnAnswers` signalée, validée au service contre le contrat réel. */
  @Column('text')
  field_key: string

  @Column('text')
  reason: string

  @Column('text', { default: 'pending' })
  status: EsnProfileCorrectionRequestStatus

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @Column('timestamptz', { nullable: true })
  resolved_at: Date | null

  /** L'administrateur qui a tranché ; `null` tant que `status = 'pending'`. */
  @Column('uuid', { nullable: true })
  resolved_by: string | null
}
