import type { TFunction } from 'i18next'
import type { Account } from '@bellum/contracts'
import { accountVerdictFromScore, parseAccountAnalysis } from '@bellum/contracts'
import { Activity, AlertTriangle, Briefcase, Clock, Gauge, Radio, Users, type LucideIcon } from 'lucide-react'
import { formatActionDate } from './actionHistoryPresentation'

type AccountSummaryRow = { icon: LucideIcon; label: string; value: string }

/**
 * Rows enriching an account-linked history event with the dossier facts that
 * are ALREADY stored on the account — status, verdict (in words), sector,
 * contacts count, dominant signal, last refresh. Every row reads a real value;
 * a missing fact drops the row instead of inventing one (JAMAIS de données
 * fictives). Empty when no account is loaded.
 */
export function buildAccountSummaryRows(
  t: TFunction<'actions'>,
  account: Account | null,
  contactsCount: number,
): AccountSummaryRow[] {
  if (!account) return []
  const rows: AccountSummaryRow[] = [
    { icon: Activity, label: t('detail.analysisStatus'), value: accountAnalysisStatusLabel(t, account.status) },
  ]

  // La CAUSE de l'échec, juste sous le statut.
  //
  // Trouvé en recette le 17/08 : le détail d'une analyse échouée affichait
  // « Échouée » et sa durée, rien d'autre — pas de raison, pas de reprise. La
  // fiche du compte, elle, disait « le worker n'a pas répondu à temps ». Deux
  // écrans sur le même incident, l'un muet : celui qu'on ouvre depuis le journal
  // pour comprendre ce qui s'est passé. Le champ était déjà chargé.
  const failure = account.error_message?.trim()
  if (failure) rows.push({ icon: AlertTriangle, label: t('detail.failureReason'), value: failure })

  // Refonte Théo (Louis 23/10) — aucun score en points : le verdict se dit EN MOTS, le /10 ne s'affiche plus.
  const verdict = accountVerdictFromScore(account.priority_score)
  if (verdict) rows.push({ icon: Gauge, label: t('detail.verdict'), value: verdict })

  const sector = account.sector?.trim()
  if (sector) rows.push({ icon: Briefcase, label: t('detail.sector'), value: sector })

  if (contactsCount > 0) {
    rows.push({ icon: Users, label: t('detail.contactsCount'), value: String(contactsCount) })
  }

  const dominantSignal = firstSignalLabel(account)
  if (dominantSignal) rows.push({ icon: Radio, label: t('detail.dominantSignal'), value: dominantSignal })

  rows.push({ icon: Clock, label: t('detail.refreshedAt'), value: formatActionDate(account.updated_at) })
  return rows
}

/** Label of the most recent non-empty signal in the stored dossier, or null. */
function firstSignalLabel(account: Account): string | null {
  const analysis = parseAccountAnalysis(account.raw_analysis)
  const signal = analysis.recent_signals?.find(item => (item?.signal ?? '').trim().length > 0)?.signal
  return signal?.trim() || null
}

/** Human label for an analysis/run status; unknown values are shown as-is. */
export function accountAnalysisStatusLabel(t: TFunction<'actions'>, status: string): string {
  return t(`detail.accountStatus.${status}`, { defaultValue: status })
}

/** Wall-clock duration of a run, or null when it never completed / is invalid. */
export function formatRunDuration(
  t: TFunction<'actions'>,
  createdAt: string,
  completedAt: string | null,
): string | null {
  if (!completedAt) return null
  const ms = new Date(completedAt).getTime() - new Date(createdAt).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return null
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0
    ? t('detail.durationMinSec', { min: minutes, sec: seconds })
    : t('detail.durationSec', { sec: seconds })
}
