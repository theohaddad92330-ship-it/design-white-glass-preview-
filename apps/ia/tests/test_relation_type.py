"""#3866 (décision Louis 11/10) — quatre types de relation, déduits de la forme juridique ET
de l'activité, jamais du NAF seul ; « non déterminé » nommé quand on ne sait pas."""

from app.services.relation_type import RelationType, relation_type_of


def test_naf_non_esn_donne_client_final() -> None:
    assert relation_type_of(naf="47.11F", name="Hyper Distribution SA").type is RelationType.END_CLIENT


def test_naf_esn_donne_esn_concurrente() -> None:
    assert relation_type_of(naf="62.02A", name="Alpha Conseil SAS").type is RelationType.COMPETING_ESN


def test_cabinet_de_recrutement_ou_portage_donne_intermediaire() -> None:
    assert relation_type_of(naf="78.10Z", name="Beta RH").type is RelationType.INTERMEDIARY
    assert relation_type_of(naf="78.30Z", name="Gamma Portage Salarial").type is RelationType.INTERMEDIARY


def test_partenaire_declare_prime_sur_le_naf() -> None:
    assert relation_type_of(naf="62.02A", name="Alpha", is_declared_partner=True).type is RelationType.PARTNER


def test_entite_informatique_interne_d_un_groupe_n_est_pas_rejetee_sur_son_seul_naf() -> None:
    """NAF ESN + GIE (forme juridique 6540) : possible DSI mutualisée d'un groupe → non déterminé,
    jamais « ESN concurrente » sur le code d'activité seul."""
    res = relation_type_of(naf="62.01Z", name="Groupe Delta Systèmes d'Information", legal_category="6540")
    assert res.type is RelationType.UNDETERMINED
    assert res.reason == "possible_internal_it"


def test_naf_ambigu_ou_absent_est_non_determine_jamais_devine() -> None:
    assert relation_type_of(naf="70.22Z", name="Epsilon").type is RelationType.UNDETERMINED
    res = relation_type_of(naf=None, name="Zeta")
    assert res.type is RelationType.UNDETERMINED
    assert res.reason == "no_activity_code"


def test_label_est_en_francais_et_sans_code_brut() -> None:
    assert relation_type_of(naf="47.11F", name="X").label == "client final"
    assert relation_type_of(naf=None, name="Z").label == "type non déterminé"
