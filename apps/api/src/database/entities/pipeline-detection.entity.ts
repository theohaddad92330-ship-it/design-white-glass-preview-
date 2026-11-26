import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #4016 L6 — une ligne du pipe « détecté, à revoir » (migration
 * `1796440171265`). Écrite par le balayeur en `detected`, tranchée par un
 * humain (`decided_by`). Ce n'est NI une affaire, NI un positionnement, NI une
 * mission : c'est le passage que Bellum a vu, en attente d'un clic.
 */
@Entity({ name: 'pipeline_detections' })
@Index(['workspace_id', 'status', 'detected_at'])
export class PipelineDetectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  /** `PIPELINE_DETECTION_KINDS` — CHECK `pipeline_detections_kind_check`. */
  @Column('text')
  kind: string

  /** `PIPELINE_DETECTION_STATUSES` — `detected` à l'entrée, jamais écrit par le balayeur. */
  @Column('text', { default: 'detected' })
  status: string

  @Column('uuid')
  account_id: string

  @Column('text')
  label: string

  @Column('uuid')
  source_id: string

  /** L'unicité d'un passage : un rebalayage ne double rien, une ligne écartée ne revient pas. */
  @Column('text')
  source_key: string

  @Column('uuid', { nullable: true })
  project_id: string | null

  @Column('uuid', { nullable: true })
  need_id: string | null

  @Column('uuid', { nullable: true })
  consultant_id: string | null

  @Column('uuid', { nullable: true })
  submission_id: string | null

  /** L'affaire ou le positionnement créé à la confirmation ; `null` sinon. */
  @Column('uuid', { nullable: true })
  created_object_id: string | null

  @Column('timestamptz', { default: () => 'now()' })
  detected_at: Date

  @Column('timestamptz', { nullable: true })
  decided_at: Date | null

  @Column('uuid', { nullable: true })
  decided_by: string | null
}
