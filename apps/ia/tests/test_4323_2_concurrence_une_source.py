"""#4323.2 (recette prod 23/10) — « Ce que je sais » disait « Aucun concurrent titulaire » (axe Concurrence) ET
« 3 concurrents identifiés » (Positionnement) sur le même compte. Une seule source par compte : les concurrents
IDENTIFIÉS de l'analyse. Quand il y en a, un axe qui affirme l'absence de concurrent est réécrit d'après eux ;
sans concurrent identifié, l'axe garde sa phrase (rien n'est inventé)."""

from __future__ import annotations

from app.services.dossier_read import reconcile_competition_axis


def _block(impact: str | None, lever: str | None = None) -> dict:
    return {"axes": [{"key": "concurrence", "state": "measured", "value": 4, "impact": impact, "lever": lever}]}


def test_un_axe_qui_nie_les_concurrents_est_realigne_sur_les_concurrents_identifies() -> None:
    block = _block("Aucun concurrent titulaire identifié sur ce compte", "Terrain ouvert")

    reconcile_competition_axis(block, ["Capgemini", "Sopra Steria", "Atos"])

    axis = block["axes"][0]
    assert axis["impact"] == "3 concurrents identifiés : Capgemini, Sopra Steria, Atos"
    assert axis["lever"] is None, "« terrain ouvert » contredisait les concurrents identifiés"
    assert axis["value"] == 4, "la note reste celle du modèle : seul le libellé est réaligné"


def test_un_seul_concurrent_s_ecrit_au_singulier() -> None:
    block = _block("Aucun concurrent en place")
    reconcile_competition_axis(block, ["Capgemini"])
    assert block["axes"][0]["impact"] == "1 concurrent identifié : Capgemini"


def test_sans_concurrent_identifie_la_phrase_du_modele_reste() -> None:
    block = _block("Aucun concurrent titulaire identifié")
    reconcile_competition_axis(block, [])
    assert block["axes"][0]["impact"] == "Aucun concurrent titulaire identifié"


def test_un_axe_qui_cite_deja_des_concurrents_n_est_pas_touche() -> None:
    block = _block("Capgemini en place sur l'infogérance")
    reconcile_competition_axis(block, ["Capgemini", "Atos"])
    assert block["axes"][0]["impact"] == "Capgemini en place sur l'infogérance"


def test_les_noms_vides_et_les_doublons_ne_comptent_pas() -> None:
    block = _block("Aucun concurrent")
    reconcile_competition_axis(block, ["Atos", " atos ", "", None])  # type: ignore[list-item]
    assert block["axes"][0]["impact"] == "1 concurrent identifié : Atos"
