import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  UniversalImportBreakdown,
  UniversalImportFormat,
  UniversalImportIssueKind,
  UniversalImportMapping,
  UniversalImportSheetPass,
  UniversalImportScope,
  UniversalImportStatus,
  UniversalImportType,
} from '@bellum/contracts'

/**
 * UN job d'import universel (Louis 27/09/2026). Raison complète : migration
 * `1796322824816-UniversalImport`.
 */
@Entity({ name: 'universal_import_jobs' })
@Index(['workspace_id', 'created_at'])
export class UniversalImportJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  /** Qui a lancé. Un AUTEUR, pas une clé de portée — c'est `workspace_id` qui isole. */
  @Column('uuid')
  user_id: string

  @Column('text')
  type: UniversalImportType

  @Column('text')
  format: UniversalImportFormat

  @Column('text')
  filename: string

  /** La fiche compte d'où l'import part — les contacts s'y rattachent. `null` = import d'espace. */
  @Column('uuid', { nullable: true })
  account_id: string | null

  @Column('text', { default: 'uploading' })
  status: UniversalImportStatus

  /** #2927 — où les lignes atterrissent : `workspace` (équipe) ou `personal` (leur auteur seul). */
  @Column('text', { default: 'workspace' })
  scope: UniversalImportScope

  @Column('integer')
  parts_expected: number

  @Column('integer', { default: 0 })
  parts_received: number

  /** Le mapping VALIDÉ par l'humain. `null` tant que le job n'est pas lancé. */
  @Column('jsonb', { nullable: true })
  mapping: UniversalImportMapping | null

  /** `null` tant que la lecture n'a pas atteint la fin du fichier — jamais un 0 inventé. */
  @Column('integer', { nullable: true })
  total_rows: number | null

  /** Le point de reprise : lignes dont le paquet est VALIDÉ (même transaction que les écritures). */
  @Column('integer', { default: 0 })
  committed_rows: number

  @Column('integer', { default: 0 })
  imported_count: number

  @Column('integer', { default: 0 })
  duplicate_count: number

  @Column('integer', { default: 0 })
  rejected_count: number

  /** #4051.2 — les rattachements que Bellum ne tranche pas seul (société à valider, homonyme…). */
  @Column('integer', { default: 0 })
  to_reconcile_count: number

  /** #4051.1 — le bilan PAR FAMILLE, écrit dans la transaction du paquet. */
  @Column('jsonb', { default: () => "'{}'::jsonb" })
  breakdown: UniversalImportBreakdown

  /** #4052.2 — le CRM d'origine déclaré : il borne les références source. `null` = non dit (« fichier »). */
  @Column('text', { nullable: true })
  source_system: string | null

  /** #4426.4 — l'onglet d'un classeur XLSX lu par l'import. `null` = le choix automatique (CSV/JSON : sans objet). */
  @Column('text', { nullable: true })
  sheet: string | null

  /**
   * #5223 — les feuilles d'un dépôt multi-feuilles : une passe chacune (correspondance, reprise, bilan).
   * `null` = une seule feuille, chemin d'avant.
   */
  @Column('jsonb', { nullable: true })
  sheet_passes: UniversalImportSheetPass[] | null

  /** Théo B c4.N1 — les lignes du fichier que l'humain a décidé de ne PAS importer à la vérification. */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  skipped_lines: number[]

  @Column('text', { nullable: true })
  error: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

/** Une ligne du rapport : doublon PROPOSÉ (jamais fusionné) ou ligne rejetée avec sa raison. */
@Entity({ name: 'universal_import_issues' })
@Index(['workspace_id', 'job_id', 'row_number'])
export class UniversalImportIssueEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  job_id: string

  /** Le numéro de ligne DU FICHIER (l'en-tête est la ligne 1). */
  @Column('integer')
  row_number: number

  @Column('text')
  kind: UniversalImportIssueKind

  @Column('text')
  reason: string

  @Column('uuid', { nullable: true })
  existing_id: string | null

  @Column('text', { nullable: true })
  label: string | null

  /** #5223 — la feuille de l'écart (dépôt multi-feuilles). `null` = une seule feuille. */
  @Column('text', { nullable: true })
  sheet: string | null
}
