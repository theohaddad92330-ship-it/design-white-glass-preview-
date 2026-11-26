import type { CompetitiveStrategy } from '@bellum/contracts'
import {
  Button,
  Card,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Text,
} from '@bellum/ui'
import { ArrowRight, Swords } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { competitorsBeyondIncumbents } from './competitorOverlap'

export function CompetitivePositioningCard({
  strategy,
  excludeCompetitors = [],
}: {
  strategy: CompetitiveStrategy
  /** #4323.3 — les sociétés que « ESN déjà en place » porte déjà (avec leur angle) : elles ne se relisent pas ici. */
  excludeCompetitors?: readonly string[]
}) {
  const { t } = useTranslation('accountDetail')
  const [sheetOpen, setSheetOpen] = useState(false)
  // #4323.2 — le compte et la liste viennent de la MÊME liste : celle qui se rend (dédoublonnée).
  const competitors = competitorsBeyondIncumbents(
    distinctCompetitors(strategy.vs_competitors ?? []),
    excludeCompetitors,
  )

  return (
    <>
      <Card className="gap-0 overflow-hidden p-0 [--card-spacing:0px]">
        <Header count={competitors.length} />
        {strategy.positioning_statement ? <PositioningPreview value={strategy.positioning_statement} /> : null}
        <CompetitorPreview competitors={competitors} />
        <div className="border-t border-[var(--bellum-border)] p-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={ArrowRight}
            iconPosition="right"
            fullWidth
            className="justify-between"
            onClick={() => setSheetOpen(true)}
          >
            {t('cta.viewDetail')}
          </Button>
        </div>
      </Card>
      <StrategySheet open={sheetOpen} strategy={strategy} competitors={competitors} onOpenChange={setSheetOpen} />
    </>
  )
}

function Header({ count }: { count: number }) {
  const { t } = useTranslation('accountDetail')
  return (
    <div className="flex items-center gap-3 px-4 py-4">
      <div className="flex shrink-0 items-center justify-center rounded-md">
        <Swords className="size-4 text-[var(--bellum-text-accent)]" />
      </div>
      <div className="min-w-0">
        <Text element="h3" size="sm" weight="semibold">
          {t('positioning.title')}
        </Text>
        {/* #4323.3 — une absence ne fait pas de « 0 concurrent » : tous déjà nommés plus haut, le compteur s'efface. */}
        {count > 0 ? (
          // #4323.1 — le libellé dit la POPULATION comptée (les concurrents analysés pour notre angle) : ce n'est
          // pas le total des ESN présentes de l'autre rubrique, et l'écart entre les deux chiffres s'explique ici.
          <Text size="xs" className="text-[var(--bellum-text-muted)]" data-testid="positioning-count">
            {t('positioning.competitorCount', { count })}
          </Text>
        ) : null}
      </div>
    </div>
  )
}

function PositioningPreview({ value }: { value: string }) {
  const { t } = useTranslation('accountDetail')
  return (
    <div className="border-y border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-4 py-3">
      <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
        {t('positioning.recommendedAngle')}
      </Text>
      <Text size="xs" className="mt-1.5 line-clamp-3 leading-relaxed text-[var(--bellum-text-primary)]">
        {value}
      </Text>
    </div>
  )
}

type Competitor = NonNullable<CompetitiveStrategy['vs_competitors']>[number]

// #4323.2 — un concurrent cité deux fois (casse, espaces) est UN concurrent : ni deux lignes, ni deux au compteur.
function distinctCompetitors(all: Competitor[]): Competitor[] {
  const seen = new Set<string>()
  return all.filter(competitor => {
    const key = (competitor.competitor ?? '').trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// #4323.2 — TOUS les concurrents annoncés au compteur se rendent : plus de découpe à trois sous « 4 identifiés ».
function CompetitorPreview({ competitors }: { competitors: Competitor[] }) {
  if (competitors.length === 0) return null
  return (
    <ul className="space-y-1 p-2">
      {competitors.map((competitor, index) => (
        <li key={competitor.competitor} className="flex min-w-0 gap-3 rounded-md px-2 py-3 hover:bg-[var(--bellum-bg)]">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--bellum-surface-2)] text-xs font-semibold tabular-nums text-[var(--bellum-text-secondary)]">
            {index + 1}
          </span>
          <div className="min-w-0">
            <Text size="sm" weight="semibold">
              {competitor.competitor}
            </Text>
            <Text size="xs" className="mt-0.5 line-clamp-2 leading-relaxed text-[var(--bellum-text-secondary)]">
              {competitor.differentiator || competitor.talking_point}
            </Text>
          </div>
        </li>
      ))}
    </ul>
  )
}

function StrategySheet({
  open,
  strategy,
  competitors,
  onOpenChange,
}: {
  open: boolean
  strategy: CompetitiveStrategy
  competitors: Competitor[]
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('accountDetail')
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        closeLabel={t('common:actions.close')}
        className="w-[min(520px,calc(100vw-1.5rem))] gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <SheetHeader className="border-b border-[var(--bellum-border)] p-5">
          <SheetTitle>{t('positioning.sheetTitle')}</SheetTitle>
          <SheetDescription>{t('positioning.sheetDescription')}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 p-5">
            <PositioningStatement value={strategy.positioning_statement} />
            {competitors.map(competitor => (
              <CompetitorDetail key={competitor.competitor} competitor={competitor} />
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function PositioningStatement({ value }: { value?: string | null }) {
  const { t } = useTranslation('accountDetail')
  if (!value) return null
  return (
    <section className="space-y-2 rounded-md border bg-[var(--bellum-surface-2)] p-2">
      <Text element="h3" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
        {t('positioning.recommendedPositioning')}
      </Text>
      <Text size="sm" className="leading-relaxed">
        {value}
      </Text>
    </section>
  )
}

function CompetitorDetail({ competitor }: { competitor: Competitor }) {
  const { t } = useTranslation('accountDetail')
  return (
    <section className="space-y-3 border-t border-[var(--bellum-border)] pt-5">
      <Text element="h3" size="sm" weight="semibold">
        {competitor.competitor}
      </Text>
      <Detail label={t('positioning.talkingPoint')} value={competitor.talking_point} />
      <Detail label={t('positioning.differentiator')} value={competitor.differentiator} />
    </section>
  )
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="space-y-1">
      <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <Text size="sm" className="leading-relaxed text-[var(--bellum-text-secondary)]">
        {value}
      </Text>
    </div>
  )
}
