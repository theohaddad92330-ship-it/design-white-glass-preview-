"""#3211 (LAU-FINAL-217) — MÉMOIRE D'OUTCOME AVANT RECOMMANDATION.

Retenu (1 point sur ~14 numérotés dans #3211) : `prepare_message_for_contact`
proposait une relance identique sans jamais regarder si ce contact avait déjà
reçu un message sur le MÊME canal. Exemple du corps de l'issue : Bernard a
reçu deux emails sans réponse, Laura en propose un troisième au lieu de
suggérer un autre canal ou une route via un collègue.

Ce lot vérifie seulement la PORTE (le refus d'une relance identique) :
- un message déjà SORTI (`sent`/`delivered`) sur ce canal, sans réponse ni
  rebond, et sans angle nouveau → refus, jamais une proposition ;
- un angle DIFFÉRENT de la dernière raison → la relance passe (raison
  nouvelle, exactement ce que demande l'issue) ;
- un autre CANAL → la relance passe (changer de canal reste possible) ;
- un message `replied`/`bounced`/`failed` → n'entre pas dans la porte (une
  réponse rouvre la conversation, un rebond n'est pas une relance identique) ;
- aucun historique → comportement d'avant ce lot, inchangé.

Les autres points numérotés de #3211 (apprentissage multi-canal, prise en
compte des collègues d'espace, `prepare_cold_call`/`schedule_reminder_for_contact`)
restent dans l'épopée de suivi — cette porte est la plus visible (celle que
l'exemple Bernard décrit) et la plus petite tranche APPELÉE de bout en bout.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.chat_tools import execute_chat_tool

_CONTACT = {
    "id": "11111111-1111-4111-8111-111111111111",
    "full_name": "Bernard Petit",
    "title": "DSI",
    "account_id": "22222222-2222-4222-8222-222222222222",
    "email": "bernard@example.com",
    # Requis par `prepare_cold_call` (organisation lue sur la fiche, jamais devinée) ;
    # sans effet sur `prepare_message_for_contact`, qui ne lit pas cette colonne.
    "entity": "Société Générale",
}


def _sb_that_forbids_writes() -> MagicMock:
    sb = MagicMock()

    def _explode(*_a, **_k):
        raise AssertionError("un outil de proposition ne doit JAMAIS écrire")

    table = MagicMock()
    table.insert.side_effect = _explode
    table.update.side_effect = _explode
    table.upsert.side_effect = _explode
    table.delete.side_effect = _explode
    # BEL-SC-235 (#3264.13) — `fetch_contact_stop` lit `contact_stops` avant toute
    # préparation : une lecture, qui doit rendre « aucun refus » (`data=None`).
    no_row = MagicMock()
    no_row.data = None
    table.select.return_value.eq.return_value.maybe_single.return_value.aexecute = AsyncMock(return_value=no_row)
    sb.table.return_value = table
    return sb


async def _run(tool_input: dict, *, recent_outreach: dict | None) -> dict:
    with (
        patch("app.services.supabase_client.get_supabase", return_value=_sb_that_forbids_writes()),
        patch("app.services.ownership.fetch_owned_contact", new_callable=AsyncMock, return_value=_CONTACT),
        patch(
            "app.services.ownership.fetch_recent_outreach_for_contact",
            new_callable=AsyncMock,
            return_value=recent_outreach,
        ),
    ):
        return await execute_chat_tool(
            "prepare_message_for_contact",
            {"contact_id": _CONTACT["id"], **tool_input},
            user_id="user-1",
            profile_data=None,
        )


@pytest.mark.asyncio
async def test_3211_1_sans_historique_la_proposition_passe() -> None:
    out = await _run({"channel": "email", "angle": "migration cloud"}, recent_outreach=None)
    assert out["status"] == "pending_confirmation"


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["sent", "delivered"])
async def test_3211_1_un_message_deja_sorti_sans_angle_nouveau_est_refuse(status: str) -> None:
    out = await _run(
        {"channel": "email"},
        recent_outreach={
            "id": "m-1",
            "channel": "email",
            "status": status,
            "reason": None,
            "created_at": "2026-09-10T09:00:00+00:00",
        },
    )
    assert "error" in out and "proposal" not in out
    assert "Bernard Petit" in out["error"]
    assert "email" in out["error"]


@pytest.mark.asyncio
async def test_3211_1_le_meme_angle_que_la_derniere_fois_est_une_relance_identique() -> None:
    out = await _run(
        {"channel": "email", "angle": "migration cloud"},
        recent_outreach={
            "id": "m-1",
            "channel": "email",
            "status": "sent",
            "reason": "Migration Cloud",
            "created_at": "2026-09-10T09:00:00+00:00",
        },
    )
    assert "error" in out and "proposal" not in out


@pytest.mark.asyncio
async def test_3211_1_un_angle_different_est_une_raison_nouvelle_la_relance_passe() -> None:
    out = await _run(
        {"channel": "email", "angle": "nouvelle levée de fonds"},
        recent_outreach={
            "id": "m-1",
            "channel": "email",
            "status": "sent",
            "reason": "migration cloud",
            "created_at": "2026-09-10T09:00:00+00:00",
        },
    )
    assert out["status"] == "pending_confirmation"
    assert out["proposal"]["angle"] == "nouvelle levée de fonds"


@pytest.mark.asyncio
async def test_3211_1_changer_de_canal_reste_possible() -> None:
    out = await _run(
        {"channel": "linkedin"},
        recent_outreach=None,  # la recherche est scopée au canal `linkedin` demandé, pas `email`
    )
    assert out["status"] == "pending_confirmation"


#
# Le filtrage `replied`/`bounced`/`failed`/`cancelled`/`expired` est de la
# responsabilité EXCLUSIVE de `fetch_recent_outreach_for_contact` (le SEUL
# filtre amont, même posture que `filterEligibleContacts` côté API) — vérifié
# dans `test_ownership.py`, pas ici : ce module fait confiance à ce que la
# couche de lecture lui rend.


# ─────────────────────────────────────────────────────────────────────────
# #3211.1 (extension, épopée #3234) — `prepare_cold_call` : même porte,
# canal `phone`, condition de doublon propre à cet outil (`reason` requis
# plutôt qu'`angle` libre).
# ─────────────────────────────────────────────────────────────────────────

_COLD_CALL_INPUT = {
    "reason": "point mensuel",
    "objective": "obtenir un rendez-vous",
    "opening_question": "Comment se passe le projet en ce moment ?",
    "next_questions": ["Qui décide ?", "Quel budget ?"],
    "objection": "Pas le temps",
    "fallback": "Proposer un créneau de 10 minutes",
    "expected_outcome": "Rendez-vous obtenu",
}


async def _run_cold_call(tool_input: dict, *, recent_outreach: dict | None) -> dict:
    with (
        patch("app.services.supabase_client.get_supabase", return_value=_sb_that_forbids_writes()),
        patch("app.services.ownership.fetch_owned_contact", new_callable=AsyncMock, return_value=_CONTACT),
        patch(
            "app.services.ownership.fetch_recent_outreach_for_contact",
            new_callable=AsyncMock,
            return_value=recent_outreach,
        ),
    ):
        return await execute_chat_tool(
            "prepare_cold_call",
            {"contact_id": _CONTACT["id"], **{**_COLD_CALL_INPUT, **tool_input}},
            user_id="user-1",
            profile_data=None,
        )


@pytest.mark.asyncio
async def test_3211_1_ext_cold_call_sans_historique_la_proposition_passe() -> None:
    out = await _run_cold_call({}, recent_outreach=None)
    assert out["status"] == "pending_confirmation"
    assert out["proposal"]["action"] == "prepare_cold_call"


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["sent", "delivered"])
async def test_3211_1_ext_cold_call_deja_appele_sans_raison_nouvelle_est_refuse(status: str) -> None:
    out = await _run_cold_call(
        {"reason": "point mensuel"},
        recent_outreach={
            "id": "m-1",
            "channel": "phone",
            "status": status,
            "reason": "Point mensuel",
            "created_at": "2026-09-10T09:00:00+00:00",
        },
    )
    assert "error" in out and "proposal" not in out
    assert "Bernard Petit" in out["error"]


@pytest.mark.asyncio
async def test_3211_1_ext_cold_call_une_raison_differente_passe() -> None:
    out = await _run_cold_call(
        {"reason": "nouvelle levée de fonds"},
        recent_outreach={
            "id": "m-1",
            "channel": "phone",
            "status": "sent",
            "reason": "point mensuel",
            "created_at": "2026-09-10T09:00:00+00:00",
        },
    )
    assert out["status"] == "pending_confirmation"


@pytest.mark.asyncio
async def test_3211_1_ext_cold_call_un_appel_avec_reponse_n_entre_pas_dans_la_porte() -> None:
    out = await _run_cold_call(
        {"reason": "point mensuel"},
        recent_outreach=None,  # `replied`/`bounced`/... est filtré en amont, voir test_ownership.py
    )
    assert out["status"] == "pending_confirmation"


# ─────────────────────────────────────────────────────────────────────────
# #3211.1 (extension, épopée #3234) et #3211.9 — `schedule_reminder_for_contact` :
# un rappel déjà PROGRAMMÉ (date future) sans note distincte n'est pas
# reprogrammé en silence ; un rappel déjà PASSÉ sans outcome tracé est NOMMÉ
# dans la proposition suivante plutôt que remplacé sans un mot.
# ─────────────────────────────────────────────────────────────────────────


async def _run_schedule_reminder(tool_input: dict, *, pending_reminder: dict | None) -> dict:
    with (
        patch("app.services.supabase_client.get_supabase", return_value=_sb_that_forbids_writes()),
        patch("app.services.ownership.fetch_owned_contact", new_callable=AsyncMock, return_value=_CONTACT),
        patch(
            "app.services.ownership.fetch_pending_reminder_for_contact",
            new_callable=AsyncMock,
            return_value=pending_reminder,
        ),
    ):
        return await execute_chat_tool(
            "schedule_reminder_for_contact",
            {"contact_id": _CONTACT["id"], "at": "2026-10-01T09:00:00+02:00", **tool_input},
            user_id="user-1",
            profile_data=None,
        )


@pytest.mark.asyncio
async def test_3211_1_ext_reminder_sans_historique_la_proposition_passe() -> None:
    out = await _run_schedule_reminder({"note": "Relancer après le comité"}, pending_reminder=None)
    assert out["status"] == "pending_confirmation"
    assert "overdue_previous_reminder" not in out["proposal"]


@pytest.mark.asyncio
async def test_3211_1_ext_reminder_deja_programme_sans_note_nouvelle_est_refuse() -> None:
    out = await _run_schedule_reminder(
        {"note": "Relancer après le comité"},
        pending_reminder={
            "id": "r-1",
            "remind_at": "2026-12-25T09:00:00Z",
            "note": "Relancer après le comité",
            "created_at": "2026-09-20T09:00:00Z",
        },
    )
    assert "error" in out and "proposal" not in out
    assert "Bernard Petit" in out["error"]


@pytest.mark.asyncio
async def test_3211_1_ext_reminder_deja_programme_avec_note_differente_passe() -> None:
    out = await _run_schedule_reminder(
        {"note": "Nouvelle raison : relance sur l'appel d'offres"},
        pending_reminder={
            "id": "r-1",
            "remind_at": "2026-12-25T09:00:00Z",
            "note": "Relancer après le comité",
            "created_at": "2026-09-20T09:00:00Z",
        },
    )
    assert out["status"] == "pending_confirmation"


@pytest.mark.asyncio
async def test_3211_9_reminder_passe_sans_outcome_est_nomme_pas_bloquant() -> None:
    out = await _run_schedule_reminder(
        {"note": "Nouveau rappel"},
        pending_reminder={
            "id": "r-1",
            "remind_at": "2026-01-01T09:00:00Z",  # passé, jamais résolu
            "note": "Ancien rappel",
            "created_at": "2025-12-20T09:00:00Z",
        },
    )
    assert out["status"] == "pending_confirmation"
    assert out["proposal"]["overdue_previous_reminder"] == {
        "at": "2026-01-01T09:00:00Z",
        "note": "Ancien rappel",
        "posed_by_colleague": False,
    }


# ─────────────────────────────────────────────────────────────────────────
# #3211.6 / #3211.12 (épopée #3234) — un message/rappel posé par un COLLÈGUE
# (autre `user_id`, désormais visible via `resolve_workspace_id` +
# `workspace_id`) bloque toujours, jamais effacé par un angle/une raison/une
# note nouvelle — à la différence de TA propre relance ci-dessus.
# ─────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_3211_6_message_envoye_par_un_collegue_bloque_meme_avec_angle_nouveau() -> None:
    out = await _run(
        {"channel": "email", "angle": "nouvelle levée de fonds"},
        recent_outreach={
            "id": "m-1",
            "user_id": "collegue-1",
            "channel": "email",
            "status": "sent",
            "reason": "migration cloud",
            "created_at": "2026-09-10T09:00:00+00:00",
        },
    )
    assert "error" in out and "proposal" not in out
    assert "collègue" in out["error"]


@pytest.mark.asyncio
async def test_3211_6_message_envoye_par_soi_meme_reste_effacable_par_angle_nouveau() -> None:
    """`user_id` PRÉSENT et ÉGAL au tien : c'est TA relance, la porte
    #3211.1 (waivable par angle nouveau) s'applique — pas la #3211.6."""
    out = await _run(
        {"channel": "email", "angle": "nouvelle levée de fonds"},
        recent_outreach={
            "id": "m-1",
            "user_id": "user-1",
            "channel": "email",
            "status": "sent",
            "reason": "migration cloud",
            "created_at": "2026-09-10T09:00:00+00:00",
        },
    )
    assert out["status"] == "pending_confirmation"


@pytest.mark.asyncio
async def test_3211_6_ext_cold_call_appele_par_un_collegue_bloque_meme_avec_raison_nouvelle() -> None:
    out = await _run_cold_call(
        {"reason": "nouvelle levée de fonds"},
        recent_outreach={
            "id": "m-1",
            "user_id": "collegue-1",
            "channel": "phone",
            "status": "sent",
            "reason": "point mensuel",
            "created_at": "2026-09-10T09:00:00+00:00",
        },
    )
    assert "error" in out and "proposal" not in out
    assert "collègue" in out["error"]


@pytest.mark.asyncio
async def test_3211_12_reminder_pose_par_un_collegue_bloque_meme_avec_note_differente() -> None:
    out = await _run_schedule_reminder(
        {"note": "Nouvelle raison"},
        pending_reminder={
            "id": "r-1",
            "user_id": "collegue-1",
            "remind_at": "2026-12-25T09:00:00Z",
            "note": "Relancer après le comité",
            "created_at": "2026-09-20T09:00:00Z",
        },
    )
    assert "error" in out and "proposal" not in out
    assert "collègue" in out["error"]


@pytest.mark.asyncio
async def test_3211_12_reminder_passe_pose_par_un_collegue_est_nomme() -> None:
    out = await _run_schedule_reminder(
        {"note": "Nouveau rappel"},
        pending_reminder={
            "id": "r-1",
            "user_id": "collegue-1",
            "remind_at": "2026-01-01T09:00:00Z",  # passé, jamais résolu
            "note": "Ancien rappel",
            "created_at": "2025-12-20T09:00:00Z",
        },
    )
    assert out["status"] == "pending_confirmation"
    assert out["proposal"]["overdue_previous_reminder"] == {
        "at": "2026-01-01T09:00:00Z",
        "note": "Ancien rappel",
        "posed_by_colleague": True,
    }
