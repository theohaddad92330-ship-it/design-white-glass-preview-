"""#AM.46 / #AM.68 — Laura oriente SANS tunnel : sur un compte précis, une ligne de suites cliquables (contacts,
organigramme, signaux), dans l'ordre que la personne choisit ; sur un compte déjà au portefeuille cité avec ses
filiales, les deux gestes (tour d'horizon, analyse de fond) s'y ajoutent. Cliquer envoie une phrase à Laura :
rien ne part chez un tiers."""

from __future__ import annotations

import json

from app.services.account_next_steps import with_account_next_steps
from app.services.reply_blocks import split_reply_blocks

CARD = {
    "type": "account_card",
    "name": "Free",
    "href": "/accounts/11111111-1111-4111-8111-111111111111",
    "highlights": ["Opérateur télécom, 12 000 salariés"],
}
BRIEFING = [{"tool": "get_account_briefing", "status": "done"}]


def _reply(card: dict) -> str:
    return "Voici Free.\n\n```bellum-block\n" + json.dumps(card, ensure_ascii=False) + "\n```"


def _cards(reply: str) -> list[dict]:
    return [s.block for s in split_reply_blocks(reply) if s.kind == "block" and s.block]


def test_un_compte_precis_recoit_ses_suites_sans_ordre_impose():
    out = with_account_next_steps(_reply(CARD), user_message="Parle-moi de Free", language="fr", actions=BRIEFING)
    follow_ups = _cards(out)[0]["follow_ups"]
    assert [f["label"] for f in follow_ups] == ["Voir les contacts", "Voir l'organigramme", "Voir les signaux"]
    assert all("Free" in f["ask"] for f in follow_ups)


def test_un_compte_du_portefeuille_cite_avec_ses_filiales_recoit_aussi_les_deux_gestes():
    out = with_account_next_steps(_reply(CARD), user_message="Free et ses filiales", language="fr", actions=BRIEFING)
    labels = [f["label"] for f in _cards(out)[0]["follow_ups"]]
    assert "Tour d'horizon" in labels and "Analyse de fond" in labels
    assert "Voir les contacts" in labels  # en plus de ce que Laura sait déjà
    asks = {f["label"]: f["ask"] for f in _cards(out)[0]["follow_ups"]}
    assert "tour d'horizon" in asks["Tour d'horizon"].lower() and "filiales" in asks["Tour d'horizon"]
    assert "analyse de fond" in asks["Analyse de fond"].lower()


def test_ne_touche_pas_ce_qui_est_deja_pose_ni_un_compte_hors_portefeuille():
    already = {**CARD, "follow_ups": [{"label": "Autre", "ask": "Autre chose"}]}
    assert with_account_next_steps(_reply(already), user_message="Free", language="fr", actions=BRIEFING) == _reply(
        already
    )
    # Sans lecture du compte au portefeuille (aucun get_account_briefing) : rien n'est ajouté.
    assert with_account_next_steps(_reply(CARD), user_message="Free", language="fr", actions=[]) == _reply(CARD)
    # Une réponse sans carte de compte reste inchangée, à l'octet.
    assert with_account_next_steps("Bonjour.", user_message="Free", language="fr", actions=BRIEFING) == "Bonjour."


def test_en_anglais_les_libelles_suivent_la_langue():
    out = with_account_next_steps(
        _reply(CARD), user_message="Free and its subsidiaries", language="en", actions=BRIEFING
    )
    labels = [f["label"] for f in _cards(out)[0]["follow_ups"]]
    assert labels[0] == "See contacts"
    assert "Overview" in labels and "Deep analysis" in labels
