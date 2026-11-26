import { z } from 'zod'

/**
 * Typed payload of the Messenger agent — TypeScript mirror of
 * `apps/ia/app/models/messenger_data.py`.
 *
 * Permissive on purpose: the `messages` inner object holds whatever the
 * `bellum_pitch` prompt returns (today: opening, positioning, exploration,
 * proposal, closing). Tightening the inner shape is a follow-up once
 * consumers agree on the surface they read.
 */

export const messageBundleSchema = z
  .object({
    contact: z.string().optional(),
    messages: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()
export type MessageBundle = z.infer<typeof messageBundleSchema>

export const messengerDataSchema = z
  .object({
    messages: z.array(messageBundleSchema).default([]),
  })
  .passthrough()
export type MessengerData = z.infer<typeof messengerDataSchema>
