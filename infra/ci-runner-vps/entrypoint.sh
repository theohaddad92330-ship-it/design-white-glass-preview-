#!/usr/bin/env bash
#
# Enregistre ce conteneur comme runner GitHub Actions, puis prend des jobs.
#
# ─────────────────────────────────────────────────────────────────────────────
# LES TROIS CHOSES QUI RENDENT CE SCRIPT NÉCESSAIRE
# ─────────────────────────────────────────────────────────────────────────────
# 1. Le jeton d'enregistrement d'un runner expire au bout d'UNE HEURE. On ne peut
#    donc pas le poser en variable d'environnement : il faut le demander à
#    l'API à chaque démarrage, à partir d'un PAT de longue durée.
# 2. Un conteneur peut être arrêté ou recréé (mise à jour de l'image, hôte). Un runner
#    qui disparaît sans se désenregistrer laisse une entrée fantôme « offline »
#    dans les réglages du dépôt, et GitHub finit par router des jobs vers elle.
#    D'où le `trap` : on se retire proprement à l'arrêt.
# 3. Un nom de runner doit être UNIQUE ENTRE REPLICAS, et STABLE dans le temps
#    pour un MÊME replica. Les deux, pas l'un ou l'autre.
#
#    ⚠️ Ça n'a pas toujours été le cas, et ça se mesure : le nom valait
#    `<préfixe>-$(hostname)`, or un conteneur RECRÉÉ reçoit un hostname NEUF. `--replace` (plus bas) cherche un homonyme à
#    reprendre et n'en trouvait donc JAMAIS : chaque redémarrage créait une
#    entrée de plus. Mesuré le 27/08/2026 — **121 runners déclarés, dont 117
#    hors ligne** et 4 vivants. Le commentaire disait « jamais un nom fixe »,
#    et c'est précisément le nom fixe PAR REPLICA qui manquait.
#
#    Compose donne à chaque replica un hostname stable tant qu'on ne le
#    recrée pas : il donne les deux propriétés (ou fixer `RUNNER_NAME`).
#
# ⚠️ Le runner n'est PAS `--ephemeral`, et c'est délibéré : le mode éphémère
# efface le répertoire de travail après chaque job, donc `node_modules`, le store
# pnpm et le cache Turbo repartiraient de zéro — exactement ce qu'on vient
# éviter. Le prix de ce choix est qu'un job doit pouvoir s'exécuter sur un
# espace de travail qui a déjà servi ; c'est le cas ici (checkout propre à chaque
# job). Il ne serait PAS acceptable sur un dépôt public, où n'importe qui peut
# proposer une PR : le dépôt est privé et sans forks externes.
set -euo pipefail

: "${GITHUB_REPO:?GITHUB_REPO manquant — au format owner/repo}"

# ─────────────────────────────────────────────────────────────────────────────
# DEUX FAÇONS DE S'ENRÔLER, ET POURQUOI LA SECONDE EXISTE
# ─────────────────────────────────────────────────────────────────────────────
# 1. `GITHUB_PAT` — un jeton de LONGUE durée, qui permet de redemander un jeton
#    d'enrôlement à chaque démarrage. Utile si le conteneur est recréé
#    (et pas seulement redémarré).
#
# 2. `RUNNER_TOKEN` — un jeton d'enrôlement déjà obtenu, qui expire en UNE
#    HEURE. Il suffit sur un hôte qu'on maîtrise, parce que `config.sh` n'a
#    besoin de lui qu'une fois : il écrit ensuite `.runner` et `.credentials`,
#    et `run.sh` vit sur ceux-là. Le prix de ce mode est qu'aucun secret durable
#    ne se pose sur la machine — ce qui est exactement ce qu'on veut sur un VPS
#    qui exécute du code de CI.
#
# Un runner DÉJÀ configuré ne redemande rien du tout : le bloc ci-dessous sort
# tôt. C'est ce qui rend `docker compose restart` (le recyclage nocturne) sûr
# dans les deux modes.
cd /home/pwuser/runner

if [ -f .runner ] && [ -f .credentials ]; then
  echo "[runner] déjà enrôlé — reprise sans nouveau jeton"
  ./run.sh &
  wait $!
  exit $?
fi

if [ -z "${GITHUB_PAT:-}" ] && [ -z "${RUNNER_TOKEN:-}" ]; then
  echo "[runner] ni GITHUB_PAT ni RUNNER_TOKEN — impossible de s'enrôler." >&2
  echo "[runner]   · GITHUB_PAT   : jeton de longue durée (portée 'repo', ou 'Administration: read & write' en fine-grained)" >&2
  echo "[runner]   · RUNNER_TOKEN : jeton d'enrôlement, valable 1 h, obtenu par" >&2
  echo "[runner]     gh api -X POST repos/${GITHUB_REPO}/actions/runners/registration-token --jq .token" >&2
  exit 1
fi

RUNNER_LABELS="${RUNNER_LABELS:-bellum-ci}"
RUNNER_NAME="${RUNNER_NAME:-${RUNNER_NAME_PREFIX:-vps}-$(hostname)}"
API="https://api.github.com/repos/${GITHUB_REPO}/actions/runners/registration-token"


# Un échec doit DIRE quoi faire. Sans ce découpage, un PAT expiré sort en
# « curl: (22) error 401 », qui n'apprend rien à celui qui lit les logs du conteneur
# six semaines plus tard.
registration_token() {
  local body status
  body="$(curl -sS -w '\n%{http_code}' -X POST \
    -H "Authorization: Bearer ${GITHUB_PAT}" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "${API}")" || {
    echo "[runner] GitHub injoignable — réseau sortant de l'hôte ?" >&2
    return 1
  }
  status="$(printf '%s' "${body}" | tail -n1)"
  body="$(printf '%s' "${body}" | sed '$d')"

  case "${status}" in
    201) printf '%s' "${body}" | jq -r '.token' ;;
    401) echo "[runner] 401 — le PAT est invalide ou expiré. Régénère-le et remplace GITHUB_PAT." >&2; return 1 ;;
    403) echo "[runner] 403 — le PAT n'a pas le droit d'enregistrer un runner. Il lui faut la portée 'repo' (classique) ou 'Administration: read & write' (fine-grained)." >&2; return 1 ;;
    404) echo "[runner] 404 — dépôt '${GITHUB_REPO}' introuvable AVEC CE PAT. Vérifie le nom, et que le PAT porte bien sur ce dépôt." >&2; return 1 ;;
    *)   echo "[runner] réponse inattendue de GitHub (HTTP ${status}) : ${body}" >&2; return 1 ;;
  esac
}

unregister() {
  echo "[runner] arrêt demandé — désenregistrement de ${RUNNER_NAME}"
  if [ -n "${GITHUB_PAT:-}" ]; then
    # Un jeton FRAIS : celui du démarrage a pu expirer depuis longtemps si le
    # conteneur tourne depuis des heures.
    ./config.sh remove --token "$(registration_token)" || true
  else
    # ⚠️ En mode `RUNNER_TOKEN`, il n'y a RIEN pour en redemander un : celui du
    # démarrage a expiré au bout d'une heure. Le runner part donc sans se
    # désenregistrer et laisse une entrée « offline » côté GitHub. C'est le prix
    # assumé de ne poser aucun secret durable sur la machine, et il se paie avec
    # `purge-ghost-runners.sh`, qui existe déjà pour cette raison-là.
    echo "[runner] pas de GITHUB_PAT : arrêt sans désenregistrement (voir purge-ghost-runners.sh)" >&2
  fi
  exit 0
}
trap unregister SIGTERM SIGINT

if [ -n "${RUNNER_TOKEN:-}" ]; then
  TOKEN="${RUNNER_TOKEN}"
  echo "[runner] enrôlement avec un jeton fourni (expire en 1 h, non conservé)"
else
  TOKEN="$(registration_token)"
fi
if [ -z "${TOKEN}" ] || [ "${TOKEN}" = "null" ]; then
  echo "[runner] impossible d'obtenir un jeton d'enregistrement — jeton invalide ou portée insuffisante" >&2
  exit 1
fi

# `--replace` reprend la place d'un runner homonyme resté fantôme après un arrêt
# brutal, au lieu d'en créer un deuxième que personne ne nettoiera.
./config.sh \
  --unattended \
  --replace \
  --url "https://github.com/${GITHUB_REPO}" \
  --token "${TOKEN}" \
  --name "${RUNNER_NAME}" \
  --labels "${RUNNER_LABELS}" \
  --work /home/pwuser/_work

echo "[runner] ${RUNNER_NAME} enregistré (labels: ${RUNNER_LABELS})"

# `& wait` et non un exec direct : sans cela le `trap` ne se déclenche qu'APRÈS
# la fin de `run.sh`, donc jamais — et le désenregistrement ne partirait pas.
./run.sh &
wait $!
