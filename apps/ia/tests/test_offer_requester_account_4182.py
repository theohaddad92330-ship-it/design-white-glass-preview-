"""#4182.5 — le demandeur d'une offre aussi sur le compte (Mes cibles), pas seulement Découvrir.

R25 prod : « cartes /discover et /mes-cibles : titre d'offre seul ». Le dossier du compte portait
le titre de l'offre ; le demandeur (étayé ou « à identifier ») n'était calculé que dans Découvrir.
"""

from app.services.offer_requester import stamp_offer_requesters

URL = "https://example.org/offre/1"


def _job(**over):
    row = {
        "title": "Développeur Java",
        "description": "Rattaché au Directeur de la Production, au sein de l'équipe Plateforme.",
        "url": URL,
        "city": "Lyon",
    }
    row.update(over)
    return row


def _signal(**over):
    sig = {"signal": "Recrute un développeur Java", "source_kind": "job", "url": URL}
    sig.update(over)
    return sig


def test_a_job_signal_gets_the_requester_read_from_the_offer_text():
    out = stamp_offer_requesters([_signal()], [_job()])
    requester = out[0]["requester"]
    assert requester["status"] == "etaye"
    assert requester["possibleManager"]["function"]
    assert requester["scope"] == {"city": "Lyon"}
    assert requester["openFreelanceMission"] is False


def test_a_mute_offer_stays_a_role_to_identify_with_its_method():
    out = stamp_offer_requesters([_signal()], [_job(description="Nous recherchons un développeur Java.")])
    requester = out[0]["requester"]
    assert requester["status"] == "a_identifier"
    assert requester["method"]


def test_it_never_guesses_by_text_only_the_offer_url_joins():
    # Même titre, autre URL (ou aucune) : AUCUN demandeur — jamais un rapprochement par texte.
    assert "requester" not in stamp_offer_requesters([_signal(url="https://example.org/autre")], [_job()])[0]
    assert "requester" not in stamp_offer_requesters([_signal(url=None)], [_job()])[0]


def test_only_job_signals_get_a_requester():
    press = _signal(source_kind="press")
    assert "requester" not in stamp_offer_requesters([press], [_job()])[0]
