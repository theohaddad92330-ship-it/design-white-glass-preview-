"""#2321 — le bloc « CE QUE LE SERVEUR A COMPRIS DE LA DEMANDE ».

Sans ce bloc, le routeur d'intention décidait dans le vide : la route était
calculée, journalisée, et le modèle choisissait ses outils tout seul. Ces tests
tiennent la règle qui protège le cache (vide ⇒ prompt byte-identique), la parité
FR/EN, et les deux NO-GO qui ne se négocient pas.
"""

from __future__ import annotations

from app.prompts.intent_route import intent_route_block
from app.services.compilers.intent_router import route_chat_intent


def test_une_demande_non_routee_najoute_rien_au_prompt():
    # Vide = chaîne vide = prompt byte-identique à celui d'avant ce lot. On ne
    # raconte jamais au modèle une intention qu'on n'a pas su lire.
    assert intent_route_block(route_chat_intent(message="Bonjour, ça va ?")) == ""
    assert intent_route_block(None) == ""


def test_une_demande_hors_perimetre_najoute_rien_non_plus():
    assert intent_route_block(route_chat_intent(message="Passe-moi le plan comptable")) == ""


def test_le_bloc_nomme_lintention_le_resultat_et_les_outils():
    bloc = intent_route_block(route_chat_intent(message="Je cherche du business dans la banque"))
    assert "chercher_du_business" in bloc
    assert "liste_de_comptes" in bloc
    assert "find_accounts" in bloc


def test_le_bloc_suit_la_langue_de_linterface():
    route = route_chat_intent(message="Je cherche du business")
    assert "CE QUE LE SERVEUR A COMPRIS" in intent_route_block(route, "fr")
    assert "WHAT THE SERVER UNDERSTOOD" in intent_route_block(route, "en")
    # Une interface anglaise ne doit lire AUCUN libellé français.
    anglais = intent_route_block(route, "en")
    for libelle in ("Intention", "Résultat attendu", "Outils à préférer", "Étapes"):
        assert libelle not in anglais
    # Toute langue non française lit l'anglais ; l'absence de langue lit le français.
    assert "WHAT THE SERVER UNDERSTOOD" in intent_route_block(route, "de")
    assert "CE QUE LE SERVEUR A COMPRIS" in intent_route_block(route, None)


def test_2321_20_une_hypothese_est_presentee_comme_une_hypothese_avec_son_motif():
    route = route_chat_intent(message="shortlist")
    bloc = intent_route_block(route, "fr")
    assert route.confidence == "hypothese"
    assert "hypothèse" in bloc
    # Le motif reste consultable — c'est la condition de l'arbitrage du 18/09.
    assert route.reasoning in bloc


def test_une_lecture_certaine_ne_sannonce_pas_comme_une_hypothese():
    bloc = intent_route_block(route_chat_intent(message="Je cherche du business et des prospects"), "fr")
    assert "hypothèse" not in bloc


def test_2321_19_le_no_go_du_saut_detape_napparait_que_sil_y_a_plusieurs_etapes():
    plusieurs = intent_route_block(
        route_chat_intent(message="J'ai un besoin de deux devops, envoie un mail au client"), "fr"
    )
    assert "Ne saute aucune de ces étapes" in plusieurs

    # Sur une étape unique, la consigne n'aurait rien à interdire : elle
    # alourdirait le prompt pour rien.
    une_seule = intent_route_block(route_chat_intent(message="Peux-tu matcher ce besoin ?"), "fr")
    assert "Ne saute aucune de ces étapes" not in une_seule


def test_2321_22_le_no_go_du_marche_inverse_est_dit_au_modele():
    bloc = intent_route_block(route_chat_intent(message="À qui vendre ce consultant ?"), "fr")
    assert "marché inverse" in bloc
    assert "pas un matching" in bloc


def test_une_capacite_absente_se_signale_elle_ne_se_promet_pas():
    bloc = intent_route_block(route_chat_intent(message="J'ai un retour du client"), "fr")
    assert "mise_a_jour_d_une_soumission" in bloc
    assert "note_unrouted_request" in bloc
    assert "capacite_absente" in bloc


def test_une_capacite_SERVIE_ne_declenche_pas_la_consigne_de_manque():
    bloc = intent_route_block(route_chat_intent(message="Je ne sais pas par où commencer"), "fr")
    assert "note_unrouted_request" not in bloc


def test_le_bloc_ne_nomme_jamais_de_page_et_ne_fait_jamais_envoyer():
    for message in (
        "Je cherche du business",
        "J'ai un retour du client",
        "À qui vendre ce consultant ?",
        "J'ai un besoin de deux devops, envoie un mail au client",
    ):
        for langue in ("fr", "en"):
            bloc = intent_route_block(route_chat_intent(message=message), langue)
            for page in ("Vivier", "Découvrir", "Va dans", "Go to"):
                assert page not in bloc, f"le bloc nomme une page ({page}) pour « {message} »"
    # Et la consigne inverse est dite, dans les deux langues.
    route = route_chat_intent(message="Je cherche du business")
    assert "tu ne l'envoies jamais" in intent_route_block(route, "fr")
    assert "you never send it" in intent_route_block(route, "en")


def test_les_donnees_manquantes_sont_nommees_jamais_tues():
    # « On n'affiche pas ce qu'on n'a pas » : ce qui manque se NOMME.
    bloc = intent_route_block(route_chat_intent(message="Peux-tu matcher ce besoin ?"), "fr")
    assert "besoin_cite" in bloc
    # Mais une fois la donnée là, la ligne disparaît — elle ne devient pas « 0 ».
    complet = intent_route_block(
        route_chat_intent(message="Peux-tu matcher ce besoin ?", available_inputs=("besoin_cite",)), "fr"
    )
    assert "besoin_cite" not in complet


# #2257.35 — le bloc nomme le travail facultatif et interdit de le lancer d'office.
def test_2257_35_le_bloc_nomme_l_etape_facultative_fr_et_en():
    route = route_chat_intent(
        message="J'ai un besoin de profils Java, un besoin urgent, et accessoirement proposer une shortlist"
    )
    assert "Facultatif" in intent_route_block(route, "fr")
    assert "construire_la_shortlist" in intent_route_block(route, "fr").split("Facultatif")[1]
    anglais = intent_route_block(route, "en")
    assert "Optional" in anglais
    assert "Facultatif" not in anglais


def test_2257_35_sans_facultatif_le_bloc_est_inchange():
    route = route_chat_intent(message="J'ai un besoin de profils Java, un besoin urgent, et proposer une shortlist")
    assert "Facultatif" not in intent_route_block(route, "fr")
    assert "Optional" not in intent_route_block(route, "en")
