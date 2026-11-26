"""#1822 — les DEUX lectures de réglages ajoutées : la mémoire et le vocabulaire.

CE QUE CE LOT FERME, ET POURQUOI C'ÉTAIT UN DÉFAUT

1. **Une asymétrie.** `pin_memory_fact` ÉCRIVAIT dans la mémoire de Laura depuis
   le lot 16, et aucun outil ne savait la RELIRE : « qu'est-ce que tu as retenu
   de moi ? » n'avait pas de réponse, alors que l'écran Réglages › Mémoire de
   Laura l'affiche depuis des mois. Un chemin d'écriture sans chemin de lecture
   est le symétrique du défaut n°1 du dépôt.

2. **Un renvoi à l'aveugle.** Laura envoyait vers Réglages › Lexique et
   Réglages › Catalogues sans rien savoir de ce qu'ils contiennent — elle ne
   pouvait donc répondre ni « comment vous appelez ça chez vous ? » ni « quels
   motifs de perte on a ? ».

CE QUE CES DEUX OUTILS NE FONT PAS : écrire. Les deux écrans de vocabulaire
restent en RENVOI (`propose_guided_action`) — un motif de perte ou le mot qui
remplace « Projet » est du texte LIBRE, et un modèle qui le propose l'INVENTE.
La preuve n'est pas une consigne de prompt : il n'existe, nulle part sous ces
branches, de fonction qui écrive.

⚠️ La règle qui compte dans le registre de mémoire : une couche ILLISIBLE est
NOMMÉE, jamais rendue vide. « Je n'ai pas pu lire » et « je ne retiens rien »
sont deux phrases différentes, et la seconde est fausse et rassurante.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools

USER = "11111111-1111-4111-8111-111111111111"

_LEDGER = {
    "entries": [
        {
            "id": "f-1",
            "layer": "facts",
            "text": "Ne jamais appeler avant 10 h",
            "recorded_at": "2026-09-01T08:00:00.000Z",
            "account_id": None,
            "detail": None,
            "expires_at": None,
        }
    ],
    "unreadable_layers": ["conversations"],
}

_VOCABULARY = {
    "lexicon": {"project": {"fr": {"one": "Affaire", "other": "Affaires"}}},
    "catalogues": [
        {"key": "loss_reasons", "editable": "editable", "values": [{"id": "l-1", "label": "Prix", "usage": 3}]}
    ],
}


@pytest.fixture(autouse=True)
def _clear_bridge_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)
    monkeypatch.delenv("INTERNAL_API_SECRET", raising=False)


async def _run(name: str) -> dict:
    return await chat_tools.execute_chat_tool(name, {}, user_id=USER, profile_data=None)


# ── 1. Registre ─────────────────────────────────────────────────────────────


def test_both_reads_are_declared() -> None:
    names = {str(tool["name"]) for tool in chat_tools.CHAT_TOOLS}
    assert {"get_memory", "get_workspace_vocabulary"} <= names


def test_the_two_reads_are_appended_at_the_end_and_stay_consecutive() -> None:
    # La règle du fichier : une primitive nouvelle se pose EN FIN de liste,
    # jamais au milieu — insérer invaliderait le préfixe d'outils mis en cache
    # pour tous les tours suivants, et le copilote est le premier poste de la
    # facture.
    names = [str(tool["name"]) for tool in chat_tools.CHAT_TOOLS]
    start = names.index("get_memory")
    assert names[start : start + 2] == ["get_memory", "get_workspace_vocabulary"]
    # ⚠️ Elles ne sont plus les DERNIÈRES, et ce n'était pas la règle : #1949.23
    # (13/09/2026) a posé l'outil silencieux des demandes non routées APRÈS
    # elles. Ce qui se garde est « consécutives, et rien d'inséré au milieu ni
    # avant » — la queue ne porte que ce qui a été ajouté ensuite, nommément.
    # #2124.49-.55 (15/09/2026) : `propose_mission_proof` posé après elle, EN FIN de liste.
    # #1903.10 / #1935 (16/09/2026) : `prepare_campaign` posé après elle, EN FIN de liste.
    # #1950.4 — la PRÉSENCE et l'ordre relatif, jamais la queue : un outil ajouté
    # EN FIN après eux (`describe_plan`) ne doit pas faire tomber ce test.
    expected_after = [
        "note_unrouted_request",
        "propose_mission_proof",
        "prepare_campaign",
        # #2470 — le tour d'horizon exécuté, ajouté EN FIN comme les précédents.
        "run_account_search",
        # #2268.1/.5/.10 (17/09/2026) : la continuité du fil, ajoutée EN FIN comme les précédents.
        "note_thread_context",
        # #2271.19 (18/09/2026) : l'historique d'un compte, ajouté EN FIN comme les précédents.
        "get_account_timeline",
        # #2327.26 (18/09/2026) : expliquer un rapprochement de talents, ajouté EN FIN comme les précédents.
        "explain_talent_duplicate",
        # #2623.1 (20/09/2026) : QUI approcher sur un compte, ajouté EN FIN comme les précédents.
        "get_account_contacts",
        # #2679 (21/09/2026) : les réponses possibles d'une précision en texte, ajoutées EN FIN.
        "offer_reply_options",
        # #2301 (22/09/2026) : la prélecture de compte, ajoutée EN FIN.
        "get_account_preflight",
        # #2300 (22/09/2026) : le contrat de travail de compte, ajouté EN FIN.
        "get_account_work_contract",
        # #2302 (22/09/2026) : le résolveur de territoire commercial, ajouté EN FIN.
        "resolve_account_territory",
        # #2308 (22/09/2026) : la carte de couverture d'un compte, ajoutée EN FIN.
        "get_account_coverage_map",
        # #2324 (22/09/2026) : le compilateur d'opportunité, ajouté EN FIN.
        "compile_opportunity",
        "get_pipeline_health",
        # #2322 (22/09/2026) : le compilateur de besoin, ajouté EN FIN.
        "compile_need",
        # #2721 (22/09/2026) : la recherche web exécutée par Laura, ajoutée EN FIN.
        "web_search",
        # #2294 (23/09/2026) : la recherche de contacts dans tout l'espace, EN FIN.
        "search_workspace_contacts",
        # #2337 (23/09/2026) : le terrain de jeu multi-talents, ajouté EN FIN.
        "plan_talent_territory",
        # #2392 (23/09/2026) : la clôture de fin de journée, ajoutée EN FIN.
        "compile_day_closure",
        # #2338.8 / #2409.8 (23/09/2026) : le dernier point ouvert de #2338
        # (checklist de démarrage d'une mission), ajouté EN FIN.
        "get_mission_start_readiness",
        # #2423.9 (23/09/2026) : préparer un avenant de mission, ajouté EN FIN.
        "propose_mission_amendment",
        # #1950.4 (24/09/2026, fusion vague 30) — le résumé du plan, posé EN FIN
        # de liste juste avant #2391 (rebased pendant l'intégration).
        "describe_plan",
        # #2391 — le plan de journée (« focus plan »), ajouté EN FIN.
        "propose_focus_plan",
        "propose_opportunity_update",  # #2324.39 — ajouté EN FIN
        # #2376 (23/09/2026) : le brief d'appel avant une prospection, ajouté EN FIN.
        "prepare_cold_call",
        # #2276 — le job composite de Laura, ajouté EN FIN.
        "plan_laura_job",
    ]
    assert names[start + 2 :][: len(expected_after)] == expected_after


def test_neither_read_is_counted_as_a_write_tool() -> None:
    assert "get_memory" not in chat_tools.WRITE_TOOL_NAMES
    assert "get_workspace_vocabulary" not in chat_tools.WRITE_TOOL_NAMES


def test_both_take_no_argument() -> None:
    for name in ("get_memory", "get_workspace_vocabulary"):
        schema = next(t for t in chat_tools.CHAT_TOOLS if t["name"] == name)["input_schema"]
        assert schema["required"] == []


def test_the_vocabulary_tool_says_it_does_not_write() -> None:
    """La description doit renvoyer vers l'écran pour CHANGER un mot — sinon le
    modèle proposerait « je le renomme », ce qu'aucun code ne sait faire."""
    description = str(
        next(t for t in chat_tools.CHAT_TOOLS if t["name"] == "get_workspace_vocabulary")["description"]
    ).lower()
    assert "propose_guided_action" in description
    assert "/settings/lexicon" in description
    assert "/settings/catalogues" in description


def test_the_memory_tool_points_at_the_two_gestures_it_does_not_do() -> None:
    """Épingler a sa porte (`pin_memory_fact`) ; OUBLIER n'en a pas — effacer
    une ligne ne se défait pas, donc ça reste un geste d'écran."""
    description = str(next(t for t in chat_tools.CHAT_TOOLS if t["name"] == "get_memory")["description"])
    assert "pin_memory_fact" in description
    assert "/settings/memory" in description


# ── 2. Sans pont : on le DIT, zéro appel réseau ──────────────────────────────


@pytest.mark.asyncio
@pytest.mark.parametrize("name", ["get_memory", "get_workspace_vocabulary"])
async def test_without_bridge_it_refuses_rather_than_returning_empty(name: str) -> None:
    """Rendre une liste vide se lirait « Laura ne retient rien de toi » ou
    « ton espace n'a aucun mot à lui » — une réponse fausse à une question
    qu'on n'a jamais pu poser."""
    result = await _run(name)
    assert "error" in result
    assert not any(isinstance(value, list) and value for value in result.values())


@pytest.mark.asyncio
@pytest.mark.parametrize("name", ["get_memory", "get_workspace_vocabulary"])
async def test_zero_network_call_without_configuration(name: str, monkeypatch: pytest.MonkeyPatch) -> None:
    def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("aucun appel réseau ne doit partir sans configuration")

    monkeypatch.setattr("httpx.AsyncClient", _explode)
    assert "error" in await _run(name)


# ── 3. Le pont configuré : la réponse passe TELLE QUELLE ─────────────────────


@pytest.mark.asyncio
async def test_get_memory_relays_the_ledger_including_unreadable_layers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def ledger(*_args: object, **_kwargs: object) -> dict:
        return _LEDGER

    monkeypatch.setattr(bellum_api, "laura_memory_ledger", ledger)
    out = await _run("get_memory")
    # LOT 18 (GA-326) — le registre grandit ligne à ligne au fil des tours et
    # n'a AUCUNE borne côté API : `entries` passe désormais par `_capped()`.
    # Une seule entrée reste sous la borne, donc byte-identique ; le drapeau,
    # lui, est un ajout légitime — plus « TEL QUEL », mais toujours FIDÈLE.
    assert {key: out[key] for key in {**_LEDGER, "truncated": False}} == {
        **_LEDGER,
        "truncated": False,
    }  # enveloppe additive (#2852.6-53)
    # La couche illisible SORT : sans elle, Laura dirait « je ne retiens rien de
    # tes conversations », ce qui est faux.
    assert out["unreadable_layers"] == ["conversations"]


@pytest.mark.asyncio
async def test_get_memory_says_it_could_not_read_rather_than_inventing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def unreachable(*_args: object, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "laura_memory_ledger", unreachable)
    out = await _run("get_memory")
    assert "error" in out
    assert "entries" not in out


@pytest.mark.asyncio
async def test_get_workspace_vocabulary_relays_lexicon_and_catalogues(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def vocabulary(*_args: object, **_kwargs: object) -> dict:
        return _VOCABULARY

    monkeypatch.setattr(bellum_api, "laura_workspace_vocabulary", vocabulary)
    out = await _run("get_workspace_vocabulary")
    assert {key: out[key] for key in _VOCABULARY} == _VOCABULARY  # enveloppe additive (#2852.6-53)


@pytest.mark.asyncio
async def test_get_workspace_vocabulary_says_it_could_not_read(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def unreachable(*_args: object, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "laura_workspace_vocabulary", unreachable)
    out = await _run("get_workspace_vocabulary")
    assert "error" in out
    assert "lexicon" not in out


# ── 4. Preuve par l'ABSENCE : aucun chemin d'écriture sous ces branches ──────


def test_the_bridge_exposes_no_write_verb_for_either_screen() -> None:
    """Ce n'est pas une consigne de prompt : il n'existe aucune fonction qui
    écrive un mot du lexique, un motif de catalogue ou une ligne de mémoire
    depuis le service IA. Si quelqu'un en ajoute une, ce test le rappelle."""
    for forbidden in (
        "set_lexicon_term",
        "update_lexicon",
        "add_catalogue_value",
        "update_workspace_vocabulary",
        "forget_memory_entry",
        "delete_memory_entry",
    ):
        assert not hasattr(bellum_api, forbidden), forbidden
