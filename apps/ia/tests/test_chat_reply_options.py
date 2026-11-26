"""#2679 — UNE PRÉCISION POSÉE EN TEXTE SE CLIQUE AUSSI (côté service IA).

Le retour de Louis : « là ça serait bien de juste pouvoir sélectionner la
réponse, sans avoir besoin de la réécrire dans le chat, c'est bien plus smooth ».

Le bloc `_BLOCK_ASK_FIRST` autorise Laura à poser jusqu'à trois précisions DANS
le texte de sa réponse, et c'est la forme la plus fréquente — la seule qui ne
coûte NI un tour de modèle NI la carte de clarification du fil. Elle arrivait à
l'écran en markdown nu : il fallait retaper la réponse qu'on venait de lire.

Même voie que #1927.3 / #1927.4 et #2268 : un outil TYPÉ que le modèle appelle
EN PLUS de son texte — jamais un détecteur qui relit une phrase. Aucune option
n'est extraite de la prose.

Les quatre choses que cette suite tient :
 1. le PROMPT demande la forme structurée, et la phrase reste (on ne remplace
    pas une question lisible par une liste nue) ;
 2. l'outil est SILENCIEUX et GRATUIT : à côté d'un texte déjà écrit, le tour
    se termine sans payer un aller-retour de modèle de plus, et il n'annonce
    aucune étape ;
 3. la BORNE tient : l'outil reste dans la boîte même quand la clarification du
    fil est dépensée (il ne la consomme pas), et sa sortie n'entre JAMAIS dans
    l'état du fil comme une question posée — sinon `has_questions()` fermerait
    `ask_clarification` par effet de bord ;
 4. la FORME est bornée ici et nulle part ailleurs : trois précisions au plus,
    quatre réponses au plus chacune, et un appel sans rien à proposer est refusé
    plutôt que rendu vide.
"""

from __future__ import annotations

import asyncio

from app.prompts.bellum_advisor import build_system_prompt
from app.services import chat_orchestrator
from app.services.chat_thread_state import OPTION_MAX, OPTIONS_MAX, QUESTIONS_MAX, ThreadState, ThreadStateCollector
from app.services.chat_tools import CHAT_TOOLS, REPLY_OPTIONS_TOOL, REPLY_OPTIONS_TOOL_NAME, execute_chat_tool
from tests.test_unrouted_intent import USER, _resp, _text, _tool_use, fake_model  # noqa: F401


# ── 1. Le prompt demande la forme structurée, et la phrase reste ─────────────


def test_the_prompt_asks_for_the_structured_form_without_dropping_the_sentence() -> None:
    prompt = build_system_prompt({}, {}, "", "")

    # La forme structurée est DEMANDÉE, par son nom d'outil : sans ça, le champ
    # serait du code juste que personne n'appelle.
    assert REPLY_OPTIONS_TOOL_NAME in prompt
    # Et la question reste posée en toutes lettres dans le texte : les options
    # s'ajoutent à la phrase, elles ne la remplacent pas.
    assert "Deux précisions au plus" in prompt
    assert "chacune avec deux ou trois réponses possibles" in prompt


def test_the_prompt_makes_the_tool_call_non_negotiable() -> None:
    """#2679 — recette écran de production du 22/09 (soir), sur `8009cf678`,
    conversation NEUVE (postérieure au déploiement de ce matin) : Laura a posé
    trois précisions dans son texte SANS appeler `offer_reply_options` — options
    rendues en `<strong>` markdown, aucun `role`, curseur normal, clic sans
    effet. Le mécanisme est câblé de bout en bout (outil, orchestrateur, API,
    écran) et testé ailleurs dans ce fichier : ce qui manquait est une consigne
    qui ne laisse aucune place à l'oubli — la mention d'avant vivait en fin de
    la phrase « COMBIEN », une clause parmi d'autres, jamais un impératif à
    elle seule. Ce test sait dire NON : sans le paragraphe dédié, il rougit."""
    prompt = build_system_prompt({}, {}, "", "")

    assert "TOUJOURS CLIQUABLE" in prompt
    assert "sans exception" in prompt


# ── 2. Silencieux et GRATUIT — le cœur du point ──────────────────────────────


def test_the_options_next_to_the_answer_end_the_turn_without_another_model_call(fake_model) -> None:
    """LA GRATUITÉ. Tout l'intérêt de la précision en texte est qu'elle ne coûte
    pas un tour de modèle, contrairement à la carte. Si l'outil en payait un, on
    se serait trompé de chemin."""
    messages = fake_model(
        [
            _resp(
                "tool_use",
                [
                    _text("Je regarde. Sur quel territoire, et quelle taille visée ?"),
                    _tool_use(
                        REPLY_OPTIONS_TOOL_NAME,
                        {
                            "precisions": [
                                {"question": "Sur quel territoire ?", "options": ["Île-de-France", "Toute la France"]},
                                {"question": "Quelle taille visée ?", "options": ["250 à 499", "Plus de 1 000"]},
                            ]
                        },
                        "t1",
                    ),
                ],
            )
        ]
    )
    events: list[dict] = []

    async def emit(event: dict) -> None:
        events.append(event)

    reply, actions = asyncio.run(
        chat_orchestrator.run_chat_with_tools(
            "system", "Trouve-moi des comptes dans la banque", user_id=USER, profile_data=None, emit=emit
        )
    )

    assert reply.startswith("Je regarde.")
    assert len(messages.calls) == 1, "une précision en texte ne doit pas payer un aller-retour de modèle de plus"
    assert not [event for event in events if event.get("type") == "step"], "l'outil silencieux n'affiche aucune étape"
    # Le TOUR porte les options : sans cette entrée, `chat.py` n'aurait rien à
    # mettre dans le contexte, et l'écran rien à rendre.
    carried = [action["reply_options"] for action in actions if action.get("reply_options")]
    assert carried == [
        [
            {"question": "Sur quel territoire ?", "options": ["Île-de-France", "Toute la France"]},
            {"question": "Quelle taille visée ?", "options": ["250 à 499", "Plus de 1 000"]},
        ]
    ]


# ── 3. La borne « une clarification par fil » reste tenue ────────────────────


def test_the_tool_stays_in_the_box_once_the_clarification_of_the_thread_is_spent(fake_model) -> None:
    """La carte est retirée après une clarification (§9.4) ; la précision en
    texte, elle, n'est pas une carte et ne se dépense pas. Le TÉMOIN est dans la
    même mesure : `ask_clarification`, lui, a bien disparu."""
    messages = fake_model([_resp("end_turn", [_text("Voici ce que je vois.")])])

    async def emit(_event: dict) -> None:
        return None

    asyncio.run(
        chat_orchestrator.run_chat_with_tools(
            "system",
            "Et ensuite ?",
            user_id=USER,
            profile_data=None,
            emit=emit,
            clarification_already_asked=True,
        )
    )

    names = {tool["name"] for tool in messages.calls[0]["tools"]}
    assert REPLY_OPTIONS_TOOL_NAME in names
    assert "ask_clarification" not in names


def test_the_options_never_enter_the_thread_state_as_a_question_asked() -> None:
    """Sinon `has_questions()` (lu par `chat.py` pour composer
    `clarification_already_asked`) fermerait `ask_clarification` au tour suivant
    — la borne contournée par effet de bord, c'est-à-dire un défaut."""
    collector = ThreadStateCollector(ThreadState())

    collector.record(
        REPLY_OPTIONS_TOOL_NAME,
        {},
        {
            "status": "reply_options",
            "reply_options": [{"question": "Sur quel territoire ?", "options": ["Île-de-France"]}],
        },
    )

    assert not collector.state.questions
    assert not collector.state.has_questions()


# ── 4. La forme, bornée ici et nulle part ailleurs ───────────────────────────


async def _offer(**fields: object) -> dict:
    return await execute_chat_tool(REPLY_OPTIONS_TOOL_NAME, fields, user_id="u-1", profile_data=None)


async def test_the_executor_keeps_what_the_model_named() -> None:
    out = await _offer(
        precisions=[{"question": "Sur quel territoire ?", "options": ["Île-de-France", "Toute la France"]}]
    )

    assert out["status"] == "reply_options"
    assert out["reply_options"] == [
        {"question": "Sur quel territoire ?", "options": ["Île-de-France", "Toute la France"]}
    ]


async def test_the_executor_bounds_the_precisions_and_the_options() -> None:
    out = await _offer(
        precisions=[
            {"question": f"Question {index} ?", "options": [f"Réponse {index}-{n}" for n in range(OPTIONS_MAX + 3)]}
            for index in range(QUESTIONS_MAX + 2)
        ]
    )

    assert len(out["reply_options"]) == QUESTIONS_MAX
    assert all(len(precision["options"]) == OPTIONS_MAX for precision in out["reply_options"])
    assert all(len(option) <= OPTION_MAX for precision in out["reply_options"] for option in precision["options"])


async def test_a_precision_with_a_single_option_is_dropped_not_padded() -> None:
    out = await _offer(
        precisions=[
            {"question": "Sur quel territoire ?", "options": ["Île-de-France"]},
            {"question": "Quelle taille visée ?", "options": ["250 à 499", "Plus de 1 000"]},
        ]
    )

    assert [precision["question"] for precision in out["reply_options"]] == ["Quelle taille visée ?"]


async def test_a_call_with_nothing_to_offer_is_refused() -> None:
    """Un appel vide rendrait un champ vide, donc un groupe de boutons vide :
    on refuse plutôt que d'afficher ce qu'on n'a pas."""
    assert "error" in await _offer()
    assert "error" in await _offer(precisions=[])
    assert "error" in await _offer(precisions=[{"question": "Et sinon ?", "options": []}])
    assert "error" in await _offer(precisions=[{"options": ["Île-de-France", "Toute la France"]}])


def test_the_tool_is_always_in_the_toolbox_and_asks_for_its_two_fields() -> None:
    assert REPLY_OPTIONS_TOOL in CHAT_TOOLS
    schema = REPLY_OPTIONS_TOOL["input_schema"]
    assert schema["required"] == ["precisions"]
    item = schema["properties"]["precisions"]["items"]
    assert set(item["required"]) == {"question", "options"}
