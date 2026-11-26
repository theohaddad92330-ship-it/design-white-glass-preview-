import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { detectMissionDrift, type MissionDriftReport, type MissionMonth } from '@bellum/contracts'
import { MissionEntity } from '../../database/entities/mission.entity'

/**
 * Les mois de mission, tels que la base sait les rendre AUJOURD'HUI.
 *
 * ⚠️ Deux colonnes manquent à l'appel, et c'est une INFORMATION, pas un oubli :
 * voir `toMonth` plus bas. Les nommer ici plutôt que de les combler est ce qui
 * distingue « je n'ai pas pu regarder » de « il n'y a rien à voir ».
 */
type DriftRow = {
  mission_id: string
  mission_label: string | null
  account_name: string | null
  ends_on: string | null
  period_month: string | null
  days: string | null
  expected_days: string | null
  status: string
  validated_by_client_at: string | null
}

/** Les statuts où un relevé EXISTE réellement — les seuls à porter des jours. */
const DECLARED_STATUSES = new Set(['submitted', 'validated', 'disputed', 'rejected'])

function toNumber(value: string | null): number | null {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** « YYYY-MM-DD » ou une date ISO → « YYYY-MM ». */
function periodKey(value: string): string {
  return value.slice(0, 7)
}

/** Le lendemain du dernier jour du mois — l'instant où le relevé devient dû. */
function monthCloses(period: string): number {
  const [year, month] = period.split('-').map(Number)
  return Date.UTC(year, month, 1)
}

/**
 * Une ligne de relevé → un mois normalisé pour `detectMissionDrift`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX SIGNAUX QUE CE DÉPÔT NE PEUT PAS ENCORE MESURER
 * ─────────────────────────────────────────────────────────────────────────────
 * `daysToSubmit` — **il n'existe aucune date de REMISE.** `mission_timesheets`
 * porte `created_at` et `updated_at`, mais `updated_at` bouge aussi à la
 * validation et au rejet : le lire comme une date de dépôt ferait baisser le
 * « délai de remise » chaque fois qu'un client valide tard. Un proxy qui se
 * trompe de sens est pire qu'une absence, donc `null`.
 *
 * `satisfaction` — **le produit n'a aucune donnée de satisfaction**, ni table,
 * ni envoi, ni collecte ; `manager-kpi.ts` le dit noir sur blanc pour les deux
 * indicateurs du tableau de bord manager. Inventer une valeur, ou pire, lire
 * l'absence comme « satisfaction stable », transformerait un trou de mesure en
 * verdict rassurant.
 *
 * Les deux remontent donc dans `unmeasurable`, NOMMÉS à l'écran. Le détecteur
 * garde ses trois autres signaux, et deux suffisent à alerter — la capacité
 * n'est pas du code mort, elle est simplement partielle et le dit.
 *
 * `daysToClientValidation` EST mesurable : `validated_by_client_at` existe, et
 * la clôture du mois est un repère objectif. Le délai se compte donc de la
 * clôture à la validation — jamais de la remise, qu'on ne sait pas dater.
 */
function toMonth(row: DriftRow): MissionMonth | null {
  if (!row.period_month) return null
  const period = periodKey(row.period_month)
  const validatedAt = row.validated_by_client_at ? Date.parse(row.validated_by_client_at) : Number.NaN
  const closes = monthCloses(period)
  const validationDelay =
    Number.isNaN(validatedAt) || !Number.isFinite(closes)
      ? null
      : Math.max(0, Math.round((validatedAt - closes) / 86_400_000))

  return {
    period,
    expectedDays: toNumber(row.expected_days),
    // ⚠️ Un mois SANS relevé n'a pas « zéro jour déclaré » : ce serait l'écart le
    // plus négatif possible, produit par une absence. Le détecteur crierait à la
    // dérive sur une mission dont le CRA est simplement en retard.
    declaredDays: DECLARED_STATUSES.has(row.status) ? toNumber(row.days) : null,
    daysToSubmit: null,
    daysToClientValidation: validationDelay,
    satisfaction: null,
    disputed: row.status === 'disputed',
  }
}

/**
 * LE DÉTECTEUR DE DÉRIVE DE MISSION — PDF 5 §7.2.
 *
 * Le service ne décide rien : il LIT les relevés et passe des mois normalisés à
 * `detectMissionDrift`, qui est pure et testée à part. La règle d'honnêteté
 * (« deux signaux minimum, sur trois mois minimum ») et les sept seuils vivent
 * dans le contrat, à un seul endroit — les recopier ici les ferait diverger au
 * premier réglage changé.
 *
 * ⚠️ Ce que ce détecteur N'EST PAS : `renewal_at_risk` regarde la FIN de la
 * mission (T-30) ; celui-ci regarde sa DÉGRADATION. Une mission qui dérape
 * depuis mars est toujours « active » et n'apparaît dans aucune des deux
 * alertes existantes.
 */
@Injectable()
export class MissionDriftService {
  constructor(
    @InjectRepository(MissionEntity)
    private readonly missions: Repository<MissionEntity>,
  ) {}

  /**
   * Les missions EN COURS de l'espace, avec leur verdict de dérive.
   *
   * Rend TOUS les verdicts, y compris `steady` et `unmeasurable` : l'écran
   * choisit ce qu'il montre, et une mission qu'on ne sait pas lire doit pouvoir
   * apparaître quelque part. Ne rendre que les dérives ferait disparaître
   * exactement les missions dont on ignore l'état.
   */
  async forWorkspace(workspaceId: string): Promise<MissionDriftReport[]> {
    return this.reports(
      `SELECT m.id AS mission_id, m.label AS mission_label, a.company_name AS account_name,
              m.ends_on::text AS ends_on,
              t.period_month::text AS period_month, t.days::text AS days,
              t.expected_days::text AS expected_days,
              COALESCE(t.status, 'missing') AS status,
              t.validated_by_client_at::text AS validated_by_client_at
         FROM missions m
         LEFT JOIN accounts a ON a.id = m.account_id
         LEFT JOIN mission_timesheets t ON t.mission_id = m.id
        WHERE m.workspace_id = $1
          AND m.status IN ('active', 'onboarding', 'paused')
        ORDER BY m.id, t.period_month ASC`,
      [workspaceId],
    )
  }

  /**
   * #3291 (#3269.1 reste) — le verdict de dérive d'UNE mission, pour le jalon
   * projeté `risque` de `mission-delivery-milestones.ts`. Même requête, même
   * filtre de statut que {@link forWorkspace} — un mois de dérive se lit pareil,
   * qu'on regarde tout l'espace ou une seule mission (GA-26) — avec `m.id = $2`
   * en plus. Une mission hors du filtre de statut (terminée, jamais démarrée)
   * n'a AUCUNE ligne : `null`, jamais un verdict inventé.
   */
  async forMission(workspaceId: string, missionId: string): Promise<MissionDriftReport | null> {
    const reports = await this.reports(
      `SELECT m.id AS mission_id, m.label AS mission_label, a.company_name AS account_name,
              m.ends_on::text AS ends_on,
              t.period_month::text AS period_month, t.days::text AS days,
              t.expected_days::text AS expected_days,
              COALESCE(t.status, 'missing') AS status,
              t.validated_by_client_at::text AS validated_by_client_at
         FROM missions m
         LEFT JOIN accounts a ON a.id = m.account_id
         LEFT JOIN mission_timesheets t ON t.mission_id = m.id
        WHERE m.workspace_id = $1
          AND m.id = $2
          AND m.status IN ('active', 'onboarding', 'paused')
        ORDER BY m.id, t.period_month ASC`,
      [workspaceId, missionId],
    )
    return reports[0] ?? null
  }

  private async reports(sql: string, params: unknown[]): Promise<MissionDriftReport[]> {
    const rows = await this.missions.manager.query<DriftRow[]>(sql, params)

    const byMission = new Map<string, { row: DriftRow; months: MissionMonth[] }>()
    for (const row of rows) {
      const bucket = byMission.get(row.mission_id) ?? { row, months: [] }
      const month = toMonth(row)
      if (month) bucket.months.push(month)
      byMission.set(row.mission_id, bucket)
    }

    const reports: MissionDriftReport[] = []
    for (const [missionId, { row, months }] of byMission) {
      reports.push({
        missionId,
        // Une mission sans libellé garde son identité par son compte : on
        // n'invente pas un nom, et on ne la fait pas disparaître non plus.
        missionLabel: row.mission_label ?? '',
        accountName: row.account_name,
        endsOn: row.ends_on,
        verdict: detectMissionDrift(months),
      })
    }

    // Les dérives d'abord, puis ce qu'on ne sait pas lire, puis le reste : ce
    // qu'on ignore mérite d'être vu avant ce qui va bien.
    const rank = { drifting: 0, unmeasurable: 1, steady: 2 } as const
    return reports.sort(
      (a, b) => rank[a.verdict.kind] - rank[b.verdict.kind] || a.missionLabel.localeCompare(b.missionLabel, 'fr'),
    )
  }
}
