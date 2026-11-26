import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Une vue sauvegardée — les CRITÈRES d'un écran, jamais ses résultats.
 *
 * Une vue qui garderait des identifiants se périmerait le lendemain et
 * afficherait une liste qui ne correspond plus à son nom.
 */
@Entity({ name: 'saved_views' })
@Index(['workspace_id', 'scope', 'owner_id'])
export class SavedViewEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid', { nullable: true })
  owner_id: string | null

  @Column('text')
  scope: string

  @Column('text')
  name: string

  @Column('jsonb', { default: () => "'{}'::jsonb" })
  filters: Record<string, unknown>

  @Column('boolean', { default: false })
  shared: boolean

  /** #2151.3 — POURQUOI ce périmètre existe. `null` quand personne ne l'a dit. */
  @Column('text', { nullable: true })
  objective: string | null

  /** #2151.6 — `manual` par défaut : une alerte ne s'allume pas toute seule. */
  @Column('text', { default: 'manual' })
  alert_frequency: string

  /** #2151.12 — `null` = aucune alerte, ce qui n'est pas « dans l'application ». */
  @Column('text', { nullable: true })
  alert_channel: string | null

  /**
   * #2151.5 — CE QUE le périmètre ramène (`accounts` | `contacts` |
   * `needs_signals` | `partners`). `null` = personne ne l'a qualifié, ce qui
   * n'est pas « des comptes » : retomber sur une valeur attribuerait un choix
   * à qui n'en a fait aucun, et ce serait indiscernable d'un vrai choix.
   */
  @Column('text', { nullable: true })
  result_type: string | null

  /**
   * QUAND le propriétaire a demandé cette alerte — pas « si », mais « quand ».
   *
   * Une case dit qu'elle vaut `true` ; elle ne dit ni quand ni comment elle y
   * est passée — un `DEFAULT` de colonne l'a déjà remplie ailleurs dans cette
   * base (`weekly_digest`). Une DATE ne s'écrit que sur le chemin d'un geste,
   * et c'est ce qui rend le consentement opposable. `null` = non qualifié,
   * donc AUCUN envoi sortant. Lu par `isQualifiedOutboundConsent`.
   */
  @Column('timestamptz', { nullable: true })
  alert_consent_at: Date | null

  /**
   * #2151.7 — la dernière EXÉCUTION, jamais la date d'enregistrement.
   * `null` = jamais rejouée depuis qu'elle existe.
   */
  @Column('timestamptz', { nullable: true })
  last_run_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
