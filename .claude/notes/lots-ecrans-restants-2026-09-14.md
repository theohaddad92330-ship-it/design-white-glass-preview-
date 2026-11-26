# Lots — écrans restants (hors `/chat`, hors onboarding/welcome, hors audit)

> Cadré le 14/09/2026 par un éclaireur en lecture seule, contre `origin/main` = `b8e432a7a`.
> Écrit par l'orchestrateur (l'éclaireur n'avait pas d'outil d'écriture).

## 1. Chiffres

| | |
|---|---|
| Écrans couverts | **6** : `/accounts`, `/briefing`, `/dashboard`, `/mailbox`, `/discover`, (sans route) |
| Issues | **39** (16 + 15 + 4 + 2 + 1 + 1) |
| Demandes (somme `points≈` vérifiée) | **2 170** — dont **114 en double** (#2130 = copie de #2129) → **2 056 réelles** |
| Lots | **14** |

Détail : `/accounts` 58+52+82+54+58+75+48+58+76+62+70+52+27+61+114+114 = **1 061** · `/briefing`
13+45+87+53+62+22+49+39+37+44+31+76+61+53+70 = **742** · `/dashboard` 32+46+125+64 = **267** ·
`/mailbox` 48+50 = **98** · `/discover` #2136 = 1 · (sans route) #1998 = 1. Total **2 170**.

Source : `python3 tools/issues/digest.py --screen <route>` (5 appels, `rc=0`). Un seul corps brut
ouvert (`gh issue view 2136`) — c'est le seul vrai bug du corpus.

## 2. Les constats courts — à traiter en premier

**C1 — #2136 `/discover` « Découvrir a eu une erreur » : le constat est FAUX, et ce qu'il révèle est plus intéressant.**
Le markup capturé pointe `DiscoverUnverifiable`, pas `DiscoverError`. Deux composants distincts :
`apps/web/src/features/discover/view/DiscoverStates.tsx:129` (`DiscoverUnverifiable`, appelant
`Discover.tsx:498`) contre `:153` (`DiscoverError`, appelant `Discover.tsx:480`). **Rien n'a
planté.** L'écran a affiché « Résultat non vérifiable », l'état doctrinal délibéré — le commentaire
du fichier le dit : « on assume l'absence de résultat plutôt que d'en fabriquer un ». Le défaut réel
est un défaut de **perception** : icône `HelpCircle` sur `tone="var(--warning-soft-bg)"` — un client
bêta l'a lu comme une panne. Correctif = ton et libellé, pas le moteur.
⚠️ **Auteur sur un domaine externe : c'est un retour CLIENT, il passe devant à rang égal.**

**C2 — dans le même corps, un défaut que personne n'a demandé : `GET /notifications/unread-count` → 401**
(production, utilisateur connecté qui naviguait normalement, seule requête en échec du fil). Et le
front l'avale en silence : `apps/web/src/features/notifications/hooks/useNotifications.ts:53` fait
`unreadCount: unread.data?.count ?? 0`. Quand le poll échoue, **la cloche affiche « 0 non lu » au
lieu de « inconnu »** — violation directe de « non mesuré n'est jamais 0 », dans un composant rendu
sur **toutes** les pages (`NotificationBell.tsx:113-115`). Le hook n'expose même pas
`unread.isError` (`isLoading: list.isLoading` seulement, ligne 51).
*(Contre-exemple du piège « un nom n'est pas une preuve » : le corps a été ouvert —
`notifications.service.ts:124-125` filtre bien `{ user_id: userId, read_at: IsNull() }`. Le
cloisonnement est correct, c'est l'AFFICHAGE qui ment.)*

**C3 — #2129 et #2130 sont le MÊME retour, déposé deux fois.** Titre identique, `humain 3 300 c`,
`corps 12 220 c`, `points≈114` identiques ; seuls les ENG diffèrent. **114 demandes comptées deux
fois sur 1 061.** Doctrine : *on propose une fusion de doublons, on ne fusionne jamais* → à soumettre
à Louis, pas à refermer d'office.

**C4 — #2106 dit vrai, mais ce n'est pas un oubli : c'est une dette ASSUMÉE et écrite.**
`apps/api/src/modules/briefing/briefing-actions.ts:307` pose
`const NOTHING_PREPARED: BriefingAction['preparedArtifacts'] = []`, assigné aux **5** producteurs de
cartes (344, 375, 408, 444, 474), avec en commentaire ligne 300 : « AUCUNE carte ne porte d'artefact
préparé, et c'est un CONSTAT, pas un oubli […] le remplir ici avec une valeur plausible serait
exactement la donnée fictive que la doctrine interdit ». **C'est le symétrique du défaut n°1** : le
consommateur existe et est réel — `ActionsBlock.tsx:243` et `chat/lib/morning-brief.ts:104` — donc
**deux branches d'affichage sont mortes en production**, et `briefing-actions.spec.ts:332` garde le
vide : la suite est verte parce qu'elle vérifie que rien n'est produit.

**C5 — #2116 demande un interdit DÉJÀ tenu ; ça devient une question, pas un lot.**
`apps/web/src/features/accounts/model/lastAnalyzed.ts:30-32` renvoie déjà `null` dans le cas exact,
docblock ligne 23 : « Conflating them was the original bug ». Il reste **un seul** chemin vers
`created_at` : ligne 31, `status === 'completed'` sans `last_analyzed_at` — les dossiers *legacy*.
**QUESTION POUR LOUIS** : ce reliquat borné passe-t-il aussi à `null` (au prix d'un « — » sur les
vieux dossiers) ? Appelants : `sections/accountProvenance.ts:177-178`,
`AccountProvenancePanel.tsx:37-71`, `AccountRunsContainer.tsx:32`.

**C6 — #2115 « quatorze onglets » : exact, vérifié.** `AccountDetailTabsBar.tsx:74-90` —
`decide`(3) + `open`(6) + `act`(2) + `capitalise`(3) = **14**. Mais le regroupement demandé
**existe déjà** (4 familles nommées) : la demande réelle est la RÉDUCTION, pas le regroupement.

**C7 — #1998 est corrigé et l'issue est restée ouverte — à moitié.** `Chat.tsx:107` importe
`CopilotCards`, `Chat.tsx:1809` le rend, et
`apps/api/src/architecture/api-response-fields-are-read.spec.ts:158-163` documente la sortie du
champ de la dette le 14/09/2026. **Mais** `turn_id` du même contrôleur est toujours dans
`NOT_READ_YET`. Donc **PARTIEL**, pas LIVRÉ. ⚠️ Touche `/chat` — recouper avec `lots-chat-2026-09-14.md`.

## 3. Tableau des lots

| lot | issues | dem. | fichiers RÉELS | déjà là ? (appelant) | arrêt / doctrine | taille |
|---|---|---|---|---|---|---|
| **A1 — Ton de l'état « non vérifiable »** | #2136 | 1 | `discover/view/DiscoverStates.tsx:129-150` | **LIVRÉ mais mal perçu** — appelant `Discover.tsx:498` | — | **petit** |
| **A2 — Cloche : `?? 0` sur une valeur non mesurée + 401** | (trouvé autour de #2136) | 0 | `notifications/hooks/useNotifications.ts:51-53` ; `components/NotificationBell.tsx:113-115` ; `api/.../notifications.controller.ts:86-88` | **DÉFAUT CONFIRMÉ** — appelant réel `NotificationBell.tsx:84` | **doctrine : non mesuré ≠ 0** | **petit** |
| **A3 — Doublon #2129/#2130** | #2129, #2130 | 114 (×2) | — | — | on propose une fusion, on ne fusionne jamais | **petit** |
| **B1 — Producteurs d'artefacts de brief** | #2106 | 32 | `api/modules/briefing/briefing-actions.ts:307,344,375,408,444,474` ; `packages/contracts/src/schemas/daily-briefing.ts:224,269` ; conso. `ActionsBlock.tsx:243`, `chat/lib/morning-brief.ts:104` | **ABSENT côté producteur, PRÉSENT côté contrat+conso** (dette écrite) | **ARRÊT — envoi sortant** : `draft_message` frôle la création de brouillon tierce. Garde à ne pas casser : `briefing/nothing-is-sent.spec.ts:140` | **gros** |
| **B2 — Registre unifié de candidats du jour** | #2095, #2107 | 133 | `briefing-actions.ts` (5 producteurs) ; `daily-briefing.ts` ; `briefing/cockpit.ts`, `action-cta.ts` | **PARTIEL** : 5 familles classées, 12+18 triggers demandés en plus | **ARRÊT — cloisonnement** (`workspace` + permission requise, #2095). Doctrine : Market Memory ne crée jamais d'événement (#2107) | **gros** |
| **B3 — Contrat de page + hero + sources + fraîcheur** | #2094, #2098, #2112, #2113 | 190 | `briefing/view/BriefingPage.tsx` (**`NowStrip:398` et `ThreadGroup:517` sont LOCAUX à ce fichier**) ; `SourcesStrip.tsx` | **PARTIEL** — états `ready/partial/not_connected/missing_scope/unavailable` à recouper | Doctrine : « une source indisponible ne devient jamais zéro » ; « ne jamais dire que la journée est calme quand des sources manquent ». **ARRÊT coût** : « aucune relance de recherche publique payante depuis un simple refresh » | **gros** |
| **B4 — Trois priorités, accepter/reporter/refuser** | #2099, #2100 | 88 | `briefing/view/ActionsBlock.tsx` ; `briefing/action-cta.ts` | **PARTIEL** | un score n'est jamais nu (la carte porte « confiance ») | **moyen-gros** |
| **B5 — Agenda, conflits, avant/après rendez-vous** | #2101, #2102, #2103 | 112 | `agenda/view/AgendaBoard.tsx` ; `BriefingPage.tsx` | **À VÉRIFIER** (budget atteint) | — | **gros** |
| **B6 — Design premium + responsive** | #2097 | 62 | `BriefingPage.tsx`, `ActionsBlock.tsx`, `BlockState.tsx` | — | gardes design `apps/web/src/architecture/` | **moyen** |
| **B7 — Contexte d'audit + prompt de synthèse** | #2096 | 53 | `api/modules/briefing/` + sortie IA | **DÉPEND DU LOT AUDIT** | Doctrine : « ne jamais utiliser une ancienne version sans le signaler » | **gros** |
| **C1 — Messagerie actionnable + brouillons prouvés** | #2104 | 48 | `mailbox/view/MailboxPage.tsx`, `DraftDialog.tsx`, `ThreadDrawer.tsx` ; `BriefingPage.tsx:231-233` | **PARTIEL** : les 3 seaux (`awaitingReply`/`positiveReplies`/`unread`) existent déjà | **ARRÊT — envoi sortant réel**. Doctrine : le copilote n'envoie jamais d'e-mail | **gros** |
| **C2 — Tâche ≠ action exécutée** | #2105 | 50 | `tasks/view/TaskList.tsx` ; `features/action-os/` ; `api/modules/actions/action-plan-items.service.ts` | **CONSTAT à confirmer**. ⚠️ Le doublon tâche/carte a DÉJÀ été traité — `briefing-actions.ts:309-321` (#1391/#1393.2) | **ARRÊT — envoi sortant** (les 9 états Action OS pilotent des gestes réels) | **gros** |
| **D1 — Cockpit « prendre du recul »** | #2114 | 64 | `dashboard/components/perspective/{PortfolioCoverageCard,TrajectoryCard,DormantOpportunitiesCard,RelationshipPulseCard,CockpitSeriesCard,CockpitSources}.tsx` ; `personal/PersonalCockpit.tsx`, `PersonalKpiRow.tsx` | **PARTIEL, socle riche** : 7 cartes « perspective » existent déjà | **Doctrine, triple** : « ne jamais inventer un taux » ; « je ne peux pas encore mesurer la conversion » = non mesuré ≠ 0 ; `PortfolioCoverageCard` = un taux de couverture mesure ce qu'on SAIT | **gros** |
| **D2 — Personas, densité par rôle, dédoublonnage des blocs** | #2108 | 125 | les 10 blocs nommés → **8 localisés, 2 locaux à `BriefingPage.tsx`** (§4) | **PARTIEL** | **ARRÊT — droits de rôle**. on archive, on ne supprime pas | **gros** |
| **E1 — Architecture du dossier Compte** | #2115, #2122, #2121 | 164 | `AccountDetailTabsBar.tsx:74-90` ; `AccountDetailTabContent.tsx:92` ; `AccountDetail.tsx:50` ; `accountDetailSearch.ts:22-24` (alias `influence`→`organigramme` **déjà posés**) ; `tabs/{organigramme,coverage,partners,access}/` | **PARTIEL** : 14 onglets **déjà groupés en 4 familles** | on archive, on ne supprime pas — #2122 liste 9 choses « à ne pas supprimer » ; contrat d'URL `TAB_KEYS` à préserver | **gros** |
| **E2 — Contexte canonique + contrat de preuve** | #2116, #2118 | 106 | `tabs/sections/accountProvenance.ts:44-178` ; `AccountProvenancePanel.tsx` ; `model/lastAnalyzed.ts` ; `accounts/api.ts` | **PARTIEL, plus avancé que l'issue ne croit** (C5) | un score n'est jamais nu | **gros** |
| **E3 — Opportunités à 4 niveaux de vérité** | #2119, #2124 | 120 | `tabs/veille/`, `tabs/projects/`, `tabs/plan/` | **À VÉRIFIER** | « un élément ne change jamais de niveau automatiquement » | **gros** |
| **E4 — Contacts, funnel, enrichissement gouverné** | #2120 | 75 | `tabs/contacts/`, `components/contact-engagement/`, `hooks/useEnrichAccount.ts`, `useEnrichmentPlanner.ts`, `useAccountCost.ts`, `useDeclareOrgPeople.ts` | **PARTIEL** | **ARRÊT — facturation/crédits**. Doctrine : « 2 027 détectés » ne doit pas laisser croire 2 027 pertinents | **gros** |
| **E5 — Plan, Laura, livrables, refresh gouverné** | #2123, #2125 | 146 | `tabs/plan/`, `usePersistAccountPlan.ts`, `useRefreshDimension.ts`, `useShareDialog.ts`, `useResumeAnalysis.ts`, `features/share/` | **PARTIEL** | **ARRÊT ×3** : export CRM = écriture tierce ; « lien workspace authentifié » = cloisonnement ; refresh = coût/crédits. « rollback » → on archive, on ne supprime pas | **gros** |
| **E6 — Empty states + boucle d'apprentissage** | #2126, #2127 | 79 | `accounts/view/account-detail/` (tous les onglets), `tabs/organigramme/corrections/` | **PARTIEL** | **Doctrine, frontale** : « Aucun état ne doit afficher un simple zéro » — 11 états demandés | **gros** |
| **E7 — Collaboration, recette, analytics, migration** | #2128, #2129(+#2130) | 175 | transverse | — | **ARRÊT — migration** (#2129 nomme « migration ») ; **ARRÊT — droits** | **gros** |
| **F1 — Notifications consenties** | #1938 | 13 | `features/notifications/`, `api/modules/notifications/` | **PARTIEL** | **ARRÊT — envoi sortant réel** (e-mail, push, SMS). **Re-catégorisé** : déposée `feedback:autre`, c'est consentement + envoi sortant | **moyen** |

## 4. Contradictions à trancher avant dispatch

**K1 — Le nom de la page. Deux versions dans le même batch.**
#2094 : « Conserver la route `/briefing` […] Navigation : *Aujourd'hui* […] *Briefing* peut rester un
terme interne au code ». Or **19 issues sur 21 sont titrées « AUJOURD'HUI V3 » mais déposées sur
trois routes** (`/briefing` ×13, `/dashboard` ×3, `/mailbox` ×2). Et #2114, sur `/dashboard`, dit
l'inverse du reste : « Il ne répond pas : *que dois-je faire dans les dix prochaines minutes ?* Cela
appartient à Aujourd'hui ». **À trancher : `/dashboard` est-il « Aujourd'hui » ou son opposé ?**
#2106/#2107/#2108 le traitent comme Aujourd'hui, #2114 comme le cockpit de recul.

**K2 — #2108 nomme 10 blocs ; 2 n'existent pas comme composants.**
`SourcesStrip`, `ActionsBlock`, `SinceLastVisitBlock`, `ChainBlockersBlock`, `MyActivityBlock` →
fichiers réels dans `briefing/view/`. `TaskList` → `features/tasks/view/`. `AgendaBoard` →
`features/agenda/view/`. Mais **`NowStrip` et `ThreadGroup` sont des fonctions LOCALES de
`BriefingPage.tsx`** (398, 517), et **`AccountsToWatch` n'existe sous aucun nom** (`rc=0` sur
recherche quotée). **À trancher : `AccountsToWatch` a-t-il été renommé, ou l'issue décrit-elle un
bloc qui n'existe plus ?**

**K3 — #2122 « Supprimer l'onglet visible Accès » contre le contrat d'URL.**
`AccountDetailTabsBar.tsx:85` documente : « `TAB_KEYS` (le contrat d'URL) ne bouge pas ». Les liens
`?tab=access` déjà partagés doivent continuer à résoudre.

**K4 — #2116 « une section ne doit pas recalculer localement un score » contre #2118 « score
commercial expliqué ».** L'explication doit descendre côté API avec le score, pas être reconstituée
dans `accountProvenance.ts`. À écrire dans le contrat avant de coder E2.

## 5. Arrêts obligatoires

- **Authentification / droits de rôle** : #2108, #2096 (5 rôles), #2128, #2095.
- **Cloisonnement `workspace_id`** : #2095, #2125, #2126, #2116.
- **Facturation / abonnements / crédits** : #2098, #2120 + #2125 (`useAccountCost.ts`,
  `useRefreshDimension.ts`), #2105.
- **Suppression de masse** : #2120 (actions de lot sur les contacts), #2108.
- **Migration qui rétrécit ou supprime** : #2129/#2130, #2122.
- **Envoi sortant réel** : #2104, #2106 (`draft_message`), #2105, #2123, #2125 (export CRM), #1938.
  **Garde à ne surtout pas casser : `apps/api/src/modules/briefing/nothing-is-sent.spec.ts:140`**,
  qui vérifie qu'aucun artefact `draft_message` ne porte de `href` — exactement le verrou que B1 va
  vouloir desserrer.

## 6. Doctrine touchée, règle citée

| règle | où elle est touchée |
|---|---|
| aucune probabilité (refusée 6 fois) | #2114 (« verdict de trajectoire »), #2118, #2099 (« confiance ») — aucun n'écrit « probabilité » ; **relecture manuelle obligatoire**, la garde n'existe pas (`doctrine-registry.ts:1730`) |
| non mesuré ≠ 0 | **violation mesurée** : `useNotifications.ts:53`. Alignés : #2098, #2114, #2126 (11 états) |
| un score n'est jamais nu | #2118 (fiabilité séparée), #2099, `StructuralPotentialBadge.tsx` à auditer |
| un taux de couverture mesure ce qu'on SAIT | `PortfolioCoverageCard.tsx` + `tabs/coverage/` + #2121. ⚠️ **GA-259 ne lit que le namespace `market-memory`** : ces deux blocs lui échappent |
| NOS fournisseurs ne se nomment jamais | #2116 nomme « DataForge » et « Market Memory » comme couches du contexte ; #2127 les met dans un titre d'écran. **À trancher : DataForge est-il nôtre ou branché par le client ?** |
| aucun critère protégé dans un rang, prompt compris | #2121 (décideur/sponsor/bloqueur = rôles → **propre**), #2120 (classement de contacts → à relire), #2096 (**relecture prompt obligatoire**) |
| on propose une fusion, on ne fusionne jamais | #2129/#2130 ; #2122 (fusion Partenaires+Accès) ; #2108 |
| le copilote n'envoie jamais d'e-mail | #2104, #2106, #2123 — garde vivante `nothing-is-sent.spec.ts` |
| on archive, on ne supprime pas | #2122 (onglet Accès), #2125 (« rollback »), #2108 |

## 7. Ordre de dispatch — commandé par le verrou de fichiers

Le verrou dominant est **`apps/web/src/features/briefing/view/BriefingPage.tsx`** : 11 des 15 issues
`/briefing` y atterrissent, et il contient `NowStrip` et `ThreadGroup` en local. Un seul lot à la fois.

1. **A1, A2, A3** — aucun fichier partagé. Partent immédiatement, en parallèle, et répondent à un
   client bêta le jour même.
2. **B1 + B2** — **backend seul, zéro fichier web**. Peuvent partir en même temps que 1. B1 avant
   B2 : B2 étend le registre, il a besoin que le contrat d'artefact ait un producteur.
3. **B3** — prend `BriefingPage.tsx`. **Bloque B4, B5, B6, C1, D2.** À lancer tôt et à tenir court.
4. **B6** (design) puis **B4**, **B5** — même fichier, strictement en série derrière B3. B6 avant
   B4/B5 : même arbitrage que L6 dans la note questionnaire.
5. **C1, C2** — `mailbox/` et `tasks/` disjoints ; C1 touche `BriefingPage.tsx:231-233` → derrière
   B3. C2 est libre, part avec 2.
6. **E1** — prend `AccountDetailTabsBar.tsx` + `AccountDetailTabContent.tsx`. **Bloque E3, E4, E5, E6.**
7. **E2** — `accountProvenance.ts` et `lastAnalyzed.ts`, disjoints de la barre d'onglets : part **en
   parallèle de E1**. Trancher K4 avant.
8. **E3 → E4 → E5 → E6** en série derrière E1.
9. **D1** — `dashboard/components/perspective/`, disjoint de tout. **D2** touche les 10 blocs de
   `/briefing` → **dernier**, derrière B3+B4+B5.
10. **B7** et **E7** en dernier : B7 dépend du lot audit, E7 de tous les lots `/accounts`.
11. **F1** (#1938) : indépendant, mais **ne part pas avant arbitrage de l'arrêt envoi sortant**.

⚠️ **Trancher K1 avant tout dispatch de D1/D2** : si `/dashboard` est « Aujourd'hui », D2 fusionne
avec B3 et le verrou s'aggrave ; s'il est le cockpit de recul, D1 et D2 se séparent proprement.

---

## Faux zéros rencontrés — trois pièges NOUVEAUX, à ajouter au §11 du profil

Tous rendus `rc=0` :

- **`grep` est aliasé sur `rtk grep`** dans ce shell : un `grep -rn … | head` a rendu l'aide de
  `rtk` avec `rc=0`. Idem **`ls`**, qui a rendu une **sortie vide avec `rc=0`** sur un répertoire de
  100 entrées. Parade : `/usr/bin/grep`, `/bin/ls`, `/usr/bin/find`.
- **`--include=*.tsx` non quoté sous zsh** → `(eval):1: no matches found: --include=*.tsx`, **`rc=0`**,
  zéro résultat. Parade : `--include='*.tsx'`.
- **`apps/ia/.venv/` pollue massivement** toute recherche (`draft_message`, `checklist`… : langchain
  embarque `create_draft_message.py`). `--exclude-dir=.venv` est **obligatoire**, pas optionnel.

**`À VÉRIFIER`** (budget de 6 recherches atteint) : B5 (agenda/conflits), E3 (4 niveaux de vérité),
et le constat de #2105 (« cocher passe immédiatement en `done` ») — plausible, non prouvé.
