# La CI de BellumAI — ce qu'elle garde, ce qu'elle coûte

La documentation longue de `.github/workflows/ci.yml` vit ici ; le YAML garde des commentaires courts.
Mesures : `node tools/ci/metrics.mjs --days 7` → `docs/ci-metrics/<date>.md`, et chaque lundi l'issue
« Météo CI » (workflow `ci-meteo.yml`). **Si une mesure contredit ce fichier, la mesure gagne** : corriger ici.

## 1. Les SLO

| Indicateur                              | Cible                                   |
| --------------------------------------- | --------------------------------------- |
| CI d'une PR verte, p50 / p90            | ≤ 10 / ≤ 20 min                         |
| Runner-min par PR fusionnée (tous runs) | ≤ 60                                    |
| Rouge au 1er run d'une PR               | ≤ 15 %                                  |
| `main` vert (suite complète)            | ≥ 97 %, jamais de déploiement sur rouge |
| Runs annulés qui cachent un rouge       | 0                                       |
| Web en mode `concernés`                 | ≥ 70 % des PR                           |
| File d'attente par job, p90             | ≤ 3 min                                 |

La ligne de base est dans [`docs/ci-metrics/2026-10-31.md`](ci-metrics/2026-10-31.md) (7 j, 563 runs, 123 PR fusionnées).

### Ce que la mesure a corrigé dans l'audit initial (31/10/2026)

| Audit                                    | Mesuré sur 7 j                                                                                 | Lecture                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| ~150 runs `ci.yml`/j                     | **80/j**                                                                                       | l'audit comptait un pic d'un jour (165)                     |
| PR verte p50 ~42 min, p90 100–127        | **29 / 81 min**                                                                                | le 30/10 seul : 41 / 122                                    |
| 62 % annulés, surtout des rouges         | **58 % annulés ; 294 sur 324 sont des rouges coupés** (`red-cut`), 30 remplacés, 0 extérieur   | confirmé                                                    |
| taux de rouge ≈ 50 %                     | **62 %** des runs, **64 %** au 1er run d'une PR                                                | pire que l'audit                                            |
| `main` vert ~46 %                        | **48 %** de 121 pushes                                                                         | confirmé                                                    |
| file p90 28 min                          | **11,8 min**, max 258 min                                                                      | la queue est longue, pas le p90                             |
| Web en `concernés` 0 %                   | **0 %** (API 3 %) ; 1re cause : `tests-node.generated.ts` (40/59 bascules)                     | cause non vue par l'audit                                   |
| shards Web ~30 % plus lents sur 32 cœurs | **Web à égalité** (p50 24,6 CX43 / 25,5 autres) ; **API 1,7× plus lent sur CX43** (16,5 / 9,8) | router l'API hors CX43 ; le CX53 Intel ne prend aucun shard |
| runner-min/PR fusionnée ≥ 250 (estimé)   | **p50 214, moyenne 313**                                                                       |                                                             |

## 2. Ce qui garde (audit du 31/10/2026)

**La règle de fusion** : ruleset `main — CI Status requise` (actif) — check requis `CI Status`,
`strict_required_status_checks_policy: false` (une PR n'a pas à être à jour de `main` pour fusionner),
contournement possible par les administrateurs de l'organisation. Pas de file de fusion (plan GitHub
**Team**, dépôt privé : la file native n'y est pas disponible).

| Job                                      | Déclencheur                           | Statut                              | Ce qu'il attrape / ce qui manque                                                                                                                                   |
| ---------------------------------------- | ------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Ce qui a changé`                        | PR prête, push `main`, nuit           | GARDE                               | décide de tout le reste ; repli = tout lancer                                                                                                                      |
| `Contrôles rapides`                      | PR                                    | GARDE                               | lint, format, suites légères                                                                                                                                       |
| `Build` (+ types, + types des specs API) | PR si Node touché                     | GARDE                               |                                                                                                                                                                    |
| `Test (API)` ×6                          | PR (concernés), `main`/nuit (complet) | GARDE                               |                                                                                                                                                                    |
| `Test (Web)` ×4                          | PR, `main`/nuit                       | GARDE, **mais toujours en complet** | le sélecteur ne voit pas `@bellum/contracts` (résolu vers `dist`, absent au moment de la sélection) — **corrigé** par `ci/1-selecteur` (contrats lus depuis `src`) |
| `Test (IA / Python)`                     | PR si IA touchée                      | GARDE                               | pytest dans un Python partagé entre jobs — **corrigé** par `ci/1-ia` (venv hermétique, annexe `test-ia`)                                                           |
| `Contrats d'architecture`                | PR                                    | GARDE                               |                                                                                                                                                                    |
| `La doc suit le code`                    | PR                                    | GARDE                               | sur le chemin critique de tous les jobs lourds                                                                                                                     |
| `Démo (semis sur vraie base)`            | PR si démo touchée                    | GARDE                               |                                                                                                                                                                    |
| `promptfoo (Laura)`                      | PR si prompts touchés                 | **DÉCORATIVE**                      | secret `ANTHROPIC_API_KEY` absent : passe en ~7 s sans rien évaluer — **corrigé** par `ci/1-evals` : clé absente = ROUGE                                           |
| `eval-nightly.yml`                       | nuit                                  | **MUETTE**                          | même secret absent : `not_configured` chaque nuit — **corrigé** par `ci/1-evals` : clé absente = ROUGE                                                             |
| `Dette de formatage`                     | `main`/nuit                           | HORS CHEMIN                         | rapporteur, hors `CI Status`                                                                                                                                       |
| `Suite complète rouge sur main`          | `main` en `failure()`                 | rapporteur                          | aveugle aux runs `main` annulés — **corrigé** par `ci/1-etages` (annulé avec une étape `failure` = alerte)                                                         |

⚠️ **La suite complète ne garde PAS la fusion** : sur PR, seuls les tests concernés tournent (Web : en
théorie) ; la suite entière ne tourne qu'après fusion, sur `main`. Un rouge de la suite complète se
découvre donc sur `main`, jamais avant. C'est l'objet de la Phase 2 : la file de fusion (§5), où le label `ci:train` force la suite complète avant fusion.

⚠️ **`CI_COUPE_SUR_ROUGE=true`** (état mesuré au 31/10, coupure supprimée depuis — voir §3) : au premier
rouge, le run entier était annulé, le job fautif compris. Un rouge s'affichait alors `cancelled` ;
`metrics.mjs` le recompte en rouge s'il porte une étape `failure` (`realVerdict`).

## 3. Les interrupteurs (`vars.*`)

Une ligne par variable. Défaut = valeur quand la variable est absente.

| Variable                                         | Défaut                                                   | Effet                                                                                                                                                                           | Revenir en arrière                                                 |
| ------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `CI_RUNS_ON`                                     | `bellum-ci` (posée le 31/10) ; absente = `ubuntu-latest` | runners auto-hébergés (Hetzner)                                                                                                                                                 | vider → runners GitHub (coupés : enveloppe dépassée)               |
| `CI_RUNS_ON_WEB`                                 | `["bellum-ci","rapide"]`                                 | pool des shards Web                                                                                                                                                             | vider → `CI_RUNS_ON`                                               |
| `CI_RUNS_ON_API`                                 | repli `CI_RUNS_ON_WEB`                                   | runners de `Test (API)`, même forme JSON ; mesuré : p50 16,5 min sur CX43 contre 9,8 ailleurs. Exige des labels sur les runners non-CX43 (`infra/ci-runner-vps/runbook.md` § 4) | vider → `CI_RUNS_ON_WEB`                                           |
| `MERGE_TRAIN`                                    | actif                                                    | file de fusion `merge-train.yml` (§5)                                                                                                                                           | `off` → aucun passage n'écrit                                      |
| `CI_STAGE_GATE`                                  | actif                                                    | un job lourd sort en `failure` (« étage rapide rouge : <job> ») si l'étage rapide est rouge                                                                                     | `'false'` → les shards lourds vont au bout                         |
| `CI_WARM_CACHE`                                  | actif                                                    | job `warm-cache` sur push `main` : écrit les caches build/tsc/quick lisibles par toutes les PR                                                                                  | `false` → plus de job `warm-cache` (PR à froid)                    |
| `CI_DURATIONS_FRAICHES`                          | actif                                                    | shards web ET API répartis sur les durées des derniers runs `main`                                                                                                              | `false` → web : `test-durations.json` ; API : découpage par nombre |
| `CI_NODE_COMPILE_CACHE`                          | actif                                                    | `NODE_COMPILE_CACHE=/tmp/node-compile-cache`                                                                                                                                    | `false` → pas de cache de compilation Node                         |
| `TURBO_API`, `TURBO_TEAM` + secret `TURBO_TOKEN` | absents                                                  | cache distant turbo via `.github/actions/turbo-remote` s'ils sont posés (token ET équipe) ; aucun serveur déployé                                                               | vider l'une des trois → aucun effet                                |
| `CI_IA_XDIST`                                    | `3`                                                      | nombre de workers pytest-xdist de `test-ia` (`--dist loadfile`)                                                                                                                 | `0` → séquentiel (ancien régime)                                   |
| `PROMPTFOO_REQUIRE_KEY`                          | exigé (vide)                                             | `promptfoo` et l'éval nocturne échouent sans `ANTHROPIC_API_KEY`                                                                                                                | `false` → clé absente = job sauté (ancien comportement)            |
| `PROMPTFOO_CACHE`                                | actif (vide)                                             | cache promptfoo restauré (`PROMPTFOO_CACHE_PATH`)                                                                                                                               | `false` → `--no-cache`, aucune restauration                        |
| `PROMPTFOO_MAX_COST_USD`                         | `2`                                                      | plafond estimé d'un run promptfoo de PR                                                                                                                                         | relever la valeur                                                  |
| `PROMPTFOO_NIGHTLY_MAX_COST_USD`                 | `10`                                                     | plafond estimé du promptfoo nocturne                                                                                                                                            | relever la valeur                                                  |
| `EVAL_NIGHTLY_MAX_COST_USD`                      | `10` (workflow)                                          | plafond mesuré du banc live nocturne                                                                                                                                            | relever la valeur                                                  |
| `EVAL_NIGHTLY_ENABLED`                           | actif                                                    | éval nocturne (`eval-nightly.yml`)                                                                                                                                              | `false` → le job nocturne ne tourne pas                            |
| `CI_SELECTOR_LEGACY`                             | inactif                                                  | sélecteur web « concernés » resserré (voir `docs/tests-rapides.md`)                                                                                                             | `true` → ancien comportement (fondations larges)                   |
| `CI_QUARANTINE`                                  | actif                                                    | un shard Web/API rouge est vert (avec `::warning`) SEULEMENT si tous ses tests rouges sont dans `tools/ci/quarantine.json` ; jamais de retry                                    | `false` → la quarantaine n'absout plus rien                        |
| `CI_FLAKY_DETECT`                                | actif                                                    | `ci-flaky.yml` détecte les tests rouges isolés des 14 dernières nuits et propose leur quarantaine (PR `ci/quarantaine-auto`)                                                    | `false` → aucune détection                                         |
| `CI_METEO`                                       | actif                                                    | `ci-meteo.yml` : mesure hebdomadaire, issue `ci-meteo`, alerte `ci-slo-rate`                                                                                                    | `false` → plus de météo                                            |
| `CI_MIGRATIONS_ROUNDTRIP`                        | actif                                                    | étape « Migrations — aller-retour up/down » du job `test-demo-db` (§8)                                                                                                          | `off` → étape retirée (ancien comportement)                        |
| `CI_MIGRATIONS_SCHEMA_REQUIRED`                  | absent = avertissement                                   | `on` : un écart entités ↔ schéma (table/colonne manquante) FAIT ÉCHOUER ; sinon `::warning`                                                                                     | vider → avertissement                                              |
| `CI_MIGRATIONS_DOWN_REQUIRED`                    | absent = avertissement                                   | `on` : un `down` en échec ou un objet restant après tous les `down` FAIT ÉCHOUER ; sinon avertissement                                                                          | vider → avertissement                                              |
| `CI_TESTS_NODE_CHECK`                            | PR seulement                                             | étape « Liste des tests node à jour » de `quick` : ne rougit que pour la dérive des fichiers que la PR touche (la dérive venue de `main` reste un avertissement, #4484)         | `strict` → tout écart rougit ; `off` → étape sautée                |
| `VITEST_LAZY_EN` (env vitest, pas `vars.*`)      | actif                                                    | catalogues EN chargés paresseusement en test (§9)                                                                                                                               | `0` → imports statiques d'origine                                  |
| `CI_COUPE_SUR_ROUGE`                             | —                                                        | **plus aucun effet** (coupure supprimée le 31/10) ; Louis la supprime des variables du dépôt                                                                                    | sans objet                                                         |

### Étages et concurrence

**Un rouge reste `failure`.** Mesuré le 31/10/2026 : 70 des 100 derniers runs `pull_request` de `ci.yml` étaient `cancelled`, la majorité des ROUGES coupés par la variable `CI_COUPE_SUR_ROUGE` (un job rouge annulait le run entier, lui compris). Cette coupure est supprimée.

- **Étage rapide** : `changes`, `quick` (« Contrôles rapides »), `arch`, `doc-suit-le-code`, et l'étape types (`Check types`) du `build`. **Étage lourd** : `test` (API), `test-web`, `test-ia`, `test-demo-db`.
- Les jobs lourds démarrent après `changes` (le chemin critique ne change pas). Au démarrage, chacun lance `node tools/ci/stage-gate.mjs` (une requête REST légère) : si un job de l'étage rapide du MÊME run est déjà `failure`, il sort en `failure` avec le message `étage rapide rouge : <job>`, jamais `cancelled`. Si l'API ne répond pas, il va au bout (on en fait plus, pas moins).
- **Concurrence** : PR = groupe `ci-pr-<numéro>`, `cancel-in-progress` (un nouveau push remplace le précédent). Push `main` = groupe unique `ci-main-push`, `cancel-in-progress` (un seul run complet en vol, 03/11/2026 : 42 % des job-min). Nuit / manuel = groupe par SHA, jamais annulé.
- **Brouillons** : `changes` est sauté en brouillon et tout autre job de PR en dépend, donc rien ne tourne ; `CI Status` reste rouge (« Brouillon — CI non lancée »). Échantillon 31/10 : 1 run court en `failure` sur 100 runs récents, soit ~1 % : le brouillon n'est pas la source des annulations.
- `dette-formatage` : nuit (`schedule`) et `workflow_dispatch` seulement.
- `suite-complete-rouge` s'ouvre aussi quand un job lourd de `main` est `cancelled` avec une étape en `failure` (timeout après un test rouge) ; une annulation manuelle pure n'ouvre rien.

## 4. Runbook

- **`main` rouge** : lire l'issue `ci-main-rouge` (plage de commits depuis le dernier vert). Ne JAMAIS
  annuler un run `main` (`gh run cancel`) : c'est le seul verdict de la suite complète ; l'annuler laisse un
  commit de `main` sans verdict. Un run `main` rouge se relance
  (`gh api -X POST repos/Bellum-AI/belllum-monorepo/actions/runs/<id>/rerun-failed-jobs`), il ne s'annule pas.
- **Run annulé** : chercher l'ÉTAPE en `failure` dans les jobs annulés avant de conclure ; un run annulé
  sans étape rouge a été remplacé, coupé de l'extérieur ou a dépassé son `timeout-minutes`.
- **Runner perdu / flotte saturée** : `infra/ci-runner-vps/runbook.md`. Repli : vider `CI_RUNS_ON`.
- **Mesurer** : `GH_REPO=Bellum-AI/belllum-monorepo node tools/ci/metrics.mjs --days 7 --logs 60`.
  ~1 appel REST par run + 1 par journal échantillonné ; quota 5 000/h.

## 5. La file de fusion (lot E `ci/2-train`)

Plan GitHub Team, dépôt privé : pas de merge queue native. `tools/ci/merge-train.mjs`
(Node 22, REST, sans dépendance), lancé par `.github/workflows/merge-train.yml`.

**Entrer** : PR prête (pas brouillon) vers `main`, label `ci:train`. **Ordre** : celui de pose
du label (le plus ancien d'abord). **Un pas par passage** (cron 10 min, `workflow_dispatch`, ou
pose du label), sur la PR de tête seulement :

1. en conflit → éjectée ;
2. en retard sur `main` → `update-branch` (la CI repart sur le nouveau SHA) ;
3. `CI Status` absent ou en cours → on attend ; annulé → on attend un run neuf ;
4. CI lancée AVANT la pose du label (donc en suite partielle) → fermée puis rouverte pour relancer ;
5. `CI Status` vert, à jour → `PUT /pulls/{n}/merge` (méthode merge), puis la suivante ;
6. `CI Status` rouge → label retiré, commentaire nommant les jobs rouges, la suivante prend la tête.

**Suite complète avant fusion** : `ci:train` force `Test (Web)` / `Test (API)` en mode COMPLET, comme
`ci:suite-complete` (`forcesFullSuite` dans `tools/ci/test-changed.mjs`). Aucune garde n'est retirée.

**Jeton** : une fusion, un `update-branch` ou une réouverture faits par `GITHUB_TOKEN` ne déclenchent
PAS les workflows (`push`, `pull_request`). Avec le secret `MERGE_TRAIN_TOKEN` (PAT ou app, droits
contents + pull requests + actions) le train met les branches à jour. Sans lui, il ne les met pas à
jour (la PR en retard est signalée et laissée à la main de son auteur) et, après une fusion, il lance
`ci.yml` et `sentry-release.yml` sur `main` par `workflow_dispatch`.

**Couper** : `gh variable set MERGE_TRAIN --body off` (aucun passage n'écrit). Essai à blanc :
`workflow_dispatch` avec `dry_run` (défaut vrai) ou `node tools/ci/merge-train.mjs --dry-run`.
Retirer le label d'une PR la sort de la file.

### Déployer après vert (Railway `checkSuites`)

`.railway/railway.ts` passe `checkSuites` à `true` sur les trois services déployés depuis `main` :
Railway attend alors que TOUTES les check suites du commit soient terminées et vertes. Appliquer
APRÈS la fusion de cette PR : `railway config plan`, relire, puis `railway config apply`.

Avant d'appliquer, vérifier ce que `main` lance sur `push` : `ci.yml` (suite complète),
`sentry-release.yml` (no-op sans jeton). Un workflow qui NAÎT rouge, ou qui attend le déploiement,
bloquerait tout déploiement. Deux conséquences déjà traitées ou à connaître :

- `demo-smoke.yml` attendait le déploiement sur `push` : interblocage. Son déclencheur `push` est
  retiré, le passage horaire reste.
- le déploiement attend la fin de la suite complète de `main` (≈ 30 min) : coût assumé de « déployer
  après vert ». Dernier `ci.yml` de `main` à vérifier VERT avant d'appliquer.

## 6. Quarantaine des tests flaky (lot `ci/6-quarantaine`)

- **Détection** : `ci-flaky.yml` (05:30 UTC, après la suite complète nocturne) lit les rapports JSON des 14 dernières nuits (`web-test-report-<i>`, `api-test-report-<i>`) via `tools/ci/flaky.mjs`. Un test rouge ISOLÉ (nuit voisine verte) entre dans `tools/ci/quarantine.json` (`{file, test, since, last_fail, green_nights}`) par PR automatique `ci/quarantaine-auto`, et ouvre une issue `flaky`. Une régression (rouge plusieurs nuits de suite) n'entre PAS : elle reste rouge.
- **En PR** : le test en quarantaine s'exécute. Le shard Web/API est vert (avec `::warning` nommant les tests) SEULEMENT si tous les tests rouges sont en quarantaine (`tools/ci/quarantine.mjs decide`). Un test hors quarantaine rouge, un rapport illisible ou une suite en échec sans test nommé : rouge. Aucun retry.
- **Sortie** : après 14 nuits vertes depuis le dernier échec, l'entrée est retirée et l'issue close.
- **Météo** : `ci-meteo.yml` (lundi 06:00 UTC, un seul workflow) mesure (`tools/ci/metrics.mjs`), publie dans l'issue `ci-meteo`, compare au rapport précédent (marqueur dans l'issue) et pose le label `ci-slo-rate` si un SLO est raté deux semaines de suite (`tools/ci/meteo-alerte.mjs`).
- **Jobs sans succès** (#4873.2) : `jobs-sans-succes.yml` (lundi 07:00 UTC) lance `tools/ci/jobs-sans-succes.mjs` sur les 40 derniers runs de `ci.yml` ; un job qui n'a jamais rendu `success` y est nommé et le workflow sort en rouge. Lecture seule, hors de `ci.yml` (la CI ne se juge pas avec l'API GitHub).
- **Interrupteurs** : `CI_QUARANTINE`, `CI_FLAKY_DETECT`, `CI_METEO` (§3).
- **Dépendances** : le rapport Web nocturne vient de `ci/1-caches`, `metrics.mjs` de `ci/0-metrics` (tous deux dans cette intégration). Sans rapport : détection Web muette, jamais un rouge.

## 7. Porte locale — `pnpm ci:local` (lot `ci/5-process`)

L'**Étage 1** de la CI (l'étage rapide : `changes`, `quick`, `arch`, `doc-suit-le-code`, types du `build`), rejoué en
local sur le diff de la branche (merge-base avec `origin/main` → arbre de travail). Né d'une mesure : 64 % des PR
rouges au premier run, sur ce que l'ancienne porte (prettier + knip) ne regardait pas — vitest, pytest, « la doc suit
le code ».

| Étape                    | Ce qu'elle lance                                                                         | Même code que la CI                              |
| ------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------ |
| CLAUDE.md                | taille ≤ 15 000 octets                                                                   | étape `CLAUDE.md ≤ 15 000` de `quick`            |
| Format                   | `prettier --check` des fichiers modifiés                                                 | même règle que l'étape `Prettier check`          |
| Lint                     | ESLint des paquets touchés (leurs fichiers modifiés), knip                               | `pnpm lint`, `pnpm lint:exports:types`           |
| Types                    | `check-types` des paquets touchés (+ `check-types:tests` de l'API), dépendances buildées | `pnpm check-types` du `build`                    |
| La doc suit le code      | `node scripts/garde-derive-doc.mjs origin/main...HEAD` (rc 2 = non applicable)           | job `doc-suit-le-code`                           |
| Tests web / API          | `node tools/ci/test-changed.mjs ci --suite web\|api` puis vitest / jest sur la sélection | le sélecteur de `Test (Web)` / `Test (API)`      |
| Tests contracts          | `vitest related` sur les fichiers modifiés                                               | —                                                |
| IA                       | pytest des modules touchés (`planChangedRuns`) + les trois portes d'éval                 | `planChangedRuns`, étapes `Eval gate` de `quick` |
| Outils Python, registres | les pytest de `tools/`, `tools/registres/coherence.py` sur les registres touchés         | étapes `Pytest (tools/…)` et registres           |

**Bornes locales** (la suite complète reste la vérité, en CI) : quand le sélecteur rend `mode=complet` (fondation
touchée : `tools/ci/`, `packages/contracts/`, un tsconfig…), la porte lance les tests **liés** au diff et l'écrit ; une
suite IA entière (prompt, golden, config) est laissée à la CI et l'écrit. Une seule porte à la fois sur la machine
(verrou dans le répertoire temporaire), workers plafonnés à `CI_LOCAL_WORKERS` (défaut 4). Journaux complets dans
`<git-dir>/ci-local/`, sortie condensée, rc ≠ 0 si rouge.

**Machine cloud** (Louis 31/10/2026) : quand `CLAUDE_CODE_REMOTE=true` (session cloud de Claude Code), les tests
(web, API, contracts, pytest) et les portes d'éval sont **sautés et dits** — format, lint, types et doc restent joués.
Mesure qui l'a fait naître : le lot D Découvrir, 33 min de porte rouge dans la VM (dont des tests déjà rouges sur
`main`), sept commits retenus en otage faute de push. La suite appartient à la CI GitHub.

**Témoin** : vert ET arbre propre ⇒ `<git-dir>/ci-local-ok` = SHA de HEAD. Le lisent :

- `.husky/pre-push` — saute la porte si le témoin porte déjà HEAD, la lance sinon ; refuse aussi, sur une branche
  `claude/lot*`, les fichiers chauds (`tools/ci/hot-files.mjs`, fragments : `changes/README.md`) ;
- le hook `PreToolUse` de `.claude/settings.json` (`tools/ci/claude-hook-push.mjs`) — refuse le `git push` d'un agent
  sans témoin au SHA courant (`--delete`, `:branche`, `--tags` exemptés).

`pnpm ci:local --dry-run` affiche le plan sans rien lancer ; `--base <ref>`, `--no-fetch`.

**Hook `pre-commit` (03/11/2026)** : `lint-staged` ne lance plus que `prettier --write` sur les fichiers indexés.
ESLint (`eslint --fix`) y était rejoué à chaque commit alors que `ci:local` le joue déjà sur le diff au push et que
la CI l'a en job à part. **Échappatoire d'urgence** : `CI_LOCAL_SKIP=1 git push` saute toute la porte du `pre-push`
(machine saturée, correctif urgent) ; `HUSKY=0 git commit` saute le `pre-commit`. La CI reste le filet.

## 8. Migrations sur vraie base (lot `ci/3-api-migrations`)

Étape « Migrations — aller-retour up/down » du job `test-demo-db` (déjà dans `CI Status`) : up de toutes les
migrations → schéma conforme aux entités → down de toutes → `public` vide → re-up, sur une base `migrations_rt`
à part dans la grappe 5441. Interrupteurs : `CI_MIGRATIONS_*` (§3).

Le `up` de toutes les migrations sur base vierge est TOUJOURS bloquant. Les deux contrôles neufs (schéma, down) n'avaient jamais tourné sur une vraie base au moment de leur ajout : ils démarrent en avertissement ; on les passe à `on` quand le premier run CI montre zéro écart. Test : `apps/api/src/database/migrations-roundtrip.db.spec.ts`. Inventaire des specs miroirs (rien supprimé) : [tests-inventory/migrations-miroirs.md](tests-inventory/migrations-miroirs.md).

## 9. Coût par fichier de test Web (lot `ci/3-web-setup`)

Mesuré le 31/10/2026 : ~85 % du temps worker vitest web est de l'overhead (`setup` ≈ 40 %, `collect` ≈ 34 %),
pas des assertions.

- Catalogues EN paresseux : `resources.ts` importe ~110 catalogues EN que la plupart des fichiers ne lisent pas. Le
  plugin `lazyEnglishCatalogs` (`apps/web/vitest.config.ts`) les remplace, en test seulement, par `lazyJson()` :
  lecture synchrone au premier accès. Mesuré : environ −100 ms de `setup` par fichier (−8 %). Aucune assertion
  changée. Interrupteur `VITEST_LAZY_EN` (§3).
- Liste `tests-node.generated.ts` vérifiée dans `quick` (`classer-tests-node.mjs --check`) ; interrupteur
  `CI_TESTS_NODE_CHECK` (§3).
- `isolate: false` n'est pas étendu : pas de preuve de deux runs `--sequence.shuffle` verts sur un projet DOM
  (54 rouges mesurés le 16/09/2026). Les `vi.mock` globaux de `setup.ts` restent en place.

---

## Annexe — la doc d'origine (ENG-204, à réviser : jobs fusionnés depuis)

### Quand ça tourne

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) se déclenche **sur chaque pull request** ciblant `development`, `staging` ou `main`.

Pas de trigger sur `push` direct : on protège les branches via la PR. Une nouvelle commit sur une PR existante annule la run précédente (`concurrency.cancel-in-progress`).

### Ce qui est vérifié

Six jobs en parallèle, plus un gate qui agrège leur résultat :

| Job           | Commande locale équivalente             | Bloque sur                                      |
| ------------- | --------------------------------------- | ----------------------------------------------- |
| `lint`        | `pnpm lint` + `pnpm lint:exports:types` | erreur ESLint, type exporté inutilisé (knip)    |
| `format`      | `pnpm format:check`                     | écart Prettier                                  |
| `check-types` | `pnpm check-types`                      | erreur TypeScript                               |
| `build`       | `pnpm build`                            | erreur de build (Vite, Nest, packages, Next.js) |
| `test`        | `pnpm turbo test --filter=@bellum/api`  | régression Jest API                             |
| `test-ia`     | `cd apps/ia && pytest -q`               | régression Python IA                            |
| `ci-status`   | —                                       | l'un des jobs ci-dessus a échoué                |

`ci-status` est le job à cibler dans la **branch protection rule** GitHub ("Require status checks → CI Status"). Il dépend des six autres avec `if: always()` : un job en `failure` ou `cancelled` fait sortir le gate en exit 1.

### Reproduire l'échec en local

Avant de pousser, `pnpm ci:local` (§7). La chaîne complète, pour mémoire (suites entières = la CI) :

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm lint:exports:types
pnpm format:check
pnpm check-types
pnpm build
pnpm turbo test --filter=@bellum/api
cd apps/ia && pytest -q
```

Ces commandes correspondent une-pour-une aux jobs CI. Pour le test IA, exécute d'abord `pnpm setup` ou installe `apps/ia/requirements.txt` dans un venv Python local.

### Détail des jobs

#### `lint`

- Runtime : Node 22, pnpm.
- Installe avec `pnpm install --frozen-lockfile`.
- Exécute `pnpm lint`.
- Exécute `pnpm lint:exports:types`, basé sur Knip, pour bloquer les exports de types inutilisés.

#### `format`

- Runtime : Node 22, pnpm.
- Exécute `pnpm format:check`.
- Ne reformate pas automatiquement : corriger localement avec `pnpm format`.

#### `check-types`

- Runtime : Node 22, pnpm.
- Exécute `pnpm check-types`.
- Vérifie les projets TypeScript du monorepo selon leurs scripts locaux.

#### `build`

- Runtime : Node 22, pnpm.
- Exécute `pnpm build`.
- Couvre les builds Vite, NestJS, packages partagés et apps Next.js selon la configuration Turbo.

#### `test`

- Runtime : Node 22, pnpm.
- Exécute uniquement les tests API : `pnpm turbo test --filter=@bellum/api`.
- Ce job est volontairement limité à l'API. Les tests frontend globaux ne sont pas encore dans le gate CI.

#### `test-ia`

- Runtime : Python 3.13.
- Venv hermétique par job (action `.github/actions/ia-venv`) : `uv venv` dans `$RUNNER_TEMP`, puis
  `uv pip sync apps/ia/requirements.lock`. Plus aucun `pip install` dans le Python partagé du runner
  (`_work/_tool/Python`), donc plus de fuite d'un job à l'autre (c'est ce qui imposait
  `import-linter`/`rich<14` « APRÈS requirements.txt »). Le job `quick` (portes d'éval IA) utilise le même venv ;
  `lint-imports` et `pip-audit` tournent via `uvx`, dans leur propre environnement jetable.
- `apps/ia/requirements.lock` est généré (`apps/ia/requirements-ci.in` = `requirements.txt` + `pytest-xdist`,
  `import-linter<2.7`, `rich<14`) :
  `uv pip compile apps/ia/requirements-ci.in --universal --python-version 3.13 -o apps/ia/requirements.lock`.
  À régénérer à chaque changement de `requirements.txt`. Railway installe toujours `requirements.txt` (inchangé).
- Exécute `pytest -q -n 3 --dist loadfile` dans `apps/ia` (un fichier de test = un worker).
- Ne dépend pas de pnpm.

Interrupteur : `CI_IA_XDIST` (§3).

### Caches

Les jobs Node mettent en cache :

- le **store pnpm** via `actions/setup-node@v4` avec `cache: pnpm` (clé = `pnpm-lock.yaml`)
- le **dossier `.turbo`** via `actions/cache@v4`, clé `turbo-<job>-<os>-<sha>` avec restore-keys par OS

Le job Python met en cache `pip` via `actions/setup-python@v5`, clé basée sur `apps/ia/requirements.txt`.

Conséquence : la première run d'une branche est lente, les suivantes profitent des caches pnpm/Turbo/pip.

### Caches écrits depuis main (lot B2 `ci/1-caches`, 31/10/2026)

GitHub isole les caches par **ref** : une PR ne lit que ses propres caches et ceux de `main`. `Build` et `quick`
ne tournent que sur `pull_request`, donc `turbo-build-*`, `tsc-incremental-*` et `turbo-quick-*` n'existaient
jamais sur `main` et chaque PR repartait à froid. Le job `warm-cache` (push sur `main` seulement) rejoue Build +
Check types + les tests légers de `quick`, avec les mêmes chemins et `restore-keys`, et sauvegarde les trois
familles. Il est dans les `needs` de `suite-complete-rouge` (garde `alarme-main-couvre-tous-les-jobs`).
Garde : `apps/web/src/test/ci-caches-main.test.ts`. Interrupteurs : §3.

Hors workspace : le runner fait `git clean -ffdx`. Le store pnpm vit déjà sur le volume des runners
(`.github/actions/store-pnpm`) ; `NODE_COMPILE_CACHE` pointe sur `/tmp/node-compile-cache` ; le cache jest est déjà
dans le tmpdir. Le cache vitest (`node_modules/.vite`) reste dans le workspace (gain négligeable, pas déplacé).

**Hash turbo stable.** `@bellum/utils` régénérait `tlds.generated.ts` à chaque `prebuild`. Le fichier est commité ;
le script ne le réécrit plus que si son contenu change, et `packages/utils/src/tlds-synchro.test.ts` échoue si le
fichier commité n'est plus celui du paquet `tlds` installé. Diagnostic d'un hash qui diffère entre deux jobs du même
SHA : `node tools/ci/turbo-hash.mjs` (imprimé par `Build` et `warm-cache`, étape « Hash turbo (diagnostic) ») compare
hash, dépendances externes, empreinte des fichiers d'entrée et variables d'environnement.

**Durées des shards web.** Le run complet (push main, nuit) publie un rapport JSON vitest par shard
(artefact `web-test-report-<i>`, 14 jours). `tools/ci/fetch-durations.mjs` lit les plus récents de `main` (REST) ;
`tools/ci/shard-by-duration.mjs` les utilise (repli : `apps/web/test-durations.json`) et donne la **médiane** à un
fichier sans durée. Rafraîchir le fichier commité : `GITHUB_TOKEN=$(gh auth token) GITHUB_REPOSITORY=Bellum-AI/belllum-monorepo
node tools/ci/fetch-durations.mjs --write-committed`.

### Pré-requis pour qu'une PR passe

- `pnpm-lock.yaml` à jour (sinon `--frozen-lockfile` casse l'install)
- code formaté (`pnpm format`)
- aucune erreur ESLint (warnings tolérés, errors bloquent)
- aucun export de type orphelin (voir [lint-unused-exports.md](lint-unused-exports.md))
- code TypeScript valide
- `pnpm build` finalise sans erreur (web → vite + tsc, api → tsc, packages → tsc --build)
- tests Jest API verts
- tests Python IA verts

### Périmètre volontairement exclu

- **Tests frontend globaux (`@bellum/web`)** : pas dans le gate aujourd'hui, car certains tests historiques ne sont pas encore stabilisés.
- **Tests de packages partagés hors API** : pas explicitement forcés dans le gate, sauf s'ils sont couverts par `build`, `check-types` ou un script appelé transitivement.
- **E2E API** : pas branché. Le script `test:e2e` (vers un `test/jest-e2e.json` inexistant, sans appelant) a été retiré le 31/10/2026 ; les specs `*.e2e.spec.ts` tournent dans `Test (API)`.
- **Ruff/mypy IA** : pas branchés aujourd'hui. Le job IA couvre uniquement `pytest -q`.

### Évals LLM (promptfoo et rejeu nocturne)

Lot `ci/1-evals`. Avant : le job `promptfoo` passait en vert en 7 s sans secret (« PR depuis un fork »), et
`eval-nightly.yml` rendait `status: not_configured` toutes les nuits. Le dépôt n'a pas de fork externe : une clé
absente est une panne, pas un cas normal.

- **Sans `ANTHROPIC_API_KEY`** : le job `promptfoo` et le job nocturne sortent en **échec** (« secret ANTHROPIC_API_KEY
  absent : aucune eval rejouée »). Le secret est un geste humain (copié de Railway).
- **Déclencheur** (sortie `promptfoo` du job `changes`) : `apps/ia/**/prompts/**`, `apps/ia/evals/**` (configs promptfoo,
  goldens, `provider.py`, `asserts.py`), `chat_tools.py`, `model_policy.py` (constante de modèle), `org_declare.py`.
  Sur `.github/workflows/` ou les fondations, tout tourne (portée sélective : dans le doute, plus).
- **Configs rejouées** : `chat.yaml`, `analysis.yaml`, `talent-message.yaml` (la dernière n'était rejouée nulle part).
- **Seuil** : inchangé, 100 % des assertions déterministes (les `llm-rubric` ont `weight: 0`) ; un cas rouge = job rouge.
- **Cache** : `PROMPTFOO_CACHE_PATH=$RUNNER_TEMP/promptfoo-cache`, restauré par `actions/cache`, clé = version promptfoo +
  hash (`prompts/**`, `evals/**`, `chat_tools.py`, `model_policy.py`). Mêmes entrées = même réponse rejouée gratuitement ;
  tout changement de prompt ou de config invalide la clé et rejoue pour de vrai.
- **Plafond de coût** : `.github/scripts/promptfoo-cost.py` estime jetons x prix (prix par défaut volontairement hauts :
  3 / 15 $ par million) et échoue au-delà de `PROMPTFOO_MAX_COST_USD` (2 $ par run PR, 10 $ la nuit). `--max-concurrency 4`.
  Un coût non mesurable est NOMMÉ dans le résumé, jamais compté 0.
- **Nuit** : banc live Python (plafond 10 $ via `EVAL_NIGHTLY_MAX_COST_USD`, défaut du code inchangé : 3 $) puis promptfoo
  complet sans cache. Un des deux rouge = nuit rouge. `promptfoo` reste dans `CI Status` (porte c77).
- Interrupteurs : `PROMPTFOO_*`, `EVAL_NIGHTLY_*` (§3).

### Railway preview PR

Les déploiements Railway production fonctionnent, mais les environnements de preview créés depuis les PR ne sont pas encore fiables.

Blocage connu :

- Les variables d'environnement de preview ne sont pas encore dynamiques.
- Les valeurs nécessaires à l'API, au service IA, Redis, Supabase, Stripe, Resend et aux secrets internes doivent être adaptées par environnement.
- Tous les services nécessaires ne sont pas encore déployés en preview avec la même topologie qu'en production.
- Une preview partielle peut donc builder correctement mais échouer au runtime.

À faire avant d'utiliser les previews Railway comme gate de validation :

1. Définir la matrice des services Railway à déployer pour chaque PR : API, IA, Redis et dépendances nécessaires.
2. Rendre les variables d'environnement preview dynamiques, en particulier les URLs inter-services et secrets internes.
3. Vérifier que les services preview utilisent des ressources isolées ou explicitement partagées sans risque de pollution prod/staging.
4. Ajouter un healthcheck preview qui vérifie l'API, l'IA, Redis et les callbacks API↔IA.
5. Documenter la stratégie de teardown des previews après merge/close de PR.

### Vercel previews PR

Les apps `@bellum/web` et `@bellum/website` sont publiées sur Vercel.

- Les previews de PR sont créées automatiquement par Vercel.
- Les déploiements production sont déclenchés au merge sur la branche configurée côté Vercel.
- Les previews et les redeploys ne sont consultables que par les membres de l'organisation Vercel BellumAI.
- Les variables `VITE_*` pour l'app produit et `NEXT_PUBLIC_*` pour le site doivent être maintenues dans Vercel par environnement.
- La CI GitHub ne remplace pas la preview Vercel : elle valide le repo, tandis que Vercel valide le build et le rendu déployé des deux frontends.

### Branch protection GitHub

Configurer les branches protégées (`development`, `staging`, `main`) avec :

- Require a pull request before merging.
- Require status checks to pass before merging.
- Status check requis : `CI Status`.
- Ne pas cibler individuellement `Lint`, `Format`, `Check types`, `Build`, `Test (API)` ou `Test (IA / Python)` dans la protection : `CI Status` agrège déjà tout.

### Dépannage rapide

| Symptôme                                | Cause probable                                  | Correction locale                              |
| --------------------------------------- | ----------------------------------------------- | ---------------------------------------------- |
| `pnpm install --frozen-lockfile` échoue | `package.json` modifié sans lockfile à jour     | `pnpm install`, commit `pnpm-lock.yaml`        |
| `format` échoue                         | fichier non formaté                             | `pnpm format`                                  |
| `lint:exports:types` échoue             | type exporté mais non consommé                  | supprimer l'export ou ajouter un vrai consumer |
| `check-types` échoue                    | erreur TypeScript                               | `pnpm check-types` local, corriger le fichier  |
| `build` échoue                          | import manquant, env typée absente, build cassé | `pnpm build` local                             |
| `test` échoue                           | régression API Jest                             | `pnpm turbo test --filter=@bellum/api`         |
| `test-ia` échoue                        | régression pytest ou dépendance Python          | `cd apps/ia && pytest -q`                      |
