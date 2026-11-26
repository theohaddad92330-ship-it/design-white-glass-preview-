import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import type {
  CreateMissionFeedbackInput,
  EvidenceFieldSource,
  MissionFeedbackItem,
  MissionFeedbackRails,
  MissionSatisfactionLevel,
} from '@bellum/contracts'
import { MissionEntity } from '../../database/entities/mission.entity'
import { MissionFeedbackEntity } from '../../database/entities/mission-feedback.entity'

/**
 * #2412 — LE DOUBLE POULS DE SATISFACTION D'UNE MISSION.
 *
 * Réservé à un lecteur/écrivain de la fiche mission (`records:write` côté
 * écriture, comme les autres écritures de `DeliveryController`) — c'est le
 * contrôleur qui gate la route, ce service ne fait ni la lecture du droit ni
 * la rédaction, même règle que `MissionExpensesService`.
 *
 * `rails()` retourne les deux rails SÉPARÉS (#2412.1, #2412.8) : jamais un
 * tableau plat, jamais une moyenne entre `client` et `consultant`. Une entrée
 * `private` est retirée pour tout lecteur qui n'en est pas l'auteur (#2412.10)
 * — le filtre vit ICI, à un seul endroit, pas recopié à l'écran.
 */
@Injectable()
export class MissionFeedbackService {
  constructor(
    @InjectRepository(MissionFeedbackEntity) private readonly feedback: Repository<MissionFeedbackEntity>,
    @InjectRepository(MissionEntity) private readonly missions: Repository<MissionEntity>,
  ) {}

  async rails(workspaceId: string, missionId: string, readerUserId: string): Promise<MissionFeedbackRails> {
    await this.assertMission(missionId, workspaceId)
    const rows = await this.feedback.find({
      where: { mission_id: missionId, workspace_id: workspaceId },
      order: { created_at: 'DESC' },
    })
    // #2412.10 — une entrée privée n'existe, pour ce lecteur, que si c'est lui
    // qui l'a écrite. Elle n'est ni tronquée ni anonymisée : elle disparaît,
    // comme une absence (doctrine « on n'affiche pas ce qu'on n'a pas »).
    const visible = rows.filter(row => !row.private || row.recorded_by === readerUserId)
    return {
      client: visible.filter(row => row.rail === 'client').map(toApi),
      consultant: visible.filter(row => row.rail === 'consultant').map(toApi),
    }
  }

  /**
   * Crée une entrée. Toujours `source: 'human'` — cette route est celle par
   * laquelle une PERSONNE dépose un retour depuis la fiche mission ; une
   * lecture automatique de sentiment arriverait par un chemin distinct, qui
   * déclarerait sa propre source, jamais maquillée en saisie humaine.
   */
  async create(
    workspaceId: string,
    userId: string,
    missionId: string,
    // #2408.16 — `level` optionnel ici aussi : un appelant interne qui ne le
    // passe pas dépose une note « non mesurée », jamais un niveau par défaut.
    input: Omit<CreateMissionFeedbackInput, 'level'> & { level?: MissionSatisfactionLevel | null },
  ): Promise<MissionFeedbackItem> {
    await this.assertMission(missionId, workspaceId)
    const saved = await this.feedback.save(
      this.feedback.create({
        mission_id: missionId,
        workspace_id: workspaceId,
        rail: input.rail,
        note: input.note,
        private: input.private,
        level: input.level ?? null,
        recorded_by: userId,
        source: 'human',
      }),
    )
    return toApi(saved)
  }

  /**
   * #3413.2 — LE POINT J+7 : les missions ACTIVES démarrées depuis sept à
   * vingt-et-un jours et qui n'ont encore AUCUNE entrée de feedback, ni
   * `client` ni `consultant` (#2412) — une seule entrée, quel que soit son
   * rail ou son contenu, suffit à considérer le point fait, jamais une note
   * inventée ici.
   *
   * Fenêtre bornée à vingt-et-un jours : passé ce délai le point à sept
   * jours est simplement manqué, pas re-signalé indéfiniment — le REX de fin
   * de mission (`CapitalisationService.rexForWorkspace`) couvre la suite.
   */
  async checkinJ7ForWorkspace(workspaceId: string, now: Date = new Date()): Promise<MissionCheckinJ7Item[]> {
    const active = await this.missions.find({
      where: { workspace_id: workspaceId, status: 'active' },
      select: { id: true, label: true, started_on: true },
    })
    const inWindow = active.filter(mission => {
      if (!mission.started_on) return false
      const days = daysSinceStart(mission.started_on, now)
      return days >= 7 && days <= 21
    })
    if (inWindow.length === 0) return []

    const alreadyChecked = await this.feedback.find({ where: { mission_id: In(inWindow.map(m => m.id)) } })
    const covered = new Set(alreadyChecked.map(row => row.mission_id))

    return inWindow
      .filter(mission => !covered.has(mission.id))
      .map(mission => ({ mission_id: mission.id, label: mission.label, started_on: mission.started_on as string }))
      .sort((a, b) => a.started_on.localeCompare(b.started_on))
  }

  private async assertMission(missionId: string, workspaceId: string): Promise<void> {
    const mission = await this.missions.findOne({ where: { id: missionId, workspace_id: workspaceId } })
    if (!mission) throw new NotFoundException('Mission introuvable')
  }
}

type MissionCheckinJ7Item = { mission_id: string; label: string; started_on: string }

/** Jours écoulés depuis le démarrage — même arrondi que `daysUntilEnd` (contracts/mission.ts). */
function daysSinceStart(startedOn: string, now: Date): number {
  const start = new Date(startedOn)
  const startOfNow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  return Math.floor((startOfNow.getTime() - start.getTime()) / 86_400_000)
}

function toApi(row: MissionFeedbackEntity): MissionFeedbackItem {
  return {
    id: row.id,
    missionId: row.mission_id,
    rail: row.rail as MissionFeedbackItem['rail'],
    note: row.note,
    private: row.private,
    source: (row.source as EvidenceFieldSource) ?? 'human',
    level: (row.level as MissionSatisfactionLevel | null | undefined) ?? null,
    recordedByUserId: row.recorded_by,
    createdAt: new Date(row.created_at).toISOString(),
  }
}
