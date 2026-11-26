import type {
  OutreachEnrollmentExclusion,
  OutreachPlaybookKey,
  AutomationSignal,
  WorkspaceRole,
} from '@bellum/contracts'

/**
 * Lot L-D1 (#4167) — les DEUX portes par lesquelles une automatisation agit.
 *
 * GA-07 : ce fichier n'importe AUCUN service et son nom n'en contient pas. Le
 * module des automatisations ne connaît ni `OutreachService` ni la messagerie :
 * il demande, par ces types, « inscris ce contact », « prépare cet e-mail ». La
 * réalisation vit dans le module outreach (`OutreachAutomationAdapter`), qui
 * possède déjà les gardes d'inscription — il n'existe donc PAS de second chemin
 * d'inscription, ni de second moteur de rédaction.
 *
 * Aucune de ces méthodes n'ENVOIE : elles inscrivent (les étapes restent à
 * faire), préparent un message `needs_review` ou proposent un appel. L'envoi
 * est le geste humain du centre d'approbation, sous mandat (c82).
 */
export const AUTOMATION_ACTIONS_PORT = Symbol('AUTOMATION_ACTIONS_PORT')

type ActionInput = {
  userId: string
  email: string
  workspaceId: string
  role: WorkspaceRole
  contactId: string
  signal: AutomationSignal
  /** Le « pourquoi maintenant » : ce que le signal dit. */
  evidence: string
}

export type AutomationActionsPort = {
  /** Les exclusions de chaque contact POSSÉDÉ par la personne (les autres sont absents) — l'éligibilité de l'outreach. */
  eligibility(input: {
    userId: string
    workspaceId: string
    contactIds: readonly string[]
  }): Promise<Map<string, OutreachEnrollmentExclusion[]>>
  /** Inscrit le contact dans la séquence née du modèle ; Laura prépare les textes (un échec laisse l'étape vide). */
  enroll(input: ActionInput & { playbook: OutreachPlaybookKey }): Promise<{ sequenceId: string; messageIds: string[] }>
  /** Prépare UN e-mail à relire. Rend `null` quand Laura n'a rien pu rédiger (jamais un texte de repli). */
  prepareEmail(input: ActionInput): Promise<{ messageId: string } | null>
  /** Propose UN appel avec sa trame. */
  prepareCall(input: ActionInput): Promise<{ callTaskId: string }>
}

/** Les missions qui se terminent, lues dans l'ATS connecté de la personne. */
export const AUTOMATION_MISSIONS_PORT = Symbol('AUTOMATION_MISSIONS_PORT')

type AutomationEndingMission = {
  id: string
  title: string
  companyName: string | null
  daysRemaining: number
}

export type AutomationMissionsPort = {
  /** `readable: false` = aucun ATS connecté ou illisible : on ne sait pas, et on ne le présente pas comme « rien ». */
  endingMissions(userId: string): Promise<{ readable: boolean; missions: AutomationEndingMission[] }>
}
