import type { TelephonyProvider } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm'

/**
 * Le standard téléphonique d'un espace de travail.
 *
 * `transcripts_enabled` par défaut à faux : lire une transcription engage le
 * consentement des deux parties à l'appel, et cette décision se prend en cochant
 * une case, jamais par oubli de configuration.
 */
@Entity({ name: 'telephony_connections' })
@Unique('telephony_connections_workspace', ['workspace_id'])
export class TelephonyConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  created_by: string

  @Column('text')
  provider: TelephonyProvider

  /** Chiffré AES-256-GCM (même crypto que les jetons CRM). Jamais relu par une route. */
  @Column('text')
  credentials_enc: string

  /**
   * #2403.12 — le secret du webhook « appel en cours », chiffré comme
   * `credentials_enc`. `null` tant que l'espace n'a jamais fait tourner
   * `POST /telephony/webhook-secret/rotate` : le webhook répond alors 503
   * plutôt que d'accepter un événement non vérifiable.
   */
  @Column('text', { nullable: true })
  webhook_secret_enc: string | null

  @Column('boolean', { default: false })
  transcripts_enabled: boolean

  /**
   * #4016 L12 — l'ESN a DÉCLARÉ que l'enregistrement des appels est annoncé aux
   * deux parties. Défaut faux : sans cette déclaration, aucun appel n'est
   * analysé. Se coche, jamais par oubli de configuration.
   */
  @Column('boolean', { default: false })
  recording_consent_announced: boolean

  /** Quand cette déclaration a été faite (`null` = jamais). */
  @Column('timestamptz', { nullable: true })
  recording_consent_announced_at: Date | null

  @Column('timestamptz', { nullable: true })
  last_used_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
