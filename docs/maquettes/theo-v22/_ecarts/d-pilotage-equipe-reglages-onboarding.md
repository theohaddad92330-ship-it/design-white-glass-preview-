# Écarts Théo V22 ↔ produit — DOMAINE D : Pilotage · Équipe · Réglages · Onboarding

> Lot `THEO-V22-ECARTS-D` — inventaire **lecture seule** (aucun code produit). Date : 22/10/2026.
> Côté Théo : les 3 HTML de `docs/maquettes/theo-v22/` sont **le même produit** (diff = seule la route par défaut) ; rendus dans Chromium
> headless et lus route par route (texte réellement affiché, pas le code des maquettes). Côté produit : `origin/main` @ `64c6806c08`
> (`apps/web/src/routes/`, `features/`, `i18n/locales/fr/`). Chemins ci-dessous relatifs à `apps/web/src/`.
> Décision Louis : Théo est appliqué EXACTEMENT ; toute feature existante absente chez lui = **question à Louis** (liste 3), jamais retirée seule.

## Écrans couverts et compte par liste

| #   | Écran                   | Route Théo                                                                                       | Route produit                                                                 | Composant (apps/web/src/features/…)              | 1 Redessin | 2 Neuves | 3 Absentes |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------ | ---------: | -------: | ---------: |
| 1   | `pilotage`              | `#/pilotage`                                                                                     | `/pilotage (+pipe, staffing, finance, rex)`                                   | `PilotagePage.tsx:74`                            |          8 |        6 |         17 |
| 2   | `team-vue`              | `#/team`                                                                                         | `/team`                                                                       | `ManagerDashboardPage.tsx:111`                   |          7 |        7 |          8 |
| 3   | `team-business`         | `#/team/business (+affaires, portefeuilles)`                                                     | `— (dans /team)`                                                              | `PipelineReview.tsx:27 / ObjectivesPanel.tsx:27` |          4 |        8 |          5 |
| 4   | `team-plans`            | `#/team/plans`                                                                                   | `— (dans /team)`                                                              | `SharedActionsQueue.tsx:24`                      |          3 |        4 |          2 |
| 5   | `team-member`           | `#/team/member/:id`                                                                              | `— (tiroir)`                                                                  | `RepsBoard.tsx:48`                               |          2 |        4 |          2 |
| 6   | `team-recherches`       | `#/team/research`                                                                                | `— (aucune page d'équipe)`                                                    | `DiscoverSidebar.tsx`                            |          2 |        3 |          2 |
| 7   | `team-activite`         | `#/team/activity (+discussions)`                                                                 | `— (dans /team) · /settings/activity`                                         | `RecentActivityFeed.tsx:26`                      |          3 |        5 |          3 |
| 8   | `team-review`           | `#/team/review/1..3`                                                                             | `— (RitualsPanel)`                                                            | `RitualsPanel.tsx:32`                            |          2 |        3 |          2 |
| 9   | `team-admin`            | `#/team/admin (+rights, rules)`                                                                  | `/settings/team`                                                              | `TeamView.tsx:420`                               |          5 |        4 |          6 |
| 10  | `settings-prefs`        | `#/settings (+personal, shortcuts)`                                                              | `/settings, /settings/profile/identity, /settings/shortcuts`                  | `PreferencesView.tsx:52`                         |          6 |        5 |          7 |
| 11  | `settings-compte`       | `#/settings/notifications · security · mes-donnees`                                              | `/settings/notifications · security · mes-donnees`                            | `NotificationsView.tsx:169`                      |          3 |        4 |          6 |
| 12  | `settings-espace`       | `#/settings/profile · business-units · legal-entities · workspace-rules · catalogues · branding` | `mêmes chemins + pipeline, commercial-load, reverse-market, finance, lexicon` | `ProfilePage.tsx:25`                             |          5 |        6 |          9 |
| 13  | `settings-laura`        | `#/settings/laura-mode · memory · knowledge · routines`                                          | `mêmes chemins`                                                               | `LauraModeSettingsView.tsx:26`                   |          4 |        5 |          5 |
| 14  | `settings-outils`       | `#/settings/import · mcp · billing · activity · mes-signalements`                                | `/settings/import, mcp, activity, mes-signalements + /billing`                | `AiAssistantView.tsx:343`                        |          5 |        4 |          4 |
| 15  | `settings-integrations` | `#/settings/integrations (+review, history)`                                                     | `/integrations`                                                               | `IntegrationCenterPage.tsx:39`                   |          6 |        6 |          8 |
| 16  | `onboarding-accueil`    | `#/onboarding/welcome · how · laura`                                                             | `/onboarding, /onboarding/company, /welcome`                                  | `OnboardingWelcomePage.tsx:67`                   |          4 |        4 |          6 |
| 17  | `onboarding-questions`  | `#/onboarding/step/:id (7 étapes, 38 questions)`                                                 | `/onboarding/$id/$stage/$slug`                                                | `OnboardingWizard.tsx:59`                        |          5 |        6 |          6 |
| 18  | `onboarding-relecture`  | `#/onboarding/review · audit · launch`                                                           | `/onboarding/$id/review, generating, /settings/profile/audit`                 | `OnboardingReviewPage.tsx:33`                    |          5 |        7 |          6 |
|     | **Total** (18 écrans)   |                                                                                                  |                                                                               |                                                  |     **79** |   **91** |    **104** |

_Comptes calculés sur les identifiants `<écran>.R|N|A<n>` du document._

## Six questions qui bloquent tout codage (à poser à Louis en premier)

1. `pilotage.A0` — Pilotage : une page unique (Théo) ou les quatre routes Cockpit/Pipe/Staffing/Finance validées le 14/10 ?
2. `onboarding-questions.A1` — Onboarding : 38 questions (Théo) contre ~150 existantes — que devient le reste (Temps 2, Laura, retiré) ?
3. `onboarding-accueil.A2` — Où se fait le choix du plan / le paiement, Théo n'ayant aucun écran de plan ?
4. `onboarding-relecture.A1` / `A4` — L'audit IA en arrière-plan et le diagnostic de maturité complet restent-ils ?
5. `settings-integrations.A1` — Les ~14 connecteurs absents chez Théo (Salesforce, Pipedrive, Odoo, Slack, Teams, Lemlist, ATS…) restent-ils visibles ?
6. T9 — Les lignes « par personne » de Théo (RDV 1/8, « Analyse de compte consultée », journée d'un collègue) sont-elles compatibles avec « l'analytique mesure le produit, jamais la personne » ?

## Lecture : ce que contiennent les trois listes

1. **REDESSIN** (`<écran>.R<n>`) — l'élément existe des deux côtés, la forme change.
2. **FEATURES NEUVES** (`<écran>.N<n>`) — Théo le montre, le produit ne l'a pas. « front seul » = la donnée existe déjà ; « back » = table/endpoint à construire ; « démo » = ce que `demo-dataset.ts` devra semer (craft rule n°9).
3. **ABSENTES CHEZ THÉO** (`<écran>.A<n>`) — existe dans le produit, aucun écran Théo ne le montre. Chaque ligne se lit seule et part en QCM : **(a)** garder là où Théo ne l'a pas (proposition) · **(b)** déplacer ailleurs · **(c)** retirer.

## Constats transverses (valent pour tout le domaine D)

- **T1 — Théo n'a pas de sous-pages Pilotage.** Le produit a quatre routes (`/pilotage` Cockpit, `/pilotage/pipe`, `/pilotage/staffing`, `/pilotage/finance`, plus `/pilotage/rex`) validées par Louis le 14/10 (« Pilotage = Cockpit/Pipe/Staffing/Finance »). Théo montre **une seule page** `#/pilotage`. Appliquer Théo « exactement » contredit donc la décision du 14/10 : **à trancher par Louis avant tout codage** (question `pilotage.A0`).
- **T2 — Théo a deux « Pilotage ».** `#/pilotage` = la vue de l'utilisateur sur SON activité ; `#/team` = « Le pilotage collectif ». Les deux sont reliés par une barre de 4 onglets en tête de page (« Ma journée · Mon agenda · Équipe · Pilotage »). Dans le produit, `/team` a été refondu par Louis le 14/10 (`ManagerDashboardPage.tsx:111`, pyramide inversée) : **je ne propose pas d'y toucher sans que Louis le décide** (voir `team-vue`).
- **T3 — Théo n'a pas de route `#/team/member`** sans identifiant : seulement `#/team/member/theo|maeva|louis`.
- **T4 — Réglages : Théo a une navigation à 4 groupes / 20 rubriques** (Mon compte · Mon espace · Laura · Outils & administration, + champ « Rechercher un réglage »). Le produit en a déjà 2 groupes / ~28 entrées (`components/sidebar/items.settings.ts`). La majorité des rubriques Théo existent donc : l'écart est de **regroupement**, pas de contenu.
- **T5 — Règle « un réglage vit à UN seul endroit » (GA-26) : Théo la heurte à 3 endroits** : (i) l'administration des membres apparaît dans `#/team/admin` **et** `#/settings/team` (« Les mêmes membres… que dans l'espace Équipe ») ; (ii) les règles d'équipe (plages de prospection, créneaux, objectif d'appels) sont sous `#/team/admin/rules` alors que Théo renvoie lui-même les routines vers Réglages ; (iii) le raccourcis apparaissent dans Préférences > Raccourcis **et** dans Aide & signalements. À signaler à Théo / trancher.
- **T6 — Libellés d'étapes d'affaire différents.** Théo : À qualifier · Cadrage · Profil présenté · Proposition (+ gagné). Produit (`i18n/locales/fr/pilotage.json`, bloc `stages`) : Détecté · Potentiel · Qualifié · Besoin exprimé · Profils présentés · Négociation · Signé · Perdu · En sommeil. Quatre étapes ouvertes chez Théo contre sept chez nous : **vocabulaire à aligner par Louis**, à ne pas résoudre en silence (concerne aussi le domaine « Affaires »).
- **T7 — Éléments communs à toute page Théo, hors périmètre D** : popover « Comment travailler ici ? » + lien « Paramètres de matching », pastille « Aperçu local · données fictives », recherche ⌘K, bouton « Commenter cette page », alternance clair/sombre. Traités par le domaine « shell ».
- **T8 — Probabilité / CA probable.** Doctrine : autorisés **dans Pilotage seulement**. Théo n'en montre nulle part (« Aucune probabilité de signature inventée », « Pipe non pondéré »). Ce n'est pas une violation ; mais appliquer Théo à la lettre ferait **disparaître** `ProbableQuarterPanel` de Pilotage → traité en `pilotage.A12`.
- **T9 — Mesure de la personne.** Théo met des chiffres **par personne** (RDV obtenus 1/8, comptes ajoutés 6/4, « Analyse de compte consultée » par nom) tout en écrivant « Pas de surveillance de présence ». Doctrine : « l'analytique produit mesure le PRODUIT, jamais la personne » (gardes GA-240/241/264/266/267). Le tableau « Par commercial » existe déjà (`RepsBoard.tsx:48`, six colonnes, trié par NOM) ; les lignes **« consulté / a consulté »** et les ratios cible-par-personne sont à soumettre à Louis (voir `team-activite`, `team-business`).

---

## 1. `pilotage` — Pilotage

**Théo `#/pilotage`** (titre « Piloter ton activité ») → **produit `/pilotage/`** : `routes/pilotage/index.tsx:8` → `features/pilotage/view/PilotagePage.tsx:74` (Cockpit). Sous-routes liées : Pipe `features/pilotage/pipe/PipeScreen.tsx:31`, Staffing `features/pilotage/staffing/StaffingScreen.tsx:33`, Finance `features/pilotage/finance/FinanceScreen.tsx:238`, REX `features/pilotage/rex/view/RexScreen.tsx:52`.

Ce que montre Théo, de haut en bas : en-tête + « Exporter la synthèse » + pastille « Octobre 2026 » · 4 tuiles (Pipe ouvert 417 k€ non pondéré · Affaires gagnées 71 k€ · Profils disponibles 3 · Actions à faire 9) · « Le cap d'octobre » (anneau 47 %, signé 71 k€, cible 150 k€, « 79 k€ pour atteindre le cap ») · « De la mission à l'encaissement » (15,8 k€ encaissés · 38,8 k€ à suivre · 15,2 k€ en brouillon · « Retrouver les factures ») · courbe « Évolution du pipe » (août→octobre) · « Où se situe la décision ? » (4 étapes avec nombre) · « Trois décisions à prendre » (3 cartes + 1 lien chacune).

### Liste 1 — REDESSIN

- `pilotage.R1` — Titre : « Voici où ton système décroche, {prénom}. » + sous-titre chiffré dynamique (« N maillons décrochent ») + pastille d'alertes à droite (`PilotagePage.tsx:~131-150`, `ChainAlertsBadge.tsx`) → « Piloter ton activité » + sous-titre fixe « Les décisions commerciales avant les compteurs ». La pastille d'alertes disparaît.
- `pilotage.R2` — Objectif du mois (`MonthObjectiveBlock.tsx:18` : objectif de l'espace, réalisé, reste à signer, couverture du pipe × N, rythme attendu par jour ouvré) → « Le cap d'octobre » : anneau de progression + 3 chiffres (signé / cible déclarée / reste). Le lien « Saisir un objectif dans Équipe » devient « Détail ».
- `pilotage.R3` — Chiffres de tête : aujourd'hui répartis dans Pipe (`pipe_value`), Staffing (`bench`), Actions (`/actions`) et la bande « Ce qui a bougé » (`WeekDeltaStrip.tsx:51`) → **4 tuiles côte à côte** en haut de page (Pipe ouvert · Gagnées · Profils disponibles · Actions à faire), toutes en stock du jour, plus en mouvements sur 7 jours.
- `pilotage.R4` — Décisions (`DecisionStrip.tsx:49`, cartes « Ce qui attend une décision », jusqu'à ~10 natures, masquées quand rien n'attend) → « Trois décisions à prendre » : toujours trois cartes rédigées en phrase (« Groupe Hélios attend la validation des conditions… ») avec un seul lien d'action (Ouvrir l'affaire / Voir le planning / Ouvrir le vivier).
- `pilotage.R5` — Finance (`FinanceScreen.tsx:238`, ligne « Préparé, facturé, à préparer » + « Encaissements ») → carte unique « De la mission à l'encaissement » à 3 montants (encaissés / à suivre / en brouillon) + « Le pipe commercial n'est pas un encaissement. Les deux restent séparés. »
- `pilotage.R6` — Répartition du pipe : `PipeWaterfall.tsx:26` « Mouvement du pipe » + `PipeInspection.tsx:30` (par catégorie déclarée) → « Où se situe la décision ? » : 4 puces d'étape avec le nombre d'affaires (À qualifier 2 · Cadrage 2 · Profil présenté 2 · Proposition 1) et une phrase de conduite. Vocabulaire d'étapes différent (constat T6).
- `pilotage.R7` — Navigation : barre de sections du produit (Décisions / Finance / Équipe + onglets Pipe, Staffing) → barre de 4 onglets en tête (Ma journée · Mon agenda · Équipe · Pilotage). Pilotage devient un **voisin** de « Ma journée » et non une section à part.
- `pilotage.R8` — Remise en forme des mêmes données en **mêmes cartes blanches arrondies, pas de tableau** : la `ChainStrip` (8 maillons sur une ligne) et les panneaux de détail n'ont plus de forme équivalente chez Théo (voir liste 3).

### Liste 2 — FEATURES NEUVES

- `pilotage.N1` — **Courbe « Évolution du pipe »** (valeur non pondérée, un point par mois, août→octobre, mention « Scénario illustratif »). **Back à construire** : aucune série temporelle du pipe n'est servie (`PipeWaterfall` donne un _mouvement_ sur période, pas un historique mensuel) — probable table `pipeline_snapshots` (date, montant ouvert non pondéré, nb d'affaires) alimentée chaque nuit, ou recalcul depuis l'historique d'étapes. **Démo** : semer ≥ 3 mois de points + une note « Scénario ».
- `pilotage.N2` — **Anneau de progression** de l'objectif. Front seul (données `objective.target/realised` existent).
- `pilotage.N3` — **Tuile « Profils disponibles — mobilisables ce mois »** dans la page d'arrivée de Pilotage. Front seul (la donnée est `overview.bench` de Staffing).
- `pilotage.N4` — **« Exporter la synthèse »** (fichier de synthèse de la page). Back : endpoint d'export de la synthèse Pilotage (format à décider ; l'export Finance CSV `finance-export.ts` ne couvre pas cette page). Démo : l'export doit sortir les données de démo, sans mention de fournisseur (doctrine).
- `pilotage.N5` — **Trois décisions rédigées avec leur « pourquoi »** en phrase. Front seul si le texte est gabarité depuis les sources de `DecisionStrip`/`InterventionsBlock` ; **back/IA** si c'est Laura qui rédige (coût crédits à annoncer, GA-51). À décider.
- `pilotage.N6` — **Pill « Octobre 2026 »** : sélecteur de période du mois (le Cockpit n'a que la fenêtre 7 j fixe de `WeekDeltaStrip`). Front seul pour l'affichage ; back si la période devient navigable (mois précédents) — `objective` accepte déjà un mois.

### Liste 3 — ABSENTES CHEZ THÉO (à poser à Louis)

- `pilotage.A0` — **Les sous-routes Pilotage elles-mêmes (Cockpit / Pipe / Staffing / Finance / REX)**, décision Louis 14/10. Théo les fond en une page. _Proposition_ : garder les 4 routes et faire de la page Théo le **nouveau Cockpit** (R1-R6), les 3 autres devenant des pages de détail ouvertes depuis les tuiles. _Question_ : (a) cette proposition · (b) une seule page, le détail part dans Missions/Affaires/Talents · (c) autre.
- `pilotage.A1` — **La chaîne commerciale à huit maillons** (`ChainCompact.tsx:17`, `ChainStrip.tsx:32`, glossaire `MaillonGlossary`, « Calculé sur N maillons / non mesuré ») — le cœur du Cockpit actuel (annexe méthodo p24). _Proposition_ : bloc replié « La chaîne » sous la page Théo, avec la pastille d'alertes. _Question_ : (a) garder en bloc replié · (b) onglet « Chaîne » · (c) retirer.
- `pilotage.A2` — **Diagnostic du maillon faible** (`WeakestLinkDiagnosisSection.tsx:11`). _Proposition_ : avec A1. (a) · (b) · (c).
- `pilotage.A3` — **« Données à compléter »** (`DataToComplete.tsx:44`, contrôles d'hygiène, Louis 14/10 L0a). _Proposition_ : une 4ᵉ carte de décision quand non vide. (a)(b)(c).
- `pilotage.A4` — **File d'arbitrage « Détail »** (`InterventionsBlock.tsx:48`, décisions ouvertes classées par gravité, assignables). Théo n'a que 3 cartes. _Proposition_ : « Voir toutes les décisions » sous les trois cartes. (a)(b)(c).
- `pilotage.A5` — **Bande « Ce qui a bougé »** : 7 compteurs (créées, avancées, reculées, perdues, signées, missions qui finissent, encaissé) avec listes dépliables et liens « affaires perdues » / « REX » (`WeekDeltaStrip.tsx:51`). _Proposition_ : la garder sous les 4 tuiles. (a) · (c).
- `pilotage.A6` — **Couverture du pipe et rythme attendu** (× N ; X € par jour ouvré) (`MonthObjectiveBlock.tsx`). _Proposition_ : sous l'anneau, en ligne secondaire. (a)(c).
- `pilotage.A7` — **Impact mesurable du copilote** (comptes ouverts via Découvrir, besoins détectés par signal, positionnements issus d'un matching, missions signées — 3 natures d'attribution) (`ContributionPanel.tsx:63`). _Proposition_ : bloc « Détail ». (a)(c).
- `pilotage.A8` — **« Ce qui fonctionne le mieux chez toi »** (boucle d'apprentissage, 3 patterns max) (`WorkspaceLearningPanel.tsx:83`). (a)(c).
- `pilotage.A9` — **Gouvernance rang 2 (partenaires)** (`PartnerGovernancePanel.tsx:21`) et **matrice intérêt × pénétrabilité du portefeuille** (`InterestPenetrabilityPortfolioPanel.tsx:33`). (a)(c) chacune.
- `pilotage.A10` — **Synthèse des automatisations** (`PlaybooksSummary.tsx:30`). _Proposition_ : un lien vers Réglages › Routines suffit (GA-26 : la configuration y vit déjà). (a)(c).
- `pilotage.A11` — **Onglet Pipe** : **CA probable du trimestre** `ProbableQuarterPanel.tsx:16` (probabilité/CA probable — autorisés DANS Pilotage seulement, renversement Louis 11/10), **traceur des besoins ouverts** `PipeNeedsTracker.tsx:21`, **opportunités ouvertes en édition en place** `PipeInspection.tsx:30`, **par commercial** `PipeByOwner.tsx:20`, **pipeline du CRM connecté** `CrmPipelinePanel.tsx:68`, chaînes `ChainsPage`. Théo n'en montre aucun. _Proposition_ : conserver la route `/pilotage/pipe` telle quelle, ouverte depuis la tuile « Pipe ouvert ». (a) · (c) par bloc ; **la probabilité ne peut vivre qu'ici**.
- `pilotage.A12` — **Onglet Staffing** : capacité vs demande sur 12 semaines, intercontrat, fins de mission à 30/60/90 j, TACE, expertises manquantes (`StaffingScreen.tsx:33`). Théo ne garde que la tuile « Profils disponibles » et la carte « Anticiper une fin de mission ». _Proposition_ : conserver `/pilotage/staffing`, ouvert depuis la tuile N3. (a)(b : vers Talents/Missions)(c).
- `pilotage.A13` — **Onglet Finance** : 5 lectures CA / prévisionnel / capacité / marge / DSO, marge par canal, taux de réalisation, apporteurs d'affaires, relevés d'activité, ADV, CA par mission et par client, encaissements à traiter par client, bons de commande, horizons « du carnet au cash », outil de gestion, filtre par société juridique, export (`FinanceScreen.tsx:238` + 18 composants `finance/`). Théo ne montre que 3 montants. _Proposition_ : conserver `/pilotage/finance` ouvert depuis la carte R5. (a)(c).
- `pilotage.A14` — **Retours d'expérience (REX)** et règles apprises des pertes (`RexScreen.tsx:52`). `PilotagePage.tsx` précise que le REX « vit dans Missions » (D40, 14/10) alors que la route `/pilotage/rex` existe encore. _Question_ : (a) garder la route · (b) la ranger dans Missions · (c) retirer.
- `pilotage.A15` — **« Demander à Laura quoi corriger »** (`AskLaura`, question pré-remplie) sur Pilotage. Théo n'a pas de lien Laura sur cette page. (a)(c).
- `pilotage.A16` — **Ordre des blocs selon le rôle** (`cockpit-block-order.ts:28`) : dirigeant → objectif d'abord, manager → décisions d'abord (doctrine : le rôle change l'ORDRE, jamais le CONTENU, `c76`). La page Théo a un ordre unique. _Proposition_ : conserver le réordonnancement. (a)(c).

### Éléments Théo qui heurtent une règle

- Aucune probabilité chez Théo ✔ (T8). « 0 € » n'apparaît pas ici ; voir `team-business` pour « 0 € signés » de Maëva (GA-18/19).
- Le texte « Les montants ne sont pas une prévision d'encaissement » est cohérent avec la doctrine.
- Constat T1 : une page unique remplace une décision explicite de Louis (14/10) → rien ne doit être codé avant sa réponse à `pilotage.A0`.

---

## 2. `team-vue` — Équipe › Vue d'ensemble

**Théo `#/team`** (« Équipe. Le cap commercial, les dossiers et les décisions de chacun. ») → **produit `/team/`** : `routes/team/index.tsx:15` (`TeamRoute`, redirige vers `/settings/team` si l'espace a moins de 2 membres) → `features/manager/view/ManagerDashboardPage.tsx:111`. ⚠️ **Écran refondu par Louis le 14/10 (#4158 L7, pyramide inversée)** : tout le tableau ci-dessous est une proposition de rapprochement, **rien ne doit être modifié sans décision de Louis**.

Ce que montre Théo : bandeau d'onglets (Vue d'ensemble · Objectifs & affaires · Plans & actions [badge 9] · Recherches · Activité & échanges · Administration) · identité « Théo · Direction » + « Préparer le point d'équipe » · liens « Journée de Théo / Journée de Maëva » · filtres « Portée : Toute l'équipe » et « Objectifs : Octobre 2026 » + « État local · scénario du 19 oct. » + « Actualiser » · « Le cap d'octobre » (71 k€ / 150 k€, 47 %) · « Là où tu peux aider — 3 priorités » (Le point de Laura) · 4 compteurs (Actions à faire 9 dont 1 en retard · Affaires à suivre 7 « le détail, pas un score de productivité » · Recherches disponibles 5 · Sujets partagés 1) · « Le potentiel à convertir » (417 k€ par étape, montants non pondérés) · « Qui porte quoi » (2 cartes portefeuille, « sans classement des personnes ») · « Le regard de Laura » · « Derniers mouvements ».

### Liste 1 — REDESSIN

- `team-vue.R1` — En-tête `BoardHeader` (`ManagerDashboardPage.tsx:265` : nom de l'ESN, avatars des membres, période 7/30/90 j dans l'URL `?periode=`, « Préparer ma revue d'équipe » vers Laura, « Gérer les membres ») → « Équipe. » + chip de rôle « Théo · Direction » + « Préparer le point d'équipe » (parcours en 3 étapes, voir `team-review`). La période 7/30/90 j devient un sélecteur de **mois** (« Octobre 2026 »).
- `team-vue.R2` — « À traiter » (`ArbitrationQueue.tsx:67`, une carte = un sujet + un bouton, triées par urgence : retards, doublons de comptes, collègues qui attendent la description de l'ESN, comptes sans responsable, en veille, périmètres non couverts, invitations) → « Là où tu peux aider · 3 priorités » : trois cartes à trois verbes (Replanifier · Revoir la suite · Créer la prochaine action) et un lien « Pourquoi » dépliant la raison.
- `team-vue.R3` — « Pouls de l'équipe » (`TeamPulse.tsx:41` : analyses lancées, actions terminées, RDV obtenus déclarés, comptes actifs, besoins ouverts — vs période précédente) → quatre compteurs de stock sans comparaison (Actions à faire · Affaires à suivre · Recherches disponibles · Sujets partagés).
- `team-vue.R4` — « Par commercial » (`RepsBoard.tsx:48`, tableau 6 colonnes triées par NOM : membre, portefeuille, actions ouvertes, dont en retard, activité sur la période, dernier passage) → « Qui porte quoi » : une **carte par personne** (comptes, affaires, actions ouvertes, en retard, signé sur cible). La colonne « Dernier passage » n'existe plus chez Théo.
- `team-vue.R5` — « Revue de pipeline » + objectifs (`PipelineReview.tsx:27`, `ObjectivesPanel.tsx:27`) → « Le cap d'octobre » (anneau) + « Le potentiel à convertir » (417 k€ réparti sur 4 étapes avec montant et nombre). Les affaires « sans prochaine étape / sans activité / bloquées » du produit deviennent la carte « Une affaire sans action datée » dans les priorités.
- `team-vue.R6` — « Activité de l'équipe » (`RecentActivityFeed.tsx:26`, fil de la période, filtre par membre) → « Derniers mouvements » : 3 lignes avec lien « Tout voir » (vers `team-activite`).
- `team-vue.R7` — Coaching (`CoachingPanel.tsx:28`, faits datés, jamais de score) ↔ « Le regard de Laura / Lecture du scénario / Commence par lever le blocage » : même idée (une phrase de conduite), mais **rédigée par Laura** chez Théo, calculée chez nous.

### Liste 2 — FEATURES NEUVES

- `team-vue.N1` — **Onglets d'espace Équipe** (6) : Vue d'ensemble · Objectifs & affaires · Plans & actions · Recherches · Activité & échanges · Administration. Front pour la barre ; chaque onglet est un écran (voir `team-business`, `team-plans`, `team-recherches`, `team-activite`, `team-admin`).
- `team-vue.N2` — **Filtre « Portée : Toute l'équipe »** (restreindre tous les onglets à une personne ou à un périmètre ; « les filtres ne changent pas le rôle connecté »). Front + back : `manager/team-stats` n'accepte qu'une période — un paramètre `member`/`business_unit` à ajouter. Démo : 2 membres + 1 périmètre.
- `team-vue.N3` — **« Journée de Théo / Journée de Maëva »** : ouvrir la page « Ma journée » d'un collègue. Back : lecture de la journée d'un autre membre sous droit `team:view-day` à créer ; **doctrine : la journée d'un collègue contient son agenda et ses brouillons — Théo écrit « voir son activité ne permet pas de lire sa messagerie privée »** : à trancher (T9).
- `team-vue.N4` — **« Sujets partagés » (compteur d'échanges ouverts à résoudre)** : front seul si le compteur lit `TeamCommentsPanel` (commentaires d'équipe existants) ; **back** si « résolu / à discuter / @mention » doit exister (statut + mention) — voir `team-activite`.
- `team-vue.N5` — **« Recherches disponibles » (5)** : compteur des recherches conservées de l'équipe ; back si `search/history` n'est pas ouvert à l'équipe (voir `team-recherches`).
- `team-vue.N6` — **Pastille « État local · scénario du 19 oct. » + « Actualiser »** : de l'état de démonstration, à ne pas construire (front de maquette).
- `team-vue.N7` — **« Le regard de Laura » rédigé** (lecture + CTA « Préparer les arbitrages »). Back/IA si rédigé par le modèle (coût crédits, GA-51), front seul si gabarité depuis `ArbitrationQueue`.

### Liste 3 — ABSENTES CHEZ THÉO

- `team-vue.A1` — **Sélecteur de période 7/30/90 jours** de la page entière (`ManagerDashboardPage.tsx:265`, `?periode=`). _Proposition_ : le garder à côté du sélecteur de mois. (a)(c).
- `team-vue.A2` — **Cartes « À traiter » de nature structurelle** : comptes **travaillés en double** par deux commerciaux, comptes sans responsable, périmètres que personne ne couvre, comptes en veille, invitations en attente, collègue qui attend que tu décrives l'ESN (`ArbitrationQueue.tsx:67`). Théo n'en garde que 3 sujets d'affaires/missions. _Proposition_ : les ajouter dans « Là où tu peux aider », au-delà de 3. (a)(c).
- `team-vue.A3` — **Staffing de l'équipe** : besoins ouverts face aux consultants disponibles + « Qui couvre quoi » + carte de couverture des comptes par segment (`ManagerDashboardPage.tsx:350`, `CoverageMapCard` `:560`, `UnassignedQueue` `:661`). _Proposition_ : bloc dans « Vue d'ensemble ». (a)(c).
- `team-vue.A4` — **« Détail et historique » repliés** (`ManagerDashboardPage.tsx`, `board.details`) : Adoption (playbooks `PlaybooksCard.tsx:18`, routines `TeamRoutinesPanel.tsx:18`, rituels `RitualsPanel.tsx:32`, commentaires `TeamCommentsPanel.tsx:16`, totaux comptes/contacts/e-mails, crédits & usage IA `CreditsUsageCard.tsx:19`) + hygiène des missions + contacts à traiter. _Proposition_ : (a) bloc replié en bas · (b) crédits & usage IA → Réglages › Crédits · (c) retirer. Question séparée par bloc.
- `team-vue.A5` — **Coaching par fait daté** (`CoachingPanel.tsx:28`) si Laura ne rédige pas « le regard ». (a)(c).
- `team-vue.A6` — **Ouverture du portefeuille d'un commercial depuis la table** (tiroir « Portefeuille de {nom} », `RepsBoard.tsx`). Chez Théo c'est la page `#/team/member/:id` (voir `team-member`). Aucun écart de fond.
- `team-vue.A7` — **Redirection solo → Réglages › Équipe** (`routes/team/index.tsx:26`, #4158.10) : un espace à un seul membre n'a pas de cockpit d'équipe. Théo n'a pas d'état « espace solo ». _Proposition_ : conserver. (a)(c).
- `team-vue.A8` — **Plan requis** (`PlanFeatureRoute feature="manager_cockpit"`) : écran verrouillé selon l'offre. Théo n'en montre aucun. _Proposition_ : conserver. (a)(c).

### Éléments Théo qui heurtent une règle

- « Journée de Maëva » (N3) : voir la journée d'un autre membre ≈ lecture de sa personne ; à rapprocher de « le rôle change l'ORDRE, jamais le CONTENU » et de la ligne T9. Théo la tempère lui-même (« ne permet pas de lire sa messagerie privée »).
- « Le détail, pas un score de productivité » : conforme au commentaire du code (`ArbitrationQueue` n'a « aucune carte charge déséquilibrée »).

---

## 3. `team-business` — Équipe › Objectifs & affaires

**Théo `#/team/business`** (+ `#/team/business/affaires`, `#/team/business/portefeuilles`) → **produit** : pas de route dédiée. Les contenus sont dans `/team/` : objectifs `features/manager/view/cockpit/ObjectivesPanel.tsx:27` (intégré à `PipelineReview.tsx:27`), pipeline `PipelineReview`/`PipelineValueCard`, portefeuilles `RepsBoard.tsx:48` + `UnassignedQueue` (`ManagerDashboardPage.tsx:661`).

Ce que montre Théo : sous-onglets **Objectifs du mois · Revue des affaires · Portefeuilles**. _Objectifs_ : cap (71/150 k€), bloc « Ne pas confondre » (01 le cap à signer · 02 les affaires gagnées · 03 le chiffre réellement encaissé, avec « Consulter les encaissements »), « Un objectif choisi, pas imposé en silence », carte par personne (signé, cible du mois, RDV obtenus 1/8, comptes ajoutés ce mois 6/4, « Ajuster mes objectifs » / « Proposer une cible » / « Les 7 axes »). _Revue des affaires_ : tableau de 7 affaires (affaire & compte, responsable, étape, montant estimé, prochaine décision + « Décision visée : date », bouton « Revoir »), « Comprendre les montants ». _Portefeuilles_ : 13 comptes avec responsable, prochaine action et bouton « Attribuer ».

### Liste 1 — REDESSIN

- `team-business.R1` — Objectifs : panneau `ObjectivesPanel.tsx:27` (« Objectifs de l'équipe : chaque commercial fixe sa cible du mois ») → onglet complet « Objectifs du mois » avec cap + trois lectures à ne pas confondre.
- `team-business.R2` — Revue de pipeline (`PipelineReview.tsx:27`, affaires qui demandent un geste : sans prochaine étape, sans activité, bloquées) → tableau « Toutes les affaires ouvertes » avec colonne **prochaine décision + date visée** et bouton « Revoir ».
- `team-business.R3` — Attribution des comptes (`UnassignedQueue` `ManagerDashboardPage.tsx:661`, comptes sans responsable ; assignation `assign.*`) → onglet « Portefeuilles » : **13 comptes**, responsable, prochaine action, « Attribuer » ; message « Créer un compte et en porter la relation ne sont pas la même chose ».
- `team-business.R4` — « Pipeline valorisé » (`PipelineValueCard.tsx`) → sous-titre « Les mêmes affaires que dans le pipeline. Aucune probabilité de signature inventée. » (cohérent T8).

### Liste 2 — FEATURES NEUVES

- `team-business.N1` — **Bloc « Ne pas confondre »** (cap / gagnées / encaissé) : front seul.
- `team-business.N2` — **« Un objectif choisi, pas imposé en silence »** : une direction **propose** une cible à valider par le membre (« Proposer une cible » / « Ajuster mes objectifs »). Back : états proposé / accepté / refusé sur l'objectif + notification ; aujourd'hui chaque commercial fixe seul sa cible. Démo : une proposition en attente.
- `team-business.N3` — **« Les 7 axes »** par personne (lecture détaillée des 7 axes d'objectif). **Axes non définis dans le produit** : à demander à Théo ce que sont ces 7 axes (back à construire selon la réponse). Démo : à semer.
- `team-business.N4` — **Ratios par personne « RDV obtenus 1/8 » et « comptes ajoutés ce mois 6/4 »** : cibles de RDV et de comptes par personne. Back : deux cibles chiffrées de plus (aujourd'hui seul le CA est ciblé) ; **heurte T9** (mesure de la personne).
- `team-business.N5` — **« Décision visée : 28 oct. » / « Date de décision à préciser »** sur l'affaire : champ `decision_date`. Front seul si la date de signature prévue (`PipeInspection.tsx:30`) en tient lieu ; sinon back (colonne).
- `team-business.N6` — **« Comprendre les montants »** (aide chiffrée sur non pondéré / estimé). Front seul.
- `team-business.N7` — **Filtre « Tous les comptes »** + lien « Ouvrir Comptes ». Front seul.
- `team-business.N8` — **Affichage « 0 € signés » pour Maëva** : si la personne n'a aucune affaire gagnée c'est un zéro **mesuré**, pas absent (GA-18/19) : à confirmer que le calcul distingue « 0 mesuré » de « non mesuré ».

### Liste 3 — ABSENTES CHEZ THÉO

- `team-business.A1` — **Couverture du pipe et rythme requis** (× N ; X € par jour ouvré restant) du mois (`MonthObjectiveBlock.tsx:18`, `PipelineValueCard`). _Proposition_ : sous le cap. (a)(c).
- `team-business.A2` — **Pipeline valorisé par catégorie déclarée** et édition en place de la date de signature (`PipeInspection.tsx:30`). _Proposition_ : renvoyer vers `/pilotage/pipe` (A11 de `pilotage`). (a)(b)(c).
- `team-business.A3` — **Carte de couverture par segment / persona** (`CoverageMapCard` `ManagerDashboardPage.tsx:560`, personas MEDDIC). (a)(c).
- `team-business.A4` — **Actions d'affectation en masse / assistant d'attribution** des comptes sans responsable (`assign.*`, `ManagerDashboardPage.tsx:661`). Théo : un bouton « Attribuer » par ligne. (a)(c).
- `team-business.A5` — **Objectifs financiers par personne : atteinte mesurée sur des données réelles** (`objectives.subtitle`). Même donnée que Théo : pas d'écart de fond.

---

## 4. `team-plans` — Équipe › Plans & actions

**Théo `#/team/plans`** (« Du plan à l'action. Attribue, prépare et suis le travail, sans confondre tâche terminée et message envoyé. ») → **produit** : file partagée `features/manager/view/cockpit/SharedActionsQueue.tsx:24` (dans `/team`, « Actions à traiter (partagées) ») + page Actions de l'utilisateur (`routes/actions/`, domaine autre).

Ce que montre Théo : filtres d'état (À faire · En retard · Aujourd'hui · Déléguées · Terminées · Toutes), bouton « Créer une action », filtre « Tous les comptes », 3 modes d'affichage **Liste · Répartition · Semaine**, 9 actions (titre, compte, texte, responsable, échéance, « Préparer »), phrase « Le glisser-déposer propose un changement à confirmer. Tu peux aussi modifier chaque action au clavier. »

### Liste 1 — REDESSIN

- `team-plans.R1` — `SharedActionsQueue.tsx:24` (liste unique sous la table des commerciaux, actions ouvertes/en retard) → page complète avec **6 filtres d'état**.
- `team-plans.R2` — Création d'action depuis l'équipe (composeur `features/tasks/view/TaskComposer.tsx`) → bouton « Créer une action » de la page ; attribution déléguée visible (« Déléguées »).
- `team-plans.R3` — Bouton « Préparer » sur chaque action (ouvre la préparation du message, sans l'envoyer) ↔ cartes d'actions du produit avec CTA d'exécution (`features/actions`).

### Liste 2 — FEATURES NEUVES

- `team-plans.N1` — **Vue « Répartition »** (actions par personne) et **vue « Semaine »** (calendrier hebdo des échéances) : front seul pour l'affichage ; les actions ont déjà responsable + échéance.
- `team-plans.N2` — **Glisser-déposer** qui « propose un changement à confirmer » (re-attribution ou nouvelle date par drag). Front + back : mutation d'attribution/échéance avec confirmation ; accessibilité clavier obligatoire (garde GA-32/35).
- `team-plans.N3` — **Filtre « Déléguées »** (actions que j'ai confiées à un autre). Back : champ `delegated_by` sur la tâche si absent (le produit a `owner`/`assignee`, à vérifier). Démo : 2 actions déléguées.
- `team-plans.N4` — **Badge « 9 » sur l'onglet** : compteur ; front seul.

### Liste 3 — ABSENTES CHEZ THÉO

- `team-plans.A1` — **File d'actions partagées « à traiter »** avec assignation rapide à un autre membre (`SharedActionsQueue.tsx:24`, `currentUserId`). Équivalent chez Théo (« Déléguées »/attribuer) → pas de perte, à confirmer.
- `team-plans.A2` — **Historique des actions** (`features/action-history`) et **Action OS / séquences** (`features/action-os`) : ouvrables depuis l'équipe aujourd'hui. Chez Théo, seul un lien « Voir les automatisations » existe dans Règles d'équipe. _Proposition_ : renvoyer vers Actions (domaine autre). (a)(b)(c).

---

## 5. `team-member` — Équipe › Fiche d'un membre

**Théo `#/team/member/theo|maeva|louis`** (« Théo Haddad. Direction commerciale · Propriétaire · vue de son travail enregistré ») → **produit** : pas de route ; tiroir « Portefeuille de {nom} » dans `RepsBoard.tsx:48` (`board.reps.portfolioTitle`, `portfolioDescription`).

Ce que montre Théo : « Revenir à toute l'équipe », phrase de synthèse « Théo, au bon endroit. 8 comptes suivis · 4 affaires ouvertes · 5 prochaines actions », « Mes objectifs » / « Proposer un objectif » (signé 71 k€ sur 90 k€), « Plan de travail », « Les prochaines actions » (+ Créer une action), « Le portefeuille » (comptes avec prochaine action et « Attribuer »), « Les affaires en cours », « Le rôle dans l'équipe » (« Voir son activité ne permet pas de lire sa messagerie privée »), « Accès et intégrations ».

### Liste 1 — REDESSIN

- `team-member.R1` — Tiroir de portefeuille (liste de comptes + lien « Ouvrir la liste des comptes ») → **page entière** à 6 blocs.
- `team-member.R2` — Portefeuille : comptes avec bouton « Attribuer » par ligne (réaffecter) ↔ tiroir en lecture.

### Liste 2 — FEATURES NEUVES

- `team-member.N1` — **Route `/team/member/$id`** + les 5 blocs (objectifs, plan de travail, prochaines actions, affaires en cours, rôle). Front + back : endpoint `GET /manager/members/:id` (portefeuille + objectifs + actions + affaires), droits `team:view`. Démo : fiches Théo, Maëva, Louis.
- `team-member.N2` — **« Plan de travail »** (lien vers le plan d'actions de la personne). Voir `team-plans`.
- `team-member.N3` — **« Accès et intégrations » d'un membre** (quels outils ce membre a branchés) : **heurte la règle** « on nomme ce que l'espace a BRANCHÉ » (permis) mais expose les **outils d'une personne** : à valider (T9). Back : lecture des connecteurs par membre.
- `team-member.N4` — **Message de garde « Voir son activité ne permet pas de lire sa messagerie privée »** : texte seul, conforme à `c96` (le corps des messages ne sort pas).

### Liste 3 — ABSENTES CHEZ THÉO

- `team-member.A1` — **Colonnes « Activité (N j) » et « Dernier passage »** par membre (`RepsBoard.tsx:104`). Théo ne les montre pas. _Proposition_ : les retirer au profit de la fiche (ce serait aligné T9) ou les garder dans la table. (a)(c).
- `team-member.A2` — **Départ d'un membre / reprise du portefeuille** (`MemberOffboardingDialog.tsx:71`, `HandoverPlanSection` : « Ce qui change de main », répartir entre collègues). Chez Théo seul le bouton « Passation » existe sur la liste des membres (voir `team-admin`). (a)(b)(c).

---

## 6. `team-recherches` — Équipe › Recherches

**Théo `#/team/research`** (« Ne laisse pas une recherche dormir. ») → **produit** : aucune route. Les recherches vivent dans Découvrir (historique dans la barre latérale `features/discover/view/DiscoverSidebar.tsx`, pas de page d'équipe) et dans Analyser un compte (`routes/search/index.tsx`). Il n'existe pas de `/search/history` dans `origin/main`.

Ce que montre Théo : titre « 5 recherches conservées. À vous de choisir la suite. », filtres Toutes · Découverte · Analyses de compte, bouton « Nouvelle recherche », 5 cartes (type, date, intitulé, périmètre « Lyon · Banque / Assurance · Clients finaux · Neutre », nombre de comptes dans le résultat, actions ouvertes sur ces comptes, auteur, bouton « Examiner »). Phrase : « Une recherche n'est pas une affaire. Les comptes retenus et les actions restent reliés à leurs dossiers. »

### Liste 1 — REDESSIN

- `team-recherches.R1` — Historique des recherches Découvrir (barre latérale, par utilisateur) → **liste d'équipe** en cartes, avec auteur, résultats et actions liées.
- `team-recherches.R2` — Reprise d'une recherche (relancer le périmètre dans Découvrir) → bouton « Examiner ».

### Liste 2 — FEATURES NEUVES

- `team-recherches.N1` — **Page d'équipe des recherches** (découvertes + analyses de compte de tous les membres). Back : lecture d'équipe de l'historique (`discover` + `analysis`), avec droit de visibilité ; **doctrine « on collecte largement, tant que c'est propre » et RGPD : l'historique d'un collègue = donnée de personne** (T9).
- `team-recherches.N2` — **Compteurs « comptes dans le résultat » et « actions ouvertes sur ces comptes »** par recherche : back (jointure recherche → comptes → tâches). Démo : 5 recherches (SAP France, Data & BI Marseille, Banque & assurance Lyon, deux analyses).
- `team-recherches.N3` — **Filtre Toutes / Découverte / Analyses de compte**. Front seul.

### Liste 3 — ABSENTES CHEZ THÉO

- `team-recherches.A1` — **Analyses lancées / crédits débités** par recherche (coût annoncé avant chaque analyse, GA-51 ; « Reprendre » une analyse = 8 crédits). Théo n'affiche aucun coût. _Proposition_ : montrer le coût sur la carte. (a)(c).
- `team-recherches.A2` — **Lots d'analyses** (`features/analysis-batches`). (a)(c).

---

## 7. `team-activite` — Équipe › Activité & échanges

**Théo `#/team/activity`** (Journal d'activité) et **`#/team/activity/discussions`** (Échanges d'équipe) → **produit** : fil `features/manager/view/cockpit/RecentActivityFeed.tsx:26` et commentaires d'équipe `TeamCommentsPanel.tsx:16` (dans `/team/`), journal d'administration `features/team/view/ActivityLogView.tsx:98` (`routes/settings/activity.tsx:9`).

Ce que montre Théo : _Journal_ — « Tous les faits enregistrés · 30 derniers jours · 9 événements accessibles · Exporter cette vue », 9 lignes datées (Recherche de comptes réalisée · Compte ajouté · Maëva demande une relecture · **Analyse de compte consultée** · Entretien de qualification convenu · Rendez-vous de cadrage obtenu) avec auteur, compte lié et lien « Voir la recherche ». _Échanges_ — « Les sujets ouverts », « Partager un point », fil de sujets (auteur, date, étiquette « À discuter », @mention d'un collègue, compte lié, Répondre, Marquer résolu).

### Liste 1 — REDESSIN

- `team-activite.R1` — Fil de la période (`RecentActivityFeed.tsx:26`, filtre « Toute l'équipe » ou un membre, N plus récents) → **page** « Journal d'activité » avec fenêtre 30 jours, compteur et export.
- `team-activite.R2` — Commentaires d'équipe (`TeamCommentsPanel.tsx:16`, un champ de texte + fil, auteur et horodatage) → onglet « Échanges d'équipe » : sujets structurés (étiquette, compte lié).
- `team-activite.R3` — Journal d'administration (invitations, rôles — `board.activity.adminJournal`, `ActivityLogView`) → hors de cet écran chez Théo (voir `settings-outils`, « Journal d'activité »).

### Liste 2 — FEATURES NEUVES

- `team-activite.N1` — **Export de la vue** (« Exporter cette vue »). Back : export CSV du journal filtré ; contenu = faits métier uniquement.
- `team-activite.N2` — **Sujets d'équipe à état** : « À discuter » → « Résolu », **@mention**, lien vers un compte, « Répondre ». Back : table `team_threads` (sujet, statut, mention, `account_id`) + notification de mention. Aujourd'hui `TeamCommentsPanel` est un fil plat sans statut. Démo : 1 sujet ouvert (Maëva→Théo sur Hélios).
- `team-activite.N3` — **Fait « Maëva demande une relecture »** : événement métier « demande de relecture » rattaché à un compte. Back : type d'événement neuf.
- `team-activite.N4` — **Lignes « Analyse de compte consultée »** (qui a consulté quel compte) : **heurte la doctrine « l'analytique mesure le PRODUIT, jamais la personne »** (GA-240/241/264/266/267) — à écarter ou à confirmer par Louis. Je ne propose pas de le construire sans réponse.
- `team-activite.N5` — **Texte de garde « Pas de surveillance de présence »** : conforme à la ligne « Dernier passage » à reconsidérer (voir `team-member.A1`).

### Liste 3 — ABSENTES CHEZ THÉO

- `team-activite.A1` — **Filtre « par membre »** du fil (`board.activity.filter`). Chez Théo seul le filtre global « Portée ». (a)(c).
- `team-activite.A2` — **Journal d'administration** dans l'écran d'activité (lien `board.activity.adminJournal`). _Proposition_ : lien vers le journal des Réglages. (a)(c).
- `team-activite.A3` — **Playbooks / routines de l'équipe** (`PlaybooksCard.tsx:18`, `TeamRoutinesPanel.tsx:18`) : dernières exécutions, par membre. Théo : « Règles d'équipe » seulement. (a)(b)(c).

---

## 8. `team-review` — Équipe › Le point d'équipe (parcours en 3 étapes)

**Théo `#/team/review/1|2|3`** (« Le point d'équipe. Un court parcours pour transformer les constats en décisions. ») → **produit** : rituels d'équipe `features/pilotage/view/RitualsPanel.tsx:32` (§7 : ordre du jour, durée, participants ; replié dans « Adoption ») + bouton « Préparer ma revue d'équipe » vers Laura (`board.review.label`, question pré-remplie).

Ce que montre Théo : étape 1 « Les sujets » (« Que faut-il débloquer ensemble ? » 4 sujets à cocher : action à reprendre, affaire en négociation, affaire sans action datée, fin de mission à anticiper, « Un autre point à partager ») · étape 2 « Les décisions » (« Qui fait quoi, et pour quand ? » ; « Les actions existantes sont mises à jour, jamais dupliquées » ; option « Point sans nouvelle action ») · étape 3 « La relecture » (« Un compte rendu qui mène à l'action », « Aucun email ne sera envoyé et aucune affaire ne changera d'étape », bouton « Enregistrer les décisions »).

### Liste 1 — REDESSIN

- `team-review.R1` — « Préparer ma revue d'équipe » (un message à Laura) → **assistant en 3 écrans** (sujets → décisions → relecture) avec sortie en actions.
- `team-review.R2` — Rituels (`RitualsPanel.tsx:32`, ordre du jour/durée/points, composeur de tâche `composerFor`) → étape 2 « Qui fait quoi, pour quand » avec création/mise à jour d'actions.

### Liste 2 — FEATURES NEUVES

- `team-review.N1` — **Parcours point d'équipe 3 étapes** (route `/team/review/$step`). Front pour l'assistant ; back : persistance d'un **compte rendu de point** (décisions → tâches créées/mises à jour sans doublon), idempotent. Démo : le point préparé avec ses 4 sujets.
- `team-review.N2` — **Dédoublonnage « actions existantes mises à jour, jamais dupliquées »** : règle back (clé d'identité d'action par compte+libellé+responsable).
- `team-review.N3` — **« Point sans nouvelle action »** (commentaire partagé sans fabriquer de tâche) : back (note de point). Cohérent « un fait n'est pas une action ».

### Liste 3 — ABSENTES CHEZ THÉO

- `team-review.A1` — **Rituels paramétrables** (durée, participants, points, chiffres à ouvrir tirés de la vue Qualité — `RitualsPanel.tsx:18-30`). Théo : un seul rituel « point d'équipe ». _Proposition_ : un rituel = un modèle de point. (a)(c).
- `team-review.A2` — **Question pré-remplie à Laura** (`board.review.question`). Chez Théo « Préparer le point d'équipe » ouvre l'assistant, pas Laura. _Proposition_ : Laura pré-remplit l'étape 1. (a)(c).

---

## 9. `team-admin` — Équipe › Administration

**Théo `#/team/admin`**, `#/team/admin/rights`, `#/team/admin/rules` → **produit** : `routes/settings/team.tsx:9` → `features/team/view/TeamView.tsx:420` (Réglages › Équipe) ; règles d'équipe : `TeamPolicyCard.tsx:122`, `PortfolioVisibilityCard.tsx:35` ; routines : Réglages › Routines. Théo montre **les mêmes membres sous `#/settings/team`** (« Les mêmes membres, rôles et invitations que dans l'espace Équipe ») → **heurte GA-26 (T5)**.

Ce que montre Théo : _Membres & invitations_ — « 3 membres actifs · 5 places dans le scénario », « Préparer une invitation », lignes (nom, email, rôle Propriétaire/Commercial/Administrateur technique, « Accès actif · démo », boutons **Rôle** et **Passation**), « Invitations préparées — Aucun email réel ». _Droits & visibilité_ — matrice 5 profils × 4 colonnes (Pilotage collectif · Gestion des membres · Finance globale · Conversations privées « Pas de nouvel accès »), « Visibilité du portefeuille » + « Essayer une autre vue », « Les messages restent à leur place », « Mes intégrations ». _Règles d'équipe_ — plages de prospection, créneaux protégés, réunions par jour, objectif d'appels (tous « non définis »), « Modifier », « Un seul moteur d'action ».

### Liste 1 — REDESSIN

- `team-admin.R1` — Liste des membres + sièges + invitations (renvoyer/révoquer) (`TeamView.tsx:~380-440`) → onglet « Membres & invitations » avec **phrase de sièges « 3 actifs · 5 places »**.
- `team-admin.R2` — Droits propres par membre (`MemberPermissionsDialog.tsx:56`) → bouton **Rôle** sur la ligne + **matrice de droits lisible** (profil × capacité).
- `team-admin.R3` — Qui voit quels comptes (`PortfolioVisibilityCard.tsx:35`) → « Visibilité du portefeuille » + **« Essayer une autre vue »** (aperçu en tant que).
- `team-admin.R4` — Départ d'un membre (`MemberOffboardingDialog.tsx:71`, `HandoverPlanSection`) → bouton **Passation** sur la ligne du membre.
- `team-admin.R5` — Rôles (`manager.json` `roles` : Propriétaire, Admin, Sales Ops, Commercial, Admin technique, Membre, Lecture seule) → matrice à 5 profils (Direction/administration · Opérations commerciales · Commercial · Administrateur technique · Lecture seule) : **« Membre » et « Admin » disparaissent**, « Direction/administration » les remplace.

### Liste 2 — FEATURES NEUVES

- `team-admin.N1` — **Règles d'équipe : plages de prospection, créneaux protégés, réunions par jour, objectif d'appels** (4 réglages d'organisation du temps, « rien ne bloque l'agenda »). Back : table `team_working_rules` ; **cohabite mal avec le routage de routines** (`/settings/routines`, GA-26). Démo : 4 valeurs seedées ou « non défini » assumé.
- `team-admin.N2` — **Matrice de droits explicite** avec colonne « Conversations privées : pas de nouvel accès » (garde `c96`). Front seul pour l'affichage ; back si la matrice doit être éditable (aujourd'hui droits par membre).
- `team-admin.N3` — **« Essayer une autre vue »** (simuler la vue d'un autre rôle). Front + back : mode « aperçu en tant que » (distinct de `features/impersonation`, qui sert le support). À arbitrer.
- `team-admin.N4` — **Lien « Mes intégrations »** depuis les droits. Front seul.

### Liste 3 — ABSENTES CHEZ THÉO

- `team-admin.A1` — **Demandes d'accès** (`JoinRequestsSection.tsx:19`, « Demandes d'accès (N) », approuver/refuser). (a)(c).
- `team-admin.A2` — **Fusion d'espaces / espace personnel** (`WorkspaceMerge.tsx`, `PersonalSpaceMergeCard`) et **sélecteur d'espace** (`WorkspaceSwitcher.tsx`). (a)(c).
- `team-admin.A3` — **Partage des informations d'accessibilité avec la communauté** (`CommunitySharingCard.tsx:21`, « Base commune » c94, RGPD GA-43). _Proposition_ : à garder impérativement côté Réglages › Équipe (règle de partage). (a)(c).
- `team-admin.A4` — **Politique d'équipe** (`TeamPolicyCard.tsx:122`) et **marché de l'espace** (`MarketSelector.tsx`, ESN/second marché tome 4). (a)(c).
- `team-admin.A5` — **Plan de passation détaillé** : ce qui change de main, répartir entre plusieurs collègues, ce qui ne se transmet pas, qui reprend (`HandoverPlanSection.tsx`, `team.json handover.*`). Chez Théo juste un bouton. (a)(c).
- `team-admin.A6` — **Invitation avec rôle + expéditeur + renvoi/révocation** (envoi **réel** d'e-mail d'invitation, `invitations.resend/revoke`) ; Théo note « Aucun email réel » (maquette). Aucune action : écart de maquette.

---

## 10. `settings-prefs` — Réglages › Préférences (Affichage · Mon identité · Raccourcis)

**Théo `#/settings`** (aliases `#/settings/personal`, `#/settings/shortcuts`) → **produit `/settings/`** : `routes/settings/index.tsx:9` → `features/settings/view/PreferencesView.tsx:52` ; identité `routes/settings/profile/identity.tsx:9` → `features/profile/view/ProfileIdentityPage.tsx:73` ; raccourcis `routes/settings/shortcuts.tsx:18` → `features/shortcuts/view/ShortcutsSettingsView.tsx:56`.

Ce que montre Théo : titre « Vos préférences », 3 sous-onglets. _Affichage_ — Apparence (Clair/Sombre/Système, vignettes) · Densité (Confortable/Compacte) · Page de démarrage préférée (Ma journée · Laura · Signaux · Affaires · Vivier) · Langue & dates (langue de l'aperçu Français ; fuseau Europe/Paris/Brussels/Zurich/UTC, « proposé pour les nouvelles veilles »). _Mon identité_ — avatar, nom, rôle, « Prénom et nom », « Fonction », « Signature des nouvelles préparations ». _Raccourcis_ — table de 4 raccourcis (⌘K, Échap, Tab, Entrée). Navigation à gauche : 4 groupes (voir T4) + « Rechercher un réglage… » + « Revenir à Bellum ».

### Liste 1 — REDESSIN

- `settings-prefs.R1` — Thème (`PreferencesView.tsx:44-48`, Système/Clair/Sombre) → trois **vignettes** d'aperçu.
- `settings-prefs.R2` — « Vue par défaut » (`defaultViewTitle`, route d'atterrissage `landingRouteNow`) → « Page de démarrage préférée » (5 choix : Ma journée, Laura, Signaux, Affaires, Vivier).
- `settings-prefs.R3` — Langue (`languageTitle`) + fuseau (dans `ProfileIdentityPage.tsx:73`, `timezone`) → bloc unique « Langue & dates ».
- `settings-prefs.R4` — Identité (`ProfileIdentityPage.tsx:73`, sous Réglages › Profil) → sous-onglet « Mon identité » des Préférences.
- `settings-prefs.R5` — Raccourcis (page à part `shortcuts`, `pointerFineOnly`) → sous-onglet des Préférences.
- `settings-prefs.R6` — Navigation de réglages (`components/sidebar/items.settings.ts`, 2 sections) → 4 groupes avec **recherche d'un réglage**.

### Liste 2 — FEATURES NEUVES

- `settings-prefs.N1` — **Densité Confortable / Compacte**. Front : variable CSS globale + préférence dans `preferences-provider`. Contrainte : la cible tactile ≥ 44 px (GA-35) doit survivre à « Compacte ». Démo : sans objet.
- `settings-prefs.N2` — **« Rechercher un réglage… »**. Front seul (index des rubriques).
- `settings-prefs.N3` — **Signature des nouvelles préparations** (texte appliqué aux préparations de messages). À vérifier : `ProfileIdentityPage` porte-t-il déjà une signature ? Sinon back (colonne `profiles.signature`) ; doctrine : le copilote n'envoie jamais, le commercial envoie → pas de risque d'envoi.
- `settings-prefs.N4` — **Fuseau « proposé pour les nouvelles veilles »** (le fuseau alimente la création des veilles). Back : champ lu par `watchlist`.
- `settings-prefs.N5` — **Bouton « Enregistrer les modifications » + libellé « Modifications à enregistrer · sauvegarde locale »**. Aujourd'hui l'auto-enregistrement est la règle des Préférences ; un bouton explicite est un changement d'interaction à confirmer.

### Liste 3 — ABSENTES CHEZ THÉO

- `settings-prefs.A1` — **Affichage des noms** (`nameDisplayTitle`, prénom/nom). (a)(c).
- `settings-prefs.A2` — **Relancer le tutoriel de démarrage / la visite guidée / le scénario commercial** (`replayTutorialTitle`, `replayTourTitle`, `replayScenarioTitle`, `PreferencesView.tsx:144-175`). _Proposition_ : les mettre dans « Aide & signalements » (`settings-outils`). (a)(b)(c).
- `settings-prefs.A3` — **Envoi des commentaires** (« Saisie › `sendCommentTitle` », Entrée vs ⌘Entrée). (a)(c).
- `settings-prefs.A4` — **Taille du texte** (`fontSizeTitle`) et **curseur main** (`pointerTitle`). Théo remplace la taille du texte par la densité. _Question_ : garder la taille du texte (accessibilité) ? (a)(c) — l'échelle typo à plancher 12 px est une règle D80/GA-31.
- `settings-prefs.A5` — **Barre latérale personnalisable** (`sidebarTitle`, `SidebarCustomizeDialog.tsx`). (a)(c).
- `settings-prefs.A6` — **À propos : version web, version API, parité de release** (`PreferencesView.tsx:262-311`). Utile au support. (a)(b)(c).
- `settings-prefs.A7` — **Raccourcis réservés au pointeur fin** et table complète des raccourcis produit (`ShortcutsSettingsView.tsx:56`, bien plus que 4). Théo : 4 lignes seulement. (a)(c).

---

## 11. `settings-compte` — Réglages › Mon compte (Notifications · Sécurité · Mes données)

**Théo** `#/settings/notifications`, `#/settings/security`, `#/settings/mes-donnees` → **produit** : `routes/settings/notifications.tsx:23` → `features/settings/view/NotificationsView.tsx:169` ; `routes/settings/security.tsx:9` → `SecurityView.tsx:15` ; `routes/settings/mes-donnees.tsx:17` → `MyDataView.tsx:90` (+ `PrivacyView.tsx:18`).

Ce que montre Théo : _Notifications_ — 5 interrupteurs (Échéances et tâches · Réponses à mes échanges · Nouveaux signaux · Suivi des missions · Actualités produit), « Récapitulatif préféré » (quotidien/hebdo/aucun), « Plage de tranquillité », trois canaux (Dans Bellum « Aperçu » · Par email « Non connecté » · SMS et navigateur « Indisponible ici »). _Sécurité_ — session locale, mot de passe & 2FA « Service requis », sessions actives « Non consultées », accès aux données, « Personnes et rôles → Voir les accès », « Outils connectés → Voir les connecteurs », « Supprimer mes données ». _Mes données_ — export personnel (préférences, notes, mémoire), « Mes signaux ajoutés », export de l'espace (« Préparer l'export », rôles autorisés), « Retirer mes informations locales ».

### Liste 1 — REDESSIN

- `settings-compte.R1` — Notifications : cadences prédéfinies + 20 interrupteurs (`NotificationsView.tsx`, presets Urgent / Brief quotidien / Résumé hebdo / Personnalisé) → **5 familles + récapitulatif + canaux**. La granularité fine disparaît.
- `settings-compte.R2` — Sécurité : 2FA (activer/désactiver), sessions actives (`ActiveSessionsRow`), export, suppression du compte (`features/settings/components/security/`) → rubriques descriptives avec « Voir les accès » / « Voir les connecteurs » (liens vers `team-admin` et `settings-integrations`).
- `settings-compte.R3` — Données & exports : récapitulatif d'export + historique des exports + ce qu'on n'emporte pas + suppression d'espace (`MyDataView.tsx:90`) → **trois cartes** Export personnel / Export de l'espace / Retirer mes informations.

### Liste 2 — FEATURES NEUVES

- `settings-compte.N1` — **« Plage de tranquillité »** (créneau sans notification). Back : préférence `quiet_hours` lue par le dispatcher de notifications (introuvable aujourd'hui dans les réglages ; la notion existe côté `playbook` pour l'envoi, pas pour l'utilisateur). Démo : sans objet.
- `settings-compte.N2` — **Famille « Actualités produit »** et **« Suivi des missions »** regroupées. Front seul (mapping des interrupteurs existants).
- `settings-compte.N3` — **« Mes signaux ajoutés » (export dédié)** : export des signaux saisis par l'utilisateur. Back : filtre `created_by` à l'export.
- `settings-compte.N4` — **Cartes « canal indisponible » explicites** (email non connecté, SMS indisponible). Front seul.

### Liste 3 — ABSENTES CHEZ THÉO

- `settings-compte.A1` — **Double authentification : activer/désactiver** (`TwoFactorEnrollDialog`, `TwoFactorDisableDialog`) et **sessions actives avec révocation**. Théo les marque « Service requis ». _Proposition_ : garder les vraies actions en production ; Théo les montre en maquette. (a)(c).
- `settings-compte.A2` — **SMS d'alerte urgente (retrait) et notifications natives du navigateur** (`SmsChannelSection`, `BrowserChannelSection`). (a)(c).
- `settings-compte.A3` — **« Laura peut te parler en premier »**, signaux d'achat, rappels de relance, digest de veille, rendez-vous à préparer, fin de mission, réponse client, e-mail sur attribution/délégation/mention, digest du lundi d'équipe (`NotificationsView.tsx`). _Question_ : conserver les interrupteurs fins derrière « Personnalisé » ? (a)(c).
- `settings-compte.A4` — **Politique de confidentialité, registre des durées de conservation, droits** (`PrivacyView.tsx:18`, `privacyPage.*`) — exigence RGPD. _Proposition_ : à ne pas retirer ; place à définir chez Théo. (a)(b).
- `settings-compte.A5` — **Suppression du compte BellumAI et de l'espace** (`MyDataView` `sensitive.title`, `deletion.title`; `DeleteAccountDialog`). Théo : « Retirer mes données personnelles » (local). _Question_ : (a) garder la vraie suppression · (b) la ranger en Sécurité. (RGPD c67 : la seule exception à « on archive, on ne supprime pas ».)
- `settings-compte.A6` — **Historique des exports** et **récapitulatif avant téléchargement** (`exportHistory.title`, `recap.title`). (a)(c).

---

## 12. `settings-espace` — Réglages › Mon espace (Profil commercial · Périmètres & sociétés · Règles métier · Catalogues · Marque)

_(« Équipe & accès » est traité en `team-admin`, Théo l'affiche à deux endroits — T5.)_

**Théo** `#/settings/profile` (+ `/audit`), `#/settings/business-units`, `#/settings/legal-entities`, `#/settings/workspace-rules` (+ `/pipeline`, `/capacity`, `/reverse`, `/finance`), `#/settings/catalogues`, `#/settings/branding` → **produit** : `routes/settings/profile/index.tsx:9` → `features/profile/view/ProfilePage.tsx:25` (+ `$stage.tsx:13` `ProfileStagePage.tsx:81`, `context.tsx` `ProfileContextSubPage.tsx:23`, `audit.tsx:9` `commercial-audit/view/CommercialAuditScreen.tsx:56`) ; `business-units.tsx:18` → `business-units/view/BusinessUnitAdminView.tsx:31` ; `legal-entities.tsx:10` → `legal-entities/view/LegalEntitiesView.tsx:39` ; `workspace-rules.tsx:16` → `settings/view/WorkspaceRulesView.tsx:28` ; `pipeline.tsx:18` `PipelineSlaView.tsx:24` ; `commercial-load.tsx:15` `CommercialLoadSettingsView.tsx:53` ; `reverse-market.tsx:17` `ReverseMarketSettingsView.tsx:32` ; `finance.tsx:18` `FinanceSettingsView.tsx:42` ; `catalogues.tsx:10` `catalogues/view/CataloguesPage.tsx:25` ; `lexicon.tsx:10` `lexicon/view/LexiconPage.tsx:38` ; `branding.tsx:9` `settings/view/BrandingView.tsx:65`.

Ce que montre Théo : _Profil commercial_ — « Ton profil de travail », badge « Cadrage à valider », 7 thèmes avec avancement (1/6, 0/6…), « Voir mon audit », « Exporter mon cadrage », « Continuer le questionnaire ». _Périmètres_ — onglets Équipes & agences / Sociétés, tableau (zone, responsable, statut, Modifier/Archiver), « L'archivage conserve l'historique ». _Règles métier_ — 5 onglets Accès · Pipeline (durées cibles par étape en jours) · Charge (comptes en travail / besoins suivis par commercial) · Marché inversé (autoriser la préparation de sollicitations, volume max/semaine) · Marge (seuil d'alerte % du prix de vente HT). _Catalogues & vocabulaire_ — 4 onglets Motifs de perte · Comptes écartés · Non-staffabilité · Vocabulaire (+ « Compétences à rapprocher → Ouvrir le vivier »). _Marque & documents_ — Nom affiché, Signature proposée, Pied de document, aperçu.

### Liste 1 — REDESSIN

- `settings-espace.R1` — Profil : liste de sections éclatées (`ProfilePage.tsx:25` : identité, ESN, portefeuille d'offre, postes placés, personas cibles, mémoire de marché ESN, contextes de travail, mes périmètres, réponses à reconfigurer, sécurité, zone de danger) → **un seul cadrage à 7 thèmes** (compteur de réponses, 38 questions maximum) ; l'audit devient « Voir mon audit / Exporter mon cadrage ».
- `settings-espace.R2` — Périmètres (`business-units.tsx:18`) et Sociétés (`legal-entities.tsx:10`), deux routes → **une page à deux onglets**.
- `settings-espace.R3` — Règles métier : 5 routes séparées (`workspace-rules`, `pipeline`, `commercial-load`, `reverse-market`, `finance`) → **une page à 5 onglets** (Accès · Pipeline · Charge · Marché inversé · Marge). _Aucune feature perdue ici ; seulement du regroupement._
- `settings-espace.R4` — Catalogues (`CataloguesPage.tsx:25`, « Listes métier ») + Lexique (`LexiconPage.tsx:38`) → **une page à 4 onglets** dont « Vocabulaire ».
- `settings-espace.R5` — Marque (`BrandingView.tsx:65`) → « Marque & documents » recentrée sur les documents.

### Liste 2 — FEATURES NEUVES

- `settings-espace.N1` — **Statut « Cadrage à valider »** et validation explicite du cadrage (« Les modifications deviennent un nouveau cadrage seulement après validation »). Back : état `framing_status` (brouillon/validé) + versions du cadrage. Voir `onboarding-*`.
- `settings-espace.N2` — **« Exporter mon cadrage »** (JSON du cadrage) : back export.
- `settings-espace.N3` — **Onglet « Comptes écartés »** et **« Non-staffabilité »** (motifs) : à vérifier dans `CataloguesPage` (le produit a des motifs d'écart de compte et de non-staffabilité ? sinon back : deux catalogues + FK). Démo : 2 valeurs chacun.
- `settings-espace.N4` — **« Compétences à rapprocher »** (termes non reconnus → vocabulaire) : existe côté `catalogues.aliases.title` → écart nul si c'est le même objet.
- `settings-espace.N5` — **Pied de document + signature proposée par espace** (documents générés : dossiers de compétences). Back : colonnes `workspace_documents_footer/signature`; la génération de dossier doit les lire.
- `settings-espace.N6` — **« Durées cibles par étape en jours »** (4 champs). Équivalent de `PipelineSlaView` : écart nul si ce sont les mêmes seuils.

### Liste 3 — ABSENTES CHEZ THÉO

- `settings-espace.A1` — **Ne pas contacter (liste d'équipe)** (`routes/settings/do-not-contact.tsx:14` → `team-guardrails/components/DoNotContactView.tsx:18`) : entrée dédiée du menu aujourd'hui. Théo n'a aucune rubrique « Ne pas contacter ». _Proposition_ : onglet « Ne pas contacter » dans Règles métier › Accès. (a)(b)(c).
- `settings-espace.A2` — **Export du vivier** (`routes/settings/vivier-export.tsx:17` → `VivierExportView.tsx:19`). _Proposition_ : sous Imports (même famille), ou « Mes données ». (a)(b)(c).
- `settings-espace.A3` — **Grille de qualification d'espace** (`QualificationGridSection`, `workspace-rules.tsx`) et **garde-fous non négociables** (`GuardrailsCard.tsx`, `BetProfilesSection`, `ChatEvalSamplingSection`, `TalentQualityBlock`). _Proposition_ : onglet « Accès » ou nouvel onglet « Qualité ». (a)(c).
- `settings-espace.A4` — **Nom du copilote, logo, couleur d'accent, domaine personnalisé, adresse d'expédition** (`BrandingView.tsx`, `identity.*`, `domain.*`). Théo ne garde que nom affiché/signature/pied. **Note doctrine : « le copilote s'appelle Laura, partout » (D82)** — « Nom du copilote » contredit D82, sa disparition chez Théo est cohérente. _Question_ : (a) garder logo/couleur/domaine (marque blanche) · (c) retirer le nom du copilote seul.
- `settings-espace.A5` — **Contextes de travail, personas cibles, postes placés, portefeuille d'offre, mémoire de marché ESN** (`WorkContextsSection`, `TargetPersonasSection`, `PlacedRolesSection`, `OfferPortfolioSection`, `EsnMarketMemorySection`). Le « cadrage 7 thèmes » de Théo ne les nomme pas. _Question_ : sont-ils couverts par les 38 questions ? sinon où vivent-ils ? (a)(b)(c).
- `settings-espace.A6` — **Zone de danger du profil** (`DangerZoneSection`) et **reconfigurer mes réponses** (`ReconfigureAnswersSection`). (a)(c).
- `settings-espace.A7` — **« Mes périmètres » (BU de l'utilisateur)** (`MyBusinessUnitsSection`, `OnboardingBusinessUnitStep`). (a)(c).
- `settings-espace.A8` — **Lexique : « mots à ne jamais lire » et ce que le lexique ne change pas** (`LexiconPage.tsx:38`). Théo : « Vocabulaire » sans interdits. (a)(c).
- `settings-espace.A9` — **Archive des sociétés/périmètres** : OK dans les deux. Pas d'écart.

---

## 13. `settings-laura` — Réglages › Laura (Comportement · Mémoire · Documents & références · Routines & veilles)

**Théo** `#/settings/laura-mode`, `#/settings/memory`, `#/settings/knowledge`, `#/settings/routines` → **produit** : `routes/settings/laura-mode.tsx:15` → `LauraModeSettingsView.tsx:26` ; `memory.tsx:12` → `features/memory/view/MemoryLedgerView.tsx:105` ; `knowledge.tsx:22` ; `routines.tsx:11` → `features/routines/view/RoutinesView.tsx:46` (+ `routines_.$key.tsx:17` → `RoutineDetailPage.tsx:28`).

Ce que montre Théo : _Comportement_ — Personnalisation par défaut (Neutre / Mon activité), Profondeur (Auto / Rapide / Approfondi), « Recherche et préparation : Préparation », « Envois et écritures externes : Validation requise », « Voir la mémoire ». _Mémoire_ — « Ce que vous avez choisi de conserver », « Ajouter un élément », liste vide « Une mémoire choisie, pas un historique caché ». _Documents & références_ — « Ajouter un document », table Document / Usage / Accès / État (« Texte local disponible · Pas indexé par une IA »), « Consulter ». _Routines & veilles_ — « Ouvrir avec Laura », veilles (renvoi vers Signaux), automatisations existantes (renvoi vers la règle), plages et objectifs (renvoi vers Règles d'équipe).

### Liste 1 — REDESSIN

- `settings-laura.R1` — « Laura — mode par défaut » (`LauraModeSettingsView.tsx:26`, mode de contexte d'une conversation neuve) → deux blocs « Contexte et profondeur » et « Actions et autorisations ».
- `settings-laura.R2` — Mémoire (`MemoryLedgerView.tsx:105` : comment Laura te répond, ton approche dans tes messages, ton temps protégé, tes préférences d'agenda, ce qu'elle ne mémorise jamais, tout oublier) → liste simple d'éléments ajoutés/retirés.
- `settings-laura.R3` — Documents (`knowledge.tsx:22`, documents + styles appris + bibliothèque de messages) → table de documents avec **état d'indexation honnête** (reçu ≠ exploitable ≠ indexé).
- `settings-laura.R4` — Routines (`RoutinesView.tsx:46`, « Ce que Laura fait pour toi, sans que tu le demandes ») → page « Toutes tes automatisations, au même endroit » avec renvois (veilles → Signaux, règles d'équipe → Équipe).

### Liste 2 — FEATURES NEUVES

- `settings-laura.N1` — **Profondeur par défaut Auto / Rapide / Approfondi.** Back : préférence lue par le routage de modèle de l'agent (coût en crédits, GA-51). Démo : sans objet.
- `settings-laura.N2` — **Matrice « Recherche et préparation » vs « Envois et écritures externes »** en lecture : le principe « le copilote n'envoie jamais » rendu visible. Front seul (le comportement est déjà garanti).
- `settings-laura.N3` — **Ajouter un élément de mémoire à la main** (texte libre / préférence). Back : écriture dans le registre de mémoire (aujourd'hui alimenté par le produit).
- `settings-laura.N4` — **« Ouvrir avec Laura » sur les routines** (décrire un suivi à Laura pour créer la routine). Back : tool de création de routine par Laura (déjà `chat-commands`? à vérifier).
- `settings-laura.N5` — **États d'indexation par document** (« Texte local disponible », « Pas indexé par une IA »). Back : colonne `ingestion_state` (reçu/extrait/indexé).

### Liste 3 — ABSENTES CHEZ THÉO

- `settings-laura.A1` — **Styles appris, règles proposées, comparaison des couches, ce que tes messages ont appris à Laura** (`knowledge.json style.*`). (a)(c).
- `settings-laura.A2` — **Bibliothèque d'exemples de messages** (affirmations/faits à vérifier avant de proposer un exemple — `messageLibrary.*`). (a)(c).
- `settings-laura.A3` — **« Tout oublier »** (`memoryLedger.forgetAll`) et **« Ce que Laura ne mémorise jamais »**. _Proposition_ : à garder (confiance). (a)(c).
- `settings-laura.A4` — **Détail d'une routine** (`RoutineDetailPage.tsx:28` : configuration, conditions d'activation) + **autonomie des actions de l'espace** (`routines.json approvalSettings`). Chez Théo : renvois sans détail. (a)(c).
- `settings-laura.A5` — **Catalogue de ce que Laura propose** (`LauraCataloguePanel` dans Notifications). (a)(c).

---

## 14. `settings-outils` — Réglages › Outils & administration (Imports · Assistants/MCP · Crédits · Journal · Aide)

**Théo** `#/settings/import`, `#/settings/mcp`, `#/settings/billing`, `#/settings/activity`, `#/settings/mes-signalements` → **produit** : `routes/settings/import.tsx:19` ; `mcp.tsx:9` → `AiAssistantView.tsx:343` ; **`routes/billing/index.tsx:19` → `features/billing/view/Billing.tsx`** (hors `/settings`) ; `activity.tsx:9` → `team/view/ActivityLogView.tsx:98` ; `mes-signalements.tsx:16` → `feedback/MyReportsView.tsx:47`.

Ce que montre Théo : _Imports_ — Vivier/consultants (texte ou CSV, aperçu, doublons), « Depuis un outil connecté », « Ce qui sera vérifié » (correspondance des champs, doublons et corrections, historique) ; _Accès assistants / MCP_ — « Aucun accès distant actif », serveur/authentification, lecture et préparation, écritures sensibles « Validation requise », formulaire « Cadre d'un accès futur » (nom, périmètre, lecture seule) ; _Crédits & abonnement_ — abonnement, crédits disponibles, enrichissements et analyses (« Simulation uniquement »), historique d'usage — **tous « non connectés »** ; _Journal d'activité_ — vide ; _Aide & signalements_ — préparer un signalement, raccourcis, mes données, mes signalements.

### Liste 1 — REDESSIN

- `settings-outils.R1` — Imports (`import.tsx:19` + `features/universal-import`, `crm-import`) → page à 3 blocs : vivier, depuis un outil connecté, ce qui sera vérifié.
- `settings-outils.R2` — MCP (`AiAssistantView.tsx:343` : connecter l'assistant, guide pas à pas, exemples de demandes, applications autorisées, garde-fous non négociables) → carte d'état + formulaire « cadre d'un accès futur ».
- `settings-outils.R3` — Facturation `/billing` (plans, méthode de paiement, historique des factures, crédits, recharge, rentabilité) → « Crédits & abonnement » dans Réglages ; contenu **vide** chez Théo (maquette).
- `settings-outils.R4` — Journal d'activité (`ActivityLogView.tsx:98`, réservé aux gestionnaires) → même rubrique, état vide.
- `settings-outils.R5` — Signalements (`MyReportsView.tsx:47`) → « Aide & signalements » + raccourcis + données.

### Liste 2 — FEATURES NEUVES

- `settings-outils.N1` — **« Cadre d'un accès futur » (nom, périmètre « Mes dossiers » / « Dossiers partagés », lecture seule)** : intention de configuration MCP sans jeton. Back : table `mcp_access_intents` ou réutiliser `api-keys`. Démo : sans objet.
- `settings-outils.N2` — **Grille « Ce qui sera vérifié » (correspondance de champs, doublons, historique)** pour les imports. Front + back (rapprochement avant création : `universal-import` a-t-il déjà l'aperçu ? à confirmer).
- `settings-outils.N3` — **« Aide & signalements » regroupant raccourcis + mes données + signalements.** Front seul.
- `settings-outils.N4` — **Billing dans Réglages** (route `/settings/billing`) : redirection ou déplacement de `/billing` ; front (route) + garder les gardes d'accès.

### Liste 3 — ABSENTES CHEZ THÉO

- `settings-outils.A1` — **Plans, méthode de paiement, historique des factures, recharge de crédits, calculateur de rentabilité, crédits qui s'épuisent** (`features/billing/view/Billing.tsx`, `ProfitabilityCalculator.tsx`, `billing.json`). Théo montre un écran vide « non connecté ». _Question_ : confirmer que l'écran réel garde tout ce contenu sous la forme Théo. (a)(c). _Doctrine_ : le coût est annoncé avant chaque action (GA-51).
- `settings-outils.A2` — **Clés d'API** (`features/api-keys/components/ApiKeysCard.tsx:121`, aujourd'hui sous Intégrations) : absentes de Réglages › Outils. _Proposition_ : ranger sous « Accès assistants / MCP ». (a)(b)(c).
- `settings-outils.A3` — **Garde-fous non négociables de l'assistant** (`AiAssistantView.tsx` `guardrailsTitle`). (a)(c).
- `settings-outils.A4` — **Journal d'activité réel** (invitations, rôles, changements d'espace) — Théo montre l'état vide ; le tableau réel (filtres, export) est à préserver. (a)(c).

---

## 15. `settings-integrations` — Réglages › Connecteurs

**Théo `#/settings/integrations`** (+ `/review/:n` « Changements à relire », `/history` « Historique des échanges ») → **produit `/integrations/`** : `routes/integrations/index.tsx:23` → `features/integration-center/view/IntegrationCenterPage.tsx:39` (la route est **hors** `/settings` ; l'entrée « Intégrations » du menu Réglages pointe vers `/integrations`, `components/sidebar/items.settings.ts`).

Ce que montre Théo : titre « Vos outils, le même dossier — Choisir ce qui vient de chaque outil, relire les changements, retrouver leur résultat », bouton « Importer un fichier », 3 onglets **Connecteurs · À relire (0) · Historique**, bandeau « Parcours cibles et simulations locales. Aucun compte tiers connecté », **7 connecteurs** (BoondManager · HubSpot · Zoho CRM · Outlook · Google Workspace · Collective.work · « Facturation — outil à définir »), chacun avec catégorie, phrase d'usage, état « Non connecté » et « Voir le parcours » (fenêtre : périmètre de lecture · rapprochement sans doublon · écritures à relire · « Prévisualiser un exemple local »). Page « À relire » : « Comparer les informations avant de mettre à jour un dossier. Aucun "Tout approuver" aveugle. » Page « Historique » : « Les opérations du scénario, sans état de connexion inventé. »

### Liste 1 — REDESSIN

- `settings-integrations.R1` — Héros « {Bellum} peut aller plus loin avec tes données » (`IntegrationsHero.tsx:31`) + panneau « Recommandé pour démarrer » en 3 étapes (`StarterSteps.tsx:27` : messagerie+agenda → CRM → base documentaire) → phrase unique « Vos outils, le même dossier ».
- `settings-integrations.R2` — Catalogue **groupé par famille** (CRM · Messagerie/agenda/documents · Canaux d'équipe · Séquences · ATS/ERP · Téléphonie · Signature/facturation · Assistant IA · Clés d'API ; `IntegrationCenterPage.tsx:212`, ~21 cartes) → **grille plate de 7 cartes** nommées par outil.
- `settings-integrations.R3` — Carte de connecteur (`cards/CardShell.tsx` : état Opérationnel/Lecture seule/Écriture partielle/Autorisation expirée/Perturbé/Sans activité récente/Non branché/Non inclus ; diagnostics, périmètre de lecture `CrmReadScope.tsx`, dernière synchro, bénéfices) → carte courte + fenêtre « Voir le parcours » à 3 garanties.
- `settings-integrations.R4` — Import d'un fichier (`ImportEntryCard.tsx:20`, « Tu as déjà des fichiers ou un CRM ? ») → bouton « Importer un fichier » en haut à droite.
- `settings-integrations.R5` — Prévisualisation d'écriture CRM (`features/crm/view/CrmPushDialog.tsx`, porte d'écriture : auto-approuvé sur geste utilisateur, sinon prévisualisation figée) → onglet **« À relire »** (liste de changements à comparer avant mise à jour).
- `settings-integrations.R6` — Filtres Tous / Branchés / À brancher + recherche (`IntegrationCenterPage.tsx:164-187`) → aucun filtre chez Théo (7 cartes).

### Liste 2 — FEATURES NEUVES

- `settings-integrations.N1` — **Carte « Collective.work »** (signaux d'annonces, recherche de profils, publication de besoins, retours de candidatures — « trois usages distincts, périmètre à contractualiser »). **Aucun connecteur dans le produit** : seule la détection d'intermédiaire existe (`apps/ia/app/services/intermediation.py`, `routers/discover_signals.py`). Back : partenariat/API à contractualiser, trois flux. Démo : carte « non connecté » + 2-3 annonces fictives. _Doctrine_ : on nomme ce que l'espace a branché ; ici le nom est celui d'une plateforme du client → admis.
- `settings-integrations.N2` — **Carte « Facturation — outil à définir »** (« Transmettre un brouillon validé et récupérer la preuve du résultat. Ne pas reconstruire la comptabilité »). Existe partiellement : `admin_docs` (`AdminDocsCard`, signature/facturation) et `features/factoring`/`payments`. À rapprocher, pas à construire en double.
- `settings-integrations.N3` — **Onglet « À relire »** avec compteur (changements en attente par connecteur), **« Aucun "Tout approuver" aveugle »**. Back : file de changements entrants à arbitrer champ à champ (aujourd'hui l'écriture sort par `CrmPushDialog`, la **lecture entrante** n'a pas de file de relecture). Démo : 2-3 changements fictifs (champ avant/après).
- `settings-integrations.N4` — **Onglet « Historique des échanges »** (opérations réalisées, par connecteur). Back : journal d'échanges ; `ConnectorSyncStatus` donne la dernière synchro seulement.
- `settings-integrations.N5` — **« Prévisualiser un exemple local »** (tester la relecture sans toucher à un outil réel). Front de maquette ; à ne pas construire.
- `settings-integrations.N6` — **Garanties affichées par outil** : « Limiter à l'espace et aux objets autorisés. Ne pas partager les données entre ESN. » Texte seul, aligné sur `c94` (base commune anonymisée).

### Liste 3 — ABSENTES CHEZ THÉO

- `settings-integrations.A1` — **~14 autres connecteurs** : Salesforce, Pipedrive, Attio, Odoo, Microsoft 365 (carte propre), Notion, Slack, Discord, Teams, Google Chat, Mattermost, Beeper, Lemlist, ATS, Téléphonie, signature/documents admin, webhook générique, MCP (`cards/connector-card-map.ts`). Théo n'en montre que 7 (HubSpot, Zoho, Outlook/Google, BoondManager, Collective.work, facturation). _Question_ : (a) tous gardés sous « Tous les outils » · (b) seuls les 7 en tête, les autres dans « Autres » · (c) en retirer (lesquels ?). **Doctrine : ne pas retirer sans ta réponse.**
- `settings-integrations.A2` — **Statut de santé et réparation** : bouton « Tester », « Réparer », diagnostic d'échec, dernier succès, scopes accordés/manquants, latence, routines dépendantes (`ConnectorDiagnostics.tsx`, `integrationCenter.json` `testButton`, `repairButton`, `missingScope`, `dependentRoutines`). Théo : « Non connecté » seulement. (a)(c).
- `settings-integrations.A3` — **Première synchronisation guidée + aperçu + résumé** (`FirstSyncCta.tsx`, `SyncLaunchFlow.tsx`, `SyncLaunchPreview.tsx`, `SyncSummary.tsx`). (a)(c).
- `settings-integrations.A4` — **Ce que Laura lit** : les quatre sources commerciales (`LauraSourcesPanel.tsx:27`). (a)(c).
- `settings-integrations.A5` — **Notifications (« Comment souhaites-tu que Laura te prévienne ? »)** (`NotificationsEntryCard.tsx:20`). _Proposition_ : renvoi vers Mon compte › Notifications. (a)(b)(c).
- `settings-integrations.A6` — **Clés d'API** (`api-keys/components/ApiKeysCard.tsx:121`). Voir `settings-outils.A2`. (a)(b)(c).
- `settings-integrations.A7` — **Consentement préalable avant branchement** (`cards/PreConsent.tsx`, « ce que {Bellum} ne fera jamais »), **bénéfices** et **fonctionnalités bêta** (`ConnectorBenefits.tsx`). (a)(c).
- `settings-integrations.A8` — **Branchement réel** (OAuth Google/Microsoft, CRM, callback d'échec — `integrations/api.ts`, `lib/connector-callback-failure.ts`). Théo montre uniquement le parcours cible. Écart de maquette, pas d'action.

---

## 16. `onboarding-accueil` — Onboarding › Bienvenue · Pourquoi ces questions · Laura

**Théo `#/onboarding/welcome`**, `#/onboarding/how`, `#/onboarding/laura` → **produit** : `routes/onboarding/index.tsx:125` → `features/onboarding/view/OnboardingWelcomePage.tsx:67` (3 variantes : accès bêta déjà activé, retour de paiement, invité) ; `routes/onboarding/company.tsx:25` → `OnboardingCompanyPage.tsx:40` ; écran de fin `routes/welcome.tsx:48` → `features/welcome/view/WelcomeScreen.tsx:82`.

Ce que montre Théo : _Bienvenue_ — « Avant de commencer, parlons de ton activité. », 3 pastilles « 38 questions maximum · 7 étapes · Reprise à tout moment », boutons « Comprendre Bellum » / « Commencer les questions » / « Explorer un exemple (données fictives) », Laura « Théo, tu pourras corriger mes recommandations avant de commencer », frise « De ton contexte à l'action 01-03 » (ton terrain de jeu → un cadrage à relire → ton premier travail avec Laura), trois promesses Développement / Staffing / Suivi. _Pourquoi ces questions ?_ — 4 temps (tu poses le cadre → Bellum rapproche → tu examines → tu choisis la suite) + « Le même compte. Une approche différente. » _Laura travaille avec ton contexte_ — 4 exemples de demandes, « Un avis, des raisons. La décision te revient. », rappel « Un brouillon n'est pas un envoi. Un outil choisi n'est pas connecté. » Barre haute : « Un exemple », thème, « Quitter et reprendre plus tard ».

### Liste 1 — REDESSIN

- `onboarding-accueil.R1` — Accueil (`OnboardingWelcomePage.tsx:67`, « Configurons {Bellum} pour ton activité », schéma `OnboardingWelcomeDiagram`, 3 variantes) → héros « Avant de commencer, parlons de ton activité » + frise 01-03 ; plus de variante « invité » / « retour de paiement ».
- `onboarding-accueil.R2` — Aides de l'assistant (`OnboardingIntroCard`, `OnboardingHelpCard`, `OnboardingLauraGuide.tsx:57`) → écrans dédiés « Pourquoi ces questions ? » et « Laura travaille avec ton contexte ».
- `onboarding-accueil.R3` — Étape « Ton ESN » séparée (`OnboardingCompanyPage.tsx:40`, `/onboarding/company`) → absorbée par l'étape 1 « Ton activité ».
- `onboarding-accueil.R4` — Écran de fin `WelcomeScreen.tsx:82` (« Théo restitution p.8 ») → remplacé par la sortie « Valider et préparer mon premier échange » (voir `onboarding-relecture`).

### Liste 2 — FEATURES NEUVES

- `onboarding-accueil.N1` — **« Explorer un exemple »** (remplir le cadrage avec un profil fictif, bandeau « Exemple fictif · aucune réponse réelle n'a été effacée », « Revenir à mon cadrage »). Front + démo ; la sauvegarde de secours (`backup`) évite toute perte. À confirmer : un exemple de ce type fait entrer de la donnée fictive dans le profil → **heurte « JAMAIS de données fictives »** si l'exemple se fige en vrai profil. Il doit rester un état local jetable.
- `onboarding-accueil.N2` — **« Quitter et reprendre plus tard »** (bouton explicite vers Laura) et **« Reprise à tout moment »** : l'état est déjà sauvegardé (autosave `onboarding.autosave`) ; le bouton est front seul.
- `onboarding-accueil.N3` — **Écrans pédagogiques `how` et `laura`** : front seul (texte).
- `onboarding-accueil.N4` — **Barre haute minimaliste « Ton contexte, en clair »** : front seul.

### Liste 3 — ABSENTES CHEZ THÉO

- `onboarding-accueil.A1` — **Variantes d'accès** : « accès bêta déjà activé », « retour de paiement », **« invité chez {espace} par {nom} »**, et les cas **« en attente de l'administrateur »** (`AwaitingAdminBanner.tsx:17`, `awaiting-admin.ts`) et **profil hérité** (`InheritedProfileBanner`). Théo ne montre que le cas « nouvel utilisateur ». _Question_ : ces parcours (invité, paiement, attente admin) gardent-ils leur écran ? (a)(c).
- `onboarding-accueil.A2` — **Choix de l'offre / paiement** (`routes/onboarding/plan.tsx:41` → `OnboardingPlanPage.tsx:47`, 3 entrées : démo, offre, devis équipe ; ce que tu achètes ; prix par analyse). Théo n'a **aucun écran de plan**. _Question_ : où se fait le choix de plan avec le nouvel onboarding ? (a) avant l'onboarding · (b) après, depuis Réglages › Crédits · (c) retiré (modèle gratuit / bêta). **Décision de modèle économique, à ne pas résoudre en silence.**
- `onboarding-accueil.A3` — **Étape « Confidentialité »** (`OnboardingPrivacyStep.tsx:37`) et **choix du périmètre / BU** (`OnboardingBusinessUnitStep.tsx:39`, `BusinessUnitScopePath`). _Proposition_ : une question de plus dans « Tes outils & Laura » + une dans « Ton activité ». (a)(c).
- `onboarding-accueil.A4` — **Rejoindre un espace existant** (`ExistingWorkspaceNotice.tsx`, `workspace-join.ts`) et **offre existante** (`ExistingOfferNotice.tsx`). (a)(c).
- `onboarding-accueil.A5` — **Passer l'onboarding** (`useSkipOnboarding`, `OnboardingWizard.tsx`). Théo a « Quitter et reprendre plus tard » ; pas de « passer ». (a)(c).
- `onboarding-accueil.A6` — **Checklist d'activation** après onboarding (`ActivationChecklist.tsx:185`, `salesScenario`, `tour`) et **visite guidée**. (a)(c).

---

## 17. `onboarding-questions` — Onboarding › Les 38 questions (7 étapes)

**Théo `#/onboarding/step/:id`** (alias `#/onboarding/profile|priorities|sources`) avec les 7 étapes : Ton activité (6) · Ton offre (6) · Tes cibles (5) · Tes priorités (5) · Ta façon de vendre (5) · Tes ressources (5) · Tes outils & Laura (6) = **38 questions** → **produit** : `routes/onboarding/$id/$stage/$slug.tsx:18` → `features/onboarding/view/OnboardingStagePage.tsx:4` → `OnboardingWizard.tsx:59` ; questions `features/onboarding/lib/questions/` (~70 fichiers) + `i18n/locales/fr/onboarding.json` (**148 entrées** : libellés + listes de choix) ; deuxième temps `ProfileQuestionnaireDialog.tsx:61` + `packages/contracts/src/schemas/profile-questionnaire.ts` (60 questions différées) ; réédition `routes/settings/profile/$stage.tsx:13`.

Ce que montre Théo : une page par étape, questions numérotées 01-38, **chaque question avec 5 statuts** (Réponse renseignée · Je ne sais pas · Plus tard · Non applicable · À vérifier) et « Effacer », rail latéral « Ton cadrage se construit » (Priorité · Expertises · Territoire, « 1 réponse sur 38 »), « Enregistré sur cet appareil », « Voir la synthèse », « Retour / Étape suivante ». Questions : `first_name` (comment Laura t'appelle) · rôle · entreprise · maturité · nb consultants · nb de personnes business · expertises · technos · modes d'intervention · types de ressources · différenciation · références · territoires · secteurs · tailles · types de clients · exclusions · priorité · horizon · résultat attendu · freins · temps hebdo · voies d'entrée · interlocuteurs · canaux · comptes déjà accessibles · cycle · profils à positionner · enjeu de sourcing · repères économiques · suivi missions/ADV · rituels · outils · données réutilisables · tâche à arrêter · niveau de contrôle · démarrage avec Laura · élément non couvert.

### Liste 1 — REDESSIN

- `onboarding-questions.R1` — Étapes (`OnboardingStepper.tsx:90` : organisation · rôle · offre · marché · système commercial · objectifs · audit) → 7 étapes **renommées et re-découpées** : activité · offre · cibles · priorités · façon de vendre · ressources · outils & Laura. Mapping : « Ton rôle » disparaît (fusionnée avec « Ton activité »), « Ton audit » devient l'écran de relecture.
- `onboarding-questions.R2` — Questions du Temps 1 (`TEMPS1_STAGES`, `questions/*.ts`) → 38 questions maximum, libellés recomposés. Recoupements directs : esn_name ↔ `esnName` ; consultant_size ↔ `consultantSize` ; sales_team_size ↔ `salesTeamSize` ; esn_maturity ↔ `esnMaturitySituation` ; expertise_areas ↔ `expertiseAreas` ; service_modes ↔ `staffingModel`/`serviceTypes` ; geo_zones ↔ `geoZones` ; target_sectors ↔ `targetSectors` ; target_size/type ↔ `idealClientSize`/`targetCompanyTypes` ; main_frictions ↔ `salesFreins` ; weekly_sales_time ↔ `weeklySalesTimeDeclared` ; access_routes/target_roles/sales_channels ↔ `chemins-acces`/`interlocuteurs`/`canaux` ; sales_cycle ↔ `idealClientMaxSalesCycle` ; bench_status ↔ `availableConsultantsBand` ; tools ↔ `tooling*` ; free_context ↔ `uncoveredActivityNote`.
- `onboarding-questions.R3` — Rendu d'une question (`QuestionField.tsx`, `ChoiceList`, `TagsField`, aide `question-help.ts`, recommandations Laura `question-recommendations.ts`, conséquences `question-consequences.ts`) → carte à numéro, 5 statuts, bandeau « Tu peux aussi… ».
- `onboarding-questions.R4` — Sauvegarde (indicateur `autosave`, `formatSavedAt`) → « Enregistré sur cet appareil ».
- `onboarding-questions.R5` — Récapitulatif (`AnswersRecapDrawer.tsx:22`, tiroir) → rail « Ton cadrage se construit » permanent.

### Liste 2 — FEATURES NEUVES

- `onboarding-questions.N1` — **5 statuts de réponse** (renseignée / je ne sais pas / plus tard / non applicable / à vérifier) **portés par la question**. Back : la réponse devient un objet `{value, status}` (aujourd'hui `unknownAnswer` gère « je ne sais pas » de façon locale). Contrat `EsnAnswers` à élargir **avant** le code qui l'écrit (GA-11/12). Démo : profil d'exemple avec statuts mixtes.
- `onboarding-questions.N2` — **Rail « Ton cadrage se construit »** (Priorité / Expertises / Territoire déduits en direct, « Aucune expertise supposée »). Front seul si dérivé des réponses ; la règle « jamais d'expertise inventée » est déjà la doctrine.
- `onboarding-questions.N3` — **Question `first_name` — « Comment souhaites-tu que Laura t'appelle ? »** (prénom d'usage, distinct de l'identité et des droits). Back : champ `preferred_name` (aujourd'hui prénom du profil).
- `onboarding-questions.N4` — **Plafond annoncé « 38 questions maximum »** : le produit n'a pas de plafond (Temps 1 + Temps 2 différé). Voir A1.
- `onboarding-questions.N5` — **Question `context_policy` : « Comment veux-tu démarrer tes échanges avec Laura ? »** (Neutre vs Mon activité) et `autonomy` (niveau de contrôle). Back : alimente `settings-laura` (personnalisation par défaut / validation requise). Démo : valeurs par défaut Neutre / validation requise.
- `onboarding-questions.N6` — **Page d'une étape entière sans stepper latéral** (barre de progression horizontale 1-7 cliquable). Front seul.

### Liste 3 — ABSENTES CHEZ THÉO

- `onboarding-questions.A1` — **Le gros des ~110 autres questions** : chiffre d'affaires (montant+période), objectif d'entreprise, clients actifs, récurrence, concentration client, groupe/BU, **vivier en 15 questions** (identifiés/qualifiés/disponibles, fraîcheur, TJM moyen, mobilité, consentement RGPD, états intéressé/disponible/sécurisé/présentable…), **base clients en 12 questions** (missions en cours/terminées, renouvellements, satisfaction, REX, cas clients, ventes croisées, échéances), preuves & références, autorité de décision (qui décide marge/staffing/invitation), **équipe** (associés, recruteurs, delivery, marketing, ops), temps commercial en 7 questions, **réseau** (anciens clients/collègues/partenaires/recommandeurs/relations chaudes), mesures suivies, **outillage en 16 questions** (CRM, ATS, ERP, messagerie… qui s'en sert, source de référence, doublons), freins en 4 questions, implantation, « comment as-tu connu Bellum ». Source : `features/onboarding/lib/questions/*.ts`, `i18n/.../onboarding.json` `questions`. **Question centrale à Louis** : (a) Théo réduit volontairement à 38 et le reste migre en « Temps 2 / Profil » (`ProfileQuestionnaireDialog`, 60 questions différées) · (b) le reste doit être demandé plus tard par blocs (Laura) · (c) retiré. Chaque thème (vivier, base clients, réseau, outillage, équipe) est une ligne de QCM distincte.
- `onboarding-questions.A2` — **Branchement adaptatif** (questions visibles selon les réponses : `visibility.ts`, `adaptive-branching.test.ts`, `visibleQuestions`). Théo : liste fixe. (a)(c).
- `onboarding-questions.A3` — **Détection de contradictions** entre réponses (`OnboardingContradictionCard.tsx:40`, `onboarding-contradictions.ts`). (a)(c).
- `onboarding-questions.A4` — **Préremplissage** depuis le site / le CRM (`PrefillBadge.tsx`, `CrmVocabularyHint.tsx`, `ReseauExternalReads.tsx`) et **lecture externe** (réseau). Doctrine : on collecte largement mais PROPRE (c79). (a)(c).
- `onboarding-questions.A5` — **Aide contextuelle par question et conséquence** (« ce que cette réponse change », `question-consequences.ts`, `OnboardingReviewBlockCard`). Théo en garde une fraction (légendes). (a)(c).
- `onboarding-questions.A6` — **Passerelle « Temps 2 » différé** : `ProfileQuestionnaireDialog.tsx:61`, 60 questions à compléter plus tard dans Réglages › Profil par blocs (rôle, entreprise, offre, marché, routine…). Théo : un seul questionnaire à 38. (a)(c).

---

## 18. `onboarding-relecture` — Onboarding › Relecture · Audit stratégique · Premier échange

**Théo `#/onboarding/review`** (« Voici ce que tu m'as confié »), **`#/onboarding/audit`** (« Théo, voici le plan que je te propose »), **`#/onboarding/launch`** (« Ton premier échange est prêt ») ; réutilisés sous `#/settings/profile` et `#/settings/profile/audit` → **produit** : `routes/onboarding/$id/review.tsx:17` → `OnboardingReviewPage.tsx:33` ; `routes/onboarding/$id/generating.tsx:17` → `OnboardingGeneratingPage.tsx:30` ; audit `features/commercial-audit/view/CommercialAuditScreen.tsx:56` (`/settings/profile/audit`) ; restitution `OnboardingRestitutionCard.tsx:21`.

Ce que montre Théo : _Relecture_ — 38 réponses regroupées en 7 blocs avec « Modifier » par bloc, valeur ou « À préciser ». _Audit_ — « Ce que j'ai compris de toi » (rôle, offre, objectif, territoire, horizon, voies d'accès), **3 orientations** à décider (Je retiens cette stratégie · À travailler plus tard · Ne pas retenir) avec « premier geste », « Les points à trancher » (« L'expertise reste ouverte »), « Ce que cela change dans Bellum » (Comptes, Contacts, Suivi, Découvrir), **case de validation** « J'ai relu ce cadrage et je valide son utilisation comme contexte, avec ses inconnues » + « Cette validation n'autorise ni accès à de nouvelles données, ni dépenses, ni envois », boutons « Corriger mes réponses » / « Valider et préparer mon premier échange », « Exporter ». _Launch_ — prompt de premier échange modifiable, envoyé à Laura.

### Liste 1 — REDESSIN

- `onboarding-relecture.R1` — Relecture (`OnboardingReviewPage.tsx:33` : blocs `OnboardingReviewBlockCard`, états Confirmé/À vérifier/Contradictoire/Non mesurée, « Modifier ») → 7 blocs numérotés, valeur ou « À préciser ».
- `onboarding-relecture.R2` — Première sélection de comptes (`FirstSelectionCard.tsx:17`, « Une première sélection, avant même de lancer l'audit ») → **disparaît** : Théo n'affiche aucun compte avant la validation.
- `onboarding-relecture.R3` — Génération de l'audit en 6 phases (`OnboardingGeneratingPage.tsx:30` : vérification → profil → marché → offre → recommandations → sauvegarde ; reprise par phase) → **audit synchrone** : la page « audit » s'affiche immédiatement avec des orientations (règles locales).
- `onboarding-relecture.R4` — Restitution / lecture de l'audit (`CommercialAuditScreen.tsx:56`, `build-audit.ts`, axes de maturité, tensions) → trois orientations à trancher + « points à trancher ».
- `onboarding-relecture.R5` — Fin d'onboarding (`WelcomeScreen.tsx:82` → accueil/briefing) → sortie vers **Laura avec un premier prompt modifiable**.

### Liste 2 — FEATURES NEUVES

- `onboarding-relecture.N1` — **Décision par orientation** (retenir / plus tard / écarter) enregistrée. Back : table `framing_decisions` (stratégie, décision, date) — aujourd'hui l'audit propose sans enregistrer de décision par ligne. Démo : audit d'exemple avec 3 décisions.
- `onboarding-relecture.N2` — **Case de validation explicite + mention « n'autorise ni accès, ni dépenses, ni envois »**. Back : `framing.validated_at` + empreinte (le profil devient « nouveau cadrage » seulement après validation, voir `settings-espace.N1`). Alignée avec « Un fait périmé redevient inconnu ».
- `onboarding-relecture.N3` — **Prompt de premier échange modifiable** (`Ton premier échange est prêt`, brouillon pré-rempli dans le chat, envoi manuel) : front + chat (`UI.chatDraft`) ; le copilote n'envoie jamais.
- `onboarding-relecture.N4` — **Exporter l'audit / le cadrage.** Back (export).
- `onboarding-relecture.N5` — **Bloc « Ce que cela change dans Bellum »** (Comptes/Contacts/Suivi/Découvrir) : texte conditionnel. Front seul.
- `onboarding-relecture.N6` — **« Les points à trancher »** (ex. « L'expertise reste ouverte »). Front seul (règles locales) ; back si IA.
- `onboarding-relecture.N7` — **Audit toujours valide avec des inconnues** (« Ton premier objectif reste à choisir »). Conforme doctrine (un axe non évaluable reste nommé) ; ne pas bloquer l'audit.

### Liste 3 — ABSENTES CHEZ THÉO

- `onboarding-relecture.A1` — **Génération en arrière-plan** (« Tu peux quitter cette page, le travail continue ») avec phases, reprise, erreurs par phase (`generating.*`, `OnboardingGeneratingPage.tsx:30`) : audit produit par le modèle (coût, durée). Théo : audit instantané. _Question_ : (a) l'audit IA reste (Théo = maquette d'un résultat) · (b) audit local, sans modèle · (c) retiré. **Décision de produit, pas de design.**
- `onboarding-relecture.A2` — **Première sélection de comptes avant l'audit** (`FirstSelectionCard.tsx:17`) — l'« aha moment » du produit actuel. _Proposition_ : l'ajouter à l'écran `launch`. (a)(c).
- `onboarding-relecture.A3` — **Cartes d'attention / contradictions / restitution** (`onboarding-attention-points.ts`, `OnboardingContradictionCard.tsx:40`, `OnboardingRestitutionCard.tsx:21`, `AnswerReformulation.tsx`, `OnboardingLauraHypothesisCard.tsx`). Théo en garde « les points à trancher ». (a)(c).
- `onboarding-relecture.A4` — **Diagnostic de maturité commerciale** : axes, tensions, conséquences, plan et jalons (`features/commercial-audit/components/AuditConsequences.tsx`, `AuditPlanAndMilestones.tsx`, `lib/maturity-axes.ts`, `tension-detectors.ts`). Aucun écran Théo ne montre cette profondeur. _Question_ : (a) conserver l'audit complet sous « Voir mon audit » · (b) simplifier aux 3 orientations · (c) retirer. **Ne pas décider seul.**
- `onboarding-relecture.A5` — **Paiement après onboarding / activation de l'offre** : voir `onboarding-accueil.A2`.
- `onboarding-relecture.A6` — **Outils déclarés → proposition de branchement** (`toolingMapKeysForConnectedTools`, `outils-invitation.ts`) : Théo précise « Les sélectionner n'établit aucune connexion » ; la passerelle vers Connecteurs n'apparaît pas. (a)(c).

### Éléments Théo qui heurtent une règle

- **« JAMAIS de données fictives »** : « Explorer un exemple » ne doit jamais écrire dans le vrai profil (`onboarding-accueil.N1`).
- **D82 — « Le copilote s'appelle Laura, partout »** : conforme chez Théo (Laura nommée partout, y compris `first_name` « comment Laura t'appelle »). Le champ « Nom du copilote » du produit (`BrandingView`) est contradictoire (voir `settings-espace.A4`).
- **Doctrine « Un score n'est jamais nu » / « On n'affiche pas ce qu'on n'a pas »** : l'audit de Théo dit « À préciser » plutôt qu'inventer — conforme.

---
