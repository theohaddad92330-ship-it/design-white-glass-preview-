import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  LIVE_STAGES,
  FORECAST_DECLARED_BLOCKED_MISSION_STATUS,
  FORECAST_DECLARED_BLOCKED_RENEWAL_STATUS,
  FORECAST_RUNNING_MISSION_STATUSES,
  computeHorizonForecast,
  horizonWindow,
  invoiceReadinessQuerySchema,
  needStillOpenSql,
  poConsumption,
  poConsumptionAlert,
  projectStageInSql,
  weekdaysBetween,
  type ForecastHorizon,
  type ForecastItem,
  type HorizonForecast,
  type PoConsumptionOverview,
} from '@bellum/contracts'
import { MissionEntity } from '../../database/entities/mission.entity'
import { unsettledInvoiceSql } from '../../common/invoice-settlement'
import { InvoiceReadinessService } from './invoice-readiness.service'
import { MissionScoresService } from './mission-scores.service'

/**
 * #2425 — LE PRÉVISIONNEL PAR HORIZON, lu depuis ce qui est DÉJÀ persisté.
 *
 * Ce service ne calcule rien lui-même : il NORMALISE quatre lectures en lignes
 * (`ForecastItem`) et délègue tout — composantes, scénarios, déduplication,
 * décisions — au module pur `computeHorizonForecast` du contrat, testé seul.
 *
 * Il vit à côté de `MissionScoresService.forecast` (les trois lignes du
 * tableau de bord), sans le remplacer : celui-là répond « combien sur N mois,
 * au forfait de vingt jours », celui-ci « combien dans CET horizon, jour ouvré
 * par jour ouvré ». Les trois lignes existantes gardent leur contrat et leurs
 * lecteurs.
 *
 * ⚠️ PORTÉE : l'ÉQUIPE (`finance:read` seul), comme la capacité — la vue
 * manager est une vue d'équipe, et la moitié des lectures (capacité, besoins)
 * n'a pas de propriétaire commercial.
 */

type MissionRow = {
  id: string
  status: string
  renewal_status: string | null
  daily_rate: string | null
  started_on: string | null
  ends_on: string | null
  currency: string | null
}

type PipelineRow = {
  id: string
  estimated_amount: string | null
  currency: string | null
  expected_close_on: string | null
  mission_id: string | null
}

type AmendmentRow = {
  status: string
}

type InvoiceRow = {
  mission_id: string
  period_month: string
  invoiced_amount_cents: string | null
  paid_amount_cents: string | null
  due_on: string | null
  disputed_at: string | null
  dispute_resolved_at: string | null
  currency: string | null
}

/**
 * Les missions qui PRODUISENT : `FORECAST_RUNNING_MISSION_STATUSES` du contrat
 * (les statuts « en cours » moins `paused` — une mission suspendue ne facture
 * rien, et la chiffrer ferait un carnet plus gros que le vrai). Le même
 * littéral que lit la sonde de Laura (#2875), jamais recopié à la main.
 */
const FORECAST_RUNNING_STATUSES = FORECAST_RUNNING_MISSION_STATUSES

/** Un renouvellement DÉCLARÉ : un fait (signé, ou annoncé par le client), jamais une chance. */
const RENEWAL_DECLARED = new Set(['renouvele', 'reconduction_annoncee'])
/** Une suite déjà connue — rien à sécuriser. */
const RENEWAL_SETTLED = new Set(['renouvele', 'reconduction_annoncee', 'fin_confirmee', 'repositionnement_lance'])

/** #2783 — un avenant DÉCIDÉ (validé à l'écran) — `active` inclus : la mise
 *  en vigueur ne change pas la décision, seulement sa date d'effet. */
const AMENDMENT_ACCEPTED_STATUSES = new Set(['accepted', 'active'])
/** Encore `proposed` : NOMMÉ « simulé », jamais fondu avec un avenant décidé. */
const AMENDMENT_SIMULATED_STATUSES = new Set(['proposed'])

function day(value: string | Date | null): string | null {
  if (value === null) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function nextDay(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
}

function maxDay(left: string, right: string): string {
  return left > right ? left : right
}

function minDay(left: string, right: string): string {
  return left < right ? left : right
}

function cents(rate: string | null, days: number): number | null {
  if (rate === null) return null
  const value = Number(rate)
  return Number.isFinite(value) ? Math.round(value * 100 * days) : null
}

function currencyOf(value: string | null): string | null {
  return value && /^[A-Z]{3}$/.test(value) ? value : null
}

function baseItem(key: string, component: ForecastItem['component']): ForecastItem {
  return {
    key,
    component,
    amountCents: null,
    declaredAmountCents: null,
    currency: null,
    becameKey: null,
    declaredBlocked: false,
    renewalOpen: false,
  }
}

function previousMonth(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)
}

@Injectable()
export class ForecastHorizonsService {
  constructor(
    @InjectRepository(MissionEntity)
    private readonly missions: Repository<MissionEntity>,
    private readonly scores: MissionScoresService,
    private readonly readiness: InvoiceReadinessService,
  ) {}

  async compute(workspaceId: string, horizon: ForecastHorizon, now: Date = new Date()): Promise<HorizonForecast> {
    const { from, until } = horizonWindow(horizon, now)
    const query = <T>(sql: string, params: unknown[]) => this.missions.manager.query<T[]>(sql, params)

    const [missionRows, pipelineRows, invoiceRows, needsRows, prepared, capacity, amendmentRows] = await Promise.all([
      query<MissionRow>(
        `SELECT m.id, m.status, m.renewal_status, m.daily_rate, m.started_on, m.ends_on, t.currency
           FROM missions m
           LEFT JOIN mission_commercial_terms t ON t.mission_id = m.id
          WHERE m.workspace_id = $1
            AND m.status IN (${FORECAST_RUNNING_STATUSES.map(status => `'${status}'`).join(', ')})
            AND (m.ends_on IS NULL OR m.ends_on >= $2::date)`,
        [workspaceId, from],
      ),
      // Le pipe VIVANT, daté dans l'horizon — ou pas daté du tout : une
      // opportunité sans date n'est pas chiffrable ICI, et elle est comptée.
      // `mm` : la mission qu'elle est devenue, pour la déduplication (#2425.12).
      query<PipelineRow>(
        `SELECT o.id, o.estimated_amount, o.currency, o.expected_close_on, mm.id AS mission_id
           FROM opportunities o
           LEFT JOIN accounts acc ON acc.id = o.account_id
           LEFT JOIN missions mm ON mm.opportunity_id = o.id
          WHERE (o.workspace_id = $1 OR acc.workspace_id = $1)
            AND ${projectStageInSql('o.stage', LIVE_STAGES)}
            AND (o.expected_close_on IS NULL OR (o.expected_close_on >= $2::date AND o.expected_close_on < $3::date))`,
        [workspaceId, from, until],
      ),
      // Le facturé NON SOLDÉ — le prédicat partagé (#2419.4), jamais `paid_at IS NULL`.
      query<InvoiceRow>(
        `SELECT r.mission_id, r.period_month, r.invoiced_amount_cents, r.paid_amount_cents, r.due_on,
                r.disputed_at, r.dispute_resolved_at, t.currency
           FROM invoice_readiness r
           JOIN missions m ON m.id = r.mission_id
           LEFT JOIN mission_commercial_terms t ON t.mission_id = m.id
          WHERE m.workspace_id = $1
            AND r.invoiced_at IS NOT NULL
            AND ${unsettledInvoiceSql('r')}`,
        [workspaceId],
      ),
      query<{ open: string | null }>(
        `SELECT COALESCE(SUM(n.headcount), 0) AS open
           FROM project_needs n
          WHERE n.workspace_id = $1 AND ${needStillOpenSql('n.status')}
            AND (n.start_on IS NULL OR n.start_on < $2::date)`,
        [workspaceId, until],
      ),
      // La facture PRÉVUE : le mois qu'on facture maintenant, tel que la
      // préparation le chiffre déjà — prêt ou bloqué, jamais un mois facturé.
      this.readiness.list(
        workspaceId,
        invoiceReadinessQuerySchema.parse({ month: previousMonth(now) }),
        { canReadFinance: true },
        now,
      ),
      this.scores.capacity(workspaceId, from.slice(0, 7)),
      // #2783 — DONT AVENANTS : comptés, jamais chiffrés (`new_term` est un
      // JSON libre écrit par Laura, sans contrat de clé vérifiable — en
      // extraire un montant serait deviner). Rejetés/annulés exclus : ils ne
      // se sont jamais produits.
      query<AmendmentRow>(
        `SELECT status FROM mission_amendments
          WHERE workspace_id = $1
            AND effective_from >= $2::date AND effective_from < $3::date
            AND status IN ('proposed', 'accepted', 'active')`,
        [workspaceId, from, until],
      ),
    ])

    const items: ForecastItem[] = []
    const missionCurrency = new Map<string, string | null>()

    for (const row of missionRows) {
      const currency = currencyOf(row.currency)
      missionCurrency.set(row.id, currency)
      const endsOn = day(row.ends_on)
      const start = maxDay(from, day(row.started_on) ?? from)
      // Le carnet : jusqu'à la fin CONNUE. Sans date de fin, la mission n'est
      // pas prolongée d'office — elle est comptée, sans montant.
      const backlog = baseItem(`mission:${row.id}`, 'backlog')
      backlog.currency = currency
      backlog.amountCents =
        endsOn === null ? null : cents(row.daily_rate, weekdaysBetween(start, minDay(until, nextDay(endsOn))))
      // Le scénario bas retire ce qui est DÉCLARÉ en difficulté : un
      // renouvellement bloqué, ou une mission passée « à risque ».
      backlog.declaredBlocked =
        row.renewal_status === FORECAST_DECLARED_BLOCKED_RENEWAL_STATUS ||
        row.status === FORECAST_DECLARED_BLOCKED_MISSION_STATUS
      backlog.renewalOpen = endsOn !== null && endsOn < until && !RENEWAL_SETTLED.has(row.renewal_status ?? '')
      items.push(backlog)
      if (RENEWAL_DECLARED.has(row.renewal_status ?? '') && endsOn !== null) {
        // Le renouvellement : APRÈS la fin connue, jusqu'à la borne — la même
        // clé que le carnet, sur une tranche de jours qui ne le recouvre pas.
        //
        // ⚠️ Le statut de mission `renewed` n'est PAS lu : c'est un statut de
        // FIN (`FINISHED_MISSION_STATUSES`) — le contrat reconduit vit dans une
        // mission qui lui succède, déjà dans le carnet. Le compter ici le
        // compterait deux fois (#2425.12).
        const renewalStart = maxDay(from, nextDay(endsOn))
        if (renewalStart < until) {
          const renewal = baseItem(`mission:${row.id}`, 'renewal')
          renewal.currency = currency
          renewal.amountCents = cents(row.daily_rate, weekdaysBetween(renewalStart, until))
          items.push(renewal)
        }
      }
    }

    for (const row of pipelineRows) {
      const entry = baseItem(`opportunity:${row.id}`, 'pipeline')
      entry.currency = currencyOf(row.currency)
      entry.becameKey = row.mission_id ? `mission:${row.mission_id}` : null
      // Montant NOMINAL — jamais pondéré (c26). Non daté : pas chiffrable ici.
      entry.amountCents = row.expected_close_on === null ? null : cents(row.estimated_amount, 1)
      items.push(entry)
    }

    for (const row of invoiceRows) {
      const dueOn = day(row.due_on)
      const disputed = row.disputed_at !== null && row.dispute_resolved_at === null
      const component: ForecastItem['component'] | null = disputed
        ? 'disputed'
        : dueOn === null
          ? 'receivable'
          : dueOn < from
            ? 'overdue'
            : dueOn < until
              ? 'receivable'
              : null
      if (component === null) continue
      const entry = baseItem(`invoice:${row.mission_id}:${day(row.period_month)}`, component)
      entry.currency = currencyOf(row.currency)
      // Le RESTE DÛ se nomme (#2419.4) : facturé moins encaissé.
      const invoiced = row.invoiced_amount_cents === null ? null : Number(row.invoiced_amount_cents)
      const paid = row.paid_amount_cents === null ? 0 : Number(row.paid_amount_cents)
      // Une échéance inconnue ne se range dans aucun horizon : comptée, sans montant.
      entry.amountCents = invoiced === null || (component === 'receivable' && dueOn === null) ? null : invoiced - paid
      items.push(entry)
    }

    for (const row of prepared.items) {
      if (row.state !== 'ready' && row.state !== 'blocked') continue
      const entry = baseItem(`invoice:${row.missionId}:${day(row.periodMonth)}`, 'toInvoice')
      entry.currency = missionCurrency.get(row.missionId) ?? null
      entry.amountCents = row.preparedAmountCents
      items.push(entry)
    }

    const open = Number(needsRows[0]?.open ?? 0)
    return computeHorizonForecast({
      horizon,
      now,
      items,
      capacity: {
        reservedDays: capacity.committedDays,
        availableDays: capacity.availableDays,
        bench: capacity.capacityDays === null ? null : capacity.bench.onBench,
        uncoveredNeeds: Number.isFinite(open) ? open : null,
      },
      amendments: {
        accepted: amendmentRows.filter(row => AMENDMENT_ACCEPTED_STATUSES.has(row.status)).length,
        simulated: amendmentRows.filter(row => AMENDMENT_SIMULATED_STATUSES.has(row.status)).length,
      },
    })
  }

  /**
   * #2783 — LE VOLUME DE BONS DE COMMANDE, à l'échelle de l'ESPACE.
   *
   * `poConsumption`/`poConsumptionAlert` (contrats) ne se lisaient jusqu'ici
   * QUE par mission (`MissionMarginEngine.tsx`) : cette méthode les rejoue,
   * mission par mission, sur toutes les missions ACTIVES qui suivent un
   * volume (`mission_commercial_terms.po_volume_days IS NOT NULL`) — jamais
   * un second calcul, la même fonction pure que la fiche mission.
   *
   * Les avenants comptés sont ceux qui touchent CES MÊMES missions — jamais
   * tous les avenants de l'espace, qui répondraient à une question
   * différente (une extension de mission SANS bon de commande ne pèse sur
   * aucun volume à surveiller ici).
   */
  async poConsumptionOverview(workspaceId: string): Promise<PoConsumptionOverview> {
    const query = <T>(sql: string, params: unknown[]) => this.missions.manager.query<T[]>(sql, params)

    const poRows = await query<{
      mission_id: string
      po_volume_days: number | string | null
      consumed_days: string | null
    }>(
      `SELECT mct.mission_id,
              mct.po_volume_days,
              (SELECT SUM(mt.days) FROM mission_timesheets mt
                WHERE mt.mission_id = mct.mission_id AND mt.status NOT IN ('expected', 'missing', 'not_required')) AS consumed_days
         FROM mission_commercial_terms mct
         JOIN missions m ON m.id = mct.mission_id
        WHERE mct.workspace_id = $1
          AND mct.po_volume_days IS NOT NULL
          AND m.status IN (${FORECAST_RUNNING_STATUSES.map(status => `'${status}'`).join(', ')})`,
      [workspaceId],
    )

    const buckets = { ok: 0, approaching: 0, overrun: 0, unmeasured: 0 }
    for (const row of poRows) {
      const volumeDays = row.po_volume_days === null ? null : Number(row.po_volume_days)
      const consumedDays = row.consumed_days === null ? null : Number(row.consumed_days)
      const consumption = poConsumption(volumeDays, consumedDays)
      const alert = poConsumptionAlert({ volumeDays, consumption })
      buckets[alert] += 1
    }

    const missionIds = poRows.map(row => row.mission_id)
    const amendmentRows =
      missionIds.length === 0
        ? []
        : await query<AmendmentRow>(
            `SELECT status FROM mission_amendments
              WHERE workspace_id = $1 AND mission_id = ANY($2::uuid[])
                AND status IN ('proposed', 'accepted', 'active')`,
            [workspaceId, missionIds],
          )

    return {
      ...buckets,
      amendments: {
        accepted: amendmentRows.filter(row => AMENDMENT_ACCEPTED_STATUSES.has(row.status)).length,
        simulated: amendmentRows.filter(row => AMENDMENT_SIMULATED_STATUSES.has(row.status)).length,
      },
    }
  }
}
