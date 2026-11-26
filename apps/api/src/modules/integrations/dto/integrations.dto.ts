import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { INTEGRATION_EVENTS } from '../integration-providers'

/**
 * Save a self-serve integration endpoint. The provider comes from the route
 * param (`PUT /integrations/:provider`), so the body only carries the URL. We
 * enforce a valid absolute https URL here; the provider-specific host pinning
 * (anti-SSRF, e.g. `hooks.slack.com` for Slack) is applied in the service via
 * `validateProviderUrl`. The URL can embed a per-workspace secret, so it is
 * stored AES-256-GCM encrypted at rest.
 */
export const setIntegrationSchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .max(500)
    .refine(v => /^https:\/\//.test(v), { message: 'Integration URL must use https://' }),
})

export class SetIntegrationDto extends createZodDto(setIntegrationSchema) {}

/**
 * Update which application events an integration receives
 * (`PUT /integrations/:provider/events`). Only events from the central
 * registry are accepted; `null` restores the default (= every event).
 */
export const setIntegrationEventsSchema = z.object({
  events: z.array(z.enum(INTEGRATION_EVENTS)).max(INTEGRATION_EVENTS.length).nullable(),
})

export class SetIntegrationEventsDto extends createZodDto(setIntegrationEventsSchema) {}
