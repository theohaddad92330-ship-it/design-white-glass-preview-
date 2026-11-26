"""#4923.14 — rappel des rôles de tête : le banc voit Head of Data / Achats / DSI.

Retour Julien Laszlo 30/10 : L'Oréal, Decathlon, AXA ne remontaient ni Head of Data,
ni Directeur Achats, ni DSI groupe. Le banc mesure désormais, par compte de
référence, la part des familles de tête ATTENDUES dont une tête est trouvée.

Tenu ici : dire NON (une tête perdue nomme compte et famille), ne pas crier au
loup (zéro contact = non évaluable, GA-18/GA-19), refuser de passer à vide, et
le seuil est fixé AVANT de mesurer.
"""

from __future__ import annotations

from app.eval.golden import Golden, list_goldens, resolve_analysis
from app.eval.head_recall import (
    HEAD_RECALL_THRESHOLD,
    HEAD_TARGET_KEY,
    NAMED_WITHOUT_REFERENCE,
    account_head_recall,
    check_head_recall,
)


def _golden(floor: list[str], target: list[str]) -> Golden:
    return Golden(
        slug="t", company="Test", expect={"headRoles": floor, HEAD_TARGET_KEY: target}, fixture=None
    )


def _analysis(*titles: str) -> dict:
    return {"contacts": [{"fullName": f"P{i}", "title": t} for i, t in enumerate(titles)]}


def test_threshold_is_fixed_before_measuring() -> None:
    # 2 familles de tête sur 3 (data, achats, dsi) — posé avant la première mesure.
    assert abs(HEAD_RECALL_THRESHOLD - 2 / 3) < 1e-9


def test_recall_counts_families_whose_head_was_found() -> None:
    g = _golden([], ["data", "achats", "dsi"])
    r = account_head_recall(g, _analysis("Head of Data", "Directeur des Achats", "MLOps Engineer"))
    assert r.found == ("data", "achats")
    assert r.missing == ("dsi",)
    assert r.recall() is not None and abs(r.recall() - 2 / 3) < 1e-3


def test_a_contributor_is_not_a_head() -> None:
    g = _golden([], ["data"])
    r = account_head_recall(g, _analysis("MLOps Engineer", "Data Engineer"))
    assert r.found == () and r.missing == ("data",)


def test_floor_loss_says_no_and_names_account_and_family() -> None:
    g = _golden(["data"], [])
    v = check_head_recall([(g, _analysis("MLOps Engineer"))])
    assert not v.passed()
    assert any("Test" in p and "data" in p for p in v.problems)


def test_no_contact_is_unevaluable_not_zero() -> None:
    g = _golden(["data"], ["data", "achats"])
    r = account_head_recall(g, {"contacts": []})
    assert r.recall() is None
    assert r.lost == ()
    assert r.unevaluable == ("data", "achats")


def test_empty_corpus_does_not_pass_silently() -> None:
    v = check_head_recall([])
    assert not v.passed()


def test_below_threshold_is_reported_not_enforced_by_default() -> None:
    g = _golden([], ["data", "achats", "dsi"])
    pairs = [(g, _analysis("Head of Data"))]
    soft = check_head_recall(pairs)
    assert soft.below_threshold == ("t",) and soft.passed()
    hard = check_head_recall(pairs, enforce_threshold=True)
    assert not hard.passed()


def test_unknown_family_is_named() -> None:
    v = check_head_recall([(_golden([], ["datta"]), _analysis("Head of Data"))])
    assert any("datta" in p for p in v.problems)


def test_reads_the_committed_goldens_and_names_the_account_without_reference() -> None:
    pairs = [(g, resolve_analysis(g)) for g in list_goldens()]
    v = check_head_recall(pairs)
    assert v.passed(), v.problems
    assert v.accounts_read == len(pairs) > 0
    assert "loreal" in NAMED_WITHOUT_REFERENCE
    by_slug = {a.slug: a for a in v.accounts}
    for slug in ("axa", "decathlon"):
        assert by_slug[slug].target, f"{slug} doit déclarer {HEAD_TARGET_KEY}"


def test_rubric_contacts_loses_a_head_the_model_dropped() -> None:
    import json

    from app.eval.bench.rubrics import contacts as rubric

    given = [
        {"fullName": "Ana Martin", "title": "Head of Data"},
        {"fullName": "Luc Petit", "title": "Responsable Paie"},
    ]
    prompt = "CONTACTS: " + json.dumps(given, ensure_ascii=False)
    dropped = rubric.score({"contacts": [{"fullName": "Luc Petit", "title": "Responsable Paie"}]}, user_prompt=prompt)
    kept = rubric.score({"contacts": given}, user_prompt=prompt)
    axis = {a.name: a for a in dropped.axes}.get("tetes_conservees")
    assert axis is not None and axis.ratio == 0.0
    assert {a.name: a for a in kept.axes}["tetes_conservees"].ratio == 1.0
