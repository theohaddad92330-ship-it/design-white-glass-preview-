"""Outils d'ÉCRITURE du Copilote — proposés, jamais exécutés sans validation.

Le rapport V2 demande que le copilote puisse « générer un message, créer un
rappel ». La règle produit interdit qu'un chat écrive ou débite tout seul : ces
deux outils PRÉPARENT l'action (résolution d'appartenance + libellé exact de ce
qui sera fait) et rendent la main à l'utilisateur, qui exécute au clic.

Ce que ces tests verrouillent :
  1. les deux outils sont exposés au modèle ;
  2. leur exécution renvoie une PROPOSITION (`pending_confirmation`), jamais un
     effet — la double Supabase fait exploser tout `insert/update/upsert/delete` ;
  3. l'appartenance est re-résolue côté serveur : un id inventé par le modèle ne
     produit aucune proposition ;
  4. flag éteint = chemin `/chat/message` inchangé (aucun outil, aucune
     proposition).
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool


def _terminal_event(text: str) -> dict:
    """`/chat/message` diffuse en SSE (LOT STREAM) — le dernier événement porte
    la MÊME forme que l'ancien corps JSON de cet endpoint."""
    events = [
        json.loads(block.strip()[len("data:") :].strip())
        for block in text.strip().split("\n\n")
        if block.strip().startswith("data:")
    ]
    return events[-1]


_CONTACT = {
    "id": "11111111-1111-4111-8111-111111111111",
    "full_name": "Claire Dubois",
    "title": "DSI",
    "account_id": "22222222-2222-4222-8222-222222222222",
    "email": "claire@example.com",
}


def _sb_that_forbids_writes() -> MagicMock:
    """Supabase double dont toute écriture lève : si un outil « proposition »
    écrivait, le test casserait au lieu de passer en silence."""
    sb = MagicMock()

    def _explode(*_a, **_k):
        raise AssertionError("un outil de proposition ne doit JAMAIS écrire")

    table = MagicMock()
    table.insert.side_effect = _explode
    table.update.side_effect = _explode
    table.upsert.side_effect = _explode
    table.delete.side_effect = _explode
    # BEL-SC-235 (#3264.13) — `fetch_contact_stop` lit désormais `contact_stops`
    # via ce double avant toute préparation de message : une lecture, jamais
    # une écriture, mais elle doit rendre `data=None` (« aucun refus ») plutôt
    # que planter sur un MagicMock non-awaitable.
    no_row = MagicMock()
    no_row.data = None
    table.select.return_value.eq.return_value.maybe_single.return_value.aexecute = AsyncMock(return_value=no_row)
    sb.table.return_value = table
    return sb


def _patch_owned_contact(contact=_CONTACT):
    return (
        patch("app.services.supabase_client.get_supabase", return_value=_sb_that_forbids_writes()),
        patch("app.services.ownership.fetch_owned_contact", new_callable=AsyncMock, return_value=contact),
    )


async def _run(
    name: str,
    tool_input: dict,
    contact=_CONTACT,
    *,
    person_timezone: str | None = None,
    workspace_timezone: str | None = None,
) -> dict:
    sb_patch, owned_patch = _patch_owned_contact(contact)
    with sb_patch, owned_patch:
        return await execute_chat_tool(
            name,
            tool_input,
            user_id="user-1",
            profile_data=None,
            person_timezone=person_timezone,
            workspace_timezone=workspace_timezone,
        )


# ── 1. Registre ─────────────────────────────────────────────────────────────


def test_registry_exposes_the_two_write_tools():
    names = {t["name"] for t in CHAT_TOOLS}
    assert "prepare_message_for_contact" in names
    assert "schedule_reminder_for_contact" in names
    # Les outils lecture seule d'origine sont toujours là (ajout ADDITIF).
    assert {"compare_accounts", "get_account_briefing"} <= names
    # Les 3 outils d'action de la §14 (enrichir / CRM / chercher) rejoignent la
    # même famille : proposés, jamais exécutés (cf. test_chat_action_tools.py).
    assert {"prepare_message_for_contact", "schedule_reminder_for_contact"} <= WRITE_TOOL_NAMES


def test_write_tool_descriptions_announce_the_confirmation_step():
    """Le modèle doit savoir qu'il PROPOSE : sans ça il annonce à l'utilisateur
    un envoi qui n'a pas eu lieu."""
    for tool in CHAT_TOOLS:
        if tool["name"] in WRITE_TOOL_NAMES:
            assert "valid" in tool["description"].lower()  # « validation » / « valide »
            assert any(negation in tool["description"] for negation in ("n'envoie", "n'exécute", "n'écrit"))


# ── 1 bis. #1995 — créer la fiche d'une personne connue du seul CRM ─────────


_ACCOUNT_DOSSIER = {"account_id": "22222222-2222-4222-8222-222222222222", "company_name": "THALES"}


def _patch_owned_account(dossiers=(_ACCOUNT_DOSSIER,)):
    """Le compte possédé, résolu server-side. Liste vide = compte étranger (ou
    halluciné) : l'outil doit refuser, pas proposer."""
    return (
        patch("app.services.supabase_client.get_supabase", return_value=_sb_that_forbids_writes()),
        patch(
            "app.services.chat_tools._owned_account_dossiers",
            new_callable=AsyncMock,
            return_value=list(dossiers),
        ),
    )


def test_create_contact_from_crm_is_registered_and_takes_no_contact_id():
    """La fiche n'existe PAS encore : exiger un `contact_id` rendrait l'outil
    inutilisable exactement dans le cas qu'il corrige."""
    tool = next(t for t in CHAT_TOOLS if t["name"] == "create_contact_from_crm_presence")
    assert tool["name"] in WRITE_TOOL_NAMES
    assert "contact_id" not in tool["input_schema"]["properties"]
    assert tool["input_schema"]["required"] == ["full_name", "account_id"]
    # Le modèle doit savoir QUAND s'en servir : le marqueur exact du contexte.
    assert "fiche Bellum absente" in tool["description"]
    # #2876 (#2433.6) — le MÊME outil sert de porte quand la source est une
    # capture d'écran CRM jointe, jamais une écriture directe depuis l'image.
    assert "CAPTURE D'ÉCRAN DE CRM" in tool["description"]
    assert "jamais un champ deviné" in tool["description"]


@pytest.mark.asyncio
async def test_create_contact_from_crm_returns_a_proposal_and_writes_nothing():
    sb_patch, account_patch = _patch_owned_account()
    with sb_patch, account_patch:
        out = await execute_chat_tool(
            "create_contact_from_crm_presence",
            {
                "full_name": "Sandrine Pata",
                "account_id": _ACCOUNT_DOSSIER["account_id"],
                "job_title": "Directrice des achats",
                "email": "sandrine.pata@example.com",
                "crm_reference": "crm-42",
            },
            user_id="user-1",
            profile_data=None,
        )
    assert out["status"] == "pending_confirmation"
    proposal = out["proposal"]
    assert proposal["action"] == "create_contact_from_crm"
    assert proposal["full_name"] == "Sandrine Pata"
    assert proposal["job_title"] == "Directrice des achats"
    assert proposal["email"] == "sandrine.pata@example.com"
    assert proposal["crm_reference"] == "crm-42"
    # Le nom CANONIQUE du dossier possédé, jamais celui tapé dans la conversation.
    assert proposal["company"] == "THALES"
    assert proposal["cost_credits"] == 0
    # Et surtout : aucun `contact_id` promis avant que la fiche existe.
    assert "contact_id" not in proposal


@pytest.mark.asyncio
async def test_create_contact_from_crm_on_a_foreign_account_yields_no_proposal():
    """SAIT DIRE NON — un `account_id` halluciné (ou d'un autre espace) ne
    donne aucune proposition : elle nommerait une personne sur un dossier qui
    n'appartient pas au caller."""
    sb_patch, account_patch = _patch_owned_account(dossiers=())
    with sb_patch, account_patch:
        out = await execute_chat_tool(
            "create_contact_from_crm_presence",
            {"full_name": "Sandrine Pata", "account_id": "00000000-0000-4000-8000-000000000000"},
            user_id="user-1",
            profile_data=None,
        )
    assert "error" in out and "proposal" not in out


@pytest.mark.asyncio
async def test_create_contact_from_crm_refuses_an_empty_name():
    """Un nom vide ne désigne personne — et une fiche sans nom serait
    exactement la donnée de remplissage que la doctrine refuse."""
    sb_patch, account_patch = _patch_owned_account()
    with sb_patch, account_patch:
        out = await execute_chat_tool(
            "create_contact_from_crm_presence",
            {"full_name": "   ", "account_id": _ACCOUNT_DOSSIER["account_id"]},
            user_id="user-1",
            profile_data=None,
        )
    assert "error" in out and "proposal" not in out


# ── 1 bis. #1995 bis — le rappel qui s'y rattache une fois la fiche créée ───
#
# Constat en prod (46df969d7, 17/09) : « Rappelle-moi de relancer X demain » sur
# une personne connue du seul CRM → Laura REFUSE, sans même proposer la
# création. Le chemin existait déjà (`create_contact_from_crm_presence`) mais
# n'avait nulle part où poser l'intention de rappel qui accompagnait la
# demande — la fiche se créait, le rappel retombait toujours sur l'utilisateur.
# Ici : la même proposition porte AUSSI la date du rappel, pour que le clic
# de création laisse un second geste prêt, sans nouveau tour de modèle.


@pytest.mark.asyncio
async def test_create_contact_from_crm_carries_a_pending_reminder_when_given():
    sb_patch, account_patch = _patch_owned_account()
    with sb_patch, account_patch:
        out = await execute_chat_tool(
            "create_contact_from_crm_presence",
            {
                "full_name": "Sandrine Pata",
                "account_id": _ACCOUNT_DOSSIER["account_id"],
                "reminder_at": "2026-09-18T09:30:00+02:00",
                "reminder_note": "Relancer après la présentation",
            },
            user_id="user-1",
            profile_data=None,
        )
    assert out["status"] == "pending_confirmation"
    proposal = out["proposal"]
    # Même normalisation UTC que `schedule_reminder_for_contact` — l'Action
    # Router n'accepte qu'un ISO 8601, jamais deux formats selon l'outil.
    assert proposal["pending_reminder_at"] == "2026-09-18T07:30:00Z"
    assert proposal["pending_reminder_note"] == "Relancer après la présentation"


@pytest.mark.asyncio
async def test_create_contact_from_crm_without_a_reminder_carries_none():
    """Aucune demande de rappel dans le message d'origine : les deux clés
    existent et valent `None` — jamais une date inventée pour « faire complet »."""
    sb_patch, account_patch = _patch_owned_account()
    with sb_patch, account_patch:
        out = await execute_chat_tool(
            "create_contact_from_crm_presence",
            {"full_name": "Sandrine Pata", "account_id": _ACCOUNT_DOSSIER["account_id"]},
            user_id="user-1",
            profile_data=None,
        )
    proposal = out["proposal"]
    assert proposal["pending_reminder_at"] is None
    assert proposal["pending_reminder_note"] is None


@pytest.mark.asyncio
async def test_create_contact_from_crm_drops_an_unreadable_reminder_date_without_refusing_the_creation():
    """SAIT DIRE NON — mais seulement sur ce qui doit l'être : une date de
    rappel illisible ne doit pas faire tomber la proposition de création, elle
    a sa propre porte (`schedule_reminder_for_contact`, une fois la fiche là)."""
    sb_patch, account_patch = _patch_owned_account()
    with sb_patch, account_patch:
        out = await execute_chat_tool(
            "create_contact_from_crm_presence",
            {
                "full_name": "Sandrine Pata",
                "account_id": _ACCOUNT_DOSSIER["account_id"],
                "reminder_at": "demain matin",
            },
            user_id="user-1",
            profile_data=None,
        )
    assert out["status"] == "pending_confirmation"
    assert out["proposal"]["pending_reminder_at"] is None


# ── 2. Préparer un message ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_prepare_message_returns_a_proposal_and_writes_nothing():
    out = await _run(
        "prepare_message_for_contact",
        {"contact_id": _CONTACT["id"], "channel": "email", "angle": "migration cloud"},
    )
    assert out["status"] == "pending_confirmation"
    proposal = out["proposal"]
    assert proposal["action"] == "prepare_message"
    assert proposal["contact_id"] == _CONTACT["id"]
    assert proposal["contact_name"] == "Claire Dubois"
    assert proposal["channel"] == "email"
    assert proposal["angle"] == "migration cloud"
    # Ce que l'utilisateur doit voir AVANT de cliquer.
    assert proposal["cost_credits"] == 0
    assert proposal["sends_email"] is False


@pytest.mark.asyncio
async def test_prepare_message_long_angle_is_cut_so_the_card_stays_valid():
    # #3894 — « prépare un message pour Glauco et Adrien » : le modèle collait le
    # brouillon entier dans `angle` ; le contrat de la carte plafonne l'angle à
    # 300 caractères, la carte était écartée EN SILENCE (une seule restait).
    long_angle = "migration cloud et cybersécurité " * 30
    out = await _run(
        "prepare_message_for_contact", {"contact_id": _CONTACT["id"], "channel": "email", "angle": long_angle}
    )
    assert out["status"] == "pending_confirmation"
    assert len(out["proposal"]["angle"]) <= 300
    assert out["proposal"]["angle"].startswith("migration cloud et cybersécurité")


@pytest.mark.asyncio
async def test_prepare_message_for_two_contacts_one_without_email_gives_two_proposals():
    no_email = {**_CONTACT, "id": "33333333-3333-4333-8333-333333333333", "full_name": "Glauco Gomes", "email": None}
    first = await _run("prepare_message_for_contact", {"contact_id": _CONTACT["id"], "channel": "email"})
    second = await _run(
        "prepare_message_for_contact", {"contact_id": no_email["id"], "channel": "email"}, contact=no_email
    )
    assert first["status"] == second["status"] == "pending_confirmation"
    assert second["proposal"]["contact_name"] == "Glauco Gomes"


@pytest.mark.asyncio
async def test_prepare_message_without_an_email_still_returns_a_draft_proposal():
    """#3891.2 (ADD-SANOFI-05, retour bêta Sanofi 08/10/2026) — « un e-mail
    absent n'empêche pas de préparer le brouillon ». La recette prod du 08/10
    n'a pas pu l'observer : le contact alors testé (Donald Shaffer) avait déjà
    un e-mail vérifié. Ce contact-ci n'en a aucun — la préparation doit tout de
    même rendre une proposition ; seul l'ENVOI, pas la préparation, a besoin
    d'une coordonnée (#3182.4, bloqué par un autre garde-fou)."""
    contact_without_email = {**_CONTACT, "email": None}
    out = await _run(
        "prepare_message_for_contact",
        {"contact_id": _CONTACT["id"], "channel": "email", "angle": "migration cloud"},
        contact=contact_without_email,
    )
    assert out["status"] == "pending_confirmation"
    proposal = out["proposal"]
    assert proposal["action"] == "prepare_message"
    assert proposal["contact_id"] == _CONTACT["id"]
    assert proposal["sends_email"] is False


@pytest.mark.asyncio
async def test_prepare_message_rejects_an_unknown_channel():
    out = await _run("prepare_message_for_contact", {"contact_id": _CONTACT["id"], "channel": "pigeon"})
    assert "error" in out and "proposal" not in out


@pytest.mark.asyncio
async def test_prepare_message_refuses_a_contact_with_an_active_stop():
    """#3182.4 (épopée #3248) — le prérequis opt-out, retrouvé ICI, jamais
    demandé : un contact qui porte une ligne `contact_stops` (désabonnement,
    rebond, refus…) refuse la préparation, avec la raison enregistrée."""
    sb = _sb_that_forbids_writes()

    async def _stop_row(*_a, **_k):
        return MagicMock(data={"reason": "unsubscribed"})

    sb.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.aexecute = AsyncMock(
        side_effect=_stop_row
    )
    sb_patch = patch("app.services.supabase_client.get_supabase", return_value=sb)
    owned_patch = patch("app.services.ownership.fetch_owned_contact", new_callable=AsyncMock, return_value=_CONTACT)
    with sb_patch, owned_patch:
        out = await execute_chat_tool(
            "prepare_message_for_contact",
            {"contact_id": _CONTACT["id"], "channel": "email"},
            user_id="user-1",
            profile_data=None,
        )
    assert "error" in out and "proposal" not in out
    assert "Désabonnement" in out["error"]
    assert _CONTACT["full_name"] in out["error"]


@pytest.mark.asyncio
async def test_prepare_message_on_a_foreign_contact_yields_no_proposal():
    """Un id halluciné (ou celui d'un autre tenant) → refus net, jamais une
    proposition qui exposerait le nom d'un contact d'un autre compte."""
    sb_patch = patch("app.services.supabase_client.get_supabase", return_value=_sb_that_forbids_writes())
    owned_patch = patch(
        "app.services.ownership.fetch_owned_contact",
        new_callable=AsyncMock,
        side_effect=HTTPException(status_code=404, detail="Contact not found"),
    )
    with sb_patch, owned_patch:
        out = await execute_chat_tool(
            "prepare_message_for_contact",
            {"contact_id": "33333333-3333-4333-8333-333333333333", "channel": "email"},
            user_id="user-1",
            profile_data=None,
        )
    assert "error" in out and "proposal" not in out


# ── 2bis. Le miroir des libellés d'arrêt (#3182.4) ──────────────────────────


def test_contact_stop_reason_labels_mirror_the_screen_exactly():
    """`_CONTACT_STOP_REASON_LABELS` est un MIROIR de
    `apps/web/src/i18n/locales/fr/contacts.json` (`stop.reason`) — une
    divergence NOMME la clé fautive plutôt que de laisser le message
    d'erreur de Laura dériver silencieusement de l'écran."""
    import json
    from pathlib import Path

    from app.services.chat_tools import _CONTACT_STOP_REASON_LABELS

    web_json_path = (
        Path(__file__).resolve().parents[3] / "apps" / "web" / "src" / "i18n" / "locales" / "fr" / "contacts.json"
    )
    web_labels = json.loads(web_json_path.read_text(encoding="utf-8"))["stop"]["reason"]
    assert web_labels == _CONTACT_STOP_REASON_LABELS


# ── 3. Programmer un rappel ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_schedule_reminder_returns_a_proposal_with_a_normalised_date():
    out = await _run(
        "schedule_reminder_for_contact",
        {"contact_id": _CONTACT["id"], "at": "2026-09-01T09:00:00+02:00", "note": "Relancer après le POC"},
    )
    assert out["status"] == "pending_confirmation"
    proposal = out["proposal"]
    assert proposal["action"] == "schedule_reminder"
    assert proposal["contact_id"] == _CONTACT["id"]
    # L'Action Router exige un datetime ISO 8601 (zod `.datetime()`) : on
    # normalise en UTC pour que le clic de confirmation ne soit jamais rejeté.
    assert proposal["at"] == "2026-09-01T07:00:00Z"
    assert proposal["note"] == "Relancer après le POC"
    assert proposal["cost_credits"] == 0


@pytest.mark.asyncio
async def test_schedule_reminder_refuses_a_date_it_cannot_parse():
    out = await _run("schedule_reminder_for_contact", {"contact_id": _CONTACT["id"], "at": "demain matin"})
    assert "error" in out and "proposal" not in out


@pytest.mark.asyncio
async def test_schedule_reminder_requires_a_contact():
    out = await _run("schedule_reminder_for_contact", {"at": "2026-09-01T09:00:00Z"})
    assert "error" in out and "proposal" not in out


# ── 3 bis. #1958.3 — le fuseau du RENDEZ-VOUS rejoint enfin l'escalier ──────


_CONTACT_IN_NY = {**_CONTACT, "timezone": "America/New_York"}


@pytest.mark.asyncio
async def test_TEMOIN_sans_rien_de_regle_nulle_part_aucun_fuseau_ninvente() -> None:
    """La garde qui sait dire NON — rien de réglé, ni personne, ni contact, ni
    espace : la proposition ne doit inventer aucun fuseau."""
    out = await _run(
        "schedule_reminder_for_contact",
        {"contact_id": _CONTACT["id"], "at": "2026-09-01T09:00:00+02:00"},
        contact=_CONTACT,
    )
    assert out["proposal"]["timezone"] is None
    assert out["proposal"]["contact_timezone"] is None


@pytest.mark.asyncio
async def test_le_fuseau_du_contact_decide_a_defaut_de_fuseau_personnel() -> None:
    """#1958.3 — jusqu'ici ce champ existait sur `contacts` sans être lu ICI :
    0 occurrence dans ce fichier avant ce lot."""
    out = await _run(
        "schedule_reminder_for_contact",
        {"contact_id": _CONTACT_IN_NY["id"], "at": "2026-09-01T09:00:00+02:00"},
        contact=_CONTACT_IN_NY,
    )
    assert out["proposal"]["timezone"] == "America/New_York"
    assert out["proposal"]["contact_timezone"] == "America/New_York"


@pytest.mark.asyncio
async def test_le_fuseau_personnel_gagne_sur_celui_du_contact_et_de_lespace() -> None:
    """L'ESCALIER complet : personne → rendez-vous → espace → défaut produit."""
    out = await _run(
        "schedule_reminder_for_contact",
        {"contact_id": _CONTACT_IN_NY["id"], "at": "2026-09-01T09:00:00+02:00"},
        contact=_CONTACT_IN_NY,
        person_timezone="Europe/Paris",
        workspace_timezone="Asia/Singapore",
    )
    assert out["proposal"]["timezone"] == "Europe/Paris"
    # Le fuseau du contact reste RAPPORTÉ, même quand il ne décide pas : c'est
    # ce qui permet au modèle de signaler l'écart à la personne.
    assert out["proposal"]["contact_timezone"] == "America/New_York"


@pytest.mark.asyncio
async def test_lespace_decide_a_defaut_de_personne_et_de_rendez_vous() -> None:
    out = await _run(
        "schedule_reminder_for_contact",
        {"contact_id": _CONTACT["id"], "at": "2026-09-01T09:00:00+02:00"},
        contact=_CONTACT,
        workspace_timezone="Asia/Singapore",
    )
    assert out["proposal"]["timezone"] == "Asia/Singapore"


@pytest.mark.asyncio
async def test_le_contact_est_relu_avec_sa_colonne_timezone() -> None:
    """Sans elle, `resolve_applicable_timezone` ne verrait jamais le fuseau du
    rendez-vous : ce test lit l'APPEL réel à `fetch_owned_contact`, pas
    seulement son résultat mocké."""
    with (
        patch("app.services.supabase_client.get_supabase", return_value=_sb_that_forbids_writes()),
        patch(
            "app.services.ownership.fetch_owned_contact", new_callable=AsyncMock, return_value=_CONTACT_IN_NY
        ) as fetch,
    ):
        await execute_chat_tool(
            "schedule_reminder_for_contact",
            {"contact_id": _CONTACT_IN_NY["id"], "at": "2026-09-01T09:00:00+02:00"},
            user_id="user-1",
            profile_data=None,
        )
    columns = fetch.call_args.kwargs.get("columns", "")
    assert "timezone" in columns


# ── 4. La proposition remonte jusqu'à l'écran ───────────────────────────────


@pytest.mark.asyncio
async def test_orchestrator_surfaces_the_proposal_as_pending_never_as_done(monkeypatch):
    """Bout en bout de la boucle outils : une préparation ressort marquée
    `pending_confirmation` avec sa proposition, pour que l'écran l'affiche avec
    son bouton — jamais confondue avec une action faite."""
    from types import SimpleNamespace

    from app.services import chat_orchestrator

    class _Throttle:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return False

    class _Stream:
        def __init__(self, response):
            self._response = response

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_exc):
            return False

        async def __aiter__(self):
            for block in getattr(self._response, "content", None) or []:
                if getattr(block, "type", None) == "text":
                    yield SimpleNamespace(type="text", text=block.text)

        async def get_final_message(self):
            return self._response

    class _Client:
        def __init__(self, responses):
            self.messages = SimpleNamespace(stream=self._stream)
            self._responses = list(responses)

        def _stream(self, **_kw):
            return _Stream(self._responses.pop(0))

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _Throttle())
    proposal = {"action": "schedule_reminder", "contact_id": _CONTACT["id"], "at": "2026-09-01T07:00:00Z"}
    monkeypatch.setattr(
        chat_orchestrator,
        "execute_chat_tool",
        AsyncMock(return_value={"status": "pending_confirmation", "proposal": proposal}),
    )
    responses = [
        SimpleNamespace(
            stop_reason="tool_use",
            content=[
                SimpleNamespace(
                    type="tool_use",
                    name="schedule_reminder_for_contact",
                    input={"contact_id": _CONTACT["id"], "at": "2026-09-01T09:00:00+02:00"},
                    id="toolu_1",
                )
            ],
        ),
        SimpleNamespace(
            stop_reason="end_turn",
            content=[SimpleNamespace(type="text", text="Je peux programmer ce rappel — valide-le.")],
        ),
    ]
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: _Client(responses))

    _reply, actions = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="user-1", profile_data=None)

    assert actions[0]["status"] == "pending_confirmation"
    assert actions[0]["proposal"] == proposal


@pytest.mark.asyncio
async def test_orchestrator_threads_person_and_workspace_timezone_down_to_the_tool(monkeypatch):
    """#1958.2/.3 — LE CÂBLE, PAS SEULEMENT L'OUTIL : `execute_chat_tool` sait
    déjà lire ces deux paramètres (voir plus haut) ; ce test prouve que les
    QUATRE étages qui séparent `run_chat_with_tools` de lui les transmettent
    réellement, plutôt que de les laisser mourir dans une signature
    intermédiaire — le défaut n°1 du dépôt, du code juste que personne
    n'appelle."""
    from types import SimpleNamespace

    from app.services import chat_orchestrator

    class _Throttle:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return False

    class _Stream:
        def __init__(self, response):
            self._response = response

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_exc):
            return False

        async def __aiter__(self):
            for block in getattr(self._response, "content", None) or []:
                if getattr(block, "type", None) == "text":
                    yield SimpleNamespace(type="text", text=block.text)

        async def get_final_message(self):
            return self._response

    class _Client:
        def __init__(self, responses):
            self.messages = SimpleNamespace(stream=self._stream)
            self._responses = list(responses)

        def _stream(self, **_kw):
            return _Stream(self._responses.pop(0))

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _Throttle())
    tool_spy = AsyncMock(
        return_value={
            "status": "pending_confirmation",
            "proposal": {"action": "schedule_reminder", "contact_id": _CONTACT["id"], "at": "2026-09-01T07:00:00Z"},
        }
    )
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", tool_spy)
    responses = [
        SimpleNamespace(
            stop_reason="tool_use",
            content=[
                SimpleNamespace(
                    type="tool_use",
                    name="schedule_reminder_for_contact",
                    input={"contact_id": _CONTACT["id"], "at": "2026-09-01T09:00:00+02:00"},
                    id="toolu_1",
                )
            ],
        ),
        SimpleNamespace(
            stop_reason="end_turn",
            content=[SimpleNamespace(type="text", text="Je peux programmer ce rappel — valide-le.")],
        ),
    ]
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: _Client(responses))

    await chat_orchestrator.run_chat_with_tools(
        "sys",
        "user",
        user_id="user-1",
        profile_data=None,
        person_timezone="Europe/Paris",
        workspace_timezone="Asia/Singapore",
    )

    assert tool_spy.await_args.kwargs["person_timezone"] == "Europe/Paris"
    assert tool_spy.await_args.kwargs["workspace_timezone"] == "Asia/Singapore"


@pytest.mark.asyncio
async def test_TEMOIN_un_appelant_sans_les_deux_parametres_ne_change_rien(monkeypatch):
    """Le témoin : un appelant d'AVANT ce lot (aucun des deux paramètres) doit
    toujours faire passer `None` des deux côtés — jamais une chaîne vide qui se
    lirait comme « réglé »."""
    from types import SimpleNamespace

    from app.services import chat_orchestrator

    class _Throttle:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return False

    class _Stream:
        def __init__(self, response):
            self._response = response

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_exc):
            return False

        async def __aiter__(self):
            for block in getattr(self._response, "content", None) or []:
                if getattr(block, "type", None) == "text":
                    yield SimpleNamespace(type="text", text=block.text)

        async def get_final_message(self):
            return self._response

    class _Client:
        def __init__(self, responses):
            self.messages = SimpleNamespace(stream=self._stream)
            self._responses = list(responses)

        def _stream(self, **_kw):
            return _Stream(self._responses.pop(0))

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _Throttle())
    tool_spy = AsyncMock(
        return_value={
            "status": "pending_confirmation",
            "proposal": {"action": "schedule_reminder", "contact_id": _CONTACT["id"], "at": "2026-09-01T07:00:00Z"},
        }
    )
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", tool_spy)
    responses = [
        SimpleNamespace(
            stop_reason="tool_use",
            content=[
                SimpleNamespace(
                    type="tool_use",
                    name="schedule_reminder_for_contact",
                    input={"contact_id": _CONTACT["id"], "at": "2026-09-01T09:00:00+02:00"},
                    id="toolu_1",
                )
            ],
        ),
        SimpleNamespace(
            stop_reason="end_turn",
            content=[SimpleNamespace(type="text", text="Je peux programmer ce rappel — valide-le.")],
        ),
    ]
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: _Client(responses))

    await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="user-1", profile_data=None)

    assert tool_spy.await_args.kwargs["person_timezone"] is None
    assert tool_spy.await_args.kwargs["workspace_timezone"] is None


# ── 5. Kill-switch posé = chemin inchangé ───────────────────────────────────


def test_kill_switch_keeps_the_chat_path_tool_free(client: TestClient, monkeypatch) -> None:
    """`CHAT_TOOLS_DISABLED=true` ⇒ `/chat/message` ne passe pas par
    l'orchestrateur : aucune proposition ne peut apparaître. C'est le SEUL
    moyen d'éteindre les outils — sans lui, ils tournent (politique zéro-flag)."""
    monkeypatch.setenv("CHAT_TOOLS_DISABLED", "true")
    with (
        patch("app.routers.chat.call_claude", new_callable=AsyncMock, return_value=("Réponse simple.", None)),
        patch(
            "app.services.chat_orchestrator.run_chat_with_tools",
            new_callable=AsyncMock,
            side_effect=AssertionError("l'orchestrateur ne doit pas tourner flag éteint"),
        ),
    ):
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})
    body = _terminal_event(res.text)
    assert body["success"] is True
    assert body["data"]["reply"] == "Réponse simple."
    assert "pending_actions" not in body["data"]["context"]
    assert "actions" not in body["data"]["context"]
