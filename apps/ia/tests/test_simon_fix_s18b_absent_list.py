"""SIMON-FIX S.18b (recette 20/10) — « Tu peux choisir un compte de cette sélection » sans AUCUNE sélection.

Une réponse ne renvoie jamais à une liste absente : soit l'outil a rendu une liste, soit Laura dit ce qui manque."""

import json

from app.services.commercial_verifier import (
    REFERS_TO_ABSENT_LIST,
    repair_addendum,
    verify_response,
)

_PHRASE = "Je garde tes critères : transport, Île-de-France, plus de 1000 salariés. Tu peux choisir un compte de cette sélection."


def test_la_phrase_sans_liste_est_signalee():
    result = verify_response(_PHRASE, tool_outputs=())
    assert REFERS_TO_ABSENT_LIST in result.repair_reasons


def test_un_outil_qui_a_rendu_une_liste_autorise_la_phrase():
    output = json.dumps({"candidates": [{"name": "Geodis", "siren": "1"}, {"name": "Kuehne", "siren": "2"}]})
    assert REFERS_TO_ABSENT_LIST not in verify_response(_PHRASE, tool_outputs=[output]).repair_reasons


def test_un_outil_a_repondu_liste_vide_la_phrase_reste_signalee():
    output = json.dumps({"candidates": []})
    assert REFERS_TO_ABSENT_LIST in verify_response(_PHRASE, tool_outputs=[output]).repair_reasons


def test_une_reponse_qui_ne_renvoie_a_aucune_liste_passe():
    assert REFERS_TO_ABSENT_LIST not in verify_response("Dis-moi la zone et la taille visées.", tool_outputs=()).repair_reasons


def test_la_precision_dit_ce_qui_manque_au_lieu_de_renvoyer_a_la_liste():
    addendum = repair_addendum([REFERS_TO_ABSENT_LIST])
    assert "aucune liste" in addendum.lower()
    assert "relance" in addendum.lower()
    assert "sélection" not in addendum.lower().replace("aucune liste de comptes", "")
