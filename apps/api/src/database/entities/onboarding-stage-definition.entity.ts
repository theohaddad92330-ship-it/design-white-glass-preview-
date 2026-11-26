import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Fixed catalog of onboarding stages. Seeded by migration; mutated only by
 * service-role connections. The `code` column is the natural key consumed by
 * the API (e.g. `time_1_identity`).
 */
@Entity({ name: 'onboarding_stage_definitions' })
export class OnboardingStageDefinitionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('text', { unique: true })
  code: string

  @Column('text')
  title: string

  @Column('integer', { unique: true })
  stage_order: number

  @Column('boolean', { default: true })
  is_required: boolean
}
