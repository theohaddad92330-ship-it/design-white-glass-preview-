"""#4421.3 + #4430.9 — recette prod 23/10 : Laura « Trouve-moi des comptes qui recrutent des développeurs Java en
Île-de-France » → 2 comptes, 0 offre datée, 0 « Préparer le mail à … ».

Les correctifs 7057ccfc47 / 25f15e0010 / 42a6c9b6b5 ne couvraient que ``find_accounts_for_talent`` (missions d'un
consultant). Le chemin servi ici est ``run_account_search`` → moteur compétence de Découvrir :
- l'offre trouvée par le moteur (``skillEvidence.latestOffer``) n'était pas reportée sur l'item : ni offre datée
  (``signals`` / ``current_demands``), ni date posée par le code, ni geste « Préparer le mail » ;
- les contacts connus ne portaient ni identifiant ni coordonnées : aucun bouton par contact ;
- 8 comptes demandés au moteur, avant les retraits (ESN connues, hors demande) : le volume fondait.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.prompts.laura_acts import offer_dates_from_output
from app.services import chat_tools
from app.services.chat_tools import execute_chat_tool
from app.services.known_shape_gate import shape_read_from_tool


def _row(siren: str, name: str, title: str, date: str) -> dict[str, Any]:
    return {
        "siren": siren,
        "name": name,
        "city": "Paris",
        "department": "75",
        "nafCode": "64.19Z",
        "nafLabel": "Autres intermédiations monétaires",
        "skillEvidence": {
            "skill": "Java",
            "offerCount": 2,
            "latestOffer": {"title": title, "city": "Paris", "date": date, "url": None, "source": None},
        },
    }


ROWS = [
    _row("552100554", "BANQUE ALPHA", "Développeur Java Spring H/F", "2026-10-17"),
    _row("552100555", "ASSUREUR BETA", "Ingénieur backend Java", "2026-10-12"),
]

CONTACTS = [
    {"contact_id": f"ct-{i}", "name": f"Contact {i}", "title": "Responsable recrutement", "email": f"c{i}@alpha.fr"}
    for i in range(12)
]


class _Response:
    def __init__(self, candidates: list[dict[str, Any]]) -> None:
        self.candidates = candidates
        self.degraded: list[dict[str, Any]] = []
        self.query: dict[str, Any] = {}
        self.recommendedSort = "balanced"


@pytest.fixture
def seen(monkeypatch: pytest.MonkeyPatch) -> list[Any]:
    requests: list[Any] = []

    async def _fake(req: Any) -> Any:
        requests.append(req)
        return _Response([dict(r) for r in ROWS])

    async def _owned(items: Any, user_id: str) -> None:
        for item in items:
            if item.get("siren") == "552100554":
                item["account_id"] = "acc-alpha"

    async def _people(items: Any, user_id: str) -> dict[str, list[dict[str, str]]]:
        return {"acc-alpha": [dict(c) for c in CONTACTS]}

    async def _noop(*_: Any, **__: Any) -> None:
        return None

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
    monkeypatch.setattr(chat_tools, "_attach_owned_account_ids", _owned)
    monkeypatch.setattr(chat_tools, "_known_people_by_account", _people)
    monkeypatch.setattr(chat_tools, "_attach_workspace_partner_relation", _noop)
    monkeypatch.setattr(chat_tools, "_attach_workspace_match_levels", _noop)
    monkeypatch.setattr(chat_tools, "attach_group_links", _noop)
    return requests


async def _run() -> dict[str, Any]:
    return await execute_chat_tool(
        "run_account_search",
        {"technologies": ["Java"], "signals": ["hiring"], "region": ["11"]},
        user_id="u-1",
        profile_data={},
    )


@pytest.mark.asyncio
async def test_le_moteur_est_lu_pour_une_dizaine_de_comptes_au_moins(seen: list[Any]) -> None:
    await _run()
    assert seen[0].limit >= 10
    assert seen[0].filters.technologiesObserved == ["Java"]


@pytest.mark.asyncio
async def test_chaque_offre_trouvee_par_le_moteur_est_datee_et_citable(seen: list[Any]) -> None:
    out = await _run()
    alpha, beta = out["items"]
    assert {"type": "hiring", "label": "Développeur Java Spring H/F", "date": "2026-10-17", "location": "Paris"} in alpha["signals"]
    assert alpha["current_demands"][0]["date"] == "2026-10-17"
    assert beta["call_signal"] == {"label": "Ingénieur backend Java", "date": "2026-10-12"}
    # #4430.9 — la date de chaque offre citée est posée par le CODE (même lecture que les missions d'un talent).
    assert ("Développeur Java Spring H/F", "2026-10-17") in offer_dates_from_output("run_account_search", out)


@pytest.mark.asyncio
async def test_un_bouton_preparer_le_mail_par_contact_en_clair_dix_au_plus(seen: list[Any]) -> None:
    out = await _run()
    card = shape_read_from_tool("run_account_search", out, language="fr")["blocks"]["account_ranking"]
    alpha = next(row for row in card["items"] if row["name"] == "BANQUE ALPHA")
    labels = [f["label"] for f in alpha["follow_ups"]]
    assert labels == [f"Préparer le mail à Contact {i}" for i in range(10)]
    assert all(f"ct-{i}" in alpha["follow_ups"][i]["ask"] for i in range(10))
    assert any("c0@alpha.fr" in line for line in alpha["why"])  # coordonnées pro EN CLAIR (c87)
    beta = next(row for row in card["items"] if row["name"] == "ASSUREUR BETA")
    # Sans contact connu : le geste reste le mail au recruteur de l'offre datée.
    assert [f["label"] for f in beta["follow_ups"]] == ["Préparer le mail"]
