import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type {
  DispatchFailureOutcome,
  DryRunReport,
  ImportMapping,
  ImportObject,
  ImportSessionState,
} from '@bellum/contracts'

/**
 * Une session d'import — voir `1789910000002-ImportSessions` pour le pourquoi.
 *
 * En une ligne : la simulation doit SURVIVRE au clic suivant pour que « apply
 * refuse sans dry-run » veuille dire quelque chose.
 */
@Entity({ name: 'import_sessions' })
export class ImportSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  created_by: string

  /** La clé de source du catalogue (`hubspot_export`, `talent_pool`…). */
  @Column('text')
  source: string

  @Column('text')
  object_type: ImportObject

  @Column('text', { default: 'draft' })
  state: ImportSessionState

  @Column('jsonb', { nullable: true })
  mapping: ImportMapping | null

  /** Le rapport FIGÉ. C'est lui, et pas un autre, qui autorise l'écriture. */
  @Column('jsonb', { nullable: true })
  report: DryRunReport | null

  @Column('timestamptz', { nullable: true })
  report_at: Date | null

  /** Les valeurs remplacées, gardées AVANT écriture. C'est ce qui rend l'annulation possible. */
  @Column('jsonb', { nullable: true })
  snapshot: { id: string; fields: Record<string, unknown>; created: boolean }[] | null

  /**
   * Le moment où cet import a ÉCRIT pour la dernière fois.
   *
   * ⚠️ Pas « le moment où il a réussi » : un import interrompu a écrit, et
   * c'est cette date que la fenêtre d'annulation mesure. `state` dit lequel des
   * deux c'est (`applied` ou `partial`) ; les deux ne se confondent pas.
   */
  @Column('timestamptz', { nullable: true })
  applied_at: Date | null

  @Column('timestamptz', { nullable: true })
  rolled_back_at: Date | null

  @Column('int', { default: 0 })
  created_count: number

  @Column('int', { default: 0 })
  updated_count: number

  @Column('text', { nullable: true })
  error: string | null

  /* -------------------------------------------------------------------------- */
  /*  LE POINT DE REPRISE — angle mort n°6 du tome 8 §33                        */
  /* -------------------------------------------------------------------------- */

  /**
   * Le nombre de lignes du fichier RÉELLEMENT écrites et durables.
   *
   * ⚠️ `null` veut dire « on ne sait pas », jamais « zéro ». Les deux autorisent
   * des gestes opposés : on reprend un import à zéro ligne écrite, on refuse de
   * le reprendre quand on ignore où il s'est arrêté. Un `default: 0` ferait de
   * l'ignorance une certitude, et la reprise redoublonnerait tout ce qui n'a pas
   * de clé — un contact sans adresse, que `writeContacts` ne dédoublonne que par
   * e-mail.
   */
  @Column('int', { nullable: true })
  processed_rows: number | null

  /** Le nombre de lignes que portait le fichier : « arrêté à la 4 000e sur 17 000 ». */
  @Column('int', { nullable: true })
  total_rows: number | null

  /** L'index de la ligne sur laquelle l'écriture s'est arrêtée. */
  @Column('int', { nullable: true })
  failed_at_row: number | null

  /**
   * Ce qu'on sait du sort de cette ligne — `dispatchFailureOutcome`, le seul
   * endroit du dépôt où ce classement vit.
   *
   * `failed` : rien n'est parti, la ligne est rejouable.
   * `unknown` : la requête est partie sans réponse — la reprise automatique
   * s'ARRÊTE, et c'est un humain qui tranche.
   */
  @Column('text', { nullable: true })
  resume_outcome: DispatchFailureOutcome | null

  /**
   * L'empreinte du fichier qui a été écrit.
   *
   * Sans elle, « reprendre à la ligne 4 000 » n'a pas de sens : un numéro de
   * ligne ne veut rien dire hors de SON fichier, et sauter 4 000 lignes d'un
   * autre fichier en perdrait 4 000, en silence.
   */
  @Column('text', { nullable: true })
  content_fingerprint: string | null

  @Column('timestamptz', { default: () => 'now()' })
  created_at: Date
}
