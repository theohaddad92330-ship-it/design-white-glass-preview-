"""#4421.1 / #4421.7 / #4429.3 (recette prod 22/10) — une ligne d'annonce, puis le résultat, rien entre.

* la fiche lue (compétences du CV, zone, dispo) n'était annoncée nulle part : la ligne est posée par le CODE ;
* « Approfondissement — contexte local / vérification ciblée » s'affichait AVANT le résultat (deux statuts de
  remplissage) : plus aucun statut de passe une fois la liste demandée rendue ;
* le palier d'élargissement n'était dit que dans la carte de couverture : le mot « élargi » d'un bloc ``` faisait
  croire à `ensure_widening_line` que la phrase le disait déjà.
"""

from __future__ import annotations

from types import SimpleNamespace

from app.prompts.laura_acts import announce_line_from_output, ensure_announce_line, ensure_widening_line
from app.services.deepening_engine import delivers_result

OUTPUT = {
    "status": "ok",
    "consultant": {"id": "x", "name": "Hugo Houyez"},
    "retained": {"skills": ["Java", "Vue", "C++"], "zones": ["59"], "available_from": "2026-11-02"},
    "accounts": [{"name": "Alten"}],
}


def test_4421_1_the_announce_line_names_skills_zone_and_availability() -> None:
    line = announce_line_from_output("find_accounts_for_talent", OUTPUT)
    assert line == "J'ai retenu pour Hugo Houyez : Java, Vue, C++ · Nord (59) · disponible dès le 02/11/2026."


def test_4421_1_an_absent_value_makes_no_segment_and_nothing_retained_no_line() -> None:
    sparse = {**OUTPUT, "retained": {"skills": ["Java"]}}
    assert announce_line_from_output("find_accounts_for_talent", sparse) == "J'ai retenu pour Hugo Houyez : Java."
    assert announce_line_from_output("find_accounts_for_talent", {**OUTPUT, "retained": {}}) is None
    assert announce_line_from_output("run_account_search", OUTPUT) is None
    assert announce_line_from_output("find_accounts_for_talent", {"error": "x"}) is None


def test_4421_1_the_widening_steps_are_said_in_the_same_line() -> None:
    line = announce_line_from_output("find_accounts_for_talent", {**OUTPUT, "widening": ["région Hauts-de-France"]})
    assert line and line.endswith("J'ai élargi pour tenir le volume : région Hauts-de-France.")


def test_4421_1_the_line_is_prepended_and_the_work_key_is_removed() -> None:
    actions = [{"tool": "find_accounts_for_talent", "announce_line": "J'ai retenu : Java."}]
    out = ensure_announce_line("Voici les comptes.", actions)
    assert out.startswith("J'ai retenu : Java.\n\nVoici")
    assert "announce_line" not in actions[0]


def test_4421_1_the_model_that_already_said_it_is_not_doubled() -> None:
    actions = [{"announce_line": "J'ai retenu : Java."}]
    reply = "J'ai retenu Java et Vue, dispo en novembre.\n\nVoici les comptes."
    assert ensure_announce_line(reply, actions) == reply
    assert "announce_line" not in actions[0]


def test_4421_1_a_card_that_says_retenu_does_not_count_as_the_sentence() -> None:
    actions = [{"announce_line": "J'ai retenu : Java."}]
    reply = 'Voici.\n\n```json\n{"title": "Critères retenus"}\n```'
    assert ensure_announce_line(reply, actions).startswith("J'ai retenu : Java.")


def _call(name: str) -> SimpleNamespace:
    return SimpleNamespace(name=name)


def test_4421_7_no_filler_status_once_the_list_is_delivered() -> None:
    assert delivers_result([(_call("find_accounts_for_talent"), {"status": "ok", "accounts": [{"name": "A"}]}, False)])
    assert delivers_result([(_call("run_account_search"), {"items": [{"name": "A"}]}, False)])


def test_4421_7_the_guard_says_no_on_an_empty_or_failed_round() -> None:
    assert not delivers_result([(_call("find_accounts_for_talent"), {"status": "ok", "accounts": []}, False)])
    assert not delivers_result([(_call("run_account_search"), {"error": "x", "items": [{"name": "A"}]}, True)])
    assert not delivers_result([(_call("search_talents"), {"items": [{"name": "A"}]}, False)])


def test_4429_3_a_coverage_card_word_does_not_hide_the_missing_tier_sentence() -> None:
    actions = [{"widening_line": "Toulouse seule en donnait 2, élargi à 50 km"}]
    reply = 'Voici 5 comptes.\n\n```json\n{"coverage": "élargi au palier voisin"}\n```'
    out = ensure_widening_line(reply, actions)
    assert out.startswith("Toulouse seule en donnait 2, élargi à 50 km.\n\nVoici")


def test_4429_3_the_sentence_already_in_the_prose_is_not_doubled() -> None:
    actions = [{"widening_line": "Toulouse seule en donnait 2, élargi à 50 km"}]
    reply = "J'ai élargi à 50 km autour de Toulouse.\n\nVoici 5 comptes."
    assert ensure_widening_line(reply, actions) == reply


def test_4421_1_the_output_hint_travels_on_the_action_entry() -> None:
    from app.services.chat_orchestrator import _attach_output_hints

    entry: dict = {}
    _attach_output_hints(entry, _call("find_accounts_for_talent"), OUTPUT, interface_language="fr")
    assert entry["announce_line"].startswith("J'ai retenu pour Hugo Houyez")


def test_4421_3_one_prepare_mail_button_per_contact_up_to_ten() -> None:
    """Le plafond de trois boutons par compte ne tenait pas « un bouton Préparer le mail par contact »."""
    from app.services.known_shape_gate import shape_read_from_tool

    contacts = [
        {"contact_id": f"ct-{i}", "name": f"Contact {i}", "title": "Recrutement", "email": f"c{i}@x.fr"}
        for i in range(10)
    ]
    output = {
        "status": "ok",
        "consultant": {"id": "11111111-1111-4111-8111-111111111111", "name": "Hugo Houyez"},
        "accounts": [
            {
                "name": "Alten",
                "why": ["Offre Java citée."],
                "needs": [{"title": "Dev Java", "date": "2026-10-14"}],
                "contacts": contacts,
            }
        ],
    }
    read = shape_read_from_tool("find_accounts_for_talent", output, language="fr")
    assert read is not None
    (row,) = read["blocks"]["account_ranking"]["items"]
    assert [f["label"] for f in row["follow_ups"]] == [f"Préparer le mail à Contact {i}" for i in range(10)]
    assert all("ct-" in f["ask"] for f in row["follow_ups"])
