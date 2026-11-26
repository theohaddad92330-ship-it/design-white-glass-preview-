import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { needContradictions, needQualificationQuestions, type NeedQualificationResponse } from '@bellum/contracts'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'

/**
 * #2323.32/.34/.35/.36 / #2323.38-.45 — LA FICHE BESOIN, CE QUI MANQUE ET CE
 * QUI SE CONTREDIT.
 *
 * ⚠️ CE SERVICE NE CALCULE RIEN — même docblock que {@link NeedVerdictService},
 * pour la même raison : la décision entière vit dans `needQualificationQuestions`
 * et `needContradictions` (`packages/contracts/src/schemas/`), purs et testés
 * à part. Ici il n'y a que des `SELECT` et le passage des grandeurs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS AGRÉGATIONS CROISÉES — pourquoi elles vivent ICI, pas dans le
 * contrat
 * ─────────────────────────────────────────────────────────────────────────────
 * `need-contradictions.ts` refuse de lire le vivier ou les positionnements :
 * ce ne sont pas des colonnes du besoin. Trois requêtes SQL les résument en
 * primitives avant l'appel au module pur :
 *
 *  · #2323.39 — la médiane TJM des consultants `junior` NON ARCHIVÉS de
 *    l'espace, `null` sous trois valeurs (le seuil de l'issue).
 *  · #2323.41 — l'espace est-il « freelance-only » : au moins cinq
 *    positionnements sur douze mois, et 100 % portent sur des consultants
 *    `contract_type = 'freelance'`. `null` sous le seuil.
 *  · #2323.43 — au moins un consultant actif du vivier détient au moins une
 *    des habilitations exigées. Ignorée par le module pur si `clearances`
 *    est vide.
 */
interface NeedRow {
  skills: { term: string }[]
  seniority: string | null
  stack: string[] | null
  languages: { code: string; level: string | null }[] | null
  clearances: string[] | null
  location: string | null
  remote: string | null
  start_on: string | null
  duration_months: number | null
  budget_cents: string | number | null
  target_tjm_cents: string | number | null
  profile_type_agreement: string | null
  presentation_process: string | null
  deadline_at: string | null
  urgency: string | null
  interview_rounds: number | null
  onsite_days_per_week: number | null
  freelance_excluded: boolean | null
  budget_validated: boolean | null
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0)
}

@Injectable()
export class NeedContradictionsService {
  constructor(
    @InjectRepository(ProjectNeedEntity)
    private readonly needs: Repository<ProjectNeedEntity>,
  ) {}

  /** Sous ce compte de positionnements sur douze mois, le statut
   *  « freelance-only » de l'espace n'est pas déterminable (#2323.41). */
  private static readonly FREELANCE_ONLY_MIN_SUBMISSIONS = 5
  /** Sous ce compte de juniors avec TJM connu, la médiane n'est pas
   *  calculable (#2323.39). */
  private static readonly MEDIAN_MIN_JUNIORS = 3

  async forNeed(workspaceId: string, needId: string, now: Date = new Date()): Promise<NeedQualificationResponse> {
    const manager = this.needs.manager

    const [need] = (await manager.query(
      `SELECT n.skills, n.seniority, n.stack, n.languages, n.clearances, n.location, n.remote, n.start_on,
              n.duration_months, n.budget_cents, n.target_tjm_cents, n.profile_type_agreement,
              n.presentation_process, n.deadline_at, n.urgency, n.interview_rounds, n.onsite_days_per_week,
              n.freelance_excluded, n.budget_validated
         FROM project_needs n
        WHERE n.id = $1 AND n.workspace_id = $2
        LIMIT 1`,
      [needId, workspaceId],
    )) as NeedRow[]
    if (!need) throw new NotFoundException('Besoin introuvable')

    const clearances = need.clearances ?? []

    const [medianJuniorTjmCents, workspaceFreelanceOnly, clearanceAvailable] = await Promise.all([
      this.medianJuniorTjmCents(workspaceId),
      this.workspaceFreelanceOnly(workspaceId, now),
      clearances.length > 0 ? this.anyConsultantHoldsClearance(workspaceId, clearances) : Promise.resolve(null),
    ])

    const shared = {
      start_on: need.start_on === null ? null : String(need.start_on).slice(0, 10),
      seniority: need.seniority ?? null,
      target_tjm_cents: need.target_tjm_cents == null ? null : Number(need.target_tjm_cents),
      remote: need.remote ?? null,
      duration_months: need.duration_months ?? null,
      clearances,
    }

    const questions = needQualificationQuestions({
      skills: need.skills ?? [],
      seniority: shared.seniority,
      stack: need.stack ?? [],
      languages: need.languages ?? [],
      clearances,
      location: need.location ?? null,
      remote: shared.remote,
      start_on: shared.start_on,
      budget_cents: need.budget_cents == null ? null : Number(need.budget_cents),
      target_tjm_cents: shared.target_tjm_cents,
      profile_type_agreement: need.profile_type_agreement ?? null,
      presentation_process: need.presentation_process ?? null,
      deadline_at: need.deadline_at === null ? null : String(need.deadline_at),
      urgency: need.urgency ?? null,
    })

    const { contradictions, notEvaluable } = needContradictions({
      start_on: shared.start_on,
      interview_rounds: need.interview_rounds ?? null,
      seniority: shared.seniority,
      target_tjm_cents: shared.target_tjm_cents,
      medianJuniorTjmCents,
      remote: shared.remote,
      onsite_days_per_week: need.onsite_days_per_week ?? null,
      freelance_excluded: need.freelance_excluded ?? null,
      workspaceFreelanceOnly,
      duration_months: shared.duration_months,
      budget_validated: need.budget_validated ?? null,
      clearances,
      clearanceAvailable,
      now,
    })

    return { questions: [...questions], contradictions: [...contradictions], notEvaluable: [...notEvaluable] }
  }

  private async medianJuniorTjmCents(workspaceId: string): Promise<number | null> {
    const rows = (await this.needs.manager.query(
      `SELECT tjm FROM consultants
        WHERE workspace_id = $1 AND archived_at IS NULL AND seniority = 'junior' AND tjm IS NOT NULL`,
      [workspaceId],
    )) as { tjm: number }[]
    if (rows.length < NeedContradictionsService.MEDIAN_MIN_JUNIORS) return null
    return median(rows.map(row => Number(row.tjm))) * 100
  }

  private async workspaceFreelanceOnly(workspaceId: string, now: Date): Promise<boolean | null> {
    const since = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
    const rows = (await this.needs.manager.query(
      `SELECT c.contract_type AS contract_type
         FROM submissions s
         JOIN consultants c ON c.id = s.consultant_id
        WHERE s.workspace_id = $1 AND s.created_at >= $2`,
      [workspaceId, since.toISOString()],
    )) as { contract_type: string | null }[]
    if (rows.length < NeedContradictionsService.FREELANCE_ONLY_MIN_SUBMISSIONS) return null
    return rows.every(row => row.contract_type === 'freelance')
  }

  private async anyConsultantHoldsClearance(workspaceId: string, clearances: readonly string[]): Promise<boolean> {
    const [row] = (await this.needs.manager.query(
      `SELECT EXISTS (
         SELECT 1 FROM consultants
          WHERE workspace_id = $1 AND archived_at IS NULL AND clearances && $2::text[]
       ) AS available`,
      [workspaceId, clearances],
    )) as { available: boolean }[]
    return row?.available === true
  }
}
