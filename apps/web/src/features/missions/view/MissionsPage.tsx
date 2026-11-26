import type { ContractKind, MissionChannel, MissionStatus, RenewalWindow } from '@bellum/contracts'
import { Box, Button, CountBadge, SearchEmptyState, Text } from '@bellum/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { CollapsedSection } from '@/components/disclosure/CollapsedSection'
import { ScreenIntro } from '@/components/primitives/ScreenIntro'
import { trackFilterApplied } from '@/lib/product-tracker'
import { Route } from '@/routes/missions/index'
import { assigneeNames, assigneesOf, useMissions, type MissionView } from '../api'
import {
  RENEWAL_WINDOWS_IN_URGENCY_ORDER,
  accountCounts,
  channelCounts,
  consultantCounts,
  contractKindCounts,
  businessUnitCounts,
  currencyCounts,
  exceptionUrgencyRank,
  facetCounts,
  filterMissions,
  legalEntityCounts,
  matchesPresetView,
  matchesSatisfaction,
  ownerCounts,
  presetViewsFor,
  renewalCounts,
  satisfactionCounts,
  statusCounts,
  type MissionFacet,
  type MissionPresetView,
  type SatisfactionFilterValue,
} from '../filters'
import { isoDay } from '../planning'
import { endsWithinDays, type EndingHorizon } from '../ending-horizon'
import { isFinishedMission } from '../mission-status'
import type { MissionFilterState } from '../mission-saved-view-filters'
import type { MissionColumnKey } from '../columns'
import { useMissionColumns } from '../useMissionColumns'
import { useCrmCounters } from '@/features/crm-counters/useCrmCounters'
import { atRiskMonthlyRevenue } from '../kpis'
import { useForecastHorizons } from '@/features/pilotage/api'
import { MissionEndingChips } from './MissionEndingChips'
import { MissionColumnsPicker } from './MissionColumnsPicker'
import { MissionCockpitKpiTiles } from './MissionCockpitKpiTiles'
import { MissionBillingKpiTiles } from './MissionBillingKpiTiles'
import { MissionPanelContent } from './MissionDetailSheet'
import { RecordPanel } from '@/features/records/RecordPanel'
import { MissionsEmptyState } from './MissionsEmptyState'
import { OdooSalesSection } from './OdooSalesSection'
import { MissionsSourceFilterNotice } from './MissionsSourceFilterNotice'
import { MissionsStatStrip } from './MissionsStatStrip'
import {
  MissionAccountFilter,
  MissionChannelFilter,
  MissionConsultantFilter,
  MissionContractKindFilter,
  MissionBusinessUnitFilter,
  MissionCurrencyFilter,
  MissionEndWindowFilter,
  MissionFacetChips,
  MissionLegalEntityFilter,
  MissionOwnerFilter,
  MissionPresetViewChips,
  MissionSatisfactionFilter,
  MissionStatusFilter,
  MissionsToolbar,
} from './MissionsToolbar'
import { MissionsTable } from './MissionsTable'
import { SavedMissionViews } from './SavedMissionViews'
import { guideAnchorProps } from '@/features/guide/guide-anchors'

/**
 * MISSIONS — le neuvième écran, et le premier à rendre visible ce que le
 * Delivery OS savait déjà faire.
 *
 * Le module servait `/delivery/missions`, `/delivery/renewals` et
 * `/delivery/expansion` depuis des mois : aucune de ces trois routes n'avait
 * d'écran. Une capacité livrée qu'on ne peut pas atteindre n'existe pas.
 *
 * Deux lentilles sur le même objet, comme sur Projets : ce qui TOURNE, et ce qui
 * BLOQUE la facturation. La seconde est celle qu'on ouvre le 5 du mois, et elle
 * n'a pas sa place au milieu de la première — mélanger « la mission va bien » et
 * « son CRA n'est pas signé » fait rater le second.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ IL Y EN AVAIT TROIS — #2195.1, 16/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * La troisième s'appelait « Renouvellements », et c'est exactement le mot que
 * porte un GROUPE de la barre Missions depuis le matin même. Le même mot
 * désignait donc deux choses, avec deux contenus différents — la loi 4 du tome 7
 * l'interdit, et `sections.ts` portait la dette, datée, en attendant #2195.
 *
 * La lentille est RETIRÉE, et son contenu est repris et dépassé par
 * `/missions/renouvellements` (`RenewalsPage.tsx`), qui est une page de DÉCISION :
 * six fenêtres au lieu de quatre, et les deux suites d'une fin de mission
 * (renouveler / repositionner) côte à côte.
 *
 * ⚠️ Ce qui rend ce retrait sans danger : l'onglet n'avait pas d'URL — son état
 * vivait en mémoire de composant (`useState`). Aucun lien partagé, aucun favori,
 * aucune notification de routine ne pointait dessus. Le retirer ne casse rien,
 * ce qui n'aurait PAS été vrai d'une route.
 *
 * ⚠️ Ce qui reste ici, et qu'il ne faut pas « réparer » : la facette
 * « À renouveler » de la lentille « En cours ». Elle ne fait pas double emploi
 * avec le nouvel écran — elle resserre CETTE liste-ci sur les missions qui
 * arrivent à échéance, au milieu de tout ce qui tourne. Le nouvel écran répond à
 * une autre question, sur une autre population (`GET /delivery/renewals`), et
 * avec d'autres gestes.
 */
/** #1687 — le MOTIF d'écran, jamais dérivé de la lentille active. */
const MISSIONS_SCREEN = '/missions'

/** Multi-sélection : cocher ajoute, recocher retire (Théo, décision Louis 23/10). */
function toggleIn<T>(current: readonly T[], value: T): readonly T[] {
  return current.includes(value) ? current.filter(kept => kept !== value) : [...current, value]
}

/**
 * #4197 (L6) — la colonne « Renouvellement » est DEVENUE une colonne de « En
 * cours » : l'écran de décision de renouvellement n'existe plus
 * (`/missions/renouvellements` redirige ici, #3656), et la reconduction se lit
 * désormais sur la ligne. Verrouillée comme sur l'ancien écran (`locked`,
 * #2195.20) : présente à l'affichage, jamais écrite dans le choix enregistré.
 * Une constante hors composant — `locked` est une dépendance de mémo.
 */
const RENEWAL_COLUMN: readonly MissionColumnKey[] = ['renewalStatus']

export function MissionsPage() {
  const { t } = useTranslation('missions')
  // `from` : sans lui, le réducteur de recherche est typé contre TOUTES les
  // routes à la fois et n'a plus de forme possible. Même patron que les
  // contacts.
  const navigate = useNavigate({ from: '/missions/' })
  /**
   * §4.4 — LE LIEN DE SOURCE D'UN BLOC PROPAGÉ.
   *
   * « Ce client vous a rapporté X € sur N missions » se LIT sur la fiche compte
   * et se CALCULE ici. Le bandeau porte donc `/missions?accountId=…`, construit
   * par `missionsOfAccount`. La moitié web n'existait pas : le lien ouvrait la
   * liste ENTIÈRE, et un lien qui ne montre pas la source ment sur la source.
   *
   * ⚠️ Les deux clés partent au SERVEUR. `GET /delivery/missions` plafonne à 200
   * lignes sans pagination : les filtrer dans le navigateur trierait ces 200-là
   * et rendrait « 3 missions » là où le compte en a douze.
   */
  const { accountId, consultantId } = Route.useSearch()
  const { data, isLoading, isError } = useMissions({ accountId, consultantId })
  const [selected, setSelected] = useState<MissionView | undefined>(undefined)

  /**
   * #2408.64 / #2408.65 — LE PRÉVISIONNEL PAR HORIZON, lu pour CE mois — pas
   * recalculé (`kpis.ts`). `enabled: data?.canReadFinance === true` : sans
   * ce droit, la route répondrait 403 pour rien, et `MissionCockpitKpiTiles`
   * sait déjà lire ce droit pour rendre « non mesuré » au lieu d'un montant.
   */
  const { data: monthForecast } = useForecastHorizons('month', data?.canReadFinance === true)
  // #4193 — « Missions actives » et le revenu sécurisé : une source, `GET /crm-counters`.
  const { data: crmCounters } = useCrmCounters()
  // Le choix des colonnes vit dans SON hook, jamais dans cet écran : le tableau
  // et le sélecteur le lisent tous les deux (GA-26).
  const { visible: columns, toggle: toggleColumn, reset: resetColumns } = useMissionColumns(RENEWAL_COLUMN)

  /**
   * CE QUI RESSERRE LA LISTE — #1348, #1358, #1359, #1361, #1368.
   *
   * ⚠️ En mémoire de composant et non dans l'URL, contrairement à `accountId` /
   * `consultantId`. Ces deux-là sont des LIENS DE SOURCE : ils partent au
   * serveur et se partagent. Une facette n'est ni l'un ni l'autre — la poser
   * dans l'URL obligerait `validateSearch` à porter cinq clés de plus, dont
   * chacune deviendrait une clé morte le jour où la facette change de nom.
   */
  const [query, setQuery] = useState('')
  const [facets, setFacets] = useState<readonly MissionFacet[]>([])
  // #2407.5 — le statut choisi dans le filtre « Statut ». `null` = le
  // comportement par défaut de la lentille (tout ce qui tourne, hors les
  // statuts finis). Un statut choisi resserre EXPLICITEMENT sur lui, y
  // compris s'il est fini : demander « Terminée » doit montrer les missions
  // terminées, pas les cacher une seconde fois.
  const [statusFilter, setStatusFilter] = useState<readonly MissionStatus[]>([])
  // #2408.43 — la nature choisie dans le filtre « Nature ». Même patron que
  // `statusFilter` juste au-dessus : `null` ne resserre rien, une valeur
  // choisie filtre EXPLICITEMENT sur elle.
  const [contractKindFilter, setContractKindFilter] = useState<readonly ContractKind[]>([])
  // #2408.38 — le porteur choisi dans le filtre « Porteur ». Même patron,
  // mais la valeur est un NOM (`ownerName`), pas une énumération.
  const [ownerFilter, setOwnerFilter] = useState<readonly string[]>([])
  // #2408.45 — la fenêtre de fin choisie dans le filtre « Fin ». Même patron :
  // `null` ne resserre rien, une fenêtre choisie filtre EXPLICITEMENT sur elle.
  const [endWindowFilter, setEndWindowFilter] = useState<readonly RenewalWindow[]>([])
  // #4197 (L6) — « Fin sous 30 / 60 / 90 j » : fenêtre CUMULATIVE, en plus du filtre « Fin » (huit
  // fenêtres disjointes) ; `null` ne resserre rien.
  const [endsWithinFilter, setEndsWithinFilter] = useState<EndingHorizon | null>(null)
  // #2408.41 / #2408.42 — le compte / le consultant choisis dans leurs
  // sélecteurs dédiés, en plus de la recherche texte libre déjà là.
  const [accountFilter, setAccountFilter] = useState<readonly string[]>([])
  const [consultantFilter, setConsultantFilter] = useState<readonly string[]>([])
  // #2408.52 — le canal choisi dans le filtre « Canal ». Même patron que
  // `contractKindFilter` : `null` ne resserre rien, une valeur choisie filtre
  // EXPLICITEMENT sur elle. C'est aussi ce qui rend la vue enregistrée
  // « Partenaires/rang 2 » (#2408.62) atteignable une fois enregistrée.
  const [channelFilter, setChannelFilter] = useState<readonly MissionChannel[]>([])
  // #2408.53 — la devise choisie dans le filtre « Devise ». Même patron que
  // `channelFilter` juste au-dessus, mais la valeur est un CODE ISO 4217
  // (pas une énumération fermée) : `null` ne resserre rien, un code choisi
  // filtre EXPLICITEMENT sur lui.
  const [currencyFilter, setCurrencyFilter] = useState<readonly string[]>([])
  // #2408.39 — la BU / agence du compte porteur. Même patron que `currencyFilter`.
  const [businessUnitFilter, setBusinessUnitFilter] = useState<readonly string[]>([])
  // #2408.40 — la société juridique (ESN) qui porte la mission. Même patron.
  const [legalEntityFilter, setLegalEntityFilter] = useState<readonly string[]>([])
  // #2408.51 — la satisfaction déclarée (un niveau, ou « non mesurée »).
  const [satisfactionFilter, setSatisfactionFilter] = useState<readonly SatisfactionFilterValue[]>([])
  // #2408.54/.56/.57/.58/.59 — UNE vue prête à la fois (un second clic la retire).
  const [presetView, setPresetView] = useState<MissionPresetView | null>(null)

  const toggleFacet = useCallback((facet: MissionFacet) => {
    // #1687 — le NOM de la facette, jamais son état ni sa combinaison actuelle.
    trackFilterApplied(MISSIONS_SCREEN, facet)
    setFacets(current => (current.includes(facet) ? current.filter(kept => kept !== facet) : [...current, facet]))
  }, [])

  const toggleStatusFilter = useCallback((value: MissionStatus) => {
    // #1682 — le NOM du filtre part en télémétrie, jamais la valeur choisie.
    trackFilterApplied(MISSIONS_SCREEN, 'status')
    setStatusFilter(current => toggleIn(current, value))
  }, [])

  const toggleContractKindFilter = useCallback((value: ContractKind) => {
    // #1682 — même règle que `selectStatusFilter` : le NOM du filtre, jamais
    // la valeur choisie.
    trackFilterApplied(MISSIONS_SCREEN, 'contractKind')
    setContractKindFilter(current => toggleIn(current, value))
  }, [])

  const toggleOwnerFilter = useCallback((value: string) => {
    // #1682 — le NOM du filtre part en télémétrie, jamais le porteur choisi.
    trackFilterApplied(MISSIONS_SCREEN, 'owner')
    setOwnerFilter(current => toggleIn(current, value))
  }, [])

  const toggleEndWindowFilter = useCallback((value: RenewalWindow) => {
    // #1682 — le NOM du filtre part en télémétrie, jamais la fenêtre choisie.
    trackFilterApplied(MISSIONS_SCREEN, 'endWindow')
    setEndWindowFilter(current => toggleIn(current, value))
  }, [])

  const selectEndsWithinFilter = useCallback((next: EndingHorizon | null) => {
    // #4197 — même dimension que « Fin » côté télémétrie : le NOM du filtre, jamais l'horizon.
    trackFilterApplied(MISSIONS_SCREEN, 'endWindow')
    setEndsWithinFilter(next)
  }, [])

  const toggleAccountFilter = useCallback((value: string) => {
    trackFilterApplied(MISSIONS_SCREEN, 'account')
    setAccountFilter(current => toggleIn(current, value))
  }, [])

  const toggleConsultantFilter = useCallback((value: string) => {
    trackFilterApplied(MISSIONS_SCREEN, 'consultant')
    setConsultantFilter(current => toggleIn(current, value))
  }, [])

  const toggleChannelFilter = useCallback((value: MissionChannel) => {
    // #1682 — le NOM du filtre part en télémétrie, jamais le canal choisi.
    trackFilterApplied(MISSIONS_SCREEN, 'channel')
    setChannelFilter(current => toggleIn(current, value))
  }, [])

  const toggleCurrencyFilter = useCallback((value: string) => {
    // #1682 — le NOM du filtre part en télémétrie, jamais la devise choisie.
    trackFilterApplied(MISSIONS_SCREEN, 'currency')
    setCurrencyFilter(current => toggleIn(current, value))
  }, [])

  const toggleBusinessUnitFilter = useCallback((value: string) => {
    // #1682 — le NOM du filtre part en télémétrie, jamais la BU choisie.
    trackFilterApplied(MISSIONS_SCREEN, 'businessUnit')
    setBusinessUnitFilter(current => toggleIn(current, value))
  }, [])

  const toggleLegalEntityFilter = useCallback((value: string) => {
    trackFilterApplied(MISSIONS_SCREEN, 'legalEntity')
    setLegalEntityFilter(current => toggleIn(current, value))
  }, [])

  const toggleSatisfactionFilter = useCallback((value: SatisfactionFilterValue) => {
    trackFilterApplied(MISSIONS_SCREEN, 'satisfaction')
    setSatisfactionFilter(current => toggleIn(current, value))
  }, [])

  const togglePresetView = useCallback((value: MissionPresetView) => {
    // Le NOM de la vue part en télémétrie, comme celui d'une facette.
    trackFilterApplied(MISSIONS_SCREEN, value)
    setPresetView(current => (current === value ? null : value))
  }, [])

  /**
   * #2408.54 — CE QUE « Mes vues » enregistre et relit — la même rangée de
   * filtres que `MissionsToolbar`/les sélecteurs dédiés ci-dessus, sous la
   * forme que `mission-saved-view-filters.ts` sait valider et rejouer.
   */
  const missionFilterState = useMemo<MissionFilterState>(
    () => ({
      query,
      facets,
      status: statusFilter,
      contractKind: contractKindFilter,
      owner: ownerFilter,
      account: accountFilter,
      consultant: consultantFilter,
      endWindow: endWindowFilter,
      channel: channelFilter,
      currency: currencyFilter,
      businessUnit: businessUnitFilter,
    }),
    [
      query,
      facets,
      statusFilter,
      contractKindFilter,
      ownerFilter,
      accountFilter,
      consultantFilter,
      endWindowFilter,
      channelFilter,
      currencyFilter,
      businessUnitFilter,
    ],
  )

  const applyMissionFilters = useCallback((next: MissionFilterState) => {
    setQuery(next.query)
    setFacets(next.facets)
    setStatusFilter(next.status)
    setContractKindFilter(next.contractKind)
    setOwnerFilter(next.owner)
    setAccountFilter(next.account)
    setConsultantFilter(next.consultant)
    setEndWindowFilter(next.endWindow)
    setChannelFilter(next.channel)
    setCurrencyFilter(next.currency)
    setBusinessUnitFilter(next.businessUnit)
  }, [])

  const missions = useMemo(() => {
    // « En cours » ne montre QUE ce qui tourne. La liste n'était filtrée sur
    // aucun statut : une mission terminée s'affichait ici, sous un sous-titre
    // qui promet « ce qui tourne aujourd'hui », avec son badge « Terminée »
    // juste en dessous.
    //
    // #2407.5 — un statut CHOISI dans le filtre passe devant ce défaut : il
    // resserre sur ce statut précis, fini ou non, plutôt que de l'exclure une
    // seconde fois derrière `isFinishedMission`.
    const byStatus =
      statusFilter.length > 0
        ? (data?.missions ?? []).filter(m => statusFilter.includes(m.status as MissionStatus))
        : (data?.missions ?? []).filter(m => !isFinishedMission(m.status))
    // #2408.43 — la nature choisie resserre à son tour, en ET avec le statut
    // ci-dessus : même règle que les facettes de `filterMissions` (loi 4 du
    // tome 7, un critère cumulé plutôt qu'un second écran).
    const byContractKind =
      contractKindFilter.length > 0
        ? byStatus.filter(m => contractKindFilter.includes(m.contract_kind as ContractKind))
        : byStatus
    // #2408.38 — le porteur choisi resserre à son tour, même règle.
    const byOwner =
      ownerFilter.length > 0
        ? byContractKind.filter(m => m.ownerName != null && ownerFilter.includes(m.ownerName))
        : byContractKind
    // #2408.45 — la fenêtre de fin choisie resserre à son tour, même règle.
    const byEndWindow =
      endWindowFilter.length > 0 ? byOwner.filter(m => endWindowFilter.includes(m.renewal ?? 'unknown')) : byOwner
    // #2408.41 — le compte choisi resserre à son tour, même règle.
    const byAccount =
      accountFilter.length > 0
        ? byEndWindow.filter(m => m.accountName != null && accountFilter.includes(m.accountName))
        : byEndWindow
    // #2408.52 — le canal choisi resserre à son tour, même règle.
    const byChannel =
      channelFilter.length > 0
        ? byAccount.filter(m => m.channel != null && channelFilter.includes(m.channel))
        : byAccount
    // #2408.53 — la devise choisie resserre à son tour, même règle.
    const byCurrency =
      currencyFilter.length > 0
        ? byChannel.filter(m => m.currency != null && currencyFilter.includes(m.currency))
        : byChannel
    // #2408.42 — le consultant choisi resserre à son tour, même règle. Une
    // mission à plusieurs affectés matche dès que L'UN d'eux est le choisi.
    // #2408.39 — la BU choisie resserre à son tour, même règle.
    const byBusinessUnit =
      businessUnitFilter.length > 0
        ? byCurrency.filter(m => m.businessUnitName != null && businessUnitFilter.includes(m.businessUnitName))
        : byCurrency
    // #2408.40 — la société juridique choisie resserre à son tour, même règle.
    const byLegalEntity =
      legalEntityFilter.length > 0
        ? byBusinessUnit.filter(m => m.legalEntityName != null && legalEntityFilter.includes(m.legalEntityName))
        : byBusinessUnit
    // #2408.51 — la satisfaction choisie resserre à son tour, même règle.
    const bySatisfaction = byLegalEntity.filter(m => matchesSatisfaction(m, satisfactionFilter))
    const byConsultant =
      consultantFilter.length > 0
        ? bySatisfaction.filter(m => assigneeNames(m).some(name => consultantFilter.includes(name)))
        : bySatisfaction
    // #4197 (L6) — « Fin sous N j », cumulatif, même règle (un critère de plus, en ET).
    const rows =
      endsWithinFilter != null ? byConsultant.filter(m => endsWithinDays(m.ends_on, endsWithinFilter)) : byConsultant
    // ⚠️ #2195.2 à #2195.7 — le rang se DÉRIVE de l'ordre d'urgence, il ne le
    // recopie plus. La table littérale était figée sur six fenêtres : le jour
    // où J-45 et J-15 sont nées, elles seraient tombées dans le repli `?? 9`,
    // c'est-à-dire APRÈS « rien à faire ». Une échelle vit à un seul endroit
    // (GA-26), et `unknown` y est déjà AVANT `far` — une mission sans date de
    // fin enterrée en bas de liste est précisément celle qu'on rate.
    const rank = (window: RenewalWindow): number => {
      const index = RENEWAL_WINDOWS_IN_URGENCY_ORDER.indexOf(window)
      return index === -1 ? RENEWAL_WINDOWS_IN_URGENCY_ORDER.length : index
    }
    // #2408 « tri par urgence » — à fenêtre égale, l'exception la plus grave
    // passe devant (`exceptionUrgencyRank`, dérivé de `missionRiskSeverity`).
    return [...rows].sort(
      (a, b) =>
        rank(a.renewal ?? 'unknown') - rank(b.renewal ?? 'unknown') ||
        exceptionUrgencyRank(a) - exceptionUrgencyRank(b),
    )
  }, [
    data?.missions,
    statusFilter,
    contractKindFilter,
    ownerFilter,
    endWindowFilter,
    accountFilter,
    channelFilter,
    currencyFilter,
    businessUnitFilter,
    legalEntityFilter,
    satisfactionFilter,
    consultantFilter,
    endsWithinFilter,
  ])

  // Ce qu'on a RETIRÉ de la vue. Un onglet qui se vide sans un mot fait
  // chercher une panne ; le compter permet de dire « elles sont terminées »
  // plutôt que « il n'y a rien ».
  const finishedCount = useMemo(
    () => (data?.missions ?? []).filter(m => isFinishedMission(m.status)).length,
    [data?.missions],
  )

  /**
   * #2979 — LE PÉRIMÈTRE QUE LES PASTILLES COMPTENT : celui de la vue ACTIVE
   * (le statut choisi, sinon « ce qui tourne », jamais les missions finies que
   * la vue écarte). Recette prod 02/10 : « Agence Lyon 14 » ouvrait 10 lignes,
   * parce que la pastille comptait aussi quatre missions terminées. Une
   * pastille dit ce que le clic MONTRE. Les AUTRES filtres restent hors du
   * compte (sinon une pastille tomberait à 0 dès qu'on en coche une autre) ;
   * seul « Statut » compte le parc entier, c'est lui qui change le périmètre.
   */
  const scopedMissions = useMemo(
    () =>
      statusFilter.length > 0
        ? (data?.missions ?? []).filter(m => statusFilter.includes(m.status as MissionStatus))
        : (data?.missions ?? []).filter(m => !isFinishedMission(m.status)),
    [data?.missions, statusFilter],
  )

  /**
   * LES POPULATIONS COMPTÉES, ET LA LISTE QU'ELLES RESSERRENT.
   *
   * ⚠️ Les compteurs se calculent sur la liste ENTIÈRE de la lentille, la
   * recherche appliquée mais pas les facettes — sinon cocher « Sans date de
   * fin » ferait tomber « Avec risque » à zéro alors que trois missions y
   * répondent, et une pastille à « 0 » qu'un clic remplit se lit comme une
   * panne. `facetCounts` porte ce choix et son test.
   *
   * #2408.60 — `today` est lu UNE fois par montage (`useMemo`, deps `[]`),
   * jamais un `new Date()` séparé dans chacun des deux appels : la facette
   * « Consultants bientôt disponibles » en a besoin, et deux horloges lues à
   * quelques lignes d'écart pourraient diverger pile à minuit.
   */
  const today = useMemo(() => isoDay(new Date()), [])
  const counts = useMemo(() => facetCounts(missions, query, today), [missions, query, today])
  /**
   * #2408.54/.56/.57/.58/.59 — les vues prêtes OFFERTES suivent le droit :
   * sans `finance:read`, aucune vue financière (Factures bloquées, Paiements
   * en retard, Marge non mesurée). Une vue posée puis devenue hors droit ne
   * resserre plus rien.
   */
  const offeredPresetViews = useMemo(() => presetViewsFor(data?.canReadFinance), [data?.canReadFinance])
  const activePresetView = presetView !== null && offeredPresetViews.includes(presetView) ? presetView : null
  const presetViewCounts = useMemo(
    () =>
      new Map(
        offeredPresetViews.map(view => [view, missions.filter(mission => matchesPresetView(mission, view)).length]),
      ),
    [offeredPresetViews, missions],
  )
  const visibleMissions = useMemo(
    () =>
      filterMissions(missions, { query, facets }, today).filter(
        mission => activePresetView === null || matchesPresetView(mission, activePresetView),
      ),
    [missions, query, facets, today, activePresetView],
  )

  /**
   * #2407.5 — les comptes du filtre « Statut », sur le PARC ENTIER de la
   * lentille (`data?.missions`), pas sur `missions` : celle-ci est DÉJÀ
   * resserrée par `statusFilter` quand il est posé, et compter dessus ferait
   * tomber les treize autres pastilles à une absence dès qu'on en choisit
   * une — l'utilisateur ne pourrait plus voir combien de missions portent
   * chaque AUTRE statut pour changer d'avis.
   */
  const statusFilterCounts = useMemo(() => statusCounts(data?.missions ?? [], query), [data?.missions, query])

  /**
   * #2408.43 — même raison que `statusFilterCounts` juste au-dessus : compté
   * sur le PARC ENTIER (`data?.missions`), pas sur `missions` qui est déjà
   * resserrée par `contractKindFilter` quand il est posé.
   */
  const contractKindFilterCounts = useMemo(() => contractKindCounts(scopedMissions, query), [scopedMissions, query])

  /**
   * #2408.38 — même raison que les deux compteurs juste au-dessus : compté
   * sur le PARC ENTIER de la lentille, jamais sur `missions` déjà resserrée.
   */
  const ownerFilterCounts = useMemo(() => ownerCounts(scopedMissions, query), [scopedMissions, query])

  /**
   * #2408.45 — même raison que les compteurs juste au-dessus : sur le PARC
   * ENTIER de la lentille. `renewalCounts` seed les huit fenêtres (`far`
   * comprise), mais `MissionEndWindowFilter` n'en LIT que sept — `far` n'y
   * figure jamais parmi les options (cf. son commentaire, `MissionsToolbar.tsx`).
   */
  const endWindowFilterCounts = useMemo(() => renewalCounts(scopedMissions, query), [scopedMissions, query])

  // #2408.41 / #2408.42 — mêmes gardes : comptés sur le PARC ENTIER.
  const accountFilterCounts = useMemo(() => accountCounts(scopedMissions, query), [scopedMissions, query])
  const consultantFilterCounts = useMemo(() => consultantCounts(scopedMissions, query), [scopedMissions, query])

  /**
   * #2408.52 — même garde que les compteurs juste au-dessus : sur le PARC
   * ENTIER de la lentille. `undefined` (sans `finance:read`, ou aucune ligne
   * de conditions commerciales) ne pose AUCUNE clé — `channelCounts` porte ce
   * choix et son test.
   */
  const channelFilterCounts = useMemo(() => channelCounts(scopedMissions, query), [scopedMissions, query])

  /**
   * #2408.53 — même garde que `channelFilterCounts` juste au-dessus : sur le
   * PARC ENTIER de la lentille. `undefined` (sans `finance:read`, ou aucune
   * ligne de conditions commerciales) ET `null` (ligne lue, devise non
   * renseignée) ne posent AUCUNE clé — `currencyCounts` porte ce choix et
   * son test.
   */
  const currencyFilterCounts = useMemo(() => currencyCounts(scopedMissions, query), [scopedMissions, query])

  /** #2408.39 — même garde que `currencyFilterCounts` : sur le PARC entier de la lentille. */
  const businessUnitFilterCounts = useMemo(() => businessUnitCounts(scopedMissions, query), [scopedMissions, query])
  // #2408.40 / #2408.51 — mêmes gardes : sur le PARC entier de la lentille.
  const legalEntityFilterCounts = useMemo(() => legalEntityCounts(scopedMissions, query), [scopedMissions, query])
  const satisfactionFilterCounts = useMemo(() => satisfactionCounts(scopedMissions, query), [scopedMissions, query])

  const narrowed =
    query.trim().length > 0 ||
    facets.length > 0 ||
    statusFilter.length > 0 ||
    contractKindFilter.length > 0 ||
    ownerFilter.length > 0 ||
    endWindowFilter.length > 0 ||
    accountFilter.length > 0 ||
    consultantFilter.length > 0 ||
    channelFilter.length > 0 ||
    currencyFilter.length > 0 ||
    businessUnitFilter.length > 0 ||
    legalEntityFilter.length > 0 ||
    satisfactionFilter.length > 0 ||
    activePresetView !== null ||
    endsWithinFilter != null

  const clearFilters = useCallback(() => {
    setQuery('')
    setFacets([])
    setStatusFilter([])
    setContractKindFilter([])
    setOwnerFilter([])
    setEndWindowFilter([])
    setAccountFilter([])
    setConsultantFilter([])
    setChannelFilter([])
    setCurrencyFilter([])
    setBusinessUnitFilter([])
    setLegalEntityFilter([])
    setSatisfactionFilter([])
    setPresetView(null)
    setEndsWithinFilter(null)
  }, [])

  /**
   * Le nom du compte, LU sur les lignes rendues — jamais deviné.
   *
   * Une liste filtrée vide n'apprend aucun nom : la pastille dit alors « d'un
   * seul compte », ce qui est vrai, plutôt que d'afficher un identifiant brut
   * que personne ne reconnaît.
   */
  const filteredAccountName = useMemo(() => {
    if (!accountId) return undefined
    return (data?.missions ?? []).find(m => m.account_id === accountId)?.accountName ?? undefined
  }, [accountId, data?.missions])

  const isSourceFiltered = Boolean(accountId || consultantId)

  // #3144 (27/09/2026, bêta ; corrigé 28/09/2026) — tous les filtres du
  // dépliable comptés pour le compteur de l'entête repliée (`CollapsedSection`,
  // badge), même patron que `activeFilterCount` de `ContactContent.tsx`
  // (#2477). Recette du 28/09 : le compteur ignorait les pastilles rapides
  // (`facets`) et la devise — posées, elles ne se voyaient nulle part sur
  // l'entête fermé.
  // #2979 / #2408.63-.65 — les trois tuiles KPI : VISIBLES d'emblée dès 768 px (une seule
  // rangée de ~100 px — la recette prod du 01/10 n'en voyait aucune, repliées sous « Filtres »),
  // et sous le dépliable en mobile où elles s'empileraient sur ~330 px. Un seul rendu à la
  // fois, jamais deux fois sous la même forme (GA-26). Tranché sans Louis : le dépliable #3144
  // visait l'empilement mobile, pas le bureau.
  const isMobile = useIsMobile()
  const kpiNow = useMemo(() => new Date(), [])
  const kpiTiles =
    !isLoading && !isError && missions.length > 0 ? (
      <MissionCockpitKpiTiles
        activeMissionsCount={crmCounters?.counters.missions_active.value ?? null}
        canReadFinance={data?.canReadFinance}
        securedRevenue={
          crmCounters?.secured_revenue_month.measured ? crmCounters.secured_revenue_month.amounts : undefined
        }
        atRiskRevenue={atRiskMonthlyRevenue(monthForecast)}
        // #2408.68/.69 — montées SEULEMENT sous finance:read : sans ce droit,
        // ni tuile ni requête.
        billing={data?.canReadFinance === true ? <MissionBillingKpiTiles now={kpiNow} /> : null}
      />
    ) : null

  // Théo C missions-planning — les trois repères cliquables (`.m5-stat`). « Démarrages prévus » : les
  // missions signées pas encore démarrées (`onboarding`, `ready_to_start`), comptées sur le parc.
  const startingStatuses: readonly MissionStatus[] = ['onboarding', 'ready_to_start']
  const startingPressed =
    statusFilter.length === startingStatuses.length && startingStatuses.every(status => statusFilter.includes(status))
  const missionStats = [
    {
      key: 'endsSoon' as const,
      count: crmCounters?.counters.missions_ending_30?.value ?? null,
      pressed: endsWithinFilter === 30,
      onToggle: () => selectEndsWithinFilter(endsWithinFilter === 30 ? null : 30),
    },
    {
      key: 'starting' as const,
      count: startingStatuses.reduce((sum, status) => sum + (statusFilterCounts.get(status) ?? 0), 0),
      pressed: startingPressed,
      onToggle: () => setStatusFilter(startingPressed ? [] : startingStatuses),
    },
    {
      key: 'noEndDate' as const,
      count: counts.noEndDate,
      pressed: facets.includes('noEndDate'),
      onToggle: () => toggleFacet('noEndDate'),
    },
  ]
  // Le nom de la personne quand la liste arrive filtrée sur elle, LU sur les lignes rendues.
  const filteredConsultantName = useMemo(() => {
    if (!consultantId) return undefined
    for (const row of data?.missions ?? []) {
      const person = assigneesOf(row).find(assignee => assignee.id === consultantId)
      if (person) return person.fullName
    }
    return undefined
  }, [data?.missions, consultantId])

  const activeFilterCount =
    [
      ...statusFilter,
      ...contractKindFilter,
      ...ownerFilter,
      ...endWindowFilter,
      ...accountFilter,
      ...consultantFilter,
      ...channelFilter,
      ...currencyFilter,
      ...businessUnitFilter,
      ...legalEntityFilter,
      ...satisfactionFilter,
    ].length +
    (endsWithinFilter === null ? 0 : 1) +
    facets.length

  // ⚠️ Un geste, pas un rendu : `<Navigate>` compare l'identité de son objet de
  // props et rejoue en boucle (GA-27).
  const clearSourceFilter = useCallback(() => {
    void navigate({ search: prev => ({ ...prev, accountId: undefined, consultantId: undefined }) })
  }, [navigate])

  return (
    <CustomerPage anchorId="missions" titleInScreen pageTitle={t('page.title')}>
      {/* #3559 — borne qui empêche un tableau large de pousser cette colonne flex au-delà de
          la largeur de l'écran ; portée par /missions/renouvellements (RenewalsPage, `752fe05e7`)
          jusqu'à sa suppression (#3656), reprise ici puisque la route alias atterrit sur /missions. */}
      <Box
        {...guideAnchorProps('missions.contenu')}
        data-missions-content
        className="min-w-0 max-w-full space-y-4 py-4"
      >
        {/* #1346, #1347, #1361 — L'ENTÊTE SUIT LA LENTILLE.
            Un entête posé AU-DESSUS des onglets promettrait « les missions
            actives classées par urgence » y compris sous « Prêt à facturer »,
            qui lit une autre route et répond à une autre question. C'est la
            décision prise la veille sur Comptes (#1345).
            ⚠️ La lentille « Prêt à facturer » n'en reçoit pas : son panneau
            porte déjà son propre titre, et aucun retour n'en demandait un. */}
        <>
          {/* Théo C missions-planning `.page-head` — le titre (#2192.6 : « Tes missions, {prénom}. »), la
              phrase, et l'action principale à droite. « Nouvelle mission » ne s'y rend QUE quand le tableau a
              des lignes : l'état vide porte déjà sa propre porte (#2732.1, GA-26). */}
          <Box data-testid="missions-page-head">
            <ScreenIntro
              title={t('page.introTitle')}
              titleWithoutName={t('page.introTitleWithoutName')}
              subtitle={t('page.introSubtitle')}
              action={
                !isLoading && !isError && missions.length > 0 ? (
                  <Button asChild size="sm" className="pointer-coarse:min-h-11">
                    <Link to="/missions/nouvelle">{t('page.newMission')}</Link>
                  </Button>
                ) : undefined
              }
            />
          </Box>

          {/* Théo `.m5-source` — « Missions de … · Tu arrives depuis sa fiche · Retirer le filtre ». Le
              filtre ne porte que sur cette liste : annoncé plus haut, il prétendrait resserrer aussi le
              planning et la facturation, qui lisent d'autres routes. */}
          <MissionsSourceFilterNotice
            accountId={accountId}
            consultantId={consultantId}
            accountName={filteredAccountName}
            consultantName={filteredConsultantName}
            onRemove={clearSourceFilter}
          />

          {!isLoading && !isError && (data?.missions ?? []).length > 0 ? (
            <MissionsStatStrip stats={missionStats} />
          ) : null}
          {/* #2979 / #2408.63-.65 — les trois tuiles KPI, visibles dès 768 px (gardées hors maquette). */}
          {isMobile ? null : kpiTiles}

          {/* Théo `.m5-toolbar` — la bascule de vue, la recherche, les filtres, les colonnes. */}
          <Box
            data-theo-block="toolbar"
            className="flex flex-wrap items-center gap-2 empty:hidden"
            data-testid="missions-toolbar-row"
          >
            <nav
              aria-label={t('views.label')}
              className="inline-flex rounded-control border border-[var(--bellum-border)] p-0.5"
            >
              <Link
                to="/missions/planification"
                className="inline-flex min-h-9 items-center rounded-control px-3 text-sm text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)] pointer-coarse:min-h-11"
              >
                {t('views.planning')}
              </Link>
              <span
                aria-current="page"
                className="inline-flex min-h-9 items-center rounded-control bg-[var(--bellum-surface-2)] px-3 text-sm font-semibold text-[var(--bellum-text-primary)] pointer-coarse:min-h-11"
              >
                {t('views.table')}
              </span>
            </nav>
            {!isLoading && !isError && missions.length > 0 ? (
              <MissionsToolbar
                query={query}
                onQueryChange={setQuery}
                facets={facets}
                onToggleFacet={toggleFacet}
                counts={counts}
                canReadFinance={data?.canReadFinance}
                // #3144 — les pastilles rapides vivent sous « Filtres » (`MissionFacetChips`) :
                // cette rangée ne les rend pas une seconde fois (GA-26).
                hideFacets
                trailing={
                  <>
                    {!isLoading && !isError && (data?.missions ?? []).length > 0 ? (
                      <CollapsedSection
                        title={t('filtersSection.title')}
                        badge={activeFilterCount > 0 ? <CountBadge count={activeFilterCount} size="sm" /> : undefined}
                      >
                        <div className="flex flex-col gap-3">
                          {/* #4197 (L6) — « Fin sous 30 j · 60 j · 90 j » : les nombres de `GET /crm-counters`
                                (#4193). Refonte Théo — rangés ici : le repère « Fins sous 30 jours » de la
                                tête de liste porte le premier, sans le recompter. */}
                          <Box data-testid="missions-ending-chips">
                            <MissionEndingChips
                              counters={crmCounters?.counters}
                              selected={endsWithinFilter}
                              onSelect={selectEndsWithinFilter}
                            />
                          </Box>
                          {/* #2408.63 / #2408.64 / #2408.65 — les trois
                                tuiles KPI (voir l'entête de
                                `MissionCockpitKpiTiles.tsx` pour les six
                                écartées). Chacune ~100 px, empilées sur trois
                                rangées sous 768 px (~330 px) : bien au-delà
                                des ~80 px d'un bandeau toujours visible,
                                elles rejoignent donc ce dépliable plutôt que
                                la rangée compacte. */}
                          {isMobile ? kpiTiles : null}

                          {/* #1359, #1368 — LES CINQ PASTILLES RAPIDES.
                                Comptées sur le PARC ENTIER, comme les filtres
                                dédiés ci-dessous. */}
                          <MissionFacetChips
                            facets={facets}
                            onToggleFacet={toggleFacet}
                            counts={counts}
                            canReadFinance={data?.canReadFinance}
                          />

                          {/* #2407.5 — LE FILTRE « STATUT », sur le PARC
                                ENTIER de la lentille (`data?.missions`), pas
                                sur `missions` : ce dernier est déjà resserré
                                par `statusFilter` quand il est posé, et gater
                                cette rangée dessus la ferait disparaître dès
                                qu'un statut choisi ne rend AUCUNE ligne —
                                l'utilisateur resterait bloqué sur ce statut
                                sans pouvoir en choisir un autre. */}
                          <MissionStatusFilter
                            counts={statusFilterCounts}
                            selected={statusFilter}
                            onToggle={toggleStatusFilter}
                          />

                          {/* #2408.45 — LE FILTRE « FIN », même garde que
                                « Statut » juste au-dessus : compté sur le parc
                                entier de la lentille. */}
                          <MissionEndWindowFilter
                            counts={endWindowFilterCounts}
                            selected={endWindowFilter}
                            onToggle={toggleEndWindowFilter}
                          />

                          {/* #2408.41 — LE FILTRE « CLIENT », dédié — en
                                plus de la recherche texte libre déjà là. Même
                                garde que « Porteur » : rendu SEULEMENT si au
                                moins un compte est renseigné. */}
                          {accountFilterCounts.size > 0 ? (
                            <MissionAccountFilter
                              counts={accountFilterCounts}
                              selected={accountFilter}
                              onToggle={toggleAccountFilter}
                            />
                          ) : null}

                          {/* #2408.42 — LE FILTRE « CONSULTANT », même
                                garde que « Client » juste au-dessus. */}
                          {consultantFilterCounts.size > 0 ? (
                            <MissionConsultantFilter
                              counts={consultantFilterCounts}
                              selected={consultantFilter}
                              onToggle={toggleConsultantFilter}
                            />
                          ) : null}

                          {/* Théo — « tous les filtres présents, les pertinents d'abord, le reste sous
                                Plus de filtres » (décision Louis 23/10). */}
                          <CollapsedSection title={t('filtersSection.more')}>
                            <div className="flex flex-col gap-3">
                              {/* #2408.43 — LE FILTRE « NATURE », même garde
                                que « Statut » juste au-dessus : compté sur le
                                parc entier de la lentille. */}
                              <MissionContractKindFilter
                                counts={contractKindFilterCounts}
                                selected={contractKindFilter}
                                onToggle={toggleContractKindFilter}
                              />

                              {/* #2408.38 — LE FILTRE « PORTEUR ». ⚠️ Rendu
                                seulement si AU MOINS un porteur est renseigné
                                sur le parc : un filtre qui ne proposerait
                                aucune valeur ne serait pas un filtre, ce
                                serait un piège (même garde que
                                `canFilterWithoutAmount`,
                                `InvoiceReadinessPanel.tsx`). */}
                              {ownerFilterCounts.size > 0 ? (
                                <MissionOwnerFilter
                                  counts={ownerFilterCounts}
                                  selected={ownerFilter}
                                  onToggle={toggleOwnerFilter}
                                />
                              ) : null}

                              {/* #2408.52 — LE FILTRE « CANAL », même garde que
                                « Porteur » / « Client » : rendu SEULEMENT si
                                au moins un canal est CONNU sur le parc (sans
                                `finance:read`, ou aucune ligne de conditions
                                commerciales, aucun canal ne remonte jamais). */}
                              {channelFilterCounts.size > 0 ? (
                                <MissionChannelFilter
                                  counts={channelFilterCounts}
                                  selected={channelFilter}
                                  onToggle={toggleChannelFilter}
                                />
                              ) : null}

                              {/* #2408.53 — LE FILTRE « DEVISE », même garde
                                que « Canal » juste au-dessus : rendu
                                SEULEMENT si au moins une devise est CONNUE sur
                                le parc (sans `finance:read`, ou une ligne de
                                conditions commerciales sans devise renseignée,
                                aucune devise ne remonte jamais). */}
                              {currencyFilterCounts.size > 0 ? (
                                <MissionCurrencyFilter
                                  counts={currencyFilterCounts}
                                  selected={currencyFilter}
                                  onToggle={toggleCurrencyFilter}
                                />
                              ) : null}

                              {/* #2408.39 — LE FILTRE « BU / AGENCE » : rendu
                                SEULEMENT si au moins une BU est CONNUE sur le
                                parc (compte sans BU déclarée = aucune ligne). */}
                              {businessUnitFilterCounts.size > 0 ? (
                                <MissionBusinessUnitFilter
                                  counts={businessUnitFilterCounts}
                                  selected={businessUnitFilter}
                                  onToggle={toggleBusinessUnitFilter}
                                />
                              ) : null}

                              {/* #2408.40 — « Société » : rendu SEULEMENT si une
                                société est CONNUE sur le parc. */}
                              {legalEntityFilterCounts.size > 0 ? (
                                <MissionLegalEntityFilter
                                  counts={legalEntityFilterCounts}
                                  selected={legalEntityFilter}
                                  onToggle={toggleLegalEntityFilter}
                                />
                              ) : null}

                              {/* #2408.51 — « Satisfaction » : les niveaux
                                DÉCLARÉS et « non mesurée », jamais un score. */}
                              {satisfactionFilterCounts.size > 0 ? (
                                <MissionSatisfactionFilter
                                  counts={satisfactionFilterCounts}
                                  selected={satisfactionFilter}
                                  onToggle={toggleSatisfactionFilter}
                                />
                              ) : null}
                            </div>
                          </CollapsedSection>
                        </div>
                      </CollapsedSection>
                    ) : null}

                    <MissionColumnsPicker visible={columns} onToggle={toggleColumn} onReset={resetColumns} />
                  </>
                }
              />
            ) : null}
          </Box>

          {/* #3144 — les tuiles KPI (#2408.63/.64/.65), les pastilles
                rapides (#1359, #1368) et les sept filtres (#2407.5, #2408.38,
                #2408.41 à .45, #2408.52, #2408.53) vivent désormais dans le
                dépliable « Filtres » de la rangée compacte, au-dessus
                (`ScreenIntro`, prop `action`) — voir son commentaire pour la
                raison du déplacement. `MissionsToolbar` (recherche + Laura)
                les y rejoint aussi : cet écran ne rend donc plus de barre ni
                de tuiles ici, entre les onglets et « Mes vues ». */}

          {/* #2408.54 — « Mes vues » : le mécanisme de persistance que
                l'épopée #2979 nommait absent sur cet écran, appliqué au
                mécanisme générique déjà servi par `/governance/views`
                (`SavedTalentViews.tsx`, #2152.37). Rendu SEULEMENT à côté
                d'une barre déjà utile — même garde que `MissionsToolbar`
                juste au-dessus. */}
          {/* #2408.54/.56/.57/.58/.59 — les vues PRÊTES, nommées, à côté de
                « Mes vues » (personnelles) : deux mécanismes, deux usages. */}
          {!isLoading && !isError && missions.length > 0 ? (
            <MissionPresetViewChips
              views={offeredPresetViews}
              counts={presetViewCounts}
              selected={activePresetView}
              onToggle={togglePresetView}
            />
          ) : null}
          {!isLoading && !isError && missions.length > 0 ? (
            <SavedMissionViews draft={missionFilterState} onApply={applyMissionFilters} />
          ) : null}

          {isLoading ? (
            <Text size="sm" color="text-muted-foreground">
              {t('common:states.loading')}
            </Text>
          ) : isError ? (
            // Un échec de lecture ne se rend jamais comme « aucune mission ».
            <SearchEmptyState title={t('states.errorTitle')} description={t('states.errorDescription')} />
          ) : missions.length === 0 && isSourceFiltered ? (
            // ⚠️ « Aucune mission » sous un FILTRE serait le même mensonge que
            // le lien réparé ici, retourné : l'espace en a peut-être vingt,
            // ailleurs. Et la porte générique (« une mission naît d'un projet
            // signé ») enverrait réparer un pipe qui n'a rien à voir.
            <SearchEmptyState
              title={t('sourceFilter.emptyTitle')}
              description={t('sourceFilter.emptyDescription')}
              action={
                <Button type="button" size="sm" variant="outline" onClick={clearSourceFilter}>
                  {t('sourceFilter.emptyCta')}
                </Button>
              }
            />
          ) : missions.length === 0 && statusFilter.length === 0 ? (
            // Un onglet vide DIT pourquoi. « Aucune mission » au-dessus d'un
            // espace qui en compte trois, toutes terminées, se lit comme une
            // panne de lecture.
            // ⚠️ UN SEUL état vide, dans les deux cas — et c'est la recette
            // live du 27/08 qui l'a imposé. La version d'avant réservait la
            // porte au cas « aucune mission, jamais », en jugeant que la
            // question ne se posait pas quand des missions terminées
            // existent. Or le retour #1127 a été écrit dans CET état-là,
            // avec une mission terminée au compteur.
            //
            // #2407.5 — `statusFilter == null` EXCLUT le cas où c'est un
            // STATUT CHOISI qui vide la liste : ce n'est pas « aucune
            // mission », c'est « aucune sous ce statut-là », et ça tombe
            // dans la branche `narrowed` juste en dessous, qui le dit.
            <MissionsEmptyState finishedCount={finishedCount} />
          ) : visibleMissions.length === 0 && narrowed ? (
            // Un état vide QUI NOMME SON FILTRE (#1358, #1359). Sans lui, une
            // recherche sans résultat laisse un écran muet au-dessus de
            // pastilles qui comptent la liste entière — deux chiffres qui se
            // contredisent.
            <SearchEmptyState
              title={t('toolbar.filteredTitle')}
              description={t('toolbar.filteredDescription')}
              action={
                <Button type="button" size="sm" variant="outline" onClick={clearFilters}>
                  {t('toolbar.clearFilters')}
                </Button>
              }
            />
          ) : (
            <div data-theo-block="table">
              <MissionsTable
                missions={visibleMissions}
                columns={columns}
                onOpen={setSelected}
                openOnRowClick
                canReadFinance={data?.canReadFinance}
              />
            </div>
          )}

          {/* #2561/#2562 — les ventes de l'outil de gestion branché (Odoo),
                « déjà une mission » ou « Reprendre en mission ». Ne rend RIEN
                sans outil branché : on n'affiche pas ce qu'on n'a pas. */}
          <OdooSalesSection />
        </>
      </Box>

      {/* #4194 (L3) — le panneau latéral UNIQUE (ex-`MissionDetailSheet`). */}
      <RecordPanel
        target={selected ? { kind: 'mission', id: selected.id } : null}
        onClose={() => setSelected(undefined)}
        propertiesContent={selected ? <MissionPanelContent mission={selected} /> : undefined}
      />
    </CustomerPage>
  )
}
