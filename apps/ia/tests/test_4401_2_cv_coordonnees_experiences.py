"""#4401.2 — l'import d'un CV simple lit AU-DELÀ de l'identité : la ville et les expériences.

Mesure sur une fixture de CV texte, le modèle ne rendant RIEN (le cas de la recette 21/10) : avant ce point,
``/cv/parse`` lisait nom, e-mail, téléphone, LinkedIn (64b153b8df) mais NI la ville NI les expériences. Les deux
se lisent maintenant dans le texte — la ville à sa forme codée (« 75011 Paris », « Paris (75) »), les expériences
sous leur rubrique, au format fermé « rôle | entreprise | début | fin | » — et une donnée absente reste absente.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.services import cv_experiences, cv_identity

client = TestClient(app)

CV = """Marie DUPONT
Ingénieure cybersécurité
marie.dupont@example.com | 06 12 34 56 78
75011 Paris
linkedin.com/in/marie-dupont

EXPÉRIENCES PROFESSIONNELLES
03/2021 – Présent  Architecte sécurité chez Orange
2018 – 2021  Consultante SOC – Thales
2016-2018 | Analyste | Capgemini

FORMATION
2013 – 2016 Master Sécurité des systèmes — Université Lyon 1

COMPÉTENCES
Python, SIEM
"""


def _parse(cv_text: str, model_fields: list[dict] | None = None) -> dict[str, dict]:
    with patch("app.routers.cv.call_claude", AsyncMock(return_value=({"fields": model_fields or []}, None))):
        response = client.post("/cv/parse", json={"cv_text": cv_text})
    assert response.status_code == 200, response.text
    return {field["detection"]: field for field in response.json()["data"]["fields"]}


# ── la ville ────────────────────────────────────────────────────────────────────────────────────────


def test_la_ville_a_code_postal_est_lue_dans_l_en_tete() -> None:
    assert cv_identity.read_city(CV) == "75011 Paris"


def test_la_ville_a_departement_est_lue() -> None:
    assert cv_identity.read_city("Marie DUPONT\nLyon (69)\n") == "Lyon (69)"


def test_une_ville_nue_n_est_pas_lue() -> None:
    assert cv_identity.read_city("Marie DUPONT\nParis\n") is None


def test_un_code_postal_du_corps_du_cv_n_est_pas_une_ville_d_en_tete() -> None:
    body = "\n".join(["ligne"] * 40) + "\nClient : 69003 Lyon\n"
    assert cv_identity.read_city(body) is None


def test_parse_ajoute_la_ville_a_l_identite() -> None:
    identity = _parse(CV)["identity"]
    assert "75011 Paris" in str(identity["value"])
    assert identity["excerpt_offset"] is not None and identity["excerpt_offset"] >= 0


# ── les expériences ─────────────────────────────────────────────────────────────────────────────────


def test_les_experiences_se_lisent_sous_leur_rubrique_au_format_ferme() -> None:
    assert cv_experiences.read_experience_lines(CV) == [
        ("Architecte sécurité | Orange | 2021-03 | en cours | ", "03/2021 – Présent  Architecte sécurité chez Orange"),
        ("Consultante SOC | Thales | 2018 | 2021 | ", "2018 – 2021  Consultante SOC – Thales"),
        ("Analyste | Capgemini | 2016 | 2018 | ", "2016-2018 | Analyste | Capgemini"),
    ]


def test_la_formation_n_est_pas_une_experience() -> None:
    lines = [line for line, _src in cv_experiences.read_experience_lines(CV)]
    assert not any("Master" in line or "Lyon" in line for line in lines)


def test_sans_rubrique_experience_rien_n_est_lu() -> None:
    assert cv_experiences.read_experience_lines("Marie DUPONT\n2018 – 2021  Consultante SOC – Thales\n") == []


def test_une_ligne_a_un_seul_morceau_n_est_pas_devinee() -> None:
    text = "EXPÉRIENCES\n2018 – 2021  Consultante\n"
    assert cv_experiences.read_experience_lines(text) == []


def test_la_date_seule_sur_sa_ligne_prend_le_libelle_suivant() -> None:
    text = "EXPÉRIENCES\n2019 – 2021\nDéveloppeur chez Sopra Steria\n"
    assert [line for line, _ in cv_experiences.read_experience_lines(text)] == [
        "Développeur | Sopra Steria | 2019 | 2021 | "
    ]


def test_parse_ajoute_les_experiences_quand_le_modele_n_en_rend_pas() -> None:
    experiences = _parse(CV)["experiences"]
    assert experiences["value"] is not None and len(experiences["value"]) == 3
    assert experiences["value"][0] == "Architecte sécurité | Orange | 2021-03 | en cours | "
    assert experiences["excerpt_offset"] is not None and experiences["excerpt_offset"] >= 0
    assert experiences["source_excerpt"] in CV


def test_les_experiences_du_modele_gardent_la_priorite() -> None:
    model = [
        {
            "detection": "experiences",
            "value": ["Pilote | Airbus | 2010 | 2012 | "],
            "confidence": 0.9,
            "source_excerpt": "03/2021 – Présent  Architecte sécurité chez Orange",
        }
    ]
    experiences = _parse(CV, model)["experiences"]
    assert experiences["value"] == ["Pilote | Airbus | 2010 | 2012 | "]


def test_un_cv_sans_ville_ni_experience_les_laisse_absentes() -> None:
    fields = _parse("Marie DUPONT\nmarie.dupont@example.com\n")
    assert fields["experiences"]["value"] is None
    assert "Paris" not in str(fields["identity"]["value"])


def test_le_telephone_ne_deborde_pas_sur_la_ligne_suivante() -> None:
    facts = cv_identity.read_contact_facts("06 12 34 56 78\n75011 Paris\n")
    assert facts["phone"] == "06 12 34 56 78"


# #4401.2 (recette 23/10) — la mise en page la plus courante d'un CV simple : le poste et l'entreprise sur une
# ligne, la période SEULE sur la ligne d'en dessous. Le lecteur ne savait lire que la période en tête ou sur la ligne.
CV_PERIODE_SOUS_LE_POSTE = """Remy Bourdaa
Développeur Python
Tél. : 06.12.34.56.78 — remy.bourdaa@gmail.com
69003 Lyon

EXPERIENCES PROFESSIONNELLES
Développeur backend – Doctolib
03/2021 – Présent
Développeur junior chez Alten
2018 – 2021

FORMATION
Master informatique 2016-2018
"""


def test_la_periode_seule_sous_le_poste_se_lit() -> None:
    lines = [line for line, _source in cv_experiences.read_experience_lines(CV_PERIODE_SOUS_LE_POSTE)]
    assert lines == [
        "Développeur backend | Doctolib | 2021-03 | en cours | ",
        "Développeur junior | Alten | 2018 | 2021 | ",
    ]


def test_la_formation_n_est_pas_une_mission_meme_avec_la_periode_sous_la_ligne() -> None:
    lines = [line for line, _source in cv_experiences.read_experience_lines(CV_PERIODE_SOUS_LE_POSTE)]
    assert not any("Master" in line for line in lines)


def test_le_cv_simple_donne_coordonnees_ville_et_experiences_sans_modele() -> None:
    fields = _parse(CV_PERIODE_SOUS_LE_POSTE)
    identity = str(fields["identity"]["value"])
    for piece in ("remy.bourdaa@gmail.com", "06.12.34.56.78", "69003 Lyon", "Remy Bourdaa"):
        assert piece in identity
    assert len(fields["experiences"]["value"]) == 2
