# Profil du dépôt — belllum-monorepo

> Ce fichier est la **seule** chose que ce dépôt écrit pour que les skills du
> marketplace `louis-skills` marchent ici. Les `SKILL.md` ne nomment aucun
> projet ; ils chargent ce fichier.
>
> Règle de remplissage : **rien d'aspirationnel**. Si une commande n'a jamais été
> lancée, elle n'entre pas ici. Une ligne fausse coûte plus qu'une ligne absente
> — on la croit.

Dernière vérification : `2026-09-06` · par : Claude, extrait de
les anciens skills locaux `chantier/issues/revue-pr/recette-palier` (retirés le
2026-09-06, désormais dans le marketplace `louis-skills` — plugins livraison/securite ;
leur original verbatim est archivé dans SKILLS_TEMPLATES/sources/) et vérifié contre `.github/workflows/ci.yml`.
⚠️ Les sections marquées `<à confirmer>` n'ont PAS été re-mesurées : les
confirmer avant de s'appuyer dessus.

---

## 1. Qui décide

| Rôle                | Qui                                                                                            | Ce qu'il tranche                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Arbitre produit** | Louis (louis@bellum-it.com)                                                                    | ce qui se livre, ce qui se refuse                                |
| **Demandeurs**      | le widget de signalement in-app (label `beta-feedback`) ; les paquets documentaires d'un tiers | catégories `feedback:bug` / `feedback:metier` / `feedback:autre` |
| **Escalade**        | Louis                                                                                          | un blocage, un accès, une décision irréversible                  |

Le label `beta-client` distingue un signalement CLIENT d'un signalement interne.
**Un retour client passe devant** : il décrit un usage réel et son auteur attend
une réponse.

⚠️ `feedback:autre` est le choix par défaut de qui n'a pas voulu trancher, et il
a déjà pesé 9 issues ouvertes sur 21. Il se re-catégorise à la lecture du corps.

### Lire le canal — le digest, jamais les corps bruts

```sh
python3 tools/issues/digest.py                      # toutes les issues ouvertes, groupées par écran
python3 tools/issues/digest.py --screen /accounts   # un écran ; --label beta-backoffice ; --json ; -o <fichier>
```

Un appel `gh`, et par issue : le message humain, le fichier:ligne pointé (ou
« non estampillé », qui est un constat), les requêtes en échec **hors bruit 401**
(identiques comptées ×N), le commit du build, la capture, la clé Linear, les
commentaires humains et « déjà du code ? ». Mesuré le 09/09/2026 : **83 issues,
529 588 → 107 804 caractères (×4,9)**, texte humain 11 % du corpus — avant, 75
`gh issue view` pour le même lot. Le markup, le fil d'actions et les logs restent
sur GitHub : ils servent au diagnostic d'UNE issue, pas au tri. Garde :
`tools/issues/test_digest.py` (elle lit le constructeur `feedback.service.ts`).

**Deux modes, dans cet ordre** (skill `issues` §1, `references/tri.md`) :

```sh
python3 tools/issues/digest.py --tri                        # mode TRI : une ligne par issue, tout le corpus — c'est sur lui qu'on trie
python3 tools/issues/digest.py --screen /chat -o <fichier>   # mode ÉCRAN : le digest complet d'un écran, lu par tranche au diagnostic
python3 tools/issues/digest.py --screen /accounts --max-message 40000 -o <fichier>   # mode ÉCRAN pour un DÉCOUPAGE : sans --max-message, chaque message humain est COUPÉ à 1 500 c
```

Mesuré le 14/09/2026 : **257 issues → 42 k caractères en mode tri** (contre
364 k en digest complet, illisible d'un coup). Le tri porte `points≈N`, `CLIENT`
(label `beta-client`), le fichier pointé et « déjà du code ? ». ⚠️ **Le digest
nomme son plafond** : quand il rend exactement `--limit` entrées (défaut 1000),
bannière en tête + `rc=3` — le 14/09, l'ancien défaut à 200 avait **caché 57
issues sur 257 en silence**. Avant de trier, le vrai compte :
`gh issue list --state open --limit 1000 --label beta-feedback --json number --jq length`.

## 2. La forme du dépôt

```
apps/       api (NestJS) · web (SPA) · ia (Python) · mcp · website · dashboard-manager
packages/   char consent contracts email errors events http observable shared tooling ui utils
agent_docs/ trackers de chantiers, registres, sources (gitignoré)
tools/avancement/   mesure.py → JSON → rendu.py → HTML
```

| Ce qu'on cherche                 | Où c'est                                                                                                                                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Les écrans / routes              | `apps/web/src/routes`, features dans `apps/web/src/features/`                                                                                                                                                        |
| Les services / la logique métier | `apps/api/src/modules/`                                                                                                                                                                                              |
| Les contrats partagés            | `packages/contracts/src/schemas/` (zod → JSON Schema → copie Python)                                                                                                                                                 |
| Les migrations                   | `apps/api/src/migrations/`                                                                                                                                                                                           |
| Les gardes d'architecture        | `apps/api/src/architecture/*.spec.ts` · `apps/web/src/architecture/*.test.ts`                                                                                                                                        |
| Les tests                        | ⚠️ **plusieurs racines** : `apps/api` (jest) · `apps/web` (vitest) · `apps/mcp` (vitest) · `packages/{shared,contracts}` (vitest) · `apps/website` (vitest) · `apps/ia/tests` (pytest) · `tools/avancement` (pytest) |
| Les chantiers passés             | `agent_docs/chantiers-livres.md` (registre des ~30 chantiers)                                                                                                                                                        |
| Le changelog                     | `packages/contracts/src/changelog/` — `entries.ts` (registre) + `labels.fr.ts` + `labels.en.ts`, parité stricte. Convention : `agent_docs/changelog-convention.md`                                                   |

## 3. Les canaux de doctrine — ce qui ne se re-litige pas

| Canal                         | Chemin                                                                           | Ce qu'il porte                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Règles transverses + Doctrine | `CLAUDE.md` § « Doctrine — les arbitrages qui ne se re-litiguent pas »           | les interdits transverses. ⚠️ plafonné à 150 k caractères, n'accueille plus les récits |
| Arbitrages tenus              | `packages/contracts/src/schemas/doctrine-registry.ts`                            |                                                                                        |
| Décisions numérotées          | `packages/contracts/src/schemas/decision-registry.ts`                            | ⚠️ **un numéro est unique DANS SON CHANTIER** : citer « D70 (tome 1) »                 |
| Refus assumés                 | `agent_docs/chantiers-livres.md` § « ce qu'on ne promet pas » de chaque chantier | avec leur raison                                                                       |
| Environnement / connecteurs   | `agent_docs/env-reference.md`                                                    |                                                                                        |
| Mémoire                       | `MEMORY.md` + fichiers de mémoire                                                |                                                                                        |

## 4. Les gates — les commandes exactes, dans l'ordre

⚠️ **Appeler les binaires par leur chemin.** Le hook RTK réécrit certaines
commandes et **coupe la sortie à ~2000 caractères** : un `jest` lancé par `pnpm`
peut rendre un résumé tronqué illisible. Pour la même raison, ne pas produire de
patch (`git diff > x.patch`) destiné à être réappliqué — copier les fichiers.

**La porte d'abord : `pnpm ci:local`** (`tools/ci/local.mjs`, 31/10/2026) — l'Étage 1 de
la CI sur le diff de la branche : CLAUDE.md ≤ 15 000, prettier des fichiers
modifiés, ESLint + check-types des paquets touchés, knip, `garde-derive-doc`, tests
web/API par le MÊME sélecteur que la CI (`test-changed.mjs ci`), contracts liés,
pytest IA des modules touchés + portes d'éval, pytest `tools/`, registres. Vert et
arbre propre ⇒ témoin `<git-dir>/ci-local-ok` = SHA ; le `pre-push` husky et le hook
`PreToolUse` de `.claude/settings.json` refusent un push sans lui. En fond, sortie
vers un fichier ; une seule porte à la fois sur la machine (verrou). Détail :
`docs/ci.md` « Porte locale ». Les commandes ci-dessous restent celles d'un test ciblé.

```sh
# Typecheck — par application touchée
node apps/web/node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json

# ⚠️ API touchée : le typecheck de ses TESTS est un script SÉPARÉ.
#    `check-types` pointe tsconfig.build.json, qui les EXCLUT.
pnpm --filter @bellum/api check-types:tests

# Tests ciblés — la forme qui FILTRE vraiment
pnpm --filter @bellum/web exec vitest run <chemins>
# ⚠️ `pnpm --filter @bellum/web test -- <chemin>` ne filtre RIEN : le `--` passe
#    le motif à vitest qui l'ignore. 399 fichiers collectés, 61 s au lieu de 3.
# ⚠️ jest DEPUIS LA RACINE tombe sur un preset babel qui ne comprend pas
#    `import { x, type Y }` : erreur de syntaxe sur TOUT fichier du module, y
#    compris ceux qui étaient verts. Deux formes marchent, mesurées le 07/09 :
node apps/api/node_modules/jest/bin/jest.js --config apps/api/jest.config.js <chemin>
cd apps/api && node node_modules/jest/bin/jest.js <chemin>

# Format
node node_modules/prettier/bin/prettier.cjs --list-different <fichiers touchés>

# Exports de types inutilisés — le hook pre-push le lance, il BLOQUE
# ⚠️ EN CASCADE : retirer les fuites qu'il nomme en révèle d'autres (4 puis 6 de
#    plus, mesuré le 07/09). Le relancer JUSQU'AU VERT, pas une fois.
pnpm lint:exports:types

# ESLint — un job de CI à part, que le pre-push ne lance PAS
pnpm --filter @bellum/web lint

# Portail golden set du service IA
pnpm eval:gate

# Registres touchés (.claude/notes/registre-*.md) — la garde du job CI
# « Test (artefact d'avancement) ». ⚠️ Une FUSION de registres la fait rougir
# sans qu'aucun écrivain ait touché la ligne : cellule d'état hybride
# (« livré (vague J, …) »), preuve `recetté` qui cite « non mesuré » sans SHA.
# Mesuré le 19/09/2026 : W (#2656) rouge sur 4 lignes, portes locales toutes vertes.
apps/ia/.venv/bin/python -m pytest tools/registres/test_coherence.py -q
```

⚠️ **`commitlint` garde le hook `commit-msg`**, et il est FERMÉ : le scope doit
appartenir à `[web, website, api, ia, mcp, dashboard-manager, ui, contracts,
tooling, errors, http, observable, infra, packages]` (`projet`, `docs`, `chore`
comme scope sont refusés), le sujet tient en **100 caractères**, et un commit de
fusion se termine par `git commit -F` avec un sujet conventionnel — jamais par le
message par défaut de `git merge`. Trois cycles perdus le 07/09.
⚠️ Un message de commit passe par un FICHIER (`git commit -F`) : sous zsh, les
backticks d'un `-m` déclenchent la substitution de commande.

Lancées par le hook `pre-push` : `pnpm ci:local` (sauté si le témoin porte déjà
HEAD), le refus des fichiers chauds sur `claude/lot*` (`tools/ci/hot-files.mjs`),
la garde ESM de `packages/contracts`. Lancées **uniquement** par la CI : les suites
complètes (web, API, IA), `e2e`, `test-site`, la démo sur vraie base.

⚠️ `lint` a attrapé le 02/09 un hook React posé APRÈS un retour conditionnel
(`react-hooks/rules-of-hooks`) que ni le typecheck ni 7 000 tests ne voyaient —
le composant rendait juste, seul l'ORDRE des hooks était fautif.

### Ce qui plafonne les workers ici — mesuré le 15/09/2026

Le **nombre de suites** simultanées est tenu par le sémaphore du plugin `garde`
(3 créneaux sur 12 cœurs, partagés avec dirigo et toute autre session de la
machine : socle §6, « le créneau, pas la discipline »). Ce tableau borne ce
qu'**une** suite prend. Les deux variables vivent dans le `"env"` de
`.claude/settings.local.json` — pas dans une commande, et c'est décisif ici :
**le hook RTK réécrit les commandes** (voir le haut de ce §4), donc un plafond
écrit dans la ligne de commande peut disparaître sans prévenir.

| Ce qui fane la machine                 | Ce qui le borne                                          | Valeur                     | Vérifié le 15/09/2026                                                                                   |
| -------------------------------------- | -------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------- |
| vitest **3.2.4**                       | `VITEST_MAX_THREADS` + `VITEST_MAX_FORKS` (env du dépôt) | 2                          | `node_modules/.pnpm/vitest@3.2.4*/…/dist/chunks/coverage.DL5VHqXY.js:3711`                              |
| **turbo 2.9.3** — le piège du monorepo | `TURBO_CONCURRENCY` (env du dépôt)                       | 2                          | `TURBO_CONCURRENCY=abc turbo test --dry` rend la MÊME erreur que `--concurrency=abc` — contrôle positif |
| jest 29 (`apps/api`)                   | `maxWorkers` dans `apps/api/jest.config.js`              | 2 en local, inchangé en CI | `jest --showConfig` → `"maxWorkers": 2` (c'était **11**, soit cœurs − 1)                                |
| playwright (`e2e/`)                    | `workers` dans `e2e/playwright.config.ts`                | 2 en local, inchangé en CI | défaut = un worker par demi-cœur, **6** ici                                                             |

⚠️ **jest n'a AUCUNE variable d'environnement pour ses workers** — son plafond ne
peut vivre que dans sa config. C'est pour ça qu'il est le seul du tableau à être
écrit dans le dépôt plutôt que dans l'env.

⚠️⚠️ **Un plafond posé dans l'environnement n'arrive PAS à travers turbo s'il n'est pas déclaré.** turbo 2 tourne en mode d'environnement strict : mesuré le 16/09/2026, `CI=1 JEST_MAX_WORKERS=1 pnpm turbo test --filter=@bellum/api -- --showConfig` rendait `"maxWorkers": 11`. Les trois plafonds de ce tableau sont donc déclarés en `globalPassThroughEnv` dans `turbo.json` — en PASSTHROUGH et pas en `env`, pour ne pas fendre le cache d'un runner à l'autre. En CI, personne ne les posait : le pas « Plafond de workers » de `ci.yml` les calcule depuis le cgroup du conteneur (`.github/scripts/plafond-workers.sh`), et un plafond déjà posé par le runner gagne. Garde : `apps/api/src/architecture/les-plafonds-de-workers-traversent-turbo.spec.ts`.

⚠️ **`turbo test` est UNE commande qui en lance N.** Plafonner vitest sans
plafonner turbo ne borne rien : 20 paquets × 2 workers, c'est toujours 40.

⚠️ **La variable de vitest n'est pas la même que chez dirigo.** Ici vitest 3.2.4
lit `VITEST_MAX_THREADS` ; dirigo, passé en vitest **4.1.8**, ne lit plus que
`VITEST_MAX_WORKERS`. Recopier le nom d'un dépôt à l'autre donne un plafond qui
ne plafonne rien — il se vérifie dans `node_modules`.

### Construire un worktree neuf — et ce qu'un agent qui écrit a le droit de lancer

```sh
scripts/worktree-ready.sh                    # dans le worktree d'un agent (isolation: "worktree")
scripts/worktree-ready.sh --new <nom> [base] # l'intégrateur crée .claude/worktrees/<nom> depuis origin/main, prêt
```

⚠️ **Ne plus écrire `pnpm install && pnpm exec turbo build` dans un prompt d'agent.**
Mesuré le 09/09/2026 : 12 worktrees d'agents dans la journée, chacun avec son
`turbo build` COMPLET — qui construit aussi les quatre apps (vite, nest, deux
next) dont aucun test n'a besoin — et un cache turbo à la racine de CHAQUE
worktree (`.turbo/cache`, gitignoré), donc toujours à froid. Résultat : load
average **38 sur 12 cœurs**, une suite ciblée passée de ~1 min à **1 h 11**,
trois agents sur cinq partis enquêter sur `Failed to resolve import @bellum/…`.
Le script fait `pnpm install --prefer-offline` (2 s sur un worktree déjà installé,
10 s à neuf) puis `turbo build` des
**seuls paquets** avec `--cache-dir` sur le cache du dépôt principal : **4 s à
froid, 1 s à chaud** (« 8 cached, 8 total »). Il imprime le préambule à coller
dans le prompt de l'agent.

**Les trois règles du préambule** (un agent qui les ignore sature la machine de
tous les autres — la suite d'un voisin rend alors des faux rouges, socle §6) :

1. **Tests ciblés par FICHIER, 2 workers** : `cd apps/web && node node_modules/vitest/vitest.mjs run src/<fichiers> --maxWorkers=2` (⚠️ 14/09 : lancé depuis la RACINE, jsdom casse — « document is not defined » sur des fichiers non touchés ; deux agents l'ont payé) ·
   `node apps/api/node_modules/jest/bin/jest.js --config apps/api/jest.config.js --maxWorkers=2 <chemin>`.
   Jamais une suite de dossier, jamais `turbo test`.
2. **Une suite à la fois par machine**, et **10 écrivains maximum** sur 12 cœurs
   (les éclaireurs en lecture seule ne comptent pas — ils n'ont ni worktree, ni
   paquets construits, ni suite). Relevé de 3 à 5 par Louis le 14/09/2026, puis
   **de 5 à 10 le 15/09/2026 au soir**, et la raison de ce second relèvement compte : le
   plafond de 5 protégeait d'un effondrement dont la cause N'ÉTAIT PAS le nombre
   d'agents. C'était le hook `pre-push`, qui lançait `prettier --check .` sur les
   **182 worktrees** que `.prettierignore` ne couvrait pas — load 179 sur 12 cœurs
   avec le CPU quasi IDLE, c'est-à-dire de l'attente disque, pas du calcul, et des
   `git push` pendus 18 minutes. La cause corrigée (commit `5ffe97b6e`), le
   plafond qui la compensait n'avait plus de raison d'être.
   ⚠️ **Le vrai frein n'est donc plus la machine, c'est le VERROU DE FICHIERS** :
   deux écrivains sur le même écran se marchent dessus quoi qu'il arrive. Dix
   écrivains ne valent dix que sur **dix écrans disjoints** — sinon le onzième lot
   attend, et il vaut mieux ne pas le lancer.
   ⚠️ **Le seuil ne prévient pas** : tant qu'il reste de la mémoire un agent de
   plus va deux fois plus vite, puis tout ralentit d'un ordre de grandeur en même
   temps. `uptime` > 12 pendant une suite = verdict sur la machine, pas sur le
   code : relancer seul. Et un `du -sh` sur `.claude/worktrees/` fait remonter le
   load à lui seul — ne jamais le lancer pour diagnostiquer.
   ⚠️ **Dix écrivains ne veulent pas dire dix suites.** Depuis le 15/09/2026 le
   sémaphore du plugin `garde` tient le compte des suites sur le DISQUE : trois au
   plus sur cette machine, **toutes sessions confondues**. Les dix écrivains
   écrivent en parallèle ; leurs suites, elles, font la queue — et attendre coûte
   des secondes là où le swap coûte un ordre de grandeur sur tout à la fois. C'est
   exactement ce qui manquait le jour où `issues` tournait ici ET sur dirigo :
   chaque session a lu la même mémoire libre au même instant, et les deux ont
   conclu qu'elles pouvaient y aller.
3. **`Failed to resolve import @bellum/…` → relancer `scripts/worktree-ready.sh`**,
   ne pas enquêter (`vitest.config`, `package.json` exports : trois agents y ont
   perdu un quart d'heure chacun le 09/09).
4. **Plafond de tours dans chaque brief** (socle §6) : **300 écrivain · 250
   intégrateur · 100 vérificateur** — « à 80 % du budget : commit de ce qui est
   vert, rapport, stop » ; la suite part dans un agent NEUF avec la reprise.
   ⚠️ **L'écrivain est passé de 150 à 250 puis à 300 le 15/09/2026** (Louis) : cinq lots sur
   douze sont revenus au plafond de 150 avec ~60 % du travail fait, chacun a
   demandé un agent de FINITION qui relit tout depuis zéro — ~40 % de retravail.
   Le plafond vit dans le FRONTMATTER de `~/.claude/agents/<type>.md` ; le brief
   ne l'augmente pas, et un agent coupé ne rend AUCUN rapport. Et
   **un lot d'écrivain = ≤ 40 points de registre**, jamais « dix issues ».
   Mesuré ici sur 3 jours (12-14/09/2026, 271 transcripts) : 58 231 tours,
   **15,5 milliards de tokens relus, 77 % dans les agents** ; 52 agents ≥ 300
   tours pesaient 54 % du total ; les quatorze plus longs (481 à 1 085 tours,
   414 à 785 k de contexte) étaient des écrivains et intégrateurs briefés « dix
   issues » sur un corpus où 130 issues sur 200 portent ≥ 20 demandes. Types :
   `ecrivain` · `integrateur` · `verificateur` · `Explore` (sans MCP) — jamais
   `general-purpose` pour écrire (103 lancements), jamais `fork` (18).
   Mesure : `python3 ~/Desktop/SKILLS_TEMPLATES/scripts/mesure-tokens.py ~/Desktop/belllum-monorepo 1`.

### Le venv Python

Aucun venv dans le dépôt, et le `python3` du système ne construit ni
`pydantic-core` ni `jiter`. Recette qui marche (3.13 = version de la CI) :

```sh
cd apps/ia
python3 -c "import pathlib; src=pathlib.Path('requirements.txt').read_text().splitlines(); \
  pathlib.Path('/tmp/req.txt').write_text('\n'.join(l for l in src if not l.strip().startswith('psycopg'))+'\n')"
/opt/homebrew/bin/python3.13 -m venv /tmp/venv13
/tmp/venv13/bin/pip install -q -r /tmp/req.txt
/tmp/venv13/bin/pip install -q "psycopg[binary]" pytest pytest-asyncio ruff
/tmp/venv13/bin/python -m pytest tests/ -q -p no:cacheprovider
```

Deux pièges : `psycopg[binary]==3.2.9` n'existe plus sur PyPI (retirer le pin), et
`tests/conftest.py` importe `app.main` — installer seulement `pytest` ne suffit pas.
⚠️ Poser `EMBEDDING_API_KEY` en local rend invisibles tous les documents déjà
ingérés sans vecteurs.

## 5. La CI

- **La porte locale EST l'Étage 1** (31/10/2026) : `pnpm ci:local` appelle les mêmes
  scripts que l'étage rapide (`test-changed.mjs ci`, `garde-derive-doc.mjs`, la règle
  prettier sur fichiers modifiés). Un rouge de l'étage rapide en CI qu'elle n'a pas vu
  = une règle à lui ajouter, pas un rerun. Elle borne ce que la CI ne borne pas : en
  `mode=complet` (fondation touchée) elle lance les tests LIÉS et le dit ; une suite
  IA entière (prompt, golden) reste à la CI, dite.
- Déclencheur : **`on: pull_request` UNIQUEMENT**, branches `[development,
staging, main]`. **Un merge direct sur `main` ne lance RIEN.** C'est ce qui a
  laissé le dépôt sans CI du 25 au 27/08 pendant qu'une dizaine de commits
  partaient en production. Ouvrir la PR **est** le geste qui allume le filet.
- `concurrency: cancel-in-progress` — ne pas spammer les push ni les re-runs.
- ⚠️⚠️ **Un job qui dure quatre fois la normale est un RUNNER malade, pas un
  shard lent — et il faut le voir SANS que Louis ait à regarder.** Mesuré le
  16/09/2026 sur `integration/vague-13-16-09` : un shard web sain fait **11 min**
  (quatre mesures d'affilée, sur trois runners différents) ; `Test (Web) (2)` en
  était à **45 min** sur `vps-fd892a059c55` — le runner qui, au run précédent,
  avait mis **41 et 40 min sur deux jobs, tous deux finis en ÉCHEC**. Cause :
  avec du swap, un conteneur sur-engagé ne meurt plus en OOM, il PATINE —
  `memory.peak` sature au plafond et ment, seul `memory.swap.peak` montre le
  besoin réel (~7,7 Go pour un shard vitest web). Le symptôme est un shard
  interminable, **jamais le même** : ce qui change est le runner qui l'a ramassé.
  ⚠️ Un job à **0-1 min** tape le cache turbo : ce vert-là ne prouve rien, ne
  pas le compter comme une passe.
  ⚠️ **Le seuil est RELATIF, et c'est le point** (affiné le 16/09/2026 au soir,
  sur un cas à **18 min** — 1,6× le sain — attrapé par Louis avant le veilleur).
  « 11 min » est un fait d'un jour, pas une constante : le corpus grossit, la
  flotte change. Le veilleur compare donc chaque job en cours à **SA PROPRE
  dernière durée VERTE sur la MÊME branche** et sonne à **1,5×** ; le plafond
  absolu (**16 min**) n'est qu'un filet quand il n'y a pas encore d'historique.
  **Pourquoi pas 12 min en absolu** : le sain MESURÉ est à 11 min, donc 12 laisse
  une minute de marge et fait annuler un shard sain un peu chargé (file
  d'attente, cache froid, tests ajoutés) — et un faux positif coûte un cycle
  complet ET jette les jobs déjà verts. 16 min ≈ 1,45× le sain.
  ⚠️ Un job à **0-1 min est un cache hit** : il ne doit JAMAIS servir de
  référence, sinon la référence s'effondre et tout devient « lent ».
  **Le geste** : le veilleur `attendre-ci.sh <pr> <min_checks> <seuil_min> <tours> <facteur>` sort
  en **2** dès qu'un job en cours dépasse son plafond, en nommant le job, sa
  durée, son plafond et le sain mesuré ; on annule le run et on relance les jobs échoués
  (`gh run cancel <run>` puis `gh run rerun <run> --failed`) — les checks déjà
  verts sont conservés et le job repart sur un autre runner. Ne JAMAIS toucher
  aux runners eux-mêmes ni à `CI_RUNS_ON` : chantier de Louis.
- ⚠️ **Deux runs concurrents ralentissent la flotte** : pousser sur une autre PR
  pendant qu'on attend un merge met deux runs en concurrence sur les mêmes
  machines. Si la PR en attente est celle qui débloque la production, annuler
  l'autre run et le relancer après le merge.
- **Sélective** depuis le 27/08 : le job `changes` (« Ce qui a changé ») calcule
  la portée. Un job `skipped` est **normal** ; ce qui compte est de vérifier
  QUELS jobs ont tourné. Les fondations relancent tout : `packages/contracts`,
  `packages/shared`, le lockfile, `turbo.json`, `.github/workflows/`. Diff
  illisible ⇒ toutes les suites tournent (c'est le repli, pas une panne).
- Les jobs : `Ce qui a changé` · `Lint` (ESLint + knip) · `Format` ·
  `Build` (+ `Check types` et les fichiers de test de l'API, fondus le 05/10) ·
  `Test (API) n/2` · `Test (Web) n/3` · `Test (contracts / cross-lang schemas)` ·
  `Test (site)` (+ parité des quatre langues) · `Test (IA / Python)` ·
  `Eval gate (golden set)` · `Test (back-office)` ·
  `Test (artefact d'avancement)` · la porte `CI Status`.
- **`Test (Web)` tourne en TROIS projets vitest depuis le 16/09/2026** —
  `node` (les gardes d'architecture, sans jsdom ni i18n), `jsdom` (tout ce qui
  rend) et `jsdom (gardes qui rendent)` pour les dix-sept gardes qui montent du
  JSX. Le découpage vit à un seul endroit, `apps/web/src/test/projects.ts`, et la
  garde **GA-286** lit le DISQUE pour vérifier que chaque fichier tombe dans un
  projet et un seul — un fichier oublié entre deux projets ne serait lancé par
  personne, et rien ne rougirait. Mesuré sur `src/architecture` : 59,93 s →
  35,58 s (−41 %). ⚠️ `pool: 'threads'` valait −17 % de plus et a été REFUSÉ —
  il rend `thread-groups.test.ts` dépendant de l'ordre d'exécution. ⚠️ L'hypothèse « alléger `setup.ts` » qui traînait dans `ci.yml` est
  **fausse et mesurée comme telle** ; les cinq relevés sont dans le fichier.
- **Le cache turbo de `Test (Web)` et `Test (API)` est sauvé MÊME sur échec**
  (`actions/cache/restore` + `actions/cache/save` en `if: always()`), et le délai
  du step vitest (30 min) est plus court que celui du job (40) : un job tué par
  son `timeout-minutes` n'exécute aucun step suivant, `if: always()` compris —
  le cache n'était donc pas sauvé, et le run d'après repartait froid pour mourir
  pareil. C'est ce cercle qui a produit les quatre rouges du 16/09 à 03 h.
  **Depuis le 14/09, TOUS les jobs de `ci.yml` sont dans `CI Status`** — il n'y a
  plus un seul job qui tourne hors de la porte.
- ⚠️ **`E2E (Playwright smoke)` a quitté `ci.yml`** le 14/09 pour
  `.github/workflows/e2e-nightly.yml`. Il y vivait avec `continue-on-error: true`
  ET hors des `needs` de `CI Status` : il ne pouvait faire échouer aucune fusion.
  Mesuré sur 45 exécutions : 42 verts, 1 annulé, **zéro rouge**, pour 1,8 min de
  temps de job par exécution et 108 s de médiane — à égalité avec `Build` pour le
  job le plus long. Il tourne désormais la nuit sur `main` (03:30 UTC) SANS
  `continue-on-error`, et sur toute PR qui touche `e2e/`. À promouvoir dans
  `CI Status` le jour où il aura attrapé un vrai défaut.
- La porte d'agrégation : **`CI Status`** (cible de la protection de branche).
  ⚠️ **Tout job absent de ses `needs` ne garde rien.** Arrivé deux fois :
  `Test (Web)` (313 fichiers sans effet pendant des semaines) et `Test (site)`
  (359 tests que **rien** ne lançait jusqu'au 27/08). En ajoutant un job,
  l'ajouter aux DEUX endroits.
- Où tournent les runners : variable de dépôt `vars.CI_RUNS_ON`
  (Settings › Actions › Variables). Absente ⇒ runners GitHub. Le repli est donc
  un **réglage**, jamais une PR : `gh variable set CI_RUNS_ON --body ubuntu-latest`
  ramène la CI sur GitHub en une commande, le jour où l'hôte tombe.
- **Les runners CI sont sur 4 VPS Hetzner, et RIEN d'autre** (Railway ne
  héberge plus que la prod : API, IA, Redis) — `infra/ci-runner-vps/`,
  procédure et parc complets dans son `runbook.md`. Le workflow
  Le workflow de mise à l'échelle Railway et son dimensionnement ont été retirés le
  05/10/2026.
  - **Parc réel (05/10/2026), 10 runners label `bellum-ci`** :
    3 × CX43 (8 vCPU, EPYC-Rome, 2 runners chacun : `bellum-ci-runner`
    Helsinki, `-2` et `-3` Nuremberg) + 1 × CX53 (`bellum-ci-runner-1`,
    Falkenstein, 16 vCPU Xeon Skylake, 4 runners). ⚠️ Le CX53 Intel est ~2× plus
    lent par runner : un shard `Test (Web)` y prend 35-43 min contre 18-23 min
    sur les CX43 (12 runs verts) et fixe le chemin critique. ⚠️ La troisième
    machine ne sert pas à accélérer UN chantier
    mais à en tenir DEUX : deux branches en CI font 30 jobs pour 6 runners, et
    l'un des runs n'en obtenait qu'un seul (mesuré le 16/09) — or c'est la
    situation normale, un lot d'issues tournant pendant qu'on intègre. Elles ne se parlent pas — un runner
    ne fait que SORTIR vers GitHub — donc la localisation n'a aucune importance,
    ce qui tombe bien : le CX43 était en rupture à Helsinki le jour de la
    seconde commande. Le prix de la séparation est de faire chaque geste deux
    fois (`scp`, `build`, enrôlement, recyclage nocturne).
  - **Pourquoi pas plus de runners sur la même machine** : `ci.yml` a 15 jobs,
    `ubuntu-latest` en lance 15 à la fois (30 vCPU à la demande), un CX43 en a 8.
    Le plancher est arithmétique — 76,7 min de job cumulées ÷ N runners — et six
    runners sur un seul hôte ont été mesurés à une charge de **32,58** sur
    8 cœurs : le job n'attend plus dans la file, il attend le CPU, et cette
    attente-là n'apparaît nulle part. C'est de la CAPACITÉ qui manque, pas de la
    configuration.
  - ⚠️ **Le nombre de runners DÉCOULE du plafond mémoire, jamais l'inverse** :
    `N × mem_limit ≤ RAM − réserve`, soit `3 × 4,5 Go ≤ 15,6 − 2`. Pris à
    l'envers, ça s'est trompé deux fois le 16/09 : `5 Go × 4` dépasse l'hôte
    (OOM **global**, un conteneur tue le job d'un autre), et `3 Go × 4` rentre
    dans l'hôte mais pas dans le plus gros job (`@bellum/api#build`, `exit 137`
    en `CONSTRAINT_MEMCG`). Le plancher se MESURE : un processus de build pique
    à 1,94 Go, `TURBO_CONCURRENCY=2` en fait tourner deux. Le pic réel se relit
    après coup dans `memory.peak` du cgroup, sans rien instrumenter.
  - ⚠️⚠️ **Un runner auto-hébergé n'est pas seul sur sa machine, et les outils ne
    le savent pas.** `nproc` / `os.cpus()` rendent les **8 cœurs de l'hôte** même
    dans un conteneur limité à 2 vCPU : jest en déduit 7 workers et les lance. Il
    faut donc DEUX plafonds — `cpus:` pour la contention (valable pour tout outil,
    présent et futur) ET un plafond par outil pour le nombre de PROCESSUS
    (`JEST_MAX_WORKERS`, `VITEST_MAX_FORKS`, `TURBO_CONCURRENCY`). Et
    l'invariant **N × `mem_limit` ≤ RAM − réserve**, sinon l'OOM frappe en GLOBAL
    et un conteneur tue le job d'un AUTRE. Les deux ont produit des `exit 137` le
    16/09. `dmesg | grep oom-kill` sépare `CONSTRAINT_NONE` de `CONSTRAINT_MEMCG`.
  - ⚠️ **Ne jamais changer l'échelle pendant un run** : `--scale` vers le bas
    DÉTRUIT les conteneurs surnuméraires, tue leurs jobs, et laisse une entrée
    « offline » par conteneur (six, le 16/09). Purge : `infra/ci-runner-vps/purge-ghost-runners.sh --apply`
    — un runner encore marqué `busy` résiste tant que son run n'est pas `completed`.
- Débit mesuré le 27/08/2026 : **4 runners** qui répondent, un job à **20 min**
  → dix PR ouvertes ont mis la session à l'arrêt. **Découpage retenu : PR
  d'intégration quand la CI est lente**, PR courtes quand elle est rapide.
  ⚠️ Re-mesurer avant chaque gros chantier (socle §7).
- **La CI est limitée par la FILE, pas par les tests** (mesuré le 05/10/2026 :
  run vert de 110 min = 384 min de file pour 157 min d'exécution, 14 jobs pour
  10 runners, ~80 % d'occupation). Donc : les branches de LOT restent en
  **brouillon** (0 runner) ; seule la PR d'intégration passe « prête ». Un lot ne
  passe « prête » que s'il est mergé seul. La porte avant push reste obligatoire.
- **Pas de poussée sur une PR prête dont la CI tourne**, sauf pour corriger un
  rouge déjà rendu ; on groupe les correctifs (12 runs sur 40 annulés après
  65-114 min).
- Routage des jobs lourds : `CI_RUNS_ON_WEB` (`["bellum-ci","rapide"]`) envoie `Test (Web)` ET `Test (API)` (depuis le 05/10 au soir) sur
  les 6 runners AMD (18-23 min par shard, contre 35-43 sur les 4 Intel). Vide ⇒
  flotte entière. Interrupteur `CI_COUPE_SUR_ROUGE=true` : le premier job rouge
  annule le run (un rouge par tour, mais la file se libère) ; vider la variable le
  désactive, et « Re-run failed jobs » relance les jobs ratés et annulés. Après la
  fusion de `Check types` dans `Build`, le check requis reste `CI Status` seul.
- Checks qui échouent **toujours** : le check **Railway d'une PR** (environnement
  de PR sans Redis). Merger sur les checks GitHub Actions, agrégés par `CI Status`.
- ⚠️ **Un merge tue la CI des autres PR en vol** : l'hébergeur des runners a le
  dépôt pour source, donc tout merge sur `main` le redéploie et redémarre les
  replicas. Signe : plusieurs jobs tombent ensemble à une durée **ronde**, run
  `cancelled` et non `failure`, `--log-failed` répond « log not found ». **Aucun
  test n'est rouge.** En solo, ne pas merger pendant qu'une autre CI tourne.

## 6. Le déploiement

**Il n'y a PAS de préproduction.** Le merge sur `main` déclenche Vercel (web) et
Railway (api / ia). **Il n'y a rien entre le merge et l'utilisateur** — la recette
live EST le filet.

| Service | Hébergeur | Délai observé | Déclencheur      |
| ------- | --------- | ------------- | ---------------- |
| web     | Vercel    | ~1 min        | merge sur `main` |
| api     | Railway   | plusieurs min | merge sur `main` |
| ia      | Railway   | plusieurs min | merge sur `main` |

⚠️ **Les trois ne déploient pas ensemble.** Entre les deux, l'application tourne
dans un état qui n'existe nulle part durablement — **un front neuf sur une API
ancienne**. Le 28/08/2026, trois versions coexistaient : web en vague 14, IA en
vague 14, API en vague 13. Ce que ça produit est pire qu'un écran cassé : **un
écran qui a l'air juste** (un front récent qui interroge une route absente
dégrade proprement et affiche « non mesuré » — indiscernable du cas où la
fonctionnalité marche sur un espace vide).

### Prouver que le commit servi est le mien

```sh
curl -s https://api.bellum-ai.com/version | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('api', (d.get('commit') or '?')[:9], '| ia', ((d.get('ia') or {}).get('commit') or '?')[:9])"
```

**Tant qu'un service CONCERNÉ diffère du commit MERGÉ, on n'ouvre pas Chrome.**

⚠️⚠️ **« Concerné » n'est pas « tous » — corrigé le 12/09/2026.** Railway ne
redéploie un service que si la PR touche ses `watchPatterns` :

```jsonc
// apps/api/railway.json
"watchPatterns": ["/apps/api/**", "/packages/**", "/pnpm-lock.yaml",
                  "/pnpm-workspace.yaml", "/package.json", "/turbo.json"]
// apps/ia/railway.json
"watchPatterns": ["/apps/ia/**", "/packages/contracts/**"]
```

Mesuré sur la PR #1963 (qui ne touchait que `apps/ia/**` et de la documentation) :
l'IA bascule en 45 s, **l'API ne bascule jamais** et sert toujours le commit du
dernier merge qui la concernait. La formulation « tous les commits servis sont
les miens » aurait fait conclure à un échec de déploiement sur un déploiement
réussi — et le symptôme est **indiscernable** de la vraie panne décrite juste
en dessous (`ia.commit` à jour pendant que `commit` traîne).

La bonne question n'est pas _« ce service sert-il le SHA du merge ? »_ mais
**« ce service avait-il quelque chose à déployer, et l'a-t-il fait ? »**. Croiser
le diff avec les `watchPatterns` AVANT d'attendre :

```sh
git diff --name-only origin/main~1 origin/main
python3 -c "import json;print(json.load(open('apps/api/railway.json'))['build']['watchPatterns'])"
```

⚠️ La réponse **imbrique** le commit du service IA dans celui de l'API : un `grep`
du SHA sur le corps entier matche le champ imbriqué et annonce « déployé » alors
que l'API est encore sur l'ancien code. **Parser le JSON.**
⚠️ Le SHA à attendre est celui du commit de **MERGE**, pas celui de la branche.
⚠️ `ia.commit` à jour pendant que `commit` reste en retard = symptôme d'un
**healthcheck qui refuse l'API** (repository injecté non déclaré, en tête de liste).
⚠️ **Si Louis dit que ce n'est pas déployé, c'est lui qui a raison** : il a la
console sous les yeux.

### Les logs Railway

Projet BellumAI `35efdac2-af65-42a5-88f8-35ed9c40a254`, environnement production
`474a205c-bb75-4484-81f6-85c936f4c7a1`. Quatre services : `belllum-monorepo`,
`belllum-backend-service` (api.bellum-ai.com), `bellum-ia-service`, Redis.

Explorateur au **niveau projet** — la page d'un déploiement coupe l'enquête à
l'heure du dernier redéploiement — piloté par l'URL :

```
https://railway.com/project/<projectId>/logs?environmentId=<envId>&filter=<requête>&timeFrame=3h
```

`filter` et `timeFrame` (`15m`/`1h`/`3h`/`1d`) passent par l'URL : le champ de
saisie ouvre une auto-complétion et n'applique pas toujours. Syntaxe : mots avec
ET implicite ; un `.` ou un `_` dans le terme ne matche rien.
⚠️ La sortie ne se lit pas au `javascript_tool` (les lignes contiennent des URL
avec query string → `[BLOCKED: Cookie/query string data]`). **Lire par capture.**

## 7. La recette live

- Application : `https://app.bellum-ai.com` · démonstration : `/demo`
- **Périmètre d'écriture autorisé** — autorisation permanente de Louis du
  25/08/2026 : **son espace est un espace de TEST**. Créer des comptes, projets,
  besoins, consultants, missions, shortlists, déplacer des cartes, franchir des
  portes. « Ça écrirait dans les données réelles » **n'est pas une raison de ne
  pas tester** — trois vérifications avaient été déclarées « non faites » pour
  cette raison, dont un panneau livré et jamais ouvert en vrai. **Un écran sans
  données ne se recette pas en le regardant vide : on lui en crée.**
  Nommer ce qu'on crée `RECETTE — <date>` et le dire dans le rapport final.
- **Ce que l'autorisation ne couvre PAS :**
  - **débrancher un connecteur** (Google, HubSpot…) — le rebrancher exige un
    consentement OAuth que seul Louis peut donner ; pour tester un chemin
    « capacité absente », se servir d'un connecteur DÉJÀ non branché (Slack) ;
  - **supprimer** ce qui ne se recrée pas — une mission emporte son historique
    de facturation ;
  - **tout ce qui part vers l'extérieur** : envoyer un e-mail, poser un
    rendez-vous, écrire dans un CRM, lancer une séquence. Brouillon oui, envoi non.
- **Envoyer des messages à Laura : AUTORISÉ** — autorisation permanente de Louis
  du **10/09/2026**, sur son espace, au même titre que l'écriture du 25/08.
  ⚠️ C'est un **revirement** : la version précédente de ce fichier l'interdisait.
  La raison de l'interdit était le coût — chaque message est un appel au modèle,
  facturé, et **plafonné à 50 par jour et par utilisateur**. Ce qui a fait pencher :
  **huit issues étaient non recettables** pour cette seule raison (#1768, #1770,
  #1820, #1822, #1823, #1787, #1793, #1819), dont deux corrigées et en production
  depuis le matin même, et qu'on re-diagnostiquait à chaque session.
  Les deux règles qui restent, elles : **annoncer le coût** (combien de messages
  dépensés, sur quoi), et **se souvenir que le plafond est PARTAGÉ** — une recette
  dense peut laisser Louis sans copilote pour la journée.
- **La largeur du balayage se DÉDUIT du diff, elle ne se choisit pas** (socle §4.2).
  Elle se calcule AVANT d'ouvrir Chrome, et par un script — « cette page n'a rien
  à voir » est un jugement, et c'est le jugement qui rate :

  ```sh
  python3 tools/recette/portee.py                 # origin/main~1..origin/main
  python3 tools/recette/portee.py --branche <nom> # une branche contre origin/main
  python3 tools/recette/portee.py <base>..<tete>  # --json pour enchaîner
  ```

  Il rend **FONDATION** (→ les 58 routes, sans discuter) ou **CIBLÉ** (→ les seuls
  écrans que le diff atteint, en remontant le graphe d'imports jusqu'aux fichiers
  de `apps/web/src/routes`, plus les écrans qui appellent un module d'API touché et
  ceux qui lisent un espace de noms i18n touché). Mesuré le 13/09/2026 : **58 routes
  → 1** sur le correctif de la liste des fils (6 fichiers), **58** sur le merge de
  #1984 (`packages/contracts/src/schemas/action-router.ts` modifié).

  Les chemins de fondation vivent dans `FONDATIONS` / `FONDATIONS_DE_FORME`
  (`tools/recette/portee.py`), chacun avec l'incident qui l'a payé. ⚠️ **Deux
  exclusions portent toute la règle**, et sans elles 75 fichiers sur 75 retombaient
  en balayage complet — une porte qui s'ouvre toujours n'est pas une porte :
  `packages/contracts/src/changelog/` (la DONNÉE d'un écran, pas un contrat de
  rendu — et il conflicte à chaque vague) et les fichiers de test (ils ne
  s'exécutent pas en production). ⚠️ Et un contrat n'est fondation que si le diff
  **RETIRE** des lignes : ajouter un champ ne peut pas rendre `undefined` un champ
  que quelqu'un lit déjà ; en modifier un, si.
  Garde : `tools/recette/test_portee.py` (18 tests, job CI `Test (artefact
d'avancement)`) — elle prouve les trois choses exigées d'une garde ici : qu'elle
  sait dire NON, qu'elle LIT quelque chose (routes + graphe non vides), et qu'elle
  n'attrape pas ce qu'elle ne vise pas.

- Entrées de navigation à balayer quand le régime est **FONDATION** — la liste vit
  dans le code, elle ne se recopie pas ici (elle dériverait) :

  ```sh
  grep -ohE "to: '/[a-z0-9/_-]+'" apps/web/src/components/navigation/sections.ts \
    apps/web/src/components/sidebar/items.settings.ts | cut -d"'" -f2 | sort -u
  ```

  Mesuré le 09/09/2026 : **58 routes** — les 10 sections de `NAV_SECTIONS`
  (`apps/web/src/components/navigation/sections.ts:90`) et leurs onglets, plus les
  réglages (`apps/web/src/components/sidebar/items.settings.ts:29-130`). Trois
  onglets dépendent de l'offre (`feature:`) : `/discover`, `/watchlist`,
  `/missions/nouvelle`. Le mobile n'en a que quatre (`features/mobile/mobile-nav.ts:27`).

- **Le balayage se fait par LOTS d'appels, jamais un appel par geste.** Mesuré le
  09/09/2026 : un tour de 26 min à « Calling claude-in-chrome 5 times ». Par
  écran, UN `browser_batch` : `navigate` → `computer` `wait` 2 s → `get_page_text`
  (ou `read_page` en `interactive`) → `read_console_messages` `onlyErrors` →
  `read_network_requests`. Quatre écrans par lot, donc ~15 allers-retours pour les
  58 routes. Vérifié le 09/09 sur le navigateur intégré (même outil `browser_batch`
  que l'extension) : cinq actions, un seul aller-retour.
  - **La capture d'écran est CIBLÉE** : les écrans touchés par le lot et les
    retours de mise en page — `computer` `screenshot` à `scale: 0.5`, puis `zoom`
    sur la zone. Jamais une capture par écran du balayage : c'est elle qui coûte.
  - **La mise en page se MESURE, elle ne se regarde pas** : `javascript_tool` sur
    `scrollHeight` contre `clientHeight`, `getComputedStyle`, le compte des
    `tbody tr` — trois défauts du lot 2 et quatre du lot 7 n'ont été vus que comme ça.
- **Pièges de recette :**
  - **Cache navigateur** : la SPA garde un cache IndexedDB `bellum-web-cache`.
    Un écran inchangé après déploiement peut venir du cache — vider avant de
    conclure au bug.
  - **Identité mélangée** : les cookies sont nommés par utilisateur mais ont été
    lus « le premier venu ». Ne pas tester la démo et un vrai compte dans la même
    fenêtre sans vérifier qui est connecté.
  - **Route ≠ capacité** : une route émise par l'API doit exister côté SPA
    (`/messagerie` contre `/mailbox` a donné un 404 en prod).
  - **Les salles de démo gardent l'ancien seed** : recycler **après** le
    déploiement, sinon le re-seed rejoue le jeu précédent.
  - **Ne pas déclencher de dialog JS** (`confirm`, `alert`) : ça gèle l'extension.

## 8. Les conventions d'implémentation

| Convention                                                                                                                                 | Garde qui la tient                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| i18n **FR + EN** obligatoires, aucune chaîne concaténée                                                                                    | job CI `Test (site)` « parité des quatre langues »                                                                                                                                                                                                      |
| Migration AVANT le code qui écrit une valeur contrainte                                                                                    | `apps/api/src/architecture/check-constraints-cover-enums.spec.ts` · `check-constraints-additive.spec.ts`                                                                                                                                                |
| Colonnes de migration déclarées                                                                                                            | `migration-columns-declared.spec.ts`                                                                                                                                                                                                                    |
| Repository injecté déclaré                                                                                                                 | `injected-repositories-declared.spec.ts`                                                                                                                                                                                                                |
| Chemin d'écriture branché                                                                                                                  | `apps/api/src/modules/wired-write-paths.spec.ts`                                                                                                                                                                                                        |
| Frontières de modules (pas d'import service→service)                                                                                       | `module-boundaries.spec.ts` (cliquet GA-07 au plafond)                                                                                                                                                                                                  |
| Priors internes (`prior ≠ evidence`)                                                                                                       | `dataforge-priors-stay-internal.spec.ts`                                                                                                                                                                                                                |
| Tables partagées déclarées                                                                                                                 | `shared-tables-declared.spec.ts`                                                                                                                                                                                                                        |
| Lecture SANS borne d'espace : jamais depuis une route (#2671)                                                                              | `lecture-non-cloisonnee-reste-interne.spec.ts` (GA-379) — porteurs déclarés, et `cancelByAdmin` seulement derrière `InternalSecretGuard`                                                                                                                |
| La borne d'espace va DANS la requête, jamais dans un `&&` qui s'effondre (#2671, pentest #2)                                               | `borne-espace-dans-la-requete.spec.ts` (GA-380) — refuse `workspaceId && row.workspace_id !== workspaceId` ; lit le code, pas la prose                                                                                                                  |
| Écritures aveugles                                                                                                                         | `no-blind-record-writes.spec.ts`                                                                                                                                                                                                                        |
| Cliquet `any`                                                                                                                              | `no-any-ratchet.spec.ts`                                                                                                                                                                                                                                |
| Parité démo                                                                                                                                | `demo-coverage.ts`                                                                                                                                                                                                                                      |
| Aucun nom d'éditeur hors Réglages › Intégrations                                                                                           | `no-vendor-names.test.ts`                                                                                                                                                                                                                               |
| Toute route atteignable                                                                                                                    | `apps/web/src/architecture/sections.test.ts` — refuse une route qui ne soit ni dans la nav, ni liée depuis un écran, ni dans `REACHED_OTHERWISE` **avec la porte par laquelle on y arrive**. « On y arrive par une URL » n'est pas une réponse acceptée |
| Parité des thèmes, échelle typo, grammaire du mouvement, lois de placement, tableaux responsives, noms accessibles, primitives d'affichage | `apps/web/src/architecture/*.test.ts`                                                                                                                                                                                                                   |
| Contrats partagés                                                                                                                          | zod (`packages/contracts`) → JSON Schema → copie Python (job `Test (contracts)`)                                                                                                                                                                        |
| Clé de cache **importée**, jamais recopiée                                                                                                 | `apps/web/src/lib/api/query-keys.ts`                                                                                                                                                                                                                    |
| `?? 0` seulement si zéro est VRAI                                                                                                          | cliquet dans `display-primitives.test.ts`                                                                                                                                                                                                               |
| Tutoiement                                                                                                                                 | garde i18n                                                                                                                                                                                                                                              |

Design : `--bellum-text-accent` pour tout texte accentué (aucune nuance fixe de
la gamme primaire ne passe AA des deux côtés) ; `*-soft-text` pour le texte sur
sémantique ; borne mobile **768 px** (`useIsMobile`) ; `dvh` jamais `vh` ;
`--bellum-mobile-nav-height` déclarée dans `tokens.css`.

### Deux consignes de méthode — à recopier dans le brief de chaque écrivain d'un chantier

Décision de Louis, 18/09/2026 (#2256.26 et #2256.27). Aucune garde ne peut les
mesurer, donc elles vivent ici et dans chaque brief, pas dans un test :

1. **Ne pas reconstruire une page déjà en cours de refonte.** Avant de toucher
   un écran, chercher s'il est dans le périmètre d'un lot en vol ou d'une branche
   non fusionnée (`git branch -r --contains`, registres du jour). Si oui, le
   point attend ce lot — il ne se recode pas en parallèle.
2. **Ne pas changer un comportement correct pour homogénéiser.** Deux écrans qui
   font la même chose différemment, et correctement, ne sont pas un défaut. Une
   harmonisation qui modifie un comportement juste est une régression qu'on a
   choisie ; elle se propose à Louis, elle ne s'écrit pas.

### Les familles de défauts déjà payées ici

> Le socle porte les familles génériques. Celles-ci sont propres au dépôt.

- **Du code juste que personne n'appelle** — le défaut n°1, **sept occurrences
  documentées**. Chercher l'APPELANT, pas la fonction. → `wired-write-paths.spec.ts`
- **`UPDATE … RETURNING` mal lu** : TypeORM rend `[lignes, nombre]` sur
  `UPDATE`/`DELETE` et `lignes` ailleurs — `rows[0]` donne le **tableau**,
  « truthy », dont chaque champ vaut `undefined`. **Onze endpoints** dans ce cas
  pendant des mois. → `apps/api/src/database/returned-rows.ts`
- **TypeORM ignore une condition `undefined`** : `findOne({ where: { id: undefined } })`
  rend la **première ligne**. Refuser un identifiant absent AVANT la lecture.
- **Lire et écrire dans deux tables différentes** : le formulaire remplit
  `consultants.stack`, l'écran lit `consultant_skills`.
- **Le seed n'a pas la forme que l'écran lit** : 479 tests verts, écran vide en démo.
- **Une garde borgne** : un `CHECK` lu seulement sous `ADD CONSTRAINT` (27 sur 83).
- **Un fan-out fournisseur non toléré** : `Promise.all` vers Gmail →
  « Too many concurrent requests », qui tue l'appel **entier**.
- **Le premier cookie gagne** : démo et vrai compte mélangés.
- **Collisions d'horodatages de migration** entre agents parallèles — **quatre en
  une vague le 30/08**. À égalité de préfixe TypeORM ordonne selon la lecture du
  répertoire : une table peut se créer après la migration censée la remplir.
  Réserver une plage par agent au dispatch, et après chaque fusion :
  `ls apps/api/src/migrations/ | grep -oE "^[0-9]+" | sort | uniq -d`
  (doublon préexistant connu : `1783000000000`).

### Les refus permanents du produit

- le scraping ; la lecture du corps des messages ; l'écriture ERP sans
  approbation ; la fusion de doublons CRM (**proposés, jamais fusionnés**) ; un
  client écrit sur un contrat d'API deviné ; un score présenté comme une
  probabilité ; **aucune facture légale n'est émise** ; un nom de fournisseur de
  données exposé au client ; un champ protégé (âge, genre, origine, photo, nom,
  adresse) lu par un moteur de sélection.
- Liste complète : `CLAUDE.md` § Doctrine et `agent_docs/chantiers-livres.md`.

## 9. Le tracker et la trace

- Trackers de chantier : `agent_docs/<slug>-<AAAA-MM-JJ>.md`
- Journaux de lot : `.claude/notes/lot-<n>-prompt.md`,
  `.claude/notes/issues-no-stop-<date>.md`
- **Registre des points d'un lot d'issues** : `.claude/notes/registre-<AAAA-MM-JJ>-<écran>.md`
  — **un fichier par écran** (par sujet si tout vise le même écran), une ligne par
  demande `#<issue>.<n>` (demande · sujet · état · preuve en recette), ouverte au
  découpage et comptée à la clôture (skill `issues` §3 bis, `references/lots.md` §5).
  L'état d'un point change par l'édition de SA ligne, jamais par la réécriture du
  fichier ; on ne relit jamais un registre en entier. ⚠️ Mesuré sur 3 jours : le
  registre unique du 12/09 (1 242 lignes, 1 166 points) a été réécrit en entier
  par `Write` **186 fois** et relu en entier 47 fois — ~50 k caractères à chaque
  passage. Le compte se FAIT : `cat .claude/notes/registre-<date>-*.md | grep -c '^| [0-9]'`,
  jamais une relecture (1 058 demandes pour 62 issues ne se vérifient pas à l'œil).
  Le registre du 12/09 reste tel quel (un lot en cours ne se redécoupe pas) ; le
  prochain lot ouvre les siens par écran.
- **La réconciliation d'un registre** (skill `issues` §3 ter) : chaque registre porte sa
  base en tête — `base : <sha> — <date>` — et se réconcilie **avant tout dispatch**, après
  chaque vague d'intégration mergée, et à la reprise d'un registre écrit un autre jour.
  ⚠️ Mesuré ici le 15/09/2026 au soir : **dix-neuf balayages, plus de 330 points** passés de
  `retenu` à `déjà là`/`livré` — de **14 %** (4 sur 29) à **95 %** (93 sur 98) des `retenu`
  d'un registre ; 44 sur 53, 41 sur 74, 32 sur 109, 24 sur 145 ; et le registre onboarding
  était mesuré sur une base vieille de **398 commits**. Le balayage est un `git grep` sur
  `origin/main` ET sur les branches encore ouvertes (agent `sonnet`, plafond 100 tours,
  écriture limitée au registre) : preuve `fichier:ligne` prise **à l'appelant** et non au
  titre d'un commit, recherche par **clé i18n** plutôt que par le libellé littéral du point,
  branche nommée dans la ligne quand le code n'est pas sur `main`, et ce qui exige une mesure
  en production (mise en page) reste `retenu`. 🔴 **Jamais d'`écarté`** : écarter est un
  arbitrage produit, il remonte en QCM.
- **Tableau de suivi (artefact)** : régénéré au tri, à chaque dispatch, à chaque recette et en
  fin de lot, **jamais écrit à la main**. Son URL ne s'archive PAS ici (l'historique de douze URL
  mortes a été retiré le 31/10/2026) : `Artifact` `action: "list"` dit laquelle est vivante ; une
  session qui reprend la page d'une session précédente en publie une NEUVE (la republication est
  refusée), la même session republie ensuite sur son URL autant qu'elle veut.
  ```sh
  python3 tools/issues/digest.py --tri -o <scratch>/<branche>-tri.md
  python3 ~/Desktop/SKILLS_TEMPLATES/scripts/suivi-issues.py --projet bellum \
    --tri <scratch>/<branche>-tri.md --registres '.claude/notes/registre-*.md' \
    --reprise '.claude/notes/reprise-*.md' --ouvertes <compte gh> --prod <sha servi> \
    --sortie <scratch>/<branche>-suivi.html
  ```
  puis l'outil `Artifact` (avec l'`url` vivante de la session, sinon une page neuve). Mesuré le 14/09 : 73 k caractères pour 257 issues,
  1 166 points, la reprise du soir en sections repliées.
- **Issue déjà satisfaite sur `main` → PAS de PR** (31/10/2026) : ni PR « preuve », ni
  « constat d'antériorité », ni PR « déjà là ». Un commentaire sur l'issue avec la preuve
  `fichier:ligne` (prise à l'APPELANT) et un run vert, puis fermeture ou label `a-recetter`.
  Une PR qui ne change pas le produit occupe la CI pour rien.
- Sources binaires (⚠️ **gitignoré**) : `agent_docs/sources/`
- Tableau d'avancement : `tools/avancement/mesure.py | tools/avancement/rendu.py`,
  chemins par `AVANCEMENT_SOURCE` / `AVANCEMENT_PASSEB` / `AVANCEMENT_TRACKER`.
  ⚠️ Générer depuis le dépôt **principal** : depuis un worktree,
  `agent_docs/sources/` (gitignoré) n'existe pas et la page sort à zéro.
- Changelog : FR + EN, `packages/contracts/src/changelog/` — `entries.ts` porte
  `{ id, itemCount }` **newest-first**, `labels.fr.ts` et `labels.en.ts` portent
  `entries.<id>.{date,title,item1…itemN}` à parité stricte, `itemCount` = le nombre
  exact d'`itemN`. Convention complète : `agent_docs/changelog-convention.md`.
  ⚠️ **Il conflictait à CHAQUE vague parallèle** : un lot l'écrit désormais par fragment
  `changes/<lot>.yml` (le `pre-push` refuse le fichier sur `claude/lot*`).

| Ce qui a bougé                              | Le fichier                                           |
| ------------------------------------------- | ---------------------------------------------------- |
| une capacité livrée / un refus assumé       | `agent_docs/chantiers-livres.md` (+ son tracker)     |
| une variable d'environnement, un connecteur | `agent_docs/env-reference.md` (jamais `CLAUDE.md`)   |
| un interdit transverse                      | § Doctrine de `CLAUDE.md`, une ligne, avec sa raison |
| une cause racine                            | mémoire (+ ligne dans `MEMORY.md`)                   |

⚠️ `CLAUDE.md` est plafonné à **15 000 octets** (job `Format`) et n'accueille plus les récits.
⚠️ Sur une branche `claude/lot*`, le changelog, `demo-coverage.ts`, `agent_docs/demo-mode.md` et
`agent_docs/chantiers-livres.md` s'écrivent par fragment `changes/<lot>.yml`, appliqué par
l'intégrateur (`python3 tools/issues/fusion_fragments.py`, format dans `changes/README.md`).

## 10. Les arrêts obligatoires

| Ce que la demande touche                               | Pourquoi on s'arrête                                                              |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Authentification, session, droits d'un rôle            | ferme l'application à tout le monde, ou l'ouvre à qui ne devrait pas              |
| Filtrage `workspace_id` / cloisonnement                | montre les données d'un client à un autre                                         |
| Facturation, abonnements, tarifs                       | conséquences côté argent                                                          |
| Suppression de données en masse                        | irréversible — script de reprise **en simulation**, compte affiché avant d'écrire |
| Migration qui rétrécit une contrainte ou supprime      | une migration appliquée en production ne se défait pas                            |
| Envoi sortant réel (e-mail, séquence, écriture tierce) | sort du produit                                                                   |

Base de données : **ajout seulement**. Supprimer une colonne, une table, renommer
un champ existant : on s'arrête. Une valeur d'énumération devenue inutile se
marque abandonnée, elle ne se retire pas. Un champ nouveau a une valeur par
défaut ou accepte le vide.

## 11. Les pièges d'outillage de ce poste

> Ceux qui rendent un résultat **faux et plausible**, pas ceux qui font échouer
> une commande. Mesurés les 27–30/08/2026.

- **`rg` sous le proxy local rend « 0 matches » à tort.** Un agent a lancé quatre
  recherches vides et a failli conclure « je code de zéro » ; `grep` trouvait
  **13 occurrences** et le lot était déjà livré à 80 %. → recouper avec `grep -rn`.
- **`pnpm lint` rend « 386 errors » sans jamais dire lesquelles** ; `npx jest`
  rend `[RTK:PASSTHROUGH] jest parser: All parsing tiers failed`.
  → rediriger dans un fichier, dé-coloriser, `tail -40` ; ou `eslint -f json -o`.
- **`pnpm --filter @bellum/web test -- <chemin>` ne filtre RIEN.** Trois agents le
  même jour. → `pnpm --filter @bellum/web exec vitest run <chemins>`.
- **Le hook RTK coupe la sortie à ~2000 caractères** et réécrit certaines
  commandes ; `ls` peut rendre du vide dans le bac à sable.
  → `/usr/bin/find` pour vérifier un téléchargement.
- **`npx tsc --noEmit` a rendu « TypeScript: No errors found »** alors que le log
  brut disait « This is not the tsc command you are looking for » — **aucun
  typecheck n'avait tourné**. → appeler le binaire par son chemin.
- **Un `grep` sur un chemin INEXISTANT rend « 0 matches » avec `exit 0`.**
  → `test -e <chemin>` avant de fonder un `ABSENT`.
- **Un motif d'exclusion non quoté sous zsh fait planter `grep` en silence** :
  `--exclude=*.tsbuildinfo` a produit **21 faux zéros d'affilée**.
- **Sans `--exclude-dir=.claude` ni `--exclude-dir=.venv`**, les comptes sont
  gonflés par des copies complètes du dépôt.
- **`git log` peut rendre le commit PRÉCÉDENT**, `--no-pager` compris, pendant que
  `git rev-parse HEAD` rend le bon. → `git rev-parse --short HEAD` et
  `git cat-file -p HEAD | head -8`.
- **`git commit -m` avec des backticks sous zsh exécute la substitution.** Un
  `&&` a « réussi » en apparence (`2 files changed`) pendant que la commande
  suivante mourait, laissant les fichiers **stagés et non commités**. Deux commits
  perdus. → message dans un fichier, `git commit -F`.
- **Le dépôt s'auto-commit / push / ouvre des PR par ailleurs.** Une PR de cinq
  commits n'en portait que deux ; les trois autres avaient été déplacés vers
  `sauvegarde/commits-paralleles-<date>` et `main` local. `git push` a réussi — il
  pousse ce que la branche pointe. → `git branch --show-current` avant chaque
  commit d'une série, `git diff --name-only origin/main...<branche>` après le push.
- **`npx prettier --write` dans un worktree ne fait rien et annonce un succès.**
  → formater dans le dépôt principal, puis recopier le fichier.
- **Un heredoc `<<PY` NON QUOTÉ fait substituer les backticks par zsh.** Un script
  Python contenant du markdown (donc des backticks) a explosé en
  « command not found: null » avant d'écrire quoi que ce soit — même famille que
  `git commit -m`. → toujours `<<'PY'`, et passer les chemins par l'environnement
  plutôt que par interpolation shell.
- **`gh pr merge --merge` rend une sortie qui ressemble à un `git checkout`**
  (liste de `create mode …`), pas à une confirmation de fusion. → prouver par le
  CONTENU sur `origin/main` : `git show origin/main:<fichier> | grep -c <motif>`.
- **`git status --porcelain` a rendu la chaîne `ok`** au lieu d'une liste vide, et
  `ls -la` a rendu 0 octet sur un fichier existant. → `/usr/bin/git`, `/bin/ls`.
- ⚠️ **`MEMORY.md` a une limite de CHARGEMENT d'environ 24 400 caractères**, et il
  l'a dépassée trois fois (29/08, 07/09, 08/09 à 24 598 o). Au-delà, tout ce qui
  suit est ignoré **en silence**. → faire de la place en DÉPLAÇANT une section
  vers un sous-index (`chantiers-clos-index.md`, `outillage-qui-ment-index.md`),
  jamais en supprimant ni en rendant les libellés muets.

### Relevés du 14/09/2026 — trois faux zéros NOUVEAUX, et deux pièges d'agent

Tous rendus `rc=0`. Les deux premiers ont été payés **deux fois dans la même
session** (l'orchestrateur, puis un éclaireur) : c'est ce qui en fait des règles.

- ⚠️⚠️ **`grep` et `ls` sont ALIASÉS sur `rtk`** dans le shell de ce poste. Un
  `grep -rn … | head` a rendu **l'aide de `rtk`** avec `rc=0` ; un
  `ls -lt .claude/notes/` a rendu une **sortie vide avec `rc=0`** sur un
  répertoire de **100 entrées**. Les deux ressemblent à une réponse, pas à une
  panne. → **`/usr/bin/grep`, `/bin/ls`, `/usr/bin/find`**, toujours.
- ⚠️ **`--include=*.tsx` NON QUOTÉ sous zsh** → `(eval):1: no matches found:
--include=*.tsx`, **`rc=0`**, zéro résultat. Même famille que
  `--exclude=*.tsbuildinfo` (21 faux zéros d'affilée). → **`--include='*.tsx'`**.
- ⚠️ **`apps/ia/.venv/` pollue massivement toute recherche** : langchain y embarque
  `create_draft_message.py`, donc un `grep` sur `draft_message`, `checklist` ou
  voisins rend des dizaines de faux positifs. → **`--exclude-dir=.venv` est
  obligatoire**, pas optionnel, au même titre que `--exclude-dir=.claude`.
- ⚠️⚠️ **`gh pr merge` sur une PR en DRAFT échoue, et `rc=$?` derrière un `tail`
  rend 0.** Mesuré sur #2140 : la sortie réelle était `GraphQL: Pull Request is
still a draft (mergePullRequest)` et le merge n'avait **pas eu lieu**, pendant
  que le code de sortie disait le contraire (c'est celui du `tail`, pas du `gh`).
  Même famille que « `gh pr merge --merge` rend une sortie qui ressemble à un
  `git checkout` ». → `gh pr view <n> --json isDraft` avant, `gh pr ready` si
  besoin, et **prouver le merge par le CONTENU sur `origin/main`**
  (`git log --oneline origin/main -1`), jamais par la sortie de `gh`.
- ⚠️ **Un agent `Explore` n'a AUCUN outil d'écriture.** Deux éclaireurs à qui on
  avait demandé d'écrire leur cadrage dans `.claude/notes/` ont rendu le plan
  complet **dans le fil** — travail juste, livrable au mauvais endroit, et c'est
  l'orchestrateur qui a dû l'écrire. → soit accepter le rapport dans le fil et
  l'écrire soi-même, soit confier l'écriture à un agent qui en a le droit.

---

## 12. Sécurité — la surface, la pile, le périmètre de test

Mesuré le `2026-09-06` depuis l'arbre (comptes relevés sur `apps/api/src` et
`packages`, dossiers de sources uniquement).

### La surface, par couche présente

- [x] **Frontend** — Next.js (`apps/web`, `apps/website`, `apps/dashboard-manager`) + `packages/ui` · CSP : `<à confirmer>`
- [x] **Backend** — NestJS (`apps/api`) · ORM : **TypeORM** · validation :
      **Zod** (782 occurrences) + `class-validator` (1)
- [x] **Auth / sessions** — `@nestjs/jwt` (18) + `passport` (36) + `bcrypt` ·
      révocation / `tokenVersion` : `<à confirmer>`
- [x] **API / webhooks** — **57 fichiers** mentionnent un webhook ·
      **Stripe** présent (254 occurrences) → ⚠️ vérifier le **parser brut** et la
      **vérification de signature** (`pentest/references/api-webhooks.md`)
- [x] **Données** — Postgres via TypeORM · **Redis** (`apps/api/src/config/redis-connection.ts`,
      adaptateur Socket.IO) · secrets : `<à confirmer>`
- [x] **DevOps** — pnpm + Turbo · CI sur `pull_request` · runners commutables par
      `vars.CI_RUNS_ON` · `docker-compose.yml` (redis)
- [x] **Infra** — `<hébergeur à confirmer>` · runners auto-hébergés
- [x] **IA / LLM** — `apps/ia` (Python) : OpenAI **et** Anthropic présents ·
      garde d'éval en CI (`eval:gate`) → `pentest/references/ia-llm.md`
- [x] **MCP** — `apps/mcp` : `@modelcontextprotocol` (10) — **serveur exposé** →
      `pentest/references/mcp.md` (tool poisoning, confused deputy, passthrough)

### Le périmètre de test autorisé (recoupe §7)

- Cible : ce dépôt + ses environnements. Autorisée : c'est le SaaS de Louis.
- **Hors périmètre** : Stripe et tout connecteur tiers — on teste NOTRE usage,
  jamais leurs serveurs.
- Cible vivante ? `<oui/non — à confirmer>` → si oui, règles de non-destruction
  (`pentest/references/methode.md` §0) et périmètre d'écriture du §7.

### L'outillage de sécu déjà en place

- Secrets : `<gitleaks ? à confirmer>` · SAST : `<à confirmer>` ·
  SCA : `<à confirmer>` · DAST : `<à confirmer>`
- Câblés en CI comme **bloquants** : `<à relever dans ci.yml>` ·
  **informatifs** : `<idem>`

### Les findings de sécu déjà connus / acceptés

**Pentest du 2026-09-12 (PR #1900)** — 14 findings prouvés, corrigés, chacun avec sa garde :

| #   | Sév   | Fix (fichier)                                                                                  | Garde                                                |
| --- | ----- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | HAUTE | rate-limit clé sur JWT vérifié, plus sur nom de cookie (`common/user-throttler.guard.ts`)      | `user-throttler.guard.spec.ts`                       |
| 2   | HAUTE | IDOR CV Studio → prédicat partagé `consultants/consultant-scope.ts`                            | `cv-studio.scope.spec.ts`                            |
| 3   | MOY   | `/ia/discover` `@Throttle` + garde qui dérive les routes                                       | `ia-proxy/llm-routes-bounded.spec.ts`                |
| 4   | MOY   | 2FA verrou compte + anti-rejeu (`auth/mfa.service.ts`, migration `1792700137492`)              | `mfa.service.spec.ts`                                |
| 5   | MOY   | guard d'auth sur 5 routes CRM/Gmail + cliquet `@CurrentUser`⇒guard                             | `architecture/current-user-needs-auth-guard.spec.ts` |
| 6   | MOY   | révocation de session par requête (`auth/jwt.strategy.ts`, logout révoque l'appareil)          | `jwt.strategy.spec.ts`                               |
| 7   | MOY   | RGPD `activities.body` : effacement compte + rétention 3 ans (`privacy/*`)                     | `privacy-deletion/retention specs`                   |
| 8   | MOY   | throttle DCR `default`→`default-1m` (`oauth/oauth.controller.ts`)                              | `oauth-throttle.spec.ts`                             |
| 9   | BAS   | dashboard-manager en-têtes sécu + open-redirect (`login/suite.ts`)                             | `login/page.test.ts`                                 |
| 10  | BAS   | CSP fronts (**apps/web en Report-Only — à passer enforcé**)                                    | —                                                    |
| 11  | BAS   | hygiène logs (code OAuth + fragment clé service-role retirés)                                  | `http-logging`/`supabase` specs                      |
| 12  | BAS   | mcp-scope fail-closed (`mcp-api/mcp-scope.guard.ts`)                                           | `mcp-scope.guard.spec.ts`                            |
| 13  | BAS   | planchers env MCP (`apps/mcp/src/config/env.ts`, contracts `env.ts`)                           | `env.test.ts` ×2                                     |
| 14  | BAS   | idempotence Stripe posée après succès + `grantTopup` idempotent (`credits/credits.service.ts`) | `credits.service.spec.ts`                            |

**REJETÉ après vérif** : CSRF (SameSite=None mais non exploitable — json-only + CORS preflight strict).
**Restes notés (non bloquants)** : backup codes 2FA (feature UI) · révocation du jeton d'incarnation à l'arrêt (30 min lecture seule) · CSP apps/web à passer enforcé après surveillance.

Point de départ le moins cher pour la prochaine passe : les douze familles de `pentest/references/methode.md` (annexe), puis re-vérifier que les 14 gardes ci-dessus tiennent toujours.

---

## 13. Performance — budgets, chemins chauds, volumes, ce qui a déjà saturé

Mesuré le `2026-09-06` depuis l'arbre et l'API GitHub.

### Ce que la mesure du dépôt a trouvé

| Signal            | Compte      | Ce que ça veut dire                                                                       |
| ----------------- | ----------- | ----------------------------------------------------------------------------------------- |
| Imports TypeORM   | **1 415**   | l'accès aux données est partout — mais ⚠️ **zéro relation déclarée**, voir sous la table  |
| `select:`         | 176         | des projections existent                                                                  |
| `take:` / `skip:` | 119 / 6     | ⚠️ **119 limites pour 6 décalages** : les listes sont bornées mais peu paginées           |
| `.count(`         | 84          | à recouper avec les paginations (`perf/volume-donnees.md` §1)                             |
| `include:`        | 7           | ⚠️ **faux signal** : c'est Swagger (`include: [PublicApiModule]`), pas de l'eager-loading |
| `revalidate`      | 317         | le cache de rendu est massivement utilisé                                                 |
| Client Redis      | 25 fichiers | **cache applicatif partagé présent** + adaptateur Socket.IO                               |

⚠️⚠️ **CORRIGÉ le 2026-09-12 — les deux lignes ci-dessus disaient une chose fausse,
et elles ont orienté le travail de perf au mauvais endroit pendant six jours.**

La version du 06/09 concluait « le N+1 par relation paresseuse est le risque n°1 ».
**Il n'y a AUCUNE relation TypeORM dans ce dépôt** : `ManyToOne`, `OneToMany`,
`ManyToMany` et `OneToOne` ne retournent rien sur les 39 fichiers de
`apps/api/src/database/entities/`. Le mécanisme « champ accédé → requête cachée »
ne peut donc pas se produire par ce canal. Et le `include: 7` qui étayait la
conclusion est `SwaggerModule.createDocument(app, …, { include: [PublicApiModule] })`
(`apps/api/src/main.ts:148`) — **`include` est un mot-clé Prisma, pas TypeORM**,
qui écrirait `relations:`. Un compte juste, sur un idiome absent, lu comme une cause.

**Le vrai risque N+1 ici est la requête DANS UNE BOUCLE**, en code applicatif.
Un seul cas franc trouvé au balayage du 12/09 : `contacts.service.ts:2120-2132`
(`sendEmailBulk` — un `findOne` par identifiant, borné à 50 par `BULK_SEND_MAX`).

Le détecteur reste le même, seule la cible change : **compter les requêtes** d'un
rendu avec 3 éléments puis 30 (`perf/references/base-de-donnees.md` §1). Et la
leçon générale vaut plus que le cas : **un inventaire de mots-clés ne prouve pas
l'idiome qu'il croit compter** — le mot cherché doit d'abord exister dans la pile.

### Les chemins chauds · volumes · dimensionnement

**Mesuré le 2026-09-12 sur la PRODUCTION** (espace de Louis, 25 comptes, 40 runs,
API `64c9e0b9f` / IA `844300d2e`), en lecture seule depuis une session navigateur
authentifiée. ⚠️ Un seul espace : ces percentiles sont ceux de CE portefeuille,
pas ceux du produit. Un p95 sur sept points est un maximum, pas un percentile.

| Chemin chaud                                                                    | Mesure                                                                        | Budget      | Verdict                                              |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------- | ---------------------------------------------------- |
| Run d'analyse, bout en bout (`created_at`→`completed_at`, terminés < 1 h, n=34) | p50 **438 s** · p75 535 s · p95 1 209 s · max 2 050 s                         | p50 ≤ 300 s | dépassé globalement                                  |
| — les mêmes, par mois                                                           | 07/2026 : 519 s (n=14) · 08 : 481 s (n=17) · **09 : 235 s (n=7)**             | p50 ≤ 300 s | **tenu sur le code de septembre**                    |
| Coût déclaré par run (`analysis_runs.cost_eur`)                                 | p50 **1,19 $** · p95 2,52 $ · max 3,00 $                                      | à figer     | ⚠️ **incomplet** — cf. le défaut du total ci-dessous |
| Page compte, navigation dure                                                    | DCL 217 ms · 14 requêtes API en 3 vagues · dernière donnée utile **2 812 ms** | —           | sain                                                 |
| `GET /contacts/account/:id` (THALES)                                            | **2 027 contacts × 59 champs = 4 132 Ko** décompressés, aucune pagination     | —           | sur-cueillette                                       |
| Un tour de Laura (4 tours reels, 12/09)                                         | 5,0 s · 8,5 s · 8,7 s · 9,2 s — AUCUNE diffusion                              | —           | le probleme n'est pas la duree, c'est le silence     |
| Sources externes par run (n=32)                                                 | 15 observées (p50) · dégradées p50 **0**, p95 **5**, max **7**                | —           | à surveiller                                         |

⚠️⚠️ **Ce que la mesure de Laura RÉFUTE** (12/09/2026, 4 tours réels sur la
production) : la durée d'un tour **ne croît PAS** avec l'historique. Le corps
envoyé passe de 89 à 1 956 octets (×22) et le tour reste à ~8,5 s. Le « contexte
qui gonfle » n'est donc pas le goulot de la LATENCE — c'était l'hypothèse n°1 de
l'audit, elle est fausse (elle reste vraie pour le COÛT, qui est un autre sujet).

Et **« Bonjour Laura » coûte 8,7 s** : autant qu'une vraie question, alors qu'il
n'y a rien à chercher ni à raisonner. Le coût est donc **structurel** —
construction du contexte serveur à chaque tour, reclassement RAG, appel modèle.
Le plafond dur de 105 s n'est jamais approché : **le problème n'est pas la durée,
c'est le SILENCE**. 8,7 s sans un seul octet renvoyé est très au-delà du seuil où
l'on part voir ailleurs.

Les plus dégradées : `recherche_entreprises` **10 runs sur 32**, `brave:quota_exceeded` 4,
`tech_detect` 4, `rag_documents` 4.

⚠️ **Cinq runs de juillet affichent des durées en HEURES** (jusqu'à 70 237 s).
Population distincte, aucune après le 24/07 — soit un `completed_at` écrit au
nettoyage, soit des runs repris. À trancher avant de citer un p95 global.

```sh
psql "$DATABASE_URL" -c "SELECT relname, n_live_tup, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 20;"
```

### La mesure — ce qui est disponible

**Inventorié le 2026-09-12. L'instrumentation est RICHE ; c'est l'ACCÈS qui manque.**

| Instrument                           | Ce qu'il rend                                                                                                    | Atteignable ?                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `GET internal/telemetry` (API)       | p50/p95 **par phase**, tokens, tokens de cache, dépense par fournisseur (`analysis-telemetry.service.ts:64-120`) | secret interne — proxifié par le back-office                                     |
| `GET internal/analytics/costs` (API) | `provider_costs` agrégé par fournisseur **et par `feature`** (`analysis` / `enrichment` / `chat`)                | secret interne                                                                   |
| `GET /metrics/cost` (IA)             | coût par PROMPT depuis le démarrage du process, pour tout le hors-analyse                                        | ⚠️ **aucun appelant dans le dépôt** — un commentaire le cite, personne ne le lit |
| Table `provider_costs`               | une ligne par (fournisseur, opération, phase), durable                                                           | via les deux routes ci-dessus                                                    |
| `run_metrics` (IA, en process)       | `calls` / `errors` / `duration_ms` / **`wait_ms`** par fournisseur                                               | logs Railway seulement                                                           |
| Langfuse                             | traces par appel                                                                                                 | paire de clés = l'interrupteur                                                   |

⚠️ **`duration_ms` et `wait_ms` ont des remèdes OPPOSÉS** et `run_metrics` les garde
séparés à dessein : un fournisseur lent demande moins d'appels, une longue attente
sur NOTRE limiteur demande plus de concurrence. Les confondre fait diagnostiquer un
problème de throttle comme une API lente.

⚠️ **`GET /backoffice/address` rend 403 sur le compte de Louis** (rôle `backoffice`
absent) : toute cette comptabilité est fermée en pratique. Accorder le rôle l'ouvre
sans jamais manipuler de secret.

⚠️ Pas de `Timing-Allow-Origin` sur l'API : `transferSize` rend 0 côté navigateur,
le poids COMPRESSÉ d'une réponse n'est pas mesurable depuis une session. Ne pas
l'inventer.

- **Socket.IO + Redis** : ~8-10 émissions par run (phases, pas micro-étapes),
  très en dessous de 1 Hz — la saturation se lira sur les connexions simultanées,
  pas sur la fréquence d'émission.

### Les caches en place

| Étage                          | Ce qui est caché | Invalidé par    | Clé porte le locataire / l'utilisateur ? |
| ------------------------------ | ---------------- | --------------- | ---------------------------------------- |
| Rendu Next (`revalidate`, 317) | `<à qualifier>`  | durée           | ⚠️ `<à vérifier>`                        |
| Redis applicatif (25 fichiers) | `<à qualifier>`  | `<à qualifier>` | ⚠️ `<à vérifier>`                        |

⚠️ Une clé de cache qui oublie l'identité est une fuite, pas une lenteur
(`perf/references/cache.md` §4).

### La chaîne — mesurée le 2026-09-06 (20 dernières exécutions)

| Workflow | Médiane        | Verdicts            |
| -------- | -------------- | ------------------- |
| **CI**   | **3 min 56 s** | **20/20 succès** ✅ |

| Upstream contracts | 26 s | succès |
| Uptime | 14 s | succès |

⚠️ **35,3 % du temps de job partait dans un cache qui n'achetait rien** — mesuré le
14/09/2026 sur 168 jobs / 12 exécutions. `actions/setup-node` avec `cache: pnpm`
restaure (15 s de médiane dans CHAQUE job) **et sauvegarde** dans son pas `Post`
(p50 0 s, p75 46 s) : treize jobs écrivant la même clé se marchaient dessus, pour
3,26 min de temps de job par exécution. Ce que ça achetait :
`pnpm install --frozen-lockfile` à **2 s de médiane**, parce que le store est déjà
sur le disque du runner. Depuis, `.github/actions/store-pnpm` restaure partout et
**un seul job écrit** (`format` dans `ci.yml`, le seul sans garde de portée ; plus
`e2e-nightly` sur `main`, seul endroit qui puisse alimenter un cache visible par
toutes les branches — un cache GitHub est cloisonné par référence). Garde
`cache-pnpm-un-seul-ecrivain.spec.ts`.

⚠️ **Le temps n'était pas le sujet ; le COÛT l'était.** Re-mesuré le 14/09/2026 :
la chaîne est rapide (3 min 56 s) et pourtant `ci-runner` pesait **25,9 Go de
moyenne 24 h/24, ~286 $/mois, 89 % de la facture Railway du projet** — le produit
entier (API, IA, MCP, Redis) en pesait 13,5. Taux d'occupation de la flotte :
**5,2 %** (417 exécutions en 14 j × 20,0 min de job = 596 min/jour pour 11 520 min
payées). **Railway facture la mémoire au TEMPS, pas au job** : raccourcir un job
ne baisse pas cette facture. Cause mesurée à 0 % de CPU : conteneur frais
0,46 Go, conteneur ayant servi une fois **3,74 Go**, décroissance ~1 Go/h, une CI
toutes les 45 min — ça ne redescend jamais. Correctif : la flotte suit la demande
(§5), et se recycle à 03:10 UTC.

✅ **C'est la chaîne de référence de la machine** : portée sélective au
merge-base avec repli « on fait plus », shards avec clé de cache **par shard**,
porte d'agrégation `CI Status`, commutateur `vars.CI_RUNS_ON`, concurrence avec
annulation hors branche par défaut. Les autres dépôts s'en inspirent.

⚠️ Le seul point à re-vérifier périodiquement : **la liste `needs:` de
`ci-status` et la liste évaluée dans son script doivent rester identiques** — un
écart a déjà coûté 312 fichiers de test sans effet
(`ci/references/portes-agregation.md` §3 ; le job de contrôle est dans
`ci/references/patrons.md` §2).

### Ce qui a déjà saturé ici

- **Le seau Claude partagé, sur la phase `plan`.** Mesuré en production sur 30
  jours et écrit dans le code (`apps/ia/app/graph/builder.py:102`) : **10
  `PHASE_TIMEOUT`, dont 8 sur `phase=plan`**. Le compartiment `claude`
  (`rate_limiter.py:83`, 50 rpm / concurrence 12) est PARTAGÉ par toutes les
  analyses simultanées via Redis — la concurrence de 12 du plan ne sert à rien
  quand le seau est déjà vidé par un autre run. Le jumeau `claude_chat` a été
  séparé le 16/08 pour cette raison exacte ; le correctif n'a pas été généralisé.
  ⚠️ Pour un run SEUL, ce goulot n'existe pas (12 appels ≤ concurrence 12 ≤ 50 rpm) :
  deux régimes de charge, deux verdicts — ne pas les mélanger.
- **Le pool Supavisor (mode transaction, port 6543), 04/10/2026 — deux fois.**
  Matin : re-semis démo balayé par les 2 réplicas (purges 65-184 s). Soir :
  `DB_POOL_MAX` 5 → 15 × 2 réplicas = 30 clients + migration + IA au-delà du
  `pool_size` Supavisor → ECHECKOUTTIMEOUT, toute l'API en 500, migrations des
  déploiements en échec. **Règle : `DB_POOL_MAX × réplicas ≤ 70 % du pool_size
Supavisor`** (garde au boot : `DB_POOLER_POOL_SIZE` + `DB_REPLICAS`, clamp +
  ERREUR). Migrations, verrous consultatifs et purge démo passent hors pooler
  (`POSTGRES_DIRECT_PORT=5432`). Relevé : `GET /internal/admin/supervision/postgres-activite`.

### Les cliquets posés

| Garde                             | Ce qu'elle compte / mesure            | Bloquante ?            |
| --------------------------------- | ------------------------------------- | ---------------------- |
| `eval:gate` (jeu de référence IA) | non-régression du modèle              | oui (dans `ci-status`) |
| `<compte de requêtes>`            | **absent** — le plus rentable à poser | —                      |

### Le périmètre autorisé pour mesurer

- Essai de charge : `<préproduction — à confirmer>`
- `EXPLAIN ANALYZE` sur écriture : en transaction annulée uniquement
- Ne jamais mesurer en écriture : facturation Stripe, données client réelles
