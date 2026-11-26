import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { groupOverdueByClient, type OverdueMeta } from './intervention-grouping'
import {
  PLAYBOOK_DRY_RUN_LIMIT,
  PLAYBOOK_KEYS,
  isPlaybookApprovalExpired,
  playbookApprovalDeadline,
  playbookVerdict,
  rankInterventions,
  type AssignInterventionInput,
  type DecideInterventionInput,
  type Intervention,
  type InterventionKind,
  type PlaybookApproval,
  type PlaybookBlockReason,
  type PlaybookCandidate,
  type PlaybookDryRun,
  type PlaybookDryRunEntry,
  type PlaybookKey,
  type PlaybookSendState,
  type PlaybookSubscription,
  type UpdatePlaybookInput,
  EMPTY_WRITE_REQUEST_TARGET,
} from '@bellum/contracts'
import { returnedRows } from '../../database/returned-rows'
import { InterventionEntity } from '../../database/entities/intervention.entity'
import { PlaybookSendEntity } from '../../database/entities/playbook-send.entity'
import { PlaybookSubscriptionEntity } from '../../database/entities/playbook-subscription.entity'
import { SuppressionService } from '../mailer/suppression.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { PlaybookTargetsService } from './playbook-targets.service'
import { withLiveOverdueDays } from './intervention-rules'

/** Ce qu'une évaluation rend : autorisé, ou refusé AVEC sa raison. */
type PlaybookEvaluation = { allowed: boolean; reason: PlaybookBlockReason | null }

/**
 * Les PLAYBOOKS de niveau 5, et la file d'intervention.
 *
 * Le service ne CONTIENT pas les garde-fous : ils vivent dans le contrat, purs
 * et testés (`playbookVerdict`). Ici on rassemble seulement l'état — armé ou
 * non, déjà envoyé ou non, combien aujourd'hui — et on laisse la fonction
 * décider. Deux implémentations de la règle « arrêt dès réponse » finiraient par
 * diverger, et la divergence se paierait en e-mails partis à des gens qui
 * avaient répondu.
 *
 * L'ÉCRITURE de la trace se fait AVANT l'envoi et non après : rater une relance
 * se répare, en envoyer deux ne se rattrape pas. Même discipline que les
 * routines et les lots d'envoi.
 */
@Injectable()
export class PlaybooksService {
  private readonly logger = new Logger(PlaybooksService.name)

  constructor(
    @InjectRepository(PlaybookSubscriptionEntity)
    private readonly subscriptions: Repository<PlaybookSubscriptionEntity>,
    @InjectRepository(PlaybookSendEntity) private readonly sends: Repository<PlaybookSendEntity>,
    @InjectRepository(InterventionEntity) private readonly interventions: Repository<InterventionEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly targets: PlaybookTargetsService,
    private readonly suppression: SuppressionService,
  ) {}

  /**
   * Les trois playbooks et leur état.
   *
   * Les trois sont TOUJOURS rendus, même sans ligne en base : un écran qui
   * n'afficherait que les playbooks déjà touchés cacherait ceux qu'on n'a jamais
   * armés — c'est-à-dire tous, au premier passage.
   */
  async list(userId: string): Promise<PlaybookSubscription[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.subscriptions.find({ where: { workspace_id: workspaceId } })
    const byKey = new Map(rows.map(row => [row.playbook, row]))

    return PLAYBOOK_KEYS.map(playbook => {
      const row = byKey.get(playbook)
      return {
        playbook,
        enabled: row?.enabled ?? false,
        silenceDays: row?.silence_days ?? 7,
        updatedAt: row ? new Date(row.updated_at).toISOString() : new Date(0).toISOString(),
      }
    })
  }

  /** Arme ou éteint un playbook. Un seul appel suffit à tout arrêter. */
  async update(userId: string, playbook: PlaybookKey, input: UpdatePlaybookInput): Promise<PlaybookSubscription> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.subscriptions.manager.query(
      `INSERT INTO playbook_subscriptions (workspace_id, playbook, enabled, silence_days, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (workspace_id, playbook)
       DO UPDATE SET enabled = EXCLUDED.enabled, silence_days = EXCLUDED.silence_days, updated_at = now()`,
      [workspaceId, playbook, input.enabled, input.silenceDays],
    )
    const list = await this.list(userId)
    const found = list.find(entry => entry.playbook === playbook)
    if (!found) throw new NotFoundException('Playbook introuvable')
    return found
  }

  /**
   * Évalue une cible contre les six garde-fous.
   *
   * `now` est un paramètre pour que le garde-fou d'heures calmes se teste.
   */
  async evaluate(
    workspaceId: string,
    playbook: PlaybookKey,
    target: { id: string; hasReply: boolean; optedOut: boolean; silenceDays: number | null; recipient: string | null },
    now: Date = new Date(),
    /**
     * Juger COMME SI le playbook était armé — la simulation, et elle seule.
     *
     * Sans cette porte, chaque ligne d'une simulation rendrait `not_enabled` :
     * exact, et parfaitement inutile. La seule question qu'on se pose avant
     * d'armer est ce qui se passerait APRÈS.
     */
    assumeEnabled = false,
  ): Promise<PlaybookEvaluation> {
    const subscription = await this.subscriptions.findOne({ where: { workspace_id: workspaceId, playbook } })
    const already = await this.sends.findOne({
      where: { workspace_id: workspaceId, playbook, target_id: target.id },
    })
    const sentToday = await this.countSentToday(workspaceId, now)

    const candidate: PlaybookCandidate = {
      enabled: assumeEnabled || (subscription?.enabled ?? false),
      hasReply: target.hasReply,
      alreadySent: already !== null,
      optedOut: target.optedOut,
      silenceDays: target.silenceDays,
      requiredSilenceDays: subscription?.silence_days ?? 7,
      recipient: target.recipient,
      sentToday,
    }

    const verdict = playbookVerdict(candidate, now)
    if (verdict.allowed) return { allowed: true, reason: null }
    // « Rien n'est parti parce que tu ne l'as pas encore validé » et « rien
    // n'est parti parce que c'est déjà relancé » appellent deux gestes
    // différents. Le contrat pur ne connaît que `alreadySent` — il ne voit pas
    // la base ; la nuance se lit ICI, où l'état de la ligne est disponible.
    if (verdict.reason === 'already_sent' && already?.state === 'pending_approval') {
      return { allowed: false, reason: 'awaiting_approval' }
    }
    return { allowed: false, reason: verdict.reason }
  }

  /**
   * Réserve l'envoi AVANT qu'il parte, et le met EN ATTENTE d'un humain.
   *
   * Rend `false` si la trace existe déjà — deux balayages concurrents passeraient
   * tous deux un contrôle préalable, et le doublon serait un second e-mail chez
   * un client. Rater une relance se répare ; en envoyer deux ne se rattrape pas.
   *
   * ⚠️ Depuis le 26/08/2026 la ligne posée n'est plus « c'est parti » mais
   * « c'est prêt, quelqu'un doit valider ». Le texte est FIGÉ ici : recomposer
   * au moment de l'approbation ferait valider un message et en envoyer un autre.
   */
  async requestApproval(
    workspaceId: string,
    playbook: PlaybookKey,
    target: { targetId: string; recipient: string; ownerId: string; subject: string; body: string },
    now: Date = new Date(),
  ): Promise<boolean> {
    const rows = await this.sends.manager.query<{ id: string }[]>(
      `INSERT INTO playbook_sends
         (workspace_id, playbook, target_id, recipient, state, subject, body, owner_id, expires_at)
       VALUES ($1, $2, $3, $4, 'pending_approval', $5, $6, $7, $8)
       ON CONFLICT (workspace_id, playbook, target_id) DO NOTHING
       RETURNING id`,
      [
        workspaceId,
        playbook,
        target.targetId,
        target.recipient,
        target.subject,
        target.body,
        target.ownerId,
        playbookApprovalDeadline(now),
      ],
    )
    return rows.length > 0
  }

  /**
   * Combien de relances attendent DÉJÀ ce propriétaire sur ce playbook.
   *
   * Le balayeur s'en sert pour ne notifier qu'une fois par vague : renotifier à
   * chaque passage de cron produirait vingt notifications par jour, et la
   * première chose qu'on ferait serait de désarmer le playbook.
   */
  async countPendingFor(ownerId: string, playbook: PlaybookKey): Promise<number> {
    return this.sends.count({ where: { owner_id: ownerId, playbook, state: 'pending_approval' } })
  }

  /**
   * Ce qui attend la validation de cet utilisateur.
   *
   * Une demande PÉRIMÉE n'est pas rendue : la montrer laisserait croire qu'on
   * peut encore la faire partir. Elle est marquée au passage — un état qui ne
   * se met à jour qu'à la lecture serait faux pour quiconque ne regarde pas.
   */
  async pendingApprovals(userId: string, now: Date = new Date()): Promise<PlaybookApproval[]> {
    await this.expireStale(now)
    const rows = await this.sends.find({
      where: { owner_id: userId, state: 'pending_approval' },
      order: { sent_at: 'ASC' },
    })
    return rows
      .filter(row => row.subject !== null && row.body !== null && !isPlaybookApprovalExpired(row.expires_at, now))
      .map(row => ({
        id: row.id,
        playbook: row.playbook as PlaybookKey,
        recipient: row.recipient,
        subject: row.subject as string,
        body: row.body as string,
        requestedAt: new Date(row.sent_at).toISOString(),
        expiresAt: new Date(row.expires_at as Date).toISOString(),
        // #2855 (#2201.14) — la PROVENANCE : quelle routine a composé cette
        // relance, dérivée de la colonne EXISTANTE `row.playbook` (aucune
        // migration). Le reste de `target` (compte, contact…) n'est pas
        // rempli ici : lot séparé antérieur, non repris par ce point.
        target: { ...EMPTY_WRITE_REQUEST_TARGET, source: { kind: 'routine' as const, ref: row.playbook } },
        // #2856 — reste : sans ce champ, l'écran ne pouvait ni sortir une
        // relance reportée de la file active ni proposer « Réveiller » —
        // même convention que `CrmWriteRequestView`/`AtsWrite`.
        snoozedUntil: row.snoozed_until ? new Date(row.snoozed_until).toISOString() : null,
      }))
  }

  /**
   * La demande à trancher, si elle appartient bien à celui qui décide.
   *
   * On ne cherche PAS par espace : la messagerie d'où partirait le message est
   * personnelle (D58). Laisser un collègue approuver un envoi depuis la boîte
   * d'un autre ferait partir un message signé de quelqu'un qui ne l'a pas relu.
   */
  async pendingForDecision(userId: string, id: string): Promise<PlaybookSendEntity | null> {
    return this.sends.findOne({ where: { id, owner_id: userId, state: 'pending_approval' } })
  }

  /**
   * #2856 — reste du lot précédent : REPORTER une relance en attente de MA
   * validation (`null` la réveille). Rien n'est décidé : la ligne reste
   * `pending_approval` et repasse par `pendingForDecision` à son réveil.
   *
   * PAS `canSnooze` (Action OS, `approval-policy.ts`, déjà réutilisé par
   * `OutboundWriteService.snooze` et `AtsWriteService.snooze`) : cette file
   * n'a ni demandeur ni responsable distinct du propriétaire — D58 dit que la
   * messagerie d'où partirait le message est PERSONNELLE, jamais déléguée.
   * Le scope `owner_id: userId` de `findOne` EST la règle : un tiers, même
   * responsable d'équipe, ne trouve simplement pas la ligne.
   */
  async snooze(userId: string, id: string, until: Date | null, now: Date = new Date()): Promise<PlaybookSendEntity> {
    const pending = await this.sends.findOne({ where: { id, owner_id: userId, state: 'pending_approval' } })
    if (!pending) throw new NotFoundException("Cette relance n'attend plus ta validation.")
    if (isPlaybookApprovalExpired(pending.expires_at, now)) {
      throw new BadRequestException('Cette relance a expiré. Elle ne sera pas envoyée.')
    }
    if (until !== null) {
      if (until.getTime() <= now.getTime()) throw new BadRequestException('La date de report doit être future.')
      if (pending.expires_at && until.getTime() > new Date(pending.expires_at).getTime()) {
        throw new BadRequestException('Cette relance expire avant la date choisie : reportez-la moins loin.')
      }
    }
    const claimed = await this.sends.update(
      { id: pending.id, owner_id: userId, state: 'pending_approval' },
      { snoozed_until: until },
    )
    if (!claimed.affected) throw new BadRequestException('Cette relance a déjà été tranchée.')
    return { ...pending, snoozed_until: until }
  }

  /** Trace la décision. `approve` ne dit PAS que c'est parti — seulement que c'est autorisé. */
  async markDecision(
    id: string,
    userId: string,
    state: PlaybookSendState,
    reason: string | null,
    now: Date = new Date(),
  ): Promise<void> {
    await this.sends.update({ id }, { state, decided_by: userId, decided_at: now, decision_reason: reason })
  }

  /** L'envoi est RÉELLEMENT parti. C'est le seul endroit qui pose cette date. */
  async markDispatched(id: string, now: Date = new Date()): Promise<void> {
    await this.sends.update({ id }, { state: 'sent', dispatched_at: now })
  }

  /**
   * Approuvé, mais l'envoi a échoué.
   *
   * L'état ne retourne PAS en attente : la décision a été prise, et revalider
   * ferait repartir un message peut-être déjà passé. « On a essayé et ça n'est
   * pas passé » est une information ; « rien ne s'est passé » n'en est pas une.
   */
  async markFailed(id: string, reason: string, now: Date = new Date()): Promise<void> {
    await this.sends.update({ id }, { state: 'failed', decision_reason: reason, decided_at: now })
  }

  /**
   * Périme ce que personne n'a tranché en trois jours.
   *
   * Une demande périmée ne part JAMAIS, et elle n'est pas reproposée : l'index
   * unique de la table est ce qui garantit qu'on ne relance pas deux fois la
   * même cible. Le prix assumé est qu'une relance ignorée est perdue — le prix
   * inverse serait de reproposer indéfiniment ce que quelqu'un a laissé passer.
   */
  async expireStale(now: Date = new Date()): Promise<number> {
    const result = await this.sends.manager.query<{ id: string }[]>(
      `UPDATE playbook_sends
          SET state = 'expired', decided_at = $1
        WHERE state = 'pending_approval' AND (expires_at IS NULL OR expires_at <= $1)
        RETURNING id`,
      [now],
    )
    const expired = returnedRows(result).length
    if (expired > 0) this.logger.log(`${expired} relance(s) automatique(s) périmée(s) faute de validation`)
    return expired
  }

  /**
   * SIMULER : ce que ce playbook ferait s'il était armé, sans rien envoyer.
   *
   * Exigé par le §43 du rapport pour toute automatisation de niveau 4 ou 5, et
   * par la porte G5 du §53 (« simulation sur données réelles sans write »). La
   * raison tient en une phrase : personne ne peut raisonnablement autoriser des
   * e-mails automatiques vers ses clients sans avoir vu, sur SES données, qui
   * les recevrait et ce qu'ils liraient.
   *
   * Aucune écriture : ni réservation, ni envoi, ni armement. La méthode partage
   * la source de cibles ET le composeur de message du balayeur — une simulation
   * qui calculerait sa propre liste montrerait autre chose que ce qui partira.
   */
  async dryRun(userId: string, playbook: PlaybookKey, now: Date = new Date()): Promise<PlaybookDryRun> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const subscription = await this.subscriptions.findOne({ where: { workspace_id: workspaceId, playbook } })
    const targets = await this.targets.collect(playbook, workspaceId, PLAYBOOK_DRY_RUN_LIMIT)

    const entries: PlaybookDryRunEntry[] = []
    const blocked: Partial<Record<PlaybookBlockReason, number>> = {}

    for (const target of targets) {
      const optedOut = target.recipient ? await this.suppression.isSuppressed(workspaceId, target.recipient) : false
      const verdict = await this.evaluate(
        workspaceId,
        playbook,
        {
          id: target.targetId,
          hasReply: target.hasReply,
          optedOut,
          silenceDays: target.silenceDays,
          recipient: target.recipient,
        },
        now,
        true,
      )
      if (verdict.reason) blocked[verdict.reason] = (blocked[verdict.reason] ?? 0) + 1
      entries.push({
        targetId: target.targetId,
        label: target.label,
        recipient: target.recipient,
        wouldSend: verdict.allowed,
        reason: verdict.reason,
        silenceDays: target.silenceDays,
        subject: target.subject,
      })
    }

    return {
      playbook,
      // L'état RÉEL, pas celui qu'on a supposé pour juger : l'écran doit dire
      // « éteint » même quand la simulation montre dix envois possibles.
      enabled: subscription?.enabled ?? false,
      evaluatedAt: now.toISOString(),
      wouldSend: entries.filter(entry => entry.wouldSend).length,
      blocked,
      entries,
    }
  }

  /** Combien d'envois automatiques cet espace a déjà faits aujourd'hui. */
  private async countSentToday(workspaceId: string, now: Date): Promise<number> {
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const [{ count }] = await this.sends.manager.query<{ count: string }[]>(
      `SELECT count(*)::text AS count FROM playbook_sends WHERE workspace_id = $1 AND sent_at >= $2`,
      [workspaceId, startOfDay],
    )
    return Number(count)
  }

  // ───────────────────────── file d'intervention ───────────────────────────

  /** Ce qui attend un responsable, le plus ancien d'abord. */
  async listInterventions(userId: string): Promise<Intervention[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.interventions.manager.query<
      (InterventionEntity & {
        first_name: string | null
        last_name: string | null
        email: string | null
        live_due_on?: string | null
        invoiced_amount_cents?: number | null
        paid_at?: Date | string | null
        paid_amount_cents?: number | null
        client_label?: string | null
      })[]
    >(
      // #3671 — `live_due_on` : l'échéance VIVANTE d'une facture en retard
      // (`subject_id` = `invoice_readiness.id`, voir le balayage), pour relire
      // l'ancienneté avec la formule unique au lieu de la phrase stockée.
      `SELECT i.*, p.first_name, p.last_name, p.email, ir.due_on::text AS live_due_on,
              ir.invoiced_amount_cents, ir.paid_at, ir.paid_amount_cents, a.company_name AS client_label
         FROM interventions i
         LEFT JOIN profiles p ON p.user_id = i.owner_id
         LEFT JOIN invoice_readiness ir ON i.kind = 'payment_overdue' AND ir.id::text = i.subject_id::text
         LEFT JOIN missions pm ON pm.id = ir.mission_id
         LEFT JOIN accounts a ON a.id = pm.account_id
        WHERE i.workspace_id = $1 AND i.state <> 'resolved'
        -- Le tri d'ici ne sert qu'a rendre la BORNE deterministe : au-dela de
        -- 100 lignes, on garde les plus anciennes plutot qu'un echantillon au
        -- hasard. L'ordre FINAL est calcule par rankInterventions, en
        -- TypeScript -- une formule enfouie dans une clause SQL ne se teste pas.
        ORDER BY i.opened_at ASC
        LIMIT 100`,
      [workspaceId],
    )
    const now = new Date()
    // Recette 14/10 : une ligne par CLIENT pour les factures en retard.
    const overdueMetas = new Map<string, OverdueMeta>(
      rows
        .filter(row => row.kind === 'payment_overdue')
        .map(row => [
          row.id,
          {
            clientLabel: row.client_label?.trim() || null,
            dueOn: row.live_due_on ?? null,
            invoicedAmountCents: row.invoiced_amount_cents ?? null,
            paidAt: row.paid_at ? String(row.paid_at) : null,
            paidAmountCents: row.paid_amount_cents ?? null,
          },
        ]),
    )
    const ranked = rankInterventions(
      rows.map(row => {
        const full = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
        return {
          id: row.id,
          kind: row.kind as InterventionKind,
          subjectType: row.subject_type as Intervention['subjectType'],
          subjectId: row.subject_id,
          subjectLabel: null,
          ownerId: row.owner_id,
          ownerName: full || row.email || null,
          detail:
            row.kind === 'payment_overdue' ? withLiveOverdueDays(row.detail, row.live_due_on ?? null, now) : row.detail,
          state: row.state as Intervention['state'],
          openedAt: new Date(row.opened_at).toISOString(),
          resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
        }
      }),
      now,
    )
    return groupOverdueByClient(ranked, overdueMetas, now)
  }

  /**
   * Ouvre une intervention, sans doublonner.
   *
   * `DO NOTHING` sur `(espace, nature, sujet)` : un même problème ne réapparaît
   * pas à chaque balayage. Une file qui se remplit toute seule devient une
   * seconde boîte de réception, et une seconde boîte de réception ne se lit pas.
   */
  async open(input: {
    workspaceId: string
    kind: InterventionKind
    subjectType: Intervention['subjectType']
    subjectId: string
    ownerId: string | null
    detail: string
  }): Promise<boolean> {
    const rows = await this.interventions.manager.query<{ id: string }[]>(
      `INSERT INTO interventions (workspace_id, kind, subject_type, subject_id, owner_id, detail)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (workspace_id, kind, subject_id) DO NOTHING
       RETURNING id`,
      [input.workspaceId, input.kind, input.subjectType, input.subjectId, input.ownerId, input.detail],
    )
    if (rows.length > 0) return true
    // #3671 — `DO NOTHING` figeait la phrase à sa date d'ouverture : « échéance dépassée depuis 31
    // jours » restait affiché 38 jours après, à côté d'une carte qui lisait 69 (même facture).
    // Un retard de paiement porte un NOMBRE DE JOURS qui change chaque nuit : tant que l'ouverture
    // n'est pas résolue, le balayage en réécrit la phrase. Seule cette nature — les autres
    // phrases ne dépendent pas de la date du jour.
    if (input.kind === 'payment_overdue') {
      await this.interventions.manager.query(
        `UPDATE interventions SET detail = $4
         WHERE workspace_id = $1 AND kind = $2 AND subject_id = $3
           AND state <> 'resolved' AND detail IS DISTINCT FROM $4`,
        [input.workspaceId, input.kind, input.subjectId, input.detail],
      )
    }
    return false
  }

  async decide(userId: string, interventionId: string, input: DecideInterventionInput): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const result = await this.interventions.update(
      { id: interventionId, workspace_id: workspaceId },
      {
        state: input.state,
        // Une intervention seulement PRISE EN COMPTE n'est pas résolue : lui
        // poser une date de résolution la ferait disparaître d'une file où elle
        // doit rester tant que le problème existe.
        resolved_at: input.state === 'resolved' ? new Date() : null,
        resolved_by: input.state === 'resolved' ? userId : null,
        // Le motif est exigé par le contrat pour clore, facultatif pour accuser
        // réception. On n'ÉCRASE pas un motif existant avec un `undefined` :
        // accuser réception d'une ligne déjà commentée ne doit pas effacer ce
        // qui avait été écrit.
        ...(input.reason ? { decision_reason: input.reason } : {}),
      },
    )
    if (!result.affected) throw new NotFoundException('Intervention introuvable')
  }

  /**
   * #2206.53 — attribuer (ou libérer) une intervention.
   *
   * `owner_id` existait déjà sur la ligne, lu et affiché — mais aucune route
   * ne l'écrivait : `InterventionsBlock.tsx:161` le montrait en LECTURE SEULE.
   * `AssignmentController` (`PATCH /accounts/:id/assign`) réassigne un COMPTE,
   * jamais une intervention.
   *
   * Réservé au manager (`team:manage`, porté par le contrôleur) : la source
   * dit « le manager peut attribuer une action », jamais un auto-service de
   * la ligne par le commercial lui-même — contrairement à l'attribution de
   * compte, qui distingue les deux gestes.
   */
  async assign(userId: string, interventionId: string, input: AssignInterventionInput): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)

    // Seulement quand on POINTE réellement vers quelqu'un : libérer n'a
    // personne à valider.
    if (input.ownerId !== null) {
      const membership = await this.workspaceContext.getMembership(input.ownerId, workspaceId)
      if (!membership) throw new BadRequestException("Ce membre n'appartient pas à l'espace de travail")
    }

    const result = await this.interventions.update(
      { id: interventionId, workspace_id: workspaceId },
      { owner_id: input.ownerId },
    )
    if (!result.affected) throw new NotFoundException('Intervention introuvable')
  }
}
