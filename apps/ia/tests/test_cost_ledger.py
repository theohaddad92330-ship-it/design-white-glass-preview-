"""Registre des coûts par run et par fournisseur (D19).

Ce que ces tests tiennent, c'est la règle d'honnêteté : on compte toujours les
unités, on n'invente jamais un prix, et « prix inconnu » ne se lit jamais
« gratuit ».
"""

from __future__ import annotations

from app.services import cost_ledger


def test_hors_run_enregistrer_est_un_no_op():
    # Un appel fournisseur hors analyse (chat, enrichissement isolé) ne doit ni
    # échouer ni polluer un registre qui n'existe pas.
    cost_ledger.record("firecrawl", "scrape", units=3)
    assert cost_ledger.snapshot() == []


def test_compte_les_unites_sans_prix_quand_le_fournisseur_n_est_pas_tarife(monkeypatch):
    monkeypatch.delenv("PROVIDER_UNIT_COST_FIRECRAWL", raising=False)
    with cost_ledger.bind_run("run-1"):
        cost_ledger.record("firecrawl", "scrape", units=12)
        rows = cost_ledger.snapshot()

    assert rows == [{"provider": "firecrawl", "operation": "scrape", "calls": 1, "units": 12, "cost_usd": None}]


def test_applique_le_prix_unitaire_de_l_operateur(monkeypatch):
    monkeypatch.setenv("PROVIDER_UNIT_COST_FIRECRAWL", "0.002")
    with cost_ledger.bind_run("run-1"):
        cost_ledger.record("firecrawl", "scrape", units=10)
        rows = cost_ledger.snapshot()

    assert rows[0]["cost_usd"] == 0.02


def test_un_prix_illisible_ne_fabrique_pas_de_cout(monkeypatch):
    monkeypatch.setenv("PROVIDER_UNIT_COST_APOLLO", "gratuit")
    with cost_ledger.bind_run("run-1"):
        cost_ledger.record("apollo", "people_search", units=1)
        assert cost_ledger.snapshot()[0]["cost_usd"] is None


def test_un_cout_explicite_prime_sur_la_table(monkeypatch):
    # Anthropic connaît son propre prix (tokens × tarif du modèle) : la table
    # d'unités ne doit pas s'y substituer.
    monkeypatch.setenv("PROVIDER_UNIT_COST_ANTHROPIC", "999")
    with cost_ledger.bind_run("run-1"):
        cost_ledger.record("anthropic", "bellum_facts", units=1200, cost_usd=0.031)
        assert cost_ledger.snapshot()[0]["cost_usd"] == 0.031


def test_agrege_par_fournisseur_et_operation(monkeypatch):
    monkeypatch.delenv("PROVIDER_UNIT_COST_FIRECRAWL", raising=False)
    with cost_ledger.bind_run("run-1"):
        cost_ledger.record("firecrawl", "scrape", units=5)
        cost_ledger.record("firecrawl", "scrape", units=7)
        cost_ledger.record("serper", "search", units=1)
        rows = cost_ledger.snapshot()

    scrape = next(r for r in rows if r["provider"] == "firecrawl")
    assert scrape["calls"] == 2 and scrape["units"] == 12
    assert len(rows) == 2


def test_le_total_ignore_les_lignes_non_tarifees(monkeypatch):
    # Additionner un « prix inconnu » comme un zéro annoncerait un run moins
    # cher qu'il n'est — exactement l'erreur qu'on corrige avec ce chantier.
    monkeypatch.delenv("PROVIDER_UNIT_COST_FIRECRAWL", raising=False)
    with cost_ledger.bind_run("run-1"):
        cost_ledger.record("anthropic", "bellum_plan", units=10, cost_usd=0.5)
        cost_ledger.record("firecrawl", "scrape", units=12)
        assert cost_ledger.total_usd() == 0.5


def test_aucune_ligne_tarifee_donne_un_total_inconnu(monkeypatch):
    monkeypatch.delenv("PROVIDER_UNIT_COST_FIRECRAWL", raising=False)
    with cost_ledger.bind_run("run-1"):
        cost_ledger.record("firecrawl", "scrape", units=3)
        assert cost_ledger.total_usd() is None


def test_deux_runs_ne_se_melangent_pas():
    with cost_ledger.bind_run("run-1"):
        cost_ledger.record("serper", "search")
    with cost_ledger.bind_run("run-2"):
        cost_ledger.record("tavily", "search")
        rows = cost_ledger.snapshot()

    assert [r["provider"] for r in rows] == ["tavily"]


def test_une_erreur_d_enregistrement_ne_casse_jamais_le_run(monkeypatch):
    # Une métrique n'a pas le droit de faire échouer l'analyse qu'elle mesure.
    monkeypatch.setattr(cost_ledger, "_unit_price", lambda provider: 1 / 0)
    with cost_ledger.bind_run("run-1"):
        cost_ledger.record("firecrawl", "scrape", units=1)
        assert cost_ledger.snapshot() == []


def test_sans_details_llm_les_cles_optionnelles_sont_absentes(monkeypatch):
    # #2440.6/.7/.8/.9/.16/.19 — un fournisseur de données (Firecrawl, Apollo…)
    # ne porte ni modèle ni jetons : les clés doivent être ABSENTES, pas nulles,
    # pour ne pas gonfler l'en-tête `x-bellum-costs` sur des lignes qui n'ont
    # rien à en dire (le total de calls/units/cost_usd, lui, ne bouge pas).
    monkeypatch.delenv("PROVIDER_UNIT_COST_FIRECRAWL", raising=False)
    with cost_ledger.bind_run("run-1"):
        cost_ledger.record("firecrawl", "scrape", units=3)
        row = cost_ledger.snapshot()[0]

    for key in ("model", "input_tokens", "output_tokens", "cache_read_tokens", "cache_creation_tokens", "status", "tariff_version"):
        assert key not in row


def test_trace_le_modele_les_jetons_le_cache_le_statut_et_la_version_tarifaire(monkeypatch):
    # #2440.6 modèle, #2440.7 jetons entrée, #2440.8 jetons sortie, #2440.9
    # cache, #2440.16 statut de l'opération, #2440.19 version de la grille
    # tarifaire — ce que `credit_ledger` ne portait pas, et que `_log_usage`
    # (claude_service.py) transmet maintenant à chaque appel Claude.
    with cost_ledger.bind_run("run-1"):
        cost_ledger.record(
            "anthropic",
            "bellum_facts",
            units=1200,
            cost_usd=0.031,
            model="claude-sonnet-4",
            input_tokens=1000,
            output_tokens=200,
            cache_read_tokens=50,
            cache_creation_tokens=10,
            status="ok",
            tariff_version="anthropic-2026-v1",
        )
        row = cost_ledger.snapshot()[0]

    assert row["model"] == "claude-sonnet-4"
    assert row["input_tokens"] == 1000
    assert row["output_tokens"] == 200
    assert row["cache_read_tokens"] == 50
    assert row["cache_creation_tokens"] == 10
    assert row["status"] == "ok"
    assert row["tariff_version"] == "anthropic-2026-v1"


def test_les_jetons_s_additionnent_et_le_dernier_modele_gagne(monkeypatch):
    # Même convention que `claude_service._record_cost` : les compteurs
    # cumulent, et le dernier modèle vu (une bascule de réglage en cours de
    # run) remplace le précédent plutôt que de se perdre.
    with cost_ledger.bind_run("run-1"):
        cost_ledger.record(
            "anthropic", "bellum_chat", units=100, cost_usd=0.01,
            model="claude-haiku-4", input_tokens=80, output_tokens=20, status="ok",
        )
        cost_ledger.record(
            "anthropic", "bellum_chat", units=300, cost_usd=0.05,
            model="claude-sonnet-4", input_tokens=250, output_tokens=50, status="ok",
        )
        row = cost_ledger.snapshot()[0]

    assert row["model"] == "claude-sonnet-4"
    assert row["input_tokens"] == 330
    assert row["output_tokens"] == 70


def test_le_registre_repart_dans_l_entete_de_reponse(monkeypatch):
    """Transport vers l'API : c'est NestJS qui possède la notion de « run »."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.middleware.cost_ledger_mw import COST_HEADER, CostLedgerMiddleware

    monkeypatch.delenv("PROVIDER_UNIT_COST_FIRECRAWL", raising=False)
    app = FastAPI()
    app.add_middleware(CostLedgerMiddleware)

    @app.get("/fake")
    def fake():
        cost_ledger.record("firecrawl", "scrape", units=4)
        return {"ok": True}

    response = TestClient(app).get("/fake")

    assert response.status_code == 200
    assert '"provider":"firecrawl"' in response.headers[COST_HEADER]


def test_aucune_consommation_n_ajoute_aucun_entete():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.middleware.cost_ledger_mw import COST_HEADER, CostLedgerMiddleware

    app = FastAPI()
    app.add_middleware(CostLedgerMiddleware)

    @app.get("/fake")
    def fake():
        return {"ok": True}

    assert COST_HEADER not in TestClient(app).get("/fake").headers
