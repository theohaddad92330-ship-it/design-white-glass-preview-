"""#4281.1 / .2 / .3 / .4 — besoins historiques structurés, lus par Laura et le plan.

Données SYNTHÉTIQUES. Le nom du pack ne sort jamais : ni dans les vues, ni dans les messages.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from app.services import dataforge_needs as dn


class _Query:
    def __init__(self, sb: _FakeSupabase, table: str) -> None:
        self.sb = sb
        self.table = table
        self.filters: list[tuple] = []
        sb.queries.append(self)

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self.filters.append(("eq", col, val))
        return self

    def in_(self, col, vals):
        self.filters.append(("in", col, list(vals)))
        return self

    def contains(self, col, vals):
        self.filters.append(("contains", col, list(vals)))
        return self

    def ilike(self, col, val):
        self.filters.append(("ilike", col, val))
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, n):
        self.filters.append(("limit", n))
        return self

    async def aexecute(self):
        if self.sb.error:
            raise self.sb.error
        rows = list(self.sb.rows.get(self.table, []))
        for f in self.filters:
            if f[0] == "eq":
                rows = [r for r in rows if r.get(f[1]) == f[2]]
            elif f[0] == "in":
                rows = [r for r in rows if r.get(f[1]) in f[2]]
            elif f[0] == "contains":
                rows = [r for r in rows if set(f[2]) <= set(r.get(f[1]) or [])]

        class _Res:
            data = rows

        return _Res()


class _FakeSupabase:
    def __init__(self, rows: dict[str, list[dict]] | None = None, error: Exception | None = None) -> None:
        self.rows = rows or {}
        self.error = error
        self.queries: list[_Query] = []

    def table(self, name: str) -> _Query:
        return _Query(self, name)


NEEDS = [
    {
        "need_id": "B-1",
        "account_source_id": "DF-0042",
        "entreprise": "Acme Industrie",
        "title": "Consultant SAP FI/CO",
        "status": "GAGNE",
        "need_date": "2024-03-14",
        "tjm_eur": 720,
        "prescriber_name": "Jeanne Martin",
        "prescriber_title": "DSI adjointe",
        "prescriber_last_seen": "2026-06-01",
        "location": "Lyon",
        "technologies": ["SAP"],
    },
    {
        "need_id": "B-2",
        "account_source_id": "DF-0042",
        "entreprise": "Acme Industrie",
        "title": "Chef de projet S/4",
        "status": "PERDU",
        "need_date": "2023-01-10",
        "tjm_eur": None,
        "prescriber_name": "Paul Durand",
        "prescriber_title": "Directeur des achats",
        "prescriber_last_seen": "2023-01-10",
        "location": None,
        "technologies": ["SAP"],
    },
    {
        "need_id": "B-3",
        "account_source_id": "DF-0099",
        "entreprise": "Beta",
        "title": "Admin Salesforce",
        "status": "TERMINE",
        "need_date": None,
        "tjm_eur": 550,
        "prescriber_name": None,
        "prescriber_title": None,
        "prescriber_last_seen": None,
        "location": None,
        "technologies": ["SALESFORCE"],
    },
]

TODAY = date(2026, 10, 19)


@pytest.fixture
def fake(monkeypatch):
    sb = _FakeSupabase(
        rows={
            "dataforge_needs": NEEDS,
            "dataforge_accounts": [
                {"source_id": "DF-0042", "siren": "111111111", "cluster_id": "C1", "is_cluster_primary": True},
                {"source_id": "DF-0043", "siren": "222222222", "cluster_id": "C2", "is_cluster_primary": True},
                {"source_id": "DF-0044", "siren": "222222222", "cluster_id": "C3", "is_cluster_primary": True},
            ],
        }
    )
    monkeypatch.setattr(dn, "get_supabase", lambda: sb)
    return sb


def test_fraicheur_prescripteur_meme_seuil_et_meme_verdict_que_le_contrat_ts():
    # Seuil du contrat TS `PRESCRIBER_REVALIDATE_AFTER_DAYS` (dataforge-needs.ts).
    ts = (Path(__file__).resolve().parents[3] / "packages/contracts/src/schemas/dataforge-needs.ts").read_text()
    assert f"PRESCRIBER_REVALIDATE_AFTER_DAYS = {dn.PRESCRIBER_REVALIDATE_AFTER_DAYS}" in ts
    assert dn.prescriber_freshness("2026-03-01", TODAY) == {"kind": "dated", "date": "2026-03-01"}
    assert dn.prescriber_freshness("2024-01-15", TODAY) == {"kind": "to_revalidate", "date": "2024-01-15"}
    assert dn.prescriber_freshness(None, TODAY) == {"kind": "to_revalidate", "date": None}


async def test_siren_resout_le_compte_du_referentiel(fake):
    assert await dn.resolve_source_id("111111111") == {"kind": "resolved", "source_id": "DF-0042"}


async def test_NON_un_siren_porte_par_deux_grappes_est_a_verifier_jamais_choisi(fake):
    out = await dn.resolve_source_id("222222222")
    assert out["kind"] == "to_verify"
    assert "à vérifier" in out["reason"]
    assert await dn.resolve_source_id("999999999") is None
    assert await dn.resolve_source_id("") is None


async def test_besoins_d_un_compte_dates_avec_statut_et_prescripteur(fake):
    views = await dn.historical_needs(account_source_id="DF-0042", today=TODAY)
    assert [v["title"] for v in views] == ["Consultant SAP FI/CO", "Chef de projet S/4"]
    first = views[0]
    assert first["status"] == "GAGNE"
    assert first["status_label"] == "gagné"
    assert first["date"] == "2024-03-14"
    assert first["tjm_eur"] == 720
    assert first["prescriber"] == {
        "name": "Jeanne Martin",
        "role": "DSI adjointe",
        "freshness": {"kind": "dated", "date": "2026-06-01"},
    }
    assert views[1]["prescriber"]["freshness"]["kind"] == "to_revalidate"


async def test_besoins_par_technologie_filtrent_en_sql(fake):
    views = await dn.historical_needs(technology_code="SALESFORCE", today=TODAY)
    assert [v["company"] for v in views] == ["Beta"]
    assert ("contains", "technologies", ["SALESFORCE"]) in fake.queries[-1].filters
    # sans prescripteur, aucune ligne de prescripteur inventée
    assert views[0]["prescriber"] is None


async def test_NON_aucune_vue_ne_nomme_le_pack(fake):
    views = await dn.historical_needs(technology_code="SAP", today=TODAY)
    dumped = json.dumps(views, ensure_ascii=False).lower()
    for name in ("dataforge", "orion", "24_missions", "pipeline_crm"):
        assert name not in dumped


async def test_panne_du_store_rend_une_liste_vide_jamais_une_exception(monkeypatch):
    monkeypatch.setattr(dn, "get_supabase", lambda: _FakeSupabase(error=RuntimeError("down")))
    assert await dn.historical_needs(account_source_id="DF-1", today=TODAY) == []
    assert await dn.resolve_source_id("111111111") is None


async def test_sans_aucun_filtre_on_ne_lit_rien(fake):
    assert await dn.historical_needs(today=TODAY) == []
    assert fake.queries == []


# ── #4281.2 — besoins DU compte (et de son groupe) pour le plan et Laura ─────


@pytest.fixture
def owned(monkeypatch):
    sb = _FakeSupabase(
        rows={
            "accounts": [
                {
                    "id": "acc-1",
                    "user_id": "u1",
                    "company_name": "Acme",
                    "siren": "111111111",
                    "group_head_siren": None,
                },
                {
                    "id": "acc-2",
                    "user_id": "u1",
                    "company_name": "Ambigu",
                    "siren": "222222222",
                    "group_head_siren": None,
                },
            ],
            "dataforge_needs": NEEDS,
            "dataforge_accounts": [
                {"source_id": "DF-0042", "siren": "111111111", "cluster_id": "C1", "is_cluster_primary": True},
                {"source_id": "DF-0043", "siren": "222222222", "cluster_id": "C2", "is_cluster_primary": True},
                {"source_id": "DF-0044", "siren": "222222222", "cluster_id": "C3", "is_cluster_primary": True},
            ],
        }
    )
    monkeypatch.setattr(dn, "get_supabase", lambda: sb)
    return sb


async def test_besoins_du_compte_possede(owned):
    out = await dn.needs_for_owned_account("acc-1", "u1", today=TODAY)
    assert out["to_verify"] is None
    assert out["source_ids"] == ["DF-0042"]
    assert [n["title"] for n in out["needs"]] == ["Consultant SAP FI/CO", "Chef de projet S/4"]


async def test_NON_le_compte_d_un_autre_utilisateur_ne_rend_rien(owned):
    assert await dn.needs_for_owned_account("acc-1", "intrus", today=TODAY) == {
        "needs": [],
        "to_verify": None,
        "source_ids": [],
    }


async def test_rattachement_ambigu_dit_a_verifier_et_ne_lit_aucun_besoin(owned):
    out = await dn.needs_for_owned_account("acc-2", "u1", today=TODAY)
    assert out["needs"] == []
    assert out["to_verify"].startswith("à vérifier")


def test_bloc_du_plan_date_chaque_besoin_et_ne_nomme_pas_le_pack():
    views = [
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
                "freshness": {"kind": "to_revalidate", "date": "2023-01-01"},
            },
        }
    ]
    block = dn.historical_needs_block({"needs": views, "to_verify": None})
    assert "2024-03-14" in block and "gagné" in block and "720" in block
    assert "à revalider" in block
    assert "dataforge" not in block.lower() and "orion" not in block.lower()
    assert dn.historical_needs_block({"needs": [], "to_verify": None}) == ""
    assert "à vérifier" in dn.historical_needs_block({"needs": [], "to_verify": "à vérifier : 2 fiches"})


def test_GA_37_le_radar_et_les_besoins_ne_lisent_jamais_les_priors_sectoriels():
    """#4282.12 / #4281.5 — seuls des besoins OBSERVÉS entrent : aucune lecture de la table des priors
    (`dataforge_account_domains`, Tier D) depuis ces modules. La garde lit le vrai texte et sait dire NON."""
    root = Path(__file__).resolve().parents[1] / "app" / "services"
    sources = {
        name: (root / name).read_text() for name in ("dataforge_needs.py", "technology_radar.py", "radar_chat_tools.py")
    }
    assert all(len(text) > 1000 for text in sources.values())  # lit un corpus non vide
    forbidden = ("dataforge_account_domains", "sector_prior_demand", "commercial_opportunity_score")
    assert not [(n, f) for n, t in sources.items() for f in forbidden if f in t]


# ── Lot 762 P6 — le SIREN manquant est résolu et ÉCRIT avant la lecture DataForge ──────────────────────────────


class _Res:
    def __init__(self, status: str, siren: str | None = None, count: int = 1) -> None:
        self.status = status
        self.selected_siren = siren
        self.candidate_count = count


@pytest.fixture
def siren_less(monkeypatch):
    sb = _FakeSupabase(
        {
            "accounts": [
                {"id": "acc-9", "user_id": "u1", "company_name": "Acme Industrie", "siren": None, "group_head_siren": None}
            ],
            "dataforge_needs": NEEDS,
            "dataforge_accounts": [
                {"source_id": "DF-0042", "siren": "111111111", "cluster_id": "C1", "is_cluster_primary": True}
            ],
        }
    )
    writes: list[tuple] = []
    orig = _Query.select

    def update(self, data):
        writes.append(("update", self.table, data))
        return self

    def is_(self, col, val):
        writes.append(("is", col, val))
        return self

    monkeypatch.setattr(_Query, "update", update, raising=False)
    monkeypatch.setattr(_Query, "is_", is_, raising=False)
    monkeypatch.setattr(dn, "get_supabase", lambda: sb)
    assert orig  # le faux garde son select
    return sb, writes


async def test_compte_sans_siren_est_resolu_puis_lu_sans_ecriture_ia(siren_less, monkeypatch):
    async def fake(name, **kw):
        assert name == "Acme Industrie" and kw.get("strict") is True
        return _Res("unique", "111111111")

    monkeypatch.setattr(dn, "resolve_company_identity", fake)
    _sb, writes = siren_less
    out = await dn.needs_for_owned_account("acc-9", "u1", today=TODAY)
    assert not any(w[0] == "update" for w in writes)  # l'IA n'écrit jamais `accounts` : la persistance est à l'API
    assert out["source_ids"] == ["DF-0042"] and out["needs"]


async def test_NON_plusieurs_fiches_rien_n_est_rattache_ni_ecrit(siren_less, monkeypatch):
    async def fake(name, **kw):
        return _Res("ambiguous", None, 3)

    monkeypatch.setattr(dn, "resolve_company_identity", fake)
    _sb, writes = siren_less
    out = await dn.needs_for_owned_account("acc-9", "u1", today=TODAY)
    assert out["needs"] == [] and out["source_ids"] == [] and out["to_verify"].startswith("à vérifier")
    assert not any(w[0] == "update" for w in writes)


async def test_NON_registre_muet_ou_aucun_candidat_rien_n_est_ecrit(siren_less, monkeypatch):
    async def none(name, **kw):
        return _Res("none")

    monkeypatch.setattr(dn, "resolve_company_identity", none)
    _sb, writes = siren_less
    out = await dn.needs_for_owned_account("acc-9", "u1", today=TODAY)
    assert out == {"needs": [], "to_verify": None, "source_ids": []}
    assert not any(w[0] == "update" for w in writes)

    async def boom(name, **kw):
        raise RuntimeError("registre down")

    monkeypatch.setattr(dn, "resolve_company_identity", boom)
    assert (await dn.needs_for_owned_account("acc-9", "u1", today=TODAY))["needs"] == []
