# DEPS-PIP-4561 — rapport

Branche : `claude/deps-pip-4561-2510` (base : branche Dependabot, non modifiée).

## Où vit le handler en instructor 1.17

`instructor.processing.response` n'est plus qu'un shim (`from instructor.v2.core.response import *`).
Le mode ANTHROPIC_TOOLS est géré par `instructor/v2/providers/anthropic/handlers.py::prepare_request` ;
`handle_anthropic_tools` n'existe plus.

## Solution retenue : ni patch ni interne — le comportement est NATIF

Ce handler pose lui-même `disable_parallel_tool_use: True` sur le `tool_choice` forcé (commentaire
upstream : même cause que chez nous). Exceptions upstream : `thinking` activé ou `Iterable[...]`
(→ `tool_choice: auto`, sans le drapeau) ; le code de `claude_service.py` n'utilise aucun des deux
sur le chemin instructor (vérifié : pas de `thinking` dans les appels `from_anthropic`).
Le monkeypatch est SUPPRIMÉ (pas de remplacement résilient nécessaire : rien à patcher).

## Test (rouge puis vert)

`tests/test_claude_service.py::TestSingleToolUseHardening` : vrai `instructor.from_anthropic`, client
Anthropic factice (`messages.create` capturé), sans réseau ni clé ; vérifie `tool_choice.disable_parallel_tool_use is True`.

- Vert : `pytest tests/test_claude_service.py` → 28 passed (rc=0).
- Rouge : en renommant temporairement la clé dans le handler installé → `KeyError: 'disable_parallel_tool_use'`, rc=1 ; handler restauré.
  Il échouera si un bump futur retire le comportement natif.

## langchain 0.3.25

Absent de `uv.lock`, de `pyproject.toml` et de `requirements.txt` ; non installé après `uv sync`.
`langchain-core 1.7.0` n'est tiré que par `langgraph*` (dépendances directes de bellum-ia). Le résidu
vu en CI n'a donc pas de source dans le dépôt : probablement un environnement/cache pip du runner
(non prouvé, je n'ai pas le log CI).

## Non prouvé / à noter

- Je n'ai pas relancé la CI ; seul le fichier de test ciblé a tourné.
- `uv sync` a créé un venv Python 3.13 (pas 3.12) ; non bloquant pour ce test.
- `apps/ia/requirements.txt` (utilisé par la CI via `pip install -r`) ne contient aucun `langchain-core`/`langgraph` : à vérifier par Louis, hors périmètre.
