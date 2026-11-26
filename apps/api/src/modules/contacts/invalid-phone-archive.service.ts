import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Not, Repository } from 'typeorm'
import { isPlausiblePhoneNumber } from '@bellum/contracts'
import { ContactEntity } from '../../database/entities/contact.entity'
import { killSwitchCut } from '../../common/kill-switches'

const DEFAULT_LIMIT = 200

export type InvalidPhoneArchiveOutcome = {
  scanned: number
  archived: number
  skipped: number
  cut: boolean
}

/**
 * #3850.1 (lot V04, 08/10) — LE RATTRAPAGE DES TÉLÉPHONES DÉJÀ EN BASE QUI
 * N'ONT PAS LA FORME D'UN NUMÉRO.
 *
 * Mesuré en prod le 08/10 : un code postal brésilien « 90480-000 » a été
 * ENREGISTRÉ comme téléphone sur une fiche réelle (Romali Mondal), AVANT que
 * la garde d'écriture (`isPlausiblePhoneNumber`, `contacts.service.ts` et
 * jumeaux) n'existe. Un correctif de collecte RATTRAPE l'existant : ciblé
 * (jamais tout le parc), par segment — ici, les contacts dont le téléphone
 * actuel échoue la même garde que celle qui empêche désormais l'écriture.
 *
 * Même doctrine que `ContactReachabilityCatchupService` (#3549) :
 *  - **JAMAIS automatique** : aucun `onApplicationBootstrap`, aucun `@Cron`.
 *    Seul un appel EXPLICITE d'opérateur atteint `runArchive`, et
 *    l'interrupteur `contacts.invalid_phone_archive` coupe même cet appel ;
 *  - **on ARCHIVE, on ne supprime pas** : la valeur part dans
 *    `enrichment_archive` (même colonne que la rétention RGPD #2297.51,
 *    `select: false` — jamais relue par un `find` ordinaire), `phone`
 *    redevient NULL — inconnu, jamais « 0 » ;
 *  - **une correction humaine gagne toujours** : l'écriture est
 *    CONDITIONNELLE (`WHERE phone = <valeur lue>`) — si une main a corrigé le
 *    numéro entre la lecture et le geste, la correction tient et la ligne
 *    est simplement comptée `skipped`, jamais écrasée.
 */
@Injectable()
export class InvalidPhoneArchiveService {
  private readonly logger = new Logger(InvalidPhoneArchiveService.name)

  constructor(@InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>) {}

  /** Les contacts CONCERNÉS — lecture seule, borné par `limit`. */
  async listConcerned(limit = DEFAULT_LIMIT): Promise<ContactEntity[]> {
    const rows = await this.contacts.find({
      where: { phone: Not(IsNull()), deleted_at: IsNull() },
      select: ['id', 'phone', 'phone_confidence', 'phone_cost_credits'],
      order: { created_at: 'ASC' },
      take: limit,
    })
    return rows.filter(row => Boolean(row.phone) && !isPlausiblePhoneNumber(row.phone as string))
  }

  /**
   * L'archivage lui-même. `operatorUserId` ne sert qu'à la TRACE (journal),
   * jamais à borner la requête — un téléphone invalide n'appartient à
   * personne en particulier.
   */
  async runArchive(operatorUserId: string, limit = DEFAULT_LIMIT): Promise<InvalidPhoneArchiveOutcome> {
    if (killSwitchCut('contacts.invalid_phone_archive')) {
      this.logger.log('Archivage des téléphones invalides coupé par interrupteur — rien exécuté', { operatorUserId })
      return { scanned: 0, archived: 0, skipped: 0, cut: true }
    }

    const rows = await this.listConcerned(limit)
    let archived = 0
    let skipped = 0
    for (const row of rows) {
      try {
        const result = await this.contacts
          .createQueryBuilder()
          .update(ContactEntity)
          .set({
            enrichment_archive: () => `COALESCE(enrichment_archive, '{}'::jsonb) || CAST(:archivePatch AS jsonb)`,
            phone: null,
            phone_confidence: null,
            phone_cost_credits: null,
            enrichment_archived_at: new Date(),
          })
          // Conditionnelle : n'archive QUE la valeur encore en base au moment
          // du geste — une correction humaine posée entre la lecture et
          // l'écriture n'est jamais écrasée.
          .where('id = :id', { id: row.id })
          .andWhere('phone = :phone', { phone: row.phone })
          .setParameter(
            'archivePatch',
            JSON.stringify({
              phone: row.phone,
              phone_confidence: row.phone_confidence ?? null,
              phone_cost_credits: row.phone_cost_credits ?? null,
            }),
          )
          .execute()
        if (result.affected) archived += 1
        else skipped += 1
      } catch (error) {
        // Une panne sur CE contact ne dit rien des autres : comptée, jamais avalée.
        skipped += 1
        this.logger.warn('Archivage téléphone invalide : écriture échouée', { contactId: row.id, error })
      }
    }
    this.logger.log('Archivage des téléphones invalides terminé', {
      operatorUserId,
      scanned: rows.length,
      archived,
      skipped,
    })
    return { scanned: rows.length, archived, skipped, cut: false }
  }
}
