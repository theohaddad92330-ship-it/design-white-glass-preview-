# Les « NON PROUVÉ », re-mesurés — et le défaut est deux fois plus large que la table

> Passe faite le 28/08/2026 sur `e5cfe4a58`, en **deux temps** : re-vérification des lignes de la
> table, puis **passe indépendante** qui cherche la SIGNATURE du défaut au lieu de ses instances.
> Aucun `rg` : tout zéro vient de `grep -rn`.

## 0. Ce que le certificat comptait, et pourquoi il ne se reconstitue pas

Le §11 annonçait « 26 `NON PROUVÉ` », puis « 8 confirmés + 10 jamais re-confrontés ». Les trois tables
en portent **30 lignes**. L'écart n'est pas une erreur : **le 26 est un compte de SYMBOLES, pas de
lignes** — 53/54/55 désignent une seule chaîne, D-16/D-17/D-30 un seul `priorsForSiren`,
D-15/E-30/E-33 une seule primitive `Provenance`.

⚠️ Et un défaut de méthode s'est révélé : **les « 8 confirmés » n'ont reçu AUCUNE annotation**, parce
que leur statut n'avait pas changé. Ils sont donc **indiscernables** des « jamais re-confrontés » par
la seule marque `[PÉRIMÉ 27/08]`. La passe a donc repris **les 20 lignes non annotées**, sur-ensemble
strict des dix — et le choix était le bon : **six des « 8 confirmés » ne le sont plus non plus.**

## 1. Ce qui est BRANCHÉ depuis (la table a encore vieilli d'un jour)

| Ligne              | Symbole                                     | Appelant applicatif                                                                                                                                                   |
| ------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 53/54/55           | l'explication de classement                 | `hooks.ts:42-45` → `MatchExplainSheet.tsx:77` → monté par `MatchDrawer.tsx:20,312`. **Le « meilleur rapport valeur/effort du dossier » EST fait**                     |
| E-31               | `ScoreWithAxes`                             | 4 montages hors tests : `MatchExplainSheet`, `ContactScoreBreakdown`, `WatchlistTable`, `WatchlistDetailPanel`                                                        |
| D-15 / E-30 / E-33 | `Provenance`                                | `ContactLifecycleTimeline.tsx:10,38` · `ContactTableRow.tsx:28,265`. ⚠️ Le doublon `ProjectProvenanceLine.tsx:23` **survit** : dette de convergence, pas de code mort |
| C28                | `NEED_SOURCES`                              | `NeedsFilterDrawer.tsx:4,137` (les 12 valeurs en options) · `saved-view-filters.ts:4,85`                                                                              |
| F130               | `type OutreachScenario`                     | `outreach-sequence.ts:2,376` ← `outreach.service.ts:11,143`                                                                                                           |
| F167               | `meetsEvidenceLevel`                        | `crm-routines.service.ts:9,289` ; `EVIDENCE_REQUIREMENTS` aussi (`:264`)                                                                                              |
| A20b               | `INTERVENTION_FAMILIES`, `/laura/catalogue` | `LauraCataloguePanel.tsx:1,130` ← monté par `routes/settings/notifications.tsx:3,27`. **« L'écran de réglages qui n'existe pas » existe**                             |
| E-49               | portefeuille d'offre                        | **mal classé dès l'origine** : `esn-profile.controller.ts:218,225` ← `features/profile/api.ts:30,36` ← `OfferPortfolioSection.tsx`                                    |

## 2. Ce qui est CONFIRMÉ, avec deux corrections d'énoncé

| Symbole                          | État                                                          | À savoir                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PRODUCT_KPIS`                   | **CONFIRMÉ** — 13 lignes, toutes dans son fichier et son test | ⚠️ **Ce ne sont pas 60 indicateurs, ce sont 22.** Le 60 appartient au jumeau `manager-kpi.ts`, qui LUI est branché de bout en bout (`pilotage.controller.ts:3,102` → `KpiCataloguePanel.tsx` → `PilotagePage.tsx:14,120`). ⚠️ Restent morts **dans le fichier branché** : `kpisOfFamily`, `KPI_COMPLETENESS_ALERT`, `MANAGER_KPI_CADENCES`, `MANAGER_KPI_OWNERS` |
| `METHOD_RULES_KEPT` / `_REFUSED` | **CONFIRMÉ**                                                  | 10 règles, 7 interdits, 0 appelant. _(Un lot en vol le traite.)_                                                                                                                                                                                                                                                                                                 |
| `esnRisk`                        | **CONFIRMÉ**                                                  | l'ENUM est utilisé, **la FONCTION a 0 appelant** — ni `esn-directory.service.ts`, ni `territory.controller.ts`, ni `market-watch.controller.ts`                                                                                                                                                                                                                  |
| `ANONYMISABLE_FIELDS`            | **CONFIRMÉ**                                                  | 3 lignes, toutes dans `cv-anonymisation.ts:39-41`. Aucun test ne le touche. Ses voisins du même fichier sont bien consommés — c'est la LISTE DES CHAMPS qui est morte                                                                                                                                                                                            |
| `resolveChannel` (encaissement)  | **CONFIRMÉ**                                                  | un seul appelant, le circuit **relevé** (`timesheets.service.ts:7,273`). Rien sur l'encaissement. `resolveChannelForContact` est un **homonyme local**, pas le contrat                                                                                                                                                                                           |
| scores risque/opportunité (web)  | **CONFIRMÉ**                                                  | `financeApi.scores` existe avec sa clé de cache, **sans hook ni composant**                                                                                                                                                                                                                                                                                      |
| les personas d'approche          | **CONFIRMÉ**                                                  | cinq symboles, sortie vide pour les cinq. _(Un lot en vol le traite.)_                                                                                                                                                                                                                                                                                           |
| `interventionsOfFamily`          | **CONFIRMÉ**                                                  | `LauraCataloguePanel.tsx:130` **regroupe par famille à la main** au lieu de l'appeler. Effort trivial                                                                                                                                                                                                                                                            |
| `LIVE_STAGES`                    | **CONFIRMÉ**                                                  | 0 mention dans `apps/`                                                                                                                                                                                                                                                                                                                                           |

### Deux qu'il ne faut NI brancher NI supprimer

- **`priorsForSiren`** (D-16/D-17/D-30, un seul symbole compté trois fois) : la preuve du caractère
  délibéré est **dans le registre lui-même**, `doctrine-registry.ts:239` — « n'a AUCUN consommateur
  de production, **et c'est délibéré** : GA-37 refuse qu'un contrôleur UTILISATEUR injecte le
  service ». **Hors lot, définitivement.**
- **`unresolvedSteps`** (D-48) : le symbole **n'existe plus** — une seule ligne subsiste, un
  commentaire qui explique le retrait du 27/08. **Toute reconstruction recrée le doublon.**

---

## 3. La passe indépendante — et c'est elle qui change le sujet

**Un inventaire ne prouve pas sa complétude.** La passe a donc cherché la _signature_ du défaut :
_un symbole exporté de `packages/contracts/src` dont aucun fichier de `apps/` ne prononce le nom._

Le résultat brut (~900 noms) était **inexploitable** : la moitié sont des `*Schema` composés à
l'intérieur de `contracts` et consommés côté application sous leur forme de **TYPE**, jamais par leur
nom. C'est du bruit, pas du code mort. Un second crible sépare les trois cas — _consommé ailleurs
dans `contracts`_ / _consommé par une garde_ / _personne_. Contre-épreuve unique sur les survivants,
tout le dépôt hors `contracts` : **sortie vide.**

> ### **56 fonctions pures exportées et 23 constantes n'ont AUCUN consommateur nulle part.**
>
> Ni application, ni autre module de `contracts` — seulement leurs propres tests.
> **Le défaut est deux fois plus large que les 26 de la table, et la table n'en avait attrapé que 4.**

### Dix modules dont AUCUN export n'est prononcé dans `apps/`

| Module                            | Exports | Classement                                                                                                                                                                   |
| --------------------------------- | ------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemas/proposal.ts`             |      12 | **À BRANCHER** — un **Proposal Studio** complet, 9 sections, `buildProposalOutline`. Aucun écran `/proposals` n'existe                                                       |
| `schemas/contact-views.ts`        |       7 | **À BRANCHER** — les 5 vues de `/contacts` **et le coût affiché avant action** (`bulkEnrichmentCost`)                                                                        |
| `schemas/action-library.ts`       |       7 | **À BRANCHER** — sans ce catalogue, les plans retombent sur « prendre contact »                                                                                              |
| `schemas/org-views.ts`            |       5 | **À BRANCHER** — la distinction « lien sourcé » / « hypothèse », que l'écran mélange encore                                                                                  |
| `schemas/product-kpi.ts`          |       7 | **À BRANCHER** — cf. §2                                                                                                                                                      |
| `schemas/decision-registry.ts`    |       5 | **Interne, normal** — outillage de relecture                                                                                                                                 |
| `schemas/interaction-laws.ts`     |       9 | **Interne, normal** — le fichier le dit : « Il DÉCRIT. Il n'exécute rien »                                                                                                   |
| `schemas/enum-baseline.ts`        |       1 | **Interne, normal** — référence de GA-08 ; **un test EST son consommateur légitime**                                                                                         |
| `fixtures/golden-cases.ts`        |       3 | **Interne, normal** — arbitrage motivé dans le fichier                                                                                                                       |
| `schemas/agent-error-adapters.ts` |       3 | ⚠️ **AMBIGU — à trancher, pas à brancher d'office.** Miroir TS d'un module Python qui vit ; le TS n'est appelé par personne. Soit une parité voulue non gardée, soit du mort |

**Ne sont PAS du code mort malgré 0 mention dans `apps/`** — nommés pour qu'on ne les rouvre pas :
tous les `*Schema` composés dans `contracts` et consommés via `z.infer` ; `fieldSourceRank` ;
`normaliseNeedStatus` ; `priorsForSiren`.

---

## 4. Ce que ça change pour le certificat

La preuve n°4 (« zéro `NON PROUVÉ` ») ne se compte plus en 26. Le périmètre honnête est :

- **~9 symboles** réellement confirmés depuis la table (les autres sont branchés ou délibérés) ;
- **plus 56 fonctions et 23 constantes** que la table n'avait jamais vues ;
- **dont 5 modules entiers** qui sont des écrans à décider, pas des soudures — `proposal.ts` en tête.

⚠️ **Les cinq modules « à brancher » demandent une décision produit AVANT du code.** Un Proposal
Studio et cinq vues de contacts ne sont pas des branchements : ce sont des fonctionnalités qu'on a
écrites, testées, et jamais montrées. Parqués au §6 du journal.
