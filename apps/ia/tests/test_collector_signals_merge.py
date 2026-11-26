"""#3970 (lot P07) — les collecteurs datés deviennent des signaux TYPÉS de la veille.

Avant : offres d'emploi, annonces légales, appels d'offres et marchés attribués
n'atteignaient ``recentSignals`` que si le modèle choisissait de les citer dans
le bloc daté du prompt. La veille d'un compte ne portait donc presque qu'une
nature de signal. ``merge_collector_signals`` les y fait entrer de façon
DÉTERMINISTE : chacun avec un type fermé, sa date, son lien quand il existe,
jamais sans date, jamais deux fois, et borné par nature.
"""

from __future__ import annotations

from app.services.dated_signals import COLLECTOR_SIGNALS_CAP_BY_KIND, COLLECTOR_SIGNALS_PER_KIND, merge_collector_signals

JOB = {"title": "Data engineer GCP (H/F)", "date": "2026-10-01T09:00:00", "url": "https://jobs.example/1"}
LEGAL = {"date": "2026-09-20", "type": "Ventes et cessions", "label": "ACME", "url": "https://annonces.example/b1"}
TENDER = {"title": "TMA applicative", "publishedDate": "2026-09-28", "buyer": "Région X", "url": "https://avis.example/m1"}
AWARDED = {"title": "Infogérance poste de travail", "notifiedDate": "2026-08-30", "winner": "ESN Y"}


def test_each_collector_family_becomes_a_typed_dated_signal():
    out = merge_collector_signals([], jobs=[JOB], legal=[LEGAL], tenders=[TENDER], awarded=[AWARDED])
    by_type = {s["type"]: s for s in out}
    assert set(by_type) == {"recrutement", "acquisition", "appel_offres", "marche_public"}
    assert by_type["recrutement"]["date"] == "2026-10-01"
    assert by_type["recrutement"]["url"] == JOB["url"]
    assert by_type["recrutement"]["source_kind"] == "job"
    assert by_type["acquisition"]["source_kind"] == "bodacc"
    assert by_type["appel_offres"]["source_kind"] == "tender"
    # Un marché attribué SANS lien reste un signal daté, sans lien inventé.
    assert "url" not in by_type["marche_public"]
    assert "source_kind" not in by_type["marche_public"]


def test_source_names_the_capability_never_a_provider():
    out = merge_collector_signals([], jobs=[{**JOB, "source": "france_travail"}], legal=[LEGAL])
    sources = {s["source"] for s in out}
    for provider in ("france_travail", "France Travail", "BODACC", "APEC", "Welcome"):
        assert all(provider.lower() not in src.lower() for src in sources)


def test_item_without_date_or_title_is_dropped_never_invented():
    out = merge_collector_signals(
        [],
        jobs=[{**JOB, "date": None}, {**JOB, "title": ""}],
        legal=[{**LEGAL, "date": ""}],
        tenders=[{**TENDER, "publishedDate": "pas une date"}],
    )
    assert out == []


def test_signal_already_carrying_the_link_is_not_added_twice():
    existing = [{"signal": "Recrute un data engineer", "type": "recrutement", "url": JOB["url"]}]
    out = merge_collector_signals(existing, jobs=[JOB])
    assert len(out) == 1


def test_intermediated_offer_is_not_a_hiring_signal_of_the_employer():
    assert merge_collector_signals([], jobs=[{**JOB, "intermediated": True}]) == []


def test_each_kind_is_capped_so_one_nature_cannot_flood_the_watch():
    jobs = [{**JOB, "title": f"Poste {i}", "url": f"https://jobs.example/{i}"} for i in range(10)]
    out = merge_collector_signals([], jobs=jobs, tenders=[TENDER])
    # #3885 — les offres ont leur propre plafond (8), les autres natures restent à 3.
    assert sum(1 for s in out if s["type"] == "recrutement") == COLLECTOR_SIGNALS_CAP_BY_KIND["recrutement"] > COLLECTOR_SIGNALS_PER_KIND
    assert any(s["type"] == "appel_offres" for s in out)


def test_legal_announcement_kind_maps_to_a_closed_signal_type():
    kinds = {
        "Procédures collectives": "restructuration",
        "Créations": "investissement",
        "Modifications diverses": "organisation",
    }
    for family, expected in kinds.items():
        out = merge_collector_signals([], legal=[{**LEGAL, "type": family, "url": f"https://a.example/{family}"}])
        assert out[0]["type"] == expected
    # Un dépôt de comptes ou une radiation n'est pas un signal commercial : aucune ligne.
    assert merge_collector_signals([], legal=[{**LEGAL, "type": "Dépôts des comptes"}]) == []


def test_existing_signals_are_kept_first_and_untouched():
    existing = [{"signal": "Nouveau DSI", "type": "nomination"}]
    out = merge_collector_signals(existing, jobs=[JOB])
    assert out[0] == existing[0]
    assert len(out) == 2


def test_non_list_inputs_are_tolerated():
    assert merge_collector_signals(None, jobs=None, legal="x", tenders=[None], awarded=[1]) == []


def test_job_signal_carries_the_posting_location_never_invented():
    """#4020 / #4022 — le LIEU de l'offre voyage jusqu'au signal : l'écran Opportunités trie les
    recrutements France → lieu non précisé → hors France. Sans lieu collecté, aucune clé."""
    out = merge_collector_signals([], jobs=[{**JOB, "location": "Berlin, Germany"}, {**JOB, "title": "Dev", "url": ""}])
    by_label = {s["signal"]: s for s in out}
    assert by_label[JOB["title"]]["location"] == "Berlin, Germany"
    assert "location" not in by_label["Dev"]
