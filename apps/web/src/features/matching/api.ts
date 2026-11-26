import type {
  InverseMatch,
  MatchExplanation,
  MatchRun,
  MatchWeightSettings,
  NeedAutoMatch,
  Shortlist,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/** Ce que le modal de positionnement annonce avant d'écrire (§10.1). */
type SubmissionPreflight = {
  creates: string[]
  canPrepare: { action: string; label: string; defaultChecked: boolean }[]
  checks: { level: 'ok' | 'warning' | 'blocking'; label: string }[]
  blocked: boolean
  missing: string[]
}

/** Le message au client, préparé — jamais envoyé d'ici. */
type PreparedClientMessage = {
  recipient: { contactId: string; email: string | null; fullName: string } | null
  subject: string
  body: string
  showRate: boolean
}

export const matchingApi = {
  run(needId: string): Promise<MatchRun> {
    return apiFetch<MatchRun>({ path: `/needs/${needId}/match`, method: 'POST' })
  },
  /** #2916 / #2399.2 (c93) — le matching AUTOMATIQUE du besoin : une LECTURE, rien n'est relancé. */
  autoMatch(needId: string): Promise<{ autoMatch: NeedAutoMatch | null }> {
    return apiFetch<{ autoMatch: NeedAutoMatch | null }>({ path: `/needs/${needId}/match/auto` })
  },
  inverse(consultantId: string, scope: 'mine' | 'all'): Promise<InverseMatch> {
    return apiFetch<InverseMatch>({
      path: `/consultants/${consultantId}/match-inverse?scope=${scope}`,
      method: 'POST',
    })
  },
  explain(needId: string, runId: string, consultantId: string): Promise<MatchExplanation> {
    return apiFetch<MatchExplanation>({
      path: `/needs/${needId}/match/explain?runId=${runId}&consultantId=${consultantId}`,
    })
  },
  weights(): Promise<MatchWeightSettings> {
    return apiFetch<MatchWeightSettings>({ path: '/matching/weights' })
  },
  saveWeights(body: { weights: Record<string, number>; threshold: number }) {
    return apiFetch({ path: '/matching/weights', method: 'PUT', body })
  },
  createShortlist(needId: string, body: { runId: string; consultantIds: string[] }): Promise<Shortlist> {
    return apiFetch<Shortlist>({ path: `/needs/${needId}/shortlists`, method: 'POST', body })
  },
  listShortlists(needId: string): Promise<Shortlist[]> {
    return apiFetch<Shortlist[]>({ path: `/needs/${needId}/shortlists` })
  },
  duplicateShortlist(id: string, keep?: string[]): Promise<Shortlist> {
    return apiFetch<Shortlist>({ path: `/shortlists/${id}/duplicate`, method: 'POST', body: { keep } })
  },
  preview(needId: string, body: { runId: string; consultantId: string }): Promise<SubmissionPreflight> {
    return apiFetch<SubmissionPreflight>({ path: `/needs/${needId}/submissions/preview`, method: 'POST', body })
  },
  position(
    needId: string,
    body: { runId: string; consultantId: string; acknowledgement?: string; prepare?: string[] },
  ) {
    return apiFetch({ path: `/needs/${needId}/submissions`, method: 'POST', body })
  },
  clientMessage(needId: string, body: { runId: string; consultantIds: string[] }): Promise<PreparedClientMessage> {
    return apiFetch<PreparedClientMessage>({ path: `/needs/${needId}/match/client-message`, method: 'POST', body })
  },
  /**
   * Le document d'explication, dans sa version REMETTABLE.
   *
   * ⚠️ Il se récupérait par `window.open('/needs/…&format=md')`. Deux défauts
   * dans une ligne, et aucun test ne pouvait les voir : l'application et l'API
   * ne partagent PAS d'origine (`VITE_API_URL`), si bien que ce chemin nu
   * ouvrait l'application elle-même ; et un onglet ouvert à la main part sans
   * l'en-tête d'identité que pose `apiFetch`, donc sans session. C'est le même
   * défaut que GA-45 a corrigé sur les autres exports de documents.
   *
   * Le fichier arrive donc par le client authentifié, puis il est remis au
   * navigateur (`toMarkdownDownload`).
   */
  explainMarkdown(needId: string, runId: string, consultantId: string): Promise<string> {
    return apiFetch<string>({
      path: `/needs/${needId}/match/explain?runId=${runId}&consultantId=${consultantId}&format=md`,
      responseType: 'text',
    })
  },
}
