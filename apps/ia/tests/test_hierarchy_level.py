"""Deterministic title → hierarchy level (deck's 5 org tiers)."""

from __future__ import annotations

import pytest

from app.models.outputs.contacts import EnrichedContact
from app.services.hierarchy_level import HIERARCHY_LEVELS, classify_hierarchy_level


@pytest.mark.parametrize(
    ("title", "level"),
    [
        # C-Level / COMEX
        ("CEO", "c_level"),
        ("CFO", "c_level"),
        ("CTO", "c_level"),
        ("COO", "c_level"),
        ("Directeur Général", "c_level"),
        ("PDG", "c_level"),
        ("Président du Directoire", "c_level"),
        ("VP Engineering", "c_level"),
        ("Managing Director", "c_level"),
        ("Membre du COMEX", "c_level"),
        ("Directeur Associé", "c_level"),
        # Direction
        ("DSI Groupe", "direction"),
        ("Directeur Informatique", "direction"),
        ("Directrice Marketing", "direction"),
        ("Head of Data", "direction"),
        ("Director of Sales", "direction"),
        ("RSSI", "direction"),
        # Management
        ("Responsable Infrastructure", "management"),
        ("IT Manager", "management"),
        ("Chef de projet", "management"),
        ("Team Lead", "management"),
        # Expert / Senior
        ("Architecte SI", "expert"),
        ("Senior Developer", "expert"),
        ("Expert Cybersécurité", "expert"),
        ("Référent technique", "expert"),
        # Opérationnel (default)
        ("Data Analyst", "operationnel"),
        ("Ingénieur DevOps", "operationnel"),
        ("Développeur", "operationnel"),
        ("Chargé de mission", "operationnel"),
        # ⚠️ Rebasé le 25/08 (lot C du Recovery Pack) : l'ABSENCE de titre rendait
        # « operationnel », c'est-à-dire un rang AFFIRMÉ à la place d'une absence.
        # Les titres au-dessus restent opérationnels — c'est leur rang, pas un
        # trou de donnée — et c'est toute la distinction.
        ("", "unknown"),
        (None, "unknown"),
        ("   ", "unknown"),
        ("—", "unknown"),
        ("?", "unknown"),
    ],
)
def test_classify_hierarchy_level(title: str | None, level: str) -> None:
    assert classify_hierarchy_level(title) == level


def test_ordering_senior_manager_is_management() -> None:
    # Management is checked before Expert, so "Senior Manager" → management.
    assert classify_hierarchy_level("Senior Manager") == "management"


def test_hr_business_partner_is_not_c_level() -> None:
    # Bare "partner" must not promote an HRBP to the executive tier.
    assert classify_hierarchy_level("HR Business Partner") != "c_level"


def test_all_results_are_valid_levels() -> None:
    for t in ["CEO", "DSI", "Manager", "Architecte", "Analyste", ""]:
        assert classify_hierarchy_level(t) in HIERARCHY_LEVELS


def test_computed_field_present_and_aliased() -> None:
    c = EnrichedContact(fullName="Jane Doe", title="Directeur Général")
    dumped = c.model_dump(by_alias=True)
    assert dumped["hierarchyLevel"] == "c_level"
    # Even an empty contact yields a level (never missing on the front) — mais ce
    # niveau DIT qu'il ne sait pas, au lieu de ranger la personne tout en bas.
    assert EnrichedContact().model_dump(by_alias=True)["hierarchyLevel"] == "unknown"


@pytest.mark.parametrize(
    "title",
    [
        "Administrateur",
        "Administratrice",
        "Membre du Conseil d'Administration",
        "Président du Conseil d'Administration",
        "Président du Conseil de Surveillance",
        "Board Member",
        "Member of the Board",
        "Non-Executive Director",
        "Chairman",
        "Censeur",
    ],
)
def test_board_and_administrateur_are_governance_l0(title: str) -> None:
    # Annexe organigramme p7/p12 : le board / administrateur / conseil est L0
    # Gouvernance, un sponsor lointain — jamais confondu avec l'exécutif (L1).
    assert classify_hierarchy_level(title) == "governance"


@pytest.mark.parametrize(
    "title",
    [
        "PDG",  # executive president, not a board seat
        "Président-Directeur Général",
        "Président du Directoire",  # executive management board
        "Président de TF1",  # operating-company president
        "Membre du COMEX",  # executive committee, not the board of directors
        "Administrateur Systèmes et Réseaux",  # IT sysadmin, not a corporate mandate
        "Administrateur Base de Données",
        "Administrateur Salesforce",
    ],
)
def test_executive_and_it_admin_titles_are_not_governance(title: str) -> None:
    assert classify_hierarchy_level(title) != "governance"


def test_governance_is_the_most_senior_level() -> None:
    assert "governance" in HIERARCHY_LEVELS
    assert HIERARCHY_LEVELS[0] == "governance"


def test_unknown_is_last_and_is_not_a_rank() -> None:
    """``unknown`` est en FIN de tuple : ce n'est pas un palier, c'est l'absence
    de palier. L'y mettre au milieu ferait passer un tri « du plus haut au plus
    bas » par une valeur qui ne se compare à rien."""
    assert HIERARCHY_LEVELS[-1] == "unknown"
    assert "unknown" in HIERARCHY_LEVELS


@pytest.mark.parametrize(
    "title",
    ["Développeur", "Chargé de mission", "Data Analyst", "Technicien support"],
)
def test_a_present_but_unmatched_title_stays_operational(title: str) -> None:
    """La garde qui empêche ``unknown`` d'avaler le palier le plus peuplé.

    Ces titres ne déclenchent AUCUNE règle de séniorité, et c'est voulu : le rang
    opérationnel EST leur rang. Les basculer en « inconnu » ferait passer une
    classification juste pour un trou de donnée, et viderait le palier sur lequel
    reposent le pré-tri d'enrichissement et l'axe séniorité du score /100."""
    assert classify_hierarchy_level(title) == "operationnel"


# ── #4750 — intitulés de postes saisis librement ────────────────────────────


def test_a_typed_job_title_is_kept_as_typed_and_widened_by_its_known_variants() -> None:
    from app.services.hierarchy_level import expand_job_titles

    widened = expand_job_titles(["Product Owner"])
    assert widened[0] == "Product Owner"  # tel quel, en premier
    assert {"PO", "Product Manager", "Chef de produit"} <= set(widened)
    assert len(widened) == len({w.casefold() for w in widened})  # aucun doublon


def test_an_unknown_title_is_only_itself_and_blank_entries_are_dropped() -> None:
    from app.services.hierarchy_level import expand_job_titles

    assert expand_job_titles(["  Responsable bien-être ", "", "   "]) == ["Responsable bien-être"]


def test_a_title_matches_through_its_variants_and_never_through_a_protected_criterion() -> None:
    from app.services.hierarchy_level import title_matches_wanted

    assert title_matches_wanted("Product Manager Senior", ["Product Owner"]) is True
    assert title_matches_wanted("Directeur financier", ["Product Owner"]) is False
    assert title_matches_wanted("", ["Product Owner"]) is False
    # un critère protégé n'est jamais un intitulé cherché : ignoré, jamais appliqué
    assert expand_wanted_ignores_protected()


def expand_wanted_ignores_protected() -> bool:
    from app.services.hierarchy_level import expand_job_titles

    return expand_job_titles(["femme de moins de 30 ans", "Product Owner"])[0] == "Product Owner" and not any(
        "femme" in t.casefold() for t in expand_job_titles(["femme de moins de 30 ans", "Product Owner"])
    )
