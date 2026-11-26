# Rapport — DECOUVRIR-RESTES (25/10/2026)

Branche `claude/decouvrir-restes-2510` (base `origin/main` bc41731c6c), pas de PR. Commits : `034cfadc` #4567 · `40ba96f7` #4515 · `9d6384da` #4305 · `aea9076f` (cherry-pick de `8a40a47d`, lot demo-decouvrir-4556) + `db997c36` #4556.

- **#4567** : cause = l'URL de test `hash(...) % 10_000` sert de clé de dédoublonnage de la récolte ; collision selon `PYTHONHASHSEED`. Rouge reproduit (graines 436, 1270 → `KeyError`), vert ensuite (436/1270/1399/109/0/7). URL = sha1 de la paire. Chiffre et assertion intacts.
- **#4515** : déjà livré sur main (lot récolte : défaut 25 km, aller-retour URL). Prouvé par test : `radiusKm=25` + commune → `radius_km`, centre lat/lon, `commune_code` absent ; « Non appliqué » ne sort que de la source qui a répondu. Corrigé : rayon sans ville résolue → dit sous VILLE (`city`).
- **#4305** : `secondPassScope` + `SecondPassNotice` : « N comptes déjà cherchés » / « Reste à chercher : suite de la liste · N employeurs non lus » (FR/EN), sans crédits ni « 0 ». Coût des deux temps écrit dans `agent_docs/discover-v2-contract.md`.
- **#4556** : dossier Airbus cadré Occitanie repris du lot demo (cherry-pick, rien refait) ; garde : la liste démo « Albi · 250-999 » rend ≥ 8 cartes.
- Tests : pytest ciblés (competence_trouve, rayon, registry_filters, time_budget : verts), vitest second-pass/notice/architecture+i18n (3431 verts), tsc web 0, jest démo (coverage + seed + 2 specs : verts).

## Arbitrages (le plus simple, nommés)

- #4515 : rayon non appliqué signalé sous la clé `city` (pas de champ « rayon » à l'écran). Palier 100 km / échelle : #4429, non touchés.
- #4305 : contrainte lue depuis `degraded`/`skillSearch` existants ; aucun contrat neuf. Pas de démo du second passage (la démo ne coupe jamais par le temps).
- #4556 : « visible sans Explorer » non fait (`/discover` s'ouvre sans requête, #4493.7) ; Explorer est gratuit en démo (liste scriptée). Levée sur compte RÉEL non posée (donnée inventée) : seuls les comptes « (démo) » en portent.

## Non fait / à voir

- `test_city_filters_on_the_city…` (compétence) dépend du réseau (résolution de lieu, échelle #4429) : échoue seul sur main.
- `test_discover_registry.py::test_returns_registry_candidates_…` rouge sur main (`time_budget`).
- Pas de rendu Chrome ; Reprendre « Albi » : zéro carte non reproduit côté API.
