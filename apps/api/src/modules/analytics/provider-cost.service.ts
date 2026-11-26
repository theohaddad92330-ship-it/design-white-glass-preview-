import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ProviderCostEntity } from '../../database/entities/provider-cost.entity'
import { getCorrelationId } from '../../correlation-id/correlation-id.store'
import {
  COST_SPIKE_BASELINE_DAYS,
  detectDailyCostSpike,
  type CostSpikeVerdict,
  type DailyCostPoint,
} from './cost-alert'

/**
 * #3717.7 / #3777 (DEC-4036 Q10) — longueur maximale d'un correlation-id écrit
 * sur une ligne de coût : la même que `provider_costs_correlation_id_check`
 * (migration `ProviderCostCorrelation`, vérifiée par sa spec). L'en-tête peut
 * venir d'un client : il est tronqué, jamais rejeté (une mesure ne casse rien).
 */
export const PROVIDER_COST_CORRELATION_MAX = 128

/** Une ligne du registre tel que le service IA le transmet (`x-bellum-costs`). */
type ProviderCostRow = {
  provider: string
  operation: string
  calls: number
  units: number
  /** `null` = fournisseur non tarifé sur cet environnement — jamais 0. */
  cost_usd: number | null
  // #2440.6/.7/.8/.9/.16/.19 — détail LLM (`cost_ledger.py`), ABSENT de la
  // ligne pour un fournisseur de données (Firecrawl, Apollo…) : jamais `null`
  // écrit par l'IA elle-même, seul `parseHeader`/`record` posent ce défaut.
  model?: string
  input_tokens?: number
  output_tokens?: number
  cache_read_tokens?: number
  cache_creation_tokens?: number
  /** Fait immuable de CET appel (« ok » aujourd'hui) — jamais un statut de cycle de vie. */
  status?: string
  /** La grille de prix qui a produit `cost_usd` — absente si non tarifé. */
  tariff_version?: string
  /** #2442.12 — l'outil de chat qui a consommé ; absent hors outil. */
  tool?: string
}

/**
 * #2442.12 (épopée #2879) — la forme d'un nom d'outil, celle qu'admet
 * `provider_costs_tool_check` (migration `ProviderCostTool`, même expression,
 * vérifiée par sa spec). Un nom hors forme n'est pas écrit : l'insertion en
 * lot le refuserait, et ferait perdre TOUT le tour.
 */
export const PROVIDER_COST_TOOL_PATTERN = /^[a-z][a-z0-9_]{0,63}$/

/** Ce à quoi se rattache une consommation : un run d'analyse, ou un geste isolé. */
type ProviderCostContext = {
  workspaceId: string | null
  userId: string | null
  accountId?: string | null
  runId?: string | null
  /** `analysis` | `enrichment` | `chat` | `need_play` | … — la fonctionnalité. */
  feature: string
}

/** Une ligne d'agrégat, telle que la lit le backoffice. */
/** #3861.R2 — les noms de coût du tour du copilote (`chat_orchestrator`), un par palier. */
const CHAT_TIER_OPERATIONS = ['bellum_chat', 'bellum_chat_fast', 'bellum_chat_deep'] as const

type ProviderCostAggregate = {
  key: string
  calls: number
  units: number
  /** Somme des lignes TARIFÉES uniquement. */
  cost_usd: number
  /** Combien de lignes n'ont pas de prix — affiché, jamais noyé dans le total. */
  untariffed: number
}

export type ProviderCostOverview = {
  days: number
  byProvider: ProviderCostAggregate[]
  byFeature: ProviderCostAggregate[]
  /**
   * Par OPÉRATION — c'est-à-dire par `prompt_name` pour les appels de modèle
   * (`bellum_facts`, `bellum_chat`, …) et par verbe pour les fournisseurs de
   * données (`scrape`, `search`, `request`).
   *
   * Pourquoi il manquait, et ce que ça coûtait : la colonne était écrite à
   * chaque appel et indexée, mais aucun agrégat ne la lisait. `byFeature`
   * répond « l'analyse coûte X », ce qui ne dit pas lequel de ses onze prompts
   * porte le X — donc aucune décision de routage de modèle n'était mesurable
   * autrement qu'en relisant des lignes de logs. Du calcul juste, persisté, que
   * personne n'appelait.
   */
  byOperation: ProviderCostAggregate[]
  /**
   * #2442.12 (épopée #2879) — par OUTIL de Laura : lequel des outils du chat
   * porte la facture. Seules les lignes d'un outil y entrent — une ligne hors
   * outil (génération du tour, analyse) n'y fait AUCUNE ligne, jamais un
   * « — » qui se lirait comme un outil. Coût FOURNISSEUR du produit (D19,
   * back-office), pas le coût d'accès d'un espace (GA-43) : la ventilation par
   * espace reste `byWorkspace`.
   */
  byTool: ProviderCostAggregate[]
  /**
   * #3861.R2 — par PALIER de raisonnement du copilote : `bellum_chat` (non routé),
   * `bellum_chat_fast`, `bellum_chat_deep` — les noms de coût du tour posés par
   * `chat_orchestrator`. Non borné au top 20 d'`byOperation`. Le coût seul : la
   * latence n'est pas persistée dans `provider_costs`, l'écran le DIT.
   */
  byTier: ProviderCostAggregate[]
  byWorkspace: ProviderCostAggregate[]
  topAccounts: ProviderCostAggregate[]
  total: ProviderCostAggregate
  /**
   * Le coût JOUR PAR JOUR, décomposé par fournisseur — l'axe que l'écran des
   * coûts (#1661) empile. Toutes les journées de la fenêtre y sont, y compris
   * celles sans aucune ligne : une journée absente de la série se lirait comme
   * une journée à zéro, ce qui est exactement le mensonge qu'on refuse.
   */
  byDay: ProviderCostDay[]
  /**
   * Combien de clés DISTINCTES existent réellement sur la fenêtre, par axe
   * borné. Sans ce compte, un écran qui affiche `byWorkspace` (borné aux
   * {@link TOP_ROWS} plus chers) le présenterait comme un TOTAL — et ce serait
   * faux dès le 21e espace. Le total honnête reste {@link ProviderCostOverview.total},
   * qui vient de `byProvider`, lui NON borné.
   */
  distinctKeys: ProviderCostDistinctKeys
  /** Le verdict de pic sur la dernière journée COMPLÈTE — voir {@link overview}. */
  costSpike: CostSpikeVerdict
}

/** Combien de clés distinctes chaque axe borné laisse hors de sa liste. */
type ProviderCostDistinctKeys = {
  operation: number
  workspace: number
  account: number
}

/** Ce que chaque journée de la fenêtre porte, en commun. */
type ProviderCostDayCommon = {
  /** Jour civil `YYYY-MM-DD` dans {@link CONSOLE_TIME_ZONE}. */
  day: string
  /** Lignes SANS prix ce jour-là — comptées, jamais absorbées comme des zéros. */
  untariffed: number
}

/**
 * Une journée de la série, en UNION plutôt qu'en `costUsd: number | null`.
 *
 * ⚠️ CE QUE LE TYPE PLAT COÛTERAIT : chaque lecteur écrirait `jour.costUsd ?? 0`
 * après avoir pourtant déjà écarté le cas non mesuré — deux occurrences de plus
 * au cliquet GA-19, pour un repli qui, le jour où l'ordre changerait, écrirait
 * « 0 $ dépensé » sur une journée dont le registre n'a rien vu. L'union retire
 * le MOYEN d'écrire ce zéro.
 *
 * ⚠️ Et « 0 $ » RESTE VRAI quand il est mesuré : une journée avec au moins une
 * ligne tarifée à 0,00 $ est `measured: true` avec `costUsd: 0`. On ne masque
 * pas un vrai zéro, on refuse d'en fabriquer un faux.
 */
type ProviderCostDay =
  | (ProviderCostDayCommon & { measured: true; costUsd: number; perProvider: Readonly<Record<string, number>> })
  | (ProviderCostDayCommon & { measured: false; costUsd: null; perProvider: Readonly<Record<string, never>> })

/** Fenêtre par défaut du backoffice — un mois de facturation. */
const DEFAULT_DAYS = 30
const MAX_DAYS = 365
const TOP_ROWS = 20

/**
 * Le fuseau dans lequel une JOURNÉE de coût est découpée.
 *
 * Même littéral et même geste que `admin-analyses.service.ts` : c'est une
 * constante de module, jamais une entrée d'appelant — la seule raison pour
 * laquelle son interpolation dans le SQL est sans risque. Découper en UTC
 * ferait basculer d'un jour toute la dépense faite entre minuit et 2 h à Paris,
 * et la médiane 7 jours du pic hériterait du décalage.
 */
const CONSOLE_TIME_ZONE = 'Europe/Paris'

/** Une ligne brute de la série quotidienne, telle que le driver pg la rend. */
type DailyRow = {
  day: string
  /** `null` sur la ligne « journée sans consommation » produite par le LEFT JOIN. */
  provider: string | null
  cost_usd: string | null
  priced: string
  untariffed: string
}

/** Les trois comptes de clés distinctes, en une seule ligne. */
type DistinctRow = { operations: string; workspaces: string; accounts: string }

/** Bornes défensives : l'en-tête vient d'un service, pas d'un client, mais une
 *  ligne aberrante ne doit pas polluer une table de facturation. */
const MAX_ROWS = 40
const MAX_NAME_CHARS = 60

/**
 * L'environnement du PROCESS qui écrit — jamais celui de l'appelant (Défaut B,
 * n6). Même convention que `health.controller.ts` / `admin-ops.service.ts` :
 * `SENTRY_ENVIRONMENT` posée sur les trois services depuis des mois, puis
 * `NODE_ENV`. On ne crée pas de troisième variable pour la même question.
 *
 * `'unknown'`, jamais `'production'`, quand rien n'est posé : un défaut
 * `'production'` gonflerait le coût de production chaque fois qu'un poste de
 * développement tourne sans variable — c'est le zéro silencieux, version
 * environnement.
 */
function currentEnvironment(): string {
  return process.env['SENTRY_ENVIRONMENT'] ?? process.env['NODE_ENV'] ?? 'unknown'
}

/**
 * Persiste ce que chaque FOURNISSEUR a coûté, action par action (D19).
 *
 * Pourquoi cette table existe : `analysis_runs.cost_eur` déclarait ~0,75 €/run
 * pendant que la facture Anthropic était sept fois plus élevée. La différence
 * partait dans tout ce qui n'est pas le pipeline (copilote, briefs, messages) et
 * dans les fournisseurs de données, que rien ne mesurait. Sans cette table, on
 * fixe les prix de vente à l'aveugle.
 *
 * Deux règles reprises du registre côté IA :
 *  - `cost_usd` peut être NULL (« non tarifé »), et ce n'est pas zéro ;
 *  - écrire une mesure ne doit jamais faire échouer le geste mesuré : toute
 *    erreur est logguée puis avalée.
 */
@Injectable()
export class ProviderCostService {
  private readonly logger = new Logger(ProviderCostService.name)

  constructor(
    @InjectRepository(ProviderCostEntity)
    private readonly costs: Repository<ProviderCostEntity>,
  ) {}

  /** Parse l'en-tête `x-bellum-costs`. Silencieux sur une valeur illisible. */
  parseHeader(value: string | null | undefined): ProviderCostRow[] {
    if (!value) return []
    try {
      return this.parseRows(JSON.parse(value))
    } catch {
      return []
    }
  }

  /**
   * #2442.12 — les lignes du registre, d'où qu'elles viennent : l'en-tête
   * `x-bellum-costs`, ou le `done` d'un tour de chat (`turn_costs`), dont
   * l'en-tête part VIDE parce qu'il est figé au premier octet du flux. Une
   * seule lecture pour les deux — silencieuse sur une valeur illisible.
   */
  parseRows(parsed: unknown): ProviderCostRow[] {
    if (!Array.isArray(parsed)) return []
    try {
      return parsed.slice(0, MAX_ROWS).flatMap(entry => {
        const row = entry as Partial<ProviderCostRow>
        if (typeof row.provider !== 'string' || typeof row.operation !== 'string') return []
        const parsedRow: ProviderCostRow = {
          provider: row.provider.slice(0, MAX_NAME_CHARS),
          operation: row.operation.slice(0, MAX_NAME_CHARS),
          calls: Number.isFinite(row.calls) ? Number(row.calls) : 0,
          units: Number.isFinite(row.units) ? Number(row.units) : 0,
          cost_usd: typeof row.cost_usd === 'number' && Number.isFinite(row.cost_usd) ? row.cost_usd : null,
        }
        // #2440.6/.7/.8/.9/.16/.19 — n'ajoute la clé QUE si l'IA l'a transmise :
        // une ligne Firecrawl/Apollo garde sa forme d'avant, byte pour byte.
        if (typeof row.model === 'string') parsedRow.model = row.model.slice(0, MAX_NAME_CHARS)
        if (Number.isFinite(row.input_tokens)) parsedRow.input_tokens = Number(row.input_tokens)
        if (Number.isFinite(row.output_tokens)) parsedRow.output_tokens = Number(row.output_tokens)
        if (Number.isFinite(row.cache_read_tokens)) parsedRow.cache_read_tokens = Number(row.cache_read_tokens)
        if (Number.isFinite(row.cache_creation_tokens))
          parsedRow.cache_creation_tokens = Number(row.cache_creation_tokens)
        if (typeof row.status === 'string') parsedRow.status = row.status.slice(0, MAX_NAME_CHARS)
        if (typeof row.tariff_version === 'string')
          parsedRow.tariff_version = row.tariff_version.slice(0, MAX_NAME_CHARS)
        if (typeof row.tool === 'string' && PROVIDER_COST_TOOL_PATTERN.test(row.tool)) parsedRow.tool = row.tool
        return [parsedRow]
      })
    } catch {
      return []
    }
  }

  /** Écrit les lignes du registre. Best-effort — jamais bloquant. */
  async record(rows: ProviderCostRow[], context: ProviderCostContext): Promise<void> {
    if (rows.length === 0) return
    const correlationId = getCorrelationId()?.trim().slice(0, PROVIDER_COST_CORRELATION_MAX) || null
    try {
      await this.costs.insert(
        rows.map(row => ({
          workspace_id: context.workspaceId,
          user_id: context.userId,
          account_id: context.accountId ?? null,
          run_id: context.runId ?? null,
          feature: context.feature.slice(0, MAX_NAME_CHARS),
          provider: row.provider,
          operation: row.operation,
          calls: row.calls,
          units: row.units,
          cost_usd: row.cost_usd === null ? null : String(row.cost_usd),
          environment: currentEnvironment(),
          // #2440.6/.7/.8/.9/.16/.19 — NULL, jamais un défaut inventé, pour
          // toute ligne qui n'a rien à en dire (fournisseur de données).
          model: row.model ?? null,
          input_tokens: row.input_tokens ?? null,
          output_tokens: row.output_tokens ?? null,
          cache_read_tokens: row.cache_read_tokens ?? null,
          cache_creation_tokens: row.cache_creation_tokens ?? null,
          status: row.status ?? null,
          tariff_version: row.tariff_version ?? null,
          // #2442.12 — NULL hors outil, jamais un outil deviné.
          tool: row.tool ?? null,
          // #3717.7 — le fil commun api ↔ ia : celui de la requête ou du job
          // (`runWithContext` du worker d'analyse), NULL hors contexte.
          correlation_id: correlationId,
        })),
      )
    } catch (error) {
      this.logger.warn('Provider cost not recorded', { error })
    }
  }
  /**
   * Ce que la période a coûté, vu sous quatre angles (D19 — « affiche tout
   * tout », côté backoffice UNIQUEMENT : un client n'a pas à voir la marge).
   *
   * Chaque agrégat sépare le **coût tarifé** du **nombre de lignes non
   * tarifées**. Un total qui absorberait les secondes comme des zéros
   * annoncerait une facture plus basse que la réalité — c'est exactement le
   * chiffre faux qu'on remplace.
   *
   * `environment` (Défaut B, n6) : filtre optionnel, par ÉGALITÉ STRICTE.
   * Omis, le total reste ce qu'il a toujours été — dev et prod additionnés.
   * Posé, c'est une alerte de coût quotidien qui ne veut mesurer QUE la
   * production qui l'utiliserait : `environment = $2` exclut naturellement
   * les lignes `NULL` (écrites avant cette colonne) — jamais un
   * `COALESCE(environment, 'production')`, qui leur ferait porter un coût
   * de production qu'elles n'ont pas.
   */
  async overview(days = DEFAULT_DAYS, environment?: string): Promise<ProviderCostOverview> {
    const window = Math.min(Math.max(1, Math.floor(days) || DEFAULT_DAYS), MAX_DAYS)
    const since = new Date(Date.now() - window * 24 * 60 * 60 * 1000)
    const envFilter = environment ? 'AND environment = $2' : ''
    const params = environment ? [since, environment] : [since]

    const group = async (
      column: string,
      limit?: number,
      onlyPresent = false,
      extraWhere = '',
    ): Promise<ProviderCostAggregate[]> => {
      const rows = await this.costs.manager.query<
        { key: string | null; calls: string; units: string; cost_usd: string | null; untariffed: string }[]
      >(
        `SELECT COALESCE(${column}::text, '—')            AS key,
                SUM(calls)::int                            AS calls,
                SUM(units)::float8                         AS units, -- #4452 — numeric : un ::int tronquerait les fractions
                COALESCE(SUM(cost_usd), 0)                 AS cost_usd,
                COUNT(*) FILTER (WHERE cost_usd IS NULL)::int AS untariffed
           FROM provider_costs
          WHERE created_at >= $1
          ${envFilter}
          ${onlyPresent ? `AND ${column} IS NOT NULL` : ''}
          ${extraWhere ? `AND ${extraWhere}` : ''}
          GROUP BY 1
          ORDER BY 4 DESC, 2 DESC
          ${limit ? `LIMIT ${limit}` : ''}`,
        params,
      )
      return rows.map(row => ({
        key: row.key ?? '—',
        calls: Number(row.calls) || 0,
        units: Number(row.units) || 0,
        cost_usd: Number(row.cost_usd) || 0,
        untariffed: Number(row.untariffed) || 0,
      }))
    }

    /**
     * La série JOUR × FOURNISSEUR, avec l'axe COMPLET.
     *
     * `generate_series` porte l'axe plutôt qu'une boucle TypeScript : les
     * journées et les lignes sont alors découpées par la MÊME horloge et le
     * MÊME fuseau. Une boucle côté Node lirait l'horloge du process (UTC sur
     * Railway) pendant que le SQL découpe à Paris — deux réponses à la même
     * question, qui se contrediraient une nuit sur deux.
     *
     * ⚠️ `LEFT JOIN` : une journée sans aucune ligne rend `provider IS NULL`,
     * `priced = 0` et `untariffed = 0` — elle EXISTE dans la série, et elle y
     * est NON MESURÉE. C'est ce qui distingue « rien dépensé » (indémontrable)
     * de « 0 $ dépensé » (mesuré).
     *
     * ⚠️ Aucune table n'est aliasée : `environment`, `created_at`, `cost_usd` et
     * `provider` sont donc non ambigus, et `envFilter` reste le MÊME littéral
     * que les autres requêtes de cette méthode — une seule forme de filtre
     * d'environnement dans tout le fichier.
     */
    const dailyRows = async (): Promise<DailyRow[]> =>
      this.costs.manager.query(
        `SELECT to_char(jour.day, 'YYYY-MM-DD')                                  AS day,
                provider                                                         AS provider,
                COALESCE(SUM(cost_usd), 0)                                       AS cost_usd,
                COUNT(provider_costs.id) FILTER (WHERE cost_usd IS NOT NULL)::int AS priced,
                COUNT(provider_costs.id) FILTER (WHERE cost_usd IS NULL)::int     AS untariffed
           FROM generate_series(
                  ($1 AT TIME ZONE '${CONSOLE_TIME_ZONE}')::date,
                  (now() AT TIME ZONE '${CONSOLE_TIME_ZONE}')::date,
                  interval '1 day') AS jour(day)
           LEFT JOIN provider_costs
                  ON (created_at AT TIME ZONE '${CONSOLE_TIME_ZONE}')::date = jour.day
                 AND created_at >= $1
                 ${envFilter}
          GROUP BY 1, 2
          ORDER BY 1`,
        params,
      )

    /**
     * Combien de clés distinctes chaque axe borné laisse DEHORS.
     *
     * ⚠️ `COALESCE(… , '—')` reproduit exactement le groupement de `group()` :
     * une consommation hors espace y forme un groupe à part entière, donc elle
     * compte pour une clé. Sans ce `COALESCE`, `COUNT(DISTINCT)` sauterait les
     * NULL et l'écran annoncerait un espace de moins qu'il n'en affiche.
     */
    const distinctRows = async (): Promise<DistinctRow[]> =>
      this.costs.manager.query(
        `SELECT COUNT(DISTINCT COALESCE(operation, '—'))::int          AS operations,
                COUNT(DISTINCT COALESCE(workspace_id::text, '—'))::int AS workspaces,
                COUNT(DISTINCT COALESCE(account_id::text, '—'))::int   AS accounts
           FROM provider_costs
          WHERE created_at >= $1
          ${envFilter}`,
        params,
      )

    const [byProvider, byFeature, byOperation, byTool, byTier, byWorkspace, topAccounts, daily, distinct] =
      await Promise.all([
        group('provider'),
        group('feature'),
        // Borné comme les espaces et les comptes : `operation` est un ensemble
        // fermé côté prompts (~30), mais les verbes fournisseurs s'y ajoutent et
        // rien ne garantit que la cardinalité reste petite. Le tri est par coût
        // décroissant, donc les 20 premières lignes SONT la réponse à « où part
        // l'argent ».
        group('operation', TOP_ROWS),
        // #2442.12 — borné comme `operation` : le catalogue d'outils grandit.
        group('tool', TOP_ROWS, true),
        // #3861.R2 — les trois noms de coût du tour du copilote (une liste fermée, donc non bornée).
        group('operation', undefined, false, `operation IN (${CHAT_TIER_OPERATIONS.map(op => `'${op}'`).join(', ')})`),
        group('workspace_id', TOP_ROWS),
        group('account_id', TOP_ROWS),
        dailyRows(),
        distinctRows(),
      ])

    const total = byProvider.reduce<ProviderCostAggregate>(
      (acc, row) => ({
        key: 'total',
        calls: acc.calls + row.calls,
        units: acc.units + row.units,
        cost_usd: acc.cost_usd + row.cost_usd,
        untariffed: acc.untariffed + row.untariffed,
      }),
      { key: 'total', calls: 0, units: 0, cost_usd: 0, untariffed: 0 },
    )

    const byDay = foldDays(daily)
    // Explicitement « peut-être absent » : une base sans aucune ligne sur la
    // fenêtre — ou un test qui ne simule pas cette requête — rend un tableau vide.
    const first: DistinctRow | undefined = distinct[0]

    return {
      days: window,
      byProvider,
      byFeature,
      byOperation,
      byTool,
      byTier,
      byWorkspace,
      topAccounts,
      total,
      byDay,
      distinctKeys: {
        operation: Number(first?.operations) || 0,
        workspace: Number(first?.workspaces) || 0,
        account: Number(first?.accounts) || 0,
      },
      costSpike: spikeOnLastCompleteDay(byDay),
    }
  }
}

/**
 * Replie les lignes `(jour, fournisseur)` en une journée par entrée.
 *
 * Une journée est MESURÉE dès qu'elle porte au moins une ligne TARIFÉE. Sans
 * ligne tarifée — aucune ligne du tout, ou uniquement des lignes sans prix — le
 * coût du jour reste `null` : ce n'est pas zéro, c'est inconnu, et l'écran
 * comme la médiane du pic doivent pouvoir faire la différence.
 */
function foldDays(rows: readonly DailyRow[]): ProviderCostDay[] {
  const byDay = new Map<string, { priced: number; untariffed: number; perProvider: Record<string, number> }>()

  for (const row of rows) {
    let entry = byDay.get(row.day)
    if (!entry) {
      entry = { priced: 0, untariffed: 0, perProvider: {} }
      byDay.set(row.day, entry)
    }
    entry.priced += Number(row.priced) || 0
    entry.untariffed += Number(row.untariffed) || 0
    // `provider` est NULL sur la ligne « journée sans consommation » que le
    // LEFT JOIN produit : elle porte l'existence du jour, jamais un coût.
    if (row.provider === null) continue
    const cost = Number(row.cost_usd) || 0
    if ((Number(row.priced) || 0) > 0) {
      entry.perProvider[row.provider] = (entry.perProvider[row.provider] ?? 0) + cost
    }
  }

  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([day, entry]): ProviderCostDay => {
      if (entry.priced === 0)
        return { day, measured: false, costUsd: null, perProvider: {}, untariffed: entry.untariffed }
      const perProvider = Object.fromEntries(
        Object.entries(entry.perProvider).map(([provider, cost]) => [provider, Math.round(cost * 10_000) / 10_000]),
      )
      const costUsd = Object.values(perProvider).reduce((sum, cost) => sum + cost, 0)
      return {
        day,
        measured: true,
        costUsd: Math.round(costUsd * 10_000) / 10_000,
        perProvider,
        untariffed: entry.untariffed,
      }
    })
}

/**
 * Le pic, évalué sur la dernière journée COMPLÈTE de la série.
 *
 * ⚠️ La journée EN COURS est retirée. Elle est incomplète par construction : la
 * comparer à une médiane de journées entières ne produirait que des faux
 * négatifs le matin, et la première alerte du jour arriverait au moment où elle
 * ne sert plus à rien. La série la garde pour l'écran ; le verdict ne la lit pas.
 */
function spikeOnLastCompleteDay(byDay: readonly ProviderCostDay[]): CostSpikeVerdict {
  const complete = byDay.slice(0, -1)
  const evaluated: ProviderCostDay | undefined = complete[complete.length - 1]
  if (!evaluated) {
    return { spike: false, reason: 'not_enough_days', observedDays: 0, requiredDays: COST_SPIKE_BASELINE_DAYS }
  }
  const history = complete.flatMap<DailyCostPoint>(day =>
    day.measured ? [{ day: day.day, costUsd: day.costUsd }] : [],
  )
  return detectDailyCostSpike(history, evaluated.day)
}
