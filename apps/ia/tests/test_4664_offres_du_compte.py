"""#4664 — la preuve d'un compte porte LES offres qui l'ont fait sortir, chacune avec le lien de son annonce."""

from app.services.discover_skill_offers import EVIDENCE_OFFERS_MAX, _evidence


def _offer(day: int, **extra: object) -> dict:
    return {
        "title": f"Dev Java {day}",
        "city": "Lille",
        "date": f"2026-10-{day:02d}",
        "skill": "java",
        "url": f"https://offres.example.org/{day}",
        "source": "france_travail",
        **extra,
    }


def test_chaque_offre_du_detail_porte_le_lien_de_son_annonce() -> None:
    evidence = _evidence([_offer(3), _offer(12), _offer(7)])
    assert [o["date"] for o in evidence["offers"]] == ["2026-10-12", "2026-10-07", "2026-10-03"]
    assert [o["url"] for o in evidence["offers"]] == [f"https://offres.example.org/{d}" for d in (12, 7, 3)]


def test_la_source_ne_voyage_pas_dans_le_detail() -> None:
    for entry in _evidence([_offer(3), _offer(12)])["offers"]:
        assert "source" not in entry


def test_le_detail_est_plafonne_mais_le_total_reste_vrai() -> None:
    evidence = _evidence([_offer(d) for d in range(1, 16)])
    assert len(evidence["offers"]) == EVIDENCE_OFFERS_MAX == 10
    assert evidence["offerCount"] == 15


def test_une_offre_sans_lien_ne_porte_pas_de_cle_vide() -> None:
    entry = _evidence([_offer(3, url=None)])["offers"][0]
    assert "url" not in entry
