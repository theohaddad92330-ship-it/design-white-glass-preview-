import { z } from 'zod'

/**
 * The progress events streamed by the LangGraph analysis run (`/graph/analyze`).
 *
 * Producer — and sole source of truth for these shapes — is
 * `apps/ia/app/graph/builder.py::stream_analysis_graph`. The SSE layer
 * (`app/routers/graph_analyze.py`) serialises each `GraphEvent` verbatim with
 * `model_dump_json()`, so what that function yields IS the wire.
 *
 * ## Why this file exists
 *
 * `data` used to be `z.record(z.unknown())` — one opaque bag for seven events
 * with seven different payloads. That is how a production outage stayed
 * invisible for days: `phase_failed` splatted its error object flat AS `data`
 * while `run_failed` nested it UNDER `data.error`, the worker handled both in a
 * single `case` and knew only the nested spelling, so every `phase_failed` read
 * `undefined` and fell through a `??` to the literal string `` `${phase} failed` ``.
 * A hard Anthropic 400 about an unsupported `temperature` parameter reached the
 * customer as the word "Erreur". Nothing failed at the boundary, because an
 * opaque record accepts every shape equally — the mismatch only became visible
 * seven layers downstream, as an absence.
 *
 * A discriminated union turns that class of mistake into a parse error at the
 * frontier that names the event and the field.
 *
 * ## The two error placements are BOTH valid, deliberately
 *
 * The producer was corrected (commit 2b1d3fe1) to nest `phase_failed` like
 * `run_failed`, and #628 independently taught the consumer to read either. Both
 * halves are kept: the API and the IA are separate Railway services with no
 * deployment ordering guarantee, so an IA rolled back below that commit still
 * emits the flat shape. Tolerating both is what lets either side ship first.
 * Do not "tidy" this into one shape — the asymmetry is harmless now, and the
 * tolerance is load-bearing.
 *
 * ## Strictness policy: fail loud where loss is SILENT, degrade where it is VISIBLE
 *
 * - **Unknown payload keys pass THROUGH, never stripped.** zod strips by
 *   default, and `data.output` is handed wholesale to the persistence layer —
 *   stripping would silently drop any field the IA adds, which is precisely the
 *   `registry_id`/`registryId` bug this repo has already paid for. Strict mode
 *   is applied in the *fixture test* instead, where drift is caught in CI
 *   without a chance of taking production down.
 * - **The dossier is required; the metrics are not.** `data.output` and the
 *   failure `error` object must be well-formed — their corruption is invisible
 *   (an empty dossier marked complete, a failure with no cause). `telemetry`,
 *   `summary`, `judge` and `gate` are optional — their loss shows up in a
 *   dashboard, and `run-cost.ts` already documents `null` as "an older IA
 *   deploy". Failing a COMPLETE run to protect a metric is the wrong trade.
 * - **An unknown event TYPE is skipped, not thrown.** See `parseGraphEvent`.
 */

/** Free-form JSON object. Payload interiors are contracts of their own (research,
 *  plan, telemetry…) and are validated by their own schemas where they are used. */
const jsonObject = z.record(z.string(), z.unknown())

/** A string that actually says something. `''` is corruption, not absence — and a
 *  blank message is exactly what the outage rendered as "research failed". */
const nonEmpty = z.string().min(1)

/**
 * The failure object built by `apps/ia/app/graph/nodes.py::_fail`.
 *
 * `message` is required because a failure event that names no cause is the
 * defect this whole file exists to catch. `code` is what makes a failure
 * greppable and countable (a dashboard can spike on `CLAUDE_BAD_REQUEST`; it can
 * do nothing with a sentence), and `user_message`/`debug_message` are added by
 * `_fail_from_exc` only when they differ from `message`.
 */
const graphErrorSchema = z
  .object({
    phase: z.string().optional(),
    code: nonEmpty.optional(),
    message: nonEmpty,
    user_message: nonEmpty.optional(),
    debug_message: nonEmpty.optional(),
  })
  .passthrough()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Validate a failure payload in whichever of the two placements it arrived, and
 * report issues at the path they really occupy (`data.error.message` vs
 * `data.message`) so the error message points at the actual frame.
 *
 * A plain `z.union` would collapse both branches into "invalid_union" and name
 * no field at all, which defeats the purpose.
 */
const failurePayload = <T extends z.ZodType<Record<string, unknown>>>(schema: T) =>
  schema.superRefine((data: Record<string, unknown>, ctx: z.RefinementCtx) => {
    const nested = data.error
    const target = isRecord(nested) ? nested : data
    const prefix = isRecord(nested) ? ['error'] : []
    const result = graphErrorSchema.safeParse(target)
    if (result.success) return
    for (const issue of result.error.issues) {
      ctx.addIssue({ ...issue, path: [...prefix, ...issue.path] })
    }
  })

/** Fields every event carries, whatever its type. */
const envelope = {
  /**
   * The phase this event concerns. `null` on `run_completed` (always) and on
   * `run_failed` when the graph could not attribute the failure; a string
   * everywhere else. Note `phase_failed` reports `failed_phase`, which may
   * differ from the node that produced the update.
   */
  phase: z.string().nullable().optional(),
  /** Cumulative percentage. `judge_completed` reports 100, same as `run_completed`. */
  progress: z.number().default(0),
}

/** A phase produced its output. `data.output` holds that phase's `PHASE_OUTPUT_KEYS`
 *  and is persisted wholesale — the one payload whose corruption is silent. */
const phaseCompletedSchema = z.object({
  type: z.literal('phase_completed'),
  ...envelope,
  data: z.object({ telemetry: jsonObject.optional(), output: jsonObject }).passthrough(),
})

/** A phase short-circuited on resume (already done on a previous attempt).
 *  Carries no payload at all — not even telemetry. */
const phaseSkippedSchema = z.object({
  type: z.literal('phase_skipped'),
  ...envelope,
  data: jsonObject.default({}),
})

/**
 * A phase failed mid-stream. The worker throws on this at once, so it always
 * beats the terminal `run_failed` — which is why its error had to be readable.
 *
 * That same immediacy is why it also carries `summary`. Because the worker never
 * reaches `run_failed` on a real failure, telemetry that lived only on the
 * terminal frame was telemetry no failing run ever delivered — so
 * `stampSourceHealth` was dead code on the path that actually fires, and the
 * "which upstream is down, since when" screen (#628) went blind precisely during
 * an outage. The producer now sends it here too.
 *
 * `optional` is load-bearing, not laziness: an IA deploy that predates this
 * omits the key, and a missing summary must stamp NOTHING (which downstream
 * reads as "unknown") rather than an empty breakdown that would read as a clean
 * bill of health. That is the distinction #628 exists to protect.
 */
const phaseFailedSchema = z.object({
  type: z.literal('phase_failed'),
  ...envelope,
  data: failurePayload(z.object({ summary: jsonObject.optional() }).passthrough()),
})

/** The always-on anti-hallucination Judge ran after the plan. Advisory: a missing
 *  or unreadable verdict must never fail an otherwise-complete run. */
const judgeCompletedSchema = z.object({
  type: z.literal('judge_completed'),
  ...envelope,
  data: z.object({ judge: jsonObject.optional() }).passthrough(),
})

/** Terminal success. `data.summary` carries the run's real cost. */
const runCompletedSchema = z.object({
  type: z.literal('run_completed'),
  ...envelope,
  data: z.object({ summary: jsonObject.optional() }).passthrough(),
})

/** Terminal failure, carrying the same `error` + `summary` as `phase_failed`.
 *  Rarely arrives (the worker throws on `phase_failed` first) — it is the frame
 *  for a run that died with no phase to attribute it to. */
const runFailedSchema = z.object({
  type: z.literal('run_failed'),
  ...envelope,
  data: failurePayload(z.object({ summary: jsonObject.optional() }).passthrough()),
})

/** Terminal early-exit: research ran and the gate said no-go. A success, not a
 *  failure — and unrelated to `phase_skipped` despite the shared verb. */
const runSkippedSchema = z.object({
  type: z.literal('run_skipped'),
  ...envelope,
  data: z.object({ gate: jsonObject.optional(), summary: jsonObject.optional() }).passthrough(),
})

export const graphEventSchema = z.discriminatedUnion('type', [
  phaseCompletedSchema,
  phaseSkippedSchema,
  phaseFailedSchema,
  judgeCompletedSchema,
  runCompletedSchema,
  runFailedSchema,
  runSkippedSchema,
])

export type GraphEvent = z.infer<typeof graphEventSchema>

/** Payload of a `phase_completed`. `output` is the dossier fragment the worker
 *  persists; `telemetry` is that phase's cost envelope. */
export type GraphPhaseCompletedData = z.infer<typeof phaseCompletedSchema>['data']

/** Payload of either failure event. Deliberately NOT normalised: the error object
 *  may sit at the root (legacy `phase_failed`) or under `error`, and
 *  `describeGraphFailure` reads both. */
export type GraphFailureData = z.infer<typeof phaseFailedSchema>['data'] | z.infer<typeof runFailedSchema>['data']

/** Every event type this consumer understands. An event outside this set is not
 *  invalid — it is newer than us. */
const KNOWN_EVENT_TYPES = new Set<string>([
  'phase_completed',
  'phase_skipped',
  'phase_failed',
  'judge_completed',
  'run_completed',
  'run_failed',
  'run_skipped',
])

/**
 * A known event type arrived with a payload we cannot trust.
 *
 * Thrown AT the frontier, naming the event and the offending field, rather than
 * letting a malformed payload travel inward to surface as a missing sentence.
 * `name` is set explicitly because the worker classifies errors by name rather
 * than `instanceof` (cross-package identity is not reliable here).
 */
export class GraphEventContractError extends Error {
  readonly name = 'GraphEventContractError'
  readonly eventType: string
  readonly issues: string[]

  constructor(eventType: string, issues: string[]) {
    super(`Malformed "${eventType}" graph event from the IA: ${issues.join('; ')}`)
    this.eventType = eventType
    this.issues = issues
  }
}

/** Either a parsed event, or a frame from a newer IA that we deliberately ignore. */
export type GraphEventParseResult = { status: 'ok'; event: GraphEvent } | { status: 'unknown_type'; type: string }

/**
 * Parse one streamed frame, with two DIFFERENT failure modes on purpose.
 *
 * **Unknown event type → report and skip.** The API and the IA deploy
 * independently, so the IA can ship a new event type first. Throwing on it would
 * throw MID-STREAM, after phases had already been persisted, as a plain error
 * that rides the BullMQ retry budget — every account would then re-run the whole
 * expensive pipeline and hit the same frame again. A self-inflicted outage with
 * a cost multiplier, triggered by an ordinary additive change. The codebase
 * already logged a near-miss of exactly this: `judge_completed` had to be
 * remembered in the old enum or "parse would throw on that frame and fail an
 * already-completed run". By construction an event we do not recognise carries
 * nothing we would have acted on, and the worker's `finalizeTruncatedStream`
 * already judges a run on the work that landed rather than on receipt of any
 * particular frame — so skipping degrades safely even if a TERMINAL event is
 * what got renamed.
 *
 * **Known event type, malformed payload → throw.** Here the opposite reasoning
 * applies: this is data the consumer WILL act on, and acting on it means
 * persisting a dossier or rendering a failure. Proceeding is how "Erreur"
 * happened. A missing `type`, or one that is not a string, is corruption rather
 * than novelty and throws too.
 */
export function parseGraphEvent(raw: unknown): GraphEventParseResult {
  const type = isRecord(raw) ? raw.type : undefined
  if (typeof type === 'string' && !KNOWN_EVENT_TYPES.has(type)) {
    return { status: 'unknown_type', type }
  }

  const result = graphEventSchema.safeParse(raw)
  if (result.success) return { status: 'ok', event: result.data }

  const issues = result.error.issues.map(issue => {
    const path = ['data', ...issue.path.slice(1)].join('.')
    return issue.path.length > 0 ? `${path} — ${issue.message}` : issue.message
  })
  throw new GraphEventContractError(typeof type === 'string' ? type : 'unknown', issues)
}
