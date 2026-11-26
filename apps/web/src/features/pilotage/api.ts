import type {
  ContractedForecastMargin,
  DataHygiene,
  FinanceMarginTarget,
  FinanceScopeInfo,
  Forecast,
  ForecastHorizon,
  HorizonForecast,
  LegalEntity,
  Measurability,
  MetricSeriesResponse,
  MonthObjective,
  PilotageReport,
  PipelinePeriod,
  PipelineReport,
  PoConsumptionOverview,
  RevenueBreakdown,
  Ritual,
  RitualActionsCreated,
  RitualEffectivenessReport,
  RitualLastHeld,
  RitualPreference,
  SetFinanceMarginTargetInput,
  SetRitualPreferenceInput,
  WeekDelta,
} from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { displayedLevels } from './view/chain-layout'

/** KPI de chaîne p24 — lecture pure, workspace-scopée. */
export const pilotageApi = {
  chain(): Promise<PilotageReport> {
    // Qualité est retirée par la refonte du 14/10 : le contrat la sert encore, aucun écran (carte,
    // accroche, couverture) ne la compte — filtrée ici, à la source commune des deux lectures.
    return apiFetch<PilotageReport>({ path: '/pilotage/chain', timeoutMs: 30_000 }).then(report => ({
      ...report,
      levels: displayedLevels(report.levels),
    }))
  },

  /** Cockpit — ce qui a bougé sur 7 jours glissants (sommes non pondérées). */
  weekDelta(): Promise<WeekDelta> {
    return apiFetch<WeekDelta>({ path: '/pilotage/week-delta' })
  },

  /** Cockpit — objectif / réalisé / couverture du mois en cours. */
  monthObjective(): Promise<MonthObjective> {
    return apiFetch<MonthObjective>({ path: '/pilotage/month-objective' })
  },

  /** Le pipeline du CRM connecté. L'API sert son cache et le relit quand il a
   *  plus d'un jour ; l'écran n'a donc pas à décider quand rafraîchir. */
  pipeline(period: PipelinePeriod): Promise<PipelineReport> {
    return apiFetch<PipelineReport>({ path: `/crm/pipeline/report?period=${period}` })
  },

  /** Huit listes de TRAVAIL, chacune avec l'écran qui la montre. */
  hygiene(): Promise<DataHygiene> {
    return apiFetch<DataHygiene>({ path: '/pilotage/hygiene' })
  },

  /** Les cinq rituels et leur ordre du jour. Aucune séance, aucun chronomètre :
   *  ce qui rend le système transmissible est l'ordre du jour, pas la minuterie.
   *  `preferences` : les rituels que l'espace a choisi de masquer (#3271.10) —
   *  toujours les cinq dans `items`, jamais filtré (« on archive, on ne
   *  supprime pas »). `effectiveness` (#3298) : un rituel monthly/quarterly
   *  dont aucun indicateur observé n'a bougé récemment — absent pour tout
   *  rituel daily/weekly/rank1 (granularité insuffisante), jamais un verdict
   *  deviné. `lastHeld` (#3298) : la marque de dernière tenue, absente tant
   *  qu'aucun geste n'a été posé. */
  rituals(): Promise<{
    items: Ritual[]
    preferences: RitualPreference[]
    effectiveness: RitualEffectivenessReport[]
    lastHeld: RitualLastHeld[]
    actionsCreated: RitualActionsCreated[]
  }> {
    return apiFetch<{
      items: Ritual[]
      preferences: RitualPreference[]
      effectiveness: RitualEffectivenessReport[]
      lastHeld: RitualLastHeld[]
      actionsCreated: RitualActionsCreated[]
    }>({ path: '/pilotage/rituals' })
  },

  /** #3271.10, .12 — masquer, ou réafficher, un rituel pour tout l'espace. */
  setRitualPreference(ritualKey: string, input: SetRitualPreferenceInput): Promise<RitualPreference> {
    return apiFetch<RitualPreference, SetRitualPreferenceInput>({
      path: `/pilotage/rituals/${ritualKey}/preference`,
      method: 'PUT',
      body: input,
    })
  },

  /** #3298 (suite #3271.8) — marquer un rituel comme tenu aujourd'hui : un
   *  geste, une date — jamais une note ni un ordre du jour tenu. */
  markRitualHeld(ritualKey: string): Promise<RitualLastHeld> {
    return apiFetch<RitualLastHeld>({ path: `/pilotage/rituals/${ritualKey}/held`, method: 'PUT' })
  },

  /**
   * La SÉRIE des photos mensuelles — l'historique daté des indicateurs de stock.
   *
   * `seriesFor` existait depuis le 31/08 et n'avait **aucun appelant** : le lot
   * qui l'a livrée ne pouvait pas toucher aux écrans. C'est ce chemin-là qui
   * manquait, et la variation elle-même se calcule par `metricDelta` — jamais
   * ici, jamais dans un composant : la dérivation vit à un seul endroit.
   */
  metricSeries(months = 12): Promise<MetricSeriesResponse> {
    // #3483.1 — une lecture qui ne répond jamais laissait « Chargement des
    // indicateurs… » à l'écran pour toujours : au-delà du délai, la requête
    // échoue et le bloc dit « indisponible » plutôt que de rester figé.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), METRIC_SERIES_TIMEOUT_MS)
    return apiFetch<MetricSeriesResponse>({
      path: `/pilotage/metric-series?months=${months}`,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer))
  },

  /** L'objectif de marge du mois — `targetPercent: null` = aucun objectif saisi. */
  financeTarget(month: string): Promise<FinanceMarginTarget> {
    return apiFetch<FinanceMarginTarget>({ path: `/pilotage/finance-target?month=${month}` })
  },

  setFinanceTarget(input: SetFinanceMarginTargetInput): Promise<FinanceMarginTarget> {
    return apiFetch<FinanceMarginTarget, SetFinanceMarginTargetInput>({
      path: '/pilotage/finance-target',
      method: 'PUT',
      body: input,
    })
  },

  /**
   * Les sociétés de l'ESN.
   *
   * ⚠️ `GET /legal-entities` existait depuis des semaines **sans aucun appelant
   * côté web** — le défaut n°1 du dépôt. Il en a un maintenant, et un seul
   * usage : NOMMER les sociétés dans le sélecteur de portée du tableau de bord
   * Finance. Le sélecteur est désactivé (voir `FinanceEntityFilter`), parce
   * qu'aucune des six lectures financières ne prend de société en paramètre —
   * mais lire la liste dit à l'utilisateur ce qui EXISTE, ce qui est déjà plus
   * que le silence d'avant.
   */
  legalEntities(): Promise<{ items: LegalEntity[] }> {
    return apiFetch<{ items: LegalEntity[] }>({ path: '/legal-entities' })
  },
}

/** Délai d'une lecture de la série mensuelle avant de la déclarer indisponible. */
const METRIC_SERIES_TIMEOUT_MS = 15_000

/** Les clés de cache de ce module — écrites UNE fois, jamais recopiées à la main. */
export const pilotageKeys = {
  metricSeries: (months: number) => ['pilotage', 'metric-series', months] as const,
  financeTarget: (month: string) => ['pilotage', 'finance-target', month] as const,
  legalEntities: () => ['pilotage', 'legal-entities'] as const,
}

export function useMetricSeries(months = 12) {
  return useQuery({
    queryKey: pilotageKeys.metricSeries(months),
    queryFn: () => pilotageApi.metricSeries(months),
  })
}

export function useFinanceTarget(month: string) {
  return useQuery({
    queryKey: pilotageKeys.financeTarget(month),
    queryFn: () => pilotageApi.financeTarget(month),
    enabled: Boolean(month),
  })
}

/**
 * La saisie de l'objectif.
 *
 * N'invalide QUE le mois touché : un objectif est daté, et repartir chercher
 * les onze autres mois pour un chiffre qui n'a pas bougé serait onze requêtes
 * pour rien.
 */
export function useSetFinanceTarget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SetFinanceMarginTargetInput) => pilotageApi.setFinanceTarget(input),
    onSuccess: saved => {
      qc.setQueryData(pilotageKeys.financeTarget(saved.month), saved)
    },
  })
}

export function useLegalEntities() {
  return useQuery({
    queryKey: pilotageKeys.legalEntities(),
    queryFn: () => pilotageApi.legalEntities(),
  })
}

/* ── Les lectures financières QUI ACCEPTENT UNE SOCIÉTÉ ─────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE COUCHE EXISTE ICI, ET PAS DANS `features/missions/api.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 * Les six lectures financières ont leurs `use*` historiques dans
 * `features/missions/api.ts`, écrits quand aucune d'elles ne prenait de société.
 * Le tableau de bord Finance en prend une désormais, et les quatre lectures qui
 * savent la recevoir ont donc besoin d'une clé de cache qui la PORTE — sans
 * quoi choisir une société servirait le cache de « toutes les sociétés », ce
 * qui est exactement le défaut « un filtre qui ne filtre pas » qu'on répare.
 *
 * ⚠️ Deux couches pour les mêmes routes, et il faut le dire plutôt que le taire :
 * le lot n'a pas le droit d'écrire dans `features/missions/**` (onze agents y
 * travaillent en parallèle). La conséquence est BORNÉE et connue : les clés
 * d'ici vivent sous `['pilotage','finance',…]`, celles de là-bas sous
 * `['missions',…]` — aucune collision silencieuse n'est possible, et le seul
 * coût réel est que le cockpit `/pilotage` et l'écran `/pilotage/finance`
 * partagent leurs requêtes entre eux mais plus avec « Mon chiffre d'affaires »
 * du briefing, qui demande de toute façon une AUTRE portée (`?scope=own`).
 * Fondre les deux couches est un lot à lui seul, et il commence par déplacer
 * `financeApi` dans un module partagé.
 *
 * ⚠️ Les DEUX lectures aveugles à la société (capacité, délai de paiement)
 * n'ont volontairement PAS de jumelle ici : elles continuent d'utiliser
 * `useCapacity` / `useDso`. Leur en écrire une aurait laissé croire qu'elles
 * savent recevoir une société — et le registre `FINANCE_ENTITY_BLIND_READS`
 * dit qu'elles ne le savent pas.
 */

/** Le serveur dit sur quel PÉRIMÈTRE il a compté — jamais déduit à l'écran. */
type Scoped<T> = T & { scope?: FinanceScopeInfo }

/** La marge d'espace, telle que `GET /delivery/finance/margin` la rend. */
type DashboardMargin = {
  marginPercent: number | null
  measured: number
  unmeasured: number
  measurability?: Measurability
  threshold: number | null
  alerts: Array<{ missionId: string; label: string | null; margin: number }>
}

/** La marge par canal, telle que `GET /delivery/finance/margin-by-channel` la rend. */
type DashboardChannels = {
  periodMonth: string
  byChannel: Array<{ channel: string; marginPercent: number | null; missions: number; unmeasured: number }>
  intermediationCost: number | null
}

/** Le prévisionnel ET la marge de sa part contractualisée, servies ensemble. */
type DashboardForecast = Forecast & { contractedMargin?: ContractedForecastMargin }

/**
 * Une requête financière du tableau de bord.
 *
 * Un seul endroit fabrique l'URL : quatre routes acceptent `?entity`, et quatre
 * appelants qui la recopieraient à la main sont la façon dont le paramètre finit
 * par manquer sur le troisième — le défaut que `scopedPath` évitait déjà pour
 * `?scope`. Une société ABSENTE ne pose pas le paramètre du tout : « toutes les
 * sociétés » n'est pas une valeur, c'est le défaut.
 */
function dashboardPath(route: string, params: { month?: string; entity?: string | null }): string {
  const query = new URLSearchParams()
  if (params.month) query.set('month', params.month)
  if (params.entity) query.set('entity', params.entity)
  const search = query.toString()
  return search ? `${route}?${search}` : route
}

export const financeDashboardApi = {
  revenue(month?: string, entity?: string | null): Promise<Scoped<RevenueBreakdown>> {
    return apiFetch<Scoped<RevenueBreakdown>>({ path: dashboardPath('/delivery/finance/revenue', { month, entity }) })
  },
  margin(month?: string, entity?: string | null): Promise<Scoped<DashboardMargin>> {
    return apiFetch<Scoped<DashboardMargin>>({ path: dashboardPath('/delivery/finance/margin', { month, entity }) })
  },
  marginByChannel(month?: string, entity?: string | null): Promise<DashboardChannels> {
    return apiFetch<DashboardChannels>({
      path: dashboardPath('/delivery/finance/margin-by-channel', { month, entity }),
    })
  },
  /** Le prévisionnel n'a PAS de mois : il porte un horizon, pas une période. */
  forecast(entity?: string | null): Promise<Scoped<DashboardForecast>> {
    return apiFetch<Scoped<DashboardForecast>>({ path: dashboardPath('/delivery/finance/forecast', { entity }) })
  },
}

/**
 * Les clés portent la SOCIÉTÉ, et c'est tout l'objet de cette couche.
 *
 * `null` plutôt que `undefined` dans la clé : deux formes pour « toutes les
 * sociétés » produiraient deux entrées de cache pour la même réponse — la
 * moitié des requêtes servies deux fois, sans que rien ne le montre.
 */
export const financeDashboardKeys = {
  revenue: (month: string | undefined, entity: string | null) =>
    ['pilotage', 'finance', 'revenue', month ?? null, entity] as const,
  margin: (month: string | undefined, entity: string | null) =>
    ['pilotage', 'finance', 'margin', month ?? null, entity] as const,
  channels: (month: string | undefined, entity: string | null) =>
    ['pilotage', 'finance', 'channels', month ?? null, entity] as const,
  forecast: (entity: string | null) => ['pilotage', 'finance', 'forecast', entity] as const,
}

export function useDashboardRevenue(month?: string, entity: string | null = null) {
  return useQuery({
    queryKey: financeDashboardKeys.revenue(month, entity),
    queryFn: () => financeDashboardApi.revenue(month, entity),
    staleTime: 0,
  })
}

/** `retry: false` : sans `finance:read` le serveur répond 403, et rejouer trois
 *  fois ne fait que retarder l'affichage de « réservé aux responsables ». */
export function useDashboardMargin(month?: string, entity: string | null = null) {
  return useQuery({
    queryKey: financeDashboardKeys.margin(month, entity),
    queryFn: () => financeDashboardApi.margin(month, entity),
    retry: false,
  })
}

export function useDashboardChannels(month?: string, entity: string | null = null) {
  return useQuery({
    queryKey: financeDashboardKeys.channels(month, entity),
    queryFn: () => financeDashboardApi.marginByChannel(month, entity),
    retry: false,
  })
}

export function useDashboardForecast(entity: string | null = null) {
  return useQuery({
    queryKey: financeDashboardKeys.forecast(entity),
    queryFn: () => financeDashboardApi.forecast(entity),
    staleTime: 0,
  })
}

/**
 * #2425 — le prévisionnel par HORIZON (semaine, mois, trimestre, semestre).
 * Vue d'équipe sous `finance:read`, comme la capacité : ni société ni portée
 * personnelle dans la clé, la route n'en lit pas.
 */
/**
 * ⚠️ `enabled` (#2408.64/.65) — `/pilotage/finance` sait déjà, en y arrivant,
 * qu'il porte `finance:read` (l'écran est gardé en amont) : il n'a jamais eu
 * besoin de ce paramètre. Le cockpit missions (`MissionCockpitKpiTiles.tsx`)
 * sert un public plus large — commercial, ADV — dont une partie n'a PAS ce
 * droit ; y appeler la route sans lui produirait un 403 pour rien. Défaut
 * `true` : aucun appelant existant ne change de comportement.
 */
export function useForecastHorizons(horizon: ForecastHorizon, enabled = true) {
  return useQuery({
    queryKey: ['finance-dashboard', 'forecast-horizons', horizon] as const,
    queryFn: () =>
      apiFetch<HorizonForecast>({ path: `/delivery/finance/forecast/horizons?horizon=${encodeURIComponent(horizon)}` }),
    retry: false,
    enabled,
  })
}

/**
 * #2783 — le volume de bons de commande à l'échelle de l'espace, croisé aux
 * avenants qui touchent les mêmes missions. Vue d'équipe sous `finance:read`
 * seul, même raison que `useForecastHorizons` juste au-dessus.
 */
export function usePoConsumptionOverview() {
  return useQuery({
    queryKey: ['finance-dashboard', 'po-overview'] as const,
    queryFn: () => apiFetch<PoConsumptionOverview>({ path: '/delivery/finance/po-overview' }),
    retry: false,
  })
}
