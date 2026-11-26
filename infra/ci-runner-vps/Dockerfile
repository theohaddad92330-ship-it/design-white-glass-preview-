# ─────────────────────────────────────────────────────────────────────────────
# Runner GitHub Actions auto-hébergé, pour les VPS Hetzner (`infra/ci-runner-vps/`).
#
# POURQUOI CE SERVICE EXISTE
# ──────────────────────────
# Les runners hébergés par GitHub sont facturés à la minute au-delà des 3 000
# incluses ; les runners AUTO-HÉBERGÉS ne le sont pas, sur tous les plans. Avec
# dix jobs par exécution sur un monorepo, la CI de ce dépôt dépasse largement
# l'enveloppe — et le 24/08/2026 elle était éteinte depuis cinq jours, ce qui a
# laissé passer une suite rouge sur `main` puis un 500 en production.
#
# L'IMAGE DE BASE, ET POURQUOI CELLE-CI
# ─────────────────────────────────────
# `mcr.microsoft.com/playwright` porte déjà les navigateurs ET leurs dépendances
# système. Sur une image Node nue, le job E2E paierait un `apt-get` de deux
# minutes À CHAQUE exécution (`playwright install --with-deps`), ce qui mangerait
# le gain qu'on vient chercher. La version suit celle du dépôt : un navigateur
# plus vieux que la bibliothèque fait échouer Playwright au démarrage.
# ─────────────────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.64.1-jammy

# Le runner refuse de tourner en root, et c'est une protection réelle : un job
# est du code arbitraire du dépôt. L'image Playwright fournit déjà `pwuser`.
ARG RUNNER_VERSION=2.336.0

# L'ARCHITECTURE, ET POURQUOI ELLE EST UN ARGUMENT
# ────────────────────────────────────────────────
# Cette image reste multi-architecture : x86-64 (CX43/CX53, en service) ou ARM
# (gamme CAX, si elle redevient disponible). L'archive du runner n'a pas le même
# nom sur les deux, et le nom `x64` était écrit en dur — sur ARM, `tar` échouait sur
# une page d'erreur HTML de GitHub, ce qui ne ressemble pas du tout à « mauvaise
# architecture ».
#
# `TARGETARCH` est fourni par BuildKit (`amd64` / `arm64`) ; il faut le
# traduire, GitHub publiant `x64` là où Docker dit `amd64`. Le défaut `amd64`
# garde x86-64 pour un build sans BuildKit.
ARG TARGETARCH=amd64

USER root

# `curl`, `jq` et `git` servent à l'enregistrement et au checkout ; `sudo` permet
# aux jobs qui installent un paquet système de le faire sans tourner en root en
# permanence. `libicu` est exigé par le runner .NET.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git jq sudo libicu70 \
  && rm -rf /var/lib/apt/lists/* \
  && echo "pwuser ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/pwuser

WORKDIR /home/pwuser/runner

RUN RUNNER_ARCH="$(case "${TARGETARCH}" in arm64) echo arm64 ;; amd64|'') echo x64 ;; \
      *) echo "architecture non gérée: ${TARGETARCH}" >&2; exit 1 ;; esac)" \
  && curl -fsSL -o runner.tar.gz \
    "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz" \
  && tar xzf runner.tar.gz \
  && rm runner.tar.gz \
  && chown -R pwuser:pwuser /home/pwuser

COPY --chown=pwuser:pwuser entrypoint.sh /home/pwuser/entrypoint.sh
RUN chmod +x /home/pwuser/entrypoint.sh

USER pwuser

# Le store pnpm vit HORS du répertoire de travail du runner : c'est ce qui le
# rend chaud d'un job à l'autre, et c'est le vrai gain de vitesse d'un runner
# auto-hébergé face à un runner GitHub qui repart de zéro à chaque fois.
ENV PNPM_HOME=/home/pwuser/.pnpm-store
ENV PATH="${PNPM_HOME}:${PATH}"

# ⚠️ CE RÉPERTOIRE DOIT EXISTER DANS L'IMAGE, et pas seulement dans `PNPM_HOME`.
# Sans volume il apparaîtrait tout seul, `pnpm` le créant au premier appel sous
# l'identité de `pwuser`. Dès qu'on monte un VOLUME NOMMÉ dessus (compose le fait,
# pour garder le store chaud entre deux conteneurs), Docker initialise ce volume
# à partir du chemin de l'image : s'il n'y existe pas, le volume est créé vide
# ET APPARTENANT À ROOT, or le runner tourne en `pwuser`.
#
# Mesuré le 16/09/2026, à la première bascule de `CI_RUNS_ON` : les onze jobs
# Node du run sont morts en douze secondes sur
# `EACCES: permission denied, mkdir '/home/pwuser/.pnpm-store/v3'`, dans
# `pnpm/action-setup`. Les jobs Python, eux, passaient — ce qui désigne la
# chaîne pnpm et pas la machine.
#
# Le `mkdir` suffit et le `chown` serait une faute : on est déjà `pwuser` ici
# (voir le `USER` plus haut), donc le répertoire lui appartient d'office — et
# `chown` est réservé à root, si bien que l'ajouter ferait échouer le build.
RUN mkdir -p "${PNPM_HOME}"

ENTRYPOINT ["/home/pwuser/entrypoint.sh"]
