import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  METRIC_SERIES_MAX_MONTHS,
  METRIC_SNAPSHOT_UNIT,
  STOCK_METRIC_KEYS,
  STOCK_METRIC_PROVENANCE,
  STOCK_METRIC_SOURCE,
  monthOf,
  monthsBackLastDay,
  openNeedsQuerySchema,
  previousMonthLastDay,
  type MetricPoint,
  type MetricSeriesResponse,
  type StockBaseline,
  type StockMetricKey,
  type StockMetricSource,
} from '@bellum/contracts'
import { StockSnapshotEntity } from '../../database/entities/stock-snapshot.entity'
import { DataHygieneService } from './data-hygiene.service'
import { PilotageService } from './pilotage.service'
import {
  INVOICE_READINESS_STOCK_SOURCE,
  OPEN_NEEDS_STOCK_SOURCE,
  TALENT_STOCK_SOURCE,
  TIMESHEET_STOCK_SOURCE,
  type InvoiceReadinessStockSource,
  type OpenNeedsStockSource,
  type TalentStockSource,
  type TimesheetStockSource,
} from './stock-sources'

/**
 * La photo mensuelle des indicateurs de STOCK (D2 · 26/08, D49 · 26/08).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELLE NE CALCULE RIEN
 * ─────────────────────────────────────────────────────────────────────────────
 * C'est sa propriété la plus importante, et elle est STRUCTURELLE : ce service
 * n'écrit pas une seule requête d'agrégat. Il appelle les deux dérivations que
 * les écrans appellent — `PilotageService.getChainForWorkspace` et
 * `DataHygieneService.overview` — et recopie ce qu'elles rendent.
 *
 * Écrire ici un `SELECT COUNT(*) … WHERE availability IN (…)` aurait été plus
 * court, et aurait produit le défaut le plus cher du dépôt : deux dérivations
 * pour une question. Le jour où le prédicat du vivier change d'un côté, la
 * photo continue de mesurer l'ancien, et la tendance affichée compare deux
 * définitions différentes — sans que rien ne rougisse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE N'ÉCRIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Une valeur NON LUE n'écrit aucune ligne. Les deux sources rendent déjà `null`
 * quand la requête a échoué (`PilotageMetric.value`, `HygieneLine.count`), et
 * c'est la seule chose à respecter : un `?? 0` ici figerait un faux zéro pour
 * toujours. Une photo ne se refait pas — le mois est passé.
 *
 * ⚠️ C'est pour cette raison que les dérivations à faux zéro du dépôt
 * (`dashboard-roi.service.ts:35-38`, `dashboard.service.ts:97-123`) n'alimentent
 * AUCUN des neuf indicateurs photographiés ici : toutes deux vivent dans le
 * module tableau de bord.
 *
 * La troisième que cette phrase nommait — `contribution.service.ts` — a été
 * CORRIGÉE le 29/08/2026 : son `catch` rend `null`, et les comptages qu'elle
 * sert sont de toute façon des flux datés, donc hors de la photo. Le nom d'un
 * défaut réparé laissé dans un commentaire envoie chercher ce qui n'existe plus.
 */
@Injectable()
export class StockSnapshotService {
  private readonly logger = new Logger(StockSnapshotService.name)

  constructor(
    @InjectRepository(StockSnapshotEntity)
    private readonly snapshots: Repository<StockSnapshotEntity>,
    private readonly pilotage: PilotageService,
    private readonly hygiene: DataHygieneService,
    // Les quatre dérivations qui vivent HORS de ce module, atteintes par un
    // PORT que ce module possède — voir `stock-sources.ts` pour la raison
    // complète. Ce service ne connaît le nom d'aucun service étranger.
    @Inject(OPEN_NEEDS_STOCK_SOURCE) private readonly openNeeds: OpenNeedsStockSource,
    @Inject(TIMESHEET_STOCK_SOURCE) private readonly timesheets: TimesheetStockSource,
    @Inject(INVOICE_READINESS_STOCK_SOURCE) private readonly readiness: InvoiceReadinessStockSource,
    @Inject(TALENT_STOCK_SOURCE) private readonly talents: TalentStockSource,
  ) {}

  /**
   * Photographie un espace, et rend le nombre de lignes RÉELLEMENT écrites.
   *
   * `ON CONFLICT DO NOTHING` : la première photo du mois gagne. Rejouer le
   * balayage — pour rattraper une panne, ou parce qu'un second replica a
   * démarré à la même seconde — ne crée pas un second point et ne réécrit pas
   * le premier. C'est l'index unique `(workspace_id, taken_on, metric_key)` qui
   * le tient, pas une intention.
   */
  async snapshotWorkspace(workspaceId: string, takenOn: string): Promise<number> {
    const values = await this.readStocks(workspaceId, takenOn)
    let written = 0
    for (const { key, value, denominator } of values) {
      const rows = (await this.snapshots.query(
        `INSERT INTO stock_snapshots (workspace_id, taken_on, metric_key, value, provenance, denominator)
         VALUES ($1, $2::date, $3, $4, $5, $6)
         ON CONFLICT (workspace_id, taken_on, metric_key) DO NOTHING
         RETURNING id`,
        [workspaceId, takenOn, key, value, STOCK_METRIC_PROVENANCE[key], denominator],
      )) as unknown[]
      if (Array.isArray(rows) && rows.length > 0) written += 1
    }
    return written
  }

  /**
   * Le balayage complet : chaque espace, une fois.
   *
   * Un espace en échec n'arrête pas les autres. Perdre une photo se voit dans
   * l'écran d'un seul client ; perdre le balayage laisserait TOUS les espaces
   * sans base de comparaison, et le trou est définitif.
   */
  async snapshotAllWorkspaces(now: Date = new Date()): Promise<{ workspaces: number; rows: number }> {
    const takenOn = previousMonthLastDay(now)
    const workspaces = await this.workspaceIds()
    let rows = 0
    for (const workspaceId of workspaces) {
      try {
        rows += await this.snapshotWorkspace(workspaceId, takenOn)
      } catch (error) {
        this.logger.error(`Photo mensuelle manquée pour l'espace ${workspaceId}`, { error })
      }
    }
    return { workspaces: workspaces.length, rows }
  }

  /**
   * #3415 — Le rattrapage de la photo du mois écoulé, les CATCH_UP_LAST_DAY premiers jours.
   *
   * Recette prod 02/10 : « aucune photo du mois de référence » sur un indicateur
   * pourtant photographié — le passage du 1er à 03:00 n'avait pas écrit sa clé
   * (déploiement, source muette à cette minute), et plus rien ne repassait. Le
   * balayage est idempotent PAR CLÉ (`ON CONFLICT DO NOTHING`) : le rejouer ne
   * complète que ce qui manque et ne réécrit jamais une photo posée.
   *
   * Borne à 5 jours, pas plus : la ligne est datée du dernier jour du mois écoulé
   * mais lit l'état COURANT. Le 2, c'est (presque) celui de fin de mois ; le 20
   * octobre, une « photo de fin septembre » mentirait — l'écran préfère dire
   * « aucune photo » (la doctrine du fichier). Hors fenêtre : `null`, rien lu.
   */
  async catchUpLastMonth(now: Date = new Date()): Promise<{ workspaces: number; rows: number } | null> {
    if (parisDayOfMonth(now) > CATCH_UP_LAST_DAY) return null
    return this.snapshotAllWorkspaces(now)
  }

  /**
   * La base de comparaison de l'écran : la photo du mois PRÉCÉDENT, et elle
   * seule.
   *
   * Aucun repli sur une photo plus ancienne. Servir celle d'il y a trois mois
   * sous le libellé « vs mois précédent » serait un chiffre juste sur une
   * question qu'on n'a pas posée — et personne ne pourrait le savoir en
   * regardant l'écran. Pas de photo ⇒ pas de pourcentage, et l'écran le DIT.
   */
  async baselineFor(workspaceId: string, source: 'chain' | 'hygiene', now: Date = new Date()): Promise<StockBaseline> {
    const takenOn = previousMonthLastDay(now)
    try {
      const rows = (await this.snapshots.query(
        `SELECT metric_key, value, denominator FROM stock_snapshots
          WHERE workspace_id = $1 AND taken_on = $2::date`,
        [workspaceId, takenOn],
      )) as Array<{ metric_key: string; value: number | string; denominator: number | string | null }>

      if (!Array.isArray(rows) || rows.length === 0) return EMPTY_BASELINE
      const values: Record<string, number> = {}
      const denominators: Record<string, number> = {}
      for (const row of rows) {
        const key = row.metric_key as StockMetricKey
        if (!(STOCK_METRIC_KEYS as readonly string[]).includes(key)) continue
        // Chaque réponse ne porte QUE la base des indicateurs qu'elle affiche.
        // Une tendance servie à côté d'un chiffre absent de l'écran est un
        // chiffre que personne ne peut vérifier.
        if (STOCK_METRIC_SOURCE[key] !== source) continue
        const parsed = Number(row.value)
        // Une valeur illisible n'entre pas : mieux vaut aucune comparaison
        // qu'une comparaison contre `NaN`, qui s'afficherait en pourcentage.
        if (Number.isFinite(parsed)) values[key] = parsed
        // ⚠️ `null` ne devient PAS `0` : une population non lue reste ABSENTE
        // de la table. `Number(null)` vaut `0`, d'où le test explicite — c'est
        // exactement l'étourderie que cette colonne existe pour éviter.
        if (row.denominator !== null && row.denominator !== undefined) {
          const total = Number(row.denominator)
          if (Number.isFinite(total)) denominators[key] = total
        }
      }
      return { month: monthOf(takenOn), takenOn, values, denominators }
    } catch (error) {
      // Une lecture en échec n'est PAS « aucune photo » — mais l'écran ne peut
      // rien dire d'autre, et il dira la même chose : pas de pourcentage. On le
      // journalise en `error` pour que la panne se voie, elle, quelque part.
      this.logger.error('Lecture de la base de comparaison en échec', { error })
      return EMPTY_BASELINE
    }
  }

  /**
   * La SÉRIE des photos d'un espace — une par mois, par indicateur.
   *
   * `baselineFor` ne sait servir qu'UN mois, le précédent. C'est assez pour
   * « vs mois dernier » et insuffisant pour tout le reste : « vs N-1 » demande
   * la photo d'il y a douze mois, et une courbe en demande douze. C'est la
   * lecture générique sur laquelle les écrans se branchent, et elle rend des
   * points bruts — la VARIATION se calcule par `metricDelta` (contrats), qui
   * vit à un seul endroit.
   *
   * ⚠️ Elle ne comble AUCUN trou. Un mois sans photo est un mois ABSENT de la
   * série, jamais un point à zéro : c'est ce qui permet à `metricDelta` de
   * répondre « non mesuré » plutôt que d'inventer une chute.
   *
   * @param months Nombre de mois à remonter, borné par `METRIC_SERIES_MAX_MONTHS`.
   */
  async seriesFor(workspaceId: string, months: number, now: Date = new Date()): Promise<MetricSeriesResponse> {
    // Une borne négative ou absurde ne lève pas : elle se ramène à 1 mois. Une
    // exception ici priverait l'écran de TOUTE lecture pour un paramètre mal
    // formé, alors qu'une série courte reste une réponse honnête.
    const window = Math.min(Math.max(Math.trunc(months) || 1, 1), METRIC_SERIES_MAX_MONTHS)
    const oldest = monthsBackLastDay(now, window)

    let rows: Array<{ metric_key: string; taken_on: string | Date; value: number | string; denominator: unknown }> = []
    try {
      rows = (await this.snapshots.query(
        `SELECT metric_key, taken_on, value, denominator FROM stock_snapshots
          WHERE workspace_id = $1 AND taken_on >= $2::date
          ORDER BY taken_on ASC`,
        [workspaceId, oldest],
      )) as typeof rows
    } catch (error) {
      // Comme `baselineFor` : une lecture en échec ne fabrique pas une série
      // vide silencieuse, mais l'écran n'a rien d'autre d'honnête à afficher.
      this.logger.error('Lecture de la série de photos en échec', { error })
      return { series: [], monthsCovered: 0 }
    }
    if (!Array.isArray(rows)) return { series: [], monthsCovered: 0 }

    const byKey = new Map<string, MetricPoint[]>()
    const months_ = new Set<string>()
    for (const row of rows) {
      const key = row.metric_key
      if (!(STOCK_METRIC_KEYS as readonly string[]).includes(key)) continue
      // `taken_on` remonte en `Date` ou en chaîne selon le pilote — on ne parie
      // pas, et on ne garde que le mois.
      const takenOn = row.taken_on instanceof Date ? row.taken_on.toISOString().slice(0, 10) : String(row.taken_on)
      const value = Number(row.value)
      if (!Number.isFinite(value)) continue
      const month = monthOf(takenOn)
      months_.add(month)
      // ⚠️ `Number(null)` vaut 0 : le test explicite est ce qui empêche une
      // population non lue de devenir une population vide.
      const raw = row.denominator
      const total = raw === null || raw === undefined ? null : Number(raw)
      const point: MetricPoint =
        total !== null && Number.isFinite(total) ? { month, value, denominator: total } : { month, value }
      const points = byKey.get(key)
      if (points) points.push(point)
      else byKey.set(key, [point])
    }

    return {
      series: [...byKey.entries()].map(([metricKey, points]) => ({
        metricKey,
        unit: METRIC_SNAPSHOT_UNIT[metricKey as StockMetricKey],
        points,
      })),
      monthsCovered: months_.size,
    }
  }

  /**
   * Une lecture de source qui NE FAIT TOMBER PERSONNE.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI L'ISOLEMENT EST DEVENU OBLIGATOIRE LE 31/08/2026
   * ─────────────────────────────────────────────────────────────────────────
   * Avec deux sources dans le même module, un `Promise.all` qui rejette perdait
   * la photo d'un espace — et le mois écoulé ne revient pas, la photo ne se
   * refait pas. C'était déjà cher. Avec SIX sources, dont quatre qui font des
   * jointures lourdes sur des tables d'un autre module, ce serait devenu la
   * règle : une seule requête lente ou en erreur effacerait les DOUZE autres
   * photos de cet espace, définitivement.
   *
   * La règle du dépôt tranche : **une métrique ne casse jamais ce qu'elle
   * mesure**. Une source en échec ne contribue AUCUNE clé — jamais un zéro — et
   * les autres passent. La panne, elle, se journalise : un trou dans la série se
   * lira « non mesuré » à l'écran, ce qui est juste, mais l'exploitant doit
   * pouvoir savoir POURQUOI.
   */
  private async fromSource<T>(source: StockMetricSource, read: () => Promise<T>): Promise<T | null> {
    try {
      return await read()
    } catch (error) {
      this.logger.error(`Photo mensuelle : la source « ${source} » n'a pas répondu`, {
        error,
        tags: { stockSnapshotSource: source },
      })
      return null
    }
  }

  /**
   * Les treize stocks, lus par les MÊMES dérivations que les écrans.
   *
   * Rend les couples `(clé, valeur)` réellement mesurés — les `null` sont
   * absents, pas mis à zéro.
   *
   * @param takenOn Le jour photographié. Il DATE les deux lectures mensuelles
   *   (relevés, préparation de facturation) : ces dérivations replient sur « le
   *   mois précédent » quand on ne leur dit rien, ce qui est juste le 1er à
   *   03:00 et FAUX pour un rattrapage lancé le 5 du mois suivant — la photo du
   *   28 février contiendrait alors les relevés de mars.
   */
  private async readStocks(
    workspaceId: string,
    takenOn: string,
  ): Promise<Array<{ key: StockMetricKey; value: number; denominator: number | null }>> {
    const month = monthOf(takenOn)
    const [chain, hygiene, needs, timesheets, readiness, talents] = await Promise.all([
      this.fromSource('chain', () => this.pilotage.getChainForWorkspace(workspaceId)),
      this.fromSource('hygiene', () => this.hygiene.overview(workspaceId)),
      // ⚠️ Le FILTRE est celui de l'écran (`openNeedsQuerySchema` sans critère =
      // « seulement ce qui est ouvert »), et c'est lui qui décide des compteurs.
      // `limit: 1` ne touche que la PAGE : les deux compteurs sortent de clones
      // du même `QueryBuilder`, jamais de la page rendue. Charger cinquante
      // lignes par espace et par mois pour n'en lire aucune serait du travail
      // payé pour rien.
      this.fromSource('needs', () => this.openNeeds.list(workspaceId, openNeedsQuerySchema.parse({ limit: 1 }))),
      this.fromSource('timesheets', () => this.timesheets.month(workspaceId, { month })),
      // `canReadFinance: false` : la photo ne lit que des COMPTES. Le droit
      // financier n'a pas à voyager jusqu'ici — le port ne déclare aucun montant.
      // `blockedOnly: false` : la photo veut le MOIS ENTIER — c'est ce qui rend
      // la somme des quatre états utilisable comme population.
      this.fromSource('readiness', () =>
        this.readiness.list(workspaceId, { month, blockedOnly: false }, { canReadFinance: false }),
      ),
      this.fromSource('talents', () => this.talents.stats(workspaceId)),
    ])

    /** Ce que chaque source a rendu, clé par clé. Une clé ABSENTE de la table
     *  veut dire « sa source n'a pas répondu » ; une valeur `null`, « la source
     *  a répondu qu'elle ne savait pas ». Les deux n'écrivent rien, et c'est la
     *  seule chose qu'elles ont en commun. */
    const readings = new Map<string, { value: number | null; denominator: number | null }>()
    const answered = new Set<StockMetricSource>()

    if (chain) {
      answered.add('chain')
      for (const metric of chain.levels.flatMap(level => level.metrics)) {
        // ⚠️ Les deux stocks de la chaîne n'ont AUCUNE population :
        // `gatherInputs` rend des dénombrements nus. En inventer une ici serait
        // une seconde définition de l'effectif — voir `METRIC_SNAPSHOT_DENOMINATOR`.
        readings.set(metric.key, { value: metric.value, denominator: null })
      }
    }
    if (hygiene) {
      answered.add('hygiene')
      for (const line of hygiene.lines) {
        // La POPULATION de chaque ligne — `total`, calculé par le MÊME `SELECT`
        // que `count` et jusqu'ici jeté. Le lire ne coûte aucune requête, et le
        // recalculer aurait été la seconde dérivation que GA-26 refuse.
        readings.set(line.key as string, { value: line.count, denominator: line.total ?? null })
      }
    }
    if (needs) {
      answered.add('needs')
      readings.set('needs_without_positioning', {
        value: needs.counters.withoutShortlist,
        denominator: needs.counters.total,
      })
    }
    if (timesheets) {
      answered.add('timesheets')
      readings.set('timesheets_to_validate', {
        value: timesheets.summary.submitted,
        denominator: timesheets.summary.total,
      })
    }
    if (readiness) {
      answered.add('readiness')
      const { ready, blocked, invoiced, notDue } = readiness.summary
      readings.set('invoices_ready', {
        value: ready,
        // Les quatre états PARTITIONNENT la population : chaque état a sa
        // branche NOMMÉE dans `summarizeReadiness`, sans `else` fourre-tout. La
        // somme est donc la population, par construction — et non par
        // coïncidence, ce qui est la différence entre lire et deviner.
        denominator: ready + blocked + invoiced + notDue,
      })
    }
    if (talents) {
      answered.add('talents')
      readings.set('talents_available', { value: talents.availableNow, denominator: talents.total })
    }

    const out: Array<{ key: StockMetricKey; value: number; denominator: number | null }> = []
    for (const key of STOCK_METRIC_KEYS) {
      const reading = readings.get(key)
      if (reading === undefined) {
        // Sa source n'a pas répondu : déjà journalisé une fois, en tant que
        // panne. Le redire par clé ferait quatre lignes pour un incident.
        if (!answered.has(STOCK_METRIC_SOURCE[key])) continue
        // La source a répondu SANS cette clé : c'est un renommage, donc un BUG,
        // et il se journalise — sans lui, la tendance s'éteint en silence.
        this.logger.error(`Photo impossible : ${key} n'existe plus dans sa dérivation`, {
          tags: { stockSnapshot: key },
        })
        continue
      }
      const { value, denominator } = reading
      if (value === null || !Number.isFinite(value)) continue
      out.push({
        key,
        value,
        // ⚠️ Une population illisible reste ABSENTE. `Number(null)` vaut 0, et
        // un `0` ici dirait « mesuré sur une population vide » — le contraire de
        // « on n'a pas lu la population ».
        denominator: typeof denominator === 'number' && Number.isFinite(denominator) ? denominator : null,
      })
    }
    return out
  }

  /** Les espaces à photographier — tous, une seule fois chacun. */
  private async workspaceIds(): Promise<string[]> {
    const rows = (await this.snapshots.manager.query(`SELECT id FROM workspaces ORDER BY id`)) as Array<{ id: string }>
    return Array.isArray(rows) ? rows.map(row => row.id) : []
  }
}

/** #3415 — dernier jour du mois (heure de Paris) où le rattrapage de la photo précédente reste fidèle. */
const CATCH_UP_LAST_DAY = 5

/** Le quantième à Paris : le balayage est cadencé en `Europe/Paris`, pas en UTC. */
function parisDayOfMonth(now: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', day: 'numeric' }).format(now))
}

/** Aucune photo. `month` à `null` est ce que l'écran lit pour ne rien affirmer. */
const EMPTY_BASELINE: StockBaseline = { month: null, takenOn: null, values: {} }
