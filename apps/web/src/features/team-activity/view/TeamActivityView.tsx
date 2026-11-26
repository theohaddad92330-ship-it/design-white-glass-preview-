import { Box, Text } from '@bellum/ui'
import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import { ActivityJournal } from './ActivityJournal'
import { TeamDiscussions } from './TeamDiscussions'

type Tab = 'journal' | 'discussions'
const TABS: readonly Tab[] = ['journal', 'discussions']

/**
 * Équipe › Activité & échanges (Théo D team-activite). Deux onglets : le journal des FAITS et les
 * sujets d'équipe. « Pas de surveillance de présence » : aucune ligne ne dit qui a regardé quoi.
 */
export const TeamActivityView = memo(function TeamActivityView({ initialTab = 'journal' }: { initialTab?: Tab }) {
  const { t } = useTranslation('teamActivity')
  const [tab, setTab] = useState<Tab>(initialTab)

  // #1904 — ce que l'écran déclare à Laura : son utilité et l'onglet ouvert.
  useLauraContext({
    kind: 'screen',
    label: t('title'),
    entityId: null,
    facets: [{ label: t('laura.tab'), value: t(`tabs.${tab}`) }],
    state: 'ready',
    purpose: t('laura.purpose'),
  })

  return (
    <div className="w-full space-y-6">
      <Box>
        <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
          {t('eyebrow')}
        </Text>
        <Text element="h1" size="2xl" weight="bold">
          {t('title')}
        </Text>
        <Text size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('subtitle')}
        </Text>
      </Box>

      <div role="tablist" aria-label={t('tabs.label')} className="flex flex-wrap gap-2">
        {TABS.map(key => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`min-h-11 rounded-md border px-4 text-sm ${
              tab === key
                ? 'border-[var(--bellum-border-strong)] bg-[var(--bellum-surface-2)] font-semibold'
                : 'border-[var(--bellum-border)]'
            }`}
            onClick={() => setTab(key)}
          >
            {t(`tabs.${key}`)}
          </button>
        ))}
      </div>

      <div role="tabpanel">{tab === 'journal' ? <ActivityJournal /> : <TeamDiscussions />}</div>
    </div>
  )
})
