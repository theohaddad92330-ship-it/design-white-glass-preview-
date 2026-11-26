"""#2321 — LE ROUTEUR D'INTENTION de Laura, côté moteur.

Ces tests sont le jumeau de ``chat-intent-router.test.ts`` : mêmes demandes,
mêmes verdicts. Ils tiennent surtout ce que le routeur doit savoir REFUSER —
une demande qu'il ne reconnaît pas, une capacité qu'il n'a pas, et les trois
NO-GO que le ticket écrit noir sur blanc.

La PARITÉ des vocabulaires TS ↔ Python, elle, est tenue par
``packages/contracts/src/schemas/chat-intent-router.parity.test.ts``, qui lit ce
module-ci — c'est là qu'un vocabulaire divergent devient rouge.
"""

from __future__ import annotations

import pytest

from app.services.compilers.intent_router import (
    CHAT_INTENT_KINDS,
    CHAT_INTENT_PIPELINE,
    CHAT_INTENT_ROUTE_FIELDS,
    CHAT_INTENT_ROUTING_TABLE,
    UNDECLARED_CHAT_INTENT,
    available_inputs_from_thread,
    chat_intent_route_for_log,
    route_chat_intent,
)
from app.services.unrouted_intent import UNROUTED_INTENT_CATEGORIES


def test_declare_les_dix_intentions_plus_comparer_et_le_defaut_a_part():
    # #3175.3 (épopée #3215) — « comparer », « trouver_contacts »,
    # « actualiser » et « choisir_perimetre » s'ajoutent aux dix du ticket
    # #2321.
    assert len(CHAT_INTENT_KINDS) == 16
    # Le défaut n'est PAS une quinzième intention : c'est l'absence de routage.
    assert UNDECLARED_CHAT_INTENT not in CHAT_INTENT_KINDS


def test_la_route_porte_les_champs_nommes():
    route = route_chat_intent(message="Je cherche du business dans la banque")
    for champ in CHAT_INTENT_ROUTE_FIELDS:
        assert hasattr(route, champ), f"champ manquant sur la route : {champ}"


@pytest.mark.parametrize(
    "message,attendu",
    [
        ("Je cherche du business dans l'assurance", "chercher_du_business"),
        ("I am looking for new business in insurance", "chercher_du_business"),
        ("J'ai appris que Renault ouvre un centre de services", "information_client"),
        ("I heard that Renault is opening a service centre", "information_client"),
        ("J'ai un besoin : deux devops pour janvier", "besoin"),
        ("I have a need: two devops engineers for January", "besoin"),
        ("J'ai un profil de data engineer disponible", "profil"),
        ("I have a profile, a data engineer available now", "profil"),
        ("Peux-tu matcher ce besoin avec le vivier ?", "matcher"),
        ("Can you match this need with the bench?", "matcher"),
        ("Je veux proposer une shortlist au client", "proposer"),
        ("I want to propose a shortlist to the client", "proposer"),
        ("J'ai un retour du client sur la candidature", "retour"),
        ("I have feedback from the client on the application", "retour"),
        ("C'est signé, le bon de commande est arrivé", "signe"),
        ("It is signed, the purchase order arrived", "signe"),
        ("Je veux importer mon existant, mes CV et mes besoins", "importer"),
        ("I want to import my existing data, my CVs and my needs", "importer"),
        ("Je ne sais pas quoi faire aujourd'hui", "diagnostic"),
        ("I do not know what to do today", "diagnostic"),
        ("Peux-tu comparer ces comptes ?", "comparer"),
        ("Can you compare these accounts?", "comparer"),
        ("Qui contacter chez Airbus ?", "trouver_contacts"),
        ("Find contacts at Airbus", "trouver_contacts"),
        ("Quel est le bon périmètre chez Airbus ?", "choisir_perimetre"),
        ("Which perimeter should I target at Airbus?", "choisir_perimetre"),
        ("Challenge ce compte : est-ce le bon compte ?", "challenger_un_compte"),
        ("Is this the right account?", "challenger_un_compte"),
        ("Comprendre l'écosystème de ce compte", "comprendre_ecosysteme"),
        ("Map the ecosystem around Airbus", "comprendre_ecosysteme"),
    ],
)
def test_reconnait_les_dix_intentions_en_francais_et_en_anglais(message, attendu):
    assert route_chat_intent(message=message).intent == attendu


# #3864.1 (BEL-LAU-1008-013) — recette bêta 08/10 : « trouve-moi des besoins » ne
# portait AUCUN marqueur de la table (« j'ai un besoin » suppose un besoin déjà
# connu DE L'UTILISATEUR, pas une recherche) et retombait sur `non_declaree` —
# Laura expliquait les limites du produit au lieu de lancer `find_needs`.
@pytest.mark.parametrize(
    "message",
    [
        "Trouve-moi des besoins",
        "Trouve moi des besoins qui correspondent a mon expertise",
        "Cherche-moi des besoins ouverts",
        "Où trouver des besoins pour mes expertises ?",
        "Quels besoins correspondent à mes compétences ?",
        "Find me needs that match my expertise",
        "Where can I find needs for my skills",
        "What open needs match my expertise",
    ],
)
def test_3864_1_trouve_moi_des_besoins_lance_une_recherche_pas_une_explication(message):
    route = route_chat_intent(message=message)
    assert route.intent == "besoin"
    assert route.tools == ("find_needs",)
    assert route.awaits_human is False


def test_3175_3_comparer_sert_avec_compare_accounts_sans_capacite_absente():
    # #3175.3 (épopée #3215) — un des six types d'intention du ticket #3175
    # non encore câblés dans CHAT_INTENT_KINDS / CHAT_INTENT_ROUTING_TABLE.
    # `compare_accounts` existe déjà dans `chat_tools.py` : servie, pas
    # `capacite_absente`.
    route = route_chat_intent(message="Peux-tu comparer mes comptes Société Générale et BNP ?")
    assert route.intent == "comparer"
    assert route.tools == ("compare_accounts",)
    assert route.capability_gap is None
    assert route.awaits_human is False


def test_3175_3_trouver_contacts_sert_avec_les_deux_outils_reels_sans_capacite_absente():
    # #3175.3 — deuxième des six. `get_account_contacts` et
    # `search_workspace_contacts` existent déjà : servie, pas
    # `capacite_absente`.
    route = route_chat_intent(message="Qui contacter chez Airbus ?")
    assert route.intent == "trouver_contacts"
    assert route.tools == ("get_account_contacts", "search_workspace_contacts")
    assert route.capability_gap is None
    assert route.awaits_human is False


def test_3175_3_actualiser_est_reconnue_mais_ne_promet_aucun_outil():
    # #3175.3 — troisième des six. Aucun outil de chat ne relance une analyse
    # existante aujourd'hui : RECONNUE, non servie, comme `information_client`
    # / `retour` — le gap est NOMMÉ, jamais inventé.
    route = route_chat_intent(message="Peux-tu actualiser ce compte ?")
    assert route.intent == "actualiser"
    assert route.tools == ()
    assert route.capability_gap == "relance_dune_analyse_existante_depuis_le_chat"
    assert route.awaits_human is True
    assert route.unrouted_category == "capacite_absente"


def test_3175_3_choisir_perimetre_sert_avec_resolve_account_territory_sans_capacite_absente():
    # #3175.3 — quatrième des six. `resolve_account_territory` existe déjà :
    # servie, pas `capacite_absente`.
    route = route_chat_intent(message="Quel est le bon périmètre chez Airbus ?")
    assert route.intent == "choisir_perimetre"
    assert route.tools == ("resolve_account_territory",)
    assert route.capability_gap is None
    assert route.awaits_human is False


def test_3175_3_challenger_et_ecosysteme_sont_servies_par_de_vrais_outils():
    # #3175.3 (lot E1 30/09) — les deux derniers des six : ni `capacite_absente`,
    # ni outil inventé (la garde de parité vérifie que les noms existent).
    challenge = route_chat_intent(message="Est-ce le bon compte ?")
    assert challenge.intent == "challenger_un_compte"
    assert challenge.tools == ("get_account_interest_penetrability", "suggest_account_alternatives")
    assert challenge.awaits_human is False
    ecosystem = route_chat_intent(message="Comprendre l'écosystème de ce compte")
    assert ecosystem.intent == "comprendre_ecosysteme"
    assert ecosystem.tools == ("get_account_coverage_map", "get_esn_on_account")
    assert ecosystem.capability_gap is None


def test_3175_3_une_mention_nest_pas_une_demande_de_challenge():
    # Sait dire NON : « compte » seul ou « écosystème » seul ne routent rien.
    assert route_chat_intent(message="Mon compte est ouvert chez Airbus").intent != "challenger_un_compte"
    assert route_chat_intent(message="Un écosystème de startups").intent != "comprendre_ecosysteme"


def test_sait_dire_non_une_demande_sans_marqueur_nest_pas_routee_et_attend():
    route = route_chat_intent(message="Bonjour, ça va bien ?")
    assert route.intent == UNDECLARED_CHAT_INTENT
    # Un intent NON DÉCLARÉ attend — jumeau d'`UNDECLARED_INTENT_SITE`.
    assert route.awaits_human is True
    assert route.unrouted_category == "intention_incomprise"
    assert route.tools == ()
    assert route.expected_result is None


def test_sait_dire_non_hors_perimetre_bellum_suit_le_financier_il_ne_comptabilise_pas():
    for message in ("Passe-moi l'écriture comptable de cette facture", "Show me the general ledger entry"):
        route = route_chat_intent(message=message)
        assert route.intent == UNDECLARED_CHAT_INTENT
        assert route.unrouted_category == "hors_perimetre"
        assert route.awaits_human is True


def test_nemploie_que_les_trois_categories_existantes():
    for message in ("Bonjour", "plan comptable", "J'ai un retour du client"):
        categorie = route_chat_intent(message=message).unrouted_category
        assert categorie is None or categorie in UNROUTED_INTENT_CATEGORIES


def test_2321_22_a_qui_vendre_ce_consultant_route_vers_le_marche_inverse():
    for message in ("À qui vendre ce consultant ?", "Who should I sell this consultant to?"):
        route = route_chat_intent(message=message)
        assert route.expected_result == "marche_inverse"
        assert route.intent != "matcher"


def test_2321_22_le_marche_inverse_gagne_meme_avec_les_marqueurs_de_proposer():
    route = route_chat_intent(message="À qui proposer ce consultant en shortlist ?")
    assert route.expected_result == "marche_inverse"


def test_2321_18_une_demande_multi_intentions_rend_un_job_sequence():
    route = route_chat_intent(message="J'ai un besoin de deux devops, trouve-moi les profils et prépare la shortlist")
    assert len(route.steps) > 1
    rangs = [CHAT_INTENT_PIPELINE.index(step) for step in route.steps]
    assert rangs == sorted(rangs)


def test_2321_19_sait_dire_non_au_saut_detape():
    route = route_chat_intent(message="J'ai un besoin de deux devops, envoie un mail au client avec les profils")
    assert route.steps != ("preparer_le_message",)
    assert route.steps[0] == "qualifier_le_besoin"
    assert route.steps[-1] == "preparer_le_message"
    # Contigu : aucune étape intermédiaire sautée.
    premier = CHAT_INTENT_PIPELINE.index(route.steps[0])
    assert route.steps == CHAT_INTENT_PIPELINE[premier : premier + len(route.steps)]


# #2257.33/.34 — reste du 25/09/2026 (feat/reste-2257-bis-25-09). Le registre
# (`.claude/notes/registre-2026-09-17-lau-002-2257.md`) demandait « distinguer
# le résultat demandé maintenant » et « distinguer les étapes nécessaires »
# entre PLUSIEURS travaux mentionnés dans un même message. #2325 (pipe des
# opportunités, `opportunity-pipeline-health.ts`) NE couvre PAS cet axe : son
# unité est une LIGNE du pipe (une opportunité déjà en base), jamais une
# phrase à plusieurs demandes — vérifié en lisant son module, aucune notion de
# message multi-travaux. Le mécanisme qui répond déjà à ces deux points est
# CELUI-CI, tourné en TDD pour le prouver plutôt que de le décrire :
def test_2257_33_plusieurs_travaux_le_resultat_demande_maintenant_gagne_au_compte_de_marqueurs():
    # Deux marqueurs "besoin" ("j'ai un besoin" + "un besoin de") contre un
    # seul marqueur "proposer" ("shortlist") : le résultat demandé MAINTENANT
    # est celui qui a le plus de poids textuel, pas le premier verbe ni le
    # dernier mot de la phrase (#2257.37).
    route = route_chat_intent(
        message="J'ai un besoin de profils Java, un besoin urgent, et accessoirement "
        "je veux aussi proposer une shortlist plus tard"
    )
    assert route.intent == "besoin"
    assert route.expected_result == "fiche_besoin"
    assert route.confidence == "certaine"


def test_2257_34_plusieurs_travaux_les_etapes_necessaires_couvrent_les_deux_pipelines():
    # Le même message porte aussi un marqueur "proposer" (stage
    # construire_la_shortlist) : les étapes NÉCESSAIRES nommées par la route
    # couvrent la tranche contiguë des DEUX travaux mentionnés, pas seulement
    # celui qui a gagné le champ `intent`.
    route = route_chat_intent(
        message="J'ai un besoin de profils Java, un besoin urgent, et accessoirement "
        "je veux aussi proposer une shortlist plus tard"
    )
    assert route.steps == ("qualifier_le_besoin", "trouver_les_profils", "construire_la_shortlist")


def test_le_copilote_prepare_il_nenvoie_jamais():
    route = route_chat_intent(message="Je veux proposer ce profil, prépare le message pour le client")
    assert "preparer_le_message" in route.steps
    assert "envoyer_le_message" not in CHAT_INTENT_PIPELINE
    assert "preparer_le_message" in route.awaits_validation
    assert "preparer_le_message" not in route.produces_now
    assert route.awaits_human is True


def test_2321_13_nomme_lobjet_canonique():
    assert route_chat_intent(message="J'ai un besoin de deux devops").canonical_object == "need"
    assert route_chat_intent(message="J'ai un retour du client").canonical_object == "submission"
    assert route_chat_intent(message="C'est signé, bon de commande reçu").canonical_object == "mission"
    assert route_chat_intent(message="J'ai un profil disponible").canonical_object == "consultant"


def test_2321_14_les_donnees_presentes_viennent_de_lappelant_jamais_du_texte():
    sans_rien = route_chat_intent(message="Peux-tu matcher ce besoin ?")
    assert sans_rien.known_inputs == ()
    assert "besoin_cite" in sans_rien.missing_inputs

    avec = route_chat_intent(message="Peux-tu matcher ce besoin ?", available_inputs=("besoin_cite",))
    assert avec.known_inputs == ("besoin_cite",)
    assert avec.missing_inputs == ()


def test_2321_11_le_point_de_depart_est_le_compte_actif_deja_resolu():
    route = route_chat_intent(message="Je cherche du business", active_account_company_name="ACME")
    assert route.starting_point == "ACME"
    assert route_chat_intent(message="Je cherche du business").starting_point is None


def test_une_intention_reconnue_sans_capacite_le_dit_sans_inventer_doutil():
    route = route_chat_intent(message="J'ai un retour du client sur la candidature")
    assert route.intent == "retour"
    assert route.tools == ()
    assert route.unrouted_category == "capacite_absente"
    assert route.awaits_human is True
    assert route.capability_gap is not None
    # Sans outil, la route ne prétend RIEN produire.
    assert route.produces_now == ()


def test_une_intention_servie_produit_tout_de_suite():
    route = route_chat_intent(message="Je ne sais pas par où commencer")
    assert route.intent == "diagnostic"
    assert len(route.tools) > 0
    assert route.unrouted_category is None
    assert route.awaits_human is False


def test_2321_20_un_marqueur_unique_rend_une_hypothese_avec_son_motif():
    route = route_chat_intent(message="shortlist")
    assert route.confidence == "hypothese"
    assert route.reasoning is not None


def test_le_motif_ne_cite_jamais_le_texte_de_lutilisateur():
    secret = "mon mot de passe est hunter2"
    route = route_chat_intent(message=f"Je cherche du business, {secret}")
    assert "hunter2" not in (route.reasoning or "")
    # Le motif est TOUJOURS un marqueur déclaré de la table.
    assert route.reasoning in CHAT_INTENT_ROUTING_TABLE[route.intent].markers


def test_aucune_probabilite_ne_sort_du_routeur():
    route = route_chat_intent(message="Je cherche du business et des prospects")
    assert route.confidence == "certaine"
    assert isinstance(route.confidence, str)


def test_la_vue_journalisee_ne_porte_aucun_nom_de_compte():
    route = route_chat_intent(message="Je cherche du business", active_account_company_name="ACME")
    journal = chat_intent_route_for_log(route)
    assert "ACME" not in str(journal)
    assert journal["has_starting_point"] is True


def test_2321_14_les_entrees_viennent_des_objets_CITES_par_le_fil():
    fil = {"objects": [{"kind": "need", "id": "1", "label": "Deux devops"}]}
    assert available_inputs_from_thread(fil, active_account=False) == ("besoin_cite",)
    assert available_inputs_from_thread(fil, active_account=True) == ("compte_actif", "besoin_cite")
    # Un fil vide ne fournit rien — et surtout pas parce que le mot est écrit.
    assert available_inputs_from_thread({}, active_account=False) == ()
    assert available_inputs_from_thread(None, active_account=False) == ()


def test_2321_14_un_fil_illisible_ne_fabrique_aucune_entree():
    # Une forme inattendue (ancien client, champ tronqué) ne doit ni lever ni
    # inventer : elle rend ce qu'elle sait, c'est-à-dire rien.
    assert available_inputs_from_thread({"objects": ["pas un objet", None]}, active_account=False) == ()
    assert available_inputs_from_thread({"objects": [{"kind": "contact"}]}, active_account=False) == ()


def test_le_routeur_alimente_les_quatre_champs_du_contrat_2257():
    route = route_chat_intent(message="Je ne sais pas par où commencer")
    # Ce que le tour de chat recopie dans le contrat de demande structuré.
    assert route.intent == "diagnostic"
    assert route.expected_result == "liste_de_priorites"
    assert route.tools[0] == "list_accounts_to_act"


def test_une_route_non_declaree_ne_peuple_aucun_champ_du_contrat():
    route = route_chat_intent(message="Bonjour, ça va bien ?")
    # On n'écrit pas ce qu'on n'a pas : pas d'outil, pas de résultat, pas d'étape.
    assert route.expected_result is None
    assert route.tools == ()
    assert route.steps == ()


def test_lit_un_accent_comme_sa_forme_sans_accent():
    assert route_chat_intent(message="C'EST SIGNÉ").intent == "signe"
    assert route_chat_intent(message="c'est signe").intent == "signe"


def test_une_demande_composee_garde_les_outils_de_chaque_intention_matchee():
    # #3856 (BEL-LAU-1008-005) — « une demande composée conserve tous ses
    # livrables : "comptes, interlocuteurs et stratégie" ne devient pas
    # uniquement une recherche de sociétés. » Avant ce lot, seuls les outils
    # de l'intention GAGNANTE sortaient de la route (winner-takes-all) : une
    # demande qui matchait DEUX marqueurs déclarés (ici `chercher_du_business`
    # ET `trouver_contacts`) perdait les outils de la seconde — les comptes
    # auraient été rendus, les contacts jamais cherchés.
    route = route_chat_intent(
        message="Trouve-moi des comptes dans la banque, avec les contacts de chaque entreprise."
    )
    assert route.intent == "chercher_du_business"
    assert route.tools[:2] == ("find_accounts", "run_account_search")
    assert "get_account_contacts" in route.tools
    assert "search_workspace_contacts" in route.tools


def test_une_demande_simple_ne_rend_toujours_que_les_outils_de_son_intention():
    # Non-régression : une demande qui ne matche qu'UN marqueur ne voit pas
    # apparaître des outils d'une autre intention.
    route = route_chat_intent(message="Qui contacter chez Airbus ?")
    assert route.tools == ("get_account_contacts", "search_workspace_contacts")


# #2257.35 — les travaux FACULTATIFS : utiles, mais pas nécessaires au résultat
# demandé. Posé par règle sur un marqueur déclaré, jamais deviné.
def test_2257_35_une_etape_facultative_est_posee_et_jamais_lancee_d_office():
    route = route_chat_intent(
        message="J'ai un besoin de profils Java, un besoin urgent, et accessoirement "
        "je veux aussi proposer une shortlist plus tard"
    )
    assert route.optional_steps == ("construire_la_shortlist",)
    assert route.optional_reason == "accessoirement"
    # Une étape facultative reste dans le plan, mais n'est JAMAIS lancée sans geste.
    assert "construire_la_shortlist" in route.steps
    assert "construire_la_shortlist" not in route.produces_now
    # Et le résultat principal n'en dépend pas.
    assert route.intent == "besoin"
    assert set(route.optional_steps) <= set(route.steps)


def test_2257_35_le_travail_facultatif_ne_bloque_pas_le_resultat_principal():
    route = route_chat_intent(
        message="Je veux proposer ce profil, prépare le message pour le client si tu as le temps"
    )
    assert "preparer_le_message" in route.optional_steps
    assert "preparer_le_message" not in route.awaits_validation
    # Seule la validation NÉCESSAIRE attend un humain ; le message facultatif ne retient rien.
    assert route.awaits_validation == ("faire_valider_la_shortlist",)
    assert "preparer_le_message" not in route.produces_now


def test_2257_35_controle_negatif_sans_marqueur_rien_n_est_facultatif():
    route = route_chat_intent(
        message="J'ai un besoin de profils Java, un besoin urgent, et je veux aussi proposer une shortlist"
    )
    assert route.optional_steps == ()
    assert route.optional_reason is None
    assert route.produces_now == ("qualifier_le_besoin", "trouver_les_profils", "construire_la_shortlist")


def test_2257_35_le_resultat_demande_n_est_jamais_facultatif():
    # Le marqueur est là, mais il n'y a qu'une étape : elle EST le résultat demandé.
    route = route_chat_intent(message="J'ai un profil de data engineer disponible, si possible")
    assert route.optional_steps == ()


def test_2257_35_la_vue_journalisee_compte_sans_contenu():
    route = route_chat_intent(message="J'ai un besoin de profils Java, accessoirement proposer une shortlist")
    assert chat_intent_route_for_log(route)["optional_steps_count"] == len(route.optional_steps)
