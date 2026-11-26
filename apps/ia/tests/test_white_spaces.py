"""Zones blanches : entités du groupe CONNUES (SIREN) sans aucun signal d'achat =
opportunités vierges. Règle d'honnêteté : known + no signal → blanc ; sinon inconnu."""

from __future__ import annotations

import hashlib

from app.services.white_spaces import build_white_spaces, render_white_spaces_block

_MISSING = object()


def _siren_for(name: str) -> str:
    """Deterministic distinct SIREN per name so multi-entity tests don't collapse
    on the dedup-by-siren gate."""
    return str(int(hashlib.md5(name.encode()).hexdigest(), 16) % 10**9).zfill(9)


def _entity(name: str, *, siren: object = _MISSING, tier: str | None = "P2", **kw: object) -> dict:
    e = {"name": name, "siren": _siren_for(name) if siren is _MISSING else siren, "tier": tier, "getsPlay": True}
    e.update(kw)
    return e


def test_empty_on_no_entities() -> None:
    out = build_white_spaces(None)
    assert out["whiteSpaces"] == []
    assert out["coveredEntities"] == []
    assert out["unknownEntities"] == []


def test_known_entity_without_signal_is_white() -> None:
    out = build_white_spaces([_entity("Filiale Alpha", siren="111222333")])
    assert len(out["whiteSpaces"]) == 1
    w = out["whiteSpaces"][0]
    assert w["name"] == "Filiale Alpha"
    assert w["siren"] == "111222333"
    assert "vierge" in w["reason"]
    assert out["summary"]["whiteSpaces"] == 1


def test_entity_with_awarded_contract_is_covered_not_white() -> None:
    out = build_white_spaces(
        [_entity("Crédit du Nord")],
        awarded_contracts=[{"buyer": "CREDIT DU NORD", "winner": "Capgemini"}],
    )
    assert out["whiteSpaces"] == []
    assert len(out["coveredEntities"]) == 1
    assert out["coveredEntities"][0]["signal"] == "marché IT attribué"  # #4074 revient sur #2291.3 (18/09), délibérément — décision Louis 12/10 : aucune source ne se nomme.


def test_entity_matched_by_tender_or_job_or_press() -> None:
    ent = [_entity("Filiale Tender"), _entity("Filiale Job"), _entity("Filiale Presse")]
    out = build_white_spaces(
        ent,
        tenders=[{"buyer": "Filiale Tender"}],
        job_signals=[{"title": "Ingénieur DevOps chez Filiale Job", "location": "Lyon"}],
        recent_signals=[{"title": "Filiale Presse lance un plan de transformation"}],
    )
    signals = {c["name"]: c["signal"] for c in out["coveredEntities"]}
    assert signals["Filiale Tender"] == "appel d'offres IT"
    assert signals["Filiale Job"] == "recrutement IT"
    assert signals["Filiale Presse"] == "signal presse / budget"
    assert out["whiteSpaces"] == []


def test_entity_without_siren_is_unknown_not_white() -> None:
    """Règle Théo : sans SIREN on ne peut pas confirmer l'entité → inconnu, PAS blanc."""
    out = build_white_spaces([_entity("Marque Sans Siren", siren=None)])
    assert out["whiteSpaces"] == []
    assert len(out["unknownEntities"]) == 1
    assert "inconnue" in out["unknownEntities"][0]["reason"]


def test_head_of_group_is_skipped_even_when_the_llm_decorates_its_name() -> None:
    """La tête de groupe n'est jamais une zone blanche (le compte a toujours de la
    couverture). Le LLM l'écrit « EDF SA (maison mère) » — la comparaison brute au
    nom du compte échouait et la rendait « blanche »."""
    out = build_white_spaces(
        [_entity("EDF SA (maison mère)", siren="552081317", tier="P1")], target_company="EDF"
    )
    assert out["whiteSpaces"] == []
    assert out["unknownEntities"] == []
    assert out["summary"]["knownEntities"] == 0


# ── Troisième état : l'entité interne n'est pas un échec de confirmation ────
def test_internal_unit_is_its_own_bucket_not_an_unknown() -> None:
    """Une direction / un CSIRT n'aura JAMAIS de SIREN, par définition. Le compter
    comme « non confirmé » est trompeur : c'est un état distinct."""
    out = build_white_spaces(
        [_entity("DSIT (Direction des Systèmes d'Information et Télécoms) Groupe EDF", siren=None)]
    )
    assert out["whiteSpaces"] == []
    assert out["unknownEntities"] == []
    assert len(out["internalEntities"]) == 1
    reason = out["internalEntities"][0]["reason"]
    assert "interne" in reason.lower()
    assert "pas de personne morale" in reason.lower()
    assert out["summary"]["internal"] == 1
    assert out["summary"]["unknown"] == 0


def test_unresolved_legal_entity_keeps_its_exact_reason() -> None:
    """Une personne morale non rattachée garde la raison EXACTE portée par l'étape
    de résolution (homonymie vs absence), pas un « non confirmée » à tout faire."""
    out = build_white_spaces(
        [
            _entity(
                "Groupe Martin",
                siren=None,
                sirenReason="homonymie non tranchée (4 candidats au registre) — non rattachée",
            )
        ]
    )
    assert len(out["unknownEntities"]) == 1
    assert "homonymie" in out["unknownEntities"][0]["reason"]


def test_resolved_entity_becomes_a_white_space() -> None:
    """Le but du correctif : une entité que le registre sait résoudre cesse d'être
    « inconnue » et redevient une zone blanche calculable."""
    out = build_white_spaces([_entity("Enedis", siren="444608442")])
    assert [w["name"] for w in out["whiteSpaces"]] == ["Enedis"]
    assert out["summary"]["knownEntities"] == 1


def test_noise_entities_excluded_from_white_spaces() -> None:
    """Le bruit (SCI/holdings, getsPlay=False) n'est pas une opportunité vierge."""
    out = build_white_spaces([_entity("SCI Du Groupe", getsPlay=False)])
    assert out["whiteSpaces"] == []
    assert out["coveredEntities"] == []
    assert out["unknownEntities"] == []


def test_target_company_itself_never_white() -> None:
    out = build_white_spaces(
        [_entity("Société Générale", siren="552120222")],
        target_company="Société Générale",
    )
    assert out["whiteSpaces"] == []
    assert out["coveredEntities"] == []


def test_no_invention_only_known_entities_reported() -> None:
    """Aucune entité inventée : la sortie ne contient QUE les entités fournies."""
    out = build_white_spaces(
        [_entity("Filiale A", siren="1"), _entity("Filiale B")],
        awarded_contracts=[{"buyer": "Filiale B", "winner": "Atos"}],
    )
    names = {w["name"] for w in out["whiteSpaces"]} | {c["name"] for c in out["coveredEntities"]}
    assert names == {"Filiale A", "Filiale B"}


def test_dedup_by_siren_then_name() -> None:
    out = build_white_spaces([_entity("Filiale X", siren="9"), _entity("FILIALE X", siren="9")])
    assert len(out["whiteSpaces"]) == 1


def test_white_spaces_sorted_by_tier() -> None:
    out = build_white_spaces(
        [
            _entity("Z-Filiale P1", siren="1", tier="P1"),
            _entity("A-Filiale P3", siren="2", tier="P3"),
            _entity("M-Filiale P1", siren="3", tier="P1"),
        ]
    )
    # P1 avant P3 ; à tier égal, ordre alpha
    assert [w["tier"] for w in out["whiteSpaces"]] == ["P1", "P1", "P3"]
    assert [w["name"] for w in out["whiteSpaces"][:2]] == ["M-Filiale P1", "Z-Filiale P1"]


def test_deterministic_output() -> None:
    ents = [_entity("Filiale A", siren="1"), _entity("Filiale B", siren="2")]
    assert build_white_spaces(list(ents)) == build_white_spaces(list(ents))


# ── render block ──────────────────────────────────────────────────────────────


def test_render_empty_without_white_spaces() -> None:
    assert render_white_spaces_block(build_white_spaces([])) == ""
    assert render_white_spaces_block(None) == ""
    assert render_white_spaces_block({"whiteSpaces": []}) == ""


def test_render_lists_white_spaces_and_ouverture_directive() -> None:
    out = build_white_spaces([_entity("Filiale Vierge", siren="1", tier="P1")])
    block = render_white_spaces_block(out)
    assert "ZONES BLANCHES" in block
    assert "Filiale Vierge" in block
    assert "[P1]" in block
    assert "OUVERTURE" in block
