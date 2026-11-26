import { Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import {
  decisionRoleSchema,
  deriveAccountStrategy5P,
  parseAccountAnalysis,
  type AccountStrategy5P,
  type AccountStrategy5PContactInput,
  type AccountStrategy5PMissionInput,
  type AccountStrategy5PPartnerInput,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { AccountPartnerEntity } from '../../database/entities/account-partner.entity'
import { MissionEntity } from '../../database/entities/mission.entity'

/**
 * BEL-SC-225 (#3254, P0) — LA MAISON CANONIQUE DE `AccountStrategy5P`.
 *
 * Le SEUL point qui lit `raw_analysis` et les contacts pour produire la
 * projection 5P — Laura, Analyser, Contacts, Plans d'action et Pilotage
 * appelleront CE service, jamais une lecture locale (doctrine du ticket :
 * « aucune copie locale dans Laura ou Découvrir »). Il n'écrit RIEN : comme
 * `AccountIntelligenceContextService`, c'est une façade de LECTURE — la
 * retirer ne casse rien d'autre.
 *
 * `workspaceId` filtre la requête elle-même (`where: { id, workspace_id }`),
 * jamais une vérification préalable qu'on pourrait oublier d'appeler — même
 * discipline que `AccountIntelligenceContextService.contextFor`.
 */
@Injectable()
export class AccountStrategy5PService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity)
    private readonly contactsRepo: Repository<ContactEntity>,
    /** #3277.6/.7 — la source de P4 (REX, consultant) et P5 (client existant,
     *  consultants) : les missions DÉJÀ menées chez ce compte. `@Optional()` :
     *  sans elle, ces champs restent `missing`, jamais devinés. */
    @Optional()
    @InjectRepository(MissionEntity)
    private readonly missionsRepo?: Repository<MissionEntity>,
    /** #3277.7 — les ESN détectées SUR ce compte (`partner`, `rank_2`). Même
     *  discipline `@Optional()` : sans elle, ces voies restent `missing`. */
    @Optional()
    @InjectRepository(AccountPartnerEntity)
    private readonly partnersRepo?: Repository<AccountPartnerEntity>,
  ) {}

  async strategyFor(accountId: string, workspaceId: string): Promise<AccountStrategy5P | null> {
    const account = await this.accounts.findOne({ where: { id: accountId, workspace_id: workspaceId } })
    if (!account) return null

    const contactRows = await this.contactsRepo.find({ where: { account_id: accountId, deleted_at: IsNull() } })
    const contacts: AccountStrategy5PContactInput[] = contactRows.map(contact => ({
      id: contact.id,
      full_name: contact.full_name,
      title: contact.title,
      // Un `decision_role` en base peut porter une valeur LEGACY (voir le
      // commentaire de `decisionRoleSchema`, contact.ts) — `safeParse` plutôt
      // qu'un cast : un contrat non vérifiable ne se devine pas (doctrine).
      decision_role: decisionRoleSchema.safeParse(contact.decision_role).data ?? null,
    }))

    return deriveAccountStrategy5P({
      accountId,
      analysis: parseAccountAnalysis(account.raw_analysis),
      contacts,
      missions: await this.missionsOf(accountId, workspaceId),
      partners: await this.partnersOf(accountId, workspaceId),
    })
  }

  /** Les ESN du compte non écartées — un écart humain gagne toujours. */
  private async partnersOf(accountId: string, workspaceId: string): Promise<AccountStrategy5PPartnerInput[]> {
    if (!this.partnersRepo) return []
    const rows = await this.partnersRepo.find({
      where: { workspace_id: workspaceId, account_id: accountId, dismissed_at: IsNull() },
      take: 100,
    })
    return (rows ?? []).map(row => ({
      id: row.id,
      scope: row.scope,
      name: row.name,
      rank: row.rank,
      relationship: row.relationship,
      source: row.source,
      placements: row.placements,
      // #3667.R1 — la même colonne de fraîcheur que l'onglet Accès lit déjà
      // (`account-access.service.ts`) pour les mêmes lignes `account_partners`.
      detectedAt: row.detected_at ? row.detected_at.toISOString() : null,
    }))
  }

  /** Les missions du compte + leurs consultants affectés : DEUX requêtes au
   *  plus, et une seule quand le compte n'a aucune mission. */
  private async missionsOf(accountId: string, workspaceId: string): Promise<AccountStrategy5PMissionInput[]> {
    if (!this.missionsRepo) return []
    const rows = await this.missionsRepo.find({
      where: { workspace_id: workspaceId, account_id: accountId },
      order: { created_at: 'DESC' },
      take: 200,
    })
    if (!rows?.length) return []
    const assignments = await this.missionsRepo.manager.query<{ mission_id: string; full_name: string }[]>(
      `SELECT ma.mission_id, c.full_name
         FROM mission_assignments ma
         JOIN consultants c ON c.id = ma.consultant_id
        WHERE ma.mission_id = ANY($1::uuid[])`,
      [rows.map(row => row.id)],
    )
    const byMission = new Map<string, string[]>()
    for (const row of assignments ?? []) {
      byMission.set(row.mission_id, [...(byMission.get(row.mission_id) ?? []), row.full_name])
    }
    return rows.map(row => ({ label: row.label, status: row.status, consultants: byMission.get(row.id) ?? [] }))
  }
}
