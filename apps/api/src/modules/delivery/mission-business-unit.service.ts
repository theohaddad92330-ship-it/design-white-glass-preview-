import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { MissionBusinessUnitTransferInput, MissionBusinessUnitTransferResult } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { BusinessUnitEntity } from '../../database/entities/business-unit.entity'

/**
 * #3413 « autre BU » (lot D2 02/10, décision Louis 02/10 QCM) — le TRANSFERT RÉEL
 * d'une mission vers une autre business unit de NOTRE espace.
 *
 * Ce que ça fait : `missions.business_unit_id` (migration `1796421837419`) prend
 * la BU cible — la mission change de BU propriétaire. Ce que ça ne fait PAS :
 * ne touche ni le compte, ni ses autres missions, ni les BU du CLIENT
 * (`account_entities` — un autre objet).
 *
 * Source : la BU propre de la mission, sinon celle de son compte (la mission la
 * suivait), sinon AUCUNE — « pas de BU » se nomme dans le journal par un champ
 * vide, jamais par une BU devinée.
 *
 * Journal : `record_field_audit` via `ProvenanceService.commit` (passé par le contrôleur) (append-only :
 * qui, quand, BU source → BU cible, en NOMS — la ligne reste lisible si une BU
 * est renommée ensuite). C'est le journal que l'onglet « Historique » de la fiche
 * mission lit déjà : aucun second tableau de suivi. On archive, on ne supprime
 * pas — rien ici n'efface une ligne.
 */
/** Le journal est PASSÉ par l'appelant (le contrôleur, qui orchestre — GA-07 : un
 *  service n'importe pas le service d'un voisin). Il reçoit le changement et
 *  l'écrit dans `record_field_audit` ; s'il échoue, le transfert est annulé. */
type MissionTransferJournal = (change: { field: string; oldValue: string | null; newValue: string }) => Promise<void>

@Injectable()
export class MissionBusinessUnitService {
  constructor(
    @InjectRepository(MissionEntity) private readonly missions: Repository<MissionEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(BusinessUnitEntity) private readonly businessUnits: Repository<BusinessUnitEntity>,
  ) {}

  /** La BU propriétaire courante, NOMMÉE — pour la ligne de la fiche. */
  async current(
    workspaceId: string,
    missionId: string,
  ): Promise<{ businessUnit: { id: string; name: string } | null; inherited: boolean }> {
    const mission = await this.missions.findOne({ where: { id: missionId, workspace_id: workspaceId } })
    if (!mission) throw new NotFoundException('mission_not_found')
    const id = await this.owningBusinessUnitId(workspaceId, mission)
    const unit = id ? await this.businessUnits.findOne({ where: { id, workspace_id: workspaceId } }) : null
    return {
      businessUnit: unit ? { id: unit.id, name: unit.name } : null,
      inherited: mission.business_unit_id === null,
    }
  }

  async transfer(
    workspaceId: string,
    userId: string,
    missionId: string,
    input: MissionBusinessUnitTransferInput,
    journal: MissionTransferJournal,
  ): Promise<MissionBusinessUnitTransferResult> {
    const mission = await this.missions.findOne({ where: { id: missionId, workspace_id: workspaceId } })
    if (!mission) throw new NotFoundException('mission_not_found')

    // 404 hors espace (jamais « interdit » : ce serait confirmer que la BU existe ailleurs).
    const target = await this.businessUnits.findOne({
      where: { id: input.targetBusinessUnitId, workspace_id: workspaceId },
    })
    if (!target) throw new NotFoundException('business_unit_not_found')
    if (target.status !== 'active') throw new BadRequestException('business_unit_archived')

    const sourceId = await this.owningBusinessUnitId(workspaceId, mission)
    if (sourceId === target.id) throw new ConflictException('mission_already_in_business_unit')
    const source = sourceId
      ? await this.businessUnits.findOne({ where: { id: sourceId, workspace_id: workspaceId } })
      : null
    const sourceName = source?.name ?? null

    await this.missions.update({ id: mission.id, workspace_id: workspaceId }, { business_unit_id: target.id })
    try {
      await journal({ field: 'business_unit_id', oldValue: sourceName, newValue: target.name })
    } catch (error) {
      // Un transfert qu'on ne sait pas journaliser n'a pas eu lieu.
      await this.missions.update(
        { id: mission.id, workspace_id: workspaceId },
        { business_unit_id: mission.business_unit_id },
      )
      throw error
    }

    return {
      missionId: mission.id,
      from: sourceId && sourceName ? { id: sourceId, name: sourceName } : null,
      to: { id: target.id, name: target.name },
    }
  }

  private async owningBusinessUnitId(workspaceId: string, mission: MissionEntity): Promise<string | null> {
    if (mission.business_unit_id) return mission.business_unit_id
    const account = await this.accounts.findOne({ where: { id: mission.account_id, workspace_id: workspaceId } })
    return account?.business_unit_id ?? null
  }
}
