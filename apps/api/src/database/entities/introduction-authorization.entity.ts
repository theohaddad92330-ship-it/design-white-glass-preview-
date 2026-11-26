import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * La preuve d'autorisation d'une introduction, dans le temps (#2373.9,
 * LAU-FINAL-088 § PREUVES). Ligne d'audit — jamais corrigée, jamais
 * supprimée : `granted = false` (un refus) se conserve aussi.
 */
@Entity({ name: 'introduction_authorizations' })
@Index(['target_contact_id', 'workspace_id', 'authorized_at'])
export class IntroductionAuthorizationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  /** Le contact vers qui l'introduction mène. */
  @Column('uuid')
  target_contact_id: string

  /** Le référent, quand c'est un contact du CRM. */
  @Column('uuid', { nullable: true })
  referrer_contact_id: string | null

  /** Le référent, quand ce n'est PAS un contact CRM (ex. collègue du workspace). */
  @Column('text', { nullable: true })
  referrer_label: string | null

  /** `false` = refus, conservé comme preuve au même titre qu'un accord. */
  @Column('boolean')
  granted: boolean

  @Column('text')
  channel: string

  /** Le texte TEL QUEL de l'échange — jamais reformulé (même doctrine que
   *  `submission_feedback.verbatim`). */
  @Column('text', { nullable: true })
  text: string | null

  @Column('text', { nullable: true })
  scope: string | null

  @Column('text', { nullable: true })
  restrictions: string | null

  /** Quand l'autorisation (ou le refus) a réellement eu lieu — distinct de
   *  `created_at`, qui est quand ON l'a enregistrée. */
  @Column('timestamptz')
  authorized_at: Date

  @Column('uuid', { nullable: true })
  recorded_by: string | null

  /** #3403.7 — le type de lien déclaré (`LinkKind`), enfin persisté. `null` =
   *  ligne d'avant ce commit, ou saisie sans type. */
  @Column('text', { nullable: true })
  link_kind: string | null

  /** #3403.7 — vérifié au moment de la saisie. Défaut `false` : une ligne
   *  existante n'a jamais porté ce concept, l'affirmer vérifiée serait mentir. */
  @Column('boolean', { default: false })
  verified: boolean

  /** #3403.12 — chaleur relationnelle DÉCLARÉE (`RelationalWarmth`). `null` =
   *  non déclarée. Migration 1796425310417, CHECK sur les trois niveaux. */
  @Column('text', { nullable: true })
  warmth: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
