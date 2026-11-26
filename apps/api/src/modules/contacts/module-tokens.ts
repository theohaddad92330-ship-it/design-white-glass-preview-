import type { ContactAttachableDocument, FieldSource, MailboxProvider, SEND_TIMING_WEEKDAYS } from '@bellum/contracts'
import type { Result } from '@bellum/utils'
import type { MailboxVerdict } from './email-probe'

/**
 * #3289.29 — le jour de la semaine que l'espace a APPRIS pour ses relances
 * e-mail, lu par `CadenceService`. Même discipline GA-07 que les autres
 * `module-tokens.ts` : la cadence n'importe pas `SendTimingService`, la
 * composition se fait dans `contacts.module.ts`.
 */
export const CADENCE_PREFERRED_WEEKDAY = 'CONTACTS_CADENCE_PREFERRED_WEEKDAY'

/** `null` = aucun créneau mesuré (ou lecture impossible) : les échéances restent nominales. */
export type CadencePreferredWeekdayReader = (
  workspaceId: string,
) => Promise<(typeof SEND_TIMING_WEEKDAYS)[number] | null>

/**
 * #4016 L4.1 — les portes de l'e-mail ESTIMÉ. `EmailEstimateService` n'importe
 * ni `SuppressionService` ni `ProvenanceService` (GA-07) : il reçoit ces
 * fonctions, composées dans `contacts.module.ts`.
 */
export const EMAIL_ESTIMATE_PORTS = 'CONTACTS_EMAIL_ESTIMATE_PORTS'

export type EmailEstimatePorts = {
  /** L'adresse porte-t-elle une opposition (`email_suppressions`, c69) ? */
  isSuppressed: (workspaceId: string, email: string) => Promise<boolean>
  /** La provenance courante des champs de la fiche — l'arbitre `decideFieldWrite` la lit. */
  currentSources: (contactId: string) => Promise<Partial<Record<string, FieldSource>>>
  /** Journalise l'écriture estimée (`field_provenance` + `record_field_audit`, source `inferred`). */
  commitEstimate: (input: {
    workspaceId: string | null
    contactId: string
    email: string
    rule: string
  }) => Promise<void>
}

/** La sonde MX + SMTP, bornée par `EMAIL_ESTIMATE_PROBE_TIMEOUT_MS`. Injectable pour les specs. */
export const EMAIL_ESTIMATE_PROBE = 'CONTACTS_EMAIL_ESTIMATE_PROBE'

export type EmailEstimateProbe = (email: string) => Promise<MailboxVerdict>

/**
 * #3698.6 — « prévenir l'équipe responsable » d'une panne d'enrichissement.
 * `ContactsService` n'importe pas le dispatcheur d'alertes (GA-07) : il reçoit
 * cette fonction, composée dans `contacts.module.ts`. Absente (specs, ou
 * module retiré) = aucune alerte, l'enrichissement répond pareil.
 */
export const ENRICHMENT_OUTAGE_ALERT = 'CONTACTS_ENRICHMENT_OUTAGE_ALERT'

/** `reason` : le vocabulaire `EnrichmentFailureReason`. Ne lève jamais. */
export type EnrichmentOutageAlert = (reason: string) => Promise<void>

/**
 * #3699.4 — l'envoi INDIVIDUEL depuis la boîte connectée du commercial.
 * `ContactsService` n'importe pas `MailboxService` (GA-07) : il reçoit ce port,
 * composé dans `contacts.module.ts`. Absent = le canal « boîte connectée »
 * n'existe pas ici : l'écran ne le propose pas, le serveur le refuse.
 */
export const INDIVIDUAL_MAILBOX_SENDER = 'CONTACTS_INDIVIDUAL_MAILBOX_SENDER'

export type IndividualMailboxSender = {
  /** #4546.5 — `senderConnectionId` : la boîte désignée parmi SES boîtes ; absent = la boîte par défaut. */
  status(
    userId: string,
    senderConnectionId?: string,
  ): Promise<{
    connected: boolean
    provider: MailboxProvider | null
    address: string | null
    can_send: boolean
  }>
  /** #3699.6 — `attachments` : les pièces choisies par le commercial, déjà validées. */
  send(
    userId: string,
    item: {
      to: string
      subject: string
      body: string
      attachments?: readonly { fileName: string; contentType: string; contentBase64: string }[]
      /** #4546.5 — la boîte d'où le message part ; absent = la boîte par défaut. */
      senderConnectionId?: string
    },
  ): Promise<void>
  /**
   * #4412 — dépose un BROUILLON (jamais un envoi) chez le fournisseur, dans le fil
   * existant avec ce contact quand il y en a un. Lève avec la raison du fournisseur.
   */
  draft(
    userId: string,
    item: { contactId: string; to: string; subject: string; body: string; senderConnectionId?: string },
  ): Promise<{ provider: MailboxProvider }>
}

/**
 * E1 (#3698) — le débit d'un crédit quand le mobile révélé par Apollo arrive
 * par webhook (`ContactPhoneRevealService`). Un jeton plutôt que le service de
 * crédits importé (GA-07) ; fourni par `ContactsModule` sur
 * `CreditsService.consumeEnrichmentCredit`.
 */
export const PHONE_REVEAL_DEBIT = 'CONTACTS_PHONE_REVEAL_DEBIT'

export type PhoneRevealDebit = (
  userId: string,
  context: { reason: string; accountId?: string },
) => Promise<{ ok: boolean; reason?: string }>

/**
 * #3699.6 — les pièces jointes d'un envoi individuel : ce qui est joignable
 * pour un contact, et la relecture/vérification au moment de l'envoi. Un jeton
 * plutôt que `EmailAttachmentService` importé (GA-07) ; fourni par
 * `ContactsModule` depuis `OutreachAssetModule`. Absent = aucune pièce
 * proposée, et toute demande de pièce est REFUSÉE (jamais ignorée).
 */
export const EMAIL_ATTACHMENTS = 'CONTACTS_EMAIL_ATTACHMENTS'

/** #3699.6 — une pièce relue et vérifiée, prête à partir (octets en base64 + empreinte). */
export type ResolvedEmailAttachment = {
  fileName: string
  contentType: string
  contentBase64: string
  byteSize: number
  sha256: string
}

export type EmailAttachments = {
  attachableFor(workspaceId: string, contactId: string): Promise<ContactAttachableDocument[]>
  resolveForSend(
    workspaceId: string,
    contactId: string,
    assetIds: readonly string[],
  ): Promise<Result<ResolvedEmailAttachment[], { code: 'attachment_refused'; message: string }>>
}
