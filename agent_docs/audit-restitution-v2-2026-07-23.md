# Audit — Restitution V2 « Nouvelles briques produit » vs prod (23 juillet)

**Rapport audité** : `BELLUMAI_RESTITUTION_FINALE_NOUVELLES_BRIQUES_PRODUIT_V2_2026-07-21.pdf` (32 pages)
**Code audité** : `origin/main` = `10efafe8` (23 juillet, 12 h) — **exactement le build servi en prod** (vérifié : le bundle `index-DP9UOd7B.js` de `app.bellum-ai.com` contient `subscribePromo` (#763) et le garde `hasExistingOffer` de #762).
**Méthode** : relecture du PDF page à page, vérification dans le code (i18n FR **et** EN, composant monté, endpoint) + **tentative de vérification live dans Chrome sur `app.bellum-ai.com`** (voir le blocage P0 ci-dessous).
**Remplace** : `agent_docs/audit-restitution-v2-2026-07-22.md`, rendu avant les 16 PR de la nuit. Ce document-ci fait foi.

---

## 0. BLOQUANT — l'application était inutilisable en prod (P0) — ✅ **CORRIGÉ ET VÉRIFIÉ EN PROD**

> **Résolu le 23/07** par la PR #767 (+ #773 côté gardes d'onboarding). Vérifié en
> prod après déploiement : le dashboard, Comptes, Équipe et Découvrir chargent
> normalement, plus aucune boucle sur `/onboarding/state`, plus d'écran « Oups ».
> La vérification visuelle de cet audit a donc pu être menée **après** le correctif.

Ce qui suit décrit la panne telle qu'elle a été observée et diagnostiquée.

La vérification visuelle n'a d'abord pas pu être menée : **toute route protégée finissait sur « Oups. Une erreur inattendue est survenue. »**

Reproduction (onglet neuf, compte `schlegellouis2@gmail.com`) :

1. `https://app.bellum-ai.com/dashboard` → le dashboard démarre normalement (`/notifications`, `/profiles/me`, `/workspaces/me`, `/onboarding/state`, `/credits` — tous 200) ;
2. console : `Minified React error #185` (= _Maximum update depth exceeded_), pile `setRef$1 → Array.map → setRef$1 …` (composition de refs Radix) ;
3. puis **~160 `GET /onboarding/state` en 3 secondes** (boucle de redirection) ;
4. l'API rate-limite → `ApiError … (erreur 429)` levée dans un `beforeLoad` ;
5. l'URL finit sur `/onboarding/plan` et l'écran d'erreur s'affiche.

Même symptôme depuis `/accounts` et `/needs`. Aucune page produit n'est atteignable.

**Effet de bord aggravant** : le garde-fou « compte établi » (#762) lit `/credits` dans son `beforeLoad`, avec `.catch(() => null)`. Sous le tir de 429, cette lecture échoue → `hasExistingOffer` renvoie `false` → un compte **déjà servi** (ici : `plan: decouverte`, `accounts_used: 1`) est renvoyé dans le questionnaire d'onboarding. La rustine de #762 est donc annulée par la panne qu'elle est censée éviter.

**Cause racine confirmée** (instrumentation de `history.pushState` + `fetch` sur la prod) :
`useRedirectAfterAuth` re-navigue à CHAQUE changement d'identité de l'objet `user`.
Le `SessionManager` republie un `user` neuf à chaque `session-applied` — y compris
ceux diffusés par un AUTRE onglet via le `BroadcastChannel`. Deux onglets Bellum
ouverts suffisaient : l'effet refirait, et chaque `navigate` annulait le
`beforeLoad` en vol de la route cible, qui repartait chercher `/onboarding/state`.

Correctif (#767) : un seul rebond par identité + une destination qui dépend de
l'état réel du compte au lieu d'être toujours `/onboarding`.

Pistes initialement suspectées, pour mémoire :

- `useRedirectAfterAuth` (`apps/web/src/features/auth/hooks/useRedirectAfterAuth.ts:78`) route **toujours** vers `/onboarding` après auth — son propre TODO l'admet (« Pre-launch we always route to /onboarding »). Face au garde #762 qui renvoie les comptes établis vers `/dashboard`, on obtient un ping-pong.
- La boucle de rendu (#185) précède les 429 : c'est elle le déclencheur. Les deux composants nouveaux du dashboard (`ActivationChecklist`, `ProfileComplementCard`) sont propres à la lecture ; la piste est plutôt une composition de refs (`asChild` imbriqué).

À traiter **avant** tout nouveau chantier produit : aucun des points ci-dessous n'est visible par un utilisateur aujourd'hui.

---

## 1. Synthèse par section

| §      | Écran                        | 22/07        | **23/07**                        | Ce qui a bougé cette nuit                                                                                              |
| ------ | ---------------------------- | ------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| §3     | Menu latéral                 | LIVRÉ        | **LIVRÉ**                        | — (ordre exact : dashboard, copilote, découvrir, comptes, contacts, besoins, veille, équipe, historique)               |
| §4     | Comptes                      | partiel      | **LIVRÉ (3 idées sur 4)**        | proximité expliquée sur les comptes proches ✅, bouton Copilote sorti du clic droit ✅                                 |
| §5     | Contacts                     | partiel      | **PARTIEL**                      | inchangé — 3 manques (filtre « à compléter », attribution/plan en masse, prompt copilote)                              |
| §6     | Besoins                      | LIVRÉ        | **LIVRÉ**                        | source + confiance + fraîcheur rendues par besoin ✅                                                                   |
| §7     | Détail besoins               | PARTIEL      | **LIVRÉ (5 actions sur 6)**      | export CRM ✅ ; l'angle à la demande existe mais sur l'onglet Plan, pas dans le panneau                                |
| §8     | Historique                   | LIVRÉ        | **LIVRÉ**                        | inchangé (0 des 4 « idées » du rapport)                                                                                |
| §9     | Workspace (texte)            | PARTIEL      | **LIVRÉ (4 critères sur 4)**     | crédits rapportés au quota ✅, actions partagées visibles ✅                                                           |
| §10    | Workspace (maquette p.11)    | 4 blocs / 13 | **9 blocs / 13**                 | +activité récente, +actions partagées, +crédits & usage, +mention hébergement, +Gérer les membres, +tendance mensuelle |
| §11    | Veille                       | PARTIEL      | **PARTIEL**                      | badge de fraîcheur/archive ✅ ; règles perso et digest quotidien toujours absents                                      |
| §12    | Copilote (critères)          | 1/4          | **1/4**                          | UI de confirmation d'action livrée, mais **outils toujours OFF par flag**                                              |
| §13    | Transparence                 | LIVRÉ        | **LIVRÉ**                        | nature de chaque source + date du dossier consulté ✅                                                                  |
| §14    | Copilote (maquette p.15)     | 1 bloc / 8   | **1 bloc / 8**                   | inchangé                                                                                                               |
| §15    | Connaissances                | PARTIEL      | **PARTIEL**                      | inchangé (page dé-listée mais vivante, 4 onglets orphelins)                                                            |
| §16-17 | Découvrir (wording, filtres) | LIVRÉ        | **LIVRÉ**                        | —                                                                                                                      |
| §18-19 | Découvrir (maquette p.20)    | 5 blocs / 20 | **12 blocs / 20**                | +lancer sans idée, +expliquer la méthode, +tri, +export, +sous-total fort potentiel                                    |
| §20    | Objets transverses           | 3/8 complets | **4/8 complets**                 | `Need` gagne source/confiance à l'écran                                                                                |
| §21-30 | Questionnaire 30 questions   | MANQUANT     | **PARTIEL (5 questions sur 30)** | « Temps 2 » livré (#735) mais déclenché par la 1re analyse, pas 24 h, et sans logique conditionnelle                   |
| §29    | Garde-fous                   | LIVRÉ        | **LIVRÉ**                        | aucune violation                                                                                                       |
| §31    | Checklist finale             | 2/8          | **5/8**                          | voir détail plus bas                                                                                                   |

**Le motif a changé.** Hier : « le vocabulaire est fait, la structure ne l'est pas ». Aujourd'hui : **deux des trois maquettes cibles sont largement construites** (cockpit manager 9/13, Découvrir 12/20). Il reste **trois trous de fond, tous connus et tous volontaires** : le Copilote qui n'agit pas (flag), le questionnaire à 30 questions, et les objets que le rapport suppose mais que la base n'a pas (affaire valorisée, objectif commercial, commentaire d'équipe).

---

## 2. Densité des écrans vs les maquettes

### §10 — Cockpit manager (maquette p.11) : **9 blocs sur 13**

Ordre réel de `ManagerDashboardPage.tsx` (lignes 69-164) :

| #   | Bloc de la maquette                                                 | État              | Preuve / réserve                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | En-tête + actions                                                   | **PARTIEL**       | Titre cible + `Gérer les membres` → `/settings/team` (`:83-88`). Pas de « Créer l'équipe »                                                                                                                    |
| 2   | 5 tuiles KPI avec sparkline et delta                                | **PARTIEL**       | 4 tuiles (comptes / contacts / emails / analyses) **avec tendance mensuelle** (`TotalCard` + `TrendLine`, `:182-230`), sans sparkline. Manquent : opportunités actives, actions en cours, **taux de réponse** |
| 3   | Table membres avec **performance %**                                | **PARTIEL**       | 9 colonnes dont Portefeuille ≠ Comptes créés. Pas de colonne objectif/atteinte — **le produit n'a aucune notion d'objectif par commercial**                                                                   |
| 4   | Comptes par propriétaire + opportunités + **valeur €**              | **PARTIEL**       | `CoverageCard` (ratio attribué/total + zone blanche). Ni compte d'opportunités par propriétaire, ni montant                                                                                                   |
| 5   | Pipeline par étape commerciale, **9,1 M€**                          | **ÉCART DE FOND** | `PipelineStrip` = pipeline de **contacts** (nouveau → gagné), sans valorisation                                                                                                                               |
| 6   | Activité récente                                                    | **LIVRÉ** ✅      | `RecentActivityFeed` (`:159`)                                                                                                                                                                                 |
| 7   | Rappels & agenda                                                    | **MANQUANT**      | aucune clé agenda/rappel dans `manager.json`                                                                                                                                                                  |
| 8   | Actions à traiter (partagées)                                       | **LIVRÉ** ✅      | `SharedActionsQueue` : onglets `all / mine / delegated`, badge « en retard », échéance, assigné (`:125-127`)                                                                                                  |
| 9   | Crédits & usage IA (quota + classement)                             | **LIVRÉ** ✅      | `CreditsUsageCard` : deux jauges avec dénominateur, reste, consommation par membre (`:120`)                                                                                                                   |
| 10  | Mémoire partagée                                                    | **MANQUANT**      | la mémoire reste per-user (`memory_pinned_facts.user_id`)                                                                                                                                                     |
| 11  | Playbooks partagés + taux de réussite                               | **MANQUANT**      | `library_items` existe, mais sur `/knowledge` dé-listée                                                                                                                                                       |
| 12  | Capitalisation & collaboration (commentaires, idées)                | **MANQUANT**      | aucun objet commentaire en base                                                                                                                                                                               |
| 13  | Mention « hébergé en Europe »                                       | **LIVRÉ** ✅      | `footer.hosting` (`:161-163`)                                                                                                                                                                                 |
| +   | _(hors maquette)_ carte de couverture, doublons, file d'attribution | **LIVRÉ**         | `:133-151`                                                                                                                                                                                                    |

**Verdict densité** : l'écran est passé du « tableau de charge » au cockpit. Les 4 blocs restants supposent 3 objets absents de la base (**affaire valorisée**, **objectif**, **commentaire**) — c'est une décision produit (D7), pas une dette de câblage.

### §19 — Découvrir (maquette p.20) : **12 éléments sur 20**

Livrés cette nuit : barre haute complète (`Recherches enregistrées` · `Expliquer la méthode` · **`Lancer sans idée de départ` badge IA**, `Discover.tsx:339-354`), carte « Laissez Bellum trouver vos meilleures opportunités » **avec la provenance de chaque critère choisi** (`autopilot.appliedTitle` « Bellum a choisi sur : »), carte « Notre méthode en 3 étapes » (profil → signaux datés → score), tri (4 clés), export CSV (16 colonnes), sous-total « dont N à fort potentiel » **avec sa règle explicitée**.

Restent absents : filtres unifiés (le produit garde 3 modes exclusifs — **on ne peut toujours pas croiser secteur et signal d'intention**), croissance estimée, technologies, « comptes récemment actifs », filtre fit ESN, volume prévisionnel avant lancement, bascule grille/liste, action « attribuer à un collègue ».

### §14 — Copilote (maquette p.15) : **1 élément sur 8** — inchangé

Toujours absents : le bandeau « Sources & intégrations » montrant les connecteurs **actifs** (l'utilisateur ne voit que ce qui manque), le bandeau de contexte en haut de page (il vit dans le rail droit), la **réponse en carte structurée** (Objectif / Angle / Cas d'usage, chaque bloc sourcé — le rendu est du markdown à plat), l'« Activité de la session », la mention de pied « les réponses peuvent contenir des erreurs ».

---

## 3. Le point dur : le Copilote n'agit toujours pas (§1, §12, §14)

C'est **la thèse produit du rapport** (« le chat qui répond bien sans pouvoir agir » est le piège nommé p.13) et c'est le seul critère bloquant qui n'a pas bougé.

État exact :

- `apps/ia/app/services/chat_tools.py` expose **4 outils** : `compare_accounts`, `get_account_briefing` (lecture) et `prepare_message_for_contact`, `schedule_reminder_for_contact` (**propositions**, jamais d'écriture — c'est le clic utilisateur qui appelle l'endpoint réel) ;
- l'UI de confirmation est livrée et testée (`apps/web/src/features/chat/view/PendingActions.tsx`) ;
- **mais** `apps/ia/app/routers/chat.py:20-23` garde `CHAT_TOOLS_ENABLED` en **opt-in** : sans la variable, `/chat/message` n'importe même pas l'orchestrateur. En prod, la variable n'est pas posée → **zéro outil, l'écran de confirmation ne s'affiche jamais**.

Le flag contredit aussi la politique maison « zéro-flag, kill-switch seulement » (cf. `DATA_GATEWAY_DISABLED`, `JUDGE_DISABLED`…). Deux lignes à écrire : renommer en `CHAT_TOOLS_DISABLED` et inverser le défaut.

Restent hors périmètre des 4 outils, demandés par §14 : enrichir un contact, mettre à jour le CRM, lancer une recherche.

---

## 4. §31 — Checklist finale : 5 livrables sur 8

| #   | Livrable                                                          | Verdict                                                                                                                                                                              |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Copilote 2e, Découvrir 3e                                         | **LIVRÉ**                                                                                                                                                                            |
| 2   | Connaissances supprimée, fonctions intégrées ailleurs             | **PARTIEL** — retirée du menu ✅, documents + mémoire dans le Copilote ✅ ; Templates / Playbooks / Méthode / Données CRM restent orphelins sur `/knowledge`, route toujours vivante |
| 3   | Workspace repensé ou scope réduit                                 | **LIVRÉ (repensé)** — 9 blocs sur 13 ; les 4 restants exigent des objets absents (D7)                                                                                                |
| 4   | Contacts enrichissables (tél / email / LinkedIn / photo / export) | **LIVRÉ**                                                                                                                                                                            |
| 5   | Besoins reliés à une base (sources, fraîcheur, confiance, statut) | **LIVRÉ** — `opportunities` + `OpportunityProvenanceLine` (source, confiance, « Actualisé le »)                                                                                      |
| 6   | Veille en un flux priorisé **et personnalisé**                    | **PARTIEL** — priorisé ✅, personnalisé ❌ (aucune règle personnelle), 4 onglets conservés au lieu de filtres                                                                        |
| 7   | Questionnaire 24 h remplacé par 30 questions                      | **PARTIEL** — Temps 2 = **5 questions** déclenchées après la 1re analyse ; ni 30 questions, ni blocs A-F, ni logique conditionnelle, ni déclencheur 24 h / 3 actions                 |
| 8   | Copilote, Découvrir et Score sur le même UserProfile              | **LIVRÉ**                                                                                                                                                                            |

---

## 5. Ce qui reste, trié par valeur

### Câblage (petit code, gros écart perçu)

| #   | Action                                                                                                                                    | Où                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| C1  | **Retirer le flag `CHAT_TOOLS_ENABLED`** (→ kill-switch `CHAT_TOOLS_DISABLED`) : 4 outils écrits + une UI de confirmation dorment en prod | `apps/ia/app/routers/chat.py:20-23`             |
| C2  | **Filtre « coordonnées à compléter »** + KPI contacts cliquables vers la liste filtrée                                                    | `fr/contacts.json:43-48`, `ContactContent.tsx`  |
| C3  | **Compter les signaux** dans « Cette réponse utilise… » (la phrase exacte du §13 reste irreproductible)                                   | `fr/chat.json:118-129`, `ContextDisclosure.tsx` |
| C4  | **Mention de pied du Copilote** (« les réponses peuvent contenir des erreurs ») — maquette p.15, coût nul                                 | `fr/chat.json`                                  |
| C5  | **Export de la sélection** de contacts (aujourd'hui l'export prend tous les contacts affichés)                                            | `ContactContent.tsx:356`                        |
| C6  | Nettoyer les clés mortes : `watchlist.detail.reminderSoon`, `nav.items.knowledge`, `nav.pageTitles.knowledge` (FR+EN)                     | i18n                                            |
| C7  | **Signal « déjà exploré par un collègue »** sur la liste Comptes — la donnée d'attribution existe                                         | `AccountTableRow.tsx`                           |

### Vrais chantiers

| #   | Action                                                                                                                                        | Effort | Pourquoi                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| T1  | **Outils d'écriture manquants** du Copilote : enrichir un contact, mettre à jour le CRM, lancer une recherche                                 | Moyen  | §14 ; les 2 premiers outils de proposition prouvent que le motif marche |
| T2  | **Règles de veille personnelles** (secteurs, technos, comptes, besoins, personnes) + digest quotidien                                         | Moyen  | §11 : c'est _tout_ ce qui manque pour tenir « personnalisée »           |
| T3  | **Questionnaire progressif** : passer de 5 à ~30 questions, blocs de 4-6, logique conditionnelle (§28), préremplissage depuis les connecteurs | Élevé  | §21-30 ; débloque aussi le critère §12 « le profil modifie le ton »     |
| T4  | **Réponses structurées du Copilote** (Objectif / Angle / Cas d'usage, sourcés) + bandeau des connecteurs **actifs**                           | Moyen  | Maquette p.15 : rend l'orchestration visible même avant T1              |
| T5  | **Filtres unifiés de Découvrir** (croiser secteur × signal × fit) au lieu de 3 modes exclusifs                                                | Moyen  | Maquette p.20, élément 2 — c'est l'écart de structure restant           |
| T6  | **Mode « ce qui a changé depuis ma dernière connexion »** + traçage des changements de score/profil                                           | Moyen  | §8 ; bloqué sur une décision (`last_seen_at` = heartbeat, cf. tracker)  |
| T7  | **Alimenter la base d'opportunités** par le CRM, le RAG et les runs passés (aujourd'hui : `raw_analysis` du run courant uniquement)           | Élevé  | §6 « vision produit » — c'est ce qui rend la brique difficile à copier  |

### Décisions produit (ne pas coder sans arbitrage)

| #   | Question                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Connaissances** : Templates / Playbooks / Méthode / Données CRM n'ont plus d'entrée de menu mais la route vit. Les re-héberger (Réglages ? Équipe ?) ou les supprimer franchement                              |
| D2  | **Veille** : le rapport veut « une seule page, filtres secondaires ». Les 4 onglets sont conservés (renommés). Trancher                                                                                          |
| D3  | **Statuts de compte** : `commercialStatus` dit encore « À suivre / Opportunité / Écarté » quand les onglets disent « En observation / Comptes à potentiel / Hors priorité »                                      |
| D4  | **Copilote** : « Contexte actif » subsiste dans le bloc transparence alors que le panneau s'appelle « Ce que Bellum utilise »                                                                                    |
| D5  | **Besoins × Veille** : unifier `Signal` et `Need` dans l'Opportunity Graph (le §6 le suggère, l'architecture ne le fait pas)                                                                                     |
| D6  | **Découvrir** : « Suivre » vs « Ajouter à mon portefeuille » — même geste, promesses différentes, à trancher avant d'ajouter « attribuer à un collègue »                                                         |
| D7  | **Cockpit manager** : les 4 blocs restants supposent l'_affaire valorisée_ (pipeline €), l'_objectif commercial_ et le _commentaire d'équipe_. Les créer = entrer sur le terrain du CRM. Trancher avant de coder |
| D8  | **Monétisation des besoins** (§6 : « vous avez vu 5 besoins, 8 autres disponibles ») : aucune surface de teasing n'existe. Volontaire ?                                                                          |

---

## 6. Wording — état

FR : **tous** les tableaux « élément actuel → proposition recommandée » du rapport (§4, §5, §6, §8, §9, §11, §12, §16) sont appliqués.
EN : **parité complète**, y compris sur les clés livrées cette nuit (vérifié clé à clé sur `discover.json` — `explainMethod`, `autopilot`, `sortLabel`, `highPotential`, `export` — et `manager.json` — `sharedActions`, `credits`, `hosting`, `manageMembers`).

Résidus à nettoyer : cf. C6 et D3/D4.
