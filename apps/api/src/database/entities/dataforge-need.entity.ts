import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * #4281.1 / #4282.5 — un BESOIN HISTORIQUE du référentiel DataForge (pack
 * ORION V12, `24_MISSIONS_BESOINS` / `25_PIPELINE_CRM`), structuré à
 * l'ingestion — migration `1796560603409-DataforgeNeeds.ts`.
 *
 * PARTAGÉE (GA-16) : un fait de marché. Le nom du pack ne sort jamais vers
 * l'écran ni le modèle (« base commune Bellum »).
 */
@Entity('dataforge_needs')
@Index(['sourceFile', 'needId'], { unique: true })
export class DataforgeNeedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'data_version', type: 'text' })
  dataVersion!: string

  /** `24_MISSIONS_BESOINS` | `25_PIPELINE_CRM` — CHECK côté migration. */
  @Column({ name: 'source_file', type: 'text' })
  sourceFile!: string

  @Column({ name: 'need_id', type: 'text' })
  needId!: string

  @Index()
  @Column({ name: 'account_source_id', type: 'text', nullable: true })
  accountSourceId!: string | null

  @Column({ type: 'text', nullable: true })
  entreprise!: string | null

  @Column({ type: 'text', nullable: true })
  title!: string | null

  @Column({ type: 'text', nullable: true })
  description!: string | null

  @Column({ type: 'text', nullable: true })
  domain!: string | null

  /** Liste FERMÉE `DATAFORGE_NEED_STATUSES` — le libellé du pack reste dans `statusRaw`. */
  @Column({ type: 'text', default: 'INCONNU' })
  status!: string

  @Column({ name: 'status_raw', type: 'text', nullable: true })
  statusRaw!: string | null

  @Column({ name: 'need_date', type: 'date', nullable: true })
  needDate!: string | null

  // `starts_on` / `ends_on` : la convention des missions (`missions.ends_on`) ; `end_date` n'existe
  // dans aucune migration, c'est ce qui permet à `hygiene-columns.spec.ts` d'attraper la faute du 22/08.
  @Column({ name: 'starts_on', type: 'date', nullable: true })
  startDate!: string | null

  @Column({ name: 'ends_on', type: 'date', nullable: true })
  endDate!: string | null

  @Column({ name: 'tjm_eur', type: 'real', nullable: true })
  tjmEur!: number | null

  @Column({ name: 'prescriber_name', type: 'text', nullable: true })
  prescriberName!: string | null

  @Column({ name: 'prescriber_title', type: 'text', nullable: true })
  prescriberTitle!: string | null

  @Column({ name: 'prescriber_last_seen', type: 'date', nullable: true })
  prescriberLastSeen!: string | null

  @Column({ type: 'text', nullable: true })
  location!: string | null

  /** Codes `RADAR_TECHNOLOGIES` — l'entrée du radar par technologie (#4282). */
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  technologies!: string[]

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload!: Record<string, string>

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
