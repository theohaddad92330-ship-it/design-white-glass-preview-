"""#3941.5 (Louis 17/10) — l'augmentation de capital (BODACC B) est un CRITÈRE de recherche de Découvrir.

Source gratuite, sans clé (miroir Opendatasoft). Ce que le test fige :
- seule une annonce qui DIT « augmentation » (descriptif) est gardée — « Modification survenue sur le
  capital » seule ne dit pas dans quel sens, donc n'est PAS une augmentation ;
- le plein texte ramasse aussi l'objet social (« …par voie d'acquisition, d'augmentation de capital… ») :
  l'annonce dont le descriptif ne dit pas augmentation est écartée ;
- le signal se dit « Augmentation de capital », daté, jamais « levée » ; aucun montant (le jeu de données
  ne dit pas s'il s'agit du capital d'avant ou d'après) ;
- une panne est une source indisponible (typée), jamais une liste vide ;
- le SIREN est celui de la société nommée (listepersonnes), jamais celui d'un tiers cité au registre.
"""

from __future__ import annotations

import json

import httpx
import pytest

from app.services.data_sources import bodacc_capital
from app.services.data_sources.signal_errors import SignalSourceUnavailable


def _record(*, descriptif: str, siren: str = "102099819", name: str = "EUGENIE", dept: str = "68", day: str = "2026-10-16", typeavis: str = "annonce", rid: str = "B202600012345") -> dict:
    return {
        "fields": {
            "id": rid,
            "url_complete": f"https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:{rid}",
            "dateparution": day,
            "familleavis": "modification",
            "typeavis": typeavis,
            "publicationavis": "B",
            "numerodepartement": dept,
            "ville": "Wittelsheim",
            "commercant": f"{name}, SIGLE",
            "registre": f"{siren[:3]} {siren[3:6]} {siren[6:]},{siren}",
            "modificationsgenerales": json.dumps({"descriptif": descriptif}),
            "listepersonnes": json.dumps(
                {
                    "personne": {
                        "denomination": name,
                        "numeroImmatriculation": {"numeroIdentification": f"{siren[:3]} {siren[3:6]} {siren[6:]}"},
                        "capital": {"montantCapital": "3910760.00", "devise": "EUR"},
                    }
                }
            ),
        }
    }


def _client(records: list[dict], status: int = 200, seen: list | None = None) -> httpx.AsyncClient:
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        return httpx.Response(status, json={"records": records})

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_keeps_only_announcements_that_say_augmentation() -> None:
    client = _client(
        [
            _record(descriptif="modification survenue sur le capital (augmentation) et l'administration"),
            _record(descriptif="Modification survenue sur le capital.", siren="111111118", name="FLOU", rid="B2"),
            _record(descriptif="Modification survenue sur l'administration.", siren="222222226", name="OBJET", rid="B3"),
            _record(descriptif="Augmentation de capital", siren="333333334", name="ANCIEN", rid="B4"),
        ]
    )
    rows = await bodacc_capital.list_capital_increase_companies("68", 90, 25, client=client)
    assert [r["siren"] for r in rows] == ["102099819", "333333334"]


async def test_the_signal_is_named_augmentation_de_capital_dated_and_never_levee() -> None:
    rows = await bodacc_capital.list_capital_increase_companies(
        None, 90, 25, client=_client([_record(descriptif="Augmentation de capital")])
    )
    (row,) = rows
    assert row["name"] == "EUGENIE"
    assert row["department"] == "68"
    signal = row["signal"]
    assert signal["label"] == "Augmentation de capital"
    assert signal["date"] == "2026-10-16"
    assert signal["url"].startswith("https://www.bodacc.fr/")
    assert "levée" not in json.dumps(row, ensure_ascii=False).lower()
    # Aucun montant : « 3910760 » (capital de la fiche) ne devient jamais un chiffre à l'écran.
    assert "3910760" not in json.dumps(row)


async def test_a_cancelled_announcement_is_not_a_signal() -> None:
    rows = await bodacc_capital.list_capital_increase_companies(
        None, 90, 25, client=_client([_record(descriptif="Augmentation de capital", typeavis="annulation")])
    )
    assert rows == []


async def test_the_query_is_windowed_and_scoped_to_the_department() -> None:
    seen: list[httpx.Request] = []
    await bodacc_capital.list_capital_increase_companies("31", 30, 25, client=_client([], seen=seen))
    params = dict(seen[0].url.params)
    assert "dateparution>=" in params["q"] and "augmentation" in params["q"]
    assert params["refine.numerodepartement"] == "31"
    assert params["refine.familleavis"] == "modification"
    national = []
    await bodacc_capital.list_capital_increase_companies(None, 30, 25, client=_client([], seen=national))
    assert "refine.numerodepartement" not in dict(national[0].url.params)


async def test_an_outage_is_a_typed_unavailable_source_never_an_empty_list() -> None:
    with pytest.raises(SignalSourceUnavailable):
        await bodacc_capital.list_capital_increase_companies(None, 90, 25, client=_client([], status=503))


async def test_two_announcements_of_the_same_company_make_one_row_dated_by_the_freshest() -> None:
    rows = await bodacc_capital.list_capital_increase_companies(
        None,
        90,
        25,
        client=_client(
            [
                _record(descriptif="Augmentation de capital", day="2026-10-01", rid="B1"),
                _record(descriptif="Augmentation de capital", day="2026-10-10", rid="B2"),
            ]
        ),
    )
    assert len(rows) == 1 and rows[0]["signal"]["date"] == "2026-10-10"


# ── #4285.1 — l'augmentation de capital d'UNE société devient un fait de sa carte ───────────────────────────────


def _records_for(siren: str, *, day: str = "2026-10-16", descriptif: str = "Augmentation de capital") -> list[dict]:
    return [_record(descriptif=descriptif, siren=siren, day=day)]


async def test_card_fact_is_the_announcement_of_the_cards_own_siren() -> None:
    from datetime import date

    rows = await bodacc_capital.capital_increase_signals(
        "102099819", today=date(2026, 10, 21), client=_client(_records_for("102099819"))
    )
    (signal,) = rows
    assert signal["type"] == "business"
    assert signal["label"] == "Augmentation de capital"
    assert signal["date"] == "2026-10-16"
    assert signal["url"].startswith("https://www.bodacc.fr/")
    assert "levée" not in json.dumps(signal, ensure_ascii=False).lower()


async def test_card_fact_says_no_for_another_siren() -> None:
    from datetime import date

    # La source rend l'annonce d'une AUTRE société (plein texte) : aucun fait pour cette carte.
    rows = await bodacc_capital.capital_increase_signals(
        "999999999", today=date(2026, 10, 21), client=_client(_records_for("102099819"))
    )
    assert rows == []


async def test_card_fact_ignores_a_third_party_cited_in_the_register() -> None:
    from datetime import date

    record = _record(descriptif="Augmentation de capital", siren="102099819")
    record["fields"]["registre"] = "999 999 999,999999999,102 099 819,102099819"
    rows = await bodacc_capital.capital_increase_signals("999999999", today=date(2026, 10, 21), client=_client([record]))
    assert rows == []


async def test_card_fact_older_than_twelve_months_is_not_a_fact() -> None:
    from datetime import date

    rows = await bodacc_capital.capital_increase_signals(
        "102099819", today=date(2026, 10, 21), client=_client(_records_for("102099819", day="2025-10-01"))
    )
    assert rows == []


async def test_card_fact_needs_a_valid_siren_and_never_calls_without() -> None:
    seen: list[httpx.Request] = []
    assert await bodacc_capital.capital_increase_signals("", client=_client([], seen=seen)) == []
    assert seen == []


async def test_card_fact_outage_raises_so_it_is_never_cached_as_nothing() -> None:
    with pytest.raises(SignalSourceUnavailable):
        await bodacc_capital.capital_increase_signals("102099819", client=_client([], status=503))
