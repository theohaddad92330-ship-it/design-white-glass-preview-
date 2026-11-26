"""LUDOVIC-D LC.6 — Laura sur le moteur de Découvrir : le cas Stelya (recette prod 19/10)."""

from app.services.laura_call_ranking import (
    FIND_WHO_TO_CALL,
    PEOPLE_TO_FIND,
    attach_call_facts,
    demand_refines_profile,
    keep_profile_target,
    order_for_call,
    profile_for_demand,
)

STELYA = {
    "sectors": ["Industrie", "Énergie", "Aéronautique", "Défense", "Automobile", "BTP"],
    "placedRoles": ["mécanique", "automatisme", "qualité", "méthodes", "génie civil"],
    "offerDomain": "industrial",
}

ROWS = [
    {"siren": "1", "name": "Côte Boulange", "nafCode": "10.71C", "nafLabel": "Boulangerie et boulangerie-pâtisserie"},
    {
        "siren": "2",
        "name": "Lindt",
        "nafCode": "10.82Z",
        "nafLabel": "Fabrication de cacao, chocolat et de produits de confiserie",
    },
    {
        "siren": "3",
        "name": "Paul",
        "nafCode": "10.71A",
        "nafLabel": "Fabrication industrielle de pain et de pâtisserie fraîche",
    },
    {
        "siren": "4",
        "name": "Framatome",
        "nafCode": "25.30Z",
        "nafLabel": "Industrie de la construction de générateurs de vapeur",
    },
    {"siren": "5", "name": "KSB", "nafCode": "28.13Z", "nafLabel": "Fabrication de pompes, industrie mécanique"},
    {"siren": "6", "name": "Inconnue", "nafCode": "", "nafLabel": ""},
]


def test_un_secteur_dans_la_cible_l_affine_et_l_agroalimentaire_hors_profil_sort():
    assert demand_refines_profile(["industry"], STELYA) is True
    kept, excluded = keep_profile_target(ROWS, STELYA)
    assert [r["name"] for r in kept] == ["Framatome", "KSB", "Inconnue"]
    assert len(excluded) == 3


def test_sait_dire_non_secteur_hors_profil_explicite_ou_profil_sans_cible():
    assert demand_refines_profile(["finance"], STELYA) is False
    assert demand_refines_profile(["industry"], {}) is False
    kept, _ = keep_profile_target(ROWS, {**STELYA, "sectors": [*STELYA["sectors"], "Agroalimentaire"]})
    assert "Lindt" in [r["name"] for r in kept]


def test_les_metiers_de_la_demande_affinent_ceux_du_profil():
    refined = profile_for_demand(STELYA, ["méthodes", "qualité"])
    assert len(refined["placedRoles"]) == 2
    assert "génie civil" not in refined["placedRoles"]
    assert profile_for_demand(STELYA, []) == STELYA  # SAIT DIRE NON : sans métier dit, le profil tel quel


def test_les_industriels_avec_offre_methodes_datee_sortent_devant_et_citent_signal_et_personnes():
    items = [
        {"name": "Paul", "siren": "3", "signals": []},
        {
            "name": "KSB",
            "siren": "5",
            "account_id": "acc-ksb",
            "signals": [{"type": "hiring", "label": "Ingénieur méthodes H/F — Lyon", "date": "2026-10-14"}],
        },
        {
            "name": "Framatome",
            "siren": "4",
            "signals": [
                {"type": "tender", "label": "Marché maintenance", "date": "2026-09-30"},
                {"type": "hiring", "label": "Technicien qualité fournisseurs", "date": "2026-10-10"},
            ],
        },
        {
            "name": "Dalkia",
            "siren": "7",
            "signals": [{"type": "tender", "label": "Appel d'offres chaufferie", "date": "2026-10-01"}],
        },
    ]
    ordered = order_for_call(items, ["méthodes", "qualité"])
    assert [i["name"] for i in ordered] == ["KSB", "Framatome", "Dalkia", "Paul"]
    attach_call_facts(
        ordered, ["méthodes", "qualité"], {"acc-ksb": [{"name": "Anne Martin", "title": "Responsable méthodes"}]}
    )
    ksb, framatome, _, paul = ordered
    assert ksb["call_signal"] == {"label": "Ingénieur méthodes H/F — Lyon", "date": "2026-10-14"}
    assert ksb["people_to_call"][0]["name"] == "Anne Martin"
    assert framatome["call_signal"]["label"] == "Technicien qualité fournisseurs"
    assert framatome["people_note"] == PEOPLE_TO_FIND
    assert framatome["find_who_to_call"]["label"] == FIND_WHO_TO_CALL
    assert "call_signal" not in paul  # SAIT DIRE NON : aucun signal daté, aucun inventé
