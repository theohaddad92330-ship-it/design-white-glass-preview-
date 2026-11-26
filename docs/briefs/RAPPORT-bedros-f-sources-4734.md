# Rapport — Lot F sources (#4734, #4735, #4747)

Branche `claude/bedros-f-sources-4734` (base `origin/main`). SHA du code : `acf2f9ce`. Aucune PR, aucun commentaire d'issue.

## Fait

- **#4735 Crunchbase** — `data_sources/crunchbase.py`. Contrat LU sur data.crunchbase.com (28/10) : `POST /v4/data/searches/funding_rounds`, en-tête `X-cb-user-key`. Sans clé = zéro réseau, `[]`. Date + montant tel que publié (devise d'origine, jamais « 0 ») + stade brut + lien. Cache `provider_cache.cached_json` (écriture SOUS le verrou single-flight) : 5 appels simultanés = 1 appel = 1 ligne `cost_ledger`. Source jamais nommée dans le signal.
- **#4734 French Tech** — `data_sources/french_tech.py`. Annuaires déclarés par `FRENCH_TECH_DIRECTORY_URLS` (CSV/JSON), rattachement par SIREN SEUL (jamais le nom), fait = ce que la ligne dit, daté, avec lien ; absent = aucune ligne ; label > 24 mois = `status: unknown` (affiché, à confirmer). Type de signal `ecosystem` (≠ `funding`, arbitrage 28/10).
- `source_registry.py` (2 entrées), `agent_docs/env-reference.md` (3 clés neuves : noms seulement).

## Tests lancés (venv hors dépôt, `--noconftest`, deps de la CI absentes)

`pytest tests/test_crunchbase_4735.py tests/test_french_tech_4734.py tests/test_source_registry.py tests/test_source_registry_docstring_count.py` → **27 passed**. Rouge d'abord (ImportError modules absents), vert ensuite. `ruff check` + `ruff format` propres. Pas de tsc : aucun fichier TS touché.

## Pas fait, et pourquoi

- **#4747 (autre source d'offres, LinkedIn)** : NON codé. L'issue dit « voie conforme à choisir AVANT d'écrire du code » ; TheirStack/Adzuna/Jooble/Mantiks sont déjà branchés. L'étalon avant/après (recherche exacte + nombre attendu) manque.
- **Pas d'appelant** : les deux modules ne sont pas branchés dans `routers/discover.py` ni la fiche compte (fichier hors périmètre, partagé avec d'autres lots). Le type `ecosystem` n'existe pas dans `discoverSignalTypeSchema` (`packages/contracts`) : à élargir AVANT le câblage (GA-11/12). Crunchbase émet `funding`, déjà connu.
- **Démo (règle n°9)** : rien de seedé ni classé, car rien n'est encore visible à l'écran ; à faire avec le câblage (`demo-dataset.ts` + `demo-coverage.ts`).
- Aucun annuaire French Tech câblé par défaut : aucun jeu de données lisible par machine n'a pu être vérifié (pages mission French Tech = HTML ; data.gouv.fr injoignable depuis la VM).

## Questions ouvertes (Louis)

1. Crunchbase : on paie, et à quel palier ? (facturation en jetons de données, prix par appel inconnu → ligne « non tarifée » tant que `PROVIDER_UNIT_COST_CRUNCHBASE` n'est pas posé.)
2. Crunchbase : d'où vient le `permalink` d'un compte ? Le module ne le devine pas depuis un nom ; une résolution par site/autocomplete est à valider contre le palier.
3. French Tech : quelles URL d'annuaires (national + régions) déclarer, avec SIREN ?
4. #4747 : voie LinkedIn conforme (API partenaire / source sous contrat) et recherche étalon.
