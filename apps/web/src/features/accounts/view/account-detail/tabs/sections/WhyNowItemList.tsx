import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DotIndicator,
  Text,
  cn,
} from '@bellum/ui'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SignalSourceLink } from '@/components/primitives/SignalSourceLink'
import { OfferRequesterLine } from '@/features/discover/view/OfferRequesterLine'
import type { WhyNowDetailRow, WhyNowItem } from './whyNowDetails'

const VISIBLE_ITEM_COUNT = 3

type WhyNowItemListProps = {
  items: WhyNowItem[]
  dotClassName: string
  emptyLabel: string
}

function getDetailIcon(row: WhyNowDetailRow): LucideIcon {
  return row.icon ?? Info
}

function DetailIcon({ row, className }: { row: WhyNowDetailRow; className?: string }) {
  const Icon = getDetailIcon(row)
  return <Icon className={cn('h-3.5 w-3.5 shrink-0', className, row.iconClassName)} />
}

function DetailRow({ row }: { row: WhyNowDetailRow }) {
  return (
    <div className="grid gap-1 border-b border-[var(--bellum-border)] py-4 last:border-0">
      <div className="flex items-center gap-2">
        <DetailIcon row={row} className="text-[var(--bellum-text-muted)]" />
        <Text element="span" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
          {row.label}
        </Text>
      </div>
      <Text element="p" size="sm" className="text-[var(--bellum-text-primary)] leading-relaxed">
        {row.value}
      </Text>
    </div>
  )
}

export function WhyNowItemList({ items, dotClassName, emptyLabel }: WhyNowItemListProps) {
  const { t } = useTranslation('accountDetail')
  const [expanded, setExpanded] = useState(false)
  const [selectedItem, setSelectedItem] = useState<WhyNowItem | null>(null)
  // #3668.7 — un élément épinglé (le contexte) reste visible même au-delà des trois premiers.
  const visibleItems = expanded
    ? items
    : [...items.slice(0, VISIBLE_ITEM_COUNT), ...items.slice(VISIBLE_ITEM_COUNT).filter(item => item.pinned)]
  const hiddenCount = items.length - visibleItems.length
  const canExpand = hiddenCount > 0 || (expanded && items.length > VISIBLE_ITEM_COUNT)

  if (items.length === 0) {
    return (
      <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]" className="italic">
        {emptyLabel}
      </Text>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {visibleItems.map(item => (
          <div key={item.id}>
            <button
              type="button"
              onClick={() => setSelectedItem(item)}
              className="flex w-full gap-3 rounded-lg p-2 text-left transition-colors hover:bg-[var(--bellum-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
            >
              <DotIndicator className={cn('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', dotClassName)} />
              <Text
                element="span"
                size="sm"
                className="min-w-0 line-clamp-3 flex-1 text-[var(--bellum-text-primary)]/90"
              >
                {item.title}
              </Text>
            </button>
            {item.meta ? (
              <Text
                element="p"
                size="xs"
                className="pl-7 text-[var(--bellum-text-muted)]"
                data-testid="why-now-item-meta"
              >
                {item.meta}
              </Text>
            ) : null}
            {/* #4286.11 — « Demandeur probable » (étayé) ou « à identifier » + méthode ; sans dossier, aucune ligne. */}
            {item.requester ? (
              <div className="pl-7 text-xs text-[var(--bellum-text-secondary)]">
                <OfferRequesterLine requester={item.requester} />
              </div>
            ) : null}
            {/* #3925 — le lien vers la source sur la carte elle-même (hors du bouton : pas d'interactif imbriqué). */}
            {item.source ? (
              <div className="pl-7">
                <SignalSourceLink url={item.source.url} sourceKind={item.source.sourceKind} />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {canExpand && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          icon={expanded ? ChevronUp : ChevronDown}
          onClick={() => setExpanded(value => !value)}
          className="mt-4 text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]"
        >
          {expanded ? t('common:actions.seeLess') : t('whyNow.showMore', { count: hiddenCount })}
        </Button>
      )}

      <Dialog open={selectedItem !== null} onOpenChange={open => !open && setSelectedItem(null)}>
        <DialogContent
          closeLabel={t('common:actions.close')}
          className="flex max-h-[86dvh] flex-col overflow-hidden border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-0 sm:max-w-2xl"
        >
          <DialogHeader className="shrink-0 border-b border-[var(--bellum-border)] p-6 pr-14">
            <DialogTitle className="text-xl leading-snug text-[var(--bellum-text-primary)]">
              {selectedItem?.title}
            </DialogTitle>
            <DialogDescription className="text-sm text-[var(--bellum-text-muted)]">
              {t('whyNow.dialogDescription')}
            </DialogDescription>
          </DialogHeader>
          {/* Même défaut que #1081 : un titre sur deux lignes dépassait les 130 px
              supposés et la dernière ligne du corps devenait inatteignable. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 md:px-6 py-2">
            {selectedItem?.details.map(row => (
              <DetailRow key={row.label} row={row} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
