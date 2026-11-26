"""#2257.1 — LE CONTRAT DE DEMANDE STRUCTURÉ (LAU-FINAL-002).

Miroir Python de `packages/contracts/src/schemas/request-intent-contract.ts` :
mêmes dix-huit champs nommés (`REQUEST_INTENT_CONTRACT_FIELDS`), même règle —
jamais un second appel au modèle, jamais de contenu verbatim dans la vue
journalisée. Voir le registre `.claude/notes/registre-2026-09-17-lau-002-2257.md`.
"""

from app.models.request_intent_contract import (
    REQUEST_INTENT_CONTRACT_FIELDS,
    build_request_intent_contract,
    geo_and_sector_from_reading,
    request_intent_contract_for_log,
)
from app.services.discover_request_reading import read_request


def test_declares_the_eighteen_named_fields():
    assert len(REQUEST_INTENT_CONTRACT_FIELDS) == 18
    contract = build_request_intent_contract(active_account_company_name=None, clarification_already_asked=False)
    for field in REQUEST_INTENT_CONTRACT_FIELDS:
        assert field in contract.model_dump()


def test_objet_depart_vient_du_compte_actif_deja_resolu():
    contract = build_request_intent_contract(active_account_company_name="ACME", clarification_already_asked=False)
    assert contract.objet_depart == "ACME"


def test_ambiguite_deja_demandee_vient_du_drapeau_client():
    contract = build_request_intent_contract(active_account_company_name=None, clarification_already_asked=True)
    assert contract.ambiguite_deja_demandee is True


def test_sait_dire_non_les_quinze_autres_champs_restent_nuls_jamais_devines():
    contract = build_request_intent_contract(active_account_company_name=None, clarification_already_asked=False)
    assert contract.objet_depart is None
    assert contract.ambiguite_deja_demandee is False
    assert contract.intention_principale is None
    assert contract.perimetre_geographique is None
    assert contract.besoin_metier_sous_jacent is None


def test_la_vue_journalisee_ne_porte_jamais_le_nom_du_compte():
    contract = build_request_intent_contract(
        active_account_company_name="Client Confidentiel SAS", clarification_already_asked=True
    )
    for_log = request_intent_contract_for_log(contract)
    assert "Client Confidentiel SAS" not in str(for_log)
    assert for_log["has_objet_depart"] is True
    assert for_log["ambiguite_deja_demandee"] is True
    assert for_log["has_intention_principale"] is False


# #3391.5 (beta #3391, recette écran prod 26755bbac3, lot G04 30/09) — RESTE :
# « le mode diagnostic, non prouvable à l'écran ». Le diagnostic est
# volontairement réservé aux tests/administration (jamais au client, doctrine
# de l'issue elle-même) : la preuve tient ici, dans le journal, pas dans une
# capture d'écran. Ce qui manquait : « quelle MÉTHODE a été choisie » n'était
# PAS diagnosticable — seule sa PRÉSENCE (`has_intention_principale`) sortait
# du journal, jamais la valeur. `intention_principale` est un vocabulaire
# FERMÉ (routeur d'intention, #2321) — pas une phrase libre, donc rien à
# protéger en la journalisant, contrairement à `objet_depart` (un nom de
# compte).
def test_la_vue_journalisee_nomme_desormais_la_methode_choisie():
    contract = build_request_intent_contract(
        active_account_company_name="Client Confidentiel SAS",
        clarification_already_asked=False,
        intention_principale="find_accounts",
    )
    for_log = request_intent_contract_for_log(contract)
    assert for_log["intention_principale"] == "find_accounts"
    # Toujours pas le nom du compte : seule la méthode, un vocabulaire fermé.
    assert "Client Confidentiel SAS" not in str(for_log)


def test_la_vue_journalisee_ne_devine_pas_une_methode_absente():
    contract = build_request_intent_contract(active_account_company_name=None, clarification_already_asked=False)
    for_log = request_intent_contract_for_log(contract)
    assert for_log["intention_principale"] is None
    assert for_log["has_intention_principale"] is False


# #2257.12/.13/.14 — reste du 25/09 : trois producteurs de plus, mêmes règles
# (jamais un second appel au modèle, jamais de valeur devinée sur l'absence).
def test_horizon_urgence_et_niveau_detail_sont_portes_par_le_contrat_quand_fournis():
    contract = build_request_intent_contract(
        active_account_company_name=None,
        clarification_already_asked=False,
        horizon="immediat",
        urgence="urgent",
        niveau_detail="bref",
    )
    assert contract.horizon == "immediat"
    assert contract.urgence == "urgent"
    assert contract.niveau_detail == "bref"


def test_horizon_urgence_et_niveau_detail_restent_nuls_par_defaut():
    contract = build_request_intent_contract(active_account_company_name=None, clarification_already_asked=False)
    assert contract.horizon is None
    assert contract.urgence is None
    assert contract.niveau_detail is None


# #2257.7/.8 — reste du 25/09 : le PÉRIMÈTRE GÉOGRAPHIQUE et le SECTEUR
# réutilisent la lecture déterministe de Découvrir (`discover_request_reading`,
# #2490/#2496) — le compilateur d'intention ne redéfinit PAS un second lecteur
# de lieu et de secteur (GA-26, « un réglage vit à un seul endroit »).
def test_geo_et_secteur_viennent_du_lieu_et_du_secteur_deja_resolus():
    reading = read_request("Trouve-moi 15 filiales industrielles avec des sujets IAM en Île-de-France")
    perimetre, secteur = geo_and_sector_from_reading(reading)
    assert perimetre == "Île-de-France"
    assert secteur is None  # « industrielles » n'est reconnu par aucun marqueur de secteur ici


def test_geo_et_secteur_savent_dire_non_une_ville_candidate_nest_pas_un_perimetre_resolu():
    # « à Toulouse » n'est jamais résolu ICI (pas de réseau dans le compilateur) :
    # une ville CANDIDATE non résolue n'est pas un périmètre géographique — ce
    # serait la donnée fictive que la doctrine interdit.
    reading = read_request("ESN spécialisées cybersécurité à Toulouse")
    perimetre, secteur = geo_and_sector_from_reading(reading)
    assert perimetre is None
    assert secteur is None  # l'unique activité reconnue est "esn", pas un secteur


def test_geo_et_secteur_ignorent_le_marqueur_esn_qui_est_un_type_dentreprise_pas_un_secteur():
    reading = read_request("Je cherche une ESN spécialisée en cybersécurité")
    _, secteur = geo_and_sector_from_reading(reading)
    assert secteur is None


def test_secteur_est_produit_quand_un_secteur_dapplication_est_reconnu():
    reading = read_request("Je cherche des comptes dans l'aéronautique")
    _, secteur = geo_and_sector_from_reading(reading)
    assert secteur == "aerospace"


# #2257.9/.10/.11/.20 — reste du 25/09/2026 (feat/reste-2257-bis-25-09).
# RÈGLE DU DÉPÔT du 22/09/2026 (Louis) : plus aucune question produit, on
# applique la recommandation déjà écrite au registre — ici, ne PAS inventer un
# vocabulaire fermé qui n'existe nulle part ailleurs (doctrine : jamais de
# donnée fictive). Ces quatre champs restent nommés dans les dix-huit et
# jamais produits ; ce test le VERROUILLE en régression plutôt que de se fier
# au seul commentaire du modèle (`request_intent_contract.py:82,84,86,109`).
def test_expertise_type_compte_exclusions_et_besoin_cache_restent_nuls_faute_de_vocabulaire_ferme():
    contract = build_request_intent_contract(active_account_company_name=None, clarification_already_asked=False)
    # #2257.9 — aucun vocabulaire fermé d'expertise n'existe côté Python
    # (seul `application-sectors.ts` existe, en TS) : le dupliquer sans
    # appelant réel serait l'invention que la doctrine interdit.
    assert contract.expertise is None
    # #2257.10 — aucun vocabulaire fermé de "type de compte" n'existe.
    assert contract.type_compte is None
    # #2257.11 — pas de champ d'exclusion GÉNÉRIQUE (une exclusion réelle
    # existe déjà, mais limitée à l'auto-cohérence des comptes,
    # `bellum_advisor.py:750` — jamais devinée sur secteur/lieu/compte ici).
    assert contract.exclusions is None
    # #2257.20 — le besoin métier SOUS-JACENT exigerait une inférence
    # pragmatique (un second jugement structuré sur le seul appel modèle du
    # tour) : hors périmètre d'un champ isolé, décision d'architecture.
    assert contract.besoin_metier_sous_jacent is None
