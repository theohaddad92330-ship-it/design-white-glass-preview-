import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { EMPTY_WRITE_REQUEST_TARGET, type AtsWriteRequestView } from '@bellum/contracts'
import { AtsWriteRequestEntity } from '../../database/entities/ats-write-request.entity'
import type { WorkspaceRole } from '../../database/entities/workspace-member.entity'
import { canDecide, canSnooze } from '../action-os/approval-policy'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { BoondManagerClient, type BoondManagerWriteOutcome } from '../zero-layer/boondmanager.client'
import { AtsService } from './ats.service'
import { buildPreview, isExpired, type AtsWriteKind, type AtsWritePayload } from './ats-write-preview'

/**
 * L'écriture dans l'ERP, gouvernée.
 *
 * Le refus historique tenait en une phrase : écrire dans l'ERP d'une ESN engage
 * sa facturation et sa paie. Arbitrage Louis du 03/08 : autoriser l'écriture,
 * mais après approbation explicite. Ce service est ce « mais ».
 *
 * Trois propriétés, chacune destinée à un accident précis :
 *
 * 1. **Une validation de responsable, toujours.** Pas au-delà d'un seuil : un
 *    TJM est un TJM. La règle de décision est celle de l'Action OS
 *    (`canDecide`) — la réutiliser plutôt que d'en écrire une seconde évite
 *    qu'un futur rôle soit ajouté d'un côté et oublié de l'autre. Elle interdit
 *    au passage l'auto-approbation : un garde-fou qu'on peut lever seul n'en
 *    est pas un.
 * 2. **La prévisualisation est FIGÉE.** Le responsable valide le texte qu'on lui
 *    a montré, pas un recalcul au moment du clic.
 * 3. **Une demande périme.** Approuver trois semaines plus tard écrirait un état
 *    que plus personne n'a en tête.
 *
 * Et une quatrième, qui n'est pas une protection mais une honnêteté : la réponse
 * de l'ERP est conservée telle quelle. Une écriture qui échoue reste visible
 * comme échouée.
 */

/** Trois jours, comme les approbations de l'Action OS. */
const EXPIRY_MS = 3 * 24 * 60 * 60 * 1000

/** Les chemins de ressources — les MÊMES qu'en lecture, seuls vérifiés. */
const RESOURCE_PATH: Record<AtsWriteKind, string> = {
  create_mission: '/deliveries',
  update_tjm: '/deliveries',
  update_need_status: '/opportunities',
  log_call: '/actions',
}

@Injectable()
export class AtsWriteService {
  private readonly logger = new Logger(AtsWriteService.name)

  constructor(
    @InjectRepository(AtsWriteRequestEntity)
    private readonly requests: Repository<AtsWriteRequestEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly ats: AtsService,
  ) {}

  /**
   * Demande une écriture. N'écrit RIEN — elle crée une demande à valider.
   *
   * On vérifie d'abord qu'un ERP est branché : proposer à un responsable de
   * valider une écriture vers un système absent lui ferait perdre son temps et,
   * pire, lui laisserait croire que c'est parti.
   */
  async request<K extends AtsWriteKind>(
    userId: string,
    kind: K,
    payload: AtsWritePayload[K],
  ): Promise<AtsWriteRequestEntity> {
    const status = await this.ats.status(userId)
    if (!status.connected) throw new BadRequestException('Aucun ERP connecté.')

    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return this.requests.save(
      this.requests.create({
        workspace_id: workspaceId,
        requested_by: userId,
        kind,
        payload: payload as unknown as Record<string, unknown>,
        preview: buildPreview(kind, payload),
        state: 'pending',
        expires_at: new Date(Date.now() + EXPIRY_MS),
      }),
    )
  }

  /**
   * Les demandes en attente de l'espace.
   *
   * Celles qui ont expiré sont marquées au passage : une demande périmée qui
   * resterait « en attente » à l'écran donnerait l'impression qu'on peut encore
   * la valider.
   */
  async listPending(userId: string): Promise<AtsWriteRequestEntity[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.requests.find({
      where: { workspace_id: workspaceId, state: 'pending' },
      order: { created_at: 'DESC' },
      take: 50,
    })
    const now = new Date()
    const stale = rows.filter(row => isExpired(row, now))
    if (stale.length > 0) {
      await this.requests.update(
        stale.map(row => ({ id: row.id })),
        { state: 'expired' },
      )
    }
    return rows.filter(row => !isExpired(row, now))
  }

  /**
   * Les demandes en attente, DÉCORÉES de ce que cet utilisateur peut en faire.
   *
   * L'écran affichait deux boutons à tout le monde et laissait le serveur
   * refuser au clic. Or les deux refus possibles — « ce n'est pas ton rôle » et
   * « tu ne peux pas valider ta propre demande » — s'anticipent parfaitement :
   * la règle est connue avant l'affichage. La faire porter par la réponse évite
   * un aller-retour qui se lit comme un bug, et surtout ÉVITE DE LA RECOPIER
   * côté client, où elle divergerait au premier rôle ajouté.
   */
  async listPendingView(userId: string): Promise<AtsWriteRequestView[]> {
    const [{ role }, rows] = await Promise.all([
      this.workspaceContext.resolveActiveWorkspace(userId),
      this.listPending(userId),
    ])
    return rows.map(row => this.toView(row, userId, role))
  }

  /**
   * La MÊME vue qu'en lecture (`listPendingView`), pour un rang déjà en main —
   * après un `assign`/`snooze` par exemple. Rendre l'entité brute à cet
   * endroit-là et la vue ici ferait deux formes pour un même objet (même motif
   * que `CrmController.decideWrite`, `crm.controller.ts`).
   */
  private toView(row: AtsWriteRequestEntity, userId: string, role: WorkspaceRole): AtsWriteRequestView {
    // Une écriture ERP demande TOUJOURS un responsable : c'est le niveau
    // qu'on passe à la règle, jamais un niveau dérivé d'un volume.
    const verdict = canDecide({
      requiredLevel: 'n3_manager_approval',
      deciderRole: role,
      deciderId: userId,
      requesterId: row.requested_by,
    })
    return {
      id: row.id,
      kind: row.kind,
      preview: row.preview,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      requestedByYou: row.requested_by === userId,
      canDecide: verdict.allowed,
      blockedReason: verdict.allowed ? null : (verdict.reason ?? null),
      // #2864 — le collègue à qui la demande est confiée (`null` = circuit d'origine).
      assignedTo: row.assigned_to ?? null,
      // #2856 — reportée jusqu'à cette date (`null` = dans la file active).
      snoozedUntil: row.snoozed_until ? row.snoozed_until.toISOString() : null,
      // #2855 (#2201.14) — une écriture ERP n'a aujourd'hui qu'un seul
      // appelant : le formulaire direct de l'utilisateur. `source` reste
      // `null` PAR NATURE (un geste direct, pas une absence de mesure),
      // comme les clics directs déjà tracés côté CRM (`crm.controller.ts`).
      target: { ...EMPTY_WRITE_REQUEST_TARGET, source: null },
    }
  }

  /**
   * Tranche une demande.
   *
   * L'ordre compte : on refuse d'abord ce qui n'aurait pas dû être proposé
   * (expirée, déjà tranchée), puis on vérifie QUI décide, et seulement ensuite
   * on écrit. Écrire d'abord et vérifier après est la seule façon de rendre un
   * garde-fou décoratif.
   */
  async decide(userId: string, requestId: string, decision: 'approve' | 'reject'): Promise<AtsWriteRequestEntity> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const request = await this.requests.findOne({ where: { id: requestId, workspace_id: workspaceId } })
    if (!request) throw new NotFoundException('Demande introuvable.')
    if (request.state !== 'pending') throw new BadRequestException('Cette demande a déjà été tranchée.')
    if (isExpired(request, new Date())) {
      await this.requests.update({ id: request.id }, { state: 'expired' })
      throw new BadRequestException('Cette demande a expiré. Refais-la si elle est toujours d’actualité.')
    }

    // Toujours une validation de responsable — un TJM est un TJM, quel que soit
    // le volume. Et jamais par son propre demandeur.
    const allowed = canDecide({
      requiredLevel: 'n3_manager_approval',
      deciderRole: role,
      deciderId: userId,
      requesterId: request.requested_by,
    })
    if (!allowed.allowed) throw new ForbiddenException(allowed.reason ?? 'Validation refusée.')

    if (decision === 'reject') {
      await this.requests.update({ id: request.id }, { state: 'rejected', decided_by: userId, decided_at: new Date() })
      return { ...request, state: 'rejected', decided_by: userId, decided_at: new Date() }
    }

    const outcome = await this.execute(request)
    const state = outcome.ok ? ('approved' as const) : ('failed' as const)
    await this.requests.update(
      { id: request.id },
      { state, decided_by: userId, decided_at: new Date(), result: outcome.detail },
    )
    if (!outcome.ok) {
      this.logger.warn('Écriture ERP refusée par le système distant — la demande reste visible comme échouée', {
        requestId: request.id,
      })
    }
    return { ...request, state, decided_by: userId, decided_at: new Date(), result: outcome.detail }
  }

  /**
   * #2864 — reste du lot précédent : CONFIER une écriture ERP en attente à un
   * collègue du MÊME espace (`null` = retirer).
   *
   * Réutilise `canDecide` — LA MÊME règle que `decide()` juste au-dessus
   * (`n3_manager_approval`, toujours un responsable, jamais l'auteur) — pour
   * vérifier que le destinataire POURRAIT réellement trancher : lui confier
   * la demande ne ferait sinon que la bloquer sous son nom jusqu'à
   * expiration. `canSnooze` (Action OS, `approval-policy.ts`) tient la
   * question séparée de « qui a la main sur ce circuit » — la même pour
   * déléguer que pour reporter, et déjà réutilisée par
   * `OutboundWriteService.assign` (#2864, écritures CRM) pour la même raison.
   */
  async assign(input: {
    userId: string
    requestId: string
    assigneeId: string | null
  }): Promise<AtsWriteRequestEntity> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(input.userId)
    const request = await this.requests.findOne({ where: { id: input.requestId, workspace_id: workspaceId } })
    if (!request) throw new NotFoundException('Demande introuvable.')
    if (request.state !== 'pending') throw new BadRequestException('Cette demande a déjà été tranchée.')
    if (isExpired(request, new Date())) throw new BadRequestException('Cette demande a expiré.')

    const canRoute = canSnooze({
      actorId: input.userId,
      actorRole: role,
      requesterId: request.requested_by,
      currentAssigneeId: request.assigned_to ?? null,
    })
    if (!canRoute.allowed) {
      throw new ForbiddenException(
        canRoute.reason ?? "Seul l'auteur, le collègue désigné ou un responsable peut confier cette demande.",
      )
    }

    if (input.assigneeId !== null) {
      const membership = await this.workspaceContext.getMembership(input.assigneeId, workspaceId)
      if (!membership) throw new BadRequestException('Seul un membre de cet espace peut recevoir cette demande.')
      const verdict = canDecide({
        requiredLevel: 'n3_manager_approval',
        deciderRole: membership.role,
        deciderId: input.assigneeId,
        requesterId: request.requested_by,
      })
      if (!verdict.allowed) {
        throw new ForbiddenException(verdict.reason ?? 'Ce membre ne peut pas trancher cette demande.')
      }
    }

    const claimed = await this.requests.update(
      { id: request.id, workspace_id: workspaceId, state: 'pending' },
      { assigned_to: input.assigneeId },
    )
    if (!claimed.affected) throw new BadRequestException('Cette demande a déjà été tranchée.')
    return { ...request, assigned_to: input.assigneeId }
  }

  /**
   * `assign`, mais rend la MÊME vue qu'en lecture (`listPendingView`) —
   * jamais l'entité brute. Le contrôleur appelle celle-ci ; `assign`
   * ci-dessus reste inchangée (et ses tests avec elle) pour ne pas
   * recalculer le rôle deux fois côté service.
   */
  async assignView(input: {
    userId: string
    requestId: string
    assigneeId: string | null
  }): Promise<AtsWriteRequestView> {
    const [request, { role }] = await Promise.all([
      this.assign(input),
      this.workspaceContext.resolveActiveWorkspace(input.userId),
    ])
    return this.toView(request, input.userId, role)
  }

  /**
   * #2856 — reste du lot précédent : REPORTER une écriture ERP en attente
   * (`null` la réveille). Même moteur que
   * `WorkflowRunnerService.snoozeApprovalRequest` — `canSnooze` réutilisé tel
   * quel (GA-26). Rien n'est décidé : la demande reste `pending` et passe
   * toujours par la validation d'un responsable (`decide()`) à son réveil.
   */
  async snooze(input: { userId: string; requestId: string; until: Date | null }): Promise<AtsWriteRequestEntity> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(input.userId)
    const request = await this.requests.findOne({ where: { id: input.requestId, workspace_id: workspaceId } })
    if (!request) throw new NotFoundException('Demande introuvable.')
    if (request.state !== 'pending') throw new BadRequestException('Cette demande a déjà été tranchée.')
    if (isExpired(request, new Date())) throw new BadRequestException('Cette demande a expiré.')

    const verdict = canSnooze({
      actorId: input.userId,
      actorRole: role,
      requesterId: request.requested_by,
      currentAssigneeId: request.assigned_to ?? null,
    })
    if (!verdict.allowed) {
      throw new ForbiddenException(
        verdict.reason ?? "Seul l'auteur, le collègue désigné ou un responsable peut reporter cette demande.",
      )
    }
    if (input.until !== null) {
      if (input.until.getTime() <= Date.now()) throw new BadRequestException('La date de report doit être future.')
      if (input.until.getTime() > request.expires_at.getTime()) {
        throw new BadRequestException('Cette demande expire avant la date choisie : reportez-la moins loin.')
      }
    }

    const claimed = await this.requests.update(
      { id: request.id, workspace_id: workspaceId, state: 'pending' },
      { snoozed_until: input.until },
    )
    if (!claimed.affected) throw new BadRequestException('Cette demande a déjà été tranchée.')
    return { ...request, snoozed_until: input.until }
  }

  /** `snooze`, mais rend la MÊME vue qu'en lecture — voir `assignView` ci-dessus. */
  async snoozeView(input: { userId: string; requestId: string; until: Date | null }): Promise<AtsWriteRequestView> {
    const [request, { role }] = await Promise.all([
      this.snooze(input),
      this.workspaceContext.resolveActiveWorkspace(input.userId),
    ])
    return this.toView(request, input.userId, role)
  }

  /**
   * L'appel réel. La réponse de l'ERP est rendue telle quelle.
   *
   * `create_mission` CRÉE — POST vers la collection. `update_tjm` et
   * `update_need_status` CORRIGENT une ressource EXISTANTE — PATCH vers son
   * id, jamais la collection : le défaut que ce lot répare était `write()` en
   * `POST` dur pour les trois gestes, si bien qu'une correction créait un
   * doublon dans l'ERP au lieu de corriger l'original.
   */
  private async execute(request: AtsWriteRequestEntity): Promise<{ ok: boolean; detail: string }> {
    const config = await this.ats.resolveConfigFor(request.requested_by)
    if (!config) return { ok: false, detail: 'Aucun ERP connecté au moment de la validation.' }
    const client = new BoondManagerClient(config)
    const path = RESOURCE_PATH[request.kind]

    if (request.kind === 'log_call') return this.describe(await this.executeLogCall(client, path, request), request.id)

    const outcome =
      request.kind === 'create_mission'
        ? await client.create(path, request.payload)
        : await this.executeUpdate(client, path, request.payload)

    return this.describe(outcome, request.id)
  }

  /**
   * #4692 — le compte rendu d'appel. Dans l'ordre : scope (refus nommé AVANT toute lecture), dictionnaire de
   * l'instance (le `typeOf` y est validé par `createAction`), responsable de la connexion, puis le POST typé.
   * `unknown` n'est jamais rejoué : la demande a quitté `pending`, `decide()` refuse de la trancher deux fois.
   */
  private async executeLogCall(
    client: BoondManagerClient,
    path: string,
    request: AtsWriteRequestEntity,
  ): Promise<BoondManagerWriteOutcome> {
    const refusal = client.refusalFor('POST', path)
    if (refusal) return { ok: false, detail: refusal, outcome: 'failed' }
    const p = request.payload as unknown as AtsWritePayload['log_call']
    const [dict, mainManagerId] = await Promise.all([client.fetchDictionary(), client.fetchCurrentUserId()])
    return client.createAction(dict, {
      typeOf: p.typeOf,
      title: p.title,
      text: p.summary,
      startDate: p.startDate,
      endDate: p.endDate,
      contactId: p.contactId,
      mainManagerId,
      companyId: p.companyId ?? null,
    })
  }

  /**
   * Sépare l'identifiant de ressource du corps envoyé à l'ERP — le même motif
   * que les connecteurs CRM (`updateContact(token, id, input)`) : l'id porte
   * l'URL, il ne se répète pas dans le JSON écrit.
   */
  private executeUpdate(
    client: BoondManagerClient,
    path: string,
    payload: Record<string, unknown>,
  ): Promise<BoondManagerWriteOutcome> {
    const { resourceId, ...body } = payload
    return client.update(path, typeof resourceId === 'string' ? resourceId : '', body)
  }

  /**
   * Traduit l'issue technique en ce qui est PERSISTÉ — honnêtement, sans
   * jamais confondre « refusé » et « on ne sait pas ».
   *
   * Un `unknown` (requête partie sans réponse) n'est ni un succès ni un échec
   * net : le dire comme un échec ordinaire laisserait croire qu'on peut sans
   * risque redemander la même correction. Cette demande a de toute façon
   * quitté `pending` — `decide()` refuse qu'elle soit tranchée deux fois — donc
   * ici, seule la trace compte : elle doit dire qu'on ne sait pas.
   */
  private describe(outcome: BoondManagerWriteOutcome, requestId: string): { ok: boolean; detail: string } {
    if (outcome.ok) return outcome
    if (outcome.outcome === 'unknown') {
      this.logger.warn(
        'Écriture ERP sans réponse — issue inconnue, cette demande ne sera pas rejouée automatiquement',
        {
          requestId,
        },
      )
      return {
        ok: false,
        detail: `Sans réponse de l’ERP — impossible de savoir si l’écriture a abouti. ${outcome.detail}`,
      }
    }
    return { ok: outcome.ok, detail: outcome.detail }
  }
}
