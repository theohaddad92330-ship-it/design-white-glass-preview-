import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2439.15 — L'AUDIT DE CHAQUE EXPORT PERSONNEL.
 *
 * `GET /privacy/export` (tout) et `GET /privacy/export/object` (un objet)
 * n'écrivaient nulle part : un export RGPD est un accès à la TOTALITÉ des
 * données personnelles d'un compte, et rien n'en gardait la trace — ni qui,
 * ni quoi, ni quand. Le centre données exige « un export respecte … l'audit »
 * (#2439, LAU-FINAL-152) ; cette table est la moitié « on journalise ».
 *
 * Ligne d'audit = jamais corrigée, même choix que `ai_tool_call_audit_log`
 * (migration `1796321386200-PrivacyExportAuditLog`) : aucun `updated_at`.
 */
@Entity({ name: 'privacy_export_audit_log' })
@Index(['user_id', 'created_at'])
export class PrivacyExportAuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  user_id: string

  /** `full` (`GET /privacy/export`) ou `object` (`GET /privacy/export/object`). */
  @Column('text')
  kind: string

  /** La `payloadKey` de l'objet exporté — `null` pour un export `full`. */
  @Column('text', { nullable: true })
  object_key: string | null

  /** `csv` | `json` — `null` pour un export `full` (toujours JSON). */
  @Column('text', { nullable: true })
  format: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
