"""L'état des interrupteurs d'arrêt du moteur IA — et ce qu'il ne dit jamais.

Le défaut corrigé (D169) : treize — en réalité vingt-trois — interrupteurs
existaient sans AUCUNE surface. Quand ``GROUNDING_DISABLED=true`` était posé
pendant un incident, rien nulle part ne le disait, et un interrupteur qu'on
oublie d'éteindre devient indistinguable d'un produit qui n'a jamais su faire.

⚠️ Ce que cette route ne fait PAS, et c'est le point le plus important : elle ne
publie **aucun nom de variable ni aucune valeur d'environnement**. Elle publie
l'ÉTAT d'une CAPACITÉ. Une route opérateur qui listerait ``LANGFUSE_SECRET_KEY``
serait un défaut plus grave que celui qu'on corrige.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import kill_switch


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def test_le_registre_nest_pas_vide() -> None:
    """Non-vacuité : une garde qui lit un registre vide est verte pour rien."""
    assert len(kill_switch.CAPABILITY_KILL_SWITCHES) >= 8


def test_chaque_capacite_a_une_variable_distincte() -> None:
    ids = list(kill_switch.CAPABILITY_KILL_SWITCHES)
    env_vars = list(kill_switch.CAPABILITY_KILL_SWITCHES.values())
    assert len(set(ids)) == len(ids)
    assert len(set(env_vars)) == len(env_vars)


def test_un_identifiant_de_capacite_ne_nomme_jamais_sa_variable() -> None:
    for capability_id in kill_switch.CAPABILITY_KILL_SWITCHES:
        assert "_DISABLED" not in capability_id
        assert capability_id == capability_id.lower()


def test_capability_states_rend_faux_par_defaut(monkeypatch: pytest.MonkeyPatch) -> None:
    for env_var in kill_switch.CAPABILITY_KILL_SWITCHES.values():
        monkeypatch.delenv(env_var, raising=False)
    states = kill_switch.capability_states()
    assert set(states) == set(kill_switch.CAPABILITY_KILL_SWITCHES)
    assert all(cut is False for cut in states.values())


def test_capability_states_voit_un_interrupteur_pose(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GROUNDING_DISABLED", "true")
    assert kill_switch.capability_states()["analysis.grounding"] is True


def test_la_route_rend_letat_et_jamais_une_variable(
    monkeypatch: pytest.MonkeyPatch, client: TestClient
) -> None:
    monkeypatch.setenv("CHAT_TOOLS_DISABLED", "1")
    monkeypatch.delenv("GROUNDING_DISABLED", raising=False)

    response = client.get("/internal/kill-switches")
    assert response.status_code == 200
    body = response.json()

    assert body["switches"]["copilot.tools"] is True
    assert body["switches"]["analysis.grounding"] is False

    # ⚠️ L'invariant de GA-85, vérifié sur la charge utile RÉELLE : aucun nom de
    # variable, donc aucun chemin par lequel un secret pourrait suivre un jour.
    assert "_DISABLED" not in response.text
    assert "LANGFUSE" not in response.text.upper()


def test_la_route_exige_le_secret_interne(monkeypatch: pytest.MonkeyPatch) -> None:
    """Elle traverse tous les espaces : elle n'est PAS exemptée d'authentification.

    Le test lit la liste d'exemption plutôt que de tenter un appel : le
    middleware tourne en no-op quand `INTERNAL_API_SECRET` est absent (dev
    local), donc un 200 ici ne prouverait rien.
    """
    from app.middleware.internal_auth import _is_exempt

    assert _is_exempt("/internal/kill-switches") is False
    # Témoin positif : la fonction sait dire OUI, donc son NON a un sens.
    assert _is_exempt("/health") is True
