"""#5000.2 — la preuve d'un compte porte le contrat DÉCLARÉ de chaque offre (jamais déduit du titre)."""

from app.services.discover_skill_offers import _evidence


def _offer(day: int, **extra: object) -> dict:
    return {
        "title": f"Architecte Java {day}",
        "city": "Saint-Denis",
        "date": f"2026-10-{day:02d}",
        "skill": "java",
        "url": f"https://offres.example.org/{day}",
        "source": "france_travail",
        **extra,
    }


def test_la_plus_recente_et_le_detail_portent_le_contrat_declare() -> None:
    evidence = _evidence([_offer(3, contractType="CDD"), _offer(29, contractType="CDI")])
    assert evidence["latestOffer"]["contractType"] == "CDI"
    assert [o.get("contractType") for o in evidence["offers"]] == ["CDI", "CDD"]


def test_sans_contrat_declare_le_champ_est_absent_meme_si_le_titre_dit_cdi() -> None:
    evidence = _evidence([_offer(12, title="Architecte Java CDI")])
    assert evidence["latestOffer"]["contractType"] is None
    assert "contractType" not in evidence["offers"][0]
