# Gouvernance — itération 3, archive `00` — 25 août 2026

Source : `BELLUMAI_ITERATION_3_00_GOUVERNANCE_SOURCE_OF_TRUTH_2026-08-24.zip`
(33 fichiers, manifeste vérifié). Mode **implémenter**.

Ce paquet ne décrit aucune fonctionnalité. Il porte l'ordre de lecture des neuf
autres, vingt-cinq contradictions **déjà arbitrées**, onze invariants non
négociables et une matrice d'état de vingt-huit lignes. Il se lit avant tout le
reste, sinon une contradiction se tranche deux fois, dans deux sens.

Son défaut central, et la raison pour laquelle ce chantier existe : **c'est un
point de vue daté, produit par analyse statique du dépôt au 24/08 vers 14 h.**
Quatre de ses affirmations sont fausses aujourd'hui. Un `IMPLEMENTED` de sa
matrice sans appelant dans le dépôt reste `NON PROUVÉ`.

---

## 0. Ce qui est livré

| Lot | Objet                                                                                                                 | Commit     |
| --- | --------------------------------------------------------------------------------------------------------------------- | ---------- |
| L1  | `doctrine-registry.ts` + GA-38 — les 25 contradictions et 11 invariants en CODE, chaque porteur vérifié sur le disque | `4f8d4f99` |
| L2  | Quatre commentaires qui mentaient sur l'état du code (digest quotidien, « huit états »)                               | `4f8d4f99` |
| L3  | `wired-write-paths.spec.ts` couvre les bascules booléennes de `notification_preferences`                              | `4f8d4f99` |
| L4  | Le secteur du Projet devient saisissable ; la Mission en hérite à la conversion                                       | `45ae1774` |
| L5  | Le contexte industriel du Site devient écrivable                                                                      | `45ae1774` |
| L6  | Deux libellés IT en dur à côté de la lentille qui les corrige                                                         | `14024e05` |
| L7  | Parité démo, changelog FR+EN, tracker, `CLAUDE.md`, mémoire                                                           | ce commit  |

---

## 1. Inventaire et croisement

### 1.1 Les vingt-cinq contradictions (`MASTER_CONTRADICTION_REGISTER.md`)

Chacune est désormais une entrée de `packages/contracts/src/schemas/doctrine-registry.ts`,
avec sa règle canonique, ce qu'elle **supplante**, son état de code, ce qui la
tient, et son écart. Le tableau ci-dessous ne redit pas le registre : il donne le
verdict du croisement et l'archive qui porte le reste.

| Id  | Thème             | Le pack dit                   | Le dépôt dit                                                                                                                                                                          | Suite |
| --- | ----------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| C01 | Navigation        | IMPLEMENTED                   | **VRAI**, gardé à 9 (`sections.test.ts:37`). ⚠️ Le 7ᵉ domaine s'appelle **Laura** et non « Copilote » (D82) ; seule la clé interne est restée `copilot`                               | —     |
| C02 | Laura / Copilote  | PARTIAL                       | **VRAI**. `LauraCard` est une carte proactive (`/laura/plan` une fois par écran), pas un tiroir. 8 détecteurs sur 30, écart gardé                                                     | `03`  |
| C03 | Laura Site        | IMPLEMENTED                   | **VRAI**, `guardrails.ts` + son test                                                                                                                                                  | —     |
| C04 | Project pivot     | IMPLEMENTED                   | **VRAI**, mais tenu par relecture seule                                                                                                                                               | —     |
| C05 | Secteur au Projet | **MISSING**                   | **FAUX**. Colonnes posées le 24/08 (`1790020847361`), axe de matching branché avec repli nommé. Ce qui manquait : **aucun chemin d'écriture** — livré au lot 4                        | —     |
| C06 | Multi-domaines    | PARTIAL                       | **VRAI**, et le pack sous-estime : `offerPortfolioContext` EST lu par l'IA (`seller_context.py:218`). Ce qui manque est ailleurs — aucun service déterministe ne lit le portefeuille  | `06`  |
| C07 | Discover scoring  | MISSING                       | **VRAI**. `_MAX_IT_SURFACE = 20` intact (`discover_scoring.py:119`) ; seuls les LIBELLÉS basculent                                                                                    | `06`  |
| C08 | DATAFORGE         | NOT_PROVEN                    | **VRAI et assumé** : GA-37 documente que `priorsForSiren` n'a aucun consommateur, et pourquoi une garde d'architecture vaut mieux qu'un guard que rien n'appelle                      | `06`  |
| C09 | Route d'achat     | garde présente                | **VRAI**. `procurementRouteSeed` gardé par regex. L'evidence compte × domaine n'existe dans aucune table                                                                              | `06`  |
| C10 | Compte / site     | PARTIAL, « modèle générique » | **FAUX**. `1790027384512` ajoute type, activités, fonctions et les trois colonnes de provenance de l'effectif ; `siteFit` les lit. Ce qui manquait : **l'écriture** — livrée au lot 5 | `01`  |
| C11 | Contacts          | PARTIAL                       | **VRAI**. Chaîne industrielle présente, `_IT_DECIDER_PATTERNS` et les familles de `bellum_contacts` en dur                                                                            | `06`  |
| C12 | Organigramme      | surfaces significatives       | **VRAI**, séparation tenue, ni domain-aware ni project-aware                                                                                                                          | `05`  |
| C13 | Plan de compte    | Lite partiel                  | **VRAI**                                                                                                                                                                              | `05`  |
| C14 | Automatisation    | présent                       | **VRAI**. ⚠️ Le tracker du dépôt affirmait que `POST /action-os/runs` n'avait aucun appelant : **périmé**, `features/action-os/api.ts:98` l'appelle                                   | `04`  |
| C15 | Intégrations      | 6 états                       | **FAUX sur les noms**. Le dépôt en a **dix** ; `connected`, `read_verified` et `repair_required` n'existent pas — voir la table §3                                                    | —     |
| C16 | CRM overlay       | surfaces larges               | **VRAI**, positionnement                                                                                                                                                              | —     |
| C17 | Facturation       | IMPLEMENTED                   | **VRAI**                                                                                                                                                                              | —     |
| C18 | Pilotage          | PARTIAL                       | **VRAI**, 14 des 60 indicateurs `measurable: false`                                                                                                                                   | —     |
| C19 | Vocabulaire       | PARTIAL                       | **VRAI**. La moitié « pas d'éditeur » est gardée ; le lexique vertical runtime **n'existe pas**                                                                                       | `06`  |
| C20 | Matching          | secteur mission absent        | **FAUX** (voir C05). Reste vrai : le SITE n'entre dans aucun axe                                                                                                                      | `06`  |
| C21 | Données           | primitives présentes          | **VRAI**. GA-18/19 sont des cliquets, pas des interdits                                                                                                                               | —     |
| C22 | Démo              | présent                       | **VRAI**                                                                                                                                                                              | —     |
| C23 | Pricing           | historique contradictoire     | **VRAI**, `shipped-plan-grid` fait foi                                                                                                                                                | `07`  |
| C24 | LinkedIn          | à maintenir                   | **VRAI**, tenu par l'absence de client HTTP                                                                                                                                           | —     |
| C25 | Observabilité     | INITIAL                       | **VRAI**                                                                                                                                                                              | `03`  |

### 1.2 Les onze invariants (`SOURCE_PRECEDENCE.md`)

Tous entrés dans le registre. Le résultat qui compte est celui-ci :

> **Un invariant sur onze n'est porté par aucun fichier du dépôt.** « Le retour
> d'un bêta testeur ne se réutilise pas tel quel chez un concurrent » : ni
> `submission_feedback` ni `account_feedback` ne portent de champ de portée ou
> de confidentialité, et rien n'empêche un verbatim de voyager. `nextPack: '06'`.

Deux autres sont `unenforced` avec leur raison : « le portefeuille pilote la
lentille » (seuls les prompts la suivent) et C07.

### 1.3 La matrice `IMPLEMENTATION_STATUS` (28 lignes)

Vingt-trois des vingt-huit lignes tombent sur une contradiction du §1.1 et y sont
traitées. **Cinq** n'ont aucun équivalent parmi les vingt-cinq contradictions —
je l'avais d'abord écrit « trois », c'était faux, et deux lignes dormaient :

| Ligne de matrice                      | Ce que le pack en dit                                                  | Verdict                                                                                                                                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ATS — Talent/CV/vivier                | `IMPLEMENTED_BROAD`, suite = « recette E2E et adoption »               | **Confirmé**. Le tracker PDF 3 revendique douze lots livrés ; la recette d'adoption reste due → `02`                                                                                                            |
| CRM — pipeline, glisser-déposer gardé | `IMPLEMENTED`, suite = « conserver audit/outcome »                     | **Confirmé**. `effectsForMove` et le journal des portes tiennent la règle ; rien à reprendre                                                                                                                    |
| Infra — CI/types/build/tests          | `IMPLEMENTED`, suite = « E2E encore non bloquant »                     | **Confirmé, et documenté comme un CHOIX** : le job Playwright porte `continue-on-error: true` et reste volontairement hors de la porte `CI Status`, avec sa raison écrite. Deux specs de fumée seulement → `08` |
| Sécurité — cloisonnement/RBAC/audit   | `IMPLEMENTED_PARTIAL`, suite = « pentest / pack entreprise plus tard » | **Partiel**, et le rester est un choix de calendrier, pas un oubli                                                                                                                                              |
| Second marché                         | `IMPLEMENTED_PARTIAL`, suite = « densité data et workflows »           | **Partiel** : l'annuaire se rafraîchit, mais toutes les automatisations prévues n'ont pas assez de données → `05`                                                                                               |

⚠️ Requalifier un `IMPLEMENTED_PARTIAL` en « confirmé sans écart » perdrait la
dette que le pack signale. Les trois `_PARTIAL` ci-dessus gardent leur état.

### 1.4 Les dix-huit `repo_diff_reports/`

Ce sont des **dumps de notre propre dépôt** au 24/08, pas des exigences. Classés
non porteurs, avec leur raison, sauf deux :

- `todos.txt` — a mené au lot 2 (les commentaires périmés).
- `removed.txt` — deux fichiers retirés (`useContactsPage`), diff normal.
- `missing_relative_imports.json` — **faux positifs intégraux** : ce sont les
  extensions ESM `.js` qui résolvent des sources `.ts`. Aucune action.
- `migrations.txt` — **fichier VIDE** : le script de l'auteur n'a rien produit.

### 1.5 Les cinq `repo_trackers/`

Copies de nos `agent_docs/`. **Byte-identiques au dépôt** (sha256 comparés,
revérifiés 5/5 le 30/08) : rien n'a divergé.

⚠️ **La suite de cette phrase disait « rien à reprendre ». C'était un
non-sequitur, corrigé le 30/08/2026.** « L'archive n'apporte rien de NEUF » et
« ces documents ne demandent PLUS RIEN » sont deux affirmations différentes : la
première peut être vraie pendant que la seconde est fausse. Ces cinq fichiers
portent **onze décisions ouvertes** (sept numérotées dans
`decisions-aout-2026.md`, quatre non numérotées dans `restitution-tracker.md`) —
c'est ce qui a rendu la preuve n°5 du certificat fausse. L'identité d'empreinte
prouve qu'on n'a rien à IMPORTER ; elle ne dit rien de ce qui reste à FAIRE.
Statut décision par décision : la table en tête de
`agent_docs/decisions-aout-2026.md`, tenue par GA-116.

---

### 1.6 Les trois fichiers de doctrine d'exécution

Ils ne portent aucune exigence de produit — ils disent COMMENT travailler — et
c'est justement pourquoi ils s'oublient. Inventoriés ici.

**`README.md` — le workflow obligatoire en huit points.** Tenu, avec une
réserve : le point 5 (« n'écrire qu'un delta non destructif ») est respecté —
aucune migration touchée, toutes les colonnes ajoutées, tous les schémas élargis
— et le point 8 (« mettre à jour tracker/changelog **avec preuve de recette** »)
l'est par le §7. Le point 7 (« ne jamais considérer “fichier présent” comme
“fonctionnalité vérifiée” ») est le principe qui a produit les six défauts du §2.

⚠️ Le README dit aussi, dès son objectif : ces archives « **ne sont pas une
invitation à appliquer tous les PDF de manière cumulative** ». C'est la phrase
qui autorise le §6.

**`CLAUDE_CODE_RULES.md` — dix règles d'ingestion.** Neuf sont tenues et
vérifiables ci-dessus. La dixième ne l'est pas :

> « Chaque ticket doit contenir : source, problème résiduel, fichiers,
> comportement actuel, attendu, invariants, tests, edge cases, **rollback** et
> **feature flag**. »

Le §6 porte deux colonnes, pas dix. **Refus motivé** plutôt qu'oubli : un drapeau
de fonctionnalité sur une colonne additive dont la valeur par défaut est vide
n'éteint rien qu'un `[]` n'éteigne déjà, et le retour arrière d'un ajout de
colonne est la migration `down` qui existe. Poser un drapeau par lot produirait
la case à cocher qui ne fait rien — exactement ce que les Routines s'interdisent.
Ce qui est vrai en revanche : les lots 4 et 5 ouvrent des chemins d'écriture, et
leur rollback est nommé — retirer le décorateur de route rend l'écran inerte sans
toucher aux données déjà saisies.

**`CURRENT_IMPLEMENTATION_BASELINE.md` — l'état vu par l'auteur.** Le plus gros
document de l'archive, et celui dont les affirmations méritent d'être croisées
une par une. Les quinze qui portent quelque chose :

| Affirmation                                                                                                                                             | Verdict                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « No installed JS dependencies : **full TypeScript build/test not independently executed** »                                                            | **VRAI, et c'est la limite qui compte** : aucun `IMPLEMENTED` de la matrice ne repose sur une suite verte, seulement sur de la lecture de fichiers                                             |
| CI garde lint, format, types, build, API, web, MCP, contrats, Python, evals                                                                             | **VRAI**, vérifié : `apps/mcp` est bien exécuté (2ᵉ étape du job `test`) et présent dans la porte `CI Status`                                                                                  |
| « E2E non bloquant ; suite `events` exclue pour panne IPC »                                                                                             | **VRAI et assumé** : `continue-on-error: true`, hors de la porte, raison écrite dans le fichier                                                                                                |
| « Duplicate migration timestamp `1783000000000` … documented/guarded »                                                                                  | **VRAI** : les deux migrations coexistent et `migrations.spec.ts` les garde. Piège désamorcé — ne pas « nettoyer »                                                                             |
| « Actual detectors cover only a subset of the 30 intervention catalog »                                                                                 | **VRAI** : 8 sur 30, gardé (C02)                                                                                                                                                               |
| « Server implements interruption budget, daily cap, 20-min gap, per-screen cap, retreat, 30-day cooldown, health score, team alert »                    | **VRAI** — huit garde-fous d'attention. À connaître AVANT de construire le tiroir Laura du pack `03` : le tiroir devra les respecter                                                           |
| « Live offer packs : `esn_it`, `generic`, `finance`, `industrial_engineering` ; **scaffolds** : `supply_chain`, `product_design`, `pmo`, `rh` »         | **VRAI** : la moitié des packs sont vides. Le lexique vertical du `06` est donc plus lourd qu'annoncé — quatre packs à curer d'abord                                                           |
| « Legacy IT bias remains in `bellum_advisor.py`, **legacy contracts (`itChallenges`, `itAutonomy`)**, `_MAX_IT_SURFACE=20`, coverage/contact ontology » | **VRAI, quatre porteurs**. Le lot 6 en corrige un, C07 et C11 portent deux autres ; les CLÉS de contrat sont le quatrième, et c'est le plus structurant (il traverse l'API et le front) → `06` |
| « Onboarding … **no silent preselection, min 1** »                                                                                                      | **VRAI**, acquis à ne pas perdre. Les lots 4 et 5 n'y touchent pas : ni le secteur du projet ni le contexte du site ne préremplissent quoi que ce soit                                         |
| « Relationship-memory bridge remains **limited by module autonomy** »                                                                                   | **VRAI** : contrainte d'architecture assumée, pas un défaut → `05`                                                                                                                             |
| « Full adaptation of all large tables/visualizations remains **incomplete** » (mobile)                                                                  | **VRAI**, déjà écrit au tracker mobile du 23/08 (22 tableaux restants) → `01`                                                                                                                  |
| « Mobile shell has four tabs plus Laura »                                                                                                               | **VRAI** : quatre PORTES et non neuf domaines — au-delà, les cibles passent sous 44 px                                                                                                         |
| « Live recipe fixes documented for endpoint shape, guards, translations, blockers and CRA state »                                                       | **VRAI** : ce sont les cinq endroits où la recette a déjà mordu, donc les cinq à re-tester en priorité                                                                                         |
| « 5 247 fichiers, 104 modules API, 118 contrôleurs, ~702 routes, 73 routes web »                                                                        | **Étalon**, à réutiliser pour mesurer l'épuisement du pack `08`                                                                                                                                |
| « `DOMAINS.md` maps flat Nest modules into Market, CRM, Talent, Delivery, Assistant and Foundation »                                                    | **VRAI**, le fichier existe et sert de carte au `08`                                                                                                                                           |

## 2. Ce que le croisement a trouvé et que le pack ne demandait pas

Six défauts, tous vérifiés dans le code, tous de familles déjà connues.

**1. Le secteur du Projet, lu et jamais écrit.** `opportunities.application_sector_codes`
et `primary_domain_code` : migration ✓, entité ✓, un lecteur (l'axe `sector` du
matching) ✓, **zéro écrivain**. L'axe retombait donc toujours sur le secteur du
compte. `missions.application_sector_codes` n'avait même pas de lecteur. Corrigé
au lot 4.

**2. Le contexte industriel du Site, lu et jamais écrit.** Six colonnes,
`siteFit` branché, `createSite` n'en persistait aucune : `siteFit` répondait
« inconnu » sur tous les sites — indiscernable d'une base pas encore remplie.
Corrigé au lot 5.

**3. Le pont Projet→Mission, décrit et jamais écrit.** Le docblock de
`mission.entity.ts` explique `inherited_from_project_at` depuis la migration ;
aucun code ne le posait. Corrigé au lot 4.

**4. Quatre commentaires qui mentent sur l'état du code.** ⚠️ Contrairement aux
cinq autres, celui-là **était** demandé : la baseline le nomme comme le seul
« TODO-worthy user-facing gap » de tout le dépôt. Entité, contrat,
migration et service affirmaient qu'aucun cron ne lit `watchlist_daily_digest`.
Faux depuis `DailyDigestService` — le web avait retiré son badge « Bientôt », les
commentaires étaient restés. Piège pour le prochain lecteur : il croirait tenir
un chemin mort et supprimerait le cron. `tool-registry.ts` annonçait de même
« huit états » pour dix. Corrigé au lot 2.

**5. Une préférence booléenne sans lecteur ne se voit nulle part.**
`wired-write-paths.spec.ts` ne couvrait que des méthodes de service. Étendu aux
dix bascules de `notification_preferences`, avec exemption NOMMÉE pour celle qui
n'est lue que côté web. Deux fuites trouvées en prouvant que la garde sait dire
NON : la migration qui CRÉE la colonne se lisait comme un lecteur, et un docblock
qui la cite aussi (leçon GA-08, encore).

**6. Un code de secteur inventé s'insère sans broncher.**
`application_sector_codes` n'a aucune contrainte `CHECK`. Mesuré en écrivant le
seed de démonstration : `transport_logistics` n'existe pas, rien ne l'a dit, et
le panneau serait resté vide. Garde ajoutée dans `demo-contract-values.spec.ts` —
la leçon `account_vocabulary.kind` vaut aussi quand la base ne refuse RIEN.

---

## 3. Table de correspondance — les états de capacité

Le pack nomme six états d'intégration. Le dépôt en a **dix**, et on ne renomme
rien : ces valeurs vivent dans une énumération gardée par GA-08 et dans des
écrans qui les traduisent.

| Le pack           | Le dépôt                                                                | Note                                                                                       |
| ----------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `connected`       | _(aucun)_                                                               | C'est `ToolStatus`, un AUTRE axe. Un outil connecté n'a pas d'état de capacité pour autant |
| `scopes`          | `scope_missing`                                                         | La portée manquante est NOMMÉE (`scopes[]`)                                                |
| `read_verified`   | `untested`                                                              | L'inverse est modélisé : `operational` EXIGE une preuve datée, sinon c'est `untested`      |
| `write_verified`  | `limited_write` / `read_only`                                           | Une capacité qu'aucune lecture non destructive ne prouve n'exige pas de preuve             |
| `degraded`        | `degraded`                                                              | ✓                                                                                          |
| `repair_required` | _(aucun)_                                                               | La réparation est une ACTION, déclenchée par `scope_missing` / `authorization_expired`     |
| —                 | `not_connected`, `sync_late`, `action_pending`, `authorization_expired` | Quatre états que le pack n'a pas                                                           |

Même règle que pour la numérotation des gardes du PDF 9 : **on ne renomme pas
pour plaire à un document.**

---

## 4. Ce que le CSV d'inventaire ne dit pas

`MASTER_DOCUMENT_INVENTORY.csv` porte **38 lignes** quand sa version markdown en
numérote **69**. Ce n'est PAS une troncature — j'ai d'abord écrit qu'il s'arrêtait
à l'identifiant 38 et que DATAFORGE et l'addendum Stelya en étaient absents :
**c'était faux**. Le CSV a sa propre numérotation, c'est une SÉLECTION par
catégorie, et les huit tomes (`access`), tout DATAFORGE V9 et V10 (`dataforge`)
et l'addendum Stelya (`vertical`) y figurent.

Ce qu'il écarte réellement — vingt-huit entrées, recalculées par différence :

- **toute la série spécialisée des huit PDF du 20–21 août** (architecture, CRM,
  ATS, matching, automatisations, intégrations, tableaux de bord, benchmark) ;
- `DATAFORGE_V9_README.md`, c'est-à-dire la DOCTRINE de preuve et de route
  d'achat derrière C08 et C09 — les données V9 sont là, leur mode d'emploi non ;
- le prompt système historique de Laura Site, les deux bundles zip, la
  présentation produit ;
- `Devis_D-2026-005_KEYRUS` — le seul tarif CONTRACTUEL réel du corpus, donc la
  seule pièce qui puisse contredire une grille (C23) ;
- les six captures d'état visible (tarifs, cohorte bêta, MRR) et la mémoire GPT.

La conclusion pratique ne change pas : **lire le markdown, jamais le CSV** — mais
la raison est celle-ci, pas celle que j'avais écrite.

Le manifeste, lui, est exact : 33 fichiers déclarés, 33 présents.

## 5. Précédence des sources, et ordre de lecture des archives

Deux choses distinctes, que le tracker confondait.

**La précédence, elle, est écrite dans le pack** (`SOURCE_PRECEDENCE.md`, huit
rangs) et c'est son contenu le plus durable. ⚠️ **Ce paragraphe recopiait les
huit rangs et ignorait qu'il en existe une SECONDE version dans le même paquet.
Corrigé le 30/08/2026 — la règle n'est plus recopiée ici.**

Deux formulations coexistent dans l'archive 00 : `SOURCE_PRECEDENCE.md:17-24`
(huit rangs, « Ordre **canonique** des sources — itération 3 ») et
`MASTER_DOCUMENT_INVENTORY.md:148-157` (dix rangs, « Hiérarchie **provisoire** »,
dans un fichier titré « **Iteration 2** »). La seconde a été appliquée, sans que
personne compare les deux, par le tracker de l'archive 09
(`archive-09-carte-de-reference-2026-08-25.md:73`).

Ce que la mesure du 30/08 a établi : **zéro inversion d'ordre entre les deux
listes sur 21 paires comparables** — la dix-rangs est un découpage plus fin de la
huit-rangs, à trois éléments près, dont le seul qui compte est que la dix-rangs
**n'accorde aucun rang aux `agent_docs/` du dépôt**. Aucun verdict des onze
chantiers ne s'appuyait sur ce rang (les 16 citations d'`agent_docs/` ont été
relues une par une : six contrôles d'identité de miroir, huit pointeurs de
localisation, et deux **refus explicites** de l'autorité documentaire). Les neuf
autres archives ne sont donc pas à revoir de ce fait.

**La règle en vigueur — les huit rangs, le rang des `agent_docs/`, et ce que ce
rang autorise ou non — est écrite à UN seul endroit :
`agent_docs/iteration-3-precedence-et-certificat-2026-08-30.md` §4.** Ne pas la
recopier ici : c'est le second exemplaire qui divergera. Ce qu'il faut retenir
pour lire la suite de ce document : le dépôt courant est le rang 1, les
`agent_docs/` le rang 5, et un `agent_docs/` peut SIGNALER qu'un diagnostic est
résolu — il ne remplace jamais la lecture du code.

**L'ordre des archives est une DÉDUCTION**, la mienne, pas une citation : le
README n'impose que « `00` avant tout autre paquet ». Le reste se déduit de la
précédence ci-dessus — `08` porte le diff contre le dépôt courant (niveau 1),
donc il dit ce que les autres n'ont plus à demander ; `09` est un miroir
historique (niveau 7), donc il vient en dernier, en mode **auditer** :

`08` → `01` → `02` → `03` → `04` → `05` → `06` → `07` → `09`.

Ce que chaque archive doit reprendre est lisible sans relire ce tracker :
`doctrinesForPack('06')` rend les doctrines qui l'attendent.

## 6. Ce qu'on ne promet pas

| Sujet                                                                | Raison                                                                                                                                                                                                                      |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Le barème Discover piloté par le portefeuille (C07)                  | Le registre le séquence lui-même **après** le dé-silotage des sources ROME/CPV. Renommer le bloc sans changer les sources produirait un barème qui ment. → `06`                                                             |
| Le lexique vertical runtime (C19)                                    | N'existe pas et n'est pas une correction : c'est un chantier d'interface entier (cinq fichiers i18n, aucun équivalent TS de `domain_focus`). → `06`                                                                         |
| L'écran de la table `sites`                                          | Elle n'a **aucun appelant web** : l'onglet Sites lit `raw_analysis.sitesFrance`. Livrer l'écran est du ressort de `01`, pas d'une réparation                                                                                |
| Le tiroir Laura omniprésent (C02)                                    | Chantier d'interface, `03`                                                                                                                                                                                                  |
| L'evidence compte × domaine (C09)                                    | Table à créer, avec son producteur. Sans producteur, ce serait la table vide que ce dépôt passe son temps à corriger. → `06`                                                                                                |
| Une garde sur « pas de scraping » (C24)                              | La règle tient par l'absence de client HTTP. Une garde posée aujourd'hui serait verte sur du vide — décorative                                                                                                              |
| Une garde par doctrine non tenue                                     | Vingt-cinq gardes dont huit n'auraient aucune violation mesurée. Le registre les DÉCLARE `unenforced` avec leur raison, ce qui est l'information                                                                            |
| Le renommage des états de capacité                                   | Voir §3                                                                                                                                                                                                                     |
| La source du profil du routeur `activity`                            | Il lit `profiles` et non `resolve_seller_context` : un espace dont le portefeuille vit dans `esn_profiles` retombe sur la lentille IT. Autre sujet que le libellé. → `06`                                                   |
| La recette lecture/écriture **connecteur par connecteur**            | L'arbitrage la demande quatre fois, et le tracker y avait d'abord répondu par une table de noms. Elle exige d'appeler chaque fournisseur avec un vrai jeton — c'est une recette, pas un refactor. → `04`                    |
| Le rejeu LIVE du jeu de conversations de Laura Site                  | Le jeu EXISTE et tourne hors ligne. Le rejeu live reste opt-in : une clé de production dans les actions, vingt appels par poussée, et une garde qui rougit parce qu'un modèle a tourné sa phrase autrement finit désactivée |
| Les jeux de référence NON-IT (contacts, Stelya)                      | C'est la seule preuve qui dirait qu'un vendeur industriel obtient d'autres personnes. Elle suppose le registre de familles de rôles, qui n'existe pas. → `06`                                                               |
| Langfuse : masquage des données personnelles, tags, dev/staging/prod | Question de données personnelles, pas d'outillage. Le défaut est SÛR (aucun contenu ne sort), donc rien n'est urgent — mais rien n'est fait. → `03`                                                                         |
| Les clés de contrat `itChallenges` / `itAutonomy`                    | Le quatrième porteur du biais IT, et le plus structurant : ce sont des CLÉS qui traversent l'API, le front et le back-office. Les renommer est un changement de contrat, pas de libellé. → `06`                             |
| Les quatre packs d'offre ÉCHAFAUDAGES                                | `supply_chain`, `product_design`, `pmo` et `rh` sont déclarés et vides. Les curer est un travail de contenu métier. → `06`                                                                                                  |
| Le format de ticket en dix champs                                    | Refus motivé, §1.6 : un drapeau sur une colonne additive vide n'éteint rien, et poser un drapeau par lot produirait la case à cocher qui ne fait rien                                                                       |
| La densité de données du second marché                               | Des automatisations planifiées tournent sans assez de données. Ce n'est pas un bug, c'est un manque de matière. → `05`                                                                                                      |
| Le pont mémoire-relation                                             | Limité par l'autonomie des modules — contrainte d'architecture assumée, pas un défaut à corriger. → `05`                                                                                                                    |
| `missions.site_id`                                                   | Colonne déclarée sans lecteur ni écrivain, connue depuis GA-36. Le site d'une mission suppose l'écran de `01`                                                                                                               |

---

## 7. Certificat d'épuisement

**Passe A — dénombrement depuis la matière brute**, et non depuis l'inventaire
(un inventaire ne peut pas prouver sa propre complétude) :

| Dénombré à la source                      | Attendu             | Traité                                                                         |
| ----------------------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| Fichiers sur le disque                    | 33 (+ 2 manifestes) | 33, tous classés — 12 à la racine, 18 `repo_diff_reports/`, 5 `repo_trackers/` |
| Contradictions `## C…`                    | 25                  | 25 entrées de `DOCTRINE_REGISTRY`                                              |
| Invariants (puces de `SOURCE_PRECEDENCE`) | 11                  | 11 entrées de `INVARIANTS`, dont une **sans aucun porteur**, nommée            |
| Lignes de `IMPLEMENTATION_STATUS`         | 28                  | 23 par le §1.1, 5 par le §1.3                                                  |
| Règles de `CLAUDE_CODE_RULES`             | 10                  | 9 tenues, 1 refusée avec sa raison (§1.6)                                      |
| Étapes du workflow `README`               | 8                   | 8, §1.6                                                                        |
| Niveaux de précédence                     | 8                   | 8, §5                                                                          |
| Entrées de `MASTER_DOCUMENT_INVENTORY`    | 69 (md) / 38 (csv)  | delta de 28 recalculé et nommé, §4                                             |

**Passe B — consigne inversée.** Un agent qui n'a pas écrit le code a relu la
source en entier avec une seule question : « qu'est-ce que la source demande et
que le tracker ne mentionne NULLE PART ? » Il a trouvé, et il avait raison :

- trois fichiers jamais inventoriés → §1.6 ;
- **deux affirmations FAUSSES que j'avais publiées** — le CSV présenté comme
  tronqué alors qu'il est une sélection (§4), et « trois lignes de matrice sans
  équivalent » alors qu'il y en a cinq (§1.3). Toutes deux corrigées ici, et
  dans `CLAUDE.md` et la mémoire, où la première avait été recopiée ;
- neuf reports qui dormaient → §6 ;
- une attribution à corriger : le lot 2 **était** demandé par la source (§2).

Ses autres reproches ont été vérifiés et écartés : la taxonomie à six valeurs
est adoptée là où elle change quelque chose (§1.3 garde les `_PARTIAL`), le
« Tier D interne uniquement » est tenu par GA-37, le jeu de conversations de
Laura Site existe, la migration dupliquée `1783000000000` est gardée, et `apps/mcp`
est bien exécuté par la CI.

**Les dix preuves :**

1. **Chaque fichier lu ou classé** — 33/33, table de passe A ci-dessus.
2. **Chaque item statué** — 25 contradictions, 11 invariants, 28 lignes,
   10 règles, 8 étapes, 8 niveaux. Aucun blanc.
3. **Chaque statut prouvé** — les statuts `LIVRÉ` citent un `fichier:ligne` du
   dépôt ; GA-38 ouvre les 60 chemins déclarés par le registre à chaque CI.
4. **Zéro `NON PROUVÉ`** — le seul candidat (`priorsForSiren`) est un refus
   documenté et gardé, pas une incertitude.
5. **Les décisions ouvertes sont NOMMÉES, pas closes** — ⚠️ **réécrite le
   30/08/2026 ; l'ancienne rédaction était fausse.** Elle disait « Zéro décision
   en suspens — les trois questions du 25/08 sont tranchées et livrées ; aucune
   autre n'est ouverte ». La seconde moitié est démentie par un fichier que
   l'archive transporte et que le manifeste déclare : `repo_trackers/
decisions-aout-2026.md`, byte-identique à `agent_docs/decisions-aout-2026.md`.
   Comptage machine du 30/08 : **onze décisions ouvertes, dans deux fichiers** —
   sept dans `agent_docs/decisions-aout-2026.md` (D6 partielle, D8, D13, D15,
   D18, D20, D22) et quatre, non numérotées, dans
   `agent_docs/restitution-tracker.md` (`:236`, `:246`, `:285`, `:286`).
   Ce qui reste vrai, et qui est la seule chose qu'une preuve d'épuisement peut
   affirmer : **une archive est épuisée quand tout ce qu'elle porte a été LU et
   STATUÉ, pas quand tout ce qu'elle porte a été DÉCIDÉ.** Un chantier n'a pas le
   pouvoir de trancher à la place de Louis ; il a le devoir de ne pas prétendre
   que la question n'existe pas. Détail, méthode de comptage et décisions
   parquées (D330-D332) :
   `agent_docs/iteration-3-precedence-et-certificat-2026-08-30.md`.
6. **Chaque contradiction tranchée** — 25/25 dans le registre, avec ce qu'elle
   supplante. C'est la raison d'être de l'archive.
7. **Chaque lot mergé ET vérifié en live** — PR #1064 et #1065, déployées
   (`3880cb14`), recette §« vérification » ci-dessous.
8. **Suite verte sur le commit de merge** — l'arbre du merge `26f08b1d` est
   IDENTIQUE à celui de la branche testée `db80d721` (`d954ab6f`), donc la suite
   verte porte bien sur le code mergé. API 5 899, web 2 878, contrats 1 959,
   site 351, IA 4 509 ; `check-types`, `format:check`, `lint:exports:types`,
   `eval:gate` sans régression.
9. **Chiffres d'ingestion** — sans objet : ce paquet ne porte aucun jeu de
   données.
10. **Trace écrite** — ce document, `CLAUDE.md`, le changelog FR+EN et deux
    entrées de mémoire.

**Recette live du 25/08** (API et web sur `26f08b1d`, puis `3880cb14`) :

- les neuf domaines de navigation ouverts un par un, aucun écran cassé ; le 7ᵉ
  s'affiche bien « Laura » ;
- le panneau « Secteur de la demande » ouvert, une valeur SAISIE et
  **enregistrée**, relue depuis la base (`road_maritime` sur le besoin
  Blablacar), badge « 1 secteur » après rechargement ;
- **parité démo vérifiée dans la salle de démonstration** : le projet seedé
  porte `road_maritime`, `logistics`, domaine `esn_it` ;
- thème CLAIR : panneau lisible, chips contrastées, badge correct ;
- console sans erreur, réseau en 200/201 sur toutes les routes appelées.

⚠️ **Non vérifié en live, et dit plutôt que supposé** : la borne MOBILE. Le
navigateur piloté ne descend pas sous 1 800 px de viewport dans cet
environnement, donc la coque à quatre onglets n'a pas été exercée. Ce qui est
vérifié : aucun débordement horizontal, et les gardes de responsive du web sont
vertes.

**Décision : l'archive `00_GOUVERNANCE_SOURCE_OF_TRUTH` est ÉPUISÉE.**
