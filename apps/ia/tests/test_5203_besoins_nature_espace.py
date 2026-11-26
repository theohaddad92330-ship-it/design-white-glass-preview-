"""#5203 (lot 782) — la NATURE du besoin voyage sur la carte ; un compte né des besoins passés de l'ESPACE n'est
jamais présenté comme « base commune » ; aucun champ de personne ni nom de source."""

from __future__ import annotations

import asyncio
from unittest.mock import patch

from app.routers import discover as d
from app.services.discover_skill_offers import EmployerResolution


def test_la_nature_connue_voyage_avec_le_besoin() -> None:
    need = d._observed_need(d.CommonBaseNeed(label="Java", date="2022-03-01", nature="mission"))
    assert need == {"label": "Java", "date": "2022-03-01", "nature": "mission"}


def test_une_nature_inconnue_est_ecartee_jamais_devinee() -> None:
    need = d._observed_need(d.CommonBaseNeed(label="Java", date="2022-03-01", nature="autre"))
    assert need == {"label": "Java", "date": "2022-03-01"}


def test_un_besoin_ancien_sans_nature_reste_affiche_date() -> None:
    assert d._observed_need(d.CommonBaseNeed(label="Java", date="2019-01-15")) == {
        "label": "Java",
        "date": "2019-01-15",
    }


def _req(*cands: d.CommonBaseCandidate) -> d.DiscoverRegistryRequest:
    return d.DiscoverRegistryRequest(commonBaseCandidates=list(cands))


def test_un_compte_des_besoins_de_l_espace_n_est_pas_de_la_base_commune() -> None:
    space = d.CommonBaseCandidate(
        siren="700000001",
        name="Espace SA",
        observedNeed=d.CommonBaseNeed(label="Java", date="2021-02-01", nature="projet"),
        fromSpace=True,
    )
    base = d.CommonBaseCandidate(siren="700000002", name="Base SA")
    rows = d._with_common_base([], _req(space, base), 10)
    by = {r["siren"]: r for r in rows}
    assert by["700000001"]["_source"] == "space_need"
    assert by["700000002"]["_source"] == "common_base"
    assert d._origin_of(by["700000001"], by["700000001"]["_source"]) == "registry"
    assert by["700000001"]["observedNeed"]["nature"] == "projet"


def test_la_nature_d_un_nom_de_parcours_observe_voyage() -> None:
    async def fake(name, siren=None, *, department=None):
        return EmployerResolution({"siren": "123456789", "name": "ACME", "city": None, "sector": None, "nafCode": None})

    names = [d.MarketMemoryName(name="Acme", label="Java", date="2022-05", nature="mission")]
    with patch.object(d, "resolve_employer", fake):
        out = asyncio.run(d._market_memory_candidates(names))
    assert d._observed_need(out[0].observedNeed) == {"label": "Java", "date": "2022-05", "nature": "mission"}
    assert not hasattr(out[0], "phone") and not hasattr(out[0], "email")
