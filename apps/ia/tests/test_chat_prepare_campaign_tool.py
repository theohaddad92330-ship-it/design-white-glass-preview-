"""#1903.10 / #1935 — LAURA SAIT PRÉPARER UNE CAMPAGNE, PAS SEULEMENT LA LIRE.

Avant ce lot : 0 outil sur 54 ne préparait une séquence
(`test_copilote_scenario_corpus.py` l'assertait explicitement pour la
catégorie CREER_UNE_SEQUENCE). `prepare_campaign` ferme ce trou en restant
dans la même famille que les autres outils de proposition de ce fichier :

  1. il est exposé au modèle, dans `WRITE_TOOL_NAMES` ;
  2. son exécution renvoie une PROPOSITION (`pending_confirmation`), jamais un
     effet — aucune séquence n'est créée ici, le clic ouvre Séquences déjà
     pré-rempli et c'est CET écran qui écrit, contact par contact ;
  3. l'audience n'est jamais inventée : un `contact_id` halluciné ou d'un
     autre espace est EXCLU et NOMMÉ, jamais transformé en ligne de la
     proposition ;
  4. il SAIT DIRE NON : aucun contact exploitable => refus explicite, pas une
     campagne vide.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

_DSI = {
    "id": "11111111-1111-4111-8111-111111111111",
    "full_name": "Claire Dubois",
    "title": "DSI",
    "account_id": "aaaaaaaa-1111-4111-8111-111111111111",
    "email": "claire@example.com",
    "phone": None,
    "excluded_at": None,
}
_CTO = {
    "id": "22222222-2222-4222-8222-222222222222",
    "full_name": "Marc Petit",
    "title": "DSI",
    "account_id": "aaaaaaaa-1111-4111-8111-111111111111",
    "email": None,
    "phone": "+33600000000",
    "excluded_at": None,
}
_EXCLUDED = {
    "id": "33333333-3333-4333-8333-333333333333",
    "full_name": "Ancien Contact",
    "title": "Achats",
    "account_id": "aaaaaaaa-1111-4111-8111-111111111111",
    "email": "ancien@example.com",
    "phone": None,
    "excluded_at": "2026-01-01T00:00:00Z",
}
_NO_CHANNEL = {
    "id": "44444444-4444-4444-8444-444444444444",
    "full_name": "Sans Coordonnée",
    "title": "Achats",
    "account_id": "aaaaaaaa-1111-4111-8111-111111111111",
    "email": None,
    "phone": None,
    "excluded_at": None,
}


def _sb_that_forbids_writes() -> MagicMock:
    sb = MagicMock()

    def _explode(*_a, **_k):
        raise AssertionError("prepare_campaign ne doit JAMAIS écrire")

    table = MagicMock()
    table.insert.side_effect = _explode
    table.update.side_effect = _explode
    table.upsert.side_effect = _explode
    table.delete.side_effect = _explode
    sb.table.return_value = table
    return sb


def _patch_contacts(by_id: dict[str, dict]):
    async def _fake(_sb, contact_id, _user_id, columns="*"):  # noqa: ANN001
        contact = by_id.get(contact_id)
        if contact is None:
            raise HTTPException(status_code=404, detail="Contact not found")
        return contact

    return (
        patch("app.services.supabase_client.get_supabase", return_value=_sb_that_forbids_writes()),
        patch("app.services.ownership.fetch_owned_contact", side_effect=_fake),
        patch("app.services.chat_tools._owned_account_dossiers", new_callable=AsyncMock, return_value=[]),
    )


async def _run(tool_input: dict, by_id: dict[str, dict]) -> dict:
    sb_patch, owned_patch, dossiers_patch = _patch_contacts(by_id)
    with sb_patch, owned_patch, dossiers_patch:
        return await execute_chat_tool("prepare_campaign", tool_input, user_id="user-1", profile_data=None)


# ── 1. Registre ─────────────────────────────────────────────────────────────


def test_registry_exposes_prepare_campaign_tool():
    names = {t["name"] for t in CHAT_TOOLS}
    assert "prepare_campaign" in names
    assert "prepare_campaign" in WRITE_TOOL_NAMES


def test_description_announces_the_confirmation_step_and_no_write():
    tool = next(t for t in CHAT_TOOLS if t["name"] == "prepare_campaign")
    assert "valid" in tool["description"].lower()
    assert any(negation in tool["description"] for negation in ("n'écrit", "n'exécute", "aucune séquence"))
    assert tool["input_schema"]["required"] == ["contact_ids", "objective"]


# ── 2. Refus (elle sait dire NON) ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_refuses_without_objective():
    out = await _run({"contact_ids": [_DSI["id"]], "objective": ""}, {_DSI["id"]: _DSI})
    assert "error" in out and "proposal" not in out


@pytest.mark.asyncio
async def test_refuses_without_any_contact_id():
    out = await _run({"contact_ids": [], "objective": "Relancer les DSI industrie"}, {})
    assert "error" in out and "proposal" not in out


@pytest.mark.asyncio
async def test_refuses_when_no_contact_is_usable():
    """Le cas central : une audience entière écartée ou sans coordonnée ne
    devient JAMAIS une campagne — c'est une liste vide, pas une proposition."""
    out = await _run(
        {"contact_ids": [_EXCLUDED["id"], _NO_CHANNEL["id"]], "objective": "Relancer"},
        {_EXCLUDED["id"]: _EXCLUDED, _NO_CHANNEL["id"]: _NO_CHANNEL},
    )
    assert "error" in out and "proposal" not in out
    assert "Ancien Contact" in out["error"]
    assert "Sans Coordonnée" in out["error"]


@pytest.mark.asyncio
async def test_unowned_or_hallucinated_contact_is_excluded_not_invented():
    out = await _run(
        {"contact_ids": [_DSI["id"], "ffffffff-0000-4000-8000-000000000000"], "objective": "Relancer"},
        {_DSI["id"]: _DSI},
    )
    proposal = out["proposal"]
    ids_in_proposal = {c["contact_id"] for c in proposal["contacts"]}
    assert "ffffffff-0000-4000-8000-000000000000" not in ids_in_proposal
    assert any(e["contact_id"] == "ffffffff-0000-4000-8000-000000000000" for e in proposal["excluded"])


# ── 3. La proposition, correcte et jamais une écriture ──────────────────────


@pytest.mark.asyncio
async def test_returns_a_pending_proposal_and_writes_nothing():
    out = await _run(
        {"contact_ids": [_DSI["id"], _CTO["id"]], "objective": "Relancer les DSI industrie sur le cloud souverain"},
        {_DSI["id"]: _DSI, _CTO["id"]: _CTO},
    )
    assert out["status"] == "pending_confirmation"
    proposal = out["proposal"]
    assert proposal["action"] == "prepare_campaign"
    assert proposal["objective"] == "Relancer les DSI industrie sur le cloud souverain"
    assert proposal["cost_credits"] == 0
    assert {c["contact_id"] for c in proposal["contacts"]} == {_DSI["id"], _CTO["id"]}
    # Le contact SANS e-mail mais AVEC téléphone reste exploitable — deux
    # coordonnées, une seule suffit à ne pas être une audience fantôme.
    cto_row = next(c for c in proposal["contacts"] if c["contact_id"] == _CTO["id"])
    assert cto_row["has_phone"] is True
    assert cto_row["has_email"] is False


@pytest.mark.asyncio
async def test_persona_is_derived_from_the_majority_title_when_not_given():
    out = await _run(
        {"contact_ids": [_DSI["id"], _CTO["id"]], "objective": "Relancer"},
        {_DSI["id"]: _DSI, _CTO["id"]: _CTO},
    )
    proposal = out["proposal"]
    # Les deux contacts sont DSI : le persona déduit se voit ET se dit dérivé.
    assert proposal["persona"] == "DSI"
    assert proposal["persona_derived"] is True


@pytest.mark.asyncio
async def test_explicit_persona_overrides_the_derivation():
    out = await _run(
        {"contact_ids": [_DSI["id"]], "objective": "Relancer", "persona": "Directeur des Achats"},
        {_DSI["id"]: _DSI},
    )
    proposal = out["proposal"]
    assert proposal["persona"] == "Directeur des Achats"
    assert proposal["persona_derived"] is False


@pytest.mark.asyncio
async def test_relation_tone_channels_and_mode_pass_through_declared_values():
    out = await _run(
        {
            "contact_ids": [_DSI["id"]],
            "objective": "Relancer",
            "relation": "cold",
            "tone": "direct",
            "channels": ["email", "linkedin"],
            "mode": "nurturing",
        },
        {_DSI["id"]: _DSI},
    )
    proposal = out["proposal"]
    assert proposal["relation"] == "cold"
    assert proposal["tone"] == "direct"
    assert proposal["channels"] == ["email", "linkedin"]
    assert proposal["mode"] == "nurturing"


@pytest.mark.asyncio
async def test_relation_never_guessed_when_not_declared():
    """La relation DOIT être déclarée par l'utilisateur, jamais devinée —
    l'absence de champ reste une absence, pas un défaut « froid »."""
    out = await _run({"contact_ids": [_DSI["id"]], "objective": "Relancer"}, {_DSI["id"]: _DSI})
    assert "relation" not in out["proposal"]


@pytest.mark.asyncio
async def test_default_channel_is_email_and_default_mode_is_outreach():
    out = await _run({"contact_ids": [_DSI["id"]], "objective": "Relancer"}, {_DSI["id"]: _DSI})
    proposal = out["proposal"]
    assert proposal["channels"] == ["email"]
    assert proposal["mode"] == "outreach"


@pytest.mark.asyncio
async def test_nurturing_mode_defaults_to_the_nurturing_template_when_not_declared():
    """#2374.4/.21 — le mode `nurturing` doit PILOTER une cadence distincte
    (réduite : J0/J+30/J+60, `OUTREACH_SEQUENCE_TEMPLATES.nurturing`), pas
    seulement se déclarer sans effet. Sans `template` explicite, l'écran
    Séquences ne doit plus retomber sur le gabarit `prospection_3_touches`
    (3 touches en 10 jours) pour une relation qu'on entretient légèrement."""
    out = await _run(
        {"contact_ids": [_DSI["id"]], "objective": "Garder le lien", "mode": "nurturing"},
        {_DSI["id"]: _DSI},
    )
    assert out["proposal"]["template"] == "nurturing"


@pytest.mark.asyncio
async def test_explicit_template_overrides_the_nurturing_default():
    """Le gabarit déclaré par l'utilisateur ou le modèle reste prioritaire —
    le défaut par mode ne s'applique que quand rien n'a été choisi."""
    out = await _run(
        {
            "contact_ids": [_DSI["id"]],
            "objective": "Garder le lien",
            "mode": "nurturing",
            "template": "light_sequence",
        },
        {_DSI["id"]: _DSI},
    )
    assert out["proposal"]["template"] == "light_sequence"


@pytest.mark.asyncio
async def test_outreach_mode_keeps_no_default_template():
    """Le mode `outreach` (défaut) ne force aucun gabarit — l'utilisateur
    choisit librement sur l'écran Séquences, comme avant."""
    out = await _run({"contact_ids": [_DSI["id"]], "objective": "Relancer"}, {_DSI["id"]: _DSI})
    assert "template" not in out["proposal"]


# ── 4. #2367.16 — les 6 dimensions du contrat d'intention encore anonymes ───
# (nombre, urgence, niveau d'autonomie, résultat attendu, durée, besoin de
# connecteur) rejoignent objectif/audience/canal/relation/mode déjà nommés.
# Même règle que `relation` : un champ absent reste absent, jamais deviné.


@pytest.mark.asyncio
async def test_named_dimensions_pass_through_when_declared():
    out = await _run(
        {
            "contact_ids": [_DSI["id"]],
            "objective": "Relancer",
            "expected_count": 50,
            "urgency": "cette semaine",
            "autonomy_level": "valider chaque étape",
            "expected_outcome": "obtenir un rendez-vous",
            "duration": "deux semaines",
            "needs_connector": True,
        },
        {_DSI["id"]: _DSI},
    )
    proposal = out["proposal"]
    assert proposal["expected_count"] == 50
    assert proposal["urgency"] == "cette semaine"
    assert proposal["autonomy_level"] == "valider chaque étape"
    assert proposal["expected_outcome"] == "obtenir un rendez-vous"
    assert proposal["duration"] == "deux semaines"
    assert proposal["needs_connector"] is True


@pytest.mark.asyncio
async def test_named_dimensions_never_guessed_when_not_declared():
    out = await _run({"contact_ids": [_DSI["id"]], "objective": "Relancer"}, {_DSI["id"]: _DSI})
    proposal = out["proposal"]
    for field in (
        "expected_count",
        "urgency",
        "autonomy_level",
        "expected_outcome",
        "duration",
        "needs_connector",
    ):
        assert field not in proposal
