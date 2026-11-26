import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FilterChips, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@bellum/ui'
import { ActionCenter } from '@/features/action-os/view/ActionCenter'
import { ActionHistoryJournal } from '@/features/action-history/view/ActionHistoryJournal'

/**
 * Lot L-A (#4164) — LE TIROIR « HISTORIQUE ».
 *
 * La page répond à « qu'est-ce que je fais maintenant ? » ; le tiroir répond aux
 * deux autres questions, « qu'est-ce qui s'est passé ? » (le journal) et « où en
 * est l'exécution ? » (les runs en cours, terminés, à reprendre — et, tant que
 * le lot D ne les a pas déplacées, les routines planifiées, le catalogue
 * d'automatisations et les demandes reportées). Aucune de ces vues n'est
 * réécrite : le journal et le Centre d'actions sont les mêmes composants,
 * seulement posés ailleurs.
 */
export type HistoryTab = 'journal' | 'running' | 'done' | 'failed' | 'scheduled' | 'workflows' | 'snoozed'

const TABS: readonly HistoryTab[] = ['journal', 'running', 'done', 'failed', 'scheduled', 'workflows', 'snoozed']

export function HistoryDrawer({
  open,
  onOpenChange,
  initialTab = 'journal',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTab?: HistoryTab
}) {
  const { t } = useTranslation('actions')
  const [tab, setTab] = useState<HistoryTab>(initialTab)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" closeLabel={t('today.burst.close')} className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{t('today.drawer.title')}</SheetTitle>
          <SheetDescription>{t('today.drawer.description')}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          <FilterChips
            ariaLabel={t('today.drawer.title')}
            options={TABS.map(key => ({ value: key, label: t(`today.drawer.tabs.${key}`) }))}
            value={tab}
            // #18 — la rangée passe à la ligne (libellés compris), jamais coupée par le tiroir.
            className="min-w-0 max-w-full"
            wrapLabels
            onChange={next => next && setTab(next)}
          />
          {tab === 'journal' ? <ActionHistoryJournal /> : <ActionCenter historyTab={tab} />}
        </div>
      </SheetContent>
    </Sheet>
  )
}
