"""Couche zéro (Annexe méthodo p7-p9) — historique CRM + prospection inversée.

Le point non négociable : SANS donnée (aucun CRM connecté, aucun ex-collaborateur)
le bloc est vide, donc les prompts restent byte-identiques. Avec donnée, le bloc
cite les faits reçus et n'en invente aucun.
"""

from __future__ import annotations

from app.services.zero_layer import has_crm_history, summarize_reverse_prospects, zero_layer_block


def _prospect(**over):
    base = {
        "fullName": "Claire Dupont",
        "title": "Architecte Data",
        "linkedinUrl": "https://linkedin.com/in/claire",
        "apolloDetails": {
            "organization": "Sopra Steria",
            "employmentHistory": [
                {"title": "Architecte", "organization": "TF1", "current": False},
                {"title": "Architecte Data", "organization": "Sopra Steria", "current": True},
            ],
        },
    }
    base.update(over)
    return base


# ── Défaut : aucune donnée → prompt byte-identique ───────────────────────────
def test_no_data_yields_empty_block():
    assert zero_layer_block() == ""
    assert zero_layer_block("", []) == ""
    assert zero_layer_block("   ", None) == ""
    assert zero_layer_block(None, []) == ""


def test_non_string_crm_presence_is_ignored():
    # Défense en profondeur : un appelant qui envoie n'importe quoi ne casse rien.
    assert zero_layer_block(42, []) == ""  # type: ignore[arg-type]


# ── Section CRM ──────────────────────────────────────────────────────────────
def test_crm_presence_renders_and_forbids_cold_only():
    block = zero_layer_block("CRM HubSpot consulté pour « TF1 » :\n- 3 contact(s) déjà dans votre CRM")
    assert "COUCHE ZÉRO" in block
    assert "3 contact(s) déjà dans votre CRM" in block
    assert "PAS un compte froid" in block
    assert block.startswith("\n\n=====")


def test_crm_presence_is_capped():
    block = zero_layer_block("x" * 5000)
    assert "x" * 2000 in block
    assert "x" * 2001 not in block


# ── Section prospection inversée ─────────────────────────────────────────────
def test_reverse_prospects_render_identity_and_current_employer():
    block = zero_layer_block(None, summarize_reverse_prospects([_prospect()]))
    assert "PROSPECTION INVERSÉE" in block
    assert "Claire Dupont" in block
    assert "Architecte Data" in block
    assert "aujourd'hui chez Sopra Steria" in block
    # La section CRM ne s'invite pas quand il n'y a pas d'historique.
    assert "HISTORIQUE CRM" not in block


def test_reverse_prospects_never_assert_a_relation_nature_apollo_cannot_prove():
    # #219.5/#219.9 (LAU-FINAL-219) — le NO-GO exact : ne jamais affirmer
    # « votre consultant chez X » sur un simple passage détecté.
    block = zero_layer_block(None, summarize_reverse_prospects([_prospect()]))
    assert "unknown_relationship" in block
    assert "votre consultant chez" not in block.lower()
    assert "votre ancien salarié" not in block.lower()


def test_both_sections_are_independent():
    block = zero_layer_block("CRM Salesforce consulté", summarize_reverse_prospects([_prospect()]))
    assert "HISTORIQUE CRM" in block
    assert "PROSPECTION INVERSÉE" in block


# ── Résumé persistable ───────────────────────────────────────────────────────
def test_summarize_keeps_only_real_fields():
    rows = summarize_reverse_prospects([{"fullName": "Jean Bon"}])
    assert rows == [{"fullName": "Jean Bon"}]


def test_summarize_is_idempotent_on_its_own_output():
    # Un replan relit la liste déjà résumée depuis le dossier : elle doit survivre
    # à un second passage sans perdre l'employeur actuel.
    once = summarize_reverse_prospects([_prospect()])
    assert summarize_reverse_prospects(once) == once


def test_summarize_skips_nameless_and_non_dict_entries():
    assert summarize_reverse_prospects([{"title": "DSI"}, "junk", None]) == []


def test_summarize_is_bounded():
    rows = summarize_reverse_prospects([_prospect(fullName=f"P{i}") for i in range(30)])
    assert len(rows) == 8


def test_summarize_empty_input():
    assert summarize_reverse_prospects(None) == []
    assert summarize_reverse_prospects([]) == []


# ── Booléen « ce compte est déjà connu » (entrée du SalesContext) ─────────────
def test_has_crm_history_is_false_without_a_real_match():
    # Aucun CRM connecté / « consulté, rien trouvé » → l'API n'envoie rien.
    assert has_crm_history(None) is False
    assert has_crm_history("") is False
    assert has_crm_history("   \n ") is False


def test_has_crm_history_is_true_on_a_real_match():
    assert has_crm_history("CRM HubSpot consulté pour « TF1 » :\n- 2 contact(s)") is True


# ── Traces internes hors CRM (p8 : ATS, Drive, e-mails, notes, CV envoyés) ────
#
# Deuxième source de la couche zéro, branchée après le CRM. L'enjeu de sûreté
# est l'inverse du CRM : ces traces sont FAIBLES (un document nommé « ACME » peut
# être une note de prospection écrite hier), donc elles doivent enrichir le
# prompt sans jamais faire croire à une relation établie.


def test_traces_internes_absentes_prompt_inchange():
    """Le cas par défaut : aucune intégration connectée ⇒ bloc vide."""
    assert zero_layer_block(internal_history="") == ""
    assert zero_layer_block(internal_history=None) == ""


def test_traces_internes_citees_telles_quelles():
    block = zero_layer_block(internal_history="Documents internes (Google Drive) :\n- Proposition ACME")
    assert "Proposition ACME" in block
    assert "TRACES INTERNES" in block


def test_les_traces_n_affirment_pas_une_relation():
    """La consigne doit interdire d'en déduire un historique commercial : une
    trace prouve un CONTACT, pas une relation en cours ni une issue."""
    block = zero_layer_block(internal_history="- Proposition ACME")
    assert "ne disent NI qu'une relation est en cours" in block
    assert "n'invente ni interlocuteur ni issue" in block


def test_les_traces_ne_sortent_PAS_le_compte_du_froid():
    """TÉMOIN de l'asymétrie voulue : seul le CRM vaut le booléen « déjà connu ».
    Une trace Drive ne doit pas suffire à faire sauter l'approche froide."""
    assert has_crm_history(None) is False
    # Le même contenu passé en historique CRM, lui, compte.
    assert has_crm_history("Contact Jean Dupont, deal ouvert") is True


def test_les_trois_sections_coexistent():
    block = zero_layer_block(
        crm_presence="Contact connu : Jean Dupont",
        reverse_prospects=[{"fullName": "Marie Martin", "currentCompany": "Autre SA"}],
        internal_history="- Proposition ACME",
    )
    assert "HISTORIQUE CRM" in block
    assert "TRACES INTERNES" in block
    assert "PROSPECTION INVERSÉE" in block


def test_les_traces_internes_sont_bornees():
    """Ce texte part dans un prompt Claude — un Drive bavard ne doit pas le noyer."""
    block = zero_layer_block(internal_history="x" * 50_000)
    assert len(block) < 4000
