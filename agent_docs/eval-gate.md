# Eval gate — golden set en gate AVANT merge (Théo p.15 / roadmap §17, C8)

Toute PR qui touche la **surface prompts** doit repasser le banc eval golden set
et ne présenter **aucune régression** vs la baseline committée — sinon la CI
échoue et la PR ne merge pas. Les PRs qui ne touchent pas aux prompts skippent
le gate en quelques millisecondes.

## TL;DR

```bash
pnpm eval:gate                    # depuis la racine — diff vs origin/main → skip ou gate
pnpm eval:gate -- --force         # forcer le banc même sans changement de prompts
pnpm eval:gate -- --base origin/staging
```

En CI : job **`Eval gate (golden set)`** dans `.github/workflows/ci.yml`
(mêmes déclencheurs `pull_request` que les autres jobs, inclus dans le gate
`CI Status`). ⚠️ GitHub Actions est actuellement billing-bloqué (jobs 0-step) —
le job est PRÊT et s'activera tout seul dès la réactivation du billing ;
en attendant, lancer `pnpm eval:gate` en local avant tout merge.

## Ce que fait le gate

1. **Détection** (`apps/ia/app/eval/gate.py`) : `git diff` vs la branche de base
   (merge-base + working tree + untracked). Si aucun fichier de la **surface
   prompts** n'a changé → `SKIP`, exit 0, le banc ne tourne pas.
2. **Banc** : sinon, replay de `python -m app.eval.run --check-baseline` —
   les 2 goldens (Doctolib, Société Générale) + le contre-exemple halluciné,
   scorés par les 8 métriques déterministes (`app/eval/metrics.py`), comparés
   à `apps/ia/app/eval/baseline.json`.
3. **Verdict** : exit 1 si une métrique requise échoue, si un score régresse
   au-delà de la tolérance, si un golden passe→échoue, ou si le contre-exemple
   (dossier halluciné) se met à PASSER (détecteurs cassés).

### Surface prompts surveillée (`PROMPT_SURFACE`)

| Chemin                                 | Pourquoi                                                                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/ia/app/prompts/`                 | tous les builders system + user, le registry versionné/hashé (22 prompts), fencing, context budget/transparency                                                                             |
| `apps/ia/app/services/domain_focus.py` | réécrit les chaînes de prompt selon le domaine ESN (dé-silo) — un changement de prompt qui vit hors de `app/prompts/`                                                                       |
| `apps/ia/app/eval/`                    | le banc lui-même : métriques, goldens, fixtures, `baseline.json` doivent rester cohérents entre eux — toute édition (y compris une mise à jour volontaire de baseline) re-déclenche le gate |

Garde anti-pourrissement : `tests/test_eval_gate.py::test_prompt_surface_paths_exist_in_repo`
échoue si un chemin surveillé est renommé sans mettre à jour `PROMPT_SURFACE`.

Si git est indisponible (image Docker sans repo, ref de base absente), le gate
ne peut pas prouver que les prompts sont inchangés → il lance le banc
**fail-safe** (hermétique, quelques secondes) plutôt que de laisser passer.

## Déterministe et OFFLINE — ce qui est dans le gate vs hors gate

**Dans le gate (offline, zéro appel réseau/Claude)** : le banc rejoue les
dossiers d'analyse **committés** (`app/eval/fixtures/*.analysis.json`) à
travers les 8 métriques déterministes (faithfulness, coherence, completeness,
contacts_quality, plays_grounding, buying_committee, source_freshness,
no_invented_data — voir `apps/ia/app/eval/README.md`). Fonctions pures des
fixtures : mêmes octets en entrée → mêmes scores en sortie, sur toute machine.

**Hors gate (LLM-dépendant, manuel uniquement)** : les fixtures étant gelées,
un changement de prompt ne modifie PAS par lui-même les scores du banc. Juger
la qualité des dossiers **produits par le nouveau prompt** exige le vrai moteur :

```bash
cd apps/ia && python -m app.eval.run --live "Doctolib" --save doctolib.dossier.json
```

`--live` appelle LangGraph + Claude + les providers (clés API requises,
non-déterministe, payant) — jamais en CI. Procédure recommandée après un gros
changement de prompt : run `--live` avant/après, comparer aggregate +
faithfulness, et si le nouveau dossier devient la référence, geler une nouvelle
fixture (§ « Mettre à jour la baseline »).

Ce que le gate garantit donc concrètement sur une PR prompts :

- le banc + les détecteurs + la baseline restent **mutuellement cohérents**
  (toute édition de métrique/fixture/baseline embarquée dans la PR est re-validée) ;
- le contre-exemple halluciné continue d'être **rejeté** (les détecteurs
  anti-hallucination ne se sont pas affaiblis) ;
- la dérive **au niveau des octets** des 22 prompts est, elle, épinglée par les
  tests du registry (`test_prompt_golden.py`, `test_prompt_fingerprint.py`,
  baseline `tests/golden/prompt_fingerprint.json`) qui tournent dans le job
  `Test (IA / Python)` — complémentaire, pas redondant.

## Seuils — valeur et justification

| Seuil                                                                       | Valeur                   | Justification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tolérance de régression par score (`BASELINE_TOLERANCE`, `app/eval/run.py`) | **0.005**                | Les métriques sont des fonctions pures de fixtures committées — le seul « bruit » possible est de représentation : la baseline stocke les scores arrondis à 4 décimales (`round(m.score, 4)`, quantisation ≤ 5e-5) et la somme flottante de l'agrégat peut varier d'ULP selon plateforme/version Python. 0.005 = un demi-point sur une échelle 0–100 : au-dessus de tout bruit de représentation, en dessous de tout changement produit signifiant. **Pas un budget de dégradation** — toute baisse réelle d'une métrique (les scorers bougent par paliers ≥ 0.1) dépasse largement 0.005 et échoue. |
| Bascule pass→fail d'un golden                                               | **zéro tolérance**       | Les hard gates (faithfulness < 5 % non sourcé, ≥ 1 décideur, zéro donnée inventée…) sont le contrat produit — un golden qui passait et échoue est une régression, quel que soit le delta de score.                                                                                                                                                                                                                                                                                                                                                                                                   |
| Golden disparu du run                                                       | **zéro tolérance**       | Supprimer un golden pour faire passer le banc = contournement ; la suppression doit être explicite (baseline mise à jour dans la même PR, revue).                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Contre-exemple halluciné                                                    | **doit rester en échec** | Si le dossier fabriqué (SIREN invalide, placeholders, emails RFC-2606, contacts non sourcés) se met à passer, ce sont les détecteurs qui ont régressé — échec immédiat, même hors `--check-baseline`.                                                                                                                                                                                                                                                                                                                                                                                                |
| Amélioration de score / nouveau golden                                      | **jamais bloquant**      | Le gate est un cliquet anti-régression, pas un verrou d'égalité stricte : les améliorations passent sans mise à jour de baseline (la relever reste recommandé pour re-tendre le cliquet).                                                                                                                                                                                                                                                                                                                                                                                                            |

## Mettre à jour la baseline (régression volontaire ou amélioration)

La baseline est `apps/ia/app/eval/baseline.json` (scores attendus des goldens
Doctolib + Société Générale + du contre-exemple). Elle ne se régénère **que**
pour accompagner un changement intentionnel — jamais pour faire taire une
régression qu'on ne comprend pas.

1. Faire le changement (prompt, métrique, fixture…) dans une branche.
2. `pnpm eval:gate` → constater l'échec et **expliquer chaque delta** (pourquoi
   ce score baisse, pourquoi c'est accepté).
3. `cd apps/ia && python -m app.eval.run --update-baseline`
4. Committer la baseline régénérée **dans la même PR** que le changement qui
   la motive — jamais dans une PR séparée « fix CI ».
5. Dans la description de PR : l'avant/après des scores + la justification.
   La revue de la PR **doit** approuver explicitement le diff de
   `baseline.json` (c'est le point de contrôle humain du cliquet).
6. Le gate re-tourne sur la PR (la baseline est dans la surface surveillée) et
   valide la cohérence nouvelle fixture ↔ nouvelle baseline.

Cas particuliers :

- **Nouveau golden** : ajouter `golden/<slug>.json` + `fixtures/<slug>.analysis.json`
  (procédure dans `apps/ia/app/eval/README.md`), puis `--update-baseline`.
- **Amélioration** : le gate passe sans rien faire ; relever la baseline dans
  la PR pour verrouiller le gain.

## Tests du gate

`apps/ia/tests/test_eval_gate.py` (hermétiques — diff injecté, fixtures committées) :

- classification de la surface (matchs + pièges par sous-chaîne + existence des chemins) ;
- prompts inchangés → **SKIP** exit 0 et le banc ne tourne pas ;
- surface modifiée + état committé sain → exit 0 (banc réel) ;
- régression simulée (baseline trafiquée qui promet plus que les fixtures) → exit 1 ;
- `--force`, forwarding de `--base`, git cassé → banc fail-safe ;
- plomberie git réelle en lecture seule (`changed_files_vs`).

Compléments existants : `test_eval_metrics.py` (chaque métrique bon vs mauvais),
`test_eval_runner.py` (CLI, baseline, guard contre-exemple).
