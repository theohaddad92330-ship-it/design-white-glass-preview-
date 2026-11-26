"""Dé-siloter du IT — phase 4 (the REMAINING deterministic services), Drive #9.

Phase 3 generalised ``prioritization`` (the "IT arm = auto-P1" boost) and the
``entities`` *badge* (``filiale_strategique``). Phase 4 tackles the highest-risk
lever left: the **relevance override** in ``entities.classify_entity_relevance``
— the ``is_it_entity`` / NAF-62 signal that force-keeps an entity as prime
relevance against every noise / out-of-sector / no-go rule. It gates the whole
downstream pipeline (a dropped entity gets no contacts / angles / plan / message),
so it feeds the current IT-ESN customer too.

Guiding principle (unchanged from phase 3): **IT-preserving generalisation**.
- IT-services ESN profile  → historical behaviour, BYTE-IDENTICAL;
- no profile at all        → historical behaviour, BYTE-IDENTICAL;
- genuinely non-IT ESN      → the IT-specific thumb-on-the-scale is dropped.

No env flag — profile-driven, always-on, IT-default-safe (``it_esn`` defaults
``True``). This suite proves the byte-identity of the IT / no-profile path AND
that a non-IT ESN demonstrably shifts the relevance signal for an IT-named or
IT-NAF entity that would otherwise be noise/out-of-sector.

Left for a later increment (see the module's report): ``decision_role`` /
``contact_ranking`` — their call site (``classification.py``) receives the TARGET
company's ``raw_analysis`` as ``profile_data`` in the on-demand path, NOT the
ESN's own profile, so threading the ESN domain needs an API↔IA contract change.
That regression lock lives in ``test_desilo_phase3_deterministic.py``.
"""

from __future__ import annotations

from app.services.entities import (
    annotate_entity_relevance,
    classify_entity_relevance,
    classify_subsidiary,
    partition_subsidiaries,
)
from app.services.insee_sirene import is_it_naf
from app.services.it_entity import is_it_entity

# ── Representative entity corpus (name, naf) — mixes IT-named, IT-NAF, noise,
# out-of-sector, plain-operating so the byte-identity proof is broad, not a
# single happy-path case.
_CORPUS: list[tuple[str, str | None]] = [
    ("Euro-Information", None),  # IT name → operating via override
    ("GIE Informatique", None),  # IT name AND GIE noise → override wins
    ("Foncière Saint-Georges", "6201Z"),  # non-IT name, IT NAF → override wins
    ("SCI Saint-Pères", None),  # legal-vehicle noise
    ("Big Retail Bank", None),  # plain operating
    ("Les Moulins du Togo", None),  # out-of-sector (agro) + foreign
    ("Société Générale SFH", None),  # finance arm — operating by design
    ("2009 KOALA FINANCE", None),  # SPV → noise
]


# ── IT / no-profile path is BYTE-IDENTICAL (it_esn defaults True) ─────────────


def test_classify_entity_relevance_default_is_it_esn_true():
    """The parameter default IS the historical IT behaviour — every corpus entry
    is identical whether it_esn is omitted or explicitly True."""
    for name, naf in _CORPUS:
        assert classify_entity_relevance(name, naf) == classify_entity_relevance(name, naf, it_esn=True)


def test_classify_entity_relevance_it_override_preserved_for_it_esn():
    """The IT override still force-keeps IT-named / IT-NAF entities for an IT ESN."""
    assert classify_entity_relevance("GIE Informatique", it_esn=True) == ("operating", "")
    assert classify_entity_relevance("Foncière Saint-Georges", "6201Z", it_esn=True) == ("operating", "")
    # And the plain noise / out-of-sector verdicts are untouched.
    assert classify_entity_relevance("SCI Saint-Pères", it_esn=True)[0] == "noise"


def test_classify_subsidiary_default_byte_identical():
    for name, _naf in _CORPUS:
        assert classify_subsidiary(name) == classify_subsidiary(name, it_esn=True)


def test_annotate_entity_relevance_default_byte_identical():
    for name, naf in _CORPUS:
        entity = {"name": name, "nafCode": naf} if naf else {"name": name}
        assert annotate_entity_relevance(entity) == annotate_entity_relevance(entity, it_esn=True)


def test_annotate_entity_relevance_is_it_flag_override_preserved_for_it_esn():
    """An INSEE-NAF-flagged (isItEntity) entity stays force-operating + strategic
    for an IT ESN — byte-identical to the historical hard override."""
    entity = {"name": "Foncière Saint-Georges", "isItEntity": True, "nafCode": "6201Z"}
    out = annotate_entity_relevance(entity, it_esn=True)
    assert out["relevance"] == "operating"
    assert out["getsPlay"] is True
    assert out["type"] == "filiale_strategique"
    assert annotate_entity_relevance(entity) == out  # default == it_esn=True


def test_partition_subsidiaries_default_byte_identical():
    subs = [{"name": n, "siren": str(i)} for i, (n, _naf) in enumerate(_CORPUS)]
    assert partition_subsidiaries(subs) == partition_subsidiaries(subs, it_esn=True)


# ── A non-IT ESN demonstrably SHIFTS the relevance signal ─────────────────────


def test_non_it_esn_drops_it_name_override():
    """"GIE Informatique": IT-named → operating for an IT ESN (override), but for a
    non-IT ESN the override is withheld → it reads as GIE noise."""
    assert classify_entity_relevance("GIE Informatique", it_esn=True) == ("operating", "")
    rel, _reason = classify_entity_relevance("GIE Informatique", it_esn=False)
    assert rel == "noise"


def test_non_it_esn_drops_it_naf_override():
    """The NAF-62 lever in isolation: a non-IT NAME with an IT NAF is force-kept
    for an IT ESN, but for a non-IT ESN the real-estate noise verdict stands."""
    assert not is_it_entity("Foncière Saint-Georges")  # name alone is NOT IT
    assert is_it_naf("6201Z")  # the factual NAF signal is intact
    assert classify_entity_relevance("Foncière Saint-Georges", "6201Z", it_esn=True) == ("operating", "")
    rel, _reason = classify_entity_relevance("Foncière Saint-Georges", "6201Z", it_esn=False)
    assert rel == "noise"


def test_non_it_esn_shift_via_annotate_hard_override():
    """An isItEntity-flagged (INSEE NAF-62) entity whose NAME is noise: force-kept
    + strategic for an IT ESN, demoted to noise/bruit (no play) for a non-IT ESN."""
    entity = {"name": "Foncière Saint-Georges", "isItEntity": True, "nafCode": "6201Z"}
    it = annotate_entity_relevance(entity, it_esn=True)
    non_it = annotate_entity_relevance(entity, it_esn=False)
    assert (it["relevance"], it["getsPlay"], it["type"]) == ("operating", True, "filiale_strategique")
    assert non_it["relevance"] == "noise"
    assert non_it["getsPlay"] is False
    assert non_it["type"] == "bruit"
    # The factual IT tag on the input is never mutated away.
    assert entity["isItEntity"] is True


def test_non_it_esn_shift_via_partition():
    """The corporate-graph entry point: an IT-named GIE node is operating for an IT
    ESN, noise for a non-IT ESN — but its factual isItEntity tag is preserved."""
    subs = [{"name": "GIE Informatique", "siren": "42"}]
    it_part = partition_subsidiaries(subs, it_esn=True)
    non_it_part = partition_subsidiaries(subs, it_esn=False)
    it = {e["name"]: e for e in it_part["annotated"]}
    non_it = {e["name"]: e for e in non_it_part["annotated"]}
    assert it["GIE Informatique"]["relevance"] == "operating"
    assert non_it["GIE Informatique"]["relevance"] == "noise"
    assert non_it["GIE Informatique"]["actionable"] is False
    # For a non-IT ESN the IT GIE drops out of the sellable ("meaningful") set.
    assert it_part["summary"]["meaningful"] == 1
    assert non_it_part["summary"]["meaningful"] == 0
    # Factual IT detection is unchanged — only the relevance verdict shifts.
    assert it["GIE Informatique"]["isItEntity"] is non_it["GIE Informatique"]["isItEntity"] is True


def test_non_it_esn_leaves_non_it_entities_untouched():
    """Sanity: the non-IT arm only touches IT-signal entities. A plain operating
    filiale, a plain SCI, an SPV keep the same verdict under both arms."""
    for name in ("Big Retail Bank", "SCI Saint-Pères", "2009 KOALA FINANCE"):
        assert classify_entity_relevance(name, it_esn=True) == classify_entity_relevance(name, it_esn=False)


# ── The shared factual primitives stay untouched (tasks 2 & 3) ────────────────


def test_is_it_entity_primitive_unchanged():
    # Factual "is this the IT arm" — profile-independent, no it_esn param.
    assert is_it_entity("GIE Informatique") is True
    assert is_it_entity("Foncière Saint-Georges") is False


def test_is_it_naf_primitive_unchanged():
    # Factual registry signal — the domain decision moved to the entities.py
    # caller (gated on it_esn), the NAF fact itself is untouched.
    assert is_it_naf("6201Z") is True
    assert is_it_naf("6311Z") is True
    assert is_it_naf("4120A") is False
