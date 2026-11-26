import type { BrailleVariant } from '@bellum/ui'
import { create } from 'zustand'

type BackgroundTaskState = 'running' | 'completed' | 'error'

/**
 * One async piece of work surfaced in the global "Tâches de fond" indicator
 * (next to BrandHeader). Anything that is meaningful enough for the user to
 * track — analyses, saves, exports… — registers a task here so the indicator
 * shows it without each feature having to render its own UI.
 */
type BackgroundTask = {
  id: string
  /** Row title in the sheet (e.g. "Sauvegarde du profil"). */
  title: string
  /** Short verb-form label shown in the closed pill (e.g. "Saving"). Falls
   *  back to `title` when omitted. */
  label?: string
  /** Variant of the braille grid loader (e.g. 'grid-syncing'). Defaults to
   *  'grid-orbit' if not provided. */
  loaderVariant?: BrailleVariant
  /** Optional second line — current step, last event, or final message. */
  subtitle?: string
  state: BackgroundTaskState
  /** 0..100 when the task can report granular progress. Optional. */
  percent?: number
  /** Set once `state === 'error'` to surface the failure reason. */
  error?: string
  startedAt: number
  updatedAt: number
}

type RegisterInput = Pick<BackgroundTask, 'id' | 'title'> &
  Partial<Pick<BackgroundTask, 'label' | 'loaderVariant' | 'subtitle' | 'percent' | 'state'>>

type UpdateInput = Partial<Pick<BackgroundTask, 'title' | 'label' | 'subtitle' | 'percent' | 'state'>>

type BackgroundTasksStore = {
  tasks: Record<string, BackgroundTask>
  /** Register a new task or replace an existing one with the same id. */
  register: (task: RegisterInput) => void
  /** Patch an existing task (no-op if id unknown). */
  update: (id: string, patch: UpdateInput) => void
  /** Mark as completed and pin percent to 100. */
  complete: (id: string, subtitle?: string) => void
  /** Mark as error with a reason. */
  fail: (id: string, error: string) => void
  /** Remove from the list (used by the "X" dismiss in the sheet). */
  clear: (id: string) => void
}

export const useBackgroundTasksStore = create<BackgroundTasksStore>(set => ({
  tasks: {},
  register: input =>
    set(s => {
      const now = Date.now()
      return {
        tasks: {
          ...s.tasks,
          [input.id]: {
            id: input.id,
            title: input.title,
            label: input.label,
            loaderVariant: input.loaderVariant,
            subtitle: input.subtitle,
            percent: input.percent,
            state: input.state ?? 'running',
            startedAt: now,
            updatedAt: now,
          },
        },
      }
    }),
  update: (id, patch) =>
    set(s => {
      const current = s.tasks[id]
      if (!current) return s
      return {
        tasks: { ...s.tasks, [id]: { ...current, ...patch, updatedAt: Date.now() } },
      }
    }),
  complete: (id, subtitle) =>
    set(s => {
      const current = s.tasks[id]
      if (!current) return s
      return {
        tasks: {
          ...s.tasks,
          [id]: {
            ...current,
            state: 'completed',
            percent: 100,
            ...(subtitle !== undefined ? { subtitle } : {}),
            updatedAt: Date.now(),
          },
        },
      }
    }),
  fail: (id, error) =>
    set(s => {
      const current = s.tasks[id]
      if (!current) return s
      return {
        tasks: {
          ...s.tasks,
          [id]: { ...current, state: 'error', error, updatedAt: Date.now() },
        },
      }
    }),
  clear: id =>
    set(s => {
      if (!(id in s.tasks)) return s
      const next = { ...s.tasks }
      delete next[id]
      return { tasks: next }
    }),
}))
