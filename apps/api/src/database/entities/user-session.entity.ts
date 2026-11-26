import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * One row per (user, device) — the registry that powers the concurrent-device
 * cap (anti password-sharing). A device is a browser identified by the HttpOnly
 * `bellum_did` cookie. `revoked_at` set = the device was evicted (LRU beyond the
 * cap or manually signed out); its next `/auth/refresh` is rejected so it drops
 * out. `last_seen_at` drives both the LRU eviction order and the sessions list.
 */
@Entity({ name: 'user_sessions' })
@Index(['user_id', 'device_id'], { unique: true })
export class UserSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  user_id: string

  @Column('text')
  device_id: string

  @Column('text', { nullable: true })
  ip: string | null

  @Column('text', { nullable: true })
  user_agent: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @Column({ type: 'timestamptz', default: () => 'now()' })
  last_seen_at: Date

  @Column({ type: 'timestamptz', nullable: true })
  revoked_at: Date | null
}
