import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type {
  InvoiceConnectorWriteState,
  InvoiceConnectorWritePreviewLine,
  InvoiceDocumentState,
} from '@bellum/contracts'

/**
 * #2565 — une tentative d'écriture d'UNE facture PRÉPARÉE dans l'outil de
 * gestion branché par le client (BEL-INT, retour François Thomas 17/09/2026).
 *
 * Mirroir volontaire d'`OutboundWriteRequestEntity` (porte CRM, BEL-INT-603) et
 * d'`AtsWriteRequestEntity` (porte ERP) — même grammaire d'états, même
 * séparation prévisualisation/réponse — mais SA PROPRE table : ni le CRM ni
 * l'ATS ne doivent voir apparaître une tentative de facturation dans leur file,
 * et le plafond du cliquet GA-07 (`module-boundaries.spec.ts`) interdit
 * d'importer leur SERVICE depuis ici. L'entité, elle, est un schéma partagé
 * (hors périmètre GA-07) : c'est elle qui porte la réutilisation.
 *
 * ⚠️ `provider` (l'identifiant technique de l'outil, ex. `'odoo'`) reste ICI et
 * ne traverse JAMAIS vers `InvoiceConnectorWriteRequestView` — un nom d'éditeur
 * ne se montre jamais à l'écran (le nom affiché vient de `connectedClientTools`,
 * `tool-naming.ts`, injecté côté client).
 */
@Entity({ name: 'invoice_connector_write_requests' })
@Index(['workspace_id', 'mission_id', 'period_month', 'created_at'])
export class InvoiceConnectorWriteRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  mission_id: string

  /** `YYYY-MM-01`, comme `invoice_readiness.period_month`. */
  @Column('date')
  period_month: string

  @Column('uuid')
  requested_by: string

  /** L'identifiant technique de l'outil connecté au moment de l'envoi (ex.
   *  `'odoo'`, `'qonto'`, `'tiime'`) — jamais exposé à l'écran (voir ci-dessus). */
  @Column('text')
  provider: string

  /** Ce qui part vers le connecteur. */
  @Column('jsonb')
  payload: Record<string, unknown>

  /** FIGÉE au moment de la demande — même règle que la porte CRM : recalculer
   *  au moment d'afficher montrerait autre chose que ce qui a été préparé. */
  @Column('jsonb')
  preview: InvoiceConnectorWritePreviewLine[]

  /**
   * `created` → `sent` → `invoiced` (SUR PREUVE) / `failed` (rejouable, une
   * NOUVELLE tentative peut repartir) / `unknown` (ARRÊTE — voir
   * `invoiceConnectorWriteIsReplayable`, jamais rejoué automatiquement).
   */
  @Column('text', { default: 'created' })
  state: InvoiceConnectorWriteState

  /** La référence rendue par le connecteur — écrite UNIQUEMENT quand `state`
   *  passe à `invoiced`, sur la réponse `ok: true` du port. Jamais devinée. */
  @Column('text', { nullable: true })
  invoice_reference: string | null

  /** Pourquoi un `failed` ou un `unknown` — un texte que CE service écrit,
   *  jamais la réponse brute d'un fournisseur (elle peut porter son nom). */
  @Column('text', { nullable: true })
  detail: string | null

  /**
   * #2418.2 — où en est le DOCUMENT chez le client : `accepted` / `rejected` /
   * `credited`. Un TROISIÈME axe, à côté de {@link state} (où en est NOTRE
   * écriture) et des quatre statuts d'encaissement (dérivés, jamais stockés) —
   * jamais mêlé à l'un ni à l'autre.
   *
   * `null` = on ne sait pas, et « on ne sait pas » n'est pas « rejetée ».
   * Écrit UNIQUEMENT sur preuve du connecteur, jamais par déduction : la
   * contrainte `…_document_evidence_check` exige les trois colonnes ensemble
   * ou aucune, en base et pas seulement en relecture.
   */
  @Column('text', { nullable: true })
  document_state: InvoiceDocumentState | null

  /** La référence du document chez l'outil, telle que le connecteur l'a rendue —
   *  LA preuve de {@link document_state}. Jamais devinée, jamais recopiée d'une
   *  autre colonne. */
  @Column('text', { nullable: true })
  document_state_reference: string | null

  /** Quand l'OUTIL l'a dit — pas quand nous l'avons lu, et jamais `now()` posé
   *  par défaut : une date de constat qu'on invente vaut une déduction. */
  @Column('timestamptz', { nullable: true })
  document_state_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
