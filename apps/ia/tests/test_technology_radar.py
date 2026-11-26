"""#4282 — radar par technologie : contrat commun Laura / Découvrir, construction, cache 30 j.

Données SYNTHÉTIQUES. La fixture `packages/contracts/src/fixtures/technology-radar.json` est
relue aussi par le test TS : une divergence de liste, de résolution ou de poches casse l'un des deux.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from app.services import technology_radar as tr

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[3] / "packages/contracts/src/fixtures/technology-radar.json").read_text()
)
TODAY = date(2026, 10, 19)
SAP = {"kind": "closed", "code": "SAP", "label": "SAP"}


# ── Contrat commun ────────────────────────────────────────────────────────────


def test_liste_fermee_et_poches_identiques_a_la_fixture_partagee():
    assert FIXTURE["technologies"] == tr.RADAR_TECHNOLOGIES
    assert list(tr.RADAR_POCKETS) == FIXTURE["pockets"]


@pytest.mark.parametrize("case", FIXTURE["phrases"], ids=lambda c: repr(c["input"]))
def test_resolution_identique_au_ts(case):
    assert tr.resolve_radar_technology(case["input"]) == case["expected"]


@pytest.mark.parametrize("case", FIXTURE["detect"], ids=lambda c: c["text"])
def test_detection_identique_au_ts(case):
    assert tr.detect_radar_technologies(case["text"]) == case["codes"]


# ── Construction ──────────────────────────────────────────────────────────────


def _offer(name, title, date_, url, *, detail=None):
    return {
        "name": name,
        "siren": None,
        "city": "Paris",
        "signal": {"type": "hiring", "label": f"Recrutement — {title}", "date": date_, "url": url, "detail": detail},
    }


OFFERS = [
    _offer("Hays France", "Consultant SAP FI/CO", "2026-10-15", "https://ex.test/1", detail="TJM 650 €/jour"),
    # même programme, même publieur : UNE ligne de mission, UN compte
    _offer("Hays France", "Consultant SAP FI/CO (H/F)", "2026-10-10", "https://ex.test/2"),
    _offer("Gamma Industrie", "Chef de projet S/4HANA", "2026-10-12", "https://ex.test/3"),
    _offer("Gamma Industrie", "Stage SAP — assistant", "2026-10-12", "https://ex.test/4"),  # jamais de stage
    _offer("Delta", "Consultant SAP MM", "", "https://ex.test/5"),  # sans date : jamais
    _offer("Epsilon", "Développeur Java", "2026-10-12", "https://ex.test/6"),  # hors techno
]
TENDERS = [
    {
        "title": "Migration SAP ECC vers S/4HANA",
        "buyer": "Ville de Zeta",
        "publishedDate": "2026-09-30",
        "url": "https://ao.test/1",
    },
    {
        "title": "Maintenance des ascenseurs",
        "buyer": "Ville d'Eta",
        "publishedDate": "2026-09-30",
        "url": "https://ao.test/2",
    },
]
AWARDS = [
    {
        "title": "Lot 2 — AMOA SAP S/4",
        "buyer": "Région Theta",
        "winner": "Intégrateur Iota",
        "notifiedDate": "2026-05-02",
        "url": "https://marches.test/1",
    },
    {"title": "Lot 1 — SAP", "buyer": "Région Kappa", "winner": None, "notifiedDate": "2026-05-02", "url": None},
]
NEEDS = [
    {
        "company": "Acme",
        "title": "Consultant SAP FI/CO",
        "status": "GAGNE",
        "status_label": "gagné",
        "date": "2024-03-14",
        "tjm_eur": 720,
        "location": None,
        "technologies": ["SAP"],
        "prescriber": {
            "name": "Jeanne Martin",
            "role": "DSI adjointe",
            "freshness": {"kind": "dated", "date": "2026-06-01"},
        },
    }
]
FOOTPRINTS = [{"company_key": "acme", "techno": "sap", "persons": 14}]


def _build(**overrides):
    kwargs = {
        "offers": OFFERS,
        "tenders": TENDERS,
        "awards": AWARDS,
        "needs": NEEDS,
        "footprints": FOOTPRINTS,
        "not_evaluated": [],
        "today": TODAY,
    }
    kwargs.update(overrides)
    return tr.build_technology_radar(SAP, **kwargs)


def test_client_masque_la_cible_est_le_publieur_et_un_programme_fait_une_ligne():
    radar = _build()
    alpha = next(a for a in radar["accounts"] if a["accountName"] == "Hays France")
    assert alpha["pocket"] == "immediate"
    assert alpha["targetIsPublisher"] is True
    assert len(alpha["missions"]) == 1
    mission = alpha["missions"][0]
    assert mission["publishedAt"] == "2026-10-15"
    assert mission["tjmEur"] == 650
    names = [a["accountName"] for a in radar["accounts"]]
    assert names.count("Hays France") == 1


def test_NON_ni_stage_ni_offre_sans_date_ni_hors_techno():
    radar = _build()
    titles = [m["title"] for a in radar["accounts"] for m in a["missions"]]
    assert not any("Stage" in t for t in titles)
    names = [a["accountName"] for a in radar["accounts"]]
    assert "Delta" not in names and "Epsilon" not in names
    assert "Ville d'Eta" not in names  # appel d'offres sans la techno


def test_trois_poches_dans_l_ordre_et_rang_sans_pourcentage():
    radar = _build()
    pockets = [a["pocket"] for a in radar["accounts"]]
    assert pockets == sorted(pockets, key=list(tr.RADAR_POCKETS).index)
    assert [a["rank"] for a in radar["accounts"]] == list(range(1, len(radar["accounts"]) + 1))
    zeta = next(a for a in radar["accounts"] if a["accountName"] == "Ville de Zeta")
    assert zeta["pocket"] == "programs"
    assert zeta["program"] == "Migration SAP ECC vers S/4HANA"
    assert zeta["proofs"][0] == {
        "kind": "tender_open",
        "label": "Migration SAP ECC vers S/4HANA",
        "date": "2026-09-30",
        "url": "https://ao.test/1",
    }
    dumped = json.dumps(radar, ensure_ascii=False)
    assert "%" not in dumped and "probab" not in dumped.lower()


def test_rang_2_la_cible_est_le_titulaire_jamais_un_titulaire_devine():
    radar = _build()
    iota = next(a for a in radar["accounts"] if a["accountName"] == "Intégrateur Iota")
    assert iota["pocket"] == "rank_2"
    assert iota["awardedTender"] == "Lot 2 — AMOA SAP S/4 (Région Theta)"
    assert "Région Kappa" not in [a["accountName"] for a in radar["accounts"]]


def test_historique_prescripteurs_et_empreinte_profils_observes():
    radar = _build()
    assert radar["historicalNeeds"] == [
        {
            "accountName": "Acme",
            "title": "Consultant SAP FI/CO",
            "status": "GAGNE",
            "date": "2024-03-14",
            "tjmEur": 720,
            "prescriberRole": "DSI adjointe",
        }
    ]
    assert radar["prescribers"] == [
        {
            "accountName": "Acme",
            "name": "Jeanne Martin",
            "role": "DSI adjointe",
            "freshness": {"kind": "dated", "date": "2026-06-01"},
        }
    ]
    assert radar["footprints"] == [{"accountName": "acme", "observedProfiles": 14, "label": "profils observés"}]


def test_la_sortie_a_exactement_les_cles_du_schema_ts_et_ne_nomme_aucune_source():
    radar = _build()
    assert set(radar) == {
        "technology",
        "generatedAt",
        "accounts",
        "historicalNeeds",
        "prescribers",
        "footprints",
        "notEvaluated",
    }
    account_keys = {
        "accountName", "siren", "pocket", "rank", "program", "targetIsPublisher",
        "awardedTender", "missions", "proofs", "profiles", "toVerify",
    }  # fmt: skip
    assert all(set(a) == account_keys for a in radar["accounts"])
    dumped = json.dumps(radar, ensure_ascii=False).lower()
    for source in ("dataforge", "orion", "france travail", "boamp", "decp", "brave", "serper", "tavily", "welcome"):
        assert source not in dumped


# ── Orchestration : cache 30 j, no-op sans clé ──────────────────────────────


@pytest.fixture
def memory_cache(monkeypatch):
    store: dict[tuple[str, str], object] = {}

    async def get_json(ns, key):
        return store.get((ns, key))

    async def set_json(ns, key, value, ttl=None):
        store[(ns, key)] = value
        store[("ttl", key)] = ttl

    monkeypatch.setattr(tr.provider_cache, "get_json", get_json)
    monkeypatch.setattr(tr.provider_cache, "set_json", set_json)
    return store


async def test_une_deuxieme_demande_sous_30_jours_ne_relance_aucune_collecte(monkeypatch, memory_cache):
    calls = {"n": 0}

    async def fake_collect(ref):
        calls["n"] += 1
        return {"offers": OFFERS, "tenders": TENDERS, "awards": AWARDS, "not_evaluated": []}

    async def no_needs(**_k):
        return []

    async def no_footprints(_ref):
        return []

    monkeypatch.setattr(tr, "_collect_public", fake_collect)
    monkeypatch.setattr(tr, "historical_needs", no_needs)
    monkeypatch.setattr(tr, "_read_footprints", no_footprints)

    first = await tr.technology_radar("radar SAP France", today=TODAY)
    second = await tr.technology_radar("SAP", today=TODAY)
    assert calls["n"] == 1
    assert first["accounts"] == second["accounts"]
    assert memory_cache[("ttl", "SAP")] == 30 * 86_400


async def test_NON_une_collecte_entierement_en_panne_n_est_pas_mise_en_cache(monkeypatch, memory_cache):
    async def failing(ref):
        return {
            "offers": [],
            "tenders": [],
            "awards": [],
            "not_evaluated": ["offres", "marchés", "passe web"],
            "failed": True,
        }

    async def none(**_k):
        return []

    async def no_fp(_ref):
        return []

    monkeypatch.setattr(tr, "_collect_public", failing)
    monkeypatch.setattr(tr, "historical_needs", none)
    monkeypatch.setattr(tr, "_read_footprints", no_fp)
    radar = await tr.technology_radar("SAP", today=TODAY)
    assert radar["notEvaluated"]
    assert not any(k[1] == "SAP" for k in memory_cache)


async def test_saisie_vide_refusee_saisie_libre_acceptee_sans_historique_par_code(monkeypatch, memory_cache):
    async def empty(ref):
        return {"offers": [], "tenders": [], "awards": [], "not_evaluated": []}

    seen: dict = {}

    async def needs(**kwargs):
        seen.update(kwargs)
        return []

    async def no_fp(_ref):
        return []

    monkeypatch.setattr(tr, "_collect_public", empty)
    monkeypatch.setattr(tr, "historical_needs", needs)
    monkeypatch.setattr(tr, "_read_footprints", no_fp)
    assert await tr.technology_radar("   ", today=TODAY) is None
    radar = await tr.technology_radar("Mainframe COBOL", today=TODAY)
    assert radar["technology"] == {"kind": "free", "code": None, "label": "Mainframe COBOL"}
    assert seen == {}  # aucune lecture par code pour une saisie libre
    assert any("historique" in item for item in radar["notEvaluated"])


# #4285.3 — un mot dans un intitulé ou une raison sociale ne vaut pas la technologie : « SAP » est aussi
# « services à la personne » et le nom d'un employeur. Le radar écarte et DIT combien.
NOISY_OFFERS = [
    _offer("Hays France", "Consultant SAP FI/CO", "2026-10-15", "https://ex.test/1"),
    _offer("Clinique du Parc", "Infirmier (H/F) FORUM SAP", "2026-10-14", "https://ex.test/n1"),
    _offer("Domicile Plus", "ASSISTANT DE VIE SAP", "2026-10-13", "https://ex.test/n2"),
    _offer("FORUM SAP", "Chargé de recrutement", "2026-10-12", "https://ex.test/n3"),  # la raison sociale seule : jamais ramenée, donc jamais comptée
]


def test_4285_3_le_bruit_du_mot_sap_est_ecarte_et_compte():
    radar = _build(offers=NOISY_OFFERS)
    names = [a["accountName"] for a in radar["accounts"] if a["pocket"] == "immediate"]
    assert names == ["Hays France"]
    assert any(line.startswith("2 offres écartées") for line in radar["notEvaluated"])


def test_4285_3_NON_aucune_ligne_quand_rien_n_est_ecarte():
    radar = _build()
    assert not any("écartée" in line for line in radar["notEvaluated"])
