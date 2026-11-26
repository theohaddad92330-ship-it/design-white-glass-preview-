"""#3921.1 — l'ouverture d'un établissement (registre officiel) devient un SIGNAL lisible.

`company_events` était appelé par la phase 1 et écrit sous ``companyEvents``, mais
aucun écran ni aucune route ne lisait cette clé : le fait était calculé, testé,
et invisible. Il rejoint ``recentSignals`` — donc la veille, Mes cibles, Laura —
avec sa date de registre et son lien annuaire, ou n'y entre pas.
"""

from __future__ import annotations

from app.services.data_sources.company_events import merge_company_event_signals

EVENT = {
    "type": "new_establishment",
    "date": "2026-09-14",
    "label": "Nouvel établissement — Lyon",
    "source": "recherche-entreprises",
    "url": "https://annuaire-entreprises.data.gouv.fr/etablissement/55203253400123",
}


def test_event_becomes_a_dated_linked_signal():
    out = merge_company_event_signals([], [EVENT])
    assert len(out) == 1
    sig = out[0]
    assert sig["signal"] == "Nouvel établissement — Lyon"
    assert sig["date"] == "2026-09-14"
    assert sig["url"].startswith("https://annuaire-entreprises.data.gouv.fr/etablissement/")
    assert sig["source_kind"] == "official"
    assert sig["source"] == "Registre officiel des entreprises (Sirene)"


def test_existing_signals_are_kept_and_never_duplicated():
    existing = [{"signal": "autre", "url": ""}, {"signal": "déjà là", "url": EVENT["url"]}]
    out = merge_company_event_signals(existing, [EVENT])
    assert len(out) == 2  # l'URL déjà portée n'est pas ajoutée une seconde fois


def test_undated_or_linkless_event_is_dropped_not_invented():
    bad = [
        {**EVENT, "date": ""},
        {**EVENT, "url": ""},
        {**EVENT, "label": ""},
        "pas un dict",
    ]
    assert merge_company_event_signals([], bad) == []


def test_non_list_inputs_are_tolerated():
    assert merge_company_event_signals(None, None) == []
