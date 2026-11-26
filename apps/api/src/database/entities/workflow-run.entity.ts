import { Column, CreateDateColumn, Entity, Index, UpdateDateColumn, PrimaryGeneratedColumn } from 'typeorm'
import type {
  ActionIntent,
  CardPreview,
  CardResult,
  LauraJobBrief,
  PendingChatAction,
  WorkflowRunStatus,
  WorkflowRunStep,
  WorkflowTrigger,
} from '@bellum/contracts'

/**
 * Une EXÉCUTION de workflow — l'objet métier qui manquait entre l'infrastructure
 * (BullMQ, outbox, corrélation) et le journal d'actions.
 *
 * Sans lui, une suite d'actions n'existait nulle part : le journal montrait cinq
 * lignes indépendantes, sans dire qu'elles venaient du même déclencheur, sans
 * permettre de reprendre là où ça s'était arrêté, et sans jamais totaliser ce
 * que la séquence avait coûté. Un run rassemble ces cinq lignes, porte son
 * `correlation_id`, et garde la VERSION de la définition qui l'a produit : une
 * définition modifiée demain ne réécrit pas l'histoire d'un run d'hier.
 *
 * Les pas vivent en JSONB plutôt qu'en table fille : ils n'ont pas de vie propre
 * (jamais lus hors de leur run, jamais joints, jamais filtrés côté SQL) et une
 * table de plus coûterait une jointure sur chaque lecture de l'Action Center.
 */
@Entity({ name: 'workflow_runs' })
@Index(['workspace_id', 'status'])
// #1931 (migration `CopilotCardsOnWorkflowRuns`) — mirrors `workflow_runs_conversation_turn_idx`.
@Index(['workspace_id', 'conversation_id', 'turn_id'])
export class WorkflowRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  /** Auteur du run — l'attribution, distincte du périmètre de lecture. */
  @Index()
  @Column('uuid')
  user_id: string

  @Column('text')
  definition_key: string

  @Column('integer')
  definition_version: number

  @Column('text')
  trigger: WorkflowTrigger

  @Index()
  @Column('text')
  status: WorkflowRunStatus

  @Column('uuid', { nullable: true })
  account_id: string | null

  @Column('uuid', { nullable: true })
  contact_id: string | null

  @Column('text')
  correlation_id: string

  /**
   * Clé d'idempotence de l'appelant. Unique PAR ESPACE : deux clics sur le même
   * bouton ne produisent qu'un run, mais deux espaces peuvent légitimement
   * utiliser la même clé (elle est choisie côté client).
   */
  @Column('text')
  idempotency_key: string

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  steps: WorkflowRunStep[]

  @Column('integer', { default: 0 })
  estimated_credits: number

  @Column('integer', { default: 0 })
  spent_credits: number

  @Column('timestamptz', { nullable: true })
  started_at: Date | null

  @Column('timestamptz', { nullable: true })
  finished_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  /**
   * #1931 (migration `CopilotCardsOnWorkflowRuns`) — the concrete intents the
   * runner dispatches, once a click resolves them. `null` until then; distinct
   * from `preview`, which is what a HUMAN sees before deciding.
   */
  @Column('jsonb', { nullable: true })
  intents: Partial<Record<string, ActionIntent>> | null

  /**
   * The eight-line preview (#1930) a copilot card shows before anyone clicks.
   * `null` is what lets `cardStateOf` (`@bellum/contracts`) tell "Suggérée"
   * (Laura just raised it) apart from "Préparée" (ready for a click) — both
   * are `status = 'planned'` otherwise.
   */
  @Column('jsonb', { nullable: true })
  preview: CardPreview | null

  /** The after-action result (#1931's "résultat / date / acteur / …"). `null` until something has happened. */
  @Column('jsonb', { nullable: true })
  result: CardResult | null

  /** Which thread this run's card came from, when it came from one. */
  @Column('text', { nullable: true })
  conversation_id: string | null

  /** Which turn in that thread — half of the card's stable key (see `copilotCardIdempotencyKey`). */
  @Column('uuid', { nullable: true })
  turn_id: string | null

  /** Rank among that turn's proposals — the other half of the card's stable key. */
  @Column('smallint', { nullable: true })
  proposal_index: number | null

  /** The reporter's target date. Meaningful only while `status = 'snoozed'`. */
  @Column('timestamptz', { nullable: true })
  snoozed_until: Date | null

  /**
   * #1931 L2 (migration `CopilotCardProposal`) — what Laura PROPOSED, verbatim
   * (`pendingChatActionSchema`). `intents` is what executes and `preview` what a
   * human reads; neither can rebuild the proposal, so « Modifier » (validate a
   * patch against the right card variant) and the card view (`action`) need it
   * kept. `null` for every run that is not a copilot card.
   */
  @Column('jsonb', { nullable: true })
  proposal: PendingChatAction | null

  /**
   * #2276 (migration `LauraJobOnWorkflowRuns`) — la FICHE d'un job composite de
   * Laura (`lauraJobBriefSchema`). `null` pour toute ligne qui n'est pas un job
   * (`trigger = 'laura_job'`).
   */
  @Column('jsonb', { nullable: true })
  job: LauraJobBrief | null
}
