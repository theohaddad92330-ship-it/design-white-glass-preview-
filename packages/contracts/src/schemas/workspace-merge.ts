import { z } from 'zod'

/**
 * #4158.57 (décision Louis 17/10/2026) — RAPATRIER L'ESPACE PERSONNEL d'un utilisateur dans l'espace ESN
 * qu'il a rejoint. Le vocabulaire de la demande, partagé par l'API (contraintes CHECK de la migration
 * `WorkspacePersonalMerge`, GA-12) et l'écran Réglages › Espace.
 *
 * Conditions non négociables, et où elles vivent :
 *  (a) un APERÇU figé, persisté avec son empreinte — la validation porte sur CETTE empreinte ;
 *  (b) validation de l'utilisateur PUIS d'un admin de l'espace cible ;
 *  (c) l'espace personnel est ARCHIVÉ, jamais supprimé — ses lignes d'origine restent lisibles ;
 *  (e) simulation par défaut, l'écriture réelle exige l'empreinte validée ;
 *  (g) une fiche de l'espace cible n'est jamais écrasée : un doublon est PROPOSÉ, jamais fusionné seul.
 */

/** Le cycle d'une demande. `previewed` = simulation faite, rien de validé. */
export const WORKSPACE_MERGE_STATUSES = [
  'previewed',
  'awaiting_admin',
  'approved',
  'running',
  'done',
  'failed',
  'rejected',
  'cancelled',
] as const
export type WorkspaceMergeStatus = (typeof WORKSPACE_MERGE_STATUSES)[number]

/** Les tables rapatriées par ce lot. Le reste de l'espace personnel reste lisible dans l'espace archivé. */
export const WORKSPACE_MERGE_TABLES = ['accounts', 'contacts'] as const
export type WorkspaceMergeTable = (typeof WORKSPACE_MERGE_TABLES)[number]

/**
 * Le sort d'une ligne de l'espace personnel :
 *  · `copied` — recopiée dans l'espace cible (l'originale reste dans l'espace archivé) ;
 *  · `duplicate_proposed` — l'espace cible a déjà cette fiche (SIREN / registre, e-mail / LinkedIn) :
 *    rien n'est écrit, la fusion est PROPOSÉE ;
 *  · `held_with_account` — un contact dont le compte est une proposition : il attend la décision du compte.
 */
export const WORKSPACE_MERGE_ITEM_OUTCOMES = ['copied', 'duplicate_proposed', 'held_with_account'] as const
export type WorkspaceMergeItemOutcome = (typeof WORKSPACE_MERGE_ITEM_OUTCOMES)[number]

/** Ce qui fait d'une ligne un doublon de l'espace cible. Un nom identique n'en est PAS un. */
export type WorkspaceMergeDuplicateKey = 'siren' | 'registry' | 'email' | 'linkedin'

export type WorkspaceMergeTableCount = {
  table: WorkspaceMergeTable
  /** Lignes actives de l'espace personnel (ni archivées, ni supprimées, ni fusionnées). */
  total: number
  /** Recopiées dans l'espace cible. */
  moving: number
  /** Déjà présentes dans l'espace cible : proposées à la fusion, jamais écrites. */
  duplicates: number
  /** En attente de la décision sur leur compte. */
  held: number
}

/** Une ligne de l'aperçu, dans l'ordre d'exécution (comptes d'abord). */
export type WorkspaceMergePlanItem = {
  table: WorkspaceMergeTable
  sourceId: string
  outcome: WorkspaceMergeItemOutcome
  /** La fiche existante de l'espace cible, pour un doublon. */
  targetId: string | null
  /** Le compte d'origine d'un contact (pour le rattacher à sa copie). */
  sourceAccountId: string | null
  duplicateKey: WorkspaceMergeDuplicateKey | null
  /** Nom affiché (raison sociale, nom du contact) — jamais une coordonnée. */
  label: string
}

export type WorkspaceMergePreview = {
  sourceWorkspaceId: string
  targetWorkspaceId: string
  tables: WorkspaceMergeTableCount[]
  items: WorkspaceMergePlanItem[]
}

export type WorkspaceMergeRequestView = {
  id: string
  status: WorkspaceMergeStatus
  sourceWorkspaceId: string
  sourceWorkspaceName: string
  targetWorkspaceId: string
  targetWorkspaceName: string
  requestedBy: string
  previewHash: string
  tables: WorkspaceMergeTableCount[]
  /** Les doublons PROPOSÉS — à trancher par un humain, jamais fusionnés seuls. */
  proposals: WorkspaceMergePlanItem[]
  /** Lignes déjà traitées par le job / lignes de l'aperçu. */
  progress: { done: number; total: number }
  userValidatedAt: string | null
  adminValidatedAt: string | null
  finishedAt: string | null
  lastError: string | null
  createdAt: string
}

/** Corps de `POST /workspace-merge/preview` — l'espace ESN qui recevra l'espace personnel. */
export const workspaceMergePreviewInputSchema = z.object({ targetWorkspaceId: z.string().guid() }).strict()

/** Corps de `confirm` / `approve` — l'EMPREINTE de l'aperçu affiché, rien d'autre. */
export const workspaceMergeHashInputSchema = z.object({ hash: z.string().regex(/^[0-9a-f]{64}$/) }).strict()
