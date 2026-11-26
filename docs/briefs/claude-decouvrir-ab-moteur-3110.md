# Lot AB — Découvrir : base commune comme source + volume jusqu'à 100

Branche : `claude/decouvrir-ab-moteur-3110`
Conception : contrat partagé neuf API↔IA (source de candidats), cloisonnement entre espaces, budgets du moteur.

Deux volets dans le MÊME moteur (`apps/ia/app/routers/discover.py`), dans cet ordre : volet B (volume) puis volet A (base commune). Un lot C parallèle touche les FILTRES de qualité dans le même fichier : reste dans la collecte, l'élargissement, les budgets et la coupe ; ne réécris pas les filtres de qualification.

## VOLET B

## Compris

Une recherche rend 10-25 comptes : premier lot réglé par la taille d'équipe (10/25/50, défaut 24), registre lu sur UNE page de 25 lignes, élargissement coupé dès 25 comptes, budget 32 s.

## État mesuré sur origin/main (31/10)

- `apps/web/src/features/discover/lib/discover-capacity.ts:50-54` `PROPOSED_ACCOUNT_VOLUME_BY_BAND` {10, 25, 50} ; défaut `DISCOVER_PAGE_SIZE = 24` (`discover-query.ts:124`) ; « Voir plus » +24 jusqu'à 200 (`discover-list-window.ts:36-41`).
- `apps/ia/app/routers/discover.py:1522` `last_page = min(ceil(wanted/25), 2 si recall sinon 1, MAX_REGISTRY_PAGES=8)` ; rappel page 2 seulement si zone ET activité et `2×sous-requêtes ≤ 6` (`:2417`) ; `spent < 6` (`:2267`).
- `CRITERIA_WIDEN_MIN_RESULTS = 25` (`criteria_referential.json:3`) ; `DEFAULT_REGISTRY_LIMIT = 25` (`discover.py:175`).
- `DISCOVER_TIME_BUDGET_S = 32` (`:218`), `DISCOVER_MODEL_SHARE = 1/3` (`:235`) ; couperet API 45 s, 1 essai (`apps/api/src/modules/ia-proxy/ia-proxy.controller.ts:217`).
- Signaux : `SIGNALS_TIME_BUDGET_S = 5` (`:324`), dans le budget de la liste (#4677).

## Je fais (décisions Louis 31/10, tranchées)

1. **#4673.2** — La taille d'équipe règle TOUJOURS le volume ; palier `nineOrMore` 50 → **100**. Les autres paliers et le défaut ne bougent pas.
2. **#4673.1** — L'élargissement vise le volume DEMANDÉ : seuil = `max(25, limit)` au lieu de 25 fixe (palier par palier, toujours dit à l'écran comme aujourd'hui, toujours plafonné à la région en automatique — décision 27/10).
3. **#4419.1** — Le registre lit autant de pages que le volume demandé l'exige (`ceil(wanted/25)`, borne `MAX_REGISTRY_PAGES`), plus seulement 1-2 ; le budget d'appels registre (`spent < 6`) monte en conséquence, nommé dans une constante.
4. **#4517.2** — Budget total ~55 s, couperet API ~60 s, toujours UN seul chargement (#4517) ; la progression existante reste affichée. Sources payantes : plafond nommé de 18 appels et cache 30 j INCHANGÉS.
5. **#4677.1** — Les signaux par carte sortent du budget de la liste : la liste est complète d'abord, les signaux ne tronquent jamais la liste.
6. Tests : un test par seuil qui sait dire NON (ex. volume 100 demandé + registre qui a 100 lignes ⇒ 4 pages lues ; 25 demandés ⇒ 1 page).

## Je ne fais PAS

La base commune comme source (lot A), la propreté (lot C), un chargement en deux temps, de nouvelles sources.

## Droits

Aucune surface d'accès touchée (pas de route, menu, permission).

## Je défais

#4673 (seuil 25 fixe), le palier 50 de `PROPOSED_ACCOUNT_VOLUME_BY_BAND`, le budget 32 s / couperet 45 s — citer les issues trouvées au `git blame`.

## VOLET A

## Compris

Une recherche Découvrir rend 10-25 comptes. Notre base commune (DataForge, Market Memory : des milliers de comptes et de besoins datés, récents ET historiques) ne fabrique AUCUN candidat : elle protège ou annote seulement ce que le registre a trouvé.

## État mesuré sur origin/main (31/10)

- `apps/api/src/modules/ia-proxy/discover-sources.service.ts:168-210` `baseAccountSirens` : « Elle ne FABRIQUE aucun candidat — c'est le lot suivant de l'épopée » (`:178`) ; muette sans critère métier ni lieu (`:195`). Appelée par `spaceFactSirensOf` (`ia-proxy.controller.ts:1297-1315`) → liste de SIREN protégés de la coupe (`apps/ia/app/routers/discover.py:3922-3933`, `space_reserve.py`).
- Lecteur commun `apps/api/src/modules/base-reader/*` (#4792), port `BASE_MATCHES_SOURCE` (`ia-proxy.module.ts:262`).
- DataForge appoint : `discover.py:2686-2713`, `DATAFORGE_CANDIDATE_APPOINT_LIMIT = 5`, seulement s'il reste de la place (`limit − len(companies) > 0`), pack national filtré sur la ville du siège.
- Market Memory : filtre/annotation après coup seulement (`withMarketMemoryFilters`, `ia-proxy.controller.ts:1626`), aucune occurrence dans `discover.py`.

## Je fais (décisions Louis 31/10, tranchées)

1. **#4793.1 / #4791.1** — Les comptes de la base COMMUNE qui correspondent aux critères (métier/secteur, zone avec son rayon, compétence) entrent dans la liste COMME CANDIDATS, rangés avec ceux du registre et des offres, dédoublonnés par SIREN. Plafond d'appoint DataForge à 5 LEVÉ (borne = le volume demandé). Ils entrent même quand le registre a rempli la page : le rang tranche, pas l'ordre d'arrivée.
2. **#4791.2 / #4762.1** — Market Memory produit des candidats : un compte avec un besoin observé (récent OU historique, aucune borne d'âge) qui correspond aux critères sort dans la liste, et sa carte porte le besoin DATÉ (« besoin Java, mars 2025 »). Ligne sans date = pas de besoin affiché.
3. **#4791.3** — Le CRM et les comptes de l'ESPACE restent un critère de RANG (comme aujourd'hui), JAMAIS une source. Rien de propre à un espace (CRM, notes, comptes suivis, contacts) ne nourrit un autre espace.
4. **#4791.4** — Aucune source nommée sur la carte.
5. Compteur journalisé dans la ligne de log `discover_registry` : candidats par origine (`registry`, `offers`, `common_base`) — pour la recette, jamais affiché.
6. Démo semée (au moins 3 comptes « base commune » avec besoin historique daté sur une recherche démo existante).

## Je ne fais PAS

Le volume/budget de temps (lot B), la propreté de liste (lot C), l'onglet Signaux du compte, de nouvelles sources externes, le CRM comme source.

## Droits

Qui voit : tout utilisateur authentifié d'un espace sur Découvrir. Qui est REFUSÉ : un espace ne voit JAMAIS une donnée propre à un autre espace (CRM, comptes suivis, notes, coûts). Test obligatoire : espace B lance la même recherche → aucun compte ni champ issu du CRM/portefeuille de l'espace A. La route reste derrière son guard JWT existant (aucune route nouvelle sans garde).

## Je défais

`discover-sources.service.ts:178` (« ne fabrique aucun candidat ») et `DATAFORGE_CANDIDATE_APPOINT_LIMIT = 5` — citer l'issue d'origine trouvée au `git blame` dans le commit.

Périmètre : `apps/ia/app/routers/discover.py`, `apps/ia/app/**/criteria_referential*`, `apps/ia/app/services/*`, `apps/ia/tests/*`, `apps/api/src/modules/ia-proxy/*`, `apps/api/src/modules/base-reader/*`, `apps/api/src/modules/demo/*`, `apps/web/src/features/discover/*`, `packages/contracts/*`, `docs/briefs/*`

## Règles communes (lire avant tout)

- Dépôt `Bellum-AI/belllum-monorepo`. Pars de `origin/main` (base daac70db04 ou plus récent). Tu travailles sur la branche indiquée en tête (elle existe déjà et porte ce brief), et tu pousses UNIQUEMENT sur elle : `git push origin HEAD:refs/heads/<branche>`. Jamais main.
- **Plafond : 300 tours.** À 240 tours : commit de ce qui est vert, push, PR, rapport, stop.
- **Tu livres TOUS les points du lot**, pas un seul. Chaque point = un test qui sait dire NON (écrit AVANT le code, TDD) + le code + la trace `// #<issue>.<n> — …` à l'endroit du comportement. Un point non fini se NOMME au rapport.
- **Antériorité** : avant d'éditer une ligne, `git blame` ; tout `#NNN` touché se cite dans le commit (« revient sur #N » / « garde #N »). Les décisions ci-dessous sont TRANCHÉES par Louis le 31/10 : ne pas les re-questionner.
- **Doctrine** (CLAUDE.md du dépôt) : jamais de donnée fictive, une absence ne s'affiche jamais « 0 », les sources (DataForge, Market Memory, nom de CRM, « base commune ») ne se NOMMENT JAMAIS sur une ligne ou une carte, aucune probabilité affichée.
- **Craft rule n°9** : toute nouveauté visible est semée en démo (`apps/api/src/modules/demo/demo-dataset.ts` + `demo-coverage.ts`).
- **Tests CIBLÉS seulement** : `cd apps/<x> && npx tsc --noEmit -p .` (jamais à la racine, jamais via rtk), les specs liées (≤ 5 fichiers), `pytest` ciblé côté IA. Suites complètes, check-types racine, build = CI.
- Commits groupés par fichier/écran, numéros dans le sujet. À la fin : `gh pr create --base main --head <branche>` PRÊTE (pas draft), corps = liste des points avec `fichier:ligne` + ce qui reste.
- Rapport final ≤ 15 lignes : branche, SHA, PR, points livrés / non livrés.
