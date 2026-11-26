/**
 * La PRÉVISUALISATION d'une écriture dans l'ERP.
 *
 * Elle est calculée ici, purement, puis FIGÉE en base. C'est le texte qu'un
 * responsable lit avant de valider, et c'est donc le seul endroit du produit où
 * une phrase mal formée coûte de l'argent réel : un TJM approuvé sur une
 * prévisualisation trompeuse se retrouve sur une facture.
 *
 * Deux règles portent tout le fichier.
 *
 * **On écrit ce qu'on va écrire, pas ce qu'on aimerait dire.** La
 * prévisualisation ne résume pas, elle énumère les champs et leurs valeurs.
 *
 * **Une valeur absente est nommée comme absente.** Écrire « TJM : » suivi de
 * rien laisse croire à un oubli d'affichage ; écrire « TJM : non renseigné » dit
 * que le champ partira vide.
 */

export type AtsWriteKind = 'create_mission' | 'update_tjm' | 'update_need_status' | 'log_call'

export type AtsWritePayload = {
  create_mission: {
    clientName: string
    consultantName: string
    startDate: string
    endDate?: string
    dailyRate?: number
  }
  update_tjm: {
    /** L'identifiant de la ressource ERP à corriger — sans lui, ce n'est pas
     *  une mise à jour, c'est une création déguisée. */
    resourceId: string
    consultantName: string
    missionReference: string
    dailyRate: number
    effectiveFrom?: string
  }
  update_need_status: {
    resourceId: string
    needReference: string
    status: string
    comment?: string
  }
  /**
   * #4692 — un compte rendu d'appel dans la fiche contact. `typeOf` est une valeur du dictionnaire de l'INSTANCE
   * (jamais un id codé en dur) ; `summary` est le texte que le commercial a écrit lui-même, jamais le corps d'un message.
   */
  log_call: {
    contactId: string
    contactName: string
    typeOf: string
    title: string
    summary: string
    startDate: string
    endDate?: string
    companyId?: string
  }
}

const MISSING = 'non renseigné'

function money(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return MISSING
  return `${value} €`
}

function orMissing(value: string | undefined): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : MISSING
}

/**
 * Le texte montré au responsable. Une ligne par champ écrit, dans l'ordre où il
 * sera écrit.
 */
export function buildPreview<K extends AtsWriteKind>(kind: K, payload: AtsWritePayload[K]): string {
  if (kind === 'create_mission') {
    const p = payload as AtsWritePayload['create_mission']
    return [
      'Créer une mission dans l’ERP',
      `Client : ${orMissing(p.clientName)}`,
      `Consultant : ${orMissing(p.consultantName)}`,
      `Début : ${orMissing(p.startDate)}`,
      `Fin : ${orMissing(p.endDate)}`,
      `TJM : ${money(p.dailyRate)}`,
    ].join('\n')
  }
  if (kind === 'update_tjm') {
    const p = payload as AtsWritePayload['update_tjm']
    return [
      'Modifier un TJM dans l’ERP',
      // Ce que le responsable valide, c'est CETTE ressource précise — la
      // nommer évite d'approuver à l'aveugle une correction qui viserait la
      // mauvaise mission.
      `Ressource ERP : ${orMissing(p.resourceId)}`,
      `Consultant : ${orMissing(p.consultantName)}`,
      `Mission : ${orMissing(p.missionReference)}`,
      `Nouveau TJM : ${money(p.dailyRate)}`,
      `À compter du : ${orMissing(p.effectiveFrom)}`,
      // Le rappel n'est pas décoratif : c'est la conséquence que le responsable
      // doit avoir en tête au moment où il clique.
      'Ce montant alimente la facturation.',
    ].join('\n')
  }
  if (kind === 'log_call') {
    const p = payload as AtsWritePayload['log_call']
    return [
      'Ajouter un compte rendu d’appel à la fiche contact de l’ERP',
      `Contact : ${orMissing(p.contactName)} (fiche ERP ${orMissing(p.contactId)})`,
      `Type d’action (dictionnaire de l’instance) : ${orMissing(p.typeOf)}`,
      `Titre : ${orMissing(p.title)}`,
      `Quand : ${orMissing(p.startDate)}`,
      `Résumé : ${orMissing(p.summary)}`,
      'Rien n’est envoyé au contact : seule la fiche de l’ERP reçoit cette ligne.',
    ].join('\n')
  }
  const p = payload as AtsWritePayload['update_need_status']
  return [
    'Changer le statut d’un besoin dans l’ERP',
    `Ressource ERP : ${orMissing(p.resourceId)}`,
    `Besoin : ${orMissing(p.needReference)}`,
    `Nouveau statut : ${orMissing(p.status)}`,
    `Commentaire : ${orMissing(p.comment)}`,
  ].join('\n')
}

/**
 * La demande est-elle encore valable ?
 *
 * Une écriture approuvée trois semaines après sa demande écrirait dans l'ERP un
 * état que plus personne n'a en tête. L'expiration est donc une propriété de la
 * demande, pas un ménage de base.
 */
export function isExpired(request: { state: string; expires_at: Date }, now: Date): boolean {
  return request.state === 'pending' && request.expires_at.getTime() <= now.getTime()
}
