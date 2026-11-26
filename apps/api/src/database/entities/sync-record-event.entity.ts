import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Ce qui est arrivé à UN enregistrement pendant un import.
 *
 * Répond à « d'où vient ce contact ? » et « pourquoi ce champ a-t-il changé ? »,
 * les deux questions qu'une équipe pose le lendemain d'une reprise. Sans ce
 * journal, la réponse est « l'import l'a fait », ce qui n'aide personne.
 *
 * Aucune clé étrangère vers `contacts` : le journal doit SURVIVRE à la
 * suppression de la fiche qu'il décrit — c'est précisément quand elle a disparu
 * qu'on cherche d'où elle venait.
 */
@Entity({ name: 'sync_record_events' })
@Index(['run_id', 'created_at'])
export class SyncRecordEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  run_id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  entity_type: string

  @Column('text')
  external_id: string

  @Index()
  @Column('uuid', { nullable: true })
  internal_id: string | null

  @Column('text')
  action: string

  /** Les champs réellement écrits. Vide sur un écart. */
  @Column('text', { array: true, default: () => "'{}'" })
  fields: string[]

  @Column('text', { nullable: true })
  reason: string | null

  /** #4189 — sur un conflit : par champ, la valeur Bellum GARDÉE et celle du CRM (proposée, jamais appliquée). */
  @Column('jsonb', { nullable: true })
  proposal: Record<string, { bellum: string | null; crm: string | null }> | null

  /** Théo D settings-integrations.N3 — les champs de l'écart dont l'utilisateur a gardé la valeur Bellum (ne se repropose plus). */
  @Column('text', { array: true, default: () => "'{}'" })
  kept_fields: string[]

  /** Théo D settings-integrations.N3 — le nom de la fiche au moment de l'écart (jamais inventé : `null` si non journalisé). */
  @Column('text', { nullable: true })
  entity_label: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
