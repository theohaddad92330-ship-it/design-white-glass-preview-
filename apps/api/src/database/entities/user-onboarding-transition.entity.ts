import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { OnboardingStatus } from '@bellum/contracts'

/**
 * #2004.12 — journal APPEND-ONLY d'audit de chaque changement RÉEL d'état de
 * l'onboarding (`user_onboarding_state.status`). Une ligne par transition
 * effectivement appliquée par `OnboardingService.transitionTo` — jamais pour
 * le seed initial (`not_started` n'a pas de prédécesseur), et jamais pour un
 * appel idempotent qui ne change rien (#2004.11 : même état demandé deux
 * fois = un seul effet, donc une seule ligne).
 *
 * `reason` porte le GESTE ou le déclencheur qui a causé la transition
 * (`advance_stage`, `complete`, `user_requested_refresh`…) — jamais une
 * dérivation devinée après coup (#2004.20 : le statut ne se déduit ni des
 * réponses, ni des crédits, ni de l'ancien `ProfileContext`).
 *
 * API-owned (pas de policy RLS, même choix que `target_lists` /
 * `1793700400000-TargetLists`) : ce journal n'est lu que par le backend,
 * jamais directement par un client Supabase.
 */
@Entity({ name: 'user_onboarding_transitions' })
@Index('user_onboarding_transitions_user_idx', ['user_id', 'created_at'])
export class UserOnboardingTransitionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  user_id: string

  @Column('text')
  from_status: OnboardingStatus

  @Column('text')
  to_status: OnboardingStatus

  @Column('text')
  reason: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
