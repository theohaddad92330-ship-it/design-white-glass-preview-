# Vague de retours bêta — 2026-09-07

Point de départ : `origin/main` = **`917b49629`**.

⚠️ **Piège payé au démarrage** : `git --no-pager log --oneline -1 origin/main` a
rendu `3e46dea32`, qui n'est qu'un **ancêtre**. `git ls-remote origin main` et
`git rev-parse origin/main` s'accordent tous deux sur `917b49629`, et
`git merge-base --is-ancestor 3e46dea32 origin/main` répond OUI. **Croiser
`ls-remote` et `rev-parse` ; `git log -1` ne met pas la tête en premier.**
Prod servie au démarrage : api `917b49629` — à jour. (IA : `cbe8cd335`, à
recouper avant toute conclusion sur un écran servi par le service IA.)
Corpus : **73 issues ouvertes**, toutes du widget `beta-feedback`, quasiment toutes
rédigées comme des specs (3,5 k à 12,6 k caractères) → traitées au §3 bis du skill.

## Répartition mesurée

| Zone | Issues | Compte |
| ---- | ------ | ------ |
| `/clients` (back-office `apps/dashboard-manager`, label `beta-backoffice`) | 1642 1643 1646 1648 1655 1656 1657 1665 1667 1669 1671 1672 1673 1674 1676 1678 1681 1682 1683 1684 1685 1686 1687 1688 | 24 |
| `/accounts/:id` (dossier de compte) | 1603 1604 1605 1606 1607 1608 1609 1611 1612 1613 1630 1631 1632 1638 1640 | 15 |
| `/dashboard` (dont le cœur MARKET MEMORY) | 1573 1574 1615 1616 1617 1618 1619 1620 1621 1622 1627 | 11 |
| `/search` (lancement d'analyse) | 1589 1590 1591 1592 1593 | 5 |
| `/accounts` (liste) | 1417 1575 1576 1581 | 4 |
| `/chat` (Laura) | 1596 1628 1629 | 3 |
| `/pilotage` | 1440 1633 | 2 |
| écrans uniques (`/pilotage/marche` 1635, `/watchlist` 1634, `/settings/profile` 1636, `/discover` 1626, `/consultants` 1625, `/briefing` 1637, `/billing` 1639, `/accounts/partners` 1624, visuel d'ensemble 1472) | | 9 |

## Contexte mesuré avant dispatch

- CI : médiane **3 min 56 s**, 20/20 succès, **8 runners en ligne et libres**
  (`vars.CI_RUNS_ON=bellum-ci`). → PR courtes possibles, plusieurs en vol côté CI.
- **Pas de préproduction** : la contrainte n'est pas la file de CI mais la
  PRODUCTION — un seul lot non recetté en prod à la fois.
- Mémoire machine : 76 % libre (`memory_pressure`). ⚠️ `ps -Ao` ne rend que
  **31 lignes** dans ce bac à sable — on voit la cellule, pas la machine : on ne
  dimensionne PAS la vague dessus, on part étroit et on élargit.
- Horodatages de migration : max sur `main` = `1791823551000`, aucun doublon.
  ⚠️ `Date.now()` vaut `1788810417471`, donc **en retard** sur le dépôt : toute
  réservation part au-dessus de `1791823551000`.
- 10 worktrees résiduels de sessions précédentes, tous `NON-MERGE` et propres.
  **Non supprimés** — ils peuvent porter du travail non fusionné qui n'est pas le mien.

## Vague 1 — diagnostic (11 éclaireurs, lecture seule)

| # | Périmètre | Issues |
| - | --------- | ------ |
| E1 | `/clients` A | 1642 1643 1646 1648 1655 1656 1657 1665 |
| E2 | `/clients` B | 1667 1669 1671 1672 1673 1674 1676 1678 |
| E3 | `/clients` C | 1681 1682 1683 1684 1685 1686 1687 1688 |
| E4 | dossier compte A | 1603 1604 1605 1606 1607 |
| E5 | dossier compte B | 1608 1609 1611 1612 1613 |
| E6 | dossier compte C | 1630 1631 1632 1638 1640 |
| E7 | market memory — fondations | 1615 1616 1617 1618 1619 |
| E8 | `/dashboard` | 1573 1574 1620 1621 1622 1627 |
| E9 | `/search` | 1589 1590 1591 1592 1593 |
| E10 | `/accounts` + Laura | 1417 1575 1576 1581 1596 1628 1629 |
| E11 | écrans divers | 1440 1472 1624 1625 1626 1633 1634 1635 1636 1637 1639 |

## Résultats du diagnostic, éclaireur par éclaireur

### E1 — `/clients` A · 25 demandes / 14 LIVRÉ / 1 PARTIEL / 9 ABSENT / 1 DÉCISION

**Déjà livré, à clore après recette** : **#1643** (4 graphiques : Line multi-séries
`_components/charts.tsx:221`, StackedBar `:315`, Waterfall `:420`, CohortGrid `:490`,
tous avec appelant réel) · **#1655** (les 5 points : `manual-billing-reminder.ts:60`
J+3/J+15/J+30, refus `dispute_open` `:287`, ton paramétrable, journalisation ajoutée
par `3e46dea32`) · **#1656** (`offers-economics.tsx:17-18,61,134` ← `offers-panel.tsx:72`
← `facturation/page.tsx:55`, y compris la colonne « manquante »).

**Constats FAUX de l'issue** : `1665.2` (« le motif d'impersonation n'est pas
obligatoire ») — il l'est, livré par **#1670** (`impersonate.tsx:19-30,71`,
`start-impersonation.dto.ts:21`).

**À coder** : `1642.1` `Delta.tsx` + `Skeleton.tsx` sans aucun appelant (S) ·
**#1646** cockpit business sur `/` — les 6 KPI existent mais dispersés, `/` redirige
vers `/monitoring?view=cockpit` qui est la télémétrie IA, pas le business (M) ·
**#1648** rapport hebdo fondateurs (L) · **#1657** route `/produit` + suivi d'écran —
`product-event.entity.ts:21` ne connaît pas la notion d'écran (L) · `1665.3` page
d'audit des impersonations — ni `ended_at`, ni durée, ni actions (L).

**Décision à poser** : `1665.1b` — le provisioning manuel back-office doit-il pouvoir
démarrer un abonnement Stripe, ou reste-t-il « sur facture uniquement » comme
`create-client-form.tsx:9` l'assume ? _Recommandation : rester sur facture._

**Trouvé sans qu'on le demande** : `src/ui/index.ts:1-24` affirme « CE SOCLE N'A
AUCUN APPELANT » — périmé depuis `9c158ca32`. Et `knip.json:14` n'ignore que
`Skeleton.tsx`/`Heatmap.tsx`, pas `Delta.tsx`, tout aussi orphelin.

### E3 — `/clients` C · 20 demandes / 2 LIVRÉ / 3 PARTIEL / 14 ABSENT / 1 DÉCISION

⚠️ **Le lot a déjà été traité EN DOCTRINE le jour même** : commit `4a277f3ba`
« l'analytique produit mesure le PRODUIT, jamais la personne (#1681) », entrée
`c64_analytique_produit` dans `doctrine-registry.ts:1721-1745`, `codeState: 'partial'`,
avec un gap règle par règle. E3 a revérifié chaque affirmation : **une seule est
devenue fausse depuis** (règle 1 a maintenant un appelant).

**Correction d'un fait de MON brief** : `apps/web/src/architecture/sections.test.ts`
**n'existe pas**. Le vrai chemin est `apps/web/src/components/navigation/sections.test.ts`,
et il ne garde que la nav du produit client. La porte du back-office est
`apps/dashboard-manager/src/architecture/rail-et-environnement.test.ts` (un `href` de
`NAV_SECTIONS` sans `page.tsx` fait échouer).

**Déjà livré** : `1681.3` (`no-session-replay.spec.ts:247`, GA-240) · `1688.1`
(regroupement des retours par écran, `feedback.logic.ts` ← `feedback/page.tsx:128`,
livré sous #1658.2 — **#1688 redemande une chose en production**).

**La racine du lot** : `1682.1`, le traceur front et son union fermée de 9 événements,
**n'existe pas** (`ProductEventName` `product-analytics.service.ts:14-40` ne contient
aucun des 9 noms ; `search_performed` : 0 occurrence dans tout le dépôt). **#1683,
#1684, #1685, #1687, #1688.2** en dépendent toutes. Seul **#1686** (entonnoir
d'onboarding par cohorte) est livrable SANS lui : ses événements existent déjà et sont
déjà lus (`onboarding.service.ts` → `analytics-overview.service.ts`), et le seuil
`COHORT_MIN_SPACES=3` a un appelant réel (`charts.logic.ts:149,168`).

**Contradiction d'architecture à trancher** (`1681.4`) : le flux comportemental et le
flux d'audit d'espace partagent la table `product_events`, qui a des exigences
**opposées** — anonymat contre traçabilité nominative. `SESSION_HASH_ROTATION_HOURS`
existe (`product-analytics-privacy.ts:75`) et **n'a aucun appelant**, pendant que
`product_events.user_id` est permanent et obligatoire.

**Décision** : `1681.6` — la relecture juridique RGPD doit-elle précéder le déploiement
du traceur #1682 ? _Recommandation : oui, avant, pas après._

### E7 — Market memory, fondations · 30 demandes / 8 LIVRÉ / 5 PARTIEL / 14 ABSENT / 1 REFUS / 2 DÉCISION

**#1617 est DÉJÀ LIVRÉ** (PR #1696, `d66319298`) : `resolveMarketCompany`
(`market-company-resolution.ts:147`) ← `market-memory.service.ts:113,282` ←
`accounts.controller.ts:219,361` ; `strength: 'domain' | 'inferred'` interdit la fusion
par nom seul ; les six golden tests nommés par l'issue (Thales, SNCF, Orange, La Poste,
EDF, CGI) sont dans `market-company-resolution.spec.ts:193-245` ; un `unresolved` ne
touche jamais un dossier (`market-memory.service.ts:118-121`).

**REFUS motivé, déjà écrit dans le code** : `1617.2` — la hiérarchie à 5 échelons
(SIREN → registre → domaine → LinkedIn → nom) est impossible, **le corpus n'en porte
que deux** (`market-company-resolution.ts:39-52`), et l'ordre « domaine > nom » est
renversé par la production elle-même (`group.bnpparibas`).

**Ordre imposé** : #1615 (manifest, checksums, `dataset_version`) **avant** #1616.3/4 ·
#1616 (migration d'audit + version) **avant** #1616.7 (la page admin lit ce que la
migration écrit) · #1619 (`EvidenceOrigin`, producteur) **avant** #1618 (façade
`AccountIntelligenceContext`, consommateur) · **#1618 en dernier**, c'est la façade.
Toute colonne nouvelle est **additive** — 60 067 lignes réelles en prod.

**Risque réel trouvé sans qu'on le demande** : `ingest-market-memory.ts:187-197`
fait un `upsert` par lots de 500 **sans transaction englobante**. Un crash au lot 10/20
laisse un état mixte, et rien ne le teste.

### E9 — `/search` · 12 demandes / 3 LIVRÉ / 3 PARTIEL / 5 ABSENT / 1 REFUS déjà respecté

**Déjà livré** : `1589.1` (l'intent picker existe et est branché — `IntentPicker.tsx`
← `SearchComposer.tsx:87`, les 6 libellés demandés matchent `INTENT_SUGGESTIONS`) ·
`1593.1` et `1593.3` (`SearchLaunchSuggestions.tsx` ← `Search.tsx:184-391`, avec son
test nommé `(#1593)`).

**Les 4 demandes ABSENTES convergent vers UN SEUL manque racine** : il n'existe aucun
endpoint qui expose `MarketMemoryService.coverageFor()` **avant** la création d'un
compte, à partir de l'identité choisie à l'autocomplétion. Le service rend déjà
exactement les quatre données demandées ; un endpoint quasi identique existe mais
réduit et scopé à un compte CRM existant (`accounts.controller.ts:347`
`GET :id/market-context`). **Un lot** — la preview pré-compte — nourrit ensuite 1591,
1592.2 et 1593.2.

**Aveu dans le code** : `SearchLaunchSuggestions.tsx:16-21` écrit noir sur blanc que
« la partie ranking par mémoire marché n'existe pas encore ».

**Écart doctrine trouvé sans qu'on le demande** : `demo-dataset.ts` / `demo-coverage.ts`
ne portent **aucune** entrée `market*`. La mémoire marché n'est pas semée en démo — ça
bloquera la recette démo de tout ce lot.

**Décision technique du lot** (non bloquante) : étendre `GET /accounts/:id/market-context`
pour accepter une identité sans compte CRM, ou créer un endpoint dédié dans
`companies.controller.ts` — qui connaît déjà `MarketMemoryService` pour l'autocomplétion.
_Recommandation : `companies.controller.ts`, la plomberie y est déjà (`withMarketPaths`
`companies.controller.ts:69-90` ← `SearchSuggestionItem.tsx:42-77`)._

### E5 — dossier de compte B · 28 demandes / 0 LIVRÉ / 27 ABSENT / 1 DÉCISION

**Le constat qui commande tout le reste** : PR #1641 n'a livré **qu'un seul
consommateur produit** — le popover de la LISTE de comptes (`AccountTableRow.tsx:238`
→ `AccountMarketContextButton.tsx`, qui ne lit que `esn_observed`/`paths_observed`).
**Aucun des cinq onglets du dossier de compte** n'importe `MarketMemoryService`.

**Trois familles, dont une bon marché et immédiate :**

- **A — des colonnes ingérées que personne ne lit.**
  `market-company-signal.entity.ts:62` (`externalizationScore`, 0-100, nullable) et
  `:69-75` (`headcountBracket/Min/Max`), plus `city`/`region`, sont **chargés** par
  `market-memory.service.ts:180` puis **jetés** : l'objet `coverage` construit
  lignes 202-208 ne recopie que `marketPaths`/`esnObserved`/`observedStack`/
  `roleFamilies`/`exEsnPresent`. Zéro appelant hors ingestion. C'est mot pour mot le
  défaut n°1 de `CLAUDE.md`, dans le module le plus récent du dépôt.
- **B — un seul consommateur** (ci-dessus) : touche #1608, #1609, #1611, #1612.
- **C — le score ne connaît que cinq axes** (`score_axes.py:44-50` : fit_offre,
  timing, accessibilite, concurrence, capacite) et `PROOF_TYPES`
  (`enum-baseline.ts:241`) n'a pas `market_observation`. Conditionne tout #1613.

**Garde-fous portés par les issues, à respecter à la CONSTRUCTION** : jamais de
NO-GO technologique par absence (#1611) · Market Memory ne crée jamais une personne,
un `reportsTo`, un champion (#1609) · ni une preuve ni un témoignage (#1612) · jamais
de seuil Forte/Moyenne/Faible sur le nombre BRUT de parcours, corrélé mécaniquement à
la taille (#1613) · « empreinte observée ≠ site officiel » (#1608).

**Décisions** : `1609.4` — écrire la garde `market-memory-never-a-person.test.ts`
**avant** de construire 1609.2/1609.3, sur le patron de `org-link-provenance.test.ts`,
plutôt que de compter sur l'absence de code. _Recommandation : oui._
`1613.2` — `externalization_score` du corpus est-il normalisé par le fournisseur
contre une cohorte, ou un score brut maquillé en 0-100 ? **Sans réponse, l'afficher
violerait la règle que #1613 pose lui-même.**

### E4, E6, E8, E10, E11 — le reste du corpus

Chiffres cumulés des 11 éclaireurs : **73 issues → ~308 demandes numérotées**,
dont **~82 LIVRÉ · ~41 PARTIEL · ~166 ABSENT · 5 REFUS · ~14 DÉCISION**.

## LE CONSTAT QUI COMMANDE TOUT LE CORPUS

Quatre éclaireurs y sont arrivés **par des chemins indépendants** (E4 sur le dossier
de compte, E8 sur le tableau de bord, E9 sur `/search`, E11 sur dix écrans) — c'est
donc une convergence qui vaut preuve, pas un écho :

> Les ~45 retours « mémoire marché » demandent **la même chose vue depuis dix écrans**.
> `MarketMemoryService` est en production depuis le 06/09 avec 60 067 entreprises, et
> **cinq surfaces seulement le lisent** : la liste de comptes (popover #1582), l'onglet
> Partenaires (#1579), l'onglet Couverture (#1610), l'adressabilité (#1631) et la ligne
> d'anomalie du cockpit (#1572). **Huit écrans nommés par les retours ne le lisent pas
> du tout** : `/pilotage/qualite`, `/pilotage/marche`, territoire, briefing,
> `/settings/profile`, découvrir, reverse market, `/search`.

Ce n'est donc pas dix chantiers, c'est **un objet à concevoir une fois** (un agrégat
de couverture à l'échelle du portefeuille — aujourd'hui tout se fait compte par
compte, jamais bouclé sur le portefeuille) puis à décliner huit fois.

**Et le geste le plus rentable du corpus est une GARDE, pas une fonctionnalité.**
E8 l'a mesuré : la divergence que #1621 redoute (« 41 dans Account, 38 dans Partners,
44 dans Laura ») **n'existe pas encore**, précisément parce que quatre surfaces ne
lisent rien. Elle apparaîtra à la première surface branchée hors du service canonique.
La garde `market-memory-single-source` doit donc être posée **AVANT** ces
branchements — et exempter nommément l'exception déjà documentée
(`companies.controller.ts:95-98`, `toDisambiguationMarketPaths`, #1586).

## Les REFUS — à dire, jamais à appliquer en silence

| Demande | Règle citée |
| ------- | ----------- |
| **#1417.2 / #1440.6** — livrer `#FAFAFC`, `#E8E8EE`, `#6B6B76`, 13/15/26 px au littéral | D79 + D80 (`CLAUDE.md:96-97`). ⚠️ **#1472 a déjà refusé EXACTEMENT ces valeurs** : 13, 15 et 26 px sont les barreaux que D80 a supprimés le 23/08. C'est la troisième fois. |
| **#1603.6 / #1617.2** — hiérarchie de résolution à 5 échelons (SIREN → registre → domaine → LinkedIn → nom) | Refus déjà écrit dans le code (`market-company-resolution.ts:29-48`) : **le corpus n'en porte que deux**. Et l'ordre « domaine > nom » est renversé par la production (`group.bnpparibas`). |
| **#1590.3 / #1592.1** | REFUS déjà respectés — ce sont des garde-fous, rien à faire. |

## Les DÉCISIONS — parquées, avec leur défaut conservateur

Personne n'étant là pour trancher, chacune part sur **le défaut le plus conservateur**
(ce que le dépôt fait déjà ailleurs, sinon la lecture la plus étroite, sinon rien).

| # | Question | Défaut retenu |
| - | -------- | ------------- |
| #1639 | politique de crédits de la mémoire marché | **arrêt obligatoire (facturation)** — rien livré. Constat : aucune surface ne débite aujourd'hui, tout y est déjà gratuit de fait. |
| #1613.2 / #1640 | `externalization_score` est-il normalisé par cohorte, ou brut maquillé en 0-100 ? | **ne pas l'afficher** + poser la garde qui l'interdit. L'afficher violerait la règle que #1613 pose lui-même. |
| #1622.5 | geler le branchement de nouvelles surfaces tant qu'aucun jugement terrain n'existe ? | **oui** — l'ingestion du 06/09 n'a jamais été confrontée à un jugement humain. |
| #1575.2 | un compteur à 0 doit-il être cliquable ? | **non** — #1580 l'a tranché (« une valeur à ZÉRO reste une métrique NEUTRE »). ⚠️ L'énoncé de #1575 affirme le contraire de ce que fait le code : c'est l'issue qui se trompe. |
| #1605.7 | remonter le seuil par ligne ESN de 2 à 3 ? | **non** — `MARKET_OBSERVATION_MIN_PERSONS = 2` est documenté comme délibérément distinct du seuil compte. |
| #1603.2 / #1616.2 | renommer les 4 tables de prod pour matcher 7 noms illustratifs ? | **non** — 60 067 lignes en production, et les issues disent « du type ». |
| #1681.4 | séparer le flux comportemental du flux d'audit dans `product_events` ? | **parquée** — exigences opposées (anonymat contre traçabilité nominative). |
| #1681.6 | relecture juridique RGPD avant le traceur #1682 | **avant, pas après.** |
| #1667.1 | reconstituer un historique Reflag par espace ? | **vérifier d'abord** si l'API admin du fournisseur l'expose, avant d'investir dans un sondage planifié. |
| #1636.1 | « ton ESN dans la mémoire marché » | **ne pas livrer** — l'issue bloque elle-même son lancement. |

## Les CONSTATS FAUX trouvés dans les retours

- **#1665.2** — « le motif d'impersonation n'est pas obligatoire » : il l'est, livré par #1670.
- **#1606.1** — vrai à 09:31 le jour du dépôt, **faux à 13:49 le même jour** (PR #1689).
- **#1633.3** — la page `/admin/market-memory` présentée comme existante **n'existe nulle part**.
- **#1575.2** — voir ci-dessus, l'issue affirme l'inverse du code.
- **#1629.1** — « DataForge » comme palier de la hiérarchie de vérité n'existe pas dans le dépôt.
- **#1688.1** — redemande le regroupement des retours par écran, **déjà en production** (#1658.2).
- **#1642** — `src/ui/index.ts:1-24` affirme « CE SOCLE N'A AUCUN APPELANT » : périmé depuis `9c158ca32`.
- **Deux décalages d'écran** : #1634 est taguée `/watchlist` mais son corps décrit
  `/discover/territoire` ; #1624 est taguée `/accounts/partners` mais son corps décrit
  l'onglet Partenaires du dossier de compte. Vérifier l'écran réel avant de coder.

## Vague 2 — écriture (5 lots, périmètres disjoints, zéro décision en suspens)

| Lot | Périmètre de fichiers | Issues | Plage de migration |
| --- | --------------------- | ------ | ------------------ |
| W1 socle de tableau | `apps/dashboard-manager/src/ui/**` + `app/users/_components/users-table.tsx` | #1672.1/.4/.5/.6, #1674.5, #1642.1 | — |
| W2 `/produit` cohortes | `app/produit/**`, `apps/api/src/modules/analytics/**` | #1686 | 1791824000000+ |
| W3 `/securite` | `app/securite/**`, `backoffice-access-journal.*` | #1671.3 (affichage), #1671.4 | 1791824100000+ |
| W4 cockpit business | `app/page.tsx`, `app/_components/cockpit-business*` | #1646 | — |
| W5 mémoire marché dossier | `apps/web` dossier de compte + i18n + garde | #1640.3/.5/.6, #1631.7, #1632.5 | 1791824200000+ |

⚠️ **`nav-sections.ts` est interdit à W2 et W3** — deux agents en avaient besoin.
Les deux entrées de navigation sont posées par l'intégrateur, depuis leurs rapports.
Sans elles : garde `rail-et-environnement.test.ts` rouge **et** écran atteignable par
aucun clic.

## Vague 3 — préparée, pas encore lancée

Non lancée tant que la vague 2 n'a pas rendu : la machine ne se mesure pas depuis ce
bac à sable (`ps` ne rend que 31 lignes — on voit la cellule, pas la machine), donc on
part étroit et on élargit, jamais l'inverse.

| Lot | Périmètre | Issues |
| --- | --------- | ------ |
| W7 | module `market-memory` + son contrat + la garde « une seule vérité » | #1621.1, famille A (colonnes ingérées jamais lues) |
| W10 | `/pilotage` réagencement (aucune mémoire marché) | #1440.1, #1440.4 |
| W11 | 5ᵉ compteur « parcours observés » de `/accounts` | #1575.1, #1575.3 |
| W12 | `/dashboard` : ranking des comptes silencieux, 2 CTA, badge | #1573.4, #1573.5, #1574.2 |

Puis, **après W7 seulement** (producteur avant consommateur) : la preview pré-compte
de `/search` (#1589.2, #1591.1, #1592.2, #1593.2) et l'agrégat de couverture du
portefeuille (#1633, #1635, #1634).

## Ce qui est TRANCHÉ

- Ordre imposé : un lot qui touche une FONDATION (contrats partagés, migration,
  énumération) ne part jamais en même temps qu'un lot qui la consomme.
- `#1639` (`/billing`, politique de crédits) est un **arrêt obligatoire** du dépôt
  (facturation) → il ne se livre pas sans arbitrage de Louis.
