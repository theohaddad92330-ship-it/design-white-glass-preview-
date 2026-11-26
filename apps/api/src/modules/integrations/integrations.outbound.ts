/**
 * Outbound delivery for self-serve integrations. No SDK — a single `fetch` POST
 * is all Slack Incoming Webhooks and generic webhooks need. Every call checks
 * `res.ok` (code rule) and surfaces a clear error rather than an invented
 * fallback. A short timeout keeps a slow/hanging endpoint from tying up a
 * request thread.
 */

import { assertSafeOutboundUrl } from './ssrf-guard'

const DELIVERY_TIMEOUT_MS = 8_000

/** Structured event delivered to a generic outgoing webhook. */
export type WebhookEvent = {
  /** Machine-readable event name, e.g. `analysis.completed`. */
  type: string
  /** ISO timestamp of when the event was dispatched. */
  sentAt: string
  /** Optional structured payload. */
  data?: Record<string, unknown>
}

async function postJson(url: string, payload: unknown): Promise<Response> {
  // Anti-SSRF: block internal/metadata targets before we ever connect. This is
  // the single choke point every outbound delivery (test, buy-signal, event)
  // flows through, so guarding here covers all providers.
  await assertSafeOutboundUrl(url)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS)
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Post a plain message to a chat Incoming Webhook (Slack, Discord, Teams,
 * Google Chat). The body key differs per platform (`text` for most, `content`
 * for Discord) — the caller passes the key from the provider rule. Throws on a
 * non-2xx response.
 */
export async function sendChatMessage(webhookUrl: string, text: string, bodyKey: 'text' | 'content'): Promise<void> {
  const res = await postJson(webhookUrl, { [bodyKey]: text })
  if (!res.ok) throw new Error(`Chat webhook returned HTTP ${res.status}`)
}

/** Post a structured event to a generic outgoing webhook. Throws on a non-2xx response. */
export async function postWebhookEvent(url: string, event: WebhookEvent): Promise<void> {
  const res = await postJson(url, event)
  if (!res.ok) throw new Error(`Webhook returned HTTP ${res.status}`)
}

/** How a provider shapes its outbound body — mirror of the registry rule shape. */
type DeliveryShape = { kind: 'chat'; bodyKey: 'text' | 'content' } | { kind: 'event' }

/**
 * Deliver one event to a provider endpoint and return the raw Response: the
 * queue worker needs the HTTP status to drive the retry policy (4xx = invalid
 * config, no retry; 5xx/timeout = transient, retry). Same single choke point:
 * `postJson` re-runs the anti-SSRF guard on EVERY attempt, so a retry can never
 * bypass host validation. Throws only on network/timeout/guard errors.
 */
export async function deliverToEndpoint(
  url: string,
  delivery: DeliveryShape,
  event: { text: string; envelope: WebhookEvent },
): Promise<Response> {
  const payload = delivery.kind === 'chat' ? { [delivery.bodyKey]: event.text } : event.envelope
  return postJson(url, payload)
}
