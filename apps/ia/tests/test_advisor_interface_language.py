"""#1958.8/.9 — Laura répond dans la langue de l'INTERFACE, jamais devinée.

Décision de Louis (12/09/2026) : « langue de l'interface, tutoiement fixe ».
Avant ce lot, ``bellum_advisor.py`` écrivait « Réponds en français » en dur —
un utilisateur en interface anglaise recevait Laura en français quel que soit
son message.

Trois garanties tenues ici :
 1. absent = français, STRICTEMENT comme avant (rétrocompatibilité d'un
    appelant qui ne connaît pas encore le champ) ;
 2. une valeur inconnue (typo, futur troisième canal, valeur corrompue) ne
    lève jamais et retombe sur le français — jamais une langue devinée ;
 3. la langue vient de la REQUÊTE, jamais du contenu du message (#1958.9) — ce
    fichier ne teste que ce que ``build_system_prompt`` fait de l'argument
    qu'on lui passe, pas une détection de langue sur le texte, qui n'existe
    nulle part dans ce lot.

# Recette du 13/09 — interface en anglais, réponse en français : la consigne
anglaise atteignait le modèle, mais UNE phrase à 93 % d'un prompt français ne
tenait pas contre un message en français. Ce fichier tient maintenant aussi sa
POSITION (tête du segment de session + rappel en dernier texte), et la garde
déterministe « aucune phrase n'ordonne le français » pour l'anglais. Le chemin
réel (route ``/chat/message``, les deux transports) est rejoué dans
``test_chat_interface_language_route.py``.
"""

from __future__ import annotations

import re

from app.models.chat import ChatRequest
from app.prompts.bellum_advisor import (
    _LANGUAGE_HEADS,
    _LANGUAGE_REMINDERS,
    append_before_language_reminder,
    build_system_prompt,
)
from app.services.claude_service import CACHE_SEGMENT_BREAK

# ── La garde : une phrase qui ORDONNE le français ───────────────────────────
#
# Un verbe d'ordre (réponds, écris, rédige, parle — ou son équivalent anglais)
# suivi, dans la même phrase et à moins de 40 caractères, de la langue. Elle
# vise « Réponds en français », « Écris en français », « Answer in French » ;
# elle ne vise pas « le même texte en français et en anglais » (bloc OUTILS,
# présent dans les deux langues), ni « Réponds maintenant avec ce que tu as »
# (note de fin de budget de l'orchestrateur), ni « written in French » (la
# consigne anglaise elle-même).
FRENCH_ORDER = re.compile(
    r"\b(r[ée]ponds|[ée]cris|r[ée]dige|parle|answer|reply|respond|write)\b[^.\n]{0,40}"
    r"\b(en fran[çc]ais|in french)\b",
    re.IGNORECASE,
)


def orders_french(text: str) -> list[str]:
    """Les phrases de ``text`` qui ordonnent de répondre en français."""
    return [match.group(0) for match in FRENCH_ORDER.finditer(text)]


def test_absent_defaults_to_french_byte_identical():
    """La garde qui sait dire NON : un appelant qui ne connaît pas le
    paramètre doit obtenir EXACTEMENT le prompt d'avant ce lot."""
    without_kwarg = build_system_prompt({}, {}, "", "")
    explicit_fr = build_system_prompt({}, {}, "", "", interface_language="fr")
    assert without_kwarg == explicit_fr
    assert "Réponds en français, de manière directe et utile." in without_kwarg


def test_english_interface_gets_an_english_instruction():
    prompt = build_system_prompt({}, {}, "", "", interface_language="en")
    assert "Réponds en français" not in prompt
    assert "Answer in English" in prompt


def test_an_unknown_language_falls_back_to_french_never_raises():
    for garbage in ("de", "xx", "", "FR", "French", None):
        prompt = build_system_prompt({}, {}, "", "", interface_language=garbage)  # type: ignore[arg-type]
        assert "Réponds en français, de manière directe et utile." in prompt
        assert prompt == build_system_prompt({}, {}, "", "")


def test_the_english_instruction_names_the_tutoiement_equivalent_register():
    """D82 : le tutoiement est FIXE dans l'app en français ; en anglais, le
    prompt doit porter l'équivalent — un registre direct, jamais un
    formalisme distant — plutôt que de laisser le modèle deviner."""
    prompt = build_system_prompt({}, {}, "", "", interface_language="en")
    assert "familiar, first-name register" in prompt


def test_the_english_instruction_covers_number_and_currency_formatting():
    """#1958.11/.12/.16/.17 — sans consigne, rien ne dit au modèle QUELLE
    convention utiliser pour les nombres et les devises en anglais ; il retombe
    sur son biais français par défaut (« 1 234,56 € », virgule décimale). La
    tête anglaise doit nommer explicitement la convention (virgule des
    milliers, point décimal, symbole devant le montant) — un exemple, pas une
    généralité que le modèle interprète à sa main.
    """
    prompt = build_system_prompt({}, {}, "", "", interface_language="en")
    assert "1,234.56" in prompt
    assert "1 234,56" in prompt  # la convention française, nommée pour être écartée
    # Le prompt par défaut (français) reste byte-identique : rien de cette
    # consigne ne fuit hors de la tête anglaise.
    assert "1,234.56" not in build_system_prompt({}, {}, "", "")


def test_the_language_moves_the_session_and_volatile_segments_never_the_invariant_one():
    """La langue est STABLE PAR SESSION (comme le profil et le prénom), pas un
    argument qui doit fragmenter le segment INVARIANT du cache — voir
    ``test_prompt_cache_segmentation.py``. Hors français, le segment volatil
    porte en plus le rappel, et RIEN d'autre n'y change."""
    fr = build_system_prompt({}, {}, "", "", interface_language="fr")
    en = build_system_prompt({}, {}, "", "", interface_language="en")
    fr_segments = fr.split(CACHE_SEGMENT_BREAK)
    en_segments = en.split(CACHE_SEGMENT_BREAK)
    assert len(fr_segments) == len(en_segments) == 3
    assert fr_segments[0] == en_segments[0], "le segment INVARIANT ne doit jamais dépendre de la langue"
    assert fr_segments[1] != en_segments[1], "la langue doit vivre dans le segment stable-par-session"
    assert en_segments[2] == fr_segments[2] + f"\n\n{_LANGUAGE_REMINDERS['en']}"


# ── Recette du 13/09 — la POSITION et la PRIORITÉ ───────────────────────────


def test_every_supported_language_other_than_french_has_a_head_and_a_reminder():
    assert set(_LANGUAGE_HEADS) == set(_LANGUAGE_REMINDERS) == {"en"}


def test_the_english_directive_opens_the_session_segment():
    """Le premier texte lu après les ~27 000 caractères de règles invariantes."""
    en = build_system_prompt({"esn_name": "MonESN"}, {}, "", "", first_name="Louis", interface_language="en")
    session = en.split(CACHE_SEGMENT_BREAK)[1]
    assert session.startswith(f"\n\n{_LANGUAGE_HEADS['en']}\n\nPROFIL ESN :")
    # Une seule fois : pas de reste de l'ancienne phrase en fin de segment.
    assert en.count("Answer in English") == 1


def test_the_english_directive_is_the_last_text_of_the_prompt_even_with_a_full_volatile_block():
    en = build_system_prompt(
        {"esn_name": "MonESN"},
        {"company_name": "Groupe Vallée"},
        "Jean - DSI",
        "Plan A",
        knowledge_context="Extrait RAG en français.",
        pinned_facts=["Budget IT voté"],
        conversation_summary="Résumé en français.",
        not_consulted=["CRM non connecté"],
        page_context="ÉCRAN : Comptes",
        interface_language="en",
    )
    assert en.endswith(f"\n\n{_LANGUAGE_REMINDERS['en']}")


def test_the_english_directive_settles_the_conflicts_the_model_settled_alone():
    head = _LANGUAGE_HEADS["en"]
    # Le message en français — le cas mesuré en production.
    assert "even when their message is written in French" in head
    assert "comes before every other instruction" in head
    # Les formes que les règles invariantes imposent en français.
    for heading in ("**Goal:**", "**Hook:**", "**Use case:**", "**Next step:**"):
        assert heading in head
    # #1924.1 — le gabarit CONSEIL a ses PROPRES intitulés depuis le 16/09/2026.
    # Sans leur traduction ici, un utilisateur anglophone recevrait un conseil
    # titré en français, ou pire : des intitulés improvisés que
    # `StructuredReply.tsx::RECOGNIZED_TITLES` ne reconnaîtrait pas, donc aucune
    # carte. Les deux jeux sont traduits, et ils sont DISTINCTS.
    for heading in ("**Verdict:**", "**Why:**", "**What's missing:**"):
        assert heading in head, f"intitulé anglais du conseil absent : {heading}"
    assert "[Discover](/discover)" in head
    # #1960 (bloc QUAND ÇA NE MARCHE PAS) : « le libellé suit la langue de la
    # conversation ». Un message tapé en français ferait lire « français » ; la
    # tête dit que cette langue est l'anglais, garde la cible `#signaler:` que
    # le rendu web reconnaît, et traduit le libellé sans recopier le français.
    assert "(#signaler:<summary>)" in head
    assert "[Report this problem]" in head
    assert "the language of the conversation, that language is English" in head
    assert "[Signaler ce problème]" not in head
    # Un message ENVOYÉ à un contact garde la langue de son destinataire.
    assert "follows the language that recipient reads" in head


def test_the_english_head_does_not_quote_a_fragment_of_the_invariant_rules():
    """Les gardes de ``test_copilote_*_eval.py`` retirent un bloc et vérifient
    qu'aucun de ses fragments ne survit ailleurs. Une consigne de langue qui
    recopierait « j'en déduis » ou un intitulé français les rendrait vertes par
    coïncidence en anglais : la tête DÉCRIT les formes, elle ne les recopie pas."""
    head = _LANGUAGE_HEADS["en"]
    for fragment in ("j'en déduis", "**Objectif :**", "**Angle d'accroche :**", "[Découvrir]", "Je n'ai pas"):
        assert fragment not in head


def test_the_links_of_the_english_head_are_the_links_the_french_prompt_already_allows():
    """``test_copilote_prompt_blocks.py`` vérifie que chaque chemin du prompt
    existe dans la navigation du web. La tête anglaise ne doit introduire aucun
    chemin que le prompt français ne porte pas déjà."""
    fr_routes = set(re.findall(r"\]\((/[a-z0-9/-]+)\)", build_system_prompt({}, {}, "", "")))
    en_routes = set(re.findall(r"\]\((/[a-z0-9/-]+)\)", _LANGUAGE_HEADS["en"]))
    assert en_routes, "la tête anglaise doit nommer les écrans avec leur chemin"
    assert en_routes <= fr_routes, en_routes - fr_routes


# ── La garde déterministe, et ses trois preuves ─────────────────────────────


def test_GUARD_an_english_prompt_contains_no_sentence_that_orders_french():
    en = build_system_prompt(
        {"esn_name": "MonESN"},
        {"company_name": "Groupe Vallée"},
        "Jean - DSI",
        "Plan A",
        first_name="Louis",
        not_consulted=["CRM non connecté"],
        interface_language="en",
    )
    assert orders_french(en) == []


def test_GUARD_reads_something_the_french_prompt_does_order_french():
    """Elle LIT : sur le prompt français, elle trouve exactement la consigne."""
    assert orders_french(build_system_prompt({}, {}, "", "")) == ["Réponds en français"]


def test_GUARD_says_NO_when_a_french_order_is_glued_into_the_english_prompt():
    en = build_system_prompt({}, {}, "", "", interface_language="en")
    for injected in ("Réponds en français.", "Écris toujours en français.", "Always answer in French."):
        assert orders_french(en + "\n" + injected), injected


def test_GUARD_does_not_catch_what_it_does_not_target():
    """Témoins légitimes, présents ou voisins du prompt anglais."""
    neutral = (
        "un libellé se renomme, et il n'a pas le même texte en français et en anglais. "
        "Tu n'as plus le temps d'appeler un outil. Réponds maintenant avec ce que tu as déjà. "
        "even when their message is written in French. "
        "Tu décris l'écran, puis la réponse part en anglais."
    )
    assert orders_french(neutral) == []
    assert orders_french(_LANGUAGE_HEADS["en"]) == []
    assert orders_french(_LANGUAGE_REMINDERS["en"]) == []


# ── L'orchestrateur ajoute sa mention AVANT le rappel ───────────────────────


def test_an_addendum_goes_before_the_english_reminder():
    en = build_system_prompt({}, {}, "", "", interface_language="en")
    out = append_before_language_reminder(en, "\n\nCAPACITÉS ABSENTES : email.")
    assert out.endswith(f"\n\nCAPACITÉS ABSENTES : email.\n\n{_LANGUAGE_REMINDERS['en']}")
    assert out.count(_LANGUAGE_REMINDERS["en"]) == 1


def test_an_addendum_to_a_french_prompt_is_the_plain_concatenation_of_before():
    fr = build_system_prompt({}, {}, "", "")
    addendum = "\n\nCAPACITÉS ABSENTES : email."
    assert append_before_language_reminder(fr, addendum) == fr + addendum


def test_chat_request_model_accepts_the_optional_field_and_defaults_to_french():
    # Un appelant qui omet le champ (rétrocompatibilité front/API anciens).
    legacy = ChatRequest(message="Bonjour", user_id="u1")
    assert legacy.interface_language == "fr"

    req = ChatRequest(message="Hello", user_id="u1", interface_language="en")
    assert req.interface_language == "en"


def test_the_body_of_an_api_not_yet_redeployed_gets_the_prompt_of_before():
    """Forme ANCIENNE : le corps que l'API d'avant ce lot envoie (aucune clé
    `interface_language`) — la fenêtre où le service IA est déjà redéployé et
    l'API pas encore. Le prompt doit être celui d'avant, au caractère près."""
    old_api_body = {
        "message": "Hello",
        "user_id": "u1",
        "workspace_id": "ws-1",
        "account_id": "",
        "history": [],
        "pinned_facts": ["Budget IT voté"],
        "document_ids": [],
        "clarification_asked": False,
    }
    req = ChatRequest.model_validate(old_api_body)
    assert req.interface_language == "fr"
    assert build_system_prompt({}, {}, "", "", interface_language=req.interface_language) == build_system_prompt(
        {}, {}, "", ""
    )
