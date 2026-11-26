import type { GraphFailureData } from '@bellum/contracts'

/**
 * Turn a graph failure event's `data` into the most specific sentence it supports.
 *
 * This is the layer that lost the outage. `phase_failed` and `run_failed` are
 * handled by one `case` block but disagree on the wire: `builder.py` emits the
 * error object AS `data` for the former and UNDER `data.error` for the latter.
 * The reader only knew the nested shape, so every `phase_failed` yielded
 * `undefined`, fell through a `??` to `` `${phase} failed` ``, and a hard
 * Anthropic 400 about an unsupported `temperature` parameter reached the
 * operator as the word "research failed".
 *
 * So: read both shapes, and never drop the `code`. The code is the part that
 * makes a failure greppable and countable — a dashboard can spike on
 * `CLAUDE_BAD_REQUEST`, it can do nothing at all with "research failed".
 *
 * The generic label survives as a last resort only, for a payload that genuinely
 * names no cause. Reaching it should be rare enough to be suspicious.
 */

/** Long enough for a real provider message, short enough for a job error / banner. */
const MAX_DETAIL_LENGTH = 600

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** A non-empty string, or null — anything else is corrupt and must not be rendered. */
function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * The error object, whichever shape the event used.
 *
 * `data.error` when present (`run_failed`), else `data` itself (`phase_failed`).
 * Accepting both is what makes this forward- and backward-compatible with either
 * side of the wire-format asymmetry, without needing them to agree first.
 */
function errorPayload(data: unknown): Record<string, unknown> | null {
  const root = asRecord(data)
  if (!root) return null
  return asRecord(root.error) ?? root
}

export function describeGraphFailure(data: GraphFailureData, phase: string | null | undefined): string {
  const generic = `${phase ?? 'graph'} failed`
  const payload = errorPayload(data)
  if (!payload) return generic

  const code = text(payload.code)
  // The graph writes `user_message`; the TS contract spells it `userMessage`.
  // Accept both — a sentence written for a human is the best thing here.
  const message = text(payload.user_message) ?? text(payload.userMessage) ?? text(payload.message)

  // A code with no message still beats the generic label: it names the failure.
  if (code && message) {
    const detail = message.includes(code) ? message : `${code}: ${message}`
    return detail.slice(0, MAX_DETAIL_LENGTH)
  }
  return (code ?? message ?? generic).slice(0, MAX_DETAIL_LENGTH)
}
