import type { ProfilerPhase } from '@bellum/contracts'
import { create } from 'zustand'
import { i18n } from '@/i18n'

type ProfilerStepStatus = 'pending' | 'active' | 'done'

type ProfilerStep = {
  key: ProfilerPhase
  label: string
  status: ProfilerStepStatus
  message: string
}

type ProfilerDecision = {
  field: string
  label: string
  preview: string
}

// Les labels sont résolus à l'appel de cloneInitial() (reset au début de chaque
// run du profiler) — jamais figés à l'import, pour suivre la langue courante.
const INITIAL_STEP_KEYS: ProfilerPhase[] = ['reading', 'thinking', 'writing', 'done']

type ProfilerProgressState = {
  steps: ProfilerStep[]
  decisions: ProfilerDecision[]
  isDone: boolean
  errorMessage: string | null
  start: (phase: ProfilerPhase, message: string) => void
  complete: (phase: ProfilerPhase, message: string) => void
  pushDecision: (decision: ProfilerDecision) => void
  finishAll: () => void
  fail: (message: string) => void
  reset: () => void
}

function cloneInitial(): ProfilerStep[] {
  // i18n keys: welcome:profiler.steps.reading | welcome:profiler.steps.thinking | welcome:profiler.steps.writing | welcome:profiler.steps.done
  return INITIAL_STEP_KEYS.map(key => ({
    key,
    label: i18n.t(`welcome:profiler.steps.${key}`),
    status: 'pending' as const,
    message: '',
  }))
}

export const useProfilerProgressStore = create<ProfilerProgressState>(set => ({
  steps: cloneInitial(),
  decisions: [],
  isDone: false,
  errorMessage: null,
  start: (phase, message) =>
    set(state => ({
      steps: state.steps.map(step => (step.key === phase ? { ...step, status: 'active', message } : step)),
    })),
  complete: (phase, message) =>
    set(state => ({
      steps: state.steps.map(step =>
        step.key === phase ? { ...step, status: 'done', message: message || step.message } : step,
      ),
    })),
  pushDecision: decision =>
    set(state =>
      state.decisions.some(d => d.field === decision.field) ? state : { decisions: [...state.decisions, decision] },
    ),
  finishAll: () =>
    set(state => ({
      steps: state.steps.map(step => ({ ...step, status: 'done' })),
      isDone: true,
    })),
  fail: message => set({ errorMessage: message }),
  reset: () => set({ steps: cloneInitial(), decisions: [], isDone: false, errorMessage: null }),
}))
