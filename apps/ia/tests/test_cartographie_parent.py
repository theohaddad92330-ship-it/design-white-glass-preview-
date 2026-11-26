"""#2086.25 — DÉCISION Louis 17/09 : la carte entreprise de l'onboarding montre
« groupe ou filiale » APRÈS confirmation. `extract_subsidiaries` (cartographie.py)
ne rend que ce que la racine DÉTIENT ; il manquait le sens inverse — qui la
détient elle, ce qui fait d'elle une FILIALE — pour que « groupe ou filiale »
soit une phrase complète plutôt qu'une seule des deux moitiés.

`extract_parent_companies` réutilise EXACTEMENT le même graphe orienté
(``liens_entreprises_entreprises``, ``"holder-held"``) : pas de repli non
orienté ici (contrairement à `extract_subsidiaries`) — une société MÈRE
devinée sur un lien dont on ne connaît pas le sens serait un fait plus fort
qu'un périmètre de filiales, et donc une donnée fictive plus dangereuse à
inventer. Direction illisible ou absente → liste vide, jamais un parent deviné.
"""

from __future__ import annotations

from app.services.pappers.cartographie import extract_parent_companies
from app.services.pappers.models import CorporateGraph


def _graph(companies: list[tuple[str, str, str]], edges: list[str]) -> CorporateGraph:
    return CorporateGraph(
        entreprises=[{"id": i, "siren": s, "nom_entreprise": n} for i, s, n in companies],
        personnes=[],
        liens_entreprises_personnes=[],
        liens_entreprises_entreprises=edges,
    )


def test_rend_la_societe_qui_detient_la_racine() -> None:
    # e3 (ALPHABET) détient e1 (GOOGLE FRANCE) : GOOGLE FRANCE est une filiale.
    graph = _graph(
        [("e1", "443061841", "GOOGLE FRANCE"), ("e3", "987654321", "ALPHABET HOLDINGS")],
        ["e3-e1"],
    )
    assert {c.siren for c in extract_parent_companies(graph, "443061841")} == {"987654321"}


def test_une_tete_de_groupe_na_aucun_parent() -> None:
    # TF1 détient TF1 PUB : depuis TF1 (la racine), aucun lien entrant.
    graph = _graph(
        [("e1", "326300159", "TF1"), ("e2", "111111111", "TF1 PUB")],
        ["e1-e2"],
    )
    assert extract_parent_companies(graph, "326300159") == []


def test_aucune_arete_lisible_rend_une_liste_VIDE_jamais_un_parent_devine() -> None:
    # Contrairement à `extract_subsidiaries`, pas de repli non orienté : un
    # parent deviné sur un lien dont le sens est inconnu serait un fait plus
    # fort qu'une liste de filiales, donc plus dangereux à inventer.
    graph = _graph([("e1", "1", "A"), ("e2", "2", "B")], ["garbage"])
    assert extract_parent_companies(graph, "1") == []


def test_racine_absente_du_graphe_rend_une_liste_VIDE() -> None:
    graph = _graph([("e1", "1", "A"), ("e2", "2", "B")], ["e2-e1"])
    assert extract_parent_companies(graph, "999") == []
