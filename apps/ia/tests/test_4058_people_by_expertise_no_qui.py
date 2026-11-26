"""#4058/#4057 — recette R8a (prod 429335a9c8, 14/10) : « Donne-moi les
interlocuteurs cyber GRC de EDF, secteur énergie » — EDF est pourtant déjà
dans le portefeuille (/accounts), avec un RSSI listé dans « Contacts
proches ». Observé : Laura répond « pas de fiche EDF », aucune carte de
recherche de personnes, « aucun interlocuteur cyber » sans avoir lu les
contacts déjà en base.

Cause : ``requested_contact_function`` exige « qui dois-je contacter » et
``requested_contacts_at_named_company`` exige un NOMBRE (« 5 décideurs IT
chez Kiabi ») — cette troisième forme, sans « qui » ni nombre, n'avait aucun
détecteur, donc aucune consigne de tour disant de lire les contacts connus
avant de conclure à leur absence.
"""

from __future__ import annotations

import pytest

from app.services import chat_orchestrator
from app.services.account_read_first import (
    expertise_people_at_company_note,
    requested_contact_function,
    requested_contacts_at_named_company,
    requested_people_by_expertise_at_company,
)

EDF = "Donne-moi les interlocuteurs cyber GRC de EDF, secteur énergie"


def test_expertise_people_at_company_is_detected_without_qui_or_number():
    assert requested_people_by_expertise_at_company(EDF) == ("EDF", "cyber GRC")
    assert requested_people_by_expertise_at_company("Quels sont les interlocuteurs cyber de EDF ?") == (
        "EDF",
        "cyber",
    )
    assert requested_people_by_expertise_at_company("les interlocuteurs cyber de Renault") == ("Renault", "cyber")


@pytest.mark.parametrize(
    "message",
    [
        "",
        "Trouve-moi 5 décideurs IT chez Kiabi",  # #3859 — déjà couvert par son propre détecteur
        "Trouve-moi 3 interlocuteurs chez Thales",
        "Les décideurs sont importants",
        "Contacts de l'équipe",
        "Qui dois-je contacter à la DSI de UNEO ?",  # #2533 — « qui », pas cette forme
    ],
)
def test_guard_knows_how_to_say_no(message):
    assert requested_people_by_expertise_at_company(message) is None


def test_note_reads_known_contacts_before_concluding_absence():
    note = expertise_people_at_company_note("EDF", "cyber GRC")
    assert "« EDF »" in note and "« cyber GRC »" in note
    assert "get_account_contacts" in note
    assert "AVANT de dire qu'aucun interlocuteur n'est connu" in note
    assert "propose_people_search" in note
    assert "jamais « pas de fiche »" in note
    # #4058 — expertise et secteur ne se fondent jamais l'un dans l'autre.
    assert "`expertise` DISTINCTE de `sector`/`scope`" in note


def test_note_without_named_expertise_still_names_the_company():
    note = expertise_people_at_company_note("Renault", None)
    assert "« Renault »" in note
    assert "sur l'expertise" not in note


def test_three_detectors_never_overlap_on_the_same_message():
    """Chacune des trois formes (qui / nombre / expertise sans qui ni nombre)
    n'allume qu'UN détecteur — sinon deux consignes de tour contradictoires
    s'empileraient dans le system prompt."""
    for message in (
        "Qui dois-je contacter à la DSI de UNEO ?",
        "Trouve-moi 5 décideurs IT chez Kiabi",
        EDF,
    ):
        hits = [
            bool(requested_contact_function(message)),
            bool(requested_contacts_at_named_company(message)),
            bool(requested_people_by_expertise_at_company(message)),
        ]
        assert sum(hits) == 1, (message, hits)


def test_orchestrator_module_wires_the_new_detector():
    """`chat_orchestrator` doit appeler ce détecteur dans la même chaîne que
    les deux formes voisines (#2533/#3859) — sinon la consigne de tour reste
    écrite mais jamais branchée (le défaut que ce lot corrige)."""
    import inspect

    source = inspect.getsource(chat_orchestrator)
    assert "requested_people_by_expertise_at_company" in source
    assert "expertise_people_at_company_note" in source
