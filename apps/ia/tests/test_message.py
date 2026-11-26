from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

_CONTACT = {
    "first_name": "Olivier",
    "last_name": "Martin",
    "title": "CTO",
    "decision_role": "Référent technique",
    "entity": "CIB",
    "account_id": "acc-1",
}
_ACCOUNT = {
    "company_name": "BNP Paribas",
    "raw_analysis": {"recent_signals": [{"title": "Cession Uptevia"}]},
}


def _patches(claude_return=None, claude_side_effect=None):
    claude_kwargs = {}
    if claude_side_effect is not None:
        claude_kwargs["side_effect"] = claude_side_effect
    else:
        claude_kwargs["return_value"] = (claude_return, None)
    return (
        patch("app.routers.message.get_supabase", return_value=MagicMock()),
        patch("app.routers.message.fetch_owned_contact", new_callable=AsyncMock, return_value=_CONTACT),
        patch("app.routers.message.fetch_owned_account", new_callable=AsyncMock, return_value=_ACCOUNT),
        patch("app.routers.message.call_claude", new_callable=AsyncMock, **claude_kwargs),
    )


def test_message_generate_email_returns_subject_and_body(client: TestClient) -> None:
    p1, p2, p3, p4 = _patches(claude_return={"subject": "Cession Uptevia", "body": "J'espère que vous allez bien…"})
    with p1, p2, p3, p4:
        res = client.post(
            "/message/generate",
            json={
                "contact_id": "c1",
                "user_id": "u1",
                "channel": "email",
                "context": "audit SRE",
                "profile_data": {"companyName": "Acme", "offers": ["SRE"]},
            },
        )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["channel"] == "email"
    assert data["subject"] == "Cession Uptevia"
    assert "J'espère" in data["body"]


def test_message_generate_linkedin_drops_subject(client: TestClient) -> None:
    # The model may emit a subject; for a non-email channel the endpoint drops it.
    p1, p2, p3, p4 = _patches(claude_return={"subject": "ignored", "body": "Message LinkedIn prêt."})
    with p1, p2, p3, p4:
        res = client.post(
            "/message/generate",
            json={
                "contact_id": "c1",
                "user_id": "u1",
                "channel": "linkedin",
                "profile_data": {"companyName": "Acme"},
            },
        )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["channel"] == "linkedin"
    assert data["subject"] == ""
    assert data["body"] == "Message LinkedIn prêt."


def test_2123_72_task_channel_returns_a_task_title_and_body(client: TestClient) -> None:
    """#2123.72 — quatrième canal : « tâche de prise de contact ». Le modèle rédige
    une TÂCHE (intitulé + consigne), pas un message : l'intitulé est gardé comme
    `subject` (il deviendra le libellé de l'action), et le prompt le dit."""
    p1, p2, p3, p4 = _patches(
        claude_return={
            "subject": "Appeler Olivier Martin avant jeudi",
            "body": "Appeler le CTO pour qualifier Uptevia.",
        }
    )
    with p1, p2, p3, p4 as claude:
        res = client.post(
            "/message/generate",
            json={"contact_id": "c1", "user_id": "u1", "channel": "task", "profile_data": {"companyName": "Acme"}},
        )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["channel"] == "task"
    assert data["subject"] == "Appeler Olivier Martin avant jeudi"
    system_prompt = claude.call_args.args[0]
    assert "CANAL = tâche de prise de contact" in system_prompt
    assert "ne s'envoie pas" in system_prompt


def test_2123_72_task_channel_rules_do_not_leak_into_the_other_channels() -> None:
    from app.prompts.bellum_outreach import build_system_prompt

    for channel in ("email", "linkedin", "phone"):
        assert "tâche de prise de contact" not in build_system_prompt({"companyName": "Acme"}, channel)


@pytest.mark.parametrize("channel", ["voicemail", "sms", "whatsapp"])
def test_theo_b_c5_a24_retired_channels_are_refused_not_generated(client: TestClient, channel: str) -> None:
    """Théo B C5.A24 / C7.A3 — message vocal, SMS et WhatsApp ne génèrent plus de brouillon :
    422 de validation (le `Channel` ne les connaît plus), jamais un repli sur la règle de l'e-mail."""
    res = client.post(
        "/message/generate",
        json={"contact_id": "c1", "user_id": "u1", "channel": channel, "profile_data": {"companyName": "Acme"}},
    )
    assert res.status_code == 422


def test_2947_2204_40_recommendation_channel_returns_an_endorsement_body(client: TestClient) -> None:
    """#2947/#2204.40 — sixième canal : le message de RECOMMANDATION, un texte
    d'appui (contrat `OUTREACH_MESSAGE_CHANNELS`), distinct de l'intent
    `get_referral` (l'OBJECTIF « être recommandé »). Aucun `subject` : même
    forme que `voicemail`, un texte prêt, pas un envoi typé."""
    p1, p2, p3, p4 = _patches(
        claude_return={"body": "Olivier a piloté la migration SRE d'Acme avec une rigueur rare…"}
    )
    with p1, p2, p3, p4 as claude:
        res = client.post(
            "/message/generate",
            json={
                "contact_id": "c1",
                "user_id": "u1",
                "channel": "recommendation",
                "profile_data": {"companyName": "Acme"},
            },
        )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["channel"] == "recommendation"
    assert data["subject"] == ""
    assert "migration SRE" in data["body"]
    system_prompt = claude.call_args.args[0]
    assert "CANAL = message de recommandation" in system_prompt
    assert "texte d'appui" in system_prompt


def test_2947_2204_40_recommendation_rules_do_not_leak_into_the_other_channels() -> None:
    from app.prompts.bellum_outreach import build_system_prompt

    for channel in ("email", "linkedin", "phone", "task"):
        assert "message de recommandation" not in build_system_prompt({"companyName": "Acme"}, channel)


def test_message_generate_502_on_claude_error(client: TestClient) -> None:
    p1, p2, p3, p4 = _patches(claude_side_effect=ValueError("fail"))
    with p1, p2, p3, p4:
        res = client.post(
            "/message/generate",
            json={"contact_id": "c1", "user_id": "u1", "channel": "email", "profile_data": {"companyName": "A"}},
        )
    assert res.status_code == 502


def test_message_generate_502_on_empty_body(client: TestClient) -> None:
    p1, p2, p3, p4 = _patches(claude_return={"subject": "x", "body": "   "})
    with p1, p2, p3, p4:
        res = client.post(
            "/message/generate",
            json={"contact_id": "c1", "user_id": "u1", "channel": "phone", "profile_data": {"companyName": "A"}},
        )
    assert res.status_code == 502


def test_message_generate_422_on_a_leaked_hypothesis_announcement(client: TestClient) -> None:
    # #3248.3 (recette prod 29/09) — « Je pars sur Je partirai sur… » ne doit
    # jamais atteindre l'écran du composer : refusé plutôt que rendu tel quel.
    p1, p2, p3, p4 = _patches(
        claude_return={
            "subject": "Votre transformation SI",
            "body": "Je pars sur Je partirai sur le siège parisien. Bonjour, je vous contacte au sujet de votre DSI.",
        }
    )
    with p1, p2, p3, p4:
        res = client.post(
            "/message/generate",
            json={
                "contact_id": "c1",
                "user_id": "u1",
                "channel": "email",
                "context": "DSI La Poste",
                "profile_data": {"companyName": "Acme", "offers": ["SRE"]},
            },
        )
    assert res.status_code == 422


def test_message_generate_422_on_a_truncated_signoff(client: TestClient) -> None:
    # #3248.4 (recette prod 29/09) — « pour L. » tronqué.
    p1, p2, p3, p4 = _patches(
        claude_return={
            "subject": "Votre transformation SI",
            "body": "Bonjour, je vous contacte au sujet de votre DSI. Bien à vous, pour L.",
        }
    )
    with p1, p2, p3, p4:
        res = client.post(
            "/message/generate",
            json={
                "contact_id": "c1",
                "user_id": "u1",
                "channel": "email",
                "context": "DSI La Poste",
                "profile_data": {"companyName": "Acme", "offers": ["SRE"]},
            },
        )
    assert res.status_code == 422


def test_message_generate_rejects_bad_channel(client: TestClient) -> None:
    res = client.post(
        "/message/generate",
        json={"contact_id": "c1", "user_id": "u1", "channel": "pigeon", "profile_data": {"companyName": "A"}},
    )
    assert res.status_code == 422


# ── Relation au compte (annexe méthodo p6) ───────────────────────────────────
# Le composer est la surface la plus cliquée du produit. Le SalesContext est
# persisté sur le compte (`raw_analysis.salesContext`) : le brouillon proposé sur
# un client actif ne doit pas être celui d'une prise de contact à froid.


def _compte_avec_relation(state: str) -> dict:
    return {
        "company_name": "BNP Paribas",
        "raw_analysis": {
            "recent_signals": [{"title": "Cession Uptevia"}],
            "salesContext": {"relationship": {"state": state, "derivation": "inferred", "confidence": 70}},
        },
    }


def _prompt_capture(account: dict) -> str:
    """Le user prompt réellement envoyé à ``bellum_outreach`` pour ce compte."""
    calls: list[str] = []

    async def _spy(system, user, **_kw):
        calls.append(user)
        return {"body": "brouillon"}, None

    with (
        patch("app.routers.message.get_supabase", return_value=MagicMock()),
        patch("app.routers.message.fetch_owned_contact", new_callable=AsyncMock, return_value=_CONTACT),
        patch("app.routers.message.fetch_owned_account", new_callable=AsyncMock, return_value=account),
        patch("app.routers.message.call_claude", new=_spy),
    ):
        from fastapi.testclient import TestClient as _TC

        from app.main import app

        res = _TC(app).post(
            "/message/generate",
            json={
                "contact_id": "c1",
                "user_id": "u1",
                "channel": "email",
                "profile_data": {"companyName": "Acme", "offers": ["SRE"]},
            },
        )
    assert res.status_code == 200, res.text
    return calls[0]


def test_composer_prompt_reads_the_account_relationship() -> None:
    prompt = _prompt_capture(_compte_avec_relation("client_actif"))

    assert "RELATION AU COMPTE" in prompt
    assert "foisonnement" in prompt.lower()


# ── #1926 — cadrage avant rédaction, et une sortie qui dit pourquoi ──────────
# ⚠️ pydantic avale les clés inconnues : chaque champ neuf est prouvé ici de
# bout en bout — de la réponse du modèle jusqu'au JSON que `/message/generate`
# rend à l'API (qui le relaie tel quel : `ia-proxy.controller.ts` rend
# l'enveloppe `IaEnvelope` sans la filtrer).


def _generate(
    client: TestClient, model_output: dict, *, context: str | None = None, channel: str = "email"
) -> tuple[dict, list[str]]:
    """La réponse rendue par `/message/generate` et les user prompts envoyés au modèle."""
    p1, p2, p3, p4 = _patches(claude_return=model_output)
    body = {"contact_id": "c1", "user_id": "u1", "channel": channel, "profile_data": {"companyName": "Acme"}}
    if context is not None:
        body["context"] = context
    with p1, p2, p3, p4 as claude:
        res = client.post("/message/generate", json=body)
    assert res.status_code == 200, res.text
    return res.json()["data"], [call.args[1] for call in claude.call_args_list]


def test_every_new_output_field_reaches_the_api_response(client: TestClient) -> None:
    data, prompts = _generate(
        client,
        {
            "subject": "Cession Uptevia et CIB",
            "body": "Bonjour Olivier, la cession Uptevia redessine le périmètre de la CIB. Qui arbitre ce chantier ?",
            "rationale": "La cession touche directement le périmètre CIB d'Olivier Martin.",
            "alternativeAngle": "Partir de l'audit SRE demandé par l'équipe.",
        },
    )
    # #1926.28 / .29 — venus du modèle.
    assert data["rationale"] == "La cession touche directement le périmètre CIB d'Olivier Martin."
    assert data["alternativeAngle"] == "Partir de l'audit SRE demandé par l'équipe."
    # #1926.2-.5 / .8 — le cadrage, dérivé AVANT l'appel.
    assert data["brief"]["objective"] == "ouverture_compte"
    assert data["brief"]["persona"] == "decideur"
    assert data["brief"]["formality"] == "vous"
    assert data["brief"]["cta"] == "question_facile"
    # #1925 — le verdict du validateur ; #1926.30 — ses éléments SONT les
    # données utilisées, calculées (pas déclarées par le modèle).
    assert data["specificity"]["status"] == "specifique"
    assert data["specificity"]["minimum"] == 2
    assert data["specificity"]["elements"] == [
        {"kind": "precise_entity", "value": "CIB"},
        {"kind": "precise_contact", "value": "Olivier Martin"},
    ]
    # #1926.31 — changer le ton.
    assert [o["id"] for o in data["toneOptions"]] == ["tutoiement", "plus_court", "plus_direct"]
    # Le cadrage est bien arrivé au modèle — une seule fois, un seul appel.
    assert len(prompts) == 1
    assert "CADRAGE DU MESSAGE" in prompts[0]


def test_a_generic_draft_is_flagged_and_returned_without_a_second_call(client: TestClient) -> None:
    # Défaut retenu : ni régénération silencieuse (elle doublerait le coût du
    # modèle sans le dire), ni rejet — le brouillon part avec son verdict.
    body = "Bonjour, avez-vous un moment pour parler de vos projets ?"
    data, prompts = _generate(client, {"subject": "Échange", "body": body})
    assert data["specificity"]["status"] == "generique"
    assert data["body"] == body
    assert data["rationale"] is None
    assert data["alternativeAngle"] is None
    assert len(prompts) == 1


def test_a_literal_null_from_the_model_is_not_shown_as_an_angle(client: TestClient) -> None:
    data, _prompts = _generate(client, {"body": "Bonjour Olivier.", "alternativeAngle": "null", "rationale": "  "})
    assert data["alternativeAngle"] is None
    assert data["rationale"] is None


def test_the_angle_sets_the_objective_and_the_formality_of_the_draft(client: TestClient) -> None:
    from app.services.message_brief import MESSAGE_OBJECTIVES

    data, prompts = _generate(client, {"body": "Salut Olivier."}, context="relance, en le tutoyant", channel="linkedin")
    assert data["brief"]["objective"] == "relance"
    assert data["brief"]["objectiveSource"] == "angle"
    assert data["brief"]["formality"] == "tu"
    assert [o["id"] for o in data["toneOptions"]][0] == "vouvoiement"
    assert MESSAGE_OBJECTIVES["relance"]["rules"] in prompts[0]
    assert "tutoiement" in prompts[0]


def test_the_router_reads_the_hierarchy_level_column() -> None:
    # Le persona se calcule depuis `hierarchy_level` quand la phase 3 l'a posé :
    # sans la colonne, le cadrage retomberait sur le seul titre.
    from pathlib import Path

    source = (Path(__file__).resolve().parents[1] / "app" / "routers" / "message.py").read_text(encoding="utf-8")
    assert "hierarchy_level" in source


# ── #2861 (#2437.11) — la langue DÉCLARÉE du destinataire (`contacts.locale`,
# #2437.2) atteint enfin la génération : le seul chaînon que l'épopée nommait
# manquant (`message.py` ne consultait aucune langue avant de composer).


def test_the_router_reads_the_locale_column() -> None:
    from pathlib import Path

    source = (Path(__file__).resolve().parents[1] / "app" / "routers" / "message.py").read_text(encoding="utf-8")
    assert "locale" in source


def _prompt_capture_for_contact(contact: dict) -> str:
    calls: list[str] = []

    async def _spy(system, user, **_kw):
        calls.append(user)
        return {"body": "brouillon"}, None

    with (
        patch("app.routers.message.get_supabase", return_value=MagicMock()),
        patch("app.routers.message.fetch_owned_contact", new_callable=AsyncMock, return_value=contact),
        patch("app.routers.message.fetch_owned_account", new_callable=AsyncMock, return_value=_ACCOUNT),
        patch("app.routers.message.call_claude", new=_spy),
    ):
        from fastapi.testclient import TestClient as _TC

        from app.main import app

        res = _TC(app).post(
            "/message/generate",
            json={
                "contact_id": "c1",
                "user_id": "u1",
                "channel": "email",
                "profile_data": {"companyName": "Acme", "offers": ["SRE"]},
            },
        )
    assert res.status_code == 200, res.text
    return calls[0]


def test_a_contact_with_no_locale_leaves_the_prompt_byte_identical() -> None:
    # `_CONTACT` n'a pas de clé `locale` — même comportement qu'avant ce lot.
    assert "LANGUE DU MESSAGE" not in _prompt_capture_for_contact(_CONTACT)


def test_a_contact_declared_in_english_gets_the_language_directive() -> None:
    prompt = _prompt_capture_for_contact({**_CONTACT, "locale": "en"})
    assert "LANGUE DU MESSAGE : rédige ENTIÈREMENT en anglais" in prompt


def test_a_contact_declared_in_french_gets_no_directive() -> None:
    # `fr` est déjà le comportement d'avant — pas de consigne redondante.
    assert "LANGUE DU MESSAGE" not in _prompt_capture_for_contact({**_CONTACT, "locale": "fr"})


def test_composer_prompt_adds_no_block_on_a_cold_account() -> None:
    """Compte froid : aucun bloc relation n'est ajouté — le prompt reste celui
    d'une ouverture à froid. (La byte-identité stricte du builder est
    verrouillée dans ``test_dod_golden_sets``.)

    CHANGEMENT VOULU (#2371.4) : un dossier antérieur au SalesContext n'est plus
    confondu avec un compte froid — sa relation est NOMMÉE non mesurée."""
    assert "RELATION AU COMPTE" not in _prompt_capture(_compte_avec_relation("froid"))
    assert "RELATION AU COMPTE — NON MESURÉE" in _prompt_capture(_ACCOUNT)


# ── #2947/#2204.10 — la voie d'accès probable (Q6 du dossier), transmise ────
# EN ENTRÉE NOMMÉE au composer, comme la relation au compte juste au-dessus.
# `evaluation.dossier_read.access_path` était calculée à l'analyse sans jamais
# être lue ici (#2947, commentaire du 26/09) : le composer ne passait
# `raw_analysis` au générateur qu'en texte brut tronqué à 3000 caractères.


def _compte_avec_voie_dacces(access_path: str | None) -> dict:
    return {
        "company_name": "BNP Paribas",
        "raw_analysis": {
            "recent_signals": [{"title": "Cession Uptevia"}],
            "evaluation": {"dossier_read": {"access_path": access_path}} if access_path is not None else {},
        },
    }


def test_composer_prompt_reads_the_dossier_access_path() -> None:
    prompt = _prompt_capture(_compte_avec_voie_dacces("Passer par le DSI plutôt que les achats groupe."))

    assert "VOIE D'ACCÈS PROBABLE" in prompt
    assert "Passer par le DSI plutôt que les achats groupe." in prompt


def test_composer_prompt_adds_no_access_path_block_when_the_dossier_has_none() -> None:
    # Sait dire NON : un dossier sans lecture structurée (analyse d'avant ce
    # lot, ou Q6 non répondue) ne fait apparaître aucun bloc inventé.
    assert "VOIE D'ACCÈS PROBABLE" not in _prompt_capture(_compte_avec_voie_dacces(None))
    assert "VOIE D'ACCÈS PROBABLE" not in _prompt_capture(_ACCOUNT)


# ── #2123.59 / .61-.63 / .65-.68 — les paramètres CHOISIS dans le formulaire ──
# Objectif, relation, persona et appel à l'action DÉRIVÉS jusqu'ici ; le
# commercial les choisit désormais, et un choix humain gagne sur la dérivation
# (« une correction humaine gagne toujours »). Signal, offre et preuve partent
# comme DONNÉES du commercial. Sans paramètre, rien ne change à l'octet près.


def _generate_with_parameters(
    client: TestClient, parameters: dict | None, *, account: dict | None = None
) -> tuple[TestClient, dict, list[str]]:
    calls: list[str] = []

    async def _spy(system, user, **_kw):
        calls.append(user)
        return {"body": "Bonjour Olivier."}, None

    body: dict = {"contact_id": "c1", "user_id": "u1", "channel": "email", "profile_data": {"companyName": "Acme"}}
    if parameters is not None:
        body["parameters"] = parameters
    with (
        patch("app.routers.message.get_supabase", return_value=MagicMock()),
        patch("app.routers.message.fetch_owned_contact", new_callable=AsyncMock, return_value=_CONTACT),
        patch("app.routers.message.fetch_owned_account", new_callable=AsyncMock, return_value=account or _ACCOUNT),
        patch("app.routers.message.call_claude", new=_spy),
    ):
        res = client.post("/message/generate", json=body)
    return res, (res.json().get("data") or {}) if res.status_code == 200 else {}, calls


def test_2123_form_parameters_win_over_the_derived_brief(client: TestClient) -> None:
    res, data, prompts = _generate_with_parameters(
        client,
        {"objective": "relance", "relationship": "dormant", "persona": "decideur", "cta": "echange_court"},
        account=_compte_avec_relation("froid"),
    )
    assert res.status_code == 200, res.text
    brief = data["brief"]
    assert (brief["objective"], brief["objectiveSource"]) == ("relance", "formulaire")
    assert (brief["relationship"], brief["relationshipSource"]) == ("dormant", "formulaire")
    assert (brief["persona"], brief["personaSource"]) == ("decideur", "formulaire")
    assert (brief["cta"], brief["ctaSource"]) == ("echange_court", "formulaire")
    # La relation choisie pilote aussi le bloc RELATION AU COMPTE (compte lu « froid »).
    assert "RELATION AU COMPTE" in prompts[0]
    assert "persona decideur (choisi par le commercial)" in prompts[0]


def test_2123_signal_offer_and_proof_reach_the_prompt_as_seller_data(client: TestClient) -> None:
    res, _data, prompts = _generate_with_parameters(
        client,
        {
            "signal": "  Ouverture d'un pôle data à Lyon  ",
            "offer": "Régie data engineering",
            "proof": "Migration du SI risque chez un assureur, 2025",
        },
    )
    assert res.status_code == 200, res.text
    assert "PARAMÈTRES CHOISIS PAR LE COMMERCIAL" in prompts[0]
    assert "- Signal : Ouverture d'un pôle data à Lyon" in prompts[0]
    assert "- Offre : Régie data engineering" in prompts[0]
    assert "- Preuve : Migration du SI risque chez un assureur, 2025" in prompts[0]


def test_2204_scope_and_constraints_reach_the_prompt_each_in_its_own_place(client: TestClient) -> None:
    """#2204.7 / #2204.15 (épopée #2947) — le PÉRIMÈTRE visé est une donnée (il
    rejoint le bloc des données du commercial) ; les CONTRAINTES sont des
    consignes de forme qu'il pose lui-même, rendues dans un bloc à part qui ne
    remplace jamais une règle d'or."""
    res, _data, prompts = _generate_with_parameters(
        client,
        {
            "scope": "  DSI groupe uniquement, pas les filiales  ",
            "constraints": "80 mots au plus ; ne cite aucun prix",
        },
    )
    assert res.status_code == 200, res.text
    assert "- Périmètre visé : DSI groupe uniquement, pas les filiales" in prompts[0]
    assert "CONTRAINTES POSÉES PAR LE COMMERCIAL" in prompts[0]
    assert "80 mots au plus ; ne cite aucun prix" in prompts[0]
    # Les contraintes ne se mélangent pas aux données : jamais sous « données à exploiter ».
    data_block = prompts[0].split("CONTRAINTES POSÉES PAR LE COMMERCIAL")[0].split("PARAMÈTRES CHOISIS")[1]
    assert "80 mots" not in data_block
    # Et elles disent qu'elles ne lèvent aucune règle d'or.
    assert "aucune règle" in prompts[0].split("CONTRAINTES POSÉES PAR LE COMMERCIAL")[1].lower()


def test_3418_problem_reaches_the_prompt_as_seller_data_and_is_bounded(client: TestClient) -> None:
    """#3418.8 — le PROBLÈME à adresser est choisi par le commercial avant la
    génération : une donnée à citer (jamais une consigne), bornée, vide = absente."""
    res, _data, prompts = _generate_with_parameters(client, {"problem": "  Dette technique sur le SI paie  "})
    assert res.status_code == 200, res.text
    assert "- Problème à adresser : Dette technique sur le SI paie" in prompts[0]
    assert "CONTRAINTES POSÉES PAR LE COMMERCIAL" not in prompts[0]
    res, _data, prompts = _generate_with_parameters(client, {"problem": "x" * 301})
    assert res.status_code == 422
    assert prompts == []
    _res, _data, bare = _generate_with_parameters(client, None)
    _res, _data, blank = _generate_with_parameters(client, {"problem": "   "})
    assert blank[0] == bare[0]


def test_3400_4_message_tone_follows_the_persona_never_the_decision_role(client: TestClient) -> None:
    """#3400.4 (rejeu du tour) — le TON du message vient du niveau hiérarchique
    (persona, depuis le poste) ; le rôle de décision sert la stratégie de compte.
    Deux contacts au même poste mais au rôle de décision différent : même
    persona, même ligne de ton, et le rôle n'est jamais rendu dans le prompt."""
    outputs: dict[str, tuple[dict, str]] = {}
    for role in ("economic", "user"):
        contact = {**_CONTACT, "decision_role": role}
        calls: list[str] = []

        async def _spy(system, user, _calls=calls, **_kw):
            _calls.append(user)
            return {"body": "Bonjour."}, None

        body = {"contact_id": "c1", "user_id": "u1", "channel": "email", "profile_data": {"companyName": "Acme"}}
        with (
            patch("app.routers.message.get_supabase", return_value=MagicMock()),
            patch("app.routers.message.fetch_owned_contact", new_callable=AsyncMock, return_value=contact),
            patch("app.routers.message.fetch_owned_account", new_callable=AsyncMock, return_value=_ACCOUNT),
            patch("app.routers.message.call_claude", new=_spy),
        ):
            res = client.post("/message/generate", json=body)
        assert res.status_code == 200, res.text
        outputs[role] = (res.json()["data"]["brief"], calls[0])
    (brief_eco, prompt_eco), (brief_user, prompt_user) = outputs["economic"], outputs["user"]
    assert brief_eco["persona"] == brief_user["persona"]
    assert (brief_eco["decisionRole"], brief_user["decisionRole"]) == ("economic", "user")
    persona_line = [ln for ln in prompt_eco.splitlines() if ln.startswith("- Niveau hiérarchique")]
    other_line = [ln for ln in prompt_user.splitlines() if ln.startswith("- Niveau hiérarchique")]
    assert persona_line and persona_line == other_line
    assert "economic" not in prompt_eco.lower().replace("economique", "")


def test_2204_scope_and_constraints_are_bounded_and_blank_means_absent(client: TestClient) -> None:
    for too_long in ({"scope": "x" * 161}, {"constraints": "x" * 301}):
        res, _data, prompts = _generate_with_parameters(client, too_long)
        assert res.status_code == 422, too_long
        assert prompts == []
    _res, _data, bare = _generate_with_parameters(client, None)
    res, _data, blank = _generate_with_parameters(client, {"scope": "   ", "constraints": ""})
    assert res.status_code == 200
    assert blank[0] == bare[0]


def test_2123_witness_no_parameters_leaves_the_prompt_byte_identical(client: TestClient) -> None:
    _res, bare_data, bare = _generate_with_parameters(client, None)
    for empty in ({}, {"objective": None, "signal": "   ", "offer": ""}):
        res, data, prompts = _generate_with_parameters(client, empty)
        assert res.status_code == 200, res.text
        assert prompts[0] == bare[0]
        assert data["brief"] == bare_data["brief"]
    assert "PARAMÈTRES CHOISIS" not in bare[0]
    assert "personaSource" not in bare_data["brief"]


def test_2123_an_unknown_code_or_an_oversized_text_is_refused(client: TestClient) -> None:
    for bad in (
        {"objective": "closing"},
        {"relationship": "inconnu"},
        {"persona": "stagiaire"},
        {"cta": "rendez_vous_force"},
        {"signal": "x" * 301},
    ):
        res, _data, prompts = _generate_with_parameters(client, bad)
        assert res.status_code == 422, bad
        assert prompts == []


def test_2123_the_web_form_offers_exactly_the_engine_codes() -> None:
    import re
    from pathlib import Path

    from app.knowledge.persona import PERSONAS
    from app.services.message_brief import MESSAGE_CTAS, MESSAGE_OBJECTIVES, RELATIONSHIP_STATES

    source = (
        Path(__file__).resolve().parents[3]
        / "apps/web/src/features/accounts/view/account-detail/components/contact-engagement/message-parameters.ts"
    ).read_text(encoding="utf-8")

    def codes(name: str) -> set[str]:
        match = re.search(rf"export const {name} = \[(.*?)\] as const", source, re.S)
        assert match, name
        return set(re.findall(r"'([a-z_0-9]+)'", match.group(1)))

    assert codes("MESSAGE_OBJECTIVE_CODES") == set(MESSAGE_OBJECTIVES) and MESSAGE_OBJECTIVES
    assert codes("MESSAGE_CTA_CODES") == set(MESSAGE_CTAS) and MESSAGE_CTAS
    assert codes("MESSAGE_RELATIONSHIP_CODES") == set(RELATIONSHIP_STATES) and RELATIONSHIP_STATES
    assert set(PERSONAS) == {"decideur", "gouvernance", "direction", "manager", "acheteur", "expert", "operationnel"}


# ─────────────────── #2368.2 / #2368.12 / #2368.14 — le packet de preuves ───────────────────

_BARE_CONTACT = {"first_name": "Jean", "last_name": "Dupont", "title": "DSI", "account_id": "acc-2"}
_BARE_ACCOUNT = {"company_name": "Acme", "raw_analysis": {}}


def test_generation_is_blocked_on_a_name_title_company_only_packet(client: TestClient) -> None:
    # #2368.2 — aucun signal, aucune entité, aucun angle : le modèle n'est JAMAIS appelé.
    p1, p2, p3, p4 = _patches(claude_return={"body": "peu importe"})
    with (
        p1,
        patch("app.routers.message.fetch_owned_contact", new_callable=AsyncMock, return_value=_BARE_CONTACT),
        patch("app.routers.message.fetch_owned_account", new_callable=AsyncMock, return_value=_BARE_ACCOUNT),
        p4 as claude,
    ):
        res = client.post(
            "/message/generate",
            json={"contact_id": "c2", "user_id": "u1", "channel": "email", "profile_data": {"companyName": "Acme"}},
        )
    assert res.status_code == 422, res.text
    assert "packet de contexte insuffisant" in res.json()["detail"]
    claude.assert_not_called()


def test_generation_proceeds_when_the_seller_types_an_angle(client: TestClient) -> None:
    # Un angle tapé par le commercial EST une raison propre à la personne : ça débloque.
    p1, p2, p3, p4 = _patches(claude_return={"body": "Bonjour Jean."})
    with (
        p1,
        patch("app.routers.message.fetch_owned_contact", new_callable=AsyncMock, return_value=_BARE_CONTACT),
        patch("app.routers.message.fetch_owned_account", new_callable=AsyncMock, return_value=_BARE_ACCOUNT),
        p4 as claude,
    ):
        res = client.post(
            "/message/generate",
            json={
                "contact_id": "c2",
                "user_id": "u1",
                "channel": "email",
                "context": "il vient de prendre la direction du SI",
                "profile_data": {"companyName": "Acme"},
            },
        )
    assert res.status_code == 200, res.text
    claude.assert_called_once()


def test_a_claim_without_a_matching_proof_in_the_packet_is_a_no_go(client: TestClient) -> None:
    # #2368.14 — la preuve déclarée ("levée de 40M€ en 2025") n'existe dans aucun
    # champ du packet envoyé au modèle : bloqué, brouillon jamais rendu.
    data, _ = None, None
    p1, p2, p3, p4 = _patches(
        claude_return={
            "subject": "Échange",
            "body": "Bonjour Olivier, félicitations pour la levée de 40M€ en 2025.",
            "claims": [{"text": "levée de 40M€ en 2025", "proof": "levée de 40M€ en 2025"}],
        }
    )
    with p1, p2, p3, p4:
        res = client.post(
            "/message/generate",
            json={"contact_id": "c1", "user_id": "u1", "channel": "email", "profile_data": {"companyName": "Acme"}},
        )
    assert res.status_code == 422, res.text
    assert "NO-GO" in res.json()["detail"]


def test_a_claim_grounded_in_the_account_analysis_is_accepted(client: TestClient) -> None:
    # La preuve ("Cession Uptevia") est un extrait RÉEL de `raw_analysis`, présent
    # dans le packet (`str(raw_analysis)` tronqué à 3000 caractères côté prompt).
    p1, p2, p3, p4 = _patches(
        claude_return={
            "subject": "Cession Uptevia",
            "body": "Bonjour Olivier, la cession Uptevia redessine le périmètre.",
            "claims": [{"text": "la cession Uptevia", "proof": "Cession Uptevia"}],
        }
    )
    with p1, p2, p3, p4:
        res = client.post(
            "/message/generate",
            json={"contact_id": "c1", "user_id": "u1", "channel": "email", "profile_data": {"companyName": "Acme"}},
        )
    assert res.status_code == 200, res.text
    assert res.json()["data"]["claims"] == [{"text": "la cession Uptevia", "proof": "Cession Uptevia"}]
