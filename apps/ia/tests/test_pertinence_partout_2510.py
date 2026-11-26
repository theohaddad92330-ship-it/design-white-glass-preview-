"""PERTINENCE-PARTOUT (Louis, 25/10/2026) — la MÊME règle métier à quatre endroits.

Découvrir est corrigé sur la base ; ici : l'analyse de compte, les signaux de Laura, la page /signals.
Déterministe : aucun réseau, aucun modèle.
"""

from __future__ import annotations

import logging

import pytest

from app.models.research import ResearchRequest
from app.routers.phase1_research import _rank_and_keep_run_jobs
from app.services import bellum_api
from app.services.chat_tools import execute_chat_tool

USER = "22222222-4222-4222-8222-222222222222"

#: Une ESN informatique qui place des profils : « toute ouverture de poste est une piste » (#1124).
ESN_IT_PLACEUR = {"offerDomain": "esn_it", "recruitsForClients": True}
#: Une ESN informatique qui vend des développeurs, métiers déclarés.
ESN_IT_DEV = {"offerDomain": "esn_it", "placedRoles": ["Développeur"]}

HORS_METIER = ["Ssiap", "Agent de sécurité", "Technicien CVC", "Chef de chantier", "Technicien CFO/CFA"]


def _jobs(*titles: str) -> list[dict]:
    return [{"title": t, "url": f"https://x.test/{i}"} for i, t in enumerate(titles)]


def _titles(jobs: list[dict]) -> list[str]:
    return [j["title"] for j in jobs]


# ── 1. analyse de compte ─────────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("profile", [ESN_IT_PLACEUR, ESN_IT_DEV], ids=["placeur", "developpeurs"])
def test_analyse_ecarte_les_offres_hors_metier_et_garde_le_dev_vue(profile: dict) -> None:
    req = ResearchRequest(company_name="Acme")
    kept = _rank_and_keep_run_jobs(_jobs(*HORS_METIER, "Développeur Vue.js"), profile, req)
    assert _titles(kept) == ["Développeur Vue.js"]


def test_analyse_compte_les_rejets_par_motif_et_les_dit() -> None:
    from app.services.offer_pertinence import sort_offers_by_trade

    kept, count = sort_offers_by_trade(_jobs(*HORS_METIER, "Développeur Vue.js"), ESN_IT_PLACEUR, caller="account")
    assert _titles(kept) == ["Développeur Vue.js"]
    assert count.received == 6 and count.kept == 1
    assert count.outside_trade == 5  # ce que la prod mesurait à 0
    assert sum(count.rejected.values()) == 5
    assert {"nonPlaced", "outsideTrade"} >= set(count.rejected)


def test_analyse_journalise_une_ligne_par_appelant(caplog: pytest.LogCaptureFixture) -> None:
    from app.services.offer_pertinence import sort_offers_by_trade

    with caplog.at_level(logging.INFO):
        sort_offers_by_trade(_jobs("Ssiap", "Développeur Java"), ESN_IT_DEV, caller="account")
    line = next(r.getMessage() for r in caplog.records if "PERTINENCE-OFFRES" in r.getMessage())
    assert "caller=account" in line and "received=2" in line and "kept=1" in line and "outsideTrade" in line


# ── 4. sans profil : rien à comparer, on n'écarte rien, et on le DIT ─────────────────────────────────
def test_sans_profil_on_n_ecarte_rien_et_on_le_dit(caplog: pytest.LogCaptureFixture) -> None:
    from app.services.offer_pertinence import sort_offers_by_trade

    req = ResearchRequest(company_name="Acme")
    assert _titles(_rank_and_keep_run_jobs(_jobs(*HORS_METIER), None, req)) == HORS_METIER
    with caplog.at_level(logging.INFO):
        kept, count = sort_offers_by_trade(_jobs(*HORS_METIER), {}, caller="account")
    assert len(kept) == 5 and count.rejected == {} and count.profile_read is False
    assert any("profile=none" in r.getMessage() for r in caplog.records)


# ── 2 + 3. signaux de Laura ─────────────────────────────────────────────────────────────────────────
@pytest.fixture
def _bridge(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    def _set(payload: dict) -> None:
        async def _account_signals(*_a: object, **_k: object) -> dict:
            return payload

        monkeypatch.setattr(bellum_api, "account_signals", _account_signals)

    return _set


def _hiring(label: str) -> dict:
    return {"label": label, "type": "hiring", "date": "2026-10-20", "link": None}


@pytest.mark.asyncio
async def test_laura_ne_cite_jamais_une_offre_hors_metier(_bridge) -> None:
    _bridge(
        {
            "accountId": "a-1",
            "accounts": [
                {
                    "accountId": "a-1",
                    "companyName": "Acme",
                    "signals": [
                        _hiring("Ssiap"),
                        _hiring("Chef de chantier"),
                        _hiring("Développeur Vue.js"),
                        {"label": "Levée de fonds", "type": "funding", "date": "2026-10-01"},
                    ],
                }
            ],
        }
    )
    result = await execute_chat_tool(
        "get_account_signals", {"account_id": "a-1"}, user_id=USER, profile_data=ESN_IT_PLACEUR
    )
    labels = [s["label"] for s in result["accounts"][0]["signals"]]
    assert labels == ["Développeur Vue.js", "Levée de fonds"]
    assert result["pertinence"]["received"] == 3 and result["pertinence"]["kept"] == 1
    assert result["pertinence"]["outsideTrade"] == 2


@pytest.mark.asyncio
async def test_un_compte_hors_metier_reste_present_plus_bas_et_marque(_bridge) -> None:
    _bridge(
        {
            "accountId": None,
            "accounts": [
                {
                    "accountId": "a-1",
                    "companyName": "Gardien SA",
                    "signals": [_hiring("Ssiap"), _hiring("Agent de sécurité")],
                },
                {"accountId": "a-2", "companyName": "Acme", "signals": [_hiring("Développeur Java")]},
            ],
        }
    )
    result = await execute_chat_tool("get_account_signals", {}, user_id=USER, profile_data=ESN_IT_DEV)
    names = [a["companyName"] for a in result["accounts"]]
    assert names == ["Acme", "Gardien SA"]  # présent, mais plus bas
    assert result["accounts"][1]["outOfTrade"] is True and result["accounts"][1]["signals"] == []
    assert "outOfTrade" not in result["accounts"][0]
    assert result["status"] == "success"


@pytest.mark.asyncio
async def test_laura_sans_profil_relaie_tel_quel(_bridge) -> None:
    payload = {
        "accountId": "a-1",
        "accounts": [{"accountId": "a-1", "companyName": "X", "signals": [_hiring("Ssiap")]}],
    }
    _bridge(payload)
    result = await execute_chat_tool("get_account_signals", {"account_id": "a-1"}, user_id=USER, profile_data=None)
    assert result["accounts"] == payload["accounts"]


# ── page /signals : le même verdict, y compris pour un placeur ──────────────────────────────────────
def test_la_page_signaux_ecarte_aussi_chantier_et_cvc_pour_un_placeur() -> None:
    from app.services.discover_hiring_scope import drop_off_scope_hiring

    signals = [{"type": "hiring", "label": t} for t in ("Chef de chantier", "Technicien CVC", "Développeur Vue.js")]
    assert [s["label"] for s in drop_off_scope_hiring(signals, ESN_IT_PLACEUR)] == ["Développeur Vue.js"]


# ── 5. le piège des mots : « vue » n'est une technologie que comme technologie ─────────────────────
@pytest.mark.parametrize(
    ("term", "text", "expected"),
    [
        ("Vue.js", "Boulanger — en vue de l'ouverture du magasin de Lille", False),
        ("Vue.js", "Vue d'ensemble du poste : équipe de vente", False),
        ("vue", "Responsable de rayon, point de vue client, à vue de nez", False),
        ("Vue.js", "Développeur Vue.js confirmé", True),
        ("vue", "Développeur front Vue 3 / TypeScript", True),
        ("vue", "Développeur VueJS", True),
        ("go", "Go-to-market manager, go live en janvier", False),
        ("go", "Développeur Go (Golang) backend", True),
        ("java", "Voyage organisé sur l'île de Java", False),
        ("java", "Développeur Java Spring Boot", True),
        ("react", "Développeur React", True),
    ],
)
def test_une_competence_ne_se_reconnait_que_comme_technologie(term: str, text: str, expected: bool) -> None:
    from app.services.offer_pertinence import mentions_as_technology

    assert mentions_as_technology(term, text) is expected


# ── 6. aucun appel de modèle ajouté : la décision est déterministe, donc rien à mettre en cache ───
def test_aucun_appel_de_modele_dans_le_tri() -> None:
    import inspect

    from app.services import offer_pertinence

    source = inspect.getsource(offer_pertinence)
    assert "call_claude" not in source and "anthropic" not in source.lower()
