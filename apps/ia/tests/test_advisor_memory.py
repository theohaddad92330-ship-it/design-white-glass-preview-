"""Long memory (Théo P2) — the advisor prompt injects pinned facts, user
preferences and the rolling conversation summary so the copilot "remembers"."""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt


def test_pinned_facts_preferences_and_summary_are_injected():
    prompt = build_system_prompt(
        {},
        {},
        "",
        "",
        pinned_facts=["Budget IT voté en Q2", "   "],  # blanks dropped
        user_preferences={"ton": "direct", "langue": "fr", "vide": ""},
        conversation_summary="• Utilisateur : quels comptes prioriser ?",
    )
    assert "MÉMOIRE" in prompt
    assert "Budget IT voté en Q2" in prompt
    assert "ton : direct" in prompt
    assert "langue : fr" in prompt
    # Empty preference values are not rendered.
    assert "vide :" not in prompt
    assert "quels comptes prioriser ?" in prompt


def test_no_memory_section_when_nothing_to_remember():
    # #2260 — la garde visait le TITRE de la section (`_format_memory`), pas le
    # mot lui-même : `_BLOCK_MEMORY_GOVERNANCE` (invariant, #2260) écrit
    # légitimement « GOUVERNANCE DE LA MÉMOIRE » dans TOUT prompt, qu'il y ait
    # ou non quelque chose à retenir. `"MÉMOIRE" not in prompt` l'aurait fait
    # rougir pour la mauvaise raison — la garde n'attrape que le TITRE.
    prompt = build_system_prompt({}, {}, "", "")
    assert "MÉMOIRE (à prendre en compte) :" not in prompt


def test_memory_is_null_safe():
    # None / missing memory must not crash the builder (degradable).
    prompt = build_system_prompt({}, {}, "", "", pinned_facts=None, user_preferences=None)
    assert "Enjeux IT :" in prompt  # prompt still renders normally


def test_portfolio_digest_injected_when_no_active_account():
    # No account_data (shared thread) → the portfolio block lets the copilote
    # answer transverse / named-account questions instead of "compte vide" (§13).
    prompt = build_system_prompt(
        {},
        {},  # no active account
        "",
        "",
        accounts_summary="BNP Paribas — Banque — 5/10\nDoctolib — Programmation informatique — 4/10",
    )
    assert "PORTEFEUILLE DE COMPTES" in prompt
    assert "BNP Paribas — Banque — 5/10" in prompt


def test_portfolio_digest_omitted_when_an_account_is_active():
    # A single account IS active → don't dilute the focused COMPTE ANALYSÉ block.
    prompt = build_system_prompt(
        {},
        {"company_name": "BNP Paribas", "sector": "Banque"},
        "",
        "",
        accounts_summary="BNP Paribas — Banque — 5/10",
    )
    assert "PORTEFEUILLE DE COMPTES" not in prompt


def test_summary_is_capped():
    huge = "x" * 5000
    prompt = build_system_prompt({}, {}, "", "", conversation_summary=huge)
    # Only the capped slice (2000) reaches the prompt, not the full 5000.
    assert "x" * 2000 in prompt
    assert "x" * 2001 not in prompt


# ── #1962 — nature (kind) et origine (origin) d'un élément épinglé ──────────
#
# Constat du 12/09/2026 : `SaveReply.tsx` / `PendingActions.tsx` épinglent une
# réponse de Laura avec `origin: 'copilot'` et sans `kind` (défaut serveur
# 'fact'), et `_format_memory` réduisait chaque élément à son texte — une
# conclusion de Laura jamais confirmée entrait donc à ÉGALITÉ avec une
# correction humaine sous « Faits épinglés (à respecter en priorité) ».


def test_a_correction_dominates_and_is_named_as_such():
    prompt = build_system_prompt(
        {},
        {},
        "",
        "",
        pinned_facts=[{"fact": "ALTEN a quitté le compte", "kind": "correction", "origin": "manual"}],
    )
    assert "ALTEN a quitté le compte" in prompt
    assert "CORRECTIONS" in prompt
    position = {token: prompt.index(token) for token in ("CORRECTIONS", "ALTEN a quitté le compte")}
    assert position["CORRECTIONS"] < position["ALTEN a quitté le compte"]


def test_a_laura_note_is_never_confirmed_and_never_dominates():
    """#1962.24/.25/.27 — origin='copilot' rend une NOTE, jamais un fait confirmé."""
    prompt = build_system_prompt(
        {},
        {},
        "",
        "",
        pinned_facts=[{"fact": "ALTEN ne serait plus chez eux", "kind": "fact", "origin": "copilot"}],
    )
    assert "ALTEN ne serait plus chez eux" in prompt
    assert "NOTES DE LAURA" in prompt
    assert "jamais confirmée" in prompt or "jamais confirmé" in prompt
    # Elle ne se lit JAMAIS sous le rang « Faits épinglés » : ce bloc-là est
    # absent quand la SEULE mémoire épinglée est une note de Laura.
    assert "Faits épinglés" not in prompt


def test_a_correction_and_a_laura_note_are_rendered_in_separate_named_sections():
    prompt = build_system_prompt(
        {},
        {},
        "",
        "",
        pinned_facts=[
            {"fact": "ALTEN a quitté le compte", "kind": "correction", "origin": "manual"},
            {"fact": "ALTEN ne serait plus chez eux (à confirmer)", "kind": "fact", "origin": "copilot"},
            {"fact": "Budget IT voté en Q2", "kind": "fact", "origin": "manual"},
        ],
    )
    positions = {
        token: prompt.index(token)
        for token in ("CORRECTIONS", "ALTEN a quitté le compte", "Budget IT voté en Q2", "NOTES DE LAURA")
    }
    # Rang : correction avant fait déclaré avant note de Laura.
    ordered = sorted(positions, key=positions.get)
    assert ordered == ["CORRECTIONS", "ALTEN a quitté le compte", "Budget IT voté en Q2", "NOTES DE LAURA"]


# ── Q1 (décision de Louis du 13/09) — une note de Laura CONFIRMÉE par une personne ──
#
# Quand une personne réécrit le texte d'une note de Laura, la note est
# « confirmée par <prénom> » : l'origine reste `copilot` (on ne réécrit pas la
# provenance), mais Laura la traite comme un fait DÉCLARÉ — même rang que ce
# qu'une personne a épinglé. Le rang se calcule à UN endroit : `_format_memory`.


def test_a_confirmed_laura_note_ranks_with_declared_facts_not_as_an_unconfirmed_note():
    prompt = build_system_prompt(
        {},
        {},
        "",
        "",
        pinned_facts=[
            {"fact": "ALTEN n'est plus sur le compte", "kind": "fact", "origin": "copilot", "confirmed": True},
        ],
    )
    assert "ALTEN n'est plus sur le compte" in prompt
    assert "Faits épinglés par l'utilisateur" in prompt
    assert "NOTES DE LAURA" not in prompt


def test_an_unconfirmed_laura_note_stays_a_note_beside_a_confirmed_one():
    """Le témoin : la confirmation d'UNE note ne promeut pas les autres."""
    prompt = build_system_prompt(
        {},
        {},
        "",
        "",
        pinned_facts=[
            {"fact": "Note relue et corrigée", "kind": "fact", "origin": "copilot", "confirmed": True},
            {"fact": "Note jamais relue", "kind": "fact", "origin": "copilot"},
        ],
    )
    declared_at = prompt.index("Faits épinglés par l'utilisateur")
    notes_at = prompt.index("NOTES DE LAURA")
    assert declared_at < prompt.index("Note relue et corrigée") < notes_at
    assert prompt.index("Note jamais relue") > notes_at


def test_confirmed_is_read_strictly_and_from_objects_too():
    """Seul un VRAI booléen confirme : une chaîne « true » d'un appelant mal formé
    ne promeut rien. Et l'objet pydantic du vrai chemin se lit comme un dict."""
    from app.models.chat import ChatRequest
    from app.routers.chat import _pinned_memory

    req = ChatRequest.model_validate(
        {
            "message": "hi",
            "user_id": "u-1",
            "pinned_facts": ["Relue", "Chaîne"],
            "pinned_memory": [
                {"fact": "Relue", "kind": "fact", "origin": "copilot", "confirmed": True},
                {"fact": "Chaîne", "kind": "fact", "origin": "copilot", "confirmed": "true"},
            ],
        }
    )
    prompt = build_system_prompt({}, {}, "", "", pinned_facts=_pinned_memory(req))
    assert prompt.index("Relue") < prompt.index("NOTES DE LAURA") < prompt.index("Chaîne")


def test_plain_string_items_are_still_read_as_a_manual_fact_backward_compat():
    """Un ancien appelant (ou un test existant) envoie des chaînes NUES : elles
    valent exactement ce qu'elles valaient avant #1962 — un fait manuel."""
    prompt = build_system_prompt({}, {}, "", "", pinned_facts=["Budget IT voté en Q2"])
    assert "Budget IT voté en Q2" in prompt
    assert "NOTES DE LAURA" not in prompt
    assert "CORRECTIONS" not in prompt


def test_an_unknown_kind_or_origin_degrades_to_the_historical_default_instead_of_crashing():
    """Un `kind`/`origin` illisible ne s'invente pas — il redevient ce qu'il
    valait avant #1962 (`fact`/`manual`), et ne fait JAMAIS tomber le tour :
    `PinnedMemoryItem` (côté IA) accepte des chaînes nues précisément pour ça,
    la validation tolérante vit ici."""
    prompt = build_system_prompt(
        {},
        {},
        "",
        "",
        pinned_facts=[{"fact": "valeur bizarre", "kind": "nope", "origin": "nope"}],
    )
    assert "valeur bizarre" in prompt
    assert "Faits épinglés par l'utilisateur" in prompt
    assert "CORRECTIONS" not in prompt
    assert "NOTES DE LAURA" not in prompt


def test_chat_request_accepts_pinned_memory_items_without_crashing_the_whole_turn():
    """Régression mesurée en écrivant #1962 : un `Literal["fact", …]` sur
    `PinnedMemoryItem.kind`/`origin` fait échouer TOUTE la requête (422) dès
    qu'UN élément de mémoire porte une valeur inconnue — un fait mal formé ne
    doit jamais faire tomber le tour entier. `ChatRequest` doit donc accepter
    le mélange chaîne nue / objet structuré / valeur inconnue sans lever."""
    from app.models.chat import ChatRequest

    req = ChatRequest(
        message="hi",
        user_id="u-1",
        pinned_facts=[
            "Budget IT voté",
            {"fact": "ALTEN a quitté le compte", "kind": "correction", "origin": "manual"},
            {"fact": "valeur bizarre", "kind": "nope", "origin": "nope"},
        ],
    )
    assert len(req.pinned_facts) == 3


def test_pinned_memory_item_objects_are_read_the_same_as_dicts():
    """Un appelant pydantic (le vrai chemin de production) envoie des OBJETS, pas
    des dicts — `_format_memory` doit les lire pareil (tolérant à la forme)."""

    class FakeItem:
        def __init__(self, fact: str, kind: str, origin: str) -> None:
            self.fact = fact
            self.kind = kind
            self.origin = origin

    prompt = build_system_prompt(
        {},
        {},
        "",
        "",
        pinned_facts=[FakeItem("ALTEN a quitté le compte", "correction", "manual")],
    )
    assert "ALTEN a quitté le compte" in prompt
    assert "CORRECTIONS" in prompt


# ── #1962.8 — compatibilité de DÉPLOIEMENT ────────────────────────────────────
#
# L'API et le service IA ne se déploient pas au même instant. Le corps que
# l'API envoie APRÈS ce lot (figé côté TS par `ia.client.spec.ts` — « keeps
# pinned_facts as plain strings and sends nature/origin under pinned_memory »)
# doit passer dans le modèle d'AVANT : `pinned_facts: list[str]`, clés inconnues
# ignorées. Sinon chaque tour portant une mémoire tombe en 422 pendant la fenêtre.

_API_BODY_AFTER_1962 = {
    "message": "hi",
    "user_id": "u-1",
    "pinned_facts": ["ALTEN a quitté le compte", "Budget IT voté"],
    "pinned_memory": [
        {"fact": "ALTEN a quitté le compte", "kind": "correction", "origin": "manual"},
        {"fact": "Budget IT voté", "kind": "fact", "origin": "copilot"},
    ],
    "interface_language": "en",
    "conversation_id": "general",
}


def _chat_request_before_1962():
    """Le modèle tel qu'il est sur `main` avant ce lot, réduit aux champs en jeu
    (pydantic ignore les autres clés par défaut, comme le vrai `ChatRequest`)."""
    from pydantic import BaseModel

    class ChatRequestBefore1962(BaseModel):
        message: str
        user_id: str
        pinned_facts: list[str] = []

    return ChatRequestBefore1962


def test_a_service_not_yet_redeployed_still_validates_the_new_api_body():
    before = _chat_request_before_1962().model_validate(_API_BODY_AFTER_1962)
    assert before.pinned_facts == ["ALTEN a quitté le compte", "Budget IT voté"]


def test_the_compat_guard_can_say_no_objects_in_pinned_facts_break_the_old_model():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        _chat_request_before_1962().model_validate(
            {**_API_BODY_AFTER_1962, "pinned_facts": _API_BODY_AFTER_1962["pinned_memory"]}
        )


def test_the_chat_turn_reads_the_structured_memory_when_the_api_sends_it():
    from app.models.chat import ChatRequest
    from app.routers.chat import _pinned_memory

    items = _pinned_memory(ChatRequest.model_validate(_API_BODY_AFTER_1962))
    assert [getattr(item, "kind", None) for item in items] == ["correction", "fact"]
    prompt = build_system_prompt({}, {}, "", "", pinned_facts=items)
    assert "CORRECTIONS" in prompt
    assert "NOTES DE LAURA" in prompt


def test_the_chat_turn_falls_back_to_plain_texts_from_an_api_not_yet_redeployed():
    from app.models.chat import ChatRequest
    from app.routers.chat import _pinned_memory

    req = ChatRequest.model_validate({"message": "hi", "user_id": "u-1", "pinned_facts": ["Budget IT voté"]})
    assert _pinned_memory(req) == ["Budget IT voté"]


def test_chat_router_hands_the_resolved_memory_to_the_prompt_and_the_transparency():
    """L'appelant, pas seulement la fonction : les deux lectures de la mémoire
    dans `_run_chat_turn` passent par `_pinned_memory(req)` — sinon l'une lirait
    les textes nus et l'autre les objets (deux lectures qui divergent)."""
    import ast
    from pathlib import Path

    path = Path(__file__).resolve().parent.parent / "app" / "routers" / "chat.py"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    targets = {"build_system_prompt", "build_context_transparency"}
    calls = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in targets
    ]
    assert {c.func.id for c in calls} == targets, f"corpus suspect : {[c.func.id for c in calls]}"
    for call in calls:
        value = next(kw.value for kw in call.keywords if kw.arg == "pinned_facts")
        assert isinstance(value, ast.Call) and getattr(value.func, "id", None) == "_pinned_memory", call.func.id


# ─────────────────────────────────────────────────────────────────────────────
# #1962.2/.5/.7/.9/.10 — LES QUATRE NATURES AJOUTÉES, ET LE RANG D'UNE HYPOTHÈSE
# ─────────────────────────────────────────────────────────────────────────────


def test_an_hypothesis_is_never_rendered_as_a_fact_to_respect_in_priority():
    """#1962.9/.15 — « je crois qu'ils internalisent » n'est pas un constat.

    Avant ce lot, `kind` hors des trois valeurs connues retombait sur `fact` :
    une hypothèse serait entrée dans « Faits épinglés par l'utilisateur (à
    respecter en priorité) » — une supposition lue comme une vérité, ce que la
    doctrine « jamais de donnée fictive » interdit.
    """
    prompt = build_system_prompt(
        {},
        {},
        "",
        "",
        pinned_facts=[{"fact": "Ils internalisent leur data", "kind": "hypothesis", "origin": "manual"}],
    )
    assert "HYPOTHÈSES À VÉRIFIER" in prompt
    assert "Ils internalisent leur data" in prompt
    # Le bloc des faits déclarés ne s'ouvre pas pour elle.
    assert "Faits épinglés par l'utilisateur" not in prompt


def test_an_hypothesis_stays_an_hypothesis_even_when_a_person_confirmed_its_text():
    """Confirmer le TEXTE d'une note dit « c'est bien ce que j'ai voulu écrire »,
    pas « c'est vrai » : une hypothèse garde son rang."""
    prompt = build_system_prompt(
        {},
        {},
        "",
        "",
        pinned_facts=[
            {
                "fact": "Piste : ils rouvrent un centre de services",
                "kind": "hypothesis",
                "origin": "copilot",
                "confirmed": True,
            }
        ],
    )
    assert "HYPOTHÈSES À VÉRIFIER" in prompt
    assert "Faits épinglés par l'utilisateur" not in prompt


def test_a_workspace_rule_a_sourced_observation_and_a_temporary_context_are_declared_facts():
    """Les trois autres natures ajoutées sont DÉCLARÉES par une personne : elles
    gardent le rang qu'elles avaient, celui des faits épinglés. Le témoin de ce
    que la garde n'attrape pas — seule l'hypothèse change de rang."""
    prompt = build_system_prompt(
        {},
        {},
        "",
        "",
        pinned_facts=[
            {"fact": "On ne travaille pas les banques de moins de 1000 salariés", "kind": "workspace_rule"},
            {"fact": "Levée de 12 M€ — communiqué du 3 mars", "kind": "sourced_observation"},
            {"fact": "Appel d'offres en cours", "kind": "temporary_context"},
        ],
    )
    assert "Faits épinglés par l'utilisateur" in prompt
    assert "On ne travaille pas les banques de moins de 1000 salariés" in prompt
    assert "Levée de 12 M€ — communiqué du 3 mars" in prompt
    assert "Appel d'offres en cours" in prompt
    assert "HYPOTHÈSES À VÉRIFIER" not in prompt


def test_an_hypothesis_never_outranks_a_correction():
    """Rang 1 reste la correction humaine (doctrine « une correction humaine
    gagne toujours ») : l'hypothèse arrive APRÈS, dans son propre bloc."""
    prompt = build_system_prompt(
        {},
        {},
        "",
        "",
        pinned_facts=[
            {"fact": "Le décideur est Julie Martin", "kind": "correction"},
            {"fact": "Ils internalisent peut-être", "kind": "hypothesis"},
        ],
    )
    assert prompt.index("CORRECTIONS DE L'UTILISATEUR") < prompt.index("HYPOTHÈSES À VÉRIFIER")


def test_3192_11_the_density_signal_reads_after_the_conversation_summary_not_before():
    """#3192.11 (30/09/2026, recette RÉFUTÉ « passe 3 ») — sur un fil NEUF
    (aucun résumé), le signal de densité #3192.10 faisait la preuve attendue ;
    sur le MÊME fil chargé, il n'avait plus d'effet visible, alors que
    `niveau_detail`/`expected_density` sont calculés sur le message du tour,
    identiques dans les deux cas (`chat.py`). Seule variable : la taille du
    contexte autour de la consigne.

    Avant ce lot, l'ordre posait le signal de densité PUIS, plus bas dans le
    MÊME bloc MÉMOIRE, le résumé de la conversation — sur un fil chargé, ce
    résumé devenait le texte le plus RÉCEMMENT lu par le modèle avant le
    rappel de langue, pas la consigne de densité. Même principe déjà posé pour
    `language_reminder` (#1980, « le rappel de langue doit rester le DERNIER
    texte lu par le modèle ») — jamais appliqué au signal de densité avant ce
    lot. Cette garde dit NON si l'ordre revient en arrière."""
    # Marqueur EXPLICITE (#3192.8, « bref ») — `reply_density_signal_block`.
    prompt_bref = build_system_prompt(
        {},
        {},
        "",
        "",
        conversation_summary="• Utilisateur : quels comptes prioriser ?",
        niveau_detail="bref",
    )
    resume_index = prompt_bref.index("quels comptes prioriser ?")
    assert prompt_bref.index("la personne a explicitement demandé un résumé bref") > resume_index

    # Classement IMPLICITE (#3192.10, sans marqueur) — `expected_density_signal_block`.
    prompt_micro = build_system_prompt(
        {},
        {},
        "",
        "",
        conversation_summary="• Utilisateur : quels comptes prioriser ?",
        expected_density="micro",
    )
    resume_index_micro = prompt_micro.index("quels comptes prioriser ?")
    assert prompt_micro.index("cette question est fermée et courte") > resume_index_micro


# ─────────────────────────────────────────────────────────────────────────────
# #3892.1 (ADD-SANOFI-06, retour bêta Sanofi 08/10/2026) — LA PORTÉE D'ORIGINE
# D'UN FAIT ÉPINGLÉ VOYAGE AVEC SON TEXTE
# ─────────────────────────────────────────────────────────────────────────────
#
# Constat : une centrale d'achat et un délai de six semaines déclarés pour UN
# compte (BPCE) étaient réutilisés dans l'analyse d'un AUTRE compte (Sanofi) —
# `_format_memory` réduisait chaque élément à son texte nu, sans jamais dire
# qu'il venait d'un compte précis. Un fait sans `account_name` reste une règle
# GÉNÉRALE de l'ESN (comportement historique, inchangé).


def test_an_account_scoped_fact_is_labeled_with_its_origin_account():
    prompt = build_system_prompt(
        {},
        {},
        "",
        "",
        pinned_facts=[
            {"fact": "Délai d'accès déclaré : six semaines", "kind": "fact", "account_name": "BPCE"},
        ],
    )
    assert "Délai d'accès déclaré : six semaines (compte : BPCE)" in prompt


def test_a_fact_without_an_account_name_is_rendered_as_a_general_rule_unlabeled():
    prompt = build_system_prompt(
        {},
        {},
        "",
        "",
        pinned_facts=[{"fact": "Nous ne proposons jamais de freelance", "kind": "fact"}],
    )
    assert "Nous ne proposons jamais de freelance" in prompt
    # Le GOUVERNANCE block cite « (compte : X) » comme EXEMPLE de gabarit — la
    # seule occurrence à exclure est celle collée au fait lui-même.
    assert "Nous ne proposons jamais de freelance (compte :" not in prompt


def test_the_account_label_reaches_corrections_hypotheses_and_laura_notes_too():
    prompt = build_system_prompt(
        {},
        {},
        "",
        "",
        pinned_facts=[
            {"fact": "Le décideur est Julie Martin", "kind": "correction", "account_name": "BPCE"},
            {"fact": "Ils internalisent peut-être", "kind": "hypothesis", "account_name": "BPCE"},
            {"fact": "ALTEN ne serait plus chez eux", "kind": "fact", "origin": "copilot", "account_name": "BPCE"},
        ],
    )
    assert "Le décideur est Julie Martin (compte : BPCE)" in prompt
    assert "Ils internalisent peut-être (compte : BPCE)" in prompt
    assert "ALTEN ne serait plus chez eux (compte : BPCE)" in prompt


def test_governance_block_warns_against_reusing_an_account_scoped_fact_elsewhere():
    prompt = build_system_prompt({}, {}, "", "")
    assert "(compte : X)" in prompt
    assert "ne valent pas automatiquement pour un autre" in prompt


def test_governance_block_requires_flagging_conclusions_a_correction_invalidates():
    """#3892.4 — une correction ne se contente pas de s'appliquer en silence."""
    prompt = build_system_prompt({}, {}, "", "")
    assert "UNE CORRECTION INVALIDE CE QUI EN DÉPENDAIT" in prompt
    assert "ne tient plus et pourquoi" in prompt


def test_governance_block_bans_presenting_a_declared_delay_as_a_start_guarantee():
    """#3892.5 — un délai d'accès déclaré n'est jamais un engagement."""
    prompt = build_system_prompt({}, {}, "", "")
    assert "N'EST PAS UNE GARANTIE DE DÉMARRAGE" in prompt
    assert "jamais un délai contractuel garanti" in prompt


def test_3192_recette_01_10_a_twelve_turn_thread_still_gets_the_micro_signal_last():
    """#3192 (recette prod 01/10) — rejoue le tour : fil de 12 échanges (résumé
    plein), relance « Et Armelle, elle est dans quel état de relation ? » →
    classée MICRO (`classify_expected_density`) → le signal arrive APRÈS le
    résumé. Question à poser en recette sur un fil de 10+ tours."""
    from app.services.response_density import classify_expected_density

    question = "Et Armelle, elle est dans quel état de relation ?"
    summary = "\n".join(f"• Utilisateur : question {i} sur SG" if i % 2 == 0 else f"• BellumAI : réponse {i}" for i in range(24))
    prompt = build_system_prompt(
        {},
        {},
        "",
        "",
        conversation_summary=summary,
        expected_density=classify_expected_density(question),
    )
    assert prompt.index("cette question est fermée et courte") > prompt.index("réponse 23")
