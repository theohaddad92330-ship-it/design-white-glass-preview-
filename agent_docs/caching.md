# Caching — où, quoi, et **quand ça se périme**

Objectif (Louis) : exploiter le cache partout pour éviter les doubles appels, ne plus
re-scraper la même donnée publique, arrêter de re-dépenser des crédits provider — et
**ne JAMAIS servir de donnée morte** (chaque cache expire sur un TTL adapté à la
vitesse de changement de sa donnée).

Principe : **la donnée publique / company-scoped est cachée GLOBALEMENT** (même valeur
pour tous les users → clé = identité entreprise, jamais l'user), **l'interprétation
IA reste per-user** (stratégie/plan/score/messages, non cachée ici).

## 1. Caches provider (global, Redis) — `app/services/provider_cache.py`

Cache best-effort Redis (réutilise le client poolé du rate-limiter). Sans `REDIS_URL`
= no-op (fetch live). Toute erreur Redis → fallback fetch live (jamais de casse). Clé =
`provider:<namespace>:<sha256(company_id)>`, **sans user**.

⚠️ **Les VALEURS des tiers ne sont pas répétées ici, et c'est délibéré.** Cette page
en portait une copie (14 / 2 / 2 / 14 j) qui était fausse depuis des mois : le code
disait 30 / 1 / 3 / 7. Un nombre recopié dans deux documents diverge — on ne peut pas
garder ce qui est écrit à deux endroits. Les durées et **la raison de chacune** vivent
donc à UN seul endroit documentaire, [`source-cache.md`](source-cache.md) §« TTL par
volatilité », en face de leur unique source de vérité : les constantes de
`app/services/provider_cache.py` et `app/services/scrape_cache.py`. La garde
`apps/ia/tests/test_cache_ttl_doc_matches_code.py` relit les deux et fait rougir la CI
dès qu'elles s'écartent.

Ce tableau ne dit donc que ce qu'il est seul à savoir : **quel appel est câblé sur
quel tier**.

| Provider                       | Fn                                              | Clé                 | Tier TTL                    |
| ------------------------------ | ----------------------------------------------- | ------------------- | --------------------------- |
| **Pappers** (payant)           | `pappers/detail.py:get_company`                 | SIREN               | `TTL_FIRMO`                 |
| **Pappers** (recherche NOM)    | `pappers/search.py`                             | nom                 | `TTL_REGISTRY_SEARCH`       |
| **BODACC**                     | `data_sources/bodacc.py:legal_signals`          | SIREN               | `TTL_SIGNALS`               |
| **DECP** (marchés attribués)   | `data_sources/decp.py:awarded_it_contracts`     | nom                 | `TTL_SIGNALS`               |
| **BOAMP** (appels d'offres)    | `data_sources/public_tenders.py:public_tenders` | nom                 | `TTL_SIGNALS`               |
| **France Travail** (offres IT) | `data_sources/france_travail.py:it_job_signals` | nom                 | `TTL_JOBS`                  |
| **Brave News**                 | `data_sources/brave_news.py:recent_news`        | nom                 | `TTL_NEWS`                  |
| **Brave web search**           | `services/brave_search.py:_execute_query`       | texte de la requête | `TTL_SEARCH`                |
| **tech-detect** (stack)        | `data_sources/tech_detect.py:detect_stack`      | URL                 | `TTL_TECH`                  |
| **recherche-entreprises**      | `data_sources/recherche_entreprises.py`         | nom                 | `TTL_FIRMO`                 |
| **INSEE IT-entities**          | `insee_sirene.py:group_it_entities`             | nom                 | `TTL_FIRMO`                 |
| **INSEE sites**                | `insee_sirene.py:sites_for_siren`               | SIREN               | `TTL_FIRMO`                 |
| **Firecrawl** (scrape)         | `scrape_cache.py`                               | URL                 | `SCRAPE_CACHE_TTL_S`        |
| **Apollo** (enrich contact)    | `apollo.py:enrich_person`                       | linkedin \| nom+org | `APOLLO_ENRICH_CACHE_TTL_S` |

Tous les tiers sont surchargeables par env (`CACHE_TTL_FIRMO_S`, `CACHE_TTL_SIGNALS_S`,
`CACHE_TTL_TECH_S`, `CACHE_TTL_NEWS_S`, `CACHE_TTL_JOBS_S`, `CACHE_TTL_SEARCH_S`,
`CACHE_TTL_REGISTRY_SEARCH_S`). Un résultat **vide/falsy n'est jamais caché** (on
re-tente au prochain run).

**Ajouter un provider = une ligne** :

```python
@provider_cache.cached_by("ns:x", lambda company, **_: company.strip().lower(), ttl=provider_cache.TTL_FIRMO)
async def fetch_x(company, ...): ...
```

## 2. Cache de résultat (dossier complet) — Postgres

- `accounts.service.ts:findCompletedByUserAndCompany` — évite de relancer TOUTE
  l'analyse (~0,65 $) quand un dossier `completed` frais existe déjà.
- Clé : (workspace, SIREN | `lower(company_name)`). Fraîcheur : `CACHE_MAX_AGE_DAYS`
  (**37 j**, `accounts.service.ts`) sur `updated_at`. `force` (relance opérateur)
  bypass. Scope = **workspace** (un coéquipier réutilise le dossier au lieu de tout
  relancer).
- Le **37** n'est pas un arrondi : c'est `TTL_FIRMO` (30 j) + une semaine pleine. La
  raison est la garantie n°2 du §6 — voir là-bas.

## 3. Cache prompt Anthropic (`claude_service.py`)

- `cache_control: ephemeral` sur le **system prompt** de chaque appel (lecture ~0,1×,
  écriture ~1,25×) — TTL Anthropic ~5 min (aide au sein d'un run/burst).
- Étendu au **gros bloc dossier partagé de la Phase 4** (6 sections séquentielles qui
  relisent le même contexte) → sections 2-6 lues à 0,1×.

## 4. Ce qui reste PER-USER (non caché globalement, par design)

Profil ESN (`esn_profiler`, cache per-workspace prévu), et toute la génération IA
pilotée par le profil : stratégie, plan, score, messages. La donnée publique est
partagée ; l'interprétation ne l'est jamais.

## 5. Reste à cacher (follow-up)

- ~~**Brave web search**~~ — **FAIT.** `app/services/brave_search.py:_execute_query`
  passe par `cached_json("search:brave", …, ttl=TTL_SEARCH)`. Clé retenue : le TEXTE de
  la requête seul, et non `company + hash(queries)` comme envisagé ici — la clé d'API
  est un identifiant, pas un élément d'identité du résultat, donc la faire tourner ne
  doit pas jeter la fenêtre de cache.
- **esn_profiler** : `derive_esn_rules` est DÉTERMINISTE (pas d'appel LLM) → pas de
  cache nécessaire dans le hot-path (le ProfilerAgent LLM tourne à l'onboarding, 1×).

## 6. Garanties anti-donnée-morte

1. **TTL par volatilité** — chaque namespace expire sur un tier accordé à la vitesse de
   changement de sa donnée ; rien ne dort au-delà. Les durées et leur raison :
   [`source-cache.md`](source-cache.md) (elles ne sont pas recopiées ici, voir §1).
2. **Le cache résultat est toujours plus vieux que le cache provider le plus long** —
   `CACHE_MAX_AGE_DAYS` (37 j) dépasse `TTL_FIRMO` (30 j) d'une semaine pleine, donc une
   relance déclenchée parce que le dossier a dépassé sa fenêtre retombe TOUJOURS sur un
   cache provider expiré depuis au moins 7 jours — jamais sur une donnée aussi fraîche
   (ou aussi vieille) que le dossier qu'on vient de déclarer périmé.
   ⚠️ Cette garantie a été **fausse** : les deux constantes valaient 30 et 30, et 30
   n'est pas strictement plus vieux que 30 — une relance forcée pouvait resservir un
   firmo de 30 jours en croyant le rafraîchir, c'est-à-dire faire payer un crédit pour
   du cache. Ce qui la rend vraie aujourd'hui n'est pas cette phrase : c'est
   `apps/ia/tests/test_cache_freshness_guarantee.py`, qui LIT les deux constantes (dont
   celle du TypeScript, relue comme du texte, les deux langages ne s'important pas) et
   exige une **marge d'au moins 7 jours**. Une simple inégalité stricte se laisserait
   recasser au prochain arrondi d'un côté ou de l'autre ; une marge nommée, non.
3. `force` bypass total (opérateur).
4. Résultat vide jamais mis en cache.
