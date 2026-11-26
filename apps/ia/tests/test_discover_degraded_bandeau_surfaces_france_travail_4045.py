"""#4045.3 (14/10, recette prod 429335a9c8) — « la panne France Travail n'est
PAS dite à l'écran (seul BOAMP apparaît dans le bandeau "Résultats
partiels") ».

Cause : chaque source de signaux (``it_job_signals``, ``_boamp_tenders``…)
avale son 429/erreur réseau EN INTERNE pour ne jamais faire échouer la
recherche — elle note la panne dans ``source_health`` (journal, supervision)
mais ne LÈVE jamais. Le `isinstance(rows, BaseException)` de
``_candidate_signals`` et le `TimeoutError` de ``_finish_signal_tasks`` ne
voient donc RIEN : ni l'un ni l'autre n'a de raison de se déclencher pour un
appel qui a « réussi » (réponse HTTP rapide, juste un code 429 avalé plus
bas). Le jour de l'incident, seul BOAMP est apparu dans le bandeau — pour une
raison SANS RAPPORT (``time_budget``, une lenteur, pas un 429).

``discover_router._merge_source_health_degraded`` relit maintenant
``source_health`` UNE fois pour la page, et n'en reprend QUE les entrées à
CODE connu (``DegradeReason``) — jamais un texte libre non traduisible."""

from __future__ import annotations

import pytest

from app.middleware.correlation_id import _correlation_id as correlation_id_var
from app.routers import discover as discover_router
from app.services import source_health
from app.services.company_filters import DegradeReason

CID = "cid-4045-bandeau"


@pytest.fixture(autouse=True)
def _run_scope():
    source_health.clear_degradations(CID)
    token = correlation_id_var.set(CID)
    yield
    correlation_id_var.reset(token)
    source_health.clear_degradations(CID)


def test_a_coded_degradation_is_merged_into_the_page_bandeau() -> None:
    """Une panne notée par une source (code MACHINE connu) doit apparaître
    dans `degraded[]`, dans la même forme que les autres entrées du bandeau
    (`{"source", "reason"}`, `reason` = le code)."""
    source_health.record_degradation(
        CID,
        source="france_travail",
        reason="Client error '429 Too Many Requests' for url '...'",
        code=DegradeReason.RATE_LIMITED,
    )

    degraded: list[dict] = []
    discover_router._merge_source_health_degraded(degraded, CID)

    assert {"source": "france_travail", "reason": DegradeReason.RATE_LIMITED} in degraded


def test_an_uncoded_free_text_degradation_never_reaches_the_screen() -> None:
    """Une dégradation SANS code (texte libre, jamais traduisible) ne doit
    JAMAIS fuiter telle quelle à l'écran — mieux vaut l'absence que la fuite
    (#2469)."""
    source_health.record_degradation(
        CID, source="some_internal_step", reason="une phrase libre, pas un code machine"
    )

    degraded: list[dict] = []
    discover_router._merge_source_health_degraded(degraded, CID)

    assert degraded == []


def test_duplicate_degradations_across_candidates_collapse_to_one_entry() -> None:
    """24 cartes qui échouent toutes pour la MÊME raison ne doivent produire
    qu'UNE ligne dans le bandeau (`_merge_degraded`, déjà vérifié ailleurs) —
    la fusion ``source_health`` doit déduper pareil."""
    for _ in range(24):
        source_health.record_degradation(
            CID, source="france_travail", reason="429", code=DegradeReason.RATE_LIMITED
        )

    degraded: list[dict] = []
    discover_router._merge_source_health_degraded(degraded, CID)

    assert degraded == [{"source": "france_travail", "reason": DegradeReason.RATE_LIMITED}]


def test_merge_is_additive_and_keeps_existing_entries() -> None:
    """Une entrée `degraded` déjà posée par ailleurs (ex. BOAMP en
    `time_budget`) doit SURVIVRE à la fusion — jamais remplacée."""
    source_health.record_degradation(
        CID, source="france_travail", reason="429", code=DegradeReason.RATE_LIMITED
    )
    degraded = [{"source": "boamp", "reason": DegradeReason.TIME_BUDGET}]

    discover_router._merge_source_health_degraded(degraded, CID)

    assert {"source": "boamp", "reason": DegradeReason.TIME_BUDGET} in degraded
    assert {"source": "france_travail", "reason": DegradeReason.RATE_LIMITED} in degraded
    assert len(degraded) == 2
