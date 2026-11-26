"""LAURA-OFFRES-4563 (Louis 25/10/2026) — « trouve-moi des offres vue et java sur lille » rend des OFFRES.

Mesuré en prod le 25/10 à 18 h 56 : sans consultant ni compte, Laura rendait 2 pages web (repli ``web_search``) :
aucun de ses outils ne rendait d'OFFRES. Le seul chemin du moteur (``find_skill_accounts``) rend des COMPTES.

Ce que ces tests tiennent (déterministes, SANS réseau — les sources sont des doublures SOUS le moteur : le vrai tri
métier de ``harvest_skill_offers`` et le vrai moteur de cascade tournent) :
1. sans consultant ni compte, des OFFRES sortent (intitulé, employeur, date, lieu, lien), pas des comptes ;
2. moins de 5 offres du métier au premier passage → la cascade s'ouvre et le palier atteint est DIT ;
3. ⛔ 3 offres du métier après TOUTE la cascade → 3 rendues, 0 hors métier, et c'est dit ;
4. cache 30 j (le second appel ne paie rien) et plafond d'appels payés (``CASCADE_PAID_CALLS_MAX``) ;
5. aucun fournisseur nommé, un champ inconnu est NOMMÉ (jamais « 0 », l'offre n'est pas jetée) ;
6. l'outil est déclaré à Laura, sa description renvoie à lui pour toute demande d'offres, ``web_search`` reste un
   complément nommé ; le chemin talent (comptes) n'est pas détourné.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.services import discover_skill_offers as skill
from app.services import offers_cascade as oc
from app.services import provider_cache
from app.services.data_sources import job_aggregators

TODAY = datetime.now(UTC).date()
RECENT = (TODAY - timedelta(days=5)).isoformat()
PAID_KEYS = {
    "theirstack": "THEIRSTACK_API_KEY",
    "mantiks": "MANTIKS_API_KEY",
    "fantastic_jobs": "FANTASTIC_JOBS_API_KEY",
}


def _offer(n: int, title: str, **extra: Any) -> dict:
    return {
        "employer": f"Société {n}",
        "siren": None,
        "title": title,
        "city": "Lille",
        "department": "59",
        "date": RECENT,
        "url": f"https://offres.example/{abs(hash(title)) % 10**8}-{n}",
        "source": "france_travail",
        "contractType": "CDI",
        **extra,
    }


def _metier(n: int, tech: str = "Vue.js") -> dict:
    return _offer(n, f"Développeur full stack Java {tech} #{n}")


class World:
    """Les sources simulées : ce que chacune rend PAR terme demandé, tous les appels notés."""

    def __init__(self) -> None:
        self.ft: dict[str, list[dict]] = {}
        self.paid_answers: dict[str, Any] = {}
        self.ft_calls: list[str] = []
        self.paid_calls: list[str] = []


@pytest.fixture
def world(monkeypatch: pytest.MonkeyPatch) -> World:
    state = World()
    for env in PAID_KEYS.values():
        monkeypatch.delenv(env, raising=False)
    for env in ("ADZUNA_APP_ID", "ADZUNA_APP_KEY", "JOOBLE_API_KEY"):
        monkeypatch.delenv(env, raising=False)

    store: dict[tuple[str, str], Any] = {}

    async def get_json(namespace: str, key: str) -> Any:
        return store.get((namespace, key))

    async def set_json(namespace: str, key: str, value: Any, ttl: int | None = None) -> None:
        store[(namespace, key)] = value

    monkeypatch.setattr(provider_cache, "get_json", get_json)
    monkeypatch.setattr(provider_cache, "set_json", set_json)

    class _Probe:
        async def post(self, url: str, json: Any = None, **_: Any) -> None:
            self.body = json

    async def request(provider, company, client, send, gate, *, headers_out=None):
        if provider == "theirstack":
            probe = _Probe()
            await send(probe)
            if (probe.body or {}).get("include_total_results"):
                return {}  # #4725 — le compte à 1 crédit n'est pas une page payée : le plafond compte les pages
        state.paid_calls.append(provider)
        return state.paid_answers.get(provider)

    monkeypatch.setattr(job_aggregators, "_request", request)

    async def france_travail(term: str, department: str | None, profile: Any, *, page: int = 0) -> list[dict]:
        state.ft_calls.append(term)
        return [dict(o) for o in state.ft.get(term, [])]

    async def none(*_a: Any, **_k: Any) -> None:
        return None

    async def no_offers(*_a: Any, **_k: Any) -> list[dict]:
        return []

    monkeypatch.setattr(skill, "france_travail_offers", france_travail)
    monkeypatch.setattr(skill, "adzuna_offers", none)
    monkeypatch.setattr(skill, "cached_offers", no_offers)
    return state


async def _search(**tool_input: Any) -> dict:
    from app.services.job_offers_search import execute_search_job_offers

    return await execute_search_job_offers(tool_input)


# ── 1 ─ des OFFRES, sans consultant ni compte ────────────────────────────────────────────────────


async def test_sans_consultant_ni_compte_des_offres_sont_rendues(world: World) -> None:
    world.ft["Vue.js"] = [_metier(i, "Vue.js") for i in range(1, 4)]
    world.ft["Java"] = [_offer(i, f"Ingénieur développement Java Spring #{i}") for i in range(10, 13)]

    out = await _search(skills=["Vue.js", "Java"], city="Lille")

    assert "error" not in out
    assert "accounts" not in out and "comptes" not in out
    offers = out["offers"]
    assert len(offers) >= 5
    for row in offers:
        for field in ("title", "employer", "date", "city", "url"):
            assert row.get(field), f"{field} absent de {row}"
        assert row["city"] == "Lille"
    assert out["cascade"]["found"] == len(offers)
    assert out["cascade"]["floor"] == 5 and out["cascade"]["belowFloor"] is False


async def test_une_offre_qui_cite_les_deux_competences_passe_devant(world: World) -> None:
    world.ft["Vue.js"] = [_offer(1, "Développeur Vue.js", date=RECENT)]
    world.ft["Java"] = [_offer(2, "Développeur Java", date=RECENT)]
    both = _offer(3, "Développeur full stack Java Vue.js", date=(TODAY - timedelta(days=40)).isoformat())
    world.ft["Vue.js"].append(both)

    out = await _search(skills=["Vue.js", "Java"], city="Lille")

    assert out["offers"][0]["title"] == "Développeur full stack Java Vue.js"
    assert set(out["offers"][0]["matchedSkills"]) == {"Vue.js", "Java"}


async def test_ville_demandee_filtre_sur_la_ville_quand_le_plancher_est_tenu(world: World) -> None:
    world.ft["Java"] = [
        *[_offer(i, f"Développeur Java #{i}") for i in range(1, 6)],
        {**_offer(9, "Développeur Java senior"), "city": "Maubeuge"},
    ]

    out = await _search(skills=["Java"], city="Lille")

    assert "Maubeuge" not in [o["city"] for o in out["offers"]]
    assert "écartée" in out["summary"]


async def test_ville_sous_le_plancher_les_autres_villes_sont_rendues_et_marquees(world: World) -> None:
    world.ft["Java"] = [_offer(1, "Développeur Java"), {**_offer(2, "Développeur Java senior"), "city": "Maubeuge"}]

    out = await _search(skills=["Java"], city="Lille")

    assert [(o["employer"], o["outsideCity"]) for o in out["offers"]] == [("Société 1", False), ("Société 2", True)]


async def test_sans_competence_erreur_claire() -> None:
    out = await _search(skills=[], city="Lille")
    assert out.get("error")
    assert "offers" not in out


# ── 2 ─ sous le plancher : la cascade s'ouvre, le palier atteint est dit ─────────────────────────


async def test_sous_le_plancher_la_cascade_s_ouvre_et_dit_le_palier(world: World) -> None:
    # Vague IX / #4579 — le PREMIER passage cherche désormais aussi les ÉCRITURES d'une compétence
    # (« Vue.js » ⇒ vuejs, vue 3). Pour prouver que la CASCADE s'ouvre, le renfort doit donc arriver sous une
    # forme que le premier passage ne cherche PAS : « Spring » n'a aucune écriture déclarée, ses voisins
    # (« spring boot »…) restent au palier `terms`. Avec « Vue.js », le plancher serait atteint d'emblée —
    # c'est l'objet du test suivant. La compétence choisie se VÉRIFIE ici, elle n'est pas supposée.
    from app.services.criteria_referential import normalise_skill_text, skill_written_forms
    from app.services.offers_cascade_tiers import neighbour_forms

    asked = "Spring"
    premier_passage = {normalise_skill_text(f) for f in skill_written_forms(asked)}
    forms = [f for f in neighbour_forms(asked) if normalise_skill_text(f) not in premier_passage]
    assert forms, f"le référentiel doit déclarer un voisin de {asked} que le premier passage ne cherche pas"
    world.ft[asked] = [_metier(i, asked) for i in range(1, 3)]  # 2 au premier passage
    world.ft[forms[0]] = [_offer(20 + i, f"Développeur {forms[0]} full stack #{i}") for i in range(4)]

    out = await _search(skills=[asked], city="Lille")

    assert len(out["offers"]) >= oc.OFFERS_FLOOR
    tiers = {t["tier"]: t for t in out["cascade"]["tiers"]}
    assert tiers["terms"]["status"] == oc.STATUS_TRIED and tiers["terms"]["gained"] >= 3
    assert out["cascade"]["belowFloor"] is False
    assert out["cascade"]["reachedAt"] == "terms"
    assert "termes voisins" in out["summary"]
    assert forms[0] in world.ft_calls


async def test_les_ecritures_partent_au_premier_passage_sans_ouvrir_de_palier(world: World) -> None:
    """Vague IX / #4579 — « Vue.js » part aussi sous ses écritures DÈS le premier passage : le plancher est
    atteint sans ouvrir le palier des termes voisins. Une écriture n'est pas un voisin — elle ne coûte pas un
    palier de plus, et c'est tout l'intérêt de #4579 par rapport à la cascade de #4563."""
    world.ft["Vue.js"] = [_metier(i, "Vue.js") for i in range(1, 3)]  # 2 sous la saisie
    world.ft["vuejs"] = [_offer(20 + i, f"Développeur vuejs full stack #{i}") for i in range(4)]

    out = await _search(skills=["Vue.js"], city="Lille")

    assert "vuejs" in world.ft_calls  # cherchée au PREMIER passage, pas par la cascade
    assert len(out["offers"]) >= oc.OFFERS_FLOOR
    assert out["cascade"]["belowFloor"] is False
    tiers = {t["tier"]: t for t in out["cascade"]["tiers"]}
    assert tiers["terms"]["status"] == oc.STATUS_REACHED  # le palier voisin n'a pas eu à s'ouvrir


async def test_plancher_atteint_d_emblee_aucun_palier_ouvert(world: World) -> None:
    world.ft["Vue.js"] = [_metier(i, "Vue.js") for i in range(1, 8)]

    out = await _search(skills=["Vue.js"], city="Lille")

    assert out["cascade"]["reachedAt"] == "sources"
    assert [t["status"] for t in out["cascade"]["tiers"] if t["tier"] != "sources"] == [oc.STATUS_REACHED] * 3
    assert world.paid_calls == []


# ── 3 ─ ⛔ jamais en filtrant moins ──────────────────────────────────────────────────────────────


async def test_trois_offres_du_metier_apres_toute_la_cascade_on_en_rend_trois_et_on_le_dit(world: World) -> None:
    metier = [_metier(i, "Vue.js") for i in range(1, 4)]
    hors_metier = [
        _offer(50 + i, f"Chef de rang restaurant #{i}", description="équipe, outils : Java, Vue.js") for i in range(4)
    ]
    world.ft["Vue.js"] = metier + hors_metier

    out = await _search(skills=["Vue.js"], city="Lille")

    titles = [o["title"] for o in out["offers"]]
    assert len(titles) == 3
    assert not [t for t in titles if "Chef de rang" in t]
    cascade = out["cascade"]
    assert cascade["belowFloor"] is True and cascade["found"] == 3 and cascade["floor"] == 5
    assert cascade["reason"] == oc.REASON_SHORT
    # toute la cascade a été parcourue avant de conclure
    statuses = {t["tier"]: t["status"] for t in cascade["tiers"]}
    assert statuses["window"] in {oc.STATUS_TRIED, oc.STATUS_UNAVAILABLE, oc.STATUS_FAILED, oc.STATUS_CAPPED}
    assert statuses["window"] != oc.STATUS_REACHED
    assert "3" in out["summary"] and "5" in out["summary"]
    assert "hors métier" in out["summary"].lower() or "hors de ton métier" in out["summary"].lower()


# ── 4 ─ cache 30 j et plafond d'appels payés ─────────────────────────────────────────────────────


async def test_deux_appels_identiques_le_second_ne_paie_rien(world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "x")
    world.paid_answers["theirstack"] = {"data": []}

    first = await _search(skills=["Vue.js"], city="Lille")
    paid_after_first = len(world.paid_calls)
    second = await _search(skills=["Vue.js"], city="Lille")

    assert paid_after_first >= 1
    assert len(world.paid_calls) == paid_after_first, "le second appel a payé"
    assert second["cascade"]["paidCalls"] == 0
    assert second["offers"] == first["offers"]


async def test_le_plafond_d_appels_payes_tient_cascade_comprise(world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    for env in PAID_KEYS.values():
        monkeypatch.setenv(env, "x")
    world.paid_answers = {"theirstack": {"data": []}, "mantiks": {"data": []}, "fantastic_jobs": []}

    out = await _search(skills=["Vue.js", "Java", "Python"], city="Lille")

    assert len(world.paid_calls) <= oc.CASCADE_PAID_CALLS_MAX
    assert out["cascade"]["paidCalls"] <= oc.CASCADE_PAID_CALLS_MAX
    assert out["cascade"]["paidCalls"] == len(world.paid_calls)
    assert out["offers"] == []
    assert out["cascade"]["found"] == 0 and out["cascade"]["belowFloor"] is True


async def test_un_gros_compte_n_ouvre_pas_le_plafond_de_pages_et_le_non_achete_est_nomme(
    world: World, monkeypatch: pytest.MonkeyPatch
) -> None:
    """#4725 — le compte propose beaucoup de pages, le plafond de la cascade dispose : jamais plus de
    ``CASCADE_PAID_CALLS_MAX`` pages payées, et ce qui n'a pas été acheté est NOMMÉ (``notAttempted``)."""
    monkeypatch.setenv("THEIRSTACK_API_KEY", "x")
    pages: list[str] = []

    async def request(provider, company, client, send, gate, *, headers_out=None):
        class _Probe:
            async def post(self, url: str, json: Any = None, **_: Any) -> None:
                self.body = json

        probe = _Probe()
        await send(probe)
        if (probe.body or {}).get("include_total_results"):
            return {"metadata": {"total_results": 5000}, "data": []}
        pages.append(provider)
        n = len(pages)
        return {
            "data": [
                {"id": n * 1000 + i, "job_title": f"Dev Vue.js {n}-{i}", "company": f"Co{n}-{i}"} for i in range(100)
            ]
        }

    monkeypatch.setattr(job_aggregators, "_request", request)

    out = await _search(skills=["Vue.js", "Java", "Python"], city="Lille")

    assert len(pages) <= oc.CASCADE_PAID_CALLS_MAX
    assert out["cascade"]["paidCalls"] == len(pages)
    assert sum(t["notAttempted"] for t in out["cascade"]["tiers"]) >= 1


# ── 5 ─ doctrine : fournisseurs, valeurs absentes ────────────────────────────────────────────────


async def test_aucun_fournisseur_nomme_et_l_inconnu_est_nomme(world: World) -> None:
    sans_statut = {**_metier(1, "Vue.js"), "contractType": None}
    world.ft["Vue.js"] = [sans_statut, *[_metier(i, "Vue.js") for i in range(2, 7)]]

    out = await _search(skills=["Vue.js"], city="Lille")

    blob = json.dumps(out, ensure_ascii=False).lower()
    for provider in ("france travail", "france_travail", "adzuna", "theirstack", "mantiks", "fantastic", "jooble"):
        assert provider not in blob, provider
    row = next(o for o in out["offers"] if o["employer"] == "Société 1")  # l'offre sans statut n'est PAS jetée
    assert "statut" in row["unknown"] and "TJM" in row["unknown"] and "télétravail" in row["unknown"]
    assert row["contract"] is None and row["dailyRate"] is None and row["remote"] is None
    assert 0 not in (row["dailyRate"], row["remote"])


# ── 6 ─ l'outil est déclaré, sa description est l'interface ─────────────────────────────────────


def test_l_outil_est_declare_a_laura_et_web_search_reste_un_complement() -> None:
    from app.services.chat_tools import CHAT_TOOLS

    by_name = {t["name"]: t for t in CHAT_TOOLS}
    tool = by_name["search_job_offers"]
    desc = tool["description"]
    assert "web_search" in desc and "complément" in desc.lower()
    assert "offre" in desc.lower()
    assert tool["input_schema"]["required"] == ["skills"]
    assert "consultant" not in json.dumps(tool["input_schema"]).lower()
    web = by_name["web_search"]["description"]
    assert "search_job_offers" in web  # web_search renvoie lui-même vers l'outil d'offres
    # le chemin talent (comptes) est intact et distinct
    assert "find_accounts_for_talent" in by_name


async def test_le_dispatcher_route_l_outil(world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import chat_tools

    world.ft["Vue.js"] = [_metier(i, "Vue.js") for i in range(1, 7)]
    out = await chat_tools.execute_chat_tool(
        "search_job_offers", {"skills": ["Vue.js"], "city": "Lille"}, user_id="u1", profile_data={}
    )
    assert len(out["offers"]) >= 5


# ── 7 ─ Laura AGIT : elle élargit la ZONE toute seule, en disant le palier ───────────────────────


async def test_ville_trop_mince_elle_elargit_au_departement_et_le_dit(world: World) -> None:
    world.ft["Java"] = [
        _offer(1, "Développeur Java"),
        _offer(2, "Développeur Java senior"),
        *[{**_offer(10 + i, f"Ingénieur Java #{i}"), "city": "Roubaix"} for i in range(4)],
    ]

    out = await _search(skills=["Java"], city="Lille")

    cities = [o["city"] for o in out["offers"]]
    assert len(cities) == 6
    assert cities[:2] == ["Lille", "Lille"], "les offres de la ville demandée passent devant"
    assert "département" in out["summary"].lower()
    assert "lille" in out["summary"].lower()
    zone = {t["tier"]: t for t in out["cascade"]["zoneTiers"]}
    assert zone["department"]["gained"] == 4
    assert out["cascade"]["belowFloor"] is False
    assert "écartée" not in out["summary"], "des offres rendues ne sont plus « écartées »"


async def test_departement_trop_mince_elle_elargit_a_la_region(world: World) -> None:
    world.ft["Java"] = [_offer(1, "Développeur Java")]
    world.ft["Java"] += [
        {**_offer(20 + i, f"Ingénieur Java #{i}"), "city": "Arras", "department": "62"} for i in range(5)
    ]

    out = await _search(skills=["Java"], city="Lille")

    assert len(out["offers"]) == 6
    assert "région" in out["summary"].lower()
    assert {t["tier"] for t in out["cascade"]["zoneTiers"]} >= {"department", "region"}


async def test_zero_offre_elle_nomme_tout_ce_qu_elle_a_essaye(world: World) -> None:
    out = await _search(skills=["Java"], city="Lille")

    assert out["offers"] == [] and "error" not in out
    said = out["summary"].lower()
    for tried in ("lille", "termes voisins", "fenêtre", "département", "région"):
        assert tried in said, tried
    assert "veux-tu" not in said and "souhaites-tu" not in said and "?" not in said


# ── 8 ─ #4563 (recette 27/10) : l'outil est appelé, mais ce qu'il rend doit SE VOIR ──────────────────
# Prod 27/10 : « Les offres Java déjà trouvées à Lille sont suffisamment nombreuses pour ne pas élargir » — 0
# intitulé, 0 date. La carte est donc bâtie CÔTÉ OUTIL et greffée en fin de tour (même mécanisme que #4065), pour que
# l'affichage des offres ne dépende pas du bon vouloir du modèle.
#
# ⚠️ 29/10 (fusion du lot 24) — ce chemin est tenu de bout en bout par `test_laura_offres_4563_rendu.py` (#4563.1,
# arrivé sur main entre-temps) : la carte posée par le code, l'absence qui ne fait aucune ligne, et le REFUS de la
# phrase de justification. Les tests écrits ici le doublaient, et l'un d'eux attendait que cette phrase RESTE dans la
# réponse — #4563.1 la retire. Ne reste donc ici que ce que l'autre fichier ne dit pas : la description de l'outil.


def test_la_description_nomme_la_carte_posee_par_l_outil() -> None:
    from app.services.job_offers_search import SEARCH_JOB_OFFERS_TOOL

    assert "card" in SEARCH_JOB_OFFERS_TOOL["description"]
