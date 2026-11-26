import { Badge, Card, Text, cn } from '@bellum/ui'
import type { MarketObservedZone } from '@bellum/contracts'
import { Info, Radar } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { siteCategoryDotClass } from './siteStyles'
import type { RegionStat, SiteTypeStat } from './siteTypes'

/** Les trois états que l'onglet Sites peut lire sur la mémoire marché — les
 *  MÊMES trois que #1582 (`AccountMarketContextButton`) : une requête en vol,
 *  une panne qui SE DIT (jamais un silence qui se lirait « non mesuré »), et
 *  une lecture réussie (où `zone` peut très bien être `null` — non couvert,
 *  ou couvert sans ville/région/pays connus). */
export type ObservedZoneStatus = 'loading' | 'unavailable' | 'ok'

/**
 * #1608 / #1630.10 — l'empreinte de zone OBSERVÉE par le corpus mémoire
 * marché, jamais un établissement officiel.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'EST PAS UNE LIGNE DE `SitesTable` / UN MARQUEUR DE CARTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour est explicite : « il est INTERDIT de traiter une ville de la
 * mémoire marché comme un établissement officiel — pas de rattachement à un
 * SIRET, pas de marqueur plein comme un vrai site ». Cette carte est donc
 * SÉPARÉE des sites Pappers / IA (`SitesTable`, `D3FranceMap`) : un badge en
 * contour pointillé (`variant="outline"`, jamais le badge `default` plein que
 * portent les catégories de site officielles), sans coordonnées, sans entrée
 * dans `SiteRow`. Elle ne participe à AUCUN tri : `filterSiteRows` /
 * `siteCategoriesPresent` ne la voient jamais, par construction — il n'y a pas
 * de champ à trier.
 *
 * La légende « Empreinte observée ≠ site officiel » est de ce fait affichée
 * dans TOUS les états, y compris « non mesuré » et « indisponible » : c'est ce
 * qui explique CE QUE la carte est, pas seulement ce qu'elle contient.
 */
export function ObservedZoneCard({ status, zone }: { status: ObservedZoneStatus; zone: MarketObservedZone | null }) {
  const { t } = useTranslation('accountSites')
  // Seuls les champs CONNUS s'affichent — un `null` individuel (ville connue,
  // région absente) ne se rend jamais « - » ni « inconnu » : il ne se rend
  // simplement pas. `zone` non nul garantit au moins un champ ici (voir
  // `buildObservedZone` côté API), donc `parts` n'est vide QUE si `zone` l'est.
  const parts = zone ? [zone.city, zone.region, zone.country].filter((value): value is string => Boolean(value)) : []

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Radar className="size-4 text-[var(--bellum-text-secondary)]" aria-hidden />
        <Text size="base" weight="semibold">
          {t('observedZone.title')}
        </Text>
      </div>
      {status === 'unavailable' ? (
        // Une panne SE DIT — jamais « non mesuré », qui affirmerait qu'on a
        // regardé et rien trouvé. Le même refus que GA-179 sur Accessibilité.
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {t('observedZone.unavailable')}
        </Text>
      ) : status === 'loading' ? (
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {t('observedZone.loading')}
        </Text>
      ) : parts.length === 0 ? (
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {t('observedZone.notMeasured')}
        </Text>
      ) : (
        <Badge variant="outline" className="border-dashed text-xs font-normal">
          {parts.join(' · ')}
        </Badge>
      )}
      <Text size="xs" className="mt-3 text-[var(--bellum-text-muted)]">
        {t('observedZone.caption')}
      </Text>
    </Card>
  )
}

export function RegionDistributionCard({ stats }: { stats: RegionStat[] }) {
  const { t } = useTranslation('accountSites')
  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center gap-2">
        <Text size="base" weight="semibold">
          {t('stats.regionsTitle')}
        </Text>
        <Info className="size-4 text-[var(--bellum-text-muted)]" />
      </div>
      <div className="space-y-3">
        {stats.map(stat => (
          <RegionStatRow key={stat.name} stat={stat} />
        ))}
      </div>
    </Card>
  )
}

export function SitesSummaryCard({ stats, total }: { stats: SiteTypeStat[]; total: number }) {
  const { t } = useTranslation('accountSites')
  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <Text size="base" weight="semibold">
            {t('stats.summaryTitle')}
          </Text>
          <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('stats.summaryDescription')}
          </Text>
        </div>
        <Text size="sm" weight="semibold">
          {total}
        </Text>
      </div>
      <div className="divide-y divide-[var(--bellum-border)]">
        {stats.map(stat => (
          <SiteTypeRow key={stat.label} stat={stat} />
        ))}
      </div>
    </Card>
  )
}

function RegionStatRow({ stat }: { stat: RegionStat }) {
  return (
    <div className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_72px] items-center gap-3">
      <Text size="sm" className="truncate text-[var(--bellum-text-secondary)]">
        {stat.name}
      </Text>
      <span className="h-1.5 overflow-hidden rounded-full bg-[var(--bellum-bg-lighter)]">
        <span
          className="block h-full rounded-full bg-[var(--bellum-primary-500)]"
          style={{ width: `${Math.max(6, stat.percent)}%` }}
        />
      </span>
      <Text size="xs" weight="medium" className="text-right text-[var(--bellum-text-secondary)]">
        {stat.count} ({stat.percent}%)
      </Text>
    </div>
  )
}

function SiteTypeRow({ stat }: { stat: SiteTypeStat }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className={cn('size-2 rounded-full', siteCategoryDotClass(stat.category))} />
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {stat.label}
        </Text>
      </div>
      <Text size="sm" weight="semibold">
        {stat.count}
      </Text>
    </div>
  )
}
