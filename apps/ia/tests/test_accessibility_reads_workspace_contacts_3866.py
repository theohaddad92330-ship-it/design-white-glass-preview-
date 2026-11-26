"""#3866 (recette R26) — l'accessibilité ne dit plus « aucun interlocuteur identifié » quand l'espace
a DÉJÀ des contacts sur le compte : l'évaluation lit les contacts de l'espace, pas seulement l'analyse."""

from __future__ import annotations

from app.services.account_score_axes import compute_axes
from app.services.account_suitability import with_workspace_contacts


def _access(analysis: dict) -> dict:
    return next(a for a in compute_axes(analysis, {})["axes"] if a["axis"] == "accessibility")


def test_workspace_contacts_fill_an_analysis_without_contacts() -> None:
    reading = {"contacts": [{"full_name": "A", "email": "a@x.fr"}, {"full_name": "B", "phone": "06"}]}
    merged = with_workspace_contacts({"recentSignals": []}, reading)
    axis = _access(merged)
    assert axis["points"] > 0
    assert "Aucun interlocuteur" not in axis["evidence"]
    assert "recentSignals" in merged


def test_analysis_contacts_win_and_input_is_not_mutated() -> None:
    analysis = {"contacts": [{"email": "k@x.fr"}]}
    merged = with_workspace_contacts(analysis, {"contacts": [{"email": "z@x.fr"}, {"email": "y@x.fr"}]})
    assert merged["contacts"] == [{"email": "k@x.fr"}]
    assert with_workspace_contacts({}, None) == {}
    assert "contacts" not in with_workspace_contacts({}, {"contacts": []})
