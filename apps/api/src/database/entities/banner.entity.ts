import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * An operator-scheduled banner / announcement. Created + toggled from the
 * backoffice (`dashboard-manager`) and read live by the front-ends: the user
 * app (`apps/web`) and the public website (`apps/website`). See the `banners`
 * table (migration 1786100000000).
 *
 * Content is bilingual (FR + EN) so the viewer's locale can be rendered. A
 * banner is shown by the public endpoint only when `active` AND now is within
 * `[starts_at, ends_at]` (null bound = open) AND the placement/audience match.
 * `version` is bumped on every operator save so a re-published banner defeats a
 * client-side dismissal keyed on `${id}:${version}`.
 */
@Entity({ name: 'banners' })
export class BannerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** 'announcement' | 'maintenance' | 'offer' (CHECK enforced in the DB). */
  @Column('text')
  kind: string

  /** Styling severity: 'info' | 'success' | 'warning' | 'critical'. */
  @Column('text', { default: 'info' })
  variant: string

  @Column('text')
  title_fr: string

  @Column('text')
  title_en: string

  @Column('text', { default: '' })
  body_fr: string

  @Column('text', { default: '' })
  body_en: string

  @Column('text', { nullable: true })
  cta_label_fr: string | null

  @Column('text', { nullable: true })
  cta_label_en: string | null

  @Column('text', { nullable: true })
  cta_url: string | null

  /** 'app' | 'website' | 'both'. */
  @Index()
  @Column('text', { default: 'app' })
  placement: string

  /** 'all' | 'authenticated' — a targeting hint, not a security boundary. */
  @Column('text', { default: 'all' })
  audience: string

  /** Lower scheduling bound (inclusive). NULL = no lower bound. */
  @Column('timestamptz', { nullable: true })
  starts_at: Date | null

  /** Upper scheduling bound (inclusive). NULL = no upper bound. */
  @Column('timestamptz', { nullable: true })
  ends_at: Date | null

  @Column('boolean', { default: true })
  dismissible: boolean

  /** Higher wins when several banners are active for the same placement. */
  @Column('integer', { default: 0 })
  priority: number

  @Index()
  @Column('boolean', { default: true })
  active: boolean

  /** Monotonic revision, bumped on every save (see service). Drives the
   *  client dismiss key so a re-published banner reappears. */
  @Column('integer', { default: 1 })
  version: number

  /** Free-text operator label (the backoffice has no end-user id). */
  @Column('text', { nullable: true })
  created_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
