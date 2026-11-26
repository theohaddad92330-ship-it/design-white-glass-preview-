/**
 * Théo M2 — envoi programmé — ce que ce module emprunte aux autres, par jeton (GA-07 : aucun import service →
 * service). Câblé dans `scheduled-send.module.ts`.
 */
export const SCHEDULED_SEND_TRANSPORT = Symbol('SCHEDULED_SEND_TRANSPORT')

/** L'horloge, injectée pour que « à l'heure dite » se teste sans attendre. */
export const SCHEDULED_SEND_CLOCK = Symbol('SCHEDULED_SEND_CLOCK')

/** Le refus nommé du chemin d'envoi au clic (`ContactFailure.code`), ou rien quand il a pris le message. */
type ScheduledSendOutcome = { ok: true } | { ok: false; code: string }

export type ScheduledSendTransport = {
  /** L'espace ACTIF de l'utilisateur : un envoi programmé ne part jamais depuis un autre espace que le sien. */
  activeWorkspace(userId: string): Promise<string | null>
  /**
   * LE chemin de « Envoyer » au clic (`ContactsService.sendEmail`, canal `mailbox`) — jamais un second moteur.
   * Il porte déjà la démo, la désinscription, la réservation par contact et le classement d'un timeout en incertain.
   */
  sendEmail(contactId: string, userId: string, draft: { subject?: string; body: string }): Promise<ScheduledSendOutcome>
  /** Relit la boîte de l'utilisateur pour cette adresse : le chemin existant pose `email_sent_observed_at`. */
  lookForSentProof(userId: string, counterpartEmail: string): Promise<void>
}
