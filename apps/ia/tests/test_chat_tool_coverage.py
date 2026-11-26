"""Aucun outil du catalogue ne reste sans exécuteur.

Le défaut que ce fichier empêche est celui qui a coûté le plus cher au dépôt :
une capacité DÉCLARÉE que rien ne sert. Un outil inscrit dans ``CHAT_TOOLS``
sans branche correspondante dans ``execute_chat_tool`` tombe dans le
``Outil inconnu`` final — le modèle l'appelle, reçoit une erreur, et le
copilote répond « je n'ai pas pu ». Rien ne le signale : le catalogue est
valide, le typage est muet (ce sont des dicts), et aucun test d'unité ne
parcourt la liste.

La vérification est faite SANS réseau : le pont interne n'est pas configuré
dans les tests, donc les outils de données répondent par un refus explicite,
et les outils de proposition par une validation d'arguments. Dans les deux
cas, le retour est un dict — jamais le message « Outil inconnu ».
"""

from __future__ import annotations

import asyncio

from app.services.chat_tools import (
    _DELIVERY_TOOLS,
    _SECOND_MARKET_TOOLS,
    CHAT_TOOLS,
    execute_chat_tool,
)


def _run(name: str) -> dict:
    return asyncio.run(execute_chat_tool(name, {}, user_id="11111111-1111-4111-8111-111111111111", profile_data=None))


def test_every_declared_tool_has_an_executor() -> None:
    unknown: list[str] = []
    for tool in CHAT_TOOLS:
        result = _run(tool["name"])
        assert isinstance(result, dict), tool["name"]
        if str(result.get("error", "")).startswith("Outil inconnu"):
            unknown.append(tool["name"])
    assert unknown == [], f"Outils déclarés sans exécuteur : {unknown}"


def test_tool_names_are_unique() -> None:
    # Deux entrées du même nom : la seconde est inatteignable, et le modèle voit
    # deux descriptions contradictoires pour un seul outil.
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert len(names) == len(set(names))


def test_data_tools_say_they_have_no_access_rather_than_returning_empty() -> None:
    """Sans pont interne configuré, un outil de données REFUSE.

    Rendre une liste vide se lirait « ton vivier est vide », « tu n'as aucun
    besoin ouvert » — c'est-à-dire une réponse fausse à une question qu'on n'a
    jamais pu poser.

    #2283.1 — la couverture restait plafonnée à 4 outils recopiés à la main,
    alors que la garantie porte en réalité sur DEUX familles entières
    (`_DELIVERY_TOOLS`, `_SECOND_MARKET_TOOLS` — hissées au niveau module dans
    ``chat_tools.py`` pour être parcourables ici). Ce test tient désormais la
    garantie sur l'ensemble déclaré, pas un échantillon.
    """
    for name in (*_DELIVERY_TOOLS, *_SECOND_MARKET_TOOLS):
        result = _run(name)
        assert "error" in result, name
        assert not any(isinstance(value, list) and value for value in result.values()), name


def test_matching_asks_for_the_need_before_ranking(monkeypatch) -> None:
    # Sans identifiant, un classement porterait sur un besoin choisi au hasard :
    # c'est exactement la raison pour laquelle le point d'entrée 4 avait été
    # refusé au chantier du PDF 4.
    #
    # Le pont est déclaré configuré ici pour dépasser le refus d'accès, qui vient
    # d'abord — et c'est le bon ordre : ne pas avoir accès prime sur un argument
    # manquant.
    from app.services import bellum_api

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    result = _run("run_matching")
    assert "error" in result
    assert "find_needs" in result["error"]
