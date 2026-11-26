"""#2391 (LAU-FINAL-105) — le plan de journée (« focus plan »), capacity-aware.

Mesuré le 21/09/2026 (registre `.claude/notes/registre-2026-09-20-chat-
lot3.md`, #2391) : AUCUN outil `/chat` ni schéma ne portait ce concept —
`list_agenda`/`find_free_slots` lisent l'agenda et trouvent des créneaux
libres, mais aucun des deux n'assemblait un plan de journée typé, ne
respectait une capacité réelle, ni ne mesurait sa réalisation. Ce fichier
tient le contrat du nouvel outil `propose_focus_plan` :

1. il exige au moins un bloc candidat, avec un type connu, un titre, une
   durée entre 5 et 240 minutes et une RAISON réelle (`priority_reason`) —
   jamais du remplissage ;
2. il place chaque bloc dans un créneau RÉELLEMENT libre (même calcul que
   `find_free_slots`) — jamais un rendez-vous existant recouvert
   (#2391.26) ;
3. il ne planifie JAMAIS toute la capacité libre — une marge reste toujours
   (#2391.30/.32), déplacée par l'énergie déclarée (#2391.18) sans jamais
   dépasser le plafond « ne surcharge jamais » (#2391.31) ;
4. quand la capacité réelle ne suffit pas, l'excédent part dans
   `deferred_blocks` (#2391.33) plutôt que de saturer la journée ;
5. il rend une enveloppe `_proposal()` (« PAS exécutée », `pending_
   confirmation`) — aucun bloc n'est jamais créé dans l'agenda ici (#2391.38
   reste `retenu`, hors de ce lot).
"""

from __future__ import annotations

from datetime import datetime

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"


async def _one_big_free_slot(*_a: object, **_k: object) -> list[dict]:
    # Une seule fenêtre de 200 minutes le 2026-10-01 à 9 h UTC.
    return [{"start": "2026-10-01T09:00:00+00:00", "end": "2026-10-01T12:20:00+00:00", "minutes": 200}]


async def _one_very_big_free_slot(*_a: object, **_k: object) -> list[dict]:
    # Une seule fenêtre de 400 minutes le 2026-10-01 à 9 h UTC — assez large
    # pour placer trois blocs avec leurs tampons sans toucher le budget.
    return [{"start": "2026-10-01T09:00:00+00:00", "end": "2026-10-01T15:40:00+00:00", "minutes": 400}]


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "find_free_slots", _one_big_free_slot)


def _block(**overrides: object) -> dict:
    base = {
        "type": "call_session",
        "title": "Appels prospection",
        "duration_minutes": 30,
        "priority_reason": "Trois comptes chauds à relancer avant vendredi",
    }
    base.update(overrides)
    return base


async def _run(tool_input: dict) -> dict:
    return await execute_chat_tool("propose_focus_plan", tool_input, user_id=USER, profile_data=None)


def test_tool_is_registered_at_the_end_of_chat_tools() -> None:
    # ⚠️ Il n'est plus le DERNIER — #2324.39 (`propose_opportunity_update`),
    # #2376 (`prepare_cold_call`) et #2276 (`plan_laura_job`) ont suivi le
    # même jour (fusion vague 31, 24/09/2026). Ce qui se garde est sa
    # position RELATIVE, juste après `describe_plan`, jamais un rang absolu.
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert names.index("propose_focus_plan") == names.index("describe_plan") + 1


def test_is_classified_as_a_write_tool() -> None:
    # Une carte qui est une PROPOSITION (`_proposal()`) rejoint la famille —
    # jamais parallélisée avec un autre appel.
    assert "propose_focus_plan" in WRITE_TOOL_NAMES


@pytest.mark.asyncio
async def test_requires_at_least_one_block() -> None:
    result = await _run({"blocks": []})
    assert "error" in result
    assert "bloc" in result["error"].lower()


@pytest.mark.asyncio
async def test_rejects_an_unknown_block_type() -> None:
    result = await _run({"blocks": [_block(type="teleportation")]})
    assert "error" in result
    assert "type de bloc inconnu" in result["error"].lower()


@pytest.mark.asyncio
async def test_requires_a_priority_reason() -> None:
    result = await _run({"blocks": [_block(priority_reason="")]})
    assert "error" in result
    assert "priorité" in result["error"].lower()


@pytest.mark.asyncio
async def test_rejects_a_duration_below_the_floor() -> None:
    result = await _run({"blocks": [_block(duration_minutes=1)]})
    assert "error" in result
    assert "durée" in result["error"].lower()


@pytest.mark.asyncio
async def test_rejects_a_duration_above_the_ceiling() -> None:
    result = await _run({"blocks": [_block(duration_minutes=241)]})
    assert "error" in result


@pytest.mark.asyncio
async def test_when_the_agenda_does_not_answer_it_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _none(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "find_free_slots", _none)
    result = await _run({"blocks": [_block()]})
    assert "error" in result
    assert "agenda" in result["error"].lower()


@pytest.mark.asyncio
async def test_a_valid_proposal_is_never_executed() -> None:
    result = await _run({"blocks": [_block()]})
    assert result["status"] == "pending_confirmation"
    assert "PAS exécutée" in result["message"]
    assert result["proposal"]["action"] == "propose_focus_plan"


@pytest.mark.asyncio
async def test_a_block_is_placed_inside_the_real_free_slot_never_in_collision() -> None:
    result = await _run({"blocks": [_block(duration_minutes=30)]})
    plan = result["proposal"]["plan"]
    assert len(plan["blocks"]) == 1
    placed = plan["blocks"][0]
    assert placed["start_iso"] == "2026-10-01T09:00:00+00:00"
    assert placed["collision"] is None
    # #2391.21 — la durée ESTIMÉE, reprise telle quelle.
    assert placed["duration_minutes"] == 30


@pytest.mark.asyncio
async def test_never_uses_the_whole_free_capacity() -> None:
    # 200 minutes libres, un seul candidat qui les réclame TOUTES : le budget
    # (70 % par défaut) le refuse plutôt que de saturer la journée (#2391.31).
    # #2770 (recette prod 08/10) — SEUL sur une journée VIDE, ce bloc ne tiendrait
    # pas davantage (200 > 140 min de budget) : `bloc_trop_long`, jamais
    # `capacite_atteinte` (réservé à un bloc qu'un AUTRE a privé de sa place).
    result = await _run({"blocks": [_block(duration_minutes=200)]})
    plan = result["proposal"]["plan"]
    assert plan["blocks"] == []
    assert plan["deferred_blocks"] == [
        {"type": "call_session", "title": "Appels prospection", "reason": "bloc_trop_long"}
    ]
    # #2391.30/.32 — la marge existe, jamais nulle sur une journée qui a du libre.
    assert plan["margin_minutes"] > 0


@pytest.mark.asyncio
async def test_2770_a_block_too_long_for_the_budget_never_contradicts_the_margin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Recette prod 08/10 (#2770) — EXACTEMENT le cas observé : une « session
    # d'appels de 3 h » (180 min) sur une journée à 4 h 10 (250 min) libres.
    # Budget 70 % = 175 min < 180 : le bloc ne tient nulle part, même seul sur
    # une journée vide — `bloc_trop_long`, jamais `capacite_atteinte` (qui
    # laisserait croire qu'un autre bloc a pris la place). La marge reste
    # positive : elle ne contredit plus la raison du report.
    async def _one_slot_4h10(*_a: object, **_k: object) -> list[dict]:
        return [{"start": "2026-10-08T09:00:00+00:00", "end": "2026-10-08T13:10:00+00:00", "minutes": 250}]

    monkeypatch.setattr(bellum_api, "find_free_slots", _one_slot_4h10)
    result = await _run({"blocks": [_block(title="Session d'appels", duration_minutes=180)]})
    plan = result["proposal"]["plan"]
    assert plan["blocks"] == []
    assert plan["deferred_blocks"] == [{"type": "call_session", "title": "Session d'appels", "reason": "bloc_trop_long"}]
    assert plan["margin_minutes"] == 250


@pytest.mark.asyncio
async def test_agenda_preferences_narrow_the_budget_further(monkeypatch: pytest.MonkeyPatch) -> None:
    # #2770.28 — 200 minutes libres, budget par défaut 140 min (70 %), un bloc de
    # 120 min y tient. Réglée à dossierDurationMinutes=50 / reserveSlots=2, la
    # réserve PERSONNELLE (100 min) devient plus stricte que celle du ratio :
    # le budget tombe à 100 min, le même bloc ne tient plus.
    async def _preferences(*_a: object, **_k: object) -> dict:
        return {"dossierDurationMinutes": 50, "reserveSlots": 2}

    monkeypatch.setattr(bellum_api, "agenda_preferences", _preferences)
    result = await _run({"blocks": [_block(duration_minutes=120)]})
    plan = result["proposal"]["plan"]
    assert plan["blocks"] == []
    # #2770 — seul candidat, budget réduit à 100 min par la réserve personnelle :
    # 120 > 100 ne tiendrait pas davantage sur une journée vide, `bloc_trop_long`.
    assert plan["deferred_blocks"] == [
        {"type": "call_session", "title": "Appels prospection", "reason": "bloc_trop_long"}
    ]


@pytest.mark.asyncio
async def test_agenda_preferences_never_shrink_the_ratio_reserve(monkeypatch: pytest.MonkeyPatch) -> None:
    # #2770.28 — une réserve personnelle PLUS PETITE que celle du ratio (#2391.31)
    # ne l'emporte jamais : le plancher produit (jamais toute la capacité) reste.
    async def _preferences(*_a: object, **_k: object) -> dict:
        return {"dossierDurationMinutes": 1, "reserveSlots": 1}

    # 200 min libres, bloc de 150 min : le ratio (140 min) le refuse ; une réserve d'1 min qui remplacerait
    # le ratio (199 min) le laisserait passer.
    without_prefs = await _run({"blocks": [_block(duration_minutes=150)]})
    monkeypatch.setattr(bellum_api, "agenda_preferences", _preferences)
    with_tiny_prefs = await _run({"blocks": [_block(duration_minutes=150)]})
    assert with_tiny_prefs["proposal"]["plan"]["blocks"] == without_prefs["proposal"]["plan"]["blocks"] == []
    assert with_tiny_prefs["proposal"]["plan"]["margin_minutes"] == without_prefs["proposal"]["plan"]["margin_minutes"]


@pytest.mark.asyncio
async def test_no_agenda_preferences_set_is_byte_identical(monkeypatch: pytest.MonkeyPatch) -> None:
    # #2770.28 — rien réglé (`{}`, comme un pont éteint ou en panne) : le plan
    # ne change pas, jamais une réserve devinée.
    async def _empty(*_a: object, **_k: object) -> dict:
        return {}

    async def _none(*_a: object, **_k: object) -> None:
        return None

    baseline = await _run({"blocks": [_block(duration_minutes=120)]})
    monkeypatch.setattr(bellum_api, "agenda_preferences", _empty)
    empty_prefs = await _run({"blocks": [_block(duration_minutes=120)]})
    monkeypatch.setattr(bellum_api, "agenda_preferences", _none)
    bridge_down = await _run({"blocks": [_block(duration_minutes=120)]})
    assert empty_prefs["proposal"]["plan"] == baseline["proposal"]["plan"]
    assert bridge_down["proposal"]["plan"] == baseline["proposal"]["plan"]


@pytest.mark.asyncio
async def test_low_energy_leaves_a_wider_margin_than_high_energy() -> None:
    # 200 minutes libres, deux blocs de 80 minutes (160 au total) : le budget
    # bas (55 % → 110 min) n'en tient qu'un, le budget haut (80 % → 160 min)
    # les tient tous les deux — la marge du jour bas-énergie reste plus large.
    two_blocks = [_block(title="Bloc A", duration_minutes=80), _block(title="Bloc B", duration_minutes=80)]
    low = await _run({"blocks": two_blocks, "energy": "low"})
    high = await _run({"blocks": two_blocks, "energy": "high"})
    low_margin = low["proposal"]["plan"]["margin_minutes"]
    high_margin = high["proposal"]["plan"]["margin_minutes"]
    assert low_margin > high_margin


@pytest.mark.asyncio
async def test_a_block_with_a_real_deadline_is_placed_before_one_without_at_the_same_priority() -> None:
    # Une seule place possible (budget = 70 % de 200 = 140 min, deux blocs de
    # 100 min chacun) : celui qui porte une échéance RÉELLE gagne (#2391.27).
    result = await _run(
        {
            "blocks": [
                _block(title="Sans échéance", duration_minutes=100),
                _block(title="Avec échéance", duration_minutes=100, deadline="2026-10-01"),
            ]
        }
    )
    plan = result["proposal"]["plan"]
    placed_titles = [block["title"] for block in plan["blocks"]]
    assert placed_titles == ["Avec échéance"]
    assert plan["deferred_blocks"] == [{"type": "call_session", "title": "Sans échéance", "reason": "capacite_atteinte"}]


@pytest.mark.asyncio
async def test_energy_is_declared_never_guessed() -> None:
    result = await _run({"blocks": [_block()], "energy": "teleportation"})
    assert "error" in result


@pytest.mark.asyncio
async def test_consecutive_blocks_in_the_same_slot_leave_a_buffer_between_them(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # #2391.30/.32 — recette prod du 25/09 : trois blocs proposés sans aucun
    # buffer ni marge pour l'imprévu, posés bord à bord. 400 minutes libres,
    # budget 70 % = 280 min, trois blocs de 60 min (180 min < 280) : la
    # capacité et le budget laissent largement la place pour les tampons.
    monkeypatch.setattr(bellum_api, "find_free_slots", _one_very_big_free_slot)
    three_blocks = [
        _block(title="Bloc A", duration_minutes=60),
        _block(title="Bloc B", duration_minutes=60),
        _block(title="Bloc C", duration_minutes=60),
    ]
    result = await _run({"blocks": three_blocks})
    placed = result["proposal"]["plan"]["blocks"]
    assert [block["title"] for block in placed] == ["Bloc A", "Bloc B", "Bloc C"]
    for earlier, later in zip(placed, placed[1:]):
        gap = datetime.fromisoformat(later["start_iso"]) - datetime.fromisoformat(earlier["end_iso"])
        assert gap.total_seconds() > 0, "aucun tampon entre deux blocs consécutifs du même créneau"


@pytest.mark.asyncio
async def test_no_buffer_is_owed_across_two_separate_free_slots(monkeypatch: pytest.MonkeyPatch) -> None:
    # Deux fenêtres DÉJÀ séparées par un rendez-vous : l'écart entre elles
    # vient de l'agenda, pas d'un tampon ajouté en plus par l'outil.
    async def _two_separated_slots(*_a: object, **_k: object) -> list[dict]:
        return [
            {"start": "2026-10-01T09:00:00+00:00", "end": "2026-10-01T09:30:00+00:00", "minutes": 30},
            {"start": "2026-10-01T14:00:00+00:00", "end": "2026-10-01T14:30:00+00:00", "minutes": 30},
        ]

    monkeypatch.setattr(bellum_api, "find_free_slots", _two_separated_slots)
    two_blocks = [
        _block(title="Bloc A", duration_minutes=20),
        _block(title="Bloc B", duration_minutes=20),
    ]
    result = await _run({"blocks": two_blocks})
    placed = result["proposal"]["plan"]["blocks"]
    assert [block["title"] for block in placed] == ["Bloc A", "Bloc B"]
    assert placed[0]["start_iso"] == "2026-10-01T09:00:00+00:00"
    assert placed[1]["start_iso"] == "2026-10-01T14:00:00+00:00"


@pytest.mark.asyncio
async def test_same_type_blocks_are_grouped_to_limit_context_switches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # #2391.28/.29 (#2770.40/.41) — « regroupe les tâches similaires » / « limite
    # les changements de contexte ». Même priorité, aucune échéance : Laura les
    # a donnés dans l'ordre A(call)/B(admin)/C(call) — sans regroupement, l'ordre
    # de placement stable préserverait ce va-et-vient. Avec regroupement, les
    # deux `call_session` se retrouvent adjacents.
    monkeypatch.setattr(bellum_api, "find_free_slots", _one_very_big_free_slot)
    mixed_blocks = [
        _block(type="call_session", title="Bloc A", duration_minutes=30),
        _block(type="admin_tasks", title="Bloc B", duration_minutes=30),
        _block(type="call_session", title="Bloc C", duration_minutes=30),
    ]
    result = await _run({"blocks": mixed_blocks})
    placed_titles = [block["title"] for block in result["proposal"]["plan"]["blocks"]]
    assert placed_titles.index("Bloc C") - placed_titles.index("Bloc A") == 1, (
        f"les deux blocs 'call_session' ne sont pas adjacents : {placed_titles}"
    )


@pytest.mark.asyncio
async def test_grouping_by_type_never_overrides_priority_order(monkeypatch: pytest.MonkeyPatch) -> None:
    # Le regroupement ne doit JAMAIS passer devant la priorité réelle
    # (#2391.2/.20) — un bloc `admin_tasks` haute priorité reste avant un
    # `call_session` normal, même si ça sépare deux `call_session`.
    monkeypatch.setattr(bellum_api, "find_free_slots", _one_very_big_free_slot)
    blocks = [
        _block(type="call_session", title="Bloc A", duration_minutes=30, priority="normal"),
        _block(type="admin_tasks", title="Bloc B", duration_minutes=30, priority="high"),
        _block(type="call_session", title="Bloc C", duration_minutes=30, priority="normal"),
    ]
    result = await _run({"blocks": blocks})
    placed_titles = [block["title"] for block in result["proposal"]["plan"]["blocks"]]
    assert placed_titles[0] == "Bloc B", "la haute priorité doit rester placée en premier"


@pytest.mark.asyncio
async def test_the_plan_names_what_it_could_not_read() -> None:
    # #2770.35/.36/.37 — outils branchés, rôle, politique d'équipe : aucune n'est lue par le moteur.
    # La carte les NOMME plutôt que de les taire ; jamais un réglage inventé pour les remplir.
    result = await _run({"blocks": [_block()]})
    assert result["proposal"]["plan"]["unread_sources"] == ["tools", "role", "team_policy"]
