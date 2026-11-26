/**
 * Per-phase network timeout budgets (ms). Phase 1 carries a ~500k-char prompt to
 * Claude on top of Brave + Firecrawl + Pappers, so it gets the largest budget;
 * Phase 3 fans out N parallel BELLUM-CONTACTS batches + BELLUM-ORGANIGRAMME.
 *
 * Shared source of truth: the pipeline worker sizes its BullMQ lock from these,
 * and the on-demand single-phase runs (the "Enrichir"/"Actualiser" buttons) use
 * them as per-call `timeoutMs` so a click that legitimately takes minutes isn't
 * killed by the HttpClient 30s default.
 */
/**
 * ⚠️ CHAQUE valeur doit rester STRICTEMENT SUPÉRIEURE au budget de la même
 * phase dans `apps/ia/app/graph/builder.py` (`PHASE_TIMEOUTS_S`).
 *
 * C'est la règle « le budget intérieur ne dépasse jamais sa passerelle » : si
 * l'API coupe la première, le graphe n'a jamais l'occasion de convertir son
 * dépassement en message typé, et l'utilisateur reçoit « analyse interrompue »
 * au lieu de « l'étape plan d'action a dépassé son temps de calcul ». La
 * garde-fou qui EXISTE pour rendre la panne lisible devient alors la première
 * chose que la panne emporte.
 *
 * Les deux constantes vivent dans deux langages qui ne s'importent pas — c'est
 * `apps/ia/tests/test_phase_budget_gateway.py` qui LIT ce fichier et fait
 * échouer la CI si l'ordre s'inverse. Le 31/08/2026, remonter le budget du plan
 * de 260 à 350 s côté graphe l'aurait inversé ici, où il valait 300.
 */
export const PHASE_TIMEOUT_MS: Record<'research' | 'contacts' | 'classify' | 'plan', number> = {
  research: 480_000,
  contacts: 180_000,
  classify: 240_000,
  plan: 440_000,
}

/**
 * LOT (15/10) DATA-C — ce que la voie « lot » (Message Batches, moitié prix)
 * ajoute au budget de la phase 1 du refresh NOCTURNE : le service IA attend un
 * lot au plus `LLM_BATCH_MAX_WAIT_S` (240 s par défaut, `apps/ia/app/services/
 * llm_batch.py`), puis repart en synchrone. 300 s = cette attente + marge. Le
 * bouton « Actualiser » ne prend jamais cette voie : son budget est inchangé.
 */
export const BATCH_LANE_EXTRA_MS = 300_000

/** Longest single-phase network budget — the floor the worker lock must clear. */
export const MAX_PHASE_TIMEOUT_MS = Math.max(...Object.values(PHASE_TIMEOUT_MS))

/**
 * Hard ceiling on a single full analysis run (4 phases). A job that outlives this
 * is considered stuck: the worker aborts it via ``AbortSignal.timeout`` and the
 * background reaper flips any account still ``analyzing`` past this age — with no
 * active BullMQ job — to ``error`` so it can't stay stuck forever (Redis eviction
 * / Railway redeploy killing the worker before its terminal event fires).
 *
 * Shared source of truth so the worker's abort budget and the reaper's staleness
 * cutoff can never drift apart.
 */
export const JOB_TIMEOUT_MS = 1_200_000

/**
 * The four pipeline phases, in execution order. Mirrors the graph's own phase
 * list (``apps/ia/app/graph/events.py``).
 */
export const PROGRESS_PHASES = ['research', 'contacts', 'classify', 'plan'] as const

/**
 * Cumulative progress reached once a given phase COMPLETES. Mirrors
 * ``PHASE_PROGRESS`` in ``apps/ia/app/graph/events.py`` — the same numbers the
 * live ``phase:complete`` events carry, so a client seeded from persisted
 * checkpoints lands on exactly the value the stream would have given it, and
 * the bar never jumps when events resume.
 */
export const PHASE_PROGRESS: Record<(typeof PROGRESS_PHASES)[number], number> = {
  research: 25,
  contacts: 50,
  classify: 75,
  plan: 100,
}
