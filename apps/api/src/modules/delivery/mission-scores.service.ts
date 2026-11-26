import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  LIVE_STAGES,
  MEASURABILITY_THRESHOLDS,
  RENEWAL_IMMINENT_DAYS,
  RENEWAL_J30_DAYS,
  RENEWAL_J60_DAYS,
  aggregateMargin,
  computeCapacity,
  expectedWorkingDaysInWindow,
  financeScopeClause,
  legalEntityClause,
  marginPercent,
  measurability,
  projectStageInSql,
  scoreFromAxes,
  type CapacityForecast,
  type ContractedForecastMargin,
  type FinanceScope,
  type Forecast,
  type ForecastLine,
  type MissionScore,
} from '@bellum/contracts'
import { MissionEntity } from '../../database/entities/mission.entity'
// Même dossier (`./`) : `loadedCostCents` est le seul lecteur du `bigint` de
// `mission_commercial_terms`, et la recopier ici en ferait une seconde lecture
// de la chaîne vide — le cas qui vaut « 100 % de marge ».
import { loadedCostCents } from './revenue.service'
import { unsettledInvoiceSql } from '../../common/invoice-settlement'
import { ShortTtlCache } from '../../common/short-ttl-cache'

/** Les stades ENCORE EN JEU, en littéraux SQL. Les valeurs viennent de
 *  l'énumération du contrat, jamais d'une saisie — aucune interpolation
 *  d'entrée utilisateur ici. */

/**
 * LES DEUX POPULATIONS CONTRACTUALISÉES DU PRÉVISIONNEL, écrites une seule fois.
 *
 * ⚠️ Elles sont lues par DEUX requêtes : la ligne de CHIFFRE (`forecast`) et la
 * MARGE de cette même ligne (`contractedMargin`). Les recopier en ferait deux
 * définitions de « acquis » — et le jour où l'une bougerait, la marge affichée
 * porterait sur une autre population que le montant affiché juste à côté, sans
 * que rien ne rougisse. Une dérivation vit à un seul endroit (GA-26).
 *
 * `$1` est l'espace, `$2` la borne d'horizon — le même ordre de paramètres dans
 * les deux requêtes, ce qui est justement ce que ce partage impose.
 */
const SECURED_PREDICATE = `m.workspace_id = $1 AND m.status IN ('active', 'onboarding')
            AND m.ends_on IS NOT NULL AND m.ends_on >= now()::date AND m.ends_on < $2::date`

/** PROBABLE — les renouvellements engagés : un geste a eu lieu. `$1` seul. */
const LIKELY_PREDICATE = `m.workspace_id = $1 AND m.status = 'renewed'`

type ScoreRow = {
  id: string
  label: string | null
  ends_on: string | null
  started_on: string | null
  daily_rate: string | null
  /** Le coût CHARGÉ des conditions commerciales, en CENTIMES (D43) — et non
   *  `missions.daily_cost`, que rien dans l'application n'écrit. L'axe « marge »
   *  du score était donc systématiquement non évaluable. */
  loaded_daily_cost_cents: string | null
  disputed: string | null
  missing: string | null
  /** #2587 — combien de relevés existent EN TOUT pour la mission, quel que
   *  soit leur statut. Sans lui, `disputed`/`missing` à `0` ne distingue pas
   *  « douze relevés, zéro litigieux » (une mesure) de « aucun relevé du
   *  tout » (une inconnue) — `COUNT(*)` ne rend jamais `null`. */
  timesheets_total: string | null
  overdue_invoices: string | null
  /** #2587 — même rôle que {@link timesheets_total}, côté facturation :
   *  combien de lignes `invoice_readiness` existent pour la mission. */
  invoices_total: string | null
  consultants: string | null
  account_needs: string | null
  account_missions: string | null
}

/**
 * Les deux scores d'une mission, et le prévisionnel (PDF 5 §5 et §11).
 *
 * Chaque axe rend `null` quand sa source manque, et le contrat refuse de
 * produire un score sous trois axes : c'est ce qui empêche un « 40/100 » qui ne
 * mesurerait que la marge de se faire passer pour une synthèse.
 *
 * Aucun de ces chiffres n'est une probabilité. Le prévisionnel ne pondère rien
 * (arbitrage n°4 du 16/08) : trois lignes distinctes, que personne n'additionne
 * à la place du lecteur.
 */
@Injectable()
export class MissionScoresService {
  private readonly logger = new Logger(MissionScoresService.name)
  private readonly capacityCache = new ShortTtlCache<{ people: string; committed: string | null; on_bench: string }[]>(
    60_000,
  )

  constructor(
    @InjectRepository(MissionEntity)
    private readonly missions: Repository<MissionEntity>,
  ) {}

  async scores(
    workspaceId: string,
    missionId: string,
    now: Date = new Date(),
  ): Promise<{ risk: MissionScore; opportunity: MissionScore } | null> {
    const rows = await this.missions.manager.query<ScoreRow[]>(
      // ⚠️ Alias `mct` et NON `t` : les sous-requêtes de ce SELECT utilisent
      // déjà `t` pour `mission_timesheets`. Postgres les laisserait masquer la
      // jointure externe sans rien dire — et la garde `sql-column-names` ne
      // saurait plus, elle, de quelle table on parle.
      `SELECT m.id, m.label, m.ends_on, m.started_on, m.daily_rate, mct.loaded_daily_cost_cents,
              (SELECT COUNT(*) FROM mission_timesheets t
                WHERE t.mission_id = m.id AND t.status = 'disputed') AS disputed,
              (SELECT COUNT(*) FROM mission_timesheets t
                WHERE t.mission_id = m.id AND t.status IN ('missing', 'expected')
                  AND t.period_month < date_trunc('month', now())) AS missing,
              -- #2587 — zéro ligne n'est pas zéro risque : le TOTAL, quel que
              -- soit le statut, distingue « aucun relevé remis » (inconnu) de
              -- « des relevés, aucun litigieux » (mesuré à zéro).
              (SELECT COUNT(*) FROM mission_timesheets t
                WHERE t.mission_id = m.id) AS timesheets_total,
              -- #2419.4 — un paiement partiel ne sort pas de la file : sur un
              -- paid_at IS NULL nu, un règlement de 5 000 € sur 10 000 €
              -- FAISAIT BAISSER le risque d'une mission dont le client ne paie
              -- pas. Le prédicat partagé lit les deux montants du solde.
              (SELECT COUNT(*) FROM invoice_readiness r
                WHERE r.mission_id = m.id AND r.due_on IS NOT NULL
                  AND ${unsettledInvoiceSql('r')} AND r.due_on < now()::date) AS overdue_invoices,
              -- #2587 — même distinction côté paiement : combien de lignes
              -- invoice_readiness existent pour cette mission, en tout.
              (SELECT COUNT(*) FROM invoice_readiness r
                WHERE r.mission_id = m.id) AS invoices_total,
              (SELECT COUNT(DISTINCT asg.consultant_id) FROM mission_assignments asg
                WHERE asg.mission_id = m.id) AS consultants,
              -- #2558.1 — le compte se lit sur le BESOIN : en passant par le
              -- projet, les besoins de régie de ce compte (qui n'en ont pas)
              -- ne comptaient pas, et le score les ignorait en silence.
              (SELECT COUNT(*) FROM project_needs n
                WHERE n.account_id = m.account_id AND n.status NOT IN ('cancelled', 'lost')) AS account_needs,
              (SELECT COUNT(*) FROM missions other
                WHERE other.account_id = m.account_id AND other.status IN ('active', 'onboarding')) AS account_missions
         FROM missions m
         LEFT JOIN mission_commercial_terms mct ON mct.mission_id = m.id
        WHERE m.id = $1 AND m.workspace_id = $2`,
      [missionId, workspaceId],
    )
    const row = rows[0]
    if (!row) return null

    const margin = marginOf(row)
    const daysToEnd = row.ends_on ? Math.floor((Date.parse(row.ends_on) - now.getTime()) / 86_400_000) : null
    const consultants = num(row.consultants)

    // Un risque ÉLEVÉ vaut 100. L'échelle est celle du danger, pas celle de la
    // santé : mélanger les deux sens sur un même axe est la faute qui rend un
    // tableau de bord illisible.
    const risk = scoreFromAxes([
      { axis: 'renewal', value: daysToEnd === null ? null : renewalRisk(daysToEnd) },
      { axis: 'timesheets', value: timesheetRisk(num(row.disputed), num(row.missing), num(row.timesheets_total)) },
      { axis: 'margin', value: margin === null ? null : marginRisk(margin) },
      { axis: 'payment', value: paymentRisk(num(row.overdue_invoices), num(row.invoices_total)) },
      // Zéro consultant affecté n'est pas « pas de concentration » : c'est une
      // information manquante.
      { axis: 'concentration', value: consultants === null || consultants === 0 ? null : consultants === 1 ? 70 : 20 },
    ])

    const opportunity = scoreFromAxes([
      { axis: 'longevity', value: longevity(row.started_on, now) },
      { axis: 'margin', value: margin === null ? null : Math.max(0, Math.min(100, Math.round(margin * 2))) },
      { axis: 'expansion', value: fromCount(num(row.account_needs), 3) },
      { axis: 'footprint', value: fromCount(num(row.account_missions), 3) },
    ])

    return { risk, opportunity }
  }

  /**
   * Le prévisionnel, en trois lignes SÉPARÉES.
   *
   * Rien n'est pondéré, rien n'est additionné : un montant multiplié par une
   * « probabilité » produit un chiffre qui n'existera jamais et sur lequel
   * quelqu'un construira un budget.
   */
  async forecast(
    scope: FinanceScope,
    months = 3,
    legalEntityId: string | null = null,
    now: Date = new Date(),
  ): Promise<Forecast> {
    const horizon: string[] = []
    for (let index = 0; index < months; index += 1) {
      const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + index, 1))
      horizon.push(cursor.toISOString().slice(0, 7))
    }
    const until = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, 1)).toISOString().slice(0, 10)
    // Trois requêtes, trois index de paramètre différents — d'où trois appels.
    // La clause, elle, est la MÊME fonction : la recopier serait la seule façon
    // qu'une des trois lignes échappe à la portée, et une portée trop large rend
    // un chiffre plus gros, qui a l'air juste.
    const securedPerimeter = financeScopeClause(scope, 'm', 3)
    const likelyPerimeter = financeScopeClause(scope, 'm', 2)
    // La ligne ESPÉRÉE part des OPPORTUNITÉS, pas des missions — la mission
    // qu'elle prévoit n'existe pas encore.
    //
    // ⚠️ Elle a longtemps porté sa PROPRE condition, écrite à la main :
    // `AND a.assigned_to = $2::uuid`. Elle disait donc « mon périmètre = les
    // comptes qui me sont attribués », alors que la seule définition du dépôt en
    // compte DEUX volets — « je le porte OU le compte m'est attribué ». Un
    // projet que je porte sur le compte d'un collègue sortait de MON
    // prévisionnel. `opportunities.owner_id` existe pourtant, est indexé
    // (`opportunities_owner_idx`, migration `1789344812907`) et se saisit
    // (`PATCH /projects/:id/owner`) — le volet manquant n'était pas
    // « impossible », il était OUBLIÉ. Une portée trop ÉTROITE rend un chiffre
    // plus petit, et un prévisionnel trop court se croit tout autant qu'un
    // trop long.
    //
    // `financeScopeClause` s'applique telle quelle : `opportunities` porte
    // `owner_id` ET `account_id`, exactement les deux colonnes qu'elle lit.
    const hopedPerimeter = financeScopeClause(scope, 'o', 2)

    /**
     * LA SOCIÉTÉ — sur DEUX lignes sur trois, et la troisième le dit.
     *
     * `secured` et `likely` partent de `missions`, qui porte `legal_entity_id`.
     * `hoped` part des OPPORTUNITÉS : la mission qui portera la société n'existe
     * pas encore, et il n'y a donc rien à filtrer. Lui inventer un rattachement
     * — par le compte, par exemple — serait une donnée fabriquée, et la ligne
     * changerait de population selon la société choisie sans que ce soit vrai.
     *
     * Le refus est INSCRIT (`FINANCE_ENTITY_BLIND_READS`, clé `forecastHoped`)
     * pour que l'écran puisse l'écrire : une ligne qui ne bouge pas quand les
     * deux autres bougent se lit comme une panne.
     */
    const securedEntity = legalEntityClause(legalEntityId, 'm', 3 + securedPerimeter.params.length)
    const likelyEntity = legalEntityClause(legalEntityId, 'm', 2 + likelyPerimeter.params.length)

    const lines: ForecastLine[] = [
      // ACQUIS — les missions en cours, jusqu'à leur fin CONNUE. Une mission
      // sans date de fin n'est pas prolongée d'office : elle est comptée à part.
      await this.line(
        'secured',
        `SELECT SUM(m.daily_rate * 100 * 20) AS cents,
                COUNT(*) FILTER (WHERE m.daily_rate IS NULL OR m.ends_on IS NULL) AS without_amount,
                COUNT(*) AS total
           FROM missions m
          WHERE ${SECURED_PREDICATE}${securedPerimeter.sql}${securedEntity.sql}`,
        [scope.workspaceId, until, ...securedPerimeter.params, ...securedEntity.params],
      ),
      // PROBABLE — les renouvellements engagés : un geste a eu lieu.
      await this.line(
        'likely',
        `SELECT SUM(m.daily_rate * 100 * 20) AS cents,
                COUNT(*) FILTER (WHERE m.daily_rate IS NULL) AS without_amount,
                COUNT(*) AS total
           FROM missions m
          WHERE ${LIKELY_PREDICATE}${likelyPerimeter.sql}${likelyEntity.sql}`,
        [scope.workspaceId, ...likelyPerimeter.params, ...likelyEntity.params],
      ),
      // ESPÉRÉ — le pipe commercial, à son montant NOMINAL.
      //
      // ⚠️ L'alias du compte est `acc` et non `a` : `financeScopeClause` déclare
      // son PROPRE `FROM accounts a` dans son sous-`EXISTS`, et deux `a`
      // imbriqués se lisent de travers même quand PostgreSQL, lui, les résout
      // correctement. Même renommage que sur le pipe, pour la même raison.
      await this.line(
        'hoped',
        `SELECT SUM(o.estimated_amount * 100) AS cents,
                COUNT(*) FILTER (WHERE o.estimated_amount IS NULL) AS without_amount,
                COUNT(*) AS total
           FROM opportunities o
           LEFT JOIN accounts acc ON acc.id = o.account_id
          WHERE (o.workspace_id = $1 OR acc.workspace_id = $1)
            AND ${projectStageInSql('o.stage', LIVE_STAGES)}${hopedPerimeter.sql}`,
        [scope.workspaceId, ...hopedPerimeter.params],
      ),
    ]

    return { months: horizon, lines }
  }

  /**
   * LA MARGE DU PRÉVISIONNEL CONTRACTUALISÉ — la moitié qui se MESURE.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QU'ELLE EST, ET CE QU'ELLE N'EST PAS
   * ─────────────────────────────────────────────────────────────────────────
   * Les maquettes montrent une « marge prévisionnelle » sur les trois lignes du
   * prévisionnel, et le dépôt la déclarait non mesurable : « aucune dérivation
   * ne la calcule ; la photographier supposerait de l'inventer ». Le constat
   * était juste pour la ligne ESPÉRÉE et faux pour les deux autres.
   *
   * `secured` et `likely` sont des missions déjà signées. Elles portent un TJM
   * et un coût CHARGÉ **saisis** (`mission_commercial_terms`). Leur marge n'est
   * pas une prévision : c'est la marge CONTRACTUELLE de contrats existants,
   * appliquée à du chiffre qui n'est simplement pas encore produit. Rien n'y est
   * deviné, et surtout rien n'y est PONDÉRÉ — le refus « aucune probabilité »
   * (`c26_probabilite`, refusé six fois) n'est pas contourné : il ne portait pas
   * sur les contrats signés, il portait sur le pipe.
   *
   * La ligne ESPÉRÉE reste dehors, et le nom du contrat le dit
   * (`CONTRACTED_FORECAST_LINES`). Lui prêter la marge des deux autres serait
   * une hypothèse présentée comme une mesure.
   *
   * ⚠️ **Aucun jour ne pondère ce calcul, et c'est délibéré.** La ligne de
   * chiffre applique un forfait de 20 jours par mission ; le reprendre ici ne
   * changerait STRICTEMENT rien au taux (le même facteur au numérateur et au
   * dénominateur s'annule), et le remplacer par une durée « vraie » ferait une
   * seconde convention de durée dans le même bloc. `days: 1` dit donc ce que le
   * calcul fait réellement : chaque mission contractualisée pèse pareil.
   *
   * ⚠️ `aggregateMargin` et pas une formule locale : une mission dont un terme
   * manque SORT du calcul en étant COMPTÉE (`unmeasured`), et le seuil de
   * mesurabilité voyage avec le taux. Une marge prévisionnelle tirée de deux
   * missions ne doit pas s'afficher avec l'autorité d'un pourcentage.
   */
  async contractedMargin(
    scope: FinanceScope,
    months = 3,
    legalEntityId: string | null = null,
    now: Date = new Date(),
  ): Promise<ContractedForecastMargin> {
    const until = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, 1)).toISOString().slice(0, 10)
    const perimeter = financeScopeClause(scope, 'm', 3)
    const entity = legalEntityClause(legalEntityId, 'm', 3 + perimeter.params.length)
    try {
      const rows = await this.missions.manager.query<{ daily_rate: string | null; cost: string | null }[]>(
        // L'UNION des deux populations contractualisées, chacune par SON
        // prédicat partagé avec la ligne de chiffre. `UNION` et non `UNION ALL`
        // n'aurait rien changé — les deux statuts s'excluent — mais `ALL` dit
        // qu'aucune déduplication n'est attendue, et évite un tri inutile.
        `SELECT m.daily_rate, t.loaded_daily_cost_cents AS cost
           FROM missions m
           LEFT JOIN mission_commercial_terms t ON t.mission_id = m.id
          WHERE ${SECURED_PREDICATE}${perimeter.sql}${entity.sql}
          UNION ALL
         SELECT m.daily_rate, t.loaded_daily_cost_cents AS cost
           FROM missions m
           LEFT JOIN mission_commercial_terms t ON t.mission_id = m.id
          WHERE ${LIKELY_PREDICATE}${perimeter.sql}${entity.sql}`,
        [scope.workspaceId, until, ...perimeter.params, ...entity.params],
      )
      return aggregateMargin(
        rows.map(row => ({
          dailyRateCents: row.daily_rate === null ? null : Math.round(Number(row.daily_rate) * 100),
          dailyCostCents: loadedCostCents(row.cost),
          days: 1,
        })),
      )
    } catch (err) {
      // Une lecture en échec rend `null` avec zéro observation — jamais 0 %,
      // qui se lirait « on vend à prix coûtant ».
      this.logger.error('contracted forecast margin error', { error: err })
      return {
        marginPercent: null,
        measured: 0,
        unmeasured: 0,
        measurability: measurability(0, MEASURABILITY_THRESHOLDS.averageMargin),
      }
    }
  }

  /**
   * La capacité vendable d'un mois.
   *
   * Perf 29/09/2026 — /briefing l'appelle trois fois (un mois chacun, voulu) :
   * la lecture SQL est retenue 60 s par ESPACE × MOIS (la capacité décrit
   * l'équipe, aucune portée personnelle — voir le contrôleur). Un échec n'est
   * jamais retenu : le repli « non mesurable » ne se fige pas une minute.
   */
  async capacity(workspaceId: string, month: string): Promise<CapacityForecast> {
    const periodMonth = `${month}-01`
    const workingDays = expectedWorkingDaysInWindow(periodMonth)
    try {
      const rows = await this.capacityCache.getOrLoad(`ws:${workspaceId}|m:${month}`, () =>
        this.readCapacityRows(workspaceId, periodMonth),
      )
      const people = Number(rows[0]?.people ?? 0)
      const loadShare = rows[0]?.committed === null ? null : Number(rows[0]?.committed ?? 0)
      const committedDays =
        loadShare === null || workingDays === null ? null : Number((loadShare * workingDays).toFixed(2))
      return {
        ...computeCapacity({
          workingDays,
          people,
          committedDays,
          unmeasured: 0,
          onBench: Number(rows[0]?.on_bench ?? 0),
        }),
        periodMonth,
      }
    } catch (err) {
      this.logger.error('capacity error', { error: err })
      // Rien de mesurable, et on le DIT : « 0 jour à vendre » se lirait « tout
      // le monde est staffé ».
      return {
        ...computeCapacity({ workingDays: null, people: 0, committedDays: null, unmeasured: 0 }),
        periodMonth,
      }
    }
  }

  private readCapacityRows(
    workspaceId: string,
    periodMonth: string,
  ): Promise<{ people: string; committed: string | null; on_bench: string }[]> {
    return this.missions.manager.query<{ people: string; committed: string | null; on_bench: string }[]>(
      // La capacité compte les CONSULTANTS, jamais les candidats : un
      // candidat n'est pas du temps qu'on peut vendre, et l'y inclure
      // gonflerait la disponibilité d'un vivier de recrutement.
      `SELECT (SELECT COUNT(*) FROM consultants c
                  WHERE c.workspace_id = $1 AND c.kind = 'consultant') AS people,
                (SELECT CASE
                          WHEN COUNT(*) = 0 THEN 0
                          WHEN COUNT(asg.load_percent) = 0 THEN NULL
                          ELSE SUM(asg.load_percent / 100.0)
                        END
                   FROM mission_assignments asg
                   JOIN missions m ON m.id = asg.mission_id
                  WHERE m.workspace_id = $1
                    AND asg.starts_on <= ($2::date + interval '1 month' - interval '1 day')
                    AND (asg.ends_on IS NULL OR asg.ends_on >= $2::date)) AS committed,
                (SELECT COUNT(*) FROM consultants c
                  WHERE c.workspace_id = $1 AND c.kind = 'consultant'
                    AND NOT EXISTS (
                      SELECT 1 FROM mission_assignments asg2
                       JOIN missions m2 ON m2.id = asg2.mission_id
                      WHERE m2.workspace_id = $1
                        AND asg2.consultant_id = c.id
                        AND asg2.starts_on <= ($2::date + interval '1 month' - interval '1 day')
                        AND (asg2.ends_on IS NULL OR asg2.ends_on >= $2::date))) AS on_bench`,
      [workspaceId, periodMonth],
    )
  }

  /**
   * Une ligne de prévisionnel, ou son absence.
   *
   * ⚠️ « Le total est un plancher » suppose qu'AU MOINS UNE ligne porte un
   * montant. Quand aucune ne le fait, il n'y a pas de plancher : il n'y a rien
   * de mesuré. Mesuré en production le 27/08 sur `/pilotage/finance` — « Espéré ·
   * 580 lignes sans montant — le total est un plancher » affiché à **0 €**,
   * pendant que `/pilotage/qualite` disait « Projets ouverts sans montant : 580
   * sur 580 ». Cent pour cent. « 0 € » s'y lisait « rien d'espéré ».
   *
   * La carte voisine, « Chiffre d'affaires », tenait déjà la bonne règle
   * (`revenue.service.ts`, raison `no_amount`) : deux cartes du même bloc
   * traitaient donc l'absence de deux façons opposées.
   *
   * Trois situations, trois réponses — et la première est la seule où zéro est
   * VRAI :
   *
   *  - AUCUNE ligne : le pipe est vide, et un pipe vide vaut bien 0 €. (Contraste
   *    avec l'encaissé, dont la colonne source n'est écrite par rien du dépôt :
   *    là-bas « aucune ligne » veut dire « personne n'a jamais enregistré ».)
   *  - des lignes, aucune chiffrée : `null`, et l'écran dit pourquoi ;
   *  - au moins une chiffrée : le total est un plancher, comme avant.
   */
  private async line(kind: ForecastLine['kind'], sql: string, params: unknown[]): Promise<ForecastLine> {
    try {
      const rows = await this.missions.manager.query<
        { cents: string | null; without_amount: string | null; total: string | null }[]
      >(sql, params)
      const row = rows[0]
      const count = Number(row?.total ?? 0)
      const withoutAmount = Number(row?.without_amount ?? 0)
      const cents = row?.cents === null || row?.cents === undefined ? null : Math.round(Number(row.cents))

      if (count === 0) return { kind, amountCents: 0, withoutAmount: 0, count: 0 }
      if (withoutAmount >= count) return { kind, amountCents: null, withoutAmount, count }
      return { kind, amountCents: cents, withoutAmount, count }
    } catch (err) {
      this.logger.error('forecast line error', { error: err, tags: { kind } })
      return { kind, amountCents: null, withoutAmount: 0, count: 0 }
    }
  }
}

function num(value: string | null): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * L'axe « marge » du score — par le noyau commun, jamais par une formule à soi.
 *
 * ⚠️ Deux unités : le TJM est en EUROS, le coût chargé en CENTIMES. Et
 * `loaded_daily_cost_cents` est un `bigint`, donc une CHAÎNE côté pg :
 * `Number('')` vaut `0`, soit « 100 % de marge » sur une valeur illisible.
 */
function marginOf(row: ScoreRow): number | null {
  const raw = row.loaded_daily_cost_cents
  const cents = raw === null || raw === '' ? null : Number(raw)
  return marginPercent(
    row.daily_rate === null ? null : Math.round(Number(row.daily_rate) * 100),
    cents === null || !Number.isFinite(cents) || cents < 0 ? null : cents,
  )
}

/**
 * Plus la fin est proche, plus le risque monte. Une fin passée est au maximum.
 *
 * Les trois jalons sont ceux du contrat (`RENEWAL_IMMINENT_DAYS`,
 * `RENEWAL_J30_DAYS`, `RENEWAL_J60_DAYS`) et NON une échelle recopiée : c'est
 * la même que celle qui range une mission en `imminent` / `j30` / `j60`
 * (`renewalWindow`, utilisé par `delivery.service.ts`). Les points attribués à
 * chaque palier, eux, appartiennent à ce score — le contrat ne dit rien du 90,
 * 70, 40. La coupure est partagée, la pondération ne l'est pas.
 */
function renewalRisk(daysToEnd: number): number {
  if (daysToEnd < 0) return 100
  if (daysToEnd <= RENEWAL_IMMINENT_DAYS) return 90
  if (daysToEnd <= RENEWAL_J30_DAYS) return 70
  if (daysToEnd <= RENEWAL_J60_DAYS) return 40
  return 10
}

/**
 * #2587 — zéro ligne n'est pas zéro risque.
 *
 * `disputed` et `missing` sont des SOUS-ENSEMBLES de `mission_timesheets` :
 * `COUNT(*)` ne rend jamais `null`, donc une mission SANS AUCUN relevé
 * produisait `disputed = 0, missing = 0` — indiscernable de « douze relevés
 * remis, aucun litigieux ». Le premier est une inconnue, le second une
 * mesure : `total` est ce qui les distingue, et `total === 0` fait sortir
 * l'axe du dénominateur (GA-18 / GA-19) au lieu de le rendre rassurant.
 */
function timesheetRisk(disputed: number | null, missing: number | null, total: number | null): number | null {
  if (total === null || total === 0) return null
  const score = (disputed ?? 0) * 50 + (missing ?? 0) * 25
  return Math.min(100, score)
}

function marginRisk(margin: number): number {
  if (margin <= 0) return 100
  if (margin < 10) return 80
  if (margin < 20) return 55
  if (margin < 30) return 30
  return 10
}

/** #2587 — même défaut, même correction que {@link timesheetRisk} : sans
 *  aucune ligne `invoice_readiness`, on ne sait pas si la mission paie bien
 *  ou si sa facturation n'est simplement pas encore suivie. */
function paymentRisk(overdue: number | null, total: number | null): number | null {
  if (total === null || total === 0) return null
  return Math.min(100, (overdue ?? 0) * 40)
}

/** Une mission longue vaut mieux qu'une mission courte — mais on ne sait rien
 *  d'une mission sans date de début. */
function longevity(startedOn: string | null, now: Date): number | null {
  if (!startedOn) return null
  const months = (now.getTime() - Date.parse(startedOn)) / (86_400_000 * 30)
  if (!Number.isFinite(months) || months < 0) return null
  return Math.min(100, Math.round(months * 8))
}

/** Une note tirée d'un compte, plafonnée. `null` quand le compte est inconnu —
 *  et 0 reste 0 : « aucun autre besoin » est une information. */
function fromCount(count: number | null, full: number): number | null {
  if (count === null) return null
  return Math.min(100, Math.round((count / full) * 100))
}
