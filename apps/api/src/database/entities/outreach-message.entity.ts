import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  DelegationScope,
  OutreachApprovalProof,
  OutreachIntent,
  OutreachMessageChannel,
  OutreachMessageStatus,
  OutreachSurface,
} from '@bellum/contracts'

/**
 * #2366.3 — MESSAGE_DRAFT, l'objet canonique partagé par toutes les surfaces
 * d'outreach. Le TEXTE ne vit pas ici : il vit dans `outreach_message_versions`
 * (une modification crée une version, #2366.10) et `current_version` désigne
 * celle qui fait foi.
 */
@Index('idx_outreach_messages_provider_thread', ['user_id', 'provider_thread_id'], {
  where: 'provider_thread_id IS NOT NULL',
})
@Entity({ name: 'outreach_messages' })
export class OutreachMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  /** L'owner du message. */
  @Column('uuid')
  user_id: string

  @Index()
  @Column('uuid')
  contact_id: string

  @Column('text', { default: 'email' })
  channel: OutreachMessageChannel

  @Column('text')
  intent: OutreachIntent

  @Column('text')
  source: OutreachSurface

  @Column('text', { nullable: true })
  reason: string | null

  @Column('text', { default: 'drafted' })
  status: OutreachMessageStatus

  @Column('integer', { default: 1 })
  current_version: number

  @Column('uuid', { nullable: true })
  sequence_id: string | null

  @Column('uuid', { nullable: true })
  sequence_step_id: string | null

  /** #2372.6 — l'asset joint à ce message, s'il en porte un (`outreach_assets`, le gate à la préparation). */
  @Column('uuid', { nullable: true })
  outreach_asset_id: string | null

  /** #2382.8 — la preuve d'approbation (auteur, date, version, audience, policy, coût, conditions). */
  @Column('jsonb', { nullable: true })
  approval: OutreachApprovalProof | null

  /** #2369.12 — le style appliqué à la préparation, snapshot de version. `null` ensemble = non relié. */
  @Column('uuid', { nullable: true })
  message_style_template_id: string | null

  @Column('integer', { nullable: true })
  message_style_template_version: number | null

  /**
   * #3234 — l'identifiant de message que le FOURNISSEUR a rendu à l'envoi
   * confirmé (jamais le corps). `null` : pas encore envoyé, ou fournisseur qui
   * n'en rend pas — on ne le devine pas.
   */
  @Column('text', { nullable: true })
  provider_message_id: string | null

  /** #3234 — l'identifiant de fil rendu avec lui ; la réponse entrante s'apparie dessus avant l'heuristique d'adresse. */
  @Column('text', { nullable: true })
  provider_thread_id: string | null

  /**
   * #4016 L5 — l'usage sous lequel ce message ATTEND un mandat signé (Laura,
   * relance d'impayé, suivi de rendez-vous, séquences de l'espace). `null` =
   * message ordinaire : seul un humain le valide (c81). Avec une portée, le
   * dispatcher le fait partir SEULEMENT si un mandat actif de cette portée le
   * couvre au moment de l'envoi — sinon il attend en relecture, comme avant.
   */
  @Column('text', { nullable: true })
  mandate_scope: DelegationScope | null

  /** #4016 L5 — quand est né le fait déclencheur : pas de mandat rétroactif. */
  @Column('timestamptz', { nullable: true })
  mandate_originated_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
