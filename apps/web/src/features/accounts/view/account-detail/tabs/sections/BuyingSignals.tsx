import { isSignalDatedToTheDay, resolveSignalSourceLink, type RecentSignal } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { normalizeRequester } from '@/features/discover/lib/discover-normalize'
import { signalSourceLabel } from '@/lib/data-source-label'
import { readableSource } from '@/lib/source-label'
import { dedupeRecentSignals, foldSameTitleOffers } from '@/lib/signal-dedupe'
import { formatSignalDate, formatSignalDateIfKnown } from '@/lib/signal-date'
import { signalsEmptyLabel, unreachableSignalFamilies, type SignalCoverage } from './signalCoverageText'
import { WhyNowItemList } from './WhyNowItemList'
import { createDetailRows } from './whyNowDetails'

type BuyingSignalsProps = {
  signals: RecentSignal[]
  /** #3668.8 — ce que la recherche a pu consulter ; absent = analyse antérieure. */
  coverage?: SignalCoverage
}

function hasSignal(value: RecentSignal): value is RecentSignal & { signal: string } {
  return typeof value.signal === 'string' && value.signal.length > 0
}

export function BuyingSignals({ signals, coverage }: BuyingSignalsProps) {
  const { t } = useTranslation('accountDetail')
  // #3668.7 — ce qui change la décision d'abord ; le contexte reste visible, nommé comme tel.
  // #4142 — un même fait servi sous deux formulations ne fait qu'UNE ligne (un seul prédicat, `signal-dedupe`) ; rien
  // n'est supprimé en base, seul le rendu replie, et la ligne la plus riche (lien, date, détail) est gardée.
  // #3917.r39 — une actualité est datée au jour ou RETIRÉE (une absence ne fait aucune ligne) ; le filtre
  // est ici, à la source du bloc : `WhyNowItemList` compte « Voir plus » sur ce qui reste.
  // #4294.10 (#4142.5) — deux offres au même intitulé normalisé, dans deux villes : UNE ligne « 2 offres (Toulouse, Aix) ».
  const renderable = dedupeRecentSignals(
    foldSameTitleOffers(signals.filter(hasSignal).filter(signal => isSignalDatedToTheDay(signal.date))),
  ).sort((a, b) => Number(a.selection_role === 'context') - Number(b.selection_role === 'context'))
  const items = renderable.map((signal, index) => {
    // #3925 — « Voir l'offre » (ou l'article, l'annonce…) sur la carte elle-même ; sans URL, aucune ligne.
    const link = resolveSignalSourceLink({ url: signal.url, source_kind: signal.source_kind })
    // #3917.1 — le média (jamais le jeton « [P1] » : `readableSource`) et la date, sur la ligne de liste.
    const meta =
      [signalSourceLabel(t, readableSource(signal.source, signal.url)), formatSignalDateIfKnown(signal.date)]
        .filter(Boolean)
        .join(' · ') || undefined
    const requester = normalizeRequester(signal.requester)
    return {
      ...(meta ? { meta } : {}),
      ...(requester ? { requester } : {}),
      source: link.kind === 'link' ? { url: link.url, sourceKind: link.sourceKind } : undefined,
      id: `${signal.signal}-${index}`,
      title: `${signal.selection_role === 'context' ? `${t('whyNow.contextPrefix')} ` : ''}${signal.signal}${
        signal.offerCount
          ? ` — ${t('whyNow.offersFolded', { count: signal.offerCount, places: (signal.offerPlaces ?? []).join(', ') })}`
          : ''
      }`,
      pinned: signal.selection_role === 'context',
      details: createDetailRows([
        { label: t('detail.signal'), value: signal.signal },
        { label: t('detail.whyContext'), value: signal.selection_reason },
        { label: t('detail.type'), value: signal.type },
        { label: t('detail.date'), value: signal.date ? formatSignalDate(signal.date) : undefined },
      ]),
    }
  })

  // #3668.8 — une source injoignable n'a pas dit « rien » : on ne conclut pas à l'absence.
  const unreachableFamilies = unreachableSignalFamilies(coverage, t)
  const emptyLabel = signalsEmptyLabel(coverage, unreachableFamilies, t)

  return (
    <section className="h-full border-t border-[var(--bellum-border)] p-5 md:border-t-0">
      <Text element="h3" size="sm" weight="semibold" className="mb-4 flex items-center gap-3 ">
        {t('whyNow.signalsTitle')}
      </Text>
      <WhyNowItemList items={items} emptyLabel={emptyLabel} dotClassName="bg-[var(--bellum-warning)]" />
    </section>
  )
}
