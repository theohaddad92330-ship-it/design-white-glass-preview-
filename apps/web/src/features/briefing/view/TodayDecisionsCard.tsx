import { Box, Text } from '@bellum/ui'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Refonte Théo (A · today-jour) — « Tes décisions », UNE carte à deux vues :
 * « Arbitrages » (les trois décisions du jour, `DecisionsSection`) et « Gestes de
 * suivi » (`DailyGesturesBlock`). Deux vrais onglets : chacun n'affiche que son
 * contenu, jamais deux blocs empilés. Sans arbitrage du jour, la carte s'ouvre sur
 * les gestes — une absence ne fait aucun onglet vide (GA-18).
 */
export function TodayDecisionsCard({
  decisions,
  decisionCount,
  gestures,
}: {
  decisions: ReactNode | null
  decisionCount: number
  gestures: ReactNode
}) {
  const { t } = useTranslation('briefing')
  const hasDecisions = decisions !== null && decisionCount > 0
  const [tab, setTab] = useState<'decisions' | 'gestures'>(hasDecisions ? 'decisions' : 'gestures')
  const current = hasDecisions ? tab : 'gestures'
  const seg = (active: boolean) =>
    `min-h-11 rounded-control px-3 text-sm font-medium transition-colors duration-immediate ease-bellum-out ${
      active
        ? 'bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]'
        : 'text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]'
    }`
  return (
    <Box
      as="section"
      aria-labelledby="today-decisions-title"
      className="flex min-w-0 flex-col gap-4 rounded-card border border-[var(--bellum-border)] bg-card p-5"
    >
      <Box className="flex flex-col gap-1">
        <Text id="today-decisions-title" element="h2" size="lg" weight="semibold">
          {t('decisions.title')}
        </Text>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('today.decisions.note')}
        </Text>
      </Box>
      <Box
        role="tablist"
        aria-label={t('today.decisions.label')}
        className="flex w-fit gap-1 rounded-control border border-[var(--bellum-border)] p-1"
      >
        {hasDecisions ? (
          <button
            type="button"
            role="tab"
            aria-selected={current === 'decisions'}
            className={seg(current === 'decisions')}
            onClick={() => setTab('decisions')}
          >
            {t('today.decisions.arbitrations', { count: decisionCount })}
          </button>
        ) : null}
        <button
          type="button"
          role="tab"
          aria-selected={current === 'gestures'}
          className={seg(current === 'gestures')}
          onClick={() => setTab('gestures')}
        >
          {t('today.decisions.gestures')}
        </button>
      </Box>
      <Box role="tabpanel" className="min-w-0">
        {current === 'decisions' ? decisions : gestures}
      </Box>
    </Box>
  )
}
