import type { WorkspaceMergeItemOutcome, WorkspaceMergeStatus, WorkspaceMergeTable } from '@bellum/contracts'
import type { WorkspaceMergeRequestEntity } from '../../database/entities/workspace-merge.entity'
import type { DuplicateLookupKeys, MergeAccountRow, MergeContactRow } from './workspace-merge.plan'

/**
 * #4158.57 — tout ce que le rapatriement lit et écrit, derrière UNE interface. Chaque méthode reçoit
 * l'espace qu'elle borne : la source (lecture seule) ou la cible (ajout seulement). Aucune méthode ne
 * prend une liste d'espaces, aucune ne met à jour une ligne existante de l'espace cible (condition g).
 */
export type MergeWorkspaceRow = {
  id: string
  name: string
  ownerUserId: string
  isDemo: boolean
  archivedAt: Date | null
  memberCount: number
}

export type MergeRequestRecord = Pick<
  WorkspaceMergeRequestEntity,
  | 'id'
  | 'workspace_id'
  | 'source_workspace_id'
  | 'requested_by'
  | 'status'
  | 'preview'
  | 'preview_hash'
  | 'user_validated_at'
  | 'admin_validated_by'
  | 'admin_validated_at'
  | 'rejected_by'
  | 'rejected_at'
  | 'started_at'
  | 'finished_at'
  | 'last_error'
  | 'created_at'
>

export type MergeRecordedItem = {
  table: WorkspaceMergeTable
  sourceId: string
  targetId: string | null
  outcome: WorkspaceMergeItemOutcome
}

/** Ce qu'une étape du job écrit : UNE ligne de journal, et sa copie quand elle est `copied`. */
export type MergeStep = {
  requestId: string
  sourceWorkspaceId: string
  targetWorkspaceId: string
  table: WorkspaceMergeTable
  sourceId: string
  outcome: WorkspaceMergeItemOutcome
  /** La fiche existante (doublon proposé), jamais écrite. */
  targetId: string | null
  /** Pour un contact recopié : la copie de son compte dans l'espace cible. */
  targetAccountId: string | null
}

export type MergeStepResult =
  /** Écrite maintenant. */
  | { state: 'written'; targetId: string | null }
  /** Déjà journalisée par un passage précédent : rien n'est réécrit (idempotence). */
  | { state: 'already' }
  /** La ligne d'origine n'est plus dans l'espace source : rien n'est écrit. */
  | { state: 'missing' }

export const WORKSPACE_MERGE_STORE = Symbol('WORKSPACE_MERGE_STORE')

export interface WorkspaceMergeStore {
  /** L'espace PERSONNEL de l'utilisateur : celui qu'il possède, seul membre, hors démo. */
  personalWorkspaceOf(userId: string): Promise<MergeWorkspaceRow | null>
  workspace(workspaceId: string): Promise<MergeWorkspaceRow | null>
  roleIn(userId: string, workspaceId: string): Promise<string | null>

  activeAccounts(workspaceId: string): Promise<MergeAccountRow[]>
  activeContacts(workspaceId: string): Promise<MergeContactRow[]>
  /** Les fiches de l'espace cible qui partagent une clé (SIREN / registre, e-mail / LinkedIn). */
  targetDuplicates(
    workspaceId: string,
    keys: DuplicateLookupKeys,
  ): Promise<{ accounts: MergeAccountRow[]; contacts: MergeContactRow[] }>

  liveRequestForSource(sourceWorkspaceId: string): Promise<MergeRequestRecord | null>
  findRequest(requestId: string): Promise<MergeRequestRecord | null>
  requestsForTarget(workspaceId: string, statuses: readonly WorkspaceMergeStatus[]): Promise<MergeRequestRecord[]>
  requestsBy(userId: string): Promise<MergeRequestRecord[]>
  insertRequest(record: Omit<MergeRequestRecord, 'id' | 'created_at'>): Promise<MergeRequestRecord>
  updateRequest(requestId: string, patch: Partial<Omit<MergeRequestRecord, 'id'>>): Promise<void>

  /** Borné par l'espace CIBLE de la demande (GA-46). */
  recordedItems(requestId: string, workspaceId: string): Promise<MergeRecordedItem[]>
  /** Journal + copie dans UNE transaction : une coupure ne laisse jamais une copie sans sa ligne. */
  applyStep(step: MergeStep): Promise<MergeStepResult>
  /** L'espace personnel passe en archivé — aucune ligne supprimée (condition c). */
  archiveSource(sourceWorkspaceId: string, targetWorkspaceId: string, ownerUserId: string): Promise<void>
  /** L'utilisateur atterrit dans l'espace ESN à sa prochaine requête. */
  selectActiveWorkspace(userId: string, workspaceId: string): Promise<void>
}
