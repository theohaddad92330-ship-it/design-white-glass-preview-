import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import {
  type BusinessUnitAccess,
  type BusinessUnitList,
  type BusinessUnitView,
  type CreateBusinessUnit,
  type SetMemberBusinessUnitAccess,
  type UpdateBusinessUnit,
  businessUnitScopeFor,
  effectiveBusinessUnitAccess,
  resolveWorkspaceRuleValues,
} from '@bellum/contracts'
import {
  BusinessUnitAccessRequestEntity,
  BusinessUnitEntity,
  BusinessUnitMemberEntity,
} from '../../database/entities/business-unit.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { WorkspaceRulesEntity } from '../../database/entities/workspace-rules.entity'

/**
 * La portée BU d'un membre — ce que la requête reçoit.
 *
 * `null` = tout l'espace, le défaut historique. La forme est délibérément la
 * même que celle de `portfolioScopeFor` : deux cloisonnements de nature
 * différente, une seule grammaire, et un appelant qui ne peut pas confondre.
 */
type BusinessUnitScope = ReturnType<typeof businessUnitScopeFor>

/**
 * La couche BU / agence — le périmètre de travail d'un espace.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ LA RÈGLE QUI TIENT TOUT LE RESTE
 * ─────────────────────────────────────────────────────────────────────────────
 * **Aucune lecture de ce service ne perd son `workspace_id`.** C'est le risque
 * n°1 du chantier, écrit noir sur blanc au brief : une jointure ajoutée qui
 * REMPLACE un `WHERE workspace_id = …` par un `WHERE business_unit_id = …`
 * ouvrirait l'espace entier — et l'écran aurait l'air juste, parce qu'il
 * montrerait des BU.
 *
 * Le cas concret, qui n'est pas théorique : une personne membre de l'agence
 * Lyon dans l'espace A et cloisonnée dans l'espace B. Lire ses appartenances
 * par `user_id` SEUL ferait entrer l'identifiant de l'agence Lyon dans le filtre
 * de l'espace B. Le filtre serait « juste », et il pointerait vers un autre
 * client. D'où : `{ workspace_id, user_id }` partout, jamais `{ user_id }`.
 * `business-unit-scope.spec.ts` le mesure et sait dire NON.
 */
@Injectable()
export class BusinessUnitService {
  constructor(
    @InjectRepository(BusinessUnitEntity)
    private readonly businessUnits: Repository<BusinessUnitEntity>,
    @InjectRepository(BusinessUnitMemberEntity)
    private readonly businessUnitMembers: Repository<BusinessUnitMemberEntity>,
    @InjectRepository(BusinessUnitAccessRequestEntity)
    private readonly accessRequests: Repository<BusinessUnitAccessRequestEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly workspaceMembers: Repository<WorkspaceMemberEntity>,
    // #2081.14 — les règles d'espace. REQUIS, pas `@Optional()` : sans elles,
    // « comptes d'une unité : privés » redeviendrait « tout l'espace » en
    // silence. Le dépôt, et non `WorkspaceContextService` (GA-07 : pas un
    // service d'un autre module) ; la lecture de la ligne reste UNE dérivation,
    // `resolveWorkspaceRuleValues` du contrat (GA-26).
    @InjectRepository(WorkspaceRulesEntity)
    private readonly workspaceRules: Repository<WorkspaceRulesEntity>,
  ) {}

  /**
   * LA règle d'accès, résolue une fois, au bord.
   *
   * ⚠️ Deux refus par défaut, tous les deux volontaires :
   *  · un `userId` ou un `workspaceId` vide fait lever, jamais « pas de
   *    filtre ». TypeORM IGNORE une condition `undefined` (`findOne({ where:
   *    { id: undefined } })` rend la PREMIÈRE ligne) : sans ce garde-fou, un
   *    identifiant perdu en route rendrait `null`, c'est-à-dire l'espace entier ;
   *  · un membre INTROUVABLE dans l'espace est cloisonné à rien, pas ouvert à
   *    tout. Il n'est pas de cet espace ; il n'y voit donc rien, sauf ce que
   *    personne ne porte.
   */
  async scopeFor(workspaceId: string, userId: string): Promise<BusinessUnitScope> {
    if (!workspaceId || !userId) {
      throw new BadRequestException('business_unit_scope_requires_workspace_and_user')
    }

    const access = await this.effectiveAccessOf(workspaceId, userId)

    if (access === 'workspace') return businessUnitScopeFor('workspace', [])

    return businessUnitScopeFor(access, await this.perimetersOf(workspaceId, userId))
  }

  /**
   * #1918.2 — LES PÉRIMÈTRES QUE QUELQU'UN PORTE, et rien d'autre.
   *
   * ⚠️ APPARTENANCE, pas ACCÈS — et la nuance est tout l'intérêt de la mémoire
   * d'équipe. `scopeFor` répond à « quelles DONNÉES cette personne a-t-elle le
   * droit de voir », et rend `null` (tout l'espace) pour un membre en accès
   * `workspace`, qui est le DÉFAUT. Une mémoire « ma BU » branchée là-dessus
   * serait lue par la quasi-totalité de l'espace : la portée promettrait une
   * équipe et livrerait l'ESN entière.
   *
   * Cette lecture-ci répond à l'autre question — « de quelles équipes est-elle
   * MEMBRE » — et c'est celle qu'une portée d'équipe doit poser. Elle rend une
   * liste, éventuellement vide : ne porter aucun périmètre est une réponse, pas
   * une absence de réponse.
   *
   * ⚠️ Les DEUX colonnes. `user_id` seul ferait entrer les périmètres d'un
   * AUTRE espace dans ce filtre-ci.
   */
  async perimetersOf(workspaceId: string, userId: string): Promise<string[]> {
    if (!workspaceId || !userId) {
      throw new BadRequestException('business_unit_scope_requires_workspace_and_user')
    }
    const owned = await this.businessUnitMembers.find({
      where: { workspace_id: workspaceId, user_id: userId },
      select: { business_unit_id: true },
    })
    return owned.map(row => row.business_unit_id)
  }

  /**
   * #2259.30 / #2259.32 / #2259.33 / #2259.34 / #2259.35 — LES FICHES DES BU
   * PORTÉES, pour le contexte envoyé à Laura (DÉCISION Louis 17/09
   * après-midi : la BU est un CONTEXTE pour prioriser et formuler, jamais un
   * FILTRE de ce que Laura voit ailleurs).
   *
   * ⚠️ MÊME RÈGLE QUE PARTOUT DANS CE FICHIER (voir le docblock de tête) :
   * `workspace_id` ET la liste d'ids, jamais l'id seul — sinon un identifiant
   * de BU d'un AUTRE espace rendrait sa fiche. `business-unit-scope.spec.ts`
   * le mesure et sait dire NON.
   *
   * `[]` en entrée ou `workspaceId` vide ⇒ `[]` en sortie, aucune lecture :
   * `In([])` lève côté TypeORM, et un espace vide n'est jamais « pas de
   * filtre » (même discipline que `scopeFor`/`perimetersOf` ci-dessus).
   */
  async findByIds(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<
    Array<{
      id: string
      name: string
      territory: string | null
      specialties: string[]
      teamSize: number | null
      consultantCount: number | null
      capacityAvailableConsultants: number | null
      quarterObjective: string | null
    }>
  > {
    if (!workspaceId || !ids.length) return []
    const units = await this.businessUnits.find({
      where: { workspace_id: workspaceId, id: In([...ids]) },
    })
    return units.map(unit => ({
      id: unit.id,
      name: unit.name,
      territory: unit.territory,
      specialties: unit.specialties,
      // #3384.1 — la couche BU déclarée par le responsable (équipe + vivier) :
      // `null` = non renseigné, jamais 0 (voir `BusinessUnitEntity`).
      teamSize: unit.team_size ?? null,
      consultantCount: unit.consultant_count ?? null,
      capacityAvailableConsultants: unit.capacity_available_consultants ?? null,
      quarterObjective: unit.quarter_objective ?? null,
    }))
  }

  /**
   * Le niveau d'accès de l'appelant, pour que l'écran le NOMME (#2081.21) —
   * celui qui S'APPLIQUE, règle d'espace comprise (#2081.14) : afficher
   * « tout l'espace » à quelqu'un que la règle tient dans ses unités serait
   * annoncer un accès qu'il n'a pas.
   */
  async accessOf(workspaceId: string, userId: string): Promise<BusinessUnitAccess> {
    if (!workspaceId || !userId) {
      throw new BadRequestException('business_unit_scope_requires_workspace_and_user')
    }
    return this.effectiveAccessOf(workspaceId, userId)
  }

  /**
   * #2081.14 — LE NIVEAU QUI S'APPLIQUE : le réglage individuel, puis la règle
   * d'espace qui PRIME sur lui (DÉCISION Louis 19/09/2026). Une seule
   * dérivation pour `scopeFor` (les données), `accessOf` (l'écran) et `join`
   * (la porte) — trois lectures divergentes laisseraient l'une rouvrir ce que
   * les deux autres ferment.
   *
   * Pas membre de CET espace : cloisonné, jamais ouvert — et jamais exempté
   * par la règle (aucun rôle lu).
   */
  private async effectiveAccessOf(workspaceId: string, userId: string): Promise<BusinessUnitAccess> {
    const membership = await this.workspaceMembers.findOne({
      where: { workspace_id: workspaceId, user_id: userId },
    })
    const individual: BusinessUnitAccess = membership
      ? (membership.business_unit_access ?? 'workspace')
      : 'business_unit'
    if (individual === 'business_unit') return individual
    // ⚠️ Aucun repli sur erreur : une règle qui ferme, remplacée par son défaut
    // sur une panne de base, ROUVRIRAIT les unités. L'erreur remonte.
    const rules = resolveWorkspaceRuleValues(
      await this.workspaceRules.findOne({ where: { workspace_id: workspaceId } }),
    )
    return effectiveBusinessUnitAccess(individual, membership?.role ?? null, rules.businessUnitAccountsVisibility)
  }

  /**
   * Les périmètres de l'espace, en cartes (#2087.14).
   *
   * Tout le monde VOIT la liste des périmètres, y compris ceux qu'il ne porte
   * pas — sinon « Demander l'accès » (#2087.16) n'aurait aucun sens : on ne
   * demande pas l'accès à ce qu'on ne peut pas nommer. Ce qui est cloisonné,
   * ce sont les DONNÉES d'un périmètre, pas son existence.
   */
  async list(workspaceId: string, userId: string): Promise<BusinessUnitList> {
    if (!workspaceId) throw new BadRequestException('business_unit_scope_requires_workspace_and_user')

    const units = await this.businessUnits.find({
      where: { workspace_id: workspaceId },
      order: { name: 'ASC' },
    })
    const unitIds = units.map(unit => unit.id)

    const [members, requests] = await Promise.all([
      unitIds.length
        ? this.businessUnitMembers.find({ where: { workspace_id: workspaceId, business_unit_id: In(unitIds) } })
        : Promise.resolve([]),
      unitIds.length
        ? this.accessRequests.find({
            where: { workspace_id: workspaceId, business_unit_id: In(unitIds), user_id: userId },
          })
        : Promise.resolve([]),
    ])

    const memberCounts = new Map<string, number>()
    const viewerUnits = new Set<string>()
    for (const member of members) {
      memberCounts.set(member.business_unit_id, (memberCounts.get(member.business_unit_id) ?? 0) + 1)
      if (member.user_id === userId) viewerUnits.add(member.business_unit_id)
    }
    const viewerRequests = new Map(requests.map(request => [request.business_unit_id, request.status]))

    return {
      businessUnits: units.map(unit => this.toView(unit, memberCounts, viewerUnits, viewerRequests)),
      viewerAccess: await this.accessOf(workspaceId, userId),
    }
  }

  private toView(
    unit: BusinessUnitEntity,
    memberCounts: Map<string, number>,
    viewerUnits: Set<string>,
    viewerRequests: Map<string, BusinessUnitAccessRequestEntity['status']>,
  ): BusinessUnitView {
    return {
      id: unit.id,
      name: unit.name,
      kind: unit.kind,
      territory: unit.territory ?? null,
      specialties: unit.specialties ?? [],
      // ⚠️ `?? null`, jamais `?? 0` : un effectif non renseigné n'est pas un
      // effectif nul, et l'écran doit pouvoir dire « non renseigné ».
      consultantCount: unit.consultant_count ?? null,
      teamSize: unit.team_size ?? null,
      leadUserId: unit.lead_user_id ?? null,
      portfolioNote: unit.portfolio_note ?? null,
      // #2005.5 (DÉCISION Louis 17/09, lot CP2) — `?? null`, jamais `?? 0` :
      // même règle que `consultantCount`/`teamSize` ci-dessus.
      capacityAvailableConsultants: unit.capacity_available_consultants ?? null,
      quarterObjective: unit.quarter_objective ?? null,
      status: unit.status,
      memberCount: memberCounts.get(unit.id) ?? 0,
      viewerIsMember: viewerUnits.has(unit.id),
      viewerAccessRequestStatus: viewerRequests.get(unit.id) ?? null,
    }
  }

  /** « Créer un autre périmètre » (#2087.17). Le créateur en devient responsable. */
  async create(workspaceId: string, userId: string, input: CreateBusinessUnit): Promise<BusinessUnitView> {
    if (!workspaceId || !userId) throw new BadRequestException('business_unit_scope_requires_workspace_and_user')

    const clash = await this.businessUnits
      .createQueryBuilder('bu')
      .where('bu.workspace_id = :workspaceId', { workspaceId })
      .andWhere('lower(bu.name) = lower(:name)', { name: input.name })
      .getOne()
    if (clash) throw new BadRequestException('business_unit_name_already_used')

    const saved = await this.businessUnits.save(
      this.businessUnits.create({
        workspace_id: workspaceId,
        name: input.name,
        kind: input.kind,
        territory: input.territory ?? null,
        specialties: input.specialties ?? [],
        consultant_count: input.consultantCount ?? null,
        team_size: input.teamSize ?? null,
        lead_user_id: input.leadUserId ?? userId,
        portfolio_note: input.portfolioNote ?? null,
        // #2005.5 (DÉCISION Louis 17/09, lot CP2).
        capacity_available_consultants: input.capacityAvailableConsultants ?? null,
        quarter_objective: input.quarterObjective ?? null,
        status: 'active',
        created_by: userId,
      }),
    )
    await this.businessUnitMembers.save(
      this.businessUnitMembers.create({
        workspace_id: workspaceId,
        business_unit_id: saved.id,
        user_id: saved.lead_user_id ?? userId,
        membership: 'lead',
      }),
    )
    return this.toView(saved, new Map([[saved.id, 1]]), new Set([saved.id]), new Map())
  }

  async update(workspaceId: string, id: string, input: UpdateBusinessUnit): Promise<BusinessUnitView> {
    const unit = await this.findInWorkspace(workspaceId, id)
    if (input.name !== undefined) unit.name = input.name
    if (input.kind !== undefined) unit.kind = input.kind
    if (input.territory !== undefined) unit.territory = input.territory ?? null
    if (input.specialties !== undefined) unit.specialties = input.specialties
    if (input.consultantCount !== undefined) unit.consultant_count = input.consultantCount ?? null
    if (input.teamSize !== undefined) unit.team_size = input.teamSize ?? null
    if (input.leadUserId !== undefined) unit.lead_user_id = input.leadUserId ?? null
    if (input.portfolioNote !== undefined) unit.portfolio_note = input.portfolioNote ?? null
    // #2005.5 (DÉCISION Louis 17/09, lot CP2) — le geste du responsable de BU
    // dans les réglages des périmètres.
    if (input.capacityAvailableConsultants !== undefined)
      unit.capacity_available_consultants = input.capacityAvailableConsultants ?? null
    if (input.quarterObjective !== undefined) unit.quarter_objective = input.quarterObjective ?? null
    // On ARCHIVE, on ne supprime pas : une agence fermée a porté des comptes.
    if (input.status !== undefined) unit.status = input.status
    const saved = await this.businessUnits.save(unit)
    return this.toView(saved, new Map(), new Set(), new Map())
  }

  /**
   * « Rejoindre » (#2087.15). Rejoindre deux fois est un no-op, pas une erreur.
   *
   * ⚠️ `via` est l'INTENTION, et c'est elle qui décide de l'éligibilité :
   * `'self'` est le geste de l'utilisateur sur la route publique, `'granted'`
   * est le chemin interne ouvert par `decideAccessRequest`, c'est-à-dire par
   * quelqu'un qui porte `team:manage` et qui a tranché. Un PARAMÈTRE plutôt
   * qu'une seconde méthode : deux méthodes jumelles divergent le jour où l'une
   * seule est corrigée, et c'est la porte qu'on rouvrirait.
   */
  async join(workspaceId: string, id: string, userId: string, via: 'self' | 'granted' = 'self'): Promise<void> {
    await this.findInWorkspace(workspaceId, id)
    const existing = await this.businessUnitMembers.findOne({
      where: { workspace_id: workspaceId, business_unit_id: id, user_id: userId },
    })
    // Déjà dans le périmètre : rien à élever, donc rien à refuser. Le contrôle
    // vient APRÈS, sinon « rejoindre deux fois » deviendrait une erreur.
    if (existing) return

    // ⚠️ Un membre cloisonné ne rejoint pas une BU par POST — revue sécurité
    // 15/09/2026. Sans ce refus, tout le circuit demande / accord / refus est
    // DÉCORATIF : la liste nomme toutes les BU de l'espace (par conception,
    // sinon « demander l'accès » n'aurait pas de sens), et il suffisait d'un
    // `POST /:id/join` sur la route voisine pour lire le portefeuille d'une
    // autre agence de la même ESN. Le refus NOMME la porte à emprunter, et rien
    // de ce qu'il y a derrière : ni effectif, ni nombre de comptes, ni
    // responsable — une énumération serait un second défaut.
    //
    // Une demande déjà `granted` n'ouvre PAS de dérogation ici : `granted` fait
    // entrer la personne au moment de l'accord (`decideAccessRequest`, chemin
    // `'granted'`). La rejouer plus tard défairait un retrait décidé depuis —
    // et une correction humaine gagne toujours.
    if (via === 'self' && (await this.accessOf(workspaceId, userId)) === 'business_unit') {
      throw new ForbiddenException('business_unit_join_requires_access_request')
    }

    await this.businessUnitMembers.save(
      this.businessUnitMembers.create({
        workspace_id: workspaceId,
        business_unit_id: id,
        user_id: userId,
        membership: 'member',
      }),
    )
  }

  /** « Demander l'accès » (#2087.16) — une demande, pas une adhésion. */
  async requestAccess(workspaceId: string, id: string, userId: string, message: string | null): Promise<void> {
    await this.findInWorkspace(workspaceId, id)
    const pending = await this.accessRequests.findOne({
      where: { workspace_id: workspaceId, business_unit_id: id, user_id: userId, status: 'pending' },
    })
    if (pending) return
    await this.accessRequests.save(
      this.accessRequests.create({
        workspace_id: workspaceId,
        business_unit_id: id,
        user_id: userId,
        status: 'pending',
        message,
      }),
    )
  }

  /**
   * La réponse à une demande. `granted` fait ENTRER la personne dans le
   * périmètre : sans cela, la demande serait un formulaire sans effet — le
   * défaut n°1 de ce dépôt, « du code juste que personne n'appelle ».
   */
  async decideAccessRequest(
    workspaceId: string,
    requestId: string,
    deciderUserId: string,
    granted: boolean,
  ): Promise<void> {
    const request = await this.accessRequests.findOne({ where: { workspace_id: workspaceId, id: requestId } })
    if (!request) throw new NotFoundException('business_unit_access_request_not_found')
    if (request.status !== 'pending') throw new BadRequestException('business_unit_access_request_already_decided')

    request.status = granted ? 'granted' : 'refused'
    request.decided_by = deciderUserId
    request.decided_at = new Date()
    await this.accessRequests.save(request)

    // `'granted'` : la SEULE entrée légitime d'un membre cloisonné dans un
    // périmètre qu'il ne porte pas. Elle passe par quelqu'un qui détient
    // `team:manage` et qui a tranché — c'est la décision, pas le POST.
    if (granted) await this.join(workspaceId, request.business_unit_id, request.user_id, 'granted')
  }

  /**
   * Le niveau d'accès d'un membre, et ses périmètres (#2005.7, #2081.19).
   *
   * ⚠️ `callerUserId` n'est PAS décoratif : sans lui, cette méthode ne pouvait
   * rien refuser — revue sécurité 15/09/2026. Deux refus, et les deux ont leur
   * test nommé dans `business-unit-scope.spec.ts`.
   */
  async setMemberAccess(
    workspaceId: string,
    callerUserId: string,
    targetUserId: string,
    input: SetMemberBusinessUnitAccess,
  ): Promise<void> {
    // Un identifiant perdu en route LÈVE, il ne devient pas « pas de contrôle ».
    if (!workspaceId || !callerUserId || !targetUserId) {
      throw new BadRequestException('business_unit_scope_requires_workspace_and_user')
    }

    // ⚠️ On ne règle pas SON PROPRE périmètre — revue sécurité 15/09/2026.
    // `team:manage` est porté par `owner`, `admin` ET `sales_ops` : sans ce
    // refus, un `sales_ops` cloisonné se posait `access: 'workspace'` et voyait
    // l'espace entier. C'est mot pour mot ce que le contrat voisin interdit
    // (`packages/contracts/src/schemas/business-unit.ts` — « AUCUN
    // contournement par le rôle » : qui doit tout voir se le fait ACCORDER).
    // Le refus tombe AVANT toute lecture : il ne confirme l'existence de rien.
    if (targetUserId === callerUserId) {
      throw new ForbiddenException('business_unit_access_self_change_forbidden')
    }

    const membership = await this.workspaceMembers.findOne({
      where: { workspace_id: workspaceId, user_id: targetUserId },
    })
    // Pas membre de CET espace : on ne lui règle rien. Le refus est la réponse,
    // pas une création silencieuse.
    if (!membership) throw new NotFoundException('workspace_member_not_found')

    // ⚠️ Le PROPRIÉTAIRE ne se fait pas cloisonner — revue sécurité 15/09/2026,
    // et c'est le précédent EXACT de `workspace-team.service.ts` (le
    // propriétaire ne peut être ni retiré, ni rétrogradé), repris ici plutôt
    // que réinventé. Sans ce refus, un `sales_ops` posait
    // `businessUnitIds: []` sur l'`owner`, qui ne voyait plus que les comptes
    // sans périmètre : l'aveuglement de la seule personne qui aurait pu défaire
    // l'attaque.
    if (membership.role === 'owner') {
      throw new ForbiddenException('business_unit_access_owner_forbidden')
    }

    if (input.businessUnitIds.length) {
      // ⚠️ Les périmètres nommés doivent appartenir à CET espace. Sans cette
      // vérification, un identifiant d'une autre ESN entrerait dans le filtre.
      const found = await this.businessUnits.find({
        where: { workspace_id: workspaceId, id: In(input.businessUnitIds) },
        select: { id: true },
      })
      if (found.length !== input.businessUnitIds.length) {
        throw new ForbiddenException('business_unit_not_in_workspace')
      }
    }

    membership.business_unit_access = input.access
    await this.workspaceMembers.save(membership)

    const current = await this.businessUnitMembers.find({
      where: { workspace_id: workspaceId, user_id: targetUserId },
    })
    const wanted = new Set(input.businessUnitIds)
    const toRemove = current.filter(row => !wanted.has(row.business_unit_id))
    if (toRemove.length) await this.businessUnitMembers.remove(toRemove)
    const held = new Set(current.map(row => row.business_unit_id))
    const toAdd = input.businessUnitIds.filter(unitId => !held.has(unitId))
    if (toAdd.length) {
      await this.businessUnitMembers.save(
        toAdd.map(unitId =>
          this.businessUnitMembers.create({
            workspace_id: workspaceId,
            business_unit_id: unitId,
            user_id: targetUserId,
            membership: 'member',
          }),
        ),
      )
    }
  }

  /**
   * Un périmètre de CET espace, ou rien.
   *
   * ⚠️ `findOne` avec les DEUX conditions. Chercher par `id` seul puis comparer
   * le `workspace_id` en TypeScript marche aussi — jusqu'au jour où quelqu'un
   * retire la comparaison parce qu'elle « ne sert à rien ». La borne est dans
   * la requête.
   */
  async findInWorkspace(workspaceId: string, id: string): Promise<BusinessUnitEntity> {
    if (!workspaceId || !id) throw new BadRequestException('business_unit_scope_requires_workspace_and_user')
    const unit = await this.businessUnits.findOne({ where: { workspace_id: workspaceId, id } })
    // Hors espace, la réponse est « introuvable », jamais « interdit » :
    // « interdit » confirmerait que ce périmètre existe ailleurs.
    if (!unit) throw new NotFoundException('business_unit_not_found')
    return unit
  }
}
