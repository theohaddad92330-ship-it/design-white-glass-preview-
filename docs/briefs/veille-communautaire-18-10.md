# Brief — VEILLE-COMMUNAUTAIRE (18/10/2026)

Branche : `claude/veille-communautaire-18-10` (ce fichier y est déjà poussé). Base : `origin/main` d807e7251.
Pousser sur CETTE branche, **jamais de PR**, jamais main. Dernier commit : sujet terminé par `[lot-fini]`.
Plafond : **300 tours** — à 240, commit de ce qui est vert, push, rapport, stop.
**Aucun sous-agent**, aucun test en arrière-plan. Tests CIBLÉS seulement (≤ 5 specs/fichiers pytest, `tsc -p` du paquet touché).
Conception : coût fournisseur payé + partage de collecte ENTRE espaces (cloisonnement, doctrine c94/GA-43).

## Le constat (mesuré le 18/10 dans les logs IA de production)

Mantiks : 1 500 → 1 399 crédits en ~40 h. **79 % des achats `companies/jobs` (49/62 le 17/10) viennent du
rafraîchissement quotidien de la veille** (`watchlist-refresh`, cron 05:20 Paris, tout le portefeuille suivi
relu chaque jour depuis #4016 L7 → `AnalysisOnDemandService.refreshResearch(…, { watch: true })` → phase 1 IA →
`job_aggregators.mantiks_jobs`). Trois causes : relecture quotidienne de tout le portefeuille ; jusqu'à
`MANTIKS_MAX_ENTITIES=5` entités achetées par compte ; une réponse VIDE n'est gardée qu'1 jour
(`provider_cache.TTL_EMPTY_JOBS`), donc une entité sans offre est rachetée chaque jour.

## Décisions de Louis — TRANCHÉES, ne pas reposer

**Point VC.1 — La veille n'achète plus.** Une relecture `watch` (veille quotidienne) ne lit les sources d'offres
payées à l'appel (Mantiks ; même règle pour TheirStack — cf. ses 5 200 crédits brûlés, mémoire 15/10) **qu'en
cache** : cache chaud → utilisé ; cache froid → la source est sautée, **aucun appel payé**, aucune ligne inventée,
aucun « 0 » affiché (GA-18/19). Un achat ne part que sur une analyse lancée par un humain ou le bouton
« Actualiser ». Il existe déjà `_CACHE_ONLY_JOB_SOURCES` dans `apps/ia/app/routers/discover.py:283` (Découvrir) :
réutiliser ce mécanisme, UN seul réglage (GA-26), ne pas en créer un second. Le drapeau `watch` existe déjà côté
API (`analysis-ondemand.service.ts` `refreshResearch` options) : le faire voyager jusqu'à l'IA s'il n'y arrive
pas, au contrat partagé (`packages/contracts`) si le corps de la requête change.

**Point VC.2 — Une réponse vide d'une source payée est gardée 7 jours** (au lieu d'1) — pour Mantiks
(`_mantiks_entity_jobs`, `empty_ttl`). Constante nommée, un seul endroit. Les sources gratuites gardent leur TTL.

**Point VC.3 — La veille se sert de la COMMUNAUTÉ.** Quand la veille relit le compte X d'un espace, et qu'une
collecte phase 1 de LA MÊME SOCIÉTÉ (clé = SIREN, sinon domaine racine — jamais une raison sociale, comme
`shared-company-facts.service.ts`) a été faite récemment par N'IMPORTE QUEL espace réel (analyse, « Actualiser »
ou veille ; espaces `is_demo` exclus), la veille **réutilise cette collecte publique** au lieu de recollecter :

- « Récemment » = dans les **24 h** précédant la relecture (constante nommée unique).
- **« Mêmes critères »** : ce qui DÉPEND de l'espace (ex. le filtre des signaux de recrutement selon le secteur de
  l'ESN — mémoire « signaux de recrutement suivent le secteur de l'ESN », le filtre stages, tout filtre lié au profil
  de l'espace) s'applique **à la réutilisation**, sur la donnée brute partagée, avec les critères de l'espace qui
  relit. Si une SOURCE est INTERROGÉE avec des critères propres à l'espace (termes de recherche dérivés du profil),
  sa collecte n'est réutilisée que si l'empreinte des critères est identique ; sinon cette source est recollectée
  (gratuite) ou lue en cache (payée, VC.1).
- Et l'inverse : quand l'utilisateur A actualise ou analyse X, les espaces qui SUIVENT X profitent de cette collecte
  fraîche à leur prochaine relecture de veille → leurs nouveaux signaux sortent par le flux `buy_signal` existant
  (diff avant/après déjà en place, `signalItemsAcrossSources`), sans nouvel envoi ni nouvelle cloche à inventer.
- **Ce qui ne se partage JAMAIS** : données privées d'un espace (CRM, notes, contacts saisis, corrections humaines
  hors règles de la base commune c94, coût d'accès — GA-43, scores/plan d'action propres à l'espace). Seule la
  collecte PUBLIQUE (offres, presse, registres, marchés, événements…) se partage. Aucun identifiant d'espace écrit
  dans la donnée partagée ; rien à l'écran ne dit « un autre espace » ; les sources ne se nomment jamais.
- Mécanisme : à toi de le concevoir, au plus simple — d'abord AUDITER ce qui est déjà partagé (caches
  fournisseurs de l'IA déjà communs entre espaces, `source_cache`, `provider_cache`, base commune c94). Si le
  partage par cache couvre déjà une source, ne rien recoder pour elle. Migration éventuelle = **ajout seulement**,
  horodatage réel (13 chiffres > max de `main`), contrainte SQL élargie avant le code.

**Ce qu'on ne change PAS** : la veille relit toujours TOUT le portefeuille suivi chaque jour (décision #4016 L7,
11/10) ; `MANTIKS_MAX_ENTITIES` reste à 5 pour les analyses humaines ; aucune probabilité, aucun envoi.

## Compagnons obligatoires

- Tests AVANT le code, et chacun doit savoir dire NON : (VC.1) relecture `watch` + cache froid → ZÉRO appel
  `companies/jobs` (client httpx mocké qui échoue s'il est appelé) ET analyse humaine → appel ; (VC.2) TTL vide
  = 7 j ; (VC.3) collecte de l'espace A < 24 h → la relecture veille de B ne recollecte pas ET applique les critères
  de B (un cas où A et B ont des secteurs différents et voient des signaux de recrutement différents) ; démo
  exclue ; collecte > 24 h → recollecte ; aucun champ privé de A ne traverse.
- `agent_docs/env-reference.md` : paragraphe Veille (ligne ~176) et Mantiks mis à jour (coût de la veille = cache
  seulement, réutilisation communautaire 24 h, TTL vide 7 j). Si `demo-coverage.ts`/gardes de doc l'exigent, mettre
  `agent_docs/demo-mode.md` à jour.
- Changelog FR+EN (`packages/contracts/src/changelog/`, convention `agent_docs/changelog-convention.md`) : une
  entrée « La veille quotidienne profite des recherches récentes faites sur la même société » — sans nommer de
  fournisseur.
- Trace dans le code : `// VC.1 (18/10) — …` à l'endroit du comportement.
- `agent_docs/doctrine.md` : une ligne datée « Louis 18/10/2026 — la veille quotidienne n'achète pas ; elle
  réutilise la collecte publique récente de la communauté » si un registre de doctrine le demande
  (`doctrine-registry.ts`, garde GA-38) — sinon ne pas créer d'entrée.

## Rapport (≤ 15 lignes, dans le message du dernier commit ET en fin de session)

Branche + SHA ; par point VC.1/VC.2/VC.3 : `livré` avec `fichier:ligne` du code ET de son appelant, ou `partiel`
avec ce qui manque ; tests lancés et leur résultat ; la preuve en production attendue (ex. « logs IA : relecture
watch → `jobs_source_cache source=mantiks outcome=cache_only_skip`, 0 `companies/jobs cache=miss` sur un cid de
veille »).
