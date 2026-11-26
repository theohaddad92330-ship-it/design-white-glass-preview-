"""#4072.1 — l'organigramme lit les organigrammes PRÉSENTS dans les documents de l'espace.

`extract_org_people` est l'extraction BORNÉE : pure, elle ne lit que ce que le
document ÉCRIT. Chaque garantie est prouvée dans les deux sens :

  * seul un document qui se dit organigramme (titre ou première ligne) est lu ;
  * un N+1 n'existe que s'il est ÉCRIT (« rattaché à », « N+1 », colonne
    Manager) — jamais déduit d'une indentation, d'un ordre ou d'un titre ;
  * une ligne qui n'est pas une personne (pas de nom) ne fait AUCUNE ligne ;
  * la date est celle du document quand il la dit, sinon celle de l'import,
    et le dit (`date_basis`) ;
  * un doublon dans le même document est écarté, le premier gagne ;
  * la sortie est bornée (200 personnes), annoncée quand elle tronque.
"""

from __future__ import annotations

from app.services.document_org_people import ORG_PEOPLE_MAX, extract_org_people

DOC = {"id": "d1", "title": "Organigramme DSI Sanofi", "content": "", "created_at": "2026-09-02T10:00:00+00:00"}


def _read(content: str, **over):
    return extract_org_people([{**DOC, "content": content, **over}])


def test_une_ligne_nom_fonction_rattache_a_donne_une_personne_et_son_n_plus_un_ecrit():
    out = _read(
        "Organigramme DSI au 12/03/2023\n"
        "Marie Durand — Directrice des SI\n"
        "Jean Petit — Responsable data (rattaché à Marie Durand)"
    )
    names = {p["fullName"]: p for p in out["people"]}
    assert names["Marie Durand"]["title"] == "Directrice des SI"
    assert "managerName" not in names["Marie Durand"]
    assert names["Jean Petit"]["managerName"] == "Marie Durand"
    assert names["Jean Petit"]["documentDate"] == "2023-03-12"
    assert out["people"][0]["date_basis"] == "document"
    assert out["people"][0]["source"] == "Organigramme DSI Sanofi"


def test_un_tableau_avec_colonnes_reconnues_est_lu_colonne_par_colonne():
    out = _read(
        "Nom | Fonction | Direction | Manager\n"
        "Marie Durand | DSI | Systèmes d'information |\n"
        "Jean Petit | Data | Systèmes d'information | Marie Durand"
    )
    jean = next(p for p in out["people"] if p["fullName"] == "Jean Petit")
    assert (jean["title"], jean["entityName"], jean["managerName"]) == (
        "Data",
        "Systèmes d'information",
        "Marie Durand",
    )


def test_NON_aucun_n_plus_un_n_est_deduit_de_l_indentation_ou_de_l_ordre():
    out = _read(
        "Marie Durand — Directrice des SI\n    Jean Petit — Responsable data\n        Lea Martin — Data engineer"
    )
    assert [p["fullName"] for p in out["people"]] == ["Marie Durand", "Jean Petit", "Lea Martin"]
    assert all("managerName" not in p for p in out["people"])


def test_NON_un_document_qui_ne_se_dit_pas_organigramme_n_est_pas_lu():
    doc = {**DOC, "title": "Compte rendu comité", "content": "Marie Durand — Directrice des SI"}
    out = extract_org_people([doc])
    assert out["people"] == []
    assert out["documents_read"] == 0


def test_NON_une_ligne_sans_nom_de_personne_ne_fait_aucune_ligne():
    out = _read("Direction des systèmes d'information\n2023 — budget 4 M€\nMarie Durand — Directrice des SI\nto be confirmed")
    assert [p["fullName"] for p in out["people"]] == ["Marie Durand"]


def test_sans_date_dans_le_document_la_date_est_celle_de_l_import_et_le_dit():
    out = _read("Marie Durand — Directrice des SI")
    assert out["people"][0]["documentDate"] == "2026-09-02"
    assert out["people"][0]["date_basis"] == "import"


def test_un_doublon_dans_le_meme_document_est_ecarte_le_premier_gagne():
    out = _read("Marie Durand — Directrice des SI\nmarie durand — Autre titre")
    assert len(out["people"]) == 1
    assert out["people"][0]["title"] == "Directrice des SI"


def _word(n: int) -> str:
    letters = "abcdefghijklmnopqrstuvwxyz"
    return letters[n // 676 % 26] + letters[n // 26 % 26] + letters[n % 26]


def test_la_sortie_est_bornee_et_annonce_la_troncature():
    lines = "\n".join(f"Prenom{_word(i)} Nom{_word(i)} — Poste" for i in range(ORG_PEOPLE_MAX + 20))
    out = _read(lines)
    assert len(out["people"]) == ORG_PEOPLE_MAX
    assert out["truncated"] is True
