# Runners CI sur VPS Hetzner — la procédure, de la commande au premier vert

Ce dossier héberge la flotte de runners GitHub Actions (label `bellum-ci`) sur
des VPS Hetzner à **prix fixe**. Depuis le 05/10/2026 c'est le **seul** parc
auto-hébergé : la flotte Railway est retirée (Railway héberge toujours la prod,
pas la CI). `vars.CI_RUNS_ON` reste l'interrupteur : `bellum-ci` ou
`ubuntu-latest` en repli.

## Pourquoi un forfait fixe

Un runner chaud garde sa mémoire résiduelle ; sur un forfait fixe ce défaut ne
coûte plus rien, et le runner peut rester chaud, ce qui est précisément ce qui
le rend rapide. Les runners GitHub-hosted, eux, sont facturés à la minute
au-delà des 3 000 incluses (2 586 min consommées en ~18 h, le 16/09/2026).

## Ce que fait l'image

`Dockerfile` et `entrypoint.sh` sont dans ce dossier (`build.context: .`).
L'entrypoint enrôle le conteneur comme runner : soit `RUNNER_TOKEN` (jeton
d'1 h, aucun secret durable sur l'hôte), soit `GITHUB_PAT` ; un runner déjà
enrôlé (`.runner` + `.credentials`) reprend sans jeton. Le nom est
`vps-<hostname>`, stable tant que le conteneur n'est pas recréé. Le runner n'est
PAS `--ephemeral` (cache pnpm/turbo conservé) : acceptable parce que le dépôt est
privé et sans forks externes.

## 1. Commander la machine

Hetzner Cloud › Add Server :

| Réglage      | Valeur                                               | Pourquoi                                                                                      |
| ------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Localisation | Helsinki (ou Falkenstein / Nuremberg)                | Indifférent — le trafic est sortant vers GitHub                                               |
| Image        | **Ubuntu 24.04 LTS**                                 | 26.04 est trop récent pour le dépôt Docker, qui n'a pas de release pour son codename          |
| Type         | **CX43** (x86, 8 vCPU, 16 Go, 160 Go SSD, 20 To)     | Le dimensionnement est argumenté dans `docker-compose.yml`                                    |
| IPv4         | oui (+0,50 €)                                        | GitHub est joignable en IPv6, mais pas tous les registres d'images                            |
| Clé SSH      | la tienne, ajoutée dans l'interface                  | ⚠️ Hetzner l'injecte sur `root` SEULEMENT — voir l'avertissement ci-dessous                   |
| Cloud config | le contenu de [`cloud-init.yaml`](./cloud-init.yaml) | ⚠️ **y coller ta clé publique dans `ssh_authorized_keys` du compte `ci`**, sinon plus d'accès |

> ⚠️⚠️ **L'ARM a été visé, puis abandonné — relevé dans la console le 16/09/2026.**
> La gamme `CAX` (Ampere) est **en rupture aux trois localisations européennes** :
> Falkenstein, Nuremberg et Helsinki rendent toutes « Not available. Please choose
> another location or type. », ce que la carte annonce par « Cost-Optimized ·
> Limited availability ». Et son prix affiché n'était pas celui qu'on lit en
> ligne : **CAX31 à 20,99 €**, pas 15,99 €.
>
> Le **CX43 x86** porte exactement les mêmes 8 vCPU / 16 Go / 160 Go pour
> **15,99 €**, il est disponible, et il fait disparaître les deux inconnues du
> plan ARM (voir « Ce qui reste ouvert » plus bas). Prix relevés à l'écran, pas
> repris d'un comparateur.
>
> ⚠️ **Ne pas prendre CPX ni CCX.** La hausse du 15/06/2026 a porté ces gammes à
> +113 à +175 % (CPX41 à 143,98 €, CCX23 à 85,99 €).
>
> ⚠️ **La clé SSH doit être posée à DEUX endroits** : celle choisie dans
> l'interface Hetzner va sur `root`, or le cloud-init pose `PermitRootLogin no`.
> Sans clé sur le compte `ci`, la machine est facturée et inaccessible autrement
> que par la console web.

> **Créé le 16/09/2026** : `bellum-ci-runner`, CX43, Helsinki, Ubuntu 24.04,
> IP `2.29.35.39`, clé SSH `louis-macbook`. Les commandes ci-dessous utilisent
> cette machine ; l'étape 1 se refait **à l'identique** pour chaque machine
> ajoutée — il y en a quatre au 05/10/2026 (tableau au §3 bis).

## 2. Poser le dépôt et le secret

⚠️ **Le dépôt est PRIVÉ : `git clone` depuis le VPS échoue** tant qu'aucun
credential n'y est posé — et il n'y en a aucun à poser, puisque c'est justement
ce qu'on veut éviter sur une machine qui exécute du code. Le dossier
arrive donc par `scp` depuis ton poste (puis, aux mises à jour, `git pull` si
un credential de lecture y a été posé, sinon un nouveau `scp`). Le runner, lui, clone le dépôt avec le
jeton que GitHub lui donne pour chaque job : il n'a pas besoin de celui-là.

```sh
# depuis le dépôt, sur ton poste
scp -r infra/ci-runner-vps ci@2.29.35.39:/home/ci/belllum-monorepo/infra/

# puis, sur le VPS
ssh ci@2.29.35.39
cd ~/belllum-monorepo/infra/ci-runner-vps
printf 'GITHUB_REPO=Bellum-AI/belllum-monorepo\nRUNNER_LABELS=bellum-ci\n' > .env
chmod 600 .env
```

**Ce fichier ne contient AUCUN secret, et c'est délibéré.** Le montage supportait
à l'origine un `GITHUB_PAT` de longue durée ; sur une machine dont le métier est
d'exécuter du code de CI, c'est précisément le secret qu'on préfère ne pas y
laisser. Le mode retenu ici passe un **jeton d'enrôlement** valable une heure,
en mémoire, au seul démarrage — `config.sh` s'en sert une fois, écrit `.runner`
et `.credentials`, et `run.sh` vit sur ceux-là.

⚠️ Le prix, écrit aussi dans `entrypoint.sh` : à l'arrêt, un runner ne peut pas
se désenregistrer (son jeton a expiré) et laisse une entrée « offline ».
[`purge-ghost-runners.sh`](purge-ghost-runners.sh) est là pour ça.

> ⚠️ **Les hôtes n'ont PAS de copie git** (vérifié le 05/10/2026 : `~/belllum-monorepo`
> y est une copie posée par `scp`). Depuis la PR « retirer la flotte Railway »,
> `Dockerfile` et `entrypoint.sh` vivent dans `infra/ci-runner-vps/` et le contexte
> de build est `.`. L'ancienne copie (`../ci-runner`) reste complète et marche :
> rien à faire tant qu'on ne reconstruit pas. Pour reconstruire : `scp` du dossier
> `infra/ci-runner-vps/` ENTIER, puis `docker compose build` sur l'hôte.

## 3. Démarrer

> Après un changement du contexte de build : `scp` du dossier `infra/ci-runner-vps/`
> puis `docker compose build` sur chaque hôte avant tout `up` (pas de `git` sur les hôtes).

```sh
docker compose build          # ~10 min à froid : l'image Playwright pèse lourd

# Le jeton est obtenu au moment de s'en servir et n'atteint jamais le disque.
RUNNER_TOKEN="$(gh api -X POST \
  repos/Bellum-AI/belllum-monorepo/actions/runners/registration-token --jq .token)" \
  docker compose up -d --scale runner=2   # 4 sur le CX53

docker compose logs -f        # attendre « enregistré (labels: bellum-ci) » × N
```

Un `docker compose restart` (le recyclage nocturne) **ne redemande aucun jeton** :
l'entrypoint voit `.runner` et `.credentials`, et repart directement. Seul un
`--force-recreate` en exige un nouveau.

Vérifier côté GitHub que les runners répondent (2 par CX43, 4 sur le CX53 : dix au total) :

```sh
gh api repos/Bellum-AI/belllum-monorepo/actions/runners \
  -q '.runners[] | [.name, .status, .busy, (.labels|map(.name)|join(","))] | @tsv'
```

## 3 bis. La flotte tient sur DEUX machines, et c'est de l'arithmétique

`ci.yml` a **15 jobs**. `ubuntu-latest` en lance quinze à la fois — 30 vCPU à la
demande. Un CX43 en a **8**. Le plancher se calcule et aucun réglage n'y échappe :

```
76,7 min de job cumulées ÷ 3 runners ≈ 25 min de verdict
                          (contre 6,2 min de p50 mesurés sur ubuntu-latest)
```

⚠️ **Le réflexe d'ajouter des runners sur la même machine est le mauvais.** Six
sur un CX43 ont été mesurés à une charge de **32,58** sur 8 cœurs : le job
n'attend plus dans la file, il attend le CPU. L'attente a changé de nom, pas de
durée — et sous cette forme elle n'apparaît ni dans le temps de file, ni dans un
échec, ni nulle part. C'est de la **capacité** qui manque, pas de la configuration.

D'où quatre hôtes, **10 runners** (état réel au 05/10/2026) :

| nom                  | type | CPU                | localisation | IP              | runners                                                                            |
| -------------------- | ---- | ------------------ | ------------ | --------------- | ---------------------------------------------------------------------------------- |
| `bellum-ci-runner`   | CX43 | AMD EPYC-Rome      | Helsinki     | 2.29.35.39      | 2 : `vps-255ad2ca13ac`, `vps-a53cee7020bb`                                         |
| `bellum-ci-runner-2` | CX43 | AMD EPYC-Rome      | Nuremberg    | 2.28.226.72     | 2 : `vps-e820d794dc84`, `vps-fd892a059c55`                                         |
| `bellum-ci-runner-3` | CX43 | AMD EPYC-Rome      | Nuremberg    | 116.203.154.136 | 2 : `vps-828860d45f6d`, `vps-f9eff833e1f1`                                         |
| `bellum-ci-runner-1` | CX53 | Intel Xeon Skylake | Falkenstein  | 116.202.21.185  | 4 : `vps-1fe563cc0cd1`, `vps-309ae00daf4d`, `vps-7edc01969caa`, `vps-c3364dfdb628` |

Chaque conteneur : `cpus: 3`, `mem_limit: 6800m`.

### Le CX53 Intel est ~2× plus lent par runner, et fixe le chemin critique

Mesuré le 05/10/2026 sur 12 runs verts : un shard `Test (Web)` prend **35-43 min**
(médiane) sur les 4 runners du CX53 (créé le 28/09, 16 vCPU / 32 Go, Xeon
Skylake) contre **18-23 min** sur les 6 runners des CX43 (EPYC-Rome). Un shard
tombé sur le CX53 est donc le plus lent, et c'est lui qui décide du verdict. Run
`37273704602` : 384 min de file de jobs pour 157 min d'exécution.

Conséquences : ne pas compter un runner CX53 comme un runner CX43 ; pour
raccourcir la CI, privilégier des CX43 (AMD) supplémentaires, ou retirer des
runners du CX53, plutôt que d'en ajouter dessus.

⚠️ **Le troisième hôte ne sert pas à accélérer UN chantier, mais à en tenir
DEUX.** Mesuré le 16/09/2026 : deux branches en CI simultanément
(`perf/ci-threads-cache-runner` et `integration-vague12bis`) font **30 jobs pour
6 runners**, et l'un des deux runs n'en obtenait qu'**un seul**. Six suffisent à
un chantier, pas à deux — or c'est la situation normale ici, un lot d'issues
tournant pendant qu'on intègre.

Les deux machines **ne se parlent pas** : un runner ne fait que SORTIR vers
GitHub (long-polling), GitHub ne le contacte jamais. La localisation n'a donc
aucune importance fonctionnelle, ce qui tombe bien : le CX43 était **en rupture
à Helsinki** le jour où la seconde a été commandée, et disponible à Nuremberg.
Le seul prix de la séparation est qu'il faut faire les gestes **deux fois** —
`scp` du compose, `docker compose build`, enrôlement, recyclage nocturne.

⚠️ Une machine neuve prend l'image **Ubuntu 24.04**, pas la plus récente que
propose le formulaire : le dépôt Docker officiel n'a pas forcément le nom de
code d'une version toute fraîche, et `apt-get update` échouerait dans le
cloud-init, sur une machine déjà facturée, avec un message qui parle de
signature et pas de version.

## 4. Basculer, et savoir revenir

```sh
gh variable set CI_RUNS_ON --body bellum-ci      # bascule
gh variable set CI_RUNS_ON --body ubuntu-latest  # repli, sans toucher un fichier
```

Le repli est un **réglage**, pas une pull request : le jour où le VPS tombe, la
CI ne doit pas attendre une PR pour redevenir verte.

### Routage par suite : `CI_RUNS_ON_API` (31/10/2026)

Mesuré sur 7 jours : les shards `Test (API)` ont un p50 de **16,5 min sur les CX43**
contre **9,8 min sur les autres runners** ; `Test (Web)` est à égalité. `Test (API)`
lit donc `vars.CI_RUNS_ON_API`, de la même forme JSON que `CI_RUNS_ON_WEB`
(`["bellum-ci","<label>"]`), puis retombe sur `CI_RUNS_ON_WEB`, `CI_RUNS_ON`.

**À faire par Louis (rien n'est posé par le dépôt)** : donner un label de classe aux
runners qui ne sont PAS des CX43 (par exemple `api-rapide`, via `config.sh --labels` ou
l'interface des runners), puis `gh variable set CI_RUNS_ON_API --body '["bellum-ci","api-rapide"]'`.
Retour arrière : `gh variable delete CI_RUNS_ON_API` (retour au routage Web). Tant que la variable
est absente, rien ne change.

## 5. Prouver que ça garde encore

Une chaîne accélérée dont on n'a pas revérifié les portes est une chaîne qu'on a
peut-être vidée. Après la bascule, sur une PR de vérification :

1. **Les jobs ont bien tourné sur le VPS** — et non pas été sautés :
   ```sh
   gh run view <id> --json jobs -q '.jobs[] | [.name, .conclusion, (.labels|join(","))] | @tsv'
   ```
   Un `skipped` massif signifie que la portée sélective n'a rien trouvé, pas que
   tout va bien.
2. **Une garde sait encore dire NON** : casser volontairement une chose que
   `Test (Web)` attrape, et vérifier que `CI Status` rougit.
3. **Le temps de FILE** est ce qu'on a acheté — le mesurer, pas la charge CPU :

   ```sh
   gh run list --workflow=ci.yml --limit 30 \
     --json createdAt,startedAt,updatedAt,conclusion > /tmp/runs.json
   ```

   Référence avant bascule (16/09/2026, `ubuntu-latest`) : file p50 **0,00 min**,
   verdict p50 **6,2 min**, p95 **21,4 min**.

   ⚠️ Si la file monte, **le réflexe d'ajouter des runners est le mauvais** sur
   cette machine : elle n'a que 8 vCPU, et six runners y ont été mesurés le
   16/09 à une charge de **32,58**, soit 4× sursouscrite. Le job n'attend alors
   plus dans la file, il attend le CPU — l'attente a changé de nom, pas de
   durée, et elle n'apparaît plus nulle part. Au-delà de quatre, ce qu'il faut
   est une **seconde machine** (33 €/mois à deux), pas un cinquième conteneur.
   Hetzner facture à l'heure : c'est réversible dans la journée.

   ⚠️⚠️ Ne jamais changer l'échelle **pendant** un run : `--scale` vers le bas
   DÉTRUIT les conteneurs surnuméraires, tue leurs jobs, et laisse une entrée
   « offline » par conteneur détruit (six, le 16/09). Attendre le verdict.

## Ce qui reste ouvert, et qu'il faut vérifier au premier build

L'hôte étant x86 comme `ubuntu-latest`, les trois réserves du
plan ARM **ne s'appliquent plus** : Playwright, `actions/setup-python` et les
paquets natifs du lockfile tournent exactement comme ailleurs. Elles sont notées
ici pour le jour où la gamme `CAX` redeviendra disponible :

- **Playwright sur ARM64** — image multi-arch, mais tous les navigateurs ne le
  sont pas sur Linux ARM. `E2E (Playwright)` est nocturne et hors de `CI Status`
  depuis le 14/09 ; en cas d'échec, le laisser sur `ubuntu-latest`.
- **`actions/setup-python`** ne publie pas de binaire ARM64 pour toutes les
  versions. Même repli, le job pèse 2,2 min.
- **Les paquets natifs** : au 16/09/2026 les 117 entrées `linux-x64` du
  `pnpm-lock.yaml` ont toutes leur jumeau `linux-arm64` — vérifié, pas supposé.

## Sécurité — ce qui rend ce montage acceptable ici, et ce qui l'annulerait

Un job de CI est **du code arbitraire issu du dépôt**, exécuté sur ta machine.
Ce montage tient sur une condition précise :

> Le dépôt est **privé**, à deux sièges, et n'accepte **aucune pull request de
> fork externe**.

C'est ce qui fait qu'aucun inconnu ne peut faire exécuter son code ici. **Ouvrir
le dépôt aux contributions externes retire les runners auto-hébergés du dépôt
avant tout le reste** — sinon n'importe qui obtient un shell sur la machine et
l'accès aux secrets qu'elle voit passer.

Le reste est déjà posé par [`cloud-init.yaml`](./cloud-init.yaml) : rien
d'entrant sauf SSH, pas d'authentification par mot de passe, pas de connexion
root, mises à jour de sécurité automatiques, et le runner qui ne tourne jamais en
root.

## Nettoyage automatique

**Quoi** : [`nettoie-runners.sh`](nettoie-runners.sh) purge dans chaque conteneur
runner les dossiers de `/tmp` de plus de 6 h (sauf `jest_rs`), supprime le dossier
de travail `_work/belllum-monorepo/belllum-monorepo` s'il est corrompu (pas de
`package.json`, ou `git reset --hard HEAD` échoue ; jamais sur un runner occupé,
jamais sur un dossier sain, qui garde `node_modules` et `.turbo`), et lance
`docker builder prune -af` si le disque `/` atteint 85 %.

**Pourquoi** (02/11/2026) : ~2 000 dossiers de ~150 Mo (≈ 41 Go par runner) dans
`/tmp`, trois hôtes à 84-90 % de disque ; et un index git corrompu qui faisait
échouer `actions/checkout` puis `pnpm/action-setup` sur trois runners.

**Quand** : toutes les 30 min, par `/etc/cron.d/ci-runner-nettoyage` (posé par
`cloud-init.yaml`).

**Où lire** : `/var/log/ci-runner-nettoyage.log` (horodaté UTC + hostname).
Essai sans rien modifier : `DRY_RUN=1 ~/belllum-monorepo/infra/ci-runner-vps/nettoie-runners.sh`.

**Installer sur un hôte existant, sans le réinstaller** :

```sh
git -C /home/ci/belllum-monorepo pull && sudo touch /var/log/ci-runner-nettoyage.log && sudo chown ci:ci /var/log/ci-runner-nettoyage.log && (crontab -l; echo '*/30 * * * * /home/ci/belllum-monorepo/infra/ci-runner-vps/nettoie-runners.sh >> /var/log/ci-runner-nettoyage.log 2>&1') | crontab -
```

(Les hôtes n'ayant pas de copie git, `scp` le script à la place du `git pull`.)

## Dépannage

| Symptôme                                                         | Cause probable                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `401` au démarrage                                               | PAT expiré ou révoqué — le regénérer, remplacer dans `.env`, `docker compose up -d --force-recreate`                                                                                                                                                                                                                                                                      |
| `403`                                                            | Le PAT n'a pas `Administration: read & write` sur ce dépôt                                                                                                                                                                                                                                                                                                                |
| Des runners « offline » s'accumulent                             | Arrêts brutaux sans désenregistrement — [`purge-ghost-runners.sh`](purge-ghost-runners.sh)                                                                                                                                                                                                                                                                                |
| `tar: This does not look like a tar archive` au build            | `TARGETARCH` non peuplé : le Dockerfile a téléchargé le runner x64 sur ARM. Vérifier que BuildKit est actif                                                                                                                                                                                                                                                               |
| Jobs qui ralentissent au fil des jours                           | Mémoire résiduelle — le cron de 02:40 UTC recycle ; vérifier qu'il tourne (`/var/log/ci-runner-recycle.log`)                                                                                                                                                                                                                                                              |
| `no space left on device`                                        | Lancer d'abord [`nettoie-runners.sh`](nettoie-runners.sh) (purge `/tmp` et cache de build, ne touche ni le store pnpm ni un `_work` sain). En dernier recours seulement : `docker system prune -af --volumes` ⚠️ **efface aussi le store pnpm ET le `_work` de chaque runner**, donc les `node_modules` et le `.turbo` : les premiers jobs repartiront entièrement froids |
| `No pnpm version is specified` / `not uptodate; will not remove` | Dossier de travail corrompu : le nettoyage le répare au plus tard en 30 min (ou lancer `nettoie-runners.sh` à la main)                                                                                                                                                                                                                                                    |
| Disque > 85 %                                                    | `/tmp` des conteneurs et cache de build purgés par le nettoyage automatique (`/var/log/ci-runner-nettoyage.log`)                                                                                                                                                                                                                                                          |
