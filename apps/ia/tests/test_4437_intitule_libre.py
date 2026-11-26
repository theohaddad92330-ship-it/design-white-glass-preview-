"""#4437.5 (recette prod 23/10) — un intitulé LIBRE (« React JS-Python », « Fullstack ») porte sa compétence et sa famille.

Cause : ``_hiring_signal`` (discover.py) posait ``technologies`` mais ni ``jobFamily`` ni le rattachement
``attached`` rangé avec l'offre (free_text_facts) — l'intitulé libre sortait sans famille, la carte n'avait rien à montrer."""

from app.routers.discover import _hiring_signal
from app.services.free_text_facts import read_offer_title


def test_free_title_react_python_gives_both_skills_and_development_family() -> None:
    technologies, family = read_offer_title("React JS-Python", None, [], None)
    assert "React" in technologies and "Python" in technologies
    assert family == "developpement"


def test_attached_reading_completes_title_without_marker() -> None:
    attached = {"factType": "hiring", "skill": "Magento", "family": "developpement", "extract": "Magento"}
    technologies, family = read_offer_title("Expert Magento", None, [], attached)
    assert technologies == ["Magento"]
    assert family == "developpement"


def test_silence_stays_silence() -> None:
    assert read_offer_title("Rejoignez l'aventure", None, [], None) == ([], None)


def test_infra_skill_alone_does_not_invent_development_family() -> None:
    _, family = read_offer_title("Spécialiste Terraform", None, [], None)
    assert family == "infrastructure_cloud"


def test_hiring_signal_carries_family_and_skills_of_a_free_title() -> None:
    signal = _hiring_signal({"date": "2026-10-20", "title": "React JS-Python", "contractType": "CDI"})
    assert signal is not None
    assert {"React", "Python"} <= set(signal["technologies"])
    assert signal["jobFamily"] == "developpement"
