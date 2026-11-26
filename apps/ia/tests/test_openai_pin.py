"""GA — le SDK OpenAI est une dépendance EXPLICITE, jamais transitive.

─────────────────────────────────────────────────────────────────────────────
LA PANNE QUE CETTE GARDE EMPÊCHE
─────────────────────────────────────────────────────────────────────────────
Mesuré le 28/08/2026 : `openai` n'était nulle part dans `requirements.txt`. Il
n'arrivait qu'en dépendance transitive d'`instructor`. Une transitive disparaît
au prochain relèvement de version sans que rien ne le dise — et la panne qui en
sort est SILENCIEUSE.

Sans le paquet, `OpenAIProvider.is_available()` (`app/services/llm_gateway.py`)
vaut `False` **même avec `OPENAI_API_KEY` posée**, et `_select_provider` retombe
sur Anthropic. On poserait `LLM_ROUTE_CLASSIFY=openai:...`, on croirait tourner
sur le modèle routé, et on paierait l'autre. C'est un repli honnête qui ment sur
la facture — la famille « cassé et non mesurable se ressemblent », appliquée à
une dépendance.

⚠️ Cette garde lit le FICHIER, pas l'environnement installé : un venv de
développeur peut porter le paquet alors que l'image de production ne l'aurait
pas. C'est justement l'écart qu'on veut interdire.
"""

from __future__ import annotations

import re
from pathlib import Path

REQUIREMENTS = Path(__file__).resolve().parents[1] / "requirements.txt"


def _pins() -> dict[str, str]:
    """Les épinglages `paquet==version` du fichier, commentaires exclus."""
    pins: dict[str, str] = {}
    for line in REQUIREMENTS.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        match = re.match(r"^([A-Za-z0-9._-]+)(?:\[[^\]]*\])?==([^\s#]+)", stripped)
        if match:
            pins[match.group(1).lower()] = match.group(2)
    return pins


def test_la_garde_lit_quelque_chose() -> None:
    """Sans corpus, tout ce qui suit passerait au vert sur du vide."""
    pins = _pins()
    assert REQUIREMENTS.exists(), REQUIREMENTS
    assert len(pins) >= 10, f"trop peu d'épinglages lus : {sorted(pins)}"
    # Deux témoins que le fichier est bien celui du service IA.
    assert "anthropic" in pins
    assert "instructor" in pins


def test_openai_est_epingle_explicitement() -> None:
    """Il doit être NOMMÉ ici, pas hérité d'instructor."""
    pins = _pins()
    assert "openai" in pins, (
        "`openai` n'est pas épinglé dans requirements.txt. Il ne peut alors arriver "
        "qu'en dépendance transitive, et le jour où elle disparaît le routage vers "
        "OpenAI redevient impossible EN SILENCE : is_available() vaut False même "
        "avec la clé posée, et la passerelle retombe sur Anthropic."
    )


def test_le_paquet_epingle_est_bien_importable() -> None:
    """L'épinglage ne vaut que s'il correspond à ce qui est réellement installé."""
    import openai  # noqa: PLC0415 — l'import EST ce qu'on vérifie

    assert _pins()["openai"] == openai.__version__, (
        f"requirements.txt épingle {_pins()['openai']} et l'environnement porte "
        f"{openai.__version__} — l'un des deux ment."
    )
