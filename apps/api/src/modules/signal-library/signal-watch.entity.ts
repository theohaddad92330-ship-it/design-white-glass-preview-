import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { SignalNature, SignalWatchCadence, SignalWatchChannel, SignalWatchState } from '@bellum/contracts'

/**
 * Théo A signaux-veilles.N1 — UNE VEILLE PAR COMPTE (migration `SignalLibrary1796575001843`).
 *
 * Comptes suivis, natures (aucune = toutes), sujets, cadence, date de départ, fuseau, canal. La cadence règle la
 * fréquence des ALERTES : chaque passage relit ce que la collecte commune a déjà ramené, sans achat. « Supprimer »
 * ARCHIVE (`archived_at`) — les informations déjà collectées ne dépendent pas de la veille et ne bougent pas.
 */
@Entity({ name: 'signal_watches' })
@Index('signal_watches_workspace_idx', ['workspace_id'])
export class SignalWatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  user_id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  name: string

  @Column('uuid', { array: true })
  account_ids: string[]

  @Column('text', { array: true })
  natures: SignalNature[]

  @Column('text', { array: true })
  keywords: string[]

  @Column('text')
  cadence: SignalWatchCadence

  @Column('date')
  starts_on: string

  @Column('text')
  timezone: string

  @Column('text')
  channel: SignalWatchChannel

  @Column('boolean', { default: false })
  shared: boolean

  @Column('text', { default: 'active' })
  state: SignalWatchState

  @Column('timestamptz', { nullable: true })
  archived_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
