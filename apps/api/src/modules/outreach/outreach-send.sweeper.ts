import { randomUUID } from 'node:crypto'
import { Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { withinQuietHours } from '@bellum/contracts'
import { Correlated } from '../../correlation-id/background-correlation'
import { killSwitchCut } from '../../common/kill-switches'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { MailboxService } from '../mailbox/mailbox.service'
import { CrmService } from '../crm/crm.service'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import type { OutreachMessageEntity } from '../../database/entities/outreach-message.entity'
import { OutreachDelegationService } from './outreach-delegation.service'
import { OutreachMessageService } from './outreach-message.service'

/**
 * #4016 L5 (reprise 20/10) — les attentes DÉFINITIVES d'un message déposé sous mandat : plus de mandat
 * de sa portée, mandat révoqué ou expiré (un renouvellement est un NOUVEAU mandat, signé après le fait :
 * il ne le couvrira jamais — pas de mandat rétroactif), fait né avant la signature, autre portée.
 * Les autres (pause, fenêtre, plafond, échéance, boîte) sont passagères : le message reste dans la file.
 */
const MANDATE_NEVER_COVERS: ReadonlySet<string> = new Set([
  'no_delegation',
  'revoked',
  'expired',
  'predates_mandate',
  'scope_mismatch',
  // Séquence arrêtée ou terminée, étape faite ou sautée (portée `workspace_sequences`).
  'sequence_over',
  // #5029.2 — séquence qui propose un consultant (Reverse Market) : toujours manuelle, jamais sous mandat.
  'manual_only',
])

/**
 * #3069 — LE DISPATCHER D'ENVOI OUTREACH.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'IL CORRIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `outreach_messages.status = 'approved'` voulait dire « un humain a validé CE
 * TEXTE exact » (`OutreachMessageService.approveMany`, preuve dans
 * `message.approval`). Rien ne le reprenait ensuite : la seule route qui posait
 * `sent` était `transition()`, une transition DÉCLARATIVE sans jamais appeler
 * un connecteur d'envoi — exactement le hard failure que la doctrine interdit
 * (« Fait ne porte jamais preuve d'envoi »). Un message validé restait
 * `approved` pour toujours, ou un appelant aurait pu le déclarer `sent` sans
 * qu'il soit jamais parti.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER ORCHESTRE — RIEN N'EST RÉIMPLÉMENTÉ
 * ─────────────────────────────────────────────────────────────────────────────
 *  - la population vient de `OutreachMessageService.listApproved` ;
 *  - le mouvement d'état vient de `markSending`/`markSent`/`markSendFailed`,
 *    qui rejouent la MÊME machine à états que le reste du module
 *    (`checkOutreachTransition`, #2366.4) — aucune écriture directe ;
 *  - **l'envoi passe par `MailboxService.sendBatch`**, le même chemin gouverné
 *    que `PlaybooksController.decideSend` (opt-out, dédoublonnage, arrêt après
 *    trois échecs, signature du compte connecté). Un émetteur maison aurait dû
 *    redémontrer tout cela.
 *
 * Ordre des opérations : on ANNONCE (`sending`) avant d'appeler le connecteur,
 * puis on CONFIRME (`sent`, avec la preuve que le connecteur a rendue) ou on
 * NOMME l'échec (`failed`). Jamais l'inverse — un `sent` posé avant l'appel
 * mentirait au premier plantage entre les deux lignes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SEUL LE CANAL E-MAIL EST DISPATCHÉ — TRANCHÉ SANS LOUIS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * LinkedIn, téléphone, manuel et messagerie vocale n'ont AUCUN connecteur
 * d'envoi programmatique ici — en inventer un fabriquerait un faux `sent`, le
 * hard failure que #3069 existe pour éviter. Ces canaux ne sont PAS orphelins
 * pour autant : `outreachApprovalView` range déjà `approved` sans bloquant dans
 * la vue `ready` du centre d'approbation existant, où le geste manuel (copier
 * le texte, puis `copied_manual`) est le chemin voulu. Ce dispatcher les laisse
 * intacts plutôt que d'inventer un second centre de tâches à côté de celui qui
 * existe déjà (GA-26 : un réglage — ici, « qu'est-ce qui attend une action » —
 * vit à un seul endroit).
 *
 * Interrupteur d'urgence : `OUTREACH_SEND_DISABLED=true`.
 */
@Injectable()
export class OutreachSendSweeper {
  private readonly logger = new Logger(OutreachSendSweeper.name)

  /** Un passage ne vide jamais toute la file d'un coup — même raison que `MAX_BATCH_RECIPIENTS`. */
  private static readonly BATCH_LIMIT = 50

  constructor(
    private readonly outreach: OutreachMessageService,
    private readonly mailbox: MailboxService,
    // #2386.3 — reflet best-effort sur la fiche CRM après un envoi CONFIRMÉ.
    // `@Optional()` (règle #7, même porte que `ActivitiesService`/`LinkedInService` :
    // retirer `CrmModule` ne casse pas l'envoi, il perd seulement son reflet).
    @Optional() private readonly crm?: CrmService,
    @Optional() private readonly locks?: SingletonLockService,
    // #3420 (recette 03/10) — une salle de démo n'envoie JAMAIS : sans cette porte
    // le balayeur reprenait le message « Validé » d'exemple, la messagerie fictive
    // le refusait, et la fiche affichait « En échec » à la place de « Validé ».
    @Optional() @InjectRepository(WorkspaceEntity) private readonly workspaces?: Repository<WorkspaceEntity>,
    // #3702.9 — la porte du mandat (c89). Sans lui : aucun message délégué ne part (inconnu ⇒ attend).
    @Optional() private readonly delegations?: OutreachDelegationService,
  ) {}

  /** Toutes les dix minutes — un message approuvé n'a pas la patience de la fenêtre des playbooks. */
  @Cron('*/10 * * * *', { name: 'outreach-send-sweep' })
  @Correlated('cron:outreach.send')
  async runSweep(): Promise<void> {
    await withSingletonLock(this.locks, 'outreach-send-sweep', async () => {
      await this.sweep()
    })
  }

  /**
   * Balaye les messages `approved` et envoie ce qui peut réellement partir.
   * Public pour être testable et pour servir un « exécuter maintenant ».
   *
   * `now` par défaut l'horloge réelle — un paramètre explicite plutôt qu'une
   * lecture interne, pour la même raison que `playbookVerdict(candidate, now)` :
   * un garde-fou d'heures calmes qui lit l'horloge lui-même ne se teste pas.
   */
  async sweep(now: Date = new Date()): Promise<{ sent: number; failed: number }> {
    if (killSwitchCut('outreach.send')) {
      this.logger.log('Dispatcher outreach désactivé (OUTREACH_SEND_DISABLED=true)')
      return { sent: 0, failed: 0 }
    }
    // #2406.29 — hard failure nommée : un job planifié qui envoie SANS
    // politique d'heure. Ce dispatcher tourne 24/7, toutes les dix minutes ;
    // sans cette porte, un message approuvé un soir partirait à 3 h du matin
    // ou un dimanche — même politique que les envois automatisés playbook
    // (`withinQuietHours`, `packages/contracts/src/schemas/playbook.ts`), pas
    // un second seuil inventé. Rien n'est perdu : le message reste `approved`
    // et repart au prochain passage, une fois dans la fenêtre.
    if (!withinQuietHours(now)) {
      this.logger.log('Dispatcher outreach hors heures calmes — reporté au prochain passage')
      return { sent: 0, failed: 0 }
    }

    const approved = await this.outreach.listApproved(OutreachSendSweeper.BATCH_LIMIT)
    let sent = 0
    let failed = 0
    for (const message of approved) {
      try {
        const outcome = await this.dispatchOne(message, now)
        if (outcome === 'sent') sent++
        else if (outcome === 'failed') failed++
      } catch (error) {
        // Un message isolé : un contact introuvable ne doit pas priver tout le
        // reste de la file de son passage.
        this.logger.error('Dispatch outreach en échec pour un message', { error, messageId: message.id })
      }
    }
    // #4016 L5 — les messages déposés par un USAGE (Laura, relance d'impayé, suivi de rendez-vous,
    // séquences de l'espace) qui ATTENDENT un mandat. Sans le service des mandats : rien (inconnu ⇒ attend).
    const awaitingMandate = this.delegations
      ? await this.outreach.listAwaitingMandate(OutreachSendSweeper.BATCH_LIMIT, now)
      : []
    for (const message of awaitingMandate) {
      try {
        const outcome = await this.dispatchUnderMandate(message, now)
        if (outcome === 'sent') sent++
        else if (outcome === 'failed') failed++
      } catch (error) {
        this.logger.error('Dispatch sous mandat en échec pour un message', { error, messageId: message.id })
      }
    }
    if (sent || failed) {
      this.logger.log(`Dispatcher outreach — ${sent} envoyé(s), ${failed} échoué(s)`)
    }
    return { sent, failed }
  }

  /**
   * #4016 L5 — un message qui attend un MANDAT ne part que si la porte du mandat
   * le dit, À CET INSTANT : mandat actif de sa portée, faits du contact relus
   * (réponse, opposition, exclusion, effacement), fenêtre, plafond, boîte et
   * lecture des réponses. Validé sous mandat (mêmes bloquants que le clic), il
   * suit ensuite EXACTEMENT le chemin d'envoi de `dispatchOne`.
   */
  private async dispatchUnderMandate(
    message: OutreachMessageEntity,
    now: Date,
  ): Promise<'sent' | 'failed' | 'skipped'> {
    const workspaceId = message.workspace_id
    if (!workspaceId || !this.delegations) return 'skipped'
    if (message.channel !== 'email') return 'skipped'
    const room = await this.workspaces?.findOne({ where: { id: workspaceId }, select: { id: true, is_demo: true } })
    if (room?.is_demo) return 'skipped'
    const gate = await this.delegations.gateAwaitingMandate(
      message,
      await this.mailbox.status(message.user_id),
      this.delegations.stopLookup(workspaceId),
      now,
    )
    if (gate.kind === 'stop') {
      await this.outreach.cancelByDelegation(workspaceId, message.id, gate.reason)
      return 'skipped'
    }
    // #4016 L5 (reprise 20/10) — aucun mandat ne couvrira plus ce message : il SORT de la file (sinon
    // cinquante orphelins la bouchent) et reste en relecture, validable d'un clic. Rien ne part.
    if (gate.kind === 'hold' && MANDATE_NEVER_COVERS.has(gate.reason)) {
      await this.outreach.releaseMandate(workspaceId, message.id)
      return 'skipped'
    }
    if (gate.kind !== 'run') return 'skipped'
    return this.send(message, workspaceId, gate.delegationId)
  }

  private async dispatchOne(message: OutreachMessageEntity, now: Date): Promise<'sent' | 'failed' | 'skipped'> {
    const workspaceId = message.workspace_id
    // Une ligne sans espace ne devrait pas exister (colonne indexée, jamais
    // NULL en pratique) — on ne devine pas un espace, on passe.
    if (!workspaceId) return 'skipped'

    // Canal sans connecteur d'envoi ici (voir l'en-tête) : intact, jamais un faux départ.
    if (message.channel !== 'email') return 'skipped'

    // Salle de démo : le message d'exemple reste dans l'état où le semis l'a posé.
    const room = await this.workspaces?.findOne({ where: { id: workspaceId }, select: { id: true, is_demo: true } })
    if (room?.is_demo) return 'skipped'

    // RÉSERVER (announce) AVANT tout — y compris avant de lire le contenu à
    // envoyer : `sending` est le SEUL état d'où `failed` est atteignable
    // (#2366.4, `MESSAGE_TRANSITIONS.approved` n'y mène pas directement). Deux
    // passages concurrents ne peuvent pas reprendre le même message deux fois,
    // la machine à états tranche (`checkOutreachTransition`, idempotent).
    // #3702 (c89) — un message rattaché à un mandat passe par SA porte : sans
    // mandat lisible il attend, un fait du contact l'annule, le plafond se
    // réserve ici. Sans condition `delegation:`, c81 s'applique inchangée.
    let reservedDelegation: string | null = null
    if (message.approval?.conditions?.some(c => c.startsWith('delegation:'))) {
      if (!this.delegations) return 'skipped'
      const gate = await this.delegations.gate(message, await this.mailbox.status(message.user_id), now)
      if (gate.kind === 'stop') {
        await this.outreach.cancelByDelegation(workspaceId, message.id, gate.reason)
        return 'skipped'
      }
      if (gate.kind === 'hold') return 'skipped'
      if (gate.kind === 'run') reservedDelegation = gate.delegationId
    }
    return this.send(message, workspaceId, reservedDelegation)
  }

  /** Le chemin d'envoi UNIQUE (annonce → connecteur → preuve ou échec nommé), mandat ou clic. */
  private async send(
    message: OutreachMessageEntity,
    workspaceId: string,
    reservedDelegation: string | null,
  ): Promise<'sent' | 'failed' | 'skipped'> {
    const claimed = await this.outreach.markSending(workspaceId, message.id)
    if (!claimed) {
      if (reservedDelegation) await this.delegations?.release(reservedDelegation)
      return 'skipped'
    }

    const payload = await this.outreach.dispatchPayload(workspaceId, message)
    if (!payload.address) {
      await this.outreach.markSendFailed(workspaceId, message.id, 'Aucune adresse e-mail sur ce contact.')
      await this.releaseQuota(reservedDelegation)
      return 'failed'
    }
    if (!payload.subject || !payload.body.trim()) {
      await this.outreach.markSendFailed(workspaceId, message.id, 'Message vide ou sans objet — rien à envoyer.')
      await this.releaseQuota(reservedDelegation)
      return 'failed'
    }

    try {
      const result = await this.mailbox.sendBatch(message.user_id, {
        batchId: randomUUID(),
        mode: 'send',
        items: [{ to: payload.address, subject: payload.subject, body: payload.body }],
      })
      const outcome = result.outcomes[0]
      if (result.sent < 1 || !outcome || outcome.status !== 'sent') {
        const reason = outcome?.error ?? "La messagerie n'a pas envoyé le message."
        await this.outreach.markSendFailed(workspaceId, message.id, reason)
        await this.releaseQuota(reservedDelegation)
        return 'failed'
      }
      // #3234 — l'identifiant de message du fournisseur rejoint la preuve d'envoi
      // (puis la colonne) quand il en a rendu un ; jamais le corps.
      await this.outreach.markSent(workspaceId, message.id, {
        mailboxBatchId: result.batchId,
        to: outcome.to,
        ...(outcome.providerMessageId ? { providerMessageId: outcome.providerMessageId } : {}),
        ...(outcome.providerThreadId ? { providerThreadId: outcome.providerThreadId } : {}),
      })
      await this.mirrorSentToCrm(message.user_id, payload.address)
      return 'sent'
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Envoi impossible'
      await this.outreach.markSendFailed(workspaceId, message.id, reason)
      await this.releaseQuota(reservedDelegation)
      return 'failed'
    }
  }

  /** Un envoi réservé que le connecteur n'a pas fait n'entame pas le plafond du mandat. */
  private async releaseQuota(delegationId: string | null): Promise<void> {
    if (delegationId) await this.delegations?.release(delegationId)
  }

  /**
   * #2386.3 — reflète l'envoi CONFIRMÉ sur la fiche CRM du contact. Best-effort,
   * jamais bloquant (même garde que `LinkedInService.mirrorToCrm`) : un jeton
   * CRM expiré ne doit pas faire régresser un envoi déjà réellement parti.
   *
   * Seul un LABEL générique est écrit — jamais le sujet ni le corps du message
   * (doctrine D65, `agent_docs/doctrine.md:33` : le corps ne sort jamais vers
   * un humain, et la fiche CRM en est un).
   *
   * ⚠️ Intégration M (27/09/2026) : la branche `integration-i-27-09` portait la
   * MÊME capacité sous #2386.B (`writebackCrmSentNote`), avec une note incluant
   * le SUJET du message (`Message envoyé — ${subject}`) — écarté au profit de
   * cette version car il exposerait un fragment du message vers la fiche CRM,
   * ce que D65 interdit précisément.
   */
  private async mirrorSentToCrm(userId: string, address: string | null): Promise<void> {
    if (!this.crm) return
    try {
      const record = await this.crm.findContactRecord(userId, address)
      if (!record) return
      await this.crm.logActivity(userId, record.recordId, 'E-mail envoyé')
    } catch (error) {
      this.logger.warn('Reflet CRM de l’envoi outreach en échec (non bloquant)', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
