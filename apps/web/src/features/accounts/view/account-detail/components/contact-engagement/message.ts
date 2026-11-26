import type { Contact } from '@bellum/contracts'
import { isPreparedOnlyChannel } from './channel'
import type { ContactMessage, EngagementChannel, ObjectionResponse } from './types'

export function buildContactMessage(contact: Contact, rawAnalysis: Record<string, unknown>): ContactMessage {
  const fromAnalysis = findAnalysisMessage(contact, rawAnalysis)
  return {
    linkedinMessage: contact.linkedin_message ?? fromAnalysis.linkedinMessage ?? '',
    // M2/M3 ne sont pas persistés sur la ligne contact (ils ne s'éditent pas :
    // ce sont les temps suivants à copier le jour où M1 reste sans réponse). Ils
    // vivent dans le dossier, d'où on les relit.
    linkedinSequence: fromAnalysis.linkedinSequence ?? [],
    emailSubject: contact.email_message?.subject ?? fromAnalysis.emailSubject ?? '',
    emailBody: contact.email_message?.body ?? fromAnalysis.emailBody ?? '',
    phoneScript: contact.phone_script ?? fromAnalysis.phoneScript ?? '',
  }
}

export function getInitialDraft(channel: EngagementChannel, message: ContactMessage): string {
  // #2123.72 — aucune tâche n'est pré-écrite par l'analyse : le fil part vide.
  // #2370 — les canaux préparés partent vides aussi : rien n'est pré-écrit pour eux par l'analyse.
  if (isPreparedOnlyChannel(channel)) return ''
  if (channel === 'phone') return message.phoneScript
  if (channel === 'linkedin') return message.linkedinMessage
  return message.emailBody
}

export function readObjections(rawAnalysis: Record<string, unknown>): ObjectionResponse[] {
  return asArray(rawAnalysis['objections'])
    .map(asRecord)
    .map(item => ({
      objection: safeString(item?.['objection'] ?? item?.['label'] ?? item?.['title']),
      response: safeString(item?.['response'] ?? item?.['reponse'] ?? item?.['answer']),
    }))
    .filter(item => item.objection || item.response)
}

/**
 * Repêchage depuis le blob d'analyse quand la ligne contact ne porte pas encore
 * ses messages (l'appariement par nom de `applyMessages` peut échouer sur un
 * homonyme ou une orthographe différente).
 *
 * Le pipeline émet ces messages sous `plan.contactMessages`, en camelCase
 * (`contactName`, `linkedinMessage`, `emailSubject`, `emailBody`, `phoneOpener`)
 * — cf. `packages/shared/schemas/plan.schema.json`. Les chemins snake_case
 * (`messages.per_contact`, `contact_messages`) sont d'anciennes formes gardées
 * en repli : elles ne coûtent rien et couvrent les dossiers déjà stockés.
 */
function findAnalysisMessage(contact: Contact, rawAnalysis: Record<string, unknown>): Partial<ContactMessage> {
  const plan = asRecord(rawAnalysis['plan'])
  const legacyMessages = asRecord(rawAnalysis['messages'])
  const contactMessages = asArray(
    plan?.['contactMessages'] ?? legacyMessages?.['per_contact'] ?? rawAnalysis['contact_messages'],
  )
  const match = contactMessages
    .map(asRecord)
    .find(
      item => safeString(item?.['contactName'] ?? item?.['contact_name'] ?? item?.['full_name']) === contact.full_name,
    )
  const email = asRecord(match?.['email'])

  return {
    linkedinMessage:
      safeString(match?.['linkedinMessage'] ?? match?.['linkedin_message'] ?? match?.['linkedin']) || undefined,
    // p10 : trois temps, et un arrêt net après le troisième. On ne lit donc QUE
    // M2 et M3 — pas de boucle ouverte qui accepterait un M4.
    linkedinSequence: [
      safeString(match?.['linkedinMessageM2'] ?? match?.['linkedin_message_m2']),
      safeString(match?.['linkedinMessageM3'] ?? match?.['linkedin_message_m3']),
    ].filter(Boolean),
    emailSubject: safeString(match?.['emailSubject'] ?? email?.['subject'] ?? match?.['email_subject']) || undefined,
    emailBody: safeString(match?.['emailBody'] ?? email?.['body'] ?? match?.['email_body']) || undefined,
    phoneScript: safeString(match?.['phoneOpener'] ?? match?.['phone_script'] ?? match?.['phone']) || undefined,
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function safeString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}
