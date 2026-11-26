"""#3285 / #3255 — les DEUX plafonds de réponse de la discipline de méthode,
vérifiés sur la RÉPONSE et pas seulement sur le texte du prompt :
« maximum une objection méthodologique importante par réponse » et
« maximum une recommandation proactive supplémentaire ».

Même convention que les évals ``test_copilote_*_eval.py`` : aucun appel modèle
(CI sans clé) — deux moitiés déterministes.

1. Le prompt assemblé PORTE les deux plafonds (et le test sait dire NON : retiré
   le bloc, il tombe).
2. Un ORACLE sait reconnaître une réponse qui les dépasse (deux objections de
   méthode, deux propositions proactives) et laisse passer une réponse qui les
   respecte — corpus dans les deux sens, contrôle inverse compris.

Ce que ce fichier ne prouve PAS : que le modèle réel les respecte. Cette moitié
est une recette /chat : poser « Je veux envoyer mon message à ce DSI demain, je
n'ai pas de signal, pas de contact validé et pas de plan » et compter, dans la
réponse, les objections de méthode (≤ 1) et les propositions en plus (≤ 1).
"""

from __future__ import annotations

import re

from app.prompts.bellum_advisor import _BLOCK_METHOD_DISCIPLINE, build_system_prompt

_OBJECTION_RE = re.compile(
    r"(?im)^\s*(?:[-*•]\s*)?(?:attention\s*:|point de vigilance|objection\s*:|je challenge|"
    r"méthode\s*:|ça ne respecte pas la méthode)"
)
_PROACTIVE_RE = re.compile(r"(?im)(?:^|[.!?]\s+)(?:je te propose aussi|je peux aussi|en plus,? je peux|au passage,? je propose)")


def count_method_objections(reply: str) -> int:
    return len(_OBJECTION_RE.findall(reply))


def count_proactive_recommendations(reply: str) -> int:
    return len(_PROACTIVE_RE.findall(reply))


def breaks_a_cap(reply: str) -> list[str]:
    broken: list[str] = []
    if count_method_objections(reply) > 1:
        broken.append("objection")
    if count_proactive_recommendations(reply) > 1:
        broken.append("proactive")
    return broken


def test_the_assembled_prompt_carries_both_caps():
    prompt = build_system_prompt({}, {}, "", "", "").lower()
    assert "une objection méthodologique" in prompt
    assert "une recommandation proactive" in prompt


def test_the_prompt_check_knows_how_to_say_no():
    without = build_system_prompt({}, {}, "", "", "").replace(_BLOCK_METHOD_DISCIPLINE, "").lower()
    assert "une objection méthodologique" not in without
    assert "une recommandation proactive" not in without


def test_the_oracle_catches_a_reply_with_two_method_objections():
    reply = (
        "Je prépare le message.\n"
        "Attention : le compte n'a aucun signal récent.\n"
        "Point de vigilance : aucun contact validé sur ce compte.\n"
    )
    assert breaks_a_cap(reply) == ["objection"]


def test_the_oracle_catches_two_proactive_recommendations():
    reply = "Voici le message. Je te propose aussi une relance à J+3. Je peux aussi préparer le plan de compte."
    assert breaks_a_cap(reply) == ["proactive"]


def test_the_oracle_lets_a_capped_reply_through():
    # Une objection + une proposition : exactement les plafonds, rien de plus.
    reply = (
        "Voici le message.\n"
        "Attention : aucun signal récent sur ce compte, l'accroche reste une hypothèse.\n"
        "Je te propose aussi de chercher un second signal avant de l'envoyer."
    )
    assert breaks_a_cap(reply) == []


def test_the_oracle_lets_a_plain_reply_through_the_inverse_control():
    assert breaks_a_cap("Le SIREN de Michelin est 855 200 507.") == []
    assert breaks_a_cap("") == []
