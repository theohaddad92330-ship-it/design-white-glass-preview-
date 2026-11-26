import type { ActiveAnalysisRun } from '@bellum/contracts'
import { Box, Spinner, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useActiveAnalysisRuns } from '../hooks/useActiveAnalysisRuns'

/**
 * #2145.9 / #2100.9 — « job important en attente → mis en avant par
 * Laura/Aujourd'hui ». La tranche verticale minimale : Aujourd'hui LIT le job
 * existant (`GET /accounts/analyzing`, service déjà cloisonné) et l'affiche en
 * une ligne. Aucun moteur de « job important » à part entière : une analyse en
 * cours EST le job important du portefeuille — il n'y en a jamais quinze à la
 * fois (au plus 3, bornés côté serveur).
 *
 * « On n'affiche pas ce qu'on n'a pas » : rien ne se rend tant qu'aucun job ne
 * tourne, jamais un titre vide.
 */
export function ActiveAnalysisBanner() {
  const { t } = useTranslation('briefing')
  const { data: runs } = useActiveAnalysisRuns()
  if (!runs || runs.length === 0) return null

  const [first, ...rest] = runs
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(first.started_at)) / 60_000))

  return (
    <Box
      role="status"
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] px-4 py-2.5"
    >
      <Spinner size={14} className="shrink-0 text-[var(--bellum-text-secondary)]" />
      <Link to="/accounts/$id" params={{ id: first.account_id }} className="min-w-0">
        <Text size="sm" weight="medium" className="truncate text-[var(--bellum-text-primary)]">
          {t(rest.length > 0 ? 'activeAnalysis.multiple' : 'activeAnalysis.single', {
            company: first.company_name,
            count: rest.length,
          })}
        </Text>
      </Link>
      {Number.isFinite(minutes) ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('activeAnalysis.since', { minutes })}
        </Text>
      ) : null}
    </Box>
  )
}
