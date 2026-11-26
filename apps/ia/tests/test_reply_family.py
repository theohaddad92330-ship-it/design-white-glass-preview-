"""#3758 (BEL-LAU-1001) — le routeur de rendu : une demande d'une famille connue
sort en carte, jamais en pavé de texte. Rejoue le tour : demande → famille →
consigne → réponse → verdict."""

import pytest

from app.models.reply_blocks import REPLY_BLOCK_TYPES
from app.services.reply_family import (
    REPLY_FAMILIES,
    REPLY_FAMILY_KEYS,
    classify_reply_family,
    reply_family_directive,
    reply_family_outcome,
)

# La demande du retour bêta du 06/10, mot pour mot (fautes de frappe comprises).
BETA_REQUEST = "oublie ce que tu sais de moi je dois ouvrir mon périmètre à montpelier et périphérie donne moi uen cartgographie complète"

MAP_CARD = (
    "Voici ce que l'espace connaît.\n```bellum-block\n"
    '{"type":"account_map","coverage":"Comptes enregistrés sur le département 34.",'
    '"groups":[{"label":"Montpellier","items":[{"name":"Alpha Industrie"}]}],'
    '"not_covered":["Les comptes non enregistrés."]}\n```'
)


def test_the_ten_families_of_the_ticket_are_declared() -> None:
    assert REPLY_FAMILY_KEYS == (
        "account_map",
        "account_analysis",
        "contacts_list",
        "action_plan",
        "meeting_brief",
        "post_meeting_summary",
        "market_memory_summary",
        "sequence_audience",
        "opportunity_review",
        "generic_rich_answer",
        # #3767 / #3771 (lot L1 07/10) — après les dix du ticket, l'ordre de départage tient.
        "account_priorities",
        "account_ranking",
        # #2985 (lot R22 07/10) — après #3767/#3771, même raison : l'ordre de départage tient.
        "account_manager_overview",
        # #4287.4 (29/10) — « prochaine action et ce qui manque », en dernier : l'ordre de départage tient.
        "account_next_step",
    )


def test_every_card_a_family_accepts_is_a_real_card_type() -> None:
    for family in REPLY_FAMILIES:
        assert set(family.cards) <= set(REPLY_BLOCK_TYPES), family.key


def test_the_beta_request_is_an_account_map_even_with_typos_around_it() -> None:
    assert classify_reply_family("donne moi une cartographie de Montpellier") == "account_map"
    assert classify_reply_family("Cartographie des comptes du 34") == "account_map"
    assert classify_reply_family("give me the account map of Lyon") == "account_map"


def test_3769_opening_a_perimeter_is_an_account_map_even_without_the_word_cartographie() -> None:
    """Recette prod nuit 08→09/10 (#3769) — « Ouvre mon périmètre à Montpellier et périphérie »
    rendait du texte brut (+ une action « Ouvrir Découvrir » inventée par le modèle), jamais la
    carte `account_map` : AUCUN marqueur de la famille ne couvrait cette phrase, pourtant
    `reply_formats.py` la cite mot pour mot comme exemple canonique (#3762, « CARTOGRAPHIE DE
    COMPTES » : « ouvre mon périmètre à Montpellier et périphérie »)."""
    assert classify_reply_family("Ouvre mon périmètre à Montpellier et périphérie") == "account_map"
    assert classify_reply_family("ouvre ton périmètre à Lyon") == "account_map"
    assert classify_reply_family("Ouvrir un périmètre sur le secteur bancaire") == "account_map"
    assert classify_reply_family("open my territory around Lyon") == "account_map"


@pytest.mark.parametrize(
    ("message", "family"),
    [
        ("Fais-moi un plan d'action sur Alpha", "action_plan"),
        ("Prépare mon rendez-vous de jeudi", "meeting_brief"),
        ("Donne-moi la liste des contacts chez Beta", "contacts_list"),
        ("Fais l'analyse du compte Gamma", "account_analysis"),
        ("revue des opportunités de la semaine", "opportunity_review"),
        ("résume ma mémoire de marché", "market_memory_summary"),
        # #3767 / #3771 (lot L1 07/10) — les demandes réelles de la recette prod du 07/10.
        ("Priorise mes comptes de la semaine", "account_priorities"),
        ("Par où je commence dans mon portefeuille ?", "account_priorities"),
        ("Classe-moi huit comptes", "account_ranking"),
    ],
)
def test_one_request_one_family(message: str, family: str) -> None:
    assert classify_reply_family(message) == family
    # « Une même requête produit une même famille de rendu » : la lecture est pure.
    assert classify_reply_family(message) == classify_reply_family(message)


@pytest.mark.parametrize("message", ["Bonjour", "Merci !", "Combien de salariés chez Alpha ?", ""])
def test_an_unknown_or_conversational_request_is_not_routed(message: str) -> None:
    assert classify_reply_family(message) is None


def test_the_beta_request_with_its_typo_is_routed() -> None:
    # « cartgographie » : la demande réelle du retour. Les marqueurs portent les
    # fautes de frappe courantes du mot, sinon la demande exacte qui a motivé le
    # ticket serait restée du texte libre.
    assert classify_reply_family(BETA_REQUEST) == "account_map"


def test_the_directive_names_the_card_and_forbids_a_false_complete() -> None:
    directive = reply_family_directive("account_map")
    assert "`account_map`" in directive
    assert "jamais un faux complet" in directive
    # Aucune probabilité ni fournisseur dans une consigne.
    assert "probabilit" not in directive.lower()


def test_no_family_or_no_card_means_no_directive() -> None:
    assert reply_family_directive(None) == ""
    assert reply_family_directive("generic_rich_answer") == ""


def test_post_meeting_summary_is_routed_since_its_source_exists() -> None:
    """#3758 (reste du lot J14) — la source existe désormais
    (`notes.meeting_recap_snapshot`) : la famille est ROUTÉE comme les autres,
    ce n'est plus une famille déclarée sans carte. Sa consigne est DIFFÉRENTE
    des autres familles : elle interdit au modèle d'écrire la carte lui-même
    (`known_shape_gate.py` l'attache depuis le compte rendu enregistré)."""
    assert classify_reply_family("compte rendu du rendez-vous de jeudi") == "post_meeting_summary"
    directive = reply_family_directive("post_meeting_summary")
    assert "`post_meeting_summary`" in directive
    assert "N'écris PAS toi-même" in directive


def test_the_turn_replayed_request_to_card() -> None:
    family = classify_reply_family("donne moi une cartographie complète de Montpellier")
    assert family == "account_map"
    assert reply_family_directive(family)
    assert reply_family_outcome(family, MAP_CARD) == "structured"


def test_a_known_family_rendered_as_plain_text_is_a_text_fallback() -> None:
    wall = "La cartographie est partielle : elle couvre les comptes enregistrés.\n- Alpha\n- Beta"
    assert reply_family_outcome("account_map", wall) == "text_fallback"
    # Une carte d'une AUTRE forme ne satisfait pas la famille.
    other = '```bellum-block\n{"type":"verdict","conclusion":"Oui.","reasons":["A."]}\n```'
    assert reply_family_outcome("account_map", other) == "text_fallback"
    # Une carte refusée par le contrat redevient du texte : pas de carte, donc repli.
    refused = '```bellum-block\n{"type":"account_map","groups":[]}\n```'
    assert reply_family_outcome("account_map", refused) == "text_fallback"


def test_a_turn_that_launched_an_analysis_never_reads_as_text_fallback() -> None:
    # #4397 — « lance l'analyse » : la carte d'analyse arrive plus tard sur la fiche, le tour n'a pas échoué.
    family = classify_reply_family("lance l'analyse du compte Alpha")
    reply = "J'ai lancé l'analyse d'Alpha."
    launched = [{"tool": "start_account_analysis", "status": "ok"}]
    assert reply_family_outcome(family, reply, launched) is None
    # Sans action de lancement, le même message reste un repli en texte.
    assert reply_family_outcome(family, reply, []) == "text_fallback"
    assert reply_family_outcome(family, reply) == "text_fallback"


def test_no_family_no_verdict() -> None:
    assert reply_family_outcome(None, "Bonjour !") is None
    assert reply_family_outcome("generic_rich_answer", "Bonjour !") is None


def test_the_retry_prompts_route_back_to_their_family() -> None:
    """Le bouton « Refaire en carte » envoie une phrase par famille (i18n web) :
    chacune doit retomber sur SA famille, sinon le tour relancé n'aurait pas la
    consigne de carte — un bouton qui promet une carte et rend le même texte."""
    import json
    from pathlib import Path

    root = Path(__file__).resolve().parents[3] / "apps/web/src/i18n/locales"
    checked = 0
    for lang in ("fr", "en"):
        prompts = json.loads((root / lang / "chat.json").read_text(encoding="utf-8"))["replyFamily"]["prompt"]
        for family, prompt in prompts.items():
            assert classify_reply_family(prompt) == family, (lang, family)
            checked += 1
    # La garde lit quelque chose : treize familles servies (huit + #3767/#3771 + #3758 post_meeting_summary + #2985
    # + #4287.4), deux langues.
    assert checked == 26
    served = {f.key for f in REPLY_FAMILIES if f.cards}
    assert set(prompts) == served


def test_the_directive_rides_beside_the_request_and_is_a_noop_without_family() -> None:
    from app.prompts.bellum_advisor import build_user_prompt

    history = [{"role": "user", "content": "Bonjour"}]
    family = classify_reply_family("une cartographie de Montpellier")
    with_family = build_user_prompt("une cartographie de Montpellier", history, reply_family_directive=reply_family_directive(family))
    assert with_family.endswith(reply_family_directive("account_map"))
    # Sans famille : l'ancien prompt, au byte près — avec ou sans historique.
    assert build_user_prompt("Bonjour", history) == build_user_prompt("Bonjour", history, reply_family_directive="")
    assert build_user_prompt("Bonjour", []) == "Bonjour"
    directive = reply_family_directive("account_map")
    assert build_user_prompt("une cartographie", [], reply_family_directive=directive).endswith(directive)
