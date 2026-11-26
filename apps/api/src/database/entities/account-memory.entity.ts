import type { AccountMemoryKind } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Un apprentissage retenu sur un compte — une objection entendue, un
 * engagement pris — écrit par la sortie `learnings` de la cascade compte
 * rendu (#2777). Table : `account_memory` (migration `1796321340147`).
 *
 * Append-only : aucune colonne de suppression, voir le docblock de la
 * migration pour la raison (YAGNI — aucun geste de correction n'existe
 * encore sur cette table).
 */
@Entity({ name: 'account_memory' })
export class AccountMemoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Index()
  @Column('uuid')
  account_id: string

  @Column('uuid')
  user_id: string

  @Column('text')
  kind: AccountMemoryKind

  @Column('text')
  content: string

  /** D'où vient cet apprentissage — `meeting` aujourd'hui. `null` = origine
   *  non tracée, jamais devinée. */
  @Column('text', { nullable: true })
  source: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
