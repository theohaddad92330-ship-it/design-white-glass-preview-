"""Les objections curées atteignent enfin un prompt de rédaction.

Le défaut : `objection_library()` porte 33 objections travaillées (l'objection,
sa VRAIE signification, la réponse, la question miroir), et elle n'atteignait
qu'un seul prompt — celui du copilote, par les chunks de méthode. Les prompts qui
ÉCRIVENT, eux, redemandaient au modèle de produire les siennes :
`bellum_strategy` liste cinq exemples entre parenthèses — cinq objections qui
sont DANS la bibliothèque, recopiées à la main dans le prompt.

Une bibliothèque qui n'atteint aucun prompt de rédaction est une bibliothèque que
personne ne lit. Le message est le premier endroit où elle sert : anticiper
l'objection est ce qui distingue un M2 d'une relance.
"""

from __future__ import annotations

import pytest

from app.knowledge import objection_block, objection_library
from app.prompts import bellum_messages

PROFILE = {"esn_name": "TestESN", "core_offers": ["Data & IA"]}


def test_la_bibliotheque_nest_pas_vide_et_porte_ses_quatre_champs():
    # Preuve que la garde LIT quelque chose : sans ce test, tout ce qui suit
    # passerait aussi sur une bibliothèque vide.
    library = objection_library()
    assert len(library) >= 20
    client_side = [o for o in library if o.get("side") == "client"]
    assert len(client_side) >= 10
    for entry in client_side[:3]:
        assert entry["objection"] and entry["real_meaning"] and entry["mirror_question"]


def test_le_bloc_porte_les_objections_du_cote_CLIENT_pas_celles_du_recrutement():
    block = objection_block(limit=4)
    client = [o for o in objection_library() if o.get("side") == "client"]
    consultant = [o for o in objection_library() if o.get("side") == "consultant"]
    assert client[0]["objection"] in block
    # Les objections « consultant » relèvent de la prospection inversée (on
    # recrute), pas d'un message vers un compte : les mélanger ferait écrire un
    # message de recrutement à un DSI.
    assert all(entry["objection"] not in block for entry in consultant)


def test_le_bloc_donne_la_VRAIE_signification_et_la_question_miroir():
    block = objection_block(limit=2)
    first = next(o for o in objection_library() if o.get("side") == "client")
    assert first["real_meaning"] in block
    assert first["mirror_question"] in block


def test_le_bloc_est_BORNE_un_prompt_qui_porte_vingt_objections_est_un_catalogue():
    assert objection_block(limit=3).count("\n- ") == 3
    assert objection_block(limit=0) == ""


def test_le_bloc_est_DETERMINISTE_deux_appels_donnent_le_meme_texte():
    assert objection_block(limit=5) == objection_block(limit=5)


def test_le_prompt_messages_porte_les_objections_curees():
    system = bellum_messages.build_system_prompt(PROFILE)
    first = next(o for o in objection_library() if o.get("side") == "client")
    assert first["objection"] in system
    assert first["mirror_question"] in system


@pytest.mark.parametrize("field", ["objection", "real_meaning", "mirror_question"])
def test_chaque_champ_injecte_vient_bien_de_la_bibliotheque(field):
    # Casse volontairement l'hypothèse : si le bloc écrivait son propre texte, la
    # chaîne de la bibliothèque n'y serait pas.
    block = objection_block(limit=6)
    entries = [o for o in objection_library() if o.get("side") == "client"][:6]
    assert all(entry[field] in block for entry in entries)
