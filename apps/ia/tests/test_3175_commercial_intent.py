"""#3175.1/.2/.4/.5/.6 (épopée #3215) — L'OBJET ``CommercialIntent`` à treize
champs : construit une fois par tour, jamais exposé au modèle, consommé par
la télémétrie et par le vérificateur final.

Les tests savent dire NON : une demande sans marqueur ne fabrique AUCUN champ,
le texte brut ne sort jamais du journal, et une réponse sans preuve d'outil à
une question commerciale est signalée — jamais une réponse encyclopédique
laissée passer en silence.
"""

from __future__ import annotations

from dataclasses import fields
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.services.commercial_verifier import EVIDENCE_REQUIRED_MISSING, repair_addendum, verify_response
from app.services.compilers.commercial_intent import (
    COMMERCIAL_INTENT_FIELDS,
    CommercialIntent,
    build_commercial_intent,
    commercial_intent_for_log,
    commercial_intent_prompt_leak,
)
from app.services.compilers.intent_router import route_chat_intent

THIRTEEN = (
    "literal_request",
    "underlying_decision",
    "expected_outcome",
    "primary_entity",
    "secondary_entities",
    "requested_facets",
    "explicit_exclusions",
    "time_horizon",
    "requested_knowledge_scope",
    "action_level",
    "evidence_requirement",
    "ambiguity_level",
    "commercial_risk",
)


def _build(message: str, *, account: str | None = None, inputs: tuple[str, ...] = ()) -> CommercialIntent:
    route = route_chat_intent(message=message, active_account_company_name=account, available_inputs=inputs)
    return build_commercial_intent(message=message, route=route, available_inputs=inputs)


def test_l_objet_a_exactement_les_treize_champs_du_ticket() -> None:
    assert COMMERCIAL_INTENT_FIELDS == THIRTEEN
    assert tuple(f.name for f in fields(CommercialIntent)) == THIRTEEN


def test_une_qualification_litterale_porte_sa_decision_sous_jacente_et_exige_une_preuve_d_outil() -> None:
    intent = _build("Est-ce que je peux ouvrir Airbus ?", account="Airbus")
    assert intent.literal_request == "Est-ce que je peux ouvrir Airbus ?"
    assert intent.primary_entity == "Airbus"
    assert intent.underlying_decision == "ouvrir_ou_non_le_compte"
    assert intent.evidence_requirement == "preuve_d_outil"
    # Le routeur ne sait pas lire cette phrase seule : l'ambiguïté se DIT.
    assert intent.ambiguity_level in {"moyenne", "elevee"}


def test_une_demande_sans_marqueur_ne_fabrique_aucun_champ() -> None:
    intent = _build("bonjour")
    assert intent.underlying_decision is None
    assert intent.expected_outcome is None
    assert intent.primary_entity is None
    assert intent.requested_facets == ()
    assert intent.explicit_exclusions == ()
    assert intent.time_horizon is None
    assert intent.requested_knowledge_scope is None
    assert intent.evidence_requirement == "aucune"
    assert intent.ambiguity_level == "elevee"


def test_une_exclusion_explicite_et_le_perimetre_de_connaissance_se_lisent_sur_des_marqueurs_declares() -> None:
    intent = _build("Trouve-moi des comptes cyber, sans mes clients actuels, sans aller sur le web")
    assert "clients_existants" in intent.explicit_exclusions
    assert intent.requested_knowledge_scope == "internal_only"


def test_les_facettes_demandees_sont_nommees() -> None:
    intent = _build("Qui sont les contacts et l'organigramme chez Airbus, et quelles technologies ?", account="Airbus")
    assert {"contacts", "organigramme", "technologies"} <= set(intent.requested_facets)


def test_le_positionnement_d_un_consultant_n_est_jamais_encyclopedique() -> None:
    # #3175.4/.6 — « j'ai ce Java, j'en fais quoi ? » est une décision commerciale.
    intent = _build("J'ai ce Java senior disponible, j'en fais quoi ?")
    assert intent.underlying_decision == "positionner_un_consultant"
    assert intent.evidence_requirement == "preuve_d_outil"


def test_la_comparaison_d_options_est_une_decision_commerciale() -> None:
    intent = _build("Compare Airbus et Thales pour moi", account="Airbus")
    assert intent.underlying_decision == "choisir_entre_options"
    assert intent.evidence_requirement == "preuve_d_outil"


def test_un_message_a_envoyer_est_risque_eleve_et_s_arrete_a_la_preparation() -> None:
    intent = _build("Prépare un message de relance pour le CTO d'Airbus", account="Airbus")
    assert intent.action_level == "preparer"
    assert intent.commercial_risk == "eleve"


def test_le_journal_ne_contient_jamais_le_texte_ni_le_nom_du_compte() -> None:
    intent = _build("Est-ce que je peux ouvrir Airbus ?", account="Airbus")
    logged = commercial_intent_for_log(intent)
    flat = repr(logged)
    assert "Airbus" not in flat
    assert "ouvrir" not in flat.replace("ouvrir_ou_non_le_compte", "")
    assert "literal_request" not in logged
    assert logged["has_primary_entity"] is True
    assert logged["underlying_decision"] == "ouvrir_ou_non_le_compte"


def test_l_objet_n_est_jamais_expose_au_modele() -> None:
    intent = _build("Est-ce que je peux ouvrir Airbus ?", account="Airbus")
    assert commercial_intent_prompt_leak("un prompt système sans rien d'autre", intent) is False
    assert commercial_intent_prompt_leak(f"… {intent.literal_request} …", intent) is True


def test_le_verificateur_signale_une_reponse_sans_preuve_d_outil_quand_le_ticket_l_exige() -> None:
    result = verify_response(
        "Oui, Airbus prend des consultants, vas-y.",
        tool_outputs=[],
        evidence_requirement="preuve_d_outil",
    )
    assert EVIDENCE_REQUIRED_MISSING in result.repair_reasons
    assert "aucun résultat d'outil" in repair_addendum(result.repair_reasons, "fr")


def test_le_verificateur_laisse_passer_avec_preuve_ou_question_de_clarification_ou_sans_exigence() -> None:
    text = "Oui, Airbus prend des consultants."
    assert (
        EVIDENCE_REQUIRED_MISSING
        not in verify_response(text, tool_outputs=["{...}"], evidence_requirement="preuve_d_outil").repair_reasons
    )
    assert (
        EVIDENCE_REQUIRED_MISSING
        not in verify_response(
            "Tu parles de quel Airbus ?", tool_outputs=[], evidence_requirement="preuve_d_outil"
        ).repair_reasons
    )
    assert EVIDENCE_REQUIRED_MISSING not in verify_response(text, tool_outputs=[]).repair_reasons
    assert (
        EVIDENCE_REQUIRED_MISSING
        not in verify_response(text, tool_outputs=[], evidence_requirement="aucune").repair_reasons
    )


def test_le_tour_reel_construit_l_objet_et_le_relaie_au_verificateur_sans_le_montrer_au_modele(
    client: TestClient,
) -> None:
    """Rejoue le tour : POST /chat/message → objet construit → relayé à
    l'orchestrateur (``evidence_requirement``) → absent du prompt système."""
    captured: dict[str, object] = {}

    async def _capture(system: str, *_args: object, **kwargs: object) -> tuple[str, list]:
        captured["system"] = system
        captured["evidence_requirement"] = kwargs.get("evidence_requirement")
        return "Réponse de Laura.", []

    with patch(
        "app.services.chat_orchestrator.run_chat_with_tools",
        new_callable=AsyncMock,
        side_effect=_capture,
    ):
        res = client.post(
            "/chat/message",
            json={"message": "Est-ce que je peux ouvrir Airbus ?", "user_id": "u1"},
        )

    assert res.status_code == 200
    assert captured["evidence_requirement"] == "preuve_d_outil"
    for name in ("underlying_decision", "evidence_requirement", "commercial_risk", "ouvrir_ou_non_le_compte"):
        assert name not in str(captured["system"]), name


def _scope(excluded: tuple[str, ...] = (), included: tuple[str, ...] = ()):
    from app.services.chat_thread_state import ThreadObject, ThreadPersistentScope

    return ThreadPersistentScope(
        root_entity=ThreadObject(kind="account", id="grp", label="Vinci"),
        included_entities=tuple(ThreadObject(kind="account", id=f"i{n}", label=n) for n in included),
        excluded_entities=tuple(ThreadObject(kind="account", id=f"e{n}", label=n) for n in excluded),
    )


def _build_with_scope(message: str, scope):
    return build_commercial_intent(message=message, route=route_chat_intent(message=message), persistent_scope=scope)


def test_les_exclusions_du_perimetre_persistant_rejoignent_l_intention() -> None:
    # #3175 (reste du lot W02) — le Facet Ledger nomme ce qui est EXCLU ; l'objet le lit.
    intent = _build_with_scope("Trouve-moi des contacts", _scope(excluded=("Eurovia",)))
    assert "entites_du_perimetre_exclues" in intent.explicit_exclusions


def test_un_perimetre_sans_exclusion_ou_sans_perimetre_n_ajoute_aucune_exclusion() -> None:
    assert (
        "entites_du_perimetre_exclues"
        not in _build_with_scope("Trouve-moi des contacts", _scope(included=("Cofiroute",))).explicit_exclusions
    )
    assert "entites_du_perimetre_exclues" not in _build_with_scope("Trouve-moi des contacts", None).explicit_exclusions


def test_le_perimetre_persistant_nomme_son_entite_secondaire_sans_rendre_le_libelle() -> None:
    intent = _build_with_scope("Trouve-moi des contacts", _scope(included=("Cofiroute",)))
    assert "perimetre_groupe" in intent.secondary_entities
    assert "Vinci" not in commercial_intent_for_log(intent).__repr__()


def test_3215_a_rephrase_turn_requires_tool_proof_so_the_no_tool_precision_appears():
    """Recette prod 04/10 : « Reformule ta dernière réponse en deux phrases » (compte SG) ne portait
    pas la précision « aucun résultat d'outil » — aucune décision commerciale, donc aucune exigence."""
    message = "Reformule ta dernière réponse en deux phrases"
    intent = build_commercial_intent(message=message, route=route_chat_intent(message=message))
    assert intent.evidence_requirement == "preuve_d_outil"
    reply = "Société Générale est une fiche active ; je peux l'ouvrir."
    verdict = verify_response(reply, tool_outputs=[], evidence_requirement=intent.evidence_requirement)
    assert EVIDENCE_REQUIRED_MISSING in verdict.repair_reasons
    assert repair_addendum(verdict.repair_reasons, "fr").count("aucun résultat d'outil") == 1
    # Un outil a répondu ce tour : jamais la précision.
    assert repair_addendum(verdict.repair_reasons, "fr", tools_answered=True) == ""


def test_3215_a_plain_question_without_markers_keeps_no_evidence_requirement():
    message = "Bonjour, ça va ?"
    assert build_commercial_intent(message=message, route=route_chat_intent(message=message)).evidence_requirement == "aucune"
