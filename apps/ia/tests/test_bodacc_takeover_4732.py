"""#4732.1 — rachat et fusion : un CRITÈRE de recherche de Découvrir, comme l'augmentation de capital (#3941.5).

Recette prod 01/11 (FAIL) : « Cadrer la recherche > Signaux » n'offrait que quatre types, aucun rachat/fusion.
Ce que le test fige :
- une annonce de VENTE (cession de fonds) ou une MODIFICATION qui NOMME une fusion/absorption/scission/rachat
  fait un signal « Rachat ou fusion », daté de la parution, avec le lien de l'annonce ;
- une modification qui ne nomme rien de tel (adresse, capital) est écartée ;
- une annulation n'est pas un signal ; une panne est une source indisponible (typée), jamais une liste vide ;
- le SIREN est celui de la société NOMMÉE par l'annonce.
"""

from __future__ import annotations

import json

import httpx
import pytest

from app.services.data_sources import bodacc_takeover
from app.services.data_sources.signal_errors import SignalSourceUnavailable


def _record(*, family: str, descriptif: str = "", siren: str = "102099819", name: str = "EUGENIE", day: str = "2026-10-16", typeavis: str = "annonce", rid: str = "B1") -> dict:
    return {
        "fields": {
            "id": rid,
            "url_complete": f"https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:{rid}",
            "dateparution": day,
            "familleavis": family,
            "typeavis": typeavis,
            "numerodepartement": "68",
            "ville": "Wittelsheim",
            "modificationsgenerales": json.dumps({"descriptif": descriptif}),
            "listepersonnes": json.dumps(
                {
                    "personne": {
                        "denomination": name,
                        "numeroImmatriculation": {"numeroIdentification": f"{siren[:3]} {siren[3:6]} {siren[6:]}"},
                    }
                }
            ),
        }
    }


def _client(by_family: dict[str, list[dict]], seen: list | None = None) -> httpx.AsyncClient:
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        return httpx.Response(200, json={"records": by_family.get(request.url.params.get("refine.familleavis", ""), [])})

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_sale_and_named_merger_are_kept_other_modifications_are_not() -> None:
    client = _client(
        {
            "vente": [_record(family="vente", siren="111111118", name="VENDEUR", rid="V1", day="2026-10-10")],
            "modification": [
                _record(family="modification", descriptif="Fusion par absorption de la société X", rid="M1", day="2026-10-16"),
                _record(family="modification", descriptif="Modification survenue sur l'adresse.", siren="222222226", name="ADRESSE", rid="M2"),
            ],
        }
    )
    rows = await bodacc_takeover.list_takeover_companies("68", 90, 25, client=client)
    assert [r["siren"] for r in rows] == ["102099819", "111111118"]  # le plus récent d'abord


async def test_the_signal_is_named_rachat_ou_fusion_dated_and_linked() -> None:
    (row,) = await bodacc_takeover.list_takeover_companies(None, 90, 25, client=_client({"vente": [_record(family="vente")]}))
    signal = row["signal"]
    assert signal["label"] == "Rachat ou fusion"
    assert signal["type"] == "business"
    assert signal["date"] == "2026-10-16"
    assert signal["url"].startswith("https://www.bodacc.fr/")


async def test_a_cancelled_announcement_is_not_a_signal() -> None:
    rows = await bodacc_takeover.list_takeover_companies(
        None, 90, 25, client=_client({"vente": [_record(family="vente", typeavis="annulation")]})
    )
    assert rows == []


async def test_the_query_is_windowed_and_scoped_to_the_department() -> None:
    seen: list[httpx.Request] = []
    await bodacc_takeover.list_takeover_companies("31", 30, 25, client=_client({}, seen=seen))
    assert {dict(r.url.params)["refine.familleavis"] for r in seen} == {"vente", "modification"}
    assert all(dict(r.url.params)["refine.numerodepartement"] == "31" for r in seen)
    assert all("dateparution>=" in dict(r.url.params)["q"] for r in seen)


async def test_an_outage_is_a_typed_unavailable_source_never_an_empty_list() -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    with pytest.raises(SignalSourceUnavailable):
        await bodacc_takeover.list_takeover_companies(
            None, 90, 25, client=httpx.AsyncClient(transport=httpx.MockTransport(boom))
        )
