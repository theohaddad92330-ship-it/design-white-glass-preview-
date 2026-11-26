import type {
  ActionDispatchResult,
  ActionIntent,
  ActionLevelSetting,
  DispatchBulkRequest,
  DispatchBulkResponse,
  TrackActionInput,
  WeeklyStats,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

export const actionsApi = {
  weeklyStats(): Promise<WeeklyStats> {
    return apiFetch<WeeklyStats>({ path: '/actions/weekly-stats' })
  },
  track(input: TrackActionInput): Promise<{ id: string }> {
    return apiFetch<{ id: string }, TrackActionInput>({
      path: '/actions/track',
      method: 'POST',
      body: input,
    })
  },
  /**
   * Execute ONE recommendation through the Action Router. The server re-resolves
   * ownership + opt-out and only `enrich_contact` consumes a credit; the result
   * reports back done / queued / skipped / failed (a precondition miss is a
   * `skipped`, never an error).
   */
  dispatch(intent: ActionIntent): Promise<ActionDispatchResult> {
    return apiFetch<ActionDispatchResult, ActionIntent>({
      path: '/actions/dispatch',
      method: 'POST',
      body: intent,
    })
  },
  /** #2896 / #2449.34 — le niveau d'action RÉGLÉ par l'appelant (`null` = le défaut de #2449). */
  getLevel(): Promise<ActionLevelSetting> {
    return apiFetch<ActionLevelSetting>({ path: '/actions/level' })
  },
  /** #2896 / #2449.34 — régler SON niveau ; `null` revient au défaut (la clé est retirée). */
  setLevel(setting: ActionLevelSetting): Promise<ActionLevelSetting> {
    return apiFetch<ActionLevelSetting, ActionLevelSetting>({ path: '/actions/level', method: 'PUT', body: setting })
  },
  /** Execute a batch of intents in one call (multi-contact selection, max 50). */
  dispatchBulk(request: DispatchBulkRequest): Promise<DispatchBulkResponse> {
    return apiFetch<DispatchBulkResponse, DispatchBulkRequest>({
      path: '/actions/dispatch/bulk',
      method: 'POST',
      body: request,
    })
  },
}
