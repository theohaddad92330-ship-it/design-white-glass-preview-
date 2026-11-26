"""#4437.5 — /mes-cibles : 0/22 intitulés d'offres libres rattachés à un type / une compétence / une famille.
Chaque offre lue porte son rattachement, dérivé de l'extrait LU ; non rattachable = « non classé », jamais inventé."""

from app.services.free_text_facts import stamp_offer_attachments

URL = "https://example.org/offre/1"


def _signal(**over):
    sig = {"signal": "Développeur React confirmé H/F", "source_kind": "job", "url": URL}
    sig.update(over)
    return sig


def test_a_read_title_carries_its_skill_family_and_extract():
    out = stamp_offer_attachments([_signal()], [])
    attachment = out[0]["offer_attachment"]
    assert attachment["status"] == "attached"
    assert "React" in attachment["skills"]
    assert attachment["job_family"] == "developpement"
    assert attachment["fact_type"] == "hiring"
    assert attachment["extract"] == "Développeur React confirmé H/F"


def test_the_model_attachment_of_the_joined_offer_is_used_when_the_catalogue_is_mute():
    job = {
        "title": "Ninja du pixel",
        "url": URL,
        "attached": {"factType": "hiring", "skill": "Figma", "family": "produit_design", "extract": "pixel"},
    }
    out = stamp_offer_attachments([_signal(signal="Ninja du pixel")], [job])
    attachment = out[0]["offer_attachment"]
    assert attachment["status"] == "attached"
    assert "Figma" in attachment["skills"]


def test_a_title_naming_nothing_is_unclassified_never_invented():
    out = stamp_offer_attachments([_signal(signal="Recrute un collaborateur H/F")], [])
    attachment = out[0]["offer_attachment"]
    assert attachment["status"] == "unclassified"
    assert attachment["skills"] == [] and attachment["job_family"] is None
    assert attachment["extract"] == "Recrute un collaborateur H/F"


def test_only_offers_are_attached():
    press = _signal(source_kind="press", signal="Levée de fonds React")
    assert "offer_attachment" not in stamp_offer_attachments([press], [])[0]
    assert stamp_offer_attachments(None, None) == []


def _attachment(title):
    return stamp_offer_attachments([_signal(signal=title)], [])[0]["offer_attachment"]


def test_free_titles_with_abbreviations_attach_to_their_type_skill_and_family():
    """#4437.5 — « Ingénieur Cloud AWS F/H », « Dév fullstack JS », « Resp. SI » se rattachent."""
    cloud = _attachment("Ingénieur Cloud AWS F/H")
    assert cloud["skills"] == ["AWS"] and cloud["job_family"] == "infrastructure_cloud"
    fullstack = _attachment("Dév fullstack JS")
    assert "JavaScript" in fullstack["skills"] and fullstack["job_family"] == "developpement"
    si = _attachment("Resp. SI")
    assert si["status"] == "attached" and si["job_family"] == "direction_management"
    assert si["fact_type"] == "hiring"


def test_an_unknown_title_gets_no_attachment_at_all():
    """SAIT DIRE NON — « Chargé de mission transverse » : ni famille, ni compétence, ni type posé."""
    attachment = _attachment("Chargé de mission transverse")
    assert attachment["status"] == "unclassified"
    assert attachment["skills"] == [] and attachment["job_family"] is None
    assert attachment["fact_type"] is None


def test_an_abbreviation_alone_never_invents_a_family():
    for title in ("Resp. transverse", "Ing."):
        assert _attachment(title)["job_family"] is None
