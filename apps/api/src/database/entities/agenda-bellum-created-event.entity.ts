import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * La preuve locale qu'un évènement agenda a été ÉCRIT par une des deux portes
 * qui créent réellement un évènement au nom de BellumAI :
 * `BriefingService.confirmSlotProposal` (un compte, voir la migration
 * `1796350021011-AgendaBellumCreatedEvent`) et `confirmFocusPlanBlock` (un
 * bloc du plan de journée, #2770.49/.50/.51, aucun compte — voir la migration
 * `1796350215111-AgendaBellumCreatedEventAccountOptional`). APPEND-ONLY :
 * aucune colonne `updated_at`, cette ligne ne se met jamais à jour.
 */
@Entity({ name: 'agenda_bellum_created_event' })
@Index(['user_id'])
export class AgendaBellumCreatedEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  user_id: string

  /** `null` pour un bloc de plan de journée (#2770.49/.50/.51) — pas de compte à nommer. */
  @Column('uuid', { nullable: true })
  account_id: string | null

  @Column('text')
  external_event_id: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
