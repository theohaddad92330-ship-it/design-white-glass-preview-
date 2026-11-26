"""#4723 — TheirStack facture 1 crédit par offre RENDUE : le stage est écarté DANS la requête
(``job_title_pattern_not``), dérivé du regex UNIQUE de ``internship_posting`` ; la ceinture reste en sortie."""

import asyncio
import json
import re
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from app.services import internship_posting
from app.services.data_sources import job_aggregators as agg

_CASES = json.loads(
    (Path(__file__).resolve().parents[3] / "packages/contracts/src/fixtures/internship-postings.json").read_text(
        encoding="utf-8"
    )
)


class _AnyPattern:
    """Le serveur écarte l'offre dès qu'UN motif de la liste colle (OR)."""

    def __init__(self) -> None:
        self._all = [re.compile(p, re.IGNORECASE) for p in internship_posting.title_patterns_not()]

    def search(self, title: str) -> bool:
        return any(p.search(title) for p in self._all)


def _pattern() -> _AnyPattern:
    return _AnyPattern()


@pytest.mark.parametrize("case", [c for c in _CASES["yes"] if "contractType" not in c])
def test_le_stage_est_attrape_par_le_motif(case):
    assert _pattern().search(case["title"])


def _theatre(title: str) -> bool:
    return bool(internship_posting._STAGE_THEATRE.search(title.lower()))


# Le théâtre (« stage manager ») est écarté aussi par le serveur (re2 sans lookaround) : perte assumée, tranchée
# dans le brief ; le filtre local fin reste juste (test_internship_posting).
@pytest.mark.parametrize(
    "case", [c for c in _CASES["no"] if isinstance(c.get("title"), str) and not _theatre(c["title"])]
)
def test_le_reste_passe_alternance_backstage_staging(case):
    assert not _pattern().search(case["title"])


@pytest.mark.parametrize(
    "title", ["Alternance - Développeur Java", "Backstage Engineer", "Staging lead", "Multi-stage pipeline engineer"]
)
def test_cas_nommes_non_attrapes(title):
    assert not _pattern().search(title)


# #4723.2 — TheirStack refuse tout motif non re2 (E-013, 0 offre depuis le 29/10) : la garde sait dire NON.
_NON_RE2 = re.compile(r"\(\?(?:=|!|<=|<!|<[A-Za-z]|P=)|\\[1-9]")


def test_garde_refuse_l_ancien_motif():
    ancien = r"^(?!.*(?<![a-z])stage\s+manager).*(?<![a-z-])(?:stages?)(?![a-z])"
    assert _NON_RE2.search(ancien)


def test_motifs_envoyes_sont_re2_purs():
    patterns = internship_posting.title_patterns_not()
    assert len(patterns) >= 3
    for pattern in patterns:
        assert not _NON_RE2.search(pattern), pattern
        re2 = pytest.importorskip("re2")
        re2.compile(pattern)


def test_aucun_champ_pattern_du_corps_n_est_non_re2(monkeypatch):
    monkeypatch.setenv("THEIRSTACK_API_KEY", "k")
    http = _capture(monkeypatch)
    asyncio.run(agg.theirstack_skill_offers("java"))
    asyncio.run(agg._theirstack_search("Decathlon"))
    seen = 0
    for body in http.bodies:
        for key, value in body.items():
            if "pattern" in key:
                for motif in value:
                    seen += 1
                    assert not _NON_RE2.search(motif), (key, motif)
    assert seen


class _Http:
    def __init__(self) -> None:
        self.bodies: list[dict] = []

    def post(self, url, json, headers):  # noqa: A002
        self.bodies.append(json)
        return MagicMock()


def _capture(monkeypatch) -> _Http:
    http = _Http()

    async def fake_request(source, term, client, call, *a, **k):
        call(http)
        return {"data": []}

    monkeypatch.setattr(agg, "_request", fake_request)
    return http


def test_skill_offers_envoie_le_motif(monkeypatch):
    monkeypatch.setenv("THEIRSTACK_API_KEY", "k")
    http = _capture(monkeypatch)
    asyncio.run(agg.theirstack_skill_offers("java"))
    assert http.bodies[0]["job_title_pattern_not"] == internship_posting.title_patterns_not()
    assert "job_title_or" in http.bodies[0]
    assert "employment_statuses_or" not in http.bodies[0]


def test_recherche_par_entreprise_envoie_le_motif(monkeypatch):
    monkeypatch.setenv("THEIRSTACK_API_KEY", "k")
    http = _capture(monkeypatch)
    asyncio.run(agg._theirstack_search("Decathlon"))
    assert http.bodies
    for body in http.bodies:
        assert body["job_title_pattern_not"] == internship_posting.title_patterns_not()
        assert "employment_statuses_or" not in body


def test_sans_cle_aucun_appel(monkeypatch):
    monkeypatch.delenv("THEIRSTACK_API_KEY", raising=False)
    http = _capture(monkeypatch)
    assert asyncio.run(agg.theirstack_skill_offers("java")) == []
    assert http.bodies == []
