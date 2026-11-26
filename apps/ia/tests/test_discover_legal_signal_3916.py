"""#3916 (recette prod 11/10) — Découvrir montrait « Vie juridique · Modifications
diverses » sans lien ni type précis. Le signal BODACC porte le type PRÉCIS quand
l'annonce le donne, et le LIEN de l'annonce (jamais deviné)."""

from __future__ import annotations

from app.routers.discover import _legal_signal


def test_legal_signal_names_the_precise_type_and_links_the_notice() -> None:
    out = _legal_signal(
        {
            "date": "2026-09-04",
            "type": "Modifications diverses",
            "precision": "modification survenue sur le capital (diminution)",
            "tribunal": "Greffe du Tribunal des Activités Economiques de Paris",
            "url": "https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:B202601691118",
        }
    )
    assert out is not None
    assert out["label"] == "Modifications diverses — modification survenue sur le capital (diminution)"
    assert out["url"] == "https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:B202601691118"
    assert out["detail"] == "Greffe du Tribunal des Activités Economiques de Paris"


def test_legal_signal_without_precision_or_link_adds_nothing_invented() -> None:
    out = _legal_signal({"date": "2026-09-04", "type": "Procédure collective"})
    assert out == {"type": "legal", "label": "Procédure collective", "date": "2026-09-04", "detail": None}
