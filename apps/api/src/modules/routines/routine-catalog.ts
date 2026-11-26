import type { RoutineDefinition, RoutineKey } from '@bellum/contracts'

/**
 * Le catalogue des routines — dans le CODE, jamais en base.
 *
 * Même raison que le catalogue de workflows (`action-os/workflow-catalog.ts`) :
 * une routine éditable en base serait un chemin d'exécution que personne n'a
 * relu. La base ne porte que l'abonnement — actif ou non, à quelle heure, sur
 * quel canal.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Le critère d'entrée : une routine qui FAIT quelque chose
 * ─────────────────────────────────────────────────────────────────────────
 * Le catalogue a commencé à huit entrées et en compte aujourd'hui soixante,
 * au fil des connecteurs branchés. La règle n'a pas bougé : n'y figure que ce
 * qui tourne RÉELLEMENT avec les capacités connectées. Inscrire un déclencheur
 * dont aucun connecteur ne sait faire le travail produirait une case à cocher
 * qui ne fait rien — la version réglages du « Active sans connecteur » que le
 * produit s'interdit.
 *
 * Le libellé compte autant que le code : une routine qui SIGNALE ne s'annonce
 * pas comme une routine qui INGÈRE (voir `cv_intake`, dont la description a dû
 * être corrigée le 20/08 pour cette raison exacte).
 *
 * Les heures par défaut viennent du rapport (08:30 pour le brief, 09:15 pour les
 * relances, 17:00 pour l'alerte de pipeline vide, vendredi 16:00 pour le récap).
 * Toutes en heure locale de l'utilisateur, pas en UTC : une routine « du matin »
 * qui tombe à 6 h 30 n'est pas une routine du matin.
 */
export const ROUTINE_CATALOG: readonly RoutineDefinition[] = [
  {
    key: 'daily_briefing',
    automationLevel: 'n4_bounded_auto',
    condition: {
      fr: 'Au moins une action est proposable ce matin.',
      en: 'At least one action can be proposed this morning.',
    },
    reads: {
      fr: 'Ton agenda, tes fils sans réponse et tes comptes qui ont bougé.',
      en: 'Your calendar, your unanswered threads and the accounts that moved.',
    },
    fallback: {
      fr: 'Les blocs indisponibles sont omis, et le brief le dit.',
      en: 'Unavailable blocks are omitted, and the brief says so.',
    },
    acceptance: {
      fr: 'Une notification le matin quand il y a au moins une action ; aucune sinon.',
      en: 'A morning notification when there is at least one action; none otherwise.',
    },
    name: { fr: 'Brief du matin', en: 'Morning briefing' },
    description: {
      fr: 'Chaque matin, ce qui mérite ton attention : rendez-vous, relances, réponses favorables, comptes qui ont bougé.',
      en: 'Every morning, what deserves your attention: meetings, follow-ups, positive replies, accounts that moved.',
    },
    outcome: {
      fr: 'Une notification qui ouvre sur « Aujourd’hui ».',
      en: 'A notification that opens on "Today".',
    },
    cadence: 'weekdays',
    defaultHour: 8,
    defaultWeekday: null,
    requires: ['agenda_read', 'mailbox_read'],
    defaultChannel: 'in_app',
    defaultEnabled: true,
    // #2399.3 — v1 tranché sans Louis (texte source LAU-FINAL-113 introuvable
    // pour les vingt automatisations nommées) : un exemple COURT et FACTUEL,
    // dérivé du reste de la fiche (condition/reads/outcome), jamais inventé.
    example: {
      fr: 'Mardi 8 h 30 : deux rendez-vous externes demain, un fil sans réponse depuis neuf jours — la notification ouvre « Aujourd’hui » avec les deux.',
      en: 'Tuesday 8:30 AM: two external meetings tomorrow, one thread unanswered for nine days — the notification opens "Today" with both.',
    },
    stopCondition: {
      fr: 'Le brief ne vaut que pour le jour même : le lendemain il est recalculé sur ce qui mérite alors ton attention, rien ne se reporte tout seul.',
      en: 'The briefing only holds for the day: the next day it is recomputed on what then deserves your attention, nothing carries over by itself.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['general'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'prepare', 'notify'],
    preparedActions: ['notification', 'digest'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'meeting_prep',
    automationLevel: 'n4_bounded_auto',
    condition: {
      fr: 'Un rendez-vous externe a lieu dans les 24 h.',
      en: 'An external meeting takes place within 24 hours.',
    },
    reads: { fr: 'Ton agenda et le dossier du compte concerné.', en: 'Your calendar and the matching account file.' },
    fallback: {
      fr: 'Sans agenda connecté, la routine ne tourne pas et l’écran le dit.',
      en: 'Without a connected calendar it does not run, and the screen says so.',
    },
    acceptance: {
      fr: 'Une notification la veille d’un rendez-vous externe.',
      en: 'A notification the day before an external meeting.',
    },
    name: { fr: 'Préparation des rendez-vous', en: 'Meeting preparation' },
    description: {
      fr: 'La veille au soir, la liste des rendez-vous clients du lendemain à préparer.',
      en: 'The evening before, the list of tomorrow’s client meetings to prepare.',
    },
    outcome: {
      fr: 'Une notification par journée qui contient au moins un rendez-vous externe.',
      en: 'One notification per day that contains at least one external meeting.',
    },
    cadence: 'weekdays',
    defaultHour: 18,
    defaultWeekday: null,
    requires: ['agenda_read'],
    defaultChannel: 'in_app',
    defaultEnabled: true,
    // #2399.3 — v1 tranché sans Louis, même raison que `daily_briefing`.
    example: {
      fr: 'Lundi 18 h : rendez-vous chez Thales mardi 10 h — la notification arrive la veille au soir avec le dossier prêt.',
      en: 'Monday 6 PM: a Thales meeting tomorrow at 10 AM — the notification arrives the evening before, with the file ready.',
    },
    stopCondition: {
      fr: 'Un rendez-vous arrête d’apparaître dès qu’il a eu lieu, ou qu’il n’est plus prévu pour le lendemain (déplacé ou annulé).',
      en: 'A meeting stops appearing as soon as it has taken place, or is no longer scheduled for tomorrow (moved or cancelled).',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'prepare', 'notify'],
    preparedActions: ['notification', 'task'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'no_reply_follow_up',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Un fil parti de chez nous dépasse le seuil de silence.',
      en: 'An outbound thread exceeds the silence threshold.',
    },
    reads: {
      fr: 'Tes fils sortants et la date de leur dernier message.',
      en: 'Your outbound threads and the date of their last message.',
    },
    fallback: {
      fr: 'Un fil sans date exploitable n’est jamais relancé d’office.',
      en: 'A thread without a usable date is never chased automatically.',
    },
    acceptance: {
      fr: 'Une notification listant les fils sans réponse ; aucune si la liste est vide.',
      en: 'A notification listing unanswered threads; none if the list is empty.',
    },
    name: { fr: 'Relances sans réponse', en: 'Silent thread follow-ups' },
    description: {
      fr: 'Les fils partis de ta boîte et restés sans réponse au-delà de sept jours.',
      en: 'Threads that left your mailbox and stayed unanswered for more than seven days.',
    },
    outcome: {
      fr: 'Une notification listant les interlocuteurs à relancer, du plus ancien au plus récent.',
      en: 'A notification listing who to follow up with, oldest silence first.',
    },
    cadence: 'weekdays',
    defaultHour: 9,
    defaultWeekday: null,
    requires: ['mailbox_read'],
    defaultChannel: 'in_app',
    defaultEnabled: true,
    // #2399.3 — v1 tranché sans Louis, même raison que `daily_briefing`.
    example: {
      fr: 'Ton message à Orange du 12/09 est sans réponse depuis neuf jours — la notification le liste le 21/09 au matin.',
      en: 'Your 09/12 message to Orange has been unanswered for nine days — the notification lists it on the morning of 09/21.',
    },
    /**
     * #2398.6/#2398.14 (épopée #2843) — LA CONDITION D'ARRÊT, vérifiée sur
     * `selectAwaitingReply` (`mailbox/no-reply.ts`) : un fil ne sort de la
     * liste QUE quand l'interlocuteur répond (`awaitingReply` retombe à
     * `false`) — un marquage manuel « traité » (`mail_thread_marks`) ne le
     * retire PAS des résultats, il ne change que son affichage dans la
     * messagerie. Fait honnête plutôt que supposé : la doctrine « on
     * n'affiche pas ce qu'on n'a pas » vaut aussi pour ce qu'un mécanisme NE
     * fait PAS.
     */
    stopCondition: {
      fr: 'Un fil arrête d’apparaître dès que l’interlocuteur répond — le marquer « traité » à la main ne le retire pas de la liste, seule une vraie réponse le fait. Sans réponse, elle continue de le lister chaque jour ouvré tant que la routine est active.',
      en: 'A thread stops appearing as soon as the counterpart replies — marking it “treated” by hand does not remove it from the list, only a real reply does. Without a reply, it keeps listing it every weekday while the routine stays active.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'prepare', 'notify', 'await_validation', 'record_proof'],
    preparedActions: ['notification', 'message_draft'],
    validations: ['user_sends'],
    budget: 'model_call',
  },
  {
    key: 'positive_replies',
    automationLevel: 'n1_prepare',
    condition: { fr: 'Une réponse entrante ressemble à un accord.', en: 'An incoming reply looks like an agreement.' },
    reads: {
      fr: 'L’objet et l’expéditeur des réponses récentes, jamais le corps.',
      en: 'The subject and sender of recent replies, never the body.',
    },
    fallback: {
      fr: 'Le classement se fait sur l’objet ; en cas de doute, rien n’est signalé.',
      en: 'Classification uses the subject; when in doubt, nothing is flagged.',
    },
    acceptance: {
      fr: 'Une notification quand au moins une réponse favorable est détectée.',
      en: 'A notification when at least one favourable reply is detected.',
    },
    name: { fr: 'Réponses favorables', en: 'Positive replies' },
    description: {
      fr: 'Les réponses reçues qui ressemblent à un accord et qui attendent une suite.',
      en: 'Incoming replies that look like an agreement and are waiting for a next step.',
    },
    outcome: {
      fr: 'Une notification quand au moins une réponse favorable n’a pas encore de suite.',
      en: 'A notification when at least one positive reply has no follow-up yet.',
    },
    cadence: 'weekdays',
    defaultHour: 11,
    defaultWeekday: null,
    requires: ['mailbox_read'],
    defaultChannel: 'in_app',
    defaultEnabled: true,
    example: null,
    stopCondition: {
      fr: 'Une réponse arrête d’apparaître dès qu’elle a reçu une suite de ta part — tant qu’elle n’en a pas, elle reste listée.',
      en: 'A reply stops appearing as soon as you have followed up on it — until then it stays listed.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'agenda_conflicts',
    automationLevel: 'n1_prepare',
    condition: { fr: 'Deux rendez-vous se chevauchent.', en: 'Two meetings overlap.' },
    reads: { fr: 'Ton agenda sur les jours à venir.', en: 'Your calendar over the coming days.' },
    fallback: {
      fr: 'Sans agenda connecté, rien n’est signalé et l’écran le dit.',
      en: 'Without a connected calendar nothing is flagged, and the screen says so.',
    },
    acceptance: { fr: 'Une notification par chevauchement détecté.', en: 'A notification per detected overlap.' },
    name: { fr: 'Conflits d’agenda', en: 'Calendar conflicts' },
    description: {
      fr: 'Deux rendez-vous qui se chevauchent dans les jours qui viennent.',
      en: 'Two meetings that overlap in the coming days.',
    },
    outcome: {
      fr: 'Une notification, uniquement s’il y a un chevauchement réel.',
      en: 'A notification, only when there is a real overlap.',
    },
    cadence: 'weekdays',
    defaultHour: 8,
    defaultWeekday: null,
    requires: ['agenda_read'],
    defaultChannel: 'in_app',
    defaultEnabled: true,
    example: null,
    stopCondition: {
      fr: 'Un conflit arrête d’apparaître dès que les deux rendez-vous ne se chevauchent plus (l’un déplacé ou annulé) ou que la date est passée.',
      en: 'A conflict stops appearing as soon as the two meetings no longer overlap (one moved or cancelled) or the date has passed.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['general'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'empty_pipeline_alert',
    automationLevel: 'n1_prepare',
    condition: { fr: 'Aucun rendez-vous client dans les trois jours.', en: 'No client meeting within three days.' },
    reads: { fr: 'Ton agenda sur les trois jours qui viennent.', en: 'Your calendar over the next three days.' },
    fallback: { fr: 'Sans agenda connecté, la routine se tait.', en: 'Without a connected calendar it stays silent.' },
    acceptance: {
      fr: 'Une notification en fin d’après-midi quand l’agenda client est vide.',
      en: 'A late-afternoon notification when the client calendar is empty.',
    },
    name: { fr: 'Trois jours sans rendez-vous', en: 'Three days without a meeting' },
    description: {
      fr: 'Une alerte quand aucun rendez-vous client n’est prévu dans les trois jours qui viennent.',
      en: 'An alert when no client meeting is scheduled in the next three days.',
    },
    outcome: {
      fr: 'Une notification qui propose de bloquer des créneaux de prospection.',
      en: 'A notification suggesting you block prospecting slots.',
    },
    cadence: 'weekdays',
    defaultHour: 17,
    defaultWeekday: null,
    requires: ['agenda_read'],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'L’alerte s’arrête dès qu’un rendez-vous client est prévu dans les trois jours qui viennent ; sans rendez-vous, elle revient à la prochaine lecture.',
      en: 'The alert stops as soon as a client meeting is scheduled within the next three days; without one, it comes back on the next read.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'weekly_recap',
    automationLevel: 'n4_bounded_auto',
    condition: {
      fr: 'La semaine se termine et il s’est passé quelque chose.',
      en: 'The week ends and something happened.',
    },
    reads: {
      fr: 'Tes actions de la semaine et l’état de tes comptes.',
      en: 'Your actions of the week and the state of your accounts.',
    },
    fallback: {
      fr: 'Une semaine sans activité ne produit aucun récapitulatif.',
      en: 'A week without activity produces no recap.',
    },
    acceptance: { fr: 'Une notification le vendredi après-midi.', en: 'A Friday afternoon notification.' },
    name: { fr: 'Récapitulatif de la semaine', en: 'Weekly recap' },
    description: {
      fr: 'Vendredi, ce qui s’est passé : rendez-vous tenus, fils traités, comptes qui ont bougé.',
      en: 'On Friday, what happened: meetings held, threads handled, accounts that moved.',
    },
    outcome: {
      fr: 'Une notification récapitulative en fin de semaine.',
      en: 'A recap notification at the end of the week.',
    },
    cadence: 'weekly',
    defaultHour: 16,
    defaultWeekday: 5,
    requires: ['agenda_read'],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Un seul récapitulatif par semaine : il s’arrête une fois préparé le vendredi et repart de zéro la semaine suivante.',
      en: 'One recap per week: it stops once prepared on Friday and starts over the following week.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['general'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'prepare', 'notify'],
    preparedActions: ['notification', 'digest'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'weekly_forecast',
    automationLevel: 'n4_bounded_auto',
    condition: {
      fr: 'La semaine suivante comporte des rendez-vous ou des plages vides.',
      en: 'Next week has meetings or empty slots.',
    },
    reads: { fr: 'Ton agenda de la semaine à venir.', en: 'Your calendar for the week ahead.' },
    fallback: { fr: 'Sans agenda connecté, la routine se tait.', en: 'Without a connected calendar it stays silent.' },
    acceptance: { fr: 'Une notification le vendredi matin.', en: 'A Friday morning notification.' },
    name: { fr: 'Semaine à venir', en: 'Week ahead' },
    description: {
      fr: 'Vendredi matin, le planning de la semaine prochaine et ses plages vides.',
      en: 'Friday morning, next week’s schedule and its empty slots.',
    },
    outcome: {
      fr: 'Une notification listant les rendez-vous prévus et les créneaux libres.',
      en: 'A notification listing scheduled meetings and free slots.',
    },
    cadence: 'weekly',
    defaultHour: 11,
    defaultWeekday: 5,
    requires: ['agenda_read'],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Une seule prévision par semaine : elle s’arrête une fois préparée le vendredi et se recalcule la semaine suivante sur ton agenda réel.',
      en: 'One forecast per week: it stops once prepared on Friday and is recomputed the following week on your actual calendar.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['general', 'manager'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'prepare', 'notify'],
    preparedActions: ['notification', 'digest'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'mission_ending',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Une mission se termine dans les quarante-cinq jours (paliers T-45, T-30, T-15).',
      en: 'An assignment ends within forty-five days (T-45, T-30, T-15 stages).',
    },
    reads: {
      fr: 'Les missions de l’espace et leur date de fin.',
      en: 'The workspace assignments and their end dates.',
    },
    fallback: {
      fr: 'Une mission SANS date de fin n’alerte jamais : on ne devine pas une échéance.',
      en: 'An assignment with NO end date never alerts: a deadline is never guessed.',
    },
    acceptance: {
      fr: 'Une notification quand au moins une mission arrive à échéance.',
      en: 'A notification when at least one assignment is coming to an end.',
    },
    name: { fr: 'Fins de mission : T-45, T-30, T-15', en: 'Missions ending: T-45, T-30, T-15' },
    description: {
      fr: 'Les missions qui se terminent dans les quarante-cinq jours, rangées par palier T-45, T-30, T-15, la plus proche d’abord.',
      en: 'Missions ending within forty-five days, grouped by T-45, T-30, T-15 stage, the closest first.',
    },
    outcome: {
      fr: 'Une notification quand au moins une mission arrive à échéance.',
      en: 'A notification when at least one mission is coming to an end.',
    },
    cadence: 'weekdays',
    defaultHour: 8,
    defaultWeekday: null,
    requires: ['ats'],
    defaultChannel: 'in_app',
    defaultEnabled: true,
    example: null,
    stopCondition: {
      fr: 'Une mission arrête d’apparaître dès qu’elle est prolongée au-delà des quarante-cinq jours ou qu’elle est terminée.',
      en: 'A mission stops appearing as soon as it is extended beyond forty-five days or has ended.',
    },
    // #2398.5 — v3 : la cascade T-45/T-30/T-15 remplace le seuil unique de trente jours.
    version: 3,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['delivery', 'commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'bench_alert',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Un consultant est sans mission depuis plus de trente jours.',
      en: 'A consultant has had no assignment for over thirty days.',
    },
    reads: { fr: 'Les affectations de mission du vivier.', en: 'The pool’s assignment records.' },
    fallback: {
      fr: 'Une disponibilité inconnue n’est jamais comptée comme un intercontrat.',
      en: 'Unknown availability is never counted as bench time.',
    },
    acceptance: {
      fr: 'Une notification hebdomadaire quand au moins un profil dépasse le seuil.',
      en: 'A weekly notification when at least one profile exceeds the threshold.',
    },
    name: { fr: 'Consultants en intercontrat', en: 'Consultants on the bench' },
    description: {
      fr: 'Les consultants sans mission depuis plus de trente jours.',
      en: 'Consultants without a mission for more than thirty days.',
    },
    outcome: {
      fr: 'Une notification hebdomadaire quand au moins un profil est disponible depuis trop longtemps.',
      en: 'A weekly notification when at least one profile has been available for too long.',
    },
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 1,
    requires: ['ats'],
    defaultChannel: 'in_app',
    defaultEnabled: true,
    example: null,
    // #2398.6/#2398.14 — le seuil se recalcule sur les affectations RÉELLES
    // du vivier (`reads` ci-dessus) : dès qu'une nouvelle mission commence
    // pour ce profil, il repasse sous les trente jours et sort de la liste
    // de lui-même — jamais un état à réinitialiser à la main.
    stopCondition: {
      fr: 'Un profil arrête d’apparaître dès qu’une nouvelle mission commence pour lui — rien à réinitialiser à la main. Sans nouvelle mission, il reste listé chaque semaine tant que la routine est active.',
      en: 'A profile stops appearing as soon as a new assignment starts for them — nothing to reset by hand. Without a new assignment, it stays listed every week while the routine is active.',
    },
    version: 1,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['recruiter', 'commercial'],
    workspaceProfiles: ['staffing'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'crm_followups',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Un contact CRM est sans activité depuis trente jours.',
      en: 'A CRM contact has had no activity for thirty days.',
    },
    reads: {
      fr: 'Les contacts de ton CRM et la date de leur dernière activité.',
      en: 'Your CRM contacts and the date of their last activity.',
    },
    fallback: {
      fr: 'Sans CRM connecté, la routine ne tourne pas et l’écran le dit.',
      en: 'Without a connected CRM it does not run, and the screen says so.',
    },
    acceptance: {
      fr: 'Une notification listant les contacts à relancer.',
      en: 'A notification listing the contacts to chase.',
    },
    name: { fr: 'Contacts CRM à relancer', en: 'CRM contacts to follow up' },
    description: {
      fr: 'Les contacts de ton CRM sans la moindre activité depuis trente jours.',
      en: 'Contacts in your CRM without any activity for thirty days.',
    },
    outcome: {
      fr: 'Une notification listant les contacts les plus silencieux.',
      en: 'A notification listing the most silent contacts.',
    },
    cadence: 'weekly',
    defaultHour: 10,
    defaultWeekday: 1,
    requires: ['crm'],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Un contact arrête d’apparaître dès qu’une activité est enregistrée sur sa fiche — sans activité, il reste listé.',
      en: 'A contact stops appearing as soon as an activity is logged on their record — without activity, it stays listed.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  /*
   * Les cinq automatisations CRM du §13 (PDF 2) devenues branchables.
   *
   * Le chantier du PDF 2 les avait écartées, et sa raison tenait : « les y
   * inscrire sans les brancher produirait des cases à cocher qui ne font rien ».
   * Ce qui a changé depuis n'est pas la règle mais le DÉPÔT — la porte G1, les
   * shortlists, les besoins typés et le `stage_entered_at` existent maintenant,
   * donc chacune a une lecture réelle derrière elle.
   *
   * Toutes en N1 : elles PRÉPARENT et notifient. Aucune n'écrit, aucune
   * n'envoie — un projet immobile n'appelle pas un message automatique au
   * client, il appelle une décision du commercial.
   */
  {
    key: 'stalled_projects',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Un projet n’a pas bougé d’étape depuis plus de trois semaines.',
      en: 'A project has not changed stage for more than three weeks.',
    },
    reads: {
      fr: 'Tes projets ouverts et la date d’entrée dans leur étape.',
      en: 'Your open projects and the date they entered their stage.',
    },
    fallback: {
      fr: 'Un projet sans date d’entrée d’étape n’alerte jamais : on ne sait pas depuis quand il est là.',
      en: 'A project with no stage-entry date never alerts: we do not know how long it has been there.',
    },
    acceptance: {
      fr: 'Une notification listant les projets immobiles, avec leur étape et leur âge.',
      en: 'A notification listing stalled projects, with their stage and age.',
    },
    name: { fr: 'Projets immobiles', en: 'Stalled projects' },
    description: {
      fr: 'Les affaires qui restent à la même étape sans que rien n’avance.',
      en: 'Deals sitting at the same stage with nothing moving.',
    },
    outcome: { fr: 'Une notification par lot hebdomadaire.', en: 'One weekly notification.' },
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 1,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Une affaire arrête d’apparaître dès qu’elle change d’étape — tant qu’elle reste à la même, elle reste listée.',
      en: 'A deal stops appearing as soon as it moves to another stage — as long as it stays at the same one, it stays listed.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['manager'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'stale_account_plans',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Un plan de compte n’a pas été revu depuis trente jours.',
      en: 'An account plan has not been reviewed for thirty days.',
    },
    reads: { fr: 'La date de mise à jour de tes plans de compte.', en: 'The update date of your account plans.' },
    fallback: {
      fr: 'Un compte sans plan n’alerte pas : il n’y a rien à rafraîchir.',
      en: 'An account with no plan does not alert: there is nothing to refresh.',
    },
    acceptance: {
      fr: 'Une notification listant les plans à revoir, du plus ancien au plus récent.',
      en: 'A notification listing the plans to review, oldest first.',
    },
    name: { fr: 'Plans de compte à rafraîchir', en: 'Account plans to refresh' },
    description: {
      fr: 'Un plan d’un mois raconte un compte qui a changé depuis.',
      en: 'A month-old plan describes an account that has moved on.',
    },
    outcome: { fr: 'Une notification mensuelle.', en: 'One monthly notification.' },
    cadence: 'monthly',
    defaultHour: 9,
    // `null` et non un jour : une cadence mensuelle tombe sur le premier jour
    // OUVRÉ, pas sur un jour de semaine choisi.
    defaultWeekday: null,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Un plan arrête d’apparaître dès qu’il est rafraîchi — un plan resté tel quel continue d’être signalé.',
      en: 'A plan stops appearing as soon as it is refreshed — a plan left as is keeps being flagged.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'needs_without_shortlist',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Un besoin est ouvert depuis cinq jours sans aucune shortlist.',
      en: 'A need has been open for five days with no shortlist.',
    },
    reads: { fr: 'Tes besoins ouverts et leurs shortlists.', en: 'Your open needs and their shortlists.' },
    fallback: {
      fr: 'Un besoin déclaré non staffable n’alerte pas : la question a déjà été tranchée.',
      en: 'A need marked unstaffable does not alert: the question has already been answered.',
    },
    acceptance: {
      fr: 'Une notification listant les besoins sans profil proposé.',
      en: 'A notification listing needs with no profile proposed.',
    },
    name: { fr: 'Besoins sans shortlist', en: 'Needs without a shortlist' },
    description: {
      fr: 'Un besoin ouvert sans profil proposé est une occasion qui se referme toute seule.',
      en: 'An open need with no proposed profile is an opportunity closing on its own.',
    },
    outcome: { fr: 'Une notification en début de semaine.', en: 'One notification at the start of the week.' },
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 2,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Un besoin arrête d’apparaître dès qu’un profil lui est proposé, ou qu’il est clos.',
      en: 'A need stops appearing as soon as a profile is proposed for it, or it is closed.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['recruiter'],
    workspaceProfiles: ['staffing'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'parked_account_signal',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Un compte écarté porte un signal récent et fort.',
      en: 'A parked account carries a strong, recent signal.',
    },
    reads: {
      fr: 'Les comptes écartés, leur motif, et leurs signaux datés.',
      en: 'Parked accounts, their reason, and their dated signals.',
    },
    fallback: {
      fr: 'Un signal sans date ne rouvre jamais un compte écarté : on ne sait pas s’il est postérieur à la décision.',
      en: 'An undated signal never reopens a parked account: we cannot tell whether it postdates the decision.',
    },
    acceptance: {
      fr: 'Une notification rappelant le motif de l’écart ET le signal qui le remet en question.',
      en: 'A notification recalling the parking reason AND the signal that questions it.',
    },
    name: { fr: 'Compte écarté qui rebouge', en: 'Parked account showing signs of life' },
    description: {
      fr: 'Un compte que tu as écarté vient de faire quelque chose de notable.',
      en: 'An account you parked has just done something notable.',
    },
    outcome: {
      fr: 'Une notification, jamais une repriorisation automatique.',
      en: 'A notification, never an automatic re-prioritisation.',
    },
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 4,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Un compte arrête d’être signalé dès que tu le rouvres, ou quand son signal n’est plus récent.',
      en: 'An account stops being flagged as soon as you reopen it, or when its signal is no longer recent.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'contact_job_change',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Un contact semble avoir changé d’employeur.',
      en: 'A contact appears to have changed employer.',
    },
    reads: {
      fr: 'L’employeur courant du dernier enrichissement, comparé au compte de la fiche.',
      en: 'The current employer from the last enrichment, compared with the record’s account.',
    },
    fallback: {
      fr: 'Un contact jamais enrichi n’alerte pas : rien ne permet de comparer.',
      en: 'A contact never enriched does not alert: there is nothing to compare.',
    },
    acceptance: {
      fr: 'Une notification listant les contacts à vérifier. Elle écrit aussi, et c’est borné : les séquences actives du contact sont mises en pause, une porte s’ouvre chez le nouvel employeur et, quand le départ est prouvé, le contact passe en historique. Jamais une ligne saisie à la main ou venue du CRM n’est archivée, jamais une suppression.',
      en: 'A notification listing contacts to check. It also writes, within bounds: the contact’s active sequences are paused, a door opens at the new employer and, once the departure is proven, the contact moves to history. A contact entered by hand or coming from the CRM is never archived, and nothing is ever a deletion.',
    },
    name: { fr: 'Contacts qui ont peut-être changé de poste', en: 'Contacts who may have changed roles' },
    description: {
      fr: 'Un départ est à la fois une perte chez ce client et une entrée chez le suivant.',
      en: 'A departure is both a loss at this client and a way in at the next.',
    },
    outcome: { fr: 'Une notification mensuelle.', en: 'One monthly notification.' },
    cadence: 'monthly',
    defaultHour: 10,
    defaultWeekday: null,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Un contact arrête d’apparaître dès que son poste est confirmé ou corrigé sur sa fiche.',
      en: 'A contact stops appearing as soon as their role is confirmed or corrected on their record.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'model_call',
  },
  {
    key: 'cv_folder_watch',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Un fichier qui ressemble à un CV est apparu dans ton espace documentaire.',
      en: 'A file that looks like a CV appeared in your document space.',
    },
    reads: {
      fr: 'Les NOMS de fichiers de ton espace documentaire, modifiés dans les sept derniers jours.',
      en: 'File NAMES in your document space, modified in the last seven days.',
    },
    fallback: {
      fr: 'Sans espace documentaire connecté, la routine ne tourne pas et l’écran le dit.',
      en: 'Without a connected document space it does not run, and the screen says so.',
    },
    acceptance: {
      fr: 'Une notification listant les fichiers repérés — l’import reste un geste, rien n’est avalé.',
      en: 'A notification listing the files spotted — importing stays a gesture, nothing is ingested.',
    },
    name: { fr: 'CV déposés dans tes documents', en: 'CVs dropped in your documents' },
    description: {
      fr: 'Les CV qui arrivent dans un dossier partagé n’entrent jamais dans le vivier tout seuls.',
      en: 'CVs landing in a shared folder never enter the bench on their own.',
    },
    outcome: { fr: 'Une notification hebdomadaire.', en: 'One weekly notification.' },
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 3,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Un CV arrête d’être signalé dès qu’il est déposé dans le vivier, ou écarté — le dépôt reste ton geste.',
      en: 'A CV stops being flagged as soon as it is added to the pool, or discarded — adding it stays your gesture.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['recruiter'],
    workspaceProfiles: ['staffing'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'territory_watch',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Un de tes territoires suivis a bougé depuis la photo précédente.',
      en: 'One of your followed territories moved since the previous snapshot.',
    },
    reads: {
      fr: 'Les deux dernières photos hebdomadaires de chaque département suivi.',
      en: 'The last two weekly snapshots of each followed department.',
    },
    fallback: {
      fr: 'Sans territoire suivi, ou avant la deuxième photo, elle ne tourne pas et l’écran le dit.',
      en: 'Without a followed territory, or before the second snapshot, it does not run and the screen says so.',
    },
    acceptance: {
      fr: 'Une notification listant les mouvements — une semaine non mesurée ne compte jamais comme une chute.',
      en: 'A notification listing the moves — an unmeasured week never counts as a drop.',
    },
    name: { fr: 'Mouvements sur tes territoires', en: 'Moves on your territories' },
    description: {
      fr: 'Une ESN qui se met à recruter sur ta ville est un partenaire à appeler cette semaine, pas le mois prochain.',
      en: 'An ESN starting to hire in your city is a partner to call this week, not next month.',
    },
    outcome: { fr: 'Une notification hebdomadaire.', en: 'One weekly notification.' },
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 1,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Un mouvement arrête d’être signalé dès que tu as contacté l’ESN concernée, ou quand son signal n’est plus récent.',
      en: 'A move stops being flagged as soon as you have contacted the firm concerned, or when its signal is no longer recent.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'referencing_window',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Un marché en cours chez un de tes comptes se rouvre dans neuf, six ou trois mois.',
      en: 'A running contract at one of your accounts reopens in nine, six or three months.',
    },
    reads: {
      fr: 'Les échéances de marchés publics relevées sur tes comptes.',
      en: 'Public contract end dates recorded on your accounts.',
    },
    fallback: {
      fr: 'Une échéance non publiée n’alerte jamais — « je ne sais pas quand » n’est pas « c’est imminent ».',
      en: 'An unpublished end date never alerts — “I do not know when” is not “it is imminent”.',
    },
    acceptance: {
      fr: 'Une notification par compte et par jalon, jamais les trois d’un coup.',
      en: 'One notification per account and per milestone, never all three at once.',
    },
    name: { fr: 'Référencements qui se rouvrent', en: 'Referencings reopening' },
    description: {
      fr: 'À neuf mois on rencontre l’acheteur, à six on pèse sur le besoin, à trois on ne fait plus que répondre.',
      en: 'Nine months out you meet the buyer, six months you shape the need, three months you only reply.',
    },
    outcome: { fr: 'Une notification hebdomadaire.', en: 'One weekly notification.' },
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 2,
    requires: ['accounts'],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Une fenêtre arrête d’être signalée dès que le référencement est passé ou que son échéance est dépassée.',
      en: 'A window stops being flagged as soon as the referencing is done or its deadline has passed.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'meeting_checklist',
    automationLevel: 'n4_bounded_auto',
    condition: { fr: 'Un rendez-vous client commence dans l’heure.', en: 'A client meeting starts within the hour.' },
    reads: { fr: 'Le rendez-vous et le dossier du compte concerné.', en: 'The meeting and the matching account file.' },
    fallback: {
      fr: 'Sans dossier, la checklist se limite aux éléments de l’agenda.',
      en: 'Without a file the checklist is limited to calendar data.',
    },
    acceptance: {
      fr: 'Une notification par rendez-vous, une seule fois.',
      en: 'One notification per meeting, exactly once.',
    },
    name: { fr: 'Rendez-vous dans l’heure', en: 'Meeting within the hour' },
    description: {
      fr: 'Une heure avant chaque rendez-vous client : qui tu vois, sur quoi, et ce qui reste à trancher.',
      en: 'One hour before each client meeting: who you are seeing, about what, and what is still open.',
    },
    outcome: {
      fr: 'Une notification par rendez-vous, une seule fois.',
      en: 'One notification per meeting, exactly once.',
    },
    cadence: 'continuous',
    defaultHour: 8,
    defaultWeekday: null,
    requires: ['agenda_read'],
    defaultChannel: 'in_app',
    defaultEnabled: true,
    example: null,
    stopCondition: {
      fr: 'La checklist ne part qu’une fois, une heure avant le rendez-vous — et pas du tout si le rendez-vous est annulé ou a déjà commencé.',
      en: 'The checklist is sent only once, one hour before the meeting — and not at all if the meeting is cancelled or has already started.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'meeting_followup',
    automationLevel: 'n1_prepare',
    condition: { fr: 'Un rendez-vous client vient de se terminer.', en: 'A client meeting has just ended.' },
    reads: { fr: 'Le rendez-vous, ses participants et son objet.', en: 'The meeting, its attendees and its subject.' },
    fallback: {
      fr: 'Sans compte rattaché, la note reste à rattacher à la main.',
      en: 'Without a linked account the note stays to be attached manually.',
    },
    acceptance: {
      fr: 'Une notification par rendez-vous terminé, une seule fois.',
      en: 'One notification per finished meeting, exactly once.',
    },
    name: { fr: 'Après le rendez-vous', en: 'After the meeting' },
    description: {
      fr: 'Trente minutes après un rendez-vous client : la note à écrire, la tâche à poser, le récapitulatif à envoyer.',
      en: 'Thirty minutes after a client meeting: the note to write, the task to create, the recap to send.',
    },
    outcome: {
      fr: 'Une notification par rendez-vous terminé, une seule fois.',
      en: 'One notification per finished meeting, exactly once.',
    },
    cadence: 'continuous',
    defaultHour: 8,
    defaultWeekday: null,
    requires: ['agenda_read'],
    defaultChannel: 'in_app',
    defaultEnabled: true,
    example: null,
    stopCondition: {
      fr: 'Le rappel ne part qu’une fois, trente minutes après le rendez-vous — il ne se répète pas si la note n’est pas écrite.',
      en: 'The reminder is sent only once, thirty minutes after the meeting — it does not repeat if the note is not written.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'meeting_cancelled',
    automationLevel: 'n1_prepare',
    condition: { fr: 'Un rendez-vous a été annulé.', en: 'A meeting was cancelled.' },
    reads: { fr: 'Ton agenda et tes créneaux libres.', en: 'Your calendar and your free slots.' },
    fallback: {
      fr: 'Sans créneau libre trouvé, la notification signale seulement l’annulation.',
      en: 'With no free slot found, the notification only reports the cancellation.',
    },
    acceptance: {
      fr: 'Une notification par annulation, une seule fois.',
      en: 'One notification per cancellation, exactly once.',
    },
    name: { fr: 'Rendez-vous annulé', en: 'Cancelled meeting' },
    description: {
      fr: 'Quand un client annule : trois créneaux de remplacement, calculés sur ton agenda réel.',
      en: 'When a client cancels: three replacement slots, computed on your real calendar.',
    },
    outcome: {
      fr: 'Une notification par annulation détectée.',
      en: 'One notification per detected cancellation.',
    },
    cadence: 'continuous',
    defaultHour: 8,
    defaultWeekday: null,
    requires: ['agenda_read'],
    defaultChannel: 'in_app',
    defaultEnabled: true,
    example: null,
    stopCondition: {
      fr: 'Les trois créneaux ne sont proposés qu’une fois par annulation — une nouvelle annulation en déclenche de nouveaux.',
      en: 'The three slots are offered only once per cancellation — a new cancellation triggers new ones.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'tender_watch',
    automationLevel: 'n1_prepare',
    condition: { fr: 'Un message reçu ressemble à un appel d’offres.', en: 'An incoming message looks like a tender.' },
    reads: {
      fr: 'L’objet et les pièces jointes des messages récents.',
      en: 'The subject and attachments of recent messages.',
    },
    fallback: {
      fr: 'Un message ambigu n’est pas classé : mieux vaut le manquer que le mal ranger.',
      en: 'An ambiguous message is not classified: better missed than misfiled.',
    },
    acceptance: {
      fr: 'Une notification quand au moins un appel d’offres est repéré.',
      en: 'A notification when at least one tender is spotted.',
    },
    name: { fr: 'Appels d’offres reçus', en: 'Tenders received' },
    description: {
      fr: 'Les messages qui parlent d’appel d’offres, de consultation ou de marché public.',
      en: 'Messages mentioning a tender, a consultation or a public contract.',
    },
    outcome: {
      fr: 'Une notification quand un appel d’offres apparaît dans ta messagerie.',
      en: 'A notification when a tender shows up in your mailbox.',
    },
    cadence: 'weekdays',
    defaultHour: 10,
    defaultWeekday: null,
    requires: ['mailbox_read'],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Un message arrête d’apparaître dès que son fil est traité ; un fil sans suite reste listé.',
      en: 'A message stops appearing as soon as its thread is dealt with; a thread without follow-up stays listed.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'contract_watch',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Un message reçu parle de contrat ou de signature.',
      en: 'An incoming message mentions a contract or signature.',
    },
    reads: { fr: 'L’objet des messages récents.', en: 'The subject of recent messages.' },
    fallback: { fr: 'Un message ambigu n’est pas classé.', en: 'An ambiguous message is not classified.' },
    acceptance: {
      fr: 'Une notification quand au moins un contrat est repéré.',
      en: 'A notification when at least one contract is spotted.',
    },
    name: { fr: 'Contrats à signer', en: 'Contracts to sign' },
    description: {
      fr: 'Les échanges qui portent un contrat, un avenant ou une signature en attente.',
      en: 'Exchanges carrying a contract, an amendment or a pending signature.',
    },
    outcome: {
      fr: 'Une notification en fin de journée quand un contrat traîne.',
      en: 'An end-of-day notification when a contract is dragging.',
    },
    cadence: 'weekdays',
    defaultHour: 16,
    defaultWeekday: null,
    requires: ['mailbox_read'],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Un échange arrête d’apparaître dès que le contrat ou l’avenant est signé et le fil clos ; en attente de signature, il reste listé.',
      en: 'An exchange stops appearing as soon as the contract or amendment is signed and the thread closed; while awaiting signature, it stays listed.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['adv'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'invoice_watch',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Un message reçu parle de facture en souffrance.',
      en: 'An incoming message mentions an overdue invoice.',
    },
    reads: { fr: 'L’objet des messages récents.', en: 'The subject of recent messages.' },
    fallback: { fr: 'Un message ambigu n’est pas classé.', en: 'An ambiguous message is not classified.' },
    acceptance: {
      fr: 'Une notification quand au moins une facture est repérée.',
      en: 'A notification when at least one invoice is spotted.',
    },
    name: { fr: 'Factures en souffrance', en: 'Overdue invoices' },
    description: {
      fr: 'Les échanges qui parlent de facture, de règlement ou d’impayé.',
      en: 'Exchanges mentioning an invoice, a payment or an overdue amount.',
    },
    outcome: {
      fr: 'Une notification hebdomadaire, le lundi matin.',
      en: 'A weekly notification, on Monday morning.',
    },
    cadence: 'weekly',
    defaultHour: 10,
    defaultWeekday: 1,
    requires: ['mailbox_read'],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Un échange arrête d’apparaître dès que la facture est réglée ou le fil clos ; un impayé reste listé.',
      en: 'An exchange stops appearing as soon as the invoice is settled or the thread closed; an unpaid one stays listed.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['adv'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'stalled_proposals',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Une proposition est sans suite depuis sept jours.',
      en: 'A proposal has had no follow-up for seven days.',
    },
    reads: { fr: 'L’activité CRM des affaires en cours.', en: 'The CRM activity of open deals.' },
    fallback: { fr: 'Sans CRM connecté, la routine ne tourne pas.', en: 'Without a connected CRM it does not run.' },
    acceptance: {
      fr: 'Une notification listant les propositions sans suite.',
      en: 'A notification listing the stalled proposals.',
    },
    name: { fr: 'Propositions sans suite', en: 'Proposals without a follow-up' },
    description: {
      fr: 'Les contacts du CRM restés sans activité depuis une semaine après une proposition.',
      en: 'CRM contacts left without activity for a week after a proposal.',
    },
    outcome: {
      fr: 'Une notification listant les propositions à relancer.',
      en: 'A notification listing the proposals to chase.',
    },
    cadence: 'weekdays',
    defaultHour: 9,
    defaultWeekday: null,
    requires: ['crm'],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Un contact arrête d’apparaître dès qu’une activité est enregistrée après la proposition — sans activité, il reste listé.',
      en: 'A contact stops appearing as soon as an activity is logged after the proposal — without activity, it stays listed.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'crm_duplicates',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Des fiches CRM se ressemblent assez pour être des doublons.',
      en: 'CRM records resemble each other enough to be duplicates.',
    },
    reads: { fr: 'Les contacts de ton CRM : adresse, nom, société.', en: 'Your CRM contacts: address, name, company.' },
    fallback: {
      fr: 'On PROPOSE, on ne fusionne jamais — un faux positif détruit un historique.',
      en: 'We PROPOSE, never merge — a false positive destroys a real history.',
    },
    acceptance: {
      fr: 'Une notification hebdomadaire quand au moins une paire est trouvée.',
      en: 'A weekly notification when at least one pair is found.',
    },
    name: { fr: 'Doublons du CRM', en: 'CRM duplicates' },
    description: {
      fr: 'Les fiches qui désignent probablement la même personne, avec la raison du rapprochement.',
      en: 'Records that probably designate the same person, with the reason for the match.',
    },
    outcome: {
      fr: 'Une notification hebdomadaire, jamais une fusion automatique.',
      en: 'A weekly notification, never an automatic merge.',
    },
    cadence: 'weekly',
    defaultHour: 18,
    defaultWeekday: 3,
    requires: ['crm'],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Une paire arrête d’apparaître dès que tu as validé ou refusé le rapprochement — Laura propose, elle ne fusionne jamais.',
      en: 'A pair stops appearing as soon as you have accepted or declined the match — Laura proposes, she never merges.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['manager'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'prepare', 'notify', 'await_validation'],
    preparedActions: ['notification', 'crm_update_proposal'],
    validations: ['user_approves_write'],
    budget: 'no_model_call',
  },
  {
    key: 'cv_intake',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Un message reçu contient un CV en pièce jointe.',
      en: 'An incoming message carries a CV attachment.',
    },
    reads: {
      fr: 'L’objet et les pièces jointes des messages récents.',
      en: 'The subject and attachments of recent messages.',
    },
    fallback: {
      fr: 'Un CV illisible est signalé comme tel, jamais deviné.',
      en: 'An unreadable CV is reported as such, never guessed.',
    },
    acceptance: {
      fr: 'Une notification quand au moins un CV est repéré.',
      en: 'A notification when at least one CV is spotted.',
    },
    name: { fr: 'CV reçus', en: 'CVs received' },
    // Le libellé annonçait « ajoutés à ta base de connaissance » : la routine
    // ne fait que SIGNALER les messages porteurs d'un CV. Un utilisateur qui
    // cochait la case croyait avoir armé une ingestion — c'est la version
    // réglages du « Active sans connecteur » que le produit s'interdit.
    description: {
      fr: 'Les messages reçus avec un CV en pièce jointe, signalés — le dépôt reste ton geste.',
      en: 'Incoming messages carrying a CV attachment, flagged — importing stays your move.',
    },
    outcome: {
      fr: 'Une notification listant les messages à ouvrir.',
      en: 'One notification listing the messages to open.',
    },
    cadence: 'weekdays',
    defaultHour: 18,
    defaultWeekday: null,
    requires: ['mailbox_read'],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Un message arrête d’être signalé dès que son CV est déposé dans le vivier ou écarté — le dépôt reste ton geste.',
      en: 'A message stops being flagged as soon as its CV is added to the pool or discarded — adding it stays your gesture.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['recruiter'],
    workspaceProfiles: ['staffing'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'monday_kickstart',
    automationLevel: 'n4_bounded_auto',
    condition: {
      fr: 'La semaine commence et il y a quelque chose à préparer.',
      en: 'The week starts and there is something to prepare.',
    },
    reads: {
      fr: 'Ton agenda, tes actions en retard et tes comptes prioritaires.',
      en: 'Your calendar, your overdue actions and your priority accounts.',
    },
    fallback: {
      fr: 'Les blocs indisponibles sont omis, et le brief le dit.',
      en: 'Unavailable blocks are omitted, and the brief says so.',
    },
    acceptance: { fr: 'Une notification le lundi matin.', en: 'A Monday morning notification.' },
    name: { fr: 'Lundi, la semaine qui commence', en: 'Monday, the week ahead' },
    description: {
      fr: 'Le lundi matin : tes rendez-vous de la semaine, tes relances en retard et ce qui arrive à échéance.',
      en: 'On Monday morning: your meetings for the week, your overdue follow-ups and what is coming due.',
    },
    outcome: {
      fr: 'Une notification récapitulative en début de semaine.',
      en: 'A recap notification at the start of the week.',
    },
    cadence: 'weekly',
    defaultHour: 8,
    defaultWeekday: 1,
    requires: ['agenda_read'],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Un seul point par lundi : il s’arrête une fois préparé et repart de zéro le lundi suivant.',
      en: 'One check-in per Monday: it stops once prepared and starts over the following Monday.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['general'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'prepare', 'notify'],
    preparedActions: ['notification', 'digest'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'crm_hygiene',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Des fiches CRM manquent d’une information qui EMPÊCHE de travailler.',
      en: 'CRM records lack information that PREVENTS work.',
    },
    reads: { fr: 'Les contacts de ton CRM : adresse, société, nom.', en: 'Your CRM contacts: address, company, name.' },
    fallback: {
      fr: 'Seul ce qui empêche de travailler est signalé ; le reste appartient à son propriétaire.',
      en: 'Only what prevents work is flagged; the rest belongs to its owner.',
    },
    acceptance: {
      fr: 'Une notification mensuelle, le premier jour ouvré.',
      en: 'A monthly notification, on the first business day.',
    },
    name: { fr: 'Hygiène du CRM', en: 'CRM hygiene' },
    description: {
      fr: 'Le premier jour ouvré du mois : fiches sans email, sans société, sans activité.',
      en: 'On the first business day of the month: records without an email, a company or any activity.',
    },
    outcome: {
      fr: 'Une notification mensuelle avec le compte des fiches à corriger.',
      en: 'A monthly notification with the count of records to fix.',
    },
    cadence: 'monthly',
    defaultHour: 9,
    defaultWeekday: null,
    requires: ['crm'],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Une fiche arrête d’être signalée dès que son manque (email, société, activité) est comblé ; la routine repasse le mois suivant.',
      en: 'A record stops being flagged as soon as its gap (email, company, activity) is filled; the routine runs again the following month.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['manager'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'quarterly_review',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Un nouveau trimestre commence et le précédent a des résultats.',
      en: 'A new quarter starts and the previous one has results.',
    },
    reads: { fr: 'Tes résultats du trimestre écoulé.', en: 'Your results from the past quarter.' },
    fallback: {
      fr: 'Un trimestre sans donnée exploitable ne produit pas de revue.',
      en: 'A quarter without usable data produces no review.',
    },
    acceptance: {
      fr: 'Une notification le premier jour ouvré du trimestre.',
      en: 'A notification on the first business day of the quarter.',
    },
    name: { fr: 'Revue trimestrielle', en: 'Quarterly review' },
    description: {
      fr: 'Le premier jour ouvré du trimestre : l’activité du trimestre écoulé, prête à être présentée.',
      en: 'On the first business day of the quarter: the past quarter’s activity, ready to present.',
    },
    outcome: {
      fr: 'Une notification trimestrielle qui ouvre sur le pilotage.',
      en: 'A quarterly notification opening on the cockpit.',
    },
    cadence: 'quarterly',
    defaultHour: 10,
    defaultWeekday: null,
    requires: ['accounts'],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Un seul bilan par trimestre : il s’arrête une fois préparé et repart de zéro le trimestre suivant.',
      en: 'One review per quarter: it stops once prepared and starts over the following quarter.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['manager'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'prepare', 'notify'],
    preparedActions: ['notification', 'digest'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'timesheet_chase',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Le mois est clos et un relevé n’est jamais arrivé.',
      en: 'The month is closed and a timesheet never arrived.',
    },
    reads: {
      fr: 'Les missions en régie et leurs relevés du mois clos.',
      en: 'Time-and-materials assignments and their closed-month timesheets.',
    },
    fallback: {
      fr: 'Un contrat au forfait n’attend AUCUN relevé et n’alerte jamais.',
      en: 'A fixed-price contract expects NO timesheet and never alerts.',
    },
    acceptance: {
      fr: 'Une notification quand au moins un relevé manque sur un mois clos.',
      en: 'A notification when at least one timesheet is missing on a closed month.',
    },
    name: { fr: 'Relevés d’activité manquants', en: 'Missing timesheets' },
    description: {
      fr: 'Le mois est clos et des relevés ne sont jamais arrivés.',
      en: 'The month is closed and some timesheets never arrived.',
    },
    outcome: {
      fr: 'Une notification listant les missions dont le relevé manque, avec depuis combien de jours.',
      en: 'A notification listing the missions whose timesheet is missing, and for how many days.',
    },
    // Sur jours ouvrés : le déclencheur ne sert à rien avant que le mois ne
    // soit fini, et il ne sert à personne un dimanche.
    cadence: 'weekdays',
    defaultHour: 9,
    defaultWeekday: null,
    requires: ['ats'],
    defaultChannel: 'in_app',
    defaultEnabled: true,
    example: null,
    stopCondition: {
      fr: 'Un relevé arrête d’être relancé dès qu’il est reçu — tant qu’il manque, il reste listé.',
      en: 'A timesheet stops being chased as soon as it is received — while it is missing, it stays listed.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['adv'],
    workspaceProfiles: ['staffing'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'invoice_readiness',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Un mois clos porte encore au moins un bloqueur de facturation.',
      en: 'A closed month still carries at least one invoicing blocker.',
    },
    reads: {
      fr: 'Les missions, leurs relevés et leurs conditions commerciales.',
      en: 'Assignments, their timesheets and their commercial terms.',
    },
    fallback: {
      fr: 'Un montant non chiffrable est compté à part, jamais estimé.',
      en: 'An unquantifiable amount is counted apart, never estimated.',
    },
    acceptance: {
      fr: 'Une notification mensuelle quand au moins un mois reste bloqué.',
      en: 'A monthly notification when at least one month is still blocked.',
    },
    name: { fr: 'Ce qui empêche de facturer', en: 'What is blocking invoicing' },
    description: {
      fr: 'Le mois clos, mission par mission : ce qui bloque et ce qui est prêt.',
      en: 'The closed month, mission by mission: what is blocked and what is ready.',
    },
    outcome: {
      fr: 'Une notification quand au moins un mois reste bloqué.',
      en: 'A notification when at least one month is still blocked.',
    },
    cadence: 'monthly',
    defaultHour: 9,
    defaultWeekday: null,
    requires: ['ats'],
    defaultChannel: 'in_app',
    defaultEnabled: true,
    example: null,
    stopCondition: {
      fr: 'Une mission arrête d’apparaître comme bloquée dès que ce qui la bloque est levé ; la lecture repart de zéro le mois suivant.',
      en: 'A mission stops appearing as blocked as soon as what blocks it is cleared; the read starts over the following month.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['adv', 'manager'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'margin_alert',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Un seuil de marge est réglé ET une mission passe dessous.',
      en: 'A margin threshold is set AND an assignment falls below it.',
    },
    reads: {
      fr: 'Le TJM et le coût chargé des missions en cours.',
      en: 'The daily rate and loaded cost of running assignments.',
    },
    fallback: {
      fr: 'Aucun seuil réglé ⇒ aucune alerte, et la trace le DIT.',
      en: 'No threshold set ⇒ no alert, and the trace SAYS so.',
    },
    acceptance: {
      fr: 'Une notification hebdomadaire quand au moins une mission passe sous le seuil.',
      en: 'A weekly notification when at least one assignment falls below.',
    },
    name: { fr: 'Marges sous le seuil', en: 'Margins below threshold' },
    description: {
      fr: 'Les missions en cours dont la marge passe sous le seuil réglé pour ton espace.',
      en: 'Running missions whose margin falls below your workspace threshold.',
    },
    outcome: {
      fr: 'Une notification quand au moins une mission passe sous le seuil. Aucun seuil réglé, aucune alerte.',
      en: 'A notification when at least one mission falls below. No threshold set, no alert.',
    },
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 1,
    requires: ['ats'],
    defaultChannel: 'in_app',
    // Éteinte par défaut : sans seuil réglé elle ne dirait rien, et une routine
    // qui ne dit jamais rien se lit comme une panne.
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Une mission arrête d’être signalée dès que sa marge repasse au-dessus du seuil réglé pour ton espace.',
      en: 'A mission stops being flagged as soon as its margin goes back above the threshold set for your workspace.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['manager', 'adv'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'connector_health',
    // #4016 L6 (Louis 11/10/2026) — la première routine N5 : elle surveille,
    // seule et sans plafond, des outils déjà branchés, et ne parle qu'au
    // propriétaire, dans l'application. Rien ne sort.
    automationLevel: 'n5_extended_auto',
    condition: {
      fr: 'L’état d’un outil connecté a CHANGÉ depuis la dernière fois.',
      en: 'A connected tool’s state has CHANGED since last time.',
    },
    reads: {
      fr: 'L’état des connexions : portées accordées, expiration, dernière activité.',
      en: 'Connection state: granted scopes, expiry, last activity.',
    },
    fallback: {
      fr: 'Une capacité illisible n’est pas signalée : « je n’ai pas pu regarder » n’est pas « c’est cassé ».',
      en: 'An unreadable capability is not flagged: “I could not look” is not “it is broken”.',
    },
    acceptance: {
      fr: 'Une notification par outil ET par état, jamais un rappel quotidien.',
      en: 'One notification per tool AND per state, never a daily reminder.',
    },
    name: { fr: 'Santé des connecteurs', en: 'Connector health' },
    description: {
      fr: 'Un outil connecté qui a cessé de fonctionner : jeton expiré, droit d’écriture retiré, synchronisation en retard.',
      en: 'A connected tool that stopped working: expired token, revoked write access, late synchronisation.',
    },
    outcome: {
      fr: 'Une notification quand l’état d’un outil CHANGE — jamais un rappel quotidien du même problème.',
      en: 'A notification when a tool’s state CHANGES — never a daily reminder of the same problem.',
    },
    /**
     * `continuous`, et c'est un CORRECTIF, pas un réglage.
     *
     * Elle était déclarée `daily`. Son exécuteur rend des `items[]` — un par
     * couple outil/état, avec leur clé d'idempotence `outil:état`. Or
     * `routines.service` ne notifie que sur `outcome.notification` (absent ici),
     * et les `items` ne sont lus que par `runContinuous`, réservé à
     * `cadence === 'continuous'`. La routine tournait donc tous les matins,
     * marquait sa trace du jour, et **n'a jamais envoyé une seule
     * notification** — ni une fois, ni tous les jours.
     *
     * `continuous` est aussi le bon régime au fond : ce qu'elle surveille est
     * attaché à un OBJET (un outil dans un état), pas à une heure. Et son
     * idempotence porte déjà sur l'état — un jeton qui expire à nouveau après
     * réparation se redit, ce qu'une clé datée ne saurait pas faire.
     */
    cadence: 'continuous',
    defaultHour: 8,
    defaultWeekday: null,
    // Aucune capacité requise : c'est justement la routine qui surveille les
    // capacités. Exiger l'une d'elles la ferait taire quand elle sert le plus.
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: true,
    example: null,
    stopCondition: {
      fr: 'Un outil arrête d’être signalé dès qu’il refonctionne (jeton renouvelé, droit rétabli, synchronisation à jour).',
      en: 'A tool stops being flagged as soon as it works again (token renewed, permission restored, sync up to date).',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['general'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'availability_reconfirm',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Une disponibilité a été saisie il y a plus de soixante jours et n’a pas été reconfirmée depuis.',
      en: 'An availability was entered over sixty days ago and has not been reconfirmed since.',
    },
    reads: {
      fr: 'La date de saisie de la disponibilité de chaque profil du vivier actif.',
      en: 'The date each active pool profile’s availability was entered.',
    },
    fallback: {
      fr: 'Une disponibilité jamais saisie ne remonte pas : il n’y a rien à confirmer, et « inconnu » ne se reconfirme pas non plus.',
      en: 'An availability that was never entered never surfaces: there is nothing to confirm, and “unknown” is not reconfirmed either.',
    },
    acceptance: {
      fr: 'Une notification hebdomadaire nommant le profil dont la disponibilité est la plus ancienne.',
      en: 'A weekly notification naming the profile whose availability is the oldest.',
    },
    name: { fr: 'Disponibilités à reconfirmer', en: 'Availability to reconfirm' },
    description: {
      fr: 'Les profils dont la disponibilité annoncée date de plus de soixante jours.',
      en: 'Profiles whose stated availability is more than sixty days old.',
    },
    outcome: {
      fr: 'Une notification hebdomadaire quand au moins une disponibilité dépasse soixante jours — et le profil le plus ancien est nommé.',
      en: 'A weekly notification when at least one availability passes sixty days — and the oldest profile is named.',
    },
    /**
     * `weekly`, et c'est le cœur du réglage.
     *
     * Le seuil est un ÂGE, pas un évènement : une disponibilité périmée le
     * reste tant que personne ne la reconfirme. En `daily`, la routine redirait
     * la même chose chaque matin jusqu'au geste, et le plafond de proactivité —
     * trois messages par jour — se remplirait de ce rappel-là au détriment de
     * ce qui bouge. Une routine qui parle trop est pire qu'une routine absente.
     */
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 1,
    // Aucune capacité externe : la donnée est celle du vivier maison. Exiger
    // `ats` la ferait taire chez les ESN qui n'ont pas connecté d'ATS — c'est
    // justement celles dont le vivier vit ici.
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: true,
    example: null,
    // #2398.6/#2398.14 — un ÂGE, pas un évènement (voir le commentaire
    // `cadence` juste au-dessus) : rien ne la fait taire d'elle-même tant
    // que personne ne reconfirme — jamais un compteur qui s'épuise seul.
    stopCondition: {
      fr: 'Un profil arrête d’apparaître dès que sa disponibilité est reconfirmée. Sans reconfirmation, elle continue de le nommer chaque semaine, indéfiniment — seule la désactivation l’arrête.',
      en: 'A profile stops appearing once its availability is reconfirmed. Without reconfirmation, it keeps naming it every week, indefinitely — only disabling the routine stops it.',
    },
    version: 1,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['recruiter'],
    workspaceProfiles: ['staffing'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  /**
   * #2392.2 — le déclencheur « routine du soir » de la clôture de fin de
   * journée (LAU-FINAL-106). La clôture existait déjà sur demande à Laura et
   * par commande explicite (`compile_day_closure`, `command-catalog.ts`), mais
   * aucun rappel proactif ne la proposait en fin de journée — exactement ce
   * que ce module fait pour le brief du matin (`daily_briefing`).
   *
   * Ajoutée EN FIN d'énumération (GA-08).
   *
   * Elle réutilise le MÊME compilateur que la demande explicite
   * (`BriefingService.dayClosure`, GA-26 : une dérivation vit à un seul
   * endroit) — jamais une seconde règle de « qu'est-ce qui reste ouvert ».
   */
  {
    key: 'evening_closure_prompt',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Une tâche attend une décision ou un fil sortant est resté sans réponse aujourd’hui.',
      en: 'A task is waiting on a decision, or an outgoing thread got no reply today.',
    },
    reads: {
      fr: 'Tes tâches ouvertes, closes ou créées aujourd’hui, et tes fils sortants sans réponse.',
      en: 'Your tasks opened, closed or created today, and your outgoing threads without a reply.',
    },
    fallback: {
      fr: 'Sans tâches ni messagerie lisibles, elle se tait — elle ne suppose jamais une journée calme.',
      en: 'Without readable tasks or mailbox, it stays silent — it never assumes a quiet day.',
    },
    acceptance: {
      fr: 'Une notification en fin d’après-midi, seulement s’il reste une boucle ouverte à clôturer.',
      en: 'A late-afternoon notification, only when an open loop remains to close.',
    },
    name: { fr: 'Clôture de fin de journée', en: 'End-of-day closure' },
    description: {
      fr: 'En fin de journée, un rappel s’il reste une tâche à décider ou un fil resté sans réponse — jamais si tout est clos.',
      en: 'At the end of the day, a reminder when a task still needs a decision or a thread got no reply — never when everything is closed.',
    },
    outcome: {
      fr: 'Une notification qui ouvre la clôture de ta journée, avec ce qu’il reste à trancher.',
      en: 'A notification opening your day closure, with what still needs a decision.',
    },
    cadence: 'weekdays',
    defaultHour: 18,
    defaultWeekday: null,
    // Aucune capacité externe requise : les tâches sont internes, et une
    // messagerie non connectée dégrade `waitingOn` sans faire échouer le
    // compilateur (même contrat que la demande explicite à Laura).
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Le rappel s’arrête dès que plus aucune tâche n’est à décider ni aucun fil sans réponse — tout est clos, il ne dit rien.',
      en: 'The prompt stops as soon as no task is left to decide and no thread is left unanswered — when everything is closed, it says nothing.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['general'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  /**
   * #2398.5 (LAU-FINAL-112, MISSION/DELIVERY) — le rappel de retour de
   * mission (« REX ») manquant. Ajoutée EN FIN d'énumération (GA-08).
   *
   * `requires: ['ats']` reprend la convention de `mission_ending` et
   * `timesheet_chase` : la mission elle-même vient du staffing, pas d'une
   * capacité propre à cette routine.
   */
  {
    key: 'mission_rex_reminder',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Une mission est terminée et personne n’a encore recueilli son retour d’expérience.',
      en: 'An assignment has ended and no one has collected its debrief yet.',
    },
    reads: {
      fr: 'Les missions terminées de l’espace et les retours déjà recueillis.',
      en: 'The workspace’s ended assignments and the debriefs already collected.',
    },
    fallback: {
      fr: 'Le retour ne se fabrique jamais : sans retour écrit par un consultant, la mission reste listée « en attente », jamais complétée à sa place.',
      en: 'The debrief is never invented: without one written by a consultant, the assignment stays listed as pending, never completed on their behalf.',
    },
    acceptance: {
      fr: 'Une notification quand au moins une mission terminée attend encore son retour.',
      en: 'A notification when at least one ended assignment still awaits its debrief.',
    },
    name: { fr: 'Retours de mission en attente', en: 'Pending mission debriefs' },
    description: {
      fr: 'Les missions terminées dont le retour d’expérience n’a pas encore été recueilli.',
      en: 'Ended assignments whose debrief has not been collected yet.',
    },
    outcome: {
      fr: 'Une notification listant les missions dont le retour d’expérience manque, la plus ancienne d’abord.',
      en: 'A notification listing the assignments missing their debrief, the oldest first.',
    },
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 1,
    requires: ['ats'],
    defaultChannel: 'in_app',
    defaultEnabled: true,
    example: null,
    // #2398.6/#2398.14 — rien ne borne la fenêtre (contrairement à
    // `mission_checkin_j7_reminder` juste plus bas, 7-21 jours) : une mission
    // sans retour reste listée indéfiniment, semaine après semaine.
    stopCondition: {
      fr: 'Une mission arrête d’apparaître dès qu’un consultant y écrit son retour d’expérience. Sans retour, elle reste listée chaque semaine, indéfiniment — seule la désactivation arrête le rappel.',
      en: 'An assignment stops appearing once a consultant writes its debrief. Without one, it stays listed every week, indefinitely — only disabling the routine stops the reminder.',
    },
    version: 1,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['delivery', 'commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  /**
   * #2392.2 — lot clôture c1 (26/09) : 2 des 5 déclencheurs encore manquants
   * de la clôture quotidienne, « fin de semaine » et « avant une revue
   * manager ». Réutilisent EXACTEMENT le même compilateur que
   * `evening_closure_prompt` (`BriefingService.dayClosure`, GA-26) — jamais
   * une seconde règle de « qu'est-ce qui reste ouvert ».
   *
   * Les 3 autres déclencheurs de #2392.2 restent HORS de ce lot : « routine »
   * et « demande Laura » sont déjà là (`evening_closure_prompt` +
   * `compile_day_closure`) ; « fermeture de session » est écarté par la règle
   * #7 du CLAUDE.md (indépendance des modules NestJS) — `BriefingService` vit
   * dans `BriefingModule`, qui importe Chains/Mailbox/MarketMemory/
   * SignalHistory/Tasks/Workspace ; l'injecter dans `AuthModule` (déjà à son
   * plafond GA-07 avec `forwardRef(() => WorkspaceModule)`) romprait
   * l'indépendance du module d'authentification pour un rappel de confort.
   *
   * Ajoutées EN FIN d'énumération (GA-08).
   */
  {
    key: 'end_of_week_closure_prompt',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Une tâche attend une décision ou un fil sortant est resté sans réponse en fin de semaine.',
      en: 'A task is waiting on a decision, or an outgoing thread got no reply by the end of the week.',
    },
    reads: {
      fr: 'Tes tâches ouvertes, closes ou créées cette semaine, et tes fils sortants sans réponse.',
      en: 'Your tasks opened, closed or created this week, and your outgoing threads without a reply.',
    },
    fallback: {
      fr: 'Sans tâches ni messagerie lisibles, elle se tait — elle ne suppose jamais une semaine calme.',
      en: 'Without readable tasks or mailbox, it stays silent — it never assumes a quiet week.',
    },
    acceptance: {
      fr: 'Une notification le vendredi en fin de journée, seulement s’il reste une boucle ouverte à clôturer.',
      en: 'A late Friday notification, only when an open loop remains to close.',
    },
    name: { fr: 'Clôture de fin de semaine', en: 'End-of-week closure' },
    description: {
      fr: 'Le vendredi en fin de journée, un rappel s’il reste une tâche à décider ou un fil resté sans réponse — jamais si tout est clos.',
      en: 'On Friday afternoon, a reminder when a task still needs a decision or a thread got no reply — never when everything is closed.',
    },
    outcome: {
      fr: 'Une notification qui ouvre la clôture de ta semaine, avec ce qu’il reste à trancher.',
      en: 'A notification opening your week closure, with what still needs a decision.',
    },
    cadence: 'weekly',
    defaultHour: 17,
    defaultWeekday: 5,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Le rappel s’arrête dès que plus aucune tâche n’est à décider ni aucun fil sans réponse — tout est clos, il ne dit rien.',
      en: 'The prompt stops as soon as no task is left to decide and no thread is left unanswered — when everything is closed, it says nothing.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['general'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'pre_manager_review_closure_prompt',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Une tâche attend une décision ou un fil sortant est resté sans réponse avant la revue manager.',
      en: 'A task is waiting on a decision, or an outgoing thread got no reply, before the manager review.',
    },
    reads: {
      fr: 'Tes tâches ouvertes, closes ou créées cette semaine, et tes fils sortants sans réponse.',
      en: 'Your tasks opened, closed or created this week, and your outgoing threads without a reply.',
    },
    fallback: {
      fr: 'Sans tâches ni messagerie lisibles, elle se tait — elle ne suppose jamais une semaine calme.',
      en: 'Without readable tasks or mailbox, it stays silent — it never assumes a quiet week.',
    },
    acceptance: {
      fr: 'Une notification le vendredi avant l’heure du récapitulatif hebdomadaire, seulement s’il reste une boucle ouverte.',
      en: 'A Friday notification before the weekly recap time, only when an open loop remains.',
    },
    name: { fr: 'Clôture avant la revue manager', en: 'Closure before the manager review' },
    description: {
      fr: 'Le vendredi, avant le récapitulatif de la semaine, un rappel s’il reste une tâche à décider ou un fil resté sans réponse.',
      en: 'On Friday, before the weekly recap, a reminder when a task still needs a decision or a thread got no reply.',
    },
    outcome: {
      fr: 'Une notification qui ouvre ta clôture avant ta revue avec ton manager, avec ce qu’il reste à trancher.',
      en: 'A notification opening your closure before your manager review, with what still needs a decision.',
    },
    // Juste avant `weekly_recap` (vendredi 16h) : la revue manager s'appuie
    // sur ce récapitulatif, donc la clôture personnelle doit le précéder.
    cadence: 'weekly',
    defaultHour: 15,
    defaultWeekday: 5,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    stopCondition: {
      fr: 'Le rappel s’arrête dès que plus aucune tâche n’est à décider ni aucun fil sans réponse ; il ne part qu’une fois, avant le récapitulatif.',
      en: 'The prompt stops as soon as no task is left to decide and no thread is left unanswered; it is sent once, before the recap.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['manager'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  /**
   * Épopée #2873 (#2367.14, LOT c5 clôture 26/09) — une séquence d'outreach
   * vient de passer `completed` : elle propose de mettre à jour le CRM sur le
   * contact concerné. Même patron que `positive_replies` : elle SIGNALE,
   * n'écrit rien (doctrine « une écriture CRM/ERP passe par une porte »).
   * Ajoutée EN FIN d'énumération (GA-08).
   */
  {
    key: 'sequence_completed_crm_update',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Une séquence d’outreach vient de se terminer sur un contact.',
      en: 'An outreach sequence on a contact has just completed.',
    },
    reads: {
      fr: 'Les séquences récemment terminées de l’espace et le contact qu’elles ciblaient.',
      en: 'The workspace’s recently completed sequences and the contact they targeted.',
    },
    fallback: {
      fr: 'Rien n’est écrit dans le CRM : la mise à jour reste une proposition, jamais un fait accompli.',
      en: 'Nothing is written to the CRM: the update stays a proposal, never a fait accompli.',
    },
    acceptance: {
      fr: 'Une notification par séquence terminée, proposant de mettre à jour le CRM du contact.',
      en: 'A notification per completed sequence, proposing to update the contact’s CRM record.',
    },
    name: { fr: 'Séquence terminée : mise à jour CRM', en: 'Sequence completed: CRM update' },
    description: {
      fr: 'Une séquence d’outreach vient de se terminer : propose de mettre à jour le CRM sur ce contact.',
      en: 'An outreach sequence has just completed: proposes updating the CRM on that contact.',
    },
    outcome: {
      fr: 'Une notification par contact dont la séquence vient de se terminer, avec un lien vers sa fiche.',
      en: 'A notification per contact whose sequence just completed, linking to their record.',
    },
    cadence: 'weekdays',
    defaultHour: 11,
    defaultWeekday: null,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: true,
    example: null,
    stopCondition: {
      fr: 'La proposition s’arrête dès que tu valides ou refuses la mise à jour du CRM — elle passe par la porte d’approbation, jamais seule.',
      en: 'The proposal stops as soon as you accept or decline the CRM update — it goes through the approval gate, never on its own.',
    },
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'prepare', 'notify', 'await_validation'],
    preparedActions: ['notification', 'crm_update_proposal'],
    validations: ['user_approves_write'],
    budget: 'no_model_call',
  },
  /**
   * #3061 / #2374.19 — un « pas maintenant » se met en pause (`not_now_deferred`,
   * OutreachService, #2381.8) ; jusqu'ici, savoir que son échéance de
   * revérification était atteinte supposait d'ouvrir la fiche contact.
   * Ajoutée EN FIN d'énumération (GA-08).
   *
   * Même patron que `availability_reconfirm` : un ÂGE, pas un évènement — une
   * pause reste due tant que personne ne la revérifie, donc `weekly` plutôt
   * que `daily` (même raison, même plafond de proactivité à trois messages
   * par jour). Elle ne reprend jamais rien elle-même : la reprise reste
   * `OutreachService.resume()`, un geste humain.
   */
  {
    key: 'not_now_revalidation',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Une séquence a été mise en pause « pas maintenant » depuis plus de trente jours et n’a pas été revérifiée.',
      en: 'A sequence has been paused as “not now” for over thirty days and has not been revalidated since.',
    },
    reads: {
      fr: 'La date de la dernière pause « pas maintenant » de chaque séquence encore en pause, et le poste actuel du contact.',
      en: 'The date of each still-paused sequence’s last “not now” pause, and the contact’s current job status.',
    },
    fallback: {
      fr: 'Contexte, signal et pertinence ne sont jamais devinés : la notification les nomme comme non évalués plutôt que de les taire ou de les inventer.',
      en: 'Context, signal and fit are never guessed: the notification names them as not evaluated rather than staying silent or inventing them.',
    },
    acceptance: {
      fr: 'Une notification hebdomadaire nommant la pause « pas maintenant » la plus ancienne à revérifier.',
      en: 'A weekly notification naming the oldest “not now” pause due for revalidation.',
    },
    name: { fr: 'Pauses « pas maintenant » à revérifier', en: 'Not-now pauses to revalidate' },
    description: {
      fr: 'Les séquences en pause « pas maintenant » depuis plus de trente jours, avant toute reprise.',
      en: 'Sequences paused as “not now” for over thirty days, before any resumption.',
    },
    outcome: {
      fr: 'Une notification hebdomadaire quand au moins une pause dépasse trente jours — la plus ancienne est nommée.',
      en: 'A weekly notification when at least one pause passes thirty days — the oldest is named.',
    },
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 1,
    // Aucune capacité externe : la donnée vient des tables outreach internes,
    // jamais d'un connecteur — même raison que `stalled_projects`.
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: true,
    example: null,
    // #2398.6/#2398.14 — elle ne reprend RIEN elle-même (voir le docblock
    // juste au-dessus, `OutreachService.resume()` reste un geste humain) :
    // son propre arrêt dépend donc entièrement de ce geste, jamais d'un
    // délai qui s'épuiserait seul.
    stopCondition: {
      fr: 'Une pause arrête d’apparaître dès qu’elle est reprise (geste humain, `resume()`) — la routine ne reprend jamais rien elle-même. Sans reprise, elle continue de la nommer chaque semaine, indéfiniment.',
      en: 'A pause stops appearing once it is resumed (a human gesture, `resume()`) — the routine never resumes anything itself. Without that, it keeps naming it every week, indefinitely.',
    },
    version: 1,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  /**
   * #3413.2 (beta:metier, 30/09/2026) — LE POINT J+7. Ajoutée EN FIN
   * d'énumération (GA-08).
   *
   * Fenêtre 7-21 jours après le démarrage
   * (`MissionFeedbackService.checkinJ7ForWorkspace`) : assez tôt pour
   * intervenir avant que le sujet ne devienne un incident (#3413 : « Laura
   * doit intervenir avant les dates critiques, pas après »), assez large
   * pour survivre à un run manqué. `requires: ['ats']` reprend la
   * convention de `mission_rex_reminder` : la mission elle-même vient du
   * staffing, pas d'une capacité propre à cette routine.
   */
  {
    key: 'mission_checkin_j7_reminder',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Une mission a démarré depuis sept à vingt-et-un jours et aucun point client ni consultant n’a encore été déposé.',
      en: 'An assignment started seven to twenty-one days ago and no client or consultant check-in has been logged yet.',
    },
    reads: {
      fr: 'Les missions actives de l’espace et le double pouls de satisfaction déjà recueilli.',
      en: 'The workspace’s active assignments and the satisfaction check-ins already collected.',
    },
    fallback: {
      fr: 'Le point ne se fabrique jamais : sans une entrée déposée par un humain, la mission reste listée « en attente », jamais complétée à sa place.',
      en: 'The check-in is never invented: without an entry logged by a human, the assignment stays listed as pending, never completed on their behalf.',
    },
    acceptance: {
      fr: 'Une notification quand au moins une mission entre sept et vingt-et-un jours après son démarrage attend encore son premier point.',
      en: 'A notification when at least one assignment, seven to twenty-one days into its start, still awaits its first check-in.',
    },
    name: { fr: 'Points à sept jours en attente', en: 'Pending seven-day check-ins' },
    description: {
      fr: 'Les missions démarrées depuis sept à vingt-et-un jours dont le premier point client/consultant n’a pas encore été déposé.',
      en: 'Assignments started seven to twenty-one days ago whose first client/consultant check-in has not been logged yet.',
    },
    outcome: {
      fr: 'Une notification listant les missions dont le point à sept jours manque, la plus ancienne d’abord.',
      en: 'A notification listing the assignments missing their seven-day check-in, the oldest first.',
    },
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 2,
    requires: ['ats'],
    defaultChannel: 'in_app',
    defaultEnabled: true,
    example: null,
    // #2398.6/#2398.14 — DEUX sorties possibles, contrairement à
    // `mission_rex_reminder` (aucune borne) : le point déposé, OU la fenêtre
    // de vingt-et-un jours qui se referme sans lui (voir le docblock
    // `Fenêtre 7-21 jours` juste au-dessus) — la mission sort alors de la
    // liste SANS avoir été traitée, jamais un rappel qui s'éternise.
    stopCondition: {
      fr: 'Une mission arrête d’apparaître dès qu’un point est déposé — ou, sans point, au bout de vingt-et-un jours, quand la fenêtre se referme d’elle-même (elle sort alors de la liste sans avoir été traitée).',
      en: 'An assignment stops appearing once a check-in is logged — or, without one, after twenty-one days, once the window closes on its own (it then drops off the list without having been handled).',
    },
    version: 1,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['delivery'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  /**
   * #2398.2 (01/10/2026) — LE VIVIER DORMANT. Ajoutée EN FIN d'énumération
   * (GA-08). Elle lit `consultants.last_contact_at` (l'ancrage de rétention) :
   * « jamais contacté » ne remonte pas. Elle NOTIFIE ; le message, lui, reste
   * écrit et envoyé par le recruteur.
   */
  {
    key: 'dormant_pool_resurface',
    stopCondition: {
      fr: 'Un candidat arrête d’apparaître dès qu’il est recontacté ou archivé — sans nouveau contact, il reste listé chaque semaine tant que la routine est active.',
      en: 'A candidate stops appearing as soon as they are contacted again or archived — without new contact, they stay listed every week while the routine is active.',
    },
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Un candidat du vivier n’a pas été contacté depuis plus de quatre-vingt-dix jours.',
      en: 'A pool candidate has not been contacted for more than ninety days.',
    },
    reads: {
      fr: 'Les candidats actifs de l’espace et la date de leur dernier contact.',
      en: 'The workspace’s active candidates and the date of their last contact.',
    },
    fallback: {
      fr: 'Un candidat jamais contacté n’est jamais dit dormant ; si la lecture échoue, la routine le dit au lieu d’annoncer un vivier à jour.',
      en: 'A never-contacted candidate is never called dormant; if the read fails, the routine says so instead of reporting an up-to-date pool.',
    },
    acceptance: {
      fr: 'Une notification quand au moins un candidat est sans contact depuis plus de quatre-vingt-dix jours.',
      en: 'A notification when at least one candidate has had no contact for over ninety days.',
    },
    name: { fr: 'Vivier dormant', en: 'Dormant pool' },
    description: {
      fr: 'Les candidats du vivier sans contact depuis plus de quatre-vingt-dix jours, à recontacter ou à archiver.',
      en: 'Pool candidates with no contact for over ninety days, to re-engage or archive.',
    },
    outcome: {
      fr: 'Une notification listant les candidats dormants, le plus ancien d’abord. Aucun message n’est envoyé.',
      en: 'A notification listing dormant candidates, oldest first. No message is sent.',
    },
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 4,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: true,
    example: null,
    version: 2,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['recruiter'],
    workspaceProfiles: ['staffing'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  /**
   * #2916 (#2399.2, LAU-FINAL-113) — « Signaler un compte sans prochaine
   * action », l'une des vingt automatisations initiales du rapport source
   * (`gh issue view 2399`). MODÈLE : désactivée par défaut (`defaultEnabled:
   * false`), comme demandé pour les automatisations manquantes de la
   * bibliothèque — la navigation/le parcours complet restent #2399.1/#2399.5,
   * hors périmètre de ce lot. Elle ne recalcule RIEN : même prédicat que le
   * compteur de tête du portefeuille et la ligne Qualité des données
   * (`ACCOUNT_HYGIENE_PREDICATES.noUpcomingTask`, interpolé directement via
   * `accountsWithoutNextActionCountSql` — `accounts/account-hygiene.sql.ts`,
   * #3851/GA-07 — GA-26 : un calcul, trois lectures).
   */
  {
    key: 'accounts_without_next_action',
    stopCondition: {
      fr: 'Un compte arrête d’apparaître dès qu’une tâche ouverte à échéance lui est posée — sans action nouvelle, il reste listé chaque semaine tant que la routine est active.',
      en: 'An account stops appearing as soon as an open task due is set on it — without a new action, it stays listed every week while the routine stays active.',
    },
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Un compte suivi n’a aucune tâche ouverte à échéance.',
      en: 'A followed account has no open task due.',
    },
    reads: {
      fr: 'Tes comptes suivis et leurs tâches ouvertes à échéance — la même lecture que la ligne Qualité des données.',
      en: 'Your followed accounts and their open tasks due — the same read as the Data quality line.',
    },
    fallback: {
      fr: 'Une lecture en échec se dit « non lu » ; elle n’annonce jamais un portefeuille propre faute de savoir.',
      en: 'A failed read says "not read"; it never reports a clean portfolio for lack of knowing.',
    },
    acceptance: {
      fr: 'Une notification hebdomadaire quand au moins un compte suivi n’a aucune tâche ouverte à échéance.',
      en: 'A weekly notification when at least one followed account has no open task due.',
    },
    name: { fr: 'Comptes sans prochaine action', en: 'Accounts without a next action' },
    description: {
      fr: 'Les comptes que tu suis, sans la moindre tâche ouverte à échéance — même lecture que la ligne Qualité des données.',
      en: 'The accounts you follow, without a single open task due — the same read as the Data quality line.',
    },
    outcome: {
      fr: 'Une notification hebdomadaire avec le nombre de comptes concernés, qui ouvre le portefeuille.',
      en: 'A weekly notification with the number of accounts concerned, opening the portfolio.',
    },
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 3,
    requires: ['accounts'],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: null,
    version: 1,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  /**
   * #2916 (#2399.2, LAU-FINAL-113) — « MATCHER UN BESOIN ENTRANT ».
   *
   * DÉCISION LOUIS 11/10/2026 (`c93_matching_auto_besoin_entrant`) : la SEULE
   * routine du catalogue qui ÉCRIT un objet métier sans geste humain — un
   * `MatchRun` à chaque besoin qui entre. Renversement daté de « les routines
   * préparent ou notifient, aucune n'écrit », pour elle seule. Rien ne sort :
   * aucun e-mail, aucun message, aucun positionnement, aucune shortlist.
   *
   * Elle ne tourne PAS au balayage horaire : son déclencheur est l'ARRIVÉE du
   * besoin (`NeedArrivalSubscriber` → `AutoNeedMatchingService`), d'où
   * `continuous` (attachée à un OBJET) et un exécuteur de balayage qui se tait.
   * Désactivée par défaut : écrire sans geste humain s'allume par un geste.
   * Ajoutée EN FIN d'énumération (GA-08).
   */
  {
    key: 'incoming_need_matching',
    automationLevel: 'n4_bounded_auto',
    condition: {
      fr: 'Un besoin entre dans l’espace — saisi, importé, tiré d’un compte-rendu, d’un appel d’offres ou créé avec Laura — et porte au moins une compétence.',
      en: 'A need enters the workspace — typed in, imported, taken from meeting notes or a tender, or created with Laura — and carries at least one skill.',
    },
    reads: {
      fr: 'Les critères du besoin, le vivier de l’espace et la pondération de matching de l’espace — la même lecture que le bouton « Lancer le matching ».',
      en: 'The need’s criteria, the workspace’s talent pool and its matching weights — the same read as the “Run matching” button.',
    },
    fallback: {
      fr: 'Sans compétence saisie, ou au-delà du plafond quotidien de l’espace, rien n’est lancé et la fiche besoin le dit ; un délai dépassé reste « issue inconnue », jamais un échec inventé.',
      en: 'Without a skill, or beyond the workspace’s daily cap, nothing runs and the need page says so; a timeout stays “outcome unknown”, never an invented failure.',
    },
    acceptance: {
      fr: 'Créer un besoin avec une compétence : sa fiche affiche « Matching lancé automatiquement » et son résultat, sans aucun clic.',
      en: 'Create a need with a skill: its page shows “Matching run automatically” and its result, without a single click.',
    },
    name: { fr: 'Matcher un besoin entrant', en: 'Match an incoming need' },
    description: {
      fr: 'À chaque nouveau besoin, le matching contre ton vivier est lancé et enregistré automatiquement. Rien n’est envoyé à personne.',
      en: 'For every new need, matching against your talent pool is run and recorded automatically. Nothing is sent to anyone.',
    },
    outcome: {
      fr: 'Un matching enregistré sur la fiche du besoin, marqué « lancé automatiquement » — aucun crédit, aucun message envoyé.',
      en: 'A matching recorded on the need’s page, marked “run automatically” — no credits, no message sent.',
    },
    cadence: 'continuous',
    defaultHour: 9,
    defaultWeekday: null,
    // Le vivier est interne : aucun connecteur requis.
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: {
      fr: 'Lundi 10 h : un besoin « Ingénieur Kubernetes » arrive par import — sa fiche montre aussitôt « Matching lancé automatiquement : 3 profils recommandés, 2 à la marge ».',
      en: 'Monday 10 AM: a “Kubernetes engineer” need arrives by import — its page immediately shows “Matching run automatically: 3 recommended profiles, 2 borderline”.',
    },
    stopCondition: {
      fr: 'Un besoin n’est matché automatiquement qu’UNE fois, à son arrivée ; le relancer reste ton geste. Désactiver la routine arrête la suite, sans toucher aux matchings déjà enregistrés.',
      en: 'A need is matched automatically only ONCE, on arrival; running it again stays your call. Disabling the routine stops what comes next, without touching recorded matchings.',
    },
    version: 1,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['recruiter', 'commercial'],
    workspaceProfiles: ['staffing'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'deal_close_date_soon',
    stopCondition: {
      fr: 'Une affaire quitte la liste dès que sa date de clôture est repoussée au-delà de quatorze jours, ou qu’elle est gagnée, perdue ou mise en sommeil. Rien n’est modifié par la routine.',
      en: 'A deal leaves the list as soon as its close date is pushed beyond fourteen days, or it is won, lost or put to sleep. The routine changes nothing.',
    },
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Une affaire ouverte a une date de clôture prévue dans les quatorze prochains jours.',
      en: 'An open deal has an expected close date within the next fourteen days.',
    },
    reads: {
      fr: 'Les affaires ouvertes de ton espace et leur date de clôture prévue — la même colonne que le prévisionnel.',
      en: 'The open deals of your workspace and their expected close date — the same column as the forecast.',
    },
    fallback: {
      fr: 'Une lecture en échec se dit « non lue » ; elle n’annonce jamais un pipeline sain faute de savoir.',
      en: 'A failed read says "not read"; it never reports a healthy pipeline for lack of knowing.',
    },
    acceptance: {
      fr: 'Une notification hebdomadaire nommant l’affaire la plus proche et le nombre de jours restants.',
      en: 'A weekly notification naming the closest deal and the days left.',
    },
    name: { fr: 'Échéance de décision proche', en: 'Decision date coming up' },
    description: {
      fr: 'Les affaires ouvertes dont la date de clôture prévue tombe dans les quatorze jours.',
      en: 'Open deals whose expected close date falls within fourteen days.',
    },
    outcome: {
      fr: 'Une notification hebdomadaire qui ouvre les projets, avec l’échéance la plus proche nommée.',
      en: 'A weekly notification opening the projects, naming the closest date.',
    },
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 1,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: {
      fr: 'Lundi 9 h : « Migration cloud — Direction des risques : clôture prévue dans 6 jours ».',
      en: 'Monday 9 AM: "Cloud migration — Risk department: expected to close in 6 days".',
    },
    version: 1,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'deal_close_date_overdue',
    stopCondition: {
      fr: 'Une affaire quitte la liste dès qu’une nouvelle date lui est donnée ou qu’elle est gagnée, perdue ou mise en sommeil. Rien n’est modifié par la routine.',
      en: 'A deal leaves the list as soon as it gets a new date or is won, lost or put to sleep. The routine changes nothing.',
    },
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Une affaire ouverte a une date de clôture prévue dans le passé.',
      en: 'An open deal has an expected close date in the past.',
    },
    reads: {
      fr: 'Les affaires ouvertes de ton espace et leur date de clôture prévue.',
      en: 'The open deals of your workspace and their expected close date.',
    },
    fallback: {
      fr: 'Une lecture en échec se dit « non lue » ; elle n’annonce jamais un pipeline sain faute de savoir.',
      en: 'A failed read says "not read"; it never reports a healthy pipeline for lack of knowing.',
    },
    acceptance: {
      fr: 'Une notification hebdomadaire nommant l’affaire la plus en retard et son retard en jours.',
      en: 'A weekly notification naming the most overdue deal and its delay in days.',
    },
    name: { fr: 'Date de clôture dépassée', en: 'Close date passed' },
    description: {
      fr: 'Les affaires toujours ouvertes dont la date de clôture prévue est dépassée.',
      en: 'Deals still open whose expected close date has passed.',
    },
    outcome: {
      fr: 'Une notification hebdomadaire qui ouvre les projets, avec l’affaire la plus en retard nommée.',
      en: 'A weekly notification opening the projects, naming the most overdue deal.',
    },
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 1,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: {
      fr: 'Lundi 9 h : « Renouvellement support N3 : clôture prévue il y a 12 jours, toujours ouverte ».',
      en: 'Monday 9 AM: "N3 support renewal: expected to close 12 days ago, still open".',
    },
    version: 1,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'deal_without_close_date',
    stopCondition: {
      fr: 'Une affaire quitte la liste dès qu’une date de clôture prévue lui est posée. La routine n’en invente jamais une.',
      en: 'A deal leaves the list as soon as an expected close date is set. The routine never makes one up.',
    },
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Une affaire proche de signer (profils présentés ou négociation) n’a aucune date de clôture prévue.',
      en: 'A deal close to signing (profiles submitted or negotiation) has no expected close date.',
    },
    reads: {
      fr: 'Les affaires de ton espace au stade profils présentés ou négociation, et leur date de clôture prévue.',
      en: 'The deals of your workspace at the profiles-submitted or negotiation stage, and their expected close date.',
    },
    fallback: {
      fr: 'Une lecture en échec se dit « non lue » ; elle n’annonce jamais un pipeline sain faute de savoir.',
      en: 'A failed read says "not read"; it never reports a healthy pipeline for lack of knowing.',
    },
    acceptance: {
      fr: 'Une notification hebdomadaire avec le nombre d’affaires sans date, qui ouvre les projets.',
      en: 'A weekly notification with the number of deals without a date, opening the projects.',
    },
    name: { fr: 'Négociation sans date de clôture', en: 'Negotiation without a close date' },
    description: {
      fr: 'Les affaires au stade profils présentés ou négociation, sans date de clôture prévue.',
      en: 'Deals at the profiles-submitted or negotiation stage, with no expected close date.',
    },
    outcome: {
      fr: 'Une notification hebdomadaire qui ouvre les projets, avec le nombre d’affaires sans date de clôture.',
      en: 'A weekly notification opening the projects, with the number of deals without a close date.',
    },
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 1,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: {
      fr: 'Lundi 9 h : « 2 affaires en négociation n’ont pas de date de clôture prévue ».',
      en: 'Monday 9 AM: "2 deals in negotiation have no expected close date".',
    },
    version: 1,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['manager', 'commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'won_deal_expansion',
    stopCondition: {
      fr: 'Un compte quitte la liste dès qu’une affaire y est ouverte, ou six mois après la victoire. La routine ne crée aucune affaire et n’écrit à personne.',
      en: 'An account leaves the list as soon as a deal is opened on it, or six months after the win. The routine creates no deal and writes to no one.',
    },
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Une affaire a été gagnée il y a deux à six mois et le compte n’a aucune autre affaire ouverte.',
      en: 'A deal was won two to six months ago and the account has no other open deal.',
    },
    reads: {
      fr: 'Les affaires gagnées de ton espace (date de clôture) et les affaires ouvertes du même compte.',
      en: 'The won deals of your workspace (close date) and the open deals of the same account.',
    },
    fallback: {
      fr: 'Une lecture en échec se dit « non lue » ; elle n’annonce jamais un pipeline sain faute de savoir.',
      en: 'A failed read says "not read"; it never reports a healthy pipeline for lack of knowing.',
    },
    acceptance: {
      fr: 'Une notification hebdomadaire nommant le compte et le délai depuis la victoire.',
      en: 'A weekly notification naming the account and the time since the win.',
    },
    name: { fr: 'Affaire gagnée : ouvrir la suite', en: 'Won deal: open the next one' },
    description: {
      fr: 'Les comptes où une affaire a été gagnée il y a deux à six mois et où rien d’autre n’est ouvert.',
      en: 'Accounts where a deal was won two to six months ago and nothing else is open.',
    },
    outcome: {
      fr: 'Une notification hebdomadaire qui ouvre les comptes, avec le compte gagné le plus ancien nommé.',
      en: 'A weekly notification opening the accounts, naming the oldest won account.',
    },
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 1,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: {
      fr: 'Lundi 9 h : « Société Générale : affaire gagnée il y a 74 jours, aucune autre en cours — la suite se prépare ».',
      en: 'Monday 9 AM: "Société Générale: deal won 74 days ago, nothing else open — time to prepare the next one".',
    },
    version: 1,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  {
    key: 'lost_deal_revisit',
    stopCondition: {
      fr: 'Un compte quitte la liste dès qu’une affaire y est ouverte, ou huit mois après la perte. Un motif jamais déclaré reste non renseigné. La routine n’écrit à personne.',
      en: 'An account leaves the list as soon as a deal is opened on it, or eight months after the loss. A reason never declared stays unfilled. The routine writes to no one.',
    },
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Une affaire a été perdue il y a six à huit mois et le compte n’a aucune affaire ouverte.',
      en: 'A deal was lost six to eight months ago and the account has no open deal.',
    },
    reads: {
      fr: 'Les affaires perdues de ton espace (date de clôture, motif déclaré) et les affaires ouvertes du même compte.',
      en: 'The lost deals of your workspace (close date, declared reason) and the open deals of the same account.',
    },
    fallback: {
      fr: 'Une lecture en échec se dit « non lue » ; elle n’annonce jamais un pipeline sain faute de savoir.',
      en: 'A failed read says "not read"; it never reports a healthy pipeline for lack of knowing.',
    },
    acceptance: {
      fr: 'Une notification hebdomadaire nommant le compte, l’ancienneté de la perte et le motif quand il est déclaré.',
      en: 'A weekly notification naming the account, how long ago it was lost and the reason when declared.',
    },
    name: { fr: 'Affaire perdue : revenir au bon moment', en: 'Lost deal: come back at the right time' },
    description: {
      fr: 'Les comptes où une affaire a été perdue il y a six à huit mois et où rien n’est ouvert.',
      en: 'Accounts where a deal was lost six to eight months ago and nothing is open.',
    },
    outcome: {
      fr: 'Une notification hebdomadaire qui ouvre les comptes, avec le compte concerné et le motif déclaré nommés.',
      en: 'A weekly notification opening the accounts, naming the account and the declared reason.',
    },
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 1,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: {
      fr: 'Lundi 9 h : « Airbus : affaire perdue il y a 190 jours (motif : budget gelé) — le moment de reprendre contact ».',
      en: 'Monday 9 AM: "Airbus: deal lost 190 days ago (reason: budget frozen) — time to get back in touch".',
    },
    version: 1,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  // #2843.1-.6 / #2102.45 (lot L13) — N1 par défaut pour une NOUVELLE routine (#2843.25), éteinte.
  {
    key: 'interview_upcoming',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Au moins un entretien est prévu dans les 48 heures et son issue est « en attente ».',
      en: "At least one interview is scheduled within 48 hours and its outcome is 'pending'.",
    },
    reads: {
      fr: 'Les entretiens de l’espace, leur date et la candidature liée.',
      en: 'The workspace interviews, their date and the linked application.',
    },
    fallback: {
      fr: 'Une lecture en échec se dit « non mesurée » ; elle n’annonce jamais une journée sans entretien.',
      en: "A failed read says 'not measured'; it never reports a day without interviews.",
    },
    acceptance: {
      fr: 'Une notification les jours ouvrés quand un entretien approche ; aucune sinon.',
      en: 'A weekday notification when an interview is coming up; none otherwise.',
    },
    name: { fr: 'Entretiens des 48 heures', en: 'Interviews in the next 48 hours' },
    description: {
      fr: 'Les entretiens candidats prévus dans les deux jours, dont l’issue n’est pas encore posée.',
      en: 'Candidate interviews scheduled within two days whose outcome is not set yet.',
    },
    outcome: {
      fr: 'Une notification qui ouvre la candidature du prochain entretien.',
      en: 'A notification opening the application of the next interview.',
    },
    cadence: 'weekdays',
    defaultHour: 8,
    defaultWeekday: null,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: {
      fr: 'Mardi 8 h : « 2 entretiens à préparer — le prochain : Ada Lovelace ».',
      en: "Tuesday 8 AM: '2 interviews to prepare — next: Ada Lovelace'.",
    },
    stopCondition: {
      fr: 'Un entretien sort de la liste dès que son issue est posée, ou une fois son heure passée.',
      en: 'An interview leaves the list as soon as its outcome is set, or once its time has passed.',
    },
    version: 1,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['recruiter'],
    workspaceProfiles: ['staffing'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  // #2843.1-.6 / #2102.45 (lot L13) — N1 par défaut pour une NOUVELLE routine (#2843.25), éteinte.
  {
    key: 'interview_feedback_missing',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Un entretien a eu lieu il y a plus d’un jour et ni son issue ni un retour client n’est consigné.',
      en: 'An interview took place over a day ago and neither its outcome nor client feedback is recorded.',
    },
    reads: {
      fr: 'Les entretiens de l’espace et les retours client consignés sur la candidature.',
      en: 'The workspace interviews and the client feedback recorded on the application.',
    },
    fallback: {
      fr: 'Une lecture en échec se dit « non mesurée » ; un retour n’est jamais supposé reçu.',
      en: "A failed read says 'not measured'; feedback is never assumed received.",
    },
    acceptance: {
      fr: 'Une notification les jours ouvrés nommant le candidat au retour manquant le plus ancien.',
      en: 'A weekday notification naming the candidate with the oldest missing feedback.',
    },
    name: { fr: 'Retours d’entretien à recueillir', en: 'Interview feedback to collect' },
    description: {
      fr: 'Les entretiens passés depuis un à trente jours sans issue posée ni retour client consigné.',
      en: 'Interviews held one to thirty days ago with no outcome set and no client feedback recorded.',
    },
    outcome: {
      fr: 'Une notification qui ouvre la candidature au retour manquant le plus ancien.',
      en: 'A notification opening the application with the oldest missing feedback.',
    },
    cadence: 'weekdays',
    defaultHour: 10,
    defaultWeekday: null,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: {
      fr: 'Jeudi 10 h : « 3 retours d’entretien à recueillir — le plus ancien : Alan Turing (6 j) ».',
      en: "Thursday 10 AM: '3 interview feedbacks to collect — oldest: Alan Turing (6 d)'.",
    },
    stopCondition: {
      fr: 'Un entretien sort de la liste dès que son issue ou un retour client est consigné, ou trente jours après.',
      en: 'An interview leaves the list once its outcome or client feedback is recorded, or after thirty days.',
    },
    version: 1,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['recruiter'],
    workspaceProfiles: ['staffing'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  // #2843.1-.6 / #2102.45 (lot L13) — N1 par défaut pour une NOUVELLE routine (#2843.25), éteinte.
  {
    key: 'team_mission_risks',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Une mission en démarrage ou en cours a au moins une affectation avec un risque déclaré.',
      en: 'An onboarding or ongoing assignment has at least one staffing record with a declared risk.',
    },
    reads: {
      fr: 'Les missions de l’espace (hors missions privées) et les risques déclarés sur leurs affectations.',
      en: 'The workspace assignments (private ones excluded) and the risks declared on their staffing records.',
    },
    fallback: {
      fr: 'Une lecture en échec se dit « non mesurée » ; un risque n’est jamais déduit, seul un risque déclaré compte.',
      en: "A failed read says 'not measured'; a risk is never inferred, only a declared risk counts.",
    },
    acceptance: {
      fr: 'Une notification le lundi quand au moins une mission porte un risque déclaré.',
      en: 'A Monday notification when at least one assignment carries a declared risk.',
    },
    name: { fr: 'Risques déclarés sur les missions', en: 'Declared risks on assignments' },
    description: {
      fr: 'Les missions en cours dont une affectation porte un risque déclaré par l’équipe.',
      en: 'Ongoing assignments where a staffing record carries a risk declared by the team.',
    },
    outcome: {
      fr: 'Une notification hebdomadaire qui ouvre la première mission concernée.',
      en: 'A weekly notification opening the first assignment concerned.',
    },
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 1,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: {
      fr: 'Lundi 9 h : « 2 missions avec un risque déclaré — à regarder d’abord : Refonte SI (Grace Hopper) ».',
      en: "Monday 9 AM: '2 assignments with a declared risk — look first at: IS overhaul (Grace Hopper)'.",
    },
    stopCondition: {
      fr: 'Une mission sort de la liste dès que le risque est effacé de l’affectation ou que la mission se termine.',
      en: 'An assignment leaves the list once the risk is cleared from the staffing record or the assignment ends.',
    },
    version: 1,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['manager', 'delivery'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  // #2843.1-.6 / #2102.45 (lot L13) — N1 par défaut pour une NOUVELLE routine (#2843.25), éteinte.
  {
    key: 'blocked_needs',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Un besoin est ouvert depuis plus de vingt-et-un jours sans mouvement de statut ni de candidature.',
      en: 'A need has been open for over twenty-one days with no status or application movement.',
    },
    reads: {
      fr: 'Les besoins de l’espace (hors besoins privés), leur statut et les candidatures liées.',
      en: 'The workspace needs (private ones excluded), their status and the linked applications.',
    },
    fallback: {
      fr: 'Une lecture en échec se dit « non mesurée » ; elle n’annonce jamais un pipeline sain faute de savoir.',
      en: "A failed read says 'not measured'; it never reports a healthy pipeline for lack of knowing.",
    },
    acceptance: {
      fr: 'Une notification le lundi nommant le besoin bloqué le plus ancien et son ancienneté.',
      en: 'A Monday notification naming the oldest stuck need and its age.',
    },
    name: { fr: 'Besoins bloqués', en: 'Stuck needs' },
    description: {
      fr: 'Les besoins ouverts sans changement de statut ni candidature depuis vingt-et-un jours.',
      en: 'Open needs with no status change and no application for twenty-one days.',
    },
    outcome: {
      fr: 'Une notification hebdomadaire qui ouvre le besoin bloqué le plus ancien.',
      en: 'A weekly notification opening the oldest stuck need.',
    },
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 1,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: {
      fr: 'Lundi 9 h : « 2 besoins bloqués — le plus ancien : Data engineer Airbus (34 j) ».',
      en: "Monday 9 AM: '2 stuck needs — oldest: Airbus data engineer (34 d)'.",
    },
    stopCondition: {
      fr: 'Un besoin sort de la liste dès qu’il change de statut ou qu’une candidature y avance.',
      en: 'A need leaves the list as soon as its status changes or an application moves on it.',
    },
    version: 1,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['manager'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  // #2843.1-.6 / #2102.45 (lot L13) — N1 par défaut pour une NOUVELLE routine (#2843.25), éteinte.
  {
    key: 'mission_documents_pending',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Une pièce de mission est en brouillon, envoyée ou en attente depuis plus de sept jours.',
      en: 'An assignment document has been draft, sent or pending for over seven days.',
    },
    reads: {
      fr: 'Les pièces des missions de l’espace (hors missions privées) et leur statut.',
      en: 'The documents of the workspace assignments (private ones excluded) and their status.',
    },
    fallback: {
      fr: 'Une lecture en échec se dit « non mesurée » ; une pièce n’est jamais supposée signée.',
      en: "A failed read says 'not measured'; a document is never assumed signed.",
    },
    acceptance: {
      fr: 'Une notification les jours ouvrés nommant la pièce la plus ancienne et sa mission.',
      en: 'A weekday notification naming the oldest document and its assignment.',
    },
    name: { fr: 'Pièces de mission en attente', en: 'Pending assignment documents' },
    description: {
      fr: 'Les contrats, avenants et accords de confidentialité non signés depuis sept jours sur les missions en cours.',
      en: 'Contracts, amendments and NDAs unsigned for seven days on ongoing assignments.',
    },
    outcome: {
      fr: 'Une notification qui ouvre la mission de la pièce la plus ancienne.',
      en: 'A notification opening the assignment of the oldest document.',
    },
    cadence: 'weekdays',
    defaultHour: 9,
    defaultWeekday: null,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: {
      fr: 'Mercredi 9 h : « 1 pièce de mission en attente — Avenant n°2 — Refonte SI (12 j) ».',
      en: "Wednesday 9 AM: '1 pending assignment document — Amendment no. 2 — IS overhaul (12 d)'.",
    },
    stopCondition: {
      fr: 'Une pièce sort de la liste dès qu’elle est signée ou refusée, ou quand la mission se termine.',
      en: 'A document leaves the list once it is signed or refused, or when the assignment ends.',
    },
    version: 1,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['adv'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  // #2843.1-.6 / #2102.45 (lot L13) — N1 par défaut pour une NOUVELLE routine (#2843.25), éteinte.
  {
    key: 'mission_start_deadlines',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Une mission en démarrage commence dans les quatorze jours et aucun contrat signé n’y est consigné.',
      en: 'An onboarding assignment starts within fourteen days and no signed contract is recorded on it.',
    },
    reads: {
      fr: 'Les missions en démarrage de l’espace (hors missions privées), leur date de début et leurs pièces.',
      en: 'The workspace onboarding assignments (private ones excluded), their start date and their documents.',
    },
    fallback: {
      fr: 'Une mission SANS date de début n’alerte jamais : on ne devine pas une échéance.',
      en: 'An assignment with NO start date never alerts: a deadline is never guessed.',
    },
    acceptance: {
      fr: 'Une notification les jours ouvrés nommant le démarrage le plus proche.',
      en: 'A weekday notification naming the closest start.',
    },
    name: { fr: 'Démarrages sans contrat signé', en: 'Starts without a signed contract' },
    description: {
      fr: 'Les missions qui démarrent dans les quatorze jours sans contrat signé consigné.',
      en: 'Assignments starting within fourteen days with no signed contract recorded.',
    },
    outcome: {
      fr: 'Une notification qui ouvre la mission qui démarre le plus tôt.',
      en: 'A notification opening the assignment starting soonest.',
    },
    cadence: 'weekdays',
    defaultHour: 9,
    defaultWeekday: null,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: {
      fr: 'Lundi 9 h : « 1 démarrage sans contrat signé — le plus proche : Support N2 Orange (5 j) ».',
      en: "Monday 9 AM: '1 start without a signed contract — closest: Orange L2 support (5 d)'.",
    },
    stopCondition: {
      fr: 'Une mission sort de la liste dès qu’un contrat signé y est consigné, ou une fois démarrée.',
      en: 'An assignment leaves the list once a signed contract is recorded, or once it has started.',
    },
    version: 1,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['adv'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  // #2843.1-.6 / #2102.45 (lot L13) — N1 par défaut pour une NOUVELLE routine (#2843.25), éteinte.
  {
    key: 'mission_renewal_to_engage',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Une mission en cours finit dans les quarante-cinq jours et son renouvellement est « non engagé ».',
      en: "An ongoing assignment ends within forty-five days and its renewal is 'not started'.",
    },
    reads: {
      fr: 'Les missions en cours de l’espace (hors missions privées), leur date de fin et leur statut de renouvellement.',
      en: 'The workspace ongoing assignments (private ones excluded), their end date and renewal status.',
    },
    fallback: {
      fr: 'Une mission SANS date de fin n’alerte jamais : on ne devine pas une échéance.',
      en: 'An assignment with NO end date never alerts: a deadline is never guessed.',
    },
    acceptance: {
      fr: 'Une notification le mardi nommant la mission qui finit le plus tôt.',
      en: 'A Tuesday notification naming the assignment ending soonest.',
    },
    name: { fr: 'Renouvellements à engager', en: 'Renewals to start' },
    description: {
      fr: 'Les missions qui finissent dans les quarante-cinq jours sans démarche de renouvellement engagée.',
      en: 'Assignments ending within forty-five days with no renewal step started.',
    },
    outcome: {
      fr: 'Une notification hebdomadaire qui ouvre la mission qui finit le plus tôt.',
      en: 'A weekly notification opening the assignment ending soonest.',
    },
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 2,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: {
      fr: 'Mardi 9 h : « 2 renouvellements à engager — la plus proche : Refonte SI (21 j) ».',
      en: "Tuesday 9 AM: '2 renewals to start — closest: IS overhaul (21 d)'.",
    },
    stopCondition: {
      fr: 'Une mission sort de la liste dès qu’une démarche de renouvellement est engagée, ou à sa fin.',
      en: 'An assignment leaves the list once a renewal step is started, or when it ends.',
    },
    version: 1,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial', 'delivery'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  // #2843.1-.6 / #2102.45 (lot L13) — N1 par défaut pour une NOUVELLE routine (#2843.25), éteinte.
  {
    key: 'consultant_repositioning',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Une affectation finit dans les trente jours et aucune autre n’est prévue ensuite pour ce consultant.',
      en: 'A staffing ends within thirty days and no other one is planned next for this consultant.',
    },
    reads: {
      fr: 'Les affectations des missions de l’espace (hors missions privées) et leurs dates.',
      en: 'The staffing records of the workspace assignments (private ones excluded) and their dates.',
    },
    fallback: {
      fr: 'Une affectation SANS date de fin n’alerte jamais : on ne devine pas une échéance.',
      en: 'A staffing with NO end date never alerts: a deadline is never guessed.',
    },
    acceptance: {
      fr: 'Une notification le mardi nommant le consultant le plus proche de la fin.',
      en: 'A Tuesday notification naming the consultant closest to the end.',
    },
    name: { fr: 'Consultants à repositionner', en: 'Consultants to reposition' },
    description: {
      fr: 'Les consultants dont l’affectation finit dans les trente jours sans suite planifiée.',
      en: 'Consultants whose staffing ends within thirty days with nothing planned next.',
    },
    outcome: {
      fr: 'Une notification hebdomadaire qui ouvre la fiche du consultant le plus proche de la fin.',
      en: 'A weekly notification opening the profile of the consultant closest to the end.',
    },
    cadence: 'weekly',
    defaultHour: 9,
    defaultWeekday: 2,
    requires: [],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: {
      fr: 'Mardi 9 h : « 1 consultant à repositionner — le plus proche : Linus Torvalds (18 j), sans suite planifiée ».',
      en: "Tuesday 9 AM: '1 consultant to reposition — closest: Linus Torvalds (18 d), nothing planned next'.",
    },
    stopCondition: {
      fr: 'Un consultant sort de la liste dès qu’une affectation suivante est planifiée, ou à la fin de la sienne.',
      en: 'A consultant leaves the list once a next staffing is planned, or when theirs ends.',
    },
    version: 1,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['recruiter', 'commercial'],
    workspaceProfiles: ['staffing'],
    scope: 'workspace',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
  // #2843.1-.6 / #2102.45 (lot L13) — N1 par défaut pour une NOUVELLE routine (#2843.25), éteinte.
  {
    key: 'meeting_reminder_t1',
    automationLevel: 'n1_prepare',
    condition: {
      fr: 'Au moins un rendez-vous externe non annulé est prévu demain.',
      en: 'At least one non-cancelled external meeting is scheduled tomorrow.',
    },
    reads: {
      fr: 'Ton agenda connecté, pour la journée du lendemain.',
      en: 'Your connected calendar, for the next day.',
    },
    fallback: {
      fr: 'Sans agenda connecté, la routine ne tourne pas et l’écran le dit.',
      en: 'Without a connected calendar, the routine does not run and the screen says so.',
    },
    acceptance: {
      fr: 'Une notification la veille quand un rendez-vous externe est prévu ; aucune sinon.',
      en: 'A notification the day before when an external meeting is scheduled; none otherwise.',
    },
    name: { fr: 'Rappel la veille d’un rendez-vous', en: 'Reminder the day before a meeting' },
    description: {
      fr: 'La veille, à l’heure que tu choisis, les rendez-vous externes du lendemain à préparer.',
      en: 'The day before, at the time you choose, tomorrow’s external meetings to prepare.',
    },
    outcome: {
      fr: 'Une notification qui ouvre la préparation des rendez-vous du lendemain.',
      en: 'A notification opening the preparation of tomorrow’s meetings.',
    },
    cadence: 'weekdays',
    defaultHour: 17,
    defaultWeekday: null,
    requires: ['agenda_read'],
    defaultChannel: 'in_app',
    defaultEnabled: false,
    example: {
      fr: 'Lundi 17 h : « 2 rendez-vous demain — Point Acme · Démo Orange — la préparation t’attend ».',
      en: "Monday 5 PM: '2 meetings tomorrow — Acme sync · Orange demo — preparation is waiting'.",
    },
    stopCondition: {
      fr: 'Un seul rappel par jour : le lendemain, il est recalculé sur l’agenda réel, rien ne se reporte.',
      en: 'One reminder per day: the next day it is recomputed on the actual calendar, nothing carries over.',
    },
    version: 1,
    // #2843.7 / #2843.29 — rôle(s) et profils d'espace règlent l'ORDRE, jamais la présence (c76).
    roles: ['commercial'],
    workspaceProfiles: ['staffing', 'forfait_conseil'],
    scope: 'personal',
    steps: ['read', 'check_condition', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  },
] as const

export function findRoutine(key: string): RoutineDefinition | undefined {
  return ROUTINE_CATALOG.find(routine => routine.key === key)
}

export const ROUTINE_KEYS: readonly RoutineKey[] = ROUTINE_CATALOG.map(routine => routine.key)
