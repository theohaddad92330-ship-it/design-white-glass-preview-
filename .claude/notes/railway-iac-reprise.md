# Reprise — Railway IaC et le coût des runners (04/09/2026)

## État

- **PR #1486 mergée** (`52c18a469`) — `.railway/railway.ts` porte tout le projet
  Railway. `railway config apply --yes` a été **lancé par Louis et a pris**.
- **PR #1487 ouverte**, CI en cours — retire quatre valeurs par DÉFAUT de Railway
  qui produisaient un diff impossible à fermer.
- `railway config plan` sort **« ✓ already up to date »**. C'est la seule preuve
  qu'un apply a pris.

## Décisions déjà tranchées — ne pas les reposer

- **On ne plafonne PAS la RAM par réplica de `ci-runner`.** Le plancher de
  2,3 GB/réplica EST le workspace chaud (`node_modules` 1,6 G + cache Turbo
  695 M — la somme tombe juste). Sous le pic mesuré de ~9 GB, un plafond = OOM
  en plein job, et un runner non-éphémère tué perd son cache ET son job.
- **On ne passe PAS les runners en `--ephemeral`.** Ça effacerait aussi le store
  pnpm et le cache Turbo : retour au téléchargement complet et au rebuild à
  chaque job, c'est-à-dire reprendre le runner GitHub hébergé en le payant.
- **8 réplicas est le plancher défendable** : pic CPU mesuré 9,02 vCPU sur la
  flotte. En dessous, les jobs font la file.
- **`sleepApplication: true` sur l'API est repris tel quel**, pas décidé — une
  migration de configuration ne change pas de comportement en passant.

## Chiffres mesurés (04/09/2026) — ne pas re-mesurer

| | valeur |
| --- | --- |
| part de `ci-runner` dans la mémoire du projet | **94,8 %** (423 054 GB-min vs 23 040 pour tout le reste) |
| plancher par réplica au repos | **2,3 GB**, décroissance ~2 %/h |
| pic par réplica sous job | ~9 GB (433 GB flotte) |
| effet 48 → 8 réplicas | 130 GB → 19,5 GB, **−85 %** |
| volume CI | 35-70 runs/j × 14 jobs |

## Ce qui reste ouvert

1. **Merger #1487** quand la CI est verte.
2. **Retirer les 4 `railway.json`** du dépôt — l'`apply` a vidé le champ
   Config-as-code, ils sont INERTES. Simple nettoyage, sans risque.
3. **Purger `_work` après chaque job** (`infra/ci-runner/entrypoint.sh`) — le
   dernier levier mémoire : 2,3 → ~0,9 GB/réplica, 18,4 → 7,2 GB continus.
   Garder `PNPM_HOME` et le cache Turbo : l'install redevient un re-lien depuis
   un store chaud, pas un téléchargement. ⚠️ **Mesurer d'abord** le vrai temps
   d'un `pnpm install` store-chaud sur ce dépôt — je ne l'ai pas fait.
4. **Trancher `sleepApplication` sur l'API de production.**
5. **Garde-fou `deploy.limitOverride.containers.memoryBytes` ~10 GB** sur
   `ci-runner` — n'économise rien, borne le pic à 433 GB.

## Pièges payés ici — ils se repaient sinon

- **`railway config pull` ne lit que les réglages d'INTERFACE.** Ni
  `watchPatterns`, ni healthchecks, ni les commandes build/start des services qui
  les tenaient d'un `railway.json`. Un pull brut + apply les EFFACE, et il aurait
  posé **6 réplicas** là où le manifeste en appliquait 2.
- **« omit means delete »** — le fichier décrit le projet ENTIER, Redis et son
  volume compris.
- **Le fichier généré ne s'évalue pas** : le `const` du dépôt prend le nom du
  dépôt et collide avec le service homonyme.
- **Un défaut Railway ne s'encode pas** (`ON_FAILURE`, `maxRetries: 10`) : il se
  relit `null` et le plan le redemande à l'infini.
- **`find`/`grep` sont pollués par ~40 worktrees d'agents** dans `.claude/` —
  passer par `git ls-files`.
- **Le check Railway d'une PR échoue TOUJOURS** (env de PR sans Redis) — merger
  sur `ci-status`.
- **`railway config apply` exige `--yes`** hors TTY.

## Le chantier /issues, laissé de côté

108 issues `beta-feedback` ouvertes. Rien de commencé — le tri du §1 n'a pas
été fait. Cadence tranchée le 03/09 : ~10 issues par PR, et on RECETTE avant
d'ouvrir la suivante.
