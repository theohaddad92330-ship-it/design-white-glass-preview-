import type { AnalysisContextPreset } from '@bellum/contracts'

/** i18n key (under the `search` namespace) for each preset's display label —
 * the single source of truth reused by `searchComposerPresets.ts` so the
 * dropdown option and the label shown elsewhere never drift. */
export const ANALYSIS_CONTEXT_PRESET_LABEL_KEYS: Record<AnalysisContextPreset, string> = {
  'push-offer': 'presets.pushOffer.label',
  'known-account': 'presets.knownAccount.label',
  incumbent: 'presets.incumbent.label',
  signal: 'presets.signal.label',
  strategic: 'presets.strategic.label',
  retry: 'presets.retry.label',
  free: 'presets.free.label',
}
