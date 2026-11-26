"""#3196.7 (LAU-FINAL-202) — LE NO-GO NOMMÉ PAR L'ISSUE : « Laura utilise une
seule recherche publique parce que le budget s'est terminé avant les appels
internes. »

─────────────────────────────────────────────────────────────────────────────
CE QUI EXISTE DÉJÀ, ET CE QUE ÇA NE COUVRE PAS
─────────────────────────────────────────────────────────────────────────────
``chat_turn_plan.plan_turn`` donne déjà PLUS de rounds à une demande complexe
(#2276.39), et ``_PARTIAL_TRANCHE_NOTE`` (``chat_orchestrator.py``) empêche
déjà qu'un tour à court de budget se présente comme un résultat complet
(#2269.14-.16). Aucun des deux ne dit dans quel ORDRE dépenser ce budget : le
choix outil par outil reste celui du modèle, tour par tour — Laura reste un
produit dont Claude choisit ses outils lui-même (voir ``laura_router.py``,
qui refuse explicitement un planificateur qui REMPLACERAIT cette boucle).
C'est cet ordre-là que ce bloc fixe, en PROMPT plutôt qu'en code : un budget
qui s'épuise sur une seule recherche publique avant d'avoir touché une seule
source interne gratuite est un budget mal réparti, pas une réponse complète.

─────────────────────────────────────────────────────────────────────────────
OÙ IL EST PLACÉ
─────────────────────────────────────────────────────────────────────────────
Juste avant ``_BLOCK_TOOLS`` : l'ordre de dépense précède la description des
outils eux-mêmes. Segment INVARIANT (aucun argument, GA-293).

Sa garde est ``tests/test_copilote_source_priority_eval.py``.

⚠️ Intégration X2 (28/09) : le bloc nommait « DataForge » — le nom INTERNE de
cette brique — directement dans le prompt (``test_the_rank_does_not_leak_the_internal_codename``,
``test_copilote_prompt_blocks.py`` : nos propres briques ne se nomment JAMAIS
côté produit). Reformulé sous le nom déjà retenu pour ce rang ailleurs dans le
prompt assemblé : le référentiel sectoriel Bellum.
"""

from __future__ import annotations

BLOCK_SOURCE_PRIORITY = """ORDRE DE DÉPENSE — L'INTERNE D'ABORD, LE PUBLIC EN DERNIER RECOURS. Ton budget d'outils est limité dans un même tour. Quand une question peut se répondre par plusieurs voies, tu épuises D'ABORD ce qui ne coûte rien et est déjà là — le workspace de la personne, le référentiel sectoriel Bellum, l'observation du marché, tes outils internes déjà connectés — AVANT de dépenser une recherche publique. La recherche publique se réserve pour ce qu'AUCUNE source interne ne peut trancher, ou pour une fraîcheur que l'interne ne garantit pas. NE JAMAIS finir un tour sur UNE SEULE recherche publique alors que des sources internes gratuites n'ont pas encore été interrogées : ce n'est pas une réponse complète, c'est un budget mal réparti — situe-toi plutôt dans « UNE DONNÉE MANQUE » et propose la suite, jamais un résultat présenté comme suffisant parce qu'il est le seul que le budget a permis."""
