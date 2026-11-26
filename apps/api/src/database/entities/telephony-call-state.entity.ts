import type { CallInProgressState } from '@bellum/contracts'
import { Column, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm'

/**
 * #2403.12 — L'ÉTAT « APPEL EN COURS », PAR UTILISATEUR, AVEC EXPIRATION.
 *
 * Une ligne PAR MEMBRE de l'espace (`Unique` sur `workspace_id` + `user_id`) :
 * le webhook la met à jour, il n'en crée jamais une seconde. `expires_at` est
 * TOUJOURS posé, y compris sur `terminated` — un état qui ne périme jamais
 * serait un état qu'on doit nettoyer à la main, exactement le défaut qu'une
 * expiration existe pour éviter. Sur `in_progress`, elle protège aussi contre
 * un `call.ended` jamais reçu (outil en panne, webhook perdu) : Laura ne se
 * tait pas indéfiniment sur une supposition.
 */
@Entity({ name: 'telephony_call_states' })
@Unique('telephony_call_states_workspace_user', ['workspace_id', 'user_id'])
export class TelephonyCallStateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  user_id: string

  @Column('text')
  state: CallInProgressState

  /** L'identifiant d'appel côté outil — sert seulement l'idempotence, jamais affiché. */
  @Column('text')
  call_id: string

  @Column('timestamptz')
  expires_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
