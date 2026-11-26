"""Fournisseur promptfoo (#4111) : appelle Claude avec les prompts et outils du dépôt.

Rien n'est dupliqué : le prompt système de Laura vient de
`app.prompts.bellum_advisor.build_system_prompt`, ses outils de
`app.services.chat_tools.tools_for`, le prompt d'analyse de
`app.prompts.bellum_org_declare`. Modifier l'un d'eux change donc ce que
promptfoo teste, sans toucher cette config.

Deux modes (`config.mode`) :
  - `chat`        -> sortie JSON {text, tool_calls:[{name,input,proposes_only}]}
  - `org_declare` -> sortie = le texte brut du modèle (JSON attendu)
  - `talent_message` -> sortie = le texte brut du message au consultant (#4347.2, tutoiement)

Sans `ANTHROPIC_API_KEY` : erreur claire, aucun appel réseau (le workflow saute
le job avant d'arriver ici).
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

_IA_ROOT = Path(__file__).resolve().parents[2]
if str(_IA_ROOT) not in sys.path:
    sys.path.insert(0, str(_IA_ROOT))

#: Outils d'écriture : leur description DOIT dire qu'ils ne font que proposer
#: (statut `pending_confirmation` côté exécution, validation par l'utilisateur).
WRITE_TOOLS = frozenset(
    {
        "prepare_message_for_contact",
        "schedule_reminder_for_contact",
        "add_account_to_portfolio",
    }
)

_MAX_TOKENS = 1024
#: #4438 — rounds rejoués quand un cas fige la sortie de ses outils (`tool_output`).
_MAX_REPLAY_ROUNDS = 3


def _client() -> Any:
    import anthropic

    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY absente : promptfoo ne peut pas rejouer les cas.")
    return anthropic.Anthropic(api_key=key)


def _sampling(model: str) -> dict[str, Any]:
    """`temperature=0` seulement si le modèle l'accepte : même règle que la prod
    (`claude_service.supports_sampling_params`). Un modèle récent répond 400 sinon."""
    from app.services.claude_service import supports_sampling_params

    return {"temperature": 0} if supports_sampling_params(model) else {}


def _system_for(message: str) -> str:
    """Le prompt système rejoué : celui du conseiller, plus les consignes de TOUR que le routeur pose sur
    la seule demande (R22-LG : « missions du marché », #4421.2). "" pour toute autre demande : à l'octet."""
    from app.prompts.bellum_advisor import append_before_language_reminder, build_system_prompt
    from app.prompts.laura_acts import market_missions_turn_block

    return append_before_language_reminder(build_system_prompt({}, {}, "", ""), market_missions_turn_block(message))


def _chat(message: str, tool_output: str | None = None, tool_outputs: dict[str, str] | None = None) -> str:
    from app.services.chat_tools import tools_for
    from app.services.model_policy import model_for

    catalog = tools_for(None)
    by_name = {str(t["name"]): t for t in catalog}
    tools = [
        {"name": t["name"], "description": t["description"], "input_schema": t["input_schema"]}
        for t in catalog
    ]
    system = _system_for(message)
    messages: list[dict[str, Any]] = [{"role": "user", "content": message}]
    text_parts: list[str] = []
    calls: list[dict[str, Any]] = []
    # #4438 — sans `tool_output`, UN appel (le chemin d'avant, à l'octet). Avec,
    # chaque appel d'outil reçoit cette sortie FIGÉE (ex. un zéro) et le modèle
    # rejoue jusqu'à `_MAX_REPLAY_ROUNDS` : c'est ce qui permet de voir s'il
    # élargit seul après un résultat vide.
    # #4417.1 — `tool_outputs` fige la sortie PAR OUTIL (un chemin à plusieurs outils : chercher le fil,
    # le lire, déposer) ; `tool_output` reste la sortie unique d'avant, et sert de repli.
    outputs = tool_outputs or {}
    replay = tool_output is not None or bool(outputs)
    rounds = _MAX_REPLAY_ROUNDS if replay else 1
    for _ in range(rounds):
        response = _client().messages.create(
            model=model_for("bellum_chat"),
            max_tokens=_MAX_TOKENS,
            **_sampling(model_for("bellum_chat")),
            system=system,
            tools=tools,
            messages=messages,
        )
        results: list[dict[str, Any]] = []
        for block in response.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                description = str(by_name.get(block.name, {}).get("description", ""))
                calls.append(
                    {
                        "name": block.name,
                        "input": block.input,
                        # Un outil d'écriture n'est « sûr » que si son catalogue dit
                        # qu'il PROPOSE (validation de l'utilisateur) et n'exécute rien.
                        "proposes_only": block.name not in WRITE_TOOLS or "validation" in description,
                    }
                )
                results.append(
                    {"type": "tool_result", "tool_use_id": block.id, "content": outputs.get(block.name, tool_output or "")}
                )
        if not results or not replay:
            break
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": results})
    return json.dumps({"text": "\n".join(text_parts), "tool_calls": calls}, ensure_ascii=False)


def _org_declare(text: str, account: str) -> str:
    from app.models.outputs.org_declare import OrgDeclareOutput
    from app.prompts.bellum_org_declare import build_system_prompt, build_user_prompt
    from app.services.model_policy import model_for

    schema = json.dumps(OrgDeclareOutput.model_json_schema(), ensure_ascii=False)
    response = _client().messages.create(
        model=model_for("bellum_org_declare"),
        max_tokens=_MAX_TOKENS,
        **_sampling(model_for("bellum_org_declare")),
        system=f"{build_system_prompt()}\n\nSchéma JSON :\n{schema}",
        messages=[{"role": "user", "content": build_user_prompt(text=text, account_name=account)}],
    )
    return "".join(b.text for b in response.content if b.type == "text")


def _talent_message(channel: str) -> str:
    from app.prompts.bellum_talent_message import build_system_prompt, build_user_prompt
    from app.services.model_policy import model_for

    consultant = {"first_name": "Sophie", "title": "Développeuse Java senior", "skills": ["Java", "Kubernetes"]}
    need = {"title": "Tech lead Java", "client_name": "SNCF", "skills": ["Java", "Kafka"], "start_on": "2026-11-16"}
    response = _client().messages.create(
        model=model_for("bellum_outreach"),
        max_tokens=_MAX_TOKENS,
        **_sampling(model_for("bellum_outreach")),
        system=build_system_prompt(),
        messages=[
            {
                "role": "user",
                "content": build_user_prompt(
                    channel=channel, consultant=consultant, need=need, variant=None, previous=None
                ),
            }
        ],
    )
    return "".join(b.text for b in response.content if b.type == "text")


def call_api(prompt: str, options: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    mode = (options.get("config") or {}).get("mode", "chat")
    variables = context.get("vars") or {}
    try:
        if mode == "org_declare":
            output = _org_declare(str(variables.get("text", prompt)), str(variables.get("account", "")))
        elif mode == "talent_message":
            output = _talent_message(str(variables.get("channel", "email")))
        else:
            replay = variables.get("tool_output")
            per_tool = variables.get("tool_outputs")
            output = _chat(
                prompt,
                None if replay is None else str(replay),
                {str(k): str(v) for k, v in per_tool.items()} if isinstance(per_tool, dict) else None,
            )
    except Exception as exc:  # noqa: BLE001 — remonté tel quel à promptfoo (cas rouge, jamais un faux vert)
        return {"error": f"{type(exc).__name__}: {exc}"}
    return {"output": output}
