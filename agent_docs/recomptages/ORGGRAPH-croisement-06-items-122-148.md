# OrgGraph — croisement 06 : items 122 à 148 (§10 planner/coût, §11 red team)

> **Mode lecture seule.** Aucun code écrit, aucun fichier existant modifié. Vérifié contre le code
> réel de `origin/main` (`deaff12e0`), pas contre les affirmations des sources — l'auteur du FINAL
> avoue lui-même un audit **statique et non exécuté** (FINAL l.73-75).
> Périmètre : `agent_docs/recomptages/ORGGRAPH-inventaire.md` lignes 122-148 — §10 (122-134) et
> §11 (135-148), 27 items.
> Déjà lu avant ce travail : `agent_docs/orggraph-final-2026-08-29.md`,
> `agent_docs/orggraph-inventaire-existant-2026-08-30.md`, `agent_docs/orggraph-contradictions-2026-08-30.md`
> — ce document ne répète pas leurs preuves, il les **recite** quand elles couvrent un de mes items,
> et il **vérifie indépendamment** tout le reste (planner de coût, 14 scénarios).

---

#### Le compte

| Statut         | Nombre | Items                                                                      |
| -------------- | ------ | -------------------------------------------------------------------------- |
| **LIVRÉ**      | 4      | 130, 136, 138, 144                                                         |
| **PARTIEL**    | 6      | 124, 127, 135, 141, 145, 146                                               |
| **ABSENT**     | 14     | 122, 123, 125, 126, 128, 129, 131, 132, 133, 134, 137, 140, 147, 148       |
| **NON PROUVÉ** | 3      | 139, 142, 143                                                              |
| **Total**      | **27** | 4 + 6 + 14 + 3 = 27 ✓ (122→148 sans trou ni doublon, vérifié par comptage) |

§10 (122-134, 13 items) : 1 LIVRÉ · 2 PARTIEL · 10 ABSENT.
§11 (135-148, 14 items) : 3 LIVRÉ · 4 PARTIEL · 4 ABSENT · 3 NON PROUVÉ.

**Le fait qui résume le §10** : le « Coverage Planner » du FINAL §11 (sélection intelligente,
4 cibles de ciblage, coût annoncé avant confirmation, job persistant reprenable) **n'existe nulle
part**. Ce qui existe est un bouton unique (« Enrichir l'organigramme ») qui relance la phase 3 sur
**tous** les contacts déjà connus, de façon synchrone, sans job, sans sélection, sans coût annoncé.
Confirmé indépendamment par l'audit du 30/08 (`orggraph-inventaire-existant-2026-08-30.md` l.115 :
« Planificateur d'enrichissement : introuvable, toujours à faire »).

---

#### Les 14 scénarios de red team, un par un : ce que le produit fait AUJOURD'HUI

**135 — Compte à 2 000-10 000 contacts.** Le produit **tient la moitié** : la base de contacts
supporte le volume sans jamais tout charger — `useContactsListData.ts:21-31` (`useInfiniteQuery`,
pagination serveur, `dedupePages`/`totalItems`) — et « Voir tous les contacts » y renvoie. Mais
**l'arbre focal, lui, ne connaît aucune borne** : `FocalOrgView.tsx:363-378` et `:520-522` rendent
`row.people.map(...)` sans `slice`. Sur un compte à 2 241 contacts avec, disons, 400 personnes dans
la vague enrichie, l'arbre les dessinerait **toutes** — le seul repère de taille du fichier est
`TOP_CONTACTS = 10` (`:637`), qui borne le TABLEAU du bas, pas l'arbre. Aucune bibliothèque de
virtualisation (`react-virtual`, `react-window`, `Virtuoso`) n'existe dans `apps/web` (recherche
répertoire entier, zéro résultat, confirmée par un témoin positif sur `useContactsListData.ts`
qui, lui, gère le volume autrement).

**136 — Blob OrgGraph gigantesque.** Le produit **tient** : `org-graph.ts:432-436` documente et le
schéma applique que `people[]` est une PROJECTION, jamais une copie des 2 241 fiches — la base
Contacts reste le corpus canonique. `org_graph_assembler.py:603-611` ne construit des nœuds qu'à
partir de la vague passée en paramètre ; le corpus complet (`discovered_contacts`) ne sert qu'à
COMPTER. La normalisation en tables `org_*` (annoncée « si le volume le justifie ») n'est pas
faite — et c'est correct, aucun signal ne dit que le seuil est atteint.

**137 — Organisation matricielle.** Le produit **ne tient pas** : aucune distinction `direct` vs
`functional` n'existe. `orgHierarchyEdgeSchema` ne porte qu'un type unique de relation
(`reports_to`/`member_of`), sans second axe « fonctionnel ». La seule notion de « ligne pointillée »
trouvée (`org_resolver.py:135`, `orgGraphData.ts:32`) code la CONFIANCE (vérifié vs probable), pas
la NATURE du rattachement (hiérarchique vs fonctionnel). Un contact avec un double rattachement
(rapporte à son manager direct ET, en pointillé, à un CTO groupe) n'a aucune façon de s'exprimer
dans le contrat aujourd'hui.

**138 — Cross-entity reporting.** Le produit **tient** — et c'est la partie la mieux vérifiée de ce
lot, parce qu'un autre agent l'a déjà éprouvée PAR EXÉCUTION le 29-30/08. Le resolver refuse par
défaut : une preuve doit ÉTAYER la relation qu'elle prétend prouver (`_CLAIMS_BACKING`,
`org_graph_assembler.py:188`) via `_honour_claims` (`:207`), et une preuve d'IDENTITÉ ne peut plus
créer une ligne `reports_to` (le P0 du chantier). Mesuré en réintroduisant volontairement le bug :
0 ligne hiérarchique fausse produite (`orggraph-final-2026-08-29.md` §4bis).

**139 — Homonymes.** Le produit **encode la règle mais personne n'y accède**. Le contrat interdit
structurellement une correction par nom seul : `objectId` est toujours un id, jamais un nom
(`org-graph-correction.ts:183-186`, commentaire « Toujours un id — jamais un nom »). Mais le
service et le contrôleur qui portent cette règle (`OrgGraphCorrectionService`,
`OrgGraphController`) ont **zéro appelant côté front** — confirmé par recherche exhaustive
(`grep -rn "org-graph" apps/web/src` → 0, `grep -rn "expectedGraphVersion" apps/web e2e` → 0,
audit du 30/08 §3.2). Si un homonyme se présente aujourd'hui, aucun écran ne permet de le corriger
du tout — ni bien, ni mal.

**140 — M&A / BU renommée.** Le produit **ne tient pas** : `orgEntitySchema`
(`org-graph.ts:182-191`) porte `id/name/type/parentId/country/status/sources/confidence` — aucun
champ d'alias, aucune trace d'ancien nom, aucun mécanisme empêchant d'écraser un rattachement
existant lors d'une fusion. Recherche exhaustive (`alias`, `former_name`, `renamed` liés à
org-graph) : zéro résultat pertinent.

**141 — Ex-employé.** Le produit **tient, autrement que ce que le texte nomme**. Il n'y a pas de
`validTo` sur une `hierarchyEdge` (zéro résultat, `org-graph.ts`), mais il existe un état
`lifecycle_state = 'historique'` sur le CONTACT, posé quand `employerMismatch` est vrai
(`contact-score.ts:212`, signal Apollo `sourceTag === 'RISQUE'`) : `getCurrentOrgContacts`
(`organigrammeData.ts:78-79`) le retire de l'arbre courant, et le docblock au-dessus
(`organigrammeData.ts:73-75`) confirme qu'il « reste visible sur l'onglet Contacts, avec son badge
d'état ». Le comportement demandé (absent du courant, visible ailleurs) est là ; ce qui manque est
la partie TEMPORELLE — pas de date de départ, pas d'historique daté de la relation, juste un booléen
d'état courant.

**142 — Deux corrections simultanées.** Le produit **encode le mécanisme mais personne n'y
accède**. Verrouillage optimiste et diff sont réels et testés :
`expectedGraphVersion` obligatoire (`org-graph-correction.ts` — un payload qui l'omet est rejeté
avant la base), 409 avec `diffSummary` sur conflit
(`org-graph-correction.service.ts:103-104, 405-424`). Même défaut d'accès que 139 : zéro caller
front.

**143 — Mauvaise correction utilisateur.** Le produit **encode le retrait, pas la contradiction, et
personne n'y accède**. `revertCorrection` existe et fonctionne (`org-graph-correction.service.ts:175-259`,
trace `reverted_at`, l'annulation dépose sa propre ligne plutôt que d'effacer). Je n'ai pas trouvé de
mécanisme séparé de « contradiction signalée » (un signal explicite quand une nouvelle analyse
contredirait une correction humaine gardée prioritaire) — et de toute façon, sans caller, la question
ne se pose pas en production aujourd'hui.

**144 — Blocker hiérarchiquement central.** Le produit **tient**, avec une nuance trouvée en
vérifiant. `ROLE_ORDER.blocker = Number.POSITIVE_INFINITY` (`org-graph-path.ts:54`) l'exclut à
coup sûr du chemin recalculé ; `attenuated: badge === 'blocker'` (`focalOrgData.ts:639`) le garde
DANS l'arbre, juste atténué visuellement ; et `FocalOrgView.tsx:388-398` NOMME explicitement les
bloqueurs exclus à l'écran. Ce qui n'est PAS garanti déterministiquement : le chemin **initial**
(premier run, avant tout clic sur « Recalculer ») vient de `approach_order` produit par le LLM
(`org_graph_assembler.py:1103-1125`), qui ne filtre que les éléments REJETÉS — pas explicitement
les bloqueurs. Le prompt ne dit nulle part « n'inclus jamais un blocker dans `approach_order` »
(vérifié dans `bellum_organigramme.py`). La garantie déterministe n'est prouvée que sur RECALCUL.

**145 — Décision spécifique à un projet.** Le produit **tient sur la moitié qui compte le plus, pas
sur l'autre**. « Hiérarchie inchangée » est solide par construction : `hierarchyLevel` et
`decisionRoles` sont deux axes explicitement DISTINCTS sur la même personne
(`org-graph.ts:194-196`). Mais « committee et influence PAR SUJET » n'a aucun support structurel :
ni `orgCommitteeMemberSchema` (`:311-317`) ni `orgInfluenceEdgeSchema` (`:295-303`) ne portent de
champ sujet/projet, et `decision_role.py` n'a aucune notion de direction/focus (recherche
exhaustive de "direction"/"focus" dans le fichier : rien qui s'y rapporte). Un même comité, une
même carte d'influence, pour tous les sujets.

**146 — Multi-domaines non-IT.** Le produit **pilote l'entrée de la vague, pas l'arbre**.
`domain_focus.py` + `offer_domains` existent réellement et changent le LENS des prompts
généraux, et `is_industrial_seller` alimente `contact_ranking.py:72-134` (`enrichment_score`), donc
influence QUI entre dans la vague enrichie. Mais aucune trace de `domain_focus`/`offer_domain`/
`OfferPortfolio`/`DomainContext` dans `org_graph_assembler.py` ni dans
`apps/api/src/modules/org-graph/` (recherche exhaustive, zéro résultat) — confirmé
indépendamment par `orggraph-contradictions-2026-08-30.md` C6 : « Aucun tableau de poids
n'existe... ni dans org-graph/, ni dans org*graph*\*.py. » La FOCALE (quelle direction s'ouvre,
comment les cartes sont classées dedans) n'a aucune conscience du domaine vendu.

**147 — Sources vieillissantes.** Le produit **ne tient pas au sens demandé**. Il existe un proxy
faible : `OrgSource.date` (`org-graph.ts:166`) donne un bonus ponctuel de +10 à la confiance si
< 12 mois, au moment de la construction du graphe. Il n'y a ni seuil de fraîcheur NOMMÉ (une valeur
qui déclenche un état « obsolète »), ni file de revérification, ni affichage à l'écran de l'âge
d'une source dans l'onglet Organigramme (recherche de « à revérifier » dans le dossier
`organigramme/` : un seul résultat, un commentaire sans rapport dans `OrgGraphViews.tsx:540`).

**148 — Export PDF obsolète.** Le produit **ne peut pas tenir cette exigence : la chose qu'elle
protège n'existe pas.** L'export PDF du compte (`AccountPdfDocument.tsx`) tamponne un
`generatedAt` général (`:235`) mais ne contient **aucune section organigramme** — recherche
exhaustive de `orgGraph`/`organigramme`/`graphVersion` dans `apps/web/src/lib/account-pdf` : zéro
résultat. Il n'y a rien à dater ni à versionner, parce que l'organigramme ne sort pas dans le PDF.

---

#### Ligne à ligne

| #   | Exigence + source                                                                                                                                                                         | Statut         | Preuve `fichier:ligne`                                                                                                                                                                                                                                                                                                                                                                                 | Appelant réel                                                                                                                                                                                             | Ce qui manque                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 122 | Coverage Planner sélectionne les meilleurs contacts restants selon contexte/gaps/entité (`FINAL l.363`)                                                                                   | **ABSENT**     | Recherche `CoveragePlanner`/`coverage.*planner` sur `apps/api/src/modules/org-graph`, `apps/ia/app/services`, `apps/web/src/features/accounts` : 0 fichier. Seul mécanisme trouvé : `analysis-ondemand.service.ts:464` `enrichOrganigram()` — relance phase 3 sur `existingContacts` (TOUS, sans sélection)                                                                                            | Aucun — le seul chemin existant n'a pas de sélection à appeler                                                                                                                                            | Sélection par contexte/gaps/entité entière                                                                                                                                  |
| 123 | « Cette direction » priorise le périmètre jusqu'à un seuil de couverture utile (`FINAL l.365`)                                                                                            | **ABSENT**     | `ContactScope.entity` existe (`packages/contracts/src/schemas/ia.ts:123`, override de `company_name`) mais aucun « seuil de couverture utile » codé nulle part (recherche `seuil.*couverture`/`coverage.*threshold` : 0) ; aucune action UI nommée « Cette direction »                                                                                                                                 | Le champ `entity` du scope n'a d'appelant que via les zones blanches (item 124), pas via un bouton « Cette direction »                                                                                    | L'action produite elle-même + sa condition d'arrêt                                                                                                                          |
| 124 | « Rôles manquants » cherche les sièges/fonctions bloquant la compréhension du circuit (`FINAL l.367`)                                                                                     | **PARTIEL**    | `OrgInfluenceMap.tsx:90-106` (`runGapSearch`) scope `useEnrichContacts` sur `gap.suggestedTitles`/`family`/`level` d'UNE zone blanche à la fois                                                                                                                                                                                                                                                        | `OrgInfluenceMap.tsx:439` (`GapCard`) → `runGapSearch` → `useEnrichContacts` (`useEnrichAccount.ts:29`) → `POST /analysis/:id/enrich-contacts`, cliquable en vue système                                  | Un geste UNIQUE qui balaie TOUTES les zones manquantes ; aujourd'hui c'est zone par zone                                                                                    |
| 125 | « Plan complet » affiche vagues/coût/durée/périmètre avant confirmation (`FINAL l.369`)                                                                                                   | **ABSENT**     | Aucun composant de dialogue trouvé (recherche `Plan complet`, `wave`, `vagues` dans `apps/web/src/features/accounts` : 0)                                                                                                                                                                                                                                                                              | —                                                                                                                                                                                                         | Le dialogue entier                                                                                                                                                          |
| 126 | « Reprendre après erreur » : job persistant, idempotent, reprise au batch suivant sans perdre le progrès (`FINAL l.371`)                                                                  | **ABSENT**     | `org-rebuild.queue.ts:40-49` — `attempts: 1` EXPLICITEMENT, commentaire « JAMAIS de retry : chaque tentative relance un fan-out LLM complet » ; ce job sert le rebuild post-recherche-ciblée, pas une vague d'enrichissement, et ne reprend à AUCUN batch                                                                                                                                              | `analysis-ondemand.service.ts:409-414` (`triggerOrgRebuild`), déclenché après `enrichContacts` scoped                                                                                                     | Un job de VAGUE (n'existe pas) + une reprise par batch (le job existant refuse explicitement de retenter)                                                                   |
| 127 | 50 = taille CTA produit ; taille technique réelle abaissée automatiquement si le payload dépasse le budget de tokens (`FINAL l.376`)                                                      | **PARTIEL**    | Deux tailles bien DISTINCTES existent : `CONTACTS_ENRICH_MAX=50` (`classification.py:77`, taille produit) vs `CONTACTS_BATCH_SIZE=12` plafonné à 15 (`classification.py:58`, taille technique LLM) — mais c'est une constante STATIQUE tunée après incident, pas un abaissement AUTOMATIQUE au runtime selon le payload ; `batches = _chunks(to_enrich, CONTACTS_BATCH_SIZE)` (`:456`) ne varie jamais | `classify_organigramme_and_role` (phase 3), sur chaque analyse et chaque clic « Enrichir l'organigramme »                                                                                                 | L'abaissement AUTOMATIQUE runtime ; un batch qui déborde encore est aujourd'hui **perdu en entier** (commentaire `:33-37`), pas raccourci                                   |
| 128 | Chaque job enregistre `estimated`/`actual credits`, prompt version, entité, `contactIds`, statut, erreur (`FINAL l.377`)                                                                  | **ABSENT**     | `OrgRebuildJobData` = `{accountId, userId}` uniquement, `OrgRebuildJobResult` = `{ok,matched,total}` ou `{ok:false,reason}` (`org-rebuild.queue.ts:18-26`) — aucun de ces 6 champs                                                                                                                                                                                                                     | —                                                                                                                                                                                                         | Les 6 champs, sur un job qui n'existe pas encore de toute façon                                                                                                             |
| 129 | Le coût est annoncé avant plan complet ET avant toute vague personnalisée (`FINAL l.378`)                                                                                                 | **ABSENT**     | `OrgStructureSection.tsx:44-53` appelle `enrichMutation.mutate()` directement au clic, seul `useCreditGate` (binaire peut/ne peut pas) le protège — aucun montant. `OrgInfluenceMap.tsx` `GapCard` (`:702-709`) appelle `onSearch(gap)` directement — malgré un commentaire (`:76`) qui affirme « coût annoncé »                                                                                       | —                                                                                                                                                                                                         | Un aperçu de coût avant CHAQUE clic d'enrichissement organigramme, aujourd'hui absent des deux chemins qui existent                                                         |
| 130 | Pas de full rerun pour un simple gap ou une relation à vérifier (`FINAL l.379`)                                                                                                           | **LIVRÉ**      | `useVerifyOrgRelation` (`useEnrichAccount.ts:128`, 1-2 crédits, cible UNE arête) ; `OrgInfluenceMap.tsx:90-106` `runGapSearch` (scope famille/niveau/titres, PAS un rerun complet)                                                                                                                                                                                                                     | Verify : bouton dans `FocalOrgView`/`OrgGraphViews` → `POST /analysis/:id/verify-relation`. Gap : `GapCard` → `POST /analysis/:id/enrich-contacts` scopé — les deux cliquables dans l'onglet Organigramme | —                                                                                                                                                                           |
| 131 | Dialogue « Enrichir l'organigramme — Choisissez jusqu'où aller. Aucun run ne reçoit tout le compte d'un coup. » (`maquette 05`)                                                           | **ABSENT**     | 0 résultat pour cette phrase ou son sens dans `apps/web/src`                                                                                                                                                                                                                                                                                                                                           | —                                                                                                                                                                                                         | Le dialogue                                                                                                                                                                 |
| 132 | Bloc « ACTION RAPIDE » : « Enrichir les 50 suivants… » + bouton « Lancer » (`maquette 05`)                                                                                                | **ABSENT**     | 0 résultat pour « Enrichir les 50 suivants » dans `apps/web/src` (fichiers `.tsx`/`.ts`/`.json`)                                                                                                                                                                                                                                                                                                       | —                                                                                                                                                                                                         | Le bloc                                                                                                                                                                     |
| 133 | Bloc « Ou cibler précisément », 4 cibles (dont niveau hiérarchique — **⚠️ question ouverte, item 6 du §20 : la maquette en montre 5, le texte FINAL 4, non tranché ici**) (`maquette 05`) | **ABSENT**     | Le ciblage par ENTITÉ/FAMILLE/NIVEAU existe comme capacité technique brute (`ContactScope`, `OrgInfluenceMap.tsx:82` `useState('')` pour `level`), mais aucun DIALOGUE à 4 (ou 5) boutons ne les rassemble ; `FocalOrgView.tsx` n'a que le sélecteur de direction (`:86-102`)                                                                                                                          | —                                                                                                                                                                                                         | Le dialogue de ciblage. Sujet déjà parqué : `orggraph-contradictions-2026-08-30.md` D281                                                                                    |
| 134 | Bandeau « Estimation avant confirmation : 50 contacts ≈ 6 crédits · ~40 s… » (`maquette 05`)                                                                                              | **ABSENT**     | 0 résultat pour un bandeau d'estimation lié à l'organigramme                                                                                                                                                                                                                                                                                                                                           | —                                                                                                                                                                                                         | Le bandeau                                                                                                                                                                  |
| 135 | 2 000-10 000 contacts → coverage + recherche/virtualisation ; arbre limité à la branche utile (`FINAL l.392`)                                                                             | **PARTIEL**    | Coverage/recherche : `useContactsListData.ts:21-31` (pagination serveur infinie). Arbre : `FocalOrgView.tsx:363-378,520-522` sans `slice`, seuls repères non liés : `TOP_CONTACTS=10` (`:637`), `MAX_VISIBLE_DIRECTIONS=4` (`focalOrgData.ts:292`)                                                                                                                                                     | Contacts tab reachable via « Voir tous les contacts » (`AccountDetailTabContent.tsx`)                                                                                                                     | Une borne PAR NIVEAU sur l'arbre focal (déjà parquée D277, `orggraph-contradictions-2026-08-30.md`)                                                                         |
| 136 | Blob gigantesque → Contacts canoniques, graph=projection, normalisation si le volume le justifie (`FINAL l.394`)                                                                          | **LIVRÉ**      | `org-graph.ts:432-436` (docblock + schéma) ; `org_graph_assembler.py:603-611` (`people[]` construit depuis la vague, `discovered_contacts` sert à COMPTER seulement)                                                                                                                                                                                                                                   | `raw_analysis.org.orgGraph` écrit par `org-graph.service.ts`, lu par `accounts.service.ts`/`focalOrgData.ts` à chaque ouverture de l'onglet                                                               | Normalisation en tables — correctement PAS faite (seuil de volume non atteint)                                                                                              |
| 137 | Organisation matricielle → `direct` vs `functional`, preuves séparées, styles distincts (`FINAL l.396`)                                                                                   | **ABSENT**     | `orgHierarchyEdgeSchema` (`org-graph.ts`) : recherche `functional`/`"direct"` → 0 résultat                                                                                                                                                                                                                                                                                                             | —                                                                                                                                                                                                         | Le second axe de relation entier                                                                                                                                            |
| 138 | Cross-entity reporting autorisé uniquement avec preuve explicite (`FINAL l.398`)                                                                                                          | **LIVRÉ**      | `_CLAIMS_BACKING` (`org_graph_assembler.py:188`) + `_honour_claims` (`:207`) — refus par défaut, mesuré par exécution (`orggraph-final-2026-08-29.md` §4bis : 0 ligne fausse après réintroduction volontaire du bug)                                                                                                                                                                                   | `assemble_org_graph`, appelé par `classification.py` phase 3, sur chaque analyse + « Enrichir l'organigramme »                                                                                            | —                                                                                                                                                                           |
| 139 | Homonymes → toujours id + entité + poste, jamais nom seul pour une correction (`FINAL l.400`)                                                                                             | **NON PROUVÉ** | `orgCorrectionRequestSchema` : `objectId` toujours un id (`org-graph-correction.ts:183-186`, commentaire « jamais un nom »)                                                                                                                                                                                                                                                                            | `OrgGraphController`/`OrgGraphCorrectionService` montés côté Nest, mais **zéro appelant front** (`grep -rn "org-graph" apps/web/src` → 0, confirmé `orggraph-inventaire-existant-2026-08-30.md` §3.2)     | Un écran qui atteigne la route                                                                                                                                              |
| 140 | M&A / BU renommée → alias d'entité + historique ; ne pas écraser les anciens rattachements (`FINAL l.402`)                                                                                | **ABSENT**     | `orgEntitySchema` (`org-graph.ts:182-191`) : pas de champ alias/historique de nom                                                                                                                                                                                                                                                                                                                      | —                                                                                                                                                                                                         | Le mécanisme entier                                                                                                                                                         |
| 141 | Ex-employé → `validTo` ; absent du courant, visible dans l'historique (`FINAL l.404`)                                                                                                     | **PARTIEL**    | Pas de `validTo` (0 résultat). Mais `lifecycle_state='historique'` (posé quand `employerMismatch`, `contact-score.ts:212`, signal Apollo) ; `getCurrentOrgContacts` (`organigrammeData.ts:78-79`) l'exclut de l'arbre, docblock `:73-75` confirme la visibilité conservée sur l'onglet Contacts                                                                                                        | `getCurrentOrgContacts` appelé par `TabOrganigramme.tsx` à l'entrée de l'onglet, sur chaque rendu                                                                                                         | La date (aucun horodatage de départ, juste un booléen d'état courant)                                                                                                       |
| 142 | Deux corrections simultanées → optimistic locking + diff (`FINAL l.406`)                                                                                                                  | **NON PROUVÉ** | `expectedGraphVersion` obligatoire au schéma (`org-graph-correction.ts`) ; 409 + `diffSummary` (`org-graph-correction.service.ts:103-104,405-424`)                                                                                                                                                                                                                                                     | Route montée, **zéro appelant front** (même constat que 139)                                                                                                                                              | Un écran                                                                                                                                                                    |
| 143 | Mauvaise correction utilisateur → prioritaire mais réversible ; contradiction signalée (`FINAL l.408`)                                                                                    | **NON PROUVÉ** | `revertCorrection` (`org-graph-correction.service.ts:175-259`, `reverted_at`, annulation en ligne propre) — réversibilité réelle. Pas trouvé : mécanisme séparé de « contradiction signalée »                                                                                                                                                                                                          | Route montée, **zéro appelant front**                                                                                                                                                                     | Un écran + le signal de contradiction (non cherché exhaustivement faute d'objet à appeler)                                                                                  |
| 144 | Blocker hiérarchiquement central → visible, exclu du `recommendedPath` (`FINAL l.410`)                                                                                                    | **LIVRÉ**      | `ROLE_ORDER.blocker = Number.POSITIVE_INFINITY` (`org-graph-path.ts:54`) ; `attenuated: badge==='blocker'` (`focalOrgData.ts:639`, garde le nœud dans l'arbre) ; nommage explicite (`FocalOrgView.tsx:388-398`)                                                                                                                                                                                        | `recomputeRecommendedPath` ← `useRecomputeOrgPath` ← `POST /analysis/:id/recompute-path`, bouton dans l'onglet                                                                                            | Garantie déterministe sur le chemin INITIAL (1er run) : `approach_order` LLM (`org_graph_assembler.py:1103-1125`) ne filtre que les rejetés, pas explicitement les blockers |
| 145 | Décision spécifique à un projet → committee/influence par sujet ; hiérarchie inchangée (`FINAL l.412`)                                                                                    | **PARTIEL**    | Hiérarchie inchangée : `hierarchyLevel`/`decisionRoles` = axes distincts documentés (`org-graph.ts:194-196`). Par sujet : `orgCommitteeMemberSchema` (`:311-317`) et `orgInfluenceEdgeSchema` (`:295-303`) sans champ sujet/projet ; `decision_role.py` non direction-aware                                                                                                                            | —                                                                                                                                                                                                         | Le recalcul par sujet — un seul comité, une seule carte, pour tous les sujets                                                                                               |
| 146 | Multi-domaines non-IT → OfferPortfolio + DomainContext pilotent focale et ranking (`FINAL l.414`)                                                                                         | **PARTIEL**    | `domain_focus.py`/`offer_domains` réels, `is_industrial_seller` → `contact_ranking.py:72-134` (`enrichment_score`) — pilote QUI entre dans la vague. 0 résultat pour ces symboles dans `org_graph_assembler.py` / `apps/api/.../org-graph/`                                                                                                                                                            | `rank_contacts_for_enrichment` (`classification.py:441-442`), sur chaque analyse                                                                                                                          | Le pilotage de la FOCALE (direction ouverte, classement dans l'arbre) — confirmé absent par `orggraph-contradictions-2026-08-30.md` C6                                      |
| 147 | Sources vieillissantes → `lastVerifiedAt` + seuil de fraîcheur + queue de revérification (`FINAL l.416`)                                                                                  | **ABSENT**     | Proxy faible seul : `OrgSource.date` (`org-graph.ts:166`), bonus +10 confiance si <12 mois, calculé une fois à l'assemblage                                                                                                                                                                                                                                                                            | —                                                                                                                                                                                                         | Seuil nommé, file de revérification, affichage d'âge à l'écran                                                                                                              |
| 148 | Export PDF obsolète → date + `graphVersion` dans l'export ; statut de fraîcheur visible (`FINAL l.418`)                                                                                   | **ABSENT**     | `AccountPdfDocument.tsx:235` tamponne `generatedAt` général ; 0 résultat pour `orgGraph`/`organigramme`/`graphVersion` dans `apps/web/src/lib/account-pdf`                                                                                                                                                                                                                                             | —                                                                                                                                                                                                         | La section organigramme du PDF elle-même n'existe pas                                                                                                                       |

---

#### Les défauts trouvés en chemin

1. **Un commentaire s'auto-contredit sur le coût annoncé.** `OrgInfluenceMap.tsx:76` affirme, en
   citant la source (« p18 ») : « relancer recherche ciblée, **coût annoncé**, sans full rerun ».
   Le code juste en dessous (`GapCard`, `:702-709`) déclenche la recherche **sans aucun aperçu de
   coût** — direct `onSearch(gap)` au clic. Le commentaire décrit l'intention du document source, pas
   ce que la fonction fait. Item 129.

2. **Le seul job de reconstruction du graphe REFUSE explicitement le « reprendre sans perdre le
   progrès » que le FINAL demande.** `org-rebuild.queue.ts:41-43` : « JAMAIS de retry : chaque
   tentative relance un fan-out LLM complet ». Ce n'est pas un manque à combler par surcroît de
   travail — c'est un choix architectural documenté qui va dans le sens CONTRAIRE d'item 126. Un
   futur agent qui implémenterait le planner devra choisir entre les deux principes (jamais de
   retry coûteux vs reprise au batch suivant), pas juste ajouter du code.

3. **Une troncature de batch supprime des données au lieu de les rétrécir.** `classification.py:33-37`
   documente qu'un batch encore trop gros après le passage de 25 à 12 est **perdu en entier**
   (« the WHOLE batch is then dropped »). Item 127 promettait un abaissement automatique ; ce que le
   code fait à la place, c'est jeter le lot. Sur un compte dont les contacts portent des profils
   longs (beaucoup de `careerLevers`/`implicitFears`), ceci reste un risque de perte silencieuse
   documentée mais non corrigée.

4. **Trois de mes 27 items (139, 142, 143) retombent sur le MÊME code mort** — le ledger de
   corrections de l'organigramme (`OrgGraphCorrectionService`/`OrgGraphController`), déjà signalé
   `CODE MORT` par l'audit du 30/08 (D290). Optimistic locking, diff, revert : tout est écrit, testé,
   monté côté Nest — et strictement inatteignable depuis le web. Un tiers du §11 « red team » de ce
   lot dépend d'un tiroir qui n'a pas de porte.

5. **Le pilotage « domain-aware » du FINAL §5 (item 146, et par ricochet C6) est réel en amont
   (sélection des contacts à enrichir) mais absent dans le module `org-graph` lui-même.** Un agent
   qui lirait uniquement `domain_focus.py`/`offer_domains.py` conclurait à tort que « OfferPortfolio
   pilote déjà l'organigramme » — il pilote la PHASE 3 en général, pas la focale ni le classement de
   l'arbre.

6. **Item 145 : un seul comité d'achat pour tout le compte.** Aucune trace de recalcul par sujet.
   Si un vendeur suit deux projets distincts chez le même compte avec des jeux d'acteurs différents
   (le cas même que le scénario décrit), le produit affiche la MÊME carte d'influence pour les deux.

---

#### Ce que je n'ai pas pu vérifier, et pourquoi

- **Aucune exécution live de l'application (pas de recette Chrome).** Pour les items où
  l'instruction demandait de privilégier la preuve par exécution (§11), je me suis appuyé sur (a)
  la lecture du code et (b) les exécutions déjà réalisées et publiées par l'audit du 30/08
  (`org_graph_assembler.py` exécuté réellement, pytest réellement lancé — cité pour 138, 144). Je
  n'ai pas relancé ces exécutions moi-même ; je les ai revérifiées en relisant leur sortie citée et
  en confirmant les numéros de ligne qu'elles invoquent contre le code d'aujourd'hui — ils tiennent
  toujours.
- **Item 143, « contradiction signalée » :** je n'ai pas fait de recherche exhaustive d'un
  mécanisme de détection de contradiction ailleurs dans le dépôt (hors org-graph), parce que
  l'absence totale d'appelant front rend la question sans objet pratique aujourd'hui — le
  classer NON PROUVÉ plutôt qu'ABSENT reste honnête (le code de retrait/réversibilité, lui, EXISTE
  et est prouvé) mais je n'affirme pas que le signal de contradiction n'existe nulle part dans le
  dépôt, seulement que je ne l'ai pas trouvé dans le module org-graph.
- **Item 135, comportement RÉEL à 2 000-10 000 contacts :** je n'ai pas chargé un compte de cette
  taille dans le navigateur pour observer un ralentissement ou un crash — la conclusion « aucune
  borne » vient de la lecture du composant (`row.people.map` sans `slice`), pas d'une mesure de
  performance.
- **Le compte exact des 14 scénarios red-team dans le paquet source** vient d'un comptage machine
  déjà fait et publié par `orggraph-contradictions-2026-08-30.md` (C12, §0.2) : je l'ai revérifié en
  comptant moi-même les lignes du tableau FINAL §12 (l.390-419) — 14 lignes, confirmé.
