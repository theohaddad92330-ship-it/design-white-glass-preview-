import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CrmDealFactEntity } from '../../database/entities/crm-deal-fact.entity'
import { MissionEntity } from '../../database/entities/mission.entity'

/** Un deal candidat à devenir une mission — champ par champ, jamais un résumé. */
type CrmReprisalCandidateDeal = {
  dealId: string
  name: string | null
  stage: string | null
  stageLabel: string | null
  amount: string | null
  isClosed: boolean
  isWon: boolean | null
}

type CrmReprisalCandidates = {
  available: boolean
  /** L'identifiant technique SEUL (`'hubspot'`…) — jamais un nom : c'est
   *  `clientToolName` qui le résout à l'écran. */
  provider: string | null
  deals: CrmReprisalCandidateDeal[]
}

const NONE: CrmReprisalCandidates = { available: false, provider: null, deals: [] }

/**
 * #2562 — la reprise des missions depuis l'outil CRM connecté est PROPOSÉE,
 * jamais silencieuse (retour CLIENT de François Thomas, call bêta du
 * 17/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROPOSITION, PAS IMPORT
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce service ne CRÉE rien. Il répond à une seule question — « y a-t-il quelque
 * chose à proposer ? » — et rend la PRÉVISUALISATION, champ par champ, de ce
 * qui deviendrait une mission. L'écriture elle-même passe par le geste
 * ORDINAIRE de création de mission (`DeliveryService.create`, `crmDealId`
 * facultatif) : c'est la personne, en revoyant CE que ce service a montré, qui
 * clique — le clic EST la décision, comme pour toute création de mission.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DEUX CONDITIONS, PAS UNE
 * ─────────────────────────────────────────────────────────────────────────────
 * `crm_deal_facts` est un CACHE (migration `1788900000001`) : il survit à une
 * déconnexion, et sa présence seule ne dit pas « un CRM est connecté
 * MAINTENANT ». Le proposer à un espace qui a DÉJÀ des missions rejouerait la
 * même proposition à chaque ouverture d'écran, pour un geste déjà fait. La
 * proposition n'a donc de sens que sur l'INTERSECTION : zéro mission encore
 * créée, et au moins un deal dont on peut proposer la reprise. Le compte de
 * missions est vérifié EN PREMIER, avant toute lecture du cache CRM — un
 * espace déjà peuplé n'a aucune raison de voir sa fiche CRM relue.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST JAMAIS PROPOSÉ
 * ─────────────────────────────────────────────────────────────────────────────
 *  - un deal explicitement PERDU (`is_closed && is_won === false`) : il ne
 *    deviendra jamais une mission, le proposer serait du bruit ;
 *  - des deals venus de PLUSIEURS fournisseurs à la fois : cas théorique
 *    aujourd'hui (une seule connexion CRM par espace), mais s'il survenait,
 *    choisir LEQUEL proposer serait deviner — la doctrine du dépôt le refuse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE SERVICE NE RÉSOUT PAS — ET POURQUOI CE N'EST PAS ICI QU'IL FAUT LE FAIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * `crm_deal_facts` ne porte AUCUNE association avec une entreprise/un compte
 * (vérifié : ni `HubspotDepthClient.readDealHistory`, ni le schéma de la table
 * ne lisent/portent d'identifiant de société). Rattacher un deal à un compte
 * Bellum EXIGE donc un geste humain — c'est le rôle du formulaire de création
 * de mission, où le compte est choisi, jamais deviné depuis un nom de deal.
 */
@Injectable()
export class MissionCrmReprisalService {
  constructor(
    @InjectRepository(MissionEntity) private readonly missions: Repository<MissionEntity>,
    @InjectRepository(CrmDealFactEntity) private readonly facts: Repository<CrmDealFactEntity>,
  ) {}

  /**
   * GA-07 — l'espace actif se résout DANS LE CONTRÔLEUR, pas ici. Ce service
   * importait `WorkspaceContextService` pour un seul appel
   * (`resolveActiveWorkspace`) : un import de service à service, exactement ce
   * que la garde des frontières de modules refuse de voir augmenter. Le geste
   * utilisateur vit dans le contrôleur, donc la résolution aussi ; ce service
   * ne connaît plus qu'un `workspaceId` déjà tranché.
   */
  async candidates(workspaceId: string): Promise<CrmReprisalCandidates> {
    const missionCount = await this.missions.count({ where: { workspace_id: workspaceId } })
    if (missionCount > 0) return NONE

    const rows = await this.facts.find({ where: { workspace_id: workspaceId }, take: 200 })
    if (rows.length === 0) return NONE

    const providers = new Set(rows.map(row => row.provider))
    if (providers.size > 1) return NONE
    const [provider] = providers

    const deals = rows
      // Un deal explicitement PERDU ne deviendra jamais une mission.
      .filter(row => !(row.is_closed && row.is_won === false))
      .slice(0, 50)
      .map(row => ({
        dealId: row.deal_id,
        name: row.name,
        stage: row.stage,
        stageLabel: row.stage_label,
        amount: row.amount,
        isClosed: row.is_closed,
        isWon: row.is_won,
      }))
    if (deals.length === 0) return NONE

    return { available: true, provider: provider ?? null, deals }
  }
}
