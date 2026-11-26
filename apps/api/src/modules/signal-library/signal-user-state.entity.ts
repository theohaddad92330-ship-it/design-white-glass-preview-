import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { SignalUserState } from '@bellum/contracts'

/**
 * Théo A signaux.N2 — L'ÉTAT PERSONNEL D'UN SIGNAL (migration `SignalLibrary1796575001843`).
 *
 * Une ligne par (utilisateur, compte, fait) : enregistré · écarté · corbeille. Remettre un signal dans la
 * bibliothèque retire la LIGNE de préférence, jamais le signal lui-même (il vit dans `recent_signals`).
 * Le fait est désigné par sa clé normalisée (`signalStateKey`), pas par l'identifiant du flux, qui change
 * à chaque ré-analyse.
 */
@Entity({ name: 'signal_user_states' })
@Index('signal_user_states_once', ['user_id', 'account_id', 'signal_key'], { unique: true })
export class SignalUserStateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  user_id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('uuid')
  account_id: string

  @Column('text')
  signal_key: string

  @Column('text')
  state: SignalUserState

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
