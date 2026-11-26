import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { CreateLegalEntity, LegalEntity, UpdateLegalEntity } from '@bellum/contracts'
import { LegalEntityEntity } from '../../database/entities/legal-entity.entity'

/**
 * Les sociétés d'une ESN, dans un même espace (décision D9).
 *
 * Le service ne fait que tenir le registre et le rattachement. Il ne touche ni
 * aux crédits, ni aux sièges, ni à l'abonnement : Bellum reste facturé une fois
 * à l'espace. Découper ça par société aurait été un autre produit, et surtout
 * le risque de casser le calcul des quotas de tous les clients existants pour
 * un besoin que personne n'a encore formulé.
 *
 * Il reçoit l'espace en PARAMÈTRE et ne le résout pas lui-même : la règle §3.2
 * veut qu'un service n'aille pas chercher le service d'un autre module, et le
 * contrôleur est la couche qui connaît l'appelant. Les droits sont posés au
 * même endroit, par le décorateur de permission.
 */
@Injectable()
export class LegalEntitiesService {
  constructor(
    @InjectRepository(LegalEntityEntity)
    private readonly entities: Repository<LegalEntityEntity>,
  ) {}

  /** Toutes les sociétés de l'espace, archivées comprises — c'est l'écran qui
   *  décide de les montrer, pas la lecture qui décide de les cacher. */
  async list(workspaceId: string): Promise<{ items: LegalEntity[] }> {
    const rows = await this.entities.find({
      where: { workspace_id: workspaceId },
      order: { archived: 'ASC', name: 'ASC' },
    })
    return { items: rows.map(toWire) }
  }

  async create(workspaceId: string, input: CreateLegalEntity): Promise<LegalEntity> {
    const name = input.name.trim()
    const clash = await this.entities
      .createQueryBuilder('entity')
      .where('entity.workspace_id = :workspaceId', { workspaceId })
      .andWhere('lower(entity.name) = lower(:name)', { name })
      .getOne()
    // Deux sociétés du même nom rendraient tout sélecteur illisible, et le
    // rattachement d'une mission deviendrait un tirage au sort.
    if (clash) throw new BadRequestException('Une société de ce nom existe déjà dans cet espace.')

    const saved = await this.entities.save(
      this.entities.create({
        workspace_id: workspaceId,
        name,
        registration_number: input.registration_number?.trim() || null,
        country: input.country?.trim().toUpperCase() || null,
        vat_number: input.vat_number?.trim() || null,
        address: input.address?.trim() || null,
        currency: input.currency?.trim().toUpperCase() || null,
        archived: false,
      }),
    )
    return toWire(saved)
  }

  async update(workspaceId: string, id: string, input: UpdateLegalEntity): Promise<LegalEntity> {
    const entity = await this.entities.findOne({ where: { id, workspace_id: workspaceId } })
    if (!entity) throw new NotFoundException('Société introuvable dans cet espace.')

    // Patch PRESENT-ONLY : un champ absent du corps n'est pas un champ à vider.
    // C'est la même règle que partout ailleurs — un blanc n'écrase jamais.
    if (input.name !== undefined) entity.name = input.name.trim()
    if (input.registration_number !== undefined) {
      entity.registration_number = input.registration_number?.trim() || null
    }
    if (input.country !== undefined) entity.country = input.country?.trim().toUpperCase() || null
    if (input.vat_number !== undefined) entity.vat_number = input.vat_number?.trim() || null
    if (input.address !== undefined) entity.address = input.address?.trim() || null
    if (input.currency !== undefined) entity.currency = input.currency?.trim().toUpperCase() || null

    return toWire(await this.entities.save(entity))
  }

  /**
   * Archiver, jamais supprimer.
   *
   * Une société a porté des missions et des mois facturés. La supprimer
   * détacherait ses missions (`ON DELETE SET NULL`) et rendrait illisible
   * l'historique qui la nomme — on ne saurait plus qui a facturé quoi.
   */
  async archive(workspaceId: string, id: string, archived: boolean): Promise<LegalEntity> {
    const entity = await this.entities.findOne({ where: { id, workspace_id: workspaceId } })
    if (!entity) throw new NotFoundException('Société introuvable dans cet espace.')

    entity.archived = archived
    return toWire(await this.entities.save(entity))
  }
}

function toWire(row: LegalEntityEntity): LegalEntity {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    name: row.name,
    registration_number: row.registration_number,
    country: row.country,
    vat_number: row.vat_number,
    address: row.address,
    currency: row.currency,
    archived: row.archived,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }
}
