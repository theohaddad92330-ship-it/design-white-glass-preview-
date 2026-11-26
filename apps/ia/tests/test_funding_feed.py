"""#3941 / #3091 — flux publics de levées de fonds : lecture d'un fil RSS, jamais un chiffre deviné."""

from __future__ import annotations

import asyncio
from datetime import date

import pytest

from app.services.data_sources import funding_feed as ff

RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Presse</title>
<item><title>Alan lève 183 millions d&#8217;euros en série F</title>
<link>https://presse.example/alan-leve</link><pubDate>Tue, 06 Oct 2026 08:00:00 +0000</pubDate></item>
<item><title>Levée de fonds : Pennylane boucle un tour de 40 M€</title>
<link>https://presse.example/pennylane</link><pubDate>Mon, 05 Oct 2026 08:00:00 +0000</pubDate></item>
<item><title>Qonto recrute 200 personnes</title>
<link>https://presse.example/qonto</link><pubDate>Mon, 05 Oct 2026 09:00:00 +0000</pubDate></item>
<item><title>Nouvelle startup lève des fonds en pré-seed</title>
<link>https://presse.example/pre</link></item>
<item><title>Mistral AI lève 600 M€</title><link>javascript:alert(1)</link>
<pubDate>Sun, 04 Oct 2026 08:00:00 +0000</pubDate></item>
</channel></rss>"""


def test_parse_reads_company_amount_round_date_and_link() -> None:
    items = ff.parse_funding_items(RSS)
    alan = next(i for i in items if i["company"] == "Alan")
    assert alan["amount_label"] == "183 M€"
    assert alan["round"] == "série F"
    assert alan["date"] == "2026-10-06"
    assert alan["url"] == "https://presse.example/alan-leve"
    penny = next(i for i in items if i["company"] == "Pennylane")
    assert penny["amount_label"] == "40 M€"


def test_parse_says_no_to_what_is_not_a_round() -> None:
    companies = {i["company"] for i in ff.parse_funding_items(RSS)}
    assert "Qonto" not in companies  # un recrutement n'est pas une levée


def test_parse_never_invents_a_date_or_a_link() -> None:
    # sans pubDate : aucune ligne (« un signal sans date n'en est pas un »)
    assert all(i["company"] != "Nouvelle startup" for i in ff.parse_funding_items(RSS))
    # un lien qui n'est pas http(s) n'est pas gardé
    mistral = next(i for i in ff.parse_funding_items(RSS) if i["company"] == "Mistral AI")
    assert mistral["url"] is None


def test_parse_survives_garbage() -> None:
    assert ff.parse_funding_items("<html>pas du xml") == []
    assert ff.parse_funding_items("") == []


def test_signal_for_matches_whole_company_name_only() -> None:
    items = ff.parse_funding_items(RSS)
    signals = ff.funding_signals_for("ALAN SAS", items, today=date(2026, 10, 11))
    assert len(signals) == 1
    assert signals[0]["type"] == "funding"
    assert signals[0]["date"] == "2026-10-06"
    assert signals[0]["url"] == "https://presse.example/alan-leve"
    assert "183 M€" in signals[0]["label"]
    # « Alan » ne se confond pas avec « Alana Conseil » ni avec un autre nom
    assert ff.funding_signals_for("ALANA CONSEIL", items, today=date(2026, 10, 11)) == []
    assert ff.funding_signals_for("", items, today=date(2026, 10, 11)) == []


def test_signal_older_than_window_is_kept_as_historical_lot762() -> None:
    items = ff.parse_funding_items(RSS)
    out = ff.funding_signals_for("Alan", items, today=date(2028, 1, 1))
    assert out and all(s.get("historical") is True for s in out)


def test_no_feed_configured_is_a_strict_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FUNDING_FEED_URLS", "")
    assert ff.configured_feeds() == []
    # aucune requête n'est tentée : le garde réseau des tests lèverait sinon
    assert asyncio.run(ff.funding_signals("Alan")) == []


@pytest.mark.asyncio
async def test_discover_candidate_signals_carry_the_funding_signal(monkeypatch: pytest.MonkeyPatch) -> None:
    """#3941 — l'appelant : `_candidate_signals` (Découvrir) range la levée avec les autres signaux datés."""
    from app.routers import discover

    async def _none(*_a: object, **_k: object) -> list[dict]:
        return []

    async def _raise(*_a: object, **_k: object) -> list[dict]:
        raise RuntimeError("panne")

    monkeypatch.setattr(discover, "public_tenders", _none)
    monkeypatch.setattr(discover, "it_job_signals", _none)
    monkeypatch.setattr(discover, "legal_signals", _none)

    async def _funding(_name: str, **_k: object) -> list[dict]:
        return [
            {
                "type": "funding",
                "label": "Levée de fonds : 183 M€",
                "date": "2026-10-06",
                "detail": "Presse spécialisée",
            }
        ]

    monkeypatch.setattr(discover, "funding_signals", _funding)
    signals, degraded, _ = await discover._candidate_signals("Alan", "123456789", all_roles=False)
    assert [s["type"] for s in signals] == ["funding"]
    assert degraded == []

    # une panne du fil se NOMME (degraded), sans faire échouer les autres sources
    monkeypatch.setattr(discover, "funding_signals", _raise)
    signals, degraded, _ = await discover._candidate_signals("Alan", "123456789", all_roles=False)
    assert signals == []
    assert [d["source"] for d in degraded] == ["funding_feed"]


def test_brand_matches_legal_name_with_generic_tail_3941_7() -> None:
    # #3941.7 — « Alan France » (raison sociale) = la marque « Alan » de la presse.
    items = ff.parse_funding_items(RSS)
    today = date(2026, 10, 10)
    assert ff.funding_signals_for("ALAN FRANCE SAS", items, today=today)
    assert ff.funding_signals_for("Pennylane Group", items, today=today)


def test_brand_alias_never_matches_by_prefix_3941_7() -> None:
    items = ff.parse_funding_items(RSS)
    today = date(2026, 10, 10)
    assert ff.funding_signals_for("Alana Conseil", items, today=today) == []
    assert ff.funding_signals_for("France", items, today=today) == []


# ── #4285.2 — le rapprochement lit AUSSI la raison sociale / l'enseigne que la carte porte ─────────────────────


def test_press_brand_matches_the_registry_legal_name_when_the_card_carries_it() -> None:
    items = ff.parse_funding_items(RSS)
    today = date(2026, 10, 10)
    # Le registre nomme la carte « LINNAEUS » ; la presse écrit la marque « Pennylane ».
    assert ff.funding_signals_for("LINNAEUS", items, today=today) == []
    found = ff.funding_signals_for("LINNAEUS", items, today=today, other_names=("PENNYLANE SAS",))
    assert [s["date"] for s in found] == ["2026-10-05"]


def test_other_names_are_compared_without_accents_case_or_legal_form() -> None:
    items = [{"company": "Équipe Données", "amount_label": None, "round": None, "date": "2026-10-05", "url": None}]
    today = date(2026, 10, 10)
    assert ff.funding_signals_for("X", items, today=today, other_names=("EQUIPE DONNEES S.A.S",))


def test_homonym_says_no_alan_is_not_alan_allman_associates() -> None:
    items = ff.parse_funding_items(RSS)  # « Alan lève 183 M€ »
    today = date(2026, 10, 10)
    assert ff.funding_signals_for("Alan Allman Associates", items, today=today) == []
    assert ff.funding_signals_for("Alan Allman Associates", items, today=today, other_names=("ALAN ALLMAN SAS",)) == []
    # …et le sens inverse : la presse parle d'« Alan Allman Associates », la carte « Alan » ne matche pas.
    long_items = [
        {"company": "Alan Allman Associates", "amount_label": None, "round": None, "date": "2026-10-05", "url": None}
    ]
    assert ff.funding_signals_for("Alan", long_items, today=today, other_names=("ALAN SAS",)) == []


def test_a_generic_word_as_other_name_never_matches() -> None:
    items = [{"company": "Groupe", "amount_label": None, "round": None, "date": "2026-10-05", "url": None}]
    today = date(2026, 10, 10)
    assert ff.funding_signals_for("Zeta", items, today=today, other_names=("Groupe", "SAS", "France")) == []


def test_title_floor_is_still_one_to_four_words() -> None:
    assert ff.parse_funding_items(
        "<rss><channel><item><title>La société des amis du grand Paris lève 3 M€</title>"
        "<pubDate>Mon, 05 Oct 2026 08:00:00 +0000</pubDate></item></channel></rss>"
    ) == []


def test_registry_row_keeps_the_legal_name_and_trade_name_only_when_they_differ() -> None:
    from app.routers import discover

    row = discover._registry_row(
        {"siren": "123456789", "name": "Kicklox", "legalName": "LINNAEUS SAS", "enseigne": "KICKLOX", "city": "Paris"}
    )
    assert row is not None
    assert row["legalName"] == "LINNAEUS SAS"
    assert "tradeName" not in row  # identique au nom : rien à ajouter
    same = discover._registry_row({"siren": "123456789", "name": "Kicklox", "legalName": "KICKLOX"})
    assert same is not None and "legalName" not in same


async def test_candidate_signals_hand_the_other_registry_names_to_the_funding_feed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.routers import discover

    async def _none(*_a: object, **_k: object) -> list[dict]:
        return []

    seen: dict[str, object] = {}

    async def _funding(name: str, **kwargs: object) -> list[dict]:
        seen.update(name=name, **kwargs)
        return []

    for fn in ("public_tenders", "it_job_signals", "legal_signals", "capital_increase_signals"):
        monkeypatch.setattr(discover, fn, _none)
    monkeypatch.setattr(discover, "funding_signals", _funding)
    await discover._candidate_signals("Kicklox", "123456789", all_roles=False, other_names=("LINNAEUS SAS",))
    assert seen == {"name": "Kicklox", "other_names": ("LINNAEUS SAS",)}
