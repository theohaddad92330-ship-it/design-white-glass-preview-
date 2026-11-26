import type { Account, Contact, RecordFieldAudit } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import {
  deriveKnownContactsSummary,
  deriveKnownCorrectionsSummary,
  deriveKnownFreshSignalsSummary,
  deriveKnownWorkspaceAnalysisSummary,
} from '../lib/knownAccountSummary'

export type KnownInput = {
  account: Account | null
  contacts: readonly Contact[]
  corrections: readonly RecordFieldAudit[] | undefined
}

/**
 * Les phrases de « ce que Bellum sait déjà », dans l'ordre où on les lit. Chaque phrase n'existe que
 * si sa donnée existe (« on n'affiche pas ce qu'on n'a pas ») : un compte jamais analysé n'en a aucune.
 */
export function useKnownLine({ account, contacts, corrections }: KnownInput): string[] {
  const { t } = useTranslation('search')
  const lines: string[] = []
  const workspace = deriveKnownWorkspaceAnalysisSummary(account)
  const date = workspace ? formatDate(workspace.lastAnalyzedAt, { day: 'numeric', month: 'short' }) : null
  if (date) lines.push(t('analyze.known.analysedOn', { date }))
  const people = deriveKnownContactsSummary(contacts)
  if (people) {
    lines.push(t('analyze.known.contacts', { count: people.total }))
    const checked = [
      people.facts > 0 ? t('confirm.known.facts', { count: people.facts }) : null,
      people.hypotheses > 0 ? t('confirm.known.hypotheses', { count: people.hypotheses }) : null,
    ].filter(Boolean)
    if (checked.length > 0) lines.push(checked.join(', '))
  }
  const fresh = deriveKnownFreshSignalsSummary(account)
  if (fresh) lines.push(t('analyze.known.signals', { count: fresh.current }))
  const fixes = deriveKnownCorrectionsSummary(corrections)
  if (fixes) lines.push(t('analyze.known.corrections', { count: fixes.total }))
  return lines
}
