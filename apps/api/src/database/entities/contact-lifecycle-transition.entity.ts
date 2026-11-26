import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Append-only journal of a contact's lifecycle passages (P0 « Contact states +
 * providers »). One row per state change détecté → identité vérifiée → qualifié
 * → enrichi → actionnable, recording the provider that drove it (`source`) and
 * the REAL time it happened (`occurred_at` = now() at insert — never a fabricated
 * date). This makes "détecté le X / vérifié le Y" traceable instead of recomputed.
 *
 * Immutable by design: rows are only ever inserted, never updated/deleted (a
 * contact deletion cascades via the FK). `from_state` is NULL for the first
 * (detection) row; `actor` is the acting user_id when known, NULL for a
 * pipeline/system transition.
 */
@Entity({ name: 'contact_lifecycle_transitions' })
export class ContactLifecycleTransitionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  contact_id: string

  @Column('text', { nullable: true })
  from_state: string | null

  @Column('text')
  to_state: string

  @Column('text', { nullable: true })
  source: string | null

  @Column({ type: 'timestamptz', default: () => 'now()' })
  occurred_at: Date

  @Column('text', { nullable: true })
  actor: string | null
}
