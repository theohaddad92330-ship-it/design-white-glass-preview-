"""Le compte rendu de rendez-vous : la garde anti-invention, et le prompt."""

from __future__ import annotations

from app.models.outputs.meeting_notes import ClientIssue, Evidence, Learning, MeetingNotesOutput, NextStep
from app.prompts.bellum_meeting_notes import build_system_prompt, build_user_prompt
from app.services.model_policy import model_for


def test_le_prompt_interdit_explicitement_d_ajouter():
    system = build_system_prompt()
    assert "tu n'ajoutes RIEN" in system
    # Les deux inventions les plus coûteuses sont nommées séparément : un
    # propriétaire deviné et une échéance fabriquée circulent dans le compte
    # rendu et se retournent contre l'ESN à la réunion suivante.
    assert "le propriétaire reste VIDE" in system
    assert "elle reste VIDE" in system


def test_le_prompt_accepte_une_liste_vide():
    assert "Une liste vide est une réponse acceptable" in build_system_prompt()


def test_le_contexte_est_optionnel_et_jamais_fabrique():
    sans_contexte = build_user_prompt(notes="Le client veut du Java.")
    assert "COMPTE :" not in sans_contexte
    assert "PARTICIPANTS" not in sans_contexte
    assert "Le client veut du Java." in sans_contexte

    avec = build_user_prompt(notes="n", account_name="ACME", attendees="Marc")
    assert "COMPTE : ACME" in avec
    assert "PARTICIPANTS ANNONCÉS : Marc" in avec


def test_les_notes_sont_declarees_source_unique():
    assert "source unique — n'ajoute rien" in build_user_prompt(notes="n")


def test_le_modele_est_declare_dans_la_politique():
    # La garde du dépôt : aucun appel Claude ne part sur un modèle implicite.
    assert model_for("bellum_meeting_notes")


def test_toutes_les_listes_par_defaut_sont_vides():
    # Un compte rendu vide est un état valable ; un schéma qui force trois
    # décisions produirait trois décisions inventées.
    output = MeetingNotesOutput()
    assert output.decisions == []
    assert output.next_steps == []
    assert output.open_questions == []
    assert output.signals == []
    assert output.follow_up_email == ""


def test_une_action_sans_proprietaire_ni_echeance_reste_valide():
    step = NextStep(action="Envoyer deux CV")
    assert step.owner == ""
    assert step.due == ""


# ── La partie APRÈS : les neuf sorties et leur extrait ──────────────────────


def test_les_neuf_sorties_sont_demandees_nommement():
    system = build_system_prompt()
    for champ in (
        "summary",
        "next_steps",
        "follow_up_email",
        "opportunity",
        "need",
        "mentioned_contacts",
        "crm_stage",
        "reminder",
        "learnings",
    ):
        assert f"- {champ} :" in system, champ


def test_le_prompt_exige_une_source_sur_chaque_objet():
    system = build_system_prompt()
    # C'est la règle qui distingue « le client a dit ça » de « le modèle le
    # pense ». Elle est posée avec le même mot que l'anti-invention.
    assert "RÈGLE ABSOLUE — chaque objet extrait DIT D'OÙ IL VIENT." in system
    assert '"kind": "transcript"' in system
    assert '"kind": "notes-derived"' in system
    assert "au plus une ou deux phrases" in system


def test_le_prompt_refuse_de_produire_un_objet_sans_source():
    # « Invente une source » et « n'invente pas d'objet » sont deux réponses
    # possibles à la même contrainte. Le prompt tranche pour la seconde.
    assert "dans ce cas, tu ne le produis pas du tout" in build_system_prompt()


def test_le_prompt_dit_qu_il_n_envoie_rien():
    system = build_system_prompt()
    assert "Tu n'envoies rien." in system
    assert "BROUILLONS que le commercial relira et enverra lui-même" in system


def test_le_prompt_ne_fabrique_pas_une_echeance_de_relance():
    # La maquette écrit « Relance J+10 ». Si personne n'a dit « dix jours », le
    # champ reste vide — la carte s'affiche sans échéance plutôt qu'avec une
    # fausse.
    assert "tu ne fabriques pas un « J+10 » pour remplir le champ" in build_system_prompt()


def test_aucun_critere_protege_ne_remonte_des_personnes_citees():
    # L'interdit porte sur le PROMPT autant que sur le code : il suffit qu'un
    # champ soit demandé au modèle pour qu'il pèse.
    system = build_system_prompt()
    assert "ni l'âge, ni l'origine, ni l'apparence" in system


def test_la_nature_du_texte_decide_si_une_citation_existe():
    transcript = build_user_prompt(notes="n", from_transcript=True)
    assert "les phrases sont citables telles quelles" in transcript

    manuscrites = build_user_prompt(notes="n")
    assert "aucune phrase n'est une citation" in manuscrites
    assert "plutôt que de fabriquer un extrait" in manuscrites


def test_une_source_par_defaut_ne_pretend_citer_personne():
    # Le défaut prudent : quand le modèle n'a rien dit, on n'a pas de citation.
    # Une valeur par défaut qui prétendrait citer serait une citation inventée.
    assert Evidence().kind == "notes-derived"
    assert Evidence().excerpt == ""


def test_les_sorties_absentes_valent_none_et_pas_un_objet_vide():
    # `None` dit « rien de tel n'a été entendu ». Un objet vide dirait « une
    # opportunité, sans titre » — et une opportunité sans titre entre quand même
    # au pipeline.
    output = MeetingNotesOutput()
    assert output.opportunity is None
    assert output.need is None
    assert output.client_issue is None
    assert output.crm_stage is None
    assert output.reminder is None
    assert output.recap_evidence is None
    assert output.mentioned_contacts == []
    assert output.learnings == []


# ── #2103.10 (épopée #2878) — un problème client, distinct d'un besoin ──────


def test_le_prompt_distingue_le_probleme_client_du_besoin_de_staffing():
    system = build_system_prompt()
    assert "- client_issue :" in system
    assert "DISTINCT de `need`" in system


def test_un_probleme_client_sans_enonce_reste_none():
    assert MeetingNotesOutput().client_issue is None


def test_un_probleme_client_porte_sa_propre_source():
    issue = ClientIssue(title="Le portail transporteurs tombe en heures de pointe")
    assert issue.evidence.kind == "notes-derived"
    assert issue.detail == ""


def test_une_objection_et_un_engagement_sont_deux_choses():
    assert Learning(content="Le TJM est jugé haut.").kind == "objection"
    assert Learning(kind="commitment", content="Ils rappellent lundi.").kind == "commitment"


# ── L'email de suivi : remerciement bref, responsabilités, dates (#2319.95/.97/.98) ──


def test_2319_95_le_mail_remercie_brievement():
    system = build_system_prompt()
    assert "Il remercie BRIÈVEMENT" in system
    assert "pas un paragraphe de politesse" in system


def test_2319_97_le_mail_distingue_les_responsabilites():
    system = build_system_prompt()
    assert "Il distingue qui fait quoi" in system
    # Même garde qu'ailleurs dans le prompt : un propriétaire ne se devine pas.
    assert "jamais un propriétaire deviné là où les notes n'en donnent pas" in system


def test_2319_98_le_mail_donne_les_echeances_connues():
    system = build_system_prompt()
    assert "Il donne les échéances déjà connues" in system
    # Même garde que le reste du prompt (next_steps, reminder.due_label) :
    # sans échéance dite, pas de date fabriquée.
    assert "sans échéance dite, le point reste sans date plutôt que d'en inventer une" in system
