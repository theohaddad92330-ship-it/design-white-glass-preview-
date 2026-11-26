import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { ApprovalState, AutomationLevel } from '@bellum/contracts'

/**
 * Une demande d'APPROBATION en attente d'un humain.
 *
 * L'approbation existait déjà, mais uniquement sous forme de clic dans l'instant :
 * une carte s'affichait, on cliquait, l'action partait. Rien n'en restait, rien
 * ne pouvait être délégué à un manager, et rien n'expirait. Or c'est précisément
 * ce que le rapport exige pour les actions à volume ou à dépense (p25) : une
 * demande qui survit à la fermeture de l'onglet, qu'un autre que son auteur peut
 * trancher, et qui périme.
 *
 * `summary` fige la prévisualisation au moment de la demande. Recalculer le
 * résumé à l'affichage ferait approuver autre chose que ce qui a été montré —
 * le dossier a pu changer entre-temps.
 */
@Entity({ name: 'approval_requests' })
@Index(['workspace_id', 'state'])
export class ApprovalRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Index()
  @Column('uuid')
  run_id: string

  /** Pas concerné, ou NULL quand l'approbation porte sur le run entier. */
  @Column('text', { nullable: true })
  step_key: string | null

  @Column('text')
  required_level: AutomationLevel

  @Index()
  @Column('text')
  state: ApprovalState

  @Column('uuid')
  requested_by: string

  @Column('uuid', { nullable: true })
  decided_by: string | null

  @Column('timestamptz', { nullable: true })
  decided_at: Date | null

  @Column('text')
  summary: string

  @Column('integer', { default: 0 })
  estimated_credits: number

  @Column('timestamptz')
  expires_at: Date

  @Column('text', { nullable: true })
  reason: string | null

  /**
   * #2864 — le collègue du MÊME espace à qui la demande a été confiée
   * (`canAssign`). NULL = circuit d'origine. La délégation désigne QUI regarde ;
   * elle ne change ni le niveau requis ni le résumé figé.
   */
  @Column('uuid', { nullable: true })
  assigned_to: string | null

  /**
   * #2856 — reportée jusqu'à cette date. La demande reste `pending` (aucune
   * décision), sort de la file active jusque-là, et ne peut pas dormir au-delà
   * de `expires_at` (CHECK SQL `approval_requests_snooze_before_expiry`).
   */
  @Column('timestamptz', { nullable: true })
  snoozed_until: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
