import { DEFAULT_RETRY_POLICY, type WorkflowDefinition, type WorkflowStep } from '@bellum/contracts'

/**
 * Les cinq workflows de référence (addendum final p26-30).
 *
 * Ils vivent dans le CODE, pas en base. Une définition éditable en base sans
 * revue serait un chemin d'écriture non gouverné — exactement ce que ce chantier
 * cherche à supprimer : quelqu'un pourrait ajouter un pas « envoyer un email à
 * tout le monde » sans qu'aucun test ni aucune relecture ne le voie passer. Ici
 * chaque pas est versionné avec le code, testé, et relu en pull request. La base
 * ne portera que l'ACTIVATION par espace, le jour où l'écran existe.
 *
 * Un mot sur ce qu'un pas peut être. Les gabarits du rapport mélangent deux
 * natures : de l'ANALYSE (« évaluer le fit », « identifier le projet plausible »)
 * et de l'EXÉCUTION (« créer la tâche », « envoyer le message »). Seule la
 * seconde a sa place ici : l'analyse est déjà produite par le pipeline et le
 * copilote, et la recopier en pas de workflow créerait un deuxième chemin qui
 * divergerait du premier. Un workflow ne contient donc que ce qui ÉCRIT quelque
 * part — c'est aussi ce qui rend son coût et son risque calculables.
 *
 * Chaque pas déclare sa capacité (jamais un éditeur), sa permission, son coût en
 * crédits, son risque et le résultat attendu. Ce quintuplet est ce que
 * l'utilisateur voit avant d'approuver, et ce qu'on relit après pour dire
 * « fait » sans croire l'API sur parole.
 */

/** Fabrique un pas en appliquant les défauts communs (reprise, dépendances). */
function step(
  input: Omit<WorkflowStep, 'dependsOn' | 'retry'> & Partial<Pick<WorkflowStep, 'dependsOn' | 'retry'>>,
): WorkflowStep {
  return { dependsOn: [], retry: DEFAULT_RETRY_POLICY, ...input }
}

/**
 * p26 — Signal récent → ouverture de compte.
 *
 * Le signal est détecté et qualifié en amont (phase de recherche + agent
 * opportunité) ; ce workflow prend la suite au moment où il faut AGIR : retrouver
 * les coordonnées du bon interlocuteur, poser la trace CRM, programmer la
 * relance. Condition de sortie du rapport, portée par le runner : un signal
 * ancien ou hors profil ne déclenche rien, et la raison du rejet est conservée.
 */
const SIGNAL_TO_ACCOUNT_OPENING: WorkflowDefinition = {
  key: 'signal_to_account_opening',
  version: 1,
  name: { fr: 'Signal récent → ouverture de compte', en: 'Fresh signal → account opening' },
  description: {
    fr: "Un signal daté sur un compte suivi : retrouve l'interlocuteur, pose la trace dans le CRM et programme la relance.",
    en: 'A dated signal on a tracked account: find the contact, log it in the CRM and schedule the follow-up.',
  },
  trigger: 'signal_detected',
  minimumLevel: 'n2_user_approval',
  enabled: true,
  steps: [
    step({
      key: 'enrich_decision_maker',
      intentType: 'enrich_contact',
      intent: "Retrouver les coordonnées professionnelles de l'interlocuteur identifié",
      capability: 'prospection',
      permission: 'contacts:write',
      estimatedCredits: 1,
      risk: 'low',
      expectedResult: 'Un email professionnel ou un téléphone est présent sur la fiche contact',
    }),
    step({
      key: 'log_crm_opportunity',
      intentType: 'create_crm_task',
      intent: 'Créer ou mettre à jour la fiche du contact dans le CRM avec le signal daté',
      capability: 'crm',
      permission: 'crm:write',
      estimatedCredits: 0,
      risk: 'medium',
      expectedResult: 'La fiche existe dans le CRM et porte le signal en note',
      dependsOn: ['enrich_decision_maker'],
    }),
    step({
      key: 'schedule_follow_up',
      intentType: 'schedule_reminder',
      intent: 'Programmer la relance à J+3 sur le compte',
      capability: 'calendar',
      permission: 'actions:write',
      estimatedCredits: 0,
      risk: 'low',
      expectedResult: "Un rappel daté existe (agenda connecté, sinon journal d'actions)",
      dependsOn: ['log_crm_opportunity'],
    }),
  ],
}

/**
 * p27 — Rendez-vous : avant, pendant, après.
 *
 * Le rapport découpe le cycle en cinq moments (J-1, pendant, H+0, H+1, J+3/J+7).
 * Les moments « avant » et « pendant » produisent un brief et des notes : c'est
 * de la lecture, déjà servie par le copilote. Ce qui manque après un rendez-vous,
 * ce sont les trois écritures qu'on oublie systématiquement — la note CRM, le
 * rappel de suivi et l'email récapitulatif.
 */
const MEETING_FOLLOW_UP: WorkflowDefinition = {
  key: 'meeting_follow_up',
  version: 1,
  name: { fr: 'Après le rendez-vous', en: 'After the meeting' },
  description: {
    fr: 'Les trois écritures qui suivent un rendez-vous : la note dans le CRM, le rappel de suivi et le récapitulatif au client.',
    en: 'The three writes that follow a meeting: the CRM note, the follow-up reminder and the recap to the client.',
  },
  trigger: 'meeting_upcoming',
  minimumLevel: 'n2_user_approval',
  enabled: true,
  steps: [
    step({
      key: 'log_meeting_note',
      intentType: 'create_crm_note',
      intent: 'Écrire le compte rendu sur la fiche CRM existante',
      capability: 'crm',
      permission: 'crm:write',
      estimatedCredits: 0,
      risk: 'low',
      expectedResult: 'Une note datée apparaît sur la fiche du contact',
    }),
    step({
      key: 'schedule_next_step',
      intentType: 'schedule_reminder',
      intent: 'Programmer la prochaine étape convenue',
      capability: 'calendar',
      permission: 'actions:write',
      estimatedCredits: 0,
      risk: 'low',
      expectedResult: 'Un rappel daté existe pour la prochaine étape',
    }),
    step({
      key: 'send_recap',
      intentType: 'send_email',
      intent: 'Envoyer le récapitulatif relu au participant',
      capability: 'email',
      permission: 'contacts:send',
      estimatedCredits: 0,
      risk: 'irreversible',
      sensitiveFamily: 'bulk_send',
      expectedResult: "L'email est parti et l'envoi est daté sur la fiche contact",
      dependsOn: ['log_meeting_note'],
    }),
  ],
}

/**
 * p28 — Hygiène CRM agentique.
 *
 * Objectif du rapport : « supprimer la saisie administrative sans faire de Bellum
 * un créateur de doublons ». D'où l'ordre des deux pas : on remonte la fiche
 * (upsert, qui déduplique par email côté CRM), PUIS on écrit la note dessus. La
 * note seule ne crée jamais la fiche — c'est le garde-fou porté par l'intent
 * `create_crm_note`.
 */
const CRM_HYGIENE: WorkflowDefinition = {
  key: 'crm_hygiene',
  version: 1,
  name: { fr: 'Hygiène CRM', en: 'CRM hygiene' },
  description: {
    fr: 'Remonte la fiche du contact dans le CRM puis y écrit la note — dans cet ordre, pour ne pas créer de doublon.',
    en: 'Upserts the contact record in the CRM then writes the note — in that order, so no duplicate is created.',
  },
  trigger: 'manual',
  minimumLevel: 'n2_user_approval',
  enabled: true,
  steps: [
    step({
      key: 'upsert_record',
      intentType: 'create_crm_task',
      intent: 'Créer la fiche si elle manque, la mettre à jour si elle existe',
      capability: 'crm',
      permission: 'crm:write',
      estimatedCredits: 0,
      risk: 'medium',
      expectedResult: 'Une seule fiche existe pour ce contact, à jour',
    }),
    step({
      key: 'append_note',
      intentType: 'create_crm_note',
      intent: "Ajouter la note d'activité sur la fiche remontée",
      capability: 'crm',
      permission: 'crm:write',
      estimatedCredits: 0,
      risk: 'low',
      expectedResult: 'La note est visible sur la timeline de la fiche',
      dependsOn: ['upsert_record'],
    }),
  ],
}

/**
 * p29 — Projet détecté → experts → push profil.
 *
 * Le matching et la réécriture de CV sont déterministes et vivent déjà dans le
 * module Vivier. Ce workflow gère la partie qui ENGAGE : proposer le profil au
 * bon interlocuteur, et ne pas laisser la proposition sans suite.
 */
const PROJECT_TO_EXPERT_PUSH: WorkflowDefinition = {
  key: 'project_to_expert_push',
  version: 1,
  name: { fr: 'Projet → push profil', en: 'Project → profile push' },
  description: {
    fr: 'Propose un expert du vivier sur un projet qualifié, puis programme le suivi de la réponse.',
    en: 'Pushes a talent-pool expert onto a qualified project, then schedules the follow-up.',
  },
  trigger: 'project_qualified',
  minimumLevel: 'n2_user_approval',
  enabled: true,
  steps: [
    step({
      key: 'push_profile',
      intentType: 'send_email',
      intent: "Envoyer le push profil relu à l'interlocuteur du projet",
      capability: 'email',
      permission: 'contacts:send',
      estimatedCredits: 0,
      risk: 'irreversible',
      sensitiveFamily: 'client_commitment',
      expectedResult: "L'email est parti et l'envoi est daté sur la fiche contact",
    }),
    step({
      key: 'log_push',
      intentType: 'create_crm_note',
      intent: 'Tracer le push dans le CRM',
      capability: 'crm',
      permission: 'crm:write',
      estimatedCredits: 0,
      risk: 'low',
      expectedResult: 'Le push apparaît sur la timeline du contact',
      dependsOn: ['push_profile'],
    }),
    step({
      key: 'follow_up_response',
      intentType: 'schedule_reminder',
      intent: 'Programmer le contrôle de réponse à J+3',
      capability: 'calendar',
      permission: 'actions:write',
      estimatedCredits: 0,
      risk: 'low',
      expectedResult: 'Un rappel daté existe pour vérifier la réponse',
      dependsOn: ['push_profile'],
    }),
  ],
}

/**
 * p30 — Compte dormant.
 *
 * Un compte sans activité depuis trente jours ne mérite pas la même relance que
 * la première fois — le rapport insiste : « ne pas répéter le message précédent ».
 * Le workflow ne rédige donc rien : il RAMÈNE le compte à l'attention de son
 * propriétaire, avec un rappel, en le notifiant de ce qui a changé entre-temps.
 *
 * C'est le SEUL du catalogue dont les deux pas sont entièrement INTERNES : une
 * notification in-app au propriétaire du run, et un rappel daté à lui-même. Rien
 * ne sort, personne d'autre ne reçoit quoi que ce soit — c'est ce qui le rend
 * éligible à l'automatisme quand l'espace le demande.
 *
 * ⚠️ Son `minimumLevel: 'n4_bounded_auto'` ne l'ACCORDE pas pour autant. Depuis
 * la correction du 01/09/2026, un plancher en `n4` est NEUTRE (il n'exige
 * personne) : le workflow tourne seul si — et seulement si — l'espace est en
 * automatique borné. Un espace au défaut produit (`n2_user_approval`) reçoit une
 * demande d'approbation, ce qui est exactement ce qu'il a demandé. Auparavant, ce
 * `n4` RELEVAIT le niveau du run au-dessus de celui de ses pas, et c'est cette
 * inversion qui, sur les workflows qui envoient, laissait un e-mail partir seul.
 */
const DORMANT_ACCOUNT_REVIVAL: WorkflowDefinition = {
  key: 'dormant_account_revival',
  version: 1,
  name: { fr: 'Compte dormant', en: 'Dormant account' },
  description: {
    fr: "Ramène un compte sans activité à l'attention de son propriétaire, avec ce qui a changé depuis.",
    en: 'Brings an inactive account back to its owner, with what changed since.',
  },
  trigger: 'account_dormant',
  minimumLevel: 'n4_bounded_auto',
  enabled: true,
  steps: [
    step({
      key: 'notify_owner',
      intentType: 'notify_user',
      intent: 'Signaler le compte dormant et ce qui a changé depuis la dernière action',
      capability: 'notifications',
      permission: 'notifications:write',
      estimatedCredits: 0,
      risk: 'low',
      expectedResult: 'Une notification in-app existe pour le propriétaire du compte',
    }),
    step({
      key: 'schedule_decision',
      intentType: 'schedule_reminder',
      intent: 'Programmer la décision : relancer autrement, mettre en veille ou archiver',
      capability: 'calendar',
      permission: 'actions:write',
      estimatedCredits: 0,
      risk: 'low',
      expectedResult: 'Un rappel daté existe pour trancher',
      dependsOn: ['notify_owner'],
    }),
  ],
}

/** Le catalogue complet, indexé par clé à la lecture. */
export const WORKFLOW_CATALOG: readonly WorkflowDefinition[] = [
  SIGNAL_TO_ACCOUNT_OPENING,
  MEETING_FOLLOW_UP,
  CRM_HYGIENE,
  PROJECT_TO_EXPERT_PUSH,
  DORMANT_ACCOUNT_REVIVAL,
] as const

/** La définition portant cette clé, ou `undefined` — jamais une définition
 *  inventée : un workflow inconnu doit faire échouer l'appel, pas produire un
 *  run vide qui aurait l'air d'avoir tourné. */
export function findWorkflow(key: string): WorkflowDefinition | undefined {
  return WORKFLOW_CATALOG.find(definition => definition.key === key)
}
