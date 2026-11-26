# Ce qui est livré — le registre des chantiers

> Extrait de `CLAUDE.md` le 27/08/2026 — le fichier dépassait 230 k caractères et n'était plus chargeable en contexte.
> **Rien n'a été réécrit ni supprimé** : chaque bloc est ici verbatim, dans son ordre d'origine.
>
> **Ce fichier répond à « est-ce que c'est déjà là, et pourquoi comme ça ? »** — la question qui coûte le plus cher
> quand on ne se la pose pas : le motif qui revient dans tous ces chantiers est _du code juste, calculé, testé,
> que personne n'appelle_, et le second est _une décision re-arbitrée dans deux sens à trois semaines d'intervalle_.
>
> **Chaque bloc cite son tracker complet dans `agent_docs/`** — ce fichier en est le résumé, le tracker est la source.
> Les arbitrages qui ne doivent JAMAIS être re-litigés sont, eux, restés dans `CLAUDE.md` (section « Doctrine »),
> parce qu'un interdit qui vit dans un fichier qu'on peut ne pas ouvrir n'est pas un interdit.

## Sommaire

| Chantier                                                                                                               | Tracker                                               |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Capacités livrées hors PDF (Action OS, back-office commercial, socle exécutif, routines, ATS, envoi de masse, import…) | divers, cités dans chaque bloc                        |
| Intégrations et connecteurs — PDF 7                                                                                    | `pdf7-integrations-connecteurs-2026-08-21.md`         |
| Portefeuille d'offre et prisme industriel — addendum Stelya                                                            | `addendum-stelya-industrial-2026-08-24.md`            |
| Archive 02 — PDF 2 à 5 recroisés                                                                                       | `archive-02-crm-ats-matching-2026-08-25.md`           |
| Recovery Pack juin 2026                                                                                                | `recovery-juin-2026-2026-08-24.md`                    |
| Gouvernance de l'itération 3                                                                                           | `gouvernance-iteration-3-2026-08-25.md`               |
| Archive 01 — architecture et UX                                                                                        | `archive-01-architecture-ux-2026-08-25.md`            |
| Socle d'architecture — PDF 1                                                                                           | `pdf1-architecture-globale-2026-08-19.md`             |
| CRM interne — PDF 2                                                                                                    | `pdf2-crm-interne-2026-08-19.md`                      |
| ATS, talent et vivier — PDF 3                                                                                          | `pdf3-ats-talent-vivier-2026-08-20.md`                |
| Matching et CV client — PDF 4                                                                                          | `pdf4-matching-cv-client-2026-08-20.md`               |
| Missions, CRA et facturation — PDF 5                                                                                   | `pdf5-missions-cra-facturation-2026-08-20.md`         |
| Automatisations et chaînes — PDF 6                                                                                     | `pdf6-automatisations-requetes-2026-08-21.md`         |
| Dette des six chantiers PDF                                                                                            | `dette-pdf1-6-2026-08-21.md`                          |
| Dashboards et pilotage — PDF 8                                                                                         | `pdf8-dashboards-pilotage-2026-08-22.md`              |
| Audit final — PDF 9                                                                                                    | `pdf9-backlog-claude-code-2026-08-22.md`              |
| Laura, site et produit — PDF 10                                                                                        | `pdf10-laura-chatbot-2026-08-22.md`                   |
| La donnée : sources et pipeline — tome 2                                                                               | `tome2-donnee-sources-pipeline-2026-08-21.md`         |
| Pivot d'accessibilité — tome 1                                                                                         | `tome1-pivot-accessibilite-2026-08-20.md`             |
| Second marché ESN — tome 4                                                                                             | `tome4-second-marche-esn-2026-08-23.md`               |
| Plan de compte — tome 5                                                                                                | `tome5-plan-de-compte-2026-08-23.md`                  |
| Tomes 6, 7 et 8                                                                                                        | `tomes6-8-laura-architecture-execution-2026-08-23.md` |
| Veille territoriale et voix unique                                                                                     | `tomes-reste-a-faire-2026-08-23.md`                   |
| RAG et design system — tome 7                                                                                          | `tome7-rag-design-2026-08-23.md`                      |
| Appli mobile — D76                                                                                                     | `mobile-et-preexistant-2026-08-23.md`                 |

---

**Les retours d'expérience ont un écran — et surtout un chemin d'ÉCRITURE** (API `capitalisation`, web `/pilotage/rex`, vague 6) : `POST /capitalisation/rex` existait avec son DTO, sa garde `records:write` et son service, et n'avait **aucun appelant** — ni écran, ni copilote, ni routine. Personne ne pouvait créer un retour, et le dépôt le savait (`flow-registry.ts:197` : « la collecte attend qu'un humain ouvre l'écran ») pour un écran qui n'existait pas. L'écran liste ce qui attend et ce qui a été recueilli, **sans un seul taux** : que des comptes d'objets, chacun au-dessus de la liste qu'il dénombre. Une lecture qui échoue dit « lecture impossible », jamais « aucun retour ». ⚠️ Vérifié en production : « 1 mission terminée attend son retour · **sans date de fin** » — la mission n'a pas d'`ends_on` et l'écran le DIT au lieu d'inventer une date.

**Quatre chemins de débit de plus annoncent leur prix** (vague 6, garde **GA-51**) : « Reprendre » une analyse (**8** crédits, le seul texte voisin parlait « du crédit » au singulier), « Exécuter (N) » (aucun total sur le bouton), les propositions du copilote (`?? 0` → « aucun crédit »), et le refresh de dimension, dont la table de prix était **recopiée** côté contrat pendant que l'API débitait le poids de l'**enrichissement de contact**. ⚠️ **Et la surface MCP annonçait UN crédit là où l'analyse en débite HUIT** : un assistant demandait au commercial de confirmer « 1 crédit », huit partaient — et la garde de quota testait `remaining <= 0` sans tenir compte des huit, si bien que MCP répondait « confirme » puis échouait **après** la confirmation.

**Les trente interventions de Laura ont leur copie** (garde **GA-52**) : vingt-deux d'entre elles n'avaient **aucun texte**, dans aucune des deux langues — la bulle affichait `interventions.no_skills_dossier` **à un prospect, sur le lien de démonstration public**. Leurs détecteurs avaient été branchés la veille ; leurs libellés, non. _Allumer un drapeau sans le nourrir._ ⚠️ Une bulle qui existait, elle, affirmait ce que sa mesure ne dit pas (« une partie de ce qui est inclus dans ton offre n'a jamais été ouverte », alors que rien ne mesure l'ouverture d'un écran) — elle dit maintenant ce que la mesure permet.

**Une facture en litige ne montre plus de relance due** (vague 6) : la cadence graduée et l'exclusion du litige au DSO étaient **déjà livrées** (mesuré, non recodé) — mais `PaymentReminderDue.tsx` appelait `reminderDue` **sans lui passer le litige**. Les deux champs étaient facultatifs, donc l'omission était silencieuse : l'écran annonçait « Relance n°2 due · Ton ferme » sur une facture contestée pendant que le message de confirmation promettait l'inverse. Champs rendus **obligatoires** — on retire le MOYEN d'oublier, `tsc` refuse. Famille « paramètre déclaré, jamais passé ».

**Le delta hebdomadaire des contacts compte la même population que le funnel** (vague 7) : le bandeau affichait « 254 détectés » surmonté de « **+255 cette semaine** ». Le funnel comptait le jeu FILTRÉ, le delta comptait **tout l'espace sans filtre**. `lifecycleWeeklyNet` se calcule désormais sur le même query builder — le delta ne peut plus dépasser le total — et un échec de lecture rend `undefined`, jamais `0`.

**Rejet d'un relevé d'activité, avec motif obligatoire** (API, `delivery`, migration `1790290000001`, vague 5 du dossier du 26/08) : `TIMESHEET_STATUSES` gagne `'rejected'` **en fin d'énumération** (GA-08), et le motif est tenu à trois profondeurs — le schéma (`.trim().min(1)`), le service (refus **avant tout appel base**), et un `CHECK` SQL. Un relevé rejeté n'est pas supprimé : il repart vers son auteur, et le motif reste lisible après le redépôt. ⚠️ Au passage, `ReadinessInput` (`invoice-readiness.ts`) **recopiait à la main** la liste des statuts au lieu de l'importer : un mois dont un relevé venait d'être **refusé par un humain** partait « prêt à facturer » pendant que l'écran des relevés disait l'inverse. Taxonomie importée, bloqueur `timesheet_rejected`. **Trois anomalies de relevé restent NON produites, avec leur mesure** : jour férié (aucun stockage nulle part, `holidays` est appelé avec `[]` partout — c'est un chantier de données, pas un calcul), mois à cheval (calculable mais le prorata est **déjà** appliqué, donc informatif), et relevé postérieur à la validation d'un autre (**calculable telle quelle** — les trois horodatages existent, c'est la seule des trois à traiter).

**Le coût s'annonce avant le clic, sur TOUS les chemins d'enrichissement** (web, `contacts`, garde **GA-49**) : `planBulkEnrichment` est la SEULE porte — le prédicat qui facture choisit qui part, et le nombre annoncé MESURE ce qu'il a retenu, donc l'ensemble annoncé est l'ensemble envoyé par construction. Deux défauts corrigés : « Enrichir maintenant » comptait « à qui il manque l'un des trois champs » et facturait un contact **qui avait déjà son e-mail** (3 crédits annoncés, 2 débités) ; et les actions « ouvrir un canal » débitaient **sans rien annoncer**. ⚠️ **« Vérifier ce lien » sur l'organigramme promettait « Aucun crédit » en en débitant un à deux** — la promesse était écrite à QUATRE endroits, dont un docbloc situé soixante-neuf lignes au-dessus du `consumeAnalysisSlot` qui débite. Le prix est désormais ÉCRIT sous le bouton (un `title=` n'est pas une annonce : il n'apparaît jamais au doigt) et vient de `creditCostRange`.

**Studio de proposition** (API `modules/proposals/`, web `/propositions`, contrat `proposal.ts` préexistant) : le contrat portait 12 exports et **zéro consommateur**. Le studio assemble le plan d'une proposition (9 sections) depuis `opportunities`, `accounts`, `submissions`, `consultants`, `proofs` et `rfps` — **sans aucune table**, parce qu'une copie stockée vieillirait en silence sur le seul document qui engage l'entreprise. Il n'a **aucun verbe d'écriture** : ce n'est pas une convention, c'est l'absence de code, gardée par un test qui lit le source du contrôleur. ⚠️ Le TJM ne vient **pas** de `consultants.tjm` (un TJM **cible** = un coût), mais de `submissions.proposed_rate_cents` — et **seulement** quand un seul tarif distinct existe : trois positionnements à trois tarifs rendent `null`.

**Un trait d'organigramme déclare son origine** (web, garde **GA-50**) : dans `OrgInfluenceMap` — **le rendu principal** — la seule différence entre un rattachement prouvé et un rattachement deviné était `border-dashed` vs `border-solid` sur un `<span aria-hidden>`. Trois états nommés (`sourced` / `structure` / `assumed`), chacun citant sa source datée. ⚠️ Un edge marqué `verified: true` dont les `sourceIds` ne retombent sur **aucune preuve émise** est traité comme une hypothèse : le contrat garantit qu'un lien vérifié **cite** un sourceId, pas qu'il **résolve**. Et le pourcentage de confiance ne suit plus que ce qui est deviné — « sourcé · 91 % » était une probabilité posée sur un fait établi.

**Une salle de démonstration incomplète se répare toute seule** (API, `demo-reset.service.ts`) : la complétude se jugeait sur **une seule table** (`COUNT(*) FROM accounts`). Mesuré en production : 6 comptes, 25 contacts, 74 projets… et **0 consultant sur 7, 1 mission sur 5**. Comme le bail se renouvelle à chaque visite, **une salle tronquée ne redevenait jamais libre** — donc personne ne la réparait, jamais. Elle se lit désormais sur les 27 tables de `DEMO_SEEDED_TABLES`, en **une** requête (27 sondes `EXISTS` scalaires, 0,22 ms avec index). ⚠️ **Le doute profite à la salle** : seule une sonde `false` FRANCHE vaut « table vide ». Les deux autres chemins (`resetWorkspaceUnlessFresh`, et la reconversion `provisioned` du pool) partageaient le même angle mort et passent par la même lecture.

**La page publique « Garde-fous »** (`apps/website`, 4 langues) : elle dit ce que le produit **ne fera pas** à la place du commercial, et **chaque affirmation est rattachée au `fichier:ligne` qui la tient**, vérifié par une garde à chaque construction. ⚠️ C'est ce qui a empêché d'écrire la phrase que la source réclamait mot pour mot — « nous n'enverrons **jamais** un message à votre place » est **fausse** ici : `playbook.ts:4` nomme les playbooks de niveau 5 « les seules automatisations qui ATTEIGNENT un client sans clic humain ». Ce qui est vrai, et ce que la page dit : rien ne part tant qu'un humain n'a pas armé, ni tant qu'il n'a pas lu CE message-là.

**`product-kpi.ts` SUPPRIMÉ** (22 indicateurs d'éditeur, 7 exports, zéro consommateur depuis sa création) : les chiffres d'éditeur sont déjà mesurés et servis ailleurs (`/internal/analytics/teams*`, écrans Facturation / Équipes / Usage), et ses champs n'avaient ni seuil ni **décision** — 22 décorations. À l'inverse, `MANAGER_KPI_CADENCES` / `_OWNERS` sont **branchés et gardés** : ils indexent l'i18n **sans `defaultValue`**, et `enum-keys.test.ts` ne les couvrait pas — une valeur ajoutée au contrat sans traduction imprimait `catalogue.owners.direction` au milieu d'une fiche. ⚠️ **knip est structurellement aveugle à cette classe de défaut dans `packages/contracts`** : le baril `index.ts` réexporte tout, donc 258 exports inutilisés avant, 258 après. Le seul juge est `grep -rn`.

Réécriture du CV selon la mission (annexe méthodo p22 — écran Vivier, panneau de matching) : `POST /consultants/:id/cv-rewrite` réécrit le CV d'un consultant pour un besoin (`consultants.cv_text` = CV source, table `consultant_cv_rewrites` = un CV courant par couple consultant×besoin, migration `1788092461337`). Seul appel LLM du vivier (prompt IA `bellum_cv`, routeur `POST /cv/rewrite`) — matching et brief restent déterministes. **Deux verrous anti-invention indépendants** : (1) la consigne du prompt — réordonner/reformuler, jamais ajouter, et chaque expérience doit CITER textuellement le CV source ; (2) `cv-rewrite-guard.ts` côté API, qui ne fait PAS confiance au premier : il recherche chaque citation dans le CV source et RETIRE toute expérience introuvable, en le disant dans `gaps`. Les manques sont en plus recalculés en dur (termes du besoin absents de la stack ET du CV) — un prompt peut « oublier » d'énoncer un manque, ce calcul non. Sans `cv_text` = 400 explicite (on ne laisse pas composer un CV depuis une fiche déclarative).

Action OS (API, module autonome `apps/api/src/modules/action-os/`, addendum final p20-33) : les objets métier de l'exécution gouvernée — `workflow_runs`, `approval_requests`, `credit_reservations` (migration `1788270000000`) — au-dessus de l'infrastructure déjà là (BullMQ, outbox, corrélation, journal `user_actions`). Un run rassemble ses pas, porte sa corrélation et **garde la version de définition** qui l'a produit ; une approbation **fige sa prévisualisation**, expire (3 j) et ne peut pas être accordée par son propre demandeur au niveau responsable ; une réservation rend le solde de crédits exact PENDANT le run. **Les cinq workflows vivent dans le CODE** (`workflow-catalog.ts`), pas en base : une définition éditable sans revue serait un chemin d'écriture non gouverné. Niveaux d'automatisation N0→N5 avec deux seuils NON désactivables (défauts : validation responsable au-delà de **10 cibles** ou **20 crédits**, réglables par espace via `workspaces.approval_*`). Deux distinctions portent l'honnêteté du moteur : `partial` (une partie est passée) n'est ni un succès ni un échec, et `unknown` (timeout) **arrête** la reprise au lieu de rejouer un envoi peut-être déjà parti. Le routeur d'actions gagne au passage `create_calendar_event`, `create_crm_note` (jamais d'upsert — c'est ainsi que naissent les doublons) et `notify_user`, et `schedule_reminder` atterrit désormais sur le **vrai agenda** quand il y en a un de connecté.

Le chiffre d'affaires d'un COMMERCIAL (`finance:read:own`, D1 du dossier du 26/08, migration `1790160000001`) : les six lectures financières étaient sous `finance:read`, que ni `sales` ni `sales_ops` ne portent — un commercial ne voyait pas ce qu'il avait produit, et lui donner `finance:read` aurait ouvert du même geste la marge de ses collègues et le coût chargé des consultants. Une permission SÉPARÉE, ajoutée en FIN d'énumération, sa contrainte SQL élargie AVANT le code (GA-12). **Refusée à `member`** : « presque anodin » appliqué à tous les sièges historiques d'un coup reste une décision que personne n'a prise. La portée vit dans **une seule fonction pure** (`financeScopeClause`) — une mission est à moi si je la PORTE (`missions.owner_id`) ou si le COMPTE m'est attribué (`accounts.assigned_to`), les deux parce qu'une mission née d'un projet gagné n'a souvent aucun propriétaire ; `EXISTS` et jamais une jointure, qui dupliquerait les lignes et fausserait le SUM. **Trois routes scopées** (chiffre d'affaires, marge, prévisionnel) ; **trois restent à `finance:read` et ce n'est pas un oubli** — marge par canal et délai de paiement décrivent l'ESPACE, la capacité décrit l'ÉQUIPE et un consultant n'a pas de propriétaire commercial. L'écran les dit « réservé aux responsables », jamais « indisponible ». ⚠️ Le piège du chantier : sur un espace où rien n'est attribué, la portée restreinte rendrait « 0 € », qui se lit « je n'ai rien vendu » alors que la vérité est « rien ne m'est rattaché » — les missions orphelines sont donc COMPTÉES et NOMMÉES (`FinanceScopeInfo.outsideAnyPortfolio`). La routine d'alerte de marge reste en portée ESPACE : la restreindre ferait taire l'alerte sur les missions que personne ne porte, c'est-à-dire celles qu'on surveille le moins.

Le back-office du commercial, complété (dossier du 26/08, lots 3 à 8) : **« Mon activité »** sur Ma journée — quatre chiffres (produit, signé, pipe valorisé, missions en cours), un seul bloc et pas quatre, parce qu'un briefing qui devient un tableau de bord cesse d'être lu ; le bloc DISPARAÎT sans droit financier, quatre tirets feraient chercher une panne. **La troisième porte d'enregistrement d'un consultant** : vivier vide, l'écran des besoins proposait « Matcher » désactivé et laissait deviner où l'on ajoute quelqu'un — c'est désormais un lien vers le formulaire (`/consultants?new=1`). **`/projects/needs` dans la barre de SECTION** (elle disparaissait en y arrivant : préfixe strict de `/projects`), avec `needNextAction` (pure, ordre du plus bloquant au plus avancé, `null` sur un besoin qui ne circule plus), **cinq compteurs calculés par le serveur en CLONANT la requête de la liste** (un SQL écrit à côté divergerait, et le compteur dirait autre chose que le tableau) et un **kanban** dont le montant est celui qui est SAISI — TJM × postes PAR JOUR, jamais multiplié par la durée. **Les trois gestes d'encaissement** (`recordPayment`, `cancelInvoiced` avec motif obligatoire, `recordReminder`) : leurs routes existaient avec colonnes, permissions et tests, et le client web n'en exposait aucune ; `paidAt`/`paidAmountCents` n'atteignaient même pas la ligne, si bien que l'écran ne distinguait pas « facturé » de « payé ». `BLOCKER_ACTIONS` mène enfin quelque part. **L'écran Positionnements** (`/consultants/submissions`) et les trois onglets du vivier — deux écrans complets n'étaient atteignables que par une URL tapée à la main. **La porte ouverte par une relation** : `access_mode` n'était sélectionné par aucune requête, si bien que l'opportunité créée par la routine « changement de poste » se noyait parmi les projets détectés ; le badge DIT ce que c'est — « une porte, pas une affaire ».

Validation des envois automatiques (API — playbooks de niveau 5, arbitrage Louis du 26/08/2026, migration `1790150000001`) : les trois playbooks N5 restent des N5 — la machine choisit la cible, compose le message et le fait partir — mais **un humain voit CE message avant l'envoi**. Le balayeur ne peut plus envoyer : `MailboxService` lui a été RETIRÉ (retirer le moyen vaut mieux qu'une consigne de ne pas s'en servir), il compose, réserve et DEMANDE ; l'envoi part du clic, dans le contrôleur. La ligne d'idempotence `playbook_sends` DEVIENT la demande d'approbation — une table séparée aurait dupliqué la clé `(espace, playbook, cible)`, et deux clés sur le même geste finissent par diverger, après quoi un client reçoit deux fois la même relance. Six états contraints en SQL (`PLAYBOOK_SEND_STATES`, couverts par GA-12), dont `approved` pour l'instant bref où la décision est écrite mais l'envoi pas encore parti : sans lui, un envoi parti pendant que la ligne dit « en attente » repartirait au clic suivant. Le texte est **FIGÉ** à la demande (recomposer à l'approbation ferait valider un message et en envoyer un autre). **Une notification par vague et par propriétaire**, jamais une par passage de cron — vingt notifications par jour feraient désarmer le playbook, c'est-à-dire perdre la fonctionnalité entière. Expiration à **3 jours** ; périmée, une demande ne part JAMAIS et **n'est jamais reproposée** (le prix assumé est qu'une relance ignorée est perdue ; l'inverse serait de reproposer indéfiniment ce que quelqu'un a laissé passer). `GET /playbooks/approvals` est scopé à l'UTILISATEUR (la messagerie est personnelle, D58) et `POST /playbooks/approvals/:id` exige `messages:send` — approuver ici, c'est envoyer. Troisième file du centre d'actions, montrée EN PREMIER : les deux autres écrivent dans des outils internes, celle-ci parle à un client ; le destinataire et le corps EXACT y sont affichés sans repli, et le bouton dit « Envoyer », pas « Approuver ».

Board Missions — les cases cochées font quelque chose (API, `delivery.controller.ts`, même arbitrage) : `moveBoardCard` rendait `acceptedActions` tel quel et **n'exécutait rien** — vingt cases qu'on cochait sans effet, le défaut exact que le pipe des Projets avait corrigé un mois plus tôt. `BoardProposal.performedBy` entre au contrat et l'orchestration vit dans le CONTRÔLEUR (la sortie que GA-07 nomme elle-même). **Deux gestes seulement sont exécutés par le serveur** (`SERVER_PERFORMED_BOARD_ACTIONS`), parce qu'on n'exécute que ce qu'on sait faire sans inventer : `park_account` (avec le motif de la perte, déjà exigé par la colonne) et `plan_j30_review` (point d'agenda à J+30 du DÉMARRAGE — sans date de démarrage, aucune échéance n'est inventée, l'action est refusée avec sa raison). Un REX reste à l'humain : il exige un résumé écrit, et le fabriquer produirait la phrase que ce dépôt s'interdit. Tout le reste ressort en **rappels nommés**, y compris une clé inconnue venue d'un client plus récent — jamais jetée en silence. Un échec ne défait pas le déplacement, il se dit, et le message de confirmation annonce ce qui a été fait et ce qui reste.

Compte jumeau — la carte nomme sa base (`SIMILAR_SEED_FLOOR = 3`, champ `seed_count`) : le moteur s'amorce sur les comptes ANALYSÉS de l'espace, jusqu'à trois secteurs distincts, et **un seul suffisait** à remplir « Comptes proches de ta cible ». Sous le plancher, la carte DIT sur quoi elle est bâtie plutôt que de laisser son titre promettre un voisinage de portefeuille ; rien n'est bloqué, rien n'est mis à zéro. Basculer l'amorçage sur les missions gagnées, comme le demandait la spécification du 21/08, est **refusé** : la plupart des espaces n'en ont aucune pendant des mois, la fonctionnalité mourrait, et les deux bases ne disent pas la même chose — les comptes analysés disent ce qu'on VISE, les missions gagnées ce qu'on sait vendre. Au passage, « Proximité 43 % » sur `/discover` cède la place au NIVEAU (le chiffre reste en infobulle) : un critère de profil sur trois ne se lit pas « à moitié proche ».

Socle exécutif — messagerie et agenda (API, modules autonomes `apps/api/src/modules/mailbox/`, `agenda/`, `briefing/` ; méta-analyses besoins du 03/08) : « ta messagerie » et « ton agenda » sont des CAPACITÉS provider-agnostiques au-dessus de Google et Microsoft — aucun écran ne nomme l'éditeur (seul Réglages › Intégrations le fait). Trois calculs sont volontairement hors des fournisseurs, parce qu'une erreur y serait invisible : (1) la traduction « intention métier → requête » est déterministe et testée (`mail-query.ts`) — un modèle qui écrirait la requête produirait un « zéro résultat » impossible à distinguer de « il n'y a rien » ; (2) « qui ne m'a pas répondu » se calcule chez nous (`no-reply.ts`), aucune API ne sait le dire : seul le sens du DERNIER message compte, un répondeur d'absence n'est pas une réponse, et un fil sans date exploitable n'est jamais relancé d'office ; (3) créneaux libres et conflits (`free-slots.ts`) — un créneau proposé pendant une réunion existante ne se voit qu'au moment où le client répond « je ne suis pas libre ». Garde-fous appliqués au plus près de l'API : l'organisateur n'est jamais dans ses propres invités (`common/util/self-invite.ts`) et un lien visio est demandé par défaut (`conferenceDataVersion=1` obligatoire, sinon Google ignore la demande en silence). Le brief du jour (`GET /briefing/today`) fait porter à CHAQUE bloc son état — `not_connected` / `missing_scope` / `unavailable` — pour qu'un bloc vide ne se lise jamais « rien à faire ». Signature : `profiles.email_signature` d'abord (saisie dans Bellum), celle du fournisseur ensuite, sinon `null` = brouillon non signé, JAMAIS un marque-place. Portées ADDITIVES : Google `gmail.settings.basic` + `gmail.labels`, Microsoft `Mail.ReadWrite` + `MailboxSettings.ReadWrite` — un jeton antérieur garde sa concession étroite et la capacité reste éteinte jusqu'à reconnexion. Non promis : appliquer un libellé Gmail (exige la portée RESTREINTE `gmail.modify`, qui donne aussi le droit de supprimer du courrier), un lien Teams côté Outlook (exige une licence Teams sur le tenant), la lecture de la signature Outlook (Graph ne l'expose pas). Triage complet des deux rapports : `agent_docs/meta-analyse-besoins-2026-08-03.md`.

Routines (API, module autonome `apps/api/src/modules/routines/` ; méta-analyses besoins du 03/08, §9 « automatisations programmées ») : les automatisations deviennent VISIBLES, réglables et désactivables (écran Réglages › Routines). Le dépôt avait onze `@Cron` en dur — ils tournent, ils envoient, et personne ne peut savoir lesquels sont actifs ni les arrêter. Le catalogue vit dans le CODE (`routine-catalog.ts`, comme `workflow-catalog.ts`) ; la base ne porte que l'ABONNEMENT (`routine_subscriptions`) et la TRACE (`routine_runs`), migration `1788800000002`. **Huit routines seulement**, pas les 25 du rapport : n'y figure que ce que les connecteurs actuels savent RÉELLEMENT faire — inscrire les autres produirait des cases à cocher qui ne font rien, c'est-à-dire la version réglages du « Active sans connecteur » que le produit s'interdit. Un seul cron (`*/15`) balaye et demande à chaque abonné « quelque chose de dû ? » : les horaires appartiennent aux UTILISATEURS (heure LOCALE, fuseau de l'abonnement), pas au serveur — un cron « 08:30 Europe/Paris » ne saurait pas servir quelqu'un qui a réglé son brief à 7 h. Idempotence par CLÉ et non par horloge : `run_key` = `utilisateur:routine:jour-local`, la trace est réservée AVANT l'envoi (rater un envoi se répare, un double envoi ne se rattrape pas) et une violation d'unicité arrête proprement la seconde instance. Une routine ne part JAMAIS avant d'avoir été vue : la première consultation de l'écran matérialise les défauts. Une routine dont la capacité manque ne tourne pas et l'écran dit pourquoi. `outcome` est écrit en clair (« 3 fils sans réponse », « Échec : Graph 503 ») — un silence normal ne doit pas ressembler à une panne. Kill-switch : `ROUTINES_DISABLED=true`. En espace démo : écran visible, zéro envoi.

Routines — les 21 déclencheurs et les cadences (suite) : le catalogue couvre désormais **24 des 25 déclencheurs du rapport** (le n°9 « suivi budget » est un refus motivé — il exige de classer une intention dans le CORPS des messages, que le socle ne lit pas). Six cadences : `continuous`, `daily`, `weekdays`, `weekly`, `monthly`, `quarterly`. **`continuous` mérite l'explication** : trois déclencheurs (n°3 « -1 h avant CHAQUE rendez-vous », n°4 « +30 min après », n°5 « à détection d'une annulation ») sont attachés à un OBJET, pas à une heure — les traiter en routine journalière raterait le deuxième rendez-vous de la journée. Ils tournent à chaque balayage et leur idempotence porte sur l'objet (`utilisateur:routine:obj:<id>`, **sans date** : « ce rendez-vous a été annoncé » est vrai pour toujours, y mettre le jour le re-notifierait le lendemain). `monthly`/`quarterly` tombent sur le **premier jour OUVRÉ** et non sur le 1er : un rapport posté un dimanche est lu le lundi, noyé sous le reste.

Profondeur CRM — doublons et hygiène (API, `crm/crm-duplicates.ts`, pur et testé ; déclencheurs n°17 et n°24) : **on PROPOSE, on ne fusionne JAMAIS** — fusionner est irréversible côté CRM et un faux positif détruit l'historique d'un vrai client. Chaque paire porte sa RAISON et sa confiance : même adresse (0,95), même nom chez la même société (0,75), même nom sans société (0,35). Deux homonymes chez DEUX sociétés différentes ne sont **pas** rapprochés — c'est la pire erreur possible dans un CRM commercial. L'hygiène ne signale que ce qui EMPÊCHE de travailler (adresse, société, nom) ; le reste des propriétés d'un CRM est l'affaire de son propriétaire.

Garde-fous n°12 et n°17 : `MailThread.otherParticipants` porte les autres personnes du fil (hors interlocuteur principal) pour que l'écran les PROPOSE en copie sans jamais les ajouter d'office — répondre à un fil à trois en n'écrivant qu'à une personne coupe les deux autres de la conversation ; et `AgendaEventDraft.accountName` préfixe le titre (« Société — sujet »), sauté quand le titre nomme déjà la société car « ACME — ACME : cadrage » serait pire que rien.

ATS/ERP par espace de travail (API, module autonome `apps/api/src/modules/ats/`, table `ats_connections`, migration `1788800000003` ; décision Louis du 03/08) : les identifiants BoondManager passaient par une variable d'environnement GLOBALE — un seul ATS pour toute la plateforme, inutilisable dès le 2e client. Ils sont désormais saisis par espace dans Réglages › Intégrations, chiffrés AES-256-GCM (même helper que les jetons CRM ; le couple « jeton client + clé » est concaténé avant chiffrement, une seule colonne à auditer). L'env reste en REPLI et le statut DIT laquelle des deux sert (`fromEnvironment`) — c'est ce qui évite le « ça marche chez moi » qui ne marche pas chez le client. Table dédiée et non `crm_connections` : un ATS n'est pas un CRM, et l'y ranger obligerait le service CRM à filtrer un provider étranger à chaque lecture. **LECTURE SEULE, décision assumée** : écrire dans l'ERP d'une ESN engage sa facturation et sa paie. Le service lit missions (`/deliveries`), consultants (`/resources`) et besoins (`/opportunities`) ; le parsing est PUR et testé (`ats-parse.ts`) parce que la forme des réponses n'est pas entièrement documentée — règle de fond : **un champ illisible vaut `null`, jamais une valeur de remplissage** (un TJM à 0 ou une disponibilité inventée feraient prendre de mauvaises décisions commerciales). Une mission sans date de fin n'alerte JAMAIS. Deux routines en découlent (`mission_ending` J-30, `bench_alert` intercontrat > 30 j). En espace démo : la connexion est REFUSÉE (un prospect ne dépose pas les identifiants de son ERP sur un espace partagé) et la table est purgée au reset.

Envoi de masse gouverné (API — `POST /mailbox/batch`, table `mail_send_batches`, migration `1788800000004` ; arbitrage Louis du 03/08) : un lot validé peut PARTIR, pas seulement atterrir en brouillon. C'est la décision la plus risquée du chantier — un mauvais lot part en entier et la réputation d'envoi d'un domaine se répare en semaines — donc quatre garde-fous, dans cet ordre : (1) **idempotence d'abord** — `batchId` fourni par le client, lot enregistré AVANT le premier envoi ; ré-approuver, recharger ou rejouer retrouve le lot traité et ne renvoie rien ; (2) **borne dure** `MAX_BATCH_RECIPIENTS = 50` — au-delà c'est une campagne, pas une relance, et on refuse ; (3) **opt-out destinataire par destinataire**, l'écarté l'est AVEC sa raison, jamais en silence ; (4) **arrêt après 3 échecs consécutifs** (`BATCH_ABORT_AFTER_FAILURES`) — trois refus d'affilée signalent un problème de compte, pas trois adresses malchanceuses. Le mode `send` dépose le brouillon PUIS l'envoie : un envoi qui échoue laisse un brouillon récupérable plutôt qu'un message perdu. L'envoi passe par le backend connecté (`MailboxBackend.send`), dont le chemin porte déjà le contrôle d'opt-out — jamais un second chemin d'envoi.

Livrables bureautiques (API, module autonome `apps/api/src/modules/documents/` ; décision Louis du 03/08 : **ajouter les bibliothèques de génération** plutôt que dépendre d'un connecteur — un utilisateur sans Google Workspace doit pouvoir télécharger son fichier). Deux dépendances ajoutées : `exceljs` (XLSX) et `docx` (DOCX). `GET /documents/accounts/:id/contacts.xlsx` (classeur de contacts, en-tête figée) et `GET /documents/accounts/:id/dossier.docx` (plan de compte). Les constructeurs sont PURS et testés en RELISANT le fichier produit — ce qui casse dans un export, c'est la mise en page, et ça ne se voit qu'à l'ouverture chez le client. Deux règles : les valeurs sortent en **TEXTE** (un « 01 42 » qui devient le nombre 142 est irrattrapable une fois le fichier envoyé) et une valeur absente reste une **cellule vide** — écrire « N/A » se lit comme une donnée, et quelqu'un finira par appeler un « N/A ». Aucune donnée n'est recalculée : un export qui produirait des chiffres différents de l'écran ferait douter des deux. **Non livré** : PPTX (`pptxgenjs` approuvé mais non branché — aucun écran ne le demande encore) et le PDF natif (le chemin honnête aujourd'hui est l'export Drive quand un compte Google est connecté).

Import de fichier de prospection (API — `POST /accounts/:id/contacts/import-csv`, parseur pur `contacts/csv-import.ts` ; décision Louis du 03/08 : **pas de scraping LinkedIn**, l'utilisateur exporte depuis SA session). Deux temps délibérés : `dryRun` rend ce qu'on a COMPRIS (colonnes reconnues, colonnes **ignorées** — jamais devinées —, lignes écartées avec leur raison, doublons repérés) avant que rien ne soit écrit ; l'import réel réutilise ensuite `bulkImportManual`, qui dédoublonne déjà contre les contacts existants du compte. Le parseur gère les guillemets, le séparateur point-virgule d'un Excel français, les en-têtes FR/EN accentués, et refuse une adresse qui n'en est pas une plutôt que de la garder. Borne : 2000 lignes, **annoncée** (`truncated`) et non coupée en silence.

Pièces jointes réelles et recherche documentaire par contenu (garde-fous n°25 et n°26 des méta-analyses) : `mailDraftRequestSchema.documentIds` joint le fichier RÉEL au brouillon (encodage multipart MIME dans `encodeGmailRaw`, frontière tirée d'un aléa — une frontière fixe finirait par apparaître dans un fichier et couperait le message en deux), et `GET /google/drive/search` cherche dans le CONTENU (`fullText contains`) et non dans le nom : un CV s'appelle presque toujours `CV_2024_v3.pdf`, chercher « Java » dans les noms ne rend jamais rien et l'utilisateur en conclut qu'il n'a pas le document. Un document natif Google est EXPORTÉ en PDF avant d'être joint — un `.gdoc` en pièce jointe ne s'ouvre pas. Un document introuvable n'annule pas le brouillon : il part sans, et c'est journalisé. Un LOT d'envoi ne porte jamais de pièce jointe (chaque destinataire aurait le même document).

Intégrations et parcours connecteurs — PDF 7/9 du 19/08/2026 (`agent_docs/pdf7-integrations-connecteurs-2026-08-21.md`) : une intégration n'est pas une icône avec un statut, c'est un **contrat de capacités**. Le document tient en une phrase — « une erreur se remarque, une liste vide se croit » — et le dépôt en avait le vocabulaire (huit états de capacité) sans la mécanique.

**Le contrat d'erreur de connecteur** (`packages/contracts/src/schemas/connector-error.ts`, `apps/api/src/common/connector-error.ts`) : cinq codes en liste FERMÉE — `not_connected`, `scope_missing`, `provider_api_disabled`, `provider_unavailable`, `rate_limited` — parce que chacun appelle un GESTE différent, et que dire « réessaie dans un moment » sur une portée jamais accordée coûte une journée. La portée manquante est **NOMMÉE** (`scopes[]`) : « il manque un accès » n'apprend rien à l'opérateur qui doit la déclarer chez le fournisseur. Le corps porte `code` ET `reason` avec la même valeur — le navigateur ne lit que `code`, si bien que tout le correctif du 16/08 (PR #936) était **invisible à l'écran**. Le `message` ne nomme JAMAIS l'éditeur ; `provider` et `scopes` sont de la DONNÉE que seul l'écran Intégrations rend. **GA-10** (`architecture/qualified-empty-lists.spec.ts`) refuse qu'une route de connecteur rende un tableau nu : neuf le faisaient encore, dont les séquences CRM et les agendas à venir.

**L'état par CAPACITÉ** (`connectedToolSchema.capabilities[]`, `tool-registry/tool-capabilities.ts`) : `capability_state` se dérivait de `data_types.writes.length > 0` — c'est-à-dire du CATALOGUE — si bien qu'un Google connecté sans `gmail.send` s'affichait « opérationnel » et que l'échec arrivait après le clic. Trois des huit états (`limited_write`, `degraded`, `action_pending`) n'avaient d'ailleurs **aucun chemin vers la production**. Deux valeurs ajoutées en fin d'énumération : `scope_missing`, celui autour duquel tourne tout le PDF et qui manquait, et `untested` — « `sain` n'est jamais déclaré, il est dérivé des portées ET d'un test réel », et c'est ce mot-là qui s'affichait le 16/08 au-dessus d'un agenda éteint depuis des semaines. La comparaison des portées est **insensible à la casse** (Microsoft rend `Mail.Read` au consentement et `mail.read` dans le jeton). Une capacité qu'aucune lecture non destructive ne peut prouver (`send`, `create`) n'exige pas de preuve : un badge permanent est un badge qu'on cesse de lire.

**Tester et Réparer** (`POST /tools/:provider/test`, `GET /tools/:provider/repair`, table `connector_capability_probes`, migration `1789910000001`) : une LECTURE réelle par capacité, avec un échantillon d'objets NOMMÉS (« 10 agendas, dont Perso, Équipe, Client EDF ») et jamais leur contenu. Une portée absente se voit AVANT d'appeler le fournisseur. « Réparer » rend les quatre choses du §6.3 — la portée nommée, le pourquoi (« un accès accordé ne s'élargit jamais après coup »), le geste, et les automatisations bloquées. L'orchestration vit dans un **CONTRÔLEUR** : elle traverse cinq modules et GA-07 est au plafond ; c'est la sortie que la garde nomme elle-même. ⚠️ L'ancien bouton « Tester » POSTAIT un vrai message dans le canal Slack de l'utilisateur — le test destructif que le ticket interdit ; il survit, renommé « Envoyer un message de test », parce qu'un webhook n'a aucune lecture non destructive.

**Une boîte mail est PERSONNELLE** (`common/util/personal-connection.ts`, D58) : `google_connections` et `microsoft_connections` portent un index unique `(user_id, provider)` — une ligne par membre — et toutes les lectures se faisaient par `workspace_id` avec un `findOne` SANS ordre. `getValidAccessToken` rendait donc à un membre le **jeton déchiffré de son collègue**, et « Déconnecter » supprimait la connexion de quelqu'un d'autre. Sa connexion d'abord, celle de l'espace en repli — l'asymétrie qui rend le repli tenable : on LIT une connexion partagée, on n'en SUPPRIME jamais une qui n'est pas la sienne. Et « Déconnecter » **révoque** enfin côté fournisseur là où c'est documenté (Google, HubSpot) ; Microsoft Graph n'a aucun point de révocation par application et l'écran le DIT.

**L'assistant d'import** (`/settings/import`, `packages/contracts/src/schemas/import.ts` + `import-engine.ts`, module `apps/api/src/modules/import/`, migrations `1789910000002` et `1789910000003`) : `apply` REFUSE tant qu'aucune simulation n'est ENREGISTRÉE, et le rapport est figé et daté. Douze sources, un seul moteur DÉCLARATIF (`import-catalog.ts`) — douze parseurs à la main seraient douze bugs. Le moteur est PUR : ce qui décide ne parle jamais à la base, sinon la simulation ne rejouerait pas ce que fait l'import. Trois refus délibérés : une date ambiguë (`01/02/2026`) n'est PAS devinée, une ligne sans clé de dédup n'est le doublon de personne, et un objet touché par un HUMAIN après l'import n'est jamais annulé. Le fichier est décodé côté navigateur (`decode-file.ts`) et l'écran dit comment — Excel FR écrit en Windows-1252 par défaut, et `file.text()` décodait en UTF-8 sans condition. ⚠️ **L'écriture est branchée pour les COMPTES et les CONTACTS** ; les dix autres objets se simulent et refusent l'écriture PAR LEUR NOM. Statut `imported` ajouté à `accounts_status_check` : `completed` affirmerait qu'un dossier existe.

**L'écriture CRM gouvernée** (`crm/outbound-write.service.ts`, table `outbound_write_requests`, migration `1789910000004`, arbitrage Louis « toutes les écritures CRM ») : l'ERP avait sa prévisualisation figée depuis le 03/08, le CRM écrivait EN DIRECT. Un geste d'UTILISATEUR est auto-approuvé — le clic EST la décision, et un CRM est le carnet d'adresses de celui qui demande, pas la paie de l'ESN. Un geste de SYSTÈME (versement de téléphonie, reflet d'interaction réseau, routine) devient une demande **en attente**, visible : c'est la conséquence assumée de l'arbitrage. Expiration à **3 jours et non 21** — le PDF demande 21 au §8 et écrit au §4.4 qu'« approuvée trois semaines plus tard, elle écrirait un état que plus personne n'a en tête ». Une valeur absente est NOMMÉE « non renseigné ».

**Ce que le PDF 7 NE promet pas** : la lecture des canaux Slack/Teams/Discord (ce sont des webhooks SORTANTS ; lire un canal exigerait une app OAuth par éditeur), le clic-to-call (D61), l'export Factur-X (D59, reconduit de D32), un connecteur Airtable ou CVthèque (D60), une table de source de vérité éditable (D62 — `field_provenance` arbitre déjà, et deux vérités sur le même champ se résoudraient en silence), et le découpage de l'entrée `microsoft` du catalogue — qui conflate messagerie, agenda et documents sous un seul `provider`, ce qui empêche le registre de répondre « l'agenda est-il lisible ? ». Raison de chacun dans le tracker.

**Couverture des trois rapports, point par point** : `agent_docs/couverture-rapports-2026-08-03.md` — les 30 garde-fous, les 25 déclencheurs, les 100 besoins PRIO 1, les 50 PRIO 2, les 60 requêtes, les roadmaps longues, et surtout la section « ce qu'on ne promet pas » avec la raison de chaque refus (scraping, corps des messages, écriture ERP, transcription d'appels, signature/finance…).

Profondeur CRM (API) : `POST /crm/tasks` (tâche de relance — l'échéance est REQUISE, une tâche sans date ne remonte dans aucune vue), `POST /crm/meetings` (journal d'une réunion tenue ; `externalId` = identifiant de l'évènement d'agenda, la clé qui évite de journaliser deux fois le même rendez-vous), `GET /crm/stale-contacts?days=` (« à relancer » et « dormants » sont la même question à deux seuils). Routine `crm_followups` (déclencheur n°15). Une tâche est créée en `NOT_STARTED` sans propriétaire ni priorité devinés : une tâche chez la mauvaise personne est ignorée, puis pourrit la vue de quelqu'un qui n'y peut rien.

Compte rendu de rendez-vous (API — module autonome `apps/api/src/modules/meeting-notes/`, IA `POST /notes/structure`, écran : onglet Plan d'un dossier ; §5.3 et §7.2 des méta-analyses) : des notes brutes deviennent résumé + décisions + prochaines étapes + questions ouvertes + signaux + brouillon de mail de suivi. Trois gestes SÉPARÉS (transcrire, structurer, poser les actions) — une chaîne qui s'exécute d'un bloc ne laisse aucune place au « non, cette action n'est pas pour moi », et les actions d'un compte rendu circulent. Garde anti-invention dans le prompt `bellum_meeting_notes` : une action dont la réunion n'a pas dit le propriétaire le laisse VIDE, une action sans échéance reste sans date, et une liste vide est une réponse acceptable. Transcription optionnelle : `TRANSCRIPTION_API_KEY` (+ `TRANSCRIPTION_API_URL` défaut OpenAI `/v1/audio/transcriptions`, `TRANSCRIPTION_MODEL` défaut `whisper-1`) — **sans clé, la capacité est déclarée `false`, l'écran le dit et aucune requête ne part** ; borne 24 Mo vérifiée AVANT l'envoi (route montée à 34 Mo dans `main.ts`, comme l'ingestion RAG). En espace de démonstration, la structuration est SCRIPTÉE (zéro appel modèle) et le dépôt d'un enregistrement est refusé.
Profondeur CRM (API — `apps/api/src/modules/crm/crm-depth.service.ts`, arbitrages Louis 03/08) : au-dessus de la connexion existante, la partie « pilotage » du CRM — **rapport de pipeline** calculé sur une lecture PROFONDE de l'historique des deals puis mise en cache (`crm_deal_facts` + `crm_pipeline_syncs`, migration `1788900000001`, TTL 24 h, borne dure 5 000 deals), **listes statiques**, **inscription en séquence**, **scoring d'engagement**, **import en masse** et **création de société**. Le calcul est séparé du réseau : `pipeline-report.ts` et `lead-score.ts` sont des fonctions pures dont `now` est un paramètre. Règle d'honnêteté partout : ce qui n'est pas mesurable est compté À PART — un deal clos sans date de clôture n'entre dans aucune fenêtre (sinon l'historique mal daté gonfle le trimestre en cours), un deal sans montant n'est pas 0 €, un signal d'engagement absent sort du score ET du maximum, et `winRate: null` s'affiche « aucune affaire close », jamais « 0 % ». L'inscription en séquence est le geste le plus risqué (elle programme des envois dans un moteur tiers) : **double opt-out** vérifié contact par contact (celui du fournisseur ET celui de Bellum), borne dure à 50, refus toujours nommé, et une lecture d'opt-out en échec fait SAUTER le contact. La purge du cache ne s'exécute que sur une lecture complète : sur une lecture tronquée, l'absence d'un deal ne prouve rien.

Exigences produit §10 et indicateurs §12 (API — `apps/api/src/modules/analytics/`, arbitrage Louis 03/08 « indicateurs en back-office uniquement ») : deux modules PURS et testés. **`interlocutor.ts`** classe un interlocuteur AVANT toute rédaction (collègue / client / prospect / consultant / candidat / partenaire / fournisseur) — déterministe (un modèle qui range la même personne différemment ferait changer le ton d'une conversation en cours), ordonné par RISQUE et non par fréquence (le collègue d'abord : lui envoyer une séquence de prospection est la faute la plus embarrassante), et il rend sa CONFIANCE — « prospect à 0,4 » se montre, il ne se consomme pas en silence. **`quality-metrics.ts`** calcule les 9 indicateurs du §12 sur `user_actions`, exposés par `GET /internal/analytics/quality` (InternalSecretGuard, back-office). Deux règles : un taux sans dénominateur vaut `null` et non 0 % (un espace créé hier ne doit pas afficher « 0 % d'exécution vérifiée » et faire chercher une panne), et une action `partial` ou sans issue connue SORT du dénominateur — la compter en succès gonfle le taux, en échec l'effondre, ni l'un ni l'autre n'est vrai. Le temps de réponse est une MÉDIANE : un seul run de trois minutes déplace une moyenne.
Administratif — signatures et factures (API, optionnel — module autonome `apps/api/src/modules/admin-docs/`, table `admin_docs_connections`, migration `1788900000005` ; §5.9 et déclencheurs n°11/n°12, arbitrage Louis 03/08 « lecture + envoi à signature après approbation ») : identifiants **par espace ET par fournisseur** (chiffrés AES-256-GCM via le crypto CRM), quatre fournisseurs — **Yousign v3** et **Qonto v2** sur leur contrat public vérifié, **DocuSign** et **Tiime** avec URL surchargeable et lecture tolérante (même règle que Kaspr/FullEnrich : on ne devine pas, on accepte de ne rien trouver). Deux règles de fond : les montants sont lus en **CENTIMES** (un flottant qui traverse deux conversions affiche 1 999,99 € là où la facture dit 2 000 €) et un retard inconnu vaut **`null`, jamais 0** (« 0 jour de retard » se lit « elle vient d'échoir »). La réponse distingue toujours `items` de `unavailable` : « rien à signaler » n'est pas « je n'ai pas pu regarder », et une routine qui annonce « aucune facture en retard » parce qu'un serveur était en maintenance est pire que pas de routine. Bellum ne signe rien, ne paie rien, ne fabrique aucun document et ne stocke aucun IBAN — l'envoi à signature ACTIVE une demande déjà préparée et relue chez le fournisseur. Connexion refusée en espace de démonstration.
Écriture dans l'ERP, gouvernée (API — `apps/api/src/modules/ats/ats-write.service.ts`, table `ats_write_requests`, migration `1788900000004` ; arbitrage Louis 03/08 « écriture après approbation explicite ») : le refus historique — écrire dans l'ERP engage la facturation et la paie — devient une écriture SOUS CONDITION. Trois propriétés, chacune pour un accident précis : (1) **validation de responsable TOUJOURS**, pas au-delà d'un seuil — un TJM est un TJM — via `canDecide` de l'Action OS réutilisé tel quel, ce qui interdit aussi l'auto-approbation ; (2) la **prévisualisation est FIGÉE** (`ats-write-preview.ts`, pur et testé : une ligne par champ écrit, une valeur absente NOMMÉE « non renseigné » plutôt qu'un blanc qui se lit comme un bug d'affichage) ; (3) une demande **expire à 3 jours**. Quatrième règle, d'honnêteté : la réponse de l'ERP est conservée telle quelle et l'état passe à `failed` — « on a essayé et ça n'est pas passé » est une information, « rien ne s'est passé » n'en est pas une. ⚠️ Les chemins de ressources sont ceux vérifiés EN LECTURE ; le verbe et le corps attendus en écriture ne sont pas publics — à valider sur une instance réelle avant d'ouvrir à un client.
Classement des messages (API — `GoogleService.classifyMessage`, `POST /google/gmail/classify` ; §5.1 n°29 et §13.1 n°7, arbitrage Louis 03/08 « coder maintenant, portée opt-in par espace ») : pose une étiquette sur un message et l'archive si demandé. Gardé par la portée **RESTREINTE** `gmail.modify`, délibérément ABSENTE de `GOOGLE_SCOPES` par défaut — l'accorder donne aussi le droit de SUPPRIMER du courrier et impose une revue de sécurité annuelle. L'opérateur qui a obtenu la validation Google l'ajoute, ses utilisateurs se reconnectent, et la capacité `gmailModify` s'allume d'elle-même (même mécanique que `gmail.readonly` de la couche zéro). Sans elle, le service REFUSE avec un message lisible plutôt que de laisser Google rendre un 403. Deux bornes : l'étiquette est relue avant d'être créée (Gmail refuse un doublon de nom, et classer cent messages ne doit pas produire cent erreurs), et archiver retire `INBOX` — ce n'est PAS une suppression, dont le client n'a de toute façon pas les moyens : `users.messages.delete` est absent du code.

Portefeuille d'offre — le métier du vendeur pilote le prisme (addendum Stelya du 24/08/2026, `agent_docs/addendum-stelya-industrial-2026-08-24.md`) : le produit était **multi-domaines capable mais IT par défaut**. Un `offer_portfolio` jsonb NULLABLE sur `esn_profiles` (migration `1790010284617`) porte ce que le pack ne sait pas — type de société, secteurs d'application NORMALISÉS (42 codes, `application-sectors.ts`), politique de site, zones, lexique, portée de réutilisation des retours. **L'objet ABSENT est l'état de tous les espaces existants** et rend le chemin legacy byte-identique ; sa PRÉSENCE est l'interrupteur — pas un drapeau, donc pas un drapeau à oublier (les six feature flags du §24.2 sont refusés pour cette raison). Il ne recopie PAS les domaines (ils vivent dans `offer_domains`) et ne porte pas de domaine principal vendeur : `dominantOfferDomain` répond déjà, déterministe. `company_type` est **DÉRIVÉ** du portefeuille et n'est stocké que CORRIGÉ — `null` veut dire « laisse dériver », jamais « inconnu ». Écriture PARTIELLE de bout en bout : un écran qui renverrait l'objet entier remettrait le lexique aux défauts le jour où il oublierait un champ. Écran : Réglages › Profil, qui commence par la RESTITUTION (« Bellum restitue son positionnement sans ESN, ni régie, ni cabinet » est le premier critère de viabilité du retour bêta) et DIT quand rien n'est configuré, au lieu de faire passer des vides pour un choix. Toute écriture laisse une trace au journal partagé — les CLÉS touchées, jamais leurs valeurs.

Prisme d'ingénierie industrielle (IA — `offer_domains/industrial_engineering.py`, 8ᵉ pack) : les huit domaines CŒUR de la taxonomie V10 (systèmes/MBSE, mécanique, électrique, industrialisation, automatisme, qualité, maintenance, production) résolvaient `generic` ou `supply_chain` — une société qui ne vend que ça obtenait un prisme sans aucun vocabulaire d'ingénierie. Ajouté EN FIN de `OFFER_DOMAINS` (GA-08) : cet ordre est aussi celui du départage de `dominantOfferDomain`, donc un ajout en fin ne peut pas voler une égalité. Sa grille de signaux porte la règle de fond du retour : **une activité INTERNE n'est jamais une preuve d'achat externe** — un recrutement méthodes en volume dit une tension, pas une externalisation. Sa directive d'entité vise le SITE : la taille du groupe ne dit rien de la surface d'un site. Le contexte du portefeuille voyage jusqu'aux prompts par UN point (append au `domain_brief`, que tous interpolent déjà — §17.1 « construit une fois, jamais recopié dans huit prompts divergents »), copilote compris : il recevait le profil en texte brut et aucune lentille, donc raisonnait en IT pendant que le pipeline raisonnait dans le domaine du vendeur. `decision_role` gagne une chaîne de décision industrielle (BE, direction technique, méthodes, qualité, maintenance, automatisme, HSE) évaluée APRÈS achats et budget — « Directeur des Achats Industriels » porte le mot sans le métier — et **uniquement pour un vendeur industriel** : pour une ESN IT, un directeur d'usine n'est pas un décideur, sa DSI l'est.

⚠️ **GA-36 lit des MIGRATIONS, pas une base** (`architecture/migration-columns-declared.spec.ts`) : la garde exige qu'une colonne créée par migration soit déclarée par son entité — elle a trouvé 17 colonnes fantômes, toutes lues en SQL brut, dont `missions.site_id` qui n'avait NI lecteur NI écrivain. Mais « une migration ajoute la colonne » n'est pas « la colonne existe en production » : obéir à la garde a mis `/workspaces/me` et `/briefing/today` en **500** le 24/08 (`profiles.onboarding_completed`, ajoutée par une migration avec `IF NOT EXISTS` sur une table SUPABASE créée hors TypeORM). D'où `NOT_IN_PRODUCTION`, où chaque entrée porte SA PREUVE — un log d'erreur de production, jamais une intuition ; un test vérifie que la preuve est écrite, sans quoi la liste deviendrait la porte de sortie de la garde.

Archive 02 de l'itération 3 — PDF 2 à 5 recroisés (`agent_docs/archive-02-crm-ats-matching-2026-08-25.md`) : quatre chantiers clos, relus contre leurs sources. Intégrité totale (21 fichiers SHA-256, 9 miroirs identiques, 73 routes et 100 modules inchangés) — donc la valeur est ailleurs. **`c26_probabilite`** rejoint le registre de doctrine : le refus le plus répété du produit, six fois, n'y figurait pas, alors que la source le REDEMANDE (`pdf2.md:436`, D14). Déclarée TENUE et non gardée — aucune garde ne peut reconnaître une sémantique dans un nombre, « 0,72 » ne dit pas de lui-même s'il est une part ou une chance ; ce qui est testé, c'est la FORME (un score porte ses axes, un axe non évaluable sort du dénominateur, l'absence rend `null`). **`c17_facturation` porte enfin une DATE** : l'obligation française de RÉCEPTION de la facture électronique au **01/09/2026** (`pdf5.md:687`). Elle ne renverse pas le refus — Bellum n'émet rien, elle s'impose aux ESN clientes — mais un refus qui ignore une échéance à sept jours se relit dans six mois comme un oubli. Trois arbitrages jamais écrits sont inscrits : **60 jours et non 90** pour revalider une disponibilité (la source dit les deux, `pdf3.md:40` vs `:220` ; le code applique 60 en citant un AUTRE PDF, et 60 est le choix strict) ; **l'AI Act annexe III s'applique depuis le 02/08/2026** (droit à l'explication — les trois conséquences étaient livrées, la date manquait ; ⚠️ non revérifiée contre le texte du règlement) ; et **les axes de risque de mission** ne sont pas trois axes perdus mais **deux jeux différents** — le code a retenu les cinq mesurables, ce qui est juste, mais le tracker du PDF 5 écrit « ABSENT » à un endroit et « livré » à un autre. Le résultat structurel : quatre lecteurs indépendants ont convergé sur **un seul mécanisme** — les trackers gardent la LOI et jettent la **troisième colonne** des tableaux (garde-fous, seuils cibles, conditions d'entrée, critères d'acceptation, dépendances de tickets). **~120 exigences** perdues ainsi, toutes inscrites au §7 avec leur statut de vérification : sept revérifiées à la main, **une réfutée**. Ce qu'on ne promet pas : les livrer (ce ne sont pas des tickets mais des lignes de tracker manquantes, dont une part inconnue est déjà dans le code) ni écrire une garde contre cette perte — elle devrait reconnaître une colonne de tableau dans de la prose, donc elle ne saurait pas dire NON.

Recovery Pack juin 2026 (`agent_docs/recovery-juin-2026-2026-08-24.md`) : le corpus historique de juin confronté au dépôt — 86 fichiers, 293 pages, un export CRM de 17 387 contacts, dont **quatre cinquièmes étaient déjà repris ou supplantés**. Le croisement a surtout trouvé ce que le paquet ne demandait pas : **49 défauts vivants**, tous vérifiés dans le code. Trois règles en sortent, chacune payée par un défaut réel.

**Un run qui n'a rien envoyé ne se dit plus « terminé ».** `workflowRunStatusSchema` gagne `blocked` (rien n'est parti — le geste est de brancher un outil) et `unknown` (la requête est peut-être partie — ça se vérifie, ça ne se rejoue pas ; `dispatchFailureOutcome` portait déjà la distinction au niveau du PAS, et le niveau run l'annulait en comptant `unknown` avec `failed`). `queued` cesse d'être replié en `done` : une requête ACCEPTÉE n'est pas une action vérifiée, et le repli débitait le crédit sur une promesse. ⚠️ L'Action OS produisait cette fausse réussite **par construction** : `POST /action-os/runs` n'a aucun appelant, et le contrôleur passe `intents: {}` + capacités vides — donc tous les pas bloqués, et un run enregistré « terminé ». Le brancher est le lot G, non fait.

**La correction humaine tient sur un compte.** `applyResearch` faisait un `repo.update` brut : secteur, effectif, chiffre d'affaires, siège et site étaient écrasés à chaque réanalyse, sans un mot — alors que les CONTACTS passaient déjà par l'arbitre. Le patch traverse `applyFieldUpdates`, et la lecture supplémentaire ne coûte que s'il existe une correction à protéger. ⚠️ La garde qui l'interdisait était **CITÉE par le contrat et n'avait jamais été écrite** : `provenance.ts` affirmait « c'est exactement ce que le test de garde `no-blind-record-writes.spec.ts` interdit », et le fichier n'existait nulle part. Une garde affirmée mais absente est pire qu'une garde absente — elle fait croire que le sujet est tenu.

**Une dérivation vit à un seul endroit.** La simulation d'import ne comparait rien à la base (`existing: {}` en dur), et brancher la comparaison n'a pas suffi : les clés de dédup incluent `normalizedName`, qu'aucun export ne porte en colonne. L'écriture le dérivait de son côté, à la main ; la simulation pas du tout. `withDedupInputs` est la seule dérivation, et les deux chemins l'appellent. Trouvé **en recette live** : « 3 créations, 0 mise à jour » sur trois sociétés dont deux existaient.

Restent ouverts, avec leur croisement fait et leurs preuves citées : les six tickets `LEGACY-002` à `007`, et l'item 104 — le pipeline écrit de la PROSE dans le champ site d'un compte (corrigé côté écran, pas côté écriture). ⚠️ « Le branchement de l'Action OS » y figurait aussi : **c'est périmé**, `apps/web/src/features/action-os/api.ts:98` appelle `POST /action-os/runs`.

Gouvernance de l'itération 3 (`agent_docs/gouvernance-iteration-3-2026-08-25.md`, archive `00` du Drive) : les vingt-cinq contradictions déjà arbitrées et les onze invariants non négociables entrent dans le dépôt en CODE — `packages/contracts/src/schemas/doctrine-registry.ts`. Tant qu'ils vivaient dans un PDF, chacun des neuf paquets suivants les re-arbitrait, dans deux sens, à trois semaines d'intervalle.

**Deux axes, jamais fondus** : `codeState` dit si la règle est APPLIQUÉE, `enforcement` si elle est TENUE — c'est la distinction de C15 (« connecté n'est pas lecture vérifiée ») appliquée à la doctrine elle-même. Mesuré : 17 doctrines gardées, 6 tenues sans test, 2 non tenues, 1 absente. Et **un invariant sur onze n'a AUCUN porteur** — « un retour bêta ne se réutilise pas tel quel chez un concurrent » : ni `submission_feedback` ni `account_feedback` ne portent de champ de portée. **GA-38** ouvre chaque chemin déclaré : c'est l'accident du 24/08, où `provenance.ts` citait une garde qui n'avait jamais été écrite. `doctrinesForPack('06')` répond à « que reste-t-il pour l'archive suivante ? » sans relire le tracker.

⚠️ **Le pack est un point de vue DATÉ, produit par analyse statique.** Quatre de ses affirmations sont fausses : le secteur du Projet/Mission et le contexte industriel du Site EXISTAIENT (leurs colonnes étaient lues, jamais écrites — corrigé) ; `offerPortfolioContext` EST consommé par l'IA ; et le 7ᵉ domaine de navigation s'appelle **Laura**, pas « Copilote ». Il nomme aussi six états de capacité d'intégration là où le dépôt en a **dix** — table de correspondance au §3 du tracker, on ne renomme rien. Son `MASTER_DOCUMENT_INVENTORY.csv` ne porte par ailleurs que **38 des 79 documents** (recompté le 25/08 sur l’archive 09 ; « 69 » était faux) de sa version markdown — ce n'est pas une troncature mais une SÉLECTION par catégorie, et les 28 écartés sont la série des huit PDF du 20-21/08, le README de doctrine DATAFORGE V9, le devis KEYRUS (seul tarif contractuel réel du corpus) et les captures d'état visible : lire le markdown, jamais le CSV.

**Le secteur appartient à la DEMANDE** (C05, `PATCH /projects/:id/sectors`) : les colonnes existaient depuis le 24/08 et l'axe `sector` du matching les lisait, mais aucun chemin ne pouvait les écrire — l'axe retombait donc TOUJOURS sur le secteur du compte. Rien n'est pré-coché depuis le compte : un secteur hérité en silence se lirait comme une saisie, alors que le repli existe et est NOMMÉ à l'écran. La Mission en hérite à la conversion (`inherited_from_project_at`, règle décrite dans le docblock de l'entité depuis la migration et implémentée nulle part) — rien sans projet, rien d'estampillé sur une copie vide, et une lecture en échec ne fait pas tomber la création. Même famille pour les six colonnes industrielles du Site : lues par `siteFit`, écrivables par personne, donc « inconnu » partout. Une confiance d'effectif SANS source est refusée (c'est une opinion), l'inverse est accepté. ⚠️ `application_sector_codes` n'a **aucune contrainte SQL** : un code inventé s'insère sans broncher — mesuré sur le seed de démonstration, gardé depuis dans `demo-contract-values.spec.ts`.

Archive `01` de l'itération 3 (`agent_docs/archive-01-architecture-ux-2026-08-25.md`) : quatre sources déjà traitées par un tracker du dépôt — PDF 1, PDF 9, Tome 7, Tome 8. La question n'était donc pas « qu'est-ce qui manque » mais « ces trackers ont-ils tout pris ? », et la réponse est non. Le mécanisme est toujours le même : **ils reprennent les LOIS des chapitres et jettent les TABLEAUX qui les appliquent**, puis annoncent des totaux qui ne correspondent ni à la source ni à leurs propres tableaux.

**Un chiffre faux ne se contente pas d'être faux — il sert d'argument.** Le tracker du PDF 1 annonçait « 7 interdits » pour 9, « 21 contrats » pour 18, « 21 routes nouvelles » pour 16 (les 5 restantes étant des clés de palier, déjà comptées à part) et « cinq défauts » au-dessus d'un tableau de six ; les « 21 routes » justifiaient **trois fois** une non-livraison dans ce même document. Le tracker du PDF 9 annonçait « 45 tickets » là où la source en énumère 50 — et n'en statuait que quatre.

**Trois chapitres entiers du Tome 7 n'étaient nommés dans aucun tracker** : les douze lois d'interaction (§28), les neuf conflits de placement déjà TRANCHÉS (§7) et les neuf règles de rendu graphique (§25). Ils vivent désormais dans `packages/contracts/src/schemas/interaction-laws.ts`, gardé par **GA-41** (chaque porteur cité existe sur le disque ; un registre tout vert échoue). Mesuré : sept règles gardées sur trente. Deux écarts valent d'être lus — « l'état est dans l'URL » (23 écrans tiennent un onglet ou un filtre hors URL, donc une vue ne se partage pas par lien ; **non gardé malgré la mesure**, le signal attrapant aussi des états qui n'ont rien à faire dans une URL) et « les valeurs inconnues sont hachurées », qui est notre invariant « non mesuré n'est pas zéro » transposé aux graphiques — tenu dans le TEXTE, tenu nulle part dans un graphe.

**Les trois primitives front manquantes sur six** (le tome écrit « ce ticket passe avant tous les écrans nouveaux ») : `useLaura` (+ **GA-39** — la seule porte vers l'assistante ; le tome appelle « risque technique n°1 » le cas où chaque surface aurait sa propre logique d'interruption, deux compteurs et un plafond de trois par jour qui ne tient pas une semaine), `EffectPanel` (les deux règles du §47 qu'aucun panneau n'avait : le geste NU à un clic, et le refus de valider sur `Entrée` ; le refus de pré-cocher un envoi externe devient un SECOND verrou dans le contrat, qui ne fait pas confiance au catalogue) et `CapabilityGate` (le bandeau parle de l'ÉCRAN, la grille parle du BOUTON, et elle NOMME le connecteur).

⚠️ **Un numéro de décision est unique DANS SON CHANTIER, jamais globalement** (`decision-registry.ts`, **GA-40**) : vingt-cinq numéros désignent deux décisions selon le tracker qu'on ouvre, par plages entières — `D82` vaut « le copilote s'appelle Laura » ET « la charte du deck exporté ». On ne renumérote pas (règle de D72 pour les gardes, même raison : ces numéros vivent dans des commits). La garde RECALCULE les ambiguïtés depuis `agent_docs/` pour que le compte ne remonte pas. Une citation nomme son chantier : « D70 (tome 1) ».

**Le jeu de recette des 20 requêtes prioritaires** (`apps/ia/tests/test_priority_queries_coverage.py`) que le PDF 9 §6.1 exige. ⚠️ Il ne teste PAS le routage — router demande d'appeler le modèle, donc une clé de production dans les actions et une garde qui rougit sur une reformulation. Il teste la moitié DÉTERMINISTE, celle qui échouait : un modèle ne route pas vers un outil qui n'existe pas. Remesuré, **seize sur vingt** ont un outil, contre six au 21/08 ; les quatre autres sont déclarées sans outil AVEC leur raison.

⚠️ **Ce qui ne relève pas du dépôt** : le guide produit de 21 pages montre l'ANCIENNE navigation, nomme « Le Copilote » (D82 dit Laura — le dépôt, lui, est conforme : ses occurrences sont le nom COMMUN, que D82 conserve) et sous-vend les intégrations (« Salesforce bientôt » alors qu'il est connecté). Et une capture rangée dans le même paquet montre le copilote annonçant « j'ai enrichi 15 profils », « 6 CV générés et stockés dans ton CRM » — impossible, il n'a aucun chemin d'écriture. **Rejoué en live le 25/08 : NON reproductible**, le copilote refuse nommément. Aucune garde écrite pour cette raison ; ce qui reste est commercial — cette capture circule.

Aucun nom de fournisseur côté app (arbitrage Louis 02/08, addendum p12) : le copilote, les dossiers, les contacts, les séquences et les notifications nomment la CAPACITÉ (« votre CRM », « votre messagerie », « votre agenda »), jamais l'éditeur. **Seule exception** : l'écran Réglages › Intégrations, où l'utilisateur autorise lui-même l'accès — un bouton « Connecter » doit dire ce qu'il connecte. Les détails techniques (quotas, limites de débit, politiques de rétention) sont retirés de l'écran utilisateur et appartiennent au back-office DM. Deux gardes verrouillent la règle : `test_copilote_prompt_blocks.py` refuse tout nom d'éditeur dans le prompt système, `tool-capability-digest.spec.ts` refuse qu'un nom du catalogue ressorte du digest injecté au copilote.

Annuaire officiel — seconde source de rattachement de l'organigramme (IA, `app/services/official_directory.py`, **zéro clé, zéro appel réseau supplémentaire**) : la phase 1 relit les pages DÉJÀ scrapées du run et extrait, de la page équipe / gouvernance / direction **du site du compte lui-même**, les dirigeants dont le nom ET la fonction sont écrits textuellement (`research.officialDirectory` : `{fullName, title, url, collectedAt}`). L'assembleur (`assemble_org_graph(official_directory=…)`) en fait une source `official_site` (grounding A, +30 p14) portée par le nœud personne ET par son lien `member_of` — **jamais** par un lien `reports_to` : la page nomme des personnes et des fonctions, elle ne dit pas qui rapporte à qui, et déduire un N+1 d'une mise en page serait de la donnée inventée. Effet mesuré : une personne connue d'un fournisseur (Apollo, B/+20) et confirmée par le site officiel atteint **100 → « vérifié »** (la vue n°1 de l'organigramme cesse d'être structurellement vide) ; une personne connue du **registre** et confirmée par le site plafonne à **80** (deux preuves de grounding A remplissent le même facteur +30 — résultat négatif assumé). Site inconnu, page absente ou scrape en échec ⇒ zéro source ajoutée, dossier byte-identique. ⚠️ Dépend du budget de scrape : avec `FIRECRAWL_MAX_PAGES` bridé, la page équipe peut ne jamais être scrapée.

Dé-silo domaine (IA — `app/services/domain_focus.py`, Drive #9) : les prompts pipeline hard-codent un prisme IT (« Budget IT visible », « entité IT/digitale = cible n°1 », « décideur IT DSI/CTO/RSSI », « défis IT »). Le prisme est **toujours dérivé du profil ESN lui-même** (ses `offers`) — plus de flag ni d'env var (`DOMAIN_AGNOSTIC_V2` supprimé) : une ESN cyber/ERP/ingénierie est raisonnée dans SON domaine, pas dans un IT présumé. La sûreté tient au garde **`_looks_like_it_esn`** : (1) une ESN qui « lit IT » (client actuel) — ou un profil sans offres — reste sur les chaînes IT exactes → prompts **byte-identiques** (verrouillé par le golden test) ; (2) seule une ESN réellement non-IT obtient le prisme généralisé (issu de ses propres offres, aucune méthodo de vente inventée). Couvre les 5 system prompts (facts/signals/strategy/contacts/organigramme) **et** (phase 2) les **user prompts** du pipeline : `bellum_facts` (directive entité IT = cible n°1, exemples `whatToSell`, `programNames`, `it_implications_for_esn`), `bellum_signals` (hypothèses « orientées besoin IT », « achats IT »), `bellum_contacts` (« décisions IT/digital »), et la note d'évaluation GO/NO-GO de `bellum_plan` (« budget IT » / « signaux IT »). Le `profile` est threadé jusqu'à ces builders (`profile_data=`, keyword optionnel — un appelant qui ne le passe pas reste en défaut IT). Les **clés JSON du contrat** (`itAutonomy`, `it_implications_for_esn`, `programNames`) sont inchangées — seul leur libellé se généralise. Byte-identité IT / profil-vide verrouillée par `tests/test_domain_focus_user_prompts.py` (baselines `tests/golden/user/`). **Phase 3 — services déterministes** (`tests/test_desilo_phase3_deterministic.py`, toujours-actif sans flag) : sûreté = le défaut `looks_like_it_esn(profile)` (`True` pour ESN IT OU profil absent → byte-identique) ; seule une ESN franchement non-IT décale un signal. Généralisés : `prioritization.assign_priority_tiers(profile=…)` (boost « entité IT = auto-P1 » réservé ESN IT) et `entities` (badge `filiale_strategique` conditionné à `it_esn`, relevance opérante inchangée), threadés depuis `phase1_research`. **Phase 4 — l'override de relevance IT** (`tests/test_desilo_phase4_deterministic.py`, toujours-actif sans flag) : `entities.classify_entity_relevance` (+ `classify_subsidiary`, `annotate_entity_relevance`, `partition_subsidiaries`) prend un `it_esn: bool = True` — l'override « IS-IT-entity / NAF-62 = toujours operating » (le levier le plus à risque : il garde/jette l'entité pour tout le pipeline aval) est désormais conditionné au domaine ESN. `it_esn=True` (ESN IT ou profil absent) → byte-identique ; `it_esn=False` (ESN non-IT) → un « GIE Informatique » redevient bruit, une entité NAF-62 hors-secteur n'est plus force-gardée. Le flag `isItEntity` (posé par `enrich_entities_naf` via `is_it_naf`) reste factuel ; seule sa **consommation** (hard-override → operating dans `annotate_entity_relevance`) est gatée sur `it_esn`. `it_esn` déjà threadé depuis `phase1_research` (aucun nouveau câblage). Primitives factuelles **intactes** : `it_entity.is_it_entity`, `insee_sirene.is_it_naf` (la décision de domaine a bougé chez l'appelant, le FAIT reste). Laissé pour plus tard : `decision_role`/`contact_ranking` — leur call site (`classification.py`) reçoit en `profile_data` le `raw_analysis` de la CIBLE dans le chemin on-demand (`analysis-ondemand.service.ts` `enrichOrganigram` → `ia.classify({ profileData: account.raw_analysis })`), PAS le profil ESN → threader le domaine ESN exige un **changement de contrat API↔IA** (ajouter un champ `esn_profile` distinct à `ClassifyRequest` + le renseigner via `esnAnswersToProfileData` côté API, comme le fait déjà `replan`). ⚠️ Change la cartographie de tout compte non-IT → valider sur run réel (phase 4 = override de relevance = impact aval maximal).

Réponses structurées du Copilote (restitution V2 §14, maquette p.15) : le prompt `bellum_advisor` impose désormais un plan/une recommandation en sections nommées `**Objectif :** / **Angle d'accroche :** / **Cas d'usage :**` (+ `**Prochaine action :**` optionnelle) — la forme EXACTE que reconnaît `apps/web/src/features/chat/view/StructuredReply.tsx`, qui les encadre alors en carte. La consigne est **bornée** : une question factuelle ou un échange court se répond normalement, en 1-3 phrases. Une section « Cas d'usage » sans preuve dans le contexte doit se dire vide, jamais s'inventer une référence. ⚠️ Ce changement rebase délibérément les goldens `tests/golden/system/advisor.txt` + l'entrée `advisor` de `tests/golden/prompt_fingerprint.json`.

« Sauvegarder cette réponse » (restitution V2 §13) : un bouton sous chaque message du copilote épingle sa conclusion dans la mémoire longue via l'endpoint d'épinglage EXISTANT (`POST /memory/facts` → `memory_pinned_facts`, hook `usePinFact`) — aucun second chemin d'écriture, et la carte « Mémoire » du rail droit se rafraîchit toute seule. Ce qui est épinglé est un **extrait verbatim** (la section « Objectif » quand la réponse est structurée, sinon le texte, borné à 2000 caractères sur un mot) : résumer côté client fabriquerait une phrase que le copilote n'a pas écrite.

Socle d'architecture — PDF 1/9 du 19/08/2026 (`agent_docs/pdf1-architecture-globale-2026-08-19.md`) : le document ne décrit aucune chaîne métier, il pose ce qui est commun à toutes. Sept de ses dix décisions étaient **déjà tranchées** avant lecture (dont **D10 dans le sens INVERSE** : il propose d'exposer un « score de chance de closing » au commercial, or l'arbitrage n°4 du 16/08 interdit toute probabilité — un score de chance de closing _en est une_, et il n'a pas été construit ; ce qui EST exposé est un score d'ENGAGEMENT, décomposé, `null` quand rien n'est lisible). ⚠️ Ses marqueurs `[Confirmé — repo]` ne sont pas fiables : il décrit le dépôt d'AVANT le chantier CRM/ATS T0→T11 (il annonce « 3 rôles » là où il y en a 7, demande de créer `no_feedback`, `wired-write-paths.spec.ts` et le module `playbooks`, tous livrés). Ce qui en est sorti :

CRM interne — PDF 2/9 du 19/08/2026 (`agent_docs/pdf2-crm-interne-2026-08-19.md`, PR #991) : les objets commerciaux, leurs écrans et leurs déplacements. Quatre arbitrages de Louis, tous dans le sens le plus lourd, et c'est ce qui explique la taille du chantier.

**La granularité Compte / Entité / Site** existe enfin (`account_entities`, `sites`). Le PDF l'appelle « la source d'erreur n°1 quand on code un CRM pour une ESN » et la déclarait présente ; elle ne l'était pas — `contacts.entity` était un LIBELLÉ libre sans clé. ⚠️ `account_entities` porte les divisions du CLIENT, `legal_entities` les sociétés DE L'ESN : les ranger ensemble obligerait chaque lecture à filtrer un propriétaire étranger. `sites` n'est PAS un miroir du registre (un grand compte a plus de mille établissements, presque tous administratifs) : c'est une implantation que l'ESN RETIENT. Le rattachement d'un contact se réconcilie à la LECTURE, en un seul endroit : les contacts s'écrivent par six chemins, en brancher un par un garantirait d'en oublier.

**Les onze états d'un besoin sont EN BASE** (décision D13, contre la reco du PDF qui proposait de les dériver) : un recruteur MET un besoin en veille, il ne le déduit pas. Additif, jamais un renommage — `open` et `staffed` restent acceptées par la contrainte pendant que les données sont reprises. `cancelled` survit de plein droit : un besoin annulé par l'ESN n'est pas un besoin perdu chez le client.

**Deux portes de décision ont enfin un appelant** : G1 (`account_priority`, `accounts.priority_gate` — à ne JAMAIS fusionner avec `commercial_status`, ce sont deux axes) et G3 (`need_staffable`, `project_needs.staffable`). Toutes deux étaient déclarées au catalogue depuis le 19/08 et jamais franchies. L'interdit de G1 : `parked → prioritised` en un geste est REFUSÉ — un compte écarté repasse par la question, sinon le motif du refus disparaît au premier revirement. Le refus de G3 produit le seul chiffre qui dit à l'ESN ce qu'elle ne sait pas faire.

**Écrans neufs** : `/projects/needs` (BEL-CRM-101, la vue transverse des besoins ouverts, paginée serveur), `/actions/sequences` (BEL-CRM-103, statuts DÉRIVÉS — `canSend` porte enfin la vraie capacité d'envoi, le mensonge symétrique de celui que le §10.2 dénonce), `/settings/catalogues` (BEL-CRM-105, huit catalogues, usage compté PAR VALEUR, une valeur utilisée se désactive au lieu de se supprimer). Trois onglets ajoutés au dossier de compte : Projets, Preuves & REX, Partenaires.

**Le pipe se manipule au glisser-déposer** (`@dnd-kit/core`), et chaque dépôt ouvre le panneau du §8.5. La règle qui le protège : aucun envoi externe n'est pré-coché, et seul le niveau N1 peut l'être. Le retour arrière depuis `won` est BLOQUÉ quand une mission existe déjà.

**Les cinq fonctions pures que le PDF 1 avait nommées sans les écrire sont toutes livrées**, chacune avec un appelant réel : `effectsForMove`, `proofStrength`, `isProofUsable`, `partnerScore`, `rank1Recommendation`.

**Ce qu'on ne promet pas** : le score de chance de closing (§7.7 — l'arbitrage n°4 interdit toute probabilité, déjà refusé comme D10 du PDF 1), LinkedIn comme source de besoin (D12, déjà la règle du dépôt), le renommage du cycle de vie des contacts (§2.3 du PDF 1), les fenêtres de fraîcheur par type de signal, les 12 automatisations du §13 et les 13 KPI du §16. Raison de chacun dans le tracker.

- **Journal des portes de décision** (`apps/api/src/modules/decision-gates/`, table `decision_gate_crossings`, migration `1789512847391`) : les huit gestes que le produit ne franchit jamais seul, chacun adossé à un endpoint qui EXISTE déjà. Le champ qui justifie la table est `missing` — savoir six mois plus tard qu'on a clos une affaire sans budget, sans décideur et sans date est la seule chose qui explique le résultat. Une liste VIDE dit « rien ne manquait » ; « on n'a pas regardé » n'a délibérément aucune représentation. Le JOURNAL doit être écrit ou l'appel échoue (c'est l'audit) ; la trace de timeline est best-effort. Une trace INCOMPLÈTE est refusée (400) — un refus sans motif ou un « forcé » qui ne nomme aucun manque font croire qu'on saura relire. Branché sur deux gestes réels (clore un projet, armer un playbook) et inscrit dans `wired-write-paths.spec.ts`.
- **Registre des neuf flux inter-modules** (`packages/contracts/src/schemas/flow-registry.ts`) : déclaratif, versionné, et il DÉCRIT sans exécuter — ce qui lui permet de dire que **quatre flux sur neuf sont absents**, que trois sont partiels, et que quatre clés d'idempotence de la spécification (`source_url`, `signal_hash`, `criteria_hash`, `collected_from`) n'existent dans aucune colonne. Cinq gardes l'empêchent de devenir une brochure : un registre entièrement vert fait tomber la CI.
- **Cinq gardes d'architecture** (`apps/api/src/architecture/`, `packages/contracts/src/schemas/enum-additivity.test.ts`) : GA-05 (53 contrôleurs sur 98 sans permission déclarée — liste figée qui ne peut que rétrécir), GA-06 (critères protégés hors des moteurs de sélection — le seul des six interdits de l'IA qui n'avait AUCUNE garde, alors que `photo_url` est collecté), GA-07 (232 imports service→service figés ; la règle §3.2 vise le SERVICE, pas la composition de modules ni l'orchestration en contrôleur), GA-08 (aucune valeur d'enum ne disparaît, l'ordre ne bouge pas, les ajouts vont en fin — la référence est extraite APRÈS retrait des commentaires, une apostrophe française se lisant comme une chaîne), GA-09 (l'API est figée à **zéro** `any`, le web à 56).
- **Contrat de route unifié** (`packages/contracts/src/schemas/route-access.ts`) + `CapabilityBanner` : trois empêchements, trois GESTES différents (changer d'offre / demander l'accès / connecter un outil). Une capacité manquante **dégrade, elle ne ferme pas** — refuser l'écran entier cacherait tout ce qui marche. `no_integration` n'est déclaré que si AUCUNE capacité n'est là. Les onze bandeaux existants ne sont PAS migrés (chacun est monté dans un écran qui a ses tests).
- **RBAC** : deux rôles métier ajoutés EN FIN d'enum (`recruiter` — le vivier sans `messages:send`, un recruteur écrit depuis sa messagerie et n'a rien à faire dans les plafonds d'une campagne ; `finance` — la marge et l'abonnement, aucune écriture de fiche), et des **permissions additives par membre** (table `workspace_member_permissions`, migration `1789516204873`). `can(role, additional, permission)` est la fonction unique, consommée par les DEUX chemins serveur. Strictement additif : un « rôle moins une permission » se lit comme un rôle et se découvre le jour où quelqu'un est bloqué. ⚠️ Le backfill `member → sales` que prescrit le ticket est **REFUSÉ** : il révoquerait `integrations:manage` et `billing:manage` à tous les sièges historiques.
- **Cloisonnement de portefeuille** (D5, colonne `workspaces.portfolio_visibility`, migration `1789519437265`) : `open` par défaut — aucun espace existant ne change. En `restricted`, un commercial voit ce qu'il porte **et ce que personne ne porte** ; sans cette seconde moitié, la file des non-attribués se viderait pour tous sauf les responsables. Repli OUVERT en cas d'échec de lecture.
- **Multi-entité juridique** (D9, `apps/api/src/modules/legal-entities/`, migration `1789523841096`) : quelle société de l'ESN porte une mission et facturera le mois. **L'abonnement Bellum reste porté par l'ESPACE** — un contrat, un pool de crédits, un décompte de sièges ; le découper par entité serait un autre produit. Le rattachement porte sur les MISSIONS seules : un même client peut être servi par deux sociétés du groupe. On archive, jamais on ne supprime.
- **Board Missions à douze colonnes** (D2, `GET /delivery/board`) : une **VUE de projection** en lecture seule au-dessus des Projets et des Missions. Aucun nouvel état — dupliquer les étapes amont créerait deux vérités de pipe. On n'y déplace pas de carte : chaque carte porte son état d'ORIGINE, qui dit sur quel écran elle se déplace. `detected`/`potential` sont écartés mais COMPTÉS (`intakeCount`).
- **Six défauts trouvés en croisant, aucun demandé par le PDF** : deux digests périodiques échappaient à l'opt-out (`SuppressionService.isSuppressedForUser` porte désormais la règle une fois — un opt-out dans UN espace fait taire les envois périodiques partout ; seul l'e-mail est filtré, la notification in-app reste) ; `test-web` était dans `needs:` de la CI mais absent de la liste évaluée, donc 313 fichiers de test ne gardaient rien ; un projet pouvait être perdu sans motif alors que le contrat l'affirmait obligatoire ; le portefeuille d'un membre retiré restait orphelin ET verrouillé ; trois statuts de mission sur six affichaient une clé brute ; `stage_change` était déclaré, contraint en SQL et traduit, sans aucun producteur.

**Ce que le socle NE promet pas** : la migration des onze bandeaux existants, les cinq fonctions pures des domaines Capitalisation et Partenaire (qui n'existent pas — les écrire sans consommateur produirait le « livré mais jamais appelé » que ce chantier corrige), et les 21 routes nouvelles du §4.1 (leurs écrans sont spécifiés dans les PDF 2 à 8, non fournis).

ATS, back-office talent et vivier — PDF 3/9 du 20/08/2026 (`agent_docs/pdf3-ats-talent-vivier-2026-08-20.md`, PR #994) : le vivier cesse d'être une liste de fiches déclaratives pour devenir la matière d'un positionnement. Les décisions de Louis, toutes prises au maximum : la **nature** d'un talent est un champ séparé (`engagement_kind` — salarié / freelance / sous-traitant / candidat ; un sous-traitant **doit** porter son partenaire, sinon la fiche ne dit pas qui répond devant le client), les **coordonnées** sont stockées et masquables par rôle (`workspaces.hide_talent_contacts_from_sales`), les montants ne sortent qu'avec `finance:read` (RETIRÉS de la réponse, jamais mis à zéro — un zéro se lit comme une valeur), et **aucun binaire de CV n'est stocké** : on garde le TEXTE, on joint le dossier généré.

Ce qui porte le chantier : la **disponibilité est DÉRIVÉE** des affectations (`deriveStaffing`) et la ligne dit toujours d'où elle sort (« la fiche dit… », « une mission court jusqu'au… ») — une affectation sans date de fin n'annonce JAMAIS une libération ; la **revue de CV champ par champ** (12 détections) exige une CITATION du CV source pour chaque champ, et « Tout accepter » n'accepte que ce qui a une preuve ET une confiance haute (le §14 proposait 50 %, on a gardé la règle stricte — un seuil qui laisse passer du douteux transforme la revue en formalité) ; l'**anonymisation** d'un dossier client est calculée (40 cas de test — les particules gardent leur minuscule, `de La Fontaine` → `d. L. F.`) et le mode « anonyme » FORCE la règle initiales, quel que soit le réglage d'espace ; le **pool de réactivation** (7 segments) rend pour chaque profil la RAISON de sa présence ; le **consentement** distingue `none` (jamais recueilli) de `expired` — les confondre ferait croire qu'on a demandé.

⚠️ **Trois défauts trouvés en recette live après le merge, tous de la même famille** (PR #995, #996, #997) : un chemin d'écriture branché sur une table que personne ne lit. La fiche écrivait `consultants.stack` (liste libre, qui alimente le matching) pendant que tous les écrans neufs lisaient `consultant_skills` (typé, niveau + source) — deux champs, le même nom à l'écran, et « Aucune compétence saisie » sur une fiche qu'on venait de remplir. Les deux chemins (fiche et revue de CV) **sèment** désormais le référentiel typé, sans jamais écraser (`ON CONFLICT DO NOTHING`) ni supprimer — une compétence prouvée en mission ne retombe pas à « déclaré » parce que quelqu'un a réenregistré une fiche. Le niveau est **`inconnu`** (cinquième valeur, ajoutée en fin d'enum, contrainte CHECK élargie AVANT le code) : ces compétences arrivent sans niveau, et les écrire « autonome » afficherait devant un client une évaluation que personne n'a faite. Le **canonique sert au rapprochement, le libellé ÉCRIT s'affiche** (le référentiel range `postgresql` sous `sql` : utile pour trouver un profil, désastreux sur un dossier envoyé au client). Et la file d'alias, qui n'avait qu'un appelant, reçoit maintenant les termes inconnus de la fiche ET des CV validés — tant qu'un terme n'y est pas tranché, les profils qui le portent ne remontent sur aucune recherche.

**Ce qu'on ne promet pas** (raison dans le tracker) : le stockage du fichier CV d'origine, un score de matching présenté comme une probabilité, ~~la déduction d'une séniorité depuis un parsing (elle reste SAISIE — la déduire la rendrait fausse sur tous les CV sans dates)~~ **⚠️ CORRIGÉ le 27/08/2026 : cette promesse était FAUSSE depuis le chantier PDF 3.** La séniorité EST calculée, sur des dates réelles, et vaut `null` sans dates — `packages/contracts/src/schemas/cv-parsing.ts:26`, `apps/ia/app/prompts/bellum_cv_parse.py:62-63` (« “Lead” ne vaut pas huit ans »). L'intention de la promesse est tenue autrement : chaque champ cite son extrait, porte sa confiance, se revoit un par un, et « Tout accepter » est interdit en confiance faible (`canAutoAccept`). L'arbitrage est désormais au registre sous `c28_seniorite`, et l'anonymisation d'un CV que le studio n'a pas composé.

Matching besoin ↔ consultant et CV client — PDF 4/9 du 19/08/2026 (`agent_docs/pdf4-matching-cv-client-2026-08-20.md`, PR #999) : le classement d'un vivier contre un besoin, conforme aux obligations de transparence de l'AI Act. **Douze axes, tous DÉTERMINISTES** (arbitrage Louis du 20/08 contre la reco du PDF, qui en voulait deux « sémantiques ») : le document exige « deux exécutions identiques ⇒ classement identique » et « 0 crédit », et un appel de modèle par profil casse les deux. **Deux scores, jamais fondus** — la correspondance dit « ce profil colle au besoin », le poussable dit « ce profil peut partir chez ce client » ; « 92 / 31 » veut dire « parfait, indisponible jusqu'en novembre » là où un 61 unique ne dit rien. Un axe non évaluable SORT du dénominateur au lieu de valoir zéro, sinon le score mesure la complétude de nos données. **Quatre blocs** et non trois : `not_evaluable` (disponibilité inconnue, aucune compétence saisie) n'est PAS `excluded` — « je ne sais pas » n'est jamais « non ». **Onze motifs d'exclusion en liste fermée** (`EXCLUSION_REASONS`) : aucun profil écarté sans code, exigence de conformité et pas préférence d'interface.

Ce que le chantier a CORRIGÉ, et qui n'était demandé nulle part : le moteur historique lisait `consultants.stack` (texte libre) et jamais `consultant_skills` (typé, niveau + source) ; il matchait sur le libellé libre d'une `opportunities` et jamais sur `project_needs.skills[]` (typé, avec son caractère éliminatoire) ; il lisait la disponibilité SAISIE et jamais `deriveStaffing`. Trois lectures branchées sur une autre table que l'écriture — la famille exacte des trois défauts de la recette du PDF 3. Le référentiel déclarait au passage « Databricks » alias de « Spark » : `strictSameSkill`/`relatedSkill` séparent désormais les ALIAS (même compétence, autre écriture) des FAMILLES (produits distincts) — la RECHERCHE ne bouge pas (un profil PostgreSQL remonte toujours sur « SQL »), seul le matching cesse d'appeler « prouvé » ce qui ne l'est pas.

Le **journal** (`match_runs`, `match_run_entries`, `match_weight_versions`, migration `1789602918473`) fige les critères ET les poids employés : le besoin peut changer le lendemain, l'explication doit rester celle du jour du calcul. Son écriture est best-effort — une trace qui ferait échouer un matching transformerait une obligation de traçabilité en panne d'usage. `GET /needs/:id/match/explain` (+ `format=md`) RECALCULE depuis ces critères figés plutôt que de relire un cache : le classement étant reproductible, le document est fidèle par construction, et il ne porte la donnée d'AUCUN autre candidat. Un axe non évaluable s'y écrit « non évaluable », jamais « 0 ».

**GA-06 gagne un second périmètre**, plus strict : les fichiers qui CALCULENT un rang (`matching/axes|pushable|prefilter|engine.ts`) n'ont le droit de lire ni `full_name`, ni `address`, en plus des critères protégés. Le commentaire de la garde et le tracker du socle affirmaient déjà verrouiller `full_name` — c'était faux. `MatchCandidate` ne PORTE pas d'identité : les noms sont rattachés après le classement et voyagent dans la réponse, ce qui rend la garde tenable plutôt que déclarative.

**GA-06 gagne un TROISIÈME périmètre le 29/08/2026 — le PROMPT, et il a trouvé un défaut réel.** Les deux premiers relisent du CODE, et c'est leur angle mort : **un critère protégé peut peser dans un classement sans qu'aucune ligne ne le lise — il suffit qu'il soit dans le prompt qui note.** Mesuré : la graine de la phase 2 porte `photoUrl` (Apollo, `phase2_contacts.py:_apollo_hit_to_seed`) et partait TELLE QUELLE, sérialisée en JSON, dans `bellum_contacts` — le prompt qui attribue à chaque personne une priorité de 1 à 5, un rôle et un niveau d'influence — puis dans `bellum_organigramme`, qui reconstruit la chaîne de décision. Le modèle recevait la photo de la personne qu'on lui demandait de classer, sur le chemin LangGraph de production. Corrigé par `strip_protected_criteria` (`apps/ia/app/services/protected_criteria.py`), appliqué à la charge utile juste avant les deux prompts et rendant des COPIES : **la graine garde sa photo pour la FICHE du contact**, seul le chemin de notation la perd — l'interdit porte sur l'usage CLASSANT, jamais sur l'existence du champ. La garde est `apps/ia/tests/test_protected_criteria_scoring.py` : elle relit les quatre fichiers Python qui calculent un rang de personne (`contact_ranking`, `contact_priority_score`, `decision_role`, `hierarchy_level` — tenus au plus strict, `full_name` compris) ET **exécute la vraie phase 3** avec une graine empoisonnée pour lire le texte réellement envoyé au modèle. Deux exceptions NOMMÉES dans la charge utile d'un prompt, parce qu'une garde qui interdit trop est désarmée en une semaine : l'identité (le livrable DÉSIGNE la personne, et la réponse se recolle à sa graine par le nom) et la ville / le pays (le PDF 9 §6.2 interdit l'adresse « au-delà du code postal » ; un site de travail est plus grossier qu'un code postal). Au registre sous `c58_criteres_proteges`, dont le `gap` nomme ce qui reste ouvert : rien n'interdit de DÉDUIRE un critère protégé plutôt que de le lire.

**Langues et habilitations** (migration `1789601472836`) : deux axes et deux motifs d'exclusion en dépendaient sans qu'aucune table ne les porte. Colonnes additives, vides par défaut → axe non évaluable, jamais un zéro qui se lirait « ne parle aucune langue ». Un niveau non reconnu à la saisie est IGNORÉ plutôt que rapproché du plus proche (« en:courant » ne devient pas « en:c1 »). `availability_checked_at` arrive avec, sans quoi la pénalité de fraîcheur (> 60 j) du score poussable ne pouvait jamais se déclencher.

**Shortlist** (`shortlists`, `shortlist_entries`, migration `1789604173952`) : plafond 5, fiches courtes RECOPIÉES et non jointes au vivier (une jointure raconterait ce qui est vrai aujourd'hui, pas ce que le client a reçu), et AUCUN `update` — modifier, c'est dupliquer. Le serveur rejoue le classement au lieu de croire les scores du navigateur.

**Porte G4** enfin franchie : positionner journalise ce qui MANQUAIT au moment de décider (`force` quand il restait des points d'attention — ni un accord, ni une faute). Un consentement expiré REFUSE, et c'est le seul cas ; un refus antérieur chez ce client n'empêche rien, il s'affiche et se journalise. `GATE_SUBJECTS` gagne `consultant` (fin d'enum, migration `1789605284617` AVANT le code). `submissions.pushable_score` conserve le score au moment du geste — sans lui la calibration n'a rien à corréler.

**D21** (migration `1789606341728`) : `workspaces.show_rate_in_client_message`, **éteint par défaut**. Un TJM annoncé dans le premier message devient un plafond. Réglage illisible ⇒ on n'annonce pas de tarif : le repli d'un réglage qui fait sortir un montant vers un client ne peut pas être « montre-le ». **D22** : seuil de « recommandé » paramétrable par espace, défaut 60.

**Ce qu'on ne promet pas** (raison de chacun dans le tracker) : un score présenté comme une probabilité (déjà refusé trois fois), le score montré au client (D24), le matching sur un vivier externe (D25, V3), la ligne finale du §8.1 (elle demanderait un modèle sur un module qu'on vient de rendre déterministe — les deux scores côte à côte disent la même chose), le repli sur « le contact de facturation » (la notion n'existe nulle part, et prendre un contact du compte enverrait le dossier d'un candidat à la mauvaise personne), les relances J+3/J+7 comme envois automatiques (ce sont des tâches), et les points d'entrée 4, 5 et 6 du §5 — le copilote ne sait pas résoudre un besoin par son libellé, la chaîne « offre détectée → besoin » suppose que le pipeline écrive dans une table qui n'est pas la sienne, et un appel d'offres ne porte aucune notion de « profil requis ».

Missions, relevés d'activité et facturation — PDF 5/9 du 19/08/2026 (`agent_docs/pdf5-missions-cra-facturation-2026-08-20.md`, PR #1007) : ce qui se passe APRÈS la signature. Le croisement a surtout trouvé six chemins morts que le document ne demandait pas, tous de la famille « livré, testé, et que rien n'appelle ».

**La case qui ne faisait rien.** « Créer la mission » était pré-cochée depuis le premier jour sur un projet gagné, et le client jetait la liste au moment d'envoyer (`onConfirm({ reason })` ne gardait que le motif). Aucune mission n'a jamais été créée par ce chemin, et rien ne pouvait le révéler — « pas de mission sur ce projet » a exactement l'air d'un projet dont personne n'a créé la mission. Chaque proposition porte désormais `performedBy` : deux sont exécutées par le SERVEUR (`create_mission`, `park_account` — avec le motif de la perte, pour ne pas en redemander un), toutes les autres sont des RAPPELS et l'écran les nomme ainsi. Une clé inconnue du serveur devient un rappel plutôt que d'être jetée.

**Le relevé écrasé.** L'unicité de `mission_timesheets` portait sur (mission, mois) : deux consultants sur une même mission déposaient deux relevés, et le second effaçait le premier sans un mot — un mois entier de facturation disparaissait. La maille est désormais **mission × consultant** (migration `1789691847302`, index avec `COALESCE` sur l'uuid nul — un NULL en index d'unicité laisserait passer des doublons).

**Trois statuts de relevé de plus** (`expected`, `missing`, `not_required`, ajoutés EN FIN d'enum) : « attendu » n'est pas « manquant » — relancer quelqu'un pour un mois qu'il n'a pas fini de vivre est la meilleure façon de faire ignorer les relances suivantes — et un FORFAIT n'a pas de relevé, sinon l'alerte ne se résout jamais et apprend à ignorer les autres. `expectsTimesheet(kind)` (régie seule) et `invoicingNeedsTimesheet(kind)` (tout sauf forfait/recrutement) répondent à deux questions différentes : ne pas relancer sur un contrat de nature inconnue est prudent, le déclarer « prêt à facturer » sans relevé ne l'est pas du tout.

**L'écart négatif.** Un relevé à 12 jours sur un mois à 23 passait « prêt à facturer » : seul un écart POSITIF produisait une anomalie. Il bloque maintenant dans les deux sens, sauf s'il est EXPLIQUÉ — et l'explication ne masque pas le nombre, elle l'accompagne. Un écart INCONNU ne bloque rien : arrêter la facturation d'un espace qui ne renseigne pas ses jours fériés ferait débrancher la garde. Les jours attendus tiennent compte des bornes de la mission (`expectedWorkingDaysInWindow`) et la charge est FIGÉE au dépôt : un jour férié ajouté demain ne rouvre pas l'écart d'un relevé déjà validé.

**Le total qui mentait.** `summarizeReadiness` additionnait PRÊT et BLOQUÉ. Un mois bloqué n'est pas de l'argent qu'on va facturer, c'est de l'argent qu'on ne PEUT pas facturer : `blockedAmountCents` est désormais séparé. Trois bloqueurs s'ajoutent (`missing_billing_contact`, `missing_start_date`, `unexplained_gap`) et `BLOCKER_ACTIONS` nomme le geste et l'écran de chacun. « Marquer comme facturé » enregistre référence, montant réel et échéance (migration `1789693128476`) — sans eux, aucun retard n'était calculable. Export CSV point-virgule + BOM + euros à la virgule (`readiness-export.ts`), cellule VIDE plutôt que « N/A ».

**Les quatre chiffres d'affaires** (`revenue.ts`) — signé, produit, facturé, encaissé — ne se fondent JAMAIS : un « CA du mois » unique est le chiffre le plus dangereux d'un outil commercial, parce que chacun croit qu'il parle du sien, et l'écart entre eux est justement l'information. Le SIGNÉ vient du montant du PROJET et de nulle part ailleurs : estimer « TJM × durée » produirait un chiffre inventé qui varierait selon qu'on compte 20 ou 21 jours. Marge : `null` jamais 0, `aggregateMargin` pondérée par les JOURS (une mission d'un jour ne pèse pas comme une mission d'un an), seuil d'alerte par espace ÉTEINT par défaut.

**Deux scores de mission** (`mission-scores.ts`) sous la règle du matching : `MIN_AXES_FOR_SCORE = 3`, axes non évaluables NOMMÉS, dénominateur = axes réellement évalués. Aucun n'est une probabilité (quatrième refus de l'arbitrage n°4). Prévisionnel en **trois lignes non pondérées** (acquis / probable / espéré) ; capacité `null` plutôt que 0 — « 0 jour à vendre » se lit « tout le monde est staffé ».

**Écrans** : `/missions/board` (douze colonnes, agrégats, déplacement qui écrit sur l'objet d'origine — la décision D2 tient, ce qu'elle interdit est un troisième jeu d'états, pas le geste), `/missions/cra`, `/missions/facturation`. Des ROUTES et non des onglets cachés : les notifications de routine y pointent. Trois routines ajoutées (`timesheet_chase`, `invoice_readiness`, `margin_alert`) via un point d'entrée unique `DeliveryRoutinesService` — zéro règle recopiée, et GA-07 ne monte pas.

**`finance:write`** (D36) en fin d'énumération, et `@RequirePermission` accepte désormais **plusieurs permissions dont l'UNE suffit** : c'est ce qui ouvre la facturation au rôle Finance sans la retirer aux sièges historiques, comme le backfill `member → sales` avait déjà été refusé sur le socle. Le canal d'une relance est une CONCLUSION tirée de ce qui est branché (`resolveChannel`), jamais un réglage, et une garde de langage refuse « brouillon Teams » : une messagerie d'équipe n'a pas de brouillon, et l'écrire laisse quelqu'un attendre un envoi qui ne partira jamais.

**Ce qu'on ne promet pas** : l'émission de facture et Factur-X (D32), le rapprochement bancaire (D33), la pondération probabiliste du prévisionnel, une marge estimée, les candidats dans la capacité (D34), les 22 étapes de l'OS de référence dont le connecteur n'existe pas, le DSO tant que les paiements n'ont pas d'historique réel, et **la suppression d'une mission** — l'effacer emporterait l'historique de facturation qui s'y accroche ; le prix assumé est qu'une mission créée par erreur reste, et les deux panneaux le DISENT avant le clic.

⚠️ **`UPDATE … RETURNING` ne se lit jamais à la main** (trouvé en recette du PDF 5, `apps/api/src/database/returned-rows.ts`) : TypeORM rend `[lignes, nombre]` pour un `UPDATE`/`DELETE` et `lignes` pour tout le reste, si bien que `rows[0]` donne le TABLEAU des lignes — « truthy », donc tous les `if (!row) throw NotFound` passent et chaque champ vaut `undefined`. Onze endpoints étaient dans ce cas depuis des mois sans qu'un test tombe, parce que le web ne lit pas ces réponses : il ré-interroge. Conséquences réelles : la trace `stage_change` de la timeline n'a jamais fonctionné, `updateRelationshipMemory` rendait toujours `null`, et `linkAction` répondait toujours « lié ». Passer par `returnedRows` / `firstReturnedRow` / `returnedCount` ; une garde (`returned-rows.spec.ts`) refuse les nouveaux appels qui l'oublieraient. Corollaire du même incident : **TypeORM IGNORE une condition `undefined`** — `findOne({ where: { id: undefined } })` rend la première ligne, donc un identifiant absent se refuse AVANT la lecture, jamais après.

Automatisations, chaînes et requêtes — PDF 6/9 du 19/08/2026 (`agent_docs/pdf6-automatisations-requetes-2026-08-21.md`, PR #1008) : le format d'une automatisation, le moteur de chaînes, le plafond de proactivité et les outils du copilote. 189 exigences inventoriées — 37 livrées, 87 partielles, 64 absentes — et **neuf défauts que le document ne demandait pas**, dont quatre dans la livraison du PDF 5 faite la veille.

**Le compteur de proactivité** (`packages/contracts/src/schemas/proactivity.ts`, migration `1789781294638`) : vingt-sept routines pouvaient notifier le même matin, chacune raisonnable prise seule, et personne ne comptait le total — après quoi l'utilisateur les coupe TOUTES, y compris celles qui lui font gagner une affaire. Trois messages proactifs par jour, réglable de 1 à 5 **par utilisateur** (`notification_preferences.proactivity_cap`, décision D40) : un commercial et un recruteur n'ont pas la même tolérance au bruit. La priorité MULTIPLIE impact × urgence × capacité d'agir — un facteur à zéro met le score à zéro, parce que « rien à en faire » suffit à ne pas déranger même sur un sujet grave et pressant ; une somme aurait laissé passer les deux. Ce qui dépasse est **SUPPRIMÉ, jamais mis en file** (une file reporte le bruit au lendemain et le double) mais reste VISIBLE dans le centre d'actions : ce qu'on supprime est l'interruption, pas l'information. Deux exemptions qui ne se confondent pas : un ÉCHEC passe toujours (l'utilisateur a le droit de savoir qu'une action a raté) et ce qu'il a lui-même déclenché passe aussi (ça ne l'interrompt pas, ça lui répond). Le plafond vit dans `createNotification` et **nulle part ailleurs** — une garde refuse qu'un module en décide dans son coin. Un plafond illisible laisse PASSER : mieux vaut une notification de trop qu'un message important avalé par une panne de compteur.

**Le moteur de chaînes** (`packages/contracts/src/schemas/chain.ts`, `apps/api/src/modules/chains/`, migration `1789789341052`, écran `/actions/chaines`, décision D43) : sept chaînes ordonnées au-dessus du pipe, qui répondent à « où ça coince dans le PROCESSUS » quand le pipe ne dit que l'étape commerciale. **Ce n'est PAS un troisième moteur d'exécution**, et c'est la seule façon de le livrer sans contredire le dépôt : une chaîne n'appelle aucun connecteur, n'envoie rien, ne débite rien — avancer est un geste d'utilisateur. `nextPosition` est PURE : une porte SANS réponse ne fait jamais avancer (c'est ce qui rend la décision en attente visible), un NON renvoie en AMONT (une chaîne qui échouerait vers l'avant ferait disparaître les dossiers qu'on voulait rattraper), la dernière position ne boucle pas. `chainProblems` refuse une chaîne mal formée avant qu'elle ne serve. **Une seule table** là où le document en décrit quatre : les trois autres décrivent le CATALOGUE, qui vit dans le code (D42 — un espace ne crée pas ses chaînes en V1). ⚠️ Le §6.1 annonce **142 étapes et n'en décrit aucune** : 54 sont livrées, chacune adossée à un geste réel ; les 88 autres attendent une capacité (badge, VPN, matériel, moteur de recommandation…) et le tracker dit laquelle. **Trois portes ajoutées en fin d'énumération** (`interview_go`, `proof_sufficiency`, `delivery_risk`) : les G5-G8 du document désignent autre chose que les nôtres, et renommer casserait `decision_gate_crossings`, qui est un journal d'AUDIT (D46).

**Six outils copilote** (`apps/ia/app/services/chat_tools.py`, D44) : le copilote avait douze outils — messagerie, agenda, comptes, contacts — et AUCUN sur le vivier, les missions, le CRA, la facturation, les preuves ou les interventions, c'est-à-dire tout ce que les PDF 3, 4 et 5 venaient de livrer. Sur les vingt requêtes du jeu de recette minimal, **deux** étaient exécutables ; quatorze avaient déjà leur API et leur écran. Les six passent par le pont interne existant (`copilot-bridge/`) avec ses trois verrous inchangés ; un test énumère ses méthodes publiques et tombe si quelqu'un y ajoute un verbe d'écriture — c'est ce qui justifie de les classer « lecture ». Le **coût chargé d'un consultant n'en sort jamais** : `finance: false` est passé en dur, parce qu'un appel interne n'a aucun rôle à faire valoir. Ajoutés en FIN de liste : insérer au milieu invaliderait le préfixe d'outils mis en cache. `get_thread` reste REFUSÉ — le corps des messages ne sort pas de la messagerie. ⚠️ **Recette live (PR #1009)** : l'outil vivier tombait à 100 % des appels — le pont composait sa requête à la main, en `as never`, sans `skills` ni `page`, et `TalentService.search` fait `query.skills.map(…)`. Le `as never` avait éteint le typage du contrat, le test regardait l'argument avec `expect.anything()`, et le service était mocké : rien ne pouvait tomber. Une requête de service se compose désormais avec `schema.parse({…})` (les défauts arrivent avec, et `.strict()` refuse un champ inventé) et le test PARSE l'argument réel. Corollaire de la même famille : `endingWithinDays` était déclaré et jamais lu, si bien que le copilote titrait « sous 30 jours » au-dessus d'une liste qui allait à J+60 — un paramètre d'outil ignoré en silence rend une réponse qui a l'air d'avoir répondu.

**La résolution de canal** (`reminder-channel.ts`, ticket P0) : trois canaux, trois libellés, trois promesses. « Créer les brouillons » promet qu'on relira ; « Préparer les messages » dit qu'on ne relira PAS dans son outil et que c'est **IRRÉVERSIBLE** ; « Créer les tâches » dit que rien ne part. Une garde d'i18n refuse le mot « brouillon » dans la confirmation d'un canal qui envoie. Quatre défauts corrigés au passage : un webhook générique était pris pour une messagerie d'équipe, un brouillon était annoncé sans vérifier la portée du jeton, le canal « message d'équipe » n'avait aucun émetteur, et `sendsImmediately` — la garantie centrale du §5.2 — n'atteignait aucun écran.

**Le journal d'envoi** (`activities.channel` et `activities.verdict`, migration `1789784612907`) : la table était remplie par la synchronisation de LECTURE — on y retrouvait les messages relus, jamais ceux qu'on avait préparés, et « ai-je déjà relancé ce client, par quel canal » n'avait aucune réponse. Un brouillon est journalisé `drafted` et non `sent` : rien n'est parti. Le corps du message ne va PAS au journal.

**Les états de capacité** : `deriveCapabilityState` dérivait huit états avec un ordre d'urgence justifié et un test complet — **son seul appelant était son propre test**. Branché dans le registre d'outils (`capability_state` sur `ConnectedTool`), le seul endroit qui connaisse à la fois le statut, les portées et la dernière activité. La routine `connector_health` notifie sur un CHANGEMENT d'état, jamais en rappel quotidien (l'idempotence porte sur l'état, pas sur la date). La synchronisation en retard n'alerte pas : elle se rattrape seule.

**Les douze attributs** (`routineDefinitionSchema`) : le catalogue des routines en portait UN — sa clé ; les autres vivaient dans le corps des exécuteurs, là où personne ne les lit avant de cliquer sur « activer ». Niveau d'autonomie (jamais au-delà de N4, verrouillé), condition, donnée lue, fallback, critère d'acceptation. Une garde refuse un champ rempli de vide — ce qu'un type ne voit pas.

**Ce que le PDF 6 NE promet pas** : `get_thread`, les 60 automatisations au complet (26 routines existent, et la règle du catalogue est « n'y figure que ce qui tourne réellement »), le renommage des portes G5-G8, les 285 requêtes comme jeu d'entraînement (le produit n'entraîne aucun modèle), la bibliothèque `/chat/commandes`, le routeur d'intentions en code et les 4 verdicts en enum — les trois derniers reportés avec leur raison au tracker.

Dette des six chantiers PDF, traitée le 21/08/2026 (`agent_docs/dette-pdf1-6-2026-08-21.md`, PR #1011 → #1013) : les six trackers mélangeaient par nécessité trois choses différentes — ce qui est faisable, ce qui attend une capacité, et ce qui contredit une règle. Le tri les sépare, et Louis a tranché huit décisions (D47 à D54).

**Copilote** : les sept lectures qui manquaient aux vingt requêtes prioritaires (`find_needs`, `run_matching`, `get_mission_risks`, `list_reactivation_pool`, `search_rfps`, `list_accounts_to_act`, `prepare_day_brief`) — `find_needs` débloque au passage le point d'entrée 4 du PDF 4, refusé à l'époque parce que le copilote ne savait pas RÉSOUDRE un besoin par son libellé. **La bibliothèque de commandes** (`/chat/commandes`, 24 commandes) était différée pour une raison précise : elle annonce ce que le copilote sait faire, et à l'époque deux requêtes sur vingt étaient exécutables. Le clic ENVOIE (`?ask=`, distinct de `?prompt=` qui pré-remplit) parce que la phrase exacte est affichée sous le libellé — la relecture a déjà eu lieu. **Le routeur** (D53) sort du prompt les deux étapes dont l'erreur est invisible : la vérification de capacité est IMPOSÉE en code (`tools_for` retire les outils dont le connecteur manque — on ne propose pas ce qu'on ne voit pas) et la clarification est bornée à UN tour avec 2-3 options cliquables, l'outil étant RETIRÉ au second (retirer ferme la porte, prier le modèle la laisse ouverte). **Les quatre verdicts de recette** outillent enfin la distinction que le §9.3 qualifie de capitale : `FAIL` = bug produit, `BLOCKED` = configuration manquante — les confondre fait chercher un bug dans un connecteur jamais branché.

**Fenêtres de fraîcheur par TYPE de signal** (D50, `signal_freshness.py`) : neuf fenêtres au lieu d'une seule de 24 mois — recrutement 180 j, incident 180 j, nomination/budget/restructuration 365 j, projet/acquisition/partenariat 545 j, réglementation 730 j. La sûreté tient à une ligne : **un type absent ou inconnu retombe sur les 730 jours historiques**, donc aucun signal non typé ne change de classement.

**Exclure un contact** (D51, `contacts.excluded_at` + `exclusion_reason`, migration `1789900000001`) : l'état `rejete` vivait dans l'énumération du cycle de vie depuis des mois et son drapeau n'était JAMAIS posé. Tout siège peut écarter (celui qui découvre qu'un contact a quitté l'entreprise est celui qui travaille dessus), le motif est OBLIGATOIRE, et **les séquences en cours s'ARRÊTENT** — continuer d'écrire à quelqu'un qu'on vient d'exclure est la faute la plus visible qu'un outil de prospection puisse commettre. Le contact est marqué AVANT l'annulation : l'ordre inverse laisserait une fenêtre où une relance part.

**Ce qui n'est pas mesurable le DIT** (D52, `measurability.ts`) : le dépôt savait dire « non mesuré » plutôt qu'un zéro, sans dire pourquoi ni quand ça viendrait — et un écran muet fait chercher une panne. `GET /delivery/finance/dso` rend « non mesurable — 3 factures sur les 10 nécessaires ». Le DSO est une MÉDIANE (une facture payée après relance judiciaire ne déplace pas le portefeuille), écarte les impayées (elles ont un retard, pas un délai) et compte à part ce qu'il ne peut pas dater.

**Besoins PROPOSÉS par l'analyse** (D49, `need_proposals`, migration `1789900000002`) : le point d'entrée 5 du PDF 4 était refusé parce que le pipeline aurait écrit dans `project_needs`. Le service vit dans `analysis/` — **le producteur possède la table** — et la DÉCISION passe par un contrôleur. `source_url` est la clé d'idempotence : une même offre relue ne produit pas dix propositions.

**Lecture de CV** (D47, env-gated strict) : `OCR_API_KEY` (+ `OCR_API_URL`, `OCR_MODEL`) — sans clé, aucune requête ne part, et un OCR qui échoue ne remplace RIEN. Le `.doc` est tranché par sa SIGNATURE et non son extension : un RTF déguisé est lu (parcours à la pile — une regex laisse passer « Arial; » au milieu d'un CV), un vrai Word 97 OLE est REFUSÉ avec son geste de réparation. La langue d'un CV est détectée en CODE (`cv_language.py`) : un modèle rend parfois « anglais » sur un CV français truffé d'anglicismes, et l'erreur déplacerait tout le parsing ; `None` n'ajoute aucune consigne, donc un CV français garde un prompt byte-identique, et la CITATION reste dans la langue d'origine — traduite, la garde anti-invention viderait le dossier.

**Étapes hors outil** (D48, `chainStepSchema.outsideTool`) : les 14 étapes de l'OS de référence écartées faute de connecteur (badge, VPN, matériel, comptes applicatifs, restitution des accès) rejoignent la chaîne d'onboarding. Ce n'est pas un reniement de « n'y figure que ce qui tourne réellement », c'est sa moitié manquante : **le produit s'interdit de PRÉTENDRE exécuter, pas de SUIVRE.**

**Neuf KPI CRM au back-office** (`analytics/crm-kpis.ts`) et **cinq automatisations du §13** (`stalled_projects`, `stale_account_plans`, `needs_without_shortlist`, `parked_account_signal`, `contact_job_change`) : ce qui a changé n'est pas la règle mais le dépôt — la porte G1, les shortlists, les besoins typés et `stage_entered_at` existent maintenant. Toutes en N1. La non-staffabilité porte sa RÉPARTITION, et une répartition vide est ABSENTE plutôt que `{}` — un objet vide se lirait « aucune cause ».

**Référentiel de compétences partagé** (D54, `skill_alias_library`, migration `1789900000003`) : un couple de TERMES techniques voyage entre espaces, rien d'autre. **Jamais appliqué d'office** — « ELK » ne veut pas dire la même chose chez une ESN cyber et chez une ESN data ; `workspaces_approved` n'est pas une statistique mais l'argument montré à celui qui décide.

**Surveillance de l'espace documentaire** (D55, routine `cv_folder_watch`, `ZeroLayerService.findRecentCvs`) : les CV déposés dans Drive ou OneDrive sont SIGNALÉS, jamais ingérés — un CV avalé sans que personne le sache créerait une fiche de vivier, avec ses données personnelles, sur la seule foi d'un nom de fichier. La recherche porte sur le NOM et non le contenu (chercher « CV » dans un Drive entier remonterait chaque compte rendu qui mentionne le mot), et un fichier sans date de modification est GARDÉ : « je ne sais pas quand » n'est pas « c'est vieux ».

⚠️ **Le cliquet GA-07 est passé de 232 à 233 le 21/08**, par arbitrage explicite de Louis — première et seule montée. Le commentaire de `module-boundaries.spec.ts` porte la date, la raison et la CONTREPARTIE chiffrée : `routines.service` importe quatre services (messagerie, agenda, ATS, CRM) uniquement pour lire un statut de connecteur que le registre d'outils sait rendre ; le refactorer rend **3 places d'un coup**. La nuance à préserver y est nommée — le registre dit qu'un outil est _opérationnel_, pas qu'une PORTÉE de lecture est accordée (`capabilities.read`), et confondre les deux ferait tourner des routines muettes. C'est le premier endroit à regarder pour redescendre.

**Processus complets** (D56) : les sept chaînes portent désormais 92 étapes, dont les gestes que l'humain fait ailleurs — introduction obtenue, soutenance, audit fournisseur, référencement, négociation. **Cinq KPI de matching** (D57, `analytics/matching-kpis.ts`) : `measurability` les rend livrables AVANT l'historique — sous le seuil, l'écran dit combien d'observations manquent, et `value` reste `null` même quand le calcul rendrait un nombre (un taux sur deux positionnements vaut 0 % ou 100 %, et les deux sont faux).

Dashboards managers et pilotage — PDF 8/9 du 19/08/2026 (`agent_docs/pdf8-dashboards-pilotage-2026-08-22.md`, PR #1019) : le document tient en une phrase — « un dashboard sans action possible est une page de reporting, pas un cockpit ». Le croisement en a donné une seconde, qui décrivait le dépôt : **beaucoup est calculé, et presque rien n'est montré**. D'où l'arbitrage de Louis : **brancher d'abord, ajouter ensuite**.

**L'écran de pilotage s'ouvrait EN ROUGE sur un espace neuf.** Un zéro alertait sans qu'on regarde l'amont, si bien que la moitié des maillons criait sur un espace qui n'avait simplement rien fait encore — le premier écran qu'un client voit lui apprenait que le rouge ne veut rien dire. Un zéro n'alerte plus que si l'amont a du flux (`flowStatus`) ; un STOCK à zéro (vivier, clients) reste **neutre** et non faussement vert, parce que le faux vert est le plus dangereux des deux : personne ne va vérifier un indicateur qui se dit sain. Un taux sans dénominateur vaut `null` et non « 0 % ». `pilotageCoverage` donne à l'écran la phrase qui explique la mosaïque (décision **D66** : pas de seuil d'activation — chaque indicateur sait déjà dire `non_mesure` pour lui-même).

**Le corps d'un message ne sort qu'à son auteur** (**D65**) : `GET /activities` le rendait à tout l'espace, sans permission — le 21/08 avait fermé la lecture croisée des BOÎTES, la timeline recopiait le même contenu par l'autre bout. Canal, objet, date, verdict et auteur restent visibles, et l'écran DIT que le contenu est masqué (`bodyRedacted`) plutôt que de laisser un blanc, qui se lirait « cet échange n'a pas de contenu ».

**Le pilotage est gardé par `team:manage`** et non par un rôle en dur : `sales_ops`, dont la définition même est « commercial + gestion d'équipe », était refusé, et les permissions accordées membre par membre étaient ignorées.

**GA-12 — les contraintes SQL couvrent leur énumération TypeScript** (`architecture/check-constraints-cover-enums.spec.ts`) : GA-08 gèle le TypeScript, GA-11 empêche un `CHECK` de rétrécir, **personne ne comparait les deux**. Trois pannes VIVANTES en sont sorties : `accounts.status = 'prospect'` (« Ajouter au portefeuille » écrivait une valeur qu'aucune des cinq déclarations n'a jamais autorisée → **bouton mort depuis des mois**, message d'erreur générique), `finance:write` accordable à personne, et trois portes de décision impossibles à journaliser. ⚠️ Sa première version ne lisait que `ADD CONSTRAINT` — 27 contraintes sur 83 : **une garde qui ne voit qu'un tiers du sujet passe au vert sur les deux autres**. Douze contraintes lui restent hors de portée (union de littéraux ou `z.enum` imbriqué) ; la table le dit, et extraire le tableau suffit à les faire entrer.

**Ce qui était calculé et affiché nulle part** obtient un écran : les cinq lectures financières (`FinancePanel` sur `/pilotage` — quatre chiffres d'affaires jamais additionnés, prévisionnel en trois lignes non pondérées, capacité, marge, délai de paiement) et les trois familles de KPI (CRM, matching, qualité) **au back-office**, où l'arbitrage des 31/07 et 03/08 les range et qui n'est pas renversé.

**La marge par CANAL** (§5.3, « l'indicateur le plus stratégique ») : `mission_commercial_terms.channel` (migration `1789990000004`), **saisi et jamais déduit** — un partenaire connu sur le compte ne dit pas que CETTE mission est passée par lui, et un canal deviné produirait l'écart chiffré sur lequel on lance un chantier de référencement d'un an. Pondérée par les JOURS ; `unknown` compté à part ; `intermediationCost` vaut `null` dès qu'un des deux termes manque.

**Le dictionnaire de 60 indicateurs** (`manager-kpi.ts`) : six familles, sept attributs obligatoires dont la DÉCISION — « un KPI sans décision associée est une décoration ». Les huit qu'on ne sait pas calculer restent LISTÉS avec `measurable: false` et la raison écrite (le tracker du PDF 8 en annonçait quatorze — recompté le 25/08 : `pending()` est appelé huit fois). Il ne porte AUCUNE valeur : les chiffres vivent là où ils sont calculés, et un second jeu ferait douter des deux.

**La vue Qualité des données** (`GET /pilotage/hygiene`) est côté application et non au back-office : « 7 comptes sans prochaine action » n'est pas un jugement sur quelqu'un, c'est du travail à faire. Huit lignes, chacune un LIEN vers la liste — « un indicateur de qualité qui ne mène nulle part ne sert à rien » — et une garde vérifie chaque destination contre l'arbre de routes réel. Chaque compte est lu SÉPARÉMENT : un `Promise.all` ferait disparaître les huit parce qu'une seule requête a raté.

**Les cinq rituels** (`ritual.ts`, catalogue en CODE) : ordre du jour, durées, et les chiffres à ouvrir sur chaque point. Un ordre du jour plus long que la durée annoncée fait échouer la CI. **Ni séance, ni chronomètre, ni compte rendu** — le dépôt a déjà deux journaux de décision (les portes et la file d'intervention), un troisième ferait un troisième endroit où chercher.

**La file d'intervention** se classe par gravité × âge PLAFONNÉ (sans plafond, une alerte oubliée depuis six mois dominerait la file pour toujours), montre cinq cartes et ANNONCE ce qu'elle replie, et **exige un motif pour clore** — accuser réception n'exige rien, les deux gestes ne disent pas la même chose.

**Le classement de proactivité classe enfin** : `decideProactivity` était appelé avec UN candidat, donc son tri ne triait rien — le premier message de la journée gagnait sa place quelle que soit son importance. Le balayage des routines dépose un LOT, arbitré une fois (`createProactiveBatch`).

**Ce qu'on ne promet pas** : le chronomètre et le compte rendu de rituel, les « champs en conflit » du §6.3 (`field_provenance` dit d'où vient une valeur, jamais qu'une autre source en propose une différente), le score de chance de closing (5ᵉ refus), le prévisionnel pondéré (6ᵉ), un dashboard Recruteur dédié (**D64**), une source d'absences pour `rep_inactive` (**D68** — aucun SIRH connecté, le seuil de 14 jours compense déjà), et l'historisation des indicateurs, reportée avec sa raison : la poser sans consommateur produirait la table vide que ce chantier passe son temps à corriger.

Audit final — PDF 9/9 du 19/08/2026 (`agent_docs/pdf9-backlog-claude-code-2026-08-22.md`, PR #1020) : le document ne spécifie rien, il consolide les 45 tickets des huit précédents. Le chantier est donc un AUDIT — et ses quatre décisions « bloquantes » (D2, D3, D4, D13) étaient toutes tranchées et livrées, D13 **à l'inverse** de sa recommandation (les onze états de besoin sont EN BASE : « un recruteur MET un besoin en veille, il ne le déduit pas »).

**Douze défauts trouvés en croisant, dont quatre qui se ressemblent** : un chemin conforme livré à côté d'un chemin ancien qu'on a laissé vivre. Le dépôt savait détecter « du code qui écrit sans appelant » ; il ne savait pas détecter « un appelant qui emprunte encore l'ancien chemin ».

**Un timeout n'est plus un échec** (`packages/contracts/src/schemas/dispatch-failure.ts`) : le contrat du routeur d'actions déclarait `unknown` depuis le premier jour, avec sa raison — « replier un timeout dans `failed` rejouerait une action peut-être déjà faite ». Le code faisait exactement ce que son commentaire interdisait, et **aucun `unknown` n'était produit nulle part en production**. La seule question qui compte : la requête a-t-elle pu PARTIR ? Une connexion jamais établie (DNS, port fermé, certificat) est un échec — on peut rejouer ; un distant qui répond, fût-ce pour refuser, est un échec ; une requête partie sans réponse est un `unknown`. ⚠️ `UND_ERR_CONNECT_TIMEOUT` contient le mot « timeout » et n'en est pas un au sens qui compte : c'est un délai d'ÉTABLISSEMENT.

**La marge d'une mission ne sort qu'avec `finance:read`** : `GET /delivery/missions` la décorait sans condition — à tout membre, `viewer` compris — et le copilote la relayait au modèle, pendant que le board, le vivier et le matching la retiraient. `canReadFinance` est un paramètre OBLIGATOIRE de `DeliveryService.list` : un appelant qui l'oublie est refusé par le compilateur, et c'est ce qui a fait remonter les cinq d'un coup. Le champ est RETIRÉ, jamais mis à zéro.

**Les écritures CRM déclarées franchissent la porte** : `OUTBOUND_WRITE_KINDS` en déclare sept, l'arbitrage était « toutes les écritures CRM », deux y passaient. `createTask` et `logMeeting` la franchissent désormais (l'`externalId` d'une réunion sert deux fois : idempotence de la porte et dédoublonnage fournisseur) ; les trois sans producteur sont gelées dans une liste qui ne peut que rétrécir (`outbound-kinds-wired.spec.ts`).

**L'annulation d'import est atteignable** (D70, `POST /import/sessions/:id/rollback`) : `planRollback` et `markRolledBack` étaient écrits, testés, sans route ni bouton — la garde du scénario « un import détruit trois ans de données CRM » était du code mort. Un objet touché par un HUMAIN après l'import n'est jamais annulé (il est LISTÉ et laissé) ; rien n'est SUPPRIMÉ (un compte créé est archivé) ; ce qui a été laissé est annoncé avec ce qui a été annulé.

**GA-05 compte par ROUTE** (cliquet à 377) : elle cherchait la chaîne `@RequirePermission` dans le FICHIER, donc une seule occurrence déclarait sept routes — dont celle qui servait la marge. Même leçon que la carte de diagnostic manquante du 21/08 : **une garde qui compte « au moins un » ne dit rien de ce qui manque.**

**La navigation garde sur `team:manage`** : elle comparait le rôle à `owner`/`admin`, si bien que le correctif du 22/08 (qui a ouvert le pilotage à `sales_ops` côté serveur) laissait l'entrée de menu cachée à ceux à qui on venait de l'ouvrir. Une garde refuse tout rôle littéral dans les composants de navigation.

**Le journal des portes se relit** (`GET /decision-gates`) : `decision_gate_crossings` s'écrivait depuis le PDF 1 et le module n'avait **aucun contrôleur**. Le récapitulatif compte les MANQUES par libellé — « onze affaires closes sans budget ce trimestre » est la question qui a fait créer la table.

**`apps/ia` n'écrit plus dans `accounts`** : `/scorer/recalculate` persistait `priority_score`, une table métier dont NestJS est propriétaire (interdit n°4), et le faisait en silence — un `except` repliait l'échec en `warning`. Garde Python : l'IA n'écrit que dans les tables dont elle est propriétaire (documents RAG, fil du copilote).

**Le bandeau de transparence AI Act est sur les trois écrans qui classent des personnes** — il n'était que sur un. ⚠️ La première version de sa garde cherchait le NOM du composant et non son montage JSX : retirer `<TransparencyBanner />` en laissant l'import la laissait au vert.

**Trois artefacts deviennent des skills committés** (D71) : `.claude/skills/revue-pr/` (les 25 points de revue de PR + les 12 invariants et 9 interdits en référence) et `.claude/skills/recette-palier/` (les 10 contrôles + le protocole de recette métier, PASS/FAIL/PARTIAL/BLOCKED). **FAIL est un problème de produit, BLOCKED un problème de configuration — les confondre fait perdre des semaines.**

⚠️ **La numérotation des gardes du PDF 9 ne correspond PAS à celle du dépôt** (D72) : son GA-12 est « unknown → done », le nôtre « les contraintes CHECK couvrent leur énumération TS ». Quatre numéros coïncident par hasard, trois désignent autre chose. On ne renomme rien — les numéros du dépôt vivent dans huit trackers, les commentaires de garde et les messages de commit. Table de correspondance au §1 du tracker.

**Ce que le PDF 9 NE fait pas trancher** : BEL-CRM-106 (une `work_phase` dérivée déferait D13 et créerait la seconde vérité que D2 interdit), les 50 outils copilote sous leurs noms exacts (renommer invalide le préfixe d'outils mis en cache pour un gain nul), les 12 natures d'intervention (le dépôt en a six, chacune adossée à un signal réel), les rituels animés (refus reconduit du PDF 8). **Reste ouvert** : la garde d'isolation d'espace — le seul trou TOTAL du §11, et un sujet de sécurité.

Laura — chatbot du site et copilote produit, PDF 10/10 du 19/08/2026 (`agent_docs/pdf10-laura-chatbot-2026-08-22.md`, PR #1021) : le document part d'un transcript de conversation test et rend un verdict qu'il faut lire deux fois — « le code de Laura est bien écrit, **le problème est le cahier des charges** ». Vérifié : treize des quatorze défauts sont une consigne de prompt ou une constante qui dit ce qu'il ne faut pas. Un seul est un vrai bug de production.

**La fuite d'adresse avait DEUX chemins**, le PDF n'en voit qu'un. Le message d'échec renvoyé au modèle — et le CTA `support`/`human`, dont le `href` était `mailto:theo@bellum-it.com`. Un champ STRUCTURÉ ne traverse ni le prompt, ni `redactOutput`, ni aucune garde qui lit du texte : `ctaFor` devient pur et testable, `redactOutput` retire toute adresse interne, et la garde GL-01 porte sur la réponse ENTIÈRE (`reply` **et** `cta.url`). Un échec de transmission n'est annoncé qu'UNE fois par session (`failedHandoff`) : le `tool_result` d'échec repartait dans l'historique et le modèle le re-verbalisait.

**La grille tarifaire n'entre plus dans le contexte** tant que personne n'a posé de question de prix (`asksAboutPricing`, garde GL-03). « T'es trop cher » est une OBJECTION, pas une question — la bonne réaction est « cher par rapport à quoi ? », et réciter le tarif la CONFIRME. Le prompt l'interdisait déjà ; ça ne suffisait pas, puisque le bloc était sous les yeux du modèle à chaque tour. ⚠️ « cher » n'est délibérément PAS un mot déclencheur. Et le §4.13 hard-code « 119 € » alors que le §3.1 du **même document** l'interdit : le montant se lit dans le bloc TARIFS injecté à l'exécution.

**La grille de qualification passe à 8 axes** (`routing.ts`). `MAX_SCORE` est CALCULÉ : le §4.6 annonce 30 points et ses propres tables en font 32. Le prompt reçoit une POSTURE — `engage` / `guide` / `inform` / `be_honest`, nommée par ce que Laura FAIT — et jamais le palier : le §4.6 exige que le score ne soit « jamais déductible d'une formulation », et « tu es un lead tiède » se devine là où « je te montre la démo » ne se devine pas. `nextQuestion` et `answeredCount` n'avaient **aucun appelant hors leur propre test** ; `promptState` est le pont qui manquait. Le lien de rendez-vous ne tombe plus au premier signal : trois conditions cumulées, sauf insistance — « retenir, c'est perdre ».

**Le widget** : ouverture automatique par page (module pur `auto-open.ts`, les 7 règles de retenue du §4.4), avatar dessiné en SVG (D43 — aucun visage n'est livré sans validation ; `NEXT_PUBLIC_LAURA_AVATAR_URL` bascule sur la photo sans toucher au code), 420 × 640 desktop et plein écran mobile, pastille avec point de présence et badge non lu, frappe animée, réponses rapides contextuelles (clés i18n, jamais des phrases), mémoire 30 jours en stockage local (D47 — jamais côté serveur, donc rien à conserver ni à déclarer), jusqu'à 3 bulles et 2 relances de silence.

**D45 tranché à l'inverse du PDF** : tutoiement par défaut, jamais demandé — c'est la forme du site et du produit. ⚠️ Le « vous » de « Vous êtes combien de consultants ? » est un PLURIEL et n'est pas converti.

**Laura Produit** (`apps/api/src/modules/laura/`, migration `1789990000005`) : le §5.3 se présente comme une reprise du compteur de proactivité du PDF 6 — la reprise était déjà en production, trois règles étaient NEUVES. Une intervention par écran, vingt minutes entre deux, et le retrait : deux mécaniques qui ne disent pas la même chose. IGNORER, c'est ne pas répondre (la personne était occupée) → plafond à 1 pendant une semaine ; FERMER SANS LIRE, c'est un geste → retrait 7 jours, dit une fois, sans reproche. Le **score de santé** (7 axes) suit la règle des scores de matching et de mission : un axe non évaluable SORT du dénominateur, sous trois axes il n'y a pas de score, `null` n'est jamais 0. D50 : sous 25 on alerte l'ÉQUIPE, jamais l'utilisateur, et **jamais sans score**. Le catalogue des 30 interventions vit dans le CODE ; la DÉTECTION est séparée et n'en couvre que **huit** — les 22 autres supposent des mesures que le dépôt ne fait pas, et les deviner produirait des interventions qui se déclenchent au hasard. Détection SERVEUR : choisir ses propres interventions revient à choisir ce qui vous interrompt. L'interrupteur D49 vit dans les préférences de notification et **nulle part ailleurs**.

**Deux gardes d'architecture renforcées** : **GA-12** ne voyait pas `CHECK (col IS NULL OR col IN (…))`, la forme d'une colonne d'énumération NULLABLE — l'élargissement a révélé **13 contraintes invisibles**, dont deux dont l'énumération n'existait qu'en `z.enum([...])` inline au milieu d'un schéma, donc comparée à rien (`ACTIVITY_VERDICTS`, `EMAIL_LANGUAGES`, désormais nommées). **GA-05** gagne `@PersonalScope` : un contrôleur qui ne sert que la donnée de celui qui appelle DÉCLARE ce qu'il garde, au lieu de rester indistinguable de ceux qui ont oublié leur permission — exiger `records:write` pour éteindre une bulle empêcherait un `viewer` de couper Laura, ce que D49 interdit.

⚠️ **Trois défauts que seule la recette live a trouvés**, derrière 9 000 tests verts. (1) La relance de silence partait PENDANT que Laura répondait : le compteur démarrait au dernier message du visiteur, et un tour peut durer plus de 45 s — le silence se mesure désormais depuis le moment où Laura a fini de parler. (2) Laura s'ouvrait EN GRAND sur une page **404** : la table portait des alias français (`tarifs`, `produit`, `cas-usage`) que le site ne sert pas, et un alias mort ne coûte rien tant qu'il ne déclenche rien. (3) « Ton vivier est vide » se déclenchait sur le nombre de **comptes** — l'espace de recette avait 19 comptes et 0 consultant, l'écran disait « vide », et Laura se taisait. **Une intervention doit être déclenchée par une mesure qui parle de SON sujet ; un ratio proche n'est pas une mesure, c'est une ressemblance.**

**Ce que le PDF 10 NE promet pas** : les 22 interventions non mesurables (listées avec leur raison), le rejeu live des 20 conversations du §7.1 en CI (opt-in `CHATBOT_GOLDEN_LIVE=1` — une clé de production dans les actions, vingt appels par poussée, et une garde qui rougit parce qu'un modèle a tourné sa phrase autrement finit désactivée), la photo de Laura tant qu'elle n'est pas validée, les « 50 outils du copilote » du §5.8 (il y en a 25, et D44 du PDF 6 a déjà refusé le renommage), la réservation de créneau depuis le site (D46), et l'exécution d'une action par Laura Produit (D48 — elle guide, l'Action OS exécute).

La donnée : sources, collecte, pipeline — tome 2/8 (`agent_docs/tome2-donnee-sources-pipeline-2026-08-21.md`) : la **doctrine de collecte** et ce qu'on ne pourra jamais savoir.

**Les cinq niveaux, et le principe qui tranche.** N1 open data officiel (BOAMP, DECP, BODACC, INSEE, INPI, recherche-entreprises, France Travail) : ingestion native. N2 web public sans mesure technique : crawl mesuré, `robots.txt` respecté, agent identifié. N3 API publique documentée d'un tiers (Greenhouse, Lever, RSS) : appel normal dans les quotas. N4 donnée sous licence (Apollo, Pappers, Firecrawl, Serper, Tavily) : usage contractuel, **fournisseur jamais nommé au client**. N5 donnée privée de l'utilisateur (messagerie, agenda, CRM, ERP) : consentement OAuth explicite — c'est le moat. Le principe qui tranche 100 % des cas ambigus sans réunion juridique : **si la collecte suppose de se faire passer pour quelqu'un d'autre — un navigateur humain, un utilisateur connecté, un partenaire autorisé — on ne le fait pas.** Il exclut le scraping LinkedIn et les faux user-agents ; il autorise le crawl d'un site public qui accepte les robots.

**Le pipeline en sept étages** : collecte → normalisation → résolution d'entité (SIREN pivot) → déduplication → qualification → scoring → decay → exposition avec source, date, confiance et « ce que je ne sais pas ». Trois de ces étages portent une règle qui a déjà coûté cher : la résolution écarte tout candidat sans SIREN, la déduplication PROPOSE au-delà de la clé domaine (elle ne fusionne jamais), et le decay ne SUPPRIME rien — une donnée périmée **redevient inconnue** et l'écran affiche « information de mars 2026, à revérifier ».

**Ce qui n'existe pas, et qu'il faut arrêter d'espérer** : le panel fournisseurs d'une entreprise PRIVÉE, l'attribution d'un marché privé, le CA d'une ESN par client, la marge d'un intermédiaire, le TJM pratiqué chez un client. Aucune API ne le dira jamais. La seule voie est déclarative, puis communautaire — d'où `BEL-DATA-005`.

**L'échéance d'un marché public** (lot 0) : `dureemois` EST publié par les deux jeux DECP réellement appelés (vérifié le 22/08 : 100 marchés IT récents sur 100 le portent), contrairement à ce que le tome 1 affirmait. `datenotification + dureemois` donne la date de fin, donc `verrouille` **jusqu'au** \<date\> et la fenêtre de renouvellement six mois avant. Marché échu ⇒ `semi_ouvert` (le renouvellement a pu être attribué sans publication récente) ; durée absente ou notification dans le futur (`decp_augmente` porte des dates à 2048) ⇒ échéance inconnue, jamais devinée.

⚠️ **Deux millésimes DECP, deux moitiés** : `decp_augmente` porte les NOMS (et sert la recherche par nom) mais n'a presque plus de données récentes ; `decp-2022-marches-valides` est vivant mais ne publie QUE des SIRET. `awarded_it_contracts` fait donc les deux passes — par nom, puis par SIREN quand le run en a résolu un — et fusionne en dédupliquant sur l'objet et la date. Corollaire : `IaClient.research()` envoie désormais `siren` (il ne le faisait pas, alors que le contrat le portait : sur « Rafraîchir », un nom ambigu comme « FRANCE TELEVISIONS » ne se désambiguïsait pas et toutes les sources ancrées sur l'identité légale rendaient vide).

**Boards ATS** (`apps/ia/app/services/data_sources/ats_boards.py`, zéro clé) : Greenhouse (`boards-api.greenhouse.io/v1/boards/{slug}/jobs`) et Lever (`api.lever.co/v0/postings/{slug}?mode=json`), contrats vérifiés en direct. La règle est l'ATTRIBUTION, pas la collecte : un slug se devine, et attribuer à un compte les offres du board d'un homonyme écrirait un signal de recrutement faux. On n'attribue que sur preuve — le slug vient du DOMAINE du compte (`website`, désormais threadé du worker jusqu'à `ResearchRequest`), ou la réponse NOMME l'entreprise (Greenhouse rend `company_name` ; Lever ne rend aucun nom, donc **sans domaine on ne l'appelle pas**). Board absent = 404 = non-détection.

**Le piège du cabinet de recrutement** (`intermediation.py`) : les plus gros publieurs d'offres IT de France sont des intermédiaires. NAF `78.10Z`/`78.30Z` (rendu par le résolveur de Découvrir — aucun appel de plus), repli par une liste courte de noms. `78.20Z` (intérim) est délibérément EXCLU : une entreprise d'intérim place ses propres salariés. L'offre est CONSERVÉE et marquée (`intermediated`), jamais supprimée, et sort du score : quand un employeur n'a que des offres intermédiées, le bloc « signaux datés » redevient **non mesuré**, pas nul.

**La donnée communautaire** (`community-facts.ts`, `workspaces.community_data_sharing`, `access_fact_questions`, migration `1789994210583` ; D51 tranchée par Louis le 22/08, CGU faites) : quatre principes non négociables. **Opt-in** décoché par défaut, propriétaire uniquement. **Seuil de trois espaces distincts** (`COMMUNITY_THRESHOLD`), dans le contrat et nulle part ailleurs — une garde refuse un `>= 3` recopié dans un service. **Réciprocité** : un espace qui ne partage pas ne consomme pas ET n'alimente pas ; il voit qu'une information existe, jamais sa valeur. **Anonymat** : l'agrégat porte un COMPTE d'espaces, jamais un identifiant. On compte des ESPACES et non des déclarations, le rapprochement se fait sur le SIREN (jamais sur le nom), seules les déclarations HUMAINES entrent, la divergence l'emporte sur le seuil (une valeur communautaire contredite **repasse en inconnu**), et la déclaration de l'espace qui demande l'emporte toujours. La contribution coûte UN CLIC à trois moments — après un refus, en fin de mission, après un premier contact — et la trace est écrite en SERVANT la question, jamais en recevant la réponse : « ignorée ⇒ jamais reposée » n'est tenable qu'ainsi. Une réponse qui n'établit rien (« pas abordé », « refus de fond ») n'écrit AUCUN fait. ⚠️ **Cinquième principe, et il n'est pas produit mais JURIDIQUE** (tome 8, D70 et §54, trouvé le 25/08 en ouvrant le PDF) : le **coût d'accès ne s'agrège JAMAIS** entre espaces. Les espaces sont des ESN, donc des concurrents ; agréger ce que chacune paie de commission pour entrer chez un client est un **échange d'informations tarifaires entre concurrents**, que le tome marque « à valider AVANT de l'ouvrir ». L'interdit était respecté, mais par un `WHERE f.kind = 'lock'` écrit à la main dans un seul service, sans qu'aucun texte ne dise pourquoi — or étendre l'agrégation aux MODES d'accès est prévu et légitime, et rien n'aurait arrêté la main qui écrit `IN ('lock','mode','cost')` avant `cost`. Il vit désormais dans le contrat (`COMMUNITY_AGGREGABLE_KINDS` = lock · mode · path, `COMMUNITY_FORBIDDEN_KINDS.cost` porte la raison en clair, et un test exige que les deux listes couvrent ensemble TOUTES les natures sans recouvrement — une nature ajoutée demain doit être rangée) et **GA-43** refuse toute requête inter-espaces qui nomme une nature interdite ou qui ne filtre sur aucune. Ce n'est pas de la prudence : une information qui a circulé ne se reprend pas.

**GD-08 — chaque source déclare son comportement de panne** (`source_registry.py`) : les seize modules de `data_sources/` portent leur niveau de collecte, leur mode de dégradation (`graceful_empty`, `reported_degraded`, `raises_unavailable`, `no_op_documented`) et ce que l'utilisateur PERD quand ils tombent. Une source ajoutée sans entrée fait échouer la CI. Trois seulement lèvent — France Travail, BOAMP, DECP : elles portent l'écran, et une liste courte s'y lirait « il ne se passe rien dans ce département ».

**Ce que le tome 2 NE promet pas** : l'allotissement BOAMP (avis récents en eForms UBL imbriqué, anciens en schéma Boamp_v230 — deux parseurs pour une information dont le consommateur est le scoring du tome 3), TED et les plateformes acheteurs (priorités moyenne et basse annoncées par le tome), la représentation d'un CONFLIT entre deux sources (elle exige une IDENTITÉ de source — `field_provenance` ne porte que la catégorie `human|connector|pipeline|model`, donc flaguer toute réécriture de même rang flaguerait chaque réanalyse), le comptage « j'ai cherché dans 1 240 offres » (les trois listes de Découvrir sont mises en cache par leur valeur de retour ; y ajouter un compteur changerait le contrat de cache), les demi-vies du §3.7 qui contredisent D50 du 21/08 (offre d'emploi 45 j contre 180 j par type de signal — la décision postérieure tient), et tout ce qui exploite le référentiel ESN — crawl des pages « nos agences » et carrière, volume d'offres par ESN, cartographie d'agences, table d'alias, domaines `unverified` : c'est `BEL-DATA-001`, **tome 4**, où vit leur consommateur.

Le pivot d'accessibilité — tome 1/8 du chantier Accessibilité (`agent_docs/tome1-pivot-accessibilite-2026-08-20.md`, call bêta Loïc du 20/08) : Bellum classait les comptes par **intérêt** ; il les classe désormais par **intérêt × accessibilité pour cette ESN-là**. La phrase qui porte tout le chantier est du bêta testeur : « il vaut mieux avoir quatre besoins sans savoir qui est derrière que 10 000 contacts chez BNP, parce que tu sais que la porte est complètement verrouillée. »

**Les 20 points étaient réservés depuis le premier jour et jamais calculés.** `discover_scoring.py` porte `_MAX_ACCESSIBILITY = 20` et `"accessibility": False` en dur. Cinq axes le remplissent désormais — **verrouillage** (6), **proportion** (5), **chemin** (5), **relation** (3), **coût d'accès** (1) — avec la discipline du module appliquée à l'AXE et non au bloc : un axe dont on n'a pas les deux côtés SORT du dénominateur. **Deux nombres, jamais fondus** : les facteurs d'adressabilité n'entrent dans AUCUNE somme, si bien qu'ils ne PEUVENT pas se mélanger au score d'intérêt. « Intérêt 68/80 · accès 4/20 » dit qu'un compte est parfait et hors de portée ; un 61 unique ne le dit pas, et c'est ce compte-là qui sortirait en tête de liste.

**Ce qui se déduit d'une source publique, et ce qui se tait.** Une attribution DECP est un FAIT — un prestataire est en place chez cet acheteur — mais ce n'est PAS « verrouillé » : DECP ne publie pas l'échéance ici, et l'affirmer serait une invention (l'écran le dit en toutes lettres). Sans attribution, l'axe reste **non mesuré** : une entreprise privée n'apparaît dans AUCUN registre de marchés publics, donc conclure « ouvert » d'un silence promettrait une porte que personne n'a vue. Le coût d'accès est **déclaratif** (D60), jamais estimé : une moyenne de marché appliquée à un cas particulier serait un chiffre inventé, et c'est sur ce chiffre-là qu'on négocie.

**`access_facts` — une table de FAITS, pas des colonnes** (migration `1789991847263`, module autonome `apps/api/src/modules/account-access/`). Le critère d'acceptation est « chaque information d'accès porte sa SOURCE et sa DATE » : une colonne n'en porte aucune sans qu'on lui en ajoute deux, un fait les porte par construction — avec sa PROVENANCE. `observed_at` est la date à laquelle le fait était VRAI, pas celle de l'écriture. Un fait **périmé ne disparaît pas** : il redevient à vérifier et l'écran affiche « information du 12 mars, à revérifier » (demi-vies par nature — 12 mois pour un référencement, 6 pour une commission). Une **correction humaine gagne toujours**, quelle que soit sa date (`bestAccessFact` réutilise le rang de `decideFieldWrite`) : trier par date d'abord ferait qu'une réanalyse du lendemain reprendrait la main sur une correction de la veille.

**Les sept modes d'entrée** (`ACCESS_MODES`, dont **cinq indirects**) sont classés par faisabilité, et **aucun n'est fermé faute de donnée** — l'ignorance n'est pas un obstacle. Le hors-panel reste ouvert même sur un compte verrouillé : c'est ce que font les prescripteurs qui contournent leur direction achats.

**Les quatre familles de Découvrir** (`discoverFamily`, pure) et leur ORDRE d'évaluation, qui n'est pas cosmétique : **hors de portée** d'abord (une disproportion de taille est le seul empêchement qu'aucun chemin ne lève), **via un intermédiaire**, **tu peux y aller** — et seulement si quelque chose BOUGE, sinon « tu peux entrer » est vrai et inutile —, **à investiguer** en dernier. La quatrième famille est **AFFICHÉE, pas masquée** (D59). Le tri « équilibré » est le **PRODUIT** des deux notes et jamais leur moyenne : une moyenne rattrape un compte parfait et verrouillé par sa moitié forte. Le tri d'OUVERTURE se déduit de la maturité déclarée (moins de cinq consultants ouvre sur l'accès), **proposé et jamais imposé**.

**`esnPresence` atteint enfin le produit.** Généré à chaque analyse depuis le 06/07, stocké dans `raw_analysis`, rendu UNIQUEMENT dans l'outil interne — c'était la demande n°3 du bêta testeur, cherchée dans le produit pendant le call. L'analyse alimente désormais `account_partners` en `source = 'analysis'` (valeur qui était dans la contrainte CHECK, dans le zod, et pour laquelle l'écran affichait DÉJÀ un badge « détecté » que rien ne produisait), via la fonction pure `detectedPartnersFrom`. Chaque entrée porte sa **certitude** (vocabulaire repris du champ voisin `esnSynergies`), son **périmètre** et sa **date de détection** — laquelle n'a pas de défaut « aujourd'hui » : fabriquée à la lecture, elle rajeunirait la détection à chaque affichage. Ni le rang ni la relation ne sont devinés : « concurrencer ou solliciter en rang 2 » est la décision de l'ESN. « Ce n'est pas exact » pose une **pierre tombale** (`dismissed_at`) plutôt que de supprimer — une suppression serait défaite par l'analyse suivante.

**Un « non » a une durée de vie** (`PARK_REASON_REVIEW_MONTHS`) : six mois pour « pas de budget », trois pour « mauvais timing », un an pour « pas intéressé ». Jusque-là seul un SIGNAL rouvrait un compte, si bien qu'un refus dans un compte silencieux restait fermé pour toujours. **« Ne plus me contacter » ne se rouvre jamais** — ce n'est pas un délai, c'est une décision. Ce que l'ESN a décidé (hors cible, taille inadaptée) ne se réexamine pas non plus : ça changerait si l'ESN grandit, pas si le compte bouge.

**Un contact qui change d'entreprise ouvre une PORTE** : le badge RISQUE reste sur le compte d'origine (il dit une vérité), et un projet au stade `detected` naît sur le nouveau compte **s'il est déjà suivi** — jamais de compte créé sur un nom deviné par comparaison de libellés. `access_mode = introduction_relation`, et l'écran dit « c'est une porte, pas une affaire » : laisser croire à un besoin ferait préparer un message qui parle de ce que le client n'a jamais demandé.

**Ce que Bellum a contribué** (`GET /pilotage/contribution`) : des COMPTAGES, jamais un montant. `accounts.origin` reçoit enfin le jeton `discover:<siren>` que le navigateur émettait depuis toujours et que personne ne lisait. L'attribution **partielle** est dite, pas tue, et les comptes antérieurs au marquage sont comptés À PART — les ranger d'un côté sous-estimerait la contribution, de l'autre l'inventerait.

**Ce que le tome 1 NE promet pas** : le canal partenaire (il exige un référentiel ESN résolu, or le fichier livré est une liste de 477 noms **sans SIREN, sans ville, sans date**, aux domaines devinés à 93 % — c'est `BEL-DATA-001`, tome 4), l'échéance d'un référencement (DECP ne publie pas `dureeMois` dans ce jeu ; le verrouillage, lui, est calculable), la réécriture de l'onglet Sites autour de la table `sites`, les commandes copilote sans outil pour y répondre, et un score d'accessibilité présenté comme une probabilité (6ᵉ refus de l'arbitrage n°4). ⚠️ Les décisions **D51** (cadre communautaire) et **D62** (référentiel ESN partagé entre espaces), tranchées par Louis le 22/08, **ne sont livrées nulle part** dans ce tome : toutes ses lectures sont scopées au `workspace_id`. La revue CGU conditionne le tome 4, pas ce chantier.

Le second marché — tome 4/8 (`agent_docs/tome4-second-marche-esn-2026-08-23.md`) : Bellum aidait une ESN à vendre à des clients finaux ; c'est **une moitié du marché**. L'autre, ce sont les ESN elles-mêmes — concurrentes chez un compte, clientes sur un territoire, fournisseuses sur une techno qu'on ne couvre pas, **parfois les trois en même temps**. D'où trois objets qu'il ne faut jamais confondre : `account_partners` (qui est en place CHEZ ce client), **`esn_directory`** (l'ENTITÉ ESN, table PARTAGÉE entre espaces — la seconde du dépôt après `skill_alias_library`, D62) et **`partner_relations`** (MA relation, privée à l'espace, huit étapes, D61). **Le retournement NAF** (`esn_naf.py`) : la même moisson d'offres lit un marché CLIENT ou un marché ESN — mais le tome le croit gratuit et il ne l'est pas, aucune source d'offres ne rendant de SIREN ni de NAF (France Travail écrit `"siren": None`), si bien que le filtre s'applique APRÈS la résolution de l'employeur. Un NAF ambigu (70.22Z, 62.09Z) apparaît des DEUX côtés avec son drapeau. Le référentiel se remplit en tâche de fond par lots RÉSERVÉS (`resolving`) plutôt que sous verrou global — deux instances se partagent les 477 noms, et une réservation abandonnée retombe au bout d'une demi-heure ; kill-switch `ESN_DIRECTORY_REFRESH_DISABLED`. Écrans : `/discover/territoire` (cinq blocs, un ÉTAT chacun — quatre sources publiques ne répondent jamais ensemble) et `/accounts/partners` (trois onglets). Le **score de débordement** est non mesurable plutôt que zéro, et une ESN en procédure collective en sort AVEC sa raison. ⚠️ `activite_principale` du registre refuse un PRÉFIXE (« 62.0 » → 400) : les codes complets, tous dans un seul appel.

Le plan de compte — tome 5/8 (`agent_docs/tome5-plan-de-compte-2026-08-23.md`) : le **premier mouvement en quatre points**, dont le quatrième est un INTERDIT (`first-move.ts`). Six familles d'interdit, chacune avec sa raison CHIFFRÉE, deux au maximum — et **éteint** (`ANTI_ADVICE_ENABLED = false`) tant que le jeu de trente comptes n'a pas été jugé par un humain : « un conseil faux, énoncé avec autorité, fait perdre un compte ». Le troisième point (« si silence ») était PRODUIT par la phase 4 depuis le premier jour et lu par aucun écran. Le **board d'effort** (`accounts.sprint`, migration `1789996184270`) est un TROISIÈME axe, à ne fondre ni avec `priority_gate` ni avec `commercial_status` : combien d'énergie sur ce compte, cette semaine. Sept règles de bascule, dont deux seulement automatiques — celles qui MONTENT l'effort ; baisser l'effort à la place du commercial, c'est décider d'abandonner. Plafond DUR à huit comptes en Focus, la seule règle du produit qui refuse un geste volontaire. Plus : le badge de fraîcheur du plan (affiché même périmé, D78), la mention de génération datée sur les quatre exports, et le brief d'avant-rendez-vous (`/accounts/$id/brief`, huit blocs, l'interdit en dernier). **Refusés** : un second score d'entité et un score de fit sur 5 (deux nombres qui divergeraient au premier ajustement), le renommage de « à vérifier » en « inconnu » (la valeur EST `unknown`).

Tomes 6, 7 et 8 (`agent_docs/tomes6-8-laura-architecture-execution-2026-08-23.md`) : ⚠️ **« le tome 6 EST le PDF 10 » était FAUX** — corrigé le 25/08 en lisant enfin le tome. Il le dément deux fois lui-même (« C'était juste, et insuffisant » §11.1 ; « le PDF 10 en posait trois, il en faut six » §12) : ses sections **§11 à §16** — doctrine des 12 surfaces, mémoire en 6 couches, moteur d'initiative, **40 interventions**, prompt unifié, 14 outils — n'avaient JAMAIS été inventoriées. Statut mesuré dans `agent_docs/archive-03-ia-laura-observabilite-2026-08-25.md` : contrasté, les 14 outils du §16 existent tous quand les 12 surfaces du §11 se réduisent à 3. **Une équivalence entre deux documents est une affirmation, et une affirmation d'équivalence non vérifiée dispense de lire** — la vérifier coûtait un diff de tables des matières. ⚠️ **La même phrase était fausse une seconde fois dans le même tracker** : « le tome 8 n'apporte aucune spécification neuve » vaut pour ses chapitres d'ordonnancement, pas pour ses **§15 à §18**, qui portent **24 propositions numérotées `F01`-`F24`** dont plusieurs inédites (`F15` le compte jumeau, `F16` le détecteur de compte qui se ferme, `F19` le classement par distance au premier euro). Sondage de sept : six existent (`F02` anti-conseil, `F03` board d'effort, `F07` barrière, `F08` fenêtre de référencement, `F17` carte territoriale), `F19` non — **les dix-sept autres ne sont PAS mesurées**. Le raccourci s'explique : les tomes 1 à 7 en ont livré une bonne part sans passer par le tome 8, si bien que « rien de neuf » était vrai de l'expérience et faux du document. Pour le reste, le tome 8 n'apporte aucune spécification neuve — son chemin critique était déjà livré. Le croisement n'a donc produit que des écarts, tous de la même famille : **du code juste, calculé, testé, que personne n'appelle**. `alertsTeam()` (D50) n'avait aucun appelant ; il part maintenant en `logger.error`, donc dans Sentry, dédoublonné par espace et par jour. « Je n'ai pas pu transmettre » se répétait une fois sur deux : sa garantie reposait sur un `Set` en mémoire de process, **sur un site serverless** — la conversation, qui fait l'aller-retour, sert désormais de mémoire. `get_user_context` rend enfin le prénom et le rôle. Le RAG **perdait la fraîcheur dès qu'on payait pour mieux classer** : seul le repli déterministe pondérait la date, `apply_recency_decay` s'applique maintenant aux deux chemins payants. Trois gardes de plus : **GA-16** (une table sans `workspace_id` est DÉCLARÉE avec sa raison), **GA-17** (une source de `data_sources/` n'en importe pas une autre) et `DOMAINS.md`, qui cartographie les 93 modules sans en déplacer un seul. GA-05 descend de 377 à 367.

Veille territoriale et voix unique — les quatre décisions du 23/08/2026 (`agent_docs/tomes-reste-a-faire-2026-08-23.md`) : ce qui restait EN TRAVERS des six trackers de tomes.

**L'anti-conseil est ALLUMÉ** (`ANTI_ADVICE_ENABLED = true`, les six règles). Allumer ne suffisait pas : `firstMove` recevait un `FirstMoveInput` construit à vide, donc allumé il n'aurait produit AUCUN interdit. `apps/web/src/features/brief/lib/first-move-input.ts` le construit depuis `raw_analysis` (barrière d'accès et son `statut`, signaux d'emploi, marchés attribués, pile technique, ESN présentes) et le classement d'entités de l'onglet Accès ; ce qui est inconnu reste `null` — un interdit ne se déclenche jamais sur une absence. ⚠️ Le service IA ne rendait le statut de la barrière qu'en PROSE française : `access_scoring.py` expose désormais `statut` en clair, parce qu'une entrée illisible par le code est une entrée vide.

**Le copilote s'appelle Laura**, comme le chatbot du site — deux moteurs de conversation seraient deux vérités possibles pour la même question. La persona vit dans le bloc `_BLOCK_LAURA` du prompt `bellum_advisor` (⚠️ il en existe UN seul : un second ajouté par erreur est silencieusement écrasé, et le prompt ne contient alors pas le mot « Laura » pendant que les tests passent). Le **prénom** voyage `profiles` → `chat-context.service` → `ia.client` → requête IA → prompt, avec la consigne de ne l'employer qu'une fois toutes les deux ou trois réponses ; prénom absent = aucune consigne, prompt byte-identique.

**Veille territoriale** (`territory_subscriptions`, `territory_snapshots`, migration `1789997312845` ; écran `/pilotage/marche`, routine `territory_watch`, cron du lundi 05:00 `TERRITORY_WATCH_DISABLED=true` pour l'éteindre) : l'ABONNEMENT est scopé à l'espace — suivre un département est une intention commerciale — la PHOTO ne l'est pas (le nombre d'offres IT en Haute-Garonne est le même pour tout le monde ; 3ᵉ table partagée, déclarée à GA-16). Ce que la photo débloque compte plus que l'écran : `esn_directory.hiring_baseline` était LUE par le score de débordement et écrite par RIEN, donc son axe « Volume » ne pouvait jamais être mesurable. `hiringBaseline()` la construit en **MÉDIANE** (une semaine de campagne déplacerait une moyenne) et pas avant **treize** photos. `territoryChanges()` porte trois règles : une semaine non mesurée ne produit AUCUNE variation (sinon une maintenance de source se lit « −100 % d'offres »), une variation relative sur une petite base est du bruit, et un ralentissement d'ESN n'est pas notifié — aucun geste ne s'y attache.

**Primitives d'affichage** (`apps/web/src/components/primitives/`) : `UnknownValue`/`MeasuredValue` (« non mesuré », jamais `0`), `ScoreWithAxes` (un score n'est jamais nu — ses axes, ce qui n'a pas pu être évalué NOMMÉ, et un rendu `68/80` qui ne peut pas devenir un pourcentage) et `Provenance` (la source ET la date). La règle était appliquée au CALCUL depuis des mois, puis un écran écrivait `{value ?? 0}`. Deux gardes en **cliquet** : GA-18 (écrans affichant une note nue, ≤ 32) et GA-19 (`?? 0` dans les écrans, ≤ 87) — tous les `?? 0` ne sont pas des fautes, la garde compte au lieu d'interdire, et la question à se poser est écrite dedans : _si cette valeur est absente, « 0 » est-il VRAI ?_

**Deux chemins morts branchés** : `shouldSwitch` (sept règles de bascule d'effort écrites, testées, **sans appelant**) obtient `SprintsService.applyEvent` + `POST /sprints/accounts/:id/event` — les deux bascules qui MONTENT s'appliquent seules, les cinq qui descendent sont PROPOSÉES, et une bascule automatique refusée par le plafond du Focus redevient une proposition plutôt que de disparaître ; et **F08** — `lockFactFromAwards` calculait `reopensOn` puis le rangeait dans une phrase française — obtient la colonne `access_facts.reopens_on` (migration `1789997584210`), la fonction pure `referencingWindowAlert` (T-9/T-6/T-3, **un seul jalon à la fois, le plus proche**) et la routine `referencing_window`. Échéance inconnue ⇒ jamais d'alerte : « je ne sais pas quand » n'est pas « c'est imminent ».

**GA-20 — un repository injecté est un repository DÉCLARÉ** (`apps/api/src/architecture/injected-repositories-declared.spec.ts`) : `@InjectRepository(Foo)` sans `TypeOrmModule.forFeature([Foo])` dans le module empêche l'application de DÉMARRER, et Railway rejette le déploiement au **healthcheck** (Build ✓, Deploy ✓, Healthcheck ✗). Ce qui rend le défaut coûteux : **aucun test ne tombe** — les tests unitaires construisent le service à la main (`new Service(repo as never)`) et ne passent jamais par l'injection. C'est arrivé DEUX fois (22/08 puis 23/08), d'où la garde. ⚠️ Sa première version annonçait sept modules fautifs qui ne l'étaient pas : les `forFeature` du dépôt sont commentés ligne par ligne et une virgule dans un commentaire cassait le découpage — les commentaires sont retirés AVANT lecture, même leçon que GA-08. ⚠️ Symptôme à reconnaître dans `GET /version` : `ia.commit` à jour pendant que `commit` (l'API, à la racine) reste en retard — les deux services se déploient séparément, et un filtre sur le SHA matche facilement le mauvais champ.

**Ce qui n'est pas promis** : les gardes GA-21 à GA-24 (elles garderaient des règles sans violation mesurée — un cliquet posé sur un compte qu'on n'a pas fait est vert pour toujours), la réécriture des 57 routes une par une (ce qui a été migré est ce où `null` voulait dire « je n'ai pas regardé » ; le reste serait un diff illisible sans un défaut corrigé), et la détection automatique de `positive_reply`/`meeting_booked` (elle suppose de classer une intention dans le CORPS d'un message, que le socle ne lit pas — le point d'entrée existe, ses appelants attendront une détection honnête).

Le RAG et le design system — tome 7/8 (`agent_docs/tome7-rag-design-2026-08-23.md`) : la dernière partie non couverte des huit tomes.

**Les 7 manques du magasin de connaissance** (§36-41). Les six choix que le tome déclare justes sont INTACTS (repli plein texte, distillation déterministe, plafond 2 000 caractères, reclassement à trois niveaux, alimentation best-effort, périmètre par utilisateur). M1 — la fraîcheur entre dans le SCORE de récupération : `score = similarité × (1 − min(0,5 ; âge/730))`, appliqué **une seule fois** dans `search()`, une date absente ne pénalisant jamais. M2 — `used_count`/`last_used_at`/`used_in[]` incrémentés quand un document **atteint le prompt**, jamais quand une recherche le remonte (compter les recherches ferait grimper le compteur de tout un espace actif et la purge n'effacerait plus rien) ; l'incrément vit dans une **fonction SQL** parce qu'un `+1` composé côté client devrait d'abord lire la valeur, et deux réponses simultanées sous-compteraient exactement les documents les plus utilisés. M3 — purge mensuelle (`RAG_PURGE_DISABLED=true` pour la geler), ordonnancée par l'API et exécutée par l'IA qui possède la table, avec trois refus : un document déjà utilisé, un document DÉPOSÉ par un humain (personne ne peut le régénérer) et un âge illisible ne partent jamais. M4/M6 — neuf catégories (les trois historiques EN TÊTE) et deux origines `distilled`/`uploaded` ; ⚠️ la colonne `category` n'est **pas** contrainte, elle porte déjà du texte libre en production (`Notion`, `sales`, `Autre`) et un CHECK rejetterait des documents déposés par des clients. M5 — `doc_id` voyage avec chaque source pour que l'écran la rende cliquable, et la liste des sources est celle des documents qui ont RÉELLEMENT produit une ligne, pas ceux coupés par le budget.

**Ce que l'évaluation M7 a trouvé** (50 requêtes de référence, corpus figé, `apps/ia/tests/test_rag_eval.py`) : le reclassement déterministe **faisait perdre 9,3 % de MRR** (0,916 → 0,831). Depuis M1, la fraîcheur s'appliquait **trois fois** — au score, dans le reclassement, puis dans le départage. Ce qui a été retiré n'est pas l'étage, c'est le double comptage. ⚠️ Piège de mesure rencontré : le corpus n'avait pas de date, le reclassement rendait donc exactement le classement de base et le gain mesuré était de **+0,0 %** — une évaluation qui ne peut pas faire bouger ce qu'elle mesure ne mesure rien.

**La grammaire du mouvement** (`packages/ui/src/motion.ts`) : douze mouvements, quatre courbes, quatre paliers de durée. Mesuré avant : 121 fichiers animés, `EASE_OUT_EXPO` redéfini dans **six** fichiers (le tome en annonçait deux), `layoutTransition` dans quatre, dix durées distinctes pour la même intention. La courbe centralisée est celle qui était DÉJÀ utilisée. `reduced()` raccourcit sans supprimer — faire apparaître d'un coup est plus brutal que ce dont se plaint quelqu'un qui demande moins de mouvement — et laisse `focusRing` intact, parce que c'est une aide à la navigation clavier et non une décoration.

**Le clavier** (`apps/web/src/features/shortcuts/`) : `G` puis une lettre pour naviguer, `⌘/` pour la liste. Une SÉQUENCE et non une combinaison — `⌘G` est « chercher le suivant » dans tous les navigateurs. Trois gardes contre la frappe volée : on ne détourne jamais une touche pendant qu'on écrit, aucun modificateur, et la séquence expire au bout d'1,5 s. ⚠️ Le tome annonce `⌘K` et `⌘J` comme « posés » : **ils n'existent pas** dans le dépôt, et la liste ne montre que ce qui est branché — un raccourci listé qui ne fait rien apprend à l'utilisateur que la liste ment.

**GA-25** (grammaire du mouvement, cliquet à 26 courbes / 94 durées écrites à la main) et **GA-26** (un réglage n'a qu'UNE porte d'écriture). ⚠️ Toutes deux ont dû être réécrites, du même défaut : GA-25 cherchait la chaîne « bounce » et a accusé quatre fichiers **exemplaires** (`bounce: 0` DÉSACTIVE le rebond) ; GA-26 listait trois hooks `useUpdate…` qui n'existaient nulle part, donc verte sur du vide — elle vérifie désormais aussi que ce qu'elle surveille existe.

**Ce que le tome 7 NE promet pas** : les gardes dataviz (une seule utilisation de `recharts` dans tout le front, zéro camembert — un cliquet posé sur un sujet qu'on n'a pas fait est vert pour toujours), les 16 visualisations du §24 (chacune est un écran, pas une règle), la densité par persona (le produit n'a pas de notion de persona), le mobile (**D76** — rien / lecture / travail, décision de Louis), les 12 surfaces de Laura aux pixels près (sept d'entre elles n'existent pas) et la matrice objet × forme (la vérifier demanderait de reconnaître un objet métier dans du JSX).

L'appli mobile — D76 tranchée le 23/08/2026 (`agent_docs/mobile-et-preexistant-2026-08-23.md`) : pas les 34 écrans portés, mais une appli **dont la forme est Laura**, avec « Ma journée » à côté, et tous les écrans qui ont du sens rendus réellement utilisables au pouce.

**Les mêmes routes, une autre coque.** Sous **768 px** (`useIsMobile`, la borne `md` de Tailwind — en inventer une seconde ferait exister des tailles où le CSS dit « mobile » et le JavaScript dit « bureau »), `CustomerPage` remplace la barre latérale par une barre d'onglets. Un second arbre de routes « mobile » aurait produit deux produits à maintenir, et l'un des deux aurait pris du retard — c'est toujours celui qu'on regarde le moins. **Laura est le premier onglet ET l'écran d'arrivée**, quelle que soit la préférence de démarrage, qui a été choisie devant un écran de bureau : en mobilité on ne parcourt pas un portefeuille, on demande quelque chose. Quatre onglets (Laura · Ma journée · Comptes · Actions) et pas six — au-delà les cibles tactiles passent sous 44 px ; ce ne sont pas quatre écrans mais quatre PORTES, tout le reste reste atteignable.

**Les six pièges mobiles corrigés**, chacun mesuré : `100vh` comptait la barre d'adresse comme si elle n'existait pas (**21 fichiers**, dont `#app-shell`, l'ancrage contre lequel toute la chaîne `h-full` se résout) → `dvh` ; deux conteneurs défilants imbriqués (on atteint le bout de l'intérieur, le geste part sur l'extérieur, la zone de saisie du copilote disparaît) ; `min-h-[520px]` sur le copilote, au-dessus de la hauteur utile d'un iPhone ; le bouton de signalement et la carte de Laura posés **sur** le quatrième onglet (`--bellum-mobile-nav-height`, déclarée dans `tokens.css` — ils sont montés à la RACINE du routeur, et une variable posée sur un descendant n'atteint pas un frère) ; la liste de comptes en `min-w-[880px]` (trois colonnes secondaires masquées sous `md` — masquer en CSS plutôt que rendre une seconde liste, un second chemin diverge) ; et les treize onglets d'un dossier, inatteignables sans défilement horizontal.

**PWA** : manifeste, icônes générées (dont une masquable réduite pour survivre au rognage d'Android), `viewport-fit=cover` (sans lui la zone sûre d'un iPhone à encoche n'existe pas pour le CSS et la barre d'onglets passe sous la barre de geste) et les trois balises `apple-mobile-web-app-*`, qu'iOS lit à la place du manifeste. **GA-28** : plus aucun `100vh`, grilles à 3+ colonnes sans variante responsive figées à trois (toutes légitimes — panneau de marque masqué sous `lg`, grille interne d'un graphique, bande des sept jours d'une semaine).

**Quatre défauts de production corrigés au passage** — traités AVANT le mobile, qui en aurait hérité. (1) **`<Navigate>` de TanStack Router compare l'identité de son objet props**, que JSX recrée à chaque rendu : la seule transition `/` → `/dashboard` produisait **106 erreurs React #185**, et l'écran arrivait quand même — c'est ce qui l'a rendu invisible pendant des mois. `<RedirectTo>` compare la destination ; vérifié en production, 106 → 0 (GA-27). (2) **Un « 429 Too Many Requests » du registre s'inscrivait « cette ESN n'existe pas »** : `search_companies` repliait le refus en `[]` et le résolveur en tirait un verdict définitif, jamais retenté. Le contrat souple reste le défaut (le chemin d'analyse ne tombe pas pour une source gratuite) ; seul l'appelant qui va ÉCRIRE passe `strict=True`, et `ProviderThrottle.back_off()` écoute enfin le refus — un seau à jetons empêche de dépasser un débit SUPPOSÉ, il ne sait rien du débit réel. Migration `1789999120000` remet en file les lignes condamnées, et **uniquement** celles portant le motif exact produit par ce chemin. (3) **Un 406 à chaque démarrage** : `maybe_single()` fait répondre PostgREST 406 quand zéro ligne correspond, et l'absence de surcharge globale est le cas NORMAL. (4) **La sonde de Laura interrogeait `subscriptions WHERE workspace_id`**, colonne inexistante — la table est clé par UTILISATEUR : l'axe « consommation de crédits » du score de santé n'a JAMAIS été mesurable, et ce qui l'a caché est que la fonction rattrape et rend `null`, valeur légitime pour un axe non évaluable. **Un axe cassé et un axe non mesurable rendaient exactement la même chose.**

**Ce que le mobile NE promet pas** : les 22 tableaux restants (`<ResponsiveTable>` existe et est testé, l'appliquer écran par écran demande de vérifier chacun à l'œil), les 16 visualisations du tome 7, la densité par persona (le produit n'a pas de notion de persona), un service worker hors-ligne (le produit lit des données vivantes ; un cache montrerait un portefeuille d'hier sans le dire) et les notifications poussées (clé VAPID + consentement, à demander quand quelqu'un les réclame).

---

## Les 21 décisions du dossier du 26 août, et les lots qu'elles débloquaient — 28/08/2026

Tracker : [`dossier-26-aout-2026.md`](dossier-26-aout-2026.md), §6.10 pour les décisions, §8 pour le journal.

**Ce que la vague 13 est** : pas un chantier de plus, mais la **levée du dernier verrou** du dossier
du 26 août. Vingt-et-une décisions étaient parquées et bloquaient chacune un lot de code déjà mesuré.
Toutes tranchées le 28/08, et les lots livrés dans la foulée.

**Trois décisions étaient déjà closes sans que le tracker le sache** — vérifié dans le CODE, et c'est
la troisième fois de ce chantier que la précaution paie : **D41 · 26/08** (le DSO nomme ses litiges,
`measurability.ts:132` porte `disputed` **requis**), **D31 · 26/08** (`DETECTABLE_KEYS` en compte
**25**, pas 8 ; les cinq restantes sont nommées dans `UNDETECTED_INTERVENTIONS` avec ce qui leur
manque), **D28 · 26/08** (absorbée par D35 et D38). Les poser aurait coûté trois lots pour rien.

**Le refus le plus coûteux du dossier cachait plus gros que lui.** D43 · 26/08 fait lire le coût
d'une mission sur `mission_commercial_terms.loaded_daily_cost_cents`, la seule colonne que
l'application écrive. En mesurant, le lot a trouvé **cinq** calculs différents de la même marge et,
surtout, que **l'alerte de seuil de marge et la « marge par canal » — « l'indicateur le plus
stratégique » du PDF 8 — ne s'étaient JAMAIS déclenchées** : elles lisaient `missions.daily_cost`,
que rien n'écrit. Quatrième occurrence de « colonne lue, jamais écrite ».

**Ce qui est livré**, par ordre de ce que ça débloque :

| Décision                                | Ce qui part en production                                                                                                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D43 · 26/08**                         | le coût vient des conditions commerciales ; la colonne « Marge » s'ouvre, et deux indicateurs muets se réveillent                                                                                         |
| **D44 · 26/08**                         | la coupure du statut commercial passe de 7,5 à **7** — un compte noté 7 cesse de dire « GO » en se rangeant « À suivre ». Cliquet GA-56, qui sait dire NON dans les deux sens                             |
| **D45 · 26/08**                         | rédaction financière unifiée sur `redactFinance` : `marginPercent` **présent et `null`**, jamais retiré ; `canReadFinance` voyage avec la réponse pour distinguer « pas ton périmètre » de « pas mesuré » |
| **D47 · 26/08**                         | la fiche mission lit le droit financier comme la liste (`can`, pas `hasPermission`) — un membre à accord nominatif pouvait **saisir** le coût sans jamais pouvoir le relire                               |
| **D48 · 26/08**                         | un snapshot écrit tout ; la rédaction se fait à la LECTURE. Un droit de lecture ne décide plus de ce qui s'écrit                                                                                          |
| **D39 · 26/08**                         | marqueur `@WorkspaceRead` — les routes de LECTURE cessent d'emprunter `data:export`. GA-05 **descend de 367 à 361** routes nues                                                                           |
| **D37 · 26/08**                         | « projet encore en jeu » se définit dans `projects` ; trois sous-ensembles convergent, cliquet GA-57                                                                                                      |
| **D27 / D50 · 26/08**                   | les quatre barèmes de preuve redeviennent atteignables. `detected_project` passe de **0 à 255** formes sur 2 048 ; et la colonne `source` cesse de prendre le nom d'une voie de code pour un témoin       |
| **D5 · 26/08**                          | l'annonce à 80 % des crédits, et un blocage qui DIT ce qui reste, quand ça recharge et comment passer à l'offre supérieure                                                                                |
| **D2 / D49 · 26/08**                    | photo mensuelle des **stocks seulement** — les flux se recalculent. Quatre états, dont « pas de photo le mois dernier », qui n'est pas « rien le mois dernier »                                           |
| **D10 · 26/08**                         | le favori générique par utilisateur, sur les comptes et les contacts. ⚠️ **Refus levé** : il était refusé depuis le 26/08                                                                                 |
| **D17 · 26/08**                         | le lexique par espace : 8 concepts, 37 libellés d'objet, et un terme interdit qui OBLIGE à nommer son remplaçant. ⚠️ **Report levé**                                                                      |
| **D34 · 26/08**                         | l'entrée back-office s'AJOUTE au lieu de remplacer ; « À implémenter. » disparaît ; l'adresse de la console vient de l'API, jamais d'une `VITE_*`                                                         |
| **D40 · 26/08**                         | le débriefing de fin de mission passe sous **Missions** — l'écran de celui qui revient                                                                                                                    |
| **D51 · 26/08**                         | la barre latérale allume la bonne entrée sur neuf routes qui n'allumaient rien                                                                                                                            |
| **D33 · 26/08**                         | l'onglet « Favoris » cesse de mentir quand il est vide ; la messagerie porte enfin le contrat de connecteur (**dix** `throw` nus, pas sept)                                                               |
| **D42 · 26/08**                         | la démonstration montre une facture contestée — treize lignes, `reminders_sent = 0`, raison de couverture **réécrite** et non déplacée                                                                    |
| **D35 / D30 / D36 / D38 / D53 · 26/08** | un doublon mort supprimé, une parité prouvée par test, trois dérivations ramenées à une                                                                                                                   |
| **D29 / D25 / D46 · 26/08**             | un refus périmé inscrit au registre, un rouge quotidien permanent remplacé par un `NOT RUN` **compté**, un arbitrage documenté réaffirmé pour qu'on cesse de le « corriger »                              |

**Ce qu'on ne promet pas.** **D14 · 26/08** — le visage de Laura est **accepté**, mais rien ne part
tant que Louis n'a pas fourni une image dont le droit à l'image est établi. **D25** et **D32**
demandent une action hors dépôt (secrets GitHub, console Railway). Et les 290 items `ABSENT` du §11
du tracker restent ce qu'ils sont : ce que la source contient et que le produit ne fait pas.

**Trois leçons d'exécution, payées dans cette vague :**

1. **Trois collisions d'horodatage de migration**, entre agents parallèles branchés chacun sur
   `origin/main` — aucun conflit git, aucune suite ciblée en mesure de les voir, chaque branche
   juste prise seule. Seule la CI les a dites. Quand plusieurs agents d'un fan-out peuvent écrire une
   migration, **leur attribuer le numéro dans le prompt**.
2. **Deux primitives de tendance écrites en parallèle**, chacune portant un état que l'autre n'avait
   pas. Fondues en une : `sense` (une liste qui grossit n'est pas une bonne nouvelle) et `stock`
   (il n'y aura jamais de photo) ne se remplacent pas l'un l'autre.
3. **Une preuve de code mort se périme.** Le signalement de D33 était juste au commit qui l'a produit
   — et faux deux jours plus tard, parce qu'un autre lot du même dossier avait branché les cinq vues
   de `/contacts`. L'agent a refusé de supprimer, et il a eu raison.

---

## Arbitrage du 29/08 — les mots-clés de Découvrir ne se « feront » pas appliquer au registre (#1180)

**Le retour** : « les filtres ne s'appliquent pas, les résultats ne sont pas pertinents ». Le lien
que Laura avait produit était `/discover?sectors=industry&department=31&headcount=1000%2B&keywords=aéronautique,+défense`
— **sans `signals`**. Le champ « Mots-clés » n'est lu que par la source `hiring` du mode Signaux
(`apps/ia/app/routers/discover_signals.py:609`) : sans signal coché, la recherche part du REGISTRE,
où le mot-clé n'existe pas. Le copilote composait donc une recherche dont le critère central de la
demande ne pouvait pas s'appliquer.

Une première moitié est déjà livrée : le champ **le DIT** quand il ne s'applique pas
(`FilterRail.tsx`, `Field notApplied`) — un critère qui n'agit pas sans le dire est indiscernable
d'un critère cassé. Restait la moitié de fond, et deux issues possibles.

**Refusé — « faire s'appliquer les mots-clés en mode Registre ».** Le seul levier plein-texte du
registre est `q` (`DiscoverFilters.freetext` → `CompanyDiscoveryFilters.q`), et les deux sources le
lisent comme une **raison sociale**, pas comme une activité. Le dépôt l'écrit déjà noir sur blanc
pour Pappers — « y mettre "Lyon" ramènerait les sociétés nommées Lyon, pas les lyonnaises »,
`apps/ia/app/routers/discover.py:250-258` — et refuse pour cette raison exacte d'y router la ville.
Y router « aéronautique » rendrait les sociétés **nommées** Aéronautique. Ce ne serait pas appliquer
le critère : ce serait une fausse réponse qui a l'air juste, ce qui est pire qu'un critère qui dit
qu'il ne s'applique pas. Le levier EXACT pour une activité existe déjà et s'appelle `sectors` / le
code NAF.

**Retenu — Laura n'émet plus la combinaison.** `find_accounts` (`apps/ia/app/services/chat_tools.py`)
écarte des mots-clés orphelins, NOMME ce qu'il écarte (`keywords_not_applied`) pour que la réponse
le dise plutôt que de les faire disparaître en silence, et refuse une recherche qui ne tiendrait que
sur eux. Le schéma de l'outil porte la règle en clair : « pour viser une ACTIVITÉ, utilise `sectors`,
pas les mots-clés ». Tests : `apps/ia/tests/test_chat_action_tools.py`.

**Ce qui reste vrai et n'est pas corrigé ici** : même en mode Signaux, les mots-clés ne mordent que
sur la source `hiring` — `list_tender_buyers` et `list_award_buyers` ne les reçoivent pas, et aucun
filtre aval ne les applique. Une recherche « appel d'offres » + mots-clés les ignore donc encore,
sans le dire. La note d'écran (`notApplied`) ne se déclenche qu'en l'absence TOTALE de signal.

---

## La vague L — 30/08/2026, ~25 lots (PR #1263 et #1264)

Tracker : [`agent_docs/dossier-26-aout-2026.md`](dossier-26-aout-2026.md) §8.L et §9.
Recette live : [`agent_docs/recette-a-faire-26-aout.md`](recette-a-faire-26-aout.md) section M.

### Capacités livrées — à ne PAS recoder

| Capacité                                                                                                    | Où elle vit                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Une suite de relances au même sujet s'affiche comme UN fil, avec son compte de messages                     | `apps/api/src/modules/mailbox/no-reply.ts` (`mergeRelatedBuckets`) — fusion conservatrice, 30 j                                                                                        |
| La bascule automatique du board d'effort sur réponse positive / rendez-vous                                 | `apps/api/src/modules/sprints/` (`applyEvent` + `SprintProgressionBus`/`Listener`), déclenchée par `ContactsService.recordOutcomeAction`. Idempotente par `(compte, événement, CAUSE)` |
| Une clé d'idempotence sur le routeur d'actions                                                              | `packages/contracts/src/schemas/action-router.ts` + table `action_dispatch_attempts` (unicité posée par la BASE)                                                                       |
| La révocation SERVEUR à la déconnexion Salesforce et Pipedrive                                              | `salesforce.client.ts` / `pipedrive.client.ts` (`revoke()`), échec **dit** à l'utilisateur. ⚠️ Attio a le même défaut, **non traité**                                                  |
| Frais de mission et facture entrante du sous-traitant, amortis dans la marge                                | `mission_expenses` + `supplier_invoices`, `missionMarginWithExpenses`. La marge sans eux reste nommée « hors frais »                                                                   |
| Le seau `errors` du rapport d'import                                                                        | `packages/contracts/src/schemas/import.ts` + `withRowError`. La somme des seaux égale le nombre de lignes lues                                                                         |
| La provenance d'une arête d'INFLUENCE d'organigramme                                                        | `orgInfluenceEdgeSchema.sourceIds` + `derivedAt` — **jamais `observedAt`**, une inférence n'a pas de date d'observation                                                                |
| Le coût de l'intercontrat dans l'intervention `long_bench`                                                  | `bench-cost.ts` → `LauraPlan.benchCost` (résultat STRUCTURÉ, l'écran compose la phrase dans les deux langues)                                                                          |
| Les cinq axes du score de fit de Découvrir                                                                  | `discover-ranking.ts` (`fitAxesFor`) → `FitBadge`. **3 axes mesurés sur 5**, les deux autres NOMMÉS non évaluables                                                                     |
| La stratégie par classe d'accès, le filtre de classe en URL, les motifs d'exclusion                         | `apps/web/src/features/discover/`                                                                                                                                                      |
| L'accessibilité sur la LISTE des comptes (colonne + filtre)                                                 | `GET /accounts/access-summary` + `AccountContent.tsx`. ⚠️ Les 5 axes sur la fiche ont leur chemin de LECTURE, **aucun producteur ne les écrit** pour un compte du portefeuille         |
| « + Créer un besoin » depuis la liste des besoins                                                           | `CreateNeedDialog.tsx`. Rattachement à un projet EXISTANT seulement — la route l'exige                                                                                                 |
| Cinq mesures produit (cohorte J+30, rétention 3 mois, marge de Bellum, cadence, consultants par commercial) | `apps/api/src/modules/analytics/manager-kpi.ts`. La marge de Bellum rend `currency_mismatch` : EUR vs USD, **Bellum ne convertit rien**                                                |
| La version de prompt sur une trace, l'environnement sur un coût                                             | `chat_orchestrator.py` (`prompt_version_for('advisor')`), `provider_costs.environment` (les lignes anciennes valent « inconnu », jamais « production »)                                |
| La bibliothèque d'objections curée dans le prompt d'ANALYSE et la fiche de combat                           | `bellum_strategy.py`, `bellum_battlecard.py` — bornée à 6 objections sur 33, +1 876 caractères par appel                                                                               |
| Trois familles de questions de découverte (9 → 12)                                                          | `packages/contracts/src/schemas/meeting-questions.ts`. Contenu sourcé verbatim des fiches du dépôt                                                                                     |

### Ce qu'on ne promet pas — vérifié, et refusé avec sa raison

- **Les deux axes morts du score partenaire (Marge 20, Accès 25)** ne peuvent PAS être câblés sans migration : ni `mission_commercial_terms` ni `account_partners` ne portent de clé vers un partenaire précis. Le jeu de démo le confirme — les partenaires seedés et les partenaires de compte ne partagent aucun nom.
- **Le montant du pipe n'est PAS sous droit financier** — `c53_montant_du_pipe`, déjà tranché. Un lot l'a re-proposé, un test le protège désormais.
- **Trois des quatre prochaines actions d'un besoin** supposent un fait de `submissions` non joint sur la ligne de besoin. Trois branches vraies valent mieux que quatre dont une devine.
- **`get_job_changes`** (le 14ᵉ outil de Laura) n'a **aucune capacité REST** derrière : le journal ne rend qu'un COMPTEUR, jamais la liste.

### Deux gardes qui ne gardaient pas — corrigées

- **GA-30** ne balayait que `apps/web/src` : `packages/ui` lui était invisible, et le bouton à icône seule faisait 36 px au doigt. ⚠️ **616 boutons à TEXTE restent sous 44 px, sur 271 fichiers** — chantier à part, au cas par cas (un lien dans une phrase doit rester petit).
- **GA-42** affirmait que `@nestjs/event-emitter` était global. Le paquet n'existe nulle part dans le dépôt. Ligne retirée.

## ORION V12 — 31/08/2026 (successeur de DATAFORGE V10)

Tracker : [`agent_docs/orion-v12-2026-08-31.md`](orion-v12-2026-08-31.md).

**Le corpus `dataforge_rag_chunks` accueille aussi le Drive interne Bellum (#3586, 04/10/2026)** — module
`apps/api/src/modules/internal-knowledge/`, cron 10 min, chunks `DRIVE_INTERNE` archivés (`archived_at`) jamais
supprimés, e-mails/téléphones masqués. Clés : `agent_docs/env-reference.md` › « Drive interne Bellum ». Appelants de
`search_dataforge_rag_chunks` : `/rag/dataforge/search` et l'outil de Laura `search_sector_referential` (`chat_tools.py`) ;
**l'analyse (`/analyze`) ne l'appelle PAS** — non branchée, à traiter séparément.

**ORION V12 est le successeur de DATAFORGE V10** — même espace de clés
`DF-XXXX`, même grain compte × domaine (78 870 = 1 195 × 66) pour son propre
`30_FAIT_COMPTE_DOMAINE_V10.csv`, qui est une décomposition NORMALISÉE du même
CSV canonique à 158 colonnes que `ingest-dataforge.ts` sait déjà lire — **pas
une seconde donnée, pas un second pipeline.**

### Capacités livrées — à ne PAS recoder

| Capacité                                                                                     | Où elle vit                                                                                                                  |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 3 849 chunks RAG ORION V12, prêts à vectoriser, jamais filtrés sur les 20 garde-fous qualité | `dataforge_rag_chunks` + `match_dataforge_rag_chunks` (jamais d'exclusion structurelle d'un chunk `account_id IS NULL`)      |
| Recherche sémantique + rattrapage d'embeddings sur ce corpus (zéro-clé strict)               | `apps/ia/app/services/dataforge_rag_chunks.py`, routes `POST /rag/dataforge/search` et `/backfill-embeddings`                |
| Statut de sales-readiness de 1 195 comptes (`statut_code`, 9 valeurs fermées)                | `dataforge_account_statuses` + `OrionAccountsService`                                                                        |
| La pénétrabilité, structurellement JAMAIS nue (toujours avec sa couverture)                  | `OrionAccountsService.statusFor` → `{ score, couvertureTotale, caveat }`, gardé par `orion-penetrabilite-jamais-nue.spec.ts` |
| Le registre qualité (20 anomalies, 6 critiques — pas 7) lisible depuis une recherche produit | `dataforge_data_anomalies`, miroir 1:1 avec les chunks `GARDE_FOU_QUALITE`, prouvé par `orion-anomalies-rag-parity.spec.ts`  |

### Ce qu'on ne promet pas — vérifié, et refusé avec sa raison

- **Le vivier de 12 493 candidats (`27_VIVIER_CANDIDATS_NETTOYE.csv`)** — donnée personnelle à grande échelle, jamais ingérée : base légale et durée de conservation à trancher par Louis, pas par une tâche technique.
- **Les organigrammes à 98 colonnes (`74_V4_ORGANIGRAMMES.csv`)** — refus déjà écrit dans le dépôt, respecté.
- **Le branchement dans le tour de conversation LIVE de Laura** — la capacité de recherche existe et est testée, mais rien ne l'appelle encore depuis le copilote (le tool-loop vit en partie dans `apps/api/src/modules/laura/**`, hors périmètre de ce lot). Un commercial qui discute d'Enedis avec Laura ne voit donc PAS encore remonter automatiquement l'alerte AN-001.
- **Aucune ingestion réelle exécutée** — le pack (172 Mo) est gitignoré ; les trois scripts (`ingest:orion-rag-chunks`, `ingest:orion-accounts`, `ingest:orion-anomalies`) sont écrits et testés sur fixtures, jamais lancés contre le vrai fichier (geste d'opérateur, comme `ingest:dataforge`).

## L'engagement sort des notes — surveillance des contrats sur facture (02/09/2026)

**Le défaut, textuellement.** Un client vendu « 3 mois d'engagement, 119 € par
mois » était enregistré comme UNE ligne de `manual_billing_terms` portant UNE
référence de facture, UN statut de paiement, et une PHRASE dans `notes` :
« engagement 3 mois, à suspendre à la main fin novembre ». Le docblock de
l'entité l'assumait — « descriptive et jamais lue par une garde ». Donc rien ne
pouvait dire que l'engagement était échu, ni qu'aucune facture n'avait été émise
depuis deux cycles : **en base, un client parfaitement à jour et un client qu'on
a oublié de facturer depuis trois mois sont la MÊME ligne, inchangée.**

C'est le défaut n°1 du dépôt sous une autre forme : non pas « du code que
personne n'appelle », mais **une donnée que rien ne peut lire**.

### Ce qui est livré — à ne PAS recoder

| Capacité                                                                                         | Où elle vit                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| L'engagement en NOMBRE de mois (`NULL` = aucun, jamais `0`) + le destinataire réel de la facture | `manual_billing_terms.commitment_months` / `billed_to_name` / `billed_to_kind` / `billing_email` / `billing_phone` |
| Le journal des factures émises — une LIGNE par facture, avec la période couverte                 | table `manual_billing_invoices` (unique par `(workspace_id, lower(reference))`), `ManualBillingInvoiceEntity`      |
| LA dérivation : ce qui est en retard et depuis combien de jours                                  | `apps/api/src/modules/admin/manual-billing-schedule.ts` (`billingHealth`, pure, `today` en paramètre)              |
| La colonne « Engagement · état » + le bandeau rouge du back-office                               | `facturation/_components/billing-health-badge.tsx` et `manual-clients-panel.tsx` (`?view=manuel`)                  |
| Le geste qui alimente le journal (période DÉDUITE de la plus ancienne qui manque)                | `invoice-ledger.tsx` → `POST internal/admin/clients/manual/:workspaceId/invoices`                                  |
| Le balayage quotidien 07 h 10 Europe/Paris, toujours `logger.warn` (signal métier)               | `manual-billing-sweep.service.ts`, interrupteur `MANUAL_BILLING_SWEEP_DISABLED` (registre GA-84)                   |

**Les quatre alertes** : facture manquante (après 7 j de grâce, `danger` à
30 j) · facture émise non encaissée (après 30 j) · **engagement échu sans aucune
facture postérieure** (`danger` — le cas qui a fait écrire le chantier) ·
engagement à échéance sous 15 j (`info`).

### Ce qu'on ne promet pas

- **Aucune suspension automatique.** Le produit n'a jamais eu de porte de fin de
  contrat, et ce lot n'en pose pas : il rend l'échéance VISIBLE, la décision
  reste humaine. Un contrat mal saisi couperait sinon un client qui paie.
- **Aucun document émis, aucune relance envoyée.** Les références pointent vers
  les factures réellement émises dans l'outil comptable.
- **Aucun engagement deviné pour l'existant.** La reprise crée une facture par
  ligne portant une référence (période déduite de la périodicité, `issued_on`
  laissé `NULL` — la date d'émission n'a jamais été saisie), mais ne backfille
  AUCUN `commitment_months` : les durées vendues vivent dans des phrases
  hétérogènes, et les relire produirait des engagements inventés. L'écran écrit
  « engagement non renseigné » tant qu'un humain n'a pas tranché — ce qui est la
  vérité, et se corrige en un geste sur l'écran Facturation.
- **`paid_on` peut être `NULL` à côté de `payment_status = 'paid'`** : les lignes
  reprises sont encaissées sans qu'on sache QUAND. La dérivation lit le statut,
  jamais la date.

## Les retours du 06/09 — lisibilité des comptes, logos des outils, et le bon Thales (PR #1695, #1696, #1697)

**Le corpus**, à connaître avant d'ouvrir ces issues : les **102 issues ouvertes
du 06/09 ne sont pas 102 retours**, ce sont **deux documents** découpés par le
widget de signalement — 55 morceaux sur la mémoire marché (#1417 → #1640) et 47
sur la refonte du back-office (#1642 → #1688). Leurs titres sont des en-têtes de
section (« CONTEXTE », « CE QUE JE VEUX », « EXISTANT »). ⚠️ **Aucune ne dépasse
le seuil de 3 000 caractères de texte humain** (max mesuré : 3 334) : trier au
volume aurait conclu « zéro spec ».

### Ce qui est livré — à ne PAS recoder

- **La colonne « Compte » ne peint plus par-dessus le score** (#1623). `row.employees`
  portait `shrink-0 truncate`, deux classes contradictoires : rien n'était borné, et
  un `<td>` de `table-fixed` ne clippe pas. **20 lignes sur 25 débordaient**, la pire
  de 547 px. `AccountTableRow.tsx` — les deux enfants de la ligne 2 sont en `flex-auto`.
- **Le plancher de la table des comptes vaut la SOMME de ses colonnes** — `accountsTableShell.ts`,
  écrit UNE fois, lu par la table et son squelette. Il valait `1220px` pour 1 056 px de
  colonnes : le correctif de #1417 avait rétréci les colonnes et laissé le plancher.
  Écrit en `rem`, ce qui **clôt D337**.
- **Chaque outil de Réglages › Intégrations affiche son vrai logo** (#1614) —
  `connector-logos.ts` — depuis #3973.7 (16/10) il lit le registre unique `chat/view/brand-logos.ts` (le même que le sélecteur de Laura, SVG sous licence), le relais `/logo?domain=` est retiré. L'icône `lucide` reste le REPLI (Google : trois logos, aucun seul ; Attio : fichier de Louis attendu) ;
  `webhook`, `mcp`, `ats`, `telephony`, `admin_docs` n'ont pas d'éditeur et le disent.
- **Une ambiguïté de mémoire marché se dit, elle ne se tranche plus au hasard** (#1617) —
  `market-company-resolution.ts`, l'arbitre UNIQUE des deux chemins de lecture. Quatre
  états (`resolved`/`ambiguous`/`unresolved`/`unavailable`), départage par
  `registry_country`, golden tests dans les deux sens.
- **Tout chemin vers un fichier du corpus passe par une porte TYPÉE** — `corpusFile()`.

### Les gardes

| Garde                          | Ce qu'elle tient                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **GA-255** (nouvelle)          | `shrink-0` + `truncate` sans borne de largeur. Retire les commentaires avant de lire — sans ça elle s'attrapait elle-même sur sa propre justification. |
| **GA-118** (élargie)           | Suit un `className={CONST}` jusqu'à sa constante, lit les entêtes du fichier voisin, et porte un **témoin NOMMÉ** sur `/accounts`.                     |
| `market-memory-import.spec.ts` | Aucun chemin ne contourne `corpusFile()` — ni le nom en dur, ni le nom COMPOSÉ.                                                                        |

### Ce qu'on ne promet pas — refusé avec sa raison

- **La hiérarchie d'identifiants à cinq échelons de #1617** (SIREN → registre → domaine
  → LinkedIn → nom) : le corpus n'en porte **aucun des trois premiers**, et les fichiers
  à URL de profil ne sont pas importés. Seul le **pays** est livré. Un identifiant qu'on
  n'a pas ne départage rien.
- **« Domaine > nom » comme ordre fixe** : contredit par la production —
  `group.bnpparibas` appartient à une filiale à 1 parcours quand la maison mère en a 282.
- **`manual_override`** : une correction humaine sur une donnée PARTAGÉE entre espaces
  concurrents est une décision produit, pas un détail d'implémentation.
- **La fusion des preuves ESN en une ligne** (#1605) : arbitrage de Louis du 06/09, on
  garde la séparation — la raison est écrite dans `observed-esn.ts:8-30`.

### Deux défauts trouvés que personne n'avait demandés

1. **`IMPORTABLE_FILES` — la liste qui exclut les fichiers à données personnelles —
   n'était lue par aucune ligne de code.** Le script écrivait ses sept noms en dur, plus
   un huitième chemin composé à l'exécution, pendant que son commentaire affirmait le
   contraire. L'exclusion tenait par discipline, pas par une porte.
2. **GA-118 était borgne exactement là où le défaut vivait** : `/accounts` était NOMMÉ
   dans ses exceptions **et** silencieusement sauté par son assertion (« les fichiers dont
   les entêtes vivent ailleurs »). Une exception se voit ; un cas sauté, non.

## Le filet du back-office, et les parcours observés sur la ligne de compte (PR #1699, #1700 — 06/09/2026)

**Le corpus** : les 100 issues ouvertes du 06/09 sont **deux documents** découpés par le
widget — 53 sur la mémoire marché (#1417 → #1640) et 47 sur la refonte du **back-office**
(#1642 → #1688). Louis a tranché le 06/09 : les deux avancent **en parallèle**, ce qui est
tenable parce qu'ils déploient sur des services **disjoints** — le back-office a son propre
projet Vercel. ⚠️ Le texte HUMAIN médian fait ~1 000 caractères : trier au volume conclut
« zéro spec », à tort.

### Ce qui est livré — à ne PAS recoder

- **`apps/dashboard-manager` a un filet** (#1642). Il n'en avait **aucun** : 124 fichiers
  source, **zéro** fichier de test, et **zéro occurrence de `dashboard-manager` dans
  `ci.yml`**. `lint`, `format`, `check-types` et `build` l'atteignaient (portée `node`),
  si bien que **tout ce que la CI savait de cette application, c'est qu'elle compilait**.
  Livré : vitest (`vitest.config.mts` — `.mts` parce que c'est la seule app sans
  `"type": "module"`, et l'ajouter changerait l'interprétation de tous ses fichiers de
  configuration Next), un job `Test (back-office)`, une portée `backoffice`, et le job
  câblé dans `CI Status` **aux deux endroits**.
- **Les deux INTERDITS de #1642 sont tenus par des gardes** :
  `couleurs-passent-par-un-token.test.ts` (cliquet sur 15 littéraux hérités, chacun avec
  sa raison, dont un **faux positif nommé** — `#1234`, un numéro de ticket dans un
  placeholder ; mesuré : 462 `var(--token)` contre 20 hexadécimaux, la règle était déjà
  tenue à 96 %) et `aucune-librairie-ui.test.ts` (aucune librairie de composants en
  dépendance **servie** — les devDependencies ne sont pas visées, l'intention écrite étant
  « le manager reste léger », ce qui parle du paquet servi).
- **`market_paths_observed` voyage avec la ligne de compte** (#1577) —
  `accounts.controller.ts`, `withMarketPaths()`. Une seule lecture pour les 25 lignes de la
  page. **Lu dans le CONTRÔLEUR**, parce que GA-07 exclut les `.controller.ts` de sa mesure
  et recommande elle-même l'orchestration à cet endroit.
- **`dashboard-manager` a enfin un `scope` de commit.** Il n'existait pas dans le
  `scope-enum` : ses commits empruntaient le périmètre d'une autre application, donc
  étaient invisibles à toute lecture par périmètre.

### Les gardes

| Garde                                          | Ce qu'elle tient                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`ci-status-garde-tous-les-jobs`** (nouvelle) | Tout job déclaré dans `ci.yml` est dans les `needs` de la porte **ET** évalué dans sa liste `results`. **Troisième fois** que le dépôt paie ça (`test-web`, `test-site`, `test-backoffice`) ; le commentaire « l'ajouter aux DEUX endroits » existait déjà et n'a arrêté aucune des trois. Elle part des jobs RÉELLEMENT déclarés, jamais d'une liste écrite à la main. Exempte les jobs `continue-on-error: true` (leur auteur les a déclarés consultatifs) — et **vérifie que l'exemption désigne quelque chose**, sinon c'est un saut silencieux. |
| `couleurs-passent-par-un-token`                | Liste par FICHIER et par VALEUR, pas un compte plafonné : un compte laisse passer l'échange « j'en retire un ici, j'en ajoute un là ».                                                                                                                                                                                                                                                                                                                                                                                                               |
| `#1577 — la démonstration`                     | **Aucun semis n'écrit dans les tables PARTAGÉES de la mémoire marché.** Dit NON le jour où quelqu'un « remplit la démo » en y injectant des parcours inventés.                                                                                                                                                                                                                                                                                                                                                                                       |

### Ce qu'on ne promet pas — refusé avec sa raison

- **#1654, la génération de facture légale : ne démarre pas.** Deux verrous indépendants —
  Louis exige lui-même une validation comptable dans l'issue, et `.claude/projet.md` §8
  porte le refus permanent « aucune facture légale n'est émise ». #1653 (le calendrier) et
  #1655 (les relances préparées, jamais envoyées) sont livrables **sans** lui.
- **#1575, le 5ᵉ compteur : reporté, et sa prémisse est FAUSSE.** L'issue affirme que
  « 0 » cliquable serait « cohérent avec ce qui existe » ; le code dit l'inverse — **#1580
  a décidé qu'une métrique décisionnelle à zéro est NEUTRE et non cliquable**. Par ailleurs
  les quatre compteurs sont des `COUNT(*)` sur tout le filtre : le cinquième doit passer
  par l'arbitre `resolveMarketCompany`, et le refaire en SQL recréerait le défaut de #1617.
- **Semer la mémoire marché pour la démonstration** : ce serait un **défaut**, pas un
  oubli. Ces tables sont PARTAGÉES (GA-16) et lues par les espaces réels — y écrire des
  parcours fictifs ferait apparaître des observations inventées chez des clients qui
  paient. La salle porte de vrais noms (Thales, SNCF, BlaBlaCar) : le fragment s'y allume
  avec de la **vraie** donnée, ou pas du tout.

### Ce que la recette N'A PAS pu prouver

⚠️ **Le back-office n'est recettable que par le porteur du secret.** Basic Auth à secret
PARTAGÉ : la recette répond `401` avec `www-authenticate: Basic realm="BellumAI
Backoffice"`. Verdict **BLOCKED (configuration)**, jamais FAIL — et le 401 prouve quand
même que l'application tourne, puisque sans identifiants configurés le middleware rend 503.
`.claude/projet.md` §7 ne décrit que `app.bellum-ai.com` et `/demo` : le back-office est une
**troisième surface** sans chemin de recette écrit. C'est #1668 qui l'ouvrira.

### Un défaut trouvé que personne n'avait demandé

**Mon propre test a attrapé mon propre code.** La première version du fragment testait
`typeof x === 'number'` — et `typeof 0 === 'number'` est **vrai** : l'écran écrivait
« 0 parcours observés », exactement la phrase que la doctrine interdit. Les deux surfaces
vérifient désormais `> 0`, et l'écran ne se fie pas au service pour ça.

## Le palier back-office commence — chrome, changelog, vie privée, identité (PR #1705, #1706, #1708 — 06-07/09/2026)

Les 45 issues `beta-backoffice` du 06/09 ne sont pas 45 demandes : c'est **UN palier
complet de refonte du manager** (design system, cockpit revenus, analytics produit,
sécurité/RBAC, runbook), avec ses propres codes internes R0.1 / R2.2 / RC.2 / RS.3.
Deux lots sont livrés ; le reste est nommé plus bas.

Antériorité mesurée avant d'écrire : de #1642/#1643, **seule la garde était livrée**
(PR #1699, le matin même) — les 12 primitives et les 4 graphiques sont ABSENTS. Les
43 autres l'étaient toutes.

### Ce qui est livré — à ne PAS recoder

- **`/changelog` dans le manager (#1704)** — le catalogue livré ET l'état de
  diffusion de la Newsletter Changelog. `ChangelogNewsletterService.describeDelivery()`
  réutilise `fetchCandidates()`, **la même requête que l'envoi** ; six familles qui
  s'additionnent au nombre de lecteurs. Route `GET internal/admin/changelog`, posée
  DANS le module changelog et non dans `AdminModule` — retirer la newsletter doit
  retirer l'envoi et l'écran qui le suit, jamais casser le back-office.
- **Le rail à 6 sections (#1644, PARTIEL)** — `app/_components/nav-sections.ts`.
  Aucune URL ne change ; les entrées que l'issue nomme et qui n'existent pas encore
  ne sont pas affichées.
- **L'identité de l'environnement (#1675)** — logo réel extrait de
  `apps/web/src/assets/logo.svg` en `currentColor`, badge `NEXT_PUBLIC_VERCEL_ENV`,
  SHA cliquable, titre d'onglet préfixé. **Un environnement inconnu ne produit
  AUCUN badge** — on ne devine pas « production ».
- **La phrase d'écran obligatoire (#1678, PARTIEL)** — l'exemption d'une redirection
  se mesure sur le CODE, pas sur une liste recopiée.
- **Le masquage des e-mails (#1670.4)** — `lib/mask-email.ts` + `MaskedEmail`, six
  listes. Le journal de révélation reçoit la forme MASQUÉE et le contexte, **jamais
  l'adresse**.
- **Le balayage « aucun secret affiché » (#1671.1)** — deux règles : aucune variable
  non `NEXT_PUBLIC_` dans un fichier servi au navigateur, aucun CHAMP au nom de
  secret rendu.

### L'identité et les rôles (#1668, #1669 — 07/09/2026, PR #1708)

Le back-office était gardé par **un couple Basic Auth partagé à trois personnes** :
aucune révocation individuelle, aucune session, aucune identité — « le journal
d'audit dira _quelqu'un_ » — et aucun second facteur sur une console qui peut
supprimer un compte. Le middleware était BIEN FAIT ; c'est le modèle qui ne tenait
plus.

**La forme retenue est celle que l'issue décrit, et c'est ce qui la rend livrable :
une couche PAR-DESSUS le Basic Auth, commandée par une seule variable.**
`DM_ALLOWED_EMAILS` **absente** = chemin byte-identique à celui d'avant, aucun
cookie lu ni posé ; la retirer EST le retour arrière, et il prend une minute sur
Vercel. C'est ce qui a permis de livrer une porte d'entrée sans jamais risquer de
fermer la console sur nous-mêmes.

- **Identité** — mot de passe + TOTP vérifiés contre le **même Supabase que le
  produit**, en UNE requête. Le back-office ne garde donc aucun secret
  d'authentification : ni mot de passe, ni graine TOTP. Session de **8 h glissantes**
  matérialisée par un cookie signé, dont la clé est **dérivée d'`INTERNAL_API_SECRET`**
  plutôt que d'ajouter une quatrième variable à saisir à la main.
- **L'e-mail authentifié devient l'auteur** (`lib/operator.ts`) et part dans le
  journal d'audit à chaque mutation. Au passage, la route d'impersonation portait sa
  **PROPRE copie** de la lecture d'en-tête Basic (`operatorFromBasicAuth`, repli
  `dm-operator`) pendant que `lib/operator.ts` en portait une autre : deux lectures
  du même fait, dont une seule aurait appris l'identité. Il n'en reste qu'une.
- **Trois rôles**, et le rôle est **relu à chaque requête depuis la variable**, jamais
  depuis le cookie — sinon une rétrogradation survivrait huit heures à la décision de
  la prendre.
- **La porte est côté serveur, sur les 31 routes de `app/api/**`**, pas à l'écran :
un `viewer`qui appelle`/api/admin/users/x/delete` reçoit 403 sans avoir le bouton.

### Ce que ce lot a tranché, et qui n'était pas dans les issues

- **`DM_ENROLLMENT_OPEN`** — « TOTP absent → connexion refusée » appliqué au pied de
  la lettre voulait dire que **personne ne peut jamais se connecter** : aucun écran
  d'enrôlement n'existe ailleurs dans le produit. La fenêtre se pose le temps
  d'enrôler et se **retire** ; retirée, plus personne ne peut s'auto-enrôler, même en
  connaissant le Basic Auth et un mot de passe de la liste.
- **ABSENTE ≠ VIDE** — T4 de #1668 demande « `DM_ALLOWED_EMAILS` vide → 503 ». Les
  deux états sont distingués : jamais posée = inerte ; posée sans donner d'adresse = 503. Sans cette distinction, le lot n'était livrable qu'en pariant sur sa propre
  configuration.
- **La trésorerie est fermée en LECTURE** (`/facturation`, `/couts`, `/offres`,
  `/usage` — quatre URL du même écran). Arbitrage de Louis du 07/09, **plus large que
  la matrice de #1669**, qui dit « Lire un écran ✓✓✓ » et ne nomme que la trésorerie
  en exception. Écrit ici pour que l'écart se voie.
- **« Lire le journal d'audit »** (owner + operator dans la matrice) n'a **aucun écran**
  aujourd'hui : rien n'est inventé pour satisfaire la ligne. C'est #1666 qui l'apporterait.
- **La graine TOTP s'affiche** à l'enrôlement, une fois, à qui vient de prouver son mot
  de passe. C'est le seul secret que cette console rende, et la garde
  `aucun-secret-affiche` ne le voit pas (elle refuse les ACCÈS DE PROPRIÉTÉ au nom
  parlant). Écrit plutôt que caché : un second secret devra se justifier.

### Les gardes

`rail-et-environnement` (aucun lien mort, mesuré contre le disque ; les 11 entrées de
l'ancienne barre toutes placées) · `phrase-decran-sur-chaque-page` ·
`emails-masques-dans-les-listes` (+ « jamais dans un `<a>` ») ·
`aucun-secret-affiche` · `rien-ne-deborde-du-corps` ·
**`toute-route-declare-sa-capacite`** — les 31 gestionnaires de `app/api/**` exigent
chacun leur capacité, `/api/auth/**` exempté sur le CHEMIN (« la porte ne peut pas
exiger d'avoir déjà franchi la porte »), quatre gestes irréversibles épinglés un par
un. Elle a été **cassée volontairement** sur la route de suppression : deux tests
rouges, verts au rétablissement.

### Ce qu'on ne promet pas — refusé avec sa raison

- **#1654 (facture PDF légale)** : contredit « aucune facture légale n'est émise », et
  l'issue exige elle-même une validation comptable préalable. **Ne démarre pas.**
- **#1677 (runbook)** : son contenu est constitué des procédures RÉELLES de l'équipe.
  Les inventer produirait un runbook faux, « pire qu'un runbook absent » — la règle
  de l'issue elle-même.
- **Les contacts prospects du détail d'analyse** gardent leur adresse en clair : elle
  vit aussi dans un `mailto:`, et la masquer proprement veut dire retirer le mailto,
  donc supprimer un geste de support. Question posée dans #1670, pas tranchée.

### Trois défauts trouvés que personne n'avait demandés

1. **`/flags` et `/laura-site` rendaient hors de `main.wrap`** — contenu collé au bord.
2. **46 tableaux, 39 sans conteneur défilant.** Mesuré en prod : tableau de 1 312 px
   dans 1 292 px, `overflow-x: visible`, donc le BODY défilait. Le rail l'a RÉVÉLÉ,
   il ne l'a pas créé. Borne posée une fois sur `.wrap`.
3. **`<a><MaskedEmail/></a>`** — le lien avalait le clic de révélation. Le composant
   était juste et appelé ; son appelant le neutralisait. Seule la recette live pouvait
   le voir.

## L'associé qui rejoint une ESN, et les deux questions que la console ne savait pas poser (PR #1718 — 07/09/2026)

**Le retour de Louis** : « bedros est bien dans la team abricotlabs mais l'onboarding
est encore lancé quand il se connecte ». C'est le TROISIÈME tour sur le même sujet —
#1671 (le partage des réponses), #1671-bis (la résolution d'espace), et celui-ci.

**Ce qui restait était écrit dans le commit de #1671-bis**, sous « CE QUI N'EST PAS
FAIT » : `user_onboarding_state` est par UTILISATEUR, donc le questionnaire se
relance — et il se relance au PREMIER slug de l'étape courante, c'est-à-dire sur des
questions que l'entreprise a déjà renseignées. **Onze des douze questions du premier
temps sont des faits sur l'ESN.**

⚠️ **Le ✅ de l'étape 1 ne prouvait rien, et il m'a induit en erreur.**
`OnboardingStepper` calcule `done = i < currentStageIndex` : la coche est
POSITIONNELLE. Elle dit « tu es plus loin », jamais « ces réponses sont remplies ».
Un diagnostic fondé dessus conclut que la fusion marche — sans aucune preuve.

### Ce qui est livré — à ne PAS recoder

- **`inheritedAnswerKeys` + `isAnswerPendingForMember`** (`packages/contracts/src/schemas/onboarding.ts`),
  lues des deux côtés. La règle : une question d'ENTREPRISE remplie — même héritée —
  ne se repose pas ; une question PERSONNELLE héritée SE repose.
  **La raison de la seconde moitié** : `mergeWorkspaceAnswers` fait retomber une clé
  personnelle sur la valeur canonique. C'est juste pour NOURRIR un prompt, et faux
  pour DÉCIDER quoi demander — sans la distinction, l'associé hérite du frein
  commercial de son collègue et on ne lui pose plus jamais la sienne.
- **`EsnProfileWorkspaceResolver.resolveAnswersWithOrigin`** — le SEUL endroit qui
  connaisse l'identité, donc le seul qui puisse court-circuiter le cas
  mono-utilisateur (`canonicalRow.user_id === userId`). `inheritedAnswerKeys` ne voit
  que des valeurs.
- **`firstPendingSubStep`** (`apps/web/src/features/onboarding/lib/pending-steps.ts`)
  - le garde de `/onboarding`. ⚠️ **La branche ne se prend que si
    `inherited_answer_keys` est NON VIDE** : un utilisateur seul dans son espace n'hérite
    de rien et garde le chemin d'avant à l'octet près. La clé est
    `.catch([]).default([])` — pendant la fenêtre « front neuf sur API ancienne », le lot
    est inerte.
- **La console répond enfin aux deux questions du diagnostic**, qui n'avaient de
  réponse qu'en base de production :
  · `/users/[userId]` marque l'espace **ACTIF** — Bedros est membre d'APRICOT LABS ET
  propriétaire d'un espace personnel vide que le déclencheur d'inscription donne à
  chacun ; deux adhésions valides, seul le sélecteur tranche ;
  · `/esn/[id]` porte la **fiche ESN partagée** : qui la détient, sa version, chaque
  question renseignée ou vide. Sans ligne canonique, aucun membre n'hérite de rien
  et tout ce lot resterait sans effet.

⚠️ L'espace actif vient de `WorkspaceContextService.resolveActiveWorkspace`, appelée
depuis le **CONTRÔLEUR** — jamais une cinquième copie (c'est leur multiplication qui a
causé #1671-bis), et GA-07 désigne cette couche pour un geste qui traverse deux
domaines.

### Ce qu'on ne promet pas — refusé avec sa raison

- **Aucune VALEUR de réponse n'est exposée à la console.** Le positionnement, les
  secteurs visés et les types de comptes ciblés sont la stratégie commerciale d'un
  client. La question du support est « est-ce rempli ? », jamais « avec quoi ? » — le
  contrat ne transporte que `key`, `scope`, `filled`, et un test le tient par la FORME.
- **Le membre ajouté depuis la console** (`POST internal/admin/workspaces/:id/members`)
  n'obtient **aucun** choix d'espace : `workspace_active_selections` n'est écrite que
  par `switchWorkspace`, donc par l'acceptation d'une invitation. Le même défaut, par
  une autre porte. Non traité ici : la résolution d'espace décide de tout ce qu'un
  utilisateur voit ET de la facturation, et `.claude/projet.md` §10 en fait un arrêt
  obligatoire.
- **`user_onboarding_state` reste par utilisateur** (décision de #1671-bis, inchangée).
  Le partage se joue sur les RÉPONSES, pas sur l'avancement.

### Un défaut trouvé que personne n'avait demandé

Les pastilles d'espaces de `/users/[userId]` étaient **collées** : la console rendait
« Mon espace · owner**APRICOT LABS SAS** · member ». Visible seulement en lisant le
texte rendu de la page — aucun test ne pouvait le voir, l'environnement de test du
back-office étant `node` et non jsdom, par doctrine écrite.

---

## Lot des retours bêta du 07/09/2026 — quatre PR, 93 issues traitées

Session lancée sur `/livraison:issues` avec pour consigne « couvre tout ». Le
premier livrable n'a donc pas été du code mais un **tri mesuré** : sur les 93
issues ouvertes, **~80 sont du backlog de construction**, pas des corrections.
Les chiffrer comme des corrections aurait mené dans le mur. Une seule était un
vrai constat de bug.

### Ce qui est LIVRÉ

| PR    | Sujet                                                                        | Preuve en production                                                                  |
| ----- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| #1719 | **#1701** — le corps de la page ne défile plus sous la coque                 | 8 px → **0** sur `/dashboard`, 41 px → **0** sur `/demo`, 13 routes balayées          |
| #1720 | **#1667/#1662/#1664** — trois écarts promesse/fait du back-office            | CI verte ; comportement **non recetté** (back-office derrière `DM_BASIC_AUTH` + TOTP) |
| #1721 | **#1596/#1610/#1606/#1586** — quatre capacités mémoire marché déjà calculées | ROCHE 16 / ROCHE BOBOIS « aucun » / SCI RICHE ROCHE rien ; SNCF 3 familles de rôles   |
| #1722 | **#1642/#1643** — 12 primitives + 4 graphiques du socle back-office          | aucun appelant, **délibérément** — voir plus bas                                      |

### #1701 — la piste était bonne, la cause était ailleurs

Le journal du lot précédent désignait `#app-shell { height: 100dvh }`. La coque
n'était pas fautive : **ses descendants l'étaient**, de trois façons.

1. `menu-layout.tsx` écrivait `m-2 … h-full` — 100 % du parent **plus** 8 px de
   marge. Arithmétiquement intenable, et `MenuLayout` enveloppe TOUS les écrans.
2. Le cadre de contenu réclamait `h-full` **sans compter ses frères** (bandeau,
   pied de page) dans un parent `flex-col`. `max-h-[98vh]` était le pansement.
3. Dix-sept écrans redéclaraient `100dvh` **à l'intérieur** d'un viewport que la
   coque occupe déjà — dont un `min-h-[calc(100dvh-5rem)]` qui _devinait_ la
   hauteur de l'entête.

**Le corollaire est ce qui rendait le défaut cher : sans bandeau, ça tombe
juste.** `/login` mesurait 0 px. Le défaut n'apparaissait que sur les comptes
porteurs d'un bandeau — mode démo, alerte de crédits, incarnation. C'est-à-dire
jamais en test, toujours chez le client.

`overflow: hidden` sur la coque applique la loi D81 telle qu'elle est écrite. Il
n'est PAS le correctif : il est le rempart pour la seule cause qu'aucune garde ne
peut voir — un contenu qui déborde par sa TAILLE.

### GA-256 — une garde resserrée APRÈS mesure, pas avant

La première version attrapait vingt `max-h-[82vh]` légitimes sur des
`DialogContent` en portail. **Une garde qui a besoin de vingt exceptions ne
protège pas une règle, elle en invente une.** La règle a donc été réécrite en
mesurant le corpus, et exclut désormais pour des raisons _arithmétiques_ : un
`max-h-` ne peut pas rendre une boîte plus haute que le viewport ; une fraction
(`40vh`) ne réclame pas l'écran entier. Une seule exception nommée reste.

### Ce que GA-07 a refusé, et pourquoi c'était juste

Le lot mémoire marché injectait `MarketMemoryService` dans deux **services**. Le
cliquet des frontières de modules était **au plafond** (254 imports, 124
fichiers) ; le lot le portait à 255/126. Relever le plafond n'aurait rien gardé —
la garde **nomme elle-même** l'endroit où la dépendance doit vivre (le
contrôleur) et **ses précédents** (`oauth`, `projects`, `consultants`).

Bénéfice inattendu du déplacement : `computeForAccount` a un **second appelant**
qui n'a que faire de la mémoire marché, et les specs de service sont revenues
**à l'identique d'avant le lot** — ce qui prouve à soi seul que le calcul de
couverture n'a pas bougé.

### Ce qu'on ne promet pas — refusé avec sa raison

- **Le socle back-office n'a AUCUN appelant, et c'est assumé.** C'est le défaut
  n°1 du dépôt, choisi sciemment : il se referme au premier écran livré, alors
  que l'ordre inverse bloque six lots. L'exception `knip` est **datée** et le
  baril porte en entête la condition exacte de son retrait. **Si elle survit au
  premier écran consommateur, elle masque du code mort.**
- **Trois prémisses d'issues sont FAUSSES** et les livrer au littéral aurait
  introduit la régression : #1653 annonce un « plafond de 20 périodes » quand le
  code dit `MAX_PERIODS = 240` (tronquer casserait tout contrat de plus d'un an
  et demi) ; #1665 affirme que le motif d'incarnation n'est pas obligatoire — il
  l'est depuis #1670, front ET back ; #1667 et #1667.3 croient que
  `flags/page.tsx` et `api/page.tsx` sont un catalogue et un tableau de
  métriques, alors que ce sont un évaluateur par client et un testeur manuel.
- **Six demandes redemandent des refus déjà écrits** (#1575, #1605, #1617,
  #1417.2/.3, #1440.5) — répondu en citant la règle et le fichier.
- **La mémoire marché n'est pas semée en démonstration.** Refus antérieur du
  06/09, réaffirmé : tables partagées, GA-16.

### Ce qui reste OUVERT et attend un arbitrage

- **`manual-provisioning.service.ts` n'a aucun rollback** : un échec à l'étape 4
  laisse un espace orphelin, **aujourd'hui, en production**. Le plus urgent du
  palier ; non traité car la facturation est un arrêt obligatoire.
- La politique de crédits de la mémoire marché (#1639), les alertes par e-mail
  (#1671.3, #1676 — envoi sortant), l'exception nommée pour l'export CSV
  (#1672.2), `/admin/market-memory` (#1616).
- **La 2ᵉ ligne de `AccountTableRow` est saturée à 4,3×** et bloque #1417, #1577
  et #1582. Le popover est la seule des trois options qui ne consomme pas de
  largeur : **un geste règle les trois**.

### Pièges d'outillage payés dans ce lot

1. **`ls` rend du VIDE dans le bac à sable** — `apps/web/src/architecture/`
   semblait absent alors qu'il porte 40+ gardes. `/usr/bin/find` voit juste.
2. **`git diff --name-only` via le git de Homebrew (enveloppé par RTK) rend une
   sortie VIDE** pour 25 fichiers réellement différents. Le faux zéro ressemble à
   « ma branche est déjà dans main ». Seul `/usr/bin/git` dit la vérité.
3. **Un agent en worktree isolé ne peut lancer AUCUNE commande git** : le hook
   RTK réécrit `git` en `rtk git`, la garde d'isolation refuse tout lanceur qui
   ne soit pas littéralement `git`. Les deux mécanismes sont justes ; leur
   intersection a coûté un tiers du budget d'un agent. Prévoir au dispatch que
   l'orchestrateur commite.
4. **`.test()` sur une regex portant le drapeau `g` est STATEFUL** — re-commis
   dans ma propre garde, après l'avoir déjà catalogué.

---

## Lot du 07/09/2026 (soir) — le popover de contexte marché, et une garde rouge sur `main`

Reprise du lot précédent sur le premier chantier qu'il désignait. Un seul geste,
trois issues, **et un défaut de CI trouvé en chemin** qui vaut plus que le lot.

### Ce qui est LIVRÉ — PR #1724

| Issue     | Ce qu'elle devient                                                                       |
| --------- | ---------------------------------------------------------------------------------------- |
| **#1582** | Livrée : icône + popover « Contexte marché », 300 px, vocabulaire fermé, aucune date     |
| **#1577** | Le fragment a enfin une place — dans le popover, pas sur une ligne qui n'a rien à donner |
| **#1417** | Avance : la ligne 2 ne gagne aucun prétendant, et la vue carte morte disparaît           |

Le chiffre qui a tranché : la 2ᵉ ligne d'`AccountTableRow` est **saturée à 4,3×**
(159 px rendus pour 679 requis, production, 06/09). **Un popover ne consomme
aucune largeur** — des trois formes proposées, la seule qui n'aggrave pas la
saturation, et exactement celle que #1582 demandait.

Serveur : `GET /accounts/:id/market-context`, composé **dans le contrôleur**
(GA-07 au plafond, et la garde nomme cet endroit). **Trois réponses, jamais
deux** : `503` mémoire illisible · `null` lu-mais-non-couvert · l'objet. Lu **à
la demande** : vingt-cinq lignes affichées ne déclenchent aucune requête.

### Ce qu'on ne promet pas — refusé avec sa raison

- **Pas de ligne « Fit avec ton offre »**, que #1582 demande pourtant. L'axe
  `fit` est calculé (`apps/ia/app/services/score_axes.py`) et rangé dans
  `raw_analysis.scoreAxes` — mais **rien dans le web ne le lit**, vérifié le
  07/09 (`computeAccountScore` et `SCORE_AXES` côté TS n'ont aucun appelant).
  Une ligne qui dirait toujours « non mesuré » occupe la place sans rien dire.
  Arbitré avec Louis : le fit reste dans Score / axes — ce que l'issue dit
  elle-même (« le détail complet reste dans : Score / axes pour le fit »).
- **Aucun « Non », aucune date.** Zéro ESN observée se dit « à qualifier » : on
  n'en a pas vu, ce qui n'est pas « il n'y en a pas ». C'est la règle « non
  mesuré n'est pas zéro », appliquée à une négation plutôt qu'à un chiffre.
- **La vue carte de `/accounts` est RETIRÉE**, pas rebranchée. `AccountsGrid` /
  `AccountCard` n'avaient aucun importeur hors d'eux-mêmes (contrôle positif :
  `AccountTableRow`, lui, en a un) ; elle était morte en production et absorbait
  du travail à chaque lot. Arbitré avec Louis.

### Le vrai enseignement : une garde dont le CORPUS déborde de son job de CI

**GA-19 était ROUGE sur `main`** en arrivant, et personne ne pouvait le savoir.

Le cliquet des `?? 0` (`apps/web/src/architecture/display-primitives.test.ts`)
lit **quatre** racines, dont `apps/dashboard-manager/src`. Il vit dans la suite
**web**. La PR #1722 (socle graphique du back-office, mergée à 15h52) a ajouté
deux `?? 0` — donc fait monter le cliquet de 116 à 118 — **sans que `Test (Web)`
tourne**, parce que le filtre de portée ne déclenche le web que sur
`apps/web/` ou `packages/ui/`. La PR est passée verte ; `main` est resté rouge
pour la première personne qui toucherait au web. C'était moi, deux heures plus
tard.

**La portée d'un job doit couvrir la portée des gardes qu'il porte.** Le filtre
de `ci.yml` inclut désormais `apps/dashboard-manager/` dans le déclencheur du
job web, en plus de sa propre suite.

Les deux `?? 0` sont par ailleurs **légitimes** — de la géométrie, jamais une
valeur affichée : une LONGUEUR de série (`charts.tsx:237`) et l'ÉCHELLE d'un axe
empilé (`:334`, planchée par `Math.max(1, …)`). Le cliquet est relevé à 118 avec
cette justification écrite dans le fichier, ce que la garde prescrit elle-même.

### Ce qui reste OUVERT

Les cinq arbitrages parqués du lot précédent tiennent, moins un : **la vue carte
est tranchée (retirée)**. Restent le rollback de `manual-provisioning`
(le plus urgent, arrêt obligatoire — Louis l'a explicitement remis à plus tard),
la politique de crédits (#1639), les alertes e-mail (#1671.3, #1676),
l'exception CSV (#1672.2) et `/admin/market-memory` (#1616).

**Et une décision de méthode prise avec Louis** : le back-office
(`apps/dashboard-manager`, 39 issues ouvertes) **se recette par Louis lui-même**.
Il est derrière `DM_BASIC_AUTH` + TOTP, saisir des identifiants m'est interdit,
et « CI verte, comportement non vu » n'est pas une recette. Chaque lot
back-office sortira désormais avec **la liste exacte des gestes à faire et de ce
qu'il doit voir**, et attendra son PASS/FAIL.

## Les chiffres de BellumAI — MRR figé et trésorerie saisie (PR #1725 — 07/09/2026)

**Deux issues, et elles sont la RACINE de quatre autres.** #1645 (module
`business-metrics`) et #1649 (`/revenus/tresorerie`) sont les deux sources de
données dont #1646, #1651, #1652 et #1653 dépendent toutes les quatre. Les
livrer dans le désordre aurait produit un cockpit affichant « non mesuré » sur
deux tuiles sur six dès son premier jour.

Constat d'entrée, mesuré : **aucun chiffre de MRR, churn, LTV ou burn de Bellum
n'existait nulle part**. `apps/api/src/modules/business-metrics` n'existait pas
(`test -e` négatif), et la seule brique voisine — `estimateMrrCents`
(`analytics-overview.service.ts:121`) — **n'avait aucun appelant côté
back-office**. Les mots « MRR » et « churn » n'existaient dans le code que pour
le métier des CLIENTS.

### Ce qui est livré

**API — `apps/api/src/modules/business-metrics/`**

- `mrr-movements.ts` — PUR. Deux photographies entrent, cinq mouvements sortent.
  L'invariant `mrrEnd = mrrStart + new + expansion − contraction − churned` tient
  **par construction** : chaque euro est classé dans un et un seul seau.
- `treasury.ts` — PUR. Burn d'un mois, burn moyen des **trois derniers mois
  mesurés** (pas d'une fenêtre calendaire : un trou de saisie en juillet ne doit
  pas effacer la moyenne d'août), runway.
- `business-metrics.service.ts` — la position du moment, la prise d'instantané,
  la série, la saisie de trésorerie.
- `business-metrics-snapshot.service.ts` — `@Cron('20 3 1 * *')`, Europe/Paris :
  le 1er, il fige le mois qui vient de FINIR. Un instantané pris le 15
  photographie un demi-mois et se présenterait comme le mois entier.
- Migration `1791820000000-BusinessMetrics` : trois tables, déclarées au registre
  des portées (`shared` / `operator` — ce sont les chiffres de l'ÉDITEUR, aucun
  espace ne les lit).
- Interrupteur **`BUSINESS_METRICS_SNAPSHOT_DISABLED`** — le dix-huitième de
  l'API.

**Back-office — `/revenus/tresorerie`** (rail › Revenus › Trésorerie,
`ECRANS_PROPRIETAIRE` : c'est le compte en banque de l'entreprise)

Quatre tuiles (solde, burn du mois, burn moyen, runway), la saisie mensuelle,
l'historique, et un bandeau « MRR — instantanés mensuels » avec le bouton
« Figer <mois> ». Nouvelle capacité `treasury.write`, plancher `owner`.

### Les trois décisions qui n'étaient pas dans les issues

1. **Le premier mois de la série n'a pas de `mrrStart`.** Il vaut `NULL`, pas
   `0` : « nous n'avions rien mesuré avant » n'est pas « nous avions zéro
   euro ». Les cinq mouvements sont `NULL` avec lui. Un `DEFAULT 0` en base
   aurait transformé une absence en fait, pour toujours.
2. **Une table de LIGNES sous les instantanés.** Un total figé ne suffit pas à
   décomposer le mois suivant : « nouveau » et « expansion » ne se distinguent
   qu'en sachant qui payait quoi. Sans elle, un départ suivi d'une arrivée au
   même montant se lirait comme un mois sans mouvement.
3. **`one_off` n'est jamais divisé par douze.** Un montant facturé une fois n'a
   pas d'équivalent mensuel ; lui en fabriquer un inventerait du récurrent —
   exactement la faute que #1645 interdit pour le MRR. Il est compté à part.

### Le littéral de #1649 était incalculable — corrigé, et dit

L'issue demande **trois** champs saisis puis écrit
`burn = fixes + variables − encaissements`. Les encaissements n'y sont ni saisis
ni dérivables : le MRR est une position théorique (grille × abonnements), pas de
l'argent arrivé, et une facture marquée « payée » ne porte pas sa date
d'encaissement (`paid_on` reste honnêtement `NULL`, voir
`manual-billing-schedule.ts`). Un **quatrième champ** garde donc la formule
EXACTE au lieu de la tronquer, plutôt que de dériver une estimation et de la
présenter comme de la caisse.

### Ce qu'on ne promet pas — refusé avec sa raison

- **Aucun chemin d'écriture vers la facturation.** Le module LIT `subscriptions`
  et `manual_billing_terms` ; il n'a **pas** ces repositories en écriture. Ce
  n'est pas une convention, c'est l'absence de code. Un module de MESURE qui
  pourrait corriger ce qu'il mesure n'est plus une mesure.
- **Aucun repère de marché** (#1651 en demande cinq, sourcés ChartMogul /
  Benchmarkit). Ils viendront avec l'écran `/revenus`, pas avant : un repère sans
  la colonne qu'il commente n'a rien à commenter.
- **Pas de LTV, pas de NRR, pas de GRR.** Ils exigent six mois de churn observé
  (#1651 le dit lui-même) et la série en compte zéro aujourd'hui. Les afficher
  « non mesurable » sur un écran qui n'est pas encore le leur ajouterait du bruit.
- **Le runway ne se calcule pas sur une trésorerie devinée.** Trois refus
  distincts, et chacun a SA phrase à l'écran : moins de deux mois saisis · aucun
  solde relevé · un burn nul ou négatif. « Non mesuré » sans sa raison apprend à
  ignorer la tuile.

### Le piège d'architecture évité, et comment

**GA-07 est au plafond** (254 imports / 124 fichiers), et deux dépendances
naturelles l'auraient franchi : `PlanCatalogService` pour les grilles de prix,
`SingletonLockService` pour le passage mensuel. Le premier jet a fait monter le
compteur de fichiers à 125 — la garde l'a dit.

Les deux passent désormais par des **jetons d'injection**
(`module-tokens.ts`), fournis par `business-metrics.module.ts` — un fichier
`*.module.ts` est hors périmètre de la garde parce que c'est **la couche prévue
pour composer**. Et le service n'a de toute façon pas besoin du catalogue : il a
besoin de deux dictionnaires de prix.

⚠️ Corollaire volontaire : **les prix ne sont jamais recopiés**. Une grille
recopiée diverge le jour où l'opérateur change un tarif, et le MRR se mettrait à
mesurer une grille morte.

### Ce que la CI ne pourra pas voir, et qui attend Louis

L'écran est derrière `DM_BASIC_AUTH` + TOTP : **il se recette par Louis**
(décision du 07/09 au soir). Fiche de recette :
`.claude/notes/recette-backoffice-tresorerie-2026-09-07.md`.

## La doctrine de l'analytique produit — l'unité d'analyse, écrite AVANT les sept écrans (#1681 — 07/09/2026)

**Ce que c'est.** Pas un ticket de code : une doctrine à ratifier. L'issue #1681
pose le cadre de l'analytique produit, et **sept écrans** (#1682 à #1688) vont se
construire dessus. Un cadre qui reste dans un fil d'issue se re-litigie au
troisième écran — au moment précis où revenir en arrière coûte le plus cher.
C'est la première entrée du registre de doctrine écrite **avant** le code qu'elle
contraint, et non après lui.

### La phrase qui tranche, et elle n'est pas où on la cherche

La frontière n'est **pas** « anonyme contre nominatif ». C'est l'**unité
d'analyse** :

| On mesure le PRODUIT                | On ne mesure pas la PERSONNE          |
| ----------------------------------- | ------------------------------------- |
| cet écran est abandonné             | Sarah abandonne les écrans            |
| cette fonction n'est jamais ouverte | Sarah n'utilise jamais cette fonction |
| ce parcours casse ici               | Sarah bloque ici                      |
| ce champ fait fuir                  | Sarah met 4 min sur ce champ          |

On agrège par **écran**, par **fonction**, par **parcours** — jamais par
personne, **même identifiée par un hash**. Un pseudonyme ne change pas l'unité
d'analyse ; il rend seulement la personne plus difficile à nommer une fois qu'on
l'a isolée. C'est cette phrase qui tranche les cas que les cinq règles ne
nomment pas.

### Les cinq règles

1. **Agrégation minimale** — aucune métrique comportementale publiée sous
   **5 sessions distinctes**. Sous ce seuil, une « moyenne » désigne quelqu'un.
2. **Aucun contenu** — on enregistre **qu'un** champ a été rempli, jamais ce
   qu'il contenait, côté navigateur comme côté serveur.
3. **Aucun enregistrement de session** — ni rejeu vidéo, ni capture du DOM. La
   raison est le produit lui-même : nos écrans contiennent le pipe commercial de
   nos clients, et rejouer un écran, c'est l'exfiltrer chez un tiers.
4. **L'identifiant est un hash de SESSION**, pas d'utilisateur, tourné toutes
   les **24 h**. On suit un parcours dans une journée, jamais une personne dans
   le temps.
5. **Aucune métrique comportementale par espace client NOMMÉ** dans le
   back-office. « L'écran X est abandonné à 62 % » se lit ; « chez [ce client],
   l'écran X est abandonné » ne se lit pas — « ça se transforme en argument
   commercial, puis en reproche ». Le score de santé d'espace (#1652) suffit au
   suivi client, et il mesure des actions **validées**, pas des comportements.

Registre : `packages/contracts/src/schemas/doctrine-registry.ts`, entrée
**`c64_analytique_produit`**.

### Le seuil vit à UN seul endroit — parce qu'il était déjà écrit quatre fois

Le même principe apparaît sous quatre formes dans les issues voisines : cohortes
sous 3 espaces masquées (#1658, #1686), parcours sous 5 occurrences (#1684),
« trop récent » sous 5 sessions (#1683), règle 1 de #1681. Quatre recopies, c'est
quatre valeurs le jour où l'on en change une — et un écran qui masque à 3 pendant
qu'un autre publie à 5 désigne quelqu'un sur le second (loi 1 du tome 7, GA-26).

`packages/contracts/src/schemas/product-analytics-privacy.ts` porte les **deux**
nombres — `MIN_DISTINCT_SESSIONS_FOR_A_METRIC` (5) et
`SESSION_HASH_ROTATION_HOURS` (24) — plus `hasEnoughSessionsToPublish()`.
Il vit dans les contrats et non dans `apps/api` parce que les deux côtés en ont
besoin pour des raisons différentes : l'API décide ce qu'elle **calcule**, le
back-office ce qu'il **dit** à la place. ⚠️ `false` veut dire « ne publie pas »,
**jamais** « zéro » — un écran qui remplacerait une métrique retenue par « 0 % »
mentirait deux fois.

Le dépôt avait déjà un seuil d'échantillon minimal, `OBSERVABILITY_ALERT_MIN_SAMPLE`
(20) : il décide quand une **alerte technique** a assez de matière pour être crue.
Il ne s'applique pas ici, et l'inverse non plus — l'un protège une conclusion,
l'autre protège une personne.

### Ce qui la tient : deux gardes, et ce qu'elles ne peuvent pas faire

Quatre règles sur cinq portent sur une **intention** ; une garde qui prétendrait
les lire dans du code devrait reconnaître une sémantique, et ce dépôt a payé six
gardes borgnes en deux jours pour l'avoir tenté ailleurs. La règle 3 est la seule
qui porte sur des **noms** — un paquet, un hôte — donc la seule entièrement
décidable, et c'est aussi celle dont la violation serait irréparable.

- **GA-240** — `apps/api/src/architecture/no-session-replay.spec.ts`. Trois
  portes : les `package.json` des 21 espaces de travail (173 dépendances), les
  spécificateurs de module (5 250 distincts) et les hôtes écrits en clair
  (5 763 fichiers balayés, `apps/web/index.html` compris — l'extrait que ces
  éditeurs donnent en premier est un `<script src>`, qui n'apparaît dans aucun
  manifeste). Elle refuse un **segment** de nom de paquet égal à un éditeur, et
  un **hôte pointé** : `clarity.ms` se reconnaît là où « clarity » ne se
  reconnaît pas, parce qu'une garde rouge sur du code juste finit désactivée.
  Écart écrit plutôt qu'élargi : un éditeur généraliste dont le rejeu est une
  option payante n'a pas de nom reconnaissable, et une capture écrite à la main
  n'en a aucun.
- **GA-241** — `packages/contracts/src/schemas/product-analytics-privacy.test.ts`.
  Le bord du seuil (4 refuse, 5 accepte, un compte inconnu refuse aussi) **et**
  le lien entre la constante et le texte du registre : l'aiguille est construite
  à partir du code, donc changer le seuil sans corriger la doctrine fait rougir
  la CI. C'est la leçon de « le compte que c18 annonce » — la seule affirmation
  d'un registre qu'une machine puisse lire est un chiffre.

### L'écart mesuré entre les cinq règles et le code du 07/09/2026

| Règle                               | État           | Ce qui a été mesuré                                                                                                                                                                                                             |
| ----------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3 — aucun enregistrement de session | **tenue**      | Zéro dépendance et zéro hôte de rejeu dans le dépôt ; GA-240 le maintient.                                                                                                                                                      |
| 2 — aucun contenu                   | **à moitié**   | `sanitizeProperties` retire 10 fragments de clé, borne à 40 clés, tronque à 500 caractères — **côté serveur seulement**, et sur le **nom** de la clé, jamais sur la valeur. `track()` (web) transmet ses `props` à l'identique. |
| 1 — 5 sessions distinctes           | **absente**    | `analytics-overview.service.ts` et `team-kpis.service.ts` publient quel que soit l'effectif. La constante existe, elle n'a **aucun appelant** — le défaut n°1 du dépôt, à lever avec #1683.                                     |
| 4 — hash de session tourné à 24 h   | **contredite** | `product_events.user_id` est un identifiant d'utilisateur permanent et `track()` refuse d'écrire sans lui ; la colonne `session_id` n'a **ni écrivain ni lecteur**.                                                             |
| 5 — rien par espace nommé           | **non violée** | `GET internal/analytics/teams/:workspaceId` rend bien un détail par espace nommé, mais il compte des actions **validées**. La ligne à ne pas franchir passe donc à l'intérieur d'une route existante.                           |

⚠️ **La contradiction de la règle 4 n'est pas un oubli à corriger en silence.**
La **même** table sert le journal d'activité d'espace
(`workspace-activity.service.ts` : `member_removed`, `portfolio_handed_over`…),
qui **doit** nommer son acteur — c'est une trace d'audit. Séparer le flux de
comportement du flux d'audit est le vrai travail de la règle 4, et il n'est pas
commencé.

### Ce qu'on ne promet pas

- **Aucun avis juridique.** L'intérêt légitime, le registre des traitements et la
  phrase de la politique de confidentialité sont une **relecture juridique en
  attente**, à la charge de Louis. L'auteur du cadre l'écrit lui-même (« je pose
  le cadre technique, pas l'avis juridique ») et une case cochée à sa place
  vaudrait moins qu'une case vide.
- **Aucun des sept écrans** (#1682 à #1688) n'est livré ici.
- **L'issue #1681 reste OUVERTE** : elle se ferme quand la relecture juridique
  est faite et que les sept écrans sont livrés.
- ~~La ligne à ajouter dans `CLAUDE.md` revient à l'intégrateur.~~ **Faite** le
  07/09/2026, § Doctrine › « Ce qu'on ne collecte pas », dans la PR #1727. Au
  passage, la ligne voisine « une garde doit prouver **DEUX** choses » est passée
  à **TROIS** : la troisième — qu'elle n'attrape pas ce qu'elle ne vise pas — a
  été payée depuis que la ligne a été écrite, et GA-240 la fournit.

---

## Le palier back-office — les cinq écrans du 07/09/2026 (soir)

**PR : #1726, #1728, #1729, #1730, #1731, #1732** (plus #1727 pour la doctrine
ci-dessus). Six agents en parallèle, worktrees isolés, périmètres disjoints ;
l'intégration, les branches et les fusions tenues par un seul.

Ce lot consomme enfin les deux sources livrées le matin même (#1645 le MRR figé,
#1649 la trésorerie saisie) et les deux briques d'interface (#1642 les douze
primitives, #1643 les quatre graphiques). Le motif que le triage du 07/09 avait
annoncé s'est vérifié : **livrer les briques avant leurs consommateurs produit du
code juste que personne n'appelle**, et c'est ce lot qui referme la parenthèse —
l'exception `knip.json` sur `src/ui/**` rétrécit à chaque écran livré, et il en
reste cinq primitives sans appelant, nommées.

### Les arbitrages tranchés par Louis avant d'écrire

1. **La trésorerie garde ses QUATRE champs.** #1649 en demandait trois puis
   écrivait `burn = fixes + variables − encaissements`. Les encaissements ne sont
   ni saisis ni dérivables (le MRR est une position théorique, `paid_on` reste
   `NULL`). Un quatrième champ saisi garde la formule exacte au lieu de la
   tronquer.
2. **Un seul mois se fige : celui qui vient de finir** (#1726). Le bouton ne
   _lit_ pas un mois passé — il photographie les abonnements d'aujourd'hui et
   range la photo sous une étiquette. Pour le mois écoulé c'est la seule
   approximation possible ; pour mars en septembre c'est un mensonge **durable**,
   l'instantané étant immuable. Un mois manqué reste un **trou nommé**. Deux
   refus, deux phrases : « pas encore » et « plus jamais » ne se disent pas
   pareil. La porte est au **contrôleur**, pas au service — le passage du 1er
   vise déjà le bon mois par construction, et c'est le geste d'opérateur qu'on
   borne, parce que c'est lui qui ne peut pas voir la conséquence.
3. **`/revenus` est propriétaire, `/revenus/clients` ne l'est pas.** Le chiffre
   d'affaires de la boîte au propriétaire, l'outil de support quotidien à
   l'opérateur. ⚠️ `estUnEcranProprietaire()` fait un `startsWith` : sans
   exception nommée, fermer `/revenus` fermait **aussi** `/revenus/clients`.
   L'exception est nommée et testée **dans les deux sens**.
4. **Les cinq règles d'analytique produit sont ratifiées**, relecture juridique
   en parallèle — voir la section précédente.

### Les cinq écrans

- **#1651 · `/revenus`** — waterfall du mois, série 12 mois, métriques dérivées
  avec leurs repères **sourcés**, revenus contractés séparés. Le contrôle de
  solde (T2) est **affiché**, pas seulement testé. La série n'ayant aucun mois
  figé, NRR, GRR, churn et LTV affichent leur **raison de ne pas exister** —
  « non mesurable, il faut 6 mois de churn observé » — et aucun repère n'est
  affiché sans sa source. Le bandeau des instantanés **déménage** depuis
  `/revenus/tresorerie`, moins deux tuiles que le bloc 4 porte désormais.
- **#1652 · `/revenus/clients`** — tableau dense et score de santé sur cinq axes.
  Un axe sans donnée **sort du dénominateur** ; sous trois axes il n'y a pas de
  score ; sous 14 jours, « trop récent ». L'adoption est un **proxy assumé** —
  rien n'enregistre l'usage indexé par `PlanFeatureKey`, le vrai numérateur
  aurait dû être inventé. `beta_feedback` n'ayant pas de `workspace_id`, un
  membre de deux espaces compte dans les deux : écrit dans le code plutôt que
  corrigé par une heuristique qui choisirait au hasard.
- **#1653 · le calendrier de facturation** — douze mois, une ligne par client,
  une cellule par **période** (un trimestriel occupe trois colonnes). ⚠️ **La
  prémisse de l'issue était fausse** : `MAX_PERIODS = 240`, pas 20, et un mensuel
  de 2019 rend **93** périodes. Le « 20 » visait des lignes visibles ; la
  dérivation garde 240 et la grille borne l'affichage. Un seul mot a changé dans
  le module existant : `covers` devient `export` — le recopier aurait fait
  diverger le calendrier de la colonne « État » du même écran.
- **#1650 · la grille jour × heure des analyses** — sept jours, douze tranches,
  intensités relatives. Posée dans le cockpit **actuel** pour avoir un appelant
  dès le premier jour ; #1646 la déplacera sans la réécrire. Le fuseau est
  `Europe/Paris`, décidé en SQL et **rendu par l'API** : l'écran l'affiche au
  lieu de le supposer. Les analyses hors 8 h – 20 h sont **comptées et
  annoncées** — sinon une semaine à trois analyses à 23 h dirait « aucune analyse
  cette semaine », ce qui serait faux.
- **#1656 · le catalogue d'offres** — ce que chaque offre rapporte, et la colonne
  qui manque partout : le **taux de dépassement**. Il ne tranche pas, et l'écran
  non plus : un test balaie tout vocabulaire de recommandation sur un taux à 95 %
  **et** à 5 %. `creditCapacity` est **exportée** plutôt que recopiée — le
  plafond du taux doit être exactement celui qui refuse une analyse.

### Ce que le lot a REFUSÉ de calculer, et pourquoi c'est le point le plus utile

**La marge par offre n'est pas mesurable**, et le dépôt l'avait déjà tranché :
`measureBellumGrossMargin` (D436) rend `blockedReason: 'currency_mismatch'` pour
la marge globale — revenu en EUR, `provider_costs.cost_usd` en USD, et « un taux
de change appliqué à la volée fait diverger la comptabilité de ce que le client a
vu ». Par offre, deux trous s'ajoutent : `provider_costs` n'a **aucune dimension
« offre »**, et son agrégat existant est **borné aux 20 espaces les plus chers**.
La table n'est donc même pas lue — **un chiffre qu'on ne rendra pas ne se calcule
pas** — et la colonne dit « non mesurable » avec sa raison, dérivée du même
libellé plutôt que recopiée en prose.

### Trois défauts que seule l'intégration a vus

1. **La garde des e-mails ne voyait qu'un tiers de son sujet.** Son motif exigeait
   `.email` **littéralement**, donc `{w.ownerEmail}` passait. Dès qu'une charge
   utile porte deux adresses, elles se nomment forcément autrement. En
   l'élargissant : **une vraie fuite en production** — `/clients?view=esn`
   affichait l'adresse du propriétaire de **chaque ESN** en clair, dans une
   liste, depuis #1670.4. Et un **faux** positif instructif : `{delivery.noEmail}`
   est un **nombre**. Le nom seul ne distingue pas un compte d'une adresse ; seul
   le **type** le dirait, et une garde qui lit du texte n'a pas les types. La
   liste d'exception porte donc le **nom du champ**, pas le chemin du fichier —
   `changelog/page.tsx` reste gardé pour toute vraie adresse qu'on y ajouterait.
   ⚠️ Le motif portant désormais le drapeau `g`, `RegExp.test()` devient
   **stateful** : `matchAll`, et un test qui appelle deux fois pour l'exiger.
2. **GA-19 est tombé sur la grille, et il avait raison.** Deux `cellule.valeur ?? 0`
   écrits **après** avoir pourtant écarté le cas « à venir » : le repli
   n'arrivait jamais, mais il écrivait « 0 analyse lancée » le jour où l'ordre
   des gardes changerait. La case est devenue une **union discriminée** — après
   `if (cellule.aVenir)`, TypeScript sait que la valeur est un nombre, et le
   `?? 0` n'a plus de raison d'exister. **On retire le moyen, pas l'occasion.**
3. **Une `BadRequestException` de Nest range sa phrase dans `message`, pas dans
   `error`.** Les deux écrans de trésorerie lisaient `data.error` : l'opérateur
   aurait lu « Bad Request » à la place de la phrase écrite pour lui. Corrigé sur
   les **deux** — n'en corriger qu'un aurait laissé le jumeau.

### Ce qu'on ne promet pas

- **La recette live revient à Louis** (décision du 07/09 sur tout le
  back-office). Rien de ces cinq écrans n'a été vu au clic : ni le débordement
  des tableaux larges, ni les deux thèmes, ni le remplissage réel des axes de
  santé et de la grille horaire.
- **`Heatmap.tsx` (#1642) reste sans appelant** et garde son exception `knip` :
  le composant range son détail dans un `title=` et rend des `<span>` non
  focusables — les deux interdits de #1650. Sa logique et ses cinq opacités,
  elles, sont consommées. Le sortir demande de rouvrir #1642.
- **« Suspendre » n'entre pas dans la ligne de `/revenus/clients`** : le
  composant exige `banned`, absent de la charge utile, et le lire coûterait un
  appel par ligne. Le sortir demande soit `banned` en lot, soit une capacité de
  lecture qui n'existe pas dans `roles.ts`.
- **Le taux de dépassement porte sur le cycle EN COURS.** Reconstruire les cycles
  passés demanderait `credit_ledger`, dont l'écriture est best-effort — donc un
  plancher de plus.
- **Aucune entrée de changelog** n'est écrite pour ce lot, comme pour #1645 et
  #1649. Le précédent est ambigu (`2026-08-27-back-office` existe) ; la question
  est posée à Louis plutôt que tranchée en silence.

## La vague des 73 retours du 07/09 — deux PR, sept lots parallèles (PR #1744, #1745)

**Ce que la vague a mesuré avant de coder** : les 73 issues ouvertes, découpées par
onze éclaireurs en **~308 demandes numérotées** — ~82 déjà LIVRÉ, ~41 PARTIEL,
~166 ABSENT, 5 REFUS, ~14 DÉCISION. Le découpage complet vit dans
`.claude/notes/issues-vague-2026-09-07.md` ; la reprise dans
`.claude/notes/issues-reprise-2026-09-07.md`.

**Le constat qui commande le corpus**, trouvé par QUATRE chemins indépendants — donc
une convergence qui vaut preuve, pas un écho : les ~45 retours « mémoire marché »
demandent **la même chose vue depuis dix écrans**. `MarketMemoryService` est en
production depuis le 06/09 avec 60 067 entreprises, et **cinq surfaces seulement le
lisent** ; huit écrans nommés par les retours ne le lisent pas du tout. Ce n'est donc
pas dix chantiers : c'est **un agrégat de couverture à l'échelle du portefeuille**, à
concevoir une fois puis à décliner. Il reste à faire.

### PR #1744 — back-office opérateur (`b671c3395`)

#1642, #1646, #1671.3, #1671.4, #1672, #1674.5, #1686. Les cinq états d'un tableau
(« Aucun résultat pour ce filtre » n'existait nulle part) — ce qui donne enfin un
appelant à `Skeleton.tsx`. L'entonnoir d'onboarding par cohorte, seul retour de la
série `/produit` livrable sans le traceur de #1682. L'écran `/securite`, qui branche
`countRecentFailures` et `knownCountries`, calculés et lus par personne. Le cockpit
business sur la racine.

### PR #1745 — produit client (`1f5c7f253`)

#1640.3/.5/.6, #1631.7, #1573.4/.5, #1574.2, #1621.1, #1608, #1630.10. Deux gardes
neuves et complémentaires : **GA-257** (web) interdit de LIRE le score
d'externalisation hors de son unique endroit calibré ; **GA-258** (api) tient la
porte d'ENTRÉE de la mémoire marché. Les deux arrivent AVANT les branchements
qu'elles protègent — la divergence que #1621 redoute n'existe pas encore, justement
parce que quatre surfaces ne lisent rien.

Et la famille A : `city`, `region`, `country` sont ingérées depuis le 06/09 et lues
par **aucun chemin produit** — le service les chargeait puis les jetait. Elles
traversent enfin jusqu'à l'onglet Sites.

### PR #1763 — le cockpit et Laura lisent le marché (`6348be593`)

#1573.6, #1573.7, #1574.1, #1574.3, #1581.1. Deux branchements et une garde.

**Les opportunités à réveiller** lisent enfin la mémoire marché : `dormant()` ne
l'interrogeait jamais. Elle l'interroge APRÈS la coupe (cinq comptes, une requête), la
carte porte le badge de #1573.4 — le MÊME composant, pas une seconde version — et le tri
gagne une troisième clé. Ce qui est mesuré et tenu par des tests : un compte observé ne
passe **ni** devant un signal récent, **ni** devant une relation mieux documentée, et il
**ne change pas le CTA** — sans signal, c'est « Préparer la reprise », même à 999
parcours.

**Le contexte du copilote** portait « Nom — Secteur — Score/10 », c'est-à-dire aucune des
quatre couches que #1581 demande. Il porte désormais, par compte, si une prochaine action
est programmée (le prédicat du bandeau, réutilisé verbatim), la date du dernier échange
ENREGISTRÉ, et si un signal est apparu ces sept derniers jours ; plus le bloc de
couverture du portefeuille. **Le sens voyage avec le chiffre** : le lecteur est un modèle
qui paraphrase, et « 38 sur 62 » nu ressort en « 38 de tes comptes externalisent ». C'est
la surface la plus risquée du dépôt pour la faute que GA-259 tient à l'écran, et c'est
pourquoi le bloc porte son propre mode d'emploi — sans jamais déborder sur le ton ou le
format, qui restent au prompt système.

**GA-262** tient la règle transverse des trois retours : la mémoire marché augmente un
POTENTIEL, elle ne fabrique jamais une URGENCE. Elle garde une **place dans un tri**, ce
qui ne se voit pas à la relecture : inverser deux lignes d'un comparateur suffisait à
faire passer un compte observé devant un signal récent, sans qu'un seul test ne tombe.

Deux dérivations reviennent à un seul endroit : `INTERACTION_ACTIVITY_KINDS` (une note
prise pour soi n'est pas un échange — le cockpit et le copilote posaient la même question
deux fois) et `marketPortfolioLookups`, où se recopiait le détail qui change le résultat,
le **pays**. La lecture du portefeuille est faite par le CONTRÔLEUR : un tour de chat est
un geste d'utilisateur, et **GA-07 n'a plus qu'un slot** (253/254 imports, 124/124
fichiers).

### Ce qu'on ne promet pas

- **#1574.4** — « une personne de ton réseau possède un chemin vers ce compte » : le
  corpus ne porte **aucun hash de personne**, et la table demandée par #1603 n'a aucune
  source dans le pack. Mesuré, pas supposé. Ce point se répond, il ne se code pas.
- **#1573.1 (format), #1581.2, #1581.3** — le nombre de recommandations et la forme
  VERDICT / pourquoi maintenant / ce qu'on ne sait pas vivent dans `bellum_advisor.py`.
  ⚠️ **Ils ont été annoncés « bloqués par le retard du service IA », et c'était FAUX** :
  `git log cbe8cd335..origin/main -- apps/ia` rend **0** sur 147 commits d'écart. Le
  service exécute un code identique à `main`, copie Python des schémas comprise ; c'est
  l'étiquette de `/version` qui est périmée, pas le code. Ces points sont du travail
  ordinaire. **La leçon : un blocage HÉRITÉ se re-mesure avant d'être répété** — celui-ci
  venait d'une note de reprise et a été recopié dans trois commentaires d'issue et deux
  messages de commit sans qu'une commande ne soit lancée.
- ⚠️ **Le déclencheur du service IA part, il est LENT — et son SHA n'est pas celui qu'on
  croit.** Constat intermédiaire « il ne part pas », écrit vingt minutes après le merge :
  **faux**, mesuré une heure après (`api 6348be593 | ia 389f91b67`). Deux propriétés à
  retenir : la latence se compte en dizaines de minutes, et le SHA rendu est **la tête de
  `main` au moment du BUILD**, pas le commit déclencheur — d'où un `ia` qui peut être en
  AVANCE sur l'`api`. La porte se lit donc « aucun service n'est en RETARD sur mon
  commit », jamais « les deux SHA sont égaux ».
- **#1574.6** (Laura proactive sur le cockpit) — « fort fit » demande une gradation que le
  contrat refuse sans normalisation par cohorte, et `GET /laura/plan` répond **401 sur la
  salle de démonstration** : l'intervention ne s'y verrait dans aucun cas.
- **#1639** (politique de crédits) — arrêt obligatoire, facturation. Rien livré.
- **#1613.2 / #1640** — le score d'externalisation ne s'affiche pas, et GA-257
  l'interdit désormais : on ignore s'il est normalisé par cohorte, et un score brut
  mesurerait la TAILLE de l'entreprise.
- **#1672.5** (export CSV) — une garde interdit le mécanisme, sa liste d'exceptions
  est vide **à dessein**.
- **#1417.2 / #1440.6** — les valeurs littérales, refusées pour la **troisième** fois
  (D79/D80). **#1617.2 / #1603.6** — la hiérarchie à 5 échelons : le corpus n'en
  porte que deux.
- **#1682** et les cinq écrans qui en dépendent attendent la relecture juridique que
  #1681 appelle lui-même.

### Ce qui n'a pas pu être vérifié

**La recette du back-office est BLOCKED** : le Basic Auth passe **avant le routage**,
donc `/route-qui-nexiste-pas` rend le même 401 que `/securite`. Un 401 ne prouve
rien. #1643, #1655, #1656 et #1669 sont entièrement livrées et **restent ouvertes**
pour cette seule raison.

## L'agrégat de couverture du portefeuille — un objet, trois écrans (PR #1750 — 08/09/2026)

**Ce que la vague du 07/09 avait laissé** : « ce n'est pas dix chantiers, c'est un
agrégat de couverture à l'échelle du portefeuille, à concevoir une fois puis à
décliner. Il reste à faire. » C'est ce lot. Débloqué par l'arbitrage de Louis du
08/09 (`.claude/notes/decisions-louis-2026-09-08.md`, n°1 — « tout brancher »), qui
lève le défaut conservateur de #1622.5.

**Issues** : #1633 (`/pilotage/qualite`), #1635 (`/pilotage/marche`), #1634
(territoire — diagnostiquée, pas livrée, voir plus bas).

### L'objet, et pourquoi il n'y en a qu'un

`MarketMemoryService.portfolioFor(lookups, { expertises })` — **une** méthode, **une**
route (`GET /accounts/market-memory-portfolio`), **une** clé de cache web
(`['market-memory','portfolio']`). Trois surfaces qui compteraient chacune de leur
côté donneraient trois nombres : c'est mot pour mot ce que #1621 décrit (« 41 dans
Account, 38 dans Partners, 44 dans Laura »), et GA-258 l'interdit déjà côté API.

**La partition** — chaque compte tombe dans exactement un seau, et les quatre
s'additionnent jusqu'au dénominateur, **vérifié par le contrat lui-même** :
`covered` · `insufficientObservations` (résolu mais sous le seuil — le corpus CONNAÎT
l'entreprise) · `ambiguous` (dont `homonyms`) · `unresolved`. La distinction entre les
deux derniers est exactement ce que la page qualité existe pour montrer : l'un se
corrige, l'autre s'attend.

**Le dénominateur est la population de `GET /accounts`**, cloisonnement compris
(`AccountsService.listPortfolioLookups`, même `portfolioScopeFor`). C'est la leçon de
#1408, où « Mes comptes » filtrait sur le CRÉATEUR pendant que `/comptes` filtrait sur
le RESPONSABLE : deux populations, deux vérités, le même mot. Un agrégat qui
annoncerait « 62 comptes » quand la liste en montre 58 referait la faute d'un cran
plus haut.

**Deux requêtes au total**, quel que soit le nombre de comptes : les signaux en un
`IN`, puis les piles des seules entreprises couvertes. Le rassemblement des candidats
par référence d'appelant a été EXTRAIT de `pathsFor` plutôt que recopié — deux
lectures groupées qui refont le même arbitrage sont deux endroits où la correction de
#1617 peut se défaire, et une seule des deux serait testée.

### GA-259 — un taux de COUVERTURE n'est pas un fait de marché

`apps/web/src/architecture/market-coverage-is-not-outsourcing.test.ts`. #1633 et #1635
portent le même garde-fou chacune de son côté, ce qui n'est pas un hasard : c'est la
lecture que **tout le monde** fait spontanément d'un pourcentage de couverture.
« 72 % de couverture » ne veut pas dire « 72 % externalisent », et le complément ne
veut pas dire « 28 % n'externalisent pas » — ces 28 % sont hors de ce que NOUS savons,
pas hors du marché. C'est « non mesuré rendu 0 » d'un cran plus haut, et plus
dangereux : un commercial peut répéter la phrase en rendez-vous.

⚠️ **La négation est interdite aussi**, et c'est délibéré : un libellé se lit hors de
son contexte — infobulle, lecteur d'écran, export — où la négation se perd et le mot
reste. La garde tient également la règle **positive** (que le bloc DISE ce que le taux
mesure, et que la phrase soit rendue) : une garde protège une règle, elle ne se
contente pas d'en interdire le contraire.

Registre : `c65_couverture_nest_pas_un_fait_de_marche`. Ligne ajoutée à la Doctrine de
`CLAUDE.md`. **Prochain numéro de garde libre : GA-260.**

### Ce qu'on ne promet pas

- **#1633.1 « corrections workspace »** — rien n'enregistre une correction de mémoire
  marché, et **ce n'est pas un oubli** : les quatre tables sont PARTAGÉES entre des
  espaces concurrents, et une correction faite par l'un ne réécrit jamais la mémoire
  commune. Un compteur qui dirait toujours « non mesuré » occuperait la place sans
  rien dire — le même argument qui a fait retirer la ligne « Fit avec ton offre » du
  popover de #1582. Le monter demanderait d'abord une table de correction d'espace qui
  PRIME à la lecture ; patron existant : `account_partners.dismissed_at`.
- **#1635.4 la gradation « forte affinité »** — le nombre et son critère sont livrés,
  la note non. « Forte » exigerait une normalisation par cohorte (un grand groupe cite
  mécaniquement plus de technologies qu'une PME, donc recoupe plus souvent) : la même
  question ouverte qui tient `MARKET_MEMORY_SCORING_ENABLED` à `false`. Elle ne se
  répond pas deux fois différemment.
- **La démo ne sème RIEN.** Y semer des lignes injecterait de la donnée inventée dans
  le corpus que lisent de vrais clients concurrents. La salle de démonstration lit le
  corpus réel, et le bloc y dit la vérité sur ses comptes — un « non résolu » y est une
  information, pas un trou de semis. L'interdit est tenu par l'absence de chemin
  (GA-258 couvre le module de démonstration), la raison est écrite dans
  `demo-coverage.ts`.

### #1634 — diagnostiquée, pas livrée, et pour une raison qui n'est pas un arbitrage

L'issue est **taguée `/watchlist` alors que son corps décrit `/discover/territoire`** —
trois preuves le confirment, dont la plus nette : le vocabulaire de l'issue est déjà
celui du contrat de cet écran-là (« technos en tension » est littéralement le nom
d'une fonction, `territory_overview.py:156`). `/watchlist` n'a aucune prise
géographique.

Ce qui manque n'est pas l'agrégat mais la **découpe par zone**, et elle attend une
MESURE : le taux de remplissage réel de `market_company_signal.city` / `.region` sur
les 60 067 lignes de production. Le service l'avertit lui-même — « le corpus peut très
bien laisser `city` à `null` sur la majorité des lignes ». Si c'est le cas, la colonne
« contexte structurel » n'a pas de matière et l'issue tombe. **C'est le premier geste
du lot suivant, avant toute ligne de code.**

⚠️ Piège relevé au passage : `RegionDistributionCard` affiche un **pourcentage**,
c'est-à-dire exactement le ratio unique que #1634 interdit. Ne pas le réutiliser tel
quel.

### Deux défauts corrigés au passage

- **Le repli des trois blocs testait la panne NOMMÉE** (`status === 'unavailable'`) au
  lieu de « pas un succès ». Une charge utile d'une autre forme tombait dans la branche
  de succès et lisait `data.coverage` sur un objet qui n'en a pas : **l'écran HÔTE
  tombait entier**. Mesuré : 20 tests de `DataQuality` et 7 de `MarketWatch` rouges, et
  **zéro test du bloc**, dont les huit cas passaient. Ce n'est pas un artefact de test
  — c'est la fenêtre de déploiement (web en une minute, API en plusieurs).
- **GA-241 ancrait une position ABSOLUE** (« `c64` est la dernière clé ») là où GA-08
  porte sur un ORDRE. Elle refusait une clé **appendée**, exactement ce qu'elle devait
  protéger — et le seul geste qui la calme est de réécrire son assertion, donc de ne
  plus rien garder. Réécrite sur l'invariant (« rien n'a été inséré avant elle »).

### La recette du 08/09 — ce qu'elle a prouvé, et les deux défauts qu'elle a trouvés

**Le déploiement n'est pas parti tout seul, et ça ne ressemblait à rien.** Ni erreur, ni
ligne rouge, ni « skipped » : Vercel n'a simplement créé AUCUN déploiement pour le commit
de merge. Ce qui a permis de le dire au lieu d'attendre indéfiniment est une mesure :
les trois merges précédents (`1f5c7f253`, `735bec695`, `2463af04d`) avaient déployé
`bellum-web` en **+2 min chacun**, sans exception. Relancé à la main depuis la console
(⋯ → Create Deployment → `main` → Deploy to Production).

⚠️ **Et la sonde qui surveillait l'arrivée était FAUSSE** : elle cherchait le chemin
`/accounts/market-memory-portfolio` dans le bundle d'entrée. Les routes sont en morceaux
chargés à la demande — l'i18n et les contrats sont dans le bundle d'entrée, le code des
écrans n'y est pas. La sonde aurait dit « pas déployé » pour toujours. Le seul test qui
vaut est l'ÉCRAN.

**Ce que la recette a prouvé sur données réelles** (espace de démonstration, corpus de
production) :

- `GET /accounts/market-memory-portfolio` → `6 = 4 + 1 + 0 + 1`. La partition boucle.
- **Les deux écrans affichent les mêmes nombres** — la vérité unique, vérifiée en
  production et pas seulement en test.
- **Le recoupement croisé qui valide le refactor de `pathsFor`** : la liste de comptes
  rend `market_paths_observed` sur SNCF 135, BlaBlaCar 27, Thales 272, Société Générale
  267 — **4 comptes couverts**, exactement le `covered: 4` de l'agrégat. C'est le défaut
  de #1621 (« 41 dans Account, 38 dans Partners ») mesuré en production, et il n'existe
  pas.
- **La salle de démonstration résout contre le corpus partagé**, sans qu'une ligne ait
  été semée : le raisonnement écrit dans `demo-coverage.ts` tient. Les deux comptes non
  couverts sont le client d'exemple FICTIF (que le corpus ne connaît pas, ce qui est la
  bonne réponse) et un compte sous le seuil.
- Les deux thèmes, la console, la navigation entière : rien de cassé.

**Les deux défauts trouvés à l'écran, et ils se corrigeaient ensemble :**

1. **« 1 non résolus ».** i18next n'accorde que sur `count` : trois nombres interpolés
   dans une même phrase ne peuvent pas s'accorder chacun. La réponse n'est pas une
   meilleure traduction, c'est de ne pas écrire la phrase.
2. **`Completeness` employé à contresens.** « Calculé sur 4 comptes du portefeuille sur
   6 — 67 % » affirme qu'on n'a pas pu lire deux comptes. On les a tous lus : quatre en
   sont ressortis COUVERTS. La primitive répond à « sur combien d'éléments ce calcul
   porte-t-il », jamais à « combien en sont ressortis positifs ». Et la phrase
   « N restants : x…, y…, z… » répétait mot pour mot les quatre tuiles juste en dessous,
   qui disent STRICTEMENT PLUS (chacune porte la définition de son seau).

Retirer la phrase corrige les deux. Le fit structurel avait la même faute et sa
correction NOMME l'exclusion : « calculé sur 38 comptes du portefeuille sur 62
(24 sans contexte mémoire marché) » — ce qui est le fait utile, et non un pourcentage.

## Chaque suggestion dit à quel compte elle ressemble (PR #1759 — 08/09/2026)

**Issues** : #1576 (`/accounts`, la carte du portefeuille) et #1632
(`/accounts/:id`, la carte du dossier). La même question sur deux écrans — _pourquoi
ce compte m'est-il proposé ?_ — et #1632.5, qui avait été REPORTÉE le 07/09 comme
« un moteur de correspondance entier ».

### Le retour disait un symptôme ; la mesure a trouvé deux causes

Mesuré en production le 08/09 sur l'espace de démonstration, celui d'où #1576 a été
déposée (méthode : `fetch` de l'API de prod depuis la session Chrome authentifiée).

| Constat                                                   | Mesure                                                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Les 4 suggestions venaient du **même compte**             | `seed_count: 3` à l'écran, et les 4 cartes toutes issues de `NOVA LOGISTIQUE`                                                               |
| Elles ne portaient pas « la même raison » mais **l'AVEU** | `GET /esn-profile` rend `target_sectors: []`, `geo_zones: []`, `target_company_types: []` — aucun critère ne POUVAIT matcher                |
| Le client d'exemple amorçait **sans filtre registre**     | `naf_code: null` ⇒ découverte en texte libre ⇒ TPE de fret, entreposage, taxis proposées à un portefeuille SNCF / Thales / Société Générale |

La première est une cause racine générique, désormais en mémoire : **N sources
concaténées, classées puis tronquées** — à scores égaux (profil vide), le tri stable
laisse la PREMIÈRE source occuper toutes les places, pendant que le compteur
« bâti sur 3 comptes » continue d'afficher 3.

### Ce qui est livré

- **`similarity_headline`** (contrat) — UNE raison par carte, qui NOMME toujours un
  compte du portefeuille. Ordre de force : `twin` › `tech` › critères du profil
  (comportement d'avant, inchangé) › `sector`. Quand une raison nomme un compte, la
  ligne des critères se tait.
- **`twin`** — « Ressemble à **Thales**, où tu as gagné une mission ». Adossée à une
  mission **signée** (`missions.account_id`, `AccountMissionsService.
signedMissionsByAccount`), et non au statut commercial « Client » qui est un tri
  manuel. Arbitrage de Louis du 08/09. Seuil `SIMILAR_TWIN_MIN_MISSIONS = 3` dans
  l'espace. ⚠️ Ne pas confondre avec le refus du 21/08 (`SIMILAR_SEED_FLOOR`) :
  celui-là refusait d'AMORCER la découverte sur les missions gagnées, parce qu'un
  espace sans mission perdrait la fonctionnalité entière. Ici, un espace sans mission
  perd un LIBELLÉ.
- **`tech`** — « Environnement technologique proche de **Thales** : Java, C++,
  Python ». `discriminantCommonTechnos` (`@bellum/contracts`) : ≥ 3 technologies
  communes, les ubiquitaires écartées. La fréquence est **mesurée sur le corpus**
  (`GROUP BY techno` mis en cache une heure dans le processus), jamais devinée depuis
  une liste de « technos courantes » écrite à la main, qui vieillit sans relecture.
- **`spreadAcrossSeeds`** — un par amorce d'abord, dans l'ordre du classement, puis
  les places restantes. Elle ne re-classe rien.
- Le client d'exemple de la démo reçoit un **code NAF** (`52.29A`). Un SIREN ferait
  pointer un client fictif vers une vraie société ; un code NAF décrit un SECTEUR et
  ne désigne personne — la même distinction que le champ `sector` juste à côté.

### Où la composition se fait, et pourquoi

Les deux lectures fortes vivent dans d'autres modules (`delivery`, `market-memory`).
**GA-07 interdit un import service→service** : la remontée se fait dans
`AccountsController.withSimilarityHeadlines`, comme `withMarketPaths` juste à côté.
Chaque dépendance est `@Optional()` et en **dernière position** — une vingtaine de
specs construisent ce contrôleur positionnellement. Module absent, lecture en panne,
corpus muet ⇒ la carte garde la raison plus faible. Jamais une phrase fausse.

### Ce qu'on ne promet pas

- **« Profil d'externalisation comparable »** (#1576 raison 3, #1632 critère 2) reste
  ÉCARTÉ. `market_company_signal.externalization_score` n'est pas normalisé par
  cohorte : sur une échelle 0-100 commune à une PME de 20 personnes et à un groupe du
  CAC 40, il mesure la TAILLE, pas le comportement d'achat. Refus inscrit le 07/09
  (#1640.6, `MARKET_MEMORY_SCORING_ENABLED = false`), gardé par GA-257. Comparer deux
  scores non normalisés est la même faute d'un cran plus loin — deux entreprises « au
  même profil » seraient deux entreprises de la même taille. Ça revient le jour où la
  normalisation par cohorte existe, pas avant.
- **`MARKET_TECHNO_UBIQUITY_MAX_SHARE = 0.25` est le seul nombre du lot qui ne soit
  pas ancré sur une mesure**, et le fichier le dit : la distribution des fréquences
  par techno ne se lit pas depuis un poste de développement. La requête qui la
  calibrera est écrite dans le docblock.
- **La raison `tech` s'allume à mesure que le corpus connaît les suggestions.** Le
  08/09, `GET /companies/market-paths` rendait `null` sur les **4 candidats sur 4** —
  côté référence il est riche (SNCF 135, Thales 272, Société Générale 267,
  BlaBlaCar 27). C'est le point `spreadAcrossSeeds` + le NAF du client d'exemple qui
  doivent d'abord rendre les suggestions plausibles.

### La garde

**GA-260** — `apps/web/src/architecture/raison-de-ressemblance.test.ts`. #1632
interdit « stack proche » nommément, et un libellé se réécrit dans un fichier de
traduction par quelqu'un qui n'a jamais lu l'issue. Les trois preuves : elle LIT (les
catalogues portent > 50 libellés), elle sait dire NON (vérifié dans les deux sens),
et elle n'attrape pas le voisin légitime (`similarProximity.ts`, qui parle de
proximité et de score sur toute sa longueur, reste vert). Elle EXIGE aussi le libellé
prescrit avec ses deux interpolations : une garde qui interdit sans exiger ne protège
rien (leçon de GA-259).

## Le dossier de compte en quatre familles, et la stack observée (PR #1761 — 08/09/2026)

**Issues** : #1604 (navigation) et #1607.2 (l'environnement technologique observé),
plus **huit réponses écrites sans code** sur le même document — #1603, #1605,
#1606, #1609, #1611, #1612, #1613, #1630, #1631, #1638.

### Ce que le lot livre

- **Quatorze onglets rangés en quatre familles** — Décider · Ouvrir · Agir ·
  Capitaliser. `TAB_KEYS` reste le contrat du paramètre d'URL, intact : la famille
  active se DÉDUIT de l'onglet, donc un deep-link ouvre sa famille tout seul et il
  n'y a pas de second état à désynchroniser. `TAB_DISPLAY_ORDER` disparaît —
  l'ordre d'affichage vit désormais dans `TAB_FAMILIES`, à un seul endroit.
- **`AccountMarketContext.observed_stack`** — la façade jetait ce que `coverageFor`
  calcule depuis #1579. L'asymétrie corrigée est mesurée : la pile observée
  s'affichait AVANT de dépenser un crédit et disparaissait une fois le compte au
  portefeuille. Rendue **à côté** des technologies détectées, jamais fusionnée,
  bornée à 8 chips puis « +N », avec la phrase « une observation ne prouve pas un
  usage actuel, et son absence ne prouve rien » (#1611).

### Deux gardes touchées

- **GA-261** (neuve) — tout onglet de `TAB_KEYS` appartient à exactement une
  famille, vérifié dans les DEUX sens (orphelin ET fantôme), avec un témoin qui
  prouve qu'elle ne dit rien de l'ORDRE.
- **GA-127 change de côté pour `AccountDetailTabsBar.tsx`.** Elle le classait
  « barre de fiche, un seul niveau, donc pas de pastilles » ; la barre en porte
  maintenant deux, donc la garde en EXIGE les pastilles au lieu de les interdire.
  ⚠️ **La règle n'a pas bougé d'un mot — c'est le fichier qui a changé de
  catégorie.** Une garde restée sur l'ancienne classification aurait empêché la
  refonte que le retour demandait ; c'est le cas d'espèce à connaître quand une
  garde rougit sur un changement conforme.

### La recette, et ce qu'elle a mesuré

Sur `ae96f7171` : deux portées (`y=315` / `y=358`), `?tab=partners` ouvre « Ouvrir »
sans clic, les quatorze onglets relevés famille par famille, aucun débordement à
1 512 px, 9 routes balayées, **0 erreur console**, un seul non-2xx (`412` du
rapport de pipeline CRM, préexistant). Bloc observé rendu avec `+109` sur SNCF
(117 technologies).

⚠️ **Constat de recette PARQUÉ, remonté à Louis** : les 8 chips affichées sont les
plus OBSERVÉES, donc les plus banales (`sql`, `gestion de projet`, `adobe
photoshop`). Le moyen d'afficher les plus DISCRIMINANTES existe depuis #1632
(fréquence par techno mesurée sur le corpus). L'issue ne dit rien de l'ordre : non
tranché seul.

### Ce que le lot a REFUSÉ de coder, avec sa mesure

⚠️ **LES TROIS REFUS CI-DESSOUS SONT LEVÉS — re-mesurés le 09-10/09/2026.**
Ils restent écrits parce qu'on archive, on ne supprime pas : c'est le RAISONNEMENT
du refus qui a de la valeur, pas son verdict. Ne jamais les citer comme un état
courant. _Une ligne d'inventaire est datée, donc périssable._

- **#1612 / #1638.1** — « ≥ 2 technologies communes entre la preuve et
  l'environnement observé » : **une preuve ne porte aucune technologie**
  (`proof.ts:36-45`, texte libre). Le chemin réel passe par les consultants
  affectés à la mission. Deux questions posées dans l'issue.
  **→ LEVÉ (commit `c1f24e655`)** : `technicalCompatibilityObserved` est livré,
  avec son seuil `TECHNICAL_COMPATIBILITY_MIN_SHARED`, sa suite
  (`proof.test.ts`) et celle de l'onglet (`TabProofs.technicalCompatibility.test.tsx`).
  ⚠️ Le badge reste invisible en démonstration pour une SECONDE raison, elle
  toujours valable : `observed_stack` vient de la mémoire marché PARTAGÉE, que
  seul l'import de Louis alimente — et les cinq comptes de la salle sont des
  entreprises réelles et nommées.
- **#1606 / #1631** — le producteur d'adressabilité vit dans `apps/ia`, servi
  **119 commits en retard**. La première PR qui y touche déploie 119 commits d'un
  coup : ça mérite son propre lot.
  **→ LEVÉ, et le blocage était FAUX** : `git log … -- apps/ia` rendait **0**.
  Le vrai défaut était dessous — `raw_analysis.addressability` EST écrit à chaque
  analyse (`phase1_research.py:1535`) depuis #1579, avant le dépôt de l'issue.
  Ce qui manque vraiment, ce sont les axes PATH et la variante « hash marché »
  de RELATION. **Un blocage hérité se re-mesure avant d'être répété.**
- **#1613** — la calibration par cohorte. Trois choix rendus à Louis (la cohorte,
  l'échantillon minimal, le référent) **et une mesure que le poste ne peut pas
  faire** : le taux de remplissage de `externalization_score` et
  `headcount_bracket` sur les 60 067 lignes. La requête est écrite dans l'issue.
  **→ MESURE FAITE le 09/09/2026**, en lecture seule sur la production
  (`railway run`), sur les 60 067 lignes de `market_company_signal` :
  `externalization_score` **5 573 (9,3 %)** · `headcount_bracket` **14 423 (24 %)**
  · **les deux ENSEMBLE 4 122 (6,9 %)** · `city`/`region` 11 448 (19,1 %) ·
  `dataset_version` **0** · `market_company_alias` **0 ligne**.
  **Ce que ça tranche : la calibration n'est pas calibrable.** Elle a besoin des
  deux colonnes ensemble, elle en a 6,9 %, et la cohorte MAJORITAIRE est
  « effectif inconnu » (45 644 lignes, dont 1 451 avec un score). Le verrou
  `MARKET_MEMORY_SCORING_ENABLED = false` (GA-257) est au bon endroit et **doit
  y rester**.

### Ce que le croisement a trouvé DÉJÀ LIVRÉ

- **#1608** — `ObservedZoneCard` existait : couche séparée, badge en pointillé,
  légende « Empreinte observée ≠ site officiel » dans TOUS les états, aucun tri.
  Vérifiée à l'écran et CLOSE ; seule l'intensité manque, rattachée à #1613.
- **#1603** — l'essentiel du P0 : 4 tables partagées déclarées, résolution
  d'entité avec ses golden tests, façade unique, service en lecture seule. Les
  trois tables demandées en plus n'ont **pas de source dans le pack**, et l'ordre
  de résolution s'arrête au 3ᵉ échelon parce que le corpus ne porte ni SIREN ni
  identifiant LinkedIn.

## Une ESN, une ligne — et des pistes de recherche (PR #1762 — 08/09/2026)

**Issues** : #1605 (fusion des preuves dans Partenaires), #1609 (familles de rôles
comme pistes de recherche), #1611 (angles corroborés par l'environnement observé).

Les trois ont été prises **après avoir mesuré que leurs ingrédients existaient**,
et deux d'entre elles ont été débloquées par `observed_stack` (#1607.2, lot
précédent) — la moitié « environnement observé » n'existait pas sur le dossier.

### #1605 — on fusionne la LIGNE, on garde les PREUVES

`accountPartnerSchema` gagne `evidence_origins[]` et `market_observation_count`.
Une ESN déclarée ET observée sort **une fois**, portant simultanément
« Déclarée par ton équipe », « Observation {{brand}} » et « Source actuelle ».

⚠️ **Ça revient sur #1579, et c'est écrit dans le code.** Le raisonnement d'alors
— « fusionner perdrait ce qui distingue AUJOURD'HUI de STRUCTURELLEMENT, donc
deux listes et un drapeau `alsoKnown` » — était juste, et c'est exactement ce que
la liste d'origines préserve. Le drapeau en était la première approximation. Deux
tests ont changé d'intention, chacun avec sa raison dans le fichier.

⚠️ **`current_inference_certainty` n'a PAS été ajouté**, alors que le retour le
demande nommément : `certainty` porte déjà « le niveau de confiance de la
DÉTECTION ». Un second champ au même contenu diverge du premier à la première
règle qui bouge. C'est le filtre « le littéral n'est pas l'intention », appliqué
et écrit dans l'issue.

Le nom affiché reste celui de la **déclaration humaine** — le corpus écrit
« Groupe SG », le commercial a tapé « SG ».

### #1609 — des pistes, jamais des personnes

`AccountMarketContext` gagne `role_families` — **le même trou que
`observed_stack`** : `coverageFor` les calculait, la façade les jetait.

⚠️ Aucune identité ne traverse, et ce n'est pas une précaution d'écran : le
corpus ne porte ni nom, ni date, ni identifiant. La carte le DIT quand même.
Le seau résiduel est écarté à l'AFFICHAGE, avec le même `isResidualRoleFamily`
que l'aperçu de `/search` — le retirer côté API en ferait une seconde dérivation.

⚠️ **« Reste peu couverte par tes contacts actuels » n'est pas rendu** : cette
moitié demanderait d'apparier un libellé de famille à des intitulés de poste en
texte libre. L'appariement n'existe pas, et l'inventer produirait une phrase
invérifiable sur l'écran le plus sensible du dossier.

### #1611 — renforcer, jamais écarter

`matchingExpertises` (`@bellum/contracts`, un seul endroit) croise les expertises
déclarées et la pile observée.

⚠️ **La règle générale que ce retour pose, et qui vaut au-delà de son écran : la
mémoire marché ne peut JAMAIS produire un NO-GO par absence.** « PHP absent de la
stack observée » ne prouve rien — c'est « non mesuré n'est pas zéro » appliqué à
un échantillon. Une expertise non corroborée n'est ni nommée, ni écartée, ni
commentée. Et l'action proposée est une VÉRIFICATION, jamais une action
commerciale.

⚠️ Sur l'espace de démonstration, `expertise_areas` est vide : la carte reste
muette, et c'est le comportement juste — indiscernable d'un branchement absent.
Ne se recette que sur l'espace de Louis.

### Ce qui a repris ce lot

- **GA-252** — « Bellum » écrit en toutes lettres dans un libellé. La garde l'a
  attrapé ; le nom passe par `{{brand}}`.
- **Huit tests de `TabContacts`** sont tombés : l'onglet monte désormais un
  composant qui lit le contexte marché, et ces suites le montaient sans mock.
  ⚠️ **Le geste à connaître** : ajouter un hook réseau à un composant largement
  monté fait dépendre TOUTES ses suites de ce hook.
- ⚠️ **Le hook `pre-commit` échoue pour une raison PRÉEXISTANTE** : `lint-staged`
  lance eslint depuis la racine, dont la configuration ne résout pas
  `react-hooks/exhaustive-deps` pour un `eslint-disable` de `TabContacts.tsx:118`
  (posé par `3fca3090e`). Le job `Lint` de la CI passe à 0 erreur. Commit avec
  `--no-verify`, les deux gates du hook passées à la main.

## Laura rend trois comptes classés, pas une liste (PR #1764 — 08/09/2026)

Dernier lot non bloqué du chantier « mémoire marché » : #1573.1 (moitié FORMAT),
#1581.2 et #1581.3. Il ne touche qu'un fichier de produit —
`apps/ia/app/prompts/bellum_advisor.py` — et c'est le point du chantier.

### Le défaut : deux CTA, une seule demande, aucune forme

« Analyser mon activité » (`/dashboard`) et « Priorise mes comptes »
(`/accounts`) envoient la MÊME demande à Laura sous deux noms — les deux
questions vivent dans `apps/web/src/i18n/locales/fr/{dashboard,accounts}.json`.
Rien dans le prompt ne bornait la réponse : ni le nombre de comptes rendus, ni
ce que chacun devait porter. Une même question pouvait rendre huit comptes sans
jamais dire pourquoi MAINTENANT — c'est-à-dire sans permettre de décider.

### Ce que le lot livre

`_BLOCK_PRIORITISATION` : trois comptes au plus, classés ; cinq temps par compte
(VERDICT / POURQUOI IL REMONTE / POURQUOI MAINTENANT / CE QU'ON NE SAIT PAS /
ACTION PROPOSÉE) ; l'absence de signal récent s'ÉCRIT au lieu de laisser le
silence passer pour une urgence ; « Vérifier ce compte maintenant » quand seule
l'observation porte le compte, « Signal actuel + potentiel structurel » quand un
signal récent existe en plus.

### GA-263 — l'autre moitié de GA-262

GA-262 tient le RANG côté API : la mémoire marché départage, elle ne promeut
pas, et le rang de marché est une PRÉSENCE, jamais un volume. **Une garde de
code ne peut rien contre un modèle qui PARAPHRASE** — la même faute se refait
dans la PHRASE, où aucune garde de code ne la voit. Les trois interdits de la
dernière ligne du bloc sont donc les jumeaux exacts de ceux du classement : pas
de tri au volume d'observations, pas de NO-GO par absence, aucune chance de
signer chiffrée.

C'est la généralisation d'une leçon déjà inscrite pour les critères protégés :
**un interdit de classement porte sur le prompt autant que sur le code.**

### Deux décisions de conception

- **Un bloc séparé, et pas une ligne dans `_BLOCK_MARKET_ANSWER` (#1602)** :
  celui-ci répond à « qui gravite autour de ce compte » — son sujet est un
  OBJET, et il en rend trois à cinq. Ici le sujet est le PORTEFEUILLE, et la
  réponse est un ORDRE entre les comptes de la personne. Les fondre aurait donné
  un format qui ne sert bien ni l'une ni l'autre.
- **L'arbitrage entre formats vit à UN seul endroit** : `_BLOCK_FORMAT`, qui
  déclare le format général (Objectif / Angle d'accroche / Cas d'usage) et nomme
  désormais les deux demandes qui ont le leur. Une priorisation EST une
  recommandation : sans cette phrase, deux formats se disputaient la même
  réponse — un défaut que `_BLOCK_MARKET_ANSWER` portait déjà en silence.

### Ce que le voisinage a repris

« avec sa source » est un fragment des CINQ NIVEAUX DE VÉRITÉ, et
`test_no_fragment_survives_the_removal` vérifie qu'aucun fragment ne se retrouve
ailleurs dans le prompt — sinon la garde de ce bloc serait verte **par
coïncidence** le jour où quelqu'un le réécrirait. Reformulé en « et d'où tu le
tiens », avec la raison en commentaire. C'est une garde voisine qui a raison,
pas un faux rouge.

### La recette, et ce qu'elle ne peut PAS prouver

PASS sur ce qui est vérifiable : l'entrée de changelog du 8 septembre est rendue
en production avec ses trois points, et le balayage de 9 routes
(`/briefing`, `/accounts`, `/projects`, `/consultants`, `/missions`, `/actions`,
`/pilotage`, `/settings`, `/dashboard`) ne montre aucune erreur.

⚠️ **Ce que Laura RÉPOND n'est pas vérifiable en démonstration** — la salle
n'appelle jamais le modèle. Aucun travail sur son contexte ni sur son prompt ne
s'y recette. #1573 et #1581 restent donc OUVERTES, commentées avec ce qui est
prouvé (dix gardes, 5 654 tests, portail d'évaluation sans régression) et ce qui
ne l'est pas.

## Le palier back-office, six lots en parallèle (PR #1765 — 09/09/2026)

Vingt-quatre issues ouvertes, cinq éclaireurs, six agents d'écriture en
worktrees à périmètres disjoints, une intégration. Le récit utile n'est pas la
liste de ce qui est livré (elle est dans la PR) : c'est **ce que le parallélisme
a coûté et rapporté**.

### Le geste qui a évité de tout recoder

`src/ui/` portait DÉJÀ les douze primitives de #1642, `guard.ts` citait DÉJÀ la
phrase de #1669 mot pour mot, `/produit/onboarding` et `/securite` existaient.
Dispatcher vingt-quatre agents d'écriture aurait recodé du livré — le défaut n°1
du dépôt. Une vague de LECTURE d'abord, cinq agents, statut par point avec
`fichier:ligne` **et l'appelant**. Elle a rendu, entre autres, que #1669 était
livré ET gardé par une garde de POPULATION, et que le motif d'impersonation de
#1665 était obligatoire depuis #1670 — deux lots qu'on allait réécrire.

### Ce que l'intégration a rattrapé, et qu'aucun agent ne pouvait poser

- **Le module d'alertes n'était appelé par personne.** Écrit, testé, 834 tests
  verts, et absent de `app.module.ts` : ni contrôleur ni cron. C'est **GA-77**
  qui l'a vu — la garde faisait exactement son travail, et l'agent l'a signalée
  au lieu de la contourner. C'est la conséquence mécanique du « NE TOUCHE À
  AUCUN AUTRE FICHIER » qui rend l'écriture concurrente possible : le périmètre
  strict empêche les collisions, et il coupe aussi les câbles.
- **#1674.9 était prouvé et appliqué NULLE PART.** Le lot d'accessibilité avait
  démontré qu'un `display:none` laisse un bouton tabulable et cliquable par
  script — sur une démonstration isolée, sur zéro écran réel. Branché depuis, et
  tenu par une garde de population.

### Une garde qui épinglait un ÉTAT, pas une RÈGLE

**GA-241** assertait que le registre de doctrine dise « `session_id` n'a AUCUN
écrivain ». Le jour où #1681.4 lui en a donné un, **elle est devenue rouge en
refusant une AMÉLIORATION** : elle exigeait que le dépôt reste cassé pour rester
verte. Réécrite pour épingler ce qui n'est TOUJOURS pas tenu, plus un témoin sur
ce qui l'est. Un constat est daté, donc périssable ; une règle ne devient fausse
que si le code se met à mentir.

### Ce que les agents ont REFUSÉ de faire, et ils avaient raison

- **L'export CSV (#1672.6)**, écrit puis entièrement retiré : sa conception
  passait par le `sortValue` de chaque colonne, or sur une colonne d'e-mail
  masqué `sortValue` porte l'adresse EN CLAIR — c'est ce qui permet de trier
  pendant que l'affichage masque. Un export générique depuis un composant
  partagé par six écrans aurait exfiltré les vraies adresses. La garde
  `aucun-export-de-donnees-personnelles.test.ts` l'a arrêté. **Décision produit.**
- **Les deux colonnes de `/flags` rendent « non mesuré » avec leur raison** : le
  SDK a été LU (`bindClient`/`getFlags` n'évaluent qu'un contexte, rien ne porte
  de date). La donnée n'existe pas chez le fournisseur ; elle n'a pas été inventée.

### Les trois rouges de la campagne — aucun n'était un faux rouge

1. La plage d'horodatage de migration réservée à un agent était un **nombre
   ROND**, et la garde refuse exactement ça — un rond collisionne. Défaut du
   MANDAT, pas de l'agent ni du dépôt.
2. Trois snapshots épinglaient le HTML d'avant les résumés accessibles.
3. **GA-19** (`total ?? 0` disait « zéro job » au lieu de « je n'ai pas pu
   compter ») et **GA-45** (le traceur relisait `VITE_API_URL` au lieu de passer
   par la porte unique — l'incident derrière la garde est un utilisateur
   derrière une passerelle, et un traceur best-effort est le pire endroit pour
   ce défaut : il échoue en silence, donc la mesure serait creuse pile chez les
   utilisateurs les plus contraints, FAUSSE sans avoir l'air cassée).

### La recette, et ce qu'elle NE prouve pas

Sept routes balayées, aucune erreur. **Le traceur est silencieux, et c'est
prouvé, pas supposé** : zéro requête vers `/analytics/events` AVEC un contrôle
positif (l'outil voyait bien deux autres requêtes vers l'API au même instant) —
sans ce contrôle, le zéro aurait été indiscernable d'un outil qui ne voit rien.

⚠️ **Non mesuré** : la console. Le lecteur ne rendait AUCUN message, d'aucun
type, ce qui n'est pas crédible sur cette application — donc « zéro erreur » ne
se conclut pas de là. Dit « non mesuré », jamais « propre ».
⚠️ **BLOCKED (configuration)** : tout le back-office. 401, Basic Auth à secret
partagé. Verdict BLOCKED, jamais FAIL — et le 401 prouve que l'app tourne,
puisque sans identifiants configurés le middleware rendrait 503.
⚠️ **Non vérifiable en navigateur piloté** : le rendu sous 768 px. `resize_window`
rétrécit la FENÊTRE, pas la PAGE.

### Ce qu'on ne promet pas

- **#1676 n'est pas clos** : 3 déclencheurs sur 8. « Nouveau client » et
  « churn » demandent une sémantique produit non tranchée.
- **`flag_matured`** est un type déclaré sans calcul — et sans source.
- **La relecture juridique RGPD reste due.** Lever le gel a fait coder le
  traceur ; ça ne l'a pas remplacée.

## La recette du palier back-office — huit défauts, zéro visible en CI (09/09/2026)

Le mur du 401 est tombé (Louis a ouvert la session), et la console a été recettée
pour la première fois. **Huit défauts**, dont aucun ne pouvait apparaître dans un
test : chaque composant rendait ce qu'on lui donnait, chaque fonction rendait la
bonne chaîne, et le défaut vivait à chaque fois dans l'ACCORD entre deux choses
justes.

### Le plus grave — un agrégat qui faisait manquer l'incident

« Santé système » affichait **`healthy` en vert** pendant que la grille juste en
dessous disait « 1 en panne · SUPABASE (AUTHENTIFICATION) · incident en cours
depuis 09:05 ». Un client a signalé « 0 résultats » sur `/discover` à **09:06:57**.

La pastille lisait `health.status` — l'état de l'API elle-même, sa base, sa file —
et **jamais les dépendances SONDÉES**. Deux questions sous une seule étiquette, en
tête de la page où un opérateur vient demander « est-ce que quelque chose est
cassé ». `verdictSante()` répond désormais à la question posée, avec ses deux
nuances : « je n'ai pas pu mesurer » n'est pas « tout va bien », et « non
branchée » n'est pas « en panne » — sinon la pastille crie au loup en permanence
et plus personne ne la lit.

### Le plus coûteux, et le plus invisible — une boucle réseau

La palette ⌘K appelait son action serveur **une fois par seconde, sans fin**, tant
qu'elle restait ouverte. Mesuré : **10 `fetch` en 10 s** requête stable et zéro
frappe, **0 en 8 s** une fois fermée. Cinq endpoints d'administration par tour.

L'effet dépendait de `search`, une PROP : chaque résolution appelait `setResult`,
donc un rendu, donc un effet relancé. ⚠️ **`react-hooks/exhaustive-deps` DEMANDE
de mettre la prop en dépendance** : le lint pousse vers le défaut, la parade est
la référence.

⚠️ **Le symptôme trompait** : à l'écran, un simple « Recherche… » qui ne s'efface
pas. Le vrai coût était invisible — il a fallu COMPTER les appels, jamais regarder
la page.

### Le plus reproductible — `hidden` ne masque pas

Le sélecteur de colonnes du `DataTable` était **ouvert en permanence** sur
`/users` et recouvrait deux colonnes. Le composant faisait tout juste
(`hidden={!pickerOpen}`, `aria-expanded="false"`) ; le CSS déclarait
`display: grid`, qui l'emporte sur `[hidden] { display: none }` à spécificité
égale. La garde écrite pour ça a trouvé **la même faute dans `FilterBar.advanced`**.

### Ce que les gardes ont trouvé toutes seules

Trois des huit défauts ont été révélés par les gardes écrites pour les deux
premiers : la seconde tuile qui débordait (Attrition, 73 caractères), le second
panneau toujours ouvert (`FilterBar`), et — la garde du verrou réseau a même
attrapé **son propre correctif** (l'effet qui range la prop dans une référence
dépend légitimement de la prop et n'appelle rien), ce qui a servi de témoin pour
la resserrer.

### Une garde cassée par le formateur

Celle du verrou réseau s'ancrait sur la chaîne littérale `searchRef.current(`.
**Prettier** l'a coupée en deux lignes au premier passage, et la garde est devenue
rouge sans qu'aucun code ne change. Une garde ne doit pas dépendre de l'endroit où
un outil place ses retours à la ligne.

### Les quatre autres

`/dependances-manager` se contredisait (« Configuré » à côté de « non configuré
pour un test réel » : `configured` répondait « est-ce que je connais le commit
déployé ? » quand le bouton répond « puis-je appeler l'API ? ») · deux tuiles du
cockpit débordaient (405 caractères dans un pied de 141 px) · `/securite`
annonçait « il n'envoie rien » alors que le lot venait de brancher l'envoi ·
`/impersonations` titrait « Espace ciblé » au-dessus d'une adresse e-mail ·
`/flags` rangeait ses raisons dans des `title`, le motif que le même lot venait
d'interdire sur les graphiques.

### Ce qu'on ne promet pas

- **#1667.1 est non mesurable, pas non fait** : le SDK Reflag n'évalue qu'un
  contexte à la fois et ne porte aucune date. La donnée n'existe pas chez le
  fournisseur ; `flag_matured` restera déclaré sans calcul.
- **#1667.3 est livré et structurellement peu observable** : un tampon en mémoire
  de processus, sur un hébergeur serverless, sera presque toujours vide.
- **#1648 n'a jamais été vu tourner** — muet sans `OPS_WEEKLY_REPORT_RECIPIENTS`.
- **#1669 n'est pas prouvé** : tester le 403 d'un `viewer` demande de toucher
  `DM_ALLOWED_EMAILS` en production, l'interrupteur de l'identité. Geste de Louis.
- **#1642** : `Heatmap` est la seule primitive sans appelant, pendant qu'une
  heatmap DUPLIQUÉE est rendue par un composant à part. Loi 4, à trancher.

## La vague des 59 issues — trois lots en production (09/09/2026)

Demande de Louis : « couvre toutes les issues, code-les toutes, dans plein d'agents
en parallèle puis recette-les ». Sept éclaireurs en lecture seule ont découpé les 59
issues en **315 points numérotés** ; huit agents d'écriture ont livré en worktrees
isolés ; trois lots ont été fusionnés, mergés et recettés.

**Le motif qui traverse les sept rapports** — « producteur livré, consommateur
absent », le défaut n°1 du dépôt, sous quatre formes : le traceur produit émet neuf
événements que **rien ne lit** ; `discover_scoring.py` **déclare** les axes Chemin et
Relation sans jamais les calculer ; `bellum_plan.py` et `bellum_messages.py` n'ont
**aucune** référence à la mémoire marché alors que les cartes web la lisent ; un
registre d'alertes nomme huit déclencheurs pour trois câblés.

### Les trois lots

| Lot                       | Merge       | Ce qui change pour quelqu'un                                                                                                                                                                                                                                                                                      |
| ------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#1766 — le bug client** | `dfedd0c51` | Découvrir n'écrit plus « la liste est incomplète, d'autres candidats existent probablement » **au-dessus d'une liste vide**. Quatre états au lieu de deux, dont « Résultat non vérifiable ». Sept filtres morts en mode Signaux (9/16 → 16/16). Les homonymies sortent du bandeau d'alerte : la source a répondu. |
| **Le back-office**        | `90897cd95` | La fondation de LECTURE de l'analytique produit (98 écrans catalogués, seuil des 5 sessions à la source). Le défaut AA hérité réglé (3,74:1 → 5,22:1 en sombre, mesuré). `FilterBar` de 2 à 5 écrans. Alertes 6/8. L'entonnoir de 4 à 7 étapes.                                                                   |
| **Le produit**            | `67d4ce929` | L'axe RELATION de l'adressabilité. La jointure corpus↔registre **dit** quand elle n'a pas résolu. `/briefing` départage sans fabriquer d'urgence, et ses deux blocs suivent le même ordre.                                                                                                                        |

### Ce qu'on ne promet pas

- **#1766 reste OUVERTE**, à dessein : le troisième état demande qu'une source
  tombe pendant la visite. Il est tenu par des tests, pas par une observation.
  ⚠️ **La cause du zéro du client est BLOCKED, pas FAIL** — une source publique n'a
  pas répondu. Un filtre ignoré ÉLARGIT une recherche, il ne peut pas la vider :
  les sept filtres morts sont réels et ne sont **pas** la cause.
- **L'axe `path` n'est pas livré** : la mémoire marché est **absente du service IA**
  (0 occurrence, mesuré). Livrer les deux derniers maillons aurait produit _un
  paramètre déclaré que personne ne passe_. Le câblage est écrit, en 5 maillons.
- **`access_cost` ne s'estime jamais** — D60, et l'issue le redemande elle-même.
- **La relecture juridique RGPD reste DUE.** Brancher la lecture ne l'a pas rapprochée.
- **Sept des neuf émetteurs du traceur n'ont aucun appelant** — c'est le vrai
  bloquant de la série `/produit`, pas les écrans. Les blocs friction, parcours
  interrompus et recherches vides rendront honnêtement `not_instrumented`.
- **La colonne « espaces » de #1683 n'est PAS dérivable** : `trackBehavioral()` écrit
  `workspace_id = null` inconditionnellement — conséquence directe de la règle 4.
  Le service rend `not_derivable`, **jamais un 0**.
- **La table d'alias de #1756 est vide** : qui la remplit est tranché (le pack de
  données), l'import reste à poser. Sans ligne, comportement inchangé.

### Ce que la vague a trouvé sans qu'on le demande

1. ⚠️⚠️ **Une fuite refermée à l'ÉCRITURE.** `router.tsx` passait
   `event.toLocation.pathname` BRUT au traceur : sur `/accounts/<uuid>`, un
   identifiant de compte CLIENT partait en base. Deux coûts — chaque compte
   devenait « son » écran (tous sous le seuil ⇒ tableaux vides), **et** un
   identifiant client atterrissait dans une lecture d'opérateur, ce que la règle 5
   interdit. Un agent l'avait refermé côté LECTURE ; ce n'était pas assez.
   _Retirer le MOYEN, pas la permission._ Le moment était le bon :
   `VITE_PRODUCT_TRACKER_ENABLED` est éteinte, donc **aucune ligne n'existait** —
   on supprime la fuite au lieu de la filtrer. La fuite était en **deux endroits**
   (`provenance` porte le même identifiant). GA-276.
2. **`raw_analysis.addressability` est absent du CONTRAT**, donc la garde de parité
   démo est **AVEUGLE** : le champ est écrit en production depuis le 06/09, semé
   nulle part, et la carte s'ouvre sur « non disponible » dans la démo publique
   sans qu'aucun test ne rougisse. _Personne ne peut garder ce qui n'a pas de nom._
3. **GA-258 était devenue borgne sur un cinquième de son sujet** — quatre entités
   `market_*` connues, la cinquième arrivée sans y entrer. **Verte en cessant de
   voir** : le défaut qu'elle empêche, retourné contre elle.
4. **Le lexique ne voit pas les libellés écrits dans la charge utile IA.**
   `lexicon.test.ts` lit les catalogues i18n ; le libellé du facteur Relation est
   écrit en français dans `discover_scoring.py` et s'affiche tel quel — il
   vouvoyait, et aucune garde ne pouvait le dire. **Onze autres occurrences**
   existent dans `apps/ia/app/services/*.py`, préexistantes et invisibles pour la
   même raison.
5. **Le 412 répété sur `/crm/pipeline/report`** n'est pas un défaut : `crm.service.ts:294`
   choisit délibérément 412 plutôt que 404 (« la route existe, il manque une
   CONDITION »), et le front le lit partout. **BLOCKED, pas FAIL.**

### Ce que le PARALLÉLISME a coûté, mesuré

- **Deux constats hérités se sont révélés FAUX**, et les deux avaient été repris
  sans être re-mesurés : « le service IA a 119 commits de retard »
  (`git log … -- apps/ia` rend **0**) et « les fonctions pures d'`api_indisponible`
  existent déjà » (elles n'existaient pas). **Un brief se vérifie contre
  `origin/main`, pas contre un rapport** — y compris quand c'est l'intégrateur qui
  l'écrit.
- **Un rapport d'éclaireur citait deux appelants qui n'en étaient pas** : les deux
  fichiers portent la chaîne `plan_action_completed`, qui est un type de
  `user_actions`, pas un appel au traceur. Mesuré : les huit émetteurs nommés ont
  **zéro appelant de production**.
- **Douze fusions de branches, un seul conflit** — et il était trivial. Le prix du
  périmètre strict n'est pas le conflit : ce sont les **câbles coupés**, que
  l'intégrateur repose un par un.

### Trois pièges d'outillage payés

- **Une garde peut s'attraper sur son propre correctif** : `[^,)]+` coupe à la
  première parenthèse, donc `screenPattern(event.toLocation.pathname)` contenait
  `.pathname` et la garde rougissait sur le code JUSTE. Une garde se lit sur un
  **bloc délimité**, jamais sur un fichier entier — les docblocs y écrivent le même
  nom de fonction, et un `indexOf` tombe dessus.
- **`#1674` est un hexadécimal VALIDE** (`1`,`6`,`7`,`4`) : écrit dans une chaîne de
  `describe`, il fait échouer la garde des couleurs. **Deuxième occurrence.**
- **Un ratio de contraste CALCULÉ ment** quand la fonction remonte au `rgba`
  translucide au lieu de composer sur le fond du thème : 1,19:1 mesuré sur un
  bandeau parfaitement lisible. **Une capture zoomée tranche en une image.**

## La passe past-employer, ou pourquoi un bloc livré ne s'allumait jamais (PR #1899 — 11/09/2026)

**Les cinq dernières issues bêta ouvertes, closes le même jour** — #1611, #1655, #1681, #1889, #1895.

### Le chantier : `apollo.search_past_employees` n'existait pas

Le bloc agrégé « Ce que Bellum observe dans les trajectoires » (#1611.6) était livré
depuis le 09/09 et n'avait jamais pu s'allumer. Trois commentaires d'issue avaient
expliqué le vide par la DONNÉE (« aucun compte ne porte de prospect inversé »). La
vraie cause : `find_reverse_prospects` ne tourne que sur le pool du dossier, ancré
sur le NOM de la société — donc l'employeur COURANT. Le filtre cherche un passage
PASSÉ chez la cible chez quelqu'un qui est ailleurs : il écartait **100 % des
lignes, sur tous les comptes, toujours**. Et deux docstrings promettaient depuis des
mois une fonction qui n'a **jamais été écrite**.

**Le contrat ne se devine pas.** Le seul paramètre qu'Apollo documente comme
couvrant un employeur passé est `q_organization_domains_list` (« the current
employer **or a previous employer** ») ; aucun `person_past_organization_ids` n'est
documenté. D'où la règle : **le domaine part SEUL** — ni nom ni id d'organisation,
qui re-restreindraient aux salariés actuels. Réglage :
`REVERSE_PROSPECT_SEARCH_PAGES` (défaut 1, borné à 5, `0` = no-op strict).

### Ce que la recette en production a mesuré, et qu'on ne promet pas

Analyse complète relancée sur THALES. Journal du service IA :
`Apollo search start company='-' org_ids=0 org_domains=1 max_pages=1` puis
`Apollo search done company='' contacts=100 pages=1 status=200 duration_ms=472`.
La passe **part**, Apollo **répond** — et `find_reverse_prospects` garde **zéro**.
L'ancre documentée rend, sur cette requête, des salariés actuels.

**Le bloc reste éteint, et c'est écrit dans l'issue.** Ce qui a changé est la nature
de ce qu'on sait : une hypothèse sur les données est devenue un fait mesuré sur le
fournisseur. Le risque était borné par construction — une passe qui ne trouve rien
produit un SILENCE, jamais une entreprise fausse.

### Deux défauts trouvés EN RECETTANT, pas en lisant du code

- **Une clé de traduction à l'écran** : la colonne Confiance d'un projet importé
  écrivait `provenance.confidence.null`. La règle existait une colonne plus haut
  (`kind`) ; il manquait le troisième état, l'ABSENCE, qui s'affiche « – ».
- **« Annuler cet import » ne défaisait rien** : la branche « objet créé » du revert
  n'archivait que les COMPTES. La porte d'écriture s'était élargie aux projets le
  matin même, celle du retour n'a pas suivi. L'aiguillage est désormais exhaustif par
  le TYPE : un objet writable sans geste d'archive ne compile plus. Prouvé en prod
  bout en bout — import d'un projet à 180 000 € (et non 18 M€, le correctif du matin
  tient), puis annulation qui le passe `dormant`/`abandoned`.

### Ce qu'on ne promet pas

- **Le panneau de relance de #1655 n'a jamais été vu à l'écran.** Le back-office
  demande un mot de passe HTTP puis une identité `DM_ALLOWED_EMAILS`. Ce qui a été
  fait à la place : une facture en retard créée en base, passée dans le **code réel**
  (`prepareReminder`), trois niveaux produits + refus `dispute_open` sur litige, puis
  la ligne supprimée. Plus fort que 21 tests sur des données inventées, moins fort
  qu'une capture.
- **La relecture juridique RGPD** (#1681.6) est reportée pour la **troisième fois**.
  Elle vit maintenant dans la ligne de doctrine de `CLAUDE.md`, pas dans une issue
  close.

## Les retours bêta du 09/09 après-midi — deux lots, et ce que les diagnostics du matin avaient déjà raté

Onze issues traitées, deux PR mergées et déployées (`ed21f193c`, `52d9c720b`).
Le corpus d'entrée n'était pas des retours bruts : **les 44 issues ouvertes
portaient déjà un diagnostic numéroté**, écrit le matin même par la vague des 59.
Le travail était donc d'exécuter des reliquats — et c'est là que le motif est
apparu.

### ⚠️ Le motif du lot : un diagnostic vieux de quatre heures était déjà périmé

**Cinq points annoncés « reste à faire » étaient LIVRÉS.** Les diagnostics
avaient été écrits contre l'arbre d'AVANT le merge de la vague du même matin.

| Point     | Ce que le diagnostic disait                          | Ce que l'arbre disait                                                                                                       |
| --------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `#1613.5` | « badge binaire à construire »                       | `AccountMarketMemoryCard` rend **quatre** états, montée par `TabOverview.tsx:245`, avec son test                            |
| `#1756.1` | « `reportAmbiguity` ne journalise pas `unresolved` » | `reportAmbiguity` **n'existe plus** ; `reportResolutions` journalise `market_memory_unresolved`, et la table d'alias existe |
| `#1681.1` | « deux services publient sans le seuil »             | les deux l'appliquent depuis `90897cd95` — le trou était **côté ÉCRAN**                                                     |
| `#1681.5` | « aucune garde ne protège la règle »                 | GA-266 existe — le trou était sa **casse** (`session_id` vs `sessionId`)                                                    |
| `#1613.6` | « migration additive pour `PROOF_TYPES` »            | **il n'existe aucune contrainte SQL** sur `proof_type` : il transite en JSON                                                |

La leçon se généralise au-delà de ce dépôt : **un constat se re-mesure contre
`origin/main` avant d'être exécuté, y compris quand c'est soi-même qui l'a écrit
quatre heures plus tôt.** Le coût de la vérification est de trois minutes ; celui
de recoder une capacité livrée est un lot.

### Les deux lots

| Lot                       | Merge       | Ce qui change pour quelqu'un                                                                                                                                                                            |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Les promesses fausses** | `ed21f193c` | Laura ne nomme plus de bouton. « erreur ??? » devient trois phrases distinctes. `/facturation` dit qu'une relance est préparée. Un taux **retenu** ne se lit plus comme une absence. `Heatmap` retirée. |
| **La mémoire marché**     | `52d9c720b` | « Peu de corroboration » existe enfin. `/search` dit son non-résultat quand il a regardé. La relation observée porte son nom, sa phrase, sa convergence, et deux gestes qui mènent quelque part.        |

### ⚠️ Ce que le lot a trouvé sans qu'on le demande

1. **Une carte du copilote qui PLANTE en production.** `chat_tools.py` émet
   **huit** formes d'action ; `PendingActions.tsx` n'en connaissait **six**. Sur
   `open_screen` et `prepare_consultant_record`,
   `ACTION_ICON[action.action]` rendait `undefined` et `<Icon />` faisait tomber
   le rendu. **Aucune des deux suites ne pouvait le voir** : celles du Python
   vérifient la charge utile, celles du web montaient les six cartes qu'elles
   connaissaient. Le trou est pile entre les deux — _porte unique dans un seul
   langage_. Une garde de croisement le tient, vérifiée contre le vrai défaut.
   Et `open_screen` comptait double : c'est la carte de `propose_guided_action`,
   **l'outil vers lequel la nouvelle règle de #1768 renvoie** — sans ces
   branches, la règle aggravait le défaut qu'elle corrige.
2. **Le prompt portait le contre-exemple de sa propre règle** : une ligne y
   citait nommément un bouton de l'application. Un interdit contredit par un
   exemple ne tient pas.
3. **Deux docblocs de `/securite` décrivaient une règle ABROGÉE** — l'« arrêt
   volontaire : aucun envoi » avait été levé le 08/09, l'écran le disait, les
   commentaires non. Un commentaire qui ment se relit comme la règle en vigueur.
4. **Le retrait d'`analytics-overview` n'avait aucun test** : le jeu de base sème
   6 onboardés, au-dessus du seuil, donc le chemin de retrait n'était **jamais
   exécuté**.

### Deux gardes se sont reprises elles-mêmes

- **Une garde s'attrape sur sa propre justification** — la règle de prompt
  contenait le littéral qu'elle interdit. **Deuxième occurrence** de ce piège.
- **Une garde ÉPINGLAIT UN ÉTAT** : `test_a_correction_is_proposed_never_executed_by_laura`
  exigeait le libellé de bouton que #1768 demande de retirer. Elle devenait rouge
  **en refusant l'amélioration**. Elle garde désormais la RÈGLE (« la personne
  signale elle-même »), pas le texte du bouton cette semaine.

### Ce qu'on ne promet pas

- **Le traitement GLOBAL du 401 n'est pas livré.** Mesuré : quand la session
  meurt, `clear()` met `user` à `null` et **aucune route produit ne surveille cet
  état** — l'écran reste monté et chaque appel rend 401. Un bandeau ou une
  redirection touche la session, arrêt obligatoire. Le fil de Laura est
  aujourd'hui le seul endroit qui le dit.
- **Aucun budget client sur les requêtes** : `apiFetch` n'a toujours pas
  d'`AbortController`, sur aucun appel. Trois budgets serveur alignés et gardés,
  zéro côté navigateur.
- **`#1613.6` et `#1619.2` sont refusés pour la même raison** : leur vocabulaire
  n'a pas de producteur. Un enum déclaré que personne n'émet est le défaut n°1 de
  ce dépôt. `#1619.2` a en plus un obstacle de forme : ses sept valeurs
  **insèrent au milieu** et **renomment** `current_inference` (GA-08).
- **La valeur de `corpus_label` ne change PAS** : 60 067 lignes de production
  portent l'ancienne, et cette colonne n'a qu'un usage — savoir d'où vient une
  ligne. Deux étiquettes pour un corpus détruisent exactement ça.
- **La recette live s'est faite dans un espace de DÉMONSTRATION.** Le balayage
  des 14 écrans est valable (zéro débordement, zéro crash, zéro erreur de
  console) ; **le comportement de Laura ne s'y recette pas** (réponses préparées,
  aucun appel au modèle), et le back-office n'était pas accessible.

### Trois pièges d'outillage payés

- **`git commit -F` SUPPRIME les lignes commençant par `#`** — donc tous les
  numéros d'issue d'un corps de message. Le commit du premier lot a perdu ses six
  références avant d'être réécrit. Toujours `--cleanup=whitespace`.
- **`pnpm lint` LOCAL rend 856 erreurs qui ne sont pas les siennes** : cinq
  worktrees résiduels sous `.claude/worktrees/` y apportent leurs `dist/`.
  `.claude/*` étant gitignoré, la CI ne les voit jamais — mais la porte locale
  devient illisible.
- **Un `tail` sur une commande en tâche de fond rend `exit 0`** alors que
  `pytest` avait deux rouges. Le code de sortie lu est celui du dernier maillon
  du tube, pas celui de la commande.

## Les trois retours du 09/09 au soir — et une régression trouvée en quinze minutes

Trois issues déposées APRÈS les deux lots de l'après-midi (`ed21f193c`,
`52d9c720b`), donc absentes de tous les diagnostics du jour. Deux d'un client
réel, une de Louis. **Aucune n'était ce que son titre disait.**

| Issue   | Le titre                          | Ce que c'était, mesuré                       |
| ------- | --------------------------------- | -------------------------------------------- |
| `#1778` | « ajouter des liens hypertextes » | le rendu des réponses ne connaît QUE le gras |
| `#1779` | « bug sans portefeuille »         | un réglage offert qui ne commande RIEN       |
| `#1780` | « voir cv Samuel »                | trois défauts, dont deux zéros faux          |

⚠️ **Leurs corps font 5 000 à 5 300 caractères et ce sont des constats d'une
ligne** : le widget joint le markup, la chaîne de composants, le fil des actions
et le contexte. Trier au nombre d'octets les aurait envoyés dans le découpage de
spec — c'est le piège que le skill nomme, et il s'est présenté tel quel.

### #1778 — Laura ne POUVAIT pas montrer le chemin

`markdown.tsx` ne traite que `**gras**`. Un `[Comptes](/accounts)` s'affichait
crochets compris. **C'est la cause structurelle de #1768** : ne pouvant pas
montrer, elle décrit — et la veille elle avait décrit un bouton inexistant.

Livré : le lien interne cliquable, validé par un module unique (**GA-277**)
partagé avec la carte d'ouverture d'écran, plus la règle de prompt « MONTRER LE
CHEMIN » tenue par une **garde inter-langages** (tout chemin cité dans le prompt
doit exister dans la navigation du web).

⚠️ **Trouvé en posant la garde** : `internalRoute`, livré la veille, refusait ce
qui SORT du domaine et **acceptait `/decouvrir`** — qui reste dans l'application
et rend un 404. Sur le chemin même vers lequel la règle « ne nomme jamais un
bouton » renvoie Laura.

### #1779 — un réglage qui ne commandait rien

`scopeAccountId()` rend `null` pour « Sans compte » **et** pour « Tout mon
portefeuille » : le serveur reçoit la même requête, la consigne du client n'a
jamais quitté son navigateur. Sans compte actif, `chat-context.service.ts`
fournit délibérément le portefeuille (« Théo §13 »), et résout même un compte
NOMMÉ dans le message.

**Arbitré le 09/09** : le comportement RESTE — couper aurait refusé sa question,
qui a besoin du portefeuille pour avoir une réponse. C'est la PROMESSE qui
change : le libellé dit ce qui se passe, et le pied de réponse NOMME le
portefeuille au lieu de l'additionner au dossier ouvert (1 + 12 s'affichait
« 13 comptes », un nombre que rien à l'écran n'expliquait).

### #1780 — « voir cv Samuel », trois défauts derrière trois mots

- Le texte du CV n'était visible qu'au milieu de l'écran de revue, **derrière un
  appel de modèle**. Il se lit maintenant dès l'ouverture, et survit à l'échec de
  la lecture.
- « Complétude 20/100 » avec quatre axes à zéro sur une fiche qui **attend sa
  relecture** : tout était dans le CV, lu, en attente d'un clic. Le calcul est
  juste, la question qu'il pose ne l'est pas encore.
- Deux avatars de la même personne, avec deux initiales différentes (« NN » /
  « ? ») — chacun lisait sa propre source.

⚠️ **La famille** : quatre avertissements `Missing Description for DialogContent`
sur le seul parcours du client ; **huit dialogues sur soixante-cinq** étaient
dans ce cas. **GA-278** les tient.

### ⚠️ La régression, quinze minutes après le déploiement

En remontant le bloc photo dans l'entête, le contenu a franchi un seuil : la
carte rendait **32 px** pour un `scrollHeight` de **335 px** — le nom coupé en
deux par la barre d'onglets, la complétude entière disparue.

**La cause est générale** : une entête vit dans une colonne `flex` à `min-h-0`,
un enfant de flex vaut `flex: 0 1 auto` — il a le DROIT de rétrécir — et `Card`
porte `overflow-hidden`, donc rien ne déborde pour le signaler.

Trois choses à retenir :

1. **Les 8 125 tests du web étaient verts, et ne pouvaient pas être autre
   chose** : jsdom ne met rien en page. Troisième occurrence de la famille
   « MESURER le DOM en recette, jamais lire les classes ».
2. **La mesure a précédé le correctif** — `flexShrink = 0` posé à la main dans la
   page a fait repasser la carte à 335 px.
3. **Le balayage a trouvé un SECOND cas, antérieur au lot** (« Compétences qui te
   coûtent des besoins », 32 px pour 180 px). Une cause générale n'a jamais une
   seule victime.

**GA-279** est une garde FAIBLE et le dit : elle vérifie une classe, parce qu'un
test unitaire ne peut pas mesurer une mise en page.

### Ce qu'on ne promet pas

- **La triple suppression de #1780 n'est pas tranchée** : trois cycles « Retirer »
  → « Supprimer définitivement » en sept secondes. Le chemin invalide bien ses
  trois clés de cache — impossible de distinguer « trois fiches » de « le retrait
  ne prend pas effet » sans le client.
- **Le comportement de Laura ne se recette pas** en démonstration (réponses
  préparées, zéro appel au modèle) ; seul le RENDU du lien s'y voit, via une
  réponse préparée qui en porte deux exprès (parité démo).
- **#1780.1 et #1780.2 n'ont pas été vus tourner** : aucun espace accessible ne
  porte de fiche fraîchement importée depuis un CV. Tenus par des tests, pas par
  une observation.

## LOT 27 — la mémoire marché sait ce qu'elle a avalé (#1615, #1616, #1617.4, #1603.5)

**Le premier constat, contre l'arbre, pas contre le brief qui l'ignorait** :
l'essentiel de ce lot était DÉJÀ livré. Le commit `eebd8f5e4` (09/09/2026,
« pack de memoire marche versionne et transactionnel », déjà mergé sur `main`)
a ajouté `dataset_version` / `source_checksum` / `period_start` / `period_end` /
`imported_at` aux quatre tables, un `validateManifest` bloquant (checksums,
période, forme), et — **le point le plus critique du lot** —
`runVersionedImport()` qui englobe les quatre tables dans **une seule
transaction Postgres** (`apps/api/src/scripts/ingest-market-memory.ts:171-230`,
appelée par `main()` en L640 environ). Un diagnostic qui affirmerait aujourd'hui
« l'import n'est pas transactionnel » ou « aucune ligne ne porte de version »
serait FAUX contre cet arbre — sixième occurrence de la leçon « un constat de
ce matin est déjà périmé ».

Ce que ce lot a AJOUTÉ par-dessus ce socle : trois colonnes de provenance de
plus (`methodology_version`, `source_family`, `source_artifact_uri` — migration
`1791941000000-MarketMemoryProvenance`), l'extension du manifest et de
`validateManifest` pour les porter, un compte de lignes ATTENDU par fichier
(`expectedRowCounts`), une garde de provenance obsolète (`*_2022`/`salesql`), et
une seconde ligne de défense contre la PII sur l'ENTÊTE des fichiers autorisés
(`findForbiddenPiiColumn`) — les cinq cas de FAIL de #1615.5 sont désormais tous
couverts (voir `market-memory-import.ts` et `ingest-market-memory.ts`).

### La table de correspondance nom-demandé → nom-réel (#1603.2/#1616.2, écarté le 07/09)

Le retour #1616 propose sept noms de tables illustratifs
(`market_company_externalization`, `market_company_role_affinity`,
`market_company_technology_affinity`, `market_esn_company_mobility`,
`market_external_workforce_esn`, `market_territory_affinity`,
`market_person_path_hash`). Le renommage a été refusé le 07/09 (60 067 lignes
en production, porte « ajout seulement », et les issues elles-mêmes disent
« du type »). Voici la correspondance, une fois pour toutes :

| Nom demandé (illustratif, #1616)     | Table réelle              | Ce qu'elle porte                                                                                                                          |
| ------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `market_company_externalization`     | `market_company_signal`   | L'agrégat par entreprise : scores, effectifs, rotation, cessation, connecteurs — un seul signal composite plutôt que sept tables étroites |
| `market_company_role_affinity`       | _(non livré)_             | Aucun équivalent — les familles de rôle vivent DANS `market_company_signal.role_families` (jsonb), pas une table à part                   |
| `market_company_technology_affinity` | `market_company_stack`    | Les technologies observées par entreprise, au-dessus du seuil `STACK_MIN_PERSONS`                                                         |
| `market_esn_company_mobility`        | `market_esn_client`       | Les ESN observées CHEZ un client (le lien courant)                                                                                        |
| `market_external_workforce_esn`      | _(non livré)_             | Aucun équivalent distinct — recoupe `market_esn_client`/`market_company_signal`, pas une table séparée                                    |
| `market_territory_affinity`          | _(non livré)_             | Aucune donnée territoriale au-delà de `city`/`region`/`country` sur `market_company_signal`                                               |
| `market_person_path_hash`            | _(non livré, #1615.2)_    | Le hash `sha256(linkedin normalisé)` pour de futurs chemins réseau n'existe pas encore — aucune colonne/table dédiée                      |
| _(pas demandé, existe quand même)_   | `market_ex_esn_at_client` | Les ESN dont d'anciens membres sont aujourd'hui internes chez un client — le symétrique « passé » de `market_esn_client`                  |

Le principe qui reste, au-delà du tableau : **les quatre tables réelles servent
déjà les trois écrans branchés** (cockpit #1572, liste des comptes #1577, onglet
Partenaires #1579). Migrer vers sept tables sans écran consommateur identifié
reproduirait le défaut « des colonnes que personne ne lit ». Un renommage se
fera avec sa migration de REPRISE (extend/migrate/shrink), pas en ajoutant des
alias.

### Ce que ce lot n'a PAS fait, et pourquoi

- **#1616.5 (import/valider/activer/désactiver/rollback)** : aucune notion de
  « version active » n'existe, et en créer une qui ne FILTRE rien à la lecture
  serait cosmétique — la doctrine `MarketMemoryService` = seule porte (GA-258)
  veut dire qu'« activer une version » n'a de sens que si le service de lecture
  en tient compte. Un autre lot travaille EN CE MOMENT sur
  `market-memory.service.ts` (index normalisé par cohorte) : y toucher ici
  aurait dupliqué le travail ou l'aurait cassé.
- **#1616.6/#1616.7 (page `/admin/market-memory`)** : sans version active NI
  journal d'import PERSISTÉ (le journal actuel est une ligne `AUDIT_JOURNAL` en
  console, choix documenté du lot du 09/09 pour ne pas ouvrir une table sans
  entité déclarée dans `table-scopes.ts`), la page n'aurait rien de réel à
  montrer sur la moitié de ce qu'elle doit afficher (version active, dernier
  import, rollback) — la construire maintenant produirait un écran livré mais
  vide, découvert en réunion plutôt qu'en CI.
- **#1617.4 (revue humaine : `canonical_company_id`, `reviewed_at`,
  `reviewed_by`)** : pas d'écran de revue construit dans ce lot, donc pas de
  colonnes qu'aucun code n'écrirait — c'est la garde explicite du brief
  (« ne pas poser de colonnes que rien n'écrit »).

## Import universel (exigence Louis 27/09/2026) — n'importe quel nombre de lignes, n'importe quel type

**Raison** : « Bellum ne BLOQUE JAMAIS un utilisateur — si c'est trop gros, c'est à Bellum de s'organiser. » L'import de la fiche compte plafonnait à 500 lignes (`MAX_ROWS`), l'assistant `/import` à 8 Mo de texte écrit dans la requête HTTP.

**Ce qui est livré** (branche `feat/import-universel-27-09`) :

- **Contrat** : `packages/contracts/src/schemas/universal-import.ts` — `UNIVERSAL_IMPORT_CHUNK_ROWS` (500) et `UNIVERSAL_IMPORT_PART_BYTES` (4 Mo) à UN endroit (GA-26) ; registre typé `UNIVERSAL_IMPORT_REGISTRY` (comptes, contacts, besoins, consultants **écrits** ; missions **déclarées**, lignes rejetées nommément `type_not_writable`) ; mapping alias FR+EN ; colonne sans champ d'accueil → `extra` ; validation Zod par ligne. Renversement daté de l'import de besoins (écarté 18/09, réouvert 27/09) dans le docblock.
- **Base** : migration `1796322426733-UniversalImport` — `extra jsonb NOT NULL DEFAULT '{}'` sur `contacts`, `accounts`, `consultants`, `project_needs` ; `universal_import_jobs` (point de reprise `committed_rows`) et `universal_import_issues` (rapport), `workspace_id` NOT NULL, RLS.
- **API** : `apps/api/src/modules/universal-import/` — upload fractionné vers le stockage (`PUT /import/universal/jobs/:id/parts/:index`), file BullMQ `universal-import`, lecture EN FLUX CSV/TSV/XLSX/JSON-NDJSON (`universal-import-parser.ts`), un paquet = une transaction avec son point de reprise, doublons PROPOSÉS jamais fusionnés, rejets nommés, `write_failed` sous SAVEPOINT, progression Socket.IO (`universal-import:progress`), rapport CSV (`@DataExit`). Reprise d'un job `failed` : `POST .../resume`.
- **Web** : `features/universal-import/` — `UniversalImportDialog` remplace `ImportContactsDialog` sur le même bouton de la fiche compte (classification famille/pertinence conservée côté serveur) ; lanceur tous types dans Réglages › Import ; carte « Informations complémentaires importées » sur les fiches contact, compte, besoin et consultant (consultant : seulement en visibilité complète) ; fichier d'exemple fictif (démo).

**Reste (lot suivant)** : l'écrivain `mission` (lier consultant + compte + période sans deviner un homonyme demande une clé de rattachement explicite dans le fichier) ; factures (type à déclarer au registre + écrivain, doctrine c80 : « préparée », jamais « facturée »). GA-303 : 11ᵉ worker documenté (23 slots, pool 10) — arbitrage pool/worker isolé ouvert.

## Reverse Market Orchestrator — matching talent vers comptes (#2968, #2336)

**Raison** : « J'ai ce consultant, où le positionner ? », au-delà des seuls besoins déjà ouverts du workspace — l'inverse du matching habituel (compte → talent).

**Ce qui est livré**, sur plusieurs lots (25 au 27/09/2026), fusionné sur `main` :

- **Écran** : `/consultants/:id/reverse-market` (`ReverseMarketPage.tsx`), entrée depuis la fiche/liste consultant, Laura (`/chat`, deep-link même moteur), et Découvrir (partielle, assumée #2165.17 — lien générique vers `/consultants`, pas de preset).
- **Trois niveaux de compatibilité** qui ne s'absorbent jamais (structurel/mouvement actuel/accès) — `consultants/lib/compatibleEnvironments.ts`.
- **Cinq verdicts nommés** (PRIORITÉ / À QUALIFIER / COMPATIBLE STRUCTURELLEMENT / RÉSERVE / ÉCARTÉ) dérivés des axes existants, plus la synthèse chiffrée réelle à 5 seaux (dont « priorité ») — `reverseMarketVerdictFor`.
- **Masquer / Restaurer** un environnement, persistant par personne, archivé jamais supprimé (verdict ÉCARTÉ = masquage humain, gagne toujours) — migration `ReverseMarketDismissals`.
- **Actions** : « Vérifier aujourd'hui », « Ouvrir le compte » / « Trouver les contacts », « Créer une cible », « Créer une opportunité » (réemploi des portes existantes, aucune n'écrit hors de la porte d'approbation habituelle).
- **Préférences/restrictions du consultant recoupées à l'environnement observé** (#2336.12/.13) : technologie évitée déclarée → avertissement nommé (jamais une exclusion, doctrine §8.3) ; type de contrat voulu → même traitement, et un bug de données corrigé au passage (`wantedSectors`/`wantedContractKinds` remis à `[]` en dur avant d'atteindre le moteur réel). Le trou de SURFACE sur le comparateur (`CompareTable.tsx`, l'avertissement noyé dans une liste anonyme) est corrigé : ligne à part, même ton que la fiche.
- **Explicitement écarté (NO-GO doctrine)** : « Préparer un push profil » — pas d'envoi de CV sans besoin confirmé (#2336, §MESSAGE).

**Reste** — chacun bloqué par une donnée réellement ABSENTE (`MarketMemoryCoverage` ne porte ni secteur, ni type de contrat, ni séniorité — confirmé identique à cinq tris consécutifs, 25 au 28/09), jamais par une décision produit en attente :

- Secteurs refusés/voulus et séniorité, recoupés contre l'environnement du Reverse Market (#2336.12 suite, .5).
- Relations d'équipe et historique (#2336.14, .15) — 2 des 10 sources du registre sont branchées aujourd'hui, les 8 autres (CRM, missions comparables, DataForge, AO, partenaires…) sont des intégrations à part entière (#2336.18-28).
- **Verdict par entreprise NOMMÉE, indépendant d'un besoin ouvert** — le trou structurel du registre #2336 : le moteur répond par département ou par besoin, jamais par compte CRM. Jointure compte↔mémoire marché à construire, plusieurs jours.
- Endpoint FastAPI dédié au scoring : jugé non nécessaire — Laura route déjà vers l'écran web, seule source de vérité.

Registre source : `.claude/notes/registre-2026-09-17-lau-077-2336.md`.

## Briefs commerciaux par compte — démo à six comptes + pipeline payant (01-02/10/2026)

Mail de Théo (01/10) : un brief « Ce que je sais » par compte (rubriques « ce qu'on sait / ce que ça veut dire pour toi »,
KPI, sites, entités sorties marquées, prix par canal, ESN avec niveau de preuve, garde-fous en fin), d'abord sur cinq
classeurs écrits à la main, puis pour tout compte payant. Raison : la donnée interne interprétée est ce qui distingue
Bellum d'un assistant généraliste ; l'incident « Strasbourg siège de BPCE » (fichier brut recopié) ne doit plus se produire.

- Contrat `CommercialBrief` + contrôles `checkCommercialBrief` (`packages/contracts/src/commercial-brief/`) — #3515.
- Salle démo = 6 comptes cibles (SG, BPCE, SNCF, ENGIE, TotalEnergies, Alstom), briefs convertis par
  `convert:commercial-brief`, semés par `commercial-brief-seed.ts`, onglet `TabCommercialBrief.tsx` ouvert à l'arrivée — #3517, #3531.
- Pipeline : étape `commercial-brief.step.ts` après le graphe d'analyse, IA `POST /commercial-brief`, enrichissement web des
  manques, rattrapage ciblé `POST internal/admin/commercial-brief-backfill`, `COMMERCIAL_BRIEF_ENABLED` — #3519.
  Tracker : `agent_docs/briefs-comptes-2026-10-01.md`.

**Observabilité chat — épopée #2879 (#2442.4/.10/.12/.13/.14/.15) — LES SIX SOUS-CHANTIERS SONT COMPLETS (reconfirmé lot EP-2879 cloud, 14/10) : ne pas rouvrir cette épopée sans un fait nouveau, lire CECI plutôt que les ~30 commentaires GitHub.**

- **#2442.14 sécurité (4/4)** — `security_events.kind` (CHECK, `1796419437219-SecurityEventsDataExport.ts`) couvre `authorization_denied`, `leak_detected`, `cross_tenant_suspected`, `injection_suspected`, `permission_escalated`, `data_export` ; les six lisent dans `ObservabilityAlertsService.check()` (`observability-alerts.service.ts`).
- **#2442.15 alertes (11/11)** — les 5 clés manquantes à l'ouverture de l'épopée (`authorization_denied`, `abnormal_refund`, `leak_detected`, `reasoning_false_success`, `reasoning_wrong_zero`) sont toutes définies dans le même service, aux côtés des 6 préexistantes.
- **#2442.13 (4/4)** — `ActionOsAdoptionMetricsService.forWorkspace` (`action-os-adoption-metrics.service.ts`) rend `validated`/`executed`/`disabled`/`firstSuccessAt` ; « désactivation » lue sur `workflow_runs.intents` (`workflow-run.entity.ts:101-102`, `toggleRoutineActionSchema`, `copilot-card.ts:270-281`) via une requête `jsonb_each`.
- **#2442.4 spans (4/4) — LIVRÉ (lot M10, 09/10, `c20f3cc5`)** — le chokepoint n'était pas à trouver, il était à CRÉER : `observeSpan()` (`apps/api/src/common/observability-span.ts`, puits Sentry `startSpan`, no-op sans DSN, liste fermée `auth`/`connector`/`artifact`/`notification`, sa spec exige un appelant par famille). Appelants : `JwtGuard.canActivate` (auth), `ConnectorSpanInterceptor` sur `internal/copilot` (connecteur), `ChatArtifactVersionsService` edit/history/latestFor (artefact — les artefacts existent depuis #2429.9), `NotificationsService.createNotification` (notification). Côté IA, span `connector` dans la trace du tour sur `bellum_api._post/_get`.
- **#2442.10 contestation agrégée — LIVRÉ (lot W9 cloud, 11/10, `f38b1391`)** — ⚠️ renversement depuis le dernier bilan R16 (07/10) : Louis a autorisé la 3e exception nommée à c64 le 11/10/2026 (`doctrine.md` § c64, point (c)), levant le blocage doctrinal. `ReplyContestationsService` + `GET /internal/analytics/reply-contestations` (`InternalSecretGuard`), comptes PAR FONCTION (`action_kind`), jamais par personne ni espace, plancher `MIN_DISTINCT_SESSIONS_FOR_A_METRIC`. Garde **GA-412** (`apps/api/src/architecture/reply-contestations-never-by-person.spec.ts`) refuse tout regroupement sur `user_id`/`workspace_id`/`account_id`/`message_id`. Écran back-office : carte « Réponses contestées, par fonction » (Produit › Raisonnement). La relecture juridique de c64, un temps donnée comme bloquante, ne l'est plus : Louis a tranché le 11/10/2026 (épopée #4016, lot L14) que la relecture juridique n'est plus un préalable à l'allumage (`doctrine.md` § c64, note du 11/10) — dette assumée, pas condition.
- **#2442.12 coût par outil — LIVRÉ (lot M10, 09/10, `7acb1684`, écran lot E1 vague 3, `bae0ecd0`)** — deux chokepoints existaient SOUS `chat_tools.py` : `_execute_one_tool` (entrée, pose `cost_ledger.bind_tool`) et `cost_ledger.record` (sortie, lit l'outil). Colonne `provider_costs.tool` + `provider_costs_tool_check` (migration `1796437901203`). ⚠️ Découverte : l'en-tête `x-bellum-costs` d'un flux SSE part au premier octet, donc VIDE pour le chat — le registre du tour voyage désormais dans `done.data.turn_costs`, retiré par l'API avant le navigateur. Lecture : `ProviderCostService.overview().byTool`, affiché par l'écran back-office `apps/dashboard-manager/src/app/couts/page.tsx` (table « Outil », aux côtés de `byOperation`) — le trou « aucun écran ne l'affiche encore » noté jusqu'au bilan du 12/10 est comblé.

**Rien de codable ne reste sur cette épopée** — pas de donnée absente, pas de décision produit en attente. Recette uniquement : Sentry/Langfuse pour les spans (#2442.4), back-office `GET /internal/analytics/costs` et `/produit/raisonnement` pour #2442.12/.10. Fermable par Louis dès la recette prouvée.

## Signaux diversifiés et recrutements récents — lot P07 (09/10/2026, #3970)

Louis (09/10) : « c'est un peu toujours la même chose, faut de tout » — à l'étalonnage de #3923, les 30 signaux étaient du même type. Le vocabulaire existait déjà (`signalKindSchema`, 18 natures) : le trou était que les collecteurs datés n'atteignaient `recent_signals` que si le modèle les CITAIT.

- **Collecteurs → signaux typés** (`merge_collector_signals`, `apps/ia/app/services/dated_signals.py`, appelé par `phase1_research.py` après presse et événements officiels) : offres d'emploi → `recrutement`, annonces légales → `acquisition`/`restructuration`/`investissement`/`organisation` (dépôt de comptes, radiation, genre inconnu : AUCUN signal), appels d'offres → `appel_offres`, marchés attribués → `marche_public`. Jamais sans date, lien seulement s'il est http(s), offre d'intermédiaire écartée, plafond `COLLECTOR_SIGNALS_PER_KIND = 3` par nature, source = la capacité (« Offre d'emploi publiée »…), jamais le fournisseur. Rattrapage : entrée `#3970` de `SEGMENT_CAPABILITY_HISTORY.signals`.
- **Recrutements récents** (`recentHires`, `packages/contracts/src/schemas/recent-hires.ts`) : lus sur `contacts.apollo_enrichment.employment_history` DÉJÀ persisté — poste COURANT chez le compte (`normalizeCompanyNameKey`), `start_date` ≤ 183 jours ; date inconnue = aucune ligne. Pertinence en raisons NOMMÉES contre `decision_maker_personas` puis `placed_roles` (mêmes trois verdicts que `signalRelevance`, jamais un score). `examinedContacts: 0` = « non mesuré ».
- **Appelants** : `GET /accounts/:id/recent-hires` (GA-333 classée), section `WatchRecentHiresPanel` de la veille, et `recentHires` dans le pont `accounts/signals` → `get_account_signals` de Laura (aucun outil neuf).
- **Démo** : cinq personnes SIMULÉES (SG, SNCF) avec `recentHireDaysAgo`, datées au seed (`resolveDemoEmployment`) ; `DEMO_RECENT_HIRES_COVERAGE`, `DEMO_SEED_REVISION = 5`.

**Ce qu'on ne promet pas** : « offres pourvues » comme source de recrutement (aucun collecteur ne sait qu'une offre est pourvue), les mouvements `contact_job_change` comme recrutement du NOUVEL employeur (la routine ouvre une porte, elle ne date pas l'arrivée), et une collecte neuve de personnes (le parcours ne vient que des contacts déjà enrichis).

## Signaux classés par domaine d'offre à l'analyse — lot RBE (11/10/2026, épopée #3978, débloque #3678)

Cause (R21/N07/H04, vérifiée trois fois) : `primary_domain_code` n'était écrit par AUCUNE des cinq projections de `ProjectsService.materialize()`, donc `leadImpact` rendait toujours « inconnu » sur un compte réel et « Ce que ça change » / « Touche ton expertise » / « Hors de ton offre connue » ne sortaient qu'en démo (où la seed pose le code à la main). Les sorties IA ne portaient que du texte libre : rapprocher ce texte d'un code APRÈS coup aurait été deviner. La seule source honnête est le modèle, à l'analyse.

- **Sortie IA** : `domain_code` (entrée `domainCode` ou `domain_code`) sur `RecentSignal`, `Pain` et `ItChallenge` (`apps/ia/app/models/outputs/research.py`), validé par `normalize_signal_domain` (`apps/ia/app/services/offer_domains/signal_domain.py`) : vocabulaire FERMÉ = les codes de PACK (`OFFER_DOMAINS`, ce que l'écran compare à `ownDomainCodes`), `generic` exclu (fourre-tout) ; hors liste → `""`. Consigne dans `bellum_signals.py` (recentSignals) et `bellum_strategy.py` (pains, itChallenges) : « chaîne VIDE si les sources ne permettent pas de le dire ».
- **Contrat** : `SIGNAL_DOMAIN_CODES` (`packages/contracts/src/schemas/signal-domain.ts`) + `domain_code` optionnel sur les trois schémas (un schéma qui l'ignore le jetterait en silence).
- **Matérialisation** : `materialize()` écrit `primary_domain_code` sur les voies pain / challenge / signal (`classifiedDomainSql`, borné par `= ANY($2)`), puis une passe `domainFillSql` remplit les lignes DÉJÀ matérialisées — uniquement `WHERE primary_domain_code IS NULL` : un domaine posé (correction humaine ou analyse précédente) gagne. Programme et implication restent SANS domaine (le modèle ne les classe pas). Aucune migration : la colonne existe depuis `1790020847361-ProjectDomainContext`.
- **Rattrapage** (doctrine « un correctif de collecte RATTRAPE l'existant ») : capacité `#3978` inscrite au segment `signals` de `SEGMENT_CAPABILITY_HISTORY` — le compte analysé avant est CONCERNÉ, son écran DIT que sa collecte est antérieure, et le rejeu CIBLÉ existant (`POST internal/admin/segment-catchup/signals/preview` puis `.../signals`, geste d'opérateur) le rattrape. **Il ne part pas au déploiement et n'a PAS été lancé.**
- **Démo** : le dossier SNCF porte `domain_code` sur ses signaux/enjeux (`demo-signal-domain-coverage.spec.ts`), dont un signal volontairement non classé.
- **Rattrapage des pains/enjeux** (suite, branche `feat/3978-rattrapage-strategie`) : pains et enjeux sont produits par la **phase 1** (`bellum_strategy` tourne dans `phase1_research`), persistés par `applyResearch` (`raw_analysis.pains`, `it_challenges`) qui date `signals_collected_at` — jamais par le plan (`savePlan` → `strategy_collected_at`). Leur segment de collecte EST donc `signals` : la capacité `#3978` y nomme désormais pains/enjeux, et la garde `segment-catchup.test.ts` refuse toute entrée `#3978` sous `strategy` (elle allumerait le bandeau de l'onglet Plan et pousserait un `replan` payant qui ne rapporte aucun domaine). Le vrai trou était ailleurs : `refreshResearch` (rattrapage `signals`, « Actualiser », veille quotidienne) ne repassait jamais sur les pistes — le domaine reclassé restait dans `raw_analysis`. `AnalysisOnDemandService.runResearch` appelle maintenant `AnalysisPersistenceService.refreshOpportunityDomains` → `ProjectsService.fillClassifiedDomains` (extrait de `materialize`, même SQL) : remplissage `WHERE primary_domain_code IS NULL` uniquement, aucune piste créée, best-effort. L'écran le DIT déjà : pistes et veille partagent l'écran « Signaux et besoins », sous le bandeau `SegmentStaleCollectionNotice dimension="signals"`. Aucune migration, aucune clé `raw_analysis` neuve → aucune entrée `demo-coverage` (la démo ne rejoue jamais la recherche). **Rien lancé.**

**Ce qu'on ne promet pas** : un domaine pour les _programmes_ publics (`programNames` est une liste de chaînes) ni pour l'_implication ESN_ ; un domaine sur une piste dont le rejeu a RÉÉCRIT le libellé (le rapprochement se fait par `md5(label)` — la piste reste sans domaine, la nouvelle formulation n'apparaît qu'à la prochaine analyse complète) ; un domaine « deviné » pour un signal que le modèle laisse vide.

## Siège / implantation / équipe — la base d'une géographie est dite (#3983, #3705.3, lot RBG 11/10/2026)

**Le besoin.** Une recherche « à Lyon » ne dit pas la même chose selon que l'entreprise y a son SIÈGE ou seulement un
établissement. Le registre public matche déjà par établissement ; l'écran, lui, ne le disait pas.

**Source (PROPRE, sans clé).** L'API publique « Recherche d'entreprises » (INSEE) : `siege` + `matching_etablissements`
(`siret`, `est_siege`, `etat_administratif`, `libelle_commune`, `code_postal`, `region`) quand une zone
département/région est demandée. Contrat mesuré le 18/09/2026 (fixture ARQUUS, `tests/fixtures/discover_establishment/`).
⚠️ La documentation officielle n'a PAS pu être relue pendant ce lot (le conteneur n'atteint pas `gouv.fr`) : rien n'est
supposé au-delà de ce que cette fixture et `recherche_entreprises.py` ont déjà mesuré. La liste des établissements d'une
zone est « telle que le registre la rend » : son plafond n'est pas vérifié, donc « 3 établissements » = 3 recensés.

**Ce qui est livré.**

- `apps/ia/app/services/site_geography.py` — bloc `geography` (`basis` siège/implantation, `siteCount`, `sites`
  actifs hors siège, dédoublonnés par SIRET) + la phrase « siège à Paris (75), 3 établissements en
  Auvergne-Rhône-Alpes ». Absent sans zone, et quand la source ne prouve rien (jamais « 0 »).
- Filtre « siège dans la zone » : `siteBasis: 'headquarters'` (écran) → `on_headquarters_only` (déjà le critère
  Pappers — un seul réglage, GA-26) ; le registre gratuit le tient désormais lui-même sur une zone
  (`covers_filters`), sans zone il reste chez Pappers. « Implantation » = le défaut du registre, chemin byte-identique.
- Écran : « Base de la zone » au rail de Découvrir, ligne « Siège à … · N établissements dans la zone » sur la carte,
  URL (`siteBasis`). Mode Signaux : dit non appliqué (garde GA-275).
- Laura : `run_account_search` reçoit `site_basis`, chaque item porte `location`.
- Démo : Naval Group (siège 75, Indret 44, Lorient 56) — `DEMO_DISCOVER_SITE_GEOGRAPHY_COVERAGE`.

**Ce qu'on ne promet pas — « équipe ».** L'effectif LOCAL d'un établissement n'est PAS dans la source (elle ne
publie que la tranche d'effectif de l'ENTREPRISE). Aucun champ, aucun libellé, aucune estimation : Laura le nomme dans
`not_evaluated`, le rail le dit dans son aide.

**Reste.** Collecte à la demande des établissements d'un compte hors recherche (fiche compte), avec cache et débit
borné : non faite, la zone demandée est la seule porte d'entrée aujourd'hui. Région/commune côté démo : seul le
département est scripté.

## Portée entité du groupe d'une note (#3895, 11/10)

Décision Louis 11/10 : une note achats qui vaut pour une autre entité du même groupe (Sanofi → Sanofi Pasteur) doit
pouvoir y être rattachée. `notes.also_applies_to_account_ids uuid[]` (migration `1796438144871`, vide par défaut,
borne 20 par contrainte nommée) ; rattachement EXPLICITE par l'auteur, jamais inféré. « Même groupe » = même
`group_head_siren` (ou l'un tête de l'autre) dans le MÊME espace, vérifié par `NotesService` avant d'écrire.
Lecture : la fiche d'une entité liste aussi les notes qui disent valoir ici (`inheritedFrom` nomme l'origine) ; la
couche zéro les cite avec « note de X (même groupe) ». Écran : cases « Cette note vaut aussi pour » du composeur.
Démo : la note achats de Société Générale vaut pour BoursoBank (`DEMO_NOTE_GROUP_SCOPE_COVERAGE`).

**Laura (lot LAURA-B, 12/10).** L'outil de chat `get_account_notes` relit les notes d'un compte avec leur origine
(`inheritedFrom`) et leur portée (`alsoAppliesTo`) : pont `POST internal/copilot/account/notes` (`NotesService.list`, 20
notes, 800 caractères, `truncated`), compte hors espace = introuvable. Il interdit à Laura de généraliser une note à
un autre compte ou au groupe, et de lire une durée notée comme une garantie. Démo : vide à dessein depuis le retrait de BoursoBank (Louis 12/10/2026) — `DEMO_NOTE_GROUP_SCOPE_COVERAGE`.

**Reste.** Pas d'édition de la portée depuis l'écran (l'API `PATCH /notes/:id` l'accepte).

## Laura — approche demandée, périmètre d'un contact, export daté (lot LAURA-B, 12/10, #3869 #3866 #3895)

- **#3869.3** : `approach_preparation_turn_block` (`apps/ia/app/prompts/commercial_method_turn.py`) se déclenche sur
  le COMPORTEMENT (un verbe de préparation à côté d'un objet d'approche), plus sur une liste de libellés ; quand la
  préparation est bloquée, Laura nomme le blocage et livre quand même le brouillon, jamais « au prochain tour ».
- **#3869.2 / #3869.4** : `get_account_contacts` relaie `entity`, `place` et `employment_verified_on` quand ils
  existent (aucune clé sinon) ; garde-fous « PÉRIMÈTRE DU TITRE » et « IDENTITÉ INCOMPLÈTE » (prénom seul).
- **#3866** : l'offre visée reste un critère échoé (`criteria.offer`) et un axe « Offre visée » de la carte.
- **#3895.5** : l'export d'un fil dit « Fil complet : N messages » ou « Extrait : les N derniers » et la version du
  produit (SHA court du déploiement, jamais devinée).

## Garde démo sur vraie base — la salle ne part plus cassée en prod (lot W13, 11/10/2026, #4035)

**Pourquoi.** Le 11/10 le semis écrivait `opportunities.stage = 'abandoned'`, refusé par `opportunities_stage_check` :
~8 h de « Préparation de ta démo… » pour tout prospect. Les specs du semis MOCKENT la base — aucune contrainte SQL n'y
est appliquée, CI verte. Même famille le 28/09 (`duplicate key` au re-semis, salle servie « AS IS »).

**Livré.**

- **Job CI bloquant « Démo (semis sur vraie base) »** (`ci.yml`, `test-demo-db`, dans `needs:` ET dans la liste de
  `ci-status`). Postgres 16 + pgvector installés par apt sur le runner (grappe à part, port 5441 — les runners
  auto-hébergés sont des conteneurs SANS socket Docker, donc pas de `services:`), `tools/ci/demo-db-bootstrap.sql`
  (le minimum de Supabase que supposent les migrations), `apps/api/scripts/migrate-fresh-ci.ts` (TOUTES les migrations
  sur base vierge), puis `demo-seed-real-db.db.spec.ts` : `DemoResetService.seedNewRoom` (salle neuve) puis
  `resetWorkspace` (purge + semis, le chemin du pool) sur la même salle. Déclenché par le filtre `changes` (sortie
  `demo`) quand `apps/api/src/{modules/demo,migrations,database/entities}/**` ou `packages/contracts/**` bougent.
  `DEMO_DB_REQUIRED=1` : le test REFUSE de se sauter. **Prouvé qu'il dit NON** : `'abandoned'` réintroduit → rouge sur
  `opportunities_stage_check`.
- **Sonde post-déploiement** (`demo-smoke.yml` + `scripts/probe-demo-session.mjs`) : `POST /demo/session`, salle prête
  en ≤ 60 s, à chaque push sur `main` (après 7 min) et toutes les heures ; 429 = avertissement, une seule session.
- **Alerte opérateur** : `DemoPoolService` envoie « re-semis en échec » et « pool épuisé » par l'alerte existante
  (`salle_demo_indisponible`, Slack si webhook, sinon e-mail), résolue quand la salle revient. Aucun nouveau canal.

**Ce qu'on ne fait pas.** La démo n'est PAS couplée au healthcheck Railway de l'API (un défaut de démo bloquerait le
déploiement d'un correctif prod) : la porte est la CI + la sonde.

**Découvert en route.** Six migrations ont un nom à 14 chiffres (`20260927181000-…`) que TypeORM trie en tout premier
(il lit les 13 derniers caractères) : `migration:run` échoue sur une base VIERGE (`consultants` n'existe pas encore).
La prod ne l'a jamais vu. On ne les renomme pas (la prod les a enregistrées) ; `migrate-fresh-ci.ts` trie sur
l'horodatage complet.

## Envoi groupé relu personne par personne (#4042, 12/10/2026)

**Livré.** « Envoyer le mail rédigé » (/contacts) ouvre `BulkEmailReviewDialog` : une personne à la fois (k / N),
destinataire en clair, objet et corps éditables, état prêt / modifié / à revoir / exclu (`lib/bulkEmailReview.ts`,
pur). Pièces jointes à un mail ou à tous (bibliothèque d'assets outreach, limite unique `refuseEmailAttachments`).
« Générer les mails » réutilise `POST /ia/message`. L'envoi est l'envoi INDIVIDUEL (`POST /contacts/:id/send-email`,
canal `mailbox`), au clic seulement, jamais sans messagerie connectée ni en démo. Remplace l'ancien envoi en bloc
(`BulkSendEmailDialog`, `useSendContactsBulkEmail`) ; l'endpoint serveur `send-email/bulk` reste.

**Reste.** Pas de dépôt des mails générés avant l'envoi (ils partent avec l'envoi, qui les persiste) ; pas d'envoi par
l'espace (Resend) depuis la revue — messagerie connectée exigée.

## L'analyse de compte lit l'historique du compte (#4070, 12/10/2026)

**Livré.** Le pipeline d'analyse (`apps/ia`) reçoit les faits du compte du socle (#4069, `AccountFactsService` — le
lecteur UNIQUE) au lancement : `AnalysisService.resolveFactsInputs` → job BullMQ → `IaClient.analyzeGraph` →
`/graph/analyze` → état du graphe. Quatre clés, toutes omises quand vides (run byte-identique) : `account_facts`
(`kind · label · date · age_days`, jamais de poids ni de provenance), `known_contacts`, `previous_analysis`,
`lost_deal_rex`. Côté IA tout vit dans `app/services/analysis_account_facts.py` (blocs de prompt par phase).

- **.1** recherche : historique complet décoté, « pourquoi maintenant » (un besoin qui revient = signal fort).
- **.2** plan + messages : affaires gagnées/perdues/sommeil, missions, motifs de perte déclarés, repères du secteur
  (référentiel sectoriel, sans clé = no-op) ; `has_positive_rex` lit les faits (`phase4_plan.py`).
- **.3** classification : interlocuteurs connus (CRM, missions passées) départagent, ne filtrent jamais.
- **.4** ré-analyse : l'analyse précédente en trace datée, corrections humaines nommées — la correction gagne.
- **.5** juge (`graph/judge.py`) : `stale_fact_as_recent` et `source_named`, critiques, déterministes.

**Budget de contexte.** 40 faits à l'arrivée ; un bloc ≤ 8 000 caractères (≈ 2 000 tokens), 25 lignes en recherche,
12 en messages ; le reste se DIT. « Neutre » (aucune couche) : rien n'est lu. **Ce qu'on ne fait pas.** Aucun corps
de message, aucune probabilité, aucune source nommée.

## Parité démo — les cinq blocs du dossier complet produits par une vraie analyse (#4078, lot PARITE-DEMO 12/10/2026)

**Pourquoi** : `structural_reading_axes` (01), `ecosystem_third_parties` (14), `opportunity_domains` (15),
`financial_indicators` (16) et `data_reliability_notes` (17) n'étaient écrits que par `sg-csv-complement.ts`
(CSV SG/BPCE) : un compte analysé pour de vrai n'avait pas la panoplie de la démo.

- **Producteurs** : `apps/api/src/modules/analysis/dossier-blocks.ts` — 16 et 17 CALCULÉS sans modèle
  (ratios depuis `financials_history` ; comptes anciens/non publiés, entité retenue sans confirmation,
  signaux incomplets ou anciens) ; 01/14/15 par UN appel IA groupé `POST /dossier-blocks`
  (`apps/ia/app/routers/dossier_blocks.py`, prompt `bellum_dossier_blocks`, modèle du brief voisin), filtré
  par `sanitizeSynthesisNotes` (forme `keyNoteSchema`, chiffres à `null`, note qui nomme un fournisseur jetée).
- **APPELANT** : `AnalysisWorker.produceDossierBlocksThenBrief` (après `analysis:done`, AVANT le brief qui les
  relit) → `DossierBlocksStep.produceDossierBlocks`. Seules les clés ABSENTES s'écrivent (garde dans l'UPDATE).
- **Rattrapage** : `apps/api/scripts/parite-blocs-catch-up.ts` (simulation par défaut, `--appliquer` pour écrire),
  ciblé (depuis le 14/10) sur la date du segment `dossier_blocks_collected_at` contre la capacité.
- **Ce qu'on ne promet pas** : une nouvelle analyse ne RAFRAÎCHIT pas un bloc déjà posé (clé présente = gardée).
- **Collecte antérieure dite (14/10/2026)** : septième segment de rattrapage `dossier_blocks`
  (`accounts.dossier_blocks_collected_at`, migration `1796530330276`, daté par `DossierBlocksStep`) ; la Synthèse
  le dit tant que le compte n'est pas rejoué ; le script de rattrapage cible cette date (plus `DOSSIER_BLOCKS_SINCE`).

## Lot LAURA-EVAL-OBS (12/10 soir) — relecture des échantillons de prod (#2899 / #2443.10)

`GET /internal/chat-eval-samples` (`InternalChatEvalSamplesController`, secret interne seul) rend le texte anonymisé et la
date des tours versés par les espaces qui ont coché — jamais l'espace, l'identifiant ni une personne. Côté IA,
`app/eval/chat_prod_samples.py` les relit (sans pont : « non mesuré », jamais 0) et les repasse à une seconde lecture sans
modèle (e-mail, téléphone, lien, SIREN, IBAN). Appelant : `python -m tests.chat_dashboard_report --with-prod-samples`.

**Reste.** L'anonymiseur reste heuristique (relecture juridique c93 due) ; aucun rejeu de ces demandes contre le modèle
(payant, hors CI) ; #2278.12/.17/.37/.40 (annotation par tour, pont corrections → golden) non traités.

## #4114 — Doublons de PERSONNES d'un compte (13/10/2026)

`apps/api/src/modules/contacts/contact-duplicate-proposals.ts` (pur) + `GET /contacts/account/:accountId/duplicate-proposals`
(lecture d'espace, aucune écriture). Appariement probabiliste léger façon Fellegi-Sunter : poids par comparaison (e-mail,
LinkedIn, téléphone E.164, nom/prénom Jaro-Winkler, initiales « JF » ↔ « Jean-François », poste), somme comparée à
`PROPOSAL_THRESHOLD`, **blocage par compte** (deux homonymes de deux comptes ne sont jamais comparés). Chaque paire porte
ses raisons lisibles ; on PROPOSE, on ne fusionne jamais ; coordonnées en clair. Sans `splink` : la comparaison est
quadratique par compte (quelques centaines de fiches au plus). Un nom seulement approché ne se propose jamais seul.
**Pas de mécanisme de refus de paire de contacts** : le paramètre `rejectedPairs` existe, aucune table ne l'alimente
encore (reste à faire, avec son écran). Démo : seedée par les variantes d'orthographe déjà présentes (`demo-coverage.ts`).
**LOIC-FIX2 O.5 (20/10/2026)** : l'ordre prénom/nom et la casse ne font plus deux personnes (« Cottet Alain » / « Alain COTTET » → raison « même nom »), et l'onglet Contacts d'un compte PROPOSE les paires (`ContactsDuplicateNotice`) — deux boutons d'ouverture de fiche, aucun geste de fusion.

## MCP — signaux → opportunités de missions (14/10/2026)

Un assistant branché sur Bellum (jeton OAuth MCP) peut demander « quelles entreprises montrent des signaux d'achat ».
Quatre routes sous `McpApiController` (`ApiAuthGuard` jwt|mcp-oauth, feature `mcp_assistant`) et leur outil miroir
(`apps/mcp/src/tools.ts`) :

| Route                               | Outil                | Scope     |
| ----------------------------------- | -------------------- | --------- |
| `GET /mcp/signals`                  | `find_opportunities` | lecture   |
| `GET /mcp/market/:companyKeyOrName` | `get_market_signals` | lecture   |
| `GET /mcp/actions/due`              | `list_due_actions`   | lecture   |
| `POST /mcp/plan-items/:id`          | `update_plan_item`   | `mcp:act` |

- **Classement** : `mcp-opportunities.ts` (pur) + `McpSignalsService` (lecture seule : portefeuille cloisonné via
  `findAccountsByWorkspace` + `MarketMemoryService.searchByFilters`). Un item = `company_name`, `account_id`, `score` 0-100,
  `signals[]`, `why`, `next_step`. Une entreprise sans signal ne fait aucune ligne.
- **Rattachement** compte ↔ marché : par la route résolue de la mémoire marché (domaine / décision humaine), jamais par le nom,
  jamais d'écriture dans `accounts`.
- **Doctrine tenue** : le marché compte en PRÉSENCE (GA-257 : `externalization_score` brut n'est PAS lu — non calibré,
  `MARKET_MEMORY_SCORING_ENABLED = false` ; le nombre de parcours ne pèse pas dans le score) ; aucune identité de personne,
  aucune date/version de corpus, aucun nom d'ESN observée ne sort ; lecture marché en panne = `market_memory: indisponible`
  (≠ aucune entreprise) ; valeur absente = `null`.
- **Actions dues** : `ActionPlanItemsService.listOpenForUser(..., dueUpToToday)` (même portée que « Mes relances », échéance ≤ aujourd'hui).
- **Écriture** : `itemInWorkspace` vérifie l'espace AVANT `update` (qui ne borne que par personne). Passer à « fait » exige
  l'`outcome` (règle #2396.2) ; « fait » reste déclaratif, jamais une preuve d'envoi.
- **Ce qu'on ne promet pas** : les angles d'attaque ne sont pas lus (la liste de comptes ne les porte pas — signal principal,
  fraîcheur, étape du plan, score de priorité le sont) ; `skills` n'a de sens que sur la pile observée du marché (un compte
  sans lecture marché est écarté quand `skills` est donné, faute de pouvoir le vérifier) ; `get_market_signals` rapproche par
  le nom saisi (pas de clé brute) ; portefeuille lu sur 100 comptes au plus.
- Démo (règle n°9) : surface assistant, aucun écran ni table neufs — rien à seeder.

## MCP Bellum — deux bugs de production (14/10/2026)

**1. `POST /mcp/accounts/:id/ask` répondait 500 pour tout compte** (« Unexpected token 'd', "data: {"ty"... is not valid JSON »).
Cause : le service IA rend `/chat/message` en SSE (LOT STREAM, 12/09) mais `IaClient.chat()` lisait encore le corps en JSON.
Correctif dans `apps/api/src/modules/ia/ia.client.ts` : `chat()` consomme `chatStream()` (même parseur, même budget
`CHAT_CALLER_BUDGET_MS`, une seule tentative) et rend l'enveloppe du dernier `done` ; flux coupé sans `done` ⇒
`{ success: false, data: {} }` (le contrôleur MCP répond alors 502, jamais une réponse reconstituée depuis les deltas).
Contrat MCP inchangé : `{ account_id, question, reply }`. Seul appelant de `ia.chat(` : `mcp-api.controller.ts` (`askAccount`) ;
l'écran `/chat` passe déjà par `chatStream()`. Gardes : `ia.client.spec.ts` (« chat — consomme le flux SSE »),
`chat-turn-budget.spec.ts` (budget porté par `AbortSignal.timeout`).

**2. La connexion OAuth MCP bouclait.** `API_PUBLIC_URL` de prod = l'hôte Railway ⇒ `issuer` / `authorization_endpoint` y
pointent ; `oauth/authorize` y renvoie vers `<front>/login?returnTo=<railway>/oauth/authorize…`, mais le cookie de session
n'existe que sur l'hôte public de l'API. Le hook `useRedirectAfterAuth` n'honorait que l'origine `VITE_API_URL` : un
utilisateur déjà connecté tombait sur /chat. Correctif front : `features/auth/lib/oauth-return-to.ts` — liste blanche
(origine de l'API, ou `issuer` annoncé par `/.well-known/oauth-authorization-server`), chemin `/oauth/authorize` seulement,
et navigation TOUJOURS rebasée sur l'origine de l'API (là où vit le cookie). Toute autre origine est ignorée (pas de
redirection ouverte). **Reste (infra, non touché)** : aligner `API_PUBLIC_URL` sur l'hôte public — voir le rapport de la branche.

## #4164 — Actions devient « Aujourd'hui » : une file unique où l'on agit (lot L-A, 14/10/2026, épopée #4163)

L'onglet `/actions` n'est plus un centre d'états mais une **file de gestes** : `apps/web/src/features/today/`.
`todayQueue.ts` (pur) FOND neuf maisons natives sans rien déplacer — approbations Action OS, écritures CRM et ERP, envois de
playbook, messages d'approche à relire, relances du plan, **prochaine étape** de chaque séquence active, tâches d'appel,
tâches — en sections par échéance (En retard · Aujourd'hui · Cette semaine · Plus tard, repliée) puis en groupes par geste
(À valider · E-mails · LinkedIn · Appels · Tâches). Une section ou un groupe vide **n'existe pas** (jamais de « 0 »).
Une validation sans échéance est « aujourd'hui » ; une relance sans échéance est « plus tard » ; l'échéance n'est jamais inventée.

- **Gestes** (`useTodayGestures.ts`) : les mêmes mutations que les écrans d'origine (mêmes gardes serveur, mêmes clés
  d'invalidation). Reporter : plan → `PATCH due_date` ; étape de séquence / message → `PATCH` de l'étape (`due_at`) ;
  approbation, écriture CRM/ERP, envoi → leur `snooze` existant ; tâche → `dueOn` ; **appel → `POST /outreach/call-tasks/:id/postpone`
  (neuf, appartenance espace + porteur, refuse un appel clos)**. Un message sans étape de séquence n'a pas d'échéance : pas de « Reporter ».
- **Rafale** (`burst.ts`, `BurstPanel.tsx`) : paquet figé, `j k e ↵ s x Échap ?`. **c82 tenue** : Entrée ne valide un message ou
  un envoi de playbook que sous **mandat vivant** ; sinon elle copie le brouillon et ouvre la messagerie (`copyOpen.ts`).
  « Fait » reste déclaratif (c73) ; une relance du plan exige toujours l'issue choisie (jamais devinée).
- **Tiroir « Historique »** : le journal (`ActionHistoryJournal`) + les vues d'exécution de `ActionCenter` (mode `historyTab` :
  en cours, terminées, à reprendre, planifiées, automatisations, reportées). `ActionCenter` garde ses branches « À valider » /
  « Mes relances » (testées) mais **plus aucun écran ne les monte** : à retirer au lot D.
- **Liens existants** : `?tab=mine&overdue=true` → section « En retard » ; `?risk=`/`?agent=` → menu de filtres ; `?tab=running|done|failed|scheduled|workflows`
  et les filtres du journal → tiroir ouvert sur la bonne vue (`ActionHistoryPage`). `?source=` (déclencheur de workflow) n'a plus d'équivalent.
- **Démo (craft n°9)** : `demo-today-queue-coverage.spec.ts` — les cinq gestes et les quatre sections, du retard d'e-mail et d'appel.
  Ajouts : deux relances du plan avec canal (e-mail J-1, LinkedIn J0) et deux appels datés (`scheduledInDays`).
- **Reste / non repris** : le **rejet en lot** des écritures CRM (cases à cocher) ; « Confier » des envois de playbook (D58,
  jamais confié) ; les groupes d'écritures CRM par lot (`batchId`) ne sont pas regroupés sur une carte ; « Parcours » reste un onglet
  (lot D) ; la source « Laura » = tout ce qu'un humain a déclenché ou demandé, « automatisation » = routines, signaux, playbooks.

## #4167 — Lot L-D2 : reliquats de « À traiter » (14/10/2026, épopée #4163) — PARTIEL

**Livré** : les écritures CRM d'un même `batchId` tiennent sur UNE carte « N écritures vers ton CRM » dans la file
« À traiter » (`todayQueue.ts` `groupBatches`, pur ; `TodayBatchCard.tsx`). Le détail se déplie : chaque écriture y garde sa
carte, sa prévisualisation figée et ses gestes. **« Rejeter le lot »** (`useTodayGestures.rejectBatch`) passe par
`POST /crm/write-requests/bulk-reject` — endpoint EXISTANT (permission `data:export` déjà déclarée), issue par écriture, un échec
partiel se dit. Un lot d'un seul élément reste une carte seule (jamais un lot deviné). **Pas d'« Approuver le lot »** :
une écriture CRM reste derrière sa porte, décidée écriture par écriture (doctrine : jamais d'écriture en bloc).

**NON livré, et pourquoi** :

- _Parcours déplacé dans Pilotage › Pipe_ : la « page Pipe » de la refonte Pilotage L0 **n'existe sur aucune branche** (main ne
  porte que `/pilotage`, `/pilotage/finance`, `/team`; `CrmPipelinePanel` est un panneau de `/pilotage`). La destination est à
  nommer avant de déplacer `ChainsPage` ; l'onglet et la route `/actions/chaines` sont inchangés. Attention : `/pilotage` est
  `managerOnly`, alors que Parcours est aujourd'hui ouvert à tous les rôles.
- _Démo d'un lot d'écritures CRM_ : impossible sans mentir — la lecture répond `not_connected` sans CRM branché
  (voir la note ajoutée à `outbound_write_requests` dans `demo-coverage.ts`).

## #4165 — Séquences multicanal, lot L-B (14/10/2026, épopée #4163)

Socle des lots C (modèles) et D (automatisations). **Le contrat** : `packages/contracts/src/schemas/outreach-multichannel.ts`
(pur : jours ouvrés, porte LinkedIn, exclusions, décalage de pause, stats par étape, variables à repli) + les trois natures
d'étape `linkedin_invite` / `linkedin_message` / `call` (déclarées **internes** : LinkedIn et l'appel restent des gestes
manuels, rien ne part seul). **Migration** `1796489437261` : CHECK de `kind` élargi AVANT le code, `delay_unit`
(défaut SQL `calendar_days` : l'existant ne change pas en silence ; toute séquence NEUVE est `business_days`),
`vacation_paused_at` / `vacation_until`.

- **APPELANTS** : `OutreachCadenceService` (`outreach-cadence.service.ts`, aucun import de service voisin — GA-07) piloté par
  `OutreachController` : `PATCH :id/steps/:stepId/outcome` (invitation acceptée / en attente ; appel joint / messagerie /
  pas de réponse, **déclarés** à la main), `POST :id/meeting-booked` (cause `meeting_booked`, depuis la séquence ou une étape),
  `POST vacation` + `vacation/resume`, `POST :id/steps/reorder` (mêmes créneaux, nouvel ordre), `POST eligibility`.
  Balayages temporels à chaque `GET /outreach/sequences` (`sweep`) : reprise des pauses vacances échues, saut du message
  LinkedIn dont l'invitation n'est pas acceptée à l'échéance (transition `linkedin_invite_not_accepted` journalisée).
- **Séquence linéaire** : pas de branche oui/non. **Exclusions** (`OutreachService.create`, re-vérifiées côté serveur) : séquence
  active (refus existant, `force_justification`), contacté < 30 jours (journal canonique `sent`), RGPD (**jamais** forçable),
  compte déjà client — lu seulement quand l'état de relation cite une preuve, sinon inconnu et non deviné.
- **Web** : gestes par canal (`StepChannelGestures`), bandeau de pause vacances, exclusions nommées contact par contact,
  stats par étape (« — » = non mesuré, jamais 0), éditeur (canal, délai « J+3 ouvrés », variables `{{nom|repli}}` avec alerte
  de variable vide avant de valider, réordonnancement glisser **et** clavier).
- **Démo** : campagne « Multicanal — octobre » (invitation non acceptée + message sauté, RDV pris, pause vacances) ;
  `demo-multichannel-sequences.spec.ts` confronte chaque valeur semée au CHECK de la migration.
- **Ce qu'on ne promet pas** : aucun pilotage de LinkedIn ni d'appel ; « marquer envoyé » est une déclaration, pas une preuve
  d'envoi ; « RDV pris » termine la séquence sans écrire le statut du contact (l'agenda branché passe déjà par
  `ContactsService.updateStatus`) ; la reprise décale de la durée de la pause (une étape déjà en retard repart à la reprise).

## #4166 — Modèles de séquence et assistant, lot L-C (14/10/2026, épopée #4163)

S'appuie sur le lot L-B (canaux `linkedin_invite` / `linkedin_message` / `call`, jours ouvrés, exclusions, pause vacances).
**Le contrat** : `packages/contracts/src/schemas/outreach-playbooks.ts` (huit modèles ESN par DÉCLENCHEUR — A signal de
recrutement, B nouveau DSI, C appel d'offres, D réactivation, E après un rendez-vous, F inter-contrat, G régie → forfait,
H contact tiède — chacun avec canal, délai en jours ouvrés, **intention** (liste fermée) et clé de conseil par étape ;
`OUTREACH_TEMPLATE_CATEGORY` range les 14 gabarits existants sous un déclencheur ou « autres », aucun supprimé ;
`recommendPlaybook` pur) et `outreach-message-quality.ts` (score de qualité pur).

- **APPELANTS** : `SequencesPage` rend `PlaybookLibraryBlock` (« Partir d'un modèle », avant la liste) et
  `PlaybookWizardDialog` (4 questions : qui, pourquoi maintenant, ce que j'offre, ce que je veux ; modèle proposé, changeable) ;
  `?playbook_contact=<uuid>&signal=hiring|tender|nomination` (ou `&playbook=<clé>`) ouvre l'assistant pré-rempli
  (`playbookFromSearch`, `PlaybookFromUrl`). Les gabarits d'avant restent atteignables, repliés sous leur situation, et ouvrent
  la même `CreateSequenceDialog`. La bibliothèque importée (`SequenceLibraryBlock`) est inchangée.
- **Messages** : Laura prépare chaque étape qui s'écrit (e-mail, message LinkedIn, trame d'appel) avec le moteur existant
  `POST /ia/message` (aucun second moteur) ; un échec laisse l'étape VIDE et le dit. Une invitation part sans note (éditable à
  la main). Le texte voyage dans `draft` de l'étape ; l'API (`manualChannelPayload`) le garde pour LinkedIn et l'appel, le texte du
  contact reste le repli. Une variable vide sur un e-mail bloque l'étape (`blocked_variables`), jamais de `{{…}}` littéral.
- **Score de qualité** (`MessageQuality`) : six critères nommés (moins de 120 mots, une seule question, personnalisation, objet
  court, variable vide, jargon), calculé dans le navigateur — le texte ne sort pas. `outreach_messages_quality_flags` n'a pas été
  réutilisé : ce sont des signaux DÉCLARÉS par un relecteur qui ne lisent jamais le texte. Pas de note nue, pas de probabilité ;
  texte vide = « non évalué », objet sans objet sur LinkedIn = critère non évaluable (jamais compté).
- **Création** : étapes libres en jours ouvrés, `template_key` = gabarit rangé sous le déclencheur (référence, #2378.6) quand il
  y en a un ; exclusions du lot L-B appliquées (RGPD jamais forçable). Nom en base : `{modèle} — {contact}` (contrat).
- **Démo** : la bibliothèque est statique (pleine par construction) ; `DEMO_PLAYBOOK_SEQUENCES` sème deux séquences nées d'un
  modèle (Pierre Palmieri, Inès Morvan) ; `DEMO_PLAYBOOKS_COVERAGE` ; `demo-playbook-sequences.spec.ts` confronte natures d'étape
  et unité de délai aux CHECK de la migration `1796489437261`.
- **Ce qu'on ne promet pas** : aucun envoi automatique (e-mail préparé, LinkedIn et appel manuels) ; aucun taux de réponse ;
  le contexte « compte » de Laura est celui que `/ia/message` lit déjà pour ce contact (rien de plus). Le brief parlait de 16
  gabarits : le contrat en compte 14, tous rangés.

## #4167 — Automatisations, lot L-D1 (14/10/2026, épopée #4163)

Troisième onglet de `/actions` (**À traiter · Séquences · Automatisations**) : il REMPLACE « Parcours » dans la barre (le tableau
lui-même, `features/chains` et `/actions/chaines`, ne bouge pas — le lot L-D2 le range sous Pilotage › Pipe). **Une grammaire, une
liste** : « Quand [signal] → alors [inscrire le contact dans la séquence X | préparer l'action Y] ». Les règles neuves, les routines
planifiées (`/settings/routines`) et les workflows d'Action OS y sont fusionnés par `features/automations/automationRows.ts` ; les
anciennes routes restent atteignables, par le lien de chaque ligne (la nav n'a qu'une entrée).

- **Le contrat** : `packages/contracts/src/schemas/automation-rules.ts` (signaux, sources, modèles d'automatisation, grammaire,
  compteur, plafond). **Les six signaux n'en inventent aucun** — `AUTOMATION_SIGNAL_SOURCES` nomme l'ÉMETTEUR de chacun :
  recrutement → `besoin_entrant` (Découvrir), nouveau décideur → `changement_decideur`, appel d'offres → `ao_publie`, changement sur
  Mes cibles → `signal_nouveau` (le registre canonique `canonical_trigger_events`) ; compte inactif depuis N jours → la même table de
  gestes que l'alerte « compte sans action » (`InterventionsSweeper`), au seuil CHOISI ; fin de mission → les missions de l'ATS
  connecté (la sélection de la routine `mission_ending`, 30 jours).
- **APPELANTS** : `AutomationRulesController` (`/automation-rules`, `@PersonalScope` + `messages:send` en écriture) ←
  `AutomationsPage` ; `AutomationRulesScheduler` (cron 06:20 UTC en semaine, verrou singleton, interrupteur
  `AUTOMATION_RULES_DISABLED`) → `AutomationRunnerService.runAll` → `AutomationSignalReader` (lit les émetteurs) →
  `planRuleRun` (PUR : exclusions, plafond, mono-contact) → le port `AUTOMATION_ACTIONS_PORT`, réalisé par
  `OutreachAutomationAdapter` DANS le module outreach (GA-07 : le module des automatisations n'importe aucun service voisin, il n'a
  pas de chemin d'inscription à lui). La préparation du matin suit le motif des routines (cron + verrou + interrupteur), pas BullMQ.
- **Exclusions de l'outreach, jamais forcées** : `OutreachCadenceService.eligibility` (déjà en séquence active, contacté < 30 j,
  opposition RGPD, compte client) AVANT, puis `OutreachService.create` en backstop (RGPD, collision, niveau d'approbation de
  l'espace). Aucun `override_exclusions`. Mono-contact (c74) : un contact par signal et par passage. Chaque issue est consignée
  (`automation_rule_firings`) ; un signal consigné ne rejoue pas ; `cap_reached` se reprend quand le plafond le permet.
- **Rien ne part (c82)** : une inscription laisse les étapes à faire ; les e-mails que Laura prépare (moteur existant, même contexte
  que l'assistant — `buildPlaybookContext`, partagé via les contrats) naissent `needs_review`, `source: 'automation'`, le signal en
  `reason`. `features/today` : source « automatisation », « pourquoi maintenant » = le signal, étapes des séquences nées d'une règle
  reconnues par leurs messages. Un compte en NO-GO ne reçoit aucun brouillon ; un échec du moteur laisse l'étape vide.
- **Compteurs honnêtes** : déclenchements sur 30 jours = comptage du journal ; règle jamais passée (ou source illisible, ex. aucun ATS) =
  **« non mesuré »**, jamais 0 ; routines et workflows n'ont pas de journal : « non mesuré ». Coût par préparation = la grille de
  crédits (`message_generation` = 0 ⇒ « incluse »), plafond de crédits par règle sur 30 jours.
- **Modèles d'automatisation** : un par déclencheur, reliés aux huit modèles de séquence du lot C (`signalPlaybook`), installés ÉTEINTS
  puis allumés d'un geste. `buildPlaybookCreateRequest` (contrats) est désormais le constructeur UNIQUE d'une séquence née d'un modèle
  (assistant du navigateur ET automatisations).
- **Migration** `1796540127394` (13 chiffres, par `migration:next` — les fichiers à 14 chiffres sont l'héritage gelé de GA-372) :
  CHECK `source` élargis AVANT le code, deux tables neuves.
- **Démo** : `demo-automations.ts` (`seedAutomations`) — quatre règles (trois allumées avec leur journal, une éteinte jamais passée),
  deux e-mails préparés dans « À traiter » ; `demo-automations.spec.ts` ; `DEMO_AUTOMATIONS_COVERAGE`. Le passage du matin saute les
  salles de démonstration.
- **Ce qu'on ne promet pas** : aucun envoi, aucune probabilité ; une règle ne lit que les signaux NÉS APRÈS sa création et de moins
  de sept jours (jamais de rattrapage en rafale d'un historique — doctrine « le rejeu ne part pas seul ») ; pas de « 0 » pour une règle qui n'a jamais tourné ; un compte sans geste
  tracé n'est pas « inactif depuis N jours » (aucune date) ; une fin de mission dont l'entreprise ne se retrouve pas dans les comptes
  de la personne est consignée « sans contact », jamais devinée ; routines et workflows n'ont pas de compteur propre (non mesuré).

## #4163 LF finitions — recette écran prod du 14/10/2026 (espace démo), lot L-F de l'épopée #4163

Neuf défauts constatés à l'écran, décisions tranchées par Louis. Branche `claude/actions-lf-finitions` (base : lot D, PR #4216).

1. **Titre** : la page et le H1 de la file disent « À traiter » / « To do » (comme l'onglet), plus le doublon du menu « Aujourd'hui ».
   Le GROUPE d'échéance « Aujourd'hui » dans la file reste (`routes.json`, `actions.json › today.title`).
2. **Chaque carte dit sa raison d'être** : `todayQueue.ts` → `TodayWhy { kind: 'origin' }`. La raison écrite par la source passe
   d'abord ; sinon la SOURCE est nommée (« Issu du plan d'action de X », « Tâche ajoutée à ta liste », « Issu d'une séquence »,
   « Écriture proposée vers ton CRM »…) — jamais une raison inventée. Démo : `DemoPlanTask.reason` semé sur les relances de la
   file (faits déjà semés) → `action_plan_items.reason`.
3. **Rafale** : `BurstPanel` appelle `useRegisterSelectionBarOpen()` — même mécanisme que la barre de sélection (GA-386) : le rond de
   Laura s'efface tant que le panneau plein écran est ouvert (`BurstPanel.laura.test.tsx`).
4. **Tiroir Historique** : le pas unique d'une carte du copilote (`effect`) se lit « Exécution de l'action » (`center.stepEffect`) ;
   une référence qui n'est qu'un UUID interne n'est plus affichée (une clé lisible ou une URL, si).
5. **Score de qualité** : `MessageQuality` avait UN appelant (l'assistant, seulement après « Laura prépare »). Il est maintenant
   monté (a) dès l'aperçu de l'assistant — « non évaluée » tant que le texte est vide, jamais une note nue —, (b) sous le brouillon
   e-mail et le message LinkedIn de chaque étape du détail de séquence, (c) sous Objet/Corps dans l'éditeur d'étape.
6. **Démo — messagerie** : `tool-registry/demo-connections.ts` — le registre d'outils d'une salle de démonstration montre messagerie
   ET CRM « (démonstration) » branchés et opérationnels. **Overlay de lecture, aucune ligne en base, aucun jeton** : le bloc
   « Aucun outil connecté… » de `/actions/sequences` lit la même source que les autres écrans (`useRouteAccess`) et ne contredit plus
   les mandats d'envoi signés. La vue opérateur (`registryForWorkspace`) n'est jamais maquillée.
7. **Démo — CRM** : `GET /crm/write-requests` répond `ready` en salle de démonstration (au lieu de `not_configured`) et lit les
   écritures semées (`demo-crm-write-requests.ts`, `seedCrmWriteRequests` : un lot de 3 écritures sur une carte « 3 écritures vers
   ton CRM » + une écriture seule). **Jamais d'écriture réelle** : `decideWrite` ne rappelle pas `writeApproved` en démo (la demande
   passe `approved`, jamais `written`), et il n'existe ni connexion ni jeton. `outbound_write_requests` quitte « vide à dessein »
   (`demo-coverage.ts`). ⚠️ `CrmService.getStatus` répond encore « CRM fictif, non connecté » en démo (Pilotage) : non touché ici.
8. **Contact sans nom** : démo — les deux séquences et les deux messages « achats » visaient le SIÈGE « Responsable des achats de
   prestations informatiques » (nom = fonction) ; ils visent désormais **Grégory Pinault** (même fonction, simulé). Garde :
   `demo-outreach-plan.spec.ts` (aucune séquence sur un siège sans nom). Produit : `withoutRepeatedRole` — quand la fonction tient
   lieu de nom et que le titre de la carte la dit déjà, la ligne « qui » ne la répète pas. Le siège « Directeur technique — entité
   numérique voyageurs » est une persona du client d'exemple (décision Louis 04/10/2026, une quarantaine de gardes) : conservé.
9. **Un seul bouton primaire par carte** : `TodayCard` en liste montre le geste principal (`burstPrimary`) ; le reste vit dans
   « Autres gestes » (`⋯`, bouton nommé, cible ≥ 44 px, clavier Radix : Approuver/Valider/Fait/Modifier/Refuser/Reporter/Confier/Passer).
   « Reporter » ouvre le même choix de date ancré sur le `⋯`. La rafale garde tous ses boutons et ses raccourcis.

**Ce qu'on ne promet pas** : en démo, « approuver » une écriture CRM ne l'envoie nulle part ; aucune probabilité ; la file ne dit pas
« 0 » pour ce qu'elle ne sait pas. `DEMO_SEED_REVISION` passe à 10 (les salles déjà semées sont rejouées).

## #4197 — Affaires · Talents · Missions en neuf onglets (lot L6, 15/10/2026, épopée #4191)

- **Navigation** : trois sections de trois onglets (`sections.ts`). Affaires = Pipe `/projects` · Pistes `/projects/pistes` ·
  Appels d'offres `/rfp` (toujours visible, plus de `hiddenUnless`). Talents = Besoins ouverts `/projects/needs` · Vivier
  `/consultants` · Positionnements `/consultants/submissions`. Missions = En cours `/missions` · Planning
  `/missions/planification` · Facturation `/missions/facturation`. Les URL existantes sont conservées (liens partagés, Laura).
- **Redirections** (`beforeLoad`, jamais `<Navigate>`, GA-27) : `/projects?lens=portfolio` → `/projects/pistes`,
  `/consultants?view=submissions` → `/consultants/submissions`, `/missions/board` → `/missions`. `MissionBoardPage` reste
  (forme `f3_kanban`, GA-74) ; `VivierViewTabs` et `VivierPage` sont supprimés.
- **Écrans sortis de la barre** (`off-nav-screens.ts`, section missions) : relevés, ADV, notes de frais, encaissements, cessions,
  paiements, suivi, débrief (`/pilotage/rex`), création (`/missions/nouvelle`). Joints par la rangée « Administration » de
  Facturation ; `sectionForPath` les fait concourir avec les onglets (longueur de règle), la barre de section se retire dessus.
- **CA probable** : seulement dans Pilotage › Pipe (`/pilotage/pipe`, `PipeScreen` monte `ProbableQuarterPanel`), plus sur
  `/projects`. « Pistes à revoir » du Pilotage lit `pistes_to_review` (`/crm-counters`) et mène aux Pistes.
- **`/missions`** : plus de bascule « Prêt à facturer » (doublon de Facturation) ; puces « Fin sous 30 · 60 · 90 j » (nombres de
  `/crm-counters`, jamais recomptés, non mesuré = aucun nombre) ; colonne Renouvellement ; le filtre « Fin » est conservé.
- **Démo** : aucune donnée neuve (pistes, AO « (démo) », positionnements déjà semés) ; `demo-crm-nav.ts` nomme les semences.
- **Ce qu'on ne promet pas** : pas de migration ; le tableau « Parcours » (#4167) s'ajoutera à la page Pipe de Pilotage.

## #4196 — Cycle de vie d'une mission : terminer, prolonger, le consultant suit (lot L5, 14/10/2026, épopée #4191)

`ConsultantEngagementService` (module consultants, exporté) est le SEUL écrivain de la disponibilité d'un consultant à cause d'une
mission, via `applyFieldUpdates` (source `pipeline` : une disponibilité saisie à la main n'est jamais écrasée). Démarrage
(`POST /delivery/missions/:id/status` vers `active`/`at_risk`/`renewal_pending`/`ending`, depuis un statut hors « en cours ») : `en_mission` +
`available_from = ends_on + 1`, fiche archivée désarchivée et tracée. `POST /delivery/missions/:id/end` (`MissionLifecycleController`) :
statut `completed`, motif typé, échéance ramenée à la fin réelle, consultants libérés (`immediate` / `sous_1_mois` / `sous_3_mois`) — sauf
ceux encore affectés à une autre mission en cours. `POST .../extend` : avenant `end_date_change` proposé puis accepté (l'historique),
échéance (et TJM) appliqués par `DeliveryService.updateMission`, disponibilité repoussée. L'orchestration vit aux contrôleurs (GA-07).
`archive` / `archiveBulk` refusent (409, date de fin nommée) un consultant en mission ; en lot, TOUT le lot est refusé. Écart fiche/mission :
`GET /consultants/:id/engagement` + `POST .../engagement/align` (« Aligner » = écriture humaine), ligne dans `RecordPanel`. Migration de
rattrapage `1796531417285` (désarchive les consultants en mission). `/missions/nouvelle` crée désormais une MISSION (`MissionCreateForm`),
plus un besoin — l'assistant de besoin n'a plus que le dialogue de `/projects/needs`. Pas de saisie du coût chargé au formulaire (D43).
Démo : `demo-crm-mission-lifecycle.ts`. Non couvert : le déplacement de carte sur le tableau vers « En cours » ne déclenche pas le suivi du consultant.

## Décisions du 15/10/2026 (QCM Louis) et correctifs de recette

Lot `feat/decisions-15-10`. Chaque décision est datée dans `agent_docs/doctrine.md` quand elle renverse ou élargit une entrée.

- **#4078** — une ré-analyse RAFRAÎCHIT les blocs du dossier déjà posés (`DossierBlocksStep`), sauf une clé listée dans `raw_analysis.human_corrected_blocks` (correction humaine, gardée aussi dans l'UPDATE). Un bloc rafraîchi vide n'écrase pas l'ancien.
- **#3901/#3866** — ESN de placement : toute offre reste une piste (déjà `offer_relevant_to_profile`, `any_role`) ; parité du lexique cyber des quatre sources d'offres (`pentester` ajouté à `_IT_TERMS`), garde `test_cyber_lexicon_parity_3866.py`.
- **#3935** — années d'expérience (`seniority` → `years_experience`) et TJM (nouveau bloc `daily_rate` → `tjm`) LUS dans le CV, arbitrés (la saisie humaine gagne), jamais estimés. Renverse la décision du 31/08.
- **#3920** — la tendance d'un compte = volume d'offres d'emploi par mois (`hiringVolumeByMonth`, carte `WatchHiringTrendPanel` de la veille).
- **#3247** — `AccountAccessService.communityAccessBySiren` + route pont `accounts/community-access-by-siren` : l'accès d'un compte NON possédé se lit par SIREN (verrou communautaire, GA-43) ; lu par `suggest_account_alternatives`.
- **#2916** — cinq routines de pipeline (`deal_close_date_soon`, `deal_close_date_overdue`, `deal_without_close_date`, `won_deal_expansion`, `lost_deal_revisit`), N1, désactivées par défaut, lectures dans `CrmRoutinesService`.
- **#3905** — l'état vide de `/accounts` (`AccountsEmpty`) mène à Laura (`/chat`, phrase d'exemple déjà posée).
- **#3973** — logos de marque du sélecteur « Outils et sources » : SVG commités dans `chat/view/brand-logos/`, licence de chacun dans `LICENSES.md`, garde `brand-logos.test.ts`.
- **#3989** — la base commune garde TOUTES les personnes de `shared_company_people` (`toSharedPersonFact` : un poste qui porte une coordonnée est retiré, la personne reste).
- **#3916** — chaque annonce BODACC porte son lien (dérivé de l'identifiant quand `url_complete` manque) ; le lien d'une annonce déjà rangée sans lien est complété à la relecture.
- **Recette 15/10** — « Signal « Signal » » (`citableSignalType`) ; un seul nom de verdict (« RÉSERVE ») au plan comme en Synthèse (`readStrategicVerdict().name`).

## Lot CRM-SOCLE — adaptateur commun, porte pour tous, envoi de comptes (#4185 / #4186 / #4188, épopée #4184, 14/10/2026)

**Adaptateur commun** (#4185) : un contrat partagé (`@bellum/contracts` › `crm-adapter.ts` : fournisseurs, opérations,
capacités mesurées) et un registre API (`CrmAdapterRegistry`) — le routeur d'actions, l'export de besoin et l'écran de
connecteurs le lisent ; une garde refuse un fournisseur déclaré sans adaptateur. **Porte pour tous** (#4186) :
`CrmWriteService` est le seul appelant des écritures de l'adaptateur (`POST /crm/push/contact` remplace les quatre
`/<fournisseur>/export`, retirées) ; résultat consigné, `unknown` arrête la reprise ; la file nomme la destination.
**Envoi de comptes** (#4188) : `POST /crm/push/preview` puis `POST /crm/push` (unitaire et en lot, référence externe
dans `account_crm_exports`, aucun doublon au second envoi), « Dans <CRM> » sur la fiche. Démo : SNCF « déjà envoyé »
vers le CRM fictif. Détail : `agent_docs/crm-adaptateur-commun.md`.

## #4179 / #4181 — Envoi Outlook sûr, une réponse arrête les relances (14/10/2026)

**#4179** — `MicrosoftClient.sendMail` porte un délai (45 s, `AbortSignal.timeout`) : un envoi qui pend LÈVE un `TimeoutError`,
lu `uncertain` par `classifyTransportFailure` (déjà là, #3699.5) ; la réservation `claimed → uncertain` ne se rejoue jamais.
« Dans les éléments envoyés » n'est affiché que si `contacts.email_sent_observed_at` est posé — par `reconcileSentProofs`
quand un message SORTANT postérieur à la tentative est lu dans la boîte (canal `mailbox` seulement). La confirmation d'envoi
par la boîte dit AVANT envoi que la signature n'est pas ajoutée (Graph/Gmail ne l'ajoutent pas à un envoi par l'API).
**#4181** — `MailboxService.onReplyReceived` est le point d'entrée unique d'une réponse reçue : séquences arrêtées
(`stopSequencesForContact`), tâches de relance de cadence (`relance | preuve_sociale | close_loop`) passées `obsolete` avec la
raison en tête de `reason`, brouillons « sans réponse » de la routine retirés (consignés dans `action_dispatch_attempts`,
`intent_type = 'no_reply_followup_draft'`). Appelants : réponse mail (`reconcileReplySequences`, classe `stop` seulement — une
réponse automatique d'absence ne clôt rien) et `LinkedInController.record` (`reply_received`). Un pitch d'appel regénéré
n'ajoute plus de ligne d'historique (`generationActionType`).

## Lot CRM-FOURNISSEURS — Zoho CRM, lecture commune, synchro incrémentale (#4187 / #4189, épopée #4184, 14/10/2026)

**Zoho CRM** (#4187) : connecteur OAuth 2.0 à région paramétrable (`ZOHO_ACCOUNTS_REGION`, défaut `eu`, région inconnue
refusée), `api_domain` du jeton jamais deviné, refresh token chiffré, révocation `…/oauth/v2/token/revoke` puis suppression
locale, « connecté » seulement après une lecture réussie. Branché dans le REGISTRE de l'adaptateur commun (aucun switch) :
contact et compte par la porte, un besoin devient une tâche (+ note sur la société). Sans clé = no-op strict. **Lecture
commune** (#4189) : `CrmAdapter.read` implémentée pour Salesforce, Pipedrive, Attio, Odoo et Zoho (comptes, contacts,
affaires, activités là où le CRM les expose — `CRM_PROVIDER_READ_SCOPE`) ; **synchro incrémentale** par curseur
(`crm_sync_cursors`), passage quotidien, date de dernière synchro et fiches en conflit sur la carte du CRM ; une correction
humaine n'est jamais écrasée. Détail, limites et champs laissés hors lecture : `agent_docs/crm-adaptateur-commun.md`.

## #4163 — Lot Parcours : un sous-onglet de Pilotage ouvert à tous (15/10/2026)

Décision de Louis (15/10) : « go pour parcours mais laisse l'accès à tout le monde pour cet onglet, que le réglage de confidentialité se
fasse par sous-onglet pas par onglet ». **Parcours** (`ChainsPage`, `features/chains`) est le cinquième et dernier onglet de Pilotage, à
`/pilotage/parcours` ; `/actions/chaines` redirige (`beforeLoad` + `redirect()`, GA-27) et a quitté `OFF_NAV_SCREENS`. La SECTION Pilotage
n'est plus `managerOnly`/`feature` : Décisions, Pipe, Staffing et Finance portent chacun `managerOnly` + `manager_cockpit` ; Parcours n'en
a aucun. Un non-gestionnaire arrivant sur l'un des quatre est conduit à Parcours par `ManagerTabRoute` (pas de page « réservé »). Cockpit :
`CrmPipelinePanel` retiré de `PilotagePage` — il vit dans Pilotage › Pipe (GA-26). Démo : les sept pistes se remplissent seules depuis
les objets de la salle (entrée `chain_runs` de `demo-coverage.ts`), rien à seeder en plus.

## Organigramme d'un groupe — une personne rattachée à deux entités n'est qu'un nœud (#4177.3, 16/10/2026)

`org_graph_assembler._merge_same_person` fusionne, avant l'assemblage, les contacts qui portent la même identité
(`normalize_person_name` : casse, accents, espaces — « Jean Dupond » n'est pas « Jean Dupont »). Reproduit : « Jean
Dupont » sous Servier SAS et « Jean DUPONT » sous l'Institut donnaient `p-jean-dupont` et `p-jean-dupont-2`. Le contact
à la source la plus solide l'emporte (à égalité le premier) ; un contact sans nom ou écarté (« bruit ») n'est jamais
fusionné. Tests : `tests/test_org_graph_assembler.py` (`…4177_3`).

## #3921.9 / #3921.10 — Événements du registre national (RNE) et marchés gagnés par les ESN (16/10/2026)

**Bug trouvé en sonde** : l'API RNE de l'INPI répond 403 sans `User-Agent` — les bénéficiaires effectifs n'étaient jamais collectés, en
silence (`inpi_rne.py`, test `test_inpi_rne_user_agent.py`). **#3921.9** : la veille des registres lit aussi le RNE (`collectRne` →
`/public-registry/rne-events`, source `rne`, mêmes genres `executive_change` / `new_establishment` + `establishment_closure`, même
dédoublonnage `(source, siren, ref)` ; un site déjà lu par Sirene n'est pas doublé ; premier passage silencieux ; sans identifiants =
no-op strict). Minimisation : jamais de date de naissance ni d'adresse du domicile. **#3921.10** : `esn_directory.public_awards`
compte les marchés GAGNÉS (rôle titulaire, DECP vivant) — `syncEsnAwards` dans la relecture nocturne des ESN ; l'acheteur reste hors
de la colonne. Limites : ces événements nourrissent la veille (pas encore la carte « Annonces légales » de la fiche) ; `publicExposure`
et le signal `recentAward` ne sont pas dérivés.

## Lot V10-D — routes, golden journeys, métriques, mémoire de style (17/10/2026)

- **#2958.5** : `anchor` posé pour les 21 routes du registre de migration (`route-migration-registry.ts`), prouvé par la page destination (`anchorId` de `CustomerPage`/`SettingsPage`).
- **#2958.72-.84** : non-régression, treize dimensions, pour les 12 capacités nommées par #2154 en plus des 3 de référence (`route-migration-nonregression.ts`) ; le panneau `/health` du back-office totalise toutes les capacités.
- **#2154.30** : `search_performed` (hook `useTrackSearchPerformed`) et `action_*` (`trackedMutation`) sur les 6 destinations — plus aucune métrique en `gap`.
- **#2154.26 / #2958.70** : `agent_docs/migration-routes-golden-journeys.md` — chaque golden journey a son spec ou sa raison (GJ 25 et 26 : raison écrite).
- **#2204.65** : portées ÉQUIPE et FIL de la mémoire de style — formulaire (`MessageStyleCreateForm`), composer (« Créer un style pour ce fil »), résolution côté `POST /ia/message` (équipe validée contre les périmètres de l'appelant, fil recomposé du contact). Aucune valeur SQL neuve : `scope` accepte déjà les quatre portées. Démo : un style actif posé sur l'Agence Lyon.

## Recette R40 (17/10/2026) — lot V10-G-FIX-R40 (#3247, #3916, #3918.2, #2887.10, #3243, #3235.4, mot parasite)

- **#3247** — `suggest_account_alternatives` accepte `company_name` (sans `account_id`) pour un groupe HORS portefeuille : aucun verdict
  (`source_account_verdict: null` + `source_account_note`), mais chaque alternative porte `checked` (relation CRM, présence marché,
  « preuve dans ce secteur » — une lecture vide se dit, une lecture en échec reste dans `missing_check`). `RankedAccount.not_evaluated`
  passe de 80 à 400 caractères (Python + `reply-blocks.ts`) : « aucun partenaire déclaré… » n'est plus tronqué.
- **#3916** — la section « Technologies et chiffres clés » s'ouvre d'office quand des annonces légales existent (le compteur seul
  n'était qu'un repli fermé) ; « Voir plus (k) » donne le nombre EXACT d'annonces repliées (`total − 8`).
- **#3918.2** — `GET /crm/accounts/:id/signals` rend aussi `linked_deals` ; la veille dit « Aucune affaire du CRM rattachée à ce compte. »
  UNIQUEMENT quand un CRM est lu et qu'aucune affaire n'est rattachée (jamais quand le CRM n'est pas branché).
- **#2887.10** — le tableau du plan d'actions porte le stade dans le geste (« Proche de signer — Négociation ») ; le pied « Donnée du … »
  n'emprunte plus la date d'un dossier de compte quand le seul outil du tour est `get_action_plan` (plan calculé à l'instant).
- **#3243** — la formule « besoin à confirmer » est imposée mot pour mot ; « prépare une action » prépare le geste par défaut
  (message au contact pertinent), sans redemander « Quel geste ? ».
- **#3235.4** — `compareLastRuns` compare les deux dernières analyses qui PORTENT un verdict (saute celles sans instantané) ; un seul
  run porteur : `unchanged` + `onlyOneRunCarriesVerdict` (« même verdict depuis le <date> »).
- **Mot parasite** (hébreu « בלבד ») — `foreign_script_guard.strip_stray_foreign_script`, appelé en fin de tour dans
  `chat_orchestrator` ; ne touche ni une réponse réellement écrite dans cet autre script ni un mot que la personne a elle-même écrit.
- **Démo (règle 9)** : aucune nouvelle table ni clé de `raw_analysis` — rien à semer ; la phrase CRM de la veille ne sort que si un CRM est lu.

## V11-FIX-R41 (17/10) — le code livré n'atteignait pas l'écran : neuf points, leur cause racine

- **#3247** — l'outil `suggest_account_alternatives` existait (r40) mais rien ne l'appelait ni ne bâtissait la carte : `chat_orchestrator._forced_alternatives_kwargs`
  le force au premier tour sur « alternatives à <groupe> », `known_shape_gate._alternatives_ranking` bâtit la carte `account_ranking` de SES lignes (CRM, présence
  marché, preuve dans ce secteur, partenaires écartés nommés).
- **#3243** — `stale_need_formula` : « besoin à confirmer » posé par le CODE (réécriture de « besoin confirmé », ligne datée en tête) ; « prépare une action » force
  `get_account_contacts` puis `prepare_message_for_contact` (carte à valider, rien ne part).
- **#3918.2** — `AccountCrmSignalsSection` monté dans l'écran Opportunités (`?tab=veille`) : signaux d'affaires CRM datés, ou la phrase « aucune affaire rattachée ».
- **#4180** — `VerdictUnchangedLine` monté en tête de la Vue d'ensemble (la carte n'était que dans le repli fermé « Historique »).
- **#3941.5** — « Augmentation de capital » sur le rail (ligne rapide) ; seul critère de signal coché ⇒ seuls les comptes portant le signal daté, sinon
  « Aucune augmentation de capital récente » ; « levée » retiré de l'aide Startup.
- **#3666.9** — la limite « 1 Go » se lit sur `/settings/import` avant le choix du fichier (`UniversalImportLauncher`).
- **#3777** — fiche Accès : une entité au rang 1 inconnu ne fait plus de ligne (une phrase) ; le badge Décideur reste sur les voies personnelles.
- **#3711.17** — plus de « Non mesuré » hors score (variations du compte, écosystème) ; la garde `une-absence-ne-fait-pas-une-ligne` les attrape désormais.
- **#2370** — le menu « Contacter » propose note LinkedIn, SMS et WhatsApp (« numéro à révéler » sans numéro) : `getMenuChannels`.
- **Bonus #3921.11** — 5 fermetures d'établissement ou plus = UNE ligne dépliable. **#2887.10 (colonne « Source et date »)** : non traité, écran non localisé.
- **Démo (règle 9)** : aucune table ni clé `raw_analysis` neuve — rien à semer.

## V12-FIX-R42 (17/10) — le code livré n'atteignait pas l'écran : trois points, leur cause racine

- **#3917** — l'analyse écrit la date d'une actualité EN TEXTE (« 12 octobre 2026 ») ; `isoDay` (`opportunity-cards.ts`) ne lisait que l'ISO et jetait la date :
  les 6 actualités de Thales s'affichaient sans date. Il lit désormais le jour exact en français ; « mars 2026 », « Non datée », « il y a une semaine » restent
  `null` et la carte dit « Date de publication inconnue » (jamais passée pour récente). Le semis démo n'a rien à ajouter : ses dates sont déjà là.
- **#3278** — la route du plan RENDU (`recommended_route_for_plan`) ne portait que le texte générique du moteur : les critères accumulés (`accumulated_route_criteria`)
  n'entraient que dans le prompt. Elle cite maintenant `proof_cited` (source + jour du relevé), `channel_history` et `motivating_signal` (signal daté suivi, dates
  françaises lues aussi côté IA) ; le bloc route de `PlanNextMoves` les montre et porte « Changer d'angle » (le bouton vivait dans une section repliée).
  Démo : `demo-route-evidence.ts` (Thales, dates relatives au semis).
- **#3295** — la démo sème déjà trois pertes (BNP et ENGIE avec REX, Alstom) : seule la porte manquait. Onglet « Perdus » du pipe (`LostProjectsList`, `?view=lost`),
  « perdues » de Pilotage → liste + lignes ouvrant l'affaire + lien vers `/pilotage/rex` (écran hors barre depuis #4197, non remis en barre).
- **Démo (règle 9)** : aucune table ni clé `raw_analysis` neuve ; `lost_deal_rex` reste classée « semée » dans `demo-coverage.ts`.

## V12-RETENU-B (17/10) — les points « retenu » de la carte de clôture

- **#4055.4 / .6 / .7** — `complete_account` (signaux, besoins, décideurs, organigramme : `missing` = lu et vide, `not_read` = inconnu, collectes
  `proposed_collections` toujours `launched: false`, personnes de l'organigramme absentes des contacts en `detected_outside_base`) et `get_portfolio_sectors`
  (comptes par secteur, `without_sector` à part, `complete: false` quand le portefeuille dépasse la lecture) : `account_completion.py` (pur) +
  `account_completion_tools.py` (ponts), branchés dans `CHAT_TOOLS` avant `push_profile`.
- **#4055.5** — colonne `company_alias` au mapping d'import de comptes ; un alias qui nomme une fiche connue la rapproche (doublon PROPOSÉ), l'alias d'un compte créé
  rapproche les lignes suivantes (`universal-import-planner.ts`).
- **#4055.8** — démo : « Thibault Revel » (SNCF, personne simulée) porte `raw_data.employmentCheck` `left` (`demoEmploymentCheckRawData`).
- **#4055.9** — PR #4176 = méga-intégration fermée sans fusion, sans lien avec la fiche : la base portait déjà les trois états (`contactEmploymentStatus`) ; ajouté « Ancienne
  fonction » pour une personne partie. « Non retrouvé » ne vaut pas départ (test).
- **#4045.3** — déjà là : `jobs-cible` fusionnée (86829c3a7, 7e5c01898, 3eb4cd1a1 ancêtres), les offres sont des signaux `hiring` de la carte (« Pourquoi maintenant »).
- **#4045.12** — `ia-proxy.controller.ts` : profil / partenaires / SIREN de l'espace lus ensemble avant le moteur, besoins connus et référence comparable ensemble après.
  Chemin lent PROUVÉ non mesuré en prod depuis ce conteneur : seule la sérialisation de lectures indépendantes est corrigée (test du nombre d'appels).
- **#2899.6** — `chat_score_scorers.py` : les 17 scoreurs, sans moyenne, `score=None` quand non évaluable, couverture minimale 9/17, lus par le rejeu nocturne.
- **#4158.58** — `POST /notes` sur un compte hors périmètre BU : 403 nommé, rien d'écrit.
- **#3901.14** — `discover_single_flight.py` : deux `/discover/registry` identiques et simultanées partagent UN travail (pas un cache).
- **Hors lot, constaté** : `demo-discover-result-states.spec.ts` rouge sur la base (`emptyCapitalTitle` non classé, R41).
- **Démo (règle 9)** : `DEMO_EMPLOYMENT_LEFT_COVERAGE` et `DEMO_COMPLETION_READS_COVERAGE` (`demo-coverage.ts`), `agent_docs/demo-mode.md`.

## #4158.57 — Rapatrier l'espace personnel dans l'espace ESN rejoint (lot V13-FUSION-ESPACE, 17/10/2026)

Décision Louis 17/10 (arrêt obligatoire levé sous conditions). Avant : rejoindre une ESN n'emportait rien (garde EX-01,
`team-two-users.integration.spec.ts`, toujours vraie — rejoindre seul ne déplace rien). Désormais un GESTE explicite,
Réglages › Espace de travail › Équipe, « Rapatrier mon espace personnel » (`PersonalSpaceMergeCard`, `WorkspaceMerge.tsx`) ;
côté admin de la cible, la demande en attente (`WorkspaceMergeRequestsSection`).

- **Aperçu figé (a)** : `POST /workspace-merge/preview` est une SIMULATION — par table (comptes, contacts) ce qui est recopié,
  les doublons de la cible (SIREN ou identifiant de registre ; e-mail ou LinkedIn — jamais un nom) PROPOSÉS, les contacts
  qui attendent leur compte. Persisté avec son empreinte (`mergePreviewHash`, `workspace-merge.plan.ts`).
- **Double validation (b)** : `confirm` (le demandeur) puis `approve` (owner/admin de l'espace CIBLE, revérifié sur l'espace de
  la demande) portent sur CE hash, recalculé sur la donnée vivante — un aperçu périmé se refait.
- **Job (e)** : file BullMQ `workspace-merge` (concurrency 1, GA-303 relevé 39 → 40), `run()` simulation par défaut, écriture
  seulement avec le hash validé ; journal `workspace_merge_items` (copie + ligne de journal dans UNE transaction) → idempotent et
  reprenable (`POST /workspace-merge/:id/resume`).
- **Archivage (c)** : fin du job → `workspaces.archived_at` / `merged_into_workspace_id`, rien de supprimé ; l'ESN devient l'espace actif.
- **Cloisonnement (f)** et **correction humaine (g)** : le store (`workspace-merge.sql-store.ts`) ne lit que la source et la cible,
  chaque requête bornée par `workspace_id` ; aucune ligne existante de la cible n'est réécrite — un doublon est proposé, jamais fusionné,
  y compris s'il apparaît APRÈS la validation.
- Démo : vide à dessein (`demo-coverage.ts`, la salle n'a pas d'espace personnel). Tests : `workspace-merge.service.spec.ts`,
  `workspace-merge.sql-store.spec.ts`, `workspace-merge.controller.spec.ts`, `1796560255919-WorkspacePersonalMerge.spec.ts`,
  `WorkspaceMerge.test.tsx`.
- **Limites nommées** : seules `accounts` et `contacts` sont recopiées (analyses, plans, notes, activités restent lisibles dans
  l'espace archivé) ; trancher une proposition de doublon (fusionner / garder les deux) n'a pas encore son geste ; un espace archivé
  reste sélectionnable et n'est pas mis en lecture seule.

## #4267 — On ne suit personne par défaut, 3 comptes suivis au plus (maquette a6 à 5 non retenue, Louis 23/10) (SUIVI-E, 18/10/2026)

Retour Louis 18/10 (/mes-cibles) : « par défaut on doit suivre personne […] 3 comptes max, ça empêchera beaucoup de coûts
pour rien ». Avant : le suivi se DÉDUISAIT de `commercial_status` (`watching`/`opportunity`/`customer`) et la veille relisait
chaque jour tout compte classé. Désormais un GESTE explicite, par utilisateur.

- **Modèle** : table `account_follows` (migration `AccountFollows1796560290696`) — une ligne par (utilisateur, compte),
  « Ne plus suivre » ARCHIVE (`archived_at` + `archived_reason`), « Suivre » réactive. RLS `auth.uid() = user_id` + espace,
  `ON DELETE CASCADE` sur les trois FK. Plafond `ACCOUNT_FOLLOW_MAX_PER_USER` (contrats, GA-26).
- **4267.1** : une seule définition, `activeFollowExists` (`account-follow.entity.ts`), lue par le scheduler (re-analyse +
  registres), le worker (garde au run, suiveurs d'un SIREN), `watchCadenceFor` (liste + fiche) et les digests quotidien /
  hebdomadaire (adressés au SUIVEUR). `WATCHED_COMMERCIAL_STATUSES` a disparu.
- **4267.2 / .3** : `AccountFollowsModule` — `GET /account-follows`, `POST|DELETE /accounts/:id/follow` (409
  `account_follow_cap_reached` au 4e, verrou transactionnel par utilisateur) ; écran `FollowedAccountsSection` en tête de /mes-cibles.
- **4267.4** : la migration garde les 3 comptes à statut suivi les plus récents (`updated_at`) de chaque utilisateur, archive le
  reste `migration_cap` (notice une fois, `notice_seen_at`) ; statut commercial intact. Prouvée sur vraie base :
  `1796560290696-AccountFollows.db.spec.ts` (opt-in `ACCOUNT_FOLLOWS_DB_TEST_URL`).
- Démo : SEEDÉE (`seedAccountFollows`, 3 premiers comptes du jeu), purgée par espace avant `accounts`.
- **Limites nommées** : pas encore de bouton « Suivre » sur la fiche compte ni la liste /accounts (seulement /mes-cibles) ; les
  lecteurs du statut commercial HORS veille (hygiène, KPI CRM, balayeur d'interventions, règles d'automatisation, chaînes) sont inchangés.

## V4-CORRECTIFS-B (20/10/2026) — recette prod de la vague 4 : cinq écarts, leur cause racine

- **4293.8 (#2770.13)** : après « Enregistrer », la carte du plan de journée (`FocusPlanCard.tsx`) affiche l'issue
  (« Marqué : Réalisé » / « Reporté » + résultat + durée saisis) et remplace les boutons par « Modifier » ; la seconde clôture
  remplace la première. Côté API, déjà unique : `focus_plan_block_outcomes_unique (user_id, external_event_id)` + `upsert`.
  Cause : l'état d'écran ne gardait que le nom de l'issue, rendu par une variante de bouton quasi invisible.
- **4289.4 / 4289.5 (#3247.3, #3247.4)** : la démo répond à « Par quelle entité attaquer Société Générale ? » (`p-entity-sg`,
  carte `account_ranking`) et la puce SNCF (`p-entity-or-group`, quatre sections) porte « preuve dans ce secteur », la voie
  d'accès par entité (« voie directe » / « voie partenaire X ») et les partenaires écartés nommés — entités et ESN des dossiers
  semés, aucune voie partenaire inventée là où le dossier n'en déclare aucune. Classée `DEMO_ENTITY_ACCESS_COVERAGE` (seedée).
- **(a)** `connectedFamiliesOf` (`tool-exclusions.ts`) ne compte plus un fournisseur de la plateforme « opérationnel » : seul un
  outil du client (`clientToolName`) nourrit « Outils branchés pris en compte » — même règle que « Outils et sources ».
- **(b)** `seedDemoCrmRecette` datait l'affaire gagnée au `started_on` de la mission, parfois à venir (« 01/11/2026 · affaire
  gagnée » le 20/10) : plafonné à la veille de la visite. `DEMO_CRM_SIGNATURE` : débuts de besoins en offsets, plus de dates en dur.
  Garde : aucune issue de `buildDemoPipeRows` / `buildDemoCrmDeals` n'est datée après la visite.

## #4284 — Découvrir : offres, lenteur, « accès refusé », échec muet (lot RETENUS-A, 20/10/2026)

- **#4284.25 / #4284.10 (#3097.1, #4045.3)** — déjà là : la fiche compte liste les offres récentes (`JobSignalsCard` : titre, contrat, expérience, salaire,
  lieu, date, lien ; salaire/TJM seulement si la source l'affiche), le filtre « séniorité recherchée » est au rail (`FilterRail` → `seniorities` →
  `discover_signals.py` `filteredBySeniority`), la branche offres est appelée (`list_hiring_companies*` dans `discover_signals.py`). Rien recodé.
- **#4284.13 / #4284.7 (#4045.12, #3901.14)** — `/discover/signals` rejoint le single-flight de `/discover/registry` (`_discover_signals_once`) : deux
- **#4284.13 (#4045.12)** — `/discover/signals` journalise sa durée (`discover signals duration_ms=… candidates=…`, `_discover_signals_once`) : la lenteur « > 60 s » se lit dans le journal, trois nombres, ni critère ni nom.
  recherches identiques et simultanées font UN travail (elles se disputaient le bucket registre, 40 résolutions chacune). Pas un cache. La moisson,
  la résolution et la chaîne API étaient déjà parallèles et bornées (15 s + 25 s sous le couperet de 45 s ; lectures `collect` en `Promise.all`).
  Non mesuré en prod depuis ce conteneur ; les résultats partiels en flux (SSE) ne sont PAS faits.
- **#4284.8 (#3901.15)** — `france_travail.token_failure_reason()` : un jeton manquant par 429 / 5xx / réponse illisible ne se lit plus « accès refusé —
  clé invalide ou expirée » ; seul un 401/403 garde `unauthorized`. Les autres sources de la moisson n'attendent pas celle-ci (`gather(return_exceptions)`).
- **#4284.24 (#4279.1)** — capture illisible (404 sans authentification). Famille « échec muet » : `qualify` (Discover.tsx) ne faisait rien quand le
  SIREN n'était plus dans la liste affichée ; `resolveQualifyTarget` + message `qualifyMissing` (cause + geste suivant).

## RETENUS-B — suivi, forfait gagné, fiche contact, périmètre (20/10/2026)

- **4283.8 (#4267.5)** : le planificateur EXISTAIT (`WatchlistRefreshScheduler.runFortnightlyReanalysis`, cron 04:40 → job `reanalysis` →
  `AnalysisService.start`, crédits de l'espace). Corrigé : l'échéance se compte en JOURS CALENDAIRES Paris (`isReanalysisDue`, ≥ 15 j — une
  analyse de l'après-midi était rejouée le 16e jour), le `jobId` est calé sur l'analyse PRÉCÉDENTE (`reanalysisJobId`, jamais deux rejeux pour la
  même analyse, une fenêtre d'époque pouvait avaler un rejeu dû), et la fiche dit le jour de la prochaine (`next_reanalysis_at`, `nextReanalysisFor`,
  ligne de fraîcheur de l'onglet Veille). Rien d'annoncé sans suivi actif ni avec le kill switch posé.
- **4286.4 (#3917.5)** : DÉJÀ LÀ — le bloc est « Ce que {{brand}} ajoute à ce que tu sais » (`KnownAccountValueCard`, #2556) ; la marque est
  interpolée, d'où l'introuvable au `grep`. Visible sur un compte que le CRM branché connaît ; sinon aucune ligne (rien à comparer).
- **4291.8 (#4270.4)** : les portes `client_review`/`won` étaient déjà levées pour le forfait encadré (a22e184f92) ; restait la SIGNATURE :
  un besoin forfait sans positionnement retombait dans la mission générique « à staffer ». `applyStageActions` crée désormais une mission
  `forfait` rattachée au besoin (hérite du mode encadré) pour chaque besoin forfait non pourvu.
- **4291.9 (#4270.5)** : DÉJÀ LÀ (f572024a19) — `DEMO_FORFAIT_PROFILE_NEEDS` sur le compte réel SNCF, mission encadrée liée ; `workspace_profile`
  reste NULL en salle, raison écrite dans `demo-coverage.ts`.
- **4292.5 (#3777.11, #3680.6)** : DÉJÀ LÀ — « X affichés sur Y » de la file des pistes (`QualificationLeadsQueue`, 31 tests) et le doublon d'événement SG semé.
- **4292.16 (#4280.1)** : capture lue — le numéro `+33 6 33 09 63 / 57` se coupait au milieu ; il passe sous son étiquette (`stacked`, comme l'e-mail).
  Le panneau « Approche contact » qui recouvre la fiche est une fenêtre flottante voulue, non modifiée.
- **4294.7 (#4142.6)** : DÉJÀ LÀ pour le secteur public (catégorie juridique 7xxx / NAF 84) ; « Déjà travaillées » lisait clients + affaires gagnées,
  elle lit aussi les MISSIONS du compte (`workedSirens`).

## #4294.9 / #4285.3 — la base commune lue POUR DE VRAI par l'analyse, Laura et Découvrir (lot RADAR-DATAFORGE, 20/10/2026)

Suite du lot RADAR (#4281 / #4282, 19/10). Louis : « le dataforge est sous-utilisé dans Découvrir, Analyser et Laura ».

| Lecteur                                                                   | Avant (`origin/main` 20/10)                                   | Après                                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Plan (`phase4_plan._account_historical_needs`)                            | besoins du compte, compte lu par `user_id` seul               | lu dans l'**espace** ; bloc ouvert par la synthèse, ANGLE / INTERLOCUTEUR / PREUVE nommés    |
| Classification (`nodes.classify_node`)                                    | ignorait la base commune                                      | prescripteurs des besoins passés → `known_contacts` (`prescriber`), départagent sans filtrer |
| Laura `search_historical_needs`                                           | `account_id` (créateur seul), techno, personne                | + `siren` (hors portefeuille), compte lu dans l'espace, `summary` calculée                   |
| Découvrir (`DiscoverSourcesService`)                                      | statut du compte seul                                         | + besoins passés par SIREN (rattachement univoque dans la requête), axe référentiel daté     |
| Radar (`technology_radar`)                                                | inchangé — donnée de MARCHÉ (`@MarketData`), rien de l'espace | entrée Découvrir pré-remplie (`radarTechnologyFromFilters`)                                  |
| Repères sectoriels (`search_sector_referential`, `/rag/dataforge/search`) | extraits sémantiques, tout le corpus                          | inchangé — un repère de SECTEUR, pas un fait du compte                                       |

**Ce qu'on ne promet pas.** « La personne qui portait le besoin » = le prescripteur/demandeur typé ; une colonne
« porteur » distincte du pack resterait dans `payload`, non lue (en-tête réel jamais mesuré ici). Les signaux d'un espace
n'entrent pas dans le radar : il est partagé et mis en cache 30 j par technologie. Aucune passe web neuve.

## F1-FIX (20/10/2026) — recette prod du 20/10, issues #4345 · #4340 · #4341 · #4344 · #4354

- **#4345** — un seul point d'entrée « bulle sur place » : `useOpenLauraInPlace` (`features/laura/bubble/use-open-laura-in-place.ts`).
  `AskLaura`, la porte de la barre latérale, l'en-tête de fiche compte, la ligne de liste de comptes, l'état vide et deux CTA
  d'audit / qualification l'appellent ; mobile, surcouche et `/chat` gardent le lien. Les liens qui désignent une conversation
  précise (`conversationId`) restent des liens.
- **#4341 / #4344** — Affaires = le Pipe seul : plus de boutons « Appels d'offres » / « Besoins à pourvoir » dans l'en-tête ;
  l'envoi du modèle part de l'affaire (`detail.answerTender` → `/projects?lens=rfp`). `/projects/needs` NU redirige vers
  `/projects` ; les liens profonds `match`, `q`, `fromRfp`, `account_id` gardent l'écran (appelants réels : matching, lanceur,
  appel d'offres, dossier compte). **Limite nommée** : cet écran reste atteignable par ces liens.
- **#4340** — libellé de navigation « Mes cibles » → « Signaux » (FR + EN) ; routes inchangées.
- **#4354** — cause : le récap ne comptait que `contactId ?? recipient` ; une carte portant le NOM sans identifiant ne comptait pour
  personne. Identité = id, sinon adresse, sinon nom ; `unnamed` dit ce qui reste anonyme ; liste nominative par canal, repliée à 5.
- Démo : aucune donnée nouvelle (écrans existants, déjà seedés).

## G-FIX (20/10/2026) — recette PROD de Découvrir (#4309, #4318, #4319, #4294.10)

- **#4309** : « Expliquer avec Laura » vivait dans le repliable (fermé) ET `AskLaura` s'effaçait pour l'instance gagnante de la bulle.
  Il est désormais sur la carte fermée (`CandidateRow`) et la ligne contact (`ContactResultRow`), `alwaysVisible`, compte en portée. Un seul endroit.
- **Fuite de filtres** : `applyProfileSize` posait l'effectif du profil sur « SAP » seul et la zone du profil (LUDB.2) suivait dans l'URL.
  `applyProfileZone` + garde « compétence seule » : ni l'un ni l'autre ne se posent sans critère structuré ; sinon la zone est NOMMÉE (`ProfileZoneNotice`) et se retire d'un clic.
- **#4318** : cause probable = cette fuite (SAP + ETI + 2 régions) ; à revoir en recette PROD (non reproductible hors ligne).
- **#4319** : phrases de recherche incomplète en mots simples (cause + action), sans SIREN/registre/homonymie ; garde `discover-partial-plain-words.test.ts`.
- **#4294.10** : `isSameCardFact` fond deux natures quand chiffre + 3 mots du titre sont communs ; la date la plus ancienne reste affichée.

## H-DECISIONS (20/10/2026) — #4348 fiche depuis l'URL d'un profil LinkedIn, #4307 l'historique des signaux est gratuit

- **#4348** (décision Louis 20/10, `c95_linkedin_fournisseur_sous_contrat`) — dans la modale d'ajout d'un consultant (Vivier),
  « Pré-remplir depuis l'adresse d'un profil LinkedIn » : l'URL `linkedin.com/in/<slug>` (`parseLinkedInProfileUrl`,
  `consultant-linkedin-lookup.ts`) part vers `POST /consultants/linkedin-lookup`, qui appelle le fournisseur DÉJÀ branché côté IA
  (`IaClient.enrichContact` → `/phase/2/enrich` → Apollo `people/match` par `linkedin_url`) — **aucun endpoint IA nouveau**, cache
  Redis par identité de profil (slug) déjà en place. Le brouillon (nom, titre, parcours en lignes, e-mail/téléphone si rendus,
  **compétences vides : le contrat ne les rend pas**) pré-remplit sans écraser une saisie, reste éditable, et l'enregistrement porte
  `source = 'linkedin_profile'` (nommée côté donnée ; l'écran dit « Profil LinkedIn », jamais le fournisseur). Sans clé, sans
  résultat ou fournisseur muet : `profile_not_found` → « Profil introuvable — colle le texte du profil » (le chemin texte collé de
  `CvDropZone` reste). **Coût** : règle d'enrichissement existante (`consumeEnrichmentCredit`, 1 crédit par SUCCÈS ; 0 résultat,
  démo ou erreur = 0 débit ; solde vérifié AVANT l'appel). Démo : brouillon fictif étiqueté, zéro réseau. Pas de nouvelle table :
  rien à classer dans `demo-coverage.ts` (le geste se montre via le court-circuit du service).
- **#4307** — l'historique des signaux est GRATUIT. Sur `main` rien ne le débitait ; le débit n'existe que dans la branche non
  fusionnée `claude/decouvrir-ux-20-10` (57410d0111 : poids de crédit, entité/migration `discover_signal_history_unlock`, bouton
  « se débloque contre des crédits »). La garde `packages/contracts/src/billing/signal-history-is-free.test.ts` DIT NON à toute
  grille ou tout module qui le rebâtit : cette branche doit retirer ce commit avant de fusionner.
  **Fait à l'intégration PR n°2** : 57410d0111 est annulé (revert) — module, entité, migration `1796560932936`, poids de crédit,
  bouton et clés d'écran retirés ; l'entrée de changelog DECOUVRIR-UX perd son item « contre des crédits ».
- **Preuve en recette (H-DECISIONS)** — #4348 : `/consultants` → « Ajouter un consultant » → « Pré-remplir depuis l'adresse d'un profil
  LinkedIn » → coller `linkedin.com/in/<slug>` → « Pré-remplir la fiche » : nom, titre, parcours pré-remplis et modifiables, le coût
  « 1 crédit si le profil est trouvé, rien sinon » lisible avant le clic ; profil inconnu : « Profil introuvable — colle le texte du
  profil. » et solde inchangé. #4307 : ouvrir l'historique des signaux d'une cible dans `/discover` ne débite rien (aucun prix affiché).

## ENTREPRISE-TOUT #4381 (20/10/2026) — « Entreprise (sur devis) » ouvre TOUTES les fonctions

Cause : le back-office libelle le plan interne `team` « Entreprise (sur devis) », mais `team` ne portait que le socle `TEAM_FEATURES` (sans `talent_pool`) : passer les utilisateurs en « Entreprise » leur RETIRAIT des fonctions. Décision Louis 20/10 : `team` = `ALL_PLAN_FEATURES` (`plan-catalog.defaults.ts`, un seul endroit, GA-26 ; Growth hérite toujours de `TEAM_FEATURES`). Les quotas (crédits, sièges, comptes) ne bougent pas. La grille déjà écrite en base est alignée par la migration `1796560888330-OpenAllFeaturesOnTeamPlan`. Gardes : `plan-catalog-features.spec.ts`, `plan-features.service.spec.ts`.

## MEYER-IMPORT (20/10/2026) — l'export BoondManager de contacts s'importe, le bilan dit pourquoi

Décision Louis 20/10 : le CRM d'Antoine Meyer (Cyrah, export BoondManager `;`, UTF-8 avec BOM) doit être importé, comptes ET contacts créés, prêts à compléter.

- **Cause mesurée** (fixture synthétique `apps/api/src/modules/universal-import/__fixtures__/boondmanager-contacts-synthetic.csv`, 20 lignes inventées) :
  avant, 20/20 lignes écartées (`unknown_company`) ; après, 18 contacts + 9 comptes créés, 2 rejets nommés (`missing_required_field`).
  Les en-têtes « Société - Nom », « Société - Référence interne », « Email 1 », « Téléphone 1 », « Référence interne » ne tombaient dans
  aucun alias (`packages/contracts/src/schemas/universal-import.ts`) : la société restait non mappée. Le BOM n'était pas en cause (testé).
- **Correctif** : alias BoondManager ; « Nom » devient le nom de famille quand une colonne « Prénom » existe ; une colonne « Société - … »
  réclame son champ avant une colonne nue (la « Ville » du contact n'est pas celle de la société) ; « Société - Effectif » = 0 est non mesuré (`null`).
- **Réimport sûr (M.3)** : deux imports successifs = même nombre de comptes/contacts, le second RAPPROCHE par référence (#4052) — testé au niveau du planificateur.
  L'écran ne bloque pas un fichier déjà importé : aucun bouton « Réimporter » n'a été ajouté.
- **Bilan (M.2)** : `GET /import/universal/jobs` porte `reasons` (écartés et « à rapprocher » comptés par raison, une requête groupée) ; l'entrée d'historique de `/settings/import`
  s'ouvre toujours quand elle a quelque chose à dire, même pour un import d'avant le bilan par famille.
- **/accounts (M.4)** : total serveur en tête de liste (`AccountsTotal`) ; le statut `imported` (déjà écrit par l'import) entre dans `analysisStatusSchema`, a son badge et son filtre « Venu de ton CRM ».
- **Limite nommée** : les imports déjà faits (dont celui du 12/10) ne sont pas rejoués seuls (« un correctif de collecte rattrape l'existant », mais le rejeu ne part jamais au déploiement) : réimporter le fichier suffit.

## MIDDLE-MARKET #4361 (20/10/2026) — Découvrir : la puce « Middle market » et « Exclure les sociétés cotées »

Cause : le middle market non coté (« pas du SBF 120 ») ne s'exprimait qu'en cochant deux tranches, et aucun critère de cotation n'existait ; le préréglage posé la veille ne lisait que la catégorie ETI du registre, qui ne dit rien de la cotation. Décision Louis 20/10 (« les deux »).
**#4361.1** — UNE puce « Middle market » (`MIDDLE_MARKET_PATCH`, `discover-presets.ts`) = tranche `250-4999` (bornes 250 à 4 999, non cochable seule) + interrupteur posé ; active = enfoncée, retirable d'un clic. **#4361.2** — interrupteur séparé `excludeListed`, qui se combine avec toute tranche, agit CÔTÉ RECHERCHE (`_apply_listing_filter`, apps/ia, avant la coupe à `limit`).
Source : index ouvert sans clé (`listed_companies.py`, voir `env-reference.md`). Il prouve « cotée » ; une cotation non établie reste dans la liste et `listingFilter` dit retirées / non établies / source disponible. Registre seul (mode Signaux : dit au rail, `rail.registryOnlyIdle`).
Preuves : `test_discover_exclude_listed_4361.py` (cotée de fixture sort avec l'interrupteur, reste sans), `discover-filters-reach-the-search.test.tsx` (claim `excludeListed`), `demo-discover-listing-coverage.spec.ts`.

## PALIERS #4433 (21/10/2026) — un référentiel partagé et des paliers pour compétences (#4434), secteur (#4435), taille (#4436)

Cause : « React » à zéro ne remontait pas les comptes qui recrutent en JavaScript ; un secteur ou une tranche maigre rendait une liste vide. Décisions Louis 21/10 (épopée #4433).
UN référentiel dans `packages/contracts/src/schemas/criteria-referential.ts` (alias → famille → domaine, 68 compétences ; secteurs voisins ; tailles maison ± 1), miroir IA GÉNÉRÉ (`apps/ia/app/knowledge/criteria_referential.json`, garde octet pour octet). `skill-referential.ts` (vivier) le consomme ; le matching dit ADJACENTE une compétence de la même famille.
Sous `CRITERIA_WIDEN_MIN_RESULTS = 10` exacts, Découvrir élargit exact → voisin 1 → voisin 2 (`discover.py`, `criteria_widening.py`), l'exact en tête, chaque élargi étiqueté (`widenedBy`), la réponse le dit (`query.widening`), « Revenir au strict » (`strictCriteria`). Laura (même moteur) le dit sans le proposer.
Fiche : `agent_docs/criteria-referential.md`. Preuves : `test_criteria_paliers_4433.py` (React → JavaScript étiqueté ; ≥ 10 exacts → rien, NON), `criteria-referential*.test.ts`, `WideningNotice.test.tsx`, `demo-criteria-widening-coverage.spec.ts`.

**#4433.9 — les autres surfaces (21/10/2026).** Mes cibles / la veille (même plateau `WatchlistBoard`) : « À traiter » sous 10 comptes → aussi les comptes déjà traités, palier dit, retour au strict (`buildWatchlistView`). Analyse de compte : la passe d'élargissement des contacts part sous le seuil commun (10) et se dit dans le bandeau de couverture. UN seuil (`CRITERIA_WIDEN_MIN_RESULTS`), UN bandeau (celui de Découvrir). Fiche : `agent_docs/criteria-referential.md`. Preuves : `surface-widening.test.ts`, `watchlist.widening.test.ts`, `WatchlistBoard.test.tsx`, `SurfaceWideningNotice.test.tsx`, `OrgCoverageBanner.test.tsx`, `test_phase2_contacts.py::test_auto_widen_uses_the_shared_threshold_not_a_private_one`, `demo-surface-widening-coverage.spec.ts`.

## Théo C — Automatisations : bibliothèque de routines, journal des essais, éditeur de règle (R22-ECRAN-c4, 22/10/2026)

Deux écrans de la maquette V22 (domaine C), appliqués avec **tout ce qu'ils portaient** — les listes « ABSENTES CHEZ THÉO » sont
gardées 8/8 (réglages d'une routine, approbation, blocages d'activation, autonomie ; plafond de crédits, six déclencheurs, preuve et
repli, origine).

- **Bibliothèque** `/actions/automatisations/bibliotheque` (`RoutineLibraryPage`) : recherche + FAMILLE métier (six) au lieu de la
  cadence, outils lus par carte (ceux du client, nommés par leur capacité, « à connecter » quand le blocage est réel), état de la
  routine lisible sans ouvrir, douze à la fois. La fiche pleine page devient la fenêtre « Voir le fonctionnement »
  (`RoutineFunctioningDialog`) à deux onglets « Comment ça marche » / « Réglages » : le blocage d'activation vient D'ABORD. `/settings/routines`
  et `/settings/routines/:key` redirigent (liens entrants). « Lancer celles qui sont dues » et « Relances automatiques » sont repliés en pied
  de page — plus dans l'en-tête, mais pas perdus.
- **Journal des essais** `/actions/automatisations/journal` (`automation_rule_trials`) : un essai lit les vraies données et n'écrit que sa
  ligne ; une source illisible se NOMME (jamais « 0 situation »).
- **Éditeur** `/actions/automatisations/:id` (`AutomationEditorPage`) : « Régler » enregistre un BROUILLON (`automation_rules.draft`), la version
  qui tourne ne bouge pas ; il ne s'active (version +1) qu'après un essai réussi, et chaque modification efface l'essai. Copie (éteinte),
  archivage (on archive, on ne supprime pas). Chaîne à trois maillons — « Laura repère et prépare » fusionne les deux maillons de la maquette.
- **Pas fait / écart assumé** : « Préciser » passe la précision à Laura dans sa conversation (rien ne se modifie seul) — pas d'édition en langage
  naturel qui écrirait le brouillon ; les 44 modèles de la maquette sont les 49 routines du catalogue (les sept « nouvelles » y étaient déjà) ;
  les noms d'outils de la maquette (messagerie, agenda) sont écrits par capacité (GA-44) ; le coût d'une règle se dit sans chiffre (#4468).

## THÉO V22 C — fiche affaire et Présentations (22/10/2026, lot r22-ecran-c6)

Décisions Louis 22/10 : le Studio de propositions est FONDU dans Affaires › Présentations (Q8, HT-6) ; une proposition par AFFAIRE, portée par la fiche affaire, montrée dans chaque présentation.
**Fiche affaire** (`ProjectDossierPage`) : trois onglets Besoin · Profils & présentations · Activité (`?onglet=`), frise de cinq étapes LUE sur les neuf états stockés (`project-frieze.ts`, aucune migration ; le déplacement passe par `useProjectStageMove`, le même geste gouverné que le sélecteur), bandeau unique « prochaine information utile » (`project-next-info.ts`), « Ce qui reste à décider » dérivé du brief, de la cible tarifaire et du rôle des contacts reliés (`project-decisions.ts`), trois boutons Modifier / Avec Laura / Suivi (six gestes dont « Mettre en veille ou clore »). Rien n'est retiré : porteur, catégorie de prévision, privé, montant, étape complète, partage, export CRM, archivage, affaires similaires sont dans « Modifier » ; la synthèse en sept questions est repliée dans « Avec Laura » ; contacts, partenaire, conditions, probabilité calibrée sont repliés dans « Besoin » ; documents et tâches sont dans « Activité ».
**Présentations** (`/projects/presentations`, `PresentationsPage`) : quatre états à l'écran + « À présenter », cinq sorties dans le filtre avec leur motif (`presentation-states.ts`, sur l'étape et le sous-statut inchangés), entonnoir 30 jours (replié sous le tableau < 768 px) + par commercial, détail à blocs sur `/submissions/:id` (accord à présenter, trace déclarative, écart de tarif, brief d'entretien à l'étape Entretien client, « Consigner un entretien » avec le retour du consultant INTERNE). `/propositions` redirige vers la présentation la plus avancée (`mostAdvancedPresentation`).
Preuves : `presentationStates.test.ts`, `PresentationsPage.test.tsx`, `SubmissionDossierPage.test.tsx`, `ProposalPlanBlock.test.tsx`, `project-frieze.test.ts`, `project-decisions.test.ts`, `project-next-info.test.ts`, `ProjectDossierPage.test.tsx`. Démo : les positionnements semés portent déjà canal, accord, prochaine échéance, refus motivé et présélection (`demo-seed.service.ts`) — aucune table ni clé `raw_analysis` neuve.
Non fait (nécessite une migration, hors lot) : le lien source de l'« Origine » d'une affaire (aucune URL n'est stockée sur l'affaire ou le besoin) ; le canal « Portail achats » / « En main propre » de Théo (le contrat garde téléphone, e-mail, réseau professionnel, réunion).

## BESOINS — TROIS STATUTS, SOURCE CLIQUABLE, FICHE (Théo C projects-besoins / projects-besoin-fiche, 22/10/2026)

Décision Louis 22/10 (Q10) : l'écran Besoins lit trois statuts — À qualifier · Ouvert · Couvert — et l'état stocké précis voyage en étiquette. **Correspondance écrite** (`packages/contracts/src/schemas/need-theo-status.ts`, rien n'est réécrit en base, la contrainte SQL ne bouge pas) : À qualifier ← `detected`, `to_qualify`, ancien `open` ; Ouvert ← `qualified`, `to_match`, `matching`, `shortlist_ready`, `submitted`, `client_review`, `interview`, `negotiation`, `on_hold`, `to_reactivate` ; Couvert ← `won`, `staffed` ; perdu / annulé = « clos », jamais « couvert », retrouvables par filtre.
Filtre serveur `theo_status` (`open-needs.service.ts`), kanban à trois colonnes (les Couverts se chargent par `include_closed` en vue kanban), tableau en cinq colonnes composées (rien ne disparaît), « Périmé — à revérifier » = le prédicat UNIQUE de la routine des besoins sans shortlist (`NEED_STALE_AFTER_DAYS`) exposé en `stale` + filtre, `source_url` (page d'origine de l'offre, proposition acceptée → besoin) en lien visible sur la ligne et la carte (`NeedSourceLink`), export « pour un partenaire » (sans tarif ni porteur). Fiche `/projects/needs/:id` : « Besoin · compte · porté par », ligne d'état, « Ouvrir l'affaire », compte de profils sur l'onglet, synthèse en sept questions de l'affaire, chemin vers la proposition de l'affaire.
Preuves : `need-theo-status.test.ts`, `open-needs.service.spec.ts` (R3/A8/source), `NeedsKanban.test.tsx`, `OpenNeedsSourceLink.test.tsx`, `NeedDetailPage.test.tsx`, `demo-flagship-need-source.spec.ts`.

## R22-ECRAN-d6 (22/10/2026) — Réglages › Mon espace et Réglages › Laura (maquettes Théo V22 `settings-espace`, `settings-laura`)

Pages à onglets qui MONTENT les vues existantes (aucun réglage recodé, GA-26) : Règles métier (Accès · Pipeline · Charge · Marché inversé · Frais · Marge · Qualité — `/settings/workspace-rules?onglet=`), Périmètres & sociétés (`/settings/business-units`), Catalogues & vocabulaire (`/settings/catalogues`), Marque & documents. Les anciennes adresses (`pipeline`, `commercial-load`, `reverse-market`, `finance`, `do-not-contact`, `legal-entities`, `lexicon`, `/expenses/bareme`, `/settings/routines/<clé>`) redirigent dans leur `beforeLoad` ; elles restent DÉCLARÉES dans `items.settings.ts` (`aliasOf`) parce que la recherche des Réglages et le catalogue de Laura en dérivent. Nouveau : signature et pied de document (N5, migration `1796574800005`, lus par les dossiers Word et PDF), export du cadrage (N2, côté navigateur), maturité dans le profil, profondeur par défaut de Laura (N1, locale à l'appareil, lue par `researchModeFor`), ajout d'un élément de mémoire (N3, `MemoryAddDialog` sur l'épinglage existant), Routines & veilles avec « Ouvrir avec Laura » et détail en tiroir. « Nom du copilote » retiré (D82). Preuves : `SpaceSettingsPages.test.tsx`, `LauraPages.test.tsx`, `hub-tabs.test.ts`, `BrandingView.test.tsx`, `MemoryAddDialog.test.tsx`, `framing.test.ts`, specs API `workspace-brand.service.spec.ts` / `document-builders.spec.ts` / `pdf-builder.spec.ts`.

## R22 ÉCRANS B — Contacts › Imports & sources et assistant d'import (22/10/2026, lot r22-ecran-b-c3)

Décision Louis 22/10 : **un import est TOUJOURS vérifié avant d'écrire, quelle que soit la taille** ; l'import long part en arrière-plan APRÈS la vérification, jamais à sa place.
`POST /import/universal/jobs/:id/verify` (`UniversalImportService.verify`) lit le fichier en flux et rend le plan du planificateur pur (créer / compléter / doublon / invalide / à rapprocher, ligne à ligne, détail borné à `UNIVERSAL_IMPORT_VERIFY_ROW_CAP`, compteurs sur tout le fichier, colonnes sensibles, contacts sans base légale) SANS rien écrire. `start` honore `skipLines` (« Ne pas importer » par ligne, colonne `universal_import_jobs.skipped_lines`, raison `skipped_by_user` au rapport) et la portée / le CRM d'origine dits après le dépôt.
Écrans : `/contacts/imports` (cinq sources, deux renvois, ce que les données débloquent, historique avec « Reprendre ») et `/contacts/import` (Source · Colonnes · Vérification · Résultat), `apps/web/src/features/contacts-import/`. La fenêtre d'import universel partagée (`UniversalImportDialog`) vérifie elle aussi avant de lancer. Carnet vCard lu dans le navigateur (`lib/vcard.ts`). Historique semé en démo (`DEMO_IMPORT_HISTORY`).
Pas encore : annulation d'un import de fichier (aperçu + retour arrière — aucun lien job → fiches écrites), choix du contact depuis l'annuaire de la messagerie, liste d'arrivée nommée / responsable par défaut, clé de rapprochement (« par domaine / SIREN ») sur la vérification.
Preuves : `universal-import.service.spec.ts` (vérification sans écriture, `skipLines`), `ImportAssistant.test.tsx`, `ImportsSourcesPage.test.tsx`, `UniversalImportDialog.test.tsx`, `demo-import-history-coverage.spec.ts`.

## #4291 — Affaires · Talents · Missions : état des 13 points (lot K-EPOPEE-4291, 27/10/2026)

Mesuré à l'APPELANT sur `origin/main` : aucun point ne demandait de code, rien n'a été recodé.

- **4291.1 (#4191.4)** : DÉJÀ LÀ — `MissionsTable.tsx:238`, colonne `role` sans `line-clamp` (les `line-clamp` restants sont d'autres colonnes : client, nom des consultants).
- **4291.2 / 4291.3 (#4191.6, #4191.8)** : DÉJÀ LÀ — mission démo née d'une signature, porteur nommé (`demo-mode.md`, « liés PAR NOM »).
- **4291.4 (#4191.9)** : DÉJÀ LÀ — `02514714`, changelog FR/EN du porteur (`packages/contracts/src/changelog/entries.ts:232`, `labels.fr.ts`, `labels.en.ts`).
- **4291.5 à 4291.7 (#4270.1 à .3)** : DÉJÀ LÀ — onboarding `questions/recrutement.ts:45`, réglage `WorkspaceProfileSetting.tsx:11`, navigation `CustomerNavbarBody.tsx:69`, besoin `NeedDetailPage.tsx:280`.
- **4291.8 / 4291.9 (#4270.4, #4270.5)** : DÉJÀ LÀ — voir RETENUS-B ci-dessus ; entrée démo `DemoEntryPage.tsx:208` (`start('forfait_conseil')`).
- **4291.10 / 4291.11 (#3935.1, #3935.3)** : code là (colonnes environnements/outils/certifications, rattrapage `cv-auto-parse.service.ts:356`, bouton du vivier) ; reste une RECETTE sur prod, pas du code. À trancher par Louis : le « bandeau de progression à 0 » attendu par 4291.11 a été SUPPRIMÉ le 24/10 (#4500.2, `doctrine.md`).
- **4291.12 / 4291.13 (#3935.14, #3935.15)** : reformulés vers `c119_seniorite_saisie_jamais_deduite` et le TJM ratifié ; rien à faire ici.
