import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm'

/**
 * Les appels DÉJÀ journalisés dans le CRM.
 *
 * C'est la clé d'idempotence du versement : rejouer une semaine ne doit pas
 * déposer deux fois la même note. Le CRM ne dédoublonne pas pour nous, et une
 * fiche client couverte de doublons est exactement la plainte n°1 de l'audit
 * terrain (§5.1 « la double saisie, les fiches incomplètes »).
 */
@Entity({ name: 'telephony_call_logs' })
@Unique('telephony_call_logs_unique', ['workspace_id', 'provider', 'call_id'])
export class TelephonyCallLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('text')
  provider: string

  @Column('text')
  call_id: string

  @Column('text', { nullable: true })
  crm_note_id: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
