import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { ShortlistEntry } from '@bellum/contracts'

/** Une shortlist — ce qui a été proposé, et quand. Figée à la création. */
@Entity({ name: 'shortlists' })
@Index(['workspace_id', 'created_at'])
export class ShortlistEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('uuid', { nullable: true })
  need_id: string | null

  /** Recopié : le besoin peut être renommé, la shortlist doit rester lisible. */
  @Column('text', { default: '' })
  need_role: string

  @Column('text', { nullable: true })
  account_name: string | null

  @Column('text', { default: 'draft' })
  status: string

  @Column('uuid', { nullable: true })
  source_run_id: string | null

  /** La shortlist dont celle-ci est une copie — la seule façon de « modifier ». */
  @Column('uuid', { nullable: true })
  duplicated_from: string | null

  @Column('uuid', { nullable: true })
  created_by: string | null

  /** #2320.17 — les profils NON ÉVALUABLES du run, figés au moment de la
   *  création. `[]` = aucune inconnue à cette date, jamais une absence de
   *  revue. Migration `1796321343256`. */
  @Column('uuid', { array: true, default: () => "'{}'" })
  reviewed_unknown_ids: string[]

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

/** La fiche courte d'un profil, RECOPIÉE. Le vivier évolue, la proposition non. */
@Entity({ name: 'shortlist_entries' })
@Index(['shortlist_id', 'rank'])
export class ShortlistEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  shortlist_id: string

  @Column('uuid', { nullable: true })
  consultant_id: string | null

  @Column('integer')
  rank: number

  @Column('jsonb')
  snapshot: ShortlistEntry

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
