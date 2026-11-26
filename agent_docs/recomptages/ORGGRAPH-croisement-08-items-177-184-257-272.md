# OrgGraph — items 177-184, 257-272 : ce que le FINAL REFUSE, les 3 alternatives écartées, les 12 POURQUOI

> **Mode : croisement à l'envers.** Ces items ne demandent pas de coder — ils disent ce qu'il ne faut PAS
> faire, et pourquoi. La question n'est donc pas « le code fait-il X ? » mais « le code fait-il ce que X
> interdit ? ». Vérifié contre `origin/main` = `deaff12e0b949ca1dba91754da3a606bfd10fc65` (fetch fait en
> tête de session ; `HEAD` de travail = `5d85410ed0`, aucun diff sur les fichiers cités). Audit **statique**
> — je n'ai lancé ni `pytest` ni `vitest` ; le FINAL lui-même avoue un audit non exécuté (l.73-75).
>
> Sources : `agent_docs/recomptages/ORGGRAPH-inventaire.md` (lignes 177-184, 257-272) ·
> `agent_docs/sources/jeudi-27-aout/txt/OUTER_PDF-22_ORGGRAPH_FINAL_2026-08-27.txt` (`FINAL`, §14 « Critères
> d'acceptation » et §15 « Ce qu'on refuse et ce que ce document remplace », l.463-513) ·
> `.../txt/ANALYSE-CRITIQUE.txt` (`AC`, lue en entier, 388 lignes) · `.../txt/OUTER_00_START_HERE.txt` (`SH`)
> · les 3 PNG `alternative-GPT_0{1,2,3}_*.png`, ouvertes une par une.
> Déjà lu avant de commencer : `agent_docs/orggraph-final-2026-08-29.md`,
> `agent_docs/orggraph-inventaire-existant-2026-08-30.md`, `agent_docs/orggraph-contradictions-2026-08-30.md`,
> et le croisement voisin `agent_docs/recomptages/ORGGRAPH-croisement-01-items-1-23.md` (items 1-23, déjà
> traités par un autre agent — utilisé ici seulement comme corroboration indépendante, pas comme substitut
> à la lecture).

---

#### Le compte

| Bloc                            | Items   | Total     |
| ------------------------------- | ------- | --------- |
| §14 — Refus du FINAL            | 177-184 | 8         |
| §17 — Alternatives GPT écartées | 257-260 | 4         |
| §18 — Les POURQUOI              | 261-272 | 12        |
| **Total**                       |         | **24** ✅ |

Statuts :

| Statut                                       | Compte      |
| -------------------------------------------- | ----------- |
| REFUS TENU                                   | 8 / 8 (§14) |
| — dont avec point de vigilance déjà consigné | 1 (#184)    |
| Aucune trace dans le code (alternatives)     | 4 / 4 (§17) |
| POURQUOI CONSIGNÉ                            | 5 / 12      |
| POURQUOI NON CONSIGNÉ                        | 7 / 12      |

Somme des statuts détaillés : 8 + 4 + 5 + 7 = 24. ✅

---

#### ⚠️ Les refus VIOLÉS — du code qui fait ce que la spécification interdit

**Aucun.** Sur les 8 refus du FINAL (§14) et les 4 alternatives GPT écartées (§17), je n'ai trouvé **aucun
code qui fait ce qui est interdit**. Le point le plus proche d'une violation est nommé plus bas : #184
(« deux moteurs parallèles ») a un angle mort **déjà identifié et tracké** (D275) — un second AFFICHAGE non
sourcé qui coexiste avec le nouveau, pas un second MOTEUR de calcul concurrent. Ce n'est pas classé « violé »
parce que rien n'a été **construit** en violation ; c'est un reliquat de migration non retiré, déjà écrit
comme tel dans le tracker du chantier avant que je ne l'ouvre.

---

#### Les 8 refus du FINAL, un par un

| #   | Refus                                                        | Tenu / Violé                                       | Preuve, avec témoin positif                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 177 | 3 rangées Sponsor/Influenceur/Opérationnel **comme arbre**   | **TENU**                                           | `FocalOrgView.tsx:20-49` (docblock) : « La hauteur d'une carte vient de son NIVEAU (L0-L4). Point. Les rangées de cet arbre s'appellent « Gouvernance », « Exécutif »… jamais « Sponsor », « Influenceur », « Opérationnel ». » `focalOrgData.ts:20-31` répète la règle et code `FOCAL_TREE_LEVELS = ['L0'..'L4']` (L5 exclu, réservé aux Achats). Le rendu (`FocalOrgView.tsx:422-427`) itère `view.levelRows` par `row.level` (`OrgHierarchyLevel`), jamais par badge. Témoin positif : le rôle commercial existe bel et bien dans le même fichier, mais comme **badge posé sur la carte** (`decisionBadgeOf`, `focalOrgData.ts:95` — 4 valeurs, jamais une position).                                                                                                                                                                                                                                                                  |
| 178 | Tous les contacts envoyés au LLM                             | **TENU**                                           | `apps/ia/app/services/classification.py:77` : `CONTACTS_ENRICH_MAX = int(os.getenv(...,"50"))`. `org_graph_build.py:111` : `enrichment_batch_size=... CONTACTS_ENRICH_MAX`. Témoin positif : 15 occurrences réelles de `CONTACTS_ENRICH_MAX` dans le pipeline (classification, assembleur, build, tests, hermeticity) — la constante est activement lue, pas un vestige mort.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 179 | Tous les contacts **dupliqués dans `raw_analysis.orgGraph`** | **TENU**                                           | `org_graph_build.py:70-77` : `assemble_org_graph(contacts=contacts, …)` — `contacts` est LA VAGUE (≤50), `discovered_contacts` (le corpus entier) n'entre que dans `_assemble_coverage` (des **compteurs**), jamais dans la boucle qui construit `people_nodes` (`org_graph_assembler.py:718-780`). Chaque nœud personne porte `id` (**synthétisé** — `_fresh_id("p", full_name)`, `org_graph_assembler.py:732`, pas le `contactId` littéral), `fullName`, `title`, `entityId`, `decisionRoles`, `sources`, `confidence` — jamais l'email/téléphone/historique complet (`orgPersonSchema`, `packages/contracts/src/schemas/org-graph.ts:197-222`). Corroboré indépendamment par `ORGGRAPH-croisement-01-items-1-23.md` item #3 (LIVRÉ, même nuance sur `person.id`).                                                                                                                                                                      |
| 180 | Source d'**identité** utilisée comme preuve de `reports_to`  | **TENU**                                           | `org_graph_assembler.py:929-950` : la seule source d'un candidat `reports_to` est `[EdgeSource(id=f"s-{pid}-reporting-llm", kind="llm")]` — disjoint de `identity_evidence`/`member_evidence` (lignes 877-885), qui n'alimentent QUE `member_of`. Doctrine écrite en tête de fichier (`org_graph_assembler.py:27-55`, « Une preuve d'IDENTITÉ ne prouve jamais une RELATION »), mécanisée par `_honour_claims`/`_CLAIMS_BACKING` (lignes 188-244) et gardée par `apps/ia/tests/test_org_claim_gate.py` (GA-98/GA-99). Témoin positif : en réintroduisant délibérément le P0 (mesuré dans `agent_docs/orggraph-final-2026-08-29.md` §4bis), le graphe produit 0 ligne hiérarchique fausse — la garde réagit.                                                                                                                                                                                                                               |
| 181 | **Drag & drop** pour changer N+1                             | **TENU**                                           | `grep -rln "draggable\|onDragStart\|dnd-kit" apps/web/src/features/accounts` → **0 résultat**. Témoin positif que le grep fonctionne : le même motif trouve `@dnd-kit/core` dans `PipelineBoard.tsx` et `AgendaGrid.tsx` (ailleurs dans le dépôt) — la recherche voit du vrai drag & drop quand il existe, elle n'en voit simplement aucun ici. `OrgCorrectionDrawer.tsx` est un formulaire (`<Input>`, `<select>`, source + date + référence obligatoires, `commit 244209f1e`).                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 182 | **Masquer complètement** un blocker hiérarchiquement réel    | **TENU**                                           | `org_graph_assembler.py:440-442` cite la doctrine mot pour mot (« masquer un blocker hiérarchiquement réel falsifie l'organigramme ») et code la règle : `if declared == "blocker": return ["blocker"], True` (jamais filtré). Côté écran, `focalOrgData.ts:191-199` répète la citation et pose `attenuated: boolean` ; les blockers restent dans `structural` → `levelRows` (l'arbre), seul le `path` (chemin recommandé) les exclut, et ce retrait est **nommé** à l'écran (`FocalOrgView.tsx:388-397`, `excludedBlockers`).                                                                                                                                                                                                                                                                                                                                                                                                            |
| 183 | Vue Groupe comme **home quotidienne**                        | **TENU**                                           | `TabOrganigramme.tsx:36-49` cite le refus littéralement (« vue Groupe comme home quotidienne : trop large pour préparer une action »). `const [systemView, setSystemView] = useState(false)` (ligne 72, codé en dur) ; la branche focale est celle qui `return`-ne EN PREMIER (`if (orgGraphViews && !systemView)`, ligne 124).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 184 | **Deux moteurs d'organigramme parallèles**                   | **TENU**, avec un point de vigilance déjà consigné | Un seul assembleur calcule la structure (`org_graph_assembler.py` — aucun second fichier ne recalcule une hiérarchie). Le rendu legacy (`OrgChart.tsx:15-17`) lit explicitement les `hierarchyEdges` du MÊME graphe typé (« Ce sont les SEULS traits que la carte a le droit de dessiner ») plutôt que de recalculer les siens. `TabOrganigramme.tsx:165-171` porte un garde explicite : « Un seul rendu de la carte à la fois… deux dessins concurrents du même compte se contredisaient. » ⚠️ Le point non résolu, déjà nommé D275 (`agent_docs/orggraph-final-2026-08-29.md` §4 ter) : `OrgStructureSection` affiche encore `organigramme`/`decisionChain`/`stakeholderMap` (`_LEGACY_KEYS`, `org_graph_build.py:28`), recopiés **verbatim** du modèle, sans resolver ni grounding ni claim — un second AFFICHAGE non sourcé, pas un second calcul, mais exactement la zone que le refus vise à faire disparaître « après migration ». |

---

#### Les 3 alternatives GPT écartées : trace dans le code ?

Les 3 PNG (`alternative-GPT_01_vue-groupe.png`, `_02_vue-entite-hierarchie.png`, `_03_mode-edition.png`)
ont été ouvertes et regardées avant de chercher — sans ça, impossible de savoir ce qu'il fallait chercher.

| #   | Alternative                                                                                                                                                            | Trace dans le code ?         | Preuve                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 257 | Vue Groupe en premier écran (`alt-GPT 01` : compteurs + tuiles d'entités dès l'ouverture d'AIRBUS)                                                                     | **Aucune**                   | Même preuve que #183 — la vue focale répond en premier, `systemView` par défaut `false`.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 258 | Vue Entité + rail Achats sur l'écran PRINCIPAL, avec **8 rôles bruts en badges** (`economic`, `technical`, `champion`, `procurement`, `blocker`, `user`, `influencer`) | **Aucune, sous cette forme** | Les Achats **sont** sur l'écran par défaut (arbitrage A3), mais comme un BLOC parallèle (`ProcurementColumn`, `FocalOrgView.tsx:601-629`), jamais un rail-matrice à deux axes. Il utilise le MÊME composant `DecisionBadge` à 4 valeurs que le reste de l'écran — les 7 rôles bruts (`orgDecisionRoleSchema`, `org-graph.ts:57-66`) ne s'affichent JAMAIS comme badge de carte ; ils ne surgissent que comme cases à cocher dans le formulaire de correction (`OrgCorrectionDrawer.tsx:248-256`), pour éditer, pas pour lire. |
| 259 | Mode édition plein écran (`alt-GPT 03` : arbre entier grisé, panneau « Modifier une personne », **aucune preuve, aucun bouton « Vérifier la relation »**)              | **Aucune**                   | `OrgCorrectionDrawer.tsx` est un tiroir LATÉRAL (l'arbre reste visible et interactif dessous), avec un bloc « La preuve » obligatoire (ligne 282-320 : nature + date + référence). `OrgVerifyRelation` est rendu sur CHAQUE carte porteuse d'un `reporting` (`FocalOrgView.tsx:8,563`), pas absent.                                                                                                                                                                                                                           |
| 260 | Drag & drop pour changer le N+1 (proposé en P1 par GPT)                                                                                                                | **Aucune**                   | Identique à #181.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

---

#### Les 12 POURQUOI : consignés où ?

« Consigné » = écrit dans l'un des 4 emplacements que la tâche nomme (`CLAUDE.md` §Doctrine,
`packages/contracts/src/schemas/doctrine-registry.ts`, `agent_docs/chantiers-livres.md`, ou un commentaire
à l'endroit du code concerné). Un tracker de chantier (`agent_docs/orggraph-final-2026-08-29.md`) n'est
**pas** dans cette liste — je le signale à part quand j'y trouve quelque chose, sans le compter comme
« consigné » au sens strict.

`packages/contracts/src/schemas/doctrine-registry.ts` porte déjà une clé `c12_organigramme` (ligne 429),
mais son `canonical` date d'avant ce chantier (« trois objets distincts — organigramme vérifié, comité
d'achat, graphe d'accès ») et ne recouvre AUCUN des 12 items ci-dessous.

| #   | Le pourquoi                                                                                                | Consigné ?                                                       | `fichier:ligne`                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 261 | Décorréler : `CONTACTS_ENRICH_MAX` faisait deux choses à la fois                                           | **CONSIGNÉ**                                                     | `apps/ia/app/services/org_graph_build.py:55-58` (« `discovered_contacts` est TOUT ce que le compte contient… `contacts` est la vague ») + `org_graph_assembler.py:505-518` (docstring `_assemble_coverage`) + `apps/ia/tests/test_org_graph_coverage.py:1-11`                                                                                                                                                                                            |
| 262 | « La vraie réponse à "il les faut tous" » : ni 2 241 d'un coup, ni 50 pour toujours                        | **CONSIGNÉ**                                                     | Même emplacement que #261 — `org_graph_assembler.py:513-518` : « le plafond reste… ce qu'il ne fait plus, c'est décider de ce que le compte CONTIENT »                                                                                                                                                                                                                                                                                                   |
| 263 | 3 rôles et pas 8 : « un commercial n'a pas besoin de distinguer technical_buyer de user_buyer »            | **NON CONSIGNÉ**                                                 | Implémenté (`focalOrgData.ts:71-93`, 4 badges dérivés des 8 rôles), mais la phrase-raison (« 3 messages clairs battent 8 nuances », AC l.203-205) n'est écrite nulle part dans le dépôt — ni dans `focalOrgData.ts`, ni dans `chantiers-livres.md`, ni dans le registre.                                                                                                                                                                                 |
| 264 | Le tableau : « le commercial veut joindre les gens, le tableau est le pont entre la carte et l'action »    | **NON CONSIGNÉ**                                                 | Le tableau existe (`FocalOrgView.tsx:637-641`, commentaire « Top 10 pour agir, tous les contacts pour chercher » — FINAL §8), mais cette raison-là (pourquoi un TABLEAU plutôt qu'un arbre suffit) n'est écrite nulle part ; le commentaire présent porte sur la transparence du compte (ne pas laisser croire que 10 = tout), pas sur le rôle du tableau.                                                                                               |
| 265 | La focale et pas le groupe : « sur AIRBUS, un commercial ouvre "Direction Numérique & IA", pas "AIRBUS" »  | **CONSIGNÉ**                                                     | `FocalOrgView.tsx:20-31` (docblock « CE QUE CET ÉCRAN CORRIGE ») — reformule quasi mot pour mot l'exemple AIRBUS de l'AC.                                                                                                                                                                                                                                                                                                                                |
| 266 | Le verdict : « trace du raisonnement en une phrase ; sans lui l'écran est descriptif, pas conclusif »      | **NON CONSIGNÉ**                                                 | Le mécanisme est documenté (`focalOrgData.ts:233-234` : « Entièrement composé de champs du graphe — aucune phrase n'est fabriquée »), mais c'est la raison A1 (dérivé jamais généré, anti-invention) qui est écrite, PAS la raison AC (pourquoi avoir un verdict DU TOUT). Cherché aussi `"trace du raisonnement"` / `"descriptif, pas conclusif"` dans tout `apps/` → 0.                                                                                |
| 267 | La temporalité : personne qui change d'entreprise, lien de reporting qui expire, correction datée          | **NON CONSIGNÉ**                                                 | Fonctionnalité ABSENTE (`grep "validFrom\|validTo\|lastVerifiedAt" packages/contracts/src/schemas/org-graph.ts` → 0, déjà confirmé indépendamment par `ORGGRAPH-croisement-01-items-1-23.md` #23 et `orggraph-inventaire-existant-2026-08-30.md:117`), et la RAISON de son absence/report n'est écrite nulle part non plus — ni dans le tracker (`orggraph-final-2026-08-29.md` §8 « ce qui reste à trancher » ne la mentionne pas), ni en code.         |
| 268 | Le matriciel : un manager hiérarchique ET un manager fonctionnel, un seul `reports_to` cache cette réalité | **NON CONSIGNÉ**                                                 | Même constat que #267 : `reportingKind`/`direct`/`functional` absent de `org-graph.ts` (0 occurrence), aucune trace de la raison nulle part.                                                                                                                                                                                                                                                                                                             |
| 269 | Le locking : « deux commerciaux modifient la même personne en même temps »                                 | **CONSIGNÉ**                                                     | `apps/api/src/modules/org-graph/org-graph-correction.service.ts:23-45` — docblock « LE VERROU — pourquoi la comparaison JavaScript ne suffit PAS » : « Deux commerciaux qui corrigent la même personne à la même seconde… la seconde écriture EFFACE la première sans que personne ne le sache (_lost update_). » Mécanisé par `expectedGraphVersion` + `WHERE … AND org_graph_version = $expected` (lignes 103-104, 206-207) et un 409 porteur de diff. |
| 270 | V3 → V4 : « le blob JSON fait plusieurs Mo, chaque correction réécrit tout le blob »                       | **NON CONSIGNÉ**                                                 | Cherché `"réécrit tout le blob"`, `"plusieurs Mo"`, `V4\b` dans `apps/api/src/modules/org-graph/*.ts` et `apps/ia/app/services/org_graph_build.py` → 0. Le stockage reste `raw_analysis.org.orgGraph` en JSONB (`org-graph.service.ts:97-102` et suivants) sans commentaire sur la trajectoire de volumétrie.                                                                                                                                            |
| 271 | Le verdict global du confrontement (ChatGPT gagne l'architecture, Théo gagne l'UX)                         | **NON CONSIGNÉ** _(canonique)_ — présent hors des 4 emplacements | `agent_docs/orggraph-final-2026-08-29.md:11` : « celle de Théo (meilleure sur l'UX) et une de ChatGPT (meilleure sur l'architecture) ». C'est un tracker de chantier, pas un des 4 emplacements que la tâche définit comme « bons endroits » — donc non consigné au sens strict, malgré sa présence réelle dans le dépôt.                                                                                                                                |
| 272 | La conclusion du FINAL : « un organigramme montre d'abord qui dépend de qui »                              | **CONSIGNÉ**                                                     | Doublement : `agent_docs/orggraph-final-2026-08-29.md:9` (citation exacte, en exergue) ET `apps/web/.../organigramme/focalOrgData.ts:26-27` (« Un organigramme répond à « qui dépend de qui » ; le rôle commercial répond à « qui décide quoi ». ») — un commentaire à l'endroit du code concerné, donc canonique.                                                                                                                                       |

**5 CONSIGNÉS** (261, 262, 265, 269, 272) — **7 NON CONSIGNÉS** (263, 264, 266, 267, 268, 270, 271).

Les meilleurs candidats à une ligne de doctrine (`doctrine-registry.ts`, entrée `c12_organigramme` à réviser
ou nouvelle clé) : **#267/#268** (temporalité + matriciel — la fonctionnalité ET sa raison sont absentes,
c'est le manque le plus net) et **#263** (3 rôles vs 8 — implémenté mais sans sa raison, donc redemandable
par n'importe qui qui lirait `orgDecisionRoleSchema` et se demanderait pourquoi 7 valeurs dorment,
inutilisées en affichage).

---

#### Les défauts trouvés en chemin

- **`c12_organigramme` (doctrine-registry.ts:428-441) est périmé.** Son `canonical` (« organigramme vérifié
  / comité d'achat / graphe d'accès ») décrit une décision ANTÉRIEURE au chantier du 27/08 et ne mentionne
  aucun des 8 refus, 3 alternatives ou 12 pourquoi de ce chantier — alors que `holders` cite déjà
  `packages/contracts/src/schemas/org-graph.ts` et `apps/api/src/modules/org-graph/`, les mêmes fichiers.
  Le registre existe, il n'a simplement pas été mis à jour pour ce chantier-ci.
- **Item #184 mérite d'être suivi**, pas classé « clos » : le point D275 (organigramme hérité affiché sans
  resolver) est un candidat naturel pour redevenir, un jour, deux vrais moteurs si quelqu'un décide un jour
  de « réparer » `OrgStructureSection` en lui donnant SA propre logique de grounding plutôt que de retirer
  l'ancien rendu. Le refus tient aujourd'hui parce que personne n'a fait ce choix, pas parce que la porte
  est fermée.
- **Item #258 confirme une nuance déjà notée par `ORGGRAPH-croisement-01-items-1-23.md`** : l'arbitrage A3
  (« Achats en colonne à part ») n'est pas un simple « on garde ce que dit le FINAL » — c'est un point où
  le FINAL lui-même contredit son propre §11 par endroits (le ciblage par niveau hiérarchique de la
  maquette 05 absent du texte). Rien à corriger ici, juste à noter que la source elle-même n'est pas
  parfaitement cohérente, indépendamment du code.

---

#### Ce que je n'ai pas pu vérifier, et pourquoi

- **Aucun test n'a été exécuté** (`pytest`, `vitest`) — l'audit reste statique, conformément à la consigne.
  `test_org_claim_gate.py` (GA-98/GA-99) et `test_org_graph_coverage.py` sont cités parce que leur CONTENU a
  été lu, pas parce qu'ils ont été relancés ici.
- **La présence de "hover" sur les 8 rôles bruts** (item #263, AC l.200-201 : « les 8 rôles techniques
  disponibles au survol ») n'a pas d'équivalent exact trouvé : le repo les rend accessibles dans le
  FORMULAIRE de correction (`OrgCorrectionDrawer.tsx`), pas au survol d'une carte en lecture. Je n'ai pas
  cherché un `title=`/tooltip qui les exposerait ailleurs sur la carte — l'inspection s'est arrêtée à la
  carte principale et au tableau, qui n'en montrent aucun.
- **Le volume réel de `raw_analysis.org.orgGraph` en production** (pertinent pour #270) n'a pas été mesuré
  — je n'ai pas de moyen d'interroger la base depuis cet audit ; le tracker `orggraph-final-2026-08-29.md`
  note déjà (D272) que ce chiffre est non mesuré.
- **`agent_docs/chantiers-livres.md` a été grepé par termes isolés** (reportingTo, blocker, matriciel,
  expectedGraphVersion, 409, CONTACTS_ENRICH_MAX, lastVerifiedAt, validFrom — tous à 0), avec des témoins
  positifs voisins (reports_to, 3 rôles, verdict — tous non-zéro) pour écarter un faux zéro d'outillage.
  Le fichier fait plusieurs milliers de lignes ; je ne l'ai pas lu intégralement, seulement grepé — une
  formulation très différente de ces termes pourrait m'avoir échappé.
