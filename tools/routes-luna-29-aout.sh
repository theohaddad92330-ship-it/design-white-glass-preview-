#!/usr/bin/env bash
# Bascule sur Luna les six prompts dont la campagne du 29/08/2026 prouve la parité
# DANS LA CONDITION DE LA PASSERELLE (`--effort none`, comme la production).
#
# Résultats (médiane sur 3 tirages, barème à axes nommés) :
#
#   prompt                  Sonnet   Luna(none)   coût Sonnet → Luna
#   bellum_cv                97,62      98,21      0,0159 → 0,0006 $
#   bellum_need_play        100,00     100,00      0,0275 → 0,0013 $
#   bellum_compare          100,00     100,00      0,0244 → 0,0010 $
#   bellum_rfp_draft        100,00     100,00      0,0068 → 0,0003 $
#   bellum_scorer            63,64     100,00      0,0547 → 0,0017 $
#   bellum_linkedin_posts   non mes.   100,00      0,0155 → 0,0009 $
#
# NON basculés, et c'est délibéré :
#   bellum_battlecard    Sonnet 100 / Luna 53,57 — 2 tirages sur 3 amputés
#   bellum_rfp_analyse   Sonnet 100 / Luna 98,85 sur n=2 — Luna s'EMBALLE :
#                        12 000 jetons de sortie contre 2 200 pour Sonnet,
#                        tronqué 1 fois sur 3. Le plafond de prod est 8 000.
set -euo pipefail

SERVICE=bellum-ia-service
ENVIRONNEMENT=production

for VAR in \
  LLM_ROUTE_BELLUM_CV \
  LLM_ROUTE_BELLUM_NEED_PLAY \
  LLM_ROUTE_BELLUM_COMPARE \
  LLM_ROUTE_BELLUM_RFP_DRAFT \
  LLM_ROUTE_BELLUM_SCORER \
  LLM_ROUTE_BELLUM_LINKEDIN_POSTS; do
  railway variables --service "$SERVICE" --environment "$ENVIRONNEMENT" \
    --set "$VAR=openai:gpt-5.6-luna" --skip-deploys >/dev/null
  echo "posé  $VAR"
done

echo
echo "── relecture depuis Railway ──"
# ⚠️ La propagation n'est pas immédiate : une relecture lancée dans la foulée du
# dernier `--set` a rendu 4 variables sur 6 le 29/08, ce qui ressemblait à un
# échec alors que tout était posé. Une vérification qui peut mentir est pire
# qu'une absence de vérification — on RÉESSAIE jusqu'à retrouver les six, et on
# échoue bruyamment si elles ne viennent pas.
#
# ⚠️ UN SEUL motif, et il est ANCRÉ sur le nom COMPLET. Première version :
# `(…|RFP|…|LINKEDIN|…)=`, qui ne matche pas `RFP_DRAFT=` ni `LINKEDIN_POSTS=`.
# Elle affichait donc 4 variables sur 6 posées, et j'ai d'abord accusé un délai
# de propagation — au point d'ajouter une boucle de réessai pour un problème qui
# n'existait pas. Le défaut était dans l'instrument de mesure, pas dans le
# système mesuré. C'est toujours la première hypothèse à écarter.
ATTENDUES=6
MOTIF='^LLM_ROUTE_BELLUM_(CV|NEED_PLAY|COMPARE|RFP_DRAFT|SCORER|LINKEDIN_POSTS)=openai:gpt-5\.6-luna$'

LECTURE=$(railway variables --service "$SERVICE" --environment "$ENVIRONNEMENT" --kv)
LUES=$(printf '%s\n' "$LECTURE" | grep -cE "$MOTIF" || true)

# On AFFICHE ce qu'on a COMPTÉ — la même lecture, le même motif.
printf '%s\n' "$LECTURE" | grep -E "$MOTIF" | sort

if [ "$LUES" -lt "$ATTENDUES" ]; then
  echo "✗ $LUES/$ATTENDUES seulement — NE PAS conclure que la bascule est faite." >&2
  exit 1
fi
echo "✓ les $ATTENDUES routes sont relues depuis Railway, dans la MÊME lecture."

echo
echo "⚠️ --skip-deploys : les variables sont posées, le service n'a pas redémarré."
echo "   resolve_route() les lit à CHAQUE appel, donc un redéploiement n'est pas"
echo "   nécessaire au sens strict — mais un processus déjà lancé garde son"
echo "   environnement. Redéployer le service pour que ce soit effectif partout."
