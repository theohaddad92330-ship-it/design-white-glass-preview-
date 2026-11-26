"""Le conseil de qualification (addendum final p33-40).

Les cas de test portent les VRAIES lignes de la capture p35 : ce sont elles qui
ont motivé le module, et les revoir ici dit ce que le produit doit désormais en
faire. Une régression sur l'une d'elles remettrait à l'écran « BONILLA
CHRISTOPHE » comme compte à conquérir.

Deux règles structurent tout le fichier, et correspondent à l'arbitrage produit
du 02/08 :

  * on n'exclut que sur PREUVE (le registre dit « personne physique », l'entité
    est cessée, le SIREN est déjà là, le département n'est pas celui demandé) ;
  * tout le reste va en « à vérifier » — visible, hors du haut de liste, jamais
    supprimé en silence.
"""

from __future__ import annotations

import pytest

from app.services.account_qualification import (
    ExclusionCode,
    VerifyCode,
    is_end_client_legal_category,
    is_public_employer,
    qualify_all,
    qualify_candidate,
)


def company(**over):
    base = {
        "name": "ACME SOLUTIONS",
        "siren": "123456789",
        "legalCategory": "5710",  # SAS
        "headcountTranche": "12",  # 20 à 49 salariés
        "department": "75",
        "ceased": False,
    }
    return {**base, **over}


# ── Les lignes de la capture p35 ─────────────────────────────────────────────


def test_a_natural_person_is_excluded_on_proof():
    # « BONILLA CHRISTOPHE » : le registre lui-même dit « entrepreneur
    # individuel ». Ce n'est pas une organisation, c'est quelqu'un.
    result = qualify_candidate(company(name="BONILLA CHRISTOPHE", legalCategory="1000"))
    assert result["verdict"] == "excluded"
    assert result["code"] == ExclusionCode.NATURAL_PERSON


def test_an_indivision_is_excluded_as_unincorporated():
    # « INDIVISION DEGREMONT » : catégorie 2xxx, aucune personne morale. On ne
    # vend pas une prestation informatique à une indivision.
    result = qualify_candidate(company(name="INDIVISION DEGREMONT", legalCategory="2210"))
    assert result["verdict"] == "excluded"
    assert result["code"] == ExclusionCode.UNINCORPORATED


def test_a_zero_headcount_company_is_flagged_not_deleted():
    # « KOCH LISON · 0 salarié » : douteux, pas prouvé. Une société d'une
    # personne peut être un vrai cabinet — l'exclure ferait rater une cible.
    result = qualify_candidate(company(name="KOCH LISON", legalCategory="5499", headcountTranche="00"))
    assert result["verdict"] == "to_verify"
    assert result["code"] == VerifyCode.NO_EMPLOYEES


def test_a_person_like_name_is_only_a_doubt():
    # « PAULOV JULIETTE » sous une forme sociale valide : le nom n'est qu'un
    # indice — une entreprise a le droit de porter le nom de sa fondatrice.
    result = qualify_candidate(company(name="PAULOV JULIETTE", legalCategory="5710", headcountTranche="12"))
    assert result["verdict"] == "to_verify"
    assert result["code"] == VerifyCode.PERSON_LIKE_NAME


def test_an_out_of_zone_company_is_excluded_when_a_zone_was_requested():
    # « MERZ & BENTELI AG · NIEDERWANGEN » sur une recherche département 75 :
    # le décalage avec la demande est un fait, pas une appréciation.
    result = qualify_candidate(company(department="99"), filters={"departments": ["75", "92"]})
    assert result["verdict"] == "excluded"
    assert result["code"] == ExclusionCode.OUT_OF_ZONE


def test_an_unknown_department_is_never_excluded():
    # L'absence de donnée ne prouve pas le décalage : on ne l'exclut pas.
    result = qualify_candidate(company(department=""), filters={"departments": ["75"]})
    assert result["verdict"] != "excluded"


# ── #2490.11 — la ville RÉSOLUE ancre le siège, pas seulement le département ─


def test_a_resolved_city_excludes_a_siege_in_a_neighbouring_commune():
    # Blagnac et Toulouse partagent le même département (31) : le département
    # seul ne voit pas le décalage, la commune RÉSOLUE si.
    result = qualify_candidate(company(city="BLAGNAC", department="31"), filters={"cityCommuneName": "Toulouse"})
    assert result["verdict"] == "excluded"
    assert result["code"] == ExclusionCode.OUT_OF_ZONE


def test_a_resolved_city_keeps_a_siege_in_the_same_commune_case_and_accent_insensitive():
    result = qualify_candidate(company(city="TOULOUSE", department="31"), filters={"cityCommuneName": "Toulouse"})
    assert result["verdict"] != "excluded"


def test_an_unresolved_city_free_text_excludes_nothing():
    # `city` (texte tapé) n'est PAS `cityCommuneName` (résolu) : une simple
    # différence de graphie ne doit jamais exclure un siège légitime.
    result = qualify_candidate(company(city="BLAGNAC"), filters={"city": "Toulouse"})
    assert result["verdict"] != "excluded"


def test_an_unknown_city_is_never_excluded():
    # L'absence de donnée ne prouve pas le décalage : on ne l'exclut pas.
    result = qualify_candidate(company(city=""), filters={"cityCommuneName": "Toulouse"})
    assert result["verdict"] != "excluded"


def test_a_healthy_operating_company_is_recommended():
    assert qualify_candidate(company())["verdict"] == "recommended"


# ── Les autres preuves ───────────────────────────────────────────────────────


def test_a_ceased_entity_is_excluded():
    result = qualify_candidate(company(ceased=True))
    assert result["verdict"] == "excluded"
    assert result["code"] == ExclusionCode.CEASED


def test_a_duplicate_siren_is_excluded_the_second_time_only():
    rows = [company(name="ACME"), company(name="ACME (doublon)")]
    verdicts = qualify_all(rows)
    assert verdicts[0]["verdict"] == "recommended"
    assert verdicts[1]["verdict"] == "excluded"
    assert verdicts[1]["code"] == ExclusionCode.DUPLICATE


def test_an_excluded_row_does_not_consume_its_siren():
    # Sinon une première ligne cessée ferait passer la suivante — la SEULE
    # affichable — pour un doublon.
    rows = [company(ceased=True), company()]
    verdicts = qualify_all(rows)
    assert verdicts[0]["code"] == ExclusionCode.CEASED
    assert verdicts[1]["verdict"] == "recommended"


# ── Les doutes ───────────────────────────────────────────────────────────────


def test_an_sci_is_a_doubt_not_an_exclusion():
    # Arbitrage produit : une SCI est presque toujours du bruit, mais « presque »
    # ne justifie pas de la faire disparaître.
    result = qualify_candidate(company(name="SCI DES LILAS", legalCategory="6540"))
    assert result["verdict"] == "to_verify"
    assert result["code"] == VerifyCode.NON_OPERATING_VEHICLE


def test_a_gie_is_not_treated_as_a_shell():
    # 6xxx recouvre aussi le GIE informatique, parfaitement vendable : traiter
    # tout le préfixe comme du bruit jetterait de vraies cibles.
    result = qualify_candidate(company(name="GIE INFORMATIQUE MUTUALISEE", legalCategory="6220"))
    assert result["verdict"] == "recommended"


def test_an_association_is_flagged_for_its_different_buying_cycle():
    result = qualify_candidate(company(name="ASSOCIATION SPORTIVE", legalCategory="9220"))
    assert result["verdict"] == "to_verify"
    assert result["code"] == VerifyCode.PUBLIC_OR_ASSOCIATION


def test_a_public_body_is_flagged_too():
    result = qualify_candidate(company(name="COMMUNE DE X", legalCategory="7210"))
    assert result["verdict"] == "to_verify"


def test_a_micro_structure_is_flagged():
    result = qualify_candidate(company(headcountTranche="01"))
    assert result["verdict"] == "to_verify"
    assert result["code"] == VerifyCode.MICRO_STRUCTURE


def test_a_missing_legal_form_is_a_doubt_not_a_recommendation():
    # Sans catégorie juridique, la question principale n'a pas pu être posée.
    result = qualify_candidate(company(legalCategory=None))
    assert result["verdict"] == "to_verify"
    assert result["code"] == VerifyCode.UNKNOWN_LEGAL_FORM


def test_every_doubt_is_kept_not_just_the_first():
    # L'écran doit pouvoir tous les montrer, et la boucle « pourquoi exclu ? »
    # (p41) doit pouvoir les compter.
    result = qualify_candidate(company(name="MARIE DURAND", legalCategory="6540", headcountTranche="00"))
    codes = {result["code"], *result["otherCodes"]}
    assert VerifyCode.NON_OPERATING_VEHICLE in codes
    assert VerifyCode.NO_EMPLOYEES in codes
    assert VerifyCode.PERSON_LIKE_NAME in codes


# ── Détection du nom de personne ─────────────────────────────────────────────


@pytest.mark.parametrize(
    "name,expected",
    [
        ("BONILLA CHRISTOPHE", True),
        ("PAULOV JULIETTE", True),
        ("JEAN PIERRE MARTIN", True),
        ("MARTIN DUPONT CONSEIL", False),  # « conseil » = forme commerciale
        ("ACME", False),  # un seul mot
        ("3D LAB", False),  # un chiffre
        ("SOCIETE GENERALE", False),  # « societe »
        ("GROUPE HELIOS", False),  # « groupe »
        ("ACME SOLUTIONS FRANCE INTERNATIONAL", False),  # trop de mots
    ],
)
def test_person_like_name_detection(name: str, expected: bool):
    result = qualify_candidate(company(name=name, legalCategory="5710", headcountTranche="12"))
    flagged = result["code"] == VerifyCode.PERSON_LIKE_NAME or VerifyCode.PERSON_LIKE_NAME in result["otherCodes"]
    assert flagged is expected


# ── Propriétés de l'ensemble ─────────────────────────────────────────────────


def test_qualify_all_never_drops_a_row():
    # Le module ne supprime RIEN : supprimer en silence est précisément le
    # reproche fait à l'état actuel, dans l'autre sens.
    rows = [company(), company(siren="987654321", legalCategory="1000"), company(siren="111222333", ceased=True)]
    assert len(qualify_all(rows)) == 3


def test_every_verdict_carries_a_readable_reason():
    for row in (company(), company(legalCategory="1000"), company(headcountTranche="00")):
        result = qualify_candidate(row)
        assert result["reason"]
        assert result["verdict"] in {"recommended", "to_verify", "excluded"}


def test_no_network_and_no_model_is_used():
    # La garantie qui rend ce module utilisable dans une boucle serrée : il est
    # pur. Un import de client HTTP ici serait une régression de coût ET de
    # latence sur chaque ligne de chaque recherche.
    import inspect

    from app.services import account_qualification

    source = inspect.getsource(account_qualification)
    for forbidden in ("httpx", "requests", "call_claude", "await "):
        assert forbidden not in source


# ── #2490 — la pertinence : secteur demandé, mot-clé, grande structure ──────


def test_a_row_outside_the_requested_naf_codes_is_excluded():
    # #2490.2 — la liste de codes que l'écran envoie est un fait dur.
    filters = {"nafCode": "64.19Z,64.92Z"}
    assert qualify_candidate(company(nafCode="64.19Z"), filters=filters)["verdict"] == "recommended"
    result = qualify_candidate(company(nafCode="56.29A"), filters=filters)
    assert result["verdict"] == "excluded"
    assert result["code"] == ExclusionCode.OUT_OF_SECTOR


def test_a_naf_code_is_compared_whatever_its_formatting():
    assert qualify_candidate(company(nafCode="6419Z"), filters={"nafCode": "64.19Z"})["verdict"] == "recommended"


def test_an_unreadable_naf_code_proves_nothing_about_the_sector():
    # Même règle que la zone : une donnée absente n'est pas une preuve.
    for naf in (None, "", "ZZ.99Z"):
        assert qualify_candidate(company(nafCode=naf), filters={"nafCode": "64.19Z"})["verdict"] == "recommended"


def test_screen_sectors_exclude_on_their_naf_section():
    filters = {"sectors": ["it", "finance"]}
    assert qualify_candidate(company(nafCode="62.02A"), filters=filters)["verdict"] == "recommended"
    assert qualify_candidate(company(nafCode="86.10Z"), filters=filters)["code"] == ExclusionCode.OUT_OF_SECTOR
    # « all » n'est pas une contrainte : il ne retire rien.
    assert qualify_candidate(company(nafCode="86.10Z"), filters={"sectors": ["all"]})["verdict"] == "recommended"


def test_without_a_requested_sector_nothing_is_excluded_on_activity():
    assert qualify_candidate(company(nafCode="86.10Z"), filters={"department": "75"})["verdict"] == "recommended"


def test_a_keyword_found_only_outside_name_and_activity_is_a_doubt():
    # #2490.8 — mesuré : « aéronautique Toulouse » rendait un géant de la
    # restauration collective, atteint par le nom d'un de ses sites.
    caterer = company(name="SODEXO ENTREPRISES", sector=None, city="GUYANCOURT", headcountTranche="52")
    result = qualify_candidate(caterer, filters={"freetext": "aéronautique Toulouse"})
    assert result["verdict"] == "to_verify"
    assert result["code"] == VerifyCode.KEYWORD_ELSEWHERE


def test_a_keyword_in_the_name_is_an_answer_whatever_the_accents():
    row = company(name="ATHOS AERONAUTIQUE", city="ENTZHEIM", headcountTranche="41")
    assert qualify_candidate(row, filters={"freetext": "aéronautique Toulouse"})["verdict"] == "recommended"


def test_the_city_of_the_head_office_is_a_place_not_an_activity():
    city_hall = company(name="COMMUNE DE TOULOUSE", city="TOULOUSE", legalCategory="7210", headcountTranche="53")
    codes = qualify_candidate(city_hall, filters={"freetext": "aéronautique Toulouse"})
    assert VerifyCode.KEYWORD_ELSEWHERE in {codes["code"], *codes["otherCodes"]}
    # …mais une recherche qui n'est QUE ce lieu a trouvé ce qu'elle cherchait.
    local = company(name="ACME SOLUTIONS", city="TOULOUSE")
    assert qualify_candidate(local, filters={"freetext": "Toulouse"})["verdict"] == "recommended"


def test_a_freetext_without_usable_words_raises_no_doubt():
    for freetext in ("", "552 120 222", "IT"):
        assert qualify_candidate(company(), filters={"freetext": freetext})["verdict"] == "recommended"


def test_a_person_like_name_is_no_doubt_for_a_structure_of_fifty_or_more():
    # #2490.10 — « AIRBUS OPERATIONS », 10 000 salariés et plus.
    assert qualify_candidate(company(name="AIRBUS OPERATIONS", headcountTranche="53"))["verdict"] == "recommended"
    assert qualify_candidate(company(name="SAFRAN POWER UNITS", headcountTranche="21"))["verdict"] == "recommended"
    # Sous le seuil CONNU, l'indice garde sa place.
    result = qualify_candidate(company(name="PAULOV JULIETTE", headcountTranche="12"))
    assert VerifyCode.PERSON_LIKE_NAME in {result["code"], *result["otherCodes"]}
    # #4626 — effectif non publié : l'absence de tranche ne vaut plus déclenchement.
    result = qualify_candidate(company(name="PAULOV JULIETTE", headcountTranche="NN"))
    assert VerifyCode.PERSON_LIKE_NAME not in {result["code"], *result["otherCodes"]}


# ── #2616.2 — is_public_employer : distinguer les employeurs publics d'un
# signal de recrutement. MÊME préfixe que la qualification de compte
# (`_PUBLIC_PREFIXES`, catégorie juridique INSEE 7xxx) — une seule table de
# vérité (GA-26), pas une seconde règle qui pourrait diverger.


def test_a_commune_is_a_public_employer():
    assert is_public_employer("7210") is True  # Commune


def test_any_7xxx_code_is_a_public_employer():
    # Le premier chiffre porte la règle (même logique que `_PUBLIC_PREFIXES`
    # ci-dessus) : n'importe quel code 7xxx classe « public », pas seulement
    # celui déjà vérifié pour une commune.
    assert is_public_employer("7361") is True


def test_a_sas_is_not_a_public_employer():
    assert is_public_employer("5710") is False


def test_an_association_is_not_a_public_employer():
    # #2616.2 — une association (9xxx) suit un cycle DIFFÉRENT du privé
    # commercial (`PUBLIC_OR_ASSOCIATION` les range ensemble côté qualification),
    # mais ce n'est PAS un organisme public au sens de ce signal : les
    # confondre dirait « employeur public » sur une association loi 1901.
    assert is_public_employer("9220") is False


def test_unknown_legal_category_is_never_guessed():
    assert is_public_employer(None) is None
    assert is_public_employer("") is None


# ── #2284.17 — is_end_client_legal_category : type "client final" du Company
# Graph. MÊMES préfixes que is_public_employer, mais l'association (9xxx)
# COMPTE ici, à la différence de la question plus étroite ci-dessus.


def test_a_commune_is_an_end_client():
    assert is_end_client_legal_category("7210") is True


def test_an_association_is_an_end_client():
    assert is_end_client_legal_category("9220") is True


def test_a_sas_is_not_an_end_client():
    assert is_end_client_legal_category("5710") is False


def test_unknown_legal_category_is_never_guessed_as_end_client():
    assert is_end_client_legal_category(None) is None
    assert is_end_client_legal_category("") is None


# ── #4435.2 — un compte venu d'un palier de SECTEUR n'est pas « hors secteur » ─


def test_a_sector_widened_company_is_not_excluded_for_its_neighbour_sector():
    # Recette 22/10 : « Secteurs voisins : 66 résultats » puis « 67 masquées (exclues par le conseil) ».
    # Aéronautique demandée (30.30Z), un compte de la défense (30.11Z/25.40Z…) y remonte PAR le palier 1.
    filters = {"nafCode": "30.30Z", "departments": ["81"]}
    row = company(nafCode="25.40Z", department="81")
    assert qualify_candidate(row, filters=filters)["code"] == ExclusionCode.OUT_OF_SECTOR  # sans étiquette : exclu
    widened = {**row, "widenedBy": {"axis": "sector", "tier": 1, "code": "defense"}}
    assert qualify_candidate(widened, filters=filters)["verdict"] != "excluded"


def test_a_sector_widened_company_is_still_excluded_out_of_zone():
    filters = {"nafCode": "30.30Z", "departments": ["81"]}
    widened = company(nafCode="25.40Z", department="75", widenedBy={"axis": "sector", "tier": 1, "code": "defense"})
    assert qualify_candidate(widened, filters=filters)["code"] == ExclusionCode.OUT_OF_ZONE
