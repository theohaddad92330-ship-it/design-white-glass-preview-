import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { OutreachActorKind } from '@bellum/contracts'

/**
 * #2366.8 — le journal des transitions de l'outreach, APPEND-ONLY. Les dix
 * champs de la spec : ancien/nouvel état, date, auteur, cause, preuve, outil,
 * permission, résultat, erreur. Même patron que `contact_lifecycle_transitions`
 * (date réelle à l'insertion, jamais fabriquée), étendu aux champs d'audit.
 * Une transition REFUSÉE s'écrit aussi (`result = 'refused'` + `error`) : un
 * refus qu'on ne trace pas ne se prouve pas.
 */
@Entity({ name: 'outreach_transitions' })
export class OutreachTransitionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('uuid')
  user_id: string

  @Column('text')
  subject_kind: 'message' | 'call_task' | 'sequence'

  @Index()
  @Column('uuid')
  subject_id: string

  @Column('text', { nullable: true })
  from_state: string | null

  @Column('text')
  to_state: string

  @Column({ type: 'timestamptz', default: () => 'now()' })
  occurred_at: Date

  @Column('uuid', { nullable: true })
  actor: string | null

  @Column('text')
  actor_kind: OutreachActorKind

  @Column('text')
  cause: string

  @Column('jsonb', { nullable: true })
  proof: Record<string, unknown> | null

  @Column('text', { nullable: true })
  tool: string | null

  @Column('text', { nullable: true })
  permission: string | null

  @Column('text')
  result: 'applied' | 'refused'

  @Column('text', { nullable: true })
  error: string | null
}
