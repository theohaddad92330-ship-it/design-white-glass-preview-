# Cache des sources publiques par entreprise (`source_cache`, C5)

Question Matteo (PDF5 §6/§12) : deux users analysent le même compte → on
re-scrape et re-paie tout. Coût observé ~1,37 €/run vs ~0,35 € estimé. Ce cache
mutualise les données **publiques** par **entreprise** (jamais par user) — un
run chaud réutilise ce qu'un collègue (ou soi-même la veille) a déjà payé.

## Architecture — 2 tiers, mêmes points de câblage

Le collecteur (phase 1) passait déjà par `provider_cache` (par source) et
`scrape_cache` (par URL Firecrawl) : lookup avant chaque appel → hit frais =
zéro appel réseau ; miss/périmé = appel réel puis write-through. C5 ajoute le
tier durable sous ces mêmes points de câblage :

| Tier | Backend                                             | Rôle                                                               |
| ---- | --------------------------------------------------- | ------------------------------------------------------------------ |
| L1   | Redis (`REDIS_URL`, client partagé du rate-limiter) | rapide, mais partagé avec BullMQ, borné mémoire, éviction possible |
| L2   | **Postgres, table `source_cache`**                  | durable, partagé entre workers/deploys/workspaces                  |

- Écriture : write-through **dans les deux tiers** (uniquement sur fetch réussi
  non vide — jamais d'erreur ni de vide caché).
- **SIG-C (11/10) — le vide se cache quand la source l'active** (`empty_ttl=` sur
  `cached_by` / `cached_json`) : stocké sous une SENTINELLE distincte de « pas en
  cache », servi comme le vide d'origine. Durées (constantes, sans variable
  d'env) : `TTL_EMPTY_JOBS` **24 h** (TheirStack, Mantiks, Fantastic, Adzuna,
  France Travail, APEC, boards ATS — un 404 de board est un vide normal),
  `TTL_EMPTY_JOOBLE` **7 j** (500 requêtes à vie par clé). **Une erreur ne se
  cache jamais** : un fetch pendant lequel la source a appelé `record_degradation`
  (ou `note_fetch_error`) n'écrit rien. **Redis absent = comportement d'avant**
  (aucun vide écrit, pas même en L2). Les cinq agrégateurs ont chacun leur
  catégorie L2 (`jobs_<fournisseur>`) : ils partageaient une ligne.
- **SIG-C (11/10) — registres pays** : BE (détail par numéro BCE), CH (détail par
  UID), CA (page fédérale par numéro de société) et US (profil financier XBRL par
  CIK) passent par `cached_json` au tier `TTL_FIRMO` (30 j), clé = **l'identifiant
  légal**, jamais un nom cherché. Exception tranchée : le flux US `submissions`
  porte aussi les dépôts datés lus comme signaux légaux → tier `TTL_SIGNALS` (30 j, #3989).
  LU n'appelle aucun réseau : rien à cacher.
- Lecture : L1 → L2. Un hit L2 re-remplit L1 avec le **TTL restant** (jamais un
  TTL plein : Redis ne peut pas survivre à l'expiry Postgres).
- Best-effort partout : toute erreur cache (Redis ou Postgres, timeout 3 s par
  op) dégrade en appel live. Le cache ne casse JAMAIS une analyse.

## Table (owner = service IA — pattern `checkpoints*`)

Comme le checkpointer du graphe (`app/graph/checkpoint.py`), le service IA est
propriétaire de sa table et la crée par **DDL idempotente à la première
utilisation** (pas de migration NestJS) :

```sql
CREATE TABLE IF NOT EXISTS source_cache (
    company_key TEXT NOT NULL,           -- SIREN / registry_id / nom normalisé (ou URL pour les scrapes)
    source      TEXT NOT NULL,           -- pappers, bodacc, firecrawl, apec…
    category    TEXT NOT NULL DEFAULT '',-- registry, legal, marches, jobs, news, tech, scrape…
    payload     JSONB NOT NULL,          -- le payload provider exact (JSON)
    fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,    -- fetched_at + TTL de la source
    PRIMARY KEY (source, category, company_key)
);
CREATE INDEX IF NOT EXISTS source_cache_expires_at_idx ON source_cache (expires_at);
```

- URL : `SOURCE_CACHE_PG_URL` sinon `DATABASE_URL` ; sans aucune = tier L2 off
  (L1 Redis seul, comportement historique).
- Les lignes périmées ne sont jamais servies (`WHERE expires_at > now()`) ; un
  purge opportuniste tourne à chaque (re)connexion pour borner la table.
- **La clé est l'entreprise, pas le user** : multi-workspace par design. Données
  PUBLIQUES uniquement — jamais de CRM, de contexte user ni de payload
  interprété (stratégie/plan/score restent par user, non cachés ici). La seule
  famille réservée `__run__` stocke un timestamp de run par `account_id`
  (payload vide) pour le bypass re-run ; elle est inaccessible via get/put.

## TTLs différenciés (la fraîcheur EST le produit)

Constantes dans `provider_cache.py` / `scrape_cache.py`, toutes
env-overridables. Règle : plus une donnée périme vite, plus son TTL est court —
on ne cache jamais ce qui doit avoir l'air d'être d'aujourd'hui.

| Source                                                                                                                       | TTL      | Env                              | Justification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pappers / recherche-entreprises / INSEE (firmo, registre)                                                                    | **30 j** | `CACHE_TTL_FIRMO_S`              | CA, effectifs, dirigeants, établissements bougent à l'échelle du trimestre (dépôts annuels). C'est LE poste payant (crédits Pappers) : TTL long = économie maximale, risque de staleness quasi nul.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Scrape web Firecrawl (par URL)                                                                                               | **30 j** | `SCRAPE_CACHE_TTL_S`             | Les pages corporate bougent lentement, mais le lot scrapé contient presse/carrières où 14 j mentirait sur du « récent ». 7 j capture l'essentiel des répétitions (collègues, re-runs dans la semaine) sans servir une newsroom d'il y a 2 semaines. CACHE-API (Louis 15/10) : « un même appel n'est JAMAIS payé deux fois en 30 jours » — un crédit Firecrawl par page normalisée ; la fraîcheur d'un fait presse se juge à sa DATE, lue dans le texte. Crédits TheirStack épuisés en 5 jours — tout fournisseur PAYANT se garde 30 j. Compromis assumé : presse/carrières du lot scrapé jusqu'à un mois.                                         |
| BODACC / BOAMP / DECP (légal, marchés)                                                                                       | **30 j** | `CACHE_TTL_SIGNALS_S`            | #3989 (Louis, TTL 30 j) — publications à cadence hebdo/mensuelle ; un événement légal ou un marché attribué ne change pas une fois publié. Sources gratuites : le gain est la latence, pas l'euro.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Offres d'emploi, toutes sources (France Travail, APEC, WTTJ, Adzuna, Jooble, TheirStack, Fantastic, Mantiks, ATS, carrières) | **30 j** | `CACHE_TTL_JOBS_S`               | #4067 (Louis 13/10, « offres ~7 j ») : c'est aussi la fraîcheur du fait public partagé `public_facts` « offres ». Une offre publiée reste ouverte plusieurs semaines ; 7 j fait profiter chaque espace de la collecte d'un autre sans servir un volume d'offres périmé. Le VIDE garde 24 h (`TTL_EMPTY_JOBS`). 15/10 (Louis) : crédits TheirStack épuisés en 5 jours — tout fournisseur PAYANT se garde 30 j. TOUTES les sources d'offres ; c'est aussi la fraîcheur du fait public `public_facts` « offres ». Le VIDE garde 24 h.                                                                                                                |
| Presse (Brave News, actualités rattachées)                                                                                   | **30 j** | `CACHE_TTL_NEWS_S`               | #4067 (Louis 13/10, « actualités ~14 j ») : fraîcheur du fait public `public_facts` « actualités ». Une actualité rattachée (projet, levée, nomination) reste un « pourquoi maintenant » deux semaines ; un FIL entier (levées) garde son propre 24 h (`funding_feed._FEED_TTL_S`). 15/10 (Louis) : crédits TheirStack épuisés en 5 jours — tout fournisseur PAYANT se garde 30 j. CACHE-API : l'appel Brave News (facturé) se garde sous la MÊME durée, clé = société seule — une seule constante (GA-26).                                                                                                                                       |
| Presse Brave News, VEILLE quotidienne (`freshness=pd`)                                                                       | **1 j**  | `CACHE_TTL_BRAVE_NEWS_FRESH_S`   | DATA-A point 2 (Louis 15/10) : avec le cache 30 j la veille ne voyait plus aucune nouveauté. UN appel par compte et par jour, cache À PART (`news:brave_pd`), jamais le cache 30 j. Seul le rafraîchissement quotidien de la watchlist le demande (`watch_refresh`).                                                                                                                                                                                                                                                                                                                                                                              |
| GitHub org / tech-detect (stack)                                                                                             | **30 j** | `CACHE_TTL_TECH_S`               | Une stack technique bouge à l'échelle du mois ; l'API GitHub anonyme est bridée à 60 req/h → un hit économise 3-4 requêtes de ce quota. 15/10 (Louis) : crédits TheirStack épuisés en 5 jours — tout fournisseur PAYANT se garde 30 j.                                                                                                                                                                                                                                                                                                                                                                                                            |
| Contact acheté (Apollo People-Match, SalesQL)                                                                                | **30 j** | `CACHE_TTL_CONTACT_S`            | CACHE-API (Louis 15/10) : un e-mail/téléphone révélé coûte un crédit. Redis SEUL (jamais Postgres : rétention d'une donnée personnelle, lot 16). Clé = la personne seule, commune à tous les espaces (`c99`). Une personne effacée (c67) est purgée de ce cache à l'effacement.                                                                                                                                                                                                                                                                                                                                                                   |
| Recherche web Brave (par requête)                                                                                            | **30 j** | `CACHE_TTL_SEARCH_S`             | Une requête de découverte de liens re-tirée dans la même semaine rend le même corpus. C'était le DERNIER fournisseur non caché : 21 requêtes fixes + jusqu'à 8 issues du profil par run, facturées, sur le chemin critique devant Firecrawl. 15/10 (Louis) : crédits TheirStack épuisés en 5 jours — tout fournisseur PAYANT se garde 30 j. (Brave/Serper/Tavily). CACHE-API : clé = texte normalisé seul (jamais `limit`, qui se filtre à la lecture) ; un résultat vide n'est jamais écrit.                                                                                                                                                     |
| Recherche registre PAR NOM (Pappers `/v2/recherche`)                                                                         | **24 h** | `CACHE_TTL_REGISTRY_SEARCH_S`    | Délibérément PAS `TTL_FIRMO` : chercher un nom interroge un index qui GROSSIT chaque jour. À 30 j, une société immatriculée la semaine dernière resterait invisible un mois dans l'autocomplétion d'onboarding (« je ne trouve pas ma boîte »).                                                                                                                                                                                                                                                                                                                                                                                                   |
| Recherche d'une personne PAR NOM (cascade base de contacts → registre des dirigeants → web, #4386)                           | **24 h** | `CACHE_TTL_PERSON_NAME_SEARCH_S` | Louis 20/10 : la recherche par nom doit trouver. 24 h et non 30 j : une personne change de poste, et une source tombée ne s'écrit jamais en cache (on réinterroge au lieu de figer un vide).                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Réponse d'un appel LLM NEUTRE (classe A, CACHE-LLM)                                                                          | **30 j** | `CACHE_TTL_LLM_S`                | Louis 15/10 : la réponse d'un appel de la liste blanche de `llm_response_cache` (nom d'entreprise extrait, préremplissage ESN, vocabulaire public, lecture d'un document d'appel d'offres par empreinte SHA-256). La clé porte l'empreinte du PROMPT : un prompt modifié n'est jamais servi périmé ; seule l'entrée vieillit, au rythme du registre. Commun à tous les espaces.                                                                                                                                                                                                                                                                   |
| Agrégat de TERRITOIRE (offres, AO, marchés, compte d'ESN)                                                                    | **24 h** | `CACHE_TTL_TERRITORY_S`          | LOT DATA-C (Louis 15/10) : la réponse de `territory_overview` par source, clé (département, commune, rayon, fenêtre). L'écran Territoire, l'outil territoire de Laura et la veille nocturne `territory-watch` posent la même question ; les sources publient au jour. Commun à tous les espaces (aucun profil dans la clé) ; une source en panne ou un vide ne se garde jamais.                                                                                                                                                                                                                                                                   |
| Identité registre d'un employeur (nom normalisé → SIREN)                                                                     | **90 j** | `CACHE_TTL_EMPLOYER_IDENTITY_S`  | #4674 (28/10/2026, lot L2) — une entreprise n'a qu'UN SIREN : sa résolution ne périme pas à l'échelle du mois. C'était LE goulot de Découvrir — le registre public tient 2 req/s, soit ~40 résolutions par recherche dans le budget de 21 s, et 909 refus 429 ont été mesurés en production (#4617) : relire le même nom à chaque recherche payait le même appel des dizaines de fois. Cache PARTAGÉ entre espaces (une identité publique n'appartient à personne). ⚠️ Un nom NON résolu ne se garde PAS 90 j : l'employeur sort avec son identité « en cours » et sera retenté, sinon une homonymie d'un jour deviendrait un trou de trois mois. |

⚠️ **Ces douze lignes sont la seule copie documentaire de ces
durées.** `agent_docs/caching.md` en portait un double (14 / 2 / 2 / 14 j) faux depuis
des mois ; il pointe désormais ici plutôt que de recopier. La garde
`apps/ia/tests/test_cache_ttl_doc_matches_code.py` relit CE tableau et les constantes,
et fait rougir la CI dès qu'ils s'écartent.

## Faits publics partagés entre espaces (`public_facts`, #4067)

Lot DECOUVRIR-COLLECTE (Louis 13/10). Découvrir et l'analyse complète rangeaient
leurs collectes sous des clés différentes (le nom tapé, nom + SIREN…) : un fait
payé par l'un n'était pas relu par l'autre. `app/services/public_facts.py` range
dans la MÊME table une famille `public_facts` :

| Colonne       | Valeur                                                                       |
| ------------- | ---------------------------------------------------------------------------- |
| `source`      | `public_facts`                                                               |
| `category`    | la nature : `jobs`, `news`, `legal`, `tenders`, `registry`                   |
| `company_key` | `siren:<9 chiffres>` (sinon `domain:<hôte>`) + `\|<variante de la question>` |
| `payload`     | `{"collectedAt": ISO, "rows": [...]}` — les lignes publiques de la source    |

- **Lire avant d'appeler** : un fait frais = aucun appel. Fraîcheur = le TTL de la
  famille (tableau ci-dessus) — un seul réglage.
- **Frontière** : une nature privée (CRM, notes, documents, Drive, missions,
  corrections, listes) lève `PrivateFactRefused` ; une ligne portant un marqueur
  d'espace (`workspace_id`, `user_id`, `account_id`, note…) n'est jamais écrite.
  Aucune fonction ne prend d'espace : la clé ne peut pas en porter. La migration
  `SourceCachePublicFactsBoundary` active la RLS (aucune politique : seul le
  service y lit) et refuse en SQL une `source` privée.
- **On archive, on ne supprime pas** : la purge opportuniste épargne `public_facts`.
- **#3989 — aucune trace de l'espace qui a cherché** : un marqueur d'espace (`workspace_id`, `workspaceId`, `user_id`,
  `userId`) se cherche à TOUTE profondeur d'une ligne ; la variante de la question est un jeton fermé
  (`^[a-z0-9_:.-]{0,64}$`) — un texte libre (un domaine d'offre saisi) rend la collecte sans la ranger. La base le redit
  (migration `SharedPublicFactsContract` : clé, `collectedAt`, marqueur) ; le contrat vit dans
  `packages/contracts/src/schemas/shared-public-facts.ts`, tenu par la garde GA-414.

## Verrou single-flight entre processus (#4722, épopée #4721)

`cached_json` (donc `cached_by`) et `paid_skill_offers` (Découvrir par compétence) passent par
`provider_cache.single_flight_shared` : **un seul appel payant par clé de cache**, même entre workers. Le gagnant
prend un verrou Redis (`SET NX PX`), appelle, **range le cache avant de libérer** ; un second demandeur attend la
chute du verrou, relit le cache et sert la même réponse. Mesure à l'origine : 32 corps identiques facturés deux fois
sur 30 j (1 486 crédits TheirStack), dont 1 062 à moins de 60 s d'écart. Le verrou expire (`PROVIDER_LOCK_TTL_S`, 90 s :
un appelant tombé ne gèle pas la clé), un appel qui lève le libère et n'écrit rien, un attendeur qui ne trouve rien
retente. Sans Redis ou Redis en panne : appel seul, comme avant (best-effort).

## Invalidation

- **Break-glass** : `SOURCE_CACHE_DISABLED=true` (pattern `*_DISABLED` des axes
  v2) coupe TOUT le cache sources (lectures + écritures, L1 + L2) — chaque
  source repart en live. Absent/vide = cache actif. À poser en incident
  (données empoisonnées, bug de fraîcheur), puis à retirer.
- **Bypass automatique re-run < 1 h** : si le MÊME compte (`account_id`) est
  relancé dans l'heure (`SOURCE_CACHE_RERUN_BYPASS_S`, défaut 3600), le run
  ignore les lectures cache — l'utilisateur qui relance veut du frais — mais le
  write-through continue de rafraîchir le cache pour les autres.
- **Expiry** : filtre côté SQL (`expires_at > now()`) + re-vérification côté
  Python ; purge opportuniste des lignes mortes à la connexion.

## Observabilité

`source_cache.begin_run()` (ouvert en tête de phase 1, avant le fan-out des
tâches sources) tient des compteurs par run (contextvar partagée par les tâches
filles) ; le router les injecte dans le run report :

```jsonc
"_api_metrics": {
  "source_cache": {
    "hits":   { "pappers": 1, "firecrawl": 6, "bodacc": 2 },
    "misses": { "brave_news": 1, "apec": 1 },
    "hit_count": 9, "miss_count": 2,
    "estimated_saved_eur": 0.08,
    "bypassed": false
  }
}
```

Plus une ligne de log par run :
`Source cache for 'SNCF': 9 hit(s) / 2 miss(es), ~0.080 € saved`.

## Économie attendue par run chaud

Estimations €/hit (telemetry, chiffres `agent_docs/apis.md`) : Pappers
~0,02 €/req, Firecrawl ~0,01 €/page, Brave ~0,005 €/req ; sources libres = 0 €
(le gain est la latence et le quota). Sur un run typique (1 fiche Pappers,
7 pages Firecrawl, 1 Brave News), un run entièrement chaud évite **~0,10 € de
coût sources direct** + plusieurs dizaines de secondes de collecte. Le poste
LLM (~1 €/run, classify en tête) n'est PAS couvert par ce cache — c'est le
chantier coût LLM (cf. mémoire « Optimisation coût des runs ») ; ce cache
attaque la part sources du delta 1,37 € vs 0,35 € et surtout la re-facturation
à l'identique quand deux workspaces analysent le même compte.

## Tests

`apps/ia/tests/test_source_cache.py` : hit/miss/expiry, write-through via
`provider_cache`/`scrape_cache`, backfill L1 au TTL restant, kill-switch,
bypass re-run < 1 h (lectures ignorées, écritures conservées), garanties
public-only (famille `__run__` réservée, payload de stamp vide), dégradation
sur erreur store, forme SQL du store (DDL idempotente, upsert `ON CONFLICT`,
filtre `expires_at > now()`), stats zéro sans run ouvert, injection
`_api_metrics.source_cache`.
