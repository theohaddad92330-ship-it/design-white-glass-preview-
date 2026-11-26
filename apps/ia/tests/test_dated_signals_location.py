"""#4816 — le lieu de l'offre voyage sur le signal de recrutement rédigé par l'analyse.

Règle de Louis (30/10/2026, choix A) : un lieu seulement s'il vient d'une offre collectée que le signal cite
(jointure par l'URL), jamais tiré de la prose ; vide = jamais deviné.
"""

from app.services.dated_signals import stamp_offer_locations

JOBS = [
    {"title": "Développeur Java", "location": "Lille (59)", "url": "https://emploi.example/1"},
    {"title": "Chef de projet", "location": "", "url": "https://emploi.example/2"},
    {"title": "Dev via cabinet", "location": "Nancy", "url": "https://emploi.example/3", "intermediated": True},
]


def _sig(**kw):
    return {"signal": "Viveris recherche des profils Java", "type": "recrutement", **kw}


def test_synthese_citant_une_offre_recoit_son_lieu():
    out = stamp_offer_locations([_sig(url="https://emploi.example/1")], JOBS)
    assert out[0]["location"] == "Lille (59)"


def test_prose_sans_offre_citee_reste_sans_lieu():
    out = stamp_offer_locations([_sig(signal="Viveris recrute à Lille")], JOBS)
    assert "location" not in out[0]


def test_offre_sans_lieu_ou_intermediee_ne_pose_rien():
    out = stamp_offer_locations(
        [_sig(url="https://emploi.example/2"), _sig(url="https://emploi.example/3")], JOBS
    )
    assert all("location" not in s for s in out)


def test_lieu_existant_et_autres_types_intacts():
    kept = _sig(url="https://emploi.example/1", location="Paris")
    other = {"signal": "x", "type": "budget", "url": "https://emploi.example/1"}
    out = stamp_offer_locations([kept, other], JOBS)
    assert out[0]["location"] == "Paris"
    assert "location" not in out[1]


def test_entrees_invalides_tolerees():
    assert stamp_offer_locations(None, JOBS) == []
    assert stamp_offer_locations([_sig(url="https://emploi.example/1")], None)[0].get("location") is None
