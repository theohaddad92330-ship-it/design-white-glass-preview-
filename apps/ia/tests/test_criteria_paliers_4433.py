"""#4434 / #4435 / #4436 (épopée #4433, Louis 21/10/2026) — un référentiel partagé, des paliers étiquetés.

React à zéro exact remonte des comptes qui recrutent en JavaScript / front, étiquetés « proche : JavaScript » ;
un secteur maigre s'ouvre à ses voisins ; une tranche vide à la tranche voisine. Au-dessus du seuil, RIEN
n'est élargi (la garde dit NON). Les sources sont simulées : aucun appel réseau.
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from app.services import criteria_referential as ref
from app.services.criteria_widening import exact_first, widen_rows
from app.services.discover_skill_offers import SkillAccounts

# ── Le référentiel, lu depuis le miroir généré ──────────────────────────────────────────────────


def test_le_miroir_genere_porte_le_seuil_unique_et_60_competences() -> None:
    assert ref.CRITERIA_WIDEN_MIN_RESULTS == 25
    assert len(ref.referential()["skills"]) >= 60


def test_un_intitule_non_norme_se_rattache() -> None:
    assert ref.canonical_skill("dev front React/Next") == "react"
    assert ref.canonical_skill("K8s") == "kubernetes"
    assert ref.canonical_skill("Permis B") is None


def test_react_palier_1_javascript_palier_2_developpement_web() -> None:
    tiers = ref.skill_widening_tiers("React")
    assert [t for t, _ in tiers] == [1, 2]
    assert tiers[0][1][0] == ("javascript", "JavaScript")
    assert all(code == "web" for code, _ in tiers[1][1])


def test_clojure_a_une_famille_et_un_inconnu_tombe_au_domaine() -> None:
    # #4433.2 — « Clojure » à zéro tentait AUCUN palier (ni famille ni domaine).
    for name in ("Clojure", "Elixir", "Haskell", "OCaml", "Erlang", "F#", "Scala"):
        tiers = ref.skill_widening_tiers(name)
        assert [t for t, _ in tiers] == [1, 2], name
        assert ref.canonical_skill(name) not in [code for code, _ in tiers[0][1]], name
    unknown = ref.skill_widening_tiers("Outil maison Zephyr")
    assert [t for t, _ in unknown] == [2]
    assert all(code == "web" for code, _ in unknown[0][1])
    assert ref.skill_widening_tiers("  ") == []


def test_aeronautique_s_ouvre_a_la_defense() -> None:
    tiers = ref.sector_widening_tiers(["aerospace"])
    assert tiers[0][0] == 1 and tiers[0][1][0] == "defense"
    assert "aerospace" not in tiers[1][1] and "defense" not in tiers[1][1]


def test_eti_s_ouvre_a_pme_et_gc_puis_tpe() -> None:
    tiers = ref.size_widening_tiers([(250, 999)])
    assert [(t, [b["code"] for b in bands]) for t, bands in tiers] == [(1, ["PME", "GC"]), (2, ["TPE"])]
    assert ref.size_band_of(None) is None  # non publié : aucune tranche, jamais « 0 »


# ── Le moteur de paliers ─────────────────────────────────────────────────────────────────────────


def _rows(prefix: str, n: int) -> list[dict[str, Any]]:
    return [{"siren": f"{prefix}{i:08d}"} for i in range(n)]


def test_au_dessus_du_seuil_rien_n_est_elargi() -> None:
    fetch = AsyncMock(return_value=[({"siren": "999999999"}, "javascript")])
    rows, info = asyncio.run(widen_rows(_rows("1", ref.CRITERIA_WIDEN_MIN_RESULTS), [("skill", 1, fetch)], key=lambda r: r["siren"]))
    assert info is None
    assert len(rows) == ref.CRITERIA_WIDEN_MIN_RESULTS
    assert all("widenedBy" not in r for r in rows)
    fetch.assert_not_called()


def test_sous_le_seuil_les_paliers_s_ajoutent_etiquetes_sans_doublon() -> None:
    exact = _rows("1", 2)
    tier1 = AsyncMock(return_value=[(exact[0], "javascript"), ({"siren": "200000001"}, "javascript")])
    tier2 = AsyncMock(return_value=[({"siren": "300000001"}, "web")])
    rows, info = asyncio.run(widen_rows(exact, [("skill", 1, tier1), ("skill", 2, tier2)], key=lambda r: r["siren"]))
    assert [r["siren"] for r in rows] == ["100000000", "100000001", "200000001", "300000001"]
    assert rows[2]["widenedBy"] == {"axis": "skill", "tier": 1, "code": "javascript"}
    assert rows[3]["widenedBy"] == {"axis": "skill", "tier": 2, "code": "web"}
    assert info == {
        "minResults": ref.CRITERIA_WIDEN_MIN_RESULTS,
        "exactCount": 2,
        "steps": [
            {"axis": "skill", "tier": 1, "codes": ["javascript"], "added": 1},
            {"axis": "skill", "tier": 2, "codes": ["web"], "added": 1},
        ],
    }


def test_l_exact_reste_en_tete() -> None:
    mixed = [{"siren": "a", "widenedBy": {"tier": 2}}, {"siren": "b"}, {"siren": "c", "widenedBy": {"tier": 1}}]
    assert [c["siren"] for c in exact_first(mixed)] == ["b", "c", "a"]


# ── Découvrir (et donc l'outil de recherche de comptes de Laura, même moteur) ─────────────────────


def _account(
    siren: str,
    name: str,
    skill: str,
    headcount: str = "250 à 499 salariés",
    naf: tuple[str, str] = ("62.01Z", "Programmation informatique"),
) -> dict[str, Any]:
    return {
        "siren": siren,
        "name": name,
        "nafCode": naf[0],
        "sector": naf[1],
        "city": "PARIS",
        "department": "75",
        "headcountRange": headcount,
        "skillEvidence": {
            "skill": skill,
            "offerCount": 1,
            "latestOffer": {
                "title": f"Développeur {skill}",
                "city": "Paris",
                "date": "2026-10-15",
                "url": None,
                "source": None,
            },
        },
    }


@pytest.fixture
def skill_engine(monkeypatch):
    """``find_skill_accounts`` doublé : chaque terme cherché rend ses comptes ; les appels sont notés."""
    by_term: dict[str, list[dict]] = {}
    calls: list[list[str]] = []

    async def fake(skills, zone, profile, *, deadline, city=None, **_circle):
        calls.append(list(skills))
        accounts = [a for term in skills for a in by_term.get(term, [])]
        return SkillAccounts(
            accounts=accounts,
            intermediaries=[],
            info={"skills": list(skills), "emptyCause": None if accounts else "no_offers"},
        )

    monkeypatch.setattr("app.routers.discover.find_skill_accounts", fake)
    return by_term, calls


def _post(client, filters: dict[str, Any], **extra: Any):
    with patch("app.routers.discover.call_claude", new_callable=AsyncMock, return_value=({"angles": []}, None)):
        return client.post("/discover/registry", json={"filters": filters, "profile_data": {}, **extra})


def test_react_a_zero_exact_remonte_javascript_etiquete(client, skill_engine) -> None:
    by_term, calls = skill_engine
    by_term["JavaScript"] = [_account("552100554", "ACME WEB", "JavaScript")]

    body = _post(client, {"technologiesObserved": ["React"]}).json()

    assert calls[0] == ["React"]
    # palier 1 : la famille, bornée à SKILL_MAX_TERMS = 5 (#4579 L5 : 3 → 5)
    assert ["JavaScript", "TypeScript", "Angular", "Vue.js", "Next.js"] in calls
    candidate = body["candidates"][0]
    assert candidate["siren"] == "552100554"
    assert candidate["widenedBy"] == {"axis": "skill", "tier": 1, "code": "javascript"}
    widening = body["query"]["widening"]
    assert widening["exactCount"] == 0
    assert widening["steps"][0]["codes"] == ["javascript"]


def test_au_dessus_du_seuil_d_exacts_aucun_elargissement_dit_non(client, skill_engine) -> None:
    by_term, calls = skill_engine
    by_term["React"] = [_account(f"55210{i:04d}", f"EXACT {i}", "React") for i in range(ref.CRITERIA_WIDEN_MIN_RESULTS)]
    by_term["JavaScript"] = [_account("552100554", "ACME WEB", "JavaScript")]

    # #4419.8 — le seuil vaut pour une page de la taille du seuil ; une page plus longue lit le voisin.
    body = _post(client, {"technologiesObserved": ["React"]}, limit=ref.CRITERIA_WIDEN_MIN_RESULTS).json()

    assert calls == [["React"]]
    assert "widening" not in body["query"]
    assert all("widenedBy" not in c for c in body["candidates"])


def test_revenir_au_strict_n_elargit_pas(client, skill_engine) -> None:
    by_term, calls = skill_engine
    by_term["JavaScript"] = [_account("552100554", "ACME WEB", "JavaScript")]

    body = _post(client, {"technologiesObserved": ["React"]}, strictCriteria=True).json()

    assert calls == [["React"]]
    assert body["candidates"] == []
    assert "widening" not in body["query"]


def test_competence_eti_vide_la_taille_voisine_est_nommee(client, skill_engine) -> None:
    by_term, _ = skill_engine
    by_term["SAP"] = [_account("552100554", "GROS COMPTE", "SAP", headcount="2 000 à 4 999 salariés")]

    body = _post(client, {"technologiesObserved": ["SAP"], "headcountMin": 250, "headcountMax": 999}).json()

    candidate = body["candidates"][0]
    assert candidate["widenedBy"] == {"axis": "size", "tier": 1, "code": "GC"}


@pytest.fixture
def registry(monkeypatch):
    """Le registre doublé : il rend des lignes selon les codes NAF et la tranche demandés."""
    seen: list[Any] = []
    by_naf: dict[str, list[dict]] = {}

    async def _stub(filters, limit, degraded=None):
        seen.append(filters)
        wanted = set((filters.naf_code or "").split(",")) - {""}
        return [row for naf, rows in by_naf.items() if not wanted or naf in wanted for row in rows]

    monkeypatch.setattr("app.routers.discover._registry_search", _stub)
    monkeypatch.setattr("app.routers.discover._fallback_search", _stub)
    return by_naf, seen


def _company(siren: str, name: str, naf: str, headcount: str = "250 à 499 salariés") -> dict[str, Any]:
    return {
        "siren": siren,
        "name": name,
        "nafCode": naf,
        "sector": "Construction aéronautique et spatiale",
        "city": "TOULOUSE",
        "department": "31",
        "headcountRange": headcount,
        "creationDate": "1990-01-01",
    }


def test_aeronautique_a_zero_les_voisins_defense_sont_etiquetes(client, registry) -> None:
    by_naf, _ = registry
    by_naf["30.40Z"] = [_company("552100554", "BLINDES SA", "30.40Z")]

    body = _post(client, {"nafCode": "30.30Z"}).json()

    widened = [c for c in body["candidates"] if c.get("widenedBy")]
    assert widened and widened[0]["widenedBy"] == {"axis": "sector", "tier": 1, "code": "defense"}
    assert body["query"]["widening"]["steps"][0]["axis"] == "sector"


def test_secteur_au_dessus_du_seuil_rien_n_est_elargi(client, registry) -> None:
    by_naf, seen = registry
    by_naf["30.30Z"] = [_company(f"5521{i:05d}", f"AERO {i}", "30.30Z") for i in range(ref.CRITERIA_WIDEN_MIN_RESULTS)]
    by_naf["30.40Z"] = [_company("552100554", "BLINDES SA", "30.40Z")]

    body = _post(client, {"nafCode": "30.30Z"}).json()

    assert "widening" not in body["query"]
    assert all("widenedBy" not in c for c in body["candidates"])
    assert all((f.naf_code or "") == "30.30Z" for f in seen)


# ── Laura : l'outil de recherche de comptes passe par le MÊME moteur, l'élargissement est dans le code ──


@pytest.mark.asyncio
async def test_laura_react_a_zero_remonte_javascript_sans_demander(skill_engine) -> None:
    from app.services import chat_tools

    by_term, _ = skill_engine
    # Un compte CLIENT (vente à distance), pas une ESN : depuis #4434.3, une ESN sort de la liste de Laura et se range
    # à part (`competitors_aside`) — le palier voisin se prouve sur un compte qui reste une cible.
    by_term["JavaScript"] = [_account("552100554", "ACME WEB", "JavaScript", naf=("47.91B", "Vente à distance"))]

    with patch("app.routers.discover.call_claude", new_callable=AsyncMock, return_value=({"angles": []}, None)):
        out = await chat_tools._run_account_search({"technologies": ["React"], "department": "75"}, profile_data={})

    assert "items" in out, out
    item = next(i for i in out["items"] if i["siren"] == "552100554")
    assert item["widened"] == "proche : JavaScript"
    note = out["widening_note"]
    assert "élargi" in note and "ne demande jamais" in note


def test_l_etiquette_dit_taille_non_publiee_jamais_zero() -> None:
    from app.services.criteria_referential import widened_label_fr

    assert widened_label_fr({"axis": "size", "tier": 1, "code": None}) == "taille non publiée"
    assert widened_label_fr({"axis": "size", "tier": 1, "code": "GC"}) == "taille voisine : GC"
    assert widened_label_fr({"axis": "sector", "tier": 1, "code": "defense"}) == "secteur voisin : défense"
    assert widened_label_fr({"axis": "skill", "tier": 2, "code": "web"}) == "proche : développement web"
    assert widened_label_fr(None) is None


def test_le_bandeau_annonce_ce_qui_est_affichable_4435_2() -> None:
    from app.routers.discover import _widening_net_of_exclusions

    by = {"axis": "sector", "tier": 1, "code": "defense"}
    companies = [{"siren": "1"}, {"siren": "2", "widenedBy": by}, {"siren": "3", "widenedBy": by}]
    query = {"widening": {"minResults": 10, "exactCount": 1, "steps": [{**by, "codes": ["defense"], "added": 2}]}}
    keep = [{"verdict": "recommended"}] * 3
    assert _widening_net_of_exclusions(query, companies, keep) == query
    one_out = [{"verdict": "recommended"}, {"verdict": "excluded"}, {"verdict": "recommended"}]
    assert _widening_net_of_exclusions(query, companies, one_out)["widening"]["steps"][0]["added"] == 1
    all_out = [{"verdict": "recommended"}, {"verdict": "excluded"}, {"verdict": "excluded"}]
    assert "widening" not in _widening_net_of_exclusions(query, companies, all_out)
