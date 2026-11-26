import { PRICE_CHANNELS, type CommercialBrief } from '@bellum/contracts'
import { Badge, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { BriefCharts } from '@/features/brief-blocks/BriefCharts'
import { BriefEsn } from '@/features/brief-blocks/BriefEsn'
import { BriefFold } from '@/features/brief-blocks/BriefFold'
import { BriefKnowledge } from '@/features/brief-blocks/BriefKnowledge'
import { BriefKpis } from '@/features/brief-blocks/BriefKpis'
import { BriefPeopleCount } from '@/features/brief-blocks/BriefPeopleCount'
import { BriefSections } from '@/features/brief-blocks/BriefSections'
import { formatCount } from '@/lib/locale'
import { withoutEsnOverlap } from './brief/briefEsnOverlap'
import { stripRegistryJargon } from '@/lib/strip-registry-jargon'
import { plainMarketPathsKpi } from './brief/briefMarketPathsKpi'
import { PresentEsnList } from './sections/PresentEsnList'

/**
 * Brief commercial « Ce que je sais » (chantier briefs comptes, 01/10/2026) —
 * la page d'entrée du compte : le commercial qui ouvre Comptes lit d'abord ça.
 *
 * Ordre : bandeau KPI → « Ce que je sais » (deux colonnes) → graphiques →
 * sections repliables → GARDE-FOUS EN DERNIER, toujours visibles (jamais repliés :
 * ce sont les points où se tromper coûte une réunion).
 *
 * Doctrine tenue ici : une rubrique absente ne fait AUCUNE ligne ; une valeur
 * absente ne s'écrit jamais « 0 » ; les prix se GROUPENT par canal, jamais de
 * moyenne ; les personnes ne sont pas listées (elles vivent dans Contacts) —
 * seulement leur compte par rôle ; aucun nom de fournisseur.
 *
 * Les blocs génériques (KPI, savoir, graphiques, ESN, sections, garde-fous,
 * personnes) vivent dans `features/brief-blocks` (L4a « Marchés locaux »,
 * 04/10/2026) — partagés avec le brief d'un marché ; restent ici ceux propres
 * au compte : sites, entités, prix par canal.
 */

type BriefBlock = 'header' | 'knowledge' | 'entities' | 'prices' | 'esn'

/** Le libellé que le convertisseur du dossier de compte pose quand le siège n'est pas confirmé (`orange-dossier.ts`). */
const HEADQUARTERS_UNCONFIRMED_LABEL = 'Siège non confirmé'

export function TabCommercialBrief({
  brief,
  accountId,
  economicDeciders,
  omit = [],
  onOpenProcurement,
}: {
  brief: CommercialBrief
  accountId?: string
  economicDeciders?: number
  /** Refonte Théo (23/10) — les blocs que « Ce que je sais » pose déjà dans ses cartes : ils ne se redisent pas
   *  dans « Pour aller plus loin » (une donnée vit à un seul endroit). */
  omit?: readonly BriefBlock[]
  /** #5106.9 — sur un compte : ouvre Pratiques achats ; la section achats n'est alors plus rendue en tableau ici. */
  onOpenProcurement?: () => void
}) {
  const { t } = useTranslation('accounts', { keyPrefix: 'commercialBrief' })
  const { t: tAccounts } = useTranslation('accounts')

  const pricesByChannel = PRICE_CHANNELS.map(channel => ({
    channel,
    prices: brief.prices.filter(price => price.channel === channel),
  })).filter(group => group.prices.length > 0)

  // #4323.1 — sur un compte, la tuile et la rubrique ESN du brief s'effacent derrière la liste unique des ESN présentes.
  const shown = accountId
    ? withoutEsnOverlap(brief)
    : { kpis: brief.kpis, what_i_know: brief.what_i_know, esnMeaning: null }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {omit.includes('header') ? null : (
        <header className="min-w-0">
          <Text element="h2" size="lg" weight="semibold">
            {t('title', { company: brief.account_name })}
          </Text>
          {/* 14/10/2026 (recette Orange) : « Siège non confirmé, Paris » doublonnait la fiche, qui dit déjà « Paris (siège à
            vérifier) » — un siège non confirmé ne s'écrit qu'une fois, sur la fiche. */}
          {brief.headquarters.label === HEADQUARTERS_UNCONFIRMED_LABEL ? null : (
            <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
              {t('headquarters', { label: brief.headquarters.label, city: brief.headquarters.city })}
            </Text>
          )}
        </header>
      )}

      <BriefKpis
        kpis={plainMarketPathsKpi(shown.kpis, {
          label: t('marketPathsKpi.label'),
          caption: t('marketPathsKpi.caption'),
        })}
      />

      {shown.what_i_know.length > 0 && !omit.includes('knowledge') ? (
        <BriefKnowledge rows={shown.what_i_know} t={t} />
      ) : null}

      <BriefCharts charts={brief.charts} />

      <div className="flex min-w-0 flex-col gap-3">
        <BriefFold testId="brief-sites" title={t('sites.title')} count={brief.sites.length}>
          {/* #4326.1 — « Siège et sites 8 » contre 525 dans l'onglet Sites : le libellé dit ce qu'il compte (les sites
              retenus par le brief), et renvoie au recensement complet. */}
          <Text size="xs" className="mb-3 block text-[var(--bellum-text-muted)]">
            {t('sites.scope')}
          </Text>
          <BriefSitesList brief={brief} />
        </BriefFold>

        {brief.entities.length > 0 && !omit.includes('entities') ? (
          <BriefFold testId="brief-entities" title={t('entities.title')} count={brief.entities.length}>
            <BriefEntitiesList brief={brief} />
          </BriefFold>
        ) : null}

        {pricesByChannel.length > 0 && !omit.includes('prices') ? (
          <BriefFold testId="brief-prices" title={t('prices.title')} count={brief.prices.length}>
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('prices.hint')}
            </Text>
            <div className="mt-3">
              <BriefPricesByChannel brief={brief} />
            </div>
          </BriefFold>
        ) : null}

        {/* K.2 / #4323 — sur un compte, UNE seule liste des ESN présentes (brief + en place + observées) ;
            le bloc générique du brief ne sert plus que sans identifiant de compte. */}
        {omit.includes('esn') ? null : accountId ? (
          <PresentEsnList
            accountId={accountId}
            esn={brief.esn}
            generatedAt={brief.generated_at}
            showMoreT={t}
            meaning={shown.esnMeaning}
          />
        ) : (
          <BriefEsn esn={brief.esn} t={t} />
        )}

        <BriefSections
          sections={brief.sections}
          t={t}
          procurementLink={
            onOpenProcurement ? { label: tAccounts('procurement.briefLink'), onOpen: onOpenProcurement } : undefined
          }
        />

        <BriefPeopleCount people={brief.people} economicDeciders={economicDeciders} t={t} />
      </div>
      {/* Garde-fous : retirés de l'affichage (Louis 13/10/2026) — la donnée reste au brief stocké. */}
    </div>
  )
}

/** Refonte Théo (23/10) — extrait pour être posé tel quel dans une carte de « Ce que je sais » (une seule écriture). */
export function BriefSitesList({ brief }: { brief: CommercialBrief }) {
  const { t } = useTranslation('accounts', { keyPrefix: 'commercialBrief' })
  return (
    <ul className="flex flex-col gap-3">
      {brief.sites.map(site => (
        <li key={`${site.name}-${site.city}`} className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Text size="sm" weight="semibold">
              {site.name}
            </Text>
            <Badge variant="outline">{t(`sites.kind.${site.kind}`)}</Badge>
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {site.city} · {site.country}
            </Text>
          </div>
          {site.why ? (
            <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
              {site.why}
            </Text>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/** Refonte Théo (23/10) — extrait pour être posé tel quel dans une carte de « Ce que je sais » (une seule écriture). */
export function BriefEntitiesList({ brief }: { brief: CommercialBrief }) {
  const { t } = useTranslation('accounts', { keyPrefix: 'commercialBrief' })
  return (
    <ul className="flex flex-col gap-3">
      {brief.entities.map(entity => {
        // #4994 — le code NAF / SIREN posé par les données ne se lit pas ; un texte vidé ne fait aucune ligne.
        const name = stripRegistryJargon(entity.name ?? '') || entity.name
        const nature = stripRegistryJargon(entity.nature ?? '')
        const note = stripRegistryJargon(entity.note ?? '')
        return (
          <li key={entity.name} data-testid={`brief-entity-${entity.name}`} className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Text size="sm" weight="semibold">
                {name}
              </Text>
              {nature ? (
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {nature}
                </Text>
              ) : null}
              {entity.status === 'exited' ? <Badge variant="outline">{t('entities.exited')}</Badge> : null}
            </div>
            {note ? (
              <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
                {note}
              </Text>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/** Refonte Théo (23/10) — extrait pour être posé tel quel dans une carte de « Ce que je sais » (une seule écriture). */
export function BriefPricesByChannel({ brief }: { brief: CommercialBrief }) {
  const { t } = useTranslation('accounts', { keyPrefix: 'commercialBrief' })
  const pricesByChannel = PRICE_CHANNELS.map(channel => ({
    channel,
    prices: brief.prices.filter(price => price.channel === channel),
  })).filter(group => group.prices.length > 0)
  return (
    <div className="flex flex-col gap-4">
      {pricesByChannel.map(group => (
        <section key={group.channel} data-testid={`brief-prices-${group.channel}`} className="min-w-0">
          <Text element="h4" size="sm" weight="semibold">
            {t(`prices.channel.${group.channel}`)}
          </Text>
          <ul className="mt-1 flex flex-col gap-1">
            {group.prices.map(price => (
              <li
                key={`${price.label}-${price.amount_eur_per_day}`}
                className="flex min-w-0 flex-wrap items-baseline justify-between gap-2"
              >
                <Text size="sm" className="min-w-0">
                  {price.label}
                </Text>
                <Text size="sm" weight="medium">
                  {t('prices.perDay', { amount: formatCount(price.amount_eur_per_day) })}
                </Text>
                {price.note ? (
                  <Text size="xs" className="w-full text-[var(--bellum-text-muted)]">
                    {price.note}
                  </Text>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
