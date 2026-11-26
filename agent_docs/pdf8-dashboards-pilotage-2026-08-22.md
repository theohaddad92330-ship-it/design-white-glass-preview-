# PDF 8/9 — Dashboards managers, performance et pilotage d'équipe

Source : `agent_docs/sources/pdf8-dashboards-pilotage-2026-08-22.pdf` (10 pages, ORION,
19/08/2026). Le dossier `sources/` est gitignoré — le PDF n'est pas committé.

Série : 8/9. Prérequis annoncés : PDF 1 à 7. Les sept chantiers précédents sont clos
(`agent_docs/pdf1-…` à `pdf7-…`, plus `dette-pdf1-6-2026-08-21.md`).

---

## 0. Ce que le croisement a trouvé, avant de parler du PDF

Le document tient en une phrase : **« un dashboard sans action possible est une page de
reporting, pas un cockpit »**. Le croisement en donne une seconde, qui décrit l'état du
dépôt : **beaucoup est calculé, et presque rien n'est montré.**

Douze défauts, aucun demandé par le PDF.

| #   | Défaut trouvé en croisant                                                                                                                                                     | Preuve                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | **Un taux sans dénominateur vaut 0, et ce 0 devient une ALERTE** — sur l'écran de pilotage lui-même                                                                           | `pilotage.ts:105-108` (`if (denominator <= 0) return 0`) + `:101-103`   |
| 2   | **Le dictionnaire de KPI est décoratif** : 5 entrées, et aucune de ses 5 clés ne correspond à un calcul du dépôt                                                              | `playbook.ts:327-361` vs recherche à vide ailleurs                      |
| 3   | **Le classement de proactivité ne classe rien** : `decideProactivity` est appelé avec UN candidat à la fois                                                                   | `notifications.service.ts:189-191`                                      |
| 4   | **Le CORPS des messages est lisible par tout l'espace, sans permission**                                                                                                      | `activities.service.ts:256`, `activities.controller.ts:29-38`           |
| 5   | **Le pilotage n'est gardé par AUCUNE permission** — un rôle en dur dans le service, si bien que `sales_ops` (qui a pourtant `team:manage`) est refusé                         | `manager.service.ts:99-101`, `objectives.service.ts:83-85`              |
| 6   | **Le prévisionnel, les risques de mission et la capacité sont calculés et affichés NULLE PART** — `useForecast`, `missionsApi.scores`, `computeCapacity` n'ont aucun appelant | `missions/api.ts:190,193,417` sans consommateur                         |
| 7   | **Les KPI CRM, matching et qualité n'ont aucun consommateur non plus**, pas même au back-office                                                                               | `internal-team-kpis.controller.ts:87,96,77` vs `apps/dashboard-manager` |
| 8   | **Aucune historisation de KPI** — donc « variation > 20 % » et « fin de mois » n'ont aucune base de comparaison                                                               | aucune table, `manager.service.ts:820` recalcule à la volée             |
| 9   | **Deux noms pour le même niveau d'automatisation** : `n2_user_approval` et `n2_simple_approval`                                                                               | `action-os.ts:43` vs `chain.ts:68`                                      |
| 10  | **Deux seuils de mesurabilité déclarés et jamais lus** (`benchRate`, `averageMargin`)                                                                                         | `measurability.ts:49`                                                   |
| 11  | **Rien ne vérifie qu'une contrainte SQL couvre son énumération TypeScript** — GA-08 gèle le TS, GA-11 empêche le SQL de rétrécir, personne ne compare les deux                | `enum-additivity.test.ts` et `check-constraints-additive.spec.ts`       |
| 12  | Le commentaire d'`intervention-rules.ts` annonce la règle « valable pour les six natures » ; `account_untouched` fait délibérément l'INVERSE — et a raison                    | `intervention-rules.ts:22-27` vs `:203`                                 |

Le n°1 mérite d'être lu deux fois : l'écran dont tout le vocabulaire est `non_mesure`
affiche une **alerte rouge** sur chaque maillon d'un espace qui n'a simplement rien fait
encore. La protection existe côté écran (`PilotagePage.tsx:110-114` teste `value === null`)
mais l'API n'envoie jamais `null`.

Et le n°6 donne sa vraie forme au chantier : **le PDF demande 60 indicateurs neufs pendant
qu'une trentaine, déjà calculés et testés, n'ont aucun écran.**

---

## 1. Les marqueurs « Confirmé — repo » du PDF

Le PDF en pose quatorze. **Trois sont faux, quatre sont trompeurs.**

| Marqueur                                                       | Réalité                                                                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| p1 « 6 natures existent avec des seuils en dur »               | **VRAI**, et les six seuils correspondent au chiffre près (`playbook.ts:245-253`, `CREDITS_EXHAUSTED_RATIO = 0.9`)                                                              |
| p2 « ce qu'on ne sait pas n'alerte jamais » [Confirmé — repo]  | **PARTIEL** — testé sur 3 natures explicitement ; et `account_untouched` fait l'inverse, à raison                                                                               |
| p3 « aucun classement public des membres. Non-goal explicite » | **FAUX** — aucun non-goal de ce genre n'est écrit nulle part, et la liste des membres est servie **triée par volume décroissant** (`manager.service.ts:176`)                    |
| p5 « L'OS ESN décrit 4 rituels » [Confirmé — doc]              | VRAI côté doc ; **aucune notion de rituel n'existe dans le produit**                                                                                                            |
| p5 « Un endpoint de dictionnaire existe déjà. À étendre »      | **TROMPEUR** — il existe (`GET /playbooks/kpi-dictionary`) mais porte 5 entrées de 5 champs, dont aucune ne correspond à un calcul. C'est exactement « une décoration »         |
| p6 « member_objective existe » [Confirmé — repo]               | **VRAI, mais l'inverse du PDF sur un point** : l'objectif est posé par le MEMBRE lui-même (`PUT /objectives/me`), aucune route ne permet à un manager de fixer celui d'un tiers |
| p7 PIL-01 balayage quotidien [Confirmé — repo]                 | **VRAI** — `interventions.sweeper.ts:62`, cron `10 6 * * *`                                                                                                                     |
| p7 PIL-02 brief manager lundi 08:15 [Confirmé — repo]          | **TROMPEUR** — `monday_kickstart` existe à 08:00, mais il est **par utilisateur**, pas manager, et éteint par défaut                                                            |
| p7 PIL-03 recap vendredi 16:00 [Confirmé — repo]               | **VRAI** — `weekly_recap`, `defaultHour: 16`, `defaultWeekday: 5`                                                                                                               |
| p7 PIL-04 revue trimestrielle [Confirmé — repo]                | **VRAI** — `quarterly_review`, 1ᵉʳ jour ouvré                                                                                                                                   |
| p4 « aucune pondération probabiliste » (D4)                    | **VRAI** — refusé quatre fois déjà, et `mission-scores.ts:81-95` le documente                                                                                                   |
| p3 « les 4 CA jamais additionnés » [rappel PDF 5]              | **VRAI au contrat** (`revenue.ts:26-37`) — **et rendu nulle part**                                                                                                              |

---

## 2. Les décisions de Louis (22/08/2026)

⚠️ **Collision de numérotation.** Le PDF 8 pose ses questions sous D38 à D42 — cinq numéros
**déjà pris par le PDF 6** (D38 à D46). Renumérotées **D64 → D68** ici.

| ID  | PDF | Question                                        | Décision                                                                                                                                                                                                                                                                                                            |
| --- | --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —   | —   | Par quoi commence le chantier                   | **Brancher d'abord, ajouter ensuite.** Donner un écran à ce qui est déjà calculé et corriger les douze défauts, AVANT d'écrire 60 indicateurs neufs. Le PDF demande de la matière nouvelle pendant qu'une trentaine d'indicateurs testés n'a aucun appelant.                                                        |
| —   | —   | Le dictionnaire de 60 KPI                       | **Les 60 déclarés, calculés ceux qui le sont.** Chaque entrée porte ses 7 attributs et sa décision associée ; celles dont la donnée existe sont calculées avec leur complétude, les autres portent `measurable: false` **et la raison** — la discipline de `product-kpi.ts`.                                        |
| D65 | D39 | Le manager voit-il le corps des messages ?      | **Non — le corps ne sort qu'à son auteur.** Ce n'était pas une question ouverte : `GET /activities` l'expose déjà à tout l'espace sans permission. La timeline garde canal, objet, date, verdict et auteur ; seul le CORPS est retiré.                                                                              |
| —   | —   | La permission qui garde le pilotage             | **`team:manage`, réutilisée.** Elle existe, elle est portée par owner/admin/sales_ops, et elle veut dire exactement « cette personne encadre une équipe ». Aucun ajout à l'énumération, et `sales_ops` retrouve un écran qui aurait toujours dû lui être ouvert.                                                    |
| D64 | D38 | Un dashboard Recruteur dédié ?                  | **Non**, conformément au PDF : `/projects/needs` et `/consultants/pool` sont des écrans de TRAVAIL. Un dashboard de plus ajoute un endroit à consulter sans ajouter une décision.                                                                                                                                   |
| D66 | D40 | Seuil d'activation du cockpit, espace neuf      | **Pas de seuil.** Le dépôt a déjà mieux : chaque indicateur dit `non_mesure` pour lui-même (`pilotage.ts:25-26`, `crm-kpis.ts:20-23`). Un seuil global masquerait un écran qui a déjà de quoi être honnête. Ce qui manque n'est pas un verrou, c'est **une phrase** qui explique la mosaïque — livrée au lot A.     |
| D67 | D41 | Les objectifs sont-ils visibles de tous ?       | **Non** — chacun voit les siens, le manager ceux de son équipe. C'est déjà le comportement (`objectives.service.ts:82-85`) ; rien à changer.                                                                                                                                                                        |
| D68 | D42 | Source des absences pour exclure `rep_inactive` | **Aucune, et on l'écrit.** Aucun SIRH n'est connecté et le produit n'a pas de notion d'absence. Le dépôt compense déjà par le SEUIL (`playbook.ts:243-244` : « deux semaines pleines : en dessous, on alerterait sur des congés »). Inventer une saisie de congés dans un outil commercial serait un autre produit. |
| D4  | —   | Forecast pondéré                                | **Reconduit REFUS** (5ᵉ fois). Le prévisionnel est en trois lignes non additionnées, et `mission-scores.ts:81-95` le documente déjà.                                                                                                                                                                                |

⚠️ **Une règle permanente que ce chantier ne renverse PAS.** Les KPI CRM, matching et
qualité sont **back-office uniquement**, par arbitrage explicite des 31/07 et 03/08 :
« un taux affiché à un commercial devient une promesse chiffrée qu'il faut tenir ;
affiché à l'opérateur, il devient un outil pour la tenir » (`crm-kpis.ts:7-11`). Le défaut
n°7 (« calculés, affichés nulle part ») se corrige donc **au back-office**, pas dans
l'application.

---

## 3. Les lots d'implémentation

Ordonnés selon la décision « brancher d'abord ».

| Lot | Titre                                                               | Ce qu'il ferme                    |
| --- | ------------------------------------------------------------------- | --------------------------------- |
| A   | **L'alerte rouge sur un espace vide**                               | défaut 1 · items 12, 69, 70       |
| B   | **Le corps des messages ne sort qu'à son auteur**                   | défaut 4 · D65 · items 21, 24, 64 |
| C   | **La permission qui garde le pilotage**                             | défaut 5 · items 63               |
| D   | **Le prévisionnel, les risques et la capacité obtiennent un écran** | défaut 6 · items 30, 32, 89       |
| E   | **Les KPI calculés obtiennent leur écran de back-office**           | défaut 7                          |
| F   | **Les six natures d'intervention, et la garde qui manquait**        | défaut 11 · items 11, 73, 74      |
| G   | **Le classement, les cinq cartes, le motif obligatoire**            | items 13, 14, 15, 75, 76, 77, 79  |
| H   | **Le dashboard dirigeant**                                          | items 25, 26, 27, 88              |
| I   | **La proactivité classe vraiment**                                  | défaut 3                          |
| J   | **Le dictionnaire de 60 KPI**                                       | items 40-45, 80-86                |
| K   | **La vue Qualité CRM cliquable**                                    | items 31, 90                      |
| L   | **Les rituels animés**                                              | items 35-39, 87                   |
| M   | **Les petits défauts qui traînent**                                 | défauts 9, 10, 12                 |

---

## 4. Ce qui est parti (PR #1019)

Branche `feat/pdf8-dashboards-pilotage`. Onze lots, quatre suites vertes
(API 5646 · contrats 1553 · web 2736 · IA 4168 · MCP 21), format et knip propres.

| Lot | Livré                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------- |
| A   | Un espace neuf ne s'ouvre plus en rouge · `flowStatus`/`stockStatus` · `pilotageCoverage` + phrase         |
| B   | Le corps d'un message ne sort qu'à son auteur (D65) · `bodyRedacted` · la timeline le DIT                  |
| C   | `team:manage` garde le pilotage · `sales_ops` débloqué · GA-05 perd deux entrées                           |
| D   | Cinq lectures financières obtiennent un écran (`FinancePanel` sur `/pilotage`)                             |
| E   | Les KPI CRM / matching / qualité obtiennent leur écran de BACK-OFFICE                                      |
| F   | **GA-12** : les contraintes SQL couvrent leur énumération TypeScript · `accounts.status='prospect'` réparé |
| F′  | GA-12 élargie aux contraintes déclarées en `CREATE TABLE` · `finance:write` et 3 portes réparées           |
| G   | La file d'intervention se classe, se borne à cinq, exige un motif pour clore                               |
| H   | La marge par CANAL et le coût de l'intermédiation · `missions.channel` saisi                               |
| I   | Le classement de proactivité classe enfin (`createProactiveBatch`)                                         |
| J   | Le dictionnaire de 60 indicateurs, dont 8 déclarés non mesurables AVEC leur raison                         |
| K   | La vue Qualité des données — huit listes de travail, chacune cliquable et gardée                           |
| L   | Les cinq rituels et leur ordre du jour, branchés sur des chiffres réels                                    |
| M   | `n2_simple_approval` aligné · deux seuils de mesurabilité branchés · un commentaire corrigé                |

### Les défauts trouvés en croisant, et leur sort

Les douze du §0 sont tous traités, plus **trois pannes que GA-12 a sorties** et
qu'aucune ligne du PDF ne demandait :

- `accounts.status = 'prospect'` — « Ajouter au portefeuille » écrivait une
  valeur qu'aucune des cinq déclarations de `accounts_status_check` n'a jamais
  autorisée. La contrainte rejetait, le `catch` avalait, l'utilisateur lisait
  « Impossible d'ajouter ce compte ». **Un bouton mort depuis des mois.**
- `finance:write` n'était accordable à personne (permission du PDF 5, contrainte
  jamais élargie).
- `interview_go`, `proof_sufficiency`, `delivery_risk` ne pouvaient pas être
  journalisées — et comme l'écriture du journal d'audit est bloquante, c'est le
  geste entier qui serait tombé.

---

## 5. Ce qu'on ne promet pas

| Demande                                         | Raison                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Séance de rituel, chronomètre, compte rendu     | Le dépôt a DÉJÀ deux journaux de décision — les portes (`decision_gate_crossings`, un audit) et la file d'intervention. Un troisième, attaché à une réunion, ferait un troisième endroit où chercher « qu'a-t-on décidé sur ce compte ». Une décision prise en réunion a déjà sa place : la porte qu'elle franchit, ou la tâche qu'elle crée. |
| §6.3 « champs en conflit (provenance) »         | `field_provenance` enregistre d'où vient une valeur, jamais qu'une AUTRE source en propose une différente. Compter ses lignes donnerait un nombre qui n'a rien à voir avec un conflit.                                                                                                                                                        |
| Le score de chance de closing (D10 du PDF 1)    | Cinquième refus de l'arbitrage n°4 : aucune probabilité. Ce qui est exposé est un score d'ENGAGEMENT, décomposé, `null` quand rien n'est lisible.                                                                                                                                                                                             |
| Le prévisionnel pondéré (D4)                    | Sixième refus. Multiplier un montant par une probabilité produit un chiffre qui n'existera jamais et sur lequel quelqu'un construira un budget.                                                                                                                                                                                               |
| Un dashboard Recruteur dédié (D64)              | Conforme au PDF : `/projects/needs` et `/consultants/pool` sont des écrans de TRAVAIL. Un dashboard de plus ajoute un endroit à consulter sans ajouter une décision.                                                                                                                                                                          |
| Un seuil d'activation du cockpit (D66)          | Chaque indicateur sait déjà dire `non_mesure` pour lui-même. Un seuil global masquerait un écran qui a de quoi être honnête ; ce qui manquait était une PHRASE, livrée au lot A.                                                                                                                                                              |
| Une source d'absences pour `rep_inactive` (D68) | Aucun SIRH n'est connecté et le produit n'a pas de notion d'absence. Le seuil de 14 jours compense déjà (« deux semaines pleines : en dessous, on alerterait sur des congés »). Inventer une saisie de congés dans un outil commercial serait un autre produit.                                                                               |
| Les 14 KPI non mesurables du §8                 | Chacun porte sa raison dans `manager-kpi.ts` : pas d'enquête de satisfaction, aucun lien entre une affectation et le besoin qui l'a produite, rien qui distingue un projet issu d'un appel d'offres, aucune notion d'incident de mission.                                                                                                     |
| L'historisation des KPI (défaut n°8)            | « Variation > 20 % » et « figer le mois » supposent un historique qu'aucune table ne porte. Le poser sans consommateur produirait la table vide que ce chantier passe son temps à corriger. Reporté, avec sa raison.                                                                                                                          |

---

## 6. Ce qui reste ouvert

- **L'historisation des indicateurs** (défaut n°8 · PIL-11 et PIL-12 du §13) :
  aucune table ne garde la valeur d'un KPI à une date. Sans elle, « variation
  > 20 % sur un indicateur épinglé » et « figer le mois » n'ont pas de base de
  > comparaison. À poser en même temps que son premier consommateur.
- **GA-07 reste à 233/233**, inchangé : `data-hygiene.service.ts` n'importe
  aucun service, et l'espace est résolu dans le CONTRÔLEUR — la sortie que la
  garde nomme elle-même.
- **Douze contraintes hors de portée de GA-12**, listées dans sa table avec la
  raison : leur énumération TypeScript est écrite EN LIGNE (union de littéraux
  ou `z.enum` imbriqué). Extraire le tableau suffit à les faire entrer sous la
  garde — c'est ce qui a été fait pour `INTERVENTION_SUBJECTS`.

---

## 7. Ce que la recette live a trouvé

Un seul défaut, et il est de la famille que ce chantier documente : **une requête
qui ne peut pas s'exécuter, avalée par son `catch`.**

« Missions actives sans date de fin » lisait `missions.end_date`. La colonne
s'appelle `ends_on`, et `end_date` n'apparaît dans **aucune migration** du dépôt.
La ligne affichait « non lu » — un état qui a l'air d'attendre une donnée, donc
que personne ne va vérifier. Une ligne cassée pour toujours, silencieuse.

Aucun test unitaire ne pouvait l'attraper : le dépôt mocke la base, donc une
requête invalide passe au vert. Deux corrections :

- la garde **`hygiene-columns.spec.ts`** compare les identifiants du SQL au texte
  des migrations — la seule source de vérité sur les colonnes qui existent. Elle
  a été vérifiée en la faisant TOMBER sur le nom fautif avant de le corriger ;
- l'échec d'une ligne passe de `logger.warn` à **`logger.error`** : une requête
  cassée n'est pas un état dégradé, c'est un bug, et seul un `error` atteint
  Sentry.

Le reste a été vérifié en cliquant : l'ordre du jour d'un rituel s'ouvre avec ses
chiffres réels, le dictionnaire déroule ses sept attributs, une ligne de qualité
ouvre bien `/accounts`, et le canal d'une mission — écrit depuis la fiche — fait
passer la ligne de « Canal non renseigné » à « Direct » sur l'écran de pilotage.
Toutes les entrées de navigation ont été balayées (règle ZÉRO régression) : rien
d'autre n'a bougé, et le seul 503 du réseau est celui du pipeline CRM, qui
n'a pas de CRM connecté et le DIT.
