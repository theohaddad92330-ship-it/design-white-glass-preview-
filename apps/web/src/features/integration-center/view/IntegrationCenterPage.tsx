import { Box, Button, Input, Spinner, Tabs, TabsContent, TabsList, TabsTrigger, Text } from '@bellum/ui'
import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { SettingsEmbeddedContext } from '@/features/settings/components/SettingsViewHeader'
import { CrmReadSummary } from './CrmReadSummary'
import { ScreenGuideLink } from '@/components/shell/ScreenGuideLink'
import { IntegrationHistory } from './IntegrationHistory'
import { ImportEntryAction } from './ImportEntryCard'
import { ReviewTab } from './ReviewTab'
import { ConnectorTile } from './ConnectorTile'
import { ConnectorDrawer } from './ConnectorDrawer'
import { useCrmReadStatus } from '@/features/crm-import/api'
import { buildReviewGroups } from '../lib/review-groups'
import { GOOGLE_STATUS_KEY } from '@/features/google/hooks/useGoogleStatus'
import type { PlanFeatureKey } from '@bellum/contracts'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'
import { useToolRegistry } from '../api'
import { buildConnectorsView } from '../lib/connectors'
import { buildTiles, TILE_FAMILY_ORDER, type ConnectorTile as ConnectorTileModel } from '../lib/connector-tiles'
import { providerLabel } from '../lib/provider-label'
import { demoConnectedNames } from '../lib/demo-connection-label'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { rememberConnectorFailure } from '../lib/connector-callback-failure'
import { parseOAuthCallback } from '../lib/oauth-callback'
import { trackConnectorActivated } from '@/lib/product-tracker'
import { guideAnchorProps } from '@/features/guide/guide-anchors'

/** #2085.11 — le motif de route de CET écran (catalogue : `product-screens-catalog.ts`). */
const INTEGRATIONS_SCREEN = '/integrations'

/**
 * L'écran Intégrations — le SEUL.
 *
 * Il y en avait deux : Réglages › Intégrations pour brancher, et un « centre »
 * pour surveiller. Deux écrans qui ne disaient pas la même chose du même outil
 * — le centre affichait Salesforce « Non branché » là où les réglages ne le
 * montraient pas du tout, parce que ce serveur n'a pas d'application OAuth
 * Salesforce déclarée. Un utilisateur qui voit les deux ne sait pas lequel
 * croire ; un utilisateur qui n'en voit qu'un doit pouvoir s'y fier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE DE LA PAGE — #1448
 * ─────────────────────────────────────────────────────────────────────────────
 * *« Un utilisateur non technique doit comprendre en moins de 10 secondes quoi
 * connecter, pourquoi, et ce que Bellum pourra faire pour lui après. »*
 *
 * PR 12C (#4511, maquette V22 « Tes outils, le même dossier ») — décision Louis 23/10 :
 *  1. l'en-tête : titre, une phrase, « Importer un fichier », « Comment travailler ici ? » repliable ;
 *  2. trois onglets — Connecteurs / À relire (son compteur, même à 0) / Historique ;
 *  3. un seul petit champ « Chercher un outil », puis la grille de cartes COURTES sous les cinq légendes
 *     de famille (#4510) ; « Voir le parcours » ouvre le tiroir qui rend la carte complète ;
 *  4. hors maquette, gardés sous la grille : par quoi commencer, notifications, clés d'API.
 *
 * Retirés (revient sur #1441, #2091.1-3, #3904.3, #4184.4) : les pastilles de compteurs du hero, le bloc
 * « Ce que Laura lit » et les filtres Branchés / À reconnecter / À brancher / Plus de filtres. L'état se lit
 * sur chaque carte ; ce qui demande un geste remonte en tête de sa famille (`buildTiles`).
 *
 * Ce que l'écran garde : ce qui est branchable, son état, et le geste.
 * Ce qu'il a rendu au back-office : l'inventaire des outils que ce serveur
 * n'offre pas, ce que chaque outil lit et écrit, ses limites de débit, sa
 * politique de rétention, et le journal de livraison des webhooks. Aucun de ces
 * cinq éléments n'appelle une action de l'utilisateur — et le journal demandait
 * en plus de savoir lire un code HTTP.
 */
export function IntegrationCenterPage() {
  const { t } = useTranslation('integrationCenter')
  const registry = useToolRegistry({ fresh: true })
  const isDemo = useIsDemo()
  const queryClient = useQueryClient()

  const { t: tTile } = useTranslation('integrations', { keyPrefix: 'gridTiles' })
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'connecteurs' | 'a-relire' | 'historique'>('connecteurs')
  const [opened, setOpened] = useState<ConnectorTileModel | null>(null)
  // Théo D settings-integrations — « À relire » porte le compte des changements CRM en attente de relecture.
  const reviewCount = buildReviewGroups(useCrmReadStatus(true).data ?? []).length

  // #2207.17 — le seul connecteur dont la CONNEXION ENTIÈRE est la feature
  // payante (`mcp_assistant`, déjà le verrou de `AiAssistantView`) : la carte
  // lit le MÊME palier, elle n'en invente pas un second qui pourrait diverger.
  // « Le doute n'interdit pas » (`usePlanFeature`) : charge en vol ou palier
  // inconnu ⇒ `allowed: true`, la carte reste cliquable.
  const mcpAssistant = usePlanFeature('mcp_assistant')
  const isPlanFeatureAllowed = useMemo<(feature: PlanFeatureKey) => boolean>(
    () => feature => (feature === 'mcp_assistant' ? mcpAssistant.allowed : true),
    [mcpAssistant.allowed],
  )

  const view = useMemo(
    () => buildConnectorsView(registry.data ?? [], 'all', '', isPlanFeatureAllowed),
    [registry.data, isPlanFeatureAllowed],
  )
  const tiles = useMemo(() => buildTiles(view.all), [view.all])
  // #4511 — « Chercher un outil » : le nom propre ou ce que l'outil apporte (« Comptes, contacts… »).
  const needle = search.trim().toLocaleLowerCase()
  const shown = needle
    ? tiles.filter(tile =>
        [tile.name, tTile(`${tile.id}.category`)].some(text => text.toLocaleLowerCase().includes(needle)),
      )
    : tiles
  const openedView = opened ? view.all.find(c => c.id === opened.connector) : undefined

  // Les callbacks OAuth rebondissent ici avec `?<provider>=connected|error`.
  // Ils atterrissaient sur /settings/integrations, qui redirige désormais : sans
  // ce traitement, une connexion réussie n'aurait plus aucun accusé de réception.
  useEffect(() => {
    const result = parseOAuthCallback(window.location.search)
    if (!result) return
    // #2078.25 — seul `status: 'connected'`, écrit par le SERVEUR après un
    // échange de jeton réel (`parseOAuthCallback`), déclenche un succès. Un
    // refus, une erreur fournisseur ou une valeur inconnue tombent tous dans
    // l'échec — jamais un succès optimiste côté navigateur.
    if (result.status === 'connected') {
      toast.success(t('callback.connected', { name: providerLabel(result.provider) }))
      // #2207.19 — le geste « Synchroniser et comprendre mes données » vit
      // maintenant sur la carte du connecteur (`ConnectorSyncStatus`), jamais
      // ici en bandeau transitoire : cet effet ne réagit qu'au callback OAuth
      // d'UNE connexion fraîche, donc jamais à un connecteur déjà connecté
      // avant cette page (rechargement, session suivante) ni à Odoo, qui n'a
      // pas de callback OAuth (formulaire, #1446) — recette du 25/09/2026.
      void queryClient.invalidateQueries({ queryKey: ['tool-registry'] })
      if (result.provider === 'google') void queryClient.invalidateQueries({ queryKey: GOOGLE_STATUS_KEY })
      // #2085.11 — « connecteur » : anonyme, par ÉCRAN, jamais le NOM du
      // connecteur (voir le docblock de `trackConnectorActivated`). Seul un retour
      // `connected` arrive ici — jamais sur un échec. (« Activé après recommandation »,
      // #1946.12, retiré : #4513.)
      trackConnectorActivated(INTEGRATIONS_SCREEN)
    } else {
      // #4431.4 — la raison rendue par le fournisseur reste lisible SUR la carte, au-delà du toast.
      if (result.reason) rememberConnectorFailure(result.provider, result.reason)
      toast.error(
        t('callback.failed', {
          name: providerLabel(result.provider),
          reason: result.reason ?? t('callback.reasonUnknown'),
        }),
      )
    }
    const params = new URLSearchParams(window.location.search)
    params.delete(result.provider)
    params.delete('reason')
    const qs = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
  }, [queryClient, t])

  if (registry.isLoading) {
    return (
      <Box className="flex h-48 items-center justify-center">
        <Spinner />
      </Box>
    )
  }

  if (registry.isError || !registry.data) {
    return (
      <Box className="flex flex-col items-start gap-3 rounded-lg border border-[var(--bellum-border)] p-6">
        <Text weight="medium">{t('error.title')}</Text>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('error.body')}
        </Text>
        <Button size="sm" variant="outline" onClick={() => void registry.refetch()}>
          {t('error.retry')}
        </Button>
      </Box>
    )
  }

  return (
    <Box className="flex w-full flex-col gap-6">
      {/* #4511 — l'en-tête de la maquette (`.bo11-head`) : titre et phrase à gauche, le geste à droite (dessous au
          téléphone). Ni compteur ni pastille : l'état se lit sur chaque carte. */}
      <Box as="header" className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <Box className="flex min-w-0 flex-1 basis-80 flex-col gap-2">
          <Text element="h1" size="3xl" weight="semibold" className="tracking-tight">
            {t('grid.title')}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('grid.subtitle')}
          </Text>
        </Box>
        <Box className="flex shrink-0 items-center gap-2 pt-1">
          <ImportEntryAction />
        </Box>
      </Box>

      <ScreenGuideLink guide={<IntegrationsGuide />} />

      {/* #4590.2 — chaque CRM branché, nommé, avec sa date de dernière lecture. */}
      <CrmReadSummary />

      <SettingsEmbeddedContext.Provider value>
        <Tabs value={tab} onValueChange={next => setTab(next as typeof tab)} className="gap-5">
          <TabsList variant="underline" aria-label={t('grid.tabsAria')} className="max-w-full overflow-x-auto">
            <TabsTrigger value="connecteurs" className="pointer-coarse:min-h-11">
              {t('grid.tabs.connectors')}
            </TabsTrigger>
            <TabsTrigger value="a-relire" className="gap-2 pointer-coarse:min-h-11">
              {t('grid.tabs.review')}
              {/* `.bo11-count` — le compteur se montre même à 0, comme la maquette : « rien à relire » est une réponse. */}
              <span className="rounded-badge bg-[var(--bellum-surface-2)] px-1.5 py-0.5 text-xs tabular-nums text-[var(--bellum-text-secondary)]">
                {reviewCount}
              </span>
            </TabsTrigger>
            <TabsTrigger value="historique" className="pointer-coarse:min-h-11">
              {t('grid.tabs.history')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="connecteurs">
            <Box className="flex w-full flex-col gap-8">
              <Box className="relative w-full sm:w-64">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--bellum-text-secondary)]"
                />
                <Input
                  {...guideAnchorProps('integrations.recherche')}
                  type="search"
                  aria-label={t('searchPlaceholder')}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="min-h-11 pl-8 text-xs md:min-h-9"
                  spellCheck={false}
                  autoComplete="off"
                />
              </Box>

              {shown.length === 0 ? (
                // #2958.104 — seule la recherche vide la grille : la phrase porte le geste qui la retire.
                <Box className="flex flex-col items-start gap-2">
                  <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                    {t('noMatch')}
                  </Text>
                  <Button type="button" size="sm" variant="outline" onClick={() => setSearch('')}>
                    {t('noMatchClear')}
                  </Button>
                </Box>
              ) : (
                TILE_FAMILY_ORDER.map(family => {
                  const inFamily = shown.filter(tile => tile.family === family)
                  if (inFamily.length === 0) return null
                  return (
                    <Box key={family} as="section" className="flex flex-col gap-3">
                      {/* `.t-family` — une légende discrète qui découpe la grille, pas un titre de section. */}
                      <Text
                        element="h2"
                        size="xs"
                        weight="semibold"
                        className="uppercase tracking-wider text-[var(--bellum-text-secondary)]"
                      >
                        {t(`grid.families.${family}`)}
                      </Text>
                      {/* `.bo11-integrations` — trois cartes au bureau, deux sur tablette, une au téléphone. */}
                      <Box display="grid" className="grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {inFamily.map(tile => {
                          const connector = view.all.find(c => c.id === tile.connector)
                          // G.6 — la salle montre Gmail et HubSpot branchés (overlay de lecture) : la mention le dit.
                          const demoNames =
                            tile.id === tile.connector ? demoConnectedNames(connector?.tools ?? [], isDemo) : []
                          return (
                            <Box key={tile.id} className="flex flex-col gap-1">
                              <ConnectorTile tile={tile} onOpen={setOpened} />
                              {demoNames.length > 0 ? (
                                <Text size="xs" className="px-1 text-[var(--bellum-text-secondary)]">
                                  {t('demoConnection', { name: demoNames.join(', ') })}
                                </Text>
                              ) : null}
                            </Box>
                          )
                        })}
                      </Box>
                    </Box>
                  )
                })
              )}

              {/* Arbitrage Louis 24/10 (#4510/#4511, « Retirer les blocs ») : sous la grille, plus rien — « Par quoi
                  commencer », les préférences de notification (Mon compte › Notifications) et les clés d'API
                  (Outils › MCP) sont partis, comme le dit la maquette. */}
            </Box>
          </TabsContent>
          <TabsContent value="a-relire">
            <ReviewTab />
          </TabsContent>
          <TabsContent value="historique">
            <IntegrationHistory connectors={view.all} />
          </TabsContent>
        </Tabs>
      </SettingsEmbeddedContext.Provider>

      {/* #4510 — « Voir le parcours » / « Reconnecter » : le tiroir rend la carte COMPLÈTE d'avant (droits, domaine,
          sandbox, ce qui est lu, synchro, reprise, capacités, diagnostic, première synchro, Déconnecter). */}
      <ConnectorDrawer
        tile={opened}
        state={openedView?.state}
        tools={openedView?.tools ?? []}
        demoNote={opened && opened.id === opened.connector ? demoConnectedNames(openedView?.tools ?? [], isDemo) : []}
        onClose={() => setOpened(null)}
      />
    </Box>
  )
}

/** `.v18-guide-body` — le texte que « Comment travailler ici ? » déplie sur cet écran. */
function IntegrationsGuide() {
  const { t } = useTranslation('integrationCenter')
  return (
    <Box className="flex flex-col gap-3">
      <Box>
        <Text element="h3" size="sm" weight="semibold">
          {t('grid.guide.heading')}
        </Text>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('grid.guide.intro')}
        </Text>
      </Box>
      <Box>
        <Text element="h4" size="xs" weight="semibold">
          {t('grid.guide.stepsTitle')}
        </Text>
        <ol className="list-decimal pl-5 text-sm text-[var(--bellum-text-secondary)]">
          <li>{t('grid.guide.step1')}</li>
          <li>{t('grid.guide.step2')}</li>
          <li>{t('grid.guide.step3')}</li>
        </ol>
      </Box>
      <Box>
        <Text element="h4" size="xs" weight="semibold">
          {t('grid.guide.keepTitle')}
        </Text>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('grid.guide.keep')}
        </Text>
      </Box>
    </Box>
  )
}
