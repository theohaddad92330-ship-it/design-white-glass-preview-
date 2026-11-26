"""#3760 (BEL-LAU-1003) — le classifieur de mise en page : requête → famille de rendu.

Les quatre critères de l'issue, rejoués comme des tours (entrée → décision →
consigne injectée). Aucune probabilité : une décision est `clear`, `ambiguous`
ou `conversational`, jamais un pourcentage."""

from app.services.reply_layout_classifier import (
    LayoutFamily,
    classify_reply_layout,
    reply_layout_directive,
)

SCREEN_ACCOUNTS = "ÉCRAN OUVERT (...)\n- Écran : Comptes\n- À quoi sert cet écran : lister les comptes"
SCREEN_ACCOUNT_SHEET = "ÉCRAN OUVERT (...)\n- Écran : Fiche compte\n- Objet ouvert : Thales"
SCREEN_AGENDA = "ÉCRAN OUVERT (...)\n- Écran : Agenda\n- Objet ouvert : RDV Thales demain 10h"


def test_cartography_request_opens_account_map():
    d = classify_reply_layout("donne-moi une cartographie complète des comptes à adresser à Montpellier")
    assert d.family == LayoutFamily.ACCOUNT_MAP
    assert d.clarity == "clear"


def test_typo_ridden_real_message_still_maps():
    # le message réel de l'issue : fautes de frappe incluses
    d = classify_reply_layout(
        "oublie ce que tu sais de moi je dois ouvrir mon périmètre à montpelier et périphérie donne moi uen cartgographie complète"
    )
    assert d.family == LayoutFamily.ACCOUNT_MAP


def test_contacts_request_never_uses_account_analysis():
    d = classify_reply_layout("qui dois-je contacter chez Thales", page_context=SCREEN_ACCOUNT_SHEET)
    assert d.family == LayoutFamily.CONTACTS_LIST
    assert d.family != LayoutFamily.ACCOUNT_ANALYSIS


def test_summary_before_meeting_is_meeting_brief():
    d = classify_reply_layout("résume-moi ce compte avant mon RDV")
    assert d.family == LayoutFamily.MEETING_BRIEF


def test_weekly_plan_is_action_plan():
    d = classify_reply_layout("prépare mon plan d'action pour la semaine")
    assert d.family == LayoutFamily.ACTION_PLAN


def test_comparison_and_writing_and_selection():
    assert classify_reply_layout("compare Thales et Airbus").family == LayoutFamily.COMPARISON
    assert classify_reply_layout("rédige un mail d'approche pour le DSI").family == LayoutFamily.WRITING_HELP
    assert (
        classify_reply_layout("quels sont les 10 comptes à attaquer en priorité").family
        == LayoutFamily.PRIORITIZED_SELECTION
    )


def test_page_context_decides_a_deictic_request():
    # « résume-moi ça » : sans écran, ambigu ; sur une fiche compte, analyse ; sur l'agenda, brief de RDV
    assert classify_reply_layout("résume-moi ça").clarity == "ambiguous"
    assert (
        classify_reply_layout("résume-moi ça", page_context=SCREEN_ACCOUNT_SHEET).family
        == LayoutFamily.ACCOUNT_ANALYSIS
    )
    assert classify_reply_layout("résume-moi ça", page_context=SCREEN_AGENDA).family == LayoutFamily.MEETING_BRIEF


def test_active_account_counts_as_open_object():
    d = classify_reply_layout("fais-moi le point", active_account="Thales")
    assert d.family == LayoutFamily.ACCOUNT_ANALYSIS
    assert "objet_ouvert" in d.signals


def test_history_carries_a_followup():
    history = [
        {"role": "user", "content": "donne-moi une cartographie des comptes à Lyon"},
        {"role": "assistant", "content": "..."},
    ]
    d = classify_reply_layout("et pour Grenoble ?", history=history)
    assert d.family == LayoutFamily.ACCOUNT_MAP
    assert "historique" in d.signals


def test_ambiguity_is_not_a_rigid_layout():
    d = classify_reply_layout("Thales")
    assert d.clarity == "ambiguous"
    assert d.family == LayoutFamily.GENERIC_RICH_ANSWER


def test_conflicting_signals_are_ambiguous():
    d = classify_reply_layout("compare les contacts et fais un plan d'action")
    assert d.clarity == "ambiguous"
    assert d.family == LayoutFamily.GENERIC_RICH_ANSWER


def test_chitchat_is_conversational_text():
    for m in ("bonjour", "merci beaucoup !", "ok"):
        d = classify_reply_layout(m)
        assert d.clarity == "conversational"
        assert d.family == LayoutFamily.CONVERSATIONAL


def test_directive_names_card_and_never_a_probability():
    clear = reply_layout_directive(classify_reply_layout("donne-moi une cartographie des comptes à Lyon"))
    assert "account_ranking" in clear and "not_evaluated" in clear
    contacts = reply_layout_directive(classify_reply_layout("qui dois-je contacter chez Thales"))
    assert "contact_list" in contacts and "account_card" not in contacts
    assert "%" not in clear and "probab" not in clear.lower().replace("aucune probabilité", "")
    assert reply_layout_directive(classify_reply_layout("bonjour")) == ""
    amb = reply_layout_directive(classify_reply_layout("Thales"))
    assert "une seule question" in amb.lower()


def test_empty_message_gives_no_directive():
    assert reply_layout_directive(classify_reply_layout("")) == ""


def test_turn_replay_directive_reaches_the_system_prompt():
    """Entrée → classement → consigne → prompt : la cartographie arrive au modèle,
    et un tour sans signal laisse le prompt identique au byte près."""
    from app.prompts.bellum_advisor import build_system_prompt
    from tests.test_prompts_new import SAMPLE_PROFILE  # noqa: PLC0415

    base = build_system_prompt(SAMPLE_PROFILE, {}, "", "")
    mapped = build_system_prompt(
        SAMPLE_PROFILE,
        {},
        "",
        "",
        reply_layout=reply_layout_directive(classify_reply_layout("donne-moi une cartographie des comptes à Lyon")),
    )
    assert "account_ranking" in mapped and "CARTOGRAPHIE" in mapped and mapped != base
    assert (
        build_system_prompt(
            SAMPLE_PROFILE, {}, "", "", reply_layout=reply_layout_directive(classify_reply_layout("merci"))
        )
        == base
    )
