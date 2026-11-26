import type { Account } from '@bellum/contracts'
import { Badge, Box, Text, Button, EmptyState } from '@bellum/ui'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { MapPinned, Network, Search, Building2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EntitiesGraphCard } from '../components/EntitiesGraphCard'
import { countListedEntities } from '../components/entities/listedEntities'
import { EntityHypothesisNotice } from '../components/EntityHypothesisNotice'
import { readEntityHypothesis } from '../components/entityHypothesis'
import { DossierSectionHead } from '../theo/DossierBlocks'
import { DossierBornFromNotice, DossierZoneWideningNotice } from '../components/sites/DossierZoneWideningNotice'
import { readDossierBornFrom, readDossierZoneWidening } from '../components/sites/dossierZoneWidening'
import { SitesFranceCard } from '../components/SitesFranceCard'
import { RetainedSitesPanel } from '../components/sites/RetainedSitesPanel'
import { ObservedZoneCard, RegionDistributionCard, type ObservedZoneStatus } from '../components/sites/SiteStatsCards'
import { buildRegionStats } from '../components/sites/siteStyles'
import { countSites } from '../components/sites/siteGeo'
import { countRegions, filterSiteRows, siteCategoriesPresent, useSiteRows } from '../components/sites/useSiteRows'
import { SiteViewTabs, type SiteViewMode } from './sites/SiteViewTabs'
import { stagger, cardFade } from '../motion'
import { useAccountOverviewData } from './useAccountOverviewData'
import { useAccountVocabulary } from '@/features/accounts/hooks/useAccountVocabulary'
import { useAccountMarketContext } from '@/features/accounts/hooks/useAccountMarketContext'
import { useResearchSites } from '@/features/accounts/hooks/useResearchSite'
import { trackActionStarted } from '@/lib/product-tracker'

// #2130.57 — `scope_changed`, un des 15 événements nommés par le corps de
// #3000 (dossier compte V4). Même patron que `primary_action_clicked`/
// `laura_opened_from_account` (`AccountDetailHeroPrimaryAction.tsx`) : un
// `action` de plus sur l'événement générique `action_started`, jamais un
// contrat neuf pour un geste de plus.
const ACCOUNT_DETAIL_SCREEN = '/accounts/$id'

type TabSitesProps = {
  account: Account
  /** Refonte Théo — « Vue organigramme » (`.ac20-toolbar`) ouvre l'onglet Organigramme. */
  onOpenOrganigramme?: () => void
}

export function TabSites({ account, onOpenOrganigramme }: TabSitesProps) {
  const { t } = useTranslation('accountSites')
  const accountData = useAccountOverviewData(account)
  // #4327.1 — une entité nommée au vocabulaire du groupe (registre) fait partie des Périmètres.
  const { data: vocabulary } = useAccountVocabulary(account.id)
  const navigate = useNavigate()
  // #2966 (#2119.52-56) — le périmètre choisi comme CIBLE. Vit dans l'URL, pas
  // dans un état local : c'est ce qui permet à Personnes/Écosystème/Plan/Laura
  // de le lire sans que cet onglet leur transmette une prop — un réglage, un
  // seul endroit (GA-26). RÉUTILISE le paramètre `entity` que l'onglet
  // Personnes filtre déjà (`accountDetailSearch.ts::contactsFiltersFromSearch`)
  // plutôt que d'en ouvrir un second pour la même idée.
  const targetPerimeter = useSearch({ from: '/accounts/$id', select: search => search.entity ?? null })
  const chooseTargetPerimeter = (name: string) => {
    // #2130.57 — le PÉRIMÈTRE qui change (quel sous-ensemble du compte est
    // ciblé), jamais SA VALEUR (le nom de l'entité choisie n'est pas émis :
    // il désignerait une filiale précise, exactement le contenu qu'un
    // événement produit n'a pas à porter).
    trackActionStarted('scope_changed', ACCOUNT_DETAIL_SCREEN)
    void navigate({ to: '/accounts/$id', params: { id: account.id }, search: prev => ({ ...prev, entity: name }) })
  }
  const clearTargetPerimeter = () => {
    trackActionStarted('scope_changed', ACCOUNT_DETAIL_SCREEN)
    void navigate({
      to: '/accounts/$id',
      params: { id: account.id },
      search: prev => ({ ...prev, entity: undefined }),
    })
  }
  const [viewMode, setViewMode] = useState<SiteViewMode>('all')
  const [page, setPage] = useState(1)
  // ONE list feeds the counters, the table and the map — see useSiteRows.
  const siteData = useSiteRows(account.id, accountData.sites_france, page)
  const filteredSiteRows = useMemo(() => filterSiteRows(siteData.rows, viewMode), [siteData.rows, viewMode])
  // Only offer category tabs that actually have a site — no empty « Sites
  // industriels » chip that lands on « aucun site ». `all` is always available.
  const availableCategories = useMemo(() => siteCategoriesPresent(siteData.allRows), [siteData.allRows])
  // If the active category loses all its sites (e.g. after loading), fall back to
  // « Tous » so the view never sits on a hidden, empty tab.
  useEffect(() => {
    if (viewMode !== 'all' && siteData.rows.length > 0 && !availableCategories.includes(viewMode)) {
      setViewMode('all')
    }
  }, [availableCategories, viewMode, siteData.rows.length])
  // #4326 — compteurs, carte et répartition lisent TOUS les sites, pas la page.
  const filteredAllRows = useMemo(() => filterSiteRows(siteData.allRows, viewMode), [siteData.allRows, viewMode])
  const visibleSitesCount = countSites(filteredAllRows)
  const regionsCount = useMemo(() => countRegions(filteredAllRows), [filteredAllRows])
  // i18n keys: categories.all | categories.headquarters | categories.office | categories.establishment | categories.industrial
  const currentViewLabel = t(`categories.${viewMode}`)

  const researchSitesMutation = useResearchSites(account.id)
  // #4432.9 — zone sans entité : l'IA a élargi seule, l'écran le dit.
  const zoneWidening = readDossierZoneWidening(account.raw_analysis)
  const bornFrom = readDossierBornFrom(account.raw_analysis)
  const entityHypothesis = useMemo(() => readEntityHypothesis(account.raw_analysis), [account.raw_analysis])
  // #4612.1 — le compteur annonce ce que la liste montre : le MÊME calcul que `EntitiesGraphCard`, catégorie comprise.
  // Il n'est plus « toutes les entités connues » (13 pour deux groupes à 5 lignes) : ce total vit sous la liste.
  const entityCount = useMemo(
    () =>
      countListedEntities(
        accountData.entities_exhaustive,
        accountData.subsidiaries,
        account.company_name,
        vocabulary ?? [],
        accountData.sites_france,
        viewMode,
      ),
    [
      accountData.entities_exhaustive,
      accountData.subsidiaries,
      account.company_name,
      vocabulary,
      accountData.sites_france,
      viewMode,
    ],
  )

  /**
   * #1608 / #1630.10 — l'empreinte de zone observée par la mémoire marché.
   *
   * ⚠️ `enabled: true` inconditionnel, à la différence du popover de la liste
   * de comptes (#1582) : là-bas, vingt-cinq lignes affichées ne doivent
   * déclencher aucune lecture avant qu'on en ouvre une. Ici, l'onglet est
   * DÉJÀ celui d'UN compte ouvert — c'est exactement le moment que le
   * popover attend avant de lire.
   */
  const marketContext = useAccountMarketContext(account.id, true)
  const observedZoneStatus: ObservedZoneStatus = marketContext.isError
    ? 'unavailable'
    : marketContext.isPending
      ? 'loading'
      : 'ok'
  // `data` peut être `null` (compte non couvert) ou `observed_zone` peut
  // l'être individuellement (couvert, sans ville/région/pays connus) — les
  // deux se rendent pareil : « Non mesuré ». Jamais une zone inventée.
  const observedZone = marketContext.data?.observed_zone ?? null

  if (!accountData.sites_france || accountData.sites_france.length === 0) {
    return (
      <motion.div variants={cardFade} className="space-y-4">
        <DossierBornFromNotice lines={bornFrom} />
        <DossierZoneWideningNotice widening={zoneWidening} />
        <EmptyState
          size="md"
          align="center"
          icon={<Search className="h-12 w-12" />}
          title={t('emptyState.title')}
          description={t('emptyState.description')}
          action={
            <Button
              size="sm"
              variant="default"
              disabled={researchSitesMutation.isPending}
              onClick={() => researchSitesMutation.mutate()}
              icon={Building2}
              className="gap-2"
            >
              {researchSitesMutation.isPending ? t('emptyState.searching') : t('emptyState.searchCta')}
            </Button>
          }
        />
      </motion.div>
    )
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" data-testid="sites-screen" className="py-2">
      {/* Refonte Théo (23/10) — `.ac20-section-head` : la phrase de l'onglet, sa lecture, « Vue organigramme ». */}
      <DossierSectionHead
        testId="sites-head"
        title={t('theo.title')}
        lead={t('theo.lead')}
        actions={
          onOpenOrganigramme ? (
            <Button type="button" size="sm" variant="ghost" icon={Network} onClick={onOpenOrganigramme}>
              {t('theo.orgView')}
            </Button>
          ) : null
        }
      />
      <div className="space-y-8">
        <DossierBornFromNotice lines={bornFrom} />
        <DossierZoneWideningNotice widening={zoneWidening} />
        {/* `.ac20-unit-group` « Entités & filiales » — EN PREMIER, comme la maquette : le groupe ne se travaille pas
            comme un bloc. La liste reste le tableau commun (liste / carte, choix du périmètre, entité saisie). */}
        <section data-testid="sites-entities" aria-labelledby="sites-entities-title" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Text element="h3" id="sites-entities-title" size="base" weight="semibold">
              {t('theo.entitiesTitle')}
            </Text>
            {entityCount ? (
              <Badge variant="outline" className="text-xs">
                {t('theo.entityCount', { count: entityCount })}
              </Badge>
            ) : null}
          </div>
          {/* `.ac20-small` — ce que la liste EST : un regroupement de lecture, jamais l'organigramme juridique. */}
          {entityCount ? (
            <Text data-testid="sites-entities-note" size="xs" className="text-[var(--bellum-text-muted)]">
              {t('theo.readingNote')}
            </Text>
          ) : null}
          <EntitiesGraphCard
            entities={accountData.entities_exhaustive}
            vocabulary={vocabulary}
            subsidiaries={accountData.subsidiaries}
            rootName={account.company_name}
            sites={accountData.sites_france}
            siteCategoryFilter={viewMode}
            priorityPerimeters={accountData.priorityPerimeters}
            targetPerimeter={targetPerimeter}
            onChooseTarget={chooseTargetPerimeter}
            onClearTarget={clearTargetPerimeter}
          />
          {/* `.t-banner` « Hypothèse d'entité » — sous les entités (elle a quitté les sources de la synthèse). */}
          {entityHypothesis ? <EntityHypothesisNotice data={entityHypothesis} /> : null}
        </section>
        {/* Les SITES : le compteur, le tableau, la répartition et la zone observée, puis les sites retenus. */}
        <section data-testid="sites-sites" aria-labelledby="sites-sites-title" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <MapPinned aria-hidden className="size-4 shrink-0 text-[var(--bellum-text-accent)]" />
              <Text element="h3" id="sites-sites-title" size="base" weight="semibold">
                {t('header.title')}
              </Text>
              <Badge variant="default" className="text-xs">
                {currentViewLabel}
              </Badge>
            </div>
            <Box display="flex" className="flex-wrap gap-3">
              {/* #4612.1 — chaque chiffre nomme son unité : les lignes du tableau sont des VILLES, « Sites » compte les
                  établissements qu'elles regroupent. */}
              <StatPill
                label={t('header.citiesShown', { count: filteredAllRows.length })}
                value={filteredAllRows.length}
              />
              <StatPill label={t('header.sitesShown')} value={visibleSitesCount} />
              {/* Aucune région exploitable → on masque le compteur plutôt que
                  d'afficher un « 0 » démenti par la liste juste en dessous. */}
              {regionsCount != null ? <StatPill label={t('header.regions')} value={regionsCount} /> : null}
            </Box>
          </div>
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('header.description')}
          </Text>
          <SitesFranceCard
            rows={filteredSiteRows}
            allRows={filteredAllRows}
            page={page}
            onPageChange={setPage}
            totalPages={siteData.totalPages}
            isLoading={siteData.isLoading}
            isFetching={siteData.isFetching}
            hasAnySite={siteData.hasAnySite}
            toolbar={<SiteViewTabs value={viewMode} onChange={setViewMode} available={availableCategories} />}
          />
          <Box display="grid" className="gap-4 md:grid-cols-2">
            <RegionDistributionCard stats={buildRegionStats(filteredAllRows)} />
            <ObservedZoneCard status={observedZoneStatus} zone={observedZone} />
          </Box>
          <RetainedSitesPanel accountId={account.id} />
        </section>
      </div>
    </motion.div>
  )
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <Box className="min-w-24 rounded-lg border border-[var(--bellum-border)] px-3 py-2">
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {label}
      </Text>
      <Text size="lg" weight="semibold" className="mt-0.5 font-mono">
        {value}
      </Text>
    </Box>
  )
}
