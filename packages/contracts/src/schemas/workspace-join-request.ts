import { z } from 'zod'

/**
 * #2016 — REJOINDRE UN ESPACE QUI EXISTE DÉJÀ (décision Louis 15/09/2026).
 *
 * Un nouveau venu dont l'adresse professionnelle correspond à un espace
 * existant ne recrée pas l'entreprise en silence : il DEMANDE l'accès, et les
 * administrateurs de l'espace répondent. Après 72 h de silence, ou sur un
 * refus, il peut créer son propre espace ; s'il dit « ce n'est pas mon
 * entreprise », il le peut tout de suite. Aucun doublon n'est créé
 * automatiquement, et aucune fusion n'est jamais faite — on propose, on ne
 * fusionne pas.
 *
 * ⚠️ L'appelant n'est PAS membre de l'espace qu'il voit. Il reçoit le nom de
 * l'espace et, pour chaque administrateur, un PRÉNOM et une INITIALE — jamais
 * une adresse, un téléphone ou un nom complet. Les schémas sont `.strict()` :
 * un champ de plus glissé côté service fait échouer la validation au lieu de
 * partir en réponse.
 */

/**
 * Les états d'une demande. `dismissed` = « ce n'est pas mon entreprise » :
 * la détection s'est trompée, et la personne le DIT — la trace reste pour que
 * l'encart ne revienne pas à chaque passage. Ajouts en FIN seulement (GA-08).
 */
export const workspaceJoinRequestStatusValues = ['pending', 'accepted', 'refused', 'dismissed'] as const
export const workspaceJoinRequestStatusSchema = z.enum(workspaceJoinRequestStatusValues)
export type WorkspaceJoinRequestStatus = z.infer<typeof workspaceJoinRequestStatusSchema>

/** Le délai de silence après lequel « Créer mon propre espace » s'active. */
export const WORKSPACE_JOIN_SILENCE_HOURS = 72

/** Un administrateur NOMMÉ sans ses coordonnées (#2016.5). */
export const workspaceJoinAdminSchema = z
  .object({
    firstName: z.string().min(1).max(80),
    /** Une lettre (majuscule), ou `null` quand le nom n'est pas renseigné. */
    lastInitial: z
      .string()
      .regex(/^\p{Lu}$/u)
      .nullable(),
  })
  .strict()
export type WorkspaceJoinAdmin = z.infer<typeof workspaceJoinAdminSchema>

/** La demande de la personne elle-même — elle ne voit que les SIENNES. */
export const myWorkspaceJoinRequestSchema = z
  .object({
    id: z.string().guid(),
    status: workspaceJoinRequestStatusSchema,
    createdAt: z.string(),
    decidedAt: z.string().nullable(),
  })
  .strict()
export type MyWorkspaceJoinRequest = z.infer<typeof myWorkspaceJoinRequestSchema>

/** Un espace détecté pour le domaine professionnel de la personne. */
export const workspaceJoinCandidateSchema = z
  .object({
    workspaceId: z.string().guid(),
    workspaceName: z.string(),
    admins: z.array(workspaceJoinAdminSchema),
    request: myWorkspaceJoinRequestSchema.nullable(),
  })
  .strict()
export type WorkspaceJoinCandidate = z.infer<typeof workspaceJoinCandidateSchema>

/** `GET /workspace-join-requests/overview` — plusieurs espaces possibles (#2016.6). */
export const workspaceJoinOverviewSchema = z
  .object({
    candidates: z.array(workspaceJoinCandidateSchema),
    canCreateOwnWorkspace: z.boolean(),
  })
  .strict()
export type WorkspaceJoinOverview = z.infer<typeof workspaceJoinOverviewSchema>

/** Corps de `POST /workspace-join-requests` et de `…/dismiss`. */
export const workspaceJoinTargetSchema = z.object({ workspaceId: z.string().guid() }).strict()
export type WorkspaceJoinTarget = z.infer<typeof workspaceJoinTargetSchema>

/**
 * Ce que voit un ADMINISTRATEUR de l'espace. La personne a choisi de se
 * présenter : son adresse sert à la reconnaître avant de lui ouvrir l'espace.
 */
export const pendingWorkspaceJoinRequestSchema = z
  .object({
    id: z.string().guid(),
    requesterName: z.string().nullable(),
    requesterEmail: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict()
export type PendingWorkspaceJoinRequest = z.infer<typeof pendingWorkspaceJoinRequestSchema>

/** La date à partir de laquelle une demande restée sans réponse débloque. */
export function ownWorkspaceUnlockAt(request: Pick<MyWorkspaceJoinRequest, 'createdAt'>): string {
  return new Date(new Date(request.createdAt).getTime() + WORKSPACE_JOIN_SILENCE_HOURS * 3_600_000).toISOString()
}

/**
 * #2016.2 / #2016.10 — LA règle, à un seul endroit (GA-26) : l'API la calcule,
 * l'écran l'affiche, et les deux lisent cette fonction.
 *
 * Chaque espace détecté doit être TRANCHÉ : refusé, écarté (« pas mon
 * entreprise »), accepté, ou resté 72 h sans réponse. Un espace sans demande
 * bloque — on demande d'abord, c'est tout le sens de « aucun doublon
 * automatique ».
 */
export function canCreateOwnWorkspace(candidates: readonly WorkspaceJoinCandidate[], now: Date = new Date()): boolean {
  return candidates.every(({ request }) => {
    if (!request) return false
    if (request.status !== 'pending') return true
    return now.getTime() >= new Date(ownWorkspaceUnlockAt(request)).getTime()
  })
}
