import { isReportStatus, type ReportStatus } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import type { FeedbackCategory } from './api'

/**
 * #1960.10 — un signalement tel que « Mes signalements » le lit, et rien de plus.
 *
 * Ni lien, ni page, ni capture, ni journaux : la liste blanche est tenue côté
 * API, et ce type la redit côté écran — ce qui n'y est pas ne peut pas
 * s'afficher par accident.
 */
export type MyReport = {
  id: string
  createdAt: string
  category: FeedbackCategory | null
  /** SON texte — ce que la personne a écrit. */
  message: string
  /** Le numéro à citer à l'équipe ; `null` quand aucun n'a été attribué. */
  reference: number | null
  /** `null` = état indisponible — jamais « reçu » par défaut. */
  status: ReportStatus | null
}

const CATEGORIES: readonly FeedbackCategory[] = ['bug', 'metier', 'autre']
/** Au-delà, la ligne se coupe : la liste résume, elle ne relit pas le signalement. */
const SUMMARY_MAX = 160

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

/**
 * La réponse de `GET /feedback`, lue avec TOLÉRANCE.
 *
 * Le web et l'API se déploient séparément : quelques minutes durant, cet écran
 * peut parler à une API qui rend encore l'ancienne forme — sans `status`, le
 * numéro sous `github_issue_number`. L'état vaut alors `null` (indisponible,
 * jamais « reçu ») et le numéro se retrouve sous son ancien nom plutôt que de
 * s'afficher « sans numéro » à tort. Aucun autre champ n'est recopié.
 */
export function normalizeMyReports(payload: unknown): MyReport[] {
  const items = isRecord(payload) && Array.isArray(payload['items']) ? payload['items'] : []
  return items.flatMap((item): MyReport[] => {
    if (!isRecord(item)) return []
    const { id, created_at: createdAt, message, category, status } = item
    if (typeof id !== 'string' || typeof createdAt !== 'string' || typeof message !== 'string') return []
    return [
      {
        id,
        createdAt,
        category: CATEGORIES.find(known => known === category) ?? null,
        message,
        reference: numberOrNull(item['reference']) ?? numberOrNull(item['github_issue_number']),
        status: isReportStatus(status) ? status : null,
      },
    ]
  })
}

/** La première ligne écrite, coupée si elle ne tient pas — et la coupe se voit. */
export function reportSummary(message: string): string {
  const firstLine =
    message
      .split('\n')
      .map(line => line.trim())
      .find(line => line.length > 0) ?? ''
  return firstLine.length > SUMMARY_MAX ? `${firstLine.slice(0, SUMMARY_MAX - 1).trimEnd()}…` : firstLine
}

export const myReportsApi = {
  async list(): Promise<MyReport[]> {
    return normalizeMyReports(await apiFetch<unknown>({ path: '/feedback' }))
  },
}
