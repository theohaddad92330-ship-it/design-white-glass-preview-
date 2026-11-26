import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * Where a merged-away contact went.
 *
 * Deduplication used to be silent: the loser row was deleted and its id stopped
 * resolving. Every link a rep had already put somewhere — a bookmark, a URL
 * pasted into an email, a shared "look at this contact" — died with it, showing
 * « Contact introuvable » for a person who very much still exists under a new
 * id.
 *
 * One row per merge, written in the same transaction as the delete. It is the
 * only trace that remains, so it is also the audit trail: `reason` records which
 * rule fired.
 */
@Entity({ name: 'contact_merges' })
export class ContactMergeEntity {
  /** The id that disappeared. Primary key: an id can only be merged away once. */
  @PrimaryColumn('uuid')
  loser_id: string

  /**
   * The surviving contact. Chains are possible (A→B, then B→C), so readers must
   * follow the pointer transitively rather than assume one hop.
   */
  @Index()
  @Column('uuid')
  winner_id: string

  /** Kept denormalised: the loser row is gone, so this is unrecoverable later. */
  @Column('uuid')
  account_id: string

  /** Which rule merged them, e.g. `migration:1786623491782`. */
  @Column('text')
  reason: string

  /**
   * The loser's name as stored at merge time. Not used to resolve anything — it
   * exists so a human auditing a suspicious merge can see what was collapsed
   * into what, without restoring a backup.
   */
  @Column('text', { nullable: true })
  loser_full_name: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  merged_at: Date
}
