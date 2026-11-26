/**
 * Les canaux du composer. #2123.72 — `task` : la « tâche de prise de contact ».
 * Elle se RÉDIGE comme les autres, mais ne s'ENVOIE pas : elle se crée dans les
 * actions du commercial (ligne `action_plan_items`, liste de `/actions`).
 */
export type EngagementChannel =
  | 'email'
  | 'linkedin'
  | 'phone'
  | 'task'
  | 'recommendation'
  // #2370 (épopée #2947) — les huit canaux préparés (`OUTREACH_MESSAGE_CHANNELS`, règle de forme `bellum_outreach.py`).
  | 'introduction_request'
  | 'partner_message'
  | 'follow_up_email'
  | 'profile_push'
  | 'linkedin_connection_note'

/**
 * #2204.40 / #2204.41 — `voicemail` (message vocal / note d'appel) et `recommendation` (texte d'appui qui
 * recommande le contact) se RÉDIGENT comme les autres canaux mais ne s'envoient pas d'ici : ni l'un ni
 * l'autre ne rend un contact joignable, et le journal d'actions les trace comme `other`.
 */
export type PreparedOnlyChannel =
  | 'task'
  | 'recommendation'
  // #2370 — Laura les PRÉPARE, le commercial les envoie de son outil : aucun envoi depuis le composer.
  | 'introduction_request'
  | 'partner_message'
  | 'follow_up_email'
  | 'profile_push'
  | 'linkedin_connection_note'

/** Les canaux qui portent un message à ENVOYER — ni la tâche, ni le message vocal, ni la recommandation. */
export type SendableChannel = Exclude<EngagementChannel, PreparedOnlyChannel>

export type ContactMessage = {
  linkedinMessage: string
  /**
   * Les temps SUIVANTS de la séquence LinkedIn (M2 apport de valeur, M3
   * proposition de 15 min), annexe méthodo p10.
   *
   * Le produit s'arrêtait à M1 : un commercial qui n'obtient pas de réponse au
   * premier message n'avait rien, alors que la méthode décrit explicitement
   * trois temps — et un arrêt net après le troisième. Vide pour un dossier
   * antérieur : le fil n'affiche alors que M1, comme avant.
   */
  linkedinSequence: string[]
  emailSubject: string
  emailBody: string
  phoneScript: string
}

export type ObjectionResponse = {
  objection: string
  response: string
}
