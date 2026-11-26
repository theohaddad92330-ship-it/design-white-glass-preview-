import type { MemoryLedgerSection, StorageDomain } from '@bellum/contracts'

/**
 * Couverture de l'espace de démonstration — la décision, table par table, de ce
 * qu'un visiteur DOIT voir rempli.
 *
 * Pourquoi ce fichier existe. Le lien de démo est ce qu'un commercial colle dans
 * un message : ce qui s'y ouvre est la première — parfois la seule — chose qu'un
 * prospect verra du produit. Or une fonctionnalité livrée est câblée sur les
 * données RÉELLES d'un compte client ; rien, dans le fait de la livrer, ne
 * remplit son écran côté démo. L'onglet « Sites » l'a montré : le code marchait,
 * la démo affichait « Aucun site identifié ».
 *
 * L'enchaînement de gardes se referme ici :
 *  1. `demo-reset.service.spec.ts` (leak guard) — toute entité portant
 *     `workspace_id` doit être classée purge OU keep. Une nouvelle table ne peut
 *     donc pas passer inaperçue.
 *  2. CE fichier — toute table purgée (= du contenu que le visiteur produit ou
 *     consulte) doit être classée : SEEDÉE, ou VIDE À DESSEIN avec la raison.
 *
 * Conséquence pratique : ajouter une fonctionnalité avec sa table fait échouer
 * la CI tant que la question « et en démo, ça montre quoi ? » n'a pas de
 * réponse écrite. C'est une décision, plus un oubli.
 *
 * ⚠️ Ne JAMAIS déplacer une table dans {@link DEMO_INTENTIONALLY_EMPTY} pour
 * faire passer le test : l'écran restera vide devant un prospect. La raison doit
 * tenir devant quelqu'un qui présente le produit.
 *
 * ⚠️ **Ce fichier garde les TABLES, et une table seedée ne suffit pas toujours.**
 * Un outil ou un écran peut lire une table pleine et rendre `[]` quand même,
 * parce que son FILTRE porte sur autre chose que l'existence des lignes. Le cas
 * mesuré le 29/08/2026 : le réseau dormant lit `contacts` — seedée depuis des
 * mois — mais exige une coordonnée ET un silence, et la salle refuse par
 * construction toute coordonnée aux personnes réelles. Deux contacts fictifs y
 * répondent, et rien ne le garantissait. Les cinq outils du second marché
 * (tome 6 §16) ont donc leur propre garde de parité :
 * `demo-copilot-second-market.spec.ts`.
 */

/**
 * « ET EN DÉMONSTRATION, LE MARQUEUR « PREMIÈRE OUVERTURE DU JOUR » DE LAURA
 * MONTRE QUOI ? » (#1936, lot 7A).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI `user_daily_brief` N'EST NI SEEDÉE NI « VIDE À DESSEIN » ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * La chaîne de gardes décrite au-dessus (leak guard → couverture) porte sur
 * les tables `workspace_id` : c'est ce qu'une salle prête peut faire fuiter
 * d'un visiteur à l'autre. `user_daily_brief` est scopée par `user_id`
 * (comme `user_last_seen`), donc HORS de ce périmètre par construction —
 * l'y classer romprait « ne classe que des tables réellement purgées ».
 *
 * La question a quand même une réponse écrite, et elle est plus forte qu'un
 * « vide à dessein » : la table n'est JAMAIS touchée pour un espace de
 * démonstration. `POST /briefing/first-open-today` vérifie
 * `isDemoWorkspace` AVANT d'appeler `DailyBriefMarkerService` et rend
 * toujours `{ isFirstOpenToday: true }` sans écrire — une salle est louée
 * `DEMO_LEASE_TTL_MINUTES` (30 minutes) à un visiteur différent à chaque
 * fois, et « premier du jour » n'a pas de sens pour un compte que personne
 * ne possède plus d'une demi-heure. Voir `demo-reset.service.ts` pour le
 * miroir de cette décision, à côté de `user_last_seen`.
 */

/**
 * « ET EN DÉMONSTRATION, LES DEMANDES QUE LAURA N'A PAS SU ROUTER MONTRENT
 * QUOI ? » (#1949.23, décision Louis 13/09 batch 12).
 *
 * `laura_unrouted_intents` n'a NI `workspace_id` NI `user_id` — c'est ce qui la
 * rend anonyme —, donc elle est HORS du périmètre des deux gardes ci-dessus par
 * construction, comme `user_daily_brief`. La réponse écrite, plus forte qu'un
 * « vide à dessein » : **rien n'y est jamais écrit depuis une salle**.
 * `IaProxyController.recordUnroutedIntent` vérifie `isDemoWorkspace` AVANT
 * d'appeler le service — un visiteur qui teste Laura ne laisse aucune trace dans
 * la lecture produit des vrais clients. L'écran qui la lit vit dans le
 * BACK-OFFICE (`/produit/laura-non-compris`), pas dans l'application qu'un
 * prospect ouvre : il n'y a pas d'écran de démonstration à remplir.
 *
 * Même réponse pour l'alerte « espace à risque » (#1946.22) : elle n'écrit
 * aucune table et ne part jamais pour une salle (`workspaceRiskAlert` → `demo`).
 */

/**
 * « ET EN DÉMONSTRATION, LE JUGE « RECOMMANDATION GÉNÉRIQUE » MONTRE QUOI ? »
 * (#3223, décision Louis 11/10/2026).
 *
 * `chat_generic_judgements` n'a NI `workspace_id` NI `user_id` (un jeton et
 * l'empreinte du juge, rattachés au message), donc elle est HORS du périmètre
 * des gardes ci-dessus par construction, comme `laura_unrouted_intents`. La
 * réponse écrite : **rien n'y est jamais écrit depuis une salle** —
 * `ReasoningJudgeSamplingService` ne tire que des réponses d'espaces réels
 * (`w.is_demo = false`), et la cascade sur `chat_messages` l'emporte avec la
 * purge d'une salle. L'écran qui la lit (`/produit/raisonnement`) vit dans le
 * BACK-OFFICE, pas dans l'application qu'un prospect ouvre : il n'y a pas
 * d'écran de démonstration à remplir. Même réponse pour le classement des
 * comptes et secteurs contestés, calculé à la lecture, sans table.
 */

/**
 * « ET EN DÉMONSTRATION, LA DURÉE ESTIMÉE D'UN ENRICHISSEMENT MONTRE QUOI ? »
 * (#2120.57, #2297.23, décision Louis 19/09/2026).
 *
 * `enrichment_duration_samples` n'a NI `workspace_id` NI `user_id` — c'est ce
 * qui la rend anonyme (une latence du PRODUIT, jamais une donnée d'espace,
 * doctrine `c64_analytique_produit`) —, donc elle est HORS du périmètre des
 * deux gardes ci-dessus par construction, comme `laura_unrouted_intents` et
 * `user_daily_brief`.
 *
 * Contrairement à ces deux-là, il y a bien un écran de démo à remplir
 * (`EnrichConfirmDialog`, monté dans la salle comme partout ailleurs) — mais
 * PAS de semis synthétique : `ContactsService.enrichContact` court-circuite
 * AVANT le seul appel mesuré dès qu'`isDemoWorkspace` répond vrai
 * (`enrichContactInDemo`, retour immédiat avec des coordonnées fictives), donc
 * aucune ligne authentique n'existe à écrire pour une salle — voir le test
 * « ne journalise AUCUNE durée » dans `contacts.service.spec.ts`. Écrire des
 * durées inventées directement dans la table aurait pollué la MÊME médiane
 * que lisent les vrais clients (`GET /contacts/enrichment-duration-estimate`
 * agrège TOUS les espaces sans distinction — c'est tout son intérêt), ce que
 * « jamais de donnée fictive » interdit.
 *
 * La salle lit donc EXACTEMENT le même endpoint que la production : une fois
 * 5 mesures réelles accumulées ailleurs, le dialogue de démo affiche la même
 * estimation honnête que tout le monde ; avant cela, il affiche « Durée : non
 * mesurée » — non mesuré n'est jamais 0 (GA-18/19), démo comprise.
 */

/**
 * « ET EN DÉMONSTRATION, LE FORMULAIRE DU LIEN DE DÉMO ÉCRIT QUOI ? » (#2705,
 * décision Louis 22/09/2026).
 *
 * `demo_leads` n'a NI `workspace_id` NI `user_id` — c'est ce qui la rend
 * anonyme (un prospect n'appartient à aucun espace, voir `table-scopes.ts`) —,
 * donc elle est HORS du périmètre des deux gardes ci-dessus PAR CONSTRUCTION,
 * comme `laura_unrouted_intents` et `enrichment_duration_samples` : elle
 * n'apparaît ni dans `DEMO_PURGE_TABLES`, ni dans `DEMO_PURGE_JOIN_TABLES`, ni
 * dans `DEMO_PURGE_USER_TABLES` (`demo-reset.service.ts`).
 *
 * ⚠️ CE QUE ÇA VEUT DIRE POUR CE FICHIER, ÉCRIT POUR NE PAS ÊTRE RE-TENTÉ : la
 * classer dans {@link DEMO_INTENTIONALLY_EMPTY} ferait ÉCHOUER
 * `demo-coverage.spec.ts` (« ne classe que des tables réellement purgées — une
 * entrée périmée ment sur la couverture ») — cette garde-là rejette
 * explicitement toute entrée hors des trois listes de purge. La question
 * « et en démo, ça montre quoi ? » a quand même une réponse écrite, plus
 * forte qu'un « vide à dessein » : **rien n'y est jamais écrit depuis une
 * salle**. `DemoController.createLead`/`touchLead` (`POST /demo/lead`,
 * `POST /demo/lead/touch`) sont des routes PUBLIQUES, hors authentification,
 * qui n'ont conscience d'aucune salle ni d'aucun `workspace_id` — un visiteur
 * qui ouvre la démo laisse un lead, jamais l'inverse. La table n'est donc ni
 * seedée pour la démo, ni purgée par elle : elle vit entièrement à côté,
 * lue par le back-office (`/prospects`, #2706), jamais par l'application
 * qu'un prospect ouvre.
 */

/**
 * « ET EN DÉMONSTRATION, L'ESTIMATION DE COÛT/DURÉE D'UN TOUR VÉRIFIÉ/APPROFONDI
 * MONTRE QUOI ? » (#2448.8, #2882.11, épopée #2882).
 *
 * `chat_turn_cost_samples` n'a NI `workspace_id` NI `user_id` — même raison
 * que `enrichment_duration_samples` ci-dessus (une latence/un coût du
 * PRODUIT, doctrine `c64_analytique_produit`) : HORS du périmètre des deux
 * gardes ci-dessus PAR CONSTRUCTION.
 *
 * Même patron que l'enrichissement, RIEN n'y est jamais écrit depuis une
 * salle : `IaProxyController.chat` rejette toute requête d'une salle de
 * démonstration AVANT le seul appel mesuré (`isDemoWorkspace`, message
 * « les réponses de Laura sont préparées à l'avance » — voir le bloc
 * #1942.2 / #1942.12 plus haut dans le contrôleur), donc aucune ligne
 * authentique n'existe à écrire depuis une salle. `ResearchModeSelector` lit
 * `GET ia/chat/mode-estimate` EXACTEMENT comme en production (même raison
 * que `GET contacts/enrichment-duration-estimate`) : avant 5 mesures réelles
 * accumulées ailleurs, il affiche « Durée non mesurée » — jamais 0 (GA-18/19),
 * démo comprise.
 */

/**
 * « ET EN DÉMONSTRATION, LES TROIS COMPORTEMENTS DU 16/09 SUR LES CARTES DE
 * LAURA MONTRENT QUOI ? » (#1930.14, #1931.19, #1931.20).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VIDE À DESSEIN — `workflow_runs`, `activities` et `tasks` sont SEEDÉES (voir
 * plus bas), mais aucune des trois nouveautés n'y a de représentant :
 * ─────────────────────────────────────────────────────────────────────────────
 *  - **#1930.14** (le diff avant/après de l'export CRM) : `DEMO_WORKFLOW_RUN`
 *    porte `definition_key: 'dormant_account_revival'` — une routine, pas une
 *    carte (`card_*`) — donc son unique pas `schedule_reminder` ne passe jamais
 *    par `previewOf('export_contact_to_crm', …)`. Aucun `export_contact_to_crm`
 *    n'est seedé.
 *  - **#1931.19** (« personne n'a été contacté ») : `DEMO_TASKS` ne modélise
 *    aucun statut — les quatre tâches semées restent `todo`. Sans tâche COCHÉE,
 *    `TasksService.recordCompletion` n'écrit jamais la ligne `kind: 'task'` /
 *    `direction: 'internal'` que `TimelinePanel` annote.
 *  - **#1931.20** (le résultat dans Actions et la timeline) : même raison que
 *    #1930.14 — `DEMO_WORKFLOW_RUN` n'est pas une carte, donc `settleResult`
 *    (et son ingestion dans `activities`) n'a jamais tourné dessus. Aucune ligne
 *    `kind: 'workflow'` n'est seedée.
 *    ⚠️ #3532 (02/10/2026) : UNE ligne `workflow` (« Préparer un message ») et douze `crm_lookup`
 *    sont désormais semées sur Société Générale (`DEMO_ACTIVITIES`) — la forme que `recordInTimeline`
 *    et `recordCrmLookup` écrivent ; le RÈGLEMENT d'une carte (`settleResult`) reste non rejoué.
 *
 * Les trois se corrigeraient par le MÊME geste — seeder une carte CRM `done`,
 * liée à un contact, avec sa prévisualisation ET son résultat déjà réglés — qui
 * dépasse le périmètre de ce lot borné (`.claude/notes/registre-2026-09-12.md`
 * lignes 438/460/461). Noté ici plutôt que masqué par la classification de
 * TABLE, plus grossière : ce fichier garde des tables, pas des comportements
 * (voir l'avertissement en tête de fichier sur `demo-copilot-second-market.spec.ts`).
 *
 *  - **#1943.17** (« champ support si nécessaire ») : même table, même limite.
 *    `cardResultOf` ne pose `supportSuggested: true` que sur un run
 *    `status: 'unknown'` (un timeout, cf. #1943.9) ; `DEMO_WORKFLOW_RUN` est
 *    `status: 'done'`, donc le bouton « Contacter le support » de
 *    `CopilotCards.tsx` n'a rien à montrer en salle de démonstration. Le
 *    correctif est le MÊME que ci-dessus — un second run seedé, en `unknown`
 *    cette fois — hors du périmètre de ce lot (`.claude/notes/registre-2026-09-12.md`,
 *    #1943.17, agent du 18/09/2026).
 *  - **#1943.13 / #1943.14** (« ce qui n'a pas été fait » / « ce qui a malgré
 *    tout réussi ») : même table, même limite, encore. `cardResultOf` ne pose
 *    `result.succeeded`/`result.notDone` que sur un run `status: 'partial'`
 *    (#1943.7) avec au moins deux pas ; `DEMO_WORKFLOW_RUN` est `status: 'done'`
 *    avec un unique pas (`schedule_reminder`), donc les deux nouvelles lignes
 *    de `CopilotCards.tsx` n'ont rien à montrer en salle de démonstration. Le
 *    correctif est le MÊME que ci-dessus — un troisième run seedé, `partial`,
 *    sur une routine à au moins deux pas (`signal_to_account_opening` ou
 *    `meeting_follow_up`) — hors du périmètre de ce lot
 *    (`.claude/notes/registre-2026-09-12.md`, #1943.13/#1943.14, agent du 22/09/2026).
 *
 *  - **#2384.7** (RÉFUTÉ en prod le 23/09) — la compensation d'un pas ANNULÉ
 *    se nomme désormais dans `ActionCenter.tsx` (`OutcomeIcon` + la ligne
 *    `center.stepCompensation.<reversible|compensable|irreversible>`, dérivée
 *    de `intentReversibility(step.intentType)`, jamais inventée). Même
 *    limite que ci-dessus : les deux pas de `DEMO_WORKFLOW_RUN` sont tous
 *    deux `outcome: 'done'` — aucun n'est `cancelled`, donc rien en salle de
 *    démonstration ne montre cette ligne. Correctif borné à la réfutation
 *    (branche `fix/refutes-en-prod-23-09`) : ajouter un pas `cancelled` au
 *    run seedé dépasse ce périmètre pour la même raison que #1943.17 ci-dessus
 *    (la routine `dormant_account_revival` ne montre QUE des pas INTERNES
 *    réussis, par construction — voir le docblock de `DEMO_WORKFLOW_RUN`) ;
 *    à qualifier avec les runs `unknown`/`partial` déjà notés manquants.
 */

/**
 * « ET EN DÉMONSTRATION, LES TROIS SORTIES DE LAURA DU 18/09 MONTRENT QUOI ? »
 * (#2271.16 fiche compte, #2271.19 timeline, #2271.20 fichier exportable —
 * `ReplyBlockView.tsx:40/42/44`). Aucune des trois n'a de table propre : ce
 * sont des BLOCS DE RÉPONSE, rendus depuis des données déjà couvertes ailleurs
 * (comptes, contacts) ou calculées côté navigateur — donc hors du périmètre
 * « table par table » de ce fichier, comme le paragraphe juste au-dessus.
 * Noté ici pour la même raison : ne pas laisser la question sans réponse
 * écrite.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2271.19 (timeline) ET #2271.20 (fichier exportable) — SEEDÉES, PAR LE VRAI
 * MOTEUR DE DÉMO
 * ─────────────────────────────────────────────────────────────────────────────
 * `chat_messages` commence vide (raison écrite plus bas) : ces deux cartes
 * n'apparaissent donc QUE si le visiteur pose la question — exactement le
 * mécanisme déjà en place pour `account_ranking`/`comparison`. Deux amorces
 * scriptées les servent (`demo-chat-script.ts` : `p-timeline`, `p-export`),
 * validées par le VRAI moteur de démo (`demo-turn.ts`, testé dans
 * `demo-turn.test.ts`) : zéro appel réseau, zéro fait inventé — les événements
 * de la timeline et les lignes du fichier reprennent des phrases déjà écrites
 * ailleurs dans le même script (`p-priorities`, `p-portfolio`), rien de neuf.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2594 (missing_data, « ce qui me manque ») — SEEDÉE, MÊME MÉCANISME
 * ─────────────────────────────────────────────────────────────────────────────
 * Même angle mort, même réponse : un lien mort dans une carte `missing_data`
 * était vu en production le 18/09/2026 (« Comment l'obtenir :
 * [Contacts](/contacts) » affiché crochets compris). Une amorce scriptée de
 * plus (`demo-chat-script.ts` : `p-contact-gap`) sert cette carte avec son
 * champ `how` dans la MÊME forme que la production — le lien markdown EN
 * LIGNE, sans `href` structuré à côté — pour que la salle montre la marche
 * suivante VIVANTE, pas seulement corrigée en test. Deux faits déjà écrits
 * dans le script (`p-competition`, `p-contacts`), rien de neuf.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2271.16 (fiche compte) — VIDE À DESSEIN CÔTÉ CHAT, PAS CÔTÉ PRODUIT
 * ─────────────────────────────────────────────────────────────────────────────
 * `account_card` est le SEUL des trois dont `href` est OBLIGATOIRE au contrat
 * (`packages/contracts/src/schemas/reply-blocks.ts:283-285`) — il pointe un
 * identifiant de compte assigné par la base au moment du SEMIS
 * (`demo-seed.service.ts`), jamais connu quand une réponse scriptée s'écrit à
 * l'avance. L'inventer violerait « href jamais inventé » (doctrine, même
 * commentaire dans `AccountCard.tsx` : « jamais un domaine écrit ») — et ce
 * fichier a déjà tranché la même question pour `account_ranking`, dont AUCUN
 * item scripté ne porte de lien de fiche, pour la raison écrite noir sur blanc
 * dans `demo-chat-script.ts:133` : « Aucun lien de fiche : les identifiants
 * des comptes sont tirés au semis. » `account_card` hérite du même mur.
 *
 * Ce n'est donc PAS un oubli : la capacité #2271.16 elle-même tourne en
 * production sur un compte réel (id réel, `ReplyBlockView.tsx:40`) — c'est
 * SPÉCIFIQUEMENT sa mise en scène dans une salle sans compte réel qui reste
 * hors de portée, sans quoi la carte mentirait sur ce qu'elle ouvre. Se
 * corrigerait en résolvant l'identifiant réel d'un compte de démo AU MOMENT
 * du tour (client, depuis la liste déjà chargée par `useAccounts`) plutôt qu'à
 * l'écriture du script — hors du périmètre borné de ce lot de finition.
 */

/**
 * « ET EN DÉMONSTRATION, LE JOB COMPOSITE DE LAURA MONTRE QUOI ? » (#2276, 24/09/2026)
 *
 * SEEDÉ, PAR LE VRAI MOTEUR DE DÉMO — aucune table neuve à classer : un job est
 * une ligne `workflow_runs` (déjà classée plus bas) portant la colonne `job`
 * (migration `LauraJobOnWorkflowRuns`). Comme les cartes, un job n'est PAS
 * persisté en salle (`LauraJobService.proposeFromTurn` : « démonstration → rien
 * n'est persisté ») : une amorce scriptée le sert (`demo-chat-script.ts` :
 * `p-laura-job`, `DEMO_LAURA_JOB`), rendue par la VRAIE `LauraJobCard` (garde :
 * `demo-turn.test.ts`, qui valide la vue contre `lauraJobViewSchema` et exige
 * le coût de la grille).
 *
 * #2276 tranche 2 (24/09) — l'EXÉCUTION est SEEDÉE elle aussi : la fiche servie
 * en salle est un job DÉJÀ EXÉCUTÉ (état « Terminé », preuve par étape, débit
 * réel sous le coût maximum, écriture CRM validée, brouillons créés — garde :
 * `demo-turn.test.ts`). VIDE À DESSEIN : la file `laura-job` et la réservation
 * de crédits — rien n'est lancé ni réservé depuis une salle (I6), aucun geste
 * n'y est offert.
 *
 * #3860.4 (lot P01, décision Louis 09/10) — la SYNTHÈSE, dernière étape du
 * job, est SEEDÉE : `DEMO_LAURA_JOB.synthesis` est calculée par la MÊME
 * fonction que le serveur (`lauraJobSynthesisOf`) sur la fiche semée — huit
 * brouillons à relire (liens vers le centre d'approbation) et l'erreur
 * d'enrichissement. Ce job n'analyse aucun compte : aucun compte ni contact
 * n'y est nommé, à dessein (aucune identité produite, rien à inventer).
 *
 * #2276.46 / .47 / .49 / .51 (24/09) — la PRÉVISUALISATION est SEEDÉE : la fiche
 * de salle relit le dossier (données réutilisées), fait du neuf (enrichir,
 * préparer, remonter), porte dix contacts de périmètre (la limite dit « au plus
 * 10 ») et une durée MESURÉE avec sa base (garde : `demo-turn.test.ts`, « la
 * prévisualisation est REMPLIE en salle »). La mesure de durée d'un vrai espace
 * lit ses jobs finis (`LauraJobService.withMeasuredDuration`) : une salle n'en
 * persiste aucun, d'où la durée scriptée.
 *
 * #3860.1 / #3860.2 (lot M06, 09/10) — VIDE À DESSEIN : l'ATTENTE d'une analyse
 * asynchrone (`awaiting`, job garé) et les identités qu'une étape VERSE dans le
 * périmètre (`produced`). Ce sont des états d'exécution RÉELLE : une salle ne
 * lance ni analyse ni passage de file (I6), et la fiche semée est un job déjà
 * TERMINÉ (champs posés, vides — `demo-chat-script.ts`). Ce qui se voit avant
 * le clic (« ses contacts viendront de l'étape… », « aucun filtre ») se calcule
 * sur n'importe quelle fiche par `lauraJobPreviewOf` (garde : `LauraJobCard.test.tsx`).
 *
 * #5045 (31/10, recherche accompagnée V8) — le statut « Recherche terminée » est SEEDÉ
 * (le job de salle est déjà TERMINÉ, kicker et « x sur y » dérivés de son état
 * réel par `jobStatusOf`). VIDE À DESSEIN : « Recherche en cours » et « Recherche
 * interrompue à ta demande » — ce sont des états d'exécution RÉELLE (relecture
 * serveur, bouton Arrêter) ; une salle ne lance ni ne stoppe rien (I6) et
 * inventer un job « en cours » figé serait une donnée fictive. Les deux se
 * prouvent par `LauraJobCard.test.tsx`, état par état.
 *
 * #2276.62 (24/09) — VIDE À DESSEIN : le RETOUR du job dans un fil RELU
 * (`GET /ia/chat/messages` → `laura_job`). Une salle n'écrit ni message ni job
 * (#1942.4, I6), donc il n'y a aucun fil à relire ; le job semé s'y voit dans le
 * tour même où l'amorce le sert.
 *
 * #2276.62 (25/09, recette prod) — MÊME RAISON, second volet : la CLOCHE d'un
 * job Laura terminé pointe désormais vers SA conversation d'origine
 * (`chatNotificationLink`, `job-return-notifier.port.ts`) au lieu d'un lien
 * générique. VIDE À DESSEIN en démo, pour la MÊME raison que ci-dessus (I6) :
 * `LauraJobService.proposeFromTurn` ne persiste rien en salle, donc aucun job
 * ne s'y exécute jamais jusqu'à `announce()` — la cloche de retour ne part
 * d'aucune salle de démonstration, pas plus que l'accusé aux canaux branchés
 * (#1952.29) qu'elle complète.
 */

/**
 * « ET EN DÉMONSTRATION, LE BOUTON « RELANCER » D'UN RUN MULTI-PAS MONTRE
 * QUOI ? » (#2865, 25/09/2026)
 *
 * VIDE À DESSEIN, MÊME TABLE, MÊME LIMITE QUE #1943.13/.14 CI-DESSUS —
 * `workflow_runs` est SEEDÉE (`DEMO_WORKFLOW_RUN`), mais son unique run est
 * `status: 'done'`, tous pas `outcome: 'done'`. `canRetry`
 * (`WorkflowRunnerService.workflowRunCanRetry`, lu par `GET action-os/runs`)
 * n'est vrai que sur un run `failed`/`partial`/`unknown` avec au moins un pas
 * qui n'a pas réussi : sur `DEMO_WORKFLOW_RUN`, il rend toujours `false`, donc
 * le bouton « Relancer » de `ActionCenter.tsx` (`RunList`) n'a jamais rien à
 * montrer en salle de démonstration.
 *
 * Le correctif est le MÊME que celui déjà noté et déjà différé deux fois pour
 * #1943.13/.14 — un second run seedé, `partial`, sur une routine à au moins
 * deux pas internes (`dormant_account_revival` n'en a que deux, tous deux
 * réussis par construction ; il faudrait une routine différente ou un pas en
 * échec ajouté à celle-ci) — hors du périmètre borné de cette épopée, qui
 * porte le GESTE (service + route + bouton), pas le semis d'un troisième
 * scénario de run. Noté ici plutôt que masqué par la classification de TABLE :
 * ce fichier garde des tables, pas des comportements (voir l'avertissement en
 * tête de fichier).
 */

/**
 * « ET EN DÉMONSTRATION, LE PLAN DE LAURA MONTRE QUOI ? » (#1950.14 / #1950.18 /
 * #1950.20 / #1950.22 — lot du 19/09/2026, décision Louis « TOUT LIVRER », qui
 * revient délibérément sur 1950.3).
 *
 * SEEDÉ, PAR LE VRAI MOTEUR DE DÉMO — aucune table neuve à classer : l'état d'une
 * étape se DÉRIVE de l'état de la carte (`workflow_runs`, déjà classée plus bas),
 * et la dépendance voyage dans la proposition (`depends_on`). Mais les cartes
 * d'un tour ne sont pas persistées en salle (`CopilotCardService.proposeTurn` :
 * « I6 — en démonstration, rien n'est persisté ») et `chat_messages` commence
 * vide : sans rien, la barre « Plan de Laura » ne se verrait jamais. Une amorce
 * scriptée la sert (`demo-chat-script.ts` : `p-plan`), trois cartes aux états de
 * plan VARIÉS — faite, échouée, bloquée par sa dépendance DÉCLARÉE —, rendues
 * par le VRAI `CopilotCards` (garde : `demo-turn.test.ts`).
 *
 * VIDE À DESSEIN, en revanche : le LANCEMENT. Aucune carte scriptée n'offre de
 * geste ni ne porte de tour, donc la barre n'offre ni « Lancer tout le plan » ni
 * « Seulement l'étape 1 » en salle : le lancement exécute de vraies cartes par
 * `confirm`, et une salle de démonstration n'en persiste aucune — un bouton qui
 * n'aurait rien à lancer mentirait au prospect.
 */

/**
 * « ET EN DÉMONSTRATION, LA PÉRIODE COUVERTE / LA LATENCE / LE STATUT BÊTA DU
 * MANIFESTE DES OUTILS (`/integrations`) MONTRENT QUOI ? » (#2261.8, #2261.13,
 * #2261.16 — lot BU du 18/09/2026, mis à jour le 18/09/2026 par la DÉCISION
 * LOUIS qui ferme #2261.8/#2261.16).
 *
 * Aucune TABLE à classer ici, comme les deux paragraphes au-dessus : `GET
 * /tool-registry` résout `coverage_period` / `latency` / `beta` depuis
 * `TOOL_CATALOG` (`apps/api/src/modules/tool-registry/tool-catalog.ts`), un
 * catalogue DÉCLARATIF écrit dans le code et partagé par TOUS les espaces —
 * pas une ligne `workspace_id` qu'un semis pourrait remplir différemment pour
 * la salle de démonstration. Ce que la salle voit sur ces trois champs est
 * donc, par construction, EXACTEMENT ce qu'un vrai client voit.
 *
 * DÉCISION LOUIS 18/09/2026 (« déclarés à la main, par connecteur ») : un
 * `null` identique sur les cinq outils branchables (HubSpot, Salesforce,
 * Google Workspace, Microsoft 365, Notion) se lisait en recette comme un
 * champ oublié plutôt qu'une réponse. `coverage_period` et `beta` DÉCLARENT
 * donc désormais, EN DUR par connecteur (`COVERAGE_PERIOD_UNKNOWN` /
 * `BETA_NOT_DECLARED`, `tool-catalog.ts`), « non mesuré » / `{beta: false,
 * feature: null}` pour ces cinq outils — jamais une donnée inventée, une
 * valeur ÉCRITE.
 *
 * `latency` (#2261.13) A QUITTÉ ce régime le 19/09/2026 : DÉCISION LOUIS,
 * elle se MESURE en priorité sur `tool_latency_observations`, une table
 * scopée `workspace_id` (`ToolRegistryService.resolveLatency`,
 * `measureToolLatency`) — la première exception à « pas une ligne
 * `workspace_id` qu'un semis pourrait remplir différemment » de ce
 * paragraphe. VIDE À DESSEIN pour la salle de démo, PAS classée
 * `DEMO_SEEDED_TABLES` : la démo ne fait tourner aucune synchro HubSpot
 * réelle, donc aucune ligne ne s'y écrit jamais — et c'est exactement ce
 * qu'un vrai client verrait sa première semaine, avant sa première synchro.
 * Semer une ligne fabriquée produirait une moyenne à partir d'UNE mesure
 * inventée, ce que #2261.13 interdit nommément.
 *
 * CE QUE LE VISITEUR LIT A CHANGÉ le 21/09/2026 (DÉCISION LOUIS, QCM) POUR UN
 * SEUL DES SEPT OUTILS : sans synchro réelle (toujours vrai en salle de
 * démo), `resolveLatency` retombe désormais sur `entry.latency` au
 * catalogue — `HUBSPOT_LATENCY_DECLARED` (`tool-catalog.ts`), une phrase
 * DATÉE lue dans la documentation publique HubSpot (Search API, lue le
 * 21/09/2026), jamais une moyenne inventée par Bellum. Le visiteur lit donc
 * « Latence déclarée par le fournisseur : quelques instants… » sur HubSpot,
 * et TOUJOURS « non mesuré » sur les six autres outils branchables — leur
 * doc publique respective (Gmail, Notion, Microsoft Graph, Salesforce) a été
 * relue le même jour et reste muette (Salesforce : doc inaccessible, 403).
 * Rien de spécifique à la démo ici non plus : `TOOL_CATALOG` est le même
 * fichier partagé, donc un vrai client voit EXACTEMENT la même phrase.
 *
 * La salle de démo hérite du même catalogue partagé pour `coverage_period`
 * et `beta` : un visiteur y lit « Période couverte : non mesuré » sur les
 * cinq outils branchables (relu 21/09/2026 contre leur doc publique — aucune
 * des cinq ne déclare de fenêtre bornée ni de statut bêta), la même
 * déclaration qu'un client réel — sans aucun semis, par construction. Le
 * jour où un connecteur documente une vraie fenêtre ou un statut bêta réel,
 * la salle de démo le montrera sans qu'aucun semis n'ait à changer — ce qui
 * vient de se produire pour `latency`/HubSpot ci-dessus, exactement comme
 * prévu par ce paragraphe.
 */

/**
 * « ET EN DÉMONSTRATION, L'AUDIT COMMERCIAL (`/settings/profile/audit`) MONTRE
 * QUOI ? » (#2075, câblage `POST /profile-context/validate` + son semis).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI `profiles` (`profile_context`) ET `profile_context_revisions` NE
 * SONT NI ICI NI DANS `DEMO_INTENTIONALLY_EMPTY`
 * ─────────────────────────────────────────────────────────────────────────────
 * Même motif que `user_daily_brief` et `laura_unrouted_intents` plus haut :
 * `profiles` est scopée par `user_id` (pas `workspace_id`), et
 * `profile_context_revisions` suit le MÊME sort — purgée par UTILISATEUR
 * (`DEMO_PURGE_USER_TABLES`, `demo-reset.service.ts`), jamais par espace. Les
 * deux gardes de tête de fichier (leak guard `workspace_id` → couverture PAR
 * TABLE) ne peuvent donc voir NI l'une NI l'autre par construction — les y
 * classer ferait échouer « ne classe que des tables réellement purgées »
 * (`demo-coverage.spec.ts`), qui ne lit que `DEMO_PURGE_TABLES`.
 *
 * ⚠️ Contrairement à `user_daily_brief`, la réponse écrite N'EST PAS « jamais
 * touchée » : `profile_context` EST semé, dans `restoreOwnerIdentity` (même
 * endroit que `esn_profiles`, juste en dessous) via
 * `DemoSeedService.seedProfileContext` — {@link DEMO_PROFILE_CONTEXT}
 * (`demo-dataset.ts`) porte le contenu et sa justification, garde dédiée dans
 * `demo-profile-context-coverage.spec.ts` (une table sans `workspace_id` que
 * la chaîne ci-dessus ne peut pas mettre en rouge a besoin de la SIENNE).
 * Rétabli à CHAQUE semis neuf — comme `esn_profiles` — pour survivre à la
 * purge par utilisateur de `profile_context_revisions` entre deux visiteurs.
 *
 * ⚠️ Cette garde-de-remplacement est donc la SEULE protection : une régression
 * ici (un renommage de colonne, un embranchement JSON cassé) ne fait PAS
 * rougir `demo-coverage.spec.ts` — seule `demo-profile-context-coverage.spec.ts`
 * le peut.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ET LA STRATÉGIE D'ENTRÉE CHOISIE (#2073.8) ? SEEDÉE — MÊME ANGLE MORT,
 * PROTECTION DANS `demo-seed.service.spec.ts` (pas `profile-context-coverage`)
 * ─────────────────────────────────────────────────────────────────────────────
 * `profiles.chosen_entry_strategy` est une colonne SŒUR de `profile_context`
 * (même table, même `user_id`), donc le même angle mort : ni le leak guard
 * `workspace_id` ni la couverture PAR TABLE de `demo-coverage.spec.ts` ne
 * peuvent la voir. Elle n'entre PAS dans `demo-profile-context-coverage.spec.ts`
 * pour autant : cette garde-là rejoue `profileContextSchema` sur
 * {@link DEMO_PROFILE_CONTEXT}, et `chosen_entry_strategy` n'appartient pas à
 * ce JSONB — c'est une colonne séparée, exactement pour ne pas être écrasée à
 * chaque régénération du profil. Sa preuve vit donc là où `seedProfileContext`
 * l'écrit : `demo-seed.service.spec.ts` (assertion sur l'appel `profiles.update`).
 *
 * Semée à `multiThread`, DÉLIBÉRÉMENT différente de la voie CALCULÉE
 * (`bottomUp`) : une salle qui sème les deux champs à la même valeur ne
 * prouverait rien — un visiteur ne pourrait pas distinguer « le choix
 * fonctionne » de « seul le calcul s'affiche ». Ce que la salle montre,
 * mesuré : sur `/settings/profile/audit`, la carte « entrée par le terrain »
 * porte « Recommandée » et la carte « entrée sur plusieurs fils » porte
 * « Stratégie retenue » — deux cartes différentes, deux badges distincts — et
 * la conséquence « Prioriser les bons comptes » (`AuditConsequences`) lit
 * désormais la voie CHOISIE (« Des comptes ETI, en entrée sur plusieurs
 * fils. »), jamais plus la seule voie calculée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ET LES DÉCISIONS SUR LES PREMIERS MOUVEMENTS (#2074.16) ? MÊME ANGLE MORT,
 * MÊME RÉPONSE — `profiles.audit_move_decisions`
 * ─────────────────────────────────────────────────────────────────────────────
 * Colonne SŒUR de `chosen_entry_strategy` juste au-dessus (même table, même
 * `user_id`, même invisibilité aux deux gardes automatiques). Semée sur UNE
 * seule des deux ruptures que la démo déclenche
 * (`tooManySimultaneousMarkets`, `valide` — voir
 * `demo-audit-first-moves-coverage.spec.ts` pour les deux ruptures et
 * `demo-seed.service.spec.ts` pour l'assertion d'écriture), DÉLIBÉRÉMENT pas
 * les deux : semer les deux mouvements à `valide` cacherait le badge
 * « Proposé », l'état par défaut que la doctrine (« on n'affiche pas ce
 * qu'on n'a pas ») impose de pouvoir montrer aussi. La salle voit donc UN
 * mouvement « Validé » (`tooManySimultaneousMarkets`) et UN « Proposé »
 * (`keyAccountsWithoutAccessPath`), sur `/settings/profile/audit`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MÊME ANGLE MORT, MÊME RÉPONSE : `action_plan_items` (#2123.46/#2123.47,
 * 16/09/2026 — parité démo de l'écran `/actions`)
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /plan-items/mine` était prête et testée côté API (`endpoint-guards
 * .spec.ts`, `ActionPlanItemsService.listMine`) et personne ne l'appelait :
 * une fois branchée côté écran, le widget se serait ouvert vide en
 * démonstration — `action_plan_items` ne portait AUCUNE ligne dans le jeu de
 * démo.
 *
 * ⚠️ Branchée d'abord par `MyPlanTasks` (section « Mes tâches du plan » de
 * `/actions`, même lot) — DÉCISION Louis 17/09/2026 : cette section faisait
 * double emploi avec l'onglet « Mes relances » du Centre d'actions (même
 * route, même clé de requête) et a été retirée. `MyPlanTasks` a disparu ;
 * l'appelant de `GET /plan-items/mine` sur cet écran est désormais
 * `MyRelancesList` (via `useMyActions`), qui lit la MÊME table.
 *
 * `action_plan_items` est purgée par UTILISATEUR (`DEMO_PURGE_USER_TABLES`,
 * `demo-reset.service.ts`), jamais par espace : EXACTEMENT le même angle mort
 * que `profile_context` / `profile_context_revisions` ci-dessus. Ni le leak
 * guard `workspace_id` ni la couverture PAR TABLE de `demo-coverage.spec.ts`
 * (qui ne lit que `DEMO_PURGE_TABLES`) ne peuvent la voir par construction —
 * la classer dans l'une ou l'autre ferait échouer « ne classe que des tables
 * réellement purgées ».
 *
 * ⚠️ Contrairement à `profile_context`, elle N'EST PAS écrite dans
 * `restoreOwnerIdentity` : sa colonne `account_id` n'est pas nullable, et
 * aucun compte n'existe encore à l'instant où `restoreOwnerIdentity` tourne.
 * Elle EST semée quand même, plus loin dans le même semis — `seedPlanTasks`
 * (`demo-seed.service.ts`), appelée depuis `seedCompanionData` une fois les
 * comptes créés et `accountIds` peuplé. {@link DEMO_PLAN_TASKS}
 * (`demo-dataset.ts`) porte le contenu : trois tâches sur des comptes RÉELS
 * de {@link DEMO_DOSSIERS} (jamais un compte inventé), dont une SANS
 * échéance (#2123.46 — une tâche saisie sans date en est une quand même) et
 * une EN RETARD (même choix que `DEMO_TASKS`, pour montrer l'état qu'un
 * commercial reconnaît le mieux).
 *
 * ⚠️ Pas de garde-de-remplacement dédiée ici (contrairement à
 * `demo-profile-context-coverage.spec.ts`) : `demo-seed.service.spec.ts`
 * porte déjà l'assertion (compte des `INSERT INTO action_plan_items`, au
 * moins une échéance posée ET une absente) — une table neuve, un seul test
 * qui l'exerce, pas encore de colonnes dérivées qui justifieraient un fichier
 * séparé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #4415 / #4416 (lot R21-W, 21/10/2026) — « Tes trois prochaines étapes » (onglet Plan) et « Plan pour <prénom> »
 * (fiche contact) N'AJOUTENT NI TABLE NI CLÉ `raw_analysis` : SEEDÉES PAR CONSTRUCTION
 * ─────────────────────────────────────────────────────────────────────────────
 * Les deux blocs sont des LECTURES du plan déjà semé (`raw_analysis.plan.action_plan.phases`) et des messages déjà
 * portés par les contacts : rien à classer de neuf. Ce qui manquait, c'était un destinataire NOMMÉ et un message
 * prêt à montrer — le plan SNCF de {@link DEMO_DOSSIERS} porte donc deux étapes (`SNCF5`, `SNCF6`) qui visent
 * Younes Berrada (personne SIMULÉE, LinkedIn seul, message LinkedIn déjà semé) : l'onglet Plan de SNCF montre une
 * étape avec destinataire + message, et sa fiche affiche « Plan pour Younes » avec ces deux étapes. Les autres
 * étapes du plan nomment un RÔLE (sièges anonymes) : elles s'affichent sans message, jamais avec un message
 * inventé. « Préparer un plan pour <prénom> » écrit des lignes `action_plan_items` — un geste d'écriture, jamais
 * un envoi.
 *
 * #4416.3 (lot R22-PF, recette 22/10) — SNCF n'était pas le seul compte à montrer « Plan pour <prénom> » : le plan de
 * Thales (comptes analysés) porte déjà des étapes nommées (Aurelia Peltier, Ralph Graaf…), jointes au contact par son
 * nom complet, et deux étapes e-mail visent désormais Till Rausch (CIO Thales Deutschland, `DEMO_THALES_DEUTSCHLAND_STEPS`)
 * — dans le blob d'analyse ET la table du plan, un seul plan. « Daniela » (VP Finance & CFO, détectée) n'a NI étape NI
 * coordonnée : son bloc reste absent à dessein (rien à proposer sans canal joignable).
 * `demo-contact-plan-steps-coverage.spec.ts` échoue si aucune étape ne vise un contact nommé de la démo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2715.1 (correction du coordinateur, 23/09/2026) — `send_status` N'AJOUTE
 * NI TABLE NI CLÉ `raw_analysis` : PAS DE NOUVELLE ENTRÉE À CLASSER ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Le badge « E-mail envoyé » / « Marqué fait » que porte désormais chaque
 * ligne du plan (`PlanActionItem.tsx`) est un champ CALCULÉ à la lecture
 * (`ActionPlanItemsService.withSendStatus`), jamais stocké — il croise
 * `action_plan_items.contact_id` (déjà classée SEEDÉE ci-dessus) et
 * `user_actions` (classée dans `DEMO_SEEDED_TABLES`, voir plus bas). Rien de
 * neuf à seeder pour la COLONNE ; ce qui manquait, c'était un ÉTAT à montrer :
 * {@link DEMO_PLAN_TASKS} porte désormais une SEPTIÈME tâche, sur le client
 * d'exemple (SNCF) plutôt que sur l'un des six dossiers réels,
 * rattachée par son `contact_id` à Directeur technique — entité numérique voyageurs — le seul interlocuteur
 * FICTIF qui porte une adresse `.example` dans la salle (voir l'avertissement
 * au-dessus de `DEMO_USER_ACTIONS`, `demo-dataset.ts` : aucun dirigeant RÉEL
 * des six autres dossiers ne reçoit de trace d'ENVOI). {@link DEMO_USER_ACTIONS}
 * porte en miroir un `message_sent`/`via:'bellum'` pour LE MÊME contact — le
 * seul cas `via:'bellum'` du jeu de démo, pour que la salle montre le badge
 * VÉRIFIÉ au moins une fois, et pas seulement le badge déclaratif que les
 * lignes `plan_action_message_sent`/`plan_action_call_logged` produisaient
 * déjà. Sans ces deux lignes JUMELLES, `/accounts/{SNCF}?tab=plan` n'aurait
 * montré AUCUN item avec un statut d'envoi, et la capacité que le client
 * réclamait (le client se plaignait de ne voir QUE LinkedIn) serait restée
 * invisible sur le lien public. Preuve exécutée :
 * `demo-seed.service.spec.ts` (#2715.1, les deux lignes visent le MÊME
 * `contact_id`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * X64 / #3274.4 (02/10/2026) — `method_rule` N'AJOUTE NI TABLE NI CLÉ À CLASSER
 * ─────────────────────────────────────────────────────────────────────────
 * Colonne de `action_plan_items` (déjà SEEDÉE ci-dessus). Avant, AUCUNE ligne de
 * la salle ne la portait : le scénario « cinq issues négatives sous une même
 * règle → la règle disparaît des citations de Laura » n'était pas jouable.
 * {@link DEMO_PLAN_TASKS} porte désormais cinq actions FAITES, sans résultat
 * (`no_response`), sous `plan_de_compte_hebdomadaire`, sur le client d'exemple
 * FICTIF (jamais sur un compte réel), et AUCUN résultat positif sous cette
 * règle. Preuve : `demo-method-rule-contradicted.spec.ts` (le calcul réel,
 * `workspaceDeactivatedRuleIds`, écarte la règle) et, côté salle, la question
 * « Pourquoi tu ne me cites plus la règle du plan de compte hebdomadaire ? »
 * (`demo-chat-script.ts`, `demo-turn.test.ts`) — Laura y est scriptée, la donnée
 * qu'elle cite est celle que le calcul réel lit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #4418 (21/10/2026) — « MARQUER ENVOYÉ » PLANIFIE LA CADENCE : AUCUNE TABLE NI CLÉ NEUVE, SEEDÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les relances J+3/J+6/J+9 posées par un « Marquer envoyé » / « Marquer fait » sont des lignes
 * `action_plan_items` (déjà SEEDÉE ci-dessus) à `cadence_step` renseigné, lues par « Aujourd'hui ». Une
 * relance de ce type est semée sur SNCF (`DEMO_PLAN_TASKS[*].cadenceStep`, due aujourd'hui, interlocuteur
 * FICTIF) ; AUCUN `message_sent` n'est semé avec elle : « fait » reste déclaratif. Preuve :
 * `demo-seed.service.spec.ts` (« #4418 »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2395.4/#2395.9 (24/09/2026) — `channel` N'AJOUTE NI TABLE NI CLÉ NEUVE :
 * MÊME ANGLE MORT, MÊME RÉPONSE QUE #2715.1 JUSTE AU-DESSUS
 * ─────────────────────────────────────────────────────────────────────────────
 * `action_plan_items.channel` (colonne neuve, `1796001457744`) et le TYPE/
 * l'ATTENDU canoniques qui en dérivent (`packages/contracts/src/schemas/
 * action.ts`, lus par `GET /action-os/actions`) ne sont PAS écrits par un
 * seed dédié : ils se déduisent, à l'écriture comme à la lecture, du contenu
 * DÉJÀ seedé de `{@link DEMO_DOSSIERS}[*].actionPlan.weeks` — la même donnée
 * qui matérialise `action_plan_items` en direct la première fois qu'un
 * compte de démo est ouvert (`ActionPlanItemsService.seedFromPlan`, EXACTEMENT
 * le chemin de production, aucun second chemin de démo).
 *
 * Défaut mesuré : les 20 actions de plan de `{@link DEMO_DOSSIERS}` portaient
 * un `channel` en FRANÇAIS libre (« Réseau professionnel », « E-mail »,
 * « Réunion ») — un texte de présentation, pas la valeur MACHINE que
 * `apps/ia/app/models/outputs/plan.py` écrit réellement (`linkedin | email |
 * phone | event | meeting | content`). `readChannel` (`action-plan-items
 * .service.ts`) ne reconnaît que la forme machine : la salle serait restée à
 * 0/20, le symptôme même que ce lot corrige en production. Réalignées sur le
 * vocabulaire réel (20/21 — la 21e, `'Veille'`, n'est PAS un canal de
 * communication et reste HORS des quatre canaux déjà canoniques, comme en
 * production). Aucun impact d'affichage : ce champ brut n'est lu NULLE PART
 * côté écran aujourd'hui (vérifié — seul `channelFromTool()` dans
 * `ActionPlanBoard.tsx` classe un canal, et lit `action.outil`, un champ
 * D'UNE AUTRE structure — le plan HEBDOMADAIRE du tableau de bord, pas
 * `action_plans.weeks`).
 *
 * `expected_outcome` avait déjà sa colonne et sa classification (`action.ts`,
 * #2395.9 déjà "livré") — aucune clé `raw_analysis` neuve non plus : c'est
 * l'ÉCRIVAIN (`seedFromPlan`, corrigé par ce lot) qui la posait NULLE PART
 * sur les actions seedées, pas le contrat.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2871 (27/09/2026) — `GET /accounts/:id/actions` N'AJOUTE NI TABLE NI CLÉ
 * `raw_analysis` : LA FICHE DÉMO RESTE REMPLIE PAR CONSTRUCTION
 * ─────────────────────────────────────────────────────────────────────────────
 * La projection canonique du plan du compte est une LECTURE SEULE : elle lit
 * le plan déjà seedé dans `raw_analysis` par le MÊME lecteur que l'onglet Plan
 * (`generatedPlanWeeks`, `@bellum/contracts`) et les lignes
 * `action_plan_items` déjà classées SEEDÉES ci-dessus. Chaque étape affichée
 * par la fiche démo a donc sa projection (`generated_plan` tant qu'elle n'est
 * pas actée, `plan_item` ensuite) ; rien de neuf à seeder, rien à classer
 * « vide à dessein ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ET LE PLAN À 4 SEMAINES (#2068) ? SEEDÉ DEPUIS LE 19/09/2026 (2068.11) — LES
 * PALIERS / LA CONFIGURATION PRODUIT RESTENT, EUX, VIDES À DESSEIN
 * ─────────────────────────────────────────────────────────────────────────────
 * Décision Louis 19/09/2026 (2068.11), née de #2068 (réfuté en prod le 19/09,
 * e6f8a20ea — la section affichait « non mesuré — Aucune source ne produit
 * encore ce plan », `auditWeeklyPlanSchema` sans AUCUN producteur) : la
 * replanification vit dans ACTIONS, l'audit y RENVOIE plutôt que d'attendre
 * un moteur séparé. `thirtyDayPlan` (`AuditPlanAndMilestones.tsx`) N'EST DONC
 * PLUS écrit `null` en dur — `buildThirtyDayPlanFromActions()`
 * (`apps/web/.../lib/build-audit.ts`) le calcule à la volée, côté navigateur,
 * depuis `myActions` (`GET /plan-items/mine`, la MÊME lecture que l'onglet
 * « Mes relances » du Centre d'actions) : zéro table, zéro clé de
 * `raw_analysis` NOUVELLE — `action_plan_items` était déjà classée SEEDÉE
 * ci-dessus (#2123.46/#2123.47), donc HORS du périmètre des deux gardes de
 * tête de fichier par construction, comme `profile_context`.
 *
 * ⚠️ Une garde aveugle par TABLE ne verrait pas une salle qui montre le plan
 * REMPLI sur une seule semaine et « rien de planifié » sur les trois autres —
 * `demo-audit-plan-coverage.spec.ts` EXÉCUTE la même règle de placement
 * (fenêtre glissante de 7 jours) que `buildThirtyDayPlanFromActions` sur
 * {@link DEMO_PLAN_TASKS} et prouve que les 4 semaines portent chacune au
 * moins une priorité — les trois entrées ajoutées ce jour-là (Société Générale
 * +10j, Groupe BPCE +17j, SNCF +24j) existent POUR CETTE RAISON, en plus des
 * trois tâches déjà seedées le 16/09 (SNCF +3j, Société Générale sans
 * échéance, Groupe BPCE en retard).
 *
 * `milestones`, lui, reste `null` — AUCUNE source, en production comme en
 * démonstration, ne le produit encore (#2068.14-.21, moteur séparé) ; l'écran
 * le NOMME « non mesuré » plutôt que de le taire ou d'inventer un palier pour
 * {@link DEMO_PROFILE_CONTEXT}. VIDE À DESSEIN, et la raison est celle-là. Le
 * jour où #2068.14-.21 branche un moteur réel, {@link DEMO_PROFILE_CONTEXT} en
 * héritera au même titre qu'un compte réel, sans changement ici.
 *
 * `productConfiguration`, LUI, est SEEDÉ depuis le 21/09/2026 (#2068.24/.26/
 * .27) : sa source est {@link DEMO_PROFILE_CONTEXT} lui-même — les réglages de
 * l'espace, lus par `buildAuditProductConfiguration` (`packages/contracts`).
 * Zéro table, zéro clé de `raw_analysis` NOUVELLE : `profile_context` était
 * déjà classée SEEDÉE, donc HORS du périmètre des deux gardes de tête de
 * fichier par construction, exactement comme le plan à 4 semaines ci-dessus.
 *
 * ⚠️ Et comme pour lui, une garde aveugle par TABLE ne verrait pas une salle
 * qui affiche la section VIDE : `demo-audit-product-configuration-coverage.spec.ts`
 * EXÉCUTE la dérivation de production sur {@link DEMO_PROFILE_CONTEXT} et
 * exige que les TROIS aires (« Scoring », « Carte d'influence », « Messages »)
 * soient nommées, chacune avec au moins un réglage renseigné et l'énoncé
 * validé dont il sort. Ce qu'un visiteur voit, mesuré : les secteurs et les
 * thèmes prioritaires qui font remonter un compte, l'étage visé par la carte
 * d'influence, l'angle de valeur et les preuves avec lesquels un message se
 * prépare.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ET « CE QUE TES RÉPONSES DISENT » (#2042.15 / #2043.10 / #2049.15 / #2050.14 /
 * #2051.16) ? SEEDÉ — ET C'EST `esn_profiles`, PAS `profile_context`, QUI LE
 * REMPLIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce bloc (`AuditDeclaredSignals.tsx`, 16/09/2026) est le seul de l'écran qui ne
 * lise PAS `profile_context` : il lit les RÉPONSES BRUTES du questionnaire
 * (`GET /onboarding/state` → `esn_profiles`, semée par
 * `DemoSeedService.seedEsnProfile`), dérivées à la volée par
 * `buildAuditDeclaredSignals()` (`packages/contracts/.../commercial-audit-signals.ts`).
 * Zéro table, zéro clé de `raw_analysis` supplémentaire : les sept colonnes qu'il
 * lit sont DÉJÀ au semis (`activity_measures_tracked`, `ideal_client_current_state`,
 * `ideal_client_accessibility`, `real_response_level`, `weekly_sales_time_protected`,
 * `dossier_continuity_breaks`, `dossier_continuity_practices`).
 *
 * ⚠️ `demo-coverage.spec.ts` raisonne au niveau TABLE : `esn_profiles` est semée,
 * donc elle resterait VERTE si ces sept colonnes étaient vides et que la salle
 * voyait cinq cartes « non mesuré ». Une garde aveugle n'est pas une exemption —
 * c'est `demo-audit-declared-signals-coverage.spec.ts` qui EXÉCUTE la vraie
 * dérivation sur `DEMO_ESN_PROFILE` et exige que les cinq signaux disent quelque
 * chose. Ce qu'un visiteur voit, mesuré : la trace s'arrête à « Contacts
 * sollicités », l'axe qui RÉPOND (`multiThread`) diverge de l'axe VISÉ
 * (`bottomUp`), un budget d'un seul front lu sur le temps PROTÉGÉ, et la revue
 * hebdomadaire de portefeuille proposée sur la rupture déclarée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2066.19 / #2066.27 — ET LA COMBINAISON DE VOIES GÉNÉRÉE (`AuditStrategicCombination.tsx`,
 * DÉCISION Louis 17/09) ? SEEDÉE DEPUIS #2067.2 (18/09/2026 NUIT) — ELLE ÉTAIT
 * VIDE À DESSEIN, UN SECOND CANAL LA REND NON NULLE
 * ─────────────────────────────────────────────────────────────────────────────
 * `strategicOptions` (`CommercialAuditContext`) lit le MÊME `go_to_market_channels`
 * que `AuditDeclaredSignals` ci-dessus — zéro table, zéro clé de `raw_analysis`
 * supplémentaire, déjà au semis (`DEMO_ESN_PROFILE.go_to_market_channels`).
 * `buildStrategicOptions()` (`commercial-audit-signals.ts`) exige AU MOINS DEUX
 * canaux déclarés pour rendre une combinaison (#2066.27, « sous 2 voies, il n'y
 * a rien à COMBINER ») ; jusqu'au 18/09/2026 nuit, {@link DEMO_ESN_PROFILE}
 * n'en déclarait qu'UN (`['Direct client final']`), et la combinaison valait
 * `null` — RIEN ne s'affichait (`AuditStrategicCombination` ne rend pas de
 * bloc vide sur `null`).
 *
 * #2067.2 (décision Louis du 18/09/2026 nuit, « la démo déclare ses
 * partenaires ») ajoute un second canal (`Partenaires ESN`) pour une raison
 * SANS RAPPORT avec ce bloc-ci (montrer « partenaires réguliers » dans #2067.2
 * — voir `DEMO_AUDIT_ACTIVE_LOAD_COVERAGE` plus bas) — mais la MÊME lecture de
 * `go_to_market_channels` en profite : deux canaux déclarés, `strategicOptions`
 * rend désormais DEUX options (`['Direct client final', 'Partenaires ESN']`,
 * label seul, verbatim). Ce n'est pas une régression à corriger : c'est un
 * second bloc de l'écran qui sort de « vide à dessein » par effet de bord d'une
 * décision produit légitime. La preuve que le calcul fonctionne avec 2 à 5
 * canaux vit toujours dans `commercial-audit-signals.test.ts`
 * (`buildStrategicOptions`) et `AuditStrategicCombination.test.tsx` — pas ici,
 * qui ne fait que constater que `DEMO_ESN_PROFILE` en déclare deux.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LOT AY (18/09/2026) — SORTIR DU QUESTIONNAIRE (#2579.2) ET LA REPRISE APRÈS
 * COUPURE (#2537.1/#2537.3) ? VIDE À DESSEIN — L'ONBOARDING NE S'OUVRE JAMAIS
 * EN DÉMONSTRATION
 * ─────────────────────────────────────────────────────────────────────────────
 * Ludovic Marx paie depuis un mois sans avoir jamais atteint le produit : son
 * onboarding a bouclé, il n'a pas pu en sortir. Ce lot corrige trois défauts
 * du QUESTIONNAIRE (le bouton « Quitter » de `OnboardingWizard.tsx`, la
 * reprise après coupure réseau dans `useOnboardingNavigation.ts`, l'idempotence
 * du rejeu côté `OnboardingService`), pas un écran que la salle de
 * démonstration montre.
 *
 * `needsOnboarding` (`apps/web/.../onboarding-gate.ts`) saute l'onboarding
 * pour TOUT compte `credits.is_demo === true`, en tout premier — avant même de
 * lire `status`/`skipped_at` : « le visiteur arrive par un lien ouvert pour
 * VOIR le produit, jamais pour remplir un questionnaire ». La salle de
 * démonstration n'atteint donc ni le bouton « Quitter » du questionnaire, ni
 * une coupure réseau en cours de saisie, ni un rejeu d'enregistrement — les
 * trois points de ce lot sont structurellement INATTEIGNABLES en démo, pas
 * seulement non seedés.
 *
 * Zéro table nouvelle, zéro clé de `raw_analysis` nouvelle : `esn_profiles`
 * (réponses) et `user_onboarding_transitions` (journal) sont déjà classées
 * SEEDÉE / VIDE À DESSEIN plus bas dans ce fichier, et ce lot n'y touche pas —
 * il corrige le CÂBLAGE d'endpoints déjà seedés (`POST /onboarding/skip`,
 * `PUT /onboarding/answers`), jamais leurs données.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ET LES CONTRADICTIONS / LA MATURITÉ (#2064/#2065) ?
 * PAS UN TROU — HÉRITÉES DU MÊME SEMIS, SANS LIGNE DE SEMIS DÉDIÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrairement au bloc ci-dessus, `contradictions` et `maturity` ont
 * désormais un moteur RÉEL : `tension-detectors.ts` (18 règles nommées depuis
 * #2066.11-.16 — 12 d'origine + 6 nouvelles) et `maturity-axes.ts` (13 axes
 * nommés depuis #2860, #2045.12-.14 — 12 d'origine + le treizième axe
 * `network`), tous les deux appelés depuis `buildCommercialAuditContext()`.
 * Même mécanique que `thirtyDayPlan` ci-dessus — calculés à la volée côté
 * navigateur, donc HORS du périmètre des deux gardes de tête de fichier —
 * mais avec une différence qui compte pour la démonstration : aucun semis
 * supplémentaire n'est nécessaire. {@link DEMO_PROFILE_CONTEXT} alimente déjà
 * ces deux moteurs (le même objet que la production lit), donc un visiteur de
 * la salle voit une VRAIE tension (« trop de marchés simultanés » se
 * déclenche sur les 4 secteurs de `DEMO_ESN_PROFILE.target_sectors ») et une
 * VRAIE maturité décomposée (8 des 13 axes mesurés depuis ce même profil,
 * l'axe `network` inclus : les quatre portes de réseau personnel de
 * `DEMO_ESN_PROFILE` — `former_clients_count_band`, `former_colleagues_count_band`,
 * `partners_count_band`, `referrers_count_band` — sont déjà déclarées et
 * NON vides, `warm_relations_count_band` (#2045.6) restant honnêtement non
 * renseignée, comme en production tant que la question n'est pas répondue).
 * Les 13 règles de tension (7 d'origine + les 6 de #2066.11-.16, toutes à
 * signal externe) et les 5 axes qui lisent une réalité opérationnelle non
 * encore reliée (vivier, besoins clients, partenaires, appels d'offres,
 * missions, équipe) restent honnêtement `unknown` en démonstration comme en
 * production — identique des deux côtés, même principe que le paragraphe
 * précédent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2090 (V3) / #2066 — LE VERDICT, LA CHAÎNE FINE ET SA RUPTURE, LA PRIORITÉ
 * DE LA SEMAINE ? MÊME RÉPONSE, POUR LA MÊME RAISON
 * ─────────────────────────────────────────────────────────────────────────────
 * `AuditVerdict`, `AuditChain` et `AuditWeeklyPriority` (`lib/audit-verdict.ts`,
 * `lib/audit-chain.ts`, `lib/audit-priority.ts`) sont des dérivations PURES de
 * `contradictions`/`breakpoints`/`currentCommercialMachine`, déjà calculés
 * ci-dessus depuis {@link DEMO_PROFILE_CONTEXT} — zéro table, zéro clé de
 * `raw_analysis` supplémentaire, donc rien à semer de plus. Depuis #2066, la
 * chaîne compte NEUF étapes fines (Contact → Capitalisation, remplaçant les
 * six macro-étapes posées en attente) : les deux tensions mesurables sur ce
 * profil — « trop de marchés simultanés » (4 secteurs visés) et « grands
 * comptes sans voie d'accès » (`size: 'all'` avec une entrée `bottomUp`) —
 * sont TOUTES DEUX classées sous l'étape `contact` : la largeur du ciblage et
 * la voie d'accès aux décideurs sont le même endroit de la chaîne fine, ce
 * qui ne se voyait pas dans le découpage à six macro-étapes (elles y
 * tombaient déjà ensemble sous `entries`). La salle voit donc un VERDICT
 * réel, l'étape « Contact » en rupture (cliquable, ses DEUX ruptures portant
 * chacune une recommandation et un indicateur — #2066.18) et une conclusion
 * NOMMÉE (#2066.17, « le problème se situe au niveau de l'étape Contact »),
 * plus une priorité de semaine qui reprend la question à valider du premier
 * détecteur — jamais une phrase inventée pour occuper la carte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2074.10-.15 / #2090.7 — ET LES « PREMIERS MOUVEMENTS » ? SEEDÉS, PAR LE
 * MÊME MÉCANISME — ET PROUVÉS PAR UNE SUITE QUI EXÉCUTE LA DÉRIVATION
 * ─────────────────────────────────────────────────────────────────────────────
 * `AuditFirstMoves` (`features/commercial-audit/components/`) rend AU PLUS trois
 * mouvements dérivés par `auditMovesFrom`
 * (`packages/contracts/.../commercial-audit-moves.ts`) depuis les MÊMES
 * `contradictions` que le verdict et la priorité ci-dessus : zéro table, zéro
 * clé de `raw_analysis` supplémentaire, donc rien à semer de plus.
 *
 * ⚠️ Mais cette entrée ne se contente pas de l'affirmer — le paragraphe
 * précédent l'aurait fait, et un commentaire n'est pas une preuve.
 * `demo-audit-first-moves-coverage.spec.ts` EXÉCUTE `auditMovesFrom` sur les
 * ruptures que ce jeu déclenche et prouve ce que la salle voit : DEUX
 * mouvements, de deux genres différents — « une ouverture » (grands comptes
 * sans voie d'accès) et « une décision de pilotage » (quatre secteurs
 * simultanés) —, tous deux au statut `propose`, aucun présenté comme déjà créé.
 *
 * Le TROISIÈME genre, « un engagement à faire avancer », reste ABSENT en
 * démonstration, et c'est mesuré, pas oublié : ses huit règles lisent une
 * réalité opérationnelle (contacts relancés, entretiens, missions, vivier) que
 * {@link DEMO_PROFILE_CONTEXT} ne porte pas — identique en production sur un
 * profil équivalent. #2074.12 (23/09) : UNE de ces huit règles lit désormais
 * le vivier RÉEL (`useTalentStats` → `commercialTensionSignalsFromTalentStats`),
 * en démonstration comme en production — la carte suit donc la vérité du
 * vivier semé (elle n'apparaît que si AUCUN profil de disponibilité connue
 * n'est disponible), jamais une ligne de plus semée pour la faire sortir.
 *
 * #2842.1/.2 (25/09, épopée #2074.13-.19) — DEUX règles de plus lisent
 * désormais une réalité RÉELLE, sur le MÊME principe : `profilesWithoutCommitment`
 * (`useSubmissions()`, `GET /submissions` — déjà l'écran Positionnements) et
 * `missionWithoutRenewal` (`useRenewals()`, `GET /delivery/renewals` — déjà
 * l'ancien écran de décision `/missions/renouvellements`, supprimé en #3656 : la route redirige vers `/missions`, la lecture `GET /delivery/renewals` reste). Zéro table, zéro clé de
 * `raw_analysis` supplémentaire : les trois positionnements et les dix
 * missions déjà semés pour CES écrans suffisent — deux positionnements
 * portent un retour client (`first_feedback_days_ago`) et une mission porte
 * `renewal_status: 'renouvele'` (Inès Kaczmarek), donc les DEUX règles restent
 * `clear` en démonstration comme en production sur un semis équivalent :
 * elles ne s'affichent QUE si aucun retour client n'est tracé, ou qu'aucune
 * mission éligible n'est effectivement renouvelée.
 *
 * #2842 (reste, 26/09) — QUATRE règles de plus, MÊME principe, sur DEUX
 * comptages backend NEUFS cette fois (`OpenNeedsService.commercialAuditSignals`,
 * `ContactsService.getFollowUpStats`) plutôt qu'un agrégat déjà exposé —
 * mais sur les MÊMES tables déjà classées SEEDÉES ci-dessus (`project_needs`,
 * `contacts`) : zéro table, zéro clé de `raw_analysis` supplémentaire, rien à
 * semer de plus.
 *
 * `interviewWithoutFollowUp` (`useSubmissions()`, MÊME lecture que
 * `profilesWithoutCommitment` juste au-dessus) reste `clear` : aucun des trois
 * positionnements semés n'a de `substatus` `interview_done`/`second_interview`
 * (`selected`/`declined`/`no_response`), donc `interviews.total` mesure
 * honnêtement 0 — pas d'entretien tenu, pas de rupture.
 *
 * `needsWithoutQualification` SE DÉCLENCHE sur ce semis : aucun des besoins
 * ouverts n'y porte le statut `qualified` littéral
 * (`to_qualify`/`matching`/`to_match`/`won`/`cancelled` seulement) — exactement
 * ce que montrerait un vrai compte au même stade, jamais une anomalie de la
 * démonstration (c'est le point de la doctrine : « la démo montre ce qu'un
 * compte équivalent montrerait »). `needReducedToTitle`, calculé par la MÊME
 * requête, reste `clear` : chaque besoin semé porte des compétences, une
 * séniorité et une localisation (voir `DEMO_FLAGSHIP_NEED` et ses voisins) —
 * `withOnlyATitle` mesure honnêtement 0, pas un « non mesuré ».
 *
 * `contactWithoutFollowUpDate` reste `clear` (0 sur 0, pas une rupture) :
 * `email_sent_at` n'est JAMAIS semé en démonstration (classé plus bas,
 * « Aucun e-mail n'est envoyé depuis une salle de démo ») — aucun contact n'y
 * est donc « pris » au sens de la règle, `contactFollowUps.total` mesure 0,
 * exactement comme `getDeliverability().sent` mesure déjà 0 sur ce même
 * semis (#2384.5, même colonne, GA-26).
 *
 * Cinq des huit règles `engagement` lisent donc désormais du réel (vivier,
 * positionnements, renouvellements, besoins, contacts), et UNE (« besoins
 * sans qualification ») rejoint la carte des premiers mouvements sur ce
 * semis. Seule `profileNotSecured` reste `unknown`, faute de tout champ
 * « profil sécurisé » en base (`consultants`/`submissions`) — nommé
 * explicitement dans le docblock de tête de `tension-detectors.ts`, jamais un
 * comptage inventé pour la faire sortir de ce statut.
 *
 * La carte montre donc désormais JUSQU'À `MAX_AUDIT_MOVES` mouvements sur ce
 * semis (`auditMovesFrom` plafonne, jamais une carte inventée au-delà) —
 * plus jamais un taux « n sur 8 » affiché (GA-259) : ce qui n'est pas mesuré
 * (`profileNotSecured`) reste NOMMÉ, pas compté comme un zéro.
 *
 * La carte MÉMOIRE MARCHÉ de l'audit (`AuditMarketMemory.tsx`, #2090.36) est
 * DIFFÉRENTE : voir {@link DEMO_AUDIT_MARKET_MEMORY_COVERAGE} juste en dessous
 * — elle lit le MÊME corpus partagé et non-seedable que
 * {@link DEMO_COMPATIBLE_ENVIRONMENTS_COVERAGE}, pas `DEMO_PROFILE_CONTEXT`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2010.10 — ET LE BLOC « HYPOTHÈSES À VÉRIFIER » ? MÊME MÉCANISME, MÊME
 * PREUVE EXÉCUTÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * `AuditHypotheses` (`features/commercial-audit/components/`) dérive
 * `auditHypothesesFrom` (`packages/contracts/.../commercial-audit-hypotheses.ts`)
 * sur les MÊMES `contradictions` que les premiers mouvements ci-dessus : zéro
 * table, zéro clé de `raw_analysis` supplémentaire. `demo-audit-hypotheses-
 * coverage.spec.ts` EXÉCUTE la dérivation sur les deux ruptures que ce jeu
 * déclenche et prouve que la salle voit DEUX hypothèses, chacune avec sa
 * question à valider — `triggered()` (`tension-detectors.ts`) pose toujours
 * un `possibleExplanation` sur une règle qui se déclenche, donc le bloc n'est
 * jamais vide sur ce profil de démonstration.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2457 — ET « CE QUI N'A PAS PU ÊTRE ÉTABLI » MONTRE-T-IL UN VERDICT, UNE
 * MATURITÉ OU UNE PRIORITÉ NON CONCLUS ? MESURÉ : NON, PAR CONCEPTION DE
 * {@link DEMO_PROFILE_CONTEXT} — PAS UN TROU, LE MÊME MÉCANISME QUE CI-DESSUS
 * ─────────────────────────────────────────────────────────────────────────────
 * Décision Louis 16/09/2026 : `verdict`/`maturity`/`priority` entrent
 * désormais dans « Ce qui n'a pas pu être établi » quand ils n'ont rien pour
 * CONCLURE (`build-audit.ts`, `AuditUnestablishedEntry` de forme `derived`) —
 * même mécanique que `contradictions`/`maturity` ci-dessus : calculé à la
 * volée depuis {@link DEMO_PROFILE_CONTEXT}, zéro table, zéro clé de
 * `raw_analysis`, donc rien à semer de plus.
 *
 * MESURÉ (et non supposé) sur {@link DEMO_PROFILE_CONTEXT} le 16/09/2026 :
 * les trois CONCLUENT — 2 contradictions déclenchées (« trop de marchés
 * simultanés », « grands comptes sans voie d'accès »), une rupture réelle à
 * l'étape « Contact » (le verdict et la priorité tranchent sur elles), et
 * 7 des 12 axes de maturité évalués (score 18, bien au-dessus du seuil de 3).
 * Aucun des trois n'apparaît donc dans la liste sous ce profil — CORRECT, pas
 * un angle mort : {@link DEMO_PROFILE_CONTEXT} est délibérément complet pour
 * montrer le VERDICT réel, la rupture cliquable et la maturité décomposée
 * documentés juste au-dessus, et le geste qui ferait apparaître l'un des
 * trois non conclus (retirer `coachingInsights` ou les 4 secteurs visés)
 * démentirait CETTE narration, déjà seedée et testée. La forme « derived » et
 * sa raison COMPTÉE sont exercées par la garde d'exécution
 * (`architecture/audit-unestablished-reads-the-screen.test.ts`, GA-345) et par
 * `build-audit.test.ts` avec un profil plus pauvre — pas par ce jeu de
 * données démonstratif, pour la même raison que `thirtyDayPlan` etc. ne le
 * sont pas au premier paragraphe de ce fichier. Si un jour {@link
 * DEMO_PROFILE_CONTEXT} est appauvri pour une autre raison, cette ligne est à
 * revisiter — pas avant.
 */

/**
 * « ET LA CARTE MÉMOIRE MARCHÉ DE L'AUDIT (#2090.36) MONTRE QUOI EN DÉMO ? »
 * VIDE À DESSEIN — MÊME CORPUS PARTAGÉ QUE #1625/#1633/#1635, PAS DE SEMIS À ELLE
 *
 * `AuditMarketMemory` (`features/commercial-audit/components/`) lit EXACTEMENT
 * le même moteur que `CompatibleEnvironmentsSection` (voir
 * {@link DEMO_COMPATIBLE_ENVIRONMENTS_COVERAGE} ci-dessous) : `GET /companies/
 * market-context-search`, donc les quatre tables PARTAGÉES de la mémoire
 * marché (GA-258) — jamais seedées, jamais seedables, pour la MÊME raison
 * (y écrire des lignes de démonstration les injecterait dans le corpus que
 * lisent de vraies ESN concurrentes). Ce que la salle voit dépend du corpus
 * RÉEL et de ce que la zone / les expertises de {@link DEMO_ESN_PROFILE}
 * y recoupent — ni prévisible à l'écriture, ni un trou de semis : l'absence
 * possible est la même vérité que voit un client dont le secteur n'est pas
 * encore couvert. Sans résultat, `AuditMarketMemory` ne rend RIEN (même
 * discipline que #1627/`MarketAwarenessCard`) — jamais un état d'erreur dans
 * un audit qui, par ailleurs, a des choses à montrer.
 */
export const DEMO_AUDIT_MARKET_MEMORY_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "`AuditMarketMemory` (#2090.36) lit `GET /companies/market-context-search`, donc les quatre tables PARTAGÉES et non-seedables de la mémoire marché (GA-258) — même corpus, même raison que `DEMO_COMPATIBLE_ENVIRONMENTS_COVERAGE`. Ce que la carte montre dépend du recoupement RÉEL entre la zone/les expertises de DEMO_ESN_PROFILE et le corpus réel : imprévisible à l'écriture, honnête si vide.",
}

/**
 * « ET LE BADGE « POTENTIEL STRUCTUREL » (#2107.40) SUR LA CARTE « COMPTES QUI
 * ONT BOUGÉ » DU BRIEF MONTRE QUOI EN DÉMONSTRATION ? » VIDE À DESSEIN, MÊME
 * CORPUS PARTAGÉ QUE {@link DEMO_AUDIT_MARKET_MEMORY_COVERAGE}
 *
 * `BriefingController.today()` porte désormais `structuralPotentialPaths` sur
 * chaque compte de `accountsToWatch` (#2107.40) — la MÊME lecture
 * (`MarketMemoryService.pathsFor`) déjà faite pour le TRI seul (#1637), donc
 * les quatre tables PARTAGÉES et non-seedables de la mémoire marché (GA-258).
 * `allActionsDemo`/`buildDemo` (`BriefingService`) ne les seedent PAS et
 * n'en ont pas besoin : seeder une observation fictive l'injecterait dans le
 * corpus que lisent de vraies ESN concurrentes. En salle, ce champ reste donc
 * `null` — le badge ne s'affiche jamais en démonstration, comme le cockpit
 * (`PortfolioCoverageCard`) qui lit la même lecture.
 */
export const DEMO_BRIEFING_STRUCTURAL_POTENTIAL_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    '`accountsToWatch[].structuralPotentialPaths` (#2107.40) vient de `MarketMemoryService.pathsFor`, donc des quatre tables PARTAGÉES et non-seedables de la mémoire marché (GA-258) — même corpus, même raison que `DEMO_AUDIT_MARKET_MEMORY_COVERAGE`. Toujours `null` en démonstration, jamais un badge deviné.',
}

/**
 * « ET “OBTENIR L'E-MAIL” (#4421.15-.18) SOUS UNE PERSONNE HORS ESPACE SE VOIT-IL EN DÉMONSTRATION ? »
 * SEEDÉE (lot décisions 25/10). Garde : `demo-outside-person-reveal-coverage.spec.ts`.
 */
/**
 * « ET LE SÉLECTEUR GROUPE + FILIALES (LOT 757, ARBITRAGE LOUIS 31/10) EST-IL REMPLI EN DÉMONSTRATION ? »
 * SEEDÉ — `DEMO_GROUP_PERIMETER` (Société Générale et trois filiales réelles déjà nommées par le jeu) sert
 * `GET group-perimeter/:siren` sans appel réseau ; le run de Société Générale d'il y a six jours porte deux
 * filiales cochées (`contact_entities`). Aucune table neuve : le choix vit dans `analysis_runs.scope_selection`.
 * Garde : `account-group-perimeter.controller.spec.ts`.
 */
export const DEMO_GROUP_PERIMETER_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'Taper « Société Générale » à l’analyse ouvre le sélecteur : le groupe, Boursorama, Treezor et la holding de participations, avec la taille et le siège là où le jeu les porte (ailleurs « non publié », jamais un chiffre). Le run d’il y a six jours montre deux filiales cochées. Côté serveur, `DEMO_GROUP_PERIMETER` répond sans appel au moteur.',
}

export const DEMO_OUTSIDE_PERSON_REVEAL_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'Sur le cas « missions pour Camille Roussel », la carte de SII porte deux personnes à vérifier au nom masqué (« Inès G. », « Julien M. ») avec « Obtenir l’e-mail ». En salle, le clic ne fait AUCUN appel : la révélation vient du script (`DEMO_REVEALED_PEOPLE`, personne fictive, adresse @exemple.fr) et remplit le destinataire du mail préparé ; la seconde personne se lit « adresse introuvable », comme en production. Côté serveur, `POST outside-people/reveal` refuse l’espace de démonstration (409) : aucun compte ni contact n’y est créé, aucune table ne reçoit de semis.',
}

/**
 * « ET LE NOM D'UN CONTACT DANS LA CARTE `contact_list` DE LAURA (#4610) MÈNE-T-IL À SA FICHE EN DÉMONSTRATION ? »
 * SEEDÉE (#4610.5, vague M 28/10/2026) — la conversation de démonstration est SCRIPTÉE (`demo-chat-script.ts`) :
 * la réponse « Qui sont les contacts nommés chez SNCF ? » (`p-contacts-card`) porte une carte `contact_list` dont les
 * noms (`href`) et le compte cité (`company_href`) sont des JETONS que `demo-turn.ts` résout contre les contacts et
 * comptes RÉELLEMENT chargés par l'écran (comme `accountHref`) : aucun UUID écrit dans le script, aucune table neuve.
 * Les deux personnes sont celles que le semis nomme chez SNCF (table `contacts`). Un contact introuvable reste du
 * texte. Garde : `demo-contact-list-href-coverage.spec.ts` (relit le script ET les fiches semées).
 */
export const DEMO_CONTACT_LIST_HREF_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'La réponse scriptée « Qui sont les contacts nommés chez SNCF ? » montre une carte contact_list : Jean Castex et Laurent Trévisani sont des liens vers leur fiche (table contacts, semée), SNCF un lien vers la fiche du compte. Les chemins sont résolus à l’écran contre les contacts et comptes chargés, jamais écrits dans le script ; sans fiche chargée, le nom reste du texte.',
}

/**
 * « ET LA LIGNE ORANGE DE PARTAGE (#3775.2b) SE VOIT-ELLE EN DÉMONSTRATION ? »
 * SEEDÉE (#3775.a, lot M12, 09/10/2026) — voir `DEMO_RESTRICTED_SOURCE_THREAD`.
 */
export const DEMO_RESTRICTED_SOURCE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'Un fil daté de cinq jours (`DEMO_RESTRICTED_SOURCE_THREAD`, compte SNCF) porte une réponse dont la source « Ta messagerie personnelle » a été marquée `restricted` à l’écriture — ouvrir ce fil puis « Partager dans l’espace » montre la ligne orange. Aucune messagerie n’est CONNECTÉE en salle, et ce n’est pas un mensonge : la ligne dit précisément qu’un extrait DÉJÀ écrit reste lisible même quand sa connexion n’existe plus. La réponse ne cite qu’une date et un silence, jamais un corps de message.',
}

/**
 * « ET LA LISTE DES COMPTES V22 (#4496-#4498) EST-ELLE REMPLIE EN DÉMONSTRATION ? » SEEDÉE (PR 12C, 24/10/2026).
 * Garde : `demo-accounts-list-v22-coverage.spec.ts`.
 */
export const DEMO_ACCOUNTS_LIST_V22_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'Les quatre premiers dossiers de la salle (Société Générale, Groupe BPCE, SNCF, ENGIE) portent chacun un sujet (signaux semés), une prochaine action écrite à `raw_analysis.plan.nextActions[0]` — là où `GET /accounts` la lit —, des contacts et un responsable (`assigned_to`) : « Reprendre le fil » montre trois cartes et chaque ligne du tableau remplit Sujet & prochaine action, Personnes et Responsable. La modale « Filtrer mon portefeuille » ne sème rien de neuf : elle filtre les colonnes déjà semées (secteur, étiquettes, statut commercial, porte de priorité, score).',
}

/**
 * « ET LA VOIE D'ACCÈS (#2107.42) SUR LA CARTE « COMPTES QUI ONT BOUGÉ » DU
 * BRIEF MONTRE QUOI EN DÉMONSTRATION ? » SEEDÉE — À LA DIFFÉRENCE DE
 * {@link DEMO_BRIEFING_STRUCTURAL_POTENTIAL_COVERAGE}
 *
 * `BriefingController.today()` porte `accountsToWatch[].accessPath` depuis
 * `ContactsService.rankForAccount` — MÊME lecture que l'onglet Contacts
 * (`PriorityPathSection.tsx`), scopée aux CONTACTS de l'espace, pas à un
 * corpus partagé non-seedable comme la mémoire marché juste au-dessus. Les
 * contacts des dossiers de démonstration SONT seedés (`demo-dataset.ts`), le
 * classement RÉUSSIT donc réellement en salle, sur les mêmes garanties que
 * l'onglet Contacts (`kind: null` + `missing_reason: 'never_searched'` reste
 * une absence pure, retirée par l'écran — jamais un accès deviné).
 */
export const DEMO_BRIEFING_ACCESS_PATH_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '`accountsToWatch[].accessPath` (#2107.42) vient de `ContactsService.rankForAccount`, scopée aux contacts RÉELLEMENT seedés de la salle — la lecture réussit en démonstration, à la différence de `structuralPotentialPaths` (mémoire marché, corpus partagé non-seedable). Un compte de démonstration sans contact classable rend `null`, la même honnêteté qu’un compte réel.',
}

/**
 * « ET LA FAMILLE « COMPTES OUVERTS NON ÉTENDUS » (#3294, #3278) DU MAILLON FAIBLE MONTRE QUOI EN DÉMONSTRATION ? »
 * VIDE À DESSEIN (Louis 12/10/2026) — elle exige ≥ 3 comptes ouverts à UN seul contact, la moitié ou plus des comptes
 * ouverts joignables. Elle était démontrée par des comptes de grands clients réels à un siège sans nom ; Louis les a
 * RETIRÉS : cette situation n'arrive jamais dans la vraie vie, et la démo ne fabrique pas de comptes quasi vides pour
 * la montrer. Retrait ASSUMÉ (craft rule n°9), pas un contournement : `demo-weakest-link-extension-coverage.spec.ts`
 * échoue si un compte à un seul contact revient dans le jeu semé.
 */
export const DEMO_WEAKEST_LINK_EXTENSION_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    'Louis 12/10/2026 : un compte ouvert à un seul contact n’arrive jamais dans la vraie vie ; la démo ne fabrique pas de comptes quasi vides pour le montrer. Les comptes d’extension minces (Safran, BoursoBank et dix grands clients à siège sans nom) sont retirés ; Airbus, EDF, Renault et Thales sont des dossiers alimentés par de vraies analyses, Orange par son dossier de compte. 15/10/2026 : Safran et VINCI reviennent, RICHES cette fois, avec Crédit Agricole et Enedis — chacun alimenté par le dossier de compte de Théo (des centaines de contacts nommés, entités, sites), jamais par un siège sans nom. Le diagnostic « comptes ouverts non étendus » reste donc « non évalué » en salle, nommé comme tel, jamais 0.',
}

/**
 * « QUELS CONTACTS PORTENT LES QUATRE COMPTES ANALYSÉS (AIRBUS, EDF, RENAULT, THALES) ? » NOMS COMPLETS + DÉCIDEURS
 * (Louis 12/10/2026). Leurs vraies analyses comptent 1 130 à 2 547 personnes chacune, presque toutes à prénom seul (l'export
 * masque le nom de famille) : la démo ne sème que les contacts au NOM COMPLET (prénom + nom) et TOUS les décideurs
 * (`decision_role` posé, même à prénom seul). Plus aucun prénom seul non décideur. Le plafond de 400 reste une borne de
 * VOLUME (la purge de la démo prenait 14 s), jamais un tri : la liste est plus courte quand il y a moins de noms
 * complets. Le plan, les angles et l'organigramme ne citent que des contacts semés.
 */
export const DEMO_ANALYSED_ACCOUNTS_CONTACT_CAP_COVERAGE: Readonly<{ cap: number; reason: string }> = {
  cap: 400,
  reason:
    'Noms complets + décideurs (Louis 12/10/2026) : seuls les contacts au nom complet (prénom + nom) et tous les décideurs, même à prénom seul, sont semés ; plus aucun prénom seul non décideur. Plafond de 400 par compte analysé comme borne de volume (purge de la démo : 14 s), sans remplissage artificiel quand la liste est plus courte.',
}

/**
 * « ET LE BOUTON « REFORMULER AVEC LAURA » (#2060.9) SUR UNE RÉPONSE LIBRE DU
 * QUESTIONNAIRE MONTRE QUOI EN DÉMONSTRATION ? » VIDE À DESSEIN, PAR
 * CONSTRUCTION (18/09/2026).
 *
 * Pas un oubli, une IMPOSSIBILITÉ tracée : `needsOnboarding`
 * (`apps/web/src/features/onboarding/lib/onboarding-gate.ts`, ligne ~100)
 * rend `false` dès que `credits.is_demo === true`, AVANT tout autre test —
 * « Espace de démonstration : le visiteur arrive par un lien ouvert pour VOIR
 * le produit, jamais pour remplir un questionnaire. Il atterrit directement
 * dans l'app, quel que soit l'état d'onboarding du compte démo partagé. » Un
 * visiteur de la salle de démonstration n'ouvre donc JAMAIS
 * `/onboarding/*` — ni le champ de réponse libre, ni ce bouton.
 *
 * Fabriquer une reformulation SEMÉE pour un écran que la démonstration ne
 * traverse jamais serait exactement le piège nommé ailleurs dans ce dépôt :
 * une preuve de couverture sur un bloc mort. `esn_profiles` porte déjà la
 * même décision plus haut (`DEMO_ESN_PROFILE_COLUMNS_NOT_APPLICABLE` et son
 * en-tête : « vide à dessein — c'est l'onboarding qui le remplit »).
 */
export const DEMO_ONBOARDING_REFORMULATE_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2060.9 — le bouton « Reformuler avec Laura » vit sur une réponse libre du questionnaire d'onboarding (`AnswerReformulation.tsx`). `needsOnboarding` (onboarding-gate.ts) rend `false` dès que `credits.is_demo === true`, AVANT tout autre test : un visiteur de la salle de démonstration n'atteint donc JAMAIS `/onboarding/*`, ce champ ni ce bouton. Semer une reformulation d'exemple pour un écran hors d'atteinte serait une preuve de couverture sur un bloc mort.",
}

/**
 * #2897 (#2091.36) — la bannière « BellumAI a été repensé », montée au ROOT
 * (`__root.tsx`), donc ATTEIGNABLE en salle de démonstration (contrairement à
 * `DEMO_ONBOARDING_REFORMULATE_COVERAGE` juste au-dessus, qui vit sous
 * `/onboarding/*`, fermé aux salles). `GET /onboarding/redesign-banner` ne
 * fait aucun appel fournisseur — le lire en démo est sans risque.
 *
 * Ce qu'il rend, et pourquoi c'est vide à dessein plutôt que seedé :
 * `OnboardingService.firstOnboardingCompletionAt` lit `user_onboarding_
 * transitions` (la transition RÉELLE `to_status: 'completed'`) — cette table
 * reste VIDE en démo, le compte étant seedé directement en `completed`
 * (voir le docblock du profil ESN de démo, `demo-dataset.ts`, et le
 * relèvement de `DEMO_INTENTIONALLY_EMPTY.user_onboarding_transitions`
 * ci-dessus). Aucune transition RÉELLE n'a donc jamais eu lieu pour ce
 * compte : « son onboarding a-t-il précédé la refonte ? » est authentiquement
 * INCONNU, pas faux — `firstOnboardingCompletionAt` rend `null`,
 * `getRedesignBannerState` rend `{ visible: false }`. Semer une transition
 * fictive pour forcer la bannière inventerait un fait (une date de
 * complétion) qu'aucune vraie action de ce compte n'a produit.
 */
export const DEMO_WELCOME_REDESIGN_BANNER_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2897 — la bannière lit user_onboarding_transitions (la transition RÉELLE to_status='completed'), vide en démo (le compte y est seedé directement en 'completed', jamais via une transition). 'avant ou après la refonte' est donc authentiquement inconnu pour ce compte, pas faux : getRedesignBannerState rend { visible: false } honnêtement. La seedée forcerait une date de complétion fictive.",
}

/**
 * #2021 — DÉCISION LOUIS 08/10/2026 : le bandeau « Questionnaire en cours —
 * Reprendre » (`OnboardingRefreshBanner`, monté dans `CustomerPageContent` —
 * le chrome commun à TOUTE page cliente, donc ATTEIGNABLE en salle de
 * démonstration, contrairement à `DEMO_ONBOARDING_REFORMULATE_COVERAGE`
 * plus haut qui vit sous `/onboarding/*`, fermé aux salles).
 *
 * Vide à dessein, DEUX fois plutôt qu'une — les deux gardes se recouvrent,
 * même sans la première la seconde suffirait :
 *  1. `shouldShowOnboardingRefreshBanner` (`onboarding-gate.ts`) rend `false`
 *     dès que `credits.is_demo === true`, AVANT tout autre test — même garde
 *     que `needsOnboarding`.
 *  2. `first_completed_at` (dérivé de `firstOnboardingCompletionAt`, voir
 *     `DEMO_WELCOME_REDESIGN_BANNER_COVERAGE` ci-dessus) reste `null` en
 *     démo : le compte y est seedé directement en `completed`, jamais via
 *     une transition RÉELLE (`user_onboarding_transitions` vide, relevé
 *     dans `DEMO_INTENTIONALLY_EMPTY` ci-dessous).
 *
 * Semer une transition ou un statut `refresh_required` fictifs inventerait
 * un geste (« revoir mon questionnaire ») qu'aucun visiteur de salle n'a
 * jamais posé — la même doctrine que la reformulation d'onboarding plus haut.
 */
export const DEMO_ONBOARDING_REFRESH_BANNER_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2021 (décision Louis 08/10/2026) — le bandeau « Questionnaire en cours — Reprendre » (CustomerPageContent, donc atteignable en démo) rend false en démo pour DEUX raisons qui se recouvrent : shouldShowOnboardingRefreshBanner exclut is_demo AVANT tout autre test (même garde que needsOnboarding) ET first_completed_at (firstOnboardingCompletionAt) reste null (compte seedé directement en completed, jamais via une transition réelle — voir DEMO_WELCOME_REDESIGN_BANNER_COVERAGE). Semer une transition ou un refresh_required fictifs inventerait un geste que personne n'a posé.",
}

/**
 * « ET LA RELATION SEULEMENT OBSERVÉE DE L'ONGLET PARTENAIRES (#1624) MONTRE
 * QUOI EN DÉMONSTRATION ? » VIDE À DESSEIN — MÊME CORPUS PARTAGÉ, MÊME REFUS
 * (16/09/2026).
 *
 * Ce que le lot du 16/09 rend atteignable à l'écran : sur une ligne que
 * PERSONNE dans l'espace n'a déclarée ni qualifiée et que le corpus de parcours
 * observe, le badge de rang dit « Route partenaire potentielle » au lieu de
 * « Rang inconnu », et la modale porte ses deux sorties (« Qualifier cette
 * relation », « Vérifier aujourd'hui »). Le prédicat `isObservedOnly`
 * (`TabPartners.tsx`) ne peut être vrai que si `evidence_origins` contient
 * `market_observation`.
 *
 * Or cette origine n'est posée que par `mergePartnerEvidence` à partir de
 * `MarketMemoryService.coverageFor`, donc des QUATRE tables partagées de la
 * mémoire marché — jamais seedées, jamais seedables (GA-258, #1633/#1635) :
 * y écrire des lignes de démonstration les injecterait dans le corpus que
 * lisent de vraies ESN concurrentes. Le refus l'emporte sur la parité démo, et
 * il est tenu par l'ABSENCE DE CHEMIN, pas par ce commentaire.
 *
 * Ce que la salle voit donc, et qui n'est pas un trou : les trois sociétés de
 * services du client FICTIF (`DEMO_SEEDED_TABLES` → `account_partners`,
 * `DemoSeedService`), avec leur rang, leur relation et leur origine portés par
 * le jeu de données — deux `analysis`, une `declared`. Si le corpus RÉEL
 * observe l'une d'elles, le libellé et les deux CTA apparaissent d'eux-mêmes,
 * exactement comme chez un client ; s'il ne l'observe pas, l'écran dit la même
 * vérité qu'à un client dont le secteur n'est pas encore couvert.
 *
 * ⚠️ Ce n'est PAS un déplacement vers « vide à dessein » pour faire passer une
 * garde : `account_partners` est et reste SEEDÉE. C'est un ÉTAT de cette table
 * — l'observation de marché — qu'aucun semis n'a le droit de produire.
 */
export const DEMO_OBSERVED_ONLY_PARTNER_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#1624 (16/09/2026) — le libellé « Route partenaire potentielle » et les deux CTA de la modale sont gouvernés par l'origine `market_observation`, posée depuis les quatre tables PARTAGÉES de la mémoire marché : non seedables (GA-258, #1633/#1635), parce qu'un semis les injecterait dans le corpus lu par de vraies ESN concurrentes. `account_partners` reste seedée (3 sociétés sur le client FICTIF) ; c'est l'ÉTAT « observée par le corpus » qui ne se sème pas.",
}

/**
 * #2371.4 (#2887, lot M09, 09/10/2026) — LE 10e STADE « PARTENAIRE ACTIF ».
 *
 * Le stade se lit sur un COMPTE dont le SIREN est celui d'une relation
 * partenaire (`partner_relations`) avec des placements en cours. La salle sème
 * bien `partner_relations` (Talan à 3 placements, `DEMO_PARTNER_RELATIONS`) —
 * mais une ESN partenaire n'y est JAMAIS un compte de la liste : décision Louis
 * (recette prod 05/10, `demo-partner-esn-not-accounts.spec.ts`), « une ESN
 * partenaire n'est PAS un compte prospect, on n'affiche pas un compte vide ».
 * Semer un compte Talan pour allumer ce stade romprait cette décision ; poser
 * le stade sur un compte CIBLE réel (SNCF, SG…) affirmerait qu'un grand compte
 * est une ESN partenaire — une déclaration inventée sur un tiers.
 *
 * Ce que la salle montre donc, et qui n'est pas un trou : les neuf autres
 * stades (le client de livraison porte `besoin_ouvert`). Le libellé du stade,
 * sa cadence et sa consigne de message existent, et s'allument d'eux-mêmes le
 * jour où un compte de l'espace partage le SIREN d'un partenaire actif.
 */
export const DEMO_ACTIVE_PARTNER_STAGE_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2371.4 — le stade « partenaire actif » se lit sur un COMPTE au SIREN d'une relation partenaire à placements en cours. `partner_relations` reste SEEDÉE (Talan, 3 placements) ; mais une ESN partenaire n'est jamais un compte de la salle (décision Louis 05/10, demo-partner-esn-not-accounts.spec.ts), et poser ce stade sur un grand compte réel serait une déclaration inventée sur un tiers.",
}

/**
 * #2151.32 (18/09/2026) — LE FILTRE « CLIENTS OBSERVÉS » DE DÉCOUVRIR ›
 * PARTENAIRES, MÊME CAUSE QUE `DEMO_OBSERVED_ONLY_PARTNER_COVERAGE` CI-DESSUS.
 *
 * `observedAtAccounts`/`unresolvedAtAccounts` (`EsnOnAccountsRow`,
 * `attachObservedClients`) viennent de LA MÊME lecture que le bloc « observées »
 * de l'onglet Partenaires — `MarketMemoryService.coverageFor`, donc des quatre
 * tables PARTAGÉES de la mémoire marché : non seedables (GA-258, #1633/#1635),
 * pour la même raison exacte que ci-dessus.
 *
 * En salle de démonstration, le filtre est visible et cliquable — coché, il
 * n'écarte donc personne EN SILENCE : le client fictif porteur d'`account_partners`
 * n'a pas de correspondance dans le corpus réel, donc `unresolvedAtAccounts`
 * reste son seul état possible (jamais `observedAtAccounts`, jamais un « non
 * observé » deviné), et le compteur « N inconnus » de `FilterRail` le montre —
 * c'est le geste RÉEL, pas un trou.
 */
export const DEMO_DISCOVER_OBSERVED_CLIENTS_FILTER_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2151.32 (18/09/2026) — `observedAtAccounts`/`unresolvedAtAccounts` viennent de la MÊME lecture que `DEMO_OBSERVED_ONLY_PARTNER_COVERAGE` (`MarketMemoryService.coverageFor`, les quatre tables PARTAGÉES de la mémoire marché) : non seedables (GA-258, #1633/#1635), même raison. Le filtre reste visible et actionnable en démo — coché, le client fictif retombe sur « inconnu » (`unresolvedAtAccounts`), jamais sur un « non observé » deviné, et le compteur affiché à l'écran le dit.",
}

/**
 * #4677 (L7) — « SIGNAUX EN COURS » SUR UNE CARTE DE DÉCOUVRIR : état TRANSITOIRE, vide à dessein.
 *
 * `signalsState` (`pending` / `none` / `unavailable`) dit pourquoi une carte n'a pas (encore) ses signaux.
 * `pending` n'existe que tant qu'une moisson d'arrière-plan court : en salle de démonstration la liste de
 * Découvrir est SCRIPTÉE (`demo-scripts.ts`), zéro appel réseau, et chaque ligne porte déjà ses signaux ou
 * `signalsSearched` fixé. Seeder un « en cours » qui ne se résout jamais montrerait un chargement éternel au
 * prospect — pire qu'un trou. `none` est déjà visible (une ligne cherchée sans signal, `signalsSearched: true`).
 */
export const DEMO_DISCOVER_SIGNALS_PENDING_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#4677 (L7) — `signalsState: 'pending'` n'existe que pendant la moisson d'arrière-plan des signaux ; la liste de Découvrir en démo est scriptée (zéro appel réseau), aucune moisson ne tourne donc et un « en cours » seedé ne se résoudrait jamais. Les deux autres états se voient : « aucun signal mesuré » (`signalsSearched: true`, rien trouvé) est déjà seedé ; « source indisponible » suppose une source qui répond mal, impossible sans réseau.",
}

/**
 * #2837 (25/09/2026, complété le même jour) — LA LIGNE MÉMOIRE MARCHÉ, DANS
 * LES 4 VUES DE L'ORGANIGRAMME, MÊME CAUSE QUE
 * `DEMO_DISCOVER_OBSERVED_CLIENTS_FILTER_COVERAGE` CI-DESSUS.
 *
 * `OrgInfluenceMap.tsx` (carte système, première tranche) pose la ligne sur la
 * carte de l'entité RACINE seulement. `GroupOrgView.tsx` (racine du groupe,
 * `depth === 0`), `HierarchyOrgView.tsx` et `FocalOrgView.tsx` (direction
 * ouverte, seulement quand elle EST une racine — `orgRootEntityIds`, GA-391)
 * l'ont rejointe le même jour, sur la MÊME dérivation partagée
 * (`orgMarketMemoryLine.ts`, GA-26) et le MÊME `useAccountMarketContext`
 * qu'`AccountMarketMemoryCard` (#1640.3) — donc `GET /accounts/:id/market-context`,
 * donc `MarketMemoryService.coverageFor`, donc les quatre tables PARTAGÉES de
 * la mémoire marché (GA-258) : non seedables, pour la même raison exacte que
 * les entrées voisines (y écrire des lignes de démonstration les injecterait
 * dans le corpus RÉEL que lisent de vraies ESN concurrentes).
 *
 * Ce que la salle de démonstration voit dépend donc du recoupement RÉEL entre
 * chaque compte fictif et le corpus réel — imprévisible à l'écriture, honnête
 * si la ligne dit « Non mesuré » plutôt qu'un chiffre deviné. Les quatre états
 * (couvert / non mesuré / panne / lecture en cours) restent ceux
 * qu'`AccountMarketMemoryCard` porte déjà : aucune quatrième phrase n'est
 * inventée pour ces quatre écrans.
 */
export const DEMO_ORG_MAP_MARKET_MEMORY_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2837 (25/09/2026) — les 4 vues de l'organigramme (`OrgInfluenceMap.tsx` sur la carte racine, `GroupOrgView.tsx` sur l'entité `depth === 0`, `HierarchyOrgView.tsx`/`FocalOrgView.tsx` sur la direction ouverte quand elle est une racine — GA-391) réutilisent la MÊME dérivation (`orgMarketMemoryLine.ts`, GA-26) et le MÊME hook qu'`AccountMarketMemoryCard` (#1640.3), `useAccountMarketContext`, donc `GET /accounts/:id/market-context` et `MarketMemoryService.coverageFor` : les quatre tables PARTAGÉES de la mémoire marché (GA-258, #1633/#1635) ne sont jamais seedables, pour la même raison que `DEMO_AUDIT_MARKET_MEMORY_COVERAGE` et `DEMO_DISCOVER_OBSERVED_CLIENTS_FILTER_COVERAGE` — y écrire une ligne fictive l'injecterait dans le corpus RÉEL que lisent de vraies ESN concurrentes. Ce que la salle voit dépend du recoupement RÉEL entre chaque compte fictif et le corpus : imprévisible à l'écriture, honnête quand la ligne dit « Non mesuré ».",
}

/**
 * #2298.8 (21/09/2026) — LA MODALE « SUR MES COMPTES » DU PIPELINE PARTENAIRE,
 * MÊME CAUSE QUE `DEMO_DISCOVER_OBSERVED_CLIENTS_FILTER_COVERAGE` CI-DESSUS,
 * SURFACE DIFFÉRENTE.
 *
 * Le lot #2298.8 branche enfin `observedAtAccounts`/`unresolvedAtAccounts`
 * (externalWorkforceObserved) dans `EsnOnAccountsDetailModal`
 * (`PartnerPipeline.tsx`) — calculés depuis #2151.32, jamais rendus jusqu'ici.
 * Même lecture, même table PARTAGÉE non seedable (GA-258, #1633/#1635) : en
 * démo, cette badge reste invisible, PAS par oubli mais parce que semer la
 * mémoire marché injecterait une ligne fictive dans le corpus que lisent de
 * vraies ESN concurrentes (voir `DEMO_OBSERVED_ONLY_PARTNER_COVERAGE`).
 *
 * ⚠️ `rank2Observations` (rank2Potential), branché dans LE MÊME lot et LA
 * MÊME modale, n'a PAS cette réserve : il vient d'`account_partners`, SEEDÉE
 * (voir le test « le jeu de démonstration porte une observation de rang 2
 * datée » dans `demo-coverage.spec.ts`) — la ligne « mc2i »
 * (`demo-dataset.ts`) le rend réellement en démonstration.
 */
export const DEMO_ON_ACCOUNTS_EXTERNAL_WORKFORCE_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2298.8 (21/09/2026) — `observedAtAccounts`/`unresolvedAtAccounts`, rendus dans `EsnOnAccountsDetailModal` (onglet « Sur mes comptes » du pipeline partenaire), viennent de la MÊME lecture que `DEMO_DISCOVER_OBSERVED_CLIENTS_FILTER_COVERAGE` (`MarketMemoryService.coverageFor`, les quatre tables PARTAGÉES de la mémoire marché) : non seedables (GA-258, #1633/#1635), même raison exacte. `rank2Observations`, branché dans le même lot, n'a PAS cette réserve : il vient d'`account_partners`, SEEDÉE (« mc2i », `demo-dataset.ts`).",
}

/**
 * #3547 (02/10/2026) — LE FORFAIT ENCADRÉ (mission sans consultant, rôle tenu,
 * équipe côté client) : SEEDÉ.
 *
 * Aucune table ni clé `raw_analysis` à lui : quatre colonnes de `missions` et de
 * `project_needs` (migration `1796424913577`) — la garde par table ne poserait
 * jamais la question. D'où cette entrée, et son appelant
 * `demo-supervised-forfait-coverage.spec.ts` qui lit le VRAI jeu de données
 * (`DEMO_SUPERVISED_FORFAIT_MISSION`) et l'appelant du semis.
 */
export const DEMO_SUPERVISED_FORFAIT_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#3547 (02/10/2026) — « Cadrage et supervision du forfait refonte paiement — équipe client » (démo) est une mission active en forfait encadré, SANS consultant : la table des missions et le planning disent « Forfait encadré · Cadrage et supervision » au lieu de « Personne d’affecté », le board n’y pose aucune alerte « sans consultant », la fiche nomme l’équipe côté client (trois noms fictifs sur huit personnes déclarées), et la marge se calcule (900 € de TJM de référence, 560 € de coût chargé) sans qu’aucun consultant ne soit affecté.',
}

/**
 * #4291 (lot J, décision Louis 21/10/2026) — LE SECOND ESPACE DÉMO, au profil forfait / conseil : CLASSÉ.
 *
 * TABLES. Une salle forfait est semée par le MÊME `seedWorkspace` que la salle staffing : elle porte donc
 * exactement le classement de `DEMO_SEEDED_TABLES` / `DEMO_INTENTIONALLY_EMPTY`, sans rien y déplacer. La variante
 * (`seedForfaitVariant`) n'écrit QUE dans les tables ci-dessous, toutes déjà semées et purgées par espace : aucune
 * table neuve, aucune FK neuve. Garde : `demo-forfait-room.spec.ts` (la liste est relue sur le code du semis).
 *
 * `raw_analysis`. Les trois comptes forfait sont FICTIFS : ils portent ce qu'un compte fictif peut porter sans
 * rien inventer d'un tiers (activité, enjeux, signaux datés). Les autres clés du contrat sont vides à dessein
 * pour CES comptes — la raison est écrite ci-dessous ; les comptes staffing de la même salle les remplissent
 * comme avant.
 */
export const DEMO_FORFAIT_ROOM_COVERAGE: Readonly<{
  state: 'seede'
  tables: readonly string[]
  rawAnalysis: { seeded: readonly string[]; othersEmptyReason: string }
  reason: string
}> = {
  state: 'seede',
  tables: [
    'accounts',
    'contacts',
    'account_entities',
    'attack_angles',
    'action_plans',
    'project_needs',
    'missions',
    'mission_commercial_terms',
    'esn_profiles',
    // #4291.7 — l'affaire « Plan stratégique 2029 » (Société Générale) cadrée : périmètre + sponsor.
    'opportunities',
    'project_contacts',
  ],
  rawAnalysis: {
    seeded: ['business_description', 'it_challenges', 'recent_signals'],
    othersEmptyReason:
      '#4291 J — comptes FICTIFS sans identifiant de registre : registre (dirigeants, capital, finances, marchés publics attribués), organigramme collecté, technologie observée et lecture IA (score, go/no-go, hypothèses) ne se fabriquent pas pour une société qui n’existe pas — « JAMAIS de donnée fictive » vaut aussi pour un tiers fictif présenté comme collecté. Le compte montre ses contacts nommés, ses signaux datés, ses angles et son plan ; les comptes staffing de la même salle remplissent ces clés comme avant.',
  },
  reason:
    '#4291 J — « Lancer la démo forfait / conseil » (/demo) ouvre une salle au profil forfait_conseil : Staffing après les besoins (#4270.2), trois comptes fictifs (Mutuelle Horizon Santé, Valmont Distribution, Régie des Eaux du Grand Ouest) avec contacts nommés dont décideurs, signaux datés et plan, des besoins lus comme projets à cadrer (périmètre, sponsor, budget, échéance) et deux projets gagnés suivis à la place d’une mission (forfait encadré, sans consultant) ; le vivier de la salle reste au second plan.',
}

/**
 * #4196 (épopée #4191, lot L5, 14/10/2026) — LE CYCLE DE VIE D'UNE MISSION : SEEDÉ.
 *
 * Aucune table ni clé `raw_analysis` neuve (le lot ajoute des routes, pas une table) : la garde par
 * table ne poserait jamais la question. Le semis `demo-crm-mission-lifecycle.ts` pose, sur Société
 * Générale, une mission qui finit dans 25 jours avec son avenant de prolongation accepté, un
 * consultant « en mission » désarchivé par le démarrage, et une mission terminée dont le consultant
 * est revenu disponible. Garde : `demo-crm-mission-lifecycle.spec.ts`.
 */
/**
 * #4459.4 (22/10/2026, craft rule n°9) — « Venu de ton CRM » : ce qui y était, ce que l'analyse a apporté. Aucune
 * table neuve (la provenance se lit dans `record_import_marks`, déjà semée) : la question se pose ici.
 * Garde : `demo-crm-completion.spec.ts`.
 */
export const DEMO_CRM_COMPLETION_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4459.4 — Société Générale (dossier analysé) se lit « Venu de ton CRM » : la trace d’import de la salle porte le compte et Lorenzo Bini Smaghi (« Déjà dans ton CRM »), PAS Pierre Palmieri ni Maxime Delaunay (« Apporté par Bellum ») — `DEMO_CRM_COMPLETION`, `seedImportMarks`. Le compteur (Personnes et Synthèse) dit « N dans ton CRM · 2 trouvés par l’analyse », N étant TOUS les autres contacts du dossier (plus d’une centaine, jamais un nombre figé), et « Compléter le compte » propose les deux apportés vers le CRM fictif de la salle (`DEMO_CRM_PUSH_TARGETS`). Les autres dossiers restent entièrement importés : leurs contacts sont tous « dans ton CRM », sans bouton (rien à compléter).',
}

export const DEMO_CRM_MISSION_LIFECYCLE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4196 (14/10/2026) — « Prolonger » et « Terminer » une mission, et le consultant qui suit (en mission / disponible), se démontrent sur Société Générale : une mission active qui finit dans 25 jours avec un avenant de prolongation accepté dans son historique, son consultant « en mission » (fiche désarchivée, tracée), et une mission terminée il y a 20 jours dont le consultant est revenu disponible.',
}

/**
 * #4406.6 (21/10/2026, craft rule n°9) — LES CONVERSATIONS BEEPER DE MESSAGERIE : SEEDÉES (par l'adaptateur).
 *
 * Aucune table : côté Bellum une conversation Beeper n'est JAMAIS stockée (c96, lecture en direct). La salle
 * reçoit donc ses conversations de `demo-beeper.ts` à la lecture, comme la messagerie (`demo-briefing.ts`).
 * Garde : `demo-beeper-coverage.spec.ts`.
 */
export const DEMO_BEEPER_CONVERSATIONS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4406.6 (21/10/2026) — Messagerie › Beeper liste trois conversations fictives (WhatsApp, LinkedIn, Signal ; une à deux, une de groupe) fournies par `demoBeeperConversations` ; celle de Nadia Perrin (SNCF Voyageurs, contact SEMÉ) se rattache VRAIMENT à son contact par e-mail, les deux autres restent sans contact (rien de deviné). « Préparer la réponse » lit `demoBeeperMessages` ; aucun envoi ne part d’une salle (refus nommé), aucun appel réseau.',
}

/**
 * #4191 (recette 15/10, D1) — L'AFFAIRE ET LE BESOIN D'ORIGINE DES MISSIONS EN COURS : SEEDÉS.
 *
 * Aucune table neuve (`opportunities` / `project_needs` / `missions` sont déjà seedées) : la question « et en
 * démo ? » porte sur la ligne « Besoin d'origine » de la fiche mission. Garde : `demo-crm-recette.spec.ts`.
 */
export const DEMO_CRM_RECETTE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4191 (15/10/2026) — Besoin d’origine de chaque mission en cours de la salle : les missions SNCF « recette applicative lot A » et Société Générale « refonte du SI paiement, phase 2 » (et leurs voisines) portent une affaire gagnée et un besoin pourvu (`missions.opportunity_id` / `need_id`), posés dans le semis seulement — le produit ne devine jamais une origine.',
}

/**
 * Théo C projects-besoins (22/10/2026) — LA PAGE BESOINS (3 STATUTS, SOURCE CLIQUABLE, PÉRIMÉ) : SEEDÉE.
 *
 * Aucune table neuve (`project_needs` / `need_proposals` sont déjà seedées) : la question « et en démo ? » porte
 * sur ce que la liste et le kanban montrent. Garde : `demo-flagship-need-source.spec.ts`.
 */
export const DEMO_THEO_BESOINS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'Théo C projects-besoins — les trois statuts affichés (À qualifier · Ouvert · Couvert) ont chacun des besoins semés (dont des besoins pourvus) ; le besoin phare naît d’une offre repérée (`need_proposals` acceptée, `created_need_id`) dont la page d’origine est un lien visible sur sa ligne ; le premier rôle ouvert de la salle date de douze jours sans profil positionné, donc porte la pastille « Périmé — à revérifier ».',
}

/**
 * #4499 (Louis 23/10/2026) — AFFAIRES AU DESSIN DE LA MAQUETTE V22 (ligne de synthèse, Kanban sobre, menu « … ») :
 * SEEDÉE.
 *
 * Aucune table neuve (`opportunities` / `tasks` / `submissions` sont déjà seedées) : la question « et en démo ? »
 * porte sur ce que la ligne de synthèse et les cartes montrent. Garde : `demo-affaires-v22-coverage.spec.ts`.
 */
export const DEMO_AFFAIRES_V22_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4499 — le pipe de la salle porte des affaires CHIFFRÉES (la ligne « X € pipe ouvert HT · estimation non pondérée » montre un montant), une affaire SANS montant (la carte dit « Montant à saisir », la ligne « N projets sans montant saisi »), des prochaines actions datées (tâches ouvertes rattachées par `tasks.project_id`) et une affaire délibérément sans action, un porteur sur chaque affaire (le responsable de la carte) et une affaire signée (la colonne Gagnée, hors total). Aucune ligne n’est semée POUR cet écran : il relit le pipe existant.',
}

/**
 * #4191 (recette 15/10, lot 2, E5) — L'EXEMPLE VITRINE DU PANNEAU « OBJETS LIÉS » : SEEDÉ.
 *
 * Aucune table neuve (`opportunities` / `project_needs` / `submissions` / `commercial_transitions` sont déjà
 * seedées) : la question « et en démo ? » porte sur ce que le panneau latéral montre d'une affaire. Garde :
 * `demo-crm-recette2.spec.ts`.
 */
export const DEMO_CRM_RECETTE2_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4191 (15/10/2026, recette 2) — Une affaire au stade avancé chez Orange (à défaut, Société Générale, le compte vitrine le plus riche) : un besoin et deux positionnements (envoyé, entretien) sur deux consultants, pour que « Objets liés » du panneau latéral ait un exemple complet en démonstration.',
}

/**
 * #3895 (arbitrage Louis 11/10) — L'HISTORIQUE DES BESOINS FERMÉS ET LE CV QUI NOMME UN CLIENT : SEEDÉS.
 *
 * Aucune table neuve (`opportunities` / `project_needs` / `consultant_experiences` sont déjà seedées) : la
 * question « et en démo ? » porte sur CE QUE le copilote doit retrouver. Le compte Sanofi (vrai compte des
 * briefs, jamais un compte « exemple ») porte un besoin FERMÉ avec son motif (`DemoDossier.closedNeeds`,
 * `find_needs.include_closed`, #3889.2), et un CV de la salle nomme Sanofi comme client
 * (`search_talents.experience_client`, #3889.1). Garde : `demo-sanofi-closed-need-coverage.spec.ts`.
 */
export const DEMO_SANOFI_CLOSED_NEED_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#3895 — Sanofi porte un besoin annulé (statut final, motif, date) semé par `seedBriefClosedNeeds`, et la CV d’Inès Castel nomme Sanofi comme client : « Sanofi a-t-il eu des besoins fermés ? » et « quels consultants ont une expérience chez Sanofi ? » retrouvent un fait en démo, sans intervention.',
}

/**
 * #3895 (décision Louis 11/10) — LA PORTÉE ENTITÉ DU GROUPE D'UNE NOTE : VIDE À DESSEIN (Louis 12/10/2026).
 *
 * Une colonne de `notes` (`also_applies_to_account_ids`), pas une table. Elle était démontrée par BoursoBank, entité sœur
 * de Société Générale — un compte à un seul siège, RETIRÉ par Louis (« ça n'arrive jamais dans la vraie vie »). Aucun
 * autre compte riche de la salle n'a de sœur de groupe semée : la démo ne fabrique pas un compte quasi vide pour la
 * montrer. Garde : `demo-note-group-scope-coverage.spec.ts` (aucune note ne désigne une entité absente).
 */
export const DEMO_NOTE_GROUP_SCOPE_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    '#3895 — Louis 12/10/2026 : la portée « autres entités du groupe » d’une note n’est plus montrée en salle, car son seul porteur (BoursoBank, entité sœur de Société Générale) était un compte à un seul contact, retiré ; la démo ne fabrique pas de compte quasi vide. La colonne et l’écran existent (notes.group-scope.spec.ts).',
}

/**
 * #4268.b (Louis 19/10/2026, base commune) — « ENRICHIR » LIT D'ABORD LA BASE COMMUNE : vide à dessein.
 *
 * Rien de visible neuf : la fiche reçoit une coordonnée (déjà affichée) et la provenance « shared_base ».
 * En salle, `enrichContact` sort par `enrichContactInDemo` AVANT toute lecture du commun (aucun appel
 * réseau, coordonnées fictives) — la recopie des coordonnées communes n'y est pas semée non plus
 * (voir #3989.7 plus bas). Tenu par `demo-shared-base-enrich-coverage.spec.ts`, qui lit l'ordre réel.
 */
export const DEMO_SHARED_BASE_ENRICH_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    '#4268.b — Louis 19/10/2026 : « Enrichir » pose d’abord la coordonnée pro que la base commune connaît déjà (aucun crédit). Rien de visible neuf, et la salle sort par `enrichContactInDemo` avant toute lecture du commun : la démo ne lit ni n’écrit jamais le réel.',
}

/**
 * #4158.60-.62 (EX-03) — LA CARTE « AUTRES ENTITÉS DU GROUPE » : vide à dessein.
 *
 * Aucune table ni colonne neuve : la carte relit `accounts` (`group_head_siren`) par `GET /accounts/:id/group-entities`.
 * Elle ne fait AUCUNE ligne tant qu'un compte n'a pas de compte frère dans l'espace (« une absence ne fait aucune
 * ligne »). Or la salle ne compte qu'UNE tête de groupe (Société Générale) dont les filiales sont nommées dans
 * `subsidiaries` sans être des comptes : la seule entité sœur semée (BoursoBank) a été retirée le 12/10/2026 par Louis
 * (« la démo ne fabrique pas de compte quasi vide », voir `DEMO_NOTE_GROUP_SCOPE_COVERAGE`). Semer une filiale
 * demande un dossier entier (analyse, contacts, score) : hors de ce lot, nommé comme reste.
 */
export const DEMO_GROUP_ENTITIES_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    '#4158.60-.62 — la carte des autres entités du groupe relit des comptes frères ; la salle n’en compte aucun (Société Générale est seule de son groupe, ses filiales sont nommées en texte et la seule entité sœur semée a été retirée le 12/10/2026 : la démo ne fabrique pas de compte quasi vide). Sans compte frère la carte ne fait aucune ligne. Reste : semer une filiale avec son dossier complet.',
}

/**
 * #4016.L4 (lot V10-E, 17/10) — COÛT D'ACCÈS ESTIMÉ : SEMÉ (SEMIS-PREUVES 4295.19, 20/10/2026). Calculé à la
 * lecture (aucune table, aucune clé de `raw_analysis`) depuis UNE déclaration de l'espace sur un autre compte au
 * MÊME verrou. Renversé le 20/10 : la salle sème désormais deux déclarations de l'ÉQUIPE de démonstration
 * (`DEMO_PERSONAL_ACCESS_EXTRA_SEEDS.costEstimate`) — un verrou + un coût sur Groupe BPCE, le même verrou sans
 * coût sur Société Générale — pour que l'onglet Accès de Société Générale montre « estimé ». Le verrou reste vide
 * sur le client de livraison (SNCF, `demo-need-access-lock.spec.ts`) et aucun marché n'est cité.
 */
export const DEMO_ACCESS_COST_ESTIMATE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4016.L4 / SEMIS-PREUVES 4295.19 — Groupe BPCE porte un verrou « semi-ouvert » ET un coût déclarés par l’équipe ; Société Générale porte le même verrou sans coût : son onglet Accès montre le coût badgé « estimé », avec le compte, la date et le verrou de la déclaration. Prouvé par `demo-semis-preuves-20-10.spec.ts`.',
}

/**
 * #4158.34 (#4128) / G.9 (recette R4 18/10, 4158.70) — OBJET PRIVÉ SUR LA FICHE CONTACT : SEEDÉ.
 *
 * Une colonne (`is_private`) sur `opportunities`, `project_needs` et `missions`, pas une table. ⚠️ Renversé le
 * 19/10/2026 : la salle n'a qu'un occupant qui gère l'espace et voit donc tout, mais l'état « Privé » doit se VOIR
 * devant un prospect. `seedTeamGuardrails` marque UN dossier du compte vitrine privé (le switch « Privé » coché).
 * Garde : `demo-private-object-coverage.spec.ts`.
 */
export const DEMO_PRIVATE_OBJECT_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4158.34 / G.9 — un objet du compte vitrine est privé en salle (`seedTeamGuardrails`, `UPDATE opportunities SET is_private = true` sur UN dossier) : le switch « Privé » se lit coché, et la règle (porteur et gestionnaires seulement) est celle de la production. L’occupant de la salle gère l’espace : il le voit, un collègue fictif ne le verrait pas.',
}

/**
 * LUD.4 bis (19/10/2026) — « OÙ PLACER CE PROFIL ? » POUR UN MÉTIER HORS INFORMATIQUE : VIDE À DESSEIN.
 *
 * Les entreprises cibles (`placementTargets`) ne se lisent que dans un espace dont le domaine d'offre n'est PAS
 * l'informatique, et elles viennent d'une lecture EN DIRECT de la veille (offres datées de la zone) croisée avec
 * les interlocuteurs de l'espace : aucune table, aucune clé de `raw_analysis`. Or la salle de démonstration est
 * un espace d'ESN informatique : l'écran y montre le tableau des ESN qui recrutent, comme avant. Fabriquer des
 * entreprises « qui recrutent un coordinateur de chantier » avec des offres datées serait inventer des faits
 * sur des sociétés réelles. Le comportement d'un espace informatique est inchangé (non-régression au test de l'écran).
 */
export const DEMO_PLACEMENT_TARGETS_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "LUD.4 bis — `placementTargets` n'existe que pour un espace NON-IT et vient d'une lecture en direct de la veille (aucune table, aucune clé de raw_analysis) ; la salle est un espace d'ESN informatique, qui garde le tableau des ESN qui recrutent. Semer des entreprises et des offres datées pour un métier de chantier inventerait des faits sur des sociétés réelles.",
}

/**
 * #4072 (12/10/2026) — LES ÉCRANS D'ACTION NOURRIS PAR LES FAITS DU COMPTE : SEEDÉS.
 *
 * Aucune table neuve : les six écrans relisent, par le lecteur unique, des tables DÉJÀ classées.
 *  .1 organigramme — `contacts.crm_record_id` posé sur les premiers contacts de Société Générale
 *     (`DEMO_ORG_CRM_MARKED_CONTACTS`) + l'interlocuteur de mission (`DEMO_MISSION_CLIENT_MANAGER`) ;
 *  .2 relances — les tâches du plan de SNCF (`DEMO_PLAN_TASKS`) face aux échanges de SNCF (`DEMO_ACTIVITIES`) ;
 *  .3 préparation de RDV — affaires de Société Générale, missions du client de livraison, échanges de SNCF ;
 *  .4 alertes — la récurrence se calcule à l'envoi d'une alerte de veille, que la salle ne déclenche pas
 *     (la veille quotidienne ne tourne pas en démonstration) : la règle est gardée par le test unitaire de
 *     `NotificationsService`, et l'écran d'alertes de la salle montre les notifications semées, sans récurrence ;
 *  .5 listes de cibles — les premiers dossiers semés portent leurs signaux datés (`recent_signals`) ;
 *  .6 matching — le besoin phare vit sur le client de livraison, qui porte des missions passées.
 * Garde : `demo-ecrans-faits-coverage.spec.ts`.
 */
export const DEMO_ECRANS_FAITS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4072 — organigramme (contacts du CRM de Société Générale + interlocuteur de mission), relances et préparation de RDV (échanges et tâches de SNCF, affaires de Société Générale), listes de cibles (signaux datés des premiers dossiers), matching (missions passées du client de livraison) lisent des tables déjà semées par le lecteur unique des faits du compte. Reste vide à dessein : la mention de récurrence d’une alerte, qui naît à l’envoi d’une alerte de veille — la veille quotidienne ne tourne pas en salle ; la règle est tenue par un test unitaire, pas par un semis qui ferait croire à une alerte qui n’a pas eu lieu.',
}

/**
 * #4072.4 (lot RESTE-15-10) — LA RÉCURRENCE D'UN SIGNAL SUR LA WATCHLIST : SEEDÉE.
 *
 * La Watchlist lit `GET /account-facts/recurrence` (lecteur par lot). Orange porte plusieurs offres d'emploi RÉELLES
 * dont la date est relative à l'ouverture de la salle (`posted_days_ago`) : la ligne dit « Ne signal de recrutement en
 * 30 jours » sans semis de plus. Garde : `demo-watchlist-recurrence-coverage.spec.ts`.
 */
export const DEMO_WATCHLIST_RECURRENCE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4072.4 — la ligne Watchlist d’Orange dit « Ne signal de recrutement en 30 jours » : ses offres d’emploi collectées portent des dates relatives à l’ouverture de la salle, lues par le même lecteur que la production (`signalRecurrenceOf`). Les comptes à un seul signal ne portent aucune ligne. Vérifié par `demo-watchlist-recurrence-coverage.spec.ts`.',
}

/**
 * #4158 (lot L4, 14/10/2026) — LES GARDE-FOUS ENTRE COLLÈGUES : SEEDÉS, À CONDITION D'UN COLLÈGUE FICTIF.
 *
 * Six écrans neufs : « déjà travaillé par X » (#20), « contacté par X il y a N j » (#21), la liste « ne
 * pas contacter » (#22), « consultant déjà proposé » (#23), « doublon probable » (#24), l'équipe de
 * compte (#25). Tous demandent une seconde personne, donc un collègue fictif — que seul un compte
 * d'authentification peut porter (clé étrangère dure de `workspace_members` / `profiles`) : il vient du
 * lot L2. `seedTeamGuardrails` PREND le premier autre membre de la salle, sans deviner d'identifiant, et
 * ne fait RIEN sans lui. Avec lui : une action et un message envoyé il y a 5 jours sur un contact de
 * Société Générale (#20, #21), une exclusion de domaine avec motif (#22), un positionnement du collègue chez
 * le même client (#23), le collègue dans l'équipe du compte (#25). Reste vide à dessein : « doublon
 * probable » (#24) — il lit les paires du balayage de l'espace, et la salle n'en porte aucune sur un compte
 * ouvert (`duplicate_pairs`, déjà classée) ; en fabriquer une ferait proposer la fusion de deux fiches qui
 * n'en sont pas. Garde : `demo-team-guardrails-seed.spec.ts`.
 */
export const DEMO_TEAM_GUARDRAILS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4158 — seedé seulement quand la salle a un collègue fictif (lot L2) : action et message envoyé sur un contact de Société Générale, exclusion de domaine, deux contacts du compte vitrine « ne pas contacter » (R24-FIX-B 15/10, motif et auteur, jamais celui déjà contacté), positionnement du collègue chez le même client, équipe de compte. Sans collègue, aucune trace de collègue — jamais attribuée à quelqu’un qui n’existe pas — mais la liste « ne pas contacter » (domaine + deux contacts) est posée au nom du visiteur (#4295.11, recette prod 19/10 : 0 « Ne pas contacter »). « Privé » reste vide à dessein (#4158.34, `DEMO_PRIVATE_OBJECT_COVERAGE`) : aucun écran de /team ni de /contacts n’affiche ce mot. Vide à dessein : le « doublon probable », qui lit les paires du balayage (aucune sur un compte ouvert de la salle). #4295.11 (31/10/2026) — le premier contact « ne pas contacter » est « Gaëtan Lemoine », fictif de SNCF (`DEMO_DO_NOT_CONTACT_LINKEDIN`) : la portée « recommandé » de /contacts ne montrait jamais un contact tiré au hasard parmi les ~1 800 de Société Générale. Garde : `demo-contacts-first-page-coverage.spec.ts`. « Privé » n’existe pas sur un contact (seuls les objets — affaire, besoin, mission — portent `is_private`).',
}

/**
 * #4069.4 (12/10/2026) — LES FAITS DU COMPTE (socle #4069) : SEEDÉS.
 *
 * Aucune table neuve : `AccountFactsService` relit des tables déjà classées. Le compte vitrine (Société
 * Générale) y rend ses signaux du dossier, ses trois affaires CRM (gagnée, perdue, en sommeil — #3918.b)
 * et sa note achats ; Sanofi ses documents d'avant-vente. Garde : `demo-account-facts-coverage.spec.ts`.
 */
export const DEMO_ACCOUNT_FACTS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4069 — le compte vitrine Société Générale rend, par le lecteur unique, ses signaux datés du dossier, une affaire gagnée, une perdue, une en sommeil et sa note achats ; Sanofi ses documents d’avant-vente. Restent vides, chacune pour la raison déjà écrite à sa ligne : `signal_history` (la veille quotidienne ne tourne pas en salle — les signaux viennent du dossier), `account_feedback` (une correction est le geste du visiteur) et la mémoire marché du compte (corpus non semé). #4284.19 — les PARCOURS (`career`) se lisent dans le parcours des interlocuteurs simulés (arrivée récente datée au seed) : une ligne « Parcours » ne naît que d’un rôle chez le compte ET daté, jamais d’un employeur sans date.',
}

/**
 * #3889 (épopée #3977, 11/10) — LES PROJETS D'UN COMPTE DÉCRITS DANS LES DOCUMENTS : SEEDÉS.
 *
 * Aucune table neuve (`rag_documents` est déjà seedée) : la question « et en démo ? » porte sur ce que
 * `search_document_projects` doit y retrouver. Des notes d'avant-vente FICTIVES rattachées au compte
 * Sanofi (`DEMO_SANOFI_PROJECT_NOTES_TITLE`, portée `account`) illustrent chaque rangement — besoin ouvert,
 * ancien besoin, mission, projet du client, besoin « non daté » —, et le chat scripté de la salle répond
 * `p-document-projects` en citant ce document. Garde : `demo-document-projects-coverage.spec.ts`.
 */
export const DEMO_DOCUMENT_PROJECTS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#3889 — « Notes d’avant-vente — projets Sanofi (démo) » est semé au compte Sanofi : « quels projets a Sanofi dans nos documents ? » y retrouve un besoin ouvert, un ancien besoin annulé, une mission terminée, un projet du client et un besoin non daté, chacun cité avec son document, sans intervention.',
}

/**
 * #4016 L1 (11/10/2026) — LA PROBABILITÉ CALIBRÉE ET LE CA PROBABLE DU
 * TRIMESTRE : SEEDÉS.
 *
 * Aucune table neuve ni clé `raw_analysis` : la probabilité se calcule à la
 * lecture (`GET /projects/probable-quarter`) sur `opportunities` et
 * `commercial_transitions`, déjà classées. Sans issues closes semées, la salle
 * n'aurait montré que « non mesuré » — d'où cette entrée, tenue par
 * `demo-probability-calibration-coverage.spec.ts`.
 */
export const DEMO_PROBABILITY_CALIBRATION_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4016 L1 — `DEMO_PROBABILITY_CALIBRATION` sème sept affaires closes au client fictif de la salle (quatre gagnées, trois perdues à des stades différents, parcours écrit au journal des transitions) et une affaire en négociation dans les trois mois à venir : le panneau « CA probable du trimestre » de /projects montre une probabilité MESURÉE, son intervalle, ses axes, et la base commune nommée non évaluable ou retenue.',
}

/**
 * Refonte Pilotage L1 (Louis 14/10/2026) — « CE QUI A BOUGÉ » DU COCKPIT
 * `/pilotage` : SEEDÉ.
 *
 * Aucune table ni clé `raw_analysis` neuve : `GET /pilotage/week-delta` se calcule
 * à la lecture sur `opportunities`, `commercial_transitions`, `missions` et
 * `invoice_readiness`, déjà classées. Mais le Cockpit ouvre sur sept compteurs,
 * et sans mouvement des sept derniers jours la salle les montrerait tous à
 * « 0 » — d'où cette entrée, tenue par `demo-pilotage-week-delta-coverage.spec.ts`.
 */
export const DEMO_PILOTAGE_WEEK_DELTA_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'Refonte Pilotage L1 — `DEMO_PILOTAGE_WEEK_MOVES` sème neuf affaires sur les comptes à brief de la salle (Société Générale, Groupe BPCE, ENGIE, TotalEnergies, Alstom, BNP Paribas), parcours écrit au journal `commercial_transitions`, dates relatives à la visite : trois créées (dont une sans montant saisi), trois avancées, une reculée, une perdue, une signée. `DEMO_PILOTAGE_RECENT_PAYMENTS` ajoute trois règlements des cinq derniers jours (mois précédent, que l’historique n’utilise pas). Les missions qui finissent sous trente jours existent déjà (fins à 12 et 28 jours). Le Cockpit montre donc ses sept compteurs RICHES ; l’objectif du mois lit `member_objectives`, déjà seedé (`DEMO_MEMBER_OBJECTIVE`).',
}

/**
 * #2291.2 (19/09/2026) — LE MODÈLE DE CONTRAT OBSERVÉ ET LE FILTRE « RECOURT
 * AU FREELANCE / À LA RÉGIE » DE DÉCOUVRIR : SEEDÉS.
 *
 * Aucune table ni clé `raw_analysis` à eux : l'observation voyage sur la
 * réponse de `/discover` (`DiscoverCandidate.contractModel`), et la salle
 * répond une liste SCRIPTÉE (`demoDiscoverResponse`, `demo-scripts.ts`). La
 * question « et en démo ? » n'est donc posée par aucune garde de table — d'où
 * cette entrée, et son appelant `demo-discover-contract-model-coverage.spec.ts`
 * qui lit la VRAIE réponse scriptée plutôt que ce commentaire.
 */
export const DEMO_DISCOVER_CONTRACT_MODEL_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#2291.2 (19/09/2026) — la liste scriptée de Découvrir porte le modèle de contrat observé : Aubrac Aerostructures (démo), dans la cible, montre 9 offres dont 3 « Profession libérale » — le filtre la GARDE ; Cévennes Défense Systèmes (démo), dans la cible aussi, est cherchée et NON observée (`contractModel: null`) — cochée, le filtre la retire et le rail le DIT ; Verdal Distribution (démo), hors cible, est observée sans indépendant ni régie. Aucun appel réseau : la salle rejoue une recherche déjà faite, comme ses signaux datés.',
}

/**
 * #4115 (13/10/2026) — LA GRILLE DE SIGNAUX DE DÉCOUVRIR (5 FORTS + 10
 * CONTEXTE) : SEEDÉE. Aucune table ni clé `raw_analysis` : `tier` voyage sur
 * chaque signal de la réponse de `/discover`, scriptée en salle
 * (`demoDiscoverResponse`). Appelant : `demo-discover-signal-grid-coverage.spec.ts`.
 */
export const DEMO_DISCOVER_SIGNAL_GRID_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4115 (13/10/2026) — Aubrac Aerostructures (démo), dans la cible et dans la vue par défaut, porte le plafond de la règle Louis du 13/10 : 5 signaux forts (appel d’offres, levée, nomination, deux recrutements) puis 10 de contexte, chaque tranche du plus frais au plus ancien, sans stage ni probabilité. Vérifié par `demo-discover-signal-grid-coverage.spec.ts`.',
}

/**
 * #4294.9 (20/10/2026) — LA LECTURE DES BESOINS HISTORIQUES D'UN COMPTE (Découvrir + Laura + analyse) :
 * SEEDÉE. Aucune table d'espace ni clé `raw_analysis` neuve : les besoins vivent dans la base commune
 * PARTAGÉE (`dataforge_needs`, jamais semée en salle — ce serait un fait de marché inventé) ; la salle
 * rejoue leur LECTURE. Appelant : `demo-discover-source-axes-coverage.spec.ts`.
 */
export const DEMO_HISTORICAL_NEEDS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4294.9 (20/10/2026) — Découvrir : la carte Cévennes Défense Systèmes (démo) pèse « 3 besoins passés observés, dont 1 gagné », daté il y a 14 mois (`DEMO_DISCOVER_SOURCE_FACTS`, `demo-scripts.ts`, même calcul que le vrai chemin). Laura : « Qu’a-t-on déjà fait chez Cévennes Défense Systèmes ? » rend la synthèse (1 gagné, 1 terminé, 1 perdu, TJM observé) puis une ligne datée par besoin, prescripteur « à revalider » (`p-historical-needs-account`, `demo-chat-script.ts`, web). Tout fictif, sans probabilité ni source nommée.',
}

/**
 * #4755 / #4756 (lot 761, 31/10/2026) — LE TABLEAU « SIGNAUX ET BESOINS » D'UN COMPTE (`GET /accounts/:id/signal-lines`) :
 * SEEDÉ. Aucune table ni clé `raw_analysis` neuve : la route LIT des familles déjà semées. Société Générale porte les
 * deux périodes — Actuel : deux offres Java de la même équipe le même mois (UNE ligne dépliable), un appel d'offres,
 * une affaire CRM, les projets possibles ; Historique : un besoin passé GAGNÉ et un PERDU avec leur TJM
 * (`closedNeeds`), les affaires CRM closes, les signaux anciens — et des contacts dont le métier recoupe les lignes.
 * La base commune et la mémoire marché restent VIDES À DESSEIN, pour les raisons déjà écrites plus haut
 * (`DEMO_HISTORICAL_NEEDS_COVERAGE` : un fait de marché partagé ne se sème pas ; mémoire marché : GA-258).
 * Appelant : `demo-signal-lines-coverage.spec.ts`.
 */
export const DEMO_SIGNAL_LINES_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4755 (31/10/2026) — Société Générale (démo) : Actuel = offres Java de la même équipe fusionnées, appel d’offres, affaire CRM, projets possibles ; Historique = besoin passé gagné et perdu avec TJM, affaires closes, signaux anciens ; des contacts recoupent les lignes. Base commune et mémoire marché vides à dessein (faits de marché partagés). Vérifié par `demo-signal-lines-coverage.spec.ts`.',
}

/**
 * #4282.13 (19/10/2026) — LE RADAR PAR TECHNOLOGIE (Découvrir + Laura) :
 * SEEDÉ. Aucune table ni clé `raw_analysis` : le radar est CALCULÉ à la
 * demande (collecte publique + base commune) ; la salle rejoue un radar SAP
 * préparé (`demoTechnologyRadar`, `demo-technology-radar.ts`), validé par le
 * schéma strict du contrat. Appelant : `demo-technology-radar-coverage.spec.ts`.
 */
export const DEMO_TECHNOLOGY_RADAR_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4282.13 (19/10/2026) — « radar SAP » en salle rend les sept blocs : deux missions d’un cabinet à client masqué (la cible est le publieur, TJM seulement quand l’annonce le donne) et une d’Aubrac Aerostructures, un programme nommé chez Cévennes Défense Systèmes (appel d’offres ouvert), un titulaire de lot AMOA en rang 2, trois besoins historiques (gagné, perdu, terminé), deux prescripteurs (l’un daté, l’autre « à revalider »), une empreinte en profils observés — tout fictif, daté relativement à aujourd’hui, sans probabilité ni source nommée. Une autre technologie dit qu’elle n’est pas préparée en salle.',
}

/**
 * #2897 (#2091.31, 27/09/2026) — LA CARTE « PRIORISER MA SEMAINE » DE
 * `/welcome` : SEEDÉE, SANS AJOUTER AUCUN `priority_gate: 'pending'`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CHEMIN NON DESTRUCTIF
 * ─────────────────────────────────────────────────────────────────────────
 * `deriveWelcomeCards` (`apps/web/.../derive-welcome-cards.ts`) ne propose
 * `prioritizeWeek` que si `hasAccountsToAct` est vrai ET que le profil ESN
 * n'a pas répondu `yes` à « places-tu des CDI chez tes clients ? »
 * (`DEMO_ESN_PROFILE.recruits_for_clients`, `'no'` dans la salle — donc
 * `positionConsultant` ne masque jamais la carte visée ici).
 * `hasAccountsToAct` (`AccountsController`) lit `accountsAwaitingAction`, qui
 * accepte DEUX chemins — `priority_gate = 'pending'` OU (compte SUIVI et
 * SANS action récente). Poser un `pending` supplémentaire aurait changé
 * l'écran d'arrivée de la démo (le briefing peuplé, jamais une porte G1 non
 * franchie) — mais SNCF (et Groupe BPCE) portent déjà `priority_gate: 'pending'`,
 * un état ANTÉRIEUR à ce lot, jamais ajouté pour l'occasion : le premier
 * chemin suffit sans qu'aucune donnée n'ait bougé. `demo-welcome-prioritize-week-coverage.spec.ts`
 * REJOUE ce même prédicat SQL (`accounts.service.ts::accountsAwaitingAction`)
 * en pur TypeScript sur `DEMO_DOSSIERS`, pour que ce fichier rougisse si SNCF
 * change un jour de statut sans que quiconque n'ait relu cette carte.
 */
export const DEMO_WELCOME_PRIORITIZE_WEEK_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#2897 (#2091.31, 27/09/2026) — la carte « Prioriser ma semaine » de /welcome se propose dès que `hasAccountsToAct` est vrai (aucun geste de plus requis) : SNCF (démo) porte déjà `priority_gate: 'pending'`, `commercial_status: 'watching'`, `status: 'completed'` — un état ANTÉRIEUR à ce lot — et `DEMO_ESN_PROFILE.recruits_for_clients: 'no'` ne fait jamais gagner `positionConsultant` à sa place. Aucun `priority_gate: 'pending'` n'a été ajouté pour l'occasion : l'écran d'arrivée de la démo (le briefing peuplé) reste inchangé.",
}

/**
 * #2614.1 (20/09/2026) — LE MASQUAGE DES COMPTES EXCLUS DE DÉCOUVRIR : SEEDÉ.
 *
 * Même raison structurelle que `DEMO_DISCOVER_CONTRACT_MODEL_COVERAGE`
 * ci-dessus : `qualification` voyage sur la réponse de `/discover`
 * (`DiscoverCandidate.qualification`), aucune table ni clé `raw_analysis` à
 * lui, et la garde par table ne pose donc jamais la question. `qualification`
 * n'est PAS déclaré dans `discoverCandidateSchema` (`@bellum/contracts`) — le
 * champ n'y a jamais été ajouté — d'où l'appelant qui lit la réponse SCRIPTÉE
 * brute (`demoDiscoverResponse`) plutôt que de la faire passer par
 * `discoverResponseSchema.parse`, qui la retirerait silencieusement.
 */
export const DEMO_DISCOVER_QUALIFICATION_MASKING_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#2614.1 (20/09/2026) — Roggeman Structures — M. Roggeman (démo), dans la cible (aéronautique & spatial, même secteur qu'Aubrac Aerostructures), porte `qualification.verdict === 'excluded'` (`natural_person`). La liste principale de Découvrir le masque désormais d'office (`applyCandidateFilters`, `discover-presentation.ts`), et le compteur nommé de `ResultsToolbar` (« N exclues par le conseil de qualification ») le dit — jamais un masquage silencieux. Visible dans la vue PAR DÉFAUT de la salle, sans geste supplémentaire (`includeOutOfTarget` non requis) : c'est là que le retour a été fait. Vérifié par `demo-discover-qualification-masking-coverage.spec.ts`.",
}

/**
 * #2166.11 (épopée #2806, 25/09/2026) — LA RÉFÉRENCE COMPARABLE DE DÉCOUVRIR :
 * SEEDÉE.
 *
 * Même raison structurelle que `DEMO_DISCOVER_CONTRACT_MODEL_COVERAGE`
 * ci-dessus : `similarityHeadline` voyage sur la réponse de `/discover`
 * (`DiscoverCandidate.similarityHeadline`, `@bellum/contracts`), aucune table
 * ni clé `raw_analysis` à lui, et la garde par table ne pose donc jamais la
 * question. La salle répond une liste SCRIPTÉE (`demoDiscoverResponse`,
 * `demo-scripts.ts`) — le vrai chemin (`withSimilarityHeadline`,
 * `ia-proxy.controller.ts`) n'est JAMAIS appelé pour un espace de
 * démonstration, d'où cette entrée dédiée plutôt qu'une confiance dans le
 * résolveur réel.
 */
export const DEMO_DISCOVER_SIMILARITY_HEADLINE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#2166.11 (épopée #2806, 25/09/2026) — Marenval Financement (démo, re-semée le 01/10/2026 après le retrait des quatre comptes non cibles) porte le NAF EXACT de Société Générale (`64.19Z`, `societeGeneraleDossier` dans `demo-dataset.ts`) et `similarityHeadline: { kind: 'sector', referenceAccount: 'Société Générale' }` — la même précision que `resolveSimilarityHeadlines` (discover-portfolio.service.ts), jamais un texte de secteur libre. `SimilarityHeadlineNote` (apps/web) rend donc la note en démonstration, hors de la cible déclarée (`includeOutOfTarget: true`), comme Verdal l'est pour `DEMO_DISCOVER_CONTRACT_MODEL_COVERAGE`. Vérifié par `demo-discover-similarity-headline-coverage.spec.ts`.",
}

/**
 * #4067 (décision Louis 12/10/2026) — LES SOURCES QUI PÈSENT DANS LE CLASSEMENT
 * DE DÉCOUVRIR (historique des signaux, CRM, mémoire marché, référentiel de
 * comptes cibles, Drive, missions / vivier) : SEEDÉES.
 *
 * Même raison structurelle que `DEMO_DISCOVER_SIMILARITY_HEADLINE_COVERAGE` :
 * `sourceAxes` voyage sur la réponse de `/discover`, sans table ni clé
 * `raw_analysis` à lui. Les cartes scriptées portent des faits FICTIFS passés
 * par le MÊME calcul que le vrai chemin ; la carte du compte semé (SNCF) passe
 * par le VRAI `DiscoverSourcesService` sur la base de la salle.
 */
export const DEMO_DISCOVER_SOURCE_AXES_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4067 (12/10/2026) — `demoDiscoverResponse` (`demo-scripts.ts`, `DEMO_DISCOVER_SOURCE_FACTS`) sème des faits fictifs sur quatre cartes : Aubrac Aerostructures (recrutements anciens récurrents datés il y a 8 et 13 mois, deux documents de l'espace — vue par défaut), Cévennes Défense Systèmes (référentiel : cible prioritaire, trois besoins passés observés dont un gagné il y a 14 mois — #4294.9 —, recours externe observé), Groupe Aurélys (affaire gagnée, deux consultants du vivier passés chez lui), Marenval Financement (affaire perdue, une en sommeil ; #4067.11 — trois personnes en poste FICTIVES déjà connues de la base commune, un compte sans nom). Calcul : `computeDiscoverSourceAxes` (`@bellum/contracts`), le même que `IaProxyController.withSourceAxes`. La carte SNCF (compte semé) passe par le vrai `DiscoverSourcesService` (`withDemoOwnedCandidates`). Les autres cartes restent NON MESURÉES, jamais des zéros. Vérifié par `demo-discover-source-axes-coverage.spec.ts`.",
}

/**
 * « ET EN DÉMONSTRATION, "EXCLURE LES SOCIÉTÉS COTÉES" MONTRE-T-IL QUELQUE CHOSE ? »
 * SEEDÉ (#4361.2, Louis 20/10/2026).
 *
 * Pas de table ni de clé `raw_analysis` : le filtre agit sur la liste scriptée de `/discover/registry`
 * (`listingFilter` voyage sur la réponse), comme `DEMO_DISCOVER_CARD_FACTS_COVERAGE` juste en dessous.
 */
export const DEMO_DISCOVER_LISTING_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4361.2 (20/10/2026) — `demoDiscoverResponse` (`demo-scripts.ts`, `DEMO_LISTED_COMPANY_NAMES`) rejoue la forme du vrai chemin (`_apply_listing_filter`, apps/ia) : huit sociétés RÉELLES des briefs dont la cotation à Euronext Paris est publique (BNP Paribas, Société Générale, Crédit Agricole S.A., AXA, Airbus, Thales, Orange, Renault) sortent de la liste quand l'interrupteur « Exclure les sociétés cotées » ou la puce « Middle market » est posé ; toutes les autres RESTENT et sont comptées « cotation non établie » (jamais « non cotées »), et `listingFilter` porte les deux nombres. Natixis, CNP Assurances et EDF, retirées de la cote, n'y sont pas. Sans interrupteur, aucun compteur. Vérifié par `demo-discover-listing-coverage.spec.ts`.",
}

/**
 * #4746.7 — « ET EN DÉMONSTRATION, LE FILTRE « CLIENTS FINAUX » DIT-IL CE QU'IL RETIRE ? » — SEEDÉ.
 *
 * Pas de table ni de clé `raw_analysis` : le filtre agit sur la liste scriptée de `/discover/registry`
 * (`coverage.filteredByEntityType` voyage sur la réponse), comme `DEMO_DISCOVER_LISTING_COVERAGE`.
 */
export const DEMO_DISCOVER_ENTITY_TYPE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4746.7 (02/11/2026) — `demoDiscoverResponse` (`demo-scripts.ts`) rejoue la forme du vrai chemin (`discover_signals.py`, `coverage.filteredByEntityType`) : avec `entityType=client`, les lignes ESN (`isEsnPeer`), intermédiaires (`isIntermediary`) et partenaires déclarés (`isDeclaredPartner`) de la salle SORTENT de la liste — le filtre applique ce qu'il affirme — et le compteur dit combien, ce que `EntityTypeFilteredNotice` (apps/web) rend (« N entreprises retirées par « Clients finaux » »). Les lectures « ESN » et « tous » ne retirent rien (rang 2 voulu, #4285.3) ; zéro retiré ⇒ aucun compteur, jamais « 0 ». Vérifié par `demo-discover-entity-type-coverage.spec.ts`.",
}

/**
 * #4556 / #4432.4 — « ET EN DÉMONSTRATION, UN DOSSIER CADRÉ SUR UNE ZONE ? » — SEEDÉ.
 *
 * Pas de table neuve ni de clé `raw_analysis` : le cadrage vit dans `analysis_runs.scope_selection`
 * (`DEMO_VERIFICATION_RUNS`) et le rangement dans `contacts.location` / `excluded_at` / `exclusion_reason`.
 */
export const DEMO_OCCITANIE_DOSSIER_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4556 / #4432.4 (25/10/2026) — Airbus (siège à Blagnac, compte RÉEL de la salle) est cadré sur l'Occitanie : son run de vérification (`DEMO_VERIFICATION_RUNS`) porte `geo_perimeter: 'region'`, `geo_areas: ['Occitanie']`. Ses contacts rejouent les trois cas du vrai chemin (`scope_filter.py`) : dans la zone (lieu posé, en tête), lieu connu hors zone (écarté, motif `hors zone (Occitanie)`), lieu INCONNU (`location` null, jamais écarté). Les trois interlocuteurs ajoutés sont fictifs (`demo-occitanie-dossier.ts`), car un lieu de travail n'est jamais posé sur une personne réelle. #4556.4 (31/10/2026) — le chip de zone de l'onglet Contacts lit la zone du PROFIL : `DEMO_ESN_PROFILE.geo_zones` déclare aussi « Toulouse & Occitanie » (contact en zone d'abord), et « Hors zone » nomme la zone (`zone_label`). Garde : `demo-occitanie-dossier-coverage.spec.ts`.",
}

/**
 * #4556 — « ET EN DÉMONSTRATION, DÉCOUVRIR S'OUVRE-T-IL SUR UNE LISTE, SANS « EXPLORER » ? » — SEEDÉ.
 *
 * Pas de table ni de clé `raw_analysis` neuve : l'écran rejoue la première des trois recherches enregistrées déjà
 * semées (`saved_views`, `DEMO_DISCOVER_SAVED_VIEWS`) contre la liste SCRIPTÉE de `/discover/registry`
 * (`demoDiscoverResponse`), gratuite — « Explorer » déclenche une collecte payante qu'une recette ne peut pas appuyer.
 */
export const DEMO_DISCOVER_ARRIVAL_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4556 (26/10/2026) — en démonstration, `/discover` nu PROPOSE la première recherche enregistrée de l'espace (`Discover.tsx`, `useIsDemo`) — #4628 : elle ne part plus seule, #4490 « aucun appel sans geste » tient — et le clic (sur elle, ou sur « Reprendre ta dernière recherche ») MONTRE la liste : la salle répond la liste scriptée, aucune collecte payante. Chacune des cinq recherches semées (`DEMO_DISCOVER_SAVED_VIEWS`, dont « vue · Lille » et « Albi · 250 à 999 », #4556.2, ≥ 8 cartes) ramène au moins une carte, dont une levée de fonds avec le lien de son annonce (#4285.1) ; le dossier cadré sur l'Occitanie est celui d'Airbus (`DEMO_OCCITANIE_DOSSIER_COVERAGE`). Hors démo, rien ne change. Vérifié par `demo-discover-arrival-coverage.spec.ts`.",
}

/**
 * « ET EN DÉMONSTRATION, LA PAGE DÉCOUVRIR V22 EST-ELLE REMPLIE ? » — SEEDÉ (#4493 / #4495, Louis 24/10/2026).
 *
 * Pas de table ni de clé `raw_analysis` neuve : les pistes lisent le profil d'ESN DÉJÀ semé, les compteurs,
 * la répartition et les cartes lisent la liste scriptée de `/discover/registry` (comme
 * `DEMO_DISCOVER_LISTING_COVERAGE`).
 */
export const DEMO_DISCOVER_OVERVIEW_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4493 / #4495 (24/10/2026) — Les trois pistes illustrées lisent `DEMO_ESN_PROFILE` (`geo_zones` « Paris & Île-de-France » → piste « Un territoire » IDF ; `priority_expertise` « Cloud & Infrastructure » → piste « Une expertise ») et le compte client marqué meilleure référence (`DEMO_DELIVERY_CLIENT.account.is_best_reference`, piste « Un type de client »). `demoDiscoverResponse` (`demo-scripts.ts`) porte de quoi remplir les quatre compteurs et la répartition : des comptes de plusieurs secteurs et tranches d'effectif, des besoins PASSÉS observés (`sourceAxes` référentiel, `DEMO_DISCOVER_SOURCE_FACTS`) et des signaux datés avec leurs compétences (étiquettes d'expertise et sujet des cartes) ; les besoins de prestation connus viennent du vrai `DiscoverPortfolioService` sur les comptes semés. Un compteur que la salle ne mesure pas ne s'affiche pas (jamais « 0 »). Vérifié par `demo-discover-overview-coverage.spec.ts`.",
}

/**
 * « ET EN DÉMONSTRATION, DÉCOUVRIR « TOULOUSE » MONTRE-T-IL LE PALIER DE ZONE ? »
 * SEEDÉ (#4429.4, Louis 21/10/2026).
 *
 * Pas de table ni de clé `raw_analysis` : l'élargissement agit sur la liste scriptée de
 * `/discover/registry` (`zoneWidening` voyage sur la réponse), comme `DEMO_DISCOVER_LISTING_COVERAGE`.
 */
export const DEMO_DISCOVER_ZONE_WIDENING_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4429.4 (21/10/2026, échelle révisée le 25/10, c143 le 27/10 matin, puis c144 le 27/10 au soir, qui renverse c143 : l'automatique s'arrête à la région) — `demoDiscoverResponse` (`demo-scripts.ts`) rejoue la forme du vrai chemin (`_widen_by_zone_tiers`, apps/ia), un palier à la fois (ville → 100 km → département → région, puis STOP, jamais de lecture « France » ni de question) : « Toulouse » ne rend que deux comptes de la salle (Altiver Industries, Aubrac Aerostructures), sous le seuil de dix ; la salle ne publie aucune position, le barreau 100 km est franchi à vide et NOMMÉ (`zoneWidening.steps`) — au rayon par défaut de 100 km (#4641) il est déjà couvert et ne se rejoue pas —, le département (Haute-Garonne) ajoute Blagnac, la région (Occitanie) est tentée et n'ajoute rien, la liste RESTE COURTE : « peu de comptes » est une réponse. 2710N — le bandeau annonce le DÉPARTEMENT (le barreau que porte une ligne rendue, jamais la région sans ligne) et `autoCapReached: true` fait dire que la recherche s'arrête à la région. Chaque compte ajouté est étiqueté de son palier. « Revenir à Toulouse seule » (`zoneStrict`), « Revenir à 100 km » (`zoneCeiling`, rien à ce palier), un département ou aucune ville : aucun élargissement. Vérifié par `demo-discover-zone-widening.spec.ts`.",
}

/**
 * « ET EN DÉMONSTRATION, DÉCOUVRIR DIT-IL CE QU'IL A ÉCARTÉ ? »
 * SEEDÉ (#4419, 26/10/2026).
 *
 * Pas de table ni de clé `raw_analysis` : `query.funnel` voyage sur la réponse scriptée de `/discover/registry`,
 * comme `DEMO_DISCOVER_ZONE_WIDENING_COVERAGE`.
 */
export const DEMO_DISCOVER_FUNNEL_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4419 (26/10/2026) — `demoDiscoverResponse` (`demo-scripts.ts`) rejoue la forme du vrai chemin (`query.funnel`, `discover_funnel.py`, apps/ia) : « Toulouse » retient les comptes de la ville et écarte « hors ville » le reste de la salle (qui reste rendu à part par l'élargissement de zone) ; la ligne « N trouvés · M retenus — K hors ville » est celle de l'écran. Sans ville, ou en « Toulouse seule », aucun critère n'a rien écarté : la ligne est absente (jamais « 0 hors ville »). Vérifié par `demo-discover-funnel.spec.ts`.",
}

/**
 * « ET EN DÉMONSTRATION, UNE VILLE MAL ORTHOGRAPHIÉE EST-ELLE CORRIGÉE ET DITE ? »
 * SEEDÉ (#4429.6, lot ZD, 21/10/2026).
 *
 * Pas de table ni de clé `raw_analysis` : la correction agit sur la liste scriptée de `/discover/registry`
 * (`query.placeResolution` voyage sur la réponse), comme `DEMO_DISCOVER_ZONE_WIDENING_COVERAGE`.
 */
export const DEMO_DISCOVER_PLACE_RESOLUTION_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4429.6 (21/10/2026) — `demoDiscoverResponse` (`demo-scripts.ts`) rejoue la forme du vrai chemin (`place_resolution.py`, apps/ia) : « Tolouse » est corrigée par proximité sur les villes de la salle (« Toulouse »), la correction est NOMMÉE dans `query.placeResolution` et la recherche part sur la ville corrigée ; un nom exact ou trop éloigné (« Toulan ») passe tel quel, sans note. La salle n'a pas de référentiel de communes : l'homonyme et l'absence de commune n'y sont pas rejoués. Vérifié par `demo-discover-place-resolution.spec.ts`.",
}

/**
 * « ET EN DÉMONSTRATION, DÉCOUVRIR DIT-IL L'EFFORT DE LA RECHERCHE ? »
 * SEEDÉ (#4305.2, lot FIX-RECETTE-E1, 25/10/2026).
 *
 * Pas de table ni de clé `raw_analysis` : `query.searchEffort` voyage sur la réponse scriptée de
 * `/discover/registry`, comme `DEMO_DISCOVER_PLACE_RESOLUTION_COVERAGE`.
 */
export const DEMO_DISCOVER_SEARCH_EFFORT_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4305.2 (25/10/2026) — `demoDiscoverResolved` (`demo-scripts.ts`) rejoue la forme du vrai chemin (`_search_effort`, apps/ia) : `query.searchEffort` = { sourcesQueried, stoppedBy } sur toute liste non vide. Jamais un crédit ni un fournisseur ; une liste vide n'en porte pas.",
}

/**
 * « ET EN DÉMONSTRATION, LA CARTE DE DÉCOUVRIR HIÉRARCHISE-T-ELLE SES SIGNAUX ? »
 * SEEDÉ (#4068, lot DECOUVRIR-CARTE, 13/10/2026).
 *
 * Pas de table ni de clé `raw_analysis` : la carte lit `signals`, `knownNeeds`
 * et `sourceAxes` d'un candidat, triés par le contrat (`selectCardFacts`).
 */
export const DEMO_DISCOVER_CARD_FACTS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4068 (13/10/2026) — `demoDiscoverResponse` (`demo-scripts.ts`) : la carte Aubrac Aerostructures (vue par défaut) porte un recrutement (fort), un salon, une technologie et un résultat financier repris par DEUX sources (contexte, une seule ligne qui garde le lien), et un acte de capital (hors carte, jamais affiché). Les dates scriptées sont re-datées à aujourd'hui (`demoRebasedDay`) : la règle des 180 j ne vide jamais la salle. Le besoin connu de la carte SNCF passe par le vrai chemin (`DEMO_DISCOVER_KNOWN_NEEDS_COVERAGE`). Vérifié par `demo-discover-card-facts-coverage.spec.ts`.",
}

/**
 * « ET LES « BESOINS CONNUS » (#3819.1) SUR UNE CARTE DE DÉCOUVRIR MONTRENT
 * QUOI EN DÉMONSTRATION ? » SEEDÉS SUR LE COMPTE CLIENT (ex-« vide à dessein » du 07/10).
 *
 * `DiscoverCandidate.knownNeedsCount` (#3819.1) n'existe QUE pour un candidat
 * déjà possédé (`accountId` non nul) — `DiscoverPortfolioService.resolveKnownNeeds`
 * compte les besoins ouverts de ce compte, en une requête groupée sur le VRAI
 * chemin. Mais la salle ne passe JAMAIS par ce chemin : `demoDiscoverResponse`
 * (`demo-scripts.ts`) répond une liste intégralement SCRIPTÉE, et chaque
 * candidat y est construit avec `accountId: null` — AUCUNE carte de Découvrir
 * n'y correspond à un compte possédé, qu'il porte ou non des besoins ouverts.
 *
 * ⚠️ RENVERSÉ le 11/10/2026 (lot RBB2, #3819) : la carte du compte client semé
 * (SNCF, `DEMO_DISCOVER_OWNED_CANDIDATE_NAMES`) passe désormais par le VRAI
 * portefeuille puis le VRAI décompte (`IaProxyController.withDemoOwnedCandidates`
 * → `resolve` + `resolveKnownNeeds`) : son `accountId` est celui du compte semé,
 * son « N besoins connus » compte ses `project_needs` ouverts réellement semés ET les besoins que son analyse semée porte (douleurs, chantiers IT, programmes — #3819.1, recette prod 11/10 : sans eux, la carte d'un compte seulement analysé restait muette en production).
 * Aucun nombre n'est tapé à la main ; les autres cartes restent sans compte.
 */
export const DEMO_DISCOVER_KNOWN_NEEDS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#3819.1 (lot RBB2, 11/10/2026) — la carte SNCF (compte client semé, `DEMO_DISCOVER_OWNED_CANDIDATE_NAMES`) est rapprochée du vrai portefeuille de la salle par `IaProxyController.withDemoOwnedCandidates` (`DiscoverPortfolioService.resolve` + `resolveKnownNeeds`) : `accountId` et « N besoins connus » viennent des `project_needs` ouverts semés (`seedOpenNeeds`), jamais d'un décompte écrit à la main. Les autres cartes scriptées restent sans compte. Vérifié par `demo-discover-known-needs-coverage.spec.ts` et `discover-demo-known-needs.spec.ts`. #4068 (13/10/2026) — les besoins EUX-MÊMES (`knownNeeds`, les trois plus récents) passent par le MÊME vrai chemin (`resolveKnownNeedFacts` dans `withKnownNeeds`) : la carte SNCF montre au moins un besoin daté dans ses signaux forts.",
}

/**
 * #3204.2/.6/.7 (épopée #3238, 28/09/2026) — LES CHAMPS D'EXTRACTION ET
 * L'AGRÉGATION D'UN SIGNAL `hiring` DE DÉCOUVRIR : SEEDÉS.
 *
 * Même raison structurelle que `DEMO_DISCOVER_CONTRACT_MODEL_COVERAGE`
 * ci-dessus : `technologies`/`jobFamily`/`team`/`reportsTo`/`stillOpen`/
 * `similarOfferCount`/`siteCity`/`replacementSignal`/`aggregatedSignals` voyagent sur la réponse de
 * `/discover` (`DiscoverSignal`, `DiscoverCandidate.aggregatedSignals`),
 * aucune table ni clé `raw_analysis` à eux. Ces champs ne sont PAS déclarés
 * dans `discoverSignalSchema` (`@bellum/contracts`, même choix que
 * `contractType`/`remoteWorkPolicy`/`seniority`/`hiringSignalClass` — voir le
 * « tranché sans Louis » du commentaire de clôture #3204) : la garde lit donc
 * la réponse SCRIPTÉE brute (`demoDiscoverResponse`), jamais
 * `discoverResponseSchema.parse`, qui les retirerait silencieusement.
 */
export const DEMO_DISCOVER_SIGNAL_EXTRACTION_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#3238 (recette démo 05/10) — la preuve du `siteCity` ne repose plus sur un compte fictif : Naval Group (démo, compte RÉEL des briefs, dans la cible, vue par défaut) porte deux offres `hiring` publiées par La Montagne (Indret) et Lorient, distinctes du siège (Paris) : « Sites : La Montagne, Lorient » sur la carte et « Site : … » sur chaque ligne de « Besoins et signaux ». #3204.2/.6/.7 (épopée #3238, 28-30/09/2026) — Verdal Distribution (démo), hors cible comme pour `DEMO_DISCOVER_CONTRACT_MODEL_COVERAGE` (`includeOutOfTarget: true`), porte deux offres `hiring` de la famille `data_ia` (technologies, équipe, statut ouvert, prestataire tiers mentionné, et — reste du 30/09 — `siteCity` DIFFÉRENTE pour chacune, Lyon puis Marseille, même nom de groupe résolu) et l'AGRÉGATION qui les cite (`aggregatedSignals`, `team_growth_signal`) ; Aubrac Aerostructures (démo), dans la cible, porte un rattachement hiérarchique explicite, une offre `stillOpen: false` (retirée) qui porte aussi — reste du 30/09 — `replacementSignal: true` (texte explicite de remplacement) agrégée en `replacement_signal`. Recette Z1 04/10 : Verdal est désormais montré SANS geste dans la vue par défaut (`DEMO_RECRUITING_TRACK_HEADLINER`, demo-scripts.ts) — sa « Sites : Lyon, Marseille » se voit sans cocher « hors cible » ; les autres comptes hors secteur restent écartés. Vérifié par `demo-discover-signal-extraction-coverage.spec.ts`. Lot X64 (02/10/2026, #3551) : « Chercher hors de ma cible » part AUSSI en mode Signaux (« Comptes qui recrutent », `applyOutOfTarget`, `discoverSignalsRequestSchema.includeOutOfTarget`) — avant, le bouton s'affichait mais le réglage ne partait qu'en Registre, donc Verdal restait introuvable après le geste.",
}

/**
 * #4180 (EX-10, 14/10/2026) — « CE QUI A CHANGÉ DEPUIS LA DERNIÈRE VÉRIFICATION » SUR UN COMPTE SUIVI : SEEDÉ.
 * Aucune table ni clé `raw_analysis` à lui : `AccountChangesService` relit des données déjà semées (faits du compte).
 */
export const DEMO_ACCOUNT_CHANGES_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4180 (14/10/2026) — Société Générale (compte vitrine, seul dossier réanalysé : `previous_analysis_at` le 18/06) montre des changements DATÉS du fait, postérieurs à cette vérification, lus par les MÊMES fonctions que la production (`currentSignalFacts` → `composeAccountChanges`) ; ses contacts sont antidatés (`seedAccountChangesBaseline`) pour qu'aucun n'apparaisse « nouveau » du seul fait du semis. VIDE À DESSEIN : les nouveaux responsables et les changements d'entité — le jeu ne sème aucune personne fictive « arrivée depuis la vérification » (un nom inventé serait une donnée fictive affichée comme un fait) ; la section reste vide, jamais « 0 ». Vérifié par `demo-account-changes-coverage.spec.ts`.",
}

/**
 * #4182 (EX-12, 14/10/2026) — « QUI DEMANDE CE PROFIL ? » SUR UNE OFFRE DE DÉCOUVRIR : SEEDÉ.
 * Même raison structurelle que `DEMO_DISCOVER_SIGNAL_EXTRACTION_COVERAGE` : `requester` voyage sur la réponse
 * scriptée de `/discover`, aucune table ni clé `raw_analysis` à lui.
 */
export const DEMO_DISCOVER_OFFER_REQUESTER_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4182 (14/10/2026) — Aubrac Aerostructures (démo, dans la cible, vue par défaut) porte DEUX offres `hiring` qui montrent les deux états : « Demandeur probable : directeur technique · Annonce publiée par les RH » (le rattachement est écrit dans l'offre, site de Blagnac) et « Équipe demandeuse à identifier » (l'offre ne dit pas le service : la méthode se déplie, aucun nom de personne). Vérifié par `demo-discover-offer-requester-coverage.spec.ts`.",
}

/**
 * #4294.7 (25/10/2026) — « DÉJÀ TRAVAILLÉES » DANS LES FILTRES DE DÉCOUVRIR : SEEDÉ. Aucune table ni clé `raw_analysis` :
 * `workedBefore` voyage sur la réponse scriptée de `/discover`, comme `portfolioState`.
 */
export const DEMO_DISCOVER_WORKED_ACCOUNTS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4294.7 (25/10/2026) — Cévennes Défense Systèmes (démo, secteur défense, vue par défaut) est un compte DÉJÀ TRAVAILLÉ (`portfolioState: customer`, `workedBefore: true`, comme le vrai chemin le pose pour une relation ou une mission passée) : le filtre « Déjà travaillées » de la rubrique Relation le retient et se combine avec le secteur (un ET) ; Aubrac Aerostructures, du même secteur mais jamais travaillé, sort. VIDE À DESSEIN : aucun autre compte n'est marqué — le jeu ne fabrique pas d'historique de mission à un candidat neuf. Vérifié par `demo-discover-worked-accounts-coverage.spec.ts`.",
}

/**
 * COMPETENCE-TROUVE (20/10/2026) — LA RECHERCHE PAR COMPÉTENCE (Découvrir) : SEEDÉE. Aucune table ni
 * clé `raw_analysis` : `skillEvidence` et `skillIntermediaries` voyagent sur la réponse de `/discover`.
 */
export const DEMO_DISCOVER_SKILL_SEARCH_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "COMPETENCE-TROUVE (20/10/2026) — en salle, une compétence posée (mot-clé ou technologie, ex. « SAP ») remplace la liste scriptée par `demoSkillSearchResponse` (`demo-discover-skill.ts`, appelée par `IaProxyController.discoverRegistry`) : trois comptes fictifs qui recrutent dessus, rangés par nombre d'offres, chacun avec « N offres <compétence> » et la plus récente (intitulé, date, lien `example.org`), #4664 — plus le DÉTAIL de toutes ses offres (`skillEvidence.offers` : intitulé, date, lien `example.org` chacune, la plus récente d’abord), puis à part un cabinet de recrutement et une ESN fictifs. La compétence TAPÉE est reprise (jamais « SAP » en dur), aucune source nommée. #4419.1 — `query.skillSearch` porte ses compteurs par étape, cohérents avec la liste (un employeur en homonymie : le bandeau « non identifiés » se voit en salle). Vérifié par `demo-discover-skill-coverage.spec.ts`. 27/10/2026 (lot DÉCOUVRIR-MOTEUR, #4515 / #4419) — le lieu filtre sur le LIEU DE TRAVAIL de l'offre, jamais le siège : Rhénalp Équipements (siège Bartenheim) porte une offre à Mulhouse (`latestOffer.city`), et la carte le dit (« Sites : Mulhouse »). VIDE À DESSEIN : les deux autres comptes recrutent à leur siège, aucune ville d'offre n'est inventée ; le rayon appliqué (`skillSearch.radiusKm`) n'est pas semé, la recherche de salle n'ayant pas de ville. #4674 (28/10/2026) — SEEDÉ : un employeur fictif prouvé par une offre mais en homonymie (Ateliers Delorme, Colmar) sort dans `skillPendingEmployers` avec son identité « en cours », sa ville et sa preuve datée (lien `example.org`), SANS SIREN ni action ; `skillSearch.unresolvedRendered` le compte. #4712 (29/10/2026) — son motif est FINAL (`identityReason: 'homonym_on_site'` : « plusieurs entités du groupe recrutent ici »), plus un « en cours » ; l'entité résolue par l'ÉTABLISSEMENT sur place est Rhénalp Équipements (siège Bartenheim, offre à Mulhouse), rattachée avec son SIREN. VIDE À DESSEIN : le motif « marque ou programme » n'est pas semé, il se couvre par le test d'écran. VIDE À DESSEIN : aucun SIREN n'est inventé pour lui, et les états `pending` / `unmatched` ne sont pas semés (un seul cas suffit à la salle ; leurs libellés sont couverts par le test d'écran). #4115.5 (03/11/2026, recette R8) — SEEDÉ : chaque compte rendu (les trois exacts, et les deux voisins de `withDemoWidening`) porte ses SIGNAUX DATÉS (`demoSkillSignals`) : un recrutement sur la compétence tapée (`tier: strong`) et deux faits de contexte (`tier: context`), à dates FIGÉES (jours ISO écrits en dur, jamais relatifs à aujourd'hui) — l'onglet « Besoins et signaux » n'est plus vide sur la recherche d'exemple. Le test qui sait dire NON est dans `demo-discover-skill-coverage.spec.ts` (#4115.5).",
}

/**
 * #4433 (21/10/2026) — L'ÉLARGISSEMENT PAR PALIERS (Découvrir) : SEEDÉ. Aucune table ni clé `raw_analysis` :
 * `widenedBy` et `query.widening` voyagent sur la réponse de `/discover`.
 */
export const DEMO_CRITERIA_WIDENING_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4433 (21/10/2026) — en salle, une compétence posée qui rend moins de 10 comptes exacts (« React ») s'élargit au premier voisin du référentiel partagé par `withDemoWidening` (`demo-criteria-widening.ts`, appelée par `IaProxyController.discoverRegistry` après `demoSkillSearchResponse`) : deux comptes fictifs « proche : JavaScript » APRÈS les exacts, avec leur offre (lien `example.org`), et `query.widening` qui fait dire l'élargissement au-dessus de la liste ; « Revenir au strict » (`strictCriteria`) le retire. Vérifié par `demo-criteria-widening-coverage.spec.ts`.",
}

/**
 * #4433.9 (Louis 21/10/2026) — LES PALIERS DES AUTRES SURFACES. Aucune table ni clé `raw_analysis` ajoutée :
 * Mes cibles / la veille se calculent côté écran sur les signaux déjà seedés ; l'analyse lit le bloc
 * `coverage` du graphe d'organisation.
 */
export const DEMO_SURFACE_WIDENING_COVERAGE: Readonly<{
  watchlist: { state: 'seede'; reason: string }
  contactsAnalysis: { state: 'vide_a_dessein'; reason: string }
}> = {
  watchlist: {
    state: 'seede',
    reason:
      "#4433.9 — en salle, Mes cibles et la veille n'ont que quelques comptes fictifs à signaux (`recent_signals` des dossiers SG, SNCF…) : bien sous le seuil des critères, la liste « À traiter » s'ouvre d'elle-même aux comptes déjà traités et le bandeau commun le dit (`buildWatchlistView`, `WatchlistBoard`). Rien à seeder de plus. Vérifié par `demo-surface-widening-coverage.spec.ts`.",
  },
  contactsAnalysis: {
    state: 'vide_a_dessein',
    reason:
      "#4433.9 — le bandeau « Élargi aux postes voisins » de l'analyse lit `coverage.widened` du graphe, qu'un dossier SEEDÉ ne porte jamais : il n'a jamais fait tourner une vraie recherche de contacts, et en écrire une fabriquerait une collecte qui n'a pas eu lieu (même raison que `sourceStatus` et `fallback`, #2543.5f, `withDemoOrgCoverage`). Le bandeau est prouvé par `OrgCoverageBanner.test.tsx`. Vérifié par `demo-surface-widening-coverage.spec.ts`.",
  },
}

/**
 * #4430 / #4437 (Louis 21/10/2026) — OFFRES FRAÎCHES ET FAITS VOISINS (Découvrir) : SEEDÉS. Aucune table
 * ni clé `raw_analysis` : `skillFreshFill`, `jobsAsOf`, `widenedFrom` et `widening` voyagent sur la réponse.
 */
export const DEMO_DISCOVER_FRESH_WIDENING_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4430 / #4437 (21/10/2026) — en salle, la recherche par compétence (`demoSkillSearchResponse`) montre un compte « Trouvé par une collecte d'offres fraîche » et un autre aux « Offres au <date> » (cache commun) ; le mode Signaux avec un recrutement qualifié (mot-clé tapé) ajoute, sous les comptes exacts, UN compte voisin fictif (`withDemoSignalNeighbour`, `demo-discover-widening.ts`, appelée par `IaProxyController.discoverSignals`) : un appel d'offres du domaine daté, étiqueté « Voisin de ta demande ». Aucune source nommée. Vérifié par `demo-discover-fresh-widening-coverage.spec.ts`.",
}

/**
 * #4793.1 / #4791.2 (Louis 31/10/2026) — LA BASE COMMUNE COMME SOURCE DE CANDIDATS (Découvrir) : SEEDÉE. Aucune
 * table ni clé `raw_analysis` : `observedNeed` voyage sur la réponse.
 */
export const DEMO_DISCOVER_COMMON_BASE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4793.1 / #4791.2 (31/10/2026) — en salle, la recherche Découvrir (`demoDiscoverResponse`, appelée par `IaProxyController.discoverRegistry`) reçoit, sous ses comptes, TROIS comptes fictifs de la base commune (`withDemoCommonBase`, `demo-discover-common-base.ts`) qui portent chacun un besoin HISTORIQUE daté (« Besoin Java, <mois année> », de 8 à 31 mois). Aucune source nommée. Vérifié par `demo-discover-common-base-coverage.spec.ts`.',
}

/**
 * #4182.6 (Louis 15/10/2026) — « CONTACT PROCHE DE CE SUJET » SUR UNE OFFRE D'EMPLOI : SEEDÉ.
 * Même raison structurelle : le rapprochement offre ↔ contact est calculé à la lecture
 * (`proposeContactsForSignal`), aucune table ni clé `raw_analysis` à lui.
 */
export const DEMO_SIGNAL_CLOSE_CONTACT_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4182.6 (15/10/2026) — SNCF (compte vitrine) porte l'offre « Data engineer — plateforme data voyageurs (H/F) » et le contact SIMULÉ Younes Berrada (« Ingénieur plateforme data »), jamais nommé dans l'offre : leurs mots de métier se recoupent (« plateforme », « data »), la carte l'écrit « Contact proche de ce sujet (métier ou lieu) » — jamais « manager » du poste. Vérifié par `demo-signal-close-contact-coverage.spec.ts`.",
}

/**
 * #4755 (Louis 28/10/2026) — L'ONGLET « HISTORIQUE » DE /signals : SEEDÉ. Aucune table ni clé `raw_analysis`
 * ajoutée : l'onglet range, côté écran, les besoins PASSÉS des signaux déjà servis (`recent_signals`) — une ligne
 * par compte.
 */
export const DEMO_SIGNALS_HISTORY_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4755 — en salle, l'onglet « Historique » de /signals se voit rempli : SNCF (compte vitrine) porte quatre offres PASSÉES (`recent_signals`, `freshness: 'archive'`, datées de décembre 2025 à juillet 2026, compétences Java / Spring / Cloud lues dans l'offre) et forme UNE ligne dépliable. Les autres comptes n'ont aucun besoin passé de métier : ils ne font AUCUNE ligne (« on n'affiche pas ce qu'on n'a pas »). Vérifié par `demo-signals-history-coverage.spec.ts`.",
}

/**
 * #4734 — LE SIGNAL D'ÉCOSYSTÈME : VIDE À DESSEIN. Aucune table ni clé `raw_analysis` ajoutée : la ligne voyage dans
 * `recent_signals` (type `ecosystem`), et elle n'y entre que si un annuaire déclaré porte le SIREN du compte.
 */
export const DEMO_ECOSYSTEM_SIGNAL_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#4734 — en salle, aucun compte ne porte de ligne d'écosystème, et c'est voulu : l'annuaire n'est lu que si l'opérateur en déclare un (`FRENCH_TECH_DIRECTORY_URLS`, vide par défaut) et que le SIREN du compte y figure ; en démonstration aucun fournisseur n'est interrogé (le lien de démo part à des inconnus). Les dossiers de la salle portent le nom de groupes réels : leur semer une appartenance à un programme affirmerait un fait faux sur une entreprise réelle. Un essai sur Orange est refusé par sa propre garde (`demo-orange-dossier-seed.spec.ts` : aucun lien `example.org` dans ses signaux). À reprendre avec un compte fictif DÉDIÉ, jamais en déplaçant cette entrée pour une CI. Le rendu du type est prouvé par `discover-signal-ecosystem.test.ts` (contrat) et `signalTypes.ecosystem` FR/EN (web).",
}

/**
 * #4735.6 — LA LEVÉE DE FONDS : SEEDÉE. Aucune table ni clé `raw_analysis` ajoutée : la ligne voyage dans
 * `recent_signals` (type `levee_fonds`), comme le fait la collecte réelle quand la source de levées est branchée.
 */
export const DEMO_FUNDING_ROUNDS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4735 — en salle, SNCF (compte vitrine) porte UNE levée de fonds dans ses signaux (`recent_signals`, type `levee_fonds`, ids hors série) : une jeune pousse FICTIVE « Rail Data Labs (exemple) », datée du 15/09/2026 (date complète, jamais complétée), au montant tel que publié (12 M EUR, devise d'origine, jamais convertie), avec son lien de preuve. La société est fictive à dessein : un tour de table affirmé sur une entreprise réelle serait un fait faux, et le groupe lui-même ne lève pas. Aucun fournisseur n'est interrogé en démonstration (la source est inerte sans clé) et aucun texte ne la nomme. Prouvé par `demo-funding-rounds-coverage.spec.ts` (nombre de comptes porteurs lu, date, lien, devise, vocabulaire).",
}

/**
 * #4756 (Louis 28/10/2026) — LA RECHERCHE ET LES FILTRES CROISÉS DE L'ONGLET « HISTORIQUE » : SEEDÉS. Aucune table ni
 * clé `raw_analysis` ajoutée : les filtres se calculent à l'écran sur les besoins passés déjà servis, et le lieu de
 * l'offre (`recent_signals[].location`) voyage désormais sur le flux `GET /accounts/signals`.
 */
export const DEMO_SIGNALS_HISTORY_FILTERS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4756 — en salle, « du Java, à Lille » rend un résultat : Société Générale (premier compte du jeu hors SNCF, dont le tableau `job_offers` n'est pas touché) porte cinq offres PASSÉES (`freshness: 'archive'`, ids s20 à s24) dont trois offres Java à Lille réparties sur trois tranches de période, une offre data à Paris et une offre SAP à Lyon de plus de 24 mois. Vérifié par `demo-signals-history-filters-coverage.spec.ts`.",
}

/**
 * #4068.8 (Louis 12/10/2026) — LES FAITS DATÉS ET TYPÉS DE DÉCOUVRIR : SEEDÉS.
 * Même raison structurelle que `DEMO_DISCOVER_SIGNAL_EXTRACTION_COVERAGE` : les faits voyagent sur la réponse
 * scriptée de `/discover`, aucune table ni clé `raw_analysis` à eux.
 */
export const DEMO_DISCOVER_DATED_FACTS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4068.8 (12/10/2026) — la liste « date · TYPE · fait · lien » de /discover se voit pleine en démo : les trois types (Recrutement = `hiring`, Besoin = `tender`, Signal = `legal`/`award`/`tech`), des faits ANCIENS (> 90 j avant le 12/10 : le programme de transformation de Verdal, l'appel d'offres santé, l'attribution d'un contrat cadre…) qui restent datés, et des faits AVEC lien (Verdal — fait ancien, « Voir la source » ; le technicien support et la consultation MCO de Bourges, « Voir l'annonce ») comme SANS lien (la majorité, qui n'affichent aucun lien). Les URL sont en `example.org` (domaine réservé, jamais un site réel). Vérifié par `demo-discover-dated-facts-coverage.spec.ts`. #4284.1 / #4284.26 (recette 21/10) — « hors de ton métier » SEEDÉ : Maison Delcourt Proximité (démo, NAF 47.11B) porte une seule offre « Gérant de magasin H/F », hors des métiers du profil démo, et la marque `outOfTrade` — rangée plus bas, jamais cachée (vérifié par `demo-discover-hiring-scope-coverage.spec.ts`) ; la même marque par OFFRE (fiche compte › Opportunités › Autres recrutements, veille, /mes-cibles) naît du profil démo à la lecture, sans table ni clé `raw_analysis`. #4403.1 — /signals : SNCF porte une offre « Agent de circulation ferroviaire H/F » hors des métiers du profil démo ; la bibliothèque la marque « hors de ton métier » et la range après celles du métier (vérifié par `SignalsLibrary.outOfTrade.test.tsx`). #4292.10 — « Aucun décideur identifié sur ce compte » est VIDE À DESSEIN en démo : la ligne naît du classement d'un compte réel sans décideur ni sponsor ; les comptes de démo portent des décideurs simulés, l'inventer serait une donnée fictive de plus.",
}

/**
 * #3238 (recette prod 02/10, Y18) — LA SÉNIORITÉ D'UNE OFFRE DE DÉCOUVRIR ET SON CROISEMENT AUX NIVEAUX QUE LA
 * SOCIÉTÉ PLACE : SEEDÉS. Même raison structurelle que `DEMO_DISCOVER_DELIVERY_FIT_COVERAGE` : `seniority`
 * voyage sur la réponse scriptée de `/discover`, aucune table ni clé `raw_analysis` à elle.
 */
export const DEMO_DISCOVER_SENIORITY_FIT_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#3238 (recette prod 02/10) — « démo /discover : 0× (niveau que tu places) / (… ne places pas), aucune séniorité affichée » : les niveaux vendus du profil démo étaient semés (`DEMO_SOLD_SENIORITY_LEVELS` : confirmé, senior) mais aucun signal ne portait de séniorité. Aubrac Aerostructures (démo) porte une offre « senior » (« niveau que tu places ») et Cévennes Défense Systèmes (démo) une offre « junior » (« niveau que tu ne places pas »), toutes deux dans la cible donc visibles dans la vue par défaut. Garde : `demo-discover-seniority-fit-coverage.spec.ts`.',
}

/**
 * #3983.4 (#3705.3, 11/10/2026) — SIÈGE / IMPLANTATION D'UNE ZONE DE DÉCOUVRIR : SEEDÉ. Même raison structurelle
 * que `DEMO_DISCOVER_SENIORITY_FIT_COVERAGE` : `geography` voyage sur la réponse scriptée de `/discover`, aucune
 * table ni clé `raw_analysis` à elle.
 */
export const DEMO_DISCOVER_SITE_GEOGRAPHY_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#3983 (#3705.3, 11/10/2026) — « siège ≠ implantation » : la salle de démonstration rend, dès qu'un département est demandé, le bloc `geography` du vrai chemin. Naval Group (démo, siège à Paris) tient 44 par Indret (La Montagne) et 56 par Lorient : demander le 44 le montre avec « Siège à Paris (75) · 1 établissement dans la zone » ; « Siège dans la zone » (`siteBasis: 'headquarters'`) le retire ; demander le 75 le montre sans autre établissement. #3983.8 — une zone RÉGION (codes INSEE) est honorée comme un département : région 52 montre Naval Group par La Montagne, région 53 par Lorient, région 11 par son siège ; la commune reste un ajout nommé (le texte libre), jamais un filtre qui retirerait des candidats. Implantations fictives : ni SIRET ni effectif local (la source ne publie pas l'effectif d'un site). Garde : `demo-discover-site-geography-coverage.spec.ts`.",
}

/**
 * #3237 (#3203.4/.5, 02/10/2026) — LE DELIVERY FIT D'UN SIGNAL DE DÉCOUVRIR :
 * SEEDÉ. Même raison structurelle que `DEMO_DISCOVER_SIGNAL_EXTRACTION_COVERAGE`
 * (réponse scriptée, hors contrat — la garde lit `demoDiscoverResponse`).
 */
export const DEMO_DISCOVER_DELIVERY_FIT_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#3237 (#3203.4/.5, 02/10/2026) — recette prod 01/10 : « aucun axe delivery visible dans les cartes /discover ». Trois signaux de la salle portent maintenant `deliveryFit` ET les treize `deliveryFitAxes` (jamais un axe omis, `unknown` nommé) : Aubrac Aerostructures (démo, dans la cible) `incompatible` (présence sur site obligatoire + habilitation défense), Pharmatek Santé (démo, signal `tender`, #3203.8) `potentially_compatible` (données de santé et exigence de sécurité à vérifier), Verdal Distribution (démo, hors cible) `compatible` (nearshore accepté, langue de travail anglais). Le niveau composé suit `compose_delivery_fit_axes` (un incompatible l'emporte, un unknown n'est jamais promu). Vérifié par `demo-discover-delivery-fit-coverage.spec.ts`.",
}

/**
 * #3205.1 (épopée #3239, 28/09/2026) — LE PRESTATAIRE TIERS MENTIONNÉ DANS
 * UNE OFFRE D'EMPLOI DE DÉCOUVRIR : SEEDÉ.
 *
 * Même raison structurelle, champ distinct : `thirdPartyProviderMention`
 * voyage sur le MÊME signal `hiring` que `DEMO_DISCOVER_SIGNAL_EXTRACTION_COVERAGE`
 * ci-dessus, entrée séparée parce que la donnée vient d'une source de
 * détection DIFFÉRENTE (`provider_mention.py`, texte de l'offre) — la
 * confondre avec l'extraction masquerait qu'une source neuve a été ajoutée.
 */
export const DEMO_DISCOVER_THIRD_PARTY_PROVIDER_MENTION_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#3205.1 (épopée #3239, 28/09/2026) — l'offre « 14 offres ouvertes pour développeurs et data engineers » de Verdal Distribution (démo) porte `thirdPartyProviderMention: 'sopra steria'` (marqueur « en partenariat avec »). Vérifié par `demo-discover-signal-extraction-coverage.spec.ts`.",
}

/**
 * #2679 (21/09/2026) — LES PRÉCISIONS CLIQUABLES DE LAURA : SEEDÉES, PAR LE
 * VRAI MOTEUR DE DÉMO — aucune table neuve à classer.
 *
 * Les réponses possibles d'une précision posée en texte voyagent dans le
 * CONTEXTE d'un tour (`context.reply_options`), pas dans une table : rien ne
 * s'écrit, et `chat_messages` reste vide à dessein en salle (raison écrite plus
 * bas — « la démonstration consiste à poser une question à Laura »). La capacité
 * apparaît donc par le même mécanisme que `account_ranking` et la timeline : une
 * amorce scriptée la sert (`demo-chat-script.ts`, `p-priorities`), et c'est le
 * VRAI composant de la conversation qui rend les boutons.
 *
 * ⚠️ Le piège propre à cette capacité : en salle, le moteur est le script, donc
 * un libellé d'option qui ne correspond à aucune amorce enverrait le prospect
 * sur la réponse « hors script » — un bouton qui ne mène nulle part, découvert
 * en réunion. La classification est donc PROUVÉE, pas affirmée :
 * `apps/web/src/features/chat/api/demo-turn.test.ts` rejoue CHAQUE option par le
 * vrai moteur et refuse le repli hors script ; un second test tient l'autre
 * bord — une amorce sans précision ne porte aucune option.
 *
 * #2630.2 (21/09/2026) — CE QUI EST DÉJÀ TROUVÉ PENDANT UNE ANALYSE : VIDE À
 * DESSEIN, et la raison n'a pas été écrite pour faire passer un test.
 *
 * Dans un espace de démonstration, AUCUNE analyse ne tourne : l'API rejoue un
 * dossier d'exemple déjà persisté et répond `launched: false` (`analysis.
 * service.ts`, branche `demo_replay`), ce qui interdit par construction tout
 * abonnement Socket.IO — donc aucun `phase:complete`, donc aucun partiel. Le
 * visiteur voit quand même la carte de progression : elle est jouée par un
 * script côté client (`playDemoAnalysis`, `apps/web/src/features/demo/
 * demo-run.ts`), et ce script simule LE TEMPS, PAS LE CONTENU — c'est écrit
 * dans son docblock depuis sa création.
 *
 * Y scripter « 4 contacts trouvés » inventerait du CONTENU sur un dossier que
 * le visiteur ouvre trois secondes plus tard : c'est la règle « JAMAIS de
 * données fictives », pas un trou de couverture. Et l'absence ne laisse aucun
 * blanc à l'écran : le bloc « Déjà trouvé » n'a pas d'état vide — sans
 * trouvaille, il ne rend rien du tout (`AnalysisPartials`).
 *
 * ⚠️ La classification est PROUVÉE, pas affirmée :
 * `apps/web/src/features/demo/demo-run.test.ts` joue le déroulé scripté en
 * entier et vérifie qu'aucune trouvaille n'apparaît. Le jour où l'on scriptera
 * de vraies trouvailles tirées du jeu de démo, ce test tombera et cette entrée
 * devra passer à « seedée » — jamais l'inverse.
 */
export const DEMO_ANALYSIS_PARTIALS_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2630.2 (21/09/2026) — en espace démo AUCUNE analyse ne tourne : `analysis.service.ts` rejoue un dossier d'exemple et répond `launched: false`, ce qui interdit tout abonnement Socket.IO, donc tout `phase:complete`, donc tout partiel. La carte de progression est jouée par un script client (`playDemoAnalysis`) qui simule LE TEMPS, PAS LE CONTENU — y écrire « 4 contacts trouvés » inventerait du contenu sur un dossier que le visiteur ouvre trois secondes plus tard (« JAMAIS de données fictives »). L'absence ne laisse aucun blanc : le bloc « Déjà trouvé » n'a pas d'état vide, sans trouvaille il ne rend rien. PROUVÉ par `apps/web/src/features/demo/demo-run.test.ts`, qui joue le déroulé entier et vérifie que `partials` reste vide.",
}

/**
 * #2630.1 (21/09/2026) — LA PASSE RAPIDE SUR VINGT COMPTES : SEEDÉE.
 *
 * Même raison structurelle que les deux entrées ci-dessus : la passe rapide
 * n'a ni table ni clé `raw_analysis` à elle. Elle ne COLLECTE rien — elle relit
 * la réponse de `/discover` (score et son dénominateur réel, `signalsSearched`,
 * `people`) et en tire un verdict. La garde par table ne poserait donc jamais
 * la question « et en démo ? ».
 *
 * L'appelant `demo-discover-quick-pass-coverage.spec.ts` ne se contente pas de
 * relire cette phrase : il fait TOURNER `buildDiscoverQuickPassEntry` sur la
 * réponse SCRIPTÉE réelle, et vérifie qu'un verdict en sort ET qu'un axe non
 * évaluable y est nommé. Une classification affirme ; seule une garde qui lit
 * le corpus prouve.
 */
export const DEMO_DISCOVER_QUICK_PASS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#2630.1 (21/09/2026) — la liste scriptée de Découvrir porte déjà TOUT ce que la passe rapide lit : `score`/`scoreMax` (l'axe décisif, donc un verdict sort), `signalsSearched` semé (jamais cherché — zéro appel réseau en démo) et `people` présent sur certaines lignes, ABSENT sur d'autres. Les deux moitiés de la règle sont donc visibles dans la salle sans aucun geste : un compte dont les axes se pèsent rend Go ou Prudence, et un compte dont les personnes n'ont pas été collectées voit l'axe « Contact nommé » NOMMÉ comme non évaluable — jamais chiffré à zéro (GA-18/GA-19). Aucun pourcentage n'est affichable : le contrat partagé le refuse. Vérifié par `demo-discover-quick-pass-coverage.spec.ts`, qui exécute le verdict sur la réponse scriptée.",
}

/**
 * #2165.55 (19/09/2026) — « et en démonstration, le bloc complémentarité du
 * panneau Partenaires de Découvrir montre quoi ? »
 *
 * `computePartnerComplementarity` croise le profil PROPRE de l'ESN (secteurs
 * déclarés, `idealAccountProfile.sectorsPriority`) et le candidat RÉEL du
 * registre (`sector`/`nafCode`) — comme `accounts`/`partners` dans
 * `DEMO_DISCOVER_RESULT_TYPES` ci-dessus, aucun jeu de données propre : la
 * salle interroge le MÊME registre public que tout espace. `DEMO_ESN_PROFILE.
 * target_sectors` (`demo-dataset.ts`) porte quatre secteurs non vides — dès
 * qu'un candidat rendu a un code NAF résolu (quasi systématique au registre
 * français), l'axe « secteurs » est ÉVALUÉ (100 % ou 0 %, jamais `null`),
 * donc `isComplementarityUnknown` rend `false` : la carte montre le bloc,
 * jamais « Non su ».
 */
export const DEMO_DISCOVER_PARTNER_COMPLEMENTARITY_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#2165.55 (19/09/2026) — computePartnerComplementarity croise le profil propre de l'ESN (idealAccountProfile.sectorsPriority, alimenté par DEMO_ESN_PROFILE.target_sectors — quatre secteurs non vides) et le candidat RÉEL du registre (sector/nafCode) : aucun jeu de données propre, la salle interroge le même registre public que tout espace, comme `accounts`/`partners` ci-dessus. Dès qu'un candidat rendu porte un code NAF résolu — quasi systématique au registre français — l'axe secteurs est évalué (100 % ou 0 %, jamais null), donc isComplementarityUnknown rend false : la carte montre le bloc, jamais « Non su ».",
}

/**
 * #4758 / #4761 (épopée #4762, 28/10/2026) — « et en démonstration, les deux blocs de Découvrir montrent quoi ? »
 *
 * Les blocs « Signaux récents » puis « Comptes à historique » n'ont ni table ni type de résultat à eux : ils
 * rangent la réponse SCRIPTÉE (`demoDiscoverResponse`, `demo-scripts.ts`) par l'âge de ses signaux datés. Deux cas
 * sont donc semés dans cette réponse, pas dans une table : « Vauclair Logistique (démo) », qui remonte sur son seul
 * historique (trois offres Java de 2025-2026, aucune dans les 90 jours), et une recherche par ville dont les comptes
 * ont tous un signal récent, où le bloc historique est VIDE et disparaît (ni « 0 », ni ligne de remplissage).
 * Lu par `demo-discover-history-coverage.spec.ts`. Ce n'est PAS un type de résultat : il ne se classe pas dans
 * `DEMO_DISCOVER_RESULT_TYPES` (la garde refuse toute entrée qui n'est pas un type du contrat).
 */
export const DEMO_DISCOVER_HISTORY_BLOCKS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4758 / #4761 (28/10/2026) — les blocs « Signaux récents » et « Comptes à historique » rangent la réponse scriptée de Découvrir (`demoDiscoverResponse`) par l'âge des signaux datés : « Vauclair Logistique (démo) » remonte sur son seul historique (trois offres Java entre 2025 et 2026, aucune dans les 90 jours) et sa carte nomme la raison ; une recherche par ville aux seuls signaux récents laisse le bloc historique vide, donc absent. Aucune table, aucun crédit : l'historique déjà stocké se lit gratuitement. Vérifié par `demo-discover-history-coverage.spec.ts`.",
}

/**
 * #2165.56 / #2151.34 (19/09/2026) — « et en démonstration, le statut de
 * rang 2 du panneau Partenaires de Découvrir montre quoi ? »
 *
 * `rank2StatusFor` rend l'un de trois états. DEUX sont démontrables : le
 * mécanisme est exercé par `account_partners`, DÉJÀ SEMÉ (voir la 4e ligne du
 * docblock au-dessus de `partners:` dans `demo-dataset.ts`, « mc2i
 * (exemple) », `rank: 'rank2'`) — cette ligne rend `'observed'`, toute autre
 * ESN du registre sans correspondance rend `'unknown'`. Le TROISIÈME état,
 * `'declared'`, dépend d'une source structurellement non seedable — voir
 * {@link DEMO_DISCOVER_PARTNER_RANK2_DECLARED_COVERAGE} juste en dessous.
 */
export const DEMO_DISCOVER_PARTNER_RANK2_STATUS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#2165.56 / #2151.34 (19/09/2026) — rank2StatusFor rend l'un de trois états, dont deux sont démontrables via account_partners, DÉJÀ SEMÉ (demo-dataset.ts, « mc2i », rank: 'rank2') : cette ligne rend 'observed', toute autre ESN du registre sans correspondance rend 'unknown'. Le troisième état, 'declared', dépend d'une source structurellement non seedable — voir DEMO_DISCOVER_PARTNER_RANK2_DECLARED_COVERAGE. " +
    "⚠️ #2613 (20/09/2026, décision de Louis « on affiche pas ce qu'on a pas ») — CE QUE LA SALLE MONTRE A CHANGÉ, le semis non : 'unknown' ne produit plus AUCUNE ligne à l'écran (PartnerResultRow ne rend le statut que pour 'declared' et 'observed'). La ligne semée reste donc le SEUL endroit où un statut de rang 2 se voit en démonstration — et c'est voulu : une liste où toutes les lignes annonçaient « Rang 2 : non su » n'apprenait rien. Le panneau Partenaires ne se vide pas pour autant (nom, activité, signaux observés, complémentarité restent).",
}

/**
 * #2165.56 (19/09/2026) — LE TROISIÈME ÉTAT DE `rank2StatusFor`, « DÉCLARÉ »,
 * NE SE SÈME JAMAIS. CE N'EST PAS UN OUBLI.
 *
 * `'declared'` lit `esn_directory.open_to_subcontracting` (`GET
 * /partners/profile-matches`, `ProfileMatchEsn.openToSubcontracting`) —
 * exactement comme `esn_directory` lui-même (référentiel ESN PARTAGÉ entre
 * tous les espaces, D62, cité par `agent_docs/chantiers-livres.md`),
 * `EsnDirectoryService.suggest()` ne sème RIEN pour la démonstration.
 *
 * Et cette colonne va plus loin que le partage simple : la migration
 * `1790900000008-EsnSubcontractingDeclarations` (D589-D593) ne la PROMEUT
 * hors de `'inconnu'` qu'à partir d'un AGRÉGAT COMMUNAUTAIRE — trois espaces
 * DISTINCTS déclarant la même chose, sans divergence (`subcontractingAggregate`,
 * `@bellum/contracts`, garde anti-collusion GA-43). Une salle de démonstration
 * est un espace SEUL : aucune écriture, réelle ou fictive, ne peut jamais y
 * faire franchir ce seuil — l'écrire directement en base court-circuiterait
 * l'agrégat que GA-43 protège, et poserait une déclaration jamais vérifiée
 * par personne.
 *
 * En salle, la ligne reste donc HONNÊTE : `'declared'` n'apparaît jamais,
 * `'observed'`/`'unknown'` le font (voir
 * {@link DEMO_DISCOVER_PARTNER_RANK2_STATUS_COVERAGE} au-dessus) — c'est
 * l'état RÉEL de tout espace neuf, démo comprise, pas un trou du semis.
 */
export const DEMO_DISCOVER_PARTNER_RANK2_DECLARED_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2165.56 (19/09/2026) — 'declared' lit esn_directory.open_to_subcontracting (GET /partners/profile-matches), référentiel ESN PARTAGÉ (D62) qui ne se sème jamais pour la démonstration, comme esn_directory lui-même (EsnDirectoryService.suggest()). GA-43 : la migration 1790900000008-EsnSubcontractingDeclarations ne promeut cette colonne hors de 'inconnu' qu'à partir d'un agrégat COMMUNAUTAIRE de trois espaces DISTINCTS sans divergence (D589-D593) — une salle de démonstration est un espace seul, aucune écriture ne peut jamais franchir ce seuil sans court-circuiter la garde anti-collusion. En salle, 'declared' n'apparaît donc jamais ; 'observed' le fait — c'est l'état réel de tout espace neuf, pas un trou du semis. ⚠️ #2613 (20/09/2026) : 'unknown' reste l'état RÉEL de toute autre ligne, mais il ne s'AFFICHE plus — on n'écrit pas ce qu'on n'a pas. Ne pas afficher n'est pas ne pas savoir : rank2StatusFor continue de le calculer, et les filtres continuent de le lire.",
}

/**
 * « ET LE BANDEAU DE COLLECTE ANTÉRIEURE (#2543.7) SUR ORGANIGRAMME/PLAN
 * MONTRE QUOI EN DÉMONSTRATION ? » VIDE À DESSEIN, ET CE N'EST PAS UN OUBLI
 * (18/09/2026, RESTREINT À entities/strategy LE 19/09/2026, PUIS À strategy
 * SEUL LE 24/09/2026 — VOIR `DEMO_SIGNALS_STALE_COLLECTION_COVERAGE` ET
 * `DEMO_ENTITIES_STALE_COLLECTION_COVERAGE` CI-DESSOUS).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE #2543.7 A LIVRÉ, ET CE QU'IL N'A PAS LIVRÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Le mécanisme est complet et testé : `entities_collected_at` /
 * `signals_collected_at` / `strategy_collected_at` (migration `1795712345678`),
 * stampées par leurs écrivains respectifs, ciblées par
 * `SegmentCatchupService.listConcernedAccountsForSegment`, et affichées par
 * `SegmentStaleCollectionNotice` (apps/web) — même fonction pure
 * `isSegmentCollectionStale` que le ciblage serveur (GA-26).
 *
 * Ce lot N'A PAS ajouté d'entrée à `SEGMENT_CAPABILITY_EPOCH`
 * (packages/contracts/src/schemas/segment-catchup.ts) pour ces trois segments
 * — et c'est délibéré, écrit dans le docblock de ce fichier : « un futur
 * correctif ajoute SA propre entrée, jamais avant — dater une capacité qui
 * n'a pas changé inventerait un rattrapage sur du neuf ». Contrairement à
 * `contacts` (#2543, un vrai bug Apollo corrigé), aucune amélioration RÉELLE
 * de la collecte n'a été apportée à entities/signals/strategy dans ce lot :
 * seule l'INSTRUMENTATION (les colonnes) a été posée.
 *
 * ⚠️ #2291.2 (lot R, 19/09/2026) — LE FIL À RETORDRE A MORDU UNE PREMIÈRE
 * FOIS. Le modèle de contrat OBSERVÉ a daté `SEGMENT_CAPABILITY_EPOCH.signals`
 * : `signals` sort donc de CETTE entrée (« vide à dessein », structurellement
 * inerte) et rejoint `DEMO_SIGNALS_STALE_COLLECTION_COVERAGE` (« seedée », le
 * bandeau s'affiche réellement) — exactement le chemin que ce docblock
 * annonçait.
 *
 * ⚠️ #2755 (24/09/2026) — LE FIL À RETORDRE A MORDU UNE SECONDE FOIS. Le repli
 * snake_case IA (`51f284697`) a daté `SEGMENT_CAPABILITY_EPOCH.entities` :
 * `entities` sort à son tour de CETTE entrée et rejoint
 * `DEMO_ENTITIES_STALE_COLLECTION_COVERAGE` (« seedée », par construction).
 * `strategy` SEUL reste ici, toujours sans capacité datée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CONSÉQUENCE POUR LA DÉMO — ET POUR LA PRODUCTION
 * ─────────────────────────────────────────────────────────────────────────────
 * `SegmentStaleCollectionNotice` s'arrête AVANT tout rendu quand
 * `SEGMENT_CAPABILITY_EPOCH[dimension]` est absent (voir son docblock).
 * Semer une date de collecte antérieure sur un compte de démonstration —
 * même le 13/07/2026, même NULL — ne ferait donc apparaître AUCUN bandeau,
 * ni en démo ni chez un vrai client : ce serait documenter une donnée
 * inerte, pas une capacité démontrable. C'est vrai du seul segment `strategy`
 * aujourd'hui, démo comprise — pas un défaut du semis de démonstration.
 *
 * Le troisième test ci-dessous (`demo-segment-stale-collection-coverage.spec.ts`)
 * est un fil à retordre : il ÉCHOUE dès qu'un futur correctif date une vraie
 * capacité sur `strategy`, pour forcer CE moment-là à re-classer cette entrée
 * en `seede` — exactement le chemin que #2543 a suivi pour contacts, #2291.2
 * pour signals, et #2755 pour entities.
 */
export const DEMO_SEGMENT_STALE_COLLECTION_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2543.7 (18/09/2026, restreint à entities/strategy le 19/09/2026 par #2291.2, puis à strategy seul le 24/09/2026 par #2755) — SEGMENT_CAPABILITY_EPOCH ne date aucune capacité pour strategy (contacts #2543, signals #2291.2 et entities #2755 en ont une) : le bandeau ne peut structurellement s'afficher pour AUCUN compte, démo ou production, tant qu'un futur correctif n'y ajoute pas sa propre entrée. Semer une date de collecte antérieure sur cette colonne sans capacité datée en face ne produirait aucun bandeau visible — une donnée inerte, pas une capacité démontrable. Mécanisme livré et testé (colonne, stamp, ciblage, écran) ; sa VISIBILITÉ attend un futur correctif, comme #2543 l'a fait pour contacts, #2291.2 pour signals et #2755 pour entities.",
}

/**
 * ⚠️ 13/10/2026 (Louis) — RENVERSÉ POUR LA DÉMO : le bandeau « collecte antérieure » ne s'y affiche plus (voir
 * `DEMO_NO_STALE_COLLECTION_BANNER_COVERAGE`). Le texte ci-dessous décrit l'état d'AVANT et reste le fait honnête de la
 * production.
 *
 * « ET LE BANDEAU DE COLLECTE ANTÉRIEURE SUR LES SIGNAUX (#2291.2, LOT R,
 * 19/09/2026) MONTRE QUOI EN DÉMONSTRATION ? » SEEDÉE — LE FIL À RETORDRE DE
 * `DEMO_SEGMENT_STALE_COLLECTION_COVERAGE` A MORDU.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DIFFÉRENCE AVEC `DEMO_DOSSIER_READ_STALE_COLLECTION_COVERAGE`
 * ─────────────────────────────────────────────────────────────────────────────
 * `dossier_read` s'est allumé « par construction », sans un seul octet de
 * fixtures écrit — signals aussi, sur DEUX des trois dossiers (Société
 * Générale, Groupe BPCE : `signals_collected_at`
 * jamais stampé par le semis, `isSegmentCollectionStale(null, epoch)` rend
 * `true`, le bandeau `SegmentStaleCollectionNotice dimension="signals"`
 * s'affiche sur leur onglet Signaux, EXACTEMENT le fait honnête qu'un vrai
 * dossier jamais rejoué depuis #2291.2 afficherait).
 *
 * MAIS ce lot sème AUSSI, à dessein, le témoin OPPOSÉ : SNCF porte
 * `signals_collected_at` FRAÎCHE (`2026-09-19T12:00:00.000Z`, APRÈS l'epoch)
 * pour que sa propre carte « Modèle de contrat observé »
 * (CompanyPublicDataSection.tsx, onglet Synthèse) montre l'état OBSERVÉ —
 * 2 CDI + 1 intérim, zéro régie (BOAMP/DECP volontairement absents du jeu,
 * voir `DEMO_ANALYSIS_KEYS_INTENTIONALLY_ABSENT`) — plutôt que « collecte
 * antérieure ». Les deux témoins coexistent dans la MÊME salle : un compte
 * sur trois DIT que sa collecte est fraîche, deux DISENT qu'elle est antérieure
 * — c'est un vrai portefeuille, pas un jeu où tout est toujours à jour.
 */
export const DEMO_SIGNALS_STALE_COLLECTION_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#2291.2 (lot R, 19/09/2026) — SEGMENT_CAPABILITY_EPOCH.signals EST datée (2026-09-19T11:20:34.000Z, commit 8054769a3), donc SegmentStaleCollectionNotice dimension=\"signals\" s'affiche réellement sur l'onglet Signaux, démo comprise. Deux des trois dossiers ne portent aucun signals_collected_at (jamais stampé par le semis) : isSegmentCollectionStale(null, epoch) rend true, le bandeau s'affiche — même fait honnête qu'un dossier client jamais rejoué depuis #2291.2. SNCF SEUL porte une date FRAÎCHE (re-semée sur SNCF le 10/10/2026, après la capacité « lien source » #3922.3 : ses signaux portent leur lien — presse, annonce BODACC, registre officiel, page carrières — sauf un témoin « Sans lien vérifiable ») (postérieure à l'epoch), à dessein : sa fiche montre l'état OBSERVÉ du modèle de contrat (2 CDI + 1 intérim) au lieu du rattrapage — les deux témoins (stale et observé) coexistent dans la même salle.",
}

/**
 * « ET LE BANDEAU DE COLLECTE ANTÉRIEURE SUR L'ORGANIGRAMME (#2755,
 * 24/09/2026) MONTRE QUOI EN DÉMONSTRATION ? » SEEDÉE — PAR CONSTRUCTION,
 * COMME `DEMO_DOSSIER_READ_STALE_COLLECTION_COVERAGE`, PAS PAR UN SEMIS
 * DÉDIÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DIFFÉRENCE AVEC `DEMO_SIGNALS_STALE_COLLECTION_COVERAGE` CI-DESSUS
 * ─────────────────────────────────────────────────────────────────────────────
 * `signals` sème un témoin OPPOSÉ (SNCF, `signals_collected_at` fraîche)
 * parce que sa fiche porte une carte dédiée à l'état OBSERVÉ
 * (CompanyPublicDataSection). `entities` n'a pas cet équivalent : aucun
 * dossier de démonstration n'a besoin de prétendre avoir été rejoué APRÈS
 * `51f284697` pour rester honnête — `entities_collected_at` est une colonne
 * qui n'existe même pas dans `DemoDossier['account']` (comme
 * `dossier_read_collected_at`), donc NULL pour les six dossiers, sans qu'un
 * seul octet de fixtures soit écrit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI « SEEDÉE » SANS AVOIR ÉCRIT UNE SEULE VALEUR DE DÉMONSTRATION
 * ─────────────────────────────────────────────────────────────────────────────
 * `isSegmentCollectionStale(null, epoch)` rend `true` : le bandeau
 * `SegmentStaleCollectionNotice dimension="entities"` s'affiche sur l'onglet
 * Organigramme des six dossiers, démo comprise — exactement le même fait
 * honnête qu'un compte client analysé avant le repli snake_case IA
 * afficherait (le cas RÉEL qui a ouvert #2755 : Louis, beta 23/09, « il doit
 * toujours y avoir un organigramme »). Le bandeau et un organigramme déjà
 * peuplé (`raw_analysis.org`) ne se contredisent pas : il ne dit jamais que
 * le graphe est absent, il dit que cette collecte n'a jamais été redatée
 * comme rejouée depuis #2755.
 */
export const DEMO_ENTITIES_STALE_COLLECTION_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#2755 (24/09/2026) — SEGMENT_CAPABILITY_EPOCH.entities EST datée (2026-09-23T12:09:58.000Z, commit 51f284697), donc SegmentStaleCollectionNotice dimension=\"entities\" s'affiche réellement sur l'onglet Organigramme, démo comprise. `entities_collected_at` n'est stampée par AUCUN semis (colonne absente de DemoDossier['account'], comme dossier_read_collected_at) : NULL sur les six dossiers, isSegmentCollectionStale(null, epoch) rend true — même fait honnête qu'un compte client jamais rejoué depuis le repli snake_case IA afficherait. Aucune valeur de démonstration à écrire : la capacité se démontre PAR CONSTRUCTION, pas par un semis dédié — le bandeau ne contredit jamais un organigramme déjà peuplé par les fixtures, il parle de la DATE de rejeu, jamais de la présence du graphe.",
}

/**
 * « ET « AJOUTER UN SIGNAL DEPUIS LINKEDIN » (#2634.1, 24/09/2026) MONTRE QUOI
 * EN DÉMONSTRATION ? » VIDE À DESSEIN — L'ACTION SE DÉMONTRE EN DIRECT,
 * JAMAIS PAR UN SIGNAL PRÉ-SEMÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI AUCUN DOSSIER NE PORTE DE SIGNAL DÉCLARÉ
 * ─────────────────────────────────────────────────────────────────────────
 * `POST /accounts/:id/signals/declare` (`AccountsService.declareSignals`)
 * écrit `accounts.declared_signals` — une colonne ABSENTE de
 * `DemoDossier['account']` (même famille que `entities_collected_at`
 * ci-dessus) : aucun semis ne l'écrit, NULL sur les six dossiers. Ce n'est pas
 * un oubli : fabriquer un signal « posté par un commercial » dans les fixtures
 * affirmerait un GESTE humain qui n'a jamais eu lieu — exactement ce que
 * `c79_collecte_large_mais_propre` proscrit (LinkedIn n'entre QUE par ce
 * qu'un commercial apporte lui-même). La bonne preuve n'est donc pas un
 * octet de fixtures, c'est que le geste FONCTIONNE en démonstration : aucun
 * crédit, aucun appel de modèle, aucun appel à LinkedIn — la même écriture
 * qu'en production (`useDeclareSignals`, patron de `useDeclareOrgPeople`,
 * qui n'a lui non plus jamais eu besoin d'un semis dédié). Un commercial en
 * salle de démo peut coller une URL et/ou un texte sur n'importe lequel des
 * six dossiers et voir son signal apparaître dans la Veille, exactement comme
 * en production.
 */
export const DEMO_DECLARED_LINKEDIN_SIGNAL_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2634.1 (24/09/2026) — `accounts.declared_signals` n'est écrite par AUCUN semis (colonne absente de DemoDossier['account']) : semer un signal déclaré fabriquerait un geste commercial qui n'a jamais eu lieu, ce que la doctrine c79 (LinkedIn admis UNIQUEMENT par ce que l'utilisateur apporte lui-même) interdit d'affirmer en fixtures comme en production. L'action se démontre EN DIRECT : `DeclareLinkedInSignalDialog` (onglet Signaux, et depuis #3924 la ligne Découvrir d'un compte déjà au portefeuille, ainsi que la question d'un fil Laura de compte qui porte un post LinkedIn collé) n'est ni gatée par crédit ni par modèle — un commercial en démo colle une URL et/ou un texte et le signal apparaît réellement, greffé par `withDeclaredSignals` à la lecture suivante.",
}

/**
 * « L'ORDRE SUIT LA PERTINENCE, ET L'ACHETEUR EST NOMMÉ » — lot 758 (CONTACTS 4/6), arbitrage
 * Louis 31/10/2026. SEEDÉE PAR CONSTRUCTION, sans semis dédié : le score servi, le chemin
 * recommandé et la liste d'appels lisent l'offre DÉCLARÉE du profil (`offers`, que
 * `esnAnswersToProfileData` tire de `DEMO_ESN_PROFILE.expertise_areas`). La pastille
 * « Joignable » se calcule sur les coordonnées déjà semées (adresses `.example` des
 * interlocuteurs simulés) ; aucun canal, aucune pastille. Garde :
 * `demo-contact-relevance-coverage.spec.ts`.
 */
export const DEMO_CONTACT_RELEVANCE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "Lot 758 — le profil démo déclare « Data & Intelligence Artificielle » parmi ses offres : sur le dossier Société Générale, « Responsable de la plateforme de données » passe devant « Architecte du système d’information groupe » (axe « rôle face à votre offre », nommé des deux côtés), et « Responsable achats informatiques » est l'acheteur nommé sous un décideur. Aucune donnée nouvelle n'est semée : la pertinence se calcule à la lecture sur ce que la salle porte déjà, et la pastille de joignabilité ne s'affiche que là où une coordonnée fictive (`.example`) existe — jamais sur une personne réelle sans coordonnée.",
}

/**
 * « LE GROUPE QUI COMPTE » — #2295.4bis, décision Louis 18/09/2026 (question
 * 24 des questions en attente, née de la livraison de #2295.4).
 *
 * `classifyGroup()` (`contact-ranking.ts`) refuse le groupe « première porte »
 * à tout contact dont l'email n'est pas VÉRIFIÉ (#2295.4) — juste, mais en
 * démonstration `email_verified` vaut TOUJOURS `false` (adresses `.example`,
 * jamais vérifiables). Le groupe le plus important des six restait donc
 * structurellement VIDE devant un prospect.
 *
 * `demo_seed_first_door` (`packages/contracts/src/schemas/contact.ts`,
 * migration `1795712710555`) sépare « adresse VÉRIFIÉE » de « contact
 * UTILISABLE EN DÉMONSTRATION » — un fait de SEMIS qui n'affirme rien sur une
 * adresse réelle. Posé UNIQUEMENT sur Directeur technique — entité numérique voyageurs
 * (`DEMO_DELIVERY_CLIENT`, le seul interlocuteur FICTIF du jeu à porter une
 * adresse ET un rôle qui ne relève pas déjà d'un autre groupe prioritaire) —
 * jamais sur les dirigeants RÉELS des six autres dossiers, qui n'ont par
 * construction aucune coordonnée : le leur poser laisserait croire qu'une
 * vraie personne est joignable sans preuve, exactement ce que « jamais de
 * donnée fictive » interdit. Garde de frontière dédiée :
 * `apps/api/src/architecture/demo-seed-first-door-is-demo-only.spec.ts`.
 */
export const DEMO_FIRST_DOOR_GROUP_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "décision Louis 04/10 : aucune déclaration inventée sur une personne réelle. #2295.4bis — le groupe « première porte » (`demo_seed_first_door`) exige de poser sur une PERSONNE nommée le verdict « c'est par elle qu'on entre ». Le client d'exemple qui le portait a quitté la salle ; le client de livraison (SNCF) ne crée aucun interlocuteur, et poser ce verdict sur une personne réelle de son dossier inventerait un fait sur elle. Le calcul reste tenu par les tests de `contact-ranking` ; `demo-first-door-group-coverage.spec.ts` vérifie qu'aucun interlocuteur n'est créé.",
}

/**
 * « ET LE BANDEAU DE COLLECTE ANTÉRIEURE SUR LA SYNTHÈSE (#2118.51, LE
 * CINQUIÈME SEGMENT) MONTRE QUOI EN DÉMONSTRATION ? » SEEDÉE — PAR
 * CONSTRUCTION, PAS PAR UN SEMIS DÉDIÉ (18/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DIFFÉRENCE AVEC `DEMO_SEGMENT_STALE_COLLECTION_COVERAGE` CI-DESSUS
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrairement à entities/signals/strategy, `SEGMENT_CAPABILITY_EPOCH
 * .dossier_read` EST daté (`2026-09-14T17:46:41.000Z`, #2118.51) : le
 * mécanisme n'est pas dormant, il s'affiche réellement — `TabOverview` rend
 * `<SegmentStaleCollectionNotice dimension="dossier_read" …>` juste avant
 * `BellumReadCard`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI « SEEDÉE » SANS AVOIR ÉCRIT UNE SEULE VALEUR DE DÉMONSTRATION
 * ─────────────────────────────────────────────────────────────────────────────
 * `dossier_read_collected_at` est une colonne NEUVE (migration
 * `1795713579246`) : `NULL` sur tout compte qui n'est jamais repassé par
 * `AnalysisPersistenceService.savePlan` DEPUIS ce lot — les huit dossiers de
 * démonstration compris, qui n'ont jamais rejoué Phase 4 en base réelle (leur
 * `raw_analysis.plan.evaluation.dossier_read` est écrit par le SEMIS, pas par
 * un run). `isSegmentCollectionStale(null, epoch)` rend `true` : le bandeau
 * s'affiche donc sur les huit, en démonstration EXACTEMENT comme il
 * s'afficherait sur n'importe quel dossier client jamais rejoué depuis #2118
 * — ce qui est vrai pour eux aussi. Ce n'est pas une lacune du semis, c'est le
 * même fait honnête qu'un vrai client verrait : « cette lecture est
 * antérieure à la capacité, rafraîchis-la ».
 *
 * Deux des trois dossiers (Société Générale, SNCF) portent PAR AILLEURS une décomposition `dossier_read`
 * complète dans leur `raw_analysis` seedé — le bandeau et la décomposition
 * coexistent sans se contredire : le bandeau ne dit jamais « la décomposition
 * est absente » (`dossierRead.noAxisBreakdownHint`, un texte DIFFÉRENT, géré
 * par `dossierReadViewData.ts` selon que la clé existe), il dit « cette
 * lecture n'a jamais été datée comme rejouée depuis #2118 » — vrai même quand
 * la décomposition affichée est complète, parce qu'elle a été écrite par un
 * fichier de fixtures, jamais par un run daté.
 */
export const DEMO_DOSSIER_READ_STALE_COLLECTION_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#2118.51 (18/09/2026) — SEGMENT_CAPABILITY_EPOCH.dossier_read EST datée (2026-09-14T17:46:41.000Z), donc SegmentStaleCollectionNotice s'affiche réellement sur l'onglet Synthèse, démo comprise. `dossier_read_collected_at` est NULL sur les huit dossiers de démonstration (colonne neuve, jamais stampée par un semis qui n'appelle jamais AnalysisPersistenceService.savePlan) — isSegmentCollectionStale(null, epoch) rend true, exactement le même fait honnête qu'un dossier client jamais rejoué depuis #2118 afficherait. Aucune valeur de démonstration à écrire : la capacité se démontre PAR CONSTRUCTION, pas par un semis dédié — six des huit dossiers portent par ailleurs une décomposition dossier_read complète dans raw_analysis, sans contradiction : le bandeau parle de la DATE de rejeu, jamais de la présence du contenu.",
}

/**
 * « ET “TA CHARGE ACTIVE, ARBITRÉE” (#2067.2 / .4 / .5 / .6) MONTRE QUOI EN
 * DÉMONSTRATION ? » SEEDÉE — PAR LES RÉPONSES DÉJÀ SEMÉES, SANS SEMIS DÉDIÉ
 * (18/09/2026, RÉVISÉ #2067.2 LE 18/09/2026 AU SOIR — « LA DÉMO DÉCLARE SES
 * PARTENAIRES »).
 *
 * Même mécanique que « Ce que tes réponses disent » plus haut : le bloc
 * (`AuditActiveLoad.tsx`, `/settings/profile/audit`) ne lit PAS
 * `profile_context`, il DÉRIVE à la volée, côté navigateur, les réponses brutes
 * du questionnaire (`esn_profiles`, semée par `DemoSeedService.seedEsnProfile`)
 * par `buildAuditActiveLoad()` (`packages/contracts/.../commercial-audit-active-load.ts`).
 * Zéro table, zéro clé de `raw_analysis` supplémentaire : les colonnes qu'il lit
 * sont DÉJÀ au semis (`weekly_sales_time_protected`, `weekly_sales_time_slots`,
 * `protected_slot_capacity`, `workload_variability`, `go_to_market_channels`,
 * `partners_regular_count`, `partners_occasional_count`).
 *
 * ⚠️ Décision de Louis (18/09 nuit, QCM) : « partenaires réguliers » doit se
 * VOIR en démo. `go_to_market_channels` porte désormais un second canal, EN
 * PLUS du direct (`['Direct client final', 'Partenaires ESN']`) —
 * `worksThroughPartners` s'active, `partner_relationship`/
 * `partners_regular_count`/`partners_occasional_count` cessent d'être
 * masquées (raison retirée de `DEMO_ESN_PROFILE_COLUMNS_NOT_APPLICABLE`, voir
 * `DEMO_ESN_PROFILE_SEEDED_COLUMNS`).
 *
 * Ce que la salle voit, MESURÉ en exécutant la dérivation
 * (`demo-audit-active-load-coverage.spec.ts`) : des PARTENAIRES RÉGULIERS
 * établis (2 réguliers, 1 ponctuel, cité hors de la charge), sur la porte
 * « Partenaires ESN » ; deux créneaux, « Tôt le matin » et « En fin de
 * journée », que le semis dit « sauter souvent » ; deux portes pour un seul
 * front budgété — donc rien à garder en réserve, et UN élément à reporter
 * parmi les deux portes déclarées (#2067.6) — avec l'érosion semée CITÉE sous
 * la réserve. La preuve que la dérivation sait encore dire NON vit dans le
 * même spec : retirer le canal partenaire d'une entrée synthétique retombe
 * sur `noPartnerDoor`, sans toucher au semis réel.
 */
/**
 * « ET EN DÉMONSTRATION, LE PRÉVISIONNEL PAR HORIZON EST-IL REMPLI ? » (#2425).
 *
 * Oui, sans table nouvelle : `ForecastHorizonsService` lit `missions`,
 * `opportunities`, `invoice_readiness`, `project_needs` — toutes déjà SEMÉES.
 * La preuve porte sur les INGRÉDIENTS du bloc, lus dans le semis :
 * `demo-forecast-horizons-coverage.spec.ts`.
 */
export const DEMO_FORECAST_HORIZONS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#2425 (23/09/2026) — ForecastHorizonsService normalise des tables DÉJÀ semées (missions + renewal_status, opportunities, invoice_readiness, project_needs) : une mission en cours chiffrée qui finit dans le trimestre (carnet + « sécuriser le renouvellement »), une mission déclarée « bloque » (scénario bas + « débloquer »), un renouvellement déclaré (scénario référence), des factures non réglées dont une contestée (cash prévu, retard, litige), un besoin ouvert (capacité). Preuve lue dans le semis, pas recopiée : demo-forecast-horizons-coverage.spec.ts rougit dès qu’un de ces cas disparaît de DEMO_DELIVERY_CLIENT, demoInvoiceHistory ou DEMO_FLAGSHIP_NEED.',
}

export const DEMO_AUDIT_ACTIVE_LOAD_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#2067.2/.4/.5/.6 (18/09/2026, révisé #2067.2 le 18/09/2026 nuit — décision Louis, « la démo déclare ses partenaires ») — buildAuditActiveLoad() dérive les quatre grandeurs des réponses DÉJÀ semées dans esn_profiles (weekly_sales_time_protected, weekly_sales_time_slots, protected_slot_capacity, workload_variability, go_to_market_channels, partners_regular_count, partners_occasional_count), sur le budget de fronts que buildAuditDeclaredSignals() tire du même semis. Aucune des quatre n’est « non établie » en démonstration : des partenaires réguliers établis (porte « Partenaires ESN », 2 réguliers, 1 ponctuel cité hors charge), deux créneaux déclarés, un élément à reporter sur deux portes pour un seul front budgété (érosion citée). Preuve recalculée, pas relue : demo-audit-active-load-coverage.spec.ts exécute la vraie dérivation sur DEMO_ESN_PROFILE, et prouve aussi que la dérivation dit NON (noPartnerDoor) quand le canal partenaire est retiré d’une entrée synthétique.',
}

/**
 * « ET EN DÉMONSTRATION, LE BADGE DE SURALLOCATION DU PLANNING SE VOIT ? »
 * (#2989.2, recette 26/09 — « absent »).
 */
export const DEMO_PLANNING_OVERALLOCATION_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#2989.2 (recette 26/09/2026, /missions/planification) — chaque affectation entre à load_percent: 100 dans le semis (demo-seed.service.ts, INSERT INTO mission_assignments), à dessein : DEUX missions ACTIVES en même temps pour la MÊME personne suffisent déjà à dépasser 100 %. Yanis Berthier porte cette paire (« Fiabilisation plateforme — renfort exploitation », J-24 → J+55, et « Refonte des applications voyageurs — forfait », J-40 → J+12), toutes deux actives aujourd’hui — 200 % PAR CONSTRUCTION, sans valeur ajoutée pour l’occasion. Preuve recalculée, pas supposée : demo-planning-coverage.spec.ts filtre les missions du jeu réellement actives aujourd’hui et prouve qu’au moins une personne y dépasse 100 %.',
}

/**
 * « ET EN DÉMONSTRATION, LE DEVIS DE VÉRIFICATION NOMME-T-IL BOAMP/DECP ? »
 * (#2288.4, c66 — 18/09/2026).
 *
 * Non, et c'est la réponse juste. Le devis ne nomme BOAMP/DECP que d'après ce
 * que le LANCEUR dit d'un lancement réel (`planLaunch` → `publicTenderSources`).
 * En démonstration, `planLaunch` rend `{ scenario: 'demo' }` AVANT toute
 * prévision, et le devis n'interroge même pas le lanceur (`enabled: !isDemo`) :
 * aucune collecte ne part, la démo REJOUE un dossier semé. Semer une prévision
 * afficherait une source de marchés publics qu'aucun lancement ne lira — ce que
 * c66 interdit précisément. France Travail, elle, reste nommée par le plan
 * (inchangé). Preuve lue, pas recopiée :
 * `demo-verification-public-tenders-coverage.spec.ts`.
 */
export const DEMO_VERIFICATION_PUBLIC_TENDERS_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2288.4 (18/09/2026) — en démonstration, `planLaunch` rend `{ scenario: 'demo' }` avant toute prévision et le devis n'interroge pas le lanceur (`enabled: !isDemo`) : aucune collecte ne part, la démo rejoue un dossier semé, donc aucune source de marchés publics n'est interrogée. Nommer BOAMP ou DECP sur le devis de démonstration promettrait une source qu'aucun lancement ne lira — exactement ce que c66 interdit. Le mécanisme est livré et testé sur un espace réel (`analysis.service.spec.ts`, `VerificationPlanDialog.test.tsx`).",
}

/**
 * « ET EN DÉMONSTRATION, LA CARTE DE COUVERTURE D'UN COMPTE (#2308) SE VOIT-ELLE ? »
 *
 * VIDE À DESSEIN côté conversation, et ce n'est pas un trou de donnée : c'est
 * la MÊME raison que `DEMO_...REPLY_OPTIONS` un peu plus haut (#2679) — le
 * moteur du `/chat` de démonstration NE FAIT AUCUN APPEL réseau
 * (`demo-turn.ts`, décision Louis 03/09/2026) et rejoue une conversation
 * SCRIPTÉE (`demo-chat-script.ts`). `get_account_coverage_map` n'est donc
 * jamais invoqué en salle tant qu'aucune amorce ne le couvre — pas parce que
 * la donnée manquerait.
 *
 * Les colonnes que la carte lit sont, elles, déjà SEEDÉES et variées sur les
 * comptes de démonstration : `contacts.decision_role` / `family` / `entity`
 * (`DEMO_CONTACT_SEEDED_COLUMNS` ci-dessous) et `accounts.commercial_status`
 * (`'watching'` / `'inbox'` selon le dossier, `demo-dataset.ts`). La carte
 * elle-même — via `GET /accounts/:id/coverage-gaps`, dont l'onglet Zones
 * blanches EST servi en démonstration — produit donc déjà des états réels et
 * variés si on l'appelle directement ; seul le chemin CONVERSATIONNEL manque
 * une amorce scriptée.
 *
 * Écrire une amorce inventerait la RÉPONSE du modèle (le texte que Laura dirait
 * sur le gap principal) sans jamais l'avoir fait produire par le compilateur —
 * exactement la donnée fictive que la doctrine du dépôt refuse. Tant que cette
 * amorce n'existe pas, l'entrée reste ici, nommée, plutôt que déplacée vers
 * « seedée » pour faire passer un test.
 */
export const DEMO_CHAT_ACCOUNT_COVERAGE_MAP_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2308.44/#2308.45 (22/09/2026) — `get_account_coverage_map` n'est jamais invoqué en démonstration : le moteur du `/chat` de démo ne fait AUCUN appel réseau et rejoue une conversation SCRIPTÉE (`demo-chat-script.ts`, `demo-turn.ts`). Les colonnes qu'il lit sont déjà seedées et variées (`decision_role`/`family`/`entity` sur les contacts, `commercial_status` sur les comptes) et la carte de couverture par famille/niveau EST servie en démonstration sur l'onglet Zones blanches — seul le chemin conversationnel manque une amorce scriptée, à écrire quand une réponse RÉELLE du compilateur sera disponible à recopier.",
}

/**
 * « ET EN DÉMONSTRATION, LES DEUX BASCULES DE `/accounts` MONTRENT QUOI ? »
 * (#2150.14/.15/.18, revirement assumé de #1800, Louis 15/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « MES FAVORIS » — SEEDÉE, `user_favorites` HORS DU PÉRIMÈTRE DES DEUX GARDES
 * ─────────────────────────────────────────────────────────────────────────────
 * Même motif que `user_daily_brief` / `profile_context` plus haut : `user_favorites`
 * est scopée par `user_id` (`DEMO_PURGE_USER_TABLES`), jamais par `workspace_id` —
 * les deux gardes de tête de fichier ne peuvent donc pas la voir. La réponse
 * écrite quand même : `DemoSeedService.seedWorkspace` y pose UN favori GOLDEN
 * (le compte Société Générale de {@link DEMO_DOSSIERS}) à chaque semis, sinon le filtre
 * « Mes favoris » de `/accounts` s'ouvrirait sur du VIDE devant un prospect.
 * Garde dédiée : `it('marque UN compte de la salle comme favori PERSONNEL du
 * responsable')` dans `demo-seed.service.spec.ts`.
 *
 * Théo C talents-vivier.A12 — le VIVIER a aussi ses favoris (`entity_type = 'talent'`) : deux profils de
 * {@link DEMO_CONSULTANTS} portent `favorite: true`, posés au même semis ; garde `demo-vivier-states.spec.ts`.
 *
 * #4500 (maquette V22) — la LIGNE du vivier lit désormais le score /100 et ses axes (`TalentScorePill`) et la
 * colonne « Disponibilité & planning » (`VivierAvailabilityCell`) : SEEDÉES, aucune table neuve — elles lisent
 * `availability_checked_days_ago`, `available_in_days`, `proven_skill_count` et `owned_by_visitor` de
 * {@link DEMO_CONSULTANTS}, déjà posés sur `consultants` ; même garde `demo-vivier-states.spec.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « PORTÉS PAR UN COLLÈGUE » — VIDE À DESSEIN, ET LA RAISON NE SE CODE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le filtre porte sur `accounts.assigned_to <> currentUserId` : il exige un
 * SECOND membre du même espace, propriétaire d'au moins un compte. Or la salle
 * de démonstration n'a — délibérément — qu'UN occupant (#1408, voir la note sur
 * `assigned_to` dans `DemoSeedService.seedWorkspace`) : « une salle de
 * démonstration n'est le compte de personne d'autre ». Inventer un second
 * membre pour ce seul filtre romprait cette décision, et un visiteur qui clique
 * « Portés par un collègue » verra un portefeuille vide — un résultat CORRECT
 * (c'est la même réponse qu'un vrai commercial seul dans son espace), pas un
 * bug. Aucune table à classer ici : `accounts` l'est déjà, et ce filtre ne fait
 * que restreindre une colonne qu'elle porte depuis #1408.
 */

/**
 * « ET EN DÉMONSTRATION, LE RÉSULTAT D'UNE RECHERCHE PAR THÈME (#2532.2 bis,
 * 19/09/2026) MONTRE QUOI ? » — VIDE À DESSEIN, MÊME RAISON QUE TOUT GESTE
 * IA À LA DEMANDE.
 *
 * Le bandeau inline de `ResearchExpansionCallout` (« N personnes trouvées
 * pour ce thème », les contacts hors thème comptés à part) ne peut
 * structurellement pas s'afficher pour un visiteur : `demoGuard`
 * (`analysis-ondemand.service.ts`) refuse TOUT re-run IA à la demande sur un
 * espace de démonstration — AVANT tout appel réseau, pour NE PAS écraser les
 * dossiers-golden figés d'une recherche Apollo sur une entreprise fictive.
 * C'est le comportement PARTAGÉ par « Agrandir la recherche », « Vérifier une
 * relation », « Recalculer le chemin » et « Actualiser » : aucun n'a de
 * représentant en démo, et ce lot n'introduit pas d'exception.
 *
 * Pas de table à classer ici (`contacts` l'est déjà, voir plus bas) : rien de
 * NOUVEAU n'est purgé pour cette capacité. `matchProvenance` (la provenance
 * du thème, persistée dans `contacts.raw_data` sur un VRAI compte — #2290)
 * n'a pas de représentant non plus : `DemoContact`/`demoContactRow` ne
 * portent PAS `raw_data` — aucun champ de ce jeu de données n'y écrit
 * aujourd'hui — et le brancher pour une seule illustration serait un chantier
 * séparé (threader la colonne dans TOUT le seeder), hors du périmètre borné
 * de ce correctif. La raison tient devant un prospect : rien n'est promis là
 * où rien ne peut se produire.
 *
 * ADDENDUM #2532.2 (21/09/2026) — 5 familles de thèmes HORS IT (ingénierie,
 * BTP, santé, énergie, finance) rejoignent les 5 presets IT dans
 * `contact_themes.py`, et `themeSearch.presetMatched` (le champ qui dit si
 * un thème a reconnu une famille) porte la MÊME provenance transitoire que
 * le reste du bandeau. Même mécanisme, même refus `demoGuard` en amont :
 * cette extension n'ouvre AUCUNE nouvelle surface démo à classer — elle
 * élargit un dictionnaire déjà « vide à dessein » ci-dessus, pour la même
 * raison structurelle.
 */

/**
 * #2202.22 (27/09/2026) — « DÉJÀ EN SÉQUENCE » AVANT VALIDATION : SEEDÉ.
 *
 * `CreateSequenceDialog` avertit désormais quand un contact sélectionné porte
 * déjà une séquence active ou en pause (`contactsAlreadyInSequence`,
 * `audience-validation.ts`), comparée à `useOutreachSequences()` (toutes les
 * séquences du workspace, sans filtre — même lecture que l'écran des
 * séquences, jamais un second calcul qui pourrait diverger). `DEMO_OUTREACH_PLAN`
 * (`seedOutreachSequences`) donne à « Lorenzo Bini Smaghi » DEUX séquences
 * `active` (déjà semées pour #2325.35, la collision de sollicitation projet —
 * une question différente, côté pipeline projet, pas ce dialogue) : le
 * contact reste sélectionnable depuis le même sélecteur `GET /contacts` que
 * l'écran Contacts (#1512, aucune base propre aux séquences) — le
 * resélectionner dans `CreateSequenceDialog` déclenche l'avertissement pour
 * de vrai, sans seed supplémentaire.
 */
export const DEMO_SEQUENCE_ALREADY_IN_PROGRESS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#2202.22 (27/09/2026) — `CreateSequenceDialog` avertit quand un contact sélectionné porte déjà une séquence active ou en pause (`contactsAlreadyInSequence`, `audience-validation.ts`), comparée à `useOutreachSequences()` (toutes les séquences du workspace, sans filtre). `DEMO_OUTREACH_PLAN` (`seedOutreachSequences`) donne à « Lorenzo Bini Smaghi » une séquence `active`, atteignable depuis le même sélecteur `GET /contacts` que l'écran Contacts (#1512, aucune base propre aux séquences) — le resélectionner déclenche l'avertissement pour de vrai.",
}

/**
 * Lot L-B (#4165, épopée #4163, 14/10/2026) — LES SÉQUENCES MULTICANAL : SEEDÉES.
 *
 * Aucune table ni clé de `raw_analysis` neuve : le lot ajoute des COLONNES
 * (`outreach_sequences.delay_unit`, `vacation_paused_at`, `vacation_until`) et
 * trois natures d'étape (`linkedin_invite`, `linkedin_message`, `call`) à des
 * tables déjà seedées. Les gardes de tables ne posent donc pas la question —
 * celle-ci la pose quand même, parce qu'un écran livré mais vide en démo se
 * découvre en réunion (craft rule n°9).
 */
export const DEMO_MULTICHANNEL_SEQUENCES_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4165 (lot L-B, 14/10/2026) — `DEMO_OUTREACH_PLAN` (`seedOutreachSequences`) porte une campagne « Multicanal — octobre » de trois séquences en jours OUVRÉS : (1) Younes Berrada, une invitation LinkedIn NON acceptée dont le message suivant est SAUTÉ (transition `linkedin_invite_not_accepted` journalisée) ; (2) Farah Guillet, invitation acceptée → message → appel JOINT → séquence arrêtée sur `meeting_booked` ; (3) Salomé Vidal, en PAUSE VACANCES (bandeau de l'écran Séquences). Les stats par étape (préparé · fait · RDV) sont donc non vides. `demo-multichannel-sequences.spec.ts` confronte chaque valeur semée au CHECK de la migration `1796489437261` — un CHECK invisible aux specs mockées a cassé la démo le 11/10.",
}

/**
 * Lot L-C (#4166, 14/10/2026, épopée #4163) — « PARTIR D'UN MODÈLE » ET
 * L'ASSISTANT EN 4 QUESTIONS : SEEDÉS.
 *
 * La bibliothèque des huit modèles est STATIQUE (contrat `outreach-playbooks.ts`,
 * rien à lire en base) : elle est pleine en démo par construction, ainsi que les
 * gabarits d'avant rangés dessous. L'assistant lit les contacts de la salle et
 * prépare les messages avec le moteur de rédaction du composer (`POST /ia/message`),
 * sans aucune table neuve — donc aucune table ni clé de `raw_analysis` à classer.
 * Ce qui se SÈME, c'est le résultat d'un modèle : deux séquences créées depuis un
 * modèle (`DEMO_PLAYBOOK_SEQUENCES`), sur des contacts qui n'ont aucune autre séquence.
 */
export const DEMO_PLAYBOOKS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4166 (lot L-C, 14/10/2026) — la bibliothèque « Partir d'un modèle » (huit modèles par déclencheur, quatorze gabarits rangés) vient du contrat `outreach-playbooks.ts` : pleine en démo sans rien lire en base. `DEMO_PLAYBOOK_SEQUENCES` (`seedPlaybookSequences`) sème deux séquences créées depuis un modèle — « Signal de recrutement » (Pierre Palmieri) et « Après un rendez-vous » (Inès Morvan) — en jours OUVRÉS, étapes libres sans `template_key`, étapes, libellés et intentions lus dans le contrat. `demo-playbook-sequences.spec.ts` confronte chaque nature d'étape et chaque unité de délai aux CHECK de la migration `1796489437261`.",
}

/**
 * Lot L-D1 (#4167, 14/10/2026) — « ACTIONS › AUTOMATISATIONS » : SEEDÉE.
 *
 * Deux tables neuves (`automation_rules`, `automation_rule_firings`, classées dans
 * `DEMO_SEEDED_TABLES`) et une provenance neuve (`outreach_messages.source = 'automation'`) :
 * quatre règles — trois allumées, avec leur JOURNAL (le compteur « 30 jours » compte ces lignes,
 * il n'est pas écrit en dur), une éteinte jamais passée (« non mesuré », jamais 0) — et deux e-mails
 * préparés par des règles, en attente dans « À traiter ». Les routines planifiées et les workflows
 * d'Action OS, fusionnés dans la même liste, étaient déjà seedés (`routine_runs`, catalogue de code).
 * Aucune clé de `raw_analysis` neuve.
 */
export const DEMO_AUTOMATIONS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4167 (lot L-D1, 14/10/2026) — `DEMO_AUTOMATION_RULES` (`seedAutomations`) sème quatre règles « quand [signal] → alors … » : recrutement → séquence « Signal de recrutement » (celle de Pierre Palmieri existe vraiment), appel d'offres et nouveau décideur → e-mail préparé à relire, compte inactif → séquence de réactivation ÉTEINTE et jamais passée (« non mesuré », jamais 0). Le journal (`automation_rule_firings`) porte inscrits, préparés, exclus (code d'exclusion de l'outreach) et « sans contact » : le compteur des 30 jours est un COMPTAGE de ces lignes. `DEMO_AUTOMATION_MESSAGES` dépose deux e-mails `needs_review` source « automatisation » (le signal en « pourquoi maintenant »). Le passage du matin saute les salles de démonstration : ce sont des résultats semés, sur des contacts fictifs sans autre séquence. `demo-automations.spec.ts` confronte chaque valeur semée aux CHECK de la migration. #2399.6 / #2399.7 (25/10/2026) — la bascule de version est SEEDÉE par la règle « Une fin de mission approche » : ACTIVE (v1) avec son brouillon TESTÉ (v2, e-mail à relire plutôt qu'un appel) — l'écran « Avant de basculer » a donc de quoi comparer (deux versions, deux différences, migration, impact lu en lecture seule ; source illisible = « non mesuré », jamais 0). Aucune table ni clé `raw_analysis` neuve : `version_history` et `draft_compared_at` ont leur défaut.",
}

/**
 * #4357.1 / #4355.1 / #4354 (vague 4, 19/10/2026) — LE PARCOURS FUSIONNÉ SÉQUENCES + AUTOMATISATIONS : SEEDÉ.
 *
 * Aucune table neuve, aucune clé de `raw_analysis` : l'écran Séquences s'ouvre sur « Créer ma séquence »
 * et ne lit que ce qui est déjà semé — les séquences de `DEMO_OUTREACH_PLAN`, les règles de
 * `DEMO_AUTOMATION_RULES` (section « Séquences sur un signal », ex-écran Automatisations), les contacts
 * fictifs (étape « Pour qui ») et les gabarits/modèles du contrat (étape « Modèle »). Le récap du lot
 * d'« À traiter » (#4354.1) se lit sur les e-mails préparés semés (`DEMO_AUTOMATION_MESSAGES`).
 */
export const DEMO_SEQUENCE_JOURNEY_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4357.1 / #4355.1 (19/10/2026) — le parcours « Créer ma séquence » et la section « Séquences sur un signal » lisent les séquences semées (`DEMO_OUTREACH_PLAN`), les quatre règles de `DEMO_AUTOMATION_RULES`, les contacts fictifs et les gabarits du contrat ; #4354.1 — le récap du lot d'« À traiter » compte les e-mails préparés semés (`DEMO_AUTOMATION_MESSAGES`). Rien de neuf à semer : aucune table, aucune clé.",
}

/**
 * #4347 (19/10/2026) — « PRÉPARER UN MESSAGE » (fiche consultant) S'OUVRE DÉJÀ RÉDIGÉ : SEEDÉ.
 *
 * Décision de Louis (19/10) : préparer les messages se génère, ce n'est pas un champ vide à remplir. En
 * démonstration la rédaction ne joint PAS le moteur : `demoTalentMessage` (`demo-talent-message.ts`) script
 * l'objet et le corps à partir des faits de la fiche fictive (prénom, besoin du positionnement vivant,
 * client) — la fenêtre s'ouvre rédigée en réunion, et « Régénérer » / « Plus court » / « Plus direct »
 * répondent. Aucune table neuve, aucune clé neuve : le brouillon ENREGISTRÉ reste `talent_prepared_messages`
 * (déjà semée), et rien n'est jamais envoyé.
 */
export const DEMO_TALENT_MESSAGE_DRAFT_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4347 — la rédaction du message au consultant est SCRIPTÉE en démo (`demoTalentMessage`, appelée par `TalentMessageDraftService` quand `isDemoWorkspace`) : prénom, besoin du positionnement vivant et client lus sur la fiche fictive, aucun appel au moteur, aucun fournisseur nommé. Aucune table ni clé neuve.',
}

/**
 * #2202.19 (27/09/2026) — « DOUBLONS D'ADRESSE E-MAIL » AVANT VALIDATION :
 * VIDE À DESSEIN.
 *
 * Même écran, avertissement jumeau : deux contacts sélectionnés qui
 * partagent la même adresse e-mail (`duplicateEmailContacts`,
 * `audience-validation.ts`). Chaque contact semé reçoit une adresse dérivée
 * de son propre nom (`DemoSeedService`) — les homonymes « Mathis Fontenelle »
 * (`demo-contact-density.ts`) ont des TITRES différents, jamais la même
 * adresse. Aucune paire de contacts semés ne partage une adresse aujourd'hui.
 * Semer une collision pour ce seul avertissement fabriquerait un doublon de
 * toutes pièces dans un jeu de données par ailleurs proprement dédupliqué —
 * la question inverse de celle que cet avertissement pose.
 */
export const DEMO_SEQUENCE_DUPLICATE_EMAIL_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2202.19 (27/09/2026) — `CreateSequenceDialog` avertit quand deux contacts sélectionnés partagent la même adresse e-mail (`duplicateEmailContacts`, `audience-validation.ts`). Chaque contact semé reçoit une adresse dérivée de son propre nom (`DemoSeedService`) : aucune paire de contacts semés, homonymes inclus (« Mathis Fontenelle » ×2, `demo-contact-density.ts`), ne partage une adresse aujourd'hui. Semer une collision pour ce seul avertissement fabriquerait un doublon de toutes pièces dans un jeu de données par ailleurs proprement dédupliqué.",
}

/**
 * #3387.10 — « RENFORT TRANSVERSAL » SUR L'ÉCRAN ÉQUIPE.
 *
 * Le drapeau désigne un COLLÈGUE qui épaule les autres. La salle de démo avait
 * un seul occupant ; depuis #4158.13 (14/10/2026) elle compte trois collègues
 * fictifs (`DEMO_COLLEAGUES`), mais AUCUN n'est marqué « renfort » : le drapeau
 * dit qu'un collègue épaule les autres, et le poser sans que l'écran le
 * raconte serait un fait inventé. Marquer le propriétaire lui-même « renfort »
 * raconterait un faux — il pilote, il n'épaule pas.
 */
export const DEMO_TEAM_CROSS_TEAM_SUPPORT_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#3387.10 — le drapeau `workspace_members.cross_team_support` désigne un collègue en renfort ; la salle de démonstration a un propriétaire qui pilote et, depuis #4158.13, trois collègues fictifs (`DEMO_COLLEAGUES`) — aucun n'est marqué en renfort : ce n'est pas un fait de ce lot, et marquer le propriétaire en renfort serait un faux.",
}

/**
 * #4158.37-46 (lot L7, 14/10/2026) — LE TABLEAU D'ÉQUIPE `/team` REFONDU, BLOC PAR BLOC.
 *
 * La refonte n'ajoute AUCUNE table : chaque bloc lit des tables déjà classées
 * ci-dessus ou dans {@link DEMO_INTENTIONALLY_EMPTY}. Mais un écran neuf pose sa
 * propre question (« et en démo, ce bloc montre quoi ? »), et la garde de
 * tables y est aveugle — une garde aveugle n'est pas une exemption. La réponse
 * est donc écrite ici, bloc par bloc. ⚠️ Ce lot ne sème RIEN dans
 * `demo-dataset.ts` : les collègues fictifs, comptes assignés et actions
 * déléguées sont le lot L2 du même chantier — « seede_par_l2 » le nomme, et
 * l'intégrateur fusionne.
 */
export const DEMO_TEAM_BOARD_COVERAGE: Readonly<
  Record<string, Readonly<{ state: 'seede' | 'seede_par_l2' | 'vide_a_dessein'; reason: string }>>
> = {
  header: {
    state: 'seede',
    reason:
      "Le nom de l'espace et l'avatar du propriétaire viennent de l'espace de démonstration semé ; les avatars des collègues arrivent avec les collègues fictifs du lot L2.",
  },
  to_handle: {
    state: 'seede_par_l2',
    reason:
      'Les cartes « actions en retard », « travaillé par deux commerciaux » et « comptes en veille » supposent une équipe : collègues fictifs, comptes assignés et actions déléguées sont semés par le lot L2. Les comptes sans responsable et les périmètres non couverts se lisent déjà sur `accounts`/`contacts` semés.',
  },
  to_handle_pending_invitations: {
    state: 'vide_a_dessein',
    reason:
      "`workspace_invitations` est vide à dessein (voir DEMO_INTENTIONALLY_EMPTY) : inviter quelqu'un depuis une salle de démo n'a pas de sens, et la carte ne fait aucune ligne.",
  },
  to_handle_awaiting_esn_profile: {
    state: 'vide_a_dessein',
    reason:
      "La fiche canonique de l'ESN est semée (`esn_profiles`) : personne n'attend sa description. Montrer l'attente supposerait une ESN non décrite — l'inverse de ce que la salle doit montrer à un prospect.",
  },
  pulse: {
    state: 'seede',
    reason:
      'Lit `analysis_runs`, `user_actions` (dont `rdv_obtained`) et `project_needs`, toutes semées. « Actions terminées » lit `action_plan_items.completed_at`, vide à dessein (voir son entrée) : un zéro MESURÉ, rendu « stable », jamais inventé.',
  },
  reps: {
    state: 'seede_par_l2',
    reason:
      "Une ligne par membre : le propriétaire semé aujourd'hui, les collègues fictifs (portefeuille, actions ouvertes et en retard, activité) avec le lot L2.",
  },
  pipeline_review: {
    state: 'seede',
    reason:
      'Lit `opportunities` (semée) contre `user_actions` et `action_plan_items` : sans action de plan semée, les affaires encore en jeu sortent « sans prochaine étape », ce qui est vrai de la salle.',
  },
  staffing: {
    state: 'seede',
    reason:
      '`project_needs` et `consultants` (vivier avec disponibilités déclarées) sont semés, comme la couverture des comptes.',
  },
  activity: {
    state: 'seede',
    reason: '`user_actions` est semée ; le filtre par membre se remplit avec les collègues fictifs du lot L2.',
  },
  details: {
    state: 'seede',
    reason:
      'Adoption, hygiène Missions et contacts à traiter reprennent des blocs déjà classés (playbooks, rituels, crédits, missions, statuts de contacts) — seule leur place change.',
  },
}

/**
 * #2959 (recette prod 02/10) — LA ROUTE COMMERCIALE CALCULÉE, VISIBLE EN SALLE.
 *
 * `raw_analysis.recommendedRoute` n'est PAS une clé du contrat `accountAnalysisSchema`
 * (le plan la porte comme `recommendedMovement` et `nextActions`) : la garde des clés
 * de `raw_analysis` est donc aveugle à cette nouveauté, et une garde aveugle n'est pas
 * une exemption. Groupe BPCE porte la route « partenaire » (partenaire déclaré en
 * place, aucune relation active) — `demo-commercial-route-coverage.spec.ts` le relit,
 * et `test_demo_route_seed_matches_engine.py` (apps/ia) refuse qu'elle diverge du moteur.
 */
export const DEMO_COMMERCIAL_ROUTE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'Groupe BPCE : `raw_analysis.recommendedRoute` (route « partenaire », ses sept attributs) lue par l’onglet Plan, carte « Prochains mouvements ». Même partenaire déclaré que la suggestion du board (`DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER`).',
}

/**
 * #3970 (lot P07, 09/10/2026) — LES RECRUTEMENTS RÉCENTS (section de la veille,
 * `GET /accounts/:id/recent-hires`, et `recentHires` de Laura). Aucune table ni
 * clé de `raw_analysis` neuve : la capacité lit `contacts.apollo_enrichment`,
 * déjà semée pour les personnes SIMULÉES. Cinq d'entre elles portent une
 * arrivée datée RELATIVEMENT au seed (`recentHireDaysAgo`,
 * `demo-contact-density.ts`) — jamais un dirigeant réel. La preuve est
 * exécutée par `demo-recent-hires-coverage.spec.ts`, qui fait tourner
 * `recentHires` sur le jeu réel avec le profil de la salle.
 */
export const DEMO_RECENT_HIRES_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#3970 — Société Générale : un DSI (persona décideur), un responsable data et un responsable plateforme cloud (métiers placés « Data » et « Cloud ») arrivés il y a 40, 75 et 120 jours ; SNCF : un DSI arrivé il y a 25 jours et un responsable achats arrivé il y a 150 jours, hors des personas et métiers de la salle — la raison « hors contexte » se montre aussi. Dates relatives à l’ouverture de la salle : figées, elles sortiraient de la fenêtre de 6 mois.',
}

/**
 * Louis 30/10/2026 — OFFRES D'UN COMPTE PAR MÉTIER SAISI (`GET /accounts/:id/job-offers`, panneau
 * « Chercher un autre métier » de la veille, 5 par 5 jusqu'à 50). Aucune table ni clé de `raw_analysis`
 * neuve : en démo la route relit `raw_analysis.it_job_signals`, DÉJÀ semée, filtrée par le métier — jamais
 * une collecte. Preuve exécutée : `demo-account-job-offers-coverage.spec.ts`.
 */
export const DEMO_ACCOUNT_JOB_OFFERS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'SNCF : « data » rend « Ingénieur plateforme data » et « Data analyst exploitation », « devops » rend « Ingénieur DevOps Kubernetes » ; l’offre de stage semée n’est jamais servie.',
}

/**
 * #2322.70 (31/10/2026) — RÔLE, ÉQUIPE, COMPÉTENCES ET TENSION D'UNE OFFRE. Aucune table ni clé de `raw_analysis`
 * neuve : les champs additifs (`role`, `team`, `tension`, `tension_reason`, `tension_days`) sont portés par les
 * offres DÉJÀ semées de `raw_analysis.it_job_signals`. Les autres offres restent sans champ, à dessein : un champ
 * que le texte ne prouve pas ne fait aucune ligne. Preuve exécutée : `demo-job-offer-enrichment-coverage.spec.ts`.
 */
export const DEMO_JOB_OFFER_ENRICHMENT_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'SNCF : « Ingénieur plateforme data » montre son rôle, son équipe, ses compétences et une tension « en ligne depuis 82 jours » ; « Responsable exploitation des systèmes temps réel » montre une tension « urgence écrite dans l’annonce » ; les autres offres n’affichent aucune ligne de plus. #5010 : les deux offres Société Générale portent leur job board (`board`), qui nomme le site d’emploi (France Travail, APEC) quand l’URL est absente.',
}

/**
 * #4923.12/.16 (Louis 30/10/2026) — LA MATRICE FAMILLE × NIVEAU ET SON GESTE « CHERCHER CE RÔLE ». Aucune table
 * ni clé de `raw_analysis` neuve : l'onglet Zones blanches lit `GET /accounts/:id/coverage-gaps`, qui dérive
 * chaque case de `contacts.family` / `decision_role` / `seniority` / `title`, DÉJÀ semées (voir
 * `DEMO_CONTACT_SEEDED_COLUMNS`). La salle montre donc des cases couvertes et des cases « non trouvé par cette
 * recherche » avec leur geste. Preuve exécutée : `demo-coverage-matrix-4923.spec.ts`.
 */
export const DEMO_COVERAGE_MATRIX_ROLE_SEARCH_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'Société Générale : des cases couvertes et des cases vides de familles cibles, lues sur les colonnes de contacts déjà semées ; chaque case vide porte « Chercher ce rôle ». Aucune donnée neuve.',
}

/**
 * #4923.10/.11/.16 — LA PROVENANCE `web_role_search`. VIDE À DESSEIN, et ce n'est pas un trou : la source
 * interne `web_role_search` (recherche web ciblée par rôle) n'est stockée dans AUCUNE colonne de contact et n'est
 * JAMAIS nommée à l'écran (doctrine : on nomme ce que l'espace a branché, jamais ce qui nous sert). Il n'y a
 * donc rien à semer qu'une fiche pourrait montrer — l'écrire dans une colonne qui n'existe pas, ou la nommer,
 * violerait la doctrine fournisseurs. Si une colonne de provenance interne naît un jour, sa contrainte SQL est
 * élargie AVANT le code qui l'écrit (GA-11/GA-12) et cette entrée devient « seedée ».
 */
export const DEMO_WEB_ROLE_SEARCH_PROVENANCE_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#4923.11 — `web_role_search` est une provenance INTERNE : aucune colonne de contact ne la porte et elle n'est jamais nommée à l'écran (doctrine fournisseurs). Rien à montrer en salle, donc rien à semer ; la recherche elle-même est sans clé = no-op strict.",
}

/**
 * SIG-B (11/10/2026) — LE RECRUTEUR NOMMÉ PAR UNE OFFRE D'EMPLOI PUBLIÉE.
 *
 * Aucune table ni clé de `raw_analysis` neuve : le recruteur est une ligne de
 * `contacts` (déjà semée) qui porte sa PREUVE dans `raw_data.jobPosting`, lue
 * par la fiche contact. SNCF porte une personne SIMULÉE (Inès Morvan), sur une
 * offre FICTIVE en `.example`, datée relativement au semis — jamais un
 * dirigeant réel, jamais une vraie annonce. Rang le plus bas du dossier : un
 * recruteur ne passe jamais devant un décideur. Preuve exécutée par
 * `demo-job-posting-recruiter-coverage.spec.ts`.
 */
export const DEMO_JOB_POSTING_RECRUITER_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'SIG-B — SNCF : une chargée de recrutement IT (personne simulée) nommée par une offre fictive « Ingénieur DevOps plateforme data », publiée il y a 6 jours ; sa fiche montre « Offre d’emploi publiée », le lien vers l’offre et sa date. Rang 5, aucune coordonnée : rien n’est enrichi d’office.',
}

/**
 * #4016.L2.a — « VU LE <DATE> » SUR LA FICHE D'UN CHAMPION.
 *
 * Aucune table ni clé de `raw_analysis` neuve : la date vit dans
 * `contacts.raw_data.employmentCheck.at`. #4286.13.b — la ligne s'affiche pour TOUT
 * contact relu (plus seulement un champion) : SEMÉ, parce que les personnes simulées
 * relues du semis (voir ci-dessous) portent déjà cette date, datée relativement au
 * semis. Les sièges champion restent sans personne nommée : aucune date inventée sur
 * un dirigeant. Le cas présent est exécuté par `ContactKeyInfo.employment-seen.test.tsx`.
 */
export const DEMO_EMPLOYMENT_SEEN_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4286.13.b — « Thibault Revel » (SNCF) et « Maxime Delaunay » (Société Générale), personnes simulées, ont été relus il y a 9 et 14 jours : leur fiche dit « Employeur vu le <date> » sans être champions. Les sièges champion ne nomment personne : aucune date inventée.',
}

/**
 * #4465 (retour client, 25/10/2026) — LA FONCTION DU POSTE EN COURS ET LE DÉPART, LUS DU PARCOURS.
 *
 * Aucune table ni clé de `raw_analysis` neuve : l'écran lit `contacts.apollo_enrichment.employment_history` (déjà semé
 * pour les personnes SIMULÉES, jamais un dirigeant réel). SEMÉ : des contacts à TROIS postes dont un seul « Actuel »
 * (la fiche dit la fonction de ce poste, pas celle d'un ancien), et des contacts PARTIS — leur poste chez le compte porte
 * une date de fin relative au semis, leur poste en cours est ailleurs. Exécuté par `demo-contact-poste-coverage.spec.ts`.
 */
export const DEMO_CONTACT_POSTE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4465 — les contacts à recrutement récent (Société Générale, SNCF, …) portent trois postes dont un « Actuel » : en-tête, « Fonction » et sous-titre du bloc « Profil professionnel » disent le même intitulé. Les contacts à employeur actuel ailleurs (« historique ») portent la date de fin de leur poste chez le compte : la fiche et la ligne disent « A quitté l’entreprise (mois année) » et l’organigramme ne les compte plus. Dates relatives au semis, jamais inventées pour un dirigeant réel.',
}

/**
 * #4055.8 — « A QUITTÉ L'ENTREPRISE » SUR LA FICHE D'UN CONTACT.
 *
 * Aucune table ni clé de `raw_analysis` neuve : l'état vit dans `contacts.raw_data.employmentCheck`. SEMÉ :
 * SNCF porte un interlocuteur FICTIF (profil `demo-bellum-`) dont la relecture a observé un autre employeur,
 * daté relativement au semis. Les sièges champion restent vides (voir ci-dessus) : la preuve est posée sur une
 * personne simulée, jamais sur un dirigeant réel. Exécuté par `demo-employment-left-coverage.spec.ts`.
 */
export const DEMO_EMPLOYMENT_LEFT_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4055.8 — SNCF : « Thibault Revel » et Société Générale : « Maxime Delaunay » (personnes simulées) ont été relus chez un autre employeur (il y a 9 et 14 jours) ; V4-CORRECTIFS 4290.12 — la liste /contacts les marque et le semis les remonte en 1re page ; sa fiche dit « A quitté l’entreprise » avec la date de la relecture. SEMIS-PREUVES 4290.13 (#4055.9) : « Mathilde Garnier » (simulée) n’a PAS été retrouvée à la relecture, il y a 14 jours ; sa fiche dit « Non retrouvé » sans conclure au départ, la fonction garde son libellé. #4290.12 (31/10/2026) — SNCF ouvre /contacts (dernière analyse terminée la plus récente, `DEMO_HISTORY_RUNS`) et « Thibault Revel » est dans son chemin recommandé : le drapeau tombe sur la 1re page. Garde : `demo-contacts-first-page-coverage.spec.ts`.',
}

/**
 * #3403 — LES VOIES D'ACCÈS PERSONNELLES DE L'ONGLET ACCÈS, TROIS SUR ONZE.
 *
 * `account-access.service.ts` (`personalAccessPaths`) agrège quatre sources
 * réelles en onze voies nommées. Trois sont démontrables en démo, DEUX
 * certitudes différentes pour ne jamais laisser croire que la carte n'a
 * qu'un seul rendu (#3403.14, « jamais une voie garantie sans confirmation ») :
 *
 *  - `partenaire_rang2` — DÉJÀ semée avant ce chantier
 *    (`DEMO_SPRINT_PARTNER_ROUTE_PARTNER`, SNCF, `account_partners`) ;
 *  - `consultant_en_place` — Philippe Marchand (SNCF), lien VÉRIFIÉ ⇒ badge
 *    « Accès vérifié » ;
 *  - `recommandation_directe` — Isabelle Rouault (SNCF), lien PAS
 *    vérifié ⇒ badge « Relation probable ».
 *
 * `DEMO_PERSONAL_ACCESS_PATH_SEEDS` (`demo-seed.service.ts`) est la preuve
 * relue par `demo-coverage.spec.ts` — jamais une relecture du corps de
 * `seedPersonalAccessPaths`.
 */
export const DEMO_PERSONAL_ACCESS_PATHS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#3403 (30/09/2026, recette « 2 voies sur 11 ») — les ONZE voies d'accès personnelles sont démontrables en démo. Sept par un lien déclaré sur les dossiers réels, plus deux sur SNCF (ancien collègue vérifié, rencontre en événement probable — #3510, le dossier qu'on ouvre en réunion) (`DEMO_PERSONAL_ACCESS_PATH_SEEDS`) : consultant (Philippe Marchand, vérifié), recommandation directe (Isabelle Rouault, non vérifié), ancien collègue (Pierre Palmieri), ancien manager (Lorenzo Bini Smaghi), relation commune (Laurent Trévisani), réseau alumni (Karim Belhadj), événement (Céline Lombard) — sur deux comptes (Société Générale, SNCF), avec les deux certitudes que #3403.14 exige. Quatre autres par leur source propre (`DEMO_PERSONAL_ACCESS_EXTRA_SEEDS` et `DEMO_SPRINT_PARTNER_ROUTE_PARTNER`) : partenaire rang 2 (SNCF), ESN référencée en rang 1 avec placements réels (Groupe BPCE), client existant (état de relation CRM de SNCF), personne ayant changé de poste (signal sur Société Générale). ⚠️ Revient sur la mention « huit voies vides à dessein » du même jour : Louis a demandé de les prouver toutes en démo. Les dates sont RELATIVES à l'ouverture de la salle — une date figée passerait au-delà des 180 jours et virerait à « à revérifier ».",
}

/**
 * #2370 (épopée #2947) — les canaux préparés neufs du composer : un message déjà préparé par canal
 * (`DEMO_PREPARED_CHANNEL_DRAFT_SEED_SPECS`, semé dans `message_draft_versions`), sauf le message
 * partenaire, vide à dessein. Garde : `demo-prepared-channels-coverage.spec.ts`.
 */
export const DEMO_PREPARED_CHANNELS_COVERAGE: Readonly<
  Record<
    'introduction_request' | 'partner_message' | 'follow_up_email' | 'profile_push' | 'linkedin_connection_note',
    { state: 'seede' | 'vide_a_dessein'; reason: string }
  >
> = {
  introduction_request: {
    state: 'seede',
    reason:
      'Julien Castaing est le sponsor qui introduit : la demande lui est adressée, avec son paragraphe transférable.',
  },
  partner_message: {
    state: 'vide_a_dessein',
    reason:
      'La salle ne porte AUCUN contact chez un partenaire : les deux partenaires déclarés sont de vraies ESN observées par les briefs (CGI, Sopra Steria — `DEMO_SPRINT_PARTNER_ROUTE_PARTNER`), et Louis a écarté toute ESN fictive (04/10/2026) ; y inventer une personne serait une donnée fictive sur une entreprise réelle. Le canal reste proposé sur tout contact rattaché à un compte.',
  },
  follow_up_email: {
    state: 'seede',
    reason:
      'Nadia Perrin a répondu au premier message : le suivi apporte un élément neuf (les dates de démarrage) avant son comité.',
  },
  profile_push: {
    state: 'seede',
    reason: 'Nadia Perrin attend deux profils (key_points du jeu) : un premier profil poussé, sans nom ni tarif.',
  },
  linkedin_connection_note: {
    state: 'seede',
    reason:
      'Younes Berrada est le contact LinkedIn seul de la salle : une note de connexion de moins de 300 caractères, sans offre.',
  },
}

/**
 * #3402 — LES QUATRE TRAJECTOIRES COMMERCIALES, DÉJÀ DÉMONTRABLES SANS RIEN
 * SEMER DE NEUF.
 *
 * `computeCommercialTrajectories` (`@bellum/contracts`) regroupe des contacts
 * déjà classés (`Contact.decision_role`) en quatre trajectoires. SNCF
 * (`DEMO_DOSSIERS`) porte déjà un `economic` (Jean Castex), un `influencer`
 * et plusieurs `technical` — assez pour que les QUATRE trajectoires
 * apparaissent (haut, terrain, manager intermédiaire, ET parallèle) sur ce
 * seul dossier, sans qu'aucune ligne n'ait été ajoutée pour ce chantier.
 */
export const DEMO_COMMERCIAL_TRAJECTORIES_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#3402 (30/09/2026) — `computeCommercialTrajectories` (@bellum/contracts) lit `Contact.decision_role`, déjà semé en abondance sur SNCF (DEMO_DOSSIERS) : `economic` (Jean Castex), `influencer` et plusieurs `technical`. Les quatre trajectoires (top/field/middle_manager/parallel) apparaissent donc déjà sur ce dossier, sans qu'aucun contact n'ait été ajouté pour ce chantier — la démonstration montre le mécanisme de bout en bout.",
}

/**
 * Tables que {@link DemoSeedService.seedWorkspace} remplit — un écran qui les lit
 * s'ouvre avec du contenu.
 */
export const DEMO_SEEDED_TABLES = [
  // #4163 LF (point 7) — les écritures CRM EN ATTENTE (un lot + une écriture seule) de la file « À traiter ». Le
  // registre d'outils montre un CRM branché PAR LECTURE (`tool-registry/demo-connections.ts`, aucune ligne
  // `crm_connections`, aucun jeton) et `CrmController.decideWrite` n'exécute jamais une demande de la salle : une
  // validation ne touche aucun CRM. Remplace le « vide à dessein » d'avant (« Écriture CRM indisponible » en réunion).
  'outbound_write_requests',
  // #4016 L4.1 (décision Louis 11/10/2026) — `field_provenance` QUITTE « vide à dessein » pour UNE
  //   provenance et une seule : `inferred`, l'e-mail ESTIMÉ d'un interlocuteur SIMULÉ
  //   (`DEMO_ESTIMATED_EMAIL_CONTACTS`, `seedEstimatedEmails`), badgé « estimé, vérifié le … » sur la
  //   fiche. Ce qui reste vrai de l'ancienne raison : aucune ligne `human` n'est semée SUR UN COMPTE — « corrigé à la
  //   main » sur une fiche que personne n'a touchée mentirait, et corriger un champ reste le geste du
  //   VISITEUR. Les dossiers viennent toujours du pipeline (l'absence de ligne = `pipeline`).
  //   #4604 (26/10/2026) — et UNE ligne `connector` : le nom de Société Générale, le compte du miroir CRM
  //   fictif (`seedCrmMirror`), lu « vient de HubSpot » à côté du nom (`CrmFieldSourceTag`).
  //   #4577.3 (01/11/2026) — et UNE ligne `human` sur la fiche d'un TALENT (`DEMO_HAND_ENTERED_TALENT_FIELDS`, le TJM de
  //   Camille Roussel, seedée dans `demo-seed.service.ts`) : la fiche la marque « Saisi à la main ».
  'field_provenance',
  // #4016 L6 (Louis 11/10/2026) — le pipe « détecté, à revoir » : une ligne par passage (intérêt →
  //   affaire sur SNCF, shortlist → positionnement et entretien → mission LUS dans la salle),
  //   `DEMO_PIPELINE_DETECTIONS`, `seedPipelineDetections`. Le visiteur confirme ou écarte : c'est son
  //   clic qui crée l'affaire ou le positionnement, jamais le semis.
  'pipeline_detections',
  // #4016 L6 (Louis 11/10/2026) — `duplicate_pairs` QUITTE « vide à dessein ». L'ancienne raison
  //   (« les dossiers sont propres, une paire inventée ne se trancherait pas ») tenait pour une
  //   PROPOSITION ; la fusion automatique ≥ 0,99 ajoute un objet que la salle doit montrer : ce que
  //   Bellum a fusionné SEUL, et son « Annuler la fusion ». Une paire certaine est semée
  //   (`DEMO_AUTO_MERGED_DUPLICATE`, `seedAutoMergedDuplicate`) sur un contact « à qualifier » FICTIF
  //   ressaisi par un import — les cinq dossiers réels restent propres, aucune paire à trancher n'est
  //   inventée sur une personne réelle.
  'duplicate_pairs',
  // #3699.6 — le catalogue d'assets outreach QUITTE la liste « semé paresseusement » : la salle le
  //   sème (`seedOutreachAssets`, `DEMO_OUTREACH_ASSETS`) pour que la bibliothèque de documents
  //   attachables et le choix de pièces du dialogue d'envoi aient de vrais fichiers fictifs à montrer.
  'outreach_assets',
  // #3235 (#3212.4/.6, recette démo 05/10) — DEUX runs terminés pour Société Générale (NO-GO puis
  //   PRUDENT, `DEMO_ANALYSIS_RUNS`) : « Historique des analyses » (fiche compte › Synthèse) et la
  //   révision « NO-GO → PRUDENT, cause, date » (`GET /accounts/:id/verdict-revision`) se voient. ⚠️
  //   Tranché sans Louis sur consigne du lot : cela renverse l'ancienne raison « aucun run réel ne
  //   tourne en démo » — le dernier verdict est CELUI du dossier (jamais un second jugement), aucun
  //   run n'est lancé, aucun crédit débité, et les dates sont relatives à l'ouverture de la salle.
  //   #4180 — « Même verdict depuis le … » (`GET /accounts/:id/verdict-unchanged`) lit ces MÊMES runs : la
  //   salle n'en montre pas (le verdict de Société Générale CHANGE, c'est la révision qui s'affiche) — vide
  //   à dessein, un seul des deux états se voit pour un même compte.
  //   Théo B r1-recherche (22/10) — le CADRAGE CONSERVÉ du run (`scope_selection` : objectifs choisis, angle,
  //   zone, entités ciblées/exclues, postes à placer, niveau de contact) est semé sur Groupe BPCE
  //   (`DEMO_VERIFICATION_RUNS`, entités RÉELLES du groupe) et sur Société Générale : la ligne « Cadrage
  //   appliqué » en tête du dossier le rappelle. Aucune table ni clé de raw_analysis neuve : jsonb d'une
  //   colonne déjà semée.
  'analysis_runs',
  // #2979 (Louis, 03/10/2026) — UNE vue enregistrée de « Missions » (scope `missions`, facette « à
  //   renouveler »), au nom du propriétaire de la salle : l'écran des filtres s'ouvrait sans vue à
  //   rejouer. ⚠️ Tranché sans Louis : cela renverse en PARTIE l'ancienne raison « le filtre est un
  //   geste du visiteur ». Théo decouvrir-historique (23/10/2026) — les recherches enregistrées de
  //   Découvrir (scope `discover`) sont SEMÉES à leur tour (`DEMO_DISCOVER_SAVED_VIEWS`, 3 : une
  //   personnelle, une partagée rejouée chaque semaine dans l'application, une partagée manuelle) :
  //   la page « Mes recherches » est la maquette appliquée, et son bloc « Enregistrées » ne s'ouvre pas
  //   vide devant un prospect. ⚠️ Cela renverse l'ancienne raison « une intention que le visiteur n'a pas
  //   formulée » — assumé : l'objectif écrit est celui d'un commercial d'ESN type, jamais celui du visiteur.
  'saved_views',
  // Théo D team-recherches (22/10/2026) — trois recherches Découvrir de l'équipe (`DEMO_TEAM_RESEARCH`), semées dans
  //   `seedColleagues` : « Équipe › Recherches » ne s'ouvre pas vide devant un prospect. Les analyses de compte de la
  //   page se lisent sur `analysis_runs` (déjà semées).
  'team_research_entries',
  // Théo D team-activite.N2 (22/10/2026) — RENVERSEMENT ASSUMÉ de #4158.13 (« la table reste vide à dessein ») : l'écran
  //   « Équipe › Activité & échanges » existe maintenant (`TeamDiscussions`) et ne s'ouvre pas vide devant un prospect. UN
  //   sujet ouvert d'un collègue fictif qui mentionne l'occupant (`DEMO_TEAM_THREADS`) ; aucune réponse n'est semée, répondre
  //   reste un geste du visiteur.
  'team_comments',
  // #3246 (lot X65, 02/10) — UN retour de mission, porté par un compte FICTIF
  //   (`DEMO_SIMILAR_CASES`), pour que `find_similar_cases` cite un cas GAGNÉ
  //   en démonstration. ⚠️ Tranché sans Louis, sur consigne du lot : cela
  //   renverse l'ancienne raison « un retour s'écrit, il ne se seede pas » —
  //   assumé parce que le retour décrit une mission d'un compte qui n'existe
  //   pas (jamais une entreprise réelle ni un consultant nommé). La mission
  //   TERMINÉE du client d'exemple reste SANS retour : « REX en attente » se
  //   remplit toujours seul depuis elle.
  // #3246.relation / #3246.timing (décision Louis 16/10/2026) — les deux
  //   dernières dimensions de similarité sont REMPLIES en démonstration :
  //   la relation par un STADE saisi (`relationship_memory.relationStage`,
  //   aucune table neuve) sur BNP Paribas (ancien client), ENGIE et Société
  //   Générale (client actif) ; le timing est CALCULÉ, jamais semé, depuis les
  //   dates des affaires closes déjà semées (plus de trois cycles datés).
  //   Garde : `demo-similar-cases-dimensions.spec.ts`.
  'rex_entries',
  // #3295 (brief P01, 07/10/2026) — UN REX de perte (BEL-SC-243, #3272.1), sur
  //   la MÊME opportunité perdue que `DEMO_SIMILAR_CASES.lost` (BNP Paribas, un
  //   VRAI dossier de la salle — `project_id` n'est pas unique sur cette table,
  //   voir l'entité). Décision Louis (brief P01 07/10, ratifie la ligne du
  //   04/10 « la démo montre les vrais comptes des briefs ») : renverse
  //   l'ancienne raison « en fabriquer un attribuerait un échec commercial à un
  //   dossier qui n'a jamais existé » — elle ne tenait plus depuis que le
  //   porteur des cas comparables est un compte réel. Chaque champ renseigné
  //   porte sa distinction fait/hypothèse (#3272.2 : `fait_confirme`,
  //   `retour_client`, `hypothese`). Un seul REX reste SOUS le seuil de deux
  //   convergents qu'exige une proposition d'apprentissage (NO-GO #3272.7) :
  //   `lost_deal_rule_proposals` et `workspace_method_rules` restent vides
  //   pour leur propre raison, juste en dessous.
  'lost_deal_rex',
  // #3918.b / #3920.crm / #3903 (lot M01, 09/10/2026) — TROIS affaires du CRM de l'ESN chez Société
  //   Générale (`DEMO_CRM_DEALS`) : une ouverte qui dort, une perdue, une gagnée dont le cycle de
  //   renouvellement est écoulé. Renverse l'ancienne raison « un pipeline fictif inventerait un taux
  //   de conversion », qui ne tient plus pour CES lignes : leur fournisseur est `demo`, et le rapport
  //   pipeline ne lit que `hubspot` APRÈS une connexion réelle (`CrmDepthService.getPipelineReport`
  //   commence par `resolveAccess`, qui échoue sans CRM branché) — aucun taux, aucun cycle moyen
  //   n'est affiché. La reprise de mission (`MissionCrmReprisalService.candidates`) reste fermée :
  //   la salle porte déjà des missions. Ce que ces lignes montrent : la veille du compte (#3918.b),
  //   la cloche (#3920.crm) et le bilan de relance de Laura (#3903, « deal ouvert jamais closé »).
  'crm_deal_facts',
  // SYNC-A (19/10/2026) — le MIROIR CRM (`DEMO_CRM_MIRROR`, `seedCrmMirror`) : les trois affaires de
  //   Société Générale ci-dessus copiées dans `crm_deals` (rattachées au compte réel des briefs), le
  //   pipeline et ses étapes, le propriétaire des fiches, quatre activités (sujet, type, date — jamais
  //   de corps), plus (#4604.4) les champs personnalisés des affaires (`DEMO_CRM_MIRROR.dealCustomFields`,
  //   `crm_custom_fields`). Fournisseur `demo` : aucun CRM réel. Lus par la fiche compte
  //   (`GET /crm/mirror/accounts/:id`) avec le MÊME lecteur que la production (`CrmMirrorReader`).
  'crm_deals',
  'crm_activities',
  'crm_owners',
  'crm_pipelines',
  'crm_stages',
  // #3918.b (lot M01) — le registre canonique devient LU par un écran (la veille du compte,
  //   `GET /crm/accounts/:id/signals`) : les trois signaux des affaires ci-dessus y sont écrits par
  //   les MÊMES règles que le balayage de production (`buildDemoCrmDeals`), le balayage excluant
  //   les espaces de démonstration. Rattachés au compte par SIREN (#3918.a), jamais par le nom.
  'canonical_trigger_events',
  // BEL-SC-224 (#3253, P0) — le diagnostic du maillon faible commercial de la
  // salle : calculé par `WeakestLinkDiagnosisService.seedDiagnosisFor`, appelé en
  // toute fin de `DemoSeedService.seedWorkspace`, sur les comptes/actions/
  // talents que le semis vient d'écrire — jamais une ligne tapée à la main.
  // Rendu sur `/pilotage` seul (WeakestLinkDiagnosisSection ; décision Louis 19/10) et par Laura
  // (`get_weakest_link_diagnosis`).
  'weakest_link_diagnoses',
  // #2967 (lot V39, 28/09/2026) — le journal des états d'un besoin, désormais
  //   LU par l'onglet Historique de la fiche besoin (`NeedHistoryTab`) : il
  //   sort de « vide à dessein » (sa raison était « aucun écran ne le lit »).
  //   Naissance + état courant de chaque besoin ouvert, tirés des champs déjà
  //   semés ; le premier porte la source `laura`. `seedNeedStatusJournal`.
  'commercial_transitions',
  // L2 Pilotage › Pipe (Louis 14/10/2026) — le journal des montants et des dates prévues, lu par le
  //   waterfall (+ montées / − baissées) et les signaux « date repoussée », « montant baissé » de
  //   `/pilotage/pipe`. Posé par `seedPipeDeclarations`, avec les stades (`commercial_transitions`).
  'opportunity_field_changes',
  // #3104 (27/09/2026) — UNE conversation d'exemple, visible dans le panneau
  //   « Conversations » de /chat au premier chargement. Raison complète
  //   (renversement assumé de la doctrine « vide à dessein ») écrite juste
  //   au-dessus de `conversation_summaries` plus bas dans ce fichier.
  //   `DemoSeedService.seedWorkspace`.
  'chat_messages',
  // #2429.9 (épopée #2852, lot P07 30/09) — la conversation d'exemple porte un plan
  //   d'action ET sa version 2 (modifiée par un humain) : l'écran montre « version 2 »
  //   et l'historique. `DemoSeedService.seedWorkspace`, juste après `chat_messages`.
  'chat_artifact_versions',
  // #1509→#1515 — six séquences, plusieurs états que le cockpit distingue.
  //   `seedOutreachSequences`. Aucune ne porte de brouillon d'e-mail.
  //   #3421 (lot G03, 30/09) — l'une d'elles est `cancelled` avec une cause
  //   d'arrêt réelle (voir `outreach_transitions` juste en dessous) : sans
  //   elle, le badge d'arrêt (« Refusée », « Adresse invalide »…) n'était
  //   démontrable sur AUCUNE séquence, ni en démo ni sur un compte réel.
  'outreach_sequences',
  'outreach_sequence_steps',
  // #2366 / #2382 — le centre d'approbation de l'outreach : un message par vue
  //   (à valider, modifié, prêt, exécuté), leurs versions, leur journal, et un
  //   appel en rappel convenu. `seedOutreachMessages`.
  //   #3421 (lot G03, 30/09) — porte aussi la cause d'arrêt de la séquence
  //   `cancelled` (`subject_kind: 'sequence'`), lue par
  //   `OutreachService.cancelReasons` — `outreach_sequences.cancel_reason`
  //   N'EST PAS une colonne, c'est ce journal qui le porte.
  // #3894 — relance dans contact_list (Louis 16/10) : ces mêmes messages nourrissent la ligne « Relance préparée »
  //   de la carte contacts de Laura (`demo-contact-list-follow-up.spec.ts`) ; aucun « envoyé » n'est semé à dessein.
  'outreach_messages',
  'outreach_message_versions',
  'outreach_transitions',
  // #3702.9 (c89, 06/10) — un mandat d'envoi délégué FICTIF sur les messages validés d'exemple :
  //   l'écran « Délégation d'envoi » (Actions → Séquences) s'ouvre sur un mandat actif, borné,
  //   révocable. La démo n'envoie rien. `seedOutreachDelegation`.
  //   #4016 L5 (11/10) — + un mandat SIGNÉ par portée d'espace (séquences, Laura, relance d'impayé,
  //   suivi de rendez-vous) et un message de Laura qui ATTEND faute de mandat le couvrant (né avant
  //   la signature : `predates_mandate`). `seedScopedMandates`.
  'outreach_delegations',
  // Lot L-D1 (#4167, 14/10/2026) — « Actions › Automatisations » : quatre règles (trois allumées avec leur
  //   journal — le compteur « 30 jours » COMPTE ces lignes —, une éteinte jamais passée : « non mesuré »,
  //   jamais 0) et deux e-mails préparés par des règles, en attente dans « À traiter » (source
  //   « automatisation », le signal en « pourquoi maintenant »). Rien ne tourne en démo : le passage du
  //   matin saute les salles de démonstration. `seedAutomations` ; garde : `demo-automations.spec.ts`.
  'automation_rules',
  'automation_rule_firings',
  // Théo C automations-bibliotheque.N3 / automations-editeur.N2 — le JOURNAL DES ESSAIS (trois essais : un du brouillon,
  //   un de la règle qui tourne, un échec nommé) et une règle à brouillon testé (v2 prête à activer). `seedAutomations`.
  'automation_rule_trials',
  // Lot L-A (#4164) — la page « Aujourd'hui » (ex-Actions) lit les appels par ÉCHÉANCE : trois appels
  //   semés, un en retard (J-1), un du jour (J0), un de la semaine (J+2, le « rappel convenu »).
  //   `scheduled_at` est relatif au semis. Garde : `demo-today-queue-coverage.spec.ts`.
  'outreach_call_tasks',
  // #4739 (retour Bedros × Adel, 28/10) — « Mes angles » : deux angles écrits à la main par le commercial de
  //   démonstration (titre + contenu, génériques et fictifs), pour que « Contacter » s'ouvre sur sa liste
  //   d'angles personnels à côté des angles calculés. `seedUserAngles`.
  'user_angles',
  // #4737 — le journal d'envoi LinkedIn : une ligne « voie non ouverte » (aucune clé fournisseur), sans corps ni
  //   preuve. Rien ne part en démo, aucun appel fournisseur. `seedLinkedInMandate`. Le MANDAT, lui, est une ligne
  //   d'`outreach_delegations` (portée `linkedin_send`, 5 par jour, 30 jours) — fusion K2 du 29/10/2026, voir plus haut.
  'linkedin_send_log',
  // #2877 (#2385.4, recette 02/10) — la déclaration « Faux fait » du relecteur,
  //   semée sur la carte de Lorenzo Bini Smaghi : la recette démo est en lecture
  //   seule, le geste d'écriture y est refusé, donc la carte doit s'ouvrir déjà
  //   sur « Signalé : Faux fait ». Renversement ASSUMÉ de la raison « vide à
  //   dessein » du lot P06. `seedOutreachMessages`.
  'outreach_message_quality_flags',
  // #3419.1 — les variables annotées (valeur, source, date, confiance, usage
  //   externe) de la carte de Lorenzo Bini Smaghi : un fait établi et un fait
  //   « à confirmer », pour que le panneau « Variables » s'ouvre sur les deux
  //   états en lecture seule. `seedOutreachMessages`.
  'outreach_message_variables',
  // #2768 (#2369.9/.10/.7/.8/.14) — recette 28/09/2026 : « Comparer » et le
  //   NO-GO (Adopter/Refuser) ne se recettent qu'avec un template `active` et
  //   une proposition `pending` à l'écran. `seedMessageStyle`. Renversement
  //   ASSUMÉ de la raison « vide à dessein » posée le 25/09 (voir
  //   `DEMO_INTENTIONALLY_EMPTY` juste avant `message_style_imports`, resté
  //   vide, lui, pour une raison distincte : son corps ne se réexpose jamais).
  'message_style_templates',
  'message_style_rule_proposals',
  // #3427 — la bibliothèque d'exemples commerciaux, lue par l'onglet « Bibliothèque »
  //   de la base de connaissances : trois exemples FICTIFS (approuvé verbatim,
  //   approuvé inspiration, à revoir). `seedMessageLibrary`. #3437/#3438/#3440 : plus les
  //   séquences LinkedIn livrées (invitation acceptée, connexion dormante, recommandation,
  //   approche à froid — M1/M2/M3 par persona), mêmes textes et statuts qu'en production.
  //   `seedImportedSequences`.
  'message_library_entries',
  // #2155.13 — une liste « Mes cibles » avec son objectif, qui RÉFÉRENCE deux
  //   comptes et un contact semés. `seedTargetLists`.
  //   #3753.7 — plus une liste « Ciblage — tiering de l'ESN » (`source: 'import'`) :
  //   éléments tiérés A/B/C (`tier_label`), raison, hypothèses du vendeur
  //   (`seller_hypotheses`, colonnes neuves de `target_list_items`), dont un
  //   SANS tier. `seedTieredTargetList`.
  'target_lists',
  'target_list_items',
  // #4267 — « Comptes suivis » en tête de /mes-cibles : le responsable suit les TROIS premiers comptes du
  //   jeu (plafond `ACCOUNT_FOLLOW_MAX_PER_USER`), donc l'écran montre la liste, « Ne plus suivre » et la
  //   phrase du plafond — un « Ne plus suivre » fait alors apparaître le compte dans « Suivis
  //   précédemment », re-suivable en un clic. `seedAccountFollows`.
  //   N-SUIVIS (#4538) — l'onglet « Suivis » de /accounts liste ces trois comptes, un par ligne, avec le nombre de faits
  //   que la veille leur connaît. Les trois portent des faits (la démo n'a AUCUN compte mince, Louis 12/10) : le cas
  //   « suivi sans fait de veille » n'est donc pas démontrable en salle sans en fabriquer un ; il est gardé par
  //   `FollowedAccountsSection.test.tsx` (trois suivis sans aucun fait ⇒ trois lignes).
  'account_follows',
  // Théo A signaux (R22-ECRAN-a6) — la bibliothèque `/signals` : un signal ENREGISTRÉ (×2), un ÉCARTÉ et un à la CORBEILLE,
  //   posés sur des faits RÉELS des dossiers semés (clé = `signalStateKey` du libellé), donc les quatre onglets se
  //   remplissent. `seedSignalLibrary`.
  'signal_user_states',
  // Théo A signaux-veilles — « Mes veilles » : « Transformation & Data » (active, 3 jours, comptes suivis) et une veille
  //   EN PAUSE (5 jours) sur un compte non suivi — l'écran montre « Active », « En pause » et, sous l'échéance, le compte à suivre à nouveau (« À connecter », #4506).
  //   `seedSignalLibrary`.
  'signal_watches',
  // #2293.5 — un lot d'analyses : deux sous-jobs terminés qui RÉFÉRENCENT les
  //   dossiers semés, une ambiguïté à confirmer (`to_confirm`), et (#2283.32,
  //   épopée #2983) une identité restée ambiguë APRÈS l'analyse
  //   (`needs_resolution`) — les DEUX issues (résoudre ou exclure du lot)
  //   se voient. `seedAnalysisBatch`. #4611.9 — et un SECOND lot, lancé la veille (`seedWorkProgressBatch`,
  //   `DEMO_WORK_PROGRESS`) : une analyse rendue, une en cours, une en file et UNE EN ERREUR avec la raison de
  //   l'amont — de quoi lire « où en est le travail lancé ? » (`get_work_progress`) sans carte de zéros.
  'analysis_batches',
  'analysis_batch_items',
  // #2284.67-.69 — la correction d'identité versionnée : l'espace a confirmé
  //   l'entité résolue de SNCF (« c'est bien celle-ci »), sur des faits déjà
  //   semés. `seedEntityResolutionCorrection`.
  'entity_resolution_corrections',
  // #4188 (décision Louis 14/10/2026, issue #4188) — UN compte « déjà envoyé » (SNCF) vers le
  //   CRM FICTIF de la salle (`DEMO_ACCOUNT_CRM_EXPORT`, `seedAccountCrmExport`) : la fiche montre
  //   « Dans <CRM> », et un second envoi se lit « déjà présent » au lieu de recréer la société.
  //   Aucun lien vers une fiche : `crm_connections` reste vide à dessein, l'URL ne se devine pas.
  'account_crm_exports',
  // #4051 — « Importé le <date> depuis <fichier> » : UN import passé fictif (`DEMO_IMPORT_MARKS`, `seedImportMarks`) sur
  //   les comptes, contacts et consultants d'exemple — l'historique de chaque fiche rend l'origine. Les noms de fichier
  //   sont évidemment fictifs ; aucun fournisseur n'est nommé.
  'record_import_marks',
  // #3014 — le résumé de première synchronisation, déjà TERMINÉ (sept
  //   domaines, une ambiguïté nommée en langage clair). `seedIntegrationSyncRun` ;
  //   voir le docblock de `DEMO_INTEGRATION_SYNC_RUN` pour la raison (pas
  //   d'OAuth réel possible en démo).
  'integration_sync_runs',
  // #2455 — un contexte de travail ENREGISTRÉ, personnel (la salle a un seul
  //   occupant, toujours propriétaire — #1408). `seedWorkContext`.
  'work_contexts',
  // #2005.3 / #2087.14 — trois périmètres de travail (agence, BU sectorielle,
  //   nouvelle activité), et le visiteur rattaché aux DEUX premiers seulement :
  //   c'est ce qui rend « Rejoindre » et « Demander l'accès » visibles côte à
  //   côte. `seedBusinessUnits`.
  //   #3384.1 — SEEDÉE avec la couche que Laura lit dans son prompt (effectif,
  //   consultants, disponibles, objectif du trimestre) : les deux périmètres du
  //   visiteur la portent, le troisième reste « non renseigné » (garde dans
  //   `demo-seed.service.spec.ts`).
  'business_units',
  'business_unit_members',
  // #3413 « autre BU » (lot D2 02/10, décision Louis 02/10 : « semer un transfert en démo ») —
  // UNE ligne : le transfert de BU d'une mission (`DEMO_MISSION_BUSINESS_UNIT_TRANSFER`), écrit
  // comme le geste réel l'écrit. Le journal reste PAR AILLEURS vide à dessein pour tout le reste :
  // aucune correction de champ n'est pré-écrite (elle serait signée par un inconnu), et UNE ligne
  // sur un champ ne franchit pas le seuil « même champ corrigé plusieurs fois » de Laura.
  // #3219 (11/10) — + DEUX relevés `pipeline` du poste d'un siège anonyme, chacun avec sa portée
  // déclarée (`DEMO_CONTACT_SCOPE_DIFFERENCE`) : l'écart de portée du contrôle avant action d'un
  // contact. Ce ne sont PAS des corrections humaines — le seuil de Laura ne compte que `human`.
  'record_field_audit',
  'workspace_bridge_contacts', // les mises en relation deja enregistrees (bandeau « ce mois-ci » de l ancienne Memoire collective, ecran supprime le 14/10/2026 : la table reste ecrite par l API)
  'accounts', //           les 3 dossiers d'exemple (+ raw_analysis complet : sites, entités, signaux…)
  'account_partners', //   les ESN en place, sur le client FICTIF (tome 1 §14)…
  // …ET, depuis le 28/09/2026 (retour de démo de Théo : « Je n'ai identifié
  //   aucune ESN en place » sur Société Générale), les 5 sociétés employeuses
  //   que le CSV du compte cite au bloc 07 — noms de SOCIÉTÉS seulement, aucun
  //   nom de personne (`sg-csv-complement.ts`, `applySgPartnersAndNeeds`).
  //   Même appel : les pistes « Besoin détecté » du compte reçoivent leur
  //   source, leur périmètre et leur rôle (table `opportunities`, plus bas).
  // #2422.4 (27/09/2026, épopée #2869) — UN contrat-cadre signé sur Société Générale,
  //   fenêtre passée→future (`legalContractLifecycle` le lit `active`),
  //   rattaché à « BELLUM CONSEIL (société d'exemple) ». `seedDeliveryClient`.
  'legal_contracts',
  // #2422.6 (épopée #2869, lot R24 07/10/2026) — UN lien signé, RÉVOQUÉ à
  //   dessein (voir `DEMO_LEGAL_CONTRACT_UPLOAD_LINK_COVERAGE`) : le bloc
  //   Contrats montre un lien déjà généré sans qu'un visiteur ne puisse
  //   écrire dans la salle partagée depuis sa porte publique.
  //   `seedDeliveryClient`.
  'legal_contract_upload_links',
  // Épopée #2880 (lot V33, 28/09/2026) — le croisement expertise ↔ fondement/
  //   preuve : trois lignes (Cloud prouvé par une mission ET un consultant de
  //   la salle, Data déclaré et anonymisable) ; la projection des réponses
  //   plates complète l'audit à 3 états (Cybersécurité « à prouver »).
  //   `seedExpertiseGroundings` / `DEMO_EXPERTISE_GROUNDINGS`.
  'expertise_groundings',
  // (#2175.29, même lot : l'accord réel d'un positionné n'ajoute AUCUNE table —
  //   deux horodatages sur `consultants`, posés sur Marc Ouedraogo par
  //   `DEMO_AGREEMENT_CONFIRMED_CONSULTANT`.)
  // #2151.23 / #2151.61 (16/09/2026) — DEUX alertes de Découvrir sur le client
  //   FICTIF, et la seconde est là pour enseigner la règle : un genre urgent
  //   (`new_signal`) naît dans « Aujourd'hui », un genre ordinaire
  //   (`new_relationship`) n'y naît PAS et arrive par un seul autre canal
  //   (#2151.25). Une seule ligne aurait montré une alerte ; deux montrent que
  //   l'écran TRIE. Seedées par `seedAccounts` (au plus près des comptes
  //   qu'elles désignent), jamais sur une entreprise réelle du jeu.
  'discover_alert_events',
  // #2172 — une piste ÉCARTÉE, avec son motif : la salle montre ce qu'on fait
  //   du bruit, et que l'écartement ARCHIVE au lieu de supprimer.
  'qualification_lead_decisions',
  'territory_subscriptions', // un territoire suivi, pour que l'écran Marché ne soit pas vide
  // #2288.2 — trois reçus de vérification (`seedMarketVerificationReceipts`),
  // un frais, un vieilli, un corrigé à la main : sans eux, la colonne
  // « Vérification » de la prospection inversée serait uniformément « Non
  // vérifié » devant un prospect, et le seau « Vérifiés » resterait à « non
  // mesuré » sur tous les écrans de la salle.
  //
  // ⚠️ Les libellés viennent des COMPTES de la salle, pas d'une invention : un
  // reçu porte un libellé, et un libellé inventé est une ligne qu'aucun écran
  // ne peut montrer. Les quatre tables de la mémoire marché, elles, restent
  // vierges (voir le bloc ⚠️⚠️ ci-dessus) — la liste des environnements
  // compatibles reste le corpus RÉEL.
  'market_verification_receipts',
  //
  // ⚠️⚠️ LES QUATRE TABLES DE LA MÉMOIRE MARCHÉ NE SONT PAS ICI, ET ELLES NE
  // DOIVENT JAMAIS Y ÊTRE (#1633 / #1635, 08/09/2026).
  //
  // `market_company_signal`, `market_esn_client`, `market_company_stack` et
  // `market_ex_esn_at_client` sont PARTAGÉES entre tous les espaces
  // (`table-scopes.ts`, GA-16) : elles portent un fait de MARCHÉ, pas une
  // intention d'espace. Y semer trois lignes pour la démonstration les
  // injecterait dans le corpus que lisent des ESN CONCURRENTES — une donnée
  // inventée servie à de vrais clients comme un fait observé. C'est le refus le
  // plus net du produit, et il l'emporte sur la parité démo.
  //
  // Ce qui remplit la salle de démonstration est donc le corpus RÉEL : les
  // dossiers d'exemple portent des entreprises réelles, elles se rapprochent du
  // corpus comme n'importe quel compte, et le bloc « Couverture mémoire
  // marché » de l'écran Marché (`/accounts/marches`) dit la vérité sur
  // elles. Un compte non couvert s'y affiche « non résolu », ce qui est la
  // bonne réponse et non un trou de semis.
  //
  // ⚠️ Ce n'est pas une promesse en l'air : GA-258
  // (`architecture/market-memory-single-source-of-truth.spec.ts`) interdit à
  // TOUT fichier hors de `modules/market-memory/` — ce module de démonstration
  // compris — d'importer une de ces quatre entités ou d'écrire un de ces quatre
  // noms de table. Le semis ne PEUT pas les toucher ; l'interdit est tenu par
  // l'absence de chemin, pas par ce commentaire.
  // ⚠️ `territory_snapshots` n'est PAS dans cette liste, et ce n'est pas un
  // oubli : elle n'a pas de `workspace_id`, elle n'est donc pas purgée, et la
  // garde d'à côté refuse — à raison — qu'on classe une table non purgée.
  // Elle EST pourtant seedée depuis le 31/08/2026 : TROIS photos par territoire
  // (QUATRE pour la Haute-Garonne depuis #2206.42, pour que l'horizon
  // structurel de Marché se voie aussi), étiquetées `source = 'demo'`. Sans
  // elles, l'écran Marché s'ouvrait devant un prospect sur « Aucune photo
  // encore prise » et pas une seule tendance. Aucune lecture réelle ne les
  // voit — le balayage, la médiane de recrutement du référentiel et le tableau
  // d'un espace client lisent tous `'sweep'`.
  // TROIS mois de photos des neuf indicateurs de stock, dénominateurs compris.
  // Sans elles, les tuiles de `/pilotage` et les lignes de « Données à compléter » (`/pilotage`)
  // s'ouvrent sans aucune tendance — un prospect verrait neuf chiffres nus,
  // c'est-à-dire exactement l'écran d'avant ce chantier.
  //
  // ⚠️ Trois mois depuis le 31/08/2026, et c'est un MINIMUM de deux : la
  // variation se lit entre deux PHOTOS (`metricDelta`), donc un seul mois semé
  // ferait répondre « non mesuré » sur tous les écrans de la salle. Les dates
  // sont CALCULÉES au semis (`demo-stock-snapshots.ts`) : figées, elles
  // cesseraient d'être « le mois dernier » au premier changement de mois.
  'stock_snapshots',
  // L'OBJECTIF MENSUEL DE MARGE — trois mois, calculés au semis (31/08/2026).
  //
  // Sans lui, l'anneau « Taux de réalisation » de `/pilotage/finance` s'ouvre
  // sur « objectif non défini » : le comportement JUSTE, et un écran vide en
  // réunion. ⚠️ TROIS mois et pas un : l'écran ouvre sur le mois PRÉCÉDENT, donc
  // un objectif posé sur le seul mois courant laisserait l'écran d'ARRIVÉE sans
  // cible — le défaut qu'on ne voit qu'en changeant de période.
  'finance_margin_targets',
  // #2770.37 (11/10/2026) — LA POLITIQUE D'ÉQUIPE (`DEMO_TEAM_POLICY`) : Réglages › Équipe
  // s'ouvre sur une politique saisie (prospection 8 h 30 – 10 h, « 12:00–14:00 (lun.) » interdit — une plage
  // PAR JOUR —, aucun bloc après 18 h, 4 réunions/jour, 20 appels/jour), et « Organise-moi ma journée » la
  // cite et, un lundi, l'évite (`demo-team-policy-weekdays-coverage.spec.ts`). Vide, l'écran
  // dirait « aucune politique d'équipe saisie » devant un prospect — juste, et muet.
  'workspace_team_policy_settings',
  // LES DEUX SOCIÉTÉS DE L'ESN — semées depuis le 01/09/2026 (`demo-legal-entities.ts`).
  //
  // ⚠️ Elle était « vide à dessein », avec une raison qui se tenait tant que le
  // filtre par société du tableau de bord Finance était DÉSACTIVÉ : « un
  // sélecteur dont aucune mission n'a besoin ». Le filtre commande désormais
  // quatre lectures financières, et un prospect le trouverait éteint. Une
  // justification « vide à dessein » ne périme pas toute seule — celle-ci a
  // survécu à la livraison de la capacité qu'elle décrivait.
  //
  // Deux sociétés, et une mission volontairement NON rattachée : c'est ce qui
  // fait que la somme des deux est inférieure au total, et donc que le filtre
  // se voit.
  'legal_entities',
  // Le pipeline PARTENAIRE — quatre ESN fictives (tome 4 §11). La quatrième
  // existe pour une raison précise : elle porte une clause de non-sollicitation
  // DÉCLARÉE, la seule qui montre la seconde des deux gardes dures. L'autre est
  // portée par Talan, qui est aussi notre client. Sans ces deux lignes, une
  // démo montrerait un score partenaire dont aucun garde-fou ne se déclenche —
  // c'est-à-dire exactement ce que le produit faisait avant de les armer.
  'partner_relations',
  // #2887 (#2371.8) — UNE revue de CV, sur Talan / Talan Consulting (flux actif) vers
  // Camille Roussel (première du vivier) : le brief/TJM affichés viennent de
  // la vraie fiche consultant, jamais dupliqués en base ; `margin_share_pct`
  // porte une valeur déclarée (15 %), pour montrer aussi cette ligne plutôt
  // que son absence.
  'partner_cv_pushes',
  'access_facts', //       ce qui verrouille un compte et ce que l'entrée coûte (tome 1 §7)
  'account_entities', //   les entités du client FICTIF — la porte de filiale (tome 1 §7.1)
  'contacts', //           les interlocuteurs, avec leur portrait
  'personal_contacts', //  #2927 — « Mes contacts personnels » : deux contacts importés en portée Personnel, visibles de leur seul propriétaire
  'universal_import_jobs', //  Théo B c3.R4 — l'historique des imports : deux imports terminés (jamais un « en cours », leurs parts ne seraient plus au stockage) ; #5223 — dont un classeur à DEUX feuilles, bilan ventilé par feuille
  'universal_import_issues', //  …et leurs lignes écartées / doublons proposés, pour que « Voir le bilan » s'ouvre sur du contenu
  'attack_angles', //      les angles d'attaque du dossier
  'action_plans', //       le plan d'action par compte
  'consultants', //        le vivier (écran « Vivier » + matching besoin/profil)
  // #2818 — « CHERCHER HORS VIVIER » (sourcing externe de consultants), sur
  // l'onglet d'un besoin. `seedExternalSourcingExamples` (`demo-seed.service.ts`)
  // ajoute TROIS fiches, une par source du port (`external-sourcing-provider.ts`) :
  // un banc partenaire (`engagement_kind: 'sous_traitance'`, `partner_account_id`
  // posé sur l'ancre Groupe INTM — `DEMO_EXTERNAL_SOURCING_PARTNER_NAME`, #2972 : aussi celle d'Anthony Vasseur), une
  // candidature entrante (`kind: 'candidate'`), une fiche d'import CSV/ATS non
  // relue (`review_status: 'needs_review'`, `source: 'ats'`). Les trois portent
  // la compétence `DEMO_EXTERNAL_SOURCING_SKILL` (« Kubernetes »), celle du
  // besoin phare « Ingénieur infrastructure — socle conteneurisé du portail »
  // (SNCF) : sans elle, l'écran s'ouvrirait vide sur CE besoin, le même
  // défaut que l'onglet « Sites » cité dans le docblock de ce fichier. Aucune
  // des sept fiches de `DEMO_CONSULTANTS` ni des personas du lot N
  // (`DEMO_CV_IMPORT_CONSULTANTS`, ci-dessous) ne pouvait porter cette
  // démonstration — voir le docblock de `DEMO_EXTERNAL_SOURCING_CONSULTANTS`
  // pour la raison complète. Un besoin SANS « Kubernetes » parmi ses
  // compétences reste, lui, honnêtement vide sur les trois sources — comme en
  // production sur un vrai espace : ce n'est pas classé « vide à dessein »,
  // c'est le croisement réel qui n'a rien trouvé pour CE besoin-là.
  // #2195.12 — LA COLONNE « MANAGER » DU TABLEAU DES MISSIONS ne demande AUCUN
  // semis neuf : elle se DÉRIVE de deux tables déjà seedées, jamais stockée
  // elle-même. `consultants.manager_id` porte déjà deux managers du vivier
  // (Camille Roussel, sur les fiches de Hakim Barreau ET Salomé Dufour — voir
  // le commentaire `manager_full_name` dans `DEMO_CONSULTANTS`) ; Salomé
  // Dufour est affectée, encore aujourd'hui (`mission_assignments`, ci-dessous),
  // à « Industrialisation d’un cas d’usage de recherche — mise en production », une mission
  // qui finit sous trente jours et tombe donc dans la lentille d'échéance de `/missions` (l'écran `/missions/renouvellements` est supprimé, #3656).
  // `DeliveryService.managersOf` résout les deux tables au moment de la
  // lecture — la colonne « Manager » de la salle de démo affiche « Camille
  // Roussel » sur cette ligne, sans qu'un troisième champ ait été semé.
  // #2930 (point couvert #2191.38) — même raison pour « Besoin d'origine » sur
  // la Synthèse d'une mission : AUCUN semis neuf. `projectForMission`
  // (`demo-seed.service.ts`) rattache déjà chaque mission de la salle (sauf la
  // première, qui garde le projet gagné du client) à SON PROPRE projet
  // `opportunities` — `DeliveryService.opportunitiesOf` résout ce lien au
  // moment de la lecture, exactement comme le manager ci-dessus.
  // #2569.4 — les documents d'ORIGINE du lot N (import ZIP/messagerie) : deux
  // fichiers pour Inès Castel (doublon résolu automatiquement, #2569.2), un
  // pour l'exception Julien Fabre (#2569.3). Voir `DEMO_INTENTIONALLY_EMPTY`
  // ci-dessous pour la raison de ce déplacement — cette table y était classée
  // vide, et ne l'est plus DEPUIS CE LOT, à dessein.
  'consultant_documents',
  // #2185.51 — « Préparer un message » : UN brouillon seedé sur le référent
  // commercial de la salle (`owned_by_visitor`), jamais un envoi — aucune
  // colonne d'envoi n'existe sur cette table. `seedVivier`.
  'talent_prepared_messages',
  'user_actions', //       l'historique d'activité (+ compteurs du tableau de bord)
  // #4158 (lot L4) — la liste « ne pas contacter » (une exclusion de domaine, avec motif et
  // auteur) et l'équipe de compte (le collègue fictif sur Société Générale). SEEDÉES SEULEMENT
  // quand la salle a un collègue fictif (`demo-team-guardrails-seed.ts`) : les collègues
  // portent une clé étrangère dure vers `auth.users`, ils viennent du lot L2. Sans collègue,
  // aucune ligne — jamais une trace attribuée à quelqu'un qui n'existe pas.
  'workspace_do_not_contact',
  'account_team_members',
  // #4996 L7 — la ZONE du collègue fictif sur Société Générale (périmètre : deux entités). Même condition que
  // l'équipe de compte : seedée seulement quand la salle a un collègue (`seedTeamGuardrails`). Purgée au reset.
  'account_team_scopes',
  'member_objectives', //  les objectifs du mois (cockpit « Pilotage »)
  'objective_proposals', //  Théo D — UNE cible proposée à Léa, en attente (`demo-team-objectives-seed.ts`)
  // L'Action Center ne s'ouvre pas vide — une exécution TERMINÉE, et (#1952) un
  // travail long EN COURS avec son avancement MESURÉ : le suivi d'une analyse
  // lancée depuis la conversation. Sans le second, une démonstration ne montre
  // jamais à quoi ressemblent les minutes pendant lesquelles un travail tourne.
  // #1952.17 — et un travail ARRÊTÉ : l'issue « annulée » n'existait pas, un
  // arrêt volontaire se repliait sur l'échec et invitait à relancer, donc à
  // redébiter. Un état terminal qu'on vient de réparer et que la démonstration
  // ne montrerait pas se redécouvre en réunion.
  //
  // ⚠️ Cette ligne ne couvre QUE l'Action Center. Une carte du copilote proposée
  // EN DIRECT — pendant que le visiteur parle à Laura, ce que `copilot_never_used`
  // ci-dessous (`DEMO_LAURA_BUBBLES_SILENT`) présente justement comme LA
  // démonstration — n'apparaîtra JAMAIS dans le fil, quel que soit ce qui est
  // seedé : `CopilotCardService.proposeTurn` coupe AVANT toute écriture dès que
  // l'espace est une salle (`isDemo` → `{ cards: [], counts: { demo: true } }`,
  // I6/D5). Ce n'est pas un oubli de semis : une carte est CLIQUABLE, et un clic
  // réserve des crédits ou dispatche une écriture RÉELLE (brouillon d'e-mail,
  // mise à jour CRM) — inacceptable dans une salle prêtée `DEMO_LEASE_TTL_MINUTES`
  // à un visiteur différent à chaque fois. Testé trois fois, pas seulement ici :
  // `copilot-card-turn.spec.ts` (« I6 — en démonstration, aucune carte n'est
  // persistée »), `workflow-runner.service.spec.ts` (« I6 / D5 — en
  // démonstration, aucune réservation ») et `credit-invariants.simulation.spec.ts`
  // (démo : zéro réservation, zéro débit, zéro écriture externe). Ce que le
  // visiteur voit à la place : les lignes ci-dessus, déjà EXÉCUTÉES — à quoi
  // ressemble une carte une fois l'action passée, sans qu'un clic dans une salle
  // publique ne puisse en déclencher une nouvelle.
  'workflow_runs',
  // #2946 — RELU le 27/09/2026 : une SEULE demande `pending`, posée EXPRÈS
  // pour que la tâche `source = 'action_os_approval'` (le pont Action OS →
  // Tâche) ait un exemple en salle — sans elle, `tasks` restait « seedée »
  // dans l'ensemble, mais CE type de tâche précis n'existait nulle part.
  // ⚠️ Ne contredit PAS le paragraphe I6/D5 ci-dessus : le run qui la porte
  // n'a JAMAIS ses `intents` (colonne laissée `null`, comme un run créé sans
  // être passé par `evaluate()`) — `decideApprovalRequest` (D2) refuse
  // proprement un `approve` sur une demande sans `intents` (« relancez le
  // workflow »), et un `reject` ne dispatche jamais rien : aucun outil externe
  // n'est jamais atteint, quelle que soit la décision cliquée. Voir
  // `demo-seed.service.spec.ts` (#2946) pour la preuve du pont réellement
  // tenu (un run réel, une demande qui le porte, une tâche qui le rend
  // visible).
  'approval_requests',
  'rag_documents', //      la base de connaissance : méthode, référence, grille tarifaire
  // #3750.8 — les morceaux citables du classeur à onglets de la salle (« Brand
  // Messaging — 07 · Objections ») : un par onglet, `seedRagDocumentChunks`.
  'rag_document_chunks',
  // Les notes de compte et de contact (fiche « Notes », socle CRM), et — depuis
  // #2151.59 — une note sur un candidat DÉCOUVRIR (`entity_type =
  // 'discover_candidate'`, `DEMO_DISCOVER_CANDIDATE_NOTE`) : même table, même
  // geste, un SIREN scripté stable au lieu d'une ligne de compte.
  'notes',
  // CE QUE LAURA GARDE EN TÊTE. Elle était « vide à dessein » — « la mémoire
  // longue se remplit en épinglant une réponse : c'est le geste montré, pas un
  // acquis » — et c'était vrai tant que la mémoire ne vivait que dans la barre
  // du copilote, où l'on passe justement pour épingler. Réglages › Mémoire de
  // Laura (tome 6 §12.1) est un écran qu'on ouvre pour VÉRIFIER : vide, il
  // répond « rien » à « qu'est-ce qu'elle sait de moi ? », et ne montre ni la
  // capacité ni le geste qui la rend acceptable — retirer une ligne.
  'memory_pinned_facts',
  // #1916.23 — l'HISTORIQUE d'un élément : sans lui, le bouton « Historique »
  // de Réglages › Mémoire n'ouvrirait que la ligne de création devant un
  // prospect, et la capacité (qui a changé quoi, et quand) resterait invisible.
  'memory_fact_events',
  // Les projets : matérialisés depuis `raw_analysis` par la MÊME projection
  // déterministe qu'en production, puis quelques-uns avancés dans le pipe. Sans
  // eux, l'écran Projets — le pivot du produit — s'ouvrirait vide devant un
  // prospect, exactement ce que la garde de couverture existe pour empêcher.
  'opportunities', //      les projets du pipe (table historique du pivot Projet)
  // Six rôles recherchés, dans SIX colonnes différentes du kanban des besoins.
  // Un seul, dans un seul état, laissait neuf colonnes vides : le pied
  // contextuel de chaque colonne changeait sans que personne puisse le voir
  // changer. Les quatre colonnes qui restent vides ont leur raison écrite dans
  // {@link DEMO_NEED_KANBAN_COLUMNS_INTENTIONALLY_EMPTY}.
  'project_needs', //      les rôles recherchés d'un projet, pour que le pipe s'ouvre rempli
  // Deux offres détectées en attente d'un geste : c'est la distinction que
  // l'écran sert à montrer — ce que l'outil a VU n'est pas encore dans le pipe.
  'need_proposals',
  // Les divisions du client (PDF 2 §2). DÉRIVÉES des libellés que les contacts
  // du jeu portent déjà — rien n'est inventé — pour que la colonne « Entité »
  // ne s'ouvre pas vide alors que les contacts, eux, nomment leur division.
  'account_entities', //   les BU et filiales d'un compte, et le rattachement des contacts
  // La timeline : sans elle, l'onglet « Historique » d'un dossier de
  // démonstration s'ouvre sur « aucune activité » — exactement la question
  // qu'un prospect pose (« et l'historique de mes échanges ? ») et exactement
  // le vide que cette garde existe pour empêcher.
  //
  // ⚠️ L'ISSUE D'UN APPEL (N11-B, 30/08/2026) — `call_outcome` existait sans
  // qu'aucune activité de démonstration n'en porte : l'unique appel de la
  // salle (SNCF, « Point sur le besoin publié ») aurait affiché pour toujours « Issue
  // non renseignée », un état qui existe déjà par défaut et qui n'aurait donc
  // rien montré de neuf. Il porte maintenant `connected_qualified` — cohérent
  // avec l'e-mail qui suit trois jours plus tard et confirme un budget. Un
  // SECOND appel (Société Générale, sans issue) garde l'autre moitié VISIBLE :
  // un appel qu'on vient de loguer sans prendre le temps de le qualifier est
  // le cas le plus fréquent en clientèle, et « Issue non renseignée » doit
  // pouvoir s'afficher sur autre chose que l'ABSENCE de tout appel.
  // ⚠️ #2124.59 / .64 / .65 (14/09/2026) — CE QUE LA SALLE MONTRE DU FILTRE, ET
  // CE QU'ELLE NE MONTRE PAS. La timeline se filtre désormais par CATÉGORIE
  // (Interactions · Actions · Projets · Analyses). Les activités semées sont
  // toutes des ÉCHANGES — mails, appels, réunions — donc « Interactions » est
  // pleine et les trois autres affichent « Aucun échange de ce type ». C'est
  // vide À DESSEIN, et deux fois plutôt qu'une : une activité de nature
  // `analysis`, `task` ou `workflow` n'est pas une donnée qu'on SÈME, c'est la
  // TRACE d'un geste — lancer une analyse, cocher une tâche — et le visiteur
  // fait ces gestes lui-même dans la salle ; en pré-écrire montrerait un
  // historique d'actions que personne n'a faites. Le filtre lui-même se
  // démontre : il se clique, et il dit honnêtement qu'il n'a rien trouvé.
  // Le RÉSULTAT d'une ligne (#2124.64) suit la même logique — l'issue d'un
  // appel est semée (voir juste au-dessus), le `verdict` d'un envoi ne l'est
  // pas : rien n'est envoyé depuis la salle. Le lien vers le contact rattaché
  // (#2124.65), lui, est VISIBLE : les activités semées citent leur contact.
  // ⚠️ LA PORTE DE DÉCISION DANS L'HISTORIQUE (#2124.68, 14/09/2026) — la table
  // était classée SEEDÉE et le restait, mais aucune de ses lignes n'était une
  // trace de porte : le catalogue de libellés qui empêche `account_priority —
  // accept` de s'afficher en clair n'avait donc rien à traduire en salle. Une
  // ligne `gate_decision` sur Société Générale le montre depuis ; la garde dédiée est
  // `demo-timeline-subject-coverage.spec.ts` — même famille que l'issue
  // d'appel juste au-dessus : une capacité neuve DANS une table déjà couverte.
  'activities', //         les échanges du dossier (mails, appels, réunions) + une porte tranchée
  // #2392 — la CLÔTURE DE FIN DE JOURNÉE de Laura lit cette même table : une
  // tâche cochée et une abandonnée (avec raison) le jour du seed, et une promesse
  // créée le jour même, remplissent ses sections Résultats / Blocages /
  // Engagements (`DEMO_TASKS`, `closed` / `createdDaysAgo`).
  'tasks', //              ce qu'il reste à faire, dont UNE en retard (écran « Aujourd'hui »)
  // Les compétences TYPÉES du vivier, dérivées de la stack des consultants
  // d'exemple : sans elles, le panneau « Compétences » d'une fiche talent
  // s'ouvre vide alors que la stack, elle, est remplie — un écran qui se
  // contredit lui-même sous les yeux d'un prospect.
  'consultant_skills', // niveau, ancienneté et source par compétence
  // #2328.9/.10/.22/.23 (épopée #2793) — l'expérience structurée qui PROUVE
  // une compétence. Sans elle, le badge « Preuve » d'une compétence seedée
  // en source `mission` (Kubernetes chez Nadia Berrada) n'aurait rien à
  // citer — le panneau « Compétences » afficherait une source prouvée SANS
  // preuve nommée, la même incohérence que `consultant_skills` ci-dessus.
  // #3935 (lot P03, 09/10) — les expériences d'Inès Castel, lues dans son CV, portent
  // leurs dates À L'ANNÉE (`date_*_precision = 'year'`) : la fiche montre
  // « 2023 → 2025 » en salle, la précision gardée au lieu d'une période vide.
  'consultant_experiences', // l'expérience et le projet nommés qui prouvent une compétence
  // La moitié « après la signature », portée par un client FICTIF
  // (`DEMO_DELIVERY_CLIENT`). Sans elle, Positionnements, Missions et Prêt à
  // facturer s'ouvraient vides devant un prospect : la moitié ATS du produit ne
  // se montrait pas. Le client est fictif et non l'une des cinq sociétés
  // réelles, parce qu'afficher « mission en cours chez X » affirmerait une
  // relation commerciale qui n'existe pas.
  // Trois positionnements CLOS sur l'affaire gagnée — un pris, un refusé avec
  // motif, un SANS RETOUR — et quatre EN COURS rattachés à un rôle précis par
  // `need_id`. Ces quatre-là sont ce que compte `shortlist_count` : la colonne
  // Shortlist de la liste des besoins ne lit PAS la table `shortlists` (vide à
  // dessein) mais `COUNT(*) FROM submissions WHERE need_id = need.id`. Sans
  // `need_id`, la colonne affichait « aucune » sur tous les besoins de la salle.
  //
  // ⚠️ VÉRIFIÉ le 30/08/2026 à l'arrivée de l'onglet « Positionnements » d'une
  // fiche besoin (`NeedPositioningsTab`, commit `feat(web): la fiche d'un
  // besoin porte enfin ses onglets`) : AUCUN semis supplémentaire n'était
  // nécessaire. Le tab réutilise `useSubmissions({ projectId })` filtré côté
  // CLIENT sur `Submission.needId === need.id` — exactement le `need_id`
  // seedé ci-dessus depuis le 28/08/2026. Les six besoins ouverts du client
  // d'exemple portent donc déjà les DEUX états que l'onglet doit savoir
  // montrer : « Ingénieur infrastructure — socle conteneurisé du portail »
  // (deux positionnements EN COURS, `needId` renseigné) et « Ingénieur
  // systèmes — supervision des systèmes temps réel » (`shortlist: []`, aucun
  // profil — l'onglet doit écrire « Aucun profil positionné sur ce besoin »).
  // Le besoin PHARE (`DEMO_FLAGSHIP_NEED`, sur le pipe des cinq dossiers
  // réels) reste volontairement SANS positionnement rattaché : lui en
  // attribuer un referait la contradiction « shortlist prête / zéro
  // positionné » que le lot du 28/08 a délibérément évitée en le repassant à
  // `to_match` — voir la raison écrite là-bas avant de la défaire.
  'submissions', //             les positionnements, clos comme en cours
  'submission_feedback', //     le retour client structuré des deux qui ont eu une réponse
  // #2335.5 — le retour CONSULTANT, sur le positionnement accepté (Yanis
  // Berthier) : un bloc SÉPARÉ du retour client juste au-dessus, jamais fusionné.
  'submission_consultant_feedback',
  // #2329.35-.41 (épopée #2948) — le consentement à représenter PAR COMPTE,
  // sur les deux mêmes talents que les positionnements ci-dessus : Yanis
  // Berthier (autorisé, sans restriction) et Salomé Dufour (refus EXPLICITE
  // pour ce compte, avec restriction nommée) — le chemin « ok » ET le chemin
  // qui bloque réellement la porte G4, chacun visible en démonstration.
  'consultant_account_consent',
  'interviews', //              l'entretien du profil retenu
  // ⚠️ SEEDÉS SUR UN SEUL RÔLE SUR CINQ, et la raison de l'ancien « vide à
  // dessein » tient toujours pour les quatre autres : lancer un rapprochement
  // EST le geste que la démonstration veut montrer, et le pré-remplir partout
  // afficherait des exécutions que personne n'a faites. Le rôle unique qui en
  // porte un existe pour l'autre moitié, celle qui manquait : le verdict
  // « go / no-go » d'un besoin lit le dernier rapprochement DÉJÀ exécuté, et
  // sans aucun il s'ouvrait sur « je manque de données » — vrai, et invendable.
  // Les quatre rôles restants montrent exactement cet état, absences nommées.
  'match_runs', //              UN journal de rapprochement, sur le rôle phare
  'match_run_entries', //       ses trois profils retenus — dont un libre APRÈS le démarrage
  // #2916 / #2399.2 (c93) — ce même run est marqué « lancé automatiquement »
  // par la routine « Matcher un besoin entrant » : la fiche du rôle phare le
  // montre. Les quatre autres rôles n'en portent pas, et leur fiche se tait.
  'need_auto_matches', //       le run du rôle phare, écrit à l'arrivée du besoin
  // Rattachés, jamais fabriqués : les contacts viennent de l'analyse, et AUCUN
  // n'a le rôle `decideur`. C'est l'état « rang connu · décideur manquant » que
  // l'axe « accès » du verdict existe pour montrer — une attention MESURÉE, qui
  // n'est ni un axe vide ni un refus.
  'project_contacts', //        le comité de l'affaire, sans décideur identifié
  // Cinq missions et non deux : deux prêtes à facturer (dont une avec son écart
  // de jours EXPLIQUÉ), une bloquée faute de relevé, un forfait qui n'en attend
  // aucun, et une TERMINÉE — l'après-mission, que le jeu ne montrait nulle part
  // et sans lequel « REX en attente » restait vide (voir `rex_entries`).
  // NEUF depuis le 29/08/2026 : la neuvième est CLOSE et bornée à plus de trois
  // mois, hors de la fenêtre « Prêt à facturer » — elle existe pour porter le
  // canal `portage`, sans quoi la cinquième ligne de « Marge par canal »
  // s'ouvrirait vide devant un prospect.
  // ⚠️ **Depuis le 30/08/2026 (D200), cette table est aussi ce que lit le
  // DOSSIER d'une mission** (`/missions/$missionId`). Le dossier n'ajoute
  // AUCUNE table et AUCUNE lecture : il passe par `GET /delivery/missions?id=…`
  // — la même que la liste — et ses cinq onglets interrogent les quatre routes
  // déjà seedées ci-dessous (`mission_assignments`, `mission_commercial_terms`,
  // les scores calculés à la lecture, et la timeline du compte porteur). Les
  // neuf missions de la salle ouvrent donc un dossier REMPLI, chacune. C'est la
  // raison pour laquelle la parité démo de ce lot ne demande aucun semis neuf,
  // et non un oubli : la question a été posée, et sa réponse est écrite ici.
  //
  // ⚠️ LES TROIS CONTACTS DU PANNEAU LATÉRAL (30/08/2026, PDF-22 §7) — le
  // consultant vient de `mission_assignments` (déjà seedée), le chargé
  // d'affaires de `owner_id` (déjà posé sur les NEUF missions, résolu sur le
  // même profil que le reste de l'espace de démonstration) ; seul
  // `cra_contact_id`, colonne NEUVE, demandait un semis — posé sur
  // « Fiabilisation plateforme — renfort exploitation », résolu sur le même
  // contact que la facturation (un cas réel, pas une règle du produit). Les
  // huit autres missions restent sans contact CRA désigné, l'état normal en
  // fin de démonstration : « GET /delivery/missions/:id/panel » le rend en
  // `null`, jamais un nom inventé.
  'missions',
  // Les affectations portent la vie du vivier : une qui finit sous trente jours
  // (Salomé Dufour), une sans date de fin (Inès Kaczmarek), et une TERMINÉE
  // depuis plus de deux mois (Camille Roussel, en intercontrat). Sans elles, la
  // fiche talent annonçait des disponibilités qu'aucune donnée ne confirmait.
  'mission_assignments', //     qui est affecté, à quelle charge, sur quelle fenêtre
  // L3 Pilotage › Staffing (14/10/2026) — les congés de deux consultants (un à venir, un déjà pris ce mois-ci) :
  // la capacité d'une semaine baisse et le TACE retire ces jours de son dénominateur (`seedStaffing`).
  'consultant_absences',
  // #2338 / #2409 — les gestes de démarrage d'UNE mission pas encore démarrée
  // (`DEMO_START_READINESS_MISSION`) : accord client + bon de commande
  // confirmés, accord consultant manquant — la fiche montre « Accords à
  // confirmer », « Bloqué » et nomme le manque (`seedStartReadinessMission`).
  'mission_start_checks',
  // Le coût chargé SAISI (arbitrage n°5), le canal, le bon de commande — et
  // depuis le 29/08/2026 les deux colonnes qui étaient LUES et écrites nulle
  // part : `requires_po` (une mission porte le bloqueur « bon de commande exigé
  // et absent », deux l'exigent et l'ont) et `partner_commission_daily_cents`
  // (DEUX missions intermédiées et chiffrées — une `partner`, une `portage` —
  // sans lesquelles le « coût de l'intermédiation » du pilotage reste `null`
  // dans la salle et la ligne du portage reste muette).
  // QUATRE des cinq canaux sont portés : direct, partenaire, portage, et le
  // canal non renseigné. `subcontracting` ne l'est pas, à dessein — deux canaux
  // intermédiés chiffrés font déjà la démonstration de l'écart.
  //
  // ⚠️ LA DATE, LE MONTANT ET LE VOLUME DU BON DE COMMANDE (30/08/2026) —
  // `po_issued_on` / `po_amount_cents` / `po_volume_days`, trois colonnes
  // NULLABLES qui existaient sans être écrites nulle part, y compris en
  // démonstration : l'onglet « Conditions commerciales » n'aurait montré que
  // « Volume non renseigné » sur les neuf missions de la salle, jamais la
  // barre de consommation qui EST le sujet du lot. `PoConsumptionBlock`
  // (`MissionDetailTabs.tsx`) a trois états DISTINCTS, et les trois se voient :
  //  - « Fiabilisation plateforme — renfort exploitation » porte les trois
  //    colonnes (30 jours, 18 600 €) ET un relevé validé de 18 jours → la
  //    BARRE s'affiche, à 60 %, douze jours restants ;
  //  - « Refonte des applications voyageurs — forfait » porte les trois colonnes
  //    (45 jours, 27 000 €) mais AUCUN relevé (un forfait n'en produit pas) →
  //    « Consommation non mesurée », jamais « 0 % consommé » ;
  //  - « Industrialisation d’un cas d’usage de recherche — mise en production » garde
  //    SEULEMENT son numéro de bon de commande, comme avant ce lot → « Volume
  //    non renseigné », l'état le plus fréquent au tout début d'un contrat.
  // Recompté sur le jeu, avec la MÊME fonction que le serveur
  // (`poConsumption`), par `demo-mission-po-coverage.spec.ts`.
  //
  // ⚠️ LE DÉLAI DE RÈGLEMENT (30/08/2026, panneau latéral de planification,
  // PDF-22 §7) — `payment_terms_days` / `payment_terms_basis`, deux colonnes
  // NULLABLES neuves. « Fiabilisation plateforme — renfort exploitation »
  // porte « à 60 jours fin de mois », l'exemple même de la fiche de lecture ;
  // les huit autres missions restent SANS délai — « conditions de règlement
  // non renseignées », l'état le plus fréquent en tout début de relation
  // commerciale, et un état que le produit sait déjà nommer.
  //
  // ⚠️ LE MOTEUR DE MARGE (#2420, 17/09/2026) — `cost_source` / `currency` /
  // `cost_breakdown` / `cost_recorded_rate_cents`. Les QUATRE sources sont
  // semées (salarié importé avec contribution, forfait, partenaire, freelance),
  // et les TROIS états d'affichage se voient : « mesurée » sur le salarié,
  // « partielle » sur le forfait (projection à terminaison), « non mesurée »
  // sur les deux missions sans coût. « Reprise de la volumétrie tarifaire »
  // porte un coût saisi à 560 € quand le TJM en vaut 580 : l'alerte « tarif
  // changé ». Recompté par `demo-mission-margin-engine.spec.ts`.
  //
  // ⚠️ #2422.7 (25-26/09/2026) — `poOtherMissions` (les AUTRES missions qui
  // partagent le même `po_number`) est une DÉRIVATION de cette même table, pas
  // une colonne : elle ne demande pas d'entrée séparée ici. Elle rend `[]` sur
  // les neuf missions de la salle, VIDE À DESSEIN — aucune paire de missions
  // de ce compte ne partage aujourd'hui un `po_number` (chacune est UNIQUE, et
  // « Cartographie du parc applicatif — lot d'options » est délibérément SANS
  // bon de commande, #2195.50). C'est l'état RÉEL et le plus fréquent — un bon
  // de commande couvre le plus souvent UNE seule mission — donc `[]` n'y est
  // pas une lacune de démonstration. Fabriquer une paire pour montrer l'AUTRE
  // état (bon de commande-cadre partagé) toucherait une calibration existante
  // documentée ailleurs dans ce fichier (durées, seuils de bulle, compteurs
  // exacts par consultant) : reporté à un lot dédié à la donnée de démo, pas
  // tranché ici sans mesurer l'impact sur les gardes déjà vertes.
  'mission_commercial_terms',
  // Les FRAIS de mission (30/08/2026) — la ligne que la marge ignorait avant ce
  // lot. Deux lignes (500 € au total) sur la première mission de la salle
  // seulement : les huit autres restent SANS frais, à dessein, pour que l'état
  // le plus fréquent — « marge hors frais » — reste visible à côté de celui que
  // ce lot ajoute. `GET .../terms` rend alors `expensesTotalCents: 50000` et
  // `marginWithExpenses` un chiffre distinct de `margin`, sur cette mission-là.
  'mission_expenses',
  // #2783 (02/10/2026) — les AVENANTS (#2423) : deux lignes sur la première
  // mission de la salle, un ACCEPTÉ (TJM) et un SIMULÉ (`proposed`, date de
  // fin), tous deux à effet dans les 90 jours — de quoi remplir la ligne « dont
  // avenants » du prévisionnel par horizon, accepté séparé de simulé. Données
  // FICTIVES de démonstration (règle n°9), comptées et jamais chiffrées.
  'mission_amendments',
  // #2412 (23/09/2026) — le double pouls de satisfaction (client/consultant)
  // d'une mission active, désormais AFFICHÉ ET SAISISSABLE depuis l'onglet
  // « Synthèse » de la fiche mission (`MissionFeedbackSection`, OverviewTab).
  // Deux entrées, une par rail, sur LA MÊME mission (« Fiabilisation
  // plateforme — renfort exploitation ») : le client est ravi, le consultant
  // est sous tension — les deux rails DIVERGENT à dessein (#2412.8), la raison
  // même pour laquelle ils ne se fusionnent jamais en une moyenne. Les neuf
  // autres missions restent SANS entrée : un rail sans avis dit « pas encore
  // d'avis », jamais 0. `seedMissionFeedback`. #2408.16/.33 (L15) — chaque
  // entrée porte son NIVEAU déclaré (client « bonne », consultant « basse ») :
  // la colonne Satisfaction et l'exception « Satisfaction basse » de /missions
  // sont ainsi remplies en démo ; les autres missions lisent « non mesurée ».
  'mission_feedback',
  // Les factures FOURNISSEUR (30/08/2026) — distinctes de la facturation
  // CLIENT (`invoice_readiness`). La première, `pending`, est sur la MÊME
  // mission que les frais : les deux sources de coût s'amortissent ENSEMBLE
  // dans `marginWithExpenses`, et cette mission-là est celle qui le montre.
  // ⚠️ DEUX depuis le 31/08/2026, et la seconde est NÉCESSAIRE, pas
  // décorative : elle justifie le paiement sortant « à valider » de
  // « Industrialisation d’un cas d’usage de recherche ». Sans elle, cette ligne
  // s'afficherait « en attente validation » à côté de « aucune facture ne
  // chiffre encore ce paiement » — un état que le produit REFUSE de créer
  // (`OutgoingPaymentsService.generate` exige la facture), donc une salle qui
  // montrerait une donnée que le code ne peut pas produire. Six missions sur
  // neuf restent sans aucune source de coût ajoutée : « marge hors frais »,
  // l'état le plus fréquent en clientèle, reste visible à côté.
  'supplier_invoices',
  // #2196.31 — l'exception « non applicable » d'un relevé. UNE ligne, sur le
  // dernier mois d'une mission en régie TERMINÉE sans relevé
  // (`DEMO_TIMESHEET_EXCEPTIONS`) : le mois se lit « non requis » avec qui,
  // quand et pourquoi, et la pose est au journal du compte. Le mois précédent
  // garde, lui, son état « manquant » sur une autre mission — les deux se
  // voient. Vérifié par `demo-seed.service.spec.ts` (#2196.31).
  'mission_timesheet_exceptions',
  // Les PAIEMENTS SORTANTS vers le consultant (31/08/2026) — le miroir de
  // `invoice_readiness`, qui suit l'argent ENTRANT.
  //
  // QUATRE lignes semées sur les dix missions, et les six autres restent
  // volontairement sans ligne : `non_genere` est un état DÉDUIT d'un mois sans
  // paiement, jamais semé. En créer une par mois et par consultant « au cas
  // où » ferait mesurer notre propre semis au compteur « paiement non
  // généré » de la maquette Finance.
  //
  // Les quatre portent quatre états DISTINCTS, chacun choisi pour ce qu'il
  // rend visible, et chacun COHÉRENT avec le relevé de sa mission :
  //  - « Fiabilisation plateforme » → `valide` et EN RETARD de 9 jours, une
  //    relance déjà consignée. C'est l'état dominant de la maquette, et la
  //    SEULE ligne que « Relancer les paiements » peut toucher : sans elle, le
  //    bouton de relance en masse s'ouvrirait désactivé devant un prospect ;
  //  - « Industrialisation d’un cas d’usage de recherche » → `a_valider`, relevé validé et
  //    facture rattachée. C'est le seau « À valider » et la ligne dont l'action
  //    suivante est un vrai bouton ;
  //  - « Convergence des applications temps réel » → `rejete`, avec son MOTIF, et
  //    pour la même raison que son relevé l'a été. C'est le seul état qui
  //    n'entre dans aucune des quatre tuiles, et sans lui le compteur « hors de
  //    ces totaux » n'aurait rien à annoncer ;
  //  - « Reprise de la volumétrie tarifaire » → `paye`, avec un montant SORTI
  //    (10 000 €) distinct du DÛ (11 600 €) — le seau « Payés » de la
  //    maquette, resté vide jusqu'ici : `paye` s'atteint en UN clic depuis
  //    `valide` (« Marquer payé »), et aucune TROISIÈME mission de la salle ne
  //    portait un relevé validé sans être déjà prise par `valide` ou
  //    `a_valider` — toutes deux nécessaires à « Prêt à facturer ». Une
  //    DIXIÈME mission a donc été ajoutée plutôt que d'en sacrifier une —
  //    ACTIVE et SANS date de fin (`ends_on IS NULL` couvre le mois précédent
  //    quel que soit le jour de la démonstration), la DEUXIÈME concurrente
  //    d'Inès Kaczmarek : Yanis Berthier en porte déjà deux dans ce même jeu,
  //    ce n'est donc pas un cas nouveau. Une `ended` bornée à douze jours a
  //    été essayée et REFUSÉE par `demo-seed.service.spec.ts` — toute mission
  //    close de la salle doit rester à plus de soixante-et-un jours, pour ne
  //    jamais réapparaître comme un faux bloqueur de facturation.
  // Recompté par `demo-outgoing-payments-coverage.spec.ts`.
  //
  // ⚠️ Aucune coordonnée bancaire, dans la salle comme en production : la table
  // n'en a pas. Bellum SUIT le paiement, il ne le déclenche pas.
  'outgoing_payments',
  // Le dossier d'ADMINISTRATION DES VENTES (31/08/2026). DEUX lignes sur neuf
  // missions, et les sept autres SANS ligne, à dessein : c'est ce contraste qui
  // remplit l'écran `/missions/adv`. La mission qui finit dans 28 jours porte un
  // dossier COMPLET — sans lui, la file ne montrerait que des lignes rouges et
  // un prospect conclurait que rien ne se clôture ; celle qui n'a pas de date de
  // fin en porte un À MOITIÉ FAIT ; les sept autres allument les quatre motifs
  // ADV, dont deux ajoutent `missing_po` et `missing_billing_contact`.
  //
  // ⚠️ Les deux missions choisies sont dans la fenêtre de RENOUVELLEMENT (l'une
  // à J-28, l'autre sans date de fin, donc `unknown`) et non dans le mois
  // courant : un semis daté « ce mois-ci » sortirait de la période un jour sur
  // deux, et l'écran s'ouvrirait vide en réunion sans que la CI le voie.
  'mission_adv_records',
  // TREIZE mois clos et facturés sur le client d'exemple — D42 (Louis,
  // 28/08/2026). La table était classée « vide à dessein » au motif que
  // « l'état de facturation se RECALCULE à chaque lecture » : c'est vrai des
  // BLOQUEURS et du montant préparatoire, et FAUX de la facture elle-même.
  // `RevenueService.dso()` lit la TABLE — en démonstration il ne lisait rien,
  // et la tuile « Délai de paiement » du pilotage affichait pour toujours
  // « non mesurable — 0 facture sur les 10 nécessaires » : une capacité
  // livrée, juste, qu'aucun prospect ne pouvait voir.
  // Dix mois réglés, un contesté qui court, un contesté puis levé, un mal daté
  // — de quoi rendre la tuile mesurable ET faire travailler ses deux refus.
  // ⚠️ Aucune ligne sur le mois précédent : c'est la fenêtre de « Prêt à
  // facturer », et y poser une facture rendrait « facturé » les trois états de
  // mission que la salle existe pour montrer. Aucune relance non plus
  // (`reminders_sent` à zéro) : on ne montre pas des relances envoyées à des
  // clients fictifs qui n'en ont jamais reçu.
  // Les mois facturés et réglés, d'où sort le délai de paiement.
  //
  // ⚠️ #2419.4 — elle porte aussi les DEUX formes de règlement PARTIEL, et
  // c'est une distinction qui se seme, pas une nuance :
  //  - `months_ago: 6` est partiel ET CONTESTÉ — le client règle ce qu'il ne
  //    conteste pas. Le litige passe avant, la ligne s'affiche « En litige » ;
  //  - `months_ago: 4` est partiel SANS litige — neuf jours réglés sur
  //    vingt et un, plus de nouvelles. C'est le cas que le produit traitait
  //    comme un solde : la ligne disait « Réglée », quittait la file de
  //    relance, et le reste dû n'était plus réclamé par personne. Sans cette
  //    seconde ligne, la salle ne montrait JAMAIS le statut « Échue » avec son
  //    reste dû — la première la masquait derrière son litige.
  'invoice_readiness',
  // #2419.9 — LE PAIEMENT NON RAPPROCHÉ. `invoice_payments` était classée
  // « vide à dessein » (#2419.1) tant qu'aucun écran ne la lisait ; le seau
  // « Non rapproché » de `/pilotage/finance` la lit désormais
  // (`demoUnmatchedPayments`, `demo-dataset.ts`) — une ligne, sans facture
  // rattachée (`invoice_readiness_id NULL`), c'est le sens même du seau.
  'invoice_payments',
  // L'HISTORIQUE DE CORRECTION de l'organigramme (OrgGraph FINAL §7, 29/08/2026).
  // Quatre lignes sur le dossier d'exemple : trois faits sur une PERSONNE, dont
  // un ANNULÉ avec sa pierre tombale, et — #2310.54 — une sur une ENTITÉ,
  // preuve que le geste « Corriger » de la vue Groupe écrit bien dans le MÊME
  // ledger qu'une personne. C'est la démonstration entière de « versionné et
  // réversible ». Un tiroir « Historique des corrections » vide ne prouve
  // rien — et c'est exactement ce qu'un directeur commercial ouvre en premier,
  // parce que la question qu'il se pose est « et si mon équipe se trompe ? ».
  // ⚠️ Les lignes ACTIVES sont cohérentes avec le graphe seedé : la reprise
  // après un run les rejoue, et une `newValue` divergente ferait changer
  // l'organigramme de démonstration à la première réanalyse.
  'org_graph_corrections',
  // LES PLANS D'ENRICHISSEMENT D'ORGANIGRAMME (§11 FINAL, 31/08/2026) — deux
  // lignes, deux états. Un plan TERMINÉ, dont l'écart entre le coût ANNONCÉ et
  // le coût RÉEL se lit d'un coup d'œil (6 annoncés, 5 consommés), et un plan
  // PARTIEL dont une vague est tombée : sans lui, le geste « reprendre » n'a
  // rien à reprendre dans la salle, et un prospect ne voit jamais ce qui arrive
  // quand une vague échoue. La vague tombée porte `actualCredits: null`, jamais
  // `0` — rien n'a été débité, et un zéro se lirait « mesuré, et gratuit ».
  'org_enrichment_jobs',
  // LA CESSION DE CRÉANCE (31/08/2026) — un contrat factor, cinq cessions, six
  // règlements. Le domaine était REFUSÉ (`c29_affacturage`) ; Louis a levé le
  // refus le 31/08 et l'entrée du registre porte la trace du revirement.
  //
  // Les cinq cessions couvrent cinq situations DISTINCTES, parce qu'un écran de
  // réconciliation qui ne montrerait que le cas nominal ne dirait pas à quoi il
  // sert : réglée au centime, réglée 150 € EN DESSOUS (la retenue qu'on ne voit
  // jamais sans écran), transmise et en attente — c'est l'encours cédé —,
  // reprise par le factor avec son règlement NÉGATIF, et préparée avec un taux
  // dérogatoire à 1,80 %.
  //
  // ⚠️ Le mois M-8 de la mission interrompue reste SANS cession, à dessein : il
  // est facturé, impayé, et c'est LUI qui remplit la tuile « Cession manquante »
  // — le premier chiffre de l'écran dans les maquettes. Lui donner une cession
  // viderait la tuile et le geste « Préparer la cession » avec elle.
  'factoring_contracts',
  'receivable_assignments',
  'factoring_settlements', // dont UN non rapproché : la file de réconciliation
  // ═══════════════════════════════════════════════════════════════════════════
  // LES NOTES DE FRAIS (31/08/2026) — le domaine, pas seulement l'écran.
  // ═══════════════════════════════════════════════════════════════════════════
  // Cinq notes : deux en attente, deux validées, une refusée. Les trois tuiles
  // sont donc non vides — une file vide ne montre pas un produit.
  //
  // Ce que la salle montre et qu'aucun autre semis ne montre : les DEUX
  // verdicts de conformité. `F-2026-006` est CONFORME (cinq lignes, toutes sous
  // leur plafond) ; `2026-04-001` est NON VÉRIFIÉE parce qu'elle porte une
  // ligne `supplies`, catégorie absente du barème. Un barème incomplet ne
  // délivre pas un satisfecit, et c'est cette note-là qui le rend visible.
  //
  // `0146` est refusée AVEC son motif — la base l'exige — et porte le doublon
  // exact (même catégorie, même jour, même montant) que la vérification
  // automatique trouve. Une salle où l'encart ne trouve jamais rien ferait
  // passer le contrôle pour décoratif.
  //
  // ⚠️ AUCUNE ligne `mission_expenses` n'est semée par ce lot : les notes DÉJÀ
  // validées portent `mission_id = NULL` (un salon, un déplacement interne).
  // La raison est écrite dans `demo-dataset.ts` — semer la ligne de coût
  // ferait bouger la marge nette des missions de la salle, que le lot du 30/08
  // documente à 500 € sur UNE seule mission. Le lien se démontre autrement, et
  // mieux : les notes EN ATTENTE portent leur mission, et valider depuis
  // l'écran écrit la ligne pour de vrai sous les yeux du prospect.
  'expense_reports',
  // Les lignes : douze au total sur les cinq notes, dont une `supplies` sans
  // plafond (le verdict « non vérifié ») et un doublon exact (l'anomalie). Une
  // note de la salle porte une ligne sans taux de TVA nulle part — le taux est
  // renseigné partout, parce que c'est la ventilation COMPLÈTE qu'on montre ;
  // l'absence de taux se démontre par le calcul, pas par une salle trouée.
  'expense_report_lines',
  // Les justificatifs : huit pièces. L'une d'elles n'a PAS de poids
  // (`byte_size: null`), à dessein — l'écran doit écrire « non mesuré » et non
  // « 0 KB », qui se lirait « fichier vide ».
  // ⚠️ 31/08/2026 — DEUX d'entre elles portent désormais de VRAIS octets et
  // s'ouvrent réellement ; la troisième n'en porte pas, à dessein, pour que la
  // phrase « référencée, non stockée » reste visible quelque part dans la
  // salle. Une démonstration où tout s'ouvre laisserait croire que le produit
  // détient toujours tout.
  'expense_report_attachments',
  // La politique du client d'exemple — « Barème interne — déplacements
  // clients », au RÉEL. Une seule, rattachée au compte : c'est elle qui rend
  // l'encart « Conformité politique frais » lisible plutôt que « non vérifié »
  // partout.
  'expense_policies',
  // Le barème : six catégories plafonnées. `supplies`, `mileage` et `other` en
  // sont ABSENTS, à dessein — ce sont eux qui produisent le verdict « non
  // vérifié » de `2026-04-001`. Les ajouter rendrait la salle toujours
  // conforme, c'est-à-dire exactement l'impression qu'on ne veut pas donner.
  'expense_policy_caps',
  // Le barème KILOMÉTRIQUE de la salle (31/08/2026) : deux puissances fiscales,
  // datées du 1er janvier de l'année en cours. Il est SEMÉ parce qu'il est
  // SAISI — c'est le barème de l'ESN de démonstration, pas un barème officiel
  // recopié. Sans lui, l'écran de barème s'ouvrirait sur un tableau vide devant
  // un prospect, et la seule ligne kilométrique de la salle (le brouillon
  // `BROUILLON-2026-01`) resterait « non vérifiée » sans qu'on puisse montrer
  // le contraire.
  'expense_mileage_rates',
  // Les DOCUMENTS d'un besoin — devis, NDA, contrat cadre (fiche besoin,
  // dossier du 26/08 image 02). Cinq lignes sur trois des cinq besoins de
  // `DEMO_DELIVERY_CLIENT.openNeeds` (`needDocuments`, rattachées par titre) :
  // un devis ENVOYÉ, une NDA SIGNÉE, un contrat cadre EN ATTENTE — les trois
  // statuts que la maquette montre — plus un devis en BROUILLON sur un besoin
  // en veille. Les deux besoins restants n'en portent aucun, à dessein : une
  // salle où chaque rôle porterait un devis ne montrerait jamais la phrase
  // d'absence de l'onglet Documents.
  'need_documents',
  // Les « prochaines étapes » COCHABLES d'un besoin — distinctes de
  // `needNextAction`, une dérivation non persistée (`need-next-action.ts`).
  // Huit lignes sur les cinq besoins (`needSteps`), les trois statuts
  // représentés (`done`/`todo`/`pending`) sur des besoins DIFFÉRENTS : une
  // case déjà cochée, un badge « À faire » et un badge « En attente » sont
  // tous visibles sans qu'un visiteur touche à rien.
  'need_steps',
  // #2171.22 — les « prochaines étapes » COCHABLES de l'OPPORTUNITÉ elle-même
  // (distinctes de `next_action`, une dérivation non persistée) — trois
  // lignes sur le projet unique du lot (`projectSteps`), les trois statuts
  // représentés (`done`/`pending`/`todo`), même raison que `need_steps`
  // juste au-dessus.
  'project_steps',
  // #2126.47-.60 (épopée #2787) — le ledger des OUTCOMES commerciaux. Deux
  // lignes semées (`seedCommercialOutcomes`) : un `message_replied` PORTÉ PAR
  // UN CONTACT réel du jeu, et un `declined` au niveau du COMPTE
  // (`contactId: null`) — les deux formes que l'objet distingue, pour qu'un
  // visiteur voie l'écran dans ses deux états plutôt qu'un seul.
  'commercial_outcomes',
  // #3403.7 — deux autorisations d'introduction déjà ACCORDÉES, classées par
  // type de lien (`seedPersonalAccessPaths`) : c'est ce qui alimente les voies
  // d'accès personnelles de l'onglet Accès (`DEMO_PERSONAL_ACCESS_PATHS_COVERAGE`).
  'introduction_authorizations',
  // #3695.4/.6, #3696 (lot K12 07/10) — la trace du brouillon, en base : un
  // brouillon + une variante précédente sur le fil Email de Nadia Perrin
  // (SNCF, simulée), déjà là à l'ouverture du panneau Contacter.
  // `seedMessageDraftVersions` / `DEMO_MESSAGE_DRAFT_VERSION_SEED_SPECS`.
  // #2370 — plus un message préparé par canal neuf (`DEMO_PREPARED_CHANNEL_DRAFT_SEED_SPECS`,
  // `DEMO_PREPARED_CHANNELS_COVERAGE`).
  'message_draft_versions',
  // Théo B C6.N2 / M2.N1 — « Valider le brouillon » : l'e-mail de suivi de Nadia Perrin (SNCF, simulée) est DÉJÀ validé
  // (une relecture faite, rien d'envoyé), les autres brouillons semés restent « à relire » — les deux états se voient.
  // `seedMessageDraftVersions`, sous les brouillons préparés.
  'message_draft_validations',
  // Théo M2 — envoi programmé — deux envois déjà programmés (e-mail et e-mail de suivi de Nadia Perrin, SNCF simulée)
  // dans la Messagerie « À venir ». `seedScheduledSends` / `DEMO_SCHEDULED_SEND_SEED_SPECS` ; rien ne part en démo.
  'scheduled_message_sends',
  // Théo C talents-recrutement — trois candidats déjà rangés (Qualifiée, Échange prévu, En veille avec son motif), un quatrième
  // jamais rangé donc « À qualifier ». `seedRecruitmentEvents` / `DEMO_RECRUITMENT_SEED_SPECS` ; « Écartée » reste vide à dessein.
  'talent_recruitment_events',
  // #2171.24 — les documents de l'OPPORTUNITÉ elle-même (devis, NDA, contrat
  // cadre), distincts de `need_documents` (un rôle précis) : suivis au niveau
  // de l'affaire, deux statuts représentés (`sent`/`draft`), même raison que
  // `project_steps` juste au-dessus. Sans fichier joint dans cette tranche —
  // voir le docblock de `project-document.ts`.
  'project_documents',
  // #2193.51 (épopée #2953) — les documents de la MISSION elle-même (contrat
  // signé, avenant), distincts de `project_documents` juste au-dessus (au
  // niveau de l'affaire) : suivis sur la mission active de la salle
  // (`seedMissionDocuments`), deux statuts représentés (`signed`/`draft`),
  // même raison que `project_documents`. Sans fichier joint dans cette
  // tranche — voir le docblock de `mission-document.ts`.
  'mission_documents',
  /**
   * LES GESTES HORS OUTIL COCHÉS SUR LES MISSIONS (#1503).
   *
   * Trois missions sur dix, avec des avancements DIFFÉRENTS — 9/14, 10/14 et
   * 2/14 — parce qu'une checklist pleine partout ne montre pas à quoi sert une
   * checklist. Ce qui est coché suit l'ancienneté réelle de chaque mission :
   * celle de 24 jours n'a pas son « Point à J+30 ».
   *
   * ⚠️ Les PISTES elles-mêmes ne se seedent pas et n'ont plus à l'être : depuis
   * que les parcours se dérivent des objets, les comptes, besoins, projets et
   * missions de la salle s'y placent tout seuls. Voir l'entrée `chain_runs`.
   */
  'chain_manual_marks',
  // LA SOCIÉTÉ QUI FACTURE — Réglages › Sociétés (D9).
  //
  // Elle était « vide à dessein », avec une raison qui se terminait par « la
  // capacité se découvre dans Réglages, où elle est expliquée » — une phrase
  // qui décrivait un écran qui N'EXISTAIT PAS : `legal_entities` avait sa
  // table, son module et ses quatre routes, et pas une ligne côté web. L'écran
  // livré le 31/08/2026, la justification devenait périmée dans l'autre sens :
  // il s'ouvrait sur « Aucune société déclarée » devant un prospect.
  //
  // ⚠️ UNE SEULE ligne, et la moitié de la raison d'origine reste vraie : deux
  // raisons sociales montreraient une organisation de groupe que le reste du
  // jeu de données ne raconte pas.
  //
  // #2944 (recette écran, 26/09) — rattachée à TOUTES les missions de la
  // salle depuis ce lot (`demo-seed.service.ts`, juste après cette ligne) :
  // `/missions/facturation` affichait « Société facturante : non mesuré »
  // sur ses 9 lignes, un vide qu'aucun prospect ne doit découvrir en
  // réunion. Toujours une seule société — c'est elle qui facture chacune de
  // ses missions, pas un second groupe.
  'legal_entities',
  // LES FICHIERS RANGÉS (31/08/2026) — de vrais octets, déposés au semis.
  //
  // Deux justificatifs de note de frais et deux pièces d'affaire portent
  // réellement un fichier : la salle montre donc un bouton qui OUVRE quelque
  // chose, ce qu'aucun écran ne pouvait faire avant ce lot. Les autres pièces
  // restent SANS fichier, à dessein : c'est la moitié du produit qu'il faut
  // aussi montrer — « cette pièce est référencée, on ne la détient pas » — et
  // une salle où tout s'ouvre ne montrerait jamais cette phrase-là.
  //
  // ⚠️ Le semis calcule des chemins STABLES : le rejouer réécrit les mêmes
  // objets au lieu d'en accumuler.
  'storage_objects',
  // #2814 — les pièces jointes d'une facture PRÉPARÉE : un bon de commande
  // signé, avec un vrai PDF, sur le mois courant de « Fiabilisation
  // plateforme », l'une des deux missions RÉELLEMENT prêtes de la salle — la
  // prévisualisation de facture s'y ouvre et montre une pièce qui S'OUVRE.
  // La seconde mission prête n'en porte aucune, à dessein : elle montre la
  // phrase d'absence (`seedInvoiceAttachments`).
  'invoice_attachments',
  //
  // LE PROFIL ESN — #1921 (13/09/2026, Louis). Était ICI, en « vide à
  // dessein », avec une raison qui tenait tant qu'un visiteur passait PAR
  // l'onboarding : « c'est lui qui le remplit ». Le même lot a marqué
  // `user_onboarding_state` TERMINÉ pour que `/welcome` soit atteignable en
  // démo — donc plus personne n'y passe, donc plus personne ne le remplit.
  // La raison n'était pas seulement datée, elle était devenue FAUSSE : la
  // carte « Ton profil » de `/welcome` (`toWelcomeProfileSummary.ts`)
  // affichait « À compléter » ×4 à un prospect qui vient d'atteindre un écran
  // présenté comme le fruit d'un questionnaire déjà rempli. Même mouvement
  // qu'a fait `legal_entities` plus haut : une raison de vide périmée par un
  // écran livré depuis, pas un oubli.
  //
  // {@link DEMO_ESN_PROFILE} (`demo-dataset.ts`) porte « Bellum Conseil » —
  // la MÊME ESN fictive que partout ailleurs dans la salle, jamais un second
  // nom — et rien qui ne se lise déjà sur le banc de consultants ou les cinq
  // dossiers (le détail est dans son propre docblock).
  //
  // ⚠️ Ce qui reste VRAI de la raison d'origine, MOT POUR MOT :
  //  - `offer_portfolio` (le LEXIQUE de l'espace, D17) N'EST PAS semé : une
  //    salle de démonstration montre le vocabulaire PAR DÉFAUT — « Besoin »,
  //    « Compte », « Vivier » —, et le renommer reste le geste qu'on fait
  //    faire au visiteur dans Réglages › Lexique ;
  //  - les quatre tables de la mémoire marché restent PARTAGÉES et jamais
  //    seedées (voir plus haut) : `esn_name` = « Bellum Conseil » n'y sera
  //    JAMAIS trouvé, et c'est voulu.
  //
  // Ce que ça CHANGE dans les deux écrans que l'ancienne raison nommait :
  //  - Réglages › Mémoire de Laura, section « Ce que Laura sait de ton ESN »
  //    (01/09/2026) : passe de `empty` (« aucun profil renseigné ») à
  //    `declared` — elle montre maintenant ce qui part RÉELLEMENT dans le
  //    prompt, qui est désormais un vrai profil et pas un vide honnête ;
  //  - Réglages › Profil, bloc « Ton entreprise dans la mémoire marché »
  //    (#1636, 11/09/2026) : passe de `undeclared` (« renseigne le nom de ton
  //    entreprise ») à `insufficient` (« pas suffisamment couverte ») — un
  //    état HONNÊTE et non un mensonge : une ESN fictive n'a, à raison,
  //    aucune observation dans le corpus réel. Ni l'un ni l'autre n'est
  //    « À compléter » : c'est la seule exigence que ce lot devait tenir.
  'esn_profiles',
  // ─────────────────────────────────────────────────────────────────────────
  // #2151.70 (16/09/2026) — LES TROIS TABLES SCOPÉES `user_id`, CI-DESSOUS.
  //
  // Jusqu'ici cette liste ne portait QUE des tables `workspace_id`
  // (`DEMO_PURGE_TABLES`) : `demo-coverage.spec.ts` ne lisait que celle-là,
  // et une table scopée `user_id` (`DEMO_PURGE_USER_TABLES`) pouvait rester
  // SEEDÉE en réalité (une vraie ligne écrite à chaque bail) sans jamais
  // rejoindre cette liste — c'était le cas de `notifications`,
  // `user_favorites` et `profile_context_revisions` avant ce lot, chacune
  // documentée par sa PROPRE garde ad hoc (`demo-seed.service.spec.ts`,
  // `demo-profile-context-coverage.spec.ts`) plutôt que par la garde
  // centrale. La garde est désormais élargie pour lire les DEUX univers
  // (voir `demo-coverage.spec.ts`) : ces trois lignes répondent à cet
  // élargissement, elles ne changent rien à ce qui est réellement écrit.
  //
  // ⚠️ Une table listée ici scopée `user_id` a aussi besoin d'une sonde de
  // complétude dans `demoCompletenessProbes()` (`demo-reset.service.ts`,
  // branche `user_id = $2`) — sans elle, un semis à moitié raté sur cette
  // table ne ferait jamais réparer la salle.
  'notifications', //              la cloche — un exemplaire de chaque type, dont le digest du manager (#4158.28, `manager_digest`) + la boîte d'ÉQUIPE (#4158.14 : assignation, délégation, mention de collègues fictifs, `demo-team-inbox.ts`)
  'user_favorites', //              le favori GOLDEN posé sur Société Générale (#2150.14/.18)
  'profile_context_revisions', //  la version 1 du contexte de profil (#2075)
  // #2873 (28/09/2026, recette salle démo Maëlle Lorquin) — REVIREMENT ASSUMÉ
  // de la raison « vide à dessein » posée le 16/09/2026 (elle restait juste
  // pour TOUTE la table, voir l'entrée déplacée juste au-dessus dans
  // `DEMO_INTENTIONALLY_EMPTY` pour l'historique). `routine_runs` porte
  // désormais UNE ligne, `notified: false`, exactement dans la forme que
  // `sequenceCompletedCrmUpdate` (`routine-executors.ts`) aurait posée si le
  // balayeur avait tourné (`DemoSeedService.seedSequenceCompletedCrmUpdateProposal`)
  // — le balayeur, lui, ne tourne toujours jamais en démo (`isDemoWorkspace`).
  // Même patron que `interventions` juste plus bas : le PRODUIT d'un
  // balayeur, semé directement, jamais le balayeur lui-même.
  'routine_runs',
  // #2567.K6 (18/09/2026) — TROIS lignes, exactement celles que le balayeur
  // poserait lui-même (voir l'entrée `interventions` ci-dessous) : un
  // `renewal_at_risk` et deux `mission_without_end_date`. `seedInterventions`.
  'interventions',
  // #2571.5 (18/09/2026) — RÉFUTÉ EN RECETTE puis corrigé : le dossier était
  // classé « vide à dessein » (« importer un AO EST la démonstration ») alors
  // que rien n'était SEMÉ — `/rfp` s'ouvrait sur « Aucun appel d'offres
  // importé », un symbole présent dans le code que personne ne pouvait
  // atteindre. UN dossier, `seedRfp` (`demo-seed.service.ts`), construit sur
  // le MÊME script que l'import en direct (`demoRfpAnalysis`,
  // `demo-scripts.ts`) — statut `analysed` (exigences extraites, décision pas
  // encore prise). Sa prévisualisation (`GET /rfp/:id/need-preview`, #2571.2)
  // nomme une vraie inconnue : l'exigence « Pénalités de retard et
  // réversibilité » y est volontairement AMBIGUË, et les compétences ne sont
  // JAMAIS dérivées d'une prose (`previewNeedFromRfp`) — deux inconnues
  // NOMMÉES, pas une liste vide.
  'rfps',
  // #2957 (#2180.54, 30/09/2026) — le fichier SOURCE du dossier `seedRfp`
  // ci-dessus : un vrai PDF déposé au semis (`seedStoredFile`, domaine
  // `rfp_source_document`), pour que la carte « Documents sources » de
  // `/rfp` ouvre réellement quelque chose en salle. Voir
  // `DEMO_STORAGE_DOMAIN_COVERAGE.rfp_source_document`.
  'rfp_source_documents',
  // #2957 (#2180.53, 30/09/2026) — un import d'appel d'offres INTERROMPU, déjà
  // prévisualisé, que `/rfp` propose de reprendre (`seedRfp`). La bannière
  // « Reprendre l'import » serait sinon vide en salle.
  'rfp_import_sessions',
  // #3068 (27/09/2026) — RENVERSÉ, « vide à dessein » assumé jusqu'ici :
  // aucune ligne ne pouvait exister sans inventer un contentieux, et le
  // prédicat qu'elle justifie (`deriveStaffing` → `a_confirmer`, badge
  // « Interruption à confirmer » du vivier) était déjà câblé sur trois
  // services sans jamais se déclencher en salle. DEUX lignes, chacune sur sa
  // propre mission, closent le dossier : la mission interrompue de Léa
  // Fontaine (`DEMO_CONSULTANTS`, `DEMO_DELIVERY_CLIENT.missions`) — une
  // déclaration RÉELLE, `availability_confirmed: false` par construction, le
  // NO-GO que `MissionEndService.declareInterruption` pose — et
  // `seedMissionInterruption` (`demo-seed.service.ts`) sur « Cadrage données
  // transport — lot 2 » (Inès Kaczmarek), SANS toucher au statut de cette
  // mission (voir son docblock pour la raison).
  'mission_interruptions',
  // #2563/#2566/#2567 (lot G2, 07/10/2026) — la FACTURE RECONDUITE d'une mission longue : deux mois déjà préparés (jours
  // saisis sans relevé conservé, N° de bon de commande qui change) sur « Supervision de la chaîne de production — mission
  // longue », dont le volume (60 j) est DÉPASSÉ par le cumul + le mois précédent (alerte visible dans « Préparer la facture
  // de <mois> »), et l'option « préparer chaque mois automatiquement » active. Les huit autres missions n'ont aucune ligne :
  // « rien de préparé » est l'état le plus fréquent. Semé par la boucle des missions de `seedWorkspace`.
  'mission_month_preparations',
  'mission_invoice_auto_prepare',
  // Marchés locaux (L5, 05/10/2026) — quatre zones semées depuis les classeurs fournis (Lille, Nantes–Saint-Nazaire,
  // Lyon et axe Genève, Suisse romande ; 0 appel LLM, aucune donnée inventée) par `seedMarketZones`. Entrée RETIRÉE
  // de `DEMO_INTENTIONALLY_EMPTY` où le lot L1 l'avait posée à titre provisoire. Sondée par la complétude de la salle.
  'market_zones',
  // #3754.6 — les postes visés par l'ESN de la salle, chacun avec son niveau décideur (`DEMO_TARGET_PERSONAS`), semés
  // par `seedTargetPersonas` : le chemin recommandé de Société Générale montre l'ordre et la raison « Niveau N pour vous ».
  // Sondée par la complétude de la salle (purgée par `workspace_id`).
  'esn_target_personas',
  // #3756 — la bibliothèque de modèles de séquence : DEUX campagnes fictives (3 étapes chacune, variables
  // `{{firstName}}`/`{{companyName}}` ; la signature se résout à la composition, jamais en marque-place livré — §5.2 c) par `seedSequenceTemplates`, pour que Séquences › Bibliothèque
  // s'ouvre remplie devant un prospect. Les étapes pendent du modèle (`DEMO_PURGE_JOIN_TABLES`).
  // #4158.30 — chaque modèle de la salle est PARTAGÉ avec l'équipe et signé du collègue fictif (`created_by`,
  // `visibility = 'team'`, `seedTeamContinuity`) : la salle montre « Partagé avec l'équipe » et la date.
  'sequence_templates',
  'sequence_template_steps',
  // #3755.9 (06/10/2026) — la grille de qualification de la salle (5 filtres éliminatoires,
  // 9 critères pondérés, total 100) et Société Générale qualifiée axe par axe, une saisie du
  // commercial comprise (`seedQualificationGrid`, `demo-qualification-seed.ts`). Sans elles,
  // Réglages › Règles d'espace dirait « aucune grille » et l'onglet Score n'aurait pas sa carte.
  'qualification_grids',
  'qualification_criteria',
  'account_qualifications',
] as const

/**
 * Tables délibérément vides en démo, chacune avec sa raison. Une entrée ici dit
 * « on a regardé, et le vide EST le bon état » — pas « on a oublié ».
 */
export const DEMO_INTENTIONALLY_EMPTY: Readonly<Record<string, string>> = {
  // #4737 K2 (29/10/2026) — le mandat LinkedIn a été FUSIONNÉ dans `outreach_delegations` (portée `linkedin_send`).
  linkedin_mandates:
    'Table ARCHIVÉE par la fusion du 29/10/2026 : le mandat d’envoi LinkedIn vit désormais dans `outreach_delegations` (portée `linkedin_send`, SEEDÉE par `seedLinkedInMandate` : un mandat de 5 par jour sur 30 jours). Plus rien n’écrit dans cette table, la semer dupliquerait la notion de délégation (GA-26). Purgée à chaque bail par prudence (`DEMO_PURGE_TABLES`).',
  // #4406.6 (21/10) — Beeper : le BRANCHEMENT est vide à dessein, les CONVERSATIONS sont remplies.
  beeper_connections:
    'Une ligne de branchement porte les jetons OAuth CHIFFRÉS du Beeper Desktop d’un utilisateur réel, derrière son tunnel : une salle de démonstration n’a ni poste, ni tunnel, ni jeton, et en fabriquer un serait un secret inventé. Le service refuse tout branchement depuis une salle (`BeeperService.register`). L’écran n’est pas vide pour autant : Intégrations montre Beeper « connecté » et Messagerie liste trois conversations fictives fournies par l’adaptateur (`demo-beeper.ts`, voir `DEMO_BEEPER_CONVERSATIONS_COVERAGE`).',
  // #4158.57 (lot V13-FUSION-ESPACE, 17/10) — rapatrier l'espace PERSONNEL dans l'espace ESN rejoint.
  workspace_merge_requests:
    'Une demande de rapatriement n’existe que pour un utilisateur qui possède un espace PERSONNEL à côté de l’espace ESN qu’il a rejoint. Le visiteur d’une salle de démonstration n’en a aucun : il loue une salle, il ne s’est jamais inscrit seul avant d’être invité. Semer une demande inventerait cet espace personnel et ses comptes. Le service refuse de toute façon une salle de démo comme cible (`WorkspaceMergeService.preview`), et la carte « Rapatrier mon espace personnel » ne s’affiche que si un espace personnel est listé à côté de l’espace actif. Purgée à chaque bail par prudence (`DEMO_PURGE_TABLES`).',
  workspace_merge_items:
    'Le journal ligne à ligne d’un rapatriement validé : il n’existe qu’après une demande acceptée par un administrateur, et la salle n’en a aucune (voir `workspace_merge_requests`). Purgée à chaque bail par prudence (`DEMO_PURGE_TABLES`).',
  // #4016.L13 (lot V10-E, 17/10) — « fait confirmé jusqu'à preuve contraire ».
  field_contradictions:
    'Une contradiction n’existe que contre un fait CONFIRMÉ À LA MAIN (provenance `human`), et la salle n’en sème aucun : « corrigé à la main » sur une fiche que personne n’a touchée mentirait (garde `demo-estimated-email-coverage.spec.ts`). Et la seule source qui écrit des coordonnées dans la salle — l’enrichissement de démonstration — n’en invente aucune (`demoEnrichment` rend des coordonnées vides) : rien ne peut donc contredire quoi que ce soit sans inventer un fournisseur. La ligne « Une source indique … — ta valeur confirmée est gardée » vit sur la fiche (`ContactKeyInfo`) et apparaît dès qu’un vrai espace corrige un champ puis l’enrichit. La table est purgée à chaque bail (`DEMO_PURGE_TABLES`).',
  // #3719.4 — « exporté vers mon CRM le … ». Écrite UNIQUEMENT quand un visiteur
  // pousse un contact vers SON CRM (carte « Exporter vers un CRM »). Vide au départ :
  // y semer « exporté vers Acme Corp le 2 octobre » serait inventer une destination et
  // un geste qu'aucun visiteur n'a posé. Le geste, lui, se REJOUE en démo (lot D01) :
  // la carte propose le connecteur CRM FICTIF marqué « démonstration »
  // (`CrmService.exportContact`, zéro réseau), consigne l'export, et la remise à zéro
  // de la salle (`demo-reset.service.ts`) l'efface. Garde : `demo-crm-export-replay-coverage.spec.ts`.
  contact_crm_exports:
    'Écrite uniquement quand un visiteur exporte un contact : vide au départ, car semer un export inventerait une destination et un geste que personne n’a posés. Le geste se rejoue en démo contre le connecteur CRM fictif (marqué « démonstration », aucun réseau), consigné puis effacé à la remise à zéro de la salle.',

  // #2159.35 — « CE N'EST PAS LA MÊME PERSONNE ». Contrairement à
  // `entity_resolution_corrections` (comptes), qui a une carte dédiée
  // (`EntityResolutionPanel`) affichant les corrections passées — d'où le
  // semis `seedEntityResolutionCorrection` — CETTE table n'a AUCUN écran de
  // lecture : le seul appelant, `ImportWizard.tsx`, n'écrit le geste que
  // pendant un rapport d'import, jamais ne relit l'historique d'une fiche
  // (voir le docblock de `useRecordContactResolutionCorrection`). Semer une
  // ligne ne changerait donc RIEN à l'écran — aucune carte ne la lirait — et
  // fabriquerait un geste de correction qu'aucun visiteur n'a posé.
  contact_resolution_corrections:
    'Écrite uniquement quand un visiteur corrige un rapprochement pendant un rapport d’import (« ce n’est pas la même personne »). Aucun écran ne relit cette table aujourd’hui — contrairement à `entity_resolution_corrections` (comptes) et sa carte dédiée — donc une ligne semée à l’avance ne changerait rien à l’écran et prêterait au visiteur un geste qu’il n’a jamais posé.',

  // #2818 (lot T4) — LE BRIEF PARTENAIRE d'un besoin de sourcing externe.
  //
  // `partner_name` est un texte LIBRE tapé par le visiteur (aucun répertoire
  // de partenaires n'existe dans le produit — voir le docblock de
  // `external-sourcing.ts`, `@bellum/contracts`). Semer une ligne inventerait
  // le nom d'une ESN partenaire précise, présentée comme réelle à un
  // prospect qui ne l'a jamais tapé — exactement ce que `demo-dataset.ts`
  // refuse en toutes lettres pour une décision humaine (voir
  // `market_company_resolution_override` juste en dessous, même raison).
  //
  // L'écran vide reste pleinement fonctionnel et ne montre rien de moins
  // qu'aujourd'hui : `NeedExternalSourcing` affiche un aperçu du texte que
  // composerait `buildExternalSourcingPartnerBriefMessage` depuis le besoin
  // RÉEL du corpus de démo (titre, compétences, volume), et le formulaire
  // « Partager le brief à un partenaire » prépare un premier brief en direct,
  // sans écriture de démo à seeder pour ça.
  external_sourcing_partner_briefs:
    'Le brief se prépare avec un nom de partenaire tapé par le visiteur (texte libre, aucun répertoire de partenaires dans le produit) : en semer un prêterait à la salle de démonstration le nom d’une ESN partenaire que personne n’a tapé. L’écran vide reste fonctionnel — aperçu du message composé depuis le besoin réel, formulaire pour préparer un premier brief en direct.',

  // #1617.4 — LA DÉCISION D'UN HUMAIN sur un rapprochement de mémoire marché
  // (« c'est bien cette entreprise » / « ce n'est pas exact »).
  //
  // Trois raisons, et aucune n'est « c'était plus simple ».
  //
  // 1. Un ACCORD doit désigner une clé RÉELLE du corpus. Le semis ne peut pas
  //    la lire : GA-258 lui interdit jusqu'au nom des tables partagées, et il
  //    les nommerait pour rien puisqu'elles sont hors de son espace. Une clé
  //    écrite à l'aveugle ne désignerait rien à la lecture — le compte
  //    tomberait en « observations insuffisantes » SANS erreur, et la salle
  //    montrerait moins qu'aujourd'hui.
  // 2. Un REJET, lui, s'écrirait sans clé — mais il RETIRE un compte de la
  //    couverture et de la file « À départager ». Semer la fonctionnalité la
  //    ferait donc DISPARAÎTRE de l'écran qu'elle enrichit.
  // 3. La ligne porte le NOM de qui a tranché (`reviewed_by`). En semer une
  //    mettrait dans la bouche de la propriétaire de la salle un jugement sur
  //    l'IDENTITÉ d'une entreprise réelle qu'elle n'a jamais porté — ce que
  //    l'en-tête de `demo-dataset.ts` refuse en toutes lettres.
  //
  // Ce que la salle montre à la place est l'état RÉEL : la file de
  // l'écran Marché (`/accounts/marches`) liste les comptes d'exemple que le corpus ne sait pas
  // départager, et chaque ligne porte le geste. Vide, elle dit « Aucun compte
  // à départager », qui est vrai. `DEMO_MARKET_REVIEW_DECISION_COVERAGE`
  // ci-dessous porte la même question au niveau de l'écran.
  market_company_resolution_override:
    'La décision d’un humain sur le rapprochement d’un de ses comptes. Un ACCORD devrait désigner une clé réelle du corpus, que le semis ne peut pas lire (GA-258) : écrite à l’aveugle elle ne désignerait rien, et le compte tomberait en « observations insuffisantes » sans qu’une erreur le dise. Un REJET, lui, RETIRERAIT un compte de la file « À départager » — semer la fonctionnalité la ferait disparaître de l’écran qu’elle enrichit. Et la ligne porte le nom de qui a tranché : en semer une prêterait à la propriétaire de la salle un jugement sur l’identité d’une entreprise réelle qu’elle n’a jamais porté.',

  // Le focus du plan d'action réglé par espace (31/08/2026). Cette table ne
  // stocke QUE l'ÉCART au défaut : pas de ligne = les valeurs EN VIGUEUR du
  // contrat, et c'est exactement ce que l'écran affiche (il rend `defaults`,
  // `overrides` et `effective`). Une salle sans ligne n'est donc PAS un écran
  // vide : le visiteur voit les onze axes et leurs valeurs.
  //
  // En seeder une ferait pire : elle montrerait un espace de démonstration dont
  // quelqu'un a déjà retouché le focus, sans qu'on sache pourquoi — et elle
  // FIGERAIT ces axes le jour où un défaut change.
  org_focus_weights:
    "Cette table ne stocke que l'ÉCART au défaut. Aucune ligne = les valeurs en vigueur, " +
    "que l'écran affiche déjà : la salle n'est pas vide, elle est au nominal. En seeder une " +
    'montrerait un focus retouché par un visiteur précédent, et figerait ces axes le jour où un défaut change.',

  // #2326.12 (épopée #2794) — L'ORCHESTRATEUR ASYNCHRONE d'import de CV. Une
  // ligne n'existe QUE si un visiteur dépose une VRAIE archive ZIP ou un VRAI
  // dossier de CV (`CvZipImportDialog`) : en semer une inventerait un import
  // qui n'a jamais eu lieu (un rapport nommant des fichiers que personne n'a
  // chargés, la donnée fictive que la doctrine interdit). Le geste reste
  // JOUABLE en salle — un visiteur qui dépose ses propres fichiers voit son
  // job réel avancer, avec son rapport réel à la fin, exactement comme un
  // client. Purgée entre deux visiteurs (`DEMO_PURGE_TABLES`) pour la même
  // raison que `org_enrichment_jobs` juste au-dessus.
  // #2844 / #1952.6 (lots SRC5-SRC6, 28/09/2026) — les jobs asynchrones de
  // matching en lot, d'export du vivier et de recherche multi-sources : même
  // raison que `cv_batch_import_jobs` ci-dessous. Une ligne n'existe que
  // lorsqu'un visiteur LANCE le job ; en semer une inventerait un travail que
  // personne n'a demandé. Le geste reste jouable en salle (purgé entre deux
  // visiteurs, voir `demo-reset.service.ts`).
  bulk_matching_jobs:
    "Une ligne n'existe que si un visiteur lance un matching en lot — en semer une inventerait un " +
    'job jamais demandé. Le geste reste jouable en salle, avec son résultat réel.',
  bulk_export_jobs:
    "Une ligne n'existe que si un visiteur lance un export du vivier — en semer une inventerait un " +
    'export jamais demandé. Le geste reste jouable en salle, avec son fichier réel.',
  multi_source_search_jobs:
    "Une ligne n'existe que si un visiteur lance une recherche multi-sources — en semer une " +
    'inventerait une recherche jamais faite. Le geste reste jouable en salle.',
  // Journal d'incidents des connecteurs : en semer un inventerait une panne
  // qui n'a jamais eu lieu sur un outil que l'espace démo n'a pas branché.
  connector_capability_incident_logs:
    "Un incident n'existe que si un connecteur réellement branché a failli — l'espace démo n'en " +
    "branche aucun, en semer un inventerait une panne qui n'a jamais eu lieu.",

  cv_batch_import_jobs:
    "Une ligne n'existe que si un visiteur dépose une VRAIE archive ZIP ou un VRAI dossier de CV — " +
    "en semer une inventerait un import qui n'a jamais eu lieu. Le geste reste jouable en salle : " +
    'déposer ses propres fichiers fait avancer un job réel, avec un rapport réel à la fin.',

  // Import universel (Louis 27/09/2026) — même raison que `cv_batch_import_jobs`
  // juste au-dessus. Le geste est DÉMONTRABLE sans fichier sous la main : la
  // fenêtre d'import propose « Essayer avec le fichier d'exemple » (lignes
  // fictives évidentes, `exemple.fr`), qui fait avancer un job RÉEL — envoi
  // par parts, correspondance des colonnes, progression temps réel, rapport.
  // Purgées entre deux visiteurs (`DEMO_PURGE_TABLES`).
  context_pack_imports:
    "#4422.1 — une ligne par fichier importé par l'assistant « Dépose tes documents » (postes, grille, séquences, connaissances). " +
    "Rien n'est semé : une ligne d'historique n'existe que si un visiteur a importé un fichier — en inventer une montrerait un import qui n'a jamais eu lieu. " +
    "Le geste reste jouable en salle ; la ligne apparaît dans l'historique de /settings/import dès le premier import de la visite. Purgée entre deux visiteurs. " +
    "#4573 — l'ORIGINAL et son aperçu suivent la même règle, vide à dessein : un original semé serait un fichier que personne n'a déposé, présenté comme « tel que déposé ». " +
    'Le visiteur qui importe un document voit son propre original en aperçu (seau privé, URL signée), comme hors démo.',
  // #1952.5 (épopée #2844, lot SRC5 28/09 soir, cliquable depuis le 30/09 —
  // `BulkCvRewriteButton.tsx`, sous la comparaison de profils de
  // `ConsultantMatchPanel`). La ligne reste vide EN DÉMONSTRATION pour une
  // raison DIFFÉRENTE de « aucun écran » : `BulkCvRewriteService.enqueue`
  // refuse explicitement le geste dans un espace de démo (même refus que le
  // geste unitaire, `POST :id/cv-rewrite`) — le bouton existe, la démo le
  // désactive quand même.
  bulk_cv_rewrite_jobs:
    "Une ligne n'existe que si un visiteur lance un LOT de réécriture de CV. Le bouton existe depuis le 30/09 " +
    '(#1952.5, `BulkCvRewriteButton.tsx`), mais `BulkCvRewriteService.enqueue` refuse le geste dans un espace de ' +
    'démonstration — même refus que la réécriture UNITAIRE (elle coûte 1 crédit et appelle un modèle, voir le ' +
    'refus explicite de `POST :id/cv-rewrite`) : ce lot ne se lance jamais en salle, cliquable ou non.',

  // #2386.9 — la télémétrie de la session de prospection (temps au premier
  // message, taux de messages modifiés, succès connecteur, doublons évités),
  // PAR PARCOURS. Une ligne n'existe QUE si un visiteur génère une VRAIE
  // session (`ProspectingSessionDialog`, écran Découvrir) — en semer une
  // fabriquerait un usage qui n'a jamais eu lieu, exactement la donnée
  // fictive que la doctrine interdit (« BellumAI n'affiche jamais ce qu'il
  // n'a pas »). Le geste reste JOUABLE en salle : un visiteur qui génère une
  // session voit le bloc `ProspectingSessionMetricsBlock` (écran Séquences)
  // se remplir avec SES propres faits, même « non mesuré » sur les trois
  // mesures dérivées tant que le plancher de 5 sessions n'est pas atteint
  // (`MIN_DISTINCT_SESSIONS_FOR_A_METRIC`, GA-240/241/264/266/267). Purgée
  // entre deux visiteurs (`DEMO_PURGE_TABLES`), même raison que
  // `cv_batch_import_jobs` juste au-dessus.
  prospecting_sessions:
    "Une ligne n'existe que si un visiteur génère une VRAIE session de prospection — en semer une " +
    "fabriquerait un usage qui n'a jamais eu lieu. Le geste reste jouable en salle : générer une " +
    'session fait avancer la télémétrie PAR PARCOURS avec ses propres faits (écran Séquences).',

  // La question de contribution (tome 2 §24) apparaît d'elle-même dans la salle
  // de démonstration : elle se déclenche sur l'état RÉEL du compte affiché. On
  // purge la trace entre deux visiteurs, et on ne la seede surtout pas — une
  // question déjà « posée » serait une question que le visiteur ne verrait
  // jamais, c'est-à-dire l'inverse de ce qu'on veut montrer.
  access_fact_questions: 'la question se pose en direct au visiteur ; seeder la trace la ferait disparaître de l’écran',

  // Laura Produit parle dans l'espace de démonstration comme ailleurs — le
  // toggle est visible dans les réglages, et ses interventions se déclenchent
  // sur l'état réel de la salle. Ce qui reste vide est la TRACE, et c'est
  // normal : elle enregistre ce qui a été proposé à CE visiteur. En seeder une
  // montrerait à un prospect la réaction de quelqu'un d'autre à un message
  // qu'il n'a jamais reçu.
  laura_interventions: "Trace d'usage : elle se remplit pendant la visite, elle ne se seede pas.",
  chain_runs:
    '⚠️ **Table ARCHIVÉE le 05/09/2026 (#1503) — elle n’est plus écrite par personne.** ' +
    'Un parcours ne se démarre plus à la main : sa position se DÉRIVE de l’objet métier à chaque ' +
    'lecture. La justification précédente disait « en seeder un placerait le compte à une position ' +
    'arbitraire », ce qui reste vrai, mais la raison a changé de nature — il n’y a plus de ligne à ' +
    'seeder du tout, et la migration `ChainsDerived` a passé les lignes existantes en `abandoned`. ' +
    '⚠️ Et le corollaire est le vrai changement pour la démonstration : **les sept pistes se ' +
    'remplissent maintenant TOUTES SEULES**, parce que les comptes, projets, besoins, missions et ' +
    'consultants de la salle sont de vrais objets et qu’ils se placent. L’écran n’est plus « 0 ' +
    'dossier en cours » sur sept lignes — c’était le défaut que ce chantier corrige, et la salle en ' +
    'est la première preuve. Ce qui reste à seeder est la CHECKLIST des gestes hors outil ' +
    '(`chain_manual_marks`), la seule chose qu’aucun objet ne sait dire. La table se vide au départ ' +
    'du visiteur (`demo-reset.service.ts`) : un espace recyclé ne garde rien, archives comprises.',
  business_unit_access_requests:
    "La demande d'accès à un périmètre qu'on ne porte pas (#2087.16) est ce que le VISITEUR fait pendant sa visite : la troisième BU de la salle est délibérément laissée sans lui, et le bouton « Demander l'accès » y est visible. La pré-remplir montrerait la demande de quelqu'un d'autre, en attente d'un responsable qui ne répondra jamais — une demande éternellement « en attente » est ce qu'un prospect retient. La table se remplit d'elle-même au premier clic et se vide au départ du visiteur (`demo-reset.service.ts`).",
  // #2081.14 — les règles d'espace (DÉCISION Louis 19/09/2026).
  workspace_rules:
    "VIDE À DESSEIN parce que l'absence de ligne EST la règle de la salle : sans ligne, `resolveWorkspaceRuleValues` rend les valeurs par défaut — comptes d'une unité partagés à l'espace, export ouvert à qui tient le droit — et Réglages › Règles d'espace les affiche avec « valeur par défaut, jamais changée ». Seeder une ligne aux mêmes valeurs n'ajouterait rien à l'écran, sinon une trace « changée par … le … » que personne n'a posée. Le visiteur est propriétaire de sa salle : il PEUT changer une règle et voir l'export se refuser ; la table se vide à son départ (`DEMO_PURGE_TABLES`, `demo-reset.service.ts`), pour que le suivant retrouve les défauts et pas une salle dont l'export a été fermé par quelqu'un d'autre.",
  workspace_member_permissions:
    "Les exceptions de droits accordées à une personne précise. Un espace de démonstration n'a qu'un siège et aucun collègue à qui déléguer quoi que ce soit ; y seeder une exception montrerait un privilège que personne n'a accordé, sur une équipe qui n'existe pas.",
  // #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes.
  // Les TROIS réglages du marché inversé et les DEUX de la charge commerciale
  // tiennent désormais dans ces deux tables (Réglages › Marché inversé,
  // Réglages › Charge commerciale). MÊME raison que `workspace_rules` juste
  // au-dessus : ces tables ne stockent que l'ÉCART aux défauts de code
  // (`DEFAULT_MAX_RECRUITERS_SHOWN = 10`, marché fermé, capacité non
  // renseignée, `DEFAULT_MAX_OPEN_NEEDS = 15`). Aucune ligne = le défaut, que
  // les services rendent déjà et que les écrans affichent — la salle n'est pas
  // vide, elle est au nominal. Le visiteur PEUT régler ces plafonds et les
  // voir appliqués ; les tables se vident à son départ (`DEMO_PURGE_TABLES`)
  // pour que le suivant retrouve les défauts.
  chat_eval_samples:
    "VIDE À DESSEIN (#2899, décision Louis 11/10/2026 ; ALLUMÉ par défaut depuis #4173, 14/10/2026, pour tout AUTRE espace) : l'échantillonnage de conversations pour les évals est un opt-in PAR ESPACE, et la salle de démonstration n'a pas le droit de le cocher (403 : « l'échantillonnage n'existe pas dans l'espace de démonstration ») — ce que dit Réglages › Laura pour la salle, réglage affiché éteint. Un visiteur de la démo parle à Laura avec de VRAIS prospects imaginaires : les verser aux évals polluerait le corpus de qualité avec des conversations qui ne sont pas de la production. La migration `1796530329276` EXCLUT explicitement `is_demo` de son bascule : la table ne contient donc jamais de ligne ici ; le réglage lui-même (`workspaces.chat_eval_sampling_enabled`) est une colonne de l'espace, déjà couverte par la ligne `workspaces` de la salle, et reste `false` pour elle seule.",
  workspace_reverse_market_settings:
    "VIDE À DESSEIN, même raison que workspace_rules : l'absence de ligne EST le réglage de la salle. Sans ligne, WorkspaceReverseMarketSettingsService.effectiveFor() rend les défauts de code (marché fermé, capacité de réponse NON RENSEIGNÉE — jamais zéro, DEFAULT_MAX_RECRUITERS_SHOWN = 10) et Réglages › Marché inversé les affiche. Seeder une ligne aux mêmes valeurs n'ajouterait rien à l'écran, et poser une capacité fictive afficherait un nombre de sollicitations qu'aucune ESN n'a choisi. Le visiteur PEUT changer ces trois réglages et voir « Marché externe » en tenir compte ; la table se vide à son départ pour que le suivant retrouve les défauts.",
  workspace_commercial_load_settings:
    "VIDE À DESSEIN, même raison que workspace_reverse_market_settings ci-dessus : l'absence de ligne EST le réglage. Sans ligne, WorkspaceCommercialLoadSettingsService.effectiveFor() rend le défaut de code pour les besoins ouverts (DEFAULT_MAX_OPEN_NEEDS = 15) et « non renseigné » pour les dossiers suivis et les heures commerciales disponibles (#3245, reste de #3209.3) — jamais zéro dossier ni zéro heure — et Réglages › Charge commerciale les affiche. Le visiteur PEUT changer ces trois plafonds et voir « Besoins ouverts » en tenir compte (un besoin à charge passe après les autres) ; la table se vide à son départ pour que le suivant retrouve les défauts.",
  workspace_ritual_preferences:
    "VIDE À DESSEIN, même raison que workspace_commercial_load_settings ci-dessus (BEL-SC-242, #3271.10/.12) : l'absence de ligne EST le réglage — les cinq rituels du catalogue (`ritual.ts`) s'affichent tous dans « Rituels d'équipe » (Pilotage), ce qui EST le défaut de code, pas un écran vide. Seeder une ligne `disabled: false` n'ajouterait rien à l'écran qu'une absence de ligne ne montre déjà. Le visiteur PEUT masquer un rituel et le voir rejoindre « Rituels masqués » ; la table se vide à son départ pour que le suivant retrouve les cinq rituels affichés.",
  // #3298 (suite #3271.8) — la marque légère de dernière tenue d'un rituel.
  workspace_ritual_last_held:
    "VIDE À DESSEIN, même famille que workspace_ritual_preferences juste au-dessus : l'absence de ligne EST la vérité — aucun rituel n'a de dernière tenue connue, et « Rituels d'équipe » l'affiche honnêtement (`UnknownValue`, « jamais marqué comme tenu »), jamais une date inventée. Seeder une date fictive romprait la doctrine (jamais de donnée fictive) sur exactement le champ que ce lot existe pour tenir honnête. Le visiteur PEUT marquer un rituel comme tenu et voir apparaître sa date suivante, dérivée de la cadence (`nextRitualDate`) ; la table se vide à son départ.",
  decision_gate_crossings:
    "Le journal des portes de décision est ce que le VISITEUR décide pendant sa visite : clore un projet, armer un playbook. Le pré-remplir retirerait le geste que la démonstration veut montrer, et présenterait comme des décisions prises des choix que personne n'a faits. La table se remplit d'elle-même dès le premier clic, et se vide au départ du visiteur.",
  telephony_connections:
    "La connexion d'un outil d'appel est REFUSÉE en démo, comme l'ATS : un prospect ne dépose pas les clés du standard téléphonique de son entreprise sur un espace que d'autres visiteurs traversent. #4016 L12 : la déclaration « enregistrement annoncé » (`recording_consent_announced`) et l'analyse d'un appel héritent de cette raison — sans connexion en démo, il n'y a ni appel ni transcription à analyser, et une analyse seedée ferait croire que Bellum écoute une ligne ; la route d'analyse refuse la démo (400).",
  lemlist_connections:
    "#4427.4 — VIDE À DESSEIN : la connexion Lemlist est REFUSÉE en démo (`LemlistService.connect`, 400), comme l'ATS et la téléphonie — un prospect ne dépose pas la clé de l'outil d'envoi de son entreprise sur un espace que d'autres visiteurs traversent. La carte « Lemlist » de /integrations s'affiche donc « à brancher » : c'est la vérité. Une connexion seedée ferait lister des campagnes qui n'existent chez personne.",
  lemlist_lead_pushes:
    "#4427.4 — VIDE À DESSEIN, même raison que `lemlist_connections` : sans clé en démo, aucun lead n'a été poussé et aucun statut (envoyé, ouvert, répondu…) n'existe chez Lemlist. Seeder une trace afficherait sur une fiche un « ouvert » ou un « répondu » que personne n'a jamais produit — exactement la donnée inventée que la doctrine refuse.",
  telephony_call_logs:
    "Trace des appels déjà versés au CRM. Sans connexion téléphonique ni CRM en démo, il n'y a rien à tracer — et des appels seedés laisseraient croire que Bellum écoute une ligne.",
  telephony_call_states:
    "#2403.12 — l'état « appel en cours » (source de la coupure de Laura). Posé par le webhook `POST /webhooks/telephony/:workspaceId`, signé par le secret propre à l'espace (`telephony_connections.webhook_secret_enc`) — même raison que `telephony_connections` juste au-dessus : la connexion d'un outil d'appel est REFUSÉE en démo, donc aucun secret n'existe jamais pour l'espace de démonstration et le webhook ne peut matériellement rien y écrire (503, jamais un événement accepté par défaut). Un état seedé laisserait croire qu'un appel est en train de se tenir sur un espace que personne n'utilise — exactement le mensonge que `telephony_call_logs` refuse déjà. La coupure de Laura sur un appel réel se vérifie sur un espace réel connecté, pas en démo, comme `#2403.13` (agenda) le fait déjà pour la réunion connue.",
  linkedin_interactions:
    'Le journal des interactions du réseau professionnel est ce que le VISITEUR déclare : le pré-remplir retirerait le geste que la démonstration veut montrer, et ferait croire à des invitations envoyées depuis un espace partagé.',
  admin_docs_connections:
    "La connexion d'un outil de signature ou de facturation est REFUSÉE en démo (`AdminDocsService.connect` lève sur un espace de démonstration) : un prospect ne dépose pas les clés de la facturation de son entreprise sur un espace partagé. L'écran montre ce que la carte apporterait ; il ne prend aucun secret. ⚠️ Conséquence assumée, et VÉRIFIÉE le 29/08 quand la carte a gagné ses deux lectures (« ce qui attend une signature », « ce qui n'est pas payé ») : sans connexion, la carte n'appelle NI `/admin-docs/signatures` NI `/admin-docs/invoices` — zéro appel réseau, et surtout aucune phrase « rien n'attend de signature », qui se lirait comme un constat alors que rien n'a été regardé. Y seeder une ligne serait pire que vide : les identifiants sont chiffrés et rejoués tels quels vers l'outil réel, donc une fausse clé ferait partir de vrais appels sortants vers les quatre éditeurs et l'écran de démo afficherait « pas de réponse de … ».",
  ats_write_requests:
    "Une demande d'écriture dans l'ERP suppose un ERP branché, ce qu'une salle de démonstration n'a pas (`ats_connections` est vide pour la même raison). Y seeder une demande en attente laisserait croire qu'une validation va partir écrire chez un client — y compris un compte rendu d'appel (`log_call`, #4692), qui n'écrit que dans la fiche d'un contact de l'ERP du client.",
  ats_connections:
    "La connexion d'un ATS est REFUSÉE en démo (`AtsService.startOAuth`) : un prospect ne passe pas le consentement OAuth2 de l'ERP de son ESN depuis un espace partagé, et une ligne seedée porterait un jeton fictif que `resolveConfig` enverrait en appel réel à l'éditeur. La table reste donc VIDE À DESSEIN — mais l'ÉCRAN, lui, n'est pas vide : `AtsService.status` rend pour un espace de démonstration l'affichage fictif de `demoAtsConnection` (`demo-dataset.ts` : instance fictive, mode OAuth2, scopes, dernier échange), sans aucune écriture ni lecture sortante. La CARTE de la grille lit le registre d'outils, dont l'overlay `withDemoConnections` rend BoondManager branché avec la MÊME définition (#4689) : carte et panneau ne se contredisent plus. Les colonnes OAuth2 de #4688 (`access_token_enc`, `refresh_token_enc`, `expires_at`, `refresh_failed_at`, `scopes`, état d'autorisation) suivent la même décision : jamais de jeton, même fictif, en base de démo.",
  // — Ce que le VISITEUR est censé produire pendant la démo. Le pré-remplir
  //   retirerait le geste qu'on veut lui faire faire.
  shortlists:
    "Une shortlist est ce que le VISITEUR compose : choisir cinq profils au plus dans un classement est le geste central de la démonstration. En pré-remplir une retirerait ce geste et présenterait comme envoyée une sélection que personne n'a faite.",
  shortlist_entries: 'Les fiches courtes pendent de la shortlist ci-dessus : sans sélection, il n’y a rien à figer.',
  match_weight_versions:
    "La pondération des treize axes n'est versionnée que lorsqu'un administrateur la MODIFIE. Une salle de démonstration tourne sur les poids par défaut, et y seeder une version antérieure laisserait croire que quelqu'un a déjà réglé le moteur.",
  // #3104 (27/09/2026) — REVENU SUR : `chat_messages` était ici, « vide à
  // dessein » (« la démo consiste à poser une question »). RENVERSEMENT
  // ASSUMÉ ET DATÉ (tranché sans Louis) : mesuré en recette production, un
  // visiteur qui ouvre `/chat` en premier geste voit « Aucune conversation »
  // avant même de taper — un produit qui se lit vide plutôt qu'une invitation.
  // `chat_messages` est désormais SEEDÉE (voir `DEMO_SEEDED_TABLES` plus bas,
  // et `DemoSeedService.seedWorkspace`) : UNE conversation d'exemple, avec
  // `conversation_id` posé pour être visible à tout lecteur de l'espace
  // (`threadsBaseQuery`), jamais seulement à son auteur. Tout ce qui suit ce
  // paragraphe (auteur résolu à la lecture, rangement, statut, provenance de
  // branche, `context` vide — #1940.4/#1911.4/#1911.5/#1911.7-10/#1953.11/
  // #1953.22/#1914.14) reste VRAI SANS CHANGEMENT pour CE fil ET pour tout
  // nouveau fil que le visiteur ouvrira lui-même : rien de plus n'est semé,
  // aucun modèle n'est appelé pour la produire (contenu scripté, statique).
  conversation_summaries:
    'Le résumé roulant est DÉRIVÉ des échanges avec Laura. `chat_messages` porte désormais une conversation ' +
    "d'exemple (#3104, 27/09/2026 — raison écrite juste au-dessus), mais AUCUN résumé n'est semé pour elle : la " +
    'section porte sa propre phrase (« aucun échange résumé ») pour ce fil comme pour tout nouveau fil, et elle se ' +
    'remplit SOUS LES YEUX du visiteur au premier message qu’IL écrit : c’est la seule façon de montrer que la ' +
    'mémoire de conversation est écrite par l’usage et non pré-remplie.',
  // #1911.1 / #1911.12 — le titre d'un fil de Laura.
  chat_thread_titles:
    'Un titre nomme un fil. `chat_messages` porte désormais une conversation d’exemple (#3104, 27/09/2026 — raison ' +
    'écrite plus haut), mais AUCUN titre stocké ne lui est semé — pas plus qu’à un fil que le visiteur ouvrira lui-' +
    'même : la liste des fils affiche le premier message pour titre par défaut, exactement ce qu’un espace réel ' +
    'montre avant son 2e échange. Et Laura n’en RÉDIGE aucun en démonstration : la rédaction est un appel de ' +
    'modèle, refusé en amont par le contrôleur (`isDemoWorkspace`), comme tout appel de modèle dans une salle. Le ' +
    'visiteur peut renommer lui-même n’importe quel fil : ce geste-là n’appelle aucun modèle et la table se remplit ' +
    'sous ses yeux. Elle se vide à son départ avec les messages (`demo-reset.service.ts`).',
  // #2430 — l'objet conversation (propriétaire, branche, rattachement,
  // conservation légale) et ses versions figées.
  chat_conversations:
    'L’objet conversation ÉTEND un fil. `chat_messages` porte désormais une conversation d’exemple (#3104, ' +
    '27/09/2026 — raison écrite plus haut), mais aucune ligne n’est semée ici pour elle : une ligne semée décrirait ' +
    'un rattachement, une conservation légale ou un transfert que personne n’a posé — le panneau « Détails du fil » ' +
    'ne s’ouvre que sur ce que le visiteur y fait lui-même. Aucune écriture ici n’appelle de modèle : brancher, ' +
    'transférer, rattacher ou poser une conservation légale se fait sous les yeux du visiteur, et la table se vide ' +
    'à son départ (`demo-reset.service.ts`).',
  chat_conversation_versions:
    'Une version figée est une BORNE sur un fil existant (son dernier message) : sans que le VISITEUR la crée, ' +
    'rien à borner — la conversation d’exemple de `chat_messages` (#3104) n’en a besoin d’aucune. Il la crée lui-' +
    'même en partageant « version figée » après un échange — aucun appel de modèle — et elle part avec ses ' +
    'messages à son départ (`demo-reset.service.ts`).',
  // #3236.2(b) — la trace persistante d'un approfondissement Laura interrompu
  // (`chat_deepen_jobs`, migration `ChatDeepenJobs1796437700001`, lue par
  // `DeepenJobResumeBanner.tsx` via `GET /chat/deepen-jobs/latest`).
  chat_deepen_jobs:
    'Une ligne n’est écrite QUE quand un vrai tour de chat mode Approfondi épuise son budget de rounds ' +
    '(`chat_deepen_job_report.py`, appelé par `chat_orchestrator.py`). En démonstration, aucun modèle n’est appelé ' +
    '— les réponses sont scriptées (`demo-turn.ts`, même raison que `chat_messages` et `chat_reply_memory_uses` ci-' +
    'dessus/ci-dessous) — donc aucun tour Approfondi ne peut matériellement s’y interrompre. Semer une ligne ' +
    '« queued » afficherait à un prospect une étude interrompue que personne n’a lancée. Le bandeau reste absent ' +
    'par conception (GA-18/GA-19, une absence ne fait aucune ligne) ; la table se vide avec le reste du compte au ' +
    'départ du visiteur (`demo-reset.service.ts`).',
  // #1916.18 / #1916.24 — les éléments de mémoire envoyés à Laura pour une réponse.
  chat_reply_memory_uses:
    'Une trace dit qu’un élément de mémoire est PARTI dans le prompt d’un modèle pour une réponse. En ' +
    'démonstration, aucun modèle n’est appelé : les réponses sont scriptées (`demo-turn.ts`, et la réponse de la ' +
    'conversation d’exemple de #3104 l’est tout autant) et aucun prompt n’existe — une trace semée affirmerait ' +
    'qu’on a envoyé la mémoire du visiteur à un modèle qui n’a jamais tourné. Le panneau « Voir la source » ' +
    'n’apparaît sous une réponse scriptée que si elle porte un contexte — ce qu’aucune ne porte, y compris ' +
    'l’exemple seedé. Réglages › Mémoire de Laura affiche donc « Pas encore consulté par Laura » sous chaque ' +
    'élément semé : c’est VRAI dans une salle où personne n’a encore parlé à un modèle, et la phrase ne peut pas ' +
    'devenir fausse puisqu’aucun modèle n’y parlera.',
  contact_duplicate_decisions:
    '#4114.4 — « ce sont les mêmes » / « pas les mêmes » est le geste du visiteur sur une paire PROPOSÉE : il fonctionne EN DIRECT en salle (le bouton écrit réellement la ligne, scopée à l’espace de démonstration, purgée à chaque reset). La PAIRE, elle, est seedée par les contacts déjà semés (voir `DEMO_CONTACT_DUPLICATE_PROPOSALS_COVERAGE`) : semer une décision déjà prise cacherait la paire que l’écran doit montrer. Rien n’est jamais fusionné.',
  account_feedback:
    'Le retour sur un dossier est une correction faite par le visiteur — #3671 : un signal déclaré faux ne revient plus à l’actualisation, ce qui se voit EN SALLE, en direct. Semer un « faux » inventerait un historique de corrections que personne n’a fait.',
  discover_candidate_feedback:
    '#3671.2bis — « Mauvaise entreprise » est le geste du visiteur sur UNE carte Découvrir, et fonctionne EN DIRECT ' +
    'en salle (le bouton écrit réellement la ligne, scopée à l’espace de démonstration). Elle ne se voit pas sur la ' +
    'recherche SUIVANTE : `discover/registry` et `discover/signals` rendent en démonstration une liste SCRIPTÉE ' +
    '(`demoDiscoverResponse`, court-circuitée avant `withoutWrongCompanyCandidates`), donc aucun SIREN seedé ne peut ' +
    'illustrer l’exclusion sans mentir sur ce que la liste figée montre réellement. Semer une ligne inventerait un ' +
    'signalement que personne n’a fait ; en réclamer une siffle sur une capacité que le script de démonstration ne ' +
    'peut pas honorer.',
  esn_profile_correction_requests:
    "#2018.7 — signaler qu'un champ ENTREPRISE est faux suppose un membre SANS le droit de l'écrire " +
    '(`profile:report` sans `team:manage`) qui voit le champ verrouillé (`ProfileStagePage.tsx`, `lockedCompany`). ' +
    'Or la salle de démonstration a — délibérément — UN seul occupant, toujours propriétaire (#1408, `DemoSeedService' +
    ".seedWorkspace`) : `canEditCompany` y vaut toujours `true`, donc AUCUN champ n'y est jamais verrouillé, et CE " +
    'bouton-là (« Signaler une erreur ») ne peut structurellement pas apparaître — même raison que `team_comments` ' +
    'et `workspace_invitations` juste ci-dessous. #2010.15 ajoute un SECOND geste sur la MÊME table : « Signaler ' +
    "une interprétation » (`ReportAuditInterpretation.tsx`, sur `/settings/profile/audit`) n'est PAS gardé par " +
    '`canEditCompany` — il apparaît pour le propriétaire de la salle aussi. La table reste vide à dessein pour une ' +
    'raison différente : ce geste est la PROPRE demande du visiteur, jamais pré-fabriquée — semer une ligne ' +
    "laisserait croire qu'un signalement a déjà eu lieu avant que quiconque n'ait cliqué.",
  chat_reply_feedback:
    'Un retour sur une réponse de Laura (#1919) est le geste du VISITEUR, et le fil commence vide (`chat_messages`, ' +
    'juste au-dessus) : avant sa première question, il n’y a aucune réponse à noter. En démonstration le geste ' +
    'FONCTIONNE À L’ÉCRAN — les six retours, les motifs, la correction et son périmètre, l’accusé — mais n’écrit ' +
    'rien : les réponses y sont préparées d’avance (`demo-turn.ts`), un retour ne pourrait donc changer aucune ' +
    'réponse suivante, et l’accusé le DIT en toutes lettres plutôt que de promettre un effet qui n’aura pas lieu. ' +
    'Seeder des retours afficherait sous des réponses des avis que personne n’a donnés.',
  team_reviews:
    'Théo D team-review.N1 — le compte rendu d’un point d’équipe est la TRACE d’un geste du visiteur (« Enregistrer les décisions »), écrite au moment où il clique. Aucun écran ne liste les points passés : l’écran qui compte, le parcours en trois étapes `/team/review`, se remplit depuis les retards et les affaires de la salle (`/manager/team-stats`, semées), pas depuis cette table. En semer une ferait croire qu’un point a déjà eu lieu avant que quiconque l’ait tenu — même raison que `team_comments`.',
  work_context_activations:
    "#2455.5 — la trace n'existe QUE quand le visiteur clique « Activer » sur un contexte " +
    '(`WorkContextsService.activate`, geste live comme `chat_reply_feedback` juste au-dessus) : le contexte ' +
    "lui-même (`work_contexts`) est semé pour que l'écran ne s'ouvre jamais vide, mais semer une activation " +
    "afficherait une bascule que personne n'a faite.",
  account_shares:
    '#4158.13 (Louis, 14/10/2026) — RENVERSEMENT ASSUMÉ : la salle compte désormais TROIS collègues fictifs (`DEMO_COLLEAGUES`, `DemoSeedService.seedColleagues`). Un partage est un geste du visiteur vers un destinataire : le semer ferait croire qu’un dossier a déjà été partagé avant que quiconque ait cliqué.',
  workspace_invitations:
    'Inviter quelqu’un depuis une salle de démo n’a pas de sens. Le bouton « Renvoyer » d’une invitation en attente (#4158.2) vit sur ces lignes : sans invitation, il n’apparaît pas.',
  workspace_join_requests:
    'La demande d’accès à un espace existant (#2016) naît d’une adresse PROFESSIONNELLE qui correspond à une autre entreprise déjà servie : le visiteur d’une salle de démonstration arrive sur un compte de la réserve, dont le domaine n’appartient à aucune entreprise, et la détection ne trouve donc rien — c’est la bonne réponse. Semer une demande montrerait soit un inconnu qui frappe à la porte d’une salle d’un seul occupant, soit l’adresse d’un vrai espace client à un prospect. Ni l’un ni l’autre n’est montrable.',
  workspace_active_selections: 'État d’interface propre à la session du visiteur.',
  product_events: 'Télémétrie produit — écrite par l’usage, jamais seedée.',
  provider_costs:
    'Le coût fournisseur d’un run est écrit par un run RÉEL. Une démo n’en lance aucun : y seeder des euros inventerait une facture.',
  // Épopée #2879 (#2442.14 / #2442.15) — le premier compteur de sécurité.
  security_events:
    'Aucune tentative d’accès refusé authentique ne se produit en démo — provoquer un 401/403 pour peupler la table fabriquerait un incident de sécurité fictif. L’alerte qui en dérive vit au back-office (Sentry), jamais côté application, même raison que `provider_costs` et `workspace_budgets` juste au-dessus.',
  // #2975 — les cinq leviers admin (budget mensuel, plafonds membre/action,
  // alerte, blocage) vivent au BACK-OFFICE, jamais côté application : le coût
  // ne s'affiche jamais à l'utilisateur (doctrine). Semer un budget montrerait
  // le même chiffre à chaque visiteur d'une salle publique, sans qu'aucun
  // admin de CET espace ne l'ait réglé — un réglage qui n'appartient à
  // personne n'est montrable.
  workspace_budgets:
    'Les leviers de coût sont un réglage ADMIN back-office, jamais affiché côté application. Semer un budget dans une salle de démo publique montrerait un réglage que personne n’a fait.',

  // — Ce qui n'existe QUE branché à un outil réel. Simuler une connexion
  //   afficherait « CRM connecté » alors que rien ne l'est : le copilote et
  //   l'export promettraient une action impossible.
  crm_connections:
    'Aucun CRM n’est connecté en démo — l’écran doit le dire, pas faire semblant. ⚠️ Lot D01 (06/10/2026, #3719) : la carte d’export de la fiche contact propose, elle, un connecteur CRM FICTIF marqué « démonstration » (`CrmStatus.demo`, rendu par `CrmService.getStatus` quand l’espace est une salle) — AUCUNE ligne `crm_connections`, aucun jeton, aucune écriture externe : `exportContact` répond `demo-<empreinte de l’adresse>` sans réseau. La table reste donc vide, et `connected` reste `false` partout ailleurs. ⚠️ 16/10/2026 (lot CRM-ENVOI) : la fenêtre « Envoyer vers … » liste, elle, TROIS CRM fictifs (`DEMO_CRM_PUSH_TARGETS` : HubSpot et Salesforce écrivables, Odoo en lecture seule avec sa raison) pour montrer le choix de plusieurs destinations — toujours aucune ligne `crm_connections`, l’envoi répond `demo-<empreinte>` sans réseau (`CrmPushService.targets`). ⚠️ #4187.6 (17/10/2026) : le connecteur Zoho CRM n’a AUCUNE table propre (`ZohoService` ne lit que `crm_connections` et `user_actions`) — il est donc classé ICI : vide à dessein comme les autres CRM, `ZohoService.getStatus` répond « non connecté » après une seule lecture en base, aucun appel réseau ne part, et la carte Zoho n’apparaît « connectée » qu’après une lecture réussie chez un vrai compte Zoho (jamais fabriquée en salle). ⚠️ #4431 (21/10/2026) : la colonne `login_url` (le domaine d’organisation Salesforce saisi sur la carte) vit sur cette même table et reste donc vide en salle — un domaine d’organisation ne se fabrique pas, il n’existe que pour un vrai compte branché ; la carte Salesforce de la démonstration montre le champ vide, sans domaine inventé.',
  google_connections:
    'Idem : pas de compte Google connecté à une salle de démo. #4546 (plusieurs boîtes par commercial) ne change pas la réponse : une ligne porte des jetons chiffrés réels, et en semer deux « boîtes » afficherait des adresses branchées que personne n’a consenties. #4546.11 : l’écran liste existe (Intégrations › Google Workspace, `GoogleMailboxes`) ; en démonstration il ne rend aucune ligne et propose seulement « Ajouter une boîte » — vide à dessein, jamais une adresse inventée.',
  microsoft_connections:
    'Idem : pas de compte Microsoft connecté. #4546 : plusieurs boîtes Outlook par commercial n’y changent rien — aucun jeton réel, donc aucune adresse à afficher. #4546.11 : la liste Outlook (`MicrosoftMailboxes`, Intégrations › Microsoft 365) ne rend aucune ligne en salle, comme celle de Google — vide à dessein.',
  notion_connections: 'Idem : pas d’espace Notion connecté.',
  connector_scope_gaps:
    'SCOPES-I (18/10/2026) — l’écart entre les portées demandées et accordées d’une connexion OAuth RÉELLE. Aucun connecteur n’est branché en démonstration (`crm_connections`, `google_connections`, `microsoft_connections` sont vides pour la même raison), donc il n’y a aucune portée à comparer : en seeder une afficherait « une autorisation manque » sur une connexion qui n’existe pas.',
  api_keys: 'Une clé d’API seedée serait un secret partagé entre visiteurs.',
  // Théo D settings-outils.N1 — le cadre d'un accès futur.
  mcp_access_intents:
    'Une demande d’accès est l’intention d’une VRAIE personne de brancher SON assistant, tranchée par un vrai administrateur. En seeder une attribuerait à quelqu’un de la salle un assistant qu’il n’a jamais voulu brancher.',

  // — Ce qui ne doit surtout pas être joué depuis une salle publique.
  //
  // ⚠️ `outreach_sequences` N'EST PLUS ICI (04/09/2026, #1509→#1515). Sa
  // justification — « une séquence sortante seedée laisserait croire que des
  // e-mails partent » — ne tenait plus : l'écran le DIT trois fois (le bandeau
  // des canaux, la mention sous la fenêtre de création, et les statuts
  // eux-mêmes : « Préparée », « Prête à copier », « En attente de ta
  // validation »). Ce que la salle montrait, elle, c'était un cockpit vide —
  // exactement ce que la parité démo existe pour empêcher. Le semis vit dans
  // `seedOutreachSequences` et n'écrit AUCUN brouillon d'e-mail.
  signal_history:
    'L’historique des signaux se construit par la veille quotidienne ; les signaux du dossier sont dans `raw_analysis`. #4759 — l’outil « historique des besoins » de Laura lit AUSSI les offres datées du dossier (`raw_analysis.it_job_signals`, semées, dont un besoin Java de novembre 2025 chez SNCF) : la démo cite un besoin passé sans y fabriquer de date de détection.',
  // #2650.2 — la ligne « Remboursement : rafraîchissement déjà payé dans les
  // 6 h » est une ligne de CE registre : sans débit en démo, il n'y a rien à
  // rembourser, et une ligne seedée rendrait un crédit jamais pris.
  credit_ledger:
    'Aucun crédit n’est débité en démo : un mouvement seedé contredirait le bandeau. Un remboursement de rafraîchissement déjà payé dans les 6 h n’a donc aucun débit à rendre.',
  consultant_cv_rewrites: 'La réécriture de CV est justement ce que la démo fait faire en direct.',
  skill_alias_proposals:
    'La file d’enrichissement se remplit toute seule dès qu’un utilisateur saisit une compétence que le catalogue ne connaît pas. En seeder une afficherait un mot que personne n’a écrit, à trancher par quelqu’un qui n’a rien saisi — et la file du visiteur suivant hériterait de la décision du précédent.',
  cv_versions:
    'Un dossier de compétences est ce que la démonstration fait COMPOSER en direct : le visiteur choisit une version, voit les compétences sans preuve barrées avec leur raison, et télécharge le fichier. Le pré-remplir retirerait le geste — et afficherait un dossier qu’aucun visiteur n’a demandé, portant le nom d’une personne d’exemple.',
  need_plays:
    'Préparer l’attaque d’un besoin est justement le geste que la démo fait faire en direct (même raison que la réécriture de CV) — un plan seedé montrerait le résultat sans montrer le produit.',
  consultant_push_feedback: 'Retour donné par le visiteur sur un profil poussé.',
  library_items: 'Semés paresseusement au premier affichage (`LibraryService.ensureSeeded`) — pas d’ici.',
  account_vocabulary: 'Vocabulaire dérivé d’un run réel ; aucun run ne tourne en démo.',
  // Les relevés et les affectations ne figurent pas ici : ils pendent d'une
  // mission, pas d'un espace, et partent avec elle (DEMO_PURGE_JOIN_TABLES).
  // ⚠️ `approval_requests` a QUITTÉ cette liste le 27/09/2026 (#2946) — voir
  // `DEMO_SEEDED_TABLES` ci-dessus pour la raison : une approbation PRÉ-SEMÉE
  // s'y ajoute désormais, pour que la tâche `action_os_approval` du pont
  // Action OS → Tâche ne reste plus sans exemple. Le geste INTERACTIF décrit
  // ici (lancer SOI-MÊME un workflow et voir SA PROPRE demande apparaître)
  // reste entier sur toute autre définition du catalogue — cette ligne ne
  // pré-remplit qu'UNE approbation, pas le mécanisme.
  credit_reservations: 'Aucun crédit n’est débité en démo : une réservation contredirait le bandeau.',
  crm_pipeline_syncs:
    'Trace de la lecture qui remplit `crm_deal_facts` depuis un CRM CONNECTÉ : les trois affaires de démonstration (fournisseur `demo`) ne viennent d’aucune lecture — une date de synchronisation seedée dirait qu’on a lu un CRM qu’on n’a jamais ouvert.',
  commercial_audit_feedback:
    '#2075.12/.13 — commenter une conclusion de l’audit commercial, refuser une recommandation : c’est le geste du VISITEUR sur l’audit que la salle lui montre, et la table se remplit dès qu’il le fait. En semer afficherait des commentaires et des refus signés par des gens qui n’existent pas, sur des conclusions que personne n’a lues — même raison que `record_field_audit`. La table est purgée à chaque bail (`DEMO_PURGE_TABLES`).',
  pipeline_stage_labels:
    'Le renommage des étapes est un réglage d’espace. Une salle de démonstration montre le vocabulaire PAR DÉFAUT — c’est lui que le prospect doit reconnaître, et renommer une colonne est justement le geste qu’on lui fait faire.',
  deal_stage_sla:
    'Les durées cibles d’étape (PDF 3 §3.5) sont un réglage d’espace, exactement comme les libellés ci-dessus. ' +
    'Une ligne absente veut dire « le défaut du produit » — 7 / 14 / 7 / 21 jours — et c’est précisément ce qu’un ' +
    'prospect doit voir : les seuils que NOUS proposons, pas ceux d’une ESN fictive. En seeder d’autres valeurs ferait ' +
    'découvrir le produit avec des durées que personne n’a choisies, et masquerait le geste qu’on fait faire au visiteur : ' +
    'régler un seuil et voir la file d’interventions changer.',
  loss_reasons:
    'Le catalogue des motifs de perte appartient à l’ESN : les raisons de perdre d’une ESN cyber ne sont pas celles d’une ESN data. En inventer afficherait, sur un écran de démonstration, des motifs qui ne parlent à personne.',
  custom_field_defs:
    'Les champs personnalisés d’une ESN sont son vocabulaire à elle. En inventer afficherait « Référence marché » ou « Segment » à un prospect dont l’entreprise n’utilise ni l’un ni l’autre — et la borne des dix se lirait déjà entamée sans qu’il ait rien fait.',
  custom_field_values:
    'Sans définition de champ, il n’y a pas de valeur à porter (`custom_field_defs` est vide pour la même raison).',
  proofs:
    'Une preuve est une affirmation qu’on a RELUE et qu’on assume devant un client. En fabriquer pour la démonstration attribuerait à l’ESN du visiteur des résultats qu’elle n’a pas obtenus — c’est exactement la ligne que le jeu de données s’interdit de franchir. ' +
    '⚠️ **#1612.1 (09/09/2026), la « compatibilité technique observée », est couverte par CETTE MÊME entrée** — un badge s’affiche quand une preuve et l’environnement technique OBSERVÉ du compte (`AccountMarketContext.observed_stack`) partagent au moins deux technologies (`technicalCompatibilityObserved`, seuil `TECHNICAL_COMPATIBILITY_MIN_SHARED`). Le badge reste invisible en démonstration pour une SECONDE raison, indépendante de la première et plus dure : `observed_stack` n’est JAMAIS une donnée de ce jeu de données. Il vient de la table des signaux de marché (`market-company-signal.entity.ts`), la mémoire marché PARTAGÉE entre tous les espaces (aucun `workspace_id`, GA-16) — nommée ici par son ENTITÉ et non par sa table, parce que la garde scanne les chaînes de ce fichier pour attraper une requête brute (`SELECT`) qui contournerait la façade — et elle lit ce qui est entre accents graves comme du SQL, si bien qu’un mot-clé de jointure écrit ainsi, suivi d’un chemin de fichier lui aussi entre accents graves, se lirait comme une table, et qu’une justification ne doit pas se faire prendre pour un accès, alimentée par le SEUL import réel que Louis conduit. Faire apparaître le badge en démonstration supposerait donc soit d’écrire dans ce corpus partagé — hors du périmètre de ce chantier (`apps/api/src/modules/market-memory` est hors-champ) et hors de la doctrine (l’ingestion de cette table reste à Louis, elle ne se simule pas depuis un semis) — soit de parier sur ce que ce corpus VIVANT contient AUJOURD’HUI pour l’un des trois comptes réels de la salle (Société Générale, Groupe BPCE, SNCF), une donnée que ce fichier ne contrôle pas et qui peut changer au prochain import. Et attacher une preuve à l’un de ces comptes referait de toute façon la faute que la phrase du dessus refuse : ce ne serait plus une ESN fictive qui s’attribue un résultat qu’elle n’a pas obtenu, mais un résultat attribué — même anonymisé — au dossier d’une entreprise RÉELLE et nommée, en pire. Le geste reste démontrable ailleurs : `technicalCompatibilityObserved` a sa suite (`packages/contracts/src/schemas/proof.test.ts`) et l’onglet Preuves la sienne (`apps/web/.../TabProofs.technicalCompatibility.test.tsx`), toutes deux sur des libellés de test — jamais sur un compte de démonstration ni sur le corpus partagé. ⚠️ **#1638.2 (11/09/2026), le « contexte de marché » d’une preuve — courante / spécialisée / rare dans notre référentiel — est couvert par CETTE MÊME entrée, et pour les DEUX mêmes raisons.** Une ligne s’affiche sous une preuve quand une technologie qu’elle déclare reçoit un palier (`technoPrevalenceOf`, bornes calculées en quantiles sur la distribution du corpus). Sans preuve, aucune technologie déclarée, donc aucun palier : la première raison suffit déjà. La seconde tient toute seule — le palier se calcule sur la mémoire marché PARTAGÉE, que ce jeu de données ne sème pas et ne doit pas semer, et le seul moyen d’en voir un en démonstration serait d’attacher une preuve inventée à l’un des cinq comptes RÉELS de la salle. Le geste reste démontrable ailleurs : le calcul a sa suite (`packages/contracts/src/schemas/market-techno-prevalence.test.ts`), la façade la sienne (`apps/api/src/modules/market-memory/market-memory-techno-prevalence.spec.ts`) et l’onglet la sienne (`apps/web/.../TabProofs.technoPrevalence.test.tsx`), toutes sur des libellés de test. ⚠️ **#2124.49 à .55 (14/09/2026), les champs de preuve — problème traité, résultat obtenu, expertise mobilisée, autorisation de citation, source, date, version — sont couverts par CETTE MÊME entrée, et la raison du dessus tient MOT POUR MOT : une preuve reste une affirmation qu’on assume devant un client, et en fabriquer une pour la démonstration attribuerait au visiteur un résultat qu’il n’a pas obtenu.** Ce qui CHANGE, et qui vaut d’être écrit : la décision de Louis du 14/09 (« Laura les propose, l’humain valide ») rend la capacité démontrable SANS rien semer ici. La proposition est CALCULÉE en lecture seule (`proposeProofFields`, fonction pure) à partir d’enregistrements déjà semés — la mission terminée du client d’exemple (« Migration du socle applicatif vers les conteneurs — lot 1 »), son rôle (« Architecte de plateforme ») et le besoin qui lui est rattaché. Le visiteur ouvre donc « Proposer les champs de preuve » sur cette mission et voit exactement le geste qu’il y a à montrer : ce que Laura reprend, d’où elle le reprend, et ce qu’elle laisse VIDE faute de retour de mission recueilli (`rex_entries` est vide pour sa propre raison, juste en dessous). La table, elle, reste vide tant que personne n’a cliqué « Valider » — même motif que `account_park_reasons` et `need_unstaffable_reasons` : le catalogue se remplit au PREMIER geste du visiteur, et des propositions lui sont montrées sans être écrites. Y seeder une preuve ferait l’inverse : elle afficherait des champs validés par personne, sur un résultat que personne n’a obtenu. ⚠️ **#2424.6 (23/09/2026), le TYPE de preuve (`content_type` : livrable, résultat chiffré, certification, méthode, étude de cas, référence technique, reconnaissance, logo client) est couvert par CETTE MÊME entrée, et pour LA MÊME raison** : classer une preuve n’existe que si la preuve existe, et ce jeu de données n’en sème aucune. ⚠️ **#2424.4 (23/09/2026), LA RÉFÉRENCE EXTERNE — canaux autorisés (`allowed_channels`), durée de validité accordée (`validity_duration_months`) et échéance qui en découle (`valid_until`) — est couverte par CETTE MÊME entrée, et pour LA MÊME raison** : ces trois champs ne prennent un sens que sur une preuve déjà écrite, et ce jeu de données n’en sème aucune.',
  testimonials:
    'Un témoignage engage un accord ÉCRIT d’un vrai client. En fabriquer un, même fictif, montrerait à un prospect la mécanique exacte d’une fausse référence.',
  // #3295 (13/10 : 2e REX sur ENGIE, MÊME motif que BNP) — vide pour UNE seule raison désormais : `lost_deal_rex` est SEMÉE
  // (décision Louis, brief P01 07/10, sur un vrai dossier — voir
  // `DEMO_SEEDED_TABLES`), mais un SEUL REX ne suffit jamais à proposer :
  // NO-GO #3272.7 exige au moins DEUX REX CONVERGENTS, imposé jusqu'en base.
  // Fabriquer un second REX pour franchir ce seuil referait la faute que la
  // décision du 07/10 vient de corriger — une perte inventée sur un dossier
  // réel — donc le seuil reste honnêtement non atteint.
  lost_deal_rule_proposals:
    'Une proposition naît du CLIC du visiteur sur « Proposer une règle » (au moins deux REX de perte CONVERGENTS, NO-GO #3272.7) : la salle en sème DEUX au MÊME motif (BNP Paribas et ENGIE : hors panel / mauvaise personne — deux vrais dossiers, voir `lost_deal_rex` dans `DEMO_SEEDED_TABLES`), donc le geste se joue en salle. Semer la proposition elle-même ferait décider quelqu’un à la place du visiteur : le parcours Proposer → Adopter → Activer commence à son clic.',
  // #3295 — la règle PROMUE d'une proposition adoptée : elle descend de
  // `lost_deal_rule_proposals` (aucune adoptée sans proposition), donc elle
  // hérite de son vide, pour la même raison (un seul REX, jamais deux
  // convergents). En fabriquer une rendrait à Laura une règle apprise de
  // pertes qui n'ont jamais eu lieu — la donnée fictive que la doctrine
  // refuse. L'écran, lui, se montre : état vide qui nomme le geste
  // (« Proposer une règle »).
  workspace_method_rules:
    'Naît d’une proposition d’apprentissage ADOPTÉE puis ACTIVÉE par un responsable ; `lost_deal_rule_proposals` reste vide pour sa propre raison (le visiteur propose au clic), donc aucune règle apprise ne peut exister avant son geste — Laura ne cite jamais une règle que personne n’a adoptée.',
  need_unstaffable_reasons:
    'La liste de ce que l’ESN ne sait pas faire lui appartient : « habilitation non détenue » ne veut rien dire chez une ESN data et tout chez une ESN défense. Le catalogue se remplit au premier refus du visiteur, et sept propositions lui sont montrées sans être écrites.',
  account_park_reasons:
    'Les motifs d’écartement appartiennent à l’ESN : les raisons de dire non d’une ESN cyber ne sont pas celles d’une ESN data. Le catalogue se remplit au PREMIER écartement du visiteur, et sept propositions par défaut lui sont montrées sans être écrites — un catalogue pré-rempli affiche sept usages à zéro et donne l’illusion d’une liste tenue que personne n’a relue.',
  sites:
    'Un site est une implantation que l’ESN RETIENT parce qu’elle y va — c’est le geste que la démonstration montre, et le pré-remplir affirmerait que le visiteur staffe déjà chez EDF. L’onglet Sites n’est pas vide pour autant : il lit le REGISTRE (`raw_analysis.branches`, seedé), pas les sites retenus.',
  connector_capability_probes:
    'Une preuve de capacité s’écrit quand quelqu’un TESTE un outil branché, et une salle de démonstration n’en branche aucun (`google_connections` et `crm_connections` sont vides pour la même raison). En seeder afficherait « vérifié il y a 4 minutes » sur des connexions qui n’existent pas — c’est précisément le mensonge que ce chantier corrige.',
  tool_latency_observations:
    '#2261.13 — une observation de latence s’écrit à CHAQUE synchronisation RÉELLE d’un outil branché, et une salle de démonstration n’en branche aucun (même raison que `connector_capability_probes`, sa voisine la plus proche). En seeder afficherait une latence mesurée sur une synchronisation qui n’a jamais eu lieu — la fiche de l’outil dit « non mesuré » en démonstration, jamais un chiffre inventé.',
  connector_capability_incidents:
    '#2445.12 (épopée #2766) — une transition (ok → erreur, erreur → ok) s’écrit quand un outil RÉELLEMENT branché change d’état, et une salle de démonstration n’en branche aucun (même raison que `connector_capability_probes`, sa voisine la plus proche). En seeder afficherait une chronologie d’incident sur un connecteur qui n’a jamais existé.',
  invoice_connector_write_requests:
    'Une tentative d’écriture « facture chez le connecteur » (#2565) suppose un outil de gestion branché, et aucun ne l’est en démonstration. L’adaptateur RETENU (`RetainedInvoiceConnectorPort`) ne fait NI requête HTTP NI import réseau — le refus est le même que l’absence d’outil : `POST /delivery/invoice-connector/send` répond « aucun outil de gestion connecté », avant même de créer une ligne. En seeder une afficherait une facture prétendument créée chez un fournisseur que personne n’a branché. ⚠️ **Relu le 18/09/2026 (#2565.10), à l’arrivée de l’adaptateur Odoo** (`OdooDraftInvoiceConnectorPort`, un BROUILLON de facture, jamais validé) : la raison tient, et elle est EXÉCUTÉE, pas affirmée. Côté serveur, l’adaptateur lit le lien Odoo de l’espace dans `crm_connections` — vide à dessein en démonstration — et refuse AVANT tout appel : `odoo-draft-invoice.port.spec.ts`, « aucune instance branchée sur l’espace → `failed`, ZÉRO appel réseau », rougit si un `fetch` part. Côté écran, le geste reste montrable de bout en bout : sur la fiche d’une mission PRÊTE (la salle en porte, `demo-account-invoice-readiness-coverage.spec.ts`), la prévisualisation s’ouvre, dit que c’est un brouillon à valider soi-même, et dit que la démonstration n’écrit dans aucun outil — sans bouton « Valider » ni requête (`MissionDetailTabs.test.tsx`, « en démonstration… »). Montrer le geste vivant vaut mieux que seeder une tentative.',
  import_sessions:
    'Une session d’import est ce que le VISITEUR produit s’il essaie l’assistant — et l’essayer est justement le geste que la démonstration montre. En pré-remplir une retirerait le geste, et afficherait un historique de reprises que personne n’a faites. ⚠️ **Relu le 29/08/2026, à l’arrivée de la reprise d’import interrompu** (état `partial`, panneau « Reprendre là où ça s’est arrêté ») : la raison tient, et elle se durcit. Seeder une session interrompue afficherait « 4 000 lignes sur 17 000 ont été écrites » dans une salle où rien n’a jamais été importé — une panne inventée, sur des lignes inventées, avec un bouton d’annulation qui n’annulerait rien. C’est exactement la donnée fictive que le dépôt s’interdit, et le geste RESTE montrable : le visiteur dépose son propre fichier et voit la simulation. ⚠️ **Relu le 04/09/2026 (#1452.3) : la raison tient, et l’écran ne se découvre plus MUET pour autant.** « Imports précédents » disparaissait entièrement quand la liste était vide — dans une salle de démonstration, c’est-à-dire TOUJOURS. Le bloc garde désormais son entête et NOMME le vide (« aucun import pour l’instant »), et distingue « je n’ai pas pu regarder » de « il n’y en a pas ». Un vide à dessein doit se DIRE : sinon le visiteur ne conclut pas « rien à montrer ici », il conclut que la fonction n’existe pas. ⚠️ **Relu le 14/10/2026 (#4051, recette prod) : la raison tient, et le bilan par famille de l’assistant de reprise se montre sur le fichier que le visiteur dépose lui-même** (le même composant que l’import universel) — rien n’est semé d’avance, une ligne sans société y sort « à valider », nommée.',
  contact_intake_exclusions:
    'Un candidat jamais devenu une fiche (identité ambiguë ou doublon détecté avant création) ne s’écrit que lorsqu’un import CSV ou une confrontation CRM réelle le refuse. La salle de démonstration ne rejoue aucun de ces deux flux au semis — y injecter des lignes affirmerait qu’un import ou une confrontation a eu lieu, alors que personne ne l’a fait. Le geste RESTE montrable de bout en bout : un import CSV portant une ligne déjà présente sur le compte (même e-mail, téléphone ou LinkedIn) déclenche une exclusion réelle, écrite par `ContactIntakeService`. ⚠️ **Relu le 08/10/2026 (#3933, retour bêta Louis) : le lecteur a disparu, pas la raison.** Le bandeau d’entonnoir de `/contacts` (`ContactsFunnelBand`) qui affichait cette exclusion est SUPPRIMÉ ; aucun écran ne relit plus `preCreationExclusions` aujourd’hui. Le geste reste exécutable et vérifiable par API (`contacts.service.spec.ts`), mais plus par capture d’écran — à nommer si un écran futur veut la remontrer.',
  contact_stops:
    'Un arrêt est un REFUS PRONONCÉ par une vraie personne. En seeder un ferait dire « ne me contactez plus » à un interlocuteur d’une société réelle qui n’a jamais rien demandé — la donnée fictive la plus lourde que ce jeu puisse porter, puisqu’elle attribue une parole à quelqu’un. Le geste RESTE montrable de bout en bout : le visiteur déclare lui-même l’arrêt depuis une fiche (`POST /contacts/:id/stop`), et voit immédiatement l’armement d’une séquence lui être refusé sur ce contact. Montrer le refus VIVANT vaut mieux que le montrer déjà posé. ⚠️ **Relu le 01/09/2026 : cette phrase était une INTENTION, pas un fait.** La route existait, aucun écran ne l’appelait — le visiteur ne pouvait rien déclarer du tout. La carte « Refus de contact » du Résumé d’une fiche rend la justification vraie ; sans elle, cette ligne aurait été un « vide à dessein » dont la raison ne tenait plus. ⚠️ **Relu le 27/09/2026 (#2934, #2309.11/.12/.16/.17/.19/.20/.21) : un second lecteur, la même raison.** Le funnel de couverture de `/contacts` (« Voir le critère de chaque étape ») nommait « dont N arrêts déclarés » quand la population filtrée en compte — `ContactsService.rejectionReasonsTally`, `contacts.service.spec.ts`. La raison ci-dessus tenait MOT POUR MOT : la table reste vide en démo, donc cette ligne n’apparaît jamais dans la salle — « on n’affiche pas ce qu’on n’a pas », pas un « 0 » nu. `email_suppressions` (désinscription) est le même lecteur, même verdict — cette table est HORS du périmètre de cette garde (`DEMO_KEEP_TABLES`, jamais purgée, jamais classée ici) : voir `demo-reset.service.ts`. La troisième raison, « doublon d’une autre fiche du compte », lit `contacts` lui-même (déjà seedé) mais reste également à zéro en démo : les cinq dossiers d’exemple sont volontairement propres, même raison que `duplicate_pairs` ci-dessus. ⚠️ **Relu le 08/10/2026 (#3933, retour bêta Louis) : ce second lecteur a disparu.** Le bandeau d’entonnoir de `/contacts` qui portait « Voir le critère de chaque étape » est SUPPRIMÉ. `rejectionReasonsTally` reste calculé et testé (`contacts.service.spec.ts`), mais plus aucun écran ne le relit — la raison du vide tient toujours (la table reste vide en démo), elle n’a simplement plus qu’un lecteur API, pas un lecteur écran.',
  // #2777 — la sortie `learnings` de la cascade compte rendu.
  account_memory:
    'Un apprentissage (une objection entendue, un engagement pris) s’écrit quand un commercial VALIDE la carte « apprentissages » d’un compte rendu — c’est un geste, pas un fait connu d’avance. Le geste RESTE montrable de bout en bout en démonstration : la structuration scriptée du compte rendu (`demoRecap`) peut produire une carte « apprentissages » à partir des notes tapées, et la valider écrit réellement dans `account_memory` (même porte qu’en production, aucun chemin distinct). Ce qui manque encore, et c’est la vraie raison du vide : AUCUN écran ne relit cette table pour l’afficher sur une fiche compte — seule la carte de cascade existe, et elle affiche le compte rendu qu’elle vient de produire, pas la mémoire déjà accumulée. Seeder une ligne ici la rendrait invisible partout : ni la fiche compte ni aucune autre vue ne la montrerait, ce qui serait exactement « du code juste, calculé, testé, que personne n’appelle » côté données plutôt que côté code. La table part avec `account_memory` dans le balayage de reprise de la salle (`demo-reset.service.ts`), pour la même raison que `contacts` : un apprentissage laissé par le visiteur précédent ne doit pas se lire comme un fait connu du suivant.',
  // #2297 — décision Louis 19/09/2026 : l'effacement ne s'exerce pas en démo.
  person_erasures:
    'Un effacement est la réponse à une DEMANDE RGPD (art. 17) d’une vraie personne, et il supprime pour de bon. En seeder un attribuerait à quelqu’un une demande qu’il n’a jamais faite — et la trace, faite d’empreintes, ne montrerait rien de lisible de toute façon. Le geste ne s’exerce pas non plus en démonstration (décision Louis 19/09/2026) : la salle est PARTAGÉE entre visiteurs, et un visiteur qui effacerait une fiche la retirerait à tous les suivants, définitivement — le même chemin d’abus que la suppression de compte refuse déjà sur une salle. La route répond « non disponible en démonstration » avant toute écriture (`person-erasure.service.spec.ts`), et la carte « Effacer cette personne » ne se montre pas sur une fiche de démonstration (`ContactErasureCard.test.tsx`).',
  crm_sync_cursors:
    '#4189/#4187 (14/10/2026) — le curseur de la synchro incrémentale d’un CRM (Salesforce, Pipedrive, Attio, Odoo, Zoho) : une ligne par (espace, fournisseur, objet), posée par une reprise RÉELLE chez un CRM branché. Aucun CRM n’est branché en démonstration (`crm_connections` est vide pour la même raison) : c’est un connecteur EXTERNE, et aucune donnée d’un tiers ne se fabrique en salle. En seeder un afficherait « dernière synchro il y a 2 heures » sur un lien qui n’existe pas. Le geste reste honnête à l’écran : `GET /crm/import/status` ne rend une ligne que pour un CRM BRANCHÉ, donc en salle la liste est vide et la note de périmètre n’affiche rien. Le connecteur Zoho CRM (#4187) suit la même règle que les autres : `ZohoService.getStatus` répond « non connecté » après une seule lecture en base, aucun appel réseau part, et l’écran ne dit « connecté » qu’après une lecture réussie.',
  account_crm_fusions:
    '#4603 (26/10/2026) — le journal des fusions compte venu du CRM ↔ compte créé par l’analyse. Une ligne suppose une PAIRE réelle : une fiche importée d’un CRM branché et un compte analysé de la même société. Aucun CRM n’est branché en salle (`sync_links` et `crm_connections` sont vides pour cette raison), et les cinq dossiers d’exemple sont volontairement propres : semer une fusion obligerait à inventer un doublon archivé sur une société réelle. Ce que la salle MONTRE de #4603/#4604 est l’autre moitié : le bloc « Ce que dit ton CRM » et la provenance du nom (« vient de HubSpot ») sur Société Générale, lus dans le miroir CRM fictif (`crm_deals`, `crm_owners`, `crm_activities`, `field_provenance`, seedés). Le rattrapage reste démontrable : sa simulation (`POST /accounts/crm-fusions/sweep`) répond en salle « 0 paire » — vrai, pas un « 0 » inventé : il n’y en a aucune.',
  sync_links:
    'Un lien d’import suppose un CRM connecté, et aucun ne l’est en démonstration (`crm_connections` est vide pour la même raison). En seeder ferait croire que les dossiers d’exemple viennent d’un vrai CRM. ⚠️ **Relu le 12/10/2026 (#4052) : un second écrivain, la même raison.** L’import universel y écrit les références source d’un fichier (`csv`, préfixées par le CRM déclaré). En salle, le fichier d’exemple de contacts en pose (`EX-C1`, `EX-S1`…) quand le visiteur le joue — le geste reste démontrable, rien n’est semé d’avance, et la salle les purge entre deux visiteurs.',
  sync_runs:
    'L’historique des imports est ce que le visiteur produit s’il simule une reprise — et la simulation est justement le geste que la démonstration montre. Le pré-remplir retirerait le geste.',
  sync_record_events:
    "Le journal par enregistrement pend d’un import, et il n’y en a aucun. Y seeder des lignes attribuerait à un import des contacts qui viennent du jeu d’exemple. ⚠️ **Relu le 15/10/2026 (#4189) : un lecteur écran, la même raison.** Les conflits de synchro (`action = 'conflict'`, colonne `proposal`) se lisent dans la note de périmètre d’un CRM BRANCHÉ (`CrmReadScopeNote`) ; aucun CRM ne l’est en démonstration (`crm_sync_cursors`), la note ne s’y affiche pas, et un conflit seedé sur un lien qui n’existe pas affirmerait une synchro qui n’a jamais eu lieu. Le rendu du conflit est prouvé par `CrmReadScopeNote.test.tsx` et `crm-read-sync-conflicts.spec.ts`. ⚠️ **Renversé en partie le 15/10/2026 (Louis, #4189.8) : la salle MONTRE un conflit.** Sans rien semer en base : `CrmReadSyncService.status` rend, pour une salle seulement, une ligne FICTIVE marquée `demo: true` (`demoCrmReadStatus`, e-mail d'une fiche différent côté Bellum — gardé — et côté CRM — proposé, rien d'appliqué). Les tables restent vides. #4604.7 (26/10/2026) : la version du CRM d’une valeur corrigée à la main se lit dans CE journal (l’écart que l’import garde quand la correction humaine l’emporte) — elle n’existe donc qu’après le geste du visiteur (corriger un nom ou un SIREN) ET un import qui le contredit ; semer l’un ou l’autre inventerait une correction que personne n’a faite. Le bouton « Voir la version de <CRM> » se démontre en réel, pas en salle.",
  // #2327 — LAU-FINAL-068.
  talent_identity_decisions:
    'Une décision sur une paire de fiches (« pas la même personne », « ignorer », « attribuer », « mettre à jour ») est LE geste de l’onglet Identité : la pré-remplir signerait une décision que personne n’a prise, au nom d’un membre fictif — cette raison-là tient toujours, la table reste vide. ⚠️ **Ce qui a changé le 18/09/2026 (#2569.4, lot N) : le « résidu nommé » ci-dessous est FERMÉ.** Avant, cette entrée disait : « la démonstration ne montre pas une proposition de doublon tant que le jeu n’a pas de doublon réel à montrer » — parce que le vivier comptait sept personnes et sept fiches, sans doublon. Le lot N ajoute « Julien Fabre » deux fois : une fiche `qualified` déjà là (`source: referral`) et une fiche `needs_review` née d’un import (`source: cv`), sans e-mail ni téléphone pour les distinguer. Rien n’est PRÉ-CALCULÉ — `GET /talents/:id/identity` compare RÉELLEMENT les deux fiches et rend `ambiguous` (clé `same_name` seule, confiance 0.3), exactement l’état que `decideCvBatchFileAction` aurait isolé en exception à l’import. Le visiteur qui ouvre l’onglet Identité d’une des deux fiches voit donc une VRAIE proposition, qu’il peut décider — et c’est précisément pour ça que la table reste vide : la décision lui appartient.',
  activity_sync_state:
    'La trace de la dernière capture suppose une messagerie, un agenda ou un standard branché — et aucun ne l’est en démo (`google_connections` est vide pour la même raison). Y seeder une date dirait « synchronisé il y a 5 minutes » sur des outils que personne n’a connectés ; les activités visibles, elles, sont seedées et présentées comme le jeu d’exemple qu’elles sont.',
  playbook_subscriptions:
    'Un playbook armé est le seul réglage du produit d’où part un e-mail vers un vrai client sans clic humain. Le seeder ARMÉ sur une salle que des inconnus traversent serait la faute la plus grave possible ; le seeder ÉTEINT ne montrerait rien de plus que l’absence de ligne, qui vaut déjà « éteint » (`enabled` est faux par défaut). L’écran affiche donc les trois playbooks au repos — c’est l’état vrai, et c’est celui qu’un prospect doit voir avant d’armer chez lui.',
  playbook_sends:
    'La relance automatique, de sa préparation à son envoi — depuis le 26/08/2026 la même ligne porte la demande de validation. Aucune ne part en démonstration (`playbook_subscriptions` est vide pour la même raison), et en seeder une afficherait « relance envoyée », ou pire « à valider », pour une société réelle qui n’a jamais rien reçu de nous. Un visiteur pourrait alors CLIQUER sur « Envoyer ».',
  // ⚠️ #2567.K6 (18/09/2026) — `interventions` a QUITTÉ cette liste. L'entrée
  // qui vivait ici (28-29/08/2026, BEL-BO-002) disait déjà, EN TOUTES
  // LETTRES, qu'elle « n'était plus entièrement vraie » depuis que
  // `MyActivityBlock` lisait la table sur l'écran d'arrivée : elle prescrivait
  // même la recette exacte — `renewal_at_risk` sur la mission à 28 jours,
  // `mission_without_end_date` sur les deux missions en régie sans `ends_on`
  // (52 et 138 jours) — sans que rien ne l'écrive. Voir `DEMO_SEEDED_TABLES`
  // ci-dessus et `DemoSeedService.seedInterventions` pour ce qui EST semé
  // maintenant.
  //
  // ⚠️ #2567.3 (18/09/2026) — LES CINQ DOMAINES CLIENT RESTANTS DU REGISTRE K
  // (CRA, facturation, bons de commande, besoins, vivier — voir
  // `.claude/notes/registre-2026-09-18-K-retention.md`, section K.6). Quatre
  // natures de PLUS sont désormais SEMÉES, produites par la dérivation RÉELLE
  // (`DemoSeedService.seedRetentionDomainsSource` +
  // `seedRetentionDomainsDerived`, qui appellent `detectStalledSubmissions` /
  // `detectMissingTimesheets` / `detectBlockedInvoicing` /
  // `detectNeedsWithoutShortlist` d'`intervention-rules.ts` — jamais un
  // `detail` écrit à la main) : `timesheet_missing` (CRA — le relevé du
  // premier mois de « Cadrage données transport — lot 2 », deux relances,
  // jamais déposé), `invoicing_blocked` (FACTURATION — le même mois, bloqué
  // pour quatre raisons déjà posées sur cette mission), `need_without_shortlist`
  // (BESOINS — « Ingénieur systèmes — supervision des systèmes temps réel »,
  // `shortlist: []`, dix-neuf jours d'âge d'étape) et `submission_stalled`
  // (VIVIER — Marc Ouedraogo, positionné depuis seize jours sur « Ingénieur
  // infrastructure — socle conteneurisé du portail », sans retour). Le domaine
  // BONS DE COMMANDE n'ouvre PAS de sixième nature : il se lit dans le
  // bloqueur `missing_po`, cité tel quel par `invoicing_blocked` (même ligne
  // que FACTURATION — c'est la convention que le registre K documentait déjà,
  // « cité DANS le détail texte d'`invoicing_blocked` »).
  //
  // Preuve d'exécution : `demo-retention-domains-coverage.spec.ts` — QUATRE
  // fonctions PURES rejouées sur des lignes qui reproduisent le semis, une
  // intervention exigée par nature, et un test par nature qui la fait
  // RETOMBER À ZÉRO en dégradant le seul fait qui la produit (retirer le
  // semis) : une classification est une affirmation, pas une décoration.
  //
  // `payment_overdue` reste `retenu`, silencieux PAR CONSTRUCTION : les treize
  // mois facturés de la salle portent tous `paid_at` — voir
  // `DEMO_LAURA_BUBBLES_SILENT`. La nature n'est pas nécessaire pour couvrir le
  // domaine FACTURATION (`invoicing_blocked` le fait déjà) ; forcer un
  // encaissement en retard casserait la tuile « Délai de paiement » calibrée
  // ailleurs dans ce fichier (voir `seedInvoiceHistory`, §D42). Les quatre
  // autres natures (`account_untouched`, `rep_inactive`, `credits_exhausted`,
  // `account_no_next_action`, `project_no_decision`) restent non auditées,
  // hors du périmètre de ce lot borné — aucune ligne n'y est fabriquée.
  //
  // ⚠️ #2206.12 (25/09/2026) — LA SIXIÈME NATURE DU COCKPIT RESPONSABLE,
  // « COLLISION ÉQUIPE ». `DemoSeedService.seedStaffingCollisionIntervention`
  // pose `staffing_collision` sur le premier des deux positionnements
  // d'Antoine Rivière — shortlisté sur DEUX besoins ouverts distincts dans
  // `demo-dataset.ts` (le second ajouté par ce lot, sur « Consultant sécurité
  // applicative — parcours d'authentification »). Preuve d'exécution :
  // `intervention-rules.spec.ts` (`detectStaffingCollisionInterventions`).

  // ───────────────────────────────────────────────────────────────────────
  // #2151.70 (16/09/2026) — LES ONZE AUTRES TABLES DE `DEMO_PURGE_USER_TABLES`.
  //
  // La garde de couverture (`demo-coverage.spec.ts`) était AVEUGLE aux tables
  // scopées `user_id` — elle ne lisait que `DEMO_PURGE_TABLES`
  // (`workspace_id`). Élargie pour lire aussi `DEMO_PURGE_USER_TABLES`, elle
  // exige maintenant une réponse écrite pour CHACUNE de ses quatorze
  // entrées. Trois sont SEEDÉES (`notifications`, `user_favorites`,
  // `profile_context_revisions` — voir `DEMO_SEEDED_TABLES`) ; les onze
  // ci-dessous restaient vides, chacune pour une raison MESURÉE dans le code,
  // pas devinée.
  //
  // ⚠️ #2873 (28/09/2026, recette salle démo Maëlle Lorquin) — `routine_runs`
  // est SORTIE de ce groupe : voir `DEMO_SEEDED_TABLES` et
  // `DemoSeedService.seedSequenceCompletedCrmUpdateProposal`. La raison
  // ci-dessous restait juste pour TOUTE LA TABLE tant qu'aucune routine n'y
  // écrivait rien ; #2873 y pose désormais une ligne UNIQUE et `notified:
  // false`, sans changer le fait que le balayeur, lui, ne tourne toujours
  // jamais en démo (voir la raison déplacée pour le détail).
  beta_feedback:
    'Réglages › Mes signalements liste les signalements de l’AUTEUR (`beta_feedback`). Rien n’y est semé : cette table EST la file de tri réelle de l’équipe — le back-office la liste ligne à ligne et la santé des espaces y compte les signalements de bug — donc un signalement fictif y entrerait comme un vrai retour. Et un visiteur ne peut pas en créer non plus : `POST /feedback` refuse toute salle de démonstration avant d’écrire et avant d’appeler le service de tickets. Détail complet : `DEMO_MY_REPORTS_COVERAGE` plus haut dans ce fichier, et `demo-my-reports-coverage.spec.ts`.',
  integrations:
    'Une connexion sortante (Slack, Discord, Teams, webhook générique…) n’existe que si le VISITEUR la crée pendant sa visite — en semer une prétendrait qu’un outil tiers est branché sur une salle où personne ne l’a fait, et nommerait un fournisseur que le produit ne nomme jamais côté app. `demo-reset.service.ts` la purge à chaque bail (`DEMO_PURGE_USER_TABLES`) : sans cette purge, le webhook connecté par un visiteur recevrait aussi les signaux du suivant.',
  integration_deliveries:
    'Enfant d’`integrations` (voir son entrée juste au-dessus) : une livraison de webhook n’existe que si une connexion existe déjà, et aucune n’est pré-semée. Purgée AVANT son parent à chaque bail, pour la même raison exacte.',
  action_plan_items:
    '#4158.31 — UNE tâche ouverte du plan est déléguée à l’occupant avec sa note de contexte (`handoff_note`, écrite par le collègue fictif de `demo-team-continuity.ts`, `seedTeamContinuity`) : la salle montre la note de passation sur la ligne. Le reste : les actions DATÉES d’un plan sont matérialisées EN DIRECT par `CadenceService`, quand un visiteur avance la cadence de relance d’un contact réel du jeu — jamais pré-semées : fabriquer un historique d’interactions jamais jouées serait la donnée fictive que ce jeu s’interdit. `action_plans` (le TEXTE du plan, scopé par espace) est bien seedée — voir `DEMO_SEEDED_TABLES` — c’est cette table-enfant, purgée par visiteur (`DEMO_PURGE_USER_TABLES`), qui reste à zéro tant que personne n’a agi sur un contact.',
  oauth_consents:
    'Le couplage d’un assistant IA personnel (MCP) au compte de démonstration est le geste du VISITEUR — rien n’est pré-semé : inventer un consentement simulerait un appairage que personne n’a fait. Purgée à chaque bail : un consentement posé par un visiteur ne doit jamais être hérité par le suivant.',
  oauth_refresh_tokens:
    'Même famille qu’`oauth_consents` (voir son entrée) — un jeton de rafraîchissement n’existe que si un visiteur a couplé un assistant pendant sa visite. Purgé à chaque bail pour la même raison : un jeton appartient à qui l’a obtenu.',
  oauth_authorization_codes:
    'Même famille qu’`oauth_consents` — un code d’autorisation est en plus À USAGE UNIQUE et de très courte durée de vie : il n’y a littéralement rien de plausible à y pré-semer. Purgé à chaque bail par précaution, comme le reste de la famille OAuth.',
  user_mfa:
    'L’enrôlement 2FA est le geste du VISITEUR. Un secret TOTP semé serait une donnée fictive inutilisable — personne ne détient le générateur correspondant — et surtout VERROUILLERAIT tous les autres occupants de la salle partagée hors de leur propre bail. Purgée à chaque bail pour cette raison précise (voir l’en-tête de `DEMO_PURGE_USER_TABLES`, `demo-reset.service.ts`).',
  routine_subscriptions:
    'L’abonnement à une routine est un RÉGLAGE du visiteur (armer/désarmer un digest) : `RoutinesService.toSubscription` lit une ligne absente comme son défaut désactivé, donc l’écran de réglages n’est pas vide sans elle — il montre l’état « éteint », qui est le vrai état. Rien n’est pré-semé : un abonnement fictif prétendrait qu’un visiteur a déjà réglé un canal qu’il découvre. La ligne, une fois posée par son geste, est purgée au bail suivant.',
  routine_contents:
    '#2843.30 — le gabarit du contenu d’une routine est un RÉGLAGE de l’espace, posé par le visiteur : une ligne absente se lit comme le texte par défaut de la routine, que la fiche montre tel quel (« texte par défaut »). Semer un gabarit prétendrait qu’un visiteur a déjà réécrit un texte qu’il découvre. Purgée à chaque bail.',
  routine_preferences:
    '#2843.13 — l’autonomie et l’owner d’une routine sont des RÉGLAGES du visiteur, comme l’abonnement : une ligne absente se lit comme le défaut du catalogue (niveau de la fiche, l’abonné lui-même), donc les sélecteurs de la fiche ne sont jamais vides — ils montrent le vrai défaut. Semer un réglage prétendrait qu’un visiteur a déjà baissé une autonomie qu’il découvre. Purgée à chaque bail.',
  framing_decisions:
    'Théo O onboarding-relecture.N1 — retenir, remettre à plus tard ou écarter une orientation du cadrage est le geste du VISITEUR sur sa relecture : semer une décision prétendrait qu’une personne a déjà tranché ce que le visiteur découvre. Les orientations elles-mêmes (règles locales sur les réponses du questionnaire, elles-mêmes semées) s’affichent sans décision : l’état réel d’un cadrage jamais relu. Purgée à chaque bail pour que le geste d’un visiteur ne se lègue pas au suivant.',
  user_onboarding_transitions:
    'Le journal des transitions d’état de l’onboarding — une trace d’exécution qui grossirait sans fin sur le compte partagé si elle n’était pas purgée à chaque bail. #2897 lui a donné un premier LECTEUR (`OnboardingService.getRedesignBannerState`, la bannière « BellumAI a été repensé ») : une table absente n’y est plus « jamais lue », mais son ABSENCE reste le bon état — `user_onboarding_state` est seedée directement en `completed` (voir son docblock, `demo-dataset.ts`), donc aucune transition réelle n’a jamais eu lieu, et « avant ou après la refonte » est authentiquement INCONNU pour ce compte. `firstOnboardingCompletionAt` rend alors `null`, la bannière reste invisible — voir `DEMO_WELCOME_REDESIGN_BANNER_COVERAGE` ci-dessous, classée pour cette raison précise plutôt que « rien à semer ». #2021 (08/10/2026) lui a donné un second LECTEUR, même dérivation — `getState` expose `first_completed_at`, et `null` y garde aussi le bandeau de reprise invisible en démo (voir `DEMO_ONBOARDING_REFRESH_BANNER_COVERAGE` ci-dessous).',
  // #2104.6/.7/.8 (22/09/2026) — même famille que `action_plan_items` juste
  // au-dessus : la décision (traité, non pertinent, rattaché à un compte) est
  // le geste du VISITEUR sur un fil de messagerie fictif, jamais pré-semée —
  // fabriquer une décision jamais prise serait la donnée fictive que ce jeu
  // s’interdit. Contrairement à `mail_send_batches` (qui échoue AVANT toute
  // écriture en démo, aucun connecteur réel n’étant jamais branché), marquer
  // ou rattacher un fil n’appelle aucun connecteur : le geste FONCTIONNE
  // réellement en démo, et la ligne posée est purgée au bail suivant
  // (`DEMO_PURGE_USER_TABLES`, `demo-reset.service.ts`).
  message_draft_archivals:
    'Archiver un brouillon (Théo B M2.R6) est le geste du VISITEUR : semer une ligne prétendrait qu’une personne a déjà écarté un brouillon que le visiteur découvre. Le geste fonctionne réellement (aucun connecteur externe, rien ne part) et la ligne posée pendant un bail est purgée au bail suivant (`demo-reset.service.ts`).',
  mail_thread_marks:
    'La décision manuelle sur un fil de messagerie (marqué traité, signalé non pertinent, archivé, reporté jusqu’à une date, prioritaire à la main, rattaché à un compte ou à un contact — #2104.6/.7/.8, Théo B M1.N1-N3/N6) est le geste du VISITEUR sur un fil fictif de la salle de démonstration : rien n’est pré-semé, sous peine de prétendre qu’une décision a déjà été prise. Le geste fonctionne réellement (aucun connecteur externe n’est appelé), donc la ligne posée pendant un bail est purgée au bail suivant plutôt que jamais écrite.',
  // #2127.37 — « Masquer cette suggestion » sur la carte « comptes similaires »
  // est le geste du VISITEUR : semer une ligne prétendrait qu’une personne a
  // déjà écarté une suggestion que le visiteur découvre. La salle s’ouvre donc
  // avec toutes les suggestions visibles — l’état réel d’un espace où personne
  // n’a encore rien masqué — et la ligne, une fois posée par son geste, est
  // purgée au bail suivant (`DEMO_PURGE_TABLES`, `demo-reset.service.ts`).
  similar_account_dismissals:
    'Masquer une suggestion « compte similaire » est le geste du VISITEUR : en semer une prétendrait qu’une personne a déjà écarté une suggestion que le visiteur découvre. La salle s’ouvre avec toutes les suggestions visibles — l’état réel d’un espace où personne n’a encore rien masqué — et la ligne, une fois posée par son geste, est purgée au bail suivant.',
  // #4055.10 — même doctrine : écarter une personne détectée sur « Complète ce compte » est le geste du VISITEUR.
  account_completion_dismissals:
    'Écarter une personne détectée par « Complète ce compte » est le geste du VISITEUR : en semer une prétendrait qu’une personne a déjà écarté une proposition que le visiteur découvre. La salle s’ouvre avec toutes les propositions visibles, et la ligne, une fois posée par son geste, est purgée au bail suivant.',
  // #4419.8 — même doctrine : choisir l'entreprise parmi des homonymes est le geste du VISITEUR.
  employer_identity_choices:
    'Choisir « la bonne » entreprise parmi des homonymes est le geste du VISITEUR : en semer un prétendrait qu’une personne a déjà tranché une ligne que le visiteur découvre. La salle s’ouvre sans choix, et la ligne, une fois posée par son geste, est purgée au bail suivant.',
  // #2968 — même doctrine que `similar_account_dismissals` ci-dessus,
  // appliquée au Reverse Market : « Masquer » un environnement compatible est
  // le geste du VISITEUR sur la fiche d'un consultant. La salle s'ouvre avec
  // tous les environnements compatibles visibles ; la ligne posée pendant un
  // bail est purgée au bail suivant (`DEMO_PURGE_TABLES`, `demo-reset.service.ts`).
  reverse_market_dismissals:
    'Masquer un environnement du Reverse Market est le geste du VISITEUR : en semer un prétendrait qu’une personne a déjà écarté un environnement que le visiteur découvre depuis la fiche d’un consultant. La salle s’ouvre avec tous les environnements compatibles visibles, et la ligne, une fois posée par son geste, est purgée au bail suivant.',
  // #2411.11 (reste, épopée #2881) — même doctrine que `reverse_market_dismissals`
  // ci-dessus, appliquée aux risques de mission : « Marquer comme traité » est
  // le geste du VISITEUR sur la fiche d'une mission. En semer un prétendrait
  // qu'une personne a déjà traité un risque que le visiteur découvre. La salle
  // s'ouvre avec tous les risques calculés visibles, et la ligne, une fois
  // posée par son geste, est purgée au bail suivant.
  mission_risk_resolutions:
    'Marquer un risque de mission comme traité est le geste du VISITEUR : en semer un prétendrait qu’une personne a déjà traité un risque que le visiteur découvre sur la fiche de la mission. La salle s’ouvre avec tous les risques calculés visibles, et la ligne, une fois posée par son geste, est purgée au bail suivant.',

  // `canonical_trigger_events` a quitté cette liste (#3918.b, lot M01) : la
  // veille du compte la lit désormais — voir `DEMO_SEEDED_TABLES`.

  // #2875 (#2402.3, lot P06) — la MÉMOIRE de transition du rôle décisionnel
  // d'un contact, écrite par un trigger SQL sur `contacts.decision_role` et lue
  // par le balayage qui émet `changement_decideur` au registre canonique.
  contact_decision_role_history:
    "contact_decision_role_history (#2875, #2402.3) : la mémoire de transition de contacts.decision_role, alimentée par un trigger SQL quand un rôle CHANGE. Reste vide à dessein : semer une ligne prétendrait qu'un contact de démonstration a déjà changé de rôle, et le type qu'elle alimente au registre canonique (changement_decideur) n'est lu par aucun écran — la veille ne lit que les signaux CRM (#3918.b).",

  // #2407.10 / #2417.7 (22/09/2026 soir) — la fenêtre du TJM PASSÉ, posée par
  // `DeliveryService.updateMission` à chaque changement de tarif. Aucun écran
  // ne la LIT ni ne la LISTE directement : elle n'existe que pour que
  // `RevenueService.produced()` choisisse le bon tarif d'un mois déjà clos.
  // La semer sans jamais changer le TJM d'une mission de démonstration créerait
  // une ligne que rien ne consulterait — le même défaut que la table qu'elle
  // sert à corriger (« du code juste, calculé, testé, que personne n'appelle »)
  // recopié dans le jeu de démo. Le CA produit affiché en démo reste correct
  // sans elle : aucune mission semée n'a encore changé de TJM.
  // #2417.3/.4/.5 — jalons, retainer, placement DÉCLARÉS (decisions §8).
  mission_milestones:
    'Jalons de forfait DÉCLARÉS (#2417.3), lus par `GET delivery/missions/:id/billing` — désormais AFFICHÉS par `MissionBillingSection` sur la fiche mission (#2415.9). Volontairement VIDE quand même sur l’unique mission forfait de la salle : elle sert deux autres démonstrations très précisément câblées sur son absence de ligne — `demo-account-invoice-readiness-coverage.spec.ts` (facturation « non dû » du mois SANS jalon échu) et `mission-scores-axis-without-data.spec.ts` (axes « Relevés d’activité » / « Paiement » à « non mesuré », jamais 0). Un jalon dont l’échéance tombe hors du mois courant ne romprait ni l’un ni l’autre, mais aucune mission de démo ne le porte encore : le nouvel écran affiche alors « Aucun jalon déclaré », l’état vide MODÈLE du dépôt — jamais un « 0 » ni une ligne inventée. Aucun écran ne les SAISIT encore (créer/archiver un jalon).',
  mission_billing_declarations:
    'Retainer mensuel, fee et garantie de placement DÉCLARÉS (#2417.4/.5), servis par la seule API `delivery/missions/:id/billing` : aucun écran ne les saisit ni ne les affiche encore. Sans déclaration, la préparation mensuelle garde le calcul jours × TJM — rien de faux ne s’affiche sans eux.',
  // #2407.5/.6 — le journal des transitions (decisions §9).
  mission_status_transitions:
    'Journal des changements de statut de mission et d’affectation (#2407.5/.6), écrit par le seul geste humain (changement de statut, déplacement sur le tableau) et lu par la seule API `…/status/history` : aucun écran ne l’affiche encore. Semer des transitions inventerait un historique que personne n’a fait.',
  mission_rate_history:
    'Fenêtre technique de tarif PASSÉ, jamais affichée par aucun écran — seul `RevenueService.produced()` la consulte pour choisir le TJM en vigueur au mois. Aucune mission du jeu de démo n’a encore changé de tarif : la table reste vide tant que ce geste n’est pas rejoué, et le CA produit affiché reste juste (repli sur le TJM courant) sans elle.',
  // #2438.3 (22/09/2026 soir) — l'audit serveur d'un appel d'outil de chat,
  // écrit par l'IA (`tool_call_audit.py`) à chaque outil que Laura exécute.
  // Reste VIDE à dessein, même doctrine que `mail_thread_marks` ci-dessus :
  // une ligne d'audit est la trace d'un GESTE réel du visiteur (poser une
  // question à Laura, qui appelle un outil) — en semer une prétendrait qu'un
  // appel d'outil a déjà eu lieu avant même que le visiteur n'ouvre le chat.
  ai_tool_call_audit_log:
    "Journal serveur de chaque appel d'outil de chat (#2438.3), écrit par `apps/ia/app/services/tool_call_audit.py`. Reste vide à dessein : une ligne n'existe que si le visiteur a réellement posé une question à Laura qui a déclenché un outil — en semer une inventerait un appel qui n'a jamais eu lieu.",
  // #2445.6 (#2442.16, épopée #2766) — le producteur de donnée du bac à sable
  // de rejeu (`ReplaySandboxExecutor`, testé depuis le 27/09 mais sans aucun
  // appelant jusqu'à ce lot). Même doctrine que `ai_tool_call_audit_log`
  // ci-dessus : une ligne n'existe que si le visiteur a réellement posé une
  // question à Laura qui a déclenché un outil — en semer une inventerait un
  // tour qui n'a jamais eu lieu. Console d'opérations back-office (aucune
  // surface utilisateur) : rien à afficher côté application non plus.
  chat_tool_call_recordings:
    "Snapshot MASQUÉ de chaque appel d'outil d'un tour, écrit par `apps/ia/app/services/chat_tool_call_recording.py`, lu par le bac à sable de rejeu (`POST internal/chat-replay/:turnId/execute`, back-office). Reste vide à dessein : une ligne n'existe que si le visiteur a réellement posé une question à Laura qui a déclenché un outil — en semer une inventerait un tour qui n'a jamais eu lieu.",
  // #2439.15 (26/09/2026) — l'audit de chaque export personnel
  // (`GET /privacy/export` et `.../export/object`), même doctrine que
  // `ai_tool_call_audit_log` ci-dessus : une ligne d'audit est la trace d'un
  // GESTE réel (le visiteur a cliqué « Préparer mon export ») — en semer une
  // prétendrait qu'un export a déjà eu lieu avant que le visiteur ne clique.
  // #2439.7/.8/.17 (27/09/2026, lot f4b) — « Mes exports » LIT désormais cette
  // table (`GET /privacy/export/history`, section sur « Mes données ») ; la
  // table reste vide à dessein pour autant : le geste réel du visiteur en
  // démo (cliquer « Préparer mon export ») écrit la MÊME ligne qu'en
  // production, par le même service — rien à semer à l'avance sans inventer
  // un accès qui n'a pas eu lieu.
  privacy_export_audit_log:
    "Journal de chaque export personnel (#2439.15), lu par « Mes exports » (#2439.7/.8/.17) via `GET /privacy/export/history`. Reste vide à dessein : une ligne n'existe que si le visiteur a réellement demandé un export — le geste réel en démo l'écrit par le même service qu'en production, rien à semer à l'avance.",

  // #2385.5 (épopée #2877, LOT écrivain 28/09 passe 2) — back-office
  // UNIQUEMENT (`InternalTeamKpisController`, réservé à l'équipe interne,
  // jamais atteint depuis un compte visiteur). `recordProposedRuleSnapshot`
  // est un GESTE explicite (POST) que l'opérateur interne choisit de faire
  // — jamais un effet de bord d'une lecture, jamais déclenché par la visite
  // d'une salle de démonstration. Semer une ligne fabriquerait un historique
  // de décisions qu'aucun opérateur n'a prises.
  message_learning_rule_proposal_snapshots:
    "La persistance VERSIONNÉE d'un candidat de règle d'apprentissage workspace (#2385.5), écrite UNIQUEMENT par `POST /internal/team-kpis/message-learning-signals/:workspaceId/proposed-rule/snapshot` — un écran back-office réservé à l'équipe interne, jamais atteint en salle de démonstration. Vide à dessein, même raison que `message_style_rule_proposals` juste au-dessus : rien n'écrit tant qu'un opérateur interne n'a pas lui-même figé un candidat.",
  // #2369.2/.3/.4/.5 (LOT SOIR 26/09, épopée #2768) — l'import pour
  // apprentissage. Le CORPS importé (`raw_text`) ne sort JAMAIS de la table
  // (ni vers l'API, ni vers le modèle — doctrine, `message-style-import.ts`),
  // et aucun écran ne liste les imports passés : l'onglet « Mémoire de style »
  // restitue l'analyse au moment MÊME de la soumission, il ne relit rien au
  // chargement. Semer une ligne exposerait un corps qu'aucun visiteur n'a
  // écrit — exactement la donnée fictive que la doctrine interdit.
  // #3446.10 — le journal de traçabilité des productions de Laura (modèle, version,
  //   exemples injectés, règles, contrôles, décision). Aucun écran ne le liste encore.
  message_library_traces:
    "Le journal de traçabilité (#3446.10) : une ligne par sélection que Laura fait dans la bibliothèque. Vide à dessein : aucun écran ne le liste, et c'est l'usage réel de Laura dans /chat qui l'écrit — en semer une ligne inventerait une production que personne n'a demandée.",
  message_style_imports:
    "L'import pour apprentissage (#2369.2/.3), analysé par `analyzeMessageStyleImport` (déterministe, jamais le modèle). Vide à dessein : composer l'import EST le geste de l'onglet « Mémoire de style » (Connaissances), et son corps ne se réexpose jamais — aucune liste ne le relit au chargement, rien à précharger sans inventer un texte que personne n'a collé.",
  // #2369.11/.12 (épopée #2768) — le comparatif de couches
  // (`MessageStylePreviewCompare.tsx`, bouton « Comparer » sur chaque template)
  // et les quatre taux d'usage par style (`style.templates.usage`, même écran)
  // n'ouvrent AUCUNE nouvelle table à classer : le premier réutilise l'appel
  // de génération existant (rien de persisté, un aperçu à la demande) ; le
  // second lit `outreach_messages` (déjà seedé ci-dessus) groupé par
  // `message_style_template_id` — une colonne neuve sur une table classée,
  // jamais une table de plus. Recette 28/09/2026 : le bouton « Comparer » ne
  // s'affichait même pas, faute d'un template `active` semé — voir
  // `message_style_templates`/`message_style_rule_proposals` dans
  // `DEMO_SEEDED_TABLES` (`seedMessageStyle`). L'agrégat d'usage reste « non
  // mesuré » en démo : aucun `outreach_messages` semé ne porte le
  // `message_style_template_id` du template semé, jamais un taux inventé.

  // #2414 (LAU-FINAL-128) / épopée #2986 — la checklist de sortie d'une
  // mission (`MissionEndChecklistPanel`, dossier de mission). Même famille de
  // raison que `mission_start_checks` AVANT sa propre démonstration : c'est un
  // GESTE humain (cocher un item, avec sa note), pas un fait dérivable du
  // reste de la salle. L'écran ne se lit PAS vide pour autant — les treize
  // items s'affichent tous « Manquant », verdict « Pas commencée », NOMMÉS :
  // exactement l'état d'une mission dont personne n'a encore entamé la
  // sortie, qui est la vérité sur les neuf missions de la salle.
  mission_end_checks:
    "La checklist de sortie déclarée (client/consultant/interne, épopée #2986). Reste vide à dessein : c'est un GESTE humain daté, pas un fait dérivable des neuf missions de la salle. L'écran ne se lit pas vide pour autant — verdict « Pas commencée », les treize items nommés « Manquant », qui est l'état réel d'une mission dont personne n'a encore entamé la sortie.",
  // #3269 (BEL-SC-240) — les six jalons de delivery déclarés qu'aucun objet
  // canonique existant ne couvre (brief consultant/client, documents et
  // accès, premier check, revue de début, suivi périodique). Même famille de
  // raison que `mission_end_checks` juste au-dessus : un GESTE humain daté,
  // pas un fait dérivable du reste de la salle. `GET
  // /delivery/missions/:id/delivery-milestones` ne se lit pas vide pour
  // autant : les six jalons déclarés rendent `not_started`, les onze jalons
  // projetés (démarrage, satisfaction, CRA, risque, renouvellement, fin de
  // mission, REX interne/client, preuve réutilisable, expansion,
  // disponibilité future) se lisent depuis leur propre table, déjà semée ou
  // « non évaluable » nommé — jamais un `0` deviné. #3291 (29/09/2026) a
  // branché l'appelant web (`MissionDeliveryMilestonesPanel`, fiche mission) ;
  // cette table reste vide à dessein pour la même raison — c'est le GESTE,
  // pas la lecture, qui manque à la salle.
  mission_delivery_milestones:
    "Les six jalons de delivery déclarés (brief consultant/client, documents et accès, premier check, revue de début, suivi périodique, #3269). Reste vide à dessein : un GESTE humain daté, pas un fait dérivable du reste de la salle — même famille que `mission_end_checks`. L'API ne se lit pas vide pour autant : les six jalons déclarés rendent « Pas commencé », les onze projetés composent leur table canonique existante ou « non évaluable » nommé.",
  // #3068 (27/09/2026) — `mission_interruptions` a QUITTÉ cette liste : elle
  // est désormais SEMÉE (`DEMO_SEEDED_TABLES` plus haut dans ce fichier), les
  // deux missions qui la remplissent portent leur raison complète là-bas.

  // #2320.23/#2339.7 (épopées #2967/#2795) — le journal APPEND-ONLY de la
  // chaîne commerciale (`CommercialTransitionsService.record`, sujet
  // polymorphe `subject_type`/`subject_id`). ⚠️ Mise à jour du 26/09/2026
  // (fusion des lots r3 #2320.1 et #2339.7) : TROIS écritures aujourd'hui —
  // `ProjectPipelineService.changeNeedStatus` (need → need, déjà là),
  // `ShortlistService.create` (shortlist → 'draft', épopée #2795) et
  // `DeliveryService.create` (mission → son statut initial, `proof` nommant
  // le positionnement retenu quand il est connu). `GET
  // /projects/needs/:needId/status-history` sert désormais `history()` — un
  // premier controller existe —, mais aucun écran web ne l'appelle encore.
  // Reste vide à dessein : c'est un journal écrit à chaque changement
  // d'étape, qu'un point d'accès existe mais qu'aucun visiteur ne peut
  // encore ouvrir depuis un écran — le seeder inventerait un historique
  // qu'aucun écran ne montre.
  // ⚠️ Intégration matin 27/09 : la description chantier A (deux appelants,
  // sans `DeliveryService.create`) était en retard sur clôture — le réel a
  // TROIS appelants (voir ci-dessus), la version base est gardée telle quelle.
  // #3086 — la présence sur un fil de Laura. Même famille que
  // `mission_end_checks` plus haut : l'écran ne se lit PAS vide pour autant.
  // `ChatPresenceService.heartbeat` vérifie `isDemoWorkspace` AVANT d'écrire
  // (aucune trace d'un visiteur pour le suivant, même règle que le tour de
  // chat lui-même) et `activeMembers` rend TOUJOURS un membre fictif
  // (« Camille ») sur n'importe quel fil de la salle, sans jamais lire la
  // table — c'est la recette du retour client (#3086) : « Démo : un membre
  // fictif présent sur un fil. » La seeder inventerait un battement de coeur
  // qui expirerait avant que quiconque n'ouvre la salle (fenêtre glissante de
  // 25 s, `PRESENCE_TTL_MS`) — une ligne écrite une fois ne resterait jamais
  // « présente ».
  chat_presence:
    "Un battement de coeur éphémère (#3086, fenêtre glissante de 25 s) : une ligne semée expirerait avant qu'un visiteur n'ouvre la salle. `ChatPresenceService` court-circuite la table pour un espace de démonstration — aucune écriture (même règle que le tour de chat), et la lecture rend TOUJOURS un membre fictif (« Camille ») sur n'importe quel fil : l'écran ne se lit pas vide, c'est la recette même du retour client.",
}

/**
 * Les COLONNES du kanban des besoins qu'aucun rôle de démonstration n'occupe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE MAILLE DE PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * `project_needs` est classée SEEDÉE, et elle l'a toujours été — avec UN rôle,
 * dans UN état. La garde par table était donc verte pendant que le kanban
 * s'ouvrait sur neuf colonnes vides sur dix, et que le pied contextuel de chaque
 * colonne, tout juste livré, ne pouvait se voir changer nulle part. Une table
 * remplie ne dit rien de la RÉPARTITION de ce qu'elle contient, et c'est la
 * répartition que cet écran-là sert à montrer.
 *
 * Chaque état ouvert (`NEED_OPEN_STATUSES`) est donc soit occupé par un rôle du
 * jeu de données, soit inscrit ici avec sa raison.
 *
 * ⚠️ Même interdit que pour les tables : ne JAMAIS déplacer une colonne ici pour
 * faire passer un test. La raison doit tenir devant quelqu'un qui présente le
 * produit — et être VRAIE le jour où on l'écrit.
 */
export const DEMO_NEED_KANBAN_COLUMNS_INTENTIONALLY_EMPTY: Readonly<Record<string, string>> = {
  qualified:
    'Un kanban dont les dix colonnes portent une carte chacune ne montre nulle part où le stock s’accumule — c’est-à-dire la seule question à laquelle cet écran répond. « Qualifié » est de plus l’un des deux états qu’un rôle TRAVERSE : entre la qualification finie et le matching lancé, il ne s’écoule pas une journée. Les deux colonnes qui l’encadrent — « à qualifier », posé depuis dix-neuf jours, et « matching à lancer » — sont occupées, et ce sont elles qui portent l’attente.',
  submitted:
    'Même raison que « qualifié », de l’autre côté du cycle : « profil proposé » est l’instant où le dossier part, pas un endroit où il attend. Les deux colonnes qui l’encadrent sont occupées — « shortlist prête » avec son profil retenu, « en validation client » avec le profil déjà parti — et c’est là que le temps passe vraiment.',
  to_reactivate:
    'Un besoin « à réactiver » est le RÉSULTAT d’un geste que la démonstration fait faire : le rôle mis en veille de la salle (« Chef de projet — programme de refonte applicative », en veille depuis trente-quatre jours avec son motif) se rouvre en deux clics, et la transition est autorisée depuis « en veille ». En seeder un montrerait le résultat sans montrer le geste.',
  open: 'Valeur HÉRITÉE d’avant la reprise des états. Elle reste acceptée par la contrainte SQL — un enum ne perd jamais de valeur — mais plus rien ne l’écrit : la migration a converti les lignes existantes en « à qualifier », et la porte d’API (`changeNeedStatusSchema`) la refuse. En seeder une recréerait à la main exactement l’état que la reprise vient de faire disparaître.',
}

/**
 * Les ÉTATS d'un relevé d'activité qu'aucune ligne de la salle n'occupe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ENCORE UNE MAILLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Même défaut que pour le kanban, et il s'est REJOUÉ : `mission_timesheets` est
 * remplie par le seed depuis toujours, la garde par table était donc verte —
 * pendant qu'aucun relevé de la salle ne portait l'état REJETÉ, tout juste
 * livré. Une table remplie ne dit rien de la RÉPARTITION de ce qu'elle
 * contient, et sur l'écran des relevés c'est la répartition qui EST le sujet.
 *
 * Chaque valeur de `TIMESHEET_STATUSES` est donc soit atteignable sur le mois
 * que l'écran regarde par défaut — portée par une ligne du jeu de données, ou
 * DÉRIVÉE d'une mission sans relevé (`statusWithoutRow`) — soit inscrite ici
 * avec sa raison.
 *
 * ⚠️ Le statut ne dit pas tout : « rejeté PUIS redéposé » repasse en
 * `submitted` et ne se distingue que par la TRACE (`rejected_at` +
 * `rejection_reason`) qui lui survit. Cette moitié-là ne peut pas se classer
 * par statut, et c'est une garde à part qui la tient, dans `demo-coverage.spec.ts`.
 *
 * ⚠️ Même interdit qu'ailleurs : ne JAMAIS déplacer un état ici pour faire
 * passer un test. La raison doit tenir devant quelqu'un qui présente le produit,
 * et être VRAIE le jour où on l'écrit.
 */
export const DEMO_TIMESHEET_STATES_INTENTIONALLY_ABSENT: Readonly<Record<string, string>> = {
  expected:
    'INATTEIGNABLE sur l’écran par défaut, et c’est une propriété du calcul, pas un trou du jeu de données : `statusWithoutRow` ne rend « attendu » que tant que le mois COURT ENCORE (`today > endOfMonth` décide), or la vue des relevés s’ouvre sur le mois PRÉCÉDENT, qui est clos par construction. Poser une ligne « attendu » supposerait de seeder le mois en cours, où l’écran ne regarde pas. C’est « manquant » qui porte l’attente sur le mois clos, et la salle l’a.',
  draft:
    'Un brouillon appelle EXACTEMENT le même geste que « manquant » — relancer : les deux sont dans `AWAITING_TIMESHEET_STATUSES`, comptés ensemble dans « en attente », et la relance de `timesheets.service.ts` vise les deux du même filtre. La salle porte déjà une ligne manquante (la régie sans relevé). En ajouter une seconde qui réclame le même geste remplirait l’écran sans rien y montrer de neuf — et le brouillon est de toute façon un état de la saisie du consultant, que la démonstration ne fait pas jouer.',
  disputed:
    'État que le code LIT — il compte dans le résumé, il bloque la facturation (`timesheet_disputed`) — mais qu’AUCUN geste du produit n’écrit : la seule écriture de statut du module de livraison pose `rejected`. Le refus humain a désormais un état à lui, avec son motif obligatoire et sa trace ; « contesté » est ce qui l’a précédé. En seeder un montrerait à un prospect un état qu’il ne pourra atteindre par aucun clic.',
}

/**
 * « ET LE COMPTE SG COMPLET (CSV, 27/09/2026, 2 289 LIGNES, 17 BLOCS) MONTRE
 * QUOI EN DÉMONSTRATION ? » (FINIR-V2-27-09, demande de Louis.)
 *
 * Aucune entrée dédiée ici : les blocs mappés (`sg-csv-mapping.ts`) alimentent
 * des clés `raw_analysis` DÉJÀ classées SEEDÉES plus haut/plus bas — `org`
 * (`units`/`decisionChain`, blocs 02/03/05), `entities_exhaustive` (bloc 09),
 * `sites_france` (bloc 10, France uniquement), `program_names` (bloc 11),
 * `technology_stack` + `detected_tech_stack` (blocs 12/13) — et la table
 * `contacts`, déjà dans `DEMO_SEEDED_TABLES`.
 *
 * Complément v2 (27/09/2026, FINIR-V2-27-09) — les CINQ blocs qui n'avaient
 * AUCUN champ d'accueil en ont désormais un : `keyNoteSchema`
 * (`@bellum/contracts`, type générique, voir son docblock) porte
 * `structural_reading_axes` (bloc 01), `ecosystem_third_parties` (bloc 14),
 * `opportunity_domains` (bloc 15), `financial_indicators` (bloc 16) et
 * `data_reliability_notes` (bloc 17) — les cinq SEEDÉES sur le dossier SG,
 * les cinq rendues (`KeyNotesCard`, onglets Synthèse ×2/Partenaires/Plan/
 * Évaluation). Pas une clé de plus au-delà de ces cinq.
 *
 * ⚠️ **Le conflit de doctrine, et pourquoi trois blocs ne sont PAS semés nom
 * par nom.** `demo-dataset.ts` (règles 1/1bis/3 du docblock du jeu, et le champ
 * `DemoContact.email`) interdit toute coordonnée sur une personne réelle et
 * réserve un nom à une personne sourcée du registre OU d'une annonce publique
 * citée. Les blocs `06_CONTACTS_OPERATIONNELS` (1 781 lignes),
 * `07_PRESTATAIRES_EXTERNES_EN_POSTE` (43) et
 * `08_PROFILS_AYANT_EXERCE_CHEZ_LE_COMPTE` (74) sont des personnes réelles
 * sourcées d'une base de contacts, PAS d'une annonce publique — les nommer sur
 * un lien de démonstration PUBLIC exposerait l'identité et l'employeur de
 * ~1 900 personnes réelles sans base légale. Variante conforme : des sièges
 * anonymes agrégés par famille métier RÉELLE, comptage réel cité, aucun nom
 * (`buildSgFamilyRoleSeats`). `04_GOUVERNANCE_ET_ROLES` (44 lignes), lui, EST
 * conforme — chaque source `linkedin` du CSV pointe une page de gouvernance ou
 * un communiqué publics (vérifié ligne par ligne) — et ses 44 personnes sont
 * nommées, toujours sans coordonnée. Détail complet dans le docblock de
 * `sg-csv-mapping.ts`.
 *
 * **Blocs restant sans champ d'accueil** (le reste des 17 blocs, après le
 * complément v2) : les 2 lignes agrégées de `13_TECHNOLOGIES` (compétences
 * pondérées, répartition détaillée — la troisième ligne du même bloc, la
 * stack observée, EST semée). Les 7 lignes de `10_IMPLANTATIONS` hors de
 * France restent hors de `sites_france`, nommée « France »
 * (`SitesFranceCard`). Ni l'un ni l'autre n'a de nouveau champ d'accueil
 * générique qui ne leur ferait pas dire autre chose : une ligne agrégée n'est
 * pas une `KeyNote` (aucun constat/interprétation/implication/fiabilité
 * propres dans la source), et une implantation hors de France reste hors
 * d'un composant nommé « France ».
 */
/*
 * #3916.b / #3921.a (lot M03, 09/10/2026) — les registres publics lus EN CONTINU.
 * `public_registry_announcements` et `public_registry_watch_state` sont des
 * tables PARTAGÉES (registre public, clé = SIREN), hors du périmètre de purge :
 * la garde ci-dessous ne les voit pas, et c'est voulu. Les SEMER serait pire
 * que vide à dessein : une ligne écrite pour le SIREN de SNCF ou de Société
 * Générale apparaîtrait sur la fiche de TOUS les espaces réels qui suivent ces
 * sociétés. Ce que la démo montre de la capacité : la carte « Annonces
 * légales » (seedée par `raw_analysis.legal_signals`, SNCF, avec « Voir
 * l'annonce BODACC ») qui écrit « Pas encore relu en continu ».
 * R24-FIX-B (15/10) — Découvrir en démo ne montre plus de compte fictif : des
 * entreprises réelles (`demo-discover-real-companies.ts`), effectif absent plutôt
 * que « 0 salarié », offres datées ; aucune annonce de registre n'y est écrite.
 *
 * #3921 (décision Louis 13/10/2026, lot S7 14/10) — `headcount_change` vit dans
 * la MÊME table partagée `public_registry_announcements`, pour la MÊME raison :
 * une tranche d'effectif écrite pour le SIREN d'un compte réel apparaîtrait sur
 * TOUS les espaces qui le suivent. Vide à dessein, non une entrée de plus à
 * nommer ici : aucun `raw_analysis` ni nouvelle table n'en découle, la carte
 * « Annonces légales » existante suffit à le montrer le jour où `sirene_snapshots`
 * aura deux relevés mesurés pour un SIREN suivi.
 *
 * #3921.9 / #3921.10 (16/10/2026) — même table partagée, même raison : les événements du registre national
 * (`source = 'rne'` : dirigeant, ouverture / fermeture d'établissement) y vivent sans table ni clé
 * `raw_analysis` neuves, et ne se sèment pas (un dirigeant nommé écrit pour le SIREN d'un compte réel
 * apparaîtrait sur tous les espaces qui le suivent). `esn_directory.public_awards` (marchés GAGNÉS par
 * une ESN) est une colonne du référentiel ESN PARTAGÉ : jamais semée en démonstration, comme le reste de
 * `esn_directory` — le champ reste « non lu » plutôt qu'un compte inventé.
 *
 * #3915.decp (décision Louis 16/10/2026) — les marchés publics attribués relus en continu (`decp`, genres `award` /
 * `award_won`) vivent dans la MÊME table partagée : même raison, rien n'y est écrit en démo. Ce que la démonstration
 * en montre : la carte « Marchés publics attribués » de Thales, semée par `raw_analysis.awarded_contracts` (un marché
 * réel et daté, `demoAwardedContractsOf`), qui passe par la même fusion que la veille continue (`mergeAwardedContracts`).
 */
/**
 * Théo A comptes-fiche-reference.N4 / A2 (R22, 22/10/2026) — `raw_analysis.reference_archive` : la portée d'un dossier
 * de RÉFÉRENCE (archive figée, lecture seule). SEEDÉE sur Groupe BPCE seulement — c'est le cas d'école, l'archive du
 * 30/09–01/10/2026 ; tous les autres dossiers sont ordinaires, donc sans cette clé À DESSEIN (un dossier n'est une archive
 * que s'il vient d'un dépôt de relevés). `working_copy_of`, lui, n'est écrit que par le geste « Créer une copie de
 * travail » : jamais semé, la copie naît au premier clic du visiteur (même motif que les catalogues qui se remplissent au
 * premier geste). Prouvé par `demo-reference-archive-coverage.spec.ts`, qui passe la clé semée au VRAI contrat.
 */
export const DEMO_REFERENCE_ARCHIVE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'Groupe BPCE porte `raw_analysis.reference_archive` (archive du dépôt fourni, 30/09–01/10/2026, périmètre France, non revérifiée en ligne) ET `raw_analysis.reference_dossier` (programmes cités, pratiques achats, organisation par regroupements, expertises, TJM par circuit, historique des besoins, écosystème — COMPTÉS dans le relevé par `buildReferenceDossier`). Les autres dossiers sont ordinaires : pas de clé, à dessein.',
}

/*
 * FINANCE-ONGLET (#4745.8, arbitrage Louis 29/10/2026) — l'onglet « Stratégie financière » de la fiche compte :
 * AUCUNE table ni clé `raw_analysis` neuve, SEEDÉE. Il relit `raw_analysis.financials_history`, DÉJÀ classée seedée :
 * le client fictif de la salle (SNCF, `DEMO_DELIVERY_CARRIER`) porte désormais trois exercices avec marge brute, EBE
 * et résultat d'exploitation FICTIFS (2022 incomplet à dessein : EBE et clôture « Non publié », jamais 0). Les autres
 * dossiers, de vraies sociétés, ne reçoivent AUCUNE marge inventée. Gardé par `demo-finance-tab-coverage.spec.ts`.
 */
/*
 * HIST-D (#4757, 28/10/2026) — « l'historique complet des besoins » sur la fiche compte : AUCUNE table ni clé
 * `raw_analysis` neuve. La fiche relit `raw_analysis.it_job_signals`, DÉJÀ classée seedée : SNCF porte désormais
 * douze offres datées de plus de six mois en plus de ses offres récentes (de quoi montrer les deux blocs et la
 * pagination par dix), et les dossiers sans offre ancienne restent SANS bloc historique, à dessein — rien n'est
 * semé pour le remplir. Gardé par `demo-job-history-coverage.spec.ts`.
 */

/*
 * Groupe BPCE (30/09/2026) — dossier 7, semé en entier depuis
 * `data/bpce-compte-complet.csv` : AUCUNE clé ni table neuve, donc rien de neuf à
 * classer ici — toutes les clés de `raw_analysis` qu'il écrit (`pains`,
 * `program_names`, `entities_exhaustive`, `sites_france`, `technology_stack`,
 * `structural_reading_axes`, `ecosystem_third_parties`, `opportunity_domains`,
 * `financial_indicators`, `data_reliability_notes`, `org.units`,
 * `org.decisionChain`) sont déjà SEMÉES par le dossier SG. Les 25 blocs sont
 * tous consommés (`bpce-csv-mapping.spec.ts`). Vide à dessein : siège, SIREN,
 * NAF, effectif, CA (le relevé n'en publie pas), niveau d'effort.
 *
 * CASCADE-ECRAN (25/10/2026) — `offersCascade` n'est pas une clé de `accountAnalysisSchema` : elle est SEEDÉE (SNCF,
 * `demo-dataset.ts`), donc rien à classer ici ; `demo-coverage.spec.ts` la tient.
 */
export const DEMO_ANALYSIS_KEYS_INTENTIONALLY_ABSENT: Readonly<Record<string, string>> = {
  pappers_url:
    'Le lien pointe le service commercial de registre que nous interrogeons. Le nommer côté application contredirait la règle « aucun nom de fournisseur hors Réglages › Intégrations » — et sur une salle de démonstration publique, ce serait afficher notre chaîne d’approvisionnement à un prospect.',
  capital:
    'Le capital social n’est pas publié par l’annuaire des entreprises pour ces cinq sociétés. Le recopier depuis une autre source sans pouvoir le dater ferait afficher un montant faux sur une société que le prospect connaît.',
  beneficial_owners:
    'Les bénéficiaires effectifs sont des PERSONNES PHYSIQUES nommées, avec leur part de détention. Sur un lien de démonstration public et pour des sociétés réelles, les afficher serait une diffusion de données personnelles sans usage commercial — et sur des groupes cotés, la notion n’a de toute façon pas de titulaire unique.',
  // #4116 (13/10/2026) — `public_tenders` est SEEDÉE (EDF, deux avis européens RÉELS aux vraies dates de
  // publication via `demoPublicTendersOf`, sans date limite affichée : la raison de l'ancienne entrée « vide à dessein »
  // — un AO figé survit à sa clôture — ne tient plus, aucune clôture n'étant promise). Elle n'est donc plus classée ici.
  // #3915.decp (16/10/2026) — `awarded_contracts` est SEEDÉE (Thales, un marché RÉEL dont le compte est le TITULAIRE,
  // `demoAwardedContractsOf`) : la raison de l'ancienne entrée — figer un concurrent réel désigné comme installé — ne
  // vaut pas pour un marché que le compte a lui-même remporté. Elle n'est donc plus classée ici.
  creation_date:
    'Le registre ne publie de date de création ni pour Société Générale (société ancienne, la ligne reste vide dans l’annuaire), ni pour SNCF, ni pour Groupe BPCE (aucun SIREN corroboré dans le relevé importé). Retrait du 01/10/2026 : les deux seuls dossiers qui la portaient (sociétés récentes, immatriculées en 2006 et 2009) ont quitté la salle. En inventer une pour un grand groupe afficherait une date fausse sur une société que le prospect connaît — elle revient avec le prochain dossier dont le registre la publie.',
  us_sec_financials:
    'Réservé aux sociétés cotées aux États-Unis résolues chez SEC/EDGAR ; les dossiers de démonstration sont français.',
  description:
    'Alias historique de `business_description`, qui est renseigné : le remplir aussi afficherait deux fois le même texte.',
  user_plan_actions:
    'Actions ajoutées au plan PAR l’utilisateur : les pré-remplir retirerait le geste que la démonstration veut montrer.',
  user_attack_angles:
    'Angles d’attaque écrits PAR l’utilisateur — même raison que les actions de plan ajoutées à la main.',
}

/**
 * Troisième niveau : la FICHE CONTACT, colonne par colonne.
 *
 * Une fiche de démo n'avait que ce que le jeu de données écrivait à la main. Le
 * reste — périmètre, pouvoir budgétaire, script d'appel, cadence, signaux,
 * activité, relations, profil enrichi — restait vide, et les onglets s'ouvraient
 * sur « Aucune relation identifiée » au milieu d'une démonstration.
 *
 * Trois états possibles pour une colonne, jamais un quatrième :
 *  - {@link DEMO_CONTACT_SEEDED_COLUMNS} : remplie au seed, pour TOUS les contacts ;
 *  - {@link DEMO_CONTACT_ENRICHMENT_COLUMNS} : remplie par le clic « Enrichir »
 *    — c'est le geste que la démonstration montre, la pré-remplir le supprimerait ;
 *  - {@link DEMO_CONTACT_COLUMNS_NOT_APPLICABLE} : ni l'un ni l'autre, avec sa raison.
 */
export const DEMO_CONTACT_SEEDED_COLUMNS = [
  // #2159.26 — les ÉTIQUETTES. Posées sur les deux interlocuteurs FICTIFS du
  // client d'exemple (`DEMO_DELIVERY_CLIENT.contacts`) ; `{}` ailleurs, qui
  // est la valeur normale d'une fiche que personne n'a classée. Vérifié par
  // `demo-seed.service.spec.ts` (« des contacts et des comptes … étiquettes »).
  'tags',
  // L'exclusion, avec son motif (PDF 2, items 82-83). UN contact du jeu la
  // porte : la carte « Écarter » ne se voit qu'à cet état, et un prospect doit
  // pouvoir constater que l'outil garde la raison au lieu de faire disparaître
  // la fiche. Les autres contacts ont `NULL`, ce qui est la valeur normale.
  'excluded_at',
  'exclusion_reason',
  'full_name',
  'title',
  'entity',
  // La CLÉ de la division, posée juste après le seed des contacts à partir de
  // leur libellé (PDF 2 §2). Seedée et non « enrichie » : sans elle la colonne
  // « Entité » de l'écran s'ouvrirait vide alors que `entity` porte le nom.
  'entity_id',
  'family',
  'decision_role',
  'priority',
  'photo_url',
  'profile_summary',
  'why_contact',
  'email_message',
  'linkedin_message',
  'phone_script',
  'cadence_messages',
  'followup_message',
  'contact_score',
  'seniority',
  'lifecycle_state',
  'key_points',
  'scope',
  'budget_authority',
  'career_levers',
  'implicit_fears',
  'signals',
  'activity',
  'language',
  // #2861 (#2437.2, 26/09/2026) — le niveau DESTINATAIRE (`fr`/`en`/`de`),
  // distinct de `language` juste au-dessus (voir `demoLocale`, même fichier
  // que `demoLanguage`) : `en` pour les deux fiches ibériques (`'es'` n'est
  // pas dans le catalogue `marketLocaleSchema`), `fr` pour les autres.
  'locale',
  'timezone',
  // #2165.38 (21/09/2026) — RECLASSÉE depuis `DEMO_CONTACT_ENRICHMENT_COLUMNS`
  // : cette entrée AFFIRMAIT que la colonne restait vide jusqu'au clic
  // « Enrichir » (18/09), ce qui était vrai du MÉCANISME mais faux de l'ÉCRAN
  // — aucun contact de démo n'avait de `location` par défaut, et le filtre
  // pays de Découvrir (#2621.1) exclut toute localisation inconnue : l'onglet
  // Contacts s'ouvrait VIDE en démonstration. `demoContactRow()` seede
  // désormais `location` pour CHAQUE contact (`demoLocation`, ville du siège
  // du dossier ; Paris pour les deux fiches « à qualifier » sans entreprise).
  // Le clic « Enrichir » (`enrichContactInDemo`) garde son garde-fou
  // `!contact.location` : il ne fait plus rien en pratique, puisque la colonne
  // n'est plus jamais vide au départ, mais reste inoffensif si elle l'était.
  'location',
  'source',
  // L'issue DÉCLARÉE de la relation (« a répondu », « rendez-vous décroché »).
  // Elle était classée « vide à dessein » avec pour raison que le statut avance
  // quand le visiteur agit sur la fiche — sauf qu'AUCUN écran n'offrait ce
  // geste : la justification décrivait une capacité qui n'existait pas. Le geste
  // existe maintenant, et deux interlocuteurs FICTIFS du client d'exemple
  // portent leur issue, sans quoi l'entonnoir commercial s'ouvrirait en « non
  // mesuré » devant un prospect. ⚠️ 04/09/2026 (#1457) : le lecteur nommé ici
  // était « les taux de conversion du tableau de bord » — il a disparu avec
  // l'onglet « Équipe » de `/dashboard`. La colonne reste SEEDÉE, et pour la
  // même raison : elle est lue par l'entonnoir du cockpit d'équipe
  // (`/manager/team-stats`), par le pipe et par les filtres de la liste de
  // contacts. C'est le nom du lecteur qui change, pas la raison de semer.
  'user_status',
  // #2120.68/#2120.70 — provenance par champ (confiance, coût). Migration
  // 1795712351210. ⚠️ PAS écrites par le clic « Enrichir » : `demoEnrichment`
  // (demo-enrichment.ts) rend TOUJOURS `email: null, phone: null`, donc le
  // bloc qui gate sur `enrichment.email`/`enrichment.phone`
  // (`enrichContactInDemo`, contacts.service.ts) reste inerte pour TOUT
  // contact de démo — aucune coordonnée inventée sur une société réelle
  // (politique du 17/08). Le mécanisme RÉEL est le SEED : les interlocuteurs
  // SIMULÉS joignables (`demo-contact-density.ts`, `toContact()`) portent
  // `email_confidence: 'medium'` et le coût crédit réel de l'action dès leur
  // création — comme `excluded_at`/`exclusion_reason` plus haut, seule une
  // PARTIE des contacts les porte, `null` pour le reste (non mesuré / non
  // engagé, jamais une valeur basse ni 0 — GA-18/19).
  'email_confidence',
  'email_cost_credits',
  'phone_cost_credits',
  // #4178.1 — la nature du numéro et sa source. SEEDÉES sur tout numéro
  // simulé : « professionnel déclaré » pour une ligne que le fournisseur
  // simulé type « travail », « inconnue » (« nature non vérifiée ») sinon —
  // jamais « pro » déduit du format ; `NULL` sans numéro.
  'phone_nature',
  'phone_nature_source',
  // #2295.4bis (18/09/2026) — même motif que `excluded_at`/`exclusion_reason`
  // juste au-dessus : UN contact du jeu (Directeur technique — entité numérique voyageurs, DEMO_DELIVERY_CLIENT)
  // porte `true`, pour que `classifyGroup()` puisse rendre « première porte »
  // sans email vérifié ni adresse inventée. Les autres contacts ont `false`,
  // qui EST la valeur seedée et normale — jamais un trou. Voir
  // `DEMO_FIRST_DOOR_GROUP_COVERAGE` plus haut pour le détail.
  'demo_seed_first_door',
  // #2297.51 (19/09/2026) — même motif que `excluded_at` : UNE personne
  // simulée du jeu (Hervé Lacombe, Société Générale, `demo-contact-density.ts`)
  // porte des coordonnées ARCHIVÉES par la rétention de trois ans — la date
  // (relative au seed) et l'archive elle-même. La fiche DIT « coordonnées
  // archivées le … » au lieu de « jamais cherchées » ; les autres contacts ont
  // `null`, qui EST l'état normal (rien d'archivé), jamais un trou.
  'enrichment_archived_at',
  'enrichment_archive',
  // #2160.58 (24/09/2026, intégration vague 31) — même motif que `excluded_at`/
  // `exclusion_reason` : aucun interlocuteur ne porte de confirmation d'identité depuis le 04/10/2026
  // (décision Louis : aucune déclaration sur une personne réelle), les autres
  // ont `null`, qui EST l'état normal (jamais confirmé). Voir
  // `DEMO_CONTACT_IDENTITY_CONFIRMED_COVERAGE` plus haut pour le détail.
  'identity_confirmed_at',
  'identity_confirmed_by',
  // #2160.60 (26/09/2026) — même motif que `identity_confirmed_at` juste
  // au-dessus, sur une porte différente : DEUX sièges de SNCF partagent
  // désormais le même intitulé (`demo-dataset.ts`, contacts « Responsable des
  // systèmes d'information d'une filiale de transport », Keolis et SNCF
  // Réseau) — `filterEligibleContacts` (`contact-eligibility.ts`) les écarte
  // tous les deux pour `homonym_conflict`, sauf levée. Le premier porte une
  // levée SEMÉE (`recommendation_authorized_reason`) ; le second reste `null`,
  // qui EST l'état normal (jamais autorisé) et montre encore le bouton
  // « Autoriser ». Voir `DEMO_CONTACT_RECOMMENDATION_AUTHORIZED_COVERAGE`
  // plus bas pour le détail.
  'recommendation_authorized_at',
  'recommendation_authorized_by',
  'recommendation_authorized_reason',
  // #219.8 (#3231, lot Q03 30/09) — la relation personne↔entreprise DÉCLARÉE
  // a maintenant une SOURCE (la fiche contact). Deux interlocuteurs FICTIFS du
  // client d'exemple la portent (Directeur technique — entité numérique voyageurs `sponsor`, Responsable des achats de prestations informatiques
  // `buyer`) ; jamais un dirigeant RÉEL des six dossiers (prêter un passé à une
  // vraie personne serait une donnée inventée) — `null` EST leur état normal.
  'declared_person_company_relation',
] as const

/**
 * #3400.5/#3400.6/#3401 (lot C07 du 30/09, retours bêta #3400/#3401) —
 * LA CARTE « UTILITÉ COMMERCIALE » (`ContactCommercialUtility.tsx`, onglet
 * Rôle de la fiche contact) ET LA PROVENANCE DU RÔLE (`ContactHeader.tsx`)
 * NE LISENT AUCUNE COLONNE NEUVE : `decision_role`, `why_contact`,
 * `profile_summary` et `source` sont DÉJÀ dans `DEMO_CONTACT_SEEDED_COLUMNS`
 * ci-dessus — zéro table, zéro clé de `raw_analysis` supplémentaire, donc
 * rien à semer de plus (même principe que `AuditVerdict`/`AuditChain` plus
 * bas dans ce fichier). Ce que la carte AJOUTE est une DÉRIVATION PURE côté
 * front (`getRoleUtility`/`getRoleDescription`, `contactRoles.ts` ;
 * `decisionRoleProvenance`, `contactDerive.ts`) sur ces mêmes colonnes.
 *
 * Le sélecteur de correction du rôle (`ContactRecordCard.tsx`, #3400.6) ne
 * sème rien non plus : il appelle un chemin d'écriture qui existait déjà
 * (`ContactCorePatch.decisionRole` → `CONTACT_FIELD_COLUMNS.decisionRole`),
 * jusqu'ici jamais appelé par aucun écran.
 *
 * Ce que la salle montre RÉELLEMENT — pas seulement ce que ce commentaire
 * affirme — est exécuté par `demo-contact-commercial-utility-coverage.spec.ts`,
 * qui fait tourner `getRoleUtility`/`getRoleDescription` sur les `decision_role`
 * RÉELLEMENT seedés (`technical`/`economic`/`user`/`procurement`/`champion`/
 * `influencer` — six des sept rôles courants ; aucun contact de démo ne porte
 * `blocker`, comme en témoigne le même test, un manque PRÉEXISTANT à ce lot).
 */

/** Colonnes que le clic « Enrichir » renseigne — en démonstration comme en réel. */
export const DEMO_CONTACT_ENRICHMENT_COLUMNS = [
  'email',
  'email_verified',
  // #4522 (25/10/2026) — SEEDÉ : un numéro connu s'affiche EN CLAIR sur la fiche (Camille Roussel, Sofiane
  // Berthier, Corentin Fabre portent un mobile fictif en `.example`), le badge court « Téléphone disponible »
  // ne sert qu'aux sièges SANS numéro dont `phone_availability` est `available` (`demoCoordinateAvailability`).
  'phone',
  'linkedin_url',
  'relations',
  // #4522 — VIDE À DESSEIN pour sa seule part `phone_numbers[]` : la fiche y lit le numéro quand la colonne
  // `phone` est vide, mais ces profils portent des personnes simulées sur des entreprises RÉELLES — un numéro
  // posé là ferait croire qu'un fournisseur l'a rendu. Le rendu « en clair » se voit par la colonne `phone`.
  'apollo_enrichment',
  'last_enrichment_at',
  'last_enrichment_provider',
  // #2120.61/#2120.64 — la colonne EST écrite au clic (`'matched'`, voir
  // `enrichContactInDemo`), et depuis #2297.18 une SECONDE de ses quatre
  // valeurs (migration 1795712351210) est atteignable : `ambiguous`, sur
  // « Mathis Fontenelle » (`demo-contact-density.ts`, SNCF) — UN seul
  // contact, dont le nom+société simule une réponse fournisseur à deux
  // candidats (`isDemoAmbiguousProviderMatch`, `demo-enrichment.ts`), jamais
  // deux fiches du même compte : l'index unique
  // `idx_contacts_account_normalized_name` interdit ça, en démo comme en réel
  // (mesuré en recette du 27/09 — la première version posait deux lignes, la
  // seconde était rejetée au semis). `enrichContactInDemo` porte la MÊME
  // porte que le chemin réel (`ContactsService.enrichContact`, ligne ~2990).
  // Reste hors d'atteinte : `newer_data_exists`, qui suppose un champ
  // facturable protégé par une correction humaine ou un connecteur
  // (`field_provenance`) — rien n'est jamais protégé sur un contact de
  // démonstration ; vide à dessein, pas un oubli.
  'last_enrichment_result',
  'last_enrichment_missing',
  // E1 (07/10/2026, #3698, écran #3822) — l'état PAR COORDONNÉE. SEEDÉ :
  // `demoEnrichmentCoordinates` (`demo-enrichment-trace.ts`) le dérive de la
  // MÊME trace que `last_enrichment_*` — « recherchée, introuvable chez 2
  // sources » sur le canal manquant d'un contact simulé, « trouvée » sur les
  // autres ; et le clic « Enrichir » de la salle le pose à « trouvée » sur les
  // trois (`demoEnrichmentCoordinatesAllFound`). Jamais une source nommée.
  'enrichment_coordinates',
  // R22 a4 — la disponibilité ANNONCÉE par champ (`demoCoordinateAvailability`, même trace
  // que `enrichment_coordinates`) : introuvable après un essai, disponible pour une partie des
  // sièges sans coordonnée, NULL (jamais cherché) pour le reste — les quatre états se voient en salle.
  'email_availability',
  'phone_availability',
  // #2159.62 — LA DERNIÈRE VÉRIFICATION D'EMPLOI. MÊME clic, MÊME porte qu'en
  // réel (`ContactsService.enrichContact`, `employment_verified_at` avance
  // sur un MATCH) : `enrichContactInDemo` n'a que la branche `matched` (la
  // démonstration ne simule ni `no_new_data` ni `newer_data_exists`), donc la
  // colonne avance à CHAQUE clic « Enrichir » réussi.
  'employment_verified_at',
] as const

/** Le reste, avec sa raison. */
export const DEMO_CONTACT_COLUMNS_NOT_APPLICABLE: Readonly<Record<string, string>> = {
  enrichment_trace:
    'E1 (07/10/2026, #3698) — la trace INTERNE de l’enrichissement : réponses NOMMÉES par fournisseur, nonce de la ' +
    'révélation du mobile attendue par webhook, recherche asynchrone à reprendre. `select: false` : aucun écran ne la lit ' +
    '(nos fournisseurs ne se nomment jamais côté client). Ce que l’écran montre — l’état par coordonnée — est la colonne ' +
    '`enrichment_coordinates`, elle SEEDÉE. Aucun appel fournisseur ne part en démo, il n’y a donc rien à tracer.',
  extra:
    'Import universel (27/09/2026) — les colonnes d’un fichier importé sans champ d’accueil. Les contacts de la salle ' +
    'sont des personnes RÉELLES (registre du commerce) : leur prêter une « colonne importée » serait une donnée inventée ' +
    'sur une personne réelle. La carte « Informations complémentaires importées » se VOIT en salle dès que le visiteur ' +
    'importe le fichier d’exemple fictif (colonne « Code interne ERP ») — le geste est démontrable, la donnée n’est pas semée.',
  id: 'Identifiant technique, généré à l’insertion.',
  import_job_id:
    'Migration `ImportJobIdOnRecords` (26/10/2026) — clé étrangère vers le LOT d’import qui a écrit la ligne, posée ' +
    'par l’import de fichier et lue pour rattacher une ligne à son import (et pouvoir le défaire). Le semis de la ' +
    'salle n’écrit par aucun lot d’import : il insère directement. Lui inventer un identifiant de lot ferait croire ' +
    'à un import qui n’a pas eu lieu. Le geste se VOIT en salle dès que le visiteur importe le fichier d’exemple — ' +
    'la ligne importée, elle, porte alors un vrai `import_job_id`.',
  account_id: 'Clé étrangère posée par le seed lui-même, pas une donnée à montrer.',
  user_id: 'Propriétaire de la ligne — plomberie de scoping, invisible à l’écran.',
  workspace_id: 'Scoping de l’espace — même raison que `user_id`.',
  created_at: 'Horodatage technique posé par la base.',
  updated_at: 'Horodatage technique posé par la base.',
  assigned_to:
    '#4158.13 (Louis, 14/10/2026) — RENVERSEMENT ASSUMÉ : la salle compte désormais TROIS collègues fictifs (`DEMO_COLLEAGUES`, `DemoSeedService.seedColleagues`). Six comptes SECONDAIRES (et leurs contacts) sont attribués à ces collègues ; les dossiers vedettes restent à l’occupant. ' +
    'Ce qui suit décrit la salle D’AVANT : il reste vrai des dossiers vedettes. ' +
    'L’attribution à un membre suppose une équipe ; une salle de démo avait un seul occupant. ' +
    'Depuis le 29/08/2026, cette colonne a un SECOND lecteur — la reprise de portefeuille au départ ' +
    'd’un membre (Réglages › Équipe, `WorkspacePortfolioHandoverService`). Elle reste vide à dessein ' +
    'pour la même raison, et la raison est plus forte encore : la boîte de départ ne s’ouvre que sur ' +
    'la ligne d’un AUTRE membre, et il n’y en a aucun dans une salle. Semer un second occupant ferait ' +
    'apparaître un siège que le visiteur pourrait retirer, sur des comptes qu’il partagerait avec ' +
    'personne — une salle de démo n’est le compte de personne. ' +
    'Depuis le 14/09/2026 elle a un TROISIÈME lecteur, le bandeau Collaboration du dossier (#2128) : ' +
    'il lit `owner`, dérivé de cette colonne. La colonne reste vide à dessein, et le bandeau n’est pas ' +
    'muet pour autant — il affiche « propriétaire non renseigné », qui est VRAI dans une salle où ' +
    'personne ne porte rien. Semer un porteur fictif y afficherait le nom d’un collègue qui n’existe pas. ' +
    'Depuis le 24/09/2026 elle a un QUATRIÈME lecteur, `ContactHeader` (#2128.12, `contacts.assigned_to` ' +
    'via `contact.owner`) : le signal « déjà travaillé par un collègue » ne se déclenche que quand ' +
    '`owner.user_id` diffère de l’utilisateur courant — `null` dans une salle mono-occupant ne le ' +
    'déclenche jamais, même raison que le bandeau Collaboration ci-dessus. ' +
    'Depuis le 26/09/2026 elle a un CINQUIÈME lecteur, `CreateSequenceDialog` (#2202.23, l’avertissement ' +
    '« déjà porté par un collègue » avant de lancer une séquence) : même mécanique de comparaison ' +
    '(`assigned_to` contre l’utilisateur courant, résolu via `GET /workspaces/members`) — muette dans une ' +
    'salle où `assigned_to` est vide et où `/workspaces/members` ne rend qu’un seul siège.',
  hidden: 'Colonne à défaut non nul : masquer une fiche est un geste du visiteur.',
  note: 'Colonne HÉRITÉE, plus écrite par l’application : les notes vivent dans la table `notes` (seedée), datées et empilables.',
  merged_into_id:
    '#4016 L6 — posée sur la SEULE fiche absorbée de la fusion automatique semée (`DEMO_AUTO_MERGED_DUPLICATE`), ' +
    'avec `deleted_at` : une fiche mise de côté n’apparaît dans aucune liste. Ce que la salle montre est la ligne ' +
    '« Fusionnés par Bellum » (`duplicate_pairs`, seedée) et son geste « Annuler la fusion », qui remet la colonne à NULL.',
  deleted_at:
    'Suppression réversible : une fiche seedée comme supprimée n’apparaîtrait nulle part, ce qui est l’inverse du but. Supprimer puis restaurer est justement un geste que la démonstration fait faire.',
  email_sent_at: 'Aucun e-mail n’est envoyé depuis une salle de démo : un horodatage d’envoi serait faux.',
  // #2733 — même raison que `email_sent_at` juste au-dessus, un cran plus
  // loin : aucun e-mail RÉEL ne part d'une salle de démo, donc aucun webhook
  // Resend ne revient jamais dessus. Semer un rebond inventerait un fournisseur
  // qui n'a rien reçu à rejeter — la même faute que « fournisseurs qui ne se
  // nomment jamais » appliquée à un événement plutôt qu'à un nom.
  email_provider_message_id:
    'Identifiant Resend de l’envoi. Aucun e-mail réel ne part d’une salle de démo — en inventer un laisserait croire à un envoi qui n’a pas eu lieu.',
  email_bounced_at:
    'Posée par le webhook Resend (`email.bounced`), qui ne parle jamais d’une salle de démo : aucun e-mail réel n’en part pour rebondir.',
  email_bounce_reason:
    'Même raison que `email_bounced_at` juste au-dessus — sans rebond possible, aucune raison à nommer.',
  // #3699.4/.5 — le sort d'un envoi individuel. Aucun message ne part d'une salle
  // de démo (le serveur refuse : `demo_send_blocked`), donc aucune tentative à
  // consigner : une ligne « pris en charge » inventée affirmerait un envoi qui
  // n'a pas eu lieu (« Fait » ne porte jamais de preuve d'envoi).
  email_send_state:
    'Sort d’une tentative d’envoi. Aucun message ne part d’une salle de démo : un état « pris en charge » serait une preuve d’envoi inventée.',
  email_send_channel: 'Même raison que `email_send_state` — sans tentative, aucun canal utilisé à nommer.',
  email_send_from:
    'Adresse d’expédition réellement utilisée. Sans envoi réel en démo, en afficher une laisserait croire qu’un message est parti de là.',
  // #3699.6
  email_send_attachments:
    'Même raison que `email_send_state` : aucun message ne part d’une salle de démo (`demo_send_blocked`), donc aucune tentative n’a emporté de pièce — semer une preuve de pièce jointe serait une preuve d’envoi inventée.',
  email_send_attempted_at:
    'Instant d’une tentative d’envoi : aucune en démo, un horodatage serait faux (comme `email_sent_at`).',
  // #4179.2
  email_sent_observed_at:
    'Instant où un message sortant a été LU dans la boîte connectée. Aucune boîte ni envoi en démo : un horodatage afficherait « vu dans les éléments envoyés » sans que rien ne soit parti.',
  raw_data: 'Charge brute du fournisseur ; en démonstration il n’y a pas de fournisseur.',
  anonymized_at: 'Horodatage d’effacement RGPD : le renseigner masquerait la fiche.',
  crm_record_id:
    'Identifiant d’une fiche côté CRM. Aucun CRM n’est connecté en démonstration — inventer un identifiant laisserait croire à une synchronisation qui n’existe pas.',
  crm_synced_at:
    'Dernier rapprochement avec le CRM. Sans CRM connecté, une date de synchronisation serait une trace d’un échange qui n’a pas eu lieu.',
  // #2120.68/#2120.70 — aucun code de démonstration ne l'écrit, ni au seed
  // (`demo-contact-density.ts` ne dérive `email_confidence` que pour
  // l'e-mail) ni au clic « Enrichir » (voir `email_confidence` ci-dessus).
  // Aucun signal fiable n'équivaut à `email_status` pour un numéro, en démo
  // comme en réel : « non mesurée » n'est jamais « faible » (GA-18/19).
  phone_confidence:
    'Aucun signal fiable n’existe pour la confiance d’un numéro, en démo comme en réel — non mesurée, jamais devinée : la colonne reste `NULL` sur toute la salle.',
}

/* ------------------------------------------------------------------ */
/*  MAILLE COLONNE : LE PROFIL ESN (`esn_profiles`), COLONNE PAR COLONNE */
/* ------------------------------------------------------------------ */

/**
 * Lot « la parité démo du questionnaire, et la garde qui ne la voyait pas »
 * (15/09/2026) — trois écrivains et un intégrateur ont mesuré le même trou
 * indépendamment le même jour.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE FAIT MESURÉ, ET POURQUOI LA GARDE PAR TABLE NE LE VOYAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `seedEsnProfile` (`demo-seed.service.ts`) ne semait que 10 des 89 clés que
 * porte aujourd'hui le questionnaire d'onboarding (`esnAnswersSchema`, 56
 * questions, `packages/contracts/src/schemas/onboarding.ts`). `esn_profiles`
 * est pourtant classée SEEDÉE dans {@link DEMO_SEEDED_TABLES} : la garde de
 * tête de fichier raisonne au niveau TABLE, donc elle restait VERTE pendant
 * que 37+ colonnes neuves (lots L15, L19, #2054, #2055) restaient vides —
 * exactement le motif que la doctrine du dépôt nomme : « une garde protège une
 * règle, elle ne l'invente pas ». Conséquence visible : `Réglages › Profil`
 * rendait une fiche presque vide en démonstration publique.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ÉTATS POSSIBLES POUR UNE COLONNE, JAMAIS UN QUATRIÈME
 * ─────────────────────────────────────────────────────────────────────────────
 * Même forme que {@link DEMO_CONTACT_SEEDED_COLUMNS} /
 * {@link DEMO_CONTACT_COLUMNS_NOT_APPLICABLE} juste au-dessus, appliquée à
 * `esn_profiles` :
 *  - {@link DEMO_ESN_PROFILE_SEEDED_COLUMNS} : renseignée dans
 *    {@link DEMO_ESN_PROFILE} (`demo-dataset.ts`) ;
 *  - {@link DEMO_ESN_PROFILE_COLUMNS_NOT_APPLICABLE} : plomberie technique
 *    (identifiants, versionnage) ou question sans réponse pour CE profil
 *    précis, avec sa raison écrite. JAMAIS un troisième état, et jamais une
 *    colonne déplacée ici pour faire passer le test (craft rule n°9,
 *    `CLAUDE.md`) — la garde `demo-esn-profile-columns-coverage.spec.ts`
 *    la LIT contre les métadonnées TypeORM de `EsnProfileEntity`, pas contre
 *    une liste recopiée à la main (GA-26).
 */
export const DEMO_ESN_PROFILE_SEEDED_COLUMNS = [
  // Temps 1 — cadrage (10).
  'esn_name',
  'consultant_size',
  'sales_team_size',
  'positioning',
  'staffing_model',
  'expertise_areas',
  'target_sectors',
  'target_company_types',
  'geo_zones',
  'main_sales_pain',
  // Temps 2 — le complément (5).
  'decision_maker_personas',
  'avg_sales_cycle',
  'avg_tjm',
  'client_references',
  'no_go_sectors',
  // Portefeuille d'offre et placement (3).
  'offer_domain',
  'offer_domains',
  'recruits_for_clients',
  // Maturité, effectif réel — lot L15 (7).
  'esn_maturity_situation',
  'active_clients_band',
  'revenue_recurrence',
  'client_concentration_risk',
  'company_growth_goal',
  'consultants_managed_by_user_band',
  'available_consultants_band',
  // #2035.1 / #2035.2 — de quelle population l'effectif parle (2).
  'consultant_size_group_band',
  'consultant_size_business_unit_band',
  // Vivier de consultants déclaré — #2046 (14).
  'talent_pool_identified_band',
  'talent_pool_qualified_band',
  'talent_pool_available_band',
  'talent_pool_availability_recency_band',
  'talent_pool_avg_tjm_band',
  'talent_pool_mobility_band',
  'talent_pool_consent_status',
  'talent_pool_other_processes_band',
  'talent_pool_engagement_reality_band',
  'talent_pool_revalidation_frequency',
  'talent_pool_state_interested_band',
  'talent_pool_state_available_band',
  'talent_pool_state_secured_band',
  'talent_pool_state_presentable_band',
  // Base de clients déclarée — #2047 (11). `client_base_active_accounts_band`
  // n'existe pas : `active_clients_band` ci-dessus porte déjà cette réponse.
  'client_base_missions_ongoing_band',
  'client_base_missions_completed_band',
  'client_base_renewals_band',
  'client_base_satisfaction_band',
  'client_base_referrals_band',
  'client_base_rex_band',
  'client_base_case_studies_band',
  'client_base_cross_sell_band',
  'client_base_deadlines_band',
  'client_base_followup_regularity',
  'client_base_followup_owner',
  // Canaux d'entrée et unités comparables — lot L19 (6).
  'entry_channels_used',
  'entry_channels_measured',
  'entry_channels_last_starts',
  'entry_channels_time_split',
  'activity_measures_tracked',
  'activity_reference_period',
  // Réseau personnel déclaré — #2045.1/.2/.4/.7 (lot B, 22/09/2026) (4).
  'former_clients_count_band',
  'former_colleagues_count_band',
  'partners_count_band',
  'referrers_count_band',
  // Capacité réelle et continuité des dossiers — lot L19 (9).
  'weekly_sales_time_declared',
  'weekly_sales_time_protected',
  'weekly_sales_time_residual',
  'workload_variability',
  'protected_slot_capacity',
  'weekly_sales_time_slots',
  'competing_workloads',
  'dossier_continuity_practices',
  'dossier_continuity_breaks',
  // Cartographie de l'outillage — #2054 (18), puis les outils maison #4971.1 (1).
  'tooling_crm',
  'tooling_ats',
  'tooling_erp',
  'tooling_mailbox',
  'tooling_calendar',
  'tooling_drive',
  'tooling_spreadsheet',
  'tooling_enrichment',
  'tooling_sourcing_platform',
  'tooling_bi',
  'tooling_personal_notes',
  'tooling_reference',
  'tooling_reference_data',
  'tooling_reference_freshness',
  'tooling_reference_confidence',
  'tooling_reference_export',
  'tooling_duplicates',
  'tooling_pain',
  'tooling_internal_names',
  // Freins commerciaux et les trois relances — #2055 (4).
  'sales_freins',
  'frein_attempted',
  'frein_stopped',
  'frein_stopped_reason',
  // Profil progressif — restitution V2 §21-30, dialogue « Ton profil
  // commercial » (25 des 27 : deux masquées par leur branchement, voir
  // DEMO_ESN_PROFILE_COLUMNS_NOT_APPLICABLE — public_sector_practice,
  // shared_data_scope. `partner_relationship` était la troisième jusqu'au
  // 18/09/2026 nuit — voir #2067.2 plus bas, à côté de
  // `go_to_market_channels`, où elle est listée avec les deux comptages).
  'user_role',
  'role_tenure',
  'industry_tenure',
  'individual_goal',
  'monthly_target',
  // #2052 (lot L19) — les objectifs commerciaux NOMMÉS.
  'esn_objectives',
  'company_age',
  'company_size',
  // #2015.7 — la filiation déclarée. Toujours visible (aucun `when`), donc
  // toujours seedée — contrairement au bloc AO ci-dessous.
  'company_group_structure',
  // #2053.4 — la visibilité déclarée sur le délai d'encaissement, et le délai
  // lui-même (posé uniquement quand la visibilité le permet, #2053.8).
  'payment_delay_visibility',
  'payment_delay_band',
  'consultants_on_mission',
  'consultants_in_pipe',
  'team_overlap',
  'ramp_up_capacity',
  'avg_deal_size',
  // #2053.3 — le coût d'intercontrat, DISTINCT de `available_consultants_band`
  // (un effectif) déjà seedé plus haut.
  'intercontrat_cost',
  'target_margin',
  'portfolio_size',
  'accounts_relationship_status',
  'regulated_sector_readiness',
  'go_to_market_channels',
  // #2067.2 (décision Louis du 18/09/2026 nuit, « la démo déclare ses
  // partenaires ») — `go_to_market_channels` porte un second canal
  // (`Partenaires ESN`), donc `worksThroughPartners` s'active : ces trois
  // réponses, MASQUÉES jusqu'ici (voir l'ancienne entrée retirée de
  // DEMO_ESN_PROFILE_COLUMNS_NOT_APPLICABLE), sont désormais SEEDÉES —
  // l'audit (« Ta charge active, arbitrée ») rend « partenaires réguliers »
  // ET leur nombre, prouvé par demo-audit-active-load-coverage.spec.ts.
  'partner_relationship',
  'partners_regular_count',
  'partners_occasional_count',
  'weekly_calls',
  'weekly_emails',
  'weekly_linkedin',
  'sales_routine',
  'sales_blockers',
  'tooling',
  'proactivity_level',
  // #2058.2 / #2058.10 — moments acceptés et niveau de détail attendu.
  'contact_windows',
  'detail_level',
  // #2006.22 — réfuté en production le 20/09 : `mapRowToAnswerMeta` n'avait
  // AUCUN appelant, donc `answer_meta` restait classée NOT_APPLICABLE pour
  // cette raison précise. Ce lot lui donne un appelant réel
  // (`GET /esn-profile/answer-status`) : reclassée SEEDÉE, deux clés
  // (`contact_windows`, `detail_level`) marquées `confirmed`.
  'answer_meta',
  // #2057 — contenu : `doesContentMarketing` s'active pour ce profil
  // (`weekly_linkedin: '1-20'`) — voir DEMO_ESN_PROFILE_COLUMNS_NOT_APPLICABLE
  // pour le bloc AO (#2056), lui MASQUÉ.
  'content_active_profile',
  'content_audience_size',
  'content_visible_expertise',
  'content_reactions',
  'content_conversations_generated',
  'content_funnel_stages_reached',
  // Fonctions exercées et ambition territoriale — #2032.10 / #2036.9 (2).
  // Mesuré le 16/09/2026 : toutes deux ont un lecteur PRODUIT — le prompt
  // `apps/ia/app/prompts/bellum_profiler.py` les nomme (« Fonctions réellement
  // exercées sur le parcours », « Ambition territoriale déclarée »),
  // `ia.client.ts` les envoie et `seller_context.py` projette la première en
  // `sellerFunctionsPracticed`. Un lecteur de prompt suffit : une capacité qui
  // parvient au modèle doit être remplie en démonstration.
  'role_functions_practiced',
  'growth_target_zones',
  // #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée (siège +
  // bureaux). Migration `1795610000000-CompanyLocations`.
  'company_locations',
  // #2060 — la question ouverte qui FERME le parcours. Lue par le prompt
  // `bellum_profiler.py` (« Ce qui n'a pas été couvert par le questionnaire »)
  // — un lecteur de prompt suffit, même règle que `growth_target_zones`
  // ci-dessus.
  'uncovered_activity_note',
  // #2033.2-.8 (D3, décision Louis 18/09/2026) — le périmètre d'autorité
  // DÉCLARÉ. Migration `1795712440422-AuthorityScope.ts`. Seedé pour montrer
  // #2033.9 en salle de démo : `margin_billing_authority` vaut « Je n'ai pas
  // cette responsabilité », donc Laura décline et le dit sur cet axe.
  'decisions_alone',
  'decisions_to_validate',
  'people_managed',
  'recruitment_accounts_authority',
  'staffing_authority',
  'margin_billing_authority',
  'tools_access',
  'invite_authority',
  // #2037.1/.3/.4/.5/.6/.11 (lot EE, 18/09/2026) — « qui fait quoi » au-delà
  // du commercial. Migration `1789741699223-QuiFaitQuoiEquipeElargie.ts`, lue
  // par `bellum_profiler.py` (_COMPLEMENT_SECTIONS, « Qui fait quoi —
  // l'équipe élargie ») : un lecteur de prompt suffit, même règle que
  // `growth_target_zones` ci-dessus.
  'associates_count',
  'recruiters_team_size',
  'delivery_team_size',
  'marketing_team_size',
  'ops_team_size',
  'team_coordination_mode',
  // #2640.2 — le site de l'entreprise, migration `1795996123871-EsnProfileWebsite.ts`.
  'esn_website',
  // #2036.2 (#2847) — remote et déplacements déclarés, migration
  // `1796321380100-RemoteAndTravelScope.ts`. Lu par `bellum_profiler.py`
  // (« Remote et déplacements déclarés ») : un lecteur de prompt suffit,
  // même règle que `growth_target_zones` plus haut.
  'remote_and_travel_scope',
  // #2036.8 (#2847, lot r4 26/09, v1 tranché sans Louis) — posture
  // territoriale déclarée, migration `1796321504100-ZoneCapabilityStatus.ts`.
  // Lue par `bellum_profiler.py` (« Posture territoriale déclarée ») : un
  // lecteur de prompt suffit, même règle que `growth_target_zones` plus haut.
  'zone_capability_status',
  // #3923.a (lot M04, 09/10/2026) — les métiers placés, enfin transportés
  // (`esnAnswersSchema`) et lus par Découvrir (`signalRelevance`, « Pourquoi
  // maintenant ») : ils ont un lecteur, ils sont donc semés. #3923 (lot P01,
  // décision Louis 09/10) — la même valeur s'affiche aux DEUX écrans qui la
  // déclarent : la question du complément Temps 2 et « Mon profil »
  // (`PlacedRolesSection`) — semée une fois, montrée deux fois (GA-26).
  'placed_roles',
  // Théo O onboarding-couverture (22/10/2026) — les 26 « Précisions de cadrage » de la V23, migration
  // `1796575094807-OnboardingV23Answers.ts`. Lues par `bellum_profiler.py` (sections « Cadrage — … ») : un lecteur de
  // prompt suffit, même règle que `growth_target_zones` plus haut. Semées : un profil d'espace COMPLET en démo.
  'activity_nature',
  'first_name',
  'scope_level',
  'scope_unit',
  'language_capabilities',
  'offer_pitch',
  'priority_expertise',
  'skill_technos',
  'bench_status',
  'recruiting_priorities',
  'commercial_limits',
  'currency',
  'target_nature',
  'target_size',
  'country_scope',
  'geography_detail',
  'no_go',
  'account_access',
  'horizon',
  'success_target',
  'data_sources',
  'tools',
  'workflow_pain',
  'delivery_frictions',
  'autonomy',
  'context_policy',
] as const

/** Le reste, avec sa raison — jamais un quatrième état. */
export const DEMO_ESN_PROFILE_COLUMNS_NOT_APPLICABLE: Readonly<Record<string, string>> = {
  heard_about_bellum:
    'ATTRIBUTION MARKETING, jamais une réponse de profil : la question le DIT à qui la lit (« Sert uniquement à l’attribution marketing : n’entre jamais dans ton profil, dans ton score, ni dans tes recommandations. », `onboarding.json`), et deux gardes le tiennent — `heard-about-bellum-attribution.guard.test.ts` fait rougir la CI si `esnAnswersToProfileData` la lit, et `question-keys-reach-the-model.test.ts` la nomme dans `NEVER_REACHES_MODEL_BY_DOCTRINE`. Aucun écran du produit ne la rend. La semer montrerait en démonstration une donnée que le produit s’interdit d’exploiter.',
  id: 'Identifiant technique, généré à l’insertion.',
  // #4270.5 (18/10) — non semé À DESSEIN dans la salle, raison ci-dessous.
  workspace_profile:
    'LA SALLE EST L’ESPACE STAFFING (#4270.1) : `NULL` y est une RÉPONSE — « aucun profil choisi » = la navigation historique, celle de tous les prospects ESN. La semer à `forfait_conseil` déplacerait Staffing, vivier et positionnements derrière Missions pour CHAQUE visiteur, alors que la salle est montée autour d’un vivier, de positionnements et de soumissions. Le profil forfait reste démontrable en salle : il se choisit dans Réglages comme toute réponse de l’entreprise, et la salle porte déjà un besoin et une mission en FORFAIT ENCADRÉ (`DEMO_SUPERVISED_FORFAIT_NEED`, `DEMO_SUPERVISED_FORFAIT_MISSION`, #3547). Pour le montrer SANS déplacer la navigation de chaque visiteur, la salle sème DEUX besoins au forfait encadré (`DEMO_FORFAIT_PROFILE_NEEDS`, #4270.5) : un besoin à cadrer (périmètre, sponsor, budget) et un projet gagné suivi, lié à la mission en forfait encadré — dès qu’on bascule le profil dans Réglages, la carte « Projet à cadrer » et la carte « Projet gagné » se remplissent.',
  user_id: 'Propriétaire de la ligne — plomberie de scoping, invisible à l’écran.',
  version:
    'Compteur de version du profil (chaque sauvegarde crée une nouvelle ligne) — plomberie de versionnage, pas une réponse au questionnaire.',
  is_current:
    'Bascule technique qui marque la ligne ACTIVE parmi les versions — plomberie de versionnage, pas une réponse.',
  workspace_id: 'Scoping de l’espace — même raison que `user_id`.',
  is_workspace_canonical:
    'Bascule technique qui marque LE profil canonique de l’espace — plomberie, pas une réponse au questionnaire.',
  created_at: 'Horodatage technique posé par la base.',
  updated_at: 'Horodatage technique posé par la base.',
  // Métiers placés DÉDUITS (décision Louis 11/10/2026) — trois colonnes qui ne
  // sont PAS des réponses au questionnaire : `DEMO_ESN_PROFILE` ne porte que des
  // réponses. La déduction, elle, EST semée — même forme que `offer_portfolio`
  // juste en dessous : un UPDATE à part dans `seedEsnProfile`.
  inferred_placed_roles:
    'SEMÉE hors de `DEMO_ESN_PROFILE` (qui ne porte que des RÉPONSES) : `seedEsnProfile` écrit `DEMO_INFERRED_PLACED_ROLES`, calculée par la VRAIE déduction (`inferPlacedRoles`) sur le contexte semé — la cybersécurité ressort « déduit » avec ses indices dans « Mon profil ». Prouvé par `demo-inferred-placed-roles-coverage.spec.ts`.',
  inferred_placed_roles_at:
    'Horodatage technique de la déduction, posé à `now()` par le même UPDATE de `seedEsnProfile` que `inferred_placed_roles` — pas une réponse au questionnaire.',
  dismissed_inferred_roles:
    'Les métiers déduits que l’humain a RETIRÉS : un geste du visiteur, jamais semé — le semer montrerait une correction que personne n’a faite. Vide = rien n’a été retiré, et l’écran propose tous les déduits.',
  offer_portfolio:
    'Le LEXIQUE de l’espace (D17, addendum Stelya §5) reste VIDE : sa propre raison est documentée juste au-dessus dans ce fichier (montrer le vocabulaire PAR DÉFAUT du produit). SEUL `sold_seniority_levels` est semé (#3238.8, `DEMO_SOLD_SENIORITY_LEVELS`, un UPDATE à part dans `seedEsnProfile`) : un réglage lu par Découvrir pour comparer la séniorité cherchée aux niveaux placés, sans surcharge de libellé.',
  known_competitors:
    'Colonne existante SANS AUCUN lecteur produit — aucun prompt, aucun écran, aucun prédicat de branchement ne lit cette colonne aujourd’hui. Poser la question coûterait un effort sans contrepartie.',
  support_preferences:
    'Même raison que `known_competitors` — colonne sans lecteur produit. Une réponse ici ne changerait ni un prompt, ni un écran, ni une décision du produit.',
  target_accounts_maturity:
    'Même raison que `known_competitors` — colonne sans lecteur produit, jamais posée par aucune sous-étape du questionnaire ni par le profil progressif.',
  social_proof_level:
    'Même raison que `known_competitors` — colonne sans lecteur produit, jamais posée par aucune sous-étape du questionnaire ni par le profil progressif.',
  outreach_channels:
    'N’est PAS une clé de `esnAnswersSchema` (89 clés) : aucune sous-étape ne l’écrit, pour aucun utilisateur réel. `sales_context.py::_esn_profile_context` la lit défensivement (`profile_data.get("outreachChannels")`), mais `esnAnswersToProfileData` (`analysis.ts`) ne la fait jamais parvenir jusque-là — la colonne est INATTEIGNABLE par tout profil réel aujourd’hui. La semer en démonstration montrerait une capacité qu’aucun client ne peut produire.',
  public_sector_practice:
    'Question du profil progressif (`profile-questionnaire.ts`) MASQUÉE pour ce profil précis : son prédicat `targetsPublicSector` ne s’active que si `target_sectors`/`target_company_types` nomment le secteur public ou une collectivité — Bellum Conseil cible CAC40/SBF120 et scale-ups (voir DEMO_ESN_PROFILE), jamais l’administration. La répondre quand même contredirait la cible déjà seedée.',
  // `partner_relationship`, `partners_regular_count`, `partners_occasional_count`
  // étaient ici, masquées par `worksThroughPartners` (Bellum Conseil ne
  // déclarait aucun canal partenaire). #2067.2 (décision Louis du 18/09/2026
  // nuit, « la démo déclare ses partenaires ») : `go_to_market_channels` porte
  // désormais un second canal (`Partenaires ESN`), le prédicat s’active, les
  // trois questions cessent d’être masquées — elles sont SEEDÉES, voir
  // `DEMO_ESN_PROFILE_SEEDED_COLUMNS` plus haut et `DEMO_AUDIT_ACTIVE_LOAD_COVERAGE`
  // plus bas.
  shared_data_scope:
    'Question du profil progressif MASQUÉE par `worksAlone` (`profile-questionnaire.ts`) : elle ne se pose qu’à qui a une équipe avec qui partager des données — `sales_team_size` vaut « Je suis seul (fondateur / indépendant) », la valeur même que `worksAlone` détecte. Il n’y a personne avec qui partager.',
  // #2056 — bloc appels d'offres, MASQUÉ pour ce profil précis : `pursuesRfps`
  // (`profile-questionnaire.ts`) ne s'active ni sur `targetsPublicSector`
  // (Bellum Conseil cible CAC40/SBF120 et scale-ups, jamais l'administration)
  // ni sur `go_to_market_channels` contenant "Appels d'offres" (seul
  // `['Direct client final']` est seedé). Les onze colonnes (les neuf
  // d'origine + `rfp_deal_value`/`rfp_owner_assignment`, #2056.11/#2057.10)
  // tombent ensemble, même mécanisme que `public_sector_practice` juste
  // au-dessus.
  rfp_platforms_used:
    'Question du bloc appels d’offres (#2056) MASQUÉE par `pursuesRfps` (`profile-questionnaire.ts`) — même raison que `rfp_referencing_status` ci-dessous.',
  rfp_referencing_status:
    'Question du bloc appels d’offres (#2056) MASQUÉE par `pursuesRfps` : ni `targetsPublicSector` ni `go_to_market_channels` contenant "Appels d’offres" ne sont vrais pour Bellum Conseil (vente directe, jamais l’administration).',
  rfp_lot_allocation: 'Même raison que `rfp_referencing_status` — masquée par `pursuesRfps`.',
  rfp_response_templates: 'Même raison que `rfp_referencing_status` — masquée par `pursuesRfps`.',
  rfp_volume: 'Même raison que `rfp_referencing_status` — masquée par `pursuesRfps`.',
  rfp_volume_period: 'Même raison que `rfp_referencing_status` — masquée par `pursuesRfps`.',
  rfp_outcomes: 'Même raison que `rfp_referencing_status` — masquée par `pursuesRfps`.',
  rfp_go_no_go_process: 'Même raison que `rfp_referencing_status` — masquée par `pursuesRfps`.',
  rfp_document_readiness: 'Même raison que `rfp_referencing_status` — masquée par `pursuesRfps`.',
  // #2056.11 / #2057.10 — l'économie du dossier et l'owner, ajoutées à la
  // même famille AO : masquées pour la même raison que leurs neuf voisines.
  rfp_deal_value: 'Même raison que `rfp_referencing_status` — masquée par `pursuesRfps`.',
  rfp_owner_assignment: 'Même raison que `rfp_referencing_status` — masquée par `pursuesRfps`.',
  // #2007.11 — les clés que l'utilisateur a volontairement PASSÉES dans le
  // questionnaire. Colonne plomberie qui alimente UNIQUEMENT le prompt du
  // Profileur (`build_profiler_user_prompt`, `apps/ia`) : aucun écran ne la
  // lit aujourd'hui, et la démo de Bellum Conseil n'invoque jamais le
  // Profileur en direct (`raw_analysis`/`profile_context` y sont des
  // fixtures statiques) — y semer une clé ne changerait rien à l'écran.
  // Même raisonnement qu'`answer_meta` AVANT son appelant réel (#2006.22,
  // ligne juste au-dessus dans `DEMO_ESN_PROFILE_SEEDED_COLUMNS`) : vide à
  // dessein tant qu'aucun écran ne la consomme, à reclasser SEEDÉE le jour
  // où l'un le fera.
  skipped_question_keys:
    'Colonne plomberie qui alimente uniquement le prompt du Profileur (apps/ia, #2007.11) : aucun écran ne la lit, et la démo de Bellum Conseil n’invoque jamais le Profileur en direct — y semer une clé ne changerait rien à l’écran.',
}

/* ------------------------------------------------------------------ */
/*  Quatrième niveau : les BULLES de Laura                             */
/* ------------------------------------------------------------------ */

/**
 * Ce que Laura peut dire dans la salle de démonstration — et ce qu'elle ne dira
 * pas, avec la raison.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN QUATRIÈME NIVEAU
 * ─────────────────────────────────────────────────────────────────────────
 * Les trois premiers demandent « cette TABLE est-elle remplie ? », « cette CLÉ
 * d'analyse est-elle renseignée ? », « cette COLONNE de contact l'est-elle ? ».
 * Aucun ne voit une bulle : une intervention ne lit pas une table à elle, elle
 * lit des COMPTAGES sur les tables des autres. Le lot qui a fait passer les
 * détecteurs de huit à vingt-cinq n'a donc ajouté aucune table, la garde de
 * couverture est restée verte — et un visiteur n'aurait vu aucune des dix-sept
 * nouvelles bulles. C'est exactement le trou que ce fichier existe pour
 * fermer, à une maille de plus.
 *
 * ⚠️ Ce n'est pas une liste de ce qui S'AFFICHERA. Détecter n'est pas parler :
 * le plafond de proactivité (trois par jour par défaut), l'unicité par écran et
 * les vingt minutes d'écart s'appliquent ensuite. Une salle prêtée trente
 * minutes en montre UNE, deux si le visiteur reste — et c'est le comportement
 * voulu, pas un seed raté.
 *
 * ⚠️ Ce n'est pas non plus la liste de ce que le produit sait détecter : cette
 * liste-là vit du côté de Laura, et une clé sans détecteur est muette PARTOUT,
 * pas seulement en démonstration. Ici on répond à une seule question, celle du
 * lien de démonstration : **sur l'état seedé de la salle, cette bulle
 * peut-elle apparaître ?**
 */

/**
 * Les bulles que l'état SEEDÉ de la salle suffit à rendre atteignables, chacune
 * avec ce qui les alimente. Un visiteur peut les rencontrer sans rien faire.
 */
export const DEMO_LAURA_BUBBLES_REACHABLE: Readonly<Record<string, string>> = {
  forecast_revenue_declared_blocked:
    "#2875/#3398 (lot B3 15/10) — la mission « Socle conteneurisé des applications terrain — run » (`demo-dataset.ts`, Hakim Barreau, statut `active`, sans date de fin) porte `renewal_status: 'bloque'` : `forecastDeclaredBlockedMissions` (`laura-probe.service.ts`) la compte, en UN COUNT. Sur `/chat` elle est budgétée comme ses voisines (une carte par visite, ordre du rôle) ; l'écran Pilotage › Prévisionnel montre le même fait dans le scénario bas.",
  no_connector:
    'Aucun outil n’est branché en démonstration (`crm_connections` est vide à dessein), donc l’axe « connecteurs » n’est pas mesurable — et c’est le seul endroit du produit où cette absence EST l’information. La bulle se pose sur Réglages › Intégrations, l’écran qui dit déjà la vérité.',
  no_skills_dossier:
    'Le vivier est seedé (sept profils) et `cv_versions` est vide à dessein — composer un dossier de compétences est justement le geste que la démonstration fait faire. La bulle propose ce geste, sur l’écran où il se fait.',
  accounts_without_next_action:
    'Six comptes sont seedés et trois tâches ouvertes seulement portent un compte : trois dossiers n’ont donc aucune suite prévue. C’est vrai à l’écran, et un prospect peut le vérifier en ouvrant la liste.',
  consultant_free_soon:
    'Salomé Dufour : son unique affectation en cours finit dans vingt-huit jours, aucune n’est sans date de fin, et le besoin « Architecte de plateforme » reste ouvert — le geste proposé mène donc quelque part au lieu d’ouvrir une liste vide.',
  long_bench:
    'Camille Roussel : sa dernière affectation s’est terminée il y a soixante-seize jours, elle n’en a aucune en cours ni aucune sans fin. C’est ce que sa fiche annonçait déjà (« disponible immédiatement ») sans qu’aucune donnée ne le confirme. Le besoin « Architecte de plateforme » du pipe, en « matching à lancer », est celui où elle arrive en tête : le geste proposé mène quelque part.',
  mission_ended_without_feedback:
    'La mission « Migration du socle applicatif vers les conteneurs — lot 1 » s’est terminée il y a soixante-seize jours et ne porte aucun `rex_entries` — ce qui est le bon état : un retour d’expérience s’écrit, il ne se seede pas (voir la raison de `rex_entries` plus haut).',
  need_open_without_shortlist:
    'DEUX besoins de la salle la déclenchent, et aucun n’a eu à être ajouté : « Ingénieur systèmes — supervision des systèmes temps réel » (à qualifier depuis dix-neuf jours, zéro positionnement) et « Architecte de plateforme », le rôle du pipe, en « matching à lancer » depuis douze jours avec zéro profil positionné. Les quatre autres besoins portent des positionnements, donc se taisent — et c’est cet écart qui fait la démonstration : la bulle ne dit pas « ton kanban est vide », elle nomme les deux cartes qui traînent. ⚠️ L’âge se lit sur `status_changed_at`, que le semis DATE (`now() - N days`), et non sur `created_at`, qui vaut l’instant de la remise à neuf.',
  consultant_repeat_placement:
    'Elle demande TROIS missions DÉMARRÉES pour le même couple (consultant, compte). Yanis Berthier en porte trois chez le client d’exemple depuis la vague 15 — la troisième a été semée exprès, Louis l’ayant tranché le 28/08/2026. Tous les autres consultants en portent une, donc la bulle nomme UNE personne et pas la moitié du vivier. Effet de bord assumé et voulu : le compteur « placé N fois » du vivier lit la même dérivation et affiche 3 sur lui, ce qui est justement ce qu’un prospect doit voir de cette colonne.',
  needs_without_matching:
    'Elle demande au moins TROIS besoins ouverts et aucune shortlist composée. La salle en porte six depuis le 28/08/2026 (un par colonne travaillée du kanban) et `shortlists` est vide à dessein — composer une sélection EST le geste de la démonstration. La bulle propose donc exactement ce geste, sur des rôles que le visiteur a sous les yeux. Elle était déclarée muette tant que la salle n’en portait qu’un.',
  account_hiring_with_available_bench:
    'Les DEUX moitiés étaient déjà semées, et aucune n’a eu à être ajoutée. Côté COMPTE : le dossier du groupe de défense porte « 3 300 recrutements annoncés en France pour 2026 » dans `recent_signals`, en `type: recrutement` et `freshness: current`, avec sa source (« Presse nationale ») et sa date (« 2026-04 ») — c’est exactement ce que le panneau rend sous « Pourquoi cette suggestion ? », donc un prospect peut le vérifier en ouvrant l’onglet Signaux d’à côté. Côté VIVIER : trois des sept fiches sont en `availability: immediate`. ⚠️ Elle ne se pose que sur le DOSSIER OUVERT (`/accounts/<identifiant>`), jamais sur la liste : la voir demande d’ouvrir ce compte-là, ce qui est de toute façon le premier geste d’une démonstration. ⚠️ La durée d’ouverture des postes n’est PAS annoncée — la date du signal voyage brute (« 2026-04 »), et « depuis 42 jours » aurait été un chiffre que personne ne peut vérifier.',
  // #3939.3 — la douleur sourcée et datée du dossier ouvert.
  account_pain_with_dated_signal:
    '#3939.3 — rien n’a eu à être ajouté : le dossier Société Générale porte déjà l’hypothèse qualifiée « Société Générale arbitre ses investissements applicatifs avant les décisions budgétaires du plan 2029 », fondée par `based_on_signal_ids` sur s1 et s2, deux signaux `current` datés au MOIS (« 2026-07 ») — l’âge se dit donc en mois, jamais en jours inventés. La seconde hypothèse (s4, daté d’une année seule) ne fonde rien, et c’est le silence voulu : une année n’est pas une date. Elle se pose sur `/accounts/<id SG>`, dans le panneau Laura, sans source nommée ni probabilité. `demo-laura-account-pain.spec.ts` le MESURE avec la lecture de la sonde.',
  follow_up_overdue:
    '#3398 — la tâche « Relancer sur les deux profils conformité » (Société Générale, `DEMO_TASKS`, échéance −2 jours, statut `todo`) est ouverte, rattachée à un compte et en retard À DESSEIN : la mesure `accountTasksOverdue` vaut 1 dans la salle, et le geste mène à /actions où cette même tâche se lit. X24 : la même bulle se pose aussi sur /briefing, là où « 1 tâche en retard » est compté.',
  mission_start_not_ready:
    '#2409.8 — la mission pas encore démarrée de la salle (`DEMO_START_READINESS_MISSION`, `onboarding`, début dans douze jours) est DANS la fenêtre de quatorze jours et sa checklist est partielle : l’accord du consultant manque, l’accès du premier jour reste une réserve. Rien n’a été ajouté pour la bulle — c’est la même mission que le panneau « Prête à démarrer ? » montre déjà, jugée par le même contrat. `demo-coverage.spec.ts` le MESURE (fenêtre + verdict), il ne le suppose pas.',
  calls_without_debrief:
    '#3398 (lot R12 07/10) — DEUX appels de `DEMO_ACTIVITIES` la déclenchent, et aucun n’a eu à être ajouté : l’appel SNCF « Point sur le besoin publié » (`daysAgo: 7`, `outcome: connected_qualified`, aucun `callDebrief`) et l’appel Société Générale « Point d’avancement — avant l’envoi des profils » (`daysAgo: 6`, aucune issue, aucun `callDebrief` — le cas « logué mais pas encore qualifié » que `TimelinePanel` affiche déjà « Issue non renseignée »). Les deux sont `source: manual` (le défaut du semis) et dans la fenêtre de quatorze jours (`FIELD_CALL_DEBRIEF_WINDOW_DAYS`). Les deux AUTRES appels de la salle (SNCF à 9 jours, Société Générale à 2 jours) portent un `callDebrief` saisi et ne comptent pas.',
  payment_overdue_30_days:
    '#3192.2 — déplacée depuis `DEMO_LAURA_BUBBLES_SILENT`, où sa raison (« les treize mois facturés portent TOUS leur `paid_at` ») était devenue fausse : `demo-dataset.ts` (« LES DEUX IMPAYÉES ») porte depuis deux factures jamais réglées (mission interrompue, mois −8/−9), ajoutées pour le seau « En retard » de l’écran Encaissements. La mesure `invoicesOverdueBeyondGrace` (`laura-probe.service.ts`) les compte bel et bien. Elle se voit sur `/missions/facturation`, son écran de catalogue. Sur `/chat`, une seule intervention s’affiche par visite, choisie dans l’ordre du RÔLE (`laura-chat-signals.ts`, c76 — le rôle réordonne, jamais ne filtre) : pour les rôles manager, commercial et recruteur, une clé classée plus haut et déjà active (`mission_start_not_ready` pour le manager, `follow_up_overdue` pour le commercial et le recruteur, toutes deux ci-dessus) gagne la carte à sa place — ce n’est donc pas visible sur `/chat` pour ces trois rôles, par conception. Pour le rôle dirigeant, les trois clés qui la précèdent dans la lecture (`margin_not_measured`, `portfolio_too_wide`, `accounts_without_owner`) sont toutes muettes dans la salle (voir `DEMO_LAURA_BUBBLES_SILENT`), et elle gagne. #3192.2 (lot RAY, 11/10) — la recette G3 ne l’a pas vue sur `/missions/facturation` : la bulle est budgétée, donc tributaire du tirage. L’écran porte désormais SA carte (`OverdueThirtyDaysCard`, lue des mêmes deux factures impayées de la salle, mois −8/−9, via les fonctions de l’écran Encaissements) — visible à chaque visite, sans dépendre du rôle.',
}

/**
 * Les bulles qui restent MUETTES sur l'état seedé, chacune avec sa raison.
 *
 * ⚠️ Une entrée ici dit « on a regardé, et le silence EST le bon état » — jamais
 * « on n'a pas réussi à la déclencher ». Plusieurs de ces silences sont même la
 * PREUVE que le seed a marché : `empty_talent_pool` se tairait devant un vivier
 * vide, et il se tait devant sept profils.
 */
export const DEMO_LAURA_BUBBLES_SILENT: Readonly<Record<string, string>> = {
  interview_brief_not_consulted:
    "#2875/#3398 (lot T06 08/10) — elle demande un entretien PLANIFIÉ (`interviews.outcome = 'pending'`), dans les quarante-huit heures qui viennent (`INTERVIEW_BRIEF_WINDOW_HOURS`), dont `brief_viewed_at` est resté `null`. L’UNIQUE entretien seedé (`demo-seed.service.ts`, `interview_days_ago`) est posé `outcome: 'positive'` et daté dans le PASSÉ — l’entretien déjà TENU du récit de démo, jamais un rendez-vous à venir. Il sort donc des deux conditions à la fois, sans qu’aucun calcul n’ait eu à être forcé. En fabriquer un second, planifié et daté « dans les 48 heures » autour d’une salle prêtée en continu daterait sans arrêt, exactement le défaut que `first_login` refuse déjà pour une autre bulle. Le silence EST le bon état du récit actuel.",
  client_dependency:
    '#3398.1 — elle lit le TJM SAISI sur les affectations en cours (`mission_assignments.daily_rate_cents`). Les affectations de la salle (`DemoSeedService`, deux INSERT) ne portent PAS de TJM d’affectation : le TJM de démo vit sur la mission. La mesure est donc absente, et une mesure absente se tait (jamais 0 %). Semer des TJM d’affectation déplacerait la marge et le CA affichés ailleurs : à faire avec ces écrans, pas ici.',
  accounts_without_owner:
    '#3398.2 — depuis #4158.13 la salle compte des collègues, mais TOUT compte y a un responsable (l’occupant ou un collègue, `seedColleagues`) : la mesure « sans responsable » reste absente, et un 0 inventé se lirait « tout est attribué ». Le silence EST le bon état d’un portefeuille entièrement attribué.',
  account_collisions:
    '#3398.2 — une collision demande deux personnes distinctes dans `user_actions` sur le même compte. Les collègues fictifs de la salle (#4158.13) ne travaillent que SUR LEURS comptes — aucun compte n’a deux auteurs dans `user_actions` (garde `demo-team-colleagues.spec.ts`). Fabriquer une collision serait un faux : le silence EST le bon état.',
  portfolio_too_wide:
    '#3398.1/.4 — elle demande plus de cinquante comptes ACTIFS assignés à la personne ; la salle en porte quarante. Gonfler le portefeuille pour déclencher la bulle déplacerait tous les écrans qui le comptent (comptes, pilotage, quotas) : le silence EST le bon état d’un portefeuille tenable.',
  consultant_to_requalify:
    '#3398.5 — elle demande une fiche dont la disponibilité est `inconnu`. Les sept profils de la salle sont tous déclarés : en rendre un muet déplacerait la mesure « personne ne l’a dit » de la bulle du dossier et les calibrations verrouillées (`consultant_free_soon`, `long_bench`). Le silence EST le bon état d’un vivier renseigné.',
  availability_stale:
    '#3398 — elle demande une disponibilité déclarée POSITIVE dont `availability_checked_at` a plus de soixante jours. Les sept profils de la salle sont revalidés à la date du seed (aucun état « à confirmer »), et en périmer un déplacerait des calibrations déjà verrouillées (`consultant_free_soon`, `long_bench`) sans rien démontrer de plus : le silence EST le bon état d’un vivier à jour.',
  first_login:
    'La salle est prêtée : le compte du visiteur naît AVEC elle, et rien ne distingue un premier accès d’un cinquième jour d’usage continu. Souhaiter la bienvenue au hasard vaut moins que se taire.',
  esn_profile_incomplete:
    'Le profil ESN n’est pas seedé (`esn_profiles` est vide à dessein : c’est l’onboarding qui le remplit). La bulle demanderait au visiteur de compléter le profil d’une entreprise qui n’est pas la sienne, dans une salle que d’autres traversent après lui.',
  first_account_ready:
    'Elle se déclenche sur l’OUVERTURE de l’onglet Plan, et le dépôt ne collecte aucune télémétrie d’écran — en démonstration comme ailleurs. Les plans d’action, eux, sont seedés : l’onglet est plein, c’est le compteur d’ouverture qui n’existe pas.',
  no_action_validated:
    'Elle se compte depuis la PREMIÈRE analyse, un jalon que la salle ne pose pas : ses dossiers sont seedés, pas analysés. Approximer par la date du premier compte ferait mentir le message sur un espace importé.',
  first_action_validated:
    'Félicitation du tout premier geste : rien n’enregistre qu’un passage était le premier, et la rejouer à chaque action validée est exactement le message qui apprend à ne plus regarder les messages.',
  week_one_recap:
    'Sa fenêtre est de sept à neuf jours après l’inscription. Le compte du visiteur a quelques minutes, et la salle lui est prêtée trente : il n’y a pas de semaine à récapituler.',
  empty_talent_pool:
    'Le vivier est SEEDÉ — sept profils. La bulle annoncerait « ton vivier est vide » devant un vivier plein : son silence est la preuve que le seed a marché, et c’est le défaut trouvé en recette live qu’elle ne doit plus reproduire.',
  placed_roles_unknown:
    'Métiers placés DÉDUITS (11/10/2026) : Bellum Conseil DÉCLARE quatre métiers (`DEMO_ESN_PROFILE.placed_roles`) et sa déduction en trouve d’autres (`DEMO_INFERRED_PLACED_ROLES`). La question « quels métiers places-tu ? » n’a rien à demander : son silence prouve que le profil et la déduction sont semés. La faire parler supposerait de vider les métiers déclarés — inventer un manque.',
  crm_not_connected:
    'Elle demande dix comptes analysés ; la salle en porte six. L’invitation à brancher un outil est de toute façon déjà portée par `no_connector`, sur le même écran — deux bulles pour le même geste seraient une répétition, pas une insistance.',
  no_routine_enabled:
    'Quatorze jours après l’inscription, et le compte du visiteur en a zéro. Les routines ne sont pas seedées non plus : en armer une ferait partir des envois programmés depuis une salle publique.',
  copilot_never_used:
    'Dix jours après l’inscription. Le fil du copilote commence vide à dessein — lui poser une question EST la démonstration — mais le compte du visiteur vient de naître : la bulle serait un reproche adressé à quelqu’un qui n’a pas encore eu le temps de parler.',
  pipeline_runs_dry:
    'Quatre affaires de la salle portent désormais une clôture espérée, étalées de −34 à +181 jours (vague 15). La bulle lit la PLUS LOINTAINE des affaires encore en jeu et se déclenche sous soixante jours : le « Schéma directeur data » à +181 j la tient muette, et la « Supervision applicative » à +92 j fait la seconde marche, si bien que perdre une affaire ne fait pas basculer la salle. Ce silence est DÉLIBÉRÉ et il est le bon état : un pipe sain ne déclenche pas cette bulle, et une salle de démonstration qui annonce « ton pipe ne porte plus rien au-delà de deux mois » raconte une ESN à l’agonie — ce n’est pas ce qu’on montre à un prospect. Le seuil n’est pas recopié ici : la garde importe `PIPE_TENSION_DAYS` du détecteur.',
  timesheet_missing_after_reminders:
    'Elle lit `mission_timesheets.reminders_sent`, et le semis l’écrit à ZÉRO — décision de Louis, déjà tenue sur les factures : on ne montre pas des relances envoyées à des clients fictifs qui n’en ont jamais reçu. Le compteur n’est écrit que par `recordReminder`, c’est-à-dire par un geste humain sur un vrai destinataire. Un « 2 » semé ferait dire à la salle qu’une ESN de démonstration a relancé deux fois quelqu’un qui n’existe pas — et c’est exactement le genre de chiffre qu’un prospect retient.',
  missions_without_timesheet:
    'Elle se déclenche quand des missions existent SANS le moindre relevé ; la salle en porte deux, validés, dont un avec son écart expliqué. Comme `empty_talent_pool`, son silence dit que le seed a marché.',
  plan_feature_never_opened:
    'Elle repose sur l’axe « profondeur » du score : quatre familles d’objets sur cinq existent dans la salle — comptes, consultants, missions, besoins — très au-dessus du seuil. La cinquième, les intégrations, est vide à dessein.',
  no_connection_7_days:
    'Elle mesure l’écart entre la visite en cours et la PRÉCÉDENTE. Un visiteur de démonstration n’en a pas de précédente, et l’absence de repère ne se confond pas avec « absent depuis sept jours » — c’est la règle « non mesuré n’est pas zéro », appliquée à une date.',
  connector_error_48h:
    'Aucun outil n’est branché en démonstration, donc aucun ne peut être en panne. Afficher une connexion cassée qui n’existe pas serait le mensonge exact que ce jeu de données s’interdit ailleurs (voir `connector_capability_probes`).',
  credits_expiring:
    'Aucun crédit n’est débité en démonstration (`credit_ledger` et `credit_reservations` sont vides à dessein) et la salle ne porte pas d’abonnement : la fin de cycle n’est pas mesurable, et « non mesuré » n’est pas « il te reste tout ».',
  notifications_all_off:
    'Les interrupteurs du visiteur sont à leurs valeurs par défaut, donc plusieurs restent allumés. La bulle se déclenche sur ZÉRO interrupteur — c’est-à-dire sur un geste que le visiteur devrait faire lui-même dans les réglages.',
  high_correction_rate:
    'Le journal des champs (`record_field_audit`) ne porte, en démonstration, qu’UNE correction humaine — le transfert de BU d’une mission, sur un seul champ (les deux relevés automatiques du poste d’un siège, semés pour le contrôle avant action d’un contact, #3219, ne sont pas des corrections : la bulle ne compte que la source `human`) : aucun champ n’y est corrigé plusieurs fois, le reste se remplit au premier geste du visiteur. Corriger trois fois le même champ du même objet demande plus de temps qu’une visite de trente minutes.',
  single_active_seat:
    'Une salle de démonstration a UN siège, et la bulle compare des sièges PAYÉS à des sièges actifs. Elle inviterait à faire venir une équipe qui n’existe pas, sur un espace où l’invitation est refusée (`workspace_invitations` est vide pour la même raison).',
  no_action_14_days:
    'L’historique d’activité est seedé (`user_actions`), donc l’axe d’activation n’est pas nul. Une salle qui annoncerait « aucune action depuis quatorze jours » juste au-dessus de son propre historique se contredirait à l’écran.',
  trial_ending:
    'Aucun abonnement n’est attaché à la salle : il n’y a pas de période d’essai à voir se terminer. En inventer une afficherait une échéance de facturation à quelqu’un qui n’a rien acheté, sur un lien public.',
  mission_ending_no_plan:
    'Elle LIT les alertes de renouvellement posées par le balayeur d’interventions, et le balayeur exclut explicitement les espaces de démonstration (`interventions` est vide pour cette raison). La mission qui finit sous trente jours est bien dans la salle — c’est `consultant_free_soon` qui la porte, du côté de la personne qui se libère.',
  margin_not_measured:
    'Elle se déclenche quand AUCUNE mission en cours ne porte de coût chargé ; deux des quatre en portent un. Les deux autres n’en portent pas à dessein — c’est ainsi que la vue « marge par canal » montre une ligne NON MESURABLE au lieu de l’absorber dans un total.',
  rfp_deadline_gaps:
    'Les appels d’offres sont vides à dessein : en importer un et voir ses exigences se classer EST la démonstration. La bulle est donc atteignable PAR LE GESTE du visiteur — s’il dépose un dossier à moins de trois jours de l’échéance avec des exigences obligatoires sans réponse — et c’est le seul état où elle dirait quelque chose de vrai. ⚠️ Depuis le 29/08, elle est aussi la SEULE de la salle à se poser en PANNEAU (le format est enfin appliqué) : les deux autres interventions en panneau, `first_login` et `no_connection_7_days`, sont muettes ici pour les raisons écrites juste au-dessus. Voir le panneau en démonstration demande donc ce geste-là, et rien ne se seede pour l’éviter — un appel d’offres inventé ferait exactement la donnée fictive que ce jeu s’interdit.',
  mission_active_past_end_date:
    'Elle signale une CONTRADICTION — une mission déclarée en cours dont la date de fin saisie est déjà passée — et la salle n’en porte AUCUNE : ses neuf missions ont toutes une échéance future, absente à dessein, ou un statut terminé. Le silence est ici le bon état, et il est MESURÉ, pas supposé : `demo-coverage.spec.ts` relit les missions seedées et refuse le couple (statut en cours, date de fin passée). ⚠️ En semer une ne coûterait pas qu’une bulle : la même date borne le planning (la barre finirait avant aujourd’hui sous un statut « en cours »), la préparation de facture (`m.ends_on >= <1er du mois>`) et les relevés attendus. La salle se contredirait sur trois écrans pour en illustrer un — exactement ce que `payment_overdue_30_days` refuse déjà à côté. La bulle reste atteignable PAR LE GESTE du visiteur : prolonger puis laisser filer une mission de la salle la fait apparaître.',
  mission_day_one_unconfirmed:
    '#2409.9 — elle demande une mission dont la date de début est arrivée depuis moins de trois jours et qui n’est toujours pas « en cours ». La seule mission pas encore démarrée de la salle commence dans douze jours, et c’est à dessein : elle porte déjà la bulle voisine `mission_start_not_ready` sur le MÊME écran (`/missions/board`), où la règle « une intervention par écran » n’en laisserait passer qu’une. Semer une seconde mission non démarrée datée d’aujourd’hui ajouterait une ligne au planning, aux relevés attendus et à la préparation de facture pour une bulle qu’aucun visiteur ne verrait. Le silence est MESURÉ par `demo-coverage.spec.ts` (aucune mission non démarrée dans la fenêtre J0-J+2).',
}

/**
 * Les ANNONCES DE FACTURATION, et pourquoi la salle de démonstration se tait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE MAILLE DE PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * L'annonce « bientôt à court de crédits » (D5) n'ajoute AUCUNE table : elle se
 * calcule sur l'abonnement, que la salle porte déjà. La garde par table ne pose
 * donc aucune question à son sujet — et c'est exactement le genre de silence qui
 * fait découvrir un écran faux en réunion plutôt qu'en CI. La question « et en
 * démonstration, ça montre quoi ? » a besoin d'un endroit pour sa réponse même
 * quand la fonctionnalité n'a rien à seeder.
 *
 * ⚠️ Même interdit qu'ailleurs : une entrée ici dit « on a regardé, et le
 * silence EST le bon état » — jamais « on n'a pas réussi à le faire apparaître ».
 */
export const DEMO_BILLING_ANNOUNCEMENTS_INTENTIONALLY_SILENT: Readonly<Record<string, string>> = {
  credits_low:
    "Aucun geste ne débite en démonstration — `consumeAnalysisSlot` et `consumeEnrichmentCredit` court-circuitent le débit, `credit_ledger` et `credit_reservations` sont vides à dessein — et la salle ne porte aucun abonnement : il n'y a ni cycle, ni date de renouvellement, ni consommation à mesurer. Un bandeau « il te reste 4 crédits sur 20 » y afficherait un mur de facturation qui n'existe pas, sur un lien public que des inconnus traversent, avec une échéance inventée. `GET /credits` renvoie donc `credits_low: false` dès que l'espace est une salle de démonstration, et le bandeau ne se rend pas — les deux moitiés sont tenues par un test.",
}

/**
 * LES CINQ AGRÉGATS DE PROPAGATION, ET CE QUE LA SALLE EN MONTRE (PDF 2 §4).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE MAILLE DE PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * Même raison que les annonces de facturation juste au-dessus : ces cinq
 * chiffres n'ajoutent AUCUNE table. Ils se calculent sur `missions`,
 * `mission_assignments`, `mission_commercial_terms`, `invoice_readiness` et
 * `project_contacts` — toutes déjà classées. La garde PAR TABLE ne pose donc
 * aucune question à leur sujet, et c'est précisément le silence qui fait
 * découvrir un bandeau vide en réunion plutôt qu'en CI.
 *
 * Ce que le visiteur doit voir : sur la fiche du client d'exemple, le bandeau
 * « ce client vous a rapporté X € sur N missions » ; sur le vivier, « placé 4
 * fois » ; sur la fiche d'un consultant, sa marge moyenne ou la raison pour
 * laquelle elle n'est pas mesurable.
 *
 * ⚠️ `a_semer` n'est PAS un synonyme de « vide à dessein ». C'est l'aveu qu'un
 * écran livré s'ouvrira vide, avec les lignes exactes qui le rempliraient. La
 * garde n'en tolère qu'UN à la fois : le second exige une décision, pas un
 * ajout de ligne.
 *
 * ⚠️ Depuis le 28/08/2026 il n'y en a plus AUCUN, et c'est l'état normal : le
 * seul aveu de la liste (`contact_signed_missions`) a été semé le jour même. La
 * garde tient donc désormais « zéro ou un », pas « exactement un » — un cliquet
 * qui EXIGERAIT un trou obligerait à en laisser un ouvert pour rester vert.
 */
export const DEMO_PROPAGATION_AGGREGATES: Readonly<
  Record<string, { state: 'seede' | 'vide_a_dessein' | 'a_semer'; reason: string }>
> = {
  account_revenue_cents: {
    state: 'seede',
    reason:
      'Treize mois facturés (`DEMO_DELIVERY_CLIENT.invoices`) portent `invoiced_at` et `invoiced_amount_cents` sur les missions du client d’exemple : le bandeau « ce client vous a rapporté X € sur N missions » s’ouvre chiffré. Les mois sans montant — le forfait, qui n’a pas de TJM — sont comptés à part et le total se dit plancher, ce qui est justement l’état qu’une démonstration doit savoir montrer.',
  },
  account_average_sold_rate: {
    state: 'seede',
    reason:
      'HUIT des neuf missions du client d’exemple portent un `daily_rate` (620, 560, 580, 640, 780, 600, 590, 610 €) ; la neuvième est un FORFAIT, qui se facture aux jalons et n’en porte aucun. La moyenne s’affiche donc AVEC son « 1 mission non chiffrée », qui est la moitié intéressante : un tarif moyen muet sur ce qu’il ignore se lirait comme une mesure complète.',
  },
  consultant_placements: {
    state: 'seede',
    reason:
      'Chaque mission du jeu crée une `mission_assignments` pour son consultant, et les NEUF ont démarré : le vivier affiche « placé N fois » sur les six talents concernés. C’est le compteur qui DIFFÈRE des positionnements affichés à côté — Yanis Berthier est placé TROIS fois pour un seul positionnement gagné, Antoine Rivière et Salomé Dufour portent chacun un positionnement REFUSÉ et un placement ailleurs. C’est cet écart que la colonne existe pour montrer, et il se voit. ⚠️ Il valait DEUX jusqu’au 28/08/2026, et deux ne suffisait pas : « placé deux fois » se lit comme un accident de comptage, « placé trois fois chez le même client » se lit comme le profil qu’un client redemande — c’est-à-dire la personne qu’un directeur d’agence ouvre le vivier pour trouver. La troisième mission (« Reprise de l’ordonnancement des flux — lot pilote ») est INTERROMPUE et dans le passé, parce que le semis pose `load_percent: 100` sur chaque affectation et qu’une troisième mission en cours afficherait quelqu’un affecté à 300 %. Recompté sur le SQL réellement émis par `demo-pipe-dates-and-placements.spec.ts`, jamais sur cette phrase.',
  },
  consultant_average_margin: {
    state: 'seede',
    reason:
      'Le coût chargé est saisi sur SIX des neuf missions (`loaded_daily_cost_cents`) et six relevés portent des jours : la marge se calcule pour quatre consultants sur six — inchangé, la neuvième mission étant la SECONDE de Hakim Barreau — autour de 30 %, et vaut `null` pour les deux autres — l’un sans coût saisi, l’autre sans relevé — avec leur mission COMPTÉE dans « non mesurées ». Elle s’affiche « non mesurable — 1 mission sur les 5 nécessaires », et c’est l’état JUSTE : un pourcentage de marge sur une seule mission n’est pas une marge moyenne. Seeder cinq missions par consultant pour franchir le seuil montrerait un chiffre auquel le produit lui-même refuse de croire.',
  },
  contact_signed_missions: {
    state: 'seede',
    reason:
      'SEMÉ le 28/08/2026, après avoir été mesuré vide le matin même. (Trois missions sur NEUF nomment un contact depuis le 29/08 ; les six autres n’en portent pas, à dessein.) Le client d’exemple porte désormais deux interlocuteurs INVENTÉS — Directeur technique — entité numérique voyageurs, directeur des systèmes d’information, et Responsable des achats de prestations informatiques, responsable des achats informatiques — écrits par `DemoSeedService` AVANT la boucle des missions, qui les lit. Trois missions nomment leur contact de facturation : deux pour la direction informatique, une pour les achats. L’agrégat rend donc DEUX lignes, à des comptes différents (2 et 1), et c’est cet écart qui fait la démonstration — un badge où tout le monde a signé une fois ne dirait pas ce que le compteur compte. ⚠️ Les autres missions restent SANS contact à dessein : `assessInvoiceReadiness` pousse `missing_billing_contact` sur elles, et remplir les huit ferait disparaître de la salle un bloqueur que le produit affiche. Recompté sur le jeu par `demo-propagation-coverage.spec.ts`, écrit en base par `demo-seed.service.spec.ts`.',
  },
}

/**
 * CE QUE LE PIPE MONTRE DE SES MONTANTS, ET CE QU'IL NE MONTRERA JAMAIS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE MAILLE DE PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * Même raison que les annonces de facturation et les agrégats de propagation
 * au-dessus : ces trois états n'ajoutent AUCUNE table. Ils se calculent par
 * `pipelineSummary` sur `opportunities`, déjà classée SEEDÉE. La garde PAR
 * TABLE ne leur pose donc aucune question — et une table remplie ne dit rien de
 * la RÉPARTITION de ce qu'elle contient. C'est exactement le silence qui a fait
 * découvrir en réunion un kanban à neuf colonnes vides.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ LE 28/08/2026, ET CE QUI ÉTAIT FAUX
 * ─────────────────────────────────────────────────────────────────────────────
 * Le relevé qui a ouvert ce lot annonçait « la salle porte 2 projets, tous deux
 * chiffrés ». Les deux moitiés étaient fausses, et c'est la mesure sur le SQL
 * réellement émis qui l'a montré : la salle portait HUIT projets au pipe, et
 * l'un d'eux — celui dérivé de la mission au FORFAIT, qui n'a pas de TJM —
 * n'avait déjà aucun montant. Le plancher et le compteur étaient donc VISIBLES
 * avant ce lot.
 *
 * Ce qui manquait vraiment était plus discret : la seule ligne non chiffrée
 * était en étape « Signé », et trois des cinq colonnes du pipe étaient VIDES. Un
 * prospect qui regarde son pipe OUVERT ne voyait donc jamais la pastille
 * « N sans montant », et ne voyait aucune affaire avancer.
 *
 * ⚠️ Aucune de ces raisons n'est crue sur parole :
 * `demo-pipe-dates-and-placements.spec.ts` rejoue `pipelineSummary` sur les
 * paramètres que le semis a réellement passés à Postgres. Une raison qui
 * cesserait d'être vraie fait rougir la CI — « un audit documentaire n'est pas
 * le code ».
 */
export const DEMO_PIPELINE_STATES: Readonly<Record<string, { state: 'seede' | 'vide_a_dessein'; reason: string }>> = {
  total_floor: {
    state: 'seede',
    reason:
      'Le libellé « Au moins {montant} sur {N} projets au pipe » s’affiche dès qu’une ligne non chiffrée coexiste avec des lignes chiffrées, et la salle porte les deux : onze projets au pipe, dont deux sans montant saisi — le projet dérivé de la mission au FORFAIT (étape « Signé ») et le « Schéma directeur data — cadrage et pilotage » (étape « Profils présentés »). Le total annoncé est donc un PLANCHER, et il le dit. C’est l’état qu’une démonstration doit savoir montrer : un pipe réel a toujours des affaires dont personne n’a encore chiffré le périmètre, et un outil qui les additionnerait à zéro afficherait un pipe plus petit que la réalité.',
  },
  column_without_amount_pill: {
    state: 'seede',
    reason:
      'La pastille « N sans montant » d’une colonne apparaît quand `column.without_amount > 0`, et devient CLIQUABLE quand la colonne n’est pas entièrement non chiffrée. Depuis le 28/08/2026 la salle en porte une sur une étape OUVERTE (« Profils présentés »), et plus seulement sur « Signé » : c’était le vrai trou, parce qu’un commercial regarde son pipe ouvert, pas sa colonne des affaires déjà gagnées. Les cinq colonnes ne sont pas toutes occupées à dessein — « Besoin exprimé » reste vide, une salle où chaque étape porterait exactement une affaire ressemblerait à un jeu de démonstration plutôt qu’à un pipe.',
  },
  total_unknown: {
    state: 'vide_a_dessein',
    reason:
      'C’est l’état « non mesuré » en TÊTE de pipe, celui où `pipelineSummary` ne trouve aucun montant du tout et où l’écran remplace le total par `UnknownValue`. Il exige que TOUT le pipe soit non chiffré, et on ne le montrera jamais : une salle de démonstration qui affiche « non mesuré » à la place de la valeur de son pipe se lit comme un produit vide, et c’est la première chose qu’un prospect regarde. Le retirer des montants existants pour rendre ce cas visible échangerait une capacité qu’on montre contre une capacité qu’on montre — un mauvais marché. Le refus est donc DÉLIBÉRÉ, et le code qui le rend n’est pas mort pour autant : il se déclenche chez un client dont le pipe vient d’être importé sans montants, ce qui est précisément le jour où il compte.',
  },
}

/**
 * CE QUE LA FICHE D'UN BESOIN MONTRE EN DÉMONSTRATION (PDF-02 §4.2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ENCORE UNE MAILLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Même raison que le kanban, les relevés et les agrégats de propagation
 * au-dessus, et c'est la troisième fois qu'elle se vérifie : la fiche d'un
 * besoin n'ajoute AUCUNE table. Elle lit `project_needs` (déjà classée SEEDÉE)
 * et l'agrégat `account_average_sold_rate` (déjà classé SEEDÉ). La garde PAR
 * TABLE ne lui pose donc aucune question — et une table remplie ne dit rien de
 * la RÉPARTITION de ce qu'elle contient.
 *
 * Or c'est exactement la répartition qui fait cet écran-là : un besoin qui
 * porte un tarif cible ET un client qui a un historique de prix, sinon le bloc
 * du §4.2 s'ouvre sur une phrase d'absence devant un prospect. Une shortlist
 * VIDE, sinon la troisième porte ne s'offre nulle part. Un motif d'état, sinon
 * le seul champ que la liste ne pouvait pas tenir reste invisible.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CHAQUE RAISON EST UNE RÈGLE, PAS UN ÉTAT DU SEMIS
 * ─────────────────────────────────────────────────────────────────────────────
 * « Le besoin “Ingénieur systèmes industriels” porte 560 € » est une phrase qui
 * meurt au premier renommage, et qui meurt en SILENCE : elle reste écrite et
 * cesse d'être vraie. Les raisons ci-dessous disent donc ce qui doit TENIR — au
 * moins un besoin chiffré et au moins un qui ne l'est pas — et jamais lequel.
 *
 * ⚠️ Et aucune n'est crue sur parole : `demo-need-sheet-coverage.spec.ts`
 * recompte chaque état sur `DEMO_DELIVERY_CLIENT`. Une raison qui cesserait
 * d'être vraie fait rougir la CI — « un audit documentaire n'est pas le code ».
 */
export const DEMO_NEED_SHEET_BLOCKS: Readonly<Record<string, { state: 'seede' | 'vide_a_dessein'; reason: string }>> = {
  target_rate: {
    state: 'seede',
    reason:
      'La règle tenue : les rôles ouverts de la salle portent LES DEUX moitiés — au moins un avec un tarif cible, au moins un SANS. Il faut les deux, et pas seulement le premier : un jeu où tous les rôles seraient chiffrés ne montrerait jamais « Personne n’a communiqué de tarif cible sur ce besoin », c’est-à-dire la phrase qui prouve que l’outil sait dire ce qu’il ignore au lieu d’écrire « 0 € ». C’est le même arbitrage que le projet sans montant au pipe, et il se recompte sur le jeu plutôt que de se relire ici.',
  },
  sold_rate_cross: {
    state: 'seede',
    reason:
      'La règle tenue : les rôles ouverts et les missions du jeu pendent du MÊME client d’exemple, et ce client porte à la fois des missions CHIFFRÉES et au moins une qui ne l’est pas. Sans le premier point, le bloc s’ouvrirait sur « ce client n’a encore aucune mission chez toi » — vrai, et sans intérêt en démonstration. Sans le second, la moyenne se présenterait comme complète alors qu’un forfait n’a pas de tarif journalier, et le « N missions non chiffrées » — la moitié honnête du bloc — resterait invisible. L’écart entre le tarif cible et le tarif vendu se voit donc pour de bon, ce qui est la seule chose que le §4.2 demande.',
  },
  status_reason: {
    state: 'seede',
    reason:
      'La règle tenue : au moins un rôle de la salle est dans un état qui EXIGE son motif (une mise en veille, une clôture) et le porte. Le motif est servi par l’API depuis le PDF 2 et n’avait aucun écran pour l’afficher en entier — la liste porte dix-huit colonnes et pas celle-là. C’est pourtant la seule chose qui permet de rouvrir un besoin en veille : sans lui, rien ne dit ce qu’on attend ni de qui, et le rôle reste là pour toujours.',
  },
  third_door: {
    state: 'seede',
    reason:
      'La règle tenue : au moins un rôle de la salle a une shortlist VIDE et au moins un en a une remplie. La troisième porte — « enregistrer un consultant depuis le besoin, sans passer par le vivier » — ne s’offre QUE sur un besoin sans profil positionné (ou sur un vivier vide, que la salle n’a pas puisqu’elle sème des consultants). Une salle où chaque rôle porterait déjà quelqu’un ne montrerait jamais cette porte ; une salle où aucun n’en porterait ne montrerait jamais qu’elle se referme, et le prospect croirait à un bouton permanent.',
  },
  requirements: {
    state: 'seede',
    reason:
      'La règle tenue : la salle porte LES DEUX moitiés des exigences d’un poste. Au moins un rôle exige une habilitation — sans lui, l’axe 12 du rapprochement (« une habilitation manquante ÉCARTE ») ne se montre nulle part, et un prospect verrait treize axes annoncés sans en voir un seul écarter quelqu’un. Au moins un rôle n’exige RIEN — sans lui, les phrases d’absence disparaissent (« l’axe langues sort du calcul au lieu de valoir zéro », « tant qu’il n’y a pas d’habilitation, rien n’écarte un profil qui n’en aurait pas »), c’est-à-dire la partie du produit qui dit ce qu’il ignore. Et les deux exigences sont INDÉPENDANTES dans le jeu : un rôle porte une langue sans habilitation, parce qu’un jeu où elles iraient toujours ensemble ferait croire qu’elles sont liées.',
  },
  summary_fields: {
    state: 'seede',
    reason:
      'La règle tenue : les six champs de résumé — contexte, expertise, environnement technique, contraintes, plancher accepté, budget de l’affaire — sont RENSEIGNÉS sur au moins un rôle et ABSENTS sur au moins un autre. Ils étaient en base et dans le contrat depuis le chantier CRM et n’entraient pas dans la ligne servie à l’écran : le « Résumé : contexte et objectifs » avait son champ et aucun chemin vers la fiche. Les deux moitiés comptent autant : renseignés, ils montrent un brief qu’on peut raconter au téléphone plutôt qu’une liste de mots-clés ; absents, ils montrent que l’outil écrit « le client n’a pas communiqué de budget » au lieu de « 0 € ». Aucun n’est DÉRIVÉ d’un autre — le budget ne se calcule pas depuis le tarif cible, c’est le même refus que pour le « CA potentiel ».',
  },
  staffable_verdict: {
    state: 'seede',
    reason:
      'RETOURNÉ le 01/09/2026, et la raison d’avant reste juste sur les rôles OUVERTS : la porte G3 est un geste que la démonstration fait faire, et aucun des cinq rôles ouverts ne porte de verdict — le contrôle lui-même reste donc à l’écran, entier. Ce qui a changé, c’est le détecteur d’expertise manquante (PDF 4 §8.4) : « trois besoins refusés sur la même compétence en un trimestre » ne peut se montrer que sur des besoins DÉJÀ refusés, et un refus est irréversiblement passé. Trois rôles CLOS portent donc `staffable = no` avec leur motif et leur date — dans une liste séparée (`refusedNeeds`), parce qu’un besoin en `lost` n’a pas de colonne sur le kanban. Ils écrivent la même compétence de trois façons (« Kubernetes », « K8s », « kube ») pour que la salle montre la canonicalisation, et le troisième n’a PAS de TJM cible pour que le montant affiche « 1 sans TJM cible » plutôt que de se lire comme un total.',
  },
  go_no_go_verdict: {
    state: 'seede',
    reason:
      'Le verdict « go / no-go » à six axes est SUGGÉRÉ — il ne franchit pas la porte G3 juste au-dessus, qui reste le geste du visiteur. Il se seede donc sans retirer aucun geste, et il DOIT l’être : il lit le dernier rapprochement déjà exécuté, et sans aucun il s’ouvrirait sur « JE MANQUE DE DONNÉES » avec quatre absences — honnête, et invendable. La règle tenue par la salle est qu’un SEUL des cinq rôles porte un rapprochement : celui-là montre le verdict complet (six axes renseignés, ses profils, leur lecture d’acceptation, dont un profil libre APRÈS le démarrage et un consentement qui n’est pas « à jour »), et les quatre autres montrent l’état inverse, absences NOMMÉES — « personne n’a regardé le vivier » n’est pas « personne ne convient ». Les deux axes qui ne dépendent pas du rapprochement portent eux aussi leurs deux moitiés : des concurrents NOMMÉMENT en face sur le panel (sans quoi l’axe sortirait toujours au vert), et des contacts d’affaire dont AUCUN n’est décideur — l’attention MESURÉE « rang connu · décideur manquant », qui n’est ni un axe vide ni un refus.',
  },
}

/**
 * LES CINQ ÉTAPES DE LA CHAÎNE D'UNE MISSION (#2199, 16/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE MAILLE DE PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * Même raison que la fiche d'un besoin juste au-dessus : la bande « de la
 * signature au cash » n'ajoute AUCUNE table. Elle compose `missions`,
 * `mission_timesheets`, `mission_commercial_terms` et `invoice_readiness` —
 * toutes déjà classées. La garde PAR TABLE ne lui pose donc aucune question,
 * et c'est exactement ce silence qui laisse partir en démonstration un écran
 * dont chaque cellule dit « non mesuré ».
 *
 * ⚠️ Une garde AVEUGLE n'est pas une exemption : la chaîne se recompte donc sur
 * `DEMO_DELIVERY_CLIENT` dans `demo-mission-chain-coverage.spec.ts`, jamais sur
 * la prose ci-dessous.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ LA BANDE LIT LE MOIS PAR DÉFAUT DU SERVEUR — LE MOIS PRÉCÉDENT
 * ─────────────────────────────────────────────────────────────────────────────
 * C'est le même mois que `/missions/facturation`, et c'est délibéré : deux mois
 * différents feraient cliquer sur « relevé non validé » pour atterrir sur un
 * mois où il l'est. Conséquence directe en démonstration, et elle est ASSUMÉE :
 * le jeu ne pose AUCUNE facture sur le mois précédent ni sur le mois courant
 * (décision écrite au-dessus du tableau `invoices` de `demo-dataset.ts` — y
 * poser une facture rendrait « facturé » les trois états que les missions de la
 * salle existent pour montrer). Les étapes « facture préparée » et
 * « encaissement » montrent donc leur état d'ATTENTE, avec sa raison nommée,
 * et jamais « fait ». Semer une facture pour verdir ces deux cellules
 * contredirait la décision d'à côté — c'est le défaut constaté le 28/08 sur
 * `renewal_at_risk`, et on ne le refait pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CHAQUE RAISON EST UNE RÈGLE, PAS UN ÉTAT DU SEMIS
 * ─────────────────────────────────────────────────────────────────────────────
 * « La mission X porte un relevé rejeté » meurt au premier renommage, et meurt
 * en SILENCE. Les raisons ci-dessous disent ce qui doit TENIR — au moins un
 * relevé validé ET au moins un qui bloque — jamais lequel.
 */
export const DEMO_MISSION_CHAIN_STEPS: Readonly<Record<string, { state: 'seede' | 'vide_a_dessein'; reason: string }>> =
  {
    timesheet: {
      state: 'seede',
      reason:
        'La règle tenue : la salle porte LES DEUX moitiés du relevé — au moins une mission dont le relevé est VALIDÉ, au moins une dont le relevé bloque (déposé et non validé, ou rejeté avec son motif), et au moins une mission qui ne produit PAS de relevé mensuel. Les trois comptent autant : sans la première, la chaîne n’aurait aucune étape franchie et se lirait comme une panne ; sans la seconde, le motif NOMMÉ — la seule chose qui distingue cette bande d’un compteur — ne se montrerait nulle part ; sans la troisième, « sans objet » ne se distinguerait jamais de « non mesuré », alors que la première ne se répare pas et que la seconde se répare en allant regarder.',
    },
    billable: {
      state: 'seede',
      reason:
        'La règle tenue : au moins une mission de la salle exige un bon de commande et au moins une n’en exige pas, et au moins une mission se facture AUTREMENT qu’au mois. Le premier point fait exister un motif qui appartient en propre à cette étape — la bande refuse par construction de redire le motif de l’étape précédente, donc sans un bloqueur non lié au relevé cette cellule ne montrerait jamais de motif à elle. Le second évite qu’un prospect conclue que Bellum réclame un bon de commande à tout le monde. Le troisième fait exister « sans objet » : un forfait ou un jalon ne produit pas de mois facturable, et lui prêter un état — même vert — répondrait à une question qui ne se pose pas. #2566.4 (18/09/2026) ajoute une QUATRIÈME nuance au même motif : un bon de commande exigé, PRÉSENT, mais dont la validité s’arrête avant la fin du mois facturé (`po_period_mismatch`) — distinct de « absent » (`missing_po`). La mission longue de la salle porte ce cas précis, avec en plus deux mois déjà facturés et réglés qui en font une reconduction, pas un premier mois bloqué.',
    },
    invoice: {
      state: 'seede',
      reason:
        'La règle tenue : la salle porte un HISTORIQUE de mois facturés et réglés, et aucune facture sur le mois que la bande lit. Les deux sont voulus. L’historique est ce qui rend mesurable le délai de paiement et prouve que le produit consigne une facture partie ailleurs — Bellum n’en émet aucune. L’absence sur le mois lu est la décision écrite au-dessus du tableau `invoices` : y poser une facture rendrait « facturé » les trois états que les missions de la salle existent pour montrer, et viderait l’écran « Prêt à facturer ». Cette étape montre donc, en démonstration, son état d’ATTENTE avec sa raison nommée — « prêt à facturer, aucune facture consignée » — qui est une phrase vraie et utile, jamais un vide muet.',
    },
    collection: {
      state: 'seede',
      reason:
        'La règle tenue : la salle porte des mois RÉGLÉS, au moins un mois CONTESTÉ qui court encore avec son motif, et un mois mal daté. Ils ne se voient pas dans la bande d’une mission — elle lit le mois précédent, où le jeu ne pose aucune facture (voir l’étape ci-dessus) — mais ils sont ce qui rend le reste du produit vrai autour d’elle, et la bande de la salle affiche l’état qui en découle honnêtement : « rien à encaisser, la facture n’est pas partie ». C’est la distinction que ce dépôt a déjà payée une fois : « pas encore facturé » est un FAIT dont on connaît la cause, jamais un « non mesuré ». Semer un encaissement sur le mois lu pour verdir cette cellule contredirait la décision qui protège l’écran de facturation.',
    },
    reposition: {
      state: 'seede',
      reason:
        'La règle tenue : la salle porte des missions dont la fin est DANS la fenêtre de renouvellement, des missions dont l’échéance est DÉPASSÉE, des missions SANS date de fin, et — depuis #2195.50 (Louis, 20/09/2026) — une mission dont la fin est AU-DELÀ de la fenêtre. Les quatre montrent quatre choses différentes : la première ouvre la porte vers le Reverse Market du consultant, la deuxième montre qu’une échéance passée ne disparaît pas, la troisième montre « non mesuré » avec sa raison — « cette mission n’a pas de date de fin, impossible de dire quand repositionner » — c’est-à-dire la partie du produit qui dit ce qu’il ignore au lieu d’écrire « trop tôt », et la quatrième montre « sans objet » (`not_applicable`, motif `tooEarly` — `missionChain.ts`) : une fin encore lointaine n’appelle aucun repositionnement MAINTENANT. ⚠️ Jusqu’à ce lot, cette quatrième position était ABSENTE PAR CHOIX (#2195.2) : `GET /delivery/renewals` excluait toute mission `far`, et une fin lointaine n’aurait alors RIEN montré nulle part — semer une mission qui y tombe l’aurait rendue invisible sans le prouver. #2195.50 ouvre cette fenêtre côté serveur (`includeFar: true`) ET côté salle (une seconde mission de Marc Ouedraogo, soixante et onze jours, `demo-dataset.ts`) : les quatre positions se voient désormais ENSEMBLE, dans la même salle.',
    },
  }

/**
 * #2421 — LA TIMELINE MISSION-TO-CASH (14 étapes), repliée sous la bande.
 *
 * Même raison que les cinq maillons : AUCUNE table neuve — elle se dérive de
 * `missions` (statut, création, démarrage, porteur) et de `invoice_readiness`,
 * déjà classées. La garde qui la recompte vit dans
 * `demo-mission-chain-coverage.spec.ts` et lit `DEMO_DELIVERY_CLIENT`.
 */
export const DEMO_MISSION_TO_CASH_TIMELINE: { state: 'seede' | 'vide_a_dessein'; reason: string } = {
  state: 'seede',
  reason:
    'La règle tenue : chaque mission de la salle porte un statut et une date de démarrage, et le semis pose `owner_id` sur TOUTES les missions (l’utilisateur de la salle) — les trois étapes de la mission montrent donc leur PREUVE datée, et chaque étape ouverte nomme son RESPONSABLE au lieu de tomber en exception « sans responsable ». Les onze étapes du mois découlent du mois lu par la bande : relevé validé ou bloquant, CA facturable bloqué par le bon de commande, préparation, et — par la décision écrite au-dessus du tableau `invoices` — aucune facture sur le mois lu, donc « Facture créée » en attente et l’envoi, l’échéance, le paiement et la clôture « pas encore dus ». « Facture envoyée » et « Paiement rapproché » ne sont JAMAIS « faits » ici, ni en démo ni ailleurs : Bellum n’envoie pas la facture et ne rapproche aucun compte bancaire, et la timeline le dit avec sa raison. Le cas « porteur absent » n’est pas semé : la salle n’a qu’un utilisateur, et retirer le porteur d’une mission pour montrer l’exception mentirait sur la fiche.',
}

/**
 * LES QUATRE LIGNES DE « CE QUI A BOUGÉ DEPUIS TA DERNIÈRE VISITE » (PDF 2 §2.5).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE MAILLE DE PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * Même raison que les annonces de facturation et les agrégats de propagation
 * plus haut : ces quatre lignes n'ajoutent AUCUNE table. Elles se calculent sur
 * `signal_history`, `activities` et `interventions` — trois tables DÉJÀ classées
 * « vide à dessein » — plus le statut de la messagerie. La garde PAR TABLE ne
 * leur pose donc aucune question, et c'est précisément le silence qui a fait
 * marquer ce bloc « branché et vu à l'écran » le 27/08/2026 alors que son
 * contenu n'existait pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET NON L'ÉTAT DU SEMIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Une justification qui décrirait le semis d'aujourd'hui (« la table est vide »)
 * meurt au premier changement de semis. Celle qui vaut ici est une RÈGLE de
 * cohérence : **chacune de ces lignes lit une table dont l'absence est déjà une
 * décision écrite ailleurs dans ce fichier.** Y semer une valeur pour remplir la
 * ligne contredirait la décision d'à côté — et deux entrées du même fichier qui
 * se contredisent, c'est le défaut constaté le 28/08 sur `renewal_at_risk`.
 *
 * Conséquence voulue : le jour où l'une de ces trois tables sera semée (par
 * exemple `interventions`, ouvert par BEL-BO-002), la ligne s'allumera TOUTE
 * SEULE, sans que personne ait à toucher ici — elle n'a pas de semis à elle.
 *
 * ⚠️ Et ce n'est pas ce qu'un visiteur voit en pratique : le repère de fenêtre
 * (`user_last_seen.previous_seen_at`) n'avance qu'au-delà de 30 minutes de
 * séparation (`SESSION_GAP_MS`), alors qu'une salle est prêtée 30 minutes
 * (`DEMO_LEASE_TTL_MINUTES`). Un visiteur n'a donc quasiment jamais de « visite
 * précédente », et le bloc lui montre son état d'ACCUEIL — « je pose le repère
 * maintenant » — qui est le bon message et n'écrit aucun zéro.
 */
export const DEMO_SINCE_LAST_VISIT_LINES: Readonly<
  Record<string, { state: 'seede' | 'vide_a_dessein'; reason: string }>
> = {
  account_signals: {
    state: 'vide_a_dessein',
    reason:
      'Elle compte les lignes ACTIVES de `signal_history` détectées dans la fenêtre, et cette table est classée vide à dessein juste au-dessus : « l’historique des signaux se construit par la veille quotidienne ; les signaux du dossier sont dans `raw_analysis` ». Y semer des détections fabriquerait des dates de découverte que personne n’a observées, et ferait dire à la salle « 3 nouveaux signaux cette nuit » sur des dossiers dont les signaux sont, eux, datés dans `raw_analysis` et visibles à l’écran d’à côté. Les deux chiffres se contrediraient devant un prospect.',
  },
  replies_received: {
    state: 'vide_a_dessein',
    reason:
      'Elle compte les `activities` de direction `inbound` de la fenêtre. La salle annonce une messagerie CONNECTÉE (`demoMailboxStatus`), donc la ligne est bien MESURÉE et non « non connectée » — elle rend un zéro VRAI, et un zéro vrai ne s’affiche pas. C’est l’état juste : les fils de démonstration sont fabriqués à la lecture par `demoMailSearch` et ne sont jamais ingérés dans le journal d’activité. Les ingérer y écrirait des messages reçus que personne n’a reçus, sur une salle publique — et le corps d’un message ne se fabrique pas plus qu’il ne s’expose.',
  },
  job_changes: {
    state: 'vide_a_dessein',
    reason:
      'Elle compte les contacts dont `contactSourceTag(...)` vaut `RISQUE` — l’employeur courant du dernier enrichissement ne correspond plus au compte — parmi ceux réenrichis pendant la fenêtre. Les contacts de la salle portent l’employeur de LEUR compte : aucun n’est en écart, et c’est la seule forme cohérente. Poser un employeur divergent sur un contact d’un dossier RÉEL affirmerait qu’une personne nommée a quitté une entreprise nommée — une affirmation vérifiable, invérifiée, sur un lien public. C’est exactement ce que la note des correspondants de `demo-briefing.ts` refuse déjà pour les fils de messagerie.',
  },
  missions_moving: {
    state: 'vide_a_dessein',
    reason:
      'Elle compte les interventions `renewal_at_risk` OUVERTES pendant la fenêtre, et `interventions` est classée vide à dessein plus haut : le balayeur exclut explicitement les espaces de démonstration. La ligne n’a donc rien à semer pour elle-même — elle lit ce que le balayeur pose. Si l’entrée `interventions` évolue (BEL-BO-002 propose d’y semer la mission qui finit dans 28 jours, sous les 30 de `INTERVENTION_THRESHOLDS.renewalHorizonDays`), cette ligne s’allumera sans qu’on touche ici : c’est la propriété qu’on veut d’une ligne dérivée.',
  },
  // #2803 (#2389.4) — Opportunités : `attackAnglesLine` compte les lignes
  // `attack_angles` créées pendant la fenêtre (`created_at`), une table SEMÉE
  // (`DemoSeedService.seed`, `demo-seed.service.ts:769-784` — un ou plusieurs
  // angles par dossier de démonstration). `created_at` n'est jamais forcé à la
  // création : la colonne retombe sur `@CreateDateColumn`, donc l'INSTANT DU
  // SEMIS, comme toute autre ligne de la salle. Un visiteur dont le repère de
  // dernière visite précède ce semis (le cas normal : la salle est peuplée AU
  // PRÊT, avant sa première visite) voit donc un compte RÉEL et positif, pas un
  // zéro décoratif ni une valeur fabriquée pour l'occasion.
  attack_angles_added: {
    state: 'seede',
    reason:
      'Chaque dossier de démonstration porte au moins un angle d’attaque (`dossier.attackAngles`, `demo-seed.service.ts:769-784`), inséré SANS `created_at` forcé — la colonne prend donc l’instant du semis, exactement comme les autres lignes de la salle. La fenêtre « depuis ta dernière visite » compare ce même instant au repère `previous_seen_at` : pour un visiteur dont le repère précède le semis (le cas normal, la salle étant peuplée au prêt), la ligne rend un compte RÉEL et positif — ce n’est donc pas un vrai zéro à masquer ni une valeur à fabriquer, c’est la même donnée qui alimente déjà le dossier de conquête affiché à l’écran voisin.',
  },
  // #2803 (#2389.4) — Travaux nocturnes : cette ligne compte les
  // `RoutineRunEntity.notified = true` de la fenêtre. #2873 (28/09/2026) a
  // depuis posé UNE ligne dans `routine_runs` (voir `DEMO_SEEDED_TABLES`),
  // mais `notified: false` — mot pour mot ce que `sequenceCompletedCrmUpdate`
  // rend au niveau global, la doctrine « signale, n'écrit rien » se tenant
  // via `items`, jamais une notification globale. Le compte reste donc un
  // VRAI zéro : `RoutinesService.runDueFor` rend toujours `0` AVANT toute
  // lecture ou écriture dès qu'`isDemoWorkspace` répond vrai, et aucune
  // routine ne notifie JAMAIS depuis une salle de démonstration.
  night_routines_run: {
    state: 'vide_a_dessein',
    reason:
      'Elle compte les `RoutineRunEntity` `notified: true` de la fenêtre. `routine_runs` porte désormais une ligne (#2873, `DEMO_SEEDED_TABLES`), mais `notified: false` — mot pour mot ce que `sequenceCompletedCrmUpdate` rend au niveau global — donc elle n’entre dans AUCUN compte `notified: true` : `RoutinesService.runDueFor` rend toujours `0` avant toute lecture ou écriture dès qu’`isDemoWorkspace` répond vrai, aucune routine ne notifie jamais depuis une salle de démonstration. La ligne rend donc encore un VRAI zéro en démo — ce n’est pas une donnée à fabriquer.',
  },
}

/**
 * #2556 — « ET EN DÉMONSTRATION, UN COMPTE DÉJÀ CONNU MONTRE QUOI ? »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE ENTRÉE EXISTE, ET POURQUOI ELLE EST COURTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `AccountKnownService` n'ajoute AUCUNE table : `known` se lit sur `missions` et
 * `activities` (déjà seedées), `job_changes`/`missions_moving` sur les MÊMES
 * `contacts`/`interventions` que les deux lignes homonymes de
 * {@link DEMO_SINCE_LAST_VISIT_LINES} — dont le raisonnement s'applique ICI À
 * L'IDENTIQUE, scopé à un compte plutôt qu'à l'espace (GA-26 : la raison ne se
 * recopie pas, elle se pointe).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST SEEDÉ, ET CE QUI RESTE UN VRAI ZÉRO
 * ─────────────────────────────────────────────────────────────────────────────
 * `known` : SEEDÉ. `SNCF` et `Société Générale`
 * portent chacun ≥1 `activities` de kind `meeting`/`email`/`call` (le fil que le
 * BRIEF D'AVANT relit, `demo-dataset.ts`) — ce sont deux
 * `KNOWN_ACCOUNT_ACTIVITY_KINDS`, donc `isAccountKnownFromTraces` répond `true`
 * pour ces deux comptes SANS semis supplémentaire. La recette du lot (« la page
 * propose ≥1 élément neuf, OU dit clairement qu'elle n'a rien de neuf ») est
 * donc atteignable dès l'ouverture de la salle — preuve dans
 * `demo-account-known-coverage.spec.ts`.
 *
 * `job_changes`/`missions_moving` : un VRAI zéro sur ces deux comptes, pour la
 * MÊME raison que `DEMO_SINCE_LAST_VISIT_LINES.job_changes`/`.missions_moving`
 * ci-dessus — aucun contact de la salle n'est en écart d'employeur,
 * `interventions` reste vide pour tout espace de démonstration. La carte
 * `AccountKnownMovementsCard` y affiche donc l'aveu honnête (« Tu es à jour »),
 * jamais un panneau vide muet — c'est la seconde issue que la recette autorise
 * explicitement, pas un défaut de semis.
 */

/**
 * « ET EN DÉMONSTRATION, LES COMPTEURS DE TÊTE DU PORTEFEUILLE MONTRENT QUOI ? »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE ENTRÉE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La garde PAR TABLE ne pose pas la question : les compteurs de `/accounts`
 * n'ajoutent AUCUNE table. Ils lisent `accounts`, `tasks`, `signal_history` et
 * la barrière d'accès de `raw_analysis`. C'est exactement le silence qui fait
 * découvrir un bandeau vide en réunion plutôt qu'en CI.
 *
 * ⚠️ La distinction qui compte ici : un compteur SEEDÉ rend un nombre > 0 en
 * démonstration ; un compteur « vide à dessein » rend un zéro VRAI — mesuré, et
 * non « non mesuré ». Aucun ne rend `undefined` en salle : la base répond.
 *
 * ⚠️ Ne JAMAIS déplacer une entrée vers « vide à dessein » pour faire passer le
 * test.
 */
/**
 * « ET EN DÉMONSTRATION, LE BRIEF D'AVANT RENDEZ-VOUS MONTRE QUOI ? »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE ENTRÉE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La garde PAR TABLE ne pose pas la question : le brief n'ajoute AUCUNE table.
 * Il lit `accounts` (site, signaux, enjeux, `raw_analysis.salesContext`),
 * `contacts` (poste, entité, rôle de décision, entourage), `activities` et
 * `consultants`, et il les recompose à l'affichage. C'est exactement le silence
 * qui fait découvrir un panneau vide en réunion plutôt qu'en CI.
 *
 * ⚠️ La distinction qui compte ici : un bloc SEEDÉ s'affiche dans la salle, avec
 * sa ligne d'origine ; un bloc « vide à dessein » ne s'affiche PAS, et c'est le
 * comportement voulu — `buildMeetingBrief` retire tout bloc incapable de dire
 * d'où il vient, et cette disparition est la fonctionnalité, pas un trou.
 *
 * ⚠️ Le brief ne s'ouvre en salle que sur le rendez-vous branché au client
 * d'exemple (`demo-event-nova`) : c'est le seul dont le domaine de l'invité est
 * le site d'un compte du portefeuille. Les autres évènements de la semaine
 * fictive montrent, eux, ce que fait le produit quand il ne sait PAS rattacher —
 * les deux cas sont vrais et les deux se voient.
 *
 * ⚠️ Ne JAMAIS déplacer une entrée vers « vide à dessein » pour faire passer le
 * test.
 */
export const DEMO_MEETING_BRIEF_BLOCKS: Readonly<
  Record<string, { state: 'seede' | 'vide_a_dessein'; reason: string }>
> = {
  who: {
    state: 'vide_a_dessein',
    reason:
      'décision Louis 04/10 : aucune déclaration inventée sur une personne réelle. Le bloc lit la PERSONNE invitée (rattachée par son adresse exacte) ; le rendez-vous de livraison (SNCF) ne pose aucun invité — la présence « acceptée » d’une personne réelle serait une déclaration inventée — et se rattache au compte par son titre. Le bloc se retire, ce qui est le comportement juste quand aucun invité n’est connu.',
  },
  history: {
    state: 'seede',
    reason:
      'Le journal d’activité de la salle porte des échanges rattachés au client de livraison (SNCF), avec leur `occurred_at` (quand ils ont eu lieu) et leur `created_at` (quand ils ont été enregistrés) — c’est le second qui date la source. Le bloc nomme les CAPACITÉS traversées, jamais un éditeur, et n’expose que le SUJET : le corps d’un message ne sort pas vers un tiers.',
  },
  moving: {
    state: 'seede',
    reason:
      'Les `recent_signals` du client de livraison (SNCF) sont ceux de son dossier, chacun avec sa date. Le bloc n’affiche que les signaux DATÉS : sans date il se retirerait, et c’est précisément l’invariant que la salle doit montrer.',
  },
  stakes: {
    state: 'seede',
    reason:
      'Les `it_challenges` du client de livraison (SNCF) viennent de son dossier et remplissent le seul bloc TOUJOURS étiqueté déduit : la salle montre la ligne « Déduit — à confirmer pendant le rendez-vous », qui est ce que ce chantier a livré. Décision Louis 04/10/2026 : les enjeux inventés du client fictif ont disparu avec lui.',
  },
  around: {
    state: 'vide_a_dessein',
    reason:
      'Le bloc lit `contacts.relations` — l’entourage tel que la phase 3 le résout —, et le semis ne pose cette colonne sur AUCUN contact, réel ou fictif. Y écrire un entourage à la main sur le client d’exemple ferait passer une saisie pour une résolution, sur le seul écran dont toute la valeur est de dire d’où vient ce qu’il affiche. Le bloc se retire alors, ce qui est le comportement juste. Il s’allumera sans qu’on touche ici le jour où le semis pose des relations : c’est la propriété qu’on veut d’un bloc dérivé.',
  },
  positionable: {
    state: 'seede',
    reason:
      'Le vivier de la salle porte des consultants disponibles avec leur date de disponibilité. La date de la SOURCE est celle de la dernière écriture de la fiche, posée par le semis au jour de la visite — `availability_checked_at` existe en base mais n’est pas exposé par l’API. Les profils `indisponible` et `inconnu` sont exclus : une disponibilité inconnue n’est jamais présentée comme une disponibilité.',
  },
  outcome: {
    state: 'seede',
    reason:
      '`raw_analysis.salesContext.relationship.state` vaut `besoin_ouvert` sur le client de livraison (SNCF, clé fusionnée par le semis), donc le type de rendez-vous se dérive en « opportunité ouverte » et l’objectif s’affiche : la posture, les deux résultats à obtenir et les trois questions de la banque. Sur les autres évènements de la semaine, l’objectif est ABSENT et l’écran dit laquelle des trois raisons s’applique — c’est le refus que la salle doit aussi montrer.',
  },
  objections: {
    state: 'vide_a_dessein',
    reason:
      '#1934.10 — le bloc lit `raw_analysis.objections` (écrit par la phase 1 d’une vraie analyse). VIDE À DESSEIN — décision Louis 04/10 : plus aucun compte fictif dans la salle ; les deux objections vivaient sur le client fictif, et deviner celles qu’une entreprise réelle opposerait serait une déclaration invérifiable sur un tiers. Aucun dossier à brief ne porte d’objections : le bloc se tait, comme il le fait en production tant que la phase 1 n’a rien écrit.',
  },
  // #2319 — les cinq rubriques ajoutées. Le mode « en rendez-vous » n'ajoute AUCUNE
  // donnée : il remet en page ce même brief à côté de la carte de compte rendu,
  // dont la démonstration est déjà scriptée (`demoRecap`, aucun modèle appelé).
  facts: {
    state: 'seede',
    reason:
      '#2319.30 — les trois faits (secteur, effectif, chiffre d’affaires) sont datés par la DERNIÈRE ANALYSE TERMINÉE (`last_analyzed_at`, soit le plus récent `analysis_runs.completed_at`), jamais par `updated_at` qu’une simple édition rafraîchit. `analysis_runs` est SEEDÉE (#3235 : deux runs de Société Générale, `DEMO_ANALYSIS_RUNS` ; #3682 : un run terminé récent par compte des briefs démo, `DEMO_VERIFICATION_RUNS`, `verdict_snapshot` NULL — aucun verdict deviné) : les faits des comptes de démonstration portent donc une date réelle, relative à l’ouverture de la salle. Aucun run n’est lancé, aucun crédit débité.',
  },
  limits: {
    state: 'seede',
    reason:
      '#2319.31 — les limites se CALCULENT sur ce que le brief n’a pas pu lire. Sur le client de livraison, l’entourage n’est pas résolu (`contacts.relations` n’est posé sur aucun contact, voir `around` ci-dessus) : la limite « l’entourage de la personne n’est pas résolu » s’affiche, avec la ligne « Calculé à partir de ce que le dossier a pu lire ». C’est la démonstration même du bloc : un trou nommé plutôt que tu.',
  },
  linked: {
    state: 'seede',
    reason:
      '#2319.33 — le client de livraison (SNCF) porte les missions de l’ESN de démonstration dans le jeu de données (`DEMO_DELIVERY_CLIENT.missions`, dont celle qui finit dans 28 jours), rattachées à son compte et datées par leur dernière écriture, posée par le semis au jour de la visite. Le bloc les liste sous « Mission · … », avec la source « saisi dans l’espace » et sa date.',
  },
  risks: {
    state: 'vide_a_dessein',
    reason:
      '#2319.34 — le bloc lit deux faits de fiche : un employeur relevé qui ne correspond plus au compte (`source_tag` RISQUE) et un bloqueur nommé (`decision_role` blocker). Aucun contact du client d’exemple ne porte l’un ou l’autre, et en poser un ferait contredire la salle par elle-même : son chemin d’accès et son organigramme ne montrent aucun bloqueur. Le bloc se retire, ce qui est juste — une absence de risque LU n’est pas un risque inventé.',
  },
  to_verify: {
    state: 'seede',
    reason:
      '#2319.38 — la liste se calcule sur le brief déjà assemblé : le client de livraison (SNCF) porte des enjeux (`it_challenges`, tirés de son dossier), un bloc TOUJOURS déduit, donc « À confirmer : ses enjeux probables » s’affiche, avec la ligne « Déduit — à confirmer pendant le rendez-vous ». Les objections, vides à dessein depuis le 04/10, n’y ajoutent rien.',
  },
  // #4424 — R1, R2 et pitch. Les quatre blocs suivent la règle commune du brief :
  // sans PERSONNE invitée rattachée, aucun bloc ne s'affiche (`buildMeetingBriefInputs`
  // et `buildR1R2BriefBlocks` partagent cette garde). La salle n'en pose aucune sur un
  // compte réel (décision Louis 04/10, voir `who`). Le pitch EST montré en démo, dans
  // la carte `meeting_brief` scriptée de Laura (`demo-chat-script.ts`, `p-meeting-brief`).
  pitch: {
    state: 'vide_a_dessein',
    reason:
      '#4424.4 — dans le brief d’avant rendez-vous, le pitch se compose du profil de l’ESN de démonstration (Bellum Conseil, ses offres) et des enjeux du dossier ; mais le brief ne s’ouvre que sur une PERSONNE invitée rattachée, et la salle n’en pose aucune sur un compte réel (décision Louis 04/10, entrée `who`). Le pitch se voit en démonstration dans la carte « Prépare mon rendez-vous avec SNCF » de Laura (`p-meeting-brief`), bâtie sur le même profil et la référence déjà semée « Audit cybersécurité pour SNCF ». #4424.4/.7 — Depuis la fiche compte (onglet Plan, « Préparer le rendez-vous »), le panneau R1/R2 compose ce même pitch sur n’importe quel compte de la salle, sans invité : profil de l’ESN et enjeux du dossier sont déjà semés.',
  },
  rex: {
    state: 'vide_a_dessein',
    reason:
      '#4424.2 — les REX d’un R1 viennent des missions de l’espace, des preuves client de Connaissances et des références du profil, toutes semées (missions SNCF, `client_references` de Bellum Conseil). Le bloc ne s’affiche toutefois que sur un R1 CHOISI dans un brief ouvert sur une personne invitée rattachée, que la salle ne pose sur aucun compte réel (décision Louis 04/10, entrée `who`). Rien n’est retiré : le bloc s’allume dès qu’un tel rendez-vous existe. #4424.2/.7 — Depuis la fiche compte (onglet Plan, « Préparer le rendez-vous »), le panneau R1 cite ces REX sur n’importe quel compte de la salle, sans invité : missions et références du profil sont déjà semées.',
  },
  workshop_proposal: {
    state: 'vide_a_dessein',
    reason:
      '#4424.2 — la proposition d’atelier est faite de clés traduites, sans donnée : elle ne s’affiche que sur un R1 CHOISI dans un brief ouvert sur une personne invitée rattachée, et la salle n’en pose aucune sur un compte réel (décision Louis 04/10, entrée `who`). Inventer un invité réel pour l’allumer serait la déclaration inventée que cette décision interdit. #4424.2/.7 — Depuis la fiche compte (onglet Plan, « Préparer le rendez-vous »), le panneau R1 affiche cette proposition sur n’importe quel compte de la salle, sans invité.',
  },
  r1_recap: {
    state: 'vide_a_dessein',
    reason:
      '#4424.3 — la reprise du R1 lit les comptes rendus de rendez-vous du compte (`notes.meeting_recap_snapshot`) ; aucune note de démonstration n’en porte (voir `DEMO_POST_MEETING_SUMMARY_COVERAGE`), et le brief ne s’ouvre que sur une personne invitée rattachée, absente des comptes réels de la salle (décision Louis 04/10). Sur un R2 choisi, le bloc dirait « Aucun R1 connu sur ce compte » — l’absence nommée, jamais un compte rendu inventé. #4424.3/.7 — Depuis la fiche compte, un R2 choisi dit « Aucun R1 connu sur ce compte » tant qu’aucun compte rendu n’est semé : l’absence nommée, et le panneau propose R1 par défaut.',
  },
}

export const DEMO_PORTFOLIO_COUNTERS: Readonly<Record<string, { state: 'seede' | 'vide_a_dessein'; reason: string }>> =
  {
    followed: {
      state: 'seede',
      reason:
        'La salle porte six comptes dont `commercial_status` vaut `watching` ou `customer`, soit exactement la population de `ACCOUNT_HYGIENE_PREDICATES.followedAccounts`. Le compteur annonce donc un nombre non nul dès l’arrivée, et c’est le même que celui du contrôle d’hygiène du cockpit — deux écrans, un seul prédicat.',
    },
    withoutNextAction: {
      state: 'seede',
      reason:
        'Il compte les comptes suivis sur lesquels aucune tâche OUVERTE n’a d’échéance à venir (`ACCOUNT_HYGIENE_PREDICATES.noUpcomingTask`). Le semis ne pose aucune tâche datée sur les comptes de la salle : le chiffre est donc non nul, et il est VRAI — c’est précisément le geste que la démonstration doit donner envie de faire. Le jour où le semis programme une action sur un compte suivi, le compteur baissera tout seul : c’est la propriété qu’on veut d’un chiffre dérivé.',
    },
    newSignals7d: {
      state: 'vide_a_dessein',
      reason:
        'Il compte les comptes dont un signal a été DÉTECTÉ dans `signal_history` depuis sept jours, et cette table est classée vide à dessein plus haut : « l’historique des signaux se construit par la veille quotidienne ; les signaux du dossier sont dans `raw_analysis` ». Le compteur rend donc un zéro VRAI, et non un « non mesuré » — la salle n’a effectivement rien découvert cette semaine, ses signaux sont ceux, datés, du dossier. Y semer des détections fabriquerait des dates de découverte que personne n’a observées et ferait dire « 3 nouveaux signaux cette nuit » à côté de dossiers dont les signaux portent d’autres dates : les deux chiffres se contrediraient devant un prospect. C’est le même refus, mot pour mot, que la ligne `account_signals` de « depuis ta dernière visite ».',
    },
    accessClassAB: {
      state: 'seede',
      reason:
        'Il lit `raw_analysis -> access_barrier -> access_class`, et le semis pose une classe `B` sur deux vrais dossiers (Société Générale et SNCF, barrière calculée par le moteur de production sur leurs valeurs de registre) ; les autres dossiers n’en portent pas, ce qui donne au compteur une population à ne PAS compter — sans quoi il serait vert sur du vide. Décision Louis 04/10/2026 : la classe `A` (une PME fictive) et la classe `C` (le client fictif) ont quitté la salle avec leurs comptes. La salle montre donc un chiffre non nul ET la preuve qu’il discrimine.',
    },
    total: {
      state: 'seede',
      reason:
        'Refonte Théo comptes-liste (458cb55e86) — « Comptes dans l’espace » compte tout le filtre courant (`TRUE` sur la requête de la liste), donc tous les comptes de `accounts` semés pour la salle : non nul dès l’arrivée, et égal au total de la pagination.',
    },
    activeRelations: {
      state: 'seede',
      reason:
        'Refonte Théo comptes-liste (458cb55e86) — « Relations actives » compte les comptes dont `commercial_status` vaut `customer` ou `opening`. Le semis pose un compte `customer` : le chiffre est non nul et VRAI.',
    },
    favorites: {
      state: 'seede',
      reason:
        'Refonte Théo comptes-liste (458cb55e86) — « Favoris » compte les lignes `user_favorites` (entity_type `account`) de celui qui regarde. Le semis pose des favoris de compte pour le propriétaire de la salle (voir l’entrée `user_favorites` plus haut) : le chiffre est non nul.',
    },
    crm: {
      state: 'seede',
      reason:
        "#4526.5/.7 — « Mon CRM » compte les comptes que `CRM_LINKED_ACCOUNT_PREDICATE` désigne (`origin` crm — un fichier importé n’en fait plus partie, renversement #4597.2 — ou lien CRM quand l’origine est inconnue) : le MÊME prédicat que le filtre de la puce. Le semis pose `origin = 'crm'` sur deux comptes que le brief dit déjà en relation (ENGIE, client en cours ; BNP Paribas, ancien client) et laisse les autres hors CRM : la puce s’affiche avec un chiffre non nul ET le filtre a des comptes à écarter. À zéro la puce se tait, jamais « 0 » (GA-18/19).",
    },
    imported: {
      state: 'seede',
      reason:
        "#4597.1 — « Importés » compte les comptes que `IMPORTED_ACCOUNT_PREDICATE` désigne (`origin` import, ou — sans origine — un compte qui porte l’identifiant d’un import ou un contact `source = 'import'`) : le MÊME prédicat que le filtre `imported`. Le semis pose `origin = 'import'` sur Kiabi, hors CRM et hors Découvrir : la puce s’affiche avec un chiffre non nul ET le filtre a des comptes à écarter. À zéro la puce se tait, jamais « 0 » (GA-18/19).",
    },
  }

/**
 * « ET EN DÉMONSTRATION, LE BADGE DE NAV « CONTACTS » MONTRE QUOI ? »
 * (#2155.24/.25 — le compteur de nav, QCM tranché par Louis le 15/09/2026).
 *
 * VIDE À DESSEIN. La garde par TABLE ne pose pas la question : le badge
 * n'ajoute aucune table, il compte des contacts déjà semés selon une
 * définition stricte — coordonnée VÉRIFIÉE (`email_verified = true`),
 * rattachée à un compte du portefeuille, sans action ouverte
 * (`ContactsService.countReadyToProcess`).
 *
 * `demo-seed.service.ts:867` pose `email_verified: false` sur TOUS les
 * contacts semés, y compris ceux qui portent une adresse (DEMO-02) —
 * délibérément, pas par oubli : le commentaire à sa hauteur nomme la raison,
 * « une adresse en `.example` ne délivre par construction jamais », donc la
 * marquer vérifiée serait une donnée fictive présentée comme vraie (règle
 * « JAMAIS de donnée fictive »). La salle rend donc `0` pour cette
 * population, et c'est la MÊME règle qui interdit d'afficher un zéro
 * (« une valeur absente ne s'affiche jamais 0 ») qui cache le badge —
 * exactement le comportement qu'aurait un vrai espace qui n'a encore rien
 * fait vérifier. Semer une vérification dédiée fabriquerait une preuve que
 * personne n'a produite, le même refus que `newSignals7d` ci-dessous pour la
 * même raison : deux chiffres qui se contrediraient devant un prospect (un
 * contact « vérifié » sans qu'aucun flux d'enrichissement de la salle ne
 * l'ait jamais dit).
 */
export const DEMO_CONTACTS_BADGE_COUNTERS: Readonly<
  Record<string, { state: 'seede' | 'vide_a_dessein'; reason: string }>
> = {
  readyToProcess: {
    state: 'seede',
    reason:
      'Compte les contacts dont `email_verified = true`, rattachés à un compte du portefeuille (`ACCOUNT_HYGIENE_PREDICATES.followedAccounts`) et sans action ouverte (`tasks`, `taskStillOpenSql`). #4107.4 : UN contact simulé (`smtpVerifiedEmail`, `demo-contact-density.ts`) a son e-mail deviné par pattern puis vérifié SMTP — le seul à porter `email_verified: true` dans le semis (`demo-seed.service.ts`). Tous les autres restent `false` (DEMO-02 : une adresse `.example` ne délivre jamais). Le badge de nav montre donc ce contact-là, pas une population inventée.',
  },
}

/**
 * « ET EN DÉMONSTRATION, « HORS PRIORITÉ » / « EN VEILLE » AVEC LEUR MOTIF
 * MONTRENT QUOI ? » (#2117.23/.24 — l'écran).
 *
 * VIDE À DESSEIN. `COMMERCIAL_STATUSES_REQUIRING_REASON` (`archived`,
 * `dormant`) ajoute une PORTE — le sous-menu « Déplacer vers » ouvre
 * `CommercialStatusReasonDialog` sur ces deux statuts, qui n'écrit rien sans
 * motif — mais aucune table nouvelle : le motif et sa date vivent dans le
 * MÊME `commercial_status_changed` que le passage en client, déjà semé sur
 * SNCF (#2117.24) et déjà lu par `CommercialStatusHistory.tsx`. La
 * salle montre donc DÉJÀ le mécanisme — motif, date, panneau — sur une
 * transition réelle.
 *
 * Ce qui manque est la transition VERS `dormant`/`archived` elle-même, et la
 * poser sans y regarder casserait un chiffre compté ailleurs : les six comptes
 * de `DEMO_PORTFOLIO_COUNTERS.followed` (`watching` ou `customer`) sont
 * nommés — Société Générale, Groupe BPCE, SNCF, SNCF
 * LOGISTIQUE — et nourrissent aussi `ACCOUNT_HYGIENE_PREDICATES.followedAccounts`
 * côté cockpit ; en retirer un pour le faire passer en veille changerait ce
 * compte sans que ce lot (le branchement écran) ait audité chacune de ses
 * lectures. Une huitième « dossier » de démonstration entière (secteur,
 * signaux, plan d'action…) est un coût hors du périmètre borné de ce lot.
 * Repoussé à un lot dédié plutôt que deviné ici.
 *
 * VERDICT — état : vide_a_dessein. Aucun compte de la salle ne porte
 * `commercial_status: 'archived'` ni `'dormant'`. Le mécanisme motif + date +
 * historique (#2117.23/.24) est déjà démontré par la transition
 * `commercial_status_changed` de SNCF vers `customer`, que
 * `CommercialStatusHistory.tsx` rend à l'identique quelle que soit la valeur
 * du statut. Semer une transition dédiée obligerait à sortir un compte des
 * six que `DEMO_PORTFOLIO_COUNTERS.followed` compte nommément, ou à écrire un
 * huitième dossier complet — les deux hors du périmètre de ce lot, qui ne
 * livre que le branchement écran.
 */

/**
 * « ET EN DÉMONSTRATION, LES CIBLES CHIFFRÉES MONTRENT QUOI ? » (PDF 5 §13.3)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE ENTRÉE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La garde PAR TABLE ne pose pas la question : les cibles n'ajoutent AUCUNE
 * table. Elles se posent sur des chiffres déjà semés — le délai de paiement, le
 * taux d'intercontrat, la marge — et c'est exactement le genre de silence qui
 * fait découvrir une pilule grise en réunion plutôt qu'en CI.
 *
 * ⚠️ ET CE QUI SE JOUE ICI EST PLUS QU'UN REMPLISSAGE. Une pilule de cible a
 * TROIS états, et une salle qui n'en montrerait qu'un ne prouverait rien :
 *
 *  · « dans la cible » sans « hors cible » donne un produit qui dit toujours
 *    oui, c'est-à-dire un produit qui ne sert à rien ;
 *  · et surtout, sans « non comparée », le prospect ne voit jamais la seule
 *    chose qui distingue cet outil : qu'il refuse de se prononcer quand il ne
 *    sait pas, au lieu d'afficher un zéro rassurant.
 *
 * ⚠️ Ne JAMAIS déplacer une entrée vers « vide à dessein » pour faire passer le
 * test.
 */
export const DEMO_KPI_TARGET_TILES: Readonly<Record<string, { state: 'seede' | 'vide_a_dessein'; reason: string }>> = {
  dso_days: {
    state: 'seede',
    reason:
      'Les quinze mois facturés (D42, Louis 28/08, complété par #2566.4 le 18/09) donnent DOUZE délais exploitables — deux lignes de marge au-dessus du plancher de mesurabilité depuis que la mission longue au bon de commande expiré y ajoute ses deux mois déjà réglés — pour une médiane inchangée de 32 jours. Cible « < 65 j » : la pilule est DANS la cible, et c’est le seul état vert de la salle — un produit qui ne dirait jamais oui ne servirait à rien non plus. Le repère de marché du §1 (« DSO PME/ETI 65 jours ») rend la démonstration lisible sans commentaire.',
  },
  bench_rate: {
    state: 'seede',
    reason:
      'Le vivier porte assez de consultants pour franchir le plancher de `benchRate`, et Camille Roussel est en intercontrat depuis 76 jours — un taux non nul, donc au-dessus de la cible « < 5 % bien piloté ». C’est l’état HORS CIBLE de la salle, et il est VRAI : la démonstration montre un produit qui sait dire non. Le baisser en semant dix consultants staffés retirerait à la fois l’alerte d’intercontrat et la preuve que la pilule discrimine.',
  },
  gross_margin: {
    state: 'seede',
    reason:
      'Six des neuf missions portent un coût chargé, et les relevés portent leurs jours : l’agrégat pondéré est calculé. La cible est une BANDE (25-40 %), donc le seul endroit du produit où un chiffre trop HAUT est aussi hors cible — au-delà de 40 %, c’est presque toujours un coût non saisi. Sous le plancher de cinq missions mesurées, la pilule reste « non comparée » alors que le chiffre s’affiche : c’est la nuance que cette tuile démontre, et aucune autre.',
  },
  unmeasured_margin: {
    state: 'seede',
    reason:
      'Trois des neuf missions n’ont pas de coût chargé, à dessein — c’est ce qui rend la ligne « partenaire » de la marge par canal NON MESURABLE. La part non mesurée est donc franchement au-dessus de la cible « < 10 % », et c’est la démonstration la plus utile de la salle : elle dit au prospect que la marge affichée juste au-dessus ne décrit pas encore tout son portefeuille, ce qu’aucun tableau de bord ne lui a jamais dit.',
  },
  missions_without_end_date: {
    state: 'vide_a_dessein',
    reason:
      'Sa cible (0) est comparée par la vue Qualité des données, pas par l’écran Finance — la pilule n’y est donc pas affichée. La salle porte bien une affectation sans date de fin, ce qui alimente le contrôle d’hygiène ; ajouter une seconde pilule sur l’écran Finance donnerait deux endroits pour le même chiffre, ce que le dépôt refuse (GA-26).',
  },
  missions_ending_without_plan: {
    state: 'vide_a_dessein',
    reason:
      'La salle porte bien une mission qui finit dans 28 jours sans plan de renouvellement — la matière EXISTE. Ce qui manque est le compteur : aucun écran ne rend « N missions T-30 sans plan », seulement des lignes de file, et le balayeur d’interventions exclut les espaces de démonstration (voir l’entrée `interventions`). La cible (0) vit donc au dictionnaire, et la pilule apparaîtra avec l’agrégat.',
  },
  bench_duration_days: {
    state: 'vide_a_dessein',
    reason:
      'La durée d’intercontrat n’est calculée nulle part : aucune médiane n’existe, seulement un COMPTE de consultants au-delà d’un seuil, qui sert à déclencher une bulle. La salle porte la matière (Camille Roussel, dernière affectation finie il y a 76 jours) et la bulle se déclenche ; la cible (< 41 j) vit au dictionnaire, avec la raison écrite de sa non-mesurabilité.',
  },
  timesheets_on_time: {
    state: 'vide_a_dessein',
    reason:
      'Aucune colonne n’horodate le DÉPÔT d’un relevé : l’indicateur est classé non mesurable au dictionnaire, avec sa raison écrite. Sa cible (> 85 %) s’affiche donc dans la fiche du dictionnaire — que la salle montre — et nulle part ailleurs. Semer un taux supposerait d’inventer la date qui manque, c’est-à-dire exactement la donnée fabriquée que le produit refuse.',
  },
  renewal_rate: {
    state: 'vide_a_dessein',
    reason:
      'Même situation : une prolongation ne laisse aucune trace distincte d’une date de fin corrigée (§13.2, « pas de nouvelle mission »). L’indicateur est non mesurable, sa cible (> 60 %) vit au dictionnaire, et la salle la montre là. Un taux semé ici serait un taux que le produit ne saurait pas recalculer chez le client.',
  },
  unmeasurable_missions: {
    state: 'vide_a_dessein',
    reason:
      'Le score de risque se calcule par MISSION (`/missions/:id/scores`) et aucune route ne rend encore la part de portefeuille non mesurable. La salle montre le refus à l’unité — une mission sans satisfaction ni CRA en retard rend « non mesurable » avec ses axes nommés — et la cible (< 20 %) au dictionnaire. La pilule apparaîtra le jour où l’agrégat existera, pas avant.',
  },
}

/**
 * UN RENDEZ-VOUS « PROPOSÉ », ET CE QUE LA SALLE EN MONTRE (30/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE ENTRÉE EST DIFFÉRENTE DES AUTRES
 * ─────────────────────────────────────────────────────────────────────────────
 * L'agenda distingue désormais quatre états (`confirmed`, `tentative`,
 * `cancelled`, `unknown`, `packages/contracts/src/schemas/agenda.ts`) et un
 * créneau `tentative` (« proposé ») ne compte plus comme un rendez-vous FIXÉ.
 * `demo-agenda.ts` ne pend d'AUCUNE table (les évènements sont générés en
 * LIVE, jamais stockés) : la garde par table de `demo-coverage.spec.ts` ne
 * pose donc aucune question à son sujet, et ce n'est pas la même absence que
 * pour un agrégat ou un onglet — c'est une absence de LECTEUR, pas de donnée.
 *
 * ⚠️ **Vérifié par grep sur TOUT le dépôt le 30/08/2026, pas supposé** :
 * `AgendaEventStatus`, `isConfirmedAgendaEvent` et `normalizeAgendaEventStatus`
 * n'ont qu'UN SEUL appelant, `activity-capture.service.ts#captureAgenda` —
 * qui écarte un évènement non confirmé de la timeline CRM. Aucun écran, ni
 * `AgendaGrid.tsx`, ni `AgendaBoard.tsx`, ni `NowStrip` (le bandeau « ce qui se
 * passe maintenant » de `/briefing`), ne lit `event.status` ou
 * `event.cancelled` : la distinction visuelle proposé/confirmé n'existe nulle
 * part aujourd'hui, sur aucun compte, démonstration ou réel.
 *
 * Et `captureAgenda` ne tourne JAMAIS sur un espace de démonstration : aucun
 * calendrier réel n'y est connecté (`google_connections` est vide à dessein,
 * pour la même raison). La règle « proposé ne compte pas comme fixé » n'a donc
 * aujourd'hui AUCUN chemin pour se montrer en démonstration, quel que soit ce
 * que le semis contient.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CORRIGÉ (28/09/2026, #2770/#2101.19/.37) — LE LECTEUR EXISTE MAINTENANT
 * ─────────────────────────────────────────────────────────────────────────────
 * Cette entrée disait « aucun écran ne lit `event.status` », vrai le
 * 30/08/2026. Ce n'est plus vrai : `AgendaGrid.tsx#EventBlock` (icône
 * `CircleDashed`, aria-label `agenda.board.proposed`) et `AgendaBoard.tsx`
 * (même icône, colonne jour) appellent tous deux `isProposedAgendaEvent`,
 * qui lit `event.status` (`agenda-view.ts`). « Pharmatek (démo) — suivi de
 * la proposition » (`demo-event-pharmatek-suivi`, `status: 'tentative'`) est
 * donc SEMÉE ET VUE — plus un cliquet en attente d'écran. Le lecteur
 * manquant que ce commentaire décrivait était `AgendaGrid`/`AgendaBoard`
 * eux-mêmes : construits après le 30/08, jamais recroisés avec cette entrée
 * depuis — le motif que le registre des chantiers nomme : « du code juste,
 * calculé, testé, que personne n'appelait », ici à l'envers (l'appelant est
 * arrivé, la doctrine ne l'a pas su).
 */
export const DEMO_AGENDA_EVENT_STATUS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "`demo-event-pharmatek-suivi` porte `status: 'tentative'` ; `AgendaGrid.tsx#EventBlock` et `AgendaBoard.tsx` (icône `CircleDashed`, aria-label `agenda.board.proposed`, FR+EN) l'affichent dès que `isProposedAgendaEvent` (agenda-view.ts) le lit vrai. Voir `demo-agenda-status-coverage.spec.ts`.",
}

/**
 * #2103.29 (épopée #2878) — CAS LIMITE RÉCURRENCE, CE QUE LA SALLE EN MONTRE.
 *
 * `AgendaEvent.recurring` (nouveau, `packages/contracts/src/schemas/agenda.ts`)
 * est dérivé de `recurringEventId` (Google) / `seriesMasterId` (Microsoft) —
 * posé uniquement sur une OCCURRENCE, jamais sur l'évènement maître.
 * `demo-agenda.ts` ne pend d'AUCUNE table (mêmes évènements générés en LIVE
 * que la garde par table de `demo-coverage.spec.ts` ne voit pas), donc cette
 * entrée classe le champ à la main plutôt que par la garde automatique.
 *
 * « Revue de pipe hebdomadaire » (`demo-event-pipe`) porte `recurring: true` —
 * seul évènement du jeu explicitement DIT hebdomadaire dans son propre libellé,
 * donc celui qui ne ment pas en portant le badge. `AgendaGrid.tsx` le LIT
 * (icône `Repeat`, `agenda.board.recurring`) : c'est SEEDÉ et VU, pas un
 * cliquet en attente d'écran comme `DEMO_AGENDA_EVENT_STATUS_COVERAGE` ci-dessus.
 */
export const DEMO_AGENDA_EVENT_RECURRING_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "`demo-event-pipe` (« Revue de pipe hebdomadaire ») porte `recurring: true` ; `AgendaGrid.tsx#EventBlock` affiche l'icône `Repeat` (aria-label `agenda.board.recurring`, FR+EN) dès que le champ est vrai. Les autres évènements du jeu restent sans le champ (optionnel, comme `visibility`) : aucun n'est décrit comme récurrent dans son propre libellé.",
}

/**
 * #2103.27 (épopée #2878) — CAS LIMITE ANNULATION, CE QUE LA SALLE EN MONTRE.
 *
 * `AgendaBoard.tsx` filtrait un rendez-vous `cancelled` avant tout rendu — la
 * personne ne savait jamais qu'il avait été annulé, seulement qu'il n'était
 * plus là. Une section lecture seule, hors de la grille (et de son
 * glisser-déposer), le nomme désormais. `demo-agenda.ts` ne pend d'aucune
 * table (même raison que `DEMO_AGENDA_EVENT_RECURRING_COVERAGE` ci-dessus),
 * donc cette entrée classe le champ à la main.
 *
 * `demo-event-annule` (« Point Altiver Industries — annulé par le client »,
 * jour+1) porte `cancelled: true` — seul évènement du jeu dit annulé dans son
 * propre libellé. `AgendaBoard.tsx` le LIT (section barrée, `agenda.board.cancelled`,
 * FR+EN) : SEEDÉ et VU.
 */
export const DEMO_AGENDA_EVENT_CANCELLED_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "`demo-event-annule` (« Point Altiver Industries — annulé par le client ») porte `cancelled: true` ; `AgendaBoard.tsx` l'affiche dans sa section lecture seule (texte barré, icône `Ban`, `agenda.board.cancelled`) au lieu de le filtrer en silence. Les autres évènements du jeu restent `cancelled: false` : aucun n'est décrit comme annulé dans son propre libellé.",
}

/**
 * #2390.6 (épopée #2926) — PROPRIÉTAIRE INDISPONIBLE, CE QUE LA SALLE EN MONTRE.
 *
 * `AgendaEvent.providerEventType` / `.showAs` (nouveaux,
 * `packages/contracts/src/schemas/agenda.ts`) portent la nature brute d'un
 * évènement — `outOfOffice` côté Google, `oof` côté Microsoft
 * (`isOwnerUnavailable`). `demo-agenda.ts` ne pend d'aucune table (même
 * raison que `DEMO_AGENDA_EVENT_RECURRING_COVERAGE` ci-dessus), donc cette
 * entrée classe le champ à la main.
 *
 * `demo-event-ooo` (« Absent du bureau (démo) », journée entière, jour+1)
 * porte `providerEventType: 'outOfOffice'` et chevauche deux rendez-vous
 * minutés déjà seedés le même jour (`demo-event-interne`,
 * `demo-event-altiver`) : `detectOwnerUnavailableConflicts` (nouveau,
 * `apps/api/src/modules/agenda/free-slots.ts`) les apparie réellement sur ce
 * jeu — voir `demo-agenda-owner-unavailable-coverage.spec.ts`. La nouvelle
 * route `GET /agenda/conflicts/owner-unavailable` (`AgendaService.ownerUnavailableConflicts`)
 * est donc un LECTEUR réel de la donnée. Ce qui manque encore est un écran
 * `apps/web` qui l'affiche — `AgendaGrid.tsx`/`AgendaBoard.tsx` ne lisent ni
 * `providerEventType` ni `showAs` à ce jour — d'où `seede_sans_lecteur`
 * plutôt que `seede` : la donnée est seedée et déjà exposée par une route
 * API réelle, mais aucun écran ne la montre encore à un visiteur.
 */
export const DEMO_AGENDA_EVENT_OWNER_UNAVAILABLE_COVERAGE: Readonly<{ state: 'seede_sans_lecteur'; reason: string }> = {
  state: 'seede_sans_lecteur',
  reason:
    "`demo-event-ooo` porte `providerEventType: 'outOfOffice'` et chevauche deux rendez-vous minutés du jeu ; `GET /agenda/conflicts/owner-unavailable` les apparie réellement (lecteur API existant). Aucun écran `apps/web` ne lit encore `providerEventType`/`showAs` : la donnée est prête, l'écran reste à construire.",
}

/**
 * #2390.10 (épopée #2926) — PARTICIPANT EXTERNE MANQUANT, CE QUE LA SALLE EN
 * MONTRE.
 *
 * Aucune donnée neuve : SNCF portait déjà DEUX
 * contacts — Directeur technique — entité numérique voyageurs et Responsable des achats de prestations informatiques (`demo-dataset.ts`) — quand
 * `demo-event-nova` (`demo-agenda.ts`) n'en invite qu'UN. `missingKnownContacts`
 * (nouveau, `apps/web/src/features/agenda/meeting-brief-inputs.ts`) le lit
 * réellement : `MeetingPrepDialog.tsx` affiche désormais « 1 contact connu du
 * compte, non invité » (Responsable des achats de prestations informatiques) dès qu'on ouvre le brief de ce
 * rendez-vous. SEEDÉ (depuis longtemps) et maintenant VU — contrairement à
 * `DEMO_AGENDA_EVENT_OWNER_UNAVAILABLE_COVERAGE` ci-dessus, ce point n'a pas
 * de lecteur manquant.
 */
export const DEMO_AGENDA_MISSING_PARTICIPANT_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "Responsable des achats de prestations informatiques (SNCF) est un contact seedé de longue date, absent des invités de `demo-event-nova` (seul Directeur technique — entité numérique voyageurs l'est) ; `MeetingPrepDialog.tsx` l'affiche désormais via `missingKnownContacts`. Voir `apps/web/src/features/agenda/meeting-brief-inputs.test.ts` (parité démo).",
}

/**
 * #2390.9 (épopée #2926) — SALLE RÉSERVÉE, CE QUE LA SALLE EN MONTRE (et ce
 * qui reste HORS périmètre).
 *
 * `AgendaAttendee.resource` (`packages/contracts/src/schemas/agenda.ts`) lit
 * `attendees[].resource` (Google) / `attendees[].type === 'resource'`
 * (Microsoft Graph) — les deux DOCUMENTÉS sur l'évènement lui-même, sans scope
 * Admin/domaine. `demo-agenda.ts` ne pend d'aucune table (même raison que
 * `DEMO_AGENDA_EVENT_RECURRING_COVERAGE` plus haut), donc cette entrée classe
 * le champ à la main.
 *
 * `demo-event-recrutement` porte un invité `resource: true` (« Salle Paris
 * 3e ») sur `demo-cal-moi` (l'agenda PRIMAIRE, lu par défaut) ; `roomAttendeesOf`
 * le retrouve réellement — voir `demo-agenda-room-coverage.spec.ts`. Depuis ce
 * point, deux écrans le LISENT réellement : la grille du jour (`AgendaGrid.tsx`,
 * tooltip au survol) et la liste mobile de la journée (`AgendaBoard.tsx`,
 * `EventCard`, #2097) affichent tous deux une ligne « Salle : Salle Paris 3e »
 * séparée, et n'incluent plus la salle dans le compte d'invités/externes.
 * `missingKnownContacts` / `matchAttendeeContact` (`meeting-brief-inputs.ts`)
 * et `guestCount` (`agenda-drag.ts`) l'excluent de même. SEEDÉ et désormais VU
 * — voir `AgendaGrid.test.tsx` / `AgendaBoard.test.tsx` (#2390.9).
 *
 * ⚠️ La CAPACITÉ d'une salle N'EST PAS livrée, et ne le sera pas sans un
 * fournisseur neuf : ni Google Calendar Events ni Microsoft Graph Events ne
 * documentent de nombre de places sur l'évènement lui-même. Microsoft
 * l'expose UNIQUEMENT via l'API Places (`/places/microsoft.graph.room`,
 * portée additionnelle `Place.Read.All`, absente des scopes par défaut) ;
 * Google ne l'expose que via l'Admin SDK Directory API (accès domaine complet,
 * hors de portée d'un utilisateur final). Un contrat d'API non vérifiable ne
 * se devine pas (CLAUDE.md) — documenté ici plutôt qu'un chiffre inventé.
 */
export const DEMO_AGENDA_ROOM_ATTENDEE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "`demo-event-recrutement` porte un invité `resource: true` (« Salle Paris 3e ») sur l'agenda primaire (`demo-cal-moi`, lu par défaut) ; `roomAttendeesOf` le retrouve réellement. `AgendaGrid.tsx` (tooltip) et `AgendaBoard.tsx` (`EventCard`, liste mobile #2097) l'affichent désormais à part (« Salle : Salle Paris 3e »), jamais comptée comme invitée — voir leurs tests (#2390.9). La CAPACITÉ (#2390.9, 02/10) est lue via l'API Places de Microsoft Graph (portée optionnelle `Place.Read.All`, no-op sans elle) ; la salle de démo porte `capacity: 8` et `RoomLines.tsx` l'affiche (« Salle Paris 3e · 8 places »). Côté Google : rien de lu (API Admin Directory, hors portée).",
}

/**
 * #2390.1 / #2390.8 (épopée #2926) — FUSEAU PAR INVITÉ, CE QUE LA SALLE EN
 * MONTRE.
 *
 * Ni Google ni Microsoft ne disent dans quel fuseau vit un invité. La seule
 * source est `contacts.timezone`, rattachée à l'invité par son e-mail exact :
 * `guestLocalTimes` (`apps/web/src/features/agenda/guest-time-zones.ts`) affiche
 * dans le pré-brief (`MeetingPrepDialog`) l'heure du rendez-vous chez l'invité
 * quand elle diffère de la mienne, et RIEN sinon.
 *
 * VIDE À DESSEIN (#3420, 03/10/2026) : tranché sans Louis. Directeur technique — entité numérique voyageurs
 * portait `Europe/Lisbon` alors que sa fiche affiche Lyon — une contradiction
 * visible en réunion, pire qu'une ligne absente. Son fuseau suit désormais sa
 * ville (`demoTimezone` → Europe/Paris) et aucun invité de la salle ne vit hors
 * du fuseau de l'occupant : la ligne « heure chez l'invité » ne s'affiche donc
 * pas en démonstration. Elle reste prouvée par `guest-time-zones.test.ts`
 * (web). Voir `demo-agenda-guest-timezone-coverage.spec.ts`.
 */
export const DEMO_AGENDA_GUEST_TIMEZONE_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "Les invités de la salle (Directeur technique — entité numérique voyageurs, Lyon) vivent tous à l'heure de l'occupant : `guestLocalTimes` ne rend aucune ligne, et c'est le comportement voulu (une absence ne fait aucune ligne). Lui poser un fuseau étranger pour remplir l'écran contredirait la ville de sa fiche (#3420). Preuve du rendu : `apps/web/src/features/agenda/guest-time-zones.test.ts`.",
}

/**
 * #2390.12 / #2390.14 / #2390.15 (épopée #2926) — DÉLÉGUER ET CRITÈRES DE
 * PRIORITÉ, CE QUE LA SALLE EN MONTRE.
 *
 * Ils vivent dans `ConflictDialog` (ouvert depuis le bandeau de conflit de
 * `/briefing`). La salle sème déjà deux rendez-vous qui se chevauchent
 * (`demo-agenda.ts`, en-tête) avec des invités dont `responseStatus` est semé
 * (accepted / needsAction / declined / tentative) : `guestResponseTally` en tire
 * « Réponses : 2 acceptées · 1 en attente », et chaque carte non commencée
 * propose « Proposer de déléguer » (brouillon `mailto:`, aucune écriture
 * d'agenda — l'agenda de démo est de toute façon lu, jamais écrit). SEEDÉ : rien
 * à ajouter au jeu de données.
 *
 * Les critères de priorité dont la donnée n'existe pas (étape commerciale,
 * impact, relation… et deux des neuf jamais nommés par écrit) ne sont pas
 * affichés : on n'affiche pas ce qu'on n'a pas.
 */
export const DEMO_AGENDA_CONFLICT_DELEGATION_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "Le chevauchement de `demo-agenda.ts` (deux rendez-vous, invités avec `responseStatus` semé) ouvre `ConflictDialog` : ligne « Réponses », bouton « Proposer de déléguer » (brouillon `mailto:`, aucune écriture d'agenda) et la phrase « aucun ne prime d'office ». Voir `ConflictDialog.test.tsx` (#2390.12, #2390.14, #2390.15).",
}

/**
 * #2103.1 (épopée #2878) — LE DÉCLENCHEUR post-RDV, CE QUE LA SALLE EN MONTRE.
 *
 * `isPostMeetingRecapCandidate` (`meeting-account-match.ts`) fait entrer
 * `MeetingPrepDialog` directement en mode « en rendez-vous » pour un
 * rendez-vous EXTERNE déjà TERMINÉ sans compte rendu (`notes.source_event_id`,
 * migration `1796321999357`) — et affiche « Compte rendu déjà rédigé »
 * plutôt que de reproposer, quand un CR existe déjà.
 *
 * `demo-agenda.ts` NE SÈME AUCUN évènement passé — chaque rendez-vous du jeu
 * est posé à une heure future du jour de la visite ou d'un jour suivant
 * (`hoursFromNow`/`slot`, toujours un décalage POSITIF), pour que la démo
 * montre la même semaine « à venir » à n'importe quelle heure où un prospect
 * ouvre le lien plutôt qu'un rendez-vous d'hier qui se serait périmé entre
 * deux visites. Ce parti pris (docblock d'en-tête du fichier, point 2) est
 * antérieur à ce lot et n'est pas revu ici : y ajouter un évènement déjà
 * terminé romprait la garantie « toujours une semaine cohérente », pour un
 * seul écran. Le déclencheur reste donc invisible dans la salle de démo —
 * pas un trou de couverture, une conséquence du parti pris déjà pris.
 */
export const DEMO_POST_MEETING_RECAP_TRIGGER_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "`demo-agenda.ts` ne sème aucun rendez-vous déjà terminé (parti pris antérieur : toujours une semaine à venir, quelle que soit l'heure de la visite) — `isPostMeetingRecapCandidate` ne peut donc jamais s'y déclencher. Le comportement est réel (testé : `meeting-account-match.test.ts`, `meeting-notes.service.spec.ts`), simplement invisible en démo tant qu'aucun évènement passé n'y est semé.",
}

/**
 * LES QUATRE CAPACITÉS DE LA VAGUE P DU 30/08/2026 — CE QUE LA SALLE EN
 * MONTRE (P21).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE MAILLE DE PLUS, ENCORE
 * ─────────────────────────────────────────────────────────────────────────────
 * Quatre lots fusionnés le même jour ont livré une capacité visible sans
 * pouvoir semer la démo — chacun parce que ce dossier était hors de son
 * périmètre strict, chacun l'ayant écrit dans son propre rapport. La garde PAR
 * TABLE ne pouvait rien voir des trois premières (aucune nouvelle table), et
 * la quatrième touchait une COLONNE (`accounts.sprint`) déjà classée SEEDÉE au
 * niveau de sa table.
 */
export const DEMO_REVERSE_PROSPECTS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'GET /projects/needs/:needId/reverse-prospects croise deux besoins ouverts, sur des comptes DIFFÉRENTS, partageant zone et compétence. Avant ce lot, aucune paire de besoins de la salle ne partageait sa zone (le besoin phare en « Île-de-France », les cinq de SNCF en « Lyon (69) » ou « Lyon ») : `NeedReverseProspects` s’ouvrait TOUJOURS sur l’état vide, jamais sur une piste réelle. Le besoin phare porte maintenant « Lyon » — le siège du client d’exemple — et ses compétences (Kubernetes, Terraform) recoupaient déjà « Ingénieur infrastructure — socle conteneurisé du portail », sur un AUTRE compte : une piste réelle apparaît sans qu’aucune autre donnée n’ait dû changer. Le cas négatif reste démontrable dans la MÊME salle : « Ingénieur systèmes — supervision des systèmes temps réel » (Lyon (69), `shortlist_count === 0`) ne partage sa zone avec personne et rend « personne d’autre ne cherche ce profil ici ». Recompté sur le jeu, avec les mêmes fonctions que le serveur (`sameZone`, `sharedSkillTerms`), par `demo-reverse-prospects-coverage.spec.ts`.',
}

/**
 * #1939.10 — **CE QUE LA SALLE RANGE, DOMAINE DU STOCKAGE PAR DOMAINE (12/09/2026).**
 *
 * `storage_objects` est classée SEEDÉE au niveau de la table — deux justificatifs
 * et deux pièces d'affaire y portent de vrais octets. La garde de TABLE ne pouvait
 * donc rien dire d'un troisième domaine : le message vocal aurait été « couvert »
 * par des PDF de notes de frais. D'où cette classification par domaine, typée sur
 * `StorageDomain` (un domaine de plus ne compile pas sans y être classé) et
 * vérifiée contre le semis réel par `demo-storage-domains-coverage.spec.ts`.
 */
export const DEMO_STORAGE_DOMAIN_COVERAGE: Readonly<
  Record<StorageDomain, { state: 'seede' | 'vide_a_dessein'; reason: string }>
> = {
  expense_receipt: {
    state: 'seede',
    reason:
      'Deux justificatifs de note de frais portent un vrai fichier PDF déposé au semis (`seedStoredFile`) : le bouton « ouvrir » de la note de frais OUVRE quelque chose, et les autres pièces restent référencées sans octets pour montrer l’autre moitié du produit.',
  },
  need_document: {
    state: 'seede',
    reason:
      'Deux pièces d’affaire de la fiche besoin portent un vrai fichier PDF déposé au semis : l’ouverture d’un devis ou d’une NDA se démontre, et un document sans fichier montre « référencé, non stocké ».',
  },
  chat_voice_message: {
    state: 'vide_a_dessein',
    reason:
      'Aucun service payant n’est appelé en démonstration : `POST /ia/chat/voice/transcribe` refuse la salle, et `GET /ia/chat/voice/status` y rend `available: false`, donc le micro de Laura ne s’affiche pas. Semer un enregistrement montrerait une réécoute d’un message que personne n’a dicté — et le fil du copilote commence vide à dessein (`chat_messages`), il n’y aurait aucun message pour le porter. Le visiteur tape sa question : Laura répond pareil.',
  },
  // #2814
  invoice_attachment: {
    state: 'seede',
    reason:
      'Un bon de commande signé (vrai PDF déposé au semis) est joint à la facture préparée du mois courant de « Fiabilisation plateforme », mission réellement prête : la prévisualisation de facture montre une pièce qui s’ouvre.',
  },
  // #2876 (#2433.4)
  chat_image_attachment: {
    state: 'vide_a_dessein',
    reason:
      'Même raison que `chat_voice_message` juste au-dessus : `POST rag-documents/extract` ne range JAMAIS une image en salle de démonstration (`RagController.persistChatImage`, même garde que `ingest`/`ingestZip`) — un objet qui survivrait entre deux passages irait à l’encontre de la salle qui se réinitialise. Semer un objet directement montrerait une preuve visuelle qu’aucun visiteur n’a réellement jointe, ce que la doctrine « jamais de donnée fictive » refuse. #2433.12 (lot P02 09/10) — le recadrage proposé et le tableau lu se voient quand même en salle : l’amorce scriptée « Lis le tableau de cette capture » pose sur sa question une capture DESSINÉE côté navigateur (`demo-chat-capture.ts`, aucun objet rangé), dont les bords et la grille sont connus par construction ; le localiseur d’objets, lui, n’est jamais appelé en salle (`RagController.extract`).',
  },
  // #2957 (#2180.54)
  rfp_source_document: {
    state: 'seede',
    reason:
      'Le dossier d’appel d’offres scripté de la salle (`seedRfp`) porte désormais un vrai fichier PDF déposé au semis (`seedStoredFile`, `rfp_source_documents`) : la carte « Documents sources » de `/rfp` ouvre réellement le document, plutôt que de le montrer référencé sans fichier — même patron que `need_document`/`invoice_attachment` juste au-dessus.',
  },
  // #3803 (3803.7)
  rag_document_source: {
    state: 'seede',
    reason:
      'Le dépôt de document est refusé en salle : sans original semé, la visionneuse (grille à onglets, PDF, docx, slides) ne s’y verrait jamais. Le semis fabrique un original de CHAQUE format (pdf, docx, xlsx dont un classeur à onglets, pptx, csv, md) depuis le contenu FICTIF déjà semé du document (`demoDocumentSourceFile`), le range sous ce domaine (`seedStoredFile`) et le lie (`rag_documents.source_object_id`). Les autres documents de la salle restent SANS original, à dessein : ils montrent « original non conservé » (3803.4).',
  },
  // #2422.6 (épopée #2869, lot R24 07/10/2026) — voir `DEMO_LEGAL_CONTRACT_UPLOAD_LINK_COVERAGE`
  // juste au-dessous : le lien EST semé, mais aucun dépôt ne l'est — un dépôt
  // réel exige une requête PUBLIQUE, hors session, qu'aucun semis ne simule
  // (le semis écrit en base avec la clé de service, jamais par la route
  // publique elle-même). Rien ne porte donc d'octet sous ce domaine en salle.
  // #3699.6
  outreach_asset_file: {
    state: 'seede',
    reason:
      'Deux assets du catalogue de la salle (`DEMO_OUTREACH_ASSETS`) portent un vrai PDF fictif déposé au semis (`seedStoredFile`) : la bibliothèque montre un document attachable, et le dialogue d’envoi le propose comme pièce jointe — l’envoi lui-même reste refusé en salle (`demo_send_blocked`).',
  },
  legal_contract_external_upload: {
    state: 'vide_a_dessein',
    reason:
      'Aucun dépôt n’a eu lieu dans la salle de démonstration : le lien semé (`DEMO_LEGAL_CONTRACT_UPLOAD_LINK_COVERAGE`) est révoqué à dessein, pour qu’un visiteur qui l’ouvrirait ne tombe jamais sur un formulaire qui écrirait réellement dans la salle partagée de démo.',
  },
}

/**
 * #2422.6 (épopée #2869, lot R24 07/10/2026) — LE LIEN SIGNÉ, en démo.
 *
 * « Toute fonctionnalité user-facing doit AUSSI être remplie en mode démo »
 * (craft rule n°9) — mais un lien FONCTIONNEL en salle de démo écrirait une
 * pièce dans une salle que des visiteurs PARTAGENT, depuis une route
 * PUBLIQUE, sans aucune session : exactement le risque que le dépôt n'accepte
 * nulle part ailleurs (une salle de démo n'est pas cloisonnée par visiteur,
 * `demo-pool.service.ts`). Le lien est donc semé RÉVOQUÉ — le bouton
 * « Demander une pièce » et l'écran qu'il ouvre sont bien visibles, mais le
 * lien qu'il affiche ne peut plus recevoir de dépôt. Vérifié par
 * `demo-seed.service.spec.ts`.
 */
export const DEMO_LEGAL_CONTRACT_UPLOAD_LINK_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    'Le lien est semé RÉVOQUÉ (`revoked_at` posé au semis) sur le contrat-cadre vedette de la salle : le bloc Contrats affiche bien un lien existant et sa date de révocation, mais aucun visiteur ne peut écrire dans la salle de démo partagée depuis sa porte publique. Un lien ACTIF en démo aurait exactement le risque que le dépôt existe pour fermer (une écriture publique, sans session, sur une donnée partagée entre visiteurs).',
}

/**
 * ⚠️ **CE QUE LA FILE « À TRAITER » DE `/missions/suivi` LIT (#1378, 04/09/2026).**
 *
 * Depuis ce lot, `/missions/suivi` s'ouvre par DÉFAUT sur « À traiter » — les
 * missions qui portent réellement un geste — et plus sur tout le portefeuille.
 * Cette vue ne lit AUCUNE table neuve : elle compose les états de facturation
 * classés juste en dessous (`blocked`, `ready`) et les statuts de relevés
 * classés dans {@link DEMO_TIMESHEET_STATES_INTENTIONALLY_ABSENT}. Rien à
 * semer de plus, et c'est pour ça qu'aucune garde ne rougit.
 *
 * **Mais la conséquence est nouvelle et elle se note ICI** : le jour où le semis
 * perdrait ses missions bloquées et ses relevés rejetés, `/missions/suivi`
 * s'ouvrirait sur un écran VIDE en démonstration — pas sur une liste, comme
 * avant. La salle en porte aujourd'hui de quoi la remplir : trois missions
 * `blocked`, deux `ready`, deux relevés `rejected` et un `submitted`. C'est
 * exactement le défaut « un écran livré mais vide en démo se découvre en
 * réunion », pris avant qu'il arrive.
 *
 * Le bloc « Automatisations » du même écran (#1380) nomme les routines
 * ÉTEINTES qu'un problème visible rend regrettables. En démonstration elles le
 * sont toutes — voir `no_routine_enabled` dans
 * {@link DEMO_LAURA_BUBBLES_SILENT} : « en armer une ferait partir des envois
 * programmés depuis une salle publique ». Le message affiché y est donc VRAI,
 * et il démontre la capacité au lieu de la cacher.
 */
export const DEMO_ACCOUNT_INVOICE_READINESS_COVERAGE: Readonly<
  Record<string, { state: 'seede' | 'demontrable_a_la_maille_mission'; reason: string }>
> = {
  none: {
    state: 'seede',
    reason:
      'Les cinq comptes réels du jeu (aucun n’a jamais porté de mission — `DemoDossier` n’a même pas de champ `missions`) sont absents du digest de propagation : `none`, « sans objet », jamais rouge — déjà vrai sans rien semer de plus.',
  },
  blocked: {
    state: 'seede',
    reason:
      'SNCF porte, sur le mois que l’écran regarde, trois missions réellement bloquées (relevé manquant + bon de commande manquant + contact inconnu ; relevé rejeté ; relevé non validé + contact inconnu) : la précédence `blocked > ready > invoiced > not_due` fait remonter cet état au compte, cohérent avec ce que l’onglet Missions affiche déjà sur chaque ligne — un bloqueur affiché correspond à un vrai manque dans les données semées.',
  },
  ready: {
    state: 'demontrable_a_la_maille_mission',
    reason:
      'Deux des six missions du mois (« Fiabilisation plateforme », « Industrialisation d’un cas d’usage de recherche ») sont RÉELLEMENT prêtes, sans bloqueur. Elles restent MASQUÉES au niveau COMPTE par la précédence — SNCF est le SEUL compte à porter des missions dans la salle, et une salle à un seul compte facturable ne peut pas montrer à la fois « Prêt » et « Bloqué » sans un second compte facturable, ce qu’aucune raison de ce lot ne justifie (`chantiers-livres.md` : la moitié « après la signature » n’existe QUE sur SNCF, à dessein, pour ne jamais laisser croire à une mission chez l’une des cinq sociétés réelles). Ce que la salle montre reste vrai à la maille MISSION — l’onglet Missions du compte, pas la colonne agrégée du portefeuille.',
  },
  not_due: {
    state: 'demontrable_a_la_maille_mission',
    reason:
      'La mission au forfait (« Refonte des applications voyageurs ») portait sa propre incohérence : son commentaire disait « l’état de facturation mensuel ne se pose pas », et `billing_cadence` valait pourtant `monthly` — `assessInvoiceReadiness` ne rend `not_due` que pour une cadence `milestone`/`fixed_price`, donc la mission tombait `blocked`, JAMAIS l’état qu’elle prétendait montrer. Corrigée en `billing_cadence: milestone` : la mission rend maintenant `not_due`, démontrable dans l’onglet Missions. Comme `ready` juste au-dessus, elle reste masquée au niveau COMPTE par la précédence — même raison, même limite structurelle.',
  },
  invoiced: {
    state: 'demontrable_a_la_maille_mission',
    reason:
      'Hors du mois courant à dessein : voir la raison déjà écrite en face de `invoice_readiness` plus haut dans ce fichier — y poser une ligne rendrait « facturé » l’un des trois états que la salle existe pour montrer sur le mois en cours.',
  },
  relaunch_brief: {
    state: 'seede',
    reason:
      'Société Générale porte, sans qu’aucune ligne n’ait été ajoutée pour cette raison précise, ≥ 2 opportunités OUVERTES (`OPEN_PIPELINE_STAGES`) et 0 mission signée. C’est une conséquence DÉTERMINISTE de l’ordre de semis : `opportunities.first_detected_at` vaut `now()` par défaut, `seedCompanionData` matérialise les comptes réels DANS L’ORDRE de `DEMO_DOSSIERS` (Société Générale en tête), et `advanceDemoPipeline` promeut les 9 opportunités les PLUS ANCIENNES du workspace — dont 5 sur des étapes ouvertes. Société Générale matérialise, à elle seule, au moins neuf items (quatre `it_challenges` + cinq `recent_signals`), largement de quoi occuper les cinq promotions avant que Groupe BPCE ne matérialise la moindre ligne. Verrouillé par `demo-account-invoice-readiness-coverage.spec.ts` (l’ordre du tableau, le volume matérialisable).',
  },
}

/**
 * #1918.1 — LES DEUX PORTÉES DE LA MÉMOIRE, en démonstration (12/09/2026).
 *
 * La table `memory_pinned_facts` est déjà seedée (voir plus haut). Ce qui est
 * NEUF, c'est une colonne dont la valeur change ce que l'écran affiche : le
 * badge « Toi uniquement » / « Toute ton ESN » et le geste « Partager avec ton
 * ESN » de Réglages › Mémoire. Une salle d'une seule portée montrerait un badge
 * qui ne varie jamais. Chaque portée du contrat est classée ici ;
 * `demo-memory-scope-coverage.spec.ts` recompte le jeu.
 */
export const DEMO_MEMORY_SCOPE_COVERAGE: Readonly<
  Record<string, { state: 'seede' | 'vide_a_dessein'; reason: string }>
> = {
  user: {
    state: 'seede',
    reason:
      'Plusieurs éléments « Toi uniquement » dans `DEMO_MEMORY_FACTS`, dont la préférence d’écriture (sans compte — elle ne dépend d’aucune résolution, donc le semis ne peut pas la sauter), l’objectif du trimestre, l’élément temporaire, l’élément échu et la note de Laura sur Société Générale. Semés pour `ownerUserId`, le compte sous lequel le visiteur est connecté : il les VOIT, avec le bouton « Partager avec ton ESN » que seul le propriétaire reçoit. Le compte exact vit dans le jeu, pas ici — une phrase qui recopie un nombre périme au premier élément ajouté.',
  },
  workspace: {
    state: 'seede',
    reason:
      'La correction « Ne propose plus de régie pure » et la règle sur les appels d’offres de tierce maintenance sont semées « Toute ton ESN » : des règles d’espace que la personne a choisi de partager. Ce sont les lignes qui montrent l’autre badge, et le geste inverse « Garder pour toi uniquement ». Sans compte, pour la même raison que ci-dessus.',
  },
  business_unit: {
    state: 'seede',
    reason:
      'La règle de tarification « À Lyon, on ne se positionne pas sous 480 € par jour sur les profils Data » est semée sur le périmètre « Agence Lyon », que le visiteur PORTE (`seedBusinessUnits` l’y rattache, comme la BU Banque & Assurance ; le troisième périmètre reste sans lui). C’est la ligne qui montre le troisième badge — celui qui nomme une ÉQUIPE, entre « toi » et « toute l’ESN » — et la portée que #1918.2 demandait de distinguer. Sans compte : elle ne dépend d’aucune résolution de dossier, donc le semis ne peut pas la sauter. Un élément semé sur un périmètre que le visiteur ne porte PAS lui serait invisible : ce serait une ligne écrite pour personne.',
  },
  conversation: {
    state: 'vide_a_dessein',
    reason:
      'VIDE À DESSEIN, et ce n’est pas une facilité : une mémoire « cette conversation » ne se lit QUE dans le fil où elle a été écrite — jamais dans Réglages › Mémoire, jamais dans un autre fil (c’est la définition même de la portée, la même que celle d’un document « fil seul », #1954). Or le visiteur de la salle ouvre un fil NEUF à chaque visite : une ligne semée sur un fil d’avance ne serait visible d’aucun écran qu’il traverse, et le semis aurait l’air d’être là sans rien montrer. Ce que la démonstration montre de cette portée est le CHOIX, proposé dans la carte Mémoire dès qu’on est dans un fil, avec sa phrase « Sert à ce fil seulement… » — et le geste se fait en visite, comme pour `business_unit_access_requests`. La table se vide au départ du visiteur (`demo-reset.service.ts`).',
  },
}

/**
 * #2260.7 — L'OBJET VISÉ par un élément de mémoire, en démonstration
 * (18/09/2026) : contact, besoin, consultant ou mission, à côté du dossier
 * auquel l'élément est attaché. Sans un élément par type, Réglages › Mémoire
 * de Laura n'aurait jamais montré le badge nommé et cliquable que ce lot
 * ajoute — une capacité livrée mais jamais visible en démonstration (craft
 * rule n°9). Chaque type est classé ici ; `demo-memory-object-coverage.spec.ts`
 * recompte le jeu.
 */
export const DEMO_MEMORY_OBJECT_COVERAGE: Readonly<
  Record<string, { state: 'seede' | 'vide_a_dessein'; reason: string }>
> = {
  contact: {
    state: 'seede',
    reason:
      'Un élément de mémoire vise Directeur technique — entité numérique voyageurs, le DSI de SNCF — un contact déjà semé par `seedDeliveryClient`, résolu par son nom dans `contactIds` (le même registre que les autres liens de contact du semis, jamais une seconde résolution). C’est la ligne qui montre le badge « Contact » cliquable vers sa fiche.',
  },
  need: {
    state: 'seede',
    reason:
      'Un élément de mémoire vise le rôle « Ingénieur d’exploitation — renfort plateforme » (`DEMO_STAFFED_NEED`, déjà semé et POURVU — la mission qui en est née est celle que la salle montre en cours). Résolu par son titre dans l’espace de la salle. C’est la ligne qui montre le badge « Besoin » cliquable vers la fiche du projet.',
  },
  consultant: {
    state: 'seede',
    reason:
      'Un élément de mémoire vise Yanis Berthier, le consultant du vivier affecté à la mission « Fiabilisation plateforme — renfort exploitation » (`seedVivier`, puis `client.missions[0].consultant`). Résolu par son nom dans l’espace de la salle. C’est la ligne qui montre le badge « Consultant » cliquable vers sa fiche du vivier.',
  },
  mission: {
    state: 'seede',
    reason:
      'Un élément de mémoire vise la mission « Fiabilisation plateforme — renfort exploitation » (`seedDeliveryClient`, déjà semée). Résolue par son libellé dans l’espace de la salle. C’est la ligne qui montre le badge « Mission » cliquable vers sa fiche.',
  },
}

/**
 * #1916 — LES SECTIONS DE LA MÉMOIRE, en démonstration (13/09/2026).
 *
 * Réglages › Mémoire de Laura se lit par sections, dérivées de la ligne par le
 * contrat (`memoryLedgerSectionOf`). Une section vide devant un prospect
 * répondrait « rien ici » à la question même que l'écran règle. Chaque section
 * est classée ; `demo-memory-sections-coverage.spec.ts` recompte le jeu avec la
 * MÊME dérivation que l'écran.
 *
 * `renvoi` : la section ne liste pas d'éléments de mémoire, elle dit où vit ce
 * qu'elle nomme — et ce lieu est lui-même semé.
 */
export const DEMO_MEMORY_SECTION_COVERAGE: Readonly<
  Record<MemoryLedgerSection, { state: 'seede' | 'renvoi'; reason: string }>
> = {
  personalPreferences: {
    state: 'seede',
    reason:
      'La préférence d’écriture « messages courts, tutoiement, trois lignes maximum » est une préférence épinglée pour soi, sans compte ni échéance : elle tombe dans « Préférences personnelles ». La couche des réglages libres (`user_preferences`) y apparaît aussi quand elle est remplie.',
  },
  personalObjectives: {
    state: 'seede',
    reason:
      'L’objectif du trimestre (« deux nouveaux comptes signés en Occitanie ») est un fait épinglé pour soi, sans compte ni échéance. Sans lui, la section qui répond au premier point du retour #1916 — des objectifs rangés ailleurs que dans l’identité — s’ouvrirait vide.',
  },
  esnRules: {
    state: 'seede',
    reason:
      'La règle « pas d’appels d’offres de tierce maintenance sous 300 k€ » est partagée avec toute l’ESN, sans compte ni échéance : c’est la ligne qui distingue une règle d’espace d’une note personnelle, ce que l’écran existe pour montrer.',
  },
  accountContext: {
    state: 'seede',
    reason:
      'La note de Laura sur Société Générale (« le référencement se rejoue en fin d’année ») est attachée à un compte. Elle dépend de la résolution du compte par son nom ; le semis la saute proprement si le dossier manque, et la garde vérifie que ce dossier est bien dans le jeu.',
  },
  corrections: {
    state: 'seede',
    reason:
      'La correction « Ne propose plus de régie pure » n’a plus d’échéance depuis le 13/09 : datée, elle se rangerait dans « Éléments temporaires » (l’échéance prime) et la section des corrections resterait vide. Elle porte aussi l’historique semé (portée changée, texte précisé).',
  },
  referenceDocuments: {
    state: 'renvoi',
    reason:
      'La mémoire ne garde aucun document : la section renvoie vers la base de connaissance, où vivent les documents que Laura consulte à chaque question du chat. Cette base est semée dans la salle (`rag_documents` : méthode, référence, grille tarifaire) — le renvoi mène donc à quelque chose de rempli.',
  },
  temporary: {
    state: 'seede',
    reason:
      'Deux éléments datés, et c’est la paire qui compte : « priorité aux comptes de Haute-Garonne jusqu’au salon » échoit dans quarante jours (en service, « Jusqu’au … »), « pas de rendez-vous pendant les congés d’août » est ÉCHU depuis douze jours (« non utilisé par Laura aujourd’hui », avec sa date). Les délais sont relatifs au semis : aucun ne bascule pendant une démonstration.',
  },
  // #1918.2 — « Contexte de ma BU » : nouvelle section (`memory-ledger-
  // sections.ts`) depuis que `scope: 'business_unit'` route vers elle plutôt
  // que vers « Règles de l'ESN ».
  teamContext: {
    state: 'seede',
    reason:
      'La règle « À Lyon, on ne se positionne pas sous 480 € par jour sur les profils Data » est semée avec `scope: business_unit` et `businessUnit: "Agence Lyon"` (`demo-dataset.ts:12002-12006`), résolue en identifiant réel par `seedBusinessUnits` — le visiteur de démonstration EST membre de cette BU, donc il la voit sous « Contexte de ma BU », distincte des règles de toute l’ESN et d’une note de compte.',
  },
}

export const DEMO_TALENT_FILTER_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'Vérifié le 30/08/2026 à l’arrivée du tiroir de filtres du vivier (`TalentFilterDrawer.tsx`, `availability` + `seniority`) : AUCUN semis supplémentaire n’était nécessaire. Les sept profils de `DEMO_CONSULTANTS` portaient déjà les deux champs, avec des valeurs réelles et VARIÉES (quatre `availability` sur cinq, trois `seniority` sur cinq, dont un « disponibilité inconnue » — Hakim Barreau, à dessein pour le bloc « non évaluables » du matching), depuis le chantier du matching (PDF 4). Verrouillé par `demo-talent-filters-coverage.spec.ts` pour qu’un profil ajouté demain sans ces deux champs ne vide pas le tiroir en silence.' +
    ' Élargi le 31/08/2026 (PDF-22 §01, écran Vivier) : SIX critères de plus sont devenus réels côté serveur (TJM minimum, secteur, langue, mode de travail, CV disponible, en mission), et CINQ des six retombent sur des champs déjà seedés — `tjm` s’étale de 560 à 780 € (min ET max ont de quoi filtrer), `sectors` couvre cinq valeurs différentes sur les sept profils, `languages` porte `fr`/`en` avec des niveaux variés, `cv_text` est renseigné sur les sept (le filtre « CV disponible » a un vivier entier à montrer, même si la variété manque côté « sans CV »), et « en mission » se lit sur les affectations déjà seedées ailleurs (`seedDeliveryClient`). Le sixième, `remote_preference`, N’ÉTAIT PAS seedé : six profils sur sept ont reçu une valeur RÉELLE et VARIÉE (`hybride` × 3, `sur_site` × 2, `full_remote` × 1), le septième (Salomé Dufour) reste `null` À DESSEIN — « non renseigné » est un état réel qu’un vivier de sept personnes doit aussi montrer. Recompté par `demo-talent-filters-coverage.spec.ts`.' +
    ' Élargi une SECONDE fois le 31/08/2026 (second lot, fermeture des deux derniers critères) : le RAYON et les ANNÉES D’EXPÉRIENCE MINIMUM ont chacun besoin d’une donnée qui n’existait dans AUCUN profil avant ce lot — `DEMO_CONSULTANTS` porte désormais `years_experience` (reprises TELLES QUELLES du CV narratif déjà semé, « … (X ans) », de 5 à 14 selon le profil — un rayon d’étalement suffisant pour que le seuil filtre réellement) et `latitude`/`longitude` (coordonnées RÉELLES et FIXES, jamais géocodées en direct au semis — la salle de démo ne dépend d’aucun appel réseau). SIX profils sur sept sont géocodés sur PARIS, et le septième (Marc Ouedraogo, dont `zones` porte déjà « Laval ») sur LAVAL : sans cette diversité, un rayon de 50 km autour de Paris (la valeur de la maquette) engloberait le vivier entier et ne démontrerait rien — avec elle, il exclut exactement un profil. Recompté par `demo-talent-filters-coverage.spec.ts`.' +
    ' Élargi le 01/09/2026 (FICHE d’un talent, et non plus sa ligne) : le bloc « Profil » passe de dix champs à plat à quatre groupes, et deux colonnes qu’il rend n’étaient JAMAIS écrites par le semis — la fiche affichait « Non renseigné » sur les sept profils, à l’endroit exact où un prospect regarde. `source` est désormais posée sur les sept, avec quatre valeurs différentes (`manual` × 2, `referral` × 2, `cv`, `ats`, `import`) : c’est un fait de l’ESN FICTIVE sur son PROPRE recrutement, rien d’inventé sur un tiers, et elle remplit du même coup la ligne « Source » de l’onglet Consentement, vide jusque-là. `travel_acceptance` est posée sur CINQ profils (`ponctuel` × 3, `aucun`, `frequent`) et reste `null` sur deux À DESSEIN — « on n’a pas demandé » est un état réel, et c’est précisément ce que la mobilité structurée distingue de « refuse de se déplacer ». Restent volontairement vides sur la fiche : `public_profile_url` (le semis pose « aucune coordonnée, aucun portrait » pour ces personnes fictives — un lien fabriqué serait une donnée inventée) et `photo_url` (aucun chemin d’écriture n’existe encore dans le dépôt, cf. `talent-photo.service.ts` — l’avatar retombe sur les initiales).' +
    ' Élargi le 16/09/2026 (#2182.25 à .39 et #2182.54, le VIVIER EN COLONNES) : la liste de cartes devient un tableau de treize colonnes, et onze d’entre elles retombent sur des champs déjà semés — titre, compétences typées, séniorité, zones, statut de relecture, disponibilité dérivée, TJM, mode de travail, contrat, complétude. La DOUZIÈME, « Dernière interaction », lisait `consultants.last_contact_at`, posée par `1789374912846-TalentPool` et écrite par AUCUN semis : la colonne aurait dit « non mesuré » sur les sept profils de la salle, et le filtre « Fraîcheur » (#2182.54, `dormantMonths`, réel en SQL depuis des mois) n’aurait rien eu à montrer. CINQ profils sur sept ont reçu un dernier échange RÉEL et ÉTALÉ — Camille Roussel 4 jours, Yanis Berthier 40, Inès Kaczmarek 120, Antoine Rivière 260, Hakim Barreau 430 —, de sorte que les trois seuils du filtre (3, 6 et 12 mois) coupent chacun le vivier à un endroit différent. Salomé Dufour et Marc Ouedraogo restent SANS échange enregistré À DESSEIN : « on ne lui a jamais parlé » est un état réel du vivier, et la colonne le NOMME au lieu d’écrire une date d’aujourd’hui qui serait inventée. La treizième colonne (les actions) ne porte aucune donnée.' +
    ' Élargi le 21/09/2026 (#2186.5/.7/.14, les états de disponibilité DÉCLARÉE distincts) : `en_mission` (déclarée par la personne, distincte d’`indisponible`) et `a_confirmer` (une disponibilité déclarée mais PÉRIMÉE, calculée à la lecture — jamais stockée) restent VIDE À DESSEIN dans cette salle. Chacun des sept profils porte déjà une `availability` et des calibrations verrouillées par d’AUTRES gardes nommées (facturation et renouvellement pour Marc Ouedraogo, comptes de missions pour Antoine Rivière/Hakim Barreau/Inès Kaczmarek, la bulle `long_bench` pour Camille Roussel, `consultant_free_soon` pour Salomé Dufour) — leur faire porter une sixième valeur d’`availability` déplacerait une calibration nommée sans rien démontrer de plus, et la doctrine du fichier (« sept profils », jamais un huitième) exclut d’en ajouter un pour la seule occasion. `en_mission` reste néanmoins joignable et testé — `ConsultantFormDialog.test.tsx`, `declared-availability.spec.ts`, `TalentAvailabilityBadge.test.tsx` — hors de cette salle de démonstration précise.' +
    ' Élargi le 25/09/2026 (épopée #2990, #2182.23/#2182.51/#2182.53, critères de recherche côté serveur) : DEUX critères neufs, deux réponses DIFFÉRENTES. Le CONSENTEMENT (`consent_given_at`/`consent_expires_at`) n’était écrit par AUCUN semis — le filtre aurait montré « none » sur les sept profils, un vivier techniquement vrai mais qui ne démontre rien. TROIS profils sur sept reçoivent désormais un consentement RÉEL, chacun dans un état DIFFÉRENT de ceux que `consentState()` distingue : Camille Roussel `valid` (recueilli il y a 200 jours, échéance dans 400), Yanis Berthier `expiring` (échéance dans 15 jours, dans la fenêtre `CONSENT_WARNING_DAYS`), Salomé Dufour `expired` (échéance dépassée de 30 jours). Les quatre autres restent SANS consentement À DESSEIN — « jamais recueilli » (`none`) est l’état ordinaire de la majorité d’un vivier. Le filtre « SANS MISSION » (`noMissionMonths`), lui, est câblé et testé en SQL (`talent.service.spec.ts`) mais reste VIDE À DESSEIN sur CETTE salle : les sept profils de `DEMO_DELIVERY_CLIENT.missions` sont TOUS en mission active ou terminée depuis moins de trois mois — un vivier PLEINEMENT STAFFÉ, fait réel de ce jeu de données. Y ajouter une inactivité de plus de trois mois aurait exigé de déplacer la mission d’un profil DÉJÀ calibré par une autre garde nommée (voir la note « #2195.50 » sur `Marc Ouedraogo`, seul profil sans calibration exacte tierce, et pourtant DÉJÀ réservé à la fenêtre de renouvellement lointaine) — au prix de faire régresser cette garde-là pour en satisfaire une neuve. Cette salle ne montre donc personne sur ce filtre précis, un état honnête plutôt qu’un profil forcé. Recompté par `demo-talent-filters-coverage.spec.ts`.' +
    ' Élargi le 26/09/2026 (épopée #2990, #2182.21, LA COMPLÉTUDE) : « tranché sans Louis » — le filtre applique le même calcul que `talentCompleteness`/`ENRICHED_MIN_AXES` (identité, compétences, disponibilité DÉRIVÉE, TJM, CV), APRÈS décoration, même patron que `derived`/`onMission`/`freeBefore`, sans migration ni vue matérialisée. Le résultat en démo est VIDE À DESSEIN d’un seul côté : les sept profils de `DEMO_CONSULTANTS` portent tous un `full_name`, un `tjm`, un `cv_text` non vide, une `stack` non vide (`consultant_skills` seedée depuis elle, `demo-seed.service.ts:3221`) et AU MOINS une affectation (voir le paragraphe « sans mission » juste au-dessus) — quatre à cinq axes remplis sur cinq, donc TOUS « enrichis ». « Incomplète » n’a personne à montrer dans cette salle, exactement la même conclusion et la même raison que « sans mission » : un vivier de démonstration COMPLET par construction, pas un trou de ce lot. Le filtre reste réel et testé en SQL (`talent.service.spec.ts`) et le calcul pur vérifié sur les données réelles du jeu (`demo-talent-filters-coverage.spec.ts`).' +
    ' Élargi une seconde fois le 26/09/2026 (épopée #2990, #2182.55, « FILTRE : PREUVES ») : tranché sans Louis pour l’interprétation (le mot avait trois lectures — CV, références, source d’une compétence ; celle qui a déjà un critère SERVEUR nommé ailleurs dans le code, `isSkillSourceProven`, gagne). VIDE À DESSEIN dans cette salle : `demo-seed.service.ts:3291` sème CHAQUE compétence en `declared` (ou `cv` pour la dernière de la stack, marquée à vérifier, #2328.24) — AUCUNE en `mission` ni `interview`, parce qu’aucune des sept fiches de démonstration ne porte de compétence rattachée à une affectation ou un entretien réel dans ce jeu de données. Semer une compétence « prouvée » sans la mission ou l’entretien qui la prouve serait exactement la donnée fictive que la doctrine interdit — pas un trou de ce lot, une conséquence du jeu de données actuel. Le filtre reste réel et testé en SQL (`talent.service.spec.ts`) ; cette salle précise n’a simplement personne à lui montrer aujourd’hui. Verrouillé par `demo-talent-filters-coverage.spec.ts`.',
}

/**
 * `consultants.tjm_metadata` (#2948, #2329.12/.13/.14/.16, TALENT READINESS) —
 * devise, source, contexte, date d'observation, confidentialité du TJM,
 * distinctes du montant lui-même (`tjm`).
 *
 * Livré lot g12 (26/09/2026, colonne + contrat `tjmMetadataSchema` + porte
 * `finance:read` en écriture/lecture), mais jamais semé : la vérification du
 * même jour (commentaire de bilan #2948) l'a nommé comme le seul manque
 * restant pour que la fiche consultant montre l'axe sous permission
 * `finance:read` en démonstration.
 */
export const DEMO_TALENT_TJM_METADATA_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'Semé le 27/09/2026 (#2948, tranche prioritaire de la vague FINIR) : TROIS profils sur sept de `DEMO_CONSULTANTS` portent désormais `tjm_metadata`, chacun sur un axe différent du contrat — Hakim Barreau (déclaré par le consultant, non confidentiel, cas ordinaire), Yanis Berthier (confidentiel, source « grille salariale interne », l’axe #2329.16 a une fiche à montrer sous `finance:read`), Antoine Rivière (daté loin dans le passé — `observed_at` porte le fait qu’un TJM ressaisi tel quel reste vieux de sa date d’observation, pas de sa dernière écriture). Les quatre autres profils restent `null` À DESSEIN : « non renseigné » est l’état ordinaire d’une colonne qui vient de s’écrire, pas un défaut à combler pour sept fiches. `DemoSeedService.seedVivier` convertit `observed_at_days_ago` (décalage en jours, même patron que `last_contact_days_ago`) en date ISO au semis — une date figée dans le code aurait vieilli au fil des relectures de ce fichier. Verrouillé par `demo-talent-tjm-metadata-coverage.spec.ts`. MàJ 27/09/2026 (lot #2329.42/.44) : l’écran manquant est construit — `TalentRatesTab` relit désormais `tjm_metadata` (devise/source/contexte/date/confidentialité) et lève le badge « contexte historique » sur Antoine Rivière (260 jours > `TJM_HISTORICAL_AFTER_DAYS`, 180) — plus un champ seedé sans appelant.',
}

/**
 * LES SEPT OBJECTIFS COMMERCIAUX du `/dashboard` personnel (lot FA,
 * #2114.16 à .27, 18/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CIBLE — SEEDÉE SUR LES SEPT AXES
 * ─────────────────────────────────────────────────────────────────────────────
 * `member_objectives` est déjà classée SEEDÉE plus haut (cockpit manager). Les
 * quatre colonnes que ce lot ajoute (`target_qualified_needs`,
 * `target_placements`, `target_margin_percent`, `target_consultants_on_mission`)
 * rejoignent le MÊME semis (`DEMO_MEMBER_OBJECTIVE`, `demo-dataset.ts`) plutôt
 * que d'en ouvrir un second — sans cette extension, quatre des sept lignes du
 * nouveau bloc auraient affiché « objectif non fixé » devant un prospect alors
 * que la donnée existe déjà côté serveur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE RÉALISÉ — CALCULÉ, PAS SEMÉ, ET C'EST LÀ QUE LA MARGE RESTE HONNÊTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les sept « réalisé » se calculent sur les tables déjà seedées
 * (`user_actions`, `accounts`, `opportunities`, `project_needs`, `missions`,
 * `mission_assignments`) : aucune table neuve, donc rien à classer ici pour
 * elles-mêmes. Un seul axe mérite d'être nommé : `daily_cost` n'est écrit par
 * AUCUN semis (le pipeline de missions de démonstration ne pose que
 * `daily_rate` — voir `seedDeliveryClient`), donc la MARGE réalisée de la
 * salle de démonstration rend `achieved: null` avec `coverage: { measured: 0,
 * total: N }` plutôt qu'un pourcentage. **Ce n'est pas un vide à combler par ce
 * lot** : `daily_cost` reste un champ jamais saisi en démonstration depuis
 * l'origine (la maquette n'a pas de coût de mission à montrer), et forger un
 * coût maintenant serait la donnée inventée que la doctrine interdit. La
 * carte affiche donc « non mesurée » sur cet axe précis — un état réel du jeu
 * de démonstration, pas un défaut de ce lot.
 */
export const DEMO_COMMERCIAL_OBJECTIVES_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'Les sept cibles sont seedées sur `member_objectives` (`DEMO_MEMBER_OBJECTIVE`). Le réalisé se calcule sur des tables déjà seedées ; seule la marge rend `achieved: null` (jamais 0) parce qu’aucun semis n’écrit `missions.daily_cost` — un état réel du jeu de démonstration, nommé par la carte plutôt que masqué.',
}

/**
 * LA PARITÉ DÉMO DES CONTACTS « À QUALIFIER » (#1473, 03/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA GARDE PAR TABLE N'AURAIT PAS VU
 * ─────────────────────────────────────────────────────────────────────────────
 * `contacts` est classée SEEDÉE depuis des mois : la garde par table ne pose
 * donc aucune question sur ce lot. Or ce chantier n'ajoute pas une table, il
 * ajoute une FORME dans une table déjà pleine — une ligne dont `account_id` est
 * `null`. Sans semis, l'onglet « À qualifier » de `/contacts` s'ouvre vide en
 * démonstration, la case « Je ne connais pas encore l'entreprise » de la modale
 * de création ne se montre sur rien, et la colonne « Entreprise » n'affiche
 * jamais son libellé d'absence. C'est exactement la situation que la craft rule
 * n°9 décrit : une capacité livrée qui se découvre vide en réunion.
 *
 * DEUX fiches (`DEMO_UNQUALIFIED_CONTACTS`), et non une : une liste d'un seul
 * élément ne se lit pas comme une file de travail.
 *
 * ⚠️ CE QU'ELLES NE PORTENT PAS, À DESSEIN — périmètre, script d'appel,
 * cadence, message de relance, signaux, activité. Les six se DÉDUISENT du
 * dossier (`demo-contact-profile.ts`), et il n'y a pas de dossier. Les
 * fabriquer écrirait un script d'appel qui ne parle d'aucune société : une
 * donnée inventée, montrée à un prospect. `contact_score` vaut 0 pour la même
 * raison, et la fiche ne l'affiche pas comme un jugement — le score se calcule
 * CONTRE un dossier, il n'y a rien à calculer.
 *
 * `demo-unqualified-contacts-coverage.spec.ts` RECOMPTE tout ceci sur le jeu de
 * données plutôt que de croire ce paragraphe : un audit documentaire n'est pas
 * le code.
 */
export const DEMO_UNQUALIFIED_CONTACTS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#1473 — `contacts.account_id` est nullable depuis la migration `1791601447382-ContactWithoutAccount`, et la salle porte DEUX contacts « à qualifier » (`DEMO_UNQUALIFIED_CONTACTS` : Camille Roussel, rencontre de salon ; Sofiane Berthier, recommandation sans société). Ils remplissent l’onglet « À qualifier » de `/contacts`, la colonne « Entreprise » qui affiche son libellé d’absence, et la fiche contact sans dossier. Ils passent par `demoContactRow`, l’unique porte d’écriture de la table — un second chemin aurait fait diverger les fiches. Ils NE portent PAS de périmètre, de script d’appel, de cadence, de message de relance, de signaux ni d’activité : ces six-là se déduisent du dossier, et il n’y en a pas ; les fabriquer montrerait à un prospect un script qui ne parle d’aucune société. Aucune ENTITÉ ne leur est rattachée non plus — une entité est la BU d’un compte, leur en poser une les ferait apparaître au comité d’une entreprise choisie au hasard. Recompté par `demo-unqualified-contacts-coverage.spec.ts`, qui vérifie AUSSI que `demo-seed.service.ts` écrit réellement `account_id: null` et que les deux fiches ne sont pas rattachées.',
}

/**
 * LA PARITÉ DÉMO DE L'ACCROCHE QUI NOMME SA RAISON MANQUANTE (#2648.1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA GARDE PAR TABLE N'AURAIT PAS VU
 * ─────────────────────────────────────────────────────────────────────────────
 * `contacts` est classée SEEDÉE depuis des mois, et #2648.1 n'ajoute ni table ni
 * clé `raw_analysis` : il ajoute un CODE D'ERREUR HTTP (`insufficient_context`,
 * `apps/ia/app/routers/icebreaker.py`) qu'aucune donnée de la salle ne pouvait
 * jamais déclencher. Les six dossiers réels donnent tous un `title` à leurs
 * contacts, et les deux contacts « à qualifier » (`DEMO_UNQUALIFIED_CONTACTS`)
 * portent `decision_role: 'unknown'` — une chaîne non vide, donc VRAIE pour le
 * `contact.get("title") or contact.get("decision_role")` du moteur. Un visiteur
 * qui cliquait « Générer » sur n'importe quel contact de la salle recevait donc
 * toujours trois accroches, jamais l'écran qui nomme l'information manquante :
 * la chaîne moteur → enveloppe → écran était livrée, mais invisible en
 * démonstration — exactement la craft rule n°9.
 *
 * UN contact (`DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_CONTACT` : Corentin Fabre,
 * numéro laissé au standard d'un salon), délibérément SÉPARÉ de
 * `DEMO_UNQUALIFIED_CONTACTS` — cette liste-là garantit `title` non vide sur
 * chaque fiche (`demo-unqualified-contacts-coverage.spec.ts`), une garantie que
 * ce contact violerait par construction. `account_id: null` comme les contacts
 * « à qualifier » : la seule façon de garantir `recent_signals` vide sans
 * toucher aux signaux des six dossiers réels, qui servent d'autres
 * démonstrations.
 *
 * ⚠️ PIÈGE ÉVITÉ : `title` ET `entity` vides tous les deux auraient laissé la
 * porte d'IDENTITÉ fermée (`isContactIdentityComplete`, `@bellum/contracts` :
 * nom complet + une ancre parmi title/entity/linkedin_url) — le bouton
 * « Générer » de `ContactIcebreakers.tsx` serait resté DÉSACTIVÉ, et personne
 * n'aurait jamais pu cliquer jusqu'à `insufficient_context`. `entity:
 * 'Consultant indépendant'` fournit l'ancre SANS jamais entrer dans la
 * condition du moteur (qui n'inspecte que `title`/`decision_role`) : un fait
 * vrai sur la personne, pas une entreprise-employeur fabriquée.
 *
 * `demo-icebreaker-insufficient-context-coverage.spec.ts` RECOMPTE tout ceci
 * sur le jeu de données plutôt que de croire ce paragraphe.
 */
export const DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#2648.1 — aucun contact de la salle ne pouvait déclencher `insufficient_context` (`apps/ia/app/routers/icebreaker.py`) : les six dossiers réels donnent tous un `title`, et `DEMO_UNQUALIFIED_CONTACTS` porte `decision_role: 'unknown'` (chaîne non vide). `DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_CONTACT` (Corentin Fabre, numéro laissé au standard d’un salon) porte `title: ''` ET `decision_role: null`, `account_id: null` (donc `recent_signals` vide) — les trois conditions exactes du moteur. `entity: 'Consultant indépendant'` tient l’ancre d’IDENTITÉ (`isContactIdentityComplete`) ouverte SANS entrer dans la condition du moteur, qui n’inspecte jamais `entity` — sans elle, le bouton « Générer » serait resté désactivé et personne n’aurait pu cliquer jusque-là. Un visiteur qui clique « Générer » sur sa fiche voit désormais `icebreakers.reasons.insufficientContext` (« Ni poste connu ni signal récent… »), pas le générique `icebreakers.unavailable`. Délibérément séparé de `DEMO_UNQUALIFIED_CONTACTS`, dont la garde exige `title` non vide sur chaque fiche. Recompté par `demo-icebreaker-insufficient-context-coverage.spec.ts`, qui vérifie AUSSI que `demo-seed.service.ts` écrit réellement le contact SANS compte et que l’identité reste COMPLÈTE malgré `title` vide.",
}

export const DEMO_SPRINT_BOARD_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '`accounts.sprint` (migration `1789996184270-AccountSprint.ts`) vaut `NULL` par défaut, délibérément. BEL-SC-228 (#3257, migration `1796373242104-SprintPortfolioDecision.ts`) ajoute EN FIN (GA-08) `watch` et `partner_route` aux quatre valeurs d’origine, plus cinq colonnes de décision générique (raison, effort estimé, date de revue, conditions de promotion/déclassement). Depuis le retrait du 01/10/2026 (Louis), les TROIS dossiers réels portent chacun un niveau — Société Générale en `no_go` (motif : direction informatique verrouillée), Groupe BPCE en `volume` (compte importé, non encore arbitré, sans mouvement), SNCF en `partner_route` (#3257.4, lot restes du 29/09) ; `focus`, `extension` et `watch` sont BLOQUÉS (un compte n’a qu’un niveau, les dossiers qui les portaient ont quitté la salle) jusqu’à l’arrivée d’ENGIE, TotalEnergies et Alstom, et `demo-sprint-board-coverage.spec.ts` se resserre toute seule à six dossiers. Décision Louis 04/10/2026 (plus aucune ESN fictive) : BNP Paribas porte la route partenaire AVEC partenaire lié — UNE ligne `account_partners` déclarée, CGI, ESN observée par son brief (`DEMO_SPRINT_PARTNER_ROUTE_PARTNER`), lue par le board — et SNCF la route partenaire SANS partenaire lié, qui dit « Partenaire à désigner » (#3296, garde `demo-sprint-board-coverage.spec.ts`). #3296 (#3269.6, lot I03 du 30/09) ajoute la PROPOSITION `suggested_switch`, lue au moment du board (jamais écrite) depuis `partner_name` : Groupe BPCE (`volume`) porte un partenaire déclaré, Sopra Steria, confirmée par son brief (`DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER`), et sa carte affiche « Suggestion : Route partenaire — … », sans qu’aucune ligne `sprint_switches` ne soit écrite. La prochaine action de chaque carte (#3257.7b) est la vraie prochaine tâche ouverte du compte, ou le lien « Programmer une prochaine action » quand rien n’est programmé. Les mouvements nommés vers et depuis `watch`/`partner_route` (#3257.8) sont des PROPOSITIONS (`shouldSwitch`), jamais écrites : aucune ligne à semer. Recompté par `demo-sprint-board-coverage.spec.ts`, qui vérifie aussi que `demo-seed.service.ts` écrit réellement les sept colonnes.',
}

/**
 * #2558.1 — UN BESOIN EXISTE SANS PROJET, en démonstration.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE MAILLE DE PLUS SUR `project_needs`
 * ─────────────────────────────────────────────────────────────────────────────
 * `project_needs` est classée SEEDÉE depuis longtemps (voir `DEMO_SEEDED_TABLES`)
 * — la garde PAR TABLE ne posait donc aucune question sur ce lot. Or la
 * capacité livrée le 18/09/2026 (migration `1795711263408-NeedWithoutProject`,
 * `OpenNeedsService.list` en `LEFT JOIN`, `POST /projects/needs`) n'ajoute pas
 * une table : elle ajoute une FORME — une ligne dont `project_id` est `NULL`.
 * Aucun semis ne l'exerçait : `seedOpenNeeds` et `seedStaffedNeed` rattachent
 * chacun de leurs rôles à `project.id`, sans exception. Une table remplie ne
 * dit rien de la RÉPARTITION de ce qu'elle contient, et c'est exactement cette
 * répartition que la capacité ajoute.
 */
export const DEMO_NEED_WITHOUT_PROJECT_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#2558.1 — `project_needs.project_id` est nullable depuis la migration `1795711263408-NeedWithoutProject` (vague J, 18/09/2026), qui déplace le lien vers le compte : `account_id` devient `NOT NULL`, `project_id` devient facultatif. La salle porte désormais UN besoin sans projet (`DEMO_DELIVERY_CLIENT.needWithoutProject` : « Data engineer — plateforme data », repéré via une alerte presse chez SNCF, `status: to_qualify`) écrit par `seedNeedWithoutProject` (`demo-seed.service.ts`) — une ligne À PART, jamais un besoin existant qu’on aurait privé de son projet. Il est visible sur `/projects/needs` (`OpenNeedsTable` affiche `account_name`, jamais un nom de projet) et sa fiche (`NeedDetailPage`) traite explicitement `need.project_id === null`. NI tarif cible NI budget : rien n’a encore été chiffré avec le client, jamais `0`. Recompté par `demo-need-without-project-coverage.spec.ts`, qui vérifie AUSSI que `demo-seed.service.ts` écrit réellement `project_id` en `NULL` littéral.',
}

/**
 * LA PARITÉ DÉMO DE « CRÉER UNE MISSION » (`/missions/nouvelle`, 31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CET ÉCRAN N'AJOUTE RIEN À SEMER — ET POURQUOI ÇA SE VÉRIFIE QUAND MÊME
 * ─────────────────────────────────────────────────────────────────────────────
 * L'écran est un FORMULAIRE : il n'ajoute aucune table, aucune colonne, aucune
 * clé de `raw_analysis`. La garde PAR TABLE ne lui pose donc aucune question —
 * et c'est exactement la situation où une capacité arrive vide en réunion sans
 * que rien ne rougisse.
 *
 * Car il lit UNE chose, et une seule : la liste des projets de rattachement, à
 * l'étape 1. ⚠️ Cette liste ne vient PAS d'une table `projects` — il n'en
 * existe aucune. `GET /projects` lit `opportunities`
 * (`ProjectsService.listForWorkspace`). Un besoin ne peut être créé QUE
 * rattaché à l'une d'elles (`POST /projects/:id/needs`) : une salle sans
 * opportunité rendrait l'assistant impossible à terminer, en démonstration
 * comme chez un client neuf, et l'écran s'ouvrirait sur « Aucun projet dans cet
 * espace pour l'instant ».
 *
 * La salle en porte plusieurs, semées pour d'autres raisons que celle-ci : le
 * projet signé du client d'exemple, son affaire ouverte, et les autres affaires
 * de son pipe. `demo-create-mission-coverage.spec.ts` les RECOMPTE sur le jeu
 * plutôt que de croire cette phrase — un audit documentaire n'est pas le code.
 */
export const DEMO_CREATE_MISSION_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '`/missions/nouvelle` n’ajoute NI table NI colonne : c’est l’assistant de `/projects/needs` par une seconde porte (`NeedWizard`, monté deux fois, jamais copié). La seule donnée qu’il lit est la liste des projets de rattachement de l’étape 1, servie par `GET /projects` — qui lit `opportunities`, table déjà classée SEEDÉE, et non une table `projects` qui n’existe pas. La salle porte au moins trois affaires (le projet signé de SNCF, son affaire ouverte, et son pipe), donc l’étape 1 s’ouvre remplie et l’étape 4 peut aboutir. Rien n’est semé POUR cet écran, et c’est le bon résultat : semer un projet de plus n’aurait montré que ce que la salle montrait déjà. Recompté par `demo-create-mission-coverage.spec.ts`.',
}

/**
 * « ET EN DÉMONSTRATION, LES QUATRE NOUVEAUX CHAMPS D'UNE CARTE MONTRENT QUOI ? »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE ENTRÉE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La garde PAR TABLE ne pose pas la question : les quatre champs ajoutés à une
 * carte de « Aujourd’hui » (`fact`, `context`, `preparedArtifacts`, `expiresAt`)
 * n'ajoutent AUCUNE table. Ils sont DÉRIVÉS, à la volée, de ce que le brief lit
 * déjà — l'agenda, la messagerie, les signaux, les tâches. C'est exactement le
 * silence qui fait découvrir un bloc vide en réunion plutôt qu'en CI, et le
 * bloc « depuis ta dernière visite » l'a déjà payé une fois.
 *
 * ⚠️ La distinction qui compte : un champ SEEDÉ porte une valeur non nulle sur
 * au moins une carte de la salle ; un champ « vide à dessein » rend `null` (ou
 * un tableau vide) sur TOUTES, et sa raison dit POURQUOI c'est le bon état — pas
 * « on n'a pas eu le temps ».
 *
 * ⚠️ Ne JAMAIS déplacer une entrée vers « vide à dessein » pour faire passer le
 * test : `demo-briefing-card-coverage.spec.ts` construit un vrai brief de salle
 * et RELIT les cartes, donc une entrée fausse dans un sens comme dans l'autre
 * fait rougir la CI.
 */
export const DEMO_BRIEFING_CARD_FIELDS: Readonly<
  Record<string, { state: 'seede' | 'vide_a_dessein'; reason: string }>
> = {
  fact: {
    state: 'seede',
    reason:
      'Toutes les cartes de la salle portent un fait sourcé. Les rendez-vous et le conflit viennent de `demoAgendaWindow` (capacité `agenda`, source `connector`, observée à l’instant de la LECTURE — un rendez-vous futur n’a pas d’autre date d’observation) ; les relances et les réponses favorables viennent de `demoThreads` (capacité `mailbox`, datées par `lastMessageAt`, qui est calculé depuis l’instant de la visite) ; les comptes à suivre portent `detectedAt`, ajouté à `demo-briefing.ts` pour ce lot précisément parce que, sans lui, la salle aurait affiché « date inconnue » sur chaque compte — c’est-à-dire l’état d’EXCEPTION du produit montré comme son état normal, devant un prospect.',
  },
  context: {
    state: 'seede',
    reason:
      'Le contexte est le CRITÈRE DE SÉLECTION de la carte, donc il existe partout où la carte existe : « il commence dans moins de 24 h » sur un rendez-vous, « ton dernier message remonte à N jours » sur une relance, « signal apparu dans les 48 dernières heures » sur un compte. Rien n’est à semer — il se dérive de la même donnée que le tri. La salle en montre au moins trois formes différentes, ce qui est le point : un contexte unique et générique se lirait comme une décoration.',
  },
  preparedArtifacts: {
    state: 'seede',
    reason:
      '#2106.2 — `buildBriefingActions` sait désormais préparer UN artefact honnête : la liste des participants EXTERNES d’un rendez-vous « à préparer », lue telle quelle sur l’évènement d’agenda (`meetingAttendeesArtifact`, dans `briefing-actions.ts`). Ce n’est ni un brouillon rédigé ni des questions suggérées — rien ici n’appelle de modèle — seulement le fait, déjà connu, qu’un ou plusieurs invités externes sont attendus. Les rendez-vous de démonstration à préparer (SNCF, Verdal Distribution, Pharmatek, Altiver Industries — `demo-agenda.ts`) portent chacun au moins un invité `external: true`, donc au moins une carte « à préparer » de la salle porte un `preparedArtifacts` non vide. Les quatre AUTRES familles de carte (conflit, réponse positive, relance, signal de compte) restent à `[]` dans ce même jeu : aucune n’a de donnée réelle à compiler, et rien n’est inventé pour elles.',
  },
  expiresAt: {
    state: 'seede',
    reason:
      'Les rendez-vous de `demoAgendaWindow` portent une heure de début, donc les cartes « à préparer » de la salle expirent à cette heure-là, et le conflit expire au début du premier des deux créneaux. Les comptes à suivre expirent à `detectedAt + FRESH_SIGNAL_HOURS`, c’est-à-dire à l’instant exact où la carte quitterait la liste. Les relances et les réponses favorables restent `null` DANS la salle comme en production, et c’est juste : un silence de neuf jours ne cesse pas d’être vrai à une heure connue. Un champ qui vaudrait une date sur toutes les cartes serait le signe qu’on a inventé une échéance plausible quelque part.',
  },

  // ───────────────────────────────────────────────────────────────────────────
  // #2095 / #2099 — LES SEPT FACETTES DU CONTRAT CANONIQUE DE CANDIDAT
  // ───────────────────────────────────────────────────────────────────────────
  businessObject: {
    state: 'seede',
    reason:
      'La carte « ce compte a bougé » est la seule famille de `buildBriefingActions` qui porte un objet ouvrable (son dossier `/accounts/$id`, vers lequel `href` menait déjà) ; les autres restent nulles pour une raison de fond : un conflit parle de deux créneaux, un rendez-vous ne résout son compte que dans `MeetingPrepDialog`, et un fil porte le NOM d’un interlocuteur sans son identifiant de contact. #3414 (02/10/2026) : la carte de compte (rang 5) était évincée par le plafond de `BRIEFING_ACTIONS_MAX` dès qu’une journée était pleine, donc nulle en salle ET chez tout utilisateur chargé — et la catégorie « prochain mouvement » de « Tes décisions » restait vide, tête identique pour les trois lectures. Le plafond garde désormais UNE carte à potentiel (`nextMoveToKeep`, `briefing-actions.ts`) en cédant la place de la relance la moins prioritaire : le même mécanisme pour la salle et pour un vrai brief, jamais un semis scripté.',
  },
  confidence: {
    state: 'seede',
    reason:
      'La salle montre DEUX niveaux différents, et c’est tout l’intérêt : `verified` sur ce qui vient d’un connecteur qui fait foi sur sa propre donnée (les rendez-vous, le conflit, les relances, les réponses favorables), `inferred` sur les signaux de compte, que nos services déterministes DÉDUISENT et que personne ne nous a rapportés. Un prospect voit donc que le produit distingue ce qu’il a vu de ce qu’il a déduit — la distinction qui justifie qu’un signal frais descende derrière un engagement pris (#2095.72). Un niveau unique sur toutes les cartes se lirait comme une décoration, et un pourcentage se lirait comme une probabilité, refusée six fois.',
  },
  rankingAxes: {
    state: 'seede',
    reason:
      'Chaque carte de la salle nomme les SEPT axes du classement, en marquant ceux qu’elle a pu peser et ceux qu’elle n’a pas pu — jamais à zéro (GA-18 / GA-19). Les familles n’ont pas le même jeu : une réponse favorable est la seule qui pèse la conséquence commerciale, un signal de compte n’engage personne. C’est la démonstration de la doctrine en deux moitiés, sur l’écran d’accueil : sous un score, un axe non évaluable reste NOMMÉ et SORT du dénominateur. Aucune valeur ne sort, jamais : dire quels axes ont pesé explique le rang sans exposer de poids interne (#2095.83, #2099.48).',
  },
  processingState: {
    state: 'seede',
    reason:
      'Toutes les cartes de la salle sont `suggested`, et c’est exactement ce qu’elles sont : la salle est remise à neuf entre deux visites, donc personne n’a encore consulté, préparé, planifié ni refusé quoi que ce soit. Les huit autres états existent au contrat (#2099.33 à #2099.41). Depuis le 28/09 (#2099.17-.32, épopée #2767), les gestes Reporter / Pas pertinent / Déjà traité existent sur chaque carte et fonctionnent EN SALLE, en direct, sur ces mêmes cartes semées : ils s’écrivent dans les préférences PERSONNELLES du visiteur (`user_preferences.briefingCardDispositions`) et `buildDemo()` retire la carte au rendu suivant, exactement comme en production — rien à semer de plus. Semer un état avancé sur une carte que personne n’a touchée serait la donnée fictive que la doctrine interdit, et ferait croire à un historique que la salle n’a pas.',
  },
  verdict: {
    state: 'seede',
    reason:
      'L1 (#2095.59, 31/10/2026) — le verdict est posé par genre de carte (`sayWhatIsKnown`, `briefing-actions.ts`) : une phrase par famille qui dit QUOI RETENIR (« un des deux rendez-vous doit bouger », « un oui attend ta réponse »), jamais un fait nouveau. Les cinq cartes scriptées de la salle (conflit, rendez-vous, réponse, relance, compte) le portent donc exactement comme en production — aucune table de plus, rien à semer : il dérive du genre de la carte.',
  },
  consequence: {
    state: 'vide_a_dessein',
    reason:
      'La conséquence métier (#2099.7) est ce qui arrive si on ne fait rien. L1 (#2095.85, 31/10/2026) la remplit pour les SEULES familles dont le fait la porte mécaniquement — fin de mission, paiement en retard, CRA manquant, facture bloquée, contact au rebond… (`CONSEQUENCE_KINDS`, `briefing-actions.ts`). En salle, ces familles passent par les lectures SQL de `BriefingService.buildDemo` sur le jeu semé (missions, factures), hors de portée de ce harnais qui ne rejoue que le brief SCRIPTÉ. Les cinq cartes scriptées (conflit, rendez-vous, réponse, relance, signal de compte) n’ont, elles, AUCUNE conséquence sue : déduire « tu risques de perdre ce client » d’un silence serait la donnée inventée que la doctrine interdit. Le champ reste nul sur elles, à dessein.',
  },
  estimatedMinutes: {
    state: 'vide_a_dessein',
    reason:
      'Le temps estimé (#2099.12) demande une mesure que rien dans le produit ne fait : personne ne chronomètre combien coûte une relance ou une préparation de rendez-vous, et aucune table ne porte d’historique de durée. Écrire « 15 min » sur une relance et « 30 min » sur une préparation serait un chiffre plausible et faux, qui se lirait comme une mesure — exactement le défaut que le contrat refuse en interdisant `0` sur ce champ. Le champ reste nul, l’écran n’affiche aucune ligne, et il se remplira le jour où une durée sera OBSERVÉE plutôt que devinée.',
  },

  // ───────────────────────────────────────────────────────────────────────────
  // #2095.19 / #2095.34 / #2993 — LES DEUX DERNIERS CHAMPS DU CONTRAT DES 23
  // ───────────────────────────────────────────────────────────────────────────
  owner: {
    state: 'seede',
    reason:
      '`BriefingService.buildDemo` porte le lecteur de la salle exactement comme la production (`ownerId: userId`, `briefing.service.ts`) : chaque carte de la salle rend donc son `owner`, non nul. Le brief reste strictement individuel (doctrine `c76_role_reordonne_jamais_ne_filtre`, Louis 21/09/2026) — `owner` vaut TOUJOURS le lecteur, jamais un tiers, en salle comme en production. Aucune table de plus : le champ est reporté depuis l’identifiant de session, jamais lu nulle part.',
  },
  permission: {
    state: 'vide_a_dessein',
    reason:
      'L1 (#2095.34, 31/10/2026) — la permission n’est plus une constante : elle est LUE au catalogue des écrans (`routeContractFor`) pour l’écran que la carte ouvre (`cardPermission`, `briefing-actions.ts`). MESURÉ sur les trente familles : aucune n’ouvre aujourd’hui un écran qui exige un droit distinct de celui du lecteur (fiches compte, contact, mission, consultant, projet, intégrations, messagerie — tous ouverts à tout membre au catalogue). `null` est donc une valeur SUE sur toute la salle, lue et non supposée : le champ se remplira de lui-même le jour où une carte ouvrira un écran sous permission.',
  },
}

/**
 * LA MÉMOIRE COLLECTIVE, croisement par croisement (01/09/2026 ; écran supprimé le
 * 14/10/2026, il ne reste que les croisements du bandeau Collaboration de la fiche).
 *
 * Une entrée « seede » veut dire : un prospect qui ouvre l'écran voit ce bloc
 * rempli. Une entrée « vide_a_dessein » dit ce qu'on a REGARDÉ et pourquoi le
 * vide est le bon état — jamais « on a oublié », et jamais un déplacement de
 * confort pour faire passer une garde.
 *
 * ⚠️ #4158.13 (14/10/2026) — LA DÉCISION PRODUIT QUE CE BLOC ATTENDAIT A ÉTÉ PRISE (Louis) :
 * la salle compte trois collègues fictifs (`DEMO_COLLEAGUES`), créés comme le compte de
 * l'occupant (sans mot de passe, domaine réservé). Les croisements restent vides À CE JOUR
 * parce que leur lecture n'est pas celle de ce lot, plus parce qu'un collègue serait un vrai
 * compte. Ce qui suit décrit l'état d'AVANT.
 *
 * ⚠️ Les QUATRE croisements étaient vides, et la raison était structurelle, pas un
 * arbitrage : un croisement nomme un COLLÈGUE, donc exige une seconde ligne
 * dans `workspace_members` ET dans `profiles`, et les deux portent une clé
 * étrangère DURE vers `auth.users(id)`. Un collègue de démonstration serait donc
 * un vrai compte d'authentification — un identifiant qui se connecte, sur une
 * salle partagée et remise à neuf entre deux visites. On ne le fait pas.
 *
 * Ce qui reste montré, et qui est l'essentiel du chantier : le principe
 * (« le pont, pas le dossier »), ce qui reste privé, la politique de l'espace,
 * et la MESURE — qui est réelle, calculée sur des lignes réellement écrites.
 *
 * Ce qu'il faudrait pour lever le vide : un second occupant dans la salle,
 * c'est-à-dire une décision produit sur les comptes d'authentification de
 * démonstration. Elle n'a pas été prise, et ce lot ne la prend pas.
 */
export const DEMO_COLLECTIVE_MEMORY_BLOCKS: Readonly<
  Record<string, { state: 'seede' | 'vide_a_dessein'; reason: string }>
> = {
  // Louis 14/10/2026, refonte Pilotage (L0a) : l'écran « Mémoire collective »
  // est supprimé. Les quatre blocs qui n'existaient QUE sur lui (le principe,
  // ce qui reste privé, la politique de l'espace, les mises en relation du mois)
  // sortent de ce registre avec lui — retirés, jamais déplacés vers « vide à
  // dessein ». Restent les croisements, que le bandeau Collaboration de la
  // fiche compte affiche toujours.
  croisementG1: {
    state: 'vide_a_dessein',
    reason:
      'Un croisement nomme un collegue ; workspace_members et profiles ont une cle etrangere DURE vers auth.users, donc un collegue de demo serait un vrai compte qui se connecte. La salle a un seul occupant.',
  },
  croisementG4: {
    state: 'vide_a_dessein',
    reason:
      'Meme cause que G1 : la collision de prospection designe un AUTRE membre, et un second membre exige une ligne auth.users que la salle de demonstration ne cree pas.',
  },
  croisementG9: {
    state: 'vide_a_dessein',
    reason:
      'Meme cause que G1 : l intercontrat rapproche deux PORTEURS, donc un besoin porte par quelqu un d autre, donc un second compte d authentification.',
  },
  croisementG11: {
    state: 'vide_a_dessein',
    reason:
      'Le fait d acces existe bien en demo, mais le croisement pointe le role Sales Ops, qui doit etre porte par un membre : meme blocage auth.users que les trois autres.',
  },
}

/**
 * LA PROSPECTION INVERSÉE VERS LE MARCHÉ, DEPUIS UN CONSULTANT (§6.2, BEL-ATS-010).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CETTE ENTRÉE A CHANGÉ D'ÉTAT À LA FUSION DU 01/09, ET C'EST LE POINT
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle disait « vide à dessein », et sa raison était juste au moment où elle a
 * été écrite : `territory_snapshots` est PARTAGÉE entre tous les espaces, la
 * salle n'y écrivait rien, `knownDepartments()` rendait donc `[]` et le marché
 * répondait `zones_unresolved` pour les sept profils du vivier.
 *
 * Elle portait même un interdit exprès : « ne JAMAIS faire remonter cette
 * entrée à `seede` en insérant des lignes fictives dans `territory_snapshots` ».
 * L'interdit visait la bonne chose — une photo inventée dans une table partagée
 * fait mentir la moyenne de TOUT LE MONDE.
 *
 * Un autre lot de la même vague (« Marché détaillé ») a résolu l'objection sans
 * la contourner : la colonne `source` sépare les lignes. Les photos de la salle
 * portent `'demo'`, les relevés réels portent `'sweep'`, et chaque lecteur
 * choisit. Ce qui était interdit — mélanger — le reste ; ce qui devient possible
 * est de montrer un marché à un prospect sans qu'aucun client ne le voie.
 *
 * ⚠️ Ce n'est PAS ce lot-là qui l'a rendu vrai pour cet écran. `ReverseMarketService`
 * ne filtrait sur aucune source : il lisait toutes les lignes, donc un client
 * suivant la Haute-Garonne ou le Rhône aurait vu le décor de la salle présenté
 * comme un relevé de marché. L'aiguillage `isDemoWorkspace` y a été posé à la
 * fusion, comme `market-watch.controller.ts` le faisait déjà. Deux lots justes
 * séparément ; c'est leur rencontre qui fabriquait la donnée fictive.
 *
 * CE QUE LA SALLE MONTRE MAINTENANT : Camille Roussel porte `'69'` en plus de
 * `'IDF'`, et le Rhône est l'un des deux départements dont la salle seed trois
 * photos. Sa fiche rend donc une demande réelle, des recruteurs classés et une
 * borne de collecte — la capacité entière, sur de la donnée que la salle
 * assume. `'IDF'` ne désigne aucun département et reste `unresolvedZones` : le
 * cas « zone non résolue » est montré EN MÊME TEMPS que le cas nominal.
 */
export const DEMO_REVERSE_MARKET_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "Camille Roussel porte `'69'` (Rhône) en plus de `'IDF'`, et `DEMO_TERRITORY_SNAPSHOTS` seed TROIS photos du Rhône avec `source = 'demo'`. `knownDepartments('demo')` y lit donc `['31', '69']`, `departmentsFromZones` résout `'69'`, et la fiche rend la demande, les recruteurs classés et la borne de collecte. `'IDF'` reste dans `unresolvedZones`, à dessein : la salle montre le cas nominal ET le cas « zone non résolue » sur le même écran. Le cloisonnement est tenu par la colonne `source` — `ReverseMarketService` aiguille sur `isDemoWorkspace`, comme `market-watch.controller.ts`, si bien qu'un espace client ne lit QUE les relevés `'sweep'`. Vérifié par `demo-reverse-market-coverage.spec.ts`.",
}

/**
 * #3816 (lot C4, 07/10) — « TROUVE-MOI DES MISSIONS POUR CE PROFIL » DANS LAURA, EN DÉMONSTRATION.
 *
 * Aucune table, aucune clé : l'outil lit le marché inversé (`DEMO_REVERSE_MARKET_COVERAGE`). Ce qui
 * manquait n'était pas la zone mais le RECOUPEMENT : les relevés démo du Rhône classaient java, sap,
 * cloud, et la fiche de Camille Roussel n'en porte aucun — l'outil n'aurait relié AUCUN recruteur à
 * son profil. `kubernetes` rejoint les trois photos du Rhône. Le fil scripté de la salle
 * (`demo-chat-script.ts`) rend la même carte. Vérifié par `demo-missions-c4-coverage.spec.ts`.
 */
export const DEMO_MISSIONS_FOR_PROFILE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "Camille Roussel porte `'69'` et `Kubernetes` ; les trois photos démo du Rhône (`DEMO_TERRITORY_SNAPSHOTS`, `source = 'demo'`) classent `kubernetes` et relèvent deux recruteurs (sii, alten). L'outil `find_accounts_for_talent` relie donc deux comptes à son profil, chacun avec sa raison ; le fil scripté de la salle rend la même carte, avec ses suites (analyse, contacts, message). #4421.13 (24/10) : comme en production (#4421.10), chaque compte hors espace montre ses personnes trouvées dans le tour, à vérifier, et le mail préparé pour la première — personnes SIMULÉES écrites dans le fil scripté (`demo-chat-script.ts`), aucune table semée : en production elles ne deviennent pas non plus des contacts de l'espace.",
}

/**
 * #3865.2 (lot X05, 08/10) — « QUELS BESOINS COMPATIBLES AVEC CE CONSULTANT ? » EN DÉMONSTRATION.
 *
 * Aucune table, aucune clé : `InverseMatchingService.matchTalent` lit `project_needs` et le
 * vivier, déjà seedés pour `run_matching` (le besoin phare EXISTE pour montrer son classement DIRECT
 * — besoin → profils ; ce lot en montre l'INVERSE — profil → besoins, sans second semis). Camille
 * Roussel porte `Kubernetes` ET `Terraform` ; le besoin phare SNCF (« Ingénieur infrastructure —
 * socle conteneurisé du portail », `DEMO_DELIVERY_CLIENT.openNeeds`) les exige TOUS LES DEUX,
 * `required: true`, statut `matching` (encore ouvert). L'outil `find_needs_for_talent` range donc ce
 * besoin dans un compartiment autre qu'« écarté » pour son profil. Vérifié par
 * `demo-needs-for-talent-coverage.spec.ts`.
 */
export const DEMO_NEEDS_FOR_TALENT_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "Camille Roussel porte `Kubernetes` ET `Terraform` ; le besoin phare SNCF les exige tous les deux (`required: true`), statut `matching` (encore ouvert) — `InverseMatchingService.matchTalent` le range donc dans un compartiment autre qu'« écarté » pour son profil, sans aucun semis supplémentaire (même donnée que `run_matching`, direction inverse).",
}

/**
 * #3823 (lot C4, 07/10) — « MISSIONS POUR CE COMPTE » EN TÊTE DE L'ONGLET OPPORTUNITÉS, EN DÉMONSTRATION.
 *
 * Aucune table, aucune clé : le bloc DÉRIVE des lignes `opportunities` et des `contacts` du compte,
 * déjà seedés. La salle porte une demande CONFIRMÉE, sourcée et datée, avec ses deux interlocuteurs
 * simulés — elle rend une mission avec « Préparer le message » ; le programme nommé et sourcé rend la
 * seconde. Vérifié par `demo-missions-c4-coverage.spec.ts`.
 */
export const DEMO_ACCOUNT_MISSIONS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "`DEMO_DELIVERY_CLIENT.signalsAndNeedsCases` sème une demande confirmée (`stage: confirmed`, source `client`, datée) avec deux interlocuteurs, et un programme nommé et sourcé (`Rapport annuel 2025`) : le bloc « Missions pour ce compte » en dérive deux missions fondées sur un signal daté et sourcé, avec les contacts connus du compte en clair. Les lignes sans source (les deux déductions génériques) n'en produisent aucune, à dessein.",
}

/**
 * LES QUATRE ÉTATS DE RÉSULTAT DE DÉCOUVRIR (#1766, 09/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE ENTRÉE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La garde PAR TABLE ne pose aucune question sur `/discover` : l'écran n'a ni
 * table ni colonne ni clé de `raw_analysis` à lui. Il rend un ÉTAT, déduit de ce
 * que la recherche vient de répondre — et c'est exactement la situation où une
 * capacité arrive vide en réunion sans que rien ne rougisse.
 *
 * Le lot #1766 ajoute un TROISIÈME état de résultat, user-facing : « Résultat
 * non vérifiable », quand zéro entreprise remonte ALORS QU'une source est
 * tombée ou qu'une homonymie n'a pas pu être tranchée. Il remplace le bandeau
 * « Résultats partiels — les entreprises ci-dessous restent exactes » qu'un
 * client a vu au-dessus d'une liste vide.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA SALLE MONTRE, ET CE QU'ELLE NE PEUT PAS MONTRER
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois des quatre états sont atteignables en démonstration sans rien semer :
 * ils se déduisent de la réponse réelle des sources publiques (registre, BOAMP,
 * DECP, offres d'emploi), que la salle interroge comme n'importe quel espace —
 * explorer ne coûte aucun crédit, et `/discover` n'a pas de jeu de données à
 * lui.
 *
 * Le quatrième — « Résultat non vérifiable » — exige qu'une source EXTERNE soit
 * en panne au moment de la visite. On ne le seed pas, et il n'y a pas de bon
 * moyen de le faire :
 *
 * · fabriquer une entrée `degraded` de démonstration afficherait « France
 *   Travail : accès refusé » alors que la source répond parfaitement. C'est de
 *   la donnée fictive sur l'état d'un service tiers, montrée à un prospect —
 *   exactement ce que le dépôt s'interdit ;
 * · et la montrer en permanence ferait découvrir le produit par son état
 *   d'EXCEPTION : un visiteur conclurait que Découvrir ne trouve rien.
 *
 * ⚠️ Ce vide-là n'est donc pas un oubli, et il n'est pas non plus un écran
 * muet : quand rien n'est tombé, la salle affiche la liste ou l'état vide
 * honnête, qui sont les états NORMAUX. Cette entrée passera à `seede` le jour
 * où la démonstration saura simuler une panne de source SANS l'affirmer comme
 * réelle — une décision produit qui n'a pas été prise, et que ce lot ne prend
 * pas.
 */
export const DEMO_DISCOVER_RESULT_STATES: Readonly<
  Record<string, { state: 'seede' | 'vide_a_dessein'; reason: string }>
> = {
  resultatsListes: {
    state: 'seede',
    reason:
      'La salle interroge les mêmes sources publiques que tout espace (registre, marchés publics, offres d’emploi) — explorer ne consomme aucun crédit et `/discover` n’a aucun jeu de données propre. Un visiteur qui lance une recherche voit de vraies entreprises.',
  },
  resultatsPartiels: {
    state: 'seede',
    reason:
      'Le bandeau « Résultats partiels » se déclenche sur une entrée `degraded` renvoyée par les sources elles-mêmes : la salle l’affiche exactement quand un vrai quota ou une vraie coupure survient, comme chez un client. Rien à semer, et rien à simuler.',
  },
  aucuneCorrespondance: {
    state: 'seede',
    reason:
      'L’état « aucune entreprise ne correspond » s’atteint en démonstration avec n’importe quel croisement de filtres trop étroit (un code NAF rare dans un département rare). Il est produit par la recherche, pas par un jeu de données.',
  },
  // #2550.1 (18/09/2026) — deux raffinements du MÊME état vide, nommés
  // séparément à l'écran (`discoverEmptyReason`) pour ne pas laisser lire
  // « aucune entreprise ne correspond » quand le vrai motif est un critère
  // que le registre n'a pas su poser, ou un empilement de filtres.
  secteurNonExprime: {
    state: 'seede',
    reason:
      'Comme « aucune entreprise ne correspond », cet état s’atteint avec le même registre public : choisir un secteur que le registre ne sait pas exprimer comme critère (`unappliedFields`, déjà lu par `unappliedFilters`) suffit à le produire — aucune entrée fictive, aucune panne simulée.',
  },
  filtresEmpiles: {
    state: 'seede',
    reason:
      '#3878.1 (08/10/2026) — ce diagnostic n’est plus déduit du NOMBRE de critères actifs sur une recherche vide : il se déclenche désormais quand les résultats EXISTENT (la source a répondu) mais que les affinages d’écran — fit, famille, classe d’accessibilité… — les masquent tous (`visible.length === 0` alors que `candidates.length > 0`, un FAIT mesuré par `Discover.tsx`, pas une supposition). La salle atteint cet état avec le même registre public et les mêmes affinages que tout espace, sans rien semer.',
  },
  criteresIncoherents: {
    state: 'seede',
    reason:
      '#3878.1 (08/10/2026) — remplace, pour la recherche restée à ZÉRO résultat, le comptage « plus d’un critère actif » qui accusait les filtres sans preuve. `detectInconsistentFilters` ne tranche que deux cas PROUVABLES sans appel réseau : un secteur à la fois coché et exclu, ou un CA minimum au-dessus du maximum. Les deux se composent dans le même rail que tout espace réel — aucune entrée fictive, aucune panne simulée.',
  },
  // #3941.5 (17/10/2026) — filtre « Augmentation de capital » sans annonce.
  aucuneAugmentationCapital: {
    state: 'seede',
    reason:
      '#3941.5 (17/10/2026) — le filtre « Augmentation de capital » du rail ne garde que les cartes portant une annonce BODACC B datée ; quand aucune entreprise des critères n’en a, l’écran dit « Aucune augmentation de capital récente » au lieu de rendre des cartes sans le signal. La salle interroge le même registre public que tout espace : l’état s’atteint en cochant ce filtre sur une zone étroite, sans entrée fictive.',
  },
  // #4317.2 (19/10/2026) — compétences posées sans aucune entreprise qui les montre.
  competencesSansCorrespondance: {
    state: 'seede',
    reason:
      '#4317.2 (décision Louis n°3, 19/10/2026) — le champ « Compétences » FILTRE sur les offres et la technologie observée ; quand aucune entreprise des critères ne montre la compétence posée, l’écran dit « Aucune entreprise ne montre « X » » et propose d’élargir, au lieu d’un vide anonyme. La salle interroge les mêmes sources publiques que tout espace : l’état s’atteint en posant une compétence rare sur une zone étroite, sans entrée fictive.',
  },
  // #4627 (26/10/2026) — la liste est vide alors que des comptes ont été trouvés : tous écartés par la
  // qualification ou masqués par l'utilisateur, aucun filtre d'affichage en cause (`emptyListReason`).
  tousEcartes: {
    state: 'seede',
    reason:
      '#4627 (26/10/2026) — « Tous les comptes trouvés sont écartés » se lit quand la recherche a ramené des comptes mais qu’aucun ne reste après exclusion et masquages (`emptyListReason`, `Discover.tsx`). En démonstration, masquer chaque carte d’une recherche semée (`DEMO_DISCOVER_SAVED_VIEWS`, masquage local de `useDiscoverShortlist`) suffit à le produire : même geste, même écran que sur un espace réel, aucune entrée fictive.',
  },
  // #5203 (lot 786, 03/11/2026) — le filtre « Besoins connus » (période Récents/Anciens) retire toutes les cartes :
  // l'écran le dit et compte les cartes retirées (`needsFilteredOut`, `DiscoverStates.tsx`).
  filtreBesoinsVide: {
    state: 'seede',
    reason:
      '#5203 (lot 786, 03/11/2026) — « Aucune carte ne porte de besoin dans cette période » se lit quand le filtre « Besoins connus » retire toutes les cartes d’une recherche (`needsFilteredOut`). La salle lance la même recherche réelle que tout espace et le filtre lit les besoins de l’espace de démonstration : choisir « Anciens » sur une recherche dont aucune carte ne porte de besoin ancien produit cet écran, même geste et même écran que chez un client, sans aucune entrée fictive.',
  },
  resultatNonVerifiable: {
    state: 'vide_a_dessein',
    reason:
      'Le troisième état (#1766) demande qu’une source EXTERNE soit tombée pendant la visite. Le seeder voudrait dire fabriquer une entrée `degraded` — donc afficher « cette source n’a pas répondu » sur un service qui répond, à un prospect, sur l’état d’un tiers : de la donnée fictive, et sur le sujet le plus sensible qui soit (la fiabilité de nos sources). Le montrer en permanence serait pire encore : le produit se découvrirait par son état d’exception. La salle reste donc sur les trois états normaux, qui sont atteignables et vrais. Passera à `seede` le jour où la démonstration saura SIMULER une panne en la nommant comme telle — décision produit non prise à ce jour.',
  },
  // #2490 / #2496 (17/09/2026) — la LECTURE de la demande en langage naturel
  // (`discover_request_reading.py`) et son état « Précise ta demande ».
  demandeIllisible: {
    state: 'vide_a_dessein',
    reason:
      'Dans la salle, la liste de Découvrir est SCRIPTÉE (`demoDiscoverResponse`, `ia-proxy.controller.ts`) : le moteur, qui lit la demande avant d’interroger le registre, n’est pas appelé, et le texte libre ne filtre pas la liste scriptée. Afficher « Précise ta demande » ou « Résultats filtrés sur Toulouse » y décrirait une lecture qui n’a pas eu lieu — une trace fictive du moteur, montrée à un prospect. La salle montre la liste scriptée, qui est son état normal ; l’état et la note de lecture se voient sur un espace réel, dès la première phrase tapée.',
  },
}

/**
 * #2470 / #2471 — LES DEUX GESTES QUE LAURA PROPOSE, ET CE QUE LA SALLE EN
 * MONTRE (16/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE ENTRÉE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux retours du MÊME client bêta, la même minute : « un GO devrait entraîner
 * une recherche directement et que ça alimente la conversation plutôt qu'à
 * forcer à aller sur la page découvrir » (#2470) et « proposer découvrir pour un
 * tour d'horizon mais aussi et surtout une vraie analyse pour aller au fond de
 * free et de ses filiales » (#2471). Le lot livre donc DEUX gestes nommés dans
 * la même réponse.
 *
 * La garde PAR TABLE ne pose aucune question dessus : ces gestes n'ont ni table,
 * ni colonne, ni clé de `raw_analysis`. C'est exactement la situation où une
 * capacité arrive vide en réunion sans que rien ne rougisse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA SALLE MONTRE, ET PAR QUEL CHEMIN
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ En démonstration, le copilote ne joint JAMAIS le moteur : `POST /ia/chat`
 * refuse une salle (`ia-proxy.controller.ts`, « les réponses de Laura sont
 * préparées à l'avance »), et les réponses vivent côté navigateur
 * (`apps/web/src/features/demo/demo-chat-script.ts`). C'est donc là que les deux
 * gestes se montrent — et c'est là que la garde va les lire. Corollaire à
 * connaître : `run_account_search` ne peut PAS s'exécuter dans une salle, donc
 * le registre réel n'y rend jamais d'entreprise.
 */
export const DEMO_LAURA_GESTURES_COVERAGE: Readonly<
  Record<string, { state: 'seede' | 'vide_a_dessein'; reason: string }>
> = {
  tourHorizon: {
    state: 'seede',
    reason:
      'L’amorce « Fais-moi un tour d’horizon des industriels de plus de 250 salariés » rend une carte `account_ranking` complète, avec ses axes et ce qui n’a pas pu être évalué. Les entreprises citées sont celles de la recherche scriptée de la salle (suffixe « (démo) », `demo-scripts.ts`) : les mêmes que sur /discover, jamais des sociétés réelles — le registre ne répond pas à une salle, et inventer des noms sans les nommer fictifs serait de la donnée fictive.',
  },
  analyseDeFond: {
    state: 'seede',
    reason:
      'Le second geste est NOMMÉ dans la même réponse préparée, avec ce qu’il coûte (« celle-là coûte des crédits, et je t’annonce le montant exact avant de lancer ») — c’est précisément ce que #2471 réclamait. Le LANCEMENT, lui, reste hors de la salle : une analyse débite des crédits et occupe le moteur plusieurs minutes, et `analysis` n’est pas ouvert en démonstration. Nommer le geste sans le lancer est la vérité du produit ici, pas un contournement.',
  },
  // LUDOVIC-D LC.6 — Laura sur le moteur de Découvrir, « avec qui appeler ».
  appelsQuiRecrutent: {
    state: 'seede',
    reason:
      'L’amorce « Trouve-moi des industriels en Auvergne-Rhône-Alpes qui recrutent en méthodes ou qualité, avec qui appeler » (`p-call-hiring`) rend une carte `account_ranking` où chaque entreprise cite son signal daté et la personne à appeler, ou « Personne connue : à trouver — Trouver qui appeler ». Entreprises et personnes suffixées « (démo) » : le registre ne répond pas à une salle.',
  },
}

/**
 * #2165.7 à #2165.10 — LES QUATRE TYPES DE RÉSULTAT DE `/discover`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE SECONDE ENTRÉE À CÔTÉ DE `DEMO_DISCOVER_RESULT_STATES`
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce sont deux questions distinctes, et les fondre ferait perdre la seconde.
 * Un ÉTAT répond à « la recherche a-t-elle abouti ? » (liste / vide / non
 * vérifiable) ; un TYPE répond à « la recherche portait sur quoi ? » (comptes /
 * personnes / besoins / partenaires). Un type neuf peut arriver vide en salle
 * alors que les quatre états, eux, sont parfaitement couverts.
 *
 * Et comme `/discover`, aucun des quatre n'a de table à lui : trois sont des
 * LECTURES de la réponse que les sources publiques viennent de rendre, le
 * quatrième relit `contacts`, déjà semée. La garde PAR TABLE ne pose donc
 * aucune question — c'est exactement la situation où une capacité arrive vide
 * en réunion sans que rien ne rougisse.
 *
 * ⚠️ Aucune entrée n'est `vide_a_dessein` ici, et c'est une information : les
 * quatre types se démontrent. Le jour où un cinquième type demanderait un jeu
 * de données propre, il devra écrire sa raison ICI avant de partir.
 */
export const DEMO_DISCOVER_RESULT_TYPES: Readonly<
  Record<string, { state: 'seede' | 'vide_a_dessein'; reason: string }>
> = {
  accounts: {
    state: 'seede',
    reason:
      'Inchangé : la salle interroge les mêmes sources publiques que tout espace (registre, marchés publics, offres d’emploi). Un visiteur qui lance une recherche voit de vraies entreprises, et explorer ne consomme aucun crédit.',
  },
  contacts: {
    state: 'seede',
    reason:
      '`contacts` est une table SEMÉE de la salle (voir `DEMO_SEEDED_TABLES`) : la liste de personnes de Découvrir relit exactement celle que l’écran Contacts affiche déjà, avec les mêmes portraits, les mêmes fonctions et les mêmes rôles décisionnels. Rien de neuf à semer, et surtout rien à inventer — une recherche de personnes HORS de l’espace supposerait une source que la doctrine refuse (pas de scraping, tome 2), donc la salle montre ce que le produit sait vraiment faire.',
  },
  needs: {
    state: 'seede',
    reason:
      'Une ligne de besoin EST un signal daté de la réponse — même objet, autre lecture. Tout ce que la salle sait déjà produire (une recherche avec une source d’intention cochée : appels d’offres, marchés attribués, recrutements) remplit cette liste sans qu’un octet soit semé. Quand la recherche ne rend aucun signal, l’écran le DIT (« aucun signal daté »), ce qui est l’état honnête et pas un trou.',
  },
  partners: {
    state: 'seede',
    reason:
      'Une ligne de partenaire est un candidat dont le code d’activité RÉSOLU désigne une ESN : elle sort de la même réponse, sans jeu de données propre. La salle l’atteint comme n’importe quel espace, en cherchant sur les activités informatiques ou en lisant le marché ESN d’un territoire. Les entreprises dont le code n’a pas été résolu sont comptées à part et dites à l’écran — le vide, quand il arrive, est nommé.',
  },
  // #2545.5 — le tableau d'appels ne sème RIEN de neuf : il croise deux
  // lectures déjà classées ci-dessus. `accounts` interroge le registre RÉEL
  // même en démo, et plusieurs comptes déjà semés de la salle (Société
  // Générale, Groupe BPCE, SNCF) sont de VRAIES
  // entreprises : les chercher par leur nom dans Découvrir les retrouve dans
  // le registre, et le tableau les croise alors avec les contacts déjà semés
  // du même compte. Une recherche par secteur/zone qui ne retombe sur aucun
  // de ces comptes reste VISIBLE : chaque entreprise qualifiée forme sa ligne
  // même sans personne connue, colonnes nommées non mesurées — jamais un
  // écran vide silencieux.
  calls: {
    state: 'seede',
    reason:
      'Dérivée de `accounts` (registre réel, même en démo) et `contacts` (table déjà semée) : chercher un compte déjà semé par son nom (Société Générale, Groupe BPCE, SNCF) le retrouve dans le registre réel et le tableau le croise avec ses contacts déjà semés. Sans correspondance, la ligne entreprise reste affichée avec ses colonnes personne nommées non mesurées. #3819 (démo Ludovic 08/10) — la source est désormais UNIQUE (`POST /contacts/call-list`, onglet Contacts et liste d’appels lisent la même réponse : dix personnes CLASSÉES du compte rapproché, coordonnées en clair, signaux historisés). La vue PAR DÉFAUT de la salle porte Naval Group (compte réel des briefs, deux recrutements datés) sous le nom exact du compte semé : ses personnes et leurs coordonnées remplissent la liste d’appels sans aucun geste. Les signaux historisés (`signal_history`) restent vides à dessein en démo (voir sa ligne) : les signaux montrés sont ceux, datés, de la réponse scriptée. Vérifié par `demo-discover-call-list-coverage.spec.ts`.',
  },
}

/**
 * « ENVIRONNEMENTS STRUCTURELLEMENT COMPATIBLES » (#1625) — LA TROISIÈME
 * LECTURE DE LA FICHE CONSULTANT. VIDE À DESSEIN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE ENTRÉE EXISTE, ET POURQUOI ELLE N'A PAS DE TABLE À CLASSER
 * ─────────────────────────────────────────────────────────────────────────────
 * `CompatibleEnvironmentsSection` (`ReverseMarketPage.tsx`) lit `GET
 * /companies/market-context-search`, qui relaie TEL QUEL
 * `MarketMemoryService.searchByFilters`. Elle n'a ni table ni colonne à elle :
 * la garde PAR TABLE (`DEMO_SEEDED_TABLES` / `DEMO_INTENTIONALLY_EMPTY`) ne
 * pose donc aucune question à son sujet, et c'est exactement la situation où
 * une capacité arrive vide en réunion sans que rien ne rougisse — d'où cette
 * entrée séparée, sur le même principe que `DEMO_DISCOVER_RESULT_STATES`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI REND CE BLOC STRUCTURELLEMENT DIFFÉRENT DE « MARCHÉ EXTERNE »
 * ─────────────────────────────────────────────────────────────────────────────
 * `DEMO_REVERSE_MARKET_COVERAGE` (juste au-dessus dans ce fichier) est
 * `seede` : sa lecture dépend de `territory_snapshots`, une table SANS
 * `workspace_id` que la salle a l'autorisation de semer. Celle-ci dépend
 * DIRECTEMENT des quatre tables de la mémoire marché — `market_company_signal`,
 * `market_esn_client`, `market_company_stack`, `market_ex_esn_at_client` —
 * qui, elles, ne le sont JAMAIS (#1633/#1635, GA-258) : elles sont PARTAGÉES
 * entre tous les espaces, et y semer trois lignes de démonstration les
 * injecterait dans le corpus que lisent de vraies ESN CONCURRENTES.
 *
 * Ce que la salle montre dépend donc entièrement du corpus RÉEL et de ce que
 * la zone / les compétences de la fiche de démonstration y recoupent — un
 * fait qu'aucun poste de développement ne peut lire à l'avance (voir
 * `MARKET_TECHNO_UBIQUITY_MAX_SHARE` dans `market-techno-affinity.ts`, qui
 * documente la même impossibilité). Le bloc peut donc s'ouvrir sur son état
 * vide honnête (« Aucun environnement structurellement compatible ») devant
 * un prospect, exactement comme devant un client — ce n'est pas un trou de
 * semis, c'est la même vérité que la mémoire marché rend partout ailleurs.
 */
export const DEMO_COMPATIBLE_ENVIRONMENTS_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    '« Environnements structurellement compatibles » lit `MarketMemoryService.searchByFilters`, donc les quatre tables PARTAGÉES de la mémoire marché (GA-258, #1633/#1635 — elles sont nommées dans le commentaire ci-dessus et dans `table-scopes.ts`, jamais dans du code hors de `market-memory/`) — jamais seedées, jamais seedables : y écrire trois lignes de démonstration les injecterait dans le corpus que lisent de vraies ESN concurrentes. Si la zone ou les compétences de la fiche de démonstration ne recoupent aucune entreprise du corpus réel à au moins MARKET_MEMORY_MIN_PATHS parcours, le bloc s’ouvre sur son état vide honnête — ce n’est pas un trou de semis, c’est la même vérité que voit un client. Vérifié par `demo-compatible-environments-coverage.spec.ts`.',
}

/**
 * #2288.2 — « ET EN DÉMONSTRATION, LA COLONNE "SIGNAL ACTUEL" MONTRE QUOI ? »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA QUESTION SE POSE PARCE QUE LA COLONNE EST DÉSORMAIS VIVANTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Jusqu'au 18/09/2026 elle recevait `null` sur chaque ligne, faute de source
 * datée par entreprise. Elle reçoit maintenant une date TRANCHÉE — exacte pour
 * ce que l'espace a lui-même observé, au MOIS pour ce qui vient d'ailleurs
 * au-dessus du seuil de trois espaces contributeurs, ABSENTE en dessous.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX VERROUS, ET AUCUN N'EST UN TROU DE SEMIS
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. La colonne ne s'affiche que sur une LIGNE du bloc qui l'héberge, et ce
 *    bloc est déjà classé « vide à dessein » juste au-dessus
 *    ({@link DEMO_COMPATIBLE_ENVIRONMENTS_COVERAGE}) : ses lignes viennent de
 *    tables PARTAGÉES entre des ESN concurrentes, jamais seedables (GA-258).
 * 2. Même si une ligne sortait du corpus réel, la DATER exige que l'entreprise
 *    soit rapprochée d'un compte de la salle par son DOMAINE — et le compte
 *    d'exemple est fictif (`.example`), donc il ne rencontre aucun domaine réel.
 *
 * ⚠️ Et on ne SEMERA pas de date pour combler : une date inventée posée sur une
 * entreprise réelle est exactement la donnée que la doctrine interdit. Ce qui
 * EST semé, en revanche, c'est la matière première — les faits d'accès datés du
 * compte d'exemple — visible sur son onglet Accès : le mécanisme n'est pas
 * invisible en démonstration, seule sa projection dans le marché inversé l'est.
 */
export const DEMO_CURRENT_SIGNAL_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    'La colonne « Signal actuel » du marché inversé (#2288.2) date ce que la mémoire d’accès sait d’une entreprise : exacte pour ce que l’espace a lui-même observé, au mois pour ce qui vient d’ailleurs au-dessus du seuil de trois espaces contributeurs, absente en dessous. En démonstration elle ne porte jamais de date, pour deux raisons structurelles et non pour un oubli de semis. D’abord la même que le bloc qui l’héberge : elle ne s’affiche que sur une ligne rendue par `MarketMemoryService`, dont les tables sont PARTAGÉES entre des ESN concurrentes et jamais seedables (GA-258). Ensuite, dater une ligne exige que l’entreprise du corpus soit rapprochée d’un compte de la salle par son DOMAINE, ce qu’un compte d’exemple fictif (`.example`) ne peut pas être. Aucune date fictive n’est semée pour combler : posée sur une entreprise réelle, elle serait précisément la donnée inventée que la doctrine interdit. La matière première, elle, EST semée — les faits d’accès datés du compte d’exemple, visibles sur son onglet Accès — donc le mécanisme se montre en démonstration, seule sa projection dans le marché inversé reste vide. Vérifié par `demo-current-signal-coverage.spec.ts`.',
}

/**
 * #1938.4 — décision Louis 13/09 batch 13 : « ET EN DÉMONSTRATION, LA SECTION
 * SMS DE RÉGLAGES › NOTIFICATIONS MONTRE QUOI ? »
 *
 * `notification_sms_channels` est scopée par `user_id`, comme `user_daily_brief`
 * (voir l'en-tête de ce fichier) : hors du périmètre des tables purgées, donc
 * absente de {@link DEMO_INTENTIONALLY_EMPTY}. La question a pourtant sa réponse
 * écrite, et elle est plus forte qu'un « vide à dessein » : la table n'est
 * JAMAIS écrite pour une salle, parce que chaque route du canal pose d'abord la
 * question. Gardé par `demo-sms-channel-coverage.spec.ts`.
 */
export const DEMO_SMS_CHANNEL_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    'La section SMS de Réglages › Notifications est VISIBLE en démonstration, et inactive : badge « Inactif en démonstration », aucun type cochable, aucun numéro saisissable. Chaque route du canal (`NotificationsController` : lecture, demande de code, saisie du code, choix, retrait) interroge `isDemoWorkspace` AVANT de toucher `notification_sms_channels` — une salle est prêtée à un visiteur différent toutes les trente minutes, et un numéro de téléphone saisi là serait lu par le prospect suivant. Rien ne se seede non plus : un numéro fictif, même invalide, serait la donnée inventée que ce jeu s’interdit, et aucun fournisseur n’est branché de toute façon (hors démonstration, la même section dit « Bientôt disponible »). Aucun SMS ne part d’une salle, ni aujourd’hui ni le jour où le canal ouvrira.',
}

/**
 * #1938.3 — « ET EN DÉMONSTRATION, LE CANAL NOTIFICATION NAVIGATEUR MONTRE
 * QUOI ? »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL N'Y A NI EXPORT `DEMO_..._COVERAGE` NI TABLE À CLASSER ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrairement au canal SMS juste au-dessus (`notification_sms_channels`,
 * `user_id`), le canal navigateur n'écrit RIEN côté serveur — ni table, ni
 * colonne, ni route. Le réglage (« ce navigateur relaie-t-il ? ») vit dans le
 * `localStorage` du navigateur, exactement comme la permission
 * `Notification.permission` elle-même dont il dépend : les deux sont des
 * propriétés du NAVIGATEUR, pas du compte (voir le docblock de
 * `apps/web/src/features/notifications/browser-channel/browser-notification-channel.ts`).
 * Il est donc HORS du périmètre des deux gardes décrites en tête de ce fichier
 * (tables purgées ; clés de `raw_analysis`) par construction, comme
 * `user_daily_brief` et `laura_unrouted_intents` — sauf qu'ici il n'y a même
 * pas de table `user_id` à nommer : il n'y a rien à purger.
 *
 * La réponse à la question posée est donc plus forte qu'un « vide à dessein » :
 * **le canal se comporte IDENTIQUEMENT en démonstration et en production.**
 * Aucun `isDemoWorkspace` à poser puisqu'aucun appel réseau n'existe pour ce
 * canal — `showBrowserNotification` sort avant toute construction si le
 * réglage ou la permission manquent, et le relais (`BrowserNotificationRelay`)
 * ne fait que reporter, en notification native, ce que la cloche affiche déjà
 * (elle-même seedée et couverte depuis #1938.1). Un visiteur de la démo qui
 * active le canal reçoit donc exactement les notifications de démonstration
 * déjà seedées, sur son propre navigateur — rien d'inventé, rien de spécifique
 * à masquer. Gardé par `browser-notification-permission-is-a-gesture.test.ts`
 * (web) pour le geste, et par les tests de `browser-notification-channel.ts`
 * pour la dégradation stricte sans réseau.
 */

/**
 * #1627 — « BELLUM CONNAÎT DÉJÀ… », LA PREMIÈRE VALEUR MARCHÉ DE L'ONBOARDING.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE ENTRÉE EN PLUS DE CELLE DU VIVIER
 * ─────────────────────────────────────────────────────────────────────────────
 * `DEMO_COMPATIBLE_ENVIRONMENTS_COVERAGE` (juste au-dessus) classe la même
 * cause, mais depuis un autre écran et pour un autre visiteur : celle-là
 * s'ouvre sur une fiche de consultant, celle-ci sur l'écran de BIENVENUE — le
 * tout premier après le questionnaire, donc le premier qu'un prospect voit en
 * démonstration. Une raison qui ne nomme pas son écran se recopierait de l'une
 * à l'autre sans que personne ne s'aperçoive qu'une des deux n'a jamais été
 * posée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI DÉCIDE, ET QU'AUCUN POSTE DE DÉVELOPPEMENT NE PEUT LIRE À L'AVANCE
 * ─────────────────────────────────────────────────────────────────────────────
 * La carte lit `MarketMemoryService.searchByFilters`, donc les quatre tables
 * PARTAGÉES de la mémoire marché — jamais seedées, jamais seedables (GA-258,
 * #1633/#1635) : y écrire trois lignes de démonstration les injecterait dans le
 * corpus que lisent de vraies ESN CONCURRENTES. Ce que la salle montre dépend
 * donc de la zone déclarée dans le profil ESN de démonstration et du corpus
 * RÉEL.
 *
 * ⚠️ Et la carte ne rend RIEN quand le corpus ne répond pas — pas un état vide,
 * RIEN : c'est le retour lui-même qui l'exige (« si couverture insuffisante,
 * conserver le parcours onboarding actuel »). Une salle de démonstration dont
 * la zone ne recoupe rien montre donc l'écran de bienvenue d'avant ce lot,
 * intact, ce qui est exactement ce que verrait un client dans la même
 * situation — pas un trou de semis.
 */
export const DEMO_ONBOARDING_MARKET_AWARENESS_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    'La carte « Bellum connaît déjà… » de l’écran de bienvenue (onboarding, juste après le Profil ESN) lit `MarketMemoryService.searchByFilters`, donc les quatre tables PARTAGÉES de la mémoire marché (GA-258, #1633/#1635 — elles sont nommées dans le commentaire d’en-tête de ce fichier et dans `table-scopes.ts`, jamais dans du code hors de `market-memory/`) : jamais seedées, jamais seedables, parce que trois lignes de démonstration y seraient servies à de vraies ESN concurrentes comme un fait observé. Si la zone déclarée du profil de démonstration ne recoupe aucune entreprise du corpus réel à au moins MARKET_MEMORY_MIN_PATHS parcours, la carte ne s’affiche PAS DU TOUT — le retour #1627 l’exige (« couverture insuffisante : conserver le parcours onboarding actuel »), et l’écran de bienvenue reste celui d’avant ce lot. Vérifié par `demo-onboarding-market-awareness-coverage.spec.ts`.',
}

/**
 * #1617.4 — LE GESTE « DÉPARTAGER » DE LA FILE DE REVUE, EN DÉMONSTRATION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE ENTRÉE EXISTE EN PLUS DE CELLE DE LA TABLE
 * ─────────────────────────────────────────────────────────────────────────────
 * `market_company_resolution_override` est classée vide à dessein plus haut, et
 * sa raison porte sur ce qu'on ÉCRIRAIT. Celle-ci porte sur ce que le visiteur
 * VOIT, et les deux ne dépendent pas de la même chose : le geste s'affiche sur
 * les lignes de la file, et la file est remplie par les tables PARTAGÉES, pas
 * par la nôtre. Une salle où la table est vide peut parfaitement montrer le
 * geste — c'est même l'état nominal.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI DÉCIDE, ET QU'AUCUN POSTE DE DÉVELOPPEMENT NE PEUT LIRE À L'AVANCE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une ligne apparaît dans la file quand le corpus RÉEL ne sait pas départager
 * un des comptes d'exemple — deux entreprises qui portent le même nom, ou deux
 * qui partagent un domaine. C'est un fait du corpus, pas du semis, et c'est
 * exactement la situation déjà tranchée pour
 * {@link DEMO_COMPATIBLE_ENVIRONMENTS_COVERAGE} : on ne fabrique pas
 * l'ambiguïté, parce que la fabriquer voudrait dire écrire dans un corpus que
 * lisent de vraies ESN CONCURRENTES.
 *
 * L'état vide est donc honnête et il se DIT (« Aucun compte à départager »),
 * au lieu de faire disparaître le bloc — ce qui serait indiscernable d'une
 * panne de chargement.
 */
export const DEMO_MARKET_REVIEW_DECISION_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    'Le geste « c’est bien cette entreprise » / « ce n’est pas exact » s’affiche sur chaque ligne de la file « À départager » de /accounts/marches (ex-/pilotage/qualite). Cette file est remplie par `MarketMemoryService.portfolioFor`, donc par les tables PARTAGÉES de la mémoire marché (GA-258) : une ligne n’y apparaît que si le corpus RÉEL ne sait pas départager un des comptes d’exemple. Fabriquer cette ambiguïté supposerait d’écrire dans un corpus que lisent de vraies ESN concurrentes, ce que le produit refuse. Sans ambiguïté réelle, la file affiche son état vide honnête — la même vérité que voit un client, pas un trou de semis. Vérifié par `demo-market-review-decision-coverage.spec.ts`.',
}

/**
 * #1960.10 — « MES SIGNALEMENTS » EN DÉMONSTRATION (13/09/2026, craft rule n°9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE ENTRÉE EXISTE ALORS QUE LA GARDE PAR TABLE SE TAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * `beta_feedback` ne porte pas de `workspace_id` : elle est purgée par
 * l'AUTEUR (`DEMO_PURGE_USER_TABLES`), et `demo-coverage.spec.ts` ne classe que
 * les tables purgées par espace. Sans cette entrée, la question « et en démo,
 * cette page montre quoi ? » n'aurait pas de réponse écrite.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI RIEN N'EST SEMÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux signalements fictifs rempliraient la page et mentiraient deux fois :
 *  1. `beta_feedback` EST la file de tri de l'équipe — le back-office la liste
 *     ligne à ligne, et la santé des espaces y compte les signalements de bug.
 *     Un signalement semé y entrerait comme un vrai retour, dans chaque salle.
 *  2. L'état se lit EN DIRECT sur le service de tickets, par la référence. Une
 *     référence inventée désignerait le ticket RÉEL d'un autre client ; sans
 *     référence, la page ne pourrait écrire que « État indisponible ».
 *
 * Et un visiteur NE PEUT PAS en créer : `POST /feedback` refuse une salle de
 * démonstration avant toute écriture et tout appel au service de tickets
 * (`feedback.controller.ts`, même porte que le dépôt de document), et le widget
 * dit que la démonstration n'envoie pas de signalement. La page reste donc vide,
 * et son état vide le dit sans promettre un envoi qui n'aura pas lieu.
 */
export const DEMO_MY_REPORTS_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    'Réglages › Mes signalements liste les signalements de la personne connectée (`beta_feedback`, filtrée par l’auteur). En semer deux fictifs mentirait deux fois : cette table EST la file de tri de l’équipe — le back-office la liste ligne à ligne et la santé des espaces y compte les signalements de bug —, un signalement semé y entrerait comme un vrai retour ; et l’état se lit en direct sur le service de tickets par la référence : une référence inventée désignerait le ticket RÉEL d’un autre client, et sans référence la page ne pourrait écrire que « État indisponible ». Et un visiteur ne peut pas en créer : le signalement est refusé en salle de démonstration, avant toute écriture et tout appel au service de tickets (`POST /feedback`, même porte que le dépôt de document), et le widget dit que la démonstration n’envoie pas de signalement. La page affiche donc son état vide, qui le dit au lieu de promettre un envoi. La table reste purgée à la remise à zéro de la salle : une ligne ne passe jamais d’un visiteur au suivant. Vérifié par `demo-my-reports-coverage.spec.ts` et `feedback-demo-refusal.spec.ts`.',
}

/**
 * #1887 — LA PARITÉ DÉMO DE LA SUGGESTION D'ESN (11/09/2026, craft rule n°9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE ENTRÉE EXISTE ALORS QUE LA GARDE PAR TABLE SE TAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le champ « Nom de l'ESN » de l'onglet Partenaires propose désormais les noms
 * de `esn_directory`. Cette table est PARTAGÉE : elle ne porte aucun
 * `workspace_id`, `demo-reset.service.ts` la laisse volontairement en place, et
 * `demo-coverage.spec.ts` ne peut donc rien en dire — c'est le point aveugle
 * connu de la garde de parité (une table sans `workspace_id` ne peut produire
 * aucun rouge). Sans cette entrée, un champ de suggestion vide en réunion
 * passerait la CI sans un mot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI LA REMPLIT, ET QUAND
 * ─────────────────────────────────────────────────────────────────────────────
 * Rien n'est semé POUR la démonstration, et c'est le bon résultat : le
 * référentiel est le MÊME pour tout le monde. `EsnDirectoryService.suggest()`
 * appelle `ensureSeeded()` avant de lire — la salle de démonstration voit donc
 * les 477 noms dès la première frappe, y compris sur une base neuve où personne
 * n'a jamais ouvert Territoire.
 *
 * Ce qui peut être ABSENT en démonstration, et qui est honnête : le SIREN, la
 * ville et la tranche d'effectif d'une entrée que la résolution au registre n'a
 * pas encore traitée. La ligne se propose alors avec son seul nom — elle
 * n'écrit ni « 0 salarié » ni une ville devinée.
 */
export const DEMO_ESN_SUGGEST_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'La suggestion d’ESN du champ « Nom de l’ESN » (onglet Partenaires, #1887) lit `esn_directory`, table PARTAGÉE sans `workspace_id` — donc invisible pour la garde par table, et jamais purgée par la remise à neuf de la salle. Rien n’est semé POUR la démonstration : `EsnDirectoryService.suggest()` appelle `ensureSeeded()` avant de lire, et la graine `ESN_DIRECTORY_SEED` porte 477 noms réels. Taper « cap » propose donc Capgemini en démonstration exactement comme chez un client. Les faits qui départagent deux entrées (SIREN, ville, effectif) restent absents tant que la résolution au registre n’a pas eu lieu : la ligne se propose alors avec son seul nom, jamais avec une valeur de remplissage. Recompté sur la GRAINE par `demo-esn-suggest-coverage.spec.ts`.',
}

/**
 * #1889 — LA PARITÉ DÉMO DE LA PROFONDEUR DE L'ONGLET PROJETS (11/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE ENTRÉE EXISTE ALORS QUE LA GARDE PAR TABLE SE TAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * La barre d'outils de l'onglet Projets d'un dossier de compte — chercher,
 * séparer les projets des signaux, ne garder que ce qui est dans le pipe, ne
 * garder que ce qui n'a aucune tâche ouverte — n'ajoute AUCUNE table et AUCUNE
 * colonne. La garde par table ne lui pose donc aucune question, et une barre
 * d'outils dont aucune pastille ne change rien passerait la CI sans un mot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A DÛ ÊTRE SEMÉ, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * Toutes les lignes d'`opportunities` de la salle étaient des `besoin` à une
 * étape du PIPE. Trois des quatre facettes étaient donc INERTES en
 * démonstration :
 *
 *  · « Signaux » n'avait rien à montrer — l'onglet annonçait « 0 signal » ;
 *  · « Projets » ne retirait rien, pour la même raison ;
 *  · « Dans le pipe » ne retirait rien non plus, faute d'une seule ligne hors
 *    pipe.
 *
 * `DEMO_DELIVERY_CLIENT.detectedSignals` sème deux signaux — `kind: 'signal'`,
 * `stage: 'detected'`, sans montant ni échéance — ce qui rend les trois
 * exerçables d'un coup. La quatrième, « Sans prochaine action », l'était déjà :
 * le cadrage data du pipe n'a délibérément aucune tâche ouverte (#1325).
 *
 * ⚠️ Ces signaux ne touchent NI le pipe (`isPipelineStage` écarte `detected`)
 * NI l'entonnoir valorisé : ils sont comptés À PART, ce qui est exactement la
 * règle que le bandeau de l'onglet énonce.
 */
export const DEMO_ACCOUNT_PROJECTS_DEPTH_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'La barre d’outils de l’onglet Projets d’un dossier de compte (#1889 — chercher, Projets / Signaux, « Dans le pipe », « Sans prochaine action ») n’ajoute NI table NI colonne : la garde par table ne lui pose aucune question. Elle lit `opportunities`, déjà classée SEEDÉE, et `tasks.project_id` pour la prochaine action. Trois de ses quatre facettes étaient INERTES dans la salle, parce que toutes ses opportunités étaient des `besoin` à une étape du pipe : `DEMO_DELIVERY_CLIENT.detectedSignals` sème deux signaux (`kind: signal`, `stage: detected`, sans montant ni échéance) qui rendent « Signaux », « Projets » et « Dans le pipe » exerçables. « Sans prochaine action » l’était déjà — le cadrage data n’a délibérément aucune tâche ouverte. Recompté sur le JEU par `demo-account-projects-depth-coverage.spec.ts`.',
}

/**
 * #3278.2 (lot M11 09/10) — CRITÈRES DE ROUTE DÉCLARÉS (`accounts.declared_route_*`, six
 * colonnes, champs « Compléter la fiche », lus par Laura via le pont d'accès). Ni table ni
 * clé de `raw_analysis` : semés sur le seul compte FICTIF de la salle.
 */
export const DEMO_ACCOUNT_ROUTE_CRITERIA_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'Les six critères de route sans source structurée (#3278.2) sont des colonnes de `accounts`. Trois sont posés sur le client d’exemple fictif (`DEMO_DELIVERY_CLIENT.account.declared_route_scope` / `_objectives` / `_timing`, écrits par `seedDeliveryClient`) : la fiche les montre et Laura les cite comme critères évalués de la route. Les trois autres (rôles disponibles, partenaires, historique) restent vides À DESSEIN : la salle montre aussi qu’un critère non déclaré est NOMMÉ « non évalué », jamais rempli d’office. Les six dossiers réels restent sans déclaration : prêter un périmètre ou des objectifs à une société réelle serait une donnée inventée. #3278.1 (décision Louis 11/10/2026) ajoute deux colonnes sœurs, `declared_route_event` (route « événement ou communauté ») et `declared_route_inbound` (route « inbound / contenu ») : l’événement est semé sur le même client d’exemple fictif (`DEMO_DELIVERY_CLIENT.account.declared_route_event`, écrit par `seedDeliveryClient`), ce qui donne à Laura la route « événement ou communauté » ; le fait « inbound / contenu » reste vide À DESSEIN — un seul compte fictif porte les faits déclarés, et en poser deux ferait passer l’inbound (prioritaire) devant l’événement, donc la salle ne montrerait plus que l’une des deux routes. #3278.2b (Louis 15/10) ajoute trois critères DÉCLARATIFS : budget et disponibilité sont semés sur le même client fictif (`declared_route_budget` / `_availability`) ; `declared_route_network` (réseau existant) reste vide À DESSEIN, pour que la salle montre aussi « non renseigné ».',
}

/**
 * #219.6 (#3231, lot X50) — CLIENT INTERNE DÉCLARÉ (`accounts.declared_internal_client_mode`,
 * sélecteur de la fiche compte, lu par Laura et par le plan). Ni table ni clé de
 * `raw_analysis` : une COLONNE de plus sur `accounts`, semée sur le seul compte
 * FICTIF de la salle (SNCF, `DEMO_DELIVERY_CLIENT.account`) — jamais
 * sur l'une des six sociétés réelles, dont on n'invente pas la structure interne.
 */
export const DEMO_ACCOUNT_INTERNAL_CLIENT_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'La déclaration « client interne » (#219.6) est une colonne de `accounts`, posée sur le client d’exemple fictif (`DEMO_DELIVERY_CLIENT.account.declared_internal_client_mode`, insérée par `seedDeliveryClient`) : la fiche compte affiche le sélecteur rempli et Laura lit une direction interne qui sert des métiers. Ses QUATRE rôles sont nommés aussi (J05 : `declared_internal_sponsor`, `declared_internal_users`, `declared_legal_entity`, `declared_end_client`, mêmes `seedDeliveryClient`) : la fiche les montre sous « Compléter la fiche » et Laura les cite tels quels. Les six dossiers réels restent à « non déclaré » : prêter une structure interne à une société réelle serait une donnée inventée.',
}

/**
 * LE FUSEAU DE LA PERSONNE, EN DÉMONSTRATION (décision Louis, 14/09/2026 —
 * « ajouter un fuseau par utilisateur »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE ENTRÉE ALORS QUE LA GARDE PAR TABLE NE DIT RIEN
 * ─────────────────────────────────────────────────────────────────────────────
 * `timezone` est une COLONNE de plus sur `profiles`, une table qui existe
 * depuis l'origine : la garde par table ne pouvait poser aucune question, et
 * l'écran serait parti en démonstration avec un champ à remplir. C'est
 * exactement le défaut que la parité démo existe pour attraper — « un écran
 * livré mais vide en démo se découvre en réunion, pas en CI ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST SEMÉ, ET POURQUOI CETTE VALEUR-LÀ
 * ─────────────────────────────────────────────────────────────────────────────
 * `DEMO_OWNER.timezone` vaut `Europe/Paris`, écrit par
 * `DemoSeedService.restoreOwnerIdentity` à CHAQUE prise de bail, sur la même
 * ligne que le prénom. Ce n'est pas la recopie du défaut du produit : c'est le
 * fuseau de l'ESN fictive de la salle (Bellum Conseil, comptes et besoins
 * français). Réglages › Profil › Identité montre donc un fuseau renseigné.
 *
 * ⚠️ La salle n'adopte JAMAIS le fuseau du VISITEUR, et c'est la seule raison
 * pour laquelle ce semis est un vrai semis et pas une détection : une salle est
 * prêtée à quelqu'un d'autre toutes les trente minutes, et un fuseau écrit par
 * le visiteur précédent serait lu par le suivant (même cause que
 * `DEMO_SMS_CHANNEL_COVERAGE` pour le numéro de téléphone). Un visiteur PEUT le
 * corriger pendant son bail — c'est le geste que l'écran propose, et une
 * correction humaine gagne — et la remise à neuf du bail suivant le rétablit.
 */
export const DEMO_PROFILE_TIMEZONE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'Réglages › Profil › Identité porte le fuseau de la personne depuis le 14/09/2026, et `profiles.timezone` est une COLONNE de plus sur une table qui existe depuis l’origine : la garde par table ne pouvait rien en dire, et l’écran serait parti en démonstration avec un champ à remplir. `DEMO_OWNER.timezone` vaut `Europe/Paris` — le fuseau de l’ESN fictive de la salle (Bellum Conseil, comptes et besoins français), pas la recopie du défaut du produit — et `DemoSeedService.restoreOwnerIdentity` l’écrit à CHAQUE prise de bail, sur la même ligne que le prénom. La salle n’adopte JAMAIS le fuseau du visiteur : elle est prêtée à quelqu’un d’autre toutes les trente minutes, et un fuseau écrit par le visiteur précédent serait lu par le suivant (même cause que le numéro de téléphone du canal SMS). Un visiteur peut le corriger pendant son bail — c’est le geste que l’écran propose — et le bail suivant le rétablit. Vérifié contre le semis réel par `demo-profile-timezone-coverage.spec.ts`.',
}

/**
 * « ET LE FUSEAU DE L'ESPACE (#1958.2) MONTRE QUOI EN DÉMO ? » VIDE À DESSEIN
 * — AUCUN ÉCRAN NE LE RÈGLE ENCORE, ET LE CHAT DE DÉMO NE L'EXERCERAIT PAS
 *
 * `workspaces.timezone` (migration `1795205000000-WorkspaceTimezone`) et
 * l'escalier `resolve_applicable_timezone` (`apps/ia/app/prompts/current_time.py`,
 * personne → rendez-vous → espace → défaut produit) existent, sont lus et sont
 * testés — mais CE lot n'a livré aucun écran « Réglages › Espace › Fuseau »
 * (seuls `GET`/`PATCH /workspaces/timezone` existent, owner/admin). Semer une
 * valeur que rien n'affiche ferait mentir la salle sur un réglage que personne
 * n'a fait, exactement le défaut que la parité démo existe pour attraper.
 *
 * ⚠️ Et même posée, cette valeur ne changerait RIEN à ce qu'un visiteur observe
 * aujourd'hui : la bulle Laura de la salle de démo ne fait AUCUN appel réel au
 * service IA (`demoTurn`, #1942.2 — la même raison que
 * {@link DEMO_AUDIT_MARKET_MEMORY_COVERAGE} vide ci-dessus n'est pas
 * comparable, mais la conclusion est la même : rien à montrer). Le jour où un
 * écran règle ce fuseau, cette entrée bascule en `seede` avec sa valeur — pas
 * avant.
 */
export const DEMO_WORKSPACE_TIMEZONE_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    '`workspaces.timezone` (#1958.2, migration `1795205000000-WorkspaceTimezone`) et l’escalier `resolve_applicable_timezone` existent et sont testés, mais aucun écran ne le règle encore (seuls `GET`/`PATCH /workspaces/timezone` existent, owner/admin) : semer une valeur que rien n’affiche mentirait sur un réglage que personne n’a fait. Et même posée, la bulle Laura de la salle de démo n’appelle aucun modèle réel (`demoTurn`, #1942.2) : rien n’en dépendrait à l’écran aujourd’hui. Bascule en `seede` le jour où un écran règle ce fuseau.',
}

/**
 * « ET LE FUSEAU DU RENDEZ-VOUS DANS `schedule_reminder_for_contact` (#1958.3)
 * MONTRE QUOI EN DÉMO ? » VIDE À DESSEIN — LE CHAT DE DÉMO N'APPELLE AUCUN OUTIL
 *
 * `contacts.timezone` rejoint désormais l'escalier de résolution du rappel
 * (personne → rendez-vous → espace → défaut produit), mais c'est un
 * comportement d'OUTIL DE CHAT (`schedule_reminder_for_contact`,
 * `apps/ia/app/services/chat_tools.py`) : la salle de démo ne l'invoque
 * JAMAIS, quel que soit le contenu de la fiche contact — `demoTurn`
 * (#1942.2) ne fait aucun appel outil, aucun appel réseau. Semer un
 * `timezone` sur un contact de démo ne rendrait donc RIEN de visible ; ce
 * n'est pas un trou de semis, c'est la même limite que tout autre outil du
 * chat en salle de démo.
 */
export const DEMO_CONTACT_APPOINTMENT_TIMEZONE_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    '`contacts.timezone` rejoint l’escalier de `schedule_reminder_for_contact` (#1958.3), mais c’est un comportement d’OUTIL DE CHAT : `demoTurn` (#1942.2) n’invoque aucun outil et ne fait aucun appel réseau en salle de démo, quel que soit le contenu de la fiche contact. Semer un fuseau sur un contact de démo ne rendrait rien de visible — même limite que tout autre outil du chat en démo, pas un trou de semis.',
}

/**
 * L'ACTION PRINCIPALE DU HERO DE DOSSIER, EN DÉMONSTRATION (#2117.6, .25-29,
 * lot compagnon du hero — `heroPrimaryAction`, apps/web).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE ENTRÉE ALORS QUE LA GARDE PAR TABLE NE DIT RIEN
 * ─────────────────────────────────────────────────────────────────────────────
 * Le hero choisit UN état parmi CINQ (`DossierHeroState`, ajouté au contrat par
 * le lot #2117), et n'ajoute ni table ni colonne : `accounts.status`,
 * `commercial_status`, `priority_gate` et `raw_analysis` existent déjà. La
 * garde par table ne peut donc poser aucune question, et une salle où un seul
 * état serait atteignable montrerait le MÊME bouton sur les cinq dossiers — le
 * défaut d'origine que #2117 corrige à l'écran, reproduit côté démo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÉPARTITION, ET SA COHÉRENCE
 * ─────────────────────────────────────────────────────────────────────────────
 *  - `watching` (« Voir ce qui a changé ») — via `priority_gate: 'parked'`.
 *    ⚠️ BLOQUÉ depuis le retrait du 01/10/2026 : les deux dossiers qui portaient
 *    la porte `parked` ont quitté la salle, et un « pas maintenant » sur
 *    Société Générale, SNCF ou Groupe BPCE contredirait leur propre lecture.
 *    `demo-hero-state-coverage.spec.ts` constate l'attente tant que la salle a
 *    moins de six dossiers, et exige l'état dès qu'elle en a six.
 *  - `plan-active` (« Continuer la prochaine action ») — Société Générale
 *    et SNCF : chacune porte un `immediate_action` non vide dans
 *    `raw_analysis`, et aucune n'est `parked`.
 *  - `no-plan` (« Préparer le plan ») — Groupe BPCE : `commercial_status:
 *    'inbox'` (pas encore trié) et AUCUNE action dérivable
 *    (`immediate_action`, `quick_wins`, `action_plan` tous vides) —
 *    cohérent avec sa propre justification de sprint, déjà écrite avant ce
 *    lot, « cadence légère, SANS PLAN DE COMPTE ».
 *  - `analysis-incomplete` (« Terminer l'analyse ») — SEEDÉ depuis le 06/10/2026 (lot
 *    D01, #3666) : TotalEnergies est `analyzing` (lecture précédente lisible) ; les autres restent `completed`.
 *  - `meeting-booked` (« Préparer le rendez-vous ») — VIDE À DESSEIN : le
 *    déclencheur est le premier événement d'AGENDA du compte, et l'agenda
 *    d'une salle de démonstration est celui du visiteur, pas un fait qu'on
 *    peut semer sans qu'il devienne faux au premier bail suivant.
 *
 * Recompté sur le JEU, avec la MÊME décision que `heroPrimaryAction`
 * (réimplémentée sans import web → API, doctrine du dépôt) par
 * `demo-hero-state-coverage.spec.ts`.
 */
export const DEMO_HERO_STATE_COVERAGE: Readonly<Record<string, { state: 'seede' | 'vide_a_dessein'; reason: string }>> =
  {
    'analysis-incomplete': {
      state: 'seede',
      reason:
        "Lot D01 (06/10/2026, #3666) — TotalEnergies (la veille « pas maintenant » qu’aucune démonstration client n’ouvre) est semée `status: 'analyzing'` avec sa lecture de dossier DÉJÀ lisible : la fiche reste consultable et la carte de progression compacte dit « en cours » SANS pourcentage (le serveur répond `active` sans chiffre en salle, `AnalysisService.getStatus`). Le faucher d’analyses bloquées (`StuckAnalysisReaper`) ignore les espaces de démonstration : sinon le compte passerait en erreur au bout de vingt minutes. Aucune société fictive n’est créée (décision Louis 04/10/2026 : aucun compte fictif) — c’est l’état de NOTRE analyse qui est posé, jamais un fait sur la société.",
    },
    'meeting-booked': {
      state: 'vide_a_dessein',
      reason:
        'Le déclencheur est le premier événement d’AGENDA du compte — la seule échéance DATÉE du dossier. L’agenda d’une salle de démonstration est celui du visiteur du moment (bail de 30 minutes) : y semer un rendez-vous fixe deviendrait faux au bail suivant, ou daté dans le passé. Aucun dossier de démonstration ne porte de rendez-vous.',
    },
    watching: {
      state: 'seede',
      reason:
        "Un dossier `priority_gate: 'parked'` : la porte passe devant le plan, et son récit dit « pas maintenant ». Le hero y affiche « Voir ce qui a changé ». ⚠️ BLOQUÉ depuis le retrait du 01/10/2026 : aucun des trois comptes cibles ne peut honnêtement porter cette porte (Société Générale est prioritisée, SNCF et Groupe BPCE en attente de tri) ; l’état revient avec ENGIE, TotalEnergies ou Alstom, et la garde `demo-hero-state-coverage.spec.ts` le réexige à six dossiers.",
    },
    'plan-active': {
      state: 'seede',
      reason:
        "Société Générale et SNCF portent chacune un `immediate_action` non vide dans `raw_analysis` (`deriveImmediateAction` le trouve en premier), et aucune n’a `priority_gate: 'parked'`. Le hero y affiche « Continuer la prochaine action », NOMMÉE avec le texte de `immediate_action`.",
    },
    'no-plan': {
      state: 'seede',
      reason:
        "Groupe BPCE porte `commercial_status: 'inbox'` (pas encore trié côté commercial) et aucune action dérivable : `immediate_action: null`, `quick_wins: []`, et ni `plan.action_plan` ni `action_plan` au sommet — `deriveImmediateAction` rend `null`. Cohérent avec sa justification de sprint, déjà écrite avant ce lot, « cadence légère, sans plan de compte ». Le hero y affiche « Préparer le plan ».",
    },
  }

/**
 * #2119.8 → #2119.13 — LA PARITÉ DÉMO DE LA TÊTE DE SECTION « OPPORTUNITÉS ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE N'AJOUTE AUCUNE TABLE, ET POURQUOI ELLE SE CLASSE QUAND MÊME
 * ─────────────────────────────────────────────────────────────────────────────
 * Les trois cartes ne lisent RIEN de neuf : `GET /projects` (donc
 * `opportunities`, déjà classée SEEDÉE) et la tâche ouverte que la projection
 * attache à la ligne (`tasks.project_id`, seedée elle aussi). La garde PAR
 * TABLE ne leur pose donc aucune question — et c'est exactement le trou par où
 * un écran livré sort vide en démonstration.
 *
 * ⚠️ Le piège PROPRE à ce bloc : il se TAIT quand il n'a rien à mettre en tête.
 * Un semis qui ne porterait que des signaux, ou que des affaires closes, le
 * rendrait INVISIBLE en salle — et invisible ne se distingue pas de « pas
 * livré ». C'est ce que `demo-account-opportunities-top-coverage.spec.ts`
 * recompte sur le JEU.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA SALLE MONTRE VRAIMENT, AXE PAR AXE
 * ─────────────────────────────────────────────────────────────────────────────
 *  · le NIVEAU — les affaires du pipe sont à une étape du pipe, donc « Besoin
 *    exprimé » au moins : le barreau haut de l'échelle est exercé ;
 *  · le PÉRIMÈTRE — dans ses DEUX sens : une affaire porte un montant, l'autre
 *    n'en porte aucun et affiche « Périmètre non identifié », jamais « 0,00 € » ;
 *  · l'OFFRE — `primary_domain_code` est semé sur chaque affaire ;
 *  · l'ACTION — `nextAction` est semée comme une VRAIE tâche.
 *
 * Le quatrième axe, l'INTERLOCUTEUR, affiche son absence NOMMÉE (« Aucun
 * décideur identifié. ») : le BTMMP n'est pas semé. Ce n'est pas un trou de
 * parité déguisé — c'est un état VRAI du jeu, et c'est même la démonstration de
 * la règle qui porte tout le bloc : une valeur absente se NOMME, elle ne
 * s'affiche ni blanche ni « 0 ». Semer un décideur le cacherait.
 */
export const DEMO_ACCOUNT_OPPORTUNITIES_TOP_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'La tête de la section Opportunités d’un dossier (#2119.8 à .13 — au plus trois cartes, chacune avec son niveau de preuve, son périmètre, son interlocuteur, l’offre rapprochée et une action) n’ajoute NI table NI colonne : elle lit `GET /projects`, donc `opportunities` (déjà classée SEEDÉE) et la tâche ouverte attachée à la ligne (`tasks`, seedée aussi). Le niveau de preuve est DÉRIVÉ à la lecture, jamais stocké. La salle porte des affaires à une étape du pipe, avec domaine d’offre sur chacune et une prochaine action : le bloc apparaît, et au barreau haut de l’échelle. Le PÉRIMÈTRE y est exercé dans ses DEUX sens — une affaire porte un montant, l’autre n’en porte aucun et affiche « Périmètre non identifié », jamais « 0,00 € ». Le quatrième, l’interlocuteur, affiche son absence NOMMÉE parce que le BTMMP n’est pas semé — un état VRAI du jeu, qui démontre la règle du bloc plutôt que de la contourner. Recompté sur le JEU par `demo-account-opportunities-top-coverage.spec.ts`, qui sait dire non : vider `pipelineProjects` rend la tête invisible en salle.',
}

/**
 * « ET LA FILE « PISTES À QUALIFIER », ELLE MONTRE QUOI EN DÉMONSTRATION ? »
 * (#2172).
 */
/**
 * #4292.5 (Louis 29/10/2026) — LA « FILE DE PISTES » A UN NOM, ET LA SALLE LA REMPLIT.
 *
 * Elle existait sous trois noms (« Pistes de Laura », « Pistes à qualifier », « Pistes détectées sur tes
 * comptes ») : en démonstration, personne ne la trouvait. Une liste, un nom : le panneau du Pipe
 * (`/projects?pistes=1`) s'appelle « File de pistes » (`projects:detections.drawerTitle`) — GA-26, aucune
 * liste de plus. Elle lit `pipeline_detections` (semée, `seedPipelineDetections`) : un intérêt exprimé à
 * l'appel sur SNCF, une shortlist et un entretien lus dans la salle. Sans ces lignes, la file serait vide
 * devant un prospect.
 */
export const DEMO_FILE_DE_PISTES_COVERAGE: Readonly<{ state: 'seede'; name: string; reason: string }> = {
  state: 'seede',
  name: 'File de pistes',
  reason:
    '#4292.5 — la file de pistes (panneau du Pipe) lit `pipeline_detections` : `seedPipelineDetections` écrit trois passages « détecté, à revoir » (intérêt SNCF, shortlist, entretien), jamais l’affaire ni le positionnement — c’est le clic du visiteur qui les crée. Preuve : demo-pipeline-detections-coverage.spec.ts.',
}

export const DEMO_QUALIFICATION_LEADS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "La file « Pistes à qualifier » (#2172) n'ajoute qu'UNE table, `qualification_lead_decisions` — les pistes elles-mêmes se DÉRIVENT des lignes d'intake du dossier (`opportunities`, déjà seedée), jamais stockées, comme `evidence` depuis D27. La salle porte cinq signaux et deux lignes reprises d'un fichier : deux signaux sans domaine (« Signal isolé »), deux qui pointent vers le même domaine d'offre (« Convergence de signaux », le niveau qui ne se voit qu'à plusieurs faits) et une ligne importée à l'étape `detected` (« Piste issue du CRM ou d'un échange ») — trois niveaux de preuve différents, recomptés sur le jeu par `demo-qualification-leads-coverage.spec.ts` avec la fonction du contrat. La table, elle, porte UNE décision : le deuxième signal est écarté pour `bad_timing`, avec sa note et sa date, et il RESTE dans `opportunities` — c'est ce qui montre en réunion qu'un refus archive au lieu de supprimer, et qu'il est borné à l'espace (`scope` contraint à `workspace` en base). Une SECONDE décision (#3679) met le TROISIÈME signal en veille pour 21 jours, sans motif — la file montre ainsi ses trois états (active, en veille, écartée). Le CINQUIÈME signal (#2708.3, ajouté le 22/09) porte un libellé de ~420 caractères, isolé à dessein : c'est le seul moyen de revoir en réunion la ligne dense que `line-clamp-2` borne désormais (GA-385) — sans lui, la salle ne portait que des libellés courts et le défaut de #2708/#2692 restait invisible hors production. La garde sait dire non : retirer le domaine partagé, ou le semis d'écartement, la fait rougir.",
}

/**
 * #2118.45-47 — « ET LE NO-GO, IL SE VOIT OÙ EN DÉMONSTRATION ? »
 *
 * `evaluation.dossier_read.no_go` (contrat livré par le lot D1,
 * `score-sept-axes-contrat`) était NON SEEDÉ : les cinq comptes de la salle
 * étaient tous des PRUDENT, et en poser un aurait contredit la note et la
 * justification du même dossier (commit `f944062a8`, « Non seede : no_go »).
 *
 * Décision Louis du 14/09/2026 20:35 : la démonstration doit AUSSI montrer
 * comment l'outil dit non. Le compte no-go (réel) portait le cas complet : `no_go.temporary === true`,
 * un contexte DATÉ et sourcé (veille des offres d'emploi, communiqués
 * officiels), un déclencheur NOMMÉ (`demo-dossier-read.spec.ts` le vérifie).
 * Passe donc de « vide à dessein » à SEEDÉ.
 *
 * Re-semé le 01/10/2026 (Louis) : le seul compte no-go avait quitté la salle,
 * et le refus ne se re-sème PAS sur Société Générale, SNCF ou Groupe BPCE (un
 * `STOP` y contredirait leur lecture PRUDENT). TotalEnergies le porte : son
 * brief est hors IT, sans budget de prestation, et son arbitrage est `watch`.
 */
export const DEMO_DOSSIER_NO_GO_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "TotalEnergies (re-semé le 01/10/2026 — décision Louis : le compte no-go de la salle à six comptes) porte `evaluation.dossier_read.no_go` complet : `temporary: true` (le contrat ne permet pas d'écrire un no-go définitif — `z.literal(true)`), un `context` daté tiré de son brief (hors IT, aucun budget de prestation documenté, cellule d'arrêt de Feyzin 2027 non nommée) et un `trigger` nommé (les rôles de la cellule d'arrêt de Feyzin sont publiés, ou le référencement fournisseur s'ouvre). Deux des sept axes (`accessibilite`, `capacite_achat_externe`) sont `unknown`, sans note, et sortent du dénominateur (GA-18/GA-19) — le score se lit sur cinq axes (11/25), jamais sur sept. Aucune probabilité. `demo-dossier-read.spec.ts` prouve les deux faits sur ce compte précisément, pas seulement « au moins un dossier ».",
}

/**
 * #2306.12/.13/.30 — LE PLAFOND « ACCÈS/ACHAT INCONNU », EN DÉMONSTRATION.
 *
 * `computeDossierScore` nomme désormais `cappedBy` (`DOSSIER_SCORE_CAP_AXES` =
 * `accessibilite`/`capacite_achat_externe`) — la notice PLAFONNE explicitement
 * la lecture, avec sa vérification par axe (`CapNotice`, `DossierReadBlocks.tsx`).
 * Aucun semis dédié : un compte porte DÉJÀ un axe `unknown` parmi
 * `accessibilite`/`capacite_achat_externe` (Société Générale :
 * `capacite_achat_externe`), donc `cappedBy` n'est pas vide par construction —
 * la même donnée sert la capacité, sans contradiction.
 */
export const DEMO_DOSSIER_SCORE_CAP_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'Société Générale (`evaluation.dossier_read`) porte `capacite_achat_externe: unknown` : `computeDossierScore` en dérive `cappedBy: ["capacite_achat_externe"]`, et `CapNotice` (`DossierReadBlocks.tsx`) affiche « Ce score ne dit rien de l’accès ou de l’achat externe » avec « Vérifier si un décideur est joignable ». Aucune valeur de démonstration à écrire : la capacité se démontre PAR CONSTRUCTION, sur une donnée déjà seedée pour #2118.45-47.',
}

/**
 * #4016.L9.a — LE SCORE DE COMPTE DÈS DEUX AXES, ET SON NOMBRE D'AXES, EN DÉMONSTRATION.
 *
 * Aucun semis dédié : les trois dossiers de démonstration qui portent
 * `evaluation.dossier_read` ont DÉJÀ deux axes notés ou plus (Société Générale
 * 5, SNCF 7, TotalEnergies 5) — leur score s'affiche, et `DossierWorthCard`
 * pose « N axes sur 7 évalués » PAR CONSTRUCTION. `demo-dossier-read.spec.ts`
 * le vérifie sur chaque dossier, pas seulement « au moins un ».
 */
export const DEMO_DOSSIER_AXES_COUNT_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'Société Générale, SNCF et TotalEnergies (`evaluation.dossier_read.axes`) ont chacun au moins deux axes notés (5, 7, 5) : `computeDossierScore` rend `kind: "score"` et `DossierWorthCard` affiche « 5 axes sur 7 évalués » / « 7 axes sur 7 évalués » sous la note, les axes inconnus nommés hors du calcul. Aucune valeur de démonstration à écrire : la capacité se démontre sur les dossiers déjà seedés pour #2118.',
}

/**
 * `dossier_read.profile_incomplete` ET `missing[]`, EN DÉMONSTRATION (#2118).
 *
 * Le contrat en sept axes porte un drapeau « le profil de TON ESN est
 * incomplet, voilà ce qui manque ». Il reste VIDE À DESSEIN dans la salle de
 * démonstration, et la raison n'est pas un aveu d'oubli : `DEMO_ESN_PROFILE`
 * est délibérément COMPLET, parce que la salle est prêtée et que le visiteur
 * doit voir une lecture de dossier pleine, pas une invitation à remplir le
 * profil d'une entreprise qui n'est pas la sienne. Le poser demanderait de
 * mutiler le profil de démonstration — c'est-à-dire d'inventer un manque, ce
 * que « JAMAIS de donnée fictive » interdit.
 *
 * ⚠️ Ce silence-ci est la PREUVE que le seed a marché, exactement comme
 * `empty_talent_pool` dans `DEMO_LAURA_BUBBLES_SILENT` : un drapeau levé ici
 * signalerait un profil de démonstration cassé. Il ne se déplace donc jamais
 * vers « seedé » pour faire passer un test.
 */
export const DEMO_DOSSIER_PROFILE_INCOMPLETE_COVERAGE: Readonly<{
  state: 'vide_a_dessein'
  reason: string
}> = {
  state: 'vide_a_dessein',
  reason:
    "`DEMO_ESN_PROFILE` est complet à dessein : la salle de démonstration est prêtée, et le visiteur doit voir une lecture de dossier pleine plutôt qu'une invitation à compléter le profil d'une ESN qui n'est pas la sienne. Lever `profile_incomplete` supposerait de retirer des champs au profil de démonstration, donc d'inventer un manque — interdit par « JAMAIS de donnée fictive ». Son silence est la preuve que le profil est bien seedé, au même titre que la bulle `empty_talent_pool` qui se tait devant sept profils.",
}

/**
 * « ET LE SEUIL D'ALERTE DE MARGE DE L'ESPACE (#2420.15/.17) MONTRE QUOI EN
 * DÉMO ? » SEEDÉ — LE FORMULAIRE A QUELQUE CHOSE À MONTRER RÉGLÉ
 *
 * `workspaces.margin_alert_threshold_percent` (migration
 * `1789691847302-TimesheetDepth`) est une COLONNE de plus sur une table qui
 * existe depuis l'origine : la garde par table ne pouvait rien en dire, et
 * Réglages › Finance serait parti en démonstration avec « non réglé » alors
 * même que le formulaire venait d'être livré — exactement le défaut que
 * cette classification existe pour attraper.
 *
 * `DEMO_MARGIN_ALERT_THRESHOLD_PERCENT` vaut 20 : `DemoSeedService.seedMarginThreshold`
 * l'écrit à CHAQUE prise de bail, sur la même colonne que l'écriture réelle
 * (`RevenueService.setMarginThreshold`, GA-26 — un seul endroit). Sans ce
 * semis, ni l'alerte de seuil ni le diagnostic de marge basse de Laura
 * n'auraient de mission à signaler devant un prospect : les deux comparent
 * la marge COMMERCIALE au seuil (`mission-margin-engine.ts`, `diagnose()`),
 * et une salle sans seuil réglé ne les déclenche jamais.
 */
export const DEMO_MARGIN_ALERT_THRESHOLD_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "`workspaces.margin_alert_threshold_percent` (migration `1789691847302-TimesheetDepth`) est une COLONNE de plus sur une table qui existe depuis l'origine : la garde par table ne pouvait rien en dire, et Réglages › Finance serait parti en démonstration à « non réglé ». `DemoSeedService.seedMarginThreshold` écrit `DEMO_MARGIN_ALERT_THRESHOLD_PERCENT` (20) à chaque prise de bail, sur la même colonne que l'écriture réelle (`RevenueService.setMarginThreshold`, GA-26). Le seuil surveille la marge COMMERCIALE (`mission-margin-engine.ts`, `diagnose()`) : sans ce semis, ni l'alerte de seuil ni le diagnostic de Laura n'auraient de mission à signaler en salle de démonstration. Vérifié par `demo-seed.service.spec.ts` (« règle le seuil d'alerte de marge »).",
}

/**
 * « ET LA SIGNATURE PROPOSÉE ET LE PIED DE DOCUMENT (Théo D settings-espace.N5) MONTRENT QUOI EN DÉMO ? » SEEDÉ
 *
 * `workspaces.document_signature` et `workspaces.document_footer` (migration `1796574800005-WorkspaceDocumentIdentity`)
 * sont deux COLONNES de plus sur une table qui existe depuis l'origine : la garde par table ne pouvait rien en dire, et
 * Réglages › Marque & documents serait parti en démonstration avec deux champs vides et un aperçu sans signature.
 * `DemoSeedService.seedDocumentIdentity` écrit `DEMO_DOCUMENT_IDENTITY` à CHAQUE prise de bail, sur les mêmes colonnes
 * que l'écriture réelle (`WorkspaceBrandService.update`, GA-26). Vérifié par `demo-seed.service.spec.ts`.
 */
export const DEMO_DOCUMENT_IDENTITY_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "`workspaces.document_signature` / `document_footer` (migration `1796574800005-WorkspaceDocumentIdentity`) sont deux colonnes de plus sur une table qui existe depuis l'origine : la garde par table ne pouvait rien en dire. `DemoSeedService.seedDocumentIdentity` écrit `DEMO_DOCUMENT_IDENTITY` à chaque prise de bail, sur les mêmes colonnes que `WorkspaceBrandService.update` (GA-26) : Réglages › Marque & documents montre une signature et un pied RÉGLÉS devant un prospect, et le dossier de compétences exporté les porte. Vérifié par `demo-seed.service.spec.ts` (« règle la signature et le pied de document »).",
}

/**
 * « ET `/pilotage/staffing` MONTRE QUOI EN DÉMO ? » SEEDÉ — LA PAGE EST PLEINE
 *
 * Quatre colonnes de tables qui existent depuis l'origine (`consultants.cost_rate_cents`,
 * `workspaces.tace_alert_threshold_percent`) ou une table neuve (`consultant_absences`, classée dans
 * `DEMO_SEEDED_TABLES`) : la garde par table ne voit pas les colonnes, cette classification les nomme.
 * `DemoSeedService.seedStaffing` pose, relativement à `now` : le coût journalier de six consultants (Camille Roussel,
 * en intercontrat, est chiffrée ; Léa Fontaine, elle aussi sans mission, ne l'est PAS — la page dit « coût non
 * renseigné »), deux congés (un à venir, un déjà pris ce mois-ci), les jours saisis du mois courant sur quatre
 * missions en cours (le TACE réel) et le seuil d'alerte TACE (80 %). Les fins de mission à 30 / 60 / 90 jours et
 * le TACE du mois précédent viennent des missions et relevés déjà semés (`DEMO_DELIVERY_CLIENT`).
 */
export const DEMO_STAFFING_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "`consultants.cost_rate_cents`, `consultant_absences` et `workspaces.tace_alert_threshold_percent` alimentent `/pilotage/staffing`. `DemoSeedService.seedStaffing` les remplit à chaque semis, en dates relatives à `now` : coût de six consultants (Léa Fontaine volontairement sans coût → « coût non renseigné »), un congé à venir, un congé déjà pris et un arrêt long EN COURS (#2408.17, « Absence prolongée » sur /missions), les jours saisis du mois courant sur quatre missions (TACE réel) et un seuil d'alerte TACE de 80 %. Fins de mission 30/60/90 j et TACE du mois précédent : missions et relevés déjà semés.",
}

/**
 * « ET LE SOCLE DU GUIDE (#2212/#2213/#2214) MONTRE QUOI EN DÉMONSTRATION ? »
 * SEEDÉ — ET SANS RIEN À SEMER, CE QUI EST LA SEULE FAÇON HONNÊTE DE LE DIRE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL FAUT QUAND MÊME UNE ENTRÉE ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Le socle du guide n'ajoute AUCUNE table et AUCUNE clé de `raw_analysis` : les
 * deux gardes de `demo-coverage.spec.ts` n'avaient donc rien à lui reprocher, et
 * il serait passé sans qu'aucune question ne soit posée. C'est exactement le cas
 * que la règle de couverture vise — « un écran livré mais vide en démonstration
 * se découvre en réunion, pas en CI » — et le fait qu'une garde soit AVEUGLE à
 * une nouveauté n'en fait pas une exemption.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'UN PROSPECT VOIT, ET POURQUOI C'EST LE MÊME QU'EN PRODUCTION
 * ─────────────────────────────────────────────────────────────────────────────
 * « Nouveautés › Me montrer où c'est » (`ChangelogMenu`) démarre
 * `FEEDBACK_COACHMARK` : voile, halo et bulle se posent sur le bouton de retour
 * (`FeedbackWidget`, monté dans `routes/__root.tsx`, donc présent sur TOUS les
 * écrans, démonstration comprise). Les trois choses affichées — titre, corps,
 * boutons — sont des clés i18n (`locales/fr|en/guide.json`), pas de la donnée.
 *
 * Il n'y a donc rien à semer, et surtout rien à semer DE FICTIF : le guide
 * désigne un élément réel de l'interface. Un semis serait ici une donnée
 * inventée, ce que la doctrine refuse.
 *
 * ⚠️ CE QUI RESTE VRAIMENT VIDE, ET QUI N'EST PAS DE CE LOT : le CATALOGUE des
 * guides (#2214.24, guides 2 à 12 et centre d'aide). Sa source GitHub est coupée
 * en plein milieu et la décision du 19/09/2026 est « je complète moi-même ». Le
 * jour où ce catalogue existera, c'est LUI qui devra être classé ici — un guide
 * de plus n'hérite pas de cette entrée.
 */
export const DEMO_GUIDE_SOCLE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "Le socle du guide (#2212/#2213/#2214) n'ajoute ni table ni clé de `raw_analysis` : les deux gardes de `demo-coverage.spec.ts` sont aveugles à lui, et une garde aveugle n'est pas une exemption — d'où cette entrée. Ce qu'un prospect voit en démonstration est IDENTIQUE à la production : « Nouveautés › Me montrer où c'est » (`ChangelogMenu`) démarre `FEEDBACK_COACHMARK`, dont le voile, le halo et la bulle se posent sur le bouton de retour (`FeedbackWidget`, monté dans `routes/__root.tsx`, donc présent sur tous les écrans). Titre, corps et boutons sont des clés i18n (`locales/fr|en/guide.json`), pas de la donnée : il n'y a rien à semer, et un semis serait ici une donnée INVENTÉE, ce que la doctrine refuse. Le CATALOGUE des guides (#2214.24) reste hors de ce lot — source coupée, décision Louis du 19/09/2026 « je complète moi-même » — et devra être classé ici quand il existera.",
}

/**
 * « LES GUIDES 2 À 12 ET LE CENTRE D'AIDE (#2214.24) MONTRENT QUOI EN
 * DÉMONSTRATION ? » SEEDÉ — PAR LES DONNÉES DES ÉCRANS QU'ILS DÉSIGNENT.
 *
 * Le catalogue que l'entrée au-dessus attendait existe (24/09/2026). Il
 * n'ajoute ni table ni clé de `raw_analysis` : ses guides désignent des
 * éléments RÉELS des écrans (`data-guide-anchor`), posés là où ils sont
 * présents données vides comprises. En démonstration, le prospect parcourt les
 * MÊMES routes sous un espace démo déjà semé : le centre d'aide (Nouveautés,
 * Réglages › Préférences) y liste les douze guides, et chacun se pose sur son
 * écran. Vérifié côté web par `guide-catalogue-demo.test.ts` : chaque écran de
 * guide a sa route, et aucune ne bascule sur un autre écran en démonstration
 * (ce que faisait `/chat` avant — ses ancrages auraient disparu devant le
 * prospect). Rien à semer de plus : un semis serait ici une donnée inventée.
 */
export const DEMO_GUIDE_CATALOGUE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "Le catalogue des guides (#2214.24 : 11 parcours d'écran + centre d'aide) n'ajoute ni table ni clé de `raw_analysis`. Ses pas désignent des éléments réels des écrans, présents données vides comprises ; la démonstration parcourt les mêmes routes sous un espace déjà semé, donc chaque guide s'y pose sur son écran. Garde côté web : `apps/web/src/features/guide/guide-catalogue-demo.test.ts` (route existante, aucune bascule d'écran en démonstration).",
}

/**
 * « ET LE GUIDE 1, « PREMIER SUCCÈS BELLUMAI » (#2214.23), MONTRE QUOI EN
 * DÉMONSTRATION ? » SEEDÉ — ET SANS RIEN À SEMER, MÊME RAISON QUE LE SOCLE.
 *
 * `FirstSuccessGuideTrigger` (monté au root) démarre le guide `id:
 * 'premier-succes-bellumai'` (`guide-registry.ts`) dès qu'un compte atteint
 * `/chat` avec `needsOnboarding === false` et n'a jamais vu le guide
 * (`wasFirstSuccessGuideShown`, `localStorage` par compte). Aucune des trois
 * conditions ne dépend d'une table ou d'une clé `raw_analysis` : `route` vient
 * du routeur, `needsOnboarding` du MÊME endpoint `GET /onboarding/state` que
 * lit un compte réel (un dossier de démonstration a son profil déjà rempli,
 * donc `needsOnboarding: false`, comme n'importe quel compte onboardé), et
 * `alreadyShown` d'un flag posé côté navigateur — jamais du serveur. Le pas
 * unique du guide s'ancre sur `laura.saisie` (`/chat`), un élément réel de
 * l'écran, présent en démonstration comme en production. Il n'y a donc rien à
 * semer, et un semis serait ici une donnée INVENTÉE, ce que la doctrine
 * refuse — même raisonnement que `DEMO_GUIDE_SOCLE_COVERAGE` ci-dessus,
 * appliqué au guide automatique plutôt qu'au socle manuel.
 */
export const DEMO_GUIDE_FIRST_SUCCESS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "Le guide automatique « Premier succès BellumAI » (#2214.23) n'ajoute ni table ni clé de `raw_analysis`. `FirstSuccessGuideTrigger` (`apps/web/src/features/guide/FirstSuccessGuideTrigger.tsx`, monté au root) le démarre sur `/chat` dès que `GET /onboarding/state` répond `needsOnboarding: false` — le même endpoint qu'un compte réel, et un dossier de démonstration a son profil déjà rempli donc la même réponse — et tant qu'un flag `localStorage` posé côté navigateur (`first-success-guide-seen.ts`) ne dit pas qu'il a déjà été vu. Son pas s'ancre sur `laura.saisie`, un élément réel de l'écran `/chat`, présent en démonstration comme en production. Rien à semer, et un semis serait ici une donnée inventée.",
}

/**
 * « ET LES QUATRE NIVEAUX D'ACTION DU COPILOTE (#2449) MONTRENT QUOI EN
 * DÉMONSTRATION ? » VIDE À DESSEIN, ET POUR UNE RAISON QUI SE VÉRIFIE
 * (21/09/2026).
 *
 * Ce lot ajoute une VALEUR (`CopilotActionLevel`) et une PORTE
 * (`action-os/copilot-action-gate.ts`, appelée par
 * `ActionRouterService.dispatchIdempotent`). Il n'ajoute ni table, ni clé de
 * `raw_analysis` : les deux gardes de `demo-coverage.spec.ts` sont AVEUGLES à
 * lui — et une garde aveugle n'est pas une exemption, d'où cette entrée.
 *
 * Pourquoi il n'y a rien à semer, et pourquoi ce n'est pas un trou :
 *
 * 1. `actionLevel` est OPTIONNEL sur `ActionPrincipal`, et ABSENT chez tous les
 *    appelants existants : la porte ne se prononce donc sur aucun geste de la
 *    salle de démonstration. Semer un niveau pour un écran qui ne le lit pas
 *    encore serait une preuve de couverture sur un bloc mort — le piège nommé
 *    plus haut dans ce fichier.
 * 2. Les points d'ÉCRAN du niveau d'action (#2449.33 à #2449.40 : le sélecteur,
 *    le rappel dans le preview, les automatisations) ne sont PAS de ce lot. Le
 *    jour où un écran affichera le niveau, c'est LUI qui devra être classé ici.
 * 3. Ce que la porte dit, la salle de démonstration le dit DÉJÀ, en plus strict
 *    et par un autre chemin : `ActionRouterService.isDemo(ctx)` rend
 *    `DEMO_NO_EXTERNAL_WRITE` avant toute écriture vers un outil externe. Un
 *    visiteur voit donc exactement la promesse du niveau « préparer » — rien ne
 *    sort de BellumAI — sans qu'aucune donnée n'ait été fabriquée pour ça.
 *
 * ⚠️ Ce qui est vérifié par une garde, et non affirmé : que la porte est bien
 * APPELÉE sur le chemin de tout dispatch, et avant tout effet
 * (`apps/api/src/architecture/action-level-gate-is-on-the-path.spec.ts`). Une
 * classification « vide à dessein » posée sur une porte inerte serait le pire
 * des deux mondes.
 */
export const DEMO_COPILOT_ACTION_LEVEL_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2449 — les quatre niveaux d'action ajoutent une VALEUR partagée et une PORTE (`copilot-action-gate.ts`, appelée par `ActionRouterService.dispatchIdempotent`), ni table ni clé de `raw_analysis` : les deux gardes de `demo-coverage.spec.ts` sont aveugles à eux, et une garde aveugle n'est pas une exemption. Rien à semer : `actionLevel` est optionnel et aucun appelant ne le déclare encore, donc la porte ne se prononce sur aucun geste de la salle de démonstration ; les points d'ÉCRAN du niveau (#2449.33-.40) ne sont pas de ce lot et devront être classés ici quand ils existeront. Ce que le niveau « préparer » promet, la démonstration le tient déjà par `isDemo(ctx)` / `DEMO_NO_EXTERNAL_WRITE` : rien ne sort vers un outil externe, sans qu'aucune donnée n'ait été fabriquée.",
}

/**
 * « ET « LINKEDIN SEUL CANAL DISPONIBLE » (#2629.2), ÇA SE VOIT OÙ EN
 * DÉMONSTRATION ? » SEEDÉ — décision Louis, 22/09/2026.
 *
 * `getAvailableChannels` / `channelFallback`
 * (apps/web/…/contact-engagement/channel.ts) savent déjà nommer le repli
 * « un seul canal, et c'est LinkedIn » : un contact qui porte `linkedin_url`
 * sans `email` ni `phone`. Ni table ni clé de `raw_analysis` neuve — `contacts`
 * est déjà classée SEEDÉE, `linkedin_url` en est une colonne de plus — les deux
 * gardes de `demo-coverage.spec.ts` sont donc AVEUGLES à cette nouveauté, et
 * une garde aveugle n'est pas une exemption.
 *
 * Mesuré en production le 22/09/2026 sur un compte réel (`?tab=contacts`, vue
 * « Par persona ») : les six contacts sans coordonnées affichaient tous
 * « Aucun canal connu pour ce contact », et la chaîne « LinkedIn » était
 * introuvable dans la page entière — l'état existait dans le CODE depuis
 * #2629, jamais dans la DONNÉE.
 *
 * `demo-dataset.ts` sème un contact SIMULÉ chez SNCF (Younes Berrada,
 * `sncfDossier.contacts`, re-semé le 01/10/2026) avec `email: null`, `phone: null` et un
 * `linkedin_url` dont le slug (`demo-bellum-…`) se lit comme fictif au premier
 * coup d'œil — jamais un dirigeant réel : rule 1 du fichier leur interdit
 * toute coordonnée, LinkedIn compris.
 */
export const DEMO_LINKEDIN_ONLY_CONTACT_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#2629.2 — `getAvailableChannels`/`channelFallback` (apps/web/…/contact-engagement/channel.ts) savent déjà rendre le repli « LinkedIn seul canal disponible » : un contact avec `linkedin_url` mais sans `email` ni `phone`. Ni table ni clé de `raw_analysis` neuve — `contacts` est déjà classée SEEDÉE et `linkedin_url` en est une colonne de plus — donc les deux gardes de `demo-coverage.spec.ts` sont aveugles à cette nouveauté, et une garde aveugle n'est pas une exemption. Mesuré en production le 22/09/2026 sur un compte réel : les six contacts sans coordonnées affichaient tous « Aucun canal connu », et « LinkedIn » était introuvable dans la page — l'état existait dans le code depuis #2629, jamais dans la donnée. `demo-dataset.ts` sème désormais un contact SIMULÉ chez SNCF (Younes Berrada) avec `email: null`, `phone: null` et un `linkedin_url` au slug visiblement fictif (`demo-bellum-…` — LinkedIn n'a pas d'équivalent `.example` d'un réseau social). Recompté sur le jeu réellement construit par `demo-linkedin-only-contact-coverage.spec.ts`, qui sait dire non : retirer ce contact ou lui redonner un e-mail/téléphone fait rougir la garde.",
}

/**
 * « ET LE STATUT « NUMÉRO INVALIDE » (#2297.33, #2297.39), ÇA SE VOIT OÙ EN
 * DÉMONSTRATION ? » SEEDÉ — lot V5 du 28/09/2026.
 *
 * `ContactKeyInfo.tsx` (`phoneFormatInvalid`) et `computeContactFieldStatus`
 * (`packages/contracts/…/contact-enrichment.ts`) savent déjà rendre le statut
 * `invalid` : une valeur de téléphone est là, mais `looksLikePhoneNumber` ne
 * la reconnaît plus comme exploitable (une lettre dans la chaîne, ou un
 * compte de chiffres hors 8-15). Ni table ni clé de `raw_analysis` neuve —
 * `contacts` est déjà classée SEEDÉE et `phone` en est une colonne existante,
 * juste jamais posée sous cette forme — les deux gardes de
 * `demo-coverage.spec.ts` sont donc aveugles à cette nouveauté, et une garde
 * aveugle n'est pas une exemption.
 *
 * Aucun contact du jeu ne portait un téléphone malformé : la ligne
 * `keyInfo.phoneInvalidHint` n'était observable sur AUCUN écran de salle de
 * démonstration, alors que le statut existe dans le code depuis #2297.39
 * (24/09/2026).
 *
 * `demo-contact-density.ts` sème désormais un contact SIMULÉ chez SNCF
 * (Farah Guillet, `DENSITY.SNCF`) dont le téléphone (`invalidPhone: true`
 * → `simulatedInvalidPhone`) reprend le numéro de fiction habituel
 * (`+33 6 39 98 xx xx`, plage ARCEP réservée) avec ses deux derniers chiffres
 * redevenus des lettres — la même dégradation que les exemples cités par la
 * doctrine du champ (« ID-20250814 », « ext 4512 ») : jamais un dirigeant réel,
 * jamais une coordonnée inventée sur une personne qui existe.
 *
 * Recompté sur le jeu réellement construit par
 * `demo-invalid-phone-contact-coverage.spec.ts`, qui sait dire non : retirer
 * ce contact ou lui redonner un numéro bien formé fait rougir la garde.
 */
export const DEMO_INVALID_PHONE_CONTACT_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#2297.33/.39 — `ContactKeyInfo.tsx` (`phoneFormatInvalid`) et `computeContactFieldStatus` (`packages/contracts/…/contact-enrichment.ts`) savent déjà rendre le statut `invalid` : une valeur de téléphone est là, mais `looksLikePhoneNumber` ne la reconnaît plus comme exploitable. Ni table ni clé de `raw_analysis` neuve — `contacts` est déjà classée SEEDÉE et `phone` en est une colonne existante, juste jamais posée sous cette forme — les deux gardes de `demo-coverage.spec.ts` sont donc aveugles à cette nouveauté, et une garde aveugle n'est pas une exemption. Aucun contact du jeu ne portait un téléphone malformé : `keyInfo.phoneInvalidHint` n'était observable sur AUCUN écran de salle de démonstration, alors que le statut existe dans le code depuis #2297.39 (24/09/2026). `demo-contact-density.ts` sème désormais un contact SIMULÉ chez SNCF (Farah Guillet) dont le téléphone (`invalidPhone: true` → `simulatedInvalidPhone`) reprend le numéro de fiction habituel (plage ARCEP `06 39 98`) avec ses deux derniers chiffres redevenus des lettres — jamais un dirigeant réel, jamais une coordonnée inventée sur une personne qui existe. Recompté sur le jeu réellement construit par `demo-invalid-phone-contact-coverage.spec.ts`, qui sait dire non : retirer ce contact ou lui redonner un numéro bien formé fait rougir la garde.",
}

/**
 * #2297.26 reste (30/09/2026) — « RÉCEMMENT ENRICHIS », JAMAIS OBSERVABLE EN
 * DÉMONSTRATION.
 *
 * Recette prod du 30/09 : `/contacts?view=to_enrich` annonçait un lot
 * facturable sans jamais montrer la ligne « contacts déjà enrichis
 * récemment » (`bulkEnrichmentExclusionReason` → `on_cooldown`,
 * `EnrichConfirmDialog.tsx`) — aucun contact du jeu n'était sous le délai de
 * protection de `enrichmentCooldown` (30 jours, `@bellum/contracts`).
 *
 * Même précédent que `DEMO_INVALID_PHONE_CONTACT_COVERAGE` juste au-dessus :
 * ni table ni clé de `raw_analysis` neuve — `last_enrichment_at` /
 * `last_enrichment_result` / `last_enrichment_missing` sont déjà les colonnes
 * que `DEMO_CONTACT_ENRICHMENT_COLUMNS` classe SEEDÉES (le clic « Enrichir »
 * les écrit, en démonstration comme en réel), simplement jamais posées à
 * froid dans cet état précis avant ce lot — les deux gardes de
 * `demo-coverage.spec.ts` sont donc aveugles à cette nouveauté, et une garde
 * aveugle n'est pas une exemption.
 *
 * `demo-contact-density.ts` sème désormais un contact SIMULÉ chez SNCF
 * (Hugo Delannoy, `DENSITY.SNCF`, `reachable: false` — sans lui aucune
 * coordonnée n'aurait pu déclencher `already_has_contact_info` avant
 * `on_cooldown`) dont l'enrichissement a été tenté il y a 5 jours sans rien
 * trouver de neuf (`recentlyEnrichedNoResultDaysAgo` →
 * `demoContactRow`, `last_enrichment_result: 'no_new_data'`) : jamais un
 * dirigeant réel, jamais une coordonnée inventée sur une personne qui existe.
 *
 * Recompté sur le jeu réellement construit par
 * `demo-recently-enriched-contact-coverage.spec.ts`, qui sait dire non :
 * retirer ce contact ou faire sortir sa date du délai de 30 jours fait
 * rougir la garde.
 */
export const DEMO_RECENTLY_ENRICHED_CONTACT_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#2297.26 reste — `bulkEnrichmentExclusionReason` (`packages/contracts/…/contact-views.ts`) sait déjà rendre `on_cooldown` : un contact protégé par `enrichmentCooldown` (30 jours, aucune coordonnée trouvée) n'est ni facturable ni compté dans le lot, et `EnrichConfirmDialog.tsx` l'annonce sous « contacts déjà enrichis récemment ». Ni table ni clé de `raw_analysis` neuve — `last_enrichment_at`/`last_enrichment_result`/`last_enrichment_missing` sont déjà les colonnes que `DEMO_CONTACT_ENRICHMENT_COLUMNS` classe SEEDÉES, simplement jamais posées à froid dans cet état avant ce lot — les deux gardes de `demo-coverage.spec.ts` sont donc aveugles à cette nouveauté, et une garde aveugle n'est pas une exemption. `demo-contact-density.ts` sème désormais un contact SIMULÉ chez SNCF (Hugo Delannoy, `reachable: false`, `recentlyEnrichedNoResultDaysAgo: 5`) — jamais un dirigeant réel, jamais une coordonnée inventée sur une personne qui existe. Recompté sur le jeu réellement construit par `demo-recently-enriched-contact-coverage.spec.ts`, qui sait dire non : retirer ce contact ou faire sortir sa date du délai de 30 jours fait rougir la garde.",
}

/**
 * #2160.58 — LA CONFIRMATION D'IDENTITÉ DE CONTACT (« Bon contact confirmé »),
 * JAMAIS OBSERVABLE EN DÉMONSTRATION — trouvé à l'intégration de la vague 31
 * (24/09/2026), branche `fix/w41-accounts-2164-24-09` (contient
 * `fix/w40-ecrans-secondaires-24-09`).
 *
 * `contacts.identity_confirmed_at`/`identity_confirmed_by` (migration
 * `1796001462218-ContactIdentityConfirmed.ts`, additive/nullable) sont deux
 * colonnes NEUVES sur une table déjà classée SEEDÉE : les deux gardes de
 * `demo-coverage.spec.ts` (tables ET clés `raw_analysis`) sont donc AVEUGLES
 * à cette nouveauté — une garde aveugle n'est pas une exemption. Sans ligne
 * semée, `ContactCorrectionsCard.tsx` (#2160.29/.58) n'affiche jamais le
 * badge « Bon contact confirmé le {{date}} » en salle de démonstration : le
 * bouton « Confirmer » y reste visible pour toujours, quel que soit le compte
 * ouvert.
 *
 * Décision Louis 04/10/2026 : plus aucun `identity_confirmed_at` semé (voir
 * l'entrée, vide à dessein) — historiquement sur le client d'exemple, jamais un
 * dirigeant réel des six dossiers : déclarer un verdict humain sur une vraie
 * personne inventerait un fait sur elle (même garde que `user_status` et
 * `demo_seed_first_door`, portés par ce même contact). `demoContactRow`
 * (`demo-seed.service.ts`) traduit la présence du champ en une date relative
 * au seed (`identity_confirmed_at`) et pose `identity_confirmed_by` au seul
 * occupant de la salle (`ownerUserId`).
 *
 * Recompté sur le jeu réellement construit par
 * `demo-contact-identity-confirmed-coverage.spec.ts`, qui sait dire non :
 * retirer le champ ou le contact fait rougir la garde.
 */
export const DEMO_CONTACT_IDENTITY_CONFIRMED_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "décision Louis 04/10 : aucune déclaration inventée sur une personne réelle. #2160.58 — le badge « Bon contact confirmé le {{date}} » (`ContactCorrectionsCard.tsx`) exige un verdict humain posé sur une PERSONNE nommée. Le client d'exemple qui le portait a quitté la salle ; le client de livraison (SNCF) ne crée aucun interlocuteur, et confirmer l'identité d'une personne réelle de son dossier inventerait un fait sur elle. Le bouton « Confirmer » reste montrable sur toute fiche ; `demo-contact-identity-confirmed-coverage.spec.ts` vérifie que le client de livraison ne porte aucun interlocuteur créé.",
}

/**
 * #2160.60 (26/09/2026) — « AUTORISER LA RECOMMANDATION », JAMAIS
 * OBSERVABLE EN DÉMONSTRATION jusqu'ici.
 *
 * `contacts.recommendation_authorized_at`/`_by`/`_reason` (migration
 * `1796321336533-ContactRecommendationAuthorized.ts`, additive/nullable)
 * étaient trois colonnes NEUVES sur une table déjà classée SEEDÉE, classées
 * « vide à dessein » (garde aveugle, pas une exemption) tant qu'aucune des
 * deux portes qu'elles lèvent — `homonym_conflict` ou `entity_mismatch`
 * (`contact-eligibility.ts`, `isAuthorizedFor`) — n'existait dans le jeu de
 * données : sans porte rencontrée, `ContactRecommendationAuthorizationCard`
 * (#2160.29/.60) ne s'affiche JAMAIS, quel que soit le compte ouvert.
 *
 * `demo-dataset.ts` sème désormais une paire `homonym_conflict` sur SNCF :
 * deux sièges de décision (`roleSeat`, porteurs d'un NOM FICTIF depuis la
 * décision Louis du 01/11/2026 — `demo-seat-names.ts`, jamais un dirigeant
 * réel) partagent le même intitulé
 * (« Responsable des systèmes d'information d'une filiale de transport »,
 * Keolis et SNCF Réseau — deux filiales DISTINCTES, déjà déclarées dans
 * `entities_exhaustive`). `filterEligibleContacts` les écarte tous les deux
 * du classement pour `homonym_conflict`, sauf levée : le siège Keolis porte
 * une levée SEMÉE (badge + « Révoquer »), le siège SNCF Réseau reste `null`
 * (bouton « Autoriser » visible). Contrairement à `identity_confirmed_at`,
 * PAS réservé au client d'exemple : aucun des deux sièges n'est une personne
 * réelle nommée, donc lever la porte n'invente aucun verdict humain sur
 * quiconque — voir la garde de `demo-dataset.ts` (type `DemoContact`).
 *
 * Recompté sur le jeu réellement construit par
 * `demo-contact-recommendation-authorized-coverage.spec.ts`, qui sait dire
 * non : retirer un des deux sièges, désaligner leurs intitulés, ou retirer la
 * levée fait rougir la garde.
 */
export const DEMO_CONTACT_RECOMMENDATION_AUTHORIZED_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#2160.60 — `contacts.recommendation_authorized_at`/`_by`/`_reason` (migration `1796321336533-ContactRecommendationAuthorized.ts`, additive/nullable) étaient trois colonnes NEUVES sur une table déjà classée SEEDÉE, classées vide à dessein tant qu'aucune des deux portes (`homonym_conflict`/`entity_mismatch`, `contact-eligibility.ts`) n'existait dans le jeu de données — sans porte rencontrée, `ContactRecommendationAuthorizationCard.tsx` (#2160.29/.60) ne s'affichait jamais. `demo-dataset.ts` sème désormais une paire `homonym_conflict` sur SNCF : deux sièges (`roleSeat`, nom FICTIF depuis la décision Louis du 01/11/2026 : `demo-seat-names.ts`, jamais un dirigeant réel) partagent le même intitulé sur deux filiales distinctes (Keolis, SNCF Réseau) — l'un porte une levée semée (badge + révocation), l'autre reste `null` (bouton « Autoriser » visible). Aucun des deux sièges n'étant une personne réelle nommée, lever la porte n'invente aucun verdict humain sur quiconque. Recompté sur le jeu réellement construit par `demo-contact-recommendation-authorized-coverage.spec.ts`, qui sait dire non.",
}

/**
 * #2721 — LA RECHERCHE WEB DE LAURA MONTRE QUOI EN SALLE DE DÉMONSTRATION ?
 * VIDE À DESSEIN, MÊME MOTIF QUE {@link DEMO_CONTACT_APPOINTMENT_TIMEZONE_COVERAGE}.
 *
 * Retour Loïc Inacio (call du 22/09/2026) : Laura n'avait aucun outil de
 * recherche web et expliquait la marche à suivre au lieu d'exécuter. Le
 * correctif ajoute UN outil de chat (`web_search`,
 * `apps/ia/app/services/web_search_tool.py`, branché dans `CHAT_TOOLS` /
 * `execute_chat_tool` de `chat_tools.py`) qui exécute une requête Brave et
 * rend titre/extrait/adresse — jamais le nom du fournisseur. Il n'ajoute NI
 * table NI clé de `raw_analysis` : les deux gardes de `demo-coverage.spec.ts`
 * sont aveugles à lui, et une garde aveugle n'est pas une exemption — d'où
 * cette entrée.
 *
 * Rien à semer, et ce n'est pas un trou : la bulle Laura de la salle de
 * démonstration ne fait AUCUN appel outil ni aucun appel réseau (`demoTurn`,
 * #1942.2) — exactement la même limite que `schedule_reminder_for_contact`
 * ci-dessus. Semer un résultat de recherche web ne rendrait rien de visible
 * en démo : aucune route ne branche `demoTurn` sur le catalogue `CHAT_TOOLS`
 * réel. Bascule en `seede` le jour où la salle de démonstration invoque
 * vraiment des outils de chat — pas avant.
 */
export const DEMO_WEB_SEARCH_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2721 — l'outil de chat `web_search` (apps/ia/app/services/web_search_tool.py, branché dans CHAT_TOOLS/execute_chat_tool de chat_tools.py) exécute une requête Brave et rend titre/extrait/adresse, sans jamais nommer le fournisseur. Il n'ajoute ni table ni clé de `raw_analysis` : les deux gardes de `demo-coverage.spec.ts` sont aveugles à lui, et une garde aveugle n'est pas une exemption. Rien à semer : la bulle Laura de la salle de démonstration n'appelle aucun outil et ne fait aucun appel réseau (`demoTurn`, #1942.2) — même limite que `schedule_reminder_for_contact` (DEMO_CONTACT_APPOINTMENT_TIMEZONE_COVERAGE). Bascule en `seede` le jour où la démonstration invoque réellement des outils de chat.",
}

/**
 * #2809 (#2293.11, #2294.*) — « Trouver des contacts » depuis la sélection
 * de `/accounts` : le devis (aucune écriture) puis l'exécution
 * (`ContactDiscoveryService.run`). Ni nouvelle table ni nouvelle clé de
 * `raw_analysis` : les deux gardes de `demo-coverage.spec.ts` sont aveugles
 * à cette capacité, et une garde aveugle n'est pas une exemption.
 *
 * Le GESTE se voit ENTIÈREMENT en démo : le bouton de `SelectionBar.tsx`
 * s'affiche, le dialogue s'ouvre, le devis se calcule (`quote()` ne fait
 * aucun appel fournisseur, seulement une lecture de comptes déjà seedés) —
 * mais l'EXÉCUTION est interceptée avant tout appel réseau
 * (`ContactDiscoveryService.run`, `isDemo` résolu par le contrôleur), et rend
 * toujours `status: 'empty'`. Même garantie que `ContactsService.
 * enrichContact` (« aucun appel réseau en démo », `demo-enrichment.ts`) :
 * les cinq sociétés du jeu de démo sont RÉELLES (SIREN réel), donc une
 * personne JAMAIS collectée y serait une personne INVENTÉE — pire qu'une
 * coordonnée fictive pour quelqu'un de réel. Rien à semer de plus : le clic
 * ne trouve RIEN, honnêtement, exactement ce que le même clic ferait sur un
 * espace réel sans clé Apollo configurée.
 */
export const DEMO_CONTACT_DISCOVERY_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2809 — le clic réagit entièrement (bouton, devis, aucun crédit débité) mais l'exécution ne fait jamais d'appel réseau en démo (ContactDiscoveryService.run, isDemo) : les sociétés du jeu sont réelles, une personne jamais collectée y serait inventée. Rend toujours status: 'empty' — même honnêteté que ContactsService.enrichContact en démo (demo-enrichment.ts). Bascule en `seede` le jour où la démonstration invente un jeu de personnes NON publiées au registre pour porter ce cas.",
}

/**
 * #2292.28 (épopée #2929, LAU-FINAL-033) — LE TOOL `get_account_briefing`
 * NOMME-T-IL LA « ROUTE DÉCONSEILLÉE » EN SALLE DE DÉMONSTRATION ? VIDE À
 * DESSEIN, MÊME MOTIF QUE {@link DEMO_WEB_SEARCH_COVERAGE}.
 *
 * `build_account_briefing` (chat_tools.py) projette désormais
 * `dossier_read.anti_advice` vers `route_to_avoid`, une clé du RÉSULTAT d'un
 * outil de chat — ni table ni clé de `raw_analysis` : les deux gardes de
 * `demo-coverage.spec.ts` sont aveugles à elle, et une garde aveugle n'est
 * pas une exemption. Rien à semer : la bulle Laura de la salle de
 * démonstration n'appelle aucun outil et ne fait aucun appel réseau
 * (`demoTurn`, #1942.2) — le tool `get_account_briefing` n'y tourne jamais,
 * donc `route_to_avoid` n'a aucune occasion de s'afficher, seedé ou non.
 * Bascule en `seede` le jour où la démonstration invoque réellement des
 * outils de chat.
 */
export const DEMO_ACCOUNT_BRIEFING_ROUTE_TO_AVOID_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2292.28 (épopée #2929) — `build_account_briefing` (apps/ia/app/services/chat_tools.py) projette désormais dossier_read.anti_advice vers route_to_avoid dans le résultat du tool get_account_briefing. Ni table ni clé de raw_analysis : les deux gardes de demo-coverage.spec.ts sont aveugles à elle. Rien à semer : la bulle Laura de la salle de démonstration n'appelle aucun outil et ne fait aucun appel réseau (demoTurn, #1942.2), donc get_account_briefing n'y tourne jamais — même limite que DEMO_WEB_SEARCH_COVERAGE. Bascule en seede le jour où la démonstration invoque réellement des outils de chat.",
}

/**
 * #2292.17/.18 (épopée #2929, LAU-FINAL-033) — LE DEVIS DE LANCEMENT
 * NOMME-T-IL UN DOSSIER « DÉJÀ CONNU » EN SALLE DE DÉMONSTRATION ? VIDE À
 * DESSEIN, MÊME MOTIF QUE {@link DEMO_VERIFICATION_PUBLIC_TENDERS_COVERAGE}.
 *
 * `AnalysisService.planLaunch` rend désormais `knownAccount` sur le scénario
 * `fresh` quand le nom résout un dossier déjà analysé hors de la fenêtre de
 * cache. En démonstration, `planLaunch` rend `{ scenario: 'demo' }` AVANT
 * cette résolution, et `useLaunchPlan` n'interroge même pas le lanceur
 * (`enabled: !isDemo`) : aucune lecture ne part, donc `knownAccount` n'a
 * aucune occasion de s'afficher, semé ou non. Semer un dossier « déjà connu »
 * ici afficherait une note qu'aucun lancement de démonstration ne lira.
 * Bascule en `seede` le jour où la démonstration interroge réellement le
 * lanceur.
 */
export const DEMO_LAUNCH_PLAN_KNOWN_ACCOUNT_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2292.17/.18 (épopée #2929) — AnalysisService.planLaunch rend désormais knownAccount sur le scénario 'fresh' quand le nom résout un dossier déjà analysé hors de la fenêtre de cache (CACHE_MAX_AGE_DAYS). En démonstration, planLaunch rend { scenario: 'demo' } avant cette résolution et useLaunchPlan n'interroge pas le lanceur (enabled: !isDemo) : aucune lecture ne part, donc knownAccount n'a aucune occasion de s'afficher — même limite que DEMO_VERIFICATION_PUBLIC_TENDERS_COVERAGE (#2288.4). Bascule en seede le jour où la démonstration interroge réellement le lanceur.",
}

/**
 * Épopée #2872 (#2367.11, 25-26/09/2026) — L'OUTIL DE CHAT
 * `get_consultant_push_feedback` : VIDE À DESSEIN, MÊME MOTIF QUE
 * {@link DEMO_WEB_SEARCH_COVERAGE}.
 *
 * Le REX d'un push consultant est LU par un outil de chat neuf
 * (`apps/ia/app/services/chat_tools.py`, relayé par
 * `POST /internal/copilot/consultants/feedback`), jamais écrit — aucune table
 * ni clé de `raw_analysis` ajoutée : les deux gardes de `demo-coverage.spec.ts`
 * restent aveugles à lui, pour la même raison que `web_search`. Rien à semer :
 * la bulle Laura de la démonstration n'appelle aucun outil (`demoTurn`,
 * #1942.2).
 */
export const DEMO_CONSULTANT_PUSH_FEEDBACK_TOOL_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "Épopée #2872 (#2367.11) — l'outil de chat `get_consultant_push_feedback` (apps/ia/app/services/chat_tools.py, relayé par POST /internal/copilot/consultants/feedback) lit le REX déjà enregistré d'un consultant, il n'en écrit aucun. Il n'ajoute ni table ni clé de `raw_analysis` : les deux gardes de `demo-coverage.spec.ts` restent aveugles à lui, même motif que `web_search` (DEMO_WEB_SEARCH_COVERAGE). Rien à semer : la bulle Laura de la salle de démonstration n'appelle aucun outil de chat (`demoTurn`, #1942.2).",
}

/**
 * #3265.12 (épopée #3287, 29/09/2026) — L'OUTIL DE CHAT
 * `get_orientations_to_follow` : VIDE À DESSEIN, MÊME MOTIF QUE
 * {@link DEMO_CONSULTANT_PUSH_FEEDBACK_TOOL_COVERAGE}.
 *
 * Il LIT les actions déjà faites (`action_plan_items`, issue
 * `orientation_given`) — aucune table ni clé de `raw_analysis` ajoutée. La
 * bulle Laura de la démonstration n'appelle aucun outil (`demoTurn`, #1942.2).
 */
export const DEMO_ORIENTATIONS_TO_FOLLOW_TOOL_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#3265.12 (épopée #3287) — l'outil de chat `get_orientations_to_follow` (apps/ia/app/services/chat_tools.py) relit les actions du plan déjà faites avec l'issue `orientation_given` et leur texte déclaré, il n'écrit rien. Il n'ajoute ni table ni clé de `raw_analysis` : les deux gardes de `demo-coverage.spec.ts` restent aveugles à lui, même motif que `get_consultant_push_feedback` (DEMO_CONSULTANT_PUSH_FEEDBACK_TOOL_COVERAGE). Rien à semer : la bulle Laura de la salle de démonstration n'appelle aucun outil de chat (`demoTurn`, #1942.2).",
}

/**
 * #3258.14 (épopée #3362, lot E25 30/09/2026) — L'OUTIL DE CHAT
 * `get_account_interest_penetrability` : VIDE À DESSEIN, MÊME MOTIF QUE
 * {@link DEMO_CONSULTANT_PUSH_FEEDBACK_TOOL_COVERAGE}.
 *
 * Il LIT la matrice déjà calculée par `AccountInterestPenetrabilityService.matrixFor`
 * (la MÊME que la fiche compte et le panneau Pilotage) — aucune table ni clé
 * de `raw_analysis` ajoutée. La bulle Laura de la démonstration n'appelle
 * aucun outil (`demoTurn`, #1942.2).
 */
export const DEMO_ACCOUNT_INTEREST_PENETRABILITY_TOOL_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> =
  {
    state: 'vide_a_dessein',
    reason:
      "#3258.14 (épopée #3362, lot E25 30/09) — l'outil de chat `get_account_interest_penetrability` (apps/ia/app/services/chat_tools.py, relayé par POST /internal/copilot/account/interest-penetrability) lit la matrice déjà calculée par AccountInterestPenetrabilityService.matrixFor (la même que la fiche compte et le panneau Pilotage), il n'écrit rien. Il n'ajoute ni table ni clé de raw_analysis : les deux gardes de demo-coverage.spec.ts restent aveugles à lui, même motif que get_consultant_push_feedback (DEMO_CONSULTANT_PUSH_FEEDBACK_TOOL_COVERAGE). Rien à semer : la bulle Laura de la salle de démonstration n'appelle aucun outil de chat (demoTurn, #1942.2).",
  }

/**
 * #2900 (#2415.10, LOT c6 26/09/2026) — L'OUTIL DE CHAT `get_confirmed_revenue` :
 * VIDE À DESSEIN, MÊME MOTIF QUE {@link DEMO_CONSULTANT_PUSH_FEEDBACK_TOOL_COVERAGE}.
 *
 * Le CA confirmé (l'encaissé moins le contesté) est relayé TEL QUEL par un
 * outil de chat neuf (`apps/ia/app/services/chat_tools.py`, pont
 * `POST /internal/copilot/finance/confirmed-revenue`) — aucune table ni clé
 * de `raw_analysis` ajoutée : les deux gardes de `demo-coverage.spec.ts`
 * restent aveugles à lui. Rien à semer : la bulle Laura de la démonstration
 * n'appelle aucun outil (`demoTurn`, #1942.2).
 */
export const DEMO_CONFIRMED_REVENUE_TOOL_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2900 (#2415.10, LOT c6 26/09) — l'outil de chat `get_confirmed_revenue` (apps/ia/app/services/chat_tools.py, relayé par POST /internal/copilot/finance/confirmed-revenue) lit le CA confirmé déjà calculé par RevenueService.confirmedRevenue, il n'écrit rien. Il n'ajoute ni table ni clé de `raw_analysis` : les deux gardes de `demo-coverage.spec.ts` restent aveugles à lui, même motif que `get_consultant_push_feedback` (DEMO_CONSULTANT_PUSH_FEEDBACK_TOOL_COVERAGE). Rien à semer : la bulle Laura de la salle de démonstration n'appelle aucun outil de chat (`demoTurn`, #1942.2).",
}

/**
 * Épopée #2857 (#2201.31, 26/09/2026) — L'OUTIL DE CHAT
 * `explain_approval_card` : VIDE À DESSEIN, MÊME MOTIF QUE
 * {@link DEMO_CONSULTANT_PUSH_FEEDBACK_TOOL_COVERAGE}.
 *
 * « Demander une explication » sur une carte de validation en attente est LU
 * par un outil de chat neuf (`apps/ia/app/services/chat_tools.py`, relayé par
 * `POST /internal/copilot/approvals/explain`), jamais écrit — aucune table ni
 * clé de `raw_analysis` ajoutée : les deux gardes de `demo-coverage.spec.ts`
 * restent aveugles à lui, pour la même raison que `web_search`. Rien à semer :
 * la bulle Laura de la démonstration n'appelle aucun outil (`demoTurn`,
 * #1942.2).
 */
export const DEMO_EXPLAIN_APPROVAL_CARD_TOOL_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "Épopée #2857 (#2201.31) — l'outil de chat `explain_approval_card` (apps/ia/app/services/chat_tools.py, relayé par POST /internal/copilot/approvals/explain) lit les faits déjà stockés d'une demande d'approbation (`summary`, `required_level`, `reason`), il n'en écrit aucun. Il n'ajoute ni table ni clé de `raw_analysis` : les deux gardes de `demo-coverage.spec.ts` restent aveugles à lui, même motif que `web_search` (DEMO_WEB_SEARCH_COVERAGE) et que `get_consultant_push_feedback` (DEMO_CONSULTANT_PUSH_FEEDBACK_TOOL_COVERAGE). Rien à semer : la bulle Laura de la salle de démonstration n'appelle aucun outil de chat (`demoTurn`, #1942.2).",
}

/**
 * #2452 (22/09/2026) — « APPROFONDIR » SOUS UNE RÉPONSE DE /chat : SEEDÉ.
 *
 * Ni table ni clé `raw_analysis` neuve : le devis (`POST /analysis/deepen/quote`)
 * RELIT les colonnes que le semis écrit déjà sur chaque dossier de la salle —
 * `status: 'completed'`, `entities_refreshed_at`, `strategy_refreshed_at`
 * (`DemoSeedService`) — et le grand livre, vide en démo (les actions y sont
 * gratuites) : la ligne « déjà investis » ne s'affiche donc pas, jamais un zéro.
 *
 * Le LANCEMENT, lui, est refusé à dessein par `demoGuard`
 * (`analysis-ondemand.service.ts`) : les dossiers de démo sont figés, et le
 * résumé le dit « non abouti, rien débité » avec le message du serveur.
 *
 * Preuve recalculée, pas relue : `demo-chat-deepen-coverage.spec.ts` fait
 * tourner `buildDeepenQuote` sur les dossiers RÉELS de `DEMO_DOSSIERS`.
 *
 * #2452.1 / épopée #2907 (24/09/2026) — le MÊME repli se monte sous les
 * réponses de la bulle Laura (`LauraBubblePanel`) : même composant, même
 * devis, mêmes dossiers semés. En démonstration, la réponse écrite d'avance
 * (`demoTurn`) posée depuis un dossier de la salle porte ce compte — preuve
 * écran : `LauraDock.deepen.test.tsx` (cas « salle de démonstration »).
 *
 * #2263.20 (25/09/2026) — « vérifier un poste » (`verify_position`, axe
 * `positions`) rejoint la table d'actions : MÊME phase `entities` que
 * `compare_subsidiaries`, donc MÊME colonne déjà semée
 * (`entities_refreshed_at`) — aucun semis neuf. `demo-chat-deepen-coverage
 * .spec.ts` la couvre déjà : `it.each(deepenActionsFor(2))` itère sur TOUTES
 * les actions de la table, la nouvelle y compris.
 */
export const DEMO_CHAT_DEEPEN_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#2452 (22/09/2026) — le devis d'approfondissement relit les colonnes déjà semées sur chaque dossier de la salle (status completed, entities_refreshed_at, strategy_refreshed_at) : chaque action proposée rend des lignes « à relancer » et un coût supplémentaire. Le lancement est refusé à dessein par demoGuard (dossiers de démo figés) et le résumé le nomme « non abouti, rien débité ». Preuve : demo-chat-deepen-coverage.spec.ts exécute buildDeepenQuote sur DEMO_DOSSIERS. #2452.1 (24/09/2026) : le même repli sous les réponses de la bulle Laura, même devis sur les mêmes dossiers (LauraDock.deepen.test.tsx). #2263.20 (25/09/2026) : « vérifier un poste » rejoint la table, même phase entities, même colonne semée, même spec paramétrée.",
}

/**
 * #2337 (23/09/2026) — LE TERRAIN DE JEU MULTI-TALENTS DANS /chat : SEEDÉ.
 *
 * Ni table ni clé `raw_analysis` neuve : l'outil `plan_talent_territory` LIT le
 * vivier (`consultants`) et les besoins ouverts (`project_needs`), déjà classés
 * SEEDÉS. Le `/chat` de démonstration étant SCRIPTÉ (`demo-chat-script.ts`,
 * aucun appel réseau), la salle rejoue l'amorce `p-territory-plan` : ses deux
 * cartes sont la sortie du compilateur réel (`territory_planner.py`) sur trois
 * profils de `DEMO_CONSULTANTS` et trois besoins ouverts de SNCF.
 *
 * Preuve recalculée, pas relue : `demo-talent-territory-coverage.spec.ts`
 * confronte chaque nom, disponibilité, zone, intitulé de besoin et compétence
 * citée par l'amorce au jeu seedé. Ce qui n'est pas seedé (note /25 du client
 * d'exemple, porteur, tarif) reste nommé « non évalué » sur la carte.
 */
export const DEMO_CHAT_TALENT_TERRITORY_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#2337 (23/09/2026) — l'amorce scriptée « J'ai trois consultants disponibles » rejoue la sortie du compilateur territory_planner.py sur trois profils de DEMO_CONSULTANTS et trois besoins ouverts de SNCF (openNeeds) : un compte fusionné, un talent d'entrée, un alternatif, non-évalués nommés. Preuve : demo-talent-territory-coverage.spec.ts confronte l'amorce au jeu seedé.",
}

/**
 * #2451.9 (23/09/2026) — RÉGLAGES > LAURA, MODE PAR DÉFAUT DE L'ESPACE : SEEDÉ
 * PAR LE DÉFAUT DE COLONNE, AUCUN CODE DE SEMIS SUPPLÉMENTAIRE.
 *
 * `workspaces.default_context_mode` (migration
 * `1796000665432-WorkspaceDefaultContextMode`) est une COLONNE de plus sur une
 * table qui existe depuis l'origine — même situation que `workspaces.timezone`
 * ({@link DEMO_WORKSPACE_TIMEZONE_COVERAGE}) et `linkedin_url`
 * ({@link DEMO_LINKEDIN_ONLY_CONTACT_COVERAGE}) : ni table ni clé de
 * `raw_analysis` neuve, donc les deux gardes de `demo-coverage.spec.ts` sont
 * aveugles à cette nouveauté, et une garde aveugle n'est pas une exemption —
 * d'où cette entrée.
 *
 * Contrairement à `timezone` (colonne NULLABLE, sans défaut significatif),
 * cette colonne est `NOT NULL DEFAULT 'my_activity'` — vérifié par
 * `1796000665432-WorkspaceDefaultContextMode.spec.ts` (« défaut "my_activity" »).
 * L'espace de démonstration n'a reçu AUCUNE migration de données particulière :
 * il porte donc la même valeur par défaut que tout espace neuf. Réglages >
 * Laura (`/settings/laura-mode`) y lit une valeur RÉELLE — pas fictive, pas
 * vide — parce que c'est la valeur que porterait n'importe quel espace qui
 * n'a jamais réglé ce champ, démo ou non. Écrire un semis dédié
 * (`DemoSeedService`) pour reproduire exactement le défaut du schéma ajouterait
 * du code sans changer une seule ligne affichée.
 *
 * Un administrateur qui CHANGE ce réglage en salle de démo le change pour de
 * vrai (`WorkspaceLauraModeService`, owner/admin) : `demo-reset.service.ts`
 * n'a rien à restaurer de spécifique, la remise à zéro générale de l'espace
 * (même mécanique que tout autre réglage d'espace) suffit.
 */
export const DEMO_WORKSPACE_LAURA_MODE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#2451.9 (23/09/2026) — `workspaces.default_context_mode` (migration 1796000665432-WorkspaceDefaultContextMode) est une colonne de plus sur une table qui existe depuis l'origine, NOT NULL DEFAULT 'my_activity' (vérifié par 1796000665432-WorkspaceDefaultContextMode.spec.ts) : ni table ni clé de raw_analysis neuve, donc les deux gardes de demo-coverage.spec.ts sont aveugles à cette nouveauté. L'espace de démonstration n'a reçu aucune migration de données particulière : il porte le même défaut que tout espace neuf, et Réglages > Laura (/settings/laura-mode) y lit une valeur réelle, jamais fictive ni vide. Rien à semer : reproduire le défaut du schéma par du code de semis dédié n'afficherait rien de différent.",
}

/**
 * #2128.17 — LA COLLISION DE SOLLICITATION PAR CONTACT (`ContactHeader`,
 * 24/09/2026). VIDE À DESSEIN, MÊME MOTIF QUE `assigned_to` CI-DESSUS.
 *
 * `contact.solicitation` (`ContactsService.resolveContactSolicitation`) lit
 * `user_actions WHERE contact_id = $2 AND user_id <> $3` — ni une table ni
 * une clé `raw_analysis` neuve (`user_actions` est déjà seedée), donc les deux
 * gardes de `demo-coverage.spec.ts` sont aveugles à ce nouveau LECTEUR, et une
 * garde aveugle n'est pas une exemption.
 *
 * Une salle de démonstration a UN SEUL occupant : chaque ligne `user_actions`
 * semée porte le `user_id` de ce même occupant (`DemoSeedService.seedWorkspace`).
 * La clause `user_id <> $3` du service n'a donc STRUCTURELLEMENT aucun autre
 * `user_id` à trouver — `solicitation` reste `null`, et c'est vrai : personne
 * d'autre n'a sollicité ce contact, faute d'un second commercial dans la
 * salle. Semer un `user_id` fictif inventerait un collègue qui n'existe pas.
 */
export const DEMO_CONTACT_SOLICITATION_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2128.17 (24/09/2026) — `contact.solicitation` (ContactsService.resolveContactSolicitation) lit `user_actions WHERE contact_id = $2 AND user_id <> $3` : ni table ni clé de raw_analysis neuve (user_actions est déjà seedée), donc les deux gardes de demo-coverage.spec.ts sont aveugles à ce nouveau lecteur. Une salle de démonstration a un seul occupant : chaque ligne user_actions semée porte le user_id de ce même occupant, donc `user_id <> $3` ne trouve structurellement personne — `solicitation` reste `null`, ce qui est vrai (aucun collègue n'a sollicité ce contact, faute d'un second commercial dans la salle). Semer un user_id fictif inventerait un collègue qui n'existe pas.",
}

/**
 * #2128.19 — L'ANALYSE EN COURS D'UN COLLÈGUE (`AccountCollaborationBand`,
 * 24/09/2026). VIDE À DESSEIN, MÊME MOTIF QUE CI-DESSUS.
 *
 * `account.active_analysis_by_colleague`
 * (`AccountsService.resolveActiveAnalysisByColleague`) lit
 * `analysis_runs WHERE account_id = $1 AND workspace_id = $2 AND user_id <> $3
 * AND status = 'analyzing'` — `analysis_runs` est déjà seedée, aucune table
 * ni clé `raw_analysis` neuve.
 *
 * Même raison que {@link DEMO_CONTACT_SOLICITATION_COVERAGE} : un seul
 * occupant sème tous les runs de la salle sous SON `user_id`, et les comptes
 * de démonstration sont seedés `status: 'completed'` — jamais `'analyzing'`
 * après la constitution de la salle. `user_id <> $3` ne trouve donc jamais de
 * ligne, `active_analysis_by_colleague` reste `null`, et c'est vrai : aucune
 * analyse n'est réellement en cours dans une salle figée, par personne.
 */
export const DEMO_ACCOUNT_ACTIVE_ANALYSIS_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2128.19 (24/09/2026) — `account.active_analysis_by_colleague` (AccountsService.resolveActiveAnalysisByColleague) lit `analysis_runs WHERE account_id = $1 AND workspace_id = $2 AND user_id <> $3 AND status = 'analyzing'` : analysis_runs est déjà seedée, ni table ni clé de raw_analysis neuve. Un seul occupant sème tous les runs de la salle sous son propre user_id, et les comptes de démonstration sont seedés `status: 'completed'` — jamais `'analyzing'` après la constitution de la salle. `user_id <> $3` ne trouve donc jamais de ligne : `active_analysis_by_colleague` reste `null`, ce qui est vrai — aucune analyse n'est réellement en cours dans une salle figée.",
}
/**
 * #2306.24 (24/09/2026) — LA BANNIÈRE « COMPTES CONCERNÉS PAR CE CHANGEMENT »
 * (`ImpactedAccountsBanner.tsx`) N'A NI TABLE NI CLÉ `raw_analysis` À ELLE —
 * elle lit `analysis_runs.profile_provenance ->> 'esnProfileVersion'`
 * (`AnalysisRunsService.listAccountsWithOlderProfile`), une clé JSONB d'une
 * table qui n'est PAS dans `DEMO_SEEDED_TABLES`.
 *
 * Vide à dessein, et ce n'est pas une nouvelle raison à inventer :
 * `analysis_runs` porte déjà sa classification table entière plus haut
 * (« Aucun run réel ne tourne en démo — en fabriquer un ferait mentir la
 * page "Analyses" »). Sans ligne `analysis_runs`, la jointure LATERAL de
 * `listAccountsWithOlderProfile` ne retourne AUCUN compte pour AUCUN
 * workspace — la bannière (present-only) ne s'affiche donc jamais en salle,
 * exactement la même vérité que la ligne unitaire `AccountProfileProvenance`
 * (#2306.25, non classée séparément pour la même cause).
 */
export const DEMO_IMPACTED_ACCOUNTS_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2306.24 (24/09/2026) — `ImpactedAccountsBanner.tsx` lit `analysis_runs.profile_provenance ->> 'esnProfileVersion'` via `AnalysisRunsService.listAccountsWithOlderProfile` : ni table ni clé de raw_analysis neuve, la garde de demo-coverage.spec.ts est aveugle à cette nouveauté. Vide à dessein, cause écrite : depuis #3235 (05/10/2026) `analysis_runs` porte deux runs de Société Générale (`DEMO_ANALYSIS_RUNS`, pour la révision de verdict), mais AUCUN ne porte de `profile_provenance` (NULL = version de profil inconnue, jamais devinée) ; un run sans provenance ne fait jamais d'un compte un compte impacté. Sans `esnProfileVersion` sur le dernier run, la jointure LATERAL du service ne retourne jamais de compte impacté en salle — la bannière (present-only) reste invisible, honnête, pas cassée.",
}

/**
 * #2284 — Entity Resolver P0 : `raw_analysis.entity_resolution`. SEEDÉE.
 *
 * Deux états sont semés, sur des faits DÉJÀ présents dans le jeu : Société
 * Générale `resolved` / `parent_company` (SIREN, quatre filiales =
 * `subsidiaries`, confiance 86 = la désambiguïsation semée à côté) ; SNCF
 * `resolved` / `parent_company` (SIREN, cinq filiales, confirmée par l'espace) ;
 * Groupe BPCE `unresolved` (son `siren: null` est un choix écrit : aucun registre ne le
 * corrobore). L'état `ambiguous` n'est PAS semé : il exigerait d'inventer des
 * candidats de registre (SIREN d'entreprises réelles) — « jamais de donnée
 * fictive » l'emporte ; sa carte est prouvée par `EntityResolutionCard.test.tsx`.
 * `out_of_scope` (#2284.35, 26/09/2026 — la cible résolue au registre est une
 * personne, un partenariat ou un nom hors périmètre) n'est PAS semé non plus,
 * même raison : le jeu de démo cite des entreprises RÉELLES du golden set
 * (SNCF, Société Générale…), aucune ne se classe hors périmètre — inventer
 * un dirigeant fictif juste pour peupler cet état fabriquerait une donnée que
 * personne n'a collectée. Preuve par le test unitaire du compositeur
 * (`test_entity_resolution.py::test_a_person_registered_as_a_company_is_out_of_scope_not_a_legal_entity`),
 * pas par le jeu de démo. Preuve recalculée, pas relue :
 * `demo-entity-resolution-coverage.spec.ts` passe les blocs semés au VRAI
 * contrat `entityResolutionSchema`.
 *
 * #2265.2 / #2284.15 / #2284.22 (#2851, #2978, lots h9 27/09/2026 et V18
 * 28/09/2026) — les six dossiers réels n'exerçaient ensemble ni la source
 * `size` (« Taille (registre) »), ni la source `workspace_data` (« Rapproché
 * d'un compte de ton espace »), ni la source `official_site` (« Site
 * officiel » — SIREN lu sur les mentions légales du site, câblée le
 * 28/09/2026), ni le type `kind: 'platform'` (« Plateforme ») : les quatre
 * sont câblées en production (SHA `4ebfc48e43` puis lot V18) mais jamais
 * montrées ensemble en salle. Elles l'ont été par deux comptes FICTIFS
 * (une plateforme d'intermédiation, puis un acheteur public portant aussi
 * `kind: 'end_client'` et `former_legal_names`), retirés par décision Louis
 * 04/10/2026 (« je ne veux plus d'exemples comme ça ») : aucun vrai compte de
 * la salle n'est une plateforme d'intermédiation ni un acheteur public, ces
 * capacités sont donc VIDES À DESSEIN en salle — la seule exception écrite au
 * principe « ne jamais déplacer vers vide à dessein pour faire passer ».
 *
 * #2284.26 (#2978, lot SRC2 28/09/2026) — la source `alias` (le domaine que
 * `entity_resolution.attach_alias_domain` rattache quand la mémoire marché le
 * PROUVE, `MarketMemoryService.aliasProvenDomain`) reste VIDE en démo à
 * dessein, comme sa cousine #2265.2 (`_has_alias`, déjà sans démo avant ce
 * lot) : elle ne sert QUE sur un compte sans domaine déjà connu
 * (`attach_alias_domain` n'écrase jamais un domaine), et aucun des dossiers
 * réels n'est dans ce cas — Groupe BPCE (`unresolved`) porte déjà `domain:
 * 'groupebpce.com'` via `official_domain`. Fabriquer un troisième compte fictif
 * pour la seule étiquette `alias` inventerait un scénario déconnecté du jeu de
 * démo ; prouvé par le test unitaire (`TestAttachAliasDomain`,
 * `test_entity_resolution.py`) et par `market-memory.service.spec.ts`
 * (`aliasProvenDomain`).
 */
export const DEMO_ENTITY_RESOLUTION_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#2284 (24/09/2026) — raw_analysis.entity_resolution semé sur Société Générale (resolved, maison mère), SNCF (resolved puis confirmée par l’espace, #2284.67 — table entity_resolution_corrections) et Groupe BPCE (unresolved) ; les états ambiguous, out_of_scope (#2284.35, 26/09/2026) et historical (#2284.33, lot SRC2 28/09/2026) restent non semés à dessein (ils inventeraient des candidats de registre, un dirigeant fictif, ou demanderaient un acheteur public dans la salle), prouvés par le test de la carte et par test_entity_resolution.py. VIDE À DESSEIN — décision Louis 04/10 : plus aucun compte fictif dans la salle ; aucun vrai compte de la salle n’est une plateforme d’intermédiation / un acheteur public. Les sources size/workspace_data/official_site et le type platform (#2265.2/#2284.15/#2284.22), le type end_client et former_legal_names (#2284.17/.58) ne se montrent donc plus en salle ; ils restent prouvés par entity-resolution-card et test_entity_resolution.py.',
}

/**
 * #2415.8 — DEMO_TIMESHEET_MISSION_GROUP_COVERAGE (23/09/2026) était un
 * DOUBLON sans appelant réel (aucun spec ne le lisait — « commentaire ≠
 * preuve ») de {@link DEMO_CRA_MULTI_CONSULTANT_GROUP_COVERAGE} ci-dessus
 * (24/09/2026, câblé à `demo-cra-multi-consultant-group-coverage.spec.ts`
 * qui LIT le composant réel). Retiré à cette fusion (vague 31+33, 24/09) en
 * appliquant le même arbitrage déjà écrit ci-dessus pour le doublon
 * `fix/w43-fermer-3-24-09`/`fix/w43-fermer-4-24-09` : seule l'entrée avec un
 * appelant réel survit.
 */

/**
 * #2836 — le MANAGER CLIENT (`missions.client_manager_contact_id`), colonne
 * NEUVE sur une table déjà seedée : la garde de tables y est aveugle, d'où
 * cette classification et sa garde dédiée.
 */
export const DEMO_MISSION_CLIENT_MANAGER_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#2836 — `missions.client_manager_contact_id` (migration `1796001525994-MissionClientManagerContact.ts`, additive/nullable, FK `contacts` ON DELETE SET NULL) est une colonne NEUVE sur `missions`, table déjà classée SEEDÉE : la garde de tables de `demo-coverage.spec.ts` y est donc aveugle, et une garde aveugle n'est pas une exemption. Sans semis, le résumé des missions du compte (#2124.20) n'afficherait jamais la ligne « Manager client » et le panneau de planification resterait « Non désigné » partout. `DEMO_MISSION_CLIENT_MANAGER` (demo-dataset.ts) désigne Directeur technique — entité numérique voyageurs, DSI SIMULÉ du client d'exemple, sur « Fiabilisation plateforme — renfort exploitation » ; `DemoSeedService` l'écrit juste après l'INSERT de la mission (UPDATE scopé à l'espace, jamais un `$n` inséré au milieu de l'INSERT que les gardes lisent par rang). Les autres missions restent non désignées : l'état « aucune ligne » doit aussi se voir. Garde : `demo-mission-client-manager-coverage.spec.ts`, qui sait dire non.",
}

/**
 * Refonte Théo MISSIONS-A (23/10) — l'objectif et le périmètre de mission (`missions.objective` /
 * `missions.perimeter`), colonnes d'une table déjà seedée : la garde de tables y est aveugle.
 */
export const DEMO_MISSION_FRAME_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'Refonte Théo MISSIONS-A (23/10) — la carte d’identité du dossier de mission (maquette `missions-dossier`) écrit l’objectif et le périmètre sous les dates. `missions.objective` et `missions.perimeter` sont des colonnes de `missions`, table déjà classée SEEDÉE : la garde de tables de `demo-coverage.spec.ts` y est aveugle, et une garde aveugle n’est pas une exemption. `DEMO_MISSION_FRAME` (demo-dataset.ts) cadre « Fiabilisation plateforme — renfort exploitation » ; `DemoSeedService` l’écrit juste après l’INSERT de la mission (UPDATE scopé à l’espace, jamais un `$n` inséré au milieu de l’INSERT que les gardes lisent par rang). Les autres missions restent sans cadre : l’absence ne fait aucune ligne. Garde : `demo-mission-frame-coverage.spec.ts`, qui sait dire non.',
}

/**
 * #3413 « autre BU » — le TRANSFERT de BU d'une mission (`missions.business_unit_id`, migration
 * `1796421837419`) : colonne NEUVE sur une table déjà seedée, d'où cette classification et sa garde.
 */
export const DEMO_MISSION_BUSINESS_UNIT_TRANSFER_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#3413 (décision Louis 02/10, lot D2) — `missions.business_unit_id` (migration `1796421837419-MissionBusinessUnit.ts`, additive/nullable) est une colonne NEUVE sur `missions`, table déjà classée SEEDÉE : la garde de tables y est aveugle. Le semis (`DEMO_MISSION_BUSINESS_UNIT_TRANSFER`) transfère UNE mission de la BU de son compte (« Agence Lyon ») vers « BU Banque & Assurance », et écrit la ligne de journal que le geste réel écrit (`record_field_audit`, règle `mission_business_unit_transfer`, source `human`) : la ligne « BU propriétaire » de la fiche et l'Historique s'ouvrent sur un vrai transfert, et le filtre BU de /missions range la mission sous sa BU cible. Les autres missions n'en portent pas — « BU de son compte » doit aussi se voir.",
}

/**
 * #3219 (#190.2 côté CONTACT, décision Louis 11/10/2026) — LE CONTRÔLE AVANT ACTION D'UN CONTACT :
 * SEEDÉ. Aucune table neuve (`record_field_audit`, `contacts` sont déjà classées) : la question
 * « et en démo, ça montre quoi ? » porte sur ce que `GET /contacts/:id/preflight` et
 * `get_contact_preflight` y retrouvent. Garde : `demo-contact-preflight-coverage.spec.ts`.
 */
export const DEMO_CONTACT_PREFLIGHT_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#3219 (#190.2 côté contact) — `DEMO_CONTACT_SCOPE_DIFFERENCE` sème deux relevés `pipeline` du POSTE du siège anonyme « Directeur technique — entité numérique voyageurs » (SNCF), chacun avec la portée que son analyse a déclarée (« Groupe entier », puis « Filiales ») et écrits comme `ProvenanceService.commit` les écrit : la fiche de ce contact ouvre « Avant d’agir sur ce contact » sur un vrai écart de portée — deux vérités, aucune valeur choisie —, et Laura le relit par le même calcul. Les autres fiches n’ont pas d’écart : « aucune carte » doit aussi se voir. Le chat de la salle répond `p-contact-preflight` en citant ces deux relevés.',
}

/**
 * #2207.67-74 — LA RECHERCHE GLOBALE MULTI-ENTITÉS (épopée #3015, raccourci
 * `⌘⇧K`) : SEEDÉE, sans semis NEUF.
 *
 * Elle n'ajoute ni table ni clé de `raw_analysis` : les deux gardes de
 * `demo-coverage.spec.ts` sont aveugles à elle, et une garde aveugle n'est pas
 * une exemption — d'où cette entrée. Chacun de ses sept groupes RÉUTILISE un
 * appelant qui existait déjà (`accountsApi.list({ q })`, `GET /accounts?q=` —
 * `contactsApi.listPage({ q })`, `GET /contacts?q=` — `openNeedsApi.list`,
 * `GET /projects/needs?q=` — `consultantsApi.search({ q })`, `GET /talents?q=`
 * — `missionsApi.list()` et `planItemsApi.mine()`, filtrés côté client faute
 * de `q` serveur — `SETTINGS_SECTIONS`, statique, sans API) sur des tables
 * DÉJÀ classées SEEDÉES (`accounts`, `contacts`, `open_needs`, `consultants`,
 * `missions`, `action_plan_items`) : `demo-dataset.ts` porte huit comptes
 * nommés et trente-quatre contacts nommés à ce jour, et les cinq autres
 * groupes héritent des mêmes dossiers de démonstration. Taper un nom réel de
 * la salle (« Renault », « Dupont »…) trouve donc un résultat sans qu'aucun
 * semis n'ait à changer — exactement l'arbitrage déjà tenu par
 * `DEMO_CHAT_DEEPEN_COVERAGE` un peu plus haut. Le paramétrage, seul groupe
 * sans donnée d'espace, RESTE seedé par construction : c'est un index de
 * routes statique (`items.settings.ts`), pas une lecture d'espace.
 */
export const DEMO_GLOBAL_SEARCH_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#2207.67-74 (épopée #3015) — la recherche globale multi-entités (⌘⇧K) n'ajoute ni table ni clé de raw_analysis : les deux gardes de demo-coverage.spec.ts sont aveugles à elle, et une garde aveugle n'est pas une exemption. Ses sept groupes réutilisent chacun un appelant qui existait déjà (accountsApi.list({q}), contactsApi.listPage({q}), openNeedsApi.list, consultantsApi.search({q}), missionsApi.list() + filtre client, planItemsApi.mine() + filtre client, SETTINGS_SECTIONS statique) sur des tables déjà classées SEEDÉES (accounts, contacts, open_needs, consultants, missions, action_plan_items). demo-dataset.ts porte huit comptes nommés et trente-quatre contacts nommés ; les autres groupes héritent des mêmes dossiers. Taper un nom réel de la salle trouve donc un résultat sans qu'aucun semis n'ait à changer.",
}

/**
 * #3265.13 (épopée #3287) — LE DERNIER RÉSULTAT DÉCLARÉ, SUR LA CARTE DU
 * TABLEAU DE BORD AUJOURD'HUI : SEEDÉ, sans semis NEUF.
 *
 * `PriorityCard` (`apps/web/.../briefing/view/PriorityCard.tsx`) lit
 * désormais `usePlanItems(accountId)` et affiche le dernier résultat déclaré
 * (`selectAccountLastOutcome`) sous la carte d'un compte — même lecture que
 * le Plan de compte et `ContactLastOutcomeCard` (fiche Contact, lot
 * précédent), sur `action_plan_items`, déjà classée SEEDÉE ci-dessus. Aucune
 * table neuve, aucune clé de `raw_analysis` neuve : les deux gardes de
 * `demo-coverage.spec.ts` sont aveugles à cette ligne, et une garde aveugle
 * n'est pas une exemption — d'où cette entrée.
 *
 * `BriefingService.buildDemo` porte les trois PREMIERS dossiers seedés sur
 * « Aujourd'hui » (`accounts.find({ take: 3 })`, sans `ORDER BY` — l'ordre
 * d'insertion de `DEMO_DOSSIERS` fait foi, déjà documenté ci-dessus : Société
 * Générale en tête, Groupe BPCE ensuite, puis SNCF). Sans une ligne FAITE
 * portant une issue sur l'un des trois, la ligne resterait invisible en
 * salle malgré le semis existant. `DEMO_PLAN_TASKS` porte donc une action
 * FAITE de plus sur SNCF (« Confirmer le besoin de renfort sur la refonte
 * applicative », `outcome: 'qualified'`) — le libellé reprend un fait
 * déjà semé (`sncfChallenges`), jamais inventé pour l'occasion, et
 * `dueInDays: null` la sort du plan à 4 semaines comme toute tâche FAITE
 * (même convention que SNCF, section « deux tâches déjà FAITES »).
 * Garde : `demo-today-last-outcome-coverage.spec.ts`.
 */
export const DEMO_TODAY_LAST_OUTCOME_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#3265.13 (épopée #3287) — le dernier résultat déclaré sur la carte « Aujourd'hui » (PriorityCard, usePlanItems, selectAccountLastOutcome) n'ajoute ni table ni clé de raw_analysis : les deux gardes de demo-coverage.spec.ts sont aveugles à elle, et une garde aveugle n'est pas une exemption. Elle relit action_plan_items, déjà classée SEEDÉE. BriefingService.buildDemo porte les trois premiers dossiers seedés (ordre d'insertion de DEMO_DOSSIERS : Société Générale, Groupe BPCE, SNCF) ; DEMO_PLAN_TASKS porte désormais une action FAITE avec issue sur SNCF (outcome: 'qualified', libellé repris d'un fait déjà semé, sncfChallenges) pour que la ligne se voie réellement en salle, pas seulement au test unitaire.",
}

/**
 * #2178 — LE BANDEAU « AUCUN PROFIL DÉFENDABLE » ET LE PANNEAU DU PROCHAIN
 * GESTE (`NoMatchCausesBanner` / `NextBestMoveActions`, `MatchDrawer.tsx`) :
 * SEEDÉS, mais SUR AUCUNE TABLE NEUVE.
 *
 * Même famille structurelle que {@link DEMO_DISCOVER_CONTRACT_MODEL_COVERAGE}
 * plus haut : `recommended: []` / `borderline: []` / `nextBestMove` ne sont
 * PAS des colonnes — ce sont des champs CALCULÉS d'un `MatchRun`
 * (`matching.service.ts` → `nextBestMoveOptions()`, `next-best-move.ts`),
 * jamais persistés tels quels. `project_needs`, la table qui les nourrit, est
 * classée SEEDÉE depuis longtemps (`DEMO_FLAGSHIP_NEED`, `DEMO_STAFFED_NEED`)
 * — la garde par table est donc AVEUGLE à la question « et le cas ZÉRO
 * résultat, la salle le montre ? », exactement comme elle l'était pour le
 * modèle de contrat de Découvrir. D'où cette entrée, écrite à la main plutôt
 * que déduite d'une garde générique.
 *
 * `DEMO_NO_DEFENDABLE_PROFILE_NEED` (`demo-dataset.ts`) — « Ingénieur
 * mainframe COBOL — maintien du cœur stocks », rattaché au client FICTIF
 * SNCF (`DEMO_DELIVERY_CLIENT`), SANS projet (même famille que
 * `seedNeedWithoutProject`, #2558.1) — porte DEUX compétences obligatoires
 * (COBOL, JCL) qu'AUCUN des sept profils du vivier de démonstration ne
 * détient : la même exclusion bloquante (`missing_required_skill`) frappe
 * donc les sept, et le calcul à la main du docblock de la constante (repris
 * et VÉRIFIÉ par le moteur réel dans
 * `demo-no-defendable-profile-coverage.spec.ts`) tient la correspondance de
 * chacun sous le seuil de 60/100 — pire cas à 41/100 (Yanis Berthier, dont
 * le secteur déclaré « Transport » matche le secteur du compte, un faux ami
 * mesuré à la main et INCLUS dans le calcul, pas ignoré). ⚠️ Rattaché à SNCF
 * LOGISTIQUE et à AUCUNE des trois sociétés RÉELLES de `DEMO_DOSSIERS` :
 * `demo-seed.service.spec.ts` (« ne pose aucun de ces rôles sur l'une des
 * trois sociétés RÉELLES ») interdit qu'un rôle ouvert pende d'une entreprise
 * réelle — poser CE besoin sur l'un des trois dossiers aurait
 * affirmé, sans preuve, quelque chose sur son recrutement. `MatchingService.
 * execute`, en tournant réellement sur ce besoin, rend donc `recommended: []`
 * ET `borderline: []` — jamais une valeur inventée : c'est le RÉSULTAT d'un
 * classement RÉEL sur une donnée qui existe (doctrine « aucune donnée
 * fictive », docblock de ce fichier et de `demo-dataset.ts` §44-49).
 *
 * Garde dédiée : `demo-no-defendable-profile-coverage.spec.ts`, qui importe
 * `evaluateCandidate` et `nextBestMoveOptions` DEPUIS le moteur de matching
 * (jamais recopiés) et prouve, sur le meilleur cas de chacun des sept
 * profils, que le classement produit bien le zéro et que le panneau du
 * prochain geste rend un tableau non vide — comme
 * `demo-reverse-prospects-coverage.spec.ts` le fait pour sa propre capacité.
 */
export const DEMO_NO_MATCH_NEXT_BEST_MOVE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#2178 — `NoMatchCausesBanner` / `NextBestMoveActions` (`MatchDrawer.tsx`) sont des champs CALCULÉS d'un `MatchRun` (`nextBestMoveOptions()`, `matching.service.ts`), jamais des colonnes : la garde de tables de `demo-coverage.spec.ts` est donc aveugle à la question « et le zéro résultat, la salle le montre ? », `project_needs` étant déjà classée SEEDÉE. `DEMO_NO_DEFENDABLE_PROFILE_NEED` (demo-dataset.ts) — « Ingénieur mainframe COBOL — maintien du cœur stocks », rattaché au client FICTIF SNCF (JAMAIS à l'une des six sociétés RÉELLES de `DEMO_DOSSIERS`, qu'un rôle ouvert ne peut pas nommer — `demo-seed.service.spec.ts` le garde), sans projet — exige deux compétences (COBOL, JCL) absentes des sept profils du vivier : l'exclusion bloquante `missing_required_skill` frappe les sept, et leur correspondance calculée reste sous le seuil de 60/100, pire cas à 41/100 (calcul écrit dans le docblock de la constante, VÉRIFIÉ par le moteur réel — pas recopié — dans `demo-no-defendable-profile-coverage.spec.ts`). `MatchingService.execute`, en tournant réellement contre ce besoin, rend donc `recommended: []` ET `borderline: []` — un résultat de classement RÉEL, jamais un `MatchRun` fabriqué, ce que la doctrine « aucune donnée fictive » interdit.",
}

/**
 * #2840 (#2441.13, 25/09/2026) — LE MODE DÉGRADÉ ANNONCÉ (`context.partial`) :
 * VIDE À DESSEIN, et la raison n'a pas été écrite pour faire passer un test.
 *
 * `context.partial` est posé par `apps/ia/app/routers/chat.py`
 * (`_partial_response`) quand un VRAI tour a dépassé le plafond de temps ou
 * essuyé une panne — jamais par autre chose. Ni une table ni une clé de
 * `raw_analysis` : la garde de `demo-coverage.spec.ts` ne pose donc jamais la
 * question, comme pour `DEMO_ANALYSIS_PARTIALS_COVERAGE` ci-dessus.
 *
 * Le moteur du copilote en espace de démonstration (`demo-turn.ts`) ne fait
 * **AUCUN appel réseau** — c'est écrit dans son propre docblock, tranché par
 * Louis le 03/09/2026 (« coque RÉELLE, conversation VIDE ») pour qu'un lien
 * parti à des inconnus ne facture jamais Claude sur un espace que personne ne
 * surveille. Il répond toujours une réplique du script
 * (`demo-chat-script.ts`), synchrone, ou le repli hors-script — jamais
 * `POST /ia/chat`, la SEULE porte qui peut arrêter un tour (GA-237). Un tour
 * scripté ne peut donc, PAR CONSTRUCTION, ni dépasser un plafond de temps ni
 * essuyer une panne réseau : `context.partial` n'est structurellement jamais
 * posé en démonstration. En scripter un déclencherait un badge « Réponse
 * partielle » sur une réponse en réalité complète — une donnée fictive au sens
 * strict de la doctrine, pas un trou de couverture.
 *
 * ⚠️ La classification est PROUVÉE, pas affirmée : `demo-turn.ts` n'importe ni
 * `ia.client`, ni `fetch`, ni aucun appel réseau — `demo-turn.network.test.ts`
 * le garde en source, dans le même esprit que le témoin réseau de
 * `demo-run.test.ts` pour `DEMO_ANALYSIS_PARTIALS_COVERAGE`.
 */
export const DEMO_CHAT_PARTIAL_REPLY_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2840 (#2441.13, 25/09/2026) — `context.partial` n'est posé que par un VRAI tour du service IA qui dépasse son plafond de temps ou essuie une panne (`apps/ia/app/routers/chat.py::_partial_response`). Le moteur de démonstration (`demo-turn.ts`) ne fait AUCUN appel réseau — tranché par Louis le 03/09/2026 pour qu'un lien parti à des inconnus ne facture jamais Claude — et répond toujours une réplique scriptée, synchrone. Un tour scripté ne peut PAR CONSTRUCTION ni dépasser un plafond ni essuyer une panne : `context.partial` n'est jamais posé en démonstration. Le scripter inventerait un badge « Réponse partielle » sur une réponse réellement complète — une donnée fictive, pas un trou de couverture. PROUVÉ en source par `demo-turn.network.test.ts` : aucun import réseau dans le moteur de démonstration.",
}

/**
 * #1952.32 (#2844, lot h9 27/09/2026) — « CE QUI DOIT ÊTRE VÉRIFIÉ »
 * (`CardResult.toVerify`) : NI TABLE NI CLÉ `raw_analysis` NOUVELLE — LA GARDE
 * NE POSE JAMAIS LA QUESTION, D'OÙ CETTE ENTRÉE. SEEDÉE, PAS RECALCULÉE PAR
 * LA GARDE : `demo-entity-resolution-coverage.spec.ts`-like re-preuve n'existe
 * pas ici, la preuve est dans `demo-long-job-coverage.spec.ts`.
 *
 * `toVerify` est une clé de plus dans `workflow_runs.result` (jsonb) : ni une
 * table, ni une clé de `accountAnalysisSchema` — les deux gardes de
 * `demo-coverage.spec.ts` sont aveugles à elle, comme au socle du guide
 * ci-dessus.
 *
 * Le champ ne se pose QUE sur une carte de suivi d'analyse `done` (voir
 * `CopilotCardService.settleAnalysisTracking`, #2844) — jamais sur un échec ou
 * une annulation, pour ne pas attribuer à un run une confiance mesurée par un
 * travail antérieur. Les deux premières cartes de suivi de `DemoSeedService`
 * (`DEMO_COPILOT_LONG_JOB`, `DEMO_COPILOT_CANCELLED_JOB`) restent `running` et
 * `cancelled` — aucune des deux n'atteint `done`, et ça reste juste : l'une
 * montre un travail EN VOL, l'autre un ARRÊT volontaire. Ce lot ajoute une
 * TROISIÈME carte ({@link DEMO_COPILOT_DONE_JOB}, SNCF, `done`) qui, elle,
 * calcule `toVerify` à partir des contacts RÉELLEMENT posés sur ce compte
 * (`email_confidence` medium/low, densifiés par `demo-contact-density.ts`),
 * via la MÊME fonction pure que la production (`contactVerificationLine`,
 * `long-job-catalog.ts`, GA-26) — jamais une liste de noms recopiée qui
 * divergerait du jeu de contacts le jour où il change.
 */
export const DEMO_CARD_RESULT_TO_VERIFY_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#1952.32 (#2844, lot h9 27/09/2026) — `CardResult.toVerify` n'ajoute ni table ni clé de `raw_analysis` : les deux gardes de `demo-coverage.spec.ts` sont aveugles à lui, comme au socle du guide ci-dessus. Le champ ne se pose QUE sur une carte de suivi d'analyse `done` (`CopilotCardService.settleAnalysisTracking`). `DemoSeedService` sème désormais TROIS cartes : `DEMO_COPILOT_LONG_JOB` (running), `DEMO_COPILOT_CANCELLED_JOB` (cancelled), et `DEMO_COPILOT_DONE_JOB` (done, sur SNCF) — la troisième calcule `toVerify` à partir des contacts réellement posés sur ce compte (`email_confidence` medium/low) via `contactVerificationLine`, la même fonction pure qu'en production (GA-26). Preuve : `demo-long-job-coverage.spec.ts`.",
}

/**
 * « ET « VOIR LES EXCEPTIONS » APRÈS UN IMPORT CSV DE CONTACTS (#2159.63)
 * MONTRE QUOI EN DÉMONSTRATION ? » SEEDÉ — SANS RIEN À SEMER, MÊME RAISON
 * QUE LE SOCLE DU GUIDE CI-DESSUS.
 *
 * `skipped_details` (`BulkImportContactsResponse`) n'ajoute ni table ni clé
 * de `raw_analysis` : c'est le résultat d'un geste qu'un prospect fait
 * LUI-MÊME en salle (déposer un CSV sur `ImportContactsDialog`), calculé par
 * le MÊME `ContactsService.bulkImportManual` qu'en production, sur SES
 * propres lignes. Aucun contact de démonstration pré-semé n'a besoin de
 * porter une ligne « déjà écartée » à l'avance : la raison (`blank_name` /
 * `duplicate`) est dérivée en direct du fichier que la personne importe,
 * jamais d'une donnée fictive posée par avance. Rien à semer.
 */
export const DEMO_CONTACT_IMPORT_EXCEPTIONS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "« Voir les exceptions » (#2159.63, `ContactImportNextSteps.tsx`) n'ajoute ni table ni clé de `raw_analysis`. `skipped_details` est calculé EN DIRECT par `ContactsService.bulkImportManual` sur le fichier CSV que la personne dépose en salle — le même service qu'en production, sur ses propres lignes. Rien à semer par avance : un semis serait ici une donnée inventée.",
}

/**
 * Épopée #2974 (lot V39) — LE CONSTRUCTEUR D'AUDIENCE DE CAMPAGNE : SEEDÉ.
 *
 * Aucune table ni clé `raw_analysis` à lui (lecture seule, aucun objet
 * audience persistant — doctrine c74), donc la garde par table ne pose jamais
 * la question : elle se pose ICI. `POST /outreach/audience/preview` lit les
 * contacts DÉJÀ semés de la salle — et ceux-ci couvrent les trois lignes que
 * l'écran doit savoir montrer : des éligibles, un contact écarté (opt-out,
 * `excluded()`), et un contact déjà en séquence active (`DEMO_OUTREACH_PLAN`),
 * signalé et exclu par défaut. `demo-campaign-audience-coverage.spec.ts` le
 * PROUVE sur les données, sans rien semer de plus pour l'occasion.
 */
export const DEMO_CAMPAIGN_AUDIENCE_BUILDER_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#2974 (lot V39, 28/09/2026) — le constructeur d’audience lit les contacts déjà semés : éligibles avec e-mail, un contact écarté (`excluded()` → opt-out) et des contacts en séquence active (`DEMO_OUTREACH_PLAN`) — les trois cas de l’écran sont visibles en démo sans aucune donnée ajoutée pour l’occasion.',
}

/**
 * #3282 (29/09/2026, #3263.39) — L'ÉCRAN COMITÉ D'ACHAT : SEEDÉ.
 *
 * Aucune table ni clé `raw_analysis` à lui : l'onglet Comité relit
 * `raw_analysis.org.orgGraph.buyingCommittee`, déjà semé pour les dossiers de
 * démonstration. `demo-committee-screen-coverage.spec.ts` PROUVE que chaque
 * dossier porte au moins cinq sièges occupés par des personnes du graphe ; les
 * places vides sont dérivées à l'affichage, jamais semées (donnée inventée).
 */
export const DEMO_COMMITTEE_SCREEN_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#3282 (29/09/2026) — l'onglet Comité d'achat relit raw_analysis.org.orgGraph.buyingCommittee, déjà semé pour chaque dossier de démonstration (au moins cinq sièges occupés par des personnes du graphe, prouvé par demo-committee-screen-coverage.spec.ts). Zéro table, zéro clé raw_analysis neuve ; les places vides sont dérivées à l'affichage, jamais semées.",
}

/**
 * #4509 (24/10/2026) — « Créer sa fiche » dans le panneau d'un nœud d'organigramme sans fiche contact : SEEDÉ.
 *
 * Aucune table ni clé `raw_analysis` à lui : le panneau relit `raw_analysis.org.orgGraph`, déjà semé. Ce qu'il faut à
 * la démo, c'est au moins une personne du graphe SANS fiche semée dans un dossier de la salle, pour que le geste se
 * montre ; `demo-org-person-without-record-coverage.spec.ts` le PROUVE sur les données. Rien n'est écrit tant que le
 * commercial ne valide pas le formulaire de création, prérempli.
 */
export const DEMO_ORG_PERSON_CREATE_RECORD_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4509 (24/10/2026) — « Créer sa fiche » vit dans le panneau d'un nœud d'organigramme sans fiche contact. Le panneau relit raw_analysis.org.orgGraph, déjà semé ; au moins un dossier de la salle porte une personne du graphe sans fiche semée (prouvé par demo-org-person-without-record-coverage.spec.ts). Zéro table, zéro clé raw_analysis neuve ; le formulaire de création est celui de CreateContactDialog, prérempli, et rien n'est écrit avant la validation.",
}

/**
 * « ET EN DÉMONSTRATION, LES TUILES « AVEC E-MAIL · AVEC TÉLÉPHONE · À RATTACHER » ET LA PUCE « MON CRM » ? »
 * SEEDÉES (#4527.5, #4526.4).
 */
export const DEMO_CONTACTS_CHANNEL_TALLY: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4527 / #4526.4 (24/10/2026) — les chiffres des tuiles « Avec e-mail · Avec téléphone · À rattacher » et le compteur de la puce « Mon CRM » sont comptés par l'API (`channelTally`, réponse de GET /contacts) sur les contacts de l'espace de démonstration : aucune table, aucune clé de `raw_analysis` neuve. La salle porte des e-mails, des numéros et des contacts à qualifier, donc les trois tuiles sont chiffrées ; trois contacts de la salle (`DEMO_CRM_ORIGIN_CONTACT_NAMES`) portent `source = 'crm'` pour que la puce « Mon CRM » existe, trois autres (`DEMO_IMPORTED_CONTACT_NAMES`) portent `source = 'import'` pour la puce « Importés » (#4597.1 — « Mon CRM » ne compte plus les fichiers, #4597.2). Tous les autres contacts restent `demo`.",
}

/**
 * « ET EN DÉMONSTRATION, UN CONTACT IMPORTÉ DU CRM — BLOC « CONNU », ORGANIGRAMME, PRÉSENCE — MONTRE QUOI ? »
 * SEEDÉ (#4678, #4679, #4680, 28/10/2026).
 */
export const DEMO_KNOWN_CONTACTS_RELATION: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4678 / #4679 / #4680 (28/10/2026) — aucune table, aucune clé de `raw_analysis` neuve : le bloc « Connu », la place dans l'organigramme, le badge de présence, la confrontation, l'axe relation et la ligne « importé le … » lisent `contacts.source` (`import` / `crm`), `record_import_marks` et le graphe d'organigramme, déjà semés. Le compte Kiabi est versé par un fichier (`importedOrigin`) et porte deux contacts connus SIMULÉS (`DENSITY.Kiabi`, `DEMO_IMPORTED_ACCOUNT_CONTACT_NAMES`) : un DSI en doublon probable avec le DSI déduit du graphe (même famille, même niveau — proposé, jamais fusionné) et un acheteur épinglé hors de l'arbre. Gardé par `demo-known-contacts-coverage.spec.ts`.",
}

/**
 * « ET EN DÉMONSTRATION, LES COMPTEURS RENOMMÉS ? » SEEDÉS (#4612, #4327.2, #4493.4, #4503.2, #4613, #4582.1).
 */
export const DEMO_COUNTER_LABELS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4612 / #4327.2 / #4493.4 / #4503.2 / #4613 / #4582.1 (26/10/2026) — aucune table, aucune clé de `raw_analysis` neuve : les compteurs d'entités et de villes de l'onglet Sites lisent `entities_exhaustive` et `sites_france`, déjà semés, avec des nombres DIFFÉRENTS d'un dossier à l'autre (Société Générale et SNCF portent des nombres d'entités et de villes différents), donc le compteur ne peut pas être figé sans que la salle le voie. Le total de `/contacts` lit `channelTally`/`recommendedTally` (déjà semés, #4527) et se nomme « recommandés » par défaut ; le zéro-complété (« 04 ») s'applique à la rangée de chiffres de Comptes, Pipe et Vivier, tous semés. Les pastilles d'initiales de la synthèse des contacts ne sont plus rendues : rien à semer. #4649 (27/10/2026) — la tuile « entités documentées » du Brief lit le MÊME prédicat que l'onglet Sites (`entities_exhaustive` déjà semé) : rien de neuf à semer.",
}

/**
 * Épopée #2974 (29/09/2026) — LES DEUX SOURCES D'AUDIENCE NEUVES : VIDES À DESSEIN.
 *
 * `import` (#2380.8) lit `contacts.source = 'import'` et `dormant_accounts`
 * (#2380.12) lit les comptes `commercial_status = 'dormant'`. La salle ne porte
 * ni l'un ni l'autre, et c'est délibéré, deux fois :
 *  - tout contact semé est estampillé `source: 'demo'` (migration 1785950000000
 *    — un contact fictif ne doit jamais passer pour une provenance réelle) ;
 *  - aucun compte n'est `dormant` (verdict `vide_a_dessein` de #2117.23, plus
 *    haut : en semer un sortirait un compte des six que le portefeuille compte).
 * Les deux sources rendent donc « Aucun contact éligible » en démo, ce qui est
 * l'état honnête ; les autres sources (contacts de l'espace, CRM, compte…)
 * portent la démonstration (`DEMO_CAMPAIGN_AUDIENCE_BUILDER_COVERAGE`). Les
 * plafonds de fréquence et la raison d'arrêt s'exercent sur ces mêmes contacts.
 * `demo-campaign-audience-coverage.spec.ts` prouve l'absence de compte dormant.
 */
export const DEMO_CAMPAIGN_AUDIENCE_SOURCES_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    '#2974 (29/09/2026) — les sources `import` (#2380.8) et `dormant_accounts` (#2380.12) sont vides en démo à dessein : tout contact semé porte `source: "demo"` (jamais une provenance réelle) — sauf les trois contacts d’origine CRM de #4526.4, qui portent `crm` (jamais `import`) — et aucun compte de la salle n’est `dormant` (#2117.23). Le message « Aucun contact éligible » est l’état honnête ; les plafonds de fréquence s’exercent sur les contacts de l’espace. Lot E3 (30/09/2026) : la source `partners` (#2380.13) est vide aussi — aucune ESN partenaire de la salle ne porte d’e-mail de contact (`DEMO_PARTNER_RELATIONS.contactName` seul) — et aucun contact de la salle n’a de boîte personnelle (#2380.65) : le constat « boîtes personnelles : 0 » est l’état honnête. Lot X38 (02/10/2026) : la source `event_participants` (#2380.11) n’est PLUS vide — les réunions et appels de la salle qui nomment un contact le portent comme participant (`DEMO_EVENT_PARTICIPANTS`, `DemoSeedService`), donc le sélecteur d’événements liste de vrais événements.',
}

/**
 * « ET LE STATUT TEMPOREL D'UN SIGNAL ARCHIVÉ (#3206.3, ÉPOPÉE #3240) SE
 * DISTINGUE COMMENT EN DÉMONSTRATION, ENTRE « CONTEXTE PASSÉ » ET « TROP
 * ANCIEN » ? » SEEDÉ — SANS CLÉ NEUVE, LE JEU EXISTANT SUFFIT.
 *
 * `temporal_status` / `freshness_window_days` (`RecentSignal`) n'ajoutent NI
 * table NI clé de `raw_analysis` : `recent_signals` est déjà classée seedée,
 * et ces deux champs sont dérivés EN DIRECT sur l'écran (`classifyTemporalStatus`,
 * `@bellum/contracts`) à partir de `freshness` / `date` / `type` — la MÊME
 * fonction que celle qui lit un signal fraîchement stampé par l'IA en
 * production, jamais une seconde règle. Les deux gardes de
 * `demo-coverage.spec.ts` (tables et clés `raw_analysis`) sont donc aveugles
 * à eux, comme au socle du guide plus haut.
 *
 * Le jeu de démonstration montre déjà les deux branches SANS semis
 * supplémentaire : Société Générale porte un signal `nomination` daté
 * d'octobre 2024, `freshness: 'archive'` (`s5`, `DEMO_SG_SIGNALS`) — dérivé en
 * HISTORICAL (une direction resserrée reste un fait de contexte, pas une
 * preuve de recours actuel), quand tout autre signal archivé (offre d'emploi,
 * budget…) dérive en STALE. `WatchSignalTimeline.test.tsx` couvre les deux
 * libellés ; rien à semer de plus pour l'exercer en salle.
 *
 * SUPERSEDED (reste du 30/09) reste hors salle, à DESSEIN, pour la MÊME
 * raison que CURRENT_VERIFIED déjà livré : les deux dépendent de
 * `signal_history` (`history_status`/`last_verified_at`), classée
 * VIDE À DESSEIN plus bas dans ce fichier (« l'historique des signaux se
 * construit par la veille quotidienne ; les signaux du dossier sont dans
 * `raw_analysis` ») — y semer une résolution fabriquerait une histoire de
 * veille que personne n'a observée. `account.signals.test.ts` et
 * `WatchlistSignalDetail.test.tsx` couvrent la dérivation et le badge
 * unitairement, hors salle.
 */
export const DEMO_TEMPORAL_STATUS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#3206.3 (épopée #3240) — `temporal_status`/`freshness_window_days` n'ajoutent ni table ni clé de `raw_analysis` : dérivés en direct (`classifyTemporalStatus`, @bellum/contracts) à partir de `freshness`/`date`/`type`, déjà seedés dans `recent_signals`. Le signal `nomination` archivé de Société Générale (`s5`) exerce déjà la branche HISTORICAL sans semis supplémentaire ; tout autre type archivé exerce STALE. SUPERSEDED (reste du 30/09) dépend de `signal_history`, classée vide à dessein plus bas — même statut que CURRENT_VERIFIED, couvert unitairement (`account.signals.test.ts`, `WatchlistSignalDetail.test.tsx`), jamais en salle.",
}

/**
 * « ET LES SIGNAUX DE LAURA (#3919, `get_account_signals`, LOT Y10 08/10) SE
 * VOIENT COMMENT EN DÉMONSTRATION ? » SEEDÉ — AUCUNE TABLE NI CLÉ NEUVE.
 *
 * `get_account_signals` (chat) relaie `AccountsService.listAccountSignals`
 * (`internal/copilot/accounts/signals`), LA MÊME lecture que la Veille
 * (`GET /accounts/signals`), jamais un second moteur (GA-26). Elle lit
 * `recent_signals`, déjà classée seedée ci-dessus, et l'enrichit de
 * `signal_history` quand une ligne existe. Rien à semer de plus pour
 * l'exercer en salle, sur UN compte (« qu'est-ce qui bouge chez SNCF ? ») ou
 * sur le portefeuille (« quels sont les comptes où ça bouge ? »).
 *
 * `importance` / `actionLabel` / `firstDetectedAt` restent `null` dans la
 * salle : ils dépendent de `signal_history`, classée VIDE À DESSEIN plus bas
 * (la veille quotidienne la construit, aucun compte de démonstration n'est
 * rejoué). C'est l'état RÉEL d'un compte jamais passé par la veille
 * quotidienne — pas un manque à combler, le même état qu'un espace réel qui
 * vient d'analyser un compte.
 */
export const DEMO_ACCOUNT_SIGNALS_TOOL_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#3919 (lot Y10, 08/10) — `get_account_signals` relaie `AccountsService.listAccountSignals`, la MÊME lecture que la Veille (`GET /accounts/signals`), jamais un second moteur. Lit `recent_signals`, déjà classée seedée, enrichi de `signal_history` quand une ligne existe. `importance`/`actionLabel`/`firstDetectedAt` restent `null` en salle : ils dépendent de `signal_history`, classée vide à dessein (la veille quotidienne la construit, aucun compte de démonstration n'est rejoué) — l'état réel d'un compte jamais passé par la veille, pas un manque à combler.",
}

/**
 * LOT DATA-B (15/10) — « ET LES TROIS LECTURES DE LAURA SUR LE DOSSIER DÉJÀ COLLECTÉ SE VOIENT COMMENT EN
 * DÉMONSTRATION ? » — AUCUNE TABLE NI CLÉ `raw_analysis` NEUVE.
 *
 * `get_account_firmographics` et `get_account_org_chart` (chat) ne lisent QUE ce que la salle sème déjà :
 * `raw_analysis.detected_tech_stack` / `github_signals` / `subsidiaries` / `employees` pour la firmographie,
 * `raw_analysis.org.orgGraph` pour l'organigramme (la route `internal/copilot/account/org-chart` projette la
 * MÊME carte que l'onglet, `org-chart-projection.ts`). Le briefing élargi (`get_account_briefing`) relit
 * `program_names`, `sites_france`, `qualified_hypotheses` et `it_implications_for_esn`, déjà classées seedées.
 * Garde : `demo-laura-dossier-reads-coverage.spec.ts` MESURE ces lectures sur le jeu de la salle.
 *
 * `accounts.apollo_enrichment` (effectif, financement) reste VIDE À DESSEIN sur les comptes de la salle : ce
 * sont des groupes RÉELS, et un chiffre d'effectif ou de levée semé à la main serait une donnée inventée sur
 * une vraie société. La firmographie de la salle se compose donc des champs du dossier, sans ces deux lignes.
 */
export const DEMO_LAURA_DOSSIER_READS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "LOT DATA-B (15/10) — `get_account_firmographics` et `get_account_org_chart` lisent `raw_analysis` (technologies détectées, dépôts publics, filiales, `org.orgGraph`), déjà semé sur les dossiers de la salle ; `apollo_enrichment` reste vide à dessein (groupes réels, aucun chiffre inventé). Le moteur du `/chat` de démonstration rejoue une conversation SCRIPTÉE (`demo-turn.ts`) : l'outil n'y est pas invoqué, mais chaque donnée qu'il relit existe.",
}

/**
 * #4055.4 / #4055.6 (17/10) — « ET `complete_account` ET `get_portfolio_sectors` SE VOIENT COMMENT EN DÉMONSTRATION ? »
 * — AUCUNE TABLE NI CLÉ `raw_analysis` NEUVE.
 *
 * Les deux outils de chat sont des LECTURES agrégées de ce que la salle sème déjà : signaux, contacts classés,
 * `raw_analysis.org.orgGraph` et besoins pour « complète ce compte » ; `accounts.sector` pour les secteurs du
 * portefeuille. Les dossiers de la salle portent un secteur, des contacts, un organigramme : les deux lectures
 * rendent donc un résultat non vide sans rien semer de plus. Rien ne se lance (les collectes manquantes sont
 * seulement proposées) : la salle ne peut pas déclencher d'analyse réelle.
 */
export const DEMO_COMPLETION_READS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4055.4/.6 — `complete_account` et `get_portfolio_sectors` agrègent signaux, contacts, organigramme, besoins et `accounts.sector`, déjà semés sur les dossiers de la salle ; aucune collecte n’est lancée, elles sont proposées.',
}

/**
 * LOT DATA-B (15/10) — « ET LES FAITS PUBLICS DE LA BASE COMMUNE (`get_company_public_facts`) ? » VIDE À
 * DESSEIN — ET CE N'EST PAS UN TROU.
 *
 * L'outil lit le cache COMMUN à tous les espaces (`source_cache`, famille `public_facts`), jamais une table
 * de l'espace : il n'y a donc ni ligne `workspace_id` à semer ni clé `raw_analysis`. Le semis d'une salle ne
 * l'écrit pas — il fabriquerait des offres, des appels d'offres ou des annonces légales sur de vraies
 * sociétés, la donnée fictive que la doctrine refuse. Une entreprise jamais collectée y rend l'état RÉEL
 * `not_collected` (inconnu, jamais « aucun ») ; une entreprise déjà collectée par un autre espace y rend ses
 * faits datés. Les faits eux-mêmes sont, eux, semés sous leur forme d'écran (`recent_signals`, offres de la
 * Veille).
 */
export const DEMO_COMPANY_PUBLIC_FACTS_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "LOT DATA-B (15/10) — `get_company_public_facts` lit le cache commun (`public_facts.peek_fact`), pas une table de l'espace : rien à semer, et le semer fabriquerait des faits publics sur de vraies sociétés. Rend `not_collected` (inconnu) pour une entreprise que personne n'a collectée — l'état réel, pas un manque.",
}

/**
 * « ET /mes-cibles (« CE QUI BOUGE SUR TES COMPTES », #4088) SE REMPLIT COMMENT EN
 * DÉMONSTRATION ? » SEEDÉ — AUCUNE TABLE NI CLÉ NEUVE.
 *
 * Les trois colonnes neuves de la Veille — « Pourquoi ça compte » (une phrase
 * dérivée du TYPE du signal), « Qui ça concerne » (`decision_maker`, le contact en
 * tête du classement des contacts du compte) et « Prochaine action » (un verbe et
 * cette personne) — se LISENT à partir de ce que la salle sème déjà :
 * `recent_signals` (signaux typés : recrutement, projet, acquisition, budget…) et
 * `contacts` (personnes nommées et classées, voir `DEMO_DOSSIERS`). La raison de
 * rang vient du `priority_score` du compte et de ses signaux récents. Aucun semis
 * de plus : le décideur n'est PAS stocké, il est calculé à la lecture par le MÊME
 * classement que l'onglet Contacts du dossier (GA-26).
 *
 * Preuve (`demo-mes-cibles-veille-coverage.spec.ts`) : au moins trois comptes
 * RÉELS des briefs portent un signal typé ET un décideur nommé en tête. Aucun
 * compte fictif « exemple », aucun compte mince (décisions Louis 04/10 et 12/10).
 *
 * D4088 (lot démo, 14/10) — les TROIS motifs d'écartement sous « Écartés (N) »
 * (`signalDiscardReason`, #4088.7) sont chacun portés par un signal RÉEL, jamais
 * inventé pour forcer le repli à apparaître :
 *  - « offre de stage » : EDF et Renault (`DEMO_ANALYSED_ACCOUNTS`) portent chacun
 *    une VRAIE offre de stage dans leurs `recent_signals` (ex. EDF « STAGE :
 *    Analyste sécurité junior… », Renault « CS27 - Bac 5 - Stage Supply Chain H/F »)
 *    — lu dans `data/analysed-accounts/edf.json` et `renault.json`, jamais édités ;
 *  - « hors domaine » : ABB Suisse (`DEMO_DOSSIERS`) ne porte AUCUNE offre dans un
 *    métier placé du profil démo (`DEMO_ESN_PROFILE.placed_roles`) ;
 *  - « presse seule » : Société Générale porte un VRAI signal de type `budget`
 *    (« Résultats du deuxième trimestre 2026 en forte hausse… ») — aucun besoin
 *    d'ESN reconnu, et le vocabulaire financier que `GENERAL_RE` sait reconnaître.
 * Les trois sont vérifiés par la garde, sur les comptes déjà semés — aucun semis
 * de plus.
 */
export const DEMO_MES_CIBLES_VEILLE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4088.9 (12/10) — « Ce qui bouge sur tes comptes » n'ajoute ni table ni clé de `raw_analysis` : « Pourquoi ça compte » dérive du type des signaux de `recent_signals` (seedés), « Qui ça concerne »/« Prochaine action » du décideur de tête du classement des `contacts` (seedés, personnes nommées — `decision_maker`, calculé à la lecture), la raison de rang du `priority_score` et des signaux récents. Preuve : trois comptes réels des briefs (signal typé + décideur nommé), garde `demo-mes-cibles-veille-coverage.spec.ts`. #4088.12 (14/10, recette prod) — « Pourquoi ça compte » n'est plus jamais vide : un type de signal sans besoin d'ESN établi (partenariat, restructuration, établissement…) affiche « Signal « type » · secteur : aucun besoin d'ESN établi à ce type, à qualifier » (`buildWhyLine`, lu du type et du secteur déjà semés) — toutes les lignes de la démo (13 « Autres » comprises) ont donc leur raison, sans signal ni besoin inventé. D4088 (14/10) — « Écartés (N) » : les trois motifs (offre de stage, hors domaine, presse seule) sont chacun prouvés sur un VRAI signal déjà semé — EDF et Renault (offre de stage), ABB Suisse (hors domaine), Société Générale (presse seule, signal « budget » de résultats trimestriels) — jamais un signal inventé pour forcer le repli.",
}

/**
 * « ET LE BILAN DE RELANCE DE LAURA (#3903, `get_reengagement_report`, LOT
 * Y10 08/10) SE VOIT COMMENT EN DÉMONSTRATION ? » SEEDÉ — AUCUNE TABLE NI
 * CLÉ NEUVE.
 *
 * `get_reengagement_report` relaie `ActivitiesService.engagementReport`, qui
 * lit la table `activities` DÉJÀ seedée (`DEMO_ACTIVITIES`) par `daysAgo` —
 * des dates calculées depuis « maintenant » à l'exécution du semis, donc
 * TOUJOURS dans la fenêtre par défaut (90 jours). Le client d'exemple (SNCF)
 * porte à la fois des échanges `outbound` et `inbound` (son fil le plus
 * récent, `daysAgo: 2`, est une RÉPONSE REÇUE — « ils ont répondu en
 * dernier », commentaire du semis) : la DERNIÈRE interaction du compte est
 * donc entrante, et exerce `en_attente_chez_nous` sans aucun semis
 * supplémentaire. Groupe BPCE porte une sortante vieille de plus de quatorze
 * jours sans réponse : `a_relancer` s'y exerce.
 *
 * #3903 (lot M01, 09/10/2026) — Société Générale porte une sortante récente
 * ET une affaire CRM OUVERTE rattachée par SIREN (`DEMO_CRM_DEALS`, #3918.a) :
 * elle exerce désormais `deal_jamais_close` (avec `openCrmDealNames`) au lieu
 * de `en_attente_chez_le_client` — renoncement ASSUMÉ : aucun autre compte de
 * la salle ne porte de sortante récente, et en fabriquer une referait un
 * échange qui n'a pas eu lieu. `en_attente_chez_le_client` reste testé
 * (`engagement-report.spec.ts`), il n'est plus montré en salle.
 *
 * `notEvaluated` est vide en salle (l'espace a un cache d'affaires CRM) ; un
 * espace de production sans CRM lu garde `open_deal_status` nommé. #3903 —
 * « nogo retenté » est abandonné (décision Louis 09/10) : plus jamais nommé.
 */
export const DEMO_REENGAGEMENT_REPORT_TOOL_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#3903 (lot Y10, 08/10) — `get_reengagement_report` relaie `ActivitiesService.engagementReport`, qui lit `activities`, déjà seedée (`DEMO_ACTIVITIES`, dates en `daysAgo` donc toujours dans la fenêtre par défaut). SNCF porte des échanges outbound ET inbound ; son fil le plus récent (2 j) est une réponse REÇUE (« ils ont répondu en dernier », commentaire du semis) : la dernière interaction est entrante, `en_attente_chez_nous` s'exerce sans semis de plus. Groupe BPCE porte une sortante de plus de quatorze jours sans réponse : `a_relancer` s'y exerce. #3903 (lot M01, 09/10) — Société Générale porte une sortante récente ET une affaire CRM ouverte rattachée par SIREN (`DEMO_CRM_DEALS`) : elle exerce `deal_jamais_close` (renoncement assumé : `en_attente_chez_le_client` n'est plus montré en salle, aucun autre compte n'a de sortante récente et en fabriquer une inventerait un échange). `notEvaluated` est vide en salle — « nogo retenté » est abandonné (décision Louis 09/10), plus jamais nommé comme un manque.",
}

/**
 * « ET LE PLAN D'ACTIONS DE LAURA (#3904.1, `get_action_plan`, LOT M05 09/10)
 * SE VOIT COMMENT EN DÉMONSTRATION ? » SEEDÉ — AUCUNE TABLE NI CLÉ NEUVE.
 *
 * `get_action_plan` COMPOSE le bilan de relance (#3903) sans le recalculer :
 * il lit la même table `activities` (`DEMO_ACTIVITIES`). Les trois gestes s'y
 * exercent : `repondre` (SNCF, réponse reçue en dernier), `relancer` (Groupe
 * BPCE, e-mail sortant il y a 38 jours) et `appeler` (Alstom, appel sortant
 * sans réponse il y a 35 jours — seule ligne AJOUTÉE par ce lot, en fin de
 * tableau). #3904 (décision Louis 09/10) — `appeler` s'exerce AUSSI par sa
 * seconde règle : ENGIE porte deux e-mails sortants consécutifs sans réponse
 * (44 et 32 j, ajoutés en fin de `DEMO_ACTIVITIES`). `proche_de_signer` lit
 * un STADE : les deux affaires du pipe seedé (`pipelineProjects`, en
 * « négociation » et « profils présentés ») ET l'affaire CRM ouverte de
 * Société Générale (« Proposition envoyée », `DEMO_CRM_DEALS`) — aucune ligne
 * neuve pour ce geste.
 *
 * #3904.4 — `contacter` compose `list_accounts_to_act` (comptes seedés sans
 * action depuis 30 jours) et `search_dormant_network` (le réseau dormant
 * seedé, décision Louis 04/10/2026) : aucune ligne neuve.
 */
export const DEMO_ACTION_PLAN_TOOL_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#3904.1 (lot M05, 09/10) — `get_action_plan` compose le bilan de relance (#3903) sur `activities`, déjà seedée. `repondre` : SNCF (réponse reçue en dernier) ; `relancer` : Groupe BPCE (e-mail sortant à 38 j) ; `appeler` : Alstom (appel sortant sans réponse à 35 j, ajouté en fin de `DEMO_ACTIVITIES`). #3904 (lot P01, décision Louis 09/10) — `appeler` s’exerce aussi par deux e-mails sortants consécutifs sans réponse (ENGIE, 44 et 32 j, ajoutés en fin de `DEMO_ACTIVITIES`) ; `proche_de_signer` lit un stade proposition/négociation : les deux affaires seedées du pipe (`pipelineProjects`) et l’affaire CRM ouverte « Proposition envoyée » de Société Générale (`DEMO_CRM_DEALS`). #3904.4 — `contacter` compose `list_accounts_to_act` et le réseau dormant, déjà seedés : aucune ligne neuve.',
}

/**
 * « ET L'ÉTAT DES QUATRE SOURCES DE LAURA (#3904.3, `salesSourceConnections`,
 * panneau « Ce que Laura lit » du centre d'intégrations + `coverage.connectors`
 * de `get_action_plan`, LOT M05 09/10) SE VOIT COMMENT EN DÉMONSTRATION ? »
 * VIDE À DESSEIN — c'est la lecture de ce qui est BRANCHÉ, et une salle de
 * démonstration ne branche rien.
 *
 * La lecture regroupe le Tool Registry, qui relit `crm_connections`,
 * `google_connections`, `microsoft_connections` et `telephony_connections` —
 * tables DÉJÀ classées vides à dessein plus haut (« l'écran doit le dire, pas
 * faire semblant »). En salle, les quatre sources s'affichent donc « Non
 * branché » : c'est précisément ce que la capacité doit savoir dire. Seeder une
 * connexion fictive afficherait une synchro qui n'a jamais eu lieu.
 */
export const DEMO_SALES_SOURCES_CONNECTIONS_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    '#3904.3 (lot M05, 09/10) — `salesSourceConnections` regroupe le Tool Registry (connexions CRM, Google, Microsoft, téléphonie), tables déjà vides à dessein en salle : les quatre sources s’affichent « Non branché », la capacité nomme l’absence au lieu de simuler une synchro qui n’a jamais eu lieu.',
}

/**
 * « ET LA RECHERCHE DE NOUVELLES PERSONNES SUR UN RÔLE NON POURVU (#3869.a,
 * `propose_people_search`, LOT M05 09/10) SE VOIT COMMENT EN DÉMONSTRATION ? »
 * SEEDÉ CÔTÉ CONVERSATION — AUCUNE TABLE NI CLÉ NEUVE.
 *
 * La salle porte la question et sa carte (`demo-chat-script.ts`,
 * `p-people-search`, apps/web) : le compte (SNCF), les rôles et le coût se
 * lisent avant le clic. Le clic, lui, ne lance rien en salle — même garantie
 * que `ContactDiscoveryService.run` (« aucun appel réseau en démo ») : les
 * sociétés du jeu sont RÉELLES, une personne jamais collectée y serait une
 * personne INVENTÉE. La carte le dit (« la recherche n'est pas lancée dans
 * cette salle ») plutôt que d'afficher un résultat fabriqué.
 *
 * Même chose pour le plan d'actions (#3904.1) dans la conversation scriptée :
 * `p-action-plan` relit les gestes semés plus haut (SNCF, Groupe BPCE, Alstom).
 */
export const DEMO_PEOPLE_SEARCH_TOOL_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#3869.a (lot M05, 09/10) — la salle porte la question et la carte `propose_people_search` (`p-people-search`, demo-chat-script.ts) : compte, rôles et coût lisibles avant le clic. Le clic ne lance rien en salle (même garantie que `ContactDiscoveryService.run`) et le dit — une personne jamais collectée sur une société réelle serait inventée. `p-action-plan` relit les gestes semés du plan d’actions (#3904.1). #4057/#4058 (12/10) — `p-people-search-expertise` montre « interlocuteurs cyber GRC de SNCF » sans aucune question stratégique, expertise et secteur sur deux lignes distinctes.',
}

/**
 * « ET LA TÂCHE DE PRÉPARATION PROPOSÉE POUR UN RENDEZ-VOUS SANS DOSSIER
 * OUVERT (#2390.4/#2390.17, ÉPOPÉE #2926) SE VOIT COMMENT EN DÉMONSTRATION ? »
 * VIDE À DESSEIN — LA ROUTINE QUI L'ÉCRIT NE TOURNE JAMAIS CONTRE L'AGENDA
 * DE DÉMONSTRATION.
 *
 * `createMissingMeetingPreparationTasks` (`routine-executors.ts`) n'ajoute NI
 * table NI clé de `raw_analysis` : elle écrit une ligne `action_plan_items`
 * de plus (`target_kind: 'meeting'`), une table déjà classée SEEDÉE plus haut
 * (#2123.46/#2123.47) — les deux gardes de `demo-coverage.spec.ts` (tables et
 * clés `raw_analysis`) sont donc aveugles à elle, comme au socle du guide et
 * au statut temporel ci-dessus.
 *
 * Elle reste pourtant à `0` en salle de démonstration, et c'est le comportement
 * VOULU, pas un oubli : la routine `meeting_prep` lit l'agenda RÉEL de
 * l'utilisateur (`AgendaService.listEvents`) — en démonstration, cette lecture
 * est toujours vide, EXACTEMENT le même no-op que `confirmSlotProposal` et le
 * reste des écritures d'agenda (voir `listBellumCreatedEventIds`,
 * `briefing.service.ts` : « la salle de démonstration bloque toute écriture
 * agenda, donc aucune vraie ligne n'existe jamais pour un utilisateur démo »).
 * Aucun rendez-vous externe n'existe jamais côté agenda RÉEL d'un compte démo :
 * il n'y a donc rien à rattacher par domaine, et la routine ne créerait jamais
 * de tâche même si elle tournait. Semer une ligne `action_plan_items` à la
 * main pour ce cas précis simulerait une exécution de routine qui n'a jamais
 * eu lieu — la donnée inventée que la doctrine interdit, pas une couverture.
 *
 * Le CONCEPT (une tâche de préparation issue du plan, jamais faite) est déjà
 * visible en salle par ailleurs : `DEMO_PLAN_TASKS` sème des tâches
 * `execution_status: 'todo'` sur les comptes réels de la salle — le même état
 * qu'une tâche de préparation créée par ce point, juste pas la même origine.
 */
export const DEMO_MEETING_PREPARATION_TASK_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#2390.4/#2390.17 (épopée #2926) — `action_plan_items` (target_kind: 'meeting') créées par `createMissingMeetingPreparationTasks` n'ajoutent ni table ni clé `raw_analysis` (table déjà classée seedée). Vide en démo À DESSEIN : la routine `meeting_prep` lit l'agenda RÉEL de l'utilisateur, toujours vide en salle de démonstration (même no-op que les écritures d'agenda, `confirmSlotProposal`) — aucun rendez-vous externe démo n'existe côté agenda réel, donc rien à rattacher par domaine. Semer la ligne à la main simulerait une exécution de routine qui n'a jamais eu lieu.",
}

/**
 * BRIEFS COMMERCIAUX DU COMPTE (01/10/2026) — `raw_analysis.commercial_brief` :
 * SEEDÉE sur les cinq comptes qui ont un classeur.
 *
 * L'onglet « Ce que je sais » de la fiche compte lit CETTE clé de `raw_analysis`
 * (zod : absente ou invalide → l'onglet est caché). Elle n'est pas une clé du
 * contrat d'analyse IA (`accountAnalysisSchema`) : la garde par clé de
 * `demo-coverage.spec.ts` est donc aveugle à elle, d'où cette entrée — et
 * `demo-commercial-brief-seed.spec.ts` PROUVE sur les données, compte par compte,
 * que le brief est présent ET que `checkCommercialBrief` n'y relève aucune
 * violation. Ce que le brief nourrit en plus : les contacts, le siège, les sites,
 * l'organigramme, les signaux de la Veille (`recent_signals`, table lue par
 * `GET /accounts/signals`) et les ESN présentes (`account_partners`, déjà classée
 * seedée plus haut) — AUCUNE table neuve.
 */
export const DEMO_COMMERCIAL_BRIEF_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '01/10/2026 (briefs comptes) — raw_analysis.commercial_brief est posé sur Société Générale, Groupe BPCE, ENGIE, TotalEnergies et Alstom, puis (04/10/2026, démo ESN Nantes du 05/10) sur Naval Group (site de Nantes-Indret) et Chantiers de l’Atlantique (le JSON du classeur du CEO, généré par `convert:commercial-brief`, relu par le même schéma que l’écran « Ce que je sais »). Les projets 2026-2027, les programmes (Naval Group, Chantiers de l’Atlantique : segment, horizon, besoin d’ingénierie sous-jacent) et les postes ouverts du brief entrent dans `recent_signals` (la Veille), ses ESN (aucune pour ces deux comptes : rien n’est inventé) dans `account_partners` avec leur niveau de preuve. Aucune table neuve : `account_partners` et `accounts.recent_signals` sont déjà classées seedées. 04/10/2026 (démos clients QuickSort du 06/10 et Meedz du 07/10) — six comptes de plus, tous seedés : BNP Paribas, Bpifrance, SNCF (deux classeurs fusionnés, QuickSort et Lyon), ADEO - Leroy Merlin et Kiabi ; ABB Suisse (périmètre « suisse » : sites et entités en CH, règles suisses en garde-fous) y ajoute un sixième ; le brief de Groupe BPCE reçoit en plus la couche Toulouse de la démo Thélio (section `cockpit-toulouse` et sections `toulouse-…`, un seul compte) ; leurs « chantiers » et « programmes » (« Dynamique 2027+ », « Projets ») alimentent aussi la Veille, leurs prix (13 directs chez BNP Paribas, 34 de grille chez ADEO) restent dans le brief par canal. Bpifrance, ADEO et Kiabi ne citent aucune ESN (leurs classeurs n’ont pas d’onglet d’ESN : la structure d’un externe reste dans la fiche de la personne) — aucune ligne partenaire n’est inventée. 12/10/2026 — Orange, compte d’extension (pas un dossier de brief : registre `COMMERCIAL_BRIEF_BY_EXTENSION_COMPANY`), porte lui aussi `raw_analysis.commercial_brief`, converti du dossier de compte que Théo a déposé (`pnpm --filter @bellum/api convert:orange-dossier`, mêmes schéma et contrôles `checkCommercialBrief`, zéro violation) : fiche légale (seul le SIREN est confirmé), chiffres de marché avec source et date, sept projets (Veille), achats, besoins, décideurs en tête, ses dix-huit ESN observées en poste (jamais « confirmées ») dans `account_partners`, entités et organigramme reconstitué (dit tel). Les niveaux de confiance du dossier sont recopiés tels quels, « non trouvé » reste « non trouvé ». Les 477 contacts du fichier sont fusionnés par nom avec les 476 fiches du relevé (aucune perte, 478 fiches avec les deux personnes que seul le dossier cite) ; seules les adresses du groupe Orange sont semées en clair, aucune boîte personnelle ni adresse d’employeur tiers. Vides à dessein sur ce compte, faute de source : plan d’action, défis SI, SIREN en colonne, sites sur la carte. Aucune table neuve. `demo-orange-dossier-seed.spec.ts` le prouve sur les données. 15/10/2026 — quatre comptes d’extension de plus, alimentés de la même façon par les dossiers de compte déposés par Théo et convertis par `convert:account-dossier` (cœur partagé, un mapping par compte, zéro violation) : Crédit Agricole, VINCI, Enedis et Safran (Safran et VINCI, retirés minces le 12/10, reviennent riches). Fiche, marché, projets et signaux (Veille), achats, besoins sans TJM ni statut, ESN observées (indice, jamais « confirmées ») dans `account_partners`, entités, sites, décideurs en tête puis les contacts du fichier ; seules les adresses du domaine du groupe sont semées en clair ; l’ESN prospect de chaque démo n’est jamais nommée ; la stratégie de vente de ces ESN est écartée. Vides à dessein sur ces quatre comptes, faute de source : plan d’action, angles d’attaque, défis SI, prix, SIREN en colonne ; et sur Safran, toute coordonnée (le fichier de contacts n’en porte aucune). Aucune table neuve. `demo-account-dossiers-seed.spec.ts` le prouve sur les données.',
}

/**
 * PARITÉ ORANGE / GROUPE BPCE (Louis, 13/10/2026) — SEEDÉE. Orange (compte d'extension, dossier de compte du 12/10) ne
 * portait que ses projets, ses achats et ses contacts : aucun besoin, aucun signal de recrutement, aucune lecture
 * stratégique. Il porte désormais, au même format et en volume au moins égal à Groupe BPCE par catégorie : hypothèses de
 * besoin (`it_challenges`, `pains`), signaux de RECRUTEMENT datés RELATIVEMENT à l'ouverture de la salle (ingénierie / IT,
 * jamais de stage), vision et plans stratégiques (signaux `transformation` / `projet`, JAMAIS `appel_offres`), programmes,
 * stack, domaines d'opportunité et pistes d'approche, indicateurs, garde-fous de fiabilité, unités du groupe, chaîne d'achat
 * et plan d'action, plus les sections « postes ouverts », « technos » et « plan » du brief. AUCUNE table neuve : les mêmes
 * colonnes que BPCE. `demo-orange-dossier-seed.spec.ts` PROUVE la parité catégorie par catégorie contre le jeu BPCE.
 * Ce qui reste VIDE À DESSEIN, avec sa raison : la route commerciale `recommendedRoute` (elle suppose un partenaire déclaré ;
 * aucun n'est confirmé chez Orange), les prix observés (un seul TJM annoncé, jamais de moyenne), les 291 entités juridiques
 * de BPCE (le dossier Orange en nomme 9 plus les filiales étrangères du relevé).
 */
export const DEMO_ORANGE_BPCE_PARITY_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '13/10/2026 (Louis) — parité de remplissage Orange / Groupe BPCE : besoins (60 hypothèses, 17 besoins observés), 12 offres d’emploi IT datées relativement à l’ouverture de la salle, vision et plans stratégiques classés transformation ou projet (jamais appel d’offres), 15 programmes, stack, 14 domaines et pistes d’approche, indicateurs, garde-fous, 55 unités du groupe, chaîne d’achat, plan d’action et sections du brief (postes ouverts, technos, plan). 14/10/2026 (recette) — rubriques BESOINS (un besoin observé par offre réelle collectée, 16 en plus des 3 du dossier ; aucune mission terminée ajoutée) et TECHNOS (technologies citées par un titre d’offre réelle ou un titre de profil du relevé du compte ; une techno sans occurrence n’a pas de ligne, donc moins de lignes que BPCE), POSTES OUVERTS sans colonne VILLE vide (la ville ouvre le détail quand la source la rend), un seul « Siège » à l’écran. Source : orange-needs-technos.ts. Vide à dessein : route recommandée (aucun partenaire déclaré), prix observés (un seul TJM annoncé), entités juridiques au-delà du dossier. Preuve : demo-orange-dossier-seed.spec.ts.',
}

/**
 * LE BANDEAU « COLLECTE ANTÉRIEURE / DATE NON MESURÉE » NE S'AFFICHE PLUS EN DÉMO (Louis, 13/10/2026) — SEEDÉE.
 *
 * Avant : Société Générale, Groupe BPCE et la plupart des comptes ne portaient aucune date de collecte de segment, donc le
 * bandeau s'allumait « par construction » sur leur fiche — un prospect lisait « date de collecte non mesurée » devant un
 * compte de démonstration. Maintenant : `demoCollectedAtColumns` (demo-dataset.ts) pose, au semis, une date de collecte
 * RELATIVE à l'ouverture de la salle (une heure avant) sur les SIX segments datables de TOUT compte qui n'en porte pas
 * déjà une (SNCF garde la sienne). La production n'est pas touchée : un compte jamais rejoué y garde son bandeau, c'est le
 * fait honnête. Preuve : demo-no-stale-banner.spec.ts (aucun compte de la salle ne déclenche le bandeau).
 */
export const DEMO_NO_STALE_COLLECTION_BANNER_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '13/10/2026 (Louis) — plus aucun bandeau « collecte antérieure » en démonstration : signals_collected_at et les cinq autres colonnes *_collected_at sont posées au semis, relatives à l’ouverture de la salle et postérieures à toute capacité datée (SEGMENT_CAPABILITY_EPOCH). Production inchangée. Preuve : demo-no-stale-banner.spec.ts.',
}

/**
 * SNCF : PAS DE BRIEF — VIDE À DESSEIN, ET LA RAISON EST VRAIE.
 *
 * Aucun classeur n'existe pour SNCF : le CEO en a écrit cinq (SG, BPCE, ENGIE,
 * TotalEnergies, Alstom). Semer un brief SNCF serait en inventer le contenu — la
 * donnée fictive que la doctrine interdit —, et l'écran sait déjà ce état :
 * `raw_analysis.commercial_brief` absent → l'onglet « Ce que je sais » n'apparaît
 * pas sur la fiche. C'est l'état honnête, pas un contournement de la garde.
 * `demo-commercial-brief-seed.spec.ts` prouve que la clé est absente de SNCF.
 */
export const DEMO_COMMERCIAL_BRIEF_SNCF_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    'aucun classeur pour SNCF — le CEO a écrit treize briefs (SG, BPCE, ENGIE, TotalEnergies, Alstom, Naval Group, Chantiers de l’Atlantique, puis pour les démos clients du 06 au 09/10 BNP Paribas, Bpifrance, SNCF, ADEO - Leroy Merlin, Kiabi, ABB Suisse), jamais pour SNCF ; raw_analysis.commercial_brief est donc absent du dossier SNCF et l’onglet « Ce que je sais » n’apparaît pas sur sa fiche (l’écran cache l’onglet quand la clé est absente ou invalide). Semer un brief SNCF en inventerait le contenu.',
}

/**
 * Lot X62 (02/10) — LES CAS DE RECETTE QUE LA SALLE NE POUVAIT PAS REJOUER
 * (#3287, #3434, #3420, #3400). Aucune table ni clé de `raw_analysis` de plus :
 * un message « à relire » bloqué pour « Il manque une preuve » (Directeur technique — entité numérique voyageurs,
 * `DEMO_OUTREACH_MESSAGES`) et quatre amorces scriptées de la conversation
 * (`demo-chat-script.ts` : `p-group-too-broad`, `p-message-quality-check`,
 * `p-tone-vs-decision-role`, `p-action-reoriented`). La carte « Dernier résultat
 * déclaré : Qualifié » de /briefing est portée par SNCF, pas par Thales : Thales
 * a été retiré de la salle le 01/10/2026 (décision de Louis, six comptes
 * cibles) — la recette se rejoue sur SNCF. Un groupe « trop large » se joue sur
 * une société FICTIVE de Découvrir (« (démo) »), jamais sur un compte réel.
 */
export const DEMO_RECETTE_X62_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "Lot X62 (02/10) — n'ajoute ni table ni clé de raw_analysis. Le bloquant « Il manque une preuve » est semé sur un message à relire de Directeur technique — entité numérique voyageurs (client d'exemple fictif) ; quatre amorces scriptées rejouent #3434 (groupe trop large), #3420 (contrôle qualité), #3400 (ton ≠ rôle de décision) et #3287 (action réorientée : Laura propose, ne crée rien). Le dernier résultat déclaré de /briefing est sur SNCF (Thales retiré de la salle le 01/10/2026).",
}

/**
 * Lot X66 (02/10) — LES RESTES DE LA RECETTE PROD Y16 QUE LA SALLE NE POUVAIT PAS
 * REJOUER. Aucune table ni clé de `raw_analysis` de plus :
 *  - #3420 — le message « à relire » de Directeur technique — entité numérique voyageurs (« Notre consultant est
 *    disponible dès lundi… », motif « Il manque une preuve ») est dans
 *    `DEMO_OUTREACH_MESSAGES` ;
 *  - #3270.6 — mc2i, rang 2 gouvernée, est aussi posée sur
 *    Société Générale (`account_partners.partner_relation_id`) : le tiroir de ses
 *    opportunités affiche « Cadre des partenaires rang 2 » ;
 *  - #3284.20/.21 — Société Générale est le compte écarté (« No-Go », revue posée
 *    au 15/10/2026) ; deux amorces scriptées (`p-next-review`, `p-reactivation`)
 *    rendent la prochaine revue et les évènements qui pourraient réactiver, en
 *    propositions ;
 *  - #3533 — un fil de messagerie réellement sans objet (`subject: null`,
 *    `demo-briefing.ts`) : /briefing n'affiche aucune ligne d'objet ;
 *  - #3547 — le besoin au forfait de la salle est semé en forfait encadré (rôle
 *    tenu, équipe côté client), et l'extraction scriptée d'un document propose le
 *    forfait encadré avec sa citation.
 */
export const DEMO_RECETTE_X66_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "Lot X66 (02/10) — n'ajoute ni table ni clé de raw_analysis. Un message bloqué « Il manque une preuve » sur Directeur technique — entité numérique voyageurs, une ESN rang 2 gouvernée (mc2i) sur Société Générale pour le panneau de gouvernance du tiroir d'opportunité, deux amorces scriptées sur le compte écarté de la salle (prochaine revue du 15/10/2026, évènements de réactivation proposés), un fil de messagerie réellement sans objet pour /briefing, et le forfait encadré lu sur la fiche d'un besoin et proposé par l'extraction d'un document de démonstration.",
}

/**
 * Lot X72 (03/10) — LES RESTES DE LA RECETTE PROD Y20 (lot a, f115c14c4). Aucune
 * table ni clé de `raw_analysis` de plus. Le défaut commun était dans la salle, pas
 * dans le jeu de données : une session qui traverse un déploiement ne repassait
 * jamais par `acquire`, donc le semis des lots X62-X68 n'arrivait pas à l'écran
 * (`DemoPoolService.renewLease` relance désormais la vérification d'empreinte) ; et
 * le balayeur d'envoi basculait le message « Validé » de la salle en « En échec »
 * (il ne touche plus un espace de démonstration).
 *  - #3420 — Directeur technique — entité numérique voyageurs : un « Validé » sans motif, « Il manque une preuve »
 *    sur le message à relire (`demo-outreach-screen-read.spec.ts` lit ce que la
 *    fiche lit) ;
 *  - #3532 — les besoins matérialisés de Société Générale sont datés de leur
 *    analyse (`dateMaterializedOpportunities`) : « Analyse terminée » et « Message
 *    copié » ouvrent le fil « Historique & preuves » ;
 *  - #3547 — le dialogue « Créer une mission depuis un document » insère, EN DÉMO
 *    SEULEMENT, un document d'exemple fictif qui dit le forfait encadré.
 */
export const DEMO_RECETTE_X72_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "Lot X72 (03/10) — n'ajoute ni table ni clé de raw_analysis. Le renouvellement de session d'une salle re-sème une salle d'avant le déploiement ; le balayeur d'envoi ne touche jamais un espace de démonstration (le message « Validé » reste validé) ; les besoins matérialisés de Société Générale sont datés de son analyse, donc « Message copié » et « Analyse terminée » sont dans les douze lignes de tête de son historique ; un document d'exemple fictif se colle d'un clic dans « Créer une mission depuis un document » pour rejouer l'extraction du forfait encadré.",
}

/**
 * Lot X68 (02/10) — LES RELIQUATS DE LA RECETTE PROD Y18 (#3420, #3403, #2297).
 * Aucune table ni clé de `raw_analysis` de plus : trois semis dans des tables
 * DÉJÀ classées seedées. (1) Les sept messages d'exemple (`DEMO_OUTREACH_MESSAGES`)
 * citent le secteur de leur compte — « ne cite rien de ce qu'on sait du compte »
 * ne s'affiche plus 3× sur Directeur technique — entité numérique voyageurs, et un message « Validé » ne porte
 * plus aucun motif de qualité (serveur). (2) La chaleur du lien est déclarée sur
 * les voies de SNCF (`DEMO_PERSONAL_ACCESS_PATH_SEEDS`, contacts simulés de
 * son dossier ; les sièges de livraison n'en portent aucune depuis le 04/10) — ce dernier, non vérifié, se lit « Simple
 * affinité ». (3) Le lot MIXTE d'enrichissement se joue chez SNCF : Hugo
 * Delannoy (sous délai de protection) + Younes Berrada (LinkedIn seul, donc
 * facturable). Gardes : `demo-outreach-scope-anchor-coverage.spec.ts`,
 * `demo-personal-access-nova-warmth-coverage.spec.ts`,
 * `demo-mixed-enrichment-selection-coverage.spec.ts`.
 */
export const DEMO_RECETTE_X68_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "Lot X68 (02/10) — n'ajoute ni table ni clé de raw_analysis. Messages d'exemple qui citent le secteur de leur compte (plus de « ne cite rien du compte » en salle) ; chaleur du lien déclarée sur les deux voies de SNCF (proche / distant, ce dernier non vérifié = simple affinité) ; lot mixte d'enrichissement jouable chez SNCF (Hugo Delannoy sous délai de protection + Younes Berrada, LinkedIn seul, facturable). Aucune donnée inventée : contacts SIMULÉS déjà semés, slug LinkedIn visiblement fictif.",
}

/**
 * Lot X77 (03/10) — LES RESTES DES RECETTES Y20-Y22. Aucune table ni clé de `raw_analysis`
 * de plus (`entities_exhaustive` est déjà classée) :
 *  - #3473 — un VRAI dossier de la salle porte des entités dans
 *    `raw_analysis.entities_exhaustive` sans qu'aucun de ses contacts ne les déclare :
 *    `account_entities` se dérive des contacts, donc l'onglet Accès rend « N entités
 *    repérées par l'analyse, aucune n'est déclarée » — recalculé par la garde (le compte
 *    fictif qui le portait a quitté la salle, décision Louis 04/10/2026) ;
 *  - #3533 / #3490 / #3544 — rien à semer : un titre qui se replie sur deux lignes, des comptes
 *    écartés que la liste de doublons nomme (la salle ne balaie pas, règle démo), une mesure.
 */
export const DEMO_RECETTE_X77_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "Lot X77 (03/10) — n'ajoute ni table ni clé de raw_analysis. Un vrai dossier de la salle porte des entités repérées par l'analyse et aucun contact pour les déclarer (recalculé par demo-recette-x77-coverage.spec.ts, le compte fictif d'origine a quitté la salle le 04/10) : l'onglet Accès montre le cas « repérées, non déclarées » au lieu du bloc muet de la prod.",
}

/**
 * #3586 — LE DRIVE INTERNE BELLUM → RAG PRODUIT COMMUN : VIDE À DESSEIN, INTERNE.
 *
 * Le panneau « Drive interne » (`GET /internal/internal-knowledge`, gardé par `InternalSecretGuard`, lu par le dashboard-manager) et
 * ses tables (`internal_knowledge_files`, `internal_knowledge_sync_state`, `internal_knowledge_digests` — le
 * digest préfixé aux prompts commerciaux, #3586 W2 —, scope `operator`) sont de
 * la plomberie de l'éditeur : aucun prospect, aucun espace — donc aucune salle de démonstration — ne les
 * voit. Les chunks `DRIVE_INTERNE` vivent dans le corpus PARTAGÉ `dataforge_rag_chunks` (même doctrine que
 * `DEMO_BRIEFING_STRUCTURAL_POTENTIAL_COVERAGE` : on n'y seede rien depuis une salle, un chunk fictif
 * serait lu par de vraies ESN concurrentes).
 */
export const DEMO_INTERNAL_KNOWLEDGE_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "Le Drive interne Bellum (#3586) est une fonction INTERNE : son panneau n'existe que dans le dashboard-manager (outil interne, secret interne), ses tables sont de la plomberie d'opérateur, et ses chunks vivent dans le corpus partagé que la démo ne seede pas. Aucun écran user-facing n'est concerné.",
}

/**
 * #3672 — LES QUATRE LIBELLÉS DE PROVENANCE EN SALLE : UN SEMÉ, TROIS VIDES À DESSEIN (06/10/2026).
 *
 * Aucune table neuve, aucune clé de `raw_analysis` neuve : seul le LIBELLÉ d'une provenance existante change
 * (`common:provenance.*`) et la carte de recommandation gagne « Voir les éléments ».
 *
 * - « Hypothèse à valider » : SEMÉE — la source `inference` vient de `accounts.strategy_refreshed_at` et du
 *   chemin d'accès que `demo-seed.service.ts` pose sur les dossiers de la salle ; le visiteur la lit sur la
 *   carte de recommandation, avec sa date relative.
 * - « Historique observé » (période 2024) : VIDE À DESSEIN — il vient du statut de compte `dataforge` et de la
 *   mémoire marché, le corpus PARTAGÉ entre tous les espaces (aucun `workspace_id`, GA-16). Y poser un fait
 *   daté de 2024 depuis une salle serait lu par de vraies ESN concurrentes : même doctrine que
 *   `DEMO_BRIEFING_STRUCTURAL_POTENTIAL_COVERAGE` et que l'entrée `proofs`. Le geste reste démontré par
 *   `AccountRecommendationCard.test.tsx` (période documentée, jamais la dernière activité).
 * - « Information de ton équipe » : VIDE À DESSEIN — c'est une correction humaine, donc `field_provenance`,
 *   volontairement vide en salle (voir son entrée) : le visiteur la fait apparaître en corrigeant un champ.
 * - « Information vérifiée » : VIDE À DESSEIN — elle n'est portée que par une identité publiée par un registre
 *   officiel (`registry_identity`) ; les dossiers de la salle n'en ont pas, et on n'en affirme pas une.
 */
export const DEMO_PROVENANCE_LABELS_COVERAGE: Readonly<{
  seeded: readonly string[]
  emptyByDesign: Readonly<Record<string, string>>
}> = {
  seeded: ['Hypothèse à valider'],
  emptyByDesign: {
    'Historique observé': "Corpus de marché partagé entre espaces : une salle n'y écrit rien (GA-16).",
    'Information de ton équipe':
      'Aucune ligne `human` sur un dossier de compte en salle : le visiteur fait lui-même la correction. La seule `human` semée porte sur la fiche d’un talent (#4577.3, « Saisi à la main »), jamais sur un compte.',
    'Information vérifiée': "Réservée à une identité de registre officiel ; aucun dossier de la salle n'en porte une.",
  },
}

/**
 * LECTURE AUTOMATIQUE DES CV À L'IMPORT (04/10/2026, import ZIP de 688 CV —
 * `c88_lecture_auto_cv_import`). Aucune table neuve : une colonne,
 * `consultants.cv_auto_read_at` (table déjà classée seedée), et une file BullMQ.
 *
 * Le GESTE vit en démo : un import de CV fait dans la salle part en lecture
 * SCRIPTÉE (`CvAutoParseService.readOne` → `autoRead({ demo: true })` →
 * `scriptedDemoParse`), zéro appel modèle, zéro crédit — prouvé par
 * `cv-auto-parse.service.spec.ts` (« salle de démonstration »).
 *
 * ⚠️ **Relu le 08/10/2026 (#3947, retour bêta Louis) : le BANDEAU qui portait
 * ce compte est SUPPRIMÉ**, pas seulement caché — `CvAutoReadBanner` n'existe
 * plus (il restait de toute façon vide à dessein : les fiches seedées du
 * vivier portent déjà leur nom, le compte valait 0 — « on n'affiche pas ce
 * qu'on n'a pas »). La lecture automatique, elle, tient toujours en démo,
 * en mode SCRIPTÉ, et c'est elle que cette entrée documente.
 */
export const DEMO_CV_AUTO_READ_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "c88 (04/10/2026) — n'ajoute ni table ni clé de raw_analysis (colonne consultants.cv_auto_read_at, table déjà seedée). La lecture automatique tourne en démo en mode SCRIPTÉ sur tout import fait dans la salle (zéro appel modèle). ⚠️ Relu le 08/10/2026 (#3947) : le bandeau qui comptait les CV pas encore lus (`CvAutoReadBanner`) est SUPPRIMÉ de l'écran, pas seulement vide — la lecture automatique reste inchangée et sans réglage. #3935 (lot BATCH-CV, 12/10/2026) : la concurrence (env), le limiteur et le report sur saturation IA ne changent QUE le débit de la file — aucun écran, aucune table, aucune clé neuve ; en démo la lecture SCRIPTÉE n'appelle jamais le modèle, donc jamais de saturation à montrer.",
}

/**
 * #3758 (reste du lot J14, 07/10) — LA CARTE `post_meeting_summary` DE LAURA.
 *
 * N'ajoute ni table ni clé de `raw_analysis` : une colonne,
 * `notes.meeting_recap_snapshot` (table `notes` déjà classée seedée), posée
 * par `MeetingNotesService.approveInternal` à l'approbation d'un compte
 * rendu. Aucune note de démo ne porte aujourd'hui cet instantané : le geste
 * d'approbation qui le produit (`MeetingNotesCard`, `NoteCascadeProposal`)
 * n'est pas scripté en salle de démonstration — demander « le compte rendu
 * du rendez-vous » y retombe sur l'absence NOMMÉE (carte `missing_data`),
 * jamais sur une carte inventée.
 */
export const DEMO_POST_MEETING_SUMMARY_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#3758 (reste du lot J14, 07/10) — n'ajoute ni table ni clé de raw_analysis (colonne notes.meeting_recap_snapshot, table déjà seedée). Aucune note de démonstration ne porte aujourd'hui d'instantané de compte rendu : le geste d'approbation qui le produit n'est pas scripté en salle. « Le compte rendu du rendez-vous » y retombe sur l'absence nommée (missing_data), jamais une carte inventée.",
}

/**
 * #3676 / #3714 — « SIGNAUX ET BESOINS » : classée SEEDÉE, aucune table neuve.
 *
 * La surface unique du dossier lit `opportunities` (déjà SEEDÉE) et
 * `qualification_lead_decisions`. Les quatre cas qu'elle doit savoir
 * distinguer — demande confirmée, affaire travaillée à titre générique,
 * généralité sans travail, programme nommé — sont semés par
 * `DEMO_DELIVERY_CLIENT.signalsAndNeedsCases`, recomptés sur le JEU par
 * `demo-signals-and-needs-coverage.spec.ts`. Le signal récent, la piste et
 * l'historique daté viennent de `detectedSignals`. Les comptes de la salle qui
 * n'ont aucune ligne rendent l'état « aucune demande ouverte retrouvée » (ou
 * « recherche non faite » tant que leur collecte n'a pas eu lieu) : le cas
 * négatif est démontrable sans donnée de plus.
 */
export const DEMO_SIGNALS_AND_NEEDS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'La surface « Signaux et besoins » du dossier compte (#3676) et le retrait du bandeau « À regarder en premier » (#3714) n’ajoutent NI table NI colonne : elles lisent `opportunities`, déjà classée SEEDÉE. `DEMO_DELIVERY_CLIENT.signalsAndNeedsCases` sème les quatre cas à distinguer — une demande confirmée (`stage: confirmed`), une affaire travaillée à titre générique (montant saisi : elle RESTE), une généralité sans travail ni source (elle sort des compteurs, `generic_deductions`), un programme nommé et sourcé (fait documenté). Les signaux datés viennent de `detectedSignals`, dont un signal HORS CIBLE (domaine `finance`, hors de l’offre `esn_it` de la salle — consultable, jamais promu en recommandation, #3678.7). #3681 : `DEMO_DELIVERY_CLIENT.internalHireNeed` sème une annonce de recrutement INTERNE (`project_needs.contract_kind = recrutement`, écrite par `seedInternalHireNeed`) à côté des vraies demandes ouvertes (`openNeeds`) : l’onglet Besoins la nomme sans la compter comme demande. Le programme nommé sans périmètre porte la réserve (#3678.7). Recompté sur le JEU, avec `projectNature` du contrat, par `demo-signals-and-needs-coverage.spec.ts`. La DATE D’ÉVÉNEMENT distincte de la date d’analyse n’est pas seedable : aucune colonne ne la porte (reste #3678.6).',
}

/**
 * #2561/#2562 — « VENTES DANS ODOO » DE /missions : classée SEEDÉE, aucune table neuve.
 *
 * Les ventes ne sont stockées nulle part chez nous (lues en direct, lecture
 * seule). La salle n'a AUCUNE instance branchée : `MissionOdooSalesService`
 * sert `DEMO_ODOO_SALES` (`demo-dataset.ts`) à la place, SEULEMENT en démo.
 * La garde par table ne poserait jamais la question — d'où cette entrée, et
 * son appelant `demo-odoo-sales-coverage.spec.ts` qui lit le VRAI jeu.
 */
export const DEMO_ODOO_SALES_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#2561/#2562 (démo François, 08/10/2026) — la section « Ventes dans Odoo » de /missions sert en démonstration quatre ventes FICTIVES (`DEMO_ODOO_SALES`, dates relatives) : S00118 retombe sur la mission SNCF déjà en cours (« déjà une mission », par le libellé de la prestation), S00124 (SNCF) et S00131 (Société Générale) sont à reprendre — prévisualisation figée puis création de vraies missions dans la salle, idempotente (`missions.odoo_sale_order_id`, index unique) —, S00137 nomme un client sans compte Bellum et ne propose rien. Aucune connexion n’est lue en démo, aucun appel ne part. Recompté sur le JEU par `demo-odoo-sales-coverage.spec.ts`.',
}

/**
 * P05.a (#3246, lot 09/10) — « CE QUI MARCHE AILLEURS » (la base anonyme
 * commune, `c92_base_anonyme_commune`) : SEEDÉ.
 *
 * Les tables `shared_*` n'ont NI `workspace_id` NI `user_id` : HORS du
 * périmètre des gardes par table PAR CONSTRUCTION (comme
 * `enrichment_duration_samples`). La réponse écrite : la salle a ses PROPRES
 * lignes (`scope = 'demo'`), semées par `DemoSeedService.seedSharedBase`
 * depuis quatre espaces FICTIFS, à travers la même mutualisation que le réel
 * — donc jamais une ligne qui n'aurait pas franchi le seuil des trois espaces,
 * et jamais une ligne qui pollue ce que lisent les vrais clients
 * (`scope = 'live'`). En salle, Laura est scriptée : l'amorce
 * `p-shared-base-elsewhere` (`demo-chat-script.ts`) cite exactement ces
 * comptes, et `demo-shared-base-coverage.spec.ts` le tient.
 */
export const DEMO_SHARED_BASE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "P05.a (#3246, 09/10/2026) — quatre espaces FICTIFS de la salle déclarent des issues par étape de relance (`DEMO_SHARED_BASE_ACTION_OUTCOMES`) ; `seedSharedBase` les mutualise comme le réel, au périmètre `demo`. Ressortent `relance` (4 espaces, 10 sur 18) et `preuve_sociale` (3 espaces, 8 sur 12) ; `initial`, porté par deux espaces, reste sous le seuil et ne sort pas. L'amorce scriptée `p-shared-base-elsewhere` les cite. P05.b — les mêmes espaces fictifs portent des cas gagnés / perdus au profil de Société Générale (`DEMO_SHARED_BASE_CASE_OUTCOMES`, `rewriteCaseOutcomeCells`) : secteur `naf_64` (4 espaces, 5 gagnés, 4 perdus), taille `ge` et position `groupe` (3 espaces, 4 gagnés, 3 perdus) ; l'amorce `p-shared-base-cases` les cite. P05.c — les mêmes espaces portent des signaux suivis d'une affaire ouverte (`DEMO_SHARED_BASE_SIGNAL_DEALS`, `rewriteSignalDealCells`) : `budget` (4 espaces, 4 sur 11) ; `nomination`, porté par deux espaces, reste sous le seuil ; l'amorce `p-shared-base-signals` les cite. #3989 (Louis 11/10/2026, c94) — des rôles apportés par un utilisateur d'un espace fictif sur Société Générale (`DEMO_SHARED_BASE_COMPANY_ROLES`, `upsertSharedCompanyPeople`, scope `demo`) entrent ANONYMISÉS par la même frontière que le réel : « Responsable achats IT » et « Directeur de la transformation digitale », jamais les noms fictifs qui les accompagnent ; l'amorce `p-shared-base-roles` les cite. Une fiche RECOPIÉE (source `shared_base`) n'est pas semée : la recopie a lieu à l'analyse d'un compte, et les dossiers de la salle sont semés, pas analysés — le visiteur voit la provenance « Base commune » dès qu'il analyse un compte d'une société que la base connaît. #2877 GLOBAL — l'apprentissage des messages des mêmes espaces fictifs (`DEMO_SHARED_BASE_MESSAGE_LEARNING`, `rewriteMessageLearningCells`) : `approved_after_edit` (4 espaces, 10), `approved_without_edit` (3 espaces, 6), `wrong_fact` (3 espaces, 7) ; `wrong_cta`, porté par deux espaces, ne sort pas. Le service IA lit ces cellules (scope `demo`) à la génération d'un message dans la salle. #3989.7 (Louis 15/10/2026) — la coordonnée PRO réutilisée (`shared_person_coordinates`) voyage avec la fiche RECOPIÉE et pour la même raison n'est pas semée : elle n'existe qu'au moment où un compte est analysé, et les dossiers de la salle sont semés ; les rôles anonymes semés ci-dessus n'en portent jamais (`toSharedCoordinates` refuse une origine « user »). #4286.15.b (Louis 19/10/2026) — l'état employeur (`employment_state`, `left_at`) est posé par la MÊME écriture (`upsertSharedCompanyPeople`) : les rôles semés sont ACTUELS et revus au semis, donc lus par Laura ; aucun ancien n'est semé, à dessein — un ancien n'est jamais recopié ni lu, la salle n'aurait rien à en montrer. #4286.15.c (Louis 22/10/2026) — `market_pattern` : les mêmes espaces fictifs portent des recrutements repérés au profil de Société Générale (`DEMO_SHARED_BASE_MARKET_PATTERNS`, `rewriteMarketPatternCells`, scope `demo`) : `data` sort à la cellule fine (`naf_64`, `ge`, `ile_de_france` — 4 espaces, 5 recrutements), `cloud` au secteur et à la taille toutes régions (3 espaces), `securite`, porté par deux espaces, ne sort pas ; `get_account_signals` les sert (`marketPatterns`) et l'amorce `p-shared-base-market-patterns` les cite, « observé dans N espaces ».",
}

/**
 * #3705.5 (lot RBC, 11/10) — « FILIALE DE <GROUPE> » SUR LES LIGNES DE DÉCOUVRIR : SEEDÉE.
 *
 * N'ajoute ni table ni clé de `raw_analysis` : `groupLink` voyage sur la réponse de `/discover`
 * (`DiscoverCandidate.groupLink`), la garde par table ne pose donc pas la question. Son appelant,
 * `demo-discover-group-link-coverage.spec.ts`, lit la réponse SCRIPTÉE brute (`demoDiscoverResponse`).
 * La salle ne lance aucun appel de vérification : elle rejoue un lien déjà connu.
 */
export const DEMO_DISCOVER_GROUP_LINK_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#3705.5 (lot RBC, 11/10/2026) — Pharmatek Santé (démo) porte `groupLink: { kind: "capital_link", entities: ["Groupe Aurélys (démo)"] }` dans la liste scriptée de Découvrir : la ligne affiche « Filiale de Groupe Aurélys (démo) ». Les autres lignes n’en portent pas : une absence ne fait aucune ligne. Aucun appel de vérification en salle. Vérifié par `demo-discover-group-link-coverage.spec.ts`.',
}

/**
 * #4892.1 (Louis 31/10) — « UNE MARQUE = UNE LIGNE » SUR LES LIGNES DE DÉCOUVRIR : SEEDÉE.
 *
 * N'ajoute ni table ni clé de `raw_analysis` : `brandGroup` voyage sur la réponse de `/discover`. Deux entités
 * FICTIVES de la même marque (SIREN distincts, même ville) sont scriptées ; l'écran n'affiche que la tête, dépliable.
 */
export const DEMO_DISCOVER_BRAND_GROUP_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4892.1 (31/10/2026) — Valcourt France (démo) porte `brandGroup: { role: "head", members: [Maison Valcourt (démo)] }` et Maison Valcourt (démo) `brandGroup: { role: "member", headSiren }` dans la liste scriptée de Découvrir : la liste montre UNE ligne, l’autre entité se déplie. Les autres lignes n’en portent pas. Rien n’est fusionné : deux SIREN distincts. Vérifié par `demo-scripts.spec.ts`.',
}

/**
 * #3983 (reste, Louis 11/10) — « HOLDING → FILIALE » DANS UNE RECHERCHE PAR ZONE : SEEDÉE.
 *
 * N'ajoute ni table ni clé de `raw_analysis` : le verdict voyage sur la réponse de `/discover`
 * (`qualification`). Son appelant, `demo-discover-holding-subsidiary-coverage.spec.ts`, lit la
 * réponse SCRIPTÉE brute (`demoDiscoverResponse`). La salle ne lance aucun appel de vérification.
 */
export const DEMO_DISCOVER_HOLDING_SUBSIDIARY_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#3983 (reste, 11/10/2026) — Groupe Aurélys (démo), holding (NAF 64.20Z) au siège parisien, porte `qualification: { verdict: "excluded", code: "holding_subsidiary_in_zone" }` dans la liste scriptée de Découvrir, sa raison nommant sa filiale Pharmatek Santé (démo), qui reste la cible et affiche « Filiale de Groupe Aurélys (démo) ». La ligne écartée est masquée par défaut et comptée par le compteur nommé, comme le vrai chemin. Vérifié par `demo-discover-holding-subsidiary-coverage.spec.ts`.',
}

/**
 * #4358.4 = #4419.10 = #4435.4 — LE SECTEUR SE LIT PAR NAF + ACTIVITÉ + SITE : SEEDÉ.
 *
 * Marché Reconditionné (démo), NAF 46.90Z (commerce de gros), porte `qualification.sectorAttachment`
 * (`ecommerce`, `activity`) dans la liste scriptée de Découvrir : l'écran nomme « rattaché par son activité ».
 * Vérifié par `demo-discover-sector-attachment-coverage.spec.ts`.
 */
export const DEMO_DISCOVER_SECTOR_ATTACHMENT_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4358.4 (21/10/2026) — Marché Reconditionné (démo), NAF 46.90Z, porte `qualification.sectorAttachment` { sector: "ecommerce", via: "activity" } dans la liste scriptée de Découvrir : sa ligne nomme « rattaché par son activité ». Vérifié par `demo-discover-sector-attachment-coverage.spec.ts`.',
}

/**
 * #4034 — L'APERÇU DU CV DANS LA FICHE CONSULTANT : SEEDÉ (texte), ORIGINAL VIDE À DESSEIN.
 *
 * Aucune table neuve : `consultant_documents.storage_path` est une colonne. Les
 * documents semés (`DEMO_CV_IMPORT_CONSULTANTS[].documents`) portent leur TEXTE
 * extrait ; l'aperçu le met en page. Aucun fichier n'est fabriqué pour la salle
 * — un faux PDF serait une donnée inventée — donc `storage_path` reste `null` et
 * l'aperçu DIT « Original non conservé pour ce CV », comme pour un CV réel
 * importé avant #4034. Vérifié par `demo-cv-preview-coverage.spec.ts`.
 */
export const DEMO_CV_PREVIEW_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4034 (Louis 12/10/2026) — chaque CV semé de la salle porte son texte extrait : l’aperçu (« Ouvrir le CV », clic sur un document) le met en page. L’ORIGINAL n’est pas semé, à dessein : aucun faux fichier ; `storage_path` reste `null` et l’aperçu affiche « Original non conservé pour ce CV — dépose-le à nouveau pour l’aperçu fidèle ». Vérifié par `demo-cv-preview-coverage.spec.ts`.',
}

/**
 * « ET EN DÉMONSTRATION, LAURA RÉPOND-ELLE VRAIMENT ? » — NON, ELLE EST SCRIPTÉE, À DESSEIN.
 *
 * Décision Louis 12/10 (lot DEMO-PRODUIT) : garder le moteur scripté. N'ajoute ni table ni clé
 * de `raw_analysis` ; classée ici pour que la raison ait UN endroit lisible de plus que le code.
 */
export const DEMO_LAURA_SCRIPTED_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'Décision Louis 12/10 : Laura reste scriptée en démo — zéro coût IA par visite et démo stable en réunion ; le cas hors script ne fabrique rien. Le moteur est apps/web/src/features/chat/api/demo-turn.ts (réponses, suggestions DemoSuggestionRow), le briefing, la veille et l’onboarding démo sont servis par le semis côté API. Vérifié par demo-laura-scripted-coverage.spec.ts, qui lit la raison en tête de demo-turn.ts.',
}

/**
 * #4064 / #4065 (lot LISTINGS, 12/10/2026) — LES LISTINGS DE LAURA : SEEDÉS par une réponse scriptée.
 *
 * Aucune table ni clé `raw_analysis` neuve : `list_records` relit des sources déjà classées (agenda,
 * messagerie, contacts, comptes, besoins, vivier, missions, ATS). Laura reste scriptée en salle
 * (décision Louis 12/10) : l'amorce `p-listing-agenda` (`demo-chat-script.ts`) sert la carte
 * `file_export` d'un listing croisé, avec source, période et total lus nommés.
 * Garde : `demo-laura-listings-coverage.spec.ts`.
 */
export const DEMO_LAURA_LISTINGS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4065 — « Liste les personnes que j’ai rencontrées ces 3 derniers mois et absentes du CRM » : la salle répond par la carte file_export d’un listing agenda × CRM (personnes fictives « (démo) »), période et total lu nommés, une société non vérifiée nommée, export CSV local.',
}

/**
 * LAURA-OFFRES-4563 (25/10/2026) — « TROUVE-MOI DES OFFRES <COMPÉTENCE> SUR <VILLE> » (Laura) : SEEDÉ par une réponse
 * scriptée.
 *
 * Aucune table ni clé `raw_analysis` neuve : l'outil `search_job_offers` LIT des offres du marché (cache 30 j,
 * plafond d'appels payés) et n'écrit rien. Laura reste scriptée en salle (décision Louis 12/10) : l'amorce
 * `p-offres-competence` (`demo-chat-script.ts`) sert la carte `file_export` d'une liste d'OFFRES (intitulé, employeur,
 * date, lieu, lien), le palier atteint dit, statut / TJM / télétravail « non précisé » quand l'annonce ne les donne pas.
 * Garde : `demo-laura-offres-coverage.spec.ts`.
 */
export const DEMO_LAURA_JOB_OFFERS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4563 — « Trouve-moi des offres Vue et Java sur Lille » : la salle répond par la carte file_export de cinq offres fictives (employeurs « (démo) », liens example.org), le palier « termes voisins » où le plancher de 5 est atteint dit, ce qui n’est pas su nommé « non précisé » (jamais 0), aucun fournisseur nommé.',
}

/**
 * #4748 (29/10/2026) — UNE LISTE LONGUE DE LAURA (plus de 20 lignes, bouton « Télécharger ») : SEEDÉE par une réponse
 * scriptée.
 *
 * Aucune table ni clé `raw_analysis` neuve : l'amorce `p-liste-longue` (`demo-chat-script.ts`) sert une carte
 * `file_export` de 24 lignes. Le tableau les rend toutes, le bouton dit combien partent, le CSV en contient autant :
 * le défaut « 3 lignes montrées, ~100 annoncées, 3 exportées » ne peut plus revenir sans être vu en réunion.
 * Garde : `demo-laura-liste-longue-coverage.spec.ts`.
 */
export const DEMO_LAURA_LONG_LIST_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4748 — « Donne-moi en fichier la liste complète des PME industrielles à suivre » : la salle répond par la carte file_export de 24 lignes (entreprises fictives « (démo) »), effectif vide quand il n’est pas connu (jamais 0), aucun fournisseur nommé.',
}

/**
 * #4742 (28/10/2026) — LA STRUCTURE TECHNIQUE D'UN COMPTE (CRM, ERP, données, hébergement, outils métier) : SEEDÉE.
 *
 * Aucune table, aucune clé de `raw_analysis` neuve : `GET /accounts/:id/tech-structure` calcule à la lecture sur
 * `it_job_signals`, `detected_tech_stack` et `technology_stack`. Le dossier SNCF de démonstration nomme désormais des
 * outils dans ses offres (SAP, Snowflake, Power BI, Azure, ServiceNow…, liens `example.org/demo`) : ERP, données,
 * hébergement et outils métier ressortent avec leur preuve datée, et l'axe CRM reste NOMMÉ « non observé » — la
 * structure se montre partielle, jamais « 0 ». Garde : `demo-tech-structure-coverage.spec.ts`.
 */
export const DEMO_TECH_STRUCTURE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4742 — la structure technique du compte SNCF : ERP, données, hébergement et outils métier prouvés par des offres datées (liens example.org/demo), le CRM nommé « non observé », aucune source ni aucun fournisseur nommé.',
}

/**
 * #4114 (13/10/2026) — LES PROPOSITIONS DE DOUBLONS DE PERSONNES : SEEDÉES.
 *
 * Aucune table, aucune clé de `raw_analysis` : `GET /contacts/account/:id/duplicate-proposals` calcule à la lecture, sur
 * les contacts du compte. Les dossiers de démonstration portent déjà de vraies variantes d'orthographe d'une même
 * personne (« Denys / Denis Duyck », « Jérome Lemoine / Jérôme LEMOYNE », « Vincent Vandenberge / Vandenberg Vincent »
 * chez Société Générale et ENGIE) : la lecture rend donc des paires en salle sans rien fabriquer. Aucun écran ne la
 * montre dans ce lot. Garde : `demo-duplicate-proposals-coverage.spec.ts`.
 */
export const DEMO_CONTACT_DUPLICATE_PROPOSALS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4114 — lecture calculée sur les contacts déjà semés : les dossiers Société Générale et ENGIE portent des variantes d’orthographe d’une même personne (même e-mail, nom proche), que la lecture propose sans les fusionner. Aucun semis dédié, aucun écran dans ce lot.',
}

/**
 * #4134 à #4137 (lot UX atomic, 13/10/2026) — QUATRE GESTES D'ÉCRAN, UNE SEULE DONNÉE À SEMER.
 *
 * Aucune table ni clé `raw_analysis` neuve. Reporter une tâche (#4134) lit `tasks` (dont une en
 * retard), la feuille « Note ou tâche » de la fiche contact (#4135) écrit dans `notes` et `tasks`
 * (déjà seedées), tirer pour rafraîchir (#4136) ne montre aucune donnée. Seul #4137 a besoin d'une
 * ligne : l'onglet « Archivés » du pipe lit `opportunities` avec `archived_at` posé —
 * `DEMO_DELIVERY_CLIENT.archivedProject` (étape `dormant`, jamais `lost` : elle fausserait la
 * calibration de la probabilité). Garde : `demo-archived-project-coverage.spec.ts`.
 */
export const DEMO_UX_ATOMIC_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4137 — un dossier archivé est semé (`DEMO_DELIVERY_CLIENT.archivedProject`, étape `dormant`, `archived_at` posé) : l’onglet « Archivés » du pipe s’ouvre rempli et « Désarchiver » le remet en place. #4134/#4135 relisent `tasks` et `notes` déjà seedées ; #4136 (tirer pour rafraîchir) n’affiche aucune donnée, donc rien à semer.',
}

/**
 * L2 Pilotage › Pipe (Louis 14/10/2026) — LA COUVERTURE DÉMO DE `/pilotage/pipe`,
 * bloc par bloc : soit SEEDÉ (et où), soit VIDE À DESSEIN (et pourquoi). Une
 * entrée ne bouge JAMAIS vers « vide à dessein » pour faire passer une garde.
 * Garde : `demo-pipe-coverage.spec.ts`.
 */
export const DEMO_PIPE_COVERAGE = {
  seeded: {
    inspection:
      'Douze affaires sur les comptes réels de la salle (`DEMO_PIPE_L2`), catégories déclarées variées dont des « non déclarées », dates prévues dépassées ou repoussées.',
    waterfall:
      'Journal des stades (`commercial_transitions`) et des montants (`opportunity_field_changes`) relatif au mois en cours : créées, montées, baissées, perdues, signées, sorties — jamais vide, quel que soit le jour du mois.',
    riskSignals:
      'Les cinq familles de faits (aucune activité, date dépassée, date repoussée, montant baissé, étape inchangée) sont exercées par `DEMO_PIPE_L2`.',
    declaredCategory:
      'Les quatre catégories et « non déclarée » : sur les affaires neuves et, par libellé, sur trois opportunités déjà semées.',
  },
  intentionallyEmpty: {
    byOwnerMultiCommercial:
      'Pas de coéquipiers fictifs en démo (Louis 14/10/2026) : le bloc « par commercial » ne montre que le seul commercial de la salle (plus la ligne « non attribué » des opportunités sans porteur). Y semer des collègues inventés mettrait en scène une équipe, des taux de gain et des cycles de vente que personne n’a mesurés.',
  },
} as const

/**
 * #4158.13 (Louis, 14/10/2026) — LE MODE ÉQUIPE EN SALLE : trois collègues
 * fictifs, pour que la barre latérale affiche « Équipe » (dès deux membres
 * actifs) et que `/team` montre une équipe vivante.
 *
 * Chaque bloc dit ce qui est SEMÉ et ce qui reste vide À DESSEIN, avec sa
 * raison — jamais « on a oublié ». La source unique des identifiants est
 * `DEMO_COLLEAGUES` (`demo-dataset.ts`) : les lots qui parlent d'équipe en
 * démonstration (notifications, contenu de `/team`) s'alignent dessus.
 */
export const DEMO_TEAM_COLLEAGUES_COVERAGE: Readonly<
  Record<string, { state: 'seede' | 'vide_a_dessein'; reason: string }>
> = {
  membres: {
    state: 'seede',
    reason:
      'Trois collègues fictifs (prénom + nom complets ; rôles sales, sales, admin) dans `workspace_members` et `profiles`, avec un compte d’authentification créé SANS mot de passe sur un domaine réservé — comme celui de l’occupant. Ils ne se connectent pas. Un compte qui ne se crée pas laisse la salle à un occupant plutôt que de la casser.',
  },
  comptesPortes: {
    state: 'seede',
    reason:
      'Six comptes secondaires (et leurs contacts) sont attribués aux collègues (`accounts.assigned_to`) ; les dossiers vedettes restent à l’occupant, dont le parcours de démonstration dépend.',
  },
  actionsDeleguees: {
    state: 'seede',
    reason:
      '`DEMO_DELEGATED_ACTIONS` : trois actions en cours (ni faites ni en retard), créées par l’occupant, portées par un collègue (`action_plan_items.assigned_to`).',
  },
  activite: {
    state: 'seede',
    reason:
      '`DEMO_COLLEAGUE_ACTIVITY` : des analyses terminées dans `user_actions`, sur les comptes des collègues uniquement — aucune ne porte de preuve d’envoi, aucune ne ressemble à une collision de prospection.',
  },
  compteAnalyseTravaille: {
    state: 'seede',
    reason:
      '29/10/2026 (Louis) — RENVERSEMENT de #2117.14 (« espace de démo solo ») : « le mode équipe est ce que Bedros et Adel ont acheté : un prospect doit le voir ». `DEMO_SHARED_ACCOUNT_WORK` : Société Générale, compte vedette ANALYSÉ par l’occupant (premier membre), porte une tâche travaillée par Léa Marchand (second membre, fictive, domaine réservé) — le geste « un coéquipier agit sur le compte qu’un autre a analysé » (#4731). Une tâche (`action_plan_items`), jamais une ligne `user_actions` : pas de fausse collision, aucun envoi. Tenu par `demo-team-shared-account.spec.ts`.',
  },
  contactCollecteParCollegue: {
    state: 'vide_a_dessein',
    reason:
      '#4803 (29/10/2026) — le geste « un contact collecté par un COLLÈGUE s’enrichit, s’exporte, s’ajoute à une campagne » ne dépend plus de `user_id` mais de l’espace (`contact-gesture-scope.ts`). Le semer exigerait de réécrire `contacts.user_id` au nom d’un collègue : or `user_id` est aussi ce que le reset de la salle (`demo-reset.service`) et l’effacement par propriétaire lisent, et ce chemin ne se lance pas hors base ici. Les contacts des comptes portés par les collègues (`comptesPortes`) restent donc créés par l’occupant, et la démonstration montre déjà le geste sur eux — qui passe aussi par la clé d’espace. Pas un oubli : un semis qui peut orpheliner un reset se décide, il ne se glisse pas dans un correctif de barrières. Tenu par `contact-gesture-scope.spec.ts` (7 gestes, collègue passe, autre espace refusé).',
  },
  commentairesEtPartages: {
    state: 'vide_a_dessein',
    reason:
      'Commentaires d’équipe et partages de dossiers sont des gestes du visiteur (voir `team_comments` et `account_shares`) ; les semer ferait parler des collègues fictifs en nom propre.',
  },
  reset: {
    state: 'seede',
    reason:
      'Un reset passe avec ces membres : `workspace_members` et `profiles` survivent (identité), et tout ce que le semis leur rattache part avant les comptes (preuve : `demo-reset.service.spec.ts`).',
  },
}

/**
 * DISCOVER-OFFRES (15/10/2026) — LE VOLUME D'OFFRES D'UNE CARTE DE DÉCOUVRIR : SEEDÉ.
 *
 * Même raison structurelle que `DEMO_DISCOVER_SIMILARITY_HEADLINE_COVERAGE` : `offersVolume` voyage sur la
 * réponse de `/discover` (`DiscoverCandidate.offersVolume`, `@bellum/contracts`), aucune table ni clé
 * `raw_analysis` à lui. La salle répond une liste SCRIPTÉE (`demoDiscoverResponse`) : le vrai chemin
 * (aperçu gratuit, `discover.py::_page_volumes`) n'est JAMAIS appelé pour un espace de démonstration.
 */
export const DEMO_DISCOVER_OFFERS_VOLUME_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "DISCOVER-OFFRES (15/10/2026) — Aubrac Aerostructures (démo, dans la cible et la vue par défaut) porte `offersVolume: { count: 179, windowDays: 90, country: 'FR' }` et Marenval Financement (démo) `count: 41` : `OffersVolumeNote` (apps/web) écrit « N offres en France sur 90 jours ». Les autres cartes n'en portent AUCUN, comme le vrai chemin sans réponse — jamais « 0 offre ». Vérifié par `demo-discover-offers-volume-coverage.spec.ts`.",
}

/**
 * Lot BATCH-CV (Louis 12/10/2026, #3935) — LE BANDEAU DE LECTURE D'UN GROS
 * IMPORT (`CvAutoReadBanner.tsx` : « N / total CV lus », lectures en échec et
 * « Relancer les échecs ») n'a NI table NI clé `raw_analysis` à lui : il lit
 * `consultants.cv_auto_read_at` / `full_name` (déjà semées) et les jobs en
 * échec de la file `cv-auto-parse` (Redis, jamais semée).
 *
 * Vide à dessein : le bandeau n'existe QUE pendant une lecture en cours ou
 * après un échec. Chaque consultant semé porte un nom (`DemoConsultant.full_name`
 * est une chaîne, jamais `null`), donc aucune fiche « non lue » — et aucun
 * import ne tourne dans une salle figée. Semer une progression ou un échec
 * ferait annoncer au prospect une lecture qui n'a pas lieu.
 */
export const DEMO_CV_AUTO_READ_PROGRESS_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    'Lot BATCH-CV (12/10/2026) — `CvAutoReadBanner` lit `consultants.cv_auto_read_at`/`full_name` (déjà semées) et les jobs en échec de la file BullMQ `cv-auto-parse` (Redis, jamais semée) : ni table ni clé de raw_analysis neuve. Vide à dessein : le bandeau n’apparaît que pendant une lecture en cours ou après un échec ; tous les consultants semés sont nommés (aucune fiche « non lue ») et aucun import ne tourne dans une salle figée — semer une progression ou un échec annoncerait une lecture qui n’a pas lieu.',
}

/**
 * Théo L1 — sélecteur avancé (décision Louis 22/10/2026) — LA PORTÉE « UNE OFFRE
 * D'EMPLOI » DE LAURA, EN DÉMONSTRATION. Aucune table neuve, aucune clé de
 * `raw_analysis` neuve : l'offre est un signal de recrutement déjà semé
 * (`recent_signals`), désigné par sa ligne `signal_history`.
 */
export const DEMO_JOB_OFFER_COVERAGE: Readonly<
  Record<'thread' | 'selector_tab', Readonly<{ state: 'seede' | 'vide_a_dessein'; reason: string }>>
> = {
  thread: {
    state: 'seede',
    reason:
      'Théo L1 — un fil NOMMÉ sur SNCF, parti de l’offre « Architecte cloud — Saint-Denis » semée dans son dossier (`DEMO_JOB_OFFER_THREAD`, `DemoSeedService.seedWorkspace`) : la réponse ne dit que ce que le signal dit (date, lieu, équipe et manager possible étayés par le texte de l’offre), aucune source nommée. Garde : `demo-job-offer-thread-coverage.spec.ts`.',
  },
  selector_tab: {
    state: 'vide_a_dessein',
    reason:
      'Théo L1 — l’onglet « Une offre d’emploi » du sélecteur ne propose qu’une offre HISTORISÉE : sa ligne `signal_history` est la seule identité qui la désigne (le blob `recent_signals` est réécrit à chaque analyse). `signal_history` est classée vide à dessein en salle (voir DEMO_INTENTIONALLY_EMPTY et DEMO_SIGNAL_MODELS_COVERAGE) : l’onglet y dit « Aucune offre d’emploi repérée », ce qui est l’état réel d’un espace dont aucune analyse n’a historisé d’offre. Le semer reviendrait à renverser cette classification — décision produit à trancher, pas un effet de bord de ce lot.',
  },
}

/**
 * #3928.4 (craft rule n°9) — les SIX modèles de signal de l'issue, chacun semé ou vide à dessein avec sa raison.
 * Aucun n'ajoute de table : c'est le classement qui manquait (« DÉMO-PLUS-TARD », recette 11/10).
 */
export const DEMO_SIGNAL_MODELS_COVERAGE: Readonly<
  Record<
    | 'recent_signals'
    | 'signal_history'
    | 'opportunities_signal'
    | 'declared_signals'
    | 'canonical_trigger_events'
    | 'discover_signal',
    Readonly<{ state: 'seede' | 'vide_a_dessein'; reason: string }>
  >
> = {
  recent_signals: {
    state: 'seede',
    reason:
      'Le blob `accounts.recent_signals` est semé sur les dossiers de démonstration (Société Générale, SNCF, Airbus…), chaque signal avec sa date : la fiche, la veille et Laura le lisent par le lecteur unique.',
  },
  signal_history: {
    state: 'vide_a_dessein',
    reason:
      "`signal_history` est classée vide à dessein (voir DEMO_INTENTIONALLY_EMPTY) : l'historique se construit par détection successive d'un signal réel ; en semer des lignes prétendrait qu'une veille a tourné dans la salle.",
  },
  opportunities_signal: {
    state: 'vide_a_dessein',
    reason:
      "Aucune piste `kind='signal'` n'est semée : un signal n'est pas une affaire (garde `demo-account-projects-depth-coverage.spec.ts`). Les pistes de la salle sont des `besoin` à l'étape d'intake, qui portent nativement offre et périmètre.",
  },
  declared_signals: {
    state: 'vide_a_dessein',
    reason:
      "`accounts.declared_signals` n'est écrite par aucun semis (colonne absente de DemoDossier['account']) : un signal déclaré est un geste du commercial, en semer un fabriquerait un geste que le visiteur n'a pas fait.",
  },
  canonical_trigger_events: {
    state: 'seede',
    reason:
      'Le registre canonique est semé pour Société Générale (#3918.b) : les trois signaux des affaires perdue, dormante et à renouveler y sont écrits par les mêmes règles que le balayage de production, et la veille du compte les lit.',
  },
  discover_signal: {
    state: 'seede',
    reason:
      'Les cartes de Découvrir en démonstration portent des faits datés et typés (voir `demo-discover-dated-facts-coverage.spec.ts`, #4068.8) : le « pourquoi maintenant » se lit sur des entreprises de la salle, sans appel payant.',
  },
}

/**
 * #4349 V.2 (décision Louis 19/10) — LES COMPÉTENCES SANS PROFIL (Pilotage › Staffing) : SEEDÉES.
 *
 * Aucune table à elle : `project_needs` (déjà classée) porte `staffable = 'no'`. D'où cette entrée, et son
 * appelant `demo-missing-expertise-coverage.spec.ts`, qui lit le VRAI jeu de données (`DEMO_MISSING_EXPERTISE`).
 */
export const DEMO_MISSING_EXPERTISE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4349 V.2 (décision Louis 19/10) — trois besoins fictifs « Kubernetes » refusés faute de profil dans les 90 jours : Pilotage › Staffing nomme la compétence, le CA non adressé sur les deux besoins chiffrables, et ce qui reste hors du montant (un besoin sans TJM ni durée). #4349 V.1 — le bloc « Qualité des fiches consultants » de Réglages › Mes données (% de profils enrichis, dernière mise à jour) lit `consultants`, déjà SEEDÉE : rien à ajouter, la salle le remplit.',
}

/**
 * LUDOVIC-C LC.1 (19/10/2026) — « Remettre les contacts à jour avec les règles actuelles » : vide à dessein.
 *
 * Colonne `accounts.contacts_rules_applied_at` (migration `1796560598667`) et bandeau
 * `ContactsRulesCatchupNotice`. En démo, aucune collecte réelle n'a eu lieu : il n'existe ni date de
 * collecte à comparer à la capacité, ni homonyme collecté à archiver — le bandeau ne s'affiche jamais
 * (`useIsDemo`, même règle que `ContactsStaleCollectionNotice`, #2543.3c). Semer un faux homonyme pour le
 * montrer serait une donnée fictive présentée comme une erreur de collecte. Le classement à la lecture par
 * zone et métiers du profil (LC.1 a), lui, s'applique aux contacts semés.
 *
 * LUDOVIC-E LC.1b — le bandeau se déclenche aussi sur un homonyme certain encore présent (pas seulement sur la date) ;
 * il reste muet en démo (même garde `useIsDemo`). LC.6 — « Ce que Bellum a compris » de Découvrir lit le positionnement
 * semé (`DEMO_ESN_PROFILE.positioning`) : rempli en démo, rien à ajouter.
 */
export const DEMO_CONTACT_RULES_CATCHUP_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    'LUDOVIC-C LC.1 — aucune collecte réelle en démo : ni date de collecte antérieure à la capacité, ni homonyme collecté à archiver ; le bandeau de remise aux règles ne s’affiche jamais en démo (#2543.3c). Le classement par zone et métiers du profil s’applique aux contacts semés.',
}

/**
 * V4-CORRECTIFS-B 4289.4 / 4289.5 (#3247.3, #3247.4, 20/10/2026) — « Par quelle entité attaquer <compte> ? » :
 * SEEDÉE par des réponses scriptées.
 *
 * Aucune table ni clé `raw_analysis` neuve. Les amorces `p-entity-sg` (Société Générale, carte de classement) et
 * `p-entity-or-group` (SNCF, conseil en quatre sections) de `demo-chat-script.ts` montrent ce que la production
 * mesure par candidat : « preuve dans ce secteur », la voie d'accès (« voie directe » ou « voie partenaire X »)
 * et les partenaires écartés, NOMMÉS. Les entités, signaux et ESN sont ceux des dossiers semés (Treezor,
 * Boursorama, SNCF Voyageurs, SNCF Réseau ; Devoteam et mc2i observés au brief Société Générale).
 */
export const DEMO_ENTITY_ACCESS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'V4-CORRECTIFS-B 4289.4/4289.5 — les amorces p-entity-sg et p-entity-or-group (demo-chat-script.ts) rendent, par entité, la preuve dans ce secteur, la voie d’accès (voie directe ou voie partenaire nommée) et les partenaires écartés nommés, à partir des entités et ESN des dossiers semés ; aucune voie partenaire n’est inventée là où le dossier n’en déclare aucune (SNCF). Vérifié par demo-chat-script.4289.test.ts.',
}

/**
 * RV4-E-FIX (recette production 20/10) — ce que la salle de démonstration montre des correctifs du lot :
 *  · le traceur de Pilotage › Pipe (CA potentiel + dernier TJM connu) lit les besoins ouverts SEMÉS, qui portent un TJM
 *    cible et une date de dernier mouvement (`status_changed_days_ago`) ;
 *  · la carte « Projet à cadrer » d'un besoin lit les champs déjà semés de ces mêmes besoins (périmètre, décideur, budget,
 *    échéance) ; un champ absent se nomme « à cadrer » ;
 *  · le badge « Décideur » des voies d'accès : au moins une voie semée mène à un contact `economic` (Société Générale,
 *    `DEMO_PERSONAL_ACCESS_PATH_SEED_SPECS`) — gardé par `demo-coverage.spec.ts` ;
 *  · les ESN déduites et les recommandations tirées de la base de référence portent le badge « estimé » : rien à semer, le
 *    badge suit la provenance des lignes déjà semées.
 * Aucune table neuve : rien à ajouter à `DEMO_SEEDED_TABLES`.
 */
export const DEMO_RV4_E_FIX_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'RV4-E-FIX (20/10) — traceur du pipe, carte « Projet à cadrer », badge « Décideur » des voies d’accès et badge « estimé » se lisent sur des lignes déjà semées (besoins avec TJM cible, voies d’accès sur contacts economic, provenance des ESN) ; aucune table neuve.',
}

/**
 * « ET LA RECHERCHE D'UNE PERSONNE PAR NOM (DÉCOUVRIR › CONTACTS) MONTRE QUOI EN
 * DÉMONSTRATION ? » SEEDÉE (#4386, 20/10/2026).
 */
export const DEMO_PERSON_NAME_SEARCH_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4574 (Louis 25/10/2026) — la saisie n’est plus une carte à part : le nom se tape dans le champ libre du rail (« Marion Sagnard chez Bedrock », vue des personnes), même appel, même jeu de démo, rien de neuf à semer ; l’entreprise citée resserre les homonymes. La recherche porte sur les personnes DU JEU DE DÉMO déjà seedées dans l’espace (`DEMO_DOSSIERS[].contacts`, `ContactsService.searchPeopleByNameInDemo` → `searchDemoContactsByName`) : taper le nom d’un contact d’un dossier — avec ou sans accents, nom et prénom inversés — le retrouve, avec son entreprise, l’indice « nom et entreprise correspondent » et la famille « base de contacts ». Aucun appel fournisseur en salle. Un nom absent du jeu rend le vide HONNÊTE (« personne trouvée sous ce nom » + la famille interrogée), jamais l’ancien homonyme fabriqué à partir du nom tapé.',
}

/**
 * import-contexte Je.7 (R21-JE) — « ET LA ZONE « DÉPOSE TES DOCUMENTS » MONTRE QUOI EN DÉMONSTRATION ? »
 * VIDE À DESSEIN : c'est un GESTE (déposer, voir la destination, cliquer « Importer »), pas un écran de données — la
 * zone n'affiche ni historique ni liste avant qu'on y dépose un fichier. Semer un dépôt fictif inventerait un geste
 * que personne n'a posé. Ce qu'elle REMPLIT, en revanche, est semé : ses cinq destinations (`destinationTables`, toutes
 * présentes dans {@link DEMO_SEEDED_TABLES}, gardé par `demo-coverage.spec.ts`) — le lien « Voir… » de chaque ligne de
 * résultat ouvre un écran déjà rempli. L'étape d'onboarding qui la monte est hors d'atteinte en salle (`needsOnboarding`
 * rend `false` sur `is_demo`) ; en tête de /settings/import, elle s'ouvre vide, comme tout dépôt.
 */
export const DEMO_CONTEXT_PACK_IMPORT_COVERAGE: Readonly<{
  state: 'vide_a_dessein'
  reason: string
  destinationTables: readonly (typeof DEMO_SEEDED_TABLES)[number][]
}> = {
  state: 'vide_a_dessein',
  reason:
    'import-contexte Je.7 — la zone « Dépose tes documents » (onboarding + /settings/import) est un geste : elle ne montre rien avant un dépôt, et semer un dépôt fictif inventerait un geste. Ses cinq destinations sont semées (comptes, postes cibles, grille go/no-go, bibliothèque de séquences, connaissances) : chaque lien « Voir… » ouvre un écran rempli.',
  destinationTables: ['accounts', 'esn_target_personas', 'qualification_grids', 'sequence_templates', 'rag_documents'],
}

/**
 * Théo D settings-compte.N1 — « ET EN DÉMONSTRATION, LA PLAGE DE TRANQUILLITÉ
 * MONTRE QUOI ? »
 *
 * Deux colonnes de plus sur `notification_preferences` (`quiet_hours_start`,
 * `quiet_hours_end`) : une table scopée par `user_id`, hors du périmètre des
 * tables purgées d'un espace — donc hors de la garde par table
 * (`demo-coverage.spec.ts`). La question a pourtant sa réponse écrite.
 * Gardé par `demo-quiet-hours-coverage.spec.ts`.
 */
export const DEMO_QUIET_HOURS_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    'La plage de tranquillité de Réglages › Notifications est un réglage PERSONNEL de la personne connectée, jamais une donnée de l’espace : elle s’affiche vide (« aucune plage ») et se règle dans la salle comme ailleurs. Aucune plage n’y est semée — une salle est prêtée à un visiteur différent toutes les trente minutes, et lui imposer des heures de silence inventées serait la donnée fictive que ce jeu s’interdit. Aucun SMS ne part d’une salle de toute façon (voir DEMO_SMS_CHANNEL_COVERAGE), et la cloche, seule à sonner en démonstration, garde tout.',
}

/**
 * #4464.5 (Louis 23/10/2026, épopée #4468) — le FREIN DOUX (« Tu as beaucoup utilisé Bellum ce mois-ci — on en parle ? »,
 * `credits/soft-brake.ts`) est VIDE À DESSEIN en salle de démonstration.
 *
 * Le choisir plutôt que le semer n'est pas une facilité : le frein ne s'affiche que quand l'usage du mois est ATTEINT
 * (refus 402 du débit). Une salle de démo ne débite JAMAIS (`credits.service.ts` court-circuite `consume*`/`refund*`
 * dès que `isDemo`) — c'est ce qui permet de rejouer la démonstration sans qu'elle s'épuise. Semer le frein exigerait
 * de poser un quota épuisé fictif sur le compte partagé : le premier geste d'un prospect (analyser, enrichir) serait
 * refusé en réunion — exactement ce que cette règle de démo (craft rule n°9) cherche à éviter. Le message lui-même
 * reste vérifiable : `soft-brake.spec.ts` et `test_laura_no_money_4464.py`.
 */
export const DEMO_SOFT_BRAKE_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#4464.5 — le frein doux (soft-brake.ts) ne naît que d'un refus 402 du débit ; une salle de démo ne débite jamais (credits.service.ts court-circuite consume/refund quand isDemo), donc la démonstration ne s'épuise pas. Le semer imposerait un quota épuisé fictif qui ferait refuser le premier geste d'un prospect en réunion.",
}

/**
 * #AM.58 (décision Louis 24/10) — « AJOUTER UN CV » DEPUIS LE FIL DE LAURA : VIDE À DESSEIN.
 *
 * Aucune table neuve, aucun endpoint neuf : le bouton de la carte d'import ouvre en surimpression le dépôt de CV que
 * le vivier utilise déjà (`CvDropZone`, `POST /talents/intake`, déjà atteignable en démo). Le geste ne naît que d'un
 * CV réellement joint à la conversation, puis d'un fichier choisi par le visiteur : semer une pièce jointe ou un import
 * terminé inventerait un geste que personne n'a posé. Le vivier que la comparaison relancée lit est, lui, déjà seedé.
 */
export const DEMO_CHAT_ADD_CV_COVERAGE: Readonly<{ state: 'vide_a_dessein'; reason: string }> = {
  state: 'vide_a_dessein',
  reason:
    "#AM.58 — le bouton « Ajouter un CV » de la carte d'import de Laura rouvre le dépôt de CV existant (CvDropZone, POST /talents/intake), sans table ni route neuves ; il ne s'active que sur un CV joint puis un fichier choisi par le visiteur. Semer un import terminé inventerait un geste que personne n'a posé.",
}

/**
 * #4529 + #4530 (Louis 24/10/2026) — DÉCOUVRIR ARRIVE NEUTRE ET « MA CIBLE » EST UN BOUTON : SEEDÉ PAR LE PROFIL DE
 * L'ESPACE DÉMO, AUCUN CODE DE SEMIS SUPPLÉMENTAIRE.
 *
 * Ni table ni clé de `raw_analysis` neuve : les deux gardes de `demo-coverage.spec.ts` sont aveugles à cette nouveauté,
 * et une garde aveugle n'est pas une exemption — d'où cette entrée.
 *
 *  - L'ARRIVÉE neutre (#4529) ne lit rien du profil : aucune zone, aucun secteur n'est posé d'office. Les pistes
 *    (Territoire, Expertise, Type de client) se nourrissent de ce que l'espace démo a déclaré (`DEMO_ESN_PROFILE`).
 *  - Le BOUTON « Ma cible » (#4530) pose les secteurs, la zone et le niveau de décision du profil de l'espace démo :
 *    `DEMO_ESN_PROFILE.priority_sectors` / `geo_zones` et `DEMO_PROFILE_CONTEXT.idealAccountProfile`, déjà seedés pour
 *    l'audit commercial et le profil. Sans ces champs le bouton ne poserait rien en réunion ; la spec
 *    `demo-discover-my-target-coverage.spec.ts` les confronte.
 */
export const DEMO_DISCOVER_MY_TARGET_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4529 / #4530 (24/10/2026) — l'arrivée sur Découvrir est neutre (rien du profil posé d'office) ; le bouton « Ma cible » pose les secteurs prioritaires, la zone et le niveau de décision du profil de l'espace démo (DEMO_ESN_PROFILE.priority_sectors / geo_zones, DEMO_PROFILE_CONTEXT.idealAccountProfile), déjà seedés : aucune table ni clé raw_analysis neuve, aucun semis de plus.",
}

/**
 * #4634 (Louis 26/10/2026) — LES CRITÈRES DE CONTACTS, BESOINS ET LISTE D'APPELS REJOIGNENT LE VOLET DE RECHERCHE DE
 * DÉCOUVRIR, ET CEUX DES PERSONNES PARTENT DANS `GET /contacts` : SEEDÉ PAR LES CONTACTS DES DOSSIERS DÉMO.
 *
 * Ni table ni clé de `raw_analysis` neuve (les deux gardes de `demo-coverage.spec.ts` y sont aveugles, d'où cette
 * entrée) : les champs déménagent, et fonction / entreprise / entité / localisation / relation filtrent désormais la
 * MÊME route que la page Contacts, sur les personnes déjà seedées dans l'espace démo (`DEMO_DOSSIERS[].contacts` :
 * `title`, le lieu dérivé du siège par `demoLocation`, `user_status` à `new` sauf déclaré). En salle, taper « Directeur » ou « Lyon » dans le volet rend les personnes du
 * jeu qui y répondent, ou le vide honnête « Aucune personne de ton espace ne correspond ». Besoins et Liste d'appels
 * affinent ce que la recherche de démo a trouvé, comme avant. Spec : `demo-discover-projection-fields-coverage.spec.ts`.
 */
export const DEMO_DISCOVER_PROJECTION_FIELDS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#4634 (26/10/2026) — les critères de Contacts, Besoins et Liste d'appels vivent dans le volet de recherche de Découvrir ; fonction, entreprise, entité, localisation et relation partent dans GET /contacts, qui lit en démo les personnes déjà seedées des dossiers (DEMO_DOSSIERS[].contacts : title, lieu dérivé du siège par demoLocation, user_status « new » sauf déclaré) : aucune table ni clé raw_analysis neuve, aucun semis de plus.",
}

/**
 * #5017.2 — « CONSULTANTS QUI CONNAISSENT CE SECTEUR » (fiche compte, vue d'ensemble) : SEEDÉ.
 *
 * Aucune table neuve : la carte lit `consultants.sectors` (sept consultants fictifs de {@link DEMO_CONSULTANTS}, secteurs
 * déclarés) contre `accounts.sector` des comptes semés. Garde : `demo-consultants-know-sector-coverage.spec.ts`.
 */
export const DEMO_CONSULTANTS_KNOW_SECTOR_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#5017.2 — la carte « consultants qui connaissent ce secteur » lit `consultants.sectors` des fiches fictives du vivier contre le secteur des comptes semés (Société Générale ↔ consultants « Banque ») : aucun semis neuf, aucun appel externe. Un compte sans consultant au secteur recoupant ne montre pas la carte.',
}

/**
 * #2160.9 / #2200.13-.14-.21 (brief Louis 31/10/2026) — LE RESPONSABLE DU CONTACT EN EN-TÊTE DE FICHE ET LA TRAÇABILITÉ
 * (AUTEUR · SOURCE · PROCHAINE ACTION) DES CARTES « À VALIDER » : SEEDÉ PAR LES LIGNES DÉJÀ SEMÉES.
 *
 * Aucune table ni clé neuve (les gardes de `demo-coverage.spec.ts` y sont aveugles, d'où cette entrée) : le responsable
 * lu en tête de fiche est `contacts.assigned_to` posé au semis des dossiers (`ownerUserId`, l'occupant unique de la salle) ;
 * la ligne « Préparé par … · Depuis une séquence · Relis et valide » des messages de séquence à valider se déduit des
 * messages d'approche semés (`seedOutreachMessages` : `source` `sequences`, version personnalisée, `status` à valider).
 * Une valeur que le semis ne porte pas ne fait AUCUNE ligne (jamais « 0 », jamais un nom inventé).
 */
export const DEMO_CONTACT_OWNER_AND_APPROVAL_TRACE_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    "#2160.9 / #2200.13 — le responsable du contact (en-tête de fiche) vient de `contacts.assigned_to` semé au dossier ; l'auteur, la source et la prochaine action d'une carte de séquence à valider viennent des messages d'approche semés (`seedOutreachMessages`). Aucune ligne neuve : une valeur absente ne fait aucune ligne.",
}

/**
 * #4996 L7 — LES ZONES DE L'ÉQUIPE (`account_team_scopes`) : SEEDÉES, À CONDITION D'UN COLLÈGUE FICTIF.
 *
 * `seedTeamGuardrails` pose au collègue fictif deux zones d'ENTITÉ sur Société Générale (les deux entités qui
 * portent le plus de contacts, `DEMO_SG_ZONE_ENTITY_LABELS`, libellé recopié du nom de l'entité). Les contacts
 * y sont déjà rattachés à leur entité par `seedAccount` : l'onglet Contacts montre « Mon périmètre » et la
 * ligne « N hors de ton périmètre — Tout voir ». Sans collègue : AUCUNE zone, le visiteur n'en reçoit jamais
 * (un membre sans zone couvre tout le compte). Purgée au reset (`DEMO_PURGE_TABLES`). Vide à dessein : le
 * texte libre (une zone sans entité) — il ne filtre jamais, en poser une serait inventer une répartition.
 * Garde : `demo-team-guardrails-seed.spec.ts`.
 */
export const DEMO_TEAM_SCOPES_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#4996 L7 — seedé seulement quand la salle a un collègue fictif : deux zones d’entité de Société Générale (les plus fournies en contacts), libellé recopié du nom de l’entité. #4996.4 — et une zone de BU de la salle (BU Banque & Assurance), libellé recopié du nom de la BU. Sans collègue, aucune zone. Vide à dessein : le texte libre, qui ne filtre jamais. Purgée au reset.',
}

/**
 * Lot T point 6 (Louis 02/11/2026) — UNE ESN RECONNUE PAR SES OFFRES, AVEC SON MOTIF, DANS « AUTRES ACTEURS » : SEEDÉ.
 *
 * Ni table ni clé de `raw_analysis` : la liste de `/discover/registry` est scriptée (`demoDiscoverResponse`). Calderis
 * Ingénierie (démo), NAF 71.12B (ingénierie — un NAF que le registre donne à d'autres qu'aux ESN), porte deux offres qui
 * parlent de « chez nos clients » et d'« intercontrat » : `isEsnPeer` et `esnRecognition: 'offers'` voyagent comme sur le
 * vrai chemin (`actor_fields`, apps/ia). L'onglet « Autres acteurs » la montre, motif « Reconnue ESN : ses offres le disent ».
 * Garde : `demo-discover-esn-offers-coverage.spec.ts`.
 */
export const DEMO_DISCOVER_ESN_OFFERS_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    'Lot T (02/11/2026) — Calderis Ingénierie (démo, NAF 71.12B) porte deux offres « chez nos clients » / « intercontrat » : elle est reconnue ESN par ses offres (esnRecognition « offers ») et rangée dans « Autres acteurs » avec son motif, comme le fait actor_fields côté IA. Aucune table ni clé raw_analysis neuve.',
}

/**
 * #5000.2 (craft rule n°9) — le TYPE DE CONTRAT de l'offre se lit sur la carte Découvrir (`CandidateFacts`). SEEDÉ :
 * les offres des entreprises réelles de la démo (`demoRealCompanySignals`) alternent CDI, freelance et « non déclaré »
 * (la carte dit alors « Contrat non précisé »). Vérifié par `demo-discover-offer-contract-coverage.spec.ts`.
 */
export const DEMO_DISCOVER_OFFER_CONTRACT_COVERAGE: Readonly<{ state: 'seede'; reason: string }> = {
  state: 'seede',
  reason:
    '#5000.2 — les offres des entreprises réelles de la démo alternent CDI, freelance et contrat non déclaré ; le contrat voyage sur le signal `hiring` jusqu’à la ligne de la carte.',
}
