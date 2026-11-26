import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { PlaybookSendState } from '@bellum/contracts'

/**
 * Une relance automatique — préparée, puis validée, puis partie.
 *
 * L'index unique `(espace, playbook, cible)` est ce qui rend « une relance
 * maximum par règle » vrai même quand le balayage est rejoué : pas de cadence,
 * pas d'escalade. Le plafond quotidien se lit sur la même table, par date.
 *
 * ⚠️ Depuis le 26/08/2026, la ligne est AUSSI la demande d'approbation. Elle est
 * posée avant que quoi que ce soit parte — comme avant — et porte l'état de la
 * décision. Une table séparée aurait dupliqué la clé d'idempotence, et deux clés
 * sur le même geste finissent par diverger : après quoi un client reçoit deux
 * fois la même relance.
 */
@Entity({ name: 'playbook_sends' })
@Index(['workspace_id', 'playbook', 'target_id'], { unique: true })
export class PlaybookSendEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  playbook: string

  @Column('uuid')
  target_id: string

  @Column('text')
  recipient: string

  /** Où en est la décision. `sent` est l'état des lignes d'avant l'approbation. */
  @Index()
  @Column('text', { default: 'sent' })
  state: PlaybookSendState

  /**
   * Le texte EXACT qui partira, figé au moment de la demande.
   *
   * Recomposer à l'approbation ferait valider un message et en envoyer un autre :
   * le dossier a pu changer entre-temps. NULL sur les lignes historiques, dont
   * personne n'a jamais eu à valider le contenu.
   */
  @Column('text', { nullable: true })
  subject: string | null

  @Column('text', { nullable: true })
  body: string | null

  /** À qui on demande : le propriétaire de la messagerie d'où partirait l'envoi. */
  @Column('uuid', { nullable: true })
  owner_id: string | null

  @Column('timestamptz', { nullable: true })
  expires_at: Date | null

  @Column('uuid', { nullable: true })
  decided_by: string | null

  @Column('timestamptz', { nullable: true })
  decided_at: Date | null

  @Column('text', { nullable: true })
  decision_reason: string | null

  /**
   * Quand c'est RÉELLEMENT parti.
   *
   * Distinct de `sent_at`, qui est la date de la LIGNE (`CreateDateColumn`) et
   * donc de la demande. Les deux divergent dès qu'un humain valide le lendemain,
   * et les confondre ferait dater un envoi du jour où on l'a préparé.
   */
  @Column('timestamptz', { nullable: true })
  dispatched_at: Date | null

  /**
   * #2856 — reste du lot précédent : reportée jusqu'à cette date
   * (`PlaybooksService.snooze`, même règle que
   * `approval_requests.snoozed_until`). PAS d'`assigned_to` sur cette table
   * (D58) : la messagerie d'où partirait le message est personnelle, jamais
   * confiée à un collègue — reporter ne fait que retirer la ligne de SA
   * PROPRE file. Ne peut pas dormir au-delà de `expires_at` quand elle est
   * connue (CHECK SQL `playbook_sends_snooze_before_expiry`).
   */
  @Column('timestamptz', { nullable: true })
  snoozed_until: Date | null

  @CreateDateColumn({ type: 'timestamptz', name: 'sent_at' })
  sent_at: Date
}
