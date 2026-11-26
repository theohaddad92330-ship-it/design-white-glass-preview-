#!/usr/bin/env bash
# Règle l'expiration des jetons OTP/récupération du projet Supabase.
#
# POURQUOI CE SCRIPT EXISTE
# -------------------------
# Un lien de réinitialisation généré depuis le back-office porte DEUX échéances,
# et la plus courte gagne : la nôtre est signée (elle empêche de rallonger un
# lien en changeant le paramètre dans l'URL), celle de Supabase s'applique à
# l'échange du jeton (`verifyOtp`). Tant que Supabase expire à une heure, un lien
# annoncé pour 48 h est refusé après une — notre écran l'accepte, la personne
# saisit son mot de passe, et ça échoue à la dernière étape.
#
# Ce script relève le plafond Supabase. Il reste à déclarer la MÊME valeur dans
# `SUPABASE_OTP_EXP_SECONDS` côté API (Railway), sans quoi le back-office
# continuera d'afficher « Durée réduite » par prudence.
#
# USAGE
# -----
#   SUPABASE_ACCESS_TOKEN=sbp_xxx ./tools/supabase-otp-exp.sh          # → 24 h
#   SUPABASE_ACCESS_TOKEN=sbp_xxx ./tools/supabase-otp-exp.sh 21600    # → 6 h
#
# Le jeton se crée sur https://supabase.com/dashboard/account/tokens
# Il n'est JAMAIS écrit sur le disque : il ne vit que dans l'environnement de
# cette commande.
#
# ⚠️ Ce réglage allonge la fenêtre pendant laquelle un jeton de récupération
# intercepté reste utilisable. Ce qui porte la sécurité ici est que le jeton est
# à USAGE UNIQUE : une fois consommé, il ne vaut plus rien, quelle que soit son
# échéance. La fenêtre, elle, est un arbitrage — 24 h pour qu'un lien transmis à
# la main survive à une nuit.
#
# ⚠️⚠️ CE SCRIPT A ÉTÉ LIVRÉ AVEC UN DÉFAUT DE 48 H, QUE SUPABASE REFUSE.
# La plateforme plafonne à 86 400 s (« Must be no more than 86400 »), mesuré le
# 25/08. Lancé sans argument — c'est-à-dire comme sa propre notice l'indiquait —
# il échouait, le projet gardait son expiration courte, et un lien du back-office
# annoncé pour 24 h mourait avant. Le défaut est désormais 86 400, et toute
# valeur supérieure est refusée ICI plutôt que par une erreur d'API à déchiffrer.

set -euo pipefail

SECONDS_TTL="${1:-86400}" # 86 400 s = 24 h — le maximum que Supabase accepte

if [[ "$SECONDS_TTL" -gt 86400 ]]; then
  echo "Supabase plafonne l'expiration OTP à 86400 s (24 h) ; ${SECONDS_TTL} s serait refusé." >&2
  echo "Relance sans argument pour poser le maximum :" >&2
  echo "  SUPABASE_ACCESS_TOKEN=sbp_xxx ./tools/supabase-otp-exp.sh" >&2
  exit 1
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "SUPABASE_ACCESS_TOKEN manquant." >&2
  echo "Crée un jeton sur https://supabase.com/dashboard/account/tokens puis :" >&2
  echo "  SUPABASE_ACCESS_TOKEN=sbp_xxx ./tools/supabase-otp-exp.sh" >&2
  exit 1
fi

# La référence du projet vient du fichier de secrets local — jamais codée en dur.
if [[ -z "${SUPABASE_PROJECT_ID:-}" ]]; then
  # shellcheck disable=SC1091
  [[ -f tools/dev.secret.sh ]] && source tools/dev.secret.sh
fi

if [[ -z "${SUPABASE_PROJECT_ID:-}" ]]; then
  echo "SUPABASE_PROJECT_ID introuvable (ni dans l'environnement, ni dans tools/dev.secret.sh)." >&2
  exit 1
fi

echo "Projet : ${SUPABASE_PROJECT_ID}"
echo "Lecture de la valeur ACTUELLE avant de la changer…"
curl -sS \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/config/auth" |
  /usr/bin/python3 -c 'import json,sys; d=json.load(sys.stdin); print("  mailer_otp_exp actuel :", d.get("mailer_otp_exp"), "s")'

echo "Passage à ${SECONDS_TTL} s…"
curl -sS -X PATCH \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"mailer_otp_exp\": ${SECONDS_TTL}}" \
  "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/config/auth" |
  /usr/bin/python3 -c 'import json,sys; d=json.load(sys.stdin); print("  mailer_otp_exp désormais :", d.get("mailer_otp_exp"), "s")'

echo
echo "Reste à faire, sinon le back-office affichera toujours « Durée réduite » :"
echo "  Railway → service API → SUPABASE_OTP_EXP_SECONDS=${SECONDS_TTL}"
