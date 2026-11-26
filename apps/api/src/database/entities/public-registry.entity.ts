import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #3916.a — une annonce d'un registre public (BODACC, ouvertures Sirene),
 * rattachée au SIREN. Table PARTAGÉE (fait de registre public) — voir la
 * migration `1796437900301-PublicRegistryAnnouncements`.
 */
@Entity('public_registry_announcements')
export class PublicRegistryAnnouncementEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('text')
  siren: string

  @Column('text')
  source: 'bodacc' | 'sirene' | 'decp' | 'rne'

  /** Identité stable de l'annonce dans sa source — l'écriture est idempotente dessus. */
  @Column('text')
  ref: string

  @Column('text')
  kind: string

  @Column('text', { nullable: true })
  family_label: string | null

  @Column('text', { nullable: true })
  label: string | null

  @Column('date')
  published_on: string

  @Column('text', { nullable: true })
  url: string | null

  @Column('text', { nullable: true })
  tribunal: string | null

  @Column('timestamptz', { default: () => 'now()' })
  collected_at: Date
}

/** #3916.a — jusqu'où chaque SIREN suivi a été lu, et quand. */
@Entity('public_registry_watch_state')
export class PublicRegistryWatchStateEntity {
  @PrimaryColumn('text')
  siren: string

  @Column('date', { nullable: true })
  bodacc_through: string | null

  @Column('timestamptz', { nullable: true })
  bodacc_checked_at: Date | null

  @Column('boolean', { default: false })
  bodacc_truncated: boolean

  @Column('timestamptz', { nullable: true })
  sirene_checked_at: Date | null

  /** #3920.8 — dernière lecture des marchés attribués ; `null` = jamais lus (le premier passage ne sonne pas). */
  @Column('timestamptz', { nullable: true })
  awards_checked_at: Date | null

  /** #3921.9 — dernière lecture des événements du registre national (RNE) ; `null` = jamais lus (le premier passage ne sonne pas). */
  @Column('timestamptz', { nullable: true })
  rne_checked_at: Date | null
}

/** Un établissement tel que le relevé Sirene du jour le porte. */
type SireneEstablishmentSnapshot = {
  siret: string
  isActive: boolean
  periodStartDate: string | null
  city: string
}

/**
 * #3921.a / #3921.b — un relevé Sirene, une ligne par (SIREN, jour). Table
 * PARTAGÉE — voir la migration `1796437900302-SireneSnapshots`.
 */
@Entity('sirene_snapshots')
export class SireneSnapshotEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('text')
  siren: string

  @Column('date')
  observed_on: string

  @Column('text', { default: 'registry_watch' })
  source: 'registry_watch' | 'esn_directory'

  /** Tranche d'effectif INSEE MESURÉE ce jour-là — `null` = non mesurée. */
  @Column('text', { nullable: true })
  headcount_range: string | null

  /** `null` = ce relevé n'a lu que l'effectif. */
  @Column('jsonb', { nullable: true })
  establishments: SireneEstablishmentSnapshot[] | null

  @Column('timestamptz', { default: () => 'now()' })
  collected_at: Date
}
