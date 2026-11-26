import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Une note écrite à la main sur n'importe quel objet du CRM/ATS.
 *
 * Polymorphe (`entity_type` + `entity_id`) plutôt qu'une colonne par objet :
 * compte, contact, projet, consultant et mission appellent tous la même chose,
 * et la première clé étrangère dédiée en aurait entraîné cinq autres.
 *
 * Scope de lecture = `workspace_id` ; `user_id` reste l'auteur.
 */
@Entity({ name: 'notes' })
@Index(['entity_type', 'entity_id', 'created_at'])
export class NoteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('uuid')
  user_id: string

  @Column('text')
  entity_type: string

  @Column('uuid')
  entity_id: string

  @Column('text')
  body: string

  /** Épinglée en tête de fiche. Le reste s'affiche antéchronologiquement. */
  @Column('boolean', { default: false })
  pinned: boolean

  /** #2103.1 — le rendez-vous d'origine, quand cette note est un compte rendu
   *  né d'un événement d'agenda. `null` pour toute note écrite à la main. */
  @Column('text', { nullable: true })
  source_event_id: string | null

  /**
   * #3758 — l'instantané structuré (décisions, prochaines étapes, relance)
   * d'un compte rendu de rendez-vous, posé par `MeetingNotesService` SEULE.
   * `null` pour toute note qui n'est pas un compte rendu, ou un compte rendu
   * sans aucune des trois — jamais un objet vide (voir
   * `meetingRecapApprovalInput`, `@bellum/contracts`).
   */
  @Column('jsonb', { nullable: true })
  meeting_recap_snapshot: Record<string, unknown> | null

  /**
   * #3895 — les AUTRES comptes du même groupe pour lesquels l'auteur a dit que
   * la note vaut (migration `1796440244871`). Vide = la note est celle de son
   * seul compte ; jamais rempli par inférence.
   */
  @Column('uuid', { array: true, default: () => "'{}'" })
  also_applies_to_account_ids: string[]

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
