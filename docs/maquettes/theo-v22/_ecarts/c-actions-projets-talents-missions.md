# Écarts Théo V22 ↔ produit — DOMAINE C : Actions · Affaires · Talents · Missions

> Lot `THEO-V22-ECARTS-C` — inventaire **lecture seule** (aucun code produit). Date : 22/10/2026.
> Côté Théo : les 3 HTML de `docs/maquettes/theo-v22/` (branche `claude/maquettes-theo-v22`) sont **le même produit** ; ils ont été rendus dans Chromium sans tête, route par route, et les modales ouvertes une à une (texte réellement affiché, pas le code des maquettes). Côté produit : `origin/main` @ `64c6806c08` (`apps/web/src/routes/`, `features/`, `i18n/locales/fr/`, `apps/api/src/modules/delivery/`). Chemins relatifs à `apps/web/src/features/` sauf mention contraire.
> Décision Louis : Théo est appliqué EXACTEMENT ; toute feature existante absente chez lui = **question à Louis** (liste 3), jamais retirée seule.
> **Total : 24 écrans — 148 redessins · 137 features neuves · 176 absentes chez Théo.**

## Écrans couverts et compte par liste

| #   | Écran                      | Route Théo                                                 | Route produit                            | Composant (apps/web/src/features/…) | 1 Redessin | 2 Neuves | 3 Absentes |
| --- | -------------------------- | ---------------------------------------------------------- | ---------------------------------------- | ----------------------------------- | ---------: | -------: | ---------: |
| 1   | `actions-aujourdhui`       | `#/actions`                                                | `/actions/`                              | `TodayPage.tsx:46`                  |          7 |        5 |          9 |
| 2   | `sequences-liste`          | `#/actions/sequences`                                      | `/actions/sequences`                     | `SequencesPage.tsx:109`             |          5 |        4 |         11 |
| 3   | `sequences-assistant`      | `#/actions/sequences/new/1..4`                             | `— (état de /actions/sequences)`         | `SequenceJourney.tsx:77`            |          6 |        5 |          8 |
| 4   | `sequences-bibliotheque`   | `#/actions/sequences/library`                              | `— (blocs de /actions/sequences)`        | `SequenceLibraryBlock.tsx`          |          4 |        4 |          5 |
| 5   | `sequences-detail`         | `#/actions/sequences/q1`                                   | `— (feuille latérale)`                   | `SequenceDetailSheet.tsx:194`       |          5 |        4 |          7 |
| 6   | `automations-liste`        | `#/actions/automations`                                    | `/actions/automatisations` → redirige    | `SignalSequencesSection.tsx`        |          5 |        5 |          7 |
| 7   | `automations-bibliotheque` | `#/actions/automations/library · history`                  | `/settings/routines`                     | `RoutinesView.tsx:46`               |          4 |        6 |          4 |
| 8   | `automations-editeur`      | `#/actions/automations/edit/:id`                           | `— (pas d’éditeur)`                      | `RoutineDetailPage.tsx:28`          |          5 |        6 |          4 |
| 9   | `projects-pipeline`        | `#/projects`                                               | `/projects/`                             | `ProjectsPage.tsx:95`               |          9 |        6 |         11 |
| 10  | `projects-fiche`           | `#/projects/:id (+profiles, activity)`                     | `/projects/$id`                          | `ProjectDossierPage.tsx:64`         |          8 |        6 |          8 |
| 11  | `projects-besoins`         | `#/projects/needs`                                         | `/projects/needs`                        | `OpenNeedsPage.tsx:61`              |          7 |        4 |         10 |
| 12  | `projects-rapprochement`   | `#/talents/:id/matching · #/projects/:id/matching/:needId` | `— (NeedMatchTab, ConsultantMatchPanel)` | `NeedMatchTab.tsx`                  |          7 |        7 |          8 |
| 13  | `projects-presentations`   | `#/projects/submissions · #/submissions/:id`               | `/submissions/$id`                       | `SubmissionsView.tsx:66`            |          6 |        6 |          6 |
| 14  | `talents-vivier`           | `#/talents`                                                | `/consultants/`                          | `ConsultantsPage.tsx:81`            |         10 |        6 |         13 |
| 15  | `talents-recrutement`      | `#/talents/pipeline`                                       | `— (aucun)`                              | `—`                                 |          1 |        4 |          1 |
| 16  | `talents-fiche`            | `#/talents/:id (+presentations, documents, activity)`      | `/consultants/$id`                       | `TalentDetailPage.tsx:134`          |          9 |        7 |         11 |
| 17  | `talents-comptes`          | `#/talents/:id/accounts`                                   | `/consultants/$id/reverse-market`        | `ReverseMarketPage.tsx:149`         |          4 |        4 |          4 |
| 18  | `missions-planning`        | `#/missions`                                               | `/missions/ · /missions/planification`   | `MissionsPage.tsx:113`              |          9 |        6 |         11 |
| 19  | `missions-dossier`         | `#/missions/:id (+5 onglets)`                              | `/missions/$id`                          | `MissionDetailTabs.tsx:156`         |         10 |        7 |         10 |
| 20  | `missions-cra`             | `#/missions/cra`                                           | `/missions/cra`                          | `TimesheetsPage.tsx:77`             |          7 |        6 |          6 |
| 21  | `missions-preparation`     | `#/missions/preparation`                                   | `/missions/facturation`                  | `InvoicingPage.tsx:39`              |          6 |        7 |          6 |
| 22  | `missions-factures`        | `#/missions/billing`                                       | `— (aucune liste de factures)`           | `CollectionsPage.tsx:91`            |          3 |        7 |          4 |
| 23  | `missions-encaissements`   | `#/missions/encaissements`                                 | `/missions/encaissements`                | `CollectionsPage.tsx:91`            |          5 |        7 |          6 |
| 24  | `missions-finance`         | `#/missions/finance`                                       | `— (Pilotage/Finance)`                   | `FinanceScreen.tsx:238`             |          6 |        8 |          6 |
|     | **Total (24 écrans)**      |                                                            |                                          |                                     |    **148** |  **137** |    **176** |

_Comptes calculés sur les identifiants `<écran>.R|N|A<n>` du document._

## Lecture : ce que contiennent les trois listes

1. **REDESSIN** (`<écran>.R<n>`) — l'élément existe des deux côtés, la forme change.
2. **FEATURES NEUVES** (`<écran>.N<n>`) — Théo le montre, le produit ne l'a pas. « front seul » = la donnée existe déjà ; « back » = table / endpoint / migration à construire (« ajout seulement ») ; « démo » = ce que `demo-dataset.ts` + `demo-coverage.ts` devront semer (craft rule n°9).
3. **ABSENTES CHEZ THÉO** (`<écran>.A<n>`) — existe dans le produit, aucun écran Théo ne le montre. Chaque ligne se lit seule et part en QCM : **(a)** garder là où Théo ne l'a pas (proposition) · **(b)** déplacer ailleurs · **(c)** retirer (« à retirer ? » = question à Louis).

## Questions qui bloquent tout codage (à poser à Louis en premier)

1. **H1** — Factures **émises, numérotées (FAC-2026-041), avec TVA, spécimen et avoirs** (`missions-preparation`, `missions-factures`) contre « BellumAI SUIT le financier, il ne COMPTABILISE pas » (#2564) et « une facture est préparée, jamais émise ». Quelle part du parcours facture entre en production ?
2. **H2** — Trois onglets **À traiter · Séquences · Automatisations** contre c122 (deux onglets, une automatisation est une séquence sur signal).
3. **H3** — Une séquence sur **plusieurs contacts** (assistant `new/1`, « 2 contacts », « 10 contacts affichés ») contre c74 (mono-contact, `campaign_label`).
4. **H4** — Assistants IA nommés **« Nora »** (repérage) et **« Hugo »** (préparation) contre D82 (« le copilote s'appelle Laura, partout »).
5. **H5** — Statut de facture **« Partielle · en retard »** contre « aucun cinquième statut d'encaissement » (quatre statuts, le reste dû se NOMME).
6. **T6 (repris du domaine D)** — Étapes d'affaire : Théo **À qualifier · Cadrage · Profils présentés · Proposition · Gagnée** (5) contre le produit **Détecté · Potentiel · Qualifié · Besoin exprimé · Profils présentés · Négociation · Signé · Perdu · En sommeil** (9).
7. **H6** — Théo met un **responsable par ligne** (file d'actions partagée Théo / Maëva, planning « le planning de l'équipe », responsables en filtre de factures) : compatible avec « l'analytique mesure le produit, jamais la personne » ? (même question que T9 du domaine D).

## Constats transverses (valent pour tout le domaine C)

- **TC1 — Noms de routes.** Théo dit `#/talents`, le produit `/consultants` (`routes/consultants/`) ; Théo `#/projects`, produit `/projects` mais le libellé du menu est « Opportunités » (`projects.page.title`) ; Le menu produit dit « Opportunités » et « Vivier » (`i18n/locales/fr/nav.json` : `items.projects`, `items.consultants`, `tabs.projects`, `tabs.pool`) alors que des clés « Affaires » et « Talents » (`items.affairs`, `items.talents`) existent aussi — leur usage réel est à vérifier. Le vocabulaire est un choix de Louis (lexique d'espace : `features/lexicon`).
- **TC2 — Pages que Théo n'a pas, que le produit a.** `/missions/adv` (AdvPage), `/missions/paiements` (PaymentsPage), `/missions/cessions` (CessionsPage — affacturage), `/missions/suivi` (MissionTrackingPage), `/missions/nouvelle`, `/expenses` + `/expenses/bareme` (notes de frais), `/propositions` (ProposalStudioPage), `/consultants/$id/reverse-market`, `/projects/needs/$needId` (fiche besoin), `/actions/$id`. Chacune est traitée en liste 3 de l'écran Théo le plus proche.
- **TC3 — Présentations.** `#/projects/submissions` et `#/talents/submissions` sont **la même liste** (même contenu, onglet « Présentations » dans les deux barres). Côté produit : `SubmissionsView.tsx:66` (monté dans le vivier et dans la fiche besoin) + `SubmissionDossierPage.tsx:25` (`/submissions/$id`).
- **TC4 — Barre d'onglets de domaine.** Théo : Affaires = Pipeline · Besoins · Présentations ; Talents = Vivier · Recrutement · Présentations ; Missions = Planning · Relevés d'activité · Prêt à facturer · Factures · Encaissements · Vue financière. Le produit n'a pas de barre commune : ce sont des routes distinctes (et `/missions/suivi`, `/missions/adv` en plus).
- **TC5 — Éléments communs à toute page Théo** (hors périmètre C, traités par le domaine « shell ») : popover « Comment travailler ici ? », pastille « Aperçu local · données fictives », recherche ⌘K, « Commenter cette page ».
- **TC6 — Phrase de pied de page de Théo.** « Aperçu local · données fictives au 19 oct. 2026. Préparations et modifications dans ce navigateur, sans envoi ni synchronisation » : propre à la maquette. En production, c'est la règle « jamais de donnée fictive » ; en démo, le bandeau existant suffit.

---

## 1. `actions-aujourdhui` — Tes actions (la file)

**Théo `#/actions`** (« Tes actions ») → **produit `/actions/`** : `routes/actions/index.tsx:7` → `features/action-history/view/ActionHistoryPage.tsx:33` → `features/today/TodayPage.tsx:46` (titre « À traiter »).

Ce que montre Théo : titre + bouton « Ajouter une tâche » · trois onglets (À traiter 9 · Séquences 1 · Automatisations 2) · bandeau « 4 brouillons dans ta messagerie » + « Ouvrir les brouillons » · six pastilles d'état (À traiter · Non commencées · En cours · À valider · Terminées · Toutes) · « 9 actions » · lignes compactes (titre, compte · statut, responsable, date) · clic = modale de tâche.

### Liste 1 — REDESSIN

- `actions-aujourdhui.R1` — Titre « À traiter » + sous-titre chiffré (« N actions à traiter aujourd'hui, dont N en retard ») (`TodayPage.tsx:89-96`, `actions.json today.title/subtitle`) → « Tes actions » + phrase fixe « Ouvre une tâche pour comprendre le contexte, préparer avec Laura et décider de la suite. Rien ne se termine au simple clic ».
- `actions-aujourdhui.R2` — Axe de tri : quatre sections par ÉCHÉANCE (En retard · Aujourd'hui · Cette semaine · Plus tard, `today.sections`) → six pastilles d'ÉTAT (Non commencées · En cours · À valider · Terminées · Toutes). Le tri par échéance disparaît de l'écran (la date reste en bout de ligne).
- `actions-aujourdhui.R3` — Carte riche avec brouillon déplié en ligne (objet, message, Valider / Modifier / Copier et ouvrir, `TodayCard.tsx`) → ligne compacte : tout se passe dans la modale de la tâche.
- `actions-aujourdhui.R4` — Modale de tâche : statut · « Action de suivi » · Responsable · Échéance · Dossier · contexte · Interlocuteur · « Préparer le brouillon » · « Ouvrir le compte » · Fermer / Reporter / Marquer terminée. Aujourd'hui les mêmes gestes sont éparpillés sur la carte (`TodayCard.tsx:309` menu « ⋯ », `CallbackDateDialog.tsx`) ; « Fait » est immédiat (toast « Marqué fait ») → chez Théo « Marquer terminée » demande une confirmation.
- `actions-aujourdhui.R5` — Création d'une tâche : `TaskComposer.tsx:241` (en ligne dans la liste) → modale « Créer une tâche » à six champs (Action à réaliser · Échéance · Nature du travail « Préparer un email » · Contact lié facultatif · « Action interne, sans contact » · Résultat attendu ou contexte). Responsable non éditable (« Responsable : Théo Haddad »).
- `actions-aujourdhui.R6` — Trois onglets en tête (À traiter · Séquences · Automatisations) remplacent le parcours « Actions = Aujourd'hui + Séquences » (deux onglets, c122). Voir heurt H2.
- `actions-aujourdhui.R7` — Messagerie : le groupe « E-mails » + « Copier et ouvrir » (`today.groups.email`) → un bandeau unique « N brouillons dans ta messagerie » qui sépare « relire un message » de « terminer une tâche ».

### Liste 2 — FEATURES NEUVES

- `actions-aujourdhui.N1` — Responsable affiché sur chaque ligne et file qui mêle les tâches de plusieurs personnes (Théo, Maëva). _Back + front_ : la file `/actions` est personnelle (`TodayPage` lit « tes » sources) ; il faut une lecture des tâches de l'espace par responsable. À soumettre à Louis avant (lien T9 du domaine D : « l'analytique mesure le produit, jamais la personne » — ici c'est du partage de travail, pas de la mesure). _Démo_ : semer des tâches assignées à un 2ᵉ membre (`demo-dataset.ts` + `demo-coverage.ts`).
- `actions-aujourdhui.N2` — Statuts « Non commencées · En cours · À valider · Terminées » comme filtre unique d'une tâche. _Front + mapping_ : le produit a `execution_status` (todo/done…) et le tiroir « En cours / Terminées / À reprendre » mais pas « Non commencée » vs « En cours » sur une tâche. _Back_ à confirmer (colonne ou dérivé).
- `actions-aujourdhui.N3` — Compteur « N brouillons dans ta messagerie » + lien « Ouvrir les brouillons » (`#/mailbox/drafts`). _Front seul_ si `/mailbox` expose déjà le décompte des brouillons (`features/mailbox`) ; sinon petit endpoint de comptage. _Démo_ : brouillons semés (déjà le cas côté messagerie ?) — à vérifier.
- `actions-aujourdhui.N4` — « Préparer un brouillon contextualisé » depuis une tâche de suivi (récupère contact, dossier, objectif ; « préparer ne clôture pas la tâche »). _Front seul_ probable (`ExecuteActionDialog.tsx`, `ActionExecuteMenu.tsx` savent déjà préparer) mais ces composants ne sont appelés que par le plan de compte et le chat (`ActionPlanBoard.tsx`, `PendingActions.tsx`), pas par `/actions` : à brancher.
- `actions-aujourdhui.N5` — Phrase de doctrine visible : « Ouverture et préparation : aucun traitement automatique. Seul « Marquer terminée » clôture cette tâche après confirmation ». _Front seul_ (texte + confirmation). Cohérent avec « Fait ne porte jamais de preuve d'envoi ».

### Liste 3 — ABSENTES CHEZ THÉO

- `actions-aujourdhui.A1` — **Mode « Traiter (N) »** : file par lot (un groupe à la fois), progression N/M, raccourcis clavier, résumé « Qui reçoit quoi » avant de valider (`today/BurstPanel.tsx:1`, `today.burst.*`). Geste : traiter vingt validations d'affilée. Proposition : garder, comme bouton de l'en-tête de la liste.
- `actions-aujourdhui.A2` — **Lots d'écritures CRM / ERP** à valider ou « Rejeter le lot » (`TodayBatchCard.tsx:1`, `today.batch.*`) et **demandes de validation de Laura** (`today.card.origin.approval`). Geste : approuver ce que Laura propose d'écrire dans le CRM/l'ERP (doctrine : « une écriture passe par une porte »). Proposition : garder sous la pastille « À valider » ; **à ne pas retirer** (la porte d'écriture est une doctrine).
- `actions-aujourdhui.A3` — **Filtres Geste · Compte · Source (séquence / plan / Laura / automatisation) · Risque · Agent** (`TodayFilterMenu.tsx:1`, `today.filters.*`). Proposition : un bouton « Filtres » à côté des pastilles d'état.
- `actions-aujourdhui.A4` — **Tiroir « Historique »** (Journal d'activité · En cours · Terminées · À reprendre · Planifiées · Automatisations · Reportées) + fiche `/actions/$id` (`today/HistoryDrawer.tsx:1`, `routes/actions/$id.tsx:4`, `ActionHistoryDetailPage.tsx`, `ActionHistoryJournal.tsx`, `TraceabilityPanel.tsx`). Geste : retrouver ce qui a été fait / a échoué / est reporté, et sa trace. Proposition : « à retirer ? » non — le journal sert la preuve ; le placer derrière un bouton « Historique ».
- `actions-aujourdhui.A5` — **Sections par échéance + vue « seulement en retard »** (`?tab=mine&overdue=true`, tuile « En retard » du tableau de bord ; `ActionHistoryPage.tsx:9-16`). Proposition : garder comme tri secondaire (« Trier par échéance »).
- `actions-aujourdhui.A6` — **Gestes natifs sur la carte** : Valider · Envoyer · Refuser · Modifier le brouillon · Copier et ouvrir · **Passer** · **Confier** (déléguer) · Reporter à « Demain / Dans 3 jours / Lundi prochain / Date libre » · **Issue de l'appel** (`TodayCard.tsx:309/635`, `today.card.*`). Chez Théo : Reporter + Marquer terminée seulement. Proposition : à replier dans la modale de tâche.
- `actions-aujourdhui.A7` — **Sources autres que les tâches** : appels à passer, relances du plan d'action d'un compte, envois préparés par une automatisation, écritures CRM/ERP, messages d'approche de Laura (`today.card.origin.*`, `today.sources.*`). Chez Théo, tout est « tâche ». Proposition : garder la source en sous-titre de ligne.
- `actions-aujourdhui.A8` — **« Mes relances » et file « en attente d'issue »** (`actions/components/MyRelancesList.tsx`, `AwaitingOutcomeQueue.tsx`, rendus par `action-os/view/ActionCenter.tsx` et `TodayPage.tsx`) + **date de rappel** (`CallbackDateDialog.tsx`). Geste : consigner l'issue d'une relance (a répondu / à rappeler / refus). Proposition : garder dans la modale de tâche (« Issue de l'action »).
- `actions-aujourdhui.A9` — **Message d'état dégradé** « Lecture impossible : validations, envois… La file peut être incomplète » (`today.unavailable`) et états vides guidés (« Rien à traiter aujourd'hui · Voir les séquences »). Proposition : garder (« on n'affiche pas ce qu'on n'a pas »).

---

## 2. `sequences-liste` — Tes séquences

**Théo `#/actions/sequences`** → **produit `/actions/sequences`** : `routes/actions/sequences.tsx:9` → `features/outreach/view/SequencesPage.tsx:109`.

Ce que montre Théo : « Tes séquences » · boutons « Bibliothèque de modèles » et « Créer une séquence » · bandeau « PRÉPARER UNE CAMPAGNE » (« Un parcours simple. Audience · Objectif · Messages · Relecture ») avec « Partir de zéro » · « Commencer avec un modèle » (3 cartes : Prospection / Développement / Relance + « Explorer toute la bibliothèque », « Créer mon modèle », « Préparer avec Laura ») · tableau « Tes campagnes » (Séquence · Audience · Étapes · État) avec une ligne (« Ouverture Data · Marseille », 2 contacts, 3 étapes, Brouillon).

### Liste 1 — REDESSIN

- `sequences-liste.R1` — En-tête : titre + cartes KPI (`outreach.kpi` : actives · dues aujourd'hui · réponses · bloquées) + `WhatItIs` (`SequencesPage.tsx:715`, définition séquence / automatisation / parcours) → « Tes séquences » + une phrase + deux boutons. Les KPI et le bloc « c'est quoi » disparaissent.
- `sequences-liste.R2` — Démarrage : bouton unique « Créer ma séquence » (c122, `journey.*`) → deux entrées symétriques « Créer une séquence » / « Bibliothèque de modèles » + bandeau en quatre pastilles numérotées (01 Audience · 02 Objectif · 03 Messages · 04 Relecture). L'ordre des étapes change : produit **Quand → Pour qui → Modèle → Relecture**, Théo **Audience → Objectif → Messages → Relecture** (voir `sequences-assistant`).
- `sequences-liste.R3` — Modèles : bibliothèque en sections (`SequenceLibraryBlock.tsx`, `PlaybookLibraryBlock.tsx`, 12 playbooks dans `outreach.templates`) → trois cartes de départ (Prospection · Développement · Relance) + « 16 modèles disponibles ».
- `sequences-liste.R4` — Liste des campagnes : `SequenceRow` (`SequencesPage.tsx:754`, colonnes Séquence · Mode · Cible · Compte · Canal · Étapes · Prochaine échéance · État · Réponses · Arrêts) → quatre colonnes (Séquence · Audience · Étapes · État).
- `sequences-liste.R5` — Mention de bas de tableau « Campagnes locales et fictives. Aucun email ne peut être envoyé depuis cet aperçu » : propre à la maquette, à NE PAS reprendre (voir heurt H8).

### Liste 2 — FEATURES NEUVES

- `sequences-liste.N1` — « Préparer avec Laura » depuis le bandeau de modèles (rédiger une séquence depuis un texte libre). _Front_ : `outreach.laura.prepare` existe (`SequencesPage` bouton « Laura prépare ») ; à rapprocher.
- `sequences-liste.N2` — « Créer mon modèle » (modèle personnel de l'utilisateur, nommé, réutilisable). _Back + front_ : `PlaybookWizardDialog.tsx` crée des playbooks d'espace ; un modèle _personnel_ par utilisateur est à confirmer. _Démo_ : 1 modèle perso semé.
- `sequences-liste.N3` — Modèles classés par intention métier (Prospection · Développement · Rendez-vous · Staffing · Suivi de mission · Administratif, voir `sequences-bibliotheque`).
- `sequences-liste.N4` — Cartes « Utiliser ce modèle » qui pré-remplissent l'assistant. _Front seul_ (`playbooks.use`).

### Liste 3 — ABSENTES CHEZ THÉO

- `sequences-liste.A1` — **Section « Séquences sur un signal »** (ancre `#sur-signal`, c122 : une automatisation est une séquence dont le déclencheur est un signal ; `routes/actions/automatisations.tsx:14` y redirige) — Théo la remplace par un onglet « Automatisations » séparé. Voir H2.
- `sequences-liste.A2` — **Centre de validation** (`OutreachApprovalCenter.tsx`, `outreach.approval.*` : vues, « Tout approuver », bloqueurs, risques, preuve, diff) — « rien ne part sans validation » (c82). Geste : approuver / refuser les messages préparés en lot. Proposition : garder derrière le bandeau « N brouillons… » de `actions-aujourdhui`.
- `sequences-liste.A3` — **Délégation et mandats** (`DelegationBlock.tsx`, `MandateScopesBlock.tsx` : connecter la boîte, périmètre, signer, renouveler, révoquer, pause). Geste : donner à Laura un périmètre d'envoi. Proposition : déplacer dans Réglages > Laura (domaine D) — **à décider par Louis**.
- `sequences-liste.A4` — **Délivrabilité** (`DeliverabilityBlock.tsx` : envoyés, rebonds, taux, réputation du domaine, plaintes) et **métriques de session de prospection** (`ProspectingSessionMetricsBlock.tsx`). Proposition : garder dans le détail d'une séquence ou dans Pilotage.
- `sequences-liste.A5` — **Canaux** (`ChannelsBlock.tsx` : e-mail prêt / manquant, rappel, tâche, « seulement trois canaux ») et gestes multicanaux (`StepChannelGestures.tsx` : invitation / message du réseau professionnel, appel). Chez Théo : e-mail seul. Proposition : garder, canal choisi à l'étape Messages.
- `sequences-liste.A6` — **Mode vacances** (`VacationBanner.tsx`, `multichannel.vacation`) : suspendre toutes les séquences. Proposition : garder, bandeau conditionnel.
- `sequences-liste.A7` — **Exclusions d'inscription** (`EnrollmentExclusions.tsx`), **doublons d'e-mail**, contacts déjà en séquence, collisions avec un collègue (`audience.alreadyInSequence`, `toast.collision*`). Geste : ne pas écrire deux fois à la même personne. Proposition : garder dans l'étape Audience.
- `sequences-liste.A8` — **Import d'audience** (liste CSV, import depuis le CRM : `audience.importList`, `importFromCrm`) et **constructeur d'audience** avec plafonds par compte / jour / contact / canal (`AudienceBuilderBlock.tsx`). Proposition : garder dans l'étape Audience (« Choisir des contacts »).
- `sequences-liste.A9` — **Dupliquer une séquence** (`duplicateDialog`), **mettre en pause / reprendre / annuler** (`sequence.pause/resume/cancel`), **ajouter / modifier / retirer une étape** (`sequence.addStep…`). Proposition : garder dans le détail (`sequences-detail`).
- `sequences-liste.A10` — **Bannières de contexte** : `CampaignBanner` (`SequencesPage.tsx:636`, campagne préparée depuis un compte ou par Laura, c74 `campaign_label`), `ProspectingThreadBanner` (`:606`), filtre « campagne » (`campaignFilter`). Proposition : garder.
- `sequences-liste.A11` — **Playbook depuis une URL** (`PlaybookFromUrl.tsx`) et assistant de playbook (`PlaybookWizardDialog.tsx`). Proposition : garder derrière « Créer mon modèle ».

---

## 3. `sequences-assistant` — Créer une séquence (4 étapes)

**Théo `#/actions/sequences/new/1` → `/4`** (« Créer une séquence » · « Un parcours guidé. Votre audience et vos textes restent conservés. » · « Quitter et conserver ») → **produit : pas de route**, un état de `SequencesPage` (`SequencesPage.tsx:150`, `journeyFromSearch`) qui rend `features/outreach/view/SequenceJourney.tsx:77` ; la création « à la main » passe par `CreateSequenceDialog.tsx:182` (56 Ko).

Ce que montre Théo : 4 étapes numérotées (Audience · Objectif · Messages · Vérification) · colonne latérale « Votre séquence » (Nom · Audience · Objectif · Cadence J0, J3, J7 · Exécution « Locale · aucun envoi réel ») · étape 1 : nom + liste « Sélection métier » de 10 contacts cochables · étape 2 : trois objectifs (Ouvrir une conversation · Présenter une expertise · Reprendre un échange) · étape 3 : J0 premier email (objet + message, aperçu pour le premier contact), J3 relance (délai 3 jours), J7 dernier suivi (délai 7 jours) · étape 4 : récapitulatif + case « J'ai relu l'audience et les messages » + « Enregistrer la séquence ».

### Liste 1 — REDESSIN

- `sequences-assistant.R1` — Ordre et libellés des étapes : **Quand → Pour qui → Modèle → Relecture** (`journey.steps.*`, c122) → **Audience → Objectif → Messages → Vérification**. « Quand » (maintenant / sur un signal) disparaît de l'ordre des étapes (voir `sequences-assistant.A1`) ; « Modèle » devient « Objectif » (3 choix) puis « Messages » (édition).
- `sequences-assistant.R2` — Une URL par étape (`/new/1..4`, retour arrière qui ne perd rien) ← état local + `journeyFromSearch` (paramètres de recherche). Même promesse (« rien n'est perdu »), autre mécanique.
- `sequences-assistant.R3` — Choix des contacts : `ContactsStep` (`SequenceJourney.tsx:314`, recherche + « N contacts choisis ») → liste « Sélection métier » (contact · compte · fonction · « Email fictif »), compteur « 0 sélectionné · 10 contacts affichés · les exclusions restent respectées ».
- `sequences-assistant.R4` — Relecture : phrase de règle (« Quand …, alors le contact entre dans la séquence … », `journey.review.*`) → récapitulatif en 5 lignes (Nom de la séquence · Audience · Expéditeur · Cadence · Objectif · Arrêt) + case de confirmation.
- `sequences-assistant.R5` — Rappel « Rien ne part sans ta validation : chaque message arrive dans À traiter » (`journey.review.nothingLeaves`) → « Aucune messagerie n'est reliée à cet aperçu… Enregistrer crée uniquement un brouillon de campagne ». Le fond (rien ne part) est le même ; la formule « simulation locale » est propre à la maquette.
- `sequences-assistant.R6` — Libellé final : « Vérifier et créer » (`journey.launch`) → « Enregistrer la séquence » ; état créé = « Brouillon » (Théo) ; produit : une règle naît éteinte (c122), une séquence manuelle est préparée.

### Liste 2 — FEATURES NEUVES

- `sequences-assistant.N1` — Étape **Messages** entière : un éditeur de trois étapes datées (J0 objet + corps ; J3 ; J7) avec **délai modifiable par étape** et **aperçu rendu pour le premier contact sélectionné**. _Front seul_ : `StepChannelGestures.tsx`, `MessageVariables.tsx`, `sequence.stepEdit/stepDueAtField` couvrent l'édition ; ce qui manque est de la poser _dans_ l'assistant (aujourd'hui l'édition se fait après création, dans `SequenceDetailSheet.tsx`).
- `sequences-assistant.N2` — **Colonne « Votre séquence » persistante** (récapitulatif vivant, visible à chaque étape). _Front seul_.
- `sequences-assistant.N3` — **« Quitter et conserver »** : enregistrer l'assistant en cours et le reprendre. Le produit conserve l'état dans l'URL seulement. _Front + back léger_ (brouillon d'assistant persisté par utilisateur) ou localStorage ; à trancher. _Démo_ : un assistant démarré semé.
- `sequences-assistant.N4` — **Objectifs nommés** (Ouvrir une conversation · Présenter une expertise · Reprendre un échange) qui choisissent le modèle de messages. _Front_ : mapping vers les playbooks existants (`outreach.templates`).
- `sequences-assistant.N5` — **Nom de la séquence saisi dès l'étape 1** (champ en tête d'audience). _Front seul_ (`dialog.nameLabel` existe).

### Liste 3 — ABSENTES CHEZ THÉO

- `sequences-assistant.A1` — **Branche « sur un signal »** de l'étape « Quand » : démarrage automatique quand un recrutement est détecté, un nouveau décideur apparaît, un appel d'offres est publié, une cible bouge, un compte reste N jours sans action, une mission arrive à son terme (`journey.trigger.signal`, `actions.json automations.signal.*`, `SequenceJourney.tsx:~100`). Geste : créer une automatisation en 4 écrans. Chez Théo, c'est l'éditeur d'automatisation (`automations-editeur`), à part. **Question à Louis (H2)**.
- `sequences-assistant.A2` — **Branche « Seulement : une action préparée »** (`journey.prepared`, `preparedHint` : pas de séquence, une seule action à valider). Proposition : garder comme dernier choix de l'étape Objectif.
- `sequences-assistant.A3` — **Choix du canal par étape** (e-mail · rappel · tâche · invitation et message du réseau professionnel · appel : `outreach.kind.*`, `stepKind.*`). Chez Théo : e-mail uniquement. Proposition : garder, sélecteur à l'étape Messages.
- `sequences-assistant.A4` — **Contrôles de variables et de qualité** (`MessageVariables.tsx`, `MessageQuality.tsx`, `apply.blockedStep` « Étape 2 bloquée — {{prenom}} manquant ») — Théo montre les variables dans la bibliothèque (« Aucun envoi ne doit contenir une variable non résolue ») mais pas le blocage dans l'assistant. Proposition : garder.
- `sequences-assistant.A5` — **Garde-fous d'audience** : contacts sans e-mail, désinscrits, exclus, doublons d'e-mail, contacts appartenant à un collègue, déjà dans une autre séquence, plafonds (`audience.noEmail/optedOut/excluded/duplicateEmails/ownedByColleagues`, `AudienceBuilderBlock.tsx`, `EnrollmentExclusions.tsx`). Théo ne montre que « les exclusions restent respectées ». Proposition : garder dans l'étape Audience.
- `sequences-assistant.A6` — **Import d'une liste** (CSV, CRM) comme source d'audience (`audience.importList`, `importFromCrm`). Proposition : garder (« On collecte largement, tant que c'est propre »).
- `sequences-assistant.A7` — **Échantillon de rendu** (`outreach.sample.*` : « voir un exemple sur un vrai contact », erreurs « aucun candidat »). Proposition : garder, remplacé par l'aperçu de l'étape Messages (N1).
- `sequences-assistant.A8` — **Détection de risque avant création** (`toast.riskTitle/riskConfirm`) et **collision avec un collègue** (`toast.collisionTitle/collaborate/ownerFallback`). Geste : éviter qu'un collègue écrive en parallèle à la même personne. Proposition : garder.

---

## 4. `sequences-bibliotheque` — Bibliothèque de modèles

**Théo `#/actions/sequences/library`** → **produit : bloc dans `/actions/sequences`** (`SequenceLibraryBlock.tsx`, `PlaybookLibraryBlock.tsx`, `outreach.library.*` / `outreach.playbooks.*`), pas de route dédiée.

Ce que montre Théo : « Ta bibliothèque de modèles » · « Créer mon modèle » · « Préparer avec Laura » · filtres Tous · Prospection · Développement · Rendez-vous · Staffing · Suivi de mission · Administratif · « 16 modèles » · cartes (catégorie, titre, phrase, « 3 étapes », « Email · à relire », « Voir les messages », « Utiliser ») · fenêtre de lecture d'un modèle (étapes J0 / J5 / J12 avec objet et corps à variables `{{prenom}}`, `{{entreprise}}`, `{{sujet}}`, `{{signature}}` ; « Personnaliser une copie » ; « Utiliser ce modèle »).

### Liste 1 — REDESSIN

- `sequences-bibliotheque.R1` — Une page dédiée avec filtres par intention métier (6 familles) ← deux blocs dans la page Séquences : « Ta bibliothèque de campagnes » (campagnes importées, tiers A/B/C) et « Playbooks » (`outreach.playbooks.*`, 12 gabarits : prospection 3 touches, e-mail froid, signal frais, profil à pousser, client existant, nurturing…).
- `sequences-bibliotheque.R2` — Carte de modèle : `tier`, nombre d'étapes, « Appliquer à un contact » (`library.apply.cta`) → catégorie, une phrase d'intention, « 3 étapes · Email · à relire », deux boutons (Voir les messages / Utiliser).
- `sequences-bibliotheque.R3` — Fenêtre « Voir les messages » (lecture seule des 2-3 messages avec avertissement « À vérifier avant utilisation. Le sujet doit avoir une raison concrète ») ← aperçu `outreach.preview.*` dans le dialogue de création.
- `sequences-bibliotheque.R4` — Bandeau de variables : « Les variables entre doubles accolades sont à compléter avec de vrais éléments. Aucun envoi ne doit contenir une variable non résolue » ← blocage par étape (`apply.blockedStep`).

### Liste 2 — FEATURES NEUVES

- `sequences-bibliotheque.N1` — **16 modèles typés par moment métier** : Prospection (4) · Développement (4) · Rendez-vous (1) · Staffing (4) · Suivi de mission (2) · Administratif (2). Le produit n'a rien pour **Staffing** (« Présenter un profil pertinent », « Obtenir un retour sur un profil », « Recueillir le retour après entretien »), **Suivi de mission** (« Faire le point après le démarrage », « Anticiper la suite d'une mission ») ni **Administratif** (« Obtenir une validation d'activité », « Clarifier un règlement en attente »). _Back (contenus) + front_ ; ces trois familles touchent le périmètre ESN (profils, CRA, règlements). _Démo_ : les 16 modèles semés dans `demo-dataset.ts`.
- `sequences-bibliotheque.N2` — **« Personnaliser une copie »** d'un modèle (copie nommée, modifiable) ; le produit permet « Reprendre en personnel » (`library.shared.makePersonal`) mais sur les campagnes importées. _Front + back léger_.
- `sequences-bibliotheque.N3` — **Filtre par famille** (7 pastilles). _Front seul_.
- `sequences-bibliotheque.N4` — **« Décrire mon besoin / Préparer avec Laura »** en tête de bibliothèque. _Front seul_ (voir `sequences-liste.N1`).

### Liste 3 — ABSENTES CHEZ THÉO

- `sequences-bibliotheque.A1` — **Import d'un fichier de campagnes** `.xlsx` / `.csv` (4 Mo max, motifs de lignes écartées : nom manquant, corps manquant, délai illisible, tier inconnu, plus de 12 étapes) (`library.import.*`, `SequenceLibraryBlock.tsx`). Proposition : garder (« Importer » dans l'en-tête).
- `sequences-bibliotheque.A2` — **Partage avec l'équipe** (« Partagé avec l'équipe / Personnel / Par … / Reprendre en personnel », filtres Tous / De l'équipe ; `SharedContentMeta.tsx`). Proposition : garder, badge sur la carte.
- `sequences-bibliotheque.A3` — **Tiers A / B / C** d'une campagne importée (`library.tier`). Proposition : garder si l'import reste ; sinon « à retirer ? ».
- `sequences-bibliotheque.A4` — **Playbook depuis une URL** (`PlaybookFromUrl.tsx`) et assistant de playbook (`PlaybookWizardDialog.tsx`, 21 Ko). Proposition : garder derrière « Créer mon modèle ».
- `sequences-bibliotheque.A5` — **Retirer une campagne de la bibliothèque** (`library.remove`). Proposition : garder (« on archive, on ne supprime pas » : archiver).

---

## 5. `sequences-detail` — Les messages de cette séquence

**Théo `#/actions/sequences/q1`** → **produit : feuille latérale** `features/outreach/view/SequenceDetailSheet.tsx:194` (48 Ko) ouverte depuis une ligne de `SequencesPage.tsx:754`, pas de route.

Ce que montre Théo : « Ouverture Data · Marseille » · état Brouillon · 2 contacts · 3 étapes · onglet « Messages & réponses » · « Préparer les premiers brouillons » (préparation locale par destinataire) · calendrier J0 / J3 / J7 avec objet et corps · Audience (Claire Martin, Léa Robert) · bloc « Tester le fonctionnement → Lancer la simulation » (fenêtre de confirmation : « aucun message ne partira… aucun crédit consommé ») · « Cadre de cette campagne » (Canal Email · simulation ; Règles d'arrêt : réponse, opposition, pause ; Envois réels 0) · « Modifier le brouillon » (rouvre l'assistant).

### Liste 1 — REDESSIN

- `sequences-detail.R1` — Feuille latérale → **page** pleine (« Retour aux séquences »), avec son URL partageable.
- `sequences-detail.R2` — Frise des étapes (`SequenceStepStats.tsx`, `detail.stepDone/stepSkipped/stepPending/stepDue/stepLate`) → liste de 3 messages datés J0 / J3 / J7 avec objet et corps visibles.
- `sequences-detail.R3` — Audience : colonne « Réponses / Arrêts » par contact (`columns.replies/stops`) → deux lignes (nom, fonction).
- `sequences-detail.R4` — « Règles d'arrêt » : `detail.stopCondition` (une phrase) → bloc « Cadre de cette campagne » (canal · règles d'arrêt · envois réels).
- `sequences-detail.R5` — Édition : étapes éditables en ligne dans la feuille (`sequence.stepEdit`) → « Modifier le brouillon » qui **rouvre l'assistant** à l'étape Messages.

### Liste 2 — FEATURES NEUVES

- `sequences-detail.N1` — **« Lancer la simulation »** : passer la campagne en état « Simulation en cours » sans aucun envoi, avec fenêtre de confirmation chiffrée (2 contacts · aucun accès messagerie · aucun crédit). _Doctrine à examiner_ : « une simulation de séquence » n'existe pas dans le produit (les routines ont `routines.dryRun`, simulation d'une règle, pas d'une campagne). _Back_ (état `simulated` + horloge fictive) ou à ne pas faire en production ; en démo, c'est le seul mode possible (H8).
- `sequences-detail.N2` — **Onglet « Messages & réponses »** réunissant le texte des messages et les réponses reçues (compteurs « 1 préparation(s) · 1 réponse(s) · 1 contact(s) arrêté(s) »). _Front seul_ si les réponses sont déjà liées à la séquence (`messageStatus.replied`).
- `sequences-detail.N3` — **« Préparer les premiers brouillons »** : préparation par destinataire en un geste. _Front seul_ (`laura.prepare`, `OutreachApprovalCenter`).
- `sequences-detail.N4` — **Arrêt individuel** : « 1 contact(s) arrêté(s), sans arrêter toute l'audience ». _Front seul_ probable (`sequence.cancel` existe au niveau séquence ; au niveau contact à vérifier).

### Liste 3 — ABSENTES CHEZ THÉO

- `sequences-detail.A1` — **Pause / reprise / annulation** d'une séquence (`sequence.pause/resume/cancel`). Proposition : boutons dans l'en-tête de la page.
- `sequences-detail.A2` — **Dupliquer** vers un autre contact (`duplicateDialog`, `sequence.duplicate`). Proposition : garder, menu « ⋯ ».
- `sequences-detail.A3` — **Ajouter / retirer une étape**, changer de canal par étape (`sequence.addStep/stepRemove`, `custom.*`, `StepChannelGestures.tsx`), délais personnalisés (`multichannel.delay`), réordonner (`multichannel.reorder`). Proposition : garder dans « Modifier le brouillon ».
- `sequences-detail.A4` — **Résultat par étape** : exécutée / ignorée / en retard (`detail.step*`), statistiques d'étape (`SequenceStepStats.tsx`), **signal d'engagement déclaré** (`detail.engagementSignal*`), **rendez-vous pris** (`toast.meetingBooked`, `multichannel.meeting`). Proposition : garder.
- `sequences-detail.A5` — **Liens vers le contact et le compte** depuis la séquence (`detail.openContact/openAccount`). Proposition : garder (lignes d'audience cliquables).
- `sequences-detail.A6` — **Statuts canoniques** (brouillon · à relire · prête · en attente de connexion · planifiée · active · en pause · terminée · arrêtée · échec · archivée : `canonicalStatus.*`) et **statuts de message** (idée → délivré, rebond, répondu, copié à la main : `messageStatus.*`). Chez Théo : « Brouillon » seul. Proposition : garder la liste complète dans le filtre d'état.
- `sequences-detail.A7` — **Appels d'une séquence** (`callCard.*`, `callStatus.*` : proposer, préparer, consigner l'issue). Proposition : garder si le canal « appel » reste (`sequences-assistant.A3`).

---

## 6. `automations-liste` — Tes automatisations

**Théo `#/actions/automations`** → **produit : `/actions/automatisations` redirige** vers `/actions/sequences#sur-signal` (`routes/actions/automatisations.tsx:14`) ; la section « Séquences sur un signal » est `features/automations/view/SignalSequencesSection.tsx` ; le catalogue de routines vit sous `/settings/routines` (`routes/settings/routines.tsx:4` → `features/routines/view/RoutinesView.tsx:46`).

Ce que montre Théo : « Tes automatisations » · « Parcourir les routines » · bandeau Laura « Dis-moi ce que tu veux déléguer » (champ « Décris ton automatisation », 3 suggestions : Anticiper une fin de mission · Relancer après 7 jours · Préparer mes rendez-vous · « Voir les 44 routines ») · 3 sous-onglets (Mes automatisations 2 · Bibliothèque de routines 44 · Journal des essais 0) · « Simulation activée » · deux cartes de règle (déclencheur · préparation · ta décision · périmètre « Mes dossiers autorisés » · rythme « Les jours ouvrés à 08:00 · Europe/Paris » · Pause / Ouvrir / En pause).

### Liste 1 — REDESSIN

- `automations-liste.R1` — Deux onglets d'Actions (À traiter · Séquences) → trois (+ Automatisations). **Renverse c122 (H2)**.
- `automations-liste.R2` — Section « Séquences sur un signal » (`SignalSequencesSection.tsx` : grammaire Quand… alors…, interrupteur « Activer la règle », « N déclenchements sur 30 jours », coût en crédits, plafond de crédits, « Dernier passage », Supprimer, origine Règle / Planifiée / Workflow) → carte de règle à trois blocs (Déclencheur · Préparation · Ta décision) + périmètre + rythme + Pause / Ouvrir.
- `automations-liste.R3` — Catalogue des routines : `/settings/routines` (filtre par cadence, `routines.library.*`) → sous-onglet « Bibliothèque de routines 44 » dans Actions (voir `automations-bibliotheque`).
- `automations-liste.R4` — Création : « Créer ma séquence » avec branche signal → champ libre « Décris ton automatisation » + suggestions (conversation avec Laura).
- `automations-liste.R5` — Activation : `routines.activation.*` (« Avant d'activer cette routine : quand, canal, ce qui l'arrête », bouton Activer) → bouton « Pause » / état « En pause » sur la carte.

### Liste 2 — FEATURES NEUVES

- `automations-liste.N1` — **Champ « Décris ton automatisation » → Laura construit la règle** (conversation, « réponses locales » en maquette). _Back (IA)_ : transformer une phrase en règle structurée {déclencheur, lectures, préparation, validation} ; _Démo_ : réponses scénarisées. À cadrer : le produit a `automations` (règles à signaux fixes, `automationRows.ts`), pas de génération libre.
- `automations-liste.N2` — **Trois blocs lisibles par carte : Déclencheur / Préparation / Ta décision** + **assistants nommés** par rôle (repérage, préparation). _Front_ ; voir H4 (noms « Nora » / « Hugo » vs D82).
- `automations-liste.N3` — **Périmètre « Mes dossiers autorisés »** (choisir sur quels comptes/dossiers la règle peut lire). _Back_ : un périmètre de lecture par règle n'existe pas (les règles lisent l'espace). Lien avec les mandats (`MandateScopesBlock.tsx`).
- `automations-liste.N4` — **Fuseau et jours ouvrés dans le rythme** (« Les jours ouvrés à 08:00 · Europe/Paris »). _Front + back_ : `routines.cadence.*`/`weekday` donnent l'heure et le jour ; « jours ouvrés » et le fuseau explicite sont à confirmer.
- `automations-liste.N5` — **Interrupteur « Simulation activée »** global pour l'écran. _Doctrine_ : propre à la maquette (H8).

### Liste 3 — ABSENTES CHEZ THÉO

- `automations-liste.A1` — **Interrupteur d'activation par règle** (« Activer la règle : … ») : une règle naît **éteinte** (c122). Théo : Pause / Ouvrir. Proposition : garder l'interrupteur.
- `automations-liste.A2` — **Mesures de la règle** : déclenchements sur 30 jours, écartés, « non mesuré » (`firings.*`), dernier passage. Proposition : garder sur la carte.
- `automations-liste.A3` — **Coût et plafond de crédits** par règle (`cost.included/paid`, `cap.label`). Geste : plafonner la dépense. Proposition : garder (« réglage de coût »).
- `automations-liste.A4` — **Filtre par origine** Règle / Planifiée / Workflow (`origin.*`, `filter.label`) et renvoi vers l'historique des actions (`workflowOpen`). Proposition : garder.
- `automations-liste.A5` — **« Lancer celles qui sont dues »** (exécution manuelle des routines, `routines.page.runNow`) et message « Aucune routine n'était due maintenant ». Proposition : garder dans « Parcourir les routines ».
- `automations-liste.A6` — **Modèles prêts à activer** (`templates.title/activate`) et état vide guidé. Proposition : fusionné avec la bibliothèque Théo.
- `automations-liste.A7` — **Fiche d'une routine** `/settings/routines/$key` (`RoutineDetailPage.tsx:28` : ce qu'elle lit, quand elle se déclenche, preuve que ça marche, si elle ne peut pas, exemple, version, relances par passage). Proposition : devient « Voir le fonctionnement » (cf. bibliothèque).

---

## 7. `automations-bibliotheque` — Bibliothèque de routines + journal des essais

**Théo `#/actions/automations/library`** (44 modèles) et **`#/actions/automations/history`** (« Le journal de tes essais ») → **produit** : `/settings/routines` (`RoutinesView.tsx:46`) ; pas de journal d'essais équivalent (voir N3).

Ce que montre Théo : « Des suivis prêts à adapter » · « Décrire mon besoin » · filtres Toutes · Organisation · Rendez-vous · Prospection · Missions & factures · Vivier & staffing · Veille · « 44 modèles » · cartes (famille, titre, phrase, outils lus : Gmail / Outlook, Google / Outlook Calendar, Missions / ATS, CRM connecté, Espace Bellum · « Voir le fonctionnement » · « Adapter ») · fenêtre « Voir le fonctionnement » (Quand · Ce qui est lu · Résultat du modèle de départ · Arrêt du suivi · outils · « L'état de disponibilité en production est à vérifier ; aucun connecteur n'est actif dans cet aperçu » · Fermer · Adapter avec Laura) · « Afficher les suivants ». Journal : « Aucun essai enregistré. Teste une règle : le contrôle et son résultat apparaîtront ici » + « Créer avec Laura ».

### Liste 1 — REDESSIN

- `automations-bibliotheque.R1` — Catalogue de routines filtré par **cadence** (`routines.library.filterLabel`) → filtré par **famille métier** (6 familles) avec compteur « 44 modèles ».
- `automations-bibliotheque.R2` — Fiche de routine pleine page (`RoutineDetailPage.tsx:28`) → fenêtre « Voir le fonctionnement » à 4 rubriques (Quand · Ce qui est lu · Résultat · Arrêt).
- `automations-bibliotheque.R3` — Bouton « Activer » (`routines.activation.confirm`) → « Adapter » (puis Laura).
- `automations-bibliotheque.R4` — Simulation d'une routine (`routines.dryRun.*` : « Un brouillon serait préparé », « silencieux depuis N jours », raisons de non-faisabilité) et historique d'exécution (`routines.history.*`, « Voir la preuve ») → **journal des essais** transversal à l'espace.

### Liste 2 — FEATURES NEUVES

- `automations-bibliotheque.N1` — **Étiquette d'outils lus par carte** (Gmail / Outlook · Calendar · Missions / ATS · CRM connecté · Espace Bellum). _Front seul_ si le catalogue code déjà `reads` (`routines.field.reads`) ; le rapprocher des intégrations branchées. Heurt avec « on nomme ce que l'espace a BRANCHÉ, jamais ce qui NOUS sert » : OK tant que ce sont les outils _du client_.
- `automations-bibliotheque.N2` — **Mention de disponibilité en production** (« L'état de disponibilité en production est à vérifier ») : propre à la maquette (H8) ; le produit doit dire _vraiment_ si le connecteur est branché.
- `automations-bibliotheque.N3` — **Journal des essais** global (liste des tests de règles, « une trace de simulation n'est jamais une preuve d'envoi réel »). _Back_ : journal d'essais par règle ; le produit a `routines.history` (exécutions réelles) mais pas d'essais à blanc enregistrés. _Démo_ : 0 essai chez Théo — la démo doit en semer 2-3 pour que l'écran ne soit pas vide (craft rule 9).
- `automations-bibliotheque.N4` — **Sous-onglets « Mes automatisations · Bibliothèque · Journal »** avec compteurs. _Front seul_.
- `automations-bibliotheque.N5` — **« Afficher les suivants »** (pagination par 12 sur 44). _Front seul_.
- `automations-bibliotheque.N6` — **Nouvelles routines** visibles chez Théo : « Repérer mes rendez-vous qui se chevauchent », « Reprendre la prospection quand mon agenda est vide », « Faire le point sur ma semaine commerciale », « Préparer ma semaine suivante », « Repérer les consultants à repositionner », « Reprendre contact avec mes comptes silencieux », « Débloquer les affaires qui n'avancent plus ». _Back_ : à comparer au catalogue (`routines/api.ts`) — **les 44 titres de Théo ne sont pas tous au catalogue ; liste à rapprocher** (une dizaine relevée ici).

### Liste 3 — ABSENTES CHEZ THÉO

- `automations-bibliotheque.A1` — **Réglages d'une routine activée** : heure, jour, activée, canal, relances par passage, version (`routines.field.*`, `RoutineControls.tsx`). Proposition : garder dans l'éditeur (`automations-editeur`).
- `automations-bibliotheque.A2` — **Réglage d'approbation** (`routines.approvalSettings.*`, 15 clés). Proposition : garder (« rien ne part sans validation »).
- `automations-bibliotheque.A3` — **Blocages d'activation** (`routines.blocker.*` : messagerie non connectée…). Proposition : garder, affiché dans « Voir le fonctionnement ».
- `automations-bibliotheque.A4` — **Niveau d'autonomie** (`routines.level.*`, `actions/components/ActionLevelSettings.tsx`). Proposition : garder dans Réglages > Laura.

---

## 8. `automations-editeur` — Ajuster ton automatisation

**Théo `#/actions/automations/edit/r1`** → **produit : pas d'éditeur dédié** ; création par `SequenceJourney.tsx:77` (branche signal, `useCreateAutomationRule`) et réglages dans `RoutineControls.tsx` / `RoutineDetailPage.tsx:28`.

Ce que montre Théo : « Discute du besoin, vérifie le parcours et garde la main sur chaque résultat » · fil de conversation avec Laura (« Voici le scénario conservé… », champ « Précise la règle à Laura ») · « TON SCÉNARIO » (nom, « Régler », périmètre, « Une tâche à traiter », Version 1) · chaîne **DÉCLENCHEUR → REPÉRAGE · ASSISTANT IA → PRÉPARATION · ASSISTANT IA → VALIDATION HUMAINE** · « Ce qui arrête le suivi » (seuil 30 jours, terminée ou annulée) · « Outils requis et capacité du modèle de départ » · « Essayer avant de conserver » (Tester le parcours : « ne crée ni tâche, ni message ») · Enregistrer le brouillon · Activer la simulation · Dupliquer · Archiver cette règle.

### Liste 1 — REDESSIN

- `automations-editeur.R1` — Création en 4 écrans (Quand · Pour qui · Modèle · Relecture) → **un seul écran** conversation + scénario.
- `automations-editeur.R2` — Règle en une phrase « Quand …, alors … » (`journey.review.when/then`) → chaîne de quatre maillons avec acteurs nommés.
- `automations-editeur.R3` — Suppression (`SignalSequencesSection` « Supprimer ») → « Archiver cette règle » (cohérent avec « on archive, on ne supprime pas »).
- `automations-editeur.R4` — Arrêt (`routines.field.stopCondition`) → paragraphe « Ce qui arrête le suivi ».
- `automations-editeur.R5` — Test (`routines.dryRun`) → « Tester le parcours » avec promesse « aucun nouvel essai pendant une pause ».

### Liste 2 — FEATURES NEUVES

- `automations-editeur.N1` — **Conversation de réglage avec Laura sur une règle existante** (« Précise la règle à Laura » → « Préciser »). _Back IA_ (édition en langage naturel d'une règle) ; _Démo_ : réponses scénarisées.
- `automations-editeur.N2` — **Versions d'une règle** (« Version 1 », « enregistrer la nouvelle version »). _Back_ : historique de versions (`routines.field.version` existe côté catalogue, pas côté règle d'espace). _Démo_ : 1 règle avec 2 versions.
- `automations-editeur.N3` — **« Enregistrer le brouillon » / « Activer »** deux états distincts d'une règle (brouillon ≠ activée ≠ en simulation). _Back_ : statut `draft` de règle ; c122 dit « une règle naît éteinte », pas « brouillon ».
- `automations-editeur.N4` — **Dupliquer une règle**. _Front + back léger_.
- `automations-editeur.N5` — **« Outils requis et capacité du modèle de départ »** (déplier : outils et capacités nécessaires). _Front seul_ à partir de `reads`.
- `automations-editeur.N6` — **Chaîne à deux assistants IA nommés** (REPÉRAGE puis PRÉPARATION) — voir H4.

### Liste 3 — ABSENTES CHEZ THÉO

- `automations-editeur.A1` — **Plafond de crédits sur 30 jours** et coût par préparation (`cap.*`, `cost.*`). Proposition : garder dans « Régler ».
- `automations-editeur.A2` — **Branches de déclenchement** : recrutement détecté, nouveau décideur, appel d'offres, cible qui bouge, compte inactif N jours (le curseur « nombre de jours sans action », `signal.days`). Théo n'a que « mission < 30 jours » en exemple. Proposition : garder, liste de déclencheurs dans « Régler ».
- `automations-editeur.A3` — **Preuve que ça marche / si elle ne peut pas** (`routines.field.acceptance/fallback`). Proposition : garder dans « Voir le fonctionnement ».
- `automations-editeur.A4` — **Origine d'une règle** (Règle · Planifiée · Workflow) et lien vers l'historique d'actions. Proposition : garder.

---

## 9. `projects-pipeline` — Affaires (kanban / liste)

**Théo `#/projects`** (« Affaires ») → **produit `/projects/`** : `routes/projects/index.tsx:175` → `features/projects/view/ProjectsPage.tsx:95` (menu et titre « Opportunités », `projects.page.title`) ; kanban `view/PipelineBoard.tsx:63`, tableau `view/ProjectsTable.tsx:42`.

Ce que montre Théo : « Du premier échange au démarrage. Chaque dossier conserve son besoin et ses présentations » · Importer · Nouvelle affaire · barre Pipeline · Besoins · Présentations · deux sélecteurs (Tous les responsables · Tout le portefeuille) · bascule Kanban / Liste · « 8 affaires dans cette vue » · « 417 000 € pipe ouvert HT · estimation non pondérée » · « Les signaux restent dans Signaux » · **5 colonnes** À qualifier (2, 97 000 €) · Cadrage (2, 110 000 €) · Profils présentés (2, 114 000 €) · Proposition (1, 96 000 €) · Gagnée (1, 71 000 €) · carte = pastille de compte + compte + titre + montant + « Estimation HT · 1 poste » + prochaine action + échéance + responsable + « 1 profil suivi · Voir » · « Ajouter une affaire » en pied de colonne · glisser-déposer d'une carte · Liste à 5 colonnes (Affaire / compte · Étape · Estimation HT · Prochaine action · Responsable).

### Liste 1 — REDESSIN

- `projects-pipeline.R1` — Titre « Opportunités » + phrase « Ton activité commerciale, {prénom}. » (`projects.page.introTitle`) → « Affaires » + « Du premier échange au démarrage ».
- `projects-pipeline.R2` — Étapes : **9** (Détecté · Potentiel · Qualifié · Besoin exprimé · Profils présentés · Négociation · Signé · Perdu · En sommeil, `projects.stage.states`) → **5** colonnes (À qualifier · Cadrage · Profils présentés · Proposition · Gagnée). Voir T6 / question 6.
- `projects-pipeline.R3` — Bandeau de KPI (`PipelineKpis.tsx` : projets actifs · sans prochaine action · affaires à qualifier, + résumé d'en-tête `pipeline-header-summary.ts`) → deux chiffres (« 8 affaires dans cette vue », « pipe ouvert HT »).
- `projects-pipeline.R4` — Valeur du pipe avec ses inconnues (« Valeur du pipe », « N projets sans montant saisi », `projects.pipeline.*`) → « 417 000 € pipe ouvert HT · estimation non pondérée » + total par colonne (« 97 000 € estimés »). Le mot « estimation » remplace « montant saisi ».
- `projects-pipeline.R5` — Carte : `PipelineBoard.tsx:63` (jours sans mouvement, geste suggéré, objectif, besoin principal, porteur, N profils positionnés, signaux comptés à part) → carte à 6 lignes (compte, titre, montant, « Estimation HT · N poste », prochaine action + date, responsable, « N profil suivi »).
- `projects-pipeline.R6` — Création : `CreateProjectDialog.tsx:43` (« Ouvrir une affaire » : compte, nom, objectif, montant, clôture, périmètre) → fenêtre « Créer une affaire » à **trois portes** : Saisir l'essentiel (compte, sujet, responsable) · Préparer avec Laura (partir d'un texte, relire avant d'enregistrer) · Importer ou reprendre un outil (CSV ou synchronisation).
- `projects-pipeline.R7` — Import : « Importer mon pipe » (CRM / fichier, `toolbar.importPipe`) → fenêtre « Importer sans double saisie » : choix « Objets à importer » (Affaires / Profils du vivier), CSV < 1 Mo lu localement et prévisualisé, « Télécharger un modèle » (colonnes sujet ; compte ; description ; montant), « Importer les lignes valides ».
- `projects-pipeline.R8` — Barre de filtres (recherche, six filtres rapides, vues enregistrées) → deux sélecteurs (responsable · portefeuille).
- `projects-pipeline.R9` — Barre de navigation : le pipeline et les besoins sont deux routes (`/projects/`, `/projects/needs`) sous « Opportunités » → barre à trois entrées Pipeline · Besoins · **Présentations** (la liste des présentations devient un voisin du pipeline).

### Liste 2 — FEATURES NEUVES

- `projects-pipeline.N1` — **Sélecteur « Tout le portefeuille »** (périmètre d'affichage : mon portefeuille / tout) à côté de « Tous les responsables ». _Front seul_ probable (`pipeline-scope`, test `pipeline-scope-is-sent.test.ts` existe) ; à confirmer.
- `projects-pipeline.N2` — **« 1 profil suivi · Voir »** : lien direct de la carte vers les profils suivis de l'affaire (`#/projects/:id/profiles`). _Front seul_ (`cardPositioned_one` existe, pas de lien).
- `projects-pipeline.N3` — **« Estimation HT · N poste(s) »** (nombre de postes et mention d'estimation sur chaque carte). _Front seul_ (`needs.headcount` existe).
- `projects-pipeline.N4` — **Import de profils du vivier depuis la fenêtre d'import des affaires** (un seul outil d'import à deux objets). _Front seul_ (CSV vivier : `CvCsvImportDialog.tsx`).
- `projects-pipeline.N5` — **Renvoi « Les signaux restent dans Signaux »** (le pipe ne montre pas les signaux). Côté produit, les pistes sont _dans_ le pipe (voir `.A6`). _Front seul_.
- `projects-pipeline.N6` — **Porte « Préparer avec Laura »** à la création : texte libre → affaire proposée, relue avant enregistrement. _Back IA_ partiel : `projects.create.draftFactsTitle` (« Ce que le signal apporte ») existe pour une piste ; pas pour un texte libre. _Démo_ : réponse scénarisée.

### Liste 3 — ABSENTES CHEZ THÉO

- `projects-pipeline.A1` — **Étapes « Perdu » et « En sommeil »** + onglets **Perdus** (`LostProjectsList.tsx`, `projects.lostList.*`, lien « Voir les retours d'expérience ») et **Archivés** (`ArchivedProjectsList.tsx`, `projects.archived.*`). Geste : retrouver une affaire perdue / dormante. Théo : « Gagnée » est la seule sortie. **À décider par Louis (T6)** ; proposition : garder les deux vues derrière un sélecteur « Ouvertes · Gagnées · Perdues · Archivées ».
- `projects-pipeline.A2` — **Motif de perte + REX de perte** au déplacement vers « Perdu » (`StageMovePanel.tsx`, `projects.stage.loss.*`, `lostDealRex.*` : motif déclaré / réel, distinction fait confirmé / hypothèse, périmètre ; `LostDealRexDialog.tsx`, `LostDealRexPanel.tsx`, `LostDealCaseDimensions.tsx`, `LostDealDecisionOrganisation.tsx`). Proposition : garder, déclenché par l'étape « Perdue » si elle existe.
- `projects-pipeline.A3` — **Vue Tableau configurable** : choix des colonnes (Projet · Compte · Porteur · Étape · Montant · Dernière activité · Prochaine action · Âge · Origine), « Rétablir les colonnes par défaut » (`ProjectColumnsPicker.tsx`, `projects.table.*`). Théo a la Liste mais figée à 5 colonnes. Proposition : garder « Colonnes ».
- `projects-pipeline.A4` — **Vues enregistrées** du pipe (`SavedPipelineViews.tsx`). Proposition : garder (menu « Mes vues », comme dans le planning de missions chez Théo).
- `projects-pipeline.A5` — **Filtres rapides** : Mes projets · Sans prochaine action · Vieillissantes · Sans profil positionné · À signer · Entretien cette semaine (`projects.toolbar.*`) et **recherche** (« un projet ou un compte »). Théo n'a pas de champ de recherche sur cet écran. Proposition : garder.
- `projects-pipeline.A6` — **Pistes à qualifier** (affaires repérées par une analyse, « jamais prises en main » : `PistesSection.tsx`, `PistesCount.tsx`, `PortfolioLens.tsx`, KPI `intake`, `pipeline-detections`) et **maturité du portefeuille** (Signaux · Projets plausibles · Projets qualifiés · Demandes confirmées : `portfolio/maturity-tabs.ts`). Proposition : garder ; Théo les renvoie à `#/signals` (écran du domaine « Comptes »).
- `projects-pipeline.A7` — **Alertes de stagnation** sur la carte (« ⚠ N jours sans mouvement ») et **geste suggéré** (→ à qualifier, → trouver un interlocuteur, → lancer le matching, → préparer une relance : `projects.pipeline.staleGesture.*`). Proposition : garder sur la carte.
- `projects-pipeline.A8` — **Montants inconnus nommés** (« Montant non saisi », « N projets sans montant », filtre « sans montant de cette étape », `projects.pipeline.cardNoAmount/withoutAmount*`, gardes GA-18/19). Théo affiche toujours un montant ; sa règle « À préciser » ne couvre que le TJM. **Doctrine : « non mesuré n'est jamais 0 »** — garder.
- `projects-pipeline.A9` — **Export** du pipe (`ProjectsExportButton.tsx`) et **export vers le CRM** (`projects.crmExport.*`, `actions.exportCrm`). Proposition : garder (« Exporter »).
- `projects-pipeline.A10` — **Section « Signés »** du pipe avec montant non saisi nommé (`signedSection`, `signedUnknown`). Proposition : colonne « Gagnée » de Théo.
- `projects-pipeline.A11` — **Chiffre « Probabilité / CA probable »** dans le dossier (`CalibratedProbabilityView.tsx`, `projects.probability.*`) — autorisé _dans Pilotage seulement_ (doctrine du 11/10) ; Théo n'en montre nulle part (T8).

---

## 10. `projects-fiche` — Fiche d'affaire

**Théo `#/projects/d1`** (+ `/profiles`, `/activity`) → **produit `/projects/$id`** : `routes/projects/$id.tsx:51` → `features/projects/view/ProjectDossierPage.tsx:64`.

Ce que montre Théo : fil « Retour aux affaires » · titre + « compte · responsable » · boutons **Modifier** · **Avec Laura** · **Suivi** · **frise d'étape cliquable** (À qualifier › Cadrage 3 › Profils présentés 4 › Proposition 5 › Gagnée) · trois onglets **Besoin · Profils & présentations (1) · Activité** · bandeau « prochaine information utile » (« Retour client sur Sophie… Voir les présentations ») · bloc « Le besoin » (démarrage / fin envisagés, lieu / présence, postes, TJM vente cible 720 € « HT / jour · à négocier », budget d'achat cible 540 € « interne », interlocuteur, origine « Saisie manuelle · scénario », compétences indispensables / souhaitées, bouton Qualifier) · « Ce qui reste à décider » (Calculer la marge · Périmètre · Budget et conditions · Accès au décideur) · onglet Profils : « Les profils suivis. Une présélection n'est ni un envoi ni une mission » + « Trouver des profils » + tableau · onglet Activité : « Historique de l'affaire » + « Ajouter une note ». Fenêtres : Modifier l'affaire (sujet, compte, responsable, ce que le client a exprimé, « Ajouter les conditions déjà connues ») · Avancer avec Laura (suggestion de profil, trois repères Date / Compétences / Conditions, « Examiner les profils », « Préparer la qualification ») · Suivi (Créer la prochaine tâche · Ajouter une note · Mettre en veille ou clore) · Économie de la mission (TJM vendu HT · coût journalier chargé HT · autres coûts · jours prévus → Calculer).

### Liste 1 — REDESSIN

- `projects-fiche.R1` — Page de dossier en panneaux empilés (`ProjectPropertiesContent.tsx`, `ProjectNeedsPanel.tsx`, `ProjectContactsPanel.tsx`, `ProjectDocumentsPanel.tsx`, `ProjectStepsPanel.tsx`, `ProjectSynthesisPanel.tsx`) → **3 onglets** Besoin · Profils & présentations · Activité.
- `projects-fiche.R2` — Changement d'étape : `ProjectStageControl.tsx` + `StageMovePanel.tsx` (9 états, motif de perte) → frise de 5 étapes cliquables avec compteurs de rang (3/4/5).
- `projects-fiche.R3` — « Actions et prochaines étapes » (`ProjectStepsPanel.tsx` : À faire / En attente / Fait, ajout rapide, `detail.steps.*`) + « Ajouter une prochaine action » (`detail.addNextAction`) → un seul bandeau « prochaine information utile » + fenêtre **Suivi** (prochaine tâche / note / veille ou clôture).
- `projects-fiche.R4` — Boutons d'en-tête : Partager · Demander à Laura · Actualiser et approfondir (crédits) · Archiver · Ouvrir la mission / Créer la mission · Préparer la proposition · Répondre à un appel d'offres · Planifier un rendez-vous (`projects.detail.*`) → trois boutons (Modifier · Avec Laura · Suivi).
- `projects-fiche.R5` — Conditions commerciales (`detail.commercialConditions`, `ProjectAmountControl.tsx`) → bloc « Le besoin » avec **TJM vente cible** et **budget d'achat cible** distincts, et mention « Une cible existe ; elle ne vaut pas accord client ».
- `projects-fiche.R6` — Marge : `BtmmpPanel.tsx:74` → fenêtre « Économie de la mission » (4 champs, « le taux de marge affiché est (vente − coûts) / vente. Le coût doit être fourni : aucun salaire net n'est converti »).
- `projects-fiche.R7` — Profils positionnés (liste du besoin, `NeedPositioningsTab.tsx`) → onglet « Profils & présentations » (même tableau que la liste des présentations, filtré).
- `projects-fiche.R8` — Synthèse « en 7 questions » (`ProjectSynthesisPanel.tsx`, `detail.synthesis.*`) → « Avec Laura » : réponse courte + trois repères + deux gestes.

### Liste 2 — FEATURES NEUVES

- `projects-fiche.N1` — **Section « Ce qui reste à décider »** (checklist Périmètre / Budget et conditions / Accès au décideur, chacune avec son état en une phrase, plus « Calculer la marge »). _Front seul_ (état dérivé du brief, du budget, de l'interlocuteur relié).
- `projects-fiche.N2` — **Qualification du pouvoir de décision** de l'interlocuteur (« Son pouvoir de décision reste à qualifier »). _Back_ : champ de rôle décisionnel sur le contact du dossier ; le produit a la gouvernance de partenaire (`ProjectPartnerGovernancePanel.tsx`), pas le rôle d'achat du client. _Démo_ : 1 contact qualifié, 1 non.
- `projects-fiche.N3` — **Frise d'étape avec compteurs d'avancement** (rang 3/4/5). _Front seul_.
- `projects-fiche.N4` — **« Mettre en veille ou clore »** comme choix explicite du Suivi (au lieu de « Perdu » / « En sommeil » du sélecteur d'étape). _Front_ ; dépend de T6.
- `projects-fiche.N5` — **Fenêtre « Avancer avec Laura » avec suggestion nominative de profil** (« Je commencerais par Sophie Ledran… ») et trois repères factuels. _Back IA_ (le verdict de matching existe : `matching.verdict.*`) ; _démo_ : réponse scénarisée.
- `projects-fiche.N6` — **Route `/projects/:id/profiles` et `/projects/:id/activity`** (onglets adressables). _Front seul_.

### Liste 3 — ABSENTES CHEZ THÉO

- `projects-fiche.A1` — **Créer / ouvrir la mission** depuis l'affaire gagnée (`detail.openMission/createMission`, `CreateMissionPage.tsx:25` avec `fixedProjectId`) ; Théo la propose côté Missions (« Depuis une affaire gagnée »). Proposition : garder le bouton sur la fiche d'une affaire « Gagnée ».
- `projects-fiche.A2` — **Préparer la proposition** (`/propositions`, `ProposalStudioPage.tsx:62`) et **Répondre à un appel d'offres** (`needFromRfp.*`, `features/rfp`). Chez Théo : aucun écran Propositions ni AO. **Question à Louis** : garder, où ?
- `projects-fiche.A3` — **Probabilité calibrée de l'affaire** (`projects.probability.dossierTitle`) et **catégorie de prévision** (`ForecastCategoryField.tsx`, `forecastCategory.*`). Proposition : garder dans Pilotage / fiche (doctrine).
- `projects-fiche.A4` — **Synthèse en 7 questions générée** + **Actualiser et approfondir (N crédits)** (`ProjectSynthesisPanel.tsx`, `detail.enrich`). Proposition : garder derrière « Avec Laura ».
- `projects-fiche.A5` — **Documents de l'affaire** (`ProjectDocumentsPanel.tsx`), **contacts de l'affaire** (`ProjectContactsPanel.tsx`, `detailContacts.*`), **secteurs** (`ProjectSectorsPanel.tsx`), **gouvernance partenaire** (`ProjectPartnerGovernancePanel.tsx`). Chez Théo : un interlocuteur, pas de documents. Proposition : garder, dans l'onglet Activité ou Besoin.
- `projects-fiche.A6` — **Projets similaires** (`SimilarProjectsDialog.tsx`, `similar.*`) et **provenance** de l'affaire (`ProjectProvenanceLine.tsx`, `provenance.*`) ; Théo n'a que « Origine : Saisie manuelle ». Proposition : garder.
- `projects-fiche.A7` — **Changer de porteur** (`ProjectOwnerControl.tsx`), **partager le lien** (`detail.share`), **archiver / désarchiver** (`detail.archive`). Proposition : garder dans « Modifier ».
- `projects-fiche.A8` — **Rappel et prochain rendez-vous** (`projects.reminder.*`, `detail.scheduleMeeting`) — Chez Théo : « Créer la prochaine tâche ». Proposition : garder, rendez-vous dans « Suivi ».

---

## 11. `projects-besoins` — Besoins

**Théo `#/projects/needs`** → **produit `/projects/needs`** : `routes/projects/needs.tsx:51` → `features/projects/open-needs/view/OpenNeedsPage.tsx:61` ; fiche `/projects/needs/$needId` : `NeedDetailPage.tsx:159`.

Ce que montre Théo : « Les demandes à qualifier ou à couvrir, reliées à leur affaire » · « Ajouter un besoin » · phrase de chaîne « Un besoin qualifié → critères de recherche → profils comparés → sélection » · liens « Ouvrir les rapprochements » et « Politique de matching » (`#/settings/matching`) · onglets Pipeline · Besoins · Présentations · « 8 demandes » · tableau à 5 colonnes (Besoin / compte · Compétences · Démarrage · TJM vente cible « Estimation, pas un tarif signé » · Profils suivis) · statut Ouvert / À qualifier / Couvert · « Rapprocher » par ligne · fenêtre « Ajouter un besoin » : Affaire (Choisir…) → Continuer.

### Liste 1 — REDESSIN

- `projects-besoins.R1` — Titre « Besoins ouverts » (`projects.openNeeds.title`) + intro « Les besoins à pourvoir, {prénom} » → « Besoins ».
- `projects-besoins.R2` — Table `OpenNeedsTable.tsx` (kanban + liste, colonnes porteur, télétravail, âge d'étape…) → table figée à 5 colonnes.
- `projects-besoins.R3` — Statuts : `projects.needStatus.*` (17 valeurs : à qualifier, qualifié, chez le client, en entretien, en négociation, en veille, à réactiver, ouvert, couvert…) → trois pastilles (Ouvert · À qualifier · Couvert).
- `projects-besoins.R4` — Création : `CreateNeedDialog.tsx` (titre, projet de rattachement, interlocuteur, porteur, « créer un projet pour… » / « créer sans projet ») et `NeedWizard.tsx:164` (69 clés) → fenêtre **Ajouter un besoin** : choix de l'affaire puis « Continuer » (la suite n'est pas dessinée).
- `projects-besoins.R5` — Rapprochement : `NeedMatchTab.tsx` dans la fiche du besoin, lancé depuis « Lancer le rapprochement » → bouton **Rapprocher** sur chaque ligne (route `#/projects/:id/matching/:needId`, voir `projects-rapprochement`).
- `projects-besoins.R6` — TJM : `NeedRateComparison.tsx` (« Tarif cible et tarif vendu chez ce client ») → colonne « TJM vente cible » + « Estimation, pas un tarif signé ».
- `projects-besoins.R7` — Barre d'accès : `OpenNeedsIntro` → rappel de la chaîne en une phrase + lien « Politique de matching » (vers Réglages).

### Liste 2 — FEATURES NEUVES

- `projects-besoins.N1` — **Statut « Couvert »** (le besoin est servi par un profil suivi / une affaire gagnée). _Front + back léger_ : `NeedWonProjectCard.tsx` sait « Projet gagné » ; un statut `covered` dérivé est à ajouter. _Démo_ : déjà un besoin couvert (Atlas Mobilités).
- `projects-besoins.N2` — **« Politique de matching »** : lien contextuel vers `#/settings/matching` (ordre, sources, seuils). Le produit a des réglages de matching dispersés (`settings` : `reverseMarketSettings`, `commercialLoadSettings`) ; une page « Politique de matching » est du domaine D (Réglages).
- `projects-besoins.N3` — **Phrase de chaîne « Un besoin qualifié → critères → profils comparés → sélection »** comme repère permanent. _Front seul_.
- `projects-besoins.N4` — **Colonne « Profils suivis »** (nombre de profils suivis par besoin). _Front seul_ (`NeedShortlistPreview.tsx`).

### Liste 3 — ABSENTES CHEZ THÉO

- `projects-besoins.A1` — **Kanban des besoins** (colonnes À qualifier · Qualifié · Chez le client · En entretien · En négociation · En veille · À réactiver · Ouvert ; `NeedsKanban.tsx:113`, `needsKanban.*`, pied de carte « Qualifié depuis N j », bandeau Besoins ouverts / Matching à traiter / Présentations en cours / Sans profil positionné). Proposition : garder (bascule Kanban / Liste comme pour le pipeline).
- `projects-besoins.A2` — **Fiche du besoin** `/projects/needs/$needId` (`NeedDetailPage.tsx:159` : Vue d'ensemble · Rapprochement · Positionnements · Notes & activités · Documents · Historique ; `NeedVerdictBanner`, `NeedRequirementsCard`, `NeedFramingCard`, `NeedStepsCard`, `NeedConvergenceStateControl`, `NeedProfileTypeAgreementControl`, `NeedHistoryTab`, `NeedDocumentsTab`). Théo n'a **pas de fiche de besoin** : le besoin vit dans la fiche d'affaire (« Le besoin »). **Question à Louis** : fusionner (un besoin = un bloc de la fiche d'affaire) ou garder la fiche ?
- `projects-besoins.A3` — **Import de fiches de poste** avec extraction (compte client, plusieurs fichiers, compétences trouvées, « Déjà importé chez ce compte » : `ImportNeedsDialog.tsx`, `importNeeds.*`) et **besoin depuis un appel d'offres** (`NeedFromRfpPreview.tsx`, `needFromRfp.*`). Proposition : garder derrière « Ajouter un besoin » (porte « Importer »).
- `projects-besoins.A4` — **Sourcing externe** (`NeedExternalSourcing.tsx`, `needExternalSourcing.*`), **prospects inverses** (`NeedReverseProspects.tsx`), **rails de découverte** (`NeedDiscoveryRails.tsx`), **proposition d'un porteur** (`NeedOwnerSuggestion.tsx`). Proposition : garder, depuis la fiche du besoin.
- `projects-besoins.A5` — **Vues enregistrées, tiroir de filtres, barre de sélection, export** (`SavedNeedViews.tsx`, `NeedsFilterDrawer.tsx`, `NeedsSelectionBar.tsx`, `NeedsExportButton.tsx`), **colonnes porteur / télétravail** (`OpenNeedsOwnerColumn`, `OpenNeedsRemoteColumn`). Proposition : garder.
- `projects-besoins.A6` — **Forfait supervisé** (`SupervisedForfaitFields.tsx`, `missions.supervisedForfait`) : besoin sans consultants affectés. Proposition : garder dans la création (nature du contrat).
- `projects-besoins.A7` — **Contrôle « staffable »** (`NeedStaffableControl.tsx`, `projects.staffable.*`) et **bandeau de staffing** (`NeedStaffingBanner.tsx`). Proposition : garder.
- `projects-besoins.A8` — **Verdict du besoin** (`NeedVerdictBanner.tsx`, `NeedVerdictProfiles.tsx`, `needVerdict.*` : peut-on y répondre ?) et **hygiène** (besoins périmés « Périmé — à revérifier », `OpenNeedsHygiene`). Proposition : garder.
- `projects-besoins.A9` — **Propositions commerciales du besoin** (`NeedProposalsPanel.tsx`, `projects.proposals.*`). Voir `projects-fiche.A2`.
- `projects-besoins.A10` — **Rôles recherchés** (nombre de personnes, TJM cible, nature du contrat régie / forfait / recrutement, compétences obligatoires / souhaitées : `projects.needs.*`, `ProjectNeedsPanel.tsx`). Théo : « Postes 1 » + compétences. Proposition : garder la nature du contrat.

---

## 12. `projects-rapprochement` — Les bons profils, pour ce besoin / Où positionner {talent}

**Théo `#/projects/:affaire/matching/:besoin`** (« Les bons profils, pour ce besoin. ») et **`#/talents/:id/matching`** (« Où positionner Sophie ? ») → **produit** : onglet `NeedMatchTab.tsx` dans `/projects/needs/$needId`, tiroir `matching/view/MatchDrawer.tsx`, panneau `consultants/view/ConsultantMatchPanel.tsx` (« Pousser un profil sur un besoin ») et rail `NeedsMatchRail.tsx`.

Ce que montre Théo : « Retour au besoin » · **Relancer le matching** · **Critères & sources** · « 1 rapprochement à examiner · 7 hors sélection » · « Prélecture sur les données du scénario. Lance le matching pour en conserver un instantané » · « Aucun profil envoyé » · champ de recherche · « Voir les écarts » · cartes (nom, métier, ville, source « Vivier de l'espace », « Déjà dans le suivi », **N critères étayés · N à confirmer**, quatre critères avec ✓ / ○ : Compétences indispensables · Période & charge · Lieu & présence · Conditions économiques, chacun avec sa phrase et sa source) · **Ouvrir le suivi** (si déjà suivi) / **Présélectionner** · **Voir la correspondance** (fenêtre : critères étayés, **indice documenté 100/100** « sur les données évaluables, pas une probabilité », **couverture 100 %**, six critères dont Expérience et Langues « Non imposé », ligne de source) · panneau « Critères de la recherche » (indispensables, souhaités, période / charge, lieu, conditions « 540 € HT / jour maximum », sources « Vivier Bellum ») avec **Modifier les critères** / **Choisir les sources** / **Comment l'ordre est calculé** · fenêtre « Les critères de ce rapprochement » (compétences, dates, ville, présence, budget d'achat maximum, charge %, expérience minimum, langues, **« Ce qui écarte un résultat »** — 4 cases —, **importance relative** total 100 % sur 5 axes, « Enregistrer et relancer ») · côté talent : bloc « Partir de ce profil » (compétences documentées, disponibilité déclarée, qualification) et « Pas encore de besoin ? Chercher des comptes ».

### Liste 1 — REDESSIN

- `projects-rapprochement.R1` — Verdict en cinq niveaux (Fortement défendable · À qualifier · Alternative · Non défendable · Non évaluable, `matching.verdict.*`) + score « Adéquation 78/100 » et « Poussable » (`matching.scores.*`) → **« N critères étayés · N à confirmer »** + indice documenté + couverture, **sans verdict nominal**.
- `projects-rapprochement.R2` — Quatre blocs de résultats (Recommandés · Limites · Écartés · Non évaluables, `matching.buckets.*`) → une seule liste « à examiner » + « N hors sélection » repliés derrière **Voir les écarts**.
- `projects-rapprochement.R3` — Carte `MatchCard.tsx` (compétences manquantes, « à valider avec cette personne », Ouvrir la fiche, Expliquer ce classement, Positionner, Écarter, Valider la disponibilité, Préparer le CV, Relancer) → carte à 4 critères ✓ / ○ + trois boutons (Ouvrir le suivi · Présélectionner · Voir la correspondance).
- `projects-rapprochement.R4` — Explication : `MatchExplainSheet.tsx` (« Expliquer ce classement ») → fenêtre « Voir la correspondance ».
- `projects-rapprochement.R5` — Positionner : `PositionDialog.tsx` (« Positionner sur ce besoin ») → bouton **Présélectionner** (et rappel « Une correspondance ne signifie pas une présentation autorisée »).
- `projects-rapprochement.R6` — Lancement : calcul à l'ouverture (`NeedAutoMatchNote.tsx`) → **prélecture** + instantané conservé à la demande (« Relancer le matching »).
- `projects-rapprochement.R7` — Critères du besoin (`NeedRequirementsCard.tsx`) → fenêtre **Critères & sources** propre à _cette recherche_ (« ne réécrit pas le brief du client »).

### Liste 2 — FEATURES NEUVES

- `projects-rapprochement.N1` — **Pondération réglable des axes** (compétences · disponibilité · lieu · conditions · expérience, total 100 %) **et exclusions réglables** (« Ce qui écarte un résultat » : indispensable non documenté, chevauchement de charge, coût > cible, inconnus conservés comme points à qualifier). _Back_ : le moteur a des seuils (`criteria.threshold`) mais pas de pondération par recherche ; contrat `packages/contracts` à étendre (« ajout seulement »). _Démo_ : un jeu de critères semé par besoin.
- `projects-rapprochement.N2` — **Instantané conservé** d'un matching (relancer = nouvel instantané daté). _Back_ : table d'instantanés de matching. _Démo_ : 1 instantané par besoin semé.
- `projects-rapprochement.N3` — **Indice documenté + couverture séparés** (« Un inconnu ne devient pas un non. La couverture est présentée séparément de l'indice »). _Back + front_ : aligne le score sur la doctrine « un score n'est jamais nu » ; c'est une _amélioration de la règle_, pas un conflit.
- `projects-rapprochement.N4` — **Choix des sources** (« Vivier Bellum » ; autres sources : « Choisir les sources ») et **« Comment l'ordre est calculé »**. _Front seul_ + texte ; côté produit `TransparencyBanner.tsx` existe.
- `projects-rapprochement.N5` — **Rapprochement depuis le profil** (`#/talents/:id/matching`) avec séparation « besoins exprimés ou à qualifier » / « environnements simplement compatibles ». _Back partiel_ : `InverseMatchPanel.tsx` / `ConsultantMatchPanel.tsx` couvrent « pousser un profil sur un besoin » ; la séparation besoin / environnement est nouvelle.
- `projects-rapprochement.N6` — **Marqueur « Déjà dans le suivi »** + « Ouvrir le suivi » (lien vers la présentation existante). _Front seul_.
- `projects-rapprochement.N7` — **Recherche dans les rapprochements** (champ de filtre sur les résultats). _Front seul_.

### Liste 3 — ABSENTES CHEZ THÉO

- `projects-rapprochement.A1` — **Comparer plusieurs profils côte à côte** (`CompareTable.tsx`, `consultants.match.compare`, « Comparaison des profils sélectionnés »). Proposition : garder (case à cocher par carte).
- `projects-rapprochement.A2` — **Préparer / adapter le CV pour ce besoin** (`CvStudioSheet.tsx`, `matching.cvStudio.*`, « Adapter le CV », `bulkCvRewrite*`) et **brief de soutenance** (`ConsultantBriefDialog.tsx`). Théo renvoie au « Dossier de compétences » de la présentation. Proposition : garder derrière « Présélectionner ».
- `projects-rapprochement.A3` — **Relancer le consultant** (`RelaunchConsultantDialog.tsx` : « Point sur ta disponibilité », ouvrir dans la messagerie) et **valider la disponibilité**. Proposition : garder.
- `projects-rapprochement.A4` — **Quand zéro profil : « Pourquoi zéro profil ? » + prochains gestes** (clarifier le besoin, négocier un critère, réactiver, élargir la zone, sourcer, recommandation, partenaire, décliner, trouver des missions : `matching.nextBestMove.*`, `no-match-causes.ts`). Proposition : garder (c'est le geste utile quand la liste est vide).
- `projects-rapprochement.A5` — **Ce que les refus déjà reçus disent du besoin** (`feedbackLearnings`) et **historique chez ce client** (« Déjà refusé / déjà en cours / déjà retenu chez ce client », `consultants.match.clientHistory.*`). Proposition : garder.
- `projects-rapprochement.A6` — **« À dire au client avant qu'il ne le découvre »** (risques d'un profil, `consultants.match.risks`) et **« Pourquoi ce profil »** (`reasons`). Proposition : garder dans « Voir la correspondance ».
- `projects-rapprochement.A7` — **Écarter un profil de ce classement** (`card.dismiss`) et retour **Retenu / Refusé** du client (`feedbackPrompt`, `retained`, `refused`). Proposition : garder.
- `projects-rapprochement.A8` — **Bandeau de transparence** (`TransparencyBanner.tsx`, gratuité : « Gratuit — aucun crédit débité »). Proposition : garder (« Comment l'ordre est calculé »).

---

## 13. `projects-presentations` — Présentations

**Théo `#/projects/submissions` = `#/talents/submissions`** (même écran) et **`#/submissions/sub1`** → **produit** : `SubmissionsView.tsx:66` (vivier, fiche besoin), `SubmissionsPanel.tsx`, fiche `/submissions/$id` (`routes/submissions/$id.tsx:14` → `SubmissionDossierPage.tsx:25`).

Ce que montre Théo : « Un consultant, un besoin et une histoire distincte. Aucun envoi ne se déduit d'un déplacement de carte » · « Ajouter une présentation » (fenêtre « Relier un profil à un besoin » : Besoin + Profil → « Vérifier le positionnement ») · filtre « En cours » · « 5 présentations » · tableau (Consultant · Besoin / client · Suivi [Présenté · Entretien client · Retenu · Présélection] avec « Présentation consignée le 16 oct. » ou « Aucun envoi consigné » · Canal / responsable · Prochaine échéance · Ouvrir). **Fiche** : « Toutes les présentations » · Mettre à jour · blocs Affaire / Présentation · « Où en est cette présentation ? » (Étape · Date présentée · Canal · Responsable · Retour attendu · **Accord à présenter** « Vérifié dans le scénario » · **Trace** « Envoi consigné… Consignation locale, pas un accusé de transport ») · **Version du dossier** « À préparer » · Dossier de compétences · Préparer le message · **Consigner un entretien** · « Historique et retours » · Ajouter une note.

### Liste 1 — REDESSIN

- `projects-presentations.R1` — Étapes : `submissions.stages` (CV envoyé · Retenu · Entretien · Accepté · Refusé · Retiré) + 21 sous-statuts (`submissions.substatuses` : à qualifier, accord consultant en attente, prêt à présenter, à valider, présenté, accusé réception, entretien à planifier / programmé / réalisé, second entretien, retenu, refusé, retiré, sans réponse, converti en mission, archivé, échec de présentation, présenté copié manuellement, à poursuivre, à clarifier, à négocier) → **4 libellés** (Présélection · Présenté · Entretien client · Retenu).
- `projects-presentations.R2` — Entrée : liste intégrée à la fiche du vivier et à la fiche besoin (`SubmissionsPanel.tsx`) → liste autonome, **voisine du pipeline et du vivier** (même écran dans les deux barres d'onglets).
- `projects-presentations.R3` — Création : positionner depuis un rapprochement (`PositionDialog.tsx`) → fenêtre **Relier un profil à un besoin** (deux listes, puis « Vérifier le positionnement »).
- `projects-presentations.R4` — Fiche : `SubmissionDetailsDialog.tsx` (détails), `SubmissionTimelineDialog.tsx` (chronologie), `NextActionDialog.tsx` → **une page** à blocs (affaire, présentation, version du dossier, historique).
- `projects-presentations.R5` — Trace d'envoi : le produit distingue « présenté (copié manuellement) » et l'échec de présentation → Théo écrit **« Envoi consigné… Consignation locale, pas un accusé de transport »** (cohérent avec « Fait ne porte jamais de preuve d'envoi »).
- `projects-presentations.R6` — Retour client : `SubmissionFeedbackDialog.tsx` (« Non abordé · En dessous · Au-dessus » sur le tarif) → bloc « Historique et retours » (note libre).

### Liste 2 — FEATURES NEUVES

- `projects-presentations.N1` — **Champ « Accord à présenter »** (vérifié / à obtenir) bloquant la préparation du message : le produit a « accord consultant en attente » comme sous-statut (`consultant_agreement_pending`) et un `NeedProfileTypeAgreementControl`, mais pas un champ de dossier. _Front + back léger_ (booléen daté + preuve). _Démo_ : un accord vérifié, un manquant.
- `projects-presentations.N2` — **« Version du dossier : à préparer »** + lien vers le dossier de compétences de la présentation. _Front seul_ (`ConsultantCvDialog.tsx` / `studio/` existent ; lier la version à la présentation = back léger).
- `projects-presentations.N3` — **« Préparer le message »** (message de présentation au client, brouillon relu) depuis la fiche. _Front seul_ si `ExecuteActionDialog`/messagerie le permettent ; sinon brouillon via Laura.
- `projects-presentations.N4` — **Prochaine échéance** (date de retour attendu) en colonne de liste. _Front seul_ (`NextActionDialog.tsx`).
- `projects-presentations.N5` — **« Consigner un entretien »** (un geste unique) ; le produit a `ScheduleInterviewDialog.tsx` + `InterviewBriefDialog.tsx`. _Front seul_.
- `projects-presentations.N6` — **Filtre « En cours »** (liste des présentations ouvertes seulement). _Front seul_.

### Liste 3 — ABSENTES CHEZ THÉO

- `projects-presentations.A1` — **Entonnoir** (`SubmissionFunnelSummary.tsx`, `submissions.funnel.*`) et **digest** (`submissions.digest.*`). Proposition : garder dans Pilotage > Équipe ou en tête de liste.
- `projects-presentations.A2` — **Retour du consultant** (`SubmissionConsultantFeedbackDialog.tsx`, `consultantFeedback.*`). Geste : consigner ce que le consultant pense de l'entretien. Proposition : garder dans « Consigner un entretien ».
- `projects-presentations.A3` — **Brief d'entretien** (`InterviewBriefDialog.tsx`, `interviewBrief.*`, 17 clés). Proposition : garder (« Préparer l'entretien »).
- `projects-presentations.A4` — **Motifs de refus / clôture** (`submissions.reasons.*`, `actions.close`) et statuts « Refusé · Retiré · Sans réponse · Converti en mission · Archivé ». Théo : 4 états d'avancement seulement, aucune sortie. Proposition : garder (**liée à T6**).
- `projects-presentations.A5` — **Conversion en mission** (« Converti en mission ») depuis une présentation retenue. Chez Théo : « Retenu » est la dernière étape ; la création de mission se fait côté Missions (« Depuis une affaire gagnée »). **Question à Louis**.
- `projects-presentations.A6` — **Tarif et écart de tarif** affichés sur la présentation (`submissions.rate/noRate`). Proposition : garder.

---

## 14. `talents-vivier` — Vivier

**Théo `#/talents`** (« Vivier ») → **produit `/consultants/`** : `routes/consultants/index.tsx:101` → `features/consultants/view/ConsultantsPage.tsx:81` (titre « Vivier », menu « Talents »).

Ce que montre Théo : « Retrouver les bonnes expertises, vérifier la disponibilité, préparer le prochain positionnement » · Importer · Ajouter un profil · barre **Vivier · Recrutement · Présentations** · sélecteur « Tous les profils » · bascule **Liste / Cartes** · « 8 personnes » · rappel « La disponibilité déclarée reste distincte du planning de missions » · tableau (Personne / expertise avec relation Freelance · Salarié · Candidate · Compétences déclarées · **Disponibilité & planning** [En mission · Fin prévue 23 oct. / Démarrage prévu / date + « Confirmée le 15 oct. » / **À reconfirmer** « Date annoncée 2 nov. · confirmation 10 juil. »] · Localisation + modalité · Suivi « N présentation(s) » + responsable · **Rapprocher**) · fenêtre « Ajouter un profil » à trois portes (Saisir l'essentiel · Préparer avec Laura · Importer ou reprendre un outil) · fenêtre « Importer sans double saisie » (Profils du vivier ; CSV < 1 Mo ; colonnes nom ; metier ; competences ; ville ; email ; « une identité identique est à vérifier, jamais fusionnée automatiquement »).

### Liste 1 — REDESSIN

- `talents-vivier.R1` — Titre « Vivier » + « Ton vivier, {prénom}. » + bouton « Demander à Laura » / « Chercher un profil » (`consultants.page.*`, `VivierIntro.tsx:73`) → titre + phrase fixe + deux boutons (Importer · Ajouter un profil).
- `talents-vivier.R2` — Bandeau de chiffres `TalentStatsBanner.tsx` (talents dans le vivier · disponibles maintenant · profils enrichis · fiches sous le seuil · favoris : `consultants.stats.*`) → une ligne « 8 personnes ». Les autres chiffres disparaissent de l'écran.
- `talents-vivier.R3` — Colonnes (Nom · Titre · Compétences · Séniorité · Localisation · Statut · Disponibilité · TJM · Télétravail · Contrat · Complétude · Dernière interaction · Actions : `consultants.table.*`, `vivierTableColumns.ts`) → **5 colonnes** : le TJM, la séniorité, la complétude et la dernière interaction quittent la liste.
- `talents-vivier.R4` — Disponibilité : sept états (Disponible · Sous 1 mois · Sous 3 mois · Indisponible · Non renseignée · En mission · À confirmer, `TalentAvailabilityBadge.tsx`) → **statut dérivé du planning + déclaration datée** (« En mission, fin prévue » · « Démarrage prévu » · date confirmée · « À reconfirmer » avec l'âge de la confirmation).
- `talents-vivier.R5` — Filtres : compétences, TJM min / max, zone, secteur, type de profil, libre avant le, sans contact depuis N mois, disponibilité, séniorité + tiroir « Plus de filtres » (`TalentFilters.tsx`, `TalentFilterDrawer.tsx`) → un sélecteur « Tous les profils ».
- `talents-vivier.R6` — Ajout : `ConsultantFormDialog.tsx:59` (108 clés), dépôt de CV (`CvDropZone.tsx`), lecture automatique → fenêtre à **trois portes**.
- `talents-vivier.R7` — Import : cinq fenêtres (CSV `CvCsvImportDialog.tsx`, e-mail `CvMailImportDialog.tsx`, ZIP `CvZipImportDialog.tsx`, disponibilités `AvailabilityImportDialog.tsx`, CV unique `CvSingleImportDialog.tsx`) → **une** fenêtre CSV partagée avec les affaires.
- `talents-vivier.R8` — Action de ligne : menu « Où placer {nom} · Autres actions · Compétences » (`VivierRowParts.tsx:89-109`) → bouton **Rapprocher**.
- `talents-vivier.R9` — Présentations du talent : colonne et section « Positionnements » (`consultants.submissionsSection`, `TalentPlacementsChip.tsx`) → « N présentation(s) » + responsable en colonne « Suivi ».
- `talents-vivier.R10` — Liste / cartes (`VivierTable.tsx`, `VivierCardList.tsx`) → même bascule, cartes de Théo (nom, métier, compétences, ville · relation, disponibilité, « Profil »).

### Liste 2 — FEATURES NEUVES

- `talents-vivier.N1` — **Séparation explicite « disponibilité déclarée » / « planning de missions »** (phrase permanente + deux informations distinctes par ligne). _Front + back léger_ : la fin de mission vient du planning, la date annoncée est une déclaration datée avec sa dernière confirmation (`TalentRatesTab.tsx` a « Préparer une revalidation » ; `consultants.availability.*` n'a qu'un enum). Champ `availability_confirmed_at` à confirmer. _Démo_ : 3 profils à reconfirmer (déjà chez Théo).
- `talents-vivier.N2` — **Statut « À reconfirmer »** quand la confirmation date de plus de N jours (« confirmation 10 juil. 2026 »). _Front seul_ si la date de confirmation est stockée ; sinon _back_.
- `talents-vivier.N3` — **Relation « Candidate / Candidat »** à côté de Salarié / Freelance (`consultants.contract.*`: cdi, cdd, freelance, portage, sous-traitance). Voir `talents-recrutement`.
- `talents-vivier.N4` — **Colonne « Suivi » avec le responsable du profil** (Théo, Maëva). _Front seul_ (attribution de la fiche existe : `TalentDetailHeader.tsx:539-553`) — voir H6.
- `talents-vivier.N5` — **Porte « Préparer avec Laura »** à l'ajout (texte libre → fiche relue avant enregistrement). _Front seul_ (`intake.paste.*` fait déjà « créer la fiche depuis ce texte »).
- `talents-vivier.N6` — **Import unifié « Objets à importer » (Affaires / Profils du vivier)** — voir `projects-pipeline.R7`.

### Liste 3 — ABSENTES CHEZ THÉO

- `talents-vivier.A1` — **Dépôt de CV** (glisser-déposer, plusieurs CV, un dossier, une archive ZIP, une pièce jointe d'e-mail), **lecture automatique** et ses bandeaux (`CvDropZone.tsx`, `CvAutoReadBanner.tsx` « Relancer les échecs », `CvCompletenessCatchUpBanner.tsx` « Relire les CV incomplets », `CvImportNextSteps.tsx`). Théo n'accepte que « Joindre un texte » (« Aucun parsing PDF/Word n'est simulé »). **Question à Louis** : le CV déposé est le cœur du vivier ; garder absolument, proposition = porte « Importer ou reprendre un outil ».
- `talents-vivier.A2` — **Détection de doublons** à l'ajout (même e-mail, même téléphone, même nom + employeur, même profil public, même fichier : `intake.duplicate.*`, « Ce n'est pas la même personne, créer quand même ») et **panneau d'identité** (`TalentIdentityPanel.tsx`). Théo l'évoque seulement dans l'import. Proposition : garder.
- `talents-vivier.A3` — **Sélection multiple** : archiver la sélection, exporter en CSV, **supprimer définitivement** (RGPD, `TalentSelectionBar.tsx`, `TalentEraseDialog.tsx`, `consultants.erase.*`), rapport d'archivage refusé (`BulkArchiveReport.tsx` : « en mission jusqu'au… »). Geste d'effacement RGPD (doctrine c67). Proposition : garder, **ne pas retirer**.
- `talents-vivier.A4` — **Export** (CSV, ATS : `VivierIoMenus.tsx:90`, `AtsExportButton.tsx`, `BulkExportButton.tsx`, `consultants.atsExport/bulkExport`). Proposition : garder (« Exporter »).
- `talents-vivier.A5` — **Vues rapides et vues enregistrées** (Disponibles sous 30 jours · En intercontrat · Jamais positionnés · À recontacter · Sans mission récente · Candidats ; `consultants.views.*`, `SavedTalentViews.tsx`). Proposition : garder, dans le sélecteur « Tous les profils ».
- `talents-vivier.A6` — **Complétude et hygiène** : score de complétude (`TalentCompletenessScore.tsx`, `Completeness.tsx`), badge d'hygiène (`HygieneBadge`), « fiches sous le seuil », **compétences prouvées uniquement**. Proposition : garder (« on n'affiche pas ce qu'on n'a pas »).
- `talents-vivier.A7` — **Rapprochement groupé** : « Lancer le rapprochement » proposé à l'ajout d'un profil (`nextGesture.*`, `ConsultantsPage.tsx:1049-1071`), comparaison de profils sélectionnés (`ConsultantMatchPanel.tsx`), `NeedsMatchRail.tsx` (« Voir tous les matchings »). Proposition : garder, gestes de `projects-rapprochement`.
- `talents-vivier.A8` — **Panneau latéral d'une fiche** (`RecordPanel.tsx`, « Ouvrir la fiche complète ») et **liens vers affaire / besoin / présentation / mission** depuis la ligne. Proposition : garder.
- `talents-vivier.A9` — **Pagination** (`ConsultantsPage.tsx:819-850`, taille de page) et **états** : erreur de chargement, aucun talent pour « {{critère}} », « Retirer ce filtre », « Afficher les archivés ». Proposition : garder.
- `talents-vivier.A10` — **Recherche LinkedIn / enrichissement** (`LinkedinLookup.tsx`, `TalentEnrichAction.tsx` : « Enrichir (1 crédit) », « Chercher par nom »). Proposition : garder dans la fiche.
- `talents-vivier.A11` — **Expertise manquante** (`MissingExpertisePanel.tsx`, `MissingExpertiseLink.tsx`, `consultants.missingExpertise.*`) et **veille technologique** (`consultants.radar.*`). Proposition : garder.
- `talents-vivier.A12` — **Favoris** (`consultants.favorite.*`, « Voir mes favoris »). Proposition : garder.
- `talents-vivier.A13` — **Import de disponibilités** (.csv / .xlsx, `AvailabilityImportDialog.tsx`). Proposition : garder derrière « Importer ».

---

## 15. `talents-recrutement` — Recrutement

**Théo `#/talents/pipeline`** → **produit : aucun écran**. Le vivier a un « type de profil » (candidat / salarié / freelance : `consultants.filters.engagementKind`, vue rapide « Candidats », `consultants.stats.candidatesOutside`) mais **pas d'étape de recrutement** (aucune colonne ni table dans `apps/api/src/modules/consultants/`).

Ce que montre Théo : « La qualification de la personne, indépendamment de ses présentations chez les clients » · « Ajouter un profil » · barre Vivier · Recrutement · Présentations · **kanban à 5 colonnes** : À qualifier (1) · Échange prévu (1) · Qualifié (3) · En veille (0) · Écarté (0) · carte (nom, métier, ville · relation, « Changer l'étape ») · colonne vide « Aucun profil à cette étape » · fenêtre « Qualifier le suivi de la personne » (« Cette étape ne change pas ses présentations sur les besoins ni ses affectations de mission » ; Étape de recrutement ; Retour ou motif ; Enregistrer).

### Liste 1 — REDESSIN

- `talents-recrutement.R1` — Le « type de profil » comme filtre (`engagementKind`) et la vue « Candidats » (`consultants.views.candidates`) → un écran à part dont l'axe est l'**étape de recrutement** (la personne, pas la mission).

### Liste 2 — FEATURES NEUVES

- `talents-recrutement.N1` — **Écran Recrutement** (kanban de 5 étapes + « Changer l'étape »). _Back_ : colonne / table `talent_recruitment_stage` (valeurs `to_qualify`, `call_planned`, `qualified`, `on_hold`, `discarded`) + horodatage + motif, migration « ajout seulement » ; contrat dans `packages/contracts` ; _front_ : kanban + fenêtre. _Démo_ : 5 profils répartis (1 / 1 / 3 / 0 / 0 chez Théo) dans `demo-dataset.ts` et classement dans `demo-coverage.ts`.
- `talents-recrutement.N2` — **Motif / retour** consigné à chaque changement d'étape (historique). _Back_ (journal d'étapes).
- `talents-recrutement.N3` — **Principe d'indépendance** : l'étape de recrutement n'altère ni présentations ni affectations. _Doctrine_ à écrire (invariant testable).
- `talents-recrutement.N4` — **Étape « Écarté »** pour une personne (sans suppression). _Doctrine_ : « on archive, on ne supprime pas » ; l'écarté se retrouve (≠ effacement RGPD c67). Lien avec la règle « aucun critère protégé ne pèse dans le rang d'une personne » : le motif libre ne doit pas devenir un critère protégé — **à cadrer avec Louis**.

### Liste 3 — ABSENTES CHEZ THÉO

- `talents-recrutement.A1` — Aucune : l'écran n'existe pas côté produit. **Question à Louis** : « Écarté » et « En veille » touchent à des données de personnes (RGPD) — une durée de conservation est-elle attendue (`consultants.retention.*`, `consultants.consent.*`) ?

---

## 16. `talents-fiche` — Fiche talent

**Théo `#/talents/t1`** (+ `/presentations`, `/documents`, `/activity`) → **produit `/consultants/$id`** : `routes/consultants/$id.tsx:8` → `features/consultants/view/detail/TalentDetailPage.tsx:134` (onglets `profile · skills · delivery · documents · notes · consent`, `:113`).

Ce que montre Théo : « Retour au vivier » · nom, métier · ville, relation, responsable, « Fiche de démonstration » · **Avec Laura** · **Trouver un besoin** · deux objectifs « Comparer les besoins » / « Explorer les comptes » · onglets **Profil · Présentations (1) · Documents (0) · Activité** · bandeau de disponibilité « En mission · Fin prévue 23 oct. 2026 — Une fin prévue ne confirme pas la disponibilité du consultant » + **Actualiser** (fenêtre : date annoncée disponible, dernière confirmation, présence souhaitée, source / note) · **Expertise & qualification** (Modifier : fenêtre nom / pseudonyme, métier, compétences, localisation, relation, synthèse factuelle, conditions & suivi) · relation · expérience déclarée 9 ans · localisation · télétravail · **TJM vente indicatif 720 € « À confirmer par mission »** · **coût journalier chargé 500 € « Interne · aucun taux de charges déduit »** · « Expériences utiles » · « Missions et engagements » (mission précédente, dates, 100 %, Ouvrir) · onglet Documents : « Versions du dossier de compétences » + **Préparer un dossier** (fenêtre : titre, résumé à relire, masquer l'identité, mettre en premier les compétences communes au besoin ; « le CV source reste intact, salaire / coût / notes internes exclus ») + « Documents source » + Joindre un texte · onglet Activité : « Notes et échanges » + Ajouter une note.

### Liste 1 — REDESSIN

- `talents-fiche.R1` — Six onglets (Profil · Compétences · Missions & disponibilité · Documents · Activité · Conformité : `TAB_KEYS`, `consultants.detail.tabs.*`) + sous-onglets (identité, disponibilité & TJM, positionnements, missions, dossier, revue du CV) → **quatre onglets** Profil · Présentations · Documents · Activité.
- `talents-fiche.R2` — En-tête `TalentDetailHeader.tsx` (écrire, appeler, où placer, compléter les informations, attribution à un membre, copier le lien, photo) → en-tête sobre + deux boutons (Avec Laura · Trouver un besoin).
- `talents-fiche.R3` — Disponibilité : `TalentRatesTab.tsx` (« Disponibilité & TJM », « Préparer une revalidation », historique de taux `detail.rateHistory`, `tjmMetadata`) → bandeau + fenêtre **Actualiser la disponibilité** (4 champs).
- `talents-fiche.R4` — Compétences : onglet dédié (`TalentSkillsDialog.tsx` : niveau Bases / Autonome / Confirmé…, années, dernière utilisation, retirer ; `detail.skillYears/skillLastUsed`) → puces dans « Expertise & qualification ».
- `talents-fiche.R5` — Édition : `ConsultantFormDialog.tsx` (108 clés : TJM, remote, travel, site_frequency, interne, processus, accord…) → fenêtre **Modifier le profil** (10 champs).
- `talents-fiche.R6` — Dossier de compétences : `CvStudioPanel.tsx` (52 clés : versions CV client / anonyme / enrichi / résumé, anonymisation nom complet / prénom + initiale / initiales / trigramme, source Opportunité / AO / Mission comparable / Besoin, composer, comparer, valider) → fenêtre **Préparer un dossier** (titre, résumé, masquer l'identité, mettre en premier les compétences communes).
- `talents-fiche.R7` — Positionnements (`delivery` > `submissions`) et missions (`missions`) → onglet **Présentations** (tableau commun) et bloc « Missions et engagements » du Profil.
- `talents-fiche.R8` — Notes : `NotesPanel.tsx` (portée, épingler, voir les N notes, supprimer) → « Notes et échanges » (une saisie + liste).
- `talents-fiche.R9` — Coût et TJM : `TalentMarginCard.tsx`, `financeHidden` (droit finance) → deux lignes « TJM vente indicatif — à confirmer par mission » / « Coût journalier chargé — interne · aucun taux de charges déduit ».

### Liste 2 — FEATURES NEUVES

- `talents-fiche.N1` — **Deux objectifs en tête de fiche** : « Comparer les besoins » (route `…/matching`) et « Explorer les comptes » (route `…/accounts`) — voir `talents-comptes`. _Front seul_ pour le premier ; le second est nouveau.
- `talents-fiche.N2` — **Phrase de mise en garde permanente** « Une fin prévue ne confirme pas la disponibilité du consultant ». _Front seul_ (texte), cohérente avec `talents-vivier.N1`.
- `talents-fiche.N3` — **« Présence souhaitée »** (hybride / sur site / distance) comme champ de la déclaration de disponibilité. _Front seul_ (`workMode.*`, `ConsultantFormDialog.tsx:283`).
- `talents-fiche.N4` — **« Source ou note de confirmation »** attachée à une confirmation de disponibilité (preuve d'une déclaration). _Back léger_ (champ texte daté).
- `talents-fiche.N5` — **« Expériences utiles »** : sélection des expériences à montrer pour un besoin (« CV fictif de recette »). _Front seul_ si les expériences du CV lu sont stockées (`parse/`).
- `talents-fiche.N6` — **« Joindre un texte »** comme source documentaire alternative au fichier. _Front seul_ (`TalentSkillsDialog.tsx:191` « Enregistrer le CV », `detail.documentNoText`).
- `talents-fiche.N7` — **Versions du dossier numérotées** avec contenu « à relire » avant toute diffusion. _Front seul_ (`studio.version`, `status`, `validate` existent).

### Liste 3 — ABSENTES CHEZ THÉO

- `talents-fiche.A1` — **Onglet « Conformité »** : consentement (recueilli le, valable jusqu'au, base légale, restrictions, origine de la fiche, états Jamais recueilli / Valable / Expire bientôt / Expiré), « Ce que nous détenons sur cette personne », **Exporter ses données** (`TalentConsentTab.tsx:87`, `consultants.consent.*`, `retention.*`). RGPD — **à ne pas retirer** (doctrine « RGPD suivi », c67, GA-43). Proposition : onglet « Conformité » ou bloc du Profil.
- `talents-fiche.A2` — **Identité et doublons** (`TalentIdentityPanel.tsx` : comparer les deux fiches, « Ce n'est pas la même personne », « Copier ses documents ici », « Ignorer », « Confier la vérification », annuler la décision). Proposition : garder, sous « Modifier ».
- `talents-fiche.A3` — **Revue du CV** (`CvReviewPanel.tsx` : accepter / rejeter chaque champ lu, « Enregistrer mes corrections ») et **aperçu / téléchargement de l'original** (`TalentDocumentPreview.tsx`). Proposition : garder dans Documents.
- `talents-fiche.A4` — **Informations terrain** (`TalentFieldReportsSection.tsx`, `TalentFieldReportDialog.tsx` : « Ne pas exploiter commercialement ») et **retour client sur une présentation** (`SubmissionFeedbackDialog.tsx`). Proposition : garder dans Activité.
- `talents-fiche.A5` — **Enrichissement et recherche de profil public** (`TalentEnrichAction.tsx` « Enrichir (1 crédit) », `LinkedinLookup.tsx`). Proposition : garder derrière Avec Laura.
- `talents-fiche.A6` — **Attribution à un membre / retirer l'attribution** (`TalentDetailHeader.tsx:539-553`), **copier le lien** (`CopyTalentLinkButton.tsx`), **archiver / réactiver** (`detail.archive/reactivate`), **supprimer définitivement** (`TalentDeleteDialog.tsx`). Proposition : garder dans « Modifier ».
- `talents-fiche.A7` — **Photo** (`TalentPhotoUpload.tsx`). Proposition : garder (jamais un critère de rang, doctrine « critères protégés »).
- `talents-fiche.A8` — **Brief et soutenance** (`ConsultantBriefDialog.tsx`, `consultants.brief.*`) et **messages préparés** (`detail.preparedMessages`). Proposition : garder dans Présentations.
- `talents-fiche.A9` — **Marché inverse** `/consultants/$id/reverse-market` (voir `talents-comptes`), **bandeau d'engagement** (`ConsultantEngagementBanner.tsx`, `consultants.engagement.*`) et **marge du talent** (`TalentMarginCard.tsx`). Proposition : garder.
- `talents-fiche.A10` — **Complétude de la fiche** (`TalentCompletenessScore.tsx`), « Compléter les informations ». Proposition : garder.
- `talents-fiche.A11` — **Revalidation de la disponibilité** (`TalentRatesTab.tsx:108` « Préparer une revalidation »). Proposition : garder, geste de la fenêtre Actualiser.

---

## 17. `talents-comptes` — Des comptes pour {talent}

**Théo `#/talents/t1/accounts`** (« Des comptes pour Sophie » · « La compatibilité ouvre une piste. Elle ne garantit ni besoin actuel ni mission ») → **produit `/consultants/$id/reverse-market`** : `routes/consultants/$id_.reverse-market.tsx:36` → `features/consultants/view/reverse-market/ReverseMarketPage.tsx:149` (« Où placer {nom} »).

Ce que montre Théo : sous-titre (profil · ville · date · puces SAP, Data) · **6 comptes classés 01-06** avec étiquette d'état (Demande à qualifier · Signal · Besoin confirmé · Mission en cours), ville · contexte, compétences en commun, **phrase de raison** (« Un programme de migration est documenté dans le scénario… »), **Explorer le compte** / **Préparer avec Laura** · bloc « Pourquoi ces rapprochements ? » (compétences + localisation ; « l'historique reste distinct des besoins actuels » ; « aucun sourcing externe ni matching IA réel »).

### Liste 1 — REDESSIN

- `talents-comptes.R1` — Titre « Où placer {nom} » + sous-titre (`reverseMarket.heading/subtitle`) → « Des comptes pour {prénom} ».
- `talents-comptes.R2` — Deux blocs « Besoins internes » (`internal.*`, portée Tout le portefeuille / Mes besoins, « Lancer le classement ») et « Marché externe » (`external.*`, `demand.*`) → **un seul classement de comptes** avec étiquette d'état par compte.
- `talents-comptes.R3` — Interlocuteurs chez le compte (`internal.interlocutors.*`, « Créer une cible », « Créer une opportunité ») → boutons **Explorer le compte** / **Préparer avec Laura**.
- `talents-comptes.R4` — Offres publiées croisées avec la fiche, par département (`demand.*`, `recruiters`) → raison rédigée en une phrase par compte.

### Liste 2 — FEATURES NEUVES

- `talents-comptes.N1` — **Étiquette d'état de relation par compte** (Demande à qualifier · Signal · Besoin confirmé · Mission en cours). _Front seul_ si le compte porte déjà ses affaires / missions / signaux (`accounts`, `signals`) ; sinon _back_ (agrégat).
- `talents-comptes.N2` — **Raison rédigée par compte** (« votre référence industrielle donne un angle précis ») et **ne pas relancer à froid** quand une relation existe (« pas repartir en prospection à froid », « priorité = démarrage et suivi de mission »). _Back IA_ (génération de raison) ; _démo_ : 6 raisons scénarisées.
- `talents-comptes.N3` — **« Préparer avec Laura »** depuis un compte (message ou plan d'approche pour _ce_ profil). _Front_ (`ReverseMarketPage`/`actions`).
- `talents-comptes.N4` — **Bloc « Pourquoi ces rapprochements ? »** (transparence du classement). _Front seul_ (`TransparencyBanner.tsx`).

### Liste 3 — ABSENTES CHEZ THÉO

- `talents-comptes.A1` — **Marché externe** : offres IT publiées par département, recruteurs, compatibilité, vérification, « La source publique n'a rien rendu » (`reverseMarket.external/demand/recruiters/compatible/verification`, réglages `reverseMarketSettings.json`). Théo écrit « Aucun sourcing externe ni matching IA réel ne s'exécute ». **Question à Louis** : le marché inverse externe est-il retiré du Vivier ?
- `talents-comptes.A2` — **Consentement du talent** à être placé (`reverseMarket.consent`) et message d'indisponibilité (`unavailable`). Proposition : garder (RGPD).
- `talents-comptes.A3` — **Placement** (`reverseMarket.placement`) : suivre le profil placé. Proposition : garder.
- `talents-comptes.A4` — **Créer une cible / une opportunité** depuis un interlocuteur du compte. Proposition : garder derrière « Explorer le compte ».

---

## 18. `missions-planning` — Missions (planning, tableau, échéances)

**Théo `#/missions`** (« Missions · Qui intervient, jusqu'à quand. Et ce qu'il faut préparer ensuite. ») → **produit** : `/missions/` redirige vers `/missions/planification` (`routes/missions/index.tsx:33-42`) → `features/missions/view/PlanningPage.tsx:130` ; la liste de missions `MissionsPage.tsx:113` n'ouvre que sur `?vue=liste` / `?accountId=` / `?consultantId=`.

Ce que montre Théo : Exporter · Nouvelle mission · barre **Planning · Relevés d'activité · Prêt à facturer · Factures · Encaissements · Vue financière** · quatre tuiles (05 Missions à accompagner · 03 Fins sous 30 jours « Préparer la suite » · 01 Démarrages prévus « Vérifier les prérequis » · 00 Fins non renseignées « Pas de date supposée ») · **Filtres** (fenêtre : Compte · Consultant · Responsable · Statut · Expertise · Équipe chez le client · Disponibilité dérivée) · **Mes vues** (enregistrer filtres + fenêtre de dates) · bascule **Par mission / Planning / Tableau** · pastilles (Échéances sous 30 j · À démarrer · Sans date de fin · À vérifier · Inclure les missions terminées · Réinitialiser) · **planning de l'équipe** (sept.→déc., « Aujourd'hui », « 4 mois », une ligne par consultant / compte, barre + « Après la mission — Sous réserve de la suite » + Détail ; légende En cours · Fin à anticiper · Démarrage prévu ; « Fin prévue ≠ disponibilité confirmée · déplacement avec validation ») · **Les échéances à préparer** (cartes « FIN DANS 4 JOURS », « DÉMARRAGE · 26 OCT. » + Préparer la suite / Vérifier le démarrage, « Voir les actions ») · **Tableau** (Mission / consultant · Compte · Dates prévues · Situation [En cours · À renouveler · Démarrage prévu · Fin proche] · Responsable) · fenêtre **Créer une mission** (Saisir la mission · À partir d'un document · Depuis une affaire gagnée).

### Liste 1 — REDESSIN

- `missions-planning.R1` — Barre de sous-sections Planning · Planification · Liste · Suivi · ADV · Paiements · Cessions · CRA · Facturation · Encaissements (routes `/missions/*`) → **six onglets** Planning · Relevés · Prêt à facturer · Factures · Encaissements · Vue financière (TC4).
- `missions-planning.R2` — Cockpit : trois KPI (`missions.cockpitKpis` : missions actives · revenu sécurisé · revenu à risque, « Droit finance requis ») → **quatre tuiles d'échéance** (à accompagner · fins sous 30 j · démarrages · fins non renseignées) **sans montant**.
- `missions-planning.R3` — Facettes (À renouveler · Sans date de fin · Avec risque · Marge à risque · Consultants bientôt disponibles : `missions.toolbar.facets`) → pastilles (Échéances sous 30 j · À démarrer · Sans date de fin · À vérifier).
- `missions-planning.R4` — Planning : `PlanningPage.tsx:130` (fenêtre précédente / suivante, « Revenir à aujourd'hui », recherche, inclure les terminées, conflits chevauchement / trou, intercontrat) → planning à 4 mois, légende à 3 teintes, bascule Par mission.
- `missions-planning.R5` — Liste `MissionsTable.tsx` (68 clés de colonnes : nature, risques, marge, âge d'étape, personne d'affecté…, `MissionColumnPicker`) → **Tableau à 5 colonnes**.
- `missions-planning.R6` — Filtres : barre d'étiquettes (statut, nature, porteur, client, consultant, canal, devise, BU / agence, fin) → **une fenêtre « Filtrer le planning »** (7 sélecteurs : « la même sélection s'applique au planning et au tableau »).
- `missions-planning.R7` — Vues enregistrées (`SavedMissionViews.tsx`) → « Mes vues » (fenêtre : enregistrer les filtres **et la fenêtre de dates**).
- `missions-planning.R8` — Création : `/missions/nouvelle` (`CreateMissionPage.tsx:25`) → fenêtre **trois portes** (saisie · document · affaire gagnée).
- `missions-planning.R9` — Situation d'une mission (statuts `missions.states.*` 14 valeurs) → quatre : En cours · À renouveler · Démarrage prévu · Fin proche.

### Liste 2 — FEATURES NEUVES

- `missions-planning.N1` — **Cartes « Les échéances à préparer »** (fin dans N jours, démarrage), avec phrase d'action et lien vers `Actions` (« pas un deuxième gestionnaire de tâches »). _Front seul_ à partir de `renewalWindowLabel.ts`, `mission-start-readiness.service.ts`.
- `missions-planning.N2` — **Bascule « Par mission »** (regrouper le planning par mission plutôt que par consultant). _Front seul_.
- `missions-planning.N3` — **Filtre « Disponibilité dérivée »** et **« Équipe chez le client »**, **« Expertise »**. _Front seul_ (les données existent : `clientTeam`, compétences des affectés).
- `missions-planning.N4` — **Barre « Après la mission — Sous réserve de la suite »** : segment après la fin prévue, grisé. _Front seul_.
- `missions-planning.N5` — **Déplacer une mission avec validation** (« déplacement avec validation ») : le produit a `Déplacer` (`PlanningPage.tsx:1400`) ; la fenêtre de validation explicite est nouvelle. _Front seul_.
- `missions-planning.N6` — **Exporter** le planning. _Front seul_.

### Liste 3 — ABSENTES CHEZ THÉO

- `missions-planning.A1` — **Board des missions** (douze colonnes : À créer · Qualification · Matching · Shortlist prête · Profil proposé · Validation client · Signée · En cours · Renouvellement · Terminée · Perdue · En veille ; alertes facturation bloquée / relevé manquant / renouvellement ; déplacer vers… avec vérifications : `missions.board.*`, `mission-board.service.ts`). Proposition : garder comme vue « Board » à côté de Planning / Tableau.
- `missions-planning.A2` — **Prolonger / terminer une mission** (`MissionLifecycleActions.tsx:31-158`, `missions.lifecycle.*`, `endChecklist`, `endReason`, `interruption`), **renouvellement** (`missions.renewal.*`, `renewals.*`) et fenêtres J60 / J45 / J30 / J15 (`chain.why.window.*`). Théo n'a que « Préparer la suite ». Proposition : garder dans le dossier de mission.
- `missions-planning.A3` — **Reprise des ventes Odoo en missions** (`OdooSalesSection.tsx`, `missions.odooSales.*`, 41 clés : « Reprendre en mission », « Reprendre toutes ») et **proposition de reprise CRM** (`CrmReprisalProposal.tsx`, `mission-crm-reprisal.service.ts`). Proposition : garder (connecteurs) — hors écran Théo.
- `missions-planning.A4` — **Transfert de mission vers une autre BU** (`MissionBusinessUnitLine.tsx`, `missions.businessUnit.*`). Proposition : garder dans le dossier.
- `missions-planning.A5` — **Filtre par source** (`MissionsSourceFilterNotice.tsx`, `missions.sourceFilter.*`) et liens depuis un compte / un consultant (`?accountId=`, `?consultantId=`). Proposition : garder (liens entrants).
- `missions-planning.A6` — **Gestes de ligne** : Demander le CRA · Vérifier le paiement · Repositionner le consultant · Demander un feedback · Renseigner une donnée (`MissionsTable.tsx:696-716`). Proposition : garder dans « Détail ».
- `missions-planning.A7` — **Consultants en intercontrat / se libèrent bientôt** → « Trouver des missions pour {nom} » / « Créer un besoin interne » (`PlanningPage.tsx:664/1492/1498`). Proposition : garder (lien Vivier ↔ Missions).
- `missions-planning.A8` — **Conflits de planning** (chevauchements, trous : `planning-conflicts.ts`, `summary.conflictKinds`). Proposition : garder, signalés sur la barre.
- `missions-planning.A9` — **Suivi de mission** `/missions/suivi` (`MissionTrackingPage.tsx:42` : tuiles, tableau, rentabilité, dérive, automatisations, activité récente), **Facturation ADV** `/missions/adv` (`AdvPage.tsx:49`), **Paiements** `/missions/paiements` (`PaymentsPage.tsx:106`) et **Cessions / affacturage** `/missions/cessions` (`CessionsPage.tsx:80`). Aucune n'est dans la barre de Théo. **Questions à Louis** : (a) Suivi → Planning ; (b) ADV → « Prêt à facturer » (déjà un bloc « CONTRÔLE ADV » chez Théo) ; (c) Paiements (sortants vers les consultants) → Vue financière ; (d) Cessions → à retirer ou à garder dans Réglages ?
- `missions-planning.A10` — **Notes de frais** `/expenses` + barème (`ExpenseReportsPage.tsx:37`, `ExpensePolicyPage.tsx`) — hors des six onglets Théo. Proposition : garder dans la Vue financière.
- `missions-planning.A11` — **Mission « forfait encadré, sans consultants »** (`SupervisedForfaitFields.tsx`). Proposition : garder dans « Créer une mission ».

---

## 19. `missions-dossier` — Dossier de mission

**Théo `#/missions/m1`** (+ `/overview /staffing /terms /scores /history`) → **produit `/missions/$id`** : `routes/missions/$id.tsx:46` → `features/missions/view/MissionDossierPage.tsx:65` → `MissionDetailTabs.tsx:156` (cinq onglets `overview · staffing · terms · scores · history`, `:85`).

Ce que montre Théo : « DOSSIER DE MISSION » · titre · compte · direction · état · **Chercher une relève / un renfort** · **Revenir au planning** · **Préparer le point client** · cinq onglets **Synthèse · Équipe & suite · Conditions & finance · Points d'attention · Documents & suivi** · frise **Accord › Démarrage › Mission (4) › Passation (5) › Clôture** · **Les points de passage** (jalons, « Ajouter un point », « Cadrage validé · 17 juil. · Validation consignée », « Revue de gouvernance · À préparer ») · **Prochaine étape** · **Situation de mission** (dates, responsable Bellum, expertises, interlocuteur client, lieu / modalité, source) · **Échanger avec Laura**. Onglet Équipe : affectations (« Affecter un consultant » : consultant, début, fin, allocation %), **retours de mission** (client / consultant, « Une appréciation saisie, jamais un score de satisfaction inventé »), « Après la mission » (Explorer les besoins pour ce profil · Confirmer une disponibilité). Onglet Conditions : TJM, nature, règlement 30 jours, liens Voir ses relevés / factures, **La marge, avec ses hypothèses** (coût journalier 540 €, commission, marge 250 € = 32 %, **Simuler un avenant**), **Bon de commande** (63 200 € engagés sur 79 000 €), **Frais & factures fournisseurs**. Onglet Points d'attention : « Des constats rattachés au dossier, pas une probabilité de succès ». Onglet Documents : contrat signé, notes de suivi, historique des modifications, historique du compte, **Exporter le récapitulatif**.

### Liste 1 — REDESSIN

- `missions-dossier.R1` — Cinq onglets identiques en fond (Synthèse · Équipe & suite · Conditions & finance · Scores/risques · Documents & historique : `tabs.overview`, `staffing.title`, `tabs.terms`, `scores.title`, `history.title`) → renommés Synthèse · Équipe & suite · Conditions & finance · **Points d'attention** · Documents & suivi.
- `missions-dossier.R2` — Bandeau « De la signature au cash » (`MissionChainStrip`, `missions.chain.*` : relevé · CA facturable · facture préparée · encaissement · repositionnement) → **frise de cycle de vie** Accord › Démarrage › Mission › Passation › Clôture (autre axe : la vie de la mission, pas la chaîne du cash).
- `missions-dossier.R3` — Jalons : `mission-delivery-milestones.service.ts`, `missions.deliveryMilestones.*` → « Les points de passage » (type de suivi « Brief consultant… », date prévue, intitulé ; « Un jalon ne se valide pas automatiquement parce que sa date est passée »).
- `missions-dossier.R4` — Action principale (`MissionPrimaryActionBanner.tsx`, `missions.dossier.primaryAction.state.*` : revalider la disponibilité, compléter le démarrage…) → bouton « Préparer le point client » + carte « Prochaine étape ».
- `missions-dossier.R5` — Conditions : `missions.finance.*` (marge %, coût chargé, canal, préavis, bon de commande exigé, commission) + `MissionMarginEngine.tsx` (marge commerciale / brute / contribution / à terminaison) → bloc **« La marge, avec ses hypothèses »** (coût, commission, marge journalière, « Illustration locale… ce n'est pas la marge comptable réalisée ») + fenêtre **Simuler un avenant**.
- `missions-dossier.R6` — Avenant : `mission-amendment.service.ts`, `PoConsumptionBar.tsx` (« Demander l'avenant ») → « Simuler un avenant » (TJM envisagé, coût journalier envisagé → « Calculer la simulation »).
- `missions-dossier.R7` — Historique : `TimelinePanel.tsx` (interactions, analyses, relation client, connecter un outil, « Consigner un échange ») → « Notes de suivi », « Historique des modifications », « Historique du compte ».
- `missions-dossier.R8` — Création de relève : `missions.staffing.*` + `NeedWizard` → fenêtre **Préparer un renfort ou une relève** (objectif Préparer un remplacement / Ajouter un renfort / Préparer la suite de mission, intitulé, compétences, date de prise de relais, fin envisagée, pourquoi ; « Créer le besoin et comparer » ; l'affectation actuelle n'est pas modifiée).
- `missions-dossier.R9` — Tâche : `quickActions.createAction` (« Action ajoutée au plan du compte ») → fenêtre **Créer une tâche de mission** (« partagée avec Actions et Ma journée, pas copiée dans un second gestionnaire »).
- `missions-dossier.R10` — Frais : `mission-expenses.service.ts` + `InvoiceAttachments.tsx` → « Ajouter un frais » (libellé, montant, date) et « Ajouter une facture fournisseur ».

### Liste 2 — FEATURES NEUVES

- `missions-dossier.N1` — **Frise de cycle de vie à 5 étapes** avec rangs (Mission 4 · Passation 5). _Front + back léger_ : statut dérivé de `missions.status.*` + dates + jalons ; « Passation » n'existe pas comme état.
- `missions-dossier.N2` — **Retours de mission « client » et « consultant »** (appréciation Satisfait / …, date, commentaire) — _back existant_ (`mission-feedback.service.ts`) ; _front_ : saisie depuis l'onglet Équipe (« Consigner un retour client / consultant »). _Démo_ : 1 retour client semé.
- `missions-dossier.N3` — **Bloc « Après la mission »** (Explorer les besoins pour ce profil · Confirmer une disponibilité) rappelant « La date du planning et la disponibilité du consultant sont deux informations distinctes ». _Front seul_ (liens vers `talents-comptes` et `talents-fiche`).
- `missions-dossier.N4` — **Jalons proposés par type** (« Brief consultant »…) avec **date prévue** ; _back existant_, saisie à brancher.
- `missions-dossier.N5` — **Bloc « Bon de commande »** (« 63 200 € engagés sur 79 000 € HT », _consommation déclarée, distincte des encaissements_). _Front seul_ (`PoConsumptionBar.tsx`).
- `missions-dossier.N6` — **Exporter le récapitulatif** de la mission. _Front + back léger_ (export du dossier).
- `missions-dossier.N7` — **Phrase « Aucun point relevé dans les données de ce scénario. Cela ne constitue pas une garantie exhaustive »** (onglet Points d'attention). _Front seul_ (état vide qui dit ce qu'il ne sait pas).

### Liste 3 — ABSENTES CHEZ THÉO

- `missions-dossier.A1` — **Prolonger / Terminer** (avec checklist de fin, motif, interruption), **renouvellement** et préavis (`MissionLifecycleActions.tsx:38-158`, `MissionDetailTabs.tsx:1248` « Enregistrer le préavis », `missions.endChecklist`). Proposition : garder dans l'en-tête (menu « ⋯ »).
- `missions-dossier.A2` — **Mode de réalisation** (staffé · forfait) (`MissionDetailTabs.tsx:701/738` « Changer le mode de réalisation »), **objectif et périmètre** modifiables (`:390`), **équipe chez le client** (`clientTeam`). Proposition : garder dans Synthèse.
- `missions-dossier.A3` — **Marge à quatre niveaux avec confiance Mesurée / Partielle / Non mesurée** (`missions.finance.engine.*`, `MissionCostSourceForm.tsx` « Enregistrer la source du coût »). Chez Théo : une marge journalière. Proposition : garder (doctrine « non mesuré n'est jamais 0 »).
- `missions-dossier.A4` — **Commission d'intermédiation** et **bon de commande exigé** (`missions.finance.commission*`, `requiresPoLabel`). Proposition : garder dans Conditions.
- `missions-dossier.A5` — **Disposition de dérive** (`MissionDriftPanel.tsx`, `mission-drift.service.ts`) et **scores** (`mission-scores.service.ts`, `missions.scores.*`). Théo : « Points d'attention » vide. Proposition : garder.
- `missions-dossier.A6` — **Documents de la mission** : suivre un document, contrat téléversé par lien public (`MissionDocumentsPanel.tsx`, `legal-contract*.service.ts`, `/depot-piece.$token`). Proposition : garder.
- `missions-dossier.A7` — **Démarrage : checklist de prérequis** (`mission-start-readiness.service.ts`, `missions.startReadiness.*`). Théo : « Vérifier les prérequis » (tuile). Proposition : garder, ouverte par la tuile.
- `missions-dossier.A8` — **Provenance des champs** (`missions.dossier.provenance.*`) et **ligne de BU** (`MissionBusinessUnitLine.tsx`). Proposition : garder.
- `missions-dossier.A9` — **Créer un projet depuis la mission** (`missions.dossier.createProject`). Proposition : garder.
- `missions-dossier.A10` — **Facture ajoutée à la main** (`MissionDetailTabs.tsx:2471` « Ajouter la facture ») et « Marquer facturée » (`InvoiceReadinessPanel.tsx:749`). Voir `missions-factures` (H1).

---

## 20. `missions-cra` — Relevés d'activité

**Théo `#/missions/cra`** (« Clôturer l'activité, sans courir après les pièces. ») → **produit `/missions/cra`** : `routes/missions/cra.tsx:4` → `features/missions/view/TimesheetsPage.tsx:77`.

Ce que montre Théo : Exporter la sélection · Ajouter un relevé · **bandeau de chaîne en 4 étapes** (1. Activité · 2. Contrôles · 3. Facture « brouillon puis émission simulée » · 4. Règlement « rapproché, partiel ou soldé ») · quatre tuiles (À recevoir 1 · À contrôler 1 · Attente client 0 · Validés client 3 « 58 jours facturables ») · filtres (période, compte, responsable, recherche, état Tous / À recevoir / À contrôler / Attente client / Validés client / Rejetés) · « 5 relevés · 78 jours déclarés · 78 facturables » · tableau (Consultant / mission · Activité « 20 j · 20 j facturables » ou « Aucune activité supposée » · Validation interne · Validation client « Preuve consignée » · Suivi « Source facturée · Reçu · Validé client · Relance à préparer ») · fenêtre **Ajouter un relevé** (mission, période, jours réalisés, jours facturables, commentaire) · fenêtre **Relevé** (déclaré, facturable, relecture interne, accord client, historique ; relevé facturé = figé, correction par document correctif) · « Une seule chaîne de validation » · **Contrôler le prêt à facturer**.

### Liste 1 — REDESSIN

- `missions-cra.R1` — Titre « Relevés d'activité » + « Une ligne par mission et par consultant » (`missions.cra.title/heading`) → « Clôturer l'activité, sans courir après les pièces ».
- `missions-cra.R2` — Compteurs (`cra.counts` « N en attente · N validés », reçus, en retard, escaladés, écarts non expliqués) → quatre tuiles d'état.
- `missions-cra.R3` — Groupes « Prêt pour la préparation de facturation / Pas encore prêt » (`cra.missionGroup.*`) et multi-consultants (`multiConsultantGroup`) → un tableau plat à état unique.
- `missions-cra.R4` — Écart de jours (`cra.gap.under/over`, « Expliquer l'écart ») → « Aucune activité supposée » + règle « Une correction après validation exige un motif et remet les validations en attente ».
- `missions-cra.R5` — Validation client : « Enregistrer la validation client » (`cra.recordClientValidation`) → colonne « Validation client — Preuve consignée » (« la validation client est une preuve consignée, pas une signature inventée »).
- `missions-cra.R6` — Création manuelle d'un relevé → fenêtre **Ajouter un relevé** à 5 champs.
- `missions-cra.R7` — Après validation : bloc de renvoi vers la préparation de facturation (« Contrôler le prêt à facturer ») → même geste.

### Liste 2 — FEATURES NEUVES

- `missions-cra.N1` — **Bandeau de chaîne en 4 étapes** (Activité → Contrôles → Facture → Règlement) en tête des 4 écrans financiers. _Front seul_ (état par écran) — aligne `MissionChainStrip` sur 4 écrans.
- `missions-cra.N2` — **Tuiles « Attente client » / « Rejetés »** : relevé rejeté par le client avec motif. _Back léger_ (état `rejected` ; le produit a « relevé contesté » côté facturation : `InvoiceReadinessTable.tsx:436`).
- `missions-cra.N3` — **Preuve consignée de validation client** (consigner une preuve, pas seulement une case). _Back léger_ (pièce ou référence jointe). _Démo_ : 3 relevés « Preuve consignée ».
- `missions-cra.N4` — **Source facturée figée + document correctif** : un relevé qui a alimenté un document émis ne se réécrit plus. _Back_ : verrou lié aux documents de facture (dépend de H1).
- `missions-cra.N5` — **Historique d'un relevé** (changements, validations, corrections avec motif). _Back léger_ (journal par relevé).
- `missions-cra.N6` — **« Exporter la sélection »**. _Front seul_.

### Liste 3 — ABSENTES CHEZ THÉO

- `missions-cra.A1` — **« Marquer non applicable »** (mois sans relevé : congé sans solde… ; `cra.notApplicable.*`, annuler l'exception). Proposition : garder dans la fenêtre Relevé.
- `missions-cra.A2` — **Relances de relevé** : retard, escalade, « Demander le CRA », « Relancer la saisie / validation CRA » (`cra.lateCount/escalatedCount`, `InvoiceReadinessPanel.tsx:460`). Théo : « Relance à préparer » en suivi. Proposition : garder.
- `missions-cra.A3` — **Filtre « Ce qui bloque »** (`cra.blockingOnly`) et **« Ouvrir les relevés attendus »** (`cra.openExpected`). Proposition : garder.
- `missions-cra.A4` — **Écart non expliqué** comme blocage de facturation (`cra.blockingCount`, motif congés / mission partielle / jour férié). Théo : « jours déclarés / facturables ». Proposition : garder.
- `missions-cra.A5` — **Marquer vérifié en interne** (`cra.recordInternalReview`, « Vérifié en interne par … »). Théo : colonne « Validation interne ». Proposition : garder.
- `missions-cra.A6` — **Dépôt du relevé par le client** (lien public `/depot-piece.$token`). Proposition : garder.

---

## 21. `missions-preparation` — Prêt à facturer

**Théo `#/missions/preparation`** (« Transformer l'activité validée en factures fiables. ») → **produit `/missions/facturation`** : `routes/missions/facturation.tsx:4` → `features/missions/view/InvoicingPage.tsx:39` → `InvoiceReadinessPanel.tsx:109` (+ `InvoiceReadinessTable.tsx`, `MissionMonthPreparation.tsx`) ; contrôles ADV : `/missions/adv` (`AdvPage.tsx:49`).

Ce que montre Théo : Exporter les contrôles · **Préparer les dossiers prêts** (fenêtre : « Préparer ces N brouillons… Les dossiers déjà préparés ne sont pas dupliqués. Aucun envoi ni émission réelle ») · chaîne 4 étapes · tuiles (Prêt à préparer **13 680 € · 1 dossier HT** · À débloquer 2 · Brouillons 0 · Déjà émis 2 « Pas de double facturation ») · filtres · « septembre 2026 · 5 dossiers · montants HT » · tableau (Mission / client · **Base du mois** « 20 jours facturables · 790 € / jour » · Montant HT · **Couverture de commande** « 15 800 € / 15 800 € · BC-HEL-2026-028 » · Contrôles [Document émis · À compléter · Prêt] avec action Voir le document / **Résoudre** / **Préparer**) · bloc **CONTRÔLE ADV** · fenêtre **Contrôles · {mission}** (validation interne / client attendue → Ouvrir le relevé ; commande insuffisante → Compléter ; lignes de prestation) · fenêtre **Brouillon de facture DEMO-F-107** (« SPÉCIMEN DE DÉMONSTRATION — ce document n'est pas une facture comptable ») : mission, commande, émission simulée, échéance, lignes, total HT / TVA 20 % / TTC, **Actualiser le brouillon · Simuler l'émission · Exporter le spécimen**, « Règlements et traçabilité ».

### Liste 1 — REDESSIN

- `missions-preparation.R1` — Tuiles (`missions.readiness.tiles` : facture manquante · à envoyer · CRA bloqué · non mesuré) → quatre tuiles montants (Prêt à préparer · À débloquer · Brouillons · Déjà émis).
- `missions-preparation.R2` — Lignes avec blocages (`InvoiceReadinessTable.tsx:436` : aucun relevé, contesté, rejeté, anomalies, aucun TJM, contact de facturation inconnu, date de début inconnue, écart, coût manquant, BC expiré, aucun contrat actif) et réparations (« renseigner le TJM », « vérifier le contrat »…) → colonne « Contrôles » à trois états + fenêtre Contrôles listant les blocages à lever.
- `missions-preparation.R3` — « Préparer la facture de {mois} » (`MissionMonthPreparation.tsx:245` : jours depuis le CRA, n° de BC, reste à consommer, « Préparée — pas encore créée ni envoyée ») → **brouillon de facture** avec lignes, TVA, total (voir N1).
- `missions-preparation.R4` — Marquer « facturé » / « déclaré facturé par … non confirmé » (`InvoiceReadinessPanel.tsx:749` `MarkInvoicedDialog`, `readiness.markInvoiced`, `confirmInvoiced`, doctrine c80) → « Simuler l'émission » dans le brouillon. **Voir H1.**
- `missions-preparation.R5` — Couverture de commande : `PoConsumptionBar.tsx` → colonne « Couverture de commande » (montant / enveloppe + n° BC).
- `missions-preparation.R6` — Page ADV séparée (`AdvPage.tsx` : mois, tuiles, blocages, réparations, champs) → bloc « CONTRÔLE ADV : une facture remonte à sa preuve de prestation ».

### Liste 2 — FEATURES NEUVES

- `missions-preparation.N1` — **Document de facture préparé** (brouillon) : numéro provisoire DEMO-F-…, lignes (mission · consultant · période · quantité · PU HT · HT), TVA 20 %, TTC, commande, échéance. _Back_ : table de documents de facture (le produit n'a que des lignes `invoice_readiness`/`invoice-month-preparation` sans pièce lisible) + export PDF. **Conflit potentiel avec #2564 (H1).**
- `missions-preparation.N2` — **« Préparer les dossiers prêts » en lot** (créer N brouillons d'un coup, sans doublon). _Back_ (idempotence : « Les dossiers déjà préparés ne sont pas dupliqués »).
- `missions-preparation.N3` — **« Simuler l'émission »** (lignes figées, TVA du scénario, références). _Doctrine_ : le produit ne simule pas une émission ; en démo seulement (H8).
- `missions-preparation.N4` — **Exporter le spécimen** (PDF lisible marqué spécimen). _Front + back_ (rendu PDF).
- `missions-preparation.N5` — **Règlements et traçabilité** par document (journal : brouillon préparé par {nom} à {heure}). _Back_ (journal de document).
- `missions-preparation.N6` — **Double facturation interdite** (« Déjà émis · pas de double facturation » + relecture obligatoire si la source change avant l'émission). _Back_ (verrou de source).
- `missions-preparation.N7` — **Exporter les contrôles**. _Front seul_.

### Liste 3 — ABSENTES CHEZ THÉO

- `missions-preparation.A1` — **Facturation automatique mensuelle** (`missions.monthPrep.auto` « Préparer chaque mois automatiquement ») et **reconduction du mois précédent** (`reusedFrom`). Proposition : garder (option du brouillon).
- `missions-preparation.A2` — **Facture fournisseur manquante** et **à envoyer** comme états (`readiness.tiles.supplierInvoiceMissing/readyToSend`). Proposition : garder (liés à `missions-finance`).
- `missions-preparation.A3` — **Société facturante** (« Renseigner la société facturante », `InvoiceReadinessPanel.tsx:795`, `markInvoicedSetLegalEntity`) et **entité légale** (`features/legal-entities`). Proposition : garder.
- `missions-preparation.A4` — **Rappels de paiement** (`readiness.reminders`, `recordReminder`) et **annuler la marque facturée** (`cancelInvoiced`, `InvoiceReadinessPanel.tsx:939`). Proposition : garder.
- `missions-preparation.A5` — **Avenants** (`readiness.amendments`, `mission-amendment.service.ts`). Proposition : garder.
- `missions-preparation.A6` — **Plusieurs consultants par mission et par mois** et **rapports de trace** (`InvoiceReadinessTable.tsx`, pages, `OverdueThirtyDaysCard.tsx` « Voir les encaissements »). Proposition : garder.

---

## 22. `missions-factures` — Factures

**Théo `#/missions/billing`** (« Les factures, de la préparation au solde. ») → **produit : aucune liste de factures**. Les factures n'existent que comme lignes « facturé » déclarées (`CollectionsPage.tsx:91`, `missions.collections.*`) et comme préparation mensuelle (`MissionMonthPreparation.tsx`). Doctrine : « une facture est préparée, jamais émise ni comptabilisée ; “facturé” ne s'écrit que sur preuve du connecteur » (`agent_docs/doctrine.md:32,146`).

Ce que montre Théo : « Les avoirs corrigent une pièce ; ils ne sont pas des encaissements » · Exporter la sélection · Préparer depuis l'activité · quatre tuiles (**Brouillons 1** · **Émis HT net d'avoirs 69 610 €** · **Reste à recevoir TTC 56 572 €** · **Documents en litige 1**) · filtres (période facturée, compte, responsable, recherche, **état** : Brouillons · Factures émises · Avec un solde · En retard · En litige · Soldées · Avoirs) · « 6 documents dans cette sélection » · tableau (**N° FAC-2026-041 / DEMO-F-038** · client · mission · Période · « Émis le 2 oct. » ou « Non émis » · HT · TTC · Échéance « 17 jours de retard » · **État / solde** : Réglée · À recevoir · Brouillon · **Partielle · en retard** · En litige · En retard) · bloc « Pièce figée après émission » (le TJM modifié ne recalcule pas une ancienne facture ; correction = **avoir lié**) · bloc **Connexion comptable** (« Export de travail et spécimen lisible uniquement. Ni émission légale ni transmission électronique ni comptabilisation ») · « Paramètres de facturation » (→ `#/settings/workspace-rules`).

### Liste 1 — REDESSIN

- `missions-factures.R1` — Suivi des factures dans la page Encaissements (`CollectionsPage.tsx:91`, colonnes Client · Interlocuteur · Mission · Mois · Montant · Échéance · Statut · Retard · Relances · Dernière / prochaine action) → **liste dédiée aux documents**, l'encaissement étant un écran voisin.
- `missions-factures.R2` — Quatre statuts d'encaissement (`collections.status.paid/pending/overdue/disputed`, doctrine c72) → sept états d'affichage (Brouillons · Émises · Avec un solde · En retard · En litige · Soldées · Avoirs). **Voir H5.**
- `missions-factures.R3` — Paramètres de facturation : `settings/finance` (`financeSettings.json`), `workspace-rules` → lien « Paramètres de facturation ».

### Liste 2 — FEATURES NEUVES

- `missions-factures.N1` — **Liste de documents de facture** avec numéro, période, HT / TTC, échéance, état et solde. _Back + front_ : table de documents ; **conflit H1** (« préparée, jamais émise »). En démo, c'est un _spécimen_ marqué ainsi (« SPÉCIMEN DE DÉMONSTRATION ») ; en production, la source de vérité serait le connecteur comptable du client (« facturé » sur preuve).
- `missions-factures.N2` — **Avoirs** (note de crédit liée à la facture initiale, « ne sont pas des encaissements »). _Back_ : `invoice-payments.service.ts` connaît déjà `customer_credit_note` (crédit client noté sur un paiement) ; un avoir _document_ lié à une facture est nouveau. **H1**.
- `missions-factures.N3` — **Pièce figée après émission** (le recalcul d'un TJM ne réécrit pas l'ancienne facture ; instantané). _Back_ (instantané de lignes).
- `missions-factures.N4` — **Tuile « Émis HT net d'avoirs »** et **« Reste à recevoir TTC (après règlements affectés et avoirs) »**. _Back_ (agrégats) ; avertissement « Hors créances et hors encaissements » pour les brouillons.
- `missions-factures.N5` — **Jours de retard calculés** par document (« 17 jours de retard »). _Front seul_ (`collections.columns.overdue` existe).
- `missions-factures.N6` — **Bloc « Connexion comptable »** (export de travail et spécimen). _Doctrine à écrire_ : l'export de travail vers le comptable est cohérent avec « suivre sans comptabiliser » ; la formule « Ni émission légale… » est un cadre de démo.
- `missions-factures.N7` — **Statut « Partielle · en retard »** (**H5**) : un règlement partiel qui laisse un solde en retard. Le produit NOMME le reste dû (`outstandingAmountCents`, « Réglé : X · Reste dû : Y ») sans cinquième statut — Théo libelle à la fois un solde (« Solde 10 012 € ») et un état composé.

### Liste 3 — ABSENTES CHEZ THÉO

- `missions-factures.A1` — **Déclarer une facture « facturée »** à la main avec référence, montant, échéance (`InvoiceReadinessPanel.tsx:749`, `readiness.markInvoiced`, c80 : « déclaré facturé par {personne} le {date}, non confirmé »). Geste de saisie manuelle. **Question à Louis** : ce geste disparaît-il au profit de « Préparer / Simuler l'émission » ?
- `missions-factures.A2` — **Mention de la source d'une valeur « facturé »** (connecteur vs déclaration : `collections.invoicedDeclared`). Proposition : garder, indispensable à la doctrine c80.
- `missions-factures.A3` — **Relances** par facture (`collections.columns.reminders`, `escalate_to_human` : « Trois relances sans réponse — à remonter »), **saisie d'une échéance manquante** (`set_due_date`). Proposition : garder (voir `missions-encaissements`).
- `missions-factures.A4` — **Pièces jointes de facture** (`InvoiceAttachments.tsx` : joindre une pièce, retirer) et **factures fournisseurs** liées. Proposition : garder.

---

## 23. `missions-encaissements` — Encaissements

**Théo `#/missions/encaissements`** (« Savoir ce qui entre. Et ce qui attend. ») → **produit `/missions/encaissements`** : `routes/missions/encaissements.tsx:19` → `features/missions/view/CollectionsPage.tsx:91`.

Ce que montre Théo : Exporter les soldes · **Consigner un règlement** · « Situation au 19 oct. 2026 · toutes échéances » · filtres (compte, responsable, recherche) · quatre tuiles (**Reste à recevoir 56 572 €** · **Dont échus 40 252 €** · **À rapprocher 5 000 €** · **Montant litigieux 3 600 €** « inclus dans l'encours, pas ajouté ») · **Les règlements à rapprocher** (NovaSanté · 5 000 € · VIR-DEMO-1610 · **Affecter** : seules les factures de ce client sont proposées, total affecté ≤ règlement) · **Échéances à traiter** (file Tous les encours · Échus · Litiges · Promesses ; ligne : client · montant TTC · n° · échéance · « promesse 23 oct. » · « Montant promis 15 552 € · non reçu » ; actions Ouvrir / Traiter le litige / Suivre) · **Journal des règlements** · **Ancienneté de l'encours** (Non échus · 1-30 · 31-60 · 61-90 · plus de 90 jours · sans échéance) · **Les règles de suivi** (un paiement peut couvrir plusieurs factures du même client ; un avoir ne crée pas d'entrée d'argent ; un trop-perçu reste un crédit client ; aucune relance automatique ; les litiges demandent une résolution) · fenêtres **Consigner un règlement reçu** (client, date, montant TTC, référence du mouvement, commentaire) et **Suivre le litige** (état Ouvert / Résolu, montant concerné, motif et décision).

### Liste 1 — REDESSIN

- `missions-encaissements.R1` — Tuiles `collections.buckets` (Encaissé · En attente · En retard · Contesté · Facturé · Non rapproché) → quatre tuiles montants (Reste à recevoir · Dont échus · À rapprocher · Montant litigieux).
- `missions-encaissements.R2` — Liste de factures avec gestes de ligne (`rowMenu`, Marquer réglée, Lever le litige, Consigner une relance : `CollectionsPage.tsx:712-716`) → **file « Échéances à traiter »** filtrable Tous / Échus / Litiges / Promesses.
- `missions-encaissements.R3` — Règlement : « Enregistrer un règlement » (montant encaissé en € sur une facture : `collections.paymentTitle/paymentAmount`, `invoice-payments.service.ts`) → fenêtre **Consigner un règlement reçu** (_client_, date, montant, référence du mouvement) puis **Affecter** aux factures du client.
- `missions-encaissements.R4` — Litige : « Lever le litige » (`actions.resolve_dispute`) → fenêtre **Suivre le litige** (état Ouvert / Résolu, montant concerné, motif et décision, « Un litige reste dans l'encours. Sa résolution ne crée aucun règlement »).
- `missions-encaissements.R5` — Statut partiel : « Réglé : X · Reste dû : Y » (c72) → solde nommé en tuile et sur la ligne (conforme).

### Liste 2 — FEATURES NEUVES

- `missions-encaissements.N1` — **Rapprochement bancaire manuel** : règlements « à rapprocher » + « Affecter » à une ou plusieurs factures du même client. _Back existant en partie_ : `invoice-payments.service.ts:299` `match(paymentId, invoiceReadinessId)` ; l'affectation _multiple_ (un paiement sur plusieurs factures) et le « solde non affecté » sont à ajouter. _Démo_ : 1 règlement non affecté (VIR-DEMO-1610).
- `missions-encaissements.N2` — **Promesses de règlement** (date promise, montant promis, « non reçu »). _Back_ : champ `promised_on` / `promised_amount` sur le suivi d'une facture. _Démo_ : 1 promesse.
- `missions-encaissements.N3` — **Ancienneté de l'encours** (six tranches, TTC restant dû, litiges compris, dates non réinitialisées par une relance). _Front + back_ (agrégat par tranche). _Doctrine_ à vérifier : c'est une mesure de _ce que le client doit_, pas de la personne.
- `missions-encaissements.N4` — **Journal des règlements** (liste des règlements consignés avec lien « Voir »). _Front seul_ (données de `invoice-payments`).
- `missions-encaissements.N5` — **« Les règles de suivi »** (texte permanent). _Front seul_.
- `missions-encaissements.N6` — **Exporter les soldes**. _Front seul_.
- `missions-encaissements.N7` — **Montant litigieux « inclus dans l'encours, pas ajouté »**. _Front seul_ (déjà vrai dans `collections.ts:113-146`).

### Liste 3 — ABSENTES CHEZ THÉO

- `missions-encaissements.A1` — **Relances** : saisie d'une relance, compteur par facture, « Trois relances sans réponse — à remonter » (`PaymentReminderDue.tsx`, `collections.columns.reminders/lastAction`). Théo : « Aucune relance n'est envoyée automatiquement » mais aucun geste de relance. Proposition : garder « Suivre » = consigner une relance.
- `missions-encaissements.A2` — **Rappels de paiement dus** (`PaymentReminderDue.tsx`) et **carte « échu depuis 30 jours »** (`OverdueThirtyDaysCard.tsx`). Proposition : garder.
- `missions-encaissements.A3` — **« Marquer réglée »** d'un clic et saisie d'une échéance manquante (`collections.markPaid`, `set_due_date`). Proposition : garder (« Consigner un règlement »).
- `missions-encaissements.A4` — **Paiements sortants** (`/missions/paiements`, `PaymentsPage.tsx:106` : paiements des consultants, « Relancer tout », régler, rejeter, motif) et **cessions d'affacturage** (`/missions/cessions`). **Questions à Louis** (voir `missions-planning.A9`).
- `missions-encaissements.A5` — **Bascule d'un client** (`CollectionsPage` prop `client`) : filtre depuis un compte. Proposition : garder (lien entrant).
- `missions-encaissements.A6` — **Nom de l'ordre sans montant** (`collections.withoutAmount`, `withoutDueDate`) : factures sans montant / sans échéance nommées. Proposition : garder (« non mesuré n'est jamais 0 »).

---

## 24. `missions-finance` — Revenu, marge et trésorerie

**Théo `#/missions/finance`** (« Une lecture financière reliée aux missions, avec les inconnues et les pièces à traiter. Ce n'est pas un grand livre comptable. ») → **produit : pas d'écran équivalent sous Missions** ; les chiffres vivent dans **Pilotage > Finance** (`features/pilotage/finance/FinanceScreen.tsx:238`), l'onglet « Conditions & finance » d'une mission (`MissionDetailTabs.tsx`, `MissionMarginEngine.tsx`), `mission-tracking/view/ProfitabilityPanel.tsx`, `delivery/finance.controller.ts` et `business-metrics/treasury.ts`.

Ce que montre Théo : Exporter la revue · **Revue de fin de mois** · filtres (période d'activité, compte, responsable, recherche) · quatre tuiles (**Production validée 43 080 €** « jours client validés × tarif ou jalons valorisés » · **Émis sur cette activité 29 400 €** · **Encaissements du mois 0 €** · **Encours total 56 572 €**) · **MARGE OPÉRATIONNELLE DOCUMENTÉE** (8 780 € HT, 29,78 % sur le revenu couvert, « Couverture du revenu 68,43 % · 1 coût manquant. Les coûts inconnus ne valent pas zéro ») · **Ce qui mérite une décision** (2 dossiers à débloquer · 0 dépassement de commande · 40 252 € échus) · « Marge de contribution illustrée, pas résultat net » · **La rentabilité, mission par mission** (Jours validés · Production HT · Coût documenté · Marge · À faire [Conditions · Renseigner le coût]) · **Les quatre prochaines semaines** (prévision de règlements TTC par semaine + sorties fournisseurs approuvées ; « 24 700 € d'encours à replanifier ou en litige, non placé arbitrairement ») · **Ancienneté de l'encours** · **Achats et factures fournisseurs** (Ajouter une pièce ; Fournisseur / mission · Pièce · HT · À payer TTC · Échéance · Contrôle [À rapprocher · Approuvée] · Contrôler) · **La revue opérationnelle du mois** (Revue ouverte : Activité · Facturation · Coûts et cash) · Journal des modifications financières. Fenêtres : **Terminer la revue de septembre 2026** (« Revue de suivi interne… n'est pas une clôture comptable ni fiscale ») · **Conditions · {mission}** (TJM, coût chargé, commission, TVA, délai de paiement, référence BC, enveloppe, consommation antérieure, BC requis, accord vérifié, coordonnées de facturation vérifiées, justification) · **Ajouter une facture fournisseur** · **Contrôle fournisseur** (pièce HT ; activité × coût documenté ; écart de rapprochement ; « Valider le rapprochement »).

### Liste 1 — REDESSIN

- `missions-finance.R1` — Écran Finance de Pilotage (ligne « Préparé, facturé, à préparer » + « Encaissements » : `FinanceScreen.tsx:238`) → **vue financière dans la barre Missions** avec quatre tuiles.
- `missions-finance.R2` — Marge à quatre niveaux avec confiance (`missions.finance.engine.*`) → **« Marge opérationnelle documentée »** (un montant, un %, une couverture, un coût manquant nommé).
- `missions-finance.R3` — Rentabilité : `ProfitabilityPanel.tsx` (mission-tracking) → tableau « mission par mission » (jours validés · production · coût documenté · marge · à faire).
- `missions-finance.R4` — Conditions d'une mission (`missions.finance.*`, `MissionCostSourceForm.tsx`) → fenêtre **Conditions** à 12 champs.
- `missions-finance.R5` — Facture fournisseur : `supplier-invoices.service.ts` + `MissionDetailTabs` (Ajouter une facture fournisseur) → fenêtre **Ajouter une facture fournisseur** + **Contrôle fournisseur** (rapprochement avec le coût documenté, sans addition automatique dans la marge).
- `missions-finance.R6` — Dérive : `MissionDriftPanel.tsx` → bloc **Ce qui mérite une décision**.

### Liste 2 — FEATURES NEUVES

- `missions-finance.N1` — **Production validée** (jours client validés × tarif ou jalons valorisés). _Back_ (agrégat sur CRA validés + jalons ; `mission-billing.service.ts` à compléter).
- `missions-finance.N2` — **Prévision de règlements sur 4 semaines** (échéances + promesses ; sorties fournisseurs approuvées ; part « à replanifier » non placée). _Back_ : `forecast-horizons.service.ts` et `business-metrics/treasury.ts` existent mais portent l'**horizon d'affaires** et le _runway_ mensuel, pas une trésorerie hebdomadaire. _Démo_ : 4 semaines semées. **Doctrine** : « suivre, pas comptabiliser » — prévision déclarée, pas un solde bancaire (Théo l'écrit).
- `missions-finance.N3` — **Revue de fin de mois** (« Terminer la revue » + compte rendu et réserves + journal de revue + « Revue ouverte »). _Back_ : table de revues mensuelles (aucune trace côté API). _Démo_ : 1 revue ouverte. « Pas une clôture comptable ni fiscale » = cohérent avec #2564.
- `missions-finance.N4` — **Journal des modifications financières**. _Back_ (audit des conditions / pièces).
- `missions-finance.N5` — **Contrôle de rapprochement fournisseur** (pièce ↔ activité × coût, écart HT, « Valider le rapprochement »). _Back partiel_ (`supplier-invoices.service.ts`).
- `missions-finance.N6` — **Cases de vérification d'une mission** (« Accord de prestation vérifié », « Coordonnées de facturation vérifiées »). _Back léger_.
- `missions-finance.N7` — **« Coût inconnu ne vaut pas zéro »** avec couverture du revenu (68,43 %). _Front seul_ — déjà doctrine (GA-18/19), à reprendre tel quel.
- `missions-finance.N8` — **Délai de paiement et TVA par mission** pour les prochains documents (« Les documents déjà émis restent figés »). _Back_ (champs de conditions ; dépend de H1).

### Liste 3 — ABSENTES CHEZ THÉO

- `missions-finance.A1` — **Probabilité / CA probable, forecast** (`CalibratedProbabilityView`, `ProbableQuarterPanel`) — Pilotage seulement (T8). Proposition : rester dans Pilotage.
- `missions-finance.A2` — **Cessions d'affacturage** (`CessionsPage.tsx:80`, `factoring.*` : contrats, cessions, règlements, manquants) et **paiements sortants** (`PaymentsPage.tsx`). **Questions à Louis** (voir `missions-planning.A9`).
- `missions-finance.A3` — **Notes de frais et barème** (`/expenses`, `/expenses/bareme`, `ExpenseReportsPage.tsx:37`, `ExpensePolicyPage.tsx`) et **frais de mission** (`mission-expenses.service.ts`). Théo n'a que « Ajouter un frais » dans le dossier. Proposition : garder.
- `missions-finance.A4` — **Marge à terminaison et contribution après allocations internes** (`engine.levels.contribution/atCompletion`). Proposition : garder dans le dossier.
- `missions-finance.A5` — **Réglages finance** (`financeSettings.json`, `legal-entities`, `workspaceRules.json`). Domaine D.
- `missions-finance.A6` — **Droit finance requis** (`financeHidden`) : la vue est masquée sans droit. Proposition : garder — **à ne pas perdre** (confidentialité de la marge).

---

## Heurts de doctrine (à trancher par Louis avant tout codage)

> Chaque heurt cite la règle du dépôt (`CLAUDE.md`, `agent_docs/doctrine.md`, `packages/contracts/src/schemas/doctrine-registry.ts`) et l'écran Théo qui la heurte. Rien n'est tranché ici : « une doctrine renversée se date et se lit ».

- **H1 — Factures émises, numérotées, avec TVA, spécimen et avoirs** (`missions-preparation.N1-N6`, `missions-factures.N1-N4`, `missions-cra.N4`, `missions-finance.N8`).
  Théo montre des documents `FAC-2026-041` / `DEMO-F-038` avec lignes, TVA 20 %, TTC, « Simuler l'émission », « Pièce figée après émission », **avoirs liés à la facture initiale** et « Exporter le spécimen ».
  Doctrine : « BellumAI SUIT le financier, il ne COMPTABILISE pas » (Louis 18/09/2026, #2564) ; « une facture est **préparée**, jamais émise ni comptabilisée — préparée ≠ créée ≠ envoyée ; “facturé” ne s'écrit que sur **preuve du connecteur** » (`doctrine.md:32,146`) ; plan comptable, écritures, journal comptable : NON. La réserve de Théo (« Ni émission légale ni transmission électronique ni comptabilisation… », « spécimen de démonstration ») va dans le sens de la doctrine **en démo** ; en production, un document numéroté + avoir est une _pièce comptable_ même sans transmission. Précision de Louis du 21/09 (#2418.2) : « acceptée », « rejetée », « avoir émis » existent comme états du _document dans l'outil du client_, pas comme écriture Bellum. **Question** : le brouillon de facture (lignes, TVA, total) entre-t-il en production, et le numéro / l'avoir restent-ils une _lecture du connecteur_ ?
- **H2 — Deux onglets ou trois dans Actions** (`actions-aujourdhui.R6`, `automations-liste.R1`, `sequences-assistant.A1`).
  Théo : **À traiter · Séquences · Automatisations** + une création d'automatisation conversationnelle (`automations-editeur`). Doctrine c122 (19/10/2026, `c122_sequences_et_automatisations_un_seul_parcours`) : « Actions = Aujourd'hui + Séquences… une automatisation est une séquence dont le DÉCLENCHEUR est un signal… trois onglets deviennent deux » — elle renverse c105 (14/10). Théo renverse c122 trois jours plus tard. **Question** : on re-sépare (et on date un second renversement) ou on garde un parcours et on emprunte à Théo seulement la bibliothèque de routines, le journal d'essais et la carte de règle ?
- **H3 — Audience multi-contacts d'une séquence** (`sequences-liste.R4`, `sequences-assistant.R3`, `sequences-detail`).
  Théo : « 2 contacts », « 10 contacts affichés », audience par séquence, « 1 contact(s) arrêté(s), sans arrêter toute l'audience ». Doctrine c74 (21/09/2026) : séquences **mono-contact**, `campaign_label` referme le chantier ; l'audience multi-contacts de #2203.32… est renversée (« datée et renversée, pas effacée »). **Question** : Théo rouvre-t-il le chantier ? (le produit a pourtant une `CreateSequenceDialog` à audience multiple en pratique — `outreach.audience.willCreate_other`, `createdMany` — qui semble créer **N séquences mono-contact** (`toast.createdMany_*`) — à vérifier : compatible avec c74 si l’écran reste « une campagne = N séquences ».)
- **H4 — Assistants « Nora » (repérage) et « Hugo » (préparation)** (`automations-editeur.N6`, `automations-liste.N2`).
  Théo nomme deux assistants IA dans la chaîne d'une règle (`N REPÉRAGE · ASSISTANT IA — Nora repère ce qui compte`, `H PRÉPARATION · ASSISTANT IA — Hugo prépare la suite`). Doctrine D82 : « Le copilote s'appelle **Laura**, partout ». **Question** : renommer en « Laura (repère) » / « Laura (prépare) » ou garder deux personnages ? (ils apparaissent aussi dans « Laura · ton assistante IA » en tête de page : trois noms sur un écran).
- **H5 — « Partielle · en retard »** (`missions-factures.N7`, `missions-factures.R2`).
  Théo affiche un état composé « Partielle · en retard » + « Solde 10 012 € ». Doctrine c72 (21/09/2026) : « aucun cinquième statut d'encaissement » — quatre statuts (`paid` / `disputed` / `overdue` / `pending`), « le RESTE DÛ se NOMME sur la ligne comme dans le total, jamais une “partiellement réglée” ». Théo n'ajoute pas un statut stocké mais un libellé ; le solde est bien nommé. **Question** : le libellé composé est-il admis comme _affichage_ (statut stocké = `overdue`, libellé = « En retard · reste dû 10 012 € ») ?
- **H6 — Responsable par ligne / planning « de l'équipe »** (`actions-aujourdhui.N1`, `talents-vivier.N4`, `missions-planning`, `projects-pipeline.R1`).
  Responsable sur chaque action, présentation, affaire, mission, facture. Doctrine « l'analytique mesure le PRODUIT, jamais la personne » (GA-240/241/264/266/267). Une colonne « Responsable » n'est pas une mesure d'activité ; reste à confirmer qu'aucun écran ne la transforme en ratio (cf. T9 du domaine D).
- **H7 — Étapes d'affaire à 5 niveaux** (T6 repris) (`projects-pipeline.R2`, `projects-presentations.R1`, `projects-besoins.R3`). Théo n'a ni _Perdue_ ni _En sommeil_ (`projects-pipeline.A1`) et supprime Négociation / Signé : « Gagnée » devient la seule sortie. Les REX de perte (`LostDealRex*`) et la probabilité calibrée reposent sur ces états.
- **H8 — Formules de maquette qui ne doivent pas entrer en production.** « Prototype local · données fictives », « Aucun email réel ne sera envoyé… Lancer la simulation », « Simulation activée », « L'état de disponibilité en production est à vérifier », « Campagnes locales et fictives », « Aperçu local · scénario fictif… » sont propres au prototype. Doctrine : « JAMAIS de données fictives. Échec API → erreur claire » ; en démo, le bandeau d'espace démo existe déjà. Les gestes « simuler » (`sequences-detail.N1`, `automations-liste.N5`, `missions-preparation.N3`) sont des gestes de _démonstration_ — à ne livrer qu'en démo, ou à requalifier en « tester sans rien écrire » (comme `routines.dryRun`).
- **H9 — “Aucun CV réel n'est importé” / “Joindre un texte”** (`talents-vivier.A1`). Théo ne montre aucune lecture automatique de PDF / Word ; le produit en fait un cœur de métier (`CvAutoReadBanner`, `CvZipImportDialog`). Ce n'est pas un conflit de doctrine mais une **perte de fonction** si « appliquer Théo exactement » est pris à la lettre.
- **H10 — Probabilité / CA probable.** Absents chez Théo (affaires, finance). Autorisés _dans Pilotage seulement_ (renversement 11/10/2026, #4016 L1) : pas de heurt, mais `projects-fiche.A3` et `missions-finance.A1` rappellent que `projects.probability.*` doit rester hors de ces écrans.
- **H11 — Notation / scoring d'une personne.** Théo écrit « Une appréciation saisie, jamais un score de satisfaction inventé » (retours de mission) — compatible. Le **verdict de matching** du produit (« Fortement défendable » … « Non défendable ») est supprimé chez Théo au profit de « critères étayés / à confirmer » : _plus_ conforme à « un score n'est jamais nu » et à « les axes non évaluables restent nommés » (`projects-rapprochement.R1`). À proposer comme règle, pas à subir.
- **H12 — Étape « Écarté » d'une personne** (`talents-recrutement.N4`). Doctrine « on archive, on ne supprime pas » et « aucun critère protégé ne pèse dans le rang d'une personne » : un motif libre de décision sur une personne est une donnée RGPD sensible.

## Résumé pour Louis (ce qui bloque, dans l'ordre)

1. **H1** (factures) — décide si « Prêt à facturer », « Factures » et « Vue financière » sont de la lecture de connecteur ou de la production de pièces.
2. **H2 / H3 / H4** (Actions) — trois renversements de doctrine datés d'une semaine, à acter ou refuser d'un bloc.
3. **H7 / T6** (étapes d'affaire) — conditionne pipeline, besoins, présentations, REX et probabilité.
4. **Pages produit absentes de Théo** (TC2) : ADV, Paiements, Cessions, Suivi, Notes de frais, Propositions, Marché inverse, fiche Besoin, fiche Action — à garder, déplacer ou retirer.
5. **Fonctions sans équivalent Théo mais structurantes** : dépôt / lecture de CV (`talents-vivier.A1`), conformité RGPD de la fiche talent (`talents-fiche.A1`), board des missions (`missions-planning.A1`), prolonger / terminer une mission (`missions-planning.A2`).
