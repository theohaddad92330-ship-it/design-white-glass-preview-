"""Deterministic title → IT decision-role (the deck's TECHNICAL role)."""

from __future__ import annotations

import pytest

from app.services.decision_role import (
    TECHNICAL_ROLE,
    classify_decision_role,
    is_governance,
    is_it_decider,
    is_out_of_scope,
    technical_role_for,
)


@pytest.mark.parametrize(
    "title",
    [
        "DSI",
        "DSI Groupe",
        "Directeur des Systèmes d'Information",
        "Directeur Informatique",
        "Directrice Informatique",
        "Directeur Technique",
        "Directeur Digital",
        "Directeur Numérique",
        "CTO",
        "Chief Technology Officer",
        "Chief Information Officer",
        "CIO",
        "RSSI",
        "Chief Information Security Officer",
        "CISO",
        "Head of IT",
        "Head of Engineering",
        "Head of Data",
        "VP Engineering",
        "Responsable Infrastructure",
        "Responsable des Systèmes d'Information",
    ],
)
def test_it_decider_titles_map_to_technical(title: str) -> None:
    assert is_it_decider(title), title
    assert technical_role_for(title) == TECHNICAL_ROLE


@pytest.mark.parametrize(
    "title",
    [
        "Directeur Général",
        "Président du Conseil d'Administration",
        "Directeur Financier",  # CFO → economic, NOT technical
        "Directeur des Achats",
        "Directeur Commercial",
        "Directeur des Ressources Humaines",
        "Responsable Marketing",
        "Secrétaire Général",
        "",
        None,
    ],
)
def test_non_it_titles_are_not_technical(title: str | None) -> None:
    assert not is_it_decider(title), title
    assert technical_role_for(title) is None


def test_case_insensitive() -> None:
    assert is_it_decider("directeur informatique")
    assert is_it_decider("HEAD OF ENGINEERING")


@pytest.mark.parametrize(
    ("title", "role"),
    [
        ("DSI Groupe", "technical"),
        ("CTO", "technical"),
        ("Directeur Financier", "economic"),
        ("CFO", "economic"),
        ("Directeur Administratif et Financier", "economic"),
        ("Directeur des Achats", "economic"),
        ("Directeur Commercial", "user"),
        ("Directrice Marketing", "user"),
        ("Directeur des Opérations", "user"),
        ("Head of Sales", "user"),
        ("Directeur Général", "champion"),
        ("Président-Directeur Général", "champion"),
        ("CEO", "champion"),
        ("Secrétaire Général", "champion"),
        ("Gérant", "champion"),
        # No rule → None (LLM role kept).
        ("Stagiaire", None),
        ("Chargé de mission", None),
        ("", None),
        (None, None),
    ],
)
def test_classify_decision_role(title: str | None, role: str | None) -> None:
    assert classify_decision_role(title) == role


@pytest.mark.parametrize(
    ("title", "role"),
    [
        # TECHNICAL — data / AI / analytics / architecture heads (250-titles doc).
        ("Head of Architecture", "technical"),
        ("Head of AI", "technical"),
        ("Head of Analytics", "technical"),
        ("Directeur Data", "technical"),
        ("Directeur Intelligence Artificielle", "technical"),
        ("Directeur des Études", "technical"),
        ("Responsable IT", "technical"),
        ("Responsable IT Operations", "technical"),
        # ECONOMIC — finance/procurement expansions.
        ("Contrôleur de Gestion", "economic"),
        ("Contrôle de gestion", "economic"),
        ("Financial Controller", "economic"),
        ("Directeur Comptable", "economic"),
        ("Credit Manager", "economic"),
        ("Responsable Trésorerie", "economic"),
        ("Directeur des Achats", "economic"),  # director = budget authority
        # PROCUREMENT — the achats gate (deck §7.7), distinct from economic.
        ("Chief Procurement Officer", "procurement"),
        ("Responsable Achats", "procurement"),
        ("Responsable des Achats Prestations", "procurement"),
        ("IT Procurement Manager", "procurement"),
        ("Procurement Manager", "procurement"),
        ("Vendor Manager", "procurement"),
        ("Supplier Manager", "procurement"),
        # USER — business-line / operations expansions.
        ("Directeur des Ventes", "user"),
        ("Directeur Industriel", "user"),
        ("Directeur d'usine", "user"),
        ("Directeur de site", "user"),
        ("Plant Manager", "user"),
        ("Directeur Supply Chain", "user"),
        ("Directeur e-Commerce", "user"),
        ("Business Unit Manager", "user"),
        ("CMO", "user"),
        # CHAMPION — top-exec / transformation expansions.
        ("COO", "champion"),
        ("Chief Operating Officer", "champion"),
        ("Directeur de la Transformation", "champion"),
        ("Country Manager", "champion"),
        ("Directeur Régional", "champion"),
    ],
)
def test_classify_expanded_titles(title: str, role: str) -> None:
    assert classify_decision_role(title) == role


@pytest.mark.parametrize(
    "title",
    [
        # A bare architect is a prescriber, NOT an IT decider — must not flip the
        # "≥1 décideur IT" gate (flagged conflict from the mapping doc).
        "Architecte d'Entreprise",
        "Architecte SI",
        "Architecte Cloud",
        "Solution Architect",
    ],
)
def test_architects_are_not_it_deciders(title: str) -> None:
    assert not is_it_decider(title), title
    assert classify_decision_role(title) != "technical"


@pytest.mark.parametrize(
    "title",
    ["Stagiaire", "Stagiaire DSI", "Alternant Data", "Apprenti Développeur", "IT Intern", "Work-study", "Trainee"],
)
def test_trainees_are_out_of_scope_and_never_technical(title: str) -> None:
    assert is_out_of_scope(title), title
    # The guard runs before is_it_decider, so "Stagiaire DSI" is NOT technical.
    assert classify_decision_role(title) is None


@pytest.mark.parametrize(
    "title",
    ["Auditeur interne", "Directeur International", "Contrôle interne", "DSI"],
)
def test_internal_international_are_not_trainees(title: str) -> None:
    assert not is_out_of_scope(title), title


def test_economic_beats_champion_for_dga_finances() -> None:
    # "DGA Finances" has both "DGA" (champion) and "Finances" (economic) →
    # economic wins (budget signal is the more useful one for an ESN).
    assert classify_decision_role("Directeur Général Adjoint Finances") == "economic"


@pytest.mark.parametrize(
    "title",
    [
        "Administrateur",
        "Membre du Conseil d'Administration",
        "Président du Conseil d'Administration",
        "Président du Conseil de Surveillance",
        "Board Member",
        "Non-Executive Director",
    ],
)
def test_governance_titles_are_never_forced_into_an_operational_role(title: str) -> None:
    # Board / administrateur = L0 gouvernance (annexe p12) : jamais economic /
    # champion par défaut. En particulier un "Président du conseil d'administration"
    # n'est plus mal étiqueté champion (il matchait `président` avant la garde).
    assert is_governance(title) is True
    assert classify_decision_role(title) is None


@pytest.mark.parametrize(
    "title",
    ["PDG", "Président-Directeur Général", "Gérant", "Directeur Général", "Président de TF1"],
)
def test_executive_presidents_are_not_governance_and_stay_champions(title: str) -> None:
    # An operating-company president / PDG / gérant is executive (champion), NOT a
    # board seat — the governance guard must not swallow them.
    assert is_governance(title) is False
    assert classify_decision_role(title) == "champion"


# ─────────────────────────────────────────────────────────────────────────────
# Retour Julien Laszlo (Aquila Data Enabler), 03/09/2026 — « sur Décathlon ou
# KNDS ça n'identifie pas les bons décideurs ».
#
# Mesuré avant correction : 24 intitulés IA/data sur 28 tombaient sous 10 points
# au pré-tri, contre 17-18 pour un DSI. La cause n'était pas un biais
# hiérarchique — « Head of AI » marquait déjà 17 — mais la FORME du lexique :
# français d'abord, et calqué sur les intitulés IT de 2020. Toute formulation
# anglaise (« Director of … », « VP … ») ou IA-native (« Chief AI Officer »,
# « Head of Machine Learning ») tombait à travers.
#
# Ces titres sont des décideurs IT au même titre qu'un DSI. Le lexique les
# nomme désormais ; ce qui relève du profil du VENDEUR est traité à part, par
# ``SellerContext`` dans ``contact_ranking`` — un lexique dit « ce poste décide
# de l'IT », pas « ce poste m'intéresse ».
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "title",
    [
        # C-level IA / data sous leurs sigles et formes longues.
        "Chief AI Officer",
        "Chief Artificial Intelligence Officer",
        "Chief Analytics Officer",
        "CAIO",
        "CDAO",
        # Formes anglaises « … of … » — absentes du lexique d'origine.
        "Director of AI",
        "Director of Data",
        "Head of Artificial Intelligence",
        "Head of Machine Learning",
        "Head of ML",
        "Head of GenAI",
        "Head of MLOps",
        "Head of Computer Vision",
        "Head of Data Science",
        # VP — seul « vp engineering » existait.
        "VP AI",
        "VP Data & AI",
        "VP Analytics",
        "VP Technology",
        # Formes françaises abrégées / non couvertes.
        "Directeur de l'IA",
        "Directrice de l'IA",
        "Responsable Data Science",
        "Responsable Intelligence Artificielle",
    ],
)
def test_ai_and_data_leadership_titles_are_it_deciders(title: str) -> None:
    assert is_it_decider(title), f"{title!r} devrait être reconnu comme décideur IT"


@pytest.mark.parametrize(
    "title",
    [
        # La garde doit savoir dire NON : ces titres citent data/IA mais ne
        # DÉCIDENT pas de l'IT. Les élargir aurait rendu malhonnête le drapeau
        # « ✓ décideur IT présent » affiché sur le dossier.
        "Data Entry Clerk",
        "Commercial Data Center",
        "Assistant Data Analyst",
        "Stagiaire Data Science",
        "Directeur Juridique",
        "Directeur Commercial",
        "Responsable Achats",
    ],
)
def test_non_deciders_citing_data_are_not_it_deciders(title: str) -> None:
    assert not is_it_decider(title), f"{title!r} ne devrait PAS compter comme décideur IT"


# #4324.1 — intitulés de terrain (retour client 21/10 : le DSI de chaque compte suivi).
@pytest.mark.parametrize(
    "title",
    [
        "Directeur IT",
        "Director, IT",
        "Information Systems Director",
        "Head of Information Systems",
        "Directeur Infrastructures et Production IT",
        "Directeur des Opérations IT",
        "Directeur Cybersécurité",
        "Responsable Cybersécurité",
        "Chief Digital & Information Officer",
        "DSIN",
        "Information Security Officer",
    ],
)
def test_field_it_titles_are_technical_4324_1(title: str) -> None:
    assert is_it_decider(title) is True


@pytest.mark.parametrize(
    "title",
    ["Chef de projet DSI", "Chargé de mission DSI", "Assistante de direction DSI", "Directeur Achats IT"],
)
def test_below_director_it_titles_are_not_deciders_4324_1(title: str) -> None:
    assert is_it_decider(title) is False


@pytest.mark.parametrize(
    "title",
    [
        "Directeur des Services Numériques",
        "Directrice des Systèmes Numériques",
        "DOSI",
        "Directeur Organisation et Systèmes d'Information",
        "Directeur des Technologies",
    ],
)
def test_plural_and_acronym_it_titles_are_technical_4324(title: str) -> None:
    """#4324 — « aucun DSI » dû aux intitulés : le pluriel (« numériques ») et le sigle DOSI ne rendent pas le titulaire absent."""
    assert is_it_decider(title) is True


def test_dsi_variants_do_not_leak_to_non_it_4324() -> None:
    assert is_it_decider("Directeur des Services Généraux") is False
    assert is_it_decider("Directeur Commercial") is False
