import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  applyFieldUpdates,
  fieldSourceRank,
  type CreateMissionExpenseInput,
  type EvidenceFieldSource,
  type FieldSource,
  type MissionExpense,
  type UpdateMissionExpenseInput,
} from '@bellum/contracts'
import { MissionEntity } from '../../database/entities/mission.entity'
import { MissionExpenseEntity } from '../../database/entities/mission-expense.entity'

/**
 * Les FRAIS d'une mission (30/08/2026) — la ligne que la marge ignorait.
 *
 * Réservé à `finance:read`, comme les conditions commerciales : c'est le
 * contrôleur qui gate la route, ce service ne fait ni la lecture du droit ni
 * la rédaction — `StaffingController` le fait déjà pour `terms`, la même règle
 * vaut ici.
 *
 * **Une correction humaine gagne toujours** (`update`). Chaque édition passe
 * par `applyFieldUpdates` / `decideFieldWrite` — l'arbitre DÉJÀ en place pour
 * la même règle sur les comptes et les contacts — et non par un `UPDATE`
 * direct qui écraserait un montant saisi à la main dès qu'un recalcul y
 * touche.
 */
@Injectable()
export class MissionExpensesService {
  constructor(
    @InjectRepository(MissionExpenseEntity) private readonly expenses: Repository<MissionExpenseEntity>,
    @InjectRepository(MissionEntity) private readonly missions: Repository<MissionEntity>,
  ) {}

  async list(workspaceId: string, missionId: string): Promise<MissionExpense[]> {
    await this.assertMission(missionId, workspaceId)
    const rows = await this.expenses.find({
      where: { mission_id: missionId, workspace_id: workspaceId },
      order: { expense_date: 'DESC', created_at: 'DESC' },
    })
    return rows.map(toApi)
  }

  /**
   * La somme des lignes d'une mission, en centimes. `0` sur une mission sans
   * ligne est un fait VRAI et non un « non mesuré » déguisé — `COALESCE` est
   * juste ici : l'absence de LIGNE est la réponse, elle n'attend rien.
   */
  async totalCents(workspaceId: string, missionId: string): Promise<number> {
    const rows = await this.expenses.manager.query<{ total: string | null }[]>(
      `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS total FROM mission_expenses
        WHERE mission_id = $1 AND workspace_id = $2`,
      [missionId, workspaceId],
    )
    return Number(rows[0]?.total ?? 0)
  }

  /**
   * Crée une ligne. Toujours `source: 'human'` — cette route est celle par
   * laquelle une PERSONNE saisit un frais depuis la fiche mission ; une ligne
   * importée arriverait par un chemin distinct, qui déclarerait sa propre
   * source (`connector`), et cette méthode ne maquillerait jamais l'une en
   * l'autre.
   */
  async create(
    workspaceId: string,
    userId: string,
    missionId: string,
    input: CreateMissionExpenseInput,
  ): Promise<MissionExpense> {
    await this.assertMission(missionId, workspaceId)
    const saved = await this.expenses.save(
      this.expenses.create({
        mission_id: missionId,
        workspace_id: workspaceId,
        label: input.label,
        amount_cents: input.amountCents,
        expense_date: input.expenseDate,
        entered_by: userId,
        source: 'human',
      }),
    )
    return toApi(saved)
  }

  /**
   * Édite une ligne — CHAMP PAR CHAMP, et arbitrée.
   *
   * `incomingSource` par défaut à `'human'` : le contrôleur HTTP ne l'appelle
   * jamais autrement, une édition depuis l'écran est toujours le geste d'une
   * personne. Le paramètre existe pour le futur chemin d'un connecteur
   * (`'connector'`) ou d'un recalcul (`'pipeline'`) — et c'est lui qui
   * protège : sur une ligne dont le montant a été SAISI À LA MAIN
   * (`source: 'human'`), une écriture `'pipeline'` est REFUSÉE.
   */
  async update(
    workspaceId: string,
    missionId: string,
    expenseId: string,
    input: UpdateMissionExpenseInput,
    incomingSource: EvidenceFieldSource = 'human',
  ): Promise<MissionExpense> {
    await this.assertMission(missionId, workspaceId)
    const existing = await this.expenses.findOne({
      where: { id: expenseId, mission_id: missionId, workspace_id: workspaceId },
    })
    if (!existing) throw new NotFoundException('Ligne de frais introuvable dans cette mission.')

    const currentSource = (existing.source as FieldSource) ?? 'human'
    const { accepted } = applyFieldUpdates({
      incoming: {
        label: input.label,
        amountCents: input.amountCents,
        expenseDate: input.expenseDate,
      },
      incomingSource,
      current: {
        label: existing.label,
        amountCents: Number(existing.amount_cents),
        expenseDate: existing.expense_date,
      },
      currentSources: { label: currentSource, amountCents: currentSource, expenseDate: currentSource },
    })

    if (Object.keys(accepted).length === 0) return toApi(existing)

    const patch: Partial<Pick<MissionExpenseEntity, 'label' | 'amount_cents' | 'expense_date' | 'source'>> = {}
    if ('label' in accepted) patch.label = accepted.label as string
    if ('amountCents' in accepted) patch.amount_cents = accepted.amountCents as number
    if ('expenseDate' in accepted) patch.expense_date = accepted.expenseDate as string
    // La source de la ligne ne DESCEND jamais : une écriture `pipeline`
    // acceptée sur une ligne encore à sa source par défaut ne doit pas
    // effacer une autorité déjà posée par ailleurs — seule une autorité PLUS
    // FORTE que l'actuelle la remplace.
    if (fieldSourceRank(incomingSource) > fieldSourceRank(currentSource)) patch.source = incomingSource

    await this.expenses.update({ id: expenseId }, patch)
    const updated = await this.expenses.findOne({ where: { id: expenseId } })
    if (!updated) throw new NotFoundException('Ligne de frais introuvable dans cette mission.')
    return toApi(updated)
  }

  private async assertMission(missionId: string, workspaceId: string): Promise<void> {
    const mission = await this.missions.findOne({ where: { id: missionId, workspace_id: workspaceId } })
    if (!mission) throw new NotFoundException('Mission introuvable')
  }
}

function toApi(row: MissionExpenseEntity): MissionExpense {
  return {
    id: row.id,
    missionId: row.mission_id,
    label: row.label,
    amountCents: Number(row.amount_cents),
    expenseDate: typeof row.expense_date === 'string' ? row.expense_date.slice(0, 10) : row.expense_date,
    enteredByUserId: row.entered_by,
    source: (row.source as EvidenceFieldSource) ?? 'human',
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}
