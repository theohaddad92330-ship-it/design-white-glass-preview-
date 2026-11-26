"""La fiche de combat cite enfin la bibliothèque d'objections curée.

Le défaut : `bellum_battlecard` produisait son champ `probable_objection` SANS
passer par `objection_block()` — c'était le DERNIER prompt de rédaction à
inventer les siennes, alors que `bellum_messages` la cite déjà (voir
`test_objection_block.py`, le modèle de ce fichier). Preuve avant correctif :
``grep "from app.knowledge" apps/ia/app/prompts/bellum_battlecard.py`` rendait
zéro.

Le test qui compte relit le TEXTE assemblé du prompt et y cherche une objection
DE LA BIBLIOTHÈQUE — pas seulement la présence d'un appel de fonction, qui
passerait même si le bloc était vide ou mal branché.
"""

from __future__ import annotations

from app.knowledge import objection_block, objection_library
from app.prompts import bellum_battlecard

PROFILE = {"esn_name": "TestESN", "core_offers": ["Data & IA"]}


def test_le_system_prompt_battlecard_porte_une_objection_de_la_bibliotheque():
    system = bellum_battlecard.build_system_prompt(PROFILE)
    first = next(o for o in objection_library() if o.get("side") == "client")
    assert first["objection"] in system
    assert first["real_meaning"] in system
    assert first["mirror_question"] in system


def test_le_bloc_est_exactement_celui_que_bellum_messages_cite_deja():
    # Pas de bloc réécrit à la main dans le prompt : la fiche de combat appelle
    # EXACTEMENT `objection_block()`, comme `bellum_messages` — une seule
    # fonction, jamais une seconde liste qui diverge de la première.
    system = bellum_battlecard.build_system_prompt(PROFILE)
    assert objection_block() in system


def test_le_bloc_reste_borne_a_six_objections_pas_le_catalogue_de_33():
    system = bellum_battlecard.build_system_prompt(PROFILE)
    library_client = [o for o in objection_library() if o.get("side") == "client"]
    assert len(library_client) > 6  # sinon le test suivant ne prouverait rien
    present = [o for o in library_client if o["objection"] in system]
    assert len(present) == 6


def test_le_cote_recrutement_najamais_dans_une_fiche_de_combat_compte():
    # Les objections « consultant » relèvent de la prospection inversée (on
    # recrute) : une fiche de combat pour un RDV compte ne doit jamais en
    # porter une.
    system = bellum_battlecard.build_system_prompt(PROFILE)
    consultant = [o for o in objection_library() if o.get("side") == "consultant"]
    assert all(entry["objection"] not in system for entry in consultant)
