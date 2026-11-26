"""#4327 — Fortuneo (filiale majeure d'Arkéa) absente du dossier.

`_merge_pappers` REMPLAÇAIT la liste des filiales par celle du graphe du registre :
toute filiale nommée par le web (nom commercial « Fortuneo » ≠ raison sociale,
filiale indirecte hors du graphe) disparaissait dès que le registre répondait.
"""

from app.routers.phase1_research import _merge_pappers
from app.services.entities import merge_web_subsidiaries
from app.services.pappers.models import CompanyProfile, RelatedCompany


def test_web_named_subsidiary_missing_from_registry_is_kept() -> None:
    registry = [{"id": "e2", "siren": "111111111", "name": "ARKEA BANQUE ENTREPRISES ET INSTITUTIONNELS"}]
    merged = merge_web_subsidiaries(registry, ["Fortuneo", "Arkéa Banque Entreprises et Institutionnels"])
    names = [s["name"] for s in merged]
    assert "Fortuneo" in names
    # déjà au registre sous sa raison sociale (accents/casse) : pas de doublon
    assert len([n for n in names if "ARKEA" in n.upper() or "ARKÉA" in n.upper()]) == 1


def test_commercial_name_contained_in_legal_name_is_not_duplicated() -> None:
    registry = [{"id": "e3", "siren": "384288890", "name": "FORTUNEO BANQUE"}]
    merged = merge_web_subsidiaries(registry, ["Fortuneo"])
    assert [s["name"] for s in merged] == ["FORTUNEO BANQUE"]


def test_web_only_entry_is_marked_as_web_sourced_never_given_a_siren() -> None:
    merged = merge_web_subsidiaries([], [{"name": "Fortuneo"}])
    assert merged == [{"name": "Fortuneo", "siren": None, "source": "web"}]


def test_merge_pappers_keeps_web_subsidiaries() -> None:
    profile = CompanyProfile(siren="775577018", subsidiaries=[RelatedCompany(id="e2", siren="111111111", name="SURAVENIR")])
    out = _merge_pappers({"subsidiaries": [{"name": "Fortuneo"}, "Suravenir"]}, profile)
    names = [s["name"] for s in out["subsidiaries"]]
    assert names == ["SURAVENIR", "Fortuneo"]


def test_web_entry_keeps_the_page_that_names_it_and_never_invents_one() -> None:
    """#4327.2 — le lien déduit dit D'OÙ il vient quand l'analyse le sait ; sinon aucune source inventée."""
    merged = merge_web_subsidiaries(
        [], [{"name": "Fortuneo", "source_url": "https://www.lesechos.fr/fortuneo"}, {"name": "Suravenir Assurances"}]
    )
    by_name = {s["name"]: s for s in merged}
    assert by_name["Fortuneo"]["source_url"] == "https://www.lesechos.fr/fortuneo"
    assert "source_url" not in by_name["Suravenir Assurances"]
