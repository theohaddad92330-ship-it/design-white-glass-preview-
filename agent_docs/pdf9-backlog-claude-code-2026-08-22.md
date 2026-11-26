# PDF 9/9 — Backlog Claude Code, tickets et critères d'acceptation

Source : `agent_docs/sources/pdf9-backlog-claude-code-2026-08-22.pdf` (10 pages, ORION,
19/08/2026). Le dossier `sources/` est gitignoré — le PDF n'est pas committé.

**Dernier de la série.** Les huit chantiers précédents sont clos et en production
(`agent_docs/pdf1-…` à `pdf8-…`, plus `dette-pdf1-6-2026-08-21.md`).

---

## 0. Ce que ce document est, et ce qu'il n'est pas

Il l'écrit lui-même en première ligne : **« il ne crée aucune spécification nouvelle :
il ordonne, il chiffre les dépendances, il donne les prompts. »**

C'est donc le seul des neuf qui ne se traite pas en écrivant du code d'abord. Il se
traite en **répondant à une question** : les cinquante tickets qu’il consolide sont-ils faits,
et les 15 gardes qu'il exige existent-elles ?

⚠️ **Il décrit le dépôt d'AVANT les huit chantiers.** Son §5.1 propose un « Sprint 1 »
qui commence par `BEL-INT-601` « parce que les 3 pannes de la recette du 16/08 se
répètent tant que ce n'est pas fait » — or ce ticket a été livré le 21/08 (PDF 7). Son
§6.1 affirme que le copilote « expose 12 outils » : il en expose davantage depuis la
dette du 21/08. Chaque affirmation est donc à vérifier, comme les marqueurs
« Confirmé — repo » des huit précédents.

---

## 1. ⚠️ La collision de numérotation des gardes

**C'est le piège principal de ce document.** Le §11 numérote quinze gardes GA-01 à
GA-15. Le dépôt a déjà huit gardes numérotées GA-05 à GA-12 — **et elles ne désignent
pas la même chose**.

| Nº  | Ce que le PDF 9 appelle ainsi | Ce que le DÉPÔT appelle ainsi              |
| --- | ----------------------------- | ------------------------------------------ |
| 04  | champs protégés               | _(non attribué)_                           |
| 05  | guard par endpoint            | guard par endpoint — **coïncidence**       |
| 06  | isolation d'espace            | **champs protégés** (le GA-04 du PDF)      |
| 07  | indépendance des modules      | indépendance des modules — **coïncidence** |
| 08  | enums additifs                | enums additifs — **coïncidence**           |
| 09  | pas de `any`                  | pas de `any` — **coïncidence**             |
| 10  | provenance                    | **listes vides qualifiées**                |
| 11  | sommes (null ≠ 0)             | **contraintes CHECK additives**            |
| 12  | outcome (unknown ≠ done)      | **contraintes CHECK ⊇ énumérations TS**    |

Quatre numéros coïncident **par hasard**. Trois désignent autre chose, et l'un d'eux —
06 — est l'inverse exact de l'autre.

**Décision : on ne renomme rien.** Les numéros du dépôt vivent dans les commentaires de
garde, les messages de commit, les huit trackers et la mémoire ; les réécrire pour
aligner un vocabulaire ferait perdre la trace de ce qu'ils ont attrapé. Les gardes
manquantes prennent des numéros qui **continuent la série du dépôt** (GA-13 et
au-delà), jamais un numéro déjà employé par le PDF pour autre chose. La table
ci-dessus vit dans le tracker pour que personne ne s'y trompe.

C'est exactement l'arbitrage pris pour les portes G5-G8 du PDF 6 (décision D46).

---

## 2. L'inventaire — 184 points relevés

| §   | Ce que le document apporte                                                                               | Points  |
| --- | -------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Le mode d'emploi en 6 étapes                                                                             | 1-6     |
| 2   | Les 4 décisions bloquantes (D2, D3, D4, D13)                                                             | 7-10    |
| 3   | Le préambule : 12 invariants, 9 interdits, 7 règles de craft, le protocole en 7 étapes, 4 règles d'arrêt | 11-49   |
| 4   | Les 50 tickets consolidés (le corps du PDF en annonce 45)                                                | 50-94   |
| 5   | Le graphe de dépendances et les 4 sprints                                                                | 95-99   |
| 6   | Les 4 prompts d'epic (copilote, conformité, honnêteté, langage)                                          | 100-113 |
| 7   | Le gabarit de ticket, 18 champs                                                                          | 114     |
| 8   | Les 25 points de revue de PR                                                                             | 115-139 |
| 9   | Les 10 contrôles de recette de palier                                                                    | 140-149 |
| 10  | Le protocole de recette métier : 8 champs, 4 verdicts                                                    | 150-151 |
| 11  | Les 15 tests de garde                                                                                    | 152-166 |
| 12  | Les 3 scénarios qui tueraient le produit                                                                 | 167-169 |
| 13  | Les 13 points explicitement incertains                                                                   | 170-182 |
| 14  | La volumétrie de la série                                                                                | 183     |
| 15  | Le mot de la fin — trois choses qui comptent                                                             | 184     |

---

## 3. Les 4 décisions « bloquantes » ne bloquent rien

Le §2 affirme qu'« aucun agent ne code ces tickets avant décision ». Les quatre sont
**tranchées, et trois sur quatre livrées en production**.

| ID  | Question                            | Reco du PDF      | État réel                                                                                                                |
| --- | ----------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| D2  | Board Missions, 6 ou 12 colonnes    | 12 en projection | **Tranchée dans ce sens et livrée** — `mission-board.ts:6`, `CLAUDE.md:290`                                              |
| D3  | Cadence de relance                  | 3 touches en N2  | **Tranchée par le CODE** — `PLAYBOOK_MAX_PER_TARGET = 1` en N5, cadence par scénario relationnel en N2                   |
| D4  | Prévisionnel pondéré                | interdit         | **Refusé six fois**, la 6ᵉ le 22/08 (PDF 8)                                                                              |
| D13 | 11 statuts en base ou phase dérivée | phase dérivée    | ⚠️ **Tranchée à L'INVERSE, et livrée** — « un recruteur MET un besoin en veille, il ne le déduit pas » (`CLAUDE.md:271`) |

⚠️ **D13 est le seul vrai point de friction du document.** `BEL-CRM-106` demande une
`work_phase` dérivée ; le dépôt a mergé les onze états EN BASE le 19/08. Repartir sur
une phase dérivée reviendrait à défaire un chantier livré **et** à créer la seconde
vérité que D2 interdit par ailleurs. Le ticket est donc classé REFUS, pas ABSENT.

### La collision de numérotation des décisions

Le PDF 9 numérote D1→D42 : c'est **exactement l'union des numérotations propres des
huit PDF**, c'est-à-dire précisément ce que le dépôt a passé quatre chantiers à
dé-collisionner (PDF 5, 6, 7 et 8 ont chacun été renumérotés à l'entrée).

- **D1→D28** : aucune collision, les deux registres désignent la même chose.
- **D29, D30** : trous volontaires du dépôt. Les questions correspondantes y vivent
  sous **D35** et **D36**.
- **D31→D42** : **collision franche.** Le « D38 » du PDF 9 est le dashboard Recruteur ;
  le D38 du dépôt est la cadence de relance. Correspondances réelles : PDF 9 D31→D33 =
  dépôt D40-D42 · D34→D37 = dépôt D61, D59, D62, D63 · D38→D42 = dépôt D64→D68.
- **D43→D68** : 26 décisions du dépôt sans contrepartie dans sa liste.

Le registre du dépôt compte **66 décisions tranchées, zéro ouverte**. L'affirmation
« les 38 autres sont tranchables au fil du PDF » est fausse dans les deux sens : elles
ne sont pas tranchables, elles sont tranchées, et pour l'essentiel livrées.

---

## 4. Ce que le croisement a trouvé

Le PDF 9 ne demande rien de neuf. C'est en vérifiant ses cinquante tickets ligne à ligne que
**onze défauts** sont sortis — aucun n'était demandé par le document.

| #   | Défaut                                                                                                                  | Preuve                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | **Un SECOND moteur de classement de personnes tourne en production, sans journal ni bandeau** — sur un sujet réglementé | `consultants.controller.ts:402` → `ConsultantMatchPanel.tsx:31`               |
| 2   | **`GET /delivery/missions` sert la marge à tout l'espace**, sans `finance:read`, et le copilote la relaie               | `delivery.controller.ts:105`, `delivery.service.ts:329`, `chat_tools.py:1383` |
| 3   | **5 des 7 écritures CRM déclarées ne franchissent jamais la porte gouvernée**                                           | `OUTBOUND_WRITE_KINDS` vs `crm.service.ts:508`, `:528`                        |
| 4   | **Le rollback d'import 24 h est du code mort** — la garde du scénario n°3 du §12                                        | `import.service.ts:267` et `:301`, zéro appelant, aucune route                |
| 5   | **La navigation cache le Pilotage à `sales_ops`** — le correctif du 22/08 s'est arrêté au serveur                       | `SectionTabs.tsx:28`, `CustomerNavbarBody.tsx:28`                             |
| 6   | **GA-05 compte par FICHIER, pas par route** : une seule annotation suffit à déclarer 7 routes couvertes                 | `endpoint-guards.spec.ts:108`, 159 routes nues dans 34 contrôleurs            |
| 7   | **Aucune garde d'isolation d'espace** — le seul trou total du §11, et c'est un sujet de sécurité                        | recherche à vide                                                              |
| 8   | **`gate_decision` est le seul `ACTIVITY_KIND` sans libellé**, FR et EN — clé brute sur la timeline                      | `activity.ts` vs `locales/{fr,en}/activities.json`                            |
| 9   | **Le journal des portes de décision n'a aucun chemin de LECTURE** — pas de contrôleur, `forSubject` sans appelant       | `decision-gates/` sans `*.controller.ts`                                      |
| 10  | **`apps/ia` écrit dans `accounts`** — l'interdit n°4 du §3, sur une table dont NestJS est propriétaire                  | `apps/ia/app/routers/scorer.py:73`                                            |
| 11  | **Le bandeau de transparence AI Act n'est que sur un écran de classement sur trois**                                    | `MatchDrawer.tsx:83` seul ; ni `InverseMatchPanel`, ni `ConsultantMatchPanel` |

Les n°1, 2, 3 et 4 se ressemblent, et c'est ce qui les rend intéressants : **un chemin
conforme a été livré à côté d'un chemin ancien qu'on a laissé vivre.** Le dépôt a une
garde pour « du code qui écrit sans appelant » ; il n'en avait aucune pour « un
appelant qui continue d'emprunter l'ancien chemin ».

### Une treizième famille : livré côté API, appelé par personne

Le dernier croisement en a sorti six de plus, tous du même moule — un endpoint testé,
documenté, sans aucun appelant web :

| Endpoint / capacité                         | Conséquence à l'écran                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `POST /delivery/timesheets/:id/reminder`    | on ne peut relancer aucun relevé depuis l'écran CRA                                                                            |
| `PATCH /delivery/finance/margin-threshold`  | le seuil d'alerte de marge ne se règle nulle part                                                                              |
| `GET /delivery/finance/missions/:id/scores` | les deux scores de mission n'ont aucun écran                                                                                   |
| `notification_preferences.proactivity_cap`  | le curseur 1-5 promis par D40 n'existe pas                                                                                     |
| `actionLabelKey` / `sendsImmediately`       | l'annonce « ceci part vraiment » n'atteint aucun écran                                                                         |
| `MissionBoardPage.tsx:225`                  | ⚠️ **les capacités sont codées en dur VIDES** : toute action du panneau de déplacement reste grisée, connecteur branché ou non |

Le dépôt garde déjà le sens web → API (`web-api-route-parity.spec.ts` : un appel SPA vers
une route inexistante). **Le sens inverse n'a aucune garde.**

---

## 5. Les décisions de Louis (22/08/2026)

⚠️ **Renumérotation.** Le PDF 9 réutilise D1→D42, c'est-à-dire l'union des numérotations
propres des huit PDF — exactement ce que le dépôt a dé-collisionné quatre fois. Les
décisions de ce chantier prennent **D69 → D72**.

| ID  | Question                        | Décision                                                                                                                                                                                                       |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —   | Portée du chantier              | **Les 12 défauts, et pour chacun la garde qui empêche la récidive.** Le dépôt sait détecter « du code qui écrit sans appelant » ; il ne sait pas détecter « un appelant qui emprunte encore l'ancien chemin ». |
| D69 | Le second moteur de matching    | **Rediriger le Vivier vers le moteur conforme, retirer l'ancien.** Un seul moteur de classement de personnes — la règle « jamais un second moteur d'envoi », appliquée à un sujet réglementé.                  |
| D70 | Le rollback d'import            | **L'exposer**, dans sa fenêtre de 24 h, avec l'exclusion des objets touchés à la main. On ne détruit pas le travail de quelqu'un pour réparer le sien.                                                         |
| D71 | Les trois artefacts du document | **Des skills committés** (`.claude/skills/`), aux côtés de `pdf-chantier`. Versionnés et relus comme du code, plutôt qu'un texte qu'on recopie et qui dérive.                                                  |
| D72 | La numérotation des gardes      | **On ne renomme rien.** Table de correspondance dans ce tracker ; les gardes neuves continuent la série du dépôt à partir de GA-13.                                                                            |

Deux décisions tranchées sans question, parce qu'aucune réponse alternative ne tenait :

- **L'invariant 6 est cassé et se répare dans un seul sens.** `action-router.service.ts:177`
  transforme TOUTE exception — timeout compris — en `failed`, alors que le contrat déclare
  `unknown` juste pour ce cas (`action-router.ts:214` : « we do NOT know whether the
  remote… »). Déclarer échoué un envoi peut-être parti est l'autre moitié du scénario n°1 :
  quelqu'un rejoue, et le client reçoit deux fois.
- **BEL-CRM-106 est un REFUS, pas un manque.** Il redemande une `work_phase` dérivée là où
  D13 a mergé les onze états en base. Le livrer déferait un chantier et créerait la seconde
  vérité que D2 interdit.

---

## 6. Ce qui est parti (PR #1020)

Branche `feat/pdf9-backlog-audit`. Cinq suites vertes : API 5 668 · web 2 742 ·
contrats 1 558 · IA 4 170 · MCP 21.

| Défaut | État | Ce qui a été fait                                                                                          |
| ------ | ---- | ---------------------------------------------------------------------------------------------------------- |
| 2      | ✅   | `canReadFinance` OBLIGATOIRE sur la liste des missions — le compilateur a fait remonter les cinq appelants |
| 3      | ✅   | `createTask` et `logMeeting` franchissent la porte ; garde sur les natures déclarées sans producteur       |
| 4      | ✅   | Le rollback d'import a sa route, son bouton et sa garde (D70)                                              |
| 5      | ✅   | La nav garde sur `team:manage` ; garde contre tout rôle littéral                                           |
| 6      | ✅   | GA-05 gagne un cliquet PAR ROUTE, gelé à 377                                                               |
| 8      | ✅   | `gate_decision` a son libellé ; `ACTIVITY_KINDS` entre dans la garde i18n                                  |
| 9      | ✅   | Le journal des portes a un contrôleur et un récapitulatif des MANQUES                                      |
| 10     | ✅   | L'IA ne persiste plus `accounts.priority_score` ; garde côté Python                                        |
| 11     | ✅   | Le bandeau AI Act sur les trois écrans qui classent ; garde sur le montage JSX                             |
| 12     | ✅   | Un timeout redevient `unknown` — l'invariant n°6 était inatteignable                                       |
| 1      | ⚠️   | **Partiel** — voir ci-dessous                                                                              |
| 7      | ❌   | Reporté — voir §8                                                                                          |

### ⚠️ Le défaut n°1 : un écart assumé par rapport à D69

Tu as tranché « rediriger le Vivier vers le moteur conforme, retirer l'ancien ».
**Le retrait s'est révélé impossible sans perte**, et je ne l'ai donc pas fait.

Trois fonctions livrées n'ont `ConsultantMatchPanel` pour **seul appelant** : la
réécriture de CV selon la mission, le REX de push (annexe p22) et le
positionnement depuis le classement. Les retirer remplacerait un défaut de
conformité par une perte de capacité.

Journaliser l'ancien moteur n'est pas possible non plus : `match_runs` exige
critères, poids et axes — l'ancien moteur n'a ni axes ni poids, et les inventer
serait précisément ce que le journal existe pour empêcher.

**Ce qui est livré ferme le risque le plus direct** : les trois écrans portent le
bandeau, et une garde refuse qu'un écran de classement s'en passe. Ce qui reste
est le PORTAGE du panneau vers le moteur à 12 axes — un chantier d'écran, pas un
lot d'audit. Le préambule du PDF 9 donne lui-même la règle qui a tranché :
« Tu dois modifier une brique livrée → tu l'ÉTENDS, jamais tu ne la remplaces. »

---

## 7. Les trois artefacts, devenus des skills (D71)

| Artefact                            | Où                                                 |
| ----------------------------------- | -------------------------------------------------- |
| Le prompt de revue de PR, 25 points | `.claude/skills/revue-pr/`                         |
| Le protocole de recette de palier   | `.claude/skills/recette-palier/`                   |
| Les 12 invariants et 9 interdits    | `.claude/skills/revue-pr/references/invariants.md` |

Versionnés et relus comme du code, au lieu d'un texte qu'on recopie et qui
dérive. Ils rejoignent `pdf-chantier`, seul contenu de `.claude/` que le dépôt
committe.

---

## 8. Ce qui reste ouvert

- **La garde d'isolation d'espace** (§11 n°6) — le seul trou TOTAL du document,
  et c'est un sujet de sécurité. Rien ne balaie les requêtes à la recherche d'un
  `workspace_id` manquant ; il n'existe que des vérifications ponctuelles. La
  poser suppose de distinguer les requêtes légitimement non scopées (admin
  interne, API publique, tables globales) des autres — un balayage de 98
  contrôleurs, à faire avec son propre cliquet.
- **Le portage du panneau Vivier** vers le moteur à 12 axes (défaut n°1).
- **Trois natures d'écriture CRM sans producteur** (`create_company`,
  `create_list`, `enroll_sequence`), gelées dans une liste qui ne peut que
  rétrécir.
- **Les gardes « sommes » et « fonctions pures »** (§11 n°11 et 15) : deux
  conventions largement tenues et jamais balayées. Exactement la situation de
  `any` avant que GA-09 n'existe.

---

## 9. Ce qu'on ne promet pas

| Demande du PDF 9                              | Raison                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BEL-CRM-106** — phase de travail dérivée    | **REFUS.** D13 a tranché l'inverse et c'est livré : les onze états sont EN BASE, « un recruteur MET un besoin en veille, il ne le déduit pas ». Le livrer déferait un chantier mergé et créerait la seconde vérité que D2 interdit.                                                      |
| Les 50 outils copilote sous leurs noms exacts | Le dépôt en a 26, dont beaucoup sont les mêmes capacités sous d'autres noms. Renommer un outil invalide le préfixe d'outils mis en cache et casse le catalogue de commandes, pour un gain nul. Les FAMILLES manquantes (Projet, Talent détaillé, Matching structuré) restent au backlog. |
| `get_thread`                                  | Refus permanent reconduit : le corps des messages ne sort pas de la messagerie.                                                                                                                                                                                                          |
| La renumérotation des gardes GA-01→GA-15      | On ne renomme pas (D72). Les numéros du dépôt vivent dans huit trackers, les commentaires de garde et les messages de commit ; les réécrire ferait perdre la trace de ce qu'ils ont attrapé. Table de correspondance au §1.                                                              |
| Les 12 natures d'intervention (BEL-MGR-701)   | Le dépôt en a six, chacune adossée à un signal réel. Les six autres attendent une donnée que le produit ne collecte pas — même règle que le catalogue de routines.                                                                                                                       |
| Les rituels ANIMÉS (BEL-MGR-703)              | Refus reconduit du PDF 8 : ni séance, ni chronomètre, ni compte rendu. Le dépôt a déjà deux journaux de décision ; un troisième ferait un troisième endroit où chercher.                                                                                                                 |

---

## 10. Ce que la recette live a vérifié

Déployé sur `1e1a768d`, vérifié dans Chrome.

- **L'annulation d'import fonctionne de bout en bout.** Le bouton n'apparaît que
  sur les imports en état `applied` — pas sur les simulations ni les brouillons.
  Testé sur un import à 0 créé / 0 mis à jour : le rapport a répondu « 0 objet(s)
  remis dans leur état d'avant · 0 archivé(s) · 0 laissé(s) parce que quelqu'un y
  a touché depuis », et la ligne est passée à « annulé ».
- **Le bandeau AI Act est visible sur le Vivier** : « Ce classement est produit
  par un système d'IA. Il propose, tu décides. Chaque score est détaillé par axe,
  et chaque profil écarté a un motif. »
- **L'écran Missions n'a pas bougé** malgré le changement de signature de
  `DeliveryService.list`.
- **Le cockpit Équipe fonctionne** malgré le passage à `team:manage`.
- Toutes les entrées de navigation balayées (règle ZÉRO régression) : aucune
  erreur console, et le seul 503 du réseau reste celui du pipeline CRM — qui n'a
  pas de CRM connecté et le DIT.

**Aucun défaut trouvé en recette.** C'est la première fois sur les neuf chantiers.

---

## 11. Les cinquante tickets, statués un par un (25/08/2026)

Ce tableau manquait. Le tracker du 22/08 annonçait « 45 tickets » — le PDF en
porte **cinquante identifiants distincts**, et quarante-six n'avaient aucune
ligne où poser un verdict. Recompté et statué en croisant l'archive `01` de
l'itération 3.

Chaque statut porte un `fichier:ligne`. `PARTIEL` veut dire qu'un morceau existe
et qu'un morceau nommé manque — jamais « presque fait ».

| Ticket   | Statut  | Preuve                                                                                                                | Ce qui manque                                                                                                                                                    |
| -------- | ------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ARCH-001 | LIVRÉ   | `packages/contracts/src/schemas/workspace.ts:120` → `apps/api/src/modules/workspace/workspace-permission.guard.ts:20` | — (9 rôles livrés pour 8 demandés)                                                                                                                               |
| ARCH-002 | LIVRÉ   | `packages/contracts/src/schemas/route-access.ts:94` → `apps/web/src/features/outreach/view/SequencesPage.tsx:22`      | —                                                                                                                                                                |
| ARCH-003 | PARTIEL | `packages/contracts/src/schemas/flow-registry.ts:85`                                                                  | Les neuf flux sont déclarés ; aucun consommateur hors son propre test                                                                                            |
| ARCH-004 | LIVRÉ   | `apps/api/src/modules/delivery/invoice-readiness.service.ts:119`                                                      | `proofStrength`/`isProofUsable` n'ont que des tests                                                                                                              |
| ARCH-005 | LIVRÉ   | `packages/contracts/src/schemas/decision-gate.ts:27` → `apps/api/src/modules/projects/projects.controller.ts:103`     | Lecture par API ; aucun écran web                                                                                                                                |
| CRM-101  | LIVRÉ   | `apps/web/src/routes/projects/needs.tsx:28`                                                                           | —                                                                                                                                                                |
| CRM-102  | LIVRÉ   | `packages/contracts/src/schemas/priority-gate.ts:35`                                                                  | —                                                                                                                                                                |
| CRM-103  | LIVRÉ   | `packages/contracts/src/schemas/outreach-sequence.ts:42`                                                              | — (dix statuts pour huit demandés)                                                                                                                               |
| CRM-104  | LIVRÉ   | `apps/web/src/features/accounts/…/AccountDetailTabContent.tsx:113`                                                    | —                                                                                                                                                                |
| CRM-105  | LIVRÉ   | `apps/web/src/routes/settings/catalogues.tsx:3`                                                                       | —                                                                                                                                                                |
| CRM-106  | REFUSÉ  | §9 de ce tracker                                                                                                      | D13 tranche l'inverse : onze états EN BASE                                                                                                                       |
| ATS-201  | LIVRÉ   | `apps/web/src/features/consultants/view/parse/CvReviewPanel.tsx:27`                                                   | —                                                                                                                                                                |
| ATS-202  | LIVRÉ   | `apps/web/src/features/consultants/view/studio/CvStudioPanel.tsx:22`                                                  | —                                                                                                                                                                |
| ATS-203  | LIVRÉ   | `apps/web/src/features/consultants/view/TalentAvailabilityBadge.tsx:29`                                               | —                                                                                                                                                                |
| ATS-204  | LIVRÉ   | `apps/web/src/features/catalogues/view/SkillAliasQueue.tsx:31`                                                        | —                                                                                                                                                                |
| ATS-205  | LIVRÉ   | `apps/api/src/modules/consultants/matching/matching.service.ts:461`                                                   | —                                                                                                                                                                |
| MTC-301  | LIVRÉ   | `apps/api/src/modules/consultants/matching/axes.ts:605`                                                               | —                                                                                                                                                                |
| MTC-302  | LIVRÉ   | `apps/web/src/features/matching/view/MatchDrawer.tsx:53`                                                              | —                                                                                                                                                                |
| MTC-303  | LIVRÉ   | `apps/web/src/features/matching/view/MatchDrawer.tsx:286`                                                             | —                                                                                                                                                                |
| MTC-304  | LIVRÉ   | `apps/web/src/features/matching/view/InverseMatchPanel.tsx:49`                                                        | —                                                                                                                                                                |
| MTC-305  | PARTIEL | `apps/api/src/modules/consultants/matching/calibration.ts:51`                                                         | `GET /matching/calibration` n'a aucun appelant web                                                                                                               |
| MIS-401  | LIVRÉ   | `apps/web/src/features/missions/view/MissionBoardPage.tsx:220`                                                        | Capacités du panneau d'effet codées en dur vides                                                                                                                 |
| MIS-405  | PARTIEL | `apps/web/src/features/missions/api.ts:237`                                                                           | Aucun composant n'affiche les deux scores de mission                                                                                                             |
| FIN-402  | PARTIEL | `apps/web/src/features/missions/view/TimesheetsPage.tsx:216`                                                          | `POST /timesheets/:id/reminder` sans appelant web                                                                                                                |
| FIN-403  | LIVRÉ   | `apps/web/src/features/missions/view/InvoiceReadinessPanel.tsx:284`                                                   | —                                                                                                                                                                |
| FIN-404  | PARTIEL | `apps/api/src/modules/delivery/finance.controller.ts:97`                                                              | `PATCH margin-threshold` sans appelant                                                                                                                           |
| FIN-406  | LIVRÉ   | `apps/web/src/features/pilotage/view/FinancePanel.tsx:82`                                                             | —                                                                                                                                                                |
| AUT-501  | PARTIEL | `apps/api/src/modules/action-os/workflow-catalog.ts:291`                                                              | Définitions en dur ; `workflow_definitions` et `canRun` inexistants (choix assumé : une définition éditable sans revue serait un chemin d'écriture non gouverné) |
| AUT-502  | LIVRÉ   | `apps/api/src/modules/chains/chains.service.ts:165`                                                                   | —                                                                                                                                                                |
| AUT-503  | LIVRÉ   | `apps/api/src/modules/notifications/notifications.service.ts:217`                                                     | Le curseur utilisateur 1-5 n'a pas d'écran                                                                                                                       |
| AUT-504  | PARTIEL | `packages/contracts/src/schemas/reminder-channel.ts:117`                                                              | `actionLabelKey`/`sendsImmediately` n'atteignent aucun écran                                                                                                     |
| AUT-505  | LIVRÉ   | `packages/contracts/src/schemas/command-library.ts:97`                                                                | —                                                                                                                                                                |
| INT-601  | LIVRÉ   | `apps/web/src/routes/integrations/index.tsx:29`                                                                       | —                                                                                                                                                                |
| INT-602  | LIVRÉ   | `apps/web/src/features/import/view/ImportWizard.tsx:12`                                                               | —                                                                                                                                                                |
| INT-603  | LIVRÉ   | `apps/api/src/modules/crm/outbound-write.service.ts:80`                                                               | Trois natures d'écriture restent sans producteur (gelées par `outbound-kinds-wired.spec.ts`)                                                                     |
| INT-604  | LIVRÉ   | `apps/api/src/common/util/personal-connection.ts:41`                                                                  | —                                                                                                                                                                |
| INT-605  | LIVRÉ   | `apps/api/src/modules/routines/routine-catalog.ts:1125`                                                               | —                                                                                                                                                                |
| MGR-701  | REFUSÉ  | §9 de ce tracker                                                                                                      | Six natures adossées à un signal réel ; les six autres manquent de donnée                                                                                        |
| MGR-702  | LIVRÉ   | `packages/contracts/src/schemas/manager-kpi.ts:931`                                                                   | — (60 entrées, dont **8** non mesurables — le tracker du PDF 8 en annonçait 14)                                                                                  |
| MGR-703  | REFUSÉ  | §9 de ce tracker                                                                                                      | Ni séance, ni chronomètre, ni compte rendu                                                                                                                       |
| MGR-704  | LIVRÉ   | `apps/web/src/features/pilotage/view/FinancePanel.tsx:164`                                                            | —                                                                                                                                                                |
| MGR-705  | LIVRÉ   | `apps/web/src/features/pilotage/view/FinancePanel.tsx:82`                                                             | —                                                                                                                                                                |
| MGR-706  | LIVRÉ   | `apps/web/src/features/pilotage/view/DataHygienePanel.tsx:53`                                                         | —                                                                                                                                                                |
| COP-801  | PARTIEL | `apps/ia/app/services/chat_tools.py:543`                                                                              | Un outil sur six ; aucun outil Projet                                                                                                                            |
| COP-802  | PARTIEL | `apps/ia/app/services/chat_tools.py:435`                                                                              | Deux sur six                                                                                                                                                     |
| COP-803  | PARTIEL | `apps/ia/app/services/chat_tools.py:561`                                                                              | Un sur cinq ; rien sur le positionnement                                                                                                                         |
| COP-804  | PARTIEL | `apps/ia/app/services/chat_tools.py:458`                                                                              | Quatre sur six                                                                                                                                                   |
| COP-805  | LIVRÉ   | `apps/ia/app/services/chat_tools.py:108`                                                                              | Aucun outil ne touche les séquences (D44 : le copilote ne programme pas d'envois)                                                                                |
| COP-806  | PARTIEL | `apps/ia/app/services/chat_tools.py:512`                                                                              | Un sur quatre en capitalisation                                                                                                                                  |
| COP-807  | LIVRÉ   | `apps/ia/app/services/chat_tools.py:762`                                                                              | —                                                                                                                                                                |

**Compte : 35 LIVRÉ · 12 PARTIEL · 3 REFUSÉ.** Aucun `ABSENT`, aucun `NON PROUVÉ`.

Les douze `PARTIEL` se rangent en trois familles, et c'est ce que le tableau
apprend :

1. **Six manques d'outil copilote** (COP-801 à 806) — le catalogue en compte 31,
   il en faudrait une dizaine de plus pour couvrir les six familles du §8. La
   couverture des vingt requêtes prioritaires est mesurée à part et gardée :
   `apps/ia/tests/test_priority_queries_coverage.py`, seize sur vingt.
2. **Quatre routes sans appelant web** (MTC-305, FIN-402, FIN-404, MIS-405) —
   la famille « livré, testé, que rien n'appelle » que ce dépôt paie depuis neuf
   chantiers. Elles sont inscrites ici plutôt que corrigées à la volée : chacune
   demande un écran, pas un branchement.
3. **Deux registres déclaratifs sans consommateur** (ARCH-003, AUT-504) — pour
   `flow-registry` c'est le dessein (il DÉCRIT sans exécuter) ; pour
   `reminder-channel` c'en est un défaut, `sendsImmediately` étant la garantie
   centrale du §5.2 du PDF 6.
