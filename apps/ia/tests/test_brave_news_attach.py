"""#3917.b — la presse Brave est rattachée par SIREN, jamais par le seul nom tapé.

Brave News s'interroge par NOM (``recent_news(company)``) : « Renault » ramène aussi
Renault Trucks, « Still » la mairie de Still. Avant ce lot, ces brèves n'entraient
dans les signaux qu'à travers le modèle. Désormais une brève n'atteint les signaux
récents (API → fiche) que si l'entité est ANCRÉE (SIREN retenu et registre de
confiance) et que la brève nomme CETTE entité : son SIREN, son domaine, ou son nom
légal / le nom tapé passé par le contrôle d'employeur unique (``employer_match``).
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.services.data_sources.press_rss import attach_brave_news, merge_press_signals

NOW = datetime(2026, 10, 9, 12, tzinfo=UTC)


def _n(title: str, *, age: str = "2 days ago", url: str = "https://media.fr/a", desc: str = "") -> dict:
    return {"title": title, "url": url, "age": age, "description": desc}


def test_homonym_longer_name_and_commune_are_never_attached() -> None:
    news = [
        _n("Renault Trucks recrute 300 personnes à Lyon", url="https://m/1"),
        _n("Renault lance la refonte de son SI", url="https://m/2"),
        _n("La mairie de Renault vote son budget", url="https://m/3"),
    ]
    out = attach_brave_news(news, company="Renault", legal_name="RENAULT SAS", siren="780129987", domain=None, now=NOW)
    assert [i["url"] for i in out] == ["https://m/2"]
    assert out[0]["type"] == "projet"
    assert out[0]["published_at"].startswith("2026-10-07")
    assert out[0]["source"] == "m"


def test_without_an_anchored_siren_nothing_is_attached() -> None:
    news = [_n("Renault lance la refonte de son SI")]
    assert attach_brave_news(news, company="Renault", legal_name=None, siren=None, domain=None, now=NOW) == []
    assert attach_brave_news(news, company="Renault", legal_name="RENAULT", siren="12", domain=None, now=NOW) == []


def test_legal_name_of_the_siren_attaches_even_when_the_typed_name_is_a_brand() -> None:
    news = [_n("La Société Générale nomme un nouveau DSI", url="https://m/sg"), _n("SG Immo rachète un immeuble")]
    out = attach_brave_news(
        news, company="SG", legal_name="SOCIETE GENERALE", siren="552120222", domain=None, now=NOW
    )
    assert [i["url"] for i in out] == ["https://m/sg"]
    assert out[0]["type"] == "nomination"


def test_siren_or_domain_in_the_text_attaches() -> None:
    news = [
        _n("Une ETI lyonnaise lève 5 M€", desc="immatriculée 780 129 987", url="https://m/1"),
        _n("Visite sur acme.fr", url="https://m/2"),
    ]
    out = attach_brave_news(news, company="Zz", legal_name="ZZ", siren="780129987", domain="acme.fr", now=NOW)
    assert sorted(i["url"] for i in out) == ["https://m/1", "https://m/2"]


def test_undated_or_imprecise_items_are_dropped_old_ones_are_kept() -> None:
    news = [
        _n("Renault lève 1 M€", age="", url="https://m/1"),  # sans date
        _n("Renault lève 2 M€", age="2 months ago", url="https://m/2"),  # date au mois près : jamais un jour inventé
        _n("Renault lève 3 M€", age="20 weeks ago", url="https://m/3"),  # ancien mais daté à la semaine : GARDÉ (lot 762, plus de borne d'âge au stockage)
        _n("Renault lève 4 M€", age="5 hours ago", url="https://m/4"),
        _n("Renault lève 5 M€", age="2026-10-01T08:00:00", url="https://m/5"),
        _n("Renault lève 6 M€", age="1 week ago", url="ftp://m/6"),  # lien non http(s)
    ]
    out = attach_brave_news(news, company="Renault", legal_name="RENAULT", siren="780129987", domain=None, now=NOW)
    assert {i["url"]: i["published_at"][:10] for i in out} == {
        "https://m/3": "2026-05-22",
        "https://m/4": "2026-10-09",
        "https://m/5": "2026-10-01",
    }


def test_reaches_recent_signals_through_the_press_merge() -> None:
    news = [_n("Renault rachète une start-up", url="https://m/9")]
    items = attach_brave_news(news, company="Renault", legal_name="RENAULT", siren="780129987", domain=None, now=NOW)
    merged = merge_press_signals([{"signal": "déjà là", "url": "https://m/9"}], items)
    assert len(merged) == 1  # même lien déjà porté par un signal : pas de doublon
    merged = merge_press_signals([], items)
    assert merged == [
        {
            "signal": "Renault rachète une start-up",
            "source": "m",
            "type": "acquisition",
            "date": "2026-10-07",
            "url": "https://m/9",
            "source_kind": "press",
        }
    ]


def test_phase1_wires_the_siren_gated_brave_press_into_recent_signals_after_selection() -> None:
    # Le maillon IA → résultat : l'appel est gaté par le registre de confiance et la
    # fusion arrive APRÈS `select_signals` (comme la presse RSS), jamais avant.
    import pathlib

    src = (pathlib.Path(__file__).resolve().parents[1] / "app/routers/phase1_research.py").read_text()
    call = src.index("_brave_press = attach_brave_news(")
    assert "siren=_resolved_siren if _use_registry else None" in src[call : call + 600]
    merge = src.index('merge_press_signals(result.get("recentSignals"), _brave_press)')
    assert src.index("select_signals(") < merge
    assert call < merge
