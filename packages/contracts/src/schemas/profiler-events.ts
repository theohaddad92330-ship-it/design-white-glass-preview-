import { z } from 'zod'

export const profilerPhaseValues = ['reading', 'thinking', 'writing', 'done'] as const
export type ProfilerPhase = (typeof profilerPhaseValues)[number]
export const profilerPhaseSchema = z.enum(profilerPhaseValues)

export const profilerStatusValues = ['started', 'complete', 'error'] as const
export type ProfilerStatus = (typeof profilerStatusValues)[number]
export const profilerStatusSchema = z.enum(profilerStatusValues)

export const profilerProgressEventSchema = z.object({
  kind: z.literal('phase'),
  userId: z.string().min(1),
  phase: profilerPhaseSchema,
  status: profilerStatusSchema,
  message: z.string().optional().default(''),
})
export type ProfilerProgressEvent = z.infer<typeof profilerProgressEventSchema>

export const profilerFieldEventSchema = z.object({
  kind: z.literal('field'),
  userId: z.string().min(1),
  field: z.string().min(1),
  label: z.string(),
  preview: z.string().optional().default(''),
})
export type ProfilerFieldEvent = z.infer<typeof profilerFieldEventSchema>

export const profilerEventSchema = z.discriminatedUnion('kind', [profilerProgressEventSchema, profilerFieldEventSchema])
export type ProfilerEvent = z.infer<typeof profilerEventSchema>

export const profilerSocketEvents = {
  phaseStarted: 'profiler:phase:started',
  phaseComplete: 'profiler:phase:complete',
  fieldEmitted: 'profiler:field:emitted',
  done: 'profiler:done',
  error: 'profiler:error',
  join: 'join:profiler',
  leave: 'leave:profiler',
} as const

export const profilerSocketPayloadSchema = z.object({
  userId: z.string(),
  phase: profilerPhaseSchema,
  message: z.string().optional().default(''),
})
export type ProfilerSocketPayload = z.infer<typeof profilerSocketPayloadSchema>

export const profilerErrorPayloadSchema = z.object({
  userId: z.string(),
  message: z.string(),
})
export type ProfilerErrorPayload = z.infer<typeof profilerErrorPayloadSchema>
