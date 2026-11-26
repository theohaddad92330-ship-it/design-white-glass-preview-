"""`POST /profiler/generate` — #2007, le profiler n'est plus bridé à dix champs.

`OnboardingAnswers` ne déclarait que les dix champs Temps-1 ; tout le reste
d'`EsnAnswers` (complément Temps-2, profil progressif §21-30) arrivait dans le
corps JSON et disparaissait sans erreur — pydantic ignore silencieusement une
clé inconnue (`extra="ignore"` par défaut). Ces tests suivent un champ neuf de
bout en bout : posté par le client → déclaré sur `OnboardingAnswers` → présent
dans le dict transmis à `ProfilerAgent.run()` → LU par `_coaching_message`.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import app.routers.profiler as profiler_router
from app.models.agent_envelope import AgentStatus
from app.routers.profiler import OnboardingAnswers

_TEMPS1 = {
    "user_id": "u-1",
    "esn_name": "DataCraft",
    "consultant_size": "1-10",
    "sales_team_size": "Solo",
    "expertise_areas": ["Data & Intelligence Artificielle"],
    "positioning": "Généraliste - large spectre selon les besoins client",
    "staffing_model": "Mix équilibré CDI / Freelances",
    "target_sectors": ["Banque de détail & Banque privée"],
    "target_company_types": ["ETI (500-5 000 salariés)"],
    "geo_zones": ["National (toute la France)"],
    "main_sales_pain": "Trouver les bons comptes à cibler",
}


def _fake_envelope() -> MagicMock:
    """A stand-in `AgentEnvelope` — only `.status`/`.model_dump()` are read by
    the router, so building the real nested `ProfileContext` is unnecessary."""
    envelope = MagicMock()
    envelope.status = AgentStatus.CANCELLED
    envelope.model_dump.return_value = {"status": "cancelled"}
    return envelope


def _capture_call(client, payload: dict) -> dict:
    """POSTs `payload` to `/profiler/generate` and returns EVERYTHING the router
    hands to `ProfilerAgent.run()` — the positional `answers` dict and the
    keyword arguments. Le test doit voir la forme que le routeur envoie
    VRAIMENT : c'est en n'observant que `answers` qu'on a laissé passer un
    `user_id` jamais transmis."""
    captured: dict = {}

    async def fake_run(self, answers, *, progress_callback=None, user_id=None):  # noqa: ARG001
        captured["answers"] = answers
        captured["user_id"] = user_id
        captured["progress_callback"] = progress_callback
        return _fake_envelope()

    with patch.object(profiler_router.ProfilerAgent, "run", fake_run):
        response = client.post("/profiler/generate", json=payload)

    assert response.status_code in (200, 412, 422, 500)
    assert "answers" in captured, "ProfilerAgent.run was never reached"
    return captured


def _post_and_capture(client, payload: dict) -> dict:
    """Le seul dict `answers`, pour les tests qui ne parlent que des champs."""
    return _capture_call(client, payload)["answers"]


def test_le_routeur_passe_user_id_a_l_agent(client) -> None:
    """#2069 — l'identité de l'appelant est ce qui CLOISONNE la lecture des
    comptes réels proposés sur `/welcome`.

    `answers.model_dump(exclude={"user_id", ...})` retire `user_id` du dict :
    si le routeur ne le passe pas non plus en argument nommé, `real_accounts_for`
    résout `caller = None`, rend `status="no_caller"`, et l'écran d'accueil est
    VIDE en production — sans une seule erreur. Le service et l'agent savaient
    déjà lire cet argument ; seul le routeur, unique appelant, ne l'envoyait pas.
    """
    call = _capture_call(client, dict(_TEMPS1))

    assert call["user_id"] == "u-1"
    # L'exclusion du dict reste vraie : `user_id` voyage en argument nommé, il
    # n'entre pas dans la charge utile du prompt.
    assert "user_id" not in call["answers"]


def test_fields_beyond_the_original_ten_reach_the_agent(client) -> None:
    """#2007 — `user_role`, `monthly_target` (scalaires) et `sales_blockers`
    (liste) sont hors des dix champs Temps-1 : avant ce lot, `OnboardingAnswers`
    les aurait tous les trois silencieusement jetés à l'entrée."""
    payload = {
        **_TEMPS1,
        "user_role": "Business Manager",
        "monthly_target": "8000",
        "sales_blockers": ["Manque de temps", "Pas assez de contacts qualifiés"],
    }

    answers = _post_and_capture(client, payload)

    assert answers["user_role"] == "Business Manager"
    assert answers["monthly_target"] == "8000"
    assert answers["sales_blockers"] == ["Manque de temps", "Pas assez de contacts qualifiés"]


def test_temps1_only_payload_stays_valid_and_new_fields_default_absent(client) -> None:
    """Additif seulement : un payload qui n'envoie QUE les dix champs
    historiques reste valide, et les champs neufs se dégradent en absence
    (`None` / liste vide), jamais en donnée inventée."""
    answers = _post_and_capture(client, dict(_TEMPS1))

    assert answers["esn_name"] == "DataCraft"
    assert answers["user_role"] is None
    assert answers["monthly_target"] is None
    assert answers["sales_blockers"] == []
    assert answers["offer_domain"] is None
    assert answers["decision_maker_personas"] == []


def test_onboarding_answers_model_dump_carries_the_new_fields() -> None:
    """Unit-level pin on `OnboardingAnswers` itself, independent of the HTTP
    layer: `.model_dump()` — what `generate_profile()` forwards — must expose
    every field beyond the ten, not just accept them at parse time."""
    answers = OnboardingAnswers(
        **_TEMPS1,
        role_tenure="1-2 ans",
        avg_tjm="550-700",
        go_to_market_channels=["Cold email", "LinkedIn"],
    )
    dumped = answers.model_dump(exclude={"user_id", "progress_callback"})

    assert dumped["role_tenure"] == "1-2 ans"
    assert dumped["avg_tjm"] == "550-700"
    assert dumped["go_to_market_channels"] == ["Cold email", "LinkedIn"]


def test_expertise_credibilite_fields_reach_the_agent(client) -> None:
    """#2039.6 / #2039.2 (épopée #2880) — RÉGRESSION : `OnboardingAnswers` ne
    déclarait ni `expertise_no_concrete_proof` ni `expertise_client_reference`,
    donc pydantic les jetait en silence (`extra="ignore"`) avant même
    `ProfilerAgent.run()` — les deux champs étaient posés par le questionnaire,
    projetés (`analysis.ts`), transportés (`ia.client.ts`) et listés dans
    `_COMPLEMENT_SECTIONS` (`bellum_profiler.py`), sans qu'aucun test ne suive
    le champ à travers `/profiler/generate` jusqu'ici. Réparé le 26/09/2026
    (feat/soir-s10-26-09), les deux à la fois : même cause, même correctif."""
    payload = {
        **_TEMPS1,
        "expertise_no_concrete_proof": ["IoT & Systèmes embarqués"],
        "expertise_client_reference": ["Data & Intelligence Artificielle"],
    }

    answers = _post_and_capture(client, payload)

    assert answers["expertise_no_concrete_proof"] == ["IoT & Systèmes embarqués"]
    assert answers["expertise_client_reference"] == ["Data & Intelligence Artificielle"]


def test_expertise_personal_experience_partner_talent_pool_reach_the_agent(client) -> None:
    """#2039.3/.4/.5 (épopée #2880, vague G lot g10) — même mécanisme que
    `expertise_no_concrete_proof`/`expertise_client_reference` ci-dessus,
    déclarés dès leur livraison (pas de défaut à réparer) : preuve de bout en
    bout que les trois champs atteignent bien `ProfilerAgent.run()`."""
    payload = {
        **_TEMPS1,
        "expertise_personal_experience": ["Cybersécurité & Conformité"],
        "expertise_partner": ["Cloud & Infrastructure (AWS, Azure, GCP, Hosting)"],
        "expertise_talent_pool": ["Data & Intelligence Artificielle"],
    }

    answers = _post_and_capture(client, payload)

    assert answers["expertise_personal_experience"] == ["Cybersécurité & Conformité"]
    assert answers["expertise_partner"] == ["Cloud & Infrastructure (AWS, Azure, GCP, Hosting)"]
    assert answers["expertise_talent_pool"] == ["Data & Intelligence Artificielle"]


def test_answered_and_total_question_count_are_carried_and_additive() -> None:
    """#2007.9 — la complétude (répondu / total) voyage jusqu'au dict transmis
    à l'agent, et un appelant plus ancien qui ne l'envoie pas encore reste
    valide (`None`, jamais un zéro inventé — « non mesuré » n'est pas 0)."""
    with_completeness = OnboardingAnswers(**_TEMPS1, answered_count=76, total_question_count=114)
    dumped = with_completeness.model_dump(exclude={"user_id", "progress_callback"})
    assert dumped["answered_count"] == 76
    assert dumped["total_question_count"] == 114

    without_completeness = OnboardingAnswers(**_TEMPS1)
    dumped_absent = without_completeness.model_dump(exclude={"user_id", "progress_callback"})
    assert dumped_absent["answered_count"] is None
    assert dumped_absent["total_question_count"] is None
