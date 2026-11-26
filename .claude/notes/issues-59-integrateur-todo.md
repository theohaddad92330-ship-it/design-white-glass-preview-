# Ce que les agents laissent à la frontière — la liste de tâches de l'intégrateur

> Sur une vague de trente lots, **huit ont livré du travail JUSTE qui ne servait à rien**
> tant que l'intégrateur ne l'avait pas fini. Ce n'est pas un défaut des agents : c'est la
> conséquence mécanique du « NE TOUCHE À AUCUN AUTRE FICHIER » qui rend l'écriture
> concurrente possible. Le périmètre strict empêche les collisions ; il coupe aussi les câbles.
>
> **Cette liste est une liste de TÂCHES, pas une liste d'excuses.**

## De B1-e (`2db40a92e`, `feat/adressabilite-chemin-et-relation`) — VÉRIFIÉ

Commit réel, 9 fichiers, 613 insertions, conforme au rapport. Vérifié à la main :
`accountAnalysisShape:115` déclare bien `access_barrier` et **pas** `addressability` ;
`grep addressability apps/api/src/modules/demo/` rend **0**.

1. ⚠️⚠️ **`raw_analysis.addressability` est absent du CONTRAT, donc la garde de parité démo
   est AVEUGLE.** `demo-coverage.spec.ts:131` itère `analysisContractKeys()` : une clé qui
   n'y est pas ne peut pas manquer. Conséquence mesurable : le champ est écrit en production
   depuis le 06/09, **semé nulle part**, et la carte Adressabilité s'ouvre sur « Adressabilité
   non disponible pour ce compte » **dans la démo publique** — sans qu'aucun test ne rougisse.
   → déclarer la clé dans `packages/contracts/src/schemas/analysis/account-analysis.ts`,
   puis la seeder dans `demo-dataset.ts` **ou** la classer dans
   `DEMO_ANALYSIS_KEYS_INTENTIONALLY_ABSENT` avec sa raison.
   **« Personne ne peut garder ce qui n'a pas de nom. »**
2. **Semer l'axe RELATION en démo** : la salle n'a pas de CRM connecté, donc l'axe y restera
   non mesuré même une fois le point 1 réglé.
3. **Le câblage de l'axe `path`** — 5 maillons, dont 3 hors du périmètre de B1-e :
   `analysis.service.ts:1095` et `analysis-ondemand.service.ts:981` lisent `paths_observed`
   **à côté de `resolveCrmPresence`** (le geste symétrique est déjà écrit) → `AnalysisJobData`
   (`analysis.worker.ts:69`) → clé de fil `market_paths_observed` → `research.py` →
   `phase1_research.py:1518`. Le seuil de 3 existe déjà :
   `packages/contracts/src/schemas/market-memory.ts:57` (`MARKET_MEMORY_MIN_PATHS`).
4. **Docblock périmé** : `apps/api/src/modules/account-access/access-addressability.spec.ts:1-25`
   affirme encore « il n'a AUCUN producteur qui l'écrit sur un compte du portefeuille ».
   **Faux depuis le 06/09.**
5. **Le libellé du facteur reste FRANÇAIS dans la charge utile IA** — en anglais l'écran rend
   « Relation — <libellé français> ». Le motif préexiste sur `lock` et `proportion` : c'est le
   défaut « libellé d'affichage écrit hors i18n », il touche les **trois** axes.
6. **Entrée de changelog** (FR + EN) — la capacité est user-facing.

## Ce qui reste réservé à l'intégrateur, tous lots confondus
- `packages/contracts/src/changelog/**` — conflicte à CHAQUE vague parallèle
- `CLAUDE.md`, `agent_docs/env-reference.md`
- `apps/api/src/app.module.ts` — un module non importé = tout le lot devient « du code que
  personne n'appelle », et GA-77 le dit
- `apps/dashboard-manager/src/lib/nav-sections.ts`
- Après chaque fusion : `/bin/ls apps/api/src/migrations/ | /usr/bin/grep -oE "^[0-9]+" | sort | uniq -d`
  (doublon préexistant connu et attendu : `1783000000000`)

## De B1-g (`650c49ba7`, `feat/briefing-memoire-marche-departage`) — VÉRIFIÉ

Commit réel, 6 fichiers, 620 insertions, conforme au rapport. Vérifié à la main :
`git show origin/main:…/briefing.controller.ts | grep -c market` rend **0** (`rc=1`) —
le constat « la mémoire marché n'était pas lue sur `/briefing` » était juste.

1. ⚠️ **Le lot INTRODUIT une divergence, et l'agent le dit lui-même** : `accountsToWatch` est
   désormais trié dans le contrôleur, mais `buildBriefingActions` (dans `BriefingService`)
   construit les cartes « À faire maintenant » à partir de l'ordre **ORIGINAL**. Les deux blocs
   du MÊME écran peuvent donc afficher les mêmes comptes dans deux ordres différents.
   Avant le lot, les deux étaient arbitraires **mais identiques**. C'est une régression de
   cohérence qu'il faut refermer AVANT le merge.
   → Le geste le moins cher : réordonner les actions de `kind: 'account'` dans le CONTRÔLEUR,
   avec le même comparateur (`rankAccountsToWatchByMarket`). Déplacer le calcul dans
   `BriefingService` consommerait **le dernier slot de GA-07** — à ne pas faire.
2. **Le réordonnancement est SILENCIEUX à l'écran** : `DailyBriefing['accountsToWatch']` ne porte
   pas de `market_paths`, contrairement à `CockpitCoverageAnomaly` / `CockpitDormantOpportunity`.
   Aucun badge « potentiel structurel » sur `/briefing` là où `/pilotage` en affiche un.
   → Décision : est-ce qu'on montre le badge ? Si oui, c'est un lot séparé qui touche
   `packages/contracts` (champ optionnel, extension seulement). **Parqué** — le tri seul est
   déjà la valeur, et un badge de plus sur un écran de démarrage se justifie séparément.
3. Aucune traduction, aucun semis de démo, aucune entrée de changelog — **et c'est juste** :
   aucune chaîne d'affichage neuve, aucun champ neuf, et les tables `market_*` ne se sèment
   jamais en démo.

## Piège d'outillage payé dans cette vague

⚠️ **Le hook RTK bloque toute commande `git` dans un worktree d'agent isolé** (message
« ne peut pas être montré ne pas être git »). Contournement mesuré par l'agent :
appeler le binaire par son chemin absolu (`/opt/homebrew/bin/git`), qui échappe au hook.
Même famille que les faux zéros de `grep`/`ls` du PATH : **ce qui fonde une décision passe
par le binaire, jamais par le PATH réécrit.**

## De B1-b (`077dc78fd`, `fix/backoffice-accessibilite-trois-trous`) — VÉRIFIÉ

Commit réel, 4 fichiers exactement dans le périmètre, 518 insertions.
**Contraste RECALCULÉ par l'intégrateur, indépendamment** : `#0d0a1a` sur `#8071f6` = **5,22:1**
(sombre), `#ffffff` sur `#5d4de0` = **5,83:1** (clair), et l'ancien `#ffffff` sur `#8071f6` =
**3,74:1**. Les trois chiffres du rapport tombent au centième. Le défaut AA hérité est **réglé**,
`HERITAGE_NON_CORRIGE` est vide.
Audit d'icônes : 100 `<button>`, 10 icône-seule, **les 10 déjà nommées** ⇒ 0 correction. Une
absence de travail dite honnêtement vaut mieux qu'un faux positif corrigé.

1. Noter dans `agent_docs/chantiers-livres.md` que **#1674 passe de 6/9 à 9/9**.
2. ⚠️ **Deuxième occurrence d'une cause racine connue** : `#1674` est un **hexadécimal valide**
   (`1`,`6`,`7`,`4`) et a fait échouer `couleurs-passent-par-un-token.test.ts` depuis une chaîne
   de `describe`. Déjà payé une fois (« une garde s'attrape sur ses propres numéros d'issue »).
   **Deux fois = une règle** : un numéro d'issue ne s'écrit pas dans une CHAÎNE de test, seulement
   dans un commentaire JSDoc (déjà exempté). → à remonter en mémoire.

## De B1-f (`8d7322992`, `fix/jointure-corpus-registre-mesurable`) — VÉRIFIÉ, avec UN ROUGE

Commit réel, 12 fichiers, +1266/−34. L'agent a **corrigé deux erreurs de mon brief**, les deux
vérifiées : `apps/api/src/entities/**` **n'existe pas** (c'est `apps/api/src/database/entities/`),
et le rouge est **GA-65**, pas GA-16.

1. ⚠️⚠️ **ROUGE CI BLOQUANT, à poser avant le merge** — `TABLE_SCOPES['market_company_alias']`
   manque dans `packages/contracts/src/schemas/table-scopes.ts` (fondation, hors du périmètre de
   l'agent). Entrée à coller après `market_company_stack` (:198). ⚠️ La raison doit faire **plus
   de 80 caractères**, GA-65 le vérifie :
   ```ts
   market_company_alias: {
     category: 'shared',
     audience: 'market',
     reason:
       "Le rapprochement entre une raison sociale et une entreprise du corpus (#1756) : « SG SOCIETE GENERALE » → « societe generale ». C'est un fait de MARCHÉ, le même pour tous les espaces, et la même raison que `market_company_signal`. Elle ne porte ni identité, ni relation, ni opinion d'espace — rien qu'une équivalence de nom et sa provenance ; ce qu'un espace pense d'un compte reste dans `accounts`.",
   },
   ```
2. ⚠️ **GA-258 est devenue borgne sur la cinquième table.**
   `market-memory-single-source-of-truth.spec.ts` ne connaît que quatre entités/tables `market_*` ;
   `MarketCompanyAliasEntity` / `market_company_alias` n'y sont pas. Elle reste **verte** — c'est
   exactement une garde qui ne voit pas ce qui n'est pas dans sa liste. Deux lignes à ajouter.
3. **Aucun écrivain de la table** — voulu. La décision est tranchée (**le pack de données livre les
   alias**) ⇒ il reste à poser le **chemin d'import** dans `market-memory-import.ts` / le script
   d'ingestion. Lot suivant.
4. **Un quatrième motif `unresolved` pour la file de revue** demanderait un champ de contrat
   (`MarketReviewItem.reason` ne connaît que `ambiguous_name` / `ambiguous_domain`). L'agent s'est
   arrêté là, à juste titre. À faire si la ligne de journal se révèle trop pauvre.

**Ce qu'on peut MESURER après ce lot, et qu'on ne pouvait pas** : `event=market_memory_unresolved`
donne `unresolved` / `looked_up` (le dénominateur) **et `companies[]` avec la `match_key`** — c'est
exactement ce qu'une ligne d'alias aurait à rapprocher. Plus `market_memory_resolved_by_alias` pour
savoir si la table aide ou attrape de travers. **Une ligne par APPEL, pas par compte**, sans
troncature : une liste coupée fait lire le sous-total comme un total.

⚠️ **Nuance honnête de l'agent, à garder** : ce n'est pas *byte*-identique au niveau SQL — un
`SELECT` indexé de plus part, **uniquement sur le chemin qui échouait déjà**. Le RÉSULTAT est
identique. Il l'a dit plutôt que de surclaimer.

## De B1-a (`da83c03d6`, `feat/analytique-produit-lecture`) — VÉRIFIÉ

Commit réel, 15 fichiers, +3 079/−8. Catalogue de 98 routes FR+EN, service de lecture à 6 agrégats,
4 routes internes, seuil des 5 sessions branché en 7 points + `analytics-overview` + `team-kpis`,
trois gardes (GA-265/266/267) dont chacune a montré son rouge sur du VRAI code cassé volontairement.
Aucune migration : `product_events` existait déjà — la plage réservée `1791830000000–…` reste **libre**.

### Ce que l'agent a corrigé chez l'éclaireur — vérifié par l'intégrateur, il a raison
S2 citait `RecentActivityFeed.tsx` / `ActionPlanBoard.tsx` comme appelants du traceur.
**Faux** : `RecentActivityFeed.tsx:26` porte la chaîne `'plan_action_completed'`, qui est un type de
`user_actions`, pas un appel. Mesuré : les **8 émetteurs nommés ont ZÉRO appelant de production**
(`grep -rl` hors du tracker → 0 pour chacun).

1. ⚠️⚠️ **UNE FUITE À REFERMER À L'ÉCRITURE, pas à la lecture** — `apps/web/src/router.tsx:37`
   passe `event.toLocation.pathname` **BRUT** à `notifyRouteViewed`. Donc `/accounts/<uuid>`
   s'écrirait tel quel dans `product_events.route` :
   - chaque compte client devient « son » écran ⇒ tous sous le seuil de 5 sessions ⇒ **tables vides**,
   - et **un identifiant de compte CLIENT atterrit dans une lecture opérateur**, ce que la règle 5
     de l'analytique produit interdit (« rien de comportemental par espace client nommé »).

   B1-a l'a refermé **côté LECTURE** (`resolveProductScreen`, testé). **Ce n'est pas assez** : la
   règle du dépôt est *retirer le MOYEN, pas la permission*. Le repli vers le MOTIF de route
   (`/accounts/$id`) doit se faire **avant l'envoi**, dans `router.tsx` ou `notifyRouteViewed`.
   ⚠️ **Le moment est idéal** : `VITE_PRODUCT_TRACKER_ENABLED` est **absente**, donc no-op strict,
   donc **aucune donnée n'existe encore**. Corriger maintenant supprime la fuite au lieu de la filtrer.
2. ⚠️ **Le vrai bloquant restant de toute la série `/produit`** : sept des neuf émetteurs n'ont
   **aucun appelant**. Tant que `trackActionStarted/Completed/Abandoned`, `trackSearchPerformed`,
   `trackErrorShown`, `trackFilterApplied`, `trackTabOpened` ne sont pas posés sur de vrais gestes,
   les blocs friction / parcours interrompus / recherches vides rendront honnêtement
   `not_instrumented` — **juste, et vide**. C'est un lot à part (`product-tracker.ts` est fermé,
   ses points d'appel ne le sont pas — ils n'existent simplement pas).
3. **`espaces distincts` (#1683) n'est PAS dérivable** : `trackBehavioral()` écrit
   `workspace_id = null` **inconditionnellement**. Le service rend
   `{ kind: 'not_derivable', reason: 'behavioral_flow_carries_no_workspace' }` — jamais un `0`.
   ⚠️ C'est une **conséquence directe et voulue** de la règle 4 (hash de session, jamais un
   utilisateur). Donc #1683 ne pourra **jamais** afficher la colonne « espaces » telle qu'elle est
   demandée. À dire dans l'issue, comme un refus motivé, pas comme un retard.
4. **`doctrine-registry.ts` — `holders` de `c64_analytique_produit`** : les trois gardes neuves et
   `product-analytics-read.service.ts` n'y sont pas listés. GA-38 les acceptera (les quatre chemins
   existent). À ajouter.
5. **Entrée de changelog** FR+EN — quatre routes opérateur + un catalogue d'écrans.
6. **Parité démo : no-op délibéré, et la raison se RENFORCE** — `product_events` est déjà classé
   « vide à dessein » (`demo-coverage.ts:624`), et ces quatre écrans sont du back-office opérateur,
   jamais atteignables par le lien de démo. Semer des lignes comportementales fictives injecterait
   de la télémétrie inventée dans l'analytique de l'opérateur lui-même.
7. **Hors périmètre annoncé, et l'agent l'assume** : `team-kpis.service.spec.ts`. Le seuil transforme
   `alpha.activationRate` (0,5 sur **2** membres) en « retenu » — exactement le cas que la règle 1
   vise. Livrer le service avec son spec jumeau rouge était la pire option.

## De B1-d (`56a832f19`) et B1-c (`ea94414a6`) — VÉRIFIÉS

### ⚠️ UNE ERREUR DE L'INTÉGRATEUR, mesurée et à retenir
Mon brief à B1-d affirmait que « les fonctions PURES `api_indisponible` / `job_bloque` existent
déjà dans `operational-alerts.ts` ». **C'était FAUX.** Vérifié :
`git show origin/main:…/operational-alerts.ts | grep -E "^export (function|const)"` ne rend que
`costExceedsMedian` et `analysisFailureRateExceeds`. L'affirmation venait du rapport S2, **reprise
sans être re-mesurée**, exactement le défaut que le socle §5 nomme : *« le DÉFAUT aussi se vérifie
contre `origin/main`, pas seulement les fichiers »*. L'agent l'a vérifiée, l'a dite, et a écrit les
fonctions de zéro. **Deuxième fois dans cette session qu'un constat hérité se révèle faux** (la
première : « le service IA a 119 commits de retard »).

### Incident interne de B1-d, signalé par lui et VÉRIFIÉ par moi
Il a écrasé `operational-alerts.spec.ts` avec `Write` sans l'avoir relu (son `find -iname
"*backoffice-alert*"` le ratait — le nom de fichier ne contient pas « backoffice-alert »), l'a
repéré au `git diff --stat` avant de committer, et l'a restauré. **Contrôlé** : 11 `it(` sur
`origin/main`, **16** sur la branche ⇒ les 11 d'origine ont survécu, 5 sont neufs. Rien de perdu.

### B1-d — ce qui reste
1. **`api_indisponible` ne couvre que la BASE**, pas Redis ni le moteur IA. `StatusService` sait
   sonder les trois, mais l'importer ici casserait **GA-07, désormais à 254/254 — AU PLAFOND**.
   ⚠️ **Conséquence pour toute la suite du chantier** : plus aucun import service→service dans un
   fichier qui n'en avait pas. Ce qui reste passe par un `.controller.ts` ou un `.module.ts`.
2. **6/8 déclencheurs fonctionnellement couverts** (5 câblés + le rapport hebdo par un module
   sibling). `nouveau_client` / `churn_client` restent une décision produit.
3. **L'entonnoir est passé de 4 à 7 étapes**, et une correction de vérité au passage : l'étape 4
   mesurait `analysis_completed` (analyse TERMINÉE) alors que le libellé disait « analyse LANCÉE ».
   Elle mesure désormais `analysis_started`. Un libellé ne ment plus sur ce qu'il mesure.
4. Deux fichiers hors périmètre littéral, touchés et signalés : le type miroir côté manager
   (le laisser à 4 clés aurait fait mentir le typage) et une ligne de son test.

### B1-c — ce qui reste
1. **`FilterBar` : 2 écrans → 5.** `/audit` reste dehors **à dessein** : son implémentation
   (`<a href>` server-only, bookmarkable, sans JS) est une décision antérieure que `FilterBar`
   (`'use client'`) ne peut pas porter sans devenir un composant à deux modes pour un appelant
   unique. Écarté avec sa raison, écrite dans le fichier.
2. **La jointure joint désormais par `workspace_id`** — une clé étrangère réelle — sur les trois
   noms d'une même ESN (`w.name`, `esn_profiles.esn_name` courant, `legal_entities.name` non
   archivée). ⚠️ **Ce n'est PAS le même problème que #1756** : ici l'identifiant désigne toujours
   un seul espace, il n'y a aucune entité à deviner. Un zéro y est un vrai zéro mesuré.
3. **Un commentaire FAUX corrigé** : `FilterBar.tsx` affirmait que `monitoring/filters.tsx` était
   hors périmètre car « rendu 100 % serveur ». Il a toujours été `'use client'`.
4. `/feedback` : le filtre reste **en français seul**, et c'est reformulé sciemment — la page n'a
   jamais été bilingue, traduire ce seul filtre aurait produit un écran mi-FR mi-EN.
5. **Parité démo à trancher par l'intégrateur** : B1-c et B1-d concluent tous deux que les écrans
   back-office opérateur sont **hors** de la craft rule n°9 (jamais atteignables par le lien de
   démo, gardés par `InternalSecretGuard` / `DM_BASIC_AUTH`), et B1-d cite un précédent établi
   (`retention-cohorts`, `team-kpis`, `manager-kpi` : zéro entrée). **Je retiens leur lecture** —
   mais elle se dit, elle ne se suppose pas.
