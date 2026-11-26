import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { ACTION_LEVEL_PREFERENCE_KEY, REPLY_PREFERENCE_KEYS } from '@bellum/contracts'
import { DataSource, type EntityManager } from 'typeorm'
import { DirectDbService, type DirectPgClient } from '../../database/direct-db.service'
import { DEMO_SEEDED_TABLES } from './demo-coverage'
import { StorageClient } from '../storage/storage.client'
import { DemoSeedService } from './demo-seed.service'
import { DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS } from './demo-dataset'
import { demoRoomVariantOf, demoSeedFingerprintFor } from './demo-room-variant'

/**
 * Rows that hang off a demo row without carrying `workspace_id` themselves —
 * purged through their parent, BEFORE it, so no foreign key ever blocks.
 */
export const DEMO_PURGE_JOIN_TABLES = [
  { table: 'contact_lifecycle_transitions', column: 'contact_id', parent: 'contacts' },
  { table: 'outreach_sequence_steps', column: 'sequence_id', parent: 'outreach_sequences' },
  // #3756 — les étapes d'un modèle de la bibliothèque pendent du modèle, pas de l'espace.
  { table: 'sequence_template_steps', column: 'template_id', parent: 'sequence_templates' },
  { table: 'contact_merges', column: 'account_id', parent: 'accounts' },
  // #3755 — un critère appartient à sa version de grille, pas à un espace.
  { table: 'qualification_criteria', column: 'grid_id', parent: 'qualification_grids' },
  // ⚠️ Ces deux-là étaient dans `DEMO_PURGE_TABLES`, donc effacées par
  // `WHERE workspace_id = $1` — une colonne qu'elles n'ont pas. Depuis le
  // 20/08, TOUTE ouverture du lien de démonstration publique répondait 500
  // (`column "workspace_id" does not exist`), et le lien est précisément ce
  // qu'un commercial colle dans un message. Une ligne de shortlist appartient
  // à sa shortlist, une ligne de classement à son run.
  { table: 'shortlist_entries', column: 'shortlist_id', parent: 'shortlists' },
  { table: 'match_run_entries', column: 'run_id', parent: 'match_runs' },
  // Delivery OS : un relevé et une affectation appartiennent à une mission, pas
  // à un espace. La contrainte est déjà `ON DELETE CASCADE`, mais on les efface
  // ici explicitement — une purge qui dépend d'un effet de bord du schéma se
  // met à laisser des lignes le jour où quelqu'un change la contrainte.
  { table: 'mission_timesheets', column: 'mission_id', parent: 'missions' },
  { table: 'mission_assignments', column: 'mission_id', parent: 'missions' },
  // Les participants d'une activité appartiennent à l'activité, pas à l'espace.
  // La contrainte est déjà `ON DELETE CASCADE` ; on les efface quand même
  // explicitement, pour la même raison que les relevés ci-dessus.
  { table: 'activity_participants', column: 'activity_id', parent: 'activities' },
  // Compétences et documents d'un talent : ils pendent du talent, pas de
  // l'espace. `consultant_documents` porte pourtant `workspace_id` — on l'efface
  // ici, AVANT `consultants`, pour ne dépendre d'aucune cascade.
] as const

/**
 * Tables scoped by `user_id` (not `workspace_id`) that still hold VISITOR
 * content on the shared demo account. The demo space has exactly one owner
 * user, so scoping by that user is equivalent — and necessary, because some of
 * these are what a curious prospect can do TO the shared account:
 *
 *  - `user_mfa` — a visitor enabling 2FA would lock every other visitor out,
 *    Théo included, with no way back except an operator;
 *  - `integrations` / `integration_deliveries` — an outbound webhook pointed at
 *    a stranger's Slack, which would then receive the NEXT visitor's signals;
 *  - `oauth_*` — pairing the demo account with a personal AI assistant (MCP);
 *  - `notifications`, `action_plan_items`, `beta_feedback` — plain traces of the
 *    previous visitor.
 *
 * Deliberately NOT here (kept): `notification_preferences` (holds the newsletter
 * marker and the opt-out state — resetting it could re-announce or re-mail),
 * `user_onboarding_state` (purging re-triggers the questionnaire on every
 * visit), `user_preferences`, `user_last_seen`, `user_sessions`, `profiles`,
 * `subscriptions` (identity, plan and device bookkeeping, not content).
 *
 * #1928 — `user_preferences` garde sa RANGÉE, mais pas les quatre réglages de
 * réponse de Laura (`REPLY_PREFERENCE_KEYS`) : ce sont des choix du visiteur,
 * et le suivant ne doit pas lire des réponses « courtes » qu'il n'a jamais
 * demandées. `resetWorkspace` retire ces clés-là, et rien d'autre du sac.
 *
 * ⚠️ `user_daily_brief` (#1936, lot 7A — Laura's "first open of the day"
 * marker) is not here EITHER, but for a stronger reason than the six above:
 * it is not merely unpurged, it is never WRITTEN for a demo workspace in the
 * first place. `POST /briefing/first-open-today` checks
 * `WorkspaceContextService.isDemoWorkspace` BEFORE calling
 * `DailyBriefMarkerService` and short-circuits to `{ isFirstOpenToday: true }`
 * without touching the table — a demo room is leased to a different visitor
 * every `DEMO_LEASE_TTL_MINUTES` (30 minutes), so "first of the day" has no
 * meaning for an account nobody keeps for more than half an hour. See
 * `demo-coverage.ts` for the written decision this mirrors.
 *
 * ⚠️ `notification_sms_channels` (#1938.4 — the mobile number for urgent SMS
 * alerts) is not here for the same stronger reason: every SMS route of
 * `NotificationsController` checks `isDemoWorkspace` first, so a visitor can
 * never store a phone number that the next visitor would read. See
 * `DEMO_SMS_CHANNEL_COVERAGE`.
 *
 * ⚠️ `profiles` n'est pas purgée, mais elle n'est plus IGNORÉE pour autant : le
 * critère de complétude lit l'identité du propriétaire (voir
 * {@link DEMO_IDENTITY_COLUMN}) et le semis la RÉTABLIT. Une salle dont un
 * visiteur avait supprimé le compte affichait « [supprimé] [supprimé] » au pied
 * de la barre latérale, pour toujours — effacer la ligne l'aurait rendue
 * inaccessible, la laisser telle quelle la rendait sans nom.
 *
 * ⚠️ `user_onboarding_state` suit exactement le MÊME sort depuis le 13/09/2026
 * (#1921, Louis) : non purgée (raison ci-dessus, inchangée), et désormais
 * RÉTABLIE à `completed` par `DemoSeedService.restoreOwnerIdentity` — pas
 * seulement épargnée. Une ligne absente ou `not_started` faisait rebondir tout
 * visiteur de `/welcome` vers `/onboarding` (`routes/welcome.tsx`), un écran où
 * Laura prend la parole en premier et que la salle ne pouvait donc jamais
 * montrer. `esn_profiles` n'est PAS dans ce cas : elle est purgée par espace
 * (`DEMO_PURGE_TABLES`) et RE-SEMÉE à chaque semis par
 * `DemoSeedService.seedEsnProfile` (« Bellum Conseil », `DEMO_ESN_PROFILE`) —
 * marquer l'onboarding « terminé » donnait l'accès à `/welcome`, et sans ce
 * profil la carte « Ton profil » y affichait « À compléter » ×4. Sa décision
 * écrite est dans `demo-coverage.ts` (`DEMO_SEEDED_TABLES`).
 *
 * Order matters: children before parents (`integration_deliveries` →
 * `integrations`), and everything here lands before the workspace-scoped pass
 * so `action_plan_items` is gone before `accounts`.
 */
export const DEMO_PURGE_USER_TABLES = [
  'integration_deliveries',
  'integrations',
  'action_plan_items',
  'notifications',
  'beta_feedback',
  'profile_context_revisions',
  'oauth_consents',
  'oauth_refresh_tokens',
  'oauth_authorization_codes',
  'user_mfa',
  // Un visiteur qui règle ses routines ne doit pas les léguer au suivant : la
  // trace d'exécution ET l'abonnement repartent de zéro. L'ordre compte —
  // `routine_runs` référence la même clé d'utilisateur, on l'efface d'abord.
  'routine_runs',
  'routine_subscriptions',
  // #2843.13 — autonomie et owner réglés par le visiteur : même règle que l'abonnement.
  'routine_preferences',
  // ⚠️ #2150.14/.18 (15/09/2026) — REVIREMENT ASSUMÉ DE #1800 : le favori de
  // compte revient (Louis, retour bêta #2150 — voir `user-favorite.entity.ts`
  // pour le récit complet). `DemoSeedService.seedWorkspace` pose à nouveau UN
  // favori GOLDEN par salle, donc la ligne reste NÉCESSAIRE, pas seulement
  // par précaution : sans elle, un visiteur hériterait du favori du visiteur
  // précédent en plus du sien. Elle vit ICI, jamais dans `DEMO_PURGE_TABLES` :
  // `user_favorites` est scopée par UTILISATEUR, pas par espace — la purge
  // `WHERE workspace_id = $1` de `DEMO_PURGE_TABLES` ne l'atteindrait pas
  // (le défaut qui a mis le lien de démonstration publique en 500 le 20/08).
  'user_favorites',
  // #2004.12 — le journal des transitions d'état de l'onboarding. Même famille
  // que `routine_runs` : une trace d'exécution, jamais lue par un écran
  // aujourd'hui, qui grossirait sans fin sur le compte partagé si on ne la
  // purgeait pas. `user_onboarding_state`, elle, reste hors de cette liste
  // (raison ci-dessus, inchangée) : seule la LIGNE COURANTE compte pour
  // l'accès à `/welcome`, pas son historique.
  'user_onboarding_transitions',
  // Théo O onboarding-relecture.N1 — la décision prise sur une orientation du cadrage (retenir · plus tard ·
  // écarter) : le compte de démo est UNIQUE et partagé, donc un visiteur qui « retient » une orientation la
  // léguerait à tort au suivant. Scopée par `user_id`, comme `user_favorites`.
  'framing_decisions',
  // #2104.6/.7/.8 (22/09/2026) — la décision manuelle sur un fil de messagerie
  // (traité, non pertinent, rattaché à la main) : le compte de démo est
  // UNIQUE et partagé (comme `user_mfa` ci-dessus), donc un visiteur qui
  // marquerait un fil de démo « traité » le léguerait à tort au suivant.
  // Scopée par `user_id`, comme `mail_send_batches` — celle-ci n'a pas besoin
  // d'être ici : `sendBatch` échoue AVANT toute écriture en démo (aucun
  // connecteur réel n'y est jamais rattaché), alors que marquer un fil ou le
  // rattacher à un compte n'appelle aucun connecteur et écrit donc pour de
  // vrai, y compris depuis une salle de démonstration.
  'mail_thread_marks',
  // #2439.15 — l'audit de chaque export personnel du visiteur précédent.
  // Scopée `user_id` sur le compte de démo, UNIQUE et partagé : la laisser
  // dirait au visiteur suivant que quelqu'un d'autre a déjà exporté SES
  // données (même famille que `ai_tool_call_audit_log`, purgée par espace).
  'privacy_export_audit_log',
  // #3236.2(b) — la trace persistante d'un approfondissement Laura interrompu
  // (`chat_deepen_jobs`, migration `ChatDeepenJobs1796437700001`). Scopée
  // `user_id` sur le compte de démo, UNIQUE et partagé : laisser la ligne
  // dirait au visiteur suivant qu'une étude du visiteur précédent est encore
  // en cours (raison de classification : `demo-coverage.ts`).
  'chat_deepen_jobs',
] as const

/**
 * Tables scoped by `workspace_id` whose rows are VISITOR content on the shared
 * demo space: everything a prospect can create, edit or connect while clicking
 * around. They are wiped on every demo-link redemption so the next visitor —
 * and Théo, mid-call — always lands on the same staged space, never on the
 * previous visitor's traces.
 *
 * `accounts` is LAST: contacts, angles, plans and vocabulary reference it.
 */
export const DEMO_PURGE_TABLES = [
  // #4603 — le journal des fusions compte-CRM ↔ compte-analyse : ce qu'un visiteur aurait fusionné par le
  // rattrapage ne se lègue pas au suivant. Feuille : aucune FK.
  'account_crm_fusions',
  // #4406.6 — un branchement Beeper (jetons chiffrés) ne se lègue jamais au visiteur suivant. Le service
  // refuse déjà de brancher depuis une salle ; la purge ferme la porte par prudence. Feuille : aucune FK.
  'beeper_connections',
  // #4158.14 — la boîte d'ÉQUIPE : une notification de collègue porte `workspace_id`
  // (migration `1796498061438`). Les lignes PERSONNELLES (`workspace_id` NULL) partent par
  // `DEMO_PURGE_USER_TABLES`, ci-dessous : les deux balayages se complètent, aucun ne suffit seul.
  // Table autonome, sans dépendant : sa position est libre.
  'notifications',
  // #4158 (lot L4) — les garde-fous entre collègues (liste « ne pas contacter », équipe
  // de compte). Tables autonomes (aucun FK) : leur position est libre. Les laisser ferait
  // hériter le visiteur suivant d'une exclusion et d'une équipe qu'il n'a pas construites.
  'workspace_do_not_contact',
  'account_team_members',
  // #4996 L7 — les zones des membres (périmètre, `account_team_scopes`) : table fille de `accounts` et de
  // `account_entities`, posée par `seedTeamGuardrails` pour le collègue fictif. Les laisser ferait hériter le
  // visiteur suivant d'un périmètre qu'il n'a pas posé.
  'account_team_scopes',
  // #3086 — la présence sur un fil de Laura (qui y est en train de parler).
  // Table autonome, sans dépendant : elle ne référence rien et rien ne la
  // référence, donc sa position dans la liste est libre. La laisser ferait
  // croire au visiteur suivant que le précédent est encore là.
  'chat_presence',
  // BEL-SC-224 (#3253, P0) — l'historique des diagnostics du maillon faible
  // commercial. Table autonome (aucun FK, `account_id` ne vit que dans le
  // JSONB `supporting_evidence`) : sa position est libre. La laisser ferait
  // hériter le visiteur suivant du diagnostic — et de l'historique de
  // changement — d'un espace qu'il n'a pas construit.
  'weakest_link_diagnoses',
  // #3014 — l'amorçage de la première synchronisation. Un run porte le
  // PROVIDER lancé et son résumé cross-domaine : les laisser ferait hériter
  // le visiteur suivant d'une synchronisation qu'il n'a pas déclenchée.
  'integration_sync_runs',
  // Les interventions de Laura Produit. Elles portent l'écran visité et la
  // réaction du visiteur : les laisser ferait hériter le suivant d'un retrait
  // déclenché par quelqu'un d'autre — et Laura resterait muette pendant sept
  // jours sur un espace de démonstration, sans que personne ne comprenne
  // pourquoi.
  'laura_interventions',
  // #2288.2 — les reçus de vérification à la demande. Ils disent ce que CET
  // espace a fait vérifier : les laisser ferait hériter le visiteur suivant de
  // vérifications qu'il n'a pas demandées, et d'un coût qu'il n'a pas payé.
  'market_verification_receipts',
  // #4267 — les comptes SUIVIS de la salle (`account_follows`, scopée `workspace_id`) : AVANT les
  // comptes qu'ils référencent (la FK est `ON DELETE CASCADE`, la purge explicite est la ceinture). Un
  // « Ne plus suivre » d'un visiteur ne doit pas devenir l'état du suivant ; le jeu est re-semé.
  'account_follows',
  // Théo A signaux — les états de signaux et les veilles de la salle : un « Écarter » ou une veille supprimée d'un
  // visiteur ne doit pas devenir l'état du suivant ; le jeu est re-semé (`seedSignalLibrary`). AVANT les comptes.
  'signal_user_states',
  'signal_watches',
  // #2155.13 — « Mes cibles ». Les éléments AVANT leur liste, et tous deux avant
  // les comptes et contacts qu'ils référencent.
  'target_list_items',
  'target_lists',
  // #2818 (lot T4) — le brief partenaire d'un besoin de sourcing externe :
  // partner_name, conditions et délai sont TAPÉS par le visiteur. Autonome
  // (rien ne la référence), et AVANT `project_needs` qu'elle référence.
  'external_sourcing_partner_briefs',
  // #2293.5 — le lot d'analyses multi-comptes : les sous-jobs AVANT leur parent,
  // tous deux avant les comptes qu'ils référencent. Un lot lancé par un visiteur
  // ne doit pas apparaître dans les « lots récents » du suivant.
  'analysis_batch_items',
  'analysis_batches',
  // #2284.67-.69 — les corrections d'identité : AVANT les comptes qu'elles
  // référencent. Un « ce n'est pas celle-ci » d'un visiteur ne doit pas
  // devenir la vérité du suivant.
  'entity_resolution_corrections',
  // #4188 — les comptes envoyés vers un CRM : AVANT les comptes qu'ils
  // référencent. L'envoi d'un visiteur ne doit pas devenir celui du suivant ;
  // le compte « déjà envoyé » du jeu est re-semé.
  'account_crm_exports',
  // #4051 — la trace « Importé le … depuis … » : celle d'un visiteur ne devient pas celle du suivant ; le jeu est re-semé.
  'record_import_marks',
  // #4189 — le curseur de synchro d'un CRM : aucun n'est branché en salle, mais la purge le sait
  // (rien d'un visiteur ne doit être hérité par le suivant).
  'crm_sync_cursors',
  // #2005.3 — la couche BU / agence. Les demandes d'accès et les appartenances
  // AVANT les périmètres qui les portent (elles y référencent). Un visiteur peut
  // créer une agence, rejoindre, demander un accès : rien de tout cela ne doit
  // être hérité par le suivant, qui verrait des périmètres inventés par
  // quelqu'un d'autre au milieu de ceux du jeu de démonstration.
  'business_unit_access_requests',
  'business_unit_members',
  'business_units',
  // #2081.14 — les règles d'espace. Le visiteur est propriétaire de sa salle
  // et peut en changer une (fermer l'export, rendre les unités privées) : la
  // garder ferait hériter le suivant d'une salle dont l'export se refuse sans
  // qu'il sache pourquoi. Sans ligne, la salle revient aux défauts.
  'workspace_rules',
  // #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes :
  // les réglages de Marché inversé et de Charge commerciale tiennent dans ces
  // DEUX tables, plus quatre. Même raison que `workspace_rules` juste
  // au-dessus : le visiteur peut poser un plafond, et le garder ferait hériter
  // le suivant d'un réglage posé par quelqu'un d'autre. Sans ligne, tout
  // revient aux défauts de code.
  'workspace_reverse_market_settings',
  'workspace_commercial_load_settings',
  // BEL-SC-242 (#3271.10/.12, migration `WorkspaceRitualPreferences1796374065850`)
  // — même forme que `workspace_commercial_load_settings` juste au-dessus : un
  // visiteur peut désactiver un rituel, et le garder ferait hériter le suivant
  // d'un réglage posé par quelqu'un d'autre. Sans ligne, tout rituel reste
  // affiché (le défaut de code).
  'workspace_ritual_preferences',
  // #3298 (suite #3271.8, migration `WorkspaceRitualLastHeld1796378870001`) —
  // même raison que `workspace_ritual_preferences` juste au-dessus : un
  // visiteur peut marquer un rituel comme tenu, et le garder ferait hériter
  // le suivant d'une marque posée par quelqu'un d'autre. Sans ligne, aucun
  // rituel n'a de dernière tenue connue (le défaut de code).
  'workspace_ritual_last_held',
  // Les besoins PROPOSÉS par un run de démonstration. Ils portent le nom du
  // compte qu'un visiteur a analysé : les laisser les montrerait au suivant.
  'need_proposals',
  // Un visiteur ne DOIT pas pouvoir laisser des identifiants d'ERP sur un
  // espace partagé (la connexion est d'ailleurs refusée en démo — ceci est la
  // ceinture qui va avec la bretelle).
  'ats_connections',
  // Même raison que l'ATS : la connexion est refusée en démo, la purge est la
  // ceinture qui va avec la bretelle.
  'admin_docs_connections',
  // Les demandes d'écriture pendent de cette connexion et partent avec elle.
  'ats_write_requests',
  // Même raison : la connexion est refusée en démo, et la purge est la ceinture
  // qui va avec cette bretelle. Le journal d'appels part avec elle.
  'telephony_connections',
  'telephony_call_logs',
  // #2403.12 — l'état « appel en cours » dépend du secret de webhook de
  // `telephony_connections`, refusé en démo : purgée pour la même raison, un
  // état orphelin d'une connexion déjà effacée ne doit pas persister.
  'telephony_call_states',
  // #4427 — Lemlist : la connexion est refusée en démo (même raison que l'ATS),
  // la purge est la ceinture ; la trace des leads poussés part avec elle.
  'lemlist_connections',
  'lemlist_lead_pushes',
  // Ce que le visiteur précédent a déclaré sur le réseau professionnel n'a
  // rien à faire dans la salle du suivant.
  'linkedin_interactions',
  // Les divisions et les implantations d'un compte (PDF 2 §2). Les entités
  // sont re-seedées depuis les libellés des contacts ; les sites retenus sont
  // le geste du visiteur précédent et n'ont rien à faire dans la salle du
  // suivant. Les sites AVANT les entités : un site référence son entité.
  // Le catalogue de motifs d'écartement que le visiteur précédent a composé.
  'account_park_reasons',
  'need_unstaffable_reasons',
  // La capitalisation que le visiteur précédent a écrite.
  'testimonials',
  'rex_entries',
  'proofs',
  // BEL-SC-243 (#3272) — le REX de perte et sa proposition de règle que le
  // visiteur précédent a écrits.
  // #3295 — la règle promue d'une proposition adoptée, avant sa proposition.
  'workspace_method_rules',
  'lost_deal_rule_proposals',
  'lost_deal_rex',
  'access_facts',
  'access_fact_questions',
  'account_partners',
  // #2127.37 — les suggestions « compte similaire » que le visiteur précédent a
  // masquées (même patron que `account_partners.dismissed_at` juste au-dessus,
  // scopé en plus par `user_id` et le SIREN candidat). Les garder ferait
  // s'ouvrir la carte du suivant sur des suggestions déjà écartées par
  // quelqu'un qu'il n'a jamais rencontré — une fuite entre espaces, silencieuse
  // parce qu'elle ne RETIRE que des lignes, elle n'en montre aucune de trop.
  'similar_account_dismissals',
  // #4055.10 — les personnes que le visiteur précédent a écartées sur « Complète ce compte » (par personne et par compte).
  'account_completion_dismissals',
  // #4419.8 — l'entreprise qu'un visiteur a choisie parmi des homonymes sur Découvrir.
  'employer_identity_choices',
  // #2843.30 — le gabarit qu'un visiteur a posé sur une routine ne se lègue pas au suivant.
  'routine_contents',
  // #2968 — même patron, même raison : les entreprises du Reverse Market que
  // le visiteur précédent a masquées sur un consultant, scopées en plus par
  // `user_id` et `consultant_id`. Les garder ferait s'ouvrir la fiche du
  // suivant sur des environnements déjà écartés par quelqu'un qu'il n'a
  // jamais rencontré.
  'reverse_market_dismissals',
  // #2411.11 — les risques de mission que le visiteur précédent a marqués
  // « traité ». Purgée : garder cette ligne ferait s'ouvrir la fiche du
  // suivant sur un risque déjà résolu par quelqu'un qu'il n'a jamais rencontré
  // — même raison que `reverse_market_dismissals` juste au-dessus.
  'mission_risk_resolutions',
  // #2875 (#2402.9) — le registre des déclencheurs commerciaux CANONIQUES.
  // Purgé : ce sont les événements écrits par la visite du précédent
  // (`governance.service.proposeDuplicates`, premier émetteur migré) ; les
  // garder ferait apparaître au suivant des déclencheurs qu'il n'a jamais
  // provoqués — même raison que `mission_risk_resolutions` juste au-dessus.
  'canonical_trigger_events',
  // #2875 (#2402.3) — les transitions de rôle posées par la visite du précédent.
  'contact_decision_role_history',
  // #2877 (#2385.4) — les signaux qualité posés par la visite du précédent.
  'outreach_message_quality_flags',
  // #3419.1 — les annotations posées par la visite du précédent.
  'outreach_message_variables',
  // #2151.14 / #2151.25 — les événements qu'une alerte de Découvrir surveille.
  // PURGÉS : ce sont les faits apparus pendant la visite du précédent (et les
  // deux lignes semées, qui reviennent au semis). Les garder ferait ouvrir
  // « Aujourd'hui » sur des alertes que le visiteur n'a pas vues naître — et
  // leur `surface` déjà stampée les empêcherait de ressortir.
  'discover_alert_events',
  // #2172 — les décisions prises sur les pistes à qualifier. Purgées : ce sont
  // les refus du visiteur précédent, et les hériter ferait ouvrir une file déjà
  // triée par quelqu'un d'autre.
  'qualification_lead_decisions',
  // Le pipeline PARTENAIRE d'un espace (tome 4) : les ESN qu'il démarche, leur
  // étape, les besoins reçus. Purgé comme le reste — c'est une relation
  // commerciale, elle appartient au visiteur qui l'a vue naître, pas au
  // suivant. ⚠️ `esn_directory` n'est PAS ici : il est PARTAGÉ entre tous les
  // espaces, ne porte aucun `workspace_id`, et le purger effacerait le
  // référentiel de tout le monde à chaque visite de démonstration.
  'partner_relations',
  // #2887 (#2371.8) — la revue d'un CV poussé à un partenaire : purgée avec
  // `partner_relations` dont elle dépend, même raison — une revue déjà vue
  // n'appartient pas au visiteur suivant.
  'partner_cv_pushes',
  // Les territoires SUIVIS par l'espace de démonstration. Les photos
  // (`territory_snapshots`) ne sont PAS purgées : elles sont partagées et
  // portent la moyenne de tout le monde.
  'territory_subscriptions',
  // Les photos mensuelles des STOCKS. Contrairement à `territory_snapshots`,
  // celles-ci sont scopées à l'espace — et elles sont RE-SEEDÉES à chaque
  // remise à neuf, parce que leur date doit rester « le mois dernier ». Les
  // garder ferait s'accumuler des mois anciens que plus rien ne lit, et le
  // balayage mensuel finirait par écrire une vraie photo de la salle par-dessus
  // le décor.
  'stock_snapshots',
  // L'objectif mensuel de marge (31/08/2026). Même raison EXACTE que les photos
  // juste au-dessus : ses mois sont CALCULÉS au semis pour rester « le mois
  // dernier », donc il se re-sème à chaque remise à neuf. Et surtout — c'est un
  // RÉGLAGE que le visiteur précédent a pu changer de sa main : le laisser en
  // place ferait hériter le suivant d'une cible qu'il n'a pas posée, sur un
  // écran dont tout l'intérêt est justement qu'elle vient de l'ESN.
  'finance_margin_targets',
  // #2770.37 — la politique d'équipe : même raison que l'objectif de marge juste au-dessus,
  // un RÉGLAGE que le visiteur précédent a pu changer ; elle se re-sème à chaque remise à neuf.
  'workspace_team_policy_settings',
  'sites',
  'account_entities',
  // Socle CRM : ce que le visiteur précédent a corrigé, écrit ou annoté. Les
  // notes sont du texte qu'il a tapé, le journal dit qui a changé quoi, et la
  // provenance porte son identifiant d'auteur — les trois partent avec lui, et
  // la salle repart sur la provenance du jeu d'exemple.
  'notes',
  'record_field_audit',
  'field_provenance',
  // #4016.L13 — ce qu'une source a dit contre un fait que le visiteur précédent a confirmé : part avec lui.
  'field_contradictions',
  // #4158.57 — un rapatriement d'espace personnel (jamais semé : la salle n'a pas d'espace perso). Le journal avant la demande.
  'workspace_merge_items',
  'workspace_merge_requests',
  // #2075.12/.13 — le commentaire d'une conclusion d'audit et le refus d'une
  // recommandation : du texte que le visiteur précédent a écrit, il part avec lui.
  'commercial_audit_feedback',
  // La timeline : ce que le visiteur précédent a saisi à la main, et ce qu'une
  // éventuelle capture aurait rapporté. Les échanges d'un inconnu dans la
  // salle du suivant seraient la fuite la plus visible du produit.
  'activities',
  'activity_sync_state',
  // #3719.4 — « exporté vers mon CRM le … » : l'export qu'un visiteur a poussé
  // vers SON espace CRM ne doit pas se lire, chez le suivant, comme le sien.
  'contact_crm_exports',
  // Les tâches du visiteur précédent : « Relancer le DSI » posé par quelqu'un
  // d'autre, dans la salle du suivant, se lit comme son propre travail.
  'tasks',
  // Pivot Projet : les rôles recherchés, le comité, les libellés d'étape
  // renommés et les motifs de perte ajoutés par le visiteur précédent. Laisser
  // « Shortlist envoyée » posé par quelqu'un d'autre en tête d'une colonne
  // ferait croire au suivant qu'il regarde son propre espace.
  // ⚠️ `submissions` AVANT `project_needs` (29/09/2026) : `submissions.need_id`
  // est `ON DELETE SET NULL`, et `submissions_unique` porte sur
  // (project_id, consultant_id, coalesce(need_id, 0)). Effacer les besoins
  // d'abord mettait deux candidatures du même consultant sur la même affaire
  // à `need_id = NULL` → doublon → le reset entier échouait et la salle était
  // servie PÉRIMÉE (« reset failed — the room is served AS IS »).
  'submissions',
  'project_needs',
  'project_contacts',
  // #2320.23 (épopée #2967) — le journal des transitions de la chaîne
  // commerciale : sans clé étrangère (sujet polymorphe `subject_type` +
  // `subject_id`), il se purge à plat. Laissé, il raconterait au visiteur
  // suivant des déplacements d'affaires qu'il n'a jamais faits.
  'commercial_transitions',
  // L2 Pipe — le journal des montants et dates prévues : à plat, comme celui des transitions.
  //   Laissé, il raconterait au visiteur suivant des reports de date qu'il n'a jamais faits.
  'opportunity_field_changes',
  'pipeline_stage_labels',
  // Le SLA d'étape réglé par le visiteur précédent (PDF 3 §3.5). Même raison
  // que le renommage d'étape juste au-dessus : un seuil poussé à 90 jours par
  // quelqu'un d'autre ferait croire au suivant que le pipe de la salle ne
  // coince nulle part. Purgé = retour aux défauts du produit, 7/14/7/21.
  'deal_stage_sla',
  // #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes.
  // Même raison exacte que `deal_stage_sla` juste au-dessus : un visiteur peut
  // les régler, et purgé = retour à « jamais réglé » pour le suivant.
  'workspace_reverse_market_settings',
  'workspace_commercial_load_settings',
  // #2899 — échantillons anonymisés d'évals : la salle n'échantillonne jamais (voir `demo-coverage.ts`).
  'chat_eval_samples',
  'loss_reasons',
  'account_feedback',
  // #4114.4 — « ce sont les mêmes » / « pas les mêmes » d'un visiteur précédent : purgé, la paire redevient proposée.
  'contact_duplicate_decisions',
  // #1919 — les retours du visiteur précédent sur les réponses de Laura. Le geste
  // n'écrit rien en démonstration (voir `demo-coverage.ts`) : cette ligne est la
  // ceinture qui va avec, pour un appel direct à l'API depuis la salle.
  'chat_reply_feedback',
  // #3671.2bis — « Mauvaise entreprise » sur une carte Découvrir. Table
  // autonome (aucun FK, le candidat n'a pas de ligne `accounts`) : sa position
  // est libre. Laisser le signalement du visiteur précédent exclurait un SIREN
  // des recherches du suivant sans qu'il ait rien déclaré.
  'discover_candidate_feedback',
  // Les corrections d'organigramme du visiteur précédent : « Julien Nicolas est
  // en fait DSI Groupe », avec sa raison, sa preuve et son nom. Laisser sa
  // correction dans la salle du suivant lui ferait lire le travail d'un
  // inconnu comme le sien — même raison que `notes` et `record_field_audit`.
  'org_graph_corrections',
  // #2159.35 — les corrections de rapprochement de contact (« ce n'est pas la
  // bonne fiche »), une ligne PAR geste, jamais mise à jour ni supprimée (on
  // archive, on ne supprime pas). MÊME raison que `org_graph_corrections`
  // juste au-dessus, et même patron que `entity_resolution_corrections` côté
  // compte : la décision porte l'auteur du visiteur précédent, la laisser la
  // ferait lire au suivant comme la sienne. AVANT `contacts` qu'elle référence.
  'contact_resolution_corrections',
  // #1617.4 — les rapprochements de mémoire marché que le visiteur précédent a
  // tranchés (« c'est bien cette entreprise » / « ce n'est pas exact »). MÊME
  // raison que les corrections d'organigramme juste au-dessus : la ligne porte
  // le nom de qui a décidé, et une décision sans auteur ne peut pas se
  // discuter. La laisser ferait lire au suivant l'arbitrage d'un inconnu comme
  // le sien — et le compte départagé aurait DISPARU de la file « À départager »
  // de `/pilotage/qualite`, donc l'écran qu'on vient lui montrer serait plus
  // vide qu'il ne devrait.
  //
  // ⚠️ Elle est l'EXCEPTION scopée au milieu de six tables `market_*` : les
  // cinq autres portent un fait de MARCHÉ, n'ont aucun `workspace_id` et ne
  // sont ni purgées ni purgeables (les purger effacerait le corpus de tous les
  // espaces). Celle-ci porte une décision D'ESPACE, donc elle part avec lui.
  'market_company_resolution_override',
  'account_shares',
  'account_vocabulary',
  'attack_angles',
  // #2927 — les contacts PERSONNELS importés par le visiteur : propres à lui, ils ne survivent pas à sa session.
  'personal_contacts',
  'contacts',
  // #2777 — les apprentissages (objection/engagement) que la sortie
  // `learnings` de la cascade compte rendu écrit sur un compte. Même raison
  // que `contacts` juste au-dessus : un apprentissage laissé par le visiteur
  // précédent se lirait comme un fait connu du suivant sur SON compte.
  'account_memory',
  'action_plans',
  'analysis_runs',
  // #1911.1 — le titre des fils du visiteur précédent part avec ses messages :
  // un titre qu'il a saisi ne doit pas nommer le fil du suivant.
  'chat_thread_titles',
  // #2430 — l'objet conversation du visiteur précédent (propriétaire, branche,
  // rattachement, conservation légale) et ses versions figées partent avec ses
  // messages : un lien figé ne doit pas borner le fil du suivant.
  'chat_conversation_versions',
  'chat_conversations',
  // #1916.24 — les traces des éléments de mémoire envoyés pour une réponse :
  // AVANT les messages et les éléments qu'elles relient (aucune n'est écrite en
  // démonstration, mais une purge ne s'appuie pas sur un effet de bord).
  'chat_reply_memory_uses',
  // #2429.9 (épopée #2852, lot P07) — les versions d'un artefact de chat : AVANT les
  // messages qu'elles relient (la cascade les emporterait, mais une purge ne
  // s'appuie pas sur un effet de bord).
  'chat_artifact_versions',
  'chat_messages',
  'conversation_summaries',
  // #1916.23 — AVANT les éléments qu'il raconte (la cascade l'emporterait de
  // toute façon, mais une purge ne s'appuie pas sur un effet de bord).
  'memory_fact_events',
  'memory_pinned_facts',
  'signal_history',
  'opportunities',
  // Action OS : traces d'exécution du visiteur précédent. Une salle remise à
  // neuf ne doit pas montrer les runs, les approbations en attente ni les
  // réservations de crédits de quelqu'un d'autre.
  'approval_requests',
  'workflow_runs',
  'credit_reservations',
  // #2366 / #2382 — le modèle canonique de l'outreach : le journal et les
  // versions AVANT leur message, le message AVANT la séquence qu'il référence.
  // Lot L-D1 (#4167) — le journal d'une règle AVANT la règle (la cascade le ferait aussi, l'ordre le dit).
  'automation_rule_firings',
  'automation_rule_trials',
  'automation_rules',
  'outreach_transitions',
  'outreach_delegations',
  'outreach_message_versions',
  'outreach_call_tasks',
  // #4739 — « Mes angles » : angles personnels semés dans la salle.
  'user_angles',
  // #4737 — le journal d'envoi AVANT le mandat qu'il référence.
  'linkedin_send_log',
  'linkedin_mandates',
  'outreach_messages',
  'outreach_sequences',
  // #2369.9/.10/.13/.7/.8 (épopée #2768) — le socle de la mémoire de style :
  // les propositions AVANT les templates qu'elles référencent.
  'message_style_rule_proposals',
  'message_style_templates',
  // #3441/#3442/#3444/#3445 (lot C20) — la bibliothèque de gabarits : même régime
  // que `message_style_templates` juste au-dessus (contenu propre à CET espace,
  // purgé pour que le visiteur suivant n'hérite pas des gabarits du précédent).
  'message_library_entries',
  'message_library_traces',
  // Marchés locaux (04/10/2026, L1) — zones d'un espace et brief de marché : contenu propre
  // à CET espace, purgé pour que le visiteur suivant n'hérite pas des zones du précédent
  // (la salle les reçoit de nouveau au semis, lot L5).
  'market_zones',
  // #3754 — les postes cibles de l'ESN : contenu propre à CET espace, purgé pour que le visiteur suivant
  // n'hérite pas des postes importés par le précédent (la salle les reçoit de nouveau au semis).
  'esn_target_personas',
  // #3756 — la bibliothèque de modèles de séquence : contenu propre à CET espace, purgé pour que
  // le visiteur suivant n'hérite pas des campagnes importées du précédent (re-semée à l'entrée).
  'sequence_templates',
  // #3755 — la grille de qualification de l'espace et l'évaluation des comptes : contenu
  // propre à CET espace (la grille d'un visiteur ne passe pas au suivant). L'évaluation
  // AVANT la grille qu'elle référence ; les critères partent par leur grille (join).
  'account_qualifications',
  'qualification_grids',
  // #2385.5 (épopée #2877) — même régime que `message_style_rule_proposals`
  // juste au-dessus, sa voisine la plus proche : un snapshot VERSIONNÉ
  // calculé sur l'historique de CET espace. Le laisser ferait hériter le
  // visiteur suivant d'un apprentissage tiré de messages qu'il n'a jamais
  // écrits.
  'message_learning_rule_proposal_snapshots',
  // #2369.2/.3 (LOT SOIR 26/09) — l'import pour apprentissage : son corps
  // (`raw_text`) ne doit survivre à AUCUN visiteur suivant.
  'message_style_imports',
  'team_comments',
  // Théo D team-review.N1 — le compte rendu d'un point d'équipe est celui d'UN visiteur.
  'team_reviews',
  // Théo D team-recherches — les recherches conservées d'une salle ne survivent à aucun visiteur.
  'team_research_entries',
  // #2455 — les contextes de travail d'un visiteur ne doivent pas apparaître
  // au suivant. Enfant AVANT parent (`work_context_activations` référence
  // `work_contexts`) — une purge ne s'appuie pas sur la cascade FK.
  'work_context_activations',
  'work_contexts',
  'user_actions',
  'product_events',
  'provider_costs',
  // Épopée #2879 (#2442.14) — le compteur de sécurité (accès refusés). Même
  // raison que `provider_costs` juste au-dessus : back-office seulement,
  // jamais affiché côté application (voir `demo-coverage.ts`).
  'security_events',
  'credit_ledger',
  // #2975 — les leviers de coût réglés par un visiteur (admin) ne doivent pas
  // survivre au suivant : un budget mensuel fixé dans une salle de démo n'a de
  // sens pour personne d'autre que celui qui l'a réglé.
  'workspace_budgets',
  'member_objectives',
  // Théo D team-business.N2 — une cible proposée à un membre ne survit pas au visiteur suivant.
  'objective_proposals',
  'consultant_cv_rewrites',
  'cv_versions',
  'skill_alias_proposals',
  // Un plan d'attaque préparé par un visiteur ne doit pas survivre au suivant.
  'need_plays',
  'consultant_push_feedback',
  // Les documents AVANT les talents : la contrainte est en cascade, mais une
  // purge qui dépend d'un effet de bord du schéma se met à laisser des lignes
  // le jour où quelqu'un change la contrainte.
  // Les positionnements AVANT les talents et les projets : la contrainte est en
  // cascade des deux côtés, mais une purge qui dépend d'un effet de bord du
  // schéma se met à laisser des lignes le jour où quelqu'un change la contrainte.
  'submission_feedback',
  // #2335.5 — le retour consultant, une table à part (jamais fusionnée avec
  // `submission_feedback` ci-dessus) : même règle de purge, AVANT les
  // positionnements.
  'submission_consultant_feedback',
  'interviews',
  // Le journal du matching AVANT les positionnements et les talents : ses
  // lignes de détail pendent d'un run, et le run d'un besoin.
  'shortlists',
  // Les parcours de chaîne (PDF 6 §6) : ils portent où en est CE dossier de
  // démonstration, donc ils se purgent avec lui. Les garder ferait réapparaître
  // un compte à la position 7 d'une chaîne pour le visiteur suivant, sur un
  // dossier qui vient d'être recréé.
  //
  // ⚠️ `chain_runs` n'est plus ÉCRITE depuis que les parcours se dérivent des
  // objets (#1503) ; elle reste purgée parce qu'un espace de démonstration
  // recyclé ne doit rien garder d'un visiteur précédent, y compris des lignes
  // archivées. `chain_manual_marks`, elle, est bien écrite : ce sont les gestes
  // hors outil cochés sur les missions de la salle.
  'chain_runs',
  'chain_manual_marks',
  // #2916 / #2399.2 (c93) — le sort du matching automatique d'un besoin : il
  // pend du besoin et du run, purgé AVANT eux.
  'need_auto_matches',
  'match_runs',
  'match_weight_versions',
  // Les documents (devis, NDA, contrat cadre) et les prochaines étapes
  // cochables d'un besoin (fiche besoin, dossier du 26/08) — filles du besoin
  // qu'un visiteur crée ou coche : les garder ferait réapparaître le devis
  // d'un dossier de démonstration précédent sur un besoin qui vient de renaître.
  'need_documents',
  'need_steps',
  // #2171.22 — les prochaines étapes cochables d'une OPPORTUNITÉ, même raison
  // que need_steps juste au-dessus : filles de l'opportunité qu'un visiteur
  // coche, les garder ferait réapparaître les étapes d'un dossier de
  // démonstration précédent.
  'project_steps',
  // #2126.47-.60 (épopée #2787) — le ledger APPEND-ONLY des outcomes
  // commerciaux : ce qu'un visiteur précédent a enregistré (relation
  // qualifiée, refus…) n'a rien à faire dans la salle du visiteur suivant,
  // même raison que `need_steps`/`project_steps` juste au-dessus.
  'commercial_outcomes',
  // #2171.24 — les documents d'une OPPORTUNITÉ (devis, NDA, contrat cadre),
  // même raison : filles de l'opportunité, un statut coché par un visiteur ne
  // doit pas survivre à la salle de démonstration suivante.
  'project_documents',
  // #2193.51 (épopée #2953) — les documents d'une MISSION (contrat signé,
  // avenant, NDA), même raison que `project_documents` juste au-dessus :
  // filles de la mission, un statut coché par un visiteur ne doit pas
  // survivre à la salle de démonstration suivante.
  'mission_documents',
  // Les plans d'enrichissement d'organigramme et le focus du plan d'action
  // (31/08/2026). Le premier porte ce qu'un visiteur a lancé et ce que ça a
  // coûté ; le second est le réglage qu'il a poussé sur les axes du plan. Les
  // garder ferait démarrer le visiteur suivant sur une salle où quelqu'un a
  // déjà dépensé des crédits et déjà retouché le focus — ce n'est plus une
  // démonstration, c'est le brouillon de quelqu'un d'autre.
  'org_enrichment_jobs',
  'org_focus_weights',
  // #2326.12 (épopée #2794) — l'orchestrateur async d'import de CV : ce qu'un
  // visiteur a déposé (progression, rapport) ne doit pas survivre à la salle
  // du visiteur suivant, même raison que `org_enrichment_jobs` juste au-dessus.
  'cv_batch_import_jobs',
  // #1952.3 (épopée #2844, lot SRC5 28/09 soir) — même régime, sa voisine la
  // plus proche : le lot de matching massif qu'un visiteur a lancé (besoins,
  // issues) ne doit pas survivre à la salle du suivant.
  'bulk_matching_jobs',
  // #1952.6 (épopée #2844, lot SRC5 28/09 soir) — même régime : l'export en
  // lot qu'un visiteur a lancé (progression, CSV fini) ne doit pas survivre
  // à la salle du suivant.
  'bulk_export_jobs',
  // #1952.7 (épopée #2844, lot SRC5 28/09 soir) — même régime : la recherche
  // multi-sources qu'un visiteur a lancée sur un besoin (progression,
  // candidats classés) ne doit pas survivre à la salle du suivant.
  'multi_source_search_jobs',
  // #1952.5 (épopée #2844, lot SRC5 28/09 soir) — même régime : le lot de
  // réécriture de CV qu'un visiteur a lancé (progression, issues) ne doit
  // pas survivre à la salle du suivant. La démonstration refuse déjà le
  // geste unitaire (crédit + appel modèle) ; ce lot hérite du même refus,
  // aucune ligne ne devrait donc jamais exister ici.
  'bulk_cv_rewrite_jobs',
  // #2386.9 — la télémétrie de la session de prospection, PAR PARCOURS. Ce
  // qu'un visiteur a réellement généré (`ProspectingSessionDialog`) ne doit
  // pas survivre à la salle du visiteur suivant, même raison que
  // `cv_batch_import_jobs` juste au-dessus.
  'prospecting_sessions',
  // Import universel (27/09/2026) — le rapport (table fille) AVANT son job ;
  // ce qu'un visiteur a importé ne survit pas à la salle du suivant.
  'universal_import_issues',
  'universal_import_jobs',
  // #4422.1 — l'historique des imports de l'assistant d'un visiteur ne se lègue pas au suivant.
  'context_pack_imports',
  'consultant_skills',
  // L3 Pilotage › Staffing — les congés semés pendent du consultant (cascade), purgés avant lui sans en dépendre.
  'consultant_absences',
  // #2328.9/.10/.22/.23 (épopée #2793) — l'expérience structurée qui prouve
  // une compétence pend du consultant, comme `consultant_skills` juste
  // au-dessus (`source_experience_id` s'efface tout seul, ON DELETE SET NULL,
  // mais la ligne elle-même doit partir avant son consultant).
  'consultant_experiences',
  // #2327 — les décisions d'identité du visiteur précédent (« pas la même
  // personne », « attribuer »…) pendent de ses fiches : effacées AVANT elles,
  // sans dépendre de la cascade.
  'talent_identity_decisions',
  // Théo C talents-recrutement — le journal des étapes pend de la personne (clé étrangère) : effacé AVANT elle.
  'talent_recruitment_events',
  'consultant_documents',
  // #2185.51 — un brouillon de message pend du talent, pas de l'espace : un
  // visiteur suivant ne doit pas hériter le brouillon du précédent.
  'talent_prepared_messages',
  // #2329.35-.41 (épopée #2948) — le consentement à représenter PAR COMPTE
  // pend d'un consultant ET d'un compte : purgé avant les deux, même règle
  // que les autres filles d'un talent juste au-dessus.
  'consultant_account_consent',
  'consultants',
  'library_items',
  // Le catalogue d'assets outreach (#2838) : même raison, même geste que
  // `library_items` juste au-dessus — lazy-seedé au premier affichage, il ne
  // doit pas laisser un asset édité ou supprimé par le visiteur précédent.
  'outreach_assets',
  // #2957 (#2180.54) — les fichiers SOURCES d'un dossier d'appel d'offres :
  // AVANT `rfps` qu'elle référence (`rfp_id`, `ON DELETE CASCADE` la suivrait
  // de toute façon, mais une purge explicite ne dépend jamais d'un FK pour
  // rester lisible — même discipline que le reste de cette liste).
  'rfp_source_documents',
  // #2957 (#2180.53) — l'import interrompu du visiteur précédent n'a rien à faire dans la salle du suivant.
  'rfp_import_sessions',
  // Appel d'offres : un dossier importé par le visiteur précédent, avec ses
  // exigences et sa décision. Il n'a rien à faire dans la salle du suivant.
  'rfps',
  // Delivery OS. Les relevés passent par DEMO_PURGE_JOIN_TABLES (ils ne portent
  // pas d'espace) ; les AFFECTATIONS et les CONDITIONS commerciales, si, depuis
  // le staffing (T7) — elles sont donc listées ici, avant leur mission.
  // Reprise CRM : les liens d'import et leur journal. Les laisser ferait
  // croire au visiteur suivant qu'un CRM a été importé dans SA salle.
  // Gouvernance : les vues, les champs et les doublons du visiteur précédent.
  // L'ordre compte — les VALEURS avant leur définition.
  'custom_field_values',
  'custom_field_defs',
  'duplicate_pairs',
  // #4016 L6 — les lignes « détecté, à revoir » de la salle précédente.
  'pipeline_detections',
  'saved_views',
  // Les décisions prises par le visiteur précédent. Une porte franchie n'a de
  // sens que sur SES données : la laisser rendrait un journal qui parle de
  // dossiers que le visiteur suivant ne voit pas.
  'decision_gate_crossings',
  // Les permissions accordées en propre par le visiteur précédent. Les laisser
  // donnerait au suivant des droits que personne ne lui a accordés — c'est la
  // seule ligne de cette liste dont l'oubli élève un privilège.
  'workspace_member_permissions',
  // Les sociétés déclarées par le visiteur précédent. Une raison sociale
  // laissée en place réapparaîtrait dans le sélecteur du suivant, sur une
  // mission qu'elle n'a jamais portée.
  'legal_entities',
  // Playbooks et file d'intervention. Un playbook laissé ARMÉ par le visiteur
  // précédent enverrait des e-mails dans la salle du suivant : c'est la seule
  // ligne de cette liste dont l'oubli sort de l'écran et atteint un tiers.
  'playbook_sends',
  'playbook_subscriptions',
  'interventions',
  'sync_record_events',
  'sync_runs',
  'sync_links',
  // Le refus d'une personne. Une salle est réattribuée : un arrêt laissé par le
  // visiteur précédent ferait croire au suivant qu'un contact d'exemple a
  // demandé qu'on cesse — une parole attribuée à quelqu'un qui ne l'a pas dite.
  'contact_stops',
  // #2309.16/.19 — les candidats jamais devenus une fiche (identité ambiguë /
  // doublon à l'import). Une salle réattribuée ne doit pas hériter du compteur
  // du visiteur précédent.
  'contact_intake_exclusions',
  // #2297 — les effacements de personne. La route les refuse en démonstration,
  // donc aucun ne devrait exister ; un qui traînerait empêcherait le semis
  // suivant de recréer un contact d'exemple, en silence.
  'person_erasures',
  // Les preuves de capacité de connecteur : elles pendent d'un outil branché, et
  // une salle de démonstration n'en branche aucun.
  'connector_capability_probes',
  // #2445.12 (épopée #2766) — même régime que `connector_capability_probes`
  // juste au-dessus, sa voisine la plus proche : la chronologie des
  // transitions d'un connecteur branché. Aucun outil n'est branché en
  // démonstration, donc aucune ligne à garder.
  'connector_capability_incidents',
  // #2445.12 (épopée #2766, lot SRC5 28/09 soir) — même régime, sa table
  // FILLE : le journal d'actions/communications d'un incident. Aucun
  // connecteur branché en démonstration ⇒ aucun incident, donc aucune ligne
  // à garder ; et le lien `ON DELETE CASCADE` vers `connector_capability_incidents`
  // exige de partir AVANT elle.
  'connector_capability_incident_logs',
  // #2261.13 — les synchronisations mesurées pour la latence probable d'un
  // outil connecté : même régime que `connector_capability_probes`, sa
  // voisine la plus proche (voir `tool-latency-observation.entity.ts`).
  // Aucun outil n'est branché en démonstration, donc aucune ligne à garder.
  'tool_latency_observations',
  // Les sessions d'import : un visiteur peut en ouvrir une, elle ne doit pas
  // survivre à sa visite.
  'import_sessions',
  // Les demandes d'écriture CRM en attente : aucun CRM n'est branché en
  // démonstration, donc aucune ne devrait exister — et une qui traînerait
  // suivrait le visiteur suivant.
  'outbound_write_requests',
  // #2565 — les tentatives d'écriture « facture chez le connecteur » : aucun
  // outil de gestion n'est branché en démonstration, l'adaptateur RETENU
  // refuse systématiquement, sans aucun appel réseau — une ligne qui traînerait
  // suivrait quand même le visiteur suivant.
  'invoice_connector_write_requests',
  // #2814 — les pièces jointes d'une facture préparée : une pièce déposée par
  // un visiteur ne suit pas le suivant. AVANT `missions` et `storage_objects`.
  'invoice_attachments',
  // #2196.31 — l'exception « non applicable » d'un relevé : un mois marqué
  // (ou annulé) par un visiteur ne doit pas suivre le suivant. Porte
  // `workspace_id` — la liste plate. AVANT `missions` (cascade de la clé
  // étrangère), comme les autres tables qui pendent d'une mission.
  'mission_timesheet_exceptions',
  // #2419.1 — les paiements saisis par un visiteur ne suivent pas le suivant.
  // AVANT `invoice_readiness`, qu'ils référencent par clé étrangère.
  'invoice_payments',
  'invoice_readiness',
  // #2417.3/.4/.5 — jalons et déclarations de facturation saisis par un
  // visiteur. AVANT `missions` (cascade de la clé étrangère).
  'mission_milestones',
  'mission_billing_declarations',
  // #2407.5/.6 — le journal des transitions de statut d'un visiteur.
  'mission_status_transitions',
  // #2423 — les avenants (changements de mission) proposés par un visiteur.
  'mission_amendments',
  // #2412 — le double pouls de satisfaction (client/consultant) déposé par un
  // visiteur ne doit pas suivre le suivant. AVANT `missions` (cascade de la
  // clé étrangère), même raison que `mission_amendments` juste au-dessus.
  'mission_feedback',
  // #2338 / #2409 — les accords et prérequis de démarrage confirmés par un
  // visiteur ne suivent pas le suivant. AVANT `missions` (clé étrangère).
  'mission_start_checks',
  // #2414 (LAU-FINAL-128) / épopée #2986 — la checklist de sortie et la
  // déclaration d'interruption saisies par un visiteur ne suivent pas le
  // suivant. AVANT `missions` (clé étrangère), même raison que
  // `mission_start_checks` juste au-dessus.
  'mission_end_checks',
  // #3269 (BEL-SC-240) — les six jalons de delivery déclarés par un visiteur
  // ne suivent pas le suivant. AVANT `missions` (clé étrangère), même raison
  // que `mission_end_checks` juste au-dessus.
  'mission_delivery_milestones',
  'mission_interruptions',
  // #2563/#2567 — les mois préparés et l'option « préparer chaque mois » : une saisie de visiteur ne suit pas le suivant. AVANT `missions` (clé étrangère).
  'mission_month_preparations',
  'mission_invoice_auto_prepare',
  'mission_commercial_terms',
  // Les frais de mission (30/08/2026) : une ligne saisie par un visiteur ne
  // doit pas apparaître dans la marge du suivant. Porte `workspace_id` — la
  // liste plate, pas la jonction.
  'mission_expenses',
  // Les paiements SORTANTS (31/08/2026) : un paiement préparé, validé ou
  // refusé par un visiteur ne doit pas apparaître dans la file du suivant.
  // AVANT `supplier_invoices` : la ligne référence la facture qui la justifie,
  // et effacer le parent d'abord ne dépendrait plus que du `ON DELETE SET NULL`
  // — une purge qui repose sur un effet de bord du schéma se met à laisser des
  // lignes le jour où quelqu'un change la contrainte.
  'outgoing_payments',
  // Les factures fournisseur (30/08/2026) : même raison, même colonne
  // `workspace_id`, même liste plate.
  'supplier_invoices',
  // La CESSION de créance (31/08/2026). Les trois portent `workspace_id`, donc
  // la liste plate — et dans CET ordre : un règlement référence une cession,
  // une cession référence un contrat ET une mission. Purger le contrat en
  // premier ferait porter l'effacement par une cascade plutôt que par la
  // requête, et une cascade ne se relit pas dans cette liste.
  'factoring_settlements',
  'receivable_assignments',
  'factoring_contracts',
  // Le dossier d'administration des ventes (31/08/2026). Une référence cliente
  // ou des conditions de règlement saisies par un visiteur ne doivent pas
  // suivre le suivant : il verrait un dossier « complet » qu'il n'a pas rempli,
  // c'est-à-dire exactement l'inverse de ce que l'écran démontre. Purgé AVANT
  // `missions`, dont il dépend par clé étrangère.
  'mission_adv_records',
  'mission_assignments',
  // #2407.10 / #2417.7 (22/09/2026 soir) — la fenêtre de TJM passé posée par
  // `DeliveryService.updateMission`. Porte `workspace_id` — la liste plate,
  // comme `mission_commercial_terms` juste au-dessus. AVANT `missions`,
  // dont elle dépend par clé étrangère (`ON DELETE CASCADE`).
  'mission_rate_history',
  'missions',
  // #3750 — les morceaux citables d'un document. Porte `workspace_id` ; AVANT
  // `rag_documents`, dont il dépend (`ON DELETE CASCADE`) — la purge se lit
  // dans cette liste, jamais dans une cascade.
  'rag_document_chunks',
  'rag_documents',
  'workspace_active_selections',
  'workspace_invitations',
  // #2016 — une demande d'accès à la salle (improbable : aucun domaine réel)
  // ne doit pas survivre au visiteur qui l'a vue arriver.
  'workspace_join_requests',
  // #2018.7 — un signalement d'information fausse ne peut structurellement pas
  // apparaître dans cette salle (voir sa raison dans `DEMO_INTENTIONALLY_EMPTY`,
  // demo-coverage.ts), mais elle porte `workspace_id` et se purge comme le reste.
  'esn_profile_correction_requests',
  // LA MÉMOIRE COLLECTIVE (01/09/2026) — le journal de contribution. Purgé comme
  // le reste : il compte des mises en relation, donc l'usage d'un visiteur, et
  // le laisser survivre montrerait au suivant une équipe qui s'est parlé sans
  // lui. Il porte bien `workspace_id`, donc il va dans CETTE liste-ci.
  'workspace_bridge_contacts',
  'api_keys',
  // Théo D settings-outils.N1 — le cadre d'un accès assistant : une demande faite par un visiteur ne survit pas à la remise à zéro.
  'mcp_access_intents',
  // Le cache du pipeline et la trace de sa lecture pendent d'une connexion CRM,
  // qui est purgée juste en dessous. Les laisser survivre afficherait le
  // pipeline du visiteur précédent à celui d'après — un tableau de bord
  // commercial complet, qui n'est même pas le sien.
  'crm_deal_facts',
  'crm_pipeline_syncs',
  // SYNC-A — le miroir CRM (affaires, activités, propriétaires, pipelines et étapes) : même raison.
  'crm_activities',
  'crm_deals',
  'crm_stages',
  'crm_pipelines',
  'crm_owners',
  'crm_connections',
  'google_connections',
  'microsoft_connections',
  'notion_connections',
  // SCOPES-I (18/10/2026) — l'écart de portées d'une connexion OAuth ; elle pend des connexions
  // ci-dessus, purgée avec elles.
  'connector_scope_gaps',
  // LES NOTES DE FRAIS (31/08/2026) — enfants d'abord, parents ensuite.
  //
  // ⚠️ Elles sont posées ICI, et pas en fin de liste : `accounts` doit rester
  // le DERNIER effacement (une garde de `demo-reset.service.spec.ts` le
  // vérifie), parce que la moitié des tables de la salle le référencent.
  //
  // Elles viennent APRÈS `missions` et `mission_expenses` sans risque : leurs
  // deux clés étrangères vers ces tables sont `ON DELETE SET NULL`, donc une
  // mission effacée DÉTACHE la note au lieu de bloquer la purge. Les liens
  // INTERNES au domaine, eux, sont `ON DELETE CASCADE` — l'ordre ci-dessous les
  // respecte quand même, parce qu'une purge qui compte sur la cascade cesse
  // d'être lisible le jour où quelqu'un change une contrainte.
  //
  // Aucune de ces tables ne peut être « gardée » : une note de frais nomme une
  // PERSONNE et porte des montants. La laisser en place montrerait au visiteur
  // suivant qui s'est fait rembourser quoi dans la salle du précédent.
  'expense_report_lines',
  'expense_report_attachments',
  'expense_reports',
  'expense_policy_caps',
  // Le barème kilométrique tombe AVANT sa politique, comme les plafonds : la
  // cascade le ferait, mais une purge qui compte sur la cascade cesse d'être
  // lisible le jour où quelqu'un change une contrainte.
  'expense_mileage_rates',
  'expense_policies',
  // #2373.9 — la preuve d'autorisation d'une introduction. Scopée
  // `workspace_id` : la laisser hériterait le visiteur suivant d'un accord
  // (ou d'un refus) obtenu par quelqu'un d'autre, sur un contact fictif qui
  // n'est même plus le sien après le prochain bail. AVANT `accounts` (et son
  // contact cible) : `accounts` doit rester la DERNIÈRE table de cette liste.
  'introduction_authorizations',
  // #3695.4/.6, #3696 — la trace du brouillon (modèle/style appliqué,
  // correction manuelle). Scopée `workspace_id` et référence `contact_id` :
  // même raison qu'`introduction_authorizations` juste au-dessus, AVANT
  // `accounts` (et son contact cible).
  // Théo M2 — envoi programmé — AVANT ses deux clés étrangères (validation, version) : l'envoi daté par le
  // visiteur précédent ne survit pas au bail.
  'scheduled_message_sends',
  // Théo B C6.N2 — la validation d'une version de brouillon : AVANT `message_draft_versions` (clé étrangère).
  'message_draft_validations',
  // Théo B M2.R6 — l'archivage d'un brouillon par le visiteur précédent : AVANT `message_draft_versions` (clé étrangère).
  'message_draft_archivals',
  'message_draft_versions',
  // #2438.3 — l'audit serveur d'un appel d'outil de chat du visiteur
  // précédent. `workspace_id` nullable (résolution serveur, jamais deviné) :
  // laissée en place, elle nommerait au suivant les outils qu'un autre a
  // appelés dans SA salle. AVANT `accounts`, même raison qu'au-dessus.
  'ai_tool_call_audit_log',
  // #2445.6 (#2442.16, épopée #2766) — le snapshot MASQUÉ des appels d'outil
  // du visiteur précédent, gardé pour le bac à sable de rejeu. Même raison
  // que `ai_tool_call_audit_log` juste au-dessus : laissée en place, elle
  // nommerait au suivant les outils qu'un autre a appelés dans SA salle.
  'chat_tool_call_recordings',
  // LES FICHIERS RANGÉS (31/08/2026). APRÈS les deux tables qui les
  // référencent — l'ordre est celui de la lisibilité, pas de la contrainte :
  // `ON DELETE SET NULL` tolérerait l'inverse, mais une purge qui compte sur la
  // cascade cesse d'être lisible le jour où quelqu'un change une contrainte.
  //
  // ⚠️ Cette purge efface les LIGNES, pas les octets. Ce n'est pas un oubli :
  // le semis calcule des chemins STABLES pour la salle (un identifiant dérivé
  // de l'espace et du fichier), donc le semis suivant réécrit exactement les
  // mêmes objets au lieu d'en accumuler. Rien ne s'entasse, et un visiteur ne
  // peut pas lire les octets du précédent — le chemin ne s'ouvre que par une
  // URL signée, qu'aucune ligne ne permet plus de demander.
  'storage_objects',
  'esn_profiles',
  // #2422.6 (épopée #2869, lot R24 07/10/2026) — le lien signé à portée
  // limitée. AVANT `legal_contracts`, même raison qu'ailleurs dans cette
  // liste : la ligne référence `contract_id` (`ON DELETE CASCADE` tolérerait
  // l'ordre inverse, mais une purge qui compte sur la cascade cesse d'être
  // lisible le jour où quelqu'un change la contrainte).
  'legal_contract_upload_links',
  // #2422.4 (épopée #2869) — le contrat juridique typé d'un compte. AVANT
  // `accounts`, même raison qu'au-dessus : la ligne référence `account_id`.
  'legal_contracts',
  // Épopée #2880 (lot V33) — le croisement expertise ↔ fondement/preuve,
  // semé par `seedExpertiseGroundings` : purgé pour qu'une remise à neuf ne
  // le duplique pas (aucune clé unique : une paire peut porter plusieurs preuves).
  'expertise_groundings',
  // ⚠️ `accounts` DOIT rester la DERNIÈRE entrée de cette liste : contacts,
  // angles, plans et toute table scopée par contact/compte se purgent avant —
  // `introduction_authorizations` et `ai_tool_call_audit_log` ci-dessus y
  // compris (dédupliqué à la fusion de la vague 18 : les deux avaient été
  // ajoutées indépendamment, ici et par le correctif de la vague 17).
  'accounts',
  // #2120.57 / #2297.23 — `enrichment_duration_samples` (durée d'un
  // enrichissement, `EnrichConfirmDialog`) N'EST PAS dans cette liste, et ce
  // n'est pas un oubli : même famille que les cinq `market_*` non scopés
  // ci-dessus — AUCUN `workspace_id`, AUCUN `user_id` par construction
  // (`enrichment-duration-sample.entity.ts` — une latence du PRODUIT, doctrine
  // `c64_analytique_produit`, jamais une donnée d'espace). La purger effacerait
  // le pool de mesures de TOUS les espaces, pas seulement celui du visiteur
  // qu'on remet à neuf. `demo-coverage.ts` ne la classe donc ni « seedée » ni
  // « vide à dessein » (`demo-coverage.spec.ts` refuse toute entrée qui n'est
  // pas réellement purgée) : la salle de démo interroge le même endpoint
  // anonyme que tout espace réel et voit la même médiane, ou la même ligne
  // honnête « non mesurée » sous 5 mesures — rien à semer séparément.
] as const

/**
 * Workspace-scoped tables a reset must NOT touch — each for a stated reason, so
 * the leak-guard spec can tell « decided to keep » from « forgot ».
 *
 *  - `email_suppressions`: an opt-out must never be resurrected (#394 / RFC 8058).
 *    Deleting it would re-enable mail to someone who asked to be left alone —
 *    the one row that outranks « the demo must look pristine ».
 *  - `workspace_members`: the owner's membership. Delete it and the space stops
 *    resolving for its own user.
 *  - `manual_billing_terms`: operator-set billing configuration of the demo
 *    space, not visitor content.
 *  - `manual_billing_invoices`: the invoices emitted for that configuration.
 *    Same reason, and one more: purging them would make the demo space look
 *    like a client nobody has invoiced for months — the exact alert this ledger
 *    exists to raise, fired on a room that is nobody's account.
 *  - `owner_invitations`: the persisted state of a manually-provisioned owner's
 *    activation e-mail (#2643.2) — same category as the two rows above,
 *    operator/provisioning state, not visitor content. A demo workspace is
 *    seeded directly and never goes through sales-led provisioning, so this
 *    table is normally empty for one anyway; keeping it (rather than purging)
 *    is the same "not visitor content" call as its two neighbours above.
 */
export const DEMO_KEEP_TABLES = [
  'email_suppressions',
  'workspace_members',
  'manual_billing_terms',
  'manual_billing_invoices',
  'owner_invitations',
] as const

/**
 * Fenêtre pendant laquelle un espace tout juste remis à neuf n'est PAS re-purgé.
 *
 * Le lien de démo est ouvert : un rafraîchissement de page, un second onglet ou
 * un robot suffit à déclencher une redemption. Sans cette fenêtre, l'espace
 * serait effacé pendant que quelqu'un le présente — le pire moment possible.
 * 90 secondes couvrent la rafale (ouverture + rechargement) sans jamais faire
 * hériter un visiteur des traces d'une VRAIE session précédente : au-delà, la
 * remise à neuf reprend.
 */
export const DEMO_RESET_FRESH_WINDOW_MS = 90_000

/**
 * Durée par défaut d'un bail de salle de démo — la SOURCE du réglage (`DEMO_LEASE_TTL_MINUTES`),
 * que `DemoPoolService` lit et transmet ici. Elle sert aussi de GRÂCE au marqueur « servie en
 * secours » : ce marqueur ne protège qu'un visiteur présent, donc il ne vaut que le temps d'un bail.
 */
export const DEMO_LEASE_TTL_DEFAULT_MINUTES = 30

interface DemoResetOutcome {
  /** Number of DELETE statements executed (one per purged table). */
  purged: number
  /** True when the golden dossiers were (re-)inserted — always true post-purge. */
  seeded: boolean
  accounts: number
  /** Vrai quand la purge a été sautée parce que l'espace venait d'être remis à
   *  neuf (voir {@link DEMO_RESET_FRESH_WINDOW_MS}). */
  skipped?: boolean
  /** Les tables que le semis remplit et qui étaient VIDES — c'est-à-dire ce qui
   *  manquait à l'écran du visiteur. Vide quand la salle était complète. */
  missing?: readonly string[]
}

/* ------------------------------------------------------------------ */
/*  Complétude d'une salle — sur TOUTES les tables, pas sur une seule   */
/* ------------------------------------------------------------------ */

/**
 * Un identifiant de table du dépôt, et rien d'autre.
 *
 * Ces noms viennent tous de constantes compilées ; la vérification existe pour
 * que la concaténation ci-dessous ne devienne jamais le chemin par lequel autre
 * chose entre dans une requête.
 */
const SQL_IDENTIFIER = /^[a-z][a-z0-9_]*$/

/** Comment lire, pour UNE salle, si une table du semis y tient au moins une ligne. */
interface DemoCompletenessProbe {
  readonly table: string
  /** Le prédicat qui restreint la table à la salle `$1`. */
  readonly where: string
}

let probeCache: DemoCompletenessProbe[] | null = null

/**
 * Les sondes de complétude d'une salle — une par table que le semis remplit.
 *
 * DÉRIVÉES, jamais recopiées. La liste des tables que le jeu de données remplit
 * vit dans `DEMO_SEEDED_TABLES` (`demo-coverage.ts`), et le moyen de restreindre
 * une table à UNE salle vit déjà dans les listes de purge de ce fichier.
 * Une liste écrite à la main ici divergerait de la couverture au premier écran
 * ajouté — c'est précisément ce qu'un critère de complétude ne doit pas faire
 * (GA-26 : un réglage vit à un seul endroit).
 *
 * Conséquence voulue : seeder une nouvelle table la fait entrer d'office dans le
 * critère, sans que personne ait à y penser.
 *
 * #2151.70 (16/09/2026) — TROISIÈME BRANCHE, POUR LES TABLES SCOPÉES `user_id`.
 *
 * `notifications`, `user_favorites` et `profile_context_revisions` sont
 * SEEDÉES (`DEMO_SEEDED_TABLES`) mais ne portent pas `workspace_id` — avant ce
 * lot, elles n'étaient PROBÉES nulle part : un semis à moitié raté sur l'une
 * d'elles ne faisait jamais réparer la salle, exactement le défaut que cette
 * fonction existe pour empêcher sur les tables `workspace_id`. La salle de
 * démonstration n'a qu'UN occupant (#1408) : restreindre par ce
 * propriétaire (`$2`, le même paramètre que la colonne d'identité juste en
 * dessous) restreint donc bien à CETTE salle.
 */
export function demoCompletenessProbes(): DemoCompletenessProbe[] {
  if (probeCache) return probeCache

  const joins = new Map(DEMO_PURGE_JOIN_TABLES.map(entry => [entry.table as string, entry]))
  const workspaceScoped = new Set<string>(DEMO_PURGE_TABLES)
  const userScoped = new Set<string>(DEMO_PURGE_USER_TABLES)
  const probes: DemoCompletenessProbe[] = []
  const seen = new Set<string>()

  for (const table of DEMO_SEEDED_TABLES) {
    if (seen.has(table)) continue
    seen.add(table)
    if (!SQL_IDENTIFIER.test(table)) throw new Error(`Demo completeness: unusable table name « ${table} »`)

    if (workspaceScoped.has(table)) {
      probes.push({ table, where: 'workspace_id = $1' })
      continue
    }

    if (userScoped.has(table)) {
      probes.push({ table, where: 'user_id = $2' })
      continue
    }

    // Une table seedée qui ne porte ni `workspace_id` ni `user_id` pend de son
    // parent : on la restreint PAR LUI, exactement comme la purge le fait déjà.
    const join = joins.get(table)
    if (!join || !SQL_IDENTIFIER.test(join.column) || !SQL_IDENTIFIER.test(join.parent)) {
      // Aucun moyen connu de rattacher cette table à UNE salle. La garde de
      // couverture l'interdit déjà en amont (`demo-coverage.spec.ts` exige que
      // toute table seedée soit purgée d'une des deux façons) ; ici on refuse
      // de deviner plutôt que de sonder l'espace du voisin.
      throw new Error(`Demo completeness: no way to scope « ${table} » to a single room`)
    }
    probes.push({
      table,
      where: `${join.column} IN (SELECT id FROM ${join.parent} WHERE workspace_id = $1)`,
    })
  }

  probeCache = probes
  return probes
}

/**
 * La table qui porte l'IDENTITÉ de la salle, et le nom sous lequel son absence
 * est rapportée. Une seule constante pour les deux : le critère et le message
 * doivent désigner la même chose.
 */
const DEMO_IDENTITY_TABLE = 'profiles'

/**
 * Le critère d'IDENTITÉ — le seul de cette requête qui ne porte pas sur du
 * contenu, et le seul scopé par le PROPRIÉTAIRE (`$2`) plutôt que par l'espace.
 *
 * Pourquoi il ne passe pas par {@link demoCompletenessProbes} : `profiles`
 * n'est ni purgée par espace ni pendue à un parent — elle n'est pas purgée du
 * tout, parce que l'identité n'est pas du contenu de visiteur. Elle ne peut
 * donc pas être dérivée des listes de purge comme les autres, et l'y forcer
 * inventerait un rattachement qui n'existe pas.
 *
 * `false` = la salle n'a pas d'identité présentable : soit le profil est
 * ANONYMISÉ (un visiteur a supprimé le compte de la salle depuis Réglages ›
 * Confidentialité, et le pied de la barre latérale affiche « [supprimé]
 * [supprimé] »), soit il n'a jamais porté de prénom et l'écran retombe sur
 * « Utilisateur ». Un profil ABSENT rend `NULL`, donc ni vrai ni faux : le
 * doute profite à la salle (voir {@link readsEmpty}).
 */
const DEMO_IDENTITY_COLUMN = [
  `(SELECT p.anonymized_at IS NULL AND NULLIF(btrim(COALESCE(p.first_name, '')), '') IS NOT NULL`,
  `   FROM ${DEMO_IDENTITY_TABLE} p WHERE p.user_id = $2) AS "identity"`,
].join('\n       ')

/**
 * #2989 (26/09/2026, recette écran) — le filtre BU de `/missions/planification`
 * restait absent en démo malgré le correctif du compte (#3077, `15128d1369`) :
 * la cause n'était pas le semis, RATTACHÉ dès ce correctif, mais ce critère de
 * complétude. `demoCompletenessProbes` ne sait sonder qu'« une table du semis
 * porte au moins une ligne » (dérivé de `DEMO_SEEDED_TABLES`) — jamais UNE
 * COLONNE d'une ligne déjà là. Une salle du pool semée AVANT #3077 porte déjà
 * `business_units` (posée par `seedBusinessUnits`, indépendamment du client) ET
 * son compte client : les deux sondes existantes restaient vertes, la salle se
 * lisait complète, et `business_unit_id` restait NULL pour toujours sur elle —
 * exactement la doctrine « un correctif de collecte rattrape l'existant, mais
 * seul un rejeu le fait » (agent_docs/doctrine.md), sans le rejeu.
 *
 * Ce critère-ci sonde donc la COLONNE, scopé sur LE compte du client d'exemple
 * (`$3`, jamais un autre) : `NULL` (colonne vide OU compte pas encore semé)
 * rend `false` franc — jamais un `NULL` SQL — donc `readsEmpty` le traite comme
 * les autres sondes, sans lui inventer une règle à part.
 */
const DEMO_DELIVERY_CLIENT_BU_COLUMN = `(SELECT business_unit_id FROM accounts
          WHERE workspace_id = $1 AND company_name = $3) IS NOT NULL AS "delivery_bu"`

/**
 * #3135 — l'empreinte du semis PORTÉE PAR LA SALLE elle-même (`workspaces`,
 * jamais purgée), comparée à `demoSeedFingerprintFor(variante)` — celle du process
 * courant — dans `readRoom`. `NULL` (salle semée avant ce correctif, ou avant
 * que `seedWorkspace` ait fini d'écrire) ne matche jamais une chaîne : elle
 * est donc lue comme périmée, par construction, et jamais comme « à jour ».
 */
const DEMO_SEED_FINGERPRINT_COLUMN = `(SELECT demo_seed_fingerprint FROM workspaces
          WHERE id = $1) AS "fingerprint"`

/** #4291 J — le numéro de la salle : il dit sa VARIANTE (staffing ou forfait), donc l'empreinte qu'elle doit porter. */
const DEMO_SLOT_INDEX_COLUMN = `(SELECT demo_slot_index FROM workspaces
          WHERE id = $1) AS "slot_index"`

/** #3806 — la date à laquelle la salle a été servie EN SECOURS à l'ancienne empreinte (`NULL` sinon). */
const DEMO_STALE_SERVED_COLUMN = `(SELECT demo_stale_served_at FROM workspaces
          WHERE id = $1) AS "stale_served_at"`

/**
 * #3806 — la clé du verrou de re-semis d'une salle. Le pool la TENTE (sans
 * attendre) avant de servir une salle à l'ancienne empreinte : tenue ailleurs,
 * c'est qu'une purge y tourne — on ne la sert pas.
 */
export const demoReseedLockKey = (workspaceId: string): string => `bellum:demo-reset:${workspaceId}`

/** La requête UNIQUE qui dit l'état d'une salle : sa fraîcheur, ses dossiers,
 *  une sonde par table du semis, et l'identité de son propriétaire. Construite
 *  une fois, elle ne varie pas. */
let roomStateSqlCache: string | null = null
function roomStateSql(): string {
  if (roomStateSqlCache) return roomStateSqlCache
  const columns = demoCompletenessProbes().map(
    (probe, index) => `EXISTS (SELECT 1 FROM ${probe.table} WHERE ${probe.where}) AS "p${index}"`,
  )
  roomStateSqlCache = [
    'SELECT (SELECT MAX(created_at) FROM accounts WHERE workspace_id = $1) AS newest,',
    '       (SELECT COUNT(*) FROM accounts WHERE workspace_id = $1) AS dossiers,',
    `       ${columns.join(',\n       ')},`,
    `       ${DEMO_DELIVERY_CLIENT_BU_COLUMN},`,
    `       ${DEMO_SEED_FINGERPRINT_COLUMN},`,
    `       ${DEMO_SLOT_INDEX_COLUMN},`,
    `       ${DEMO_STALE_SERVED_COLUMN},`,
    `       ${DEMO_IDENTITY_COLUMN}`,
  ].join('\n')
  return roomStateSqlCache
}

/**
 * ⚠️ Le doute profite à la salle.
 *
 * Seul un `false` FRANC vaut « cette table est vide ». Avec la règle inverse,
 * un pilote qui rendrait `null` — ou une colonne absente — ferait purger une
 * salle COMPLÈTE sous les yeux de celui qui la présente : l'accident exact que
 * le pool de salles existe pour éviter. Se tromper dans CE sens-ci laisse au
 * pire une salle tronquée une visite de plus, ce qui est l'état d'avant.
 */
function readsEmpty(probe: unknown): boolean {
  return probe === false || probe === 'f' || probe === 'false'
}

/** L'état d'une salle, lu en une requête. */
interface DemoRoomState {
  /** Horodatage du dossier le plus récent, `null` quand la salle n'en a aucun. */
  newest: number | null
  /** Nombre de dossiers présents. */
  dossiers: number
  /** Ce qui manque, NOMMÉ. Vide = la salle est entière. */
  missing: string[]
  /** #3135 — vrai quand l'empreinte stampée sur la salle diffère de celle du
   *  process courant (ou est absente) : la salle est complète mais PÉRIMÉE. */
  fingerprintStale: boolean
  /** #3806 — une empreinte est POSÉE (le semis l'écrit en dernier) : `false` = purge commencée ou semis pas fini. */
  fingerprintStamped: boolean
  /** #3806 — servie en secours à l'ancienne empreinte, à cette date (ms) ; `null` sinon. */
  staleServedAt: number | null
}

/**
 * Wipes and re-seeds the SHARED demo workspace on every redemption of the demo
 * link (see {@link DemoLinkService}).
 *
 * Why a reset at all: one demo space is handed to many prospects. Without it,
 * visitor N+1 opens the app on visitor N's leftovers — their searches, their
 * pinned notes, possibly their connected Slack. The reset makes every visit
 * start from the same staged, fictional space.
 */
/** Une étape de la purge — voir `purgePlan`. */
type PurgeStep =
  | { kind: 'join'; table: string; column: string; parent: string }
  | { kind: 'user'; table: string }
  | { kind: 'workspace'; table: string }
  | { kind: 'sql'; sql: string; params: unknown[]; counted: boolean }

/** Seuil au-delà duquel le DELETE d'une table de la purge est nommé au journal. */
const SLOW_PURGE_MS = 250

@Injectable()
export class DemoResetService {
  private readonly logger = new Logger(DemoResetService.name)

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly seed: DemoSeedService,
    // Incident pool du 04/10/2026 — la connexion dédiée hors pooler. Absente
    // (non fournie, ou `POSTGRES_DIRECT_PORT` non posé) : chemin d'avant.
    @Optional() private readonly direct?: DirectDbService,
    // #4573.10 — le seau privé des originaux (pack de contexte, CV) : absent, la salle se remet à zéro comme avant.
    @Optional() private readonly storage?: StorageClient,
  ) {}

  /**
   * L'état d'une salle, en UNE requête : sa fraîcheur, ses dossiers, et ce qui
   * lui manque — NOMMÉ.
   *
   * Une seule requête parce que ceci tourne à CHAQUE prise de bail, sur le
   * chemin le plus sollicité de la démonstration : vingt-sept allers-retours
   * coûteraient vingt-sept fois la latence réseau, là où vingt-sept sondes
   * `EXISTS` dans une même requête s'arrêtent chacune à la première ligne
   * trouvée.
   *
   * MESURÉ (PostgreSQL 16, 27 tables, 2 000 lignes chacune réparties sur 40
   * espaces, cas le PIRE — l'espace cherché est absent, donc chaque sonde doit
   * prouver le vide) : ~2 ms de planification, 0,2 ms d'exécution avec un index
   * sur `workspace_id` partout ; 0,5 ms sans les neuf index qui manquent
   * aujourd'hui (`account_partners`, `attack_angles`, `action_plans`,
   * `user_actions`, `rag_documents`, `consultant_skills`, `submission_feedback`,
   * `interviews`, `mission_commercial_terms`). ⚠️ Ce dernier chiffre suit la
   * TAILLE de ces tables : `user_actions` porté à 300 000 lignes le fait passer
   * à 7,8 ms. Le jour où il gêne, la réponse est un index sur `workspace_id`,
   * pas un critère qui regarde moins de tables.
   *
   * La fraîcheur se lit sur les dossiers eux-mêmes (`MAX(created_at)`), jamais
   * sur un compteur en mémoire : l'API tourne en plusieurs replicas, et un état
   * local dans l'une ne dirait rien de ce que l'autre vient de faire.
   */
  private async readRoom(workspaceId: string, ownerUserId: string): Promise<DemoRoomState> {
    const rows = await this.dataSource.query<Record<string, unknown>[]>(roomStateSql(), [
      workspaceId,
      ownerUserId,
      DEMO_DELIVERY_CLIENT.account.company_name,
    ])
    const row = rows?.[0]

    const rawNewest = row?.['newest']
    const newest = rawNewest ? new Date(rawNewest as string | number | Date).getTime() : null
    const parsed = Number(row?.['dossiers'] ?? 0)
    const dossiers = Number.isFinite(parsed) ? parsed : 0

    const missing = new Set<string>()
    // L'ancre garde son COMPTAGE : une salle qui n'a qu'un dossier sur six est
    // tronquée même si toutes ses tables tiennent une ligne.
    if (dossiers < DEMO_DOSSIERS.length) missing.add('accounts')
    demoCompletenessProbes().forEach((probe, index) => {
      if (readsEmpty(row?.[`p${index}`])) missing.add(probe.table)
    })
    // L'identité : une salle sans nom n'est pas une salle complète. Même règle
    // de prudence que les sondes — seul un `false` FRANC compte.
    if (readsEmpty(row?.['identity'])) missing.add(DEMO_IDENTITY_TABLE)
    // #2989 — la BU du client d'exemple : une COLONNE, pas une table, donc hors
    // de `demoCompletenessProbes`. Voir {@link DEMO_DELIVERY_CLIENT_BU_COLUMN}.
    if (readsEmpty(row?.['delivery_bu'])) missing.add('accounts.business_unit_id')

    // #3135 — `NULL` (jamais stampée) ou toute valeur différente du process
    // courant : la salle n'est pas déclarée « à jour » par défaut, elle doit
    // le PROUVER (l'inverse de `readsEmpty`, qui protège la salle du doute —
    // ici le doute profite au visiteur SUIVANT, pas à la salle périmée).
    // #4291 J — l'empreinte attendue est celle de la VARIANTE de la salle : une salle forfait semée comme une
    // salle staffing (ou l'inverse) est périmée, donc re-semée dans sa variante.
    const rawSlot = row?.['slot_index']
    const slotIndex = rawSlot === null || rawSlot === undefined ? null : Number(rawSlot)
    const fingerprintStale = row?.['fingerprint'] !== demoSeedFingerprintFor(demoRoomVariantOf(slotIndex))
    const stamp = row?.['fingerprint']
    const fingerprintStamped = typeof stamp === 'string' && stamp.length > 0
    const rawServed = row?.['stale_served_at']
    const servedAt = rawServed ? new Date(rawServed as string | number | Date).getTime() : null
    const staleServedAt = servedAt !== null && Number.isFinite(servedAt) ? servedAt : null

    return { newest, dossiers, missing: [...missing], fingerprintStale, fingerprintStamped, staleServedAt }
  }

  /**
   * #3578 — la salle est-elle servable TELLE QUELLE : empreinte à jour et semis
   * entier ? Une lecture. C'est ce qui permet au pool de ne servir qu'une salle
   * fraîche et d'envoyer les autres en re-semis d'arrière-plan.
   */
  async isRoomReady(workspaceId: string, ownerUserId: string): Promise<boolean> {
    const { missing, fingerprintStale } = await this.readRoom(workspaceId, ownerUserId)
    return !fingerprintStale && missing.length === 0
  }

  /**
   * #3578.2 — la salle peut-elle être SERVIE à un nouveau visiteur sans la
   * toucher ? À jour, entière, ET intacte : son semis est POSTÉRIEUR au dernier
   * bail (`previousLeaseAt`), donc aucun visiteur n'y a posé la main depuis.
   * Une salle libérée par un visiteur ne l'est pas : elle doit être remise à
   * neuf, mais en ARRIÈRE-PLAN — jamais dans la requête du visiteur suivant.
   * `previousLeaseAt = null` (jamais louée) : l'état « prêt » suffit.
   */
  async isRoomServable(workspaceId: string, ownerUserId: string, previousLeaseAt: Date | null): Promise<boolean> {
    const { newest, missing, fingerprintStale } = await this.readRoom(workspaceId, ownerUserId)
    if (fingerprintStale || missing.length > 0) return false
    if (previousLeaseAt === null) return true
    return newest !== null && newest > previousLeaseAt.getTime()
  }

  /**
   * #3806 — SECOURS pendant un changement d'empreinte : la salle porte un semis
   * ANCIEN mais FINI (empreinte posée — le semis l'écrit en dernier, la purge
   * l'efface en premier, donc jamais une salle en cours de semis) et INTACTE
   * depuis son dernier bail (aucun visiteur n'y a posé la main). La complétude
   * n'est PAS relue contre le semis courant : une table que le nouveau semis
   * ajoute manque forcément à une salle de l'ancien.
   */
  async isStaleRoomServable(workspaceId: string, ownerUserId: string, previousLeaseAt: Date | null): Promise<boolean> {
    const { newest, dossiers, fingerprintStale, fingerprintStamped } = await this.readRoom(workspaceId, ownerUserId)
    if (!fingerprintStale || !fingerprintStamped || dossiers === 0) return false
    if (previousLeaseAt === null) return true
    return newest !== null && newest > previousLeaseAt.getTime()
  }

  /**
   * Remet l'espace à neuf, SAUF s'il vient de l'être.
   *
   * C'est le chemin qu'emprunte le lien public quand une salle LIBRE est louée :
   * deux clics rapprochés (ou un robot qui suit l'URL) ne doivent pas effacer
   * l'espace sous les yeux de celui qui le montre. Au-delà de la fenêtre, la
   * purge reprend — un visiteur n'hérite jamais de la session d'un autre.
   *
   * La fenêtre exige aussi que la salle soit COMPLÈTE, et « complète » veut dire
   * TOUTES les tables du semis. Le critère a raté deux fois de suite parce qu'il
   * ne regardait qu'`accounts` : d'abord « il existe des dossiers et ils sont
   * récents » (une salle à un dossier passait), puis « six dossiers » — et le
   * 28/08 une salle en production portait bien ses six dossiers, ses contacts et
   * ses projets, avec ZÉRO consultant sur dix-sept et UNE mission sur cinq. Un
   * semis interrompu produit exactement cette signature, et cette salle-là se
   * présentait comme neuve à chaque bail.
   *
   * Un prospect voyait alors « Ton vivier est vide » — pire qu'un écran
   * d'erreur, parce qu'il en conclut que le produit est vide.
   */
  async resetWorkspaceUnlessFresh(
    workspaceId: string,
    ownerUserId: string,
    windowMs: number = DEMO_RESET_FRESH_WINDOW_MS,
    previousLeaseAt: Date | null = null,
    staleServeGraceMs: number = DEMO_LEASE_TTL_DEFAULT_MINUTES * 60_000,
  ): Promise<DemoResetOutcome> {
    // INC-04-10 — la décision se prend SOUS le verrou : prise avant, elle laissait
    // le second process (autre replica, chevauchement de déploiement) re-purger
    // une salle que le premier venait de remettre à neuf.
    return this.underReseedLock(workspaceId, client =>
      this.resetUnlessFreshLocked(workspaceId, ownerUserId, windowMs, previousLeaseAt, staleServeGraceMs, client),
    )
  }

  private async resetUnlessFreshLocked(
    workspaceId: string,
    ownerUserId: string,
    windowMs: number,
    previousLeaseAt: Date | null,
    staleServeGraceMs: number,
    client?: DirectPgClient,
  ): Promise<DemoResetOutcome> {
    const { newest, dossiers, missing, fingerprintStale, staleServedAt } = await this.readRoom(workspaceId, ownerUserId)

    // #3806 — relu SOUS le verrou : un autre réplica a servi cette salle en secours APRÈS que le balayage a
    // décidé de la remettre à neuf. Elle a un visiteur : on ne la purge pas sous lui.
    //
    // #4810 (panne du 29/10/2026) — ce que le marqueur dit, et la SEULE chose qu'il dise, c'est « quelqu'un
    // est DEDANS en ce moment ». Il se mesure donc contre le BAIL, jamais contre l'ordre des deux dates :
    // comparé à `previousLeaseAt`, il condamnait la salle. `settleWithoutWaiting` le posait après la
    // transaction de bail, donc quelques centaines de ms APRÈS `demo_leased_at` ; « marqueur postérieur au
    // bail » restait vrai pour toujours, la purge était sautée à chaque passage, et la salle ne redevenait
    // jamais fraîche — ni servable en secours, son semis étant dès lors antérieur à son bail. Les cinq salles
    // staffing de production s'y sont éteintes l'une après l'autre : « Préparation de ta démo… » pendant plus
    // d'une heure, zéro semis tenté, zéro erreur au journal.
    if (staleServedAt !== null && Date.now() - staleServedAt < staleServeGraceMs) {
      this.logger.log(`Demo workspace ${workspaceId} was served as a stale-fingerprint room since — skipping the purge`)
      return { purged: 0, seeded: false, accounts: dossiers, skipped: true, missing: [] }
    }

    // #3578 — une salle re-semée EN ARRIÈRE-PLAN attend son visiteur plus de 90 s.
    // Elle est pourtant propre : son semis est POSTÉRIEUR au dernier bail (tout
    // visiteur re-date le bail à l'entrée et à chaque battement), donc personne
    // n'y a touché depuis. La purger ici ferait attendre ~70 s le visiteur que
    // le re-semis d'arrière-plan devait épargner.
    if (
      !fingerprintStale &&
      missing.length === 0 &&
      newest !== null &&
      previousLeaseAt !== null &&
      newest > previousLeaseAt.getTime()
    ) {
      this.logger.log(`Demo workspace ${workspaceId} was re-seeded since its last visitor — skipping the purge`)
      return { purged: 0, seeded: false, accounts: dossiers, skipped: true, missing: [] }
    }

    // COMPLÈTE, À JOUR et récente — pas seulement récente. La fenêtre protège
    // une salle qui vient d'être remise à neuf CORRECTEMENT (#3135) : une
    // salle à l'empreinte périmée n'est jamais « fraîche », même reposée à
    // l'instant, sans quoi une salle juste re-semée avec l'ANCIEN process
    // resterait périmée pour toujours (le même bug que la fenêtre existe pour
    // corriger, une couche plus bas).
    if (!fingerprintStale && missing.length === 0 && newest !== null && Date.now() - newest < windowMs) {
      this.logger.log(`Demo workspace ${workspaceId} was just reset — skipping the purge (fresh window)`)
      return { purged: 0, seeded: false, accounts: dossiers, skipped: true, missing: [] }
    }
    if (fingerprintStale) {
      // #3135 — NOMMÉ, jamais la donnée : ni l'empreinte attendue ni celle
      // trouvée ne sont loguées, seule la RAISON.
      this.logger.warn(`Demo workspace ${workspaceId}: stale seed fingerprint — purging and re-seeding`)
    } else if (dossiers > 0 && missing.length > 0) {
      // Dit à voix haute, et NOMMÉ : c'est la trace qui manquait pour
      // comprendre qu'une salle servait une démonstration tronquée.
      this.logger.warn(
        `Demo workspace ${workspaceId} is INCOMPLETE (${dossiers}/${DEMO_DOSSIERS.length} dossiers ; ` +
          `manquant : ${missing.join(', ')}) — purging and re-seeding`,
      )
    }
    return { ...(await this.purgeAndSeed(workspaceId, ownerUserId, client)), missing }
  }

  /**
   * Répare une salle TRONQUÉE que son visiteur occupe encore — et ne touche à
   * rien d'autre.
   *
   * La complétude n'était vérifiée qu'au moment où une salle LIBRE est louée à
   * quelqu'un de nouveau. Or le bail se renouvelle à chaque appel : un
   * navigateur qui revient rouvre indéfiniment SA salle, qui ne redevient donc
   * jamais libre. Une salle semée à moitié restait tronquée pour toujours, et
   * c'est ce qu'un visiteur a vu en production.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI RÉPARER PURGE, ALORS QUE LA SALLE EST OCCUPÉE
   * ─────────────────────────────────────────────────────────────────────────
   * Compléter sans effacer serait mieux, et ce n'est pas possible :
   * `DemoSeedService.seedWorkspace` est IDEMPOTENT sur la présence d'un seul
   * compte — il sort sans rien écrire dès que la salle porte un dossier, ce qui
   * est exactement le cas d'une salle tronquée. Le rendre incrémental, c'est
   * risquer douze dossiers là où le jeu en compte six. La seule réparation
   * disponible est donc « on efface et on re-sème », et le prix à payer est
   * connu : les gestes que le visiteur avait faits dans une salle À MOITIÉ VIDE
   * partent avec elle.
   *
   * Ce prix est accepté pour une raison : une salle tronquée ne montre rien
   * qu'il vaille la peine de protéger, et le visiteur qui la garde ne verra
   * JAMAIS le produit autrement. L'alternative n'est pas « garder ses gestes »,
   * c'est « garder un vivier vide pour le reste de sa visite ».
   *
   * La règle reste donc asymétrique, délibérément :
   *  - une salle COMPLÈTE appartient à celui qui la montre, et n'est jamais
   *    purgée sous ses yeux — c'est l'accident que le pool existe pour éviter ;
   *  - une salle INCOMPLÈTE est réparée, et le doute profite toujours à la
   *    première branche (voir {@link readsEmpty}).
   */
  async repairIfIncomplete(workspaceId: string, ownerUserId: string): Promise<DemoResetOutcome> {
    // INC-04-10 — même règle : verrou d'abord, lecture ensuite.
    return this.underReseedLock(workspaceId, client => this.repairLocked(workspaceId, ownerUserId, client))
  }

  /**
   * INC-04-10 — le semis d'une salle NEUVE (pool), sous le même verrou : sans
   * lui, le balayage d'un autre replica la voyait « incomplète » au milieu de
   * son semis et la purgeait dessous. `seeded: false` (la salle portait déjà
   * des dossiers) → réparation si elle est tronquée, toujours sous ce verrou.
   */
  async seedNewRoom(workspaceId: string, ownerUserId: string): Promise<DemoResetOutcome> {
    return this.underReseedLock(workspaceId, async client => {
      const seeded = await this.seed.seedWorkspace(workspaceId, ownerUserId)
      if (seeded.seeded) return { purged: 0, ...seeded }
      return this.repairLocked(workspaceId, ownerUserId, client)
    })
  }

  private async repairLocked(
    workspaceId: string,
    ownerUserId: string,
    client?: DirectPgClient,
  ): Promise<DemoResetOutcome> {
    const { dossiers, missing, fingerprintStale } = await this.readRoom(workspaceId, ownerUserId)
    if (!fingerprintStale && missing.length === 0) {
      return { purged: 0, seeded: false, accounts: dossiers, skipped: true, missing: [] }
    }

    if (fingerprintStale) {
      // #3135 — même renouvellement, mais une salle COMPLÈTE que son bail
      // reconduit indéfiniment : sans cette branche, une salle semée avant un
      // déploiement qui change le semis ne redevenant jamais libre, elle ne
      // s'y rattraperait JAMAIS. NOMMÉ, jamais la donnée.
      this.logger.warn(`Demo workspace ${workspaceId}: stale seed fingerprint and still leased — repairing`)
    } else {
      this.logger.warn(
        `Demo workspace ${workspaceId} is INCOMPLETE (${dossiers}/${DEMO_DOSSIERS.length} dossiers ; ` +
          `manquant : ${missing.join(', ')}) and still leased — repairing`,
      )
    }
    return { ...(await this.purgeAndSeed(workspaceId, ownerUserId, client)), missing }
  }

  async resetWorkspace(workspaceId: string, ownerUserId: string): Promise<DemoResetOutcome> {
    return this.underReseedLock(workspaceId, client => this.purgeAndSeed(workspaceId, ownerUserId, client))
  }

  /**
   * INC-04-10 — UN re-semis à la fois par salle, entre TOUS les process.
   *
   * Le 04/10/2026, deux process (2 replicas Railway + chevauchement de
   * déploiement) ont purgé la même salle à 40 ms d'écart. L'ancien verrou
   * (`pg_advisory_xact_lock`, BLOQUANT, pris dans la transaction de PURGE) avait
   * deux défauts :
   *  1. il était relâché au commit de la purge, AVANT le semis : le second
   *     process purgeait alors sous le semis du premier, qui insérait des
   *     `attack_angles` sur des comptes déjà effacés —
   *     `attack_angles_account_id_fkey`, puis des deadlocks. C'est LA cause de
   *     la violation de clé : l'ordre du semis (accounts → attack_angles) est
   *     juste, c'est la purge concurrente qui retire le compte ;
   *  2. bloquant, il faisait attendre le perdant jusqu'à 184 s en tenant une
   *     connexion du pooler Supavisor (pool côté Supabase épuisé), puis le
   *     laissait purger À NOUVEAU — la décision « périmée » était prise avant.
   *
   * Désormais : `pg_try_advisory_xact_lock` (NON bloquant) dans une transaction
   * DÉDIÉE qui reste ouverte pendant la purge ET le semis, puis valide. Une
   * transaction, parce que le pooler est en mode TRANSACTION (port 6543) : un
   * verrou de SESSION ne survit pas d'une requête à l'autre, un verrou de
   * transaction tient tant que la transaction tient. Dédiée, parce que le semis
   * écrit par ses propres connexions : purger et semer DANS la transaction du
   * verrou ferait attendre le semis sur des suppressions non validées (index
   * uniques) — un auto-interblocage. Coût assumé : une connexion immobilisée
   * le temps d'un re-semis, au plus une salle par balayage.
   *
   * Verrou non obtenu → on sort SANS RIEN FAIRE : un autre process s'en charge,
   * et le prochain balayage relira la salle.
   */
  private async underReseedLock(
    workspaceId: string,
    work: (client?: DirectPgClient) => Promise<DemoResetOutcome>,
  ): Promise<DemoResetOutcome> {
    if (this.direct?.configured) return this.underDirectReseedLock(workspaceId, work)
    const runner = this.dataSource.createQueryRunner()
    await runner.connect()
    let committed = false
    try {
      await runner.startTransaction()
      const rows = await runner.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked', [
        demoReseedLockKey(workspaceId),
      ])
      const locked = (rows as Array<{ locked?: unknown }> | undefined)?.[0]?.locked === true
      if (!locked) {
        this.logger.log(`Demo workspace ${workspaceId}: re-seed already running elsewhere — skipping`)
        return { purged: 0, seeded: false, accounts: 0, skipped: true, missing: [] }
      }
      const outcome = await work()
      await runner.commitTransaction()
      committed = true
      return outcome
    } finally {
      if (!committed) await runner.rollbackTransaction().catch(() => undefined)
      await runner.release()
    }
  }

  /**
   * Incident pool du 04/10/2026 — le même verrou par salle, mais de SESSION, sur
   * la connexion DÉDIÉE directe/session (`DirectDbService`) : fiable hors pooler
   * transaction, et il ne tient plus aucune place du pool des requêtes
   * utilisateurs. La purge passe sur cette même connexion (sa propre
   * transaction, validée avant le semis) ; le verrou de session, lui, couvre la
   * purge ET le semis puis est relâché — et Postgres le relâche seul si le
   * process meurt. Le semis (milliers d'écritures courtes) reste sur le pool :
   * chaque instruction n'y prend une place que quelques millisecondes.
   */
  private async underDirectReseedLock(
    workspaceId: string,
    work: (client?: DirectPgClient) => Promise<DemoResetOutcome>,
  ): Promise<DemoResetOutcome> {
    const key = demoReseedLockKey(workspaceId)
    return this.direct!.exclusive(async client => {
      const { rows } = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [key])
      if ((rows as Array<{ locked?: unknown }>)[0]?.locked !== true) {
        this.logger.log(`Demo workspace ${workspaceId}: re-seed already running elsewhere — skipping`)
        return { purged: 0, seeded: false, accounts: 0, skipped: true, missing: [] }
      }
      try {
        return await work(client)
      } finally {
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [key]).catch(() => undefined)
      }
    })
  }

  /**
   * L'ordre de la purge, en DONNÉES : les deux exécuteurs (pool, connexion
   * dédiée) suivent le même plan, donc le même ordre de clés étrangères.
   */
  private purgePlan(workspaceId: string, ownerUserId: string): PurgeStep[] {
    return [
      // #3747.2 — l'empreinte de la salle ne survit pas à sa purge. `workspaces` n'est jamais purgée : sans
      // cette ligne, une salle vidée puis re-semie garde l'empreinte de son semis D'AVANT pendant toute la
      // durée du nouveau (plusieurs minutes), et une lecture qui ne regarde que l'empreinte la jugerait « à
      // jour ». Posée à NULL ici (dans la transaction de purge), elle ne revient qu'en DERNIER, à la fin du
      // semis (`seedWorkspace`) : une salle à moitié semée — ou dont le semis a échoué — reste « périmée ».
      {
        kind: 'sql',
        counted: false,
        sql: 'UPDATE workspaces SET demo_seed_fingerprint = NULL WHERE id = $1',
        params: [workspaceId],
      },
      ...DEMO_PURGE_JOIN_TABLES.map(({ table, column, parent }): PurgeStep => ({
        kind: 'join',
        table,
        column,
        parent,
      })),
      ...DEMO_PURGE_USER_TABLES.map((table): PurgeStep => ({ kind: 'user', table })),
      // #1928 — les réglages de réponse du visiteur précédent partent ; la rangée
      // et les autres clés du sac restent. `jsonb - text[]` retire ces clés-là
      // en une écriture atomique, sans relire le sac.
      {
        kind: 'sql',
        counted: false,
        sql: 'UPDATE user_preferences SET preferences = preferences - $2::text[] WHERE user_id = $1',
        // #2896 / #2449.34 — le niveau d'action réglé est, lui aussi, un choix du
        // visiteur : le suivant ne doit pas trouver Laura bridée sans l'avoir demandé.
        params: [ownerUserId, [...REPLY_PREFERENCE_KEYS, ACTION_LEVEL_PREFERENCE_KEY]],
      },
      // Recette Y22 (03/10/2026) — `missions.business_unit_id → business_units(id)` n'a pas
      // d'`ON DELETE` (migration 1796421837419) et le semis #3413 rattache des missions à une
      // agence : purger `business_units` avant `missions` levait missions_business_unit_id_fkey,
      // la transaction était annulée et la salle servie PÉRIMÉE (« reset failed — served AS IS »).
      // On détache d'abord ; les missions partent ensuite avec le reste de l'espace.
      {
        kind: 'sql',
        counted: true,
        sql: 'UPDATE missions SET business_unit_id = NULL WHERE workspace_id = $1 AND business_unit_id IS NOT NULL',
        params: [workspaceId],
      },
      // Lot X80 — même défaut, seconde FK : `missions.submission_id REFERENCES submissions(id)`
      // (migration 1796321999852, sans `ON DELETE`) et `submissions` se purge AVANT `missions`.
      // Une mission créée depuis une candidature dans la salle ferait annuler la transaction.
      {
        kind: 'sql',
        counted: true,
        sql: 'UPDATE missions SET submission_id = NULL WHERE workspace_id = $1 AND submission_id IS NOT NULL',
        params: [workspaceId],
      },
      ...DEMO_PURGE_TABLES.map((table): PurgeStep => ({ kind: 'workspace', table })),
    ]
  }

  /** La purge sur la connexion DÉDIÉE : SQL brut, identifiants = constantes du plan, valeurs en paramètres. */
  private async purgeDirect(
    client: DirectPgClient,
    workspaceId: string,
    ownerUserId: string,
    slowTables: string[],
  ): Promise<number> {
    let statements = 0
    await client.query('BEGIN')
    try {
      for (const step of this.purgePlan(workspaceId, ownerUserId)) {
        const startedAt = Date.now()
        if (step.kind === 'join') {
          await client.query(
            `DELETE FROM "${step.table}" WHERE "${step.column}" IN (SELECT id FROM "${step.parent}" WHERE workspace_id = $1)`,
            [workspaceId],
          )
        } else if (step.kind === 'user') {
          await client.query(`DELETE FROM "${step.table}" WHERE user_id = $1`, [ownerUserId])
        } else if (step.kind === 'workspace') {
          await client.query(`DELETE FROM "${step.table}" WHERE workspace_id = $1`, [workspaceId])
        } else {
          await client.query(step.sql, step.params)
          if (step.counted) statements++
          continue
        }
        statements++
        if (step.kind !== 'user' && Date.now() - startedAt >= SLOW_PURGE_MS) {
          slowTables.push(`${step.table}=${Date.now() - startedAt}ms`)
        }
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    }
    return statements
  }

  /**
   * #3747.1 — « cannot execute INSERT in a read-only transaction » (SQLSTATE 25006) au re-semis.
   * Aucune ligne de ce dépôt ne pose de transaction en lecture seule : la cause est la CONNEXION — un
   * backend en lecture seule (réplica / bascule, `default_transaction_read_only`). On le sonde sur le pool
   * (là où le semis écrit) et sur la connexion dédiée (là où la purge écrit) AVANT de purger. Une sonde qui
   * échoue elle-même ne bloque rien : seul un « lecture seule » franc refuse.
   */
  private async assertWritable(client?: DirectPgClient): Promise<void> {
    const sql = "SELECT current_setting('transaction_read_only') AS read_only, pg_is_in_recovery() AS in_recovery"
    const isReadOnly = (row: Record<string, unknown> | undefined): boolean =>
      row?.['read_only'] === 'on' || row?.['read_only'] === true || row?.['in_recovery'] === true
    let pooled: Record<string, unknown> | undefined
    let direct: Record<string, unknown> | undefined
    try {
      pooled = (await this.dataSource.query<Record<string, unknown>[]>(sql))?.[0]
      if (client) direct = ((await client.query(sql)).rows as Record<string, unknown>[] | undefined)?.[0]
    } catch (error) {
      this.logger.warn('Demo reset: could not probe write access — continuing', {
        error: error instanceof Error ? error.message : String(error),
      })
      return
    }
    if (isReadOnly(pooled) || isReadOnly(direct)) {
      throw new Error(
        `Demo reset: the database connection is READ-ONLY (${isReadOnly(pooled) ? 'pool' : 'dedicated connection'}) — ` +
          'nothing was purged, the room is left untouched until a writable connection is available (SQLSTATE 25006)',
      )
    }
  }

  private async purgeAndSeed(
    workspaceId: string,
    ownerUserId: string,
    client?: DirectPgClient,
  ): Promise<DemoResetOutcome> {
    // #3747.1 — AVANT d'effacer quoi que ce soit : le semis écrit par le pool, la purge par la connexion
    // dédiée ; si l'une des deux est en lecture seule, purger puis échouer à re-semer laisse une salle vide
    // ou à moitié semée. On refuse d'abord, salle intacte, avec une cause NOMMÉE.
    await this.assertWritable(client)
    await this.releaseVisitorOriginals(workspaceId)
    const purgeStart = Date.now()
    const slowTables: string[] = []
    const purged = client
      ? await this.purgeDirect(client, workspaceId, ownerUserId, slowTables)
      : await this.purgePooled(workspaceId, ownerUserId, slowTables)
    // Recette du 01/10/2026 (« Préparation » ≈ 60 s) : la durée de la purge, et les tables
    // lentes par leur NOM — jamais une ligne.
    this.logger.log(
      `Demo purge durée : ${Date.now() - purgeStart}ms (${purged} tables${client ? ', connexion dédiée' : ''}) — lentes (≥ ${SLOW_PURGE_MS}ms) : ${slowTables.join(' ') || 'aucune'}`,
    )

    const seeded = await this.seed.seedWorkspace(workspaceId, ownerUserId)
    this.logger.log(`Demo workspace reset: ${workspaceId} (${purged} tables purged, accounts=${seeded.accounts})`)
    return { purged, ...seeded }
  }

  /**
   * #4573.10 — les ORIGINAUX qu'un visiteur a déposés (pack de contexte #4573, CV #4034) partent du seau privé AVANT la
   * purge : une fois les lignes effacées, plus rien ne désigne ces objets et ils resteraient sous `<espace>/` pour
   * toujours. Les objets du SEMIS (`storage_objects`) restent : leurs chemins sont stables, le semis les réécrit.
   * Un seau qui refuse ou une lecture qui échoue se journalise (compteurs, jamais un nom de fichier) et ne bloque
   * jamais la remise à zéro : la salle d'un prospect passe avant la propreté du seau.
   */
  private async releaseVisitorOriginals(workspaceId: string): Promise<void> {
    if (!this.storage) return
    try {
      const rows: unknown = await this.dataSource.query(
        `SELECT original_storage_path AS p FROM context_pack_imports
          WHERE workspace_id = $1 AND original_storage_path IS NOT NULL
         UNION ALL
         SELECT d.storage_path AS p FROM consultant_documents d
           JOIN consultants c ON c.id = d.consultant_id
          WHERE c.workspace_id = $1 AND d.storage_path IS NOT NULL`,
        [workspaceId],
      )
      const paths = (Array.isArray(rows) ? rows : [])
        .map(row => (row as { p?: unknown }).p)
        .filter((path): path is string => typeof path === 'string' && path.length > 0)
      if (paths.length === 0) return
      const removed = await this.storage.remove(paths)
      if (!removed)
        this.logger.error(`#4573.10 — ${paths.length} original(aux) non effacé(s) du seau (salle ${workspaceId})`)
    } catch (error) {
      this.logger.error(`#4573.10 — originaux de la salle ${workspaceId} non effacés : ${(error as Error).message}`)
    }
  }

  /** La purge par le pool partagé — le chemin d'avant, quand la connexion dédiée n'est pas configurée. */
  private async purgePooled(workspaceId: string, ownerUserId: string, slowTables: string[]): Promise<number> {
    return this.dataSource.transaction(async (trx: EntityManager) => {
      // INC-04-10 — sérialisé par `underReseedLock` (purge ET semis), plus ici.
      let statements = 0
      for (const step of this.purgePlan(workspaceId, ownerUserId)) {
        const startedAt = Date.now()
        if (step.kind === 'sql') {
          await trx.query(step.sql, step.params)
          if (step.counted) statements++
          continue
        }
        const where =
          step.kind === 'join'
            ? trx
                .createQueryBuilder()
                .delete()
                .from(step.table)
                .where(`${step.column} IN (SELECT id FROM ${step.parent} WHERE workspace_id = :workspaceId)`, {
                  workspaceId,
                })
            : step.kind === 'user'
              ? trx.createQueryBuilder().delete().from(step.table).where('user_id = :ownerUserId', { ownerUserId })
              : trx.createQueryBuilder().delete().from(step.table).where('workspace_id = :workspaceId', { workspaceId })
        await where.execute()
        statements++
        if (step.kind !== 'user' && Date.now() - startedAt >= SLOW_PURGE_MS) {
          slowTables.push(`${step.table}=${Date.now() - startedAt}ms`)
        }
      }
      return statements
    })
  }
}
