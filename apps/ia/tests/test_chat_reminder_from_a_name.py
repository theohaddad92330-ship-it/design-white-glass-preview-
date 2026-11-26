"""#1995 (RÉOUVERTE) — un NOM prononcé en portée « tout le portefeuille »
aboutit à un rappel DATÉ.

Geste mesuré en production le 14/09/2026 (api ET ia au SHA ``79666d36d``,
``GET /version`` lu en JSON), dans ``/chat``, portée « tout le portefeuille » :

    Louis  — Rappelle-moi de relancer Sandrine Pata chez THALES demain à 9 h 30
    Laura  — Je peux préparer ce rappel, mais il me manque deux éléments […] :
             • la fiche ou l'identifiant de Sandrine Pata dans Contacts ;
             • la date exacte de « demain » — je n'ai pas accès à la date
               courante dans ce fil.

Aucune carte de rappel. DEUX manques dans une seule réponse, et les deux sont
nécessaires : ``schedule_reminder_for_contact`` exige ``contact_id`` (un UUID)
ET ``at`` (une date ABSOLUE — sa description ordonne au modèle de résoudre
lui-même « demain », ce qu'aucune date dans le prompt ne lui permettait).

⚠️ POURQUOI CE FICHIER ET PAS DEUX TESTS SÉPARÉS. Vérifier d'un côté que le
résumé porte un identifiant, et de l'autre que l'outil accepte un identifiant,
PASSE pendant que le geste échoue — c'est exactement le défaut qu'on corrige
(« du code juste que personne n'appelle », par la porte d'entrée). Ici le modèle
factice ne connaît RIEN par avance : il LIT le prompt système réellement posé
sur l'appel, en extrait l'identifiant avec le parseur de PRODUCTION
(``contacts_shown_in_context``) et la date avec le marqueur de PRODUCTION, puis
appelle le VRAI outil. Retirer l'un ou l'autre câblage casse ce test.

Aucun appel de modèle, aucune horloge lue, aucun fuseau du système : seul le
client Anthropic est remplacé et l'instant est FIGÉ. Tout le reste — routeur,
construction du prompt, segmentation du cache, orchestrateur, outil — est le
vrai code.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import anthropic
import pytest
from fastapi.testclient import TestClient

from app.prompts.current_time import CURRENT_TIME_ISO_MARKER
from app.services.chat_thread_state import contacts_shown_in_context

#: L'identifiant réel de la fiche — la SEULE valeur que l'outil accepte.
SANDRINE_ID = "7f3a91c2-5d6e-4f80-9a1b-2c3d4e5f6071"

#: Le résumé tel que ``apps/api/src/modules/ia-proxy/chat-context.service.ts``
#: l'ÉCRIT depuis ce lot : la personne NOMMÉE dans le message en tête (elle est
#: au rang 500 d'un dossier de 2 027 contacts, donc hors de la fenêtre classée),
#: puis les dix contacts les plus actionnables.
CONTACTS_SUMMARY = "\n".join(
    [f"Sandrine Pata - Directrice des achats - economic - contact_id: {SANDRINE_ID}"]
    + [f"Autre Personne{i} - DSI - user - contact_id: c-rank-{i}" for i in range(10)]
)

#: Instant FIGÉ, et à décalage FIXE : un test qui lit l'horloge ou la base de
#: fuseaux du système est vert en local et rouge en CI (``tzdata`` n'est pas
#: dans ``requirements.txt``). Un lundi, pour que « demain » soit un mardi.
FROZEN_NOW = datetime(2026, 9, 14, 12, 34, 56, tzinfo=timezone(timedelta(hours=2)))

#: Ce que « demain à 9 h 30 » VAUT, résolu contre l'instant figé, tel que
#: ``_normalise_iso_utc`` le rend à l'Action Router (UTC, secondes).
EXPECTED_AT_UTC = "2026-09-15T07:30:00Z"

_MESSAGE = "Rappelle-moi de relancer Sandrine Pata chez THALES demain à 9 h 30"


def _api_body() -> dict:
    """Le corps de ``apps/api/src/modules/ia/ia.client.ts::chatBody`` pour le
    geste mesuré : portée « tout le portefeuille » (``account_id`` vide), le
    résumé des contacts résolu server-side, aucun historique."""
    return {
        "user_id": "u-recette",
        "workspace_id": "ws-1",
        "message": _MESSAGE,
        "account_id": "",
        "history": [],
        "account_data": {"company_name": "THALES", "sector": "Défense"},
        "contacts_summary": CONTACTS_SUMMARY,
        "plan_summary": "",
        "accounts_summary": "THALES — Défense — 8/10",
        "profile_data": {"companyName": "MonESN"},
        "pinned_facts": [],
        "user_preferences": {},
        "conversation_summary": "",
        "account_feedback": "",
        "crm_connected": False,
        "crm_provider": "",
        "crm_presence": "",
        "tools_summary": "",
        "first_name": "Louis",
        "document_ids": [],
        "connected_families": [],
        "clarification_asked": False,
        "conversation_id": "c0ffee00-0000-4000-8000-000000000019",
    }


class _DummyThrottle:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False


def _usage() -> SimpleNamespace:
    return SimpleNamespace(input_tokens=10, output_tokens=5, cache_read_input_tokens=0, cache_creation_input_tokens=0)


class _Stream:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def __aiter__(self):
        for block in self._response.content:
            if getattr(block, "type", None) == "text":
                yield SimpleNamespace(type="text", text=block.text)

    async def get_final_message(self):
        return self._response


def _args_read_from_the_prompt(system: str, refusals: list[str]) -> dict | None:
    """Ce qu'un modèle peut DÉDUIRE du prompt qu'on lui a posé — rien de plus.

    Les deux lectures passent par le code de PRODUCTION : le parseur de lignes
    de contact (``chat_thread_state.contacts_shown_in_context``, l'unique
    lecteur du format écrit par l'API) et le marqueur du bloc de date
    (``prompts.current_time.CURRENT_TIME_ISO_MARKER``). Quand l'une des deux
    manque, on rend ``None`` — ce qui est EXACTEMENT ce que Laura a fait en
    production : annoncer qu'il lui manque un élément.
    """
    shown = [c for c in contacts_shown_in_context(system) if "Sandrine" in str(getattr(c, "label", "") or "")]
    if not shown:
        refusals.append("aucun `contact_id` lisible pour Sandrine Pata dans le prompt système")
        return None
    if CURRENT_TIME_ISO_MARKER not in system:
        refusals.append("aucune date courante dans le prompt système : « demain » est irrésoluble")
        return None
    iso = system.split(CURRENT_TIME_ISO_MARKER, 1)[1].split(")", 1)[0].strip()
    try:
        now = datetime.fromisoformat(iso)
    except ValueError:
        refusals.append(f"date courante illisible dans le prompt : {iso!r}")
        return None
    at = (now + timedelta(days=1)).replace(hour=9, minute=30, second=0, microsecond=0)
    return {
        "contact_id": str(getattr(shown[0], "id", "")),
        "at": at.isoformat(timespec="seconds"),
        "note": "Relancer Sandrine Pata",
    }


def _model_that_only_knows_what_it_reads(calls: list[dict], refusals: list[str]):
    class _Messages:
        def stream(self, **kw):
            calls.append(kw)
            raw = kw.get("system")
            system = "".join(b["text"] for b in raw) if isinstance(raw, list) else str(raw or "")
            if len(calls) == 1:
                plan = _args_read_from_the_prompt(system, refusals)
                if plan is None:
                    content = [SimpleNamespace(type="text", text="Il me manque un élément pour ce rappel.")]
                    return _Stream(SimpleNamespace(stop_reason="end_turn", content=content, usage=_usage()))
                block = SimpleNamespace(type="tool_use", name="schedule_reminder_for_contact", input=plan, id="toolu_1")
                return _Stream(SimpleNamespace(stop_reason="tool_use", content=[block], usage=_usage()))
            content = [SimpleNamespace(type="text", text="Rappel préparé, à valider d'un clic.")]
            return _Stream(SimpleNamespace(stop_reason="end_turn", content=content, usage=_usage()))

    class _Client:
        def __init__(self, **_kw):
            self.messages = _Messages()

    return _Client


@pytest.fixture
def played(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    """Joue le geste de production bout en bout et rend ce qui s'est passé."""
    from app.services import chat_orchestrator, chat_tools, claude_service

    for var in ("OPENAI_API_KEY", "LLM_ROUTE_CHAT", "LLM_GATEWAY_DISABLED", "CHAT_TOOLS_DISABLED"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")

    calls: list[dict] = []
    refusals: list[str] = []
    tool_runs: list[dict] = []

    real_execute = chat_tools.execute_chat_tool

    async def _spy(name, tool_input, **kwargs):
        # Le VRAI outil tourne : c'est lui qui refuse un identifiant inconnu et
        # une date illisible. On n'enregistre que ce qu'il a reçu et rendu.
        out = await real_execute(name, tool_input, **kwargs)
        tool_runs.append({"name": name, "input": tool_input, "output": out})
        return out

    async def _owned_contact(_supabase, contact_id, _user_id, **_kw):
        """La lecture scopée au propriétaire — le SEUL identifiant qui existe."""
        if contact_id != SANDRINE_ID:
            return None
        return {
            "id": SANDRINE_ID,
            "full_name": "Sandrine Pata",
            "title": "Directrice des achats",
            "account_id": "a-thales",
        }

    with (
        patch.object(anthropic, "AsyncAnthropic", _model_that_only_knows_what_it_reads(calls, refusals)),
        patch.object(chat_orchestrator, "throttle", lambda _p: _DummyThrottle()),
        patch.object(claude_service, "throttle", lambda _p: _DummyThrottle()),
        patch.object(chat_orchestrator, "execute_chat_tool", _spy),
        patch("app.prompts.current_time.now_in_reference_timezone", return_value=FROZEN_NOW),
        patch("app.services.supabase_client.get_supabase", return_value=object()),
        patch("app.services.ownership.fetch_owned_contact", new=_owned_contact),
        patch("app.services.conversation_service.save_turn", new_callable=AsyncMock),
        patch("app.services.conversation_service.load_recent_history", new_callable=AsyncMock, return_value=[]),
    ):
        res = client.post("/chat/message", json=_api_body())

    assert res.status_code == 200, res.text[-400:]
    assert calls, "aucun appel modèle n'a été fait — le test ne lit rien"
    return SimpleNamespace(calls=calls, refusals=refusals, tool_runs=tool_runs, response=res)


def test_le_chemin_complet_un_nom_prononce_devient_un_rappel_date(played) -> None:
    """LE GESTE. Un nom prononcé en portée portefeuille aboutit à un rappel
    daté, validable d'un clic — aucune phrase qui renvoie vers un autre écran.

    Le modèle factice n'a que le prompt : s'il manque l'identifiant OU la date,
    ``refusals`` porte la raison et aucun outil n'est appelé."""
    assert played.refusals == [], played.refusals
    assert played.tool_runs, "aucun outil appelé : le modèle n'a pas pu déduire ses arguments du prompt"

    run = played.tool_runs[0]
    assert run["name"] == "schedule_reminder_for_contact"
    # L'identifiant que l'outil a REÇU est celui de la vraie fiche — pas un nom.
    assert run["input"]["contact_id"] == SANDRINE_ID
    # Et l'outil l'a ACCEPTÉ : une proposition, jamais « Contact introuvable ».
    out = run["output"]
    assert "error" not in out, out
    assert out["status"] == "pending_confirmation"
    assert out["proposal"]["action"] == "schedule_reminder"
    assert out["proposal"]["contact_id"] == SANDRINE_ID
    assert out["proposal"]["contact_name"] == "Sandrine Pata"
    # « demain à 9 h 30 » résolu contre l'instant FIGÉ, pas contre l'horloge.
    assert out["proposal"]["at"] == EXPECTED_AT_UTC, out["proposal"]["at"]


def test_la_date_courante_arrive_avec_son_fuseau(played) -> None:
    """DÉFAUT 2 — « je n'ai pas accès à la date courante dans ce fil ».

    La description de l'outil ORDONNE au modèle de résoudre « lundi » et « dans
    15 jours » lui-même. Sans date dans le prompt, cet ordre est impossible à
    suivre, et aucune demande datée relativement ne peut aboutir."""
    system = "".join(b["text"] for b in played.calls[0]["system"])
    assert CURRENT_TIME_ISO_MARKER in system
    assert "2026-09-14T12:34:56+02:00" in system
    # Le FUSEAU voyage avec la date : sans lui, « 9 h 30 » est une heure sans
    # lieu, et le rappel part deux heures à côté.
    assert "+02:00" in system
    assert "14 septembre 2026" in system


def test_la_date_est_dans_le_segment_VOLATIL_du_cache(played) -> None:
    """Une date change à CHAQUE tour. Posée dans un segment mis en cache, elle
    ferait rater le cache du prompt système à chaque message — GA-293, la raison
    pour laquelle l'état du fil part déjà en queue (#1927.8)."""
    blocks = [b["text"] for b in played.calls[0]["system"]]
    assert len(blocks) == 3, "invariant / stable-par-session / volatil"
    assert CURRENT_TIME_ISO_MARKER in blocks[-1]
    assert CURRENT_TIME_ISO_MARKER not in blocks[0]
    assert CURRENT_TIME_ISO_MARKER not in blocks[1]
