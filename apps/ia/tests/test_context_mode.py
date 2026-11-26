"""#2453 — les modes de contexte canoniques bornent RÉELLEMENT ce que Laura lit.

Le NO-GO du retour : « le système affiche mode neutre mais continue d'utiliser
silencieusement les secteurs, références ou territoires habituels ». Ce fichier
tient la traversée entière : corps HTTP → pydantic → routeur → prompt système
ET ce que reçoivent les outils (`profile_data`), plus la base documentaire de
l'espace qu'on ne va même pas chercher. Chaque test sait dire NON : le même
corps en « Mon activité » (ou sans mode) porte bien le profil.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from app.models.chat import ChatRequest
from app.services.context_mode import (
    CONTEXT_LAYERS,
    CONTEXT_MODES,
    CONTEXT_PRECEDENCE,
    DEFAULT_CONTEXT_MODE,
    apply_context_mode,
    context_mode_block,
    excluded_layers_for,
)

_PROFILE = {"geoZone": "Zorglubie-Ouest", "sellerGoal": "Vendre du Zorglub"}
_PORTFOLIO = "Portefeuille : ZorgPortfolio SA (client)"
_CRM = "CRM : ZorgCRM opportunité ouverte"


def _terminal_event(text: str) -> dict:
    events = [
        json.loads(block.strip()[len("data:") :].strip())
        for block in text.strip().split("\n\n")
        if block.strip().startswith("data:")
    ]
    return events[-1]


def _body(**extra) -> dict:
    return {
        "message": "Quels comptes prioriser ?",
        "user_id": "user-1",
        "profile_data": _PROFILE,
        "accounts_summary": _PORTFOLIO,
        "crm_presence": _CRM,
        "workspace_role": "sales_ops",
        "pinned_facts": ["Toujours proposer du Zorglub"],
        "business_units": [
            {
                "name": "Agence Zorg",
                "territory": "Zorglubie",
                "specialties": [],
                "capacity": None,
                "quarter_objective": None,
                "account_count": None,
                "consultant_count": None,
                "reference_count": None,
            }
        ],
        **extra,
    }


@pytest.fixture
def captured(monkeypatch):
    seen: dict = {"rag_calls": 0}

    async def _call(system, user, **kwargs):
        seen["system"] = system
        seen["user"] = user
        seen["profile_data"] = kwargs.get("profile_data")
        return ("réponse", [])

    async def _rag(*args, **kwargs):
        seen["rag_calls"] += 1
        return ("", [], [])

    monkeypatch.setattr("app.services.chat_orchestrator.run_chat_with_tools", _call)
    monkeypatch.setattr("app.services.rag_knowledge.retrieve_reranked_citations", _rag)
    return seen


def test_neutral_mode_keeps_every_personal_layer_out_of_prompt_and_tools(client, captured):
    res = client.post("/chat/message", json=_body(context_mode="neutral"))
    assert res.status_code == 200
    system = captured["system"]
    for leaked in (
        "Zorglubie-Ouest",
        "Vendre du Zorglub",
        "ZorgPortfolio",
        "ZorgCRM",
        "Agence Zorg",
        "Toujours proposer",
    ):
        assert leaked not in system, leaked
    # Les outils ne reçoivent pas non plus le profil (classement « à ton image »).
    assert not captured["profile_data"]
    # La base documentaire de l'espace n'est même pas interrogée.
    assert captured["rag_calls"] == 0
    # #2453.9 / #2453.10 — la trace du tour le dit, couche par couche.
    trace = _terminal_event(res.text)["data"]["context"]["context_mode"]
    assert trace["mode"] == "neutral"
    assert trace["included_context_layers"] == []
    assert "profile" in trace["excluded_context_layers"]


def test_my_activity_mode_is_the_witness_that_says_no(client, captured):
    """Le témoin : même corps en « Mon activité » — le profil EST là."""
    res = client.post("/chat/message", json=_body(context_mode="my_activity"))
    assert res.status_code == 200
    system = captured["system"]
    assert "Zorglubie-Ouest" in system
    assert "ZorgPortfolio" in system
    assert captured["profile_data"] == _PROFILE
    assert captured["rag_calls"] == 1
    trace = _terminal_event(res.text)["data"]["context"]["context_mode"]
    assert trace["excluded_context_layers"] == []


def test_without_mode_the_prompt_carries_no_mode_block_and_no_trace(client, captured):
    """Appelant d'avant #2453 : aucun bloc, aucune trace, profil lu comme avant."""
    res = client.post("/chat/message", json=_body())
    assert res.status_code == 200
    assert "MODE DE CONTEXTE" not in captured["system"]
    assert "Zorglubie-Ouest" in captured["system"]
    assert "context_mode" not in _terminal_event(res.text)["data"]["context"]


def test_one_off_mission_drops_habitual_profile_but_keeps_selected_account_crm(client, captured):
    res = client.post("/chat/message", json=_body(context_mode="one_off_mission"))
    assert res.status_code == 200
    system = captured["system"]
    assert "Zorglubie-Ouest" not in system
    assert "ZorgPortfolio" not in system
    assert "Agence Zorg" not in system
    assert "ZorgCRM" in system
    assert "Mission ponctuelle" in system


def test_unknown_mode_is_refused_rather_than_guessed():
    with pytest.raises(ValueError):
        ChatRequest(message="x", user_id="u", context_mode="neutre")


def test_apply_context_mode_never_mutates_the_incoming_request():
    req = ChatRequest(**_body(context_mode="neutral"))
    narrowed, _trace = apply_context_mode(req)
    assert req.profile_data == _PROFILE
    assert narrowed.profile_data == {}


def test_neutral_mode_keeps_what_the_message_explicitly_states(client, captured):
    """#3853 (BEL-LAU-1008-002, recette prod 08/10, 2e passe) — volet Neutre non joué
    par la recette. `apply_context_mode` ne touche QUE les neuf couches habituelles
    (`CONTEXT_LAYERS`) — jamais le message lui-même : une zone et un secteur dits
    EXPLICITEMENT dans la demande ne peuvent donc pas disparaître silencieusement en
    Neutre, même si le profil habituel (zone/secteur différents) est bien exclu."""
    message = "Je cherche un point d'entrée Data chez un grand compte bancaire en Île-de-France."
    req = ChatRequest(**_body(context_mode="neutral", message=message))
    narrowed, _trace = apply_context_mode(req)
    # Le message — où vit la zone et le secteur dits explicitement — est intact.
    assert narrowed.message == message
    # Le profil HABITUEL (zone/secteur différents, posés dans _body) est bien exclu.
    assert narrowed.profile_data == {}
    assert narrowed.accounts_summary == ""

    res = client.post("/chat/message", json=_body(context_mode="neutral", message=message))
    assert res.status_code == 200
    # Le tour RÉEL (routeur → prompt) porte la demande telle quelle au modèle.
    assert message in captured["user"]
    assert "Zorglubie-Ouest" not in captured["user"]


def test_block_states_the_same_seven_level_hierarchy_for_every_mode():
    for mode in CONTEXT_MODES:
        block = context_mode_block(mode, "fr")
        assert "demande explicite" in block.lower()
        assert "exclusion" in block.lower()
        # #2453.3 — le profil ne réintroduit jamais une exclusion demandée.
        assert "jamais" in block.lower()
    assert context_mode_block("my_activity", "en").startswith("\n\nCONTEXT MODE")
    assert context_mode_block("", "fr") == ""


# ── Parité avec le contrat TS (source de vérité) ─────────────────────────────

_TS_REL = Path("packages/contracts/src/schemas/laura-context-mode.ts")


def _ts_source() -> str:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / _TS_REL
        if candidate.is_file():
            return candidate.read_text(encoding="utf-8")
    pytest.skip("monorepo absent (image de déploiement) — la parité se vérifie en CI")


def _ts_array(source: str, name: str) -> list[str]:
    match = re.search(rf"export const {name} = \[([\s\S]*?)\] as const", source)
    assert match, name
    return re.findall(r"'([a-z_]+)'", match.group(1))


def test_parity_with_the_typescript_contract():
    source = _ts_source()
    modes = _ts_array(source, "LAURA_CONTEXT_MODES")
    layers = _ts_array(source, "LAURA_CONTEXT_LAYERS")
    precedence = _ts_array(source, "CONTEXT_PRECEDENCE")
    # La garde prouve qu'elle LIT quelque chose avant de comparer.
    assert len(modes) == 3 and len(layers) >= 8 and len(precedence) == 7
    assert list(CONTEXT_MODES) == modes
    assert list(CONTEXT_LAYERS) == layers
    assert list(CONTEXT_PRECEDENCE) == precedence
    assert DEFAULT_CONTEXT_MODE == "my_activity"
    mission = re.search(r"one_off_mission: \[([^\]]*)\]", source)
    assert mission
    assert list(excluded_layers_for("one_off_mission")) == re.findall(r"'([a-z_]+)'", mission.group(1))
    assert list(excluded_layers_for("neutral")) == layers
    assert list(excluded_layers_for("my_activity")) == []
