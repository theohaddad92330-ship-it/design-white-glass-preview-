import type {
  AgendaConflict,
  AgendaEvent,
  BriefingAction,
  BriefingActionKind,
  BriefingArtifact,
  BriefingFact,
  BriefingFactCapability,
  BriefingCriticalField,
  BriefingRoleFitPreferences,
  InvoiceBlocker,
  MailThread,
  Task,
} from '@bellum/contracts'
import {
  BRIEFING_ACTIONS_MAX,
  BRIEFING_ACTION_KINDS,
  BRIEFING_RANKING_AXES,
  MEETING_PREP_IMMINENT_MINUTES,
  compareBriefingActions,
  isMeetingImminent,
  routeContractFor,
  taskBucket,
} from '@bellum/contracts'
import type { BriefingRankingAxis, FieldSource } from '@bellum/contracts'

/**
 * Les clés de libellé que ce fichier peut émettre.
 *
 * Exportées pour être VÉRIFIÉES : elles vivent côté serveur, leur traduction
 * vit côté web, et rien ne reliait les deux. Un « action » au singulier là où le
 * fichier de traduction dit « actions » a suffi pour afficher `action.conflict`
 * en clair sur l'écran « Aujourd’hui », en production.
 */
export const BRIEFING_ACTION_LABEL_KEYS = [
  'briefing.actions.conflict',
  'briefing.actions.meetingPrep',
  'briefing.actions.positiveReply',
  'briefing.actions.positiveReplyNoSubject',
  'briefing.actions.followUp',
  'briefing.actions.followUpNoSubject',
  // #5003 — la relance vers un compte ESN, étiquetée (jamais retirée).
  'briefing.actions.followUpEsn',
  'briefing.actions.followUpEsnNoSubject',
  'briefing.actions.freshSignal',
  // #2107.3 — un besoin ouvert depuis plus de cinq jours, sans shortlist.
  // Doublon de #2106.7, livré ici avec la même preuve.
  'briefing.actions.needStale',
  // #3389.13 — la reprise prévue d'un besoin en veille est échue : même genre
  // (`need_stale`) et même geste (ouvrir le besoin), un autre motif.
  'briefing.actions.needResumeDue',
  // #2095.2 — une mission approche de sa fin. `kind: 'mission_end'` existait
  // déjà partout ailleurs (urgency-tier, role-order, i18n du genre) ; seule la
  // production manquait. #2106.8/#2107.7 réutilisent la MÊME clé pour la
  // mission qui entre dans une fenêtre de renouvellement (J-45/J-30/J-15) —
  // doublon de #2106.6/#2107.5 pour la partie mission (« consultant
  // disponible » reste hors de ce lot — voir le registre).
  'briefing.actions.missionEnding',
  // #2095.7 — un paiement client est en retard de règlement.
  'briefing.actions.paymentOverdue',
  // #3671.6 — même geste, avec le MOIS de la facture quand il est connu.
  'briefing.actions.paymentOverdueMonth',
  // #2095.8 — un appel d'offres approche de son échéance.
  'briefing.actions.rfpDue',
  // #2106.6 — un consultant dont toutes les affectations en cours finissent
  // sous peu : la fiche s'ouvre, aucune shortlist de comptes n'est fabriquée
  // (même doctrine que `need_stale`/`mission_end`).
  'briefing.actions.consultantAvailable',
  // #2107.6 — une disponibilité saisie il y a plus de
  // {@link AVAILABILITY_RECONFIRM_AFTER_DAYS} jours, jamais reconfirmée
  // depuis : même doctrine que `consultant_available` juste au-dessus, la
  // fiche s'ouvre, personne ne fabrique de shortlist.
  'briefing.actions.availabilityReconfirm',
  // #2107.8 — une mission active sans date de fin : `mission_end` l'exclut
  // explicitement, elle a donc besoin de son propre libellé.
  'briefing.actions.missionNoEndDate',
  // #2107.15 — un connecteur dégradé : une clé PAR OUTIL (jamais un nom
  // d'outil interpolé en variable) — même raison que `followUp`/
  // `followUpNoSubject` juste au-dessus, le texte traduit vit côté web.
  'briefing.actions.connectorBrokenMailbox',
  'briefing.actions.connectorBrokenAgenda',
  // #2107.10 — une mission au renouvellement non engagé : même échéance que
  // `missionEnding`, mais un fait distinct (rien n'a commencé).
  'briefing.actions.renewalNotEngaged',
  // #2107.4 — un profil envoyé sans aucun retour depuis plus de
  // {@link SUBMISSION_NO_RESPONSE_AFTER_DAYS} jours.
  'briefing.actions.submissionNoResponse',
  // #2107.14 — un appel d'offres porte au moins une exigence obligatoire non
  // couverte (`computeRfpCompliance`, `@bellum/contracts`) : même famille que
  // `rfpDue` juste au-dessus, un texte distinct (« exigence non couverte »
  // plutôt qu'une échéance).
  'briefing.actions.rfpRequirementGap',
  // #2107.18 — un compte actif sans propriétaire assigné
  // (`accounts.assigned_to IS NULL`) : une zone blanche au niveau individuel.
  'briefing.actions.accountNoOwner',
  // #2106.9/#2107.1 (doublon, épopée #2801) — une affaire sans AUCUNE tâche
  // encore ouverte qui lui soit rattachée.
  'briefing.actions.projectNoNextAction',
  // #2107.2 (épopée #2801) — une affaire dont la fraîcheur a dépassé le seuil
  // de l'ontologie (`ageing`/`stale`, `pipelineHealth`).
  'briefing.actions.projectStale',
  // #2107.9 — le CRA du mois précédent manque sur une mission ACTIVE.
  'briefing.actions.craMissing',
  // #2107.11 — le mois précédent est prêt à facturer, aucun bloqueur restant.
  'briefing.actions.invoiceReady',
  // #2107.16 — la porte « prêt à facturer » bloque sur une donnée MANQUANTE :
  // une clé PAR DONNÉE (jamais un code de bloqueur interpolé en variable) —
  // même raison que `connectorBrokenMailbox`/`connectorBrokenAgenda`.
  'briefing.actions.invoicingBlockedMissingRate',
  'briefing.actions.invoicingBlockedMissingPo',
  'briefing.actions.invoicingBlockedMissingBillingContact',
  'briefing.actions.invoicingBlockedMissingStartDate',
  'briefing.actions.invoicingBlockedMissingCost',
  // #2095.41 (épopée #2993) — un contact au rebond (déjà produit ci-dessous,
  // absent de ce registre par omission du lot du 26/09 — corrigé ici plutôt
  // que reconduit, `briefing-labels.spec.ts` en vérifie la présence).
  'briefing.actions.contactBounced',
  // #2095.12 (épopée #2993) — un rendez-vous externe terminé sans note.
  'briefing.actions.meetingNoFollowup',
  // #2095.6 — les AUTRES bloqueurs de la porte « prêt à facturer » : une clé
  // PAR BLOQUEUR, même raison que `invoicingBlockedMissing*` juste au-dessus.
  'briefing.actions.invoiceBlockedTimesheetNotSubmitted',
  'briefing.actions.invoiceBlockedTimesheetNotValidated',
  'briefing.actions.invoiceBlockedTimesheetDisputed',
  'briefing.actions.invoiceBlockedTimesheetAnomalies',
  'briefing.actions.invoiceBlockedUnexplainedGap',
  'briefing.actions.invoiceBlockedTimesheetRejected',
  'briefing.actions.invoiceBlockedPoPeriodMismatch',
  'briefing.actions.invoiceBlockedLegalContractInactive',
  // #2095.10 / #2107.16 / #2095.49 — une clé par donnée critique
  // (`BRIEFING_CRITICAL_FIELDS`, `@bellum/contracts`).
  'briefing.actions.criticalDataMissionConsultant',
  'briefing.actions.criticalDataBillingContactEmail',
  // #2095.45 — démarrage et avenant de mission.
  'briefing.actions.missionStarting',
  'briefing.actions.missionAmendmentPending',
  // #2095.41 — un contact qui n'est plus en poste.
  'briefing.actions.contactLeft',
  // #2107.15 — le CRM, troisième outil d'un connecteur cassé.
  'briefing.actions.connectorBrokenCrm',
  // ⚠️ #1391 — PAS de `briefing.actions.overdueTask`. Une tâche en retard vit
  // dans « Tes tâches », la colonne d'à côté, où elle est cliquable. Voir le
  // commentaire de `buildBriefingActions` et `overdue-task-shows-once.spec.ts`.
] as const

/**
 * Les clés du FAIT, quand la carte en énonce un à part de son libellé.
 *
 * Une seule famille en a besoin aujourd'hui, et c'est la bonne raison :
 * « Prépare la soutenance » est un ORDRE, pas un fait. Les cinq autres cartes
 * énoncent déjà leur fait dans leur libellé — « X n'a pas répondu depuis neuf
 * jours » EST le fait — et le répéter dans un second bloc afficherait deux fois
 * la même phrase (loi 4 du tome 7).
 */
export const BRIEFING_FACT_LABEL_KEYS = [
  'briefing.facts.meeting',
  'briefing.facts.meetingNoSubject',
  // #2107.28 — « ce qui a bougé » sur un compte suivi. Le fait devient alors
  // le HEADLINE de la carte (même mécanique que `briefing.facts.meeting`),
  // et le nom du compte reste lisible juste en dessous via `businessObject`.
  'briefing.facts.freshSignal',
  // #2095.12 (épopée #2993) — le rendez-vous est TERMINÉ, jamais « à venir » :
  // un fait distinct de `briefing.facts.meeting`, qui daterait la carte comme
  // si le rendez-vous restait devant soi.
  'briefing.facts.meetingEnded',
  'briefing.facts.meetingEndedNoSubject',
] as const

/**
 * Les clés du CONTEXTE — « pourquoi cette carte, maintenant ».
 *
 * Chacune énonce le CRITÈRE DE SÉLECTION qui a fait entrer la carte dans la
 * liste d'aujourd'hui, pas un commentaire d'ambiance. Écrit, il se conteste :
 * quelqu'un qui trouve « moins de 24 h » trop court peut le dire. Deviné, il se
 * subit — c'est toute la différence entre un tri qu'on comprend et un tri qu'on
 * finit par ignorer.
 */
export const BRIEFING_CONTEXT_LABEL_KEYS = [
  'briefing.context.conflict',
  'briefing.context.meetingWithin',
  'briefing.context.positiveReply',
  'briefing.context.silence',
  'briefing.context.silenceUndated',
  'briefing.context.freshSignal',
  'briefing.context.freshSignalUndated',
  'briefing.context.freshSignalTracked',
  // #2319.21 — le second horizon : le rendez-vous commence dans l'heure.
  'briefing.context.meetingImminent',
  // #2107.3 — le critère qui fait entrer un besoin dans la liste : le seuil
  // d'ouverture sans shortlist (`needStillOpenSql`/`needStaffableNotRefusedSql`
  // côté requête, `NEED_STALE_AFTER_DAYS` ci-dessous côté brief).
  'briefing.context.needStale',
  // #3389.13 — le critère d'une reprise échue : la date que l'utilisateur a posée.
  'briefing.context.needResumeDue',
  // #2095.2 — le critère d'une mission qui approche de sa fin : l'échéance en
  // jours (`MISSION_ENDING_SOON_DAYS` ci-dessous).
  'briefing.context.missionEnding',
  // #2095.7 — le critère d'un paiement en retard : le retard en jours, jamais
  // un montant (aucune conversion de devise à faire ici, doctrine « montants
  // par devise, jamais convertis »).
  'briefing.context.paymentOverdue',
  // #2095.8 — le critère d'un appel d'offres proche : l'échéance en jours
  // (`RFP_DUE_SOON_DAYS` ci-dessous).
  'briefing.context.rfpDue',
  // #2107.7 — le SEUIL atteint (45, 30 ou 15 jours), pas le compte exact de
  // jours restants (déjà porté par le libellé) : c'est ce qui rend les trois
  // fenêtres DISTINGUABLES à l'écran plutôt qu'un unique « bientôt ».
  'briefing.context.missionEndingWithin',
  // #2106.6 — le critère d'un consultant bientôt disponible : le nombre de
  // jours avant que sa dernière affectation en cours ne se termine.
  'briefing.context.consultantAvailable',
  // #2107.6 — le critère d'une disponibilité à reconfirmer : le nombre de
  // jours écoulés depuis la SAISIE, jamais depuis la création de la fiche
  // (même lecture que `TalentRoutinesService.availabilityToReconfirm`).
  'briefing.context.availabilityReconfirm',
  // #2107.8 — le critère d'une mission sans date de fin : l'absence
  // elle-même, jamais un compte de jours qui n'existe pas ici.
  'briefing.context.missionNoEndDate',
  // #2107.15 — le critère d'un connecteur cassé : le droit d'écriture
  // retiré, jamais une déconnexion (déjà montrée par le bloc concerné).
  'briefing.context.connectorBroken',
  // #2107.10 — le critère d'un renouvellement non engagé : l'absence de
  // conversation, jamais un compte de jours déjà porté par le libellé.
  'briefing.context.renewalNotEngaged',
  // #2107.4 — le critère d'un profil sans retour : le nombre de jours écoulés
  // depuis l'ENVOI, jamais depuis la création de la fiche.
  'briefing.context.submissionNoResponse',
  // #2107.14 — le critère d'une exigence d'AO non couverte : le COMPTE
  // d'exigences obligatoires non validées, jamais leur contenu (le corps
  // d'une exigence ne sort pas ici, même doctrine que le corps d'un message).
  'briefing.context.rfpRequirementGap',
  // #2107.18 — le critère d'un compte sans propriétaire : l'absence
  // elle-même (`assigned_to IS NULL`), jamais un compte de jours qui n'existe
  // pas ici.
  'briefing.context.accountNoOwner',
  // #2106.9/#2107.1 — le critère est l'ABSENCE elle-même (aucune tâche encore
  // ouverte rattachée), jamais un compte de jours qui n'existe pas ici — même
  // raison que `accountNoOwner` juste au-dessus.
  'briefing.context.projectNoNextAction',
  // #2107.2 — le critère d'une affaire vieillissante : le nombre de jours
  // depuis le dernier mouvement d'étape (`stage_entered_at`), la même donnée
  // que `pipelineHealth` lit pour ses raisons `ageing`/`stale`.
  'briefing.context.projectStale',
  // #2107.9 — le critère d'un CRA manquant : le mois est CLOS et rien n'a été
  // déposé, jamais un compte de jours (déjà porté par le libellé).
  'briefing.context.craMissing',
  // #2107.11 — le critère d'un mois prêt à facturer : l'ABSENCE de bloqueur,
  // jamais un montant (aucune conversion de devise, doctrine du dépôt).
  'briefing.context.invoiceReady',
  // #2107.16 — le critère de chacun des cinq bloqueurs « donnée manquante » :
  // pourquoi CETTE donnée précise empêche de facturer.
  'briefing.context.invoicingBlockedMissingRate',
  'briefing.context.invoicingBlockedMissingPo',
  'briefing.context.invoicingBlockedMissingBillingContact',
  'briefing.context.invoicingBlockedMissingStartDate',
  'briefing.context.invoicingBlockedMissingCost',
  // #2095.41 (épopée #2993) — le critère d'un contact au rebond : l'e-mail
  // n'a PAS atteint sa boîte (`email_bounced_at`), jamais une absence de
  // réponse (déjà porté par `follow_up`/`reply`, un fait DISTINCT).
  'briefing.context.contactBounced',
  // #2095.12 (épopée #2993) — le critère d'un rendez-vous sans suite : la
  // fenêtre de rattrapage (`MEETING_FOLLOWUP_LOOKBACK_HOURS` ci-dessous),
  // jamais un compte de jours qui n'existe pas ici.
  'briefing.context.meetingNoFollowup',
  // #2095.6 — le critère d'une facture bloquée par un tiers ou un relevé :
  // le bloqueur, nommé dans le libellé ; le contexte dit s'il se lève
  // MAINTENANT (chez nous) ou s'il attend quelqu'un d'autre (#2095.71).
  'briefing.context.invoiceBlocked',
  'briefing.context.invoiceBlockedAwaitingThirdParty',
  // #2095.10 / #2107.16 / #2095.49 — le geste que la donnée manquante bloque.
  'briefing.context.criticalDataMissionConsultant',
  'briefing.context.criticalDataBillingContactEmail',
  // #2095.45 — la fenêtre de démarrage (`MISSION_STARTING_SOON_DAYS`), et
  // l'âge de l'avenant envoyé.
  'briefing.context.missionStarting',
  'briefing.context.missionAmendmentPending',
  // #2095.41 — la fenêtre de détection d'un départ (`CONTACT_LEFT_LOOKBACK_DAYS`).
  'briefing.context.contactLeft',
  // #2107.15 — le jeton ne se rafraîchit plus : il faut reconnecter, ce n'est
  // pas un droit retiré (`connectorBroken`).
  'briefing.context.connectorDisconnected',
] as const

/**
 * #2095.59 — LE VERDICT de chaque genre : ce qu'il faut retenir, en une phrase.
 *
 * Une clé PAR GENRE (`briefing.verdict.<genre en camelCase>`), interpolée avec
 * les variables de la carte elle-même : le verdict ne dit rien que la carte ne
 * sache déjà, il dit QUOI EN RETENIR (« un des deux rendez-vous doit bouger »).
 * Dérivée de `BRIEFING_ACTION_KINDS` : un genre ajouté au contrat a sa clé ici
 * sans qu'on puisse l'oublier, et `briefing-labels.spec.ts` exige sa traduction.
 */
export const BRIEFING_VERDICT_LABEL_KEYS: readonly string[] = BRIEFING_ACTION_KINDS.map(
  kind => `briefing.verdict.${camelKind(kind)}`,
)

/**
 * #2099.7 / #2095.85 — LA CONSÉQUENCE MÉTIER, seulement pour les genres qui la
 * SAVENT : ceux dont le fait porte mécaniquement ce qui arrive si on ne fait
 * rien (une facture qui ne part pas, une mission qui s'arrête, un message qui
 * n'arrive pas). Un silence ou un signal de compte ne savent pas ce qui
 * arrivera : pour eux, rien — jamais une menace vague.
 */
const CONSEQUENCE_KINDS = [
  'mission_end',
  'payment_overdue',
  'rfp_due',
  'connector_broken',
  'renewal_not_engaged',
  'rfp_requirement_gap',
  'cra_missing',
  'invoice_ready',
  'invoicing_blocked_missing_data',
  'contact_bounced',
  'invoice_blocked',
  'critical_data_missing',
  'mission_amendment_pending',
  'contact_left',
] as const satisfies readonly BriefingActionKind[]
export const BRIEFING_CONSEQUENCE_LABEL_KEYS: readonly string[] = CONSEQUENCE_KINDS.map(
  kind => `briefing.consequence.${camelKind(kind)}`,
)

/** `invoice_blocked` → `invoiceBlocked` — la casse des clés i18n de ce namespace. */
function camelKind(kind: string): string {
  return kind.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

/**
 * #2095.34 — LA PERMISSION qu'exige l'écran ouvert par la carte, lue au
 * catalogue des écrans (`routeContractFor`, la SEULE définition des droits par
 * écran — GA-26), jamais déclarée à la main par famille. La requête (`?…`) ne
 * change pas l'écran. `null` = aucun droit distinct requis, ou aucun écran.
 */
export function cardPermission(href: string | null): BriefingAction['permission'] {
  if (!href) return null
  return routeContractFor(href.split('?')[0] ?? href)?.requiredPermission ?? null
}

/**
 * #2095.59 / #2095.85 / #2095.34 — ce que le producteur SAIT, posé une fois
 * pour toutes les familles : le verdict de son genre, la conséquence quand
 * elle est sue, la permission de l'écran ouvert. `estimatedMinutes` reste nul
 * (aucune durée n'est OBSERVÉE ici, voir `demo-coverage.ts`).
 */
function sayWhatIsKnown(action: BriefingAction): BriefingAction {
  const kindKey = camelKind(action.kind)
  return {
    ...action,
    verdict: { labelKey: `briefing.verdict.${kindKey}`, labelVars: action.labelVars },
    consequence: (CONSEQUENCE_KINDS as readonly string[]).includes(action.kind)
      ? { labelKey: `briefing.consequence.${kindKey}`, labelVars: action.labelVars }
      : null,
    permission: cardPermission(action.href),
  }
}

/**
 * #2095.74 — UN OBJET N'APPARAÎT PAS À LA FOIS COMME PRIORITÉ ET COMME TÂCHE DU
 * JOUR. Une carte dont l'objet (compte, contact, affaire) porte déjà une tâche
 * OUVERTE en retard ou due aujourd'hui — les deux paniers que « Tes tâches »
 * montre en tête (`taskBucket`, la SEULE définition des paniers) — sort de la
 * liste : l'objet est déjà dans la journée, par la tâche, où il se coche.
 *
 * Une tâche plus lointaine ne retire rien : elle n'est pas dans la journée, et
 * la carte dit un fait d'AUJOURD'HUI. Distinct de `excludeAlreadyTransformed`
 * (#2105.53, service), qui retire la carte transformée en tâche quel que soit
 * son jour.
 */
export function excludeObjectsAlreadyTasked(
  actions: readonly BriefingAction[],
  openTasks: readonly Pick<Task, 'status' | 'dueOn' | 'priority' | 'accountId' | 'contactId' | 'projectId'>[],
  now: Date,
): BriefingAction[] {
  const inToday = new Set<string>()
  for (const task of openTasks) {
    const bucket = taskBucket(task, now)
    if (bucket !== 'overdue' && bucket !== 'today') continue
    if (task.accountId) inToday.add(`account:${task.accountId}`)
    if (task.contactId) inToday.add(`contact:${task.contactId}`)
    if (task.projectId) inToday.add(`project:${task.projectId}`)
  }
  if (inToday.size === 0) return [...actions]
  return actions.filter(
    action => !action.businessObject || !inToday.has(`${action.businessObject.kind}:${action.businessObject.id}`),
  )
}

/**
 * L'HORIZON de préparation d'un rendez-vous, en heures.
 *
 * Il était écrit deux fois : en valeur par défaut de `selectMeetingsToPrepare`,
 * et nulle part ailleurs — donc le contexte de la carte (« il commence dans
 * moins de N heures ») n'avait aucun moyen de dire le VRAI N. Un réglage vit à
 * un seul endroit : le voici, et la fonction de sélection le lit.
 */
export const MEETING_PREP_HORIZON_HOURS = 24

/**
 * #2095.12 (épopée #2993) — jusqu'à combien d'heures EN ARRIÈRE un rendez-vous
 * externe terminé est encore rattrapable dans « Aujourd'hui ».
 *
 * Un seul endroit (GA-26) : `BriefingService.buildMeetingsWithoutFollowup` lit
 * la MÊME constante pour borner sa fenêtre de lecture agenda, jamais une
 * seconde valeur qui pourrait diverger.
 */
export const MEETING_FOLLOWUP_LOOKBACK_HOURS = 24

/**
 * Depuis combien d'heures un signal est encore « frais ».
 *
 * ⚠️ UN seul endroit. Il vivait dans `briefing.service.ts`, qui l'utilise pour
 * SÉLECTIONNER les comptes ; il est nécessaire ici pour DIRE le critère à
 * l'écran (« signal apparu dans les 48 dernières heures ») et pour dater la
 * péremption du fait. Le recopier aurait fait afficher « 48 h » sur une
 * sélection à 72 h le jour où l'un des deux bouge — un brief du lundi qui ne
 * voit plus le week-end pendant qu'il affirme le contraire. Le service importe
 * celui-ci.
 */
export const FRESH_SIGNAL_HOURS = 48

/**
 * Depuis combien de jours un besoin ouvert doit rester SANS shortlist pour
 * mériter une carte (#2107.3).
 *
 * ⚠️ UN seul endroit. C'était déjà la valeur par défaut de
 * `CrmRoutinesService.needsWithoutShortlist` (`days = 5`), écrite là pour la
 * notification de la routine `needs_without_shortlist`. La recopier ici en
 * dur ferait diverger les deux seuils le jour où l'un des deux bouge — le même
 * risque que `MEETING_PREP_HORIZON_HOURS` documente juste au-dessus. La
 * requête du brief (`staleNeedsWithoutShortlistSql`, dans
 * `briefing.service.ts`) lit CETTE constante, pas un nombre recopié.
 */
export const NEED_STALE_AFTER_DAYS = 5

/**
 * Sous combien de jours restants la fin d'une mission mérite une carte
 * (#2095.2).
 *
 * ⚠️ UN seul endroit. C'était déjà le seuil de `consultantsFreeingSoon`
 * (`laura-probe.service.ts`, `FREEING_SOON_DAYS`) pour DIRE qu'un consultant se
 * libère bientôt — un concept voisin mais distinct (une AFFECTATION qui finit,
 * pas la MISSION elle-même). Le recopier en dur ici ferait diverger les deux
 * seuils le jour où l'un des deux bouge, même risque que documenté au-dessus
 * pour `NEED_STALE_AFTER_DAYS`. La requête du brief
 * (`briefing.service.ts:missionsEndingSql`) lit CETTE constante.
 */
export const MISSION_ENDING_SOON_DAYS = 30

/**
 * Sous combien de jours restants une affectation en cours mérite une carte
 * « consultant bientôt disponible » (#2106.6).
 *
 * ⚠️ UN seul endroit. C'est LE MÊME nombre que `FREEING_SOON_DAYS`
 * (`laura-probe.service.ts:47`, « se libère dans moins de 30 jours »), qui sert
 * une sonde d'espace (un COMPTE), jamais une carte nommée. Une constante
 * distincte plutôt qu'un import : l'importer ferait monter le cliquet GA-07
 * pour ce seul nombre (voir le commentaire de `buildConsultantsFreeingSoon`,
 * `briefing.service.ts`) — même choix, même raison, que `MISSION_ENDING_SOON_DAYS`
 * ci-dessus vis-à-vis de `DeliveryService`. Si l'un des deux seuils bouge un
 * jour pour une bonne raison propre à son usage, ils sont libres de diverger ;
 * jusque-là, ils restent la MÊME valeur, écrite deux fois consciemment.
 */
export const CONSULTANT_FREEING_SOON_DAYS = 30

/**
 * Sous combien de jours restants un appel d'offres mérite une carte
 * (#2095.8).
 *
 * ⚠️ UN seul endroit. C'était déjà le seuil de `rfpsDueWithGaps`
 * (`laura-probe.service.ts`, littéral `interval '3 days'`) pour COMPTER les AO
 * dont l'échéance approche avec des exigences sans réponse. Le recopier en dur
 * ferait diverger les deux seuils le jour où l'un des deux bouge — même risque
 * documenté pour `NEED_STALE_AFTER_DAYS` et `MISSION_ENDING_SOON_DAYS`. La
 * requête du brief (`briefing.service.ts:rfpsDueSoonSql`) lit CETTE constante.
 */
export const RFP_DUE_SOON_DAYS = 3

/**
 * Après combien de jours sans reconfirmation une disponibilité mérite une
 * carte (#2107.6).
 *
 * ⚠️ UN seul endroit, même risque que documenté pour les seuils ci-dessus.
 * C'est déjà `AVAILABILITY_REVALIDATION_DAYS`
 * (`consultants/matching/pushable.ts`, poids de fraîcheur du moteur de
 * matching) ET le défaut de `TalentRoutinesService.availabilityToReconfirm`
 * (`routines/talent-routines.service.ts`), qui alimente une routine de
 * rappel déjà existante — jamais wiré à « Aujourd'hui » avant ce lot. Une
 * constante DUPLIQUÉE plutôt qu'importée : l'importer ferait monter le
 * cliquet GA-07 (`module-boundaries.spec.ts`) pour un seul nombre, même choix
 * que {@link CONSULTANT_FREEING_SOON_DAYS} vis-à-vis de `laura-probe.service.ts`.
 * La requête du brief (`briefing.service.ts:buildAvailabilityToReconfirm`)
 * lit CETTE constante.
 */
export const AVAILABILITY_RECONFIRM_AFTER_DAYS = 60

/**
 * #2107.4 — combien de jours SANS RETOUR après l'envoi d'un profil avant que
 * « Aujourd'hui » le signale. Même ordre de grandeur que
 * {@link PAYMENT_REMINDER_SCHEDULE_DAYS} (premier seuil à sept jours,
 * `@bellum/contracts`) : une semaine sans nouvelle d'un client est le premier
 * seuil raisonnable dans tout ce dépôt, jamais un nombre neuf inventé ici.
 */
export const SUBMISSION_NO_RESPONSE_AFTER_DAYS = 7

/** #2095.45 — la fenêtre de DÉMARRAGE d'une mission, en jours : une semaine
 *  pour préparer l'arrivée du consultant (accès, matériel, kick-off). */
export const MISSION_STARTING_SOON_DAYS = 7

/** #2095.41 — la fenêtre dans laquelle un départ de contact fait une carte. */
export const CONTACT_LEFT_LOOKBACK_DAYS = 14

/**
 * #2095.6 — les bloqueurs de facturation qui ne sont NI une donnée manquante
 * (`invoicing_blocked_missing_data`) NI un CRA absent (`cra_missing`).
 */
export const OTHER_INVOICE_BLOCKERS = [
  'timesheet_not_submitted',
  'timesheet_not_validated',
  'timesheet_disputed',
  'timesheet_anomalies',
  'unexplained_gap',
  'timesheet_rejected',
  'po_period_mismatch',
  'legal_contract_inactive',
] as const satisfies readonly InvoiceBlocker[]
export type OtherInvoiceBlocker = (typeof OTHER_INVOICE_BLOCKERS)[number]

/**
 * #2095.71 — les bloqueurs qui ATTENDENT UN TIERS : le relevé est entre les
 * mains du client, rien ne se lève aujourd'hui de notre côté. Leur carte
 * descend sous toute carte actionnable ({@link NOT_ACTIONABLE_NOW_PRIORITY}).
 */
const AWAITING_THIRD_PARTY_BLOCKERS: ReadonlySet<OtherInvoiceBlocker> = new Set(['timesheet_not_validated'])

/**
 * #2095.71 — LE RANG d'un problème qu'on ne peut pas résoudre maintenant :
 * derrière TOUTES les familles (la dernière est au rang 22). Il reste dans la
 * liste — un fait vrai ne disparaît pas — mais ne prend jamais la place d'un
 * geste possible aujourd'hui.
 */
export const NOT_ACTIONABLE_NOW_PRIORITY = 30

/** Une provenance de carte : la source, la capacité, et la date d'observation. */
function provenance(
  source: FieldSource,
  capability: BriefingFactCapability,
  observedAt: string | null,
): BriefingFact['provenance'] {
  return { source, capability, observedAt }
}

/**
 * Un fait de carte, ou `null` — jamais un fait sans source.
 *
 * ⚠️ `observedAt` n'a AUCUN repli. Une date illisible reste `null`, et l'écran
 * dit que la date est inconnue. Y mettre l'instant du brief écrirait « observé
 * aujourd'hui » sur un fait dont personne ne sait quand il a été vu : le même
 * défaut que rendre « 0 » pour « non mesuré », une phrase de plus loin de la
 * vérité.
 */
function fact(
  source: FieldSource,
  capability: BriefingFactCapability,
  observedAt: string | null,
  labelKey: (typeof BRIEFING_FACT_LABEL_KEYS)[number] | null = null,
  labelVars: Record<string, string | number> = {},
): BriefingFact {
  return { labelKey, labelVars, provenance: provenance(source, capability, observedAt) }
}

/** Un contexte de carte — la clé DÉCLARÉE et ses variables. */
function context(
  labelKey: (typeof BRIEFING_CONTEXT_LABEL_KEYS)[number],
  labelVars: Record<string, string | number> = {},
): NonNullable<BriefingAction['context']> {
  return { labelKey, labelVars }
}

/** Une date ISO lisible, ou `null`. Jamais une date de repli. */
/**
 * LES SEPT AXES, TOUJOURS TOUS NOMMÉS — #2095.61 à #2095.67, GA-18 / GA-19.
 *
 * On passe les axes que cette famille a RÉELLEMENT pu peser ; les six ou cinq
 * autres sortent quand même, marqués non évaluables. C'est la doctrine en deux
 * moitiés qui coexistent : sous un score, un axe non évaluable reste NOMMÉ (il
 * ne disparaît pas), et il SORT du dénominateur (il ne compte pas pour zéro).
 *
 * ⚠️ Aucune valeur ne sort d'ici — ni note, ni poids, ni pourcentage. Le retour
 * demande qu'une priorité explique pourquoi elle passe devant (#2095.81) et,
 * dans la même issue, qu'aucun score interne ne soit exposé (#2095.83). Dire
 * QUELS axes ont pesé répond aux deux ; dire COMBIEN n'en respecterait aucun.
 */
function axes(evaluated: readonly BriefingRankingAxis[]): BriefingAction['rankingAxes'] {
  return BRIEFING_RANKING_AXES.map(axis => ({ axis, evaluated: evaluated.includes(axis) }))
}

/**
 * #2397.7 — MÊME AXE, PESÉ PAR GENRE DE CARTE.
 *
 * `roleFit` (« l'adéquation avec le rôle et les objectifs de la personne »,
 * #2397.2) reste NOMMÉ mais non évalué par défaut, exactement comme
 * `dependency`/`opportunity` : ce n'est QUE lorsque la personne a marqué ce
 * GENRE de carte comme prioritaire pour elle (`isRoleFitEngaged`, sac
 * `user_preferences`) qu'il rejoint les axes réellement pesés. Jamais un
 * `false` inventé pour un genre non marqué — l'absence reste non évaluée.
 */
function axesFor(
  kind: BriefingActionKind,
  evaluated: readonly BriefingRankingAxis[],
  roleFit: BriefingRoleFitPreferences,
): BriefingAction['rankingAxes'] {
  return axes(roleFit[kind] ? [...evaluated, 'roleFit'] : evaluated)
}

/**
 * Ce qu'une carte de CE module ne sait pas encore dire — #2099.6, .7, .12.
 *
 * Le verdict et la conséquence métier demandent une phrase par famille que
 * personne n'a écrite ; le temps estimé demande une mesure que rien ici ne
 * fait. Les remplir d'un « à traiter » ou d'un « 15 min » plausible serait la
 * donnée inventée que la doctrine interdit, et l'écran n'affiche AUCUNE ligne
 * pour un champ nul — l'absence ne fait pas une ligne.
 */
/**
 * #2095.19 / #2095.34 / #2993 — `owner` REJOINT ce socle, jamais une constante :
 * le brief reste individuel, donc `owner` vaut le LECTEUR de CE brief précis,
 * porté par `input.ownerId`. `permission` reste, lui, une constante : aucune
 * carte ne requiert aujourd'hui de droit distinct de celui du lecteur (voir
 * le champ au contrat, `daily-briefing.ts`).
 */
function notSaidYet(ownerId: string | null): {
  verdict: null
  consequence: null
  estimatedMinutes: null
  owner: string | null
  permission: null
} {
  return { verdict: null, consequence: null, estimatedMinutes: null, owner: ownerId, permission: null }
}

function isoOrNull(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
}

const ONE_DAY_MS = 24 * 3600_000

/** #2095.70 — le rang d'une fin de mission : devant un compte potentiel à J-30. */
function missionEndPriority(daysUntilEnd: number): number {
  return daysUntilEnd <= 30 ? 5 : 7
}

const INVOICE_BLOCKED_LABEL_KEYS = {
  timesheet_not_submitted: 'briefing.actions.invoiceBlockedTimesheetNotSubmitted',
  timesheet_not_validated: 'briefing.actions.invoiceBlockedTimesheetNotValidated',
  timesheet_disputed: 'briefing.actions.invoiceBlockedTimesheetDisputed',
  timesheet_anomalies: 'briefing.actions.invoiceBlockedTimesheetAnomalies',
  unexplained_gap: 'briefing.actions.invoiceBlockedUnexplainedGap',
  timesheet_rejected: 'briefing.actions.invoiceBlockedTimesheetRejected',
  po_period_mismatch: 'briefing.actions.invoiceBlockedPoPeriodMismatch',
  legal_contract_inactive: 'briefing.actions.invoiceBlockedLegalContractInactive',
} as const satisfies Record<OtherInvoiceBlocker, (typeof BRIEFING_ACTION_LABEL_KEYS)[number]>

const CRITICAL_DATA_LABEL_KEYS = {
  mission_consultant: 'briefing.actions.criticalDataMissionConsultant',
  billing_contact_email: 'briefing.actions.criticalDataBillingContactEmail',
} as const satisfies Record<BriefingCriticalField, (typeof BRIEFING_ACTION_LABEL_KEYS)[number]>

const CRITICAL_DATA_CONTEXT_KEYS = {
  mission_consultant: 'briefing.context.criticalDataMissionConsultant',
  billing_contact_email: 'briefing.context.criticalDataBillingContactEmail',
} as const satisfies Record<BriefingCriticalField, (typeof BRIEFING_CONTEXT_LABEL_KEYS)[number]>

/** #2095.60 — l'angle d'attaque déjà calculé pour le compte, en artefact prêt. */
function angleArtifact(
  accountId: string,
  angle: { id: string; title: string },
  preparedAt: string,
): BriefingAction['preparedArtifacts'] {
  return [
    {
      id: `angle:${angle.id}`,
      kind: 'angle',
      labelKey: 'briefing.artifacts.angle',
      labelVars: { title: angle.title },
      href: `/accounts/${accountId}`,
      businessObject: null,
      preparedAt,
      version: 1,
      // Calculé par l'analyse du compte (nos services), jamais par un humain.
      source: 'pipeline',
      status: 'ready',
      preparedBy: 'laura',
      creditsCost: null,
    },
  ]
}

/**
 * #3671.1 — l'ÉCHÉANCE d'une facture, jamais l'instant de lecture. `daysOverdue`
 * vient de `(current_date - due_on)::int` (SQL) : son inverse exact donne
 * `due_on`, stable d'une lecture à l'autre tant que la facture reste impayée —
 * un retard de 14 j aujourd'hui et de 15 j demain pointent la MÊME échéance.
 * Dater le fait sur `readAt` (l'instant du brief, différent à chaque appel)
 * empêchait toute correction (« Donnée fausse ») de survivre à la lecture
 * suivante : `isStillHeld` (côté contrats) ne reconnaissait jamais le même fait.
 */
function invoiceDueOn(now: Date, daysOverdue: number): string | null {
  if (!Number.isFinite(daysOverdue)) return null
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return new Date(today - daysOverdue * ONE_DAY_MS).toISOString()
}

/**
 * L'écran de la messagerie, tel que la SPA le sert.
 *
 * Écrit ici une seule fois, et confronté au vrai arbre de routes par
 * `briefing-routes.spec.ts`. Le brief émettait `/messagerie` — le nom de la
 * capacité, pas celui de la route — et chaque relance du bloc « À faire
 * maintenant » ouvrait « Page introuvable », en production, sur l'écran le plus
 * regardé du produit. Même famille de défaut que les clés i18n : une chaîne
 * côté serveur, une route côté web, aucun lien entre les deux.
 */
const MAILBOX_ROUTE = '/mailbox'

/**
 * L'écran des appels d'offres — `/rfp` (#2095.8).
 *
 * ⚠️ Pas de dossier PAR appel d'offres : `RfpPage` sélectionne un dossier en
 * état local (`useState`), jamais par une URL — contrairement à
 * `/missions/:id` (D200). La carte ouvre donc la LISTE, comme `conflict`
 * ouvre le brief plutôt qu'un dossier qui n'existe pas ; le jour où un dossier
 * dédié existe, il prend la place de cette route.
 */
const RFP_ROUTE = '/rfp'

/**
 * « Dites-moi ce qui mérite mon attention maintenant. » — le premier
 * job-to-be-done transverse des méta-analyses, et la seule chose qu'un brief du
 * matin doit réussir.
 *
 * Le tri est ici, pur et testable, pour deux raisons. D'abord parce que l'ordre
 * des priorités est une décision produit qui doit se relire ; ensuite parce
 * qu'un modèle qui classerait ces actions changerait d'avis d'un jour à
 * l'autre sur les mêmes données, et un commercial cesse de faire confiance à
 * une liste qui bouge sans raison.
 *
 * L'ordre retenu suit une seule logique : ce qui a une heure passe avant ce qui
 * n'en a pas. Un rendez-vous dans une heure ne se rattrape pas ; une relance de
 * J+9 se rattrape à midi.
 */

// Combien d'actions un brief CLASSE au maximum : `BRIEFING_ACTIONS_MAX`, au
// contrat, avec le nombre que l'écran rend d'emblée. Le plafond vivait ici, en
// dur, et l'écran ne connaissait que ce que l'API lui envoyait : impossible de
// replier ce qui dépasse sans que les deux côtés partagent les deux nombres.

/**
 * Combien de fils un même interlocuteur peut occuper dans « À faire maintenant ».
 *
 * Trouvé en recette le 17/08, sur le premier écran qu'un bêta testeur ouvre :
 * quatre lignes strictement identiques — « nathan.kosmowski@esce.fr a répondu
 * favorablement — enchaîne » — remplissaient les cinq places. C'étaient bien
 * quatre fils DIFFÉRENTS, mais rien ne les distinguait à l'écran, si bien que le
 * brief se lisait comme un bug d'affichage tout en cachant les quatre autres
 * sujets de la journée.
 *
 * Deux corrections, et il faut les deux : le libellé porte maintenant le SUJET
 * (la donnée était déjà là, simplement pas affichée), et une même personne ne
 * peut plus occuper plus de deux places. Deux et non une : quelqu'un qui répond
 * favorablement sur deux affaires distinctes mérite bien deux lignes ; au
 * troisième fil, ce n'est plus une priorité, c'est une boîte de réception.
 *
 * ⚠ Ce plafond SUPPOSE que le sujet distingue les fils. Quand il ne le fait pas,
 * il ne suffit plus — voir `selectThreadsToShow`, recette du 27/08.
 */
const MAX_ACTIONS_PER_COUNTERPART = 2

/** Le sujet du fil, ou `''` quand il n'y en a pas d'exploitable. */
function subjectOf(thread: MailThread): string {
  return (thread.subject ?? '').trim()
}

/** L'interlocuteur normalisé du fil, ou `''` quand il n'y en a pas de lisible. */
function counterpartOf(thread: MailThread): string {
  return (thread.counterpart ?? '').trim().toLowerCase()
}

/**
 * Les fils retenus pour « À faire maintenant ».
 *
 * DEUX règles, et il faut les deux :
 *
 *  1. **Deux fils qui rendraient la MÊME phrase n'en rendent qu'une.** Recette
 *     du 27/08, en production, sur l'écran le plus regardé du produit : deux
 *     `<a>` au texte identique et à la même destination — « nathan.kosmowski@…
 *     a répondu favorablement sur « Louis, toujours intéressé ? » — enchaîne ».
 *     C'étaient bien DEUX fils, avec deux identifiants distincts ; mais rien à
 *     l'écran ne les séparait, et rien dans la donnée ne le permettait : le
 *     geste proposé est le même, sur le même sujet, avec la même personne.
 *     La seconde ligne coûtait donc une des cinq places sans rien apprendre —
 *     le tort exact que la règle 2 corrigeait le 17/08.
 *
 *     `identityOf` est fourni par l'appelant, et il porte EXACTEMENT les
 *     données que le libellé de cette action-là affiche : une relance montre
 *     aussi le nombre de jours de silence, donc deux fils au même sujet mais au
 *     silence différent se lisent différemment et restent deux lignes. La
 *     comparaison se fait sur la DONNÉE, jamais sur la phrase rendue :
 *     dédupliquer sur une chaîne traduite marcherait en français et casserait
 *     au premier passage en anglais.
 *
 *  2. **Un même interlocuteur n'occupe pas plus de `limit` places.** Deux et non
 *     une : quelqu'un qui répond favorablement sur deux affaires DISTINCTES
 *     mérite bien deux lignes ; au troisième fil, ce n'est plus une priorité,
 *     c'est une boîte de réception.
 *
 * Dans les deux cas on garde le PREMIER fil reçu, jamais le dernier : l'ordre
 * d'arrivée porte déjà la priorité de l'appelant (le silence le plus ancien
 * d'abord pour les relances, le message le plus récent d'abord pour les
 * réponses favorables).
 */
function selectThreadsToShow(
  threads: readonly MailThread[],
  identityOf: (thread: MailThread) => string,
  limit = MAX_ACTIONS_PER_COUNTERPART,
): MailThread[] {
  const shownIdentities = new Set<string>()
  const perCounterpart = new Map<string, number>()
  const kept: MailThread[] = []

  for (const thread of threads) {
    // Règle 1 — deux fils qui rendraient la même phrase n'en rendent qu'une.
    const identity = identityOf(thread)
    if (shownIdentities.has(identity)) continue

    // Règle 2 — un fil sans interlocuteur lisible n'est comparable à aucun
    // autre POUR LE PLAFOND : il passe, plutôt que d'être regroupé avec tous
    // les autres anonymes. Il reste soumis à la règle 1, qui, elle, compare ce
    // qui s'affiche.
    const counterpart = counterpartOf(thread)
    if (counterpart) {
      const count = perCounterpart.get(counterpart) ?? 0
      if (count >= limit) continue
      perCounterpart.set(counterpart, count + 1)
    }

    shownIdentities.add(identity)
    kept.push(thread)
  }
  return kept
}

type BriefingActionInput = {
  /**
   * L'INSTANT du brief.
   *
   * Il sert à DATER les faits qui n'ont pas d'autre date d'observation que la
   * lecture elle-même : un rendez-vous de 10 h n'a pas été « observé » à 10 h,
   * il a été lu dans l'agenda maintenant. Les faits qui portent leur propre
   * date — le dernier message d'un fil, la détection d'un signal — l'utilisent,
   * elle, et jamais celle-ci.
   */
  now: Date
  /** Rendez-vous externes à venir dans les prochaines 24 h. */
  meetings: AgendaEvent[]
  conflicts: AgendaConflict[]
  awaitingReply: MailThread[]
  unread: MailThread[]
  positiveReplies: MailThread[]
  accountsWithFreshSignal: Array<{
    accountId: string
    companyName: string
    /** Quand le signal a été repéré, ou `null` si la date est illisible. */
    detectedAt: string | null
    /** `false` = on sait qu'il était DÉJÀ là, pas qu'il est apparu ce jour-là. */
    detectionExact: boolean
    /** #2107.28 — CE QUI a bougé (« Levée de fonds Série B »), ou `null` quand
     *  la matérialisation du signal ne porte pas de libellé. Optionnel : les
     *  appelants antérieurs à #2107.28 ne le passent pas encore tous. */
    signalLabel?: string | null
    /** #2097.21 — logo du compte, `null` quand la lecture n'en connaît pas. */
    logoUrl?: string | null
    /** #2097.21 (correctif) — site du compte, pour le repli favicon de
     *  `CompanyAvatar` quand `logoUrl` (le logo Apollo persisté) est vide. */
    website?: string | null
    /** #2095.60 — l'angle d'attaque DÉJÀ calculé pour ce compte
     *  (`attack_angles`, le recommandé puis le mieux classé), ou absent. */
    angle?: { id: string; title: string } | null
  }>
  /**
   * #2107.3 — Besoins ouverts depuis plus de {@link NEED_STALE_AFTER_DAYS}
   * jours, sans shortlist. `days` vient de la LECTURE (la requête le calcule),
   * jamais recalculé ici sur une autre horloge.
   *
   * #3389.13 — `resumeOn` (AAAA-MM-JJ) marque l'autre moitié de la liste : un
   * besoin EN VEILLE dont la date de reprise est échue. `days` y vaut le retard
   * sur cette date. Absent : un besoin ouvert sans shortlist, comme avant.
   */
  staleNeeds: Array<{ id: string; title: string; days: number; resumeOn?: string | null }>
  /**
   * #2106.8 / #2107.7 — missions dont la date de fin tombe dans l'une des
   * TROIS fenêtres de renouvellement de l'espace (J-45, J-30, J-15,
   * `renewalWindow` de `@bellum/contracts`, la SEULE échelle du dépôt, GA-26).
   * `endsOn` sert à EXPIRER la carte, jamais à recalculer `renewal` ici.
   * `thresholdDays` est la BORNE de CET espace pour ce seuil
   * (`renewalWindowBoundDays`, qui lit le réglage `renewal_window_days` de
   * l'espace) — jamais 45/30/15 recopiés en dur ici, un espace peut régler sa
   * propre échelle (GA-26). Optionnel : défaut `[]`, byte-identique à avant.
   */
  missionsEndingSoon?: Array<{
    id: string
    title: string
    renewal: 'j45' | 'j30' | 'j15'
    days: number
    thresholdDays: number
    endsOn?: string | null
  }>
  /* ⚠️ #1391 — PAS de tâches ici, ni en retard ni dues aujourd'hui. Le bloc
     « Tes tâches » les porte toutes, dans la colonne d'à côté, et il est le
     seul des deux où elles se cochent. Voir `buildBriefingActions`. */
  /**
   * #2095.2 — Missions dont la fin (`missions.ends_on`) tombe dans les
   * {@link MISSION_ENDING_SOON_DAYS} prochains jours. `daysUntilEnd` vient de
   * la LECTURE (la requête le calcule), jamais recalculé ici sur une autre
   * horloge — même règle que `staleNeeds.days`.
   *
   * Optionnel, défaut `[]` : les appelants existants (tests, salle de
   * démonstration avant ce lot) restent byte-identiques.
   */
  missionsEnding?: Array<{ id: string; label: string; daysUntilEnd: number }>
  /**
   * #2095.7 — Missions dont la dernière facture (`invoice_readiness`) est en
   * retard de règlement (`unsettledInvoiceSql` + `due_on < aujourd'hui`).
   * `daysOverdue` vient de la LECTURE, jamais recalculé ici. ⚠️ Aucun montant :
   * la doctrine interdit une conversion de devise, et ce module n'en fait
   * aucune — le retard se dit en jours, jamais en argent.
   *
   * Optionnel, défaut `[]` : mêmes appelants inchangés qu'avant ce lot.
   */
  overdueInvoices?: Array<{
    id: string
    label: string
    daysOverdue: number
    /** #3671.6 — le mois (`YYYY-MM`) de la facture dont le retard est dit ; `null`/absent = inconnu. */
    periodMonth?: string | null
  }>
  /**
   * #2095.8 — Appels d'offres dont l'échéance (`rfps.due_at`) tombe dans les
   * {@link RFP_DUE_SOON_DAYS} prochains jours, statut encore ouvert. Même
   * prédicat que `rfpsDueWithGaps` (`laura-probe.service.ts`). `daysUntilDue`
   * vient de la LECTURE, jamais recalculé ici.
   *
   * Optionnel, défaut `[]` : mêmes appelants inchangés qu'avant ce lot.
   */
  rfpsDueSoon?: Array<{ id: string; title: string; daysUntilDue: number }>
  /**
   * #2106.6 — consultants dont TOUTES les affectations en cours (`mission_
   * assignments`) finissent d'ici `FREEING_SOON_DAYS` jours — même prédicat
   * que `consultantsFreeingSoon` (`laura-probe.service.ts`), qui ne rend
   * qu'un compte ; ici, chaque consultant, avec son identité et l'échéance
   * la plus tardive de ses affectations en cours. `days`/`endsOn` viennent de
   * la LECTURE, jamais recalculés ici — même règle que `staleNeeds.days`.
   *
   * Optionnel : défaut `[]`, byte-identique aux appelants existants.
   */
  consultantsFreeingSoon?: Array<{ id: string; name: string; days: number; endsOn: string | null }>
  /**
   * #2107.6 — disponibilités saisies il y a plus de
   * {@link AVAILABILITY_RECONFIRM_AFTER_DAYS} jours, jamais reconfirmées
   * depuis — même lecture que `TalentRoutinesService.availabilityToReconfirm`
   * (routine du vivier, déjà existante), jamais wirée à « Aujourd'hui » avant
   * ce lot. `days` vient de la LECTURE, jamais recalculé ici.
   *
   * Optionnel : défaut `[]`, byte-identique aux appelants existants.
   */
  availabilityToReconfirm?: Array<{ id: string; name: string; days: number }>
  /**
   * #2107.8 — missions ACTIVES sans date de fin (`missions.ends_on IS NULL`).
   * `mission_end` (#2095.2) et la fenêtre de renouvellement (#2106.8/#2107.7)
   * EXCLUENT explicitement ce cas côté requête : sans cette liste séparée,
   * une mission sans date ne peut jamais entrer dans le brief, ni aujourd'hui
   * ni demain — pas parce qu'elle est saine, parce que personne ne la lit.
   *
   * Optionnel : défaut `[]`, byte-identique aux appelants existants.
   */
  missionsWithoutEndDate?: Array<{ id: string; label: string }>
  /**
   * #2107.15 — connecteurs CONNECTÉS mais DÉGRADÉS (droit d'écriture retiré),
   * un par outil concerné. Même prédicat que `RoutinesService.connectorHealth`
   * (`read_only`), lu directement sur `AgendaService`/`MailboxService` — déjà
   * injectés dans `BriefingService`, aucun import cross-module de plus.
   * `tool` fermé à `'mailbox' | 'agenda'` : `crm` demanderait un service que
   * `BriefingService` n'a pas (GA-07), hors de ce lot.
   *
   * Optionnel : défaut `[]`, byte-identique aux appelants existants.
   */
  brokenConnectors?: Array<{ tool: 'mailbox' | 'agenda' | 'crm'; state: 'read_only' | 'disconnected' }>
  /**
   * #2107.10 — missions dans leur fenêtre de renouvellement
   * (#2106.8/#2107.7) dont `renewal_status` est `null` ou `'non_engage'` :
   * même échéance que `missionsEndingSoon`, mais AUCUNE conversation
   * commencée — un fait distinct, plus actionnable. `days` vient de la
   * LECTURE, jamais recalculé ici.
   *
   * Optionnel : défaut `[]`, byte-identique aux appelants existants.
   */
  renewalsNotEngaged?: Array<{ id: string; title: string; days: number }>
  /**
   * #2107.4 — profils ENVOYÉS (`submissions.stage = 'submitted'`) sans
   * AUCUN retour (`first_feedback_at IS NULL`) depuis plus de
   * {@link SUBMISSION_NO_RESPONSE_AFTER_DAYS} jours. `days` vient de la
   * LECTURE, jamais recalculé ici.
   *
   * ⚠️ `stage`, pas `substatus` : voir le correctif de lecture inerte au
   * docblock de `BriefingService.buildSubmissionsWithoutResponse` (mesuré
   * `null` sur des candidatures réellement soumises en production).
   *
   * Optionnel : défaut `[]`, byte-identique aux appelants existants.
   */
  submissionsWithoutResponse?: Array<{ consultantId: string; consultantName: string; days: number }>
  /**
   * #2107.14 — appels d'offres portant au moins une exigence OBLIGATOIRE non
   * couverte (`computeRfpCompliance(requirements).mandatoryUnanswered > 0`,
   * `@bellum/contracts` — fonction PURE déjà utilisée côté écran). `count`
   * vient de CETTE fonction, jamais recalculé ici.
   *
   * Optionnel : défaut `[]`, byte-identique aux appelants existants.
   */
  rfpsWithUncoveredRequirements?: Array<{ id: string; title: string; count: number }>
  /**
   * #2107.18 — comptes ACTIFS (`commercial_status <> 'archived'`) sans
   * propriétaire assigné (`accounts.assigned_to IS NULL`). Même colonne que
   * `ManagerService.coverageMap` (« segment sans propriétaire = zone
   * blanche »), ici au niveau INDIVIDUEL — un compte précis, ouvrable.
   *
   * Optionnel : défaut `[]`, byte-identique aux appelants existants.
   */
  accountsWithoutOwner?: Array<{ id: string; companyName: string }>
  /**
   * #2106.9/#2107.1 (épopée #2801) — affaires EN JEU (`TRIAGED_STAGES`) sans
   * AUCUNE tâche encore ouverte qui leur soit rattachée. `pipelineHealth`
   * (`@bellum/contracts`, raison `without_next_action`) — la MÊME lecture que
   * la carte du pipe (#1325, `ProjectPipelineService.health`), jamais
   * recalculée ici. Bloqué jusqu'à #2801 : sans `/projects/$id`, la carte
   * n'avait aucun dossier où ouvrir.
   *
   * Optionnel : défaut `[]`, byte-identique aux appelants existants.
   */
  projectsWithoutNextAction?: Array<{ id: string; label: string; companyName: string }>
  /**
   * #2107.2 (épopée #2801) — affaires EN JEU (`TRIAGED_STAGES`) dont la
   * fraîcheur a dépassé le seuil de l'ontologie (`pipelineHealth`, raisons
   * `ageing`/`stale` — la MÊME lecture que la carte du pipe, jamais
   * recalculée). `days` vient de la LECTURE (`fetchProjectHealthRows`),
   * jamais recalculé ici — même règle que `staleNeeds.days`.
   *
   * Optionnel : défaut `[]`, byte-identique aux appelants existants.
   */
  staleProjects?: Array<{ id: string; label: string; companyName: string; days: number }>
  /**
   * #2107.9 — missions ACTIVES de l'appelant dont le CRA du mois précédent
   * est MANQUANT (`buildTimesheetLine`, `../delivery/timesheet-view` —
   * fonction PURE réutilisée, jamais recalculée). Optionnel : défaut `[]`.
   */
  craMissing?: Array<{ id: string; label: string }>
  /**
   * #2107.11 — missions ACTIVES de l'appelant dont le mois précédent est PRÊT
   * à facturer (`assessInvoiceReadiness`, `@bellum/contracts` — `state ===
   * 'ready'`, aucun bloqueur restant). Optionnel : défaut `[]`.
   */
  invoicesReady?: Array<{ id: string; label: string }>
  /**
   * #2107.16 — missions ACTIVES de l'appelant dont la porte « prêt à
   * facturer » (`assessInvoiceReadiness`) renvoie `blocked` pour une DONNÉE
   * MANQUANTE sur l'objet — jamais un statut de relevé (`missing_timesheet`
   * relève de {@link craMissing}, pas de cette liste). Cinq bloqueurs
   * possibles, chacun sa clé de libellé NOMMÉE : `missing_rate` (aucun TJM),
   * `missing_po` (aucun bon de commande exigé), `missing_billing_contact`
   * (aucun interlocuteur de facturation), `missing_start_date` (aucune date
   * de début), `missing_cost` (aucun coût chargé). Optionnel : défaut `[]`.
   */
  invoicingBlockedMissingData?: Array<{
    id: string
    label: string
    blocker: 'missing_rate' | 'missing_po' | 'missing_billing_contact' | 'missing_start_date' | 'missing_cost'
  }>
  /**
   * #2095.41 (épopée #2993) — contacts CONNUS dont le dernier e-mail a REBONDI
   * (`contacts.email_bounced_at IS NOT NULL`, posé par le seul webhook
   * fournisseur, #2733 — jamais recalculé ici).
   *
   * Optionnel : défaut `[]`, byte-identique aux appelants existants.
   */
  contactsBounced?: Array<{ id: string; name: string | null }>
  /**
   * #2095.12 (épopée #2993) — rendez-vous externes TERMINÉS dans la fenêtre de
   * rattrapage (`selectEndedMeetingsAwaitingFollowup`) et sans AUCUNE note qui
   * porte leur `sourceEventId` (`notes.existsForSourceEvent`, déjà posé par
   * #2103.1, jamais recalculé ici) : LA lecture vient de `BriefingService`, ce
   * champ ne reçoit que son résultat déjà filtré.
   *
   * Optionnel : défaut `[]`, byte-identique aux appelants existants.
   */
  meetingsWithoutFollowup?: AgendaEvent[]
  /**
   * #2095.6 — missions ACTIVES dont la porte « prêt à facturer » bloque pour
   * un AUTRE bloqueur qu'une donnée manquante (`invoicingBlockedMissingData`)
   * ou qu'un CRA absent (`craMissing`) — le premier par gravité
   * (`INVOICE_BLOCKERS`), lu par `BriefingService.buildInvoicingCards`.
   * Optionnel : défaut `[]`.
   */
  invoicesBlocked?: Array<{ id: string; label: string; blocker: OtherInvoiceBlocker }>
  /**
   * #2095.10 / #2107.16 / #2095.49 — objets du portefeuille dont une DONNÉE
   * CRITIQUE manque (`BRIEFING_CRITICAL_FIELDS`). Optionnel : défaut `[]`.
   */
  criticalDataMissing?: Array<{
    field: BriefingCriticalField
    objectKind: 'mission' | 'contact'
    id: string
    label: string
  }>
  /**
   * #2095.45 — missions qui DÉMARRENT dans les {@link MISSION_STARTING_SOON_DAYS}
   * prochains jours (`started_on`). `daysUntilStart` vient de la LECTURE.
   */
  missionsStarting?: Array<{ id: string; label: string; daysUntilStart: number; startsOn: string | null }>
  /**
   * #2095.45 — avenants ENVOYÉS non signés (`mission_documents.kind =
   * 'amendment'`, statut `sent`/`pending`). `days` = âge depuis l'envoi, lu.
   */
  amendmentsPending?: Array<{ missionId: string; label: string; documentName: string; days: number }>
  /**
   * #2095.41 — contacts passés `historique` (n'est plus en poste) dans les
   * {@link CONTACT_LEFT_LOOKBACK_DAYS} derniers jours
   * (`contact_lifecycle_transitions`).
   */
  contactsLeft?: Array<{ id: string; name: string | null; companyName: string | null; leftAt: string | null }>
  /**
   * #2397.7 — le retour utilisateur, par GENRE de carte. `undefined`/`{}` =
   * aucun geste enregistré, byte-identique à avant ce lot (axe `roleFit`
   * nommé, jamais évalué). Ne touche JAMAIS `priority` : une obligation garde
   * son rang quel que soit ce sac.
   */
  roleFit?: BriefingRoleFitPreferences
  /**
   * #2095.19 / #2993 — l'identifiant du LECTEUR de ce brief, reporté tel quel
   * sur `owner` de chaque carte (le brief reste strictement individuel,
   * doctrine `c76_role_reordonne_jamais_ne_filtre`). Optionnel : `null` par
   * défaut, byte-identique aux appelants qui ne le portent pas encore (tests).
   */
  ownerId?: string | null
}

/**
 * Assemble et trie TOUTES les actions candidates du jour — JAMAIS plafonnées.
 *
 * Les libellés ne sont PAS rendus ici : le service renvoie une clé i18n et ses
 * variables, la SPA les traduit. Un libellé français en dur dans l'API serait
 * un écran anglais à moitié traduit le jour où quelqu'un change de langue.
 *
 * #2107 (Centre d'actions, recette écran du 25/09/2026, prod `1371ef9d38`) —
 * SÉPARÉE de {@link buildBriefingActions} : le plafond (`protectFromFollowUpEviction`,
 * `BRIEFING_ACTIONS_MAX`) évince en silence les genres de priorité basse
 * (12-17 : mission sans date, profil sans retour, exigence AO non couverte,
 * compte sans owner…) dès qu'un jour ordinaire remplit déjà les sept places —
 * mesuré : 4 `payment_overdue` + 1 `mission_end` + 2 e-mails suffisent. Un
 * déclencheur qu'on ne voit JAMAIS n'existe pas pour l'utilisateur. Le brief
 * du matin (`BriefingService.build`) continue d'appeler {@link buildBriefingActions}
 * (plafonné, inchangé) ; le Centre d'actions (`GET /briefing/actions`,
 * `BriefingService.allActions`) appelle CETTE fonction pour montrer l'ENSEMBLE.
 */
export function buildAllBriefingActions(input: BriefingActionInput): BriefingAction[] {
  const actions: BriefingAction[] = []
  // L'instant de LECTURE des sources qui n'en portent pas d'autre (l'agenda).
  const readAt = input.now.toISOString()
  // #2397.7 — défaut `{}` : aucun geste enregistré, byte-identique à avant.
  const roleFit: BriefingRoleFitPreferences = input.roleFit ?? {}

  // #2106.1 — CE CONSTAT RESTE VRAI pour quatre familles sur cinq, et c'est un
  // CONSTAT PAR CARTE, pas un oubli global : le conflit, la réponse positive,
  // le silence et le signal de compte n'ont, dans ce module, AUCUNE donnée
  // réelle à compiler en brouillon ou en liste courte — produire un
  // `draft_message` supposerait un texte rédigé que rien ici ne génère (pas
  // d'appel IA dans ce périmètre), et une `shortlist` de comptes ou de
  // consultants supposerait un appariement que ce module ne calcule pas.
  // Les inventer serait exactement la donnée fictive que la doctrine interdit
  // (« ne jamais remplir le champ avec un artefact plausible mais non créé »,
  // #2106). Un tableau vide veut dire « rien de prêt », et l'écran ne montre
  // alors pas le bloc — ce n'est pas un échec à annoncer.
  const NOTHING_PREPARED: BriefingAction['preparedArtifacts'] = []

  // 0. ⚠️ #1391 / #1393.2 — LES TÂCHES NE SONT PLUS DES CARTES D'ACTION.
  //
  //    Les tâches en retard entraient ici, avec `href: null` : aucun geste
  //    n'était possible sur la carte. Et la MÊME tâche s'affichait juste à
  //    côté, dans le seau « En retard » de « Tes tâches », où elle se coche.
  //    Deux fois la même ligne, dont une inerte.
  //
  //    Le commentaire d'origine n'excluait que les tâches dues AUJOURD'HUI
  //    (« elles ont leur bloc juste en dessous ») ; les retards sont dans ce
  //    même bloc et passaient quand même. Les deux colonnes RESTENT côte à
  //    côte — décision de Louis du 01/09/2026, elles répondent à deux
  //    questions distinctes ; c'est le doublon qui part, pas la colonne.

  // 1. Un conflit d'agenda : deux personnes attendent au même moment.
  for (const conflict of input.conflicts) {
    // #3671.1 — le fait est identifié par CES DEUX rendez-vous : sa date
    // d'observation doit en dépendre, jamais de l'instant de lecture
    // (`readAt` change à chaque appel et empêchait toute correction de
    // tenir au rechargement suivant, `isStillHeld` côté contrats ne
    // reconnaissant jamais le même fait). Si l'un des deux bouge, c'est
    // un fait différent à raison — la carte a le droit de revenir.
    const conflictObservedAt = earliestStart(conflict.first, conflict.second)
    actions.push({
      id: `conflict:${conflict.first.id}:${conflict.second.id}`,
      labelKey: 'briefing.actions.conflict',
      labelVars: {
        first: conflict.first.summary ?? '',
        second: conflict.second.summary ?? '',
        minutes: conflict.overlapMinutes,
      },
      // Aucun écran d'agenda n'existe : le seul endroit qui montre les
      // rendez-vous est ce brief, juste en dessous. Y renvoyer serait un clic
      // sans effet, et `/agenda` était un 404. Le conflit se lit, il ne s'ouvre
      // pas — le jour où un écran d'agenda existe, il prend la place de ce null.
      href: null,
      kind: 'conflict',
      priority: 1,
      // Le libellé énonce le fait. Sa source est l'agenda connecté.
      fact: fact('connector', 'agenda', conflictObservedAt),
      context: context('briefing.context.conflict'),
      // #2106.1 — un conflit n'a rien à préparer : les deux rendez-vous et
      // leur chevauchement sont déjà le fait ÉNONCÉ par cette carte ; répéter
      // la même information dans un artefact ne compilerait rien de neuf.
      preparedArtifacts: NOTHING_PREPARED,
      // Le fait cesse d'être ARBITRABLE quand le premier des deux commence :
      // après, on ne déplace plus rien. Les deux dates sont lues, jamais
      // devinées — si aucune n'est lisible, la carte n'expire pas.
      expiresAt: conflictObservedAt,
      // Deux créneaux, aucun dossier : un conflit ne s'ouvre sur rien.
      businessObject: null,
      // L'agenda connecté fait foi sur ses propres créneaux.
      confidence: 'verified',
      // Un chevauchement est urgent, arbitrable maintenant, et il porte un
      // ENGAGEMENT pris envers deux personnes. Sa conséquence commerciale, son
      // adéquation au rôle et son effort ne sont pas mesurés ici : ils sortent
      // nommés, pas à zéro.
      rankingAxes: axesFor('conflict', ['urgency', 'actionableNow', 'commitment', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 2. Les rendez-vous externes du jour : préparer avant, pas après.
  for (const meeting of input.meetings) {
    // #2319.21 — T-1 h : le brief se propose MAINTENANT. La carte passe en tête
    // et dit le vrai critère, lu au même endroit que l'écran (GA-26).
    const imminent = isMeetingImminent(meeting.start, input.now)
    actions.push({
      id: `meeting:${meeting.id}`,
      labelKey: 'briefing.actions.meetingPrep',
      labelVars: { subject: meeting.summary ?? '', start: meeting.start ?? '' },
      // Idem : préparer un rendez-vous n'a pas d'écran dédié. Le rendez-vous
      // lui-même est listé dans le bloc « Ton agenda », avec son lien de visio.
      href: null,
      kind: 'meeting_prep',
      priority: imminent ? 1 : 2,
      // ⚠️ LA SEULE famille dont le libellé n'est PAS un fait : « Prépare la
      // soutenance » est un ordre. Le fait — « rendez-vous client à venir » —
      // n'était écrit nulle part, et c'est lui qui se date et se source.
      fact: fact(
        'connector',
        'agenda',
        readAt,
        subjectOfEvent(meeting) ? 'briefing.facts.meeting' : 'briefing.facts.meetingNoSubject',
        { subject: subjectOfEvent(meeting) },
      ),
      // Le critère RÉEL de sélection, lu au même endroit que la sélection.
      context: imminent
        ? context('briefing.context.meetingImminent', { minutes: MEETING_PREP_IMMINENT_MINUTES })
        : context('briefing.context.meetingWithin', { hours: MEETING_PREP_HORIZON_HOURS }),
      // #2106.2 — la SEULE famille qui a une donnée réelle à compiler : la
      // liste des participants EXTERNES que l'agenda connecté rend déjà.
      // Voir `meetingAttendeesArtifact` : vide dès qu'aucun n'est connu,
      // jamais un brief ou des questions inventés.
      preparedArtifacts: meetingAttendeesArtifact(meeting, readAt),
      // Préparer un rendez-vous cesse d'avoir un sens quand il commence.
      expiresAt: isoOrNull(meeting.start),
      // Le COMPTE du rendez-vous n'est pas résolu ici : c'est
      // `MeetingPrepDialog` qui le déduit des invités, et le refaire donnerait
      // deux vérités sur la même ligne. La carte ne mentionne donc aucun objet.
      businessObject: null,
      confidence: 'verified',
      // Un rendez-vous a une heure (urgence réelle), il est préparable
      // maintenant, et il engage quelqu'un d'autre.
      rankingAxes: axesFor('meeting_prep', ['urgency', 'actionableNow', 'commitment', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 3. Une réponse positive qui traîne coûte plus cher qu'une relance ratée.
  //    L'identité mirroir de `labelVars` ci-dessous : ce libellé n'affiche que
  //    l'interlocuteur et le sujet, donc deux fils qui les partagent rendent la
  //    même phrase et ne prennent qu'une place (recette du 27/08).
  for (const thread of selectThreadsToShow(
    input.positiveReplies,
    thread => `${counterpartOf(thread)}|${subjectOf(thread).toLowerCase()}`,
  )) {
    actions.push({
      id: `positive:${thread.threadId}`,
      // Le SUJET distingue deux fils du même interlocuteur. Il voyageait déjà
      // dans `labelVars` sans qu'aucun libellé ne l'affiche : quatre réponses
      // de la même personne rendaient donc quatre lignes identiques. Un fil sans
      // sujet lisible garde le libellé court — « ... sur «  » » se lirait comme
      // un trou dans l'écran.
      labelKey: subjectOf(thread) ? 'briefing.actions.positiveReply' : 'briefing.actions.positiveReplyNoSubject',
      labelVars: { counterpart: thread.counterpart ?? '', subject: subjectOf(thread) },
      // L'intention voyage avec le fil : la messagerie ne cherche pas par
      // identifiant, elle cherche par intention. Sans elle, le clic ouvrirait
      // la liste par défaut et le fil visé n'y serait pas forcément.
      href: `${MAILBOX_ROUTE}?intent=positive_reply&thread=${encodeURIComponent(thread.threadId)}`,
      kind: 'reply',
      priority: 3,
      // Le fait porte SA date : celle du message, pas celle de la lecture. Un
      // fil sans date lisible rend `null` — il ne devient pas « aujourd'hui ».
      fact: fact('connector', 'mailbox', isoOrNull(thread.lastMessageAt)),
      context: context('briefing.context.positiveReply'),
      // #2106.1 — l'issue demande une « proposition de réponse »
      // (`draft_message`), mais rien dans ce module ne rédige de texte : le
      // produire ici serait l'artefact plausible-mais-non-créé que la
      // doctrine interdit, et `nothing-is-sent.spec.ts` interdit de toute
      // façon un `href` sur ce genre. Reste NOTHING_PREPARED tant qu'aucune
      // capacité de rédaction réelle n'existe dans ce périmètre.
      preparedArtifacts: NOTHING_PREPARED,
      // Une réponse reçue ne cesse pas d'avoir été reçue.
      expiresAt: null,
      // Le fil porte le NOM d'un interlocuteur, pas son identifiant de contact :
      // le rapprocher ici serait un appariement que ce module ne fait pas.
      businessObject: null,
      confidence: 'verified',
      // Une réponse favorable porte la conséquence commerciale la plus nette du
      // lot, et c'est le seul axe que les autres familles n'ont pas.
      rankingAxes: axesFor(
        'reply',
        ['consequence', 'urgency', 'actionableNow', 'commitment', 'dataConfidence'],
        roleFit,
      ),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 4. Les silences, du plus ancien au plus récent.
  //    L'identité porte AUSSI les jours de silence, parce que le libellé les
  //    affiche : deux fils de la même personne sur le même sujet mais silencieux
  //    depuis 40 et 8 jours se lisent différemment, et restent deux lignes.
  const staleFirst = selectThreadsToShow(
    [...input.awaitingReply].sort((a, b) => (b.daysSinceLastMessage ?? 0) - (a.daysSinceLastMessage ?? 0)),
    thread => `${counterpartOf(thread)}|${subjectOf(thread).toLowerCase()}|${thread.daysSinceLastMessage ?? 0}`,
  )
  for (const thread of staleFirst) {
    actions.push({
      id: `follow-up:${thread.threadId}`,
      // #5003.1 — un compte rapproché d'une ESN est ÉTIQUETÉ « ESN » ; il n'est PAS retiré (un partenaire reste
      // une vraie relance, et le rapprochement peut se tromper).
      labelKey: thread.account?.isEsn
        ? subjectOf(thread)
          ? 'briefing.actions.followUpEsn'
          : 'briefing.actions.followUpEsnNoSubject'
        : subjectOf(thread)
          ? 'briefing.actions.followUp'
          : 'briefing.actions.followUpNoSubject',
      labelVars: {
        counterpart: thread.counterpart ?? '',
        days: thread.daysSinceLastMessage ?? 0,
        subject: subjectOf(thread),
      },
      href: `${MAILBOX_ROUTE}?intent=no_reply&thread=${encodeURIComponent(thread.threadId)}`,
      kind: 'follow_up',
      priority: 4,
      fact: fact('connector', 'mailbox', isoOrNull(thread.lastMessageAt)),
      // Le critère : le silence a dépassé le seuil. ⚠️ Quand le fil n'a pas de
      // date lisible, la carte dit le silence SANS le chiffrer — un `?? 0`
      // écrirait « sans réponse depuis 0 jour », c'est-à-dire l'inverse.
      context:
        thread.daysSinceLastMessage === null
          ? context('briefing.context.silenceUndated')
          : // `count` et non `days` : c'est le nom que la pluralisation
            // d'i18next lit, et lui seul. Avec `days`, « 1 jours » s'affiche.
            context('briefing.context.silence', { count: thread.daysSinceLastMessage }),
      // #2106.1 — même raison que la réponse positive : une relance
      // rédigée supposerait un texte que ce module ne génère pas.
      preparedArtifacts: NOTHING_PREPARED,
      // Un silence de neuf jours ne cesse pas d'être vrai : il s'allonge.
      expiresAt: null,
      businessObject: null,
      confidence: 'verified',
      // Un silence s'allonge (urgence), se relance maintenant, et c'est NOUS
      // qui avons pris l'engagement de revenir.
      rankingAxes: axesFor('follow_up', ['urgency', 'actionableNow', 'commitment', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 5. Les comptes qui ont bougé : utile, mais jamais au-dessus d'un engagement pris.
  for (const account of input.accountsWithFreshSignal) {
    const detectedAt = isoOrNull(account.detectedAt)
    actions.push({
      id: `account:${account.accountId}`,
      labelKey: 'briefing.actions.freshSignal',
      labelVars: { company: account.companyName },
      href: `/accounts/${account.accountId}`,
      kind: 'account',
      priority: 5,
      // Le signal vient de l'historique matérialisé par nos services
      // déterministes — donc `pipeline`, la source qu'ils portent partout
      // ailleurs. Sa date est celle de la DÉTECTION, pas de la lecture ;
      // illisible, elle reste `null`.
      //
      // #2107.28 — « Ne plus afficher seulement le nom du compte » : quand la
      // matérialisation a écrit un libellé (« Levée de fonds Série B »), il
      // devient le FAIT de la carte — son HEADLINE, comme pour un rendez-vous
      // (`briefing.facts.meeting`). Sans lui, la carte garde son ancien
      // comportement : le nom du compte reste le titre.
      fact: account.signalLabel
        ? fact('pipeline', 'signals', detectedAt, 'briefing.facts.freshSignal', { signal: account.signalLabel })
        : fact('pipeline', 'signals', detectedAt),
      // Trois contextes et non un, parce que trois situations RÉELLEMENT
      // différentes se ressemblaient : une détection datée, une détection dont
      // on sait seulement que le signal était DÉJÀ là (backfill), et une date
      // illisible. Les fondre écrirait « repéré le … » sur les trois.
      context: !detectedAt
        ? context('briefing.context.freshSignalUndated')
        : account.detectionExact
          ? context('briefing.context.freshSignal', { hours: FRESH_SIGNAL_HOURS })
          : context('briefing.context.freshSignalTracked'),
      // #2106.1 — l'issue demande une « shortlist de comptes »/« de
      // consultants », mais cette fonction ne reçoit ni contact ni
      // appariement pour ce compte : `accountsWithFreshSignal` ne porte que
      // l'identité du compte et sa date de détection. Compiler une shortlist
      // supposerait un calcul d'appariement que ce module ne fait pas
      // (catalogue déclaratif seulement, `workflow-outcomes.ts` →
      // `reverse_prospecting` / `push_profile`, hors périmètre de ce lot).
      // #2095.60 — l'ANGLE, lui, existe déjà quand une analyse l'a calculé
      // (`attack_angles`) : la carte le propose, sans en rédiger aucun.
      preparedArtifacts: account.angle ? angleArtifact(account.accountId, account.angle, readAt) : NOTHING_PREPARED,
      // Le fait « ce compte a bougé RÉCEMMENT » cesse d'être vrai à la fin de
      // la fenêtre de fraîcheur — c'est le moment exact où la carte quitte la
      // liste. Sans date de détection, rien ne le date : `null`.
      expiresAt: detectedAt ? new Date(Date.parse(detectedAt) + FRESH_SIGNAL_HOURS * 3600_000).toISOString() : null,
      // LA SEULE famille qui mentionne un objet ouvrable : le compte existe,
      // il a son dossier, et `href` y mène déjà. Le nom peut être vide — la
      // mention dit alors « non mesuré », elle n'en invente pas un.
      // #2097.21 — le logo suit le compte : `null` quand la lecture n'en a
      // pas trouvé, jamais une valeur devinée pour remplir la carte.
      businessObject: {
        kind: 'account',
        id: account.accountId,
        name: account.companyName,
        logoUrl: account.logoUrl ?? null,
        website: account.website ?? null,
      },
      // `inferred` et non `verified` : le signal est DÉDUIT par nos services
      // déterministes (`pipeline`), il n'a pas été rapporté par le compte. La
      // carte le dit, et c'est ce qui justifie qu'elle descende derrière un
      // engagement pris (#2095.72).
      confidence: 'inferred',
      rankingAxes: axesFor('account', ['urgency', 'actionableNow', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 6. #2107.3 — les besoins sans shortlist, du plus ancien au plus récent.
  //    Doublon de #2106.7 : ce producteur ferme les deux numéros à la fois.
  const staleNeedsFirst = [...input.staleNeeds].sort((a, b) => b.days - a.days)
  for (const need of staleNeedsFirst) {
    // #3389.13 — une veille dont la reprise est échue ne dit pas « sans
    // shortlist » (elle n'est pas ouverte) : elle dit que la date posée est là.
    const resumeOn = need.resumeOn ?? null
    actions.push({
      id: `need:${need.id}`,
      labelKey: resumeOn ? 'briefing.actions.needResumeDue' : 'briefing.actions.needStale',
      labelVars: resumeOn ? { title: need.title } : { title: need.title, days: need.days },
      href: `/projects/needs/${need.id}`,
      kind: 'need_stale',
      // #3389 (recette prod 02/10) — une reprise ÉCHUE est une date que
      // l'utilisateur a posée lui-même : un engagement, au rang d'une réponse
      // à donner (3), pas d'un besoin qui s'allonge (6). À 6 la carte restait
      // sous les trois cartes visibles de « Aujourd'hui », donc seulement
      // dans /actions. Sans date, le rang ne change pas.
      priority: resumeOn ? 3 : 6,
      // La lecture vient de nos propres tables (`project_needs`/`shortlists`),
      // à l'instant du brief — jamais du jour où le besoin a été ouvert.
      fact: fact('pipeline', 'needs', readAt),
      context: resumeOn
        ? context('briefing.context.needResumeDue', { date: resumeOn })
        : context('briefing.context.needStale', { days: need.days }),
      // #2106.7 — l'issue demande une « shortlist de consultants », mais ce
      // module ne calcule aucun appariement : la produire serait l'artefact
      // plausible-mais-non-créé que la doctrine interdit (même raison que
      // `accountsWithFreshSignal` juste au-dessus).
      preparedArtifacts: NOTHING_PREPARED,
      // Un besoin sans shortlist ne cesse pas d'être vrai tout seul : il
      // s'allonge, comme un silence, jusqu'à ce qu'une shortlist apparaisse.
      expiresAt: null,
      // Un besoin n'est ni un compte, ni un contact, ni une mission, ni un
      // profil — `briefingBusinessObjectSchema.kind` ne le couvre pas : même
      // raison que le conflit d'agenda juste au-dessus, aucun dossier ouvrable.
      businessObject: null,
      // Lu directement dans nos propres tables (`project_needs`/`shortlists`),
      // à l'instant du brief — même source que les autres lectures internes.
      confidence: 'verified',
      // Plus un besoin s'allonge, plus il est urgent ; il reste actionnable
      // maintenant (ouvrir une shortlist), et la lecture qui le produit fait foi.
      rankingAxes: axesFor('need_stale', ['urgency', 'actionableNow', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 7a. #2095.2 — les missions qui approchent de leur fin, l'échéance la plus
  //     proche d'abord : une mission à J-3 mérite d'être vue avant une à J-28.
  //     #2106.8/#2107.7 (juste après) réutilisent la même capacité et la même
  //     carte pour une lecture plus précise (fenêtre de renouvellement réglée
  //     par l'espace) : une mission déjà couverte par CETTE lecture-là n'entre
  //     pas ici — voir le test « ne double pas une mission déjà annoncée ».
  const missionsEndingSoonIds = new Set((input.missionsEndingSoon ?? []).map(mission => mission.id))
  const missionsEndingSoonFirst = [...(input.missionsEnding ?? [])]
    .filter(mission => !missionsEndingSoonIds.has(mission.id))
    .sort((a, b) => a.daysUntilEnd - b.daysUntilEnd)
  for (const mission of missionsEndingSoonFirst) {
    actions.push({
      id: `mission-end:${mission.id}`,
      labelKey: 'briefing.actions.missionEnding',
      labelVars: { label: mission.label, days: mission.daysUntilEnd },
      // Le dossier existe déjà (`/missions/:id`, D200) : c'est la mission
      // elle-même qui s'ouvre, pas une liste.
      href: `/missions/${mission.id}`,
      kind: 'mission_end',
      // #2095.70 — à J-30 ou moins, une mission qui finit passe AVANT un compte
      // potentiel (rang 5, confiance `verified` contre `inferred`) : une perte
      // datée l'emporte sur une opportunité déduite.
      priority: missionEndPriority(mission.daysUntilEnd),
      // Lu directement dans `missions.ends_on`, à l'instant du brief — même
      // source que les autres lectures internes (`needs`).
      fact: fact('pipeline', 'missions', readAt),
      context: context('briefing.context.missionEnding', { days: mission.daysUntilEnd }),
      // #2106.1 — même raison que les besoins sans shortlist juste au-dessus :
      // proposer un plan de transition ou un consultant de remplacement
      // supposerait un appariement que ce module ne calcule pas.
      preparedArtifacts: NOTHING_PREPARED,
      // Une échéance de mission ne s'annule pas toute seule : elle reste vraie
      // jusqu'à ce que la mission change de statut ou de date de fin, ce que
      // seule une prochaine lecture de `missions` peut dire.
      expiresAt: null,
      // La SEULE famille de ce lot qui ouvre un dossier nommé : la mission
      // existe, elle a son dossier, `href` y mène déjà.
      // #2097.21 — pas d'avatar pour cette famille : une mission n'a ni logo ni photo.
      businessObject: { kind: 'mission', id: mission.id, name: mission.label, logoUrl: null, website: null },
      // Lu directement dans nos propres tables (`missions`), à l'instant du
      // brief — même source que `need_stale`.
      confidence: 'verified',
      // Une échéance de mission est une perte immédiate par construction
      // (urgency-tier.ts) et actionnable maintenant (préparer la suite) ; la
      // lecture qui la produit fait foi.
      rankingAxes: axesFor('mission_end', ['urgency', 'actionableNow', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 7b. #2106.8 / #2107.7 — les missions qui entrent dans une fenêtre de
  //     renouvellement, la plus proche de son terme d'abord. Trois seuils
  //     DISTINCTS (J-45, J-30, J-15) : le contexte nomme lequel est atteint.
  const missionsEndingFirst = [...(input.missionsEndingSoon ?? [])].sort((a, b) => a.days - b.days)
  for (const mission of missionsEndingFirst) {
    actions.push({
      id: `mission-end:${mission.id}`,
      labelKey: 'briefing.actions.missionEnding',
      // `label` redouble `title` : `actions.missionEnding` (i18n) est LE MÊME
      // libellé que la lecture #2095.2 juste au-dessus, qui interpole `label` —
      // un seul texte utilisateur pour la même carte, quelle que soit la
      // lecture qui l'a produite (voir `briefing.json`).
      labelVars: { title: mission.title, label: mission.title, days: mission.days },
      href: `/missions/${mission.id}`,
      kind: 'mission_end',
      // #2095.70 — même règle que la lecture #2095.2 juste au-dessus.
      priority: missionEndPriority(mission.days),
      // Lu directement dans nos propres tables (`missions`), à l'instant du
      // brief — même source que les besoins sans shortlist juste au-dessus.
      fact: fact('pipeline', 'missions', readAt),
      // Le SEUIL (la borne RÉGLÉE par l'espace pour cette fenêtre), jamais le
      // compte exact de jours : c'est lui qui distingue les trois fenêtres, le
      // libellé porte déjà le compte réel.
      context: context('briefing.context.missionEndingWithin', { days: mission.thresholdDays }),
      // #2106.8 — l'issue demande une « checklist de renouvellement », mais ce
      // module ne calcule aucune étape réelle (bon de commande, décision,
      // affaire de renouvellement…) : l'inventer serait l'artefact
      // plausible-mais-non-créé que la doctrine interdit, même raison que
      // `need_stale` juste au-dessus.
      preparedArtifacts: NOTHING_PREPARED,
      // Le renouvellement cesse d'avoir un sens une fois la mission terminée.
      expiresAt: isoOrNull(mission.endsOn ?? null),
      // #2097.21 — idem : aucun avatar pour une mission.
      businessObject: { kind: 'mission', id: mission.id, name: mission.title, logoUrl: null, website: null },
      confidence: 'verified',
      // Plus l'échéance approche, plus c'est urgent ; ouvrir la mission est
      // actionnable maintenant, et la lecture qui le produit fait foi.
      rankingAxes: axesFor('mission_end', ['urgency', 'actionableNow', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 8. #2095.7 — les paiements en retard, le plus ancien d'abord : un retard
  //    de 40 jours mérite d'être vu avant un retard de 3 jours.
  const overdueInvoicesOldestFirst = [...(input.overdueInvoices ?? [])].sort((a, b) => b.daysOverdue - a.daysOverdue)
  for (const invoice of overdueInvoicesOldestFirst) {
    actions.push({
      id: `payment:${invoice.id}`,
      // #3671.6 — la carte dit QUELLE facture (le plus ancien impayé de la mission) quand le mois est connu :
      // une même mission peut porter aussi une intervention sur une autre facture, d'un autre retard.
      ...(invoice.periodMonth
        ? {
            labelKey: 'briefing.actions.paymentOverdueMonth' as const,
            labelVars: { label: invoice.label, days: invoice.daysOverdue, month: invoice.periodMonth },
          }
        : {
            labelKey: 'briefing.actions.paymentOverdue' as const,
            labelVars: { label: invoice.label, days: invoice.daysOverdue },
          }),
      // Même dossier que `mission_end` : la facturation d'une mission se lit
      // depuis son dossier, il n'existe pas d'écran par facture.
      href: `/missions/${invoice.id}`,
      kind: 'payment_overdue',
      priority: 8,
      // #3671.1 — l'ÉCHÉANCE de la facture (`invoiceDueOn`), jamais l'instant
      // de lecture : stable d'un brief à l'autre tant que la facture reste
      // impayée, sinon « Donnée fausse » ne tenait jamais au rechargement.
      fact: fact('pipeline', 'invoices', invoiceDueOn(input.now, invoice.daysOverdue)),
      context: context('briefing.context.paymentOverdue', { days: invoice.daysOverdue }),
      // #2106.1 — même raison que les autres lectures internes : préparer une
      // relance rédigée supposerait un texte que ce module ne génère pas, et
      // la doctrine « Fait ne porte jamais de preuve d'envoi » interdit de
      // toute façon de préparer un envoi ici.
      preparedArtifacts: NOTHING_PREPARED,
      // Un retard de paiement ne s'annule pas tout seul : il reste vrai
      // jusqu'à ce que le client règle, ce que seule une prochaine lecture
      // peut dire.
      expiresAt: null,
      // #2097.21 — idem : aucun avatar pour une mission.
      businessObject: { kind: 'mission', id: invoice.id, name: invoice.label, logoUrl: null, website: null },
      confidence: 'verified',
      // Un impayé est une perte immédiate par construction (urgency-tier.ts)
      // et actionnable maintenant (relancer) ; la lecture qui le produit fait
      // foi.
      rankingAxes: axesFor('payment_overdue', ['urgency', 'actionableNow', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 9. #2095.8 — les appels d'offres proches de leur échéance, la plus proche
  //    d'abord : un AO à J-1 mérite d'être vu avant un AO à J-3.
  const rfpsDueSoonFirst = [...(input.rfpsDueSoon ?? [])].sort((a, b) => a.daysUntilDue - b.daysUntilDue)
  for (const rfp of rfpsDueSoonFirst) {
    actions.push({
      id: `rfp:${rfp.id}`,
      labelKey: 'briefing.actions.rfpDue',
      labelVars: { title: rfp.title, days: rfp.daysUntilDue },
      // Aucun dossier PAR appel d'offres n'existe (voir `RFP_ROUTE`) : la
      // carte ouvre la liste, où le dossier se retrouve.
      href: RFP_ROUTE,
      kind: 'rfp_due',
      priority: 9,
      // Lu directement dans `rfps.due_at`, à l'instant du brief.
      fact: fact('pipeline', 'rfps', readAt),
      context: context('briefing.context.rfpDue', { days: rfp.daysUntilDue }),
      // #2106.1 — même raison que les autres lectures internes : rédiger une
      // réponse ou une matrice de conformité supposerait un contenu que ce
      // module ne génère pas.
      preparedArtifacts: NOTHING_PREPARED,
      // Une échéance d'AO ne s'annule pas toute seule.
      expiresAt: null,
      // Aucun genre `rfp` au contrat (`briefingBusinessObjectSchema.kind` :
      // account/contact/mission/talent) — même raison que `need_stale` et le
      // conflit d'agenda juste au-dessus : aucun dossier ouvrable à nommer.
      businessObject: null,
      confidence: 'verified',
      // Une échéance d'AO manquée est une perte immédiate par construction
      // (urgency-tier.ts) et actionnable maintenant (répondre) ; la lecture
      // qui la produit fait foi.
      rankingAxes: axesFor('rfp_due', ['urgency', 'actionableNow', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 10. #2106.6 — les consultants qui se libèrent bientôt : le plus proche de
  //     sa libération d'abord. Le FAIT sous-jacent (une affectation entre dans
  //     sa fenêtre de fin) est le même que `mission_end`, lu côté CONSULTANT
  //     plutôt que côté mission — même table (`mission_assignments`), même
  //     capacité `missions`.
  const consultantsFreeingSoonFirst = [...(input.consultantsFreeingSoon ?? [])].sort((a, b) => a.days - b.days)
  for (const consultant of consultantsFreeingSoonFirst) {
    actions.push({
      id: `consultant-available:${consultant.id}`,
      labelKey: 'briefing.actions.consultantAvailable',
      labelVars: { name: consultant.name, days: consultant.days },
      // Le dossier existe déjà (`/consultants/:id`) : c'est le profil du
      // consultant qui s'ouvre, jamais une shortlist de comptes fabriquée.
      href: `/consultants/${consultant.id}`,
      kind: 'consultant_available',
      priority: 10,
      // Lu directement dans `mission_assignments`/`consultants`, à l'instant
      // du brief — même source que `mission_end`.
      fact: fact('pipeline', 'missions', readAt),
      context: context('briefing.context.consultantAvailable', { days: consultant.days }),
      // #2106.6 — même doctrine que #2106.7/#2106.8 : une shortlist de comptes
      // supposerait un appariement (compétence × besoin) que ce module ne
      // calcule pas. L'inventer serait l'artefact plausible-mais-non-créé que
      // la doctrine interdit.
      preparedArtifacts: NOTHING_PREPARED,
      // La disponibilité cesse d'être une ANNONCE une fois la dernière
      // affectation terminée : la personne est alors déjà libre, ce n'est
      // plus « bientôt ».
      expiresAt: isoOrNull(consultant.endsOn),
      // #2097.21 — aucune photo lue ici : la carte affiche les INITIALES du
      // consultant (`ContactAvatar`, web), jamais une photo inventée. Revu le
      // 25/09 (recette écran) : l'ancienne lecture « pas d'avatar » confondait
      // « pas de photo » et « pas d'avatar » — une carte sans avatar du tout
      // est justement le défaut que la recette a signalé.
      businessObject: { kind: 'talent', id: consultant.id, name: consultant.name, logoUrl: null, website: null },
      confidence: 'verified',
      // Une disponibilité prochaine est une OPPORTUNITÉ de staffing, pas une
      // perte : elle reste actionnable maintenant (proposer la personne) ;
      // la lecture qui la produit fait foi. Aucune conséquence commerciale ni
      // engagement mesurés ici — nommés, pas à zéro.
      rankingAxes: axesFor('consultant_available', ['actionableNow', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 11. #2107.6 — les disponibilités jamais reconfirmées depuis plus de
  //     {@link AVAILABILITY_RECONFIRM_AFTER_DAYS} jours : la plus ancienne
  //     saisie d'abord. Même doctrine que `consultant_available` juste
  //     au-dessus : la fiche s'ouvre, aucune shortlist n'est fabriquée — la
  //     personne reconfirme elle-même sur son dossier.
  const availabilityToReconfirmFirst = [...(input.availabilityToReconfirm ?? [])].sort((a, b) => b.days - a.days)
  for (const consultant of availabilityToReconfirmFirst) {
    actions.push({
      id: `availability-reconfirm:${consultant.id}`,
      labelKey: 'briefing.actions.availabilityReconfirm',
      labelVars: { name: consultant.name, days: consultant.days },
      // Même dossier que `consultant_available` : c'est là, et seulement là,
      // que la personne peut reconfirmer sa propre disponibilité.
      href: `/consultants/${consultant.id}`,
      kind: 'availability_reconfirm',
      priority: 11,
      // Lu directement dans `consultants.availability_checked_at`, à
      // l'instant du brief — même famille de lecture que `consultant_available`.
      fact: fact('pipeline', 'missions', readAt),
      context: context('briefing.context.availabilityReconfirm', { days: consultant.days }),
      // Même doctrine que #2106.6 : une shortlist de comptes supposerait un
      // appariement que ce module ne calcule pas. L'inventer serait
      // l'artefact plausible-mais-non-créé que la doctrine interdit.
      preparedArtifacts: NOTHING_PREPARED,
      // Rien n'EXPIRE ici : contrairement à une affectation qui se termine à
      // une date connue, une disponibilité non reconfirmée le reste jusqu'à
      // ce que quelqu'un la reconfirme — aucune date ne la périme toute
      // seule.
      expiresAt: null,
      businessObject: { kind: 'talent', id: consultant.id, name: consultant.name, logoUrl: null, website: null },
      // `verified` : `availability_checked_at` est une colonne saisie, pas
      // une déduction — même statut que `consultant_available`.
      confidence: 'verified',
      // Un rappel de fraîcheur de données, jamais une opportunité commerciale
      // ni une perte : seule la confiance dans la donnée est en jeu.
      rankingAxes: axesFor('availability_reconfirm', ['dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 12. #2107.8 — les missions ACTIVES sans date de fin. `mission_end`
  //     (#2095.2) et la fenêtre de renouvellement (#2106.8/#2107.7) les
  //     EXCLUENT explicitement (`ends_on IS NOT NULL` côté requête) : sans
  //     cette carte séparée, elles restent invisibles du brief pour toujours,
  //     jamais parce que tout va bien — c'est un manque de donnée, pas un
  //     signal calme.
  for (const mission of input.missionsWithoutEndDate ?? []) {
    actions.push({
      id: `mission-no-end-date:${mission.id}`,
      labelKey: 'briefing.actions.missionNoEndDate',
      labelVars: { label: mission.label },
      // Le dossier existe déjà (`/missions/:id`, D200) : c'est la mission
      // elle-même qui s'ouvre, même geste que `mission_end`.
      href: `/missions/${mission.id}`,
      kind: 'mission_no_end_date',
      priority: 12,
      // Lu directement dans `missions.ends_on` (son ABSENCE), à l'instant du
      // brief — même source que `mission_end`.
      fact: fact('pipeline', 'missions', readAt),
      context: context('briefing.context.missionNoEndDate'),
      // Deviner une date de fin serait l'artefact plausible-mais-non-créé que
      // la doctrine interdit — même raison que `need_stale`.
      preparedArtifacts: NOTHING_PREPARED,
      // Rien n'EXPIRE ici : l'absence de date ne se périme pas toute seule,
      // seule une prochaine saisie de `ends_on` la fait disparaître.
      expiresAt: null,
      businessObject: { kind: 'mission', id: mission.id, name: mission.label, logoUrl: null, website: null },
      // Lu directement dans nos propres tables (`missions`) — même statut que
      // `mission_end`.
      confidence: 'verified',
      // Un rappel de complétude de donnée, jamais une opportunité ni une
      // perte commerciale : seule la confiance dans la donnée est en jeu.
      rankingAxes: axesFor('mission_no_end_date', ['dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 13. #2107.15 — les connecteurs CONNECTÉS mais DÉGRADÉS (droit d'écriture
  //     retiré). Les routines qui en dépendent se désactivent en silence ;
  //     rien n'alertait sur la panne elle-même avant ce lot.
  const CONNECTOR_BROKEN_LABEL_KEYS = {
    mailbox: 'briefing.actions.connectorBrokenMailbox',
    agenda: 'briefing.actions.connectorBrokenAgenda',
    // #2107.15 — le CRM, lu sur `crm_connections.refresh_failed_at`.
    crm: 'briefing.actions.connectorBrokenCrm',
  } as const
  for (const connector of input.brokenConnectors ?? []) {
    actions.push({
      id: `connector-broken:${connector.tool}`,
      labelKey: CONNECTOR_BROKEN_LABEL_KEYS[connector.tool],
      labelVars: {},
      // Un seul écran de reconnexion pour tous les outils (D200) : jamais de
      // dossier par connecteur.
      href: '/integrations',
      kind: 'connector_broken',
      priority: 13,
      // Lu directement sur le connecteur concerné, à l'instant du brief —
      // notre propre lecture déterministe de son état, jamais une donnée
      // synchronisée DEPUIS lui (d'où `pipeline`, pas `connector`).
      // Le CRM n'a pas de capacité de fait à lui : sa panne se lit sur nos
      // propres comptes (`accounts`), que le CRM alimente.
      fact: fact('pipeline', connector.tool === 'crm' ? 'accounts' : connector.tool, readAt),
      // #2107.15 — DEUX pannes distinctes : un droit retiré (lecture seule) et
      // un jeton qui ne se rafraîchit plus (déconnecté, il faut reconnecter).
      context: context(
        connector.state === 'disconnected'
          ? 'briefing.context.connectorDisconnected'
          : 'briefing.context.connectorBroken',
      ),
      // Reconnecter est un geste sur l'écran d'intégrations, jamais une
      // préparation que ce module fabriquerait.
      preparedArtifacts: NOTHING_PREPARED,
      // Rien n'EXPIRE ici : la dégradation reste vraie jusqu'à la prochaine
      // lecture qui la trouve réparée.
      expiresAt: null,
      // Aucun dossier PAR connecteur n'existe — même raison que `rfp_due`.
      businessObject: null,
      // Lu directement sur le connecteur — pas une déduction.
      confidence: 'verified',
      // Un manque de capacité, jamais une opportunité ni une perte
      // commerciale : seule la confiance dans la donnée est en jeu.
      rankingAxes: axesFor('connector_broken', ['dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 14. #2107.10 — les missions au renouvellement NON ENGAGÉ, dans leur
  //     fenêtre. Même échéance que `mission_end`/#2107.7, mais un fait
  //     distinct : rien n'a commencé. ⚠️ Si la MÊME mission apparaît aussi
  //     via `missionsEndingSoon` (#2107.7), `mergeActionsCallingTheSameDestination`
  //     ne garde qu'UNE carte pour ce dossier — celle triée en tête, par
  //     `priority` puis confiance puis poids d'axes. C'est le comportement
  //     VOULU de ce mécanisme (une destination, une carte), pas un défaut de
  //     cette famille.
  for (const mission of input.renewalsNotEngaged ?? []) {
    actions.push({
      id: `renewal-not-engaged:${mission.id}`,
      labelKey: 'briefing.actions.renewalNotEngaged',
      labelVars: { title: mission.title, days: mission.days },
      href: `/missions/${mission.id}`,
      kind: 'renewal_not_engaged',
      priority: 14,
      // Lu directement dans `missions.ends_on`/`renewal_status`, à l'instant
      // du brief — même source que `mission_end`.
      fact: fact('pipeline', 'missions', readAt),
      context: context('briefing.context.renewalNotEngaged'),
      // Engager la conversation est un geste humain ; rien ici ne rédige de
      // proposition de renouvellement — même doctrine que `need_stale`.
      preparedArtifacts: NOTHING_PREPARED,
      // La question du renouvellement cesse d'avoir un sens une fois la
      // mission terminée, mais ce module ne calcule pas cette date ici —
      // même choix que `mission_end` (#2095.2) pour la variante sans seuil.
      expiresAt: null,
      businessObject: { kind: 'mission', id: mission.id, name: mission.title, logoUrl: null, website: null },
      confidence: 'verified',
      // Une échéance de renouvellement SANS conversation engagée est une
      // perte imminente par construction, et actionnable maintenant (ouvrir
      // la conversation) ; la lecture qui la produit fait foi.
      rankingAxes: axesFor('renewal_not_engaged', ['urgency', 'actionableNow', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 15. #2107.4 — les profils ENVOYÉS sans aucun retour depuis plus de
  //     {@link SUBMISSION_NO_RESPONSE_AFTER_DAYS} jours. Même doctrine que
  //     `availability_reconfirm` : la fiche du consultant s'ouvre, aucun
  //     dossier par soumission n'existe.
  for (const submission of input.submissionsWithoutResponse ?? []) {
    actions.push({
      id: `submission-no-response:${submission.consultantId}`,
      labelKey: 'briefing.actions.submissionNoResponse',
      labelVars: { name: submission.consultantName, days: submission.days },
      // Même dossier que `consultant_available`/`availability_reconfirm` :
      // aucun dossier PAR soumission n'existe, la fiche du consultant l'ouvre.
      href: `/consultants/${submission.consultantId}`,
      kind: 'submission_no_response',
      priority: 15,
      // Lu directement dans `submissions.first_feedback_at`, à l'instant du
      // brief — même famille de lecture que `mission_end`.
      fact: fact('pipeline', 'missions', readAt),
      context: context('briefing.context.submissionNoResponse', { days: submission.days }),
      // Relancer le client est un geste humain ; rien ici ne rédige de
      // relance — même doctrine que `need_stale`.
      preparedArtifacts: NOTHING_PREPARED,
      // Rien n'EXPIRE ici : l'absence de retour reste vraie jusqu'à ce
      // qu'un retour soit enregistré, ce que seule une prochaine lecture
      // peut dire.
      expiresAt: null,
      businessObject: {
        kind: 'talent',
        id: submission.consultantId,
        name: submission.consultantName,
        logoUrl: null,
        website: null,
      },
      // Lu directement dans nos propres tables (`submissions`) — pas une
      // déduction.
      confidence: 'verified',
      // Un silence côté client est une perte potentielle, actionnable
      // maintenant (relancer) ; la lecture qui la produit fait foi.
      rankingAxes: axesFor('submission_no_response', ['urgency', 'actionableNow', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 16. #2107.14 — les appels d'offres portant au moins une exigence
  //     OBLIGATOIRE non couverte (`computeRfpCompliance`, fonction pure déjà
  //     utilisée côté écran). Même dossier que `rfp_due` : aucune fiche PAR
  //     appel d'offres n'existe, la carte ouvre la liste.
  for (const rfp of input.rfpsWithUncoveredRequirements ?? []) {
    actions.push({
      id: `rfp-requirement-gap:${rfp.id}`,
      labelKey: 'briefing.actions.rfpRequirementGap',
      labelVars: { title: rfp.title, count: rfp.count },
      // Aucun dossier PAR appel d'offres n'existe (voir `RFP_ROUTE`) — même
      // raison que `rfp_due`.
      href: RFP_ROUTE,
      kind: 'rfp_requirement_gap',
      priority: 16,
      // Lu directement dans `rfps.requirements`, à l'instant du brief.
      fact: fact('pipeline', 'rfps', readAt),
      context: context('briefing.context.rfpRequirementGap', { count: rfp.count }),
      // Produire une réponse est un geste humain ; rien ici ne rédige de
      // contenu — même doctrine que `rfp_due`/`need_stale`.
      preparedArtifacts: NOTHING_PREPARED,
      // Rien n'EXPIRE ici : l'exigence reste non couverte jusqu'à ce qu'une
      // réponse soit validée, ce que seule une prochaine lecture peut dire.
      expiresAt: null,
      // Aucun genre `rfp` au contrat — même raison que `rfp_due` juste
      // au-dessus : aucun dossier ouvrable à nommer.
      businessObject: null,
      // Lu directement dans nos propres tables (`rfps`) — pas une déduction.
      confidence: 'verified',
      // Une exigence obligatoire non couverte est une perte potentielle à
      // l'export, actionnable maintenant (la produire) ; la lecture qui la
      // produit fait foi.
      rankingAxes: axesFor('rfp_requirement_gap', ['urgency', 'actionableNow', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 17. #2107.18 — les comptes ACTIFS sans propriétaire assigné : une zone
  //     blanche au niveau individuel, ouvrable directement.
  for (const account of input.accountsWithoutOwner ?? []) {
    actions.push({
      id: `account-no-owner:${account.id}`,
      labelKey: 'briefing.actions.accountNoOwner',
      labelVars: { company: account.companyName },
      href: `/accounts/${account.id}`,
      kind: 'account_no_owner',
      priority: 17,
      // Lu directement dans `accounts.assigned_to`, à l'instant du brief.
      fact: fact('pipeline', 'accounts', readAt),
      context: context('briefing.context.accountNoOwner'),
      // Assigner un propriétaire est un geste humain ; rien ici ne
      // choisit à sa place.
      preparedArtifacts: NOTHING_PREPARED,
      // Rien n'EXPIRE ici : l'absence reste vraie jusqu'à ce qu'une
      // affectation soit enregistrée.
      expiresAt: null,
      // LA SEULE autre famille qui mentionne un objet ouvrable est `account`
      // (signal frais) : le compte existe déjà, son dossier existe déjà.
      // Le logo n'est pas lu par `buildAccountsWithoutOwner` (query id/company_name
      // seulement) — jamais inventé ici.
      businessObject: { kind: 'account', id: account.id, name: account.companyName, logoUrl: null, website: null },
      // Lu directement sur `accounts.assigned_to` — une colonne humaine,
      // jamais une déduction.
      confidence: 'verified',
      // Une zone blanche de couverture est une DONNÉE manquante, pas une
      // échéance commerciale ; actionnable maintenant (assigner).
      rankingAxes: axesFor('account_no_owner', ['actionableNow', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 18. #2106.9/#2107.1 (doublon, épopée #2801) — les affaires EN JEU sans
  //     AUCUNE tâche encore ouverte qui leur soit rattachée : le dossier
  //     `/projects/$id` s'ouvre déjà (fondation #2801), c'est la carte qui
  //     manquait.
  for (const project of input.projectsWithoutNextAction ?? []) {
    actions.push({
      id: `project-no-next-action:${project.id}`,
      labelKey: 'briefing.actions.projectNoNextAction',
      labelVars: { label: project.label, company: project.companyName },
      href: `/projects/${project.id}`,
      kind: 'project_no_next_action',
      priority: 18,
      // Lu directement via `pipelineHealth` (`@bellum/contracts`), sur les
      // MÊMES colonnes que la carte du pipe (`tasks.project_id`,
      // `opportunities.stage`) — jamais recalculé ici.
      fact: fact('pipeline', 'projects', readAt),
      context: context('briefing.context.projectNoNextAction'),
      // Deviner LA prochaine action serait l'artefact plausible-mais-non-créé
      // que la doctrine interdit — même raison que `need_stale`/`account_no_owner`.
      preparedArtifacts: NOTHING_PREPARED,
      // Rien n'EXPIRE ici : l'absence reste vraie jusqu'à ce qu'une tâche
      // ouverte soit créée sur l'affaire.
      expiresAt: null,
      businessObject: { kind: 'project', id: project.id, name: project.label, logoUrl: null, website: null },
      // `has_next_action` est une EXISTENCE de ligne (`tasks`), jamais une
      // déduction — même statut que `account_no_owner`.
      confidence: 'verified',
      // Une affaire sans prochaine action est une DONNÉE manquante, pas une
      // échéance commerciale ; actionnable maintenant (programmer une tâche).
      rankingAxes: axesFor('project_no_next_action', ['actionableNow', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 19. #2107.2 (épopée #2801) — les affaires EN JEU dont la fraîcheur a
  //     dépassé le seuil de l'ontologie : la MÊME lecture que la carte du
  //     pipe et le dossier `/projects/$id` (`pipelineHealth`, raisons
  //     `ageing`/`stale`), jamais recalculée ici. Du plus vieux mouvement au
  //     plus récent, même tri que `need_stale`.
  const staleProjectsFirst = [...(input.staleProjects ?? [])].sort((a, b) => b.days - a.days)
  for (const project of staleProjectsFirst) {
    actions.push({
      id: `project-stale:${project.id}`,
      labelKey: 'briefing.actions.projectStale',
      labelVars: { label: project.label, company: project.companyName, days: project.days },
      href: `/projects/${project.id}`,
      kind: 'project_stale',
      priority: 19,
      // Lue via `pipelineHealth` (`@bellum/contracts`), sur la MÊME colonne
      // (`opportunities.stage_entered_at`) que la carte du pipe.
      fact: fact('pipeline', 'projects', readAt),
      context: context('briefing.context.projectStale', { days: project.days }),
      // Deviner LE geste de relance serait l'artefact plausible-mais-non-créé
      // que la doctrine interdit — même raison que `need_stale`/`project_no_next_action`.
      preparedArtifacts: NOTHING_PREPARED,
      // Une affaire vieillissante ne cesse pas d'être vraie toute seule :
      // elle s'allonge, comme un silence, jusqu'à un mouvement d'étape.
      expiresAt: null,
      businessObject: { kind: 'project', id: project.id, name: project.label, logoUrl: null, website: null },
      // `stage_entered_at` est une colonne réelle, jamais une déduction.
      confidence: 'verified',
      // Plus une affaire s'allonge, plus elle est urgente ; elle reste
      // actionnable maintenant (relancer, qualifier), et la lecture qui la
      // produit fait foi — mêmes trois axes que `need_stale`.
      rankingAxes: axesFor('project_stale', ['urgency', 'actionableNow', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 18. #2107.9 — le CRA du mois précédent MANQUE sur une mission ACTIVE de
  //     l'appelant. Le cas le plus coûteux nommé par la doctrine de
  //     `invoice-readiness.ts` : il ne se signale nulle part ailleurs, et le
  //     mois passe.
  for (const mission of input.craMissing ?? []) {
    actions.push({
      id: `cra-missing:${mission.id}`,
      labelKey: 'briefing.actions.craMissing',
      labelVars: { label: mission.label },
      href: `/missions/${mission.id}`,
      kind: 'cra_missing',
      priority: 18,
      // Lu directement dans `mission_timesheets` (son ABSENCE), via
      // `buildTimesheetLine` (`../delivery/timesheet-view`) — à l'instant du
      // brief.
      fact: fact('pipeline', 'invoices', readAt),
      context: context('briefing.context.craMissing'),
      // Déposer un relevé est un geste humain ; rien ici ne le fait à sa place.
      preparedArtifacts: NOTHING_PREPARED,
      // Rien n'EXPIRE ici : le manque reste vrai jusqu'au dépôt du relevé.
      expiresAt: null,
      businessObject: { kind: 'mission', id: mission.id, name: mission.label, logoUrl: null, website: null },
      confidence: 'verified',
      // Une perte de revenu EN COURS (le mois est déjà clos), et actionnable
      // maintenant (déposer le relevé).
      rankingAxes: axesFor('cra_missing', ['urgency', 'actionableNow', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 19. #2107.11 — le mois précédent est PRÊT à facturer : AUCUN bloqueur
  //     restant (`assessInvoiceReadiness`, `@bellum/contracts`).
  for (const mission of input.invoicesReady ?? []) {
    actions.push({
      id: `invoice-ready:${mission.id}`,
      labelKey: 'briefing.actions.invoiceReady',
      labelVars: { label: mission.label },
      href: `/missions/${mission.id}`,
      kind: 'invoice_ready',
      priority: 19,
      fact: fact('pipeline', 'invoices', readAt),
      context: context('briefing.context.invoiceReady'),
      // Préparer la facture reste un geste humain (doctrine : Bellum ne
      // facture JAMAIS lui-même).
      preparedArtifacts: NOTHING_PREPARED,
      // Rien n'EXPIRE ici : la carte reste vraie jusqu'à ce que la facture
      // soit préparée ou qu'un nouveau bloqueur apparaisse.
      expiresAt: null,
      businessObject: { kind: 'mission', id: mission.id, name: mission.label, logoUrl: null, website: null },
      confidence: 'verified',
      // Une action À POTENTIEL (le revenu prêt à être préparé), actionnable
      // maintenant.
      rankingAxes: axesFor('invoice_ready', ['actionableNow'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 20. #2107.16 — la porte « prêt à facturer » BLOQUE pour une DONNÉE
  //     MANQUANTE sur l'objet (jamais un statut de relevé, déjà porté par
  //     `cra_missing`) : la carte NOMME la donnée et ouvre l'objet.
  const INVOICING_BLOCKED_LABEL_KEYS = {
    missing_rate: 'briefing.actions.invoicingBlockedMissingRate',
    missing_po: 'briefing.actions.invoicingBlockedMissingPo',
    missing_billing_contact: 'briefing.actions.invoicingBlockedMissingBillingContact',
    missing_start_date: 'briefing.actions.invoicingBlockedMissingStartDate',
    missing_cost: 'briefing.actions.invoicingBlockedMissingCost',
  } as const
  const INVOICING_BLOCKED_CONTEXT_KEYS = {
    missing_rate: 'briefing.context.invoicingBlockedMissingRate',
    missing_po: 'briefing.context.invoicingBlockedMissingPo',
    missing_billing_contact: 'briefing.context.invoicingBlockedMissingBillingContact',
    missing_start_date: 'briefing.context.invoicingBlockedMissingStartDate',
    missing_cost: 'briefing.context.invoicingBlockedMissingCost',
  } as const
  for (const mission of input.invoicingBlockedMissingData ?? []) {
    actions.push({
      id: `invoicing-blocked:${mission.id}`,
      labelKey: INVOICING_BLOCKED_LABEL_KEYS[mission.blocker],
      labelVars: { label: mission.label },
      href: `/missions/${mission.id}`,
      kind: 'invoicing_blocked_missing_data',
      priority: 20,
      fact: fact('pipeline', 'invoices', readAt),
      context: context(INVOICING_BLOCKED_CONTEXT_KEYS[mission.blocker]),
      // Renseigner la donnée manquante est un geste humain ; rien ici ne
      // choisit une valeur à sa place.
      preparedArtifacts: NOTHING_PREPARED,
      // Rien n'EXPIRE ici : le manque reste vrai jusqu'à ce que la donnée soit
      // saisie.
      expiresAt: null,
      businessObject: { kind: 'mission', id: mission.id, name: mission.label, logoUrl: null, website: null },
      confidence: 'verified',
      // Un manque de DONNÉE structurelle, actionnable maintenant (le saisir).
      rankingAxes: axesFor('invoicing_blocked_missing_data', ['actionableNow', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 21. #2095.41 (épopée #2993) — un contact CONNU dont le dernier e-mail a
  //     REBONDI (`contacts.email_bounced_at`, posé par le seul webhook
  //     fournisseur, #2733) : la première famille CONTACTS du brief, sa fiche
  //     s'ouvre directement (`/contacts/:id`, #2158).
  for (const contact of input.contactsBounced ?? []) {
    actions.push({
      id: `contact-bounced:${contact.id}`,
      labelKey: 'briefing.actions.contactBounced',
      labelVars: { name: contact.name ?? '' },
      href: `/contacts/${contact.id}`,
      kind: 'contact_bounced',
      priority: 21,
      // Lu directement dans `contacts.email_bounced_at`, à l'instant du
      // brief — même colonne que `ContactsService.getDeliverability`.
      fact: fact('pipeline', 'contacts', readAt),
      context: context('briefing.context.contactBounced'),
      // Corriger la coordonnée est un geste humain ; rien ici ne devine une
      // nouvelle adresse à sa place.
      preparedArtifacts: NOTHING_PREPARED,
      // Rien n'EXPIRE ici : le rebond reste vrai jusqu'à ce qu'une coordonnée
      // corrigée soit enregistrée.
      expiresAt: null,
      businessObject: { kind: 'contact', id: contact.id, name: contact.name, logoUrl: null, website: null },
      // Lu directement sur `email_bounced_at`, posé par un webhook fournisseur
      // — jamais une déduction.
      confidence: 'verified',
      // Une coordonnée en échec est une DONNÉE manquante à corriger,
      // actionnable maintenant.
      rankingAxes: axesFor('contact_bounced', ['actionableNow', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 22. #2095.12 (épopée #2993) — un rendez-vous externe TERMINÉ, dans la
  //     fenêtre de rattrapage, sans AUCUNE note écrite : `input.meetingsWithoutFollowup`
  //     est déjà filtré par `BriefingService` (`selectEndedMeetingsAwaitingFollowup`
  //     + `notes.existsForSourceEvent`) — cette boucle ne fait que composer la
  //     carte, jamais une seconde lecture.
  for (const meeting of input.meetingsWithoutFollowup ?? []) {
    const subject = subjectOfEvent(meeting)
    actions.push({
      id: `meeting-no-followup:${meeting.id}`,
      labelKey: 'briefing.actions.meetingNoFollowup',
      labelVars: { subject: subject ?? '' },
      // Même absence d'écran dédié que `meeting_prep` : le rendez-vous ouvre
      // le MÊME dialogue (`MeetingPrepDialog`, mode « en rendez-vous »),
      // retrouvé côté écran par préfixe d'identifiant — jamais un href qui
      // pointerait vers une page inexistante.
      href: null,
      kind: 'meeting_no_followup',
      priority: 22,
      fact: fact(
        'connector',
        'agenda',
        readAt,
        subject ? 'briefing.facts.meetingEnded' : 'briefing.facts.meetingEndedNoSubject',
        { subject: subject ?? '' },
      ),
      context: context('briefing.context.meetingNoFollowup', { hours: MEETING_FOLLOWUP_LOOKBACK_HOURS }),
      // #2106.2 — même artefact que `meeting_prep`, MÊME fonction : c'est lui
      // qui porte le clic ouvrant `MeetingPrepDialog` (`href: null` côté
      // contrat). Vide dès qu'aucun invité externe n'est connu, jamais un clic
      // qui ouvrirait un dialogue sur rien.
      preparedArtifacts: meetingAttendeesArtifact(meeting, readAt),
      // Rien n'EXPIRE ici : le manque reste vrai jusqu'à ce qu'une note soit
      // écrite — même règle que `contact_bounced` juste au-dessus. La fenêtre
      // de rattrapage est un critère de SÉLECTION (`input.meetingsWithoutFollowup`),
      // jamais une date à laquelle le fait cesserait d'être vrai.
      expiresAt: null,
      // Le COMPTE du rendez-vous n'est pas résolu ici, même raison que
      // `meeting_prep` : `MeetingPrepDialog` le déduit des invités.
      businessObject: null,
      confidence: 'verified',
      // Un rendez-vous tenu SANS SUITE écrite est une donnée manquante,
      // actionnable maintenant, qui engage la relation avec un tiers.
      rankingAxes: axesFor('meeting_no_followup', ['actionableNow', 'commitment', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 23. #2095.6 — la porte « prêt à facturer » bloque pour un AUTRE bloqueur
  //     que la donnée manquante (#2107.16) ou le CRA absent (#2107.9).
  for (const mission of input.invoicesBlocked ?? []) {
    // #2095.71 — un relevé entre les mains du client ne se lève pas
    // aujourd'hui de notre côté : la carte descend, l'axe le dit.
    const awaiting = AWAITING_THIRD_PARTY_BLOCKERS.has(mission.blocker)
    actions.push({
      id: `invoice-blocked:${mission.id}`,
      labelKey: INVOICE_BLOCKED_LABEL_KEYS[mission.blocker],
      labelVars: { label: mission.label },
      href: `/missions/${mission.id}`,
      kind: 'invoice_blocked',
      priority: awaiting ? NOT_ACTIONABLE_NOW_PRIORITY : 20,
      fact: fact('pipeline', 'invoices', readAt),
      context: context(
        awaiting ? 'briefing.context.invoiceBlockedAwaitingThirdParty' : 'briefing.context.invoiceBlocked',
      ),
      preparedArtifacts: NOTHING_PREPARED,
      // Le blocage reste vrai jusqu'à la prochaine lecture qui le trouve levé.
      expiresAt: null,
      businessObject: { kind: 'mission', id: mission.id, name: mission.label, logoUrl: null, website: null },
      confidence: 'verified',
      rankingAxes: axesFor(
        'invoice_blocked',
        awaiting ? ['consequence', 'dataConfidence'] : ['consequence', 'actionableNow', 'dataConfidence'],
        roleFit,
      ),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 24. #2095.10 / #2107.16 / #2095.49 — une donnée CRITIQUE manque : la carte
  //     nomme le champ (`BRIEFING_CRITICAL_FIELDS`) et ouvre l'objet.
  for (const missing of input.criticalDataMissing ?? []) {
    actions.push({
      id: `critical-data:${missing.field}:${missing.id}`,
      labelKey: CRITICAL_DATA_LABEL_KEYS[missing.field],
      labelVars: { label: missing.label },
      href: missing.objectKind === 'mission' ? `/missions/${missing.id}` : `/contacts/${missing.id}`,
      kind: 'critical_data_missing',
      priority: 20,
      fact: fact('pipeline', missing.objectKind === 'mission' ? 'missions' : 'contacts', readAt),
      context: context(CRITICAL_DATA_CONTEXT_KEYS[missing.field]),
      // Saisir la donnée est un geste humain ; rien ici ne la devine.
      preparedArtifacts: NOTHING_PREPARED,
      expiresAt: null,
      businessObject: { kind: missing.objectKind, id: missing.id, name: missing.label, logoUrl: null, website: null },
      confidence: 'verified',
      rankingAxes: axesFor('critical_data_missing', ['actionableNow', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 25. #2095.45 — une mission DÉMARRE : préparer l'arrivée, la plus proche d'abord.
  for (const mission of [...(input.missionsStarting ?? [])].sort((a, b) => a.daysUntilStart - b.daysUntilStart)) {
    actions.push({
      id: `mission-starting:${mission.id}`,
      labelKey: 'briefing.actions.missionStarting',
      labelVars: { label: mission.label, days: mission.daysUntilStart },
      href: `/missions/${mission.id}`,
      kind: 'mission_starting',
      priority: 9,
      fact: fact('pipeline', 'missions', readAt),
      context: context('briefing.context.missionStarting', { days: MISSION_STARTING_SOON_DAYS }),
      preparedArtifacts: NOTHING_PREPARED,
      // Préparer un démarrage cesse d'avoir un sens le jour où il a lieu.
      expiresAt: isoOrNull(mission.startsOn),
      businessObject: { kind: 'mission', id: mission.id, name: mission.label, logoUrl: null, website: null },
      confidence: 'verified',
      rankingAxes: axesFor('mission_starting', ['urgency', 'actionableNow', 'commitment', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 26. #2095.45 — un avenant ENVOYÉ attend sa signature, le plus ancien d'abord.
  for (const amendment of [...(input.amendmentsPending ?? [])].sort((a, b) => b.days - a.days)) {
    actions.push({
      id: `mission-amendment:${amendment.missionId}:${amendment.documentName}`,
      labelKey: 'briefing.actions.missionAmendmentPending',
      labelVars: { label: amendment.label, document: amendment.documentName, days: amendment.days },
      href: `/missions/${amendment.missionId}`,
      kind: 'mission_amendment_pending',
      priority: 13,
      fact: fact('pipeline', 'missions', readAt),
      context: context('briefing.context.missionAmendmentPending', { count: amendment.days }),
      preparedArtifacts: NOTHING_PREPARED,
      expiresAt: null,
      businessObject: {
        kind: 'mission',
        id: amendment.missionId,
        name: amendment.label,
        logoUrl: null,
        website: null,
      },
      confidence: 'verified',
      rankingAxes: axesFor('mission_amendment_pending', ['actionableNow', 'commitment', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // 27. #2095.41 — un contact n'est plus en poste : la relation est à reprendre.
  for (const contact of input.contactsLeft ?? []) {
    actions.push({
      id: `contact-left:${contact.id}`,
      labelKey: 'briefing.actions.contactLeft',
      labelVars: { name: contact.name ?? '', company: contact.companyName ?? '' },
      href: `/contacts/${contact.id}`,
      kind: 'contact_left',
      priority: 21,
      // Le fait porte SA date : celle de la transition, jamais la lecture.
      fact: fact('pipeline', 'contacts', isoOrNull(contact.leftAt)),
      context: context('briefing.context.contactLeft', { days: CONTACT_LEFT_LOOKBACK_DAYS }),
      preparedArtifacts: NOTHING_PREPARED,
      expiresAt: null,
      businessObject: { kind: 'contact', id: contact.id, name: contact.name, logoUrl: null, website: null },
      confidence: 'verified',
      rankingAxes: axesFor('contact_left', ['actionableNow', 'dataConfidence'], roleFit),
      processingState: 'suggested',
      ...notSaidYet(input.ownerId ?? null),
    })
  }

  // Dédoublonnage par destination : ici s'arrête la dérivation COMMUNE aux
  // deux appelants (brief plafonné, Centre d'actions non plafonné) — la coupe
  // finale à `BRIEFING_ACTIONS_MAX` vit dans le seul {@link buildBriefingActions}.
  // #2095.59 / #2095.85 / #2095.34 — verdict, conséquence et permission posés
  // une fois, pour toutes les familles (`sayWhatIsKnown`).
  return mergeActionsCallingTheSameDestination(actions.map(sayWhatIsKnown).sort(compareBriefingActions))
}

/**
 * Le brief du matin — les mêmes actions que {@link buildAllBriefingActions},
 * PLAFONNÉES à `BRIEFING_ACTIONS_MAX` (`protectFromFollowUpEviction`).
 *
 * Toujours l'appelant du brief (`BriefingService.build`/`buildDemo`) : le
 * comportement de « Aujourd'hui » ne change pas d'une virgule avec cette
 * extraction, y compris ses tests — seule la dérivation commune a déménagé
 * dans {@link buildAllBriefingActions}, jamais recopiée.
 */
export function buildBriefingActions(input: BriefingActionInput): BriefingAction[] {
  return protectFromFollowUpEviction(buildAllBriefingActions(input))
}

/**
 * #2095.77 — FUSIONNER LES CANDIDATS QUI APPELLENT LA MÊME ACTION.
 *
 * Le dédoublonnage déjà en place (recette du 27/08, plus haut dans ce
 * fichier) ne couvre que le contenu d'UNE source — deux fils qui partagent
 * interlocuteur et sujet. Il ne voit rien quand deux lignes d'entrée
 * DIFFÉRENTES (par ex. deux signaux détectés pour le même compte) produisent
 * deux cartes qui ouvriraient malgré tout le MÊME écran : deux `href`
 * identiques, deux clics pour un seul geste possible.
 *
 * Appelé APRÈS le tri : entre deux candidats qui mènent au même endroit, le
 * mieux classé (rang le plus bas, `compareBriefingActions`) est celui qui
 * reste — jamais un choix arbitraire d'ordre d'arrivée dans les données.
 *
 * ⚠️ `href: null` ne fusionne JAMAIS : un conflit d'agenda et une préparation
 * de rendez-vous n'ouvrent aucun écran — les regrouper sur cette absence
 * commune effacerait toutes les cartes sans destination en une seule.
 *
 * ⚠️ DÉFAUT D'INTÉGRATION (24/09, fusion de fix/w36-briefing-23-09 avec la
 * famille `rfp_due` de v29-lot-b) : `businessObject: null` ne fusionne pas
 * non plus. `rfp_due` (#2095.8) n'a AUCUN dossier par appel d'offres — toutes
 * les cartes AO ouvrent la MÊME liste (`RFP_ROUTE`, un href PARTAGÉ, pas
 * l'identifiant d'un objet précis). Fusionner par href seul y effaçait
 * plusieurs AO distincts derrière une seule carte (`briefing-actions.spec.ts`
 * « classe plusieurs AO » passait de 2 cartes à 1). Un `businessObject` nommé
 * (compte, mission…) est ce qui distingue « même écran, même objet réel » de
 * « même écran, objets différents » — sans lui, aucune garantie que deux
 * candidats au même href désignent la même chose.
 */
function mergeActionsCallingTheSameDestination(actions: BriefingAction[]): BriefingAction[] {
  const seenDestinations = new Set<string>()
  const merged: BriefingAction[] = []
  for (const action of actions) {
    if (action.href === null || action.businessObject === null) {
      merged.push(action)
      continue
    }
    if (seenDestinations.has(action.href)) continue
    seenDestinations.add(action.href)
    merged.push(action)
  }
  return merged
}

/**
 * #2095.2 / #2095.7 — LA RELANCE NE MANGE PAS LA FIN DE MISSION.
 *
 * MESURÉ en production le 24/09/2026 (recette #2095.2/#2095.7, registre
 * `registre-2026-09-16-briefing.md`) : `slice(0, BRIEFING_ACTIONS_MAX)`
 * coupait la liste triée SANS savoir CE QU'elle coupait. Un jour avec cinq
 * relances (`follow_up`, priorité 4) plus une réponse et un conflit
 * remplissait déjà les sept places classées ; la coupe évinçait alors, SANS
 * EXCEPTION, la mission qui se termine (`mission_end`, priorité 7) et les
 * paiements en retard (`payment_overdue`, priorité 8) — deux candidats bien
 * PRODUITS (voir `briefing.service.ts`), jamais un manque de donnée.
 *
 * Une relance froide n'est pas un fait plus grave qu'une mission qui se
 * termine ou qu'un client qui ne paie pas : elle ne doit jamais gagner sa
 * place SEULEMENT parce qu'il y en a plus ce jour-là. La garde ne touche
 * JAMAIS un conflit, un rendez-vous ou une réponse favorable — ceux-là
 * restent légitimement devant une échéance à J-30 (#2095.70) — elle cède
 * seulement la place des `follow_up` les MOINS prioritaires (déjà en fin de
 * liste triée, donc les plus faciles à reprendre) à la fin de mission ou au
 * paiement évincé, un pour un. Si retirer TOUS les `follow_up` ne suffit pas
 * encore, le protégé cède à son tour sa place : ce n'est alors plus une
 * relance qui l'évince, et le plafond reste un plafond.
 */
const YIELDS_TO_FOLLOW_UP_EVICTION: ReadonlySet<BriefingActionKind> = new Set(['mission_end', 'payment_overdue'])

/**
 * #2993 (lot V35, recette écran du 28/09 soir) — LES INDEX DE REPRISE, DANS
 * L'ORDRE OÙ ILS SE LIBÈRENT, PAS DANS L'ORDRE OÙ ON LES CONSOMME.
 *
 * Constat production : deux paiements en retard (57 j et 34 j) évincés PUIS
 * réintégrés par `protectFromFollowUpEviction` ressortaient dans l'ordre
 * INVERSE (34 j avant 57 j). Cause : la boucle d'origine cherchait, à CHAQUE
 * protégé réintégré, le dernier `follow_up` RESTANT (`findLastIndex`) — un
 * index qui RECULE à chaque réinsertion, puisque la place qu'il vient de
 * prendre n'est plus un `follow_up`. Le protégé le PLUS urgent (premier de
 * `evicted`, déjà trié le plus ancien d'abord) prenait donc l'index le plus
 * TARDIF, et le moins urgent l'index le plus TÔT — l'ordre relatif entre
 * protégés de même genre (même priorité, même poids d'axes) s'inversait, et
 * le tri final, STABLE, ne fait que reproduire cet ordre déjà faux.
 *
 * Cette fonction calcule TOUS les index à céder D'ABORD (les `follow_up` les
 * MOINS prioritaires, donc les DERNIERS de `kept` — même choix qu'avant),
 * puis les rend du PLUS PETIT au PLUS GRAND : le protégé le plus urgent
 * reçoit alors le PREMIER index libéré, dans le même ordre que `evicted` —
 * l'ordre relatif entre protégés est ainsi préservé jusqu'au tri final.
 */
function followUpIndicesToYield(kept: readonly BriefingAction[], count: number): number[] {
  const indices: number[] = []
  for (let index = kept.length - 1; index >= 0 && indices.length < count; index--) {
    if (kept[index].kind === 'follow_up') indices.push(index)
  }
  return indices.reverse()
}

/**
 * #3414 (recette prod 02/10) — « Tes décisions » classe les cartes SERVIES en
 * trois catégories dont « prochain mouvement » (genres à potentiel). Un jour
 * chargé en protection remplissait les sept places et la catégorie restait
 * vide : la tête des décisions ne changeait plus avec la lecture du rôle.
 * Quand AUCUNE carte à potentiel ne survit au plafond, la mieux classée des
 * évincées prend la place de la `follow_up` la moins prioritaire (jamais celle
 * d'un conflit, d'un rendez-vous ou d'une réponse). Sans `follow_up` à céder,
 * rien ne change : le plafond reste un plafond.
 */
const NEXT_MOVE_KINDS: ReadonlySet<BriefingActionKind> = new Set([
  'account',
  'need_stale',
  'consultant_available',
  'submission_no_response',
  'project_stale',
  'invoice_ready',
])

function nextMoveToKeep(kept: readonly BriefingAction[], overflow: readonly BriefingAction[]): BriefingAction | null {
  if (kept.some(action => NEXT_MOVE_KINDS.has(action.kind))) return null
  return overflow.find(action => NEXT_MOVE_KINDS.has(action.kind)) ?? null
}

/**
 * #3414 (recette prod 02/10, Y11) — l'après-midi, la salle sert cinq préparations de rendez-vous
 * et AUCUNE relance : la place d'une carte à potentiel n'avait donc personne à qui la prendre, et
 * « Prochain mouvement » restait vide. Sans `follow_up` à céder, la place vient de la préparation
 * de rendez-vous la MOINS prioritaire, à la seule condition qu'il en reste au moins deux (jamais
 * un conflit ni une réponse ; la préparation évincée reste dans le bloc Agenda).
 */
const MIN_MEETING_PREPS_KEPT = 2

function meetingPrepIndexToYield(kept: readonly BriefingAction[], taken: ReadonlySet<number>): number | null {
  const preps = kept.map((action, index) => (action.kind === 'meeting_prep' ? index : -1)).filter(index => index >= 0)
  if (preps.length <= MIN_MEETING_PREPS_KEPT) return null
  const last = preps[preps.length - 1]
  return taken.has(last) ? null : last
}

function protectFromFollowUpEviction(sorted: BriefingAction[]): BriefingAction[] {
  const kept = sorted.slice(0, BRIEFING_ACTIONS_MAX)
  const evicted = sorted.slice(BRIEFING_ACTIONS_MAX).filter(action => YIELDS_TO_FOLLOW_UP_EVICTION.has(action.kind))
  const nextMove = nextMoveToKeep(kept, sorted.slice(BRIEFING_ACTIONS_MAX))
  if (nextMove) evicted.push(nextMove)
  if (evicted.length === 0) return kept

  const displaceIndices = followUpIndicesToYield(kept, evicted.length)
  // #3414 — la carte à potentiel est la DERNIÈRE de `evicted` : à court de `follow_up`, elle prend la
  // place de la préparation de rendez-vous la moins prioritaire plutôt que de ne rien prendre.
  if (nextMove && displaceIndices.length === evicted.length - 1) {
    const prepIndex = meetingPrepIndexToYield(kept, new Set(displaceIndices))
    if (prepIndex !== null) displaceIndices.push(prepIndex)
  }
  displaceIndices.forEach((displaceIndex, position) => {
    kept[displaceIndex] = evicted[position]
  })
  return kept.sort(compareBriefingActions)
}

// #2397.2 / #2095.81 / #2993 — `rankingWeight`, `confidenceRank` et
// `compareBriefingActions` ont DÉMÉNAGÉ dans `@bellum/contracts`
// (`daily-briefing.ts`) : la web en a besoin pour EXPLIQUER un rang
// (`explainBriefingDomination`, #2095.81) sans dupliquer la formule qui
// décide réellement le tri (GA-26). Réexporté tel quel (importé ci-dessus) :
// ce tri ne change pas d'une virgule.
export { compareBriefingActions }

/** Le SUJET de l'évènement, ou `''` quand il n'y en a pas d'exploitable. */
function subjectOfEvent(event: AgendaEvent): string {
  return (event.summary ?? '').trim()
}

/**
 * #2106.2 — Le SEUL artefact que ce fichier sait honnêtement préparer
 * aujourd'hui : la liste des participants EXTERNES d'un rendez-vous, telle
 * que l'agenda connecté la rend.
 *
 * Ce n'est ni un « brief » rédigé ni des « questions » suggérées — les deux
 * supposeraient un contenu que rien, dans ce module, ne génère (pas d'appel
 * IA dans ce périmètre) ; les inventer serait exactement l'« artefact
 * plausible mais non créé » que l'issue #2106 interdit elle-même.
 *
 * Vide quand aucun participant externe n'est connu : il n'y a alors rien de
 * réel à compiler, pas un échec à signaler.
 *
 * #2106.12 à #2106.19 — les sept champs dédiés de l'artefact, à leur valeur
 * HONNÊTE plutôt qu'inventée : aucun objet métier résolu (le compte du
 * rendez-vous n'est pas déduit ici, voir plus haut), compilé à l'instant de
 * lecture du brief (`preparedAt`, le même `readAt` que les autres cartes),
 * première version, source `connector` (l'agenda connecté), statut `ready`,
 * préparé par Laura, et un coût de zéro crédit puisque cette lecture n'en
 * débite aucun.
 */
function meetingAttendeesArtifact(meeting: AgendaEvent, preparedAt: string): BriefingAction['preparedArtifacts'] {
  const external = meeting.attendees.filter(attendee => attendee.external)
  if (external.length === 0) return []
  const artifact: BriefingArtifact = {
    id: `shortlist:${meeting.id}`,
    kind: 'shortlist',
    labelKey: 'briefing.artifacts.meetingAttendees',
    labelVars: { count: external.length },
    href: null,
    businessObject: null,
    preparedAt,
    version: 1,
    source: 'connector',
    status: 'ready',
    preparedBy: 'laura',
    creditsCost: null,
  }
  return [artifact]
}

/**
 * Le premier des deux créneaux à commencer, ou `null` si aucune date n'est
 * lisible. Passé cet instant, un conflit ne s'arbitre plus.
 */
function earliestStart(first: AgendaEvent, second: AgendaEvent): string | null {
  const starts = [first.start, second.start]
    .map(value => (value ? Date.parse(value) : Number.NaN))
    .filter(value => !Number.isNaN(value))
  if (!starts.length) return null
  return new Date(Math.min(...starts)).toISOString()
}

/**
 * Les rendez-vous qui méritent une préparation : externes, à venir, et dans les
 * `hours` prochaines heures.
 *
 * Un point interne n'en a pas besoin, un rendez-vous passé non plus, et un
 * rendez-vous de la semaine prochaine encombrerait le brief d'aujourd'hui.
 */
export function selectMeetingsToPrepare(
  events: AgendaEvent[],
  now: Date,
  // Le MÊME horizon que celui que la carte annonce à l'écran. Il était écrit
  // ici seulement, donc le contexte de la carte ne pouvait pas dire le vrai
  // nombre : deux dérivations du même réglage divergent (GA-26).
  hours = MEETING_PREP_HORIZON_HOURS,
): AgendaEvent[] {
  const horizon = now.getTime() + hours * 60 * 60 * 1000
  return events.filter(event => {
    if (event.cancelled || !event.isExternal || !event.start) return false
    const start = Date.parse(event.start)
    if (Number.isNaN(start)) return false
    return start >= now.getTime() && start <= horizon
  })
}

/**
 * #2095.12 (épopée #2993) — les rendez-vous externes déjà TERMINÉS, dans la
 * fenêtre de rattrapage : le préalable PUR, avant de savoir lesquels ont déjà
 * une note (`notes.existsForSourceEvent`, une lecture, pas un calcul — donc
 * hors de cette fonction).
 *
 * Un point interne n'entre pas plus ici que dans `selectMeetingsToPrepare`, et
 * un rendez-vous encore À VENIR non plus : c'est la moitié SYMÉTRIQUE de cette
 * fonction, sur la fenêtre PASSÉE plutôt que future.
 */
export function selectEndedMeetingsAwaitingFollowup(
  events: AgendaEvent[],
  now: Date,
  hours = MEETING_FOLLOWUP_LOOKBACK_HOURS,
): AgendaEvent[] {
  const windowStart = now.getTime() - hours * 60 * 60 * 1000
  return events.filter(event => {
    if (event.cancelled || !event.isExternal || !event.end) return false
    const end = Date.parse(event.end)
    if (Number.isNaN(end)) return false
    return end <= now.getTime() && end >= windowStart
  })
}
