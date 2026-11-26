import { z } from 'zod'
import { workspaceProfileSchema } from './workspace-profile.js'

/**
 * LES ROUTINES — les automatisations programmées que l'utilisateur VOIT.
 *
 * Les méta-analyses besoins (03/08/2026) listent 25 déclencheurs et posent une
 * exigence qui n'est pas décorative : « une automatisation programmée doit être
 * visible, modifiable, désactivable et attribuée à un utilisateur ; la mémoire
 * des routines doit être persistante, mais jamais opaque ».
 *
 * Le dépôt avait onze `@Cron` en dur. Ils tournent, ils envoient, et aucun
 * utilisateur ne peut savoir lesquels sont actifs, ni à quelle heure, ni les
 * arrêter. C'est exactement l'opacité que le rapport refuse — et c'est aussi la
 * façon la plus sûre de faire fuir quelqu'un qui reçoit une notification qu'il
 * n'a pas demandée.
 *
 * Deux principes portent ce contrat.
 *
 * 1. **Le catalogue vit dans le CODE**, comme celui des workflows. Une routine
 *    éditable en base serait un chemin d'exécution non relu : quelqu'un
 *    pourrait ajouter « envoyer un mail à tout le monde à 3 h » sans qu'aucun
 *    test ne le voie passer. La base ne porte que l'ABONNEMENT — actif ou non,
 *    à quelle heure, sur quel canal.
 * 2. **Une routine déclare ce dont elle a besoin.** Sans agenda connecté, la
 *    routine « brief du matin » ne peut pas tenir sa promesse : elle le dit à
 *    l'écran au lieu de s'exécuter à vide tous les matins.
 */

/**
 * Les routines livrées. La liste est volontairement plus courte que les 25
 * déclencheurs du rapport : n'y figure que ce que les connecteurs actuels
 * savent RÉELLEMENT faire. Une routine annoncée mais inexécutable est une
 * promesse que le produit ne tient pas — le reste arrive avec son lot.
 */
export const routineKeySchema = z.enum([
  /** Brief du matin : agenda, relances, réponses favorables, comptes qui ont bougé. */
  'daily_briefing',
  /** Rendez-vous externes des prochaines 24 h à préparer. */
  'meeting_prep',
  /** Fils sortants restés sans réponse au-delà du seuil. */
  'no_reply_follow_up',
  /** Réponses entrantes qui ressemblent à un accord. */
  'positive_replies',
  /** Chevauchements d'agenda détectés. */
  'agenda_conflicts',
  /** Aucun rendez-vous client dans les trois jours qui viennent. */
  'empty_pipeline_alert',
  /** Récapitulatif de fin de semaine. */
  'weekly_recap',
  /** Planning de la semaine à venir : rendez-vous, plages vides. */
  'weekly_forecast',
  /** Missions qui se terminent dans les trente jours (§5.4, déclencheur n°13). */
  'mission_ending',
  /** Consultants sans mission depuis plus de trente jours (déclencheur n°14). */
  'bench_alert',
  /** Contacts CRM sans activité depuis trop longtemps (déclencheur n°15). */
  'crm_followups',
  /** Rendez-vous client dans l'heure : contexte et objectif (n°3). */
  'meeting_checklist',
  /** Rendez-vous terminé : note CRM, tâche de suivi, récapitulatif (n°4). */
  'meeting_followup',
  /** Rendez-vous annulé : créneaux de remplacement (n°5). */
  'meeting_cancelled',
  /** Appels d'offres reçus et leurs échéances (n°10). */
  'tender_watch',
  /** Contrats et signatures en attente (n°11). */
  'contract_watch',
  /** Factures en souffrance (n°12). */
  'invoice_watch',
  /** Propositions sans suite depuis sept jours (n°16). */
  'stalled_proposals',
  /** Doublons du CRM (n°17). */
  'crm_duplicates',
  /** CV reçus en pièce jointe, indexés dans la base de connaissance (n°18). */
  'cv_intake',
  /** Lundi matin : la semaine qui commence (n°23). */
  'monday_kickstart',
  /** Hygiène mensuelle du CRM (n°24). */
  'crm_hygiene',
  /** Revue trimestrielle (n°25). */
  'quarterly_review',
  /**
   * Relevés d'activité manquants sur le mois clos (PDF 5 §7).
   *
   * Le déclencheur le plus coûteux du module : un mois sans relevé ne se
   * signale nulle part, et il passe. Ajouté EN FIN d'énumération (GA-08).
   */
  'timesheet_chase',
  /** Ce qui empêche de facturer le mois clos, le 5 (PDF 5 §8). */
  'invoice_readiness',
  /** Les missions dont la marge passe sous le seuil de l'espace (PDF 5 §9). */
  'margin_alert',
  /**
   * Le test de santé quotidien des connecteurs (PDF 6 §4, famille G).
   *
   * Une capacité qui se dégrade ne se signale nulle part aujourd'hui : le jeton
   * expire, la portée d'écriture est retirée, la synchronisation prend du
   * retard — et l'utilisateur l'apprend au moment où une action échoue, après
   * le clic. Ajoutée EN FIN d'énumération (garde GA-08).
   */
  'connector_health',
  /*
   * Les cinq automatisations CRM du §13 (PDF 2), ajoutées le 21/08 EN FIN
   * d'énumération (garde GA-08).
   *
   * Le chantier du PDF 2 les avait écartées avec une raison qui tenait : « les
   * inscrire sans les brancher produirait des cases à cocher qui ne font
   * rien ». Ce qui a changé n'est pas la règle mais le dépôt — la porte G1, les
   * shortlists, les besoins typés et `stage_entered_at` existent maintenant.
   */
  'stalled_projects',
  'stale_account_plans',
  'needs_without_shortlist',
  'parked_account_signal',
  'contact_job_change',
  /**
   * La surveillance de l'espace documentaire (PDF 3, D17 — décision du 21/08).
   *
   * Elle SIGNALE, elle n'ingère rien : un CV avalé sans que personne le sache
   * créerait des fiches de vivier — avec les données personnelles qui vont
   * avec — sur la seule foi d'un nom de fichier.
   */
  'cv_folder_watch',
  /**
   * Ce qui a bougé sur les territoires suivis (tome 4 §21.3).
   *
   * Elle compare deux PHOTOS déjà prises — elle n'interroge aucune source. Le
   * balayage hebdomadaire qui les prend est un cron du référentiel ESN, et la
   * séparation est volontaire : une source publique en panne doit faire manquer
   * une photo, jamais faire taire une notification sur les treize semaines
   * d'historique déjà accumulées.
   */
  'territory_watch',
  /**
   * La fenêtre de référencement qui se rouvre (tome 1, F08).
   *
   * Neuf, six et trois mois avant la consultation de renouvellement. Un seul
   * rappel « c'est dans trois mois » arriverait quand le cahier des charges est
   * déjà écrit avec le titulaire sortant.
   */
  'referencing_window',
  /**
   * La confirmation d'une disponibilité saisie il y a soixante jours (PDF-02 §3.3).
   *
   * ⚠️ Ajoutée EN FIN d'énumération (GA-08).
   *
   * Le seuil n'est pas neuf : `AVAILABILITY_REVALIDATION_DAYS` vaut 60 depuis
   * le moteur de matching, où une disponibilité plus ancienne coûte déjà dix
   * points de poussabilité et sort en drapeau de correspondance. Ce qui
   * manquait était le RAPPEL — le produit savait qu'une disponibilité était
   * périmée, il pénalisait le profil, et ne le disait à personne.
   *
   * Ce qu'elle ne fait pas, et c'est délibéré : elle ne PROGRAMME rien à la
   * saisie. La date de saisie est déjà écrite (`availability_checked_at`) ;
   * poser en plus une échéance dans une table produirait deux dérivations du
   * même fait, qui divergeraient au premier « annuler ».
   */
  'availability_reconfirm',
  /**
   * #2392.2 — le rappel proactif de la clôture de fin de journée
   * (LAU-FINAL-106), en fin d'après-midi, quand une boucle reste ouverte.
   * Ajoutée EN FIN d'énumération (GA-08).
   */
  'evening_closure_prompt',
  /**
   * #2398.5 (LAU-FINAL-112, MISSION/DELIVERY) — une mission FINIE dont
   * personne n'a encore recueilli le retour d'expérience (« REX »).
   *
   * Elle ne collecte rien : le retour lui-même reste écrit par quelqu'un qui
   * revient de mission (`CapitalisationService.rexForWorkspace`), jamais
   * inventé. Ajoutée EN FIN d'énumération (GA-08).
   */
  'mission_rex_reminder',
  /**
   * #2392.2 — 2 des 5 déclencheurs de la clôture quotidienne encore manquants
   * (lot clôture c1, 26/09) : « fin de semaine » et « avant une revue
   * manager ». Même compilateur EXACT que `evening_closure_prompt`
   * (`BriefingService.dayClosure`, GA-26) — seuls le libellé et le moment
   * changent, jamais une seconde règle de « qu'est-ce qui reste ouvert ».
   * Ajoutées EN FIN d'énumération (GA-08).
   */
  'end_of_week_closure_prompt',
  /**
   * #2392.2 — voir `end_of_week_closure_prompt` ci-dessus. Positionnée juste
   * avant `weekly_recap`/`weekly_forecast` (vendredi, avant 16h) : le moment
   * où la revue manager s'appuie sur ces deux récapitulatifs.
   */
  'pre_manager_review_closure_prompt',
  /**
   * Épopée #2873 (#2367.14, LOT c5 clôture 26/09) — une séquence d'outreach
   * vient de passer `completed` (`OutreachService.stepDone`) : elle SIGNALE
   * qu'une mise à jour CRM se prépare, même patron que `positive_replies` —
   * aucune écriture CRM/ERP ici (doctrine « une écriture CRM/ERP passe par une
   * porte »). Ajoutée EN FIN d'énumération (GA-08).
   */
  'sequence_completed_crm_update',
  /**
   * #3061 / #2374.19 — un « pas maintenant » n'est pas un arrêt : il se met en
   * pause (`not_now_deferred`), et son échéance (`NOT_NOW_REVALIDATION_DAYS`,
   * `notNowRevalidationDue`, outreach-sequence-events.ts) était jusqu'ici
   * lisible SEULEMENT en ouvrant la fiche contact — rien ne la faisait
   * RESSURGIR d'elle-même, ce que l'épopée nomme comme son seul reste après
   * le point d'ancrage. Elle ne reprend RIEN elle-même (aucun envoi, aucune
   * réactivation automatique — la reprise reste `resume()`, un geste humain,
   * #2381.8) : elle NOTIFIE, même patron que `availability_reconfirm`.
   * Ajoutée EN FIN d'énumération (GA-08).
   */
  'not_now_revalidation',
  /**
   * #3413.2 (beta:metier, 30/09/2026) — LE POINT J+7, entre le démarrage
   * d'une mission (`mission_start_readiness.service.ts`) et sa fin
   * (`mission_end.service.ts`) : rien ne rappelait qu'un premier point avec
   * le client et le consultant restait à faire une semaine après le début.
   *
   * Elle ne collecte rien : le point lui-même reste écrit par un humain sur
   * le double pouls de satisfaction déjà existant (`MissionFeedbackService`,
   * #2412) — jamais une note inventée. Ajoutée EN FIN d'énumération (GA-08).
   */
  'mission_checkin_j7_reminder',
  /**
   * #2843 / #2398.2 (01/10/2026) — LE VIVIER DORMANT (routine RECRUTEUR). Un
   * candidat dont le dernier contact date de plus de 90 jours ressurgit : elle
   * NOTIFIE, elle ne contacte personne (Laura prépare, le recruteur écrit).
   * Ajoutée EN FIN d'énumération (GA-08).
   */
  'dormant_pool_resurface',
  /**
   * #2916 (#2399.2, LAU-FINAL-113) — « Signaler un compte sans prochaine
   * action », l'une des vingt automatisations initiales nommées par le
   * rapport source. Elle ne recalcule rien : elle lit le MÊME prédicat que
   * le compteur de tête du portefeuille et la ligne Qualité des données
   * (`ACCOUNT_HYGIENE_PREDICATES.noUpcomingTask`, via `DataHygieneService`,
   * GA-26 — un calcul, trois lectures). MODÈLE désactivé par défaut (la
   * bibliothèque/le parcours comprendre→exemple→simuler→configurer→activer
   * restent #2399.1/#2399.5, hors périmètre de ce lot). Ajoutée EN FIN
   * d'énumération (GA-08).
   */
  'accounts_without_next_action',
  /**
   * #2916 (#2399.2, LAU-FINAL-113) — « Matcher un besoin entrant ». DÉCISION
   * LOUIS 11/10/2026 (`c93_matching_auto_besoin_entrant`) : à chaque besoin
   * qui entre dans l'espace, un `MatchRun` est ÉCRIT sans geste humain —
   * renversement daté de « les routines préparent, aucune n'écrit », pour
   * CETTE routine seulement. Rien ne sort (aucun e-mail, aucun message).
   * Déclenchée par l'ARRIVÉE du besoin (`NeedArrivalSubscriber`), jamais
   * par le balayage horaire. Ajoutée EN FIN d'énumération (GA-08).
   */
  'incoming_need_matching',
  /**
   * #2916 (#2399.2, Louis 15/10/2026 — « tu CHOISIS les 5 automatisations manquantes les plus utiles à un
   * commercial ESN parmi ce que le moteur sait déjà déclencher ») — cinq lectures du pipeline
   * (`opportunities`) que les routines n'exploitaient pas : une échéance proche, une échéance dépassée,
   * une négociation sans date de clôture, une affaire gagnée à prolonger, une affaire perdue à revisiter.
   * Toutes N1 : elles NOTIFIENT, elles n'écrivent rien et n'envoient rien. Désactivées par défaut.
   * Ajoutées EN FIN d'énumération (GA-08).
   */
  'deal_close_date_soon',
  'deal_close_date_overdue',
  'deal_without_close_date',
  'won_deal_expansion',
  'lost_deal_revisit',
  /**
   * #2843.1-.6 / #2102.45 (lot L13, contrat validé par Louis le 31/10/2026) —
   * les routines qui manquaient aux rôles : entretiens et feedbacks
   * (recruteur), risques d'équipe et besoins bloqués (manager), pièces et
   * échéances (ADV), renouvellement et repositionnement, rappel T-1 avant un
   * rendez-vous. Toutes N1 (#2843.25 : niveau 0-1 par défaut pour les
   * NOUVELLES), désactivées par défaut : elles NOTIFIENT, n'écrivent rien et
   * n'envoient rien. Ajoutées EN FIN d'énumération (GA-08).
   */
  'interview_upcoming',
  'interview_feedback_missing',
  'team_mission_risks',
  'blocked_needs',
  'mission_documents_pending',
  'mission_start_deadlines',
  'mission_renewal_to_engage',
  'consultant_repositioning',
  'meeting_reminder_t1',
])
export type RoutineKey = z.infer<typeof routineKeySchema>

/** Ce dont une routine a besoin pour tenir sa promesse. */
export const routineRequirementSchema = z.enum(['mailbox_read', 'agenda_read', 'accounts', 'ats', 'crm'])
export type RoutineRequirement = z.infer<typeof routineRequirementSchema>

/** Par où le résultat arrive. */
export const routineChannelSchema = z.enum(['in_app', 'email'])
export type RoutineChannel = z.infer<typeof routineChannelSchema>

/**
 * Cadence. Six valeurs, toutes tirées du rapport : quotidien, jours ouvrés,
 * hebdomadaire, mensuel (déclencheur n°24, « 1er ouvré 09:30 »), trimestriel
 * (n°25) et CONTINU. On n'invente pas de cron libre — une expression cron
 * saisie par un utilisateur est un chemin d'exécution que personne ne relit.
 *
 * `continuous` mérite une explication. Trois déclencheurs du rapport ne sont pas
 * quotidiens mais attachés à un OBJET : « -1 h avant chaque rendez-vous »,
 * « +30 min après chaque rendez-vous », « à détection d'une annulation ». Les
 * traiter comme une routine journalière raterait le deuxième rendez-vous de la
 * journée. Ils tournent donc à chaque balayage, et leur idempotence porte sur
 * l'objet — un rendez-vous donné ne produit qu'une notification, jamais une par
 * quart d'heure.
 */
export const routineCadenceSchema = z.enum(['continuous', 'daily', 'weekdays', 'weekly', 'monthly', 'quarterly'])
export type RoutineCadence = z.infer<typeof routineCadenceSchema>

const localizedSchema = z.object({ fr: z.string().min(1), en: z.string().min(1) })

/**
 * #2843.7 (#2398.6) — les champs de la fiche qui manquaient, en VALEURS NOMMÉES
 * plutôt qu'en texte libre : une liste fermée se teste (le catalogue dit NON
 * quand une entrée en oublie une), une phrase de plus ne se teste pas.
 *
 * - `roles` : à qui la routine parle d'abord — la famille qui règle l'ORDRE
 *   (c76 : le rôle réordonne, jamais ne filtre). Le premier rôle est la famille.
 * - `workspaceProfiles` (#2843.29) : les types d'espace où elle est PERTINENTE —
 *   ordre seulement, jamais présence.
 * - `scope` : ce qu'elle lit — les objets de la personne, ou ceux de l'espace.
 * - `steps` : son déroulé, dans l'ordre.
 * - `preparedActions` : ce qu'elle laisse derrière elle.
 * - `validations` : les gestes humains qu'elle attend TOUJOURS (rien n'écrit tout seul).
 * - `budget` : appelle-t-elle un modèle facturé ? Lu au back-office seul (c132) :
 *   jamais un chiffre de coût ni de crédit à l'écran.
 */
export const routineRoleSchema = z.enum(['commercial', 'recruiter', 'manager', 'adv', 'delivery', 'general'])
export type RoutineRole = z.infer<typeof routineRoleSchema>

export const routineScopeSchema = z.enum(['personal', 'workspace'])
export type RoutineScope = z.infer<typeof routineScopeSchema>

export const routineStepSchema = z.enum([
  'read',
  'check_condition',
  'prepare',
  'notify',
  'await_validation',
  'record_proof',
])
export type RoutineStep = z.infer<typeof routineStepSchema>

export const routinePreparedActionSchema = z.enum([
  'notification',
  'digest',
  'message_draft',
  'task',
  'crm_update_proposal',
])
export type RoutinePreparedAction = z.infer<typeof routinePreparedActionSchema>

export const routineValidationSchema = z.enum(['review_before_acting', 'user_sends', 'user_approves_write'])
export type RoutineValidation = z.infer<typeof routineValidationSchema>

export const routineBudgetSchema = z.enum(['no_model_call', 'model_call'])
export type RoutineBudget = z.infer<typeof routineBudgetSchema>

/**
 * #2843.13 — l'AUTONOMIE réglée par l'utilisateur. `n0_inform` : la routine
 * tourne et garde son résultat dans son historique, SANS notifier — le niveau
 * 0 que #2843.25 donne aux nouvelles routines. On ne règle jamais AU-DESSUS du
 * niveau du catalogue (`automationLevel`) : seulement le sien ou `n0_inform`.
 */
export const routineAutonomySchema = z.enum(['n0_inform', 'n1_prepare', 'n4_bounded_auto', 'n5_extended_auto'])
export type RoutineAutonomy = z.infer<typeof routineAutonomySchema>

export const routineDefinitionSchema = z.object({
  key: routineKeySchema,
  name: localizedSchema,
  description: localizedSchema,
  /** Ce que la routine fait concrètement, en une phrase — affiché sous le nom. */
  outcome: localizedSchema,
  cadence: routineCadenceSchema,
  /** Heure locale par défaut, 0-23. Ignorée pour une routine continue. */
  defaultHour: z.number().int().min(0).max(23),
  /** Jour ISO (1 = lundi) pour les routines hebdomadaires. */
  defaultWeekday: z.number().int().min(1).max(7).nullable(),
  requires: z.array(routineRequirementSchema),
  defaultChannel: routineChannelSchema,
  /**
   * Le NIVEAU D'AUTONOMIE (PDF 6 §2, attribut 8).
   *
   * Le document pose une règle nette : « une automatisation qui ne renseigne pas
   * ses douze attributs n'est pas spécifiée ». Le catalogue des routines n'en
   * portait qu'un — sa clé. Les autres vivaient dans le corps des exécuteurs,
   * là où personne ne peut les lire avant de cliquer.
   *
   * Les routines sont N1 (elles préparent), N4 (elles notifient sans rien
   * envoyer dehors) ou, depuis le 11/10/2026, N5.
   *
   * ⚠️⚠️ RENVERSEMENT DATÉ (Louis 11/10/2026, épopée #4016, lot L6) : « aucune
   * n'est N5 » tombe. N5 = autonomie ÉTENDUE — la routine agit seule, sans
   * plafond de volume ni de dépense. Ce qui ne tombe pas : une routine qui
   * atteindrait un client sans relecture passe toujours par le moteur de
   * playbooks et ses garde-fous, jamais par ici — une routine N5 notifie dans
   * l'application (`routine-catalog.spec.ts`).
   *
   * ⚠️ Aucune routine N4 n'ÉCRIVAIT d'objet métier jusqu'au 11/10/2026 : elles
   * notifiaient. `incoming_need_matching` est la SEULE exception nommée
   * (`c93_matching_auto_besoin_entrant`) — elle écrit un journal de matching
   * interne, borné par un plafond quotidien, et n'envoie rien dehors. La garde
   * `matching-auto-seul-ecrit-sans-geste.spec.ts` refuse tout autre écrivain.
   */
  automationLevel: z.enum(['n1_prepare', 'n4_bounded_auto', 'n5_extended_auto']),
  /**
   * Ce qui doit être VRAI pour qu'elle produise quelque chose (attribut 3).
   *
   * Une phrase, pas une expression : elle est lue par un humain qui décide s'il
   * l'active. « Un relevé manque sur un mois clos » se comprend ; une condition
   * en code ne se relit pas dans un écran de réglages.
   */
  condition: localizedSchema,
  /** Ce qu'elle LIT (attribut 4) — pour que l'utilisateur sache ce qu'il ouvre. */
  reads: localizedSchema,
  /**
   * Ce qu'elle fait quand elle ne peut PAS faire ce qui est prévu (attribut 10).
   *
   * Jamais « rien » : une routine qui échoue en silence est le défaut que tout
   * ce module cherche à éviter. Quand il n'y a pas de repli, la phrase dit
   * qu'elle se tait ET pourquoi.
   */
  fallback: localizedSchema,
  /**
   * Comment on prouve qu'elle marche (attribut 12).
   *
   * Écrit ici plutôt que dans un test : c'est ce que l'opérateur vérifie sur une
   * vraie instance, et c'est la seule chose qui distingue « livrée » de
   * « livrée et vérifiée ».
   */
  acceptance: localizedSchema,
  /** Active par défaut pour un nouvel utilisateur ? */
  defaultEnabled: z.boolean(),
  /**
   * #2916 (#2399.3) — LA FICHE D'AUTOMATISATION, DIX-SEPTIÈME ATTRIBUT.
   *
   * Une illustration CONCRÈTE de ce que la routine produit — le parcours
   * comprendre→EXEMPLE→simuler→configurer→activer (#2399.5) a besoin d'un
   * « avant/après » lisible avant même de l'activer. `null` = non renseigné
   * : la doctrine « jamais de donnée fictive » interdit d'inventer un
   * exemple pour les routines qui n'en ont pas encore un écrit à la main —
   * un exemple deviné romprait la promesse qu'il illustre RÉELLEMENT ce que
   * la routine fait.
   */
  example: localizedSchema.nullable(),
  /**
   * #2398.6/#2398.14 (épopée #2843) — LA CONDITION D'ARRÊT, DIX-HUITIÈME
   * ATTRIBUT.
   *
   * Le NO-GO de #2398.14 promet de ne jamais activer une routine « sans
   * montrer sources/autonomie/conditions d'arrêt » — `RoutineDetailPage.tsx`
   * l'affirmait déjà dans son propre commentaire (« condition d'arrêt
   * visibles avant le geste ») alors qu'aucun champ ne portait cette
   * information : la promesse et le code avaient divergé.
   *
   * Distincte de `condition` : `condition` dit quand la routine PARLE,
   * `stopCondition` dit quand elle CESSE de parler d'un même objet — une
   * question différente dès qu'une routine répète ou expire (voir
   * `mission_checkin_j7_reminder`, bornée à vingt-et-un jours même sans
   * geste humain). `null` = non renseigné : même doctrine que `example`
   * juste au-dessus — une routine dont l'arrêt n'a pas été vérifié dans le
   * code ne se voit pas prêter un comportement deviné.
   */
  stopCondition: localizedSchema.nullable(),
  // #2843.7 — les champs de #2398.6 qui manquaient (voir `routineRoleSchema`).
  roles: z.array(routineRoleSchema).min(1),
  workspaceProfiles: z.array(workspaceProfileSchema).min(1),
  scope: routineScopeSchema,
  steps: z.array(routineStepSchema).min(1),
  preparedActions: z.array(routinePreparedActionSchema).min(1),
  validations: z.array(routineValidationSchema).min(1),
  budget: routineBudgetSchema,
  /**
   * #2916 (#2399.6) — LE VERSIONING : une mise à jour ne modifie jamais
   * silencieusement. `1` pour toute routine existante (comportement
   * inchangé) ; une routine dont le texte (condition/reads/outcome/…)
   * change substantiellement fait avancer ce compteur, pour que #2399.7
   * (ancienne/nouvelle version, différences, migration) ait quelque chose à
   * comparer. Le catalogue vivant dans le CODE (pas en base), c'est un
   * entier LITTÉRAL relu à chaque revue de code — pas un historique stocké.
   */
  version: z.number().int().positive(),
})
export type RoutineDefinition = z.infer<typeof routineDefinitionSchema>

/**
 * #2916 (#2399.7) — la NOTE d'une version : ce qui a changé et ce que devient
 * la configuration déjà posée. Une version qui avance sans note est une mise
 * à jour silencieuse (#2399.6) — une garde de l'API le refuse.
 */
export const routineVersionNoteSchema = z.object({
  version: z.number().int().min(2),
  changes: localizedSchema,
  migration: localizedSchema,
  /**
   * #2916.7 — le DIFF par champ modifié : ancienne ↔ nouvelle valeur. `before: null` = le champ n'était
   * pas renseigné (« non renseignée », jamais 0) ; `after: null` = il ne l'est toujours pas. Une ligne
   * dont les deux côtés sont absents n'est pas émise.
   */
  fieldChanges: z
    .array(
      z.object({
        field: z.enum(['stopCondition', 'maxItemsPerRun']),
        before: localizedSchema.nullable(),
        after: localizedSchema.nullable(),
      }),
    )
    .optional(),
})
export type RoutineVersionNote = z.infer<typeof routineVersionNoteSchema>

/**
 * #2916 (#2399.3) / #2398.6 (épopée #2843) — LES DIX-HUIT ATTRIBUTS de la
 * fiche, NOMMÉS et COMPTÉS (dix-sept jusqu'à l'ajout de `stopCondition`).
 *
 * Une garde d'architecture compare ce nombre aux clés RÉELLES de
 * `routineDefinitionSchema.shape` (jamais une liste recopiée à la main, qui
 * divergerait dès le premier attribut ajouté sans qu'elle bouge) — même patron
 * que `test_copilote_scenario_corpus.py §12` (des champs COMPTÉS, pas
 * décrétés).
 */
export const AUTOMATION_CARD_ATTRIBUTE_COUNT = 25

/**
 * #2843.24 (#2399.3) — le RISQUE d'une automatisation, de 0 à 4, DÉRIVÉ de ce qu'elle
 * laisse derrière elle — jamais une saisie de plus qui divergerait (GA-26) :
 * 0 elle lit et informe · 1 un récapitulatif · 2 elle écrit dans BellumAI (une tâche) ·
 * 3 elle prépare un message vers l'extérieur, que l'utilisateur envoie ·
 * 4 elle propose une écriture dans l'outil du client (CRM/ERP), derrière sa porte.
 * Le coût n'en fait pas partie : il reste au back-office (c132).
 */
const ROUTINE_RISK_OF_ACTION: Readonly<Record<RoutinePreparedAction, 0 | 1 | 2 | 3 | 4>> = {
  notification: 0,
  digest: 1,
  task: 2,
  message_draft: 3,
  crm_update_proposal: 4,
}

export function routineRiskOf(definition: Pick<RoutineDefinition, 'preparedActions'>): 0 | 1 | 2 | 3 | 4 {
  return definition.preparedActions.reduce<0 | 1 | 2 | 3 | 4>(
    (risk, action) => (ROUTINE_RISK_OF_ACTION[action] > risk ? ROUTINE_RISK_OF_ACTION[action] : risk),
    0,
  )
}

/**
 * #1822 — LES BORNES DE L'HORAIRE D'UNE ROUTINE, à un seul endroit (GA-26).
 *
 * Elles étaient écrites deux fois dans CE fichier (`routineSubscriptionSchema`
 * et `updateRoutineRequestSchema`), ce qui était déjà une de trop. Laura peut
 * désormais proposer de changer l'heure, le jour et le canal d'une routine :
 * le service IA doit donc connaître ces bornes, et une TROISIÈME copie —
 * en Python, dans un autre langage, sans compilateur pour les rapprocher —
 * aurait divergé au premier changement. Le pont les SERT (`laura/
 * routines-summary`), le service IA les LIT, personne ne les recopie.
 *
 * `weekday` commence à 1 (lundi), pas à 0 : c'est la convention ISO-8601, celle
 * de la base et celle de l'écran. Un décalage d'un jour est exactement le genre
 * d'erreur qu'une copie dans un autre langage introduit sans rien casser.
 */
export const ROUTINE_SCHEDULE_BOUNDS = {
  hour: { min: 0, max: 23 },
  weekday: { min: 1, max: 7 },
} as const

/**
 * #2843 (#2205.45) — LE PLAFOND DE DESTINATAIRES, à un seul endroit (GA-26).
 *
 * `no_reply_follow_up` prépare aujourd'hui UN brouillon par passage
 * (`RoutineExecutors.noReplyFollowUp`) — un entier littéral dans le code,
 * jamais réglable. `5` en borne haute : la routine se relance à son
 * prochain horaire, elle n'a pas besoin de vider toute la file en un tour,
 * et chaque brouillon coûte un appel modèle (#2205.42/.61) — un plafond
 * élevé ferait payer un passage entier sans qu'aucun garde-fou de coût ne
 * l'ait décidé.
 */
export const ROUTINE_MAX_ITEMS_PER_RUN_BOUNDS = { min: 1, max: 5 } as const

/**
 * #2398.7 — LES SIX STATUTS de l'abonnement (au lieu d'un booléen `enabled`).
 *
 * #2843.9 (lot L13) — `error` est désormais PRODUIT : trois échecs de suite
 * d'une même occurrence (reprise comprise, `routine-retry.ts`) arrêtent la
 * routine ; elle ne repart que sur un geste (`active`, réglable à l'écran).
 *
 * `draft`/`deprecated` sont NOMMÉS mais rien ne les PRODUIT encore
 * (même patron que `RoutineDefinition.example: null` plus haut — une valeur
 * absente se nomme, elle ne se force pas à exister avant son mécanisme) :
 * `draft` attend un parcours d'onboarding qui n'existe pas
 * (#2398.1-.4/.6/.8/.10/.11/.13/.14, écran de configuration, hors tranche),
 * `error` attendrait un couplage au scheduler (`RoutinesService.runDueFor`)
 * qui romprait son idempotence si fait à la hâte, et `deprecated` attend un
 * catalogue qui retire une routine (aucune ne l'a jamais fait). Seuls
 * `active`/`paused`/`disabled` sont donc réglables à l'écran aujourd'hui —
 * les trois autres restent réservés, pas supprimés.
 */
export const routineStatusSchema = z.enum(['draft', 'active', 'paused', 'disabled', 'error', 'deprecated'])
export type RoutineStatus = z.infer<typeof routineStatusSchema>

/** Les statuts qu'un utilisateur peut choisir lui-même (voir {@link routineStatusSchema}). */
export const ROUTINE_SELECTABLE_STATUSES = ['active', 'paused', 'disabled'] as const

/** L'abonnement d'un utilisateur à une routine — la seule chose qui vit en base. */
export const routineSubscriptionSchema = z.object({
  key: routineKeySchema,
  status: routineStatusSchema,
  /**
   * Miroir DÉRIVÉ de `status` (`enabled === (status === 'active')`), jamais un
   * second réglage indépendant (GA-26) : conservé pour les lecteurs déjà
   * écrits contre un booléen (`routine-schedule.ts`, `laura-probe.service.ts`,
   * `quality-metrics.service.ts`) le temps qu'ils migrent vers `status`.
   */
  enabled: z.boolean(),
  hour: z.number().int().min(ROUTINE_SCHEDULE_BOUNDS.hour.min).max(ROUTINE_SCHEDULE_BOUNDS.hour.max),
  weekday: z
    .number()
    .int()
    .min(ROUTINE_SCHEDULE_BOUNDS.weekday.min)
    .max(ROUTINE_SCHEDULE_BOUNDS.weekday.max)
    .nullable(),
  channel: routineChannelSchema,
  timeZone: z.string(),
  /**
   * #2843 (#2205.45) — le plafond de destinataires, DISTINCT de la cible
   * calculée. `null` = aucun plafond réglé : l'exécuteur retombe sur le
   * comportement d'avant ce champ (UN brouillon par passage). Réglable
   * UNIQUEMENT sur `no_reply_follow_up` aujourd'hui — la seule routine où
   * le calcul de la cible est déjà séparé de l'écriture ; voir
   * `RoutinesService.update`.
   */
  maxItemsPerRun: z
    .number()
    .int()
    .min(ROUTINE_MAX_ITEMS_PER_RUN_BOUNDS.min)
    .max(ROUTINE_MAX_ITEMS_PER_RUN_BOUNDS.max)
    .nullable(),
  /** #2843.13 — l'autonomie réglée ; `null` = le niveau du catalogue. */
  autonomy: routineAutonomySchema.nullable(),
  /**
   * #2843.13 — à qui la routine remet son résultat dans l'application ; `null`
   * = l'abonné lui-même. Réglable seulement pour une routine de portée
   * `workspace` (elle lit l'espace, jamais la boîte de la personne).
   */
  ownerUserId: z.string().uuid().nullable(),
})
export type RoutineSubscription = z.infer<typeof routineSubscriptionSchema>

/** Pourquoi une routine ne peut pas s'exécuter aujourd'hui. */
export const routineBlockerSchema = z.enum([
  'mailbox_not_connected',
  'agenda_not_connected',
  'no_accounts',
  'ats_not_connected',
  'crm_not_connected',
])
export type RoutineBlocker = z.infer<typeof routineBlockerSchema>

/**
 * Ce que l'écran Réglages › Routines affiche : la définition, l'abonnement, et
 * — surtout — ce qui l'empêche de tourner. Une routine cochée qui n'a rien à
 * lire est pire qu'une routine décochée : elle laisse croire que le produit
 * surveille quelque chose.
 */
export const routineViewSchema = z.object({
  definition: routineDefinitionSchema,
  subscription: routineSubscriptionSchema,
  blockers: z.array(routineBlockerSchema),
  /** Dernière exécution réussie (ISO), ou null si jamais. */
  lastRunAt: z.string().nullable(),
  /** Ce que la dernière exécution a produit, en clair. */
  lastOutcome: z.string().nullable(),
  /**
   * #2205.26/.55 — la dernière exécution a-t-elle ÉCHOUÉ (registre #2205) ?
   *
   * Optionnel plutôt que dérivé côté écran : `lastOutcome` porte la convention
   * `Échec : <cause>` écrite par `RoutinesService` lui-même (jamais par une
   * lecture de texte ailleurs), donc seul ce service peut dire s'il y a eu un
   * échec. `undefined` = jamais mesuré (aucune exécution), jamais confondu
   * avec `false` (dernière exécution réussie) — GA-18/GA-19.
   */
  lastFailed: z.boolean().optional(),
  /**
   * #2266.27 — le PROCHAIN déclenchement, connu et affiché. Calcul pur depuis
   * `hour`/`weekday`/`timeZone` de l'abonnement et `cadence` du catalogue
   * (`nextRoutineTrigger`, `routine-schedule.ts`) — aucune donnée nouvelle.
   * `null` = routine désactivée, ou cadence `continuous` (qui tourne à chaque
   * balayage et n'a pas d'instant unique à nommer) — jamais une heure devinée.
   */
  nextTriggerAt: z.string().nullable(),
  /**
   * #2916 (#2399.6/#2399.7) — la routine a-t-elle changé depuis la dernière
   * fois que CE compte l'a vue ? Dérivé côté service (`RoutinesService.list`,
   * `subscription.seenVersion` en base vs `definition.version` du catalogue),
   * jamais recalculé ici : un seul endroit sait ce qu'un abonnement a vu.
   * `false` tant qu'aucune version n'a réellement avancé — pas un compteur
   * qui devine.
   */
  updated: z.boolean(),
  /**
   * #2916 (#2399.7) — quand `updated`, les notes des versions que ce compte n'a
   * pas encore vues (ancienne → nouvelle, ce qui change, ce que devient la
   * configuration). Absent si la routine est à jour : rien à comparer.
   */
  versionNotes: z.array(routineVersionNoteSchema).optional(),
})
export type RoutineView = z.infer<typeof routineViewSchema>

/**
 * #2205.49-52/.62 — une exécution de routine, pour l'HISTORIQUE.
 *
 * `RoutineView.lastOutcome` ne porte que la DERNIÈRE ligne : la table
 * `routine_runs` existait déjà (idempotence, `RoutineRunEntity`) mais aucun
 * écran ne la lisait au-delà de ce dernier résultat — impossible de répondre
 * « les routines tournent-elles vraiment, jour après jour ? » (critère de
 * recette #2205.62, « logs audités »).
 */
export const routineRunViewSchema = z.object({
  id: z.string().guid(),
  /** Quand l'exécution a eu lieu — c'est le DÉCLENCHEUR daté (#2205.49). */
  createdAt: z.string(),
  /** A-t-elle produit une notification ? `false` = elle a tourné, rien à dire. */
  notified: z.boolean(),
  /** Ce qui s'est passé, en français lisible (#2205.51/.52). */
  outcome: z.string(),
  /** Même convention que {@link RoutineView.lastFailed} — jamais redevinée ici. */
  failed: z.boolean(),
  /**
   * #2205.54 — la PREUVE vérifiable de ce que l'exécution a produit : un lien
   * ou un identifiant confirmé (même garde que `mailDraftHasProof`, GA-26),
   * `null` quand l'exécuteur n'a rien de vérifiable à citer. Jamais un champ
   * optionnel omis : une ligne sans preuve le DIT.
   */
  proofRef: z.string().nullable(),
})
export type RoutineRunView = z.infer<typeof routineRunViewSchema>

/**
 * #2843.18 (lot L13) — ce que la routine a RÉELLEMENT donné sur les trente
 * derniers jours, lu dans `routine_runs` : exécutions, prises de parole,
 * échecs. Aucun coût, aucune durée (back-office seul, c132). `runs: 0` dit
 * « jamais exécutée sur la période » — l'écran l'écrit « rien n'a été
 * mesuré », jamais « 0 résultat ».
 */
export const routineObservationSchema = z.object({
  days: z.literal(30),
  runs: z.number().int().nonnegative(),
  notified: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
})
export type RoutineObservation = z.infer<typeof routineObservationSchema>

/**
 * #2843.10 (lot L13) — « lancer maintenant » UNE routine, hors horaire.
 * `executed: false` se NOMME toujours : salle de démonstration (`demo`), une
 * capacité manque (`blocked`), ou un clic identique dans la même minute
 * (`already_running`) — jamais un refus silencieux.
 */
export const routineRunNowResultSchema = z.object({
  executed: z.boolean(),
  /** Ce que l'exécution a produit, en clair (`null` quand rien n'a tourné). */
  outcome: z.string().nullable(),
  reason: z.enum(['demo', 'blocked', 'already_running']).optional(),
})
export type RoutineRunNowResult = z.infer<typeof routineRunNowResultSchema>

export const updateRoutineRequestSchema = z.object({
  /** #2398.7 — remplace `enabled` côté écran ; seules les 3 valeurs de
   *  {@link ROUTINE_SELECTABLE_STATUSES} sont acceptées ici (validé côté
   *  service, pas dans ce schéma partagé — voir `RoutinesService.update`). */
  status: routineStatusSchema.optional(),
  /** @deprecated Conservé pour compat : mappé sur `status` par le service
   *  (`true` → `active`, `false` → `paused`). Ne pas ajouter de nouvel appelant. */
  enabled: z.boolean().optional(),
  hour: z.number().int().min(ROUTINE_SCHEDULE_BOUNDS.hour.min).max(ROUTINE_SCHEDULE_BOUNDS.hour.max).optional(),
  weekday: z
    .number()
    .int()
    .min(ROUTINE_SCHEDULE_BOUNDS.weekday.min)
    .max(ROUTINE_SCHEDULE_BOUNDS.weekday.max)
    .nullable()
    .optional(),
  channel: routineChannelSchema.optional(),
  /**
   * #2916 (#2399.6/#2399.7) — marque la version ACTUELLE du catalogue comme
   * vue par ce compte, pour cette routine. `true` uniquement : on n'écrit
   * jamais un `seen_version` choisi par le client, seul le service connaît la
   * version réelle du catalogue à l'instant du geste.
   */
  acknowledgeVersion: z.literal(true).optional(),
  /** #2843 (#2205.45) — voir {@link routineSubscriptionSchema.maxItemsPerRun}.
   *  `null` efface un plafond déjà réglé (retour au défaut). Refusé côté
   *  service pour toute routine autre que `no_reply_follow_up` — voir
   *  `RoutinesService.update`. */
  maxItemsPerRun: z
    .number()
    .int()
    .min(ROUTINE_MAX_ITEMS_PER_RUN_BOUNDS.min)
    .max(ROUTINE_MAX_ITEMS_PER_RUN_BOUNDS.max)
    .nullable()
    .optional(),
  /** #2843.13 — `null` revient au niveau du catalogue. */
  autonomy: routineAutonomySchema.nullable().optional(),
  /** #2843.13 — `null` revient à l'abonné. */
  ownerUserId: z.string().uuid().nullable().optional(),
})
export type UpdateRoutineRequest = z.infer<typeof updateRoutineRequestSchema>

/**
 * #2843.30 — LE CONTENU EXACT d'une routine, réglé PAR ESPACE (`/settings/routines/<clé>`).
 * Un gabarit pour le texte de sa notification, où {@link ROUTINE_CONTENT_TOKEN} reçoit
 * ce que la routine a calculé. `null` = le texte par défaut, celui que l'exécuteur écrit ;
 * revenir au défaut efface le gabarit, il ne recopie jamais le défaut.
 */
export const ROUTINE_CONTENT_TOKEN = '{{resultat}}'
export const ROUTINE_CONTENT_MAX_LENGTH = 1000

export const routineContentViewSchema = z.object({
  key: routineKeySchema,
  template: z.string().min(1).max(ROUTINE_CONTENT_MAX_LENGTH).nullable(),
})
export type RoutineContentView = z.infer<typeof routineContentViewSchema>

export const updateRoutineContentRequestSchema = z.object({
  template: z.string().trim().min(1).max(ROUTINE_CONTENT_MAX_LENGTH),
})
export type UpdateRoutineContentRequest = z.infer<typeof updateRoutineContentRequestSchema>

/** #2843.30 — le texte final : le gabarit de l'espace, ou le résultat tel quel sans gabarit. */
export function applyRoutineContent(template: string | null, result: string): string {
  return template === null ? result : template.split(ROUTINE_CONTENT_TOKEN).join(result)
}

/**
 * #2398.13/#2205.38 (épopée #2843) — « Test (dry-run avant activation) »,
 * pour la SEULE routine `no_reply_follow_up`. `playbookDryRunSchema` fait ça
 * pour les playbooks depuis §43/G5 du rapport (simulation sur données
 * réelles, ZÉRO écriture) ; les ~42 exécuteurs de routines n'ont pas
 * d'équivalent — chacun mélange calcul de la cible et écriture, un refactor
 * transverse hors de portée d'un seul point. `no_reply_follow_up` s'y prête
 * SEUL : `RoutineExecutors.noReplyFollowUp` sépare déjà la lecture
 * (`MailboxService.search`, aucune écriture) de la préparation du brouillon
 * (`IaClient.generateMessage` + `MailboxService.createDraft`) — la même
 * séparation que `PlaybookTargets`/écriture côté playbooks, réutilisée ici
 * plutôt qu'un troisième patron inventé (GA-26). « Tranché sans Louis » :
 * une tranche par routine qui s'y prête déjà, jamais un endpoint générique
 * qui laisserait croire que les 41 autres sont simulables aussi.
 */
export const noReplyFollowUpDryRunSchema = z.object({
  /** Combien de fils sans réponse ce passage trouverait. */
  threadsFound: z.number().int().nonnegative(),
  /** Le plus ancien des fils trouvés — celui que le prochain passage réel
   *  traiterait. `null` quand `threadsFound` est 0. */
  oldest: z
    .object({
      counterpart: z.string().nullable(),
      daysSinceLastMessage: z.number().int().nullable(),
    })
    .nullable(),
  /** Un brouillon serait-il RÉELLEMENT préparé ? Les mêmes conditions que
   *  l'exécution réelle (contact identifié, messagerie connectée avec
   *  capacité brouillon) — sans jamais appeler le modèle ni écrire de
   *  brouillon : ZÉRO coût, ZÉRO écriture, comme l'exige la simulation. */
  wouldPrepareDraft: z.boolean(),
  /** Pourquoi pas, quand `wouldPrepareDraft` est `false` malgré un fil
   *  trouvé — jamais un refus silencieux. `no_credit` (#2205.42/#2205.61) :
   *  solde d'enrichissement épuisé, même lecture SANS DÉBIT que
   *  l'enrichissement organigramme/contacts. */
  blockedReason: z.enum(['no_thread', 'no_contact', 'mailbox_not_ready', 'no_credit']).nullable(),
})
export type NoReplyFollowUpDryRun = z.infer<typeof noReplyFollowUpDryRunSchema>
