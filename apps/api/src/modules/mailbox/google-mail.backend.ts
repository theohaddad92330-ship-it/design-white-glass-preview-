import { Injectable, Logger } from '@nestjs/common'
import type {
  MailAttachment,
  MailDraftRequest,
  MailDraftResult,
  MailMessage,
  MailboxSender,
  MailboxStatus,
  OutOfOfficeRequest,
} from '@bellum/contracts'
import { mapWithConcurrencySettled, retryOnThrottle } from '../../common/util/concurrency'
import { encodeGmailRaw, type GmailAttachment } from '../google/google.client'
import { GoogleService } from '../google/google.service'
import { renderGmailQuery, type MailQuerySpec } from './mail-query'
import {
  appendSignature,
  htmlSignatureToText,
  type MailboxBackend,
  type OutgoingMailAttachment,
  type MailboxSignature,
  type MailSearchOutcome,
  type MailSendReceipt,
  type MailThreadBodies,
} from './mailbox-backend'
import { normalizeAddress } from './no-reply'

/**
 * La messagerie Google, vue à travers l'interface `MailboxBackend`.
 *
 * Deux détails d'implémentation méritent d'être lus avant de toucher au
 * fichier, parce qu'ils ont l'air d'être des raccourcis et n'en sont pas.
 *
 * 1. Gmail rend des identifiants de message, pas des messages. Il faut donc un
 *    appel par message pour obtenir ses en-têtes. On borne à
 *    `MAX_DETAIL_FETCHES` : au-delà, la latence d'un brief du jour devient
 *    inacceptable, et un commercial qui doit relire 80 fils n'a de toute façon
 *    pas besoin du 81e pour décider quoi faire ce matin.
 *
 * 2. Gmail n'expose PAS « ce message a-t-il une pièce jointe » dans le format
 *    métadonnées, et le format complet ramènerait le corps entier des messages.
 *    On rejoue donc la même recherche avec `has:attachment` et on croise les
 *    identifiants : un appel de liste supplémentaire, exact, et aucun corps lu.
 */

/** Au-delà, on tronque et on le DIT (`truncated`). */
const MAX_DETAIL_FETCHES = 60
/**
 * Lectures Gmail simultanées, par utilisateur.
 *
 * Gmail refuse au-delà d'une poignée de requêtes en vol sur le même compte
 * (« Too many concurrent requests for user ») et fait alors tomber l'appel
 * entier. Cinq suffisent à saturer la latence réseau ; au-delà on n'achète
 * qu'un risque de refus.
 */
const GMAIL_READ_CONCURRENCY = 5

@Injectable()
export class GoogleMailBackend implements MailboxBackend {
  private readonly logger = new Logger(GoogleMailBackend.name)

  constructor(private readonly google: GoogleService) {}

  async status(userId: string): Promise<Omit<MailboxStatus, 'connectedCount'> | null> {
    if (!this.google.isConfigured()) return null
    const status = await this.google.getStatus(userId)
    if (!status.connected) return null
    const capabilities = status.capabilities
    // #3702 — une connexion sans étiquette (posée avant qu'elle soit stockée) a quand même une boîte :
    // son adresse se lit au profil Gmail. `null` seulement si le profil ne la donne pas.
    const address = status.accountLabel ?? (capabilities?.gmail ? await this.profileAddress(userId) : null)
    return {
      connected: true,
      provider: 'google',
      address,
      capabilities: {
        read: Boolean(capabilities?.gmailRead),
        draft: Boolean(capabilities?.gmailDraft),
        send: Boolean(capabilities?.gmail),
        labels: Boolean(capabilities?.gmailLabels),
        outOfOffice: Boolean(capabilities?.gmailSettings),
      },
    }
  }

  async senders(userId: string): Promise<MailboxSender[]> {
    const connections = await this.google.listConnections(userId)
    return connections.map(connection => ({
      connectionId: connection.id,
      provider: 'google',
      address: connection.accountLabel,
      capabilities: {
        read: connection.capabilities.gmailRead,
        draft: connection.capabilities.gmailDraft,
        send: connection.capabilities.gmail,
      },
    }))
  }

  private async profileAddress(userId: string): Promise<string | null> {
    try {
      const { client, accessToken } = await this.google.authorize(userId)
      const profile = await client.getProfile(accessToken)
      return profile.emailAddress?.includes('@') ? profile.emailAddress : null
    } catch (error) {
      this.logger.warn(`Gmail profile lookup failed: ${(error as Error).message}`)
      return null
    }
  }

  async search(userId: string, spec: MailQuerySpec, limit: number): Promise<MailSearchOutcome> {
    const { client, accessToken } = await this.google.authorize(userId)
    const query = renderGmailQuery(spec)

    // On demande volontairement plus d'identifiants que la borne d'affichage :
    // plusieurs messages appartiennent souvent au même fil, et c'est le nombre
    // de FILS qui compte pour l'utilisateur.
    const wanted = Math.min(limit * 3, MAX_DETAIL_FETCHES)
    const ids = await client.listMessageIds(accessToken, { q: query, maxResults: wanted })
    if (!ids.length) return { messages: [], resolvedQuery: query, truncated: false }

    // PERF (P5, 29/09 — `GET /mailbox/search` mesuré à 2,4-2,9 s, constant) : la
    // sonde des pièces jointes (2e liste Gmail), le profil (adresse propre) et la
    // lecture des messages étaient trois appels sortants INDÉPENDANTS qui
    // s'enchaînaient — chacun refaisait en plus son `authorize`. Ils partent
    // ensemble ; les deux premiers sont best-effort (jamais de rejet).
    const withAttachmentsPromise = this.attachmentIds(userId, query, wanted)
    const ownAddressPromise = this.ownAddress(userId)

    // BORNÉ **et** TOLÉRANT, en deux temps qui viennent tous deux de la
    // production.
    //
    // La borne d'abord : soixante lectures simultanées sur la même boîte
    // faisaient répondre à Gmail « Too many concurrent requests for user ».
    // Elle a rendu le refus rare — le 17/08 au matin, la routine « relances sans
    // réponse » a quand même rendu « Échec », parce que le refus restait FATAL :
    // un seul message rejeté rejetait le lot, donc la recherche, donc la
    // routine. Cinquante-neuf fils lisibles disparaissaient avec le soixantième.
    //
    // Un message illisible coûte désormais ce message, et il est journalisé.
    const detailsPromise = mapWithConcurrencySettled(
      ids.slice(0, MAX_DETAIL_FETCHES),
      GMAIL_READ_CONCURRENCY,
      id => retryOnThrottle(() => client.getMessageDetail(accessToken, id.id)),
      (error, id) => this.logger.warn(`Gmail message ${id.id} skipped: ${(error as Error).message}`),
    )
    const [withAttachments, ownAddress, settledDetails] = await Promise.all([
      withAttachmentsPromise,
      ownAddressPromise,
      detailsPromise,
    ])
    const details = settledDetails.filter((detail): detail is NonNullable<typeof detail> => detail !== null)

    const messages: MailMessage[] = details.map(detail => ({
      id: detail.id,
      threadId: detail.threadId,
      subject: detail.subject,
      from: detail.from,
      to: detail.to,
      cc: detail.cc,
      date: detail.date,
      snippet: detail.snippet,
      unread: detail.labelIds.includes('UNREAD'),
      hasAttachments: withAttachments.has(detail.id),
      // Le libellé `SENT` est la vérité de Gmail ; l'adresse en est le filet,
      // pour les messages déposés par un autre client.
      direction:
        detail.labelIds.includes('SENT') || (ownAddress && normalizeAddress(detail.from ?? '') === ownAddress)
          ? 'outbound'
          : 'inbound',
    }))

    return {
      messages,
      resolvedQuery: query,
      truncated: ids.length >= wanted,
    }
  }

  /** Les identifiants, parmi ceux de `query`, qui portent une pièce jointe. */
  private async attachmentIds(userId: string, query: string, maxResults: number): Promise<Set<string>> {
    if (query.includes('has:attachment')) {
      // Déjà filtré à la source : tout ce qui remonte en porte une.
      return new Set<string>()
    }
    try {
      const { client, accessToken } = await this.google.authorize(userId)
      const ids = await client.listMessageIds(accessToken, { q: `${query} has:attachment`, maxResults })
      return new Set(ids.map(entry => entry.id))
    } catch (error) {
      // Signal secondaire : son absence dégrade un badge, elle ne doit pas faire
      // tomber une recherche.
      this.logger.warn(`Gmail attachment probe failed: ${(error as Error).message}`)
      return new Set<string>()
    }
  }

  private async ownAddress(userId: string): Promise<string | null> {
    try {
      const { client, accessToken } = await this.google.authorize(userId)
      const profile = await client.getProfile(accessToken)
      return profile.emailAddress ? normalizeAddress(profile.emailAddress) : null
    } catch {
      return null
    }
  }

  async listAttachments(userId: string, messageId: string): Promise<MailAttachment[]> {
    const { client, accessToken } = await this.google.authorize(userId)
    const raw = await client.listAttachments(accessToken, messageId)
    return raw.map(entry => ({ messageId, ...entry }))
  }

  /**
   * #2568.1 — le contenu, pour l'import CV. Deux appels Gmail : le détail du
   * message donne SA date (celle qui décide « la donnée la plus récente
   * gagne », #2569.2), l'appel `attachments.get` donne les octets. Aucun des
   * deux ne lit le CORPS du message (D65) — le premier reste en
   * `format=metadata`, le second ne rapporte que la pièce jointe demandée.
   */
  async getAttachment(
    userId: string,
    messageId: string,
    attachmentId: string,
  ): Promise<{ filename: string; mimeType: string | null; dataB64: string; messageDate: string | null } | null> {
    const { client, accessToken } = await this.google.authorize(userId)
    const attachments = await client.listAttachments(accessToken, messageId)
    const meta = attachments.find(entry => entry.attachmentId === attachmentId)
    if (!meta) return null
    const [dataB64, detail] = await Promise.all([
      client.getAttachmentBase64(accessToken, messageId, attachmentId),
      client.getMessageDetail(accessToken, messageId).catch(() => null),
    ])
    if (!dataB64) return null
    return { filename: meta.filename, mimeType: meta.mimeType, dataB64, messageDate: detail?.date ?? null }
  }

  async fetchBody(userId: string, messageId: string): Promise<{ plain: string | null; html: string | null }> {
    const { client, accessToken } = await this.google.authorize(userId)
    return client.getMessageBody(accessToken, messageId)
  }

  /** #4405.1 — le fil par son identifiant (`threads.get`), voir `GoogleClient.getThreadFull`. */
  async readThreadBodies(userId: string, threadId: string): Promise<MailThreadBodies | null> {
    const { client, accessToken } = await this.google.authorize(userId)
    const [thread, ownAddress] = await Promise.all([
      client.getThreadFull(accessToken, threadId),
      this.ownAddress(userId),
    ])
    if (!thread) return null
    return {
      subject: thread.find(message => message.subject)?.subject ?? null,
      messages: thread
        .map(message => ({
          direction:
            message.labelIds.includes('SENT') || (ownAddress && normalizeAddress(message.from ?? '') === ownAddress)
              ? ('outbound' as const)
              : ('inbound' as const),
          date: message.date,
          from: message.from,
          plain: message.plain,
          html: message.html,
        }))
        .sort((a, b) => Date.parse(a.date ?? '') - Date.parse(b.date ?? '') || 0),
    }
  }

  async createDraft(
    userId: string,
    request: MailDraftRequest,
    signature: string | null,
    connectionId?: string,
  ): Promise<MailDraftResult> {
    // #2078.22 — un brouillon est une écriture : le niveau accordé est vérifié
    // AVANT de lire la moindre pièce jointe ou d'appeler le fournisseur.
    const { client, accessToken } = await this.google.authorizeWrite(userId, 'gmailDraft', connectionId)
    const body = request.appendSignature ? appendSignature(request.body, signature) : request.body
    // Garde-fou n°26 : la pièce jointe RÉELLE, pas un lien. Un document
    // introuvable n'annule pas le brouillon — il partirait sans, et on le dit
    // dans les logs plutôt que de perdre le message rédigé.
    const attachments: GmailAttachment[] = []
    for (const documentId of request.documentIds) {
      try {
        attachments.push(await this.google.fetchDocumentForAttachment(userId, documentId))
      } catch (error) {
        this.logger.warn(`Drive attachment skipped (${documentId}): ${(error as Error).message}`)
      }
    }

    // #4417.1 — « réponds à ce mail » : le chat ne transmet que le `threadId`. Les en-têtes
    // In-Reply-To / References sont lus au DERNIER message du fil ; fil illisible → le brouillon est
    // quand même déposé dans le fil (threadId), sans en-tête inventé.
    let inReplyTo = request.inReplyTo
    let references: string | undefined
    if (!inReplyTo && request.threadId) {
      try {
        const anchor = await client.getThreadReplyAnchor(accessToken, request.threadId)
        if (anchor.messageId) {
          inReplyTo = anchor.messageId
          references = anchor.references ? `${anchor.references} ${anchor.messageId}` : anchor.messageId
        }
      } catch (error) {
        this.logger.warn(`Gmail thread anchor skipped (${request.threadId}): ${(error as Error).message}`)
      }
    }

    const raw = encodeGmailRaw({
      to: request.to,
      subject: request.subject,
      body,
      ...(request.cc.length ? { cc: request.cc } : {}),
      ...(inReplyTo ? { inReplyTo } : {}),
      ...(references ? { references } : {}),
      ...(attachments.length ? { attachments } : {}),
    })
    const created = await client.createDraftInThread(accessToken, raw, request.threadId)
    return {
      provider: 'google',
      draftId: created.id,
      messageId: created.messageId,
      threadId: created.threadId,
      // Gmail ne renvoie pas d'URL ; celle-ci est la forme documentée et stable
      // pour ouvrir un brouillon précis.
      webUrl: created.id ? `https://mail.google.com/mail/u/0/#drafts?compose=${created.id}` : null,
    }
  }

  /** #2277.34, épopée #2771 — même écriture que `createDraft` : `gmailDraft` couvre `gmail.compose`, qui gouverne aussi la suppression d'un brouillon. */
  async deleteDraft(userId: string, draftId: string): Promise<{ deleted: boolean }> {
    const { client, accessToken } = await this.google.authorizeWrite(userId, 'gmailDraft')
    return client.deleteDraft(accessToken, draftId)
  }

  async send(
    userId: string,
    input: { to: string; subject: string; body: string; attachments?: readonly OutgoingMailAttachment[] },
    connectionId?: string,
  ): Promise<MailSendReceipt> {
    // On réutilise le chemin d'envoi du service Google : il porte déjà le
    // contrôle d'opt-out et la résolution du jeton. Le dupliquer ici créerait
    // un second chemin d'envoi — exactement ce qu'il ne faut pas avoir.
    // #3234 — Gmail rend l'id du message et du fil : c'est la clé d'appariement.
    const sent = await this.google.sendGmail(userId, { ...input, ...(connectionId ? { connectionId } : {}) })
    return { messageId: sent?.id || null, threadId: sent?.threadId ?? null }
  }

  async getOutOfOffice(userId: string): Promise<OutOfOfficeRequest | null> {
    const status = await this.status(userId)
    if (!status?.capabilities.outOfOffice) return null
    const { client, accessToken } = await this.google.authorize(userId)
    const vacation = await client.getVacation(accessToken)
    return {
      enabled: vacation.enabled,
      contactsOnly: vacation.contactsOnly,
      ...(vacation.startsAt ? { startsAt: vacation.startsAt } : {}),
      ...(vacation.endsAt ? { endsAt: vacation.endsAt } : {}),
      ...(vacation.subject ? { subject: vacation.subject } : {}),
      ...(vacation.message ? { message: vacation.message } : {}),
    }
  }

  async setOutOfOffice(userId: string, request: OutOfOfficeRequest): Promise<OutOfOfficeRequest> {
    // #2078.22 — modifier la réponse d'absence est une écriture.
    const { client, accessToken } = await this.google.authorizeWrite(userId, 'gmailSettings')
    const saved = await client.updateVacation(accessToken, {
      enabled: request.enabled,
      subject: request.subject ?? null,
      message: request.message ?? null,
      startsAt: request.startsAt ?? null,
      endsAt: request.endsAt ?? null,
      contactsOnly: request.contactsOnly,
    })
    return {
      enabled: saved.enabled,
      contactsOnly: saved.contactsOnly,
      ...(saved.startsAt ? { startsAt: saved.startsAt } : {}),
      ...(saved.endsAt ? { endsAt: saved.endsAt } : {}),
      ...(saved.subject ? { subject: saved.subject } : {}),
      ...(saved.message ? { message: saved.message } : {}),
    }
  }

  async signature(userId: string): Promise<MailboxSignature> {
    const status = await this.status(userId)
    if (!status?.capabilities.outOfOffice) {
      // `gmail.settings.basic` porte les deux : sans elle, pas de signature réelle.
      return { text: null, address: status?.address ?? null }
    }
    try {
      const { client, accessToken } = await this.google.authorize(userId)
      const sendAs = await client.getDefaultSignature(accessToken)
      return { text: htmlSignatureToText(sendAs.signatureHtml), address: sendAs.address }
    } catch (error) {
      this.logger.warn(`Gmail signature lookup failed: ${(error as Error).message}`)
      return { text: null, address: status?.address ?? null }
    }
  }
}
