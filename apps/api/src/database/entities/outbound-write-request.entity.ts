import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { WriteSource } from '@bellum/contracts'
import type { OutboundWriteKind, PreviewLine } from '../../modules/crm/outbound-write-preview'

/**
 * Une écriture CRM en attente de décision.
 *
 * Voir `1789910000004-OutboundWriteRequests` pour le pourquoi. En deux lignes :
 * l'ERP avait sa prévisualisation figée depuis le 03/08, le CRM écrivait en
 * direct — et une écriture déclenchée EN FOND partait sans que personne la voie.
 */
@Entity({ name: 'outbound_write_requests' })
export class OutboundWriteRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  requested_by: string

  @Column('text')
  provider: string

  @Column('text')
  kind: OutboundWriteKind

  @Column('jsonb')
  payload: Record<string, unknown>

  /** FIGÉE à la création : recalculer montrerait autre chose que ce qui a été relu. */
  @Column('jsonb')
  preview: PreviewLine[]

  /** `user` = quelqu'un a cliqué ; `system` = une routine l'a demandé et rien ne part seul. */
  @Column('text', { default: 'user' })
  origin: 'user' | 'system'

  @Column('text', { default: 'pending' })
  /**
   * ⚠️ `superseded` = REMPLACÉE par une révision (#1498), ni approuvée ni
   * refusée. L'écrire `rejected` dirait que quelqu'un a dit non, ce qui est faux
   * sur une file qu'on relit pour comprendre qui a autorisé quoi.
   * Ajouté EN FIN (GA-08), contrainte SQL élargie AVANT (migration 1791620000000).
   *
   * #1943.8 — `writing` = RÉCLAMÉE juste avant l'appel au fournisseur (une seule
   * écriture pour deux validations concurrentes) ; `unknown` = partie sans
   * réponse (un timeout n'est pas un échec : elle ne se retente pas). EN FIN,
   * contrainte élargie AVANT (migration 1792800022000).
   */
  state: 'pending' | 'approved' | 'rejected' | 'expired' | 'failed' | 'written' | 'superseded' | 'writing' | 'unknown'

  /** Un double clic ou un rejeu ne dépose pas deux fois la même note. */
  @Column('text', { nullable: true })
  idempotency_key: string | null

  @Column('uuid', { nullable: true })
  decided_by: string | null

  @Column('timestamptz', { nullable: true })
  decided_at: Date | null

  @Column('timestamptz')
  expires_at: Date

  /** La réponse du fournisseur, telle quelle. « On a essayé et ça n'est pas
   *  passé » est une information ; « rien ne s'est passé » n'en est pas une. */
  @Column('text', { nullable: true })
  provider_response: string | null

  @Column('timestamptz', { default: () => 'now()' })
  created_at: Date

  /**
   * #2855 — QUI/QUOI a composé la proposition (compte rendu, appel, routine,
   * MCP). `null` = geste direct de la personne, ou provenance non encore
   * tracée par l'appelant — jamais devinée après coup.
   */
  @Column('jsonb', { nullable: true })
  source: WriteSource

  /**
   * #2864 — reste du lot précédent : le collègue du MÊME espace à qui la
   * demande a été confiée (`OutboundWriteService.assign`, même règle que
   * `approval_requests.assigned_to`). `null` = circuit d'origine.
   */
  @Column('uuid', { nullable: true })
  assigned_to: string | null

  /**
   * #2856 — reste du lot précédent : reportée jusqu'à cette date
   * (`OutboundWriteService.snooze`, même règle que
   * `approval_requests.snoozed_until`). La demande reste `pending` (aucune
   * décision) et ne peut pas dormir au-delà de `expires_at` (CHECK SQL
   * `outbound_write_requests_snooze_before_expiry`).
   */
  @Column('timestamptz', { nullable: true })
  snoozed_until: Date | null

  /**
   * #2854 (#2201.9) — le LOT auquel cette demande appartient, quand elle a été
   * déposée avec d'autres via `OutboundWriteService.requestBatch()`. `null` =
   * demande seule, jamais « lot d'un seul élément » deviné : toutes les lignes
   * posées avant cette colonne n'ont jamais fait partie d'un lot.
   */
  @Column('uuid', { nullable: true })
  batch_id: string | null
}
