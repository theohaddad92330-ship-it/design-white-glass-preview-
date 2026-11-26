"""#4725 (TS-D, épopée #4721) — un compte à 1 crédit avant d'acheter une page à 100.

``include_total_results`` + ``limit:1`` rend ``total_results`` pour 1 crédit (0 résultat = gratuit). C'est une LUMIÈRE,
pas un plafond (décision Louis 25/10) : ≤ 100 une page suffit, > 100 la page 2 part et le compte autorise d'aller PLUS
LOIN que ``SKILL_PAID_PAGES_MAX`` tant que le plafond d'appels le permet. La requête d'offres ne porte JAMAIS le drapeau
(le contrat prévient qu'il ralentit fortement la réponse). Déterministe, SANS réseau.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.services import provider_cache
from app.services import discover_skill_offers as skill
from app.services.data_sources import job_aggregators as agg

KEY_ENV = "THEIRSTACK_API_KEY"


def _page(first: int, n: int) -> dict:
    return {
        "data": [
            {
                "id": i,
                "job_title": f"Développeur Vue.js {i}",
                "company": f"ACME {i}",
                "location": "Lille",
                "date_posted": "2026-10-20",
                "url": f"https://x/{i}",
            }
            for i in range(first, first + n)
        ]
    }


def _count(total: int) -> dict:
    return {"metadata": {"total_results": total}, "data": _page(1, 1)["data"] if total else []}


class _Http:
    def __init__(self, sink: dict) -> None:
        self.sink = sink

    async def post(self, url: str, json: Any = None, headers: Any = None, **_: Any) -> None:
        self.sink.update(body=json)


class Net:
    def __init__(self) -> None:
        self.bodies: list[dict] = []
        self.total: int | None = 0
        self.pages: dict[int, dict] = {}

    @property
    def counts(self) -> list[dict]:
        return [b for b in self.bodies if b.get("include_total_results")]

    @property
    def offers(self) -> list[dict]:
        return [b for b in self.bodies if not b.get("include_total_results")]


@pytest.fixture
def net(monkeypatch) -> Net:
    state = Net()
    monkeypatch.setenv(KEY_ENV, "cle-de-test")

    async def request(provider, company, client, send, gate, *, headers_out=None):
        seen: dict = {}
        await send(_Http(seen))
        body = seen["body"]
        state.bodies.append(body)
        if body.get("include_total_results"):
            return None if state.total is None else _count(state.total)
        return state.pages.get(body["page"], {"data": []})

    monkeypatch.setattr(agg, "_request", request)
    store: dict[tuple[str, str], Any] = {}

    async def get_json(namespace: str, key: str) -> Any:
        return store.get((namespace, key))

    async def set_json(namespace: str, key: str, value: Any, ttl: int | None = None) -> None:
        store[(namespace, key)] = value

    monkeypatch.setattr(provider_cache, "get_json", get_json)
    monkeypatch.setattr(provider_cache, "set_json", set_json)
    state.store = store  # type: ignore[attr-defined]
    return state


def _buy(harvest: skill.SkillHarvest | None = None) -> tuple[list[dict] | None, skill.SkillHarvest]:
    harvest = harvest or skill.SkillHarvest()
    return asyncio.run(skill.paid_skill_offers("theirstack", "Vue.js", harvest, ["59"], ())), harvest


def test_la_requete_d_offres_ne_porte_jamais_include_total_results(net: Net) -> None:
    net.total = 250
    net.pages = {0: _page(1, 100), 1: _page(101, 100), 2: _page(201, 50)}
    _buy()
    assert net.offers and all("include_total_results" not in b for b in net.offers)
    assert len(net.counts) == 1 and net.counts[0]["limit"] == 1


def test_le_compte_porte_les_memes_filtres_que_les_offres(net: Net) -> None:
    net.total = 5
    net.pages = {0: _page(1, 5)}
    _buy()
    count, offers = net.counts[0], net.offers[0]
    for field in ("job_title_or", "job_title_pattern_not", "job_country_code_or", "posted_at_max_age_days"):
        assert count[field] == offers[field]


def test_total_sous_cent_une_seule_page_payee_et_la_matrice_le_dit(net: Net) -> None:
    net.total = 40
    net.pages = {0: _page(1, 40)}
    rows, harvest = _buy()
    assert rows is not None and len(rows) == 40
    assert len(net.offers) == 1
    assert harvest.by_source["theirstack"]["causes"]["totalResults"] == 40


def test_total_pile_cent_page_pleine_mais_la_page_deux_ne_part_pas(net: Net) -> None:
    net.total = 100
    net.pages = {0: _page(1, 100), 1: _page(101, 100)}
    rows, _ = _buy()
    assert rows is not None and len(rows) == 100
    assert [b["page"] for b in net.offers] == [0]


def test_total_au_dessus_de_cent_la_page_deux_part_comme_avant(net: Net) -> None:
    net.total = 150
    net.pages = {0: _page(1, 100), 1: _page(101, 50)}
    rows, _ = _buy()
    assert rows is not None and len(rows) == 150
    assert [b["page"] for b in net.offers] == [0, 1]


def test_total_au_dessus_de_deux_cents_le_compte_va_plus_loin_que_le_plafond_de_pages(net: Net) -> None:
    net.total = 250
    net.pages = {0: _page(1, 100), 1: _page(101, 100), 2: _page(201, 50)}
    rows, _ = _buy()
    assert rows is not None and len(rows) == 250
    assert [b["page"] for b in net.offers] == [0, 1, 2]


def test_le_plafond_d_appels_borne_toujours_l_elargissement(net: Net, monkeypatch) -> None:
    net.total = 500
    net.pages = {i: _page(1 + 100 * i, 100) for i in range(5)}
    with skill.skill_scope(paid_cap=2):
        rows, harvest = _buy()
    assert rows is not None and len(rows) == 200
    assert harvest.by_source["theirstack"]["paid"] == 2


def test_compte_a_zero_aucune_page_payee_cause_nommee(net: Net) -> None:
    net.total = 0
    rows, harvest = _buy()
    assert rows == []
    assert net.offers == [] and len(net.counts) == 1
    causes = harvest.by_source["theirstack"]["causes"]
    assert causes.get("countZero") == 1 and "totalResults" not in causes


def test_compte_en_panne_retombe_sur_la_pagination_d_avant(net: Net) -> None:
    net.total = None
    net.pages = {0: _page(1, 100), 1: _page(101, 10)}
    rows, harvest = _buy()
    assert rows is not None and len(rows) == 110
    assert [b["page"] for b in net.offers] == [0, 1]
    assert "totalResults" not in harvest.by_source["theirstack"]["causes"]


def test_compte_relu_au_cache_au_deuxieme_passage(net: Net) -> None:
    net.total = 40
    net.pages = {0: _page(1, 40)}
    _buy()
    for k in [k for k in net.store if k[0] != skill._COUNT_NAMESPACE]:
        del net.store[k]  # le cache d'offres et le stock expirent (même question qu'au premier passage), le compte reste
    _, harvest = _buy()
    assert len(net.counts) == 1
    assert harvest.by_source["theirstack"]["causes"]["totalResults"] == 40


def test_sans_cle_no_op_strict(net: Net, monkeypatch) -> None:
    monkeypatch.delenv(KEY_ENV)
    rows, harvest = _buy()
    assert rows is None and net.bodies == [] and net.store == {}
    assert harvest.by_source["theirstack"]["causes"] == {"noKey": 1}


def test_rejeu_compte_les_offres_neuves_et_ne_repaie_pas_le_compte_du_meme_jour(net: Net) -> None:
    net.total = 40
    net.pages = {0: _page(1, 40)}
    _buy()
    for k in [k for k in net.store if k[0] == skill._PAID_NAMESPACE]:
        del net.store[k]  # cache expiré, stock encore là : le rejeu ne compte que le NEUF
    net.total = 0
    rows, harvest = _buy()
    assert rows is not None and len(rows) == 40  # le stock répond, rien de payé
    assert len(net.offers) == 1 and "discovered_at_gte" in net.counts[-1]
    assert harvest.by_source["theirstack"]["causes"]["countZero"] == 1
    for k in [k for k in net.store if k[0] == skill._PAID_NAMESPACE]:
        del net.store[k]
    _buy()
    assert len(net.counts) == 2  # le compte du rejeu est relu au cache


def test_5009_total_trouve_cumule_par_source_et_dit_sur_m_trouvees(net: Net) -> None:
    """#5009.1 — le total que la source a RENDU (compte à 1 crédit) alimente « N offres lues sur M trouvées »."""
    net.total = 40
    net.pages = {0: _page(1, 40)}
    _, harvest = _buy()
    assert harvest.totals == {"theirstack": 40}
    harvest.received["theirstack"] = 40  # le dépouillement compte les offres reçues (appelant)
    assert skill.offers_total(harvest) == (40, False)
    harvest.received["theirstack"] = 41  # plus lues que « trouvées » : incohérent ⇒ aucun total
    assert skill.offers_total(harvest) is None


def test_5009_total_absent_quand_une_source_lue_n_en_donne_pas(net: Net) -> None:
    """#5009.1 (03/11) : une source lue sans total s'ajoute à la borne basse ; le total reste marqué non complet."""
    net.total = 40
    net.pages = {0: _page(1, 40)}
    _, harvest = _buy()
    harvest.received["theirstack"] = 40
    harvest.received["france_travail"] = 3
    harvest.no_total.add("france_travail")
    assert skill.offers_total(harvest) == (43, True)


def test_5009_total_inconnu_si_compte_en_panne(net: Net) -> None:
    net.total = None
    net.pages = {0: _page(1, 5)}
    _, harvest = _buy()
    assert harvest.totals == {}
    assert skill.offers_total(harvest) is None
