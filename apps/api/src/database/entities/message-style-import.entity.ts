import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { MessageStyleImportKind, MessageStyleSourceType } from '@bellum/contracts'

/**
 * #2369.2/.3 (épopée #2768) — l'import pour apprentissage : sa NATURE (sept
 * valeurs, #2369.3) et sa SOURCE admise (quinze valeurs, #2369.2).
 *
 * ⚠️ `raw_text` est le CORPS importé : stocké (journal), jamais renvoyé par
 * l'API (`messageStyleImportSchema`, `@bellum/contracts`, ne le porte pas) —
 * doctrine « le corps d'un message ne sort jamais vers un humain ni vers le
 * modèle ». `MessageStyleService.analyzeAndImport` le lit UNE fois pour
 * l'analyse déterministe (#2369.4), jamais pour un appel IA.
 */
@Entity({ name: 'message_style_imports' })
export class MessageStyleImportEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  /** Qui a importé ce message. */
  @Column('uuid')
  user_id: string

  @Column('text')
  import_kind: MessageStyleImportKind

  @Column('text')
  source_type: MessageStyleSourceType

  /** Le corps importé — jamais réexposé (voir note de tête). */
  @Column('text')
  raw_text: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
