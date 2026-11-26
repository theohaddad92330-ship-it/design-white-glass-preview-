"""#3922.1 — le lien d'un signal ne se devine pas : il se RETROUVE.

Les collecteurs (BODACC, presse, offres, appels d'offres) portent tous une URL,
mais le modèle ne la voyait pas : le bloc daté n'avait aucun jeton, donc
``recentSignals[].sourceRef`` ne pouvait pas le citer, et l'URL se perdait
entre la collecte et la base. Ici : le jeton posé sur chaque ligne du prompt est
la SEULE clé de retour vers l'URL — jamais un rapprochement par texte.
"""

from __future__ import annotations

from app.services.dated_signals import dated_signal_refs, render_dated_signals, stamp_signal_urls

NEWS = [{"title": "VINCI signe un contrat cloud", "url": "https://presse.example/vinci", "age": "2 days ago"}]
JOBS = [{"title": "Ingénieur DevOps", "url": "https://jobs.example/devops", "date": "2026-06-30"}]
LEGAL = [
    {
        "url": "https://www.bodacc.fr/pages/annonce-visualisation/?q.id=id:A202600123456",
        "date": "2026-05-01",
        "type": "Modification",
        "label": "changement de dirigeant",
    }
]


def test_every_rendered_line_carries_a_ref_that_resolves_to_its_url():
    out = render_dated_signals(NEWS, JOBS, LEGAL)
    refs = dated_signal_refs(NEWS, JOBS, LEGAL)
    assert set(refs.values()) == {
        "https://presse.example/vinci",
        "https://jobs.example/devops",
        "https://www.bodacc.fr/pages/annonce-visualisation/?q.id=id:A202600123456",
    }
    for ref in refs:
        assert ref in out  # un jeton qui n'est pas dans le prompt ne peut pas être cité


def test_ref_without_url_resolves_to_nothing_not_to_a_guess():
    jobs = [{"title": "Poste sans lien", "date": "2026-06-30"}]
    assert dated_signal_refs(None, jobs, None) == {}


def test_stamp_sets_url_and_kind_from_ref_only():
    refs = dated_signal_refs(NEWS, JOBS, LEGAL)
    legal_ref = next(r for r, u in refs.items() if "bodacc" in u)
    signals = [{"signal": "Changement de dirigeant", "source": "BODACC", "source_ref": legal_ref}]
    out = stamp_signal_urls(signals, refs)
    assert out[0]["url"].startswith("https://www.bodacc.fr")
    assert out[0]["source_kind"] == "bodacc"


def test_unknown_ref_or_no_ref_never_gets_an_url():
    refs = dated_signal_refs(NEWS, JOBS, LEGAL)
    out = stamp_signal_urls(
        [
            {"signal": "a", "source": "Les Echos", "source_ref": "[ZZ9]"},
            {"signal": "b", "source": "Non source", "source_ref": ""},
            {"signal": "c", "source": "BODACC"},
        ],
        refs,
    )
    assert all(not s.get("url") for s in out)


def test_non_http_url_is_refused():
    out = stamp_signal_urls([{"signal": "a", "source_ref": "[N1]"}], {"[N1]": "javascript:alert(1)"})
    assert not out[0].get("url")


def test_scrape_ref_resolves_through_the_bundle_numbering():
    out = stamp_signal_urls([{"signal": "a", "source_ref": "[P1]"}], {"[P1]": "https://x.example/a"})
    assert out[0]["url"] == "https://x.example/a"
    assert out[0]["source_kind"] == "press"
