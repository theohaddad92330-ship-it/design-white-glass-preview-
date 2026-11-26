import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { OutreachStepKind, OutreachStepStatus } from '@bellum/contracts'

/**
 * Une touche datée d'une séquence d'outreach (roadmap §8). `kind = 'email'`
 * PRÉPARE le brouillon (snapshoté dans `payload.email_draft`) et un rappel
 * « à envoyer » — l'envoi reste TOUJOURS un geste humain (garde-fous #394).
 * `reminder`/`task` = rappels internes datés.
 */
@Entity({ name: 'outreach_sequence_steps' })
export class OutreachSequenceStepEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  sequence_id: string

  @Column('integer')
  position: number

  @Column('timestamptz')
  due_at: Date

  @Column('text')
  kind: OutreachStepKind

  @Column('jsonb', { default: () => "'{}'::jsonb" })
  payload: Record<string, unknown>

  @Column('text', { default: 'pending' })
  status: OutreachStepStatus

  @Column('timestamptz', { nullable: true })
  done_at: Date | null

  /** #2909 (#2378.2) — signal d'ouverture/clic RAPPORTÉ par le commercial,
   *  jamais détecté automatiquement (`OUTREACH_ENGAGEMENT_SIGNALS`,
   *  `@bellum/contracts`). `null` = rien rapporté. */
  @Column('text', { nullable: true })
  engagement_signal: string | null

  @Column('timestamptz', { nullable: true })
  engagement_signal_at: Date | null
}
