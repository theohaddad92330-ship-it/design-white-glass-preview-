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
import {
  MAILBOX_SETTINGS_SCOPE,
  MAIL_READWRITE_SCOPE,
  MAIL_SEND_SCOPE,
  MicrosoftService,
} from '../microsoft/microsoft.service'
import { isoDaysAgo, renderGraphSearch, type MailQuerySpec } from './mail-query'
import {
  appendSignature,
  type MailboxBackend,
  type MailboxSignature,
  type MailSearchOutcome,
  type OutgoingMailAttachment,
  type MailSendReceipt,
} from './mailbox-backend'
import { normalizeAddress } from './no-reply'

/**
 * La messagerie Microsoft, derrière la même interface que la Google.
 *
 * La contrainte structurante vient de Graph lui-même : `$search` et `$filter`
 * ne se combinent pas sur `/me/messages`. Plutôt que de sacrifier un critère en
 * silence, on choisit la requête que le serveur accepte et on applique le reste
 * sur la page reçue. C'est visible dans le code — et c'est mieux que la
 * variante « ça a l'air de marcher » où le filtre non-lu disparaît sans que
 * personne ne s'en aperçoive.
 *
 * Outlook n'expose par ailleurs aucune signature via l'API (elle vit côté
 * client). `signature()` rend donc `null` : la signature réelle viendra du
 * profil Bellum, jamais d'une invention.
 */
@Injectable()
export class MicrosoftMailBackend implements MailboxBackend {
  private readonly logger = new Logger(MicrosoftMailBackend.name)

  constructor(private readonly microsoft: MicrosoftService) {}

  async status(userId: string): Promise<Omit<MailboxStatus, 'connectedCount'> | null> {
    if (!this.microsoft.isConfigured()) return null
    const status = await this.microsoft.getStatus(userId)
    if (!status.connected) return null
    const granted = await this.microsoft.grantedScopes(userId)
    const canRead = granted.has(MAIL_READWRITE_SCOPE) || granted.has('Mail.Read')
    return {
      connected: true,
      provider: 'microsoft',
      address: status.accountLabel ?? null,
      capabilities: {
        read: canRead,
        // Créer un brouillon exige l'écriture ; `Mail.Read` seul ne suffit pas.
        draft: granted.has(MAIL_READWRITE_SCOPE),
        send: granted.has(MAIL_SEND_SCOPE),
        // Graph n'a pas d'équivalent « libellés » : les dossiers Outlook sont un
        // autre objet, hors périmètre. On le dit plutôt que de le simuler.
        labels: false,
        outOfOffice: granted.has(MAILBOX_SETTINGS_SCOPE),
      },
    }
  }

  async search(userId: string, spec: MailQuerySpec, limit: number): Promise<MailSearchOutcome> {
    const { client, accessToken } = await this.microsoft.authorize(userId)
    const rendered = renderGraphSearch(spec)

    const top = Math.min(limit * 3, 100)
    // PERF (P5, 29/09) — le profil (adresse propre, best-effort) et la liste des
    // messages sont indépendants : deux appels Graph qui s'enchaînaient.
    const [ownAddress, raw] = await Promise.all([
      this.ownAddress(userId),
      rendered.search
        ? client.listMessagesDetailed(accessToken, { search: rendered.search, top })
        : client.listMessagesDetailed(accessToken, { filter: this.buildFilter(spec), top }),
    ])

    let messages: MailMessage[] = raw.map(message => ({
      id: message.id,
      threadId: message.conversationId,
      subject: message.subject,
      from: message.from,
      to: message.to,
      cc: message.cc,
      date: message.date,
      snippet: message.preview,
      unread: !message.isRead,
      hasAttachments: message.hasAttachments,
      direction: ownAddress && normalizeAddress(message.from ?? '') === ownAddress ? 'outbound' : 'inbound',
    }))

    // Les critères que KQL ne porte pas, appliqués ici — explicitement.
    if (rendered.clientSideUnread) messages = messages.filter(message => message.unread)
    if (spec.sentOnly) messages = messages.filter(message => message.direction === 'outbound')

    return {
      messages,
      resolvedQuery: rendered.search || this.buildFilter(spec),
      truncated: raw.length >= top,
    }
  }

  /** Le `$filter` OData utilisé quand la requête ne porte aucun mot-clé. */
  private buildFilter(spec: MailQuerySpec): string {
    const clauses: string[] = []
    if (spec.unreadOnly) clauses.push('isRead eq false')
    if (spec.hasAttachment) clauses.push('hasAttachments eq true')
    if (spec.newerThanDays) clauses.push(`receivedDateTime ge ${isoDaysAgo(spec.newerThanDays)}T00:00:00Z`)
    return clauses.join(' and ')
  }

  private async ownAddress(userId: string): Promise<string | null> {
    try {
      const { client, accessToken } = await this.microsoft.authorize(userId)
      const profile = await client.me(accessToken)
      const address = profile.mail ?? profile.userPrincipalName
      return address ? normalizeAddress(address) : null
    } catch {
      return null
    }
  }

  async listAttachments(userId: string, messageId: string): Promise<MailAttachment[]> {
    const { client, accessToken } = await this.microsoft.authorize(userId)
    const raw = await client.listAttachments(accessToken, messageId)
    return raw.map(entry => ({ messageId, ...entry }))
  }

  /** #2568.1 — même geste que Google, deux appels Graph (contenu + date). */
  async getAttachment(
    userId: string,
    messageId: string,
    attachmentId: string,
  ): Promise<{ filename: string; mimeType: string | null; dataB64: string; messageDate: string | null } | null> {
    const { client, accessToken } = await this.microsoft.authorize(userId)
    const attachments = await client.listAttachments(accessToken, messageId)
    const meta = attachments.find(entry => entry.attachmentId === attachmentId)
    if (!meta) return null
    const [dataB64, messageDate] = await Promise.all([
      client.getAttachmentBase64(accessToken, messageId, attachmentId),
      client.getMessageDate(accessToken, messageId).catch(() => null),
    ])
    if (!dataB64) return null
    return { filename: meta.filename, mimeType: meta.mimeType, dataB64, messageDate }
  }

  async fetchBody(userId: string, messageId: string): Promise<{ plain: string | null; html: string | null }> {
    const { client, accessToken } = await this.microsoft.authorize(userId)
    return client.getMessageBody(accessToken, messageId)
  }

  async createDraft(
    userId: string,
    request: MailDraftRequest,
    signature: string | null,
    connectionId?: string,
  ): Promise<MailDraftResult> {
    const { client, accessToken } = await this.microsoft.authorize(userId, connectionId)
    const body = request.appendSignature ? appendSignature(request.body, signature) : request.body

    // Répondre DANS le fil quand on connaît le message d'origine : Graph pose
    // alors lui-même les en-têtes de conversation, ce qu'un nouveau message ne
    // fait pas, quel que soit son objet.
    if (request.inReplyTo) {
      const reply = await client.createReplyDraft(accessToken, request.inReplyTo, { body })
      return {
        provider: 'microsoft',
        draftId: reply.id,
        messageId: reply.id,
        threadId: reply.conversationId,
        webUrl: reply.webLink,
      }
    }

    const created = await client.createDraft(accessToken, {
      to: request.to,
      subject: request.subject,
      body,
      ...(request.cc.length ? { cc: request.cc } : {}),
    })
    return {
      provider: 'microsoft',
      draftId: created.id,
      messageId: created.id,
      threadId: created.conversationId,
      webUrl: created.webLink,
    }
  }

  /** #2277.34, épopée #2771 — la vérification `isDraft` vit dans `MicrosoftClient.deleteDraft`. */
  async deleteDraft(userId: string, draftId: string): Promise<{ deleted: boolean }> {
    const { client, accessToken } = await this.microsoft.authorize(userId)
    return client.deleteDraft(accessToken, draftId)
  }

  async send(
    userId: string,
    input: { to: string; subject: string; body: string; attachments?: readonly OutgoingMailAttachment[] },
    connectionId?: string,
  ): Promise<MailSendReceipt> {
    // Même raison que côté Google : le service porte déjà l'opt-out et le jeton.
    await this.microsoft.sendMail(userId, { ...input, ...(connectionId ? { connectionId } : {}) })
    // #3234 — Graph `POST /me/sendMail` répond 202 SANS corps : aucun identifiant
    // à remonter. `null` assumé (repli sur l'heuristique), jamais un id deviné.
    return { messageId: null, threadId: null }
  }

  async senders(userId: string): Promise<MailboxSender[]> {
    const connections = await this.microsoft.listConnections(userId)
    return connections.map(connection => ({
      connectionId: connection.id,
      provider: 'microsoft',
      address: connection.accountLabel,
      capabilities: {
        read: connection.capabilities.mailRead,
        draft: connection.capabilities.mailDraft,
        send: connection.capabilities.mailSend,
      },
    }))
  }

  async getOutOfOffice(userId: string): Promise<OutOfOfficeRequest | null> {
    const status = await this.status(userId)
    if (!status?.capabilities.outOfOffice) return null
    const { client, accessToken } = await this.microsoft.authorize(userId)
    const settings = await client.getAutomaticReplies(accessToken)
    return {
      enabled: settings.enabled,
      contactsOnly: settings.contactsOnly,
      ...(settings.startsAt ? { startsAt: settings.startsAt } : {}),
      ...(settings.endsAt ? { endsAt: settings.endsAt } : {}),
      ...(settings.message ? { message: settings.message } : {}),
    }
  }

  async setOutOfOffice(userId: string, request: OutOfOfficeRequest): Promise<OutOfOfficeRequest> {
    const { client, accessToken } = await this.microsoft.authorize(userId)
    const saved = await client.setAutomaticReplies(accessToken, {
      enabled: request.enabled,
      contactsOnly: request.contactsOnly,
      ...(request.message ? { message: request.message } : {}),
      ...(request.startsAt ? { startsAt: request.startsAt } : {}),
      ...(request.endsAt ? { endsAt: request.endsAt } : {}),
    })
    return {
      enabled: saved.enabled,
      contactsOnly: saved.contactsOnly,
      ...(saved.startsAt ? { startsAt: saved.startsAt } : {}),
      ...(saved.endsAt ? { endsAt: saved.endsAt } : {}),
      ...(saved.message ? { message: saved.message } : {}),
    }
  }

  async signature(userId: string): Promise<MailboxSignature> {
    const status = await this.status(userId)
    // Microsoft Graph n'expose pas la signature Outlook : elle est stockée côté
    // client. Rendre `null` est la seule réponse honnête.
    return { text: null, address: status?.address ?? null }
  }
}
