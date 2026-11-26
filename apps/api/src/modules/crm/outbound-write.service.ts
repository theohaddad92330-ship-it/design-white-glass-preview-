import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { Repository } from 'typeorm'
import { hasPermission, type WorkspaceRole, type WriteSource } from '@bellum/contracts'
import { OutboundWriteRequestEntity } from '../../database/entities/outbound-write-request.entity'
import { canSnooze } from '../action-os/approval-policy'
import {
  buildOutboundPreview,
  isOutboundExpired,
  OUTBOUND_WRITE_EXPIRY_MS,
  type OutboundWriteKind,
} from './outbound-write-preview'

/**
 * La porte par laquelle passe TOUTE écriture CRM (BEL-INT-603, arbitrage Louis
 * du 21/08).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA PORTE FAIT, ET CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle enregistre une demande avec sa prévisualisation FIGÉE, et rend un verdict :
 * `write_now` ou `pending`. Elle n'appelle aucun fournisseur — c'est l'appelant
 * qui écrit, une fois autorisé. Cette séparation compte : elle permet de router
 * les six écritures CRM par ici sans que ce service connaisse six clients HTTP.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DISTINCTION QUI PORTE TOUT : QUI DEMANDE
 * ─────────────────────────────────────────────────────────────────────────────
 * `user` — quelqu'un a cliqué, sur un écran qui vient de lui montrer champ par
 * champ ce qui sera écrit. Le clic EST la décision : le demandeur décide
 * lui-même, parce qu'un CRM est son carnet d'adresses commercial et non la paie
 * de l'ESN (là où `canDecide` de l'ERP interdit l'auto-approbation, et à juste
 * titre).
 *
 * `system` — une routine, un reflet d'interaction, un versement de téléphonie.
 * Personne n'a rien vu. La demande reste EN ATTENTE, et rien ne part. C'est la
 * conséquence qu'a lue et acceptée l'arbitrage « toutes les écritures CRM » :
 * poser une note en fond demande désormais une approbation.
 */
@Injectable()
export class OutboundWriteService {
  private readonly logger = new Logger(OutboundWriteService.name)

  constructor(
    @InjectRepository(OutboundWriteRequestEntity)
    private readonly requests: Repository<OutboundWriteRequestEntity>,
  ) {}

  /**
   * Enregistre la demande et dit si l'écriture peut partir MAINTENANT.
   *
   * L'idempotence est vérifiée AVANT d'enregistrer : un double clic, un rejeu de
   * file ou un retour arrière du navigateur ne doivent pas déposer deux fois la
   * même note dans le CRM d'un client. Sauter une écriture se répare ; en
   * déposer deux, non — c'est la même règle que la trace de téléphonie.
   */
  async request(input: {
    workspaceId: string
    userId: string
    provider: string
    kind: OutboundWriteKind
    payload: Record<string, unknown>
    origin: 'user' | 'system'
    idempotencyKey?: string | null
    /**
     * #1934.18 — ce que les champs valent AUJOURD'HUI chez le fournisseur, quand
     * le demandeur le sait. La révision en disposait déjà (elle relit la demande
     * d'origine) ; une demande NEUVE, non. Un déplacement de stade approuvé sans
     * son point de départ est une décision prise à moitié.
     *
     * ⚠️ Une clé ABSENTE vaut « on ne sait pas », pas « c'est vide » : c'est
     * `buildOutboundPreview` qui tient la distinction, par un `in`.
     */
    previous?: Readonly<Record<string, unknown>>
    /**
     * #2855 — QUI/QUOI a composé la proposition (compte rendu, appel,
     * routine, MCP). Absent = un geste direct de la personne, ou une
     * provenance que l'appelant ne trace pas encore : `null` en base, jamais
     * devinée ici.
     */
    source?: WriteSource
    /**
     * #2854 (#2201.9) — le LOT auquel cette demande appartient, posé par
     * {@link requestBatch}. `undefined`/`null` = demande seule, jamais un lot
     * d'un seul élément inventé pour l'occasion.
     */
    batchId?: string | null
  }): Promise<{ decision: 'write_now' | 'pending' | 'already_done'; request: OutboundWriteRequestEntity }> {
    if (input.idempotencyKey) {
      const seen = await this.requests.findOne({
        where: { workspace_id: input.workspaceId, idempotency_key: input.idempotencyKey },
      })
      if (seen) return { decision: 'already_done', request: seen }
    }

    const now = new Date()
    const entity = this.requests.create({
      workspace_id: input.workspaceId,
      requested_by: input.userId,
      provider: input.provider,
      kind: input.kind,
      payload: input.payload,
      // FIGÉE. Recalculer au moment d'approuver montrerait autre chose que ce
      // qui a été relu, et personne ne relit deux fois.
      preview: buildOutboundPreview(input.kind, input.payload, input.previous),
      origin: input.origin,
      state: input.origin === 'user' ? 'approved' : 'pending',
      decided_by: input.origin === 'user' ? input.userId : null,
      decided_at: input.origin === 'user' ? now : null,
      idempotency_key: input.idempotencyKey ?? null,
      expires_at: new Date(now.getTime() + OUTBOUND_WRITE_EXPIRY_MS),
      source: input.source ?? null,
      batch_id: input.batchId ?? null,
    })

    let saved: OutboundWriteRequestEntity
    try {
      saved = await this.requests.save(entity)
    } catch (error) {
      // Violation d'unicité = une autre instance a pris la demande. C'est le
      // résultat voulu : on ne double pas l'écriture.
      const seen = input.idempotencyKey
        ? await this.requests.findOne({
            where: { workspace_id: input.workspaceId, idempotency_key: input.idempotencyKey },
          })
        : null
      if (seen) return { decision: 'already_done', request: seen }
      throw error
    }

    return { decision: input.origin === 'user' ? 'write_now' : 'pending', request: saved }
  }

  /** Les demandes en attente de l'espace — l'écran qui les montre. */
  async pending(workspaceId: string, now = new Date()): Promise<OutboundWriteRequestEntity[]> {
    const rows = await this.requests.find({
      where: { workspace_id: workspaceId, state: 'pending' },
      order: { created_at: 'DESC' },
      take: 100,
    })
    // Une demande périmée ne se montre pas comme « en attente » : personne n'y
    // décidera plus rien, et la laisser dans la liste fait croire qu'on peut.
    return rows.filter(row => !isOutboundExpired(row, now))
  }

  /**
   * Décide d'une demande en attente.
   *
   * Une demande EXPIRÉE est refusée, et c'est la seule règle non contournable :
   * approuver trois jours plus tard écrirait un état que plus personne n'a en
   * tête — exactement ce que le §4.4 du PDF décrit.
   */
  async decide(input: {
    workspaceId: string
    userId: string
    requestId: string
    approve: boolean
    now?: Date
  }): Promise<OutboundWriteRequestEntity> {
    if (!input.requestId) throw new NotFoundException('Demande d’écriture introuvable.')
    const request = await this.requests.findOne({
      where: { id: input.requestId, workspace_id: input.workspaceId },
    })
    if (!request) throw new NotFoundException('Demande d’écriture introuvable.')

    const now = input.now ?? new Date()
    if (isOutboundExpired(request, now)) {
      await this.requests.update({ id: request.id }, { state: 'expired' })
      throw new ConflictException(
        'Cette demande a expiré. Elle écrirait un état que plus personne n’a en tête : refais-la depuis l’écran.',
      )
    }
    if (request.state !== 'pending') throw new ConflictException('Cette demande a déjà été tranchée.')

    request.state = input.approve ? 'approved' : 'rejected'
    request.decided_by = input.userId
    request.decided_at = now
    return this.requests.save(request)
  }

  /**
   * #2854 (#2201.32) — « Annuler le lot ».
   *
   * Pas un moteur neuf : chaque identifiant reçu passe par `decide()`
   * ci-dessus, LA MÊME porte qu'un refus individuel (GA-26, aucune règle
   * dupliquée). Ce qui est neuf, c'est la BOUCLE et le fait que chaque
   * refus reste ATOMIQUE et son issue NOMMÉE séparément — jamais un
   * « tout annulé » qui couvrirait un échec partiel (doctrine, donnée
   * inventée).
   */
  async bulkReject(input: {
    workspaceId: string
    userId: string
    requestIds: readonly string[]
    now?: Date
  }): Promise<{ succeeded: string[]; failed: Array<{ id: string; reason: string }> }> {
    const succeeded: string[] = []
    const failed: Array<{ id: string; reason: string }> = []
    for (const requestId of input.requestIds) {
      try {
        await this.decide({
          workspaceId: input.workspaceId,
          userId: input.userId,
          requestId,
          approve: false,
          now: input.now,
        })
        succeeded.push(requestId)
      } catch (error) {
        failed.push({ id: requestId, reason: error instanceof Error ? error.message : 'Échec inconnu.' })
      }
    }
    return { succeeded, failed }
  }

  /**
   * #2854 (#2201.9) — « ACTIONS EN MASSE » : une seule demande qui dépose
   * PLUSIEURS écritures, groupées par un `batch_id` partagé.
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * CE QUI MANQUAIT, ET CE QUE CETTE MÉTHODE NE FAIT PAS
   * ─────────────────────────────────────────────────────────────────────────────
   * Avant elle, aucun endpoint ne regroupait plusieurs écritures en une seule
   * demande — `bulk_send`/`bulk_update`/`bulk_delete` classaient déjà des
   * familles de permission (`sensitiveActionFamilySchema`), sans qu'aucun
   * créateur de lot les lise jamais. Elle ne CRÉE PAS un objet « lot » séparé :
   * chaque élément passe par {@link request} ci-dessus, LA MÊME porte qu'une
   * demande seule (GA-26). Ce qui est neuf, c'est le `batch_id` partagé que
   * cette méthode pose sur chacune, et qui permet à l'écran de les retrouver
   * groupées ({@link findByBatch}) — jamais une fausse carte unique qui
   * prétendrait être « une » décision sur des écritures en réalité
   * indépendantes : chacune garde son propre état, sa propre décision, sa
   * propre preuve, exactement comme `bulkReject` le fait déjà pour
   * l'annulation.
   *
   * Un lot VIDE ne pose aucun `batch_id` : il n'y a rien à regrouper, et en
   * inventer un serait exactement la donnée fictive que la doctrine refuse.
   */
  async requestBatch(input: {
    workspaceId: string
    userId: string
    origin: 'user' | 'system'
    items: ReadonlyArray<{
      provider: string
      kind: OutboundWriteKind
      payload: Record<string, unknown>
      idempotencyKey?: string | null
      previous?: Readonly<Record<string, unknown>>
      source?: WriteSource
    }>
  }): Promise<{
    batchId: string | null
    results: Array<{ decision: 'write_now' | 'pending' | 'already_done'; request: OutboundWriteRequestEntity }>
  }> {
    if (input.items.length === 0) return { batchId: null, results: [] }

    const batchId = randomUUID()
    const results: Array<{
      decision: 'write_now' | 'pending' | 'already_done'
      request: OutboundWriteRequestEntity
    }> = []
    for (const item of input.items) {
      results.push(
        await this.request({
          workspaceId: input.workspaceId,
          userId: input.userId,
          origin: input.origin,
          provider: item.provider,
          kind: item.kind,
          payload: item.payload,
          idempotencyKey: item.idempotencyKey,
          previous: item.previous,
          source: item.source,
          batchId,
        }),
      )
    }
    return { batchId, results }
  }

  /** Les demandes d'un LOT — l'écran qui les groupe sous une carte, avec la
   *  possibilité d'ouvrir chacune (#2854 / #2201.9). */
  async findByBatch(workspaceId: string, batchId: string): Promise<OutboundWriteRequestEntity[]> {
    return this.requests.find({ where: { workspace_id: workspaceId, batch_id: batchId }, order: { created_at: 'ASC' } })
  }

  /**
   * MODIFIER UNE DEMANDE — c'est-à-dire en créer une NOUVELLE (#1498).
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * POURQUOI ON NE MODIFIE PAS EN PLACE
   * ─────────────────────────────────────────────────────────────────────────────
   * La règle qui rend cette file sûre est que la prévisualisation est FIGÉE :
   * on approuve exactement ce qu'on a lu. Modifier la charge utile d'une demande
   * en attente ferait approuver autre chose que ce qui a été gelé — et personne
   * ne relit deux fois.
   *
   * Louis a tranché le 05/09 : la révision crée une demande NEUVE, figée à son
   * tour, et l'ancienne passe en `superseded`. On garde donc les deux, et la
   * file dit ce qui s'est réellement passé.
   *
   * ⚠️ `superseded` et pas `rejected` : personne n'a dit non. Sur une file qu'on
   * relit pour comprendre qui a autorisé quoi, écrire un refus qui n'a pas eu
   * lieu est un mensonge à peu de frais.
   *
   * ⚠️ Une demande EXPIRÉE ne se révise pas non plus : elle décrit un monde que
   * plus personne n'a en tête. Le message dit de repartir de l'écran.
   */
  async revise(input: {
    workspaceId: string
    userId: string
    requestId: string
    /** Les valeurs corrigées, par CLÉ de charge utile — pas par libellé. */
    changes: Record<string, unknown>
    now?: Date
  }): Promise<OutboundWriteRequestEntity> {
    if (!input.requestId) throw new NotFoundException('Demande d’écriture introuvable.')
    const previous = await this.requests.findOne({
      where: { id: input.requestId, workspace_id: input.workspaceId },
    })
    if (!previous) throw new NotFoundException('Demande d’écriture introuvable.')

    const now = input.now ?? new Date()
    if (isOutboundExpired(previous, now)) {
      await this.requests.update({ id: previous.id }, { state: 'expired' })
      throw new ConflictException(
        'Cette demande a expiré. Elle écrirait un état que plus personne n’a en tête : refais-la depuis l’écran.',
      )
    }
    if (previous.state !== 'pending') throw new ConflictException('Cette demande a déjà été tranchée.')

    // ⚠️ Seules les clés DÉJÀ présentes sont modifiables. Une clé neuve
    // écrirait un champ que personne n'a relu dans la demande d'origine — et la
    // révision deviendrait un moyen de faire passer autre chose.
    const payload: Record<string, unknown> = { ...(previous.payload ?? {}) }
    for (const [key, value] of Object.entries(input.changes)) {
      if (key in payload) payload[key] = value
    }

    const revised = this.requests.create({
      workspace_id: previous.workspace_id,
      requested_by: input.userId,
      provider: previous.provider,
      kind: previous.kind,
      payload,
      // ⚠️ L'ANCIENNE valeur de la révision est celle de la demande d'origine :
      // c'est ce que la personne avait sous les yeux quand elle a corrigé. La
      // relire chez le fournisseur donnerait un diff qui ne décrit pas son
      // geste.
      preview: buildOutboundPreview(previous.kind, payload, previous.payload ?? {}),
      origin: previous.origin,
      state: 'pending',
      expires_at: new Date(now.getTime() + OUTBOUND_WRITE_EXPIRY_MS),
      // ⚠️ PAS la clé d'idempotence de l'originale : deux demandes qui la
      // partagent se dédupliqueraient, et la révision disparaîtrait en silence.
      idempotency_key: null,
      // #2855 — la révision corrige un CHAMP, pas l'auteur de la proposition :
      // même provenance que la demande d'origine.
      source: previous.source ?? null,
    })
    const saved = await this.requests.save(revised)

    previous.state = 'superseded'
    previous.decided_by = input.userId
    previous.decided_at = now
    await this.requests.save(previous)

    return saved
  }

  /**
   * #2864 — reste du lot précédent : CONFIER une écriture CRM en attente à un
   * collègue du MÊME espace (`null` = retirer). Même colonne, même moteur que
   * la délégation d'une approbation de l'Action OS
   * (`WorkflowRunnerService.assignApprovalRequest`) — mais PAS la même règle
   * de « qui peut trancher » : une demande d'approbation compare un niveau
   * d'automatisation (`n0`…`n5`) que cette file n'a pas, quand une écriture
   * CRM se décide sur une seule permission, `data:export`
   * (`CrmController.decideWrite`). Réutiliser `canAssign` tel quel aurait donc
   * vérifié la mauvaise capacité — `records:write` au lieu de `data:export` —
   * et aurait pu confier la demande à quelqu'un qui ne peut PAS la trancher.
   *
   * Ce qui EST réutilisé (GA-26, ne duplique pas) : `canSnooze` — « qui a la
   * main sur ce circuit » est EXACTEMENT la même question pour déléguer que
   * pour reporter, et sa réponse ne dépend d'aucun niveau d'automatisation.
   */
  async assign(input: {
    workspaceId: string
    requestId: string
    assignerId: string
    assignerRole: WorkspaceRole
    assigneeId: string | null
    /** `null` = le destinataire n'est pas membre de l'espace de la demande —
     *  non lu quand `assigneeId` est `null`. */
    assigneeRole: WorkspaceRole | null
  }): Promise<OutboundWriteRequestEntity> {
    if (!input.requestId) throw new NotFoundException('Demande d’écriture introuvable.')
    const request = await this.requests.findOne({ where: { id: input.requestId, workspace_id: input.workspaceId } })
    if (!request) throw new NotFoundException('Demande d’écriture introuvable.')
    if (request.state !== 'pending') throw new ConflictException('Cette demande a déjà été tranchée.')
    if (isOutboundExpired(request, new Date())) throw new ConflictException('Cette demande a expiré.')

    const canRoute = canSnooze({
      actorId: input.assignerId,
      actorRole: input.assignerRole,
      requesterId: request.requested_by,
      currentAssigneeId: request.assigned_to ?? null,
    })
    if (!canRoute.allowed) {
      throw new ForbiddenException(
        canRoute.reason ?? "Seul l'auteur, le collègue désigné ou un responsable peut confier cette demande.",
      )
    }
    if (input.assigneeId !== null) {
      if (input.assigneeRole === null) {
        throw new BadRequestException('Seul un membre de cet espace peut recevoir cette demande.')
      }
      // Voir le docblock ci-dessus : la même permission que `decideWrite`,
      // jamais `records:write` (celle de `canAssign`, faite pour un AUTRE barème).
      if (!hasPermission(input.assigneeRole, 'data:export')) {
        throw new ForbiddenException('Ce membre a un accès en lecture seule : il ne peut pas trancher cette demande.')
      }
    }

    const claimed = await this.requests.update(
      { id: request.id, workspace_id: input.workspaceId, state: 'pending' },
      { assigned_to: input.assigneeId },
    )
    if (!claimed.affected) throw new ConflictException('Cette demande a déjà été tranchée.')
    return { ...request, assigned_to: input.assigneeId }
  }

  /**
   * #2856 — reste du lot précédent : REPORTER une écriture CRM en attente
   * (`null` la réveille). Même moteur que
   * `WorkflowRunnerService.snoozeApprovalRequest` — `canSnooze` réutilisé tel
   * quel (GA-26) : « qui a la main sur ce circuit » ne dépend d'aucune règle
   * propre aux écritures CRM, contrairement à `assign` ci-dessus. Rien n'est
   * décidé : la demande reste `pending` et passe toujours par la porte.
   */
  async snooze(input: {
    workspaceId: string
    requestId: string
    actorId: string
    actorRole: WorkspaceRole
    until: Date | null
  }): Promise<OutboundWriteRequestEntity> {
    if (!input.requestId) throw new NotFoundException('Demande d’écriture introuvable.')
    const request = await this.requests.findOne({ where: { id: input.requestId, workspace_id: input.workspaceId } })
    if (!request) throw new NotFoundException('Demande d’écriture introuvable.')
    if (request.state !== 'pending') throw new ConflictException('Cette demande a déjà été tranchée.')
    if (isOutboundExpired(request, new Date())) throw new ConflictException('Cette demande a expiré.')

    const verdict = canSnooze({
      actorId: input.actorId,
      actorRole: input.actorRole,
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
      { id: request.id, workspace_id: input.workspaceId, state: 'pending' },
      { snoozed_until: input.until },
    )
    if (!claimed.affected) throw new ConflictException('Cette demande a déjà été tranchée.')
    return { ...request, snoozed_until: input.until }
  }

  /** Le résultat de l'écriture, gardé tel quel. */
  async recordOutcome(requestId: string, outcome: { ok: boolean; response?: string }): Promise<void> {
    await this.requests.update(
      { id: requestId },
      {
        state: outcome.ok ? 'written' : 'failed',
        // « On a essayé et ça n'est pas passé » est une information ; « rien ne
        // s'est passé » n'en est pas une.
        provider_response: outcome.response ?? null,
      },
    )
  }

  /**
   * #1943.8 — RÉCLAME une demande validée pour l'écrire, UNE fois.
   *
   * Deux règles, et c'est ici qu'elles vivent (un seul endroit) :
   *  - **jamais une demande auto-approuvée.** Une demande d'utilisateur est
   *    approuvée à sa création parce que le clic EST la décision — et son
   *    appelant l'écrit dans la foulée. Elle ne repart jamais d'ici : si l'écriture
   *    en ligne a échoué entre les deux, la rejouer en arrière-plan écrirait une
   *    seconde fois. Seule une demande de SYSTÈME tranchée par quelqu'un
   *    (`decided_by`) passe ;
   *  - **une seule écriture.** La transition `approved → writing` est atomique :
   *    deux validations concurrentes n'en réclament qu'une, la seconde est refusée.
   */
  async claimApprovedWrite(
    workspaceId: string,
    requestId: string,
    now = new Date(),
  ): Promise<OutboundWriteRequestEntity> {
    const request = await this.requireApproved(workspaceId, requestId, now)
    if (request.origin !== 'system' || !request.decided_by) {
      throw new ConflictException(
        "Cette écriture a été demandée par un clic : elle est partie à ce moment-là, elle ne repart pas d'ici.",
      )
    }
    const claimed = await this.requests.update(
      { id: request.id, workspace_id: workspaceId, state: 'approved' },
      { state: 'writing' },
    )
    if (!claimed.affected) throw new ConflictException('Cette écriture est déjà en cours.')
    return { ...request, state: 'writing' }
  }

  /**
   * #1943.8 — la requête est PARTIE et la réponse s'est perdue. Ni écrite, ni
   * échouée : `unknown` ARRÊTE la reprise (une note déposée deux fois dans le CRM
   * d'un client ne se répare pas). La réponse est gardée telle quelle.
   */
  async recordUnknown(requestId: string, response: string | null): Promise<void> {
    await this.requests.update({ id: requestId }, { state: 'unknown', provider_response: response })
  }

  /** Une demande approuvée peut-elle encore être écrite ? */
  async requireApproved(workspaceId: string, requestId: string, now = new Date()): Promise<OutboundWriteRequestEntity> {
    if (!requestId) throw new NotFoundException('Demande d’écriture introuvable.')
    const request = await this.requests.findOne({ where: { id: requestId, workspace_id: workspaceId } })
    if (!request) throw new NotFoundException('Demande d’écriture introuvable.')
    if (request.state === 'written') throw new ConflictException('Cette écriture a déjà eu lieu.')
    if (request.state !== 'approved') throw new ForbiddenException('Cette écriture n’a pas été approuvée.')
    if (request.expires_at.getTime() <= now.getTime()) {
      throw new ConflictException('Cette approbation a expiré.')
    }
    return request
  }
}
