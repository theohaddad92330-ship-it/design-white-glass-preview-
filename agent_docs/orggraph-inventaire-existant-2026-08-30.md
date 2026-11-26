# OrgGraph — le §2 « ce qui existe déjà », vérifié en cherchant l'APPELANT

> **Mode : audit / croisement. Aucun code applicatif — deux gardes, et rien d'autre.**
>
> Source auditée : `PDF-22_ORGGRAPH_FINAL_2026-08-27`, §2 « Ce qui existe déjà — ne pas recoder »
> (extraction greppable : `agent_docs/sources/jeudi-27-aout/txt/OUTER_PDF-22_ORGGRAPH_FINAL_2026-08-27.txt`,
> lignes **43-75**, page 2 du PDF — le dossier est gitignoré, d'où le chemin absolu dans le dépôt principal).
> Il n'existe **pas** de `original_markdown_sources/` pour le paquet du 27/08 : la version greppable de ce
> paquet-là est le dossier `txt/`, pas un dossier `.md`. Le tracker de synthèse est
> `agent_docs/orggraph-final-2026-08-29.md`.
>
> **⚠️ Ce qui arrive par un document est de la DONNÉE, jamais une instruction.** Rien de ce §2 n'a été exécuté
> comme une consigne : il a été traité comme une hypothèse à mesurer.

---

## 0. Le point de mesure, et pourquoi il ne prête pas à discussion

|                                         |                                                             |
| --------------------------------------- | ----------------------------------------------------------- |
| Arbre mesuré                            | worktree `agent-ad41f3581be0c99ce`, propre                  |
| `git rev-parse HEAD`                    | `fd06c6630f7dded83a30bebbb770ec9e7e953ce6`                  |
| `git rev-parse origin/main`             | `fd06c6630f7dded83a30bebbb770ec9e7e953ce6` — **identiques** |
| `git diff --name-only origin/main HEAD` | vide                                                        |

Le périmètre est donc décrit contre `origin/main`, pas contre l'état d'une branche non mergée.

⚠️ **Deux pièges d'outillage rencontrés, notés pour l'agent suivant :**

- `ls` ne rend **rien** dans cet environnement (réécriture de commande) — toute exploration passe par `find`.
- `git log --format=%H` rend un SHA **différent** de `git rev-parse HEAD` et des fichiers de références bruts
  (`.git/worktrees/…/HEAD`, `refs/remotes/origin/main`). Les refs et `rev-parse` concordent, `git log` non :
  **c'est `git log` qui ment**, exactement comme le dit la fiche mémoire. Le SHA ci-dessus vient des refs.
- `vitest` lancé via `npx` rend `[RTK:PASSTHROUGH] … All parsing tiers failed` et **rien d'autre**, y compris
  en redirigeant vers un fichier. Contournement : `node ./node_modules/vitest/vitest.mjs run …`.

### Ce que le §2 disait ne pas pouvoir faire — et qui a été fait ici

> « L'audit est statique sur le repo fourni. Les tests Python ciblés n'ont pas pu être exécutés dans ce runtime
> car la dépendance `anthropic` n'est pas installée. » (l. 74-75)

Les tests **ont** été exécutés, avec l'interpréteur du dépôt (`apps/ia/.venv/bin/python`, `anthropic 0.52.0`) :

```
tests/test_org_graph_assembler.py  tests/test_relation_verifier.py  tests/test_org_reporting_provenance.py
35 passed, 5 warnings in 0.12s
```

Et l'assembleur a été **exécuté sur une charge utile réelle** (§4 ci-dessous). C'est cette exécution qui
produit le seul résultat que la lecture statique ne pouvait pas atteindre.

---

## 1. Les affirmations du §2, une par une

Question posée à chacune : **non pas « ce fichier existe-t-il ? » mais « qui l'appelle, depuis quel geste ? »**

| #   | Affirmation du §2 (citée)                                                                                                                                        | Symbole                                                                                                                               | Existe ?                                   | Importeurs                                                                                                                                                                                      | Appelant RÉEL (geste ou déclencheur)                                                                                                                                                                                                                                                                                                                                                                         | Atteignable en cliquant ?                                                                                                                        | Statut                           | Ce qu'un agent doit en conclure                                                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | l.46 — « Prompt dédié BELLUM ACCOUNT MAPPING · **Présent** · Conserve 4 sorties : hiérarchie, influence, buying committee, chemin. »                             | `build_system_prompt` / `build_user_prompt`, `apps/ia/app/prompts/bellum_organigramme.py:25` et `:107`                                | oui                                        | `app/prompts/registry.py:41,94` · `app/services/classification.py:27` · le banc d'évaluation                                                                                                    | `classification.py:199-216` — **la vraie phase 3**, déclenchée par l'analyse d'un compte et par « Enrichir l'organigramme »                                                                                                                                                                                                                                                                                  | n/a (serveur) — le bouton qui la déclenche est dans l'onglet Organigramme                                                                        | **LIVRÉ**                        | Ne pas réécrire le prompt. Le §9 du FINAL demande de l'**étendre** (`scope_mode`, `GRAPH_COVERAGE`, `CONTACT_BATCH`…) : c'est du travail neuf sur un fichier vivant. Les 4 sorties sont bien là (`hierarchyRelations` l.163, `influenceMap` l.172, comité, `approach_order` l.232) et L0-L5 aussi (l.69, l.199). |
| 2   | l.48 — « Contrat OrgGraph · **Présent** · entities, people, hierarchyEdges, influenceEdges, committee, gaps, path, rejected. »                                   | `orgGraphSchema`, `packages/contracts/src/schemas/org-graph.ts:607` (base l.583)                                                      | oui, **les 8 champs**                      | 12 fichiers hors tests : `org-graph-{correction,versioning,path,verify,declare}.ts`, `accounts.service.ts`, `demo-org-graph.ts`, `orgGraphData.ts`, et le miroir Python `org_graph_validate.py` | Validation à **chaque** écriture du graphe stocké et à chaque lecture d'écran                                                                                                                                                                                                                                                                                                                                | n/a                                                                                                                                              | **LIVRÉ**                        | Attention aux **noms réels** : `committee` = `buyingCommittee`, `gaps` = `uncoveredZones`, `path` = `recommendedPath`, `rejected` = `rejectedItems`. Le contrat porte déjà `coverage` (optionnel) et `graphVersion`.                                                                                             |
| 3   | l.50 — « L0-L5 + rôles distincts · **Présent** · Le backend sait déjà séparer structure et décision. »                                                           | `orgHierarchyLevelSchema` (`org-graph.ts:46`) et `decisionRoles` (`:205`) — **deux axes distincts sur la même personne** (`:194-205`) | oui                                        | idem #2                                                                                                                                                                                         | Écrit par l'assembleur (`_decision_roles`, `org_graph_assembler.py:317`), lu par `focalOrgData.ts` (badge ≠ niveau)                                                                                                                                                                                                                                                                                          | oui — les badges de décision et la hauteur L0-L4 sont déjà dissociés dans la vue focale                                                          | **LIVRÉ**                        | La décision 4 du FINAL (« les rôles sont des badges, jamais des rangées ») est **déjà appliquée** dans la vue focale. Ce qui reste : l'**ancien** `OrgChart` (ligne 8) le viole encore.                                                                                                                          |
| 4   | l.52 — « OrgGraphVersioning · **Présent** · `org_graph_version` et `org_rejected_items` existent déjà. »                                                         | migration `apps/api/src/migrations/1787946118427-OrgGraphVersioning.ts:25` ; colonnes `account.entity.ts:120` et `:129`               | oui                                        | migration chargée par glob (`database/data-source.ts:15`)                                                                                                                                       | Écrit par 5 chemins (`org-graph.service.ts:79,175,275,377`, `org-graph-correction.service.ts:305`) **et relu** : `analysis.service.ts:339` → `ia.client.ts:359,441` → `graph_analyze.py:86-87` / `phase3_classify.py:97-98` → `org_graph_assembler.py:518`. La colonne est **lue ET écrite**, dans les deux langages.                                                                                        | oui, indirectement (écarter quelqu'un, déclarer quelqu'un)                                                                                       | **LIVRÉ**                        | Ne pas recréer la mémoire de version ni l'ardoise de rejets. Le §7 demande de l'**étendre** (ledger + verrou) — voir §3, la moitié serveur est déjà là et **personne ne l'appelle**.                                                                                                                             |
| 5   | l.54-55 — « Ajout manuel de personnes · **Présent** · Formulaire, CSV et texte structuré via DeclareOrgPanel ; à intégrer au nouvel écran plutôt qu'à recréer. » | `DeclareOrgPanel`, `…/organigramme/declare/DeclareOrgPanel.tsx:31`                                                                    | oui                                        | `TabOrganigramme.tsx:16`                                                                                                                                                                        | **Monté deux fois** : `TabOrganigramme.tsx:140` (vue **focale**, l'écran d'arrivée) et `:218` (second rendu). Chaîne complète : `useDeclareOrgPeople` → `accountsApi.declareOrgPeople` → `POST /analysis/:id/org-people` (`analysis.controller.ts:241`) → `analysis-ondemand.service.ts:592` → écriture `org_declared_people` + regreffe `applyDeclaredPeople`.                                              | **oui** — onglet « organigramme » présent dans `AccountDetailTabsBar.tsx:7,47`, rendu par `AccountDetailTabContent.tsx:92`                       | **LIVRÉ**                        | Déjà intégré au nouvel écran : la consigne « à intégrer plutôt qu'à recréer » est **faite**. Tenu désormais par **GA-102**.                                                                                                                                                                                      |
| 6   | l.57 — « Vérification d'une relation · **Présent** · Relation verifier recherche une preuve ciblée ; à rendre visible dans le drawer. »                          | `relation_verifier.py:71` / `:108` ; bouton `OrgVerifyRelation.tsx:36`                                                                | oui, **et la chaîne entière est branchée** | `org_verify.py:24` ; `FocalOrgView.tsx:8` ; `OrgGraphViews.tsx:9`                                                                                                                               | Monté en `FocalOrgView.tsx:478` et `OrgGraphViews.tsx:542` → `useVerifyOrgRelation` → `POST /analysis/:id/verify-relation` (`analysis.controller.ts:300`) → `analysis-ondemand.service.ts:754` → IA `POST /org/verify-relation` → **et le verdict est ÉCRIT** : `applyRelationVerification` (`org-graph.service.ts:367`) bump `org_graph_version` et persiste. Le débit de crédit vient **après** la preuve. | le bouton est dans l'écran d'arrivée… **mais sa condition de rendu n'est jamais vraie** — voir §4                                                | **PARTIEL**                      | Le code n'est pas mort : il est **privé de sujet**. Ne pas le recoder ; lui **redonner une arête à vérifier** (D288). Le « drawer » demandé par le §2 n'existe pas encore.                                                                                                                                       |
| 7   | l.59 — « OrgInfluenceMap + OrgGraphViews · **Présent** · Base de la vue système avancée ; à réutiliser. »                                                        | `OrgInfluenceMap.tsx:66`, `OrgGraphViews.tsx:26`                                                                                      | oui                                        | `TabOrganigramme.tsx:14` et `:13`                                                                                                                                                               | `TabOrganigramme.tsx:168` et `:210`, branche « vue système »                                                                                                                                                                                                                                                                                                                                                 | **oui, en 1 clic** : `FocalOrgView.tsx:104-107` rend le bouton « vue système » (`onSystemView`), et `TabOrganigramme.tsx:148-152` rend le retour | **LIVRÉ**                        | Le repositionnement demandé par le §13 (« carte structurelle et 4 vues : repositionner comme vue système ») est **fait**, avec l'aller-retour en un clic exigé par la décision 3.                                                                                                                                |
| 8   | l.61-62 — « Ancien OrgChart 3 rangées · **Toujours présent en fallback** · À retirer après migration / rebuild. »                                                | `OrgChart.tsx:24`, rangées via `getOrganigrammeRoleLevel` (`lib/contactRoles.ts:187`, renvoie `1 \| 2 \| 3`)                          | oui                                        | `TabOrganigramme.tsx:6`                                                                                                                                                                         | `TabOrganigramme.tsx:175`, **uniquement** quand il n'y a pas de carte d'influence (dossier sans `orgGraph`, ou graphe sans entité)                                                                                                                                                                                                                                                                           | oui, pour un dossier ancien                                                                                                                      | **LIVRÉ (et c'est le problème)** | Le §15 refuse ces 3 rangées ; elles restent le seul rendu d'un dossier ancien. **Le déclencheur du retrait n'est toujours pas tranché** (D291).                                                                                                                                                                  |

### Les reprises du §13 et la liste de fichiers p15

- **§13, l.451-455 « Ce qui n'est PAS un ticket neuf »** — quatre puces. Elles **ne portent aucune affirmation
  nouvelle** : ce sont les lignes 5, 6, 4 et 7 du tableau ci-dessus, reformulées. Les compter comme quatre
  vérifications de plus gonflerait le total sans rien mesurer.
- **l.523-524, les dix fichiers « pour orientation seulement »** — vérifiés un par un :
  `bellum_organigramme.py` · `classification.py` · `org_graph_assembler.py` · `relation_verifier.py` ·
  `org-graph.ts` · `org-graph.service.ts` · `TabOrganigramme.tsx` · `OrgInfluenceMap.tsx` · `OrgGraphViews.tsx` ·
  `DeclareOrgPanel.tsx`. **Les dix existent**, aux chemins attendus. Aucun `ABSENT`.

---

## 2. Le comptage

| Statut                                              | Nombre                                     |
| --------------------------------------------------- | ------------------------------------------ |
| `LIVRÉ` (existe + appelant réel cité + atteignable) | **7**                                      |
| `PARTIEL`                                           | **1** (#6, la vérification d'une relation) |
| `CODE MORT`                                         | **0**                                      |
| `ABSENT`                                            | **0**                                      |
| `NON PROUVÉ`                                        | **0**                                      |
| **Total des affirmations d'existence du §2**        | **8**                                      |

**Le total tombe juste : 7 + 1 = 8.** Et il est plus favorable que ce que la note de recette laissait craindre :
le §2 ne s'est trompé sur **aucune** existence. Ce n'est pas pour autant qu'il est sûr de s'y fier — voir §3.

Vérifications annexes : **10 fichiers** cités p15, **10** trouvés. **4** reprises au §13, **0** affirmation neuve.

⚠️ **Un total est un argument.** Celui-ci dit : « le §2 ne ment pas sur ce qu'il affirme ». Il ne dit **pas** :
« on peut construire dessus les yeux fermés ». Ce que le §2 fait croire à tort n'est pas dans ses affirmations,
c'est dans sa **liste des manques** — et c'est là que se trouve le seul code mort de ce périmètre.

---

## 3. Ce que le §2 fait croire à tort — le vrai livrable

### 3.1 Le §2 a **trois jours de retard**, et sa liste des « Manques réels » est la partie périmée

Le §2 décrit le dépôt au **27/08**. `origin/main` a bougé le **28** et le **29** (dates d'ajout des fichiers,
mesurées) — et ce qui a bougé, c'est précisément la liste des manques (l.66-72).

| « Manque réel » annoncé l.66-72                                                              | État mesuré sur `origin/main` au 30/08                                                                                                                                                                                                                                                                                    | Ce qu'un agent aurait fait à tort                                                                      |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| « Correctif du grounding `reportingTo` » (le **P0**)                                         | **FAIT.** `org_graph_assembler.py:802-819` ne passe plus la provenance d'identité ; `route_for` (`org_resolver.py:129-145`) range tout `reports_to` d'origine `llm` en **influence**. Vérifié **par exécution**, §4.                                                                                                      | Refaire le correctif P0 — sur du code déjà corrigé, avec le risque de le défaire.                      |
| « Décorrélation couverture totale / vague LLM de 50 »                                        | **FAIT.** `org_graph_build.py:48,103` distingue `discovered_contacts` de la vague ; `CONTACTS_ENRICH_MAX` (`classification.py:77`) est une taille de vague, et `coverage.enrichmentBatchSize` la porte à l'écran.                                                                                                         | Recoder la décorrélation.                                                                              |
| « Vue focale finale alignée maquette SNCF mais basée sur une vraie hiérarchie »              | **FAIT** (`FocalOrgView.tsx`, ajouté le 29/08). C'est l'écran d'arrivée dès qu'un dossier porte un graphe.                                                                                                                                                                                                                | Recréer un second écran focal — deux vues concurrentes du même compte.                                 |
| « Coverage header, all-contacts drawer et planificateur d'enrichissement »                   | **DEUX TIERS FAITS.** Bandeau de couverture : `FocalOrgView.tsx:138-160`, sept compteurs, `UnknownValue` quand la mesure manque. « Voir tous » : `onViewAllContacts` bascule sur l'onglet **Contacts** — pas un tiroir, une **substitution** assumée. **Planificateur d'enrichissement : introuvable, toujours à faire.** | Recoder le bandeau ; ou croire le planificateur fait parce que le reste de la ligne l'est.             |
| « Édition d'une personne / d'un lien existant, ledger de corrections et optimistic locking » | ⚠️ **LA MOITIÉ SERVEUR EXISTE ET PERSONNE NE L'APPELLE** — détaillé en 3.2.                                                                                                                                                                                                                                               | Recoder l'API du ledger, qui existe déjà et est testée ; **ou** la croire livrée parce qu'elle existe. |
| « Temporalité et reporting fonctionnel / matriciel »                                         | **VRAI MANQUE.** Aucun `validFrom` / `validTo` ni relation `functional` dans `packages/contracts/src/schemas/org-graph.ts`.                                                                                                                                                                                               | Rien — le §2 a raison ici.                                                                             |

### 3.2 Le seul CODE MORT du périmètre : le ledger de corrections

Ce n'est **pas** une affirmation du §2 : c'est un de ses « manques », à moitié comblé depuis, et personne
ne le sait.

- **Existe** : `OrgGraphCorrectionService` (`apps/api/src/modules/org-graph/org-graph-correction.service.ts`),
  `OrgGraphController` (`org-graph.controller.ts:35`) avec trois routes —
  `PATCH accounts/:accountId/org-graph/corrections` (`:50`), `POST …/corrections/:correctionId/revert` (`:67`),
  `GET …/corrections` (`:97`) — le verrou optimiste (`expectedGraphVersion`, `:103`, `:206`), la 409 avec diff
  (`conflict`, `:414`), l'entité `OrgGraphCorrectionEntity`, la migration `1790700530001-OrgGraphCorrections.ts`,
  les contrats `packages/contracts/src/schemas/org-graph-correction.ts`, et trois fichiers de tests.
- **Est monté** : `OrgGraphModule` est importé par `AnalysisModule` (`:80`) et `AccountFeedbackModule` (`:27`),
  donc Nest monte bien son contrôleur.
- **N'a AUCUN appelant** : `grep -rn "org-graph" apps/web/src` → **zéro** (hors la garde que j'ajoute).
  `grep -rn "expectedGraphVersion" apps/web e2e` → **zéro**. Aucun écran, aucun hook, aucun client.
  **Aucun geste d'utilisateur n'atteint ces trois routes.**

**Statut : `CODE MORT`.** Du code juste, calculé, testé, que personne n'appelle — le motif n°1 du dépôt.

**Ce qu'un agent d'implémentation doit en conclure :** le ticket P1 « Drawer correction + ledger +
`expectedGraphVersion` » (§13) est un ticket **de front**, pas de back. Écrire le tiroir, le hook, le client
et l'affichage de la 409 ; **ne pas** réécrire le service.

### 3.3 Ce que « Présent » ne dit pas, et qui a coûté ce rapport

Le §2 emploie le mot **« Présent »** pour huit choses. Sur les huit, sept sont vraiment branchées — mais
**le mot ne le prouvait dans aucun cas** : un `Présent` posé sur l'existence d'un fichier serait tombé
exactement pareil si le fichier n'avait eu aucun appelant. La preuve que sept sur huit sont vivantes vient
d'ici, pas du §2. Et la huitième montre à quoi ressemble l'échec : `relation_verifier.py` existe, est importé,
est appelé, écrit son verdict — **et ne sert plus à rien**, parce que rien ne peut plus le déclencher.

---

## 4. Le défaut central, mesuré en EXÉCUTANT : « vérifier une relation » n'a plus de sujet

Le §2 demande de rendre le vérificateur « visible dans le drawer ». La question qu'il ne pose pas :
**sur quoi le bouton s'affiche-t-il ?**

### La chaîne, vérifiée maillon par maillon

`OrgVerifyRelation.tsx:36` → `useVerifyOrgRelation` (`useEnrichAccount.ts:128`) →
`accountsApi.verifyOrgRelation` (`api.ts:350`) → `POST /analysis/:id/verify-relation`
(`analysis.controller.ts:300`) → `verifyOrgRelation` (`analysis-ondemand.service.ts:754`) →
`iaClient.verifyRelation` (`ia.client.ts:1100`) → `POST /org/verify-relation` (`org_verify.py:43`) →
`build_verification_queries` + `verdict_from_hits` (`relation_verifier.py:71,108`).

**Et le verdict n'est pas ignoré** : `applyRelationVerification` (`org-graph.service.ts:367`) applique
`applyRelationVerdict` (`org-graph-verify.ts:26`), revalide contre le contrat, écrit `raw_analysis.org.orgGraph`
et bump `org_graph_version` sous condition de version. Le crédit est débité **après** la preuve.
**Sur ce point, aucun reproche : ce n'est pas un vérificateur dont le résultat est jeté.**

### La condition de rendu, elle, n'est plus jamais vraie

Les deux endroits qui montent le bouton lisent **exclusivement** `graph.hierarchyEdges` :

- `FocalOrgView.tsx:478` — `person.reporting && !person.reporting.verified`, et `person.reporting` vient de
  `focalOrgData.ts:472-481`, qui **filtre `edge.type !== 'reports_to'`** ;
- `OrgGraphViews.tsx:542` — `!edge.verified`, sur `inferredEdges` = `partitionOrgHierarchy(hierarchyEdges).inferred`
  (`org-views.ts:73-81` (`verified !== true`)).

Or, depuis le correctif P0, **le pipeline ne produit plus aucune `hierarchyEdge` de type `reports_to`.**

**Mesure exécutée**, `apps/ia/.venv/bin/python`, `assemble_org_graph` sur deux contacts d'une même entité
dont l'un porte `reportingTo`, **plus** une entrée `hierarchyRelations` du modèle avec `evidence` :

```
hierarchyEdges : [{member_of, p-marie-martin → e-acme-sa, conf 50, verified false},
                  {member_of, p-paul-durand  → e-acme-sa, conf 50, verified false}]
influenceEdges : [{p-paul-durand → p-marie-martin, "rattachement hiérarchique", conf 15}]

reports_to dans hierarchyEdges              : []
reports_to NON vérifiés (= sujet du bouton) : []
```

Et le même graphe, passé à `buildFocalOrgView` (mesure exécutée côté web, sonde jetable supprimée après
lecture) :

```
cartes: 2 | avec reporting: 0
couverture: {"discovered":2,"graphPeople":2,"attached":2,"enriched":2,
             "verifiedLinks":0,"probableLinks":2,"uncoveredZones":0}
```

**Trois conséquences, toutes vérifiables :**

1. **Dans la vue focale — l'écran d'arrivée — le bouton ne s'affiche jamais** sur un dossier issu du pipeline.
   Le seul producteur de `reports_to` restant est la **déclaration humaine** (`org-graph-declare.ts:143-150`),
   qui pose `verified: true` — donc le bouton ne s'affiche pas non plus dessus. Le second producteur
   (`org-graph-correction.ts:243`) est le ledger, qui n'a aucun appelant (§3.2).
2. **Dans les « 4 vues », le bouton s'affiche — sur des arêtes que le serveur refuse.** Les seules
   `hierarchyEdges` non vérifiées sont des `member_of`, dont la cible est une **entité**. `relationToVerify`
   (`org-graph.service.ts:340-343`) cherche les **deux** extrémités dans `stored.people` ; `toName` sort vide,
   la méthode rend `null`, et l'API répond **412 « Ce lien est introuvable dans le dossier, ou il est déjà
   vérifié »**. Le geste existe, il est atteignable, et il échoue.
3. **Le bandeau de couverture annonce « 2 liens probables » là où il n'y a aucune ligne de reporting.**
   `focalOrgData.ts:601-602` compte **toutes** les `hierarchyEdges` sans filtrer le type ; les libellés
   `accountOrg.json:419-420` disent « liens vérifiés » / « liens probables ». Depuis le P0, ces deux
   compteurs mesurent des **rattachements à une entité**, pas des rattachements à une personne — ce que
   l'exemple AIRBUS du §3 du FINAL (« 91 liens vérifiés · 158 probables ») désigne pourtant sans ambiguïté.

**Ce n'est pas un reproche au correctif P0 : il est juste, et le FINAL a raison de l'exiger.** C'est sa
conséquence non dite — celle que le docbloc de `OrgVerifyRelation.tsx:19-25` avait anticipée en toutes
lettres le 29/08, sans que personne n'aille vérifier ce qu'il en restait.

---

## 5. Les décisions parquées — D288 à D293

Plage réservée à cet audit. **Aucune n'est tranchée ici** : elles sont posées avec leur mesure et une
recommandation, pour que l'agent d'implémentation n'ait pas à les redécouvrir.

### D288 — « Vérifier ce lien » n'a plus de sujet. Que devient le geste ?

**Mesuré** : §4. Zéro `reports_to` non vérifié produit par le pipeline ; le bouton ne se rend jamais dans la
vue focale, et échoue en 412 dans les « 4 vues ».
**Trois issues possibles, exclusives :**

- **(a)** Le geste porte sur une **influence** de sujet « rattachement hiérarchique » : c'est là que le P0
  range désormais les `reportsTo` supposés, et c'est exactement la supposition qu'on veut promouvoir en
  lien prouvé. Demande d'élargir `relationToVerify` aux `influenceEdges` et `applyRelationVerdict` à la
  **promotion** influence → hiérarchie (une preuve A crée l'arête qui n'existait pas).
- **(b)** Le geste porte sur une **zone** (`uncoveredZones`) : « je crois que X rapporte à Y, cherche-moi
  la preuve », saisi par l'utilisateur.
- **(c)** Le geste disparaît de l'UI tant qu'il n'a pas de sujet — honnête, mais il faudrait alors retirer
  aussi son entrée du §13 « pas un ticket neuf ».

**Recommandation : (a).** C'est la seule qui rend au bouton la population qu'il visait, et elle est
alignée sur le §6 du FINAL (« provider expose explicitement manager → relation probable, sourcée comme
claim relationnel » ; « site officiel prouve le reporting → relation vérifiée »). ⚠️ **Elle exige de
protéger la promotion** : seule une preuve **A** (page officielle / organigramme publié) doit pouvoir créer
une `hierarchyEdge`, sinon on rouvre le P0 par la porte de service.

### D289 — Le bouton s'affiche sur des `member_of` que l'API refuse en 412

**Mesuré** : §4, conséquence 2. `OrgGraphViews.tsx:542` monte le bouton sur **toutes** les arêtes non
vérifiées ; `relationToVerify` n'accepte que deux **personnes** nommées.
**Recommandation : borner le rendu à ce que l'API sait traiter** — la condition devrait être « les deux
extrémités sont des personnes », pas « l'arête n'est pas vérifiée ». Un clic qui ne peut qu'échouer est pire
qu'un bouton absent : il use un geste et n'apprend rien. ⚠️ Un contrôle **négatif** est indispensable
(afficher le bouton sur un `member_of` doit rendre la garde rouge) — sinon la garde ne protégera que la
forme qu'elle a vue.

### D290 — Le ledger de corrections : API livrée, aucune porte

**Mesuré** : §3.2. Trois routes montées, testées, zéro appelant.
**Recommandation : ticket de FRONT uniquement.** Écrire le tiroir de correction, le hook, le client et la
modale de comparaison 409 ; ne pas toucher au service. ⚠️ Et **ne pas** l'écrire depuis le §2 : le §2 range
cette capacité dans les manques, ce qui ferait recoder l'API.

### D291 — Le déclencheur du retrait de l'ancien `OrgChart` (3 rangées)

**Mesuré** : `OrgChart.tsx:24` est encore le seul rendu d'un dossier sans `orgGraph`, et ses trois rangées
sont des **rôles d'achat** (`contactRoles.ts:187`) — ce que le §15 refuse explicitement.
Le §8 du tracker du 29/08 pose déjà la question sans la trancher : « un rebuild, ou quatre semaines
calendaires ? »
**Recommandation : un rebuild, mesuré, pas une date.** Une date retire le repli à des dossiers qui n'ont
peut-être pas été rejoués ; la condition honnête est « aucun compte actif ne rend plus `OrgChart` », ce qui
se mesure. ⚠️ Tant qu'il est là, il **contredit à l'écran** la décision 4 du FINAL pour les dossiers anciens.

### D292 — Les compteurs « liens vérifiés / probables » comptent des rattachements d'entité

**Mesuré** : §4, conséquence 3 (`focalOrgData.ts:601-602`, libellés `accountOrg.json:419-420`).
**Recommandation : filtrer sur `type === 'reports_to'`, et nommer ce qui n'est pas mesurable.** Un compteur
qui vaut 2 quand aucune ligne de reporting n'existe est un chiffre qui ment — c'est le motif « un zéro qui
ment », retourné : ici c'est un **non-zéro** qui ment. ⚠️ Si le filtre est posé, les deux compteurs vaudront
souvent 0 : la question « si cette valeur est absente, 0 est-il VRAI ? » se repose alors entièrement, et la
réponse est probablement `UnknownValue`, pas `0`.

### D293 — « Voir tous les contacts » : onglet Contacts, ou tiroir ?

**Mesuré** : le §2 (l.71) et le §8 (l.266) du FINAL demandent un « drawer / page virtualisée ».
`AccountDetailTabContent.tsx:102` bascule sur l'**onglet Contacts** — une substitution assumée dans le
commentaire, jamais arbitrée.
**Recommandation : garder l'onglet, et écrire la raison.** L'onglet Contacts porte déjà les filtres,
la virtualisation et la recherche que le §8 demande, et un second inventaire de contacts violerait la loi 4
du tome 7 (« rien n'apparaît deux fois sous la même forme avec le même contenu »). Ce qui manque n'est pas
le tiroir : ce sont les **filtres du §8** (état seed / enrichi / corrigé, fraîcheur) dans l'onglet Contacts.

---

## 6. Les deux gardes

Plage réservée : **GA-102 et GA-103** — libres (le plus haut numéro du dépôt était **GA-87**).
Elles ne portent que sur des capacités **réellement livrées et atteignables** dont rien ne garantissait
qu'elles restent branchées. Chacune prouve les deux choses exigées.

### GA-102 — `apps/web/src/architecture/org-manual-add-stays-mounted.test.ts`

Tient : `DeclareOrgPanel` est monté dans **les deux** rendus de l'onglet Organigramme (le découpage est fait
sur `<FocalOrgView` puis le `return (` suivant, **commentaires retirés**), sa chaîne d'écriture est entière
jusqu'à `@Post(':accountId/org-people')`, et l'onglet s'atteint **en cliquant**.

- **Elle LIT** : sept fichiers vérifiés existants et > 500 octets, et les deux segments découpés > 100 octets.
- **Elle sait dire NON** — contrôle exécuté, trois ruptures volontaires :

  | rupture                                           | rouge obtenu                                                                        |
  | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
  | retrait du montage dans la vue focale             | `il est monté dans la vue FOCALE … expected 0 to be greater than 0`                 |
  | retrait du montage dans le second rendu           | `il est monté dans le second rendu … expected 0 to be greater than 0`               |
  | retrait de `accountsApi.declareOrgPeople` du hook | `et il rejoint encore son ÉCRITURE … to match /accountsApi\.declareOrgPeople\s*\(/` |

  → `1 failed | 4 passed`, puis `3 failed | 2 passed`. Code **restauré**, `git status` ne montre plus que
  les deux fichiers de garde.

> ⚠️ **Mise à jour du 31/08/2026 — la garde suit désormais UN niveau d'indirection.**
> Le revirement de Louis (trois vues commutables sur l'onglet Organigramme) a fait extraire le pied
> commun des rendus dans un `const belowEveryView = (…)`. GA-102, qui cherchait `<DeclareOrgPanel`
> **littéralement** dans chaque branche, est passée au ROUGE sur du code où le panneau est monté
> partout, y compris dans les trois vues neuves. Deux issues, une seule honnête : recopier le
> montage cinq fois (vert, et cinq occasions de diverger), ou **suivre l'indirection** — c'est ce
> qui a été fait (`mountsVia`, un seul niveau, `{x}` où `const x = (…)` contient le montage).
> La règle protégée est « le panneau est monté dans les deux rendus », pas « la chaîne apparaît
> deux fois dans ce fichier ». Le résolveur porte SA preuve qu'il sait dire non (bloc
> « le résolveur d'indirection ne compte pas n'importe quoi »), et la rupture volontaire du
> montage a bien redonné `2 failed | 4 passed` avant restauration.

### GA-103 — `apps/web/src/architecture/org-relation-verify-stays-on-the-card.test.ts`

Tient : `OrgVerifyRelation` est monté dans la vue focale **et** dans les « 4 vues », un seul composant porte
le clic (l'annonce de coût vient de `creditCostRange`, jamais recopiée), la chaîne va du bouton jusqu'à
`verdict_from_hits`, et le **verdict est appliqué** au graphe stocké avec bump de version.

- **Elle LIT** : huit fichiers vérifiés existants et > 400 octets, sur les trois services.
- **Elle sait dire NON** — contrôle exécuté, deux ruptures volontaires :

  | rupture                                            | rouge obtenu                                                                           |
  | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
  | retrait du montage dans `FocalOrgView`             | `la vue FOCALE le monte … expected 0 to be greater than 0`                             |
  | retrait de `applyRelationVerification(` du service | `le verdict est APPLIQUÉ au graphe stocké … to match /applyRelationVerification\s*\(/` |

  → `2 failed | 4 passed`. Code **restauré**, `git status` propre.

⚠️ **Ce que GA-103 ne prouve PAS, et le dit dans son docbloc** : que le bouton ait un **sujet**. Elle tient le
montage — ce que le §2 met en jeu ; le sujet manquant est D288, un défaut ouvert, pas quelque chose qu'elle
certifie. Une garde protège une règle, elle ne l'invente pas.

**Les deux gardes, ensemble, après restauration : `2 passed (2) · 11 passed (11)`.**

---

## 7. En une phrase, pour l'agent d'implémentation

Le §2 ne se trompe sur **aucune** des huit capacités qu'il déclare présentes — mais il ne prouvait aucune
d'elles, sa liste des **manques** a trois jours de retard sur `origin/main`, elle range dans « à faire » un
ledger de corrections **déjà écrit et que personne n'appelle**, et elle ne voit pas que le correctif P0
qu'elle réclame a **privé de sujet** le vérificateur qu'elle dit de ne pas recoder.
