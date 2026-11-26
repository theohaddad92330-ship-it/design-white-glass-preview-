# Rapport — DECOUVRIR-SOURCES-4419 (25/10/2026)

Branche `claude/decouvrir-sources-4419-2510` (base `origin/claude/decouvrir-trois-causes-2510`), SHA `dc2bb11f65c9f0ad5c46e720892d3000994ba543`. Pas de PR.

## Une ligne par source

| Source         | Branchée                                                                                                               | Cache 30 j                                                         | Plafond                      | Dans `COMPETENCE-TROUVE`                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------- | --------------------------------------------------------------- |
| TheirStack     | oui, `job_aggregators.theirstack_skill_offers` (`job_title_or`, FR, 90 j, 1 page de 25)                                | oui, `discover:skill_paid`, clé source+compétence (jamais la zone) | `SKILL_PAID_CALLS_MAX = 6`   | oui                                                             |
| Fantastic.jobs | oui, `fantastic_skill_offers` (`title_filter` sur `/v1/active-jb`)                                                     | idem                                                               | idem                         | oui                                                             |
| Mantiks        | oui, `mantiks_skill_offers` (`POST /searches/preview`, `job_title_include` : contrat déjà lu pour le volume, 0 crédit) | idem                                                               | idem (l'aperçu compte aussi) | oui                                                             |
| Adzuna         | déjà branchée ; diagnostic ajouté                                                                                      | — (quota du jour inchangé)                                         | quota Découvrir              | oui (`pagesOk/pagesFailed/rawReturned/noEmployer/quotaSkipped`) |

Chaque source payante : no-op STRICT sans clé (aucun appel, aucun compteur), réutilise `_request` / `_offer` / `run_metrics` / `_fantastic_params` / `_mantiks_body` des clients de la fiche. Le cache est lu AVANT le plafond ; une source muette lève (comptée « tombée », jamais rangée). Dédoublonnage : par SIREN après résolution (existant) ; la provenance reste dans la donnée, jamais dans `skillEvidence.offers`. Compteur par source : `info["sources"]` (+ schéma `discoverSkillSearchSchema.sources`, optionnel) et ligne de journal `sources={…: reçues/retenues rejets=… payés=… cache=… non_tentés=…}`.

## Adzuna : ce que j'ai trouvé

Je n'ai PAS pu prouver la cause hors prod (aucune clé, aucun réseau). Ce que je peux dire : `ADZUNA_APP_*` posées ⇒ ce n'est pas un no-op. Trois causes rendaient « 0 reçu » INDISCERNABLES : quota Découvrir du jour atteint (`adzuna_budget`, plafond 350/j, renvoyait `[]` en silence), page sans réponse (HTTP refusé, clé refusée en série par `source_silence`, réseau : `_request` rend `None`, traité comme « aucune offre »), lignes sans employeur écartées avant le compte. Le code de requête (`what`, `results_per_page`, `max_days_old`, pays `fr`) est le même que celui de la fiche. Le compteur par source les sépare désormais : la prochaine recherche dira laquelle. Éliminé : « clé absente ».

## Mot « vue »

Cause confirmée : `vue` est un alias déclaré de Vue.js, donc « en vue de l'ouverture » passait `_mentions`. Fix `_names_common_word_skill` : forme technique (`vue.js`, `vuejs`, `vue 3`) toujours ; mot nu seulement hors locution française ET avec contexte IT. Appuyé sur `is_it_offer` du lot précédent (inchangé).

## Tests (`tests/test_decouvrir_sources_payantes_4419.py`, 16)

ROUGE avant code : 11 failed / 4 passed. VERT après : 16/16 ; avec `test_competence_trouve`, `test_decouvrir_volume_4419`, `test_4469_*`, `test_competence_lieu_4469`, `test_upstream_throttle_coverage`, `test_recolte_2410_*`, `test_job_aggregators_*`, `test_cache_sources_key` : rc=0. Contrats : vitest 6/6, `tsc --noEmit` rc=0.
Tableau : AVANT `received={'france_travail': 59, 'adzuna': 0}` (une source). APRÈS (réponses figées) : `sources.theirstack = {received:1, kept:1, paid:1}` ; 2ᵉ recherche identique `paid:0, cached:1` ; plafond 2 sur 3 sources ⇒ 2 appels, 1 `notAttempted`.

## Pas fait / à savoir

- Deux échecs de `test_discover_fresh_jobs_4430.py` déjà rouges sur main : non touchés.
- `test_competence_trouve.py::test_city_filters_on_the_city_not_the_whole_department` est INSTABLE ici (1 échec sur 6 SUR L'ANCIEN CODE aussi) : appel réseau `geo.api.gouv.fr` non simulé. Pas de moi.
- Les requêtes payantes sont NATIONALES (25 plus récentes) : zone et ville filtrées en aval. Les filtres de lieu côté TheirStack/Fantastic/Mantiks ne sont pas vérifiés dans le dépôt, je ne les devine pas. Risque : peu d'offres payantes à Lille.
- `title_filter` (Fantastic) et `job_title_or` (TheirStack) viennent de ma lecture de leurs docs, pas d'un appel : à confirmer en prod (une 4xx se verra dans `failed`/journal, coût nul).
- Aucun fichier de droits, workflow, route ni clé touché.

## À prouver en production

Recette : retaper « dev vue à lille », lire la ligne `COMPETENCE-TROUVE … sources=` (par source : reçues, payés, cache, non tentés, Adzuna `pagesFailed`/`quotaSkipped`), compter les comptes À LILLE, vérifier qu'aucune boulangerie ne remonte, puis relancer : `payé=non` partout.
