import type { WeakestLinkDiagnosis } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * BEL-SC-224 (#3253, P0) — LA façade réseau du diagnostic du maillon faible.
 * Un seul point d'appel pour toutes les surfaces (Aujourd'hui, Pilotage…) —
 * jamais une lecture locale d'un calcul qui vit côté API.
 */
export const weakestLinkDiagnosisKeys = {
  current: () => ['weakest-link-diagnosis'] as const,
}

export const weakestLinkDiagnosisApi = {
  get: () => apiFetch<WeakestLinkDiagnosis>({ path: '/weakest-link-diagnosis', timeoutMs: 30_000 }),
}
