"""#3226 (#3202.6) — « la possibilité d'un partenariat » parmi les huit
dimensions de l'archétype d'entreprise. `target_is_partnership_candidate` est
un booléen DISTINCT de `account_archetype` (`sales_context.ACCOUNT_ARCHETYPES`,
une taille/secteur) : voir `is_partnership_candidate_archetype` dans
`company_archetype_playbook.py`.
"""

from __future__ import annotations

from app.services.action_recommender import recommend_next_actions


def _ids(**kwargs: object) -> list[str]:
    return [a["id"] for a in recommend_next_actions(**kwargs)]  # type: ignore[arg-type]


def test_partenaire_potentiel_ajoute_la_co_traitance() -> None:
    ids = _ids(verdict="GO", relationship_state="froid", target_is_partnership_candidate=True)
    assert "co_traitance" in ids


def test_temoin_sans_signal_de_partenariat_rien_ne_change() -> None:
    with_signal = _ids(verdict="GO", relationship_state="froid", target_is_partnership_candidate=True)
    without_signal = _ids(verdict="GO", relationship_state="froid", target_is_partnership_candidate=False)
    default = _ids(verdict="GO", relationship_state="froid")
    assert without_signal == default
    assert with_signal != without_signal


def test_la_relation_reste_lue_en_tete_meme_avec_un_signal_de_partenariat() -> None:
    """HIÉRARCHIE ASSUMÉE (même règle que pour `account_archetype`, voir
    `test_action_archetype.py`) : le partenariat ne déloge jamais l'action que
    la relation impose en premier."""
    without = recommend_next_actions(verdict="GO", relationship_state="client_actif")
    with_signal = recommend_next_actions(
        verdict="GO", relationship_state="client_actif", target_is_partnership_candidate=True
    )
    assert with_signal[0]["id"] == without[0]["id"]


def test_le_pourquoi_cite_le_ticket() -> None:
    actions = recommend_next_actions(verdict="GO", relationship_state="froid", target_is_partnership_candidate=True)
    co_traitance = next(a for a in actions if a["id"] == "co_traitance")
    assert "3202.6" in co_traitance["why"]
