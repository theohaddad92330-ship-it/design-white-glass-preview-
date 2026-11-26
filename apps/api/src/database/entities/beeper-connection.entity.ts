import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/** ⚠️ Élargir cette union DEMANDE d'élargir d'abord `beeper_connections_status_check` (GA-11 / GA-12). */
type BeeperConnectionStatus = 'pending' | 'connected'

/**
 * #4406.1 — le branchement PERSONNEL d'un utilisateur à son Beeper Desktop (Remote Access + tunnel).
 *
 * Les jetons (et le secret client éventuel) sont chiffrés AES-256-GCM (`crm-token.crypto`), jamais en
 * clair, jamais renvoyés au client, jamais journalisés. Aucun CORPS de message n'est stocké : les
 * conversations se lisent en direct (migration `1796570059737`).
 */
@Entity({ name: 'beeper_connections' })
@Index('beeper_connections_user_uidx', ['user_id'], { unique: true })
export class BeeperConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  user_id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  /** L'URL distante saisie (origine seule, sans chemin). */
  @Column('text')
  base_url: string

  /** L'utilisateur a déclaré un tunnel : http accepté, IP privées toujours refusées. */
  @Column('boolean', { default: false })
  tunnel_declared: boolean

  @Column('text', { default: 'pending' })
  status: BeeperConnectionStatus

  @Column('text', { nullable: true })
  client_id: string | null

  @Column('text', { nullable: true })
  client_secret_enc: string | null

  @Column('text', { nullable: true })
  authorization_endpoint: string | null

  @Column('text', { nullable: true })
  token_endpoint: string | null

  @Column('text', { nullable: true })
  revocation_endpoint: string | null

  @Column('text', { nullable: true })
  access_token_enc: string | null

  @Column('text', { nullable: true })
  refresh_token_enc: string | null

  @Column('timestamptz', { nullable: true })
  expires_at: Date | null

  @Column('text', { nullable: true })
  scope: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
