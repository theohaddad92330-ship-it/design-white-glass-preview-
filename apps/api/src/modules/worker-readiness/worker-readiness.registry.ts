import { Injectable } from '@nestjs/common'

/**
 * Registry key for the analysis-pipeline BullMQ worker. Shared between the worker
 * (which registers its liveness probe) and the readiness gate (which requires
 * THIS worker to be live before a deploy is promoted), so the two can never drift.
 */
export const ANALYSIS_WORKER_NAME = 'analysis'

/**
 * Process-local registry of "is this worker alive?" probes.
 *
 * A BullMQ worker registers a probe here at construction; the readiness health
 * gate (`GET /health/ready`) reads it to decide whether THIS process can actually
 * process jobs. It deliberately tracks the IN-PROCESS worker rather than
 * `Queue.getWorkers()` (which asks Redis and would also count a still-connected
 * OLD deploy during a rollout — masking exactly the broken new build the health
 * gate exists to catch).
 */
@Injectable()
export class WorkerReadinessRegistry {
  private readonly probes = new Map<string, () => boolean>()

  /**
   * Register (or replace) a worker's liveness probe. The probe is evaluated
   * lazily on every readiness check, so it can close over a worker created AFTER
   * registration — BullMQ builds the underlying `Worker` during Nest bootstrap,
   * after the host provider's constructor runs.
   */
  register(name: string, probe: () => boolean): void {
    this.probes.set(name, probe)
  }

  /**
   * True iff a worker registered under `name` exists AND its probe currently
   * reports it running. A missing registration or a throwing probe → false
   * (fail closed: an unknown or erroring worker is not a ready worker).
   */
  isLive(name: string): boolean {
    const probe = this.probes.get(name)
    if (!probe) return false
    try {
      return probe() === true
    } catch {
      return false
    }
  }

  /** Per-worker liveness snapshot for the readiness payload / diagnostics. */
  snapshot(): Record<string, boolean> {
    const out: Record<string, boolean> = {}
    for (const [name, probe] of this.probes) {
      try {
        out[name] = probe() === true
      } catch {
        out[name] = false
      }
    }
    return out
  }
}
