"""#1948 — « aucune demande ne dépend d'un outil inexistant sans comportement de repli ».

Les requêtes RÉELLES du corpus terrain (60 exécutables, 30 conseil, 25 triggers,
`app/eval/terrain/*.json`) nomment chacune les outils métier dont elles
dépendent (Gmail, Agenda, HubSpot, Boond, Drive). Rien ne reliait ces familles
aux outils RÉELS du registre de Laura : une famille nouvelle dans le corpus, ou
un outil renommé, passait sans qu'aucun test ne le dise.

Cette garde LIT : chaque famille nommée par une requête réelle doit (1) être
déclarée ci-dessous, (2) désigner au moins un outil qui existe dans
``chat_tools.CHAT_TOOLS``. Le comportement de repli d'une famille sans
connecteur branché est, lui, porté par la suite « repli universel »
(``test_copilote_scenario_corpus.py``, natures de ``unknown``) : il n'est pas
recodé ici. Les noms d'éditeur ne vivent que dans ce fichier de test et dans le
corpus source — jamais dans un texte montré à l'utilisateur.
"""

from __future__ import annotations

import re

import pytest

from app.eval.terrain import loader
from app.services import chat_tools

#: famille du corpus terrain → outils du registre qui la servent aujourd'hui.
CAPACITE_PAR_FAMILLE: dict[str, tuple[str, ...]] = {
    "Gmail": ("read_mail_thread", "prepare_mail_draft"),
    "Agenda": ("prepare_calendar_event", "propose_weekly_plan"),
    "HubSpot": ("get_pipeline", "propose_crm_note", "get_account_notes"),
    "Boond": ("get_capacity", "get_mission_risks"),
    "Drive": ("search_document_projects", "search_content_library"),
}


def _familles(outils: str) -> set[str]:
    return {t.strip() for t in re.split(r"[+,]", outils) if t.strip()}


def _familles_du_corpus() -> set[str]:
    chaines = (
        [r.outils for r in loader.load_requetes_prio1()]
        + [r.outils for r in loader.load_requetes_conseil()]
        + [t.outils for t in loader.load_triggers()]
    )
    return set().union(*(_familles(c) for c in chaines))


def _manques(familles: set[str], carte: dict[str, tuple[str, ...]], registre: set[str]) -> list[str]:
    """Les familles sans outil réel — la règle, isolée pour pouvoir lui faire dire non."""
    return sorted(f for f in familles if not any(o in registre for o in carte.get(f, ())))


REGISTRE = {str(t["name"]) for t in chat_tools.CHAT_TOOLS}


def test_the_terrain_corpus_names_families_we_can_read() -> None:
    assert _familles_du_corpus() == set(CAPACITE_PAR_FAMILLE), (
        "le corpus terrain nomme une famille d'outils absente de la carte "
        "(ou la carte en garde une que plus aucune requête réelle ne nomme)"
    )


def test_every_family_of_a_real_request_has_a_real_tool() -> None:
    assert _manques(_familles_du_corpus(), CAPACITE_PAR_FAMILLE, REGISTRE) == []


def test_every_tool_of_the_map_exists_in_the_registry() -> None:
    cites = {o for outils in CAPACITE_PAR_FAMILLE.values() for o in outils}
    assert sorted(cites - REGISTRE) == []


def test_the_family_guard_knows_how_to_say_no() -> None:
    assert _manques({"Slack"}, CAPACITE_PAR_FAMILLE, REGISTRE) == ["Slack"]
    assert _manques({"Gmail"}, {"Gmail": ("outil_renomme",)}, REGISTRE) == ["Gmail"]
    assert _manques({"Gmail", "Drive"}, CAPACITE_PAR_FAMILLE, REGISTRE) == []


@pytest.mark.parametrize("brut", ["Gmail + HubSpot", "Agenda, Gmail, HubSpot, Boond, Drive", "Drive"])
def test_the_family_splitter_reads_both_separators(brut: str) -> None:
    assert _familles(brut) <= set(CAPACITE_PAR_FAMILLE)
