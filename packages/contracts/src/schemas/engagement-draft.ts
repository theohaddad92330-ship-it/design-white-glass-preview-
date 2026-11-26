import { z } from 'zod'

/**
 * #3694.7 — le brief confirmé (objectif, relation, angle, paramètres) et le
 * fil qui le porte, enregistrés AVEC le brouillon, relus à la réouverture —
 * y compris après rechargement. Avant, `draft-store.ts` ne vivait qu'en
 * mémoire de session (un `Map`), perdu à chaque rechargement de page.
 *
 * `entries` et `parameters` restent des formes TypeScript côté client
 * (`ConversationEntry`, `MessageParameters`, `apps/web/.../conversation.ts`) —
 * cette validation ne borne que ce qu'un abus pourrait coûter (taille), elle
 * ne revalide pas chaque champ métier : le serveur range ce qu'il reçoit, il
 * ne relit jamais le contenu d'un message.
 */
export const ENGAGEMENT_DRAFT_CHANNELS = [
  'email',
  'linkedin',
  'phone',
  'task',
  'voicemail',
  'recommendation',
  // #2370 — les canaux préparés du composer (migration `OutreachChannelsSmsWhatsappAndPrepared1796560200370`).
  'sms',
  'whatsapp',
  'introduction_request',
  'partner_message',
  'follow_up_email',
  'profile_push',
  'linkedin_connection_note',
] as const
export const engagementDraftChannelSchema = z.enum(ENGAGEMENT_DRAFT_CHANNELS)
export type EngagementDraftChannel = z.infer<typeof engagementDraftChannelSchema>

export const engagementDraftSnapshotSchema = z.object({
  entries: z.array(z.record(z.string(), z.unknown())).max(200),
  context: z.string().max(10_000),
  parameters: z.record(z.string(), z.string().max(1_000)),
})
export type EngagementDraftSnapshot = z.infer<typeof engagementDraftSnapshotSchema>
