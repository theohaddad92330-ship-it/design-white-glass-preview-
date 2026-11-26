import type { ExportHistoryEntry } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * Server-authoritative RGPD export — the full JSON copy of the signed-in user's
 * own data, aggregated by the API (`GET /privacy/export`). Typed loosely on the
 * client: the browser only downloads it, the API owns the exact shape.
 */
/**
 * ⚠️ NON exporté depuis le 01/09/2026 : son seul consommateur externe était
 * `export-user-data.ts`, retiré avec le bouton qu'il servait (l'export vit
 * maintenant sur `/settings/mes-donnees`). Un type exporté sans lecteur est
 * exactement ce que knip refuse.
 */
type PrivacyExportPayload = {
  exportedAt: string
  userId: string
} & Record<string, unknown>

/** What `POST /privacy/delete-account` reports back — used to confirm the erasure. */
export type DeletionSummary = {
  anonymized: { profile: boolean; contacts: number; ragDocuments: number }
  /**
   * #1939.9 — les enregistrements VOCAUX de la personne, EFFACÉS (pas anonymisés :
   * décision du 12/09, « tout effacer tout de suite »). `deferredToNextPurge` > 0
   * quand le stockage a refusé l'effacement : la purge de la nuit les reprend.
   * Optionnel : une API antérieure au message vocal ne le sert pas.
   */
  voiceMessages?: { erased: number; deferredToNextPurge: number }
  sessionsRevoked: number
  subscriptionCanceled: boolean
  retained: string[]
}

/** One row of the retention register served by `GET /privacy/retention` (days `null` = life of the account). */
type RetentionRule = { key: string; label: string; days: number | null; rationale: string }

/** #4295.15 — the register as the API applies it; `sweepEnabled` says whether the purge actually runs. */
type RetentionPolicy = { rules: RetentionRule[]; sweepEnabled: boolean }

/**
 * HTTP client for the `/privacy/*` endpoints (RGPD self-serve). Auth travels via
 * the HttpOnly session cookies (`apiFetch` sends `credentials: 'include'`), so no
 * token is passed explicitly — the API scopes every response to the caller.
 */
export const privacyApi = {
  /** Download a complete copy of my data (art. 15 & 20). */
  exportData(): Promise<PrivacyExportPayload> {
    return apiFetch<PrivacyExportPayload>({ path: '/privacy/export' })
  },

  /** #4295.15 — le registre des durées de conservation, tel que le code l'applique. */
  retention(): Promise<RetentionPolicy> {
    return apiFetch<RetentionPolicy>({ path: '/privacy/retention' })
  },

  /**
   * #2439.7/.8/.17 — « Mes exports » : les vingt derniers exports personnels,
   * les plus récents d'abord. Vide pour un compte qui n'a encore rien
   * exporté — jamais une ligne inventée.
   */
  exportHistory(): Promise<ExportHistoryEntry[]> {
    return apiFetch<ExportHistoryEntry[]>({ path: '/privacy/export/history' })
  },

  /** Erase (anonymise) my account (art. 17). `confirm` must be the exact phrase. */
  deleteAccount(confirm: string): Promise<DeletionSummary> {
    return apiFetch<DeletionSummary, { confirm: string }>({
      path: '/privacy/delete-account',
      method: 'POST',
      body: { confirm },
    })
  },
}
