"""Le périmètre d'un compte s'arrête à SES filiales, pas à la galaxie du groupe.

Restitution TF1 : l'onglet Sites annonçait « 79 entités actionnables » où
figuraient BOUYGUES, BOUYGUES TELECOM et COLAS — la maison mère de TF1 et ses
filiales-SŒURS, qui n'ont rien à voir avec une approche commerciale de TF1.

`extract_subsidiaries` renvoyait « tous les voisins du graphe distincts de la
racine », sans lire la direction des liens. Les liens de la cartographie Pappers
sont pourtant orientés — ``"e3-e1"`` = e3 détient e1 — ce que la réponse Google
de la suite montre noir sur blanc : ALPHABET HOLDINGS pointe vers GOOGLE FRANCE.
"""

from __future__ import annotations

from app.services.pappers.cartographie import extract_group_affiliation, extract_subsidiaries
from app.services.pappers.models import CorporateGraph


def _graph(companies: list[tuple[str, str, str]], edges: list[str]) -> CorporateGraph:
    return CorporateGraph(
        entreprises=[{"id": i, "siren": s, "nom_entreprise": n} for i, s, n in companies],
        personnes=[],
        liens_entreprises_personnes=[],
        liens_entreprises_entreprises=edges,
    )


def test_keeps_the_subsidiary_and_drops_the_parent() -> None:
    # e3 (ALPHABET) détient e1 (GOOGLE FRANCE) qui détient e2 (GOOGLE CLOUD).
    graph = _graph(
        [("e1", "443061841", "GOOGLE FRANCE"), ("e2", "123456789", "GOOGLE CLOUD FRANCE"), ("e3", "987654321", "ALPHABET HOLDINGS")],
        ["e1-e2", "e3-e1"],
    )
    assert {c.siren for c in extract_subsidiaries(graph, "443061841")} == {"123456789"}


def test_drops_the_sister_companies_of_the_parent() -> None:
    # Le cas TF1 : BOUYGUES détient TF1, BOUYGUES TELECOM et COLAS. Depuis TF1,
    # ni la mère ni les sœurs ne sont dans le périmètre — seule TF1 PUB l'est.
    graph = _graph(
        [
            ("e1", "326300159", "TF1"),
            ("e2", "111111111", "TF1 PUB"),
            ("e3", "222222222", "BOUYGUES"),
            ("e4", "333333333", "BOUYGUES TELECOM"),
            ("e5", "444444444", "COLAS"),
        ],
        ["e3-e1", "e1-e2", "e3-e4", "e3-e5"],
    )
    assert {c.siren for c in extract_subsidiaries(graph, "326300159")} == {"111111111"}


def test_keeps_grandchildren() -> None:
    graph = _graph(
        [("e1", "1", "MERE"), ("e2", "2", "FILLE"), ("e3", "3", "PETITE-FILLE")],
        ["e1-e2", "e2-e3"],
    )
    assert {c.siren for c in extract_subsidiaries(graph, "1")} == {"2", "3"}


def test_aucun_lien_entre_entreprises_rend_un_perimetre_VIDE() -> None:
    """Le cas SNCF du 11/08/2026, et le seul endroit où le vide est la réponse.

    La cartographie contient aussi les sociétés atteintes par les autres mandats
    des PERSONNES du conseil. Quand il n'existe AUCUNE arête entreprise→
    entreprise, les voisins ne sont reliés à la racine que par des
    administrateurs communs. Le dossier listait ainsi une marque de
    prêt-à-porter et un réseau de coiffure parmi les « filiales » de SNCF.

    Un administrateur partagé n'est pas un lien capitalistique : périmètre vide.
    """
    graph = _graph([("e1", "1", "SNCF"), ("e2", "2", "UNE MARQUE DE PRÊT-À-PORTER")], [])
    assert extract_subsidiaries(graph, "1") == []


def test_des_aretes_illisibles_ne_font_PAS_disparaitre_le_perimetre() -> None:
    # Nuance qui compte : des arêtes existent mais aucune ne se lit. C'est un
    # défaut de lecture chez nous, pas une absence de lien — on ne punit pas le
    # dossier pour ça.
    graph = _graph([("e1", "1", "A"), ("e2", "2", "B")], ["garbage", "e1_e2"])
    assert {c.siren for c in extract_subsidiaries(graph, "1")} == {"2"}


def test_lit_les_aretes_rendues_en_PAIRES_et_pas_seulement_en_chaine() -> None:
    """La forme réelle de la réponse, et la cause racine du dossier SNCF.

    Ce module a été écrit sur ``"e3-e1"``. Une réponse réelle porte
    ``["e2", "e1"]`` : aucune arête n'était reconnue, l'orientation n'était
    jamais lue, et le repli « tous les voisins » rendait 83 « filiales ».
    """
    graph = _graph(
        [("e1", "1", "MERE"), ("e2", "2", "FILLE"), ("e3", "3", "SOEUR DE LA MERE")],
        [["e1", "e2"], ["e3", "e1"]],
    )
    assert {c.siren for c in extract_subsidiaries(graph, "1")} == {"2"}


def test_les_deux_formes_d_arete_cohabitent() -> None:
    graph = _graph(
        [("e1", "1", "MERE"), ("e2", "2", "FILLE"), ("e3", "3", "PETITE-FILLE")],
        ["e1-e2", ["e2", "e3"]],
    )
    assert {c.siren for c in extract_subsidiaries(graph, "1")} == {"2", "3"}


def test_falls_back_when_the_root_has_no_descendant() -> None:
    # La racine est une feuille (elle n'a qu'un parent) : plutôt que de rendre
    # une liste vide, on retombe sur les voisins — une hypothèse de direction
    # erronée ne doit jamais faire disparaître le graphe.
    graph = _graph([("e1", "1", "FILLE"), ("e2", "2", "MERE")], ["e2-e1"])
    assert {c.siren for c in extract_subsidiaries(graph, "1")} == {"2"}


def test_unknown_root_falls_back() -> None:
    graph = _graph([("e1", "1", "A"), ("e2", "2", "B")], ["e1-e2"])
    assert {c.siren for c in extract_subsidiaries(graph, "999")} == {"1", "2"}


# ── #2165.24 / #2166.3 / #2165.16 — extract_group_affiliation ──────────────


def test_tf1_est_filiale_de_bouygues_pas_de_ses_soeurs() -> None:
    # Même graphe que le cas TF1 : BOUYGUES (e3) détient TF1 (e1), TF1 PUB
    # (e2, via TF1), BOUYGUES TELECOM (e4) et COLAS (e5). Depuis TF1, la tête
    # de groupe est BOUYGUES — pas TF1 PUB, ni une sœur.
    graph = _graph(
        [
            ("e1", "326300159", "TF1"),
            ("e2", "111111111", "TF1 PUB"),
            ("e3", "222222222", "BOUYGUES"),
            ("e4", "333333333", "BOUYGUES TELECOM"),
            ("e5", "444444444", "COLAS"),
        ],
        ["e3-e1", "e1-e2", "e3-e4", "e3-e5"],
    )
    affiliation = extract_group_affiliation(graph, "326300159")
    assert affiliation is not None
    assert affiliation.role == "filiale"
    assert affiliation.head_siren == "222222222"
    assert affiliation.head_name == "BOUYGUES"


def test_bouygues_est_la_tete_de_groupe() -> None:
    graph = _graph(
        [
            ("e1", "326300159", "TF1"),
            ("e3", "222222222", "BOUYGUES"),
            ("e4", "333333333", "BOUYGUES TELECOM"),
        ],
        ["e3-e1", "e3-e4"],
    )
    affiliation = extract_group_affiliation(graph, "222222222")
    assert affiliation is not None
    assert affiliation.role == "groupe"
    assert affiliation.head_siren == "222222222"


def test_google_france_remonte_jusqu_a_alphabet_pas_juste_son_holder_direct() -> None:
    # e3 (ALPHABET) détient e1 (GOOGLE FRANCE) qui détient e2 (GOOGLE CLOUD) —
    # depuis GOOGLE CLOUD, la tête est ALPHABET, pas GOOGLE FRANCE.
    graph = _graph(
        [
            ("e1", "443061841", "GOOGLE FRANCE"),
            ("e2", "123456789", "GOOGLE CLOUD FRANCE"),
            ("e3", "987654321", "ALPHABET HOLDINGS"),
        ],
        ["e1-e2", "e3-e1"],
    )
    affiliation = extract_group_affiliation(graph, "123456789")
    assert affiliation is not None
    assert affiliation.role == "filiale"
    assert affiliation.head_siren == "987654321"
    assert affiliation.head_name == "ALPHABET HOLDINGS"


def test_aucun_lien_entre_entreprises_rend_aucune_affiliation() -> None:
    # Le cas SNCF : aucune arête entreprise→entreprise, seulement des mandats
    # de personnes. Un administrateur partagé n'est pas un lien capitalistique.
    graph = _graph([("e1", "1", "SNCF"), ("e2", "2", "UNE MARQUE DE PRÊT-À-PORTER")], [])
    assert extract_group_affiliation(graph, "1") is None


def test_societe_isolee_sans_filiale_ni_holder_nest_ni_groupe_ni_filiale() -> None:
    # Deux sociétés reliées entre elles, mais la racine interrogée (e3) n'a
    # aucune arête du tout : ni détentrice, ni détenue.
    graph = _graph(
        [("e1", "1", "A"), ("e2", "2", "B"), ("e3", "3", "ISOLEE")],
        ["e1-e2"],
    )
    assert extract_group_affiliation(graph, "3") is None


def test_aretes_illisibles_ne_permettent_pas_de_deviner_un_role() -> None:
    graph = _graph([("e1", "1", "A"), ("e2", "2", "B")], ["garbage", "e1_e2"])
    assert extract_group_affiliation(graph, "1") is None


def test_racine_absente_du_graphe_rend_aucune_affiliation() -> None:
    graph = _graph([("e1", "1", "A"), ("e2", "2", "B")], ["e1-e2"])
    assert extract_group_affiliation(graph, "999") is None
