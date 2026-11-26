"""#2721 / #2678 / #2679 — deux outils BRANCHÉS que Laura n'appelait jamais.

Recette en production du 23/09/2026 (sha servi e493d84f2) :

* « Quelles sont les dernières levées de fonds de startups de la French Tech ? »
  — Laura répond DE MÉMOIRE, zéro source, alors que `web_search` est dans
  `CHAT_TOOLS` et que la clé est posée ;
* « Trouve-moi des comptes intéressants » — Laura écrit « Tu veux dire : » et
  trois options en markdown inerte au lieu d'appeler `offer_reply_options`.

La cause mesurée n'était PAS l'exposition : `tools_for` (appelé par
`chat_orchestrator.run_chat_with_tools`) présente les deux outils à tous les
tours, aucune famille de connecteur ne les exige. Elle était dans la CONSIGNE et
dans le ROUTAGE :

1. `_BLOCK_OUT_OF_SCOPE` rangeait « l'actualité générale » HORS PÉRIMÈTRE —
   « une réponse BRÈVE » —, soit exactement la réponse de mémoire observée, et
   aucun bloc du prompt ne nommait `web_search` ;
2. le routeur d'intention ne reconnaissait aucune des deux phrases
   (`non_declaree`) : le bloc « ce que le serveur a compris » était VIDE, donc
   rien ne pointait le modèle vers l'outil ;
3. rien n'interdisait une liste de choix écrite en texte.

Chaque test ci-dessous sait dire NON : un témoin voisin (« mes dernières
actions », « Bonjour ») ne déclenche rien.
"""

from __future__ import annotations

import json

import pytest

from app.prompts.bellum_advisor import _BLOCK_OUT_OF_SCOPE, _BLOCK_TOOLS, build_system_prompt
from app.prompts.intent_route import intent_route_block, public_news_block
from app.services.chat_tools import REPLY_OPTIONS_TOOL_NAME, tools_for
from app.services.compilers.intent_router import asks_for_public_news, route_chat_intent

NEWS_PHRASE = "Quelles sont les dernières levées de fonds de startups de la French Tech ?"
ACCOUNTS_PHRASE = "Trouve-moi des comptes intéressants"


# ── Le routeur ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "message",
    [ACCOUNTS_PHRASE, "trouve moi des comptes", "Find me some interesting accounts"],
)
def test_2679_trouver_des_comptes_est_route_vers_la_recherche_de_comptes(message: str) -> None:
    route = route_chat_intent(message=message)
    assert route.intent == "chercher_du_business"
    assert "find_accounts" in route.tools


@pytest.mark.parametrize(
    "message",
    [
        NEWS_PHRASE,
        "Quelle est l'actualité de Capgemini ?",
        "What are the latest funding rounds in French Tech?",
    ],
)
def test_2721_une_question_dactualite_est_reconnue(message: str) -> None:
    assert asks_for_public_news(message)


@pytest.mark.parametrize(
    "message",
    ["Bonjour", "Quelles sont mes dernières actions ?", "Prépare le rendez-vous avec Thales"],
)
def test_2721_le_temoin_une_question_sur_le_portefeuille_ne_part_pas_sur_le_web(message: str) -> None:
    assert asks_for_public_news(message) is None
    assert public_news_block(message, "fr") == ""


# ── Les blocs volatils ───────────────────────────────────────────────────────


@pytest.mark.parametrize("language", ["fr", "en"])
def test_2721_le_bloc_dactualite_nomme_web_search_et_les_sources(language: str) -> None:
    block = public_news_block(NEWS_PHRASE, language)
    assert "`web_search`" in block
    # Les adresses rendues sont citées : c'est ce qui alimente le panneau sources.
    assert ("adresse" in block) if language == "fr" else ("address" in block)


# ── #2721 suite (23/09) — les sources citées sont des LIENS MARKDOWN, pas de
# simples adresses en texte : sans la syntaxe `[Nom](adresse)`, le moteur de
# rendu du chat (`markdown.tsx`, `processInline`) n'a rien à rendre cliquable.


@pytest.mark.parametrize("language", ["fr", "en"])
def test_2721_le_bloc_dactualite_demande_un_lien_markdown_cliquable(language: str) -> None:
    block = public_news_block(NEWS_PHRASE, language)
    assert "[Nom du site](adresse)" in block if language == "fr" else "[Site name](address)" in block


def test_2721_le_bloc_outils_demande_aussi_un_lien_markdown_pour_lactualite() -> None:
    assert "[Nom du site](adresse)" in _BLOCK_TOOLS


def test_2679_une_route_outillee_rend_la_precision_cliquable() -> None:
    block = intent_route_block(route_chat_intent(message=ACCOUNTS_PHRASE), "fr")
    assert "find_accounts" in block
    assert f"`{REPLY_OPTIONS_TOOL_NAME}`" in block
    # Le témoin : une demande non routée n'ajoute toujours rien.
    assert intent_route_block(route_chat_intent(message="Bonjour"), "fr") == ""


# ── Le prompt invariant ──────────────────────────────────────────────────────


def test_2721_lactualite_nest_plus_hors_perimetre() -> None:
    assert "actualité générale" not in _BLOCK_OUT_OF_SCOPE
    assert "`web_search`" in _BLOCK_OUT_OF_SCOPE


def test_2721_2679_le_bloc_outils_porte_les_deux_consignes() -> None:
    assert "`web_search`" in _BLOCK_TOOLS
    assert "JAMAIS de mémoire" in _BLOCK_TOOLS
    assert f"`{REPLY_OPTIONS_TOOL_NAME}`" in _BLOCK_TOOLS
    assert "liste de choix écrite en texte" in _BLOCK_TOOLS
    system = build_system_prompt({}, {}, "", "")
    assert _BLOCK_TOOLS in system


# ── La traversée entière : corps HTTP → routeur → prompt → outils exposés ────


def _terminal_event(text: str) -> dict:
    events = [
        json.loads(block.strip()[len("data:") :].strip())
        for block in text.strip().split("\n\n")
        if block.strip().startswith("data:")
    ]
    return events[-1]


def _turn(client, monkeypatch, message: str) -> dict:
    captured: dict = {}

    async def _call(system, user, **kwargs):
        captured["system"] = system
        captured["kwargs"] = kwargs
        return ("réponse", [])

    monkeypatch.setattr("app.services.chat_orchestrator.run_chat_with_tools", _call)
    # L'API envoie TOUJOURS `connected_families` en production — ici, un espace
    # sans aucun connecteur : le cas le plus restrictif.
    res = client.post(
        "/chat/message",
        json={"message": message, "user_id": "user-1", "connected_families": []},
    )
    assert res.status_code == 200
    assert _terminal_event(res.text)["data"]["reply"] == "réponse"
    return captured


def _exposed(captured: dict) -> list[str]:
    return [str(tool["name"]) for tool in tools_for(captured["kwargs"]["connected_families"])]


def test_2721_la_question_dactualite_arrive_avec_web_search_expose_et_la_consigne(client, monkeypatch) -> None:
    captured = _turn(client, monkeypatch, NEWS_PHRASE)
    assert "web_search" in _exposed(captured)
    assert public_news_block(NEWS_PHRASE, "fr").strip() in captured["system"]


def test_2679_la_demande_de_comptes_arrive_avec_offer_reply_options_expose_et_la_consigne(client, monkeypatch) -> None:
    captured = _turn(client, monkeypatch, ACCOUNTS_PHRASE)
    assert REPLY_OPTIONS_TOOL_NAME in _exposed(captured)
    assert "find_accounts" in _exposed(captured)
    block = intent_route_block(route_chat_intent(message=ACCOUNTS_PHRASE), "fr").strip()
    assert block and block in captured["system"]


def test_le_temoin_un_bonjour_ne_porte_aucun_des_deux_blocs(client, monkeypatch) -> None:
    captured = _turn(client, monkeypatch, "Bonjour")
    assert public_news_block(NEWS_PHRASE, "fr").strip() not in captured["system"]
    assert "CE QUE LE SERVEUR A COMPRIS" not in captured["system"]
