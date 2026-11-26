import { Text } from '@bellum/ui'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { formatCount } from '@/lib/locale'
import { formatCents } from '@/lib/money'
import { useCollectionsWindow, useInvoiceReadiness } from '../api'
import { collectionMonths, isCollectible, summarizeCollections } from '../collections'
import { Tile } from './MissionCockpitKpiTiles'

/**
 * #2408.68 / #2408.69 — « CA facturable non facturé » et « Factures échues »
 * en tête de /missions (contrat Louis 31/10/2026, qui rouvre ces deux tuiles
 * écartées le 27/09 par la loi 4 : elles vivaient seulement sur
 * `/missions/suivi`).
 *
 * Aucune n'est recalculée (GA-26) : la première LIT `summary.preparedAmountCents`
 * de `GET /delivery/invoice-readiness` (mois écoulé, comme la tuile « Prêt à
 * facturer » de `/missions/suivi`), la seconde `summarizeCollections` sur la
 * même fenêtre de douze mois qu'Encaissements. Chaque tuile renvoie à l'écran
 * qui porte SA population entière.
 *
 * Droits : montée SEULEMENT sous `finance:read` (`MissionsPage`) — sans ce
 * droit, aucune tuile, et aucune requête ne part. « 0 » = zéro réel ; une
 * source en échec = « non mesuré », jamais « 0 € » (#2408.71).
 */
export function MissionBillingKpiTiles({ now }: { now: Date }) {
  const { t } = useTranslation('missions')
  const readiness = useInvoiceReadiness()
  const months = useMemo(() => collectionMonths(now), [now])
  const window = useCollectionsWindow(months)
  const overdue = useMemo(
    () => summarizeCollections(window.items.filter(isCollectible), now).overdue,
    [window.items, now],
  )
  const prepared = readiness.isError ? null : (readiness.data?.summary.preparedAmountCents ?? null)
  const collectionsMeasured = !window.isLoading && window.failedMonths === 0 && window.canReadFinance

  return (
    <>
      <Tile
        label={t('cockpitKpis.billableNotInvoiced')}
        period={t('cockpitKpis.periodLastMonth')}
        href="/missions/facturation"
      >
        {prepared === null ? (
          <UnknownValue />
        ) : (
          <Text size="xl" weight="semibold">
            {formatCents(prepared)}
          </Text>
        )}
      </Tile>
      <Tile
        label={t('cockpitKpis.overdueInvoices')}
        period={t('cockpitKpis.periodWindow')}
        href="/missions/encaissements"
      >
        {collectionsMeasured ? (
          <>
            <Text size="xl" weight="semibold" color={overdue.count > 0 ? 'text-[var(--warning-soft-text)]' : undefined}>
              {formatCount(overdue.count)}
            </Text>
            {overdue.amountCents !== null && overdue.count > 0 ? (
              <Text size="xs" color="text-muted-foreground">
                {formatCents(overdue.amountCents)}
              </Text>
            ) : null}
          </>
        ) : (
          <UnknownValue />
        )}
      </Tile>
    </>
  )
}
