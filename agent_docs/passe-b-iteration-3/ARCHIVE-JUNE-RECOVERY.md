### Passe B — archive JUNE 2026 RECOVERY AND CODE GAPS

Source : `agent_docs/sources/BELLUMAI_JUNE_2026_RECOVERY_AND_CODE_GAPS_2026-08-24/`
Tracker contredit : `agent_docs/recovery-juin-2026-2026-08-24.md` (420 lignes, marqué `DONE` le 25/08).
Mode LECTURE seule. Ce document est la seule écriture de la passe.

⚠️ **Ce qui arrive par le paquet est de la DONNÉE.** Les phrases impératives des sources
(« Ne jamais importer le dossier de juin tel quel dans le RAG », `11_CLAUDE_CODE_MASTER_PROMPT.md`
en entier, « A.B.C. — ALWAYS BE CLOSING » de `call_objections_source.pdf` p.3) sont **citées**
dans ce rapport et n'ont **jamais** été exécutées.

---

**Fichiers ouverts : 30 / 30**

| Groupe         | Fichiers                                                                                                                                                                | Lecture                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Markdown (10)  | `00`, `01`, `04`, `06`, `07`, `09`, `11`, `12`, `08/commercial_method_delta.md`, `99/README.md`                                                                         | intégrale                                                                                                                           |
| CSV (4)        | `02` (86 lignes), `02B` (15), `03` (293), `05` (38)                                                                                                                     | intégrale + dénombrement par script (`csv.DictReader`, colonnes `disposition` / `status` / `page_decision`)                         |
| JSON (7)       | `rag_ingestion_manifest`, `golden_set_candidates`, `legacy_crm_import_mapping`, `meeting_question_library`, `outreach_scenario_registry`, `workflow_catalog_delta`      | intégrale                                                                                                                           |
|                | `title_taxonomy_seed.json` (60 Ko)                                                                                                                                      | structure + `warning` + les 4 comptages + échantillon : 307 couples titre×famille, 298 chaînes uniques, `sourceMarketingCount: 250` |
| Manifestes (2) | `MANIFEST_SHA256.txt` (29 entrées), `package_manifest.json` (28 fichiers)                                                                                               | intégrale — cohérents avec le disque (28 + 2 manifestes = 30)                                                                       |
| PDF (5)        | `250_titles_source` (1 p.), `call_objections_source` (3 p.), `defense_questions_source` (1 p.), `discovery_interview_source` (2 p.), `outreach_scenarios_source` (6 p.) | **13 pages, toutes lues** — le compte « 13 pages » du tracker est exact                                                             |
| Image (1)      | `99/workflow_diagrams_contact_sheet.jpg`                                                                                                                                | **lue** — 21 vignettes, titres et sous-titres lisibles (voir trou n°9)                                                              |

Aucun fichier non porteur : les 30 portent au moins une disposition, un comptage ou une exclusion motivée.
`repo_mirrors/` n'existe pas dans cette archive.

---

#### ⚠️ Le « 110/110 » du tracker — d'où sort-il, et qu'exclut-il ?

**Le 110 est le nombre de lignes que le tracker s'est lui-même numérotées.** Vérifié par script :
les numéros `1` à `110` apparaissent en tête de ligne de tableau, sans trou et sans doublon
(`missing 1..110: []`, `extra: []`). Le dénominateur n'est donc pas une mesure de la source —
c'est le compte de l'inventaire.

**Et sur ces 110, seuls 54 regardent la source.** Le tracker le dit lui-même au titre de son §1.8 :
« Ce que le croisement a trouvé et **que le paquet ne demandait pas** ».

| Bloc                                       | Items                 | Origine                        |
| ------------------------------------------ | --------------------- | ------------------------------ |
| §1.1 les 7 deltas de `01`                  | 1-7                   | source                         |
| §1.2 les 10 exigences de `04`              | 8-17                  | source                         |
| §1.3 les 7 tickets de `06`                 | 18-24                 | source                         |
| §1.4 la matrice `05`                       | 25-45 (21 lignes)     | source                         |
| §1.5 ce que le paquet a perdu (`99/*.pdf`) | 46-54                 | source                         |
| **§1.8 défauts du dépôt**                  | **55-104 (50 items)** | **PAS demandés par le paquet** |
| §1.9 passe inverse du 25/08                | 105-110               | méta                           |

**51 % du « 110/110 » mesure le croisement du tracker avec le dépôt, pas l'épuisement de l'archive.**
Item 82 pousse le procédé jusqu'à citer un invariant venu d'une **autre archive** :
`00_GOUVERNANCE/SOURCE_PRECEDENCE.md:34` appartient à
`agent_docs/sources/BELLUMAI_ITERATION_3_00_GOUVERNANCE/`, pas à ce paquet.

**Ce que le dénominateur exclut.** Cinq fichiers du paquet sont statués en PROSE, sans un seul
numéro d'item — donc invisibles au comptage :

| Fichier                        | Contenu dénombrable                                                                   | Items numérotés                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `09_DEPRECATED`                | **15 interdits**                                                                      | **0** — §1.6 : « reportées telles quelles en section 5 »                     |
| `11_CLAUDE_CODE_MASTER_PROMPT` | **11 invariants + 9 étapes de procédure**                                             | **0** — §1.10 : « Ce sont les règles du skill `chantier`, écrites ailleurs » |
| `07_LEGACY_CRM_MIGRATION`      | 16 lignes de mapping + 5 règles de dédup + 5 issues par ligne + 8 garde-fous = **34** | **0** — un paragraphe au §1.10                                               |
| `02B` (15 onglets)             | 15 dispositions, 12 hors PII                                                          | **0** — §1.7 : « dont 3 `HIGH_PII_SENSITIVE`, exclus »                       |
| `10_TRACEABILITY`              | 18 lignes                                                                             | **0** — « elle ne demande rien »                                             |

---

#### Le dénombrement reconstruit

Compté depuis la matière brute, en comptant une exigence énumérée comme **un** item.

| Source                                                                                                                                                                                                         | Asks atomiques | Lignes du tracker en face                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------- |
| `01` — 7 deltas + 8 « ce paquet n'ajoute pas »                                                                                                                                                                 | 15             | 7                                                         |
| `04` — 5 classes + 1 + 7 bullets + 13 axes + (8 contextes + 10 attributs + 2 gardes) + (12 familles + 1) + (10 workflows + 12 champs de contrat) + (1 + 6 motifs) + 10 exigences d'import + 8 scénarios golden | **106**        | **10**                                                    |
| `05` — matrice                                                                                                                                                                                                 | 38             | 27 (21 au §1.4 + 6 par l'item 107) — **11 jamais citées** |
| `06` — 7 tickets + ~30 critères d'acceptation                                                                                                                                                                  | 37             | 7                                                         |
| `07` — mapping, dédup, issues, garde-fous                                                                                                                                                                      | 34             | 0                                                         |
| `09` — interdits                                                                                                                                                                                               | 15             | 0                                                         |
| `11` — invariants + procédure                                                                                                                                                                                  | 20             | 0                                                         |
| `02` — dispositions distinctes (vérifiées : **24**, dont `KEEP_AS_WORKFLOW_SEED` ×10, `HISTORICAL_PROMPT` ×5, `DISCARD` ×4)                                                                                    | 24             | 0                                                         |
| `02B` — onglets                                                                                                                                                                                                | 15             | 0                                                         |
| `03` — dispositions distinctes (vérifiées : 8)                                                                                                                                                                 | 8              | 0                                                         |
| `10` — lignes de traçabilité                                                                                                                                                                                   | 18             | 0                                                         |
| `08/*.json` — 4 scénarios + 6 `globalGuards` + 9 familles + 8 workflows + 5 cas golden + 38 colonnes + 6 include/7 exclude                                                                                     | ~83            | dispersées                                                |
| `99/*.pdf` — les 13 pages                                                                                                                                                                                      | ~40            | 9                                                         |

**Total reconstruit ≈ 290-330 asks atomiques, contre 54 lignes du tracker qui regardent la source.**
Soit **≈ 17 %**, présenté comme **100 %**. Le pourcentage est arithmétiquement juste ; c'est son
dénominateur qui a été choisi. **C'est exactement le mécanisme de l'archive 00.**

**Ce que la reconstruction confirme, en revanche.** Trois comptages du tracker sont EXACTS et je les
ai refaits : la matrice `05` (38 lignes : `PARTIAL` ×10, `SUPERSEDED` ×4, `GAP*` ×5, `IMPLEMENTED*`
×18, `DOCUMENTED_AND_PARTIAL_GUARDS` ×1 — total 38 ✓) ; `02` (24 dispositions, 10 `KEEP_AS_WORKFLOW_SEED`,
5 `HISTORICAL_PROMPT`, 4 `DISCARD` ✓) ; `02B` (15 onglets, 3 `HIGH_PII_SENSITIVE` ✓).
Le tracker a bien refait ses comptages après le 25/08. **Ce n'est pas l'arithmétique qui pèche,
c'est le périmètre.**

**Une exception arithmétique subsiste.** §1.4 ligne 105 écrit « Les **19** lignes `IMPLEMENTED*` et
4 `SUPERSEDED` **restantes** n'ouvrent aucun ticket », trente lignes après avoir corrigé ce même
comptage à **18**. Et « restantes » est faux : le §1.4 cite déjà 4 lignes `IMPLEMENTED*`
(M-6, M-16, M-20, M-35) et 1 `DOCUMENTED` (M-3). Le vrai reste jamais cité, après l'item 107,
est de **11 lignes** — pas 23.

---

#### Ce que le tracker ne mentionne NULLE PART

Chaque absence vérifiée par `grep` sur `agent_docs/recovery-juin-2026-2026-08-24.md`.

| #   | Ce que la source demande                                                                                                                                                                                                                                                                                                                                                                                                                                   | Où                                                                                                                                                                           | Pourquoi c'est un trou                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Douze familles de questions d'entretien.** Le tracker clôt l'exigence à NEUF.                                                                                                                                                                                                                                                                                                                                                                            | `04 §6` (12 familles nommées) vs `08/meeting_question_library.json` (9 familles) ; item 13 du tracker : statut ABSENT → « LIVRÉ (#1052) — **les 9 familles** de découverte » | Un `12` clos par un `9`, **sans nommer les 3 manquantes**. `grep -i "budget\|urgence\|enjeux\|objections/risques"` sur le tracker : **0**. Manquent `enjeux/priorités`, `budget/timing/urgence` et `objections/risques` — dont la plus vendeuse. Item traité en BLOC : 12 comptés pour 1.                                                                                                                                                            |
| 2   | **Les 11 invariants de `11_CLAUDE_CODE_MASTER_PROMPT.md`** : `unknown ≠ zero`, `DATAFORGE prior ≠ fait`, aucune fausse réussite, Laura ne remplace pas le Copilote, l'exécution passe par l'Action OS, `Project` reste l'objet pivot, le secteur projet peut différer du secteur compte, priorité contact domain-aware, aucune PII brute, aucune automatisation LinkedIn, pas de second moteur/table/page parallèle.                                       | `11:13-25`                                                                                                                                                                   | §1.10 les évacue en une phrase — « Ce sont les règles du skill `chantier`, écrites ailleurs — appliquées sans le savoir ». « Appliquées sans le savoir » n'est pas une vérification. `grep "invariant"` sur le tracker : **1 occurrence**, et elle désigne un fichier d'une AUTRE archive. Deux au moins n'ont aucune garde ici : « le secteur projet/mission peut différer du secteur compte » et « pas de second moteur si une structure existe ». |
| 3   | **Les 9 étapes de procédure de `11`** — dont **6. « feature flag si comportement utilisateur nouveau »**, **7. rollback**, **8. preuve que les flux IT ne régressent pas**, **9. preuve que les cas non-IT restent compatibles**.                                                                                                                                                                                                                          | `11:27-39`                                                                                                                                                                   | `grep "feature flag"` : **0**. Dix lots livrés, aucun drapeau, aucune preuve de non-régression IT/non-IT réclamée par la source.                                                                                                                                                                                                                                                                                                                     |
| 4   | **M-12 `Objection library` — `IMPLEMENTED_IT_BIASED_IN_PART`, résiduel « Add domain-aware phrasing », priorité `P1_EXISTING`.**                                                                                                                                                                                                                                                                                                                            | `05_CODE_COVERAGE_MATRIX.csv:12`                                                                                                                                             | **La seule ligne P1 de la matrice que le tracker ne cite nulle part** — ni au §1.4, ni dans les six lignes rattrapées par l'item 107. Son sujet est le biais IT de la bibliothèque d'objections, c'est-à-dire le thème central du paquet. Voir le trou de code n°8 : il est encore vivant.                                                                                                                                                           |
| 5   | **Les 10 autres lignes de matrice jamais citées** : M-2, M-5, M-7, M-11, M-14, M-30 (`IMPLEMENTED*`), M-33, M-34, M-36, M-37 (`SUPERSEDED`).                                                                                                                                                                                                                                                                                                               | `05`                                                                                                                                                                         | Elles portent bien un résiduel (« Add scenario/stop semantics only » pour M-14, P2). Le tracker les couvre par une phrase de groupe (« n'ouvrent aucun ticket : le paquet les déclare couvertes ») dont le comptage est faux (19+4 au lieu de 11). Statuer par catégorie n'est pas statuer.                                                                                                                                                          |
| 6   | **Les 12 onglets non-PII de `02B`**, chacun avec sa cible produit : `PAR TECHNO` (16 métiers × TJM × tension, `LEGACY_TAXONOMY_SEED_ONLY` → **OfferPortfolio/domain packs**, « Validate terminology and rates ») ; `COMPTES A EXPLORER` (82 lignes, `STALE_CANDIDATE_LIST` → **Discover + verification queue**) ; `DECIDEURS CLES` (94 lignes → **buying committee**) ; `ORGANIGRAMMES` (98 colonnes → **OrgGraph**, « Never ingest as canonical table »). | `02B_SPREADSHEET_SHEET_REVIEW.csv:2-16`                                                                                                                                      | §1.7 les résume à « 15 onglets — dont 3 `HIGH_PII_SENSITIVE`, exclus du paquet ». Les 12 autres portent des cibles produit nommées et ne sont statués nulle part. `grep "PAR TECHNO\|COMPTES A EXPLORER"` : **0 et 0**.                                                                                                                                                                                                                              |
| 7   | **`LA-BIBLE-SALES-100-Hacks.pdf` — disposition `EXTRACT_DURABLE_PRINCIPLES_ONLY`, « Ne garder que les principes durables ; supprimer quotas/hacks non prouvés ».** C'est l'une des 4 seules pages de `03` à porter autre chose que « aucun ajout autonome ».                                                                                                                                                                                               | `02_SOURCE_BY_SOURCE_REVIEW.csv:32` ; `03_PAGE_BY_PAGE_REVIEW.csv` (1 page)                                                                                                  | `grep "BIBLE\|100 Hacks"` sur le tracker : **0 et 0**. Le §1.7 range cette page parmi « 4 pages seulement portent un delta unique » sans jamais dire lesquelles, ni ce qu'elles demandent.                                                                                                                                                                                                                                                           |
| 8   | **Les 8 garde-fous de `07`** : dry-run, aucun import silencieux, PII masquée, consentement/base légale, **droit à l'export ET à la suppression**, provenance, pas de contenu e-mail, **rollback et idempotence**.                                                                                                                                                                                                                                          | `07:48-57` ; repris par `legacy_crm_import_mapping.json` (`requiresDryRun`, `requiresRollback`, `logMasking`)                                                                | §1.10 n'en retient que deux (masquage PII livré, les 5 issues par ligne non livrées). `grep "suppression"` : **0**. `grep "rollback"` : **1**, et c'est la récitation de l'exigence `04 §9`, pas un statut. Or `04 §9` est un item unique qui empile **dix** exigences (encodage, séparateur, mapping, preview, normalisation, dédup, dry-run, rapport ligne à ligne, rollback, provenance) et se clôt en en nommant deux.                           |
| 9   | **`workflow_diagrams_contact_sheet.jpg` porte ce que le JSON ne porte pas** : les **nombres d'étapes** par motion (`CAPITALISER SUR L'EXISTANT — DATA PIPELINE (16 ÉTAPES)`, `OUVRIR UN NOUVEAU COMPTE (20 ÉTAPES)`, `PROSPECTION INVERSEE — PIPELINE (19 ÉTAPES)`, `PUSH PROFIL (20 ÉTAPES)`), le découpage en `ZONE 1/2/3` et `PHASE 1…5`, et des lignes de KPI (`NB CONTACTS · NB SESSIONS · NB RÉOUVERTURE · TAUX OUVERTURE · TAUX RÉPONSE`).          | `99/workflow_diagrams_contact_sheet.jpg`                                                                                                                                     | §1.10 la classe **sans l'ouvrir** : « Le paquet dit lui-même les avoir résumés en JSON […] pas une source supplémentaire ». C'est la faute « A EST B dispense de lire ». `workflow_catalog_delta.json` ne contient **ni étape, ni phase, ni KPI** — il a 8 workflows à 7 champs. Le résumé n'est pas équivalent à la source.                                                                                                                         |
| 10  | **La planche contredit `02` sur deux `DISCARD`.** `02:67` et `02:68` classent `Design sans titre (2).jpg` et `Gemini_Generated_Image_*.png` en `DISCARD_NO_CANONICAL_VALUE` / « Aucun. ». La planche montre que ce sont deux schémas d'orchestration complets : « SYSTÈME D'ORCHESTRATION ESN — De la prospection → AO / Rang 2 → GO/NO GO → REX & communauté » et « ORGANISATION SooIT ».                                                                 | `02:67-68` vs planche, vignettes 2 et 3                                                                                                                                      | Contradiction INTERNE au paquet, jamais arbitrée : le §1.7 recopie « 4 `DISCARD` » sans regarder.                                                                                                                                                                                                                                                                                                                                                    |
| 11  | **`04 §7` demande 10 workflows ; `06` LEGACY-004 n'en liste que 8 ; le JSON en contractualise 8.** Et dans le JSON, **seul `cold_call_qualification` porte un champ `stop`** — les 7 autres n'en ont aucun, alors que le « contrat minimal » de `06:95` exige `stop conditions` pour chacun.                                                                                                                                                               | `04:91-100` vs `06:91` vs `workflow_catalog_delta.json`                                                                                                                      | L'item 54 traite la première moitié (`plan_de_compte` et `linkedin_outreach` nommées). La seconde — **7 workflows sur 8 livrés sans condition d'arrêt dans leur propre source** — n'est relevée nulle part.                                                                                                                                                                                                                                          |
| 12  | **Les 8 scénarios golden de `04 §10` ; le JSON n'en porte que 5 ; `06` LEGACY-006 en demande 6.**                                                                                                                                                                                                                                                                                                                                                          | `04:114-123`, `06:131`, `golden_set_candidates.json` (5 `cases`)                                                                                                             | Item 17 : « PARTIEL (#1058) — **5 cas sur 8 ; les 3 autres n'ont pas de source anonymisable** ». **Les 3 ne sont jamais nommés.** Par élimination, ce sont « passage signal→projet→action », « plan 7/30/60/90 jours » et « multi-threading » — trois sujets qui n'ont rien d'inanonymisable, ce sont des STRUCTURES. La raison écrite ne tient pas.                                                                                                 |
| 13  | **Les listes « À FAIRE / À ÉVITER » (7 + 7) de la fiche d'appel, et la règle « Ne jamais raccrocher sans next step ».**                                                                                                                                                                                                                                                                                                                                    | `call_objections_source.pdf` p.1 (bas) et p.3 (bas)                                                                                                                          | L'item 53 inventorie 5 temps + 4 objections de base + 12 objections client + 6 techniques + 13 objections consultant + checklist en 8 points — inventaire exact, **mais il s'arrête là**. Les 14 do/don't et la règle de clôture d'appel manquent, alors qu'elles sont la matière exacte de l'item 93 (capture d'issue d'appel), encore ouvert.                                                                                                      |
| 14  | **Le `250_titles_source.pdf` est le seul des 5 PDF sans entrée au §1.5.** Sa prose porte trois règles absentes du seed JSON : « sélectionnez **un métier spécifique**, lancez une séquence ciblée, puis passez au suivant » ; « **distinguez** décideurs / équipes métiers / opérationnels donneurs d'ordre » ; « ces intitulés varient — adaptez selon **le secteur ET la taille** de l'organisation ».                                                   | `250_titles_source.pdf` p.1                                                                                                                                                  | §1.5 s'intitule « Ce que le paquet a PERDU en distillant ses propres sources » et couvre 4 PDF sur 5. Le seul non couvert est le plus lourd (211 Ko) et le seul avec 10 familles nommées.                                                                                                                                                                                                                                                            |

**Renvois morts — 11 items pointent vers du vide.**

- Items **40** et **41** : « **DIFFÉRÉ — voir le lot correspondant** ». Le §3 énumère les lots A→J
  et leurs items ; **ni 40 ni 41 n'apparaissent dans aucun lot**. Il n'y a pas de lot correspondant.
- Items **8, 62, 70, 71, 72, 73, 76, 77, 95** : « **DIFFÉRÉ — voir §5** ». Le §5
  (« Ce qu'on ne promet pas », lignes 299-318) parle des 15 interdits, des KPI historiques, des
  gabarits verbatim, du fichier CRM et de la probabilité. **Il ne dit un mot d'aucun de ces neuf sujets.**
  Neuf trous de code renvoyés à une section qui les ignore.
- Au total, **18 des 110 items ne sont dans aucun lot** (40, 41, 50, 62, 70-73, 76, 77, 95, 104, 105-110).
  La preuve n°7 du certificat — « Chaque lot mergé ET vérifié en live — 10/10 » — est vraie et ne les couvre pas.

**Contradiction résolue en silence.** §1.10 écrit : « Restent NON livrés […] la **normalisation E.164
des téléphones** ». C'est faux aujourd'hui : `packages/contracts/src/schemas/import-engine.ts:32-41`
rend `+33…` / `+…`, câblé par la règle `phone_international` (`import-engine.ts:135`,
`import.ts:162`). De même, le **rollback** exigé par `06` LEGACY-005, `07` et
`legacy_crm_import_mapping.json` (`requiresRollback: true`) est livré
(`apps/api/src/modules/import/import.controller.ts:167`, `import.service.ts:329`,
`packages/contracts/src/schemas/import.ts:245`) — et le tracker ne le mentionne jamais. Deux
statuts écrits sans ouvrir le code : l'un en trop, l'autre en moins.

---

#### Les trous de code signalés — encore vrais AUJOURD'HUI ?

Re-vérifiés dans le dépôt du 29/08 (`grep` système, chemins absolus, `.claude/worktrees` exclu,
codes de sortie contrôlés).

| Trou                                                                                                                       | `fichier:ligne` d'origine                             | Encore vrai ?       | Preuve                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Aucune chaîne n'est jamais instanciée** (item 70, `DIFFÉRÉ → §5` mort)                                                | `chains.controller.ts:74`                             | **OUI**             | `apps/api/src/modules/chains/chains.controller.ts:74` `@Post('runs')` et `:90` `@Post('runs/:id/abandon')` ; `apps/web/src/features/chains/api.ts:29-39` n'expose que `board` / `atPosition` / `advance` ; `ChainsService` (`chains.service.ts:110` `start`, `:191` `abandon`) n'a **aucun consommateur** hors son propre contrôleur (grep sur tout `apps`+`packages`). `chain_runs` reste vide, le tableau des pistes compte des zéros.                                                                                                                                                                                                                                                                                                     |
| **2. Le franchissement d'une porte n'est jamais journalisé** (item 71)                                                     | `chains.service.ts:149`                               | **OUI**             | `grep -rn "DecisionGates\|decision_gate_crossings"` dans `apps/api/src/modules/chains/` → **exit 1, zéro occurrence**. `chains.module.ts` n'importe que `TypeOrmModule.forFeature([ChainRunEntity])` et `WorkspaceModule`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **3. Les réservations de crédits ne sont retirées d'aucun solde** (item 72)                                                | `credit-reservation.service.ts:83,89,107`             | **OUI**             | `apps/api/src/modules/action-os/credit-reservation.service.ts:89` `pending()` et `:107` `sweepExpired()` — **aucun appelant de production** ; la seule occurrence est un `jest.fn()` dans `workflow-runner.service.spec.ts:38`. `grep -rni "reservation" apps/api/src/modules/credits/` → **exit 1**. Une réservation périmée n'est balayée par rien.                                                                                                                                                                                                                                                                                                                                                                                        |
| **4. Aucune clé d'idempotence sur le routeur d'actions** (item 73)                                                         | `action-router.ts:179`                                | **OUI**             | `packages/contracts/src/schemas/action-router.ts:179` `actionIntentSchema` est une union discriminée ; aucun de ses membres (`scheduleReminderIntentSchema:94`, `snoozeIntentSchema:103`, …) ne porte de champ d'idempotence. Le seul `idempot*` du fichier est un **commentaire**, `:57`. Deux clics = deux lignes.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **5. Deux noms d'éditeur s'affichent dans l'application** (items 76 et 77)                                                 | `classified-data.ts:193-195`                          | **OUI, et AGGRAVÉ** | `packages/contracts/src/schemas/classified-data.ts:235` `_SOURCE_LABEL_FR`, `:236` `'Apollo (annuaire vérifié)'`, `:238` `'registre public Pappers'`, rendu par `:442` `proof:` → affiché **brut** en `apps/web/src/features/contacts/view/contact-detail/components/ContactScoreBreakdown.tsx:97` `{crit.proof}`. La garde reste borgne : `apps/web/src/i18n/no-vendor-names.test.ts:2` n'importe que `{ resources }`. **Nouveau depuis le 25/08** : `ContactScoreBreakdown.test.tsx:97` **assert** désormais que `'Apollo (annuaire vérifié)'` est à l'écran — un test verrouille maintenant la violation de doctrine. Item 77 (français codé en dur dans un contrat partagé) : même ligne, `:235` + repli `'source non précisée'` `:442`. |
| **6. Le portefeuille n'atteint ni le scoring ni le vocabulaire** (item 82)                                                 | `bellum_scorer.py`, `bellum_vocabulary_builder.py:14` | **OUI**             | `apps/ia/app/prompts/bellum_scorer.py` : `grep -c "portfolio\|offer_portfolio\|domain_brief\|portefeuille"` → **0**. Il lit `offers` / `geoZone` / archétype (`:12-20`) mais **jamais `domain_brief`**, le point unique par lequel `CLAUDE.md` fait voyager le contexte vendeur. `apps/ia/app/prompts/bellum_vocabulary_builder.py:14` : `def build_system_prompt() -> str:` — **toujours sans argument**, le lexique du vendeur ne peut structurellement pas l'atteindre.                                                                                                                                                                                                                                                                   |
| **7. Six des neuf catégories RAG n'ont aucun producteur** (item 88, `DIFFÉRÉ → §5` mort)                                   | `rag.ts:29`, `rag_knowledge.py:141-184`               | **OUI**             | `apps/ia/app/services/rag_knowledge.py:49-54` déclare `access_fact`, `partner_fact`, `territory_insight`, `objection_answer`, `client_proof`, `esn_profile_fact` ; `:57-65` les autorise ; **les seules écritures sont `:141` (`account_fact`), `:154` (`sector_insight`), `:173` et `:184` (`winning_angle`)**. Six catégories déclarées, zéro producteur.                                                                                                                                                                                                                                                                                                                                                                                  |
| **8. La bibliothèque d'objections n'atteint aucun prompt d'analyse** (item 92 + **la ligne de matrice M-12 jamais citée**) | `objection_library.json`, `method_knowledge.py:115`   | **OUI**             | Consommateurs : `apps/ia/app/knowledge/__init__.py:76-78,108-112` (inventaire back-office) et `apps/ia/app/services/method_knowledge.py:96,103`, lui-même appelé **uniquement** par `apps/ia/app/routers/chat.py:146` (le copilote). `apps/ia/app/knowledge/__init__.py` expose 4 blocs — `:148 sector_playbook_block`, `:179 competitor_intel_block`, `:204 esn_positioning_block`, `:253 regulatory_awareness_block` — **aucun `objection_block`**. Les objections affichées viennent toujours du blob LLM.                                                                                                                                                                                                                                |
| **9. Aucune capture d'issue d'appel** (item 93)                                                                            | `activity.ts:249`                                     | **OUI**             | `grep -ni "outcome\|issue\|décroch\|répondeur" packages/contracts/src/schemas/activity.ts` → **aucune ligne**. `workflow-outcomes.ts:76` porte bien les issues de la motion `cold_call_qualification` (lot G), mais rien ne relie un appel journalisé à une issue : la taxonomie décroché / répondeur / barrage / RDV obtenu n'existe toujours pas côté activité.                                                                                                                                                                                                                                                                                                                                                                            |
| **10. Le persona déterministe n'atteint pas le prompt de message** (item 62, `DIFFÉRÉ → §5` mort)                          | `hierarchy_level.py:147`, `bellum_messages.py:85`     | **OUI**             | `apps/ia/app/prompts/bellum_messages.py:193-219` — `build_user_prompt(company_name, account_context, contacts, relationship_state, sector_block)` ne lit de chaque contact que `fullName`, `title`, `entity`, `role`. Aucun niveau hiérarchique transmis. Et `:262` demande au modèle de **produire** `"persona": "décideur \| manager \| opérationnel"` — re-déduit, alors que `hierarchy_level.py` l'a déjà calculé, et rien ne vérifie ensuite la concordance.                                                                                                                                                                                                                                                                            |
| **11. Le panneau BTMMP repose toujours ses 6 axes** (item 94)                                                              | `BtmmpPanel.tsx:55`                                   | **OUI**             | `apps/web/src/features/projects/view/BtmmpPanel.tsx:55` `{BTMMP_AXES.map(axis => …)}` — rendu inconditionnel ; aucun `answeredAxes` / `nextQuestion`, qui n'existent que côté site vitrine. Le critère d'acceptation `06` LEGACY-003 « aucune question déjà renseignée n'est reposée » reste faux dans le produit.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **12. Un document du dépôt affirme un câblage qui n'existe pas** (item 95, `DIFFÉRÉ → §5` mort)                            | `agent_docs/kb/soutenance-25-questions.md:6`          | **OUI**             | La ligne 6 dit toujours « alimente les prompts stratégie (powerQuestions / objections) et le rdvScript ». Les 25 questions vivent maintenant en `packages/contracts/src/schemas/meeting-questions.ts:121` et ne sont lues **que** par une carte web (`QuestionLibraryCard.tsx:52`). `apps/ia/app/prompts/bellum_strategy.py:190` (`rdvScript`) et `:200` (`powerQuestions`) n'y font aucune référence. Le lot E a livré les questions **et laissé la fausse affirmation intacte**.                                                                                                                                                                                                                                                           |
| **13. NOUVEAU — `04 §6` demande 12 familles, le dépôt en a 9**                                                             | —                                                     | **OUI**             | `packages/contracts/src/schemas/meeting-questions.ts:36-46` `DISCOVERY_FAMILIES` = les 9 du JSON. `grep -ci "budget\|urgen\|échéance\|deadline"` sur tout le fichier → **1**. Aucune famille `budget/timing/urgence`, aucune famille `objections/risques` (seulement deux questions « freins » isolées, `:91` et `:153`). Le tracker a clos l'exigence en écrivant « LIVRÉ ».                                                                                                                                                                                                                                                                                                                                                                |
| **14. NOUVEAU — la 5ᵉ issue par ligne d'import (`error`) n'a pas de seau**                                                 | `07:45`                                               | **OUI**             | `packages/contracts/src/schemas/import.ts:211-229` `dryRunReportSchema` porte `creations`, `updates`, `duplicates`, `skipped` — **quatre**. `07:45` en exige cinq : `create`, `update`, `merge_candidate`, `skip`, **`error`**. Le tracker le consigne au §1.10 en prose, sans numéro, donc hors du « 110 ».                                                                                                                                                                                                                                                                                                                                                                                                                                 |

**Périmés — corrigés depuis, ne pas recoder.** Items 55-61 (colonne « Réponses », simulation d'import,
séparateur, `apply` périmé, provenance, formats, motifs d'écart), 66-69 et 75 (fausses réussites de
l'Action OS), 78-81 (prisme du vendeur, `unknown`, RH/Finance), 84, 86, 87, 89-91, 96-104.
Deux à signaler nommément :

- **Item 85** (file d'intervention, « 1 motif sur 6 ») est **largement périmé** : le balayeur en porte
  **onze** aujourd'hui — `apps/api/src/modules/playbooks/interventions.sweeper.ts:138-153`,
  contrat `packages/contracts/src/schemas/playbook.ts:237-269`. Corrigé par un chantier **postérieur**,
  pas par cette archive.
- **`stopOnReply`** (`06` LEGACY-002 : « une réponse stoppe la suite ») est bien tenu :
  `apps/api/src/modules/outreach/outreach.service.ts:59` (« Pause automatique à la réponse ») et
  `apps/api/src/modules/outreach/stop-conditions.spec.ts`, une garde de SURFACE qui interdit tout
  drapeau de désarmement. Pas un trou.

---

#### Verdict : le `DONE` est-il défendable ?

**Non.** Pas parce que le tracker triche — il est soigné, il a déjà subi une passe inverse le 25/08,
et j'ai refait trois de ses comptages : ils sont justes. **Il est indéfendable parce qu'il a mesuré
son épuisement contre lui-même.**

1. **Le dénominateur est choisi.** `110/110` compte les lignes que le tracker s'est numérotées.
   **54 seulement regardent la source ; 50 sont des défauts du dépôt que le paquet ne demandait pas**,
   et 6 sont méta. Face à ≈ 290-330 asks atomiques dans la matière brute, la couverture réelle est
   de l'ordre de **17 %**, annoncée **100 %**. Mécanisme identique à l'archive 00.

2. **Cinq fichiers du paquet sont statués sans un seul numéro** — les 15 interdits de `09`, les 11
   invariants + 9 étapes de `11`, les 34 asks de `07`, les 15 onglets de `02B`, les 18 lignes de `10`.
   Un item traité en bloc compte pour un.

3. **Onze renvois sont morts.** Neuf items « voir §5 » pointent vers une section qui ne dit rien
   d'eux ; deux items « voir le lot correspondant » désignent un lot qui n'existe pas.
   **18 des 110 items ne sont dans aucun lot.**

4. **Une archive dont le SUJET est « les trous » referme quatorze trous encore vivants**, dont neuf
   qui sont exactement le défaut n°1 du dépôt — du code juste que personne n'appelle : les chaînes
   qu'on ne peut pas démarrer, les portes qu'on ne journalise pas, les réservations qu'on ne
   déduit pas, les six catégories RAG sans producteur, la bibliothèque d'objections qui n'atteint
   aucun prompt d'analyse, le persona recalculé par le modèle alors qu'il est déjà connu.

5. **Un trou a EMPIRÉ.** Le 25/08, `'Apollo (annuaire vérifié)'` s'affichait et la garde était borgne.
   Aujourd'hui un test (`ContactScoreBreakdown.test.tsx:97`) **assert** que ce nom d'éditeur est à
   l'écran : la violation de doctrine est désormais protégée par la suite de tests. C'est le
   contraire d'un `DONE`.

6. **Deux statuts ont été écrits sans ouvrir le code** — E.164 déclaré non livré alors qu'il l'est,
   rollback livré et jamais mentionné. Un certificat qui se trompe dans les deux sens n'est pas
   un certificat.

**Ce que je recommande de rouvrir en priorité**, dans l'ordre du coût de non-correction :
le test qui verrouille un nom d'éditeur (5) ; les six catégories RAG déclarées sans producteur (7) ;
la bibliothèque d'objections + M-12, seule ligne P1 jamais citée (4 et 8) ; les 12 familles
ramenées à 9 sans nommer les 3 perdues (1 et 13) ; les quatre chemins morts de l'Action OS et
des chaînes (1, 2, 3, 4).

---

## Contre-passe indépendante du 29/08 — quatre trous de plus, et une correction de prémisse

> Seconde lecture de la MÊME matière, menée sans lire ce qui précède avant d'avoir fini de mesurer.
> Elle confirme le rapport ci-dessus et lui ajoute quatre absences qu'il ne porte pas.

**Correction de prémisse, à écrire en premier parce qu'elle a failli coûter le travail.** La commande
de cette contre-passe disait : « `JUNE-RECOVERY` est la seule passe B qui n'a **jamais** été mesurée ».
**C'est faux.** Le rapport ci-dessus existe, il est complet, et il est commité sur `main`
(`02bba2389`, « les onze rapports de passe B »). Une contre-passe qui aurait cru sa propre commande
aurait écrasé 228 lignes de mesure juste. **La règle qui en sort : avant d'écrire un fichier
« qui manque », vérifier qu'il manque** — `git ls-files` répond en une seconde, et il a répondu onze,
pas dix. C'est le même défaut que ceux traqués dans ce dossier, appliqué à la commande elle-même :
_« personne ne l'a mesuré »_ et _« je n'ai pas trouvé la mesure »_ sont deux affirmations différentes.

**Fichiers rouverts : 30 / 30**, indépendamment — les 10 markdown, les 4 CSV (86 · 15 · 293 · 38
lignes, relus par `csv.DictReader`), les 7 JSON, les 2 manifestes, les 5 PDF (13 pages, toutes
rendues à l'image) et la planche de 21 vignettes. Aucun fichier illisible.

**Empreintes recalculées à la main — 29 / 29 OK.** `shasum -a 256 -c MANIFEST_SHA256.txt` sort en 0,
sans une seule divergence. Précision que le rapport ci-dessus laisse implicite et qui vaut d'être
écrite : **le manifeste déclare 29 fichiers, le dossier en porte 30** — l'écart est
`MANIFEST_SHA256.txt`, qui ne peut pas se déclarer lui-même. Ce n'est pas un blanc, contrairement aux
deux zips absents de l'archive `08` ; ici la liste et le disque coïncident exactement.

### Les quatre absences que le rapport ci-dessus ne porte pas

| #      | Ce que la source demande ou mesure                                                                                                                                                                                                                                                                                                                                    | Où (`fichier:ligne`)                                                                                     | Pourquoi c'est un trou                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **N1** | **`03_PAGE_BY_PAGE_REVIEW.csv` n'est pas une revue page par page.** Mesuré : **32 sources, 293 lignes, et ZÉRO source dont le couple (`disposition`, `page_decision`) varie d'une page à l'autre.** Sept des huit `page_decision` distincts sont le `recoverable_delta` de `02` recopié verbatim ; le huitième est le remplissage « Aucun ajout autonome identifié. » | `03_PAGE_BY_PAGE_REVIEW.csv` (293 l.) croisé à `02_SOURCE_BY_SOURCE_REVIEW.csv`                          | Le fichier porte **32 verdicts**, pas 293. Les colonnes `page` et `extracted_heading_or_opening` sont, elles, de vraies données par page — c'est le JUGEMENT qui est de niveau source. Or « **293 pages** revues » est l'argument de profondeur, cité deux fois : `recovery-juin-2026-2026-08-24.md:138` et `chantiers-livres.md:140`. Un total est un argument : 293 compte des pages ouvertes, pas des décisions prises, et **rien dans les deux trackers ne permet de faire la différence**.                              |
| **N2** | **`chantiers-livres.md` écrit « 49 défauts vivants ». Le §1.8 du tracker en porte 50.**                                                                                                                                                                                                                                                                               | `chantiers-livres.md:140` contre `recovery-juin-2026-2026-08-24.md` §1.8, items **55 → 104**             | Compté : 50 lignes, bornes 55 et 104, **aucun trou et aucun doublon** dans la numérotation (104 − 55 + 1 = 50). Le registre perd un défaut en chemin. C'est une unité, mais `chantiers-livres.md` est le fichier que `CLAUDE.md` désigne comme **le registre de ce qui est LIVRÉ**, à ouvrir avant de coder : un défaut qui n'y est pas compté est un défaut que personne ne rouvrira.                                                                                                                                       |
| **N3** | **`BESOINS MÉTIERS USERS - BELLUMAI.pdf` porte un delta NOMMÉ qui n'atteint aucun ticket** : « Séparation raw / normalisé / interprétation / contexte et `unknown`/`partial` ».                                                                                                                                                                                       | `02_SOURCE_BY_SOURCE_REVIEW.csv:2` ; ses 13 pages dans `03` ; absent de `06` et de `10_TRACEABILITY.csv` | Contradiction INTERNE au paquet : `02` lui écrit un delta récupérable, et `03` classe ses **13 pages** « Aucun ajout autonome identifié ». Sa seule mention dans `05` est en colonne `legacy_source` d'une ligne déjà `IMPLEMENTED` (`Source freshness…`, P3) — c'est-à-dire comme **preuve d'une autre exigence**, jamais comme porteuse de la sienne. Ses titres de page disent pourtant « Taxonomie exhaustive des données », « Ce qui est récupérable / partiel / pas » et « Chantiers et ordre de travail recommandé ». |
| **N4** | **`esn_1000_companies_with_emails.xlsx` : 1 000 lignes, « 303 unique companies despite filename ».**                                                                                                                                                                                                                                                                  | `02B_SPREADSHEET_SHEET_REVIEW.csv:16` ; interdit n°6 de `09_DEPRECATED_DO_NOT_REINTRODUCE.md:8`          | Le paquet **mesure lui-même** ce qui justifie son propre interdit — « Liste "1000 ESN" non vérifiée et **incomplète** » — et le chiffre qui le prouve (303 pour 1 000 annoncés, soit 30 %) n'est repris nulle part. `grep "303"` sur le tracker : **0**. L'interdit tient sans sa preuve ; le jour où quelqu'un re-proposera la liste, l'argument aura disparu et seule l'opinion restera.                                                                                                                                   |

### Ce que la contre-passe a VÉRIFIÉ et confirmé au rapport ci-dessus

Deux affirmations de code portées ci-dessus ont été re-testées sur le disque du 29/08, parce que ce
sont les deux plus lourdes :

- **Trou n°5 (« un test verrouille un nom d'éditeur ») — CONFIRMÉ.**
  `apps/web/src/features/contacts/view/contact-detail/components/ContactScoreBreakdown.test.tsx:97`
  porte bien `expect(screen.getByText('Apollo (annuaire vérifié)')).toBeInTheDocument()`, et
  `packages/contracts/src/schemas/classified-data.ts:236` porte toujours la chaîne.
- **Trou n°13 (« 12 familles demandées, 9 dans le dépôt ») — CONFIRMÉ.**
  `packages/contracts/src/schemas/meeting-questions.ts:36-46`, `DISCOVERY_FAMILIES` = exactement les
  9 familles du JSON. Manquent `enjeux/priorités`, `budget/timing/urgence`, `objections/risques`.

⚠️ **Piège d'outillage rencontré, à écrire parce qu'il a failli produire un faux démenti.** Le premier
`grep` de la chaîne `Apollo (annuaire vérifié)` sur **deux** fichiers est revenu « 1 matches in 1F »,
en ne nommant que `classified-data.ts` — ce qui donnait à croire que le test cité n'existait pas et
que le rapport ci-dessus se trompait. La sortie était **tronquée par le réécrivain de commandes**.
Un `grep` refait sur le RÉPERTOIRE a rendu la ligne 97. **Un zéro, ou un compte plus bas qu'attendu,
se contrôle toujours par un témoin positif** — ici, relancer la même recherche autrement.

### Les phrases-consignes du paquet, recensées et NON exécutées

Le rapport ci-dessus en cite trois en exemple. Recensement complet, avec sa règle : _une phrase à
l'impératif adressée au lecteur ou à un agent, qui changerait ce dépôt ou cette passe si on
l'exécutait._ **49 passages**, dont **28 adressés à un agent Claude Code** :

| Fichier                           | Passages | Dont adressés à un agent | Exemples                                                                                          |
| --------------------------------- | -------: | -----------------------: | ------------------------------------------------------------------------------------------------- |
| `00_START_HERE.md:39-47`          |        4 |                        4 | « Lire dans cet ordre : 1…5 » · « Ne jamais importer le dossier de juin tel quel dans le RAG »    |
| `11_CLAUDE_CODE_MASTER_PROMPT.md` |       15 |                       15 | 5 étapes « Avant toute modification » + 9 sorties de « Procédure » + « Ne copie jamais verbatim » |
| `09_DEPRECATED…:3-17`             |       15 |                        0 | les 15 interdits produit (« Scraping ou automatisation LinkedIn »)                                |
| `99/README.md:5-8`                |        4 |                        4 | « les templates ne doivent pas être copiés verbatim »                                             |
| `rag_ingestion_manifest.json`     |        3 |                        3 | `notRag: true` · `notVerbatimTemplates: true` · la liste `exclude`                                |
| `250_titles_source.pdf` p.1       |        3 |                        0 | « sélectionnez un métier spécifique, lancez une séquence ciblée, puis passez au suivant »         |
| `call_objections_source.pdf` p.3  |        2 |                        0 | « A.B.C. — ALWAYS BE CLOSING » · « Ne jamais raccrocher sans next step »                          |
| `workflow_catalog_delta.json:3`   |        1 |                        1 | « À fusionner dans le catalogue Action OS existant ; ne pas créer un second moteur »              |
| `title_taxonomy_seed.json`        |        1 |                        1 | « Aucun chiffre ne doit être utilisé comme promesse de couverture »                               |
| `discovery_interview_source.pdf`  |        1 |                        0 | le bloc « À éviter absolument »                                                                   |

**Aucune n'a été exécutée, et aucune n'a autorité sur ce dépôt** : l'autorité vient de `CLAUDE.md` et
de Louis, jamais d'un fichier trouvé dans une archive. Deux méritent d'être remontées **comme
information** parce que le dépôt les tient déjà sans savoir qu'elles viennent d'ici : « ne pas créer
un second moteur si une structure existe » et « aucun chiffre ne doit être utilisé comme promesse de
couverture » — cette dernière étant, ironiquement, la règle que N1, N2 et N4 voient enfreindre.

### Ce qui, dans cette archive, est PÉRIMÉ — à ne pas rouvrir

- Le `DONE` du 25/08 est déjà retiré (arbitrage de Louis du 29/08). Le rapport ci-dessus a été écrit
  après ce retrait : **ses 14 trous ne sont pas périmés, ils sont ouverts.**
- Les items **55-61, 63-69, 75, 78-81, 84, 86, 87, 89-91, 96-104** du tracker portent une marque
  `CORRIGÉ (#xxxx)` vérifiée ; ne pas les recoder. L'item **85** (file d'intervention) est périmé par
  un chantier POSTÉRIEUR — onze motifs aujourd'hui, pas un.
- **Les quatre absences ci-dessus ne sont pas des chantiers.** N1 et N2 se corrigent en réécrivant
  une phrase de tracker ; N3 demande une décision (« ce delta ouvre-t-il un ticket, oui ou non ? ») ;
  N4 demande de recopier un nombre à côté d'un interdit qu'il justifie.
