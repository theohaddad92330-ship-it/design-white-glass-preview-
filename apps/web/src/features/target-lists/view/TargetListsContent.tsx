import { useState } from 'react'
import { Text } from '@bellum/ui'
import { Link, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { AskLaura } from '@/components/primitives/AskLaura'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import { PlanFeatureLocked } from '@/features/plan-features/PlanFeatureLocked'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'
import { SignalsLibrary } from '@/features/watchlist/view/SignalsLibrary'
import { WatchesPage } from '@/features/watchlist/view/WatchesPage'
import { TargetSignalsSection } from './TargetSignalsSection'

/**
 * « Signaux » (Théo signaux) : la bibliothèque de signaux de l'espace — cartes à plat, ou regroupées par compte.
 *
 * `?view=veilles` ouvre « Mes veilles » (Théo signaux-veilles) : règles, comptes suivis et alertes de recherche,
 * leur seul éditeur (GA-26). Les listes de cibles ont quitté l'écran (#4088.8, lentille de /accounts) et les
 * comptes suivis vivent désormais dans Mes veilles.
 */
export function TargetListsContent() {
  const { t } = useTranslation('targets')
  const { t: tWatchlist } = useTranslation('watchlist')
  const { allowed } = usePlanFeature('watchlist')
  const search = useSearch({ strict: false }) as { view?: string }
  const [view, setView] = useState<'list' | 'byAccount'>('list')
  // #1904.14 — Laura sait quel écran est ouvert.
  useLauraContext({ kind: 'screen', label: t('page.title'), entityId: null, facets: [], state: 'ready' })

  if (!allowed) {
    return (
      <div className={PAGE_GUTTER_X}>
        <PlanFeatureLocked feature="watchlist" compact />
      </div>
    )
  }
  if (search.view === 'veilles') return <WatchesPage />

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <SignalsLibrary
        view={view}
        onViewChange={setView}
        byAccount={<TargetSignalsSection />}
        headerExtra={<AskLaura question={tWatchlist('page.askLaura')} label={tWatchlist('page.askLauraLabel')} />}
      />
      {/* #4545 — les Pistes ont quitté Signaux (revient sur #4340) : elles vivent dans le panneau du Pipe. */}

      {/* #4088.8 — les listes de cibles vivent dans Comptes › Listes : un lien court les retrouve. */}
      <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]" className={PAGE_GUTTER_X}>
        {t('page.listsHint')}{' '}
        <Link to="/accounts" search={{ lens: 'lists' }} className="text-[var(--bellum-text-accent)] hover:underline">
          {t('page.listsLink')}
        </Link>
        .
      </Text>
    </div>
  )
}
