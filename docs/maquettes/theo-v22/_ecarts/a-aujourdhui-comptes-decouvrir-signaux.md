# Écarts Théo V22 ↔ produit — DOMAINE A : Aujourd'hui · Comptes · Découvrir · Signaux

> Lot `THEO-V22-ECARTS-A2` — inventaire **lecture seule** (aucun code produit). Date : 22/10/2026.
> Côté Théo : les 3 HTML de `docs/maquettes/theo-v22/` (lus sur `origin/claude/maquettes-theo-v22`, sans les ajouter) rendus dans Chromium headless et lus route par route, modales comprises (texte réellement affiché, pas le code des maquettes). `Produit_Complet` sert de référence ; `BPCE` est le même produit sur le cas démo.
> Côté produit : `origin/main` @ `64c6806c08` (`apps/web/src/routes/`, `features/`, `i18n/locales/fr/`) ; l'inventaire du 19/10 (`inventaire-ecrans-19-10`, `inventaire-back-19-10`) a servi de liste de contrôle, **vérifiée dans le code** (il comparait à d'anciennes maquettes, pas à Théo V22). Chemins relatifs à `apps/web/src/`.
> Décision Louis : Théo est appliqué EXACTEMENT ; toute feature existante absente chez lui = **question à Louis** (liste 3), jamais retirée seule.
> Non exploré : `#/mailbox`, `#/actions`, `#/projects`, `#/talents`, `#/missions`, `#/pilotage`, `#/team/*`, `#/settings/*`, `#/onboarding/*` (autres domaines) ; le popover « Comment travailler ici ? » (shell, constat T7 du domaine D).

## Écrans couverts et compte par liste

| #   | Écran                     | Route Théo                                  | Route produit                                       | Composant (apps/web/src/features/…) | 1 Redessin | 2 Neuves | 3 Absentes |
| --- | ------------------------- | ------------------------------------------- | --------------------------------------------------- | ----------------------------------- | ---------: | -------: | ---------: |
| 1   | `today-jour`              | `#/today`                                   | `/briefing` (+ `/dashboard`)                        | `BriefingPage.tsx:113`              |          8 |        8 |         18 |
| 2   | `today-agenda`            | `#/today/week`                              | `/briefing?mode=week`                               | `AgendaBoard.tsx`                   |          4 |        3 |          6 |
| 3   | `today-equipe`            | `#/today/team`                              | `/team` (domaine D)                                 | `ManagerDashboardPage.tsx:111`      |          2 |        2 |          1 |
| 4   | `comptes-liste`           | `#/accounts`                                | `/accounts`                                         | `AccountsPage.tsx:386`              |          9 |        8 |         12 |
| 5   | `comptes-import`          | `#/accounts` (modale Importer) · `#/search` | `/search` + import                                  | `routes/search/index.tsx:14`        |          2 |        3 |          3 |
| 6   | `comptes-fiche`           | `#/accounts/:id (+8 sections)`              | `/accounts/$id`                                     | `AccountDetail.tsx:104`             |          9 |       13 |         17 |
| 7   | `comptes-fiche-reference` | `#/accounts/a-bpce (+sections)`             | `/accounts/$id` (cas démo)                          | `AccountDetail.tsx:104`             |          3 |        5 |          2 |
| 8   | `decouvrir`               | `#/discover`                                | `/discover` (+ `/discover/lots`, `/discover/radar`) | `Discover.tsx:269`                  |         11 |       10 |         15 |
| 9   | `decouvrir-historique`    | `#/discover/history`                        | `— (panneau de Découvrir)`                          | `DiscoverSidebar.tsx:624`           |          4 |        3 |          4 |
| 10  | `signaux`                 | `#/signals`                                 | `— (/mes-cibles « Signaux », /watchlist)`           | `TargetSignalsSection.tsx:29`       |          6 |        8 |          9 |
| 11  | `signaux-veilles`         | `#/signals/watches`                         | `— (recherches enregistrées, règles de veille)`     | `discover-saved-searches.ts:50`     |          3 |        5 |          4 |
|     | **Total** (11 écrans)     |                                             |                                                     |                                     |     **61** |   **68** |     **91** |

_Comptes calculés sur les identifiants `<écran>.R|N|A<n>` du document (`signaux.A0` compte dans la liste 3)._

## Questions qui bloquent tout codage (à poser à Louis en premier)

1. `signaux.A0` — **« Signaux » n'a aujourd'hui aucune route** : le mot est le libellé de l'onglet `/mes-cibles` (listes de cibles + « Ce qui bouge sur tes comptes »), `/watchlist` n'est qu'une redirection, la veille territoriale vit dans `/accounts/marches`. Théo en fait une **bibliothèque d'informations par compte** (ajout manuel, enregistrés, écartés, corbeille). Que devient `/mes-cibles` (listes de cibles) ?
2. `T5` — **La démo change de monde.** Théo raconte Théo Haddad / Maëva Coet, Groupe Hélios, Altiver Industries, Atlas Mobilités, NovaSanté, 13 comptes ; la démo actuelle est bâtie sur Société Générale, SNCF, Orange, Naval Group, Aubrac… (`demo-dataset.ts` ~19 000 lignes, `demo-coverage.ts` ~10 500 lignes). Remplace-t-on le jeu de démo par le scénario de Théo (chantier lourd, craft rule n°9) ou le mappe-t-on ?
3. `comptes-liste.A1` / `T6` — **Vocabulaire de relation** : Théo n'a que Client · En ouverture · À ouvrir ; le produit a sept statuts commerciaux (À trier, En observation, À potentiel, Client, En cours d'ouverture, Hors priorité, En veille). Lesquels survivent ?
4. `comptes-liste.R3` — **« Intérêt commercial » en nombre nu (92, 87…)** chez Théo, sur 100 ; le produit affiche un score /10 avec ses axes (« un score n'est jamais nu »). À trancher avant de coder la colonne.
5. `today-jour.A8` — **`/dashboard` (Tableau de bord) n'existe pas chez Théo** : ses 9 cartes (trajectoire, objectifs, couverture du portefeuille, dormantes, pouls relationnel…) n'ont pas de place. Pilotage (domaine D) ou « Mon activité » ?
6. `decouvrir.A1` à `A4` — **Découvrir perd ses trois modes** (critères / opportunités détectées / comptes comparables), l'autopilote et l'analyse en lot. Garde-t-on ces portes ?

## Constats transverses (valent pour tout le domaine A)

- **T1 — Théo n'a pas de `/briefing`.** Sa « Ta journée » (`#/today`) reprend le rôle de `/briefing` mais avec quatre onglets (Mon activité · Mon agenda · Équipe · Pilotage) au lieu de trois (Aujourd'hui · Messagerie · Tableau de bord, `components/navigation/sections.ts:230`). `#/today/team` affiche exactement l'écran `#/team` (domaine D, `team-vue`) : traité là-bas.
- **T2 — Sidebar de Théo** : Découvrir · Analyser (boutons) puis Ma journée · Comptes · Contacts · Signaux · Affaires · Talents · Missions · Actions (badge) · Messagerie (badge) · Intégrations · Paramètres. « Mes cibles » et « Veille » n'y sont plus ; « Signaux » y est (voir T3).
- **T3 — Trois objets pour un seul mot « Signal ».** (i) `/mes-cibles` (`routes/mes-cibles/index.tsx:5`, onglet « Signaux », `TargetSignalsSection.tsx:29`) ; (ii) `WatchlistBoard.tsx:83` (signaux groupés par compte, écartés, facettes À traiter / prioritaires / selon mes règles) ; (iii) l'onglet « Signaux et besoins » de la fiche compte (`TabSignal.tsx:33`). Théo a UNE bibliothèque (`#/signals`) et UN onglet fiche (`#/accounts/:id/signals`) qui lit la même donnée (« les mêmes observations sont utilisées depuis Découvrir et dans ce dossier »).
- **T4 — Natures de signal** : Théo en a dix (Article de presse · Projet & transformation · Recrutement · Information terrain · Historique · Besoin à qualifier · Appel d'offres · Marché attribué · Nomination · Investissement). Le produit en a une taxonomie plus riche (`watchlist.json › filters.types`, `discover.json › signalTypes`). À aligner, pas à écraser.
- **T5 — Démo** : voir question 2. Chaque `N` ci-dessous dit ce que `demo-dataset.ts` / `DemoSeedService` devra semer et où classer `demo-coverage.ts`.
- **T6 — Statuts de relation / de compte** : Théo montre `Client / En ouverture / À ouvrir` ; produit `commercialStatus` à 7 valeurs (`accounts.json`) + `boardStatus` à 7 (`À analyser, À ouvrir, En cours, À relancer, Client, En veille, Écarté`).
- **T7 — Éléments communs hors périmètre** : popover « Comment travailler ici ? », pastille « V22 · aperçu local », ⌘K, thème clair/sombre → domaine « shell ».
- **T8 — Aucune probabilité chez Théo** sur ces écrans ✔ (doctrine : probabilité dans Pilotage seulement).
- **T9 — Le mode « Aperçu local »** de Théo (« aucune invitation envoyée », « aucun envoi », « aucun appel IA ») est un parti pris de prototype ; en prod, l'envoi d'une invitation d'agenda et le débit de crédits d'une analyse existent déjà et doivent rester annoncés (GA-51).

---

## 1. `today-jour` — Ma journée

**Théo `#/today`** (« Ta journée ») → **produit `/briefing`** : `routes/briefing/index.tsx:9` → `features/briefing/view/BriefingPage.tsx:113`. Écrans liés : `/dashboard` (`routes/dashboard/index.tsx`, `features/dashboard/view/DashboardPage.tsx:3`), `/mailbox` (onglet).

Ce que montre Théo, de haut en bas : titre + sous-titre fixe · sélecteur de portée « T Théo · M Maëva · Équipe » · « Ajouter une tâche » · 4 onglets · 4 tuiles (Affaires en cours 231 000 € · À faire maintenant 4 · Brouillons à relire 4 · Missions à anticiper 3) · carte « COMMENCER ICI · THÉO » (une action, contexte, « Faire avancer cette action », « Voir le compte ») · « Le plan de Théo » (3 lignes 01-03 + « 1 autres actions à regarder » + « Toutes ses tâches ») · « Les affaires à faire avancer » (4 lignes) · « Les rendez-vous du jour » (2 cartes) · « Les profils suivis » (3 consultants avec « Disponibilité déclarée »).

### Liste 1 — REDESSIN

- `today-jour.R1` — Titre et hero (`BriefingHero.tsx:54` : « Bonjour {prénom}. Voici où investir ton temps aujourd'hui. » + résumé dynamique N rendez-vous / réponses / relances / tâches en retard / blocages + « Commencer par la priorité n°1 ») → « Ta journée » + sous-titre fixe « Des priorités, des rendez-vous et des préparations issus de ton portefeuille. ». Plus de phrase dynamique ; le geste principal devient la carte « Commencer ici ».
- `today-jour.R2` — Navigation (`sections.ts:230` : Aujourd'hui · Messagerie · Tableau de bord, chacun avec une phrase de rôle) → quatre onglets **Mon activité · Mon agenda · Équipe · Pilotage**. Messagerie passe en entrée de barre latérale (badge), Tableau de bord n'a plus d'onglet (`today-jour.A8`).
- `today-jour.R3` — « À faire maintenant » (`ActionsBlock.tsx:51` : cartes `PriorityCard` classées, raison du rang, axes pesés / non évaluables, disposition) → carte « Commencer ici » (1 action, 2 boutons) + « Le plan de Théo » (3 lignes numérotées : titre, phrase, « Théo · échéance · compte », bouton Ouvrir). Les raisons de rang et les axes ne s'affichent plus.
- `today-jour.R4` — « Tes tâches » (`BriefingPage.tsx:381`, `TaskList` 5 lignes, seaux En retard / Aujourd'hui / Demain / Cette semaine / Plus tard, repliable) → fondues dans « Le plan de Théo » ; plus de seaux ni de compteurs « N en retard ».
- `today-jour.R5` — « Ajouter une tâche » (dans le bloc tâches) → bouton **en tête de page** + modale « Ajouter une action à la journée » : Action à réaliser · Échéance · Responsable (Théo / Maëva) · Compte facultatif · Contexte et résultat attendu · « Préparer l'action », avec la mention « Créer une tâche ne déclenche aucune action externe ».
- `today-jour.R6` — « Ton agenda » (`BriefingPage.tsx:413` : `AgendaCompact` + `AgendaBoard` jour/semaine, conflits, « Préparer le RDV ») → « Les rendez-vous du jour » : cartes heure · titre · compte et nature · participants + « Ouvrir le rendez-vous », lien « Agenda » (voir `today-agenda`). Le basculeur jour/semaine quitte la page.
- `today-jour.R7` — « Mon activité » (`MyActivityBlock.tsx:73` : pipe, CA, marge, capacité, « non mesuré ») et `PersonalKpiRow.tsx:13` → quatre tuiles de stock. Le CA, la marge et la capacité n'y sont plus (ils vont à Pilotage, domaine D).
- `today-jour.R8` — « Comptes qui ont bougé » (`BriefingPage.tsx:595` : signal récent, voie d'accès, dernier résultat par compte) → « Les affaires à faire avancer » : 4 lignes **affaire** (titre, compte · montant · responsable). Le sujet change (affaires, plus comptes).

### Liste 2 — FEATURES NEUVES

- `today-jour.N1` — **Sélecteur de portée T / M / Équipe** (voir la journée de Théo, de Maëva ou l'espace). **Back** : `/briefing` se calcule pour l'utilisateur connecté (`BriefingPage.tsx:113`) ; il faut un paramètre « membre » + une règle de droits (qui lit la journée d'un autre ?). **Démo** : semer la journée complète de Maëva. À soumettre à Louis (doctrine : l'analytique mesure le produit, pas la personne).
- `today-jour.N2` — **Tuile « Affaires en cours 231 000 € — 4 affaires de Théo »** (somme non pondérée). Front seul (le pipe est déjà servi à `MyActivityBlock`) ; vérifier que les affaires sans montant ne comptent pas « 0 » (GA-18).
- `today-jour.N3` — **Tuile « Missions à anticiper — Responsable : Théo · 30 jours »**. Front + lecture filtrée par responsable des fins de mission (Staffing sait déjà 30/60/90 j). Démo : 3 missions finissant sous 30 jours.
- `today-jour.N4` — **Tuile « Brouillons à relire — Auteur : Théo · aucun envoi »** : nombre de brouillons de messages de l'utilisateur. **Back** si le compte de brouillons n'est pas exposé. Démo : 4 brouillons.
- `today-jour.N5` — **Carte « Commencer ici »** avec « Faire avancer cette action » : le comportement du bouton n'est pas défini dans la maquette (ouvre l'action ? Laura ?). À demander à Théo ; front seul ensuite.
- `today-jour.N6` — **« Les profils suivis »** sur Ma journée (consultants, compétences, « Disponibilité déclarée : date »). Front seul (données vivier) ; démo : 3 consultants avec disponibilité.
- `today-jour.N7` — **Lien « Toutes ses tâches »** (les tâches d'une personne) : front si `Actions` accepte un filtre « responsable ».
- `today-jour.N8` — **Ligne de tâche « Théo · échéance · compte »** (responsable + date + compte sur une ligne). Front seul.

### Liste 3 — ABSENTES CHEZ THÉO (à poser à Louis)

- `today-jour.A1` — **Voir « Tes décisions »** (arbitrer une décision : Protéger l'existant / Prochain mouvement / Simplifier ; `DecisionsSection.tsx:29`). _Proposition_ : la carte « Commencer ici » + 3 lignes en tiennent lieu mais sans catégorie ni regroupement des sujets administratifs ; garder le bloc sous le plan. (a) garder · (b) fondre dans le plan · (c) retirer ?
- `today-jour.A2` — **Voir ce qui attend ma décision** : suivi de mission, relevés, facturation, besoins (`DailyGesturesBlock.tsx:32`). _Proposition_ : sous le plan, ou dans « Missions à anticiper ». (a) · (b) · (c).
- `today-jour.A3` — **Traiter ma messagerie depuis la journée** : fils non lus, réponses favorables, fils sans réponse, profils envoyés au client sans retour (`BriefingPage.tsx:462` et `:489`, « En attente des autres »). Théo renvoie à `#/mailbox`. _Proposition_ : une tuile « Réponses à traiter » + lien Messagerie. (a)(c).
- `today-jour.A4` — **Voir ce qui a bougé depuis ma dernière visite** (`SinceLastVisitBlock.tsx:80`, repère posé à la première visite). (a) sous la carte « Commencer ici » · (c).
- `today-jour.A5` — **Suivre mes analyses en cours et les annuler** (`RunningJobsBlock.tsx:27`, étapes, durée prévue, crédits réservés, Annuler) et le bandeau d'analyse active (`ActiveAnalysisBanner.tsx:18`). (a) · (b : Actions) · (c).
- `today-jour.A6` — **Voir les blocages de ma chaîne commerciale** (`ChainBlockersBlock.tsx:27`) et **les risques critiques** (collisions de signaux, `CriticalRisksBlock.tsx:21`). _Proposition_ : Pilotage (D). (a)(b)(c).
- `today-jour.A7` — **Lire les alertes de Découvrir** déclenchées depuis ma dernière visite (`DiscoverAlertsBlock.tsx:32`). _Proposition_ : une tuile « Nouveaux signaux » renvoyant à Signaux. (a)(c).
- `today-jour.A8` — **Ouvrir le Tableau de bord** (`/dashboard`, `PersonalCockpit.tsx:74`) : KPI personnels, verdict de trajectoire (`TrajectoryVerdict.tsx:34`), mes priorités, trajectoire, objectifs commerciaux, couverture du portefeuille, opportunités dormantes, pouls relationnel, séries (`features/dashboard/components/perspective/*`), lien vers l'espace équipe, « Demander à Laura de relire ». Aucun onglet Théo ne porte ce contenu. _Question_ : (a) onglet « Mon activité » · (b) fusionner dans Pilotage (D) · (c) retirer.
- `today-jour.A9` — **Choisir un mode de travail rapide** : Prospecter · Préparer mes rendez-vous · Traiter mes relances · Positionner un consultant · Sécuriser mes missions · Remettre mon pipe à jour (`QuickModesBlock.tsx:26`, session chiffrée en minutes, une note de plus pour le manager). (a) garder sous le plan · (c).
- `today-jour.A10` — **Voir les comptes à prioriser pour un rendez-vous** (score mesuré, `SlotProposalPriorityAccountsBlock.tsx:27`). (a)(c).
- `today-jour.A11` — **Demander à Laura de prioriser ma journée** (`BriefingPage.tsx:376`, question pré-remplie). Théo n'a aucun lien Laura sur cette page (bouton global « Demander à Laura » dans la barre). (a) garder le raccourci · (c).
- `today-jour.A12` — **Actualiser le brief, l'exporter (copie du texte) et partager son lien** (`BriefingPage.tsx:880-900`) + heure d'actualisation. (a)(c).
- `today-jour.A13` — **Savoir ce que le brief a pu lire** : sources connectées / incomplètes / en échec, « Brief complet / incomplet », « Gérer les connexions » (`SourcesStrip.tsx:192`). Honnêteté de lecture (GA-18). (a) en pied de page · (c).
- `today-jour.A14` — **« Lire comme »** un autre rôle / stade d'ESN (`ReadAsPicker.tsx:21`, salle de démo). Le rôle change l'ORDRE, jamais le CONTENU (c76). (a)(c).
- `today-jour.A15` — **Ordre des blocs selon le rôle** (`lib/block-order.ts:31`, dirigeant / manager / commercial). Théo a un ordre unique. (a)(c).
- `today-jour.A16` — **Bien démarrer avec Bellum** (checklist d'activation, `chat/view/laura-home-grid.tsx`, montée sur `/briefing`). Théo : voir le domaine Onboarding. (a)(b)(c).
- `today-jour.A17` — **Reporter / écarter une carte de priorité** (`CardDispositionControls.tsx`) et lire la raison du rang. (a)(c).
- `today-jour.A18` — **Voir et résoudre un conflit d'agenda** (`ConflictDialog.tsx`, « Deux rendez-vous se chevauchent de N min »). Voir `today-agenda.A3`.

---

## 2. `today-agenda` — Mon agenda

**Théo `#/today/week`** (onglet « Mon agenda ») → **produit `/briefing?mode=week`** : `routes/briefing/index.tsx:21` (paramètre `mode`) → `features/agenda/view/AgendaBoard.tsx` (grille `AgendaGrid.tsx`).

Ce que montre Théo : « Semaine du 19 oct. 2026 · 8 rendez-vous dans ce périmètre. » · pastille « Agenda local · aucune invitation envoyée » · « Ajouter un rendez-vous » · cinq jours (lundi 19 → vendredi 23) listant heure, titre, contrepartie et participants ; « Aucun événement enregistré. » le jeudi.

### Liste 1 — REDESSIN

- `today-agenda.R1` — Grille horaire jour/semaine (`AgendaGrid.tsx`, glisser pour reprogrammer, indicateur « Maintenant ») → **liste verticale par jour** avec phrase de synthèse (« 8 rendez-vous dans ce périmètre »).
- `today-agenda.R2` — Vue semaine = paramètre d'URL `?mode=week` + basculeur Jour/Semaine → **onglet dédié** `#/today/week` (« Mon agenda ») ; le basculeur disparaît.
- `today-agenda.R3` — Bouton de création d'événement (`NewEventDialog.tsx`) → « Ajouter un rendez-vous » en tête de page (même place que « Ajouter une tâche » de la journée).
- `today-agenda.R4` — Jour vide : « Aucun rendez-vous ce jour. » (`briefing.json › agenda.emptyDay`) → « Aucun événement enregistré. » (une ligne par jour vide, même dans une liste : voir doctrine « On n'affiche pas ce qu'on n'a pas »).

### Liste 2 — FEATURES NEUVES

- `today-agenda.N1` — **Filtre de périmètre « dans ce périmètre »** (Théo / Maëva / équipe) appliqué à l'agenda : même mécanisme que `today-jour.N1` ; back (agenda d'un collègue, droits) ; démo : agenda de Maëva.
- `today-agenda.N2` — **Phrase de synthèse de la semaine** (« N rendez-vous dans ce périmètre »). Front seul.
- `today-agenda.N3` — **Pastille « Agenda local · aucune invitation envoyée »** : en prod, l'envoi d'invitation existe (`WarnGuestDialog.tsx`) ; la pastille n'a de sens qu'en démo. À traiter par le domaine shell.

### Liste 3 — ABSENTES CHEZ THÉO (à poser à Louis)

- `today-agenda.A1` — **Choisir quels agendas afficher** (par défaut / tous / lecture seule, « un de tes agendas n'a pas répondu ») — `AgendaCalendarPicker.tsx`. _Proposition_ : menu à côté de « Ajouter un rendez-vous ». (a)(c).
- `today-agenda.A2` — **Reprogrammer un rendez-vous** (glisser-déposer, `RescheduleDialog.tsx`, avertir les invités `WarnGuestDialog.tsx`). (a)(c).
- `today-agenda.A3` — **Voir et résoudre les conflits**, rendez-vous « À préparer », salle trop petite, invités externes (`briefing.json › agenda`, `conflict-resolution.ts`). (a)(c).
- `today-agenda.A4` — **Préparer un rendez-vous** (`MeetingPrepDialog.tsx`, « Préparer le RDV », carte de préparation) et **rejoindre / suivre un rendez-vous en cours** (`MeetingLiveView.tsx`, « Rejoindre », temps restant). Théo : « Ouvrir le rendez-vous » sans contenu visible (non cliquable dans ce rendu). (a)(c).
- `today-agenda.A5` — **Proposer un créneau pour un compte** (`AgendaSlotProposalTrigger.tsx:35`, `accounts.json › slotProposal`). Voir aussi `comptes-fiche.A4`. (a)(c).
- `today-agenda.A6` — **Types d'évènements** (indisponible, absence, temps de concentration, lieu de travail, créneau proposé non accepté…) — `briefing.json › agenda.kind`. (a)(c).

---

## 3. `today-equipe` — Ma journée › Équipe

**Théo `#/today/team`** → rend l'écran **`#/team`** (« Équipe. Le pilotage collectif »), déjà traité par le domaine D (`team-vue`, `d-pilotage-equipe-reglages-onboarding.md`). **Produit `/team`** : `routes/team/index.tsx:15` → `features/manager/view/ManagerDashboardPage.tsx:111`.

Aucun redessin supplémentaire propre au domaine A ; ne restent que les gestes d'**entrée** depuis Ma journée.

### Liste 1 — REDESSIN

- `today-equipe.R1` — L'entrée vers l'espace équipe est aujourd'hui un lien dans le Tableau de bord (`PersonalCockpit.tsx:154`, « Équipe ») et un onglet de sidebar (`items.ts`, `managerOnly` / `requiresTeam`) → **onglet « Équipe » de la barre de Ma journée** + chip de rôle « Théo · Direction ».
- `today-equipe.R2` — Liens « Journée de Théo / Journée de Maëva » en tête de l'écran Équipe → remplacent la lecture « Lire comme » (`ReadAsPicker.tsx:21`).

### Liste 2 — FEATURES NEUVES

- `today-equipe.N1` — **Liens « Journée de {membre} »** : voir `today-jour.N1` (même back, même démo).
- `today-equipe.N2` — **Onglet Équipe visible dans la barre de Ma journée** pour un espace à ≥ 2 membres ; pour un espace solo, le produit redirige (`routes/team/index.tsx:15`) : comportement à définir avec Théo (onglet caché ? grisé ?).

### Liste 3 — ABSENTES CHEZ THÉO (à poser à Louis)

- `today-equipe.A1` — **Espace solo** : `/team` redirige vers `/settings/team` sous 2 membres actifs (#4158.9). Théo ne montre pas l'état à un seul membre. _Question_ : onglet absent ou état vide ? (a)(c).

---

## 4. `comptes-liste` — Comptes

**Théo `#/accounts`** (« Tes comptes ») → **produit `/accounts`** : `routes/accounts/index.tsx:5` → `features/accounts/view/AccountsPage.tsx:386` (`AccountContent.tsx:281`, `AccountsTable.tsx:25`).

Ce que montre Théo : « DÉVELOPPEMENT COMMERCIAL » · titre + sous-titre · **Importer** · **Analyser un compte** · tuile « DOSSIER DE RÉFÉRENCE — BPCE · achats, entités et historique » (+ « Ouvrir le dossier ») · 4 compteurs (Comptes dans l'espace 13 · À reprendre 07 · Relations actives 05 · Favoris 04) · « Reprendre le fil » (3 cartes + « Voir les actions ») · onglets Tout le portefeuille · Favoris · Suivis · Archives · bascule Commercial / Facturation · **Filtres** · « Toute l'équipe » · tri « Intérêt commercial » · tableau (Compte · Sujet & prochaine action · Relation · Personnes · Responsable · Intérêt) paginé 10 par page, « 13 comptes · dans cette vue ».

### Liste 1 — REDESSIN

- `comptes-liste.R1` — En-tête (`page.introTitle` « Ton portefeuille de comptes » + sous-titre + « Demander à Laura de prioriser mon portefeuille » `AccountsPage.tsx:444` + lien « Mes listes de cibles » `:450`) → « Tes comptes » + sous-titre, **deux boutons** Importer / Analyser un compte ; plus de bouton Laura ni de lien listes de cibles.
- `comptes-liste.R2` — Chiffres clés (`AccountsKeyFigures.tsx:14` : Comptes suivis · Sans prochaine action · Nouveaux signaux 7 j) → **quatre tuiles** Comptes dans l'espace · À reprendre (« Une action est prévue ») · Relations actives (« Compte client ou mission en cours ») · Favoris (« Tes comptes épinglés »). « Sans prochaine action » et « Nouveaux signaux » disparaissent des tuiles.
- `comptes-liste.R3` — Colonne **score** (`AccountListScore.tsx:10`, /10, axes, filtres Élevé ≥ 7 / Moyen / Faible) → colonne « **Intérêt** » en nombre sur 100 (92, 87, 86, 84…), tri « Intérêt commercial ». Heurt de doctrine (voir synthèse).
- `comptes-liste.R4` — Vues (`AccountsViewPicker.tsx:20` : Tout · Mes priorités · Sans prochaine action · Avec signal récent · Avec voie d'accès · Clients actifs · À actualiser) et onglets de liste (`listTabs` : Portefeuille · En observation · Comptes à potentiel · Hors priorité) → **quatre onglets** Tout le portefeuille · Favoris · Suivis · Archives.
- `comptes-liste.R5` — Bascule d'angle (`AccountsLensToggle.tsx:32` : « Sous l'angle commercial / facturation », compteurs, `AccountBillingCard.tsx:50`) → **bascule « Commercial · Facturation »** (même idée, sans les compteurs).
- `comptes-liste.R6` — Barre de recherche + filtres (`AccountsToolbar.tsx:19` : recherche texte / SIREN, étiquette, statut, score, secteur, tri, priorité, accessibilité, type d'entité, `filters` du `accounts.json`) → bouton **Filtres** ouvrant une modale « Filtrer mon portefeuille » : Secteur · Relation commerciale · Responsable · Étiquette · Décision de priorité · Type d'entité · Fraîcheur du dossier · Historique documenté · Type de compte · Intérêt commercial · case « Références autorisées de mon ESN uniquement » · Réinitialiser / Appliquer. La recherche texte n'est plus dans la page.
- `comptes-liste.R7` — Ligne de compte (`AccountTableRow.tsx:123` : avatar, nom, faits, statut, score, responsable, actions de ligne `AccountRowActionsMenu.tsx:55`) → ligne à 6 colonnes dont **« Sujet & prochaine action »** (sujet du compte + date et titre de la prochaine action ; « Pas de prochaine action enregistrée » quand elle manque) et **Personnes** (nombre de contacts). Le menu d'actions de ligne n'apparaît plus.
- `comptes-liste.R8` — Importer (`import` universel : CSV, CRM — voir `comptes-import.R1`) → bouton « Importer » avec modale « Importer dans le portefeuille ».
- `comptes-liste.R9` — Sélecteur d'équipe (`ownership` : Mes comptes / Portés par un collègue / Mes favoris, `AccountsFavoriteToggles.tsx:29`) → liste déroulante « **Toute l'équipe** ».

### Liste 2 — FEATURES NEUVES

- `comptes-liste.N1` — **Tuile « Dossier de référence BPCE — Archive documentée, non actualisée »** + « Ouvrir le dossier » : un dossier compte d'archive, livré avec le produit. **Back** : modèle « dossier de référence » (base commune, c94) ou simple compte de l'espace ? **Démo** : semer le dossier BPCE (55 unités, 18 besoins, 16 TJM, 49 contacts) ; voir `comptes-fiche-reference`. À demander à Louis.
- `comptes-liste.N2` — **« Reprendre le fil — Les échanges qui méritent ton attention »** : 3 cartes compte (secteur · ville, titre du sujet, phrase de Laura, initiales du contact, N contacts, statut, prochaine action) + « Voir les actions ». **Back/IA** si la phrase est rédigée par Laura (coût crédits, GA-51) ; front seul si gabaritée. Démo : 3 phrases.
- `comptes-liste.N3` — **Tuile « À reprendre — Une action est prévue »** et **« Relations actives »** : définitions de compteurs (compte avec action planifiée ; compte client ou mission en cours). Front seul, règle de calcul à documenter.
- `comptes-liste.N4` — **Onglet « Suivis »** (comptes que l'utilisateur suit) : le suivi existe (`features/account-follows/view/FollowedAccountsSection.tsx`, max N) mais n'est pas un onglet de la liste. Front seul.
- `comptes-liste.N5` — **Pagination « Précédent · 1 / 2 · Suivant »** avec « N comptes · dans cette vue » (le produit défile à l'infini, `infiniteData` `AccountsPage.tsx`). Front seul.
- `comptes-liste.N6` — **Filtre « Références autorisées de mon ESN uniquement »** : filtre sur l'autorisation de citer la référence (back : l'autorisation de référence existe-t-elle par compte ? `AccountsPage` / `references` à vérifier). Démo : marquer 2-3 références autorisées.
- `comptes-liste.N7` — **Filtres « Fraîcheur du dossier » et « Historique documenté »** : le produit a une fraîcheur (`FreshnessBadge.tsx`) mais pas ces deux filtres. Front + back (paramètres de filtre).
- `comptes-liste.N8` — **Filtre « Décision de priorité »** : correspond à `priority_gate` (`filters.gate`) ; à confirmer. Front seul.

### Liste 3 — ABSENTES CHEZ THÉO (à poser à Louis)

- `comptes-liste.A1` — **Changer le statut commercial d'un compte** (7 statuts, raison obligatoire, historique — `CommercialStatusSubmenu.tsx:92`, `CommercialStatusReasonDialog.tsx`, `CommercialStatusHistory.tsx:39`). Théo n'affiche que le statut. _Proposition_ : menu de ligne « … » (non montré par Théo). (a)(c). Voir T6.
- `comptes-liste.A2` — **Actions de ligne** : attribuer à un collègue (`AccountAssignSubmenu.tsx:63`), archiver, détacher, supprimer (`DeleteConfirmDialog.tsx:12`), rattacher à un autre dossier (`AbsorbAccountDialog.tsx:25`), marquer meilleure référence, créer une cible (`AccountRowActionsMenu.tsx:55`). (a) menu de ligne · (c).
- `comptes-liste.A3` — **Sélectionner plusieurs comptes et agir en lot** : Comparer, Créer une cible, Actualiser les signaux, Actualiser les contacts, Trouver des contacts, Analyser en lot, Envoyer vers mon CRM (`SelectionBar.tsx:37`, `CompareDialog.tsx:17`, `AnalyzeBatchDialog.tsx:50`, `RefreshSignalsDialog.tsx:50`, `RefreshContactsDialog.tsx:48`, `DiscoverContactsDialog.tsx:47`). (a) · (c). Débit de crédits annoncé avant lancement.
- `comptes-liste.A4` — **Basculer liste / grille** (`ViewModeToggle.tsx`) et choisir les colonnes affichées. (a)(c).
- `comptes-liste.A5` — **Mes listes de cibles** (`/mes-cibles`, `TargetListsSection.tsx:34` en bas de la page, `TargetListsPage.tsx`) + **Sprints** (`SprintBoard`, `AccountsPage.tsx:480`). Théo n'a ni « Mes cibles » ni sprints ; seules des « Listes de travail » existent dans `#/discover/history`. _Question_ : où vivent les listes de cibles ? Voir `signaux.A0`.
- `comptes-liste.A6` — **Voir les marchés locaux** (`/accounts/marches`, `MarketWatch.tsx:58`, fiche de zone `marches_.$zoneId.tsx`) et **les sociétés de services reliées** (`/accounts/partners`, `TabPartners.tsx:312`). Aucun onglet Théo. _Proposition_ : Découvrir ou Signaux. (a)(b)(c).
- `comptes-liste.A7` — **Détecter les doublons / fusionner** (`AbsorbAccountDialog.tsx`, `hygiene/`). (a)(c).
- `comptes-liste.A8` — **Voir la présence du compte dans mon CRM** (« Déjà dans ton CRM », `CrmPresenceBadge.tsx:19`) et pousser vers le CRM. (a)(c).
- `comptes-liste.A9` — **Voir les comptes similaires / « Meilleure référence »** dans la liste (`SimilarAccountContainer.tsx`, `bestReference`). (a)(c).
- `comptes-liste.A10` — **Demander à Laura de prioriser mon portefeuille** (`AccountsPage.tsx:444`). (a)(c).
- `comptes-liste.A11` — **Contexte marché d'un compte depuis la ligne** (`AccountMarketContextButton.tsx:46`). (a)(c).
- `comptes-liste.A12` — **Voir facturation par compte** (prêt à facturer, CA, intermédiaire — `AccountInvoiceReadinessCell.tsx:70`, `AccountRevenueCell.tsx`, `AccountIntermediaryFlag.tsx`). Théo n'a que la bascule sans contenu visible (« Aucun compte dans cette vue » dans le rendu). _Question_ : que montre la vue Facturation ? (a)(c).

---

## 5. `comptes-import` — Importer · Analyser un compte

**Théo** : modale « Importer dans le portefeuille » sur `#/accounts`, puis `#/search` (« Quel compte veux-tu comprendre ? ») → **produit** : `features/import`, `features/universal-import`, `features/crm-import` (import) ; `routes/search/index.tsx:14` (analyse).

Ce que montre Théo : modale **Importer** — « Exemple CSV de comptes » (test de deux entreprises fictives, sans doublonner) · « Sélectionner mon document local » · « Connecter mon CRM » · Fermer. Page **Analyser un compte** : « Commence par une entreprise » (recherche par nom, pays France, dossiers d'essai BPCE / Altiver / Hélios) · « Ce que tu veux obtenir » (Ouvrir ce compte · Préparer un rendez-vous · Trouver les décideurs · Comprendre le groupe · Autres objectifs · ton angle en une phrase) · « Ton cadrage » (Personnalisation : Mon activité · Périmètre France · Entreprise / groupe · Profondeur Approfondie · Ajouter un document) · « Préparer l'analyse » · Récemment · Mes analyses. La page `#/search` est une porte « Analyser » (bouton de sidebar) : frontière avec un autre domaine, traitée ici pour son entrée depuis Comptes.

### Liste 1 — REDESSIN

- `comptes-import.R1` — Assistant d'import (`importWizard.json`, étapes de colonnes, aperçu, doublons) → modale de **trois choix** (CSV d'exemple / document local / CRM) ; le détail d'un assistant en étapes n'est pas dessiné.
- `comptes-import.R2` — Écran de recherche d'analyse (`routes/search/index.tsx:14`) → écran à trois étapes numérotées (1 entreprise · 2 objectif · 3 cadrage) avec bouton « Préparer l'analyse » et ligne « Aperçu local · aucune recherche externe ni débit ».

### Liste 2 — FEATURES NEUVES

- `comptes-import.N1` — **« Ce que tu veux obtenir » : cinq objectifs cochables** (Ouvrir ce compte, Préparer un rendez-vous, Trouver les décideurs, Comprendre le groupe, Autres objectifs) + **angle en une phrase**. **Back/IA** : l'objectif doit conditionner l'analyse (contrat d'analyse à étendre) ; coût crédits à annoncer (GA-51). Démo : une analyse semée par objectif.
- `comptes-import.N2` — **« Ton cadrage » : profondeur (Approfondie), périmètre (Entreprise / groupe), personnalisation « Mon activité », ajout d'un document**. Back : `cadrage_applied` existe côté fiche (`CadrageApplied.tsx`) ; vérifier la correspondance. Démo : cadrage visible sur le dossier semé.
- `comptes-import.N3` — **Exemple CSV de comptes** (jeu d'essai fourni dans la modale) : front seul, utile en démo uniquement.

### Liste 3 — ABSENTES CHEZ THÉO (à poser à Louis)

- `comptes-import.A1` — **Analyser plusieurs entreprises d'un coup** (coller une liste de noms / SIREN, ou depuis une liste cible — `/discover/lots`, `analysis-batches/view/NewAnalysisBatch`, `discover.json › batches`). (a) onglet « Liste » de la page Analyser · (c).
- `comptes-import.A2` — **Réparer l'identité d'une entreprise ambiguë** (homonymes, mauvaise société, `EntityResolutionPanel.tsx`, `CandidateWrongCompanyAction.tsx`). (a)(c).
- `comptes-import.A3` — **Import de contacts / liste cible depuis un fichier** (`useImportTargetList.ts`, `ImportTargetListDialog.tsx`). (a)(c).

---

## 6. `comptes-fiche` — Fiche compte

**Théo `#/accounts/:id`** (+ `/knowledge · /structure · /signals · /people · /organigramme · /ecosystem · /plan · /history`) → **produit `/accounts/$id`** : `routes/accounts/$id.tsx` → `features/accounts/view/AccountDetail.tsx:104` (`AccountDetailTabsBar.tsx:13`, sections `ACCOUNT_SECTIONS` à `:117`). Exemple lu : `#/accounts/a2` (Groupe Hélios).

Ce que montre Théo : barre « Portefeuille · Actualiser · Avec Laura » · identité (Énergie · Groupe, ville, effectif, statut Client, responsable, « Dossier consultable », date) · **huit sections** : Ce que je sais · Entités & sites · Signaux & besoins (sous-vues Sujets actuels · Besoins historiques · TJM observés) · Contacts (Comité d'achat · Couverture) · Organigramme · Écosystème & accès (Pratiques achats) · Plan d'action (Actions · Messages préparés) · Historique & preuves (Activité · Missions · Documents & références · Mémoire relationnelle) ; chaque section a « Ajouter une note », « Compléter le dossier », « Source & portée », « Exporter le dossier ». **Synthèse** : « Le regard de Laura » (titre, phrase, « Préparer mon angle », « À faire ensuite » + « Voir le plan » / « Voir les interlocuteurs »), 4 compteurs (entités, besoins historiques, relevés de TJM, contacts), blocs Référencement & pratiques achats (3 étapes), Organisation (entités), Expertises observées, TJM historiques, Historique des besoins, Écosystème, « Trois questions pour avancer ».

### Liste 1 — REDESSIN

- `comptes-fiche.R1` — En-tête (`AccountDetailHero.tsx:54` : nom, tags, SIREN lien registre, état d'analyse, date d'analyse, statut commercial, action principale `AccountDetailHeroPrimaryAction.tsx`, menu « Plus d'actions », bandeau sticky mobile) → ligne d'identité compacte + 3 boutons (**Portefeuille**, **Actualiser**, **Avec Laura**).
- `comptes-fiche.R2` — Sept sections (`tabSections` : Synthèse · Périmètres · Opportunités · Personnes · Écosystème & accès · Plan d'action · Historique & preuves, sous-onglets par section — `ACCOUNT_SECTIONS`, `AccountDetailTabsBar.tsx:117`) → **huit sections** : « Ce que je sais » remplace Synthèse (l'onglet `brief` `TabCommercialBrief.tsx:36` devient le point d'entrée) ; « Entités & sites » remplace Périmètres ; « Signaux & besoins » remplace Opportunités ; Contacts et **Organigramme séparés** (`TabOrganigramme.tsx:106` était sous Personnes).
- `comptes-fiche.R3` — Synthèse (`TabOverview.tsx:86` + `TabEvaluation.tsx:16` score dossier) → « Le regard de Laura » + compteurs + blocs (référencement, organisation, expertises, TJM, historique des besoins, écosystème, trois questions). **Le score de dossier et ses sept axes ne sont plus affichés**.
- `comptes-fiche.R4` — Signaux (`TabSignal.tsx:33` + `TabNeeds.tsx:52` + `TabProjects.tsx:56`, `AccountOpportunityScreen`, file de pistes à qualifier) → section « Signaux & besoins » à 3 sous-vues (Sujets actuels · Besoins historiques · TJM observés), bouton « Actualiser les signaux » + « Ajouter un signal », filtre « Toutes les natures », encadré « Affaires déjà suivies » (→ « Ouvrir le pipe »).
- `comptes-fiche.R5` — Personnes (`TabContacts.tsx:77`, `TabCommittee.tsx:53`, `TabCoverage.tsx:58` « Qui nous manque ») → section « Contacts » : phrase « choisis le bon rôle avant de choisir le plus haut titre », 3 compteurs (contacts, avec email, relations engagées), filtres Tous les rôles / coordonnées / entités, tableau Interlocuteur · Périmètre · Relation · Coordonnées + « Contacter », liens « Rechercher d'autres interlocuteurs », « Comparer à mon CRM ». Sous-vues Comité d'achat / Couverture.
- `comptes-fiche.R6` — Plan d'action (`TabPlan.tsx:43`, `ActionPlanBoard.tsx`, angles d'attaque, trajectoires, `PlanSections.tsx`) → « Une prochaine étape, pas une liste d'intentions » : compteurs actions à faire / terminées, liste de tâches (type, échéance, responsable, « Préparer »), sous-onglet « Messages préparés », actions « Consigner un résultat commercial » / « Demander une validation manager » / « Toutes mes actions ». Mention « Ce plan partage ses tâches avec Actions et Ma journée ».
- `comptes-fiche.R7` — Historique (`TabMissions.tsx:85`, `TabProofs.tsx:96`, `AccountTimelineCard.tsx`, mémoire relationnelle) → « Le fil du compte » : filtres Tout / Notes / Échanges / Modifications / Commentaires d'équipe + boutons « Ajouter une note » et « Consigner un échange ».
- `comptes-fiche.R8` — Cartes d'écosystème (`AccountEcosystemTop.tsx`, `TabPartners.tsx:312`, `TabAccess.tsx:58` voies d'accès) → section « Écosystème & accès » : cartes d'acteurs (initiales, nom, nature « Historique observé », phrase, tags, « Voir l'observation », « Qualifier la relation ») + sous-vue « Pratiques achats ».
- `comptes-fiche.R9` — Boutons d'action (« Plus d'actions » `AccountDetailMoreActionsMenu.tsx:88`, « Partager », « PDF », « Livrables ») → **« Exporter le dossier »** en pied de chaque section + « Source & portée » (provenance).

### Liste 2 — FEATURES NEUVES

- `comptes-fiche.N1` — **« Préparer mon angle »** (bouton de la carte « Le regard de Laura » ; ouvre « Préparer un travail avec Laura — le compte et le sujet restent attachés à ce brouillon ») et **« Avec Laura »** en tête : **back/IA** (brouillon rattaché au compte + sujet, rien envoyé) ; coût crédits à annoncer. Démo : phrase du regard de Laura semée par compte.
- `comptes-fiche.N2` — **« À faire ensuite »** (prochaine étape unique issue du plan + « Voir le plan » / « Voir les interlocuteurs »). Front seul.
- `comptes-fiche.N3` — **Bloc « Référencement & pratiques achats — Comment se prépare l'accès fournisseur »** en 3 étapes (Sujet métier · Circuit achats · Conditions) avec statuts (Clarifier le besoin / À vérifier / À documenter) + « Comprendre les circuits ». Le produit a `TabAccess.tsx` (voies d'accès) mais pas ce découpage ; **back** (statut par étape) ; démo : 3 statuts par compte.
- `comptes-fiche.N4` — **« Expertises observées »** (tags, « Une affinité ne constitue pas un besoin ouvert ») et **« Lire les besoins historiques »**. Front seul si les expertises sont déjà dérivées des besoins ; sinon back.
- `comptes-fiche.N5` — **« TJM historiques — Les tarifs relevés, par circuit »** (Via intermédiaire / Sourcing direct, fourchette €/j, nombre d'observations ; « Pas de moyenne entre direct et MSP ») + sous-vue « TJM observés » : le produit a un onglet « prices » dans `commercialBrief` (`TabCommercialBrief.tsx`) ; **back** si la séparation par circuit n'existe pas. Démo : relevés pour 1-2 comptes (vide à dessein sinon).
- `comptes-fiche.N6` — **« Trois questions pour avancer »** (01-03) + « Préparer ces vérifications ». **IA** ou gabarit ; démo : trois questions par compte.
- `comptes-fiche.N7` — **« Compléter le dossier »** (bouton récurrent sur chaque section) : parcours de complétion guidée. Back à définir (quelles données manquantes ? ouvre quoi ?).
- `comptes-fiche.N8` — **« Source & portée »** (panneau de provenance par section : source, date, périmètre, limites) + mention d'archive en pied (« Scénario fictif · France · groupe et entités documentées »). Le produit a `AccountProvenancePanel.tsx` : à étendre par section. Front + back (champs de portée).
- `comptes-fiche.N9` — **Sous-vue « Mémoire relationnelle »** (Historique & preuves) : le produit a `memory` ; vérifier le recouvrement.
- `comptes-fiche.N10` — **« Ajouter un signal »** (modale : comptes concernés, nature, « L'information à retenir », source/date/document) : le produit a `POST /accounts/:id/signals/declare` + `DeclareLinkedInSignalDialog.tsx` (LinkedIn seulement). Élargir à toutes les natures : front + back (types).
- `comptes-fiche.N11` — **Encadré « Affaires déjà suivies » dans Signaux & besoins** (lien vers le pipe, « Le dossier les relie, il ne crée pas un second pipeline »). Front seul (affaires du compte).
- `comptes-fiche.N12` — **Filtre « Toutes les natures »** sur les signaux du compte (10 natures, voir T4). Front seul.
- `comptes-fiche.N13` — **Section « Organigramme » dédiée** avec onglets Entités / Personnes / Liens déclarés, zoom − 100 % + et « Ajuster » : le produit a `TabOrganigramme.tsx:106` ; les « Liens déclarés » (« une ligne hiérarchique n'apparaît que si elle est déclarée avec son contexte ») sont une règle à vérifier dans le modèle. Démo : liens déclarés semés ou vides à dessein.

### Liste 3 — ABSENTES CHEZ THÉO (à poser à Louis)

- `comptes-fiche.A1` — **Voir le score du dossier et ses sept axes** (`TabEvaluation.tsx:16`, `AccountScore`, « N axes sur M évalués »). Doctrine : un score n'est jamais nu. _Proposition_ : sous « Ce que je sais ». (a)(c).
- `comptes-fiche.A2` — **Actualiser / relancer l'analyse et lire son état** (échec, annulation, reprise avec coût, `AccountRefreshMenu.tsx:65`, `AccountDetailStatusBanners.tsx:41`, `statusBanner`). Théo : bouton « Actualiser » seul, sans coût ni état. _Proposition_ : garder les bandeaux d'état. (a)(c).
- `comptes-fiche.A3` — **Lire la fraîcheur et la prochaine réanalyse** (`FreshnessBadge`, `NextReanalysisLine.tsx`, `SignalFreshnessLine.tsx`, avis de collecte antérieure `SegmentStaleCollectionNotice.tsx`). (a)(c).
- `comptes-fiche.A4` — **Proposer un créneau au compte** (`AgendaSlotProposalTrigger.tsx:35`). (a)(c).
- `comptes-fiche.A5` — **Partager le dossier** par lien public 30 jours / score seul (`AccountShareDialog.tsx:31`), **aperçu et téléchargement PDF** (`AccountPdfPreviewSheet.tsx:27`), **Livrables** (formats client, CRM — `deliverables`). Théo : « Exporter le dossier » seul. _Proposition_ : un menu sous ce bouton. (a)(c).
- `comptes-fiche.A6` — **Battle card** du compte (`BattleCardModal.tsx:23`, `BattlecardCard.tsx`) et **profil de pari** (`BetProfileDialog.tsx:30`). (a)(c).
- `comptes-fiche.A7` — **Archiver, détacher, supprimer, rattacher le dossier** (`AccountDetailMoreActionsMenu.tsx:88`), **créer une cible** (depuis le compte / depuis le CRM), **marquer meilleure référence**. (a)(c).
- `comptes-fiche.A8` — **Changer le statut commercial et lire son historique** (`CommercialStatusHistory.tsx:39`). Voir `comptes-liste.A1`. (a)(c).
- `comptes-fiche.A9` — **Collaborer sur le compte** : propriétaire, BU, dernière activité de l'équipe, assigner, demander une validation, commentaires d'équipe (`AccountCollaborationBand.tsx:70`, `AccountTeamComments.tsx:104`). Théo : « Commentaires d'équipe » comme filtre de l'historique et « Demander une validation manager » dans le plan. _Proposition_ : garder la bande sous l'identité. (a)(c).
- `comptes-fiche.A10` — **Lire la présence CRM** (`CrmPresenceBadge.tsx:19`, `CrmOpenDealsBatchAdvance.tsx`, `AccountCrmMirrorSection.tsx`, `AccountCrmSignalsSection.tsx`). (a)(c).
- `comptes-fiche.A11` — **Stratégie 5P, intérêt × pénétrabilité, contexte canonique, vocabulaire, variations, recommandations** (`AccountStrategy5PSection.tsx`, `AccountInterestPenetrabilitySection.tsx`, `AccountCanonicalContextSection.tsx`, `AccountVocabularySection.tsx`, `AccountVariationSignalsSection.tsx`, `AccountRecommendationCard.tsx` — `tabs/sections/`). Théo n'en montre aucun. _Proposition_ : « Ce que je sais » (repliés). (a)(c) par bloc.
- `comptes-fiche.A12` — **Entités du groupe** (`GroupEntitiesCard.tsx`, `EntitiesGraphCard.tsx`, déclaration d'une entité, hypothèse d'entité `EntityHypothesisNotice.tsx`) au-delà de la liste « Entités à explorer ». (a)(c).
- `comptes-fiche.A13` — **Rechercher dans le dossier** (`AccountDossierSearch.tsx`, `dossierSearch.ts`). (a)(c).
- `comptes-fiche.A14` — **Faits d'une réunion : notes de réunion, documents attachés, contrats** (`meetingNotes`, `AccountAttachedDocumentsCard.tsx`, `ContractDocumentForm.tsx`, `ContractUploadLinkPanel.tsx`). Théo : « Documents & références » sans détail. (a)(c).
- `comptes-fiche.A15` — **Réseau professionnel** (connexions à relancer, idées de publication — `accounts.json › network`), **marché local** et **zone** (`marketContext`, `MarketWatch`). (a)(c).
- `comptes-fiche.A16` — **Lancer / reprendre un enrichissement** : actualiser contacts, trouver des contacts, signaux (`RefreshSignalsDialog`, `RefreshContactsDialog`, `DiscoverContactsDialog`). Théo : « Rechercher d'autres interlocuteurs » et « Actualiser les signaux » (boutons), sans dialogues de coût. (a)(c).
- `comptes-fiche.A17` — **Retour sur l'analyse** (verdicts utile / pas utile — `AccountAnalysisVerdictButtons.tsx`, `PlayFeedbackButtons.tsx`). (a)(c).

---

## 7. `comptes-fiche-reference` — Dossier de référence BPCE

**Théo `#/accounts/a-bpce`** (+ `/overview · /structure · /signals · /people · /organigramme · /ecosystem · /plan · /history · /knowledge`) → **produit** : aucune route spécifique ; le cas démo « Groupe BPCE » est un dossier `/accounts/$id` ordinaire (`demo-coverage.ts` cite BPCE à plusieurs endroits). Même composants que `comptes-fiche` (`AccountDetail.tsx:104`).

Ce que montre Théo de plus que la fiche standard : « Archive BPCE du dépôt fourni · 30/09–01/10/2026 · non revérifiée en ligne » ; 55 unités, 18 besoins historiques, 16 relevés de TJM, 49 contacts ; bloc **Référencement & pratiques achats** (SAP Ariba · Provigis · Accès par entité, réserve sur Natixis) ; **Organisation** (14 Banques Populaires · 15 Caisses d'Épargne · organe central · SI/IT · Natixis · Paiements, mise en garde « modèle coopératif inversé ») ; **Expertises observées** (8 lignes) ; **TJM historiques** (390–700 €/j via MSP, 470–941 €/j en direct) ; **Historique des besoins** ; **Écosystème** (25 acteurs : Capgemini, Talan, BCG, Wavestone…, signaux indirects) ; **Programmes cités** (9 cartes numérotées « Ce que le relevé en déduit », « Préparer un angle sur ce sujet », « Ajouter une vérification ») ; **49 personnes à revalider** (« Voir la fiche », « Préparer l'approche ») ; **organigramme par regroupements** (« les colonnes ne représentent ni une détention juridique ni une chaîne de reporting »).

### Liste 1 — REDESSIN

- `comptes-fiche-reference.R1` — Même redessin d'ensemble que `comptes-fiche.R2` à `R9` ; ce dossier est le **cas d'école** (sept sections : Synthèse · Périmètres · Signaux · Personnes · Écosystème & accès · Plan d'action · Historique & preuves).
- `comptes-fiche-reference.R2` — Onglet Personnes d'un grand groupe (`TabContacts.tsx:77`, filtres par rôle, comité) → liste de **49 identités « à revalider »** sans coordonnées (« coordonnées non fournies dans le jeu BPCE ») avec mention de rattachement « Aucune responsabilité locale ou budgétaire déduite ».
- `comptes-fiche-reference.R3` — Organisation par entités → « Les entités à explorer » + vue organigramme **par regroupements** (Domaines & fonctions 10 · Groupements & coentreprises 6 · Entités & filiales 10 · Réseaux coopératifs 29).

### Liste 2 — FEATURES NEUVES

- `comptes-fiche-reference.N1` — **Cartes « Programmes cités »** (période, source, titre, résumé, « Ce que le relevé en déduit », « Préparer un angle », « Ajouter une vérification ») : **back** (modèle de programme/annonce avec période et source de relevé). Démo : 9 programmes pour BPCE.
- `comptes-fiche-reference.N2` — **Sous-vue « Pratiques achats »** avec plateformes (SAP Ariba, Provigis), circuits MSP, panel : **back** (référentiel de circuits d'achats par entité). Démo : seulement BPCE ; ailleurs vide à dessein (« Le panel nominatif… n'est pas établi »).
- `comptes-fiche-reference.N3` — **Écosystème de 25 acteurs avec nature d'observation** (« Observation du relevé », « Signal indirect — employeurs actuels d'anciens ») + « Détail & réserve » par acteur : front seul si `partners` couvre déjà la donnée ; sinon back.
- `comptes-fiche-reference.N4` — **Mention « Archive fournie · périmètre France · actualité non vérifiée »** et date d'archive sur chaque section : champ `source_scope` par dossier (back).
- `comptes-fiche-reference.N5` — **Statut « À revalider »** d'un contact importé d'une archive. Back (statut de revalidation) ; compatible avec la règle « un fait périmé redevient inconnu ».

### Liste 3 — ABSENTES CHEZ THÉO (à poser à Louis)

- `comptes-fiche-reference.A1` — **Tout ce que la fiche standard offre en plus** (`comptes-fiche.A1` à `A17`) : le dossier de référence n'en montre pas davantage.
- `comptes-fiche-reference.A2` — **Mettre à jour le dossier de référence** (relance, refresh, version de collecte) : le dossier est une archive figée chez Théo ; le produit sait actualiser une analyse. _Question_ : un dossier de référence est-il en lecture seule ?

---

## 8. `decouvrir` — Découvrir

**Théo `#/discover`** (« Découvrir. Trouve les comptes à travailler, les bons interlocuteurs et un vrai sujet d'approche ») → **produit `/discover`** : `routes/discover/index.tsx:30` → `features/discover/view/Discover.tsx:269` (2 526 lignes). Routes liées : `/discover/lots` (`routes/discover/lots/index.tsx`), `/discover/radar` (`routes/discover/radar.tsx:33`).

Ce que montre Théo : lien « Mes recherches » · « Nouvelle recherche » · barre « Quel marché veux-tu explorer ? » (Neutre · aucun profil appliqué, Explorer, Toute la France, Tous les secteurs, Expertises, Besoins & signaux, **Tous les filtres** → compteur 69) · 3 « pistes » (Un territoire : Banque & assurance à Lyon · Une expertise : SAP · Un type de client : E-commerce & marketplaces) · 5 indicateurs (Comptes à explorer 31 « 18 nouveaux pour ton espace » · Besoins de prestation 09 · Besoins historiques 186 · Interlocuteurs 66 « 21 avec téléphone illustratif » · Répartition des comptes) · onglets de type de résultat (Comptes 31 · Contacts 66 · Besoins & signaux 223 · Partenaires 4 · Liste d'appels 21) · « Le marché de démonstration » avec Enregistrer · Exporter · Trier par (Pertinence du scénario) · Écartés · Cette page · 6 cartes compte par page · **tiroir « Aperçu du compte »** au clic.

### Liste 1 — REDESSIN

- `decouvrir.R1` — Rail de filtres à gauche (`FilterRail.tsx:142` : cible / signaux d'intention / fit qui se cumulent, secteurs, secteurs exclus, recours externe, modèle de contrat…) et `SituationPicker` → **barre « Quel marché veux-tu explorer ? »** avec 4 raccourcis (Toute la France · Tous les secteurs · Expertises · Besoins & signaux) et bouton **Tous les filtres** ; plus de rail latéral.
- `decouvrir.R2` — « Tous les filtres » → **assistant « Cadrer la recherche » en 5 rubriques** (Entreprises · Territoire · Expertises · Signaux · Relation, « parcours libre », compteur de critères et de comptes « dans la sélection de démonstration », Réinitialiser, Continuer, Appliquer et explorer) : Entreprises = Clients finaux / ESN partenaires + secteurs à inclure par familles + secteurs à exclure + taille, ancienneté, périmètre juridique, CA minimum ; Expertises = SAP, Data, BI, IA, Java, Spring, Vue, Cloud, Cyber, Produit, Finance, Achats, Génie civil + « au moins une / toutes ensemble » + « Partir d'un consultant » + « Avec des observations historiques disponibles » + « Recours externe documenté » ; Signaux = Besoin de prestation, Projet annoncé, Recrutement salarié, Marché public ouvert, Marché attribué, Besoin historique, Information terrain + fraîcheur + modalités (Sur site / Hybride / Télétravail / Junior / Confirmé / Senior) ; Relation = accès et comptes connus.
- `decouvrir.R3` — Modes de recherche (`discover.json › modes` : Par critères · Par opportunités détectées · Par comptes comparables) → **un seul mode** ; les deux autres n'existent plus (voir `A1`).
- `decouvrir.R4` — Sélecteur de type de résultat (`ResultTypeSelector.tsx:35`, un seul type par recherche, dans l'URL `type=`) → **cinq onglets avec comptage** (Comptes · Contacts · Besoins & signaux · Partenaires · Liste d'appels).
- `decouvrir.R5` — Ligne de résultat compte (`CandidateRow.tsx:69`, `CandidateRowDetails.tsx:79` déroulant, score, faits, signaux, personnes, notes, actions) → **carte compacte** (initiales, nom, secteur · ville, effectif, mention « Déjà dans ton espace », tags d'expertise, sujet principal, nature du signal, compteurs signaux / besoins / historiques) ; le détail passe dans le tiroir.
- `decouvrir.R6` — Détail sur place → **tiroir « Aperçu du compte »** : Suivre le compte · L'essentiel (Sujets actuels, Historique, Interlocuteurs, Écosystème, Notes) · Avec Laura · « Pourquoi regarder ce compte » · « Le sujet à regarder en premier » · « Les ressources pour avancer » · « Le conseil de Laura » (interlocuteur, « Travailler l'approche ici ») · « Le périmètre documenté » · **Écarter** · **Construire le dossier complet**.
- `decouvrir.R7` — Contexte « Neutre » (`context=neutral`, `MarketContextPanel.tsx:42` « Contexte marché ») → pastille « Neutre · aucun profil appliqué » dans la barre de recherche.
- `decouvrir.R8` — « Pistes rapides » (`DiscoverQuickPresetsDialog.tsx:21`, 11 pistes : Comptes accessibles, Middle market, Comptes qui recrutent, en transformation, Qui bougent, Compatibles avec mon offre, Proches de tes références, Trouver des partenaires, Décideurs sur une expertise, Avec recours externe observé, Filiales accessibles de grands groupes) → **trois cartes-pistes** (un territoire / une expertise / un type de client).
- `decouvrir.R9` — Barre de résultats (`ResultsToolbar.tsx:85` : tri, comptage, masquer mes comptes, masquer déjà analysés) → « Enregistrer · Exporter · Trier par · Écartés · Cette page » + pagination 1-6 sur 31.
- `decouvrir.R10` — Sélection multiple (`SelectionBar.tsx:48` : Ajouter à une cible, Exporter, Attribuer, Analyser, Comparer avec Laura) → **non visible** dans le rendu ; seul « Enregistrer » et « Exporter » en tête de liste.
- `decouvrir.R11` — Liste d'appels (`CallListResults.tsx:113`, entreprise × personne connue, entonnoir, export) → onglet « Liste d'appels 21 » (même idée) ; indicateur « 21 avec téléphone illustratif ».

### Liste 2 — FEATURES NEUVES

- `decouvrir.N1` — **Indicateurs de tête** (Comptes à explorer + « 18 nouveaux pour ton espace » ; Besoins de prestation « À lire avant de proposer un profil » ; Besoins historiques ; Interlocuteurs « dont N avec téléphone »). Front seul si les agrégats sont déjà dans la réponse de `/discover` ; sinon back (comptage « nouveaux pour ton espace »). Démo : 31 / 18 / 9 / 186 / 66.
- `decouvrir.N2` — **« Répartition des comptes »** : barre par secteur (« Chaque segment représente des comptes affichables, pas un score ni un potentiel de revenus ») + 5 compteurs (Comptes, Contacts, Besoins & signaux, Partenaires, Liste d'appels). Front seul (agrégat côté client) ou back (agrégat serveur sur la pagination).
- `decouvrir.N3` — **Assistant « Cadrer la recherche » parcours libre avec compteur de comptes en direct** (« 31 comptes dans la sélection ») : back (endpoint d'estimation du nombre de résultats avant lancement — `Appliquer et explorer`).
- `decouvrir.N4` — **« Partir d'un consultant »** (reprendre les compétences de Sophie / Karim / Julie / Malik pour la recherche, « ne change pas ton profil permanent »). Front + vivier ; démo : 4 consultants.
- `decouvrir.N5` — **Modalités documentées** (sur site / hybride / télétravail ; junior / confirmé / senior) comme critères : le produit lit la séniorité (`DEMO_SOLD_SENIORITY_LEVELS`) ; la modalité de travail est à vérifier dans le contrat de signal.
- `decouvrir.N6` — **Famille de secteurs** (Banque & assurance · Industrie & énergie · Santé & secteur public · Commerce & numérique · Services & mobilité, « Tout choisir ») : front seul.
- `decouvrir.N7` — **Critères « Ancienneté », « Périmètre juridique », « CA minimum (M€) »** : filtres d'entreprise ; `filters`/`registry.json` portent déjà l'âge et le registre (`discover.json › age`, `registry`). Vérifier le CA minimum (back).
- `decouvrir.N8` — **Tiroir « Aperçu du compte » avec « Le sujet à regarder en premier » et pièce de démonstration** (« Lire la pièce de démonstration ») : front + lecture du brief du besoin. Démo : un brief par besoin de prestation.
- `decouvrir.N9` — **Modale « Enregistrer cette recherche »** : Nom · Objectif commercial · Reprise / veille (Manuelle…) · récapitulatif des critères — existe en partie (`savedTitle`, objectif, fréquence, partage) ; **N** pour la fréquence « Manuelle » et l'absence de cadence automatique.
- `decouvrir.N10` — **Onglet « Écartés »** comme vue (les comptes écartés se relisent) : le produit sait écarter (`actions.dismiss`) mais pas relire la liste des écartés dans la page. Front + back (lecture des écartés).

### Liste 3 — ABSENTES CHEZ THÉO (à poser à Louis)

- `decouvrir.A1` — **Rechercher « par opportunités détectées » et « par comptes comparables »** (modes `signals` et `similar`, `SimilarPanel.tsx:21` « À partir de ton portefeuille », `ProjectionResults.tsx`). _Proposition_ : deux des 5 rubriques du cadrage (Signaux, Relation). (a)(b)(c).
- `decouvrir.A2` — **Laisser Laura proposer mes prochaines cibles** (autopilote — `AutopilotPanel.tsx:23`, « Appliquer à la recherche »). Théo : « Neutre · aucun profil appliqué » seulement. (a)(c).
- `decouvrir.A3` — **Voir et appliquer « Ta cible »** (profil de compte idéal : secteurs prioritaires, zones de chasse, taille, niveau de décision — `DiscoverSidebar.tsx:624`). (a)(c).
- `decouvrir.A4` — **Analyser une liste d'entreprises** (`/discover/lots`, `NewAnalysisBatch`, coller des noms / SIREN ou une liste cible, aperçu, limite par lot). _Proposition_ : porte « Analyser » (voir `comptes-import.A1`). (a)(c).
- `decouvrir.A5` — **Chercher une personne par nom** (`PersonNameSearchPanel.tsx:40`, « Ajouter et enrichir »). (a)(c).
- `decouvrir.A6` — **Chercher par compétence** (`SkillSearch.tsx:23`) et **par zone** (`ZoneSuggestField.tsx:22`, départements, élargissement de zone). Partiellement couvert par « Expertises » et « Territoire ». (a)(c).
- `decouvrir.A7` — **Préparer une session de prospection** depuis les résultats (`ProspectingSession`, durée, objectif, mode, ordre, pitch — `discover.json › prospectingSession`). (a)(c).
- `decouvrir.A8` — **Attribuer** des comptes trouvés à un collègue (`AssignSelectionDialog.tsx:41`), **ajouter à une cible** (`AddToTargetListDialog.tsx:41`), **analyser la sélection** avec coût annoncé (`AnalyzeSelectionDialog.tsx:78`), **comparer avec Laura** (`SelectionBar.tsx:48`). (a)(c).
- `decouvrir.A9` — **Contexte marché observé** (`MarketContextPanel.tsx:42` : recherche dans le marché observé, gratuite, « une trace du PASSÉ ») et **expliquer la méthode** (`DiscoverMethod.tsx:16`, 3 étapes). (a)(c).
- `decouvrir.A10` — **Radar par technologie** (`/discover/radar`, `TechnologyRadarScreen`). (a)(b)(c).
- `decouvrir.A11` — **Lire les avis de qualité de la recherche** : recherche incomplète, dégradée, élargissement, couverture sectorielle, masqués par fraîcheur / zone / intermédiaire (`DegradedBanner.tsx:54`, `IncompleteSearchNotice`, `WideningNotice`, `SectorCoverageNotice`, `ListingFilterNotice`). Honnêteté de lecture. (a)(c).
- `decouvrir.A12` — **Adéquation delivery** : axes de compatibilité, capacité, hors métier (`DeliveryFitAxesDisclosure.tsx`, `DeliveryCapacityNotice.tsx`, `OutOfTradeMark.tsx`) et **qualification** (`QualificationBadge.tsx`, `QuickPassVerdict.tsx:35`, file « Pistes à qualifier »). (a)(c).
- `decouvrir.A13` — **Signaler « mauvaise entreprise »** sur un résultat (`CandidateWrongCompanyAction.tsx:17`) et **noter** (`CandidateNotes.tsx:23`). (a)(c).
- `decouvrir.A14` — **Rejouer une recherche partagée avec l'espace**, **créer une cible depuis une recherche** (`DiscoverSidebar.tsx`, `useCreateTargetListFromSavedSearch.ts`). Voir `decouvrir-historique.A1`. (a)(c).
- `decouvrir.A15` — **Explorer ne coûte aucun crédit ; l'analyse annonce son coût** (`actions.analyzeCost` « N crédits » sur « Construire le dossier complet », GA-51). Le bouton de Théo n'annonce aucun coût. (a) conserver l'annonce · (c).

---

## 9. `decouvrir-historique` — Mes recherches

**Théo `#/discover/history`** (« Mes recherches. Retrouve les critères, les résultats et les comptes que tu avais sélectionnés ») → **produit** : panneau latéral de Découvrir `features/discover/view/DiscoverSidebar.tsx:624` (« Mes recherches et alertes », « Mes recherches récentes ») ; `lib/discover-saved-searches.ts`.

Ce que montre Théo : « Revenir à Découvrir » · « Nouvelle recherche » · **Recherches récentes** (3 : titre, critères, date et heure, « N comptes dans le résultat enregistré », **Reprendre**) · **Enregistrées 0** (« Garde un périmètre à portée de main… peut servir de base à une veille simulée ») · **Listes de travail 0** (« Sélectionne des comptes pour créer ta première liste ») · mention « Sauvegarde locale au navigateur… pas de synchronisation entre appareils ».

### Liste 1 — REDESSIN

- `decouvrir-historique.R1` — Panneau de la sidebar (`DiscoverSidebar.tsx:624` : cible, recherches enregistrées, historique 30 jours, « Rejouer », « Relancer cette recherche ») → **page dédiée** `#/discover/history` à trois blocs (Récentes · Enregistrées · Listes de travail).
- `decouvrir-historique.R2` — « Mes recherches récentes » (30 jours, relançables) → « Recherches récentes » avec **nombre de comptes du résultat enregistré** et bouton **Reprendre**.
- `decouvrir-historique.R3` — Recherches enregistrées (nom, objectif, fréquence, partage, « Rejouée le », supprimer) → bloc « Enregistrées » avec phrase d'aide ; état vide chez Théo (0).
- `decouvrir-historique.R4` — Listes de cibles (`/mes-cibles`, `TargetListsSection.tsx:34`) → bloc « **Listes de travail** » (créées depuis une sélection de comptes).

### Liste 2 — FEATURES NEUVES

- `decouvrir-historique.N1` — **Résultat enregistré avec la recherche** (« N comptes dans le résultat enregistré ») : le produit rejoue la recherche, il ne **fige** pas le résultat. **Back** : snapshot du résultat (ou comptage) à l'enregistrement. Démo : 3 recherches récentes.
- `decouvrir-historique.N2` — **Mention « Sauvegarde locale au navigateur »** : Théo stocke en local ; le produit stocke côté serveur et partage (`savedShared`). Décision : ne pas copier la mention locale.
- `decouvrir-historique.N3` — **« Servir de base à une veille »** depuis une recherche enregistrée : lien vers `signaux-veilles` (voir). Front + back (création d'une veille).

### Liste 3 — ABSENTES CHEZ THÉO (à poser à Louis)

- `decouvrir-historique.A1` — **Créer une cible depuis une recherche enregistrée** (+ « recharger » une cible depuis sa recherche — `useRefillTargetListFromSavedSearch.ts`). _Proposition_ : bouton de la ligne « Enregistrées ». (a)(c).
- `decouvrir-historique.A2` — **Partager une recherche avec l'espace** (`savedShared`) et **choisir sa fréquence de rejeu** (jamais / quotidien…, canal). Théo : « Manuelle » seulement. (a)(c). Voir doctrine GA-26.
- `decouvrir-historique.A3` — **Importer une liste de cibles, ajouter un compte à une liste, statut/priorité/responsable d'un élément de liste, action suivante** (`ImportTargetListDialog.tsx`, `targets.json › columns`) : Théo ne montre qu'une liste vide. (a)(c).
- `decouvrir-historique.A4` — **Supprimer une recherche enregistrée**, **verrou d'offre** (« Les recherches enregistrées ne sont pas ouvertes par ton offre »). (a)(c).

---

## 10. `signaux` — Signaux

**Théo `#/signals`** (« Signaux. L'actualité de vos comptes, au même endroit ») → **produit** : pas de route `/signals`. Les morceaux : `/mes-cibles` (`routes/mes-cibles/index.tsx:5`, onglet « Signaux », `features/target-lists/view/TargetSignalsSection.tsx:29`, `TargetListsPage.tsx:6`), `/watchlist` (redirection), `features/watchlist/view/WatchlistBoard.tsx:83`, `/accounts/marches` (`MarketWatch.tsx:58`).

Ce que montre Théo : « VEILLE COMMERCIALE » · **Mes veilles** · **Ajouter un signal** · onglets **Tous les signaux · Enregistrés · Écartés · Corbeille** · filtre « Tous les comptes » (13 comptes en puces) · **Filtres** (modale : Nature du signal ×10 · Origine : Veille Bellum / Mon équipe / Ajoutés par moi · Date du fait : 7 / 30 / 90 jours) · tri Plus récents / Plus anciens · « Sélectionner les 12 affichés » · « 17 signaux » · cartes signal (nature, compte, titre, résumé, source et type de source, mention « Recrutement salarié ≠ mission ouverte », date) · « Afficher les 5 suivants » · « 12 sur 17 · Résultats déjà disponibles, aucune recherche supplémentaire ».

### Liste 1 — REDESSIN

- `signaux.R1` — Page « Signaux » du produit = `/mes-cibles` (`targets.json › page.title` « Signaux », sous-titre « Ce qui bouge sur tes comptes », listes de cibles + signaux repliable) → page **bibliothèque d'informations** ; les listes de cibles n'y figurent plus (voir `signaux.A1`).
- `signaux.R2` — Plateau de veille (`WatchlistBoard.tsx:83` : groupes par compte, facettes À traiter / Mes comptes prioritaires / Selon mes règles, type de signal, recherche de compte, « Écartés (N) ») → **liste plate de cartes signal** filtrable par compte (puces), nature, origine, date.
- `signaux.R3` — Écartés (`WatchlistBoard.tsx:114-141`, raisons : offre de stage, actualité générale, aucune raison exploitable ; jamais supprimés) → **onglets** Enregistrés / Écartés / Corbeille.
- `signaux.R4` — Détail d'un signal (`WatchlistSignalDetail.tsx:40`, source, ampleur, vérifié / remplacé, historique, « En faire une action ») → carte signal avec nature, compte, titre, résumé, source, mention d'interprétation (« Recrutement salarié ≠ mission ouverte », « L'enveloppe annoncée ne peut pas être assimilée à un budget de consultants »), date.
- `signaux.R5` — « Paramétrer mes alertes » (règles de veille personnalisées, éditeur dans Réglages › Notifications) → bouton **Mes veilles** (page `signaux-veilles`).
- `signaux.R6` — Facettes et compteurs (`countWatchlistFacets`) → comptage « 17 signaux » + « Sélectionner les 12 affichés » + « 12 sur 17 ».

### Liste 2 — FEATURES NEUVES

- `signaux.N1` — **Ajouter un signal à la main sur un ou plusieurs comptes** (modale : comptes concernés, nature ×10, « L'information à retenir » — fait et contexte —, source / date / document ; « Aucune tâche, opportunité ou prise de contact n'est créée automatiquement »). Le produit déclare un signal LinkedIn sur un compte (`useDeclareSignals.ts`, `POST /accounts/:id/signals/declare`) ; **back** : déclaration multi-comptes, natures étendues, document joint. Démo : 1-2 signaux « Ajoutés par moi ».
- `signaux.N2` — **Onglets « Enregistrés » et « Corbeille »** : « enregistrer » un signal (favori de lecture) et corbeille restaurable. **Back** : états de signal (`saved`, `trashed`) à ajouter, en respectant « on archive, on ne supprime pas ». Démo : quelques signaux enregistrés / écartés.
- `signaux.N3` — **Filtre « Origine » : Veille Bellum / Mon équipe / Ajoutés par moi**. **Back** : origine par signal. Doctrine : « Veille Bellum » nomme le produit, pas un fournisseur ✔.
- `signaux.N4` — **Filtre « Date du fait » 7 / 30 / 90 jours** ancré à la date des données. Front seul.
- `signaux.N5` — **Sélection en lot** (« Sélectionner les 12 affichés ») pour enregistrer / écarter / mettre à la corbeille. **Back** (actions de lot).
- `signaux.N6` — **Filtre par compte en puces** (13 comptes) : front seul.
- `signaux.N7` — **Mention d'interprétation par signal** (« Recrutement salarié ≠ mission ouverte », « Offre salariée de démonstration », source et statut « scénario fictif ») : le produit a la distinction salarié / mission (`deliveryFit`, `contractRecourse`). Front seul si la nature est portée par le signal.
- `signaux.N8` — **Pagination « Afficher les 5 suivants »** avec « 12 sur 17 ». Front seul.

### Liste 3 — ABSENTES CHEZ THÉO (à poser à Louis)

- `signaux.A0` — **`/mes-cibles` : mes listes de cibles** (créer une liste, importer, statut de liste, responsable, progression, fraîcheur, prochaine action, vue cartes / tableau — `TargetListsContent.tsx:25`, `TargetListCard.tsx:35`) qui partage l'écran avec les signaux. _Proposition_ : la page Signaux n'héberge que les signaux ; les listes vivent dans Découvrir › Mes recherches (« Listes de travail »). (a) · (b) autre place · (c).
- `signaux.A1` — **Voir les signaux regroupés par compte avec « +N autres »** et le rang (« Compte prioritaire », « N signaux ce mois-ci », « correspond à ta règle ») — `WatchlistTable.tsx:62`, `rank`. Théo : liste chronologique plate. (a)(c).
- `signaux.A2` — **« En faire une action »** depuis un signal (`WatchlistSignalDetail.tsx`, `action.create`, « Ajoutée au plan ») et **voir pourquoi le signal est montré** (`why`, importance forte / moyenne / faible, historique du signal, vérifié par moi). Garde la règle « une tâche terminée ≠ un e-mail envoyé ». (a) bouton sur la carte · (c).
- `signaux.A3` — **Besoin déduit et prochaine action suggérée** (« Il recrute : un besoin de renfort est probable », « Appeler / Écrire / Proposer un profil / Identifier le décideur » — `watchlist.json › need, nextAction`). Doctrine : pas de besoin inventé quand rien n'est identifié. (a)(c).
- `signaux.A4` — **Règles de veille personnalisées** (secteur, technologie, mot-clé — `watchlist.json › rules`, éditeur Réglages › Notifications). _Proposition_ : « Mes veilles » les contient. (a)(c). Voir `signaux-veilles.A2`.
- `signaux.A5` — **Suivre / ne plus suivre un compte** depuis les signaux (`follows`, max N comptes — `FollowedAccountsSection.tsx`). (a)(c).
- `signaux.A6` — **Veille territoriale (marchés locaux)** (`/accounts/marches`, fiche de zone, puce « Marché local »). Théo n'a pas d'équivalent. _Question_ : Signaux, Découvrir ou retirer ? (a)(b)(c).
- `signaux.A7` — **Signaux de CRM** (opportunités ouvertes d'un CRM relié — `AccountCrmSignalsSection.tsx`) et **alertes de Découvrir** (`DiscoverAlertsBlock`). (a)(c).
- `signaux.A8` — **Déclencher une relecture des signaux d'un compte avec coût annoncé** (`RefreshSignalsDialog.tsx:50`). Théo : « aucune recherche supplémentaire ». (a)(c).

---

## 11. `signaux-veilles` — Mes veilles

**Théo `#/signals/watches`** (« Veilles par compte. Les sujets que vous suivez ») → **produit** : recherches enregistrées avec fréquence (`DiscoverSidebar.tsx:624`, `lib/discover-saved-searches.ts:50`), règles de veille (`watchlist.json › rules`, Réglages › Notifications), alertes de Découvrir.

Ce que montre Théo : « Revenir à la bibliothèque » · « Configurer une veille » · tableau (Veille · Cadence · Prochaine échéance prévue · État) avec 2 veilles (« Transformation & Data » : Groupe Hélios, Data / reporting / gouvernance, tous les 3 jours, Europe/Paris, 22 oct. 2026, « Prévision locale · aucun traitement réel », **À connecter** ; « Actualités NovaSanté » : tous les 5 jours, **En pause**) · bouton **Régler** · note « La cadence règle la fréquence de recherche, pas la quantité de signaux. Une absence de nouveauté ne crée pas de faux résultat. Supprimer une veille conserve les informations déjà collectées. » · « Configuration de démonstration · pas de facturation » · lien « Préférences de notification ».

### Liste 1 — REDESSIN

- `signaux-veilles.R1` — Règles de veille (secteur / technologie / mot-clé + « Ajouter », `watchlist.json › rules`) et recherches enregistrées rejouées (`saveFrequencyLabel` « Rejouer ») → **veille par compte** : nom, comptes suivis, types d'actualité, sujets / mots-clés, cadence, date de départ, fuseau.
- `signaux-veilles.R2` — Lecture de l'état d'une alerte (« Jamais rejouée », « Rejouée le ») → colonnes **Prochaine échéance prévue** et **État** (À connecter / En pause).
- `signaux-veilles.R3` — Lien vers les préférences de notification → lien « Préférences de notification » en pied de page.

### Liste 2 — FEATURES NEUVES

- `signaux-veilles.N1` — **Veille par compte avec cadence** : nom, comptes suivis (multi), types d'actualités (aucun = tous), sujets / mots-clés (facultatif), cadence (Tous les jours · 3 jours · 5 jours · Chaque semaine · Toutes les 2 semaines · Tous les 30 jours), « À partir du », fuseau Europe/Paris. **Back** : entité `watch` (comptes[], natures[], mots-clés, cadence, tz, état, next_run) + planificateur ; **la capacité et le coût devront être confirmés avant activation** (message de Théo). Démo : 2 veilles (une active, une en pause), sans collecteur réel.
- `signaux-veilles.N2` — **États d'une veille : « À connecter » / « En pause »** et action « Régler ». **Back** (statut, pause, connecteur). Démo : les deux états.
- `signaux-veilles.N3` — **Prévision de la prochaine échéance** (« Prévision locale · aucun traitement réel »). Front + back (calcul du prochain tour).
- `signaux-veilles.N4` — **« Supprimer une veille conserve les informations déjà collectées »** : règle de cycle de vie (archiver, jamais supprimer les signaux collectés). Back.
- `signaux-veilles.N5` — **Mention « Sources publiques prévues. Les données privées restent soumises aux droits et aux connecteurs réellement disponibles »** : texte de portée ; à valider (doctrine : « on collecte largement tant que c'est propre »).

### Liste 3 — ABSENTES CHEZ THÉO (à poser à Louis)

- `signaux-veilles.A1` — **Choisir le canal d'alerte** (e-mail / in-app / digest — `discover.json › sidebar.channel`) et **partager la veille avec l'espace**. (a)(c).
- `signaux-veilles.A2` — **Règles de veille personnalisées dans Réglages › Notifications** (`NotificationsView`, éditeur unique GA-26). _Proposition_ : une seule porte : « Mes veilles » ; Réglages renvoie ici. (a)(b)(c).
- `signaux-veilles.A3` — **Comptes suivis (`follows`)** : 30 comptes max, suggestions de comptes à suivre (`follows.suggestionLead`). (a)(c).
- `signaux-veilles.A4` — **Alertes de Découvrir** (déclenchements, `DiscoverAlertsBlock.tsx:32`, « Aucun déclenchement depuis le… »). Voir `today-jour.A7`. (a)(c).

---

## Synthèse des heurts de doctrine

Règles citées de `CLAUDE.md` racine (détail dans `agent_docs/doctrine.md`).

1. **« Un score n'est jamais nu »** (GA-18 / GA-19, doctrine « Ce qu'on n'affiche jamais ») — `comptes-liste.R3` : Théo affiche « Intérêt » en nombre nu sur 100 (92, 87, 86…) et en tri ; le produit affiche un score /10 avec « N axes sur M évalués » (renversement 13/10, `ACCOUNT_SCORE_MIN_EVALUATED_AXES`). Même point pour `comptes-fiche.R3` (le score du dossier disparaît). **À trancher avant de coder.**
2. **« On n'affiche pas ce qu'on n'a pas » (Louis 20/09/2026)** — dans une LISTE, une absence ne fait AUCUNE ligne : Théo écrit « Pas de prochaine action enregistrée » sur 5 lignes du tableau Comptes (`comptes-liste.R7`), « Aucun événement enregistré » le jeudi de l'agenda (`today-agenda.R4`), « — relevés de TJM » et « Aucun relevé de prix historique » (`comptes-fiche`). Garde `une-absence-ne-fait-pas-une-ligne.test.ts` : les listes et tableaux devront taire ces lignes ; les fiches d'objet sont hors corpus.
3. **« Un réglage vit à UN seul endroit » (GA-26)** — la cadence d'une veille se règle chez Théo à **trois endroits** : « Enregistrer cette recherche » (Reprise / veille) dans Découvrir, « Configurer une veille » dans Signaux, et les « Préférences de notification » (Réglages). Le produit a déjà deux éditeurs (recherche enregistrée, règles dans Notifications). → `signaux-veilles.A2`, `decouvrir-historique.A2`.
4. **« JAMAIS de données fictives. Échec API → erreur claire »** — Théo livre un scénario fictif (« 21 avec téléphone illustratif », « Exemple CSV de comptes », « Prévision locale · aucun traitement réel »). Valable en **démo** (craft rule n°9) uniquement ; en production, `decouvrir.N1`, `comptes-import.N3` et `signaux-veilles.N3` ne doivent pas produire de chiffre ni de date inventés. Les mentions « illustratif / fictif » ne doivent jamais atteindre la prod.
5. **Craft rule n°9 (tout rempli en démo)** — aucune de ces 68 lignes de liste 2 n'est seedée aujourd'hui telle que Théo la montre. Le jeu actuel (Société Générale, SNCF, Orange, Naval Group, Aubrac Aerostructures…) ne contient ni Hélios, ni Altiver, ni Atlas Mobilités, ni Maëva Coet. À classer dans `demo-coverage.ts` (seedée ou vide à dessein) : question 2 en tête de document.
6. **« Le coût des crédits est annoncé avant le lancement » (GA-51, `decouvrir.A15`, `comptes-import.N1`, `comptes-fiche.A2`)** — le bouton « Construire le dossier complet » de Théo n'annonce aucun coût (le produit : « N crédits annoncés avant le lancement »). Idem « Préparer l'analyse » : la mention « aucun débit » n'est vraie qu'en aperçu.
7. **« On archive, on ne supprime pas »** — la **Corbeille** de `signaux.N2` suppose une suppression ; à conserver comme archive restaurable, sauf effacement RGPD (c67). Même logique pour « Supprimer une veille conserve les informations déjà collectées » ✔ (cohérent).
8. **« Le rôle change l'ORDRE, jamais le CONTENU » (c76)** — le chip « Théo · Direction » et l'onglet Équipe de Ma journée ne doivent pas masquer de bloc selon le rôle ; Théo n'a pas d'ordre par rôle (`today-jour.A14/A15`).
9. **« L'analytique mesure le PRODUIT, jamais la personne » (GA-240/241/264/266/267)** — `today-jour.N1` (journée de Maëva) et `today-equipe.N1` donnent accès au détail d'un collègue : à valider par Louis avant tout back (voir aussi T9 du domaine D).
10. **« Le copilote n'envoie jamais d'e-mail »** — ✔ respecté : « Créer une tâche ne déclenche aucune action externe », « Une tâche terminée ne signifie pas qu'un email a été envoyé » (cohérent avec « Fait ne porte jamais de preuve d'envoi »).
11. **« On nomme ce que l'espace a BRANCHÉ, jamais ce qui NOUS sert »** — ✔ : « Veille Bellum » nomme le produit ; SAP Ariba / Provigis / MSP (`comptes-fiche-reference`) sont des circuits **du client observé**, pas nos fournisseurs. Pas de heurt, à garder dans ce sens.
12. **« Probabilité / CA probable : dans Pilotage seulement »** — ✔ aucune probabilité sur ces écrans ; « Affaires en cours 231 000 € » est un stock non pondéré.
13. **« Recrutement salarié ≠ mission ouverte »** (nature de signal) — ✔ cohérent avec la distinction du produit (`deliveryFit`, modèle de contrat observé).
14. **Design (D80/D79/D81, gardes GA-31/33/34)** — non évalué ici (texte seul) ; les listes denses de Théo (49 personnes, 55 unités, 25 acteurs) restent à passer à la garde de largeur de lecture et au plancher 12 px.
