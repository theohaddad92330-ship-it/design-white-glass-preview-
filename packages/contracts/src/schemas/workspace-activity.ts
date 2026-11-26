import { z } from 'zod'
import { paginatedResultSchema } from './pagination.js'

/**
 * Workspace activity journal ("Journal d'activité") wire schemas — Théo p.21 P2:
 * « qui a lancé une analyse, enrichi un contact, exporté, envoyé un message —
 * nécessaire pour équipe et sécurité ».
 *
 * The journal is an ADMIN/MANAGER read view over the append-only
 * `product_events` stream (no new table): the API filters that stream down to
 * the audit-relevant events below, scoped to the caller's active workspace,
 * behind the `team:manage` RBAC permission (owner | admin | sales_ops).
 *
 * Payload discipline (append-only audit): only type / target / date / actor —
 * never message bodies, tokens or credentials (the analytics writer scrubs
 * sensitive keys before insert as defence-in-depth).
 */
export const workspaceActivityEventNames = [
  /** An analysis run was launched (consumes a credit). */
  'analysis_started',
  /** An analysis run finished (normal finish or gate no-go). */
  'analysis_completed',
  /** A contact was enriched via a provider (consumes a credit). */
  'contact_enriched',
  /** Data left the product (CRM push / export). */
  'export_performed',
  /** An outbound message/email was sent to a contact. */
  'message_sent',
  /** A teammate was invited to the workspace. */
  'member_invited',
  /** A pending invitation was revoked. */
  'invitation_revoked',
  /** A member was removed from the workspace. */
  'member_removed',
  /** A member's role was changed (owner-only action). */
  'member_role_changed',
  /** An outbound integration / CRM connection was established. */
  'integration_connected',
  /** An outbound integration was disconnected. */
  'integration_disconnected',
  /**
   * Le portefeuille d'un membre a été repris par un autre (tome 8 §33, angle
   * mort n°2). AJOUTÉ EN FIN DE LISTE : un enum ne perd jamais de valeur et
   * n'en insère jamais au milieu (GA-08).
   *
   * C'est le geste le plus lourd de l'écran Équipe — il déplace des dizaines de
   * comptes d'un coup — et le seul dont on ait besoin de retrouver l'auteur
   * quand quelqu'un demande, six mois plus tard, « qui a donné ces comptes à
   * qui ». `target` porte le successeur ; charge utile type/cible/date/acteur
   * comme toutes les autres lignes.
   */
  'portfolio_handed_over',
  /**
   * Des permissions ont été accordées ou retirées EN PROPRE à un membre, en
   * plus de son rôle. AJOUTÉ EN FIN DE LISTE (GA-08).
   *
   * Pourquoi cette ligne existe : accorder une exception nominative déplace ce
   * que quelqu'un peut faire **sans que son rôle affiché ne change**. C'est la
   * seule modification de privilège que `member_role_changed` ne raconte pas,
   * et ses effets sont irréversibles — ce qui a été lu l'a été. `target` porte
   * le membre visé ; `properties.permissions` porte la liste accordée, parce
   * que « on a changé ses droits » sans dire lesquels n'est pas une trace.
   */
  'member_permissions_changed',
] as const
export const workspaceActivityEventNameSchema = z.enum(workspaceActivityEventNames)
export type WorkspaceActivityEventName = z.infer<typeof workspaceActivityEventNameSchema>

/** Query of `GET /workspaces/activity` — offset pagination + the 3 filters
 *  (member, event type, period), mirroring the neighbouring history lists. */
export const workspaceActivityQuerySchema = z.object({
  /** Filter on the acting member. */
  actorId: z.string().guid().optional(),
  /** Filter on one event type. */
  event: workspaceActivityEventNameSchema.optional(),
  /** Rolling window, aligned with the actions-history filter. */
  period: z.enum(['7d', '30d', '90d']).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})
export type WorkspaceActivityQuery = z.infer<typeof workspaceActivityQuerySchema>

/** The acting member, joined from `profiles` (nullable when not backfilled). */
export const workspaceActivityActorSchema = z.object({
  id: z.string().guid(),
  name: z.string().nullable(),
  email: z.string().nullable(),
})
export type WorkspaceActivityActor = z.infer<typeof workspaceActivityActorSchema>

/**
 * One journal line. `target` is a compact, non-sensitive label of what the
 * action touched (company / contact name, invited email, integration provider);
 * `detail` an optional display dimension (channel, destination, role). Event
 * labels are translated client-side from `event` (FR/EN parity).
 */
export const workspaceActivityItemSchema = z.object({
  id: z.string().guid(),
  event: workspaceActivityEventNameSchema,
  actor: workspaceActivityActorSchema,
  target: z.string().nullable(),
  detail: z.string().nullable(),
  occurredAt: z.string(),
})
export type WorkspaceActivityItem = z.infer<typeof workspaceActivityItemSchema>

/** Response of `GET /workspaces/activity`. */
export const workspaceActivityPageSchema = paginatedResultSchema(workspaceActivityItemSchema)
export type WorkspaceActivityPage = z.infer<typeof workspaceActivityPageSchema>
