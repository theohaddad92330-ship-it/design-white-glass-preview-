import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import type { OnboardingStatus } from '@bellum/contracts'

/**
 * Where each user currently sits in the onboarding flow. One row per user
 * (PK = `user_id`). `current_stage_id` is null only in `not_started` state;
 * the API moves it forward as the user advances.
 *
 * #2003.8/#2004 — `status` used to be typed locally as three values
 * (`not_started` | `in_progress` | `completed`), while the SQL `CHECK`
 * (migration `1793583494449-OnboardingStatusStates`) and
 * `onboardingStatusSchema` (`@bellum/contracts`) already carried all TWELVE.
 * That gap was the bug: `refresh_required` existed in the schema and the
 * constraint, and no TypeScript type even let a caller write it. The type now
 * comes straight from `onboardingStatusSchema` — one source of truth (GA-26)
 * — and `OnboardingService` (`ONBOARDING_TRANSITIONS`) is what decides which
 * of those twelve a given row may move to next.
 */
@Entity({ name: 'user_onboarding_state' })
export class UserOnboardingStateEntity {
  @PrimaryColumn('uuid')
  user_id: string

  @Column('uuid', { nullable: true })
  current_stage_id: string | null

  @Column('text')
  status: OnboardingStatus

  /**
   * Quand l'utilisateur a explicitement reporté le questionnaire.
   *
   * Un report N'EST PAS une complétion — c'est toute la distinction que le
   * §13 réclame. Sans cette colonne, la seule façon de ne pas renvoyer
   * indéfiniment quelqu'un vers le questionnaire était de considérer « ce
   * compte a déjà une offre » comme une preuve qu'il l'avait rempli. C'est ce
   * raccourci qui faisait sauter l'onboarding à tout compte bêta provisionné.
   */
  @Column('timestamptz', { nullable: true })
  skipped_at: Date | null

  /**
   * Temps 2 (le complément de profil) — trois horodatages, tous nullables,
   * dont l'état se dérive : snoozé jusqu'à / terminé le / refusé le. NULL
   * partout = « à proposer dès qu'une analyse est terminée », l'état de tous
   * les comptes existants. Migration 1787961204338.
   */
  @Column('timestamptz', { nullable: true })
  complement_snoozed_until: Date | null

  @Column('timestamptz', { nullable: true })
  complement_completed_at: Date | null

  @Column('timestamptz', { nullable: true })
  complement_dismissed_at: Date | null

  /**
   * #2897 (#2091.36) — la bannière « BellumAI a été repensé » fermée par
   * l'utilisateur. NULL = jamais fermée (tout compte existant, par
   * construction). Pas de report ni de « plus tard » : une fois fermée, elle
   * ne revient pas — même choix produit que `complement_dismissed_at`.
   */
  @Column('timestamptz', { nullable: true })
  redesign_banner_dismissed_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  /**
   * Théo O onboarding-relecture.N2 — quand la personne a explicitement validé
   * son cadrage, et l'empreinte (hex) des réponses qu'elle avait sous les yeux.
   * `null` tant qu'elle n'a pas validé. Valider n'autorise ni accès, ni dépense,
   * ni envoi : ce n'est qu'un fait, jamais une permission.
   */
  @Column({ type: 'timestamptz', nullable: true })
  framing_validated_at: Date | null

  @Column('text', { nullable: true })
  framing_validated_digest: string | null
}
