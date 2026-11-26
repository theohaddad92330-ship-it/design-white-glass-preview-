"""#4799 — le protocole de mesure de fraîcheur du poste : verdicts, coût jamais 0, BLOCKED sans clé, rapport sans nom."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from app.eval.employment_freshness import run as runner
from app.eval.employment_freshness.protocol import (
    Observation,
    SourceReport,
    TruthCase,
    judge,
    observe_from_history,
    observe_from_snapshot,
    render_markdown,
)
from app.eval.employment_freshness.sources import CANDIDATES, build_adapters


def case(category: str, employer: str = "Accor") -> TruthCase:
    return TruthCase("c1", category, employer)  # type: ignore[arg-type]


def test_judge_faux_parti_est_faux_quand_la_source_dit_parti() -> None:
    assert judge(case("faux_parti", "EDF"), Observation("left", "Engie")) == "faux"
    assert judge(case("faux_parti", "EDF"), Observation("in_post", "EDF SA")) == "juste"


def test_judge_arrivee_recente_exige_le_bon_employeur() -> None:
    assert judge(case("arrivee_recente"), Observation("in_post", "Accor")) == "juste"
    # donnée en poste, mais chez l'ancien employeur : la fraîcheur est fausse
    assert judge(case("arrivee_recente"), Observation("in_post", "Sodexo")) == "faux"
    assert judge(case("arrivee_recente"), Observation("unknown")) == "inconnu"


def test_judge_parti_ancien_donne_en_poste_est_faux() -> None:
    assert judge(case("parti_ancien"), Observation("in_post", "Accor")) == "faux"
    assert judge(case("parti_ancien"), Observation("left", "Autre")) == "juste"


def test_observe_from_history_ne_devine_pas() -> None:
    ongoing = [{"organization_name": "Accor SA", "end_date": None, "current": True}]
    closed = [{"organization_name": "Accor", "end_date": "2022-06-30"}]
    assert observe_from_history(ongoing, "Accor") == "in_post"
    assert observe_from_history(closed, "Accor") == "left"
    assert observe_from_history([{"organization_name": "Autre"}], "Accor") == "unknown"
    assert observe_from_history(None, "Accor") == "unknown"


def test_observe_from_snapshot() -> None:
    assert observe_from_snapshot("", "Accor") == "unknown"
    assert observe_from_snapshot("Accor Group", "Accor") == "in_post"
    assert observe_from_snapshot("Engie", "Accor") == "left"


def test_cout_jamais_zero_quand_non_chiffre() -> None:
    c = case("faux_parti")
    unpriced = SourceReport("s")
    unpriced.add(c, "juste", Observation("in_post", units=1.0))
    assert unpriced.cost_usd is None and unpriced.cost_per_case_usd is None
    priced = SourceReport("s", unit_price_usd=0.02)
    priced.add(c, "juste", Observation("in_post", units=1.0))
    priced.add(c, "inconnu", Observation("unknown", units=0.0))
    assert priced.cost_usd == pytest.approx(0.02)
    assert priced.cost_per_case_usd == pytest.approx(0.01)
    unmeasured = SourceReport("s", unit_price_usd=0.02)
    unmeasured.add(c, "juste", Observation("in_post", units=None))
    assert unmeasured.cost_usd is None


def test_sans_cle_chaque_source_est_blocked_et_rien_nest_appele(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in ("APOLLO_API_KEY", "SALESQL_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    reports = asyncio.run(runner.measure([case("faux_parti")], build_adapters()))
    by_name = {r.source: r for r in reports}
    for name in ("apollo_search", "apollo_match", "salesql"):
        assert by_name[name].blocked and "absente" in by_name[name].blocked
        assert by_name[name].total == 0
    # les candidats sans adaptateur sont NOMMÉS bloqués avec leur raison
    assert by_name["kaspr"].blocked and "NON vérifiable" in by_name["kaspr"].blocked
    markdown = render_markdown(reports)
    assert "BLOCKED" in markdown and "| apollo_search | — |" in markdown


def test_panne_de_source_est_un_inconnu_nomme(monkeypatch: pytest.MonkeyPatch) -> None:
    class Boom:
        name, env_key, cost_provider = "boom", "BOOM_KEY", "boom"

        def configured(self) -> bool:
            return True

        async def observe(self, _case: TruthCase) -> Observation:
            raise RuntimeError("réseau")

    monkeypatch.delenv("PROVIDER_UNIT_COST_BOOM", raising=False)
    [report] = [r for r in asyncio.run(runner.measure([case("faux_parti")], [Boom()])) if r.source == "boom"]
    assert report.counts == {"juste": 0, "faux": 0, "inconnu": 1}
    assert report.cost_usd is None


def test_gabarit_commite_sans_nom_ni_identifiant() -> None:
    raw = json.loads(runner.TEMPLATE.read_text(encoding="utf-8"))
    assert {c["category"] for c in raw["cases"]} == {"faux_parti", "arrivee_recente", "parti_ancien"}
    assert all("handle" not in c for c in raw["cases"])  # les identifiants ne vivent que dans le fichier local
    assert len(runner.load_truth(runner.TEMPLATE)) == 3


def test_load_truth_refuse_categorie_inconnue(tmp_path: Path) -> None:
    bad = tmp_path / "t.json"
    bad.write_text(json.dumps({"cases": [{"case_id": "x", "category": "parti", "employer_ref": "A"}]}))
    with pytest.raises(ValueError):
        runner.load_truth(bad)


def test_catalogue_ne_porte_aucune_valeur_de_cle() -> None:
    assert all(c.env_key.endswith("_API_KEY") for c in CANDIDATES)
    assert {c.name for c in CANDIDATES if c.adapter} == {"apollo_search", "apollo_match", "salesql"}
